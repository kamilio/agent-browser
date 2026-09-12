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
	percentage?: number,
	percentageOffset?: number,
): TableColumnContribution => ({
	column,
	span,
	minContent,
	maxContent,
	percentage,
	percentageOffset,
});

const size = (
	columnCount: number,
	contributions: readonly TableColumnContribution[],
	options: Partial<TableColumnSizingOptions> = {},
) =>
	sizeTableColumns(columnCount, contributions, {
		availableWidth: 1000,
		tableWidth: 200,
		borderSpacing: 0,
		captionMinWidth: 0,
		...options,
	});

function expectAccounting(result: TableColumnSizing, spacing = 0) {
	let cursor = spacing;
	for (let index = 0; index < result.sizes.length; index++) {
		expect(Number.isFinite(result.sizes[index])).toBe(true);
		expect(result.sizes[index]).toBeGreaterThanOrEqual(0);
		expect(result.offsets[index]).toBeCloseTo(cursor, 8);
		cursor += result.sizes[index] + spacing;
	}
	expect(result.usedWidth).toBeCloseTo(cursor, 8);
	expect(result.maxContentWidth).toBeGreaterThanOrEqual(result.minContentWidth);
	expect(result.usedWidth).toBeGreaterThanOrEqual(result.minContentWidth);
}

function fails(run: () => unknown, code: string) {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		return;
	}
	throw new Error(`Expected ${code}`);
}

it("uses all rows' column maxima when inverting a percentage preference", () => {
	const result = size(
		2,
		[cell(0, 1, 10, 10, 0.5), cell(0, 1, 200), cell(1, 1, 50)],
		{ tableWidth: null },
	);
	expect(result.minContentWidth).toBe(250);
	expect(result.maxContentWidth).toBe(400);
	expect(result.usedWidth).toBe(400);
	expect(result.sizes).toEqual([200, 200]);
	expectAccounting(result);
});

it.each([0.01, Number.MIN_VALUE])(
	"does not let a weaker same-column percentage %s inflate the intrinsic maximum",
	(percentage) => {
		const result = size(
			2,
			[cell(0, 1, 10, 10, percentage), cell(0, 1, 10, 10, 0.5), cell(1, 1, 50)],
			{ tableWidth: null },
		);
		expect(result.maxContentWidth).toBe(100);
		expect(result.sizes).toEqual([50, 50]);
		expectAccounting(result);
	},
);

