import { afterEach, expect, it, vi } from "vitest";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import * as credentialKeys from "./ctap-credential-public-key.js";
import type { CtapCredentialPublicKey } from "./ctap-credential-public-key.js";
import { decodeCtapRegistrationAuthenticatorData } from "./ctap-registration-authenticator-data.js";
import { AgentBrowserError } from "./errors.js";

type RejectionCode = "invalid-input" | "resource-limit" | "unsupported";

const messages: Record<RejectionCode, string> = {
	"invalid-input": "Invalid CTAP registration authenticator data.",
	"resource-limit": "CTAP registration authenticator data limit exceeded.",
	unsupported: "Unsupported CTAP registration authenticator data.",
};
const hashWire = Array.from({ length: 32 }, (_value, index) => index + 1);
const aaguidWire = Array.from({ length: 16 }, (_value, index) => 0x80 + index);
const credentialIdWire = [0x91, 0x92, 0x93];
const coordinateX = [
	0,
	...Array.from({ length: 31 }, (_value, index) => index + 1),
];
const coordinateY = Array.from({ length: 32 }, (_value, index) => 0x40 + index);
const keyWire = [
	0xa5,
	0x01,
	0x02,
	0x03,
	0x26,
	0x20,
	0x01,
	0x21,
	0x58,
	0x20,
	...coordinateX,
	0x22,
	0x58,
	0x20,
	...coordinateY,
];

afterEach(() => {
	vi.restoreAllMocks();
});

function byteString(value: readonly number[]): number[] {
	const length = value.length;
	const header =
		length < 24
			? [0x40 | length]
			: length < 256
				? [0x58, length]
				: [0x59, length >>> 8, length & 0xff];
	return [...header, ...value];
}

function registration({
	flags = 0x40,
	counter = [0x12, 0x34, 0x56, 0x78],
	credentialId = credentialIdWire,
	declaredLength = credentialId.length,
	key = keyWire,
	tail = [],
}: {
	flags?: number;
	counter?: readonly number[];
	credentialId?: readonly number[];
	declaredLength?: number;
	key?: readonly number[];
	tail?: readonly number[];
} = {}): Uint8Array {
	return new Uint8Array([
		...hashWire,
		flags,
		...counter,
		...aaguidWire,
		declaredLength >>> 8,
		declaredLength & 0xff,
		...credentialId,
		...key,
		...tail,
	]);
}

