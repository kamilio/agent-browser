import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
	type IntegrityAlgorithm,
	type IntegrityMetadata,
	parseIntegrityMetadata,
	subresourceIntegrityLimits,
	verifyIntegrityMetadata,
} from "./subresource-integrity.js";

const bytes = new TextEncoder().encode("abc");
const vectors: readonly [IntegrityAlgorithm, string][] = [
	[
		"sha256",
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	],
	[
		"sha384",
		"cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
	],
	[
		"sha512",
		"ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
	],
];
const expected = Object.fromEntries(
	vectors.map(([algorithm, hex]) => [
		algorithm,
		Buffer.from(hex, "hex").toString("base64"),
	]),
) as Record<IntegrityAlgorithm, string>;
const metadata = (value: string) => {
	const result = parseIntegrityMetadata(value);
	if (result === null) throw new Error("Expected supported metadata");
	return result;
};
const sha256 = () => metadata(`sha256-${expected.sha256}`);

it.each(vectors)("verifies the fixed abc vector with %s", (algorithm) => {
	const parsed = metadata(`${algorithm}-${expected[algorithm]}`);
	expect(parsed).toEqual({ algorithm, values: [expected[algorithm]] });
	expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(true);
	expect(
		verifyIntegrityMetadata(new TextEncoder().encode("abd"), parsed, 3),
	).toBe(false);
});

it.each(["", " ", " \t\r\n ", "sha1-abc md5-def", "unknown", "'sha256-abc'"])(
	"returns no effective restriction for %j",
	(value) => {
		expect(parseIntegrityMetadata(value)).toBeNull();
	},
);

it.each(["SHA256", "Sha256", "sHa256"])(
	"canonicalizes the valid algorithm token %s",
	(algorithm) => {
		expect(metadata(`${algorithm}-${expected.sha256}`)).toEqual(sha256());
		expect(
			verifyIntegrityMetadata(
				bytes,
				metadata(`${algorithm}-${expected.sha256}`),
				3,
			),
		).toBe(true);
	},
);

it.each([
	["sha256", ""],
	["sha256-", ""],
	["sha256?unknown", ""],
	["sha256-?unknown", ""],
	["sha256--ignored", ""],
	["sha256-not-base64", "not"],
	["sha256-%%%!", "%%%!"],
	["sha256-\u0000", "\u0000"],
])("retains the recognized malformed expression %j", (value, digest) => {
	const parsed = metadata(value);
	expect(parsed).toEqual({ algorithm: "sha256", values: [digest] });
	expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(false);
});

it.each([
	"?",
	"?unknown",
	"?a=b?sha512-invalid",
	"-ignored-tail",
	"-ignored?option",
])(
	"uses only the sourced expression/value components with suffix %s",
	(suffix) => {
		expect(
			verifyIntegrityMetadata(
				bytes,
				metadata(`sha256-${expected.sha256}${suffix}`),
				3,
			),
		).toBe(true);
	},
);

it.each(["\t", "\n", "\r", "\f", "\v", "\u00a0"])(
	"does not silently broaden strict space splitting to %j",
	(separator) => {
		expect(
			parseIntegrityMetadata(`${separator}sha256-${expected.sha256}`),
		).toBeNull();
		expect(metadata(`sha256-${expected.sha256}${separator}sha512-bad`)).toEqual(
			{ algorithm: "sha256", values: [`${expected.sha256}${separator}sha512`] },
		);
		expect(
			verifyIntegrityMetadata(
				bytes,
				metadata(`sha256-${expected.sha256}${separator}`),
				3,
			),
		).toBe(false);
	},
);

it("ignores unsupported tokens and ignores empty space-separated entries within the item budget", () => {
	expect(metadata(` sha1-bad  sha256-${expected.sha256} mystery-! `)).toEqual(
		sha256(),
	);
});

