import { constants } from "node:fs";
import { type FileHandle, lstat, open } from "node:fs/promises";
import { AgentBrowserError } from "./errors.js";
import {
	assertPrivateFile,
	privateFileLocation,
	samePrivateFile,
} from "./node-private-files.js";
import {
	EnvFileSecretProvider,
	PassSecretProvider,
} from "./node-secret-providers.js";
import {
	type SecretBinding,
	SecretBroker,
	type SecretProvider,
	secretProviderLimits,
} from "./secret-providers.js";

export const nodeSecretConfigLimits = Object.freeze({
	maxFileBytes: 65_536,
	maxDepth: 8,
	maxProviders: secretProviderLimits.maxBindings,
	maxBindings: secretProviderLimits.maxBindings,
});

export interface LoadSecretConfigOptions {
	readonly processRuntime?: boolean;
}

function failure() {
	return new AgentBrowserError("invalid-input", "Invalid secret configuration");
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw failure();
	return value as Record<string, unknown>;
}

function fields(
	value: unknown,
	required: readonly string[],
	optional: readonly string[] = [],
) {
	const object = record(value);
	if (
		required.some((key) => !Object.hasOwn(object, key)) ||
		Object.keys(object).some(
			(key) => !required.includes(key) && !optional.includes(key),
		)
	)
		throw failure();
	return object;
}

function parse(text: string): unknown {
	const stack: (Set<string> | null)[] = [];
	let previous = "";
	for (const match of text.matchAll(
		/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:"]+/g,
	)) {
		const token = match[0];
		if (token === "{" || token === "[") {
			stack.push(token === "{" ? new Set() : null);
			if (stack.length > nodeSecretConfigLimits.maxDepth) throw failure();
		} else if (token === "}" || token === "]") stack.pop();
		else if (token.startsWith('"') && (previous === "{" || previous === ",")) {
			const keys = stack[stack.length - 1];
			if (keys) {
				const key: string = JSON.parse(token);
				if (
					keys.has(key) ||
					["__proto__", "prototype", "constructor"].includes(key)
				)
					throw failure();
				keys.add(key);
			}
		}
		previous = token;
	}
	return JSON.parse(text);
}

function brokerFromText(text: string) {
	const config = fields(parse(text), ["providers", "bindings"]);
	const providerEntries = Object.entries(record(config.providers));
	const bindingEntries = Object.entries(record(config.bindings));
	if (
		providerEntries.length > nodeSecretConfigLimits.maxProviders ||
		bindingEntries.length > nodeSecretConfigLimits.maxBindings
	)
		throw failure();
	const providers: Record<string, SecretProvider> = Object.create(null);
	const bindings: Record<string, SecretBinding> = Object.create(null);
	for (const [name, value] of providerEntries) {
		const provider = record(value);
		if (provider.type === "env") {
			fields(provider, ["type", "path"]);
			if (typeof provider.path !== "string") throw failure();
			providers[name] = new EnvFileSecretProvider({ path: provider.path });
		} else if (provider.type === "pass") {
			fields(provider, ["type"], ["executable", "timeoutMs"]);
			if (
				(Object.hasOwn(provider, "executable") &&
					typeof provider.executable !== "string") ||
				(Object.hasOwn(provider, "timeoutMs") &&
					typeof provider.timeoutMs !== "number")
			)
				throw failure();
			providers[name] = new PassSecretProvider({
				executable: provider.executable as string | undefined,
				timeoutMs: provider.timeoutMs as number | undefined,
			});
		} else throw failure();
	}
	for (const [name, value] of bindingEntries) {
		const binding = fields(value, ["provider", "key", "origins"]);
		bindings[name] = binding as unknown as SecretBinding;
	}
	return new SecretBroker({ providers, bindings });
}

export async function loadSecretConfig(
	filename: string | undefined,
	options: LoadSecretConfigOptions = {},
): Promise<SecretBroker | undefined> {
	if (filename === undefined) return undefined;
	if (options.processRuntime)
		throw new AgentBrowserError(
			"unsupported",
			"Secret configuration is unsupported with the SafeJS process runtime",
		);
	let handle: FileHandle | undefined;
	let bytes: Uint8Array | undefined;
	try {
		const location = await privateFileLocation(
			filename,
			"Secret configuration",
		);
		const original = await lstat(filename, { bigint: true });
		assertPrivateFile(original, location.uid, "Secret configuration");
		handle = await open(
			filename,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		const before = await handle.stat({ bigint: true });
		assertPrivateFile(before, location.uid, "Secret configuration");
		if (
			!samePrivateFile(original, before) ||
			before.size < 0n ||
			before.size > BigInt(nodeSecretConfigLimits.maxFileBytes)
		)
			throw failure();
		bytes = new Uint8Array(Number(before.size) + 1);
		let offset = 0;
		while (offset < bytes.length) {
			const { bytesRead } = await handle.read(
				bytes,
				offset,
				bytes.length - offset,
				offset,
			);
			if (!bytesRead) break;
			offset += bytesRead;
		}
		const after = await handle.stat({ bigint: true });
		const current = await lstat(filename, { bigint: true });
		assertPrivateFile(after, location.uid, "Secret configuration");
		assertPrivateFile(current, location.uid, "Secret configuration");
		if (
			offset !== Number(before.size) ||
			!samePrivateFile(before, after) ||
			!samePrivateFile(before, current) ||
			before.size !== after.size ||
			before.size !== current.size ||
			before.mtimeNs !== after.mtimeNs ||
			before.ctimeNs !== after.ctimeNs ||
			after.mtimeNs !== current.mtimeNs ||
			after.ctimeNs !== current.ctimeNs
		)
			throw failure();
		await location.assertCurrent();
		await handle.close();
		handle = undefined;
		return brokerFromText(
			new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
				bytes.subarray(0, offset),
			),
		);
	} catch {
		throw failure();
	} finally {
		bytes?.fill(0);
		await handle?.close().catch(() => {});
	}
}
