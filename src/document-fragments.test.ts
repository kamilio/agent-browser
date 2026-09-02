import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentQueries } from "./selectors.js";

it("moves fragment children in order without connecting the fragment", () => {
	const tree = new DocumentTree("https://example.com");
	const parent = tree.createElement("main");
	const tail = tree.createElement("footer");
	const fragment = tree.createFragment();
	const text = tree.createText("before");
	const child = tree.createElement("button", { id: "save" });
	tree.append(tree.root, parent);
	tree.append(parent, tail);
	tree.append(fragment, text);
	tree.append(fragment, child);
	const reference = tree.reference(child);
	expect(tree.isConnected(child)).toBe(false);
	tree.insert(parent, fragment, tail);
	expect(tree.get(parent).children).toEqual([text, child, tail]);
	expect(tree.get(fragment)).toMatchObject({
		kind: "fragment",
		parent: null,
		children: [],
	});
	expect(tree.isConnected(fragment)).toBe(false);
	expect(tree.resolve(reference).id).toBe(child);
	tree.append(parent, fragment);
	expect(tree.get(parent).children).toEqual([text, child, tail]);
});

it("supports fragment queries and invalidates their index after transfer", () => {
	const tree = new DocumentTree("https://example.com");
	const fragment = tree.createFragment();
	const child = tree.createElement("div", { id: "first" });
	const nested = tree.createElement("button");
	tree.append(child, nested);
	tree.append(fragment, child);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelector("#first", fragment)).toBe(child);
	expect(queries.querySelectorAll("div > button", fragment)).toEqual([nested]);
	expect(queries.querySelector(":root", fragment)).toBeNull();
	tree.append(tree.root, fragment);
	expect(queries.querySelectorAll("*", fragment)).toEqual([]);
	expect(queries.querySelector("#first")).toBe(child);
	queries.close();
});

it("supports fragment text content and fragment-to-fragment transfer", () => {
	const tree = new DocumentTree("https://example.com");
	const outer = tree.createFragment();
	const inner = tree.createFragment();
	tree.setTextContent(inner, "hello");
	tree.append(inner, tree.createComment("hidden"));
	tree.append(outer, inner);
	expect(tree.textContent(outer)).toBe("hello");
	expect(tree.get(inner).children).toEqual([]);
	expect(tree.get(outer).children).toHaveLength(2);
	tree.setTextContent(outer, "replacement");
	expect(tree.textContent(outer)).toBe("replacement");
});

it("preflights every fragment child before changing either tree", () => {
	const tree = new DocumentTree("https://example.com", { maxDepth: 3 });
	const parent = tree.createElement("main");
	const destination = tree.createElement("div");
	tree.append(tree.root, parent);
	tree.append(parent, destination);
	const fragment = tree.createFragment();
	const first = tree.createText("fits");
	const second = tree.createElement("section");
	tree.append(second, tree.createElement("span"));
	tree.append(fragment, first);
	tree.append(fragment, second);
	const revision = tree.revision;
	expect(() => tree.append(destination, fragment)).toThrow("depth limit");
	expect(tree.get(destination).children).toEqual([]);
	expect(tree.get(fragment).children).toEqual([first, second]);
	expect(tree.get(first).parent).toBe(fragment);
	expect(tree.revision).toBe(revision);
});

it("does not count a transferred fragment as an extra destination depth", () => {
	const tree = new DocumentTree("https://example.com", { maxDepth: 2 });
	const parent = tree.createElement("main");
	const fragment = tree.createFragment();
	const child = tree.createText("fits");
	tree.append(tree.root, parent);
	tree.append(fragment, child);
	tree.append(parent, fragment);
	expect(tree.get(child).parent).toBe(parent);
});

it("clears focus when an attached node moves into a fragment", () => {
	const tree = new DocumentTree("https://example.com");
	const button = tree.createElement("button");
	const fragment = tree.createFragment();
	tree.append(tree.root, button);
	tree.setActiveElement(button);
	tree.append(fragment, button);
	expect(tree.activeElement).toBeNull();
	tree.append(tree.root, fragment);
	expect(tree.activeElement).toBeNull();
});

it("transfers a large fragment without spreading unbounded function arguments", () => {
	const tree = new DocumentTree("https://example.com", {
		maxNodes: 150_002,
		maxTextCodeUnits: 200_000,
	});
	const fragment = tree.createFragment();
	for (let index = 0; index < 150_000; index++)
		tree.append(fragment, tree.createText("x"));
	tree.append(tree.root, fragment);
	expect(tree.get(tree.root).children).toHaveLength(150_000);
	expect(tree.get(fragment).children).toEqual([]);
	expect(tree.textContent(tree.root).length).toBe(150_000);
});

