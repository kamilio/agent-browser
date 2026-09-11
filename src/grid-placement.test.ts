import { expect, it } from "vitest";
import {
	initialGridStyle,
	parseGridAreas,
	parseGridDeclarations,
	parseGridLine,
	parseGridTrackList,
	type GridStyle,
} from "./css-grid.js";
import { AgentBrowserError } from "./errors.js";
import { gridPlacementLimits, placeGridItems } from "./grid-placement.js";
import type { GridPlacement, GridPlacementInput } from "./grid-types.js";

function style(values: Partial<GridStyle> = {}): GridStyle {
	return { ...initialGridStyle, ...values };
}
function item(
	id: number,
	column = "auto",
	row = "auto",
	order = 0,
): GridPlacementInput {
	const values = { ...initialGridStyle };
	for (const [property, value] of [
		["grid-column", column],
		["grid-row", row],
	]) {
		const declarations = parseGridDeclarations(property, value);
		if (!declarations)
			throw new Error(`Invalid test declaration: ${property}: ${value}`);
		for (const declaration of declarations)
			values[declaration.property] = declaration.value;
	}
	return { id, style: values, order };
}
function positions(result: GridPlacement): number[][] {
	return result.items.map((entry) => [
		entry.id,
		entry.rowStart + result.rows.startLine,
		entry.rowEnd + result.rows.startLine,
		entry.columnStart + result.columns.startLine,
		entry.columnEnd + result.columns.startLine,
	]);
}
function failureCode(operation: () => unknown): string {
	try {
		operation();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		return (error as AgentBrowserError).code;
	}
	throw new Error("Expected a grid placement failure");
}

it("keeps the parser representation case-sensitive and bounded", () => {
	expect(
		parseGridTrackList("[Start] repeat(2, [A] 10px [B]) [End] 1fr")?.items,
	).toEqual([
		{ type: "names", values: ["Start"] },
		{
			type: "repeat",
			count: 2,
			items: [
				{ type: "names", values: ["A"] },
				{ type: "breadth", value: "10px", length: true },
				{ type: "names", values: ["B"] },
			],
		},
		{ type: "names", values: ["End"] },
		{ type: "breadth", value: "1fr", length: false },
	]);
	expect(parseGridAreas('"Head Head" "Left Body"')).toEqual([
		["Head", "Head"],
		["Left", "Body"],
	]);
	expect(parseGridAreas("none")).toEqual([]);
	expect(parseGridTrackList("none")?.tracks).toBe(0);
	expect(parseGridLine("Name")).toEqual({
		type: "line",
		count: 1,
		name: "Name",
		area: true,
	});
	expect(parseGridLine("Name -2")).toEqual({
		type: "line",
		count: -2,
		name: "Name",
		area: false,
	});
	expect(parseGridLine("Name span 2")).toEqual({
		type: "span",
		count: 2,
		name: "Name",
	});
	expect(parseGridLine("auto")).toEqual({ type: "auto" });
});

it.each([
	"repeat(auto-fill, 10px)",
	"repeat(257, 1px)",
	"repeat(2, repeat(2, 1px))",
	"[x]",
	"minmax(1fr, 10px)",
	"10px garbage",
	"inherit",
	"",
])("rejects unsupported track representation %s", (value) => {
	expect(parseGridTrackList(value)).toBeUndefined();
});
it.each(["none", "[x] auto", "repeat(2, auto)", "initial"])(
	"rejects invalid automatic track representation %s",
	(value) => {
		expect(parseGridTrackList(value, true)).toBeUndefined();
	},
);
it.each(['"a a" "a ."', '"a" "a b"', '"a/b"', "initial", ""])(
	"rejects malformed area representation %s",
	(value) => {
		expect(parseGridAreas(value)).toBeUndefined();
	},
);
it.each([
	"0",
	"span 0",
	"span -1",
	"span",
	"1 2",
	"initial",
	"inherit",
	"span a b",
	"a / b",
	"1000001",
	"",
])("rejects malformed line representation %s", (value) => {
	expect(parseGridLine(value)).toBeUndefined();
});

