import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { editableCaretLimits, prepareEditableCaret } from "./editable-caret.js";
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
	content = '<div id="editor" contenteditable><b id="first">Hello</b><i id="last">World</i></div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:20px;color:red}#last{color:blue}${css}</style>${content}`,
		"https://fixture.invalid/caret-elements",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(id()));
	const owner = domRangeOwner(tree);
	const text = (selector: string) => tree.get(id(selector)).children[0];
	const collapse = (end = false) => {
		owner.selection.collapse(id(), end ? tree.get(id()).children.length : 0);
	};
	const textRect = (node: number, offset: number) =>
		owner.withTemporaryRange(owner.selection.getRangeAt(0), (temporary) => {
			temporary.update({ node, offset }, { node, offset });
			return rangeClientRects(temporary)[0];
		});
	return { tree, id, actions, owner, text, collapse, textRect };
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each(["ArrowLeft", "ArrowRight"])(
	"paints the actual Ctrl+A then %s container caret without changing its Range",
	(key) => {
		const { tree, id, actions, owner, text, textRect } = fixture();
		actions.keyboard.press("Control+A");
		expect(owner.selection.toString()).toBe("HelloWorld");
		actions.keyboard.press(key);
		const end = key === "ArrowRight";
		const range = owner.selection.getRangeAt(0);
		const point = { node: id(), offset: end ? 2 : 0 };
		expect(range.start).toEqual(point);
		expect(range.end).toEqual(point);
		expect(rangeClientRects(range)).toEqual([]);
		const source = text(end ? "#last" : "#first");
		const rect = textRect(source, end ? 5 : 0);
		const setStart = vi.spyOn(range, "setStart");
		const update = vi.spyOn(range, "update");
		const result = rasterizeDocument(tree);
		expect(result.metrics).toMatchObject({
			caretStatus: "painted",
			paintedCarets: 1,
		});
		expect(pixel(result.image, rect.x, Math.ceil(rect.y + 3))).toEqual(
			end ? [0, 0, 255, 255] : [255, 0, 0, 255],
		);
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(owner.selection.anchor).toEqual(point);
		expect(owner.selection.focus).toEqual(point);
		expect(owner.selection.rangeCount).toBe(1);
		expect(setStart).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
		expect(tree.textContent(id())).toBe("HelloWorld");
	},
);

it.each([false, true])(
	"maps an exact nested inline edge with end=%s",
	(end) => {
		const { tree, text, collapse, textRect, owner } = fixture(
			'<div id="editor" contenteditable><b><span id="first">Hello</span></b><i><em id="last">World</em></i></div>',
		);
		collapse(end);
		const range = owner.selection.getRangeAt(0);
		const point = range.start;
		const source = text(end ? "#last" : "#first");
		const rect = textRect(source, end ? 5 : 0);
		const caret = prepareEditableCaret(tree, layoutDocument(tree));
		expect(caret).toMatchObject({
			status: "ready",
			anchor: {
				ref: tree.reference(source),
				x: rect.x,
				y: rect.y,
				height: rect.height,
			},
		});
		expect(range.start).toBe(point);
		expect(owner.selection.direction).toBe("none");
	},
);

it.each([false, true])(
	"maps direct text at a host outer boundary with end=%s",
	(end) => {
		const { tree, id, collapse, textRect } = fixture(
			'<div id="editor" contenteditable>Hello</div>',
		);
		collapse(end);
		const source = tree.get(id()).children[0];
		const rect = textRect(source, end ? 5 : 0);
		expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
			status: "ready",
			anchor: { ref: tree.reference(source), x: rect.x, y: rect.y },
		});
	},
);

it("leaves subsequent keyboard movement and source mutations native", () => {
	const { tree, actions, owner, text } = fixture();
	actions.keyboard.press("Control+A");
	actions.keyboard.press("ArrowLeft");
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
	actions.keyboard.press("ArrowRight");
	expect(owner.selection.focus).toEqual({ node: text("#first"), offset: 1 });
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
});

