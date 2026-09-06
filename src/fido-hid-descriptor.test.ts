import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	type FidoHidReportLayout,
	discoverFidoHidReportLayouts,
} from "./fido-hid-descriptor.js";

const application = [0x06, 0xd0, 0xf1, 0x09, 0x01, 0xa1, 0x01];
const globals = [0x15, 0, 0x26, 0xff, 0, 0x75, 8, 0x95, 64];
const rawInput = [0x09, 0x37, 0x81, 2];
const rawOutput = [0x09, 0x91, 0x91, 2];
const canonical = new Uint8Array([
	0x06, 0xd0, 0xf1, 0x09, 0x01, 0xa1, 0x01, 0x15, 0, 0x26, 0xff, 0, 0x75, 8,
	0x95, 64, 0x09, 0x37, 0x81, 2, 0x09, 0x91, 0x91, 2, 0xc0,
]);
const canonicalLayout = [
	{
		collectionOffset: 5,
		input: { reportId: 0, reportBytes: 64 },
		output: { reportId: 0, reportBytes: 64 },
	},
];
const invalidMessage = "Invalid HID report descriptor.";
const unsupportedMessage = "Unsupported FIDO HID report layout.";
const limitMessage = "HID report descriptor limit exceeded.";

function descriptor(...chunks: readonly number[][]): Uint8Array {
	return new Uint8Array(chunks.flat());
}

function fido(...body: readonly number[][]): Uint8Array {
	return descriptor(application, globals, ...body, [0xc0]);
}

function nonFido(...body: readonly number[][]): Uint8Array {
	return descriptor(
		[0x05, 1, 0x09, 6, 0xa1, 1, 0x75, 1, 0x95, 1],
		...body,
		[0xc0],
	);
}

function repeated(bytes: readonly number[], count: number): number[] {
	const result: number[] = [];
	for (let index = 0; index < count; index++) result.push(...bytes);
	return result;
}

function rejects(
	bytes: unknown,
	code: ErrorCode = "invalid-input",
	message = invalidMessage,
): void {
	let caught: unknown;
	try {
		discoverFidoHidReportLayouts(bytes as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code, message });
	expect(caught).not.toHaveProperty("offset");
	expect(caught).not.toHaveProperty("cause");
}

function unsupported(bytes: Uint8Array): void {
	rejects(bytes, "unsupported", unsupportedMessage);
}

function limited(bytes: Uint8Array): void {
	rejects(bytes, "resource-limit", limitMessage);
}

it("discovers an independent unnumbered 64-byte candidate", () => {
	expect(discoverFidoHidReportLayouts(canonical)).toEqual(canonicalLayout);
});

it("discovers independent numbered asymmetric 7/64-byte payloads", () => {
	const bytes = new Uint8Array([
		0x06, 0xd0, 0xf1, 0x09, 1, 0xa1, 1, 0x85, 3, 0x15, 0, 0x25, 0xff, 0x75, 8,
		0x95, 7, 0x09, 0x53, 0x81, 2, 0x85, 9, 0x95, 64, 0x09, 0xa7, 0x91, 2, 0xc0,
	]);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 3, reportBytes: 7 },
			output: { reportId: 9, reportBytes: 64 },
		},
	]);
});

it("keeps opposite asymmetric lengths and report ID 255 independent", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido([0x85, 255], rawInput, [0x85, 1, 0x95, 7], rawOutput),
		),
	).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 255, reportBytes: 64 },
			output: { reportId: 1, reportBytes: 7 },
		},
	]);
});

