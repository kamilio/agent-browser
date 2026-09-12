import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene } from "./svg-scene.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const noCharge = () => {};
const stops = '<stop stop-color="red"/><stop offset="1" stop-color="blue"/>';

function fixture(
	content: string,
	attributes = 'width="4" height="2" viewBox="0 0 4 2"',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style><svg ${attributes}>${content}</svg>`,
		"about:blank",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const root = query.querySelector("svg");
	query.close();
	if (root === null) throw new Error("Missing SVG gradient fixture");
	return documentSvgScene(tree, root, noCharge);
}

function pixel(
	scene: ReturnType<typeof fixture>,
	column: number,
	row = 0,
	width = 4,
	height = 2,
) {
	const image = rasterizeSvgScene(scene, width, height, noCharge);
	const offset = (row * width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([false, true])(
	"retains forward-referenced gradients inside or outside defs: %s",
	(insideDefs) => {
		const gradient = `<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="4" y2="0">${stops}</linearGradient>`;
		const scene = fixture(
			`<rect width="4" height="2" fill="url(#paint)"/>${insideDefs ? `<defs>${gradient}</defs>` : gradient}`,
		);
		expect(scene.shapes).toHaveLength(1);
		expect(scene.shapes[0].fill).toBeInstanceOf(SvgLinearGradient);
		expect(pixel(scene, 0)).toEqual([223, 0, 32, 255]);
		expect(pixel(scene, 3)).toEqual([32, 0, 223, 255]);
	},
);

it("uses native stop CSS cascade rather than only presentation attributes", () => {
	const scene = fixture(
		'<linearGradient id="paint"><stop stop-color="green" style="stop-color:#0673BA"/><stop offset="1" stop-color="#11A14E"/></linearGradient><rect width="4" height="2" fill="url(#paint)"/>',
	);
	expect(pixel(scene, 0)).toEqual([7, 121, 173, 255]);
	expect(pixel(scene, 3)).toEqual([16, 155, 92, 255]);
});

it("inherits stop currentColor from the paint server rather than painted geometry", () => {
	const scene = fixture(
		'<g color="red"><linearGradient id="paint"><stop stop-color="currentColor"/><stop offset="1" stop-color="currentColor"/></linearGradient></g><rect width="4" height="2" color="blue" fill="url(#paint)"/>',
	);
	expect(pixel(scene, 0)).toEqual([255, 0, 0, 255]);
});

it("keeps display-none paint servers referenceable", () => {
	const scene = fixture(
		`<defs style="display:none"><linearGradient id="paint">${stops}</linearGradient></defs><rect width="4" height="2" fill="url(#paint)"/>`,
	);
	expect(pixel(scene, 0)).toEqual([223, 0, 32, 255]);
});

it("inherits a root paint reference and applies per-shape opacity", () => {
	const scene = fixture(
		`<linearGradient id="paint">${stops}</linearGradient><g><rect width="4" height="2" fill-opacity=".5" opacity=".5"/></g>`,
		'width="4" height="2" viewBox="0 0 4 2" fill="url(#paint)"',
	);
	expect(pixel(scene, 0)).toEqual([223, 0, 32, 64]);
});

it("maps default object-box coordinates to translated geometry bounds", () => {
	const scene = fixture(
		`<linearGradient id="paint">${stops}</linearGradient><rect x="2" width="2" height="2" fill="url(#paint)"/>`,
	);
	expect(pixel(scene, 1)).toEqual([0, 0, 0, 0]);
	expect(pixel(scene, 2)).toEqual([191, 0, 64, 255]);
	expect(pixel(scene, 3)).toEqual([64, 0, 191, 255]);
});

it("resolves user-space percentages against the viewport, not shape bounds", () => {
	const scene = fixture(
		`<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0%" x2="100%">${stops}</linearGradient><rect x="2" width="2" height="2" fill="url(#paint)"/>`,
	);
	expect(pixel(scene, 2)).toEqual([96, 0, 159, 255]);
});

