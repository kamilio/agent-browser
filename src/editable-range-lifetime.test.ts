import { afterEach, expect, it, vi } from "vitest";
import { type DomRange, domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";

const trees: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(markup: string, retainedCount: number) {
	const tree = parseHtmlDocument(
		`<div id="editor" contenteditable>${markup}</div>`,
		"https://fixture.invalid/editable-range-lifetime",
	);
	trees.push(tree);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	owner.selection.collapse(editor, 0);
	const selected = owner.selection.getRangeAt(0);
	const retained: DomRange[] = [];
	for (let index = 0; index < retainedCount; index++)
		retained.push(owner.createRange());
	return { tree, editor, actions, owner, selected, retained };
}

it("releases private replacement ranges before the next inline edit", () => {
	const { tree, editor, actions, owner, selected, retained } = fixture(
		"<b>aa</b><i>bb</i>",
		4092,
	);
	const [bold, italic] = tree.get(editor).children;
	const first = tree.get(bold).children[0];
	const last = tree.get(italic).children[0];
	for (let iteration = 0; iteration < 3; iteration++) {
		selected.setStart(first, 1);
		selected.setEnd(last, 1);
		actions.keyboard.type("x");
		expect(tree.textContent(editor)).toBe("axb");
		expect(owner.selection.getRangeAt(0)).toBe(selected);
		tree.setData(first, "aa");
		tree.setData(last, "bb");
	}
	expect(retained).toHaveLength(4092);
	expect(() => owner.createRange()).not.toThrow();
});

it("releases the paragraph caret range before the next Enter", () => {
	const { tree, editor, actions, owner, selected, retained } = fixture(
		"<p>one</p>",
		4094,
	);
	const paragraph = tree.get(editor).children[0];
	const text = tree.get(paragraph).children[0];
	selected.setStart(text, 3);
	selected.collapse(true);
	for (let iteration = 0; iteration < 3; iteration++) {
		actions.keyboard.press("Enter");
		expect(owner.selection.getRangeAt(0)).toBe(selected);
	}
	expect(tree.get(editor).children).toHaveLength(4);
	expect(tree.textContent(editor)).toBe("one");
	expect(retained).toHaveLength(4094);
	expect(() => owner.createRange()).not.toThrow();
});

it.each(["deleteContents", "extractContents"] as const)(
	"releases the private collapse range after native %s",
	(method) => {
		const { tree, editor, owner, selected, retained } = fixture(
			"<b>aa</b><i>bb</i>",
			4094,
		);
		const [bold, italic] = tree.get(editor).children;
		const first = tree.get(bold).children[0];
		const last = tree.get(italic).children[0];
		for (let iteration = 0; iteration < 3; iteration++) {
			selected.setStart(first, 1);
			selected.setEnd(last, 1);
			const fragment = selected[method]();
			if (fragment !== undefined) expect(tree.textContent(fragment)).toBe("ab");
			expect(tree.textContent(editor)).toBe("ab");
			expect(selected.collapsed).toBe(true);
			tree.setData(first, "aa");
			tree.setData(last, "bb");
		}
		expect(retained).toHaveLength(4094);
		expect(() => owner.createRange()).not.toThrow();
	},
);

it("cleans all private replacement ranges when a native mutation throws", () => {
	const { tree, editor, actions, owner, selected, retained } = fixture(
		"<b>aa</b><i>bb</i>",
		4092,
	);
	selected.selectNodeContents(editor);
	vi.spyOn(tree, "remove").mockImplementationOnce(() => {
		throw new Error("injected removal failure");
	});
	expect(() => actions.keyboard.type("x")).toThrow("injected removal failure");
	expect(tree.textContent(editor)).toBe("aabb");
	expect(owner.selection.getRangeAt(0)).toBe(selected);
	actions.keyboard.type("x");
	expect(tree.textContent(editor)).toBe("x");
	expect(retained).toHaveLength(4092);
	expect(() => owner.createRange()).not.toThrow();
});

it("cleans a private paragraph caret when element allocation throws", () => {
	const { tree, editor, actions, owner, selected, retained } = fixture(
		"<p>one</p>",
		4094,
	);
	const text = tree.get(tree.get(editor).children[0]).children[0];
	selected.setStart(text, 3);
	selected.collapse(true);
	vi.spyOn(tree, "createElement").mockImplementationOnce(() => {
		throw new Error("injected allocation failure");
	});
	expect(() => actions.keyboard.press("Enter")).toThrow(
		"injected allocation failure",
	);
	expect(tree.get(editor).children).toHaveLength(1);
	actions.keyboard.press("Enter");
	expect(tree.get(editor).children).toHaveLength(2);
	expect(owner.selection.getRangeAt(0)).toBe(selected);
	expect(retained).toHaveLength(4094);
	expect(() => owner.createRange()).not.toThrow();
});

it("releases an outer temporary range when nested capacity is unavailable", () => {
	const { tree, editor, actions, owner, selected, retained } = fixture(
		"<b>aa</b><i>bb</i>",
		4094,
	);
	selected.selectNodeContents(editor);
	expect(() => actions.keyboard.type("x")).toThrow("live range limit");
	expect(tree.textContent(editor)).toBe("aabb");
	expect(retained).toHaveLength(4094);
	expect(() => owner.createRange()).not.toThrow();
});

it("keeps public detach a no-op without recycling a still-live public Range", () => {
	const { owner, selected, retained } = fixture("text", 4095);
	selected.detach();
	expect(owner.selection.getRangeAt(0)).toBe(selected);
	expect(retained).toHaveLength(4095);
	expect(() => owner.createRange()).toThrow("live range limit");
});

it("does not reopen the owner during temporary-scope teardown after close", () => {
	const { owner, selected } = fixture("text", 0);
	owner.withTemporaryRange(selected, (temporary) => {
		expect(temporary.start).toEqual(selected.start);
		owner.close();
	});
	expect(() => owner.createRange()).toThrow("closed");
});
