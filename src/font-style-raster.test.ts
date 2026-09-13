import { expect, it } from "vitest";
import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import {
	rasterizeDocument,
	type DocumentRasterOptions,
} from "./document-raster.js";
import {
	bitmapGlyphInk,
	fontStyleSlope,
	parseFontStyle,
	type NativeFontStyle,
} from "./font-style.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { createRaster, paintBitmapGlyph, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function alpha(image: RasterImage, column: number, row: number) {
	return image.pixels[(row * image.width + column) * 4 + 3];
}

it.each(["normal", "italic", "oblique"] as const)(
	"parses bounded %s keywords",
	(style) => {
		expect(parseFontStyle(` \t${style.toUpperCase()} `)).toBe(style);
		expect(parseFontStyle(style + " ".repeat(4096))).toBeUndefined();
	},
);

it.each([
	"",
	"oblique 14deg",
	"oblique -14deg",
	"italic normal",
	"auto",
	"inherit",
	"var(--style)",
])("rejects non-keyword style %s in the primitive", (value) => {
	expect(parseFontStyle(value)).toBeUndefined();
	expect(() => fontStyleSlope(value as NativeFontStyle)).toThrow(
		"Invalid native font style",
	);
});

it("keeps normal font ink identical and validates invalid styles even without ink", () => {
	expect(bitmapGlyphInk("A")).toEqual(bitmapGlyph("A").ink);
	expect(bitmapGlyphInk(" ", 700, "italic")).toEqual(bitmapGlyph(" ", 700).ink);
	for (const character of ["A", " "])
		expect(() =>
			paintBitmapGlyph(
				createRaster(2, 2),
				character,
				0,
				0,
				16,
				[0, 0, 0, 0],
				400,
				"bad" as NativeFontStyle,
			),
		).toThrow("Invalid native font style");
});

for (const style of ["italic", "oblique"] as const)
	for (const weight of [400, 700] as const)
		for (const size of [1, 7.5, 8, 16, 27.25])
			it(`paints inverse-affine ${style} ${weight} at ${size}px with clipped fractional origins`, () => {
				const scale = size / 8;
				const slope = Math.tan((14 * Math.PI) / 180);
				for (const [originX, originY] of [
					[1, 2],
					[-3.75, -1.25],
					[17.5, 18.5],
				]) {
					const image = createRaster(32, 32);
					expect(
						paintBitmapGlyph(
							image,
							"p",
							originX,
							originY,
							size,
							[40, 60, 80, 128],
							weight,
							style,
						),
					).toBe(true);
					const glyph = bitmapGlyph("p", weight);
					const ink = bitmapGlyphInk("p", weight, style);
					for (let row = 0; row < image.height; row++)
						for (let column = 0; column < image.width; column++) {
							const relativeY = row + 0.5 - originY;
							const sourceY = Math.floor(relativeY / scale);
							const sourceX = Math.floor(
								(column + 0.5 - originX - slope * (7 * scale - relativeY)) /
									scale,
							);
							const painted =
								sourceY >= 0 &&
								sourceY < 8 &&
								sourceX >= 0 &&
								sourceX < 5 &&
								(glyph.rows[sourceY] & (1 << (4 - sourceX))) !== 0;
							expect(alpha(image, column, row)).toBe(painted ? 128 : 0);
							if (painted) {
								expect(column + 0.5).toBeGreaterThanOrEqual(
									originX + ink.x * scale,
								);
								expect(column + 0.5).toBeLessThan(
									originX + (ink.x + ink.width) * scale,
								);
							}
						}
				}
			});

it("preserves the upright bitmap and paints synthetic overhang without changing its advance", () => {
	const normal = createRaster(16, 16);
	const explicit = createRaster(16, 16);
	const italic = createRaster(16, 16);
	paintBitmapGlyph(normal, "F", 0, 0);
	paintBitmapGlyph(explicit, "F", 0, 0, 16, [0, 0, 0, 255], 400, "normal");
	paintBitmapGlyph(italic, "F", 0, 0, 16, [0, 0, 0, 255], 400, "italic");
	expect(explicit).toEqual(normal);
	expect(alpha(normal, 12, 0)).toBe(0);
	expect(alpha(italic, 12, 0)).toBe(255);
	expect(bitmapFont.advance).toBe(6);
});

