import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { editableCaretLimits, prepareEditableCaret } from "./editable-caret.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content = "", css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:40px;padding:4px;border:1px solid blue;color:red;background:white}p{margin:0}${css}</style><div id="editor" contenteditable>${content}</div>`,
		"https://fixture.invalid/empty-caret",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const node = queries.querySelector(selector);
		if (node === null) throw new Error(`Missing ${selector}`);
		return node;
	};
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(id()));
	const owner = domRangeOwner(tree);
	owner.selection.collapse(id(), 0);
	return { tree, id, actions, owner };
}

it.each([
	["", "#editor", 0],
	['<p id="empty"></p>', "#empty", 0],
	['<div id="empty"></div>', "#empty", 0],
	['<p id="empty"></p><p>After</p>', "#editor", 0],
	['<p>Before</p><div id="empty"></div>', "#editor", 2],
] as const)(
	"paints an empty block strut for %s at %s slot %s without layout or Range mutation",
	(content, selector, offset) => {
		const { tree, id, owner } = fixture(content);
		owner.selection.collapse(id(selector), offset);
		const range = owner.selection.getRangeAt(0);
		const start = range.start;
		const before = layoutDocument(tree);
		const html = serializeHtml(tree, id());
		const rendered = rasterizeDocument(tree);
		expect(rendered.metrics).toMatchObject({
			caretStatus: "painted",
			paintedCarets: 1,
		});
		expect(layoutDocument(tree)).toEqual(before);
		expect(serializeHtml(tree, id())).toBe(html);
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(range.start).toBe(start);
		expect(range.end).toEqual(start);
		expect(rangeClientRects(range)).toEqual([]);
	},
);

it.each(["host-start", "host-end", "text"])(
	"paints a sole empty text child through %s without inserting content",
	(mode) => {
		const { tree, id, owner } = fixture();
		const text = tree.createText("");
		tree.append(id(), text);
		owner.selection.collapse(
			mode === "text" ? text : id(),
			mode === "host-end" ? 1 : 0,
		);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
		expect(tree.get(id()).children).toEqual([text]);
		expect(tree.get(text).data).toBe("");
	},
);

it("uses shared line leading and the actual content origin for the empty caret", () => {
	const { tree } = fixture();
	expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
		status: "ready",
		anchor: { x: 5, y: 6, height: 8 },
	});
	const result = rasterizeDocument(tree);
	for (let vertical = 6; vertical < 14; vertical++) {
		const offset = (vertical * result.image.width + 5) * 4;
		expect(Array.from(result.image.pixels.slice(offset, offset + 4))).toEqual([
			255, 0, 0, 255,
		]);
	}
});

it.each([
	["left", 5],
	["start", 5],
	["center", 65],
	["right", 125],
	["end", 125],
] as const)(
	"aligns zero inline advance for text-align:%s",
	(alignment, horizontal) => {
		const { tree } = fixture("", `#editor{text-align:${alignment}}`);
		expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
			status: "ready",
			anchor: { x: horizontal, y: 6, height: 8 },
		});
	},
);

it.each([
	["16px", "20px", 7, 16],
	["16px", "8px", 1, 16],
	["8.5px", "11.5px", 6.5, 8.5],
	["12px", "normal", 6.5, 12],
	["8px", "2", 9, 8],
] as const)(
	"uses the existing %s / %s font strut",
	(size, line, vertical, height) => {
		const { tree } = fixture(
			"",
			`#editor{font-size:${size};line-height:${line}}`,
		);
		expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
			status: "ready",
			anchor: { x: 5, y: vertical, height },
		});
	},
);

it.each([
	"<span></span>",
	"<br>",
	"<!--empty-->",
	"<p><span></span></p>",
	"<p><br></p>",
	"<div><div></div></div>",
	"<p contenteditable=false></p>",
	"<p contenteditable=true></p>",
	"<p inert></p>",
	"<p hidden></p>",
	"<p style='visibility:hidden'></p>",
	"<p style='position:relative'></p>",
	"<p style='position:absolute'></p>",
	"<p style='display:inline-block'></p>",
	"<section></section>",
	"<input>",
])(
	"does not invent an empty caret through unsupported content: %s",
	(content) => {
		const { tree } = fixture(content);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	},
);

