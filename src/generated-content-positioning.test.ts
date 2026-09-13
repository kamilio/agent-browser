import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { prepareEditableSelection } from "./editable-selection.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { documentHitTesting } from "./hit-testing.js";
import { layoutContentItems } from "./layout-paint-order.js";
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

it.each([
	{ position: "absolute", name: "before" },
	{ position: "fixed", name: "after" },
])(
	"targets the boxless origin of $position ::$name without synthetic references",
	({ position, name }) => {
		const { tree, id } = fixture(
			'<main id="container"><span id="target"></span></main>',
			`#container{position:relative;width:100px;height:80px}#target{display:contents}#target::${name}{content:"";position:${position};left:150px;top:20px;width:20px;height:20px;background:red}`,
		);
		const hits = documentHitTesting(tree);
		const owner = id();
		expect(hits.targetFromPoint(155, 25)).toEqual({ id: owner });
		tree.setAttribute(owner, "style", "pointer-events:none");
		expect(hits.elementFromPoint(155, 25)).not.toBe(owner);
		tree.removeAttribute(owner, "style");
		expect(hits.targetFromPoint(155, 25)).toEqual({ id: owner });
	},
);

function fixture(markup = '<main id="target"></main>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}${css}</style></head><body>${markup}</body></html>`,
		"https://fixture.invalid/generated-content-positioning",
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
	styles.setViewport(200, 120);
	return { tree, queries, id, styles };
}

function pseudoNode(
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
	if (!found) throw new Error(`Missing ::${name} box`);
	return found;
}

function pseudoBox(
	layout: DocumentLayout,
	owner: number,
	name: "before" | "after" = "before",
) {
	const node = pseudoNode(layout.text.horizontal.formatting, owner, name);
	const found = layout.boxes.find((box) => box.id === node.id);
	if (!found) throw new Error(`Missing laid-out ::${name} box`);
	return found;
}

function elementBox(layout: DocumentLayout, tree: DocumentTree, owner: number) {
	const found = layout.boxes.find((box) => box.ref === tree.reference(owner));
	if (!found) throw new Error("Missing element box");
	return found;
}

function rectangle(box: DocumentLayout["boxes"][number]) {
	return {
		x: box.borderX,
		y: box.borderY,
		width: box.borderBoxWidth,
		height: box.borderBoxHeight,
	};
}

function glyphs(layout: DocumentLayout) {
	return layout.contexts.flatMap((context) => context.glyphs);
}

function generatedGlyphs(
	layout: DocumentLayout,
	owner: number,
	name: "before" | "after" = "before",
) {
	const formatting = layout.text.horizontal.formatting;
	return glyphs(layout).filter((glyph) => {
		const metadata = formatting.nodes[glyph.formattingId].generatedContent;
		return metadata?.owner === owner && metadata.name === name;
	});
}

