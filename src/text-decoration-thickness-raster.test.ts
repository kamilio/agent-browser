import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import {
	prepareDocumentRaster,
	rasterizeDocument,
	type DocumentRasterOptions,
} from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const content = '<main id="target">A A</main>';
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];

function withDocument<Result>(
	css: string,
	html: string,
	use: (tree: DocumentTree, queries: DocumentQueries) => Result,
): Result {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:16px;line-height:16px;color:black}#target{white-space:pre}</style><style id="rules">${css}</style>${html}`,
		"https://fixture.invalid/decoration-thickness",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	try {
		documentStyles(tree).setViewport(80, 80);
		const result = use(tree, queries);
		expect(documentStyles(tree).metrics().issues).toEqual({});
		return result;
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	}
}

function render(
	css: string,
	html = content,
	options: DocumentRasterOptions = {},
) {
	return withDocument(css, html, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing thickness fixture");
		const before = snapshotDocument(tree);
		const rectangle = documentGeometry(tree).getBoundingClientRect(target);
		const result = rasterizeDocument(tree, options);
		expect(snapshotDocument(tree)).toEqual(before);
		return { ...result, rectangle };
	});
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function expectBand(
	image: RasterImage,
	column: number,
	top: number,
	bottom: number,
	color = red,
) {
	for (let row = 0; row < image.height; row++)
		expect(pixel(image, column, row)).toEqual(
			row >= top && row < bottom ? color : white,
		);
}

function strike(thickness: string) {
	return `#target{text-decoration:line-through red;text-decoration-thickness:${thickness}}`;
}

function underline(thickness: string) {
	return `#target{text-decoration:underline red;text-decoration-thickness:${thickness}}`;
}

it.each([
	["1px", 1],
	["2.49px", 2],
	["2.5px", 3],
	[".1px", 1],
	["0", 1],
	["-3px", 1],
	["25%", 4],
	["calc(10% + 1px)", 3],
	["min(25%, 3px)", 3],
	["max(10%, 3px)", 3],
	["clamp(2px, 25%, 5px)", 4],
	["calc(1px - 25%)", 1],
	["thin", 1],
	["medium", 3],
	["thick", 5],
	[".25em", 4],
	[".25rem", 4],
	[".4ex", 4],
] as const)(
	"paints %s as exactly %ipx against a flat pixel oracle",
	(value, width) => {
		const plain = render("");
		const expected = Array.from(plain.image.pixels);
		for (let row = 9; row < 9 + width; row++)
			for (let column = 0; column < 36; column++)
				expected.splice((row * plain.image.width + column) * 4, 4, ...red);
		const actual = render(strike(value));
		expect(Array.from(actual.image.pixels)).toEqual(expected);
		expect(actual.rectangle).toEqual(plain.rectangle);
	},
);

it.each(["auto", "from-font"])(
	"keeps legacy fractional %s pixels instead of rounding the fallback",
	(value) => {
		const font = "#target{font-size:24px;line-height:24px}";
		const options = { clip: { x: 0, y: 0.75, width: 80, height: 40 } };
		const actual = render(`${font}${strike(value)}`, content, options);
		const legacy = render(
			`${font}#target{text-decoration:line-through red}`,
			content,
			options,
		);
		expect(actual.image.pixels).toEqual(legacy.image.pixels);
		expectBand(actual.image, 27, 13, 14);
		expectBand(
			render(`${font}${strike("2px")}`, content, options).image,
			27,
			13,
			15,
		);
	},
);

it("retains ancestor percentage thickness through nested fonts and container widths", () => {
	const html = '<main id="target"><span><span>A A</span></span></main>';
	const descendant = "span{font-size:32px;line-height:32px}";
	const actual = render(`${underline("25%")}${descendant}`, html);
	const flat = render(`${underline("4px")}${descendant}`, html);
	expect(actual.image.pixels).toEqual(flat.image.pixels);
	expect(actual.image.pixels).toEqual(
		render(`${underline("25%")}${descendant}#target{width:40px}`, html).image
			.pixels,
	);
	expectBand(actual.image, 36, 29, 33);
});

it("retains computed ancestor em thickness through a smaller descendant font", () => {
	const html = '<main id="target"><span>A A</span></main>';
	const font = "#target{font-size:32px;line-height:32px}span{font-size:16px}";
	const actual = render(`${font}${underline(".125em")}`, html);
	expect(actual.image.pixels).toEqual(
		render(`${font}${underline("4px")}`, html).image.pixels,
	);
	expectBand(actual.image, 18, 30, 34);
});

