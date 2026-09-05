import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/split-text-range");
	trees.push(tree);
	const parent = tree.createElement("div");
	const text = tree.createText("abcdef");
	tree.append(tree.root, parent);
	tree.append(parent, text);
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, 4);
	range.setEnd(text, 6);
	return { tree, parent, text, owner, range };
}

it.each(["native", "owner"] as const)(
	"%s split retains listener edits to the newly selected original prefix",
	(route) => {
		const { tree, text, owner, range } = fixture();
		let calls = 0;
		tree.onMutation((record) => {
			if (record.type !== "childList" || calls++) return;
			range.setStart(text, 1);
			range.setEnd(text, 2);
			tree.replaceData(text, 1, 0, "XY");
		});
		const following =
			route === "native" ? tree.splitText(text, 2) : owner.splitText(text, 2);
		expect(tree.get(text).data).toBe("aXYb");
		expect(tree.get(following).data).toBe("cdef");
		expect(range.start).toEqual({ node: text, offset: 1 });
		expect(range.end).toEqual({ node: text, offset: 4 });
		expect(range.toString()).toBe("XYb");
		expect(calls).toBe(1);
	},
);

it.each(["native", "owner"] as const)(
	"%s split transfers before listener mutation of the suffix",
	(route) => {
		const { tree, text, owner, range } = fixture();
		let observed: unknown;
		tree.onMutation((record) => {
			if (record.type !== "childList") return;
			const following = record.addedNodes[0];
			observed = { start: range.start, end: range.end };
			tree.replaceData(following, 0, 1, "XYZ");
		});
		const following =
			route === "native" ? tree.splitText(text, 2) : owner.splitText(text, 2);
		expect(observed).toEqual({
			start: { node: following, offset: 2 },
			end: { node: following, offset: 4 },
		});
		expect(range.start).toEqual({ node: following, offset: 4 });
		expect(range.end).toEqual({ node: following, offset: 6 });
		expect(range.toString()).toBe("ef");
	},
);

it.each(["native", "owner"] as const)(
	"%s split retains nested native split transfers without snapshot restoration",
	(route) => {
		const { tree, parent, text, owner, range } = fixture();
		let nested: number | undefined;
		let entered = false;
		tree.onMutation((record) => {
			if (record.type !== "childList" || entered) return;
			entered = true;
			nested = tree.splitText(record.addedNodes[0], 1);
		});
		const following =
			route === "native" ? tree.splitText(text, 2) : owner.splitText(text, 2);
		expect(tree.get(parent).children).toEqual([text, following, nested]);
		expect(range.start).toEqual({ node: nested, offset: 1 });
		expect(range.end).toEqual({ node: nested, offset: 3 });
		expect(range.toString()).toBe("ef");
	},
);

it.each(["native", "owner"] as const)(
	"%s split does not revive a tail removed by a native listener",
	(route) => {
		const { tree, parent, text, owner, range } = fixture();
		let entered = false;
		tree.onMutation((record) => {
			if (record.type !== "childList" || entered) return;
			entered = true;
			tree.remove(record.addedNodes[0]);
		});
		const following =
			route === "native" ? tree.splitText(text, 2) : owner.splitText(text, 2);
		expect(tree.get(following).parent).toBeNull();
		expect(range.start).toEqual({ node: parent, offset: 1 });
		expect(range.end).toEqual({ node: parent, offset: 1 });
	},
);

it.each(["native", "owner"] as const)(
	"%s split transfers a range registered before its parent was attached",
	(route) => {
		const tree = new DocumentTree(
			"https://fixture.invalid/split-attached-late",
		);
		trees.push(tree);
		const text = tree.createText("abcdef");
		const owner = domRangeOwner(tree);
		const range = owner.createRange();
		range.setStart(text, 4);
		range.setEnd(text, 6);
		const parent = tree.createElement("p");
		tree.append(parent, text);
		tree.append(tree.root, parent);
		const following =
			route === "native" ? tree.splitText(text, 2) : owner.splitText(text, 2);
		expect(range.start).toEqual({ node: following, offset: 2 });
		expect(range.end).toEqual({ node: following, offset: 4 });
		tree.remove(following);
		expect(range.start).toEqual({ node: parent, offset: 1 });
		expect(range.end).toEqual({ node: parent, offset: 1 });
	},
);
