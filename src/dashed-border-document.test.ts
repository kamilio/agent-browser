import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { borderSides, parseBorderShorthand } from "./css-border.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
afterEach(() => {
	for (const queries of queryOwners.splice(0)) {
		queries.close();
		expect(queries.metrics().indexedNodes).toBe(0);
	}
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(css: string, content = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;background:white;font-size:8px;line-height:12px}${css}</style><body>${content}</body>`,
		"https://fixture.invalid/dashed-borders",
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
	styles.setViewport(100, 100);
	const rect = () => documentGeometry(tree).getBoundingClientRect(id());
	const image = () =>
		rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 100, height: 100 },
		}).image;
	return { tree, queries, styles, id, rect, image };
}

function pixel(image: RasterImage, column: number, row: number) {
	const start = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(start, start + 4));
}

it.each(["border", ...borderSides.map((side) => `border-${side}`)])(
	"parses the authored dashed thin green %s shorthand atomically",
	(property) => {
		const parsed = parseBorderShorthand(property, "dashed thin green");
		expect(parsed).toHaveLength(property === "border" ? 12 : 3);
		expect(
			parsed?.filter((entry) => entry.property.endsWith("-style")),
		).toEqual(
			(property === "border" ? borderSides : [property.slice(7)]).map(
				(side) => ({ property: `border-${side}-style`, value: "dashed" }),
			),
		);
	},
);

it.each(borderSides)("paints actual dashes on the %s side", (side) => {
	const test = fixture(
		`#target{width:30px;height:30px;border-${side}:dashed thin green}`,
	);
	expect(test.styles.metrics().issues).toEqual({});
	expect(resolvedStyleValue(test.tree, test.id(), `border-${side}-width`)).toBe(
		"1px",
	);
	const image = test.image();
	for (let offset = 0; offset < 18; offset++) {
		const horizontal = side === "top" || side === "bottom";
		const column = horizontal ? offset : side === "left" ? 0 : 30;
		const row = horizontal ? (side === "top" ? 0 : 30) : offset;
		expect(pixel(image, column, row)).toEqual(
			offset % 6 < 3 ? [0, 128, 0, 255] : [255, 255, 255, 255],
		);
	}
});

it("resolves the actual TestPages top/bottom declarations without CSS diagnostics", () => {
	const test = fixture(
		"#target{width:30px;height:8px}",
		'<div id="target" style="border-bottom: dashed thin green; border-top: dashed thin green"></div>',
	);
	expect(test.styles.metrics().issues).toEqual({});
	expect(test.rect()).toMatchObject({ x: 0, y: 0, width: 30, height: 10 });
	const image = test.image();
	for (const row of [0, 9]) {
		expect(pixel(image, 1, row)).toEqual([0, 128, 0, 255]);
		expect(pixel(image, 4, row)).toEqual([255, 255, 255, 255]);
	}
});

it("retains solid geometry while painting gaps rather than a solid substitute", () => {
	const dashed = fixture(
		"#target{width:30px;height:12px;border:2px dashed red}",
	);
	const solid = fixture("#target{width:30px;height:12px;border:2px solid red}");
	expect(dashed.rect()).toEqual(solid.rect());
	const dashedRaster = rasterizeDocument(dashed.tree);
	const solidRaster = rasterizeDocument(solid.tree);
	expect(dashedRaster.metrics.borderPixels).toBeGreaterThan(0);
	expect(dashedRaster.metrics.borderPixels).toBeLessThan(
		solidRaster.metrics.borderPixels,
	);
	expect(pixel(dashedRaster.image, 8, 0)).toEqual([255, 255, 255, 255]);
	expect(pixel(solidRaster.image, 8, 0)).toEqual([255, 0, 0, 255]);
});

it("recomputes geometry and dash periods when the authored border changes", () => {
	const test = fixture("#target{width:30px;height:8px;border:1px dashed red}");
	expect(test.rect().width).toBe(32);
	expect(pixel(test.image(), 4, 0)).toEqual([255, 255, 255, 255]);
	test.tree.setAttribute(test.id(), "style", "border-width:2px");
	expect(test.rect().width).toBe(34);
	expect(pixel(test.image(), 4, 0)).toEqual([255, 0, 0, 255]);
	test.tree.setAttribute(test.id(), "style", "border-style:solid");
	expect(pixel(test.image(), 4, 0)).toEqual([255, 0, 0, 255]);
});

