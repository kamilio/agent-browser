import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type CollapsedTableBorder,
	type CollapsedTableBorderCell,
	type CollapsedTableBorderEntry,
	type CollapsedTableBorderInput,
	type CollapsedTableBorderKind,
	type CollapsedTableBorderOptions,
	type CollapsedTableBorderSides,
	collapsedTableBorderLimits,
	resolveCollapsedTableBorders,
} from "./table-collapsed-borders.js";

const border = (
	width = 2,
	color = "red",
	style: CollapsedTableBorder["style"] = "solid",
): CollapsedTableBorder => ({ style, width, color });

const cell = (
	id: number,
	rowStart = 0,
	rowEnd = 1,
	columnStart = 0,
	columnEnd = 1,
): CollapsedTableBorderCell => ({
	id,
	rowStart,
	rowEnd,
	columnStart,
	columnEnd,
});

const entry = (
	box: CollapsedTableBorderCell,
	sides: Partial<CollapsedTableBorderSides> = {},
	kind: CollapsedTableBorderKind = "cell",
): CollapsedTableBorderEntry => ({
	...box,
	kind,
	borders: {
		top: border(0, "black", "none"),
		right: border(0, "black", "none"),
		bottom: border(0, "black", "none"),
		left: border(0, "black", "none"),
		...sides,
	},
});

const grid = (
	rowCount = 1,
	columnCount = 1,
	cells: readonly CollapsedTableBorderCell[] = [],
	entries: readonly CollapsedTableBorderEntry[] = [],
): CollapsedTableBorderInput => ({ rowCount, columnCount, cells, entries });

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

