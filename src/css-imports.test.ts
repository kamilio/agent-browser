import { expect, it } from "vitest";
import {
	cssImportLimits,
	parseCssImports,
	type CssImportOptions,
} from "./css-imports.js";
import { AgentBrowserError } from "./errors.js";

it.each([
	['"base.css"', "base.css"],
	["'base.css'", "base.css"],
	["url(base.css)", "base.css"],
	['URL("base.css")', "base.css"],
	["url( 'base.css' )", "base.css"],
	["url(\t\r\nbase.css \f)", "base.css"],
	['url("base.css"/**/)', "base.css"],
	[String.raw`u\72l(base.css)`, "base.css"],
	[String.raw`"b\61 se.css"`, "base.css"],
	[String.raw`url(b\000061se.css)`, "base.css"],
	[String.raw`url(a\ b\)c.css)`, "a b)c.css"],
	[String.raw`"a\"b.css"`, 'a"b.css'],
	[String.raw`'a\'b.css'`, "a'b.css"],
	[String.raw`"a\\b.css"`, "a\\b.css"],
	[String.raw`"\0\d800\110000.css"`, "\ufffd\ufffd\ufffd.css"],
	[String.raw`"\1f680.css"`, "🚀.css"],
	['"a\u0000\ud800.css"', "a\ufffd\ufffd.css"],
	["url(a\u0000\udfff.css)", "a\ufffd\ufffd.css"],
	['"🚀.css"', "🚀.css"],
	['"a/*literal*/b.css"', "a/*literal*/b.css"],
	["url(a/*literal*/b.css)", "a/*literal*/b.css"],
	['"data:text/css,body{color:red};"', "data:text/css,body{color:red};"],
	["url(data:text/css,a;b)", "data:text/css,a;b"],
])("decodes the import URL token %s", (token, url) => {
	const source = `@import ${token};`;
	const result = parseCssImports(source);
	expect(result.imports).toEqual([
		{ start: 0, end: source.length, url, media: "" },
	]);
	expect(result.issues).toEqual({});
});

it.each(["\n", "\r", "\r\n", "\f"])(
	"handles string continuation and hex escape whitespace %j",
	(lineBreak) => {
		expect(
			parseCssImports(`@import "ba\\${lineBreak}se.css";`).imports[0].url,
		).toBe("base.css");
		expect(
			parseCssImports(`@import url(b\\61${lineBreak}se.css);`).imports[0].url,
		).toBe("base.css");
		expect(parseCssImports(`@import "a${lineBreak}b";`).imports).toEqual([]);
		expect(parseCssImports(`@import url(a\\${lineBreak}b);`).imports).toEqual(
			[],
		);
	},
);

it.each(["@IMPORT", String.raw`@\69mport`, String.raw`@im\70 ort`])(
	"recognizes the at-keyword %s with trivia",
	(keyword) => {
		const source = `/* lead */\n${keyword}/**/"base.css"/**/;`;
		expect(parseCssImports(source).imports).toEqual([
			{ start: 0, end: source.length, url: "base.css", media: "" },
		]);
	},
);

it("preserves scanner offsets across BOM, comments and charset statements", () => {
	const prefix = '\ufeff/* first */@charset "UTF-8";';
	const first = '\n/* second */@import "base.css";';
	const between = '\n@charset "UTF-8";';
	const second = "\n@import url(theme.css) screen;";
	const source = prefix + first + between + second;
	const result = parseCssImports(source);
	expect(result.imports).toEqual([
		{
			start: prefix.length,
			end: prefix.length + first.length,
			url: "base.css",
			media: "",
		},
		{
			start: prefix.length + first.length + between.length,
			end: source.length,
			url: "theme.css",
			media: "screen",
		},
	]);
	expect(source.slice(result.imports[0].start, result.imports[0].end)).toBe(
		first,
	);
	expect(parseCssImports('\ufeff@import "base.css";').imports[0].start).toBe(0);
});

it.each([
	"@import;",
	'@import "";',
	'@import " \t";',
	"@import url();",
	"@import url( );",
	'@import url("");',
	"@import base.css;",
	'@import url ("base.css");',
	'@import "base.css"',
	'@import "base.css;',
	'@import "base.css\\',
	"@import url(base.css;",
	"@import url(base.css\\);",
	"@import url(a b.css);",
	"@import url(a(b.css));",
	'@import url(a"b.css);',
	'@import url("a.css" junk);',
	'@import url(/**/"a.css");',
	"@import url(a\u0001.css);",
	"@import url(a\u007f.css);",
	'@import "base.css" { body {} }',
	'@import "base.css"/**',
])("rejects malformed import without inventing a URL: %j", (source) => {
	const result = parseCssImports(source);
	expect(result.imports).toEqual([]);
	expect(result.issues["invalid-css-import"]).toBe(1);
});

