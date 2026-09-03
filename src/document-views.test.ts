import { afterEach, expect, it } from "vitest";
import type { DocumentNode, DocumentTree } from "./document.js";
import { setInnerHtml, setOuterHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture() {
	const tree = parseHtmlDocument(
		'<main><section id="first"><button id="button">Old</button></section><section id="second"><input id="input" value="initial"></section></main>',
		"https://example.com/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error("Missing node-view fixture target");
		return target;
	};
	return {
		tree,
		queries,
		id,
		first: id("#first"),
		second: id("#second"),
		button: id("#button"),
		input: id("#input"),
	};
}

it("reuses deeply immutable read views without changing revision or native state", () => {
	const { tree, button } = fixture();
	const first = tree.get(button);
	const revision = tree.revision;
	for (let count = 0; count < 100; count++)
		expect(tree.get(button)).toBe(first);
	for (const value of [first, first.attributes, first.children, first.control])
		expect(Object.isFrozen(value)).toBe(true);
	expect(() => Object.assign(first.attributes, { title: "bad" })).toThrow();
	expect(() => (first.children as number[]).push(tree.root)).toThrow();
	expect(() => Object.assign(first.control, { value: "bad" })).toThrow();
	expect(tree.revision).toBe(revision);
	expect(tree.get(button).attributes.title).toBeUndefined();
});

it("attribute mutations replace only their node view and leave old views as immutable snapshots", () => {
	const { tree, button, input, first } = fixture();
	const before = tree.get(button);
	const peer = tree.get(input);
	const parent = tree.get(first);
	tree.setAttribute(button, "title", "new");
	expect(tree.get(button)).not.toBe(before);
	expect(before.attributes.title).toBeUndefined();
	expect(tree.get(button).attributes.title).toBe("new");
	expect(tree.get(input)).toBe(peer);
	expect(tree.get(first)).toBe(parent);
	const changed = tree.get(button);
	tree.setAttribute(button, "title", "new");
	expect(tree.get(button)).toBe(changed);
	tree.removeAttribute(button, "title");
	expect(tree.get(button).attributes.title).toBeUndefined();
	expect(changed.attributes.title).toBe("new");
});

it("owned attribute attachment, value edits, replacement and removal invalidate the element", () => {
	const { tree, button } = fixture();
	const initial = tree.get(button);
	const attribute = tree.createAttribute("data-value", "one");
	expect(tree.get(button)).toBe(initial);
	tree.setAttributeNode(button, attribute);
	const attached = tree.get(button);
	expect(attached.attributes["data-value"]).toBe("one");
	tree.setAttributeValue(attribute, "two");
	expect(tree.get(button).attributes["data-value"]).toBe("two");
	expect(attached.attributes["data-value"]).toBe("one");
	const replacement = tree.createAttribute("data-value", "three");
	tree.setAttributeNode(button, replacement);
	expect(tree.get(button).attributes["data-value"]).toBe("three");
	tree.removeAttributeNode(button, replacement);
	expect(tree.get(button).attributes["data-value"]).toBeUndefined();
	const removed = tree.get(button);
	tree.setAttributeValue(replacement, "detached");
	expect(tree.get(button)).toBe(removed);
});

it("character data changes do not invalidate unchanged parent records", () => {
	const { tree, button } = fixture();
	const parent = tree.get(button);
	const text = parent.children[0];
	const old = tree.get(text);
	tree.setData(text, "New");
	expect(tree.get(text).data).toBe("New");
	expect(old.data).toBe("Old");
	expect(tree.get(button)).toBe(parent);
	expect(tree.textContent(button)).toBe("New");
});

it("control updates and resets invalidate their snapshot without mutating saved state", () => {
	const { tree, input, button } = fixture();
	const untouched = tree.get(button);
	const before = tree.get(input);
	tree.setControl(input, { value: "edited", checked: true });
	const edited = tree.get(input);
	expect(edited.control).toEqual({ value: "edited", checked: true });
	expect(before.control).toEqual({});
	tree.clearControl(input, ["value", "checked"]);
	expect(tree.get(input).control).toEqual({});
	expect(edited.control.value).toBe("edited");
	expect(tree.get(button)).toBe(untouched);
});

it("presentation, focus, fragment target and URL revisions do not duplicate node data", () => {
	const { tree, button, input } = fixture();
	const buttonView = tree.get(button);
	const inputView = tree.get(input);
	const rootView = tree.get(tree.root);
	const before = tree.revision;
	tree.invalidatePresentation();
	tree.setActiveElement(button);
	tree.setTargetElement(input);
	tree.setUrl("https://example.com/new#target");
	expect(tree.revision).toBeGreaterThan(before);
	expect(tree.get(button)).toBe(buttonView);
	expect(tree.get(input)).toBe(inputView);
	expect(tree.get(tree.root)).toBe(rootView);
	expect(tree.activeElement).toBe(button);
	expect(tree.url).toBe("https://example.com/new#target");
});

it("cross-parent moves invalidate both parents and the moved node, not its unchanged descendants", () => {
	const { tree, first, second, button } = fixture();
	const source = tree.get(first);
	const destination = tree.get(second);
	const child = tree.get(button);
	const text = tree.get(child.children[0]);
	tree.append(second, button);
	expect(tree.get(first).children).toEqual([]);
	expect(tree.get(second).children).toEqual([...destination.children, button]);
	expect(tree.get(button).parent).toBe(second);
	expect(source.children).toEqual([button]);
	expect(child.parent).toBe(first);
	expect(tree.get(text.id)).toBe(text);
});

it("same-parent reordering and removal refresh child lists without invalidating peers", () => {
	const { tree, first, button } = fixture();
	const peer = tree.createElement("i");
	tree.append(first, peer);
	const peerView = tree.get(peer);
	const parent = tree.get(first);
	tree.insert(first, peer, button);
	expect(tree.get(first).children).toEqual([peer, button]);
	expect(parent.children).toEqual([button, peer]);
	const reordered = tree.get(first);
	tree.insert(first, button, button);
	expect(tree.get(first)).toBe(reordered);
	tree.remove(button);
	expect(tree.get(first).children).toEqual([peer]);
	expect(tree.get(button).parent).toBeNull();
	const removed = tree.get(button);
	tree.remove(button);
	expect(tree.get(button)).toBe(removed);
	expect(peerView.parent).toBe(first);
});

it("fragment transfer refreshes the consumed fragment, destination and each moved root", () => {
	const { tree, first, second, button, input } = fixture();
	const fragment = tree.createFragment();
	tree.append(fragment, button);
	tree.append(fragment, input);
	const fragmentView = tree.get(fragment);
	const buttonView = tree.get(button);
	const inputView = tree.get(input);
	const destination = tree.get(first);
	tree.append(first, fragment);
	expect(tree.get(fragment).children).toEqual([]);
	expect(fragmentView.children).toEqual([button, input]);
	expect(tree.get(first).children).toEqual([button, input]);
	expect(destination.children).toEqual([]);
	expect(tree.get(button).parent).toBe(first);
	expect(tree.get(input).parent).toBe(first);
	expect(buttonView.parent).toBe(fragment);
	expect(inputView.parent).toBe(fragment);
	expect(tree.get(second).children).toEqual([]);
});

it("bulk replacement clears all removed parent pointers and preserves old child arrays", () => {
	const { tree, first, second, button, input } = fixture();
	tree.append(first, input);
	const before = tree.get(first);
	const buttonView = tree.get(button);
	const inputView = tree.get(input);
	tree.replaceChildren(first);
	expect(tree.get(first).children).toEqual([]);
	expect(tree.get(button).parent).toBeNull();
	expect(tree.get(input).parent).toBeNull();
	expect(before.children).toEqual([button, input]);
	expect(buttonView.parent).toBe(first);
	expect(inputView.parent).toBe(first);
	tree.replaceChildren(second, button);
	expect(tree.get(second).children).toEqual([button]);
	expect(tree.get(button).parent).toBe(second);
});

it("subtree text replacement invalidates only records whose stored fields changed", () => {
	const { tree, button } = fixture();
	const before = tree.get(button);
	const oldText = tree.get(before.children[0]);
	tree.setTextContent(button, "replacement");
	expect(tree.get(button).children).not.toEqual(before.children);
	expect(tree.get(oldText.id).parent).toBeNull();
	expect(oldText.parent).toBe(button);
	expect(tree.textContent(button)).toBe("replacement");
});

it("cloning copies data without invalidating source records or aliasing new snapshots", () => {
	const { tree, button } = fixture();
	const before = tree.get(button);
	const clone = tree.clone(button, true);
	expect(tree.get(button)).toBe(before);
	expect(tree.get(clone).children).not.toEqual(before.children);
	tree.setAttribute(clone, "id", "clone");
	expect(tree.get(button).attributes.id).toBe("button");
	expect(tree.get(clone).attributes.id).toBe("clone");
});

it("HTML imports and replacement update cached parents and detached nodes", () => {
	const { tree, first, second, button, input } = fixture();
	const parent = tree.get(first);
	const previous = tree.get(button);
	setOuterHtml(tree, button, '<i id="replacement">New</i>');
	expect(tree.get(button).parent).toBeNull();
	expect(previous.parent).toBe(first);
	expect(tree.get(first).children).not.toEqual(parent.children);
	const sibling = tree.get(second);
	setInnerHtml(tree, second, "<b>new children</b>");
	expect(tree.get(input).parent).toBeNull();
	expect(tree.get(second).children).not.toEqual(sibling.children);
});

it("indirect option selectedness repair invalidates every changed option", () => {
	const { tree, first, second } = fixture();
	const select = tree.createElement("select");
	tree.append(first, select);
	const other = tree.createElement("select");
	tree.append(second, other);
	const options = [0, 1, 2].map((index) =>
		tree.createElement("option", { value: String(index) }),
	);
	tree.append(select, options[0]);
	tree.append(select, options[1]);
	tree.append(other, options[2]);
	const before = options.map((id) => tree.get(id));
	tree.setSelectSelection(select, [options[1]]);
	expect(tree.get(options[0]).control.selected).toBe(false);
	expect(tree.get(options[1]).control.selected).toBe(true);
	expect(before[0].control.selected).toBe(true);
	tree.append(other, options[1]);
	expect(tree.get(options[0]).control.selected).toBe(true);
	expect(tree.get(options[2]).control.selected).toBe(false);
	expect(before[2].control.selected).toBe(true);
	const selected = tree.get(options[1]);
	tree.setAttribute(options[2], "selected", "");
	expect(tree.get(options[1]).control.selected).toBe(false);
	expect(selected.control.selected).toBe(true);
});

it("failed mutations keep cached values valid without weakening hierarchy checks", () => {
	const { tree, first, button } = fixture();
	const parent = tree.get(first);
	const child = tree.get(button);
	expect(() => tree.append(button, first)).toThrow("cycles");
	expect(() => tree.setAttribute(button, "bad name", "value")).toThrow(
		"Invalid",
	);
	expect(tree.get(first)).toBe(parent);
	expect(tree.get(button)).toBe(child);
});

it("checks ownership and closure before consulting the cache, and releases cached references", () => {
	const { tree, button } = fixture();
	const view = tree.get(button);
	const other = fixture();
	expect(() => other.tree.get(button)).toThrow("Unknown");
	const views = Reflect.get(tree, "nodeViews") as Map<
		number,
		Readonly<DocumentNode>
	>;
	expect(views.size).toBeGreaterThan(0);
	expect(views.size).toBeLessThanOrEqual(tree.nodeCount);
	tree.close();
	expect(views.size).toBe(0);
	expect(() => tree.get(button)).toThrow("closed");
	expect(view.tagName).toBe("button");
});

it("matches the mutable model after a deterministic mixed mutation sequence", () => {
	const { tree, first, second } = fixture();
	const parents = [first, second, tree.createFragment()];
	const children = Array.from({ length: 12 }, (_, index) => {
		const id = tree.createElement("input", { id: `generated-${index}` });
		tree.append(parents[index % parents.length], id);
		return id;
	});
	const records = Reflect.get(tree, "nodes") as Map<number, DocumentNode>;
	let seed = 3917;
	for (let iteration = 0; iteration < 300; iteration++) {
		for (const id of records.keys()) tree.get(id);
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		const child = children[seed % children.length];
		const parent = parents[(seed >>> 8) % parents.length];
		switch (iteration % 8) {
			case 0:
				tree.setAttribute(child, "class", `step-${iteration}`);
				break;
			case 1:
				tree.removeAttribute(child, "class");
				break;
			case 2:
				tree.setControl(child, {
					value: String(iteration),
					checked: iteration % 3 === 0,
				});
				break;
			case 3:
				tree.append(parent, child);
				break;
			case 4:
				tree.remove(child);
				break;
			case 5:
				tree.replaceChildren(parent, child);
				break;
			case 6: {
				const fragment = tree.createFragment();
				tree.append(fragment, child);
				tree.append(parent, fragment);
				break;
			}
			case 7:
				tree.setAttributeNode(
					child,
					tree.createAttribute("title", String(iteration)),
				);
				break;
		}
		for (const [id, record] of records)
			expect(tree.get(id), `step ${iteration}, node ${id}`).toEqual(record);
	}
});