it("applies gradientTransform before the referencing shape transform", () => {
	const scene = fixture(
		`<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0" x2="4" gradientTransform="translate(1 0)">${stops}</linearGradient><rect width="4" height="2" transform="translate(1 0)" fill="url(#paint)"/>`,
	);
	expect(pixel(scene, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(scene, 2)).toEqual([223, 0, 32, 255]);
});

it("returns no paint for a gradient with no stops", () => {
	const scene = fixture(
		'<linearGradient id="paint"/><rect width="4" height="2" fill="url(#paint)"/>',
	);
	expect(scene.shapes[0].fill).toBeNull();
	expect(pixel(scene, 0)).toEqual([0, 0, 0, 0]);
});

it("paints one stop as a solid color with its effective stop opacity", () => {
	const scene = fixture(
		'<linearGradient id="paint"><stop offset=".5" stop-color="red" stop-opacity=".5"/></linearGradient><rect width="4" height="2" fill="url(#paint)"/>',
	);
	expect(pixel(scene, 0)).toEqual([255, 0, 0, 128]);
	expect(pixel(scene, 3)).toEqual([255, 0, 0, 128]);
});

it("uses the final stop for a zero-length gradient vector", () => {
	const scene = fixture(
		'<linearGradient id="paint" x1="50%" x2="50%"><stop stop-color="red"/><stop offset="1" stop-color="blue" stop-opacity=".5"/></linearGradient><rect width="4" height="2" fill="url(#paint)"/>',
	);
	expect(pixel(scene, 0)).toEqual([0, 0, 255, 128]);
	expect(pixel(scene, 3)).toEqual([0, 0, 255, 128]);
});

it("clamps offsets without sorting and uses the latter stop at an overlap", () => {
	const scene = fixture(
		'<linearGradient id="paint"><stop offset="-50%" stop-color="red"/><stop offset="37.5%" stop-color="#00ff00"/><stop offset="10%" stop-color="blue"/><stop offset="150%" stop-color="white"/></linearGradient><rect width="4" height="2" fill="url(#paint)"/>',
	);
	expect(pixel(scene, 0)).toEqual([170, 85, 0, 255]);
	expect(pixel(scene, 1)).toEqual([0, 0, 255, 255]);
	expect(pixel(scene, 3)).toEqual([204, 204, 255, 255]);
});

it("chooses supported sRGB interpolation for the auto keyword", () => {
	const scene = fixture(
		`<linearGradient id="paint" color-interpolation="auto">${stops}</linearGradient><rect width="4" height="2" fill="url(#paint)"/>`,
	);
	expect(pixel(scene, 0)).toEqual([223, 0, 32, 255]);
});

it("does not silently replace inherited linearRGB with sRGB", () => {
	expect(() =>
		fixture(
			`<g color-interpolation="linearRGB"><linearGradient id="paint">${stops}</linearGradient></g><rect width="4" height="2" fill="url(#paint)"/>`,
		),
	).toThrow("only sRGB");
});

it.each([
	"context-fill",
	"url(https://example.invalid/image.svg#paint)",
	"url(#paint) context-fill",
])("does not fetch or substitute unsupported paint %s", (fill) => {
	expect(() =>
		fixture(`<rect width="4" height="2" fill="${fill}"/>`),
	).toThrow();
});

it.each([
	'href="#other"',
	'xlink:href="#other"',
	'gradientUnits="unknown"',
	'spreadMethod="unknown"',
	'color-interpolation="linearRGB"',
	'x1="calc(1px + 2px)"',
])("rejects unsupported paint-server feature %s", (attributes) => {
	expect(() =>
		fixture(
			`<linearGradient id="paint" ${attributes}>${stops}</linearGradient><rect width="4" height="2" fill="url(#paint)"/>`,
		),
	).toThrow();
});

it("does not reinterpret the first duplicate ID as a later paint server", () => {
	const scene = fixture(
		`<rect id="paint"/><linearGradient id="paint">${stops}</linearGradient><rect width="4" height="2" fill="url(#paint)"/>`,
	);
	expect(scene.shapes[1].fill).toBeNull();
});

it("rejects a meaningful unsupported stop child instead of deleting it", () => {
	expect(() =>
		fixture(
			'<linearGradient id="paint"><stop><animate attributeName="stop-color"/></stop><stop offset="1"/></linearGradient><rect width="4" height="2" fill="url(#paint)"/>',
		),
	).toThrow("unsupported stop child");
});

it("enforces the fixed gradient stop bound", () => {
	expect(() =>
		fixture(
			`<linearGradient id="paint">${"<stop/>".repeat(257)}</linearGradient><rect width="4" height="2" fill="url(#paint)"/>`,
		),
	).toThrow("stop limit exceeded");
});
