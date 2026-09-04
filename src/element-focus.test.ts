import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { focusTabIndex } from "./focus.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

interface TestNode {
	tabIndex: unknown;
	inert: unknown;
	body: TestNode;
	activeElement: TestNode;
	getElementById(id: string): TestNode;
	createElement(tag: string): TestNode;
	createTextNode(text: string): TestNode;
	createDocumentFragment(): TestNode;
	appendChild(node: TestNode): TestNode;
	insertBefore(node: TestNode, before: TestNode | null): TestNode;
	removeChild(node: TestNode): TestNode;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
	removeAttribute(name: string): void;
}
function createHostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	return Object.preventExtensions(result);
}
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});
function fixture(
	source = '<div id="target"></div><button id="button">Button</button>',
) {
	const tree = parseHtmlDocument(
		source,
		"https://fixture.invalid/element-focus",
	);
	const actions = new DocumentInteractions(tree);
	const dom = new ScriptDom(tree, { createHostObject });
	cleanup.push(() => tree.close());
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error("Missing focus fixture node");
		return result;
	};
	return {
		tree,
		actions,
		dom,
		queries,
		id,
		document: dom.document as TestNode,
	};
}

it.each([
	"a",
	"area",
	"button",
	"frame",
	"iframe",
	"input",
	"object",
	"select",
	"textarea",
])(
	"returns default tabIndex zero for %s without claiming focusability",
	(tag) => {
		const { document } = fixture();
		const element = document.createElement(tag);
		expect(element.tabIndex).toBe(0);
		expect(element.getAttribute("tabindex")).toBeNull();
	},
);

it.each([
	"div",
	"span",
	"summary",
	"details",
	"audio",
	"video",
	"label",
	"html",
	"body",
	"option",
])("returns default tabIndex minus one for %s", (tag) => {
	const { document } = fixture();
	expect(document.createElement(tag).tabIndex).toBe(-1);
});

it.each<[string, number]>([
	["0", 0],
	["-0", 0],
	["+2", 2],
	["  \t\n\r\f-3tail", -3],
	["2.9", 2],
	["3e2", 3],
	["0x10", 0],
	["0012", 12],
	["7\u00a0tail", 7],
	["", -1],
	[" ", -1],
	["bad", -1],
	["\u00a03", -1],
	["\ufeff3", -1],
	["- 3", -1],
	["+", -1],
	["--3", -1],
	[".3", -1],
	["2147483647", 2147483647],
	["-2147483648", -2147483648],
	["2147483648", -1],
	["-2147483649", -1],
	["9".repeat(200), -1],
])(
	"reads HTML integer prefixes and long-range defaults from %j",
	(raw, expected) => {
		const { document } = fixture();
		const target = document.getElementById("target");
		target.setAttribute("tabindex", raw);
		expect(target.tabIndex).toBe(expected);
		expect(target.getAttribute("tabindex")).toBe(raw);
	},
);

it.each<[unknown, number]>([
	[0, 0],
	[-1, -1],
	[1.9, 1],
	[-1.9, -1],
	[true, 1],
	[false, 0],
	[null, 0],
	[undefined, 0],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[Number.NEGATIVE_INFINITY, 0],
	["2", 2],
	["0x10", 16],
	["2e2", 200],
	["junk", 0],
	["", 0],
	[2147483648, -2147483648],
	[4294967295, -1],
	[4294967296, 0],
	[-2147483649, 2147483647],
])("converts a tabIndex assignment of %s to signed long", (value, expected) => {
	const { document } = fixture();
	const target = document.getElementById("target");
	target.tabIndex = value;
	expect(target.tabIndex).toBe(expected);
	expect(target.getAttribute("tabindex")).toBe(String(expected));
});

