import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ElementTraversal,
	type ElementTraversalLimits,
} from "./element-traversal.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface NodeFixture {
	readonly firstElementChild: NodeFixture | null;
	readonly lastElementChild: NodeFixture | null;
	readonly childElementCount: number;
	readonly previousElementSibling: NodeFixture | null;
	readonly nextElementSibling: NodeFixture | null;
	readonly childNodes: NodeFixture[];
	readonly firstChild: NodeFixture | null;
	readonly lastChild: NodeFixture | null;
	readonly nodeName: string;
	textContent: string;
	innerHTML: string;
	appendChild(node: NodeFixture): NodeFixture;
	removeChild(node: NodeFixture): NodeFixture;
	insertBefore(node: NodeFixture, before: NodeFixture | null): NodeFixture;
	createElement(name: string): NodeFixture;
	createTextNode(value: string): NodeFixture;
	createComment(value: string): NodeFixture;
	createDocumentFragment(): NodeFixture;
	cloneNode(deep?: boolean): NodeFixture;
	normalize(): void;
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(
	source:
		| string
		| DocumentTree = '<main id="target">text<!--before--><p id="first"><b></b></p>gap<!--middle--><aside id="last"></aside>tail</main>',
) {
	const tree =
		typeof source === "string"
			? parseHtmlDocument(source, "https://fixture.invalid/")
			: source;
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const result = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(result, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(result, name, { value: method });
			return Object.preventExtensions(result);
		},
	});
	cleanup.push(() => tree.close());
	const queries = new DocumentQueries(tree);
	const node = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error("Missing traversal fixture element");
		return dom.node(id) as NodeFixture;
	};
	return { tree, dom, node, document: dom.document as NodeFixture };
}

it("selects only direct element children while preserving native identity", () => {
	const { node } = fixture();
	const parent = node("#target");
	expect(parent.firstElementChild).toBe(node("#first"));
	expect(parent.lastElementChild).toBe(node("#last"));
	expect(parent.childElementCount).toBe(2);
	expect(parent.firstChild?.nodeName).toBe("#text");
	expect(parent.lastChild?.nodeName).toBe("#text");
	expect(node("#first").childElementCount).toBe(1);
});

it("skips text and comments when traversing sibling elements", () => {
	const { node } = fixture();
	const first = node("#first");
	const last = node("#last");
	expect(first.previousElementSibling).toBeNull();
	expect(first.nextElementSibling).toBe(last);
	expect(last.previousElementSibling).toBe(first);
	expect(last.nextElementSibling).toBeNull();
});

it("exposes element sibling traversal on text and comment nodes", () => {
	const { node } = fixture();
	const parent = node("#target");
	const [leading, comment, first, gap, middle, last, trailing] =
		parent.childNodes;
	for (const current of [leading, comment]) {
		expect(current.previousElementSibling).toBeNull();
		expect(current.nextElementSibling).toBe(first);
	}
	for (const current of [gap, middle]) {
		expect(current.previousElementSibling).toBe(first);
		expect(current.nextElementSibling).toBe(last);
	}
	expect(trailing.previousElementSibling).toBe(last);
	expect(trailing.nextElementSibling).toBeNull();
});

it.each(["document", "fragment", "element"])(
	"supports ParentNode traversal on a %s",
	(kind) => {
		const { document } = fixture(new DocumentTree("about:blank"));
		const parent =
			kind === "document"
				? document
				: kind === "fragment"
					? document.createDocumentFragment()
					: document.createElement("div");
		expect(parent.firstElementChild).toBeNull();
		expect(parent.lastElementChild).toBeNull();
		expect(parent.childElementCount).toBe(0);
		parent.appendChild(document.createComment("before"));
		const element = document.createElement("p");
		parent.appendChild(element);
		parent.appendChild(document.createComment("after"));
		expect(parent.firstElementChild).toBe(element);
		expect(parent.lastElementChild).toBe(element);
		expect(parent.childElementCount).toBe(1);
	},
);

