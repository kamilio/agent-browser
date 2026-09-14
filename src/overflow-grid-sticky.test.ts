import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { projectScrollLayout } from "./document-overflow.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

const gridMarkup =
	'<main id="grid"><div id="target"></div><div id="filler"></div></main>';

function fixture(css = "", markup = gridMarkup) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#grid{display:grid;overflow:auto;width:100px;height:100px;grid-template-columns:100px;grid-template-rows:100px 100px;align-content:start;justify-content:start}#target{position:sticky;top:0;width:20px;height:20px;grid-row:1;grid-column:1;align-self:start}#filler{width:100px;height:100px;grid-row:2;grid-column:1}${css}</style>${markup}`,
		"https://fixture.invalid/overflow-grid-sticky",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(240, 200);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const projectedBox = (selector: string) => {
		const layout = projectScrollLayout(tree, layoutDocument(tree));
		const ref = tree.reference(id(selector));
		const box = layout.boxes.find((entry) => entry.ref === ref);
		if (!box) throw new Error(`Missing projected box ${selector}`);
		return box;
	};
	return {
		tree,
		id,
		projectedBox,
		scroll: documentElementScroll(tree),
		rect: (selector = "#target") =>
			geometry.getBoundingClientRect(id(selector)),
	};
}

it.each([
	[80, 0],
	[100, -20],
])(
	"constrains the sticky item to its first grid row at scrollTop %s",
	(top, expectedTop) => {
		const { id, scroll, rect, projectedBox } = fixture();
		expect(rect()).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
		expect(scroll.to(id("#grid"), 0, top)).toBe(true);
		expect(scroll.get(id("#grid")).scrollTop).toBe(top);
		expect(rect("#grid")).toMatchObject({
			x: 0,
			y: 0,
			width: 100,
			height: 100,
		});
		expect(projectedBox("#target").gridArea).toEqual({
			x: 0,
			y: -top,
			width: 100,
			height: 100,
		});
		expect(rect()).toMatchObject({
			x: 0,
			y: expectedTop,
			width: 20,
			height: 20,
		});
		expect(projectedBox("#target").borderY).toBe(expectedTop);
		expect(scroll.to(id("#grid"), 0, 0)).toBe(true);
		expect(rect()).toMatchObject({ x: 0, y: 0 });
	},
);

it("constrains a horizontally sticky item to the scrolled first column", () => {
	const { id, scroll, rect, projectedBox } = fixture(
		"#grid{grid-template-columns:100px 100px}#target{top:auto;left:0}#filler{grid-column:2}",
	);
	expect(scroll.to(id("#grid"), 100, 0)).toBe(true);
	expect(scroll.get(id("#grid")).scrollLeft).toBe(100);
	expect(rect("#grid")).toMatchObject({ x: 0, y: 0, width: 100, height: 100 });
	expect(projectedBox("#target").gridArea).toEqual({
		x: -100,
		y: 0,
		width: 100,
		height: 100,
	});
	expect(rect()).toMatchObject({ x: -20, y: 0, width: 20, height: 20 });
});

it("combines ancestor scrolling with the grid's own content offset exactly once", () => {
	const { id, scroll, rect, projectedBox } = fixture(
		"#outer{width:100px;height:80px;overflow:auto}#before{height:40px}#after{height:100px}",
		`<section id="outer"><div id="before"></div>${gridMarkup}<div id="after"></div></section>`,
	);
	expect(scroll.to(id("#outer"), 0, 20)).toBe(true);
	expect(scroll.to(id("#grid"), 0, 100)).toBe(true);
	expect(scroll.get(id("#outer")).scrollTop).toBe(20);
	expect(scroll.get(id("#grid")).scrollTop).toBe(100);
	expect(rect("#grid")).toMatchObject({ x: 0, y: 20, width: 100, height: 100 });
	expect(projectedBox("#target").gridArea).toEqual({
		x: 0,
		y: -80,
		width: 100,
		height: 100,
	});
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
});

it("retains the relative-positioned grid area when border and content shifts agree", () => {
	const { tree, id, scroll, rect, projectedBox } = fixture(
		"#grid{position:relative;left:15px;top:10px}",
	);
	const before = layoutDocument(tree).boxes.find(
		(box) => box.ref === tree.reference(id("#target")),
	);
	expect(before?.gridArea).toEqual({ x: 15, y: 10, width: 100, height: 100 });
	expect(scroll.get(id("#grid"))).toMatchObject({
		scrollLeft: 0,
		scrollTop: 0,
	});
	expect(projectedBox("#target").gridArea).toEqual(before?.gridArea);
	expect(rect("#grid")).toMatchObject({
		x: 15,
		y: 10,
		width: 100,
		height: 100,
	});
	expect(rect()).toMatchObject({ x: 15, y: 10, width: 20, height: 20 });
});