it("accounts for all split raw fields rather than the first contribution", () => {
	const bytes = new Uint8Array([
		0x06, 0xd0, 0xf1, 0x09, 1, 0xa1, 1, 0x15, 0, 0x26, 0xff, 0, 0x75, 8, 0x95,
		3, 0x09, 0x40, 0x81, 2, 0x95, 4, 0x09, 0x41, 0x81, 2, 0x95, 32, 0x09, 0x42,
		0x91, 2, 0x09, 0x43, 0x91, 2, 0xc0,
	]);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 0, reportBytes: 7 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("accepts 1/2/4-byte numeric globals, flags and local usages", () => {
	const bytes = descriptor(
		[0x07, 0xd0, 0xf1, 0, 0, 0x0a, 1, 0, 0xa1, 1],
		[0x17, 0, 0, 0, 0, 0x27, 0xff, 0, 0, 0],
		[0x76, 8, 0, 0x97, 64, 0, 0, 0],
		[0x0a, 0x34, 0x12, 0x82, 2, 0],
		[0x0b, 0x78, 0x56, 0xd0, 0xf1, 0x93, 2, 0, 0, 0, 0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 8,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("does not invent numeric data-in or data-out usage requirements", () => {
	for (const usage of [0, 1, 0x37, 0x91, 255]) {
		expect(
			discoverFidoHidReportLayouts(
				fido([0x09, usage, 0x81, 2, 0x09, usage, 0x91, 2]),
			),
		).toEqual(canonicalLayout);
	}
});

it("returns no candidates for empty or structurally checked non-FIDO input", () => {
	for (const bytes of [
		new Uint8Array(),
		nonFido([0x81, 1, 0x91, 0, 0xb1, 7]),
		descriptor([0x05, 1, 0x09, 6, 0xa1, 1, 0xc0]),
		descriptor([0x05, 1, 0x09, 6]),
	])
		expect(discoverFidoHidReportLayouts(bytes)).toEqual([]);
});

it("does not identify FIDO from page alone, usage alone or physical type", () => {
	for (const opening of [
		[0x06, 0xd0, 0xf1, 0x09, 2, 0xa1, 1],
		[0x05, 1, 0x09, 1, 0xa1, 1],
		[0x06, 0xd0, 0xf1, 0x09, 1, 0xa1, 0],
		[0x06, 0xd0, 0xf1, 0x09, 1, 0xa1, 2],
	])
		expect(discoverFidoHidReportLayouts(descriptor(opening, [0xc0]))).toEqual(
			[],
		);
});

it("finds a numbered FIDO candidate after an independent non-FIDO report", () => {
	const bytes = descriptor(
		[0x05, 1, 0x09, 6, 0xa1, 1, 0x85, 2, 0x75, 1, 0x95, 1, 0x81, 1, 0xc0],
		[...fido([0x85, 1], rawInput, rawOutput)],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 20,
			input: { reportId: 1, reportBytes: 64 },
			output: { reportId: 1, reportBytes: 64 },
		},
	]);
});

it("returns every independent FIDO Application in descriptor order", () => {
	const bytes = descriptor(
		[...fido([0x85, 9], rawInput, rawOutput)],
		[...fido([0x85, 2, 0x95, 7], rawInput, rawOutput)],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 9, reportBytes: 64 },
			output: { reportId: 9, reportBytes: 64 },
		},
		{
			collectionOffset: 32,
			input: { reportId: 2, reportBytes: 7 },
			output: { reportId: 2, reportBytes: 7 },
		},
	]);
});

it("rejects shared groups even between Applications with identical FIDO usage", () => {
	unsupported(
		descriptor(
			[...fido([0x85, 1, 0x95, 7], rawInput, rawOutput)],
			[...fido([0x85, 1, 0x95, 7], rawInput, rawOutput)],
		),
	);
});

it("rejects unrelated fields sharing a selected group before or after FIDO", () => {
	const candidate = [...fido([0x85, 1, 0x95, 7], rawInput, rawOutput)];
	for (const direction of [0x81, 0x91]) {
		for (const field of [
			[direction, 1],
			[0x09, 0x37, direction, 2],
		]) {
			const unrelated = [...nonFido([0x85, 1], field)];
			unsupported(descriptor(candidate, unrelated));
			unsupported(descriptor(unrelated, candidate));
		}
	}
});

it("keeps equal numeric IDs in different report directions separate", () => {
	const bytes = descriptor(
		[...fido([0x85, 1], rawInput, [0x85, 2], rawOutput)],
		[...nonFido([0x85, 2, 0x81, 1, 0x85, 1, 0x91, 1, 0xb1, 1])],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 1, reportBytes: 64 },
			output: { reportId: 2, reportBytes: 64 },
		},
	]);
});

it("retains nearest Application ownership through physical and logical children", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0x09, 2, 0xa1, 0],
				rawInput,
				[0xc0, 0x09, 3, 0xa1, 2],
				rawOutput,
				[0xc0],
			),
		),
	).toEqual(canonicalLayout);
});

it("discovers an Application inside a non-Application root collection", () => {
	const bytes = descriptor([0x05, 1, 0x09, 6, 0xa1, 0], [...canonical], [0xc0]);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 11,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("assigns nested FIDO Applications their own identity", () => {
	const bytes = fido(
		[0x85, 1],
		rawInput,
		rawOutput,
		[0x09, 1, 0xa1, 1, 0x85, 2],
		rawInput,
		rawOutput,
		[0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 1, reportBytes: 64 },
			output: { reportId: 1, reportBytes: 64 },
		},
		{
			collectionOffset: 28,
			input: { reportId: 2, reportBytes: 64 },
			output: { reportId: 2, reportBytes: 64 },
		},
	]);
});

it("does not borrow nested Application fields to complete its FIDO parent", () => {
	unsupported(
		fido([0x85, 1], rawInput, [0x09, 2, 0xa1, 1, 0x85, 2], rawOutput, [0xc0]),
	);
});

it("restores parent ownership after a nested unrelated Application closes", () => {
	const bytes = fido(
		[0x85, 1],
		rawInput,
		[0xa4, 0x09, 2, 0xa1, 1, 0x85, 2, 0x75, 1, 0x95, 1, 0x81, 1, 0xc0, 0xb4],
		rawOutput,
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 1, reportBytes: 64 },
			output: { reportId: 1, reportBytes: 64 },
		},
	]);
});

it("rejects nested unrelated padding sharing the exact selected report", () => {
	unsupported(
		fido(
			[0x95, 7],
			rawInput,
			rawOutput,
			[0x09, 2, 0xa1, 1, 0x95, 1, 0x81, 1, 0xc0],
		),
	);
});

it("requires exactly one input and one output group for every FIDO Application", () => {
	for (const body of [
		[],
		rawInput,
		rawOutput,
		[0x09, 2, 0xb1, 2],
		[0x85, 1, ...rawInput, ...rawOutput, 0x85, 2, ...rawInput],
		[0x85, 1, ...rawInput, ...rawOutput, 0x85, 2, ...rawOutput],
	])
		unsupported(fido(body));
});

