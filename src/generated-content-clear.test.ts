import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css: string,
	content = '<div id="lead"><span id="float"></span></div><section id="target"></section><div id="following"></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main,#target{width:120px}#float{float:left;width:20px;height:30px;background:blue}#following{height:10px}${css}</style></head><body><main id="main">${content}</main></body></html>`,
		"https://fixture.invalid/generated-content-clear",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	documentStyles(tree).setViewport(160, 120);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, queries, id };
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

function generatedGlyphs(
	layout: DocumentLayout,
	owner: number,
	name: "before" | "after" = "before",
) {
	const formatting = layout.text.horizontal.formatting;
	return layout.contexts
		.flatMap((context) => context.glyphs)
		.filter((glyph) => {
			const metadata = formatting.nodes[glyph.formattingId].generatedContent;
			return metadata?.owner === owner && metadata.name === name;
		});
}

function glyphGeometry(entries: ReturnType<typeof generatedGlyphs>) {
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
	{ name: "before", clear: "left", top: 24 },
	{ name: "before", clear: "right", top: 36 },
	{ name: "before", clear: "both", top: 36 },
	{ name: "after", clear: "left", top: 24 },
	{ name: "after", clear: "right", top: 36 },
	{ name: "after", clear: "both", top: 36 },
] as const)(
	"clears ::$name with clear:$clear to Y$top and moves its glyphs and following flow",
	({ name, clear, top }) => {
		const { tree, id } = fixture(
			`#float{height:24px}#right{float:right;width:20px;height:36px}#inside{height:10px}#target::${name}{content:"X";display:block;clear:${clear};height:10px}`,
			'<div id="lead"><span id="float"></span><span id="right"></span></div><section id="target"><div id="inside"></div></section><div id="following"></div>',
		);
		const formatting = buildFormattingTree(tree);
		expect(pseudoNode(formatting, id(), name).clear).toBe(clear);
		expect(formatting.issues).toEqual({
			"float-layout-not-supported": 2,
			"clear-layout-not-supported": 1,
		});
		const layout = layoutDocument(tree);
		expect(rectangle(pseudoBox(layout, id(), name))).toEqual({
			x: 0,
			y: top,
			width: 120,
			height: 10,
		});
		expect(generatedGlyphs(layout, id(), name)).toMatchObject([
			{ character: "X", x: 0, y: top + 1 },
		]);
		expect(elementBox(layout, tree, id("#inside")).borderY).toBe(
			name === "before" ? top + 10 : 0,
		);
		expect(elementBox(layout, tree, id("#following")).borderY).toBe(
			top + (name === "before" ? 20 : 10),
		);
		expect(buildFormattingTree(tree).issues).toEqual(formatting.issues);
	},
);

it.each([
	{ side: "left", clear: "right" },
	{ side: "right", clear: "left" },
] as const)(
	"does not move a generated clear:$clear box below a lone $side float",
	({ side, clear }) => {
		const { tree, id } = fixture(
			`#float{float:${side}}#target::before{content:"X";display:block;clear:${clear};height:10px}`,
		);
		const layout = layoutDocument(tree);
		expect(pseudoBox(layout, id()).borderY).toBe(0);
		expect(generatedGlyphs(layout, id())).toMatchObject([
			{ character: "X", x: side === "left" ? 20 : 0, y: 1 },
		]);
		expect(elementBox(layout, tree, id("#following")).borderY).toBe(10);
	},
);

it.each(["left", "right"] as const)(
	"uses an empty ::after clearfix to contain a %s float and advance the next sibling",
	(side) => {
		const { tree, id } = fixture(
			`#float{float:${side}}#target::after{content:"";display:block;clear:both}`,
			'<section id="target"><span id="float"></span></section><div id="following"></div>',
		);
		const layout = layoutDocument(tree);
		expect(rectangle(pseudoBox(layout, id(), "after"))).toEqual({
			x: 0,
			y: 30,
			width: 120,
			height: 0,
		});
		expect(generatedGlyphs(layout, id(), "after")).toEqual([]);
		expect(elementBox(layout, tree, id()).borderBoxHeight).toBe(30);
		expect(elementBox(layout, tree, id("#following")).borderY).toBe(30);
		expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
			1,
		);
	},
);

it("keeps hidden generated clearance in layout without painting its background", () => {
	const { tree, id } = fixture(
		'#target::before{content:"X";display:block;clear:both;height:10px;visibility:hidden;background:red}',
	);
	const raster = rasterizeDocument(tree);
	expect(pseudoBox(raster.layout, id()).borderY).toBe(30);
	expect(elementBox(raster.layout, tree, id("#following")).borderY).toBe(40);
	expect(pseudoNode(buildFormattingTree(tree), id()).visible).toBe(false);
	expect(pixel(raster.image, 100, 35)).not.toEqual([255, 0, 0, 255]);
});

