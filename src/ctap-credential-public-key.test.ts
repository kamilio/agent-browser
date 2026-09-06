import { afterEach, expect, it, vi } from "vitest";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import {
	type CtapCredentialPublicKey,
	decodeCtapCredentialPublicKey,
	decodeCtapCredentialPublicKeyPrefix,
} from "./ctap-credential-public-key.js";
import { AgentBrowserError } from "./errors.js";

type Wire = readonly number[];
type Entry = readonly [Wire, Wire];
type RejectionCode = "invalid-input" | "resource-limit" | "unsupported";

const messages = {
	"invalid-input": "Invalid CTAP credential public key.",
	"resource-limit": "CTAP credential public key limit exceeded.",
	unsupported: "Unsupported CTAP credential public key.",
};
const ecProfiles = [
	{ curve: 1, width: 32 },
	{ curve: 2, width: 48 },
	{ curve: 3, width: 66 },
] as const;
const ecAlgorithms = [-7, -35, -36] as const;
const okpProfiles = [
	{ curve: 6, width: 32 },
	{ curve: 7, width: 57 },
] as const;
const rsaAlgorithms = [-37, -38, -39, -257, -258, -259] as const;

afterEach(() => {
	vi.restoreAllMocks();
});

function header(major: number, argument: number): number[] {
	if (argument < 24) return [major | argument];
	if (argument < 256) return [major | 24, argument];
	return [major | 25, argument >>> 8, argument & 0xff];
}

function integer(value: number): number[] {
	return value < 0 ? header(0x20, -1 - value) : header(0, value);
}

function bytes(value: Wire | Uint8Array): number[] {
	return [...header(0x40, value.length), ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...header(0x60, encoded.length), ...encoded];
}

function map(entries: readonly Entry[]): Uint8Array {
	return new Uint8Array([
		...header(0xa0, entries.length),
		...entries.flatMap(([label, value]) => [...label, ...value]),
	]);
}

function coordinate(width: number, fill = 0x31): Uint8Array {
	const result = new Uint8Array(width).fill(fill);
	result[0] = 0;
	return result;
}

function modulus(width = 256, first = 0x80): Uint8Array {
	const result = new Uint8Array(width).fill(0x62);
	result[0] = first;
	return result;
}

function ecEntries(
	algorithm = -7,
	curve = 1,
	width = 32,
	compressed?: boolean,
): Entry[] {
	return [
		[[1], [2]],
		[[3], integer(algorithm)],
		[[0x20], integer(curve)],
		[[0x21], bytes(coordinate(width))],
		[
			[0x22],
			compressed === undefined
				? bytes(coordinate(width, 0x52))
				: [compressed ? 0xf5 : 0xf4],
		],
	];
}

function okpEntries(curve = 6, width = 32): Entry[] {
	return [
		[[1], [1]],
		[[3], [0x27]],
		[[0x20], integer(curve)],
		[[0x21], bytes(coordinate(width))],
	];
}

function rsaEntries(
	algorithm = -257,
	modulusValue = modulus(),
	exponentValue = new Uint8Array([1, 0, 1]),
): Entry[] {
	return [
		[[1], [3]],
		[[3], integer(algorithm)],
		[[0x20], bytes(modulusValue)],
		[[0x21], bytes(exponentValue)],
	];
}

function replaceValue(
	entries: readonly Entry[],
	index: number,
	value: Wire,
): Entry[] {
	return entries.map(([label, original], position) => [
		label,
		position === index ? value : original,
	]);
}

const profiles = [
	{ name: "ec2", entries: ecEntries() },
	{ name: "okp", entries: okpEntries() },
	{ name: "rsa", entries: rsaEntries() },
] as const;

