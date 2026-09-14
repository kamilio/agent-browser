import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import type { RasterImage } from "./raster.js";
import { documentStyles } from "./styles.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene, imageSvgScene } from "./svg-scene.js";

const documents: DocumentTree[] = [];
const noCharge = () => {};

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	attributes: Record<string, string> = {},
	css = "",
	image = false,
) {
	const tree = new DocumentTree("https://fixture.invalid/opacity-svg");
	documents.push(tree);
	let parent = tree.root;
	if (!image) {
		parent = tree.createElement("main");
		tree.append(tree.root, parent);
	}
	const root = tree.createParserElement(
		"svg",
		{ width: "24", height: "24", viewBox: "0 0 24 24", ...attributes },
		svgNamespace,
	);
	tree.append(parent, root);
	function add(
		tagName: string,
		values: Record<string, string> = {},
		owner = root,
	) {
		const child = tree.createParserElement(tagName, values, svgNamespace);
		tree.append(owner, child);
		return child;
	}
	if (css) tree.append(add("style"), tree.createText(css));
	const shape = add("rect", {
		x: "4",
		y: "4",
		width: "8",
		height: "8",
		fill: "red",
	});
	return {
		tree,
		root,
		shape,
		add,
		scene: (options?: Parameters<typeof documentSvgScene>[3]) =>
			documentSvgScene(tree, root, noCharge, options),
		imageScene: () => imageSvgScene(tree, root, noCharge),
	};
}

function pixel(image: RasterImage, across: number, down: number) {
	const offset = (down * image.width + across) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([
	["", "", 64],
	["rect{opacity:50%}", "", 128],
	["rect{opacity:.5}", "opacity:.75", 191],
	["rect{opacity:.5!important}", "opacity:.75", 128],
	["rect{opacity:.5!important}", "opacity:.25!important", 64],
] as const)(
	"cascades opacity attributes, author CSS %s and inline CSS %s",
	(css, inline, alpha) => {
		const { tree, shape, scene } = fixture({}, css);
		tree.setAttribute(shape, "opacity", ".25");
		if (inline) tree.setAttribute(shape, "style", inline);
		expect(scene().shapes[0].fill).toEqual([255, 0, 0, alpha]);
		expect(documentStyles(tree).metrics().issues).toEqual({});
	},
);

it.each(["1", "100%", "initial", "unset", "revert"])(
	"does not fall back to a shape opacity attribute after CSS %s",
	(value) => {
		const { tree, shape, scene } = fixture({}, `rect{opacity:${value}}`);
		tree.setAttribute(shape, "opacity", ".25");
		expect(documentStyles(tree).paint(shape).opacity).toBeUndefined();
		expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
	},
);

it.each([
	["-25%", 0],
	["0", 0],
	["25%", 64],
	["5e-1", 128],
	["1.5", 255],
	["200%", 255],
] as const)("uses clamped computed shape opacity %s", (value, alpha) => {
	const { scene } = fixture({}, `rect{opacity:${value}}`);
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, alpha]);
});

it.each([
	["0.", 0],
	["5.e-1", 128],
	["50.%", 128],
] as const)("preserves existing numeric SVG opacity %s", (value, alpha) => {
	const { tree, shape, scene } = fixture();
	tree.setAttribute(shape, "opacity", value);
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, alpha]);
});

it("isolates CSS shape opacity around overlapping fill and stroke", () => {
	const { scene } = fixture(
		{},
		"rect{fill:red;stroke:blue;stroke-width:4;opacity:.5}",
	);
	expect(scene().shapes[0]).toMatchObject({
		fill: [255, 0, 0, 255],
		stroke: { paint: [0, 0, 255, 255] },
		opacity: 0.5,
	});
	const image = rasterizeSvgScene(scene(), 24, 24, noCharge);
	expect(pixel(image, 4, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 2, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 128]);
});

it("retains independent fill and stroke alpha inside CSS shape opacity", () => {
	const { scene } = fixture(
		{},
		"rect{fill:red;fill-opacity:.5;stroke:blue;stroke-opacity:.5;stroke-width:4;opacity:50%}",
	);
	expect(scene().shapes[0]).toMatchObject({
		fill: [255, 0, 0, 128],
		stroke: { paint: [0, 0, 255, 128] },
		opacity: 0.5,
	});
	const image = rasterizeSvgScene(scene(), 24, 24, noCharge);
	expect(pixel(image, 4, 8)).toEqual([85, 0, 170, 96]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 64]);
});

it.each(["stroke:none", "stroke:blue;stroke-width:0"])(
	"keeps fill-only opacity when %s omits stroke",
	(stroke) => {
		const { scene } = fixture({}, `rect{fill-opacity:.5;opacity:.5;${stroke}}`);
		const shape = scene().shapes[0];
		expect(shape.fill).toEqual([255, 0, 0, 64]);
		expect(shape.stroke).toBeUndefined();
		expect(shape.opacity).toBeUndefined();
	},
);

