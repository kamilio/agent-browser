import { afterEach, expect, it, vi } from "vitest";
import {
	htmlSourceJsonBindingLimits,
	selectHtmlJsonBindingSource,
	validateHtmlJsonBindingSourceSelection,
} from "./html-source-json-binding.js";
import {
	htmlSourceJsonLimits,
	selectHtmlJsonSource,
} from "./html-source-json.js";
import { HtmlTokenCursor } from "./html-token-cursor.js";
import { jsonSourceSelectionLimits } from "./json-source-selection.js";

const selection = { scriptId: "data", binding: "payload", pointer: "/value" };
const script = (literal = '{"value":"Readable source"}', trailing = "") =>
	`<script id="data">const payload = ${literal};${trailing}</script>`;
const initializer = (source: string) => `<script id="data">${source}</script>`;

afterEach(() => vi.restoreAllMocks());

it("preserves exact JSON spelling and explicit UTF-16 source coordinates", () => {
	const literal =
		'{\r\n "value" : { "large":900719925474099312345, "escaped":"a\\u0062", "decimal":1.2300e+4 }\r\n}';
	const prefix = "\r\n\tconst payload\t= \n";
	const trailing = '\r\npayload.value = "Not the initial literal";';
	const source = `<!doctype html>😀\r\n<script id="data">${prefix}${literal}\t ;${trailing}</script><p>After</p>`;
	const result = selectHtmlJsonBindingSource(source, selection);
	expect(result.text).toBe(
		'{ "large":900719925474099312345, "escaped":"a\\u0062", "decimal":1.2300e+4 }',
	);
	expect(result.metadata).toMatchObject({
		kind: "html-json-binding-source-v1",
		scope: "lexical-html-source",
		valueBasis: "initial-const-json-literal",
		scriptingMode: "disabled",
		rendered: false,
		verified: false,
		...selection,
		sourceCodeUnits: source.length,
		offsetBasis: "decoder-output-utf16",
		literal: { offsetBasis: "decoder-output-utf16" },
		jsonOffsetBasis: "literal-relative-utf16",
		json: {
			pointer: "/value",
			duplicateMembers: "rejected",
			valueKind: "object",
			sourceCodeUnits: literal.length,
		},
		trailingSource: { evaluated: false, offsetBasis: "decoder-output-utf16" },
	});
	expect(source.slice(result.metadata.scriptStart)).toMatch(/^<script /);
	expect(source.slice(result.metadata.start, result.metadata.end)).toBe(
		`${prefix}${literal}\t ;${trailing}`,
	);
	expect(
		source.slice(result.metadata.literal.start, result.metadata.literal.end),
	).toBe(literal);
	expect(
		source.slice(
			result.metadata.literal.start + result.metadata.json.start,
			result.metadata.literal.start + result.metadata.json.end,
		),
	).toBe(result.text);
	expect(
		source.slice(
			result.metadata.trailingSource.start,
			result.metadata.trailingSource.end,
		),
	).toBe(trailing);
	expect(source.slice(result.metadata.end)).toMatch(/^<\/script>/);
	for (const value of [
		result,
		result.metadata,
		result.metadata.literal,
		result.metadata.json,
		result.metadata.trailingSource,
		result.metadata.counters,
	])
		expect(Object.isFrozen(value)).toBe(true);
});

it.each([
	{ literal: '{ "value": true }', pointer: "", expected: '{ "value": true }' },
	{
		literal: '[1,{"value":[false,null]}]',
		pointer: "/1/value/1",
		expected: "null",
	},
	{
		literal: '{"a/b":{"~x":[0,null]}}',
		pointer: "/a~1b/~0x/1",
		expected: "null",
	},
	{
		literal: '{"\\u0076alue":"&amp;"}',
		pointer: "/value",
		expected: '"&amp;"',
	},
	{ literal: '{"value":-0.00e-2}', pointer: "/value", expected: "-0.00e-2" },
	{ literal: '{"value":[true,false]}', pointer: "/value/0", expected: "true" },
	{ literal: "[]", pointer: "", expected: "[]" },
])(
	"preserves selected JSON lexical spelling %#",
	({ literal, pointer, expected }) => {
		expect(
			selectHtmlJsonBindingSource(script(literal), { ...selection, pointer })
				.text,
		).toBe(expected);
	},
);

