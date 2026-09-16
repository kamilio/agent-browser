import { afterEach, expect, it } from "vitest";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function host(definition: ScriptHostObjectDefinition): object {
	const object = Object.create(null);
	for (const [key, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, key, {
			get: property.get,
			set: property.set,
		});
	for (const [key, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(object, key, { value: method });
	if (!definition.indexed) return object;
	const indexed = definition.indexed;
	Object.defineProperty(object, "length", { get: indexed.length });
	return new Proxy(object, {
		get: (target, key) =>
			typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)
				? indexed.get(Number(key))
				: Reflect.get(target, key),
	});
}
function fixture(createHostObject = host) {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0}main{font-size:8px;line-height:10px;width:18px}</style><main id="target">AB CD EF</main><template>hidden</template>',
		"https://fixture.invalid/script-range-geometry",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const dom = new ScriptDom(tree, { createHostObject });
	const document = dom.document as Document;
	const target = document.getElementById("target") as Element;
	const text = target.firstChild as Text;
	const range = document.createRange();
	range.selectNodeContents(text);
	return { tree, dom, document, target, text, range };
}

it("publishes actual Range methods with readonly snapshot rectangles and indexed lists", () => {
	const { range, text } = fixture();
	const list = range.getClientRects();
	expect(list.length).toBe(3);
	expect(list.item(0)).toBe(list[0]);
	expect(list.item(3)).toBeNull();
	expect(list[3]).toBeUndefined();
	expect(list[1]).toMatchObject({ x: 0, y: 11, width: 12, height: 8 });
	expect(Reflect.set(list[0], "width", 500)).toBe(false);
	expect(Reflect.set(list, "length", 500)).toBe(false);
	expect(list[0].toJSON()).toMatchObject({ width: 12, height: 8 });
	text.data = "A";
	expect(list.length).toBe(3);
	expect(list[0].width).toBe(12);
	range.selectNodeContents(text);
	expect(range.getBoundingClientRect().width).toBe(6);
});

it("uses live boundaries after character-data mutation and splitText", () => {
	const { range, text, target } = fixture();
	target.setAttribute("style", "width:200px");
	range.setStart(text, 1);
	range.setEnd(text, 4);
	text.insertData(0, "XX");
	expect(range.startOffset).toBe(3);
	expect(range.getBoundingClientRect()).toMatchObject({ x: 18, width: 18 });
	const suffix = text.splitText(4);
	expect(range.endContainer).toBe(suffix);
	expect(range.getClientRects()).toHaveLength(2);
});

it("returns empty snapshots for inert and detached document ranges", () => {
	const { document, range } = fixture();
	const detached = document.createTextNode("detached");
	range.selectNodeContents(detached);
	expect(range.getClientRects().length).toBe(0);
	expect(range.getBoundingClientRect()).toMatchObject({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
	const inert = document.implementation.createHTMLDocument("inert");
	inert.body.textContent = "inert";
	const inertRange = inert.createRange();
	inertRange.selectNodeContents(inert.body);
	expect(inertRange.getClientRects().length).toBe(0);
});

it("revokes saved range, list, rect and serialization callbacks on close", () => {
	const { dom, range } = fixture();
	const list = range.getClientRects();
	const rect = list[0];
	const read = range.getBoundingClientRect;
	const item = list.item;
	const serialize = rect.toJSON;
	dom.close();
	for (const call of [
		() => read(),
		() => list.length,
		() => item(0),
		() => rect.x,
		() => serialize(),
	])
		expect(call).toThrow(expect.objectContaining({ code: "closed" }));
});

it("revokes geometry when the native document owner closes", () => {
	const { tree, range } = fixture();
	const rect = range.getBoundingClientRect();
	tree.close();
	expect(() => rect.width).toThrow(expect.objectContaining({ code: "closed" }));
});

it("validates list indexing without guest object coercion", () => {
	const { range } = fixture();
	const list = range.getClientRects();
	expect(() => Reflect.apply(list.item, list, [])).toThrow(TypeError);
	expect(() => Reflect.apply(list.item, list, [{ valueOf: () => 0 }])).toThrow(
		"coercion",
	);
	expect(list.item(-1)).toBeNull();
	expect(list.item(Number.NaN)).toBe(list[0]);
});

it("rejects premature factory callbacks for newly published geometry", () => {
	let armed = false;
	const { range } = fixture((definition) => {
		if (armed && definition.properties?.x)
			expect(() => definition.properties?.x.get()).toThrow("not published");
		return host(definition);
	});
	armed = true;
	expect(range.getBoundingClientRect().width).toBe(12);
});

it("bounds publication without weakening the owner after exhaustion", () => {
	const { document } = fixture();
	const range = document.createRange();
	for (let count = 0; count < 16_384; count++) range.getBoundingClientRect();
	expect(() => range.getBoundingClientRect()).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(range.collapsed).toBe(true);
});

it("publishes source-mapped preserved breaks rather than a zero rect", () => {
	const { range, text, target } = fixture();
	target.setAttribute("style", "white-space:pre-wrap");
	text.data = "A\nB";
	range.selectNodeContents(text);
	expect(range.getClientRects().length).toBe(2);
	expect(range.getBoundingClientRect()).toMatchObject({
		x: 0,
		y: 1,
		width: 6,
		height: 18,
	});
});

it("publishes preserved pre-wrap spaces and glyph-backed collapsed boundaries", () => {
	const { range, text, target } = fixture();
	target.setAttribute("style", "white-space:pre-wrap;width:18px");
	text.data = "AB CD";
	range.selectNodeContents(text);
	expect(range.getClientRects()[0]).toMatchObject({
		x: 0,
		width: 18,
		height: 8,
	});
	range.setStart(text, 1);
	range.collapse(true);
	expect(range.getBoundingClientRect()).toMatchObject({
		x: 6,
		width: 0,
		height: 8,
	});
});

it("publishes boxless hidden text without masking unsupported visible layout", () => {
	const { range, target } = fixture();
	target.setAttribute("style", "display:none");
	expect(range.getClientRects().length).toBe(0);
	target.setAttribute("style", "position:sticky;align-content:baseline");
	expect(() => range.getClientRects()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => range.getBoundingClientRect()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	target.removeAttribute("style");
	expect(range.getClientRects().length).toBe(3);
	expect(range.getBoundingClientRect()).toMatchObject({
		x: 0,
		y: 1,
		width: 12,
		height: 28,
	});
});

it("keeps fixed published rectangles stable while ordinary rectangles scroll", () => {
	const { tree, document, range, target } = fixture();
	document.body.setAttribute("style", "height:400px;width:400px");
	target.setAttribute("style", "position:fixed;top:30px;left:50px;width:100px");
	const fixed = range.getBoundingClientRect();
	documentScroll(tree).to(20, 40);
	expect(range.getBoundingClientRect().toJSON()).toEqual(fixed.toJSON());
	target.setAttribute("style", "width:100px");
	expect(range.getBoundingClientRect()).toMatchObject({ x: -20, y: -39 });
});
