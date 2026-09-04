import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

function hostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, {
			get: property.get,
			set: property.set,
		});
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	return result;
}

const trees: DocumentTree[] = [];
function fixture(createHostObject = hostObject) {
	const tree = parseHtmlDocument(
		"<p id=target>hello<b>wide</b>world</p><template>hidden</template>",
		"https://example.test/",
	);
	trees.push(tree);
	const dom = new ScriptDom(tree, { createHostObject });
	const document = dom.document as Document;
	const target = document.getElementById("target") as Element;
	return { tree, dom, document, target, text: target.firstChild as Text };
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("publishes stable selection, live range/node identities and readonly properties", () => {
	const { dom, document, target, text } = fixture();
	const range = document.createRange();
	range.selectNodeContents(target);
	expect(range.toString()).toBe("hellowideworld");
	expect(range.commonAncestorContainer).toBe(target);
	expect(range.START_TO_START).toBe(0);
	expect(range.END_TO_START).toBe(3);
	const selection = document.getSelection() as Selection;
	expect(dom.getSelection()).toBe(selection);
	expect(document.getSelection()).toBe(selection);
	selection.addRange(range);
	expect(selection.getRangeAt(0)).toBe(range);
	range.setStart(text, 2);
	expect(selection.anchorNode).toBe(text);
	expect(selection.anchorOffset).toBe(2);
	expect(selection.toString()).toBe("llowideworld");
	expect(Reflect.set(range, "startOffset", 100)).toBe(false);
	expect(range.startOffset).toBe(2);
});

it("publishes native-created selections back into script without duplicating owners", () => {
	const { tree, document, text } = fixture();
	const owner = domRangeOwner(tree);
	const node = [...tree.walk()].find(
		({ node }) => node.kind === "text" && node.data === "hello",
	)?.node;
	if (!node) throw new Error("Missing native text");
	owner.selection.setBaseAndExtent(node.id, 5, node.id, 1);
	const selection = document.getSelection() as Selection;
	expect(selection.anchorNode).toBe(text);
	expect(selection.focusOffset).toBe(1);
	expect(selection.toString()).toBe("ello");
	const range = selection.getRangeAt(0);
	expect(selection.getRangeAt(0)).toBe(range);
	range.setStart(text, 2);
	expect(owner.selection.focusOffset).toBe(2);
});

it("keeps page character data edits and split boundaries live", () => {
	const { document, text, target } = fixture();
	const range = document.createRange();
	range.setStart(text, 2);
	range.setEnd(text, 5);
	text.insertData(1, "!");
	expect(range.startOffset).toBe(3);
	expect(range.endOffset).toBe(6);
	text.replaceData(0, 2, "?");
	expect(range.startOffset).toBe(2);
	expect(range.endOffset).toBe(5);
	text.appendData("end");
	expect(range.endOffset).toBe(5);
	text.deleteData(0, 1);
	expect(range.startOffset).toBe(1);
	const suffix = text.splitText(2);
	expect(range.endContainer).toBe(suffix);
	expect(range.endOffset).toBe(2);
	expect(range.commonAncestorContainer).toBe(target);
	expect(range.toString()).toBe("llo");
});

it("publishes cloned/extracted fragments while preserving fully extracted node identity", () => {
	const { document, target, text } = fixture();
	const bold = target.children.item(0) as Element;
	const range = document.createRange();
	range.setStart(text, 2);
	range.setEnd(target.lastChild as Text, 3);
	const cloned = range.cloneContents();
	expect(cloned.textContent).toBe("llowidewor");
	const extracted = range.extractContents();
	expect(extracted.textContent).toBe("llowidewor");
	expect(extracted.firstChild?.nextSibling).toBe(bold);
	expect(target.textContent).toBe("held");
	expect(range.collapsed).toBe(true);
});

it("rejects foreign and forged capabilities and validates required arguments", () => {
	const { document, text } = fixture();
	const other = fixture();
	const range = document.createRange();
	expect(() => range.setStart(other.text, 0)).toThrow();
	expect(() => range.setStart({} as Node, 0)).toThrow();
	expect(() =>
		range.compareBoundaryPoints(0, other.document.createRange()),
	).toThrow();
	expect(() =>
		(document.getSelection() as Selection).addRange({} as Range),
	).toThrow();
	expect(() => Reflect.apply(range.setStart, range, [text])).toThrow(TypeError);
	expect(() =>
		Reflect.apply(range.setStart, range, [text, { valueOf: () => 1 }]),
	).toThrow("coercion");
	range.setStart(text, Number.NaN);
	expect(range.startOffset).toBe(0);
	expect(() => range.setEnd(text, -1)).toThrow(
		expect.objectContaining({ name: "IndexSizeError" }),
	);
});

it("preserves inert and template ownership and denies their document selection", () => {
	const { document } = fixture();
	const inert = document.implementation.createHTMLDocument("inert");
	expect(inert.getSelection()).toBe(null);
	const range = inert.createRange();
	range.selectNodeContents(inert.body);
	expect(range.startContainer).toBe(inert.body);
	expect(() => document.createRange().selectNodeContents(inert.body)).toThrow();
	const template = document.querySelector("template") as HTMLTemplateElement;
	const templateDocument = template.content.ownerDocument;
	expect(templateDocument.getSelection()).toBe(null);
	const templateRange = templateDocument.createRange();
	templateRange.selectNodeContents(template.content);
	expect(templateRange.toString()).toBe("hidden");
	expect(() =>
		document.createRange().selectNodeContents(template.content),
	).toThrow();
});

it("revokes script capabilities on binding close without closing the native editing owner", () => {
	const { tree, dom, document, text } = fixture();
	const range = document.createRange();
	range.selectNodeContents(text);
	const selection = document.getSelection() as Selection;
	selection.addRange(range);
	dom.close();
	expect(() => range.startOffset).toThrow("closed");
	expect(() => range.toString()).toThrow("closed");
	expect(() => selection.rangeCount).toThrow("closed");
	expect(() => dom.getSelection()).toThrow("closed");
	expect(domRangeOwner(tree).selection.toString()).toBe("hello");
	tree.close();
	expect(() => range.endContainer).toThrow("closed");
});

it("rejects early callbacks and reentrant selection publication but permits retry", () => {
	let fail = true;
	let leaked: ScriptHostObjectDefinition | undefined;
	const fixtureValue = fixture((definition) => {
		if (definition.properties?.rangeCount) {
			leaked = definition;
			expect(() => definition.properties?.rangeCount.get()).toThrow(
				"not published",
			);
			expect(() => document.getSelection()).toThrow("Reentrant");
			if (fail) {
				fail = false;
				throw new Error("publication failed");
			}
		}
		return hostObject(definition);
	});
	const document = fixtureValue.document;
	expect(() => document.getSelection()).toThrow("publication failed");
	const failed = leaked;
	expect(() => failed?.methods?.toString()).toThrow("not published");
	expect(document.getSelection()?.rangeCount).toBe(0);
	expect(() => failed?.methods?.toString()).toThrow("not published");
});

it("rejects factory identity reuse and close-during-publication", () => {
	let prior: object | undefined;
	const reused = fixture((definition) => {
		if (definition.properties?.startOffset && prior) return prior;
		const object = hostObject(definition);
		if (definition.properties?.startOffset) prior = object;
		return object;
	});
	const first = reused.document.createRange();
	expect(() => reused.document.createRange()).toThrow("already published");
	expect(first.startContainer).toBe(reused.document);
	const closing = fixture((definition) => {
		if (definition.properties?.startOffset) closing.dom.close();
		return hostObject(definition);
	});
	expect(() => closing.document.createRange()).toThrow("closed");
});
