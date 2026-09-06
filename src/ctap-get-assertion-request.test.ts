import { afterEach, expect, it, vi } from "vitest";
import * as ctapCborEncoder from "./ctap-cbor-encoder.js";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import {
	type CtapGetAssertionCredential,
	type CtapGetAssertionRequest,
	encodeCtapGetAssertionRequest,
} from "./ctap-get-assertion-request.js";
import { AgentBrowserError } from "./errors.js";

const hashWire = [
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
	0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
	0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
];
const rpWire = [
	0x6b, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x2e, 0x63, 0x6f, 0x6d,
];
const optionsWire = [0xa2, 0x62, 0x75, 0x70, 0xf5, 0x62, 0x75, 0x76, 0xf4];
const descriptorWire = [
	0xa2, 0x62, 0x69, 0x64, 0x42, 0x07, 0x08, 0x64, 0x74, 0x79, 0x70, 0x65, 0x6a,
	0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79,
];
const minimalWire = new Uint8Array([
	0x02,
	0xa3,
	0x01,
	...rpWire,
	0x02,
	0x58,
	0x20,
	...hashWire,
	0x05,
	...optionsWire,
]);
const allowedWire = new Uint8Array([
	0x02,
	0xa4,
	0x01,
	...rpWire,
	0x02,
	0x58,
	0x20,
	...hashWire,
	0x03,
	0x81,
	...descriptorWire,
	0x05,
	...optionsWire,
]);
const maximumUnsigned = (1n << 64n) - 1n;

afterEach(() => {
	vi.restoreAllMocks();
});

function credential(): CtapGetAssertionCredential {
	return { type: "public-key", id: new Uint8Array([7, 8]) };
}

function request(): CtapGetAssertionRequest {
	return {
		rpId: "example.com",
		clientDataHash: new Uint8Array(hashWire),
	};
}

function rejects(
	input: unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
	maxMessageSize?: unknown,
): AgentBrowserError {
	let caught: unknown;
	try {
		encodeCtapGetAssertionRequest(
			input as CtapGetAssertionRequest,
			maxMessageSize as bigint | undefined,
		);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code });
	expect((caught as Error).message).not.toContain("SYNTHETIC_PRIVATE");
	expect((caught as Error).cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	return caught as AgentBrowserError;
}

function parameters(wire: Uint8Array): CtapCborValue {
	expect(wire[0]).toBe(0x02);
	return ctapCbor.decodeCtapCbor(wire.subarray(1));
}

function field(value: CtapCborValue, key: bigint): CtapCborValue {
	if (value.kind !== "map") throw new Error("Expected synthetic map");
	const entry = value.entries.find(
		([candidate]) => candidate.kind === "unsigned" && candidate.value === key,
	);
	if (!entry) throw new Error("Expected synthetic map field");
	return entry[1];
}

it("matches independent exact command and canonical parameter bytes", () => {
	expect(encodeCtapGetAssertionRequest(request())).toEqual(minimalWire);
	expect(
		encodeCtapGetAssertionRequest({ ...request(), allowList: [credential()] }),
	).toEqual(allowedWire);
});

it("roundtrips typed fields without changing hash bytes or descriptor order", () => {
	const first = credential();
	const second: CtapGetAssertionCredential = {
		id: new Uint8Array([0xff]),
		type: "public-key",
	};
	const input: CtapGetAssertionRequest = {
		userVerification: true,
		allowList: [first, second],
		clientDataHash: new Uint8Array(hashWire),
		rpId: "example.com",
	};
	const expected: CtapCborValue = {
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 1n },
				{ kind: "text", value: "example.com" },
			],
			[
				{ kind: "unsigned", value: 2n },
				{ kind: "bytes", value: new Uint8Array(hashWire) },
			],
			[
				{ kind: "unsigned", value: 3n },
				{
					kind: "array",
					items: [first, second].map(
						(entry): CtapCborValue => ({
							kind: "map",
							entries: [
								[
									{ kind: "text", value: "id" },
									{ kind: "bytes", value: entry.id },
								],
								[
									{ kind: "text", value: "type" },
									{ kind: "text", value: "public-key" },
								],
							],
						}),
					),
				},
			],
			[
				{ kind: "unsigned", value: 5n },
				{
					kind: "map",
					entries: [
						[
							{ kind: "text", value: "up" },
							{ kind: "simple", value: 21 },
						],
						[
							{ kind: "text", value: "uv" },
							{ kind: "simple", value: 21 },
						],
					],
				},
			],
		],
	};
	expect(parameters(encodeCtapGetAssertionRequest(input))).toEqual(expected);
});

