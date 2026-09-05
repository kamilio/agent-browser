import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
	type PinnedPublicSuffixSnapshot,
	createPinnedPublicSuffixSnapshot,
	isPinnedPublicSuffixSnapshot,
} from "./pinned-public-suffix.js";
import * as publicSuffix from "./public-suffix.js";

const fixture = readFileSync(
	new URL("../vendor/public-suffix/public_suffix_list.dat", import.meta.url),
);
const expectedDigest =
	"87a80788b0151117c77fa520421c4bed9b7e7c91c6df6ac363bbf2b64fd21291";
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
let snapshot: PinnedPublicSuffixSnapshot;
let approvedDigest: ArrayBuffer;

beforeAll(async () => {
	approvedDigest = await nativeDigest("SHA-256", fixture);
	snapshot = await createPinnedPublicSuffixSnapshot(fixture);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("admits exactly the approved complete fixture and fixed metadata", () => {
	expect(fixture.byteLength).toBe(335592);
	expect(snapshot.revision).toBe("b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8");
	expect(snapshot.sha256).toBe(expectedDigest);
	expect(snapshot.ruleCount).toBe(10321);
	expect(isPinnedPublicSuffixSnapshot(snapshot)).toBe(true);
	expect(Reflect.ownKeys(snapshot).sort()).toEqual([
		"match",
		"revision",
		"ruleCount",
		"sha256",
	]);
});

it.each([
	["www.example.com", "com", "example.com", "exact"],
	["shop.example.co.uk", "co.uk", "example.co.uk", "exact"],
	["alice.blogspot.com", "blogspot.com", "alice.blogspot.com", "exact"],
	["alice.github.io", "github.io", "alice.github.io", "exact"],
	["alice.pages.dev", "pages.dev", "alice.pages.dev", "exact"],
	["a.b.ck", "b.ck", "a.b.ck", "wildcard"],
	["www.ck", "ck", "www.ck", "exception"],
	["city.kawasaki.jp", "kawasaki.jp", "city.kawasaki.jp", "exception"],
	["a.b.kawasaki.jp", "b.kawasaki.jp", "a.b.kawasaki.jp", "wildcard"],
	[
		"a.unknown-test-suffix",
		"unknown-test-suffix",
		"a.unknown-test-suffix",
		"default",
	],
	["WWW.Example.COM.", "com.", "example.com.", "exact"],
	["食狮.公司.cn", "xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn", "exact"],
] as const)(
	"matches the complete rules for %s",
	(domain, suffix, registrable, type) => {
		expect(snapshot.match(domain)).toMatchObject({
			publicSuffix: suffix,
			registrableDomain: registrable,
			ruleType: type,
		});
	},
);

it.each(["com", "co.uk", "blogspot.com", "github.io", "b.ck"])(
	"does not assign a registrable domain to suffix %s",
	(domain) => {
		expect(snapshot.match(domain).registrableDomain).toBeNull();
	},
);

it.each([
	"",
	"127.0.0.1",
	"0x7f000001",
	"https://example.com",
	"a..com",
	"a/b.com",
])("retains matcher rejection for %s", (domain) => {
	expect(() => snapshot.match(domain)).toThrow();
});

it.each(["mutate", "detach"])(
	"copies before awaiting hashing when caller bytes %s",
	async (action) => {
		const input = new Uint8Array(fixture);
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		let hashedInput: BufferSource | undefined;
		vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
			async (algorithm, bytes) => {
				hashedInput = bytes;
				await pending;
				return nativeDigest(algorithm, bytes);
			},
		);
		const result = createPinnedPublicSuffixSnapshot(input);
		expect(hashedInput).toBeInstanceOf(Uint8Array);
		expect(hashedInput).not.toBe(input);
		expect((hashedInput as Uint8Array).buffer).not.toBe(input.buffer);
		if (action === "mutate") input.fill(0);
		else structuredClone(input.buffer, { transfer: [input.buffer] });
		release();
		expect(isPinnedPublicSuffixSnapshot(await result)).toBe(true);
	},
);

it("does not admit wrong bytes repaired after hashing starts", async () => {
	const input = new Uint8Array(fixture);
	input[0] ^= 1;
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
		async (algorithm, bytes) => {
			await pending;
			return nativeDigest(algorithm, bytes);
		},
	);
	const result = createPinnedPublicSuffixSnapshot(input);
	input.set(fixture);
	release();
	await expect(result).rejects.toThrow("Pinned PSL digest mismatch");
});

