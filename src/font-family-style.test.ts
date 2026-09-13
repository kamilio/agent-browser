import { afterEach, expect, it, vi } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import { computeTextStyle, initialTextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { resolveNativeFont } from "./font-family.js";
import * as fontMetrics from "./font-metrics.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { textFontExtent } from "./text-font.js";

const documents: DocumentTree[] = [];
const queriesToClose: DocumentQueries[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const queries of queriesToClose.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">Ax</span></main>`,
		"https://fixture.invalid/font-family-styles",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queriesToClose.push(queries);
	const id = (selector = "#target") => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	const styles = documentStyles(tree);
	return { tree, id, styles, text: () => styles.text(id()) };
}

it.each([
	["Verdana, sans-serif", '"Verdana", sans-serif'],
	['"Odd  Name", SERIF', '"Odd  Name", serif'],
	["Agent/**/Mono, monospace", '"Agent Mono", monospace'],
	['"serif", monospace', '"serif", monospace'],
	[String.raw`\41 gent Mono, sans-serif`, '"Agent Mono", sans-serif'],
])(
	"preserves family semantics through both declaration routes: %s",
	(value, expected) => {
		const issues: string[] = [];
		expect(
			parseCssDeclarations(
				`font-family:${value}`,
				{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
				(issue) => issues.push(issue),
			),
		).toEqual([{ property: "font-family", value: expected, important: false }]);
		expect(parseInlineDeclarations(`font-family:${value}`, 10)).toEqual([
			{ name: "font-family", value: expected, important: false },
		]);
		expect(issues).toEqual([]);
		expect(cssSupportsDeclaration("font-family", value)).toBe(true);
	},
);

it("inherits the computed family list without replacing it with the used face", () => {
	const { tree, styles, id, text } = fixture(
		'#parent{font-family:Verdana, "Agent Mono", sans-serif}',
	);
	expect(text()["font-family"]).toBe('"Verdana", "Agent Mono", sans-serif');
	expect(text()).toBe(styles.text(id("#parent")));
	expect(resolvedStyleValue(tree, id(), "font-family")).toBe(
		'"Verdana", "Agent Mono", sans-serif',
	);
	expect(resolveNativeFont(text()["font-family"])).toMatchObject({
		family: "Agent Mono",
		kind: "named",
	});
});

it.each([
	["initial", '"agent mono"'],
	["inherit", '"Parent Font", serif'],
	["unset", '"Parent Font", serif'],
	["revert", '"Parent Font", serif'],
])(
	"applies %s to the family list at the normal cascade stage",
	(keyword, expected) => {
		const { text } = fixture(
			`#parent{font-family:"Parent Font",serif}#target{font-family:Other;font-family:${keyword}}`,
		);
		expect(text()["font-family"]).toBe(expected);
	},
);

it("resolves custom properties at use sites and invalidates inherited family caches", () => {
	const { tree, id, text, styles } = fixture(
		'#parent{--family:"Case  Kept",sans-serif;font-family:var(--family)}',
	);
	const before = text();
	expect(before["font-family"]).toBe('"Case  Kept", sans-serif');
	tree.setAttribute(id("#parent"), "style", '--family:"Agent Mono"');
	expect(text()["font-family"]).toBe('"Agent Mono"');
	expect(text()).not.toBe(before);
	expect(styles.metrics().issues).toEqual({});
});

it("keeps invalid lists from overriding a valid family declaration", () => {
	const { text, styles } = fixture(
		"#target{font-family:serif;font-family:Verdana,,sans-serif}",
	);
	expect(text()["font-family"]).toBe("serif");
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(1);
});

it("retains important family priority across stylesheet and inline declarations", () => {
	const { tree, id, text } = fixture(
		'#target{font-family:"Sheet Name",serif!important}',
	);
	tree.setAttribute(id(), "style", 'font-family:"Inline Name",monospace');
	expect(text()["font-family"]).toBe('"Sheet Name", serif');
	tree.setAttribute(
		id(),
		"style",
		'font-family:"Inline Name",monospace!important',
	);
	expect(text()["font-family"]).toBe('"Inline Name", monospace');
});

it("uses parent family for font-size ex and own family for line-height and indent", () => {
	const metric = vi.spyOn(fontMetrics, "nativeFontXHeight");
	const text = computeTextStyle(
		{
			"font-family": '"Own", sans-serif',
			"font-size": "2ex",
			"line-height": "2ex",
			"text-indent": "1ex",
		},
		{
			...initialTextStyle,
			"font-family": '"Parent", serif',
			"font-size": "20px",
		},
		{ width: 800, height: 600 },
		16,
	);
	expect(text).toMatchObject({
		"font-size": "25px",
		"line-height": "31.25px",
		"text-indent": "15.625px",
	});
	expect(metric.mock.calls).toEqual([
		[20, 400, '"Parent", serif'],
		[25, 400, '"Own", sans-serif'],
		[25, 400, '"Own", sans-serif'],
	]);
});

it.each(["Verdana, sans-serif", '"Unavailable"', "serif", '"Agent Mono"'])(
	"uses the same available face for native metrics with %s",
	(family) => {
		expect(
			textFontExtent({ ...initialTextStyle, "font-family": family }),
		).toEqual(textFontExtent(initialTextStyle));
		expect(fontMetrics.nativeFontXHeight(16, 700, family)).toBe(10);
	},
);

it("does not bypass font selection validation in direct metric APIs", () => {
	expect(() =>
		textFontExtent({ ...initialTextStyle, "font-family": "serif," }),
	).toThrow();
	expect(() => fontMetrics.nativeFontXHeight(16, 400, "serif,")).toThrow();
});

it("updates ex box metrics when the family and font size change", () => {
	const { tree, id, styles, text } = fixture(
		"#target{font-family:Verdana,sans-serif;font-size:16px;padding:1ex}",
	);
	expect(styles.box(id())["padding-left"]).toBe("10px");
	tree.setAttribute(id(), "style", 'font-family:"Agent Mono";font-size:32px');
	expect(text()["font-family"]).toBe('"Agent Mono"');
	expect(styles.box(id())["padding-left"]).toBe("20px");
});
