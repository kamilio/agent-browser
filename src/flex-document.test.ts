import { afterEach, expect, it } from "vitest";
import { documentGeometry, LayoutGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument, type DocumentBox } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { renderDocumentPdf } from "./document-pdf.js";
import type { DocumentTree } from "./document.js";
import { layoutFlexContainer } from "./flex-layout.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<div id="first">aa</div><div id="second">bb</div>',
	after = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{display:flex;width:60px}main>div{flex:0 0 20px;min-width:0}${css}</style><main id="container">${content}</main>${after}`,
		"https://fixture.invalid/flex-document",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 100);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = query.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const box = (selector: string, layout = layoutDocument(tree)) => {
		const result = layout.boxes.find((entry) => entry.ref === ref(selector));
		if (!result) throw new Error(`Missing box ${selector}`);
		return result;
	};
	return { tree, id, ref, box };
}
function pixel(image: Readonly<RasterImage>, x: number, y: number) {
	const start = (y * image.width + x) * 4;
	return [...image.pixels.slice(start, start + 4)];
}

it("positions containers, items, siblings and actual glyphs in page coordinates", () => {
	const { tree, box, ref } = fixture(
		"body{display:flow-root;width:100px;padding:3px;margin:7px 0 0 5px}header{height:6px;margin-bottom:4px}main{margin:6px 0 8px 4px;padding:3px;border:2px solid red}footer{height:5px;margin-top:10px}",
		'<div id="first">aa</div><div id="second">bb</div>',
		'<footer id="after"></footer>',
	);
	const header = tree.createElement("header");
	tree.insert(idFrom(tree, "body"), header, idFrom(tree, "main"));
	const layout = layoutDocument(tree);
	expect(box("#container", layout)).toMatchObject({
		borderX: 12,
		contentX: 17,
		borderY: 22,
		contentY: 27,
		contentHeight: 10,
		borderBoxHeight: 20,
	});
	expect(box("#first", layout)).toMatchObject({
		borderX: 17,
		borderY: 27,
		contentWidth: 20,
		contentHeight: 10,
	});
	expect(box("#second", layout)).toMatchObject({ borderX: 37, borderY: 27 });
	expect(box("#after", layout).borderY).toBe(52);
	const context = layout.contexts.find((entry) => entry.ref === ref("#second"));
	expect(context?.glyphs[0]).toMatchObject({ x: 37, y: 28 });
	expect(
		new LayoutGeometry(layout).getBoundingClientRect(ref("#container")),
	).toMatchObject({ x: 12, y: 22, width: 70, height: 20 });
});
function idFrom(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(selector);
	return id;
}

it.each([
	["row", "nowrap", "flex-start"],
	["row-reverse", "nowrap", "center"],
	["row", "wrap", "space-between"],
	["row-reverse", "wrap", "space-evenly"],
	["row", "wrap-reverse", "stretch"],
	["row-reverse", "wrap-reverse", "flex-end"],
] as const)(
	"translates every local box and text record for %s/%s/%s",
	(direction, wrap, alignment) => {
		const { tree, box, ref } = fixture(
			`body{padding:5px}main{width:35px;height:90px;padding:3px;border:1px solid red;flex-direction:${direction};flex-wrap:${wrap};align-content:${alignment};gap:4px}#first{padding:2px}#second{order:-1}`,
			'<div id="first"><span id="span">a b c d</span></div><div id="second">B</div>',
		);
		const layout = layoutDocument(tree);
		const shell = box("#container", layout);
		const local = layoutFlexContainer(tree, ref("#container"), {
			contentWidth: shell.contentWidth,
			containingWidth: shell.containingWidth,
			containingHeight: shell.containingHeight,
		});
		for (const entry of local.boxes) {
			const actual = layout.boxes.find(
				(candidate) => candidate.id === entry.id,
			) as DocumentBox;
			expect(actual.borderX).toBe(entry.borderX + shell.contentX);
			expect(actual.borderY).toBe(entry.borderY + shell.contentY);
			expect(actual.contentWidth).toBe(entry.contentWidth);
			expect(actual.contentHeight).toBe(entry.contentHeight);
		}
		for (const context of local.contexts) {
			const index = layout.contexts.findIndex(
				(candidate) => candidate.id === context.id,
			);
			const actual = layout.contexts[index];
			const relative = layout.text.contexts[index];
			expect(relative.id).toBe(actual.id);
			expect(actual.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual(
				context.glyphs.map((glyph) => [
					glyph.x + shell.contentX,
					glyph.y + shell.contentY,
				]),
			);
			expect(relative.glyphs.map((glyph) => glyph.y + actual.contentY)).toEqual(
				actual.glyphs.map((glyph) => glyph.y),
			);
			expect(
				relative.lines.map((line) => line.baseline + actual.contentY),
			).toEqual(actual.lines.map((line) => line.baseline));
			expect(
				relative.fragments.map((fragment) => fragment.y + actual.contentY),
			).toEqual(actual.fragments.map((fragment) => fragment.y));
		}
		expect(layout.metrics.glyphs).toBe(
			layout.contexts.reduce((sum, context) => sum + context.glyphs.length, 0),
		);
		expect(layout.text.horizontal.widths.map((entry) => entry.id)).toEqual(
			layout.boxes.map((entry) => entry.id),
		);
	},
);