it("counts Feature fields structurally without selecting or qualifying them", () => {
	const bytes = fido(
		rawInput,
		[0x75, 1, 0x95, 1, 0xb1, 1, 0x75, 8, 0x95, 64],
		rawOutput,
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual(canonicalLayout);
	expect(
		discoverFidoHidReportLayouts(
			descriptor([...canonical], [...nonFido([0xb1, 1])]),
		),
	).toEqual(canonicalLayout);
	rejects(fido(rawInput, rawOutput, [0x95, 0, 0xb1, 1]));
});

it("rejects padding and missing usages rather than reporting a FIDO sublength", () => {
	for (const field of [
		[0x81, 1],
		[0x09, 0x37, 0x81, 1],
		[0x81, 2],
		[0x75, 1, 0x81, 1],
	])
		unsupported(fido([0x95, 7], rawInput, rawOutput, [0x95, 1], field));
	unsupported(fido([0x81, 2], rawOutput));
	unsupported(fido(rawInput, [0x91, 2]));
});

it("requires flags exactly Data/Variable/Absolute for every selected field", () => {
	for (const flags of [0, 1, 3, 4, 6, 0x12, 0x42, 0x82, 0xff]) {
		unsupported(fido([0x09, 0x37, 0x81, flags], rawOutput));
		unsupported(fido(rawInput, [0x09, 0x91, 0x91, flags]));
	}
	unsupported(fido([0x09, 0x37, 0x82, 2, 1], rawOutput));
	unsupported(fido([0x09, 0x37, 0x83, 2, 0, 0, 0x80], rawOutput));
});

it("requires byte-sized selected fields without rounding fractional reports", () => {
	for (const size of [1, 4, 7, 9, 16])
		unsupported(fido([0x75, size, 0x95, 7], rawInput, rawOutput));
	unsupported(
		fido([0x75, 4, 0x95, 14], rawInput, [0x75, 8, 0x95, 7], rawOutput),
	);
});

it("requires precisely the 0..255 logical range in selected reports", () => {
	for (const bounds of [
		[0x15, 1],
		[0x25, 0xfe],
		[0x26, 0, 1],
		[0x15, 0xff, 0x25, 0x7f],
		[0x15, 0xff, 0x25, 0xff],
	])
		unsupported(fido(bounds, rawInput, rawOutput));
});

it("requires every selected usage interval to belong to the FIDO page", () => {
	for (const usages of [
		[0x0b, 0x37, 0, 1, 0],
		[0x09, 0x37, 0x0b, 0x38, 0, 1, 0],
		[0x1b, 0, 0, 1, 0, 0x2b, 0xff, 0xff, 1, 0],
	])
		unsupported(fido(usages, [0x81, 2], rawOutput));
});

it("enforces 7..64 payload bytes on both directions including split totals", () => {
	for (const count of [1, 6, 65, 255]) {
		unsupported(fido([0x95, count], rawInput, [0x95, 64], rawOutput));
		unsupported(fido(rawInput, [0x95, count], rawOutput));
	}
	unsupported(fido([0x95, 32], rawInput, rawInput, rawInput, rawOutput));
	unsupported(fido([0x95, 3], rawInput, rawInput, [0x95, 7], rawOutput));
});

it("restores all tracked globals with nested Push and Pop", () => {
	const bytes = fido(
		[0x85, 4, 0xa4, 0x85, 5, 0x95, 7, 0xa4],
		[0x05, 1, 0x15, 0xff, 0x25, 0x7f, 0x75, 1, 0x95, 1, 0x85, 6],
		[0x09, 6, 0xa1, 1, 0x81, 1, 0xc0, 0xb4],
		rawInput,
		[0xb4],
		rawOutput,
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 5, reportBytes: 7 },
			output: { reportId: 4, reportBytes: 64 },
		},
	]);
});

it("does not clear pending locals when size, count, ID or logical globals change", () => {
	const bytes = fido(
		[0x09, 0x37, 0x75, 8, 0x95, 7, 0x15, 0, 0x25, 255, 0x85, 3, 0x81, 2],
		rawOutput,
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 5,
			input: { reportId: 3, reportBytes: 7 },
			output: { reportId: 3, reportBytes: 7 },
		},
	]);
});

it("does not save or restore local usages with global Push and Pop", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido([0xa4, 0x09, 0x37, 0xb4, 0x81, 2], rawOutput),
		),
	).toEqual(canonicalLayout);
	unsupported(fido([0x09, 0x37, 0xa4, 0x81, 2, 0xb4, 0x91, 2]));
});

it("rejects global stack underflow and an unclosed stack at EOF", () => {
	for (const bytes of [
		descriptor([0xb4]),
		descriptor([0xa4]),
		descriptor([0xa4, 0xb4, 0xb4]),
		descriptor([...canonical, 0xa4]),
	])
		rejects(bytes);
});

it("clears usages after Input, Output and Feature main items", () => {
	for (const first of [0x81, 0x91, 0xb1])
		unsupported(fido([0x09, 0x37, first, 2, 0x81, 2], rawOutput));
});

it("clears usages after Collection and EndCollection main items", () => {
	unsupported(fido([0x81, 2], rawOutput));
	unsupported(fido([0x09, 2, 0xa1, 0, 0x09, 0x37, 0xc0, 0x81, 2], rawOutput));
	rejects(descriptor([0x05, 1, 0x09, 6, 0xa1, 1, 0xa1, 0, 0xc0, 0xc0]));
	rejects(
		descriptor([0x05, 1, 0x09, 6, 0xa1, 1, 0x09, 7, 0xc0, 0xa1, 1, 0xc0]),
	);
});