it.each(["firstElementChild", "lastElementChild", "childElementCount"])(
	"keeps %s readonly and absent on CharacterData",
	(property) => {
		const { document, node } = fixture();
		const parent = node("#target");
		expect(Reflect.set(parent, property, null)).toBe(false);
		expect(property in document.createTextNode("text")).toBe(false);
		expect(property in document.createComment("comment")).toBe(false);
	},
);

it.each(["previousElementSibling", "nextElementSibling"])(
	"keeps %s readonly and absent on document/fragment nodes",
	(property) => {
		const { document, node } = fixture();
		expect(Reflect.set(node("#first"), property, null)).toBe(false);
		expect(property in document).toBe(false);
		expect(property in document.createDocumentFragment()).toBe(false);
	},
);

it("updates saved node traversal after reordering, removal and fragment insertion", () => {
	const { node, document } = fixture();
	const parent = node("#target");
	const first = node("#first");
	const last = node("#last");
	expect(parent.childElementCount).toBe(2);
	parent.insertBefore(last, first);
	expect(parent.firstElementChild).toBe(last);
	expect(last.nextElementSibling).toBe(first);
	const fragment = document.createDocumentFragment();
	fragment.appendChild(first);
	expect(first.previousElementSibling).toBeNull();
	expect(parent.childElementCount).toBe(1);
	const added = document.createElement("section");
	fragment.appendChild(added);
	parent.appendChild(fragment);
	expect(parent.childElementCount).toBe(3);
	expect(fragment.childElementCount).toBe(0);
	expect(first.nextElementSibling).toBe(added);
	expect(added.previousElementSibling).toBe(first);
});

it("reflects parsed innerHTML replacement and text-only replacement", () => {
	const { node } = fixture();
	const parent = node("#target");
	const old = node("#first");
	expect(parent.firstElementChild).toBe(old);
	parent.innerHTML = "before<section></section><!--gap--><hr>after";
	expect(parent.firstElementChild?.nodeName).toBe("SECTION");
	expect(parent.lastElementChild?.nodeName).toBe("HR");
	expect(parent.childElementCount).toBe(2);
	expect(old.nextElementSibling).toBeNull();
	parent.textContent = "only text";
	expect(parent.firstElementChild).toBeNull();
	expect(parent.lastElementChild).toBeNull();
	expect(parent.childElementCount).toBe(0);
});

it("keeps detached, cloned and normalized subtrees locally traversable", () => {
	const { node, document } = fixture();
	const parent = node("#target").cloneNode(true);
	const first = parent.firstElementChild;
	const last = parent.lastElementChild;
	expect(first).not.toBe(node("#first"));
	expect(first?.nextElementSibling).toBe(last);
	expect(parent.previousElementSibling).toBeNull();
	expect(parent.nextElementSibling).toBeNull();
	const empty = document.createTextNode("");
	parent.insertBefore(empty, last);
	expect(empty.previousElementSibling).toBe(first);
	expect(empty.nextElementSibling).toBe(last);
	parent.normalize();
	expect(empty.previousElementSibling).toBeNull();
	expect(empty.nextElementSibling).toBeNull();
	expect(parent.childElementCount).toBe(2);
	expect(first?.nextElementSibling).toBe(last);
});

it.each(["text", "comment"])(
	"returns null element siblings on a detached %s node",
	(kind) => {
		const { document } = fixture();
		const node =
			kind === "text"
				? document.createTextNode("text")
				: document.createComment("comment");
		expect(node.previousElementSibling).toBeNull();
		expect(node.nextElementSibling).toBeNull();
	},
);

it.each([
	"firstElementChild",
	"lastElementChild",
	"childElementCount",
	"previousElementSibling",
	"nextElementSibling",
] as const)("revokes saved %s access on binding close", (property) => {
	const { dom, node } = fixture();
	const element = node("#first");
	expect(element[property]).not.toBeUndefined();
	dom.close();
	expect(() => element[property]).toThrow(/closed/i);
});

it("keeps other document owners live after tree closure", () => {
	const first = fixture();
	const second = fixture();
	const saved = first.node("#target");
	expect(saved.firstElementChild).not.toBe(
		second.node("#target").firstElementChild,
	);
	first.tree.close();
	expect(() => saved.childElementCount).toThrow(/closed/i);
	expect(second.node("#target").childElementCount).toBe(2);
});

