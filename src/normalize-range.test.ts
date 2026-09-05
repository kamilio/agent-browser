import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/normalize-range");
	trees.push(tree);
	const parent = tree.createElement("p");
	const original = tree.createText("ab");
	const following = tree.createText("cd");
	const empty = tree.createText("");
	const last = tree.createText("EF");
	tree.append(tree.root, parent);
	for (const text of [original, following, empty, last])
		tree.append(parent, text);
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(following, 1);
	range.setEnd(last, 1);
	return { tree, parent, original, following, empty, last, owner, range };
}

it("transfers following text points without extending or collapsing content", () => {
	const { tree, parent, original, range } = fixture();
	tree.normalize(parent);
	expect(range.start).toEqual({ node: original, offset: 3 });
	expect(range.end).toEqual({ node: original, offset: 5 });
	expect(range.toString()).toBe("dE");
});

it("transfers parent-before-member points but keeps the after-run boundary", () => {
	const { tree, parent, original, owner } = fixture();
	const range = owner.createRange();
	range.setStart(parent, 2);
	range.setEnd(parent, 4);
	tree.normalize(parent);
	expect(range.start).toEqual({ node: original, offset: 4 });
	expect(range.end).toEqual({ node: parent, offset: 1 });
	expect(range.toString()).toBe("EF");
});

it("tracks the formerly untracked survivor for later ancestor removal", () => {
	const { tree, parent, original, range } = fixture();
	tree.normalize(parent);
	expect(range.start.node).toBe(original);
	tree.remove(parent);
	expect(range.start).toEqual({ node: tree.root, offset: 0 });
	expect(range.end).toEqual({ node: tree.root, offset: 0 });
});

it("transfers before a later native append-record listener edits the survivor", () => {
	const { tree, parent, original, range } = fixture();
	let observed: unknown;
	let entered = false;
	tree.onMutation((record) => {
		if (
			record.type !== "characterData" ||
			record.target !== original ||
			entered
		)
			return;
		entered = true;
		observed = { start: range.start, end: range.end };
		tree.replaceData(original, 1, 0, "XY");
	});
	tree.normalize(parent);
	expect(observed).toEqual({
		start: { node: original, offset: 3 },
		end: { node: original, offset: 5 },
	});
	expect(tree.get(original).data).toBe("aXYbcdEF");
	expect(range.start).toEqual({ node: original, offset: 5 });
	expect(range.end).toEqual({ node: original, offset: 7 });
	expect(range.toString()).toBe("dE");
});

it("does not follow later edits of the retained detached member copy", () => {
	const { tree, parent, original, following, range } = fixture();
	tree.onMutation((record) => {
		if (record.type === "characterData" && record.target === original)
			tree.setData(following, "saved detached data");
	});
	tree.normalize(parent);
	expect(tree.get(following)).toMatchObject({
		parent: null,
		data: "saved detached data",
	});
	expect(tree.get(original).data).toBe("abcdEF");
	expect(range.start).toEqual({ node: original, offset: 3 });
	expect(range.end).toEqual({ node: original, offset: 5 });
});

it("retains ancestor removal performed by a later native append-record listener", () => {
	const { tree, parent, original, range } = fixture();
	tree.onMutation((record) => {
		if (record.type === "characterData" && record.target === original)
			tree.remove(parent);
	});
	tree.normalize(parent);
	expect(range.start).toEqual({ node: tree.root, offset: 0 });
	expect(range.end).toEqual({ node: tree.root, offset: 0 });
});
