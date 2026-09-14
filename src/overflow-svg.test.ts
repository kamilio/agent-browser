import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const svg =
	'<svg id="svg" width="100" height="80"><g id="group"><rect id="shape" width="100" height="80" fill="red"/></g></svg>';

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content = svg, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}body{width:240px}#host{width:180px;height:160px;padding:20px}#port{width:40px;height:30px;overflow:hidden}svg{display:block}#tail{height:400px}${css}</style><main id="host"><div id="port">${content}</div></main><div id="tail"></div>`,
		"https://fixture.invalid/overflow-svg",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const rect = (selector: string) =>
		geometry.getBoundingClientRect(id(selector));
	return {
		tree,
		id,
		geometry,
		rect,
		clip: (selector: string, content = false) =>
			geometry.clipClientRect(id(selector), rect(selector), content),
		scroll: documentElementScroll(tree),
		root: documentScroll(tree),
		hits: documentHitTesting(tree),
	};
}

it("clips an SVG shape through its root content chain without shrinking client rectangles", () => {
	const { id, geometry, rect, clip } = fixture();
	const original = rect("#shape");
	expect(original).toMatchObject({ x: 20, y: 20, width: 100, height: 80 });
	expect(clip("#shape")).toMatchObject({
		x: 20,
		y: 20,
		width: 40,
		height: 30,
	});
	expect(clip("#shape", true)).toEqual(clip("#shape"));
	expect(geometry.getClientRects(id("#shape"))).toEqual([original]);
	expect(rect("#shape")).toEqual(original);
});

it("clips a group union while retaining its full descendant bounds", () => {
	const { id, geometry, rect, clip } = fixture(
		'<svg id="svg" width="100" height="80"><g id="group"><rect id="shape" width="20" height="20"/><rect x="60" y="40" width="40" height="40"/></g></svg>',
	);
	const original = rect("#group");
	expect(original).toMatchObject({ x: 20, y: 20, width: 100, height: 80 });
	expect(clip("#group")).toMatchObject({
		x: 20,
		y: 20,
		width: 40,
		height: 30,
	});
	expect(clip("#group", true)).toEqual(clip("#group"));
	expect(geometry.getClientRects(id("#group"))).toEqual([original]);
	expect(rect("#group")).toEqual(original);
	expect(rect("#svg")).toMatchObject({ width: 100, height: 80 });
});

it("refreshes shape and group clips after nested and root scrolling", () => {
	const { id, rect, clip, scroll, root } = fixture(
		`<div id="inner">${svg}</div>`,
		"#port{width:60px;height:50px;overflow:auto}#inner{margin-left:30px;margin-top:20px;width:80px;height:60px;overflow:hidden}",
	);
	for (const selector of ["#shape", "#group"]) {
		expect(rect(selector)).toMatchObject({
			x: 50,
			y: 40,
			width: 100,
			height: 80,
		});
		expect(clip(selector)).toMatchObject({
			x: 50,
			y: 40,
			width: 30,
			height: 30,
		});
	}
	scroll.to(id("#port"), 10, 5);
	scroll.to(id("#inner"), 15, 10);
	expect(scroll.get(id("#port"))).toMatchObject({
		scrollLeft: 10,
		scrollTop: 5,
	});
	expect(scroll.get(id("#inner"))).toMatchObject({
		scrollLeft: 15,
		scrollTop: 10,
	});
	for (const selector of ["#shape", "#group"]) {
		expect(rect(selector)).toMatchObject({
			x: 25,
			y: 25,
			width: 100,
			height: 80,
		});
		expect(clip(selector)).toMatchObject({
			x: 40,
			y: 35,
			width: 40,
			height: 35,
		});
	}
	root.to(0, 10);
	for (const selector of ["#shape", "#group"]) {
		expect(rect(selector)).toMatchObject({
			x: 25,
			y: 15,
			width: 100,
			height: 80,
		});
		expect(clip(selector)).toMatchObject({
			x: 40,
			y: 25,
			width: 40,
			height: 35,
		});
	}
});

it("samples the exposed SVG sliver for both shape and group click targets", () => {
	const { tree, id, rect, clip, hits } = fixture(
		svg,
		"#port{width:0.5px;height:0.5px}svg{position:relative;left:-40px;top:-30px}",
	);
	for (const selector of ["#shape", "#group"]) {
		expect(rect(selector)).toMatchObject({
			x: -20,
			y: -10,
			width: 100,
			height: 80,
		});
		expect(clip(selector)).toMatchObject({
			x: 20,
			y: 20,
			width: 0.5,
			height: 0.5,
		});
		expect(findClickPoint(tree, id(selector))).toMatchObject({
			point: { x: 20.25, y: 20.25 },
			points: 1,
		});
	}
	expect(hits.elementFromPoint(20.25, 20.25)).toBe(id("#shape"));
	expect(hits.elementsFromPoint(21, 21)).not.toContain(id("#shape"));
});

it("preserves SVG clip-path hit semantics independently of overflow-clipped geometry", () => {
	const { id, rect, clip, hits } = fixture(
		'<svg id="svg" width="100" height="80"><defs><clipPath id="crop"><rect width="10" height="80"/></clipPath></defs><g id="group" clip-path="url(#crop)"><rect id="shape" width="100" height="80" fill="red"/></g></svg>',
	);
	for (const selector of ["#shape", "#group"]) {
		expect(rect(selector)).toMatchObject({
			x: 20,
			y: 20,
			width: 100,
			height: 80,
		});
		expect(clip(selector)).toMatchObject({
			x: 20,
			y: 20,
			width: 40,
			height: 30,
		});
	}
	expect(hits.elementFromPoint(25, 25)).toBe(id("#shape"));
	expect(hits.elementsFromPoint(35, 25)).not.toContain(id("#shape"));
	expect(hits.elementsFromPoint(25, 55)).not.toContain(id("#shape"));
});

it("retains the unsupported SVG visible-overflow guard inside a clipping ancestor", () => {
	const { tree, rect } = fixture(
		'<svg id="svg" width="100" height="80" overflow="visible"><rect id="shape" width="100" height="80"/></svg>',
	);
	expect(
		buildFormattingTree(tree).issues["svg-viewport-overflow-not-supported"],
	).toBe(1);
	expect(() => rect("#shape")).toThrow("issue-free");
});