it("accepts empty grids without inventing tracks", () => {
	const result = placeGridItems(initialGridStyle, []);
	expect(result.items).toEqual([]);
	for (const axis of [result.rows, result.columns]) {
		expect(axis).toEqual({
			startLine: 0,
			explicitTracks: 0,
			tracks: [],
			lineNames: [[]],
		});
	}
	expect(result.metrics.work).toBeGreaterThan(0);
});

it("auto-places anonymous text inputs sharing initialGridStyle", () => {
	const result = placeGridItems(initialGridStyle, [
		{ id: 0, style: initialGridStyle },
		{ id: 4, style: initialGridStyle },
	]);
	expect(positions(result)).toEqual([
		[0, 0, 1, 0, 1],
		[4, 1, 2, 0, 1],
	]);
	expect(result.items.map((entry) => entry.id)).toEqual([0, 4]);
});

it("retains empty explicit templates and converts track sizing functions", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns":
				"10px 25% 2fr auto min-content max-content minmax(5px, 3fr) fit-content(40%)",
		}),
		[],
	);
	expect(result.columns.tracks).toEqual([
		{ minimum: "10px", maximum: "10px" },
		{ minimum: "25%", maximum: "25%" },
		{ minimum: "auto", maximum: "2fr" },
		{ minimum: "auto", maximum: "auto" },
		{ minimum: "min-content", maximum: "min-content" },
		{ minimum: "max-content", maximum: "max-content" },
		{ minimum: "5px", maximum: "3fr" },
		{ minimum: "auto", maximum: "max-content", fitContent: "40%" },
	]);
	expect(result.columns.lineNames).toHaveLength(9);
});

it("merges and deduplicates names at integer-repeat seams", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns": "[Outer] repeat(2, [A] 10px [A B]) [Tail] 1fr",
		}),
		[],
	);
	expect(result.columns.lineNames).toEqual([
		["Outer", "A"],
		["A", "B"],
		["A", "B", "Tail"],
		[],
	]);
	expect(result.columns.explicitTracks).toBe(3);
});

it("places the actual five-column MDN named-area layout", () => {
	const container = style({
		"grid-template-columns":
			"[left-sidebar-start] minmax(240px, 1fr) [left-sidebar-end] 32px [content-start] minmax(0px, 768px) [content-end] 32px [right-sidebar-start] minmax(240px, 1fr) [right-sidebar-end]",
		"grid-template-rows": "min-content 1fr",
		"grid-template-areas":
			'"left-sidebar . header . right-sidebar" "left-sidebar . body . right-sidebar"',
	});
	const result = placeGridItems(container, [
		item(1, "left-sidebar", "left-sidebar"),
		item(2, "header", "header"),
		item(3, "body", "body"),
		item(4, "right-sidebar", "right-sidebar"),
	]);
	expect(positions(result)).toEqual([
		[1, 0, 2, 0, 1],
		[2, 0, 1, 2, 3],
		[3, 1, 2, 2, 3],
		[4, 0, 2, 4, 5],
	]);
	expect(result.columns.explicitTracks).toBe(5);
	expect(result.columns.lineNames[2]).toEqual([
		"content-start",
		"header-start",
		"body-start",
	]);
	expect(result.rows.lineNames[1]).toEqual(["header-end", "body-start"]);
});

it("places the MDN outer grid sequentially into four explicit rows", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns": "minmax(0px, 1fr)",
			"grid-template-rows": "min-content min-content 1fr min-content",
		}),
		[item(1), item(2), item(3), item(4)],
	);
	expect(positions(result)).toEqual([
		[1, 0, 1, 0, 1],
		[2, 1, 2, 0, 1],
		[3, 2, 3, 0, 1],
		[4, 3, 4, 0, 1],
	]);
	expect(result.rows.explicitTracks).toBe(4);
});