it.each([false, true])(
	"encodes explicit UV %s with UP always true",
	(userVerification) => {
		const expected = minimalWire.slice();
		expected[expected.length - 1] = userVerification ? 0xf5 : 0xf4;
		expect(
			encodeCtapGetAssertionRequest({ ...request(), userVerification }),
		).toEqual(expected);
	},
);

it("copies offset views and leaves frozen caller containers unchanged", () => {
	const hashBacking = new Uint8Array([0xee, ...hashWire, 0xff]);
	const idBacking = new Uint8Array([0xee, 7, 8, 0xff]);
	const entry = Object.freeze({
		type: "public-key" as const,
		id: idBacking.subarray(1, 3),
	});
	const allowList = Object.freeze([entry]);
	const input = Object.freeze({
		...request(),
		clientDataHash: hashBacking.subarray(1, 33),
		allowList,
	});
	const first = encodeCtapGetAssertionRequest(input);
	const second = encodeCtapGetAssertionRequest(input);
	expect(first).toEqual(allowedWire);
	expect(first.buffer).not.toBe(second.buffer);
	expect(first.buffer).not.toBe(hashBacking.buffer);
	expect(first.buffer).not.toBe(idBacking.buffer);
	expect(allowList[0]).toBe(entry);
	expect(hashBacking).toEqual(new Uint8Array([0xee, ...hashWire, 0xff]));
	expect(idBacking).toEqual(new Uint8Array([0xee, 7, 8, 0xff]));
	first.fill(0);
	expect(second).toEqual(allowedWire);
	expect(input.clientDataHash).toEqual(new Uint8Array(hashWire));
	expect(entry.id).toEqual(new Uint8Array([7, 8]));
	hashBacking.fill(0);
	idBacking.fill(0);
	expect(second).toEqual(allowedWire);
});

it.each([
	{ name: "default", maximum: undefined, size: 1024 },
	{ name: "negotiated", maximum: 2048n, size: 2048 },
	{ name: "HID ceiling", maximum: maximumUnsigned, size: 7609 },
])(
	"counts the command byte at the exact $name cap and one byte over",
	({ maximum, size }) => {
		const rpLength = size - 51;
		const input = { ...request(), rpId: "r".repeat(rpLength) };
		const wire = encodeCtapGetAssertionRequest(input, maximum);
		expect(wire).toHaveLength(size);
		expect(wire.subarray(0, 6)).toEqual(
			new Uint8Array([0x02, 0xa3, 0x01, 0x79, rpLength >>> 8, rpLength & 0xff]),
		);
		expect(field(parameters(wire), 1n)).toEqual({
			kind: "text",
			value: input.rpId,
		});
		rejects({ ...input, rpId: `${input.rpId}r` }, "resource-limit", maximum);
	},
);

it("accepts the exact minimal negotiated cap and rejects the parameters-only cap", () => {
	expect(encodeCtapGetAssertionRequest(request(), 60n)).toEqual(minimalWire);
	rejects(request(), "resource-limit", 59n);
	rejects(request(), "resource-limit", 1n);
});

it.each([
	0n,
	-1n,
	1n << 64n,
	1024,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"1024",
	null,
	true,
])("rejects invalid maxMessageSize %# without coercion", (maximum) => {
	rejects(request(), "invalid-input", maximum);
});

it("does not coerce boxed limits", () => {
	const coercion = vi.fn(() => 1024n);
	const maximum = Object(1024n);
	Object.defineProperty(maximum, Symbol.toPrimitive, { value: coercion });
	rejects(request(), "invalid-input", maximum);
	expect(coercion).not.toHaveBeenCalled();
});