it("uses the first declared resolved usage rather than searching later usages", () => {
	expect(
		discoverFidoHidReportLayouts(
			descriptor([0x06, 0xd0, 0xf1, 0x09, 2, 0x09, 1, 0xa1, 1, 0xc0]),
		),
	).toEqual([]);
	const bytes = descriptor(
		[0x06, 0xd0, 0xf1, 0x09, 1, 0x09, 2, 0xa1, 1],
		globals,
		rawInput,
		rawOutput,
		[0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 7,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("resolves complete extended usages independently of the current UsagePage", () => {
	const bytes = descriptor(
		[0x05, 1, 0x0b, 1, 0, 0xd0, 0xf1, 0xa1, 1],
		globals,
		[0x0b, 0x37, 0, 0xd0, 0xf1, 0x81, 2],
		[0x0b, 0x91, 0, 0xd0, 0xf1, 0x91, 2, 0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 7,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("represents full 65536-usage intervals without expanding their values", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0x1a, 0, 0, 0x2a, 0xff, 0xff, 0x81, 2],
				[0x1b, 0, 0, 0xd0, 0xf1, 0x2b, 0xff, 0xff, 0xd0, 0xf1, 0x91, 2],
			),
		),
	).toEqual(canonicalLayout);
});

it("does not identify FIDO from a range minimum preceding an intervening non-FIDO Usage", () => {
	const bytes = descriptor(
		[0x06, 0xd0, 0xf1, 0x19, 1, 0x09, 2, 0x29, 3, 0xa1, 1],
		globals,
		rawInput,
		rawOutput,
		[0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([]);
});

it.each([
	{
		name: "explicit usage before range completion",
		items: [0x19, 2, 0x09, 1, 0x29, 3],
	},
	{
		name: "completed range before explicit usage",
		items: [0x19, 1, 0x29, 3, 0x09, 2],
	},
])("orders $name for collection identification", ({ items }) => {
	const bytes = descriptor(
		[0x06, 0xd0, 0xf1, ...items, 0xa1, 1],
		globals,
		rawInput,
		rawOutput,
		[0xc0],
	);
	expect(discoverFidoHidReportLayouts(bytes)).toEqual([
		{
			collectionOffset: 9,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("accepts short-width mixing and matched extended ranges", () => {
	for (const range of [
		[0x19, 0x37, 0x2a, 0x37, 0],
		[0x1a, 0x37, 0, 0x29, 0x38],
		[0x1b, 0x37, 0, 0xd0, 0xf1, 0x2b, 0x38, 0, 0xd0, 0xf1],
	])
		expect(
			discoverFidoHidReportLayouts(fido(range, [0x81, 2], rawOutput)),
		).toEqual(canonicalLayout);
});

const crossedRanges = [
	{
		name: "short minimum and extended maximum",
		items: [0x19, 1, 0x2b, 1, 0, 0xd0, 0xf1],
	},
	{
		name: "extended minimum and short maximum",
		items: [0x1b, 1, 0, 0xd0, 0xf1, 0x29, 1],
	},
];

it.each(crossedRanges)(
	"rejects $name before identifying a collection",
	({ items }) => {
		unsupported(
			descriptor(
				[0x06, 0xd0, 0xf1],
				items,
				[0xa1, 1],
				globals,
				rawInput,
				rawOutput,
				[0xc0],
			),
		);
	},
);

it.each(
	crossedRanges.flatMap((range) => [
		{ ...range, direction: "input", main: [0x81, 2], other: rawOutput },
		{ ...range, direction: "output", main: [0x91, 2], other: rawInput },
	]),
)(
	"rejects $name before qualifying $direction fields",
	({ items, main, other }) => {
		unsupported(fido(items, main, other));
	},
);

it.each(crossedRanges)(
	"returns no prefix candidate after late $name",
	({ items }) => {
		const prefix = fido([0x85, 1], rawInput, rawOutput);
		const validSuffix = fido([0x85, 2], rawInput, rawOutput);
		expect(
			discoverFidoHidReportLayouts(descriptor([...prefix], [...validSuffix])),
		).toEqual([
			{
				collectionOffset: 5,
				input: { reportId: 1, reportBytes: 64 },
				output: { reportId: 1, reportBytes: 64 },
			},
			{
				collectionOffset: prefix.length + 5,
				input: { reportId: 2, reportBytes: 64 },
				output: { reportId: 2, reportBytes: 64 },
			},
		]);
		unsupported(
			descriptor(
				[...prefix],
				[0x06, 0xd0, 0xf1],
				items,
				[0xa1, 1],
				globals,
				[0x85, 2],
				rawInput,
				rawOutput,
				[0xc0],
			),
		);
	},
);

it("rejects range maxima without minima, repeated minima and reversed endpoints", () => {
	for (const range of [
		[0x29, 1],
		[0x19, 1, 0x19, 2],
		[0x19, 2, 0x29, 1],
		[0x19, 1, 0x29, 2, 0x29, 3],
		[0x1b, 1, 0, 0xd0, 0xf1, 0x2b, 2, 0, 1, 0],
	])
		rejects(fido(range, rawInput, rawOutput));
});

it("rejects unresolved UsageMinimum at every Main item and at EOF", () => {
	for (const main of [[0x81, 2], [0x91, 2], [0xb1, 2], [0xa1, 0], [0xc0]])
		rejects(descriptor(application, globals, [0x19, 1], main));
	rejects(descriptor([0x19, 1]));
	rejects(descriptor([...canonical, 0x19, 1]));
});

it("guards page changes with pending short usages and short ranges", () => {
	for (const usages of [
		[0x09, 0x37],
		[0x0a, 0x37, 0],
		[0x19, 0x37],
		[0x19, 0x37, 0x29, 0x38],
		[0x19, 0x37, 0x2a, 0x38, 0],
		[0x1a, 0x37, 0, 0x29, 0x38],
	])
		unsupported(fido(usages, [0x05, 1]));
});

it("guards Pop restoring a different page while short locals are pending", () => {
	unsupported(descriptor([0x05, 1, 0xa4, 0x06, 0xd0, 0xf1, 0x09, 1, 0xb4]));
	unsupported(descriptor([0x05, 1, 0xa4, 0x06, 0xd0, 0xf1, 0x19, 1, 0xb4]));
});

it("allows unchanged pages, cleared locals and page changes with only extended usages", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido([0x09, 0x37, 0x06, 0xd0, 0xf1, 0x81, 2], rawOutput),
		),
	).toEqual(canonicalLayout);
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0x0b, 0x37, 0, 0xd0, 0xf1, 0x05, 1, 0x81, 2, 0x06, 0xd0, 0xf1],
				rawOutput,
			),
		),
	).toEqual(canonicalLayout);
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0xa4, 0x05, 1, 0x0b, 0x37, 0, 0xd0, 0xf1, 0xb4, 0x81, 2],
				rawOutput,
			),
		),
	).toEqual(canonicalLayout);
});