it("never truncates explicit tracks to narrower area strings", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns": "10px 20px 30px 40px",
			"grid-template-areas": '"left body right"',
		}),
		[item(1, "-2 / -1", "1")],
	);
	expect(result.columns.explicitTracks).toBe(4);
	expect(result.columns.tracks).toHaveLength(4);
	expect(positions(result)).toEqual([[1, 0, 1, 3, 4]]);
});

it("area-implied explicit tracks use auto patterns starting after the last sized track", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns": "10px",
			"grid-template-areas": '"a b c d"',
			"grid-auto-columns": "20px 30px",
		}),
		[item(1, "-1 / span 2", "1")],
	);
	expect(result.columns.explicitTracks).toBe(4);
	expect(result.columns.tracks.map((track) => track.maximum)).toEqual([
		"10px",
		"20px",
		"30px",
		"20px",
		"30px",
		"20px",
	]);
	expect(positions(result)).toEqual([[1, 0, 1, 4, 6]]);
});

it("cycles implicit sizing patterns backwards before the explicit origin", () => {
	const result = placeGridItems(
		style({
			"grid-template-columns": "10px 11px",
			"grid-auto-columns": "20px 30px 40px",
			"grid-auto-rows": "2px 3px",
		}),
		[item(1, "-6 / 5", "-3 / 3")],
	);
	expect(result.columns.startLine).toBe(-3);
	expect(result.rows.startLine).toBe(-2);
	expect(result.columns.tracks.map((track) => track.maximum)).toEqual([
		"20px",
		"30px",
		"40px",
		"10px",
		"11px",
		"20px",
		"30px",
	]);
	expect(result.rows.tracks.map((track) => track.maximum)).toEqual([
		"2px",
		"3px",
		"2px",
		"3px",
	]);
	expect(result.items).toEqual([
		{ id: 1, rowStart: 0, rowEnd: 4, columnStart: 0, columnEnd: 7 },
	]);
});

it.each([
	["4 / auto", 3, 4],
	["auto / 6", 4, 5],
	["C / C -1", 2, 8],
	["C / span C", 2, 5],
	["span C / C -1", 5, 8],
	["5 / C -1", 4, 8],
	["5 / span C", 4, 5],
	["8 / 8", 7, 8],
	["B 2 / span 1", 4, 5],
	["7 / 2", 1, 6],
	["-2 / -1", 7, 8],
	["A 2 / A 3", 3, 6],
	["span 2 / 5", 2, 4],
] as const)("resolves the line and conflict case %s", (column, start, end) => {
	const result = placeGridItems(
		style({
			"grid-template-columns":
				"[A] 1px [B] 1px [C] 1px [A] 1px [B] 1px [C] 1px [A] 1px [B] 1px [C]",
		}),
		[item(1, column, "1")],
	);
	expect(positions(result)).toEqual([[1, 0, 1, start, end]]);
});

it.each([
	["Missing", 3, 4],
	["2 Missing", 4, 5],
	["-1 Missing", -1, 0],
	["-3 Missing", -3, -2],
	["3 A", 3, 4],
	["-3 A", -1, 0],
	["1 / span 3 A", 0, 4],
	["span 3 A / -1", -2, 2],
] as const)(
	"resolves missing named lines into implicit lines: %s",
	(column, start, end) => {
		const result = placeGridItems(
			style({ "grid-template-columns": "[A] 1px 1px [A]" }),
			[item(1, column, "1")],
		);
		expect(positions(result)).toEqual([[1, 0, 1, start, end]]);
	},
);

it("named spans ignore implicit lines on the opposite side of the search", () => {
	const result = placeGridItems(style({ "grid-template-columns": "100px" }), [
		item(1, "span foo / 4", "1"),
	]);
	expect(positions(result)).toEqual([[1, 0, 1, -1, 3]]);
	const reverse = placeGridItems(style({ "grid-template-columns": "100px" }), [
		item(1, "-4 / span foo", "1"),
	]);
	expect(positions(reverse)).toEqual([[1, 0, 1, -2, 2]]);
});