function glyphGeometry(entries: ReturnType<typeof glyphs>) {
	return entries.map(({ character, x, y, advance }) => ({
		character,
		x,
		y,
		advance,
	}));
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([
	["absolute", "inline", "block"],
	["absolute", "inline-block", "block"],
	["absolute", "block", "block"],
	["absolute", "block flow-root", "block flow-root"],
	["fixed", "inline", "block"],
	["fixed", "inline-block", "block"],
	["fixed", "block", "block"],
	["fixed", "block flow-root", "block flow-root"],
] as const)(
	"blockifies generated %s %s and preserves static-placement metadata",
	(position, display, computedDisplay) => {
		const { tree, id, styles } = fixture(
			undefined,
			`#target::before{content:"X";position:${position};display:${display};left:7px;top:9px;z-index:3}`,
		);
		const style = styles.generatedContent(id(), "before");
		expect(style?.display).toBe(computedDisplay);
		expect(
			(style as { unpositionedDisplay?: string } | undefined)
				?.unpositionedDisplay,
		).toBe(display);
		expect(style?.flow.position).toBe(position);
		const formatting = buildFormattingTree(tree);
		const node = pseudoNode(formatting, id());
		expect(node).toMatchObject({
			kind: "block",
			level: "block",
			position,
			zIndex: 3,
			staticDisplay: display,
			staticFlex: style?.flex,
			independentContext: true,
		});
		expect(formatting.issues["positioned-layout-requires-coordination"]).toBe(
			1,
		);
		expect(
			formatting.issues["generated-content-position-layout-not-supported"],
		).toBeUndefined();
		const layout = layoutDocument(tree);
		expect(rectangle(pseudoBox(layout, id()))).toMatchObject({ x: 7, y: 9 });
		expect(generatedGlyphs(layout, id())).toHaveLength(1);
	},
);

it.each([
	["inline", "left:7px;top:5px;right:99px;bottom:99px", 7, 5],
	["block", "right:5px;bottom:3px", -5, -3],
	["inline-block", "left:10%;top:20%", 10, 12],
	["block flow-root", "left:-4px;top:-2px", -4, -2],
] as const)(
	"shifts relative generated %s glyphs while retaining their normal-flow space",
	(display, insets, shiftX, shiftY) => {
		const markup = '<main id="target"><span id="flow">B</span></main>';
		const css = `#target{width:100px;height:60px;margin:10px}#target::before{content:"X";display:${display};width:20px;height:10px}`;
		const base = fixture(markup, css);
		const moved = fixture(
			markup,
			`${css}#target::before{position:relative;${insets};z-index:2}`,
		);
		const before = layoutDocument(base.tree);
		const after = layoutDocument(moved.tree);
		const original = generatedGlyphs(before, base.id());
		const shifted = generatedGlyphs(after, moved.id());
		expect(original).toHaveLength(1);
		expect(shifted).toHaveLength(1);
		expect(shifted[0].x).toBeCloseTo(original[0].x + shiftX);
		expect(shifted[0].y).toBeCloseTo(original[0].y + shiftY);
		expect(glyphGeometry(glyphs(after).filter((glyph) => glyph.ref))).toEqual(
			glyphGeometry(glyphs(before).filter((glyph) => glyph.ref)),
		);
		expect(after.flowHeight).toBe(before.flowHeight);
		expect(
			pseudoNode(after.text.horizontal.formatting, moved.id()),
		).toMatchObject({
			position: "relative",
			zIndex: 2,
		});
		expect(moved.styles.generatedContent(moved.id(), "before")?.display).toBe(
			display,
		);
	},
);

it.each([
	["left:7px;top:9px;width:20px;height:10px", 17, 19, 20, 10],
	["right:7px;bottom:9px;width:20px;height:10px", 83, 71, 20, 10],
	["left:10%;top:25%;width:50%;height:25%", 20, 30, 50, 20],
	[
		"left:7px;right:3px;top:9px;bottom:2px;width:20px;height:10px",
		17,
		19,
		20,
		10,
	],
	["left:7px;right:3px;top:9px;bottom:11px", 17, 19, 90, 60],
	["left:-4px;top:-6px;width:20px;height:10px", 6, 4, 20, 10],
] as const)(
	"resolves absolute generated box and glyph geometry for %s",
	(insets, x, y, width, height) => {
		const css =
			"#target{position:relative;width:100px;height:80px;margin:10px}";
		const generated = fixture(
			undefined,
			`${css}#target::before{content:"X";position:absolute;${insets}}`,
		);
		const regular = fixture(
			'<main id="target"><span id="equivalent">X</span></main>',
			`${css}#equivalent{position:absolute;${insets}}`,
		);
		const layout = layoutDocument(generated.tree);
		const reference = layoutDocument(regular.tree);
		expect(rectangle(pseudoBox(layout, generated.id()))).toEqual({
			x,
			y,
			width,
			height,
		});
		expect(rectangle(pseudoBox(layout, generated.id()))).toEqual(
			rectangle(elementBox(reference, regular.tree, regular.id("#equivalent"))),
		);
		expect(generatedGlyphs(layout, generated.id())).toHaveLength(1);
		expect(glyphGeometry(generatedGlyphs(layout, generated.id()))).toEqual(
			glyphGeometry(glyphs(reference)),
		);
	},
);

it.each([
	["before", "inline", "left:1.6px"],
	["after", "inline", ""],
	["before", "inline-block", "left:1.6px"],
	["after", "inline-block", "top:14px"],
	["before", "block", "top:14px"],
	["after", "block", ""],
	["before", "block flow-root", ""],
	["after", "block flow-root", "left:1.6px"],
] as const)(
	"matches a regular %s %s at its hypothetical static-auto axes (%s)",
	(name, display, insets) => {
		const flow = '<span id="flow">AB</span>';
		const peer = '<span id="equivalent">X</span>';
		const ownerCss = "#target{position:relative;width:80px;padding:5px}";
		const positioning = `display:${display};position:absolute;${insets}`;
		const generated = fixture(
			`<main id="target">${flow}</main>`,
			`${ownerCss}#target::${name}{content:"X";${positioning}}`,
		);
		const regular = fixture(
			`<main id="target">${name === "before" ? peer + flow : flow + peer}</main>`,
			`${ownerCss}#equivalent{${positioning}}`,
		);
		const layout = layoutDocument(generated.tree);
		const reference = layoutDocument(regular.tree);
		expect(rectangle(pseudoBox(layout, generated.id(), name))).toEqual(
			rectangle(elementBox(reference, regular.tree, regular.id("#equivalent"))),
		);
		expect(generatedGlyphs(layout, generated.id(), name)).toHaveLength(1);
		expect(
			glyphGeometry(generatedGlyphs(layout, generated.id(), name)),
		).toEqual(
			glyphGeometry(
				glyphs(reference).filter((glyph) => glyph.character === "X"),
			),
		);
		expect(glyphGeometry(glyphs(layout).filter((glyph) => glyph.ref))).toEqual(
			glyphGeometry(
				glyphs(reference).filter((glyph) => glyph.character !== "X"),
			),
		);
		expect(layout.flowHeight).toBe(reference.flowHeight);
	},
);

it("places 26 absolute inline-block label icons without widening or raising their labels", () => {
	const markup = Array.from(
		{ length: 26 },
		(_, index) => `<label id="label-${index}">Label</label>`,
	).join("");
	const css =
		"label{display:block;position:relative;width:180px;height:12px;line-height:12px;padding-left:12px}";
	const generated = fixture(
		markup,
		`${css}label::before{content:"X";position:absolute;display:inline-block;left:1.6px}`,
	);
	const regular = fixture(markup, css);
	const layout = layoutDocument(generated.tree);
	const reference = layoutDocument(regular.tree);
	expect(layout.flowHeight).toBe(reference.flowHeight);
	expect(glyphGeometry(glyphs(layout).filter((glyph) => glyph.ref))).toEqual(
		glyphGeometry(glyphs(reference)),
	);
	for (let index = 0; index < 26; index++) {
		const owner = generated.id(`#label-${index}`);
		const icon = pseudoBox(layout, owner);
		const label = elementBox(layout, generated.tree, owner);
		expect(rectangle(label)).toEqual(
			rectangle(
				elementBox(reference, regular.tree, regular.id(`#label-${index}`)),
			),
		);
		expect(icon.borderX).toBeCloseTo(label.borderX + 1.6);
		expect(icon.borderY).toBe(label.borderY);
		expect(icon.borderBoxWidth).toBeGreaterThan(0);
		expect(icon.borderBoxHeight).toBe(12);
		expect(generatedGlyphs(layout, owner)).toHaveLength(1);
		expect(generatedGlyphs(layout, owner)[0].x).toBeCloseTo(icon.contentX);
	}
	expect(glyphs(layout).filter((glyph) => !glyph.ref)).toHaveLength(26);
});

it.each([
	[
		"static intervening owner",
		"#outer{position:relative}",
		"#target{padding:13px}",
		"#outer",
	],
	[
		"nested relative owner",
		"#outer{position:relative;left:7px;top:9px}",
		"#target{position:relative;left:3px;top:4px;width:60px;height:40px;padding:5px;border:1px solid black}",
		"#target",
	],
	[
		"boxless relative owner",
		"#outer{position:relative;left:7px;top:9px}",
		"#target{display:contents;position:relative}",
		"#outer",
	],
] as const)(
	"uses the nearest real positioned padding box through a %s",
	(_description, outerStyle, ownerStyle, containingSelector) => {
		const { tree, id } = fixture(
			'<main id="outer"><section id="target"></section></main>',
			`#outer{width:100px;height:80px;margin:3px;padding:10px;border:2px solid black}${outerStyle}${ownerStyle}#target::before{content:"X";position:absolute;left:10%;top:20%;width:50%;height:50%}`,
		);
		const layout = layoutDocument(tree);
		const containing = elementBox(layout, tree, id(containingSelector));
		const box = pseudoBox(layout, id());
		const paddingWidth =
			containing.borderBoxWidth -
			containing.borderLeft -
			containing.borderRight;
		const paddingHeight =
			containing.borderBoxHeight -
			containing.borderTop -
			containing.borderBottom;
		expect(box.containingBlock).toBe(containing.id);
		expect(box.borderX).toBeCloseTo(
			containing.borderX + containing.borderLeft + paddingWidth * 0.1,
		);
		expect(box.borderY).toBeCloseTo(
			containing.borderY + containing.borderTop + paddingHeight * 0.2,
		);
		expect(box.contentWidth).toBeCloseTo(paddingWidth * 0.5);
		expect(box.contentHeight).toBeCloseTo(paddingHeight * 0.5);
		expect(generatedGlyphs(layout, id())[0].x).toBeCloseTo(box.contentX);
	},
);

it.each(["before", "after"] as const)(
	"anchors fixed ::%s paint to the viewport across scroll and resize",
	(name) => {
		const { tree, id, styles } = fixture(
			undefined,
			`#target{position:relative;left:40px;top:30px;height:400px}#target::${name}{content:"X";position:fixed;right:10%;bottom:10%;width:20px;height:10px;background:red;color:white}`,
		);
		const initial = rasterizeDocument(tree);
		expect(rectangle(pseudoBox(initial.layout, id(), name))).toEqual({
			x: 160,
			y: 98,
			width: 20,
			height: 10,
		});
		expect(pixel(initial.image, 178, 106)).toEqual([255, 0, 0, 255]);
		documentScroll(tree).to(0, 80);
		expect(documentScroll(tree).get().y).toBe(80);
		const scrolled = rasterizeDocument(tree);
		expect(pixel(scrolled.image, 178, 106)).toEqual([255, 0, 0, 255]);
		expect(scrolled.image).toEqual(initial.image);
		styles.setViewport(240, 160);
		const resized = rasterizeDocument(tree);
		expect(rectangle(pseudoBox(resized.layout, id(), name))).toMatchObject({
			x: 196,
			y: 134 + documentScroll(tree).get().y,
		});
		expect(pixel(resized.image, 214, 142)).toEqual([255, 0, 0, 255]);
		expect(generatedGlyphs(resized.layout, id(), name)).toHaveLength(1);
	},
);

it.each(["absolute", "fixed"] as const)(
	"computes float:none and ignores clearance only for out-of-flow %s content",
	(position) => {
		const { tree, id, styles } = fixture(
			undefined,
			`#target::before{content:"X";position:${position};float:left;clear:both;left:12px;top:14px;width:20px;height:10px}`,
		);
		expect(styles.generatedContent(id(), "before")?.flow.float).toBe("none");
		const formatting = buildFormattingTree(tree);
		expect(pseudoNode(formatting, id()).floatSide).toBeUndefined();
		expect(pseudoNode(formatting, id()).clear).toBeUndefined();
		expect(
			formatting.issues["generated-content-float-layout-not-supported"],
		).toBeUndefined();
		expect(
			formatting.issues["generated-content-clear-layout-not-supported"],
		).toBeUndefined();
		expect(rectangle(pseudoBox(layoutDocument(tree), id()))).toEqual({
			x: 12,
			y: 14,
			width: 20,
			height: 10,
		});
	},
);

it.each([
	["flex", "absolute"],
	["flex", "fixed"],
	["grid", "absolute"],
	["grid", "fixed"],
] as const)(
	"excludes a %s owner's explicit-axis %s pseudo with a block containing box from item layout",
	(display, position) => {
		const markup =
			'<section id="container"><main id="target"><div id="flow"></div></main></section>';
		const css = `#container{position:relative}#target{display:${display};width:100px;height:60px;grid-template-columns:100px;grid-template-rows:60px}#flow{width:10px;height:10px;flex:none}`;
		const generated = fixture(
			markup,
			`${css}#target::before{content:"X";position:${position};left:30px;top:20px;width:20px;height:10px}`,
		);
		const base = fixture(markup, css);
		const layout = layoutDocument(generated.tree);
		const reference = layoutDocument(base.tree);
		const node = pseudoNode(layout.text.horizontal.formatting, generated.id());
		expect(node.flexItem).not.toBe(true);
		expect(node.gridItem).not.toBe(true);
		expect(node.deferredReason).toBeUndefined();
		expect(rectangle(pseudoBox(layout, generated.id()))).toEqual({
			x: 30,
			y: 20,
			width: 20,
			height: 10,
		});
		expect(
			rectangle(elementBox(layout, generated.tree, generated.id("#flow"))),
		).toEqual(rectangle(elementBox(reference, base.tree, base.id("#flow"))));
		expect(layout.flowHeight).toBe(reference.flowHeight);
	},
);

it.each(["before", "after"] as const)(
	"uses sole-item flex static alignment for ::%s without consuming flex space",
	(name) => {
		const { tree, id } = fixture(
			'<main id="target"><div id="flow"></div></main>',
			`#target{display:flex;position:relative;width:100px;height:60px;justify-content:center;align-items:center}#flow{width:10px;height:10px;flex:none}#target::${name}{content:"X";position:absolute;display:inline-block;width:20px;height:10px;align-self:flex-end}`,
		);
		const layout = layoutDocument(tree);
		expect(rectangle(pseudoBox(layout, id(), name))).toEqual({
			x: 40,
			y: 50,
			width: 20,
			height: 10,
		});
		expect(rectangle(elementBox(layout, tree, id("#flow")))).toEqual({
			x: 45,
			y: 25,
			width: 10,
			height: 10,
		});
		expect(
			pseudoNode(layout.text.horizontal.formatting, id(), name).staticFlex?.[
				"align-self"
			],
		).toBe("flex-end");
	},
);

it.each([
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"table",
	"inline-table",
	"contents",
])(
	"does not silently enable generated display:%s after absolute blockification",
	(display) => {
		const { tree, id, styles } = fixture(
			undefined,
			`#target::before{content:"X";position:absolute;display:${display};left:2px;top:3px}`,
		);
		const formatting = buildFormattingTree(tree);
		expect(pseudoNode(formatting, id())).toMatchObject({
			kind: "deferred",
			deferredReason: "generated-content-display-layout-not-supported",
		});
		expect(
			formatting.issues["generated-content-display-layout-not-supported"],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			"generated-content-display-layout-not-supported",
		);
		if (display === "contents") {
			expect(styles.generatedContent(id(), "before")?.display).toBe("contents");
			expect(pseudoNode(formatting, id()).position).toBeUndefined();
			expect(
				formatting.issues["positioned-layout-requires-coordination"],
			).toBeUndefined();
		}
	},
);

it.each([
	["static", "float:left", "float"],
	["static", "clear:both", "clear"],
	["absolute", "overflow:hidden", "overflow"],
	["absolute", "clip-path:url(#clip)", "clip"],
	["absolute", "outline:1px solid red", "outline"],
	["absolute", "text-decoration:underline", "text-decoration"],
	["relative", "vertical-align:top", "vertical-align"],
] as const)(
	"retains unsupported generated %s styling %s",
	(position, declaration, feature) => {
		const { tree } = fixture(
			undefined,
			`#target::before{content:"X";display:inline-block;position:${position};left:2px;top:3px;${declaration}}`,
		);
		const issue = `generated-content-${feature}-layout-not-supported`;
		expect(buildFormattingTree(tree).issues[issue]).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(issue);
	},
);

it.each([
	[3, 1, "before", [255, 0, 0, 255]],
	[1, 3, "after", [0, 0, 255, 255]],
	[0, 0, "after", [0, 0, 255, 255]],
] as const)(
	"paints overlapping generated siblings in z-index/source order %s/%s",
	(beforeZ, afterZ, winner, color) => {
		const { tree, id } = fixture(
			undefined,
			`#target{position:relative;width:80px;height:60px}#target::before,#target::after{position:absolute;left:10px;top:10px;width:30px;height:20px}#target::before{content:"B";background:red;z-index:${beforeZ}}#target::after{content:"A";background:blue;z-index:${afterZ}}`,
		);
		const raster = rasterizeDocument(tree);
		expect(pixel(raster.image, 38, 28)).toEqual(color);
		const painted = Array.from(layoutContentItems(raster.layout, () => {}));
		const top = pseudoBox(raster.layout, id(), winner);
		const bottom = pseudoBox(
			raster.layout,
			id(),
			winner === "before" ? "after" : "before",
		);
		const topIndex = painted.findIndex(
			(item) => item.kind === "box" && item.box.id === top.id,
		);
		const bottomIndex = painted.findIndex(
			(item) => item.kind === "box" && item.box.id === bottom.id,
		);
		expect(bottomIndex).toBeGreaterThanOrEqual(0);
		expect(topIndex).toBeGreaterThan(bottomIndex);
		expect(generatedGlyphs(raster.layout, id(), "before")).toHaveLength(1);
		expect(generatedGlyphs(raster.layout, id(), "after")).toHaveLength(1);
	},
);

it.each(["text", "boxes", "depth", "work"] as const)(
	"charges positioned generated content to the existing %s budget without mutating DOM",
	(budget) => {
		const { tree, id } = fixture();
		const base = buildFormattingTree(tree);
		tree.setTextContent(
			id("style"),
			'#target::before{content:"four";position:absolute;left:1px;top:2px}',
		);
		const complete = buildFormattingTree(tree);
		let ownerDepth = 0;
		let current: number | null = id();
		while (current !== null && current !== tree.root) {
			ownerDepth++;
			current = tree.get(current).parent;
		}
		const options = {
			text: { maxTextCodeUnits: 3 },
			boxes: { maxBoxes: base.metrics.boxes + 1 },
			depth: { maxDepth: ownerDepth + 1 },
			work: { maxWork: complete.metrics.work - 1 },
		}[budget];
		const revision = tree.revision;
		const count = tree.nodeCount;
		expect(complete.metrics.textCodeUnits).toBe(4);
		expect(() => buildFormattingTree(tree, options)).toThrow(
			`${budget === "boxes" ? "box" : budget} limit`,
		);
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
		expect(buildFormattingTree(tree).metrics).toEqual(complete.metrics);
	},
);

it("refreshes pseudo offsets, glyphs and painted pixels after custom-property mutation", () => {
	const { tree, id } = fixture(
		'<main id="target" style="--offset:10px"></main>',
		'#target{position:relative;width:100px;height:60px}#target::before{content:"X";position:absolute;left:var(--offset);top:10px;width:20px;height:10px;background:red}',
	);
	const initial = rasterizeDocument(tree);
	const originalGlyph = generatedGlyphs(initial.layout, id())[0];
	expect(pixel(initial.image, 28, 18)).toEqual([255, 0, 0, 255]);
	tree.setAttribute(id(), "style", "--offset:40px");
	const updated = rasterizeDocument(tree);
	expect(pseudoBox(updated.layout, id()).borderX).toBe(40);
	expect(generatedGlyphs(updated.layout, id())[0].x).toBe(originalGlyph.x + 30);
	expect(pixel(updated.image, 58, 18)).toEqual([255, 0, 0, 255]);
	expect(pixel(updated.image, 28, 18)).not.toEqual([255, 0, 0, 255]);
	expect(pseudoBox(initial.layout, id()).borderX).toBe(10);
});

it("restores normal-flow space after a class switches absolute pseudo content to relative", () => {
	const { tree, id, styles } = fixture(
		'<main id="target" class="floating"><div id="flow"></div></main>',
		'#target::before{content:"X";display:block;position:relative;left:3px;top:2px;width:20px;height:10px}#target.floating::before{position:absolute}#flow{height:10px}',
	);
	const absolute = layoutDocument(tree);
	expect(elementBox(absolute, tree, id("#flow")).borderY).toBe(0);
	expect(elementBox(absolute, tree, id()).contentHeight).toBe(10);
	tree.removeAttribute(id(), "class");
	const relative = layoutDocument(tree);
	expect(styles.generatedContent(id(), "before")?.flow.position).toBe(
		"relative",
	);
	expect(elementBox(relative, tree, id("#flow")).borderY).toBe(10);
	expect(elementBox(relative, tree, id()).contentHeight).toBe(20);
	expect(rectangle(pseudoBox(relative, id()))).toEqual({
		x: 3,
		y: 2,
		width: 20,
		height: 10,
	});
	expect(
		relative.text.horizontal.formatting.issues[
			"positioned-layout-requires-coordination"
		],
	).toBeUndefined();
});

it("conserves owner DOM, references and action targets across positioned layout and rasterization", () => {
	const { tree, id, queries } = fixture(
		'<main id="target"><button id="button">Go</button></main>',
		'#target{position:relative}#target::before{content:"B";position:absolute;left:50px;top:10px}#target::after{content:"A";position:fixed;left:70px;top:10px}',
	);
	const controls = documentGeneratedControls(tree);
	const targets = controls.metrics().targets;
	const revision = tree.revision;
	const count = tree.nodeCount;
	const children = [...tree.get(id()).children];
	const references = queries
		.querySelectorAll("*")
		.map((owner) => tree.reference(owner));
	const original = documentGeometry(tree).getBoundingClientRect(id("#button"));
	const raster = rasterizeDocument(tree);
	const generated = raster.layout.text.horizontal.formatting.nodes.filter(
		(node) => node.generatedContent,
	);
	expect(generated).toHaveLength(4);
	for (const node of generated) {
		expect(node.generatedContent?.owner).toBe(id());
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(node.control).toBeUndefined();
	}
	expect(glyphs(raster.layout).filter((glyph) => !glyph.ref)).toHaveLength(2);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.get(id()).children).toEqual(children);
	expect(tree.textContent(id())).toBe("Go");
	expect(queries.querySelectorAll("#target::before, #target::after")).toEqual(
		[],
	);
	expect(
		queries.querySelectorAll("*").map((owner) => tree.reference(owner)),
	).toEqual(references);
	expect(controls.metrics().targets).toBe(targets);
	expect(documentGeometry(tree).getBoundingClientRect(id("#button"))).toEqual(
		original,
	);
});