it("sign-extends logical minima and conditional maxima at every numeric width", () => {
	for (const bounds of [
		[0x15, 0x80, 0x25, 0xff],
		[0x16, 0, 0x80, 0x26, 0xff, 0xff],
		[0x17, 0, 0, 0, 0x80, 0x27, 0xff, 0xff, 0xff, 0xff],
		[0x15, 0, 0x25, 0xff],
		[0x15, 0, 0x26, 0xff, 0xff],
		[0x15, 0, 0x27, 0xff, 0xff, 0xff, 0xff],
	])
		expect(discoverFidoHidReportLayouts(nonFido(bounds, [0x81, 2]))).toEqual(
			[],
		);
});

it("preserves an extended range across UsagePage changes and global Pop", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0xa4, 0x05, 1, 0x1b, 0, 0, 0xd0, 0xf1, 0xb4],
				[0x05, 2, 0x2b, 0xff, 0xff, 0xd0, 0xf1, 0x81, 2],
				[0x06, 0xd0, 0xf1],
				rawOutput,
			),
		),
	).toEqual(canonicalLayout);
});

it("preserves an unfinished short range across non-page global updates", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido(
				[0x19, 0x37, 0x75, 8, 0x95, 64, 0x15, 0, 0x25, 255],
				[0xa4, 0xb4, 0x29, 0x38, 0x81, 2],
				rawOutput,
			),
		),
	).toEqual(canonicalLayout);
});

it("rejects invalid signed or unsigned logical bounds before field registration", () => {
	for (const bounds of [
		[0x15, 0xff, 0x25, 0x80],
		[0x16, 0xff, 0xff, 0x26, 0, 0x80],
		[0x17, 0xff, 0xff, 0xff, 0xff, 0x27, 0, 0, 0, 0x80],
		[0x15, 1, 0x25, 0],
	])
		for (const direction of [0x81, 0x91, 0xb1])
			rejects(nonFido(bounds, [direction, 1]));
});

it("interprets LogicalMaximum using the minimum at declaration, not at field use", () => {
	expect(
		discoverFidoHidReportLayouts(
			fido([0x25, 255, 0x15, 0], rawInput, rawOutput),
		),
	).toEqual(canonicalLayout);
	rejects(fido([0x15, 0xff, 0x25, 0xff, 0x15, 0], rawInput, rawOutput));
});

it("recognizes numeric physical and unit metadata without selecting on it", () => {
	for (const metadata of [
		[0x35, 0xff, 0x45, 0, 0x55, 0x0e, 0x65, 0xff],
		[0x36, 0, 0x80, 0x46, 0xff, 0x7f, 0x56, 0xfe, 0xff, 0x66, 1, 0],
		[0x37, 0, 0, 0, 0x80, 0x47, 0xff, 0xff, 0xff, 0xff],
		[0x57, 0xff, 0xff, 0xff, 0xff, 0x67, 0xff, 0xff, 0xff, 0xff],
	])
		expect(
			discoverFidoHidReportLayouts(fido(metadata, rawInput, rawOutput)),
		).toEqual(canonicalLayout);
});

it("allows exactly 32 nested collections and refuses the 33rd", () => {
	expect(
		discoverFidoHidReportLayouts(
			descriptor(repeated([0x09, 1, 0xa1, 0], 32), repeated([0xc0], 32)),
		),
	).toEqual([]);
	limited(descriptor(repeated([0x09, 1, 0xa1, 0], 33), repeated([0xc0], 33)));
});

it("allows exactly 32 global stack entries and refuses the 33rd", () => {
	expect(
		discoverFidoHidReportLayouts(
			descriptor(repeated([0xa4], 32), repeated([0xb4], 32)),
		),
	).toEqual([]);
	limited(descriptor(repeated([0xa4], 33), repeated([0xb4], 33)));
});

it("allows exactly 256 collections and refuses the 257th even after closes", () => {
	expect(
		discoverFidoHidReportLayouts(
			descriptor(repeated([0x09, 1, 0xa1, 0, 0xc0], 256)),
		),
	).toEqual([]);
	limited(descriptor(repeated([0x09, 1, 0xa1, 0, 0xc0], 257)));
});

it("allows exactly 1024 fields and counts padding and Feature fields toward the cap", () => {
	for (const direction of [0x81, 0x91, 0xb1]) {
		expect(
			discoverFidoHidReportLayouts(nonFido(repeated([direction, 1], 1024))),
		).toEqual([]);
		limited(nonFido(repeated([direction, 1], 1025)));
	}
});

it("counts the 1024-field limit across report directions and Applications", () => {
	const first = [...nonFido(repeated([0x81, 1], 512))];
	const second = [...nonFido(repeated([0x91, 1], 512))];
	expect(discoverFidoHidReportLayouts(descriptor(first, second))).toEqual([]);
	limited(descriptor(first, second, [...nonFido([0xb1, 1])]));
});

