import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { scriptGeometryLimits } from "./script-geometry.js";

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	toJSON(): Record<string, number>;
}
interface RectList {
	readonly length: number;
	readonly [index: number]: Rect | undefined;
	item(index?: unknown): Rect | null;
}
interface Element {
	getClientRects(): RectList;
	getBoundingClientRect(): Rect;
	setAttribute(key: string, value: string): void;
	textContent: string;
}
const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		for (const [key, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, key, {
				get: property.get,
				set: property.set,
				enumerable: true,
			});
		for (const [key, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, key, { value: method });
		return definition.indexed
			? new Proxy(object, {
					get(target, key) {
						if (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)) {
							const index = Number(key);
							return index < (definition.indexed?.length() ?? 0)
								? definition.indexed?.get(index)
								: undefined;
						}
						return Reflect.get(target, key);
					},
				})
			: object;
	},
};
function fixture(content = "ab cd", width = 18) {
	const tree = parseHtmlDocument(
		`<main style="width:${width}px;font-size:8px"><span id="target">${content}</span></main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const dom = new ScriptDom(tree, factory);
	const document = dom.document as {
		querySelector(selector: string): Element;
		createElement(tag: string): Element;
	};
	return { tree, dom, document, target: document.querySelector("#target") };
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("exposes indexed snapshot lists with stable item identity", () => {
	const { target } = fixture();
	const list = target.getClientRects();
	expect(list.length).toBe(2);
	expect(list[0]).toBe(list.item(0));
	expect(list[1]?.y).toBe(11);
	expect(list[2]).toBeUndefined();
	expect(list.item(2)).toBeNull();
	expect(() => {
		(list as { length: number }).length = 20;
	}).toThrow();
});

it("returns fresh mutable rectangles without changing layout or previous snapshots", () => {
	const { target, tree } = fixture();
	const first = target.getBoundingClientRect();
	const second = target.getBoundingClientRect();
	expect(first).not.toBe(second);
	first.width = 99;
	expect(second.width).toBe(12);
	expect(target.getBoundingClientRect().width).toBe(12);
	expect(documentGeometry(tree).metrics().builds).toBe(1);
});

it("preserves snapshot values across DOM mutations", () => {
	const { target } = fixture();
	const list = target.getClientRects();
	target.textContent = "a";
	expect(list.length).toBe(2);
	expect(list[0]?.width).toBe(12);
	expect(target.getClientRects().length).toBe(1);
	expect(target.getBoundingClientRect().width).toBe(6);
});

it("derives edges for negative dimensions and serializes independent records", () => {
	const rect = fixture().target.getBoundingClientRect();
	rect.x = 20;
	rect.y = 30;
	rect.width = -5;
	rect.height = -7;
	expect(rect.toJSON()).toEqual({
		x: 20,
		y: 30,
		width: -5,
		height: -7,
		left: 15,
		right: 20,
		top: 23,
		bottom: 30,
	});
	const record = rect.toJSON();
	record.x = 100;
	expect(rect.x).toBe(20);
	expect(() => {
		(rect as { left: number }).left = 1;
	}).toThrow();
});

it("uses unrestricted numeric setters without clamping infinities or NaN", () => {
	const rect = fixture().target.getBoundingClientRect();
	rect.width = Number.POSITIVE_INFINITY;
	expect(rect.right).toBe(Number.POSITIVE_INFINITY);
	rect.x = Number.NaN;
	expect(rect.left).toBeNaN();
	expect(() => {
		rect.height = 1n as unknown as number;
	}).toThrow(TypeError);
	expect(() => {
		rect.height = Symbol() as unknown as number;
	}).toThrow(TypeError);
});

it.each([
	[undefined, 0],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[1.9, 1],
	[4_294_967_297, 1],
	[-1, -1],
	["1", 1],
])("converts item index %s with unsigned-long semantics", (input, index) => {
	const list = fixture().target.getClientRects();
	expect(list.item(input)).toBe(index === -1 ? null : list[index]);
});

it("requires an item argument and rejects BigInt indices", () => {
	const list = fixture().target.getClientRects();
	expect(() => list.item()).toThrow(TypeError);
	expect(() => list.item(0n)).toThrow(TypeError);
});

it("returns an empty list and zero bounds for a detached element", () => {
	const node = fixture().document.createElement("span");
	expect(node.getClientRects().length).toBe(0);
	expect(node.getBoundingClientRect().toJSON()).toEqual({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	});
});

it("caps host objects cumulatively even when callers drop returned snapshots", () => {
	const { dom, target } = fixture();
	for (let index = 0; index < scriptGeometryLimits.maxObjects; index++)
		target.getBoundingClientRect();
	expect(dom.metrics().geometry.created).toBe(scriptGeometryLimits.maxObjects);
	expect(() => target.getClientRects()).toThrow("object limit");
	expect(() => target.getBoundingClientRect()).toThrow("object limit");
});

it("charges toJSON records against the same object budget", () => {
	const { dom, target } = fixture();
	const rect = target.getBoundingClientRect();
	for (let index = 1; index < scriptGeometryLimits.maxObjects; index++)
		rect.toJSON();
	expect(dom.metrics().geometry.created).toBe(scriptGeometryLimits.maxObjects);
	expect(() => rect.toJSON()).toThrow("object limit");
});

it("caps a single list before allocating any guest rectangles", () => {
	const { dom, target } = fixture(
		"a ".repeat(scriptGeometryLimits.maxListLength + 1),
		6,
	);
	expect(() => target.getClientRects()).toThrow("list limit");
	expect(dom.metrics().geometry.created).toBe(0);
	expect(target.getBoundingClientRect().height).toBe(40_968);
});

it("revokes saved capabilities when the owning script document closes", () => {
	const { dom, tree, target } = fixture();
	const list = target.getClientRects();
	const rect = list.item(0) as Rect;
	dom.close();
	expect(() => list.length).toThrow("closed");
	expect(() => rect.width).toThrow("closed");
	expect(() => rect.toJSON()).toThrow("closed");
	expect(() => target.getClientRects()).toThrow("closed");
	expect(documentGeometry(tree).metrics().closed).toBe(false);
	tree.close();
	expect(documentGeometry(tree).metrics().closed).toBe(true);
});
