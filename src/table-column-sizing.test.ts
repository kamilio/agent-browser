import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { layoutValueLimits } from "./layout-values.js";
import {
	sizeTableColumns,
	tableColumnSizingLimits,
	type TableColumnContribution,
	type TableColumnSizing,
	type TableColumnSizingOptions,
} from "./table-column-sizing.js";

const cell = (
	column: number,
	span: number,
	minContent: number,
	maxContent = minContent,
): TableColumnContribution => ({ column, span, minContent, maxContent });

const size = (
	columnCount: number,
	contributions: readonly TableColumnContribution[] = [],
	options: Partial<TableColumnSizingOptions> = {},
) =>
	sizeTableColumns(columnCount, contributions, {
		availableWidth: 1000,
		tableWidth: null,
		borderSpacing: 0,
		captionMinWidth: 0,
		...options,
	});

const fails = (run: () => unknown, code: string) => {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		return;
	}
	throw new Error(`Expected ${code}`);
};

const expectSizes = (
	actual: readonly number[],
	expected: readonly number[],
) => {
	expect(actual).toHaveLength(expected.length);
	for (let index = 0; index < expected.length; index++)
		expect(actual[index]).toBeCloseTo(expected[index]!, 8);
};

const tolerance = (width: number, columnCount: number) =>
	32 * Number.EPSILON * Math.max(1, width) * Math.max(1, columnCount);

const expectAccounting = (result: TableColumnSizing, spacing: number) => {
	const columnCount = result.sizes.length;
	const precision = tolerance(result.usedWidth, columnCount);
	let cursor = columnCount === 0 ? 0 : spacing;
	for (let index = 0; index < columnCount; index++) {
		expect(Number.isFinite(result.sizes[index])).toBe(true);
		expect(result.sizes[index]).toBeGreaterThanOrEqual(0);
		expect(Math.abs(result.offsets[index]! - cursor)).toBeLessThanOrEqual(
			precision,
		);
		cursor += result.sizes[index]! + spacing;
	}
	if (columnCount !== 0)
		expect(Math.abs(cursor - result.usedWidth)).toBeLessThanOrEqual(precision);
	expect(result.maxContentWidth).toBeGreaterThanOrEqual(result.minContentWidth);
	expect(result.usedWidth).toBeGreaterThanOrEqual(result.minContentWidth);
};

