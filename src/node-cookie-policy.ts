import type { BigIntStats } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CookieJarOptions } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import { createPinnedPublicSuffixSnapshot } from "./pinned-public-suffix.js";

export type CookiePolicySelector = "pinned-psl-v1";

interface VerifiedCookiePolicy {
	readonly cookiePolicy: CookiePolicySelector;
	readonly cookiePolicySource: string;
	readonly options: Readonly<CookieJarOptions>;
}

const sourceByteLength = 335592;

function configurationValue(options: unknown, key: string): unknown {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			`Invalid ${key} configuration`,
		);
	const descriptor = Object.getOwnPropertyDescriptor(options, key);
	if (
		descriptor
			? !Object.hasOwn(descriptor, "value") || !descriptor.enumerable
			: key in options
	)
		throw new AgentBrowserError(
			"invalid-input",
			`Invalid ${key} configuration`,
		);
	return descriptor?.value;
}

export function cookiePolicySelection(
	options: unknown,
	key: "cookiePolicy" | "AGENT_BROWSER_COOKIE_POLICY" = "cookiePolicy",
): CookiePolicySelector | undefined {
	const value = configurationValue(options, key);
	if (value !== undefined && value !== "pinned-psl-v1")
		throw new AgentBrowserError(
			"invalid-input",
			`${key} must be pinned-psl-v1 when provided`,
		);
	return value;
}

async function verify(source: Uint8Array): Promise<VerifiedCookiePolicy> {
	try {
		const publicSuffixSnapshot = await createPinnedPublicSuffixSnapshot(source);
		return Object.freeze({
			cookiePolicy: "pinned-psl-v1",
			cookiePolicySource: new TextDecoder("utf-8", { fatal: true }).decode(
				source,
			),
			options: Object.freeze({ publicSuffixSnapshot }),
		});
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Pinned cookie policy verification failed",
		);
	}
}

function pinnedAsset(info: BigIntStats): boolean {
	return (
		info.isFile() &&
		!info.isSymbolicLink() &&
		info.size === BigInt(sourceByteLength)
	);
}

function unchangedAsset(before: BigIntStats, after: BigIntStats): boolean {
	return (
		pinnedAsset(after) &&
		before.dev === after.dev &&
		before.ino === after.ino &&
		before.mtimeNs === after.mtimeNs &&
		before.ctimeNs === after.ctimeNs
	);
}

export async function loadNodeCookiePolicy(
	selection: CookiePolicySelector | undefined,
): Promise<VerifiedCookiePolicy | undefined> {
	if (cookiePolicySelection({ cookiePolicy: selection }) === undefined)
		return undefined;
	let source: Uint8Array;
	try {
		const { constants } = await import("node:fs");
		const { lstat, open, realpath } = await import("node:fs/promises");
		if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) throw new Error();
		const asset = new URL(
			import.meta.url.endsWith(".ts")
				? "../vendor/public-suffix/public_suffix_list.dat"
				: "../../vendor/public-suffix/public_suffix_list.dat",
			import.meta.url,
		);
		const original = await lstat(asset, { bigint: true });
		if (
			!pinnedAsset(original) ||
			(await realpath(asset)) !== fileURLToPath(asset)
		)
			throw new Error();
		const handle = await open(
			asset,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const before = await handle.stat({ bigint: true });
			if (!unchangedAsset(original, before)) throw new Error();
			const bytes = new Uint8Array(sourceByteLength + 1);
			let offset = 0;
			while (offset < bytes.length) {
				const { bytesRead } = await handle.read(
					bytes,
					offset,
					bytes.length - offset,
					offset,
				);
				if (
					!Number.isSafeInteger(bytesRead) ||
					bytesRead < 0 ||
					bytesRead > bytes.length - offset
				)
					throw new Error();
				if (bytesRead === 0) break;
				offset += bytesRead;
			}
			if (offset !== sourceByteLength) throw new Error();
			const after = await handle.stat({ bigint: true });
			const current = await lstat(asset, { bigint: true });
			if (
				!unchangedAsset(before, after) ||
				!unchangedAsset(after, current) ||
				(await realpath(asset)) !== fileURLToPath(asset)
			)
				throw new Error();
			source = bytes.subarray(0, sourceByteLength);
		} finally {
			await handle.close();
		}
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Pinned cookie policy asset unavailable",
		);
	}
	return verify(source);
}

export async function cookiePolicyFromInitialize(
	message: unknown,
): Promise<VerifiedCookiePolicy | undefined> {
	const selection = cookiePolicySelection(message);
	const source = configurationValue(message, "cookiePolicySource");
	if (selection === undefined) {
		if (source !== undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Unexpected cookie policy source",
			);
		return undefined;
	}
	if (typeof source !== "string" || source.length > sourceByteLength)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid cookie policy source",
		);
	const bytes = new TextEncoder().encode(source);
	if (bytes.byteLength !== sourceByteLength)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid cookie policy source",
		);
	return verify(bytes);
}
