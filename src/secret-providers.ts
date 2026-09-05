export interface SecretProvider {
	resolve(key: string, signal: AbortSignal): Promise<string>;
}

export interface SecretBinding {
	readonly provider: string;
	readonly key: string;
	readonly origins: readonly string[];
}

export interface SecretBrokerOptions {
	readonly providers: Readonly<Record<string, SecretProvider>>;
	readonly bindings: Readonly<Record<string, SecretBinding>>;
}

export const secretProviderLimits = Object.freeze({
	maxSecretBytes: 4096,
	maxNameLength: 64,
	maxKeyLength: 1024,
	maxBindings: 1024,
	maxOrigins: 64,
});

const namePattern = /^[A-Za-z_][A-Za-z0-9_-]{0,63}(?![\s\S])/;

function literalOrigin(origin: string): boolean {
	if (typeof origin !== "string" || origin.length > 2048) return false;
	try {
		const url = new URL(origin);
		return (
			url.protocol === "https:" &&
			url.origin === origin &&
			!origin.includes("*") &&
			!url.username &&
			!url.password
		);
	} catch {
		return false;
	}
}

function failure() {
	return new Error("Secret operation failed");
}

export class SecretBroker {
	readonly #providers: Readonly<Record<string, SecretProvider>>;
	readonly #bindings: Readonly<Record<string, SecretBinding>>;

	constructor(options: SecretBrokerOptions) {
		try {
			const providers: Record<string, SecretProvider> = Object.create(null);
			const bindings: Record<string, SecretBinding> = Object.create(null);
			const providerEntries = Object.entries(options.providers);
			const bindingEntries = Object.entries(options.bindings);
			if (
				providerEntries.length > secretProviderLimits.maxBindings ||
				bindingEntries.length > secretProviderLimits.maxBindings
			)
				throw failure();
			for (const [name, provider] of providerEntries) {
				if (!namePattern.test(name) || typeof provider.resolve !== "function")
					throw failure();
				providers[name] = Object.freeze({
					resolve: provider.resolve.bind(provider),
				});
			}
			for (const [name, binding] of bindingEntries) {
				if (
					!namePattern.test(name) ||
					typeof binding.provider !== "string" ||
					!Object.hasOwn(providers, binding.provider) ||
					typeof binding.key !== "string" ||
					!binding.key.length ||
					binding.key.length > secretProviderLimits.maxKeyLength ||
					/\p{Cc}/u.test(binding.key) ||
					!Array.isArray(binding.origins) ||
					!binding.origins.length ||
					binding.origins.length > secretProviderLimits.maxOrigins
				)
					throw failure();
				const origins = [...binding.origins];
				if (!origins.every(literalOrigin)) throw failure();
				bindings[name] = Object.freeze({
					provider: binding.provider,
					key: binding.key,
					origins: Object.freeze(origins),
				});
			}
			this.#providers = Object.freeze(providers);
			this.#bindings = Object.freeze(bindings);
			Object.freeze(this);
		} catch {
			throw new Error("Invalid secret configuration");
		}
	}

	allows(reference: string, origin: string): boolean {
		if (
			typeof reference !== "string" ||
			reference.length > 7 + secretProviderLimits.maxNameLength ||
			!reference.startsWith("secret:") ||
			!namePattern.test(reference.slice(7)) ||
			!literalOrigin(origin)
		)
			return false;
		return (
			this.#bindings[reference.slice(7)]?.origins.includes(origin) ?? false
		);
	}

	async use(
		reference: string,
		origin: string,
		signal: AbortSignal,
		consume: (secret: string) => void | Promise<void>,
	): Promise<void> {
		let bytes: Uint8Array | undefined;
		let onAbort: (() => void) | undefined;
		try {
			if (!this.allows(reference, origin) || signal.aborted) throw failure();
			const binding = this.#bindings[reference.slice(7)];
			const cancelled = new Promise<never>((_resolve, reject) => {
				onAbort = () => reject(failure());
				signal.addEventListener("abort", onAbort, { once: true });
			});
			const secret = await Promise.race([
				Promise.resolve().then(() => {
					if (signal.aborted) throw failure();
					return this.#providers[binding.provider].resolve(binding.key, signal);
				}),
				cancelled,
			]);
			if (
				signal.aborted ||
				typeof secret !== "string" ||
				!secret.length ||
				secret.length > secretProviderLimits.maxSecretBytes ||
				secret.includes("\0")
			)
				throw failure();
			bytes = new TextEncoder().encode(secret);
			if (bytes.byteLength > secretProviderLimits.maxSecretBytes)
				throw failure();
			if (signal.aborted) throw failure();
			await consume(secret);
			if (signal.aborted) throw failure();
		} catch {
			throw failure();
		} finally {
			bytes?.fill(0);
			if (onAbort) signal.removeEventListener("abort", onAbort);
		}
	}
}