it.each(["before", "after"] as const)(
	"matches ordinary-element geometry and text for a cleared ::%s",
	(name) => {
		const generated = fixture(
			`#target::${name}{content:"X";display:block;clear:both;height:10px}`,
		);
		const ordinary = fixture(
			"#ordinary{clear:both;height:10px}",
			'<div id="lead"><span id="float"></span></div><section id="target"><div id="ordinary">X</div></section><div id="following"></div>',
		);
		const generatedLayout = layoutDocument(generated.tree);
		const ordinaryLayout = layoutDocument(ordinary.tree);
		expect(rectangle(pseudoBox(generatedLayout, generated.id(), name))).toEqual(
			rectangle(
				elementBox(ordinaryLayout, ordinary.tree, ordinary.id("#ordinary")),
			),
		);
		expect(
			glyphGeometry(generatedGlyphs(generatedLayout, generated.id(), name)),
		).toEqual(
			glyphGeometry(
				ordinaryLayout.contexts.flatMap((context) => context.glyphs),
			),
		);
		for (const selector of ["#target", "#following"])
			expect(
				rectangle(
					elementBox(generatedLayout, generated.tree, generated.id(selector)),
				),
			).toEqual(
				rectangle(
					elementBox(ordinaryLayout, ordinary.tree, ordinary.id(selector)),
				),
			);
	},
);

it("applies relative offsets after clearance without moving following normal-flow space", () => {
	const { tree, id } = fixture(
		'#target::before{content:"X";display:block;position:relative;left:7px;top:-4px;clear:both;height:10px}',
	);
	const layout = layoutDocument(tree);
	expect(rectangle(pseudoBox(layout, id()))).toEqual({
		x: 7,
		y: 26,
		width: 120,
		height: 10,
	});
	expect(generatedGlyphs(layout, id())).toMatchObject([
		{ character: "X", x: 7, y: 27 },
	]);
	expect(elementBox(layout, tree, id()).borderBoxHeight).toBe(40);
	expect(elementBox(layout, tree, id("#following")).borderY).toBe(40);
});

it("clears the float margin box while preserving incoming and outgoing sibling margins", () => {
	const { tree, id } = fixture(
		'#float{height:20px;margin-bottom:4px}#inside{height:10px;margin-bottom:6px}#tail{height:10px;margin-top:3px}#target::after{content:"X";display:block;clear:both;height:10px;margin-top:8px;margin-bottom:5px}',
		'<div id="lead"><span id="float"></span></div><section id="target"><div id="inside"></div></section><div id="tail"></div>',
	);
	const layout = layoutDocument(tree);
	const cleared = pseudoBox(layout, id(), "after");
	expect(cleared).toMatchObject({
		borderY: 24,
		marginTop: 8,
		marginBottom: 5,
	});
	expect(generatedGlyphs(layout, id(), "after")).toMatchObject([
		{ character: "X", x: 0, y: 25 },
	]);
	expect(elementBox(layout, tree, id("#tail")).borderY).toBe(39);
});

it("does not borrow an overflowing float from an earlier flow-root boundary", () => {
	const { tree, id } = fixture(
		'#lead{display:flow-root;height:10px}#float{height:50px}#target::before{content:"X";display:block;clear:both;height:10px}',
	);
	const layout = layoutDocument(tree);
	expect(elementBox(layout, tree, id("#float"))).toMatchObject({
		borderY: 0,
		borderBoxHeight: 50,
	});
	expect(pseudoBox(layout, id()).borderY).toBe(10);
	expect(generatedGlyphs(layout, id())).toMatchObject([
		{ character: "X", x: 0, y: 11 },
	]);
	expect(elementBox(layout, tree, id("#following")).borderY).toBe(20);
});

it.each(["before", "after"] as const)(
	"clears outer floats before entering a generated ::%s flow-root",
	(name) => {
		const { tree, id } = fixture(
			`#target::${name}{content:"X";display:flow-root;clear:both;height:10px}`,
		);
		const layout = layoutDocument(tree);
		expect(pseudoNode(buildFormattingTree(tree), id(), name)).toMatchObject({
			clear: "both",
			independentContext: true,
		});
		expect(pseudoBox(layout, id(), name).borderY).toBe(30);
		expect(generatedGlyphs(layout, id(), name)).toMatchObject([
			{ character: "X", x: 0, y: 31 },
		]);
		expect(elementBox(layout, tree, id("#following")).borderY).toBe(40);
	},
);

