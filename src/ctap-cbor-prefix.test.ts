import { expect, it, vi } from "vitest";
import {
	type CtapCborValue,
	decodeCtapCbor,
	decodeCtapCborPrefix,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

type RejectionCode = "invalid-input" | "resource-limit" | "unsupported";

const messages: Record<RejectionCode, string> = {
	"invalid-input": "Invalid CTAP CBOR input.",
	"resource-limit": "CTAP CBOR limit exceeded.",
	unsupported: "Unsupported CTAP CBOR map key.",
};

function rejectsExactly(
	decode: (input: Uint8Array) => unknown,
	input: unknown,
	code: RejectionCode = "invalid-input",
) {
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
	if (!(caught instanceof Error)) throw new Error("Expected decoder error");
	expect(caught.cause).toBeUndefined();
	expect(caught.message).not.toContain("SYNTHETIC_PRIVATE");
}

function rejectsBoth(input: unknown, code: RejectionCode = "invalid-input") {
	rejectsExactly(decodeCtapCborPrefix, input, code);
	rejectsExactly(decodeCtapCbor, input, code);
}

function acceptsExactly(wire: readonly number[], value: CtapCborValue) {
	const complete = new Uint8Array(wire);
	expect(decodeCtapCbor(complete)).toEqual(value);
	expect(decodeCtapCborPrefix(complete)).toEqual({
		value,
		bytesRead: wire.length,
	});
	expect(complete).toEqual(new Uint8Array(wire));
	for (const suffix of [
		[0],
		[0xff],
		[0x61, 0xff],
		[0xc0, 0],
		[0x81, 0x81, 0x81, 0x81, 0x80],
	]) {
		const input = new Uint8Array([...wire, ...suffix]);
		expect(decodeCtapCborPrefix(input)).toEqual({
			value,
			bytesRead: wire.length,
		});
		rejectsExactly(decodeCtapCbor, input);
		expect(input).toEqual(new Uint8Array([...wire, ...suffix]));
	}
}

it.each([
	{ wire: [0], unsigned: 0n, negative: -1n },
	{ wire: [23], unsigned: 23n, negative: -24n },
	{ wire: [0x18, 24], unsigned: 24n, negative: -25n },
	{ wire: [0x18, 255], unsigned: 255n, negative: -256n },
	{ wire: [0x19, 1, 0], unsigned: 256n, negative: -257n },
	{ wire: [0x19, 255, 255], unsigned: 65535n, negative: -65536n },
	{ wire: [0x1a, 0, 1, 0, 0], unsigned: 65536n, negative: -65537n },
	{
		wire: [0x1a, 255, 255, 255, 255],
		unsigned: 4294967295n,
		negative: -4294967296n,
	},
	{
		wire: [0x1b, 0, 0, 0, 1, 0, 0, 0, 0],
		unsigned: 4294967296n,
		negative: -4294967297n,
	},
	{
		wire: [0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1],
		unsigned: 9007199254740993n,
		negative: -9007199254740994n,
	},
	{
		wire: [0x1b, 255, 255, 255, 255, 255, 255, 255, 255],
		unsigned: 18446744073709551615n,
		negative: -18446744073709551616n,
	},
])(
	"preserves exact integer boundaries at $unsigned",
	({ wire, unsigned, negative }) => {
		acceptsExactly(wire, { kind: "unsigned", value: unsigned });
		acceptsExactly(
			wire.map((byte, index) => (index === 0 ? byte + 0x20 : byte)),
			{ kind: "negative", value: negative },
		);
	},
);

it.each<{ name: string; wire: number[]; value: CtapCborValue }>([
	{
		name: "empty bytes",
		wire: [0x40],
		value: { kind: "bytes", value: new Uint8Array() },
	},
	{
		name: "bytes containing item headers",
		wire: [0x43, 0xff, 0xa0, 0],
		value: { kind: "bytes", value: new Uint8Array([0xff, 0xa0, 0]) },
	},
	{
		name: "empty text",
		wire: [0x60],
		value: { kind: "text", value: "" },
	},
	{
		name: "UTF8 BOM",
		wire: [0x63, 0xef, 0xbb, 0xbf],
		value: { kind: "text", value: "\ufeff" },
	},
	{
		name: "four-byte UTF8",
		wire: [0x64, 0xf0, 0x9f, 0x98, 0x80],
		value: { kind: "text", value: "😀" },
	},
	{
		name: "empty array",
		wire: [0x80],
		value: { kind: "array", items: [] },
	},
	{
		name: "empty map",
		wire: [0xa0],
		value: { kind: "map", entries: [] },
	},
	{
		name: "simple zero",
		wire: [0xe0],
		value: { kind: "simple", value: 0 },
	},
	{
		name: "extended simple minimum",
		wire: [0xf8, 32],
		value: { kind: "simple", value: 32 },
	},
	{
		name: "extended simple maximum",
		wire: [0xf8, 255],
		value: { kind: "simple", value: 255 },
	},
	{
		name: "boolean/null/undefined simple values",
		wire: [0x84, 0xf4, 0xf5, 0xf6, 0xf7],
		value: {
			kind: "array",
			items: [20, 21, 22, 23].map((value) => ({ kind: "simple", value })),
		},
	},
	{
		name: "map major-type order rather than total key length",
		wire: [0xa2, 0x18, 24, 0x81, 0x20, 0x20, 0x61, 0x61],
		value: {
			kind: "map",
			entries: [
				[
					{ kind: "unsigned", value: 24n },
					{ kind: "array", items: [{ kind: "negative", value: -1n }] },
				],
				[
					{ kind: "negative", value: -1n },
					{ kind: "text", value: "a" },
				],
			],
		},
	},
])(
	"decodes an exact $name prefix without inspecting its suffix",
	({ wire, value }) => {
		acceptsExactly(wire, value);
	},
);

it.each([
	{ name: "half positive zero", wire: [0xf9, 0, 0], value: 0 },
	{ name: "half negative zero", wire: [0xf9, 0x80, 0], value: -0 },
	{ name: "half subnormal", wire: [0xf9, 0, 1], value: 2 ** -24 },
	{ name: "half maximum finite", wire: [0xf9, 0x7b, 0xff], value: 65504 },
	{
		name: "half positive infinity",
		wire: [0xf9, 0x7c, 0],
		value: Number.POSITIVE_INFINITY,
	},
	{
		name: "half negative infinity",
		wire: [0xf9, 0xfc, 0],
		value: Number.NEGATIVE_INFINITY,
	},
	{ name: "half NaN payload", wire: [0xf9, 0x7e, 1], value: Number.NaN },
	{
		name: "single non-shortened fraction",
		wire: [0xfa, 0x3f, 0xc0, 0, 0],
		value: 1.5,
	},
	{ name: "single subnormal", wire: [0xfa, 0, 0, 0, 1], value: 2 ** -149 },
	{
		name: "double non-shortened fraction",
		wire: [0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0],
		value: 1.5,
	},
	{
		name: "double negative zero",
		wire: [0xfb, 0x80, 0, 0, 0, 0, 0, 0, 0],
		value: -0,
	},
	{
		name: "double NaN payload",
		wire: [0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 1],
		value: Number.NaN,
	},
])("retains $name value and exact encoding", ({ wire, value }) => {
	acceptsExactly(wire, {
		kind: "float",
		value,
		encoding: new Uint8Array(wire),
	});
});

it.each([
	{
		name: "nonminimal integer widths",
		wires: [
			[0x18, 23],
			[0x19, 0, 255],
			[0x1a, 0, 0, 255, 255],
			[0x1b, 0, 0, 0, 0, 255, 255, 255, 255],
			[0x38, 0],
		],
	},
	{
		name: "nonminimal lengths",
		wires: [
			[0x58, 1, 0],
			[0x78, 1, 0x61],
			[0x98, 1, 0],
			[0xb8, 1, 0, 0],
		],
	},
	{
		name: "nonminimal simple values",
		wires: [
			[0xf8, 0],
			[0xf8, 23],
			[0xf8, 24],
			[0xf8, 31],
		],
	},
	{
		name: "reserved arguments",
		wires: [[0x1c], [0x1d], [0x1e], [0xfc], [0xfd], [0xfe], [0xff]],
	},
	{
		name: "indefinite containers",
		wires: [
			[0x5f, 0xff],
			[0x7f, 0xff],
			[0x9f, 0xff],
			[0xbf, 0xff],
		],
	},
	{
		name: "tags",
		wires: [
			[0xc0, 0],
			[0xd8, 24, 0],
			[0x81, 0xc1, 0],
		],
	},
	{
		name: "invalid UTF8",
		wires: [
			[0x61, 0xff],
			[0x61, 0x80],
			[0x62, 0xc0, 0xaf],
			[0x63, 0xed, 0xa0, 0x80],
			[0x64, 0xf4, 0x90, 0x80, 0x80],
			[0x62, 0xe2, 0x82],
		],
	},
	{
		name: "unordered map keys",
		wires: [
			[0xa2, 0x20, 0, 0x18, 24, 0],
			[0xa2, 0x62, 0x61, 0x61, 0, 0x61, 0x62, 0],
			[0xa2, 0x61, 0x62, 0, 0x61, 0x61, 0],
		],
	},
	{
		name: "duplicate typed keys",
		wires: [
			[0xa2, 1, 0, 1, 0],
			[0xa2, 0x41, 1, 0, 0x41, 1, 0],
			[0xa2, 0x61, 0x61, 0, 0x61, 0x61, 0],
			[0xa2, 0xf5, 0, 0xf5, 0],
		],
	},
	{
		name: "equivalent integer and float keys",
		wires: [
			[0xa2, 1, 0, 0xf9, 0x3c, 0, 0],
			[0xa2, 0x20, 0, 0xf9, 0xbc, 0, 0],
			[0xa2, 0, 0, 0xf9, 0x80, 0, 0],
		],
	},
	{
		name: "equivalent fractional and infinity keys",
		wires: [
			[0xa2, 0xf9, 0x3e, 0, 0, 0xfa, 0x3f, 0xc0, 0, 0, 0],
			[0xa2, 0xf9, 0x7c, 0, 0, 0xfa, 0x7f, 0x80, 0, 0, 0],
		],
	},
	{
		name: "equivalent NaN significands",
		wires: [
			[0xa2, 0xf9, 0x7e, 0, 0, 0xf9, 0xfe, 0, 0],
			[0xa2, 0xf9, 0x7e, 0, 0, 0xfa, 0x7f, 0xc0, 0, 0, 0],
		],
	},
	{
		name: "uint64 declared lengths",
		wires: [
			[0x5b, 255, 255, 255, 255, 255, 255, 255, 255],
			[0x7b, 255, 255, 255, 255, 255, 255, 255, 255],
			[0x9b, 255, 255, 255, 255, 255, 255, 255, 255],
			[0xbb, 255, 255, 255, 255, 255, 255, 255, 255],
		],
	},
])("rejects $name even when a later complete item follows", ({ wires }) => {
	for (const wire of wires) {
		for (const suffix of [[], [0]]) {
			const input = new Uint8Array([...wire, ...suffix]);
			rejectsBoth(input);
			expect(input).toEqual(new Uint8Array([...wire, ...suffix]));
		}
	}
});

it("rejects empty and truncated first items at every argument width", () => {
	for (const wire of [
		[],
		[0x18],
		[0x19, 1],
		[0x1a, 0, 1, 0],
		[0x1b, 0, 0, 0, 1, 0, 0, 0],
		[0x58],
		[0x43, 1],
		[0x62, 0x61],
		[0x81],
		[0xa1, 0],
		[0xf8],
		[0xf9, 0],
		[0xfa, 0, 0, 0],
		[0xfb, 0, 0, 0, 0, 0, 0, 0],
	])
		rejectsBoth(new Uint8Array(wire));
	for (const wire of [
		[0x43, 1],
		[0x84, 1],
		[0xa2, 0, 0],
		[0xfb, 0],
	])
		rejectsBoth(new Uint8Array([...wire, 0]));
});

it("keeps complex-key rejection distinct from malformed input", () => {
	for (const wire of [
		[0xa1, 0x80, 0],
		[0xa1, 0xa0, 0],
	]) {
		rejectsBoth(new Uint8Array(wire), "unsupported");
		rejectsBoth(new Uint8Array([...wire, 0]), "unsupported");
	}
});

it("counts four containers and rejects a fifth even when empty", () => {
	acceptsExactly([0x81, 0x81, 0x81, 0x80], {
		kind: "array",
		items: [
			{
				kind: "array",
				items: [{ kind: "array", items: [{ kind: "array", items: [] }] }],
			},
		],
	});
	acceptsExactly([0xa1, 0, 0x81, 0xa1, 0, 0x81, 1], {
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 0n },
				{
					kind: "array",
					items: [
						{
							kind: "map",
							entries: [
								[
									{ kind: "unsigned", value: 0n },
									{ kind: "array", items: [{ kind: "unsigned", value: 1n }] },
								],
							],
						},
					],
				},
			],
		],
	});
	for (const wire of [
		[0x81, 0x81, 0x81, 0x81, 0x80],
		[0xa1, 0, 0x81, 0xa1, 0, 0x81, 0xa0],
	])
		for (const suffix of [[], [0]])
			rejectsBoth(new Uint8Array([...wire, ...suffix]), "resource-limit");
});