it.each([
	{ rpId: "é.😀", wire: [0x67, 0xc3, 0xa9, 0x2e, 0xf0, 0x9f, 0x98, 0x80] },
	{ rpId: "e\u0301", wire: [0x63, 0x65, 0xcc, 0x81] },
	{ rpId: "é", wire: [0x62, 0xc3, 0xa9] },
	{ rpId: "\ufeff", wire: [0x63, 0xef, 0xbb, 0xbf] },
])(
	"preserves well-formed Unicode exactly without RP normalization %#",
	({ rpId, wire }) => {
		expect(encodeCtapGetAssertionRequest({ ...request(), rpId })).toEqual(
			new Uint8Array([
				0x02,
				0xa3,
				0x01,
				...wire,
				0x02,
				0x58,
				0x20,
				...hashWire,
				0x05,
				...optionsWire,
			]),
		);
	},
);

it.each(["\ud800", "\udc00", "host\ud800.invalid", "\udc00\ud800"])(
	"rejects malformed Unicode %#",
	(rpId) => {
		rejects({ ...request(), rpId });
	},
);

it("uses UTF-8 wire length rather than UTF-16 length for the message cap", () => {
	const input = { ...request(), rpId: "é".repeat(486) };
	expect(encodeCtapGetAssertionRequest(input)).toHaveLength(1023);
	expect(
		encodeCtapGetAssertionRequest({ ...input, rpId: `${input.rpId}r` }),
	).toHaveLength(1024);
	rejects({ ...input, rpId: `${input.rpId}é` }, "resource-limit");
});

it.each([7609, 7610])(
	"bounds RP allocation and final wire at %i UTF-16 units",
	(length) => {
		rejects(
			{ ...request(), rpId: "r".repeat(length) },
			"resource-limit",
			maximumUnsigned,
		);
	},
);

it("accepts 64 one-byte credentials in order and rejects 65", () => {
	const allowList: CtapGetAssertionCredential[] = Array.from(
		{ length: 64 },
		(_value, index) => ({
			type: "public-key",
			id: new Uint8Array([index]),
		}),
	);
	const wire = encodeCtapGetAssertionRequest(
		{ ...request(), allowList },
		2048n,
	);
	expect(wire).toHaveLength(1471);
	const decoded = field(parameters(wire), 3n);
	if (decoded.kind !== "array")
		throw new Error("Expected synthetic allow-list");
	expect(decoded.items).toHaveLength(64);
	for (const [index, item] of decoded.items.entries()) {
		if (item.kind !== "map") throw new Error("Expected synthetic descriptor");
		expect(item.entries[0]).toEqual([
			{ kind: "text", value: "id" },
			{ kind: "bytes", value: new Uint8Array([index]) },
		]);
	}
	rejects(
		{ ...request(), allowList: [...allowList, credential()] },
		"resource-limit",
		maximumUnsigned,
	);
});

it.each([1024, 7610])(
	"accepts a 1023-byte ID but rejects %i bytes",
	(length) => {
		const entry = { ...credential(), id: new Uint8Array(1023).fill(0x91) };
		const wire = encodeCtapGetAssertionRequest(
			{ ...request(), allowList: [entry] },
			2048n,
		);
		expect(wire).toHaveLength(1108);
		const decoded = field(parameters(wire), 3n);
		if (decoded.kind !== "array" || decoded.items[0].kind !== "map")
			throw new Error("Expected synthetic descriptor");
		expect(decoded.items[0].entries[0][1]).toEqual({
			kind: "bytes",
			value: entry.id,
		});
		rejects(
			{ ...request(), allowList: [{ ...entry, id: new Uint8Array(length) }] },
			"resource-limit",
			2048n,
		);
	},
);

it.each(
	[undefined, null, false, "request", [], () => request()].map((input) => ({
		input,
	})),
)("rejects non-record request shape %#", ({ input }) => {
	rejects(input);
});

it.each(["", null, 1, {}])("rejects invalid RP value %#", (rpId) => {
	rejects({ ...request(), rpId });
});

it.each([0, 1, 31, 33, 7609, 7610])(
	"rejects hash length %i instead of hashing caller input",
	(length) => {
		rejects({ ...request(), clientDataHash: new Uint8Array(length) });
	},
);

it.each([null, 0, 1, "true", {}])(
	"rejects nonboolean verification policy %#",
	(userVerification) => {
		rejects({ ...request(), userVerification });
	},
);

