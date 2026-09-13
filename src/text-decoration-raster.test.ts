import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import {
	prepareDocumentRaster,
	rasterizeDocument,
	type DocumentRasterOptions,
} from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function render(
	css: string,
	html = '<main id="target">AA</main>',
	options: DocumentRasterOptions = {},
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:16px;line-height:16px;color:black}${css}</style>${html}`,
		"https://fixture.invalid/decorations",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	try {
		const styles = documentStyles(tree);
		styles.setViewport(80, 80);
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing target");
		const before = snapshotDocument(tree);
		const rectangle = geometry.getBoundingClientRect(target);
		const result = rasterizeDocument(tree, options);
		expect(styles.metrics().issues).toEqual({});
		expect(snapshotDocument(tree)).toEqual(before);
		return { ...result, rectangle };
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	}
}

function pixel(image: RasterImage, column: number, row: number) {
	return Array.from(
		image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	);
}

const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];
const black = [0, 0, 0, 255];

it.each([
	["underline", 15],
	["overline", 0],
	["line-through", 9],
] as const)(
	"paints actual native %s at the documented font position",
	(line, row) => {
		const result = render(`#target{text-decoration:${line} red}`);
		expect(pixel(result.image, 0, row)).toEqual(red);
		expect(result.rectangle).toEqual(render("").rectangle);
	},
);

it("paints all requested lines without adding scroll or geometry extents", () => {
	const result = render(
		"#target{text-decoration:underline overline line-through red}",
	);
	for (const row of [0, 9, 15])
		expect(pixel(result.image, 0, row)).toEqual(red);
	expect(result.rectangle).toEqual(render("").rectangle);
});

it.each(["none", "initial", "unset", "revert"])(
	"does not let descendant %s cancel an ancestor decoration",
	(value) => {
		const result = render(
			`#target{text-decoration:underline red}span{text-decoration:${value};color:blue}`,
			'<main id="target"><span>AA</span></main>',
		);
		expect(pixel(result.image, 0, 15)).toEqual(red);
		expect(pixel(result.image, 0, 2)).toEqual(blue);
	},
);

