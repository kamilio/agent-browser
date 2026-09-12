import { afterEach, expect, it } from "vitest";
import { flowStyleCapabilities } from "./css-flow.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import {
	layoutDocument,
	type DocumentLayoutOptions,
	type PositionedTextContext,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
it("advertises the partial physical float profile without general clearance", () => {
	expect(flowStyleCapabilities).toMatchObject({
		partial: true,
		floats: true,
		floatLayout: "physical-left-right-block-inline-replaced-flow-root",
		floatClearance: "floating-boxes-only",
		clearance: false,
		overflowClipping: false,
	});
});

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, css = "", width = 36) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:${width}px}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/float-document-tests",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 96);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	const layout = (options?: DocumentLayoutOptions) =>
		layoutDocument(tree, options);
	const context = (selector = "#main") => {
		const found = layout().contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing text context ${selector}`);
		return found;
	};
	const box = (selector: string) => {
		const found = layout().boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing box ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		layout,
		context,
		box,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function glyphXs(context: PositionedTextContext) {
	return context.glyphs
		.filter((glyph) => glyph.character !== " ")
		.map((glyph) => glyph.x);
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	const image = rasterizeDocument(tree).image;
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each(["left", "right"])(
	"wraps beside a %s float and restores full line width at its bottom",
	(side) => {
		const { rect, context } = fixture(
			'<span id="float"></span>AA BB CC DD',
			`#float{float:${side};width:18px;height:16px}`,
		);
		expect(rect("#float")).toMatchObject({
			x: side === "left" ? 0 : 18,
			y: 0,
			width: 18,
			height: 16,
		});
		expect(context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
		expect(glyphXs(context())).toEqual(
			side === "left"
				? [18, 24, 18, 24, 0, 6, 18, 24]
				: [0, 6, 0, 6, 0, 6, 18, 24],
		);
		expect(rect("#main")).toMatchObject({ width: 36, height: 24 });
	},
);

