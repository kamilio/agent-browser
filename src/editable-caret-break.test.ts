import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner, existingDomRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	data = "Alpha\n",
	css = "",
	markup = '<div id="editor" contenteditable="plaintext-only"></div>',
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:50px;white-space:pre-wrap;color:red}${css}</style>${markup}<div style="height:500px"></div>`,
		"https://fixture.invalid/caret-terminal-break",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 120);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	tree.setTextContent(editor, data);
	const text = tree.get(editor).children[0];
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	owner.selection.collapse(text, data.length);
	return {
		tree,
		editor,
		text,
		actions,
		owner,
		rect: () => rangeClientRects(owner.selection.getRangeAt(0))[0],
	};
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	x: number,
	y: number,
) {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each(["\n", "\r", "\r\n", "\f"])(
	"paints exact terminal %j source-break coordinates",
	(separator) => {
		const { tree, text, rect } = fixture(`Alpha${separator}`);
		expect(tree.get(text).data).toBe(`Alpha${separator}`);
		const expected = rect();
		expect(expected).toMatchObject({ x: 0, y: 11, width: 0, height: 8 });
		const raster = rasterizeDocument(tree);
		expect(raster.metrics).toMatchObject({
			paintedCarets: 1,
			caretStatus: "painted",
		});
		for (let row = expected.y; row < expected.y + expected.height; row++)
			expect(pixel(raster.image, expected.x, row)).toEqual([255, 0, 0, 255]);
	},
);

it.each(["pre", "pre-wrap", "pre-line"])(
	"uses actual terminal break metadata under %s",
	(mode) => {
		const { tree, rect } = fixture("Alpha\n", `#editor{white-space:${mode}}`);
		const expected = rect();
		const raster = rasterizeDocument(tree);
		expect(raster.metrics.paintedCarets).toBe(1);
		expect(pixel(raster.image, expected.x, expected.y)).toEqual([
			255, 0, 0, 255,
		]);
	},
);

it.each(["\n\n", "\r\n\r\n", "\f\r\n\n", "\r\r"])(
	"proves consecutive terminal break chain %j",
	(tail) => {
		const { tree, rect } = fixture(`Alpha${tail}`);
		const expected = rect();
		const raster = rasterizeDocument(tree);
		expect(expected.y).toBeGreaterThan(11);
		expect(raster.metrics.paintedCarets).toBe(1);
		expect(pixel(raster.image, expected.x, expected.y)).toEqual([
			255, 0, 0, 255,
		]);
	},
);

it("paints immediately after actual plaintext Enter before later native typing", () => {
	const { tree, editor, actions, owner, rect } = fixture("old");
	actions.fill(tree.reference(editor), "Alpha");
	const range = owner.selection.getRangeAt(0);
	const before = rect();
	actions.keyboard.press("Enter");
	expect(tree.textContent(editor)).toBe("Alpha\n");
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(rect()).toMatchObject({ x: 0, y: before.y + 10, width: 0 });
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
	actions.keyboard.type("Beta");
	expect(tree.textContent(editor)).toBe("Alpha\nBeta");
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(1);
	expect(owner.selection.getRangeAt(0)).toBe(range);
});

it.each(["static", "absolute", "fixed"])(
	"preserves %s, root-scroll and crop coordinates",
	(position) => {
		const { tree, editor, rect } = fixture(
			"Alpha\n\n",
			`#editor{position:${position};${position === "static" ? "margin-top:30px;margin-left:20px" : "top:30px;left:20px"}}`,
		);
		documentScroll(tree).to(0, 10);
		const expected = rect();
		const full = rasterizeDocument(tree);
		expect(full.metrics.paintedCarets).toBe(1);
		expect(pixel(full.image, expected.x, expected.y)).toEqual([255, 0, 0, 255]);
		const clipped = rasterizeDocument(tree, {
			clip: { x: expected.x, y: expected.y + 10, width: 1, height: 3 },
		});
		expect(clipped.metrics.paintedCarets).toBe(1);
		expect([...clipped.image.pixels]).toEqual([
			255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
		]);
		expect(
			rasterizeDocument(tree, { element: tree.reference(editor) }).metrics
				.paintedCarets,
		).toBe(1);
	},
);