describe("definite automatic-table percentage tracks", () => {
	it("allocates 50 percent before giving the remainder to an auto track", () => {
		const result = size(2, [cell(0, 1, 0, 0, 0.5), cell(1, 1, 0)]);
		expect(result.sizes).toEqual([100, 100]);
		expect(result.usedWidth).toBe(200);
		expectAccounting(result);
	});

	it("leaves half the width after two quarter-width requests", () => {
		const result = size(3, [
			cell(0, 1, 0, 0, 0.25),
			cell(1, 1, 0, 0, 0.25),
			cell(2, 1, 0),
		]);
		expect(result.sizes).toEqual([50, 50, 100]);
		expectAccounting(result);
	});

	it("compresses two 80 percent preferences instead of overflowing", () => {
		const result = size(2, [cell(0, 1, 0, 0, 0.8), cell(1, 1, 0, 0, 0.8)]);
		expect(result.sizes).toEqual([100, 100]);
		expect(result.usedWidth).toBe(200);
		expectAccounting(result);
	});

	it("compresses only growth above unequal minima and preserves intrinsic overflow", () => {
		const compressed = size(2, [
			cell(0, 1, 120, 120, 0.8),
			cell(1, 1, 40, 40, 0.8),
		]);
		expect(compressed.sizes).toEqual([130, 70]);
		expect(compressed.minContentWidth).toBe(160);
		expectAccounting(compressed);
		const intrinsic = size(2, [
			cell(0, 1, 150, 150, 0.8),
			cell(1, 1, 100, 100, 0.8),
		]);
		expect(intrinsic.sizes).toEqual([150, 100]);
		expect(intrinsic.usedWidth).toBe(250);
		expectAccounting(intrinsic);
	});

	it("treats zero percent as constrained rather than as an auto track", () => {
		const result = size(2, [cell(0, 1, 20, 80, 0), cell(1, 1, 20)]);
		expect(result.sizes).toEqual([20, 180]);
		expectAccounting(result);
	});

	it("adds content-box edges to the request and defaults the offset to zero", () => {
		const contentBox = size(2, [cell(0, 1, 20, 20, 0.5, 20), cell(1, 1, 0)]);
		const borderBox = size(2, [cell(0, 1, 20, 20, 0.5), cell(1, 1, 0)]);
		expect(contentBox.sizes).toEqual([120, 80]);
		expect(borderBox.sizes).toEqual([100, 100]);
		expectAccounting(contentBox);
		expectAccounting(borderBox);
	});

	it("resolves percentages against tracks excluding all separated spacing", () => {
		const result = size(2, [cell(0, 1, 0, 0, 0.5), cell(1, 1, 0)], {
			tableWidth: 230,
			borderSpacing: 10,
		});
		expect(result.sizes).toEqual([100, 100]);
		expect(result.offsets).toEqual([10, 120]);
		expect(result.usedWidth).toBe(230);
		expectAccounting(result, 10);
	});

	it("subtracts internal span spacing before growing covered tracks equally", () => {
		const result = size(3, [cell(0, 2, 0, 0, 0.6), cell(2, 1, 0)], {
			tableWidth: 240,
			borderSpacing: 10,
		});
		expect(result.sizes).toEqual([55, 55, 90]);
		expect(result.offsets).toEqual([10, 75, 140]);
		expect(result.sizes[0] + 10 + result.sizes[1]).toBe(120);
		expectAccounting(result, 10);
	});

	it("takes the greatest same-column effective request without summing rows", () => {
		const contributions = [
			cell(0, 1, 0, 0, 0.5),
			cell(0, 1, 60, 60, 0.25, 60),
			cell(0, 1, 0, 0, 0.5),
			cell(1, 1, 0),
		];
		for (const ordered of [contributions, [...contributions].reverse()]) {
			const result = size(2, ordered);
			expect(result.sizes).toEqual([110, 90]);
			expectAccounting(result);
		}
	});

	it("processes overlapping preferences by increasing span and column", () => {
		const contributions = [
			cell(1, 2, 0, 0, 0.5),
			cell(0, 2, 0, 0, 0.6),
			cell(0, 1, 0, 0, 0.2),
			cell(3, 1, 0),
		];
		for (const ordered of [contributions, [...contributions].reverse()]) {
			const result = size(4, ordered);
			expect(result.sizes).toEqual([80, 70, 30, 20]);
			expectAccounting(result);
		}
	});

	it("grows nonpercentage tracks to maximum content before sharing excess", () => {
		const result = size(3, [
			cell(0, 1, 0, 0, 0.25),
			cell(1, 1, 10, 30),
			cell(2, 1, 10, 70),
		]);
		expect(result.sizes).toEqual([50, 55, 95]);
		expectAccounting(result);
	});

	it("shares unused space across every track when all tracks have percentages", () => {
		const result = size(2, [cell(0, 1, 0, 0, 0.25), cell(1, 1, 0, 0, 0.5)]);
		expect(result.sizes).toEqual([75, 125]);
		expectAccounting(result);
	});
});

describe("automatic-table percentage intrinsic inversion", () => {
	it("inverts a nonzero request without turning it into a hard minimum", () => {
		const contributions = [cell(0, 1, 20, 50, 0.25), cell(1, 1, 10)];
		const result = size(2, contributions, { tableWidth: null });
		expect(result.minContentWidth).toBe(30);
		expect(result.maxContentWidth).toBe(200);
		expect(result.sizes).toEqual([50, 150]);
		expectAccounting(result);
		const limited = size(2, contributions, {
			tableWidth: null,
			availableWidth: 80,
		});
		expect(limited.sizes).toEqual([20, 60]);
		expect(limited.usedWidth).toBe(80);
		expectAccounting(limited);
	});

	it("reserves the remaining fraction for nonpercentage maximum content", () => {
		const result = size(2, [cell(0, 1, 0, 10, 0.25), cell(1, 1, 10, 90)], {
			tableWidth: null,
		});
		expect(result.maxContentWidth).toBe(120);
		expect(result.sizes).toEqual([30, 90]);
		expectAccounting(result);
	});

	it("removes the content-box offset when inverting an outer contribution", () => {
		const result = size(2, [cell(0, 1, 20, 70, 0.5, 20), cell(1, 1, 10)], {
			tableWidth: null,
		});
		expect(result.maxContentWidth).toBe(100);
		expect(result.sizes).toEqual([70, 30]);
		expectAccounting(result);
	});

	it("charges percentage offsets against the space left for auto content", () => {
		const result = size(2, [cell(0, 1, 20, 20, 0.5, 20), cell(1, 1, 0, 80)], {
			tableWidth: null,
		});
		expect(result.maxContentWidth).toBe(200);
		expect(result.sizes).toEqual([120, 80]);
		expectAccounting(result);
	});

	it("retains ordinary maximum content and never divides by zero percent", () => {
		const result = size(2, [cell(0, 1, 20, 40, 0), cell(1, 1, 20, 60)], {
			tableWidth: null,
		});
		expect(result.maxContentWidth).toBe(100);
		expect(result.sizes).toEqual([20, 80]);
		expectAccounting(result);
	});

	it("does not invert a nonpositive remaining fraction", () => {
		const result = size(
			3,
			[cell(0, 1, 0, 10, 0.6), cell(1, 1, 0, 10, 0.6), cell(2, 1, 40)],
			{ tableWidth: null },
		);
		expect(result.maxContentWidth).toBe(60);
		expect(result.sizes).toEqual([10, 10, 40]);
		expectAccounting(result);
	});

	it("inverts the requested span outer width and then adds table spacing", () => {
		const result = size(3, [cell(0, 2, 10, 110, 0.5), cell(2, 1, 0, 20)], {
			tableWidth: null,
			borderSpacing: 10,
		});
		expect(result.maxContentWidth).toBe(260);
		expect(result.sizes).toEqual([50, 50, 120]);
		expectAccounting(result, 10);
	});
});