it.each([null, {}, new Set([credential()]), new Uint8Array([1])])(
	"rejects non-array allow-list %#",
	(allowList) => {
		rejects({ ...request(), allowList });
	},
);

it("rejects an empty present allow-list and zero-length IDs", () => {
	rejects({ ...request(), allowList: [] });
	rejects({
		...request(),
		allowList: [{ ...credential(), id: new Uint8Array(0) }],
	});
});

it.each(
	[
		null,
		[],
		"public-key",
		{},
		{ type: "public-key" },
		{ id: new Uint8Array([1]) },
		{ type: "password", id: new Uint8Array([1]) },
	].map((entry) => ({ entry })),
)("rejects invalid descriptor shape %#", ({ entry }) => {
	rejects({ ...request(), allowList: [entry] });
});

it.each(["rpId", "clientDataHash"])("requires own request field %s", (name) => {
	const input = request();
	const inherited = Object.create(input);
	for (const [key, value] of Object.entries(input))
		if (key !== name) Object.defineProperty(inherited, key, { value });
	rejects(inherited);
	const missing = { ...input } as Record<string, unknown>;
	delete missing[name];
	rejects(missing);
});

it.each(["type", "id"])("requires own descriptor field %s", (name) => {
	const entry = credential();
	const inherited = Object.create(entry);
	for (const [key, value] of Object.entries(entry))
		if (key !== name) Object.defineProperty(inherited, key, { value });
	rejects({ ...request(), allowList: [inherited] });
});

it.each([
	"extensions",
	"pinAuth",
	"pinProtocol",
	"options",
	"transports",
	"challenge",
	Symbol("extra"),
])("rejects unknown request fields even when nonenumerable %#", (name) => {
	const input = request();
	Object.defineProperty(input, name, { value: "SYNTHETIC_PRIVATE" });
	rejects(input);
});

it.each(["transports", "extra", Symbol("extra")])(
	"rejects unknown descriptor fields instead of silently dropping hints %#",
	(name) => {
		const entry = credential();
		Object.defineProperty(entry, name, { value: ["usb"] });
		rejects({ ...request(), allowList: [entry] });
	},
);

it.each(["rpId", "clientDataHash", "allowList", "userVerification"])(
	"rejects request accessor %s without invoking it",
	(name) => {
		const getter = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		const input = request();
		Object.defineProperty(input, name, { get: getter });
		rejects(input);
		expect(getter).not.toHaveBeenCalled();
	},
);

it.each(["type", "id"])(
	"rejects descriptor accessor %s without invoking it",
	(name) => {
		const getter = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		const entry = credential();
		Object.defineProperty(entry, name, { get: getter });
		rejects({ ...request(), allowList: [entry] });
		expect(getter).not.toHaveBeenCalled();
	},
);

it.each(["sparse", "inherited-data", "inherited-getter", "own-getter"])(
	"rejects %s allow-list slots without executing accessors",
	(shape) => {
		const getter = vi.fn(() => credential());
		const allowList = new Array<CtapGetAssertionCredential>(1);
		if (shape === "own-getter")
			Object.defineProperty(allowList, "0", { get: getter });
		if (shape.startsWith("inherited")) {
			const prototype = Object.create(Array.prototype);
			Object.defineProperty(
				prototype,
				"0",
				shape === "inherited-data" ? { value: credential() } : { get: getter },
			);
			Object.setPrototypeOf(allowList, prototype);
		}
		rejects({ ...request(), allowList });
		expect(getter).not.toHaveBeenCalled();
	},
);

it("reads own indexed list slots without custom iterator, map or slice execution", () => {
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const allowList = [credential()];
	for (const property of [Symbol.iterator, "map", "slice"])
		Object.defineProperty(allowList, property, { get: hook });
	expect(encodeCtapGetAssertionRequest({ ...request(), allowList })).toEqual(
		allowedWire,
	);
	expect(hook).not.toHaveBeenCalled();
});

interface InvalidBytesCase {
	name: string;
	make: (length: number) => unknown;
}