it("allows exactly 256 direction/ID groups and counts Feature as a new group", () => {
	const fields: number[] = [];
	for (let reportId = 1; reportId <= 255; reportId++)
		fields.push(0x85, reportId, 0x81, 1);
	expect(
		discoverFidoHidReportLayouts(nonFido(fields, [0x85, 1, 0x91, 1])),
	).toEqual([]);
	expect(
		discoverFidoHidReportLayouts(nonFido(fields, [0x85, 1, 0x91, 1, 0x81, 1])),
	).toEqual([]);
	limited(nonFido(fields, [0x85, 1, 0x91, 1, 0xb1, 1]));
});

it("allows exactly 256 local Usage declarations and resets the cap at Main", () => {
	const usages = repeated([0x09, 0x37], 256);
	expect(
		discoverFidoHidReportLayouts(fido(usages, [0x81, 2], usages, [0x91, 2])),
	).toEqual(canonicalLayout);
	limited(fido(repeated([0x09, 0x37], 257), [0x81, 2], rawOutput));
});

it("counts a complete Usage range as one bounded local declaration", () => {
	const ranges = repeated([0x19, 0, 0x29, 255], 256);
	expect(
		discoverFidoHidReportLayouts(fido(ranges, [0x81, 2], rawOutput)),
	).toEqual(canonicalLayout);
	limited(fido(repeated([0x19, 0, 0x29, 255], 257), [0x81, 2], rawOutput));
	limited(fido(repeated([0x09, 0x37], 256), [0x19, 0, 0x29, 255]));
});

it("allows exact 65536-bit report products without allocating per count", () => {
	for (const dimensions of [
		[0x75, 1, 0x97, 0, 0, 1, 0],
		[0x77, 0, 0, 1, 0, 0x95, 1],
		[0x76, 0, 1, 0x96, 0, 1],
	])
		for (const direction of [0x81, 0x91, 0xb1])
			expect(
				discoverFidoHidReportLayouts(nonFido(dimensions, [direction, 1])),
			).toEqual([]);
});

it("checks products before multiplication and rejects report bit overflow", () => {
	for (const dimensions of [
		[0x75, 2, 0x97, 0, 0, 1, 0],
		[0x77, 0, 0, 1, 0, 0x95, 2],
		[0x77, 0, 0, 1, 0, 0x97, 0, 0, 1, 0],
		[0x76, 1, 1, 0x96, 0, 1],
	])
		limited(nonFido(dimensions, [0x81, 1]));
});

it("checks accumulated report bits including padding across Application boundaries", () => {
	expect(
		discoverFidoHidReportLayouts(nonFido([0x96, 0, 0x80, 0x81, 1, 0x81, 1])),
	).toEqual([]);
	limited(nonFido([0x96, 0, 0x80, 0x81, 1, 0x81, 1, 0x95, 1, 0x81, 1]));
	limited(
		descriptor(
			[...nonFido([0x97, 0, 0, 1, 0, 0x81, 1])],
			[...nonFido([0x81, 1])],
		),
	);
});

it("checks bit caps independently for different directions and numbered IDs", () => {
	expect(
		discoverFidoHidReportLayouts(
			nonFido([
				0x97, 0, 0, 1, 0, 0x85, 1, 0x81, 1, 0x91, 1, 0xb1, 1, 0x85, 2, 0x81, 1,
			]),
		),
	).toEqual([]);
});

it("rejects size/count values above 65536 immediately even without a field", () => {
	for (const header of [0x77, 0x97])
		for (const value of [
			[1, 0, 1, 0],
			[0xff, 0xff, 0xff, 0xff],
		])
			limited(descriptor([header, ...value]));
	expect(
		discoverFidoHidReportLayouts(
			descriptor([0x77, 0, 0, 1, 0, 0x97, 0, 0, 1, 0]),
		),
	).toEqual([]);
});

it("rejects default or explicit zero field size/count on every direction", () => {
	for (const direction of [0x81, 0x91, 0xb1]) {
		rejects(descriptor(application, [direction, 2, 0xc0]));
		rejects(fido([0x75, 0, direction, 2]));
		rejects(fido([0x95, 0, direction, 2]));
		rejects(descriptor(application, [0x75, 8, direction, 2, 0xc0]));
		rejects(descriptor(application, [0x95, 7, direction, 2, 0xc0]));
	}
});

it("enforces numeric payload widths for every known non-stack global and local", () => {
	for (const header of [
		0x04, 0x14, 0x24, 0x34, 0x44, 0x54, 0x64, 0x74, 0x84, 0x94, 0x08, 0x18,
		0x28,
	])
		rejects(descriptor([header]));
});

it("requires empty Push/Pop and EndCollection payloads", () => {
	for (const bytes of [
		[0xa5, 0],
		[0xa6, 0, 0],
		[0xa7, 0, 0, 0, 0],
		[0xa4, 0xb5, 0],
		[0xa4, 0xb6, 0, 0],
		[0xa4, 0xb7, 0, 0, 0, 0],
		[...application, 0xc1, 0],
		[...application, 0xc2, 0, 0],
		[...application, 0xc3, 0, 0, 0, 0],
	])
		rejects(descriptor(bytes));
});

it("requires one-byte Collection and nonempty Input/Output/Feature payloads", () => {
	for (const main of [[0xa0], [0xa2, 1, 0], [0xa3, 1, 0, 0, 0]])
		rejects(descriptor([0x09, 1], main));
	for (const main of [0x80, 0x90, 0xb0]) rejects(fido([0x09, 0x37, main]));
});