it("accepts shortest extended byte, text, array and map lengths", () => {
	acceptsExactly([0x58, 24, ...new Uint8Array(24)], {
		kind: "bytes",
		value: new Uint8Array(24),
	});
	acceptsExactly([0x78, 24, ...new Uint8Array(24).fill(0x61)], {
		kind: "text",
		value: "a".repeat(24),
	});
	acceptsExactly([0x98, 24, ...new Uint8Array(24)], {
		kind: "array",
		items: Array.from({ length: 24 }, () => ({ kind: "unsigned", value: 0n })),
	});
	const wire = [0xb8, 24];
	const entries: [CtapCborValue, CtapCborValue][] = [];
	for (let index = 0; index < 24; index++) {
		wire.push(index, 0);
		entries.push([
			{ kind: "unsigned", value: BigInt(index) },
			{ kind: "unsigned", value: 0n },
		]);
	}
	acceptsExactly(wire, { kind: "map", entries });
});

it("does not round large integer keys into an adjacent float key", () => {
	const encoding = [0xfb, 0x43, 0x40, 0, 0, 0, 0, 0, 0];
	acceptsExactly([0xa2, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1, 0, ...encoding, 0], {
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 9007199254740993n },
				{ kind: "unsigned", value: 0n },
			],
			[
				{
					kind: "float",
					value: 9007199254740992,
					encoding: new Uint8Array(encoding),
				},
				{ kind: "unsigned", value: 0n },
			],
		],
	});
});