it.each([
	"",
	"<br>Hello",
	"<span></span>Hello",
	"<!--edge-->Hello",
	"  Hello",
	"<b>  Hello</b>",
	"<span style='display:block'>Hello</span>",
	"<span style='display:inline-block'>Hello</span>",
	"<span style='margin-left:2px'>Hello</span>",
	"<span style='padding-left:2px'>Hello</span>",
	"<span style='border:1px solid red'>Hello</span>",
	"<span style='position:relative;left:2px'>Hello</span>",
	"<span style='position:absolute;left:2px'>Hello</span>",
	"a\u0301b",
	"אבג",
])("does not guess past an unsupported starting edge: %s", (content) => {
	const { tree, owner, collapse } = fixture(
		`<div id="editor" contenteditable>${content}</div>`,
	);
	owner.selection.removeAllRanges();
	const before = rasterizeDocument(tree);
	collapse();
	const after = rasterizeDocument(tree);
	expect(after.metrics).toMatchObject({
		caretStatus: "unsupported",
		paintedCarets: 0,
	});
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it.each(["Hello<br>", "Hello<span></span>", "Hello<!--edge-->", "Hello  "])(
	"does not skip an unsupported ending edge: %s",
	(content) => {
		const { tree, collapse } = fixture(
			`<div id="editor" contenteditable>${content}</div>`,
		);
		collapse(true);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it.each(["interior", "descendant"])(
	"keeps %s element boundaries explicitly unsupported",
	(kind) => {
		const { tree, id, owner } = fixture();
		owner.selection.collapse(
			kind === "interior" ? id() : id("#first"),
			kind === "interior" ? 1 : 0,
		);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it.each(["inline", "flex", "flow-root"])(
	"does not claim host display %s support",
	(display) => {
		const { tree, collapse } = fixture(
			undefined,
			`#editor{display:${display}}`,
		);
		collapse();
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it.each([
	'contenteditable="false"',
	"inert",
	'style="visibility:hidden"',
	'style="display:none"',
])("does not paint inside a protected or hidden edge %s", (attributes) => {
	const { tree, owner, collapse } = fixture(
		`<div id="editor" contenteditable><span ${attributes}>Hello</span><i>World</i></div>`,
	);
	owner.selection.removeAllRanges();
	const before = rasterizeDocument(tree);
	collapse();
	const after = rasterizeDocument(tree);
	expect(after.metrics.paintedCarets).toBe(0);
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it.each(["hidden", "inert", "contenteditable"])(
	"stops an outer-edge caret after root %s changes",
	(attribute) => {
		const { tree, id, collapse } = fixture();
		collapse();
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
		tree.setAttribute(
			id(),
			attribute,
			attribute === "contenteditable" ? "false" : "",
		);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	},
);

it("does not project a boundary belonging to another editable root", () => {
	const { tree, id, owner } = fixture(
		'<div id="editor" contenteditable>Hello</div><div id="other" contenteditable>World</div>',
	);
	owner.selection.collapse(id("#other"), 0);
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
});

it.each(["pre", "pre-wrap", "pre-line"])(
	"reuses exact same-source terminal break geometry under %s",
	(mode) => {
		const { tree, id, owner, collapse, textRect } = fixture(
			'<div id="editor" contenteditable></div>',
			`#editor{white-space:${mode}}`,
		);
		tree.setTextContent(id(), "Hello\n\n");
		const source = tree.get(id()).children[0];
		collapse(true);
		const rect = textRect(source, 7);
		const range = owner.selection.getRangeAt(0);
		const after = rasterizeDocument(tree);
		expect(after.metrics).toMatchObject({
			paintedCarets: 1,
			caretStatus: "painted",
		});
		expect(pixel(after.image, rect.x, Math.ceil(rect.y + 3))).toEqual([
			255, 0, 0, 255,
		]);
		expect(range.start).toEqual({ node: id(), offset: 1 });
	},
);

it.each(["static", "absolute", "fixed"])(
	"preserves %s projection and source color under scroll",
	(position) => {
		const prefix =
			position === "static" ? '<div style="height:60px"></div>' : "";
		const { tree, text, collapse, textRect } = fixture(
			`${prefix}<div id="editor" contenteditable><b id="first">Hello</b><i id="last">World</i></div><div style="height:500px"></div>`,
			`#editor{position:${position};left:20px;top:60px}`,
		);
		collapse(true);
		documentScroll(tree).to(0, 30);
		const rect = textRect(text("#last"), 5);
		const result = rasterizeDocument(tree);
		expect(result.metrics.paintedCarets).toBe(1);
		expect(pixel(result.image, rect.x, Math.ceil(rect.y + 3))).toEqual([
			0, 0, 255, 255,
		]);
	},
);

it("clips mapped caret pixels without inventing a new crop boundary", () => {
	const { tree, text, collapse, textRect } = fixture();
	collapse(true);
	const rect = textRect(text("#last"), 5);
	const included = rasterizeDocument(tree, {
		clip: { x: rect.x, y: rect.y + 2, width: 1, height: 3 },
	});
	expect(included.metrics.paintedCarets).toBe(1);
	expect([...included.image.pixels]).toEqual([
		0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
	]);
	const excluded = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: rect.x, height: 30 },
	});
	expect(excluded.metrics).toMatchObject({
		paintedCarets: 0,
		clippedCarets: 1,
	});
});

it.each(["absolute", "fixed"])(
	"keeps an opaque %s cover above the mapped caret",
	(position) => {
		const { tree, collapse, owner } = fixture(
			'<div id="editor" contenteditable><b>Hello</b><i>World</i></div><div id="cover"></div>',
			`#cover{position:${position};left:0;top:0;width:120px;height:30px;background:blue;z-index:1}`,
		);
		owner.selection.removeAllRanges();
		const before = rasterizeDocument(tree);
		collapse();
		const after = rasterizeDocument(tree);
		expect(after.metrics.paintedCarets).toBe(1);
		expect(after.image.pixels).toEqual(before.image.pixels);
	},
);

it("preserves transparent source color at the mapped edge", () => {
	const { tree, collapse, owner } = fixture(
		undefined,
		"#first{color:transparent}",
	);
	owner.selection.removeAllRanges();
	const before = rasterizeDocument(tree);
	collapse();
	const after = rasterizeDocument(tree);
	expect(after.metrics).toMatchObject({
		caretStatus: "transparent",
		paintedCarets: 0,
	});
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it("charges mapping to the existing caret work budget", () => {
	const { tree, collapse, owner } = fixture();
	collapse();
	const point = owner.selection.anchor;
	const layout = layoutDocument(tree);
	expect(prepareEditableCaret(tree, layout, 1)).toMatchObject({
		status: "limited",
		work: 1,
	});
	const caret = prepareEditableCaret(tree, layout);
	expect(caret.status).toBe("ready");
	expect(caret.work).toBeLessThanOrEqual(editableCaretLimits.maxWork);
	expect(owner.selection.anchor).toBe(point);
});

it("charges mapped caret pixels to the existing raster budget", () => {
	const { tree, collapse, owner } = fixture();
	owner.selection.removeAllRanges();
	const before = rasterizeDocument(tree);
	collapse();
	const after = rasterizeDocument(tree);
	expect(after.metrics.work - before.metrics.work).toBe(8);
});

it.each(["resource-limit", "unsupported"] as const)(
	"releases the temporary geometry range after %s",
	(code) => {
		const { tree, collapse, owner } = fixture();
		collapse();
		const publicRange = owner.selection.getRangeAt(0);
		const point = publicRange.start;
		const held: unknown[] = [];
		vi.spyOn(rangeGeometry, "rangeClientRects").mockImplementation((range) => {
			held.push(range);
			expect(range).not.toBe(publicRange);
			throw new AgentBrowserError(code, "Injected geometry failure");
		});
		const layout = layoutDocument(tree);
		for (let index = 0; index < 4100; index++)
			expect(prepareEditableCaret(tree, layout).status).toBe(
				code === "resource-limit" ? "limited" : "unsupported",
			);
		expect(held).toHaveLength(4100);
		expect(() => owner.createRange()).not.toThrow();
		expect(owner.selection.getRangeAt(0)).toBe(publicRange);
		expect(publicRange.start).toBe(point);
	},
);

it("reports exhausted live-range capacity as limited without changing selection", () => {
	const { tree, collapse, owner } = fixture();
	collapse();
	const publicRange = owner.selection.getRangeAt(0);
	const held = Array.from({ length: 4095 }, () => owner.createRange());
	expect(prepareEditableCaret(tree, layoutDocument(tree)).status).toBe(
		"limited",
	);
	expect(held).toHaveLength(4095);
	expect(owner.selection.getRangeAt(0)).toBe(publicRange);
});