it.each([
	'@import "base.css");',
	"@import url(base.css));",
	'@import "base.css" ];',
	'@import "base.css" "other.css";',
	'@import "base.css" screen,;',
	'@import "base.css" screen and;',
	'@import "base.css" (unknown-feature: yes);',
	'@import "base.css" (width > 1px), (unknown-feature: yes);',
])("rejects unsupported or malformed media without fetching: %j", (source) => {
	const result = parseCssImports(source);
	expect(result.imports).toEqual([]);
	expect(result.issues["unsupported-css-import-media"]).toBe(1);
});

it.each([
	"screen",
	"print",
	"not all",
	"screen, print",
	"screen and (min-width: 20px)",
	"(width >= 20px) and (orientation: landscape)",
	"screen/**/and (min-width: 20px)",
])("retains supported media without evaluating a viewport: %s", (media) => {
	const result = parseCssImports(`@import "base.css"  ${media} \t;`);
	expect(result.imports[0].media).toBe(media);
	expect(result.issues).toEqual({});
});

it.each([
	"layer",
	"layer(theme)",
	"LAYER(theme) screen",
	String.raw`l\61yer(theme)`,
	"supports(display: grid)",
	String.raw`\73upports(display: block)`,
	"/**/supports((display: block)) screen",
])("rejects unsupported import modifier %s", (modifier) => {
	const result = parseCssImports(`@import "base.css" ${modifier};`);
	expect(result.imports).toEqual([]);
	expect(result.issues).toEqual({ "unsupported-css-import-modifier": 1 });
});

it("does not reopen ordering after a layer statement or late charset", () => {
	const result = parseCssImports(
		'@import "first.css"; @layer reset, theme; @charset "UTF-8"; @import "late.css";',
	);
	expect(result.imports.map((entry) => entry.url)).toEqual(["first.css"]);
	expect(result.issues).toEqual({
		"unsupported-css-import-layer-order": 1,
		"late-css-import": 1,
	});
});

it.each([
	"body { color: red }",
	"@unknown;",
	"@namespace url(example);",
	"@layer theme {}",
	"}",
])("closes import ordering after %s", (rule) => {
	const result = parseCssImports(`${rule} @import "late.css";`);
	expect(result.imports).toEqual([]);
	expect(result.issues["late-css-import"]).toBe(1);
});

it("skips nested blocks, strings and functions without exposing nested imports", () => {
	const result = parseCssImports(
		'@import "first.css"; @media screen { @import "nested.css"; body { content: "};@import fake;"; thing: fn(1; 2); } @supports (display: block) { @import "deep.css"; } } @import "late.css";',
	);
	expect(result.imports.map((entry) => entry.url)).toEqual(["first.css"]);
	expect(result.issues).toEqual({ "late-css-import": 1 });
});

it("does not confuse identifiers or URL-looking declaration text with imports", () => {
	expect(parseCssImports('@imported "other.css";').imports).toEqual([]);
	const source =
		'@import "base.css"; body{background-image:url(https://www.w3.org/StyleSheets/TR/2016/logos/WD)}';
	expect(parseCssImports(source).imports).toEqual([
		{ start: 0, end: 19, url: "base.css", media: "" },
	]);
});

it("reports scanner errors and recovers only at scanner statement boundaries", () => {
	const source = '@import bad; @import "good.css"; /* unterminated';
	const result = parseCssImports(source);
	expect(result.imports.map((entry) => entry.url)).toEqual(["good.css"]);
	expect(result.issues).toEqual({
		"invalid-css-import": 1,
		"unterminated-css-comment": 1,
	});
	expect(parseCssImports('body { @import "nested.css";').issues).toEqual({
		"unterminated-css-rule": 1,
	});
	expect(parseCssImports('@import "unterminated;').issues).toEqual({
		"unterminated-css-string": 1,
		"invalid-css-import": 1,
	});
});

function expectError(operation: () => unknown, code: string) {
	let caught: unknown;
	try {
		operation();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ code });
}