it.each([
	["sha256", "sha384"],
	["sha256", "sha512"],
	["sha384", "sha512"],
] as const)(
	"does not let matching %s rescue mismatching %s",
	(weak, strong) => {
		for (const value of [
			`${weak}-${expected[weak]} ${strong}-bad`,
			`${strong}-bad ${weak}-${expected[weak]}`,
		]) {
			const parsed = metadata(value);
			expect(parsed).toEqual({ algorithm: strong, values: ["bad"] });
			expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(false);
		}
	},
);

it.each(["sha512", "sha512-", "SHA512?unknown"])(
	"retains a stronger missing digest for %s",
	(strong) => {
		const parsed = metadata(`sha256-${expected.sha256} ${strong}`);
		expect(parsed).toEqual({ algorithm: "sha512", values: [""] });
		expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(false);
	},
);

it.each([
	["sha256", "sha384", "sha512"],
	["sha256", "sha512", "sha384"],
	["sha384", "sha256", "sha512"],
	["sha384", "sha512", "sha256"],
	["sha512", "sha256", "sha384"],
	["sha512", "sha384", "sha256"],
] as const)("selects the strongest of %s, %s, %s", (...algorithms) => {
	const parsed = metadata(
		algorithms
			.map((algorithm) => `${algorithm}-${expected[algorithm]}`)
			.join(" "),
	);
	expect(parsed).toEqual({ algorithm: "sha512", values: [expected.sha512] });
	expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(true);
});

it.each(["sha256", "sha384", "sha512"] as const)(
	"accepts any of the same-strongest %s alternatives",
	(algorithm) => {
		for (const values of [
			["bad", expected[algorithm]],
			[expected[algorithm], "bad"],
			["", expected[algorithm], expected[algorithm]],
		]) {
			const parsed = metadata(
				values.map((value) => `${algorithm}-${value}`).join(" "),
			);
			expect(parsed.values).toEqual(values);
			expect(verifyIntegrityMetadata(bytes, parsed, 3)).toBe(true);
		}
		expect(
			verifyIntegrityMetadata(
				bytes,
				metadata(`${algorithm}-bad ${algorithm}-other`),
				3,
			),
		).toBe(false);
	},
);

it("does not compare base64 case-insensitively, decode expected values or repair padding", () => {
	for (const value of [
		expected.sha256.toLowerCase(),
		expected.sha256.toUpperCase(),
		expected.sha256.slice(0, -1),
		`${expected.sha256}=`,
		`${expected.sha256}\u0000`,
	])
		expect(verifyIntegrityMetadata(bytes, metadata(`sha256-${value}`), 3)).toBe(
			false,
		);
});

it("does not normalize URL-safe base64 and preserves the sourced dash splitting recovery", () => {
	const urlSafe = expected.sha256.replaceAll("+", "-").replaceAll("/", "_");
	expect(urlSafe).not.toBe(expected.sha256);
	expect(metadata(`sha256-${urlSafe}`).values).toEqual([urlSafe.split("-")[0]]);
	expect(verifyIntegrityMetadata(bytes, metadata(`sha256-${urlSafe}`), 3)).toBe(
		false,
	);
	expect(
		verifyIntegrityMetadata(
			bytes,
			metadata(`sha256-${expected.sha256.replaceAll("/", "_")}`),
			3,
		),
	).toBe(false);
});

it("verifies raw non-ASCII, BOM, CRLF and invalid UTF-8 bytes without text normalization", () => {
	const fixtures = [
		new TextEncoder().encode("é { color: red; }"),
		new TextEncoder().encode("\ufeffbody {\r\n color: red;\r\n}"),
		Uint8Array.of(0xff, 0xfe, 0, 0xc0, 0xaf),
	];
	for (const input of fixtures) {
		const before = input.slice();
		const parsed = metadata(
			`sha512-${createHash("sha512").update(input).digest("base64")}`,
		);
		expect(verifyIntegrityMetadata(input, parsed, input.length)).toBe(true);
		const normalized = new TextEncoder().encode(
			new TextDecoder().decode(input).replaceAll("\r\n", "\n"),
		);
		if (Buffer.compare(input, normalized) !== 0)
			expect(verifyIntegrityMetadata(normalized, parsed, 1024)).toBe(false);
		const tampered = Uint8Array.from([...input, 0]);
		expect(verifyIntegrityMetadata(tampered, parsed, 1024)).toBe(false);
		expect(input).toEqual(before);
	}
});

