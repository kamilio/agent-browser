import { afterEach, expect, it } from "vitest";
import { DocumentTree, type DocumentMutation } from "./document.js";
import { setInnerHtml, setOuterHtml } from "./html-content.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(limits: ConstructorParameters<typeof DocumentTree>[1] = {}) {
	const tree = new DocumentTree("https://fixture.invalid/", limits);
	trees.push(tree);
	const parent = tree.createElement("div");
	tree.append(tree.root, parent);
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	return { tree, parent, records };
}

it("captures previous attribute strings, including same-value writes", () => {
	const { tree, parent, records } = fixture();
	tree.setAttribute(parent, "TITLE", "first");
	tree.setAttribute(parent, "title", "first");
	tree.removeAttribute(parent, "title");
	expect(
		records.map(({ type, attributeName, oldValue }) => [
			type,
			attributeName,
			oldValue,
		]),
	).toEqual([
		["attributes", "title", null],
		["attributes", "title", "first"],
		["attributes", "title", "first"],
	]);
});

it.each(["append", "insert", "move", "self"])(
	"records sibling positions for %s",
	(operation) => {
		const { tree, parent, records } = fixture();
		const first = tree.createElement("a");
		const last = tree.createElement("b");
		tree.append(parent, first);
		tree.append(parent, last);
		const fresh = tree.createElement("i");
		records.length = 0;
		if (operation === "append") tree.append(parent, fresh);
		else if (operation === "insert") tree.insert(parent, fresh, last);
		else if (operation === "move") tree.insert(parent, last, first);
		else tree.insert(parent, first, first);
		if (operation === "append" || operation === "insert") {
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				target: parent,
				addedNodes: [fresh],
				removedNodes: [],
				previousSibling: operation === "append" ? last : first,
				nextSibling: operation === "append" ? null : last,
			});
		} else {
			expect(records).toHaveLength(2);
			const moving = operation === "move" ? last : first;
			expect(records[0]).toMatchObject({
				removedNodes: [moving],
				addedNodes: [],
			});
			expect(records[1]).toMatchObject({
				addedNodes: [moving],
				removedNodes: [],
				previousSibling: null,
				nextSibling: operation === "move" ? first : last,
			});
		}
	},
);

it("keeps the old parent and ancestry when moving across subtrees", () => {
	const { tree, parent, records } = fixture();
	const source = tree.createElement("section");
	const destination = tree.createElement("aside");
	const moved = tree.createElement("span");
	tree.append(parent, source);
	tree.append(parent, destination);
	tree.append(source, moved);
	records.length = 0;
	tree.append(destination, moved);
	expect(records.map(({ target, ancestors }) => [target, ancestors])).toEqual([
		[source, [source, parent, tree.root]],
		[destination, [destination, parent, tree.root]],
	]);
	tree.remove(source);
	expect(records[0].ancestors).toEqual([source, parent, tree.root]);
});

it("aggregates a fragment's removals and destination additions", () => {
	const { tree, parent, records } = fixture();
	const fragment = tree.createFragment();
	const first = tree.createText("first");
	const second = tree.createElement("b");
	const anchor = tree.createComment("anchor");
	tree.append(fragment, first);
	tree.append(fragment, second);
	tree.append(parent, anchor);
	records.length = 0;
	tree.insert(parent, fragment, anchor);
	expect(records).toHaveLength(2);
	expect(records[0]).toMatchObject({
		target: fragment,
		removedNodes: [first, second],
		addedNodes: [],
		previousSibling: null,
		nextSibling: null,
	});
	expect(records[1]).toMatchObject({
		target: parent,
		removedNodes: [],
		addedNodes: [first, second],
		previousSibling: null,
		nextSibling: anchor,
	});
	expect(tree.get(fragment).children).toEqual([]);
});

it.each(["replace", "children", "text"])(
	"aggregates target-side %s mutations",
	(operation) => {
		const { tree, parent, records } = fixture();
		const old = tree.createElement("i");
		const tail = tree.createElement("b");
		tree.append(parent, old);
		tree.append(parent, tail);
		const replacement = tree.createText("new");
		records.length = 0;
		if (operation === "replace") tree.replace(parent, replacement, old);
		else if (operation === "children")
			tree.replaceChildren(parent, replacement);
		else tree.setTextContent(parent, "new");
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			type: "childList",
			target: parent,
			removedNodes: operation === "replace" ? [old] : [old, tail],
			previousSibling: null,
			nextSibling: operation === "replace" ? tail : null,
		});
		expect(records[0].addedNodes).toHaveLength(1);
		expect(tree.get(records[0].addedNodes[0]).data).toBe("new");
	},
);