function rejects(
	input: unknown,
	code: RejectionCode = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		decodeCtapRegistrationAuthenticatorData(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic registration rejection");
	expect(caught.name).toBe("AgentBrowserError");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(messages[code]);
	expect(caught.cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	return caught;
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
		return value.entries.flatMap(([key, item]) => [
			...treeBuffers(key),
			...treeBuffers(item),
		]);
	return [];
}

function resultBuffers(
	result: ReturnType<typeof decodeCtapRegistrationAuthenticatorData>,
): Uint8Array[] {
	return [
		result.rpIdHash,
		result.aaguid,
		result.credentialId,
		result.credentialPublicKeyBytes,
		...keyBuffers(result.credentialPublicKey),
		...(result.extensions === undefined ? [] : treeBuffers(result.extensions)),
	];
}

it("decodes an independent registration wire without claiming cryptographic validity", () => {
	expect(decodeCtapRegistrationAuthenticatorData(registration())).toEqual({
		rpIdHash: new Uint8Array(hashWire),
		flags: 0x40,
		signatureCounter: 0x12345678,
		aaguid: new Uint8Array(aaguidWire),
		credentialId: new Uint8Array(credentialIdWire),
		credentialPublicKey: {
			kind: "ec2",
			algorithm: -7,
			curve: 1,
			x: new Uint8Array(coordinateX),
			y: new Uint8Array(coordinateY),
		},
		credentialPublicKeyBytes: new Uint8Array(keyWire),
	});
});

it("reads unsigned big-endian counters at every byte and sign boundary", () => {
	for (const [counter, expected] of [
		[[0, 0, 0, 0], 0],
		[[0, 0, 0, 0xff], 0xff],
		[[0, 0, 1, 0], 0x100],
		[[0, 0, 0xff, 0xff], 0xffff],
		[[0, 1, 0, 0], 0x10000],
		[[0, 0xff, 0xff, 0xff], 0xffffff],
		[[1, 0, 0, 0], 0x1000000],
		[[0x7f, 0xff, 0xff, 0xff], 0x7fffffff],
		[[0x80, 0, 0, 0], 0x80000000],
		[[0xff, 0xff, 0xff, 0xff], 0xffffffff],
	] as const)
		expect(
			decodeCtapRegistrationAuthenticatorData(registration({ counter }))
				.signatureCounter,
		).toBe(expected);
});

it("reads big-endian ID lengths through the inclusive 1023-byte local limit", () => {
	for (const length of [1, 255, 256, 1023]) {
		const credentialId = Array.from(
			{ length },
			(_value, index) => (index + 17) & 0xff,
		);
		const result = decodeCtapRegistrationAuthenticatorData(
			registration({ credentialId }),
		);
		expect(result.credentialId).toEqual(new Uint8Array(credentialId));
		expect(result.credentialPublicKeyBytes).toEqual(new Uint8Array(keyWire));
	}
});

it("rejects an empty credential ID rather than consuming key bytes as its ID", () => {
	rejects(registration({ credentialId: [] }));
});

it("classifies a complete 1024-byte credential ID as a local resource limit", () => {
	rejects(
		registration({ credentialId: Array.from({ length: 1024 }, () => 0x7a) }),
		"resource-limit",
	);
});

it("rejects every truncation boundary in headers, IDs, keys and extensions", () => {
	for (const input of [
		registration(),
		registration({
			flags: 0xc0,
			credentialId: Array.from({ length: 256 }, () => 0x91),
			tail: [0xa1, 0x61, 0x78, 0x42, 0xab, 0xcd],
		}),
	]) {
		for (let length = 0; length < input.length; length++)
			rejects(input.subarray(0, length));
	}
});

it("does not silently repair credential ID length/key boundary mismatches", () => {
	for (const declaredLength of [2, 4, 1023])
		rejects(registration({ declaredLength }));
});

it.each([0x40, 0x41, 0x44, 0x45, 0x48, 0x58, 0x62])(
	"retains flags 0x%s, permitting absent UP/UV and untouched RFU bits",
	(flags) => {
		expect(
			decodeCtapRegistrationAuthenticatorData(registration({ flags })).flags,
		).toBe(flags);
	},
);

it("enforces AT and BS-implies-BE across every AT/BE/BS/ED combination", () => {
	for (const attested of [0, 0x40]) {
		for (const backupEligible of [0, 0x08]) {
			for (const backupState of [0, 0x10]) {
				for (const extensionData of [0, 0x80]) {
					const flags = attested | backupEligible | backupState | extensionData;
					const input = registration({
						flags,
						tail: extensionData === 0 ? [] : [0xa0],
					});
					if (attested === 0 || (backupState !== 0 && backupEligible === 0))
						rejects(input);
					else
						expect(decodeCtapRegistrationAuthenticatorData(input).flags).toBe(
							flags,
						);
				}
			}
		}
	}
});

it("accepts an explicitly empty extension map only with ED set", () => {
	expect(
		decodeCtapRegistrationAuthenticatorData(
			registration({ flags: 0xc0, tail: [0xa0] }),
		).extensions,
	).toEqual({ kind: "map", entries: [] });
});

it("keeps unknown extensions opaque, including nested non-text keys and floats", () => {
	const result = decodeCtapRegistrationAuthenticatorData(
		registration({
			flags: 0xc0,
			tail: [
				0xa1, 0x61, 0x78, 0xa1, 0x41, 0xab, 0x82, 0x42, 0xcd, 0xef, 0xf9, 0x3e,
				0x00,
			],
		}),
	);
	expect(result.extensions).toEqual({
		kind: "map",
		entries: [
			[
				{ kind: "text", value: "x" },
				{
					kind: "map",
					entries: [
						[
							{ kind: "bytes", value: new Uint8Array([0xab]) },
							{
								kind: "array",
								items: [
									{ kind: "bytes", value: new Uint8Array([0xcd, 0xef]) },
									{
										kind: "float",
										value: 1.5,
										encoding: new Uint8Array([0xf9, 0x3e, 0x00]),
									},
								],
							},
						],
					],
				},
			],
		],
	});
	expect(result.credentialPublicKeyBytes).toEqual(new Uint8Array(keyWire));
});

it("delimits real EC2 compressed, OKP and RSA prefixes before extension bytes", () => {
	const profiles = [
		{
			kind: "ec2",
			wire: [
				0xa5,
				1,
				2,
				3,
				0x26,
				0x20,
				1,
				0x21,
				...byteString(coordinateX),
				0x22,
				0xf4,
			],
		},
		{
			kind: "okp",
			wire: [0xa4, 1, 1, 3, 0x27, 0x20, 6, 0x21, ...byteString(coordinateX)],
		},
		{
			kind: "rsa",
			wire: [
				0xa4,
				1,
				3,
				3,
				0x38,
				0x24,
				0x20,
				...byteString([0x80, ...Array.from({ length: 255 }, () => 0x55)]),
				0x21,
				0x43,
				1,
				0,
				1,
			],
		},
	];
	const prefix = vi.spyOn(
		credentialKeys,
		"decodeCtapCredentialPublicKeyPrefix",
	);
	for (const profile of profiles) {
		const result = decodeCtapRegistrationAuthenticatorData(
			registration({
				flags: 0xc0,
				key: profile.wire,
				tail: [0xa1, 0x61, 0x78, 0xf5],
			}),
		);
		expect(result.credentialPublicKey.kind).toBe(profile.kind);
		expect(result.credentialPublicKeyBytes).toEqual(
			new Uint8Array(profile.wire),
		);
		expect(result.extensions).toEqual({
			kind: "map",
			entries: [
				[
					{ kind: "text", value: "x" },
					{ kind: "simple", value: 21 },
				],
			],
		});
		const decoded = prefix.mock.results.at(-1);
		expect(decoded?.type).toBe("return");
		if (decoded?.type !== "return") throw new Error("Expected real key prefix");
		expect(decoded.value.bytesRead).toBe(profile.wire.length);
	}
	expect(prefix).toHaveBeenCalledTimes(profiles.length);
});

it("rejects every tail without ED, including a second valid key or empty map", () => {
	for (const tail of [[0], [0xa0], keyWire, [0xff], [0xa1, 0x61, 0x78, 0]])
		rejects(registration({ tail }));
});

const invalidExtensions: {
	name: string;
	wire: number[];
	code?: RejectionCode;
}[] = [
	{ name: "missing ED payload", wire: [] },
	{ name: "scalar instead of map", wire: [0x00] },
	{ name: "array instead of map", wire: [0x80] },
	{ name: "empty text key", wire: [0xa1, 0x60, 0] },
	{ name: "unsigned integer key", wire: [0xa1, 1, 0] },
	{ name: "negative integer key", wire: [0xa1, 0x20, 0] },
	{ name: "byte string key", wire: [0xa1, 0x41, 0x78, 0] },
	{ name: "float key", wire: [0xa1, 0xf9, 0x3c, 0, 0] },
	{ name: "boolean key", wire: [0xa1, 0xf5, 0] },
	{
		name: "unsupported compound key",
		wire: [0xa1, 0x80, 0],
		code: "unsupported",
	},
	{ name: "duplicate key", wire: [0xa2, 0x61, 0x78, 0, 0x61, 0x78, 1] },
	{ name: "descending keys", wire: [0xa2, 0x61, 0x79, 0, 0x61, 0x78, 1] },
	{ name: "non-shortest map count", wire: [0xb8, 1, 0x61, 0x78, 0] },
	{ name: "non-shortest integer value", wire: [0xa1, 0x61, 0x78, 0x18, 1] },
	{ name: "invalid UTF8 key", wire: [0xa1, 0x61, 0xff, 0] },
	{ name: "invalid UTF8 value", wire: [0xa1, 0x61, 0x78, 0x61, 0xff] },
	{ name: "tagged value", wire: [0xa1, 0x61, 0x78, 0xc0, 0] },
	{ name: "indefinite map", wire: [0xbf, 0xff] },
	{ name: "truncated byte value", wire: [0xa1, 0x61, 0x78, 0x42, 0xab] },
	{ name: "second map after ED map", wire: [0xa0, 0xa0] },
	{
		name: "container depth above four",
		wire: [0xa1, 0x61, 0x78, 0x81, 0x81, 0x81, 0x80],
		code: "resource-limit",
	},
];

it.each(invalidExtensions)(
	"rejects extension $name with fixed errors",
	(fixture) => {
		rejects(
			registration({ flags: 0xc0, tail: fixture.wire }),
			fixture.code ?? "invalid-input",
		);
	},
);

it("accepts the CBOR depth-four boundary in an opaque extension", () => {
	const result = decodeCtapRegistrationAuthenticatorData(
		registration({
			flags: 0xc0,
			tail: [0xa1, 0x61, 0x78, 0x81, 0x81, 0x81, 0x41, 0xab],
		}),
	);
	if (result.extensions === undefined)
		throw new Error("Expected extension map");
	expect(treeBuffers(result.extensions)).toEqual([new Uint8Array([0xab])]);
});

it("wraps real unsupported, invalid and oversized credential-key failures", () => {
	const oversizedModulus = [0x80, ...Array.from({ length: 2048 }, () => 0x55)];
	for (const [key, code] of [
		[[0xa5, 1, 4, ...keyWire.slice(3)], "unsupported"],
		[[...keyWire.slice(0, 4), 0x38, 0x7f, ...keyWire.slice(5)], "unsupported"],
		[
			[0xa4, 1, 1, 3, 0x27, 0x20, 4, 0x21, ...byteString(coordinateX)],
			"unsupported",
		],
		[
			[0xa4, 1, 1, 3, 0x26, 0x20, 6, 0x21, ...byteString(coordinateX)],
			"invalid-input",
		],
		[[0xa0], "invalid-input"],
		[[0xc0, ...keyWire], "invalid-input"],
		[
			[
				0xa4,
				1,
				3,
				3,
				0x38,
				0x24,
				0x20,
				...byteString(oversizedModulus),
				0x21,
				0x43,
				1,
				0,
				1,
			],
			"resource-limit",
		],
	] as const)
		rejects(registration({ key }), code);
});

it("bounds the entire owned input at 7609 bytes, including extension payload", () => {
	const overhead = registration().length + 6;
	const payload = Array.from({ length: 7609 - overhead }, () => 0xab);
	const exact = registration({
		flags: 0xc0,
		tail: [0xa1, 0x61, 0x78, ...byteString(payload)],
	});
	expect(exact).toHaveLength(7609);
	const result = decodeCtapRegistrationAuthenticatorData(exact);
	if (result.extensions === undefined)
		throw new Error("Expected extension map");
	expect(treeBuffers(result.extensions)).toEqual([new Uint8Array(payload)]);
	const oversized = registration({
		flags: 0xc0,
		tail: [0xa1, 0x61, 0x78, ...byteString([...payload, 0xab])],
	});
	expect(oversized).toHaveLength(7610);
	rejects(oversized, "resource-limit");
});

it("uses only an offset Uint8Array view even when its backing store exceeds the cap", () => {
	const golden = registration();
	const backing = new Uint8Array(8000).fill(0xff);
	backing.set(golden, 123);
	const input = backing.subarray(123, 123 + golden.length);
	expect(decodeCtapRegistrationAuthenticatorData(input)).toEqual(
		decodeCtapRegistrationAuthenticatorData(golden),
	);
	expect(backing.subarray(0, 123)).toEqual(new Uint8Array(123).fill(0xff));
	expect(input).toEqual(golden);
	expect(backing.subarray(123 + golden.length)).toEqual(
		new Uint8Array(8000 - 123 - golden.length).fill(0xff),
	);
});

it("accepts Buffer views while ignoring shadowed typed-array slots and hooks", () => {
	const golden = registration();
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const input of [golden.slice(), Buffer.from(golden)]) {
		for (const property of [
			"length",
			"byteLength",
			"byteOffset",
			"buffer",
			"constructor",
			"slice",
			"subarray",
			"at",
			"values",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(input, property, { get: hook });
		expect(decodeCtapRegistrationAuthenticatorData(input)).toEqual(
			decodeCtapRegistrationAuthenticatorData(golden),
		);
	}
	expect(hook).not.toHaveBeenCalled();
});

it("rejects wrong byte brands and proxies without invoking caller hooks", () => {
	const golden = registration();
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const input of [
		null,
		undefined,
		[],
		{},
		new Uint8Array(0),
		golden.buffer,
		new DataView(golden.buffer),
		new Int8Array(golden.length),
		new Uint8ClampedArray(golden.length),
		new Uint16Array(golden.length),
		Object.create(Uint8Array.prototype),
		new Proxy(golden, { get: hook, getPrototypeOf: hook }),
		{
			[Symbol.toStringTag]: "Uint8Array",
			get buffer() {
				return hook();
			},
		},
	])
		rejects(input);
	expect(hook).not.toHaveBeenCalled();
});

it("rejects shared and detached byte storage with fixed registration errors", () => {
	const golden = registration();
	const shared = new Uint8Array(new SharedArrayBuffer(golden.length));
	shared.set(golden);
	rejects(shared);
	expect(shared).toEqual(golden);
	const detached = golden.slice();
	structuredClone(detached.buffer, { transfer: [detached.buffer] });
	rejects(detached);
});

it("owns all returned bytes and float encodings independently across fields and calls", () => {
	const input = registration({
		flags: 0xc0,
		tail: [
			0xa1, 0x61, 0x78, 0x83, 0x42, 0xab, 0xcd, 0xf9, 0x3e, 0, 0xf9, 0x3e, 0,
		],
	});
	const original = input.slice();
	const first = decodeCtapRegistrationAuthenticatorData(input);
	const second = decodeCtapRegistrationAuthenticatorData(input);
	const expected = decodeCtapRegistrationAuthenticatorData(original);
	const firstBuffers = resultBuffers(first);
	const secondBuffers = resultBuffers(second);
	expect(firstBuffers).toHaveLength(9);
	expect(
		new Set([...firstBuffers, ...secondBuffers].map((bytes) => bytes.buffer))
			.size,
	).toBe(18);
	for (const [index, bytes] of firstBuffers.entries()) {
		expect(bytes.buffer).not.toBe(input.buffer);
		bytes.fill(0);
		for (
			let untouched = index + 1;
			untouched < firstBuffers.length;
			untouched++
		)
			expect(firstBuffers[untouched]).toEqual(secondBuffers[untouched]);
	}
	expect(input).toEqual(original);
	expect(second).toEqual(expected);
	input.fill(0);
	expect(second).toEqual(expected);
});

it.each(["success", "late-extension-key-error"] as const)(
	"wipes reachable intermediates but not caller or returned storage on %s",
	(outcome) => {
		const prefix = vi.spyOn(
			credentialKeys,
			"decodeCtapCredentialPublicKeyPrefix",
		);
		const cborPrefix = vi.spyOn(ctapCbor, "decodeCtapCborPrefix");
		const cborStrict = vi.spyOn(ctapCbor, "decodeCtapCbor");
		const input = registration({
			flags: 0xc0,
			tail: [
				0xa1,
				...(outcome === "success" ? [0x61, 0x78] : [0x60]),
				0x82,
				0x42,
				0xab,
				0xcd,
				0xf9,
				0x3e,
				0,
			],
		});
		const original = input.slice();
		const wipes: { target: Uint8Array; before: Uint8Array }[] = [];
		const intrinsicFill = Uint8Array.prototype.fill;
		const intrinsicSlice = Uint8Array.prototype.slice;
		const sliced = vi.spyOn(Uint8Array.prototype, "slice");
		const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
		const fill = vi
			.spyOn(Uint8Array.prototype, "fill")
			.mockImplementation(function (
				this: Uint8Array,
				value: number,
				start?: number,
				end?: number,
			) {
				if (value === 0)
					wipes.push({ target: this, before: intrinsicSlice.call(this) });
				return intrinsicFill.call(this, value, start, end);
			});
		let result:
			| ReturnType<typeof decodeCtapRegistrationAuthenticatorData>
			| undefined;
		try {
			if (outcome === "success")
				result = decodeCtapRegistrationAuthenticatorData(input);
			else rejects(input);
		} finally {
			fill.mockRestore();
		}
		const allocated: Uint8Array[] = [
			...sliced.mock.results.flatMap((allocation) =>
				allocation.type === "return" ? [allocation.value] : [],
			),
			...copied.mock.results.flatMap((allocation) =>
				allocation.type === "return" ? [allocation.value] : [],
			),
		];
		sliced.mockRestore();
		copied.mockRestore();
		expect(prefix).toHaveBeenCalledTimes(1);
		const decodedKey = prefix.mock.results[0];
		expect(decodedKey.type).toBe("return");
		if (decodedKey.type !== "return")
			throw new Error("Expected real key output");
		expect(decodedKey.value.bytesRead).toBe(keyWire.length);
		const returned = result === undefined ? [] : resultBuffers(result);
		const trees: CtapCborValue[] = [
			...cborPrefix.mock.results.flatMap((decoded) =>
				decoded.type === "return" ? [decoded.value.value] : [],
			),
			...cborStrict.mock.results.flatMap((decoded) =>
				decoded.type === "return" ? [decoded.value] : [],
			),
		];
		const decodedBuffers = trees.flatMap(treeBuffers);
		expect(decodedBuffers.length).toBeGreaterThanOrEqual(4);
		const intermediate = [...decodedBuffers, ...allocated].filter(
			(bytes) => !returned.some((kept) => kept.buffer === bytes.buffer),
		);
		expect(intermediate.length).toBeGreaterThanOrEqual(
			outcome === "success" ? 2 : 4,
		);
		for (const bytes of intermediate) {
			expect(bytes).toEqual(new Uint8Array(bytes.length));
			expect(
				wipes.some(
					(wipe) =>
						wipe.target === bytes && wipe.before.some((byte) => byte !== 0),
				),
			).toBe(true);
		}
		const inputWipes = wipes.filter(
			(wipe) =>
				wipe.before.length === original.length &&
				wipe.before.every((byte, index) => byte === original[index]),
		);
		expect(inputWipes.length).toBeGreaterThanOrEqual(1);
		for (const wipe of wipes) {
			expect(wipe.target.buffer).not.toBe(input.buffer);
			expect(
				returned.some((bytes) => bytes.buffer === wipe.target.buffer),
			).toBe(false);
			expect(wipe.target).toEqual(new Uint8Array(wipe.target.length));
		}
		if (outcome !== "success") {
			const selected = keyBuffers(decodedKey.value.publicKey);
			expect(selected).toHaveLength(2);
			for (const [index, bytes] of selected.entries()) {
				expect(bytes).toEqual(new Uint8Array(32));
				expect(wipes.find((wipe) => wipe.target === bytes)?.before).toEqual(
					new Uint8Array(index === 0 ? coordinateX : coordinateY),
				);
			}
		} else {
			expect(result).toEqual(decodeCtapRegistrationAuthenticatorData(original));
		}
		expect(input).toEqual(original);
	},
);

it("wipes an owned input on early flag rejection without touching the caller", () => {
	const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
	const input = registration({ flags: 0 });
	const original = input.slice();
	rejects(input);
	const copies = copied.mock.results.filter(
		(result) => result.type === "return",
	);
	expect(copies.length).toBeGreaterThanOrEqual(1);
	for (const copy of copies) {
		expect(copy.value.buffer).not.toBe(input.buffer);
		expect(copy.value).toEqual(new Uint8Array(copy.value.length));
	}
	expect(input).toEqual(original);
});

it("redacts unexpected key-decoder failures into fresh registration errors", () => {
	const internal = new Error("SYNTHETIC_PRIVATE");
	vi.spyOn(
		credentialKeys,
		"decodeCtapCredentialPublicKeyPrefix",
	).mockImplementation(() => {
		throw internal;
	});
	const first = rejects(registration());
	const second = rejects(registration());
	expect(first).not.toBe(internal);
	expect(second).not.toBe(first);
});