it("scans nested braces and escaped quotes without ending the literal early", () => {
	const value = [
		"}];{}[",
		'quote " then }',
		"backslash \\",
		{ nested: ["😀", '\\"'] },
	];
	const literal = JSON.stringify({ value, ignored: { closing: "}" } });
	const result = selectHtmlJsonBindingSource(script(literal), selection);
	expect(JSON.parse(result.text)).toEqual(value);
	expect(result.text).toBe(JSON.stringify(value));
});

it.each([
	{ literal: '{"value":"\\u0061\\n\\t\\uD83D\\uDE00"}', expected: "a\n\t😀" },
	{ literal: '{"value":false}', expected: false },
	{ literal: '{"value":null}', expected: null },
	{ literal: '{"value":1.250e2}', expected: 125 },
])("retains selected scalar decoding semantics %#", ({ literal, expected }) => {
	const result = selectHtmlJsonBindingSource(script(literal), selection);
	expect(JSON.parse(result.text)).toEqual(expected);
});

it.each([
	'payload.value = "Changed later";',
	'const payload = {"value":"A second declaration"};',
	'throw new Error("Must not execute");',
	"window.Fixture = Object.assign({}, payload);",
	'function invalid later source {{{ "unterminated',
	"/* unrelated comment */\n",
	"",
])("does not evaluate or validate trailing script source %#", (trailing) => {
	const source = script(undefined, trailing);
	const result = selectHtmlJsonBindingSource(source, selection);
	expect(result.text).toBe('"Readable source"');
	expect(result.metadata.trailingSource.evaluated).toBe(false);
	expect(
		source.slice(
			result.metadata.trailingSource.start,
			result.metadata.trailingSource.end,
		),
	).toBe(trailing);
});