function nativeFixture(limits: Partial<ElementTraversalLimits> = {}) {
	const tree = new DocumentTree("about:blank");
	const parent = tree.createElement("main");
	tree.append(tree.root, parent);
	const traversal = new ElementTraversal(tree, limits);
	cleanup.push(
		() => tree.close(),
		() => traversal.close(),
	);
	return { tree, parent, traversal };
}

it("builds once for a full unchanged sibling walk instead of scanning per accessor", () => {
	const { tree, parent, traversal } = nativeFixture({ maxWork: 6000 });
	const elements: number[] = [];
	for (let index = 0; index < 3000; index++) {
		const child =
			index % 3 === 0 ? tree.createElement("span") : tree.createText("gap");
		tree.append(parent, child);
		if (index % 3 === 0) elements.push(child);
	}
	const reads = vi.spyOn(tree, "get");
	cleanup.push(() => reads.mockRestore());
	expect(traversal.count(parent)).toBe(1000);
	expect(traversal.first(parent)).toBe(elements[0]);
	expect(traversal.last(parent)).toBe(elements.at(-1));
	for (let index = 0; index < elements.length; index++) {
		expect(traversal.previous(elements[index])).toBe(elements[index - 1]);
		expect(traversal.next(elements[index])).toBe(elements[index + 1]);
	}
	expect(traversal.stats).toMatchObject({
		builds: 1,
		visitedChildren: 6000,
		parents: 1,
		cachedChildren: 3000,
		hits: 2002,
	});
	expect(reads).toHaveBeenCalledTimes(10_003);
});

it("matches an independent sibling-order oracle throughout repeated moves and removals", () => {
	const { tree, parent, traversal } = nativeFixture();
	const other = tree.createFragment();
	const children = Array.from({ length: 18 }, (_, index) =>
		index % 3 === 0
			? tree.createElement("span")
			: index % 3 === 1
				? tree.createText("text")
				: tree.createComment("comment"),
	);
	for (const child of children) tree.append(parent, child);
	const verify = (owner: number) => {
		const ordered = tree.get(owner).children;
		const elements = ordered.filter((id) => tree.get(id).kind === "element");
		expect(traversal.first(owner)).toBe(elements[0]);
		expect(traversal.last(owner)).toBe(elements.at(-1));
		expect(traversal.count(owner)).toBe(elements.length);
		for (let index = 0; index < ordered.length; index++) {
			const before = ordered
				.slice(0, index)
				.filter((id) => tree.get(id).kind === "element");
			const after = ordered
				.slice(index + 1)
				.filter((id) => tree.get(id).kind === "element");
			expect(traversal.previous(ordered[index])).toBe(before.at(-1));
			expect(traversal.next(ordered[index])).toBe(after[0]);
		}
	};
	for (let iteration = 0; iteration < 60; iteration++) {
		const child = children[(iteration * 7) % children.length];
		const destination = iteration % 2 === 0 ? other : parent;
		tree.insert(destination, child, tree.get(destination).children[0]);
		verify(parent);
		verify(other);
		if (iteration % 5 === 0) {
			tree.remove(child);
			expect(traversal.previous(child)).toBeUndefined();
			expect(traversal.next(child)).toBeUndefined();
			verify(parent);
			verify(other);
		}
	}
});

it("invalidates conservatively on attribute and text changes without returning stale neighbors", () => {
	const { tree, parent, traversal } = nativeFixture();
	const first = tree.createElement("p");
	const text = tree.createText("before");
	tree.append(parent, first);
	tree.append(parent, text);
	expect(traversal.previous(text)).toBe(first);
	expect(traversal.stats.builds).toBe(1);
	tree.setAttribute(first, "data-state", "new");
	expect(traversal.previous(text)).toBe(first);
	expect(traversal.stats.builds).toBe(2);
	tree.setData(text, "after");
	expect(traversal.last(parent)).toBe(first);
	expect(traversal.stats.builds).toBe(3);
	tree.remove(first);
	expect(traversal.previous(text)).toBeUndefined();
	expect(traversal.count(parent)).toBe(0);
});

