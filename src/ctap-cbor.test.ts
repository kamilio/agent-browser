import { expect, it, vi } from "vitest";
import { copyCtapBytes, ctapCborLimits, decodeCtapCbor } from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

function rejects(input: unknown, code = "invalid-input") {
	let caught: unknown;
	try {
		decodeCtapCbor(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ code });
	expect((caught as Error).message).not.toContain("SYNTHETIC_PRIVATE");
	expect((caught as Error).cause).toBeUndefined();
}

it.each([
	{ wire: [0], value: 0n },
	{ wire: [23], value: 23n },
	{ wire: [0x18, 24], value: 24n },
	{ wire: [0x18, 255], value: 255n },
	{ wire: [0x19, 1, 0], value: 256n },
	{ wire: [0x19, 255, 255], value: 65535n },
	{ wire: [0x1a, 0, 1, 0, 0], value: 65536n },
	{ wire: [0x1a, 255, 255, 255, 255], value: 4294967295n },
	{ wire: [0x1b, 0, 0, 0, 1, 0, 0, 0, 0], value: 4294967296n },
	{ wire: [0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1], value: 9007199254740993n },
	{
		wire: [0x1b, 255, 255, 255, 255, 255, 255, 255, 255],
		value: 18446744073709551615n,
	},
])("retains exact unsigned value $value", ({ wire, value }) => {
	expect(decodeCtapCbor(new Uint8Array(wire))).toEqual({
		kind: "unsigned",
		value,
	});
});

it.each([
	{ wire: [0x20], value: -1n },
	{ wire: [0x37], value: -24n },
	{ wire: [0x38, 24], value: -25n },
	{ wire: [0x38, 255], value: -256n },
	{ wire: [0x39, 1, 0], value: -257n },
	{ wire: [0x39, 255, 255], value: -65536n },
	{ wire: [0x3a, 0, 1, 0, 0], value: -65537n },
	{ wire: [0x3a, 255, 255, 255, 255], value: -4294967296n },
	{ wire: [0x3b, 0, 0, 0, 1, 0, 0, 0, 0], value: -4294967297n },
	{
		wire: [0x3b, 255, 255, 255, 255, 255, 255, 255, 255],
		value: -18446744073709551616n,
	},
])("retains exact negative value $value", ({ wire, value }) => {
	expect(decodeCtapCbor(new Uint8Array(wire))).toEqual({
		kind: "negative",
		value,
	});
});

it.each(
	[
		[0x18, 0],
		[0x18, 23],
		[0x19, 0, 255],
		[0x1a, 0, 0, 255, 255],
		[0x1b, 0, 0, 0, 0, 255, 255, 255, 255],
		[0x38, 23],
		[0x39, 0, 255],
		[0x58, 0],
		[0x78, 0],
		[0x98, 0],
		[0xb8, 0],
	].map((wire) => ({ wire })),
)("rejects nonminimal integer/length fixture %#", ({ wire }) =>
	rejects(new Uint8Array(wire)),
);

it.each([
	{ wire: [0xe0], value: 0 },
	{ wire: [0xf3], value: 19 },
	{ wire: [0xf4], value: 20 },
	{ wire: [0xf5], value: 21 },
	{ wire: [0xf6], value: 22 },
	{ wire: [0xf7], value: 23 },
	{ wire: [0xf8, 32], value: 32 },
	{ wire: [0xf8, 255], value: 255 },
])(
	"preserves simple value $value without inventing a recognized type",
	({ wire, value }) => {
		expect(decodeCtapCbor(new Uint8Array(wire))).toEqual({
			kind: "simple",
			value,
		});
	},
);

it.each([
	{ wire: [0xf9, 0, 0], value: 0 },
	{ wire: [0xf9, 0x80, 0], value: -0 },
	{ wire: [0xf9, 0, 1], value: 2 ** -24 },
	{ wire: [0xf9, 0x3e, 0], value: 1.5 },
	{ wire: [0xf9, 0xbe, 0], value: -1.5 },
	{ wire: [0xf9, 0x7b, 0xff], value: 65504 },
	{ wire: [0xf9, 0x7c, 0], value: Number.POSITIVE_INFINITY },
	{ wire: [0xf9, 0xfc, 0], value: Number.NEGATIVE_INFINITY },
	{ wire: [0xf9, 0x7e, 1], value: Number.NaN },
	{ wire: [0xf9, 0x7c, 1], value: Number.NaN },
	{ wire: [0xfa, 0x3f, 0xc0, 0, 0], value: 1.5 },
	{ wire: [0xfa, 0x80, 0, 0, 0], value: -0 },
	{ wire: [0xfa, 0x7f, 0xc0, 0, 1], value: Number.NaN },
	{ wire: [0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0], value: 1.5 },
	{ wire: [0xfb, 0x80, 0, 0, 0, 0, 0, 0, 0], value: -0 },
	{
		wire: [0xfb, 0x7f, 0xf0, 0, 0, 0, 0, 0, 0],
		value: Number.POSITIVE_INFINITY,
	},
	{ wire: [0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 1], value: Number.NaN },
])("preserves float value and original encoding %#", ({ wire, value }) => {
	const input = new Uint8Array(wire);
	const decoded = decodeCtapCbor(input);
	if (decoded.kind !== "float") throw new Error("Expected float fixture");
	if (Number.isNaN(value)) expect(decoded.value).toBeNaN();
	else expect(Object.is(decoded.value, value)).toBe(true);
	expect(decoded.encoding).toEqual(new Uint8Array(wire));
	input.fill(0);
	expect(decoded.encoding).toEqual(new Uint8Array(wire));
});

