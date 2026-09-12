import { afterEach, expect, it } from "vitest";
import { bitmapFontMetrics } from "./bitmap-font.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const fontSize = 8;
const glyphAdvance = bitmapFontMetrics(fontSize).advance;
const viewportWidth = 96;

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:${fontSize}px;line-height:${fontSize}px}${css}</style><body>${markup}</body>`,
		"https://fixture.invalid/noscript/",
	);
	documents.push(tree);
	expect(htmlParseInfo(tree)?.scripting).toBe(false);
	documentStyles(tree).setViewport(viewportWidth, 64);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing fixture ${selector}`);
		return target;
	};
	const geometry = documentGeometry(tree);
	return {
		tree,
		id,
		hits: documentHitTesting(tree),
		box: (selector: string) => geometry.getBoundingClientRect(id(selector)),
		rects: (selector: string) => geometry.getClientRects(id(selector)),
		glyphs: () =>
			layoutDocument(tree).contexts.flatMap((context) => context.glyphs),
	};
}

it("flows direct body fallback text inline between ordinary siblings", () => {
	const { tree, id, box, glyphs, hits } = fixture(
		'A<noscript id="fallback">BC</noscript><span id="after">D</span>',
	);
	expect(tree.get(id("#fallback")).parent).toBe(id("body"));
	expect(documentStyles(tree).get(id("#fallback")).display).toBe("inline");
	expect(
		glyphs()
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("ABCD");
	expect(box("#fallback")).toMatchObject({
		x: glyphAdvance,
		y: 0,
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(box("#after").x).toBe(3 * glyphAdvance);
	expect(hits.elementFromPoint(glyphAdvance + 1, 1)).toBe(id("#fallback"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(4);
});

it("retains parsed inline fallback children inside the body noscript", () => {
	const { tree, id, box, hits } = fixture(
		'<noscript id="fallback"><span id="child">Ready</span></noscript>',
	);
	expect(tree.get(id("#fallback")).parent).toBe(id("body"));
	expect(tree.get(id("#child")).parent).toBe(id("#fallback"));
	expect(box("#child")).toMatchObject({
		x: 0,
		y: 0,
		width: 5 * glyphAdvance,
		height: fontSize,
	});
	expect(hits.elementFromPoint(1, 1)).toBe(id("#child"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(5);
});

it("wraps fallback words using native monospace advances and line height", () => {
	const { id, rects, hits } = fixture(
		'<noscript id="fallback">AB CD</noscript>',
		`body{width:${3 * glyphAdvance}px}`,
	);
	expect(
		rects("#fallback").map(({ x, y, width, height }) => [x, y, width, height]),
	).toEqual([
		[0, 0, 2 * glyphAdvance, fontSize],
		[0, fontSize, 2 * glyphAdvance, fontSize],
	]);
	expect(hits.elementFromPoint(1, fontSize + 1)).toBe(id("#fallback"));
});

it("honors an ordinary line break inside fallback markup", () => {
	const { tree, id, box, glyphs } = fixture(
		'<noscript id="fallback">AB<br><span id="second">CD</span></noscript>',
	);
	expect(tree.get(id("br")).parent).toBe(id("#fallback"));
	expect(box("#second")).toMatchObject({
		x: 0,
		y: fontSize,
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(
		glyphs()
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("ABCD");
});

it("lays out block descendants without requiring block-in-inline wrapper geometry", () => {
	const { tree, id, box, hits } = fixture(
		'<noscript id="fallback"><div id="first">AB</div><div id="second">CD</div></noscript><div id="after">E</div>',
	);
	for (const selector of ["#first", "#second"])
		expect(tree.get(id(selector)).parent).toBe(id("#fallback"));
	expect(box("#first")).toMatchObject({
		x: 0,
		y: 0,
		width: viewportWidth,
		height: fontSize,
	});
	expect(box("#second").y).toBe(fontSize);
	expect(box("#after").y).toBe(2 * fontSize);
	expect(hits.elementFromPoint(1, fontSize + 1)).toBe(id("#second"));
});

it("applies author block sizing and padding to fallback", () => {
	const { box, hits, id } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript><div id="after">C</div>',
		"noscript{display:block;width:24px;padding:2px}",
	);
	expect(box("#fallback")).toMatchObject({
		x: 0,
		y: 0,
		width: 28,
		height: fontSize + 4,
	});
	expect(box("#child")).toMatchObject({ x: 2, y: 2, width: 2 * glyphAdvance });
	expect(box("#after").y).toBe(fontSize + 4);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#fallback"));
	expect(hits.elementFromPoint(3, 3)).toBe(id("#child"));
});

it("suppresses author display:none fallback even when a descendant requests block display", () => {
	const { tree, id, rects, glyphs, hits, box } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript><span id="after">C</span>',
		"noscript{display:none}#child{display:block;visibility:visible}",
	);
	expect(rects("#fallback")).toEqual([]);
	expect(rects("#child")).toEqual([]);
	expect(box("#after").x).toBe(0);
	expect(
		glyphs()
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("C");
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#fallback"));
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#child"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(1);
});

it("restores hidden fallback with an ordinary inline-style block override", () => {
	const { tree, id, rects, box, hits } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript>',
		"noscript{display:none}",
	);
	const hiddenRects = rects("#child");
	expect(hiddenRects).toEqual([]);
	tree.setAttribute(id("#fallback"), "style", "display:block");
	expect(box("#fallback")).toMatchObject({
		width: viewportWidth,
		height: fontSize,
	});
	expect(box("#child").width).toBe(2 * glyphAdvance);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#child"));
	expect(hiddenRects).toEqual([]);
	expect(Object.isFrozen(hiddenRects)).toBe(true);
});

it("flattens display:contents fallback without inventing its own rectangle", () => {
	const { rects, box, hits, id } = fixture(
		'A<noscript id="fallback"><span id="child">BC</span></noscript><span id="after">D</span>',
		"noscript{display:contents}",
	);
	expect(rects("#fallback")).toEqual([]);
	expect(box("#child")).toMatchObject({
		x: glyphAdvance,
		y: 0,
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(box("#after").x).toBe(3 * glyphAdvance);
	expect(hits.elementFromPoint(glyphAdvance + 1, 1)).toBe(id("#child"));
});

it("keeps direct text hit ownership for boxless fallback", () => {
	const { id, rects, hits } = fixture(
		'<noscript id="fallback">AB</noscript>',
		"noscript{display:contents}",
	);
	expect(rects("#fallback")).toEqual([]);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#fallback"));
	expect(hits.elementsFromPoint(3 * glyphAdvance, 1)).not.toContain(
		id("#fallback"),
	);
});

it("restores default inline fallback after block and contents attribute mutations", () => {
	const { tree, id, rects, box } = fixture(
		'<noscript id="fallback" style="display:block">AB</noscript><span id="after">C</span>',
	);
	const blockRects = rects("#fallback");
	expect(blockRects[0]).toMatchObject({
		width: viewportWidth,
		height: fontSize,
	});
	expect(box("#after").y).toBe(fontSize);
	tree.setAttribute(id("#fallback"), "style", "display:contents");
	expect(rects("#fallback")).toEqual([]);
	expect(box("#after")).toMatchObject({ x: 2 * glyphAdvance, y: 0 });
	tree.removeAttribute(id("#fallback"), "style");
	expect(box("#fallback")).toMatchObject({
		x: 0,
		y: 0,
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(blockRects[0].width).toBe(viewportWidth);
	expect(Object.isFrozen(blockRects)).toBe(true);
	expect(Object.isFrozen(blockRects[0])).toBe(true);
});

it("preserves hidden fallback layout while suppressing its paint and hits", () => {
	const { tree, id, box, hits } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript><span id="after">C</span>',
		"noscript{visibility:hidden}",
	);
	expect(box("#child")).toMatchObject({
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(box("#after").x).toBe(2 * glyphAdvance);
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#fallback"));
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#child"));
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedGlyphs: 1,
		hiddenGlyphs: 2,
	});
});

it("allows an explicitly visible child of visibility:hidden fallback", () => {
	const { tree, id, hits, box } = fixture(
		'<noscript id="fallback">A<span id="child">B</span></noscript>',
		"noscript{visibility:hidden}#child{visibility:visible}",
	);
	expect(box("#child").x).toBe(glyphAdvance);
	expect(hits.elementFromPoint(glyphAdvance + 1, 1)).toBe(id("#child"));
	expect(hits.elementsFromPoint(glyphAdvance + 1, 1)).not.toContain(
		id("#fallback"),
	);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedGlyphs: 1,
		hiddenGlyphs: 1,
	});
});

it("does not let fallback display override a display:none ancestor", () => {
	const { tree, id, rects, hits } = fixture(
		'<div id="ancestor"><noscript id="fallback"><span id="child">AB</span></noscript></div>',
		"#ancestor{display:none}noscript{display:block;visibility:visible}",
	);
	expect(rects("#fallback")).toEqual([]);
	expect(rects("#child")).toEqual([]);
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#child"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(0);
	tree.setAttribute(id("#ancestor"), "style", "display:block");
	expect(hits.elementFromPoint(1, 1)).toBe(id("#child"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(2);
});

it("invalidates inherited visibility when an ancestor becomes visible", () => {
	const { tree, id, box, hits } = fixture(
		'<div id="ancestor" style="visibility:hidden"><noscript id="fallback">AB</noscript></div>',
	);
	const hiddenBox = box("#fallback");
	expect(hiddenBox.width).toBe(2 * glyphAdvance);
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#fallback"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(0);
	tree.removeAttribute(id("#ancestor"), "style");
	expect(box("#fallback")).toEqual(hiddenBox);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#fallback"));
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(2);
});

it("restores fallback after removal of its hidden attribute", () => {
	const { tree, id, rects, box, hits } = fixture(
		'<noscript id="fallback" hidden><span id="child">AB</span></noscript>',
	);
	expect(rects("#child")).toEqual([]);
	tree.removeAttribute(id("#fallback"), "hidden");
	expect(box("#child")).toMatchObject({
		x: 0,
		y: 0,
		width: 2 * glyphAdvance,
		height: fontSize,
	});
	expect(hits.elementFromPoint(1, 1)).toBe(id("#child"));
});

it("keeps old native geometry and hit arrays immutable across class toggles", () => {
	const { tree, id, rects, hits } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript>',
		".off{display:none}",
	);
	const oldRects = rects("#child");
	const oldHits = hits.elementsFromPoint(1, 1);
	expect(oldRects[0].width).toBe(2 * glyphAdvance);
	expect(oldHits[0]).toBe(id("#child"));
	tree.setAttribute(id("#fallback"), "class", "off");
	expect(rects("#child")).toEqual([]);
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#child"));
	tree.removeAttribute(id("#fallback"), "class");
	expect(rects("#child")).toEqual(oldRects);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#child"));
	expect(oldRects[0].width).toBe(2 * glyphAdvance);
	expect(oldHits[0]).toBe(id("#child"));
	for (const value of [oldRects, oldRects[0], oldHits])
		expect(Object.isFrozen(value)).toBe(true);
});

it("reflows fallback text mutations without rewriting retained layout values", () => {
	const { tree, id, box, hits } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript>',
	);
	const oldBox = box("#child");
	const oldLayout = layoutDocument(tree);
	expect(oldBox.width).toBe(2 * glyphAdvance);
	tree.setTextContent(id("#child"), "ABCDE");
	expect(box("#child").width).toBe(5 * glyphAdvance);
	expect(hits.elementFromPoint(4 * glyphAdvance + 1, 1)).toBe(id("#child"));
	expect(oldBox.width).toBe(2 * glyphAdvance);
	expect(Object.isFrozen(oldBox)).toBe(true);
	expect(
		oldLayout.contexts
			.flatMap((context) => context.glyphs)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("AB");
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(5);
});

it("assigns nested inline hits to the actual source element at each glyph", () => {
	const { tree, id, box, hits } = fixture(
		'<noscript id="fallback"><span id="outer">A<span id="inner">B</span>C</span></noscript>',
	);
	expect(tree.get(id("#outer")).parent).toBe(id("#fallback"));
	expect(tree.get(id("#inner")).parent).toBe(id("#outer"));
	expect(box("#outer").width).toBe(3 * glyphAdvance);
	expect(box("#inner")).toMatchObject({ x: glyphAdvance, width: glyphAdvance });
	expect(hits.elementFromPoint(1, 1)).toBe(id("#outer"));
	expect(hits.elementFromPoint(glyphAdvance + 1, 1)).toBe(id("#inner"));
	expect(hits.elementFromPoint(2 * glyphAdvance + 1, 1)).toBe(id("#outer"));
});

it("uses a genuine native mouse hit to activate a fallback link default action", () => {
	const { tree, id, hits } = fixture(
		'<noscript id="fallback"><a id="link" href="next">Go</a></noscript>',
	);
	expect(tree.get(id("#link")).parent).toBe(id("#fallback"));
	expect(hits.elementFromPoint(1, 1)).toBe(id("#link"));
	const actions = documentInteractions(tree);
	const targets: (number | null)[] = [];
	actions.events.addEventListener(id("#fallback"), "click", (event) => {
		targets.push(event.target);
	});
	actions.mouse.move(1, 1);
	actions.mouse.down();
	expect(actions.mouse.up()).toMatchObject({
		defaultAction: {
			kind: "navigate",
			url: "https://fixture.invalid/noscript/next",
		},
	});
	expect(targets).toEqual([id("#link")]);
});

it("honors ordinary click cancellation on a fallback link without navigating", () => {
	const { tree, id, hits } = fixture(
		'<noscript><a id="link" href="next">Go</a></noscript>',
	);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#link"));
	const actions = documentInteractions(tree);
	actions.events.addEventListener(id("#link"), "click", (event) => {
		event.preventDefault();
	});
	actions.mouse.move(1, 1);
	actions.mouse.down();
	const result = actions.mouse.up();
	expect(result).toMatchObject({ interaction: { defaultPrevented: true } });
	expect(result.defaultAction).toBeUndefined();
});

it("keeps unsupported table display explicit rather than treating it as inline fallback", () => {
	const { tree, id } = fixture(
		'<noscript id="fallback"><span id="child">AB</span></noscript>',
		"noscript{display:table}",
	);
	expect(tree.get(id("#child")).parent).toBe(id("#fallback"));
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find(
			(node) => node.ref === tree.reference(id("#fallback")),
		),
	).toMatchObject({
		kind: "deferred",
		deferredReason: "display-layout-not-supported",
	});
	expect(formatting.issues["display-layout-not-supported"]).toBe(1);
});

it("does not promote foreign MathML descendants into supported HTML fallback layout", () => {
	const { tree, id } = fixture(
		'<noscript id="fallback"><math id="foreign"><mtext>AB</mtext></math></noscript>',
	);
	expect(tree.get(id("#foreign")).parent).toBe(id("#fallback"));
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find(
			(node) => node.ref === tree.reference(id("#fallback")),
		),
	).toMatchObject({ kind: "inline" });
	expect(
		formatting.nodes.find(
			(node) => node.ref === tree.reference(id("#foreign")),
		),
	).toMatchObject({
		kind: "deferred",
		deferredReason: "element-layout-not-supported",
	});
	expect(formatting.issues["element-layout-not-supported"]).toBe(1);
});