it.each([
	["height:40px", 40, 20],
	["min-height:40px", 40, 20],
	["height:100px;max-height:40px", 40, 20],
	["height:20px;min-height:40px", 40, 20],
	["height:0", 0, 0],
	["height:50%", 50, 25],
] as const)(
	"resolves the containing block and stretched descendants for %s",
	(css, height, childHeight) => {
		const { box } = fixture(
			`body{height:100px}main{${css}}#child{height:50%}`,
			'<div id="first"><div id="child"></div></div>',
		);
		expect(box("#container").contentHeight).toBe(height);
		expect(box("#first").contentHeight).toBe(height);
		expect(box("#child").contentHeight).toBe(childHeight);
	},
);

it("contains item margins while container margins still collapse with block siblings", () => {
	const { box } = fixture(
		"main{margin:10px 0 12px}main>div{margin-top:7px;margin-bottom:9px}footer{height:3px;margin-top:20px}",
		undefined,
		'<footer id="after"></footer>',
	);
	expect(box("#container")).toMatchObject({
		borderY: 10,
		contentHeight: 26,
		marginCollapse: {
			withFirstChild: false,
			withLastChild: false,
			through: false,
		},
	});
	expect(box("#first").borderY).toBe(17);
	expect(box("#after").borderY).toBe(56);
});

it("keeps multiple containers, surrounding text, and anonymous flex items distinct", () => {
	const { tree, box } = fixture(
		"main{padding:2px}section{display:flex;width:50px}footer{height:3px}",
		'a <span id="first">b</span> c',
		'<section id="other"><div id="second">d e</div></section><footer id="after"></footer>',
	);
	const layout = layoutDocument(tree);
	expect(box("#other", layout).borderY).toBe(14);
	expect(box("#after", layout).borderY).toBe(24);
	expect(
		layout.contexts
			.flatMap((context) => context.glyphs.map((glyph) => glyph.character))
			.join(""),
	).toContain("d e");
	expect(new Set(layout.boxes.map((entry) => entry.id)).size).toBe(
		layout.boxes.length,
	);
	expect(new Set(layout.contexts.map((entry) => entry.id)).size).toBe(
		layout.contexts.length,
	);
	expect(renderDocumentPdf(tree).metrics.glyphs).toBeGreaterThanOrEqual(5);
});

it("treats empty flex containers as non-collapsing independent boxes", () => {
	const { box } = fixture(
		"main{min-height:12px;padding:2px;margin-top:3px}footer{height:4px}",
		"",
		'<footer id="after"></footer>',
	);
	expect(box("#container")).toMatchObject({
		borderY: 3,
		contentHeight: 12,
		borderBoxHeight: 16,
		marginCollapse: { through: false },
	});
	expect(box("#after").borderY).toBe(19);
});

it.each(["row", "row-reverse"])(
	"paints overlapping %s item subtrees atomically in order-modified order",
	(direction) => {
		const { tree, id, ref } = fixture(
			`main{width:20px;flex-direction:${direction}}main>div{height:20px;margin-right:-20px}#first{background:red}#second{background:blue}span{background:lime}`,
			'<div id="first"><span id="inside">A</span></div><div id="second"></div>',
		);
		const origin = direction === "row" ? 0 : 20;
		const image = rasterizeDocument(tree).image;
		for (let y = 0; y < 20; y++)
			for (let x = origin; x < origin + 20; x++)
				expect(pixel(image, x, y)).toEqual([0, 0, 255, 255]);
		expect(documentHitTesting(tree).elementFromPoint(origin + 1, 2)).toBe(
			id("#second"),
		);
		tree.setAttribute(id("#first"), "style", "order:2");
		const changed = rasterizeDocument(tree).image;
		expect(pixel(changed, origin + 15, 15)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(tree).elementFromPoint(origin + 1, 2)).toBe(
			id("#inside"),
		);
		expect(documentHitTesting(tree).elementFromPoint(origin + 15, 15)).toBe(
			id("#first"),
		);
		const layout = layoutDocument(tree);
		const entries = [...layoutContentItems(layout, () => {})];
		const firstBox = entries.findIndex(
			(entry) => entry.kind === "box" && entry.box.ref === ref("#first"),
		);
		const secondBox = entries.findIndex(
			(entry) => entry.kind === "box" && entry.box.ref === ref("#second"),
		);
		expect(secondBox).toBeLessThan(firstBox);
		expect(tree.get(id("#container")).children[0]).toBe(id("#first"));
	},
);

