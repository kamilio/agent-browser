import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	placeTableCells,
	tableSlotPlacementLimits,
	type TableSlotCellInput,
	type TableSlotGroupInput,
	type TableSlotPlacementOptions,
} from "./table-slot-placement.js";

const cell = (id: number, columnSpan = 1, rowSpan = 1): TableSlotCellInput => ({
	id,
	columnSpan,
	rowSpan,
});

const table = (...rows: TableSlotCellInput[][]): TableSlotGroupInput[] => [
	{
		id: null,
		rows: rows.map((cells, index) => ({ id: 100_000 + index, cells })),
	},
];

const fails = (run: () => unknown, code: string, message?: string) => {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		if (message)
			expect((error as AgentBrowserError).message).toContain(message);
		return;
	}
	throw new Error(`Expected ${code}`);
};

describe("native table slot placement", () => {
	it("places ordinary form rows in shared columns and keeps cell order", () => {
		const result = placeTableCells(
			table([cell(8), cell(3)], [cell(6), cell(2)]),
		);
		expect(result.cells).toEqual([
			{ id: 8, columnStart: 0, columnEnd: 1, rowStart: 0, rowEnd: 1 },
			{ id: 3, columnStart: 1, columnEnd: 2, rowStart: 0, rowEnd: 1 },
			{ id: 6, columnStart: 0, columnEnd: 1, rowStart: 1, rowEnd: 2 },
			{ id: 2, columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 },
		]);
		expect(result.rows).toEqual([
			{ id: 100_000, index: 0 },
			{ id: 100_001, index: 1 },
		]);
		expect(result.groups).toEqual([{ id: null, rowStart: 0, rowEnd: 2 }]);
		expect(result.columnCount).toBe(2);
		expect(result.rowCount).toBe(2);
	});

	it("skips occupied anchors and advances by each complete colspan", () => {
		const result = placeTableCells(
			table([cell(1, 2, 2), cell(2)], [cell(3, 2), cell(4)]),
		);
		expect(result.cells).toEqual([
			{ id: 1, columnStart: 0, columnEnd: 2, rowStart: 0, rowEnd: 2 },
			{ id: 2, columnStart: 2, columnEnd: 3, rowStart: 0, rowEnd: 1 },
			{ id: 3, columnStart: 2, columnEnd: 4, rowStart: 1, rowEnd: 2 },
			{ id: 4, columnStart: 4, columnEnd: 5, rowStart: 1, rowEnd: 2 },
		]);
		expect(result.columnCount).toBe(5);
	});

	it("resets the cursor for each row and reuses expired positive spans", () => {
		const result = placeTableCells(
			table([cell(1, 2, 2)], [cell(2)], [cell(3)]),
		);
		expect(result.cells.map((placed) => placed.columnStart)).toEqual([0, 2, 0]);
	});

	it("extends zero spans before placing later explicit rows, including empty rows", () => {
		const result = placeTableCells(
			table([cell(1, 2, 0)], [], [cell(2), cell(3, 1, 0)], [cell(4)]),
		);
		expect(result.cells).toEqual([
			{ id: 1, columnStart: 0, columnEnd: 2, rowStart: 0, rowEnd: 4 },
			{ id: 2, columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
			{ id: 3, columnStart: 3, columnEnd: 4, rowStart: 2, rowEnd: 4 },
			{ id: 4, columnStart: 2, columnEnd: 3, rowStart: 3, rowEnd: 4 },
		]);
		expect(result.rows[1]).toEqual({ id: 100_001, index: 1 });
	});

	it("creates implied rows for positive spans, then grows zero spans through them", () => {
		const result = placeTableCells(table([cell(1, 1, 0)], [cell(2, 2, 4)]));
		expect(result.cells).toEqual([
			{ id: 1, columnStart: 0, columnEnd: 1, rowStart: 0, rowEnd: 5 },
			{ id: 2, columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 5 },
		]);
		expect(result.rows).toEqual([
			{ id: 100_000, index: 0 },
			{ id: 100_001, index: 1 },
			{ id: null, index: 2 },
			{ id: null, index: 3 },
			{ id: null, index: 4 },
		]);
		expect(result.groups).toEqual([{ id: null, rowStart: 0, rowEnd: 5 }]);
		expect(result.rowCount).toBe(5);
	});

	it("uses the longest positive extent even when a shorter span follows", () => {
		const result = placeTableCells(
			table([cell(1, 1, 5)], [cell(2, 1, 0), cell(3, 1, 2)]),
		);
		expect(result.cells.map((placed) => placed.rowEnd)).toEqual([5, 5, 3]);
		expect(result.rowCount).toBe(5);
	});

	it("stops all spans at final group boundaries and preserves empty groups", () => {
		const result = placeTableCells([
			{ id: 10, rows: [] },
			{ id: 11, rows: [{ id: 20, cells: [cell(1, 1, 0), cell(2, 3, 3)] }] },
			{ id: null, rows: [] },
			{
				id: 12,
				rows: [
					{ id: 21, cells: [cell(3, 1, 0)] },
					{ id: 22, cells: [] },
				],
			},
			{ id: null, rows: [] },
		]);
		expect(result.groups).toEqual([
			{ id: 10, rowStart: 0, rowEnd: 0 },
			{ id: 11, rowStart: 0, rowEnd: 3 },
			{ id: null, rowStart: 3, rowEnd: 3 },
			{ id: 12, rowStart: 3, rowEnd: 5 },
			{ id: null, rowStart: 5, rowEnd: 5 },
		]);
		expect(result.cells).toEqual([
			{ id: 1, columnStart: 0, columnEnd: 1, rowStart: 0, rowEnd: 3 },
			{ id: 2, columnStart: 1, columnEnd: 4, rowStart: 0, rowEnd: 3 },
			{ id: 3, columnStart: 0, columnEnd: 1, rowStart: 3, rowEnd: 5 },
		]);
		expect(result.columnCount).toBe(4);
	});

	it("preserves zero-slot tables and explicit empty rows", () => {
		const empty = placeTableCells([]);
		expect(empty.cells).toEqual([]);
		expect(empty.rows).toEqual([]);
		expect(empty.groups).toEqual([]);
		expect(empty.columnCount).toBe(0);
		expect(empty.rowCount).toBe(0);
		const rowsOnly = placeTableCells(table([], []));
		expect(rowsOnly.rowCount).toBe(2);
		expect(rowsOnly.columnCount).toBe(0);
		expect(rowsOnly.cells).toEqual([]);
		expect(placeTableCells(table([cell(1, 1, 0)])).rowCount).toBe(1);
	});

	it.each([2, 0])(
		"rejects interior overlap rather than searching for a fit (rowSpan %s)",
		(rowSpan) => {
			fails(
				() =>
					placeTableCells(table([cell(1), cell(2, 1, rowSpan)], [cell(3, 2)])),
				"unsupported",
				"table-model overlap",
			);
		},
	);

	it("accepts frozen inputs and detaches and deeply freezes all results", () => {
		const input = Object.freeze([
			Object.freeze({
				id: 0,
				rows: Object.freeze([
					Object.freeze({
						id: 1,
						cells: Object.freeze([
							Object.freeze(cell(Number.MAX_SAFE_INTEGER, 1, 2)),
						]),
					}),
				]),
			}),
		]);
		const result = placeTableCells(input);
		for (const value of [
			result,
			result.cells,
			result.rows,
			result.groups,
			result.metrics,
			...result.cells,
			...result.rows,
			...result.groups,
		])
			expect(Object.isFrozen(value)).toBe(true);
		expect(result.cells[0]).not.toBe(input[0].rows[0].cells[0]);
		expect(result.rows[0]).not.toBe(input[0].rows[0]);
		expect(result.groups[0]).not.toBe(input[0]);
		const mutableCell = { id: 7, columnSpan: 1, rowSpan: 1 };
		const mutable = [{ id: 8, rows: [{ id: 9, cells: [mutableCell] }] }];
		const detached = placeTableCells(mutable);
		mutableCell.id = 99;
		mutable[0].id = 98;
		mutable[0].rows[0].id = 97;
		mutable[0].rows.length = 0;
		expect(detached.cells[0].id).toBe(7);
		expect(detached.groups[0].id).toBe(8);
		expect(detached.rows[0].id).toBe(9);
	});
});

describe("table slot input validation", () => {
	it.each(
		[
			null,
			{},
			"table",
			[null],
			[{}],
			[{ id: null, rows: null }],
			[{ id: null, rows: [null] }],
			[{ id: null, rows: [{}] }],
			[{ id: null, rows: [{ id: 1, cells: {} }] }],
			table([null as unknown as TableSlotCellInput]),
			new Array(1),
			[{ id: null, rows: new Array(1) }],
			[{ id: null, rows: [{ id: 1, cells: new Array(1) }] }],
		].map((input) => ({ input })),
	)("rejects malformed and sparse shapes %#", ({ input }) => {
		fails(
			() => placeTableCells(input as readonly TableSlotGroupInput[]),
			"invalid-input",
		);
	});

	it.each([
		undefined,
		-1,
		0.5,
		NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		"1",
	])("rejects invalid nonnull group IDs %#", (id) => {
		fails(
			() =>
				placeTableCells([{ id, rows: [] }] as unknown as TableSlotGroupInput[]),
			"invalid-input",
		);
	});

	it.each([
		undefined,
		null,
		-1,
		0.5,
		NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		"1",
	])("rejects invalid row and cell IDs %#", (id) => {
		fails(
			() =>
				placeTableCells([
					{ id: null, rows: [{ id, cells: [] }] },
				] as unknown as TableSlotGroupInput[]),
			"invalid-input",
		);
		fails(
			() =>
				placeTableCells(
					table([{ id, columnSpan: 1, rowSpan: 1 } as TableSlotCellInput]),
				),
			"invalid-input",
		);
	});

	it.each(
		[
			[
				{ id: 1, rows: [] },
				{ id: 1, rows: [] },
			],
			[{ id: 1, rows: [{ id: 1, cells: [] }] }],
			[{ id: 1, rows: [{ id: 2, cells: [cell(1)] }] }],
			[{ id: null, rows: [{ id: 1, cells: [cell(1)] }] }],
			[
				{
					id: null,
					rows: [
						{ id: 1, cells: [] },
						{ id: 1, cells: [] },
					],
				},
			],
			table([cell(1), cell(1)]),
			[
				{ id: null, rows: [{ id: 10, cells: [cell(1)] }] },
				{ id: 1, rows: [] },
			],
		].map((groups) => ({ groups })),
	)("rejects IDs duplicated across kinds and groups %#", ({ groups }) => {
		fails(() => placeTableCells(groups), "invalid-input", "globally unique");
	});

	it.each([undefined, null, 0, -1, 1.5, 1001, NaN, Infinity, "2"])(
		"rejects malformed column spans %#",
		(columnSpan) => {
			fails(
				() =>
					placeTableCells(
						table([{ id: 1, columnSpan, rowSpan: 1 } as TableSlotCellInput]),
					),
				"invalid-input",
			);
		},
	);

	it.each([undefined, null, -1, 1.5, 65_535, NaN, Infinity, "2"])(
		"rejects malformed row spans %#",
		(rowSpan) => {
			fails(
				() =>
					placeTableCells(
						table([{ id: 1, columnSpan: 1, rowSpan } as TableSlotCellInput]),
					),
				"invalid-input",
			);
		},
	);

	it.each([null, [], 1, "options"].map((options) => ({ options })))(
		"rejects malformed options %#",
		({ options }) => {
			fails(
				() => placeTableCells([], options as TableSlotPlacementOptions),
				"invalid-input",
			);
		},
	);

	it.each([
		null,
		0,
		-1,
		1.5,
		NaN,
		Infinity,
		"10",
		tableSlotPlacementLimits.maxWork + 1,
	])("rejects invalid or raised work budgets %#", (maxWork) => {
		fails(
			() => placeTableCells([], { maxWork } as TableSlotPlacementOptions),
			"invalid-input",
		);
	});
});

describe("table slot resource bounds", () => {
	it("enforces the independent group cap before reading entries", () => {
		const groups = Array.from(
			{ length: tableSlotPlacementLimits.maxGroups },
			() => ({ id: null, rows: [] }),
		);
		expect(placeTableCells(groups).groups).toHaveLength(
			tableSlotPlacementLimits.maxGroups,
		);
		fails(
			() => placeTableCells(new Array(tableSlotPlacementLimits.maxGroups + 1)),
			"resource-limit",
			"group limit",
		);
	});

	it("counts explicit and implied rows globally across groups", () => {
		const maxRows = tableSlotPlacementLimits.maxRows;
		expect(placeTableCells(table([cell(1, 1, maxRows)])).rowCount).toBe(
			maxRows,
		);
		const rows = Array.from({ length: maxRows }, (_, index) => ({
			id: index,
			cells: [],
		}));
		expect(placeTableCells([{ id: null, rows }]).rowCount).toBe(maxRows);
		fails(
			() => placeTableCells([{ id: null, rows: new Array(maxRows + 1) }]),
			"resource-limit",
			"row limit",
		);
		fails(
			() => placeTableCells(table([], [cell(1, 1, maxRows)])),
			"resource-limit",
			"row limit",
		);
		fails(
			() =>
				placeTableCells([
					{ id: null, rows: [{ id: 10, cells: [cell(1, 1, maxRows)] }] },
					{ id: null, rows: [{ id: 11, cells: [] }] },
				]),
			"resource-limit",
			"row limit",
		);
	});

	it("accepts the exact column boundary but rejects span or anchor overflow", () => {
		const wide = [
			cell(1, 1000, 2),
			cell(2, 1000, 2),
			cell(3, 1000, 2),
			cell(4, 1000, 2),
			cell(5, 96, 2),
		];
		expect(placeTableCells(table(wide)).columnCount).toBe(
			tableSlotPlacementLimits.maxColumns,
		);
		fails(
			() => placeTableCells(table([...wide, cell(6)])),
			"resource-limit",
			"column limit",
		);
		fails(
			() => placeTableCells(table(wide, [cell(6)])),
			"resource-limit",
			"column limit",
		);
		fails(
			() => placeTableCells(table([...wide.slice(0, 4), cell(5, 97)])),
			"resource-limit",
			"column limit",
		);
	});

	it("bounds cells independently and globally before reading oversized arrays", () => {
		const cells = Array.from(
			{ length: tableSlotPlacementLimits.maxCells },
			(_, index) => cell(index),
		);
		expect(placeTableCells(table(cells)).cells).toHaveLength(
			tableSlotPlacementLimits.maxCells,
		);
		fails(
			() =>
				placeTableCells(
					table(new Array(tableSlotPlacementLimits.maxCells + 1)),
				),
			"resource-limit",
			"cell limit",
		);
		fails(
			() =>
				placeTableCells([
					...table(cells),
					{ id: null, rows: [{ id: 200_000, cells: [cell(5000)] }] },
				]),
			"resource-limit",
			"cell limit",
		);
	});

	it("accepts exact occupied-slot capacity and charges zero-span growth", () => {
		for (const rowSpan of [0, 4096]) {
			const result = placeTableCells(
				table([cell(1, 63, rowSpan), cell(2, 1, 4096)]),
			);
			expect(result.cells[0].rowEnd).toBe(4096);
			expect(
				result.cells.reduce(
					(total, placed) =>
						total +
						(placed.columnEnd - placed.columnStart) *
							(placed.rowEnd - placed.rowStart),
					0,
				),
			).toBe(tableSlotPlacementLimits.maxOccupiedSlots);
		}
		fails(
			() => placeTableCells(table([cell(1, 64, 0), cell(2, 1, 4096)])),
			"resource-limit",
			"slot limit",
		);
		fails(
			() => placeTableCells(table([cell(1, 64, 4096), cell(2)])),
			"resource-limit",
			"slot limit",
		);
	});

	it("counts occupied slots across separate groups", () => {
		fails(
			() =>
				placeTableCells([
					{ id: null, rows: [{ id: 10, cells: [cell(1, 128, 2048)] }] },
					{ id: null, rows: [{ id: 11, cells: [cell(2)] }] },
				]),
			"resource-limit",
			"slot limit",
		);
	});

	it("rejects huge legal spans before slot expansion or later input reads", () => {
		for (const oversized of [cell(1, 1000, 65_534), cell(1, 1000, 4096)]) {
			const guarded = table([oversized]);
			Object.defineProperty(guarded[0].rows[0].cells, 1, {
				get() {
					throw new Error("Read beyond oversized cell");
				},
				configurable: true,
			});
			fails(
				() => placeTableCells(guarded, { maxWork: 30 }),
				"resource-limit",
				oversized.rowSpan > 4096 ? "row limit" : "slot limit",
			);
		}
	});

	it("meters validation, occupied-anchor scans, growth and frozen output deterministically", () => {
		const cases = [
			[],
			table([], []),
			table([cell(1)]),
			table([cell(1, 1000, 2)], [cell(2)]),
			table([cell(1, 2, 0)], [cell(2, 1, 4)]),
		];
		for (const groups of cases) {
			const result = placeTableCells(groups);
			expect(Number.isSafeInteger(result.metrics.work)).toBe(true);
			expect(result.metrics.work).toBeGreaterThan(1);
			expect(placeTableCells(groups, { maxWork: result.metrics.work })).toEqual(
				result,
			);
			fails(
				() => placeTableCells(groups, { maxWork: result.metrics.work - 1 }),
				"resource-limit",
				"work limit",
			);
			fails(
				() => placeTableCells(groups, { maxWork: 1 }),
				"resource-limit",
				"work limit",
			);
		}
		expect(
			placeTableCells(table([cell(1, 1, 2)], [cell(2)])).metrics.work,
		).toBeGreaterThan(
			placeTableCells(table([cell(1)], [cell(2)])).metrics.work,
		);
	});
});
