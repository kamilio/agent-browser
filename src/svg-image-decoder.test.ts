import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { decodeImage, imageMediaTypes } from "./image-decoder.js";
import type { PngDecodeOptions } from "./png-decoder.js";
import { decodeSvgImage, svgImageDecodeLimits } from "./svg-image-decoder.js";

afterEach(() => vi.restoreAllMocks());
const encoder = new TextEncoder();
const namespace = 'xmlns="http://www.w3.org/2000/svg"';
const rectangle = '<rect width="4" height="2" fill="red"/>';

function source(
	content = rectangle,
	attributes = 'width="4" height="2" viewBox="0 0 4 2"',
) {
	return encoder.encode(`<svg ${namespace} ${attributes}>${content}</svg>`);
}

it("decodes and dispatches a genuine standalone XML SVG image", () => {
	const result = decodeImage(source(), "image/svg+xml");
	expect(imageMediaTypes).toContain("image/svg+xml");
	expect(result.mediaType).toBe("image/svg+xml");
	expect([result.image.width, result.image.height]).toEqual([4, 2]);
	expect(Array.from(result.image.pixels)).toEqual(
		Array.from({ length: 8 }, () => [255, 0, 0, 255]).flat(),
	);
	expect(result.work).toBeGreaterThan(0);
	expect(Object.isFrozen(result)).toBe(true);
});

it("preserves XML declaration and external-doctype metadata without loading a DTD", () => {
	const bytes = encoder.encode(
		`<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://example.invalid/svg11.dtd"><svg ${namespace} width="4" height="2">${rectangle}</svg>`,
	);
	const result = decodeSvgImage(bytes);
	expect(result.doctype).toEqual({
		name: "svg",
		publicId: "-//W3C//DTD SVG 1.1//EN",
		systemId: "https://example.invalid/svg11.dtd",
	});
	expect(result.ignoredMetadata).toEqual(["external-doctype-not-loaded"]);
	expect(result.image.pixels[0]).toBe(255);
});

it("decodes path geometry with real linear-gradient pixels and inline stop CSS", () => {
	const result = decodeSvgImage(
		source(
			'<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="4" y2="0"><stop style="stop-color:red"/><stop offset="1" style="stop-color:blue"/></linearGradient><path d="M0 0H4V2H0Z" fill="url(#paint)"/>',
		),
	);
	expect(result.shapes).toBe(1);
	expect(Array.from(result.image.pixels.slice(0, 4))).toEqual([
		223, 0, 32, 255,
	]);
	expect(Array.from(result.image.pixels.slice(12, 16))).toEqual([
		32, 0, 223, 255,
	]);
});

it("uses root CSS sizing properties rather than always trusting width attributes", () => {
	const result = decodeSvgImage(
		source("<style><![CDATA[svg{width:8px;height:4px}]]></style>" + rectangle),
	);
	expect([result.image.width, result.image.height]).toEqual([8, 4]);
	expect(Array.from(result.image.pixels.slice(-4))).toEqual([255, 0, 0, 255]);
});

it("retains transparent output when a zero viewBox disables rendering", () => {
	const result = decodeSvgImage(
		source(rectangle, 'width="4" height="2" viewBox="0 0 0 2"'),
	);
	expect(result.image.pixels).toEqual(new Uint8Array(32));
});

it.each([
	'viewBox="0 0 4 2"',
	'width="100%" height="2"',
	'width="4"',
	'width="0" height="2"',
	'width="3.5" height="2"',
])("does not fabricate intrinsic dimensions for %s", (attributes) => {
	expect(() => decodeSvgImage(source(rectangle, attributes))).toThrow(
		/requires (absolute|positive integer)/,
	);
});

it.each([
	`<svg ${namespace} width="4" height="2"><rect></svg>`,
	`<svg ${namespace} width="4" height="2"/><svg ${namespace}/>`,
	'<svg width="4" height="2"/>',
	`<svg ${namespace} width="4" height="2"><rect fill="&unknown;"/></svg>`,
])("does not recover malformed XML as HTML: %s", (markup) => {
	expect(() => decodeSvgImage(encoder.encode(markup))).toThrow();
});

it.each([
	'<image href="https://example.invalid/external.png"/>',
	'<use href="https://example.invalid/external.svg#paint"/>',
	'<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">content</div></foreignObject>',
	'<style>@import "https://example.invalid/external.css";</style>',
	'<rect width="4" height="2" style="filter:blur(1px)"/>',
])(
	"fails explicitly on unsupported active/external/paint content: %s",
	(content) => {
		expect(() => decodeSvgImage(source(content))).toThrow();
	},
);

it("keeps SVG scripts inert while decoding supported surrounding geometry", () => {
	const result = decodeSvgImage(
		source('<script>throw new Error("must not execute")</script>' + rectangle),
	);
	expect(result.shapes).toBe(1);
	expect(Array.from(result.image.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
});

it("rejects external stylesheet processing instructions rather than fetching or ignoring paint", () => {
	const bytes = encoder.encode(
		`<?xml-stylesheet href="https://example.invalid/style.css"?>${new TextDecoder().decode(source())}`,
	);
	expect(() => decodeSvgImage(bytes)).toThrow();
});

it("closes its native document after success and after a scene error", () => {
	const close = vi.spyOn(DocumentTree.prototype, "close");
	decodeSvgImage(source());
	expect(close).toHaveBeenCalledTimes(1);
	expect(() =>
		decodeSvgImage(source("<text>unsupported rendering</text>")),
	).toThrow();
	expect(close).toHaveBeenCalledTimes(2);
});

it("enforces aggregate parser, styles, scene and raster work without raising limits", () => {
	const bytes = source();
	const result = decodeSvgImage(bytes);
	expect(decodeSvgImage(bytes, { maxWork: result.work }).image.pixels).toEqual(
		result.image.pixels,
	);
	expect(() => decodeSvgImage(bytes, { maxWork: result.work - 1 })).toThrow(
		/work limit/,
	);
	expect(() => decodeSvgImage(bytes, { maxWork: 1 })).toThrow(/work limit/);
});

it("rejects pixel and dimension overflows before producing a raster", () => {
	expect(() => decodeSvgImage(source(), { maxPixels: 7 })).toThrow(
		"pixel limit",
	);
	expect(() =>
		decodeSvgImage(
			source(
				rectangle,
				`width="${svgImageDecodeLimits.maxDimension + 1}" height="2"`,
			),
		),
	).toThrow("dimension limit");
});

it.each([
	null,
	[],
	{ maxWork: 0 },
	{ maxPixels: 0 },
	{ maxWork: null },
	{ maxPixels: null },
	{ maxWork: Infinity },
	{ maxWork: svgImageDecodeLimits.maxWork + 1 },
	{ maxPixels: svgImageDecodeLimits.maxPixels + 1 },
	{ extra: 1 },
])("rejects invalid SVG decoder options %s", (options) => {
	expect(() =>
		decodeSvgImage(source(), options as unknown as PngDecodeOptions),
	).toThrow("Invalid SVG decode");
});

it("rejects an oversized source before attempting to decode it", () => {
	expect(() =>
		decodeSvgImage(new Uint8Array(svgImageDecodeLimits.maxInputBytes + 1)),
	).toThrow();
});