it("bare names prefer the first area-edge name but indexed names do not", () => {
	const container = style({
		"grid-template-columns": "[Body-start] 10px [Body] 20px [Body-end] 30px",
		"grid-template-areas": '". . Body"',
	});
	expect(positions(placeGridItems(container, [item(1, "Body", "1")]))).toEqual([
		[1, 0, 1, 0, 2],
	]);
	expect(
		positions(placeGridItems(container, [item(1, "1 Body / 2 Body", "1")])),
	).toEqual([[1, 0, 1, 1, 4]]);
	expect(positions(placeGridItems(container, [item(1, "body", "1")]))).toEqual([
		[1, 0, 1, 4, 5],
	]);
});

it.each(["span C / span C", "span 3 C / auto", "auto / span 2 C"])(
	"auto placement reduces an unanchored named span to one: %s",
	(column) => {
		const result = placeGridItems(
			style({ "grid-template-columns": "repeat(3, 1px)" }),
			[item(1, column)],
		);
		expect(positions(result)).toEqual([[1, 0, 1, 0, 1]]);
	},
);

it("two numeric spans retain only the start span", () => {
	expect(
		positions(placeGridItems(initialGridStyle, [item(1, "span 2 / span 4")])),
	).toEqual([[1, 0, 1, 0, 2]]);
});

for (const columnFlow of [false, true]) {
	const name = columnFlow ? "column" : "row";
	function transpose(value: GridStyle): GridStyle {
		if (!columnFlow) return value;
		return {
			...value,
			"grid-template-columns": value["grid-template-rows"],
			"grid-template-rows": value["grid-template-columns"],
			"grid-auto-columns": value["grid-auto-rows"],
			"grid-auto-rows": value["grid-auto-columns"],
			"grid-column-start": value["grid-row-start"],
			"grid-column-end": value["grid-row-end"],
			"grid-row-start": value["grid-column-start"],
			"grid-row-end": value["grid-column-end"],
		};
	}
	function run(
		container: GridStyle,
		input: GridPlacementInput[],
		dense = false,
	): number[][] {
		const result = placeGridItems(
			{
				...transpose(container),
				"grid-auto-flow": `${name}${dense ? " dense" : ""}`,
			},
			input.map((entry) => ({ ...entry, style: transpose(entry.style) })),
		);
		return positions(result).map(
			([id, rowStart, rowEnd, columnStart, columnEnd]) =>
				columnFlow
					? [id, columnStart, columnEnd, rowStart, rowEnd]
					: [id, rowStart, rowEnd, columnStart, columnEnd],
		);
	}
	it(`${name} sparse flow does not backfill a gap`, () => {
		expect(
			run(style({ "grid-template-columns": "repeat(3, 1px)" }), [
				item(1, "span 2"),
				item(2, "span 2"),
				item(3),
			]),
		).toEqual([
			[1, 0, 1, 0, 2],
			[2, 1, 2, 0, 2],
			[3, 1, 2, 2, 3],
		]);
	});
	it(`${name} dense flow backfills the earlier gap`, () => {
		expect(
			run(
				style({ "grid-template-columns": "repeat(3, 1px)" }),
				[item(1, "span 2"), item(2, "span 2"), item(3)],
				true,
			),
		).toEqual([
			[1, 0, 1, 0, 2],
			[2, 1, 2, 0, 2],
			[3, 0, 1, 2, 3],
		]);
	});
	it(`${name} places overlapping definite items before automatic items`, () => {
		expect(
			run(style({ "grid-template-columns": "repeat(3, 1px)" }), [
				item(1),
				item(2, "1 / span 2", "1"),
				item(3, "1 / span 2", "1"),
			]),
		).toEqual([
			[1, 0, 1, 2, 3],
			[2, 0, 1, 0, 2],
			[3, 0, 1, 0, 2],
		]);
	});
	it(`${name} sparse locked-major placement does not backfill`, () => {
		expect(
			run(style({ "grid-template-columns": "repeat(3, 1px)" }), [
				item(1, "2", "1"),
				item(2, "span 2", "1"),
				item(3, "auto", "1"),
			]),
		).toEqual([
			[1, 0, 1, 1, 2],
			[2, 0, 1, 2, 4],
			[3, 0, 1, 4, 5],
		]);
	});
	it(`${name} dense locked-major placement backfills`, () => {
		expect(
			run(
				style({ "grid-template-columns": "repeat(3, 1px)" }),
				[item(1, "2", "1"), item(2, "span 2", "1"), item(3, "auto", "1")],
				true,
			),
		).toEqual([
			[1, 0, 1, 1, 2],
			[2, 0, 1, 2, 4],
			[3, 0, 1, 0, 1],
		]);
	});
	it(`${name} locked-major spans account for every covered row`, () => {
		expect(
			run(style({ "grid-template-columns": "repeat(3, 1px)" }), [
				item(1, "2", "2"),
				item(2, "span 2", "1 / span 2"),
				item(3, "auto", "2 / span 2"),
			]),
		).toEqual([
			[1, 1, 2, 1, 2],
			[2, 0, 2, 2, 4],
			[3, 1, 3, 4, 5],
		]);
	});
	it(`${name} definite-minor placement advances the sparse cursor when it moves backwards`, () => {
		expect(
			run(style({ "grid-template-columns": "repeat(3, 1px)" }), [
				item(1, "3"),
				item(2, "1"),
				item(3),
			]),
		).toEqual([
			[1, 0, 1, 2, 3],
			[2, 1, 2, 0, 1],
			[3, 1, 2, 1, 2],
		]);
	});
	it(`${name} definite-minor dense placement resets the major cursor`, () => {
		expect(
			run(
				style({ "grid-template-columns": "repeat(3, 1px)" }),
				[item(1, "3"), item(2, "1"), item(3)],
				true,
			),
		).toEqual([
			[1, 0, 1, 2, 3],
			[2, 0, 1, 0, 1],
			[3, 0, 1, 1, 2],
		]);
	});
	it(`${name} adds enough minor tracks for the largest automatic span`, () => {
		expect(
			run(style({ "grid-template-columns": "1px" }), [
				item(1, "span 4"),
				item(2, "span 2"),
			]),
		).toEqual([
			[1, 0, 1, 0, 4],
			[2, 1, 2, 0, 2],
		]);
	});
	it(`${name} starts the cursor at the pre-explicit implicit origin`, () => {
		expect(
			run(
				style({ "grid-template-columns": "1px", "grid-template-rows": "1px" }),
				[item(1, "-3 / -2", "-3 / -2"), item(2)],
			),
		).toEqual([
			[1, -1, 0, -1, 0],
			[2, -1, 0, 0, 1],
		]);
	});
}