describe("native collapsed table border resolver", () => {
	it("resolves one nonzero shared border and returns centered half widths", () => {
		const first = cell(1);
		const second = cell(2, 0, 1, 1, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				1,
				2,
				[first, second],
				[
					entry(first, { right: border(3, "red") }),
					entry(second, { left: border(6, "blue") }),
				],
			),
		);
		expect(result.segments).toEqual([
			{
				orientation: "vertical",
				row: 0,
				column: 1,
				width: 6,
				color: "blue",
				ownerId: 2,
				ownerKind: "cell",
			},
		]);
		expect(result.cells).toEqual([
			{ id: 1, top: 0, right: 3, bottom: 0, left: 0 },
			{ id: 2, top: 0, right: 0, bottom: 0, left: 3 },
		]);
		expect(result.outer).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
	});

	it("lets zero-width hidden table borders suppress wider cell borders", () => {
		const box = cell(1);
		const candidates = [
			entry(box, { top: border(100), right: border(8) }),
			entry(cell(2), { top: border(0, "blue", "hidden") }, "table"),
		];
		for (const entries of [candidates, [...candidates].reverse()]) {
			const result = resolveCollapsedTableBorders(grid(1, 1, [box], entries));
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0]).toMatchObject({
				orientation: "vertical",
				column: 1,
				width: 8,
			});
			expect(result.cells[0]).toEqual({
				id: 1,
				top: 0,
				right: 4,
				bottom: 0,
				left: 0,
			});
			expect(result.outer.top).toBe(0);
		}
	});

	it("suppresses both adjacent cell half widths when a shared edge is hidden", () => {
		const first = cell(0);
		const second = cell(1, 0, 1, 1, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				1,
				2,
				[first, second],
				[
					entry(first, { right: border(5) }),
					entry(second, { left: border(0, "blue", "hidden") }),
				],
			),
		);
		expect(result.segments).toEqual([]);
		expect(result.cells.map((widths) => [widths.left, widths.right])).toEqual([
			[0, 0],
			[0, 0],
		]);
	});

	it("makes none lose regardless of width or role and omits zero solid", () => {
		const box = cell(1);
		const result = resolveCollapsedTableBorders(
			grid(
				1,
				1,
				[box],
				[
					entry(box, {
						top: border(100, "red", "none"),
						right: border(0),
						bottom: border(10, "red", "none"),
					}),
					entry(cell(2), { top: border(2, "blue") }, "table"),
				],
			),
		);
		expect(result.segments).toHaveLength(1);
		expect(result.segments[0]).toMatchObject({ width: 2, ownerId: 2 });
		expect(result.cells[0]).toEqual({
			id: 1,
			top: 1,
			right: 0,
			bottom: 0,
			left: 0,
		});
	});

	it("prefers width over role, spatial position and stable ID", () => {
		const result = resolveCollapsedTableBorders(
			grid(
				2,
				2,
				[],
				[
					entry(cell(0, 0, 1, 0, 2), { bottom: border(2) }),
					entry(cell(90, 1, 2, 1, 2), { top: border(7, "blue") }, "table"),
				],
			),
		);
		expect(
			result.segments.map((segment) => [segment.column, segment.ownerId]),
		).toEqual([
			[0, 0],
			[1, 90],
		]);
	});

	it("applies every role precedence independently of input order and ID", () => {
		const kinds: CollapsedTableBorderKind[] = [
			"cell",
			"row",
			"row-group",
			"column",
			"column-group",
			"table",
		];
		for (let first = 0; first < kinds.length; first++) {
			for (let second = first + 1; second < kinds.length; second++) {
				const preferred = entry(cell(90), { top: border() }, kinds[first]);
				const other = entry(cell(0), { top: border(2, "blue") }, kinds[second]);
				for (const entries of [
					[preferred, other],
					[other, preferred],
				]) {
					const result = resolveCollapsedTableBorders(grid(1, 1, [], entries));
					expect(result.segments[0]).toMatchObject({
						ownerId: 90,
						ownerKind: kinds[first],
						color: "red",
					});
				}
			}
		}
	});

	it.each(["ltr", "rtl"] as const)(
		"prefers topmost over logical-leading position and ID in %s",
		(direction) => {
			const candidates = [
				entry(cell(50, 0, 1, 1, 2), { bottom: border() }, "row"),
				entry(cell(1, 1, 2, 0, 3), { top: border(2, "blue") }, "row"),
			];
			for (const entries of [candidates, [...candidates].reverse()]) {
				const result = resolveCollapsedTableBorders({
					...grid(2, 3, [], entries),
					direction,
				});
				expect(
					result.segments.find((segment) => segment.column === 1),
				).toMatchObject({ ownerId: 50, color: "red" });
			}
		},
	);

	it.each([
		["ltr", 50],
		["rtl", 1],
	] as const)("uses logical-leading position in %s", (direction, ownerId) => {
		const first = cell(50);
		const second = cell(1, 0, 1, 1, 2);
		const candidates = [
			entry(first, { right: border() }),
			entry(second, { left: border(2, "blue") }),
		];
		for (const entries of [candidates, [...candidates].reverse()]) {
			const result = resolveCollapsedTableBorders({
				...grid(1, 2, [first, second], entries),
				direction,
			});
			expect(result.segments[0]?.ownerId).toBe(ownerId);
		}
	});

	it("uses the logical right edge for RTL participants of unequal span", () => {
		const candidates = [
			entry(cell(1, 0, 1, 1, 2), { top: border() }, "column-group"),
			entry(cell(50, 0, 1, 0, 3), { top: border(2, "blue") }, "column-group"),
		];
		for (const entries of [candidates, [...candidates].reverse()]) {
			const result = resolveCollapsedTableBorders({
				...grid(1, 3, [], entries),
				direction: "rtl",
			});
			expect(
				result.segments.find((segment) => segment.column === 1),
			).toMatchObject({ ownerId: 50 });
		}
	});

	it("uses the lowest stable ID only after equal role and position", () => {
		const candidates = [
			entry(cell(9), { top: border(2, "blue") }),
			entry(cell(0), { top: border(2, "red") }),
		];
		for (const entries of [candidates, [...candidates].reverse()]) {
			expect(
				resolveCollapsedTableBorders(grid(1, 1, [], entries)).segments[0],
			).toMatchObject({ ownerId: 0, color: "red" });
		}
	});

	it("suppresses only interior span units and keeps exposed row and column edges", () => {
		const spanning = cell(0, 0, 2, 0, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				3,
				3,
				[spanning],
				[
					entry(cell(10, 0, 1, 0, 3), { bottom: border(4) }, "row"),
					entry(cell(11, 0, 3, 0, 1), { right: border(6, "blue") }, "column"),
					entry(cell(12, 1, 2, 0, 3), { top: border(8) }, "row-group"),
					entry(
						cell(13, 0, 3, 1, 2),
						{ left: border(10, "green") },
						"column-group",
					),
				],
			),
		);
		expect(result.segments).toEqual([
			{
				orientation: "horizontal",
				row: 1,
				column: 2,
				width: 8,
				color: "red",
				ownerId: 12,
				ownerKind: "row-group",
			},
			{
				orientation: "vertical",
				row: 2,
				column: 1,
				width: 10,
				color: "green",
				ownerId: 13,
				ownerKind: "column-group",
			},
		]);
		expect(result.cells[0]).toEqual({
			id: 0,
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		});
	});

	it("keeps variable shared segments along a spanning cell side", () => {
		const spanning = cell(1, 0, 2);
		const upper = cell(2, 0, 1, 1, 2);
		const lower = cell(3, 1, 2, 1, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				2,
				2,
				[spanning, upper, lower],
				[
					entry(spanning, { right: border(3) }),
					entry(upper, { left: border(5, "blue") }),
					entry(lower, { left: border(9, "green") }),
				],
			),
		);
		expect(
			result.segments.map(({ row, width, color }) => [row, width, color]),
		).toEqual([
			[0, 5, "blue"],
			[1, 9, "green"],
		]);
		expect(result.cells).toEqual([
			{ id: 1, top: 0, right: 4.5, bottom: 0, left: 0 },
			{ id: 2, top: 0, right: 0, bottom: 0, left: 2.5 },
			{ id: 3, top: 0, right: 0, bottom: 0, left: 4.5 },
		]);
	});

	it("keeps horizontal shared segments along a column-spanning cell", () => {
		const spanning = cell(10, 0, 1, 0, 2);
		const first = cell(1, 1, 2, 0, 1);
		const second = cell(2, 1, 2, 1, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				2,
				2,
				[spanning, first, second],
				[
					entry(second, { top: border(8, "green") }),
					entry(first, { top: border(4, "blue") }),
					entry(spanning, { bottom: border(4, "red") }),
				],
			),
		);
		expect(result.segments).toEqual([
			{
				orientation: "horizontal",
				row: 1,
				column: 0,
				width: 4,
				color: "red",
				ownerId: 10,
				ownerKind: "cell",
			},
			{
				orientation: "horizontal",
				row: 1,
				column: 1,
				width: 8,
				color: "green",
				ownerId: 2,
				ownerKind: "cell",
			},
		]);
		expect(result.cells).toEqual([
			{ id: 10, top: 0, right: 0, bottom: 4, left: 0 },
			{ id: 1, top: 2, right: 0, bottom: 0, left: 0 },
			{ id: 2, top: 4, right: 0, bottom: 0, left: 0 },
		]);
	});

	it("combines table and group perimeters and takes outer and cell maxima", () => {
		const spanning = cell(1, 0, 2, 0, 2);
		const result = resolveCollapsedTableBorders(
			grid(
				2,
				2,
				[spanning],
				[
					entry(
						cell(10, 0, 2, 0, 2),
						{
							top: border(2),
							right: border(4),
							bottom: border(6),
							left: border(8),
						},
						"table",
					),
					entry(
						cell(11, 0, 1, 0, 2),
						{ right: border(10, "blue") },
						"row-group",
					),
					entry(
						cell(12, 0, 2, 1, 2),
						{ top: border(12, "green") },
						"column-group",
					),
				],
			),
		);
		expect(result.outer).toEqual({ top: 6, right: 5, bottom: 3, left: 4 });
		expect(result.cells[0]).toEqual({
			id: 1,
			top: 6,
			right: 5,
			bottom: 3,
			left: 4,
		});
		expect(result.segments).toHaveLength(8);
		expect(
			result.segments.map(({ orientation, row, column }) => [
				orientation,
				row,
				column,
			]),
		).toEqual([
			["horizontal", 0, 0],
			["horizontal", 0, 1],
			["horizontal", 2, 0],
			["horizontal", 2, 1],
			["vertical", 0, 0],
			["vertical", 0, 2],
			["vertical", 1, 0],
			["vertical", 1, 2],
		]);
	});

	it("preserves borders around holes without inventing cells or span suppression", () => {
		const result = resolveCollapsedTableBorders(
			grid(
				2,
				2,
				[cell(0)],
				[
					entry(cell(10, 0, 1, 0, 2), { bottom: border(4) }, "row"),
					entry(cell(11, 0, 2, 0, 1), { right: border(6) }, "column"),
				],
			),
		);
		expect(result.segments).toHaveLength(4);
		expect(result.cells).toEqual([
			{ id: 0, top: 0, right: 3, bottom: 2, left: 0 },
		]);
		expect(result.outer).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
	});

	it.each([
		[0, 0],
		[0, 4096],
		[4096, 0],
		[4096, 4096],
	])("keeps an empty %s by %s grid sparse", (rows, columns) => {
		const result = resolveCollapsedTableBorders(grid(rows, columns), {
			maxWork: 32,
		});
		expect(result.segments).toEqual([]);
		expect(result.cells).toEqual([]);
		expect(result.outer).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		expect(result.metrics.work).toBeLessThanOrEqual(32);
	});

	it("keeps a small far-corner participant in a maximum-size grid sparse", () => {
		const corner = cell(Number.MAX_SAFE_INTEGER, 4095, 4096, 4095, 4096);
		const result = resolveCollapsedTableBorders(
			grid(4096, 4096, [corner], [entry(corner, { right: border(3) })]),
			{ maxWork: 256 },
		);
		expect(result.segments[0]).toMatchObject({ row: 4095, column: 4096 });
		expect(result.outer.right).toBe(1.5);
		expect(result.cells[0]?.right).toBe(1.5);
	});

	it("accepts frozen inputs and deeply freezes detached results", () => {
		const box = Object.freeze(cell(0));
		const candidate = entry(box, { top: border(2.5) });
		for (const side of Object.values(candidate.borders)) Object.freeze(side);
		Object.freeze(candidate.borders);
		Object.freeze(candidate);
		const input = Object.freeze(
			grid(1, 1, Object.freeze([box]), Object.freeze([candidate])),
		);
		const snapshot = JSON.stringify(input);
		const result = resolveCollapsedTableBorders(input, Object.freeze({}));
		expect(JSON.stringify(input)).toBe(snapshot);
		expect(result.cells[0]).not.toBe(box);
		for (const value of [
			result,
			result.segments,
			...result.segments,
			result.cells,
			...result.cells,
			result.outer,
			result.metrics,
			collapsedTableBorderLimits,
		])
			expect(Object.isFrozen(value)).toBe(true);
		expect(result.cells[0]?.top).toBe(1.25);
		const mutableBorder = { style: "solid" as const, width: 4, color: "red" };
		const mutableBox = { ...cell(3) };
		const mutableInput = grid(
			1,
			1,
			[mutableBox],
			[entry(mutableBox, { top: mutableBorder })],
		);
		const detached = resolveCollapsedTableBorders(mutableInput);
		expect(Object.isFrozen(mutableBox)).toBe(false);
		expect(Object.isFrozen(mutableBorder)).toBe(false);
		mutableBorder.width = 20;
		mutableBorder.color = "blue";
		mutableBox.id = 8;
		expect(detached.segments[0]).toMatchObject({
			width: 4,
			color: "red",
			ownerId: 3,
		});
		expect(detached.cells[0]).toMatchObject({ id: 3, top: 2 });
	});

	it.each([null, false, [], {}, "grid"])(
		"rejects malformed input %j",
		(input) => {
			fails(
				() => resolveCollapsedTableBorders(input as CollapsedTableBorderInput),
				"invalid-input",
			);
		},
	);

	it.each([
		{ rowCount: -1 },
		{ columnCount: 0.5 },
		{ rowCount: Number.NaN },
		{ columnCount: Number.POSITIVE_INFINITY },
		{ rowCount: Number.MAX_SAFE_INTEGER + 1 },
		{ columnCount: "1" },
		{ direction: "auto" },
		{ direction: null },
		{ cells: null },
		{ entries: {} },
		{ cells: [null] },
		{ entries: [null] },
		{ cells: new Array(1) },
		{ entries: new Array(1) },
	])("rejects malformed grid fields %j", (fields) => {
		fails(
			() =>
				resolveCollapsedTableBorders({
					...grid(),
					...fields,
				} as CollapsedTableBorderInput),
			"invalid-input",
		);
	});

	it.each([
		{ id: -1 },
		{ id: Number.MAX_SAFE_INTEGER + 1 },
		{ id: "1" },
		{ rowStart: -1 },
		{ rowStart: 0.5 },
		{ rowEnd: 0 },
		{ rowEnd: 2 },
		{ columnStart: 1, columnEnd: 0 },
		{ columnEnd: 0 },
		{ columnEnd: 2 },
		{ columnStart: Number.NaN },
		{ columnEnd: Number.POSITIVE_INFINITY },
	])("validates both cell and entry rectangles %j", (fields) => {
		const malformed = { ...cell(1), ...fields } as CollapsedTableBorderCell;
		fails(
			() => resolveCollapsedTableBorders(grid(1, 1, [malformed])),
			"invalid-input",
		);
		fails(
			() => resolveCollapsedTableBorders(grid(1, 1, [], [entry(malformed)])),
			"invalid-input",
		);
	});

	it("rejects participants and cells in zero-size dimensions", () => {
		for (const [rows, columns] of [
			[0, 0],
			[0, 1],
			[1, 0],
		]) {
			fails(
				() => resolveCollapsedTableBorders(grid(rows, columns, [cell(1)])),
				"invalid-input",
			);
			fails(
				() =>
					resolveCollapsedTableBorders(
						grid(rows, columns, [], [entry(cell(1))]),
					),
				"invalid-input",
			);
		}
	});

	it("rejects duplicate IDs within each namespace and overlapping cells", () => {
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(1, 2, [cell(1), cell(1, 0, 1, 1, 2)]),
				),
			"invalid-input",
		);
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(1, 1, [], [entry(cell(1)), entry(cell(1), {}, "row")]),
				),
			"invalid-input",
		);
		for (const cells of [
			[cell(0), cell(1)],
			[cell(0, 0, 3, 1, 2), cell(1, 1, 2, 0, 3)],
		])
			fails(
				() => resolveCollapsedTableBorders(grid(3, 3, cells)),
				"invalid-input",
				"Overlapping",
			);
	});

	it.each([
		{ kind: "caption" },
		{ kind: "toString" },
		{ kind: "__proto__" },
		{ kind: null },
		{ borders: null },
		{ borders: [] },
		{ borders: {} },
	])("rejects malformed participants %j", (fields) => {
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(
						1,
						1,
						[],
						[{ ...entry(cell(1)), ...fields } as CollapsedTableBorderEntry],
					),
				),
			"invalid-input",
		);
	});

	it.each([
		null,
		[],
		{},
		{ ...border(), style: null },
		{ ...border(), width: -1 },
		{ ...border(), width: Number.NaN },
		{ ...border(), width: Number.POSITIVE_INFINITY },
		{ ...border(), width: "2" },
		{ ...border(), color: 5 },
		{ ...border(), color: "" },
	])("validates all four border sides %j", (value) => {
		for (const side of ["top", "right", "bottom", "left"] as const) {
			fails(
				() =>
					resolveCollapsedTableBorders(
						grid(
							1,
							1,
							[],
							[entry(cell(1), { [side]: value as CollapsedTableBorder })],
						),
					),
				"invalid-input",
			);
		}
	});

	it.each(["dashed", "dotted", "double", "groove", "ridge", "inset", "outset"])(
		"rejects unsupported %s even at zero width or behind hidden/span suppression",
		(style) => {
			const unsupported = { ...border(0), style } as CollapsedTableBorder;
			for (const side of ["top", "bottom"] as const)
				fails(
					() =>
						resolveCollapsedTableBorders(
							grid(
								2,
								2,
								[cell(0, 0, 2, 0, 2)],
								[
									entry(cell(1, 0, 1, 0, 2), {
										top: border(0, "red", "hidden"),
										bottom: border(0, "red", "hidden"),
									}),
									entry(cell(2, 0, 1, 0, 2), {
										[side]: unsupported,
									}),
								],
							),
						),
					"unsupported",
				);
		},
	);

	it("accepts finite fractional and very large computed widths without sums", () => {
		const result = resolveCollapsedTableBorders(
			grid(
				1,
				1,
				[cell(0)],
				[
					entry(cell(0), {
						top: border(Number.MAX_VALUE),
						bottom: border(0.25),
					}),
				],
			),
		);
		expect(result.outer.top).toBe(Number.MAX_VALUE / 2);
		expect(result.cells[0]?.bottom).toBe(0.125);
	});

	it.each([
		"transparent",
		JSON.stringify({ r: 20, g: 40, b: 60, a: 0 }),
		JSON.stringify({ r: 20, g: 40, b: 60, a: 0.5 }),
		"native-color-token:42",
	])(
		"preserves uninterpreted color tokens, including transparency: %s",
		(color) => {
			const result = resolveCollapsedTableBorders(
				grid(
					1,
					1,
					[cell(0)],
					[
						entry(cell(0), { top: border(2, "red") }),
						entry(cell(1), { top: border(4, color) }, "table"),
					],
				),
			);
			expect(result.segments[0]).toMatchObject({ width: 4, color, ownerId: 1 });
			expect(result.cells[0]?.top).toBe(2);
			expect(result.outer.top).toBe(2);
		},
	);

	it("bounds uninterpreted color tokens through the work budget", () => {
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(
						1,
						1,
						[],
						[entry(cell(0), { top: border(2, "x".repeat(4000)) })],
					),
					{ maxWork: 200 },
				),
			"resource-limit",
			"work",
		);
	});

	it("exports the fixed resource caps", () => {
		expect(collapsedTableBorderLimits).toEqual({
			maxRows: 4096,
			maxColumns: 4096,
			maxCells: 4096,
			maxEntries: 16_384,
			maxSegments: 262_144,
			maxOccupiedSlots: 262_144,
			maxWork: 4_000_000,
		});
	});

	it("checks input counts before visiting over-limit arrays", () => {
		for (const input of [
			grid(4097, 1),
			grid(1, 4097),
			grid(Number.MAX_SAFE_INTEGER, 1),
			grid(1, 1, new Array(collapsedTableBorderLimits.maxCells + 1)),
			grid(1, 1, [], new Array(collapsedTableBorderLimits.maxEntries + 1)),
		])
			fails(
				() => resolveCollapsedTableBorders(input),
				"resource-limit",
				"input",
			);
	});

	it("accepts the exact cell and entry count caps", () => {
		const cells = Array.from(
			{ length: collapsedTableBorderLimits.maxCells },
			(_, index) => cell(index, 0, 1, index, index + 1),
		);
		expect(
			resolveCollapsedTableBorders(grid(1, 4096, cells)).cells,
		).toHaveLength(collapsedTableBorderLimits.maxCells);
		const entries = Array.from(
			{ length: collapsedTableBorderLimits.maxEntries },
			(_, index) => entry(cell(index)),
		);
		expect(
			resolveCollapsedTableBorders(grid(1, 1, [], entries)).segments,
		).toEqual([]);
	});

	it("allows the occupied-slot cap and rejects the next created slot", () => {
		const result = resolveCollapsedTableBorders(
			grid(512, 512, [cell(0, 0, 512, 0, 512)]),
		);
		expect(result.cells).toHaveLength(1);
		expect(result.segments).toEqual([]);
		fails(
			() =>
				resolveCollapsedTableBorders(grid(513, 512, [cell(0, 0, 513, 0, 512)])),
			"resource-limit",
			"occupied slot",
		);
	});

	it("bounds unique candidate edges, including invisible ones around holes", () => {
		for (const style of ["solid", "hidden", "none"] as const) {
			const entries = Array.from({ length: 33 }, (_, index) =>
				entry(
					cell(index, index * 2, index * 2 + 1, 0, 4096),
					{ top: border(2, "red", style), bottom: border(2, "red", style) },
					"row",
				),
			);
			fails(
				() => resolveCollapsedTableBorders(grid(66, 4096, [], entries)),
				"resource-limit",
				"segment",
			);
		}
	});

	it("allows exactly the candidate edge cap but not another edge", () => {
		const entries = Array.from({ length: 32 }, (_, index) =>
			entry(cell(index, index * 2, index * 2 + 1, 0, 4095)),
		);
		const input = grid(64, 4095, [], entries);
		expect(resolveCollapsedTableBorders(input).segments).toEqual([]);
		fails(
			() =>
				resolveCollapsedTableBorders({
					...input,
					entries: [...entries, entry(cell(32, 1, 2, 0, 1))],
				}),
			"resource-limit",
			"segment",
		);
	});

	it("enforces the default work cap when repeated edges stay under other caps", () => {
		const entries = Array.from({ length: 64 }, (_, index) =>
			entry(cell(index, 0, 4096, 0, 4096)),
		);
		fails(
			() => resolveCollapsedTableBorders(grid(4096, 4096, [], entries)),
			"resource-limit",
			"work",
		);
	});

	it.each([
		null,
		[],
		5,
		{ maxWork: 0 },
		{ maxWork: -1 },
		{ maxWork: 1.5 },
		{ maxWork: Number.NaN },
		{ maxWork: Number.POSITIVE_INFINITY },
		{ maxWork: "100" },
		{ maxWork: collapsedTableBorderLimits.maxWork + 1 },
	])("rejects malformed or increased work caps %j", (options) => {
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(),
					options as CollapsedTableBorderOptions,
				),
			"invalid-input",
		);
	});

	it("charges validation, occupancy, repeated suppressed edges and result work", () => {
		const box = cell(0, 0, 2, 0, 2);
		const input = grid(
			2,
			2,
			[box],
			[
				entry(cell(1, 0, 1, 0, 2), { bottom: border(4) }, "row"),
				entry(box, { top: border(2) }),
			],
		);
		const result = resolveCollapsedTableBorders(input);
		expect(Number.isSafeInteger(result.metrics.work)).toBe(true);
		expect(result.metrics.work).toBeGreaterThan(0);
		expect(result.metrics.work).toBeLessThanOrEqual(
			collapsedTableBorderLimits.maxWork,
		);
		expect(
			resolveCollapsedTableBorders(input, { maxWork: result.metrics.work }),
		).toEqual(result);
		for (const maxWork of [1, result.metrics.work - 1])
			fails(
				() => resolveCollapsedTableBorders(input, { maxWork }),
				"resource-limit",
				"work",
			);
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(512, 512, [cell(0, 0, 512, 0, 512)]),
					{ maxWork: 1000 },
				),
			"resource-limit",
			"work",
		);
		const entries = Array.from({ length: 100 }, (_, index) =>
			entry(cell(index + 1, 1, 2, 1, 2)),
		);
		fails(
			() =>
				resolveCollapsedTableBorders(
					grid(3, 3, [cell(0, 0, 3, 0, 3)], entries),
					{ maxWork: 6000 },
				),
			"resource-limit",
			"work",
		);
	});
});
