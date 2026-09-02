import { afterEach, expect, it } from "vitest";
import { controlValue, selectedOptions } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface List {
	readonly length: number;
	readonly [index: number]: Element | undefined;
	item(index: unknown): Element | null;
	namedItem(name: string): Element | null;
}
interface Element {
	value: unknown;
	selected: boolean;
	defaultSelected: boolean;
	selectedIndex: unknown;
	disabled: boolean;
	multiple: boolean;
	required: boolean;
	text: string;
	label: string;
	name: string;
	type: string;
	index: number;
	length: number;
	form: Element | null;
	options: List;
	selectedOptions: List;
	isConnected: boolean;
	getElementById(id: string): Element;
	createElement(tag: string): Element;
	appendChild(node: Element): Element;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	remove(index?: unknown): void;
}

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function factory(definition: ScriptHostObjectDefinition) {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, {
			get: property.get,
			set: property.set,
		});
	Object.assign(target, definition.methods);
	const indexed = definition.indexed;
	if (!indexed) return target;
	Object.defineProperty(target, "length", { get: indexed.length });
	return new Proxy(target, {
		get(object, key) {
			if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
				return Number(key) < indexed.length()
					? indexed.get(Number(key))
					: undefined;
			return Reflect.get(object, key);
		},
	});
}

function fixture(
	source = '<form id="form"><select id="select" name="choice"><option id="first" value="one">First</option><optgroup id="group" label="Group"><option id="second" name="named" value="two">Second</option></optgroup></select></form>',
) {
	const tree = parseHtmlDocument(source, "https://example.com/");
	documents.push(tree);
	const dom = new ScriptDom(tree, { createHostObject: factory });
	const document = dom.document as Element;
	const get = (name: string) => document.getElementById(name);
	const id = (name: string) => {
		const match = [...tree.walk()].find(
			({ node }) => node.attributes.id === name,
		);
		if (!match) throw new Error("Missing fixture node");
		return match.node.id;
	};
	return { tree, dom, document, get, id, select: get("select") };
}

it("reads initial native selection, index, types and form identities", () => {
	const { select, get } = fixture();
	expect(select.value).toBe("one");
	expect(select.selectedIndex).toBe(0);
	expect(select.type).toBe("select-one");
	expect(select.length).toBe(2);
	expect(select.form).toBe(get("form"));
	expect(get("second").form).toBe(get("form"));
	expect(get("second").index).toBe(1);
	expect(get("first").selected).toBe(true);
	expect(get("first").defaultSelected).toBe(false);
});

it("select value chooses the first duplicate including disabled options without changing attributes", () => {
	const { select, get, document } = fixture();
	const duplicate = document.createElement("option");
	duplicate.value = "two";
	select.appendChild(duplicate);
	get("second").disabled = true;
	select.disabled = true;
	select.value = "two";
	expect(select.selectedIndex).toBe(1);
	expect(get("second").selected).toBe(true);
	expect(duplicate.selected).toBe(false);
	expect(get("second").getAttribute("selected")).toBe(null);
});

it("missing value clears selection rather than waiting or selecting a fallback", () => {
	const { select } = fixture();
	select.value = "missing";
	expect(select.value).toBe("");
	expect(select.selectedIndex).toBe(-1);
	expect(select.selectedOptions.length).toBe(0);
});

it("selectedIndex supports clear, bounds and primitive Web IDL long conversion", () => {
	const { select } = fixture();
	select.selectedIndex = "1.9";
	expect(select.value).toBe("two");
	select.selectedIndex = 4_294_967_297;
	expect(select.selectedIndex).toBe(1);
	select.selectedIndex = Number.NaN;
	expect(select.selectedIndex).toBe(0);
	select.selectedIndex = -1;
	expect(select.value).toBe("");
	select.selectedIndex = 500;
	expect(select.selectedIndex).toBe(-1);
});

it("rejects executable coercion before changing selection", () => {
	const { select } = fixture();
	let called = false;
	const value = {
		valueOf() {
			called = true;
			return 1;
		},
		toString() {
			called = true;
			return "two";
		},
	};
	expect(() => {
		select.selectedIndex = value;
	}).toThrow(/conversion/);
	expect(() => {
		select.value = value;
	}).toThrow(/conversion/);
	expect(() => {
		select.selectedIndex = 1n;
	}).toThrow(/conversion/);
	expect(called).toBe(false);
	expect(select.value).toBe("one");
});

it("select value uses DOMString conversion rather than input null-to-empty behavior", () => {
	const { select, get } = fixture();
	get("second").value = null;
	select.value = null;
	expect(select.value).toBe("null");
	expect(select.selectedIndex).toBe(1);
});

it("option selected switches a single selection and false restores the dropdown fallback", () => {
	const { select, get } = fixture();
	get("second").selected = true;
	expect(select.value).toBe("two");
	expect(get("first").selected).toBe(false);
	get("second").selected = false;
	expect(select.value).toBe("one");
	get("first").selected = false;
	expect(get("first").selected).toBe(true);
});

it("listbox option deselection does not invent a dropdown fallback", () => {
	const { select, get } = fixture();
	select.setAttribute("size", "4");
	get("second").selected = true;
	get("second").selected = false;
	expect(select.selectedIndex).toBe(-1);
});