it("requires ReportID to be one byte in 1..255", () => {
	for (const item of [
		[0x85, 0],
		[0x86, 1, 0],
		[0x86, 0, 1],
		[0x87, 1, 0, 0, 0],
		[0x87, 0xff, 0xff, 0xff, 0xff],
	])
		rejects(descriptor(item));
});

it("enforces the 16-bit UsagePage domain without truncation", () => {
	for (const item of [
		[0x07, 0, 0, 1, 0],
		[0x07, 0xff, 0xff, 0xff, 0xff],
	])
		rejects(descriptor(item));
	expect(
		discoverFidoHidReportLayouts(descriptor([0x07, 0xff, 0xff, 0, 0])),
	).toEqual([]);
});

it("rejects mixed zero/nonzero report IDs across any declared fields", () => {
	for (const direction of [0x81, 0x91, 0xb1]) {
		unsupported(nonFido([0x81, 1, 0x85, 1, direction, 1]));
		unsupported(nonFido([0xa4, 0x85, 1, 0x81, 1, 0xb4, direction, 1]));
	}
	unsupported(descriptor([...canonical], [...nonFido([0x85, 1, 0xb1, 1])]));
});

it("does not treat an unused ReportID declaration as a numbered field", () => {
	expect(
		discoverFidoHidReportLayouts(
			descriptor([0xa4, 0x85, 1, 0xb4], [...canonical], [0x85, 2]),
		),
	).toEqual([
		{
			collectionOffset: 9,
			input: { reportId: 0, reportBytes: 64 },
			output: { reportId: 0, reportBytes: 64 },
		},
	]);
});

it("rejects collection underflow, unclosed collections and missing collection usage", () => {
	for (const bytes of [
		[0xc0],
		[0xa1, 1, 0xc0],
		[...application],
		[...canonical, 0xc0],
		[0x09, 6, 0xa1, 0],
	])
		rejects(descriptor(bytes));
});

it("refuses fields outside any Application including inside physical roots", () => {
	for (const direction of [0x81, 0x91, 0xb1]) {
		unsupported(descriptor(globals, [direction, 2]));
		unsupported(descriptor([0x09, 6, 0xa1, 0], globals, [direction, 2, 0xc0]));
		unsupported(descriptor([...canonical], [direction, 1]));
	}
});