it("rejects fragment cycles, bad references, foreign nodes and text parents atomically", () => {
	const tree = new DocumentTree("https://example.com");
	const fragment = tree.createFragment();
	const child = tree.createElement("div");
	const text = tree.createText("text");
	tree.append(fragment, child);
	expect(() => tree.append(child, fragment)).toThrow("cycles");
	expect(() => tree.append(fragment, fragment)).toThrow("cycles");
	expect(() => tree.insert(tree.root, fragment, text)).toThrow("not a child");
	expect(() => tree.append(text, fragment)).toThrow("Invalid tree");
	const foreign = new DocumentTree("https://example.org").createFragment();
	expect(() => tree.append(fragment, foreign)).toThrow("Unknown");
	expect(tree.get(fragment).children).toEqual([child]);
});

it("clones attributes, text, comments and descendants into independent detached nodes", () => {
	const tree = new DocumentTree("https://example.com");
	const original = tree.createElement("section", { id: "original" });
	tree.setAttribute(original, "__proto__", "safe");
	const child = tree.createElement("b", { title: "child" });
	tree.append(child, tree.createText("hello"));
	tree.append(original, child);
	tree.append(original, tree.createComment("note"));
	tree.append(tree.root, original);
	const shallow = tree.clone(original);
	const copy = tree.clone(original, true);
	expect(tree.get(shallow).children).toEqual([]);
	expect(tree.get(copy).parent).toBe(null);
	expect(tree.isConnected(copy)).toBe(false);
	expect(tree.get(copy).attributes).toEqual(tree.get(original).attributes);
	expect(tree.textContent(copy)).toBe("hello");
	const [copiedChild, copiedComment] = tree.get(copy).children;
	expect(copiedChild).not.toBe(child);
	expect(tree.get(copiedComment)).toMatchObject({
		kind: "comment",
		data: "note",
	});
	tree.setAttribute(copiedChild, "title", "changed");
	tree.setTextContent(copiedChild, "copy only");
	expect(tree.get(child).attributes.title).toBe("child");
	expect(tree.textContent(original)).toBe("hello");
});

it("clones empty and populated fragments without transferring original children", () => {
	const tree = new DocumentTree("https://example.com");
	const fragment = tree.createFragment();
	const child = tree.createText("kept");
	tree.append(fragment, child);
	const shallow = tree.clone(fragment);
	const deep = tree.clone(fragment, true);
	expect(tree.get(shallow)).toMatchObject({ kind: "fragment", children: [] });
	expect(tree.textContent(deep)).toBe("kept");
	expect(tree.get(deep).children).not.toEqual([child]);
	expect(tree.get(fragment).children).toEqual([child]);
	tree.append(tree.root, deep);
	expect(tree.get(deep).children).toEqual([]);
	expect(tree.get(fragment).children).toEqual([child]);
});

it("copies stored native control state independently", () => {
	const tree = new DocumentTree("https://example.com");
	const original = tree.createElement("input", {
		type: "checkbox",
		value: "default",
	});
	tree.setControl(original, {
		value: "edited",
		checked: false,
		indeterminate: true,
	});
	const copy = tree.clone(original);
	expect(tree.get(copy).control).toEqual({
		value: "edited",
		checked: false,
		indeterminate: true,
	});
	tree.setControl(copy, { value: "copy", checked: true });
	expect(tree.get(original).control.value).toBe("edited");
	expect(tree.get(original).control.checked).toBe(false);
});

it("preflights clone node limits without allocating partial copies", () => {
	const tree = new DocumentTree("https://example.com", { maxNodes: 5 });
	const parent = tree.createElement("div");
	tree.append(parent, tree.createText("child"));
	tree.append(parent, tree.createComment("note"));
	const count = tree.nodeCount;
	const revision = tree.revision;
	expect(() => tree.clone(parent, true)).toThrow("node limit");
	expect(tree.nodeCount).toBe(count);
	expect(tree.revision).toBe(revision);
	expect(tree.get(tree.clone(parent)).tagName).toBe("div");
});

it("charges cloned attributes, character data and control values before allocation", () => {
	const tree = new DocumentTree("https://example.com", {
		maxTextCodeUnits: 38,
	});
	const parent = tree.createElement("input", { title: "abc" });
	tree.setControl(parent, { value: "1234567890" });
	expect(() => tree.clone(parent)).toThrow("text limit");
	expect(tree.nodeCount).toBe(2);
	tree.clearControl(parent, ["value"]);
	const clone = tree.clone(parent);
	expect(tree.get(clone).attributes.title).toBe("abc");
});

it("clones character nodes and rejects unsupported document cloning and closed access", () => {
	const tree = new DocumentTree("https://example.com");
	for (const original of [
		tree.createText("text"),
		tree.createComment("comment"),
	]) {
		const copy = tree.clone(original, true);
		expect(tree.get(copy)).toMatchObject({
			kind: tree.get(original).kind,
			data: tree.get(original).data,
			parent: null,
		});
	}
	expect(() => tree.clone(tree.root)).toThrow("Document cloning");
	tree.close();
	expect(() => tree.createFragment()).toThrow("closed");
	expect(() => tree.clone(tree.root)).toThrow("closed");
});