it("uses only the selected view of an oversized backing buffer", async () => {
	const backing = new Uint8Array(fixture.length + 64).fill(255);
	backing.set(fixture, 32);
	const result = await createPinnedPublicSuffixSnapshot(
		backing.subarray(32, 32 + fixture.length),
	);
	backing.fill(0);
	expect(result.match("alice.github.io")).toEqual(
		snapshot.match("alice.github.io"),
	);
});

it("does not invoke caller byte accessors, iterator or species", async () => {
	const input = new Uint8Array(fixture);
	const trap = vi.fn(() => {
		throw new Error("Caller hook invoked");
	});
	for (const key of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		"constructor",
		Symbol.iterator,
		Symbol.toStringTag,
	]) {
		Object.defineProperty(input, key, { get: trap });
	}
	expect(
		isPinnedPublicSuffixSnapshot(await createPinnedPublicSuffixSnapshot(input)),
	).toBe(true);
	expect(trap).not.toHaveBeenCalled();
});

it.each([
	undefined,
	null,
	false,
	123,
	"com",
	{},
	[],
	new ArrayBuffer(335592),
	new DataView(new ArrayBuffer(335592)),
	new Uint8ClampedArray(335592),
	new Int8Array(335592),
	new Uint16Array(167796),
	new Float32Array(83898),
	Object.create(Uint8Array.prototype),
	new Proxy(new Uint8Array(335592), {}),
])("rejects non-Uint8Array input %# before hashing", async (input) => {
	const hashing = vi.spyOn(crypto.subtle, "digest");
	await expect(
		createPinnedPublicSuffixSnapshot(input as Uint8Array),
	).rejects.toThrow("Expected pinned PSL Uint8Array bytes");
	expect(hashing).not.toHaveBeenCalled();
});

it.each([0, 1, 335591, 335593, 671184])(
	"rejects byte length %s before hashing",
	async (length) => {
		const hashing = vi.spyOn(crypto.subtle, "digest");
		await expect(
			createPinnedPublicSuffixSnapshot(new Uint8Array(length)),
		).rejects.toThrow("Expected pinned PSL Uint8Array bytes");
		expect(hashing).not.toHaveBeenCalled();
	},
);

it("rejects detached buffers without invoking hashing", async () => {
	const input = new Uint8Array(fixture);
	structuredClone(input.buffer, { transfer: [input.buffer] });
	const hashing = vi.spyOn(crypto.subtle, "digest");
	await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
		"Expected pinned PSL Uint8Array bytes",
	);
	expect(hashing).not.toHaveBeenCalled();
});

it("rejects shared buffers to avoid a concurrently changing source", async () => {
	const input = new Uint8Array(new SharedArrayBuffer(335592));
	input.set(fixture);
	const hashing = vi.spyOn(crypto.subtle, "digest");
	await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
		"Expected pinned PSL Uint8Array bytes",
	);
	expect(hashing).not.toHaveBeenCalled();
});

it("rejects hostile and revoked byte proxies without running traps", async () => {
	const trap = vi.fn(() => {
		throw new Error("Caller trap invoked");
	});
	const hostile = new Proxy(new Uint8Array(fixture), {
		get: trap,
		getPrototypeOf: trap,
	});
	const revoked = Proxy.revocable(new Uint8Array(fixture), {});
	revoked.revoke();
	const hashing = vi.spyOn(crypto.subtle, "digest");
	for (const input of [hostile, revoked.proxy]) {
		await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
			"Expected pinned PSL Uint8Array bytes",
		);
	}
	expect(trap).not.toHaveBeenCalled();
	expect(hashing).not.toHaveBeenCalled();
});

