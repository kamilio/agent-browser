import { expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeImage } from "./image-decoder.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene } from "./svg-scene.js";

const noCharge = () => {};
const encoder = new TextEncoder();
const rectangle = '<rect width="4" height="2" fill="red"/>';
const gradient =
	'<defs><linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="4" y2="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>';

it.each([
	["url(#Missing)", [0, 0, 0, 0]],
	["url(#Missing) none", [0, 0, 0, 0]],
	["url(#Missing) blue", [0, 0, 255, 255]],
	["url(#Missing) currentColor", [0, 128, 0, 255]],
])(
	"uses the specified fallback or no paint for missing local server %s",
	(fill, expected) => {
		const image = decode(rectangle, `rect{color:green;fill:${fill}}`).image;
		expect(pixel(image, 0)).toEqual(expected);
	},
);

it("uses fallback for a local reference that is not a paint server", () => {
	const image = decode(
		'<g id="NotPaint"/>' + rectangle,
		"rect{fill:url(#NotPaint) blue}",
	).image;
	expect(pixel(image, 0)).toEqual([0, 0, 255, 255]);
});

it("does not replace a valid but unsupported paint-server type with its fallback", () => {
	expect(() =>
		decode(
			'<defs><radialGradient id="Radial"/></defs>' + rectangle,
			"rect{fill:url(#Radial) blue}",
		),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it("keeps case-sensitive local paint references across author CSS and inline styles", () => {
	const definition = gradient.replace('id="paint"', 'id="PaintServer"');
	const image = decode(
		definition +
			'<rect width="4" height="2" style="fill:URL(#PaintServer) red"/>',
		"",
	).image;
	expect(pixel(image, 0)).toEqual([223, 0, 32, 255]);
});

it("allows a supported author fill to replace an unsupported presentation value", () => {
	const image = decode(
		'<rect width="4" height="2" fill="url(external)"/>',
		"rect{fill:blue}",
	).image;
	expect(pixel(image, 0)).toEqual([0, 0, 255, 255]);
});

it("defers unsupported presentation paint until a displayed shape is actually painted", () => {
	const image = decode(
		'<g class="hidden" fill="url(external)" fill-opacity="bogus"><use href="https://fixture.invalid/forbidden"/></g>' +
			rectangle,
		".hidden{display:none}",
	).image;
	expect(pixel(image, 0)).toEqual([255, 0, 0, 255]);
	expect(() =>
		decode('<rect width="4" height="2" fill-opacity="bogus"/>', ""),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it("does not reinterpret an animation fill mode as an SVG paint property", () => {
	const image = decode(
		'<animate fill="freeze" style="display:none"/>' + rectangle,
		"",
	).image;
	expect(pixel(image, 0)).toEqual([255, 0, 0, 255]);
});

function decode(content: string, css: string, width = 4, height = 2) {
	return decodeImage(
		encoder.encode(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style><![CDATA[${css}]]></style>${content}</svg>`,
		),
		"image/svg+xml",
	);
}

function pixel(image: RasterImage, column: number, row = 0) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function withScene(
	content: string,
	css: string,
	inspect: (scene: ReturnType<typeof documentSvgScene>) => void,
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style><svg width="4" height="2" viewBox="0 0 4 2">${content}</svg>`,
		"https://fixture.invalid/svg-css-rendering",
	);
	try {
		const queries = new DocumentQueries(tree);
		let root: number | null;
		try {
			root = queries.querySelector("svg");
		} finally {
			queries.close();
		}
		if (root === null) throw new Error("Missing SVG CSS rendering fixture");
		inspect(documentSvgScene(tree, root, noCharge));
	} finally {
		tree.close();
	}
}

it("renders CSS solid fill instead of a conflicting presentation attribute", () => {
	const result = decode(rectangle, "rect{fill:blue}");
	expect(result.mediaType).toBe("image/svg+xml");
	expect(Array.from(result.image.pixels)).toEqual(
		Array.from({ length: 8 }, () => [0, 0, 255, 255]).flat(),
	);
});

it("renders CSS fill none as transparent without deleting shape geometry", () => {
	withScene(rectangle, "rect{fill:none}", (scene) => {
		expect(scene.shapes).toHaveLength(1);
		expect(scene.shapes[0].fill).toBeNull();
		expect(scene.shapes[0].path.length).toBeGreaterThan(0);
		expect(rasterizeSvgScene(scene, 4, 2, noCharge).pixels).toEqual(
			new Uint8Array(32),
		);
	});
	expect(decode(rectangle, "rect{fill:none}").image.pixels).toEqual(
		new Uint8Array(32),
	);
});

it.each([
	[".25", 64],
	["25%", 64],
	["-0.5", 0],
	["150%", 255],
	["2", 255],
	["-50%", 0],
] as const)("renders clamped CSS fill-opacity %s", (opacity, alpha) => {
	const image = decode(rectangle, `rect{fill-opacity:${opacity}}`).image;
	expect(pixel(image, 0)).toEqual(
		alpha === 0 ? [0, 0, 0, 0] : [255, 0, 0, alpha],
	);
	expect(pixel(image, 3, 1)).toEqual(pixel(image, 0));
});

it("multiplies CSS color alpha by fill-opacity exactly once", () => {
	const image = decode(
		rectangle,
		"rect{fill:rgba(255,0,0,.5);fill-opacity:50%}",
	).image;
	expect(pixel(image, 0)).toEqual([255, 0, 0, 64]);
	expect(pixel(image, 3, 1)).toEqual([255, 0, 0, 64]);
});

it("inherits fill-opacity through nested groups without group compositing", () => {
	const image = decode(
		`<g id="outer"><g><g>${rectangle}</g></g></g>`,
		"#outer{fill-opacity:25%}",
	).image;
	expect(pixel(image, 0)).toEqual([255, 0, 0, 64]);
});

it.each([
	["nonzero", [0, 0, 255, 255]],
	["evenodd", [0, 0, 0, 0]],
] as const)(
	"uses CSS %s winding for a same-direction inner contour",
	(rule, center) => {
		const image = decode(
			'<path d="M0 0H6V6H0Z M2 2H4V4H2Z" fill-rule="nonzero"/>',
			`path{fill:blue;fill-rule:${rule}}`,
			6,
			6,
		).image;
		expect(pixel(image, 0)).toEqual([0, 0, 255, 255]);
		expect(pixel(image, 3, 3)).toEqual(center);
	},
);

it("preserves real local linear-gradient paint selected through an author rule", () => {
	withScene(
		gradient + rectangle,
		"rect{fill:url(#paint);fill-opacity:.5}",
		(scene) => {
			expect(scene.shapes[0].fill).toBeInstanceOf(SvgLinearGradient);
			const image = rasterizeSvgScene(scene, 4, 2, noCharge);
			expect(pixel(image, 0)).toEqual([223, 0, 32, 128]);
			expect(pixel(image, 3, 1)).toEqual([32, 0, 223, 128]);
		},
	);
});

it("decodes stylesheet-selected gradients instead of replacing them with solids", () => {
	const image = decode(gradient + rectangle, "rect{fill:url(#paint)}").image;
	expect(pixel(image, 0)).toEqual([223, 0, 32, 255]);
	expect(pixel(image, 3, 1)).toEqual([32, 0, 223, 255]);
});

it("resolves inherited CSS currentColor independently for each rendered shape", () => {
	const image = decode(
		'<g><rect id="left" width="2" height="2"/><rect id="right" x="2" width="2" height="2"/></g>',
		"g{color:red;fill:currentColor}#left{color:blue}#right{color:green}",
	).image;
	expect(pixel(image, 0)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 3, 1)).toEqual([0, 128, 0, 255]);
});

it.each([
	'<rect width="4" height="2" stroke="blue" stroke-dasharray="1 1" style="fill:red"/>',
	'<rect width="4" height="2" style="fill:red;stroke:blue;stroke-dasharray:1 1"/>',
	'<rect width="4" height="2" clip-path="url(#clip)" style="fill:red"/>',
	'<rect width="4" height="2" style="fill:red;clip-path:url(#clip)"/>',
	'<rect width="4" height="2" style="fill:url(https://example.invalid/external.svg#paint)"/>',
	'<rect width="4" height="2" style="fill:context-fill"/>',
	'<rect width="4" height="2" style="fill:context-stroke"/>',
])("does not silently strip unsupported paint from %s", (content) => {
	expect(() => decode(content, "")).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