it("rejects every unknown main/global and every unsupported local tag", () => {
	for (const tag of [0, 1, 2, 3, 4, 5, 6, 7, 13, 14])
		unsupported(descriptor([tag * 16]));
	for (const tag of [12, 13, 14]) unsupported(descriptor([tag * 16 + 5, 0]));
	for (const tag of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
		unsupported(descriptor([tag * 16 + 9, 0]));
});

it("validates all trailing tokens before returning a candidate prefix", () => {
	for (const suffix of [[0xc0], [0xa4], [0x19, 1], [0x85, 0]])
		rejects(descriptor([...canonical], suffix));
	unsupported(descriptor([...canonical], [0xd0]));
	limited(descriptor([...canonical], [0x97, 1, 0, 1, 0]));
	unsupported(
		descriptor(
			[...fido([0x85, 1], rawInput, rawOutput)],
			[...fido([0x85, 2], rawInput)],
		),
	);
	unsupported(
		descriptor(
			[...fido([0x85, 1], rawInput, rawOutput)],
			[...fido([0x85, 2], rawInput, [0x91, 1])],
		),
	);
});

it("validates non-FIDO tails and EOF before FIDO qualification", () => {
	rejects(descriptor([...canonical], [...nonFido([0x95, 0, 0x81, 1])]));
	rejects(descriptor(application, globals, [0x81, 1]));
	rejects(descriptor([...fido(rawInput)], [0xa4]));
});

it("preserves tokenizer framing and unsupported error messages", () => {
	for (const bytes of [
		[0x06, 0xd0],
		[...canonical, 0x09],
		[0x07, 1, 2, 3],
	])
		rejects(
			descriptor(bytes),
			"invalid-input",
			"Invalid HID short-item input.",
		);
	for (const bytes of [[0xfe], [0xf0], [...canonical, 0xfe, 0]])
		rejects(
			descriptor(bytes),
			"unsupported",
			"Long HID items are unsupported.",
		);
	for (const bytes of [[0x0c], [0x8f], [...canonical, 0x0d]])
		rejects(
			descriptor(bytes),
			"unsupported",
			"Reserved HID item types are unsupported.",
		);
});

it("inherits the 4096-byte lexer cap without adding options or a byte validator", () => {
	expect(
		discoverFidoHidReportLayouts(descriptor(repeated([0x35, 0], 2048))),
	).toEqual([]);
	rejects(
		new Uint8Array(4097),
		"resource-limit",
		"HID descriptor byte limit exceeded.",
	);
	rejects(
		descriptor([0xfe], repeated([0], 4096)),
		"resource-limit",
		"HID descriptor byte limit exceeded.",
	);
});

it("inherits rejection of wrong byte brands without coercion or raw input echo", () => {
	let hooks = 0;
	const hostile = {
		get length() {
			hooks++;
			throw new Error("private descriptor bytes");
		},
		get [Symbol.toStringTag]() {
			hooks++;
			throw new Error("private descriptor brand");
		},
		valueOf() {
			hooks++;
			throw new Error("private descriptor value");
		},
	};
	for (const value of [
		null,
		undefined,
		true,
		1,
		"private descriptor",
		[...canonical],
		{},
		hostile,
		new ArrayBuffer(1),
		new DataView(new ArrayBuffer(1)),
		new Int8Array(1),
		new Uint8ClampedArray(1),
		new Uint16Array(1),
		Object.create(Uint8Array.prototype),
		{ [Symbol.toStringTag]: "Uint8Array" },
		Object.defineProperty(new Uint16Array(1), Symbol.toStringTag, {
			value: "Uint8Array",
		}),
	])
		rejects(value, "invalid-input", "Invalid HID short-item input.");
	expect(hooks).toBe(0);
});

it("inherits rejection of typed-array proxies and revoked proxies", () => {
	let hooks = 0;
	const proxy = new Proxy(canonical, {
		get() {
			hooks++;
			throw new Error("private proxy data");
		},
	});
	const revoked = Proxy.revocable(canonical, {});
	revoked.revoke();
	for (const bytes of [proxy, revoked.proxy])
		rejects(bytes, "invalid-input", "Invalid HID short-item input.");
	expect(hooks).toBe(0);
});

it("inherits rejection of detached and shared storage including empty views", () => {
	for (const length of [0, 25]) {
		const detached = new Uint8Array(length);
		structuredClone(detached.buffer, { transfer: [detached.buffer] });
		const foreignDetached = runInNewContext("new Uint8Array(length)", {
			length,
		});
		structuredClone(foreignDetached.buffer, {
			transfer: [foreignDetached.buffer],
		});
		for (const bytes of [
			detached,
			foreignDetached,
			new Uint8Array(new SharedArrayBuffer(length)),
			runInNewContext("new Uint8Array(new SharedArrayBuffer(length))", {
				length,
			}),
		])
			rejects(bytes, "invalid-input", "Invalid HID short-item input.");
	}
});

it("accepts Buffer, cross-realm and offset byte views with relative offsets", () => {
	const storage = new Uint8Array(29).fill(0xfe);
	storage.set(canonical, 2);
	for (const bytes of [
		Buffer.from(canonical),
		runInNewContext("new Uint8Array(values)", { values: [...canonical] }),
		storage.subarray(2, 27),
	])
		expect(discoverFidoHidReportLayouts(bytes)).toEqual(canonicalLayout);
	expect([...storage]).toEqual([0xfe, 0xfe, ...canonical, 0xfe, 0xfe]);
});

it("inherits out-of-bounds view rejection without rejecting valid empty views", () => {
	const storage = new ArrayBuffer(29, { maxByteLength: 64 });
	new Uint8Array(storage).set(canonical, 2);
	const populated = new Uint8Array(storage, 2, 25);
	const empty = new Uint8Array(storage, 2, 0);
	const tracking = new Uint8Array(storage, 2);
	expect(discoverFidoHidReportLayouts(populated)).toEqual(canonicalLayout);
	storage.resize(2);
	expect(discoverFidoHidReportLayouts(empty)).toEqual([]);
	expect(discoverFidoHidReportLayouts(tracking)).toEqual([]);
	rejects(populated, "invalid-input", "Invalid HID short-item input.");
	storage.resize(1);
	for (const bytes of [populated, empty, tracking])
		rejects(bytes, "invalid-input", "Invalid HID short-item input.");
});

it("retains no dependency on resizable input storage after discovery", () => {
	const storage = new ArrayBuffer(25, { maxByteLength: 64 });
	new Uint8Array(storage).set(canonical);
	const first = discoverFidoHidReportLayouts(new Uint8Array(storage));
	const second = discoverFidoHidReportLayouts(new Uint8Array(storage, 0, 25));
	storage.resize(0);
	storage.resize(25);
	expect(first).toEqual(canonicalLayout);
	expect(second).toEqual(canonicalLayout);
});

it("inherits safe intrinsic reads without invoking byte-view overrides", () => {
	let hooks = 0;
	const bytes = canonical.slice();
	for (const key of ["buffer", "byteOffset", "byteLength", "length", "slice"]) {
		Object.defineProperty(bytes, key, {
			get() {
				hooks++;
				throw new Error("private override");
			},
		});
	}
	Object.defineProperty(bytes, Symbol.iterator, {
		get() {
			hooks++;
			throw new Error("private iterator");
		},
	});
	expect(discoverFidoHidReportLayouts(bytes)).toEqual(canonicalLayout);
	expect(hooks).toBe(0);
});

it("isolates returned layouts from input mutations and separate calls", () => {
	const bytes = canonical.slice();
	const first = discoverFidoHidReportLayouts(bytes);
	const second = discoverFidoHidReportLayouts(bytes);
	expect([...bytes]).toEqual([...canonical]);
	expect(first).not.toBe(second);
	expect(first[0]).not.toBe(second[0]);
	expect(first[0].input).not.toBe(first[0].output);
	expect(first[0].input).not.toBe(second[0].input);
	expect(first[0].output).not.toBe(second[0].output);
	bytes.fill(0);
	expect(first).toEqual(canonicalLayout);
	first[0].input.reportBytes = 1;
	first[0].output.reportId = 99;
	first[0].collectionOffset = -1;
	(first as FidoHidReportLayout[]).push(first[0]);
	expect(second).toEqual(canonicalLayout);
	expect(discoverFidoHidReportLayouts(canonical)).toEqual(canonicalLayout);
});

it("does not retain failed parser state or candidate prefixes between calls", () => {
	unsupported(fido(rawInput));
	limited(descriptor(repeated([0xa4], 33)));
	rejects(descriptor([...canonical, 0xc0]));
	expect(discoverFidoHidReportLayouts(canonical)).toEqual(canonicalLayout);
	const empty = discoverFidoHidReportLayouts(new Uint8Array());
	(empty as FidoHidReportLayout[]).push(canonicalLayout[0]);
	expect(discoverFidoHidReportLayouts(new Uint8Array())).toEqual([]);
});