it.each(["none", "hidden", "0px dashed", "1px dashed transparent"])(
	"does not paint suppressed or transparent %s borders",
	(value) => {
		const test = fixture(`#target{width:30px;height:8px;border:${value}}`);
		expect(test.styles.metrics().issues).toEqual({});
		expect(rasterizeDocument(test.tree).metrics.borderPixels).toBe(0);
	},
);

it.each([false, true])(
	"overrides HTML image border hints with authored dashed CSS, inline=%s",
	(inline) => {
		const declaration = "border:2px dashed red";
		const test = fixture(
			inline ? "" : `img{${declaration}}`,
			`<img id="target" border="4" style="${inline ? declaration : ""}">`,
		);
		expect(test.styles.metrics().issues).toEqual({});
		for (const side of borderSides) {
			expect(test.styles.box(test.id())[`border-${side}-style`]).toBe("dashed");
			expect(test.styles.box(test.id())[`border-${side}-width`]).toBe("2px");
		}
	},
);

it("paints decoded replaced-image borders through the same dashed path", async () => {
	const test = fixture(
		"#target{display:block;border:1px dashed red}",
		'<img id="target" src="/synthetic.png">',
	);
	const images = documentImages(test.tree, {
		fetch: async (url) => {
			const body = encodePng(createRaster(18, 8, [0, 0, 255, 255]));
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
	expect(test.rect()).toMatchObject({ width: 20, height: 10 });
	const image = test.image();
	expect(pixel(image, 1, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 4, 0)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 4, 2)).toEqual([0, 0, 255, 255]);
});

it("keeps wrapped inline dash phase continuous across sliced fragments", () => {
	const test = fixture(
		"main{width:20px}span{border:1px dashed red;color:transparent}",
		'<main><span id="target">ab cd ef</span></main>',
	);
	const fragments = layoutDocumentText(test.tree).contexts.flatMap((context) =>
		context.fragments.filter(
			(fragment) => fragment.ref === test.tree.reference(test.id()),
		),
	);
	expect(fragments).toHaveLength(3);
	let consumed = 0;
	const image = test.image();
	for (const fragment of fragments) {
		expect(
			"borderHorizontalOffset" in fragment
				? fragment.borderHorizontalOffset
				: undefined,
		).toBe(consumed);
		const row = Math.max(0, Math.ceil(fragment.y - 0.5));
		for (let offset = 1; offset < fragment.width - 1; offset++) {
			const column = Math.ceil(fragment.x) + offset;
			expect(pixel(image, column, row)).toEqual(
				(consumed + offset + 0.5) % 6 < 3
					? [255, 0, 0, 255]
					: [255, 255, 255, 255],
			);
		}
		consumed += fragment.width;
	}
});

it("preserves unclipped dash phase during document raster clipping", () => {
	const test = fixture(
		"#target{width:40px;height:10px;border:1px dashed green}",
	);
	const whole = test.image();
	const cropped = rasterizeDocument(test.tree, {
		clip: { x: 4, y: 0, width: 20, height: 12 },
	}).image;
	for (let row = 0; row < cropped.height; row++)
		for (let column = 0; column < cropped.width; column++)
			expect(pixel(cropped, column, row)).toEqual(
				pixel(whole, column + 4, row),
			);
});

it("retains unsupported collapsed-table dashed borders as an explicit layout gate", () => {
	const test = fixture(
		"table{border-collapse:collapse}td{border:1px dashed green}",
		'<table id="target"><tr><td>cell</td></tr></table>',
	);
	expect(test.styles.metrics().issues).toEqual({});
	expect(() => layoutDocument(test.tree)).toThrow(
		/table-collapsed-borders-not-supported/,
	);
});

it("paints dashed caption and separate-table borders without anonymous-wrapper paint", () => {
	const test = fixture(
		"table{width:30px;border:1px dashed red;border-spacing:0}caption{height:8px;border-top:1px dashed green}td{height:8px;padding:0}",
		'<table id="target"><caption></caption><tr><td></td></tr></table>',
	);
	expect(test.styles.metrics().issues).toEqual({});
	const rectangles = documentGeometry(test.tree).getClientRects(test.id());
	expect(rectangles).toHaveLength(2);
	const image = test.image();
	expect(pixel(image, 1, 0)).toEqual([0, 128, 0, 255]);
	expect(pixel(image, 4, 0)).toEqual([255, 255, 255, 255]);
	expect(rasterizeDocument(test.tree).metrics.borderPixels).toBeGreaterThan(0);
});
