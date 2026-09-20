import { afterEach, expect, it } from "vitest";
import { canvasLimits, documentCanvases } from "./document-canvases.js";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

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
	readonly canvas: object;
	fillStyle: unknown;
	globalAlpha: unknown;
	fillRect(...values: unknown[]): void;
	clearRect(...values: unknown[]): void;
	getImageData(...values: unknown[]): {
		width: number;
		height: number;
		data: Uint8ClampedArray;
	};
	save(): void;
	restore(): void;
}
interface Canvas {
	width: number;
	height: number;
	getContext(kind: string): Context | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
}
function fixture() {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const id = tree.createElement("canvas");
	const dom = new ScriptDom(tree, factory);
	const canvas = dom.node(id) as Canvas;
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("Expected a native 2D context");
	return { tree, id, dom, canvas, context };
}

it("publishes stable 2D identity and standard dimensions only on HTML canvas", () => {
	const { tree, dom, canvas, context } = fixture();
	expect([canvas.width, canvas.height]).toEqual([300, 150]);
	expect(canvas.getContext("2d")).toBe(context);
	expect(context.canvas).toBe(canvas);
	expect(canvas.getContext("webgl")).toBeNull();
	expect(canvas.getContext("unknown")).toBeNull();
	expect(
		(dom.node(tree.createElement("div")) as Partial<Canvas>).getContext,
	).toBeUndefined();
	expect(
		(dom.node(tree.createElementNS(svgNamespace, "canvas")) as Partial<Canvas>)
			.getContext,
	).toBeUndefined();
});

it("draws clipped and negative rectangles into an independent pixel readback", () => {
	const { canvas, context } = fixture();
	canvas.width = 2;
	canvas.height = 2;
	context.fillStyle = "red";
	context.fillRect(2, 2, -2, -2);
	context.clearRect(1, 0, 1, 1);
	const image = context.getImageData(-1, 0, 3, 2);
	expect(image).toMatchObject({ width: 3, height: 2 });
	expect(Array.from(image.data)).toEqual([
		0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0,
		0, 255,
	]);
	image.data.fill(42);
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		255, 0, 0, 255,
	]);
	context.fillRect(1e300, 1e300, 1e300, 1e300);
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		255, 0, 0, 255,
	]);
});

it("blends source-over alpha and saves/restores accepted drawing state", () => {
	const { canvas, context } = fixture();
	canvas.width = canvas.height = 1;
	context.fillStyle = "red";
	context.fillRect(0, 0, 1, 1);
	context.save();
	context.fillStyle = "blue";
	context.globalAlpha = 0.5;
	context.fillRect(0, 0, 1, 1);
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		127, 0, 128, 255,
	]);
	context.fillStyle = "not-a-color";
	context.globalAlpha = 2;
	expect(context.fillStyle).toBe("#0000ff");
	expect(context.globalAlpha).toBe(0.5);
	context.restore();
	context.restore();
	expect(context.fillStyle).toBe("#ff0000");
	expect(context.globalAlpha).toBe(1);
});

it("resets bitmap and drawing state on dimension writes, including equal writes", () => {
	const { canvas, context } = fixture();
	canvas.width = canvas.height = 1;
	context.fillStyle = "red";
	context.globalAlpha = 0.5;
	context.save();
	context.fillRect(0, 0, 1, 1);
	canvas.setAttribute("width", "1");
	expect(context.fillStyle).toBe("#000000");
	expect(context.globalAlpha).toBe(1);
	context.restore();
	expect(context.fillStyle).toBe("#000000");
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		0, 0, 0, 0,
	]);
	canvas.width = 1;
	context.fillRect(0, 0, 1, 1);
	canvas.width = 1;
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		0, 0, 0, 0,
	]);
	canvas.setAttribute("width", "bogus");
	expect(canvas.width).toBe(300);
	canvas.removeAttribute("height");
	expect(canvas.height).toBe(150);
});

it("bounds contexts, aggregate pixels, readback and drawing-state allocations", () => {
	const { tree, id, canvas, context } = fixture();
	canvas.width = canvas.height = 2048;
	context.fillRect(0, 0, 1, 1);
	const other = tree.createElement("canvas");
	const owner = documentCanvases(tree);
	expect(() => owner.get(other).fillRect(0, 0, 1, 1)).toThrow(
		/Document canvas pixel limit/,
	);
	canvas.width = 1;
	expect(() => owner.get(other).fillRect(0, 0, 1, 1)).not.toThrow();
	expect(() => context.getImageData(0, 0, 4096, 4096)).toThrow(/pixel limit/);
	for (let i = 0; i < canvasLimits.maxSavedStates; i++) context.save();
	expect(() => context.save()).toThrow(/state limit/);
	for (let i = 2; i < canvasLimits.maxContexts; i++)
		owner.get(tree.createElement("canvas"));
	expect(() => owner.get(tree.createElement("canvas"))).toThrow(
		/context limit/,
	);
});

it("shares allocation limits across documents in one runtime and releases them on close", () => {
	const first = fixture();
	const second = fixture();
	first.canvas.width = first.canvas.height = 2048;
	first.context.fillRect(0, 0, 1, 1);
	expect(() => second.context.fillRect(0, 0, 1, 1)).toThrow(
		/canvas pixel limit/,
	);
	first.tree.close();
	expect(() => second.context.fillRect(0, 0, 1, 1)).not.toThrow();
});

it("handles zero-sized bitmaps and rejects invalid readback without allocating", () => {
	const { canvas, context } = fixture();
	canvas.width = 0;
	context.fillRect(0, 0, 1, 1);
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
		0, 0, 0, 0,
	]);
	expect(() => context.getImageData(0, 0, 0, 1)).toThrow(RangeError);
	expect(() => context.getImageData(0, 0, Number.POSITIVE_INFINITY, 1)).toThrow(
		TypeError,
	);
	expect(() => context.fillRect(0, 0)).toThrow(TypeError);
});

it("revokes retained canvas contexts when the binding or document closes", () => {
	const { tree, dom, context } = fixture();
	context.fillRect(0, 0, 1, 1);
	dom.close();
	expect(() => context.getImageData(0, 0, 1, 1)).toThrow(/closed/);
	tree.close();
	expect(() => documentCanvases(tree).get(1)).toThrow(/closed/);
});

it("rejects reentrant context publication and permits retry after factory failure", () => {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	let attempts = 0;
	const dom = new ScriptDom(tree, {
		createHostObject(definition) {
			if (definition.methods?.fillRect && attempts++ === 0) {
				expect(() => canvas.getContext("2d")).toThrow(/Reentrant/);
				throw new Error("Factory failed");
			}
			return factory.createHostObject(definition);
		},
	});
	const canvas = dom.node(tree.createElement("canvas")) as Canvas;
	expect(() => canvas.getContext("2d")).toThrow("Factory failed");
	const context = canvas.getContext("2d");
	expect(context).not.toBeNull();
	expect(canvas.getContext("2d")).toBe(context);
	expect(attempts).toBe(2);
});
