import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];
function fixture() {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	const parent = tree.createElement("p");
	const text = tree.createText("hello world");
	tree.append(tree.root, parent);
	tree.append(parent, text);
	const owner = domRangeOwner(tree);
	return { tree, owner, selection: owner.selection, parent, text };
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("exposes empty selection state and errors", () => {
	const { selection, owner } = fixture();
	expect(selection.rangeCount).toBe(0);
	expect(selection.type).toBe("None");
	expect(selection.isCollapsed).toBe(true);
	expect(selection.anchorNode).toBe(null);
	expect(selection.focusOffset).toBe(0);
	expect(selection.toString()).toBe("");
	expect(() => selection.getRangeAt(0)).toThrow(
		expect.objectContaining({ name: "IndexSizeError" }),
	);
	expect(() => selection.collapseToStart()).toThrow(
		expect.objectContaining({ name: "InvalidStateError" }),
	);
	expect(() => selection.removeRange(owner.createRange())).toThrow(
		expect.objectContaining({ name: "NotFoundError" }),
	);
});

it("retains the exact added live range and ignores a second range", () => {
	const { owner, selection, text } = fixture();
	const range = owner.createRange();
	range.selectNodeContents(text);
	selection.addRange(range);
	selection.addRange(owner.createRange());
	expect(selection.getRangeAt(0)).toBe(range);
	range.setStart(text, 6);
	expect(selection.toString()).toBe("world");
	expect(selection.anchorOffset).toBe(6);
	selection.removeRange(range);
	expect(selection.rangeCount).toBe(0);
});

it("extends backwards and forwards while preserving anchor and replacing the range", () => {
	const { selection, text } = fixture();
	selection.collapse(text, 5);
	const original = selection.getRangeAt(0);
	selection.extend(text, 1);
	expect(selection.direction).toBe("backward");
	expect(selection.anchorOffset).toBe(5);
	expect(selection.focusOffset).toBe(1);
	expect(selection.toString()).toBe("ello");
	expect(original.collapsed).toBe(true);
	expect(selection.getRangeAt(0)).not.toBe(original);
	selection.extend(text, 8);
	expect(selection.direction).toBe("forward");
	expect(selection.anchorOffset).toBe(5);
	expect(selection.focusOffset).toBe(8);
	selection.collapseToEnd();
	expect(selection.type).toBe("Caret");
	expect(selection.focusOffset).toBe(8);
});

it("tracks native text editing, deletion, and subtree removal", () => {
	const { tree, owner, selection, parent, text } = fixture();
	selection.setBaseAndExtent(text, 11, text, 6);
	owner.replaceText(text, 0, 0, "!");
	expect(selection.anchorOffset).toBe(12);
	expect(selection.focusOffset).toBe(7);
	selection.deleteFromDocument();
	expect(tree.get(text).data).toBe("!hello ");
	expect(selection.isCollapsed).toBe(true);
	tree.remove(parent);
	expect(selection.anchor).toEqual({ node: tree.root, offset: 0 });
});

it("validates atomically and ignores detached selection targets", () => {
	const { tree, owner, selection, text } = fixture();
	selection.collapse(text, 3);
	const original = selection.getRangeAt(0);
	expect(() => selection.setBaseAndExtent(text, 2, text, 100)).toThrow();
	expect(selection.getRangeAt(0)).toBe(original);
	const detached = tree.createText("not selectable");
	selection.collapse(detached, 1);
	selection.extend(detached, 1);
	selection.selectAllChildren(detached);
	expect(selection.getRangeAt(0)).toBe(original);
	selection.removeAllRanges();
	const range = owner.createRange();
	range.selectNodeContents(detached);
	selection.addRange(range);
	expect(selection.rangeCount).toBe(0);
	const other = fixture();
	expect(() => selection.addRange(other.owner.createRange())).toThrow();
	selection.collapse(null);
	expect(selection.type).toBe("None");
});

it("selects children, tests containment and clears aliases", () => {
	const { selection, parent, text } = fixture();
	selection.selectAllChildren(parent);
	expect(selection.toString()).toBe("hello world");
	expect(selection.containsNode(text)).toBe(true);
	selection.setBaseAndExtent(text, 1, text, 2);
	expect(selection.containsNode(text)).toBe(false);
	expect(selection.containsNode(text, true)).toBe(true);
	selection.setPosition(text, 4);
	expect(selection.anchorOffset).toBe(4);
	selection.empty();
	expect(selection.type).toBe("None");
});

it("hides a selected range moved to a detached root by script and can extend it back", () => {
	const { tree, owner, selection, text } = fixture();
	const range = owner.createRange();
	range.selectNodeContents(text);
	selection.addRange(range);
	const detached = tree.createText("detached");
	range.selectNodeContents(detached);
	expect(selection.rangeCount).toBe(0);
	expect(selection.anchorNode).toBe(null);
	expect(selection.focusOffset).toBe(0);
	expect(selection.type).toBe("None");
	expect(() => selection.getRangeAt(0)).toThrow();
	selection.deleteFromDocument();
	expect(tree.get(detached).data).toBe("detached");
	selection.collapseToEnd();
	expect(selection.rangeCount).toBe(0);
	selection.extend(text, 4);
	expect(selection.rangeCount).toBe(1);
	expect(selection.focus).toEqual({ node: text, offset: 4 });
	expect(selection.isCollapsed).toBe(true);
});

it("selectAllChildren on character data selects no children rather than its data", () => {
	const { selection, text } = fixture();
	selection.selectAllChildren(text);
	expect(selection.isCollapsed).toBe(true);
	expect(selection.focusOffset).toBe(0);
	expect(selection.direction).toBe("forward");
});