it.each([
	'const different = {"value":1};',
	'const payloadExtra = {"value":1};',
	'const Payload = {"value":1};',
	'const payload = {"value":1} + sideEffect();',
	'const payload = {"value":1}();',
	'const payload = {"value":1}.value;',
	'const payload = {"value":1}["value"];',
	'const payload = {"value":1} || {};',
	'const payload = {"value":1}, extra = {};',
	'const payload = ({"value":1});',
	'const payload = build({"value":1});',
	"const payload = true;",
	'const payload = "string";',
	"const payload = 1;",
	"const payload = null;",
	'const payload = {"value":1}',
	'const payload = {"value":1}\n',
	'const payload = {"value":1} /* before terminator */;',
	'const payload = /* before literal */ {"value":1};',
	'const /* before binding */ payload = {"value":1};',
	'const payload /* before equals */ = {"value":1};',
	'// before declaration\nconst payload = {"value":1};',
	'/* before declaration */ const payload = {"value":1};',
	'"use strict"; const payload = {"value":1};',
	'let payload = {"value":1};',
	'var payload = {"value":1};',
	'export const payload = {"value":1};',
	'import value from "module"; const payload = {"value":1};',
	'const {payload} = {"payload":{}};',
	"const [payload] = [{}];",
	'const pay\\u006coad = {"value":1};',
	'constpayload = {"value":1};',
	'const\u00a0payload = {"value":1};',
	'\ufeffconst payload = {"value":1};',
	'const payload = {"value":1}\u00a0;',
	'const payload == {"value":1};',
	'const payload => {"value":1};',
])("rejects nonliteral or noninitial binding syntax %#", (body) => {
	expect(() =>
		selectHtmlJsonBindingSource(initializer(body), selection),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	'{"value":1,"value":2}',
	'{"value":1,"\\u0076alue":2}',
	'{"value":1,"other":{"same":1,"same":2}}',
	'{"value":1,"other":[{"bad":undefined}]}',
	'{"value":NaN}',
	'{"value":1,}',
	"{value:1}",
	'{"value":/* comment */1}',
	'{"value":"\\x41"}',
	'{"value":"\\u00zz"}',
	'{"value":"raw\nnewline"}',
	'{"value":01}',
	'{"value":1e}',
	'{"value":{]}',
	'{"value":[}',
	'{"value":1',
	'{"value":"unterminated}',
	'{"value":"escape\\',
	'{"value":"</script>"}',
])("strictly validates the entire JSON literal %#", (literal) => {
	expect(() => selectHtmlJsonBindingSource(script(literal), selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("does not activate markup, URLs or HTML entities inside selected strings", () => {
	const literal =
		'{"value":"<img src=evil onerror=alert(1)> &amp; javascript:alert(1)"}';
	expect(selectHtmlJsonBindingSource(script(literal), selection).text).toBe(
		'"<img src=evil onerror=alert(1)> &amp; javascript:alert(1)"',
	);
});

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
])("ignores script-looking text in other lexical regions %#", (source) => {
	expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
		expect.objectContaining({ code: "not-found" }),
	);
});

it("skips unrelated script strings and long raw regions across cursor windows", () => {
	const source = `<script>const text = '<script id="data">';${" ".repeat(150000)}</script><style>${" ".repeat(150000)}</style>${script()}`;
	const result = selectHtmlJsonBindingSource(source, selection);
	expect(result.text).toBe('"Readable source"');
	expect(result.metadata.counters.workUnits).toBeGreaterThan(300000);
});

it.each(["template", "noscript", "div hidden"])(
	"uses scripting-disabled lexical source rules inside %s",
	(wrapper) => {
		const source = `<${wrapper}>${script()}</${wrapper.split(" ")[0]}>`;
		expect(selectHtmlJsonBindingSource(source, selection).text).toBe(
			'"Readable source"',
		);
		expect(() =>
			selectHtmlJsonBindingSource(source + script(), selection),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([
	`${script()}${script()}`,
	`${script()}<div id="data">Duplicate</div>`,
	`<div id="data">Wrong element</div>${script()}`,
	`<script id="data"/>const payload={"value":1};</script>`,
	`<script id="data" src="/asset">const payload={"value":1};</script>`,
	`<script id="data" src="">const payload={"value":1};</script>`,
	`<script id="data" id="other">const payload={"value":1};</script>`,
	`<script id="data" type="text/javascript" type="module">const payload={"value":1};</script>`,
	`<script id="data" class="one" class="two">const payload={"value":1};</script>`,
	`<script id="data">const payload={"value":1};`,
	`<script id="data">const payload={"value":1};</script`,
])(
	"rejects ambiguous, external or incomplete script identities %#",
	(source) => {
		expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([
	"module",
	"application/json",
	"application/ld+json",
	"text/plain",
	"text/javascript; charset=utf-8",
	"",
	" ",
])("rejects an explicit nonclassic MIME %j", (type) => {
	const source = `<script id="data" type="${type}">const payload={"value":1};</script>`;
	expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each([
	"text/javascript",
	"application/javascript",
	" APPLICATION/JAVASCRIPT ",
])(
	"accepts explicit classic MIME %j and entity-decoded case-sensitive IDs",
	(type) => {
		const source = `<SCRIPT id="d&#97;ta" type="${type}">const payload={"value":1};</SCRIPT>`;
		expect(selectHtmlJsonBindingSource(source, selection).text).toBe("1");
		expect(() =>
			selectHtmlJsonBindingSource(source, { ...selection, scriptId: "DATA" }),
		).toThrow(expect.objectContaining({ code: "not-found" }));
	},
);

it("detects duplicate IDs even after long later raw regions", () => {
	const source = `${script()}<style>${"x".repeat(70000)}</style>${script()}`;
	expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(
	[
		null,
		[],
		"data",
		{},
		{ scriptId: "data", pointer: "/value" },
		{ ...selection, extra: true },
		{ ...selection, [Symbol("extra")]: true },
		{ ...selection, scriptId: "" },
		{ ...selection, scriptId: "two words" },
		{ ...selection, scriptId: "data\u202e" },
		{ ...selection, scriptId: "x".repeat(257) },
		{ ...selection, binding: "" },
		{ ...selection, binding: 7 },
		{ ...selection, binding: "7data" },
		{ ...selection, binding: "has-dash" },
		{ ...selection, binding: "name.value" },
		{ ...selection, binding: "two words" },
		{ ...selection, binding: "é" },
		{ ...selection, binding: "\\u0061" },
		{ ...selection, binding: "a\u200b" },
		{ ...selection, binding: "x".repeat(257) },
		{ ...selection, pointer: 7 },
		{ ...selection, pointer: "bad" },
		{ ...selection, pointer: "/bad~2" },
		Object.create(selection),
	].map((value) => ({ value })),
)("rejects invalid selection descriptors and values %#", ({ value }) => {
	expect(() => validateHtmlJsonBindingSourceSelection(value)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["scriptId", "binding", "pointer"])(
	"rejects a %s getter without invoking it",
	(field) => {
		const get = vi.fn(() => "data");
		const value = Object.defineProperty({ ...selection }, field, { get });
		expect(() => validateHtmlJsonBindingSourceSelection(value)).toThrow();
		expect(() => selectHtmlJsonBindingSource(script(), value)).toThrow();
		expect(get).not.toHaveBeenCalled();
	},
);

it("accepts null-prototype and nonenumerable own data descriptors", () => {
	const value = Object.create(null, {
		scriptId: { value: "data" },
		binding: { value: "payload" },
		pointer: { value: "/value" },
	});
	const validated = validateHtmlJsonBindingSourceSelection(value);
	expect(validated).toEqual(selection);
	expect(Object.isFrozen(validated)).toBe(true);
	expect(selectHtmlJsonBindingSource(script(), value).text).toBe(
		'"Readable source"',
	);
});

it.each([
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"let",
	"yield",
	"await",
	"implements",
	"interface",
	"package",
	"private",
	"protected",
	"public",
	"static",
	"eval",
	"arguments",
])("rejects reserved or context-restricted binding %s", (binding) => {
	expect(() =>
		validateHtmlJsonBindingSourceSelection({ ...selection, binding }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		selectHtmlJsonBindingSource(
			`<script id="data">const ${binding} = {"value":1};</script>`,
			{ scriptId: "data", binding, pointer: "/value" },
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"$data_1",
	"_data$2",
	"nullData",
	"class$",
	"let_",
	"Null",
	"x".repeat(256),
])("accepts a bounded ASCII binding %s", (binding) => {
	const source = initializer(`const ${binding}={"value":1};`);
	expect(
		selectHtmlJsonBindingSource(source, { ...selection, binding }).text,
	).toBe("1");
});

it("does not coerce source or selection values and rejects invalid checkpoints", () => {
	const coerce = vi.fn(() => "payload");
	expect(() =>
		selectHtmlJsonBindingSource({ toString: coerce } as never, selection),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		validateHtmlJsonBindingSourceSelection({
			...selection,
			binding: { toString: coerce },
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(coerce).not.toHaveBeenCalled();
	expect(() =>
		selectHtmlJsonBindingSource(script(), selection, true as never),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("reports absent pointers without selecting the whole literal instead", () => {
	expect(() =>
		selectHtmlJsonBindingSource(script('{"other":1}'), selection),
	).toThrow(expect.objectContaining({ code: "not-found" }));
});

it.each(["/".repeat(129), `/${"x".repeat(4096)}`])(
	"retains JSON pointer resource bounds %#",
	(pointer) => {
		expect(() =>
			validateHtmlJsonBindingSourceSelection({ ...selection, pointer }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("retains existing HTML JSON limits and selects small output from large bindings", () => {
	expect(htmlSourceJsonBindingLimits).toEqual({
		...htmlSourceJsonLimits,
		maxBindingCodeUnits: 256,
	});
	expect(Object.isFrozen(htmlSourceJsonBindingLimits)).toBe(true);
	const literal = `{"ignored":"${"x".repeat(300000)}","value":"Small result"}`;
	const result = selectHtmlJsonBindingSource(script(literal), selection);
	expect(result.text).toBe('"Small result"');
	expect(result.metadata.json.sourceCodeUnits).toBe(literal.length);
});

it("accepts exact script and UTF-8 output bounds but rejects overflow", () => {
	const body = 'const payload={"value":1};';
	const remaining =
		htmlSourceJsonBindingLimits.maxScriptCodeUnits - body.length;
	expect(
		selectHtmlJsonBindingSource(
			initializer(body + " ".repeat(remaining)),
			selection,
		).text,
	).toBe("1");
	expect(() =>
		selectHtmlJsonBindingSource(
			initializer(body + " ".repeat(remaining + 1)),
			selection,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	const text = "x".repeat(htmlSourceJsonBindingLimits.maxOutputBytes - 2);
	expect(
		selectHtmlJsonBindingSource(script(`{"value":"${text}"}`), selection).text,
	).toBe(`"${text}"`);
	expect(() =>
		selectHtmlJsonBindingSource(script(`{"value":"${text}x"}`), selection),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("enforces source, script, multibyte output and token budgets", () => {
	for (const source of [
		" ".repeat(htmlSourceJsonBindingLimits.maxSourceCodeUnits + 1),
		script(
			`{"value":"${"x".repeat(htmlSourceJsonBindingLimits.maxScriptCodeUnits)}"}`,
		),
		script(`{"value":"${"😀".repeat(16384)}"}`),
		"<br>".repeat(htmlSourceJsonBindingLimits.maxTokens + 1) + script(),
	]) {
		expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
});

it("retains strict JSON depth and node limits outside the selected value", () => {
	const nesting = jsonSourceSelectionLimits.maxDepth + 2;
	const deep = `${"[".repeat(nesting)}0${"]".repeat(nesting)}`;
	const many = `[${Array(jsonSourceSelectionLimits.maxNodes).fill("0").join(",")}]`;
	for (const literal of [deep, `{"value":1,"ignored":${many}}`]) {
		expect(() =>
			selectHtmlJsonBindingSource(script(literal), selection),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it.each(["before", "after"])(
	"retains skipped RCDATA window limits %s",
	(side) => {
		const rcdata = `<textarea>${"a".repeat(65536)}</textarea>`;
		const source = side === "before" ? rcdata + script() : script() + rcdata;
		expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("closes cursors on success, missing data, malformed literals and cancellation", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	selectHtmlJsonBindingSource(script(), selection);
	expect(() =>
		selectHtmlJsonBindingSource("<p>No data</p>", selection),
	).toThrow();
	expect(() => selectHtmlJsonBindingSource(script("{"), selection)).toThrow();
	let calls = 0;
	expect(() =>
		selectHtmlJsonBindingSource(script(), selection, () => {
			if (++calls === 3) throw new Error("Synthetic cancellation");
		}),
	).toThrow("Synthetic cancellation");
	expect(close).toHaveBeenCalledTimes(4);
	for (const cursor of close.mock.contexts) {
		expect(cursor).toBeInstanceOf(HtmlTokenCursor);
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
	}
});

it("honors cancellation during the bounded literal scan and closes the cursor", () => {
	const originalNext = HtmlTokenCursor.prototype.next;
	let htmlFinished = false;
	vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
		this: HtmlTokenCursor,
	) {
		const token = originalNext.call(this);
		if (token === undefined) htmlFinished = true;
		return token;
	});
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	let calls = 0;
	expect(() =>
		selectHtmlJsonBindingSource(
			script(`{"value":"${"x".repeat(10000)}"}`),
			selection,
			() => {
				if (htmlFinished && ++calls === 5)
					throw new Error("Literal scan cancelled");
			},
		),
	).toThrow("Literal scan cancelled");
	expect(close).toHaveBeenCalledTimes(1);
	for (const cursor of close.mock.contexts)
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
});

it("honors cancellation before constructing a cursor", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	expect(() =>
		selectHtmlJsonBindingSource(script(), selection, () => {
			throw new Error("Already cancelled");
		}),
	).toThrow("Already cancelled");
	expect(close).not.toHaveBeenCalled();
});

it("retains tokenizer timeout limits and constructor cleanup", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(10001);
	expect(() => selectHtmlJsonBindingSource(script(), selection)).toThrow(
		expect.objectContaining({ code: "timeout" }),
	);
	expect(close).toHaveBeenCalled();
	for (const cursor of close.mock.contexts)
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
});

it("leaves the existing application/json selector and MIME contract unchanged", () => {
	const oldSelection = { scriptId: "data", pointer: "/value" };
	const source =
		'<script id="data" type="application/json">{"value":"Unchanged"}</script>';
	const before = selectHtmlJsonSource(source, oldSelection);
	expect(before.text).toBe('"Unchanged"');
	expect(before.metadata.kind).toBe("html-json-script-source-v1");
	expect(() => selectHtmlJsonBindingSource(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => selectHtmlJsonSource(script(), oldSelection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(selectHtmlJsonSource(source, oldSelection)).toEqual(before);
});
