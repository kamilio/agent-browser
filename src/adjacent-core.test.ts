import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlChecked, formOwner } from "./controls.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface NodeView {
	insertAdjacentElement(position: string, node: NodeView): NodeView | null;
	insertAdjacentText(position: string, text: string): void;
	content: NodeView;
	firstChild: NodeView | null;
	form: NodeView | null;
	textContent: string;
	querySelector(selector: string): NodeView | null;
}
interface RecordView {
	type: string;
	target: NodeView;
	addedNodes: { length: number; item(index: number): NodeView | null };
	removedNodes: { length: number; item(index: number): NodeView | null };
	previousSibling: NodeView | null;
	nextSibling: NodeView | null;
}
interface ObserverView {
	observe(
		target: object,
		options: { childList: boolean; subtree?: boolean },
	): void;
	takeRecords(): RecordView[];
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		Object.assign(object, definition.methods);
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		return object;
	},
};

function templateFixture(levels: number) {
	const tree = new DocumentTree("https://fixture.invalid/adjacent-template", {
		maxDepth: levels * 2 + 1,
	});
	trees.push(tree);
	let owner = tree;
	let parent = tree.root;
	let template = tree.root;
	for (let level = 0; level < levels; level++) {
		template = owner.createElement("template");
		owner.append(parent, template);
		const content = owner.templateContent(template);
		owner = content.tree;
		parent = content.id;
	}
	const target = owner.createElement("div");
	owner.append(parent, target);
	const dom = new ScriptDom(owner, factory);
	return {
		tree,
		owner,
		parent,
		template,
		target,
		dom,
		node: dom.node(target) as NodeView,
	};
}

it.each(
	[1, 2].flatMap((levels) =>
		["afterbegin", "beforeend"].flatMap((position) =>
			["", "text"].map((text) => [levels, position, text] as const),
		),
	),
)(
	"preflights %i template levels before allocating %s text %j",
	(levels, position, text) => {
		const { tree, owner, node, target } = templateFixture(levels);
		const before = owner.resourceUsage();
		const outer = tree.resourceUsage();
		const revision = owner.revision;
		for (let attempt = 0; attempt < 3; attempt++)
			expect(() => node.insertAdjacentText(position, text)).toThrow(
				/depth limit/,
			);
		expect(owner.resourceUsage()).toEqual(before);
		expect(tree.resourceUsage()).toEqual(outer);
		expect(owner.revision).toBe(revision);
		expect(owner.get(target).children).toEqual([]);
	},
);

it.each(
	[1, 2].flatMap((levels) =>
		["beforebegin", "afterend"].map((position) => [levels, position] as const),
	),
)(
	"allows exact-boundary text beside a target in %i template levels at %s",
	(levels, position) => {
		const { owner, parent, target, node } = templateFixture(levels);
		node.insertAdjacentText(position, "<literal>");
		const children = owner.get(parent).children;
		expect(children).toHaveLength(2);
		expect(children[position === "beforebegin" ? 1 : 0]).toBe(target);
		expect(owner.textContent(parent)).toBe("<literal>");
	},
);

it.each(["beforebegin", "afterbegin", "beforeend", "afterend"])(
	"reports a host-inclusive template cycle at %s before any mutation",
	(position) => {
		const { owner, parent, template, target, dom, node } = templateFixture(2);
		const before = owner.resourceUsage();
		const revision = owner.revision;
		expect(() =>
			node.insertAdjacentElement(position, dom.node(template) as NodeView),
		).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
		expect(owner.resourceUsage()).toEqual(before);
		expect(owner.revision).toBe(revision);
		expect(owner.get(target).parent).toBe(parent);
		expect(owner.templateContent(template).id).toBe(parent);
	},
);

function fixture(
	source = '<main id="parent"><i id="before"></i><div id="target">old</div><i id="after"></i></main><aside id="source"><b id="moving">move</b></aside>',
) {
	const tree = parseHtmlDocument(
		source,
		"https://fixture.invalid/adjacent-core",
	);
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	const queries = new DocumentQueries(tree);
	const id = (name: string) => {
		const found = queries.querySelector(`#${name}`);
		if (found === null) throw new Error(`Missing ${name}`);
		return found;
	};
	const view = (name: string) => dom.node(id(name)) as NodeView;
	const bindings = dom.mutationObservers({
		isClosed: () => false,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
	});
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.document, { childList: true, subtree: true });
	return { tree, dom, queries, id, view, observer };
}

