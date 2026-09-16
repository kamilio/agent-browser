import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourceChartTableCollector,
	fitResearchSourceChartTables,
	infogramChartRoute,
	researchSourceChartTables,
	setResearchSourceChartTables,
	type InfogramChartRoute,
	type ResearchSourceChartTables,
} from "./research-source-chart-tables.js";

const embedId = "12345678-1234-4234-8234-123456789abc";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const url = `https://e.infogram.com/${embedId}`;
const trees: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function matrix(rows = 2, columns = 2, value: unknown = 0) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: columns }, () => ({ value })),
	);
}

function chart(overrides: Record<string, unknown> = {}) {
	return {
		type: "CHART",
		props: {
			chartData: {
				data: [matrix()],
				sheetnames: ["Invented source sheet"],
				sheets_settings: [{ xlabel: "Invented source unit" }],
				chart_type_nr: 7,
				modifier: 0,
				...overrides,
			},
		},
	};
}

function payload(
	content: Record<string, unknown> = {},
	root: Record<string, unknown> = {},
) {
	return {
		path: embedId,
		public: true,
		publicAccess: false,
		elements: {
			content: {
				content: {
					blockOrder: ["block"],
					blocks: { block: { entities: ["chart"] } },
					entities: { chart: chart() },
					...content,
				},
			},
		},
		...root,
	};
}

function script(data: unknown = payload()) {
	return `window.infographicData = ${JSON.stringify(data)};`;
}

function collect(source = script()) {
	const collector = new ResearchSourceChartTableCollector({ id: embedId });
	collector.add(source, 0, source.length, 0);
	return collector.finish();
}

function collectChart(overrides: Record<string, unknown>) {
	return collect(script(payload({ entities: { chart: chart(overrides) } })));
}

function sheets(data: unknown[]) {
	return {
		data,
		sheetnames: data.map((_, index) => `Sheet ${index}`),
		sheets_settings: data.map(() => ({})),
	};
}

