import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import type { ControlState } from "./document.js";

it("owns a document tree and preserves references across moves and state changes", () => {
	const tree = new DocumentTree("https://example.com");
	const body = tree.createElement("BODY");
	const button = tree.createElement("button", { id: "save" });
	const label = tree.createText("Save");
	tree.append(tree.root, body);
	tree.append(body, button);
	tree.append(button, label);
	const reference = tree.reference(button);
	const sibling = tree.createElement("div");
	tree.append(body, sibling);
	tree.append(sibling, button);
	tree.setAttribute(button, "aria-label", "Save changes");
	expect(tree.resolve(reference)).toMatchObject({
		tagName: "button",
		parent: sibling,
	});
	expect(tree.textContent(body)).toBe("Save");
	expect(tree.get(body).children).toEqual([sibling]);
	expect(tree.get(body).tagName).toBe("body");
});

it("rejects disconnected, foreign-document and closed references instead of reusing them", () => {
	const first = new DocumentTree("https://example.com");
	const second = new DocumentTree("https://example.org");
	const button = first.createElement("button");
	first.append(first.root, button);
	const reference = first.reference(button);
	expect(() => second.resolve(reference)).toThrow("no longer");
	first.remove(button);
	expect(() => first.resolve(reference)).toThrow("no longer");
	first.append(first.root, button);
	expect(first.resolve(reference).id).toBe(button);
	first.close();
	expect(first.nodeCount).toBe(0);
	expect(() => first.resolve(reference)).toThrow("closed");
	first.close();
});

it("rejects tree cycles and bad insertion references without partially moving nodes", () => {
	const tree = new DocumentTree("about:blank");
	const parent = tree.createElement("div");
	const child = tree.createElement("button");
	const other = tree.createElement("aside");
	tree.append(tree.root, parent);
	tree.append(parent, child);
	expect(() => tree.append(child, parent)).toThrow("cycles");
	expect(() => tree.insert(parent, child, other)).toThrow("not a child");
	expect(tree.get(child).parent).toBe(parent);
	expect(tree.get(parent).children).toEqual([child]);
	tree.insert(parent, child, child);
	expect(tree.get(parent).children).toEqual([child]);
});

it("uses immutable read views and supports attribute names without prototype pollution", () => {
	const tree = new DocumentTree("about:blank");
	const element = tree.createElement(
		"div",
		JSON.parse('{"__proto__":"data","TITLE":"test"}'),
	);
	expect(tree.get(element).attributes.__proto__).toBe("data");
	expect(tree.get(element).attributes.title).toBe("test");
	tree.setAttribute(element, "constructor", "plain attribute");
	expect(tree.get(element).attributes.constructor).toBe("plain attribute");
	expect(Object.isFrozen(tree.get(element).attributes)).toBe(true);
	expect(Object.isFrozen(tree.get(element).children)).toBe(true);
	tree.removeAttribute(element, "TITLE");
	expect(tree.get(element).attributes).not.toHaveProperty("title");
});

it("bounds nodes, text and subtree depth with atomic failures", () => {
	const small = new DocumentTree("about:blank", {
		maxNodes: 2,
		maxTextCodeUnits: 5,
	});
	const text = small.createText("12345");
	expect(() => small.createText("")).toThrow("node limit");
	expect(() => small.setData(text, "123456")).toThrow("text limit");
	expect(small.get(text).data).toBe("12345");
	small.setData(text, "1");
	small.setData(text, "12345");
	const shallow = new DocumentTree("about:blank", { maxDepth: 2 });
	const outer = shallow.createElement("div");
	const inner = shallow.createElement("div");
	const deep = shallow.createElement("div");
	shallow.append(shallow.root, outer);
	shallow.append(outer, inner);
	expect(() => shallow.append(inner, deep)).toThrow("depth limit");
	expect(shallow.get(deep).parent).toBeNull();
	const detached = shallow.createElement("div");
	shallow.append(detached, deep);
	expect(() => shallow.append(inner, detached)).toThrow("depth limit");
	expect(shallow.get(detached).parent).toBeNull();
});

