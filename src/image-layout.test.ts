import { inflateSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import { BrowserCommandHost } from "./command-host.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentElementSizes } from "./element-sizes.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { decodePng } from "./png-decoder.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("advertises the verified loaded-PNG profile without claiming responsive image or color-management support", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("Capability inspection must not create a session");
		},
	});
	try {
		const result = await host.execute(["capabilities"]);
		expect(result.data).toMatchObject({
			imageResources: {
				layout: true,
				painting: true,
				layoutProfile: "loaded-images-normal-flow-inline-and-block",
				scaling: "nearest-neighbor",
				responsiveSources: false,
				colorManagement: false,
			},
		});
	} finally {
		await host.close();
	}
});
async function fixture(
	content = '<img id="photo" src="/a.png">',
	css = "",
	settle = true,
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>main{width:40px;font-size:8px;line-height:10px}${css}</style><main>${content}</main>`,
		"https://example.com/page",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(64, 64);
	const images = documentImages(tree, {
		fetch: async (url) => {
			const second = url.endsWith("b.png");
			const body = encodePng(
				createRaster(
					second ? 6 : 4,
					second ? 4 : 2,
					second ? [0, 0, 255, 255] : [255, 0, 0, 128],
				),
			);
			return {
				url,
				status: url.endsWith("missing.png") ? 404 : 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	if (settle) await images.settle();
	const queries = new DocumentQueries(tree);
	const id = (selector = "#photo") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const rect = (selector = "#photo") =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	return { tree, images, id, rect };
}

it("lays out a loaded inline image at the bottom-margin baseline without fake glyphs", async () => {
	const { tree, rect, id } = await fixture('A<img id="photo" src="/a.png">B');
	const layout = layoutDocument(tree);
	expect(rect()).toMatchObject({ x: 6, y: 6, width: 4, height: 2 });
	expect(layout.contexts[0].lines).toHaveLength(1);
	expect(
		layout.contexts[0].glyphs.map((glyph) => [glyph.character, glyph.x]),
	).toEqual([
		["A", 0],
		["B", 10],
	]);
	expect(documentElementSizes(tree).get(id())).toMatchObject({
		clientWidth: 4,
		clientHeight: 2,
		offsetWidth: 4,
		offsetHeight: 2,
	});
	expect(documentGeometry(tree).getUsedStyle(id())).toMatchObject({
		width: 4,
		height: 2,
	});
});

it("includes replaced padding and margins in the line box but excludes margins from geometry", async () => {
	const { tree, rect } = await fixture(
		undefined,
		"img{width:12px;padding:2px 3px;margin:4px 5px 6px 7px}",
	);
	expect(rect()).toMatchObject({ x: 7, y: 4, width: 18, height: 10 });
	const line = layoutDocument(tree).contexts[0].lines[0];
	expect(line).toMatchObject({ baseline: 20, height: 22, width: 30 });
});

it.each(["inline", "inline-block", "inline flow-root"])(
	"supports the %s replaced display without creating a text context inside it",
	async (display) => {
		const { tree, rect } = await fixture(undefined, `img{display:${display}}`);
		expect(rect()).toMatchObject({ width: 4, height: 2 });
		expect(layoutDocument(tree).contexts).toHaveLength(1);
	},
);

it("positions block images between text contexts and distributes auto horizontal margins", async () => {
	const { tree, rect, id } = await fixture(
		'A<img id="photo" src="/a.png">B',
		"img{display:block;width:20px;margin:3px auto 4px}",
	);
	expect(rect()).toMatchObject({ x: 10, y: 13, width: 20, height: 10 });
	const layout = layoutDocument(tree);
	expect(layout.contexts.map((context) => context.contentY)).toEqual([0, 27]);
	expect(
		layout.boxes.find((box) => box.ref === tree.reference(id())),
	).toMatchObject({
		contentHeight: 10,
		marginLeft: 10,
		marginRight: 10,
		naturalContentHeight: 10,
	});
});

it("does not collapse a zero-height replaced block through its own margins", async () => {
	const { tree, id } = await fixture(
		undefined,
		"img{display:block;height:0px;margin:3px 0 5px}",
	);
	const image = layoutDocument(tree).boxes.find(
		(box) => box.ref === tree.reference(id()),
	);
	expect(image?.marginCollapse.through).toBe(false);
});

it.each([
	["normal", 2, 24],
	["pre-line", 2, 24],
	["nowrap", 1, 48],
	["pre", 1, 48],
])(
	"treats images as atomic wrap opportunities with white-space %s",
	async (mode, count, width) => {
		const { tree, id } = await fixture(
			'AAAA<img id="photo" src="/a.png">BBBB',
			`main{white-space:${mode}}img{width:24px;height:2px}`,
		);
		const context = layoutDocument(tree).contexts[0];
		if (mode === "normal" || mode === "pre-line") {
			expect(context.lines).toHaveLength(3);
			expect(context.lines.map((line) => line.width)).toEqual([24, 24, 24]);
		} else {
			expect(context.lines).toHaveLength(count);
			expect(context.lines[0].width).toBe(width + 24);
		}
		expect(
			context.fragments.filter(
				(fragment) => fragment.ref === tree.reference(id()),
			),
		).toHaveLength(1);
	},
);

it("preserves real spaces around images and removes leading/trailing collapsed whitespace", async () => {
	const { tree } = await fixture(' A <img id="photo" src="/a.png"> B ');
	const context = layoutDocument(tree).contexts[0];
	expect(context.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 0],
		[" ", 6],
		[" ", 16],
		["B", 22],
	]);
	expect(context.lines[0].width).toBe(28);
});

it("resolves image percentage heights through anonymous blocks against their nonanonymous containing block", async () => {
	const { rect } = await fixture(
		'<div>X</div><img id="photo" src="/a.png"><div>Y</div>',
		"main{height:40px}img{height:25%}",
	);
	expect(rect()).toMatchObject({ width: 20, height: 10 });
});

it("keeps percentage heights intrinsic when the containing block height is auto", async () => {
	const { rect } = await fixture(undefined, "img{height:25%}");
	expect(rect()).toMatchObject({ width: 4, height: 2 });
});

it("applies width and height attributes below even zero-specificity author CSS", async () => {
	const { tree, rect, id } = await fixture(
		'<img id="photo" src="/a.png" width="20" height="30">',
	);
	expect(rect()).toMatchObject({ width: 20, height: 30 });
	const style = id("style");
	tree.setTextContent(
		style,
		"main{width:40px;font-size:8px}*{width:auto;height:auto}",
	);
	expect(rect()).toMatchObject({ width: 4, height: 2 });
});

it("accepts percentage hints and recomputes them after viewport changes", async () => {
	const { tree, rect } = await fixture(
		'<img id="photo" src="/a.png" width="50%">',
		"main{width:auto}",
	);
	expect(rect()).toMatchObject({ width: 32, height: 16 });
	documentStyles(tree).setViewport(80, 64);
	expect(rect()).toMatchObject({ width: 40, height: 20 });
});

it("exposes border-box used styles and padded client sizes without adding padding twice", async () => {
	const { tree, rect, id } = await fixture(
		undefined,
		"img{box-sizing:border-box;width:20px;height:12px;padding:2px 3px}",
	);
	expect(rect()).toMatchObject({ width: 20, height: 12 });
	expect(documentGeometry(tree).getUsedStyle(id())).toMatchObject({
		width: 20,
		height: 12,
		"padding-left": 3,
	});
	expect(documentElementSizes(tree).get(id())).toMatchObject({
		clientWidth: 20,
		clientHeight: 12,
		offsetWidth: 20,
		offsetHeight: 12,
	});
});

it("paints decoded image pixels inside padding and composites alpha over the element background", async () => {
	const { tree } = await fixture(
		undefined,
		"img{display:block;width:8px;padding:1px;background:blue}",
	);
	const result = rasterizeDocument(tree);
	const pixel = (column: number, row: number) => [
		...result.image.pixels.slice(
			(row * 64 + column) * 4,
			(row * 64 + column) * 4 + 4,
		),
	];
	expect(pixel(0, 0)).toEqual([0, 0, 255, 255]);
	expect(pixel(1, 1)).toEqual([128, 0, 127, 255]);
	expect(pixel(8, 4)).toEqual([128, 0, 127, 255]);
	expect(pixel(9, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(10, 5)).toEqual([255, 255, 255, 255]);
	expect(result.metrics.paintedImages).toBe(1);
	const png = decodePng(encodePng(result.image));
	expect(png.image.pixels).toEqual(result.image.pixels);
});

it("paints inline images after earlier text and before later text under negative margin overlap", async () => {
	const { tree, rect } = await fixture(
		'A<img id="photo" src="/b.png">A',
		"img{width:6px;height:8px;margin-left:-6px;margin-right:-6px}",
	);
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 6, height: 8 });
	const result = rasterizeDocument(tree);
	expect([...result.image.pixels.slice(260, 264)]).toEqual([0, 0, 0, 255]);
	expect([...result.image.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
	expect(result.metrics.paintedGlyphs).toBe(2);
});

it("paints block images in document order relative to preceding and following text", async () => {
	const { tree } = await fixture(
		'A<img id="photo" src="/b.png"><div id="tail">A</div>',
		"img{display:block;width:6px;height:8px;margin-top:-10px}#tail{margin-top:-8px}",
	);
	const result = rasterizeDocument(tree);
	expect([...result.image.pixels.slice(260, 264)]).toEqual([0, 0, 0, 255]);
	expect([...result.image.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
});

it("keeps hidden image geometry but does not paint, while display-none creates no box", async () => {
	const { tree, rect } = await fixture(
		'<img id="photo" src="/a.png"><img id="gone" src="/a.png">',
		"#photo{visibility:hidden}#gone{display:none}",
	);
	expect(rect()).toMatchObject({ width: 4, height: 2 });
	expect(rect("#gone")).toMatchObject({ width: 0, height: 0 });
	expect(rasterizeDocument(tree).metrics.paintedImages).toBe(0);
});

it.each(["inline", "block"])(
	"lets a later %s image cover earlier glyph ink",
	async (display) => {
		const { tree } = await fixture(
			'A<img id="photo" src="/b.png">',
			`img{display:${display};width:6px;height:8px;${display === "inline" ? "margin-left:-6px" : "margin-top:-10px"}}`,
		);
		const result = rasterizeDocument(tree);
		expect([...result.image.pixels.slice(260, 264)]).toEqual([0, 0, 255, 255]);
	},
);

it("rejects pending and failed images rather than pretending their pixels were captured", async () => {
	const { tree, images } = await fixture(undefined, "", false);
	expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
	await images.settle();
	expect(rasterizeDocument(tree).metrics.paintedImages).toBe(1);
	const broken = await fixture('<img id="photo" src="/missing.png">');
	expect(() => rasterizeDocument(broken.tree)).toThrow(/supported formatting/);
});

it("invalidates cached geometry and prepared paints after changing the resource", async () => {
	const { tree, images, rect, id } = await fixture();
	const prepared = prepareDocumentRaster(tree);
	expect(rect().width).toBe(4);
	tree.setAttribute(id(), "src", "/b.png");
	expect(() => prepared.rasterize()).toThrow(/stale/);
	await images.settle();
	expect(rect()).toMatchObject({ width: 6, height: 4 });
	expect(rasterizeDocument(tree).metrics.paintedImages).toBe(1);
});

it("clips image capture in document coordinates and enforces destination paint work", async () => {
	const { tree } = await fixture(undefined, "img{display:block;width:20px}");
	const full = rasterizeDocument(tree);
	const clipped = rasterizeDocument(tree, {
		clip: { x: 2, y: 2, width: 3, height: 2 },
	});
	for (let row = 0; row < 2; row++)
		for (let column = 0; column < 3; column++)
			expect(
				clipped.image.pixels.slice(
					(row * 3 + column) * 4,
					(row * 3 + column) * 4 + 4,
				),
			).toEqual(
				full.image.pixels.slice(
					((row + 2) * 64 + column + 2) * 4,
					((row + 2) * 64 + column + 2) * 4 + 4,
				),
			);
	expect(() => rasterizeDocument(tree, { maxWork: 4200 })).toThrow(
		/work limit/,
	);
	expect(
		rasterizeDocument(tree, { clip: { x: 30, y: 30, width: 2, height: 2 } })
			.metrics.clippedImages,
	).toBe(1);
});

it("uses the same loaded image pixels in the actual paginated PDF visual layer", async () => {
	const { tree } = await fixture(
		'A<img id="photo" src="/b.png">B',
		"img{display:block;width:20px}",
	);
	const result = renderDocumentPdf(tree);
	const text = Buffer.from(result.bytes).toString("latin1");
	const pattern =
		/<< \/Type \/XObject \/Subtype \/Image.*?\/Length (\d+) >>\nstream\n/gs;
	let index = 0;
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		const length = Number(match[1]);
		const pixels = inflateSync(
			result.bytes.subarray(pattern.lastIndex, pattern.lastIndex + length),
		);
		const actual = rasterizeDocument(tree, { clip: result.clips[index++] })
			.image.pixels;
		expect([...pixels]).toEqual(
			[...actual].filter((_, offset) => offset % 4 !== 3),
		);
		pattern.lastIndex += length;
	}
	expect(index).toBe(result.metrics.pages);
	expect(result.metrics.glyphs).toBe(2);
});
