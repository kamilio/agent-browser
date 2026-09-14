import { afterEach, expect, it } from "vitest";
import { parseInlineDeclarations } from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	cssTextProperties,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(
	css = "",
	html = '<main id="outer"><span id="target">Text</span></main>',
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style>${html}`,
		"https://example.com/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("shares inherited immutable defaults with text nodes", () => {
	const { tree, styles, id, text } = fixture();
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(styles.metrics()).toMatchObject({
		textProperties: cssTextProperties,
		textFont: "Agent Mono",
		layout: false,
	});
});

it("accepts, inherits and overrides pre-wrap through stylesheet and inline declarations", () => {
	const { tree, styles, id, text } = fixture("#outer{white-space:pre-wrap}");
	expect(parseTextValue("white-space", "pre-wrap")).toBe("pre-wrap");
	expect(text()["white-space"]).toBe("pre-wrap");
	expect(styles.text(tree.get(id()).children[0])["white-space"]).toBe(
		"pre-wrap",
	);
	tree.setAttribute(id(), "style", "white-space:normal;white-space:pre-wrap");
	expect(text()["white-space"]).toBe("pre-wrap");
	tree.setAttribute(id(), "style", "white-space:initial");
	expect(text()["white-space"]).toBe("normal");
	expect(styles.metrics().issues).toEqual({});
});

it.each([
	["12px", "12px"],
	["150%", "30px"],
	["1.5em", "30px"],
	["2rem", "48px"],
	["1in", "96px"],
	["12pt", "16px"],
	["2vw", "25.6px"],
	["0", "0px"],
	["medium", "16px"],
])("computes font size %s to %s", (value, expected) => {
	const { text } = fixture(
		`html{font-size:24px} #outer{font-size:20px} #target{font-size:${value}}`,
	);
	expect(text()["font-size"]).toBe(expected);
});

it("resolves root rem against the initial size and descendants against the computed root", () => {
	const { text } = fixture(
		"html{font-size:2rem} #outer{font-size:150%} #target{font-size:1.5rem}",
	);
	expect(text("html")["font-size"]).toBe("32px");
	expect(text("#outer")["font-size"]).toBe("48px");
	expect(text()["font-size"]).toBe("48px");
	const rooted = fixture("html{font-size:2rem;line-height:2rem}").text;
	expect(rooted("html")["line-height"]).toBe("64px");
	expect(rooted()["line-height"]).toBe("64px");
});

it.each([
	["1.5", "1.5"],
	["150%", "30px"],
	["1.5em", "30px"],
	["2rem", "32px"],
	["0", "0"],
	["normal", "normal"],
])("preserves correct inheritance for line height %s", (value, expected) => {
	const { text } = fixture(
		`#outer{font-size:20px;line-height:${value}} #target{font-size:10px}`,
	);
	expect(text()["line-height"]).toBe(expected);
});

it("cascades importance, specificity, inline values, all and inherited alignment", () => {
	const { tree, id, text } = fixture(
		"span{font-size:30px} #outer{font-size:20px;text-align:right;white-space:nowrap} #target{font-size:12px!important}",
	);
	tree.setAttribute(id(), "style", "font-size:40px;line-height:2");
	expect(text()).toMatchObject({
		"font-size": "12px",
		"line-height": "2",
		"white-space": "nowrap",
		"text-align": "right",
	});
	tree.setAttribute(id(), "style", "all:initial!important");
	expect(text()).toEqual(initialTextStyle);
	tree.setAttribute(id(), "style", "all:inherit!important");
	expect(text()).toEqual(text("#outer"));
});

it.each(["inherit", "unset", "revert"])(
	"inherits text with %s and respects the pre UA declaration",
	(keyword) => {
		const { text } = fixture(
			`#outer{font-size:20px;white-space:nowrap} #target{font-size:${keyword};white-space:${keyword}}`,
			'<main id="outer"><pre id="target">Hello</pre></main>',
		);
		expect(text()["font-size"]).toBe("20px");
		expect(text()["white-space"]).toBe(keyword === "revert" ? "pre" : "nowrap");
	},
);

it("applies pre whitespace through descendants and contents without changing DOM inheritance", () => {
	const { text } = fixture(
		"#outer{display:contents;font-size:24px}",
		'<pre><span id="outer"><span id="target">Hello</span></span></pre>',
	);
	expect(text()).toMatchObject({ "font-size": "24px", "white-space": "pre" });
});

it("refreshes typography on mutation and viewport changes, rejecting disconnected and closed nodes", () => {
	const { tree, text, styles, id } = fixture("#target{font-size:2vw}");
	const before = text();
	styles.setViewport(400, 300);
	expect(text()["font-size"]).toBe("8px");
	expect(text()).not.toBe(before);
	tree.setAttribute(id(), "style", "font-size:25px");
	expect(text()["font-size"]).toBe("25px");
	const target = id();
	tree.remove(target);
	expect(() => styles.text(target)).toThrow();
	tree.close();
	expect(() => styles.text(target)).toThrow();
});

it.each([
	["serif", "serif"],
	['"Unknown", monospace', '"Unknown", monospace'],
	["Arial", '"Arial"'],
])(
	"preserves the requested family rather than claiming it is installed: %s",
	(family, expected) => {
		const { text, styles } = fixture(`#target{font-family:${family}}`);
		expect(text()["font-family"]).toBe(expected);
		expect(styles.metrics().issues).toEqual({});
	},
);

it.each([
	["monospace", "monospace"],
	['"agent mono"', '"agent mono"'],
	["'agent mono'", '"agent mono"'],
	["agent mono", '"agent mono"'],
])("normalizes specified family syntax for %s", (family, expected) => {
	expect(parseTextValue("font-family", family)).toBe(expected);
});

it.each(["-1px", "12", "calc(1px + 1)", "1e999px", "10ch", "larger smaller"])(
	"rejects unsupported or invalid size %s",
	(value) => {
		expect(parseTextValue("font-size", value)).toBeUndefined();
	},
);

it("reports unsupported whitespace/alignment, bounds computed sizes and expands all", () => {
	const { styles } = fixture(
		"#target{white-space:break-spaces;text-align:match-parent;font-weight:bold}",
	);
	expect(styles.metrics().issues).toMatchObject({
		"unimplemented-or-invalid-css-value": 2,
	});
	expect(styles.metrics().issues["unimplemented-css-property"]).toBeUndefined();
	expect(() => fixture("#target{font-size:1e20px}").text()).toThrow(
		"length limit",
	);
	const values = parseCssDeclarations(
		"all:initial",
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
		() => {},
	);
	expect(
		values.filter(({ property }) =>
			(cssTextProperties as readonly string[]).includes(property),
		),
	).toHaveLength(10);
});

it("accepts typography through the same inline declaration validation", () => {
	expect(
		parseInlineDeclarations(
			'font-size:1.5em;line-height:2;white-space:pre;font-family:"Agent Mono";text-align:center',
			20,
		).map(({ name, value }) => [name, value]),
	).toEqual([
		["font-size", "1.5em"],
		["line-height", "2"],
		["white-space", "pre"],
		["font-family", '"Agent Mono"'],
		["text-align", "center"],
	]);
	expect(
		parseInlineDeclarations(
			"font-size:20px;font-size:-2px;white-space:break-spaces",
			20,
		),
	).toHaveLength(1);
});
