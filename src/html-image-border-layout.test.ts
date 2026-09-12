import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { documentMode } from "./document-mode.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentElementSizes } from "./element-sizes.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

async function fixture(markup: string, css = "", doctype = "<!doctype html>") {
	const tree = parseHtmlDocument(
		`${doctype}<style>html,body{margin:0;padding:0}main{width:40px;font-size:8px;line-height:10px;color:blue}${css}</style><main>${markup}</main>`,
		"https://fixture.invalid/image-border",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(64, 64);
	const requests: string[] = [];
	const body = encodePng(createRaster(4, 2, [255, 0, 0, 255]));
	const images = documentImages(tree, {
		fetch: async (url) => {
			requests.push(url);
			if (url !== "https://fixture.invalid/image.png")
				throw new Error(`Unexpected in-memory image request: ${url}`);
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	await images.settle();
	const queries = new DocumentQueries(tree);
	const id = (selector = "#photo") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const rect = () => documentGeometry(tree).getBoundingClientRect(id());
	return { tree, images, requests, id, rect };
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([0, 2, 3])(
	"lays out, paints and hit-tests a loaded block image with border=%s",
	async (border) => {
		const { tree, images, requests, id, rect } = await fixture(
			`<img id="photo" src="/image.png" border="${border}">`,
			"img{display:block}",
		);
		const width = 4 + border * 2;
		const height = 2 + border * 2;
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(rect()).toMatchObject({ x: 0, y: 0, width, height });
		expect(documentElementSizes(tree).get(id())).toEqual({
			clientWidth: 4,
			clientHeight: 2,
			clientTop: border,
			clientLeft: border,
			offsetWidth: width,
			offsetHeight: height,
		});
		const { image, metrics } = rasterizeDocument(tree);
		expect(metrics.paintedImages).toBe(1);
		expect(pixel(image, border, border)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, border + 3, border + 1)).toEqual([255, 0, 0, 255]);
		const hits = documentHitTesting(tree);
		for (const [column, row] of [
			[0, border],
			[width - 1, border],
			[border, 0],
			[border, height - 1],
		]) {
			expect(pixel(image, column, row)).toEqual(
				border ? [0, 0, 255, 255] : [255, 0, 0, 255],
			);
			expect(hits.elementFromPoint(column + 0.5, row + 0.5)).toBe(id());
		}
		expect(pixel(image, width, 0)).toEqual([255, 255, 255, 255]);
		expect(hits.elementFromPoint(width + 0.5, 0.5)).not.toBe(id());
		expect(hits.elementFromPoint(0.5, height + 0.5)).not.toBe(id());
		expect(images.get(id())).toMatchObject({
			state: "complete",
			naturalWidth: 4,
			naturalHeight: 2,
		});
		expect(requests).toEqual(["https://fixture.invalid/image.png"]);
	},
);

it("includes inline image borders in baseline placement and following text advance", async () => {
	const { tree, rect } = await fixture(
		'A<img id="photo" src="/image.png" border="2">B',
	);
	expect(rect()).toMatchObject({ x: 6, y: 2, width: 8, height: 6 });
	const context = layoutDocument(tree).contexts[0];
	expect(context.lines).toHaveLength(1);
	expect(context.lines[0].width).toBe(20);
	expect(context.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 0],
		["B", 14],
	]);
});

it.each([
	["content-box", 30, 20, 26, 16],
	["border-box", 20, 12, 16, 8],
] as const)(
	"keeps hinted borders separate from padding and content under %s sizing",
	async (sizing, width, height, clientWidth, clientHeight) => {
		const { tree, id, rect } = await fixture(
			'<img id="photo" src="/image.png" border="2" width="20" height="12">',
			`img{display:block;box-sizing:${sizing};padding:2px 3px;background:yellow}`,
		);
		expect(rect()).toMatchObject({ x: 0, y: 0, width, height });
		expect(documentGeometry(tree).getUsedStyle(id())).toMatchObject({
			width: 20,
			height: 12,
			"border-left-width": 2,
			"border-top-width": 2,
		});
		expect(documentElementSizes(tree).get(id())).toEqual({
			clientWidth,
			clientHeight,
			clientLeft: 2,
			clientTop: 2,
			offsetWidth: width,
			offsetHeight: height,
		});
		const { image } = rasterizeDocument(tree);
		expect(pixel(image, 0, 0)).toEqual([0, 0, 255, 255]);
		expect(pixel(image, 2, 2)).toEqual([255, 255, 0, 255]);
		expect(pixel(image, 5, 4)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, width - 6, height - 5)).toEqual([255, 0, 0, 255]);
	},
);

it.each([
	["2", "*{border:0}", "", 0],
	["2", "", "border:1px solid green", 1],
	["2", "img{border:3px solid green!important}", "border:1px solid red", 3],
	["0", "*{border:1px solid green}html,body,main{border:0}", "", 1],
	["invalid", "img{border:1px solid green}", "", 1],
] as const)(
	"uses author borders over border=%s with stylesheet %s and inline style %s",
	async (hint, css, inlineStyle, border) => {
		const { tree, rect } = await fixture(
			`<img id="photo" src="/image.png" border="${hint}" style="${inlineStyle}">`,
			`img{display:block}${css}`,
		);
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(rect()).toMatchObject({
			width: 4 + border * 2,
			height: 2 + border * 2,
		});
		const { image } = rasterizeDocument(tree);
		expect(pixel(image, 0, 0)).toEqual(
			border ? [0, 128, 0, 255] : [255, 0, 0, 255],
		);
		expect(pixel(image, border, border)).toEqual([255, 0, 0, 255]);
	},
);

it("invalidates geometry, pixels, element sizes and hits when border changes or is removed", async () => {
	const { tree, images, requests, id } = await fixture(
		'<img id="photo" src="/image.png" border="0">',
		"img{display:block}",
	);
	const geometry = documentGeometry(tree);
	const sizes = documentElementSizes(tree);
	const hits = documentHitTesting(tree);
	for (const [value, border] of [
		["0", 0],
		["2", 2],
		["4", 4],
		["invalid", 0],
		["3", 3],
		["0", 0],
		["1", 1],
		[undefined, 0],
	] as const) {
		if (value === undefined) tree.removeAttribute(id(), "border");
		else tree.setAttribute(id(), "border", value);
		expect(geometry.getBoundingClientRect(id())).toMatchObject({
			width: 4 + border * 2,
			height: 2 + border * 2,
		});
		expect(sizes.get(id())).toMatchObject({
			clientWidth: 4,
			clientHeight: 2,
			clientLeft: border,
			offsetWidth: 4 + border * 2,
		});
		expect(hits.elementFromPoint(4.5, 0.5) === id()).toBe(border > 0);
		expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual(
			border ? [0, 0, 255, 255] : [255, 0, 0, 255],
		);
		await images.settle();
	}
	expect(requests).toEqual(["https://fixture.invalid/image.png"]);
});

it.each(["", "#photo{padding:1px;border:1px solid blue;background:yellow}"])(
	"renders standards-mode blocked border=0 alternatives like spans with CSS %s",
	async (css) => {
		const actual = await fixture(
			'<a href="/next"><img id="photo" src="http://blocked.invalid/image.png" border="0" alt="Logo" width="300" height="150"></a>',
			css,
		);
		const reference = await fixture(
			'<a href="/next"><span id="photo">Logo</span></a>',
			css,
		);
		const before = snapshotDocument(actual.tree);
		expect(documentMode(actual.tree)).toBe("no-quirks");
		expect(actual.images.get(actual.id())).toMatchObject({
			state: "broken",
			error: "policy-denied",
			naturalWidth: 0,
			naturalHeight: 0,
		});
		const formatting = buildFormattingTree(actual.tree);
		expect(formatting.issues).toEqual({});
		expect(formatting.nodes.some((node) => node.kind === "replaced")).toBe(
			false,
		);
		expect(actual.rect()).toEqual(reference.rect());
		expect(documentGeometry(actual.tree).getClientRects(actual.id())).toEqual(
			documentGeometry(reference.tree).getClientRects(reference.id()),
		);
		const raster = rasterizeDocument(actual.tree);
		expect(raster.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		expect(raster.metrics.paintedImages).toBe(0);
		expect(raster.metrics.paintedGlyphs).toBe(4);
		const rect = actual.rect();
		expect(
			documentHitTesting(actual.tree).elementFromPoint(rect.x + 1, rect.y + 1),
		).toBe(actual.id());
		expect(snapshotDocument(actual.tree)).toEqual(before);
		expect(actual.images.metrics().decodedBytes).toBe(0);
		expect(actual.requests).toEqual([]);
		expect(reference.requests).toEqual([]);
	},
);

it.each([
	"",
	'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
])(
	"retains the broken-image boundary outside standards mode: %s",
	async (doctype) => {
		const { tree, requests } = await fixture(
			'<img id="photo" src="http://blocked.invalid/image.png" border="0" alt="Logo" width="20" height="10">',
			"",
			doctype,
		);
		expect(documentMode(tree)).not.toBe("no-quirks");
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues["element-layout-not-supported"]).toBe(1);
		expect(
			formatting.issues["html-presentation-hint-not-supported"],
		).toBeUndefined();
		expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
		expect(requests).toEqual([]);
	},
);

it.each(['align="left"', 'hspace="2"', 'vspace="2"', 'valign="top"'])(
	"does not admit unrelated image presentation hints alongside border=0: %s",
	async (attribute) => {
		const { tree } = await fixture(
			`<img id="photo" src="/image.png" border="0" ${attribute}>`,
		);
		expect(
			buildFormattingTree(tree).issues["html-presentation-hint-not-supported"],
		).toBe(1);
		expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
	},
);

it.each([
	'<div border="0">Text</div>',
	'<span border="2">Text</span>',
	'<table border="0"><tr><td>Text</td></tr></table>',
	'<table border="2"><tr><td>Text</td></tr></table>',
	'<input type="text" border="0">',
	'<input type=" image " border="2">',
])(
	"keeps the generic border guard on unrelated elements: %s",
	async (markup) => {
		const { tree, requests } = await fixture(markup);
		expect(
			buildFormattingTree(tree).issues["html-presentation-hint-not-supported"],
		).toBe(1);
		expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
		expect(requests).toEqual([]);
	},
);

it("retains table-specific presentation guards around eligible image borders", async () => {
	const { tree } = await fixture(
		'<table cellpadding="2"><tr><td><img id="photo" src="/image.png" border="0"></td></tr></table>',
	);
	const formatting = buildFormattingTree(tree);
	expect(formatting.issues["html-table-presentation-hint-not-supported"]).toBe(
		1,
	);
	expect(
		formatting.issues["html-presentation-hint-not-supported"],
	).toBeUndefined();
	expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
});

it.each([
	'<object id="photo" border="2"></object>',
	'<input id="photo" type="image" border="2">',
	'<input id="photo" type="ImAgE" border="0">',
])(
	"does not enable unsupported embedded rendering for eligible hints: %s",
	async (markup) => {
		const { tree, requests, id } = await fixture(markup);
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.issues["html-presentation-hint-not-supported"],
		).toBeUndefined();
		expect(
			formatting.nodes.find((node) => node.ref === tree.reference(id())),
		).toMatchObject({
			kind: "deferred",
			deferredReason: "element-layout-not-supported",
		});
		expect(() => rasterizeDocument(tree)).toThrow(/supported formatting/);
		expect(requests).toEqual([]);
	},
);