it.each([
	{ wire: [0x60], value: "" },
	{ wire: [0x61, 0], value: "\0" },
	{ wire: [0x63, 0xef, 0xbb, 0xbf], value: "\ufeff" },
	{ wire: [0x64, 0xef, 0xbb, 0xbf, 0x41], value: "\ufeffA" },
	{ wire: [0x64, 0xf0, 0x9f, 0x98, 0x80], value: "😀" },
])("decodes exact valid UTF8 without stripping BOM %#", ({ wire, value }) => {
	expect(decodeCtapCbor(new Uint8Array(wire))).toEqual({ kind: "text", value });
});

it.each(
	[
		[0x61, 0xff],
		[0x61, 0x80],
		[0x62, 0xc0, 0xaf],
		[0x63, 0xed, 0xa0, 0x80],
		[0x64, 0xf4, 0x90, 0x80, 0x80],
		[0x62, 0xe2, 0x82],
	].map((wire) => ({ wire })),
)("rejects malformed UTF8 fixture %#", ({ wire }) =>
	rejects(new Uint8Array(wire)),
);

it("accepts the shortest extended byte/text/array/map lengths", () => {
	expect(
		decodeCtapCbor(new Uint8Array([0x58, 24, ...new Uint8Array(24)])),
	).toEqual({ kind: "bytes", value: new Uint8Array(24) });
	expect(
		decodeCtapCbor(
			new Uint8Array([0x78, 24, ...new Uint8Array(24).fill(0x61)]),
		),
	).toEqual({ kind: "text", value: "a".repeat(24) });
	const array = decodeCtapCbor(
		new Uint8Array([0x98, 24, ...new Uint8Array(24)]),
	);
	expect(array).toMatchObject({ kind: "array" });
	if (array.kind !== "array") throw new Error("Expected array fixture");
	expect(array.items).toHaveLength(24);
	const mapBytes = new Uint8Array(50);
	mapBytes.set([0xb8, 24]);
	for (let index = 0; index < 24; index++) mapBytes[2 + index * 2] = index;
	const map = decodeCtapCbor(mapBytes);
	if (map.kind !== "map") throw new Error("Expected map fixture");
	expect(map.entries).toHaveLength(24);
});

it.each(
	[
		[0xa2, 0x18, 24, 0, 0x20, 0],
		[0xa2, 0x20, 0, 0x21, 0],
		[0xa2, 0x61, 0x62, 0, 0x62, 0x61, 0x61, 0],
		[0xa2, 0x61, 0x61, 0, 0x61, 0x62, 0],
		[0xa2, 0x41, 0x61, 0, 0x61, 0x61, 0],
		[0xa2, 1, 0, 0x61, 0x31, 0],
		[0xa2, 2, 0, 0xe2, 0],
		[0xa2, 0x62, 0xc3, 0xa9, 0, 0x63, 0x65, 0xcc, 0x81, 0],
	].map((wire) => ({ wire })),
)(
	"accepts canonical type/length order and distinct typed keys %#",
	({ wire }) => {
		const decoded = decodeCtapCbor(new Uint8Array(wire));
		if (decoded.kind !== "map") throw new Error("Expected map fixture");
		expect(decoded.entries).toHaveLength(2);
	},
);

it.each(
	[
		[0xa2, 0x20, 0, 0x18, 24, 0],
		[0xa2, 0x21, 0, 0x20, 0],
		[0xa2, 0x62, 0x61, 0x61, 0, 0x61, 0x62, 0],
		[0xa2, 0x61, 0x62, 0, 0x61, 0x61, 0],
		[0xa2, 1, 0, 1, 0],
		[0xa2, 0x41, 1, 0, 0x41, 1, 0],
		[0xa2, 0x61, 0x61, 0, 0x61, 0x61, 0],
		[0xa2, 0xf5, 0, 0xf5, 0],
	].map((wire) => ({ wire })),
)("rejects unordered or repeated keys %#", ({ wire }) =>
	rejects(new Uint8Array(wire)),
);

