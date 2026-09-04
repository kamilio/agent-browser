import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner, existingDomRangeOwner } from "./dom-range.js";
import {
	editableCaretCapabilities,
	editableCaretLimits,
	prepareEditableCaret,
} from "./editable-caret.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import * as rangeGeometry from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	content = '<div id="editor" contenteditable>ABC DEF</div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px}#editor{width:120px;min-height:16px;color:red}button{font-size:8px}${css}</style>${content}`,
		"https://fixture.invalid/editable-caret",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const text = (selector = "#editor") => tree.get(id(selector)).children[0];
	const focus = () =>
		documentInteractions(tree).focus.focus(tree.reference(id()));
	const collapse = (offset = 2, node = text()) => {
		focus();
		domRangeOwner(tree).selection.collapse(node, offset);
	};
	return { tree, id, text, focus, collapse };
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	x: number,
	y: number,
) {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("looks up an absent owner without allocation or observer registration", () => {
	const { tree, focus } = fixture();
	const mutation = vi.spyOn(tree, "onMutation");
	const close = vi.spyOn(tree, "onClose");
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(mutation).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
	const before = rasterizeDocument(tree);
	focus();
	const after = rasterizeDocument(tree);
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(after.metrics).toMatchObject({
		paintedCarets: 0,
		caretStatus: "absent",
		caretWork: 0,
	});
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it("preserves exact owner and selection identity including closed lookup", () => {
	const { tree } = fixture();
	const owner = domRangeOwner(tree);
	expect(existingDomRangeOwner(tree)).toBe(owner);
	expect(existingDomRangeOwner(tree)?.selection).toBe(owner.selection);
	owner.close();
	expect(existingDomRangeOwner(tree)).toBe(owner);
	expect(rasterizeDocument(tree).metrics.caretStatus).toBe("closed");
	tree.close();
	expect(existingDomRangeOwner(tree)).toBe(owner);
	expect(() => rasterizeDocument(tree)).toThrow(/closed/);
});

it("keeps lookup absent even after an untouched document closes", () => {
	const { tree } = fixture();
	tree.close();
	expect(existingDomRangeOwner(tree)).toBeUndefined();
});

it("paints one deterministic collapsed glyph edge in source text color", () => {
	const { tree, collapse } = fixture();
	const before = rasterizeDocument(tree);
	collapse();
	const range = domRangeOwner(tree).selection.getRangeAt(0);
	const rect = rangeClientRects(range)[0];
	const first = rasterizeDocument(tree);
	const second = rasterizeDocument(tree);
	expect(first.metrics).toMatchObject({
		paintedCarets: 1,
		skippedCarets: 0,
		caretStatus: "painted",
	});
	expect(first.image.pixels).toEqual(second.image.pixels);
	expect(first.image.pixels).not.toEqual(before.image.pixels);
	for (let row = Math.ceil(rect.y); row < rect.y + rect.height; row++)
		expect(pixel(first.image, rect.x, row)).toEqual([255, 0, 0, 255]);
	expect(domRangeOwner(tree).selection.getRangeAt(0)).toBe(range);
	expect(editableCaretCapabilities.blinking).toBe(false);
});

it("removes the caret on blur without clearing shared selection", () => {
	const { tree, collapse } = fixture();
	collapse();
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
	documentInteractions(tree).focus.focus(null);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		caretStatus: "unfocused",
		paintedCarets: 0,
	});
	expect(domRangeOwner(tree).selection.rangeCount).toBe(1);
});

it("follows actual fill and type completion in the shared selection", () => {
	const { tree, id } = fixture();
	const actions = documentInteractions(tree);
	actions.fill(tree.reference(id()), "AB");
	const before = rasterizeDocument(tree);
	expect(before.metrics.paintedCarets).toBe(1);
	actions.keyboard.type("C");
	expect(domRangeOwner(tree).selection.focusOffset).toBe(3);
	const after = rasterizeDocument(tree);
	expect(after.metrics.paintedCarets).toBe(1);
	expect(after.image.pixels).not.toEqual(before.image.pixels);
});

it("reads live selection-only changes when reusing a prepared layout", () => {
	const { tree, collapse, text } = fixture();
	collapse(1);
	const prepared = prepareDocumentRaster(tree);
	const before = prepared.rasterize();
	domRangeOwner(tree).selection.collapse(text(), 3);
	const after = prepared.rasterize();
	expect(after.metrics.paintedCarets).toBe(1);
	expect(after.image.pixels).not.toEqual(before.image.pixels);
});

it("skips the caret for expanded selection while painting bounded highlights", () => {
	const { tree, focus, text } = fixture();
	focus();
	const before = rasterizeDocument(tree);
	domRangeOwner(tree).selection.setBaseAndExtent(text(), 1, text(), 3);
	const after = rasterizeDocument(tree);
	expect(after.metrics).toMatchObject({
		caretStatus: "noncollapsed",
		skippedCarets: 1,
		paintedCarets: 0,
		paintedSelectionGlyphs: 2,
		selectionStatus: "painted",
	});
	expect(after.image.pixels).not.toEqual(before.image.pixels);
	documentInteractions(tree).focus.focus(null);
	expect(rasterizeDocument(tree).image.pixels).toEqual(before.image.pixels);
});

it.each(["hidden", "inert", "contenteditable"])(
	"stops painting after the focused root changes %s",
	(attribute) => {
		const { tree, id, collapse } = fixture();
		collapse();
		tree.setAttribute(
			id(),
			attribute,
			attribute === "contenteditable" ? "false" : "",
		);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	},
);

it.each(["display:none", "visibility:hidden"])(
	"skips a hidden text source with %s",
	(style) => {
		const { tree, id, collapse, text } = fixture(
			'<div id="editor" contenteditable><span id="child">ABC</span></div>',
		);
		collapse(1, text("#child"));
		tree.setAttribute(id("#child"), "style", style);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	},
);

it.each(['contenteditable="false"', "inert"])(
	"skips selected text inside a protected %s island",
	(attributes) => {
		const { tree, text, collapse } = fixture(
			`<div id="editor" contenteditable><span id="child" ${attributes}>ABC</span></div>`,
		);
		collapse(1, text("#child"));
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			paintedCarets: 0,
			caretStatus: "outside-editable",
		});
	},
);

