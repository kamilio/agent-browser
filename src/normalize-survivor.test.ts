import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/normalize-survivor");
	trees.push(tree);
	const parent = tree.createElement("p");
	const empty = tree.createText("");
	const text = tree.createText("abcd");
	const tail = tree.createText("EF");
	tree.append(tree.root, parent);
	tree.append(parent, empty);
	tree.append(parent, text);
	tree.append(parent, tail);
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, 1);
	range.setEnd(text, 4);
	return { tree, parent, empty, text, tail, owner, range };
}

it("preserves survivor offsets through append and repeated empty append", () => {
	const { tree, parent, text, range } = fixture();
	tree.normalize(parent);
	expect(tree.get(parent).children).toEqual([text]);
	expect(tree.get(text).data).toBe("abcdEF");
	expect(range.start).toEqual({ node: text, offset: 1 });
	expect(range.end).toEqual({ node: text, offset: 4 });
	expect(range.toString()).toBe("bcd");
	const revision = tree.revision;
	tree.normalize(parent);
	expect(tree.revision).toBe(revision);
	expect(range.start).toEqual({ node: text, offset: 1 });
	expect(range.end).toEqual({ node: text, offset: 4 });
});

it("does not prepend a retained leading empty node edited after its removal", () => {
	const { tree, parent, empty, text, range } = fixture();
	tree.onMutation((record) => {
		if (record.type === "childList" && record.removedNodes[0] === empty)
			tree.setData(empty, "saved");
	});
	tree.normalize(parent);
	expect(tree.get(empty)).toMatchObject({ parent: null, data: "saved" });
	expect(tree.get(text).data).toBe("abcdEF");
	expect(tree.textContent(parent)).toBe("abcdEF");
	expect(range.start).toEqual({ node: text, offset: 1 });
	expect(range.end).toEqual({ node: text, offset: 4 });
	expect(range.toString()).toBe("bcd");
});

it("appends after newer survivor data from a preceding native removal hook", () => {
	const { tree, parent, empty, text, range } = fixture();
	tree.onMutation((record) => {
		if (record.type === "childList" && record.removedNodes[0] === empty)
			tree.replaceData(text, 1, 0, "XY");
	});
	tree.normalize(parent);
	expect(tree.get(text).data).toBe("aXYbcdEF");
	expect(range.start).toEqual({ node: text, offset: 1 });
	expect(range.end).toEqual({ node: text, offset: 6 });
	expect(range.toString()).toBe("XYbcd");
});