it("records a moved replacement's source before its combined target record", () => {
	const { tree, parent, records } = fixture();
	const first = tree.createElement("i");
	const old = tree.createElement("b");
	const last = tree.createElement("u");
	for (const node of [first, old, last]) tree.append(parent, node);
	records.length = 0;
	tree.replace(parent, last, old);
	expect(records).toHaveLength(2);
	expect(records[0]).toMatchObject({
		target: parent,
		removedNodes: [last],
		previousSibling: old,
		nextSibling: null,
	});
	expect(records[1]).toMatchObject({
		target: parent,
		removedNodes: [old],
		addedNodes: [last],
		previousSibling: first,
		nextSibling: null,
	});
	expect(tree.get(parent).children).toEqual([first, last]);
});

it("keeps the complete removed list when replacement-all reuses a child", () => {
	const { tree, parent, records } = fixture();
	const first = tree.createElement("i");
	const last = tree.createElement("b");
	tree.append(parent, first);
	tree.append(parent, last);
	records.length = 0;
	tree.replaceChildren(parent, last);
	expect(
		records.map(({ removedNodes, addedNodes }) => [removedNodes, addedNodes]),
	).toEqual([[[first, last], [last]]]);
});

it("retains the original previous sibling when replacement moves that sibling", () => {
	const { tree, parent, records } = fixture();
	const moving = tree.createElement("i");
	const removed = tree.createElement("b");
	tree.append(parent, moving);
	tree.append(parent, removed);
	records.length = 0;
	tree.replace(parent, moving, removed);
	expect(records.at(-1)).toMatchObject({
		addedNodes: [moving],
		removedNodes: [removed],
		previousSibling: moving,
		nextSibling: null,
	});
});

it("records empty-fragment replacement as removal without phantom additions", () => {
	const { tree, parent, records } = fixture();
	const old = tree.createElement("b");
	tree.append(parent, old);
	const fragment = tree.createFragment();
	records.length = 0;
	tree.replace(parent, fragment, old);
	expect(records).toHaveLength(1);
	expect(records[0]).toMatchObject({ removedNodes: [old], addedNodes: [] });
});

it.each([
	"missing-attribute",
	"detached-remove",
	"empty-fragment",
	"empty-replace",
	"empty-text",
	"clone",
	"create",
	"control",
])("does not fabricate records for %s", (operation) => {
	const { tree, parent, records } = fixture();
	const fragment = tree.createFragment();
	if (operation === "missing-attribute") tree.removeAttribute(parent, "absent");
	else if (operation === "detached-remove") tree.remove(fragment);
	else if (operation === "empty-fragment") tree.append(parent, fragment);
	else if (operation === "empty-replace") tree.replaceChildren(parent);
	else if (operation === "empty-text") tree.setTextContent(parent, "");
	else if (operation === "clone") tree.clone(parent, true);
	else if (operation === "create")
		tree.createElement("input", { value: "initial" });
	else tree.setControl(tree.createElement("input"), { value: "script" });
	expect(records).toEqual([]);
});

it.each(["value", "replace", "remove", "same"])(
	"covers attached Attr %s operations",
	(operation) => {
		const { tree, parent, records } = fixture();
		tree.setAttribute(parent, "data-test", "before");
		const attribute = tree.getAttributeNode(parent, "data-test") as number;
		records.length = 0;
		if (operation === "value") tree.setAttributeValue(attribute, "after");
		else if (operation === "replace")
			tree.setAttributeNode(
				parent,
				tree.createAttribute("data-test", "before"),
			);
		else if (operation === "remove")
			tree.removeAttributeNode(parent, attribute);
		else tree.setAttributeNode(parent, attribute);
		expect(records).toHaveLength(operation === "same" ? 0 : 1);
		if (records.length)
			expect(records[0]).toMatchObject({
				type: "attributes",
				target: parent,
				attributeName: "data-test",
				attributeNamespace: null,
				oldValue: "before",
			});
	},
);

it("does not expose detached Attr writes as element mutations", () => {
	const { tree, parent, records } = fixture();
	const attribute = tree.createAttribute("class", "before");
	tree.setAttributeValue(attribute, "after");
	expect(records).toEqual([]);
	tree.setAttributeNode(parent, attribute);
	expect(records[0].oldValue).toBeNull();
});

it.each(["text", "comment"])(
	"records same-data %s operations without forcing a legacy revision",
	(kind) => {
		const { tree, records } = fixture();
		const target =
			kind === "text" ? tree.createText("value") : tree.createComment("value");
		const revision = tree.revision;
		tree.setData(target, "value");
		tree.replaceData(target, 0, 0, "");
		expect(records.map(({ oldValue }) => oldValue)).toEqual(["value", "value"]);
		expect(tree.revision).toBe(revision);
	},
);

