import { Buffer } from "node:buffer";
import { expect, it, vi } from "vitest";
import { encodeCtapCbor } from "./ctap-cbor-encoder.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

const unsigned = (value: bigint): CtapCborValue => ({
	kind: "unsigned",
	value,
});
const negative = (value: bigint): CtapCborValue => ({
	kind: "negative",
	value,
});
const text = (value: string): CtapCborValue => ({ kind: "text", value });
const bytes = (value: Uint8Array): CtapCborValue => ({ kind: "bytes", value });
const simple = (value: number): CtapCborValue => ({ kind: "simple", value });
const float = (value: number, wire: readonly number[]): CtapCborValue => ({
	kind: "float",
	value,
	encoding: new Uint8Array(wire),
});
const array = (items: readonly CtapCborValue[]): CtapCborValue => ({
	kind: "array",
	items,
});
const map = (
	entries: readonly (readonly [CtapCborValue, CtapCborValue])[],
): CtapCborValue => ({ kind: "map", entries });

function rejects(
	input: unknown,
	code: "invalid-input" | "resource-limit" | "unsupported" = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		encodeCtapCbor(input as CtapCborValue);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ code });
	expect((caught as Error).message).not.toContain("SYNTHETIC_PRIVATE");
	expect((caught as Error).cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	return caught as AgentBrowserError;
}

it.each(["array", "map", "tuple-key", "tuple-value"])(
	"rejects inherited sparse %s slots without invoking their getters",
	(shape) => {
		const inherited = vi.fn(() =>
			shape === "map" ? [unsigned(1n), unsigned(2n)] : unsigned(1n),
		);
		const values = new Array(shape.startsWith("tuple") ? 2 : 1);
		if (shape === "tuple-key") values[1] = unsigned(2n);
		if (shape === "tuple-value") values[0] = unsigned(1n);
		const missing = shape === "tuple-value" ? 1 : 0;
		const prototype = Object.create(Array.prototype);
		Object.defineProperty(prototype, missing, { get: inherited });
		Object.setPrototypeOf(values, prototype);
		const input =
			shape === "array"
				? array(values)
				: shape === "map"
					? map(values)
					: map([values as [CtapCborValue, CtapCborValue]]);
		rejects(input);
		expect(inherited).not.toHaveBeenCalled();
	},
);

