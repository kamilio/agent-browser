import { afterEach, expect, it, vi } from "vitest";
import { documentImages } from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { ScriptDom, type ScriptHostObjectFactory } from "./script-dom.js";

interface ImageBinding {
	width: unknown;
	height: unknown;
	src: string;
	naturalWidth: number;
	naturalHeight: number;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	decode(): Promise<void>;
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

const factory: ScriptHostObjectFactory = {
	createHostObject(definition) {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};

function fixture() {
	const tree = parseHtmlDocument(
		"<body></body>",
		"https://fixture.invalid/page",
	);
	trees.push(tree);
	const fetch = vi.fn(async (url: string) => {
		const body = encodePng(createRaster(3, 2, [20, 40, 60, 255]));
		return {
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		};
	});
	const images = documentImages(tree, { fetch });
	const dom = new ScriptDom(tree, factory);
	const id = tree.createElement("img");
	const image = dom.node(id) as ImageBinding;
	return { tree, dom, id, image, images, fetch };
}

it.each([
	[undefined, 0],
	[null, 0],
	[false, 0],
	[true, 1],
	["12.9", 12],
	[-1, 4294967295],
	[-2.9, 4294967294],
	[4294967298.9, 2],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[Number.NEGATIVE_INFINITY, 0],
	[-0, 0],
])(
	"uses unsigned-long reflection for primitive dimension %s",
	(value, expected) => {
		const { tree, id, image } = fixture();
		image.width = value;
		image.height = value;
		expect([image.width, image.height]).toEqual([expected, expected]);
		expect(image.getAttribute("width")).toBe(String(expected));
		expect(image.getAttribute("height")).toBe(String(expected));
		expect(tree.get(id).attributes).toMatchObject({
			width: String(expected),
			height: String(expected),
		});
	},
);

it("reflects native img attributes without exposing image dimensions on other elements", () => {
	const { tree, dom, image } = fixture();
	image.setAttribute("width", "12px");
	image.setAttribute("height", "-1");
	expect([image.width, image.height]).toEqual([12, 0]);
	const other = dom.node(tree.createElement("div"));
	expect("width" in other).toBe(false);
	expect("height" in other).toBe(false);
});

it.each(["width", "height"] as const)(
	"rejects unsafe %s coercion without changing native attributes",
	(name) => {
		const { image } = fixture();
		const coerceNumber = vi.fn(() => 7);
		const coerceString = vi.fn(() => "7");
		image[name] = 6;
		for (const value of [
			1n,
			Symbol(name),
			{ valueOf: coerceNumber, toString: coerceString },
			() => 7,
		]) {
			expect(() => {
				image[name] = value;
			}).toThrow(TypeError);
			expect(image.getAttribute(name)).toBe("6");
		}
		expect(coerceNumber).not.toHaveBeenCalled();
		expect(coerceString).not.toHaveBeenCalled();
	},
);

it("uses decoded natural sizes only when native dimension attributes are absent or invalid", async () => {
	const { image, images, fetch } = fixture();
	expect([image.width, image.height]).toEqual([0, 0]);
	expect([image.getAttribute("width"), image.getAttribute("height")]).toEqual([
		null,
		null,
	]);
	image.src = "/pixel.png";
	await image.decode();
	await images.settle();
	expect([image.width, image.height]).toEqual([3, 2]);
	image.width = 0;
	image.height = 5;
	expect([
		image.width,
		image.height,
		image.naturalWidth,
		image.naturalHeight,
	]).toEqual([0, 5, 3, 2]);
	for (const value of ["", "-1", "auto", "4294967296"]) {
		image.setAttribute("width", value);
		image.setAttribute("height", value);
		expect([image.width, image.height]).toEqual([3, 2]);
	}
	image.removeAttribute("width");
	image.removeAttribute("height");
	expect([image.width, image.height]).toEqual([3, 2]);
	expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
	["0", 0],
	[" +12px", 12],
	["\t\n4.9", 4],
	["4294967295", 4294967295],
])("parses native nonnegative dimension attribute %s", (value, expected) => {
	const { image } = fixture();
	image.setAttribute("width", value as string);
	image.setAttribute("height", value as string);
	expect([image.width, image.height]).toEqual([expected, expected]);
});

it.each(["DOM", "tree"])(
	"revokes dimension access before coercion after %s closure",
	(kind) => {
		const { image, dom, tree } = fixture();
		const coerceNumber = vi.fn(() => 3);
		if (kind === "DOM") dom.close();
		else tree.close();
		for (const name of ["width", "height"] as const) {
			expect(() => image[name]).toThrow(/closed/);
			expect(() => {
				image[name] = { valueOf: coerceNumber };
			}).toThrow(/closed/);
		}
		expect(coerceNumber).not.toHaveBeenCalled();
	},
);