describe("table column intrinsic contributions", () => {
	it("takes per-column maxima across multiple form rows, not row sums", () => {
		const result = size(
			2,
			[
				cell(0, 1, 40, 60),
				cell(1, 1, 100, 180),
				cell(0, 1, 70, 90),
				cell(1, 1, 80, 220),
			],
			{ availableWidth: 240 },
		);
		expect(result.minContentWidth).toBe(170);
		expect(result.maxContentWidth).toBe(310);
		expect(result.usedWidth).toBe(240);
		expectSizes(result.sizes, [80, 160]);
		expectAccounting(result, 0);
	});

	it("adds outer and inter-column spacing to border-box cell measurements", () => {
		const result = size(2, [cell(0, 1, 40, 60), cell(1, 1, 80, 100)], {
			borderSpacing: 5,
		});
		expect(result.minContentWidth).toBe(135);
		expect(result.maxContentWidth).toBe(175);
		expect(result.usedWidth).toBe(175);
		expect(result.sizes).toEqual([60, 100]);
		expect(result.offsets).toEqual([5, 70]);
		expectAccounting(result, 5);
	});

	it("distributes genuine colspan deficits after seeding nonspanning cells", () => {
		const contributions = [
			cell(0, 2, 105, 185),
			cell(0, 1, 20, 40),
			cell(1, 1, 30, 50),
		];
		const minimum = size(2, contributions, {
			availableWidth: 0,
			borderSpacing: 5,
		});
		const maximum = size(2, contributions, { borderSpacing: 5 });
		expect(minimum.minContentWidth).toBe(115);
		expect(minimum.maxContentWidth).toBe(195);
		expect(minimum.sizes).toEqual([45, 55]);
		expect(maximum.sizes).toEqual([85, 95]);
		expectAccounting(minimum, 5);
		expectAccounting(maximum, 5);
	});

	it("does not subtract outer spacing from a spanning cell", () => {
		const result = size(3, [cell(0, 3, 8)], { borderSpacing: 5 });
		expect(result.sizes).toEqual([0, 0, 0]);
		expect(result.minContentWidth).toBe(20);
		expect(result.offsets).toEqual([5, 10, 15]);
		expectAccounting(result, 5);
	});

	it("processes shorter spans first and preserves input order for ties", () => {
		const contributions = [cell(0, 3, 150), cell(1, 2, 100), cell(0, 2, 100)];
		const result = size(3, contributions);
		expect(result.sizes).toEqual([25, 75, 50]);
		expect(result.minContentWidth).toBe(150);
		expect(
			size(3, [contributions[1]!, contributions[2]!, contributions[0]!]),
		).toEqual(result);
		expectAccounting(result, 0);
	});

	it("preserves overlapping spans from different rows", () => {
		const contributions = [cell(0, 2, 100, 200), cell(1, 2, 180, 300)];
		const minimum = size(3, contributions, { availableWidth: 0 });
		const maximum = size(3, contributions);
		expect(minimum.sizes).toEqual([50, 115, 65]);
		expect(maximum.sizes).toEqual([100, 175, 125]);
		expect(minimum.minContentWidth).toBe(230);
		expect(maximum.maxContentWidth).toBe(400);
		for (const contribution of contributions) {
			const end = contribution.column + contribution.span;
			expect(
				minimum.sizes
					.slice(contribution.column, end)
					.reduce((total, width) => total + width, 0),
			).toBeGreaterThanOrEqual(contribution.minContent);
			expect(
				maximum.sizes
					.slice(contribution.column, end)
					.reduce((total, width) => total + width, 0),
			).toBeGreaterThanOrEqual(contribution.maxContent);
		}
	});

	it("treats column hints as minimum/preferred constraints, not fixed tracks", () => {
		const contributions = [
			cell(0, 1, 30, 100),
			cell(1, 1, 60, 120),
			cell(0, 2, 200, 300),
		];
		const options = { columnWidths: [80, 10] };
		const minimum = size(2, contributions, { ...options, availableWidth: 0 });
		const maximum = size(2, contributions, options);
		expect(minimum.sizes).toEqual([110, 90]);
		expect(maximum.sizes).toEqual([145, 155]);
		expect(minimum.minContentWidth).toBe(200);
		expect(maximum.maxContentWidth).toBe(300);
	});

	it("allows null hints, empty tracks, and hints larger than cell content", () => {
		const result = size(3, [cell(0, 1, 10, 20)], {
			columnWidths: [50, null, 0],
		});
		expect(result.sizes).toEqual([50, 0, 0]);
		expect(result.minContentWidth).toBe(50);
		expect(result.maxContentWidth).toBe(50);
	});
});

describe("table width selection and expansion", () => {
	const contributions = [cell(0, 1, 20, 60), cell(1, 1, 40, 160)];

	it.each<[number, number, readonly number[]]>([
		[0, 60, [20, 40]],
		[60, 60, [20, 40]],
		[140, 140, [40, 100]],
		[220, 220, [60, 160]],
		[1000, 220, [60, 160]],
	])(
		"shrink-to-fits available width %s without truncating minima",
		(availableWidth, usedWidth, expected) => {
			const result = size(2, contributions, { availableWidth });
			expect(result.usedWidth).toBe(usedWidth);
			expectSizes(result.sizes, expected);
			expectAccounting(result, 0);
		},
	);

	it("does not stretch zero-slack columns before other columns reach max-content", () => {
		const result = size(
			3,
			[cell(0, 1, 20), cell(1, 1, 20, 100), cell(2, 1, 0)],
			{
				availableWidth: 80,
			},
		);
		expect(result.sizes).toEqual([20, 60, 0]);
	});

	it.each<[number, number, number, readonly number[]]>([
		[0, 0, 60, [20, 40]],
		[10, 0, 60, [20, 40]],
		[140, 0, 140, [40, 100]],
		[300, 0, 300, [100, 200]],
		[10, 300, 300, [100, 200]],
		[400, 300, 400, [150, 250]],
	])(
		"honors specified width %s and caption minimum %s",
		(tableWidth, captionMinWidth, usedWidth, expected) => {
			const result = size(2, contributions, {
				tableWidth,
				captionMinWidth,
				availableWidth: 1,
			});
			expect(result.usedWidth).toBe(usedWidth);
			expectSizes(result.sizes, expected);
			expectAccounting(result, 0);
		},
	);

	it("expands an auto table for a caption without changing intrinsic cell totals", () => {
		const result = size(2, contributions, {
			availableWidth: 100,
			captionMinWidth: 300,
		});
		expect(result.minContentWidth).toBe(60);
		expect(result.maxContentWidth).toBe(220);
		expect(result.usedWidth).toBe(300);
		expect(result.sizes).toEqual([100, 200]);
	});

	it("includes spacing in specified extent and spreads beyond-max excess equally", () => {
		const result = size(2, contributions, {
			borderSpacing: 10,
			tableWidth: 330,
		});
		expect(result.sizes).toEqual([100, 200]);
		expect(result.offsets).toEqual([10, 120]);
		expect(result.usedWidth).toBe(330);
		expectAccounting(result, 10);
	});

	it("can distribute extent across columns without cell contributions", () => {
		const result = size(3, [], { borderSpacing: 2, tableWidth: 38 });
		expect(result.sizes).toEqual([10, 10, 10]);
		expect(result.minContentWidth).toBe(8);
		expectAccounting(result, 2);
	});

	it.each<[number | null, number, number]>([
		[null, 0, 0],
		[null, 40, 40],
		[70, 40, 70],
		[10, 40, 40],
	])(
		"keeps zero-column tables empty with width %s and caption %s",
		(tableWidth, captionMinWidth, usedWidth) => {
			const result = size(0, [], {
				tableWidth,
				captionMinWidth,
				borderSpacing: 100,
				columnWidths: [],
			});
			expect(result.sizes).toEqual([]);
			expect(result.offsets).toEqual([]);
			expect(result.minContentWidth).toBe(0);
			expect(result.maxContentWidth).toBe(0);
			expect(result.usedWidth).toBe(usedWidth);
		},
	);
});