it("evicts least-recently-used parents without changing traversal results", () => {
	const { tree, parent, traversal } = nativeFixture({ maxCachedParents: 2 });
	const second = tree.createElement("section");
	const third = tree.createElement("aside");
	traversal.count(parent);
	traversal.count(second);
	traversal.count(parent);
	traversal.count(third);
	expect(traversal.stats).toMatchObject({
		parents: 2,
		builds: 3,
		evictions: 1,
	});
	traversal.count(parent);
	expect(traversal.stats.builds).toBe(3);
	expect(traversal.count(second)).toBe(0);
	expect(traversal.stats).toMatchObject({
		parents: 2,
		builds: 4,
		evictions: 2,
	});
});

it("bounds aggregate cached children across parents", () => {
	const { tree, parent, traversal } = nativeFixture({ maxCachedChildren: 2 });
	const other = tree.createElement("section");
	for (const owner of [parent, other])
		for (let index = 0; index < 2; index++)
			tree.append(owner, tree.createElement("span"));
	expect(traversal.count(parent)).toBe(2);
	expect(traversal.count(other)).toBe(2);
	expect(traversal.stats).toMatchObject({
		parents: 1,
		cachedChildren: 2,
		evictions: 1,
	});
	expect(traversal.count(parent)).toBe(2);
	expect(traversal.stats).toMatchObject({
		parents: 1,
		cachedChildren: 2,
		evictions: 2,
	});
});

it("answers parents larger than the cache without retaining oversized entries", () => {
	const { tree, parent, traversal } = nativeFixture({ maxCachedChildren: 1 });
	const first = tree.createElement("p");
	const last = tree.createElement("aside");
	tree.append(parent, first);
	tree.append(parent, last);
	expect(traversal.first(parent)).toBe(first);
	expect(traversal.next(first)).toBe(last);
	expect(traversal.stats).toMatchObject({
		parents: 0,
		cachedChildren: 0,
		builds: 2,
		visitedChildren: 8,
	});
});

it("rejects over-budget scans before allocation and recovers after the tree shrinks", () => {
	const { tree, parent, traversal } = nativeFixture({ maxWork: 3 });
	const first = tree.createText("before");
	const last = tree.createElement("p");
	tree.append(parent, first);
	tree.append(parent, last);
	const revision = tree.revision;
	for (const read of [
		() => traversal.count(parent),
		() => traversal.first(parent),
		() => traversal.next(first),
	])
		expect(read).toThrow(/work limit/i);
	expect(traversal.stats).toMatchObject({
		parents: 0,
		cachedChildren: 0,
		builds: 0,
		visitedChildren: 0,
	});
	expect(tree.revision).toBe(revision);
	tree.remove(first);
	expect(traversal.first(parent)).toBe(last);
	expect(traversal.count(parent)).toBe(1);
});

it("releases retained cache entries and rejects native traversal after close", () => {
	const { tree, parent, traversal } = nativeFixture();
	const child = tree.createElement("p");
	tree.append(parent, child);
	expect(traversal.count(parent)).toBe(1);
	traversal.close();
	expect(traversal.stats).toMatchObject({ parents: 0, cachedChildren: 0 });
	for (const read of [
		() => traversal.count(parent),
		() => traversal.first(parent),
		() => traversal.last(parent),
		() => traversal.previous(child),
		() => traversal.next(child),
	])
		expect(read).toThrow(/closed/i);
});

it("validates limits and native node kinds", () => {
	const { tree, traversal } = nativeFixture();
	for (const limits of [
		{ maxCachedParents: 0 },
		{ maxCachedChildren: -1 },
		{ maxWork: Number.NaN },
		{ maxWork: 1.5 },
	])
		expect(() => new ElementTraversal(tree, limits)).toThrow(/limit/i);
	const text = tree.createText("text");
	expect(() => traversal.first(text)).toThrow(/parent node/i);
	expect(() => traversal.next(tree.root)).toThrow(/character data/i);
	expect(() => traversal.count(-1)).toThrow();
	tree.close();
	expect(() => traversal.count(tree.root)).toThrow(/closed/i);
});