it.each(["maxCodeUnits", "maxImports", "maxWork"] as const)(
	"validates caller limit %s before scanning",
	(key) => {
		for (const value of [
			0,
			-1,
			0.5,
			Number.NaN,
			Infinity,
			cssImportLimits[key] + 1,
		])
			expectError(() => parseCssImports("", { [key]: value }), "invalid-input");
		for (const value of [null, "1", true])
			expectError(
				() => parseCssImports("", { [key]: value } as CssImportOptions),
				"invalid-input",
			);
		expect(parseCssImports("", { [key]: 1 }).imports).toEqual([]);
	},
);

it("rejects invalid input types", () => {
	for (const source of [null, 1, {}, ["@import 'base.css';"]])
		expectError(() => parseCssImports(source as string), "invalid-input");
	for (const options of [null, 1, [], "limits"])
		expectError(
			() => parseCssImports("", options as CssImportOptions),
			"invalid-input",
		);
});

it("enforces source limits including exact default and caller boundaries", () => {
	const source = '@import "base.css";';
	expect(
		parseCssImports(source, { maxCodeUnits: source.length }).imports,
	).toHaveLength(1);
	expectError(
		() => parseCssImports(source, { maxCodeUnits: source.length - 1 }),
		"resource-limit",
	);
	expect(
		parseCssImports(" ".repeat(cssImportLimits.maxCodeUnits)).imports,
	).toEqual([]);
	expectError(
		() => parseCssImports(" ".repeat(cssImportLimits.maxCodeUnits + 1)),
		"resource-limit",
	);
});

it("enforces retained entry limits without returning a partial result", () => {
	const entry = '@import "base.css";';
	expect(parseCssImports(entry, { maxImports: 1 }).imports).toHaveLength(1);
	expectError(
		() => parseCssImports(entry.repeat(2), { maxImports: 1 }),
		"resource-limit",
	);
	expect(
		parseCssImports(entry.repeat(cssImportLimits.maxImports)).imports,
	).toHaveLength(64);
	expectError(
		() => parseCssImports(entry.repeat(cssImportLimits.maxImports + 1)),
		"resource-limit",
	);
	expect(
		parseCssImports(`@import bad; ${entry}`, { maxImports: 1 }).imports,
	).toHaveLength(1);
});

it.each(['@import "base.css";', '@import "base.css" screen;'])(
	"enforces exact reserved work boundaries for %s",
	(source) => {
		const result = parseCssImports(source);
		expect(parseCssImports(source, { maxWork: result.metrics.work })).toEqual(
			result,
		);
		expectError(
			() => parseCssImports(source, { maxWork: result.metrics.work - 1 }),
			"resource-limit",
		);
	},
);

it("caps decoded URL and retained media code units", () => {
	const url = "a".repeat(cssImportLimits.maxUrlCodeUnits);
	expect(parseCssImports(`@import "${url}";`).imports[0].url).toBe(url);
	expectError(() => parseCssImports(`@import "${url}a";`), "resource-limit");
	const escaped = String.raw`\61 `.repeat(cssImportLimits.maxUrlCodeUnits);
	expect(parseCssImports(`@import "${escaped}";`).imports[0].url).toBe(url);
	const media = `screen/*${"a".repeat(cssImportLimits.maxMediaCodeUnits - 10)}*/`;
	expect(parseCssImports(`@import "base.css" ${media};`).imports[0].media).toBe(
		media,
	);
	expectError(
		() => parseCssImports(`@import "base.css" ${media}a;`),
		"resource-limit",
	);
});

it("bounds malicious nesting, long input and repeated media compilation", () => {
	expectError(
		() => parseCssImports(`@import url(${"(".repeat(33)}a${")".repeat(34)});`),
		"resource-limit",
	);
	expectError(
		() => parseCssImports(`/*${"x".repeat(100_000)}`, { maxWork: 1 }),
		"resource-limit",
	);
	const media = `screen/*${"x".repeat(16_000)}*/`;
	expectError(
		() => parseCssImports(`@import "base.css" ${media};`.repeat(4)),
		"resource-limit",
	);
	expect(parseCssImports(`@${"i".repeat(100_000)};`).imports).toEqual([]);
});

it("deeply freezes results without changing source or options", () => {
	const source = ' /*keep*/ @import "base.css"; @import invalid;';
	const options = Object.freeze({ maxImports: 1 });
	const result = parseCssImports(source, options);
	for (const value of [
		result,
		result.imports,
		result.imports[0],
		result.issues,
		result.metrics,
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(source).toBe(' /*keep*/ @import "base.css"; @import invalid;');
	expect(options).toEqual({ maxImports: 1 });
	expect(parseCssImports(source, options)).toEqual(result);
	expect(parseCssImports("").metrics.work).toBe(0);
});
