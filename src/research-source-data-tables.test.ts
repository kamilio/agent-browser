import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourceDataTableCollector,
	fitResearchSourceDataTables,
	researchSourceDataTables,
	setResearchSourceDataTables,
	type ResearchSourceDataTables,
} from "./research-source-data-tables.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function field(overrides: Record<string, unknown> = {}) {
	return { title: "Frequency", formatValue: "4.2", value: 4200, ...overrides };
}

function row(overrides: Record<string, unknown> = {}) {
	return {
		title: "Processor",
		elements: { frequency: field() },
		elementsOrder: ["frequency"],
		...overrides,
	};
}

function input(items: unknown[] = [row()]) {
	return JSON.stringify({ items });
}

function collect(decoded = input(), attributes: Record<string, string> = {}) {
	const collector = new ResearchSourceDataTableCollector();
	collector.add("section", { "data-json": decoded, ...attributes }, 19);
	return collector.finish();
}

function required(data: ResearchSourceDataTables | undefined) {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing source data tables");
	return data;
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

it("retains source identity, explicit field order and formatted units only", () => {
	const result = collect(
		input([
			row({
				elements: {
					frequency: field({
						prefix: "Up to",
						suffix: "GHz",
						hidePrefix: false,
					}),
					cores: field({ title: "Cores", formatValue: "8", value: 8000 }),
				},
				elementsOrder: ["cores", "frequency", "cores"],
				model: "private model",
				description: "not a field",
				productPages: ["https://never-fetch.invalid/"],
			}),
		]),
		{ id: "specs" },
	);
	expect(result).toEqual({
		kind: "html-data-json-tables-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		truncated: false,
		tables: [
			{
				source: {
					attribute: "data-json",
					tag: "section",
					offset: 19,
					id: "specs",
				},
				rows: [
					{
						title: "Processor",
						fields: [
							{ key: "cores", label: "Cores", value: "8" },
							{
								key: "frequency",
								label: "Frequency",
								value: "4.2",
								prefix: "Up to",
								suffix: "GHz",
								hidePrefix: false,
							},
						],
						truncated: false,
					},
				],
				truncated: false,
			},
		],
	});
});

it("preserves zero, empty formatted strings and true/false qualifiers without invention", () => {
	const result = required(
		collect(
			input([
				row({
					elements: {
						missing: { title: "Missing", value: 0 },
						zero: field({
							formatValue: "0",
							prefix: "",
							suffix: "",
							hidePrefix: true,
						}),
						empty: field({ formatValue: "" }),
					},
					elementsOrder: ["missing", "zero", "empty"],
				}),
			]),
		),
	);
	expect(result.tables[0].rows[0].fields).toEqual([
		{ key: "zero", label: "Frequency", value: "0", hidePrefix: true },
		{ key: "empty", label: "Frequency", value: "" },
	]);
	expect(result.truncated).toBe(false);
});

it("uses caller-provided normalized UTF-16 offsets, not byte positions or DOM references", () => {
	const collector = new ResearchSourceDataTableCollector();
	const normalizedPrefix = "😀\n";
	collector.add(
		"custom-table",
		{ "data-json": input() },
		normalizedPrefix.length,
	);
	expect(required(collector.finish()).tables[0].source).toEqual({
		attribute: "data-json",
		tag: "custom-table",
		offset: 3,
	});
});

it("ignores deeply nested unknown bootstrap data without traversing it", () => {
	const nested = `${"[".repeat(2000)}0${"]".repeat(2000)}`;
	const decoded = `{"items":[${JSON.stringify(row())}],"bootstrap":${nested}}`;
	expect(collect(decoded)).toEqual(collect());
});

it.each([
	"",
	"{",
	"null",
	"[]",
	"1",
	'"text"',
	"{}",
	'{"items":{}}',
	'{"items":[null,[],1,{}]}',
	input([row({ title: " " })]),
	input([row({ title: 1 })]),
	input([row({ elements: [] })]),
	input([row({ elementsOrder: {} })]),
	input([row({ elementsOrder: ["missing", 1, null] })]),
])("ignores invalid JSON or unsupported root/item schemas: %s", (decoded) => {
	expect(collect(decoded)).toBeUndefined();
});

it.each([
	{ title: "" },
	{ title: "\t" },
	{ title: 1 },
	{ formatValue: undefined },
	{ formatValue: null },
	{ formatValue: 0 },
	{ prefix: 2 },
	{ suffix: false },
	{ hidePrefix: "false" },
])(
	"skips unsupported fields without claiming budget truncation: %j",
	(override) => {
		expect(
			collect(input([row({ elements: { frequency: field(override) } })])),
		).toBeUndefined();
	},
);

it("ignores duplicates, inherited names and prototype-sensitive keys", () => {
	const decoded =
		'{"items":[{"title":"Safe","elements":{"__proto__":{"title":"Bad","formatValue":"1"},"constructor":{"title":"Bad","formatValue":"2"},"prototype":{"title":"Bad","formatValue":"3"},"safe":{"title":"Good","formatValue":"4"}},"elementsOrder":["__proto__","constructor","prototype","toString","safe","safe"]}]}';
	expect(required(collect(decoded)).tables[0].rows[0].fields).toEqual([
		{ key: "safe", label: "Good", value: "4" },
	]);
	const collector = new ResearchSourceDataTableCollector();
	collector.add("div", Object.create({ "data-json": input() }), 0);
	expect(collector.finish()).toBeUndefined();
	const attributes = Object.assign(Object.create({ id: "inherited" }), {
		"data-json": input(),
	});
	collector.add("div", attributes, 0);
	expect(required(collector.finish()).tables[0].source).not.toHaveProperty(
		"id",
	);
});

it("returns literal strings, never decodes entities twice, and escapes controls like descriptions", () => {
	const literal = '<script>throw new Error("never execute")</script>&amp;';
	const result = required(
		collect(
			input([
				row({
					title: "A\u001b\u202e\r\nB\tC",
					elements: {
						"key\u0000": field({
							title: literal,
							formatValue: literal,
							prefix: "\u0000",
							suffix: "\u007f",
						}),
					},
					elementsOrder: ["key\u0000"],
				}),
			]),
			{ id: "id\u001b" },
		),
	);
	expect(result.tables[0].source.id).toBe("id\\u{1b}");
	expect(result.tables[0].rows[0].title).toBe("A\\u{1b}\\u{202e}\nB\tC");
	expect(result.tables[0].rows[0].fields[0]).toEqual({
		key: "key\\u{0}",
		label: literal,
		value: literal,
		prefix: "\\u{0}",
		suffix: "\\u{7f}",
	});
	expect(collect(input().replaceAll('"', "&quot;"))).toBeUndefined();
});

it.each([
	["title", 256],
	["label", 256],
	["key", 128],
	["value", 1024],
	["prefix", 128],
	["suffix", 128],
	["id", 256],
] as const)(
	"enforces the inclusive %s string boundary without cutting qualifiers",
	(target, limit) => {
		function fixture(text: string) {
			const key = target === "key" ? text : "frequency";
			const overrides: Record<string, unknown> = {};
			if (target === "label") overrides.title = text;
			if (target === "value") overrides.formatValue = text;
			if (target === "prefix" || target === "suffix") overrides[target] = text;
			return collect(
				input([
					row({
						title: target === "title" ? text : "Processor",
						elements: { [key]: field(overrides) },
						elementsOrder: [key],
					}),
				]),
				target === "id" ? { id: text } : {},
			);
		}
		const boundary = required(fixture("😀".repeat(limit / 2)));
		expect(boundary.truncated).toBe(false);
		expect(boundary.tables).toHaveLength(1);
		const over = required(fixture(`${"😀".repeat(limit / 2)}!`));
		expect(over.truncated).toBe(true);
		if (target === "id") {
			expect(over.tables[0].source).not.toHaveProperty("id");
			expect(over.tables[0].truncated).toBe(true);
		} else expect(over.tables).toEqual([]);
	},
);

it("bounds escaped strings too and retains other useful fields with truncation", () => {
	const result = required(
		collect(
			input([
				row({
					elements: {
						large: field({ prefix: "\u0000".repeat(26) }),
						good: field({ suffix: "GHz" }),
					},
					elementsOrder: ["large", "good"],
				}),
			]),
		),
	);
	expect(result.truncated).toBe(true);
	expect(result.tables[0].truncated).toBe(true);
	expect(result.tables[0].rows[0].truncated).toBe(true);
	expect(result.tables[0].rows[0].fields).toEqual([
		{ key: "good", label: "Frequency", value: "4.2", suffix: "GHz" },
	]);
});

it("bounds decoded attributes before parsing, accepting exactly 65536 UTF-16 units", () => {
	expect(required(collect(input().padEnd(65536, " "))).truncated).toBe(false);
	expect(collect(input().padEnd(65537, " "))).toEqual({
		kind: "html-data-json-tables-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		truncated: true,
		tables: [],
	});
	const collector = new ResearchSourceDataTableCollector();
	collector.add("div", { "data-json": "{".repeat(65537) }, 0);
	collector.add("div", { "data-json": input() }, 1);
	expect(required(collector.finish()).tables).toHaveLength(1);
});

it("caps total inspected units at 262144, including invalid JSON and unknown schemas", () => {
	const collector = new ResearchSourceDataTableCollector();
	collector.add("div", { "data-json": "{".padEnd(65536, " ") }, 0);
	collector.add("div", { "data-json": "{}".padEnd(65536, " ") }, 1);
	collector.add("div", { "data-json": input().padEnd(65536, " ") }, 2);
	collector.add("div", { "data-json": input().padEnd(65536, " ") }, 3);
	const boundary = required(collector.finish());
	expect(boundary.truncated).toBe(false);
	expect(boundary.tables).toHaveLength(2);
	collector.add("div", { "data-json": " " }, 4);
	expect(required(collector.finish()).truncated).toBe(true);
	expect(boundary.truncated).toBe(false);
	collector.add("div", { "data-json": input() }, 5);
	expect(required(collector.finish()).tables).toHaveLength(2);
});

it("counts only encountered data-json attributes and stops after sixteen", () => {
	const collector = new ResearchSourceDataTableCollector();
	for (let index = 0; index < 40; index++) collector.add("div", {}, index);
	for (let index = 0; index < 15; index++)
		collector.add("div", { "data-json": "invalid" }, index);
	collector.add("div", { "data-json": input() }, 16);
	expect(required(collector.finish()).truncated).toBe(false);
	collector.add("div", { "data-json": input() }, 17);
	expect(required(collector.finish()).truncated).toBe(true);
	expect(required(collector.finish()).tables).toHaveLength(1);
	const empty = new ResearchSourceDataTableCollector();
	for (let index = 0; index < 16; index++)
		empty.add("div", { "data-json": "invalid" }, index);
	expect(empty.finish()).toBeUndefined();
	empty.add("div", { "data-json": input() }, 17);
	expect(required(empty.finish()).tables).toEqual([]);
});

it("accepts eight tables and preserves offsets and table order at the cap", () => {
	const collector = new ResearchSourceDataTableCollector();
	for (let index = 0; index < 8; index++)
		collector.add("custom-table", { "data-json": input() }, index * 2);
	const boundary = required(collector.finish());
	expect(boundary.truncated).toBe(false);
	expect(boundary.tables.map((table) => table.source.offset)).toEqual([
		0, 2, 4, 6, 8, 10, 12, 14,
	]);
	collector.add("div", { "data-json": input() }, 99);
	expect(required(collector.finish()).tables).toHaveLength(8);
	expect(required(collector.finish()).truncated).toBe(true);
	expect(boundary.truncated).toBe(false);
});

it("caps rows at sixty-four globally and within one table", () => {
	const collector = new ResearchSourceDataTableCollector();
	collector.add(
		"div",
		{ "data-json": input(Array.from({ length: 63 }, () => row())) },
		0,
	);
	collector.add("div", { "data-json": input() }, 1);
	expect(required(collector.finish()).truncated).toBe(false);
	collector.add("div", { "data-json": input() }, 2);
	expect(required(collector.finish()).truncated).toBe(true);
	expect(
		required(collector.finish()).tables.map((table) => table.rows.length),
	).toEqual([63, 1]);
	const overflow = required(
		collect(
			input(
				Array.from({ length: 65 }, (_, index) =>
					row({ title: `Row ${index}` }),
				),
			),
		),
	);
	expect(overflow.truncated).toBe(true);
	expect(overflow.tables[0].truncated).toBe(true);
	expect(overflow.tables[0].rows).toHaveLength(64);
	expect(overflow.tables[0].rows[63].title).toBe("Row 63");
});

it("caps fields at thirty-two in requested order, not object insertion order", () => {
	const keys = Array.from({ length: 33 }, (_, index) => `key${index}`);
	const elements = Object.fromEntries(keys.map((key) => [key, field()]));
	const boundary = required(
		collect(input([row({ elements, elementsOrder: keys.slice(0, 32) })])),
	);
	expect(boundary.truncated).toBe(false);
	const reversed = keys.slice().reverse();
	const result = required(
		collect(input([row({ elements, elementsOrder: reversed })])),
	);
	expect(result.tables[0].rows[0].fields.map((entry) => entry.key)).toEqual(
		reversed.slice(0, 32),
	);
	expect(result.tables[0].rows[0].truncated).toBe(true);
	expect(result.tables[0].truncated).toBe(true);
	expect(result.truncated).toBe(true);
});

it.each(["界", "😀", '"', "\\"])(
	"caps the complete UTF-8 JSON envelope without slicing %s values",
	(character) => {
		const text = character.repeat(Math.floor(1024 / character.length));
		const keys = Array.from({ length: 32 }, (_, index) => `key${index}`);
		const elements = Object.fromEntries(
			keys.map((key) => [key, field({ formatValue: text, suffix: "GHz" })]),
		);
		const collector = new ResearchSourceDataTableCollector();
		collector.add("div", { "data-json": input() }, 0);
		const before = required(collector.finish());
		const decoded = input([row({ elements, elementsOrder: keys })]);
		if (decoded.length <= 65536) {
			collector.add("div", { "data-json": decoded }, 1);
			collector.add("div", { "data-json": decoded }, 2);
		} else {
			const smaller = input([
				row({
					elementsOrder: keys.slice(0, 16),
					elements: Object.fromEntries(
						keys.slice(0, 16).map((key) => [key, elements[key]]),
					),
				}),
			]);
			for (let index = 1; index <= 3; index++)
				collector.add("div", { "data-json": smaller }, index);
		}
		const result = required(collector.finish());
		expect(bytes(result)).toBeLessThanOrEqual(65536);
		expect(result.truncated).toBe(true);
		expect(before.tables).toHaveLength(1);
		for (const table of result.tables.slice(1)) {
			for (const entry of table.rows[0].fields) {
				expect(entry.value).toBe(text);
				expect(entry.suffix).toBe("GHz");
			}
		}
	},
);

it("finishes idempotently with deeply immutable snapshots independent of later additions", () => {
	const collector = new ResearchSourceDataTableCollector();
	expect(collector.finish()).toBeUndefined();
	collector.add("div", { "data-json": input() }, 0);
	const first = required(collector.finish());
	expect(collector.finish()).toBe(first);
	expectFrozen(first);
	expect(() =>
		Object.assign(first.tables[0].rows[0].fields[0], { value: "changed" }),
	).toThrow();
	collector.add("section", { "data-json": input() }, 2);
	const second = required(collector.finish());
	expect(second).not.toBe(first);
	expect(second.tables).toHaveLength(2);
	expect(first.tables).toHaveLength(1);
	expectFrozen(second);
});

it("stores defensive known-property snapshots, reuses cleanup registration, and deletes on close", () => {
	const tree = new DocumentTree("about:blank");
	trees.push(tree);
	expect(researchSourceDataTables(tree)).toBeUndefined();
	const original = required(
		collect(
			input([
				row({
					elements: {
						frequency: field({
							prefix: "Up to",
							suffix: "GHz",
							hidePrefix: false,
						}),
					},
				}),
			]),
		),
	);
	const mutable = JSON.parse(JSON.stringify(original));
	mutable.unknown = "discard";
	mutable.tables[0].source.unknown = "discard";
	mutable.tables[0].rows[0].fields[0].unknown = "discard";
	setResearchSourceDataTables(tree, mutable);
	const stored = researchSourceDataTables(tree);
	expect(stored).toEqual(original);
	expect(stored).not.toBe(mutable);
	expectFrozen(stored);
	mutable.tables[0].rows[0].fields[0].suffix = "changed";
	mutable.tables[0].rows.length = 0;
	expect(stored).toEqual(original);
	for (let index = 0; index < 70; index++)
		setResearchSourceDataTables(tree, original);
	for (let index = 0; index < 63; index++) tree.onClose(() => {});
	tree.close();
	expect(researchSourceDataTables(tree)).toBeUndefined();
	expect(() => setResearchSourceDataTables(tree, original)).toThrow("closed");
	expect(researchSourceDataTables(tree)).toBeUndefined();
	expect(stored).toEqual(original);
});

it("accepts exactly 65536 serialized UTF-8 bytes, not just the table payload", () => {
	const expected = {
		kind: "html-data-json-tables-v1" as const,
		scope: "document-source" as const,
		partial: true as const,
		rendered: false as const,
		truncated: false,
		tables: Array.from({ length: 2 }, (_, offset) => ({
			source: { attribute: "data-json" as const, tag: "div", offset },
			rows: Array.from({ length: 32 }, () => ({
				title: "Processor",
				fields: [{ key: "frequency", label: "Frequency", value: "" }],
				truncated: false,
			})),
			truncated: false,
		})),
	};
	let remaining = 65536 - bytes(expected);
	for (const table of expected.tables) {
		for (const entry of table.rows) {
			const length = Math.min(remaining, 1024);
			entry.fields[0].value = "a".repeat(length);
			remaining -= length;
		}
	}
	expect(remaining).toBe(0);
	function fixture(extra: string) {
		const collector = new ResearchSourceDataTableCollector();
		for (const table of expected.tables) {
			const items = table.rows.map((entry, index) =>
				row({
					elements: {
						frequency: field({
							formatValue:
								entry.fields[0].value +
								(table.source.offset === 1 && index === 31 ? extra : ""),
						}),
					},
				}),
			);
			const decoded = input(items);
			expect(decoded.length).toBeLessThanOrEqual(65536);
			collector.add("div", { "data-json": decoded }, table.source.offset);
		}
		return required(collector.finish());
	}
	const boundary = fixture("");
	expect(boundary).toEqual(expected);
	expect(bytes(boundary)).toBe(65536);
	const over = fixture("!");
	expect(over.truncated).toBe(true);
	expect(bytes(over)).toBeLessThanOrEqual(65536);
});

function fittingFixture() {
	const collector = new ResearchSourceDataTableCollector();
	for (let offset = 0; offset < 2; offset++) {
		collector.add(
			"section",
			{
				"data-json": input([
					row({
						title: `First ${offset}`,
						elements: {
							frequency: field({
								formatValue: "界😀".repeat(40),
								prefix: "Up to",
								suffix: "GHz",
								hidePrefix: false,
							}),
						},
					}),
					row({ title: `Second ${offset}` }),
				]),
			},
			offset,
		);
	}
	return required(collector.finish());
}

it("fits by exact UTF-8 JSON bytes and returns an already fitting snapshot unchanged", () => {
	const data = fittingFixture();
	const length = bytes(data);
	expect(length).toBeGreaterThan(JSON.stringify(data).length);
	expect(fitResearchSourceDataTables(data, length)).toBe(data);
	expect(fitResearchSourceDataTables(data, length + 1)).toBe(data);
	const smaller = required(fitResearchSourceDataTables(data, length - 1));
	expect(smaller.truncated).toBe(true);
	expect(bytes(smaller)).toBeLessThanOrEqual(length - 1);
	expectFrozen(smaller);
	expect(fitResearchSourceDataTables(smaller, bytes(smaller))).toBe(smaller);
	expect(data.truncated).toBe(false);
});

it("fits whole rows in source order without stripping qualifiers or skipping a large first row", () => {
	const data = fittingFixture();
	const prefix = {
		...data,
		truncated: true,
		tables: [
			{ ...data.tables[0], truncated: true, rows: [data.tables[0].rows[0]] },
		],
	};
	const limit = bytes(prefix);
	const fitted = required(fitResearchSourceDataTables(data, limit));
	expect(fitted).toEqual(prefix);
	expect(bytes(fitted)).toBe(limit);
	expect(fitted.tables[0].rows[0].fields).toEqual(
		data.tables[0].rows[0].fields,
	);
	expect(fitted.tables[0].rows[0].truncated).toBe(false);
	expectFrozen(fitted);
	const smaller = required(fitResearchSourceDataTables(data, limit - 1));
	expect(smaller.tables).toEqual([]);
	expect(smaller.truncated).toBe(true);
	expect(data.tables[0].rows).toHaveLength(2);
	expect(data.tables[0].truncated).toBe(false);
});

it("retains complete table prefixes and then complete rows from the next table", () => {
	const data = fittingFixture();
	const firstTable = { ...data, truncated: true, tables: [data.tables[0]] };
	expect(fitResearchSourceDataTables(data, bytes(firstTable))).toEqual(
		firstTable,
	);
	const nextRow = {
		...firstTable,
		tables: [
			data.tables[0],
			{ ...data.tables[1], truncated: true, rows: [data.tables[1].rows[0]] },
		],
	};
	const fitted = required(fitResearchSourceDataTables(data, bytes(nextRow)));
	expect(fitted).toEqual(nextRow);
	expect(bytes(fitted)).toBe(bytes(nextRow));
	expectFrozen(fitted);
	expect(data.tables[1].rows).toHaveLength(2);
});

it("prefers an empty truncated marker at its exact boundary and omits it below that", () => {
	const data = fittingFixture();
	const marker = { ...data, truncated: true, tables: [] };
	const limit = bytes(marker);
	const fitted = required(fitResearchSourceDataTables(data, limit));
	expect(fitted).toEqual(marker);
	expectFrozen(fitted);
	expect(fitResearchSourceDataTables(fitted, limit)).toBe(fitted);
	expect(fitResearchSourceDataTables(data, limit - 1)).toBeUndefined();
	expect(fitResearchSourceDataTables(data, 0)).toBeUndefined();
});

it("preserves existing row and table truncation when applying an additional byte budget", () => {
	const collector = new ResearchSourceDataTableCollector();
	collector.add(
		"section",
		{
			"data-json": input([
				row({
					elements: {
						large: field({ suffix: "x".repeat(129) }),
						frequency: field({ prefix: "Up to", suffix: "GHz" }),
					},
					elementsOrder: ["large", "frequency"],
				}),
				row(),
			]),
		},
		0,
	);
	const data = required(collector.finish());
	const prefix = {
		...data,
		tables: [{ ...data.tables[0], rows: [data.tables[0].rows[0]] }],
	};
	const fitted = required(fitResearchSourceDataTables(data, bytes(prefix)));
	expect(fitted).toEqual(prefix);
	expect(fitted.tables[0].truncated).toBe(true);
	expect(fitted.tables[0].rows[0].truncated).toBe(true);
	expectFrozen(fitted);
	expect(data.tables[0].rows).toHaveLength(2);
});

it.each([
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	"256",
	null,
	undefined,
])(
	"rejects invalid metadata byte allowances with invalid-input: %s",
	(maxBytes) => {
		expect(() =>
			fitResearchSourceDataTables(fittingFixture(), maxBytes as number),
		).toThrow("Invalid source data tables byte limit");
		try {
			fitResearchSourceDataTables(fittingFixture(), maxBytes as number);
		} catch (error) {
			expect(error).toHaveProperty("code", "invalid-input");
		}
	},
);