function rejectsExactly(
	decode: (input: Uint8Array) => unknown,
	input: unknown,
	code: RejectionCode = "invalid-input",
): void {
	let caught: unknown;
	try {
		decode(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({
		name: "AgentBrowserError",
		code,
		message: messages[code],
	});
	if (!(caught instanceof Error)) throw new Error("Expected credential error");
	expect(caught.cause).toBeUndefined();
	expect(Object.hasOwn(caught, "cause")).toBe(false);
	expect(caught.message).not.toContain("SYNTHETIC_PRIVATE");
}

function rejects(input: unknown, code: RejectionCode = "invalid-input"): void {
	rejectsExactly(decodeCtapCredentialPublicKey, input, code);
	rejectsExactly(decodeCtapCredentialPublicKeyPrefix, input, code);
}

function accepts(input: Uint8Array, expected: CtapCredentialPublicKey): void {
	const original = new Uint8Array(input);
	expect(decodeCtapCredentialPublicKey(input)).toEqual(expected);
	expect(decodeCtapCredentialPublicKeyPrefix(input)).toEqual({
		publicKey: expected,
		bytesRead: input.length,
	});
	expect([...input]).toEqual([...original]);
}

function keyBuffers(publicKey: CtapCredentialPublicKey): Uint8Array[] {
	if (publicKey.kind === "rsa") return [publicKey.modulus, publicKey.exponent];
	if (publicKey.kind === "okp" || typeof publicKey.y === "boolean")
		return [publicKey.x];
	return [publicKey.x, publicKey.y];
}

function treeBuffers(value: CtapCborValue): Uint8Array[] {
	if (value.kind === "bytes") return [value.value];
	if (value.kind === "float") return [value.encoding];
	if (value.kind === "array") return value.items.flatMap(treeBuffers);
	if (value.kind === "map")
		return value.entries.flatMap(([label, item]) => [
			...treeBuffers(label),
			...treeBuffers(item),
		]);
	return [];
}

function observeDecoderTrees() {
	const allocations: Uint8Array[] = [];
	const snapshots: Uint8Array[] = [];
	const decode = ctapCbor.decodeCtapCbor;
	const decodePrefix = ctapCbor.decodeCtapCborPrefix;
	function record(value: CtapCborValue): void {
		const buffers = treeBuffers(value);
		allocations.push(...buffers);
		snapshots.push(...buffers.map((buffer) => buffer.slice()));
	}
	vi.spyOn(ctapCbor, "decodeCtapCbor").mockImplementation((input) => {
		const value = decode(input);
		record(value);
		return value;
	});
	vi.spyOn(ctapCbor, "decodeCtapCborPrefix").mockImplementation((input) => {
		const result = decodePrefix(input);
		record(result.value);
		return result;
	});
	return { allocations, snapshots };
}

function expectWiped(allocations: readonly Uint8Array[]): void {
	expect(allocations.length).toBeGreaterThan(0);
	for (const allocation of allocations)
		expect(allocation).toEqual(new Uint8Array(allocation.length));
}

it.each(
	ecProfiles.flatMap((profile) =>
		ecAlgorithms.map((algorithm) => ({ ...profile, algorithm })),
	),
)("accepts EC2 algorithm $algorithm with curve $curve", (profile) => {
	accepts(map(ecEntries(profile.algorithm, profile.curve, profile.width)), {
		kind: "ec2",
		algorithm: profile.algorithm,
		curve: profile.curve,
		x: coordinate(profile.width),
		y: coordinate(profile.width, 0x52),
	});
});

it.each(
	ecProfiles.flatMap((profile) =>
		[false, true].map((compressed) => ({ ...profile, compressed })),
	),
)("accepts EC2 curve $curve with boolean y=$compressed", (profile) => {
	for (const algorithm of ecAlgorithms)
		accepts(
			map(
				ecEntries(algorithm, profile.curve, profile.width, profile.compressed),
			),
			{
				kind: "ec2",
				algorithm,
				curve: profile.curve,
				x: coordinate(profile.width),
				y: profile.compressed,
			},
		);
});

it.each(okpProfiles)(
	"accepts OKP curve $curve at exactly $width bytes",
	(profile) => {
		accepts(map(okpEntries(profile.curve, profile.width)), {
			kind: "okp",
			algorithm: -8,
			curve: profile.curve,
			x: coordinate(profile.width),
		});
	},
);

it.each(rsaAlgorithms)("accepts RSA signature algorithm %i", (algorithm) => {
	accepts(map(rsaEntries(algorithm)), {
		kind: "rsa",
		algorithm,
		modulus: modulus(),
		exponent: new Uint8Array([1, 0, 1]),
	});
});

it("accepts inclusive RSA modulus and local exponent limits", () => {
	for (const [width, first] of [
		[256, 0x80],
		[257, 1],
		[2048, 0xff],
	]) {
		const modulusValue = modulus(width, first);
		const exponentValue = new Uint8Array(2048).fill(0x42);
		accepts(map(rsaEntries(-257, modulusValue, exponentValue)), {
			kind: "rsa",
			algorithm: -257,
			modulus: modulusValue,
			exponent: exponentValue,
		});
	}
});

it("does not claim point, primality, oddness or exponent-range validation", () => {
	for (const exponentValue of [new Uint8Array([1]), new Uint8Array([2])])
		accepts(map(rsaEntries(-257, modulus(), exponentValue)), {
			kind: "rsa",
			algorithm: -257,
			modulus: modulus(),
			exponent: exponentValue,
		});
	accepts(
		map(
			replaceValue(
				replaceValue(ecEntries(), 3, bytes(new Uint8Array(32))),
				4,
				bytes(new Uint8Array(32)),
			),
		),
		{
			kind: "ec2",
			algorithm: -7,
			curve: 1,
			x: new Uint8Array(32),
			y: new Uint8Array(32),
		},
	);
	accepts(map(replaceValue(okpEntries(), 3, bytes(new Uint8Array(32)))), {
		kind: "okp",
		algorithm: -8,
		curve: 6,
		x: new Uint8Array(32),
	});
});

it.each(["ec2", "okp"])(
	"rejects every %s coordinate width boundary",
	(kind) => {
		const supported = kind === "ec2" ? ecProfiles : okpProfiles;
		for (const profile of supported) {
			const entries =
				kind === "ec2"
					? ecEntries(-7, profile.curve, profile.width)
					: okpEntries(profile.curve, profile.width);
			for (const index of kind === "ec2" ? [3, 4] : [3])
				for (const width of [0, profile.width - 1, profile.width + 1])
					rejects(map(replaceValue(entries, index, bytes(coordinate(width)))));
		}
	},
);

it.each([
	{ name: "empty modulus", index: 2, value: new Uint8Array() },
	{ name: "zero modulus", index: 2, value: new Uint8Array([0]) },
	{ name: "short modulus", index: 2, value: modulus(255, 0xff) },
	{ name: "2047-bit modulus", index: 2, value: modulus(256, 0x7f) },
	{
		name: "nonminimal modulus",
		index: 2,
		value: new Uint8Array([0, ...modulus()]),
	},
	{ name: "empty exponent", index: 3, value: new Uint8Array() },
	{ name: "zero exponent", index: 3, value: new Uint8Array([0]) },
	{
		name: "nonminimal exponent",
		index: 3,
		value: new Uint8Array([0, 1, 0, 1]),
	},
])("rejects RSA $name as invalid input", ({ index, value }) => {
	rejects(map(replaceValue(rsaEntries(), index, bytes(value))));
	if (value.length === 1 && value[0] === 0)
		rejects(
			map(
				replaceValue(
					rsaEntries(),
					index,
					bytes(new Uint8Array(index === 2 ? 256 : 3)),
				),
			),
		);
});

it.each([
	{ name: "16385-bit modulus", index: 2, value: modulus(2049, 1) },
	{ name: "2049-byte exponent", index: 3, value: new Uint8Array(2049).fill(1) },
])("classifies RSA $name as a resource limit", ({ index, value }) => {
	rejects(
		map(replaceValue(rsaEntries(), index, bytes(value))),
		"resource-limit",
	);
});

it.each(profiles)("requires every public $name label", ({ entries }) => {
	for (let index = 0; index < entries.length; index++)
		rejects(map(entries.filter((entry, position) => position !== index)));
});

it.each(profiles)(
	"rejects private, optional and unknown $name labels",
	({ name, entries }) => {
		for (const label of [2, 4, 5, 6, 24]) {
			const insertion = label < 3 ? 1 : 2;
			rejects(
				map([
					...entries.slice(0, insertion),
					[integer(label), bytes([0x53, 0x45, 0x43, 0x52, 0x45, 0x54])],
					...entries.slice(insertion),
				]),
			);
		}
		for (const label of name === "ec2" ? [-4, -5, -9] : [-3, -4, -5, -9])
			rejects(map([...entries, [integer(label), bytes([0x91, 0x92])]]));
		for (const label of ["kid", "key_ops", "BaseIV", "SYNTHETIC_PRIVATE"])
			rejects(map([...entries, [text(label), bytes([0x91, 0x92])]]));
	},
);

it.each([
	{ name: "kty", index: 0, float: [0xf9, 0x40, 0], string: "2" },
	{ name: "alg", index: 1, float: [0xf9, 0xc7, 0], string: "-7" },
])("requires an actual integer $name value", ({ index, float, string }) => {
	for (const value of [
		float,
		text(string),
		bytes([2]),
		[0xf5],
		[0xf6],
		[0x80],
		[0xa0],
	])
		rejects(map(replaceValue(ecEntries(), index, value)));
});

it.each([
	{ name: "kty", index: 0, float: [0xf9, 0x3c, 0], string: "1" },
	{ name: "alg", index: 1, float: [0xf9, 0x42, 0], string: "3" },
])("requires an actual integer $name label", ({ index, float, string }) => {
	const entries = ecEntries();
	for (const label of [float, text(string), bytes([index === 0 ? 1 : 3])])
		rejects(
			map([
				...entries.filter((entry, position) => position !== index),
				[label, entries[index][1]],
			]),
		);
});

it.each(profiles)(
	"rejects wrong types for $name key-specific fields",
	({ name, entries }) => {
		for (let index = 2; index < entries.length; index++) {
			const values: Wire[] = [
				text("SYNTHETIC_PRIVATE"),
				[0xf6],
				[0xf7],
				[0x80],
				[0xa0],
			];
			if (index === 2 && name !== "rsa")
				values.push(
					bytes([1]),
					[0xf5],
					[0xf9, name === "ec2" ? 0x3c : 0x46, 0],
				);
			else {
				values.push([0], [1], [0xf9, 0, 0]);
				if (name !== "ec2" || index !== 4) values.push([0xf4], [0xf5]);
			}
			for (const value of values)
				rejects(map(replaceValue(entries, index, value)));
			const floatLabel = [0xf9, [0xbc, 0xc0, 0xc2][index - 2], 0];
			for (const label of [text(String(1 - index)), floatLabel])
				rejects(
					map([
						...entries.filter((entry, position) => position !== index),
						[label, entries[index][1]],
					]),
				);
		}
	},
);

it("rejects every supported signature algorithm paired with the wrong kty", () => {
	for (const profile of profiles) {
		const wrong =
			profile.name === "ec2"
				? [-8, ...rsaAlgorithms]
				: profile.name === "okp"
					? [...ecAlgorithms, ...rsaAlgorithms]
					: [...ecAlgorithms, -8];
		for (const algorithm of wrong)
			rejects(map(replaceValue(profile.entries, 1, integer(algorithm))));
	}
});

it("classifies unknown integer key types as unsupported", () => {
	for (const keyType of [0, -1, 4, 255, 65535])
		rejects(map(replaceValue(ecEntries(), 0, integer(keyType))), "unsupported");
});

it("classifies unlisted integer algorithms as unsupported", () => {
	for (const profile of profiles)
		for (const algorithm of [0, 1, -1, -6, -9, -260, -65536])
			rejects(
				map(replaceValue(profile.entries, 1, integer(algorithm))),
				"unsupported",
			);
});

it("classifies unsupported and cross-key curves including X25519/X448", () => {
	for (const curve of [0, -1, 4, 5, 6, 7, 8, 255])
		rejects(map(replaceValue(ecEntries(), 2, integer(curve))), "unsupported");
	for (const curve of [0, -1, 1, 2, 3, 4, 5, 8, 255])
		rejects(map(replaceValue(okpEntries(), 2, integer(curve))), "unsupported");
});

it.each<{ name: string; wires: Wire[]; code?: RejectionCode }>([
	{
		name: "non-map roots",
		wires: [[0], [0x40], [0x60], [0x80], [0xf5], [0xf6]],
	},
	{ name: "empty map", wires: [[0xa0]] },
	{
		name: "indefinite containers",
		wires: [
			[0xbf, 0xff],
			[0xa1, 1, 0x5f, 0xff],
		],
	},
	{
		name: "duplicate labels",
		wires: [
			[0xa2, 1, 2, 1, 2],
			[0xa2, 1, 2, 0xf9, 0x3c, 0, 2],
		],
	},
	{ name: "noncanonical label order", wires: [[0xa2, 3, 0x26, 1, 2]] },
	{
		name: "nonminimal integers",
		wires: [
			[0xa1, 0x18, 1, 2],
			[0xa1, 1, 0x18, 2],
			[0xa1, 3, 0x38, 6],
		],
	},
	{
		name: "nonminimal lengths",
		wires: [
			[0xb8, 0],
			[0xa1, 1, 0x58, 1, 0x53],
			[0xa1, 1, 0x78, 1, 0x53],
		],
	},
	{
		name: "fatal UTF8",
		wires: [
			[0xa1, 1, 0x61, 0xff],
			[0xa1, 0x61, 0xff, 2],
		],
	},
	{
		name: "forbidden tags",
		wires: [
			[0xc0, 0xa0],
			[0xa1, 1, 0xc0, 2],
			[0xa1, 0xc0, 1, 2],
		],
	},
	{
		name: "depth beyond four",
		wires: [[0xa1, 1, 0x81, 0x81, 0x81, 0x80]],
		code: "resource-limit",
	},
	{
		name: "reserved headers and truncated payloads",
		wires: [
			[0xbc],
			[0xff],
			[0xa1, 1],
			[0xa1, 1, 0x42, 0x53],
			[0xa1, 1, 0xf9, 0x3c],
		],
	},
	{
		name: "complex map keys",
		wires: [
			[0xa1, 0x80, 1],
			[0xa1, 0xa0, 1],
		],
		code: "unsupported",
	},
])("rejects $name with a sanitized key error", ({ wires, code }) => {
	for (const wire of wires) rejects(new Uint8Array(wire), code);
});

it("rejects every truncated prefix of all supported key shapes", () => {
	for (const entries of [
		ecEntries(),
		ecEntries(-7, 1, 32, false),
		okpEntries(),
		rsaEntries(),
	]) {
		const wire = map(entries);
		for (let length = 0; length < wire.length; length++)
			rejects(wire.subarray(0, length));
	}
});

it("reports exact key offsets and ignores malformed suffixes only in prefix mode", () => {
	for (const entries of [
		ecEntries(),
		ecEntries(-7, 1, 32, true),
		okpEntries(7, 57),
		rsaEntries(),
	]) {
		const wire = map(entries);
		const expected = decodeCtapCredentialPublicKey(wire);
		for (const suffix of [
			[0],
			[0xff],
			[0x61, 0xff],
			[0xc0, 0],
			[0x81, 0x81, 0x81, 0x81, 0x80],
		]) {
			const backing = new Uint8Array([0xee, ...wire, ...suffix, 0xdd]);
			const input = backing.subarray(1, backing.length - 1);
			const original = backing.slice();
			expect(decodeCtapCredentialPublicKeyPrefix(input)).toEqual({
				publicKey: expected,
				bytesRead: wire.length,
			});
			rejectsExactly(decodeCtapCredentialPublicKey, input);
			expect(backing).toEqual(original);
		}
	}
});

it("applies the 7609-byte input-view cap before prefix suffix handling", () => {
	const wire = map(ecEntries());
	const backing = new Uint8Array(7611).fill(0xff);
	backing.set(wire, 1);
	const exact = backing.subarray(1, 7610);
	expect(exact).toHaveLength(7609);
	expect(decodeCtapCredentialPublicKeyPrefix(exact)).toEqual({
		publicKey: decodeCtapCredentialPublicKey(wire),
		bytesRead: wire.length,
	});
	rejectsExactly(decodeCtapCredentialPublicKey, exact);
	const excessive = backing.subarray(1);
	expect(excessive).toHaveLength(7610);
	rejects(excessive, "resource-limit");
	excessive[0] = 0xff;
	rejects(excessive, "resource-limit");
});

it.each(profiles)(
	"owns every $name output independently of input and other outputs",
	({ entries }) => {
		const wire = map(entries);
		const backing = new Uint8Array([0xee, ...wire, 0xdd]);
		const input = backing.subarray(1, backing.length - 1);
		const first = decodeCtapCredentialPublicKey(input);
		const second = decodeCtapCredentialPublicKeyPrefix(input).publicKey;
		const expected = decodeCtapCredentialPublicKey(wire);
		const firstBuffers = keyBuffers(first);
		const secondBuffers = keyBuffers(second);
		expect(
			new Set([...firstBuffers, ...secondBuffers].map((value) => value.buffer))
				.size,
		).toBe(firstBuffers.length + secondBuffers.length);
		for (const [index, value] of firstBuffers.entries()) {
			expect(value.buffer).not.toBe(backing.buffer);
			value.fill(0xff);
			for (let later = index + 1; later < firstBuffers.length; later++)
				expect(firstBuffers[later]).toEqual(keyBuffers(expected)[later]);
			expect(second).toEqual(expected);
			expect(input).toEqual(wire);
		}
		backing.fill(0);
		expect(second).toEqual(expected);
	},
);

it("ignores own byte-slot, constructor, iterator and copying shadows", () => {
	const wire = map(ecEntries());
	const expected = decodeCtapCredentialPublicKey(wire);
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const property of [
		"length",
		"byteLength",
		"byteOffset",
		"buffer",
		"constructor",
		"slice",
		"subarray",
		"set",
		"fill",
		Symbol.iterator,
		Symbol.toStringTag,
	])
		Object.defineProperty(wire, property, { get: hook });
	expect(decodeCtapCredentialPublicKey(wire)).toEqual(expected);
	expect(decodeCtapCredentialPublicKeyPrefix(wire).publicKey).toEqual(expected);
	expect(hook).not.toHaveBeenCalled();
});

it("accepts intrinsically branded subclass and Buffer offset views without species hooks", () => {
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	class HostileBytes extends Uint8Array {
		static get [Symbol.species]() {
			return hook();
		}
	}
	const wire = map(okpEntries());
	const expected = decodeCtapCredentialPublicKey(wire);
	const subclass = new HostileBytes(wire);
	Object.defineProperty(subclass, "slice", { get: hook });
	expect(decodeCtapCredentialPublicKey(subclass)).toEqual(expected);
	expect(decodeCtapCredentialPublicKeyPrefix(subclass).publicKey).toEqual(
		expected,
	);
	const buffer = Buffer.from([0xee, ...wire, 0xdd]);
	accepts(buffer.subarray(1, buffer.length - 1), expected);
	expect(hook).not.toHaveBeenCalled();
});

it("rejects wrong brands, shared, detached and proxy inputs without caller hooks", () => {
	const wire = map(ecEntries());
	const buffer = new ArrayBuffer(wire.length);
	const detached = new Uint8Array(buffer);
	structuredClone(buffer, { transfer: [buffer] });
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const forged = Object.create(Uint8Array.prototype);
	Object.defineProperty(forged, Symbol.toStringTag, { get: hook });
	const shared = new Uint8Array(new SharedArrayBuffer(wire.length));
	shared.set(wire);
	for (const input of [
		null,
		undefined,
		[],
		{},
		wire.buffer,
		new DataView(wire.buffer),
		new Int8Array(wire),
		new Uint8ClampedArray(wire),
		new Uint16Array(wire),
		new Uint8Array(),
		shared,
		detached,
		forged,
		new Proxy(wire, { get: hook, getPrototypeOf: hook }),
	])
		rejects(input);
	expect(hook).not.toHaveBeenCalled();
});

it.each(profiles)(
	"wipes reachable decoded $name storage but preserves returned copies",
	({ entries }) => {
		const observed = observeDecoderTrees();
		const wire = map(entries);
		const original = wire.slice();
		const first = decodeCtapCredentialPublicKey(wire);
		const second = decodeCtapCredentialPublicKeyPrefix(wire).publicKey;
		expect(observed.allocations.length).toBeGreaterThanOrEqual(
			keyBuffers(first).length * 2,
		);
		expect(
			observed.snapshots.every((value) => value.some((byte) => byte !== 0)),
		).toBe(true);
		expectWiped(observed.allocations);
		for (const result of [first, second]) {
			const buffers = keyBuffers(result);
			for (const [index, value] of buffers.entries()) {
				expect(value).toEqual(observed.snapshots[index]);
				for (const allocation of observed.allocations)
					expect(value.buffer).not.toBe(allocation.buffer);
			}
		}
		expect(wire).toEqual(original);
	},
);

it("wipes reachable bytes and float encodings for every rejection classification", () => {
	const observed = observeDecoderTrees();
	const nested = map([
		[bytes([0xa1]), [0x82, 0x81, ...bytes([0xb2]), 0xf9, 0x3e, 0]],
		[[0xf9, 0x3e, 0], bytes([0xc3])],
	]);
	const outcomes: {
		wire: Uint8Array;
		code: RejectionCode;
		allocations: number;
	}[] = [
		{
			wire: map([...ecEntries(), [[0x23], [...nested]]]),
			code: "invalid-input",
			allocations: 7,
		},
		{
			wire: map(replaceValue(ecEntries(), 1, integer(-9))),
			code: "unsupported",
			allocations: 2,
		},
		{
			wire: map(rsaEntries(-257, modulus(), new Uint8Array(2049).fill(1))),
			code: "resource-limit",
			allocations: 2,
		},
	];
	for (const { wire, code, allocations } of outcomes) {
		const original = wire.slice();
		for (const decode of [
			decodeCtapCredentialPublicKey,
			decodeCtapCredentialPublicKeyPrefix,
		]) {
			const before = observed.allocations.length;
			rejectsExactly(decode, wire, code);
			expect(observed.allocations.length - before).toBeGreaterThanOrEqual(
				allocations,
			);
			expectWiped(observed.allocations);
		}
		expect(wire).toEqual(original);
	}
	expect(
		observed.snapshots.every((value) => value.some((byte) => byte !== 0)),
	).toBe(true);
});

it("wipes selected output on a late copy failure without leaking the original error", () => {
	const observed = observeDecoderTrees();
	const slice = Uint8Array.prototype.slice;
	const selected: Uint8Array[] = [];
	const snapshots: Uint8Array[] = [];
	let selections = 0;
	let injectionFired = false;
	vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function (
		this: Uint8Array,
		start?: number,
		end?: number,
	) {
		const observationComplete =
			observed.snapshots.length === observed.allocations.length;
		const isSelection =
			observationComplete && observed.allocations.includes(this);
		if (isSelection && ++selections === 2) {
			injectionFired = true;
			throw new Error("SYNTHETIC_PRIVATE", { cause: "SYNTHETIC_PRIVATE" });
		}
		const result = slice.call(this, start, end);
		if (isSelection) {
			selected.push(result);
			snapshots.push(slice.call(result));
		}
		return result;
	});
	const wire = map(ecEntries());
	const original = wire.slice();
	for (const decode of [
		decodeCtapCredentialPublicKey,
		decodeCtapCredentialPublicKeyPrefix,
	]) {
		const before = selected.length;
		selections = 0;
		injectionFired = false;
		rejectsExactly(decode, wire);
		expect(injectionFired).toBe(true);
		expect(selections).toBe(2);
		expect(selected).toHaveLength(before + 1);
		expect(selected[before]).toBeInstanceOf(Uint8Array);
		expect(snapshots[before].some((byte) => byte !== 0)).toBe(true);
		expectWiped(selected.slice(before));
	}
	expect(selected).toHaveLength(2);
	for (const snapshot of snapshots)
		expect([coordinate(32), coordinate(32, 0x52)]).toContainEqual(snapshot);
	expectWiped(selected);
	expectWiped(observed.allocations);
	expect(wire).toEqual(original);
});
