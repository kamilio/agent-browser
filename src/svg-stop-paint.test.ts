import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import {
	computePaintStyle,
	initialPaintStyle,
	parsePaintValue,
} from "./css-paint.js";
import { parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup = '<stop id="target"/>', css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style><svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="parent">${markup}</linearGradient></svg>`,
		"about:blank",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target");
	if (target === null) throw new Error("Missing SVG stop fixture");
	return {
		tree,
		target,
		styles: documentStyles(tree),
		value: (name: string) => resolvedStyleValue(tree, target, name),
	};
}

it("supports stop declarations through stylesheet and inline parsers", () => {
	const source = "stop-color: #0673ba; stop-opacity: 40%";
	const issues: string[] = [];
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 4, maxDeclarations: 4 },
		(code) => issues.push(code),
	);
	expect(issues).toEqual([]);
	expect(declarations.map((entry) => entry.property)).toEqual([
		"stop-color",
		"stop-opacity",
	]);
	expect(parseInlineDeclarations(source, 4).map((entry) => entry.name)).toEqual(
		["stop-color", "stop-opacity"],
	);
	const test = fixture(
		'<stop id="target" style="stop-color:#0673BA;stop-opacity:40%"/>',
	);
	expect(test.value("stop-color")).toBe("rgb(6, 115, 186)");
	expect(test.value("stop-opacity")).toBe("0.4");
	expect(test.styles.metrics().issues).toEqual({});
});

it("resolves presentation attributes without inventing inherited defaults", () => {
	const test = fixture(
		'<stop id="target" stop-color="#5a9fd4" stop-opacity=".5"/>',
	);
	expect(test.value("stop-color")).toBe("rgb(90, 159, 212)");
	expect(test.value("stop-opacity")).toBe("0.5");
	expect(test.styles.metrics().issues).toEqual({});
});

it("keeps stop color black and opacity one instead of inheriting a parent declaration", () => {
	const test = fixture(
		undefined,
		"#parent{stop-color:red;stop-opacity:.2;color:blue}",
	);
	expect(test.value("stop-color")).toBe("rgb(0, 0, 0)");
	expect(test.value("stop-opacity")).toBe("1");
	expect(test.value("color")).toBe("rgb(0, 0, 255)");
});

it("allows explicit inheritance of stop properties", () => {
	const test = fixture(
		'<stop id="target" stop-color="inherit" stop-opacity="inherit"/>',
		"#parent{stop-color:#11a14e;stop-opacity:.2}",
	);
	expect(test.value("stop-color")).toBe("rgb(17, 161, 78)");
	expect(test.value("stop-opacity")).toBe("0.2");
});

it.each(["initial", "unset", "revert"])(
	"resets noninherited stops for %s",
	(keyword) => {
		const test = fixture(
			`<stop id="target" style="stop-color:${keyword};stop-opacity:${keyword}"/>`,
			"#parent{stop-color:red;stop-opacity:.2}",
		);
		expect(test.value("stop-color")).toBe("rgb(0, 0, 0)");
		expect(test.value("stop-opacity")).toBe("1");
	},
);

it("cascades author and important declarations above presentation attributes", () => {
	const test = fixture(
		'<stop id="target" class="paint" stop-color="red" stop-opacity=".2" style="stop-color:blue;stop-opacity:.4"/>',
		".paint{stop-color:green !important;stop-opacity:.8 !important}",
	);
	expect(test.value("stop-color")).toBe("rgb(0, 128, 0)");
	expect(test.value("stop-opacity")).toBe("0.8");
});

it("substitutes native custom properties and resolves currentcolor per stop", () => {
	const test = fixture(
		'<stop id="target" style="color:#ffd43b;stop-color:var(--paint);stop-opacity:var(--alpha)"/>',
		"#parent{--paint:currentcolor;--alpha:25%}",
	);
	expect(test.value("stop-color")).toBe("rgb(255, 212, 59)");
	expect(test.value("stop-opacity")).toBe("0.25");
});

it.each([
	["-1", "0"],
	["2", "1"],
	["50%", "0.5"],
	["2.5e-1", "0.25"],
] as const)("computes and clamps stop opacity %s", (value, expected) => {
	const test = fixture(`<stop id="target" stop-opacity="${value}"/>`);
	expect(test.value("stop-opacity")).toBe(expected);
});

it.each(["auto", "calc(1)", "1px", "1e999", "", "%"])(
	"rejects invalid stop opacity %j",
	(value) => {
		expect(parsePaintValue(value, "stop-opacity")).toBeUndefined();
	},
);

it("preserves shared initial paint identity and does not leak parent stop state", () => {
	expect(computePaintStyle({}, initialPaintStyle)).toBe(initialPaintStyle);
	const parent = computePaintStyle(
		{ "stop-color": "red", "stop-opacity": "0" },
		initialPaintStyle,
	);
	expect(parent["stop-opacity"]).toBe(0);
	const inherited = computePaintStyle(
		{ "stop-color": "inherit", "stop-opacity": "inherit" },
		parent,
	);
	expect(inherited).toBe(parent);
	const reset = computePaintStyle({}, parent);
	expect(reset["stop-color"]).toBeUndefined();
	expect(reset["stop-opacity"]).toBeUndefined();
	expect(Object.isFrozen(reset)).toBe(true);
});