it.each([0, 2, 4])(
	"records splitText(%s) insertion before the original data change",
	(offset) => {
		const { tree, parent, records } = fixture();
		const original = tree.createText("text");
		const anchor = tree.createElement("b");
		tree.append(parent, original);
		tree.append(parent, anchor);
		records.length = 0;
		const added = tree.splitText(original, offset);
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			type: "childList",
			target: parent,
			addedNodes: [added],
			previousSibling: original,
			nextSibling: anchor,
		});
		expect(records[1]).toMatchObject({
			type: "characterData",
			target: original,
			oldValue: "text",
		});
	},
);

it("records only the original data for detached splitText", () => {
	const { tree, records } = fixture();
	const original = tree.createText("text");
	tree.splitText(original, 2);
	expect(records).toHaveLength(1);
	expect(records[0]).toMatchObject({
		type: "characterData",
		target: original,
		oldValue: "text",
	});
});

it("records normalize data and removals in depth-first order with logical siblings", () => {
	const { tree, parent, records } = fixture();
	const empty = tree.createText("");
	const first = tree.createText("a");
	const second = tree.createText("b");
	const nested = tree.createElement("b");
	const nestedText = tree.createText("inside");
	const tail = tree.createText("tail");
	for (const node of [empty, first, second, nested, tail])
		tree.append(parent, node);
	tree.append(nested, nestedText);
	records.length = 0;
	tree.normalize(parent);
	expect(records.map(({ type, target }) => [type, target])).toEqual([
		["childList", parent],
		["characterData", first],
		["childList", parent],
		["characterData", nestedText],
		["characterData", tail],
	]);
	expect(records[0]).toMatchObject({
		removedNodes: [empty],
		previousSibling: null,
		nextSibling: first,
	});
	expect(records[1].oldValue).toBe("a");
	expect(records[2]).toMatchObject({
		removedNodes: [second],
		previousSibling: first,
		nextSibling: nested,
	});
	expect(tree.get(first).data).toBe("ab");
});

it("keeps records and node lists immutable and snapshots detached ancestry", () => {
	const { tree, parent, records } = fixture();
	const element = tree.createElement("i");
	tree.append(parent, element);
	const record = records[0];
	expect(Object.isFrozen(record)).toBe(true);
	for (const value of [
		record.ancestors,
		record.addedNodes,
		record.removedNodes,
	])
		expect(Object.isFrozen(value)).toBe(true);
	tree.remove(parent);
	expect(record.ancestors).toEqual([parent, tree.root]);
	tree.setAttribute(element, "title", "detached");
	expect(records.at(-1)?.ancestors).toEqual([element, parent]);
});

it("invalidates cached node views before native collectors inspect writes", () => {
	const { tree, parent } = fixture();
	const child = tree.createText("before");
	tree.append(parent, child);
	tree.get(parent);
	tree.get(child);
	const seen: unknown[] = [];
	tree.onMutation((record) => {
		if (record.type === "attributes")
			seen.push(tree.get(parent).attributes.title);
		else if (record.type === "characterData") seen.push(tree.get(child).data);
		else seen.push([tree.get(parent).children, tree.get(child).parent]);
	});
	tree.setAttribute(parent, "title", "new");
	tree.setData(child, "after");
	tree.remove(child);
	expect(seen).toEqual(["new", "after", [[], null]]);
});

it.each(["attribute", "data", "text", "normalize", "cycle"])(
	"does not publish failed %s writes",
	(operation) => {
		const { tree, parent, records } = fixture({ maxTextCodeUnits: 12 });
		const child = tree.createText("1234");
		tree.append(parent, child);
		const other = tree.createText("5678");
		tree.append(parent, other);
		records.length = 0;
		const revision = tree.revision;
		expect(() => {
			if (operation === "attribute")
				tree.setAttribute(parent, "title", "too long");
			else if (operation === "data") tree.setData(child, "123456789");
			else if (operation === "text") tree.setTextContent(parent, "new text");
			else if (operation === "normalize") tree.normalize(parent);
			else tree.append(parent, parent);
		}).toThrow();
		expect(records).toEqual([]);
		expect(tree.revision).toBe(revision);
	},
);