it("resolves explicitly inherited percentages at the new decorating font", () => {
	const html = '<main id="target"><span>A A</span></main>';
	const css =
		"#target{text-decoration-thickness:25%}span{font-size:32px;line-height:32px;text-decoration:underline red;";
	const actual = render(`${css}text-decoration-thickness:inherit}`, html);
	const flat = render(`${css}text-decoration-thickness:8px}`, html);
	expect(actual.image.pixels).toEqual(flat.image.pixels);
	expectBand(actual.image, 36, 30, 38);
});

it("copies an explicitly inherited computed em length without re-resolving it", () => {
	const html = '<main id="target"><span>A A</span></main>';
	const css =
		"#target{text-decoration-thickness:.25em}span{font-size:32px;line-height:32px;text-decoration:underline red;";
	const actual = render(`${css}text-decoration-thickness:inherit}`, html);
	const flat = render(`${css}text-decoration-thickness:4px}`, html);
	expect(actual.image.pixels).toEqual(flat.image.pixels);
	expectBand(actual.image, 36, 30, 34);
});

it("does not implicitly inherit a thickness for a descendant's new line", () => {
	const actual = render(
		"#target{text-decoration-thickness:5px}span{text-decoration:underline red}",
		'<main id="target"><span>A A</span></main>',
	);
	expectBand(actual.image, 18, 15, 16);
});

it("does not let descendant none or thickness replace the originating line", () => {
	const actual = render(
		`${underline("4px")}span{text-decoration:none;text-decoration-thickness:1px}`,
		'<main id="target"><span>A A</span></main>',
	);
	expect(actual.image.pixels).toEqual(render(underline("4px")).image.pixels);
	expectBand(actual.image, 18, 15, 19);
});

it("keeps independent thickness and color for ancestor and descendant lines", () => {
	const actual = render(
		`${underline("4px")}span{text-decoration:overline blue;text-decoration-thickness:2px}`,
		'<main id="target"><span>A A</span></main>',
	);
	for (let row = 0; row < actual.image.height; row++)
		expect(pixel(actual.image, 18, row)).toEqual(
			row < 2 ? blue : row >= 15 && row < 19 ? red : white,
		);
});

it("recomputes percentage thickness after a font mutation and rejects stale raster", () => {
	withDocument(underline("25%"), content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing thickness fixture");
		expectBand(rasterizeDocument(tree).image, 18, 15, 19);
		const prepared = prepareDocumentRaster(tree);
		tree.setAttribute(target, "style", "font-size:32px;line-height:32px");
		expect(() => prepared.rasterize()).toThrow("stale");
		const actual = rasterizeDocument(tree);
		const flat = render(
			`${underline("8px")}#target{font-size:32px;line-height:32px}`,
		);
		expect(actual.image.pixels).toEqual(flat.image.pixels);
		expectBand(actual.image, 36, 30, 38);
	});
});

it("repaints stylesheet thickness mutations without changing geometry", () => {
	withDocument(underline("4px"), content, (tree, queries) => {
		const rules = queries.querySelector("#rules");
		const target = queries.querySelector("#target");
		if (rules === null || target === null)
			throw new Error("Missing thickness fixture");
		const geometry = documentGeometry(tree);
		const rectangle = geometry.getBoundingClientRect(target);
		const prepared = prepareDocumentRaster(tree);
		tree.setTextContent(rules, underline("2px"));
		expect(() => prepared.rasterize()).toThrow("stale");
		expect(rasterizeDocument(tree).image.pixels).toEqual(
			render(underline("2px")).image.pixels,
		);
		expect(geometry.getBoundingClientRect(target)).toEqual(rectangle);
	});
});

it("repaints custom-property thickness mutations", () => {
	withDocument(underline("var(--Thickness, 1px)"), content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing thickness fixture");
		expectBand(rasterizeDocument(tree).image, 18, 15, 16);
		const prepared = prepareDocumentRaster(tree);
		tree.setAttribute(target, "style", "--Thickness:5px");
		expect(() => prepared.rasterize()).toThrow("stale");
		expect(rasterizeDocument(tree).image.pixels).toEqual(
			render(underline("5px")).image.pixels,
		);
	});
});

it("repaints an inline thickness override and restores the stylesheet on removal", () => {
	withDocument(underline("1px"), content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing thickness fixture");
		const before = rasterizeDocument(tree).image.pixels;
		tree.setAttribute(target, "style", "text-decoration-thickness:5px");
		expect(rasterizeDocument(tree).image.pixels).toEqual(
			render(underline("5px")).image.pixels,
		);
		tree.removeAttribute(target, "style");
		expect(rasterizeDocument(tree).image.pixels).toEqual(before);
	});
});