it.each([
	{ display: "inline", position: "static" },
	{ display: "inline-block", position: "static" },
	{ display: "block", position: "absolute" },
	{ display: "block", position: "fixed" },
] as const)(
	"ignores generated clear on $position display:$display without changing geometry",
	({ display, position }) => {
		const { tree, id } = fixture(
			`#target{position:relative}#target::before{content:"X";display:${display};position:${position};left:50px;top:4px;width:40px;height:10px}#target.clearing::before{clear:both}`,
		);
		const initial = layoutDocument(tree);
		tree.setAttribute(id(), "class", "clearing");
		const formatting = buildFormattingTree(tree);
		expect(pseudoNode(formatting, id()).clear).toBeUndefined();
		expect(
			formatting.issues["generated-content-clear-layout-not-supported"],
		).toBeUndefined();
		expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
		const updated = layoutDocument(tree);
		expect(updated.boxes.map(rectangle)).toEqual(initial.boxes.map(rectangle));
		expect(glyphGeometry(generatedGlyphs(updated, id()))).toEqual(
			glyphGeometry(generatedGlyphs(initial, id())),
		);
	},
);

it.each(["inline-start", "inline-end"] as const)(
	"guards generated block clear:%s but ignores it after an inline display mutation",
	(clear) => {
		const { tree, id } = fixture(
			`#target::before{content:"X";display:block;clear:${clear}}#target.inline::before{display:inline}`,
		);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-clear-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			"generated-content-clear-layout-not-supported",
		);
		tree.setAttribute(id(), "class", "inline");
		const formatting = buildFormattingTree(tree);
		expect(pseudoNode(formatting, id()).clear).toBeUndefined();
		expect(
			formatting.issues["generated-content-clear-layout-not-supported"],
		).toBeUndefined();
		expect(generatedGlyphs(layoutDocument(tree), id())).toMatchObject([
			{ character: "X", x: 20, y: 1 },
		]);
	},
);

it("keeps generated floats guarded even when they request physical clearance", () => {
	const { tree } = fixture(
		'#target::before{content:"X";display:block;float:left;clear:both;width:20px;height:10px}',
	);
	expect(
		buildFormattingTree(tree).issues[
			"generated-content-float-layout-not-supported"
		],
	).toBe(1);
	expect(() => layoutDocument(tree)).toThrow(
		"generated-content-float-layout-not-supported",
	);
});

it.each(["flex", "grid", "table"] as const)(
	"does not admit generated display:%s through physical-clear support",
	(display) => {
		const { tree } = fixture(
			`#target::before{content:"X";display:${display};clear:both}`,
		);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-display-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			"generated-content-display-layout-not-supported",
		);
	},
);

it.each([
	{ declaration: "position:sticky;top:0", feature: "position" },
	{ declaration: "overflow:hidden", feature: "overflow" },
] as const)(
	"retains the generated $feature guard alongside physical clearance",
	({ declaration, feature }) => {
		const { tree } = fixture(
			`#target::before{content:"X";display:block;clear:both;${declaration}}`,
		);
		const issue = `generated-content-${feature}-layout-not-supported`;
		expect(buildFormattingTree(tree).issues[issue]).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(issue);
	},
);

it("invalidates generated clearance when float height changes and display hides or restores it", () => {
	const { tree, id } = fixture(
		'#target::before{content:"X";display:block;clear:both;height:10px}',
	);
	expect(pseudoBox(layoutDocument(tree), id()).borderY).toBe(30);
	tree.setAttribute(id("#float"), "style", "height:50px");
	expect(pseudoBox(layoutDocument(tree), id()).borderY).toBe(50);
	tree.setAttribute(id("#float"), "style", "display:none");
	expect(pseudoBox(layoutDocument(tree), id()).borderY).toBe(0);
	expect(buildFormattingTree(tree).issues).toEqual({});
	tree.removeAttribute(id("#float"), "style");
	const restored = layoutDocument(tree);
	expect(pseudoBox(restored, id()).borderY).toBe(30);
	expect(elementBox(restored, tree, id("#following")).borderY).toBe(40);
});

it("refreshes clear side and glyphs after an inherited custom-property mutation", () => {
	const { tree, id } = fixture(
		'#target{--clear-side:left}#target::before{content:"X";display:block;clear:var(--clear-side);height:10px}',
	);
	const initial = layoutDocument(tree);
	expect(pseudoBox(initial, id()).borderY).toBe(30);
	tree.setAttribute(id(), "style", "--clear-side:right");
	const updated = layoutDocument(tree);
	expect(pseudoNode(buildFormattingTree(tree), id()).clear).toBe("right");
	expect(pseudoBox(updated, id()).borderY).toBe(0);
	expect(generatedGlyphs(updated, id())).toMatchObject([
		{ character: "X", x: 20, y: 1 },
	]);
	expect(elementBox(updated, tree, id("#following")).borderY).toBe(10);
	expect(pseudoBox(initial, id()).borderY).toBe(30);
});