it("lets later opaque paint cover the terminal caret at its next-line position", () => {
	const { tree, owner } = fixture(
		"Alpha\n",
		"#cover{position:absolute;left:0;top:10px;width:20px;height:20px;background:blue;z-index:1}",
		'<div id="editor" contenteditable="plaintext-only"></div><div id="cover"></div>',
	);
	const range = owner.selection.getRangeAt(0);
	owner.selection.removeAllRanges();
	const before = rasterizeDocument(tree);
	owner.selection.addRange(range);
	const after = rasterizeDocument(tree);
	expect(after.metrics.paintedCarets).toBe(1);
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it.each(["blue", "transparent"])(
	"uses source %s color without inventing a caret style",
	(color) => {
		const { tree, rect } = fixture("Alpha\n", `#editor{color:${color}}`);
		const expected = rect();
		const raster = rasterizeDocument(tree);
		expect(raster.metrics.caretStatus).toBe(
			color === "blue" ? "painted" : "transparent",
		);
		expect(pixel(raster.image, expected.x, expected.y)).toEqual(
			color === "blue" ? [0, 0, 255, 255] : [255, 255, 255, 255],
		);
	},
);

it("keeps Range identity, source and revision without new owners, ranges or mutations", () => {
	const { tree, owner, text } = fixture("Alpha\r\n\n");
	const range = owner.selection.getRangeAt(0);
	const revision = tree.revision;
	const createRange = vi.spyOn(owner, "createRange");
	const mutations = vi.fn();
	const unsubscribe = tree.onMutation(mutations);
	const first = rasterizeDocument(tree);
	const second = rasterizeDocument(tree);
	expect(first.metrics.paintedCarets).toBe(1);
	expect(second.image.pixels).toEqual(first.image.pixels);
	expect(existingDomRangeOwner(tree)).toBe(owner);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(createRange).not.toHaveBeenCalled();
	expect(mutations).not.toHaveBeenCalled();
	expect(tree.get(text).data).toBe("Alpha\r\n\n");
	expect(tree.revision).toBe(revision);
	unsubscribe();
});

it("preserves lowered mapping-budget skips for a terminal-break candidate", () => {
	const { tree } = fixture("Alpha\n\n");
	const plan = prepareEditableCaret(tree, layoutDocument(tree), 32);
	expect(plan.status).toBe("limited");
	expect(plan.work).toBeLessThanOrEqual(32);
});

it.each(["\n", "\r\n", "\n\n\f"])(
	"does not invent an all-break %j paint anchor",
	(data) => {
		const { tree } = fixture(data);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			paintedCarets: 0,
			caretStatus: "unsupported",
		});
	},
);

it("rejects split-node CRLF metadata even when a preceding glyph exists", () => {
	const { tree, text, owner } = fixture("Alpha\r\n");
	owner.splitText(text, 6);
	owner.selection.collapse(text, 6);
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
});

it("rejects a break-only text node whose preceding glyph belongs to another node", () => {
	const { tree, editor, text, owner } = fixture("Alpha");
	const tail = tree.createText("\n");
	tree.append(editor, tail);
	owner.selection.collapse(tail, 1);
	expect(tree.get(text).data).toBe("Alpha");
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedCarets: 0,
		caretStatus: "unsupported",
	});
});

it("rejects a nonterminal break offset and another node's following glyph", () => {
	const { tree, text, editor, owner } = fixture("Alpha\n\n");
	owner.selection.collapse(text, 6);
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	owner.selection.collapse(text, 7);
	tree.append(editor, tree.createText("Beta"));
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedCarets: 0,
		caretStatus: "unsupported",
	});
});

it("does not bridge collapsed spaces before a pre-line terminal break", () => {
	const { tree } = fixture("Alpha \n", "#editor{white-space:pre-line}");
	expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
});

it.each(["missing", "offset", "split", "font", "following", "forced"])(
	"requires exact %s source-break metadata rather than guessing geometry",
	(change) => {
		const { tree } = fixture("Alpha\n");
		const layout = layoutDocument(tree);
		const contexts = layout.contexts.map((context) => ({
			...context,
			lines: context.lines.map((line) => {
				const boundary = line.sourceBreak;
				if (!boundary) return line;
				if (change === "missing") return { ...line, sourceBreak: undefined };
				return {
					...line,
					forcedBreak: change === "forced" ? false : line.forcedBreak,
					sourceBreak: {
						...boundary,
						followingLine:
							change === "following" ? undefined : boundary.followingLine,
						fontSize:
							change === "font" ? boundary.fontSize + 1 : boundary.fontSize,
						sources:
							change === "split"
								? [...boundary.sources, boundary.sources[0]]
								: boundary.sources.map((source) => ({
										...source,
										offset:
											change === "offset" ? source.offset - 1 : source.offset,
									})),
					},
				};
			}),
		}));
		expect(prepareEditableCaret(tree, { ...layout, contexts }).status).toBe(
			"unsupported",
		);
	},
);