it("captures page-facing mutations and parsed HTML without clone construction noise", () => {
	const { tree, parent, records } = fixture();
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			Object.assign(object, definition.methods);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			return object;
		},
	});
	const page = dom.node(parent) as {
		textContent: string;
		setAttribute(name: string, value: string): void;
	};
	page.setAttribute("title", "page");
	page.textContent = "text";
	expect(records.map(({ type }) => type)).toEqual(["attributes", "childList"]);
	records.length = 0;
	setInnerHtml(tree, parent, "<b>one</b><i>two</i>");
	expect(records.map(({ type }) => type)).toEqual(["childList", "childList"]);
	expect(records.at(-1)?.target).toBe(parent);
	expect(records.at(-1)?.addedNodes).toHaveLength(2);
	records.length = 0;
	setOuterHtml(tree, tree.get(parent).children[0], "<u>replacement</u>");
	expect(records.at(-1)).toMatchObject({ target: parent, type: "childList" });
	expect(records.at(-1)?.removedNodes).toHaveLength(1);
});

it("bounds collector registration and supports duplicate registration and release", () => {
	const { tree, parent, records } = fixture();
	const callback = () => {};
	const release = tree.onMutation(callback);
	tree.onMutation(callback);
	for (let index = 0; index < 30; index++) tree.onMutation(() => {});
	expect(() => tree.onMutation(() => {})).toThrow(/limit/);
	release();
	release();
	const stop = tree.onMutation(() => {});
	stop();
	tree.setAttribute(parent, "title", "value");
	expect(records).toHaveLength(1);
});

it("rejects invalid collectors and revokes registration on closure", () => {
	const { tree } = fixture();
	expect(() => tree.onMutation(null as never)).toThrow(/Invalid/);
	const release = tree.onMutation(() => {});
	tree.close();
	expect(() => tree.onMutation(() => {})).toThrow(/closed/);
	expect(() => release()).not.toThrow();
});

it("normalizes a large contiguous run without changing record multiplicity", () => {
	const { tree, parent, records } = fixture();
	for (let index = 0; index < 4000; index++)
		tree.append(parent, tree.createText("x"));
	records.length = 0;
	tree.normalize(parent);
	expect(records).toHaveLength(4000);
	expect(records[0].type).toBe("characterData");
	expect(
		records
			.slice(1)
			.every(
				({ type, removedNodes }) =>
					type === "childList" && removedNodes.length === 1,
			),
	).toBe(true);
	expect(tree.textContent(parent)).toBe("x".repeat(4000));
});

it("counts native collector failures without interrupting writes or other collectors", () => {
	const { tree, parent, records } = fixture();
	const original = tree.mutationMetrics();
	tree.onMutation(() => {
		throw new Error("private exception payload");
	});
	const later: DocumentMutation[] = [];
	tree.onMutation((record) => later.push(record));
	expect(() => tree.setAttribute(parent, "title", "first")).not.toThrow();
	expect(tree.get(parent).attributes.title).toBe("first");
	expect(later).toEqual(records);
	expect(tree.mutationMetrics()).toEqual({
		collectors: 3,
		notifications: original.notifications + 1,
		collectorFailures: 1,
		closed: false,
	});
	expect(Object.isFrozen(tree.mutationMetrics())).toBe(true);
	tree.close();
	expect(tree.mutationMetrics()).toMatchObject({
		collectors: 0,
		closed: true,
		collectorFailures: 1,
	});
});

it("lets collectors release subscriptions without publishing to released callbacks", () => {
	const { tree, parent } = fixture();
	let calls = 0;
	let release = () => {};
	tree.onMutation(() => release());
	release = tree.onMutation(() => {
		calls++;
	});
	tree.setAttribute(parent, "title", "first");
	expect(calls).toBe(0);
});

it("preserves immutable view identity and revision for self-insertion while capturing records", () => {
	const { tree, parent, records } = fixture();
	const child = tree.createElement("i");
	tree.append(parent, child);
	const parentView = tree.get(parent);
	const childView = tree.get(child);
	const revision = tree.revision;
	records.length = 0;
	tree.insert(parent, child, child);
	expect(records).toHaveLength(2);
	expect(tree.get(parent)).toBe(parentView);
	expect(tree.get(child)).toBe(childView);
	expect(tree.revision).toBe(revision);
});

it("captures previous character data strings", () => {
	const { tree, records } = fixture();
	const text = tree.createText("before");
	tree.setData(text, "after");
	expect(records).toEqual([
		expect.objectContaining({
			type: "characterData",
			target: text,
			oldValue: "before",
		}),
	]);
});

it("captures removed node identity and its old sibling boundaries", () => {
	const { tree, parent, records } = fixture();
	const children = ["a", "b", "c"].map((name) => tree.createElement(name));
	for (const child of children) tree.append(parent, child);
	records.length = 0;
	tree.remove(children[1]);
	expect(records).toEqual([
		expect.objectContaining({
			type: "childList",
			target: parent,
			addedNodes: [],
			removedNodes: [children[1]],
			previousSibling: children[0],
			nextSibling: children[2],
		}),
	]);
});