it("uses stable order-modified item order without mutating inputs", () => {
	const container = Object.freeze(
		style({ "grid-template-columns": "repeat(4, 1px)" }),
	);
	const inputs = [
		item(7, "auto", "auto", 2),
		item(3, "auto", "auto", -1),
		item(8, "auto", "auto", 2),
		item(0),
	];
	for (const entry of inputs) {
		Object.freeze(entry.style);
		Object.freeze(entry);
	}
	Object.freeze(inputs);
	const before = JSON.stringify(inputs);
	const result = placeGridItems(container, inputs);
	expect(positions(result)).toEqual([
		[3, 0, 1, 0, 1],
		[0, 0, 1, 1, 2],
		[7, 0, 1, 2, 3],
		[8, 0, 1, 3, 4],
	]);
	expect(JSON.stringify(inputs)).toBe(before);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.items)).toBe(true);
	expect(result.items.every(Object.isFrozen)).toBe(true);
	expect(Object.isFrozen(result.columns)).toBe(true);
	expect(Object.isFrozen(result.columns.tracks)).toBe(true);
	expect(result.columns.tracks.every(Object.isFrozen)).toBe(true);
	expect(result.columns.lineNames.every(Object.isFrozen)).toBe(true);
});

it("uses exact work budgets and recovers after exhaustion", () => {
	const container = style({ "grid-template-columns": "repeat(3, 1px)" });
	const inputs = [item(1, "span 2"), item(2, "span 2"), item(3)];
	const original = placeGridItems(container, inputs);
	expect(
		placeGridItems(container, inputs, { maxWork: original.metrics.work }),
	).toEqual(original);
	expect(
		failureCode(() =>
			placeGridItems(container, inputs, { maxWork: original.metrics.work - 1 }),
		),
	).toBe("resource-limit");
	expect(placeGridItems(container, inputs)).toEqual(original);
});

