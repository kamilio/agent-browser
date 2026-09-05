import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];

function fixture(start: number, end: number) {
	const tree = new DocumentTree(
		"https://fixture.invalid/character-data-ranges",
	);
	trees.push(tree);
	const parent = tree.createElement("p");
	const text = tree.createText("abcdef");
	tree.append(tree.root, parent);
	tree.append(parent, text);
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, start);
	range.setEnd(text, end);
	return { tree, text, owner, range };
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([
	{
		name: "append",
		offset: 6,
		count: 0,
		data: "XY",
		start: 2,
		end: 4,
		expectedStart: 2,
		expectedEnd: 4,
		result: "abcdefXY",
	},
	{
		name: "insert",
		offset: 2,
		count: 0,
		data: "XY",
		start: 2,
		end: 5,
		expectedStart: 2,
		expectedEnd: 7,
		result: "abXYcdef",
	},
	{
		name: "replace",
		offset: 2,
		count: 2,
		data: "XYZ",
		start: 1,
		end: 5,
		expectedStart: 1,
		expectedEnd: 6,
		result: "abXYZef",
	},
	{
		name: "delete",
		offset: 2,
		count: 3,
		data: "",
		start: 3,
		end: 6,
		expectedStart: 2,
		expectedEnd: 3,
		result: "abf",
	},
	{
		name: "equal-value replacement",
		offset: 2,
		count: 2,
		data: "cd",
		start: 3,
		end: 5,
		expectedStart: 2,
		expectedEnd: 5,
		result: "abcdef",
	},
	{
		name: "empty insertion",
		offset: 2,
		count: 0,
		data: "",
		start: 3,
		end: 5,
		expectedStart: 3,
		expectedEnd: 5,
		result: "abcdef",
	},
])("preserves exact live boundaries for direct $name", (input) => {
	const test = fixture(input.start, input.end);
	test.tree.replaceData(test.text, input.offset, input.count, input.data);
	expect(test.tree.get(test.text).data).toBe(input.result);
	expect(test.range.start).toEqual({
		node: test.text,
		offset: input.expectedStart,
	});
	expect(test.range.end).toEqual({
		node: test.text,
		offset: input.expectedEnd,
	});
});

it("retains whole-value replacement semantics instead of inferring an edit from equal strings", () => {
	const test = fixture(2, 4);
	test.tree.setData(test.text, "abcdef");
	expect(test.range.start).toEqual({ node: test.text, offset: 0 });
	expect(test.range.end).toEqual({ node: test.text, offset: 0 });
});

it("keeps the existing owner-mediated replacement path precise", () => {
	const test = fixture(1, 5);
	test.owner.replaceText(test.text, 2, 2, "XYZ");
	expect(test.range.start).toEqual({ node: test.text, offset: 1 });
	expect(test.range.end).toEqual({ node: test.text, offset: 6 });
});