it("scrolls overflowing flex items, translates client coordinates and invalidates prepared rasters", () => {
	const { tree, id, box } = fixture(
		"main{width:20px;flex-wrap:wrap;row-gap:10px}main>div{height:20px}#first{background:red}#second{background:blue}",
	);
	documentStyles(tree).setViewport(30, 20);
	const scroll = documentScroll(tree);
	expect(scroll.bounds()).toEqual({ x: 0, y: 30 });
	expect(box("#second").borderY).toBe(30);
	const prepared = prepareDocumentRaster(tree);
	expect(scroll.to(0, 30)).toBe(true);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#second")),
	).toMatchObject({ y: 0, width: 20, height: 20 });
	expect(documentHitTesting(tree).elementFromPoint(15, 15)).toBe(id("#second"));
	expect(pixel(rasterizeDocument(tree).image, 15, 15)).toEqual([
		0, 0, 255, 255,
	]);
	if (prepared.layout.text.horizontal.formatting.revision !== tree.revision)
		expect(() => prepared.rasterize()).toThrow("stale");
	tree.setAttribute(id("#container"), "style", "width:60px;flex-wrap:nowrap");
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	expect(() => prepared.rasterize()).toThrow("stale");
});

it("resizes from the actual parent width and preserves previous immutable output", () => {
	const { tree, id, box } = fixture(
		"main{width:auto}main>div{flex:1;min-width:0}",
	);
	const original = layoutDocument(tree);
	expect(box("#first", original).contentWidth).toBe(50);
	documentStyles(tree).setViewport(60, 100);
	expect(box("#first").contentWidth).toBe(30);
	tree.setAttribute(id("#container"), "style", "display:block");
	expect(box("#second").borderY).toBe(10);
	expect(box("#first", original).contentWidth).toBe(50);
	expect(Object.isFrozen(original.contexts[0].glyphs)).toBe(true);
});

it("uses the image owner for root and inline images and paints their actual translated boxes", async () => {
	const { tree, box, id } = fixture(
		"main{padding:4px}img{width:10px;height:6px}#first{flex:0 0 20px}",
		'<img id="first" src="/image.png"><div id="second"><img id="inline" src="/image.png"></div>',
	);
	let requests = 0;
	const bytes = encodePng(createRaster(10, 6, [0, 255, 0, 255]));
	await documentImages(tree, {
		fetch: async (url) => {
			requests++;
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body: bytes,
				redirects: [],
				encodedBytes: bytes.length,
				elapsedMs: 0,
			};
		},
	}).settle();
	const result = rasterizeDocument(tree);
	expect(box("#first", result.layout)).toMatchObject({
		borderX: 4,
		borderY: 4,
		contentWidth: 20,
		contentHeight: 6,
	});
	expect(pixel(result.image, 5, 5)).toEqual([0, 255, 0, 255]);
	const inline = documentGeometry(tree).getBoundingClientRect(id("#inline"));
	expect(pixel(result.image, inline.x + 1, inline.y + 1)).toEqual([
		0, 255, 0, 255,
	]);
	expect(result.metrics.paintedImages).toBe(2);
	expect(requests).toBe(1);
});

it("paints and hits software controls through the same flex geometry", () => {
	const { tree, id } = fixture(
		"main{padding:3px}input{flex:0 0 40px;height:16px}",
		'<input id="first" value="abc"><div id="second">x</div>',
	);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedControls).toBe(1);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#first")),
	).toMatchObject({ x: 3, y: 3 });
	expect(documentHitTesting(tree).elementFromPoint(10, 10)).toBe(id("#first"));
});

it.each([
	"main{flex-direction:column;flex-wrap:wrap;position:absolute}",
	"main{flex-direction:column-reverse;flex-wrap:wrap;position:absolute}",
	"main{display:inline-grid}",
	"#first{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#first{display:grid}",
	"#second{position:absolute}",
	"#second{writing-mode:vertical-rl}",
	"main{flex-wrap:wrap;align-content:baseline}",
])(
	"rejects unsupported prerequisites instead of painting guessed boxes: %s",
	(css) => {
		const { tree } = fixture(css);
		expect(() => layoutDocument(tree)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(tree)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("does not ignore unsupported siblings or non-flex deferred boxes", () => {
	const { tree } = fixture(
		"",
		undefined,
		'<aside style="display:grid">x</aside>',
	);
	expect(() => layoutDocument(tree)).toThrow("issue-free");
});

it("charges all container phases against one deterministic page work budget", () => {
	const { tree } = fixture("", undefined, "<main><div>cc dd</div></main>");
	const result = layoutDocument(tree);
	expect(
		layoutDocument(tree, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		layoutDocument(tree, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() => layoutDocument(tree, { maxWork: 1 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each(["maxTokens", "maxLines", "maxFragments"] as const)(
	"shares %s limits across separate flex containers",
	(limit) => {
		const content =
			limit === "maxFragments" ? "<div><span>a</span></div>" : "<div>a</div>";
		const { tree } = fixture("", content, `<main>${content}</main>`);
		expect(() => layoutDocument(tree, { text: { [limit]: 1 } })).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("does not silently clamp invalid text options before layout", () => {
	const { tree } = fixture();
	expect(() => layoutDocument(tree, { text: { maxLines: 0 } })).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});