it.each(["beforebegin", "afterbegin", "beforeend", "afterend"])(
	"reports removal and insertion records with stable capabilities at %s",
	(position) => {
		const { view, observer } = fixture();
		const target = view("target");
		const moving = view("moving");
		const originalText = target.firstChild;
		expect(target.insertAdjacentElement(position, moving)).toBe(moving);
		const records = observer.takeRecords();
		expect(records).toHaveLength(2);
		expect(records[0].target).toBe(view("source"));
		expect(records[0].removedNodes.item(0)).toBe(moving);
		expect(records[1].target).toBe(
			["beforebegin", "afterend"].includes(position) ? view("parent") : target,
		);
		expect(records[1].addedNodes.item(0)).toBe(moving);
		expect(records[1].removedNodes.length).toBe(0);
		const siblings: Record<string, [NodeView | null, NodeView | null]> = {
			beforebegin: [view("before"), target],
			afterbegin: [null, originalText],
			beforeend: [originalText, null],
			afterend: [target, view("after")],
		};
		expect([records[1].previousSibling, records[1].nextSibling]).toEqual(
			siblings[position],
		);
		expect(view("source").querySelector("b")).toBeNull();
	},
);

it.each(["", "<b>literal</b>\r\n"])(
	"inserts distinct text and reports a child-list record for %j",
	(text) => {
		const { view, observer, tree, id } = fixture();
		const target = view("target");
		const old = target.firstChild;
		expect(target.insertAdjacentText("afterbegin", text)).toBeUndefined();
		const records = observer.takeRecords();
		expect(records).toHaveLength(1);
		expect(records[0].type).toBe("childList");
		expect(records[0].addedNodes.item(0)).toBe(target.firstChild);
		expect(records[0].nextSibling).toBe(old);
		expect(target.firstChild?.textContent).toBe(text);
		expect(tree.get(id("target")).children).toHaveLength(2);
		expect(target.querySelector("b")).toBeNull();
	},
);

it("keeps template host children separate from inert content", () => {
	const { view, tree, id } = fixture(
		'<template id="target"><b>inert</b></template>',
	);
	const target = view("target");
	const content = target.content;
	target.insertAdjacentText("beforeend", "host");
	expect(target.textContent).toBe("host");
	expect(content.textContent).toBe("inert");
	expect(tree.get(id("target")).children).toHaveLength(1);
});

it("recomputes form and radio ownership after an adjacent move", () => {
	const { view, tree, id, queries } = fixture(
		'<form id="first"><input id="moving" type="radio" name="group" checked></form><form id="second"><input id="previous" type="radio" name="group" checked><span id="target"></span></form>',
	);
	const moving = view("moving");
	expect(moving.form).toBe(view("first"));
	expect(view("target").insertAdjacentElement("beforebegin", moving)).toBe(
		moving,
	);
	expect(moving.form).toBe(view("second"));
	expect(formOwner(tree, id("moving"))).toBe(id("second"));
	expect(controlChecked(tree, id("moving"))).toBe(true);
	expect(controlChecked(tree, id("previous"))).toBe(false);
	expect(queries.querySelectorAll("#second input:checked")).toEqual([
		id("moving"),
	]);
});

it("advertises only the adjacent methods and their four positions", () => {
	const host = new BrowserCommandHost({
		createSession() {
			throw new Error("Capability inspection must not create a session");
		},
	});
	try {
		expect(host.capabilities().domMutations).toMatchObject({
			element: ["insertAdjacentElement", "insertAdjacentText"],
			adjacentPositions: ["beforebegin", "afterbegin", "beforeend", "afterend"],
			crossDocumentAdoption: false,
			objectStringCoercion: false,
		});
	} finally {
		host.close();
	}
});
