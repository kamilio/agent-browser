import { afterEach, expect, it } from "vitest";
import { normalizeBorderStyle } from "./css-border.js";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { prepareEditableSelection } from "./editable-selection.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { consolidateSourceGlyphs } from "./text-source-glyphs.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0}main{font-size:8px;line-height:12px}${css}</style></head><body>${markup}</body></html>`,
		"https://fixture.invalid/generated-content-formatting",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(64, 64);
	return { tree, queries, id, styles };
}

function textOrder(formatting: FormattingTree): string {
	const text: string[] = [];
	const pending = [formatting.root];
	while (pending.length) {
		const node = formatting.nodes[pending.pop() as number];
		if (node.kind === "text") text.push(node.text ?? "");
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	return text.join("");
}

function pseudoBox(
	formatting: FormattingTree,
	owner: number,
	name: "before" | "after" = "before",
) {
	const found = formatting.nodes.find(
		(node) =>
			node.generatedContent?.owner === owner &&
			node.generatedContent.name === name &&
			node.kind !== "text",
	);
	if (!found) throw new Error(`Missing generated ${name} box`);
	return found;
}

function verifyTree(formatting: FormattingTree) {
	const seen = new Set<number>();
	const pending = [formatting.root];
	while (pending.length) {
		const node = formatting.nodes[pending.pop() as number];
		expect(seen.has(node.id)).toBe(false);
		seen.add(node.id);
		for (const child of node.children) {
			expect(formatting.nodes[child].parent).toBe(node.id);
			if (node.kind === "inline" || node.contentMode === "inline")
				expect(formatting.nodes[child].level).toBe("inline");
			if (node.contentMode === "blocks")
				expect(formatting.nodes[child].level).toBe("block");
			pending.push(child);
		}
	}
	expect(seen.size).toBe(formatting.nodes.length);
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function colorPixels(
	image: ReturnType<typeof rasterizeDocument>["image"],
	color: readonly number[],
) {
	let count = 0;
	for (let offset = 0; offset < image.pixels.length; offset += 4)
		if (
			color.every((channel, index) => image.pixels[offset + index] === channel)
		)
			count++;
	return count;
}

it("orders nested generated content without adding DOM nodes or action targets", () => {
	const { tree, queries, id } = fixture(
		'<main id="target">A<span>B</span>C</main>',
		'#target::before{content:"["}#target::after{content:"]"}span::before{content:"("}span::after{content:")"}',
	);
	const owner = id();
	const revision = tree.revision;
	const count = tree.nodeCount;
	const children = [...tree.get(owner).children];
	const controls = documentGeneratedControls(tree);
	const targets = controls.metrics().targets;
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe("[A(B)C]");
	verifyTree(formatting);
	expect(formatting.issues).toEqual({});
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.get(owner).children).toEqual(children);
	expect(tree.textContent(owner)).toBe("ABC");
	expect(queries.querySelectorAll("#target::before, #target::after")).toEqual(
		[],
	);
	expect(queries.querySelectorAll("#target > *")).toEqual([id("span")]);
	expect(controls.metrics().targets).toBe(targets);
	const generated = formatting.nodes.filter((node) => node.generatedContent);
	expect(generated).toHaveLength(8);
	for (const node of generated) {
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(Object.isFrozen(node)).toBe(true);
		expect(Object.isFrozen(node.generatedContent)).toBe(true);
	}
});

it("keeps empty content as a real box distinct from normal and none", () => {
	const { tree, id, styles } = fixture(
		'<main id="target"></main>',
		'#target::before{content:""}#target::after{content:none}',
	);
	expect(styles.generatedContent(id(), "before")?.content).toBe("");
	expect(styles.generatedContent(id(), "after")).toBeUndefined();
	const formatting = buildFormattingTree(tree);
	expect(pseudoBox(formatting, id())).toMatchObject({
		kind: "inline",
		children: [],
		visible: true,
	});
	expect(formatting.metrics.textCodeUnits).toBe(0);
	expect(formatting.nodes.filter((node) => node.generatedContent)).toHaveLength(
		1,
	);
	verifyTree(formatting);
});

it.each(["none", "normal"])("does not generate content:%s", (value) => {
	const { tree } = fixture(
		'<main id="target">body</main>',
		`#target::before{content:${value}}#target::after{content:${value}}`,
	);
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe("body");
	expect(formatting.nodes.some((node) => node.generatedContent)).toBe(false);
});