function required(data: ResearchSourceChartTables | undefined) {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing source chart tables");
	return data;
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

function sourcePath(entityId = "chart", index = 0) {
	return `$.elements.content.content.entities[${JSON.stringify(entityId)}].props.chartData.data[${index}]`;
}

describe("Infogram source route", () => {
	it.each([
		"",
		"?src=embed",
		"#sheet",
		"?parent_url=https%3A%2F%2Fexample.invalid#sheet",
	])("admits the exact public embed identity with suffix %s", (suffix) => {
		const route = infogramChartRoute(url + suffix);
		expect(route).toEqual({ id: embedId });
		expect(Object.isFrozen(route)).toBe(true);
		expect(infogramChartRoute(url + suffix)).not.toBe(route);
	});

	it.each([
		"",
		"not a URL",
		`/${embedId}`,
		`http://e.infogram.com/${embedId}`,
		`https://infogram.com/${embedId}`,
		`https://e.infogram.com.evil.invalid/${embedId}`,
		`https://e.infogram.com:444/${embedId}`,
		`https://e.infogram.com:443/${embedId}`,
		`https://user@e.infogram.com/${embedId}`,
		`https://:password@e.infogram.com/${embedId}`,
		`https://e.infogram.com/${embedId.toUpperCase()}`,
		`https://e.infogram.com/%31${embedId.slice(1)}`,
		`https://e.infogram.com/embed/${embedId}`,
		`https://e.infogram.com/other/../${embedId}`,
		`https://e.infogram.com/./${embedId}`,
		`https://e.infogram.com\\${embedId}`,
		`${url}/nested`,
		`${url}/`,
		`${url}extra`,
		`${url.slice(0, -1)}`,
		` ${url}`,
		`${url}\n`,
		`https://e.infogram.com/${embedId.slice(0, 8)}\n${embedId.slice(8)}`,
	])("rejects noncanonical or untrusted routes: %s", (value) => {
		expect(infogramChartRoute(value)).toBeUndefined();
	});

	it("bounds route input at 4096 UTF-16 units", () => {
		const prefix = `${url}?padding=`;
		const exact = prefix + "x".repeat(4096 - prefix.length);
		expect(infogramChartRoute(exact)).toEqual({ id: embedId });
		expect(infogramChartRoute(`${exact}x`)).toBeUndefined();
		expect(infogramChartRoute(null as unknown as string)).toBeUndefined();
	});

	it.each([
		null,
		{},
		{ id: otherId.toUpperCase() },
		{ id: "chart" },
		{ id: 1 },
		{ id: `${embedId}\n` },
	])("rejects invalid collector routes: %j", (route) => {
		expect(
			() => new ResearchSourceChartTableCollector(route as InfogramChartRoute),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});
});

describe("anchored inert script assignment", () => {
	it("copies only the declared source table and provenance", () => {
		expect(collect()).toEqual({
			kind: "infogram-chart-tables-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "plain-text",
			embedId,
			truncated: false,
			tables: [
				{
					source: {
						offset: 0,
						offsetBasis: "lf-normalized-utf16",
						path: sourcePath(),
						sheetIndex: 0,
					},
					sheetName: "Invented source sheet",
					chartTypeNumber: 7,
					modifier: 0,
					axisLabel: "Invented source unit",
					rows: matrix().map((row) =>
						row.map(() => ({ kind: "value-cell", value: 0 })),
					),
				},
			],
		});
	});

	it("uses only the exact tokenizer span and LF-normalized UTF-16 tag offset", () => {
		const prefix = "😀\nnot an assignment\n";
		const tag = '<script data-note="invented">';
		const body = script();
		const source = `${prefix}${tag}${body}</script>${script()}`;
		const collector = new ResearchSourceChartTableCollector({ id: embedId });
		collector.add(
			source,
			prefix.length + tag.length,
			prefix.length + tag.length + body.length,
			prefix.length,
		);
		expect(required(collector.finish()).tables[0].source.offset).toBe(
			prefix.length,
		);
		expect(collect(source)).toBeUndefined();
		const empty = new ResearchSourceChartTableCollector({ id: embedId });
		empty.add(source, 0, prefix.length, 0);
		expect(empty.finish()).toBeUndefined();
		const clipped = new ResearchSourceChartTableCollector({ id: embedId });
		clipped.add(body, 0, body.length - 2, 0);
		expect(clipped.finish()).toBeUndefined();
	});

	it.each(["", " ", "\t\n\r\v\f "])(
		"allows outer ASCII whitespace %j and optional semicolon",
		(space) => {
			const literal = JSON.stringify(payload());
			for (const terminal of ["", ";"]) {
				expect(
					collect(
						`${space}window.infographicData${space}=${space}${literal}${space}${terminal}${space}`,
					),
				).toEqual(collect());
			}
		},
	);

	it("uses the maintained literal grammar, including quoted strings and trailing commas", () => {
		const literal = JSON.stringify(payload())
			.replace('"path":', "path:")
			.replace('"Invented source sheet"', "'Invented source sheet'")
			.replace(/}$/, ",}");
		expect(collect(`window.infographicData=${literal};`)).toEqual(collect());
	});

	it.each([
		(data: string) => `var window.infographicData=${data};`,
		(data: string) => `const infographicData=${data};`,
		(data: string) => `infographicData=${data};`,
		(data: string) => `window["infographicData"]=${data};`,
		(data: string) => `window . infographicData=${data};`,
		(data: string) => `/* comment */window.infographicData=${data};`,
		(data: string) => `window.infographicData=/* comment */${data};`,
		(data: string) => `window.infographicData=${data}; // comment`,
		(data: string) => `window.infographicData=(${data});`,
		(data: string) => `window.infographicData=JSON.parse('${data}');`,
		(data: string) => `window.infographicData=(()=>${data})();`,
		(data: string) => `window.infographicData=${data};void 0;`,
		(data: string) => `window.infographicData=${data};;`,
		(data: string) =>
			`window.infographicData=${data};window.infographicData=${data};`,
		(data: string) => `window.infographicData==${data};`,
		(data: string) => `window.infographicData+=${data};`,
		(data: string) => `\u00a0window.infographicData=${data};`,
	])("rejects unsupported syntax without evaluating it (#%#)", (wrap) => {
		expect(collect(wrap(JSON.stringify(payload())))).toBeUndefined();
	});

	it.each(["__proto__", "prototype", "constructor"])(
		"rejects reserved literal keys %s",
		(key) => {
			const literal = JSON.stringify(payload()).replace(/}$/, `,"${key}":{}}`);
			expect(collect(`window.infographicData=${literal}`)).toBeUndefined();
		},
	);

	it("rejects duplicate literal keys", () => {
		const literal = JSON.stringify(payload()).replace(/}$/, ',"public":true}');
		expect(collect(`window.infographicData=${literal}`)).toBeUndefined();
	});

	it.each([
		[-1, 1, 0],
		[0, 2, 0],
		[1, 0, 0],
		[0, 1, -1],
		[0, 1, 1],
		[0.5, 1, 0],
		[0, 0.5, 0],
		[0, 1, 0.5],
		[Number.NaN, 1, 0],
		[0, Number.POSITIVE_INFINITY, 0],
		[0, 1, Number.MAX_SAFE_INTEGER + 1],
	])("throws invalid-input for invalid spans %j", (start, end, offset) => {
		const collector = new ResearchSourceChartTableCollector({ id: embedId });
		expect(() => collector.add("x", start, end, offset)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	});

	it("rejects non-string source input and accepts an empty span", () => {
		const collector = new ResearchSourceChartTableCollector({ id: embedId });
		expect(() => collector.add(null as unknown as string, 0, 0, 0)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		collector.add("", 0, 0, 0);
		expect(collector.finish()).toBeUndefined();
	});

	it.each([
		script(),
		"window.infographicData=evil();",
		script(payload({}, { public: false })),
	])(
		"invalidates duplicate matching assignments, including unsupported replacements (#%#)",
		(second) => {
			for (const sources of [
				[script(), second],
				[second, script()],
			]) {
				const collector = new ResearchSourceChartTableCollector({
					id: embedId,
				});
				for (const source of sources)
					collector.add(source, 0, source.length, 0);
				expect(collector.finish()).toBeUndefined();
			}
		},
	);

	it.each([
		" ".repeat(128) + script(),
		" ".repeat(120) + script(),
		`window.infographicData${" ".repeat(128)}=${JSON.stringify(payload())};`,
		"\t".repeat(128),
	])(
		"invalidates stale data when the bounded prefix is ambiguous (#%#)",
		(ambiguous) => {
			for (const sources of [
				[script(), ambiguous],
				[ambiguous, script()],
			]) {
				const collector = new ResearchSourceChartTableCollector({
					id: embedId,
				});
				for (const source of sources)
					collector.add(source, 0, source.length, 0);
				expect(collector.finish()).toBeUndefined();
			}
		},
	);

	it("accepts an assignment whose equals sign ends the 128-unit probe", () => {
		const prefix = "window.infographicData=";
		expect(
			collect(
				`${" ".repeat(128 - prefix.length)}${prefix}${JSON.stringify(payload())}`,
			),
		).toEqual(collect());
	});

	it("ignores unrelated scripts, even large ones and assignments outside their span", () => {
		const collector = new ResearchSourceChartTableCollector({ id: embedId });
		for (const source of [
			"console.log('unrelated');",
			script(),
			"x".repeat(70_000),
			"window.otherData={};",
		]) {
			collector.add(source, 0, source.length, 0);
		}
		expect(collector.finish()).toEqual(collect());
	});
});

describe("published block and entity references", () => {
	it.each([
		null,
		[],
		{},
		1,
		payload({}, { path: otherId }),
		payload({}, { path: undefined }),
		payload({}, { public: false }),
		payload({}, { public: "true" }),
		payload({}, { public: undefined }),
		payload({}, { elements: [] }),
		payload({}, { elements: { content: {} } }),
		payload({ blockOrder: {} }),
		payload({ blocks: [] }),
		payload({ entities: [] }),
	])("rejects unsupported roots without a source snapshot (#%#)", (data) => {
		expect(collect(script(data))).toBeUndefined();
	});

	it("requires public true but does not interpret publicAccess", () => {
		for (const publicAccess of [true, false, null, "unknown", undefined]) {
			expect(collect(script(payload({}, { publicAccess })))).toEqual(collect());
		}
	});

	it("follows block/entity order, deduplicates shared IDs and never scans orphans", () => {
		const data = payload({
			blockOrder: ["second", "first", "second"],
			blocks: {
				first: { entities: ["alpha", "beta"] },
				second: { entities: ["beta", "beta"] },
				orphan: { entities: ["orphan"] },
			},
			entities: {
				alpha: chart({ sheetnames: ["Alpha"] }),
				orphan: chart({ sheetnames: ["PRIVATE_ORPHAN"] }),
				beta: chart({ sheetnames: ["Beta"] }),
			},
		});
		const result = required(collect(script(data)));
		expect(result.tables.map((table) => table.sheetName)).toEqual([
			"Beta",
			"Alpha",
		]);
		expect(result.tables.map((table) => table.source.path)).toEqual([
			sourcePath("beta"),
			sourcePath("alpha"),
		]);
		expect(result.truncated).toBe(false);
		expect(JSON.stringify(result)).not.toContain("PRIVATE_ORPHAN");
	});

	it("excludes explicitly hidden blocks/entities and non-CHART entities", () => {
		const normal = chart();
		const data = payload({
			blockOrder: ["hidden", "propsHidden", "visible"],
			blocks: {
				hidden: { hidden: true, entities: ["chart"] },
				propsHidden: { props: { hidden: true }, entities: ["chart"] },
				visible: {
					entities: ["hidden", "propsHidden", "text", "lowercase", "chart"],
				},
			},
			entities: {
				hidden: { ...normal, hidden: true },
				propsHidden: { ...normal, props: { ...normal.props, hidden: true } },
				text: { ...normal, type: "TEXT" },
				lowercase: { ...normal, type: "chart" },
				chart: { ...normal, hidden: false, style: { display: "none" } },
			},
		});
		expect(collect(script(data))).toEqual(collect());
	});

	it("does not infer hidden status from truthy text or CSS", () => {
		expect(
			collect(
				script(
					payload({ entities: { chart: { ...chart(), hidden: "true" } } }),
				),
			),
		).toEqual(collect());
	});

	it("escapes entity keys in exact source sheet paths", () => {
		const entityId = 'chart.["quoted"]\\\n😀';
		const result = required(
			collect(
				script(
					payload({
						blocks: { block: { entities: [entityId] } },
						entities: { [entityId]: chart(sheets([matrix(), matrix()])) },
					}),
				),
			),
		);
		expect(result.tables.map((table) => table.source.path)).toEqual([
			sourcePath(entityId, 0),
			sourcePath(entityId, 1),
		]);
		expect(result.tables.map((table) => table.source.sheetIndex)).toEqual([
			0, 1,
		]);
	});

	it("marks unresolved references and unsupported chart structures as truncated", () => {
		const result = required(
			collect(
				script(
					payload({
						blockOrder: ["absent", "malformed", "block"],
						blocks: {
							malformed: {},
							block: { entities: ["absent", "bad", "chart"] },
						},
						entities: { bad: { type: "CHART", props: {} }, chart: chart() },
					}),
				),
			),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.truncated).toBe(true);
	});

	it.each([{ blockOrder: [] }, { blockOrder: ["orphan"] }])(
		"never recovers charts from unreferenced global properties: %j",
		({ blockOrder }) => {
			expect(
				collect(
					script(
						payload({ blockOrder }, { chartData: chart().props.chartData }),
					),
				),
			).toBeUndefined();
		},
	);
});

describe("whole matrices and declared scalar cells", () => {
	it("preserves typed values, missing cells, empty text and source ordering exactly", () => {
		const sourceRows = [
			[
				null,
				{ value: null },
				{ value: "" },
				{ value: "N/A" },
				{ value: "0" },
				{ value: 0 },
				{ value: false },
				{ value: true },
			],
			[
				{ value: "  01.00  " },
				{ value: "2026-09-16" },
				{ value: "&amp;<b>raw</b>" },
				{ value: "\r\n\t\u0000" },
				{ value: -1.25 },
				{ value: "—" },
				{ value: "😀" },
				{ value: "NaN" },
			],
		];
		const result = required(collectChart({ data: [sourceRows] }));
		expect(result.tables[0].rows).toEqual(
			sourceRows.map((row) =>
				row.map((cell) =>
					cell === null
						? { kind: "null-cell" }
						: { kind: "value-cell", value: cell.value },
				),
			),
		);
		expect(result.truncated).toBe(false);
		expectFrozen(result);
	});

	it("copies no styles, source scripts, tokens, user IDs or undeclared labels", () => {
		const cell = {
			value: "declared",
			style: "PRIVATE_STYLE",
			token: "PRIVATE_TOKEN",
			user_id: "PRIVATE_USER",
		};
		const result = required(
			collectChart({
				data: [
					[
						[cell, cell],
						[cell, cell],
					],
				],
				custom: { source: "PRIVATE_SCRIPT", unit: "PRIVATE_UNIT" },
				xlabel: "PRIVATE_GLOBAL_LABEL",
				sheets_settings: [{}],
			}),
		);
		expect(result.tables[0].rows[0][0]).toEqual({
			kind: "value-cell",
			value: "declared",
		});
		expect(result.tables[0].axisLabel).toBeUndefined();
		expect(JSON.stringify(result)).not.toContain("PRIVATE_");
	});

	it.each([
		0,
		"text",
		false,
		[],
		{},
		{ style: "missing" },
		{ value: {} },
		{ value: [] },
	])("rejects the whole sheet for an unsupported cell shape: %j", (cell) => {
		const result = required(
			collectChart(
				sheets([
					[
						[cell, null],
						[null, null],
					],
					matrix(),
				]),
			),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.tables[0].source.sheetIndex).toBe(1);
		expect(result.truncated).toBe(true);
	});

	it.each([
		null,
		{},
		[],
		[[]],
		[[], []],
		[[null, null]],
		[[null], [null]],
		[[null, null], [null]],
		[[null, null], {}],
	])(
		"omits invalid matrices without padding, clipping or transposing: %j",
		(invalid) => {
			const result = required(
				collectChart(sheets([matrix(), invalid, matrix()])),
			);
			expect(result.tables.map((table) => table.source.sheetIndex)).toEqual([
				0, 2,
			]);
			expect(result.tables.map((table) => table.sheetName)).toEqual([
				"Sheet 0",
				"Sheet 2",
			]);
			expect(result.truncated).toBe(true);
		},
	);

	it.each([
		{ data: undefined },
		{ data: {} },
		{ data: [] },
		{ sheetnames: undefined },
		{ sheetnames: {} },
		{ sheetnames: [] },
		{ sheetnames: [null] },
		{ sheetnames: [1] },
		{ sheets_settings: undefined },
		{ sheets_settings: {} },
		{ sheets_settings: [] },
		{ sheets_settings: [null] },
		{ sheets_settings: [[]] },
	])(
		"does not invent names or sheet settings for invalid structures: %j",
		(overrides) => {
			expect(collectChart(overrides)).toBeUndefined();
		},
	);

	it("preserves empty sheet names and only sheet-specific axis labels", () => {
		const result = required(
			collectChart({
				...sheets([matrix(), matrix(), matrix()]),
				sheetnames: ["", "  source name  ", "third"],
				sheets_settings: [{ xlabel: "" }, {}, { xlabel: " &amp; seconds " }],
				xlabel: "not inherited",
				chart_type_nr: -2.5,
				modifier: 0.5,
			}),
		);
		expect(result.tables.map((table) => table.sheetName)).toEqual([
			"",
			"  source name  ",
			"third",
		]);
		expect(result.tables.map((table) => table.axisLabel)).toEqual([
			"",
			undefined,
			" &amp; seconds ",
		]);
		for (const table of result.tables) {
			expect(table.chartTypeNumber).toBe(-2.5);
			expect(table.modifier).toBe(0.5);
		}
		expect(result.truncated).toBe(false);
	});

	it("does not infer numeric metadata from strings or unrelated properties", () => {
		const invalid = required(
			collectChart({
				chart_type_nr: "7",
				modifier: null,
				sheets_settings: [{ xlabel: 42 }],
			}),
		);
		expect(invalid.tables[0]).not.toHaveProperty("chartTypeNumber");
		expect(invalid.tables[0]).not.toHaveProperty("modifier");
		expect(invalid.tables[0]).not.toHaveProperty("axisLabel");
		expect(invalid.truncated).toBe(true);
		const missing = required(
			collectChart({
				chart_type_nr: undefined,
				modifier: undefined,
				sheets_settings: [{}],
			}),
		);
		expect(missing.truncated).toBe(false);
		expect(missing.tables[0]).not.toHaveProperty("chartTypeNumber");
		expect(missing.tables[0]).not.toHaveProperty("modifier");
		expect(missing.tables[0]).not.toHaveProperty("axisLabel");
	});
});

describe("bounded source resources", () => {
	it("enforces the full recognized script span independently of literal size", () => {
		const base = script();
		const exact = base + " ".repeat(65_792 - base.length);
		expect(collect(exact)).toEqual(collect());
		expect(collect(`${exact} `)).toBeUndefined();
	});

	it("retains the maintained 65536-unit literal input limit", () => {
		const base = JSON.stringify(payload());
		const exact = `${base.slice(0, -1)}${" ".repeat(65_536 - base.length)}}`;
		expect(collect(`window.infographicData=${exact}`)).toEqual(collect());
		expect(
			collect(`window.infographicData=${exact.slice(0, -1)} }`),
		).toBeUndefined();
	});

	it("retains parser depth, values, entries, string and serialized output limits", () => {
		expect(collect(script(payload({}, { ignored: "x".repeat(4096) })))).toEqual(
			collect(),
		);
		expect(
			collect(script(payload({}, { ignored: "x".repeat(4097) }))),
		).toBeUndefined();
		const nested = (depth: number) =>
			`${"[".repeat(depth)}0${"]".repeat(depth)}`;
		const base = JSON.stringify(payload()).slice(0, -1);
		expect(
			collect(`window.infographicData=${base},"ignored":${nested(15)}}`),
		).toEqual(collect());
		expect(
			collect(`window.infographicData=${base},"ignored":${nested(17)}}`),
		).toBeUndefined();
		expect(
			collect(script(payload({}, { ignored: Array(256).fill(0) }))),
		).toEqual(collect());
		expect(
			collect(script(payload({}, { ignored: Array(257).fill(0) }))),
		).toBeUndefined();
		expect(
			collect(
				script(
					payload(
						{},
						{ ignored: Array.from({ length: 16 }, () => Array(256).fill(0)) },
					),
				),
			),
		).toBeUndefined();
		expect(
			collect(
				script(payload({}, { ignored: Array(20).fill("界".repeat(2000)) })),
			),
		).toBeUndefined();
	});

	it.each(["NaN", "Infinity", "1e999", "9007199254740992", "undefined"])(
		"never coerces unsupported literal numbers or values: %s",
		(value) => {
			const source = script().replace('"value":0', `"value":${value}`);
			expect(collect(source)).toBeUndefined();
		},
	);

	it("accepts strings of 256 units without trimming and omits overlong sheets or labels", () => {
		const text = "😀".repeat(128);
		const exact = required(
			collectChart({
				data: [matrix(2, 2, text)],
				sheetnames: [text],
				sheets_settings: [{ xlabel: text }],
			}),
		);
		expect(exact.tables[0].sheetName).toBe(text);
		expect(exact.tables[0].axisLabel).toBe(text);
		expect(exact.tables[0].rows[0][0]).toEqual({
			kind: "value-cell",
			value: text,
		});
		expect(exact.truncated).toBe(false);
		const overlong = `${text}x`;
		for (const overrides of [
			{ ...sheets([matrix(), matrix()]), sheetnames: ["valid", overlong] },
			sheets([matrix(), matrix(2, 2, overlong)]),
		]) {
			const result = required(collectChart(overrides));
			expect(result.tables).toHaveLength(1);
			expect(result.truncated).toBe(true);
			expect(JSON.stringify(result)).not.toContain(overlong);
		}
		const label = required(
			collectChart({ sheets_settings: [{ xlabel: overlong }] }),
		);
		expect(label.tables[0]).not.toHaveProperty("axisLabel");
		expect(label.truncated).toBe(true);
	});

	it("accepts exactly 64 rows and 8 columns, omitting oversized matrices whole", () => {
		const exact = required(collectChart(sheets([matrix(64, 8)])));
		expect(exact.tables[0].rows).toHaveLength(64);
		expect(exact.tables[0].rows.every((row) => row.length === 8)).toBe(true);
		expect(exact.truncated).toBe(false);
		for (const oversized of [matrix(65, 2), matrix(2, 9)]) {
			const result = required(collectChart(sheets([oversized, matrix()])));
			expect(result.tables).toHaveLength(1);
			expect(result.tables[0].source.sheetIndex).toBe(1);
			expect(result.truncated).toBe(true);
		}
	});

	it("limits table count to 16 across all referenced entities", () => {
		const entities = Object.fromEntries(
			Array.from({ length: 17 }, (_, index) => [`chart${index}`, chart()]),
		);
		const result = required(
			collect(
				script(
					payload({
						blocks: { block: { entities: Object.keys(entities) } },
						entities,
					}),
				),
			),
		);
		expect(result.tables).toHaveLength(16);
		expect(result.tables[15].source.path).toBe(sourcePath("chart15"));
		expect(result.truncated).toBe(true);
		const exact = required(
			collectChart(sheets(Array.from({ length: 16 }, () => matrix()))),
		);
		expect(exact.tables).toHaveLength(16);
		expect(exact.truncated).toBe(false);
	});

	it("enforces 64 aggregate rows using only leading whole matrices", () => {
		const exact = required(collectChart(sheets([matrix(32), matrix(32)])));
		expect(exact.tables).toHaveLength(2);
		expect(exact.truncated).toBe(false);
		const result = required(
			collectChart(sheets([matrix(33), matrix(32), matrix(2)])),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.tables[0].rows).toHaveLength(33);
		expect(result.truncated).toBe(true);
	});

	it("inspects at most 32 block IDs and 32 referenced IDs, including repeats", () => {
		for (const count of [32, 33]) {
			const blocks = required(
				collect(script(payload({ blockOrder: Array(count).fill("block") }))),
			);
			expect(blocks.tables).toHaveLength(1);
			expect(blocks.truncated).toBe(count === 33);
			const references = required(
				collect(
					script(
						payload({
							blocks: { block: { entities: Array(count).fill("chart") } },
						}),
					),
				),
			);
			expect(references.tables).toHaveLength(1);
			expect(references.truncated).toBe(count === 33);
		}
		const unreachable = chart({ sheetnames: ["not visited"] });
		const result = required(
			collect(
				script(
					payload({
						blockOrder: ["block", "next"],
						blocks: {
							block: { entities: Array(32).fill("chart") },
							next: { entities: ["next"] },
						},
						entities: { chart: chart(), next: unreachable },
					}),
				),
			),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.truncated).toBe(true);
	});

	it("bounds block/entity IDs at 128 units and rejects unsupported ID shapes", () => {
		const key = "x".repeat(128);
		const exact = required(
			collect(
				script(
					payload({
						blockOrder: [key],
						blocks: { [key]: { entities: [key] } },
						entities: { [key]: chart() },
					}),
				),
			),
		);
		expect(exact.truncated).toBe(false);
		expect(exact.tables[0].source.path).toBe(sourcePath(key));
		for (const invalid of [`${key}x`, "", 0, null, {}]) {
			for (const content of [
				{ blockOrder: [invalid, "block"] },
				{ blocks: { block: { entities: [invalid, "chart"] } } },
			]) {
				const result = required(collect(script(payload(content))));
				expect(result.tables).toHaveLength(1);
				expect(result.truncated).toBe(true);
			}
		}
	});

	it("enforces the 65536-byte serialized output cap after cell tagging", () => {
		const result = required(
			collectChart(
				sheets([
					matrix(32, 8, "x".repeat(100)),
					matrix(32, 8, "x".repeat(100)),
				]),
			),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.tables[0].rows).toHaveLength(32);
		expect(result.truncated).toBe(true);
		expect(bytes(result)).toBeLessThanOrEqual(65_536);
	});
});

describe("byte fitting and immutable document storage", () => {
	it("fits complete leading matrices at exact UTF-8 byte boundaries", () => {
		const data = required(
			collectChart({
				...sheets([matrix(2, 2, "😀界"), matrix()]),
				sheetnames: ["first 😀", "second"],
			}),
		);
		const prefix = {
			...data,
			tables: data.tables.slice(0, 1),
			truncated: true,
		};
		expect(fitResearchSourceChartTables(data, bytes(data))).toEqual(data);
		expect(fitResearchSourceChartTables(data, bytes(data) - 1)).toEqual(prefix);
		expect(fitResearchSourceChartTables(data, bytes(prefix))).toEqual(prefix);
		const empty = { ...data, tables: [], truncated: true };
		expect(fitResearchSourceChartTables(data, bytes(prefix) - 1)).toEqual(
			empty,
		);
		expect(fitResearchSourceChartTables(data, bytes(empty))).toEqual(empty);
		expect(
			fitResearchSourceChartTables(data, bytes(empty) - 1),
		).toBeUndefined();
		expect(fitResearchSourceChartTables(data, 0)).toBeUndefined();
		expectFrozen(required(fitResearchSourceChartTables(data, bytes(empty))));
		expect(data.tables).toHaveLength(2);
		expect(data.truncated).toBe(false);
	});

	it.each([
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"100",
		null,
	])("rejects invalid caller byte limits: %j", (limit) => {
		expect(() =>
			fitResearchSourceChartTables(required(collect()), limit as number),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});

	it("never skips an oversized first matrix to retain a smaller later one", () => {
		const data = required(
			collectChart(sheets([matrix(10, 8, "long"), matrix()])),
		);
		const later = { ...data, tables: data.tables.slice(1), truncated: true };
		const result = required(fitResearchSourceChartTables(data, bytes(later)));
		expect(result.tables).toHaveLength(0);
		expect(result.truncated).toBe(true);
	});

	it("never enlarges the global output cap for a larger caller budget", () => {
		const data = required(
			collectChart(sheets([matrix(32, 8, "x".repeat(100))])),
		);
		const doubled = { ...data, tables: [data.tables[0], data.tables[0]] };
		expect(bytes(doubled)).toBeGreaterThan(65_536);
		const result = required(
			fitResearchSourceChartTables(doubled, Number.MAX_SAFE_INTEGER),
		);
		expect(result.tables).toHaveLength(1);
		expect(result.truncated).toBe(true);
		expect(bytes(result)).toBeLessThanOrEqual(65_536);
	});

	it("keeps aggregate table and row caps when fitting caller-owned snapshots", () => {
		const small = required(collect());
		const many = { ...small, tables: Array(17).fill(small.tables[0]) };
		const limited = required(fitResearchSourceChartTables(many, 65_536));
		expect(limited.tables).toHaveLength(16);
		expect(limited.truncated).toBe(true);
		const tall = required(collectChart(sheets([matrix(33)])));
		const rows = {
			...tall,
			tables: [tall.tables[0], tall.tables[0], small.tables[0]],
		};
		const prefix = required(fitResearchSourceChartTables(rows, 65_536));
		expect(prefix.tables).toHaveLength(1);
		expect(prefix.tables[0].rows).toHaveLength(33);
		expect(prefix.truncated).toBe(true);
	});

	it("defensively copies only declared fields even when a full fit is possible", () => {
		const original = required(collect());
		const mutable = JSON.parse(JSON.stringify(original));
		mutable.secret = "PRIVATE_TOP";
		mutable.tables[0].secret = "PRIVATE_TABLE";
		mutable.tables[0].source.secret = "PRIVATE_SOURCE";
		mutable.tables[0].rows[0][0].secret = "PRIVATE_CELL";
		const result = required(fitResearchSourceChartTables(mutable, 65_536));
		expect(result).toEqual(original);
		expectFrozen(result);
		expect(result).not.toBe(mutable);
		expect(result.tables[0].rows[0][0]).not.toBe(mutable.tables[0].rows[0][0]);
		mutable.tables[0].rows[0][0].value = "changed";
		mutable.tables[0].source.offset = 999;
		mutable.tables.length = 0;
		expect(result).toEqual(original);
	});

	it("copies the route and keeps completed snapshots stable after invalidation", () => {
		const route = { id: embedId };
		const collector = new ResearchSourceChartTableCollector(route);
		route.id = otherId;
		const source = script();
		collector.add(source, 0, source.length, 0);
		const first = required(collector.finish());
		expect(first.embedId).toBe(embedId);
		expectFrozen(first);
		collector.add(source, 0, source.length, 0);
		expect(collector.finish()).toBeUndefined();
		expect(first).toEqual(collect());
	});

	it("stores isolated copies without document mutation and cleans up once on close", () => {
		const tree = new DocumentTree(url);
		const otherTree = new DocumentTree(url);
		trees.push(tree, otherTree);
		expect(researchSourceChartTables(tree)).toBeUndefined();
		const original = required(collect());
		const mutable = JSON.parse(JSON.stringify(original));
		mutable.secret = "PRIVATE_TOP";
		mutable.tables[0].rows[0][0].token = "PRIVATE_CELL";
		const cleanup = vi.spyOn(tree, "onClose");
		const keys = Reflect.ownKeys(tree);
		setResearchSourceChartTables(tree, mutable);
		const stored = required(researchSourceChartTables(tree));
		expect(stored).toEqual(original);
		expectFrozen(stored);
		mutable.tables[0].rows[0][0].value = "changed";
		mutable.tables[0].sheetName = "changed";
		mutable.tables.length = 0;
		expect(stored).toEqual(original);
		setResearchSourceChartTables(tree, original);
		setResearchSourceChartTables(tree, original);
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(Reflect.ownKeys(tree)).toEqual(keys);
		cleanup.mockRestore();
		setResearchSourceChartTables(otherTree, original);
		tree.close();
		expect(researchSourceChartTables(tree)).toBeUndefined();
		expect(researchSourceChartTables(otherTree)).toEqual(original);
		expect(() => setResearchSourceChartTables(tree, original)).toThrow(
			/closed/i,
		);
		expect(researchSourceChartTables(tree)).toBeUndefined();
		expect(stored).toEqual(original);
	});
});
