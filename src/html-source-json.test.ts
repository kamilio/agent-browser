import { afterEach, expect, it, vi } from "vitest";
import { HtmlTokenCursor } from "./html-token-cursor.js";
import {
	htmlSourceJsonLimits,
	selectHtmlJsonSource,
	validateHtmlJsonSourceSelection,
} from "./html-source-json.js";

const selection = { scriptId: "data", pointer: "/value" };
const script = (json = '{"value":"Readable source"}') =>
	`<script id="data" type="application/json">${json}</script>`;

afterEach(() => vi.restoreAllMocks());

it("selects exact JSON text and locates it in unchanged decoded HTML", () => {
	const source = `<!doctype html>\r\n<title>Source</title>${script(
		'{\r\n "value" : { "large": 900719925474099312345, "escaped":"a\\u0062", "decimal":1.2300e+4 }\r\n}',
	)}<p>After</p>`;
	const result = selectHtmlJsonSource(source, selection);
	expect(result.text).toBe(
		'{ "large": 900719925474099312345, "escaped":"a\\u0062", "decimal":1.2300e+4 }',
	);
	expect(result.metadata).toMatchObject({
		kind: "html-json-script-source-v1",
		scope: "lexical-html-source",
		rendered: false,
		verified: false,
		...selection,
		offsetBasis: "decoder-output-utf16",
		sourceCodeUnits: source.length,
		json: {
			pointer: "/value",
			duplicateMembers: "rejected",
			valueKind: "object",
		},
	});
	expect(source.slice(result.metadata.scriptStart)).toMatch(/^<script /);
	expect(
		source.slice(
			result.metadata.start + result.metadata.json.start,
			result.metadata.start + result.metadata.json.end,
		),
	).toBe(result.text);
	expect(source.slice(result.metadata.end)).toMatch(/^<\/script>/);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.metadata)).toBe(true);
	expect(Object.isFrozen(result.metadata.counters)).toBe(true);
	expect(Object.isFrozen(result.metadata.json)).toBe(true);
});

it.each([
	{ json: '{ "value": true }', pointer: "", expected: '{ "value": true }' },
	{ json: '{"a/b":{"~x":[0,null]}}', pointer: "/a~1b/~0x/1", expected: "null" },
	{ json: '{"\\u0076alue":"&amp;"}', pointer: "/value", expected: '"&amp;"' },
	{ json: '{"value":-0.00e-2}', pointer: "/value", expected: "-0.00e-2" },
	{ json: '{"value":[true,false]}', pointer: "/value/0", expected: "true" },
])(
	"preserves selected JSON lexical spelling %#",
	({ json, pointer, expected }) => {
		expect(
			selectHtmlJsonSource(script(json), { ...selection, pointer }).text,
		).toBe(expected);
	},
);

it.each([
	`<!--${script()}-->`,
	`<div title='${script()}'>Attribute only</div>`,
	`<style>${script()}</style>`,
	`<textarea>${script()}</textarea>`,
	`<title>${script()}</title>`,
	`<xmp>${script()}</xmp>`,
	`<iframe>${script()}</iframe>`,
	`<noembed>${script()}</noembed>`,
	`<noframes>${script()}</noframes>`,
	`<plaintext>${script()}`,
])(
	"does not select an apparent script inside another lexical region %#",
	(source) => {
		expect(() => selectHtmlJsonSource(source, selection)).toThrow(
			expect.objectContaining({ code: "not-found" }),
		);
	},
);

it("skips raw script strings and continues to the actual data token", () => {
	const source = `<script>const text = '<script id="data" type="application/json">';</script>${script()}`;
	expect(selectHtmlJsonSource(source, selection).text).toBe(
		'"Readable source"',
	);
});

it("skips long unrelated raw regions across cursor windows", () => {
	const source = `<style>${" ".repeat(150000)}</style><script>${" ".repeat(150000)}</script>${script()}`;
	const result = selectHtmlJsonSource(source, selection);
	expect(result.text).toBe('"Readable source"');
	expect(result.metadata.counters.workUnits).toBeGreaterThan(300000);
});

it("selects from a large inert JSON block without requiring a large output", () => {
	const result = selectHtmlJsonSource(
		script(`{"ignored":"${"x".repeat(300000)}","value":"Small result"}`),
		selection,
	);
	expect(result.text).toBe('"Small result"');
	expect(result.metadata.json.sourceCodeUnits).toBeGreaterThan(300000);
});

it("treats selection as source rather than visible DOM content", () => {
	const result = selectHtmlJsonSource(
		`<template hidden>${script()}</template>`,
		selection,
	);
	expect(result.text).toBe('"Readable source"');
	expect(result.metadata).toMatchObject({
		scope: "lexical-html-source",
		rendered: false,
	});
});