it("does not treat a null work limit as a default", () => {
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [], { maxWork: null as never }),
		),
	).toBe("invalid-input");
});

it("preserves explicit-grid negative numbering after other items extend the grid", () => {
	const result = placeGridItems(
		style({ "grid-template-columns": "repeat(2, 1px)" }),
		[item(1, "-5 / 6", "1"), item(2, "-2 / -1", "2")],
	);
	expect(result.columns.startLine).toBe(-2);
	expect(result.columns.explicitTracks).toBe(2);
	expect(positions(result)).toEqual([
		[1, 0, 1, -2, 5],
		[2, 1, 2, 1, 2],
	]);
});

it("counts repeated seam names once for occurrences and spans", () => {
	const result = placeGridItems(
		style({ "grid-template-columns": "repeat(3, [A] 1px [A])" }),
		[item(1, "2 A / span 2 A", "1"), item(2, "-2 A / -1 A", "2")],
	);
	expect(result.columns.lineNames).toEqual([["A"], ["A"], ["A"], ["A"]]);
	expect(positions(result)).toEqual([
		[1, 0, 1, 1, 3],
		[2, 1, 2, 2, 3],
	]);
});

it("does not leak placement occupancy into later calls", () => {
	const first = placeGridItems(initialGridStyle, [item(1)]);
	placeGridItems(initialGridStyle, [item(2, "1 / span 3", "1 / span 3")]);
	expect(placeGridItems(initialGridStyle, [item(1)])).toEqual(first);
});

it("handles multi-row automatic spans without overlaps in dense and sparse grids", () => {
	for (const dense of [false, true]) {
		for (let width = 1; width <= 5; width++) {
			const input = Array.from({ length: 24 }, (_, index) =>
				item(
					index,
					`span ${1 + ((index * 7) % width)}`,
					`span ${1 + (index % 3)}`,
				),
			);
			const result = placeGridItems(
				style({
					"grid-template-columns": `repeat(${width}, 1px)`,
					"grid-auto-flow": dense ? "row dense" : "row",
				}),
				input,
			);
			const cells = new Set<string>();
			for (const placed of result.items) {
				expect(placed.rowEnd - placed.rowStart).toBe(1 + (placed.id % 3));
				expect(placed.columnEnd - placed.columnStart).toBe(
					1 + ((placed.id * 7) % width),
				);
				expect(placed.rowEnd).toBeLessThanOrEqual(result.rows.tracks.length);
				expect(placed.columnEnd).toBeLessThanOrEqual(width);
				for (let row = placed.rowStart; row < placed.rowEnd; row++) {
					for (
						let column = placed.columnStart;
						column < placed.columnEnd;
						column++
					) {
						const key = `${row}:${column}`;
						expect(cells.has(key)).toBe(false);
						cells.add(key);
					}
				}
			}
		}
	}
});

it.each([
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER,
	gridPlacementLimits.maxWork + 1,
])("rejects invalid work limit %s", (maxWork) => {
	expect(
		failureCode(() => placeGridItems(initialGridStyle, [], { maxWork })),
	).toBe("invalid-input");
});

it.each([null, [], "bad"])("rejects malformed options %s", (options) => {
	expect(
		failureCode(() => placeGridItems(initialGridStyle, [], options as never)),
	).toBe("invalid-input");
});

it.each([
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid item id %s", (id) => {
	expect(failureCode(() => placeGridItems(initialGridStyle, [item(id)]))).toBe(
		"invalid-input",
	);
});