it("accepts genuine Uint8Array subclasses without calling their slice", async () => {
	class Bytes extends Uint8Array {
		override slice(): never {
			throw new Error("Caller slice invoked");
		}
	}
	const result = await createPinnedPublicSuffixSnapshot(new Bytes(fixture));
	expect(isPinnedPublicSuffixSnapshot(result)).toBe(true);
});

it("copies a resizable buffer before a shrink during pending hashing", async () => {
	const buffer = new ArrayBuffer(335592, { maxByteLength: 335592 });
	const input = new Uint8Array(buffer);
	input.set(fixture);
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
		async (algorithm, bytes) => {
			await pending;
			return nativeDigest(algorithm, bytes);
		},
	);
	const result = createPinnedPublicSuffixSnapshot(input);
	buffer.resize(0);
	release();
	expect(isPinnedPublicSuffixSnapshot(await result)).toBe(true);
});

it("does not accept caller-supplied expectations for a custom list", async () => {
	const input = new Uint8Array(335592).fill(32);
	input.set(new TextEncoder().encode("com\n"));
	const customDigest = Array.from(
		new Uint8Array(await nativeDigest("SHA-256", input)),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
	await expect(
		Reflect.apply(createPinnedPublicSuffixSnapshot, undefined, [
			input,
			{ sha256: customDigest, ruleCount: 1 },
		]),
	).rejects.toThrow("Pinned PSL digest mismatch");
});

it.each([0, 167796, 335591])(
	"rejects same-size modification at byte %s before decoding",
	async (index) => {
		const input = new Uint8Array(fixture);
		input[index] ^= 1;
		const decode = vi.spyOn(TextDecoder.prototype, "decode");
		await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
			"Pinned PSL digest mismatch",
		);
		expect(decode).not.toHaveBeenCalled();
	},
);

it("rejects an all-zero source of the approved size", async () => {
	await expect(
		createPinnedPublicSuffixSnapshot(new Uint8Array(335592)),
	).rejects.toThrow("Pinned PSL digest mismatch");
});

it("checks UTF-8 strictly after digest admission under injected hash success", async () => {
	const input = new Uint8Array(fixture);
	input[0] = 255;
	vi.spyOn(crypto.subtle, "digest").mockResolvedValueOnce(
		approvedDigest.slice(0),
	);
	await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
		"Pinned PSL admission failed",
	);
});

it("does not skip full matcher admission under injected hash success", async () => {
	const input = new Uint8Array(335592).fill(32);
	input.set(new TextEncoder().encode("com\ncom\n"));
	vi.spyOn(crypto.subtle, "digest").mockResolvedValueOnce(
		approvedDigest.slice(0),
	);
	await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
		"Pinned PSL admission failed",
	);
});

it("rejects a sparse rule set even under injected hash success", async () => {
	const input = new Uint8Array(335592).fill(32);
	input.set(new TextEncoder().encode("com\n"));
	vi.spyOn(crypto.subtle, "digest").mockResolvedValueOnce(
		approvedDigest.slice(0),
	);
	await expect(createPinnedPublicSuffixSnapshot(input)).rejects.toThrow(
		"Pinned PSL admission failed",
	);
});