it.each(["0", ".5", "50%"])(
	"fails closed on CSS group opacity %s even for an empty group",
	(value) => {
		const { add, scene } = fixture({}, `g{opacity:${value}}`);
		add("g");
		expect(scene).toThrow("group opacity requires compositing");
	},
);

it.each(["1", "100%", "initial", "unset", "revert"])(
	"accepts a CSS %s reset of a nonunit group opacity attribute",
	(value) => {
		const { tree, shape, add, scene } = fixture({}, `g{opacity:${value}}`);
		tree.append(add("g", { opacity: ".5" }), shape);
		expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
	},
);

it.each([
	["opacity", ".5"],
	["style", "opacity:50%"],
] as const)("keeps default root rejection for %s=%s", (name, value) => {
	const { scene } = fixture({ [name]: value });
	expect(scene).toThrow("group opacity requires compositing");
	expect(() => scene({ outerOpacityHandled: false })).toThrow(
		"group opacity requires compositing",
	);
	expect(scene({ outerOpacityHandled: true }).shapes[0].fill).toEqual([
		255, 0, 0, 255,
	]);
});

it("leaves root alpha to its explicit outer compositor without changing shape isolation", () => {
	const { tree, root, scene } = fixture(
		{ opacity: ".25" },
		"svg{opacity:.5}rect{opacity:.5;stroke:blue;stroke-width:4}",
	);
	const result = scene({ outerOpacityHandled: true });
	expect(documentStyles(tree).paint(root).opacity).toBe(0.5);
	expect(result.shapes[0].opacity).toBe(0.5);
	const image = rasterizeSvgScene(result, 24, 24, noCharge);
	expect(pixel(image, 4, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 128]);
	expect(scene).toThrow("group opacity requires compositing");
});

it.each([
	["", 255],
	["inherit", 128],
	["unset", 255],
] as const)(
	"does not implicitly inherit outer alpha with child CSS %s",
	(value, alpha) => {
		const { scene } = fixture(
			{ opacity: ".5" },
			value ? `rect{opacity:${value}}` : "",
		);
		expect(scene({ outerOpacityHandled: true }).shapes[0].fill).toEqual([
			255,
			0,
			0,
			alpha,
		]);
	},
);

it("does not let the outer compositor flag bypass a descendant group", () => {
	const { add, scene } = fixture({ opacity: "0" }, "g{opacity:.5}");
	add("g");
	expect(() => scene({ outerOpacityHandled: true })).toThrow(
		"group opacity requires compositing",
	);
});

it.each(["svg", "g"])(
	"keeps independent external-image CSS %s opacity fail-closed",
	(selector) => {
		const { add, imageScene } = fixture({}, `${selector}{opacity:.5}`, true);
		if (selector === "g") add("g");
		expect(imageScene).toThrow("group opacity requires compositing");
	},
);

it("retains external-image root attribute rejection and shape CSS precedence", () => {
	const { tree, root, shape, imageScene } = fixture(
		{ opacity: ".5" },
		"rect{opacity:.5}",
		true,
	);
	expect(imageScene).toThrow("group opacity requires compositing");
	tree.setAttribute(root, "style", "opacity:1");
	tree.setAttribute(shape, "opacity", ".25");
	expect(imageScene().shapes[0].fill).toEqual([255, 0, 0, 128]);
});

it.each(["NaN", "Infinity", "1e999", "bogus", "var(--alpha)", ".5;fill:red"])(
	"preserves malformed active opacity attribute rejection for %s",
	(value) => {
		const { tree, shape, scene } = fixture({}, "rect{opacity:1}");
		tree.setAttribute(shape, "opacity", value);
		expect(scene).toThrow("invalid opacity");
	},
);

it("does not let the outer compositor flag bypass malformed root opacity", () => {
	const { scene } = fixture({ opacity: "NaN" });
	expect(() => scene({ outerOpacityHandled: true })).toThrow("invalid opacity");
});

it("keeps malformed opacity irrelevant to hidden graphics and clip silhouettes", () => {
	const { tree, shape, add, scene } = fixture({}, "rect{opacity:.5}");
	const hidden = add("g", { display: "none", opacity: "invalid" });
	add("use", { href: "external" }, hidden);
	const definitions = add("defs");
	const clip = add("clipPath", { id: "crop" }, definitions);
	add("rect", { width: "8", height: "24", opacity: "invalid" }, clip);
	tree.setAttribute(shape, "clip-path", "url(#crop)");
	const image = rasterizeSvgScene(scene(), 24, 24, noCharge);
	expect(pixel(image, 6, 8)).toEqual([255, 0, 0, 128]);
	expect(pixel(image, 10, 8)).toEqual([0, 0, 0, 0]);
});

it("invalidates computed alpha on CSS and presentation-attribute mutation", () => {
	const { tree, shape, scene } = fixture();
	tree.setAttribute(shape, "opacity", ".25");
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, 64]);
	tree.setAttribute(shape, "style", "opacity:1");
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
	tree.setAttribute(shape, "opacity", ".5");
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
	tree.removeAttribute(shape, "style");
	expect(scene().shapes[0].fill).toEqual([255, 0, 0, 128]);
});