it("uses the explicit thickness for combined lines without moving their offsets", () => {
	const actual = render(
		"#target{text-decoration:underline overline line-through red;text-decoration-thickness:3px}",
	);
	for (let row = 0; row < actual.image.height; row++)
		expect(pixel(actual.image, 18, row)).toEqual(
			row < 3 || (row >= 9 && row < 12) || (row >= 15 && row < 18)
				? red
				: white,
		);
	expect(actual.rectangle).toEqual(render("").rectangle);
});

it.each([0, 0.5])(
	"clips thick decoration at a %spx fractional origin",
	(fraction) => {
		const actual = render(underline("4px"), content, {
			clip: { x: 13 + fraction, y: 14 + fraction, width: 8, height: 8 },
		});
		const top = fraction === 0 ? 1 : 0;
		for (let column = 0; column < actual.image.width; column++)
			expectBand(actual.image, column, top, top + 4);
	},
);

it("blends thick ancestor lines only once through nested inline boxes", () => {
	const css =
		"#target{text-decoration:underline rgba(255,0,0,.5);text-decoration-thickness:4px}";
	const actual = render(
		css,
		'<main id="target"><span><span>A A</span></span></main>',
	);
	expect(actual.image.pixels).toEqual(render(css).image.pixels);
	expectBand(actual.image, 18, 15, 19, [255, 127, 127, 255]);
});

it("uses ancestor thickness across descendant inline margins and padding", () => {
	const actual = render(
		`${underline("4px")}span{margin:0 3px;padding:0 4px}`,
		'<main id="target"><span>A A</span></main>',
	);
	for (const column of [1, 5, 44, 48]) expectBand(actual.image, column, 15, 19);
});

it.each(["normal", "italic"])(
	"preserves %s descender ink-skipping with thick lines",
	(style) => {
		const html = '<main id="target">g</main>';
		const font = `#target{font-style:${style}}`;
		const under = render(`${font}${underline("3px")}`, html);
		expect(pixel(under.image, 0, 17)).toEqual(white);
		expect(pixel(under.image, 11, 17)).toEqual(red);
		const through = render(`${font}${strike("3px")}`, html);
		for (let row = 9; row < 12; row++)
			for (let column = 0; column < 12; column++)
				expect(pixel(through.image, column, row)).toEqual(red);
	},
);

it("bounds huge valid thickness by the visible clip instead of traversing its length", () => {
	const options = { clip: { x: 13, y: 15, width: 8, height: 8 } };
	const actual = render(strike("16777216px"), content, options);
	const bounded = render(strike("32px"), content, options);
	expect(actual.image.pixels).toEqual(bounded.image.pixels);
	expect(actual.metrics.work).toBe(bounded.metrics.work);
	for (let column = 0; column < actual.image.width; column++)
		expectBand(actual.image, column, 0, 8);
});

it.each(["16777217px", "-16777217px"])(
	"rejects out-of-bounds %s before rounding or clamping it",
	(value) => {
		expect(() => render(strike(value))).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("charges extra painted thickness against the native raster work cap", () => {
	const thin = render(strike("1px"));
	const thick = render(strike("5px"));
	expect(thick.metrics.work).toBeGreaterThan(thin.metrics.work);
	expect(() =>
		render(strike("5px"), content, { maxWork: thin.metrics.work }),
	).toThrow("work limit");
});

it("leaves geometry, hit-testing and scroll bounds unchanged by thick overflow", () => {
	withDocument("", content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing thickness fixture");
		const geometry = documentGeometry(tree);
		const hits = documentHitTesting(tree);
		const scroll = documentScroll(tree);
		try {
			const rectangle = geometry.getBoundingClientRect(target);
			const bounds = scroll.bounds();
			const hit = hits.elementFromPoint(18, 40);
			tree.setAttribute(
				target,
				"style",
				"text-decoration:underline red;text-decoration-thickness:100px",
			);
			expectBand(rasterizeDocument(tree).image, 18, 15, 80);
			expect(geometry.getBoundingClientRect(target)).toEqual(rectangle);
			expect(scroll.bounds()).toEqual(bounds);
			expect(hits.elementFromPoint(18, 40)).toBe(hit);
		} finally {
			hits.close();
			scroll.close();
		}
	});
});

it("paints thick internal preserved tabs but skips leading whitespace", () => {
	const actual = render(underline("4px"), '<main id="target"> A\tA</main>');
	expectBand(actual.image, 40, 15, 19);
	expect(pixel(actual.image, 0, 15)).toEqual(white);
});

it("keeps ancestor thickness outside atomic inline descendants", () => {
	const html = '<main id="target"><span>A A</span></main>';
	const atomic = "span{display:inline-block}";
	expect(render(`${atomic}${underline("4px")}`, html).image.pixels).toEqual(
		render(atomic, html).image.pixels,
	);
});