const invalidBytes: InvalidBytesCase[] = [
	{ name: "array", make: (length) => Array<number>(length).fill(1) },
	{ name: "ArrayBuffer", make: (length) => new ArrayBuffer(length) },
	{ name: "DataView", make: (length) => new DataView(new ArrayBuffer(length)) },
	{ name: "Uint16Array", make: (length) => new Uint16Array(length) },
	{ name: "Int8Array", make: (length) => new Int8Array(length) },
	{
		name: "Uint8ClampedArray",
		make: (length) => new Uint8ClampedArray(length),
	},
	{
		name: "shared view",
		make: (length) => new Uint8Array(new SharedArrayBuffer(length)),
	},
	{
		name: "proxy view",
		make: (length) => new Proxy(new Uint8Array(length), {}),
	},
	{
		name: "detached view",
		make: (length) => {
			const buffer = new ArrayBuffer(length);
			const view = new Uint8Array(buffer);
			structuredClone(buffer, { transfer: [buffer] });
			return view;
		},
	},
];

it.each(invalidBytes)(
	"rejects $name for both hash and credential ID",
	({ make }) => {
		rejects({ ...request(), clientDataHash: make(32) });
		rejects({ ...request(), allowList: [{ ...credential(), id: make(2) }] });
	},
);

it.each(["hash", "id"])(
	"copies %s using intrinsic slots without user hooks",
	(target) => {
		const hook = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		const entry = credential();
		const input = { ...request(), allowList: [entry] };
		const view = target === "hash" ? input.clientDataHash : entry.id;
		for (const property of [
			"length",
			"byteLength",
			"byteOffset",
			"buffer",
			"constructor",
			"slice",
			"subarray",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(view, property, { get: hook });
		expect(encodeCtapGetAssertionRequest(input)).toEqual(allowedWire);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each([
	"success",
	"wire-limit",
	"empty-later-id",
	"oversized-later-id",
	"bad-unicode",
])(
	"wipes owned copies and encoded parameters on %s without wiping caller bytes",
	(outcome) => {
		const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
		const encoded = vi.spyOn(ctapCborEncoder, "encodeCtapCbor");
		const first = credential();
		const second = credential();
		if (outcome === "empty-later-id") second.id = new Uint8Array(0);
		if (outcome === "oversized-later-id")
			second.id = new Uint8Array(1024).fill(0x77);
		const input = { ...request(), allowList: [first, second] };
		if (outcome === "bad-unicode") input.rpId = "\ud800";
		const hashBefore = input.clientDataHash.slice();
		const firstBefore = first.id.slice();
		const secondBefore = second.id.slice();
		if (outcome === "success") {
			const wire = encodeCtapGetAssertionRequest(input);
			expect(wire[0]).toBe(0x02);
			expect(wire).toContain(0xf5);
			expect(copied.mock.results.length).toBeGreaterThanOrEqual(3);
			expect(encoded).toHaveBeenCalled();
		} else {
			rejects(
				input,
				outcome === "wire-limit" || outcome === "oversized-later-id"
					? "resource-limit"
					: "invalid-input",
				outcome === "wire-limit" ? 1n : 2048n,
			);
		}
		for (const result of copied.mock.results)
			if (result.type === "return")
				expect(result.value).toEqual(new Uint8Array(result.value.length));
		for (const result of encoded.mock.results)
			if (result.type === "return")
				expect(result.value).toEqual(new Uint8Array(result.value.length));
		expect(input.clientDataHash).toEqual(hashBefore);
		expect(first.id).toEqual(firstBefore);
		expect(second.id).toEqual(secondBefore);
	},
);

it.each(["ownKeys", "getOwnPropertyDescriptor"])(
	"redacts host Proxy %s trap failures into fresh fixed errors",
	(trap) => {
		const coercion = vi.fn(() => "SYNTHETIC_PRIVATE");
		const thrown = {
			message: "SYNTHETIC_PRIVATE",
			path: "SYNTHETIC_PRIVATE",
			[Symbol.toPrimitive]: coercion,
		};
		const hook = vi.fn(() => {
			throw thrown;
		});
		const input = new Proxy(request(), { [trap]: hook });
		const expected = rejects(null);
		const first = rejects(input);
		const second = rejects(input);
		expect(hook).toHaveBeenCalledTimes(2);
		expect(first).not.toBe(thrown);
		expect(second).not.toBe(first);
		expect(first.message).toBe(expected.message);
		expect(second.message).toBe(expected.message);
		expect(coercion).not.toHaveBeenCalled();
	},
);