it("does not use selection in another editable root or detached retained content", () => {
	const { tree, text, collapse, id } = fixture(
		'<div id="editor" contenteditable>ABC</div><div id="other" contenteditable>DEF</div>',
	);
	collapse(1, text("#other"));
	expect(rasterizeDocument(tree).metrics.caretStatus).toBe("outside-editable");
	collapse();
	tree.remove(id());
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
});

it.each([
	['<div id="editor" contenteditable></div>', 0],
	['<div id="editor" contenteditable>AB CD</div>', 3],
])(
	"distinguishes an empty-editor strut from ambiguous soft-wrap affinity",
	(content, offset) => {
		const { tree, id, text, collapse } = fixture(
			content,
			"#editor{width:18px;white-space:pre-wrap}",
		);
		collapse(offset, offset === 0 ? id() : text());
		const result = rasterizeDocument(tree);
		expect(result.metrics).toMatchObject({
			paintedCarets: offset === 0 ? 1 : 0,
			skippedCarets: offset === 0 ? 0 : 1,
			caretStatus: offset === 0 ? "painted" : "unsupported",
		});
	},
);

it.each(["absolute", "fixed"])(
	"keeps %s editor geometry aligned with projected glyphs after root scrolling",
	(position) => {
		const { tree, collapse } = fixture(
			'<div id="editor" contenteditable>ABC</div><div style="height:500px"></div>',
			`#editor{position:${position};left:20px;top:60px}`,
		);
		collapse(1);
		documentScroll(tree).to(0, 30);
		const result = rasterizeDocument(tree);
		const rect = rangeClientRects(
			domRangeOwner(tree).selection.getRangeAt(0),
		)[0];
		expect(result.metrics.paintedCarets).toBe(1);
		expect(pixel(result.image, rect.x, Math.ceil(rect.y + 3))).toEqual([
			255, 0, 0, 255,
		]);
	},
);

it("clips the caret to explicit crop boundaries and the editor element crop", () => {
	const { tree, collapse, id } = fixture();
	collapse(1);
	const rect = rangeClientRects(domRangeOwner(tree).selection.getRangeAt(0))[0];
	const included = rasterizeDocument(tree, {
		clip: { x: rect.x, y: rect.y + 2, width: 1, height: 3 },
	});
	expect(included.metrics.paintedCarets).toBe(1);
	expect([...included.image.pixels]).toEqual([
		255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
	]);
	const excluded = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: rect.x, height: 20 },
	});
	expect(excluded.metrics).toMatchObject({
		paintedCarets: 0,
		clippedCarets: 1,
	});
	expect(
		rasterizeDocument(tree, { element: tree.reference(id()) }).metrics
			.paintedCarets,
	).toBe(1);
});

