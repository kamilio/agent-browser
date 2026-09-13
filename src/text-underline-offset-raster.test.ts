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
		"https://fixture.invalid/underline-offset",
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
		if (target === null) throw new Error("Missing underline-offset fixture");
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

function underline(offset: string, thickness = "1px") {
	return `#target{text-decoration:underline red;text-decoration-thickness:${thickness};text-underline-offset:${offset}}`;
}

it.each([
	["auto", 15],
	["0", 14],
	["0px", 14],
	["0%", 14],
	["4px", 18],
	["-4px", 10],
	["25%", 18],
	["-25%", 10],
	[".49px", 14],
	[".5px", 14],
	[".51px", 15],
	["-.5px", 13],
	["calc(25% + 2px)", 20],
	["calc(2px - 25%)", 12],
	["min(25%, 3px)", 17],
	["max(-25%, -3px)", 11],
	["clamp(-5px, -25%, -2px)", 10],
	[".25em", 18],
	[".25rem", 18],
] as const)("paints %s at baseline-relative row %i", (value, row) => {
	const actual = render(underline(value));
	expectBand(actual.image, 18, row, row + 1);
	expect(actual.rectangle).toEqual(render("").rectangle);
});

it("paints baseline zero and outward thickness against a full pixel oracle", () => {
	const plain = render("");
	const expected = Array.from(plain.image.pixels);
	for (let row = 14; row < 17; row++)
		for (let column = 0; column < 36; column++)
			expected.splice((row * plain.image.width + column) * 4, 4, ...red);
	expect(Array.from(render(underline("0", "3px")).image.pixels)).toEqual(
		expected,
	);
});

it.each(["-4px", "0", "4px"])(
	"extends thickness downward from explicit %s rather than centering it",
	(value) => {
		const top = 14 + Number.parseFloat(value);
		expectBand(render(underline(value, "3px")).image, 18, top, top + 3);
	},
);

it("preserves fractional legacy auto placement and thickness", () => {
	const css =
		"#target{font-size:24px;line-height:24px;text-decoration:underline red}";
	const options = { clip: { x: 0, y: 0.75, width: 80, height: 40 } };
	const actual = render(
		`${css}#target{text-underline-offset:auto}`,
		content,
		options,
	);
	expect(actual.image.pixels).toEqual(
		render(css, content, options).image.pixels,
	);
	expectBand(actual.image, 27, 22, 23);
});

it.each([
	[".25em", "4px", 32],
	["25%", "8px", 36],
	["calc(.25em + 25%)", "12px", 40],
] as const)(
	"inherits %s using computed lengths and the decorating font for percentages",
	(value, fixed, top) => {
		const html = '<main id="target"><span>A A</span></main>';
		const css = `#target{text-underline-offset:${value}}span{font-size:32px;line-height:32px;text-decoration:underline red;text-decoration-thickness:1px}`;
		const actual = render(css, html);
		expect(actual.image.pixels).toEqual(
			render(`${css}span{text-underline-offset:${fixed}}`, html).image.pixels,
		);
		expectBand(actual.image, 36, top, top + 1);
	},
);

it("keeps the originating offset through descendant fonts and offset overrides", () => {
	const html = '<main id="target"><span><span>A A</span></span></main>';
	const descendants =
		"span{font-size:32px;line-height:32px;text-decoration:none;text-underline-offset:-40px}";
	const actual = render(`${underline("25%")}${descendants}`, html);
	expect(actual.image.pixels).toEqual(
		render(`${underline("4px")}${descendants}`, html).image.pixels,
	);
	expectBand(actual.image, 36, 32, 33);
});

it("keeps independent ancestor and descendant underline positions and colors", () => {
	const actual = render(
		`${underline("0")}span{text-decoration:underline blue;text-decoration-thickness:1px;text-underline-offset:4px}`,
		'<main id="target"><span>A A</span></main>',
	);
	for (let row = 0; row < actual.image.height; row++)
		expect(pixel(actual.image, 18, row)).toEqual(
			row === 14 ? red : row === 18 ? blue : white,
		);
});

it("leaves overline and strike positions unchanged alongside an offset underline", () => {
	const actual = render(
		"#target{text-decoration:underline overline line-through red;text-decoration-thickness:3px;text-underline-offset:4px}",
	);
	for (let row = 0; row < actual.image.height; row++)
		expect(pixel(actual.image, 18, row)).toEqual(
			row < 3 || (row >= 9 && row < 12) || (row >= 18 && row < 21)
				? red
				: white,
		);
});

it("applies the same originating offset on each preserved text line", () => {
	const actual = render(underline("4px"), "<main id=target>A A\nA A</main>");
	for (let row = 0; row < actual.image.height; row++)
		expect(pixel(actual.image, 18, row)).toEqual(
			row === 18 || row === 34 ? red : white,
		);
});

it("recomputes percentage offsets after font mutation and rejects stale rasters", () => {
	withDocument(underline("25%"), content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing underline-offset fixture");
		expectBand(rasterizeDocument(tree).image, 18, 18, 19);
		const prepared = prepareDocumentRaster(tree);
		tree.setAttribute(target, "style", "font-size:32px;line-height:32px");
		expect(() => prepared.rasterize()).toThrow("stale");
		const actual = rasterizeDocument(tree);
		expect(actual.image.pixels).toEqual(
			render(`${underline("8px")}#target{font-size:32px;line-height:32px}`)
				.image.pixels,
		);
		expectBand(actual.image, 36, 36, 37);
	});
});