function render(
	css: string,
	html = '<main id="target">Fp</main>',
	options: DocumentRasterOptions = {},
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:16px;line-height:16px;color:black}${css}</style>${html}`,
		"https://fixture.invalid/font-style",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		const styles = documentStyles(tree);
		styles.setViewport(64, 48);
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing font-style fixture");
		const before = snapshotDocument(tree);
		const rectangle = geometry.getBoundingClientRect(target);
		const hit = hits.elementFromPoint(1, 1) === target;
		const layout = layoutDocument(tree);
		const glyphs = layout.contexts.flatMap((context) =>
			context.glyphs.map((glyph) => [
				glyph.character,
				glyph.x,
				glyph.y,
				glyph.advance,
			]),
		);
		const result = rasterizeDocument(tree, options);
		expect(styles.metrics().issues).toEqual({});
		expect(snapshotDocument(tree)).toEqual(before);
		return { ...result, rectangle, hit, glyphs };
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
}

it.each(["normal", "italic", "oblique"] as const)(
	"renders author %s without moving layout or hits",
	(style) => {
		const reference = render("");
		const result = render(`#target{font-style:${style}}`);
		expect(result.rectangle).toEqual(reference.rectangle);
		expect(result.glyphs).toEqual(reference.glyphs);
		expect(result.hit).toBe(reference.hit);
		if (style === "normal") expect(result.image).toEqual(reference.image);
		else expect(result.image).not.toEqual(reference.image);
	},
);

it.each(["italic", "oblique"])(
	"retains %s overhang when the upright ink would be clipped",
	(style) => {
		const css = `#target{font-style:${style}}`;
		const full = render(css, '<main id="target">F</main>');
		const cropped = render(css, '<main id="target">F</main>', {
			clip: { x: 10, y: 0, width: 4, height: 16 },
		});
		const expected: number[] = [];
		for (let row = 0; row < 16; row++)
			expected.push(
				...full.image.pixels.slice((row * 64 + 10) * 4, (row * 64 + 14) * 4),
			);
		expect(Array.from(cropped.image.pixels)).toEqual(expected);
		expect(cropped.metrics.paintedGlyphs).toBe(1);
	},
);

it("inherits synthetic style through inline boxes and honors a normal descendant", () => {
	expect(
		render(
			"#target{font-style:italic}",
			'<main id="target"><span>Fp</span></main>',
		).image,
	).toEqual(render("#target{font-style:italic}").image);
	expect(
		render(
			"#target{font-style:italic}span{font-style:normal}",
			'<main id="target"><span>Fp</span></main>',
		).image,
	).toEqual(render("").image);
});

it("uses the descendant slant for overline ink skipping", () => {
	const result = render(
		"#target{text-decoration:overline red;font-style:italic}",
		'<main id="target">F</main>',
	);
	const pixel = (column: number) =>
		Array.from(result.image.pixels.slice(column * 4, column * 4 + 4));
	expect(pixel(0)).toEqual([255, 0, 0, 255]);
	expect(pixel(2)).toEqual([255, 255, 255, 255]);
	expect(pixel(3)).toEqual([0, 0, 0, 255]);
});

it("keeps line-through continuous across synthetic glyph ink", () => {
	const result = render(
		"#target{text-decoration:line-through red;font-style:italic}",
	);
	for (let column = 0; column < 24; column++)
		expect(
			Array.from(
				result.image.pixels.slice(
					(9 * 64 + column) * 4,
					(9 * 64 + column) * 4 + 4,
				),
			),
		).toEqual([255, 0, 0, 255]);
});

it("charges bounded synthetic raster work and rejects insufficient work", () => {
	const result = render("#target{font-style:italic}");
	expect(result.metrics.work).toBeGreaterThan(0);
	expect(() =>
		render("#target{font-style:italic}", '<main id="target">Fp</main>', {
			maxWork: 1,
		}),
	).toThrow();
});