it.each(
	[
		[0xa2, 1, 0, 0xf9, 0x3c, 0, 0],
		[0xa2, 0x20, 0, 0xf9, 0xbc, 0, 0],
		[0xa2, 0, 0, 0xf9, 0x80, 0, 0],
		[0xa2, 0xf9, 0, 0, 0, 0xf9, 0x80, 0, 0],
		[0xa2, 0xf9, 0x3e, 0, 0, 0xfa, 0x3f, 0xc0, 0, 0, 0],
		[0xa2, 0xf9, 0x7c, 0, 0, 0xfa, 0x7f, 0x80, 0, 0, 0],
		[
			0xa2, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, 0, 0, 0xfb, 0x43, 0x40, 0, 0, 0, 0, 0,
			0, 0,
		],
	].map((wire) => ({ wire })),
)(
	"rejects legacy numerically equivalent keys across types/widths %#",
	({ wire }) => rejects(new Uint8Array(wire)),
);

it("does not round uint64 keys into a nearby floating-point key", () => {
	const decoded = decodeCtapCbor(
		new Uint8Array([
			0xa2, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1, 0, 0xfb, 0x43, 0x40, 0, 0, 0, 0, 0,
			0, 0,
		]),
	);
	if (decoded.kind !== "map") throw new Error("Expected map fixture");
	expect(decoded.entries[0][0]).toEqual({
		kind: "unsigned",
		value: 9007199254740993n,
	});
	expect(decoded.entries[1][0]).toMatchObject({
		kind: "float",
		value: 9007199254740992,
	});
});

it.each(
	[
		[0xa2, 0xf9, 0x7e, 0, 0, 0xf9, 0xfe, 0, 0],
		[0xa2, 0xf9, 0x7e, 0, 0, 0xfa, 0x7f, 0xc0, 0, 0, 0],
		[0xa2, 0xfa, 0x7f, 0xc0, 0, 0, 0, 0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0, 0],
		[0xa2, 0xf9, 0x7c, 1, 0, 0xfa, 0x7f, 0x80, 0x20, 0, 0],
		[0xa2, 0xf9, 0x7e, 1, 0, 0xfb, 0x7f, 0xf8, 4, 0, 0, 0, 0, 0, 0],
	].map((wire) => ({ wire })),
)("rejects equivalent normalized NaN significands %#", ({ wire }) =>
	rejects(new Uint8Array(wire)),
);

it.each(
	[
		[0xa2, 0xf9, 0x7e, 1, 0, 0xf9, 0x7e, 2, 0],
		[0xa2, 0xf9, 0x7e, 0, 0, 0xfa, 0x7f, 0xc0, 0, 1, 0],
		[0xa2, 0xfa, 0x7f, 0xc0, 0, 0, 0, 0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 1, 0],
		[0xa2, 0xf9, 0x7c, 1, 0, 0xf9, 0x7e, 0, 0],
		[0xa2, 0xf9, 0x3e, 0, 0, 0xfa, 0x3f, 0xc0, 0, 1, 0],
	].map((wire) => ({ wire })),
)("keeps distinct NaN/fractional keys distinct %#", ({ wire }) => {
	const decoded = decodeCtapCbor(new Uint8Array(wire));
	if (decoded.kind !== "map") throw new Error("Expected map fixture");
	expect(decoded.entries).toHaveLength(2);
});

it.each(
	[
		[],
		[0x18],
		[0x1b, 0, 0, 0, 0, 0, 0, 0],
		[0x58],
		[0x62, 0x61],
		[0x81],
		[0xa1, 0],
		[0xf8],
		[0xf9, 0],
		[0xfa, 0, 0, 0],
		[0xfb, 0, 0, 0, 0, 0, 0, 0],
		[0, 0],
		[0x5b, 255, 255, 255, 255, 255, 255, 255, 255],
		[0x9b, 255, 255, 255, 255, 255, 255, 255, 255],
		[0xbb, 255, 255, 255, 255, 255, 255, 255, 255],
	].map((wire) => ({ wire })),
)("rejects truncation/trailing/oversized declared length %#", ({ wire }) =>
	rejects(new Uint8Array(wire)),
);

it.each(
	[
		[0x1c],
		[0x1d],
		[0x1e],
		[0x5f, 0xff],
		[0x7f, 0xff],
		[0x9f, 0xff],
		[0xbf, 0xff],
		[0xc0, 0],
		[0xd8, 32, 0],
		[0xfc],
		[0xfd],
		[0xfe],
		[0xff],
		[0xf8, 0],
		[0xf8, 23],
		[0xf8, 24],
		[0xf8, 31],
	].map((wire) => ({ wire })),
)(
	"rejects non-CTAP tags, indefinite, reserved and extended-small-simple forms %#",
	({ wire }) => rejects(new Uint8Array(wire)),
);