it.each(["throw", "reject", "short", "long", "wrong"])(
	"fails closed on crypto result %s",
	async (failure) => {
		const hashing = vi.spyOn(crypto.subtle, "digest");
		if (failure === "throw")
			hashing.mockImplementationOnce(() => {
				throw new Error("private ".repeat(10000));
			});
		else if (failure === "reject")
			hashing.mockRejectedValueOnce({
				get message() {
					throw new Error("should not read");
				},
			});
		else
			hashing.mockResolvedValueOnce(
				new ArrayBuffer(
					failure === "short" ? 31 : failure === "long" ? 33 : 32,
				),
			);
		await expect(createPinnedPublicSuffixSnapshot(fixture)).rejects.toThrow(
			failure === "wrong"
				? "Pinned PSL digest mismatch"
				: "Pinned PSL hashing failed",
		);
	},
);

it("bounds unavailable WebCrypto failure", async () => {
	vi.stubGlobal("crypto", undefined);
	await expect(createPinnedPublicSuffixSnapshot(fixture)).rejects.toThrow(
		"Pinned PSL hashing failed",
	);
});

it("bounds matcher exceptions without returning a branded partial snapshot", async () => {
	vi.spyOn(publicSuffix, "createPublicSuffixMatcher").mockImplementationOnce(
		() => {
			throw new Error("private ".repeat(10000));
		},
	);
	await expect(createPinnedPublicSuffixSnapshot(fixture)).rejects.toThrow(
		"Pinned PSL admission failed",
	);
	expect(isPinnedPublicSuffixSnapshot(snapshot)).toBe(true);
});

it("freezes snapshot, match function and individual results", () => {
	const result = snapshot.match("alice.github.io");
	for (const value of [snapshot, snapshot.match, result])
		expect(Object.isFrozen(value)).toBe(true);
	for (const key of Reflect.ownKeys(snapshot)) {
		expect(Reflect.set(snapshot, key, "replacement")).toBe(false);
		expect(Reflect.deleteProperty(snapshot, key)).toBe(false);
	}
	expect(Reflect.set(result, "publicSuffix", "com")).toBe(false);
	expect(Reflect.setPrototypeOf(snapshot, null)).toBe(false);
	expect(snapshot.match("alice.github.io")).toEqual(result);
});

it("checks only identity without invoking getters or proxy traps", () => {
	const trap = vi.fn(() => {
		throw new Error("Trap invoked");
	});
	const spoof = Object.create(null);
	for (const key of Reflect.ownKeys(snapshot))
		Object.defineProperty(spoof, key, { get: trap });
	const proxy = new Proxy(snapshot, {
		get: trap,
		has: trap,
		ownKeys: trap,
		getPrototypeOf: trap,
	});
	const revoked = Proxy.revocable(snapshot, {});
	revoked.revoke();
	for (const value of [
		undefined,
		null,
		false,
		0,
		"snapshot",
		Symbol(),
		() => snapshot,
		spoof,
		proxy,
		revoked.proxy,
		{ ...snapshot },
		Object.create(snapshot),
		Object.freeze({ ...snapshot }),
		Object.create(
			Object.getPrototypeOf(snapshot),
			Object.getOwnPropertyDescriptors(snapshot),
		),
	]) {
		expect(isPinnedPublicSuffixSnapshot(value)).toBe(false);
	}
	expect(trap).not.toHaveBeenCalled();
	expect(isPinnedPublicSuffixSnapshot(snapshot)).toBe(true);
});

it("keeps independent snapshots and detached match closures alive", async () => {
	const source = new Uint8Array(fixture);
	const first = await createPinnedPublicSuffixSnapshot(source);
	const second = await createPinnedPublicSuffixSnapshot(source);
	const match = first.match;
	source.fill(0);
	expect(first).not.toBe(second);
	expect(first.match).not.toBe(second.match);
	await expect(createPinnedPublicSuffixSnapshot(source)).rejects.toThrow();
	for (const admitted of [first, second, snapshot]) {
		expect(isPinnedPublicSuffixSnapshot(admitted)).toBe(true);
		expect(admitted.match("alice.blogspot.com")).toEqual(
			match("alice.blogspot.com"),
		);
	}
	expect(match.call({ match: () => null }, "alice.github.io")).toEqual(
		snapshot.match("alice.github.io"),
	);
});