it("multiple option selection accumulates but select value and selectedIndex select one", () => {
	const { select, get } = fixture();
	select.multiple = true;
	get("first").selected = true;
	get("second").selected = true;
	expect(select.selectedOptions.length).toBe(2);
	expect(select.type).toBe("select-multiple");
	expect(select.value).toBe("one");
	select.value = "two";
	expect(select.selectedOptions.length).toBe(1);
	get("first").selected = true;
	select.selectedIndex = 0;
	expect(select.selectedOptions.length).toBe(1);
	expect(select.value).toBe("one");
});

it("defaultSelected reflects the attribute but does not overwrite an explicit current state", () => {
	const { select, get } = fixture();
	get("second").defaultSelected = true;
	expect(select.value).toBe("two");
	get("second").selected = false;
	get("second").defaultSelected = false;
	get("second").defaultSelected = true;
	expect(get("second").defaultSelected).toBe(true);
	expect(get("second").selected).toBe(false);
});

it("saved option collections are stable and live across selection, insertion, removal and reparenting", () => {
	const { select, document, get } = fixture();
	const options = select.options;
	const selected = select.selectedOptions;
	expect(select.options).toBe(options);
	expect(select.selectedOptions).toBe(selected);
	expect(options[1]).toBe(get("second"));
	expect(options.item(8)).toBe(null);
	expect(options[8]).toBe(undefined);
	expect(options.namedItem("named")).toBe(get("second"));
	select.value = "two";
	expect(selected[0]).toBe(get("second"));
	const other = document.createElement("select");
	const second = get("second");
	other.appendChild(second);
	expect(options.length).toBe(1);
	expect(other.options[0]).toBe(second);
	expect(second.index).toBe(0);
});

it("detached options retain selected/default/value state and acquire an owner on insertion", () => {
	const { document, select } = fixture();
	const option = document.createElement("option");
	option.defaultSelected = true;
	expect(option.selected).toBe(true);
	option.selected = false;
	expect(option.selected).toBe(false);
	expect(option.form).toBe(null);
	expect(option.index).toBe(0);
	option.value = "new";
	select.appendChild(option);
	option.selected = true;
	expect(select.value).toBe("new");
	expect(option.index).toBe(2);
});

it("option text and value fallback collapse ASCII whitespace and skip script descendants", () => {
	const { tree, get, id } = fixture();
	const option = get("first");
	tree.removeAttribute(id("first"), "value");
	option.text = "  New\n text\t \u00a0  ";
	const script = tree.createElement("script");
	tree.append(script, tree.createText("ignored"));
	tree.append(id("first"), script);
	expect(option.text).toBe("New text \u00a0");
	expect(option.value).toBe("New text \u00a0");
	expect(option.label).toBe("New text \u00a0");
	option.label = "";
	expect(option.label).toBe("");
	option.value = "";
	expect(option.value).toBe("");
});

it("option text setter replaces children while explicit value remains unchanged", () => {
	const { get } = fixture();
	get("first").text = "Changed";
	expect(get("first").text).toBe("Changed");
	expect(get("first").value).toBe("one");
});

it("boolean reflection is own-attribute state, not inherited disabled state", () => {
	const { select, get } = fixture();
	get("group").disabled = true;
	expect(get("second").disabled).toBe(false);
	expect(get("group").disabled).toBe(true);
	select.required = true;
	select.name = "updated";
	expect(select.getAttribute("required")).toBe("");
	expect(select.getAttribute("name")).toBe("updated");
	select.required = false;
	expect(select.getAttribute("required")).toBe(null);
});

it("select remove(index) removes an option; no-argument remove removes the element", () => {
	const { select, get } = fixture();
	select.remove(-1);
	select.remove(20);
	expect(select.length).toBe(2);
	select.remove(1);
	expect(select.length).toBe(1);
	expect(get("select")).toBe(select);
	select.remove();
	expect(select.isConnected).toBe(false);
	expect(select.options.length).toBe(1);
});

it("property writes do not dispatch input/change but native selection still does", async () => {
	const { tree, select, id } = fixture();
	const interactions = new DocumentInteractions(tree);
	const events: string[] = [];
	interactions.events.addEventListener(id("select"), "input", () => {
		events.push("input");
	});
	interactions.events.addEventListener(id("select"), "change", () => {
		events.push("change");
	});
	select.value = "two";
	expect(events).toEqual([]);
	expect(controlValue(tree, id("select"))).toBe("two");
	await interactions.selectAsync(tree.reference(id("select")), ["one"]);
	expect(events).toEqual(["input", "change"]);
	expect(select.value).toBe("one");
	expect(selectedOptions(tree, id("select"))[0].id).toBe(id("first"));
});

it("saved properties and collections are revoked when the script DOM closes", () => {
	const { dom, select, get } = fixture();
	const option = get("first");
	const options = select.options;
	dom.close();
	expect(() => select.value).toThrow(/closed/);
	expect(() => {
		option.selected = true;
	}).toThrow(/closed/);
	expect(() => options.length).toThrow(/closed/);
});

it("unsupported collection resizing fails without changing the tree", () => {
	const { select, tree } = fixture();
	const before = tree.revision;
	expect(() => {
		select.length = 100;
	}).toThrow(/not implemented/);
	expect(tree.revision).toBe(before);
});