it("preserves distinct NaN payload keys", () => {
	acceptsExactly([0xa2, 0xf9, 0x7e, 1, 0, 0xf9, 0x7e, 2, 0], {
		kind: "map",
		entries: [
			[
				{
					kind: "float",
					value: Number.NaN,
					encoding: new Uint8Array([0xf9, 0x7e, 1]),
				},
				{ kind: "unsigned", value: 0n },
			],
			[
				{
					kind: "float",
					value: Number.NaN,
					encoding: new Uint8Array([0xf9, 0x7e, 2]),
				},
				{ kind: "unsigned", value: 0n },
			],
		],
	});
});

it("applies the inclusive 7609-byte cap to the whole supplied view", () => {
	const input = new Uint8Array(7609).fill(0xff);
	input[0] = 0;
	const original = input.slice();
	expect(decodeCtapCborPrefix(input)).toEqual({
		value: { kind: "unsigned", value: 0n },
		bytesRead: 1,
	});
	rejectsExactly(decodeCtapCbor, input);
	expect(input).toEqual(original);
	const oversized = new Uint8Array(7610);
	rejectsBoth(oversized, "resource-limit");
	oversized[0] = 0xff;
	rejectsBoth(oversized, "resource-limit");
	const fullItem = new Uint8Array(7609);
	fullItem.set([0x59, 0x1d, 0xb6]);
	const value: CtapCborValue = { kind: "bytes", value: new Uint8Array(7606) };
	expect(decodeCtapCborPrefix(fullItem)).toEqual({ value, bytesRead: 7609 });
	expect(decodeCtapCbor(fullItem)).toEqual(value);
});