it("keeps a bounded change journal and signals when a full snapshot is required", () => {
	const tree = new DocumentTree("about:blank", { maxChanges: 2 });
	const input = tree.createElement("input");
	tree.append(tree.root, input);
	const before = tree.revision;
	tree.setControl(input, { value: "typed", checked: true });
	tree.setAttribute(input, "disabled", "");
	expect(tree.changesSince(before)).toMatchObject({
		reset: false,
		changes: [
			{ kind: "control", target: input },
			{ kind: "attribute", target: input },
		],
	});
	expect(tree.changesSince(0).reset).toBe(true);
	expect(tree.changesSince(tree.revision).changes).toEqual([]);
	expect(() => tree.changesSince(tree.revision + 1)).toThrow(
		"Invalid document revision",
	);
});

it("does not count comment data as element text and supports ordered insertion", () => {
	const tree = new DocumentTree("about:blank");
	const first = tree.createText("first");
	const second = tree.createText("second");
	const comment = tree.createComment("hidden");
	tree.append(tree.root, second);
	tree.insert(tree.root, first, second);
	tree.append(tree.root, comment);
	expect(tree.textContent(tree.root)).toBe("firstsecond");
	tree.append(tree.root, first);
	expect(tree.textContent(tree.root)).toBe("secondfirst");
});

it("rejects invalid limits, names, ownership and node operations", () => {
	expect(() => new DocumentTree("about:blank", { maxNodes: 0 })).toThrow(
		"Invalid document limit",
	);
	const tree = new DocumentTree("about:blank");
	expect(() => tree.createElement("bad name")).toThrow("Invalid element name");
	expect(() => tree.createElement("div", { "bad name": "value" })).toThrow(
		"Invalid attribute name",
	);
	const element = tree.createElement("div");
	const text = tree.createText("text");
	expect(() => tree.append(text, element)).toThrow("Invalid tree parent");
	expect(() => tree.append(element, tree.root)).toThrow("Invalid tree parent");
	expect(() => tree.setData(element, "new")).toThrow("Only text");
	expect(() => tree.setControl(text, { value: "new" })).toThrow(
		"Expected an element",
	);
	expect(() => tree.resolve("@bad")).toThrow("Invalid element reference");
});

it("disposes derived resources exactly once and runs remaining cleanup after a failure", () => {
	const tree = new DocumentTree("about:blank");
	const calls: string[] = [];
	const unsubscribe = tree.onClose(() => calls.push("removed"));
	unsubscribe();
	tree.onClose(() => {
		calls.push("first");
		throw new Error("fixture failure");
	});
	tree.onClose(() => calls.push("second"));
	expect(() => tree.close()).toThrow("Document cleanup failed");
	expect(calls).toEqual(["first", "second"]);
	expect(tree.nodeCount).toBe(0);
	tree.close();
	expect(calls).toEqual(["first", "second"]);
	expect(() => tree.onClose(() => {})).toThrow("closed");
	const bounded = new DocumentTree("about:blank");
	for (let index = 0; index < 64; index++) bounded.onClose(() => {});
	expect(() => bounded.onClose(() => {})).toThrow("handler limit");
	bounded.close();
});

it("validates runtime mutation values before changing state or accounting", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 20 });
	const element = tree.createElement("input");
	tree.setControl(element, { value: "12345" });
	const revision = tree.revision;
	for (const state of [
		null,
		[],
		{ value: undefined },
		{ value: 1 },
		{ checked: "true" },
		{ other: "bad" },
	])
		expect(() =>
			tree.setControl(element, state as unknown as ControlState),
		).toThrow();
	expect(tree.get(element).control).toEqual({ value: "12345" });
	expect(tree.revision).toBe(revision);
	expect(() =>
		tree.setAttribute(element, "title", 42 as unknown as string),
	).toThrow("Expected a string");
	expect(() => tree.createText(null as unknown as string)).toThrow(
		"Expected a string",
	);
	expect(() =>
		tree.createElement("div", null as unknown as Record<string, string>),
	).toThrow("Invalid attributes");
	expect(() => tree.createElement(null as unknown as string)).toThrow(
		"Invalid element name",
	);
	expect(() => tree.setControl(element, { value: "a".repeat(16) })).toThrow(
		"text limit",
	);
	tree.setControl(element, { value: "a".repeat(15) });
	expect(tree.get(element).control.value).toHaveLength(15);
});