describe("table column input and resource boundaries", () => {
	it("accepts frozen input and returns detached deeply frozen results", () => {
		const contributions = Object.freeze([
			Object.freeze(cell(0, 2, 100, 200)),
			Object.freeze(cell(0, 1, 10, 20)),
		]);
		const hints = Object.freeze([30, null]);
		const options = Object.freeze({
			availableWidth: 150,
			tableWidth: null,
			borderSpacing: 0,
			captionMinWidth: 0,
			columnWidths: hints,
		});
		const result = sizeTableColumns(2, contributions, options);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.sizes)).toBe(true);
		expect(Object.isFrozen(result.offsets)).toBe(true);
		expect(Object.isFrozen(result.metrics)).toBe(true);
		expect(Object.isFrozen(tableColumnSizingLimits)).toBe(true);
		expect(result.sizes).not.toBe(hints);
		expect(result.sizes).not.toBe(result.offsets);
		expect(contributions).toEqual([cell(0, 2, 100, 200), cell(0, 1, 10, 20)]);
		expect(hints).toEqual([30, null]);
		const mutableHints = [40, 50];
		const mutableContributions = [cell(0, 1, 10, 60)];
		const detached = size(2, mutableContributions, {
			columnWidths: mutableHints,
		});
		mutableHints[0] = 1000;
		mutableContributions[0] = cell(0, 1, 500);
		expect(detached.sizes).toEqual([60, 50]);
	});

	it.each([
		-1,
		0.5,
		NaN,
		Infinity,
		"2",
		null,
		undefined,
		Number.MAX_SAFE_INTEGER + 1,
	])("rejects column count %s", (columnCount) => {
		fails(() => size(columnCount as number), "invalid-input");
	});

	it.each(
		[
			null,
			undefined,
			{},
			"cells",
			[null],
			[undefined],
			[[]],
			[4],
			new Array(1),
		].map((contributions) => ({ contributions })),
	)("rejects malformed contributions $contributions", ({ contributions }) => {
		fails(
			() =>
				sizeTableColumns(1, contributions as never, {
					availableWidth: 1000,
					tableWidth: null,
					borderSpacing: 0,
					captionMinWidth: 0,
				}),
			"invalid-input",
		);
	});

	it.each(
		[null, undefined, [], 4, "options", {}].map((options) => ({ options })),
	)("rejects malformed options $options", ({ options }) => {
		fails(() => sizeTableColumns(1, [], options as never), "invalid-input");
	});

	it.each([
		cell(-1, 1, 0),
		cell(0.5, 1, 0),
		cell(2, 1, 0),
		cell(0, 0, 0),
		cell(0, -1, 0),
		cell(0, 1.5, 0),
		cell(1, 2, 0),
		cell(NaN, 1, 0),
		cell(0, Infinity, 0),
		cell(0, Number.MAX_SAFE_INTEGER, 0),
		cell(0, 1, 20, 10),
		{ column: 0, span: 1, minContent: 0 },
	])("rejects invalid span or content ordering %s", (contribution) => {
		fails(
			() => size(2, [contribution as TableColumnContribution]),
			"invalid-input",
		);
	});

	it.each([-1, NaN, Infinity, -Infinity, "10", null, undefined])(
		"rejects invalid dimension %s in every field",
		(dimension) => {
			for (const field of [
				"availableWidth",
				"borderSpacing",
				"captionMinWidth",
			])
				fails(
					() => size(1, [], { [field]: dimension } as never),
					"invalid-input",
				);
			if (dimension !== null)
				fails(
					() => size(1, [], { tableWidth: dimension } as never),
					"invalid-input",
				);
			fails(
				() => size(1, [cell(0, 1, dimension as number, 100)]),
				"invalid-input",
			);
			fails(
				() =>
					size(1, [
						{
							column: 0,
							span: 1,
							minContent: 0,
							maxContent: dimension as number,
						},
					]),
				"invalid-input",
			);
			if (dimension !== null)
				fails(
					() => size(1, [], { columnWidths: [dimension] } as never),
					"invalid-input",
				);
		},
	);

	it.each(
		[null, {}, "widths", [], [0, 0], new Array(1)].map((columnWidths) => ({
			columnWidths,
		})),
	)("rejects malformed hints $columnWidths", ({ columnWidths }) => {
		fails(() => size(1, [], { columnWidths } as never), "invalid-input");
	});

	it("rejects contributions or nonempty hints on a zero-column table", () => {
		fails(() => size(0, [cell(0, 1, 0)]), "invalid-input");
		fails(() => size(0, [], { columnWidths: [null] }), "invalid-input");
	});

	it.each([
		0,
		-1,
		0.5,
		NaN,
		Infinity,
		null,
		"100",
		tableColumnSizingLimits.maxWork + 1,
	])("rejects invalid work ceiling %s", (maxWork) => {
		fails(() => size(1, [], { maxWork } as never), "invalid-input");
	});

	it("charges deterministic input, bucket sorting, span, distribution and output work", () => {
		const contributions = [
			cell(0, 3, 200, 500),
			cell(0, 2, 100, 300),
			cell(2, 1, 20, 80),
		];
		const options = { availableWidth: 400 };
		const result = size(3, contributions, options);
		expect(Number.isSafeInteger(result.metrics.work)).toBe(true);
		expect(result.metrics.work).toBeGreaterThan(3 + contributions.length);
		expect(
			size(3, contributions, { ...options, maxWork: result.metrics.work }),
		).toEqual(result);
		fails(
			() =>
				size(3, contributions, {
					...options,
					maxWork: result.metrics.work - 1,
				}),
			"resource-limit",
		);
		fails(() => size(0, [], { maxWork: 1 }), "resource-limit");
	});

	it("enforces column and contribution caps before iterating oversized inputs", () => {
		fails(() => size(tableColumnSizingLimits.maxColumns + 1), "resource-limit");
		fails(
			() => size(1, new Array(tableColumnSizingLimits.maxContributions + 1)),
			"resource-limit",
		);
		expect(size(tableColumnSizingLimits.maxColumns).sizes).toHaveLength(
			tableColumnSizingLimits.maxColumns,
		);
		const contributions = Array.from(
			{ length: tableColumnSizingLimits.maxContributions },
			() => cell(0, 1, 1),
		);
		expect(size(1, contributions).sizes).toEqual([1]);
	});

	it("bounds worst-case spanning work and respects lower positive budgets", () => {
		const contributions = Array.from(
			{ length: tableColumnSizingLimits.maxContributions },
			() => cell(0, tableColumnSizingLimits.maxColumns, 1, 2),
		);
		fails(
			() => size(tableColumnSizingLimits.maxColumns, contributions),
			"resource-limit",
		);
		fails(
			() => size(100, [cell(0, 100, 100, 200)], { maxWork: 100 }),
			"resource-limit",
		);
	});

	it("enforces native length caps for dimensions, hints and aggregate extents", () => {
		const limit = layoutValueLimits.maxAbsoluteLength;
		for (const field of [
			"availableWidth",
			"tableWidth",
			"borderSpacing",
			"captionMinWidth",
		])
			fails(() => size(1, [], { [field]: limit + 1 }), "resource-limit");
		fails(() => size(1, [], { columnWidths: [limit + 1] }), "resource-limit");
		fails(() => size(1, [cell(0, 1, limit + 1)]), "resource-limit");
		fails(() => size(1, [cell(0, 1, 0, limit + 1)]), "resource-limit");
		fails(() => size(2, [cell(0, 1, limit), cell(1, 1, 1)]), "resource-limit");
		fails(
			() => size(2, [cell(0, 1, 0, limit), cell(1, 1, 0, 1)]),
			"resource-limit",
		);
		fails(
			() => size(1, [cell(0, 1, limit)], { borderSpacing: 1 }),
			"resource-limit",
		);
		fails(() => size(2, [], { borderSpacing: limit / 2 }), "resource-limit");
		fails(() => size(2, [], { columnWidths: [limit, 1] }), "resource-limit");
		expect(size(1, [cell(0, 1, limit)]).usedWidth).toBe(limit);
	});
});