it("removes and restores empty clearfix space when generated content is suppressed", () => {
	const { tree, id } = fixture(
		'#target::after{content:"";display:block;clear:both}#target.suppressed::after{content:none}',
		'<section id="target"><span id="float"></span></section><div id="following"></div>',
	);
	expect(elementBox(layoutDocument(tree), tree, id()).borderBoxHeight).toBe(30);
	tree.setAttribute(id(), "class", "suppressed");
	const suppressed = layoutDocument(tree);
	expect(
		suppressed.text.horizontal.formatting.nodes.some(
			(node) => node.generatedContent?.owner === id(),
		),
	).toBe(false);
	expect(elementBox(suppressed, tree, id()).borderBoxHeight).toBe(0);
	expect(elementBox(suppressed, tree, id("#following")).borderY).toBe(0);
	expect(
		buildFormattingTree(tree).issues["clear-layout-not-supported"],
	).toBeUndefined();
	tree.removeAttribute(id(), "class");
	expect(elementBox(layoutDocument(tree), tree, id("#following")).borderY).toBe(
		30,
	);
});

it.each(["text", "boxes", "work"] as const)(
	"charges cleared generated content to the existing %s limit without mutating DOM",
	(budget) => {
		const { tree, id } = fixture(
			'#target::before{content:"four";display:block;clear:both}',
		);
		const complete = buildFormattingTree(tree);
		const options = {
			text: { maxTextCodeUnits: 3 },
			boxes: { maxBoxes: complete.metrics.boxes - 1 },
			work: { maxWork: complete.metrics.work - 1 },
		}[budget];
		const revision = tree.revision;
		const count = tree.nodeCount;
		expect(complete.metrics.textCodeUnits).toBe(4);
		expect(pseudoNode(complete, id()).clear).toBe("both");
		expect(() => buildFormattingTree(tree, options)).toThrow(
			`${budget === "boxes" ? "box" : budget} limit`,
		);
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
		expect(buildFormattingTree(tree).metrics).toEqual(complete.metrics);
		expect(pseudoBox(layoutDocument(tree), id()).borderY).toBe(30);
	},
);

it("paints a cleared generated box at its real position without DOM refs or control targets", () => {
	const { tree, queries, id } = fixture(
		'#target::before{content:"X";display:block;clear:both;height:10px;background:red}#target::after{content:"";display:block;clear:both}',
	);
	const controls = documentGeneratedControls(tree);
	const targets = controls.metrics().targets;
	const revision = tree.revision;
	const count = tree.nodeCount;
	const children = [...tree.get(id()).children];
	const references = queries
		.querySelectorAll("*")
		.map((owner) => tree.reference(owner));
	const raster = rasterizeDocument(tree);
	expect(buildFormattingTree(tree).issues).toEqual({
		"float-layout-not-supported": 1,
		"clear-layout-not-supported": 2,
	});
	expect(rectangle(pseudoBox(raster.layout, id()))).toEqual({
		x: 0,
		y: 30,
		width: 120,
		height: 10,
	});
	expect(pseudoBox(raster.layout, id(), "after")).toMatchObject({
		borderY: 40,
		borderBoxHeight: 0,
	});
	expect(pixel(raster.image, 100, 35)).toEqual([255, 0, 0, 255]);
	expect(pixel(raster.image, 100, 5)).not.toEqual([255, 0, 0, 255]);
	expect(pixel(raster.image, 100, 45)).not.toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).targetFromPoint(100, 35)).toEqual({
		id: id(),
	});
	const generated = raster.layout.text.horizontal.formatting.nodes.filter(
		(node) => node.generatedContent,
	);
	expect(generated).toHaveLength(3);
	for (const node of generated) {
		expect(node.generatedContent?.owner).toBe(id());
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(node.control).toBeUndefined();
		if (node.kind === "text") expect(node.clear).toBeUndefined();
	}
	for (const glyph of generatedGlyphs(raster.layout, id()))
		expect(glyph.ref).toBe("");
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.get(id()).children).toEqual(children);
	expect(tree.textContent(id())).toBe("");
	expect(queries.querySelectorAll("#target::before, #target::after")).toEqual(
		[],
	);
	expect(
		queries.querySelectorAll("*").map((owner) => tree.reference(owner)),
	).toEqual(references);
	expect(controls.metrics().targets).toBe(targets);
});

it("retains physical clear metadata without float diagnostics or spurious empty-box space", () => {
	const { tree, id } = fixture(
		'#target::before{content:"";display:block;clear:both}',
		'<section id="target"></section><div id="following"></div>',
	);
	const formatting = buildFormattingTree(tree);
	expect(pseudoNode(formatting, id()).clear).toBe("both");
	expect(formatting.issues).toEqual({});
	const layout = layoutDocument(tree);
	expect(rectangle(pseudoBox(layout, id()))).toEqual({
		x: 0,
		y: 0,
		width: 120,
		height: 0,
	});
	expect(elementBox(layout, tree, id("#following")).borderY).toBe(0);
});
