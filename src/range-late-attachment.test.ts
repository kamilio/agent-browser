import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree(
		"https://fixture.invalid/range-late-attachment",
	);
	trees.push(tree);
	const text = tree.createText("abcdef");
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, 2);
	range.setEnd(text, 5);
	const parent = tree.createElement("div");
	const prefix = tree.createComment("before");
	tree.append(parent, prefix);
	tree.append(parent, text);
	return { tree, text, owner, range, parent, prefix };
}

it("tracks the parent of a range whose detached text is attached later", () => {
	const { tree, text, range, parent } = fixture();
	tree.append(tree.root, parent);
	expect(range.toString()).toBe("cde");
	tree.remove(text);
	expect(range.start).toEqual({ node: parent, offset: 1 });
	expect(range.end).toEqual({ node: parent, offset: 1 });
});

it("tracks newly attached ancestor wrappers through later subtree removal", () => {
	const { tree, parent, range } = fixture();
	const outer = tree.createElement("section");
	const before = tree.createElement("aside");
	tree.append(outer, parent);
	tree.append(tree.root, before);
	tree.append(tree.root, outer);
	tree.remove(outer);
	expect(range.start).toEqual({ node: tree.root, offset: 1 });
	expect(range.end).toEqual({ node: tree.root, offset: 1 });
});

it("tracks replacement of a previously untracked detached parent", () => {
	const { tree, parent, range, text } = fixture();
	tree.setTextContent(parent, "replacement");
	expect(tree.get(text).parent).toBeNull();
	expect(range.start).toEqual({ node: parent, offset: 0 });
	expect(range.end).toEqual({ node: parent, offset: 0 });
});

it("retains the logical sibling index across later insertions and removal", () => {
	const { tree, parent, range, text } = fixture();
	tree.append(tree.root, parent);
	const another = tree.createComment("another");
	tree.insert(parent, another, text);
	tree.remove(text);
	expect(range.start).toEqual({ node: parent, offset: 2 });
	expect(range.end).toEqual({ node: parent, offset: 2 });
});
