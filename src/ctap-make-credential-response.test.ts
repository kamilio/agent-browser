import { afterEach, expect, it, vi } from "vitest";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import {
	type CtapCredentialResponse,
	decodeCtapMakeCredentialResponse,
	wipeCtapCredentialResponse,
} from "./ctap-make-credential-response.js";
import * as registrationData from "./ctap-registration-authenticator-data.js";
import type { CtapRegistrationAuthenticatorData } from "./ctap-registration-authenticator-data.js";
import { AgentBrowserError } from "./errors.js";

type RejectionCode = "invalid-input" | "resource-limit" | "unsupported";

const messages = {
	"invalid-input": "Invalid CTAP MakeCredential response.",
	"resource-limit": "CTAP MakeCredential response limit exceeded.",
	unsupported: "Unsupported CTAP MakeCredential response.",
};
const hashWire = Array.from({ length: 32 }, (_value, index) => index + 1);
const aaguidWire = Array.from({ length: 16 }, (_value, index) => 0x80 + index);
const identifierWire = [0x91, 0x92, 0x93];
const coordinateX = Array.from({ length: 32 }, (_value, index) => index + 1);
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
const compressedKeyWire = [
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
	0xf5,
];
const okpKeyWire = [
	0xa4,
	0x01,
	0x01,
	0x03,
	0x27,
	0x20,
	0x06,
	0x21,
	0x58,
	0x20,
	...coordinateX,
];
const rsaKeyWire = [
	0xa4,
	0x01,
	0x03,
	0x03,
	0x39,
	0x01,
	0x00,
	0x20,
	0x59,
	0x01,
	0x00,
	...Array.from({ length: 256 }, () => 0x91),
	0x21,
	0x43,
	0x01,
	0x00,
	0x01,
];
const richStatement = map(
	[0x01, 0x07],
	[0x02, 0x21],
	[0x03, ...text("opaque")],
	[0x04, 0xf6],
	[0x05, 0x40],
	[
		0x06, 0x83, 0x42, 0xa1, 0xa2, 0xf9, 0x3e, 0x00, 0xa1, 0x41, 0xaa, 0x41,
		0xbb,
	],
	[0x07, 0xfa, 0x3f, 0xc0, 0x00, 0x00],
	[0x08, 0xfb, 0x3f, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
	[0x09, 0xf9, 0x7e, 0x01],
	[0x0a, 0xf9, 0x80, 0x00],
	[0x41, 0xcc, 0x82, 0xf4, 0x41, 0xdd],
	[0xf9, 0x45, 0x80, 0x41, 0xee],
);
const extensionWire = map([
	...text("ext"),
	0x82,
	0x42,
	0xab,
	0xcd,
	0xf9,
	0x3e,
	0x00,
]);

afterEach(() => {
	vi.restoreAllMocks();
});

function header(major: number, length: number): number[] {
	if (length < 24) return [major | length];
	if (length < 256) return [major | 24, length];
	return [major | 25, length >>> 8, length & 0xff];
}

function bytes(value: readonly number[] | Uint8Array): number[] {
	return [...header(0x40, value.length), ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...header(0x60, encoded.length), ...encoded];
}

function map(...entries: readonly (readonly number[])[]): number[] {
	return [...header(0xa0, entries.length), ...entries.flat()];
}

function registration({
	flags = 0x40,
	identifier = identifierWire,
	key = keyWire,
	tail = [],
}: {
	flags?: number;
	identifier?: readonly number[];
	key?: readonly number[];
	tail?: readonly number[];
} = {}): number[] {
	return [
		...hashWire,
		flags,
		0x12,
		0x34,
		0x56,
		0x78,
		...aaguidWire,
		identifier.length >>> 8,
		identifier.length & 0xff,
		...identifier,
		...key,
		...tail,
	];
}

function fields({
	format = text("none"),
	data = bytes(registration()),
	statement = [0xa0],
}: {
	format?: readonly number[];
	data?: readonly number[];
	statement?: readonly number[];
} = {}): number[][] {
	return [
		[1, ...format],
		[2, ...data],
		[3, ...statement],
	];
}

function packet(
	status = 0,
	body: readonly number[] = map(...fields()),
): Uint8Array {
	return new Uint8Array([status, ...body]);
}

function credential(input = packet()): CtapCredentialResponse {
	const result = decodeCtapMakeCredentialResponse(input);
	expect(result.kind).toBe("credential");
	if (result.kind !== "credential")
		throw new Error("Expected synthetic credential");
	return result.credential;
}

function rejects(
	input: unknown,
	code: RejectionCode = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		decodeCtapMakeCredentialResponse(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic response rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(messages[code]);
	expect(caught.cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	return caught;
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

function treeObjects(value: CtapCborValue): object[] {
	if (value.kind === "array")
		return [value, value.items, ...value.items.flatMap(treeObjects)];
	if (value.kind === "map")
		return [
			value,
			value.entries,
			...value.entries.flatMap((entry) => [
				entry,
				...treeObjects(entry[0]),
				...treeObjects(entry[1]),
			]),
		];
	return [value];
}

function registrationBuffers(
	data: CtapRegistrationAuthenticatorData,
): Uint8Array[] {
	const key = data.credentialPublicKey;
	const coordinates =
		key.kind === "rsa"
			? [key.modulus, key.exponent]
			: key.kind === "ec2" && typeof key.y !== "boolean"
				? [key.x, key.y]
				: [key.x];
	return [
		data.rpIdHash,
		data.aaguid,
		data.credentialId,
		data.credentialPublicKeyBytes,
		...coordinates,
		...(data.extensions === undefined ? [] : treeBuffers(data.extensions)),
	];
}

function resultBuffers(result: CtapCredentialResponse): Uint8Array[] {
	return [
		result.authenticatorData,
		...treeBuffers(result.attestationStatement),
		...registrationBuffers(result.attestedCredentialData),
	];
}

function observeAllocations() {
	const allocations: { target: Uint8Array; before: Uint8Array }[] = [];
	const trees: CtapCborValue[] = [];
	const parsed: CtapRegistrationAuthenticatorData[] = [];
	const remember = (target: Uint8Array): Uint8Array => {
		allocations.push({ target, before: new Uint8Array(target) });
		return target;
	};
	const copy = ctapCbor.copyCtapBytes;
	const decode = ctapCbor.decodeCtapCbor;
	const parse = registrationData.decodeCtapRegistrationAuthenticatorData;
	const slice = Uint8Array.prototype.slice;
	vi.spyOn(ctapCbor, "copyCtapBytes").mockImplementation((input) =>
		remember(copy(input)),
	);
	vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function (
		this: Uint8Array,
		start?: number,
		end?: number,
	) {
		const result = slice.call(this, start, end);
		remember(result);
		return result;
	});
	vi.spyOn(ctapCbor, "decodeCtapCbor").mockImplementation((input) => {
		const root = decode(input);
		trees.push(root);
		for (const buffer of treeBuffers(root)) remember(buffer);
		return root;
	});
	vi.spyOn(
		registrationData,
		"decodeCtapRegistrationAuthenticatorData",
	).mockImplementation((input) => {
		const result = parse(input);
		parsed.push(result);
		for (const buffer of registrationBuffers(result)) remember(buffer);
		return result;
	});
	return { allocations, trees, parsed };
}

it("decodes the extracted fmt1/authData2/attStmt3 layout from independent wire", () => {
	expect(credential()).toEqual({
		format: "none",
		authenticatorData: new Uint8Array(registration()),
		attestationStatement: { kind: "map", entries: [] },
		attestedCredentialData: {
			rpIdHash: new Uint8Array(hashWire),
			flags: 0x40,
			signatureCounter: 0x12345678,
			aaguid: new Uint8Array(aaguidWire),
			credentialId: new Uint8Array(identifierWire),
			credentialPublicKey: {
				kind: "ec2",
				algorithm: -7,
				curve: 1,
				x: new Uint8Array(coordinateX),
				y: new Uint8Array(coordinateY),
			},
			credentialPublicKeyBytes: new Uint8Array(keyWire),
		},
	});
});

it("accepts a nonempty unknown format without interpreting its statement", () => {
	const result = credential(
		packet(
			0,
			map(
				...fields({
					format: text("synthetic-unknown"),
					statement: richStatement,
				}),
			),
		),
	);
	expect(result.format).toBe("synthetic-unknown");
	expect(result.attestationStatement).toEqual(
		ctapCbor.decodeCtapCbor(new Uint8Array(richStatement)),
	);
	expect(Object.keys(result).sort()).toEqual([
		"attestationStatement",
		"attestedCredentialData",
		"authenticatorData",
		"format",
	]);
});

it("preserves raw half/single/double floats, NaN payloads and negative zero", () => {
	const result = credential(
		packet(0, map(...fields({ statement: richStatement }))),
	);
	const floats = result.attestationStatement.entries.flatMap(([_key, value]) =>
		value.kind === "float" ? [value] : [],
	);
	expect(floats.map((value) => [...value.encoding])).toEqual([
		[0xfa, 0x3f, 0xc0, 0, 0],
		[0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0],
		[0xf9, 0x7e, 1],
		[0xf9, 0x80, 0],
	]);
	expect(Number.isNaN(floats[2].value)).toBe(true);
	expect(Object.is(floats[3].value, -0)).toBe(true);
});

it("accepts formats through 64 UTF16 units, not merely 64 UTF8 bytes", () => {
	for (const format of ["x", "x".repeat(64), "é".repeat(64), "😀".repeat(32)])
		expect(
			credential(packet(0, map(...fields({ format: text(format) })))).format,
		).toBe(format);
});

it("rejects formats above 64 UTF16 units as resource limits", () => {
	for (const format of ["x".repeat(65), `${"😀".repeat(32)}x`])
		rejects(
			packet(0, map(...fields({ format: text(format) }))),
			"resource-limit",
		);
});

it("rejects empty or non-text formats", () => {
	for (const format of [[0x60], [0x40], [0x01], [0x80], [0xa0], [0xf4], [0xf6]])
		rejects(packet(0, map(...fields({ format }))));
});

it.each([1, 2, 3])("requires response field %s", (missing) => {
	rejects(packet(0, map(...fields().filter((entry) => entry[0] !== missing))));
});

it("requires authenticatorData to be a nonempty byte string", () => {
	for (const data of [[0x40], [0x60], [0x01], [0x80], [0xa0], [0xf5]])
		rejects(packet(0, map(...fields({ data }))));
});

it("requires an attestation statement map without accepting other CBOR types", () => {
	for (const statement of [[0x40], [0x60], [0x01], [0x80], [0xf6]])
		rejects(packet(0, map(...fields({ statement }))));
});

it("rejects the historical swapped fmt/authData mapping", () => {
	rejects(
		packet(
			0,
			map(
				...fields({
					format: bytes(registration()),
					data: text("none"),
				}),
			),
		),
	);
});

it("accepts every nonzero CTAP status without a suffix", () => {
	for (let status = 1; status <= 255; status++)
		expect(decodeCtapMakeCredentialResponse(new Uint8Array([status]))).toEqual({
			kind: "ctap-error",
			status,
		});
});

it("validates but never interprets fields in a CTAP error map", () => {
	const parse = vi.spyOn(
		registrationData,
		"decodeCtapRegistrationAuthenticatorData",
	);
	for (const body of [
		[0xa0],
		map([1, 0xf6], [2, 0x01], [3, 0x80], [4, 0xf5], [5, 0x40]),
	])
		expect(decodeCtapMakeCredentialResponse(packet(0x2e, body))).toEqual({
			kind: "ctap-error",
			status: 0x2e,
		});
	expect(parse).not.toHaveBeenCalled();
});

it.each([
	{ name: "non-map", body: [0x80] },
	{ name: "truncated map", body: [0xa1, 1] },
	{ name: "trailing item", body: [0xa0, 0xa0] },
	{ name: "indefinite map", body: [0xbf, 0xff] },
	{ name: "overlong map count", body: [0xb8, 0] },
	{ name: "out-of-order keys", body: [0xa2, 2, 0, 1, 0] },
	{ name: "duplicate keys", body: [0xa2, 1, 0, 1, 0] },
])("rejects a CTAP error suffix with $name", ({ body }) => {
	rejects(packet(0x2e, body));
});

it("requires exactly one map after status zero", () => {
	for (const body of [
		[],
		[0xa0],
		[0x80],
		[0x40],
		[0xf6],
		[...map(...fields()), 0],
	])
		rejects(packet(0, body));
});

it("rejects every truncation of a complete credential response", () => {
	const input = packet(0, map(...fields({ statement: richStatement })));
	for (let length = 0; length < input.length; length++)
		rejects(input.subarray(0, length));
});

it("fully validates malformed unknown fields rather than skipping them", () => {
	for (const unknown of [
		[0x18, 0x01],
		[0xc0, 0],
		[0x61, 0xff],
		[0x9f, 0xff],
		[0xa2, 2, 0, 1, 0],
		[0xa2, 1, 0, 1, 0],
	])
		rejects(packet(0, map(...fields(), [6, ...unknown])));
});

it("preserves unsupported classification for compound CBOR map keys", () => {
	for (const status of [0, 0x2e])
		rejects(
			packet(status, map(...fields(), [6, 0xa1, 0x80, 0])),
			"unsupported",
		);
});

it("preserves depth resource limits in statements and unknown fields", () => {
	const deep = [0x81, 0x81, 0x81, 0x80];
	rejects(packet(0, map(...fields(), [6, ...deep])), "resource-limit");
	rejects(
		packet(0, map(...fields({ statement: map([1, ...deep]) }))),
		"resource-limit",
	);
	rejects(packet(0x2e, map([6, ...deep])), "resource-limit");
});

it("discards valid unknown numeric, text, byte and fractional-float fields", () => {
	const result = credential(
		packet(
			0,
			map(
				...fields(),
				[6, ...richStatement],
				[0x20, 0xf5],
				[0x41, 0xaa, 0x41, 0xbb],
				[...text("fmt"), ...text("not-a-replacement")],
				[0xf9, 0x3e, 0x00, 0x41, 0xcc],
			),
		),
	);
	expect(result).toEqual(credential());
});

it("accepts epAtt false and omits it from the returned DTO", () => {
	const result = credential(packet(0, map(...fields(), [4, 0xf4])));
	expect(result).toEqual(credential());
	expect(result).not.toHaveProperty("epAtt");
});

it("rejects epAtt true as unsupported without enterprise policy", () => {
	rejects(packet(0, map(...fields(), [4, 0xf5])), "unsupported");
});

it("requires epAtt to be a CBOR boolean, not a truthy or falsy value", () => {
	for (const value of [
		[0],
		[1],
		[0x40],
		[0x60],
		[0xf6],
		[0xf7],
		[0xa0],
		[0xf9, 0, 0],
	])
		rejects(packet(0, map(...fields(), [4, ...value])));
});

it.each([0, 1, 32])(
	"rejects every largeBlobKey byte length including %s as unsupported",
	(length) => {
		rejects(
			packet(
				0,
				map(...fields(), [5, ...bytes(new Uint8Array(length).fill(0xab))]),
			),
			"unsupported",
		);
	},
);

it("requires largeBlobKey to be bytes before classifying it as unsupported", () => {
	for (const value of [[0], [0x60], [0xf4], [0xf6], [0x80], [0xa0]])
		rejects(packet(0, map(...fields(), [5, ...value])));
});

it.each([
	{ number: 1, key: [0xf9, 0x3c, 0x00] },
	{ number: 2, key: [0xfa, 0x40, 0x00, 0x00, 0x00] },
	{ number: 3, key: [0xfb, 0x40, 0x08, 0, 0, 0, 0, 0, 0] },
])(
	"recognizes integer-valued float field $number with its original encoding",
	({ number, key }) => {
		const entries = fields();
		const selected = entries[number - 1];
		const result = credential(
			packet(
				0,
				map(...entries.filter((entry) => entry[0] !== number), [
					...key,
					...selected.slice(1),
				]),
			),
		);
		expect(result).toEqual(credential());
	},
);

it("recognizes float-equivalent optional keys and applies their policy", () => {
	expect(
		credential(packet(0, map(...fields(), [0xf9, 0x44, 0, 0xf4]))),
	).toEqual(credential());
	for (const optional of [
		[0xf9, 0x44, 0, 0xf5],
		[0xf9, 0x45, 0, 0x40],
	])
		rejects(packet(0, map(...fields(), optional)), "unsupported");
});

it("rejects duplicate numeric keys across integer and float encodings", () => {
	for (const status of [0, 0x2e])
		rejects(packet(status, map(...fields(), [0xf9, 0x3c, 0, ...text("none")])));
});

it("does not interpret text, negative or fractional keys as required fields", () => {
	for (const key of [text("1"), [0x20], [0xf9, 0x3e, 0]])
		rejects(packet(0, map(...fields().slice(1), [...key, ...text("none")])));
});

it("uses the real registration decoder for flags, ID bounds and embedded key validation", () => {
	for (const data of [
		registration({ flags: 0 }),
		registration({ flags: 0x50 }),
		registration({ identifier: [] }),
		registration({ key: [0xa0] }),
		registration({ key: keyWire.slice(0, -1) }),
		registration({ tail: [0] }),
		registration({ flags: 0xc0 }),
	])
		rejects(packet(0, map(...fields({ data: bytes(data) }))));
});

it("preserves real embedded public-key unsupported errors", () => {
	const key = [...keyWire];
	key[4] = 0x28;
	rejects(
		packet(0, map(...fields({ data: bytes(registration({ key })) }))),
		"unsupported",
	);
});

it("preserves actual registration credential-ID resource limits", () => {
	const data = registration({
		identifier: Array.from({ length: 1024 }, () => 0x91),
	});
	rejects(packet(0, map(...fields({ data: bytes(data) }))), "resource-limit");
});

it("keeps typed COSE field labels stricter than response field numbers", () => {
	const key = [...keyWire];
	key.splice(1, 2);
	key.push(0xf9, 0x3c, 0, 2);
	rejects(packet(0, map(...fields({ data: bytes(registration({ key })) }))));
});

it("delegates all supported key shapes without imposing point or signature trust", () => {
	for (const [key, kind] of [
		[keyWire, "ec2"],
		[compressedKeyWire, "ec2"],
		[okpKeyWire, "okp"],
		[rsaKeyWire, "rsa"],
	] as const) {
		const result = credential(
			packet(0, map(...fields({ data: bytes(registration({ key })) }))),
		);
		expect(result.attestedCredentialData.credentialPublicKey.kind).toBe(kind);
		expect(result.attestedCredentialData.credentialPublicKeyBytes).toEqual(
			new Uint8Array(key),
		);
		expect(result).not.toHaveProperty("userConsented");
		expect(result).not.toHaveProperty("registered");
		expect(result).not.toHaveProperty("attestationObject");
	}
});

it("retains parsed extensions for transaction policy rather than claiming they were requested", () => {
	for (const tail of [[0xa0], extensionWire]) {
		const result = credential(
			packet(
				0,
				map(
					...fields({
						data: bytes(registration({ flags: 0xc0, tail })),
					}),
				),
			),
		);
		expect(result.attestedCredentialData.extensions).toEqual(
			ctapCbor.decodeCtapCbor(new Uint8Array(tail)),
		);
	}
});

it("accepts the inclusive 7609-byte whole response cap including status", () => {
	const base = packet(0, map(...fields(), [6, ...bytes([])])).length;
	const body = map(...fields(), [
		6,
		...bytes(new Uint8Array(7609 - base - 2).fill(0xab)),
	]);
	expect(packet(0, body)).toHaveLength(7609);
	expect(credential(packet(0, body)).format).toBe("none");
	expect(decodeCtapMakeCredentialResponse(packet(0x2e, body))).toEqual({
		kind: "ctap-error",
		status: 0x2e,
	});
});

it("rejects 7610-byte responses before CBOR decoding even for CTAP errors", () => {
	const base = packet(0, map(...fields(), [6, ...bytes([])])).length;
	const body = map(...fields(), [
		6,
		...bytes(new Uint8Array(7610 - base - 2).fill(0xab)),
	]);
	const decoded = vi.spyOn(ctapCbor, "decodeCtapCbor");
	for (const status of [0, 0x2e]) {
		const input = packet(status, body);
		expect(input).toHaveLength(7610);
		rejects(input, "resource-limit");
	}
	expect(decoded).not.toHaveBeenCalled();
});

it("copies only an offset view and leaves the larger backing buffer intact", () => {
	const input = packet();
	const backing = new Uint8Array(8000).fill(0xee);
	backing.set(input, 137);
	const before = backing.slice();
	expect(credential(backing.subarray(137, 137 + input.length))).toEqual(
		credential(input),
	);
	expect(backing).toEqual(before);
});

it("accepts intrinsic Uint8Array and Buffer storage without calling own shadows", () => {
	const input = packet();
	const expected = credential(input);
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const source of [input.slice(), Buffer.from(input)]) {
		for (const property of [
			"length",
			"byteLength",
			"byteOffset",
			"buffer",
			"constructor",
			"fill",
			"slice",
			"subarray",
			"at",
			"values",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(source, property, { get: hook });
		expect(credential(source)).toEqual(expected);
	}
	expect(hook).not.toHaveBeenCalled();
});

it("rejects wrong brands, forged views and proxies without caller hooks", () => {
	const input = packet();
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const source of [
		null,
		undefined,
		[],
		{},
		new Uint8Array(0),
		input.buffer,
		new DataView(input.buffer),
		new Int8Array(input.length),
		new Uint8ClampedArray(input.length),
		new Uint16Array(input.length),
		Object.create(Uint8Array.prototype),
		new Proxy(input, { get: hook, getPrototypeOf: hook }),
		{
			[Symbol.toStringTag]: "Uint8Array",
			get buffer() {
				return hook();
			},
		},
	])
		rejects(source);
	expect(hook).not.toHaveBeenCalled();
});

it("rejects SharedArrayBuffer storage", () => {
	const input = packet();
	const shared = new Uint8Array(new SharedArrayBuffer(input.length));
	shared.set(input);
	rejects(shared);
	expect(shared).toEqual(input);
});

it("rejects detached input with a fixed response error", () => {
	const input = packet();
	structuredClone(input.buffer, { transfer: [input.buffer] });
	rejects(input);
});

it("deeply owns statement nodes, containers and buffers independently of every source", () => {
	const input = packet(
		0,
		map(
			...fields({
				statement: richStatement,
				data: bytes(registration({ flags: 0xc0, tail: extensionWire })),
			}),
		),
	);
	const before = input.slice();
	const observed = observeAllocations();
	const result = credential(input);
	vi.restoreAllMocks();
	const buffers = resultBuffers(result);
	expect(new Set(buffers.map((buffer) => buffer.buffer)).size).toBe(
		buffers.length,
	);
	for (const buffer of buffers) expect(buffer.buffer).not.toBe(input.buffer);
	const sourceObjects = new Set(treeObjects(observed.trees[0]));
	for (const object of treeObjects(result.attestationStatement))
		expect(sourceObjects.has(object)).toBe(false);
	const sourceBuffers = treeBuffers(observed.trees[0]);
	for (const buffer of buffers)
		for (const source of sourceBuffers)
			expect(buffer.buffer).not.toBe(source.buffer);
	const snapshots = buffers.map((buffer) => buffer.slice());
	for (const [index, buffer] of buffers.entries()) {
		buffer.fill(0);
		for (const [otherIndex, other] of buffers.entries())
			if (index !== otherIndex) expect(other).toEqual(snapshots[otherIndex]);
		buffer.set(snapshots[index]);
	}
	expect(input).toEqual(before);
	input.fill(0);
	for (const [index, buffer] of buffers.entries())
		expect(buffer).toEqual(snapshots[index]);
});

it.each([
	"success",
	"ctap-error",
	"invalid-option",
	"unsupported-option",
] as const)(
	"wipes real observed owned input, unknown trees and abandoned outputs on %s",
	(outcome) => {
		const input = packet(
			outcome === "ctap-error" ? 0x2e : 0,
			map(
				...fields({
					statement: richStatement,
					data: bytes(registration({ flags: 0xc0, tail: extensionWire })),
				}),
				...(outcome === "invalid-option"
					? [[4, 0xf6]]
					: outcome === "unsupported-option"
						? [[5, 0x42, 0xac, 0xad]]
						: []),
				[6, ...richStatement],
			),
		);
		const original = input.slice();
		const observed = observeAllocations();
		let result: CtapCredentialResponse | undefined;
		try {
			if (outcome === "success") result = credential(input);
			else if (outcome === "ctap-error")
				expect(decodeCtapMakeCredentialResponse(input)).toEqual({
					kind: "ctap-error",
					status: 0x2e,
				});
			else
				rejects(
					input,
					outcome === "invalid-option" ? "invalid-input" : "unsupported",
				);
		} finally {
			vi.restoreAllMocks();
		}
		const returned = result === undefined ? [] : resultBuffers(result);
		const abandoned = observed.allocations.filter(
			({ target }) => !returned.includes(target),
		);
		expect(abandoned.length).toBeGreaterThan(10);
		for (const { target, before } of abandoned) {
			expect(target.buffer).not.toBe(input.buffer);
			expect(target).toEqual(new Uint8Array(before.length));
			if (before.length !== 0)
				expect(before.some((byte) => byte !== 0)).toBe(true);
		}
		expect(
			abandoned.some(
				({ before }) =>
					before.length === original.length &&
					before.every((byte, index) => byte === original[index]),
			),
		).toBe(true);
		for (const target of treeBuffers(observed.trees[0])) {
			expect(target).toEqual(new Uint8Array(target.length));
			expect(abandoned.some((allocation) => allocation.target === target)).toBe(
				true,
			);
		}
		expect(observed.parsed).toHaveLength(outcome === "ctap-error" ? 0 : 1);
		if (outcome === "invalid-option" || outcome === "unsupported-option")
			for (const target of registrationBuffers(observed.parsed[0]))
				expect(target).toEqual(new Uint8Array(target.length));
		if (result !== undefined) {
			expect(result.attestationStatement).toEqual(
				ctapCbor.decodeCtapCbor(new Uint8Array(richStatement)),
			);
			expect(result.attestedCredentialData.credentialId).toEqual(
				new Uint8Array(identifierWire),
			);
		}
		expect(input).toEqual(original);
	},
);

it.each([
	{ name: "ec2", key: keyWire },
	{ name: "compressed ec2", key: compressedKeyWire },
	{ name: "okp", key: okpKeyWire },
	{ name: "rsa", key: rsaKeyWire },
])(
	"cleanup tolerates detached storage and fill shadows across $name data",
	({ key }) => {
		const input = packet(
			0,
			map(
				...fields({
					statement: richStatement,
					data: bytes(registration({ key, flags: 0xc0, tail: extensionWire })),
				}),
			),
		);
		const original = input.slice();
		const result = credential(input);
		const buffers = resultBuffers(result);
		const detached = [
			result.authenticatorData,
			treeBuffers(result.attestationStatement)[1],
			result.attestedCredentialData.rpIdHash,
		];
		const snapshots = buffers.map((buffer) => ({
			target: buffer,
			before: buffer.slice(),
		}));
		const hook = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		for (const buffer of buffers)
			Object.defineProperty(buffer, "fill", { get: hook });
		for (const buffer of detached)
			structuredClone(buffer.buffer, { transfer: [buffer.buffer] });
		const fill = vi
			.spyOn(Uint8Array.prototype, "fill")
			.mockImplementation(hook);
		try {
			expect(() => wipeCtapCredentialResponse(result)).not.toThrow();
			expect(() => wipeCtapCredentialResponse(result)).not.toThrow();
		} finally {
			fill.mockRestore();
		}
		expect(hook).not.toHaveBeenCalled();
		for (const { target, before } of snapshots) {
			if (detached.includes(target)) expect(target.byteLength).toBe(0);
			else {
				expect(target).toEqual(new Uint8Array(before.length));
				if (before.length !== 0)
					expect(before.some((byte) => byte !== 0)).toBe(true);
			}
		}
		expect(input).toEqual(original);
	},
);

it("sanitizes unexpected downstream failures and keeps recognized classifications", () => {
	for (const [error, code] of [
		[new Error("SYNTHETIC_PRIVATE"), "invalid-input"],
		[new AgentBrowserError("unsupported", "SYNTHETIC_PRIVATE"), "unsupported"],
		[
			new AgentBrowserError("resource-limit", "SYNTHETIC_PRIVATE"),
			"resource-limit",
		],
	] as const) {
		vi.spyOn(
			registrationData,
			"decodeCtapRegistrationAuthenticatorData",
		).mockImplementationOnce(() => {
			throw error;
		});
		rejects(packet(), code);
		vi.restoreAllMocks();
	}
});

it("wipes owned input and reachable trees on early exits without parsing data", () => {
	for (const input of [
		new Uint8Array([0x2e]),
		packet(0, [0x82, 0x41, 0xab, 0xf9, 0x3e, 0]),
		packet(0, map(...fields({ format: text("x".repeat(65)) }))),
	]) {
		const original = input.slice();
		const observed = observeAllocations();
		try {
			if (input[0] === 0x2e)
				expect(decodeCtapMakeCredentialResponse(input)).toEqual({
					kind: "ctap-error",
					status: 0x2e,
				});
			else
				rejects(input, input[1] === 0x82 ? "invalid-input" : "resource-limit");
		} finally {
			vi.restoreAllMocks();
		}
		expect(observed.parsed).toHaveLength(0);
		expect(observed.allocations.length).toBeGreaterThan(0);
		for (const { target, before } of observed.allocations) {
			expect(before.some((byte) => byte !== 0)).toBe(true);
			expect(target).toEqual(new Uint8Array(before.length));
		}
		expect(input).toEqual(original);
	}
});