describe("percentage contribution validation and accounting", () => {
	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		-0.1,
	])("rejects invalid percentage or percentage offset %s", (value) => {
		fails(() => size(1, [cell(0, 1, 0, 0, value)]), "invalid-input");
		fails(() => size(1, [cell(0, 1, 0, 0, 0.5, value)]), "invalid-input");
	});

	it("rejects an offset without a percentage even when the offset is zero", () => {
		for (const offset of [0, 10])
			fails(
				() => size(1, [cell(0, 1, 0, 0, undefined, offset)]),
				"invalid-input",
			);
	});

	it("bounds percentage inputs, offsets, multiplication and tiny-fraction inversion", () => {
		const limit = layoutValueLimits.maxAbsoluteLength;
		fails(() => size(1, [cell(0, 1, 0, 0, limit + 1)]), "resource-limit");
		fails(() => size(1, [cell(0, 1, 0, 0, 0.5, limit + 1)]), "resource-limit");
		fails(() => size(1, [cell(0, 1, 0, 0, limit)]), "resource-limit");
		fails(
			() => size(1, [cell(0, 1, 1, 1, Number.MIN_VALUE)], { tableWidth: null }),
			"resource-limit",
		);
	});

	it("accounts for percentage work and rejects bounded oversized inputs", () => {
		const contributions = [cell(0, 2, 0, 20, 0.5), cell(2, 1, 0, 10)];
		const result = size(3, contributions);
		expect(result.metrics.work).toBeGreaterThan(1);
		expect(result.metrics.work).toBeLessThanOrEqual(
			tableColumnSizingLimits.maxWork,
		);
		expect(size(3, contributions, { maxWork: result.metrics.work })).toEqual(
			result,
		);
		fails(
			() => size(3, contributions, { maxWork: result.metrics.work - 1 }),
			"resource-limit",
		);
		fails(
			() => size(tableColumnSizingLimits.maxColumns + 1, contributions),
			"resource-limit",
		);
		fails(
			() => size(1, new Array(tableColumnSizingLimits.maxContributions + 1)),
			"resource-limit",
		);
		fails(
			() => size(100, [cell(0, 100, 0, 100, 0.5)], { maxWork: 100 }),
			"resource-limit",
		);
	});

	it("does not mutate frozen inputs and returns frozen percentage results", () => {
		const contributions = Object.freeze([
			Object.freeze(cell(0, 1, 10, 20, 0.5, 10)),
			Object.freeze(cell(1, 1, 10, 30)),
		]);
		const before = contributions.map((contribution) => ({ ...contribution }));
		const options = Object.freeze({
			availableWidth: 1000,
			tableWidth: 200,
			borderSpacing: 0,
			captionMinWidth: 0,
			columnWidths: Object.freeze([null, null]),
		});
		const result = sizeTableColumns(2, contributions, options);
		expect(result.sizes).toEqual([110, 90]);
		expect(contributions).toEqual(before);
		expect(options.columnWidths).toEqual([null, null]);
		for (const value of [result, result.sizes, result.offsets, result.metrics])
			expect(Object.isFrozen(value)).toBe(true);
		expect(sizeTableColumns(2, contributions, options)).toEqual(result);
		expectAccounting(result);
	});

	it("preserves ordinary nonpercentage interpolation with omitted optional fields", () => {
		const result = size(
			2,
			[
				{ column: 0, span: 1, minContent: 40, maxContent: 60 },
				{ column: 1, span: 1, minContent: 100, maxContent: 180 },
				{ column: 0, span: 1, minContent: 70, maxContent: 90 },
				{ column: 1, span: 1, minContent: 80, maxContent: 220 },
			],
			{ tableWidth: null, availableWidth: 240 },
		);
		expect(result.minContentWidth).toBe(170);
		expect(result.maxContentWidth).toBe(310);
		expect(result.sizes).toEqual([80, 160]);
		expectAccounting(result);
	});
});