it("counts bytes relative to an offset view, not its oversized backing buffer", () => {
	const backing = new Uint8Array(8000).fill(0xff);
	backing.set([0x18, 24, 0], 17);
	const original = backing.slice();
	const input = backing.subarray(17, 20);
	expect(decodeCtapCborPrefix(input)).toEqual({
		value: { kind: "unsigned", value: 24n },
		bytesRead: 2,
	});
	rejectsExactly(decodeCtapCbor, input);
	expect(decodeCtapCbor(input.subarray(0, 2))).toEqual({
		kind: "unsigned",
		value: 24n,
	});
	rejectsBoth(backing.subarray(17, 18));
	expect(backing).toEqual(original);
});

it("accepts Buffer views and ignores shadowed typed-byte properties and methods", () => {
	const backing = Buffer.from([0xff, 0x18, 24, 0xff]);
	const input = backing.subarray(1, 3);
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const property of [
		"length",
		"byteLength",
		"byteOffset",
		"buffer",
		"slice",
		"subarray",
		"fill",
		Symbol.toStringTag,
		Symbol.iterator,
	])
		Object.defineProperty(input, property, { get: hook });
	expect(decodeCtapCborPrefix(input)).toEqual({
		value: { kind: "unsigned", value: 24n },
		bytesRead: 2,
	});
	expect(decodeCtapCbor(input)).toEqual({ kind: "unsigned", value: 24n });
	expect(hook).not.toHaveBeenCalled();
	expect(backing).toEqual(Buffer.from([0xff, 0x18, 24, 0xff]));
});