it("normalizes block pseudo children and splits their inline originating element", () => {
	const { tree, id } = fixture(
		'<main><span id="target">body</span></main>',
		'#target::before{content:"before";display:block}#target::after{content:"after";display:block}',
	);
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe("beforebodyafter");
	for (const name of ["before", "after"] as const)
		expect(pseudoBox(formatting, id(), name)).toMatchObject({
			kind: "block",
			level: "block",
			contentMode: "inline",
		});
	const fragments = formatting.nodes.filter(
		(node) => node.ref === tree.reference(id()),
	);
	expect(fragments).toHaveLength(3);
	expect(fragments.map((node) => node.fragmentIndex)).toEqual([0, 1, 2]);
	verifyTree(formatting);
});

it("places generated content around the children of a display:contents owner", () => {
	const { tree, id } = fixture(
		'<main><section id="target">A<div>B</div>C</section></main>',
		'#target{display:contents}#target::before{content:"["}#target::after{content:"]"}',
	);
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe("[ABC]");
	expect(
		formatting.nodes.some((node) => node.ref === tree.reference(id())),
	).toBe(false);
	expect(pseudoBox(formatting, id()).kind).toBe("inline");
	verifyTree(formatting);
});

it.each([
	'<input id="target" value="native">',
	'<input id="target" type="hidden" style="display:block" value="native">',
	'<textarea id="target">native</textarea>',
	'<select id="target"><option>native</option></select>',
	'<img id="target" alt="native">',
	'<canvas id="target">native</canvas>',
	'<svg id="target" width="4" height="4"></svg>',
])("does not generate pseudo boxes for replaced content %s", (markup) => {
	const { tree, id } = fixture(
		`<main>${markup}</main>`,
		'#target::before{content:"before"}#target::after{content:"after"}',
	);
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.some((node) => node.generatedContent?.owner === id()),
	).toBe(false);
});

it("does not expose hidden inputs even when their pseudo visibility is explicit", () => {
	const { tree, id } = fixture(
		'<main><input id="target" type="hidden"></main>',
		'#target{display:block}#target::before{content:"hidden";display:block;visibility:visible}',
	);
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.some((node) => node.ref === tree.reference(id())),
	).toBe(false);
	expect(formatting.nodes.some((node) => node.generatedContent)).toBe(false);
	expect(textOrder(formatting)).toBe("");
});

it.each(["input", "textarea", "select", "img"])(
	"does not generate around a display:contents %s",
	(tag) => {
		const { tree } = fixture(
			`<main><${tag} id="target"></${tag}></main>`,
			'#target{display:contents}#target::before{content:"before"}#target::after{content:"after"}',
		);
		expect(
			buildFormattingTree(tree).nodes.some((node) => node.generatedContent),
		).toBe(false);
	},
);

it("suppresses display:none without treating visibility:hidden as non-generation", () => {
	const { tree, id } = fixture(
		'<main id="target">body</main><div id="hidden"></div>',
		'#target::before{content:"before";display:none}#target::after{content:"after";visibility:hidden}#hidden{display:none}#hidden::before{content:"hidden"}',
	);
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe("bodyafter");
	expect(pseudoBox(formatting, id(), "after").visible).toBe(false);
	expect(
		formatting.nodes.some(
			(node) => node.generatedContent?.owner === id("#hidden"),
		),
	).toBe(false);
});

it("uses pseudo cascade and originating-element typography without copying its box", () => {
	const { tree, id, styles } = fixture(
		'<main id="target" lang="tr" style="color:red;font-size:10px;line-height:14px;text-transform:uppercase;padding:9px">body</main>',
		'#target::before{content:"i";font-weight:700}main::before{content:"wrong"}#target::after{content:"after";color:blue}',
	);
	const formatting = buildFormattingTree(tree);
	const before = pseudoBox(formatting, id());
	expect(before.typography).toMatchObject({
		"font-size": "10px",
		"line-height": "14px",
		"font-weight": "700",
		"text-transform": "uppercase",
	});
	expect(before.paint?.color).toEqual([255, 0, 0, 255]);
	expect(before.box?.["padding-left"]).toBe("0px");
	expect(before.language).toBe("tr");
	expect(formatting.nodes[before.children[0]]).toMatchObject({
		text: "i",
		language: "tr",
	});
	expect(pseudoBox(formatting, id(), "after").paint?.color).toEqual([
		0, 0, 255, 255,
	]);
	expect(styles.text(id())["font-weight"]).toBe("400");
});