it.each(["absolute", "fixed"])(
	"lets a later opaque positioned sibling cover the caret (%s)",
	(position) => {
		const { tree, collapse } = fixture(
			'<div id="editor" contenteditable>ABC</div><div id="cover"></div>',
			`#cover{position:${position};left:0;top:0;width:80px;height:30px;background:blue;z-index:1}`,
		);
		const before = rasterizeDocument(tree);
		collapse(1);
		const after = rasterizeDocument(tree);
		expect(after.metrics.paintedCarets).toBe(1);
		expect(after.image.pixels).toEqual(before.image.pixels);
	},
);

it("does not unify input or textarea carets with editable selection", () => {
	const { tree, id, text } = fixture(
		'<div id="editor" contenteditable>ABC</div><input id="input"><textarea id="area">DEF</textarea>',
	);
	domRangeOwner(tree).selection.collapse(text(), 1);
	for (const selector of ["#input", "#area"]) {
		documentInteractions(tree).focus.focus(tree.reference(id(selector)));
		expect(rasterizeDocument(tree).metrics.caretStatus).toBe("unfocused");
	}
});

it("bounds caret work independently and skips mapping exhaustion instead of failing the capture", () => {
	const { tree, collapse } = fixture();
	collapse();
	const layout = layoutDocument(tree);
	expect(prepareEditableCaret(tree, layout, 1)).toMatchObject({
		status: "limited",
		work: 1,
	});
	expect(() => prepareEditableCaret(tree, layout, 0)).toThrow(/limit/);
	expect(() =>
		prepareEditableCaret(tree, layout, editableCaretLimits.maxWork + 1),
	).toThrow(/limit/);
	const result = rasterizeDocument(tree);
	expect(result.metrics.caretWork).toBeLessThanOrEqual(
		editableCaretLimits.maxWork,
	);
	expect(result.metrics.caretWork).toBeGreaterThan(0);
});

it("projects normal-flow caret through root scroll and clips it when offscreen", () => {
	const { tree, collapse } = fixture(
		'<div style="height:60px"></div><div id="editor" contenteditable>ABC</div><div style="height:500px"></div>',
	);
	collapse(1);
	documentScroll(tree).to(0, 30);
	const rect = rangeClientRects(domRangeOwner(tree).selection.getRangeAt(0))[0];
	const visible = rasterizeDocument(tree);
	expect(visible.metrics.paintedCarets).toBe(1);
	expect(pixel(visible.image, rect.x, Math.ceil(rect.y + 3))).toEqual([
		255, 0, 0, 255,
	]);
	documentScroll(tree).to(0, 120);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedCarets: 0,
		clippedCarets: 1,
	});
});

it.each([
	["a\u0301b", 1],
	["A😀B", 2],
	["A   B", 3],
])(
	"skips unsupported source mapping for %s without changing otherwise renderable pixels",
	(content, offset) => {
		const { tree, collapse } = fixture(
			`<div id="editor" contenteditable>${content}</div>`,
		);
		const before = rasterizeDocument(tree);
		collapse(offset);
		const after = rasterizeDocument(tree);
		expect(after.metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
			skippedCarets: 1,
		});
		expect(after.image.pixels).toEqual(before.image.pixels);
	},
);

it("leaves transparent source text transparent rather than inventing a caret color", () => {
	const { tree, collapse } = fixture(undefined, "#editor{color:transparent}");
	const before = rasterizeDocument(tree);
	collapse();
	const after = rasterizeDocument(tree);
	expect(after.metrics).toMatchObject({
		caretStatus: "transparent",
		paintedCarets: 0,
	});
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it("retains source isolation when a different document owns selection", () => {
	const first = fixture();
	const second = fixture();
	first.collapse();
	second.focus();
	expect(rasterizeDocument(second.tree).metrics.caretStatus).toBe("absent");
	expect(existingDomRangeOwner(second.tree)).toBeUndefined();
});

it.each(["resource-limit", "unsupported"] as const)(
	"skips a %s mapping failure without damaging page capture",
	(code) => {
		const { tree, collapse } = fixture();
		const before = rasterizeDocument(tree);
		collapse();
		vi.spyOn(rangeGeometry, "rangeClientRects").mockImplementation(() => {
			throw new AgentBrowserError(code, "Injected mapping boundary");
		});
		const after = rasterizeDocument(tree);
		expect(after.metrics).toMatchObject({
			paintedCarets: 0,
			skippedCarets: 1,
			caretStatus: code === "resource-limit" ? "limited" : "unsupported",
		});
		expect(after.image.pixels).toEqual(before.image.pixels);
	},
);

it("charges the painted caret pixels to the existing raster budget", () => {
	const { tree, focus, collapse } = fixture();
	focus();
	const baseline = rasterizeDocument(tree);
	collapse(1);
	const painted = rasterizeDocument(tree);
	expect(painted.metrics.work - baseline.metrics.work).toBe(8);
});