it("keeps positioned generated glyphs out of DOM ranges, editable selections and carets", () => {
	const { tree, id } = fixture(
		'<main id="target" contenteditable>abc</main>',
		'#target{position:relative;width:100px;height:60px}#target::before{content:"X";position:absolute;left:40px;top:20px}#target::after{content:"Y";position:relative;left:10px;top:5px}',
	);
	const text = tree.get(id()).children[0];
	const reference = tree.reference(text);
	const owner = domRangeOwner(tree);
	documentInteractions(tree).focus.focusElement(id(), { preventScroll: true });
	const layout = layoutDocument(tree);
	expect(glyphs(layout).filter((glyph) => !glyph.ref)).toHaveLength(2);
	const sources = [...consolidateSourceGlyphs(glyphs(layout), () => {})];
	expect(sources.map((glyph) => glyph.character).join("")).toBe("abc");
	expect(sources.every((glyph) => glyph.ref === reference)).toBe(true);
	const range = owner.createRange();
	range.setStart(text, 0);
	range.setEnd(text, 3);
	expect(range.toString()).toBe("abc");
	expect(rangeClientRects(range)).toMatchObject([
		{
			x: sources[0].x,
			width: sources[2].x + sources[2].advance - sources[0].x,
		},
	]);
	owner.selection.setBaseAndExtent(text, 0, text, 3);
	const selection = prepareEditableSelection(tree, layout);
	expect(selection.status).toBe("ready");
	expect(selection.glyphs.size).toBe(3);
	owner.selection.setBaseAndExtent(text, 0, text, 0);
	expect(prepareEditableCaret(tree, layout)).toMatchObject({
		status: "ready",
		anchor: {
			ref: reference,
			formattingId: sources[0].formattingId,
			x: sources[0].x,
		},
	});
	expect(tree.textContent(id())).toBe("abc");
});