it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	0.5,
])("rejects invalid order %s", (order) => {
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [{ ...item(1), order }]),
		),
	).toBe("invalid-input");
});

it("rejects duplicate ids, sparse arrays and malformed styles", () => {
	expect(
		failureCode(() => placeGridItems(initialGridStyle, [item(1), item(1)])),
	).toBe("invalid-input");
	expect(
		failureCode(() => placeGridItems(initialGridStyle, new Array(1))),
	).toBe("invalid-input");
	expect(failureCode(() => placeGridItems(null as never, []))).toBe(
		"invalid-input",
	);
	expect(
		failureCode(() => placeGridItems(initialGridStyle, null as never)),
	).toBe("invalid-input");
	expect(failureCode(() => placeGridItems({} as never, []))).toBe(
		"invalid-input",
	);
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [{ id: 1, style: {} as never }]),
		),
	).toBe("invalid-input");
});

it.each([
	{ "grid-template-columns": "subgrid" },
	{ "grid-template-areas": '"a a" "a ."' },
	{ "grid-auto-columns": "repeat(2, 1px)" },
	{ "grid-auto-rows": "none" },
	{ "grid-auto-flow": "inherit" },
	{ "grid-template-rows": "repeat(auto-fill, 10px)" },
] as Partial<GridStyle>[])(
	"reports unsupported computed grid syntax %s",
	(values) => {
		expect(failureCode(() => placeGridItems(style(values), []))).toBe(
			"unsupported",
		);
	},
);

it("reports malformed line values without silently choosing auto", () => {
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [
				{ id: 1, style: style({ "grid-column-start": "0" }) },
			]),
		),
	).toBe("unsupported");
});

it("enforces source length before parser allocation", () => {
	expect(
		failureCode(() =>
			placeGridItems(
				style({ "grid-template-columns": "1px ".repeat(5000) }),
				[],
			),
		),
	).toBe("resource-limit");
});

it("accepts the track ceiling but rejects the next outside line", () => {
	const accepted = placeGridItems(initialGridStyle, [item(1, "4096", "1")]);
	expect(accepted.columns.tracks).toHaveLength(4096);
	expect(accepted.columns.explicitTracks).toBe(0);
	expect(
		failureCode(() => placeGridItems(initialGridStyle, [item(1, "4097", "1")])),
	).toBe("resource-limit");
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [item(1, "-4098", "1")]),
		),
	).toBe("resource-limit");
	expect(
		failureCode(() => placeGridItems(initialGridStyle, [item(1, "span 4097")])),
	).toBe("resource-limit");
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [item(1, "1000000 Missing")]),
		),
	).toBe("resource-limit");
});

it("counts combined pre-explicit and post-explicit track extents", () => {
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [
				item(1, "-3001", "1"),
				item(2, "3000", "1"),
			]),
		),
	).toBe("resource-limit");
});

it("bounds occupied cells before scanning or allocating an oversized rectangle", () => {
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [
				item(1, "1 / span 1001", "1 / span 1000"),
			]),
		),
	).toBe("resource-limit");
});

it("allows one million occupied cells and does not double-count overlaps", () => {
	const accepted = placeGridItems(initialGridStyle, [
		item(1, "1 / span 1000", "1 / span 1000"),
		item(2, "1 / span 1000", "1 / span 1000"),
	]);
	expect(accepted.items).toHaveLength(2);
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [
				item(1, "1 / span 1000", "1 / span 1000"),
				item(2, "1001", "1"),
			]),
		),
	).toBe("resource-limit");
});

it("accepts the item ceiling and refuses one extra item", () => {
	const inputs = Array.from(
		{ length: gridPlacementLimits.maxItems },
		(_, index) => item(index),
	);
	const result = placeGridItems(initialGridStyle, inputs);
	expect(result.items).toHaveLength(4096);
	expect(result.rows.tracks).toHaveLength(4096);
	expect(
		failureCode(() =>
			placeGridItems(initialGridStyle, [...inputs, item(4096)]),
		),
	).toBe("resource-limit");
});