it("rebuilds content, inherited styles, and language after owner mutations", () => {
	const { tree, id } = fixture(
		'<main id="target" lang="tr" class="active" style="--label:\'one\';color:red;text-transform:uppercase">body</main>',
		'#target::before{content:var(--label)}#target.active::after{content:"!"}',
	);
	const first = buildFormattingTree(tree);
	expect(textOrder(first)).toBe("onebody!");
	tree.setAttribute(
		id(),
		"style",
		"--label:'two';color:blue;text-transform:uppercase",
	);
	tree.setAttribute(id(), "lang", "en");
	tree.setAttribute(id(), "class", "");
	const second = buildFormattingTree(tree);
	expect(second.revision).toBe(tree.revision);
	expect(second.revision).toBeGreaterThan(first.revision);
	expect(textOrder(second)).toBe("twobody");
	expect(pseudoBox(second, id()).paint?.color).toEqual([0, 0, 255, 255]);
	expect(pseudoBox(second, id()).language).toBe("en");
	expect(textOrder(first)).toBe("onebody!");
});

it("keeps explicit details summary first and hides generated body content when closed", () => {
	const { tree, id } = fixture(
		'<main><details id="target" open>leading<summary>More</summary>body</details></main>',
		'#target::before{content:"["}#target::after{content:"]"}',
	);
	const opened = buildFormattingTree(tree);
	expect(textOrder(opened)).toBe("More[leadingbody]");
	verifyTree(opened);
	tree.removeAttribute(id(), "open");
	const closed = buildFormattingTree(tree);
	expect(textOrder(closed)).toBe("More");
	expect(closed.nodes.some((node) => node.generatedContent)).toBe(false);
});

it("keeps fallback details summary ahead of generated body content", () => {
	const { tree, id } = fixture(
		'<main><details id="target" open>body</details></main>',
		'#target::before{content:"["}#target::after{content:"]"}',
	);
	const summary = documentGeneratedControls(tree).detailsSummary(id());
	expect(summary).toBeDefined();
	const formatting = buildFormattingTree(tree);
	expect(textOrder(formatting)).toBe(`${summary?.label}[body]`);
	for (const node of formatting.nodes.filter((node) => node.generatedContent))
		expect(node.generated).toBeUndefined();
	verifyTree(formatting);
});

it("charges generated text, boxes, depth and work to existing formatting limits", () => {
	const { tree, id } = fixture('<main id="target"></main>');
	const base = buildFormattingTree(tree);
	tree.setTextContent(id("style"), '#target::before{content:"four"}');
	const revision = tree.revision;
	const complete = buildFormattingTree(tree);
	let ownerDepth = 0;
	let current: number | null = id();
	while (current !== tree.root && current !== null) {
		ownerDepth++;
		current = tree.get(current).parent;
	}
	expect(complete.metrics.textCodeUnits).toBe(4);
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 3 })).toThrow(
		"text limit",
	);
	expect(() =>
		buildFormattingTree(tree, { maxBoxes: base.metrics.boxes + 1 }),
	).toThrow("box limit");
	expect(() => buildFormattingTree(tree, { maxDepth: ownerDepth + 1 })).toThrow(
		"depth limit",
	);
	expect(() =>
		buildFormattingTree(tree, { maxWork: complete.metrics.work - 1 }),
	).toThrow("work limit");
	expect(tree.revision).toBe(revision);
	tree.setTextContent(id("style"), '#target::before{content:""}');
	expect(() => buildFormattingTree(tree, { maxDepth: ownerDepth })).toThrow(
		"depth limit",
	);
	expect(() =>
		buildFormattingTree(tree, { maxDepth: ownerDepth + 1 }),
	).not.toThrow();
});

it.each(["flex", "grid", "inline-table", "list-item", "contents"])(
	"reports unsupported generated display:%s without erasing native diagnostics",
	(display) => {
		const { tree, id } = fixture(
			'<main id="target"><canvas></canvas></main>',
			`#target::before{content:"x";display:${display}}`,
		);
		const formatting = buildFormattingTree(tree);
		expect(pseudoBox(formatting, id())).toMatchObject({
			kind: "deferred",
			deferredReason: "generated-content-display-layout-not-supported",
		});
		expect(
			formatting.issues["generated-content-display-layout-not-supported"],
		).toBe(1);
		expect(formatting.issues["display-layout-not-supported"]).toBeGreaterThan(
			0,
		);
		expect(formatting.issues["element-layout-not-supported"]).toBeGreaterThan(
			0,
		);
	},
);