it("rejects unsupported numeric coercion atomically without calling guest hooks", () => {
	const { tree, document } = fixture();
	const target = document.getElementById("target");
	target.tabIndex = 2;
	const revision = tree.revision;
	let called = false;
	const hostile = {
		valueOf() {
			called = true;
			throw new Error("guest conversion");
		},
	};
	for (const value of [hostile, () => 1, Symbol("tab"), 1n])
		expect(() => {
			target.tabIndex = value;
		}).toThrow();
	expect(called).toBe(false);
	expect(target.tabIndex).toBe(2);
	expect(tree.revision).toBe(revision);
});

it("updates first-summary defaults after removal, insertion and reparenting", () => {
	const { document } = fixture(
		'<details id="details"><div></div><summary id="first">First</summary><!-- gap --><summary id="second">Second</summary></details>',
	);
	const details = document.getElementById("details");
	const first = document.getElementById("first");
	const second = document.getElementById("second");
	expect(first.tabIndex).toBe(0);
	expect(second.tabIndex).toBe(-1);
	details.insertBefore(second, first);
	expect(first.tabIndex).toBe(-1);
	expect(second.tabIndex).toBe(0);
	details.removeChild(second);
	expect(second.tabIndex).toBe(-1);
	expect(first.tabIndex).toBe(0);
	document.body.appendChild(first);
	expect(first.tabIndex).toBe(-1);
});

it("does not confuse tabIndex metadata with native focus eligibility", () => {
	const { tree, document, id } = fixture(
		'<input id="disabled" disabled><input id="hidden" type="hidden"><a id="anchor">Anchor</a><div id="target"></div>',
	);
	for (const name of ["disabled", "hidden", "anchor"]) {
		expect(document.getElementById(name).tabIndex).toBe(0);
		expect(focusTabIndex(tree, id(`#${name}`))).toBeNull();
	}
	const target = document.getElementById("target");
	expect(target.tabIndex).toBe(-1);
	expect(focusTabIndex(tree, id("#target"))).toBeNull();
	target.tabIndex = -1;
	expect(target.tabIndex).toBe(-1);
	expect(focusTabIndex(tree, id("#target"))).toBe(-1);
	target.setAttribute("tabindex", "2147483648");
	expect(target.tabIndex).toBe(-1);
	expect(focusTabIndex(tree, id("#target"))).toBe(2147483648);
});

it("shares integer-prefix parsing and live tab order with native keyboard focus", () => {
	const { tree, actions, document, id } = fixture(
		'<div id="first" tabindex="2tail"></div><div id="second" tabindex="+1.5"></div><button id="last">Last</button>',
	);
	expect([
		actions.focus.move(),
		actions.focus.move(),
		actions.focus.move(),
	]).toEqual([id("#second"), id("#first"), id("#last")]);
	const first = document.getElementById("first");
	first.tabIndex = 0;
	expect(first.tabIndex).toBe(0);
	document.getElementById("second").tabIndex = -1;
	expect(actions.focus.move()).toBe(id("#first"));
	expect(actions.focus.focus(tree.reference(id("#second")))).toBe(
		id("#second"),
	);
	first.setAttribute("tabindex", "\u00a03");
	expect(first.tabIndex).toBe(-1);
	expect(focusTabIndex(tree, id("#first"))).toBeNull();
});

it.each<[unknown, boolean]>([
	[true, true],
	[false, false],
	[1, true],
	[0, false],
	["false", true],
	["", false],
	[null, false],
	[undefined, false],
	[Number.NaN, false],
	[0n, false],
	[1n, true],
	[Symbol("inert"), true],
])(
	"reflects inert assignment of %s as attribute presence",
	(value, expected) => {
		const { document } = fixture();
		const target = document.getElementById("target");
		target.inert = value;
		expect(target.inert).toBe(expected);
		expect(target.getAttribute("inert")).toBe(expected ? "" : null);
		target.setAttribute("inert", "false");
		expect(target.inert).toBe(true);
		target.removeAttribute("inert");
		expect(target.inert).toBe(false);
	},
);

