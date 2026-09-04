import { expect, it } from "vitest";
import {
	flexLineLimits,
	resolveFlexLines,
	type FlexLineItemInput,
	type FlexLineOptions,
} from "./flex-line.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutValueLimits } from "./layout-values.js";

function item(
	baseSize: number,
	values: Partial<FlexLineItemInput> = {},
): FlexLineItemInput {
	return { baseSize, minSize: 0, ...values };
}
function sizes(
	inputs: FlexLineItemInput[],
	mainSize: number,
	expected: number[],
) {
	const result = resolveFlexLines(inputs, mainSize);
	expect(result.lines).toHaveLength(1);
	expect(result.lines[0].items).toHaveLength(expected.length);
	for (const [index, size] of expected.entries())
		expect(result.lines[0].items[index].contentSize).toBeCloseTo(size, 9);
	return result.lines[0];
}

it("leaves an empty measured item list empty", () => {
	expect(resolveFlexLines([], 100)).toMatchObject({
		stage: "resolved-flex-main-lines",
		partial: true,
		mainSize: 100,
		gap: 0,
		lines: [],
		metrics: { items: 0, iterations: 0 },
	});
});
it("defaults to no growth and a shrink factor of one", () => {
	sizes([item(40), item(60)], 200, [40, 60]);
	sizes([item(40), item(60)], 50, [20, 30]);
});
it("distributes growth by factors rather than base widths", () => {
	const line = sizes(
		[item(20, { grow: 1 }), item(80, { grow: 3 })],
		300,
		[70, 230],
	);
	expect(line).toMatchObject({
		mode: "grow",
		initialFreeSpace: 200,
		remainingFreeSpace: 0,
		iterations: 1,
	});
});
it("scales shrink factors by inner base sizes", () => {
	sizes([item(100), item(200)], 150, [50, 100]);
	sizes([item(100), item(200, { shrink: 2 })], 150, [70, 80]);
});
it("uses hypothetical sizes to choose grow versus shrink", () => {
	const grow = sizes(
		[item(200, { maxSize: 80, grow: 1 }), item(20, { grow: 1 })],
		200,
		[80, 120],
	);
	expect(grow.mode).toBe("grow");
	expect(grow.items[0].freeze).toBe("inflexible");
	const shrink = sizes([item(20, { minSize: 80 }), item(200)], 200, [80, 120]);
	expect(shrink.mode).toBe("shrink");
	expect(shrink.items[0].freeze).toBe("inflexible");
});
it("uses shrink mode when the hypothetical total exactly fills the line", () => {
	expect(sizes([item(50), item(50)], 100, [50, 50]).mode).toBe("shrink");
});
it("freezes zero factors at their clamped hypothetical sizes", () => {
	sizes([item(30, { minSize: 80 }), item(20, { grow: 1 })], 200, [80, 120]);
	sizes([item(100, { shrink: 0, maxSize: 90 }), item(100)], 100, [90, 10]);
});
it("freezes max violations and redistributes growth", () => {
	const line = sizes(
		[item(50, { minSize: 100, grow: 1 }), item(50, { maxSize: 60, grow: 1 })],
		200,
		[140, 60],
	);
	expect(line.iterations).toBe(2);
	expect(line.items[1].freeze).toBe("max");
});
it("freezes min violations and redistributes shrinkage", () => {
	const line = sizes([item(100, { minSize: 80 }), item(100)], 100, [80, 20]);
	expect(line.iterations).toBe(2);
	expect(line.items[0].freeze).toBe("min");
});
it.each([
	[120, 80, 120, 80, 1],
	[130, 80, 130, 70, 2],
	[120, 60, 140, 60, 2],
])(
	"uses total violation to choose which constraints freeze: %s/%s",
	(minimum, maximum, first, second, iterations) => {
		const line = sizes(
			[
				item(50, { minSize: minimum, grow: 1 }),
				item(50, { maxSize: maximum, grow: 1 }),
			],
			200,
			[first, second],
		);
		expect(line.iterations).toBe(iterations);
	},
);
it("lets the effective minimum win over a smaller maximum", () => {
	sizes([item(10, { minSize: 80, maxSize: 20, grow: 1 })], 50, [80]);
});
it("partially fills positive free space when grow factors sum below one", () => {
	const line = sizes(
		[item(0, { grow: 0.25 }), item(0, { grow: 0.25 })],
		100,
		[25, 25],
	);
	expect(line.remainingFreeSpace).toBe(50);
});
it("partially shrinks when shrink factors sum below one", () => {
	const line = sizes(
		[item(100, { shrink: 0.25 }), item(100, { shrink: 0.25 })],
		100,
		[75, 75],
	);
	expect(line.remainingFreeSpace).toBe(-50);
});
it("uses initial free space after a fractional-grow item freezes", () => {
	const line = sizes(
		[item(0, { grow: 0.25, maxSize: 10 }), item(0, { grow: 0.25 })],
		100,
		[10, 25],
	);
	expect(line.remainingFreeSpace).toBe(65);
});
it("uses initial free space after a fractional-shrink item freezes", () => {
	const line = sizes(
		[item(100, { shrink: 0.25, minSize: 90 }), item(100, { shrink: 0.25 })],
		100,
		[90, 75],
	);
	expect(line.remainingFreeSpace).toBe(-65);
});
it("floors content sizes without dropping fixed border and padding contributions", () => {
	const line = sizes(
		[item(10, { borderPadding: 40 }), item(10, { borderPadding: 40 })],
		50,
		[0, 0],
	);
	expect(line.items.map((entry) => entry.borderBoxSize)).toEqual([40, 40]);
	expect(line.remainingFreeSpace).toBe(-30);
});
it("allows a negative inner basis when the un-clamped border box is nonnegative", () => {
	const line = sizes(
		[item(-20, { borderPadding: 20, grow: 1 }), item(0, { grow: 1 })],
		100,
		[30, 50],
	);
	expect(line.items[0]).toMatchObject({
		hypotheticalSize: 0,
		borderBoxSize: 50,
	});
});
it("does not include border and padding in scaled shrink weights", () => {
	sizes([item(100, { borderPadding: 100 }), item(100)], 200, [50, 50]);
});
it("treats logical margins and gaps as fixed space during flexible sizing", () => {
	const result = resolveFlexLines(
		[
			item(0, { grow: 1, marginStart: 10, marginEnd: 5 }),
			item(0, { grow: 1, marginStart: 5, borderPadding: 10 }),
		],
		150,
		{ gap: 20 },
	);
	expect(result.lines[0].items).toMatchObject([
		{ contentSize: 50, mainOffset: 10 },
		{ contentSize: 50, mainOffset: 90, borderBoxSize: 60 },
	]);
});
it("distributes positive space equally across auto margins before justification", () => {
	const result = resolveFlexLines(
		[
			item(20, { marginStart: "auto", marginEnd: "auto" }),
			item(20, { marginEnd: "auto" }),
		],
		100,
		{ justify: "flex-end" },
	);
	const line = result.lines[0];
	expect(line.items).toMatchObject([
		{ marginStart: 20, marginEnd: 20, mainOffset: 20 },
		{ marginStart: 0, marginEnd: 20, mainOffset: 60 },
	]);
	expect(line).toMatchObject({
		freeSpaceBeforeAutoMargins: 60,
		remainingFreeSpace: 0,
		usedMainSize: 100,
	});
});
it("resolves overflowing auto margins to zero", () => {
	const line = resolveFlexLines(
		[item(150, { shrink: 0, marginStart: "auto", marginEnd: "auto" })],
		100,
	).lines[0];
	expect(line.items[0]).toMatchObject({
		marginStart: 0,
		marginEnd: 0,
		mainOffset: 0,
	});
});
it("preserves negative margins and negative outer hypothetical sizes", () => {
	const result = resolveFlexLines(
		[item(20, { marginStart: -30 }), item(90)],
		100,
		{ wrap: true },
	);
	expect(result.lines).toHaveLength(1);
	expect(result.lines[0].items).toMatchObject([
		{ outerSize: -10, mainOffset: -30 },
		{ mainOffset: -10 },
	]);
});
it.each([
	["flex-start", [0, 20]],
	["flex-end", [60, 80]],
	["center", [30, 50]],
	["space-between", [0, 80]],
	["space-around", [15, 65]],
] as const)("positions items with %s", (justify, expected) => {
	expect(
		resolveFlexLines([item(20), item(20)], 100, { justify }).lines[0].items.map(
			(entry) => entry.mainOffset,
		),
	).toEqual(expected);
});
it.each([
	["flex-start", 0],
	["flex-end", -50],
	["center", -25],
	["space-between", 0],
	["space-around", 0],
] as const)("applies overflow alignment for %s", (justify, offset) => {
	expect(
		resolveFlexLines([item(150, { shrink: 0 })], 100, { justify }).lines[0]
			.items[0].mainOffset,
	).toBe(offset);
});
it("adds distribution space to, rather than replacing, the fixed gap", () => {
	expect(
		resolveFlexLines([item(10), item(10), item(10)], 100, {
			gap: 5,
			justify: "space-between",
		}).lines[0].items.map((entry) => entry.mainOffset),
	).toEqual([0, 45, 90]);
});
it("centers a singleton with space-around and starts one with space-between", () => {
	expect(
		resolveFlexLines([item(20)], 100, { justify: "space-around" }).lines[0]
			.items[0].mainOffset,
	).toBe(40);
	expect(
		resolveFlexLines([item(20)], 100, { justify: "space-between" }).lines[0]
			.items[0].mainOffset,
	).toBe(0);
});
it("forms lines from hypothetical outer sizes before shrinking or growing", () => {
	const inputs = [
		item(60, { grow: 1 }),
		item(60, { grow: 1 }),
		item(20, { grow: 1 }),
	];
	const result = resolveFlexLines(inputs, 100, { wrap: true });
	expect(
		result.lines.map((line) => line.items.map((entry) => entry.contentSize)),
	).toEqual([[100], [70, 30]]);
	expect(resolveFlexLines(inputs, 100).lines).toHaveLength(1);
});
it("applies min/max constraints and margins during line collection", () => {
	const inputs = [
		item(10, { minSize: 60 }),
		item(200, { maxSize: 30, marginEnd: 10 }),
		item(0),
	];
	expect(
		resolveFlexLines(inputs, 100, { wrap: true }).lines.map((line) =>
			line.items.map((entry) => entry.index),
		),
	).toEqual([[0, 1, 2]]);
});
it("keeps an oversized first item alone even if a later negative item could fit", () => {
	const inputs = [item(150, { shrink: 0 }), item(10, { marginEnd: -100 })];
	expect(
		resolveFlexLines(inputs, 100, { wrap: true }).lines.map((line) =>
			line.items.map((entry) => entry.index),
		),
	).toEqual([[0], [1]]);
});
it("accounts for gaps when deciding whether an item starts a new line", () => {
	expect(
		resolveFlexLines([item(50), item(50), item(0)], 100, {
			wrap: true,
			gap: 1,
		}).lines.map((line) => line.items.map((entry) => entry.index)),
	).toEqual([[0], [1, 2]]);
});
it("collects zero-size items on a just-filled line", () => {
	expect(
		resolveFlexLines([item(100), item(0), item(0), item(1)], 100, {
			wrap: true,
		}).lines.map((line) => line.items.map((entry) => entry.index)),
	).toEqual([[0, 1, 2], [3]]);
});
it("sorts stable order-modified input before line collection without losing indices", () => {
	const inputs = [
		item(60, { order: 2 }),
		item(30, { order: -1 }),
		item(30, { order: -1 }),
		item(60),
	];
	expect(
		resolveFlexLines(inputs, 100, { wrap: true }).lines.map((line) =>
			line.items.map((entry) => entry.index),
		),
	).toEqual([[1, 2], [3], [0]]);
	expect(inputs.map((entry) => entry.order)).toEqual([2, -1, -1, undefined]);
});
it("solves every wrapped line independently", () => {
	const result = resolveFlexLines(
		[item(60, { grow: 0.5 }), item(60, { grow: 1 }), item(20, { grow: 1 })],
		100,
		{ wrap: true, justify: "center" },
	);
	expect(result.lines[0].items[0]).toMatchObject({
		contentSize: 80,
		mainOffset: 10,
	});
	expect(result.lines[1].items).toMatchObject([
		{ contentSize: 70, mainOffset: 0 },
		{ contentSize: 30, mainOffset: 70 },
	]);
});
it("does not retain mutable input or expose mutable output", () => {
	const inputs = [item(20, { grow: 1 })];
	const result = resolveFlexLines(inputs, 100);
	inputs[0].baseSize = 90;
	expect(result.lines[0].items[0].baseSize).toBe(20);
	for (const value of [
		result,
		result.lines,
		result.lines[0],
		result.lines[0].items,
		result.lines[0].items[0],
		result.metrics,
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(() => {
		(result.lines[0].items[0] as { contentSize: number }).contentSize = 200;
	}).toThrow();
});
it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	-1,
	"100",
	null,
])("rejects invalid containing size %s", (value) => {
	expect(() => resolveFlexLines([], value as number)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});
it.each([
	{ baseSize: Number.NaN },
	{ minSize: -1 },
	{ minSize: undefined },
	{ maxSize: -1 },
	{ grow: -1 },
	{ shrink: Number.POSITIVE_INFINITY },
	{ borderPadding: -1 },
	{ baseSize: -2, borderPadding: 1 },
	{ marginStart: "inherit" },
	{ order: 1.2 },
	{ grow: null },
	{ shrink: null },
	{ borderPadding: null },
	{ marginEnd: null },
	{ order: null },
])("rejects invalid item fields %j", (fields) => {
	expect(() =>
		resolveFlexLines([{ ...item(10), ...fields } as FlexLineItemInput], 100),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it.each([
	{ wrap: "wrap" },
	{ wrap: null },
	{ gap: -1 },
	{ gap: null },
	{ maxWork: 0 },
	{ maxWork: null },
	{ maxWork: flexLineLimits.maxWork + 1 },
])("rejects invalid options %j", (options) => {
	expect(() =>
		resolveFlexLines([item(10)], 100, options as FlexLineOptions),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("rejects unsupported alignment instead of silently selecting a fallback", () => {
	expect(() =>
		resolveFlexLines([item(10)], 100, {
			justify: "stretch",
		} as unknown as FlexLineOptions),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});
it("rejects holes and accessors without calling the accessor", () => {
	let called = false;
	const source = [item(10)];
	Object.defineProperty(source, "0", {
		get() {
			called = true;
			return item(10);
		},
	});
	expect(() => resolveFlexLines(source, 100)).toThrow();
	const accessor = {
		...item(10),
		get grow() {
			called = true;
			return 1;
		},
	};
	expect(() => resolveFlexLines([accessor], 100)).toThrow();
	expect(() => resolveFlexLines(new Array(2), 100)).toThrow();
	expect(called).toBe(false);
});
it("rejects foreign prototypes and unknown input fields", () => {
	expect(() => resolveFlexLines([Object.create(item(10))], 100)).toThrow();
	expect(() =>
		resolveFlexLines([{ ...item(10), basis: 5 } as FlexLineItemInput], 100),
	).toThrow();
	expect(() =>
		resolveFlexLines([], 100, { columns: 1 } as FlexLineOptions),
	).toThrow();
});
it("bounds item counts, factors, aggregate magnitudes and work", () => {
	for (const run of [
		() =>
			resolveFlexLines(
				Array.from({ length: flexLineLimits.maxItems + 1 }, () => item(0)),
				100,
			),
		() =>
			resolveFlexLines([item(1, { grow: flexLineLimits.maxFactor + 1 })], 100),
		() =>
			resolveFlexLines(
				[item(layoutValueLimits.maxAbsoluteLength), item(1)],
				100,
			),
		() => resolveFlexLines([item(1)], 100, { maxWork: 1 }),
	])
		expect(run).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(resolveFlexLines([item(1)], 100).lines[0].items[0].contentSize).toBe(
		1,
	);
});
it("does not add a trailing gap outside the actual final border box", () => {
	expect(
		resolveFlexLines(
			[item(layoutValueLimits.maxAbsoluteLength)],
			layoutValueLimits.maxAbsoluteLength,
			{ gap: 100 },
		).lines[0].items[0].mainOffset,
	).toBe(0);
});
it("charges the complete result and succeeds at its exact measured work budget", () => {
	const inputs = [
		item(50, { minSize: 130, grow: 1 }),
		item(50, { maxSize: 80, grow: 1 }),
	];
	const result = resolveFlexLines(inputs, 200);
	expect(
		resolveFlexLines(inputs, 200, { maxWork: result.metrics.work }),
	).toEqual(result);
	expect(() =>
		resolveFlexLines(inputs, 200, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});
it("retains very small growth factors instead of treating them as zero", () => {
	const line = resolveFlexLines(
		[item(0, { grow: 1e-300 }), item(0, { grow: 1e-300 })],
		100,
	).lines[0];
	expect(line.items[0].contentSize).toBeGreaterThan(0);
	expect(line.items[0].contentSize / 1e-298).toBeCloseTo(1, 10);
});
it("normalizes scaled shrink weights without floating-point underflow", () => {
	const line = resolveFlexLines(
		[
			item(1e-300, { shrink: 1e-24 }),
			item(5e-300, { shrink: 1e-24 }),
			item(0, { shrink: 1 }),
		],
		3e-300,
	).lines[0];
	expect(line.items[0].contentSize / 1e-300).toBeCloseTo(0.5, 10);
	expect(line.items[1].contentSize / 1e-300).toBeCloseTo(2.5, 10);
});

function reference(
	inputs: FlexLineItemInput[],
	available: number,
	mode: "grow" | "shrink",
) {
	const evaluate = (ratio: number) =>
		inputs.map((entry) =>
			Math.max(
				entry.minSize,
				Math.min(
					entry.baseSize +
						(mode === "grow"
							? (entry.grow ?? 0) * ratio
							: -(entry.shrink ?? 1) * entry.baseSize * ratio),
					entry.maxSize ?? Number.POSITIVE_INFINITY,
				),
			),
		);
	let lower = 0;
	let upper = mode === "grow" ? 100000 : 1;
	for (let iteration = 0; iteration < 80; iteration++) {
		const middle = (lower + upper) / 2;
		const total = evaluate(middle).reduce((sum, size) => sum + size, 0);
		if (mode === "grow" ? total < available : total > available) lower = middle;
		else upper = middle;
	}
	return evaluate((lower + upper) / 2);
}
it.each(Array.from({ length: 80 }, (_, seed) => seed))(
	"matches an independent monotonic allocation oracle for fixture %i",
	(seed) => {
		let randomState = seed + 1;
		const random = () => {
			randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
			return randomState / 4294967296;
		};
		const inputs = Array.from({ length: 2 + (seed % 7) }, () => {
			const base = 10 + Math.floor(random() * 100);
			return item(base, {
				minSize: Math.floor(base * random()),
				maxSize: base + Math.floor(random() * 150),
				grow: 1 + random() * 3,
				shrink: 1 + random() * 3,
			});
		});
		const baseTotal = inputs.reduce((sum, entry) => sum + entry.baseSize, 0);
		const mode = seed % 2 ? "grow" : "shrink";
		const bound = inputs.reduce(
			(sum, entry) =>
				sum + (mode === "grow" ? (entry.maxSize as number) : entry.minSize),
			0,
		);
		const available = baseTotal + (bound - baseTotal) * (0.1 + 0.8 * random());
		const expected = reference(inputs, available, mode);
		const result = resolveFlexLines(inputs, available).lines[0];
		for (const [index, entry] of result.items.entries())
			expect(entry.contentSize).toBeCloseTo(expected[index], 7);
		expect(
			result.items.reduce((sum, entry) => sum + entry.outerSize, 0),
		).toBeCloseTo(available, 7);
		expect(result.iterations).toBeLessThanOrEqual(inputs.length);
	},
);

it("does not advertise a numeric kernel as working page flexbox", () => {
	const tree = parseHtmlDocument(
		"<style>main{display:flex}</style><main><div>first</div><div>second</div></main>",
		"https://fixture.invalid/flex-gate",
	);
	try {
		const formatting = buildFormattingTree(tree);
		expect(formatting.metrics.deferredSubtrees).toBeGreaterThan(0);
		expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	} finally {
		tree.close();
	}
});