it.each([
	["position:sticky;left:3px;overflow:hidden", "overflow"],
	["position:sticky;top:3px;overflow:hidden", "overflow"],
	["float:left", "float"],
	["display:block;clear:inline-start", "clear"],
	["overflow:hidden", "overflow"],
	["clip-path:url(#clip)", "clip"],
	["outline:1px solid red", "outline"],
	["text-decoration:underline", "text-decoration"],
	["vertical-align:top", "vertical-align"],
])("reports unsupported generated styling %s", (declaration, feature) => {
	const { tree } = fixture(
		'<main id="target"></main>',
		`#target::before{content:"x";${declaration}}`,
	);
	expect(
		buildFormattingTree(tree).issues[
			`generated-content-${feature}-layout-not-supported`
		],
	).toBe(1);
});

it.each(["float:left", "display:block;clear:inline-start"])(
	"rejects unsupported pseudo %s without claiming owned float geometry",
	(declaration) => {
		const { tree } = fixture(
			'<main id="target"></main>',
			`#target::before{content:"x";${declaration}}`,
		);
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues["float-layout-not-supported"]).toBeUndefined();
		expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
		expect(() => layoutDocument(tree)).toThrow(
			/generated-content-(float|clear)-layout-not-supported/,
		);
	},
);

it("retains CSS rejection of unsupported dotted borders before pseudo computation", () => {
	expect(normalizeBorderStyle("dotted")).toBeUndefined();
	const { tree, id } = fixture(
		'<main id="target"></main>',
		'#target::before{content:"x";border:1px dotted red}',
	);
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.issues["css:unimplemented-or-invalid-css-value"],
	).toBeGreaterThan(0);
	expect(
		formatting.issues["generated-content-border-layout-not-supported"],
	).toBeUndefined();
	expect(pseudoBox(formatting, id()).box?.["border-top-style"]).toBe("none");
});

it.each(["flex", "grid"])(
	"reports generated %s item integration as unsupported",
	(display) => {
		const { tree, id } = fixture(
			'<main id="target"></main>',
			`#target{display:${display}}#target::before{content:"x"}`,
		);
		const formatting = buildFormattingTree(tree);
		expect(pseudoBox(formatting, id())).toMatchObject({
			kind: "deferred",
			level: "block",
			deferredReason: "generated-content-item-layout-not-supported",
		});
		expect(
			formatting.issues["generated-content-item-layout-not-supported"],
		).toBe(1);
	},
);

it("lays out and paints a ref-less empty block background and border", () => {
	const { tree, id } = fixture(
		'<main id="target"></main>',
		'#target::before{content:"";display:block;width:8px;height:6px;padding:1px;border:1px solid red;background:blue}',
	);
	const layout = layoutDocument(tree);
	const node = pseudoBox(layout.text.horizontal.formatting, id());
	expect(layout.boxes.find((box) => box.id === node.id)).toMatchObject({
		contentWidth: 8,
		contentHeight: 6,
		borderBoxWidth: 12,
		borderBoxHeight: 10,
	});
	const { image } = rasterizeDocument(tree);
	expect(pixel(image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 2, 2)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 11, 9)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 12, 0)).toEqual([255, 255, 255, 255]);
});

it("paints ref-less empty inline edges without a generated text node", () => {
	const { tree, id } = fixture(
		'<main id="target"></main>',
		'#target::before{content:"";padding:2px;border:1px solid red;background:blue}',
	);
	const raster = rasterizeDocument(tree);
	const node = pseudoBox(raster.layout.text.horizontal.formatting, id());
	expect(node.children).toEqual([]);
	const fragments = raster.layout.contexts.flatMap(
		(context) => context.fragments,
	);
	expect(fragments.some((fragment) => fragment.formattingId === node.id)).toBe(
		true,
	);
	expect(colorPixels(raster.image, [255, 0, 0, 255])).toBeGreaterThan(0);
	expect(colorPixels(raster.image, [0, 0, 255, 255])).toBeGreaterThan(0);
});

it.each(["inline", "block", "inline-block"])(
	"rasterizes ref-less generated text with display:%s",
	(display) => {
		const { tree, id } = fixture(
			'<main id="target"></main>',
			`#target::before{content:"A";display:${display};color:red;background:blue;border:1px solid green;padding:1px}`,
		);
		const revision = tree.revision;
		const count = tree.nodeCount;
		const raster = rasterizeDocument(tree);
		const formatting = raster.layout.text.horizontal.formatting;
		const node = pseudoBox(formatting, id());
		const glyphs = raster.layout.contexts.flatMap((context) => context.glyphs);
		expect(glyphs.map((glyph) => glyph.character).join("")).toBe("A");
		expect(raster.metrics.paintedGlyphs).toBe(1);
		expect(colorPixels(raster.image, [255, 0, 0, 255])).toBeGreaterThan(0);
		expect(colorPixels(raster.image, [0, 0, 255, 255])).toBeGreaterThan(0);
		expect(colorPixels(raster.image, [0, 128, 0, 255])).toBeGreaterThan(0);
		for (const glyph of glyphs)
			expect(formatting.nodes[glyph.formattingId].generatedContent).toEqual({
				owner: id(),
				name: "before",
			});
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
	},
);

