import {
	type PublicSuffixResult,
	createPublicSuffixMatcher,
} from "./public-suffix.js";

export interface PinnedPublicSuffixSnapshot {
	readonly revision: "b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8";
	readonly sha256: "87a80788b0151117c77fa520421c4bed9b7e7c91c6df6ac363bbf2b64fd21291";
	readonly ruleCount: 10321;
	readonly match: (domain: string) => PublicSuffixResult;
}

const revision = "b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8";
const digest =
	"87a80788b0151117c77fa520421c4bed9b7e7c91c6df6ac363bbf2b64fd21291";
const sourceByteLength = 335592;
const ruleCount = 10321;
const snapshots = new WeakSet<object>();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const tagGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	Symbol.toStringTag,
)?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const offsetGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
const bufferLengthGetter = Object.getOwnPropertyDescriptor(
	ArrayBuffer.prototype,
	"byteLength",
)?.get;

function copySource(value: Uint8Array): Uint8Array<ArrayBuffer> {
	try {
		if (
			!ArrayBuffer.isView(value) ||
			tagGetter?.call(value) !== "Uint8Array" ||
			lengthGetter?.call(value) !== sourceByteLength
		)
			throw new TypeError();
		const buffer = bufferGetter?.call(value);
		bufferLengthGetter?.call(buffer);
		return new Uint8Array(
			new Uint8Array(buffer, offsetGetter?.call(value), sourceByteLength),
		);
	} catch {
		throw new TypeError("Expected pinned PSL Uint8Array bytes");
	}
}

export function isPinnedPublicSuffixSnapshot(
	value: unknown,
): value is PinnedPublicSuffixSnapshot {
	return typeof value === "object" && value !== null && snapshots.has(value);
}

export async function createPinnedPublicSuffixSnapshot(
	source: Uint8Array,
): Promise<PinnedPublicSuffixSnapshot> {
	const copied = copySource(source);
	let actualDigest: string;
	try {
		const hashed = new Uint8Array(
			await crypto.subtle.digest("SHA-256", copied),
		);
		if (hashed.byteLength !== 32) throw new TypeError();
		actualDigest = Array.from(hashed, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
	} catch {
		throw new Error("Pinned PSL hashing failed");
	}
	if (actualDigest !== digest) throw new Error("Pinned PSL digest mismatch");
	try {
		const text = new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true,
		}).decode(copied);
		const matcher = createPublicSuffixMatcher(text);
		if (matcher.ruleCount !== ruleCount) throw new TypeError();
		const snapshot: PinnedPublicSuffixSnapshot = Object.freeze({
			revision,
			sha256: digest,
			ruleCount,
			match: matcher.match,
		});
		snapshots.add(snapshot);
		return snapshot;
	} catch {
		throw new Error("Pinned PSL admission failed");
	}
}