describe("table column numerical accounting", () => {
	it("carries underflowed equal shares into the final covered column", () => {
		const result = size(3, [cell(0, 3, Number.MIN_VALUE)]);
		expect(result.sizes).toEqual([0, 0, Number.MIN_VALUE]);
		expect(result.minContentWidth).toBe(Number.MIN_VALUE);
		expect(result.maxContentWidth).toBe(Number.MIN_VALUE);
		expect(result.usedWidth).toBe(Number.MIN_VALUE);
	});

	it.each([Number.MIN_VALUE, 1e-200, 1e-12, 0.1, 1, 100_000])(
		"keeps rounded widths nonnegative at scale %s",
		(scale) => {
			const contributions = [
				cell(0, 1, scale, 2 * scale),
				cell(1, 1, 2 * scale, 7 * scale),
				cell(0, 3, 8 * scale, 13 * scale),
			];
			for (const availableWidth of [0, 10 * scale, 100 * scale]) {
				const result = size(3, contributions, {
					availableWidth,
					borderSpacing: scale / 3,
				});
				expectAccounting(result, scale / 3);
				for (const contribution of contributions) {
					const extent = result.sizes
						.slice(contribution.column, contribution.column + contribution.span)
						.reduce(
							(total, width) => total + width,
							((contribution.span - 1) * scale) / 3,
						);
					expect(
						extent + tolerance(result.usedWidth, 3),
					).toBeGreaterThanOrEqual(contribution.minContent);
				}
			}
		},
	);

	it("accounts for many fractional tracks near the native length ceiling", () => {
		const columnCount = 4093;
		const borderSpacing = 0.1;
		const tableWidth = layoutValueLimits.maxAbsoluteLength - 1;
		const result = size(columnCount, [cell(0, columnCount, 1, 3)], {
			tableWidth,
			borderSpacing,
		});
		expect(result.usedWidth).toBe(tableWidth);
		expectAccounting(result, borderSpacing);
		const expected =
			(tableWidth - (columnCount + 1) * borderSpacing) / columnCount;
		for (const width of result.sizes)
			expect(Math.abs(width - expected)).toBeLessThanOrEqual(
				tolerance(tableWidth, columnCount),
			);
	});

	it("retains tiny positive slack next to a large fixed minimum", () => {
		const contributions = [
			cell(0, 1, 8_000_000),
			cell(1, 1, 1e-8, 3e-8),
			cell(2, 1, 0, 1e-8),
		];
		const result = size(3, contributions, { availableWidth: 8_000_000 + 2e-8 });
		expect(result.sizes[0]).toBe(8_000_000);
		expect(result.sizes[1]).toBeGreaterThanOrEqual(1e-8);
		expect(result.sizes[1]).toBeLessThanOrEqual(3e-8);
		expect(result.sizes[2]).toBeGreaterThanOrEqual(0);
		expect(result.sizes[2]).toBeLessThanOrEqual(1e-8);
		expectAccounting(result, 0);
	});

	it("normalizes negative zero without inventing columns or negative widths", () => {
		const result = size(1, [cell(-0, 1, -0, -0)], {
			availableWidth: -0,
			borderSpacing: -0,
			captionMinWidth: -0,
			columnWidths: [-0],
		});
		for (const value of [
			...result.sizes,
			...result.offsets,
			result.minContentWidth,
			result.maxContentWidth,
			result.usedWidth,
		])
			expect(Object.is(value, -0)).toBe(false);
	});
});
