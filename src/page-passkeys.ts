import type { DocumentTree } from "./document.js";
import {
	type PasskeyAssertionCredential,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyCreationCredential,
	type PasskeyCreationOptions,
	type PasskeyRequestOptions,
} from "./passkeys.js";
import type { PinnedPublicSuffixSnapshot } from "./pinned-public-suffix.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

export interface PagePasskeyContext {
	topLevel: boolean;
	isCurrent: () => boolean;
	supportedSignals?: ReadonlySet<AbortSignal>;
	publicSuffixSnapshot?: PinnedPublicSuffixSnapshot;
}

const messages = {
	TypeError: "Invalid passkey options",
	NotSupportedError: "Passkey requirement is not supported",
	InvalidStateError: "Passkey broker is unavailable",
	AbortError: "Passkey ceremony was aborted",
};

class PagePasskeyError extends Error {
	constructor(name: keyof typeof messages) {
		super(messages[name]);
		this.name = name;
	}
}

function outerOptions(value: unknown) {
	try {
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new PagePasskeyError("TypeError");
		const result: Record<string, unknown> = Object.create(null);
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") throw new PagePasskeyError("TypeError");
			if (!["publicKey", "signal", "mediation"].includes(key))
				throw new PagePasskeyError("NotSupportedError");
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !Object.hasOwn(descriptor, "value"))
				throw new PagePasskeyError("TypeError");
			result[key] = descriptor.value;
		}
		if (result.publicKey === undefined) throw new PagePasskeyError("TypeError");
		if (
			result.mediation !== undefined &&
			result.mediation !== "optional" &&
			result.mediation !== "required"
		)
			throw new PagePasskeyError("NotSupportedError");
		return result;
	} catch (error) {
		throw error instanceof PagePasskeyError
			? error
			: new PagePasskeyError("TypeError");
	}
}

function relaySignal(value: unknown, supported: WeakSet<AbortSignal>) {
	const controller = new AbortController();
	let release = () => {};
	if (value !== undefined) {
		try {
			if (!supported.has(value as AbortSignal)) throw new Error();
			const aborted = Object.getOwnPropertyDescriptor(
				AbortSignal.prototype,
				"aborted",
			)?.get?.call(value);
			if (typeof aborted !== "boolean") throw new Error();
			const abort = () => controller.abort();
			EventTarget.prototype.addEventListener.call(value, "abort", abort, {
				once: true,
			});
			release = () =>
				EventTarget.prototype.removeEventListener.call(value, "abort", abort);
			if (aborted) abort();
		} catch {
			throw new PagePasskeyError("TypeError");
		}
	}
	return { signal: controller.signal, release };
}

export class PagePasskeys {
	readonly credentials: object;
	private readonly broker: PasskeyBroker;
	private readonly url: string;
	private readonly origin: string;
	private readonly topLevel: boolean;
	private readonly documentCurrent: () => boolean;
	private readonly capabilities = new WeakSet<object>();
	private readonly supportedSignals: WeakSet<AbortSignal>;
	private starting = false;
	private closed = false;
	private unregisterClose: () => unknown = () => {};

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		authenticator: PasskeyAuthenticator,
		context: PagePasskeyContext,
	) {
		if (
			typeof factory?.createHostObject !== "function" ||
			typeof context?.topLevel !== "boolean" ||
			typeof context?.isCurrent !== "function"
		)
			throw new PagePasskeyError("TypeError");
		this.url = tree.url;
		this.origin = new URL(this.url).origin;
		this.topLevel = context.topLevel;
		this.documentCurrent = context.isCurrent;
		this.supportedSignals = new WeakSet(context.supportedSignals ?? []);
		const snapshot = Object.getOwnPropertyDescriptor(
			context,
			"publicSuffixSnapshot",
		);
		if (snapshot && !Object.hasOwn(snapshot, "value"))
			throw new PagePasskeyError("TypeError");
		this.broker = new PasskeyBroker(authenticator, {
			publicSuffixSnapshot: snapshot?.value,
		});
		try {
			this.unregisterClose = tree.onClose(() => this.close());
			this.credentials = this.capability({
				methods: {
					create: (options) => this.run("create", options),
					get: (options) => this.run("get", options),
				},
			});
		} catch (error) {
			this.close();
			throw error;
		}
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.broker.close();
		this.unregisterClose();
	}

	private isCurrent(): boolean {
		if (this.closed) return false;
		try {
			if (this.tree.url === this.url && this.documentCurrent() === true)
				return true;
		} catch {}
		this.close();
		return false;
	}

	private ensureCurrent(): void {
		if (this.closed) throw new PagePasskeyError("InvalidStateError");
		if (!this.isCurrent()) throw new PagePasskeyError("AbortError");
	}

	private run(method: "create" | "get", value: unknown): Promise<object> {
		if (this.starting)
			return Promise.reject(new PagePasskeyError("InvalidStateError"));
		this.starting = true;
		let release = () => {};
		try {
			this.ensureCurrent();
			const options = outerOptions(value);
			const relay = relaySignal(options.signal, this.supportedSignals);
			release = relay.release;
			const context = {
				origin: this.origin,
				topLevel: this.topLevel,
				isCurrent: () => this.isCurrent(),
				signal: relay.signal,
			};
			const pending =
				method === "create"
					? this.broker.create(
							options.publicKey as PasskeyCreationOptions,
							context,
						)
					: this.broker.get(
							options.publicKey as PasskeyRequestOptions,
							context,
						);
			return pending
				.then((credential) => this.credential(credential))
				.finally(release);
		} catch (error) {
			release();
			return Promise.reject(error);
		} finally {
			this.starting = false;
		}
	}

	private capability(definition: ScriptHostObjectDefinition): object {
		this.ensureCurrent();
		let capability: object;
		try {
			capability = this.factory.createHostObject(definition);
		} catch {
			this.ensureCurrent();
			throw new PagePasskeyError("NotSupportedError");
		}
		this.ensureCurrent();
		if (
			!capability ||
			typeof capability !== "object" ||
			this.capabilities.has(capability)
		)
			throw new PagePasskeyError("NotSupportedError");
		this.capabilities.add(capability);
		return capability;
	}

	private credential(
		credential: PasskeyCreationCredential | PasskeyAssertionCredential,
	): object {
		const read = (value: unknown) => () => {
			this.ensureCurrent();
			return value instanceof ArrayBuffer ? value.slice(0) : value;
		};
		const response = this.capability({
			properties: Object.fromEntries(
				Object.entries(credential.response).map(([name, value]) => [
					name,
					{ get: read(value) },
				]),
			),
		});
		return this.capability({
			properties: {
				id: { get: read(credential.id) },
				rawId: { get: read(credential.rawId) },
				type: { get: read(credential.type) },
				response: { get: read(response) },
			},
			methods: {
				getClientExtensionResults: () => this.capability({}),
			},
		});
	}
}
