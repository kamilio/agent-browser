import { afterEach, expect, it } from "vitest";
import { documentCanvases } from "./document-canvases.js";
import {
	type DocumentImageOptions,
	documentImages,
} from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};
interface Context {
	fillStyle: string;
	globalAlpha: number;
	fillRect(...args: number[]): void;
	clearRect(...args: number[]): void;
	drawImage(source: unknown, ...args: unknown[]): void;
	getImageData(...args: number[]): { data: Uint8ClampedArray };
	save(): void;
	restore(): void;
}
interface Canvas {
	width: number;
	height: number;
	getContext(kind: string): Context;
}
function fixture(extra = "", options: DocumentImageOptions = {}) {
	const tree = parseHtmlDocument(
		`<canvas id="a" width="4" height="1"></canvas><canvas id="b" width="4" height="1"></canvas>${extra}`,
		"https://example.com/",
	);
	trees.push(tree);
	const images = documentImages(tree, options);
	const dom = new ScriptDom(tree, factory);
	const id = (selector: string) => {
		const value = new DocumentQueries(tree).querySelector(selector);
		if (value === null) throw new Error("Missing fixture element");
		return value;
	};
	const a = dom.node(id("#a")) as Canvas;
	const b = dom.node(id("#b")) as Canvas;
	const source = a.getContext("2d");
	const target = b.getContext("2d");
	source.fillStyle = "red";
	source.fillRect(0, 0, 2, 1);
	source.fillStyle = "blue";
	source.fillRect(2, 0, 2, 1);
	const pixel = (x: number) => Array.from(target.getImageData(x, 0, 1, 1).data);
	return { tree, dom, images, id, a, b, source, target, pixel };
}
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const clear = [0, 0, 0, 0];
function response(url: string): NetworkResponse {
	const body = encodePng(createRaster(1, 1, [20, 40, 60, 255]));
	return {
		url,
		status: 200,
		headers: { "content-type": ["image/png"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

it("draws canvas sources at natural size, scaled and cropped", () => {
	const { a, target, pixel } = fixture();
	target.drawImage(a, 0, 0);
	expect([pixel(0), pixel(3)]).toEqual([red, blue]);
	target.clearRect(0, 0, 4, 1);
	target.drawImage(a, 0, 0, 2, 1);
	expect([pixel(0), pixel(1), pixel(2)]).toEqual([red, blue, clear]);
	target.drawImage(a, 2, 0, 2, 1, 0, 0, 4, 1);
	expect([pixel(0), pixel(3)]).toEqual([blue, blue]);
});
it("normalizes negative source and destination sizes without flipping", () => {
	const { a, target, pixel } = fixture();
	target.drawImage(a, 4, 1, -4, -1, 4, 1, -4, -1);
	expect([pixel(0), pixel(3)]).toEqual([red, blue]);
});
it("clips the source proportionally and bounds large destination coordinates", () => {
	const { a, target, pixel } = fixture();
	target.drawImage(a, -2, 0, 4, 1, 0, 0, 4, 1);
	expect([pixel(0), pixel(1), pixel(2), pixel(3)]).toEqual([
		clear,
		clear,
		red,
		red,
	]);
	target.drawImage(a, 1e300, 0, 1e300, 1);
	target.drawImage(a, Number.MAX_VALUE, 0, Number.MAX_VALUE, 1);
	expect(pixel(0)).toEqual(clear);
});
it("snapshots overlapping self-drawing instead of smearing its input", () => {
	const { b, target, pixel } = fixture();
	target.fillStyle = "red";
	target.fillRect(0, 0, 1, 1);
	target.fillStyle = "blue";
	target.fillRect(1, 0, 1, 1);
	target.drawImage(b, 0, 0, 3, 1, 1, 0, 3, 1);
	expect([pixel(0), pixel(1), pixel(2), pixel(3)]).toEqual([
		red,
		red,
		blue,
		clear,
	]);
});
it("composites image alpha with the destination and globalAlpha", () => {
	const { a, source, target, pixel } = fixture();
	target.fillStyle = "blue";
	target.fillRect(0, 0, 4, 1);
	target.globalAlpha = 0.5;
	target.drawImage(a, 0, 0);
	expect(pixel(0)).toEqual([128, 0, 128, 255]);
	source.clearRect(0, 0, 4, 1);
	source.fillStyle = "rgba(255,0,0,0.5)";
	source.fillRect(0, 0, 4, 1);
	target.globalAlpha = 1;
	target.fillRect(0, 0, 4, 1);
	target.globalAlpha = 0.5;
	target.drawImage(a, 0, 0);
	expect(pixel(0)).toEqual([64, 0, 191, 255]);
});
it("maps vertical cropping and clips destination edges", () => {
	const f = fixture();
	f.a.width = 1;
	f.a.height = 4;
	f.source.fillStyle = "red";
	f.source.fillRect(0, 0, 1, 2);
	f.source.fillStyle = "blue";
	f.source.fillRect(0, 2, 1, 2);
	f.b.width = 1;
	f.b.height = 2;
	f.target.drawImage(f.a, 0, 0, 1, 4, 0, -1, 1, 4);
	expect(Array.from(f.target.getImageData(0, 0, 1, 2).data)).toEqual([
		...red,
		...blue,
	]);
});
it("draws the existing static native SVG image subset", async () => {
	const body = new TextEncoder().encode(
		'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="2" height="1" fill="red"/></svg>',
	);
	const f = fixture('<img id="img" src="/a.svg">', {
		fetch: async (url) => ({
			...response(url),
			body,
			encodedBytes: body.length,
			headers: { "content-type": ["image/svg+xml"] },
		}),
	});
	await f.images.settle();
	f.target.drawImage(f.dom.node(f.id("#img")), 0, 0, 4, 1);
	expect([f.pixel(0), f.pixel(3)]).toEqual([red, red]);
});
it("rejects fabricated, foreign and unsupported sources and revoked bindings", () => {
	const f = fixture();
	const other = fixture();
	expect(() => f.target.drawImage({ width: 1, height: 1 }, 0, 0)).toThrow(
		/Expected a node/,
	);
	expect(() => f.target.drawImage(other.a, 0, 0)).toThrow(/Expected a node/);
	expect(() => f.target.drawImage(f.dom.node(f.tree.root), 0, 0)).toThrow(
		TypeError,
	);
	expect(() => f.target.drawImage(f.a, 0)).toThrow(TypeError);
	f.dom.close();
	expect(() => f.target.drawImage(f.a, 0, 0)).toThrow(/closed/);
});
it("skips unloaded images, rejects broken images and zero-sized canvases", async () => {
	const f = fixture('<img id="empty"><img id="bad" src="/bad.png">', {
		fetch: async () => {
			throw new Error("bad");
		},
	});
	f.target.drawImage(f.dom.node(f.id("#empty")), 0, 0);
	await f.images.settle();
	expect(() => f.target.drawImage(f.dom.node(f.id("#bad")), 0, 0)).toThrow(
		/broken/,
	);
	f.a.width = 0;
	expect(() => f.target.drawImage(f.a, 0, 0)).toThrow(/no pixels/);
	expect(f.pixel(0)).toEqual(clear);
});
it("draws loaded same-origin image pixels with independent readback", async () => {
	const f = fixture('<img id="img" src="/a.png">', {
		fetch: async (url) => response(url),
	});
	await f.images.settle();
	f.target.drawImage(f.dom.node(f.id("#img")), 0, 0, 4, 1);
	expect(f.pixel(3)).toEqual([20, 40, 60, 255]);
	f.target.getImageData(0, 0, 1, 1).data.fill(0);
	expect(f.pixel(0)).toEqual([20, 40, 60, 255]);
});
it("taints from a cross-origin redirect and propagates through canvas copies", async () => {
	const f = fixture('<img id="img" src="/a.png">', {
		fetch: async (url) => ({
			...response("https://cdn.example.com/a.png"),
			redirects: [
				{ url, status: 302, location: "https://cdn.example.com/a.png" },
			],
		}),
	});
	await f.images.settle();
	f.target.save();
	f.target.drawImage(f.dom.node(f.id("#img")), 0, 0);
	expect(
		documentCanvases(f.tree).bitmap(f.id("#b"))?.pixels.slice(0, 4),
	).toEqual(new Uint8Array([20, 40, 60, 255]));
	expect(() => f.pixel(0)).toThrow(
		expect.objectContaining({ name: "SecurityError" }),
	);
	f.source.drawImage(f.b, 0, 0);
	expect(() => f.source.getImageData(0, 0, 1, 1)).toThrow(/cross-origin/);
	f.target.clearRect(0, 0, 4, 1);
	f.target.restore();
	f.target.fillRect(0, 0, 4, 1);
	expect(() => f.pixel(0)).toThrow(/cross-origin/);
	const originalWidth = f.b.width;
	f.b.width = originalWidth;
	expect(f.pixel(0)).toEqual(clear);
});
it("preserves taint with transparent or offscreen drawing but skips zero rectangles", async () => {
	const f = fixture('<img id="img" src="https://cdn.example.com/a.png">', {
		fetch: async (url) => response(url),
	});
	await f.images.settle();
	const image = f.dom.node(f.id("#img"));
	f.target.drawImage(image, 0, 0, 0, 1);
	expect(f.pixel(0)).toEqual(clear);
	f.target.globalAlpha = 0;
	f.target.drawImage(image, 0, 0);
	expect(() => f.pixel(0)).toThrow(/cross-origin/);
	f.b.width = 4;
	f.target.drawImage(image, 100, 0);
	expect(() => f.pixel(0)).toThrow(/cross-origin/);
});
it("keeps blank canvas sources allocation-free and enforces destination pixel limits", () => {
	const f = fixture();
	f.a.width = 4096;
	f.a.height = 4096;
	f.target.drawImage(f.a, 0, 0);
	expect(documentCanvases(f.tree).bitmap(f.id("#a"))).toBeUndefined();
	f.b.width = 4096;
	f.b.height = 4096;
	f.a.width = 1;
	f.a.height = 1;
	f.source.fillRect(0, 0, 1, 1);
	expect(() => f.target.drawImage(f.a, 0, 0)).toThrow(/pixel limit/);
});