it("rejects invalid brands without consulting private-payload hooks", () => {
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const fake = Object.create(Uint8Array.prototype);
	Object.defineProperty(fake, Symbol.toStringTag, { get: hook });
	const proxy = new Proxy(new Uint8Array([0]), { get: hook });
	for (const input of [
		undefined,
		null,
		false,
		0,
		"SYNTHETIC_PRIVATE",
		[],
		{},
		fake,
		proxy,
		new Int8Array([0]),
		new Uint8ClampedArray([0]),
		new Uint16Array([0]),
		new ArrayBuffer(1),
		new DataView(new ArrayBuffer(1)),
	])
		rejectsBoth(input);
	expect(hook).not.toHaveBeenCalled();
});

it("rejects shared, detached and empty byte storage", () => {
	rejectsBoth(new Uint8Array(new SharedArrayBuffer(1)));
	const buffer = new ArrayBuffer(4);
	const input = new Uint8Array(buffer, 1, 2);
	structuredClone(buffer, { transfer: [buffer] });
	rejectsBoth(input);
	rejectsBoth(new Uint8Array());
	rejectsBoth(new Uint8Array([0]).subarray(1));
});

it("rejects out-of-bounds resizable views and accepts a regrown tracking view", () => {
	type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
	const ResizableArrayBuffer = ArrayBuffer as unknown as new (
		length: number,
		options: { maxByteLength: number },
	) => ResizableBuffer;
	const buffer = new ResizableArrayBuffer(16, { maxByteLength: 32 });
	const fixed = new Uint8Array(buffer, 8, 4);
	buffer.resize(4);
	rejectsBoth(fixed);
	const trackingBuffer = new ResizableArrayBuffer(0, { maxByteLength: 2 });
	const tracking = new Uint8Array(trackingBuffer);
	rejectsBoth(tracking);
	trackingBuffer.resize(2);
	tracking.set([0, 0xff]);
	expect(decodeCtapCborPrefix(tracking)).toEqual({
		value: { kind: "unsigned", value: 0n },
		bytesRead: 1,
	});
	rejectsExactly(decodeCtapCbor, tracking);
});