it.each([
	{ value: 0n, wire: [0x00] },
	{ value: 23n, wire: [0x17] },
	{ value: 24n, wire: [0x18, 0x18] },
	{ value: 255n, wire: [0x18, 0xff] },
	{ value: 256n, wire: [0x19, 0x01, 0x00] },
	{ value: 65535n, wire: [0x19, 0xff, 0xff] },
	{ value: 65536n, wire: [0x1a, 0x00, 0x01, 0x00, 0x00] },
	{ value: 4294967295n, wire: [0x1a, 0xff, 0xff, 0xff, 0xff] },
	{ value: 4294967296n, wire: [0x1b, 0, 0, 0, 1, 0, 0, 0, 0] },
	{ value: 9007199254740993n, wire: [0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1] },
	{
		value: 18446744073709551615n,
		wire: [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
	},
])(
	"encodes unsigned $value with the shortest exact width",
	({ value, wire }) => {
		expect(encodeCtapCbor(unsigned(value))).toEqual(new Uint8Array(wire));
	},
);

it.each([
	{ value: -1n, wire: [0x20] },
	{ value: -24n, wire: [0x37] },
	{ value: -25n, wire: [0x38, 0x18] },
	{ value: -256n, wire: [0x38, 0xff] },
	{ value: -257n, wire: [0x39, 0x01, 0x00] },
	{ value: -65536n, wire: [0x39, 0xff, 0xff] },
	{ value: -65537n, wire: [0x3a, 0x00, 0x01, 0x00, 0x00] },
	{ value: -4294967296n, wire: [0x3a, 0xff, 0xff, 0xff, 0xff] },
	{ value: -4294967297n, wire: [0x3b, 0, 0, 0, 1, 0, 0, 0, 0] },
	{ value: -9007199254740994n, wire: [0x3b, 0, 0x20, 0, 0, 0, 0, 0, 1] },
	{
		value: -18446744073709551616n,
		wire: [0x3b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
	},
])(
	"encodes negative $value with the shortest exact width",
	({ value, wire }) => {
		expect(encodeCtapCbor(negative(value))).toEqual(new Uint8Array(wire));
	},
);

it.each([
	{ value: 0, wire: [0xe0] },
	{ value: 19, wire: [0xf3] },
	{ value: 20, wire: [0xf4] },
	{ value: 21, wire: [0xf5] },
	{ value: 22, wire: [0xf6] },
	{ value: 23, wire: [0xf7] },
	{ value: 32, wire: [0xf8, 0x20] },
	{ value: 255, wire: [0xf8, 0xff] },
])("encodes simple $value without changing its type", ({ value, wire }) => {
	expect(encodeCtapCbor(simple(value))).toEqual(new Uint8Array(wire));
});

it.each([
	{ value: 0, wire: [0xf9, 0, 0] },
	{ value: -0, wire: [0xf9, 0x80, 0] },
	{ value: 1.5, wire: [0xf9, 0x3e, 0] },
	{ value: 2 ** -24, wire: [0xf9, 0, 1] },
	{ value: 65504, wire: [0xf9, 0x7b, 0xff] },
	{ value: Number.POSITIVE_INFINITY, wire: [0xf9, 0x7c, 0] },
	{ value: Number.NEGATIVE_INFINITY, wire: [0xf9, 0xfc, 0] },
	{ value: Number.NaN, wire: [0xf9, 0x7c, 1] },
	{ value: Number.NaN, wire: [0xf9, 0xfe, 1] },
	{ value: 1.5, wire: [0xfa, 0x3f, 0xc0, 0, 0] },
	{ value: 2 ** -149, wire: [0xfa, 0, 0, 0, 1] },
	{ value: -0, wire: [0xfa, 0x80, 0, 0, 0] },
	{ value: Number.NaN, wire: [0xfa, 0x7f, 0xc0, 0, 1] },
	{ value: 1.5, wire: [0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0] },
	{ value: -0, wire: [0xfb, 0x80, 0, 0, 0, 0, 0, 0, 0] },
	{ value: Number.MIN_VALUE, wire: [0xfb, 0, 0, 0, 0, 0, 0, 0, 1] },
	{ value: Number.NaN, wire: [0xfb, 0xff, 0xf8, 0, 0, 0, 0, 0, 1] },
])("preserves complete float width, sign and payload %#", ({ value, wire }) => {
	expect(encodeCtapCbor(float(value, wire))).toEqual(new Uint8Array(wire));
});

it.each([
	{ value: 0, wire: [0xf9, 0x80, 0] },
	{ value: -0, wire: [0xf9, 0, 0] },
	{ value: 1, wire: [0xf9, 0x3e, 0] },
	{ value: Number.NaN, wire: [0xf9, 0x7c, 0] },
	{ value: Number.POSITIVE_INFINITY, wire: [0xf9, 0x7e, 0] },
	{ value: Number.POSITIVE_INFINITY, wire: [0xf9, 0xfc, 0] },
	{ value: 1.5, wire: [0xfa, 0x3f, 0xc0, 0, 1] },
	{ value: 1.5, wire: [0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 1] },
	{ value: 0, wire: [] },
	{ value: 0, wire: [0] },
	{ value: 0, wire: [0x19, 0, 0] },
	{ value: 0, wire: [0x82, 0, 0] },
	{ value: 0, wire: [0xf9, 0] },
	{ value: 0, wire: [0xf9, 0, 0, 0] },
	{ value: 0, wire: [0xfa, 0, 0, 0] },
	{ value: 0, wire: [0xfa, 0, 0, 0, 0, 0] },
	{ value: 0, wire: [0xfb, 0, 0, 0, 0, 0, 0, 0] },
	{ value: 0, wire: [0xfb, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
])(
	"rejects float mismatches and incomplete/nonfloat wire %#",
	({ value, wire }) => {
		rejects(float(value, wire));
	},
);

it.each([
	{ value: "", wire: [0x60] },
	{ value: "\u0000", wire: [0x61, 0] },
	{ value: "é", wire: [0x62, 0xc3, 0xa9] },
	{ value: "e\u0301", wire: [0x63, 0x65, 0xcc, 0x81] },
	{ value: "\ufeff", wire: [0x63, 0xef, 0xbb, 0xbf] },
	{ value: "\ufeffA", wire: [0x64, 0xef, 0xbb, 0xbf, 0x41] },
	{ value: "😀", wire: [0x64, 0xf0, 0x9f, 0x98, 0x80] },
	{ value: "\udbff\udfff", wire: [0x64, 0xf4, 0x8f, 0xbf, 0xbf] },
])(
	"encodes exact UTF16 as UTF8 without normalization %#",
	({ value, wire }) => {
		expect(encodeCtapCbor(text(value))).toEqual(new Uint8Array(wire));
	},
);

it.each([
	"\ud800",
	"\udfff",
	"A\ud800",
	"\ud800A",
	"\udc00\ud800",
	"\ud800\ud800",
])("rejects malformed UTF16 %# instead of replacing it", (value) => {
	rejects(text(value));
});

it.each([
	{ length: 0, bytesHeader: [0x40], textHeader: [0x60], arrayHeader: [0x80] },
	{ length: 23, bytesHeader: [0x57], textHeader: [0x77], arrayHeader: [0x97] },
	{
		length: 24,
		bytesHeader: [0x58, 24],
		textHeader: [0x78, 24],
		arrayHeader: [0x98, 24],
	},
	{
		length: 255,
		bytesHeader: [0x58, 255],
		textHeader: [0x78, 255],
		arrayHeader: [0x98, 255],
	},
	{
		length: 256,
		bytesHeader: [0x59, 1, 0],
		textHeader: [0x79, 1, 0],
		arrayHeader: [0x99, 1, 0],
	},
])(
	"uses shortest byte/text/array length $length",
	({ length, bytesHeader, textHeader, arrayHeader }) => {
		expect(encodeCtapCbor(bytes(new Uint8Array(length)))).toEqual(
			new Uint8Array([...bytesHeader, ...new Array<number>(length).fill(0)]),
		);
		expect(encodeCtapCbor(text("a".repeat(length)))).toEqual(
			new Uint8Array([...textHeader, ...new Array<number>(length).fill(0x61)]),
		);
		expect(
			encodeCtapCbor(array(Array.from({ length }, () => unsigned(0n)))),
		).toEqual(
			new Uint8Array([...arrayHeader, ...new Array<number>(length).fill(0)]),
		);
	},
);

it.each([
	{ length: 0, header: [0xa0] },
	{ length: 23, header: [0xb7] },
	{ length: 24, header: [0xb8, 24] },
	{ length: 255, header: [0xb8, 255] },
	{ length: 256, header: [0xb9, 1, 0] },
])(
	"uses shortest map length $length and sorts reverse input",
	({ length, header }) => {
		const entries = Array.from(
			{ length },
			(_, index): [CtapCborValue, CtapCborValue] => [
				bytes(new Uint8Array([index])),
				unsigned(0n),
			],
		);
		const expected = new Uint8Array([
			...header,
			...Array.from({ length }, (_, index) => [0x41, index, 0]).flat(),
		]);
		expect(encodeCtapCbor(map(entries.reverse()))).toEqual(expected);
	},
);

it("counts root and empty containers toward the four-container depth bound", () => {
	expect(encodeCtapCbor(array([array([array([array([])])])]))).toEqual(
		new Uint8Array([0x81, 0x81, 0x81, 0x80]),
	);
	expect(
		encodeCtapCbor(
			map([[unsigned(0n), array([map([[unsigned(0n), array([])]])])]]),
		),
	).toEqual(new Uint8Array([0xa1, 0, 0x81, 0xa1, 0, 0x80]));
	rejects(array([array([array([array([array([])])])])]), "resource-limit");
	rejects(
		map([[unsigned(0n), array([map([[unsigned(0n), array([map([])])]])])]]),
		"resource-limit",
	);
});

it("terminates array, map and mutual cycles at the depth bound", () => {
	const items: CtapCborValue[] = [];
	const cyclicArray = array(items);
	items.push(cyclicArray);
	rejects(cyclicArray, "resource-limit");
	const entries: [CtapCborValue, CtapCborValue][] = [];
	const cyclicMap = map(entries);
	entries.push([unsigned(0n), cyclicMap]);
	rejects(cyclicMap, "resource-limit");
	items[0] = cyclicMap;
	entries[0][1] = cyclicArray;
	rejects(cyclicArray, "resource-limit");
});

it("allows repeated references that are not cycles", () => {
	const child = array([unsigned(1n)]);
	expect(encodeCtapCbor(array([child, child]))).toEqual(
		new Uint8Array([0x82, 0x81, 1, 0x81, 1]),
	);
});

it.each([
	{ keys: [negative(-1n), unsigned(24n)], wire: [0xa2, 0x18, 24, 0, 0x20, 0] },
	{ keys: [negative(-2n), negative(-1n)], wire: [0xa2, 0x20, 0, 0x21, 0] },
	{
		keys: [text("aa"), text("b")],
		wire: [0xa2, 0x61, 0x62, 0, 0x62, 0x61, 0x61, 0],
	},
	{ keys: [text("b"), text("a")], wire: [0xa2, 0x61, 0x61, 0, 0x61, 0x62, 0] },
	{
		keys: [bytes(new Uint8Array([2])), bytes(new Uint8Array([1]))],
		wire: [0xa2, 0x41, 1, 0, 0x41, 2, 0],
	},
	{
		keys: [unsigned(257n), unsigned(256n)],
		wire: [0xa2, 0x19, 1, 0, 0, 0x19, 1, 1, 0],
	},
	{
		keys: [text("a"), bytes(new Uint8Array([0x61]))],
		wire: [0xa2, 0x41, 0x61, 0, 0x61, 0x61, 0],
	},
	{ keys: [text("1"), unsigned(1n)], wire: [0xa2, 1, 0, 0x61, 0x31, 0] },
	{ keys: [simple(2), unsigned(2n)], wire: [0xa2, 2, 0, 0xe2, 0] },
	{
		keys: [text("e\u0301"), text("é")],
		wire: [0xa2, 0x62, 0xc3, 0xa9, 0, 0x63, 0x65, 0xcc, 0x81, 0],
	},
])(
	"sorts canonical keys by major, length and lexical bytes %#",
	({ keys, wire }) => {
		expect(encodeCtapCbor(map(keys.map((key) => [key, unsigned(0n)])))).toEqual(
			new Uint8Array(wire),
		);
	},
);

it.each([
	{ keys: [unsigned(1n), unsigned(1n)] },
	{ keys: [text("a"), text("a")] },
	{ keys: [bytes(new Uint8Array([1])), bytes(new Uint8Array([1]))] },
	{ keys: [simple(21), simple(21)] },
	{ keys: [unsigned(1n), float(1, [0xf9, 0x3c, 0])] },
	{ keys: [negative(-1n), float(-1, [0xf9, 0xbc, 0])] },
	{ keys: [unsigned(0n), float(-0, [0xf9, 0x80, 0])] },
	{ keys: [float(0, [0xf9, 0, 0]), float(-0, [0xf9, 0x80, 0])] },
	{ keys: [float(1.5, [0xf9, 0x3e, 0]), float(1.5, [0xfa, 0x3f, 0xc0, 0, 0])] },
	{
		keys: [
			float(Number.POSITIVE_INFINITY, [0xf9, 0x7c, 0]),
			float(Number.POSITIVE_INFINITY, [0xfa, 0x7f, 0x80, 0, 0]),
		],
	},
	{
		keys: [
			unsigned(9007199254740992n),
			float(9007199254740992, [0xfb, 0x43, 0x40, 0, 0, 0, 0, 0, 0]),
		],
	},
	{
		keys: [
			negative(-18446744073709551616n),
			float(-(2 ** 64), [0xfb, 0xc3, 0xf0, 0, 0, 0, 0, 0, 0]),
		],
	},
	{
		keys: [
			float(Number.NaN, [0xf9, 0x7e, 0]),
			float(Number.NaN, [0xf9, 0xfe, 0]),
		],
	},
	{
		keys: [
			float(Number.NaN, [0xf9, 0x7e, 0]),
			float(Number.NaN, [0xfa, 0x7f, 0xc0, 0, 0]),
		],
	},
	{
		keys: [
			float(Number.NaN, [0xf9, 0x7c, 1]),
			float(Number.NaN, [0xfa, 0x7f, 0x80, 0x20, 0]),
		],
	},
	{
		keys: [
			float(Number.NaN, [0xfa, 0x7f, 0xc0, 0, 0]),
			float(Number.NaN, [0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0]),
		],
	},
])("rejects typed and numerically equivalent duplicate keys %#", ({ keys }) => {
	rejects(map(keys.map((key, index) => [key, unsigned(BigInt(index))])));
});

it.each([
	{
		keys: [
			unsigned(9007199254740993n),
			float(9007199254740992, [0xfb, 0x43, 0x40, 0, 0, 0, 0, 0, 0]),
		],
		wire: [
			0xa2, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1, 0, 0xfb, 0x43, 0x40, 0, 0, 0, 0, 0,
			0, 0,
		],
	},
	{
		keys: [
			unsigned(18446744073709551615n),
			float(2 ** 64, [0xfb, 0x43, 0xf0, 0, 0, 0, 0, 0, 0]),
		],
		wire: [
			0xa2, 0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0xfb, 0x43,
			0xf0, 0, 0, 0, 0, 0, 0, 0,
		],
	},
	{
		keys: [
			float(Number.NaN, [0xf9, 0x7e, 1]),
			float(Number.NaN, [0xf9, 0x7e, 2]),
		],
		wire: [0xa2, 0xf9, 0x7e, 1, 0, 0xf9, 0x7e, 2, 0],
	},
	{
		keys: [
			float(Number.NaN, [0xf9, 0x7e, 0]),
			float(Number.NaN, [0xfa, 0x7f, 0xc0, 0, 1]),
		],
		wire: [0xa2, 0xf9, 0x7e, 0, 0, 0xfa, 0x7f, 0xc0, 0, 1, 0],
	},
	{
		keys: [
			float(Number.NaN, [0xfa, 0x7f, 0xc0, 0, 0]),
			float(Number.NaN, [0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 1]),
		],
		wire: [
			0xa2, 0xfa, 0x7f, 0xc0, 0, 0, 0, 0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 1, 0,
		],
	},
	{
		keys: [
			float(1.5, [0xf9, 0x3e, 0]),
			float(1.5000001192092896, [0xfa, 0x3f, 0xc0, 0, 1]),
		],
		wire: [0xa2, 0xf9, 0x3e, 0, 0, 0xfa, 0x3f, 0xc0, 0, 1, 0],
	},
])(
	"preserves adjacent exact numeric and low-significand keys %#",
	({ keys, wire }) => {
		expect(
			encodeCtapCbor(
				map([...keys].reverse().map((key) => [key, unsigned(0n)])),
			),
		).toEqual(new Uint8Array(wire));
	},
);

it.each([{ key: array([]) }, { key: map([]) }])(
	"rejects container map keys as unsupported %#",
	({ key }) => {
		rejects(map([[key, unsigned(0n)]]), "unsupported");
	},
);

it("enforces exactly 7609 output bytes including scalar headers", () => {
	const expectedBytes = new Uint8Array(7609);
	expectedBytes.set([0x59, 0x1d, 0xb6]);
	expect(encodeCtapCbor(bytes(new Uint8Array(7606)))).toEqual(expectedBytes);
	rejects(bytes(new Uint8Array(7607)), "resource-limit");
	const expectedText = new Uint8Array(7609).fill(0x61);
	expectedText.set([0x79, 0x1d, 0xb6]);
	expect(encodeCtapCbor(text("a".repeat(7606)))).toEqual(expectedText);
	rejects(text("a".repeat(7607)), "resource-limit");
	const expectedUnicode = new Uint8Array([
		0x79,
		0x1d,
		0xb6,
		...Array.from({ length: 3803 }, () => [0xc3, 0xa9]).flat(),
	]);
	expect(encodeCtapCbor(text("é".repeat(3803)))).toEqual(expectedUnicode);
	rejects(text(`${"é".repeat(3803)}a`), "resource-limit");
});

it("includes array and map overhead in the exact byte budget", () => {
	const expectedArray = new Uint8Array(7609);
	expectedArray.set([0x81, 0x59, 0x1d, 0xb5]);
	expect(encodeCtapCbor(array([bytes(new Uint8Array(7605))]))).toEqual(
		expectedArray,
	);
	rejects(array([bytes(new Uint8Array(7606))]), "resource-limit");
	const expectedMap = new Uint8Array(7609);
	expectedMap.set([0xa1, 0, 0x59, 0x1d, 0xb4]);
	expect(
		encodeCtapCbor(map([[unsigned(0n), bytes(new Uint8Array(7604))]])),
	).toEqual(expectedMap);
	rejects(map([[unsigned(0n), bytes(new Uint8Array(7605))]]), "resource-limit");
});

it.each(
	[
		undefined,
		null,
		true,
		1,
		1n,
		"text",
		[],
		{},
		{ kind: "SYNTHETIC_PRIVATE" },
		{ kind: "unsigned", value: -1n },
		{ kind: "unsigned", value: 18446744073709551616n },
		{ kind: "unsigned", value: 1 },
		{ kind: "unsigned", value: "1" },
		{ kind: "negative", value: 0n },
		{ kind: "negative", value: -18446744073709551617n },
		{ kind: "negative", value: -1 },
		{ kind: "text", value: new String("a") },
		{ kind: "text", value: 1 },
		{ kind: "simple", value: -1 },
		{ kind: "simple", value: 24 },
		{ kind: "simple", value: 31 },
		{ kind: "simple", value: 256 },
		{ kind: "simple", value: 1.5 },
		{ kind: "simple", value: Number.NaN },
		{ kind: "simple", value: Number.POSITIVE_INFINITY },
		{ kind: "simple", value: 1n },
		{ kind: "simple", value: false },
		{ kind: "float", value: "0", encoding: new Uint8Array([0xf9, 0, 0]) },
		{
			kind: "float",
			value: new Number(0),
			encoding: new Uint8Array([0xf9, 0, 0]),
		},
		{ kind: "float", value: 0 },
		{ kind: "bytes" },
		{ kind: "array", items: { 0: unsigned(0n), length: 1 } },
		{ kind: "array", items: new Set([unsigned(0n)]) },
		{ kind: "array", items: new Array(1) },
		{ kind: "map", entries: new Map() },
		{ kind: "map", entries: new Array(1) },
		{ kind: "map", entries: [[unsigned(0n)]] },
		{ kind: "map", entries: [[unsigned(0n), unsigned(0n), unsigned(0n)]] },
		{ kind: "map", entries: [new Array(2)] },
		{ kind: "map", entries: [{ 0: unsigned(0n), 1: unsigned(0n), length: 2 }] },
	].map((input) => ({ input })),
)("rejects malformed shapes and ranges %#", ({ input }) => {
	rejects(input);
});

it.each([
	{ make: () => [0xf9, 0, 0] },
	{ make: () => new ArrayBuffer(3) },
	{ make: () => new DataView(new ArrayBuffer(3)) },
	{ make: () => new Uint16Array(3) },
	{ make: () => new Uint8ClampedArray(3) },
	{ make: () => Object.create(Uint8Array.prototype) },
	{
		make: () => ({
			0: 0xf9,
			1: 0,
			2: 0,
			length: 3,
			[Symbol.toStringTag]: "Uint8Array",
		}),
	},
	{ make: () => new Proxy(new Uint8Array([0xf9, 0, 0]), {}) },
	{ make: () => new Uint8Array(new SharedArrayBuffer(3)) },
	{
		make: () => {
			const backing = new ArrayBuffer(3);
			const view = new Uint8Array(backing);
			structuredClone(backing, { transfer: [backing] });
			return view;
		},
	},
])(
	"rejects wrong-brand, forged, proxy, shared and detached byte views %#",
	({ make }) => {
		rejects({ kind: "bytes", value: make() });
		rejects({ kind: "float", value: 0, encoding: make() });
	},
);

it("copies exact empty, offset and Buffer views and returns independently owned output", () => {
	const backing = new Uint8Array([0xff, 1, 2, 0xff]);
	const view = backing.subarray(1, 3);
	const encoded = encodeCtapCbor(bytes(view));
	expect(encoded).toEqual(new Uint8Array([0x42, 1, 2]));
	expect(backing).toEqual(new Uint8Array([0xff, 1, 2, 0xff]));
	expect(encoded.buffer).not.toBe(backing.buffer);
	view.fill(9);
	expect(encoded).toEqual(new Uint8Array([0x42, 1, 2]));
	encoded.fill(7);
	expect(backing).toEqual(new Uint8Array([0xff, 9, 9, 0xff]));
	const bufferView = Buffer.from([0xff, 1, 2, 0xff]).subarray(1, 3);
	expect(encodeCtapCbor(bytes(bufferView))).toEqual(
		new Uint8Array([0x42, 1, 2]),
	);
	expect(encodeCtapCbor(bytes(new Uint8Array(backing.buffer, 4, 0)))).toEqual(
		new Uint8Array([0x40]),
	);
	expect(encodeCtapCbor(bytes(Buffer.alloc(0)))).toEqual(
		new Uint8Array([0x40]),
	);
	const encoding = Buffer.from([0xff, 0xf9, 0x3e, 0, 0xff]).subarray(1, 4);
	const encodedFloat = encodeCtapCbor({ kind: "float", value: 1.5, encoding });
	expect(encoding).toEqual(Buffer.from([0xf9, 0x3e, 0]));
	encoding.fill(0);
	expect(encodedFloat).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
	encodeCtapCbor(unsigned(1n));
	expect(encodedFloat).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
});

it("bypasses byte-view getters, iterators and species for byte and float copies", () => {
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const kind of ["bytes", "float"] as const) {
		const view = new Uint8Array([0xff, 0xf9, 0x3e, 0, 0xff]).subarray(1, 4);
		for (const property of [
			"length",
			"byteLength",
			"byteOffset",
			"buffer",
			"constructor",
			"slice",
			"subarray",
			Symbol.toStringTag,
			Symbol.iterator,
		])
			Object.defineProperty(view, property, { get: hook });
		const input: CtapCborValue =
			kind === "bytes" ? bytes(view) : { kind, value: 1.5, encoding: view };
		expect(encodeCtapCbor(input)).toEqual(
			new Uint8Array(
				kind === "bytes" ? [0x43, 0xf9, 0x3e, 0] : [0xf9, 0x3e, 0],
			),
		);
	}
	expect(hook).not.toHaveBeenCalled();
});

type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
const ResizableArrayBuffer = ArrayBuffer as unknown as new (
	length: number,
	options: { maxByteLength: number },
) => ResizableBuffer;

it("accepts genuine empty, tracking and resized-valid RAB byte views", () => {
	const backing = new ResizableArrayBuffer(0, { maxByteLength: 16 });
	const tracking = new Uint8Array(backing);
	expect(encodeCtapCbor(bytes(tracking))).toEqual(new Uint8Array([0x40]));
	backing.resize(4);
	tracking.set([1, 2, 3, 4]);
	expect(encodeCtapCbor(bytes(tracking))).toEqual(
		new Uint8Array([0x44, 1, 2, 3, 4]),
	);
	const fixed = new Uint8Array(backing, 1, 2);
	backing.resize(3);
	expect(encodeCtapCbor(bytes(fixed))).toEqual(new Uint8Array([0x42, 2, 3]));
	expect(encodeCtapCbor(bytes(tracking))).toEqual(
		new Uint8Array([0x43, 1, 2, 3]),
	);
	backing.resize(0);
	expect(encodeCtapCbor(bytes(tracking))).toEqual(new Uint8Array([0x40]));
});

it("distinguishes out-of-bounds RAB views from genuine zero-length views", () => {
	const backing = new ResizableArrayBuffer(16, { maxByteLength: 32 });
	const fixed = new Uint8Array(backing, 8, 4);
	const empty = new Uint8Array(backing, 8, 0);
	const trackingOffset = new Uint8Array(backing, 8);
	backing.resize(4);
	for (const view of [fixed, empty, trackingOffset]) rejects(bytes(view));
	backing.resize(8);
	expect(encodeCtapCbor(bytes(empty))).toEqual(new Uint8Array([0x40]));
	expect(encodeCtapCbor(bytes(trackingOffset))).toEqual(new Uint8Array([0x40]));
	rejects(bytes(fixed));
});

it("accepts resized-valid float views but rejects OOB or resized incomplete encodings", () => {
	const backing = new ResizableArrayBuffer(8, { maxByteLength: 16 });
	const fixed = new Uint8Array(backing, 2, 3);
	fixed.set([0xf9, 0x3e, 0]);
	backing.resize(5);
	expect(
		encodeCtapCbor({ kind: "float", value: 1.5, encoding: fixed }),
	).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
	const tracking = new Uint8Array(backing, 2);
	expect(
		encodeCtapCbor({ kind: "float", value: 1.5, encoding: tracking }),
	).toEqual(new Uint8Array([0xf9, 0x3e, 0]));
	backing.resize(4);
	rejects({ kind: "float", value: 1.5, encoding: fixed });
	rejects({ kind: "float", value: 1.5, encoding: tracking });
});

it("captures used object fields once and ignores unrelated throwing getters", () => {
	const fixtures: CtapCborValue[] = [
		unsigned(1n),
		negative(-1n),
		bytes(new Uint8Array([1])),
		text("a"),
		simple(21),
		float(1.5, [0xf9, 0x3e, 0]),
		array([unsigned(0n)]),
		map([[unsigned(0n), unsigned(1n)]]),
	];
	const wires = [
		[1],
		[0x20],
		[0x41, 1],
		[0x61, 0x61],
		[0xf5],
		[0xf9, 0x3e, 0],
		[0x81, 0],
		[0xa1, 0, 1],
	];
	for (const [index, fixture] of fixtures.entries()) {
		const input: Record<string, unknown> = {};
		const getters = Object.entries(fixture).map(([property, value]) => {
			const getter = vi
				.fn()
				.mockReturnValueOnce(value)
				.mockImplementation(() => {
					throw new Error("SYNTHETIC_PRIVATE");
				});
			Object.defineProperty(input, property, { get: getter });
			return getter;
		});
		const ignored = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		Object.defineProperty(input, "unrelated", { get: ignored });
		expect(encodeCtapCbor(input as CtapCborValue)).toEqual(
			new Uint8Array(wires[index]),
		);
		for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
		expect(ignored).not.toHaveBeenCalled();
	}
});

it("reads collection lengths and indexed entries once without using custom iterators", () => {
	const iterator = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const observed: Map<PropertyKey, number>[] = [];
	function observe<Value>(values: Value[]): Value[] {
		const reads = new Map<PropertyKey, number>();
		observed.push(reads);
		Object.defineProperty(values, Symbol.iterator, { get: iterator });
		return new Proxy(values, {
			get(target, property, receiver) {
				if (
					property === "length" ||
					(typeof property === "string" && /^\d+$/.test(property))
				) {
					const count = (reads.get(property) ?? 0) + 1;
					reads.set(property, count);
					if (count > 1) throw new Error("SYNTHETIC_PRIVATE");
				}
				return Reflect.get(target, property, receiver);
			},
		});
	}
	const items = observe([unsigned(2n)]);
	const entry = observe([unsigned(1n), array(items)]) as [
		CtapCborValue,
		CtapCborValue,
	];
	const entries = observe([entry]);
	expect(encodeCtapCbor(map(entries))).toEqual(
		new Uint8Array([0xa1, 1, 0x81, 2]),
	);
	expect(iterator).not.toHaveBeenCalled();
	for (const reads of observed) {
		expect(reads.get("length")).toBe(1);
		expect(reads.get("0")).toBe(1);
		for (const count of reads.values()) expect(count).toBe(1);
	}
	expect(observed[1].get("1")).toBe(1);
});

it("rejects oversized collection lengths before reading elements or allocating from them", () => {
	for (const kind of ["array", "map"] as const) {
		const element = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		const length = vi.fn(() => 7610);
		const collection = new Proxy([], {
			get(target, property, receiver) {
				if (property === "length") return length();
				if (property === "0") return element();
				return Reflect.get(target, property, receiver);
			},
		});
		rejects(
			kind === "array" ? array(collection) : map(collection),
			"resource-limit",
		);
		expect(length).toHaveBeenCalledTimes(1);
		expect(element).not.toHaveBeenCalled();
	}
});

it("does not sort or mutate frozen caller containers and leaves bytes intact after failure", () => {
	const payload = new Uint8Array([1, 2]);
	const entryHigh = Object.freeze([text("b"), bytes(payload)] as const);
	const entryLow = Object.freeze([text("a"), unsigned(0n)] as const);
	const entries = Object.freeze([entryHigh, entryLow]);
	const input = Object.freeze(map(entries));
	expect(encodeCtapCbor(input)).toEqual(
		new Uint8Array([0xa2, 0x61, 0x61, 0, 0x61, 0x62, 0x42, 1, 2]),
	);
	expect(entries[0]).toBe(entryHigh);
	expect(entries[1]).toBe(entryLow);
	const frozenArray = Object.freeze(array(Object.freeze([unsigned(1n)])));
	expect(encodeCtapCbor(frozenArray)).toEqual(new Uint8Array([0x81, 1]));
	rejects(array([bytes(payload), text("\ud800")]));
	expect(payload).toEqual(new Uint8Array([1, 2]));
});

it.each([
	{ thrown: new Error("SYNTHETIC_PRIVATE") },
	{ thrown: "SYNTHETIC_PRIVATE" },
	{ thrown: new AgentBrowserError("resource-limit", "SYNTHETIC_PRIVATE") },
	{ thrown: new AgentBrowserError("unsupported", "SYNTHETIC_PRIVATE") },
	{
		thrown: {
			message: "SYNTHETIC_PRIVATE",
			cause: "SYNTHETIC_PRIVATE",
			path: "SYNTHETIC_PRIVATE",
		},
	},
])(
	"sanitizes caller-thrown errors into fresh fixed-message failures %#",
	({ thrown }) => {
		const baseline = rejects(null);
		const input = {
			get kind() {
				throw thrown;
			},
		};
		const first = rejects(input);
		const second = rejects(input);
		expect(first).not.toBe(thrown);
		expect(second).not.toBe(first);
		expect(first.message).toBe(baseline.message);
		expect(second.message).toBe(baseline.message);
	},
);

it("sanitizes nested value, tuple and collection hooks without coercing thrown objects", () => {
	const coercion = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const thrown = Object.defineProperties(
		{},
		{
			message: { get: coercion },
			cause: { get: coercion },
			code: { get: coercion },
			[Symbol.toPrimitive]: { get: coercion },
		},
	);
	const valueHook = {
		kind: "text",
		get value() {
			throw thrown;
		},
	};
	const tuple = [unsigned(0n), unsigned(0n)];
	Object.defineProperty(tuple, "1", {
		get() {
			throw thrown;
		},
	});
	const collection = new Proxy([], {
		get() {
			throw thrown;
		},
	});
	const baseline = rejects(null).message;
	for (const input of [
		valueHook,
		{ kind: "map", entries: [tuple] },
		array(collection),
	]) {
		expect(rejects(input).message).toBe(baseline);
	}
	expect(coercion).not.toHaveBeenCalled();
});