it("repaints stylesheet and inline offset mutations and restores removed overrides", () => {
	withDocument(underline("0"), content, (tree, queries) => {
		const rules = queries.querySelector("#rules");
		const target = queries.querySelector("#target");
		if (rules === null || target === null)
			throw new Error("Missing underline-offset fixture");
		const prepared = prepareDocumentRaster(tree);
		tree.setTextContent(rules, underline("4px"));
		expect(() => prepared.rasterize()).toThrow("stale");
		const before = rasterizeDocument(tree).image.pixels;
		expect(before).toEqual(render(underline("4px")).image.pixels);
		tree.setAttribute(target, "style", "text-underline-offset:-4px");
		expect(rasterizeDocument(tree).image.pixels).toEqual(
			render(underline("-4px")).image.pixels,
		);
		tree.removeAttribute(target, "style");
		expect(rasterizeDocument(tree).image.pixels).toEqual(before);
	});
});

it("repaints custom-property offset mutations", () => {
	withDocument(underline("var(--Offset, 0px)"), content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing underline-offset fixture");
		expectBand(rasterizeDocument(tree).image, 18, 14, 15);
		const prepared = prepareDocumentRaster(tree);
		tree.setAttribute(target, "style", "--Offset:-4px");
		expect(() => prepared.rasterize()).toThrow("stale");
		expect(rasterizeDocument(tree).image.pixels).toEqual(
			render(underline("-4px")).image.pixels,
		);
	});
});

it.each([0, 0.5])(
	"clips and blends offset ancestor lines once at a %spx fractional origin",
	(fraction) => {
		const css =
			"#target{text-decoration:underline rgba(255,0,0,.5);text-decoration-thickness:3px;text-underline-offset:4px}";
		const options = {
			clip: { x: 13 + fraction, y: 17 + fraction, width: 8, height: 8 },
		};
		const actual = render(
			css,
			'<main id="target"><span><span>A A</span></span></main>',
			options,
		);
		expect(actual.image.pixels).toEqual(
			render(css, content, options).image.pixels,
		);
		const top = fraction === 0 ? 1 : 0;
		for (let column = 0; column < actual.image.width; column++)
			expectBand(actual.image, column, top, top + 3, [255, 127, 127, 255]);
	},
);

it("uses the ancestor offset across descendant inline margins and padding", () => {
	const actual = render(
		`${underline("4px")}span{margin:0 3px;padding:0 4px;text-underline-offset:-4px}`,
		'<main id="target"><span>A A</span></main>',
	);
	for (const column of [1, 5, 44, 48]) expectBand(actual.image, column, 18, 19);
});

it.each(["normal", "italic"])(
	"preserves %s descender ink-skipping at baseline zero",
	(style) => {
		const actual = render(
			`${underline("0")}#target{font-style:${style}}`,
			'<main id="target">g</main>',
		);
		expect(pixel(actual.image, 1, 14)).toEqual(white);
		expect(pixel(actual.image, 11, 14)).toEqual(red);
	},
);

it.each(["16777216px", "-16777216px"])(
	"bounds offscreen offset %s work independently of its distance",
	(value) => {
		const actual = render(underline(value));
		const bounded = render(
			underline(value.startsWith("-") ? "-100px" : "100px"),
		);
		expect(actual.image.pixels).toEqual(render("").image.pixels);
		expect(actual.image.pixels).toEqual(bounded.image.pixels);
		expect(actual.metrics.work).toBe(bounded.metrics.work);
	},
);

it.each(["16777217px", "-16777217px", "200000000%"])(
	"rejects out-of-bounds underline offset %s",
	(value) => {
		expect(() => render(underline(value))).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each(["none", "overline", "line-through", "overline line-through"])(
	"does not resolve irrelevant extreme offsets for %s",
	(lines) => {
		const css = `#target{text-decoration:${lines} red}`;
		for (const value of ["16777217px", "-16777217px", "200000000%"])
			expect(
				render(`${css}#target{text-underline-offset:${value}}`).image.pixels,
			).toEqual(render(css).image.pixels);
	},
);

it("charges offset underline pixels against the raster work cap", () => {
	const offscreen = render(underline("100px"));
	const visible = render(underline("4px"));
	expect(visible.metrics.work).toBeGreaterThan(offscreen.metrics.work);
	expect(() =>
		render(underline("4px"), content, { maxWork: offscreen.metrics.work }),
	).toThrow("work limit");
});

it("does not let offset overflow alter geometry, hit-testing or scroll bounds", () => {
	withDocument("", content, (tree, queries) => {
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing underline-offset fixture");
		const geometry = documentGeometry(tree);
		const hits = documentHitTesting(tree);
		const scroll = documentScroll(tree);
		try {
			const rectangle = geometry.getBoundingClientRect(target);
			const bounds = scroll.bounds();
			const hit = hits.elementFromPoint(18, 54);
			tree.setAttribute(
				target,
				"style",
				"text-decoration:underline red;text-decoration-thickness:1px;text-underline-offset:40px",
			);
			expectBand(rasterizeDocument(tree).image, 18, 54, 55);
			expect(geometry.getBoundingClientRect(target)).toEqual(rectangle);
			expect(scroll.bounds()).toEqual(bounds);
			expect(hits.elementFromPoint(18, 54)).toBe(hit);
		} finally {
			hits.close();
			scroll.close();
		}
	});
});

it("offsets preserved internal tabs without decorating leading whitespace", () => {
	const actual = render(underline("4px"), '<main id="target"> A\tA</main>');
	expectBand(actual.image, 40, 18, 19);
	expect(pixel(actual.image, 0, 18)).toEqual(white);
});

it("keeps ancestor offset lines outside atomic inline descendants", () => {
	const html = '<main id="target"><span>A A</span></main>';
	const atomic = "span{display:inline-block}";
	expect(render(`${atomic}${underline("4px")}`, html).image.pixels).toEqual(
		render(atomic, html).image.pixels,
	);
});