it.each(
	[
		[0xa1, 0x80, 0],
		[0xa1, 0xa0, 0],
	].map((wire) => ({ wire })),
)("refuses complex map keys outside this CTAP profile %#", ({ wire }) => {
	rejects(new Uint8Array(wire), "unsupported");
});

it("counts four containers including an empty innermost container", () => {
	expect(decodeCtapCbor(new Uint8Array([0x81, 0x81, 0x81, 0x80])).kind).toBe(
		"array",
	);
	expect(
		decodeCtapCbor(new Uint8Array([0xa1, 0, 0x81, 0xa1, 0, 0x80])).kind,
	).toBe("map");
	rejects(new Uint8Array([0x81, 0x81, 0x81, 0x81, 0x80]), "resource-limit");
	rejects(
		new Uint8Array([0xa1, 0, 0x81, 0xa1, 0, 0x81, 0x80]),
		"resource-limit",
	);
});

it("enforces the inclusive byte budget before parsing or allocating declared contents", () => {
	expect(ctapCborLimits).toEqual({ maxBytes: 7609, maxDepth: 4 });
	expect(Object.isFrozen(ctapCborLimits)).toBe(true);
	const exact = new Uint8Array(7609);
	exact.set([0x59, 0x1d, 0xb6]);
	const decoded = decodeCtapCbor(exact);
	if (decoded.kind !== "bytes") throw new Error("Expected byte fixture");
	expect(decoded.value.length).toBe(7606);
	rejects(new Uint8Array(7610), "resource-limit");
});

it("returns owned nested byte/float values without touching the caller input", () => {
	const input = new Uint8Array([0xa1, 1, 0x82, 0x42, 1, 2, 0xf9, 0x3e, 0]);
	const original = input.slice();
	const decoded = decodeCtapCbor(input);
	expect(input).toEqual(original);
	if (decoded.kind !== "map") throw new Error("Expected map fixture");
	const array = decoded.entries[0][1];
	if (array.kind !== "array") throw new Error("Expected array fixture");
	const bytes = array.items[0];
	const float = array.items[1];
	if (bytes.kind !== "bytes" || float.kind !== "float")
		throw new Error("Expected owned values");
	input.fill(0);
	expect(bytes.value).toEqual(new Uint8Array([1, 2]));
	expect(float.encoding).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
	bytes.value.fill(255);
	expect(decodeCtapCbor(original)).not.toEqual(decoded);
});

it("copies only the supplied Buffer/offset view and bypasses caller property hooks", () => {
	const backing = new Uint8Array([0xff, 0x18, 24, 0xff]);
	const input = backing.subarray(1, 3);
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const property of [
		"length",
		"byteLength",
		"byteOffset",
		"buffer",
		Symbol.toStringTag,
		Symbol.iterator,
	])
		Object.defineProperty(input, property, { get: hook });
	expect(decodeCtapCbor(input)).toEqual({ kind: "unsigned", value: 24n });
	expect(hook).not.toHaveBeenCalled();
	expect(backing).toEqual(new Uint8Array([0xff, 0x18, 24, 0xff]));
	expect(decodeCtapCbor(Buffer.from([0]))).toEqual({
		kind: "unsigned",
		value: 0n,
	});
	const copy = copyCtapBytes(input);
	copy.fill(0);
	expect(backing[1]).toBe(0x18);
});

it.each(
	[
		undefined,
		null,
		false,
		0,
		"SYNTHETIC_PRIVATE",
		[],
		{},
		new Uint16Array([0]),
		new DataView(new ArrayBuffer(1)),
		new Proxy(new Uint8Array([0]), {}),
	].map((input) => ({ input })),
)("rejects non-branded or wrong typed inputs %#", ({ input }) =>
	rejects(input),
);

it("rejects shared and detached storage", () => {
	rejects(new Uint8Array(new SharedArrayBuffer(1)));
	const buffer = new ArrayBuffer(1);
	const input = new Uint8Array(buffer);
	structuredClone(buffer, { transfer: [buffer] });
	rejects(input);
});

it("rejects out-of-bounds and empty resizable views without trusting getters", () => {
	type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
	const ResizableArrayBuffer = ArrayBuffer as unknown as new (
		length: number,
		options: { maxByteLength: number },
	) => ResizableBuffer;
	const buffer = new ResizableArrayBuffer(16, { maxByteLength: 32 });
	const outOfBounds = new Uint8Array(buffer, 8, 4);
	buffer.resize(4);
	rejects(outOfBounds);
	const emptyBuffer = new ResizableArrayBuffer(0, { maxByteLength: 1 });
	const tracking = new Uint8Array(emptyBuffer);
	rejects(tracking);
	emptyBuffer.resize(1);
	expect(decodeCtapCbor(tracking)).toEqual({ kind: "unsigned", value: 0n });
});