it("returns independently owned nested bytes and float encodings", () => {
	const wire = [
		0xa1, 1, 0x84, 0x42, 1, 2, 0x42, 1, 2, 0xf9, 0x3e, 0, 0xf9, 0x3e, 0,
	];
	const expected: CtapCborValue = {
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 1n },
				{
					kind: "array",
					items: [
						{ kind: "bytes", value: new Uint8Array([1, 2]) },
						{ kind: "bytes", value: new Uint8Array([1, 2]) },
						{
							kind: "float",
							value: 1.5,
							encoding: new Uint8Array([0xf9, 0x3e, 0]),
						},
						{
							kind: "float",
							value: 1.5,
							encoding: new Uint8Array([0xf9, 0x3e, 0]),
						},
					],
				},
			],
		],
	};
	const input = new Uint8Array([...wire, 0xff]);
	const original = input.slice();
	const prefix = decodeCtapCborPrefix(input);
	const second = decodeCtapCborPrefix(input);
	const whole = decodeCtapCbor(input.subarray(0, wire.length));
	expect(prefix).toEqual({ value: expected, bytesRead: 15 });
	expect(whole).toEqual(expected);
	expect(input).toEqual(original);
	if (prefix.value.kind !== "map") throw new Error("Expected map fixture");
	const array = prefix.value.entries[0][1];
	if (array.kind !== "array") throw new Error("Expected array fixture");
	const [firstBytes, secondBytes, firstFloat, secondFloat] = array.items;
	if (
		firstBytes.kind !== "bytes" ||
		secondBytes.kind !== "bytes" ||
		firstFloat.kind !== "float" ||
		secondFloat.kind !== "float"
	)
		throw new Error("Expected owned byte and float fixtures");
	const outputs = [
		firstBytes.value,
		secondBytes.value,
		firstFloat.encoding,
		secondFloat.encoding,
	];
	expect(new Set(outputs.map((output) => output.buffer)).size).toBe(4);
	for (const output of outputs) expect(output.buffer).not.toBe(input.buffer);
	firstBytes.value.fill(0xee);
	firstFloat.encoding.fill(0xdd);
	expect(secondBytes.value).toEqual(new Uint8Array([1, 2]));
	expect(secondFloat.encoding).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
	expect(firstFloat.value).toBe(1.5);
	expect(input).toEqual(original);
	input.fill(0);
	expect(second).toEqual({ value: expected, bytesRead: 15 });
	expect(whole).toEqual(expected);
	expect(secondBytes.value).toEqual(new Uint8Array([1, 2]));
	expect(secondFloat.encoding).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
});

