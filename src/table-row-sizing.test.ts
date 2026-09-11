import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { layoutValueLimits } from "./layout-values.js";
import {
	sizeTableRows,
	tableRowSizingLimits,
	type TableRowContribution,
	type TableRowSizingOptions,
} from "./table-row-sizing.js";

const cell = (
	id: number,
	row: number,
	span: number,
	height: number,
	verticalAlign: TableRowContribution["verticalAlign"] = "top",
	baseline: number | null = null,
): TableRowContribution => ({ id, row, span, height, verticalAlign, baseline });

const size = (
	rowCount: number,
	contributions: readonly TableRowContribution[] = [],
	options: Partial<TableRowSizingOptions> = {},
) =>
	sizeTableRows(rowCount, contributions, {
		borderSpacing: 0,
		tableHeight: null,
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

describe("native table row sizing", () => {
	it("uses measured mixed heights and returns cell-local alignment offsets", () => {
		const result = size(2, [
			cell(10, 0, 1, 30),
			cell(11, 0, 1, 10, "middle"),
			cell(12, 0, 1, 10, "bottom"),
			cell(13, 1, 1, 12),
		]);
		expect(result.sizes).toEqual([30, 12]);
		expect(result.offsets).toEqual([0, 30]);
		expect(result.baselines).toEqual([null, null]);
		expect(result.cells).toEqual([
			{ id: 10, areaHeight: 30, offset: 0 },
			{ id: 11, areaHeight: 30, offset: 10 },
			{ id: 12, areaHeight: 30, offset: 20 },
			{ id: 13, areaHeight: 12, offset: 0 },
		]);
		expect(result.naturalHeight).toBe(42);
		expect(result.usedHeight).toBe(42);
	});

	it("aligns baselines and includes shifted descents in row minima", () => {
		const result = size(1, [
			cell(0, 0, 1, 20, "baseline", 15),
			cell(1, 0, 1, 30, "baseline", 10),
			cell(2, 0, 1, 10, "top", 100),
		]);
		expect(result.baselines).toEqual([15]);
		expect(result.sizes).toEqual([35]);
		expect(result.cells.map((entry) => entry.offset)).toEqual([0, 5, 0]);
	});

	it("uses natural height for null baselines and permits signed baselines", () => {
		const result = size(2, [
			cell(0, 0, 1, 20, "baseline"),
			cell(1, 0, 1, 10, "baseline", -5),
			cell(2, 1, 1, 6, "baseline", -3),
		]);
		expect(result.baselines).toEqual([20, 0]);
		expect(result.sizes).toEqual([35, 9]);
		expect(result.cells.map((entry) => entry.offset)).toEqual([0, 25, 3]);
	});

	it("seeds ascent even when the baseline is beyond the natural cell bottom", () => {
		const result = size(2, [cell(0, 0, 2, 5, "baseline", 20)]);
		expect(result.baselines).toEqual([20, null]);
		expect(result.sizes).toEqual([20, 0]);
	});

	it("processes shorter spans first, keeping input order for equal spans", () => {
		const result = size(3, [cell(0, 0, 3, 90), cell(1, 0, 2, 60)]);
		expect(result.sizes).toEqual([40, 40, 10]);
		expect(result.cells.map((entry) => entry.id)).toEqual([0, 1]);
		const forward = size(3, [cell(0, 0, 2, 60), cell(1, 1, 2, 60)]);
		const reverse = size(3, [cell(1, 1, 2, 60), cell(0, 0, 2, 60)]);
		expect(forward.sizes).toEqual([30, 45, 15]);
		expect(reverse.sizes).toEqual([15, 45, 30]);
	});

	it("includes spanning baseline shifts, internal spacing and outer spacing", () => {
		const result = size(
			2,
			[cell(0, 0, 1, 12, "baseline", 10), cell(1, 0, 2, 30, "baseline", 4)],
			{ borderSpacing: 2 },
		);
		expect(result.baselines).toEqual([10, null]);
		expect(result.sizes).toEqual([23, 11]);
		expect(result.offsets).toEqual([2, 27]);
		expect(result.cells).toEqual([
			{ id: 0, areaHeight: 23, offset: 0 },
			{ id: 1, areaHeight: 36, offset: 6 },
		]);
		expect(result.naturalHeight).toBe(40);
	});

	it("allows internal spacing alone to satisfy a spanning cell", () => {
		const result = size(3, [cell(0, 0, 3, 2, "middle")], { borderSpacing: 3 });
		expect(result.sizes).toEqual([0, 0, 0]);
		expect(result.offsets).toEqual([3, 6, 9]);
		expect(result.cells).toEqual([{ id: 0, areaHeight: 6, offset: 2 }]);
		expect(result.naturalHeight).toBe(12);
	});

	it("honors minimum hints and distributes explicit expansion equally", () => {
		const contributions = [cell(0, 0, 1, 10, "bottom"), cell(1, 1, 1, 20)];
		const options = { rowHeights: [30, null], borderSpacing: 2 };
		const result = size(2, contributions, { ...options, tableHeight: 76 });
		expect(result.sizes).toEqual([40, 30]);
		expect(result.offsets).toEqual([2, 44]);
		expect(result.naturalHeight).toBe(56);
		expect(result.usedHeight).toBe(76);
		expect(result.cells[0]!.offset).toBe(30);
		expect(
			size(2, contributions, { ...options, tableHeight: 1 }).sizes,
		).toEqual([30, 20]);
	});

	it("does not move a row baseline during explicit height expansion", () => {
		const result = size(1, [cell(0, 0, 1, 10, "baseline", 6)], {
			tableHeight: 30,
		});
		expect(result.baselines).toEqual([6]);
		expect(result.cells).toEqual([{ id: 0, areaHeight: 30, offset: 0 }]);
	});

	it("retains empty table height without spacing or fabricated rows", () => {
		const result = size(0, [], {
			borderSpacing: 100,
			tableHeight: 30,
			rowHeights: [],
		});
		expect(result.sizes).toEqual([]);
		expect(result.offsets).toEqual([]);
		expect(result.baselines).toEqual([]);
		expect(result.cells).toEqual([]);
		expect(result.naturalHeight).toBe(0);
		expect(result.usedHeight).toBe(30);
		expect(size(0).usedHeight).toBe(0);
		expect(size(2, [], { tableHeight: 10 }).sizes).toEqual([5, 5]);
	});

	it("returns deeply frozen detached data without mutating inputs", () => {
		const hints = Object.freeze([20, null]);
		const contributions = Object.freeze([Object.freeze(cell(0, 0, 2, 40))]);
		const result = size(2, contributions, Object.freeze({ rowHeights: hints }));
		for (const value of [
			result,
			result.sizes,
			result.offsets,
			result.baselines,
			result.cells,
			result.cells[0],
			result.metrics,
			tableRowSizingLimits,
		])
			expect(Object.isFrozen(value)).toBe(true);
		expect(result.sizes).not.toBe(hints);
		expect(result.sizes).not.toBe(result.offsets);
		expect(result.cells[0]).not.toBe(contributions[0]);
		expect(hints).toEqual([20, null]);
		expect(contributions).toEqual([cell(0, 0, 2, 40)]);
		const mutableCell = { ...cell(0, 0, 1, 10, "baseline", 5) };
		const mutableHints = [20];
		const detached = size(1, [mutableCell], { rowHeights: mutableHints });
		mutableCell.height = 100;
		mutableCell.baseline = 80;
		mutableHints[0] = 200;
		expect(detached.sizes).toEqual([20]);
		expect(detached.baselines).toEqual([5]);
		expect(detached.cells).toEqual([{ id: 0, areaHeight: 20, offset: 0 }]);
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
	])("rejects row count %s", (rowCount) =>
		fails(() => size(rowCount as number), "invalid-input"),
	);

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
				sizeTableRows(1, contributions as never, {
					borderSpacing: 0,
					tableHeight: null,
				}),
			"invalid-input",
		);
	});

	it.each(
		[
			null,
			undefined,
			[],
			4,
			"options",
			{},
			{ borderSpacing: 0 },
			{ tableHeight: null },
		].map((options) => ({ options })),
	)("rejects malformed options $options", ({ options }) => {
		fails(() => sizeTableRows(1, [], options as never), "invalid-input");
	});

	it("rejects invalid identifiers, spans, dimensions, baselines and alignments", () => {
		const overrides: Record<string, unknown>[] = [
			...["id", "row", "span"].flatMap((field) =>
				[
					-1,
					0.5,
					NaN,
					Infinity,
					"1",
					null,
					undefined,
					Number.MAX_SAFE_INTEGER + 1,
				].map((value) => ({ [field]: value })),
			),
			{ row: 2 },
			{ span: 0 },
			{ row: 1, span: 2 },
			...[-1, NaN, Infinity, "1", null, undefined].map((height) => ({
				height,
			})),
			...[NaN, Infinity, -Infinity, "1", undefined].map((baseline) => ({
				baseline,
			})),
			...["center", "", null, undefined, 0].map((verticalAlign) => ({
				verticalAlign,
			})),
		];
		for (const override of overrides)
			fails(
				() => size(2, [{ ...cell(0, 0, 1, 1), ...override } as never]),
				"invalid-input",
			);
		fails(() => size(1, [cell(0, 0, 1, 0), cell(0, 0, 1, 1)]), "invalid-input");
		expect(size(1, [cell(Number.MAX_SAFE_INTEGER, 0, 1, 0)]).cells[0]!.id).toBe(
			Number.MAX_SAFE_INTEGER,
		);
	});

	it("rejects invalid options, sparse hints and cells on an empty table", () => {
		for (const field of ["borderSpacing", "tableHeight"])
			for (const value of [-1, NaN, Infinity, "1", undefined])
				fails(() => size(1, [], { [field]: value } as never), "invalid-input");
		fails(() => size(1, [], { borderSpacing: null } as never), "invalid-input");
		for (const rowHeights of [
			null,
			{},
			"heights",
			[],
			[0, 0],
			new Array(1),
			[-1],
			[NaN],
			[Infinity],
			[undefined],
		])
			fails(() => size(1, [], { rowHeights } as never), "invalid-input");
		fails(() => size(0, [cell(0, 0, 1, 0)]), "invalid-input");
		fails(() => size(0, [], { rowHeights: [null] }), "invalid-input");
	});

	it.each([
		0,
		-1,
		0.5,
		NaN,
		Infinity,
		null,
		"100",
		tableRowSizingLimits.maxWork + 1,
	])("rejects work ceiling %s", (maxWork) =>
		fails(() => size(1, [], { maxWork } as never), "invalid-input"),
	);

	it("charges deterministic traversal, span, growth and output work", () => {
		const contributions = [cell(0, 0, 3, 90, "baseline", 5), cell(1, 0, 2, 40)];
		const options = { tableHeight: 120, borderSpacing: 2 };
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

	it("enforces input caps before traversal and accepts their exact boundaries", () => {
		fails(() => size(tableRowSizingLimits.maxRows + 1), "resource-limit");
		fails(
			() => size(1, new Array(tableRowSizingLimits.maxContributions + 1)),
			"resource-limit",
		);
		expect(size(tableRowSizingLimits.maxRows).sizes).toHaveLength(
			tableRowSizingLimits.maxRows,
		);
		const contributions = Array.from(
			{ length: tableRowSizingLimits.maxContributions },
			(_value, index) => cell(index, 0, 1, 1),
		);
		expect(size(1, contributions).cells).toHaveLength(
			tableRowSizingLimits.maxContributions,
		);
	});

	it("bounds worst-case span scans and validates every cell before expansion", () => {
		const contributions = Array.from(
			{ length: tableRowSizingLimits.maxContributions },
			(_value, index) => cell(index, 0, tableRowSizingLimits.maxRows, 1),
		);
		fails(
			() => size(tableRowSizingLimits.maxRows, contributions),
			"resource-limit",
		);
		fails(
			() => size(100, [cell(0, 0, 100, 100)], { maxWork: 100 }),
			"resource-limit",
		);
		fails(
			() =>
				size(2, [
					cell(0, 0, 2, layoutValueLimits.maxAbsoluteLength, "baseline", -1),
					cell(-1, 0, 1, 0),
				]),
			"invalid-input",
		);
	});

	it("enforces native length caps on signed baselines and computed extents", () => {
		const limit = layoutValueLimits.maxAbsoluteLength;
		for (const field of ["borderSpacing", "tableHeight"])
			fails(() => size(1, [], { [field]: limit + 1 }), "resource-limit");
		fails(() => size(1, [], { rowHeights: [limit + 1] }), "resource-limit");
		fails(() => size(1, [cell(0, 0, 1, limit + 1)]), "resource-limit");
		for (const baseline of [limit + 1, -limit - 1])
			fails(
				() => size(1, [cell(0, 0, 1, 0, "top", baseline)]),
				"resource-limit",
			);
		fails(
			() => size(1, [cell(0, 0, 1, limit, "baseline", -1)]),
			"resource-limit",
		);
		fails(() => size(2, [], { rowHeights: [limit, 1] }), "resource-limit");
		fails(() => size(1, [], { borderSpacing: limit }), "resource-limit");
		expect(size(1, [cell(0, 0, 1, limit)]).usedHeight).toBe(limit);
	});

	it.each([Number.MIN_VALUE, 1e-200, 1e-12, 0.1, 1, 100_000])(
		"keeps nonnegative finite geometry and span accounting at scale %s",
		(scale) => {
			const contributions = [
				cell(0, 0, 1, 3 * scale, "baseline", -scale),
				cell(1, 0, 3, 11 * scale, "baseline", 2 * scale),
				cell(2, 1, 2, 9 * scale, "middle"),
				cell(3, 2, 1, 2 * scale, "bottom"),
			];
			const result = size(3, contributions, {
				borderSpacing: scale,
				tableHeight: 23 * scale,
			});
			const precision =
				32 * Number.EPSILON * Math.max(1, result.usedHeight) * 3;
			let cursor = scale;
			for (let index = 0; index < result.sizes.length; index++) {
				expect(Number.isFinite(result.sizes[index])).toBe(true);
				expect(result.sizes[index]).toBeGreaterThanOrEqual(0);
				expect(Math.abs(result.offsets[index]! - cursor)).toBeLessThanOrEqual(
					precision,
				);
				cursor += result.sizes[index]! + scale;
			}
			expect(Math.abs(cursor - result.usedHeight)).toBeLessThanOrEqual(
				precision,
			);
			for (let index = 0; index < contributions.length; index++) {
				const contribution = contributions[index]!;
				const geometry = result.cells[index]!;
				const areaHeight = result.sizes
					.slice(contribution.row, contribution.row + contribution.span)
					.reduce(
						(total, height) => total + height,
						(contribution.span - 1) * scale,
					);
				expect(Number.isFinite(geometry.offset)).toBe(true);
				expect(geometry.offset).toBeGreaterThanOrEqual(0);
				expect(geometry.areaHeight + precision).toBeGreaterThanOrEqual(
					contribution.height + geometry.offset,
				);
				expect(Math.abs(areaHeight - geometry.areaHeight)).toBeLessThanOrEqual(
					precision,
				);
			}
		},
	);

	it("preserves tiny row areas next to large unrelated rows", () => {
		const result = size(3, [
			cell(0, 0, 1, 1e7),
			cell(1, 1, 1, 1e-12),
			cell(2, 2, 1, 0.1),
		]);
		expect(result.sizes).toEqual([1e7, 1e-12, 0.1]);
		expect(result.cells[1]!.areaHeight).toBe(1e-12);
		expect(result.usedHeight).toBeCloseTo(1e7 + 0.1, 7);
	});
});