it("retains ref-less empty inline-block dimensions and paint", () => {
	const { tree, id } = fixture(
		'<main id="target"></main>',
		'#target::before{content:"";display:inline-block;width:8px;height:6px;background:blue}',
	);
	const raster = rasterizeDocument(tree);
	const node = pseudoBox(raster.layout.text.horizontal.formatting, id());
	expect(node).toMatchObject({ kind: "block", level: "inline", children: [] });
	expect(raster.layout.boxes.find((box) => box.id === node.id)).toMatchObject({
		borderBoxWidth: 8,
		borderBoxHeight: 6,
	});
	expect(raster.metrics.paintedGlyphs).toBe(0);
	expect(colorPixels(raster.image, [0, 0, 255, 255])).toBeGreaterThan(0);
});

it("transforms generated text using its owner's language without changing DOM text", () => {
	const { tree, id } = fixture(
		'<main id="target" lang="tr"></main>',
		'#target{text-transform:uppercase}#target::before{content:"i"}',
	);
	const layout = layoutDocument(tree);
	expect(
		layout.contexts.flatMap((context) =>
			context.glyphs.map((glyph) => glyph.character),
		),
	).toEqual(["İ"]);
	expect(tree.textContent(id())).toBe("");
});

it("uses inherited white-space for decoded generated line breaks", () => {
	const { tree } = fixture(
		'<main id="target"></main>',
		String.raw`#target{white-space:pre}#target::before{content:"A\a B"}`,
	);
	const layout = layoutDocument(tree);
	const context = layout.contexts.find((entry) => entry.glyphs.length > 0);
	expect(context?.lines).toHaveLength(2);
	expect(context?.glyphs.map((glyph) => glyph.character)).toEqual(["A", "B"]);
});

it("excludes transformed generated glyphs from DOM ranges, selection and carets", () => {
	const { tree, id } = fixture(
		'<main id="target" contenteditable>aßb</main>',
		'#target{text-transform:uppercase}#target::before,#target::after{content:"ß"}',
	);
	const editor = id();
	const text = tree.get(editor).children[0];
	const reference = tree.reference(text);
	const owner = domRangeOwner(tree);
	documentInteractions(tree).focus.focusElement(editor, {
		preventScroll: true,
	});
	const layout = layoutDocument(tree);
	const glyphs = layout.contexts.flatMap((context) => context.glyphs);
	expect(glyphs.map((glyph) => glyph.character).join("")).toBe("SSASSBSS");
	const generated = glyphs.filter((glyph) => !glyph.ref);
	expect(generated).toHaveLength(4);
	for (const glyph of generated)
		expect(
			layout.text.horizontal.formatting.nodes[glyph.formattingId]
				.generatedContent,
		).toBeDefined();
	const sources = [...consolidateSourceGlyphs(glyphs, () => {})];
	expect(sources.map((glyph) => glyph.offset)).toEqual([0, 1, 2]);
	expect(sources.every((glyph) => glyph.ref === reference)).toBe(true);
	const left = sources[0].x;
	const last = sources[sources.length - 1];
	const right = last.x + last.advance;
	expect(left).toBeGreaterThan(glyphs[0].x);
	expect(right).toBeLessThan(
		glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].advance,
	);
	const range = owner.createRange();
	range.setStart(text, 0);
	range.setEnd(text, 3);
	expect(range.toString()).toBe("aßb");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: left, width: right - left },
	]);
	owner.selection.setBaseAndExtent(text, 0, text, 3);
	const selection = prepareEditableSelection(tree, layout);
	expect(selection.status).toBe("ready");
	expect(selection.glyphs.size).toBe(3);
	for (const [offset, horizontal] of [
		[0, left],
		[3, right],
	]) {
		owner.selection.setBaseAndExtent(text, offset, text, offset);
		expect(prepareEditableCaret(tree, layout)).toMatchObject({
			status: "ready",
			anchor: {
				ref: reference,
				formattingId: sources[0].formattingId,
				x: horizontal,
			},
		});
	}
	expect(tree.textContent(editor)).toBe("aßb");
});