it("retains a parent's currentcolor when descendant text changes color", () => {
	const result = render(
		"#target{color:red;text-decoration:underline}span{color:blue}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(red);
	expect(pixel(result.image, 0, 2)).toEqual(blue);
});

it("keeps inherited decoration visible with transparent descendant text", () => {
	const result = render(
		"#target{text-decoration:underline red}span{color:transparent}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(red);
	expect(pixel(result.image, 0, 2)).toEqual(white);
});

it("does not double blend one originating decoration through nested inline boxes", () => {
	const result = render(
		"#target{text-decoration:underline rgba(255,0,0,.5)}",
		'<main id="target"><span><span>AA</span></span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual([255, 127, 127, 255]);
});

it("keeps ancestor and descendant lines with their own colors", () => {
	const result = render(
		"#target{text-decoration:underline red}span{text-decoration:overline blue}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(red);
	expect(pixel(result.image, 0, 0)).toEqual(blue);
});

it.each(["inline-block", "inline-flex"])(
	"does not propagate decoration into an atomic %s",
	(display) => {
		const result = render(
			`#target{text-decoration:underline red}span{display:${display}}`,
			'<main id="target"><span>AA</span></main>',
		);
		expect(
			Array.from(result.image.pixels).some(
				(_, index, pixels) =>
					index % 4 === 0 &&
					pixels[index] === 255 &&
					pixels[index + 1] === 0 &&
					pixels[index + 2] === 0,
			),
		).toBe(false);
	},
);

it("lets an atomic inline establish its own decoration", () => {
	const result = render(
		"span{display:inline-block;text-decoration:underline red}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(red);
});

it.each([
	"float:left",
	"position:absolute;left:0;top:0",
	"position:fixed;left:0;top:0",
])("does not propagate an ancestor line into %s", (position) => {
	const result = render(
		`#target{text-decoration:underline red}span{${position}}`,
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(white);
});

it("propagates into ordinary in-flow block descendants", () => {
	const result = render(
		"#target{text-decoration:underline red}",
		'<main id="target"><div>AA</div><div>AA</div></main>',
	);
	expect(pixel(result.image, 0, 15)).toEqual(red);
	expect(pixel(result.image, 0, 31)).toEqual(red);
});

it("moves applied decoration together with a relatively positioned descendant", () => {
	const result = render(
		"#target{text-decoration:underline red}span{position:relative;left:5px;top:7px}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 5, 22)).toEqual(red);
	expect(pixel(result.image, 0, 15)).toEqual(white);
});

it("uses decorating font metrics rather than the larger descendant font", () => {
	const result = render(
		"#target{text-decoration:underline red}span{font-size:32px;line-height:32px}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 29)).toEqual(red);
	expect(pixel(result.image, 0, 30)).toEqual(white);
});

it("uses one parent line thickness with a smaller descendant font", () => {
	const result = render(
		"#target{font-size:32px;line-height:32px;text-decoration:underline red}span{font-size:16px}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(result.image, 0, 30)).toEqual(red);
	expect(pixel(result.image, 0, 31)).toEqual(red);
});

it("follows descendant visibility without treating none as a cancellation", () => {
	const hidden = render(
		"#target{text-decoration:underline red}span{visibility:hidden}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(hidden.image, 0, 15)).toEqual(white);
	const visible = render(
		"#target{text-decoration:underline red;visibility:hidden}span{visibility:visible}",
		'<main id="target"><span>AA</span></main>',
	);
	expect(pixel(visible.image, 0, 15)).toEqual(red);
});

it("decorates internal preserved spaces but skips line-leading and trailing spaces", () => {
	const result = render(
		"#target{white-space:pre;text-decoration:underline red}",
		'<main id="target"> A A </main>',
	);
	for (let column = 0; column < 60; column++)
		expect(pixel(result.image, column, 15)).toEqual(
			column >= 12 && column < 48 ? red : white,
		);
});

it("decorates separate wrapped lines without filling the unused line width", () => {
	const result = render(
		"#target{width:24px;text-decoration:underline red}",
		'<main id="target">AA AA</main>',
	);
	for (const row of [15, 31]) {
		expect(pixel(result.image, 0, row)).toEqual(red);
		expect(pixel(result.image, 23, row)).toEqual(red);
		expect(pixel(result.image, 24, row)).toEqual(white);
	}
});

it("includes descendant inline margins, borders and padding", () => {
	const result = render(
		"#target{text-decoration:underline red}span{margin-left:3px;margin-right:2px;padding:0 4px;border:2px solid black}",
		'<main id="target"><span>AA</span></main>',
	);
	for (let column = 0; column < 41; column++)
		expect(pixel(result.image, column, 15)).toEqual(red);
});

it("excludes the decorating inline's own margins, borders and padding", () => {
	const result = render(
		"span{text-decoration:underline red;margin-left:3px;margin-right:2px;padding:0 4px;border:2px solid black}",
		'<main id="target"><span>AA</span></main>',
	);
	for (let column = 9; column < 33; column++)
		expect(pixel(result.image, column, 15)).toEqual(red);
	expect(pixel(result.image, 1, 15)).toEqual(white);
	expect(pixel(result.image, 3, 15)).toEqual(black);
});

it("interrupts underline at native descender ink but keeps strike-through continuous", () => {
	const under = render(
		"#target{text-decoration:underline red}",
		'<main id="target">g</main>',
	);
	expect(pixel(under.image, 0, 15)).toEqual(red);
	expect(pixel(under.image, 1, 15)).toEqual(white);
	expect(pixel(under.image, 2, 15)).toEqual(black);
	const strike = render(
		"#target{text-decoration:line-through red}",
		'<main id="target">g</main>',
	);
	for (let column = 0; column < 12; column++)
		expect(pixel(strike.image, column, 9)).toEqual(red);
});

it("clips decoration using the same viewport pixel coordinates as glyphs", () => {
	const result = render("#target{text-decoration:underline red}", undefined, {
		clip: { x: 5, y: 15, width: 12, height: 1 },
	});
	for (let column = 0; column < 12; column++)
		expect(pixel(result.image, column, 0)).toEqual(red);
});

it("charges decoration raster work without changing the undecorated budget", () => {
	const plain = render("");
	expect(() =>
		render("#target{text-decoration:underline red}", undefined, {
			maxWork: plain.metrics.work,
		}),
	).toThrow("work limit");
});

it("invalidates prepared raster when decoration styles change and releases owners", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><main id="target">AA</main>',
		"https://fixture.invalid/decorate-mutation",
	);
	const queries = new DocumentQueries(tree);
	try {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing target");
		const prepared = prepareDocumentRaster(tree);
		tree.setAttribute(target, "style", "text-decoration:underline red");
		expect(() => prepared.rasterize()).toThrow("stale");
		expect(() => rasterizeDocument(tree)).not.toThrow();
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});
