import { afterEach, expect, it } from "vitest";
import { parseInlineDeclarations } from "./css-declarations.js";
import {
	computePaintStyle,
	initialPaintStyle,
	paintBackground,
} from "./css-paint.js";
import { parseCssDeclarations } from "./css-parser.js";
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
		paint: (selector = "#target") => styles.paint(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("shares color validation across inline and stylesheet declarations", () => {
	const source = "color:hsl(120 100% 50%);background-color:#1238";
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
		() => {},
	);
	expect(
		declarations.map(({ property, value, important }) => ({
			name: property,
			value,
			important,
		})),
	).toEqual(parseInlineDeclarations(source, 10));
});

it("inherits foreground but not background, and resolves inherited currentcolor against its new element", () => {
	const { paint } = fixture(
		"#outer{color:red;background-color:currentcolor} #target{color:blue;background-color:inherit}",
	);
	expect(paint()).toEqual({
		color: [0, 0, 255, 255],
		"background-color": "currentcolor",
	});
	expect(paintBackground(paint())).toEqual([0, 0, 255, 255]);
	expect(paintBackground(paint("#outer"))).toEqual([255, 0, 0, 255]);
	expect(fixture("#outer{color:red;background-color:blue}").paint()).toEqual({
		color: [255, 0, 0, 255],
		"background-color": [0, 0, 0, 0],
	});
});

it.each(["unset", "revert", "initial", "inherit", "currentcolor"])(
	"handles the %s keyword",
	(keyword) => {
		const { paint } = fixture(
			`#outer{color:red;background-color:blue} #target{color:${keyword};background-color:${keyword}}`,
		);
		expect(paint().color).toEqual(
			keyword === "initial" ? [0, 0, 0, 255] : [255, 0, 0, 255],
		);
		expect(paintBackground(paint())).toEqual(
			keyword === "inherit"
				? [0, 0, 255, 255]
				: keyword === "currentcolor"
					? [255, 0, 0, 255]
					: [0, 0, 0, 0],
		);
	},
);

it("applies cascade importance, invalid declaration fallback, and all reset", () => {
	const { paint, tree, id } = fixture(
		"#target{color:green!important;background-color:red} #target{color:bad}",
		'<main id="outer"><span id="target" style="color:blue;background-color:#abc">Text</span></main>',
	);
	expect(paint().color).toEqual([0, 128, 0, 255]);
	expect(paintBackground(paint())).toEqual([170, 187, 204, 255]);
	tree.setAttribute(id(), "style", "all:initial!important");
	expect(paint()).toEqual(initialPaintStyle);
});

it("invalidates immutable paint snapshots after mutations and refuses closed ownership", () => {
	const { tree, styles, paint, id } = fixture("#outer{color:red}");
	const before = paint();
	expect(Object.isFrozen(before)).toBe(true);
	tree.setAttribute(id("#outer"), "style", "color:blue");
	expect(paint().color).toEqual([0, 0, 255, 255]);
	expect(before.color).toEqual([255, 0, 0, 255]);
	styles.setViewport(300, 200);
	expect(paint().color).toEqual([0, 0, 255, 255]);
	tree.close();
	expect(() => paint()).toThrow();
});

it("uses frozen defaults and tolerates invalid internal specified values conservatively", () => {
	expect(computePaintStyle({}, initialPaintStyle)).toBe(initialPaintStyle);
	expect(
		computePaintStyle(
			{ color: "invalid", "background-color": "invalid" },
			initialPaintStyle,
		),
	).toEqual(initialPaintStyle);
});