it.each([
	{
		name: "prefix success with ignored suffix",
		prefix: true,
		wire: [0x41, 0x7a, 0xff],
		error: undefined,
	},
	{
		name: "prefix malformed first item",
		prefix: true,
		wire: [0x61, 0xff, 0],
		error: "invalid-input" as const,
	},
	{
		name: "whole success",
		prefix: false,
		wire: [0x41, 0x7a],
		error: undefined,
	},
	{
		name: "whole trailing-byte failure",
		prefix: false,
		wire: [0x41, 0x7a, 0xff],
		error: "invalid-input" as const,
	},
	{
		name: "prefix depth failure",
		prefix: true,
		wire: [0x81, 0x81, 0x81, 0x81, 0x80, 0xff],
		error: "resource-limit" as const,
	},
	{
		name: "prefix unsupported key",
		prefix: true,
		wire: [0xa1, 0x80, 0, 0xff],
		error: "unsupported" as const,
	},
])("wipes the owned whole-view copy on $name", ({ prefix, wire, error }) => {
	const input = new Uint8Array(wire);
	const before = input.slice();
	const calls: {
		target: Uint8Array;
		before: Uint8Array;
		after: Uint8Array;
		value: number;
		start: number | undefined;
		end: number | undefined;
	}[] = [];
	const intrinsicFill = Uint8Array.prototype.fill;
	const spy = vi
		.spyOn(Uint8Array.prototype, "fill")
		.mockImplementation(function (
			this: Uint8Array,
			value: number,
			start?: number,
			end?: number,
		) {
			const snapshot = this.slice();
			const result = intrinsicFill.call(this, value, start, end);
			calls.push({
				target: this,
				before: snapshot,
				after: this.slice(),
				value,
				start,
				end,
			});
			return result;
		});
	try {
		const decode = prefix ? decodeCtapCborPrefix : decodeCtapCbor;
		if (error) rejectsExactly(decode, input, error);
		else if (prefix)
			expect(decodeCtapCborPrefix(input)).toEqual({
				value: { kind: "bytes", value: new Uint8Array([0x7a]) },
				bytesRead: 2,
			});
		else
			expect(decodeCtapCbor(input)).toEqual({
				kind: "bytes",
				value: new Uint8Array([0x7a]),
			});
	} finally {
		spy.mockRestore();
	}
	expect(calls).toHaveLength(1);
	const [wipe] = calls;
	expect(wipe.target).not.toBe(input);
	expect(wipe.target.buffer).not.toBe(input.buffer);
	expect(wipe.before).toEqual(before);
	expect(wipe.value).toBe(0);
	expect(wipe.start).toBeUndefined();
	expect(wipe.end).toBeUndefined();
	expect(wipe.after).toEqual(new Uint8Array(wire.length));
	expect(wipe.target).toEqual(new Uint8Array(wire.length));
	expect(input).toEqual(before);
});

it("uses bytesRead to separate synthetic COSE and extension maps structurally", () => {
	const cose = [0xa2, 1, 2, 0x21, 0x42, 0xaa, 0xbb];
	const extension = [0xa1, 0x61, 0x78, 0xf5];
	const credentialLayout = new Uint8Array([0xaa, 0xbb, ...cose, ...extension]);
	const structures = credentialLayout.subarray(2);
	const first = decodeCtapCborPrefix(structures);
	expect(first).toEqual({
		value: {
			kind: "map",
			entries: [
				[
					{ kind: "unsigned", value: 1n },
					{ kind: "unsigned", value: 2n },
				],
				[
					{ kind: "negative", value: -2n },
					{ kind: "bytes", value: new Uint8Array([0xaa, 0xbb]) },
				],
			],
		},
		bytesRead: 7,
	});
	const remaining = structures.subarray(first.bytesRead);
	const second = decodeCtapCborPrefix(remaining);
	expect(second).toEqual({
		value: {
			kind: "map",
			entries: [
				[
					{ kind: "text", value: "x" },
					{ kind: "simple", value: 21 },
				],
			],
		},
		bytesRead: 4,
	});
	expect(first.bytesRead + second.bytesRead).toBe(structures.length);
	expect(decodeCtapCbor(structures.subarray(0, first.bytesRead))).toEqual(
		first.value,
	);
	expect(decodeCtapCbor(remaining)).toEqual(second.value);
	rejectsExactly(decodeCtapCbor, structures);
	rejectsBoth(remaining.subarray(second.bytesRead));
	expect(credentialLayout).toEqual(
		new Uint8Array([0xaa, 0xbb, ...cose, ...extension]),
	);
});
