import { afterEach, expect, it, vi } from "vitest";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function fixture() {
	const tree = parseHtmlDocument(
		'<main><div contenteditable="true">hello <b>world</b></div></main>',
		"https://example.com/",
	);
	cleanups.push(() => tree.close());
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, {
					get: property.get,
					set: property.set,
				});
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: (callback, args, options) => {
			if (typeof callback !== "function")
				throw new Error("Expected native callback fixture");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(callback.apply(options.thisValue, args)),
			};
		},
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	const bindings = new PageBindings(
		{ document: tree, interactions: new DocumentInteractions(tree) },
		context,
		lifecycle,
	);
	cleanups.push(() => bindings.close());
	const document = bindings.dom.document as Document;
	const window = bindings.window as Window;
	const editor = document.querySelector("div") as HTMLElement;
	return { tree, bindings, document, window, editor };
}

it("shares one Selection across document, Window and unqualified global calls", () => {
	const { tree, bindings, document, window, editor } = fixture();
	expect(pageBindingGlobalNames(tree)).toContain("getSelection");
	expect(bindings.globals.getSelection).toBe(window.getSelection);
	const detached = window.getSelection;
	const selection = detached() as Selection;
	expect(selection).toBe(document.getSelection());
	const range = document.createRange();
	range.selectNodeContents(editor);
	selection.addRange(range);
	expect(window.getSelection()?.getRangeAt(0)).toBe(range);
	expect(selection.toString()).toBe("hello world");
	range.setEnd(editor.firstChild as Text, 2);
	expect(selection.toString()).toBe("he");
});

it("publishes native-owned selection changes through the same guest objects", () => {
	const { tree, window, editor } = fixture();
	const owner = domRangeOwner(tree);
	const text = editor.firstChild as Text;
	const textNode = [...tree.walk()].find(
		({ node }) => node.kind === "text" && node.data === "hello ",
	)?.node;
	if (!textNode) throw new Error("Missing native text");
	const textId = textNode.id;
	owner.selection.collapse(textId, 1);
	const selection = window.getSelection() as Selection;
	const range = selection.getRangeAt(0);
	expect(selection.anchorNode).toBe(text);
	expect(selection.anchorOffset).toBe(1);
	owner.selection.extend(textId, 4);
	expect(selection.toString()).toBe("ell");
	text.insertData(0, "!");
	expect(selection.anchorOffset).toBe(2);
	expect(selection.focusOffset).toBe(5);
	expect(selection.getRangeAt(0)).not.toBe(range);
	expect(selection.getRangeAt(0)).toBe(selection.getRangeAt(0));
});

it("does not confuse auxiliary document selections with the active page", () => {
	const { document, window } = fixture();
	const auxiliary = document.implementation.createHTMLDocument("Detached");
	expect(auxiliary.getSelection()).toBeNull();
	expect(auxiliary.createRange().startContainer).toBe(auxiliary);
	expect(window.getSelection()).toBe(document.getSelection());
});

it("rejects retained page selection capabilities after bindings close without closing the tree owner", () => {
	const { tree, bindings, document, window, editor } = fixture();
	const getSelection = window.getSelection;
	const selection = getSelection() as Selection;
	const range = document.createRange();
	range.selectNodeContents(editor);
	selection.addRange(range);
	bindings.close();
	expect(() => getSelection()).toThrow(/closed/);
	expect(() => selection.toString()).toThrow(/closed/);
	expect(() => range.toString()).toThrow(/closed/);
	expect(domRangeOwner(tree).selection.toString()).toBe("hello world");
});

it("rejects foreign page ranges and closes Window lookup with the document", () => {
	const first = fixture();
	const second = fixture();
	const selection = first.window.getSelection() as Selection;
	expect(() => selection.addRange(second.document.createRange())).toThrow();
	first.tree.close();
	expect(() => first.window.getSelection()).toThrow(/closed/);
});