it("hashes only Uint8Array and Buffer subviews without mutating their backing store", () => {
	const backing = Uint8Array.of(255, 97, 98, 99, 0);
	const before = backing.slice();
	for (const input of [
		backing.subarray(1, 4),
		Buffer.from(backing.buffer, 1, 3),
	])
		expect(verifyIntegrityMetadata(input, sha256(), 3)).toBe(true);
	expect(verifyIntegrityMetadata(backing, sha256(), 5)).toBe(false);
	expect(backing).toEqual(before);
});

it("does not trust shadowed byte view properties when enforcing the caller ceiling", () => {
	const input = bytes.slice();
	Object.defineProperty(input, "byteLength", { value: 0 });
	Object.defineProperty(input, "byteOffset", { value: 999 });
	Object.defineProperty(input, "buffer", { value: new ArrayBuffer(0) });
	expect(() => verifyIntegrityMetadata(input, sha256(), 2)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(verifyIntegrityMetadata(input, sha256(), 3)).toBe(true);
});

it("accepts empty bytes only with their exact digest and a zero-byte ceiling", () => {
	const parsed = metadata(
		"sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
	);
	expect(verifyIntegrityMetadata(new Uint8Array(), parsed, 0)).toBe(true);
	expect(
		verifyIntegrityMetadata(new Uint8Array(), metadata("sha256-"), 0),
	).toBe(false);
});

it("exposes immutable limits and freezes parsed metadata without aliases", () => {
	expect(subresourceIntegrityLimits).toEqual({
		metadataCodeUnits: 16_384,
		metadataItems: 128,
	});
	expect(Object.isFrozen(subresourceIntegrityLimits)).toBe(true);
	const parsed = sha256();
	expect(Object.isFrozen(parsed)).toBe(true);
	expect(Object.isFrozen(parsed.values)).toBe(true);
	expect(() => (parsed.values as string[]).push("bad")).toThrow(TypeError);
	expect(sha256()).toEqual(parsed);
});

it("bounds the whole metadata string before discarding unsupported tokens or options", () => {
	const limit = subresourceIntegrityLimits.metadataCodeUnits;
	for (const prefix of ["sha256-", "unknown-", `sha256-${expected.sha256}?`]) {
		const value = prefix + "a".repeat(limit - prefix.length);
		expect(() => parseIntegrityMetadata(value)).not.toThrow();
		expect(() => parseIntegrityMetadata(`${value}a`)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
	const largest = metadata(`sha256-${"a".repeat(limit - 7)}`);
	expect(verifyIntegrityMetadata(bytes, largest, 3)).toBe(false);
	expect(() => parseIntegrityMetadata("😀".repeat(limit / 2 + 1))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("counts every strict-split item including unsupported and empty entries", () => {
	const limit = subresourceIntegrityLimits.metadataItems;
	for (const item of ["sha256", "unknown", ""]) {
		const value = Array(limit).fill(item).join(" ");
		expect(() => parseIntegrityMetadata(value)).not.toThrow();
		expect(() => parseIntegrityMetadata(`${value} ${item}`)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
	expect(metadata(Array(limit).fill("sha256").join(" ")).values).toHaveLength(
		limit,
	);
});

it("validates supplied metadata fully and enforces normalized metadata budgets before matching", () => {
	const valid: IntegrityMetadata = {
		algorithm: "sha256",
		values: [expected.sha256],
	};
	expect(verifyIntegrityMetadata(bytes, valid, 3)).toBe(true);
	expect(valid).toEqual({ algorithm: "sha256", values: [expected.sha256] });
	expect(() =>
		verifyIntegrityMetadata(
			bytes,
			{ ...valid, values: Array(129).fill(expected.sha256) },
			3,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		verifyIntegrityMetadata(
			bytes,
			{ ...valid, values: [expected.sha256, "a".repeat(16_384)] },
			3,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		verifyIntegrityMetadata(
			bytes,
			{
				...valid,
				values: [expected.sha256, 3],
			} as unknown as IntegrityMetadata,
			3,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() => verifyIntegrityMetadata(bytes, sha256(), 2)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("accepts the normalized code-unit and item ceilings exactly", () => {
	const limit = subresourceIntegrityLimits.metadataCodeUnits;
	const largest = {
		algorithm: "sha256" as const,
		values: ["a".repeat(limit - 6)],
	};
	expect(verifyIntegrityMetadata(bytes, largest, 3)).toBe(false);
	expect(() =>
		verifyIntegrityMetadata(
			bytes,
			{ ...largest, values: [`${largest.values[0]}a`] },
			3,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	const values = Array(128).fill("bad");
	values[127] = expected.sha256;
	expect(
		verifyIntegrityMetadata(bytes, { algorithm: "sha256", values }, 3),
	).toBe(true);
	expect(
		verifyIntegrityMetadata(bytes, sha256(), Number.MAX_SAFE_INTEGER),
	).toBe(true);
});

it("does not invoke metadata accessors or proxy traps", () => {
	let calls = 0;
	const trap = () => {
		calls++;
		throw new Error("Untrusted accessor invoked");
	};
	const accessor = Object.defineProperty(
		{ values: [expected.sha256] },
		"algorithm",
		{ get: trap },
	);
	const digestAccessor = Object.defineProperty([expected.sha256], "0", {
		get: trap,
	});
	const valuesAccessor = Object.defineProperty(
		{ algorithm: "sha256" },
		"values",
		{ get: trap },
	);
	const proxy = new Proxy(sha256(), {
		get: trap,
		getOwnPropertyDescriptor: trap,
	});
	const valuesProxy = {
		algorithm: "sha256",
		values: new Proxy([expected.sha256], { get: trap }),
	};
	const revoked = Proxy.revocable([expected.sha256], {});
	revoked.revoke();
	for (const value of [
		accessor,
		valuesAccessor,
		proxy,
		valuesProxy,
		{ algorithm: "sha256", values: digestAccessor },
		{ algorithm: "sha256", values: revoked.proxy },
	])
		expect(() =>
			verifyIntegrityMetadata(bytes, value as IntegrityMetadata, 3),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(calls).toBe(0);
});

it.each([undefined, null, 1, {}, [], new String("sha256-abc")])(
	"rejects non-string metadata input %j",
	(value) => {
		expect(() => parseIntegrityMetadata(value as string)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([
	undefined,
	null,
	"abc",
	[],
	{},
	new Uint16Array(3),
	new Uint8ClampedArray(3),
	new ArrayBuffer(3),
	new DataView(new ArrayBuffer(3)),
	new Proxy(bytes, {}),
])("rejects non-byte-view input %# before crypto", (value) => {
	expect(() =>
		verifyIntegrityMetadata(value as Uint8Array, sha256(), 3),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("rejects a detached byte view before crypto", () => {
	const input = bytes.slice();
	structuredClone(input.buffer, { transfer: [input.buffer] });
	expect(() => verifyIntegrityMetadata(input, sha256(), 3)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each([
	undefined,
	null,
	[],
	{},
	{ algorithm: "sha1", values: ["x"] },
	{ algorithm: "SHA256", values: ["x"] },
	{ algorithm: "constructor", values: ["x"] },
	{ algorithm: 256, values: ["x"] },
	{ algorithm: "sha256" },
	{ algorithm: "sha256", values: [] },
	{ algorithm: "sha256", values: "x" },
	{ algorithm: "sha256", values: [null] },
	{ algorithm: "sha256", values: Array(1) },
])("rejects invalid normalized metadata %# before crypto", (value) => {
	expect(() =>
		verifyIntegrityMetadata(bytes, value as IntegrityMetadata, 3),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	undefined,
	null,
	"3",
	-1,
	0.5,
	NaN,
	Infinity,
	Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid byte ceiling %j", (value) => {
	expect(() =>
		verifyIntegrityMetadata(bytes, sha256(), value as number),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