it("uses object truthiness for inert without invoking conversion hooks", () => {
	const { document } = fixture();
	const target = document.getElementById("target");
	let called = false;
	target.inert = {
		valueOf() {
			called = true;
			return false;
		},
	};
	expect(target.inert).toBe(true);
	expect(called).toBe(false);
});

it("keeps reflected inert local while sharing effective inertness with focus, selectors and snapshots", () => {
	const { tree, actions, document, queries, id } = fixture(
		'<style>#target{display:block;width:20px;height:10px}#target:focus{width:70px}</style><div id="parent"><button id="target">Target</button></div><button id="other">Other</button>',
	);
	const parent = document.getElementById("parent");
	const target = document.getElementById("target");
	const targetId = id("#target");
	documentStyles(tree).setViewport(100, 50);
	actions.focus.focus(tree.reference(targetId));
	expect(document.activeElement).toBe(target);
	expect(documentGeometry(tree).getBoundingClientRect(targetId).width).toBe(70);
	parent.inert = true;
	expect(target.inert).toBe(false);
	expect(queries.querySelector("#target:focus")).toBeNull();
	expect(queries.querySelector("#target")).toBe(targetId);
	expect(document.activeElement === document.body).toBe(true);
	expect(() => actions.focus.focus(tree.reference(targetId))).toThrow(/focus/i);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.name === "Target"),
	).toBe(false);
	expect(documentGeometry(tree).getBoundingClientRect(targetId).width).toBe(20);
	parent.inert = false;
	expect(document.activeElement === document.body).toBe(true);
	expect(actions.focus.focus(tree.reference(targetId))).toBe(targetId);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.name === "Target"),
	).toBe(true);
});

it("clears inert focus through attribute writes without affecting unrelated focus", () => {
	const { tree, actions, document, id } = fixture(
		'<div id="parent"><button id="target">Target</button></div><button id="other">Other</button>',
	);
	const target = id("#target");
	const parent = document.getElementById("parent");
	actions.focus.focus(tree.reference(target));
	document.getElementById("other").inert = true;
	expect(tree.activeElement).toBe(target);
	parent.setAttribute("INERT", "false");
	expect(tree.activeElement).toBeNull();
	parent.removeAttribute("inert");
	expect(tree.activeElement).toBeNull();
	actions.focus.focus(tree.reference(target));
	expect(() =>
		tree.setAttribute(id("#parent"), "inert", "x".repeat(2_000_001)),
	).toThrow(/limit/i);
	expect(tree.activeElement).toBe(target);
	expect(parent.inert).toBe(false);
});

it.each(["toggle", "attribute-node"])(
	"clears focus before %s inert mutation observers read state",
	(method) => {
		const { tree, actions, document, id } = fixture();
		const target = id("#button");
		actions.focus.focus(tree.reference(target));
		const observed: (number | null)[] = [];
		tree.onMutation((record) => {
			if (record.attributeName === "inert") observed.push(tree.activeElement);
		});
		if (method === "toggle") tree.toggleAttribute(target, "inert", true);
		else tree.setAttributeNode(target, tree.createAttribute("inert", "false"));
		expect(tree.activeElement).toBeNull();
		expect(observed).toEqual([null]);
		expect(document.getElementById("button").inert).toBe(true);
	},
);

it("exposes properties only on elements and revokes retained getters and setters", () => {
	const { tree, dom, document } = fixture();
	for (const node of [
		document,
		document.createTextNode("text"),
		document.createDocumentFragment(),
	]) {
		expect(Reflect.get(node, "tabIndex")).toBeUndefined();
		expect(Reflect.get(node, "inert")).toBeUndefined();
	}
	const target = document.getElementById("target");
	target.tabIndex = 2;
	target.inert = true;
	dom.close();
	for (const read of [
		() => target.tabIndex,
		() => target.inert,
		() => {
			target.tabIndex = 0;
		},
		() => {
			target.inert = false;
		},
	])
		expect(read).toThrow(/closed/i);
	expect(
		tree.get(new DocumentQueries(tree).querySelector("#target") as number)
			.attributes.inert,
	).toBe("");
});