it("uses the interval between opposing floats without retaining phantom lines", () => {
	const { rect, context } = fixture(
		'<span id="left"></span><span id="right"></span>AA BB CC DD',
		"#left{float:left;width:12px;height:16px}#right{float:right;width:12px;height:16px}",
	);
	expect(rect("#left")).toMatchObject({ x: 0, y: 0, width: 12, height: 16 });
	expect(rect("#right")).toMatchObject({ x: 24, y: 0, width: 12, height: 16 });
	expect(context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
	expect(glyphXs(context())).toEqual([12, 18, 12, 18, 0, 6, 18, 24]);
	expect(rect("#main").height).toBe(24);
});

it.each(["left", "right"])(
	"lets an oversized %s float protrude opposite its side while text waits below",
	(side) => {
		const { rect, context } = fixture(
			'<span id="float"></span>AA BB',
			`#float{float:${side};width:40px;height:16px}`,
			24,
		);
		expect(rect("#float")).toMatchObject({
			x: side === "left" ? 0 : -16,
			y: 0,
			width: 40,
			height: 16,
		});
		expect(context().lines.map((line) => line.top)).toEqual([16, 24]);
		expect(glyphXs(context())).toEqual([0, 6, 0, 6]);
		expect(rect("#main").height).toBe(32);
	},
);

it("shortens an ordinary block's lines without narrowing or lowering its box", () => {
	const { rect, context } = fixture(
		'<span id="float"></span><div id="block">AA BB CC</div><div id="after"></div>',
		"#float{float:left;width:18px;height:16px}#after{height:8px}",
	);
	expect(rect("#block")).toMatchObject({ x: 0, y: 0, width: 36, height: 24 });
	expect(context("#block").lines.map((line) => line.top)).toEqual([0, 8, 16]);
	expect(glyphXs(context("#block"))).toEqual([18, 24, 18, 24, 0, 6]);
	expect(rect("#after")).toMatchObject({ y: 24, width: 36, height: 8 });
});

it.each([
	{ width: 36, floatWidth: 12, floatTop: 0, textLeft: 12 },
	{ width: 24, floatWidth: 18, floatTop: 8, textLeft: 0 },
])(
	"places a source float after current-line text within a $width px container",
	({ width, floatWidth, floatTop, textLeft }) => {
		const { rect, context } = fixture(
			'AA<span id="float"></span>',
			`#float{float:left;width:${floatWidth}px;height:16px}`,
			width,
		);
		expect(rect("#float")).toMatchObject({ x: 0, y: floatTop });
		expect(context().lines.map((line) => line.top)).toEqual([0]);
		expect(glyphXs(context())).toEqual([textLeft, textLeft + 6]);
		expect(rect("#main").height).toBe(8);
	},
);

it.each([
	{ width: 28, contentWidth: 20, contentHeight: 16 },
	{ width: 48, contentWidth: 30, contentHeight: 8 },
])(
	"shrink-to-fits an auto float with zero auto margins inside $width px",
	({ width, contentWidth, contentHeight }) => {
		const { box, rect } = fixture(
			'<span id="float">AA BB</span>',
			"#float{float:left;margin:auto;padding:2px 3px;border:1px solid blue}",
			width,
		);
		expect(box("#float")).toMatchObject({
			contentWidth,
			contentHeight,
			contentX: 4,
			contentY: 3,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
		});
		expect(rect("#float")).toMatchObject({
			x: 0,
			y: 0,
			width: contentWidth + 8,
			height: contentHeight + 6,
		});
	},
);

it("excludes the entire float margin box including padding and borders", () => {
	const { box, rect, context } = fixture(
		'<span id="float"></span>AA',
		"#float{float:left;width:12px;height:8px;padding:2px 3px;border:1px solid blue;margin:4px 5px 6px 7px}",
	);
	expect(rect("#float")).toMatchObject({ x: 7, y: 4, width: 20, height: 14 });
	expect(box("#float")).toMatchObject({
		contentX: 11,
		contentY: 7,
		contentWidth: 12,
		contentHeight: 8,
		marginTop: 4,
		marginBottom: 6,
		marginLeft: 7,
		marginRight: 5,
	});
	expect(context().lines.map((line) => line.top)).toEqual([24]);
	expect(glyphXs(context())).toEqual([0, 6]);
	expect(rect("#main").height).toBe(32);
});

it.each([
	{ style: "display:block", height: 0 },
	{ style: "display:flow-root", height: 24 },
	{ style: "display:flow-root;height:8px", height: 8 },
])(
	"computes wrapper height for $style without treating a float as normal flow",
	({ style, height }) => {
		const { rect } = fixture(
			`<section id="wrapper" style="${style}"><div id="normal"><span id="float"></span></div></section><div id="after"></div>`,
			"#float{float:left;width:12px;height:24px}#after{height:8px}",
		);
		expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
		expect(rect("#normal").height).toBe(0);
		expect(rect("#wrapper").height).toBe(height);
		expect(rect("#after").y).toBe(height);
	},
);

it("does not leak a nested BFC's overflowing float into its ancestor autoheight", () => {
	const { rect } = fixture(
		'<section id="outer"><section id="inner"><span id="float"></span></section></section><div id="after"></div>',
		"#outer,#inner{display:flow-root}#inner{height:8px}#float{float:left;width:12px;height:32px}#after{height:8px}",
	);
	expect(rect("#float")).toMatchObject({ y: 0, height: 32 });
	expect(rect("#inner").height).toBe(8);
	expect(rect("#outer").height).toBe(8);
	expect(rect("#after").y).toBe(8);
});

it("displaces a measured full-width BFC and translates its own float with it", () => {
	const { rect, context } = fixture(
		'<span id="prior"></span><section id="bfc"><span id="inner"></span>AA BB</section><div id="after"></div>',
		"#prior{float:left;width:18px;height:16px}#bfc{display:flow-root;width:36px}#inner{float:right;width:12px;height:24px}#after{height:8px}",
	);
	expect(rect("#prior")).toMatchObject({ x: 0, y: 0, height: 16 });
	expect(rect("#bfc")).toMatchObject({ x: 0, y: 16, width: 36, height: 24 });
	expect(rect("#inner")).toMatchObject({ x: 24, y: 16, width: 12, height: 24 });
	expect(context("#bfc").lines.map((line) => line.top)).toEqual([16, 24]);
	expect(glyphXs(context("#bfc"))).toEqual([0, 6, 0, 6]);
	expect(rect("#after").y).toBe(40);
});

it.each([
	{ clear: "left", top: 8 },
	{ clear: "right", top: 16 },
	{ clear: "both", top: 16 },
])("clears a floating box past earlier $clear floats", ({ clear, top }) => {
	const { rect } = fixture(
		'<span id="left"></span><span id="right"></span><span id="cleared"></span>',
		`#left{float:left;width:12px;height:8px}#right{float:right;width:12px;height:16px}#cleared{float:left;clear:${clear};width:12px;height:4px}`,
		48,
	);
	expect(rect("#left")).toMatchObject({ x: 0, y: 0 });
	expect(rect("#right")).toMatchObject({ x: 36, y: 0 });
	expect(rect("#cleared")).toMatchObject({
		x: 0,
		y: top,
		width: 12,
		height: 4,
	});
	expect(rect("#main").height).toBe(0);
});

it("keeps relative offsets out of exclusions and updates paint and hits after side mutation", () => {
	const { tree, id, rect, context } = fixture(
		'<span id="float"></span><span id="text">AA BB CC DD</span>',
		"#float{float:left;width:12px;height:16px;position:relative;left:6px;top:4px;background:red}",
	);
	const original = rect("#float");
	expect(original).toMatchObject({ x: 6, y: 4, width: 12, height: 16 });
	expect(context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
	expect(glyphXs(context())).toEqual([12, 18, 12, 18, 0, 6, 18, 24]);
	expect(pixel(tree, 7, 5)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(7, 5)).toBe(id("#float"));
	const revision = tree.revision;
	tree.setAttribute(id("#float"), "style", "float:right");
	expect(tree.revision).toBeGreaterThan(revision);
	expect(rect("#float")).toMatchObject({ x: 30, y: 4, width: 12, height: 16 });
	expect(original).toMatchObject({ x: 6, y: 4 });
	expect(context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
	expect(glyphXs(context())).toEqual([0, 6, 0, 6, 0, 6, 18, 24]);
	expect(pixel(tree, 31, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(tree, 7, 5)).not.toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(31, 5)).toBe(id("#float"));
	expect(documentHitTesting(tree).elementFromPoint(7, 5)).not.toBe(
		id("#float"),
	);
});

it("sizes a native replaced control float and retains its hit ownership", () => {
	const { tree, id, rect, context, layout } = fixture(
		'<input id="float" type="checkbox">AA BB',
		"#float{float:left;width:12px;height:8px;padding:0;border:0;margin:auto}",
	);
	expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 12, height: 8 });
	expect(context().lines.map((line) => line.top)).toEqual([0, 8]);
	expect(glyphXs(context())).toEqual([12, 18, 0, 6]);
	expect(
		layout().text.horizontal.images.find(
			(image) => image.ref === tree.reference(id("#float")),
		),
	).toMatchObject({ contentWidth: 12, contentHeight: 8 });
	expect(documentHitTesting(tree).elementFromPoint(4, 4)).toBe(id("#float"));
});

it.each([
	[
		"logical side",
		'<span style="float:inline-start;width:12px;height:8px"></span>',
	],
	[
		"logical nonfloating clear",
		'<span style="float:left;width:12px;height:8px"></span><div style="clear:inline-start">A</div>',
	],
	[
		"negative outer width",
		'<span style="float:left;width:4px;height:8px;margin-left:-8px"></span>',
	],
	[
		"negative outer height",
		'<span style="float:left;width:12px;height:4px;margin-top:-8px"></span>',
	],
	[
		"inline-flex interaction",
		'<span style="float:left;width:12px;height:8px"></span><span style="display:inline-flex;width:12px;height:8px"></span>',
	],
	[
		"flex interaction",
		'<span style="float:left;width:12px;height:8px"></span><div style="display:flex"><span>A</span></div>',
	],
	[
		"grid interaction",
		'<span style="float:left;width:12px;height:8px"></span><div style="display:grid"><span>A</span></div>',
	],
	[
		"table interaction",
		'<span style="float:left;width:12px;height:8px"></span><table><tr><td>A</td></tr></table>',
	],
])("keeps the unfinished %s gate explicitly unsupported", (_name, content) => {
	const { tree, layout } = fixture(content);
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	expect(() => layout()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("measures auto-width floating descendants before placing their owner", () => {
	const { box } = fixture(
		'<div id="outer" style="float:left"><div id="inner" style="float:right">AA BB</div></div>',
	);
	expect(box("#outer")).toMatchObject({
		borderBoxWidth: 30,
		borderBoxHeight: 8,
	});
	expect(box("#inner")).toMatchObject({
		borderBoxWidth: 30,
		borderBoxHeight: 8,
	});
});

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{ name: "combined line retention", options: { text: { maxLines: 1 } } },
	{ name: "token retention", options: { text: { maxTokens: 1 } } },
	{ name: "text work", options: { text: { maxWork: 1 } } },
])("enforces $name caps without mutating the document", ({ options }) => {
	const { tree, layout } = fixture(
		'<span id="float">AAAA</span>BBBB',
		"#float{float:left;width:24px}",
		60,
	);
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	expect(() => layout(options)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
	expect(layout().metrics.lines).toBe(2);
});
