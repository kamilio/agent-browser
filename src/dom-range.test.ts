import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";

const trees: DocumentTree[] = [];
function fixture() {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	const parent = tree.createElement("div");
	const first = tree.createText("hello");
	const middle = tree.createElement("b");
	const inner = tree.createText("wide");
	const last = tree.createText("world");
	tree.append(tree.root, parent);
	tree.append(parent, first);
	tree.append(parent, middle);
	tree.append(middle, inner);
	tree.append(parent, last);
	const owner = domRangeOwner(tree);
	return {
		tree,
		owner,
		parent,
		first,
		middle,
		inner,
		last,
		range: owner.createRange(),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("defaults to document zero, selects UTF-16 text and finds common ancestors", () => {
	const { tree, range, first, last, parent } = fixture();
	expect(range.start).toEqual({ node: tree.root, offset: 0 });
	expect(range.collapsed).toBe(true);
	range.setStart(first, 2);
	range.setEnd(last, 3);
	expect(range.toString()).toBe("llowidewor");
	expect(range.commonAncestorContainer).toBe(parent);
	range.collapse();
	expect(range.start).toEqual({ node: last, offset: 3 });
	tree.setData(first, "a😀b");
	range.setStart(first, 1);
	range.setEnd(first, 3);
	expect(range.toString()).toBe("😀");
});

it("collapses crossing boundaries and moves to a detached root without crossing documents", () => {
	const { tree, range, first, last } = fixture();
	range.selectNodeContents(first);
	range.setStart(last, 2);
	expect(range.end).toEqual({ node: last, offset: 2 });
	range.setEnd(first, 1);
	expect(range.start).toEqual({ node: first, offset: 1 });
	const detached = tree.createText("detached");
	range.setEnd(detached, 3);
	expect(range.start).toEqual({ node: detached, offset: 3 });
	expect(() => range.setStart(first, 6)).toThrow(
		expect.objectContaining({ name: "IndexSizeError" }),
	);
	expect(() => range.setStart(first, -1)).toThrow();
	expect(() => range.setStart(first, 0.5)).toThrow();
	const other = fixture();
	expect(() => range.setStart(other.first, 0)).toThrow();
	expect(() => range.compareBoundaryPoints(0, other.range)).toThrow(
		expect.objectContaining({ name: "WrongDocumentError" }),
	);
});

it("selects nodes and contents, rejects parentless adjacency, and clones independently", () => {
	const { tree, range, middle, parent, inner } = fixture();
	range.selectNode(middle);
	expect(range.start).toEqual({ node: parent, offset: 1 });
	expect(range.end).toEqual({ node: parent, offset: 2 });
	expect(range.toString()).toBe("wide");
	const clone = range.cloneRange();
	range.selectNodeContents(inner);
	expect(clone.startContainer).toBe(parent);
	range.setStartBefore(middle);
	range.setEndAfter(middle);
	expect(range.toString()).toBe("wide");
	range.detach();
	expect(range.toString()).toBe("wide");
	expect(() => range.selectNode(tree.root)).toThrow(
		expect.objectContaining({ name: "InvalidNodeTypeError" }),
	);
});

it("orders every boundary comparison mode and ancestor offsets", () => {
	const { owner, range, first, parent, inner, last } = fixture();
	range.setStart(first, 1);
	range.setEnd(last, 2);
	const nested = owner.createRange();
	nested.selectNodeContents(inner);
	expect(
		[0, 1, 2, 3].map((mode) => range.compareBoundaryPoints(mode, nested)),
	).toEqual([-1, 1, 1, -1]);
	expect(range.compareBoundaryPoints(0, range)).toBe(0);
	expect(() => range.compareBoundaryPoints(4, nested)).toThrow(
		expect.objectContaining({ name: "NotSupportedError" }),
	);
	expect(
		owner.compare({ node: parent, offset: 0 }, { node: first, offset: 0 }),
	).toBe(-1);
	expect(
		owner.compare({ node: parent, offset: 1 }, { node: first, offset: 5 }),
	).toBe(1);
	expect(range.comparePoint(first, 0)).toBe(-1);
	expect(range.comparePoint(inner, 2)).toBe(0);
	expect(range.comparePoint(last, 4)).toBe(1);
	expect(range.isPointInRange(first, 1)).toBe(true);
});

it("tracks insertion affinity, descendant removals, moves, replacements and fragment insertion", () => {
	const { tree, owner, range, parent, middle, inner, last } = fixture();
	range.setStart(parent, 1);
	range.setEnd(parent, 3);
	const textRange = owner.createRange();
	textRange.selectNodeContents(inner);
	const inserted = tree.createText("insert");
	tree.insert(parent, inserted, middle);
	expect(range.startOffset).toBe(1);
	expect(range.endOffset).toBe(4);
	tree.remove(middle);
	expect(textRange.start).toEqual({ node: parent, offset: 2 });
	expect(textRange.collapsed).toBe(true);
	expect(range.endOffset).toBe(3);
	tree.insert(parent, last, inserted);
	expect(range.endOffset).toBe(3);
	const fragment = tree.createFragment();
	tree.append(fragment, tree.createText("one"));
	tree.append(fragment, tree.createText("two"));
	tree.replace(parent, fragment, inserted);
	expect(range.endOffset).toBe(2);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("relocates bulk removed descendants and maps old parent offsets before insertion", () => {
	const { tree, owner, range, parent, first, last, inner } = fixture();
	range.setStart(first, 3);
	range.setEnd(last, 2);
	const between = owner.createRange();
	between.setStart(parent, 2);
	between.setEnd(parent, 3);
	const nested = owner.createRange();
	nested.selectNodeContents(inner);
	tree.setTextContent(parent, "new");
	for (const current of [range, between, nested]) {
		expect(current.start).toEqual({ node: parent, offset: 0 });
		expect(current.collapsed).toBe(true);
	}
});

it("observes whole-data replacement even when the data string is unchanged", () => {
	const { tree, range, first } = fixture();
	range.setStart(first, 2);
	range.setEnd(first, 4);
	tree.setData(first, "hello");
	expect(range.startOffset).toBe(0);
	expect(range.endOffset).toBe(0);
});

it("keeps exact partial-edit offsets using the reusable owner", () => {
	const { owner, range, first, tree } = fixture();
	range.setStart(first, 2);
	range.setEnd(first, 5);
	owner.replaceText(first, 1, 2, "abcd");
	expect(tree.get(first).data).toBe("habcdlo");
	expect(range.startOffset).toBe(1);
	expect(range.endOffset).toBe(7);
	owner.replaceText(first, 1, 0, "!");
	expect(range.startOffset).toBe(1);
	expect(range.endOffset).toBe(8);
	owner.replaceText(first, 3, 99, "");
	expect(range.endOffset).toBe(3);
});

it("splits attached text, including the parent boundary immediately after it", () => {
	const { owner, range, first, parent } = fixture();
	range.setStart(first, 2);
	range.setEnd(first, 5);
	const after = owner.createRange();
	after.setStart(parent, 1);
	after.collapse(true);
	const suffix = owner.splitText(first, 3);
	expect(range.start).toEqual({ node: first, offset: 2 });
	expect(range.end).toEqual({ node: suffix, offset: 2 });
	expect(range.toString()).toBe("llo");
	expect(after.start).toEqual({ node: parent, offset: 2 });
});

it("clamps rather than transfers endpoints when detached text is split", () => {
	const { tree, owner, range } = fixture();
	const text = tree.createText("abcde");
	range.setStart(text, 1);
	range.setEnd(text, 4);
	owner.splitText(text, 2);
	expect(range.end).toEqual({ node: text, offset: 2 });
});

describe.each(["clone", "extract", "delete"] as const)(
	"%s contents",
	(mode) => {
		it("handles partial ancestors and whole contained nodes without inventing identities", () => {
			const { tree, range, owner, parent, first, middle, inner, last } =
				fixture();
			range.setStart(first, 2);
			range.setEnd(last, 3);
			const selected = range.cloneRange();
			const fragment =
				mode === "clone"
					? range.cloneContents()
					: mode === "extract"
						? range.extractContents()
						: range.deleteContents();
			if (typeof fragment === "number") {
				const copied = owner.createRange();
				copied.selectNodeContents(fragment);
				expect(copied.toString()).toBe("llowidewor");
				const children = tree.get(fragment).children;
				expect(children[1] === middle).toBe(mode === "extract");
			}
			if (mode === "clone") {
				expect(range.toString()).toBe("llowidewor");
				expect(tree.get(inner).data).toBe("wide");
			} else {
				expect(tree.get(first).data).toBe("he");
				expect(tree.get(last).data).toBe("ld");
				expect(range.start).toEqual({ node: parent, offset: 1 });
				expect(range.collapsed).toBe(true);
				expect(selected.start).toEqual({ node: first, offset: 2 });
				expect(selected.end).toEqual({ node: last, offset: 0 });
			}
		});
	},
);

it("extracts partial nested elements and preserves the unselected portions", () => {
	const { tree, range, owner, inner, last, middle } = fixture();
	range.setStart(inner, 2);
	range.setEnd(last, 2);
	const fragment = range.extractContents();
	expect(tree.get(fragment).children).toHaveLength(2);
	const clone = tree.get(fragment).children[0];
	expect(clone).not.toBe(middle);
	expect(tree.get(clone).tagName).toBe("b");
	const copied = owner.createRange();
	copied.selectNodeContents(fragment);
	expect(copied.toString()).toBe("dewo");
	expect(tree.get(inner).data).toBe("wi");
	expect(tree.get(last).data).toBe("rld");
});

it("copies and deletes comment data but excludes comments from stringification", () => {
	const { tree, range, parent } = fixture();
	const comment = tree.createComment("comment");
	tree.append(parent, comment);
	range.setStart(comment, 1);
	range.setEnd(comment, 4);
	expect(range.toString()).toBe("");
	const fragment = range.extractContents();
	expect(tree.get(tree.get(fragment).children[0]).data).toBe("omm");
	expect(tree.get(comment).data).toBe("cent");
	expect(range.start).toEqual({ node: comment, offset: 1 });
});

it("rejects use after document close and shares a single collector", () => {
	const { tree, owner, range } = fixture();
	expect(domRangeOwner(tree)).toBe(owner);
	for (let index = 0; index < 50; index++) owner.createRange();
	expect(tree.mutationMetrics().collectors).toBe(1);
	tree.close();
	expect(() => range.start).toThrow("closed");
	expect(() => range.detach()).toThrow("closed");
	expect(() => owner.selection.rangeCount).toThrow("closed");
	expect(tree.mutationMetrics().collectors).toBe(0);
});

it("compares every fixture boundary against an independent tree-order enumeration", () => {
	const { tree, owner } = fixture();
	const points: { node: number; offset: number }[] = [];
	const visit = (id: number) => {
		const node = tree.get(id);
		if (node.kind === "text") {
			for (let offset = 0; offset <= node.data.length; offset++)
				points.push({ node: id, offset });
			return;
		}
		points.push({ node: id, offset: 0 });
		for (let index = 0; index < node.children.length; index++) {
			visit(node.children[index]);
			points.push({ node: id, offset: index + 1 });
		}
	};
	visit(tree.root);
	for (let left = 0; left < points.length; left++)
		for (let right = 0; right < points.length; right++)
			expect(owner.compare(points[left], points[right])).toBe(
				Math.sign(left - right),
			);
});

it("rejects doctype containers and extraction before modifying a selected document", () => {
	const { tree, range, parent } = fixture();
	const doctype = tree.createDocumentType("html");
	tree.insert(tree.root, doctype, parent);
	expect(() => range.selectNodeContents(doctype)).toThrow(
		expect.objectContaining({ name: "InvalidNodeTypeError" }),
	);
	range.selectNodeContents(tree.root);
	const revision = tree.revision;
	expect(() => range.cloneContents()).toThrow(
		expect.objectContaining({ name: "HierarchyRequestError" }),
	);
	expect(() => range.extractContents()).toThrow(
		expect.objectContaining({ name: "HierarchyRequestError" }),
	);
	expect(tree.revision).toBe(revision);
	expect(tree.get(doctype).parent).toBe(tree.root);
	range.selectNode(doctype);
	range.deleteContents();
	expect(tree.get(doctype).parent).toBe(null);
	expect(range.start).toEqual({ node: tree.root, offset: 0 });
	expect(range.collapsed).toBe(true);
});

it("tracks ranges in a fragment when its children are inserted into the document", () => {
	const { tree, owner, range, parent } = fixture();
	const fragment = tree.createFragment();
	const text = tree.createText("moved");
	tree.append(fragment, text);
	range.selectNodeContents(text);
	const whole = owner.createRange();
	whole.selectNodeContents(fragment);
	tree.append(parent, fragment);
	expect(range.start).toEqual({ node: fragment, offset: 0 });
	expect(range.collapsed).toBe(true);
	expect(whole.start).toEqual({ node: fragment, offset: 0 });
	expect(whole.collapsed).toBe(true);
});

it("handles insert-before-self as remove/reinsert and preserves boundary invariants", () => {
	const { tree, owner, range, parent, middle, inner } = fixture();
	range.selectNodeContents(inner);
	const whole = owner.createRange();
	whole.selectNodeContents(parent);
	tree.insert(parent, middle, middle);
	expect(range.start).toEqual({ node: parent, offset: 1 });
	expect(range.collapsed).toBe(true);
	expect(whole.endOffset).toBe(3);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("enforces a bounded live range count without allocating one collector per range", () => {
	const { tree, owner, range } = fixture();
	const retained = [range];
	for (let index = 1; index < 4096; index++) retained.push(owner.createRange());
	expect(() => owner.createRange()).toThrow("live range limit");
	expect(retained).toHaveLength(4096);
	expect(tree.mutationMetrics().collectors).toBe(1);
});

it("retains invariants for representative cross-container content operations", () => {
	for (const mode of ["clone", "extract", "delete"] as const) {
		for (let startIndex = 0; startIndex < 8; startIndex++) {
			for (let endIndex = startIndex; endIndex < 8; endIndex++) {
				const { tree, owner, range, parent, first, inner, last } = fixture();
				const boundaries = [
					{ node: parent, offset: 0, text: 0 },
					{ node: first, offset: 0, text: 0 },
					{ node: first, offset: 3, text: 3 },
					{ node: parent, offset: 1, text: 5 },
					{ node: inner, offset: 2, text: 7 },
					{ node: parent, offset: 2, text: 9 },
					{ node: last, offset: 3, text: 12 },
					{ node: parent, offset: 3, text: 14 },
				];
				const start = boundaries[startIndex];
				const end = boundaries[endIndex];
				const source = "hellowideworld";
				range.setStart(start.node, start.offset);
				range.setEnd(end.node, end.offset);
				expect(range.toString()).toBe(source.slice(start.text, end.text));
				const fragment =
					mode === "clone"
						? range.cloneContents()
						: mode === "extract"
							? range.extractContents()
							: range.deleteContents();
				if (typeof fragment === "number") {
					const copied = owner.createRange();
					copied.selectNodeContents(fragment);
					expect(copied.toString()).toBe(source.slice(start.text, end.text));
				}
				if (mode !== "clone") expect(range.collapsed).toBe(true);
				const remaining = owner.createRange();
				remaining.selectNodeContents(parent);
				expect(remaining.toString()).toBe(
					mode === "clone"
						? source
						: source.slice(0, start.text) + source.slice(end.text),
				);
				expect(tree.mutationMetrics().collectorFailures).toBe(0);
				tree.close();
			}
		}
	}
});