it("declares scripting-disabled tokenization for noscript source markup", () => {
	const result = selectHtmlJsonSource(
		`<noscript>${script()}</noscript>`,
		selection,
	);
	expect(result.text).toBe('"Readable source"');
	expect(result.metadata.scriptingMode).toBe("disabled");
	expect(() =>
		selectHtmlJsonSource(
			`<noscript>${script()}</noscript>${script()}`,
			selection,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each(["before", "after"])(
	"retains the skipped RCDATA cursor-window bound %s",
	(side) => {
		const rcdata = `<textarea>${"a".repeat(65536)}</textarea>`;
		const source = side === "before" ? rcdata + script() : script() + rcdata;
		expect(() => selectHtmlJsonSource(source, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each([
	`${script()}${script()}`,
	`${script()}<div id="data">Duplicate</div>`,
	`<div id="data">Not a script</div>${script()}`,
	'<script id="data" type="application/json"/>',
	'<script id="data" type="application/json" src="/asset">{"value":1}</script>',
	'<script id="data" type="text/javascript">{"value":1}</script>',
	'<script id="data" type="application/ld+json">{"value":1}</script>',
	'<script id="data">{"value":1}</script>',
	'<script id="data" type="application/json; charset=utf-8">{"value":1}</script>',
	'<script id="data" id="other" type="application/json">{"value":1}</script>',
	'<script id="data" type="application/json" type="text/javascript">{"value":1}</script>',
	'<script id="data" type="application/json">{"value":1}',
])("rejects ambiguous, non-data or incomplete script source %#", (source) => {
	expect(() => selectHtmlJsonSource(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("accepts explicit MIME whitespace/case and exact entity-decoded script IDs", () => {
	const source =
		'<SCRIPT id="d&#97;ta" type=" APPLICATION/JSON ">{"value":1}</SCRIPT>';
	expect(selectHtmlJsonSource(source, selection).text).toBe("1");
	expect(() =>
		selectHtmlJsonSource(source, { ...selection, scriptId: "DATA" }),
	).toThrow(expect.objectContaining({ code: "not-found" }));
});

it.each([
	'{"value":1,"value":2}',
	'{"value":1,"\\u0076alue":2}',
	'{"value":1,"other":{"same":1,"same":2}}',
	'{"value":1} trailing',
	'{"value":undefined}',
	'{"value":NaN}',
	'{"value":1,}',
	'/* comment */ {"value":1}',
	'{"value":"</script>"}',
])(
	"rejects invalid or ambiguous complete JSON even outside the selected value %#",
	(json) => {
		expect(() => selectHtmlJsonSource(script(json), selection)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it("does not activate markup or URLs stored in selected JSON strings", () => {
	const json =
		'{"value":"<img src=evil onerror=alert(1)> javascript:alert(1)"}';
	expect(selectHtmlJsonSource(script(json), selection).text).toBe(
		'"<img src=evil onerror=alert(1)> javascript:alert(1)"',
	);
});

it.each(
	[
		null,
		{},
		{ scriptId: "data" },
		{ ...selection, extra: true },
		{ ...selection, scriptId: "" },
		{ ...selection, scriptId: "two words" },
		{ ...selection, scriptId: "data\u202e" },
		{ ...selection, scriptId: "x".repeat(257) },
		{ ...selection, pointer: "bad" },
		{ ...selection, pointer: "/bad~2" },
	].map((value) => ({ value })),
)("rejects invalid selection input %#", ({ value }) => {
	expect(() => validateHtmlJsonSourceSelection(value)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("rejects selection accessors without invoking them", () => {
	const get = vi.fn(() => "data");
	const value = Object.defineProperty({ pointer: "/value" }, "scriptId", {
		get,
	});
	expect(() => validateHtmlJsonSourceSelection(value)).toThrow();
	expect(get).not.toHaveBeenCalled();
});

it("closes the cursor on success, missing data, invalid JSON and cancellation", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	selectHtmlJsonSource(script(), selection);
	expect(() => selectHtmlJsonSource("<p>No data</p>", selection)).toThrow();
	expect(() => selectHtmlJsonSource(script("{"), selection)).toThrow();
	let calls = 0;
	expect(() =>
		selectHtmlJsonSource(script(), selection, () => {
			if (++calls === 3) throw new Error("Synthetic cancellation");
		}),
	).toThrow("Synthetic cancellation");
	expect(close).toHaveBeenCalledTimes(4);
	for (const cursor of close.mock.contexts) {
		expect(cursor).toBeInstanceOf(HtmlTokenCursor);
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
	}
});

it("enforces source, script, UTF-8 output and token budgets", () => {
	for (const source of [
		" ".repeat(htmlSourceJsonLimits.maxSourceCodeUnits + 1),
		script(
			`{"value":"${"x".repeat(htmlSourceJsonLimits.maxScriptCodeUnits)}"}`,
		),
		script(`{"value":"${"😀".repeat(16384)}"}`),
		"<br>".repeat(htmlSourceJsonLimits.maxTokens + 1) + script(),
	]) {
		expect(() => selectHtmlJsonSource(source, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
});

it("checks duplicate IDs after the selected value rather than returning early", () => {
	const source = `${script()}<style>${"x".repeat(70000)}</style>${script()}`;
	expect(() => selectHtmlJsonSource(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});