it("does not reinterpret interior element slots or multiple empty text children", () => {
	const { tree, id, owner } = fixture('<p id="first"></p><p id="last"></p>');
	owner.selection.collapse(id(), 1);
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	tree.setTextContent(id(), "");
	const first = tree.createText("");
	tree.append(id(), first);
	tree.append(id(), tree.createText(""));
	owner.selection.collapse(first, 0);
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
});

it("keeps empty carets below later positioned paint rather than adding a topmost overlay", () => {
	const { tree } = fixture();
	const body = new DocumentQueries(tree).querySelector("body");
	if (body === null) throw new Error("Missing body");
	const overlay = tree.createElement("div");
	tree.setAttribute(
		overlay,
		"style",
		"position:absolute;left:0;top:0;width:20px;height:20px;background:blue;z-index:2",
	);
	tree.append(body, overlay);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedCarets).toBe(1);
	const offset = (6 * result.image.width + 5) * 4;
	expect(Array.from(result.image.pixels.slice(offset, offset + 4))).toEqual([
		0, 0, 255, 255,
	]);
});

it("does not let the empty element's own opaque background hide its caret", () => {
	const { tree } = fixture("", "#editor{background:blue}");
	const result = rasterizeDocument(tree);
	const offset = (6 * result.image.width + 5) * 4;
	expect(Array.from(result.image.pixels.slice(offset, offset + 4))).toEqual([
		255, 0, 0, 255,
	]);
});

it("preserves native focus, clipping, transparent color and zero-font boundaries", () => {
	const { tree, actions, id } = fixture();
	expect(
		rasterizeDocument(tree, { clip: { x: 50, y: 0, width: 30, height: 30 } })
			.metrics,
	).toMatchObject({
		caretStatus: "clipped",
		paintedCarets: 0,
	});
	actions.focus.blurElement(id());
	expect(rasterizeDocument(tree).metrics.caretStatus).toBe("unfocused");
	const transparent = fixture("", "#editor{color:transparent}");
	expect(rasterizeDocument(transparent.tree).metrics).toMatchObject({
		caretStatus: "transparent",
		paintedCarets: 0,
	});
	const zero = fixture("", "#editor{font-size:0px}");
	expect(rasterizeDocument(zero.tree).metrics.paintedCarets).toBe(0);
});

it("rejects stale supplied geometry and remains bounded without retaining temporary ranges", () => {
	const { tree, id, owner } = fixture();
	const layout = layoutDocument(tree);
	expect(prepareEditableCaret(tree, layout, 1).status).toBe("limited");
	const scoped = vi.spyOn(owner, "withTemporaryRange");
	for (let iteration = 0; iteration < 100; iteration++) {
		const caret = prepareEditableCaret(tree, layout);
		expect(caret.status).toBe("ready");
		expect(caret.work).toBeLessThan(editableCaretLimits.maxWork);
	}
	expect(scoped).not.toHaveBeenCalled();
	expect(owner.selection.rangeCount).toBe(1);
	tree.setAttribute(id(), "style", "padding:20px");
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
});

it.each(["static", "fixed", "relative"])(
	"uses placed empty %s boxes under root scroll",
	(position) => {
		const { tree, id } = fixture(
			"",
			`#editor{position:${position};top:30px;left:12px}`,
		);
		const tail = tree.createElement("div");
		tree.setAttribute(tail, "style", "height:600px");
		const parent = tree.get(id()).parent;
		if (parent === null) throw new Error("Missing parent");
		tree.append(parent, tail);
		const before = rasterizeDocument(tree);
		documentScroll(tree).to(0, 20);
		const after = rasterizeDocument(tree);
		if (position === "fixed")
			expect(after.image.pixels).toEqual(before.image.pixels);
		else
			expect(after.metrics.caretStatus).toBe(
				position === "static" ? "clipped" : "painted",
			);
	},
);

it("rejects closed prepared capture ownership", () => {
	const { tree } = fixture();
	const prepared = prepareDocumentRaster(tree);
	tree.close();
	expect(() => prepared.rasterize()).toThrow();
});
