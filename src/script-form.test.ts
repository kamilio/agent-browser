import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptCollections } from "./script-collections.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface List {
	readonly length: number;
	readonly [index: number]: Element | undefined;
	value: unknown;
	item(index: unknown): Element | null;
	namedItem(name: unknown): Element | List | null;
}
interface Element {
	id: string;
	name: string;
	value: unknown;
	checked: boolean;
	type: string;
	disabled: boolean;
	readOnly: boolean;
	required: boolean;
	method: string;
	action: string;
	enctype: string;
	encoding: string;
	target: string;
	autocomplete: string;
	acceptCharset: string;
	noValidate: boolean;
	form: Element | null;
	elements: List;
	forms: List;
	length: number;
	getElementById(id: string): Element;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
	appendChild(node: Element): Element;
	remove(): void;
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
function fixture() {
	const tree = parseHtmlDocument(
		'<input id="external" name="external" form="main" value="outside"><form id="main" name="primary"><input id="email" name="email"><input id="red" type="radio" name="color" value="red" checked><input id="blue" type="radio" name="color" value="blue"><input id="image" type="image" name="image"><button id="button" name="button">Go</button><fieldset id="fieldset"><textarea id="notes" name="notes"></textarea></fieldset></form><form id="other"></form>',
		"https://example.com/page",
	);
	documents.push(tree);
	const dom = new ScriptDom(tree, { createHostObject: factory });
	const document = dom.document as Element;
	const get = (id: string) => document.getElementById(id);
	const id = (name: string) => {
		const entry = [...tree.walk()].find(
			({ node }) => node.attributes.id === name,
		);
		if (!entry) throw new Error("Missing fixture node");
		return entry.node.id;
	};
	return { tree, dom, document, get, id, form: get("main") };
}

it("exposes a stable live document.forms collection in tree order", () => {
	const { document, form, get } = fixture();
	const forms = document.forms;
	expect(document.forms).toBe(forms);
	expect(forms.length).toBe(2);
	expect(forms[0]).toBe(form);
	expect(forms.namedItem("primary")).toBe(form);
	get("other").remove();
	expect(forms.length).toBe(1);
});

it("form.elements includes externally associated controls and fieldsets but excludes image inputs", () => {
	const { form, get } = fixture();
	const elements = form.elements;
	expect(form.elements).toBe(elements);
	expect(form.length).toBe(7);
	expect(elements.length).toBe(7);
	expect(elements[0]).toBe(get("external"));
	expect(elements.namedItem("fieldset")).toBe(get("fieldset"));
	expect(elements.namedItem("image")).toBe(null);
	expect(elements.item(99)).toBe(null);
	expect(elements[99]).toBe(undefined);
});

it("form collections track explicit association changes and form ID changes", () => {
	const { form, get } = fixture();
	const elements = form.elements;
	get("email").setAttribute("form", "other");
	expect(elements.namedItem("email")).toBe(null);
	expect(get("email").form).toBe(get("other"));
	form.id = "renamed";
	expect(elements.namedItem("external")).toBe(null);
	expect(get("external").form).toBe(null);
	get("external").setAttribute("form", "renamed");
	expect(elements[0]).toBe(get("external"));
});

it("namedItem returns one element or a fresh live group for multiple ID/name matches", () => {
	const { form, get } = fixture();
	expect(form.elements.namedItem("email")).toBe(get("email"));
	expect(form.elements.namedItem("")).toBe(null);
	expect(form.elements.namedItem("absent")).toBe(null);
	const group = form.elements.namedItem("color") as List;
	expect(group.length).toBe(2);
	expect(group[0]).toBe(get("red"));
	expect(form.elements.namedItem("color")).not.toBe(group);
	get("blue").name = "different";
	expect(group.length).toBe(1);
	expect(form.elements.namedItem("color")).toBe(get("red"));
	get("red").remove();
	expect(group.length).toBe(0);
	expect(group.value).toBe("");
});

it("group filters compare names as exact data including whitespace and selector punctuation", () => {
	const { form, get } = fixture();
	get("red").name = "a b'][x]";
	get("blue").name = "a b'][x]";
	const group = form.elements.namedItem("a b'][x]") as List;
	expect(group.length).toBe(2);
	expect(form.elements.namedItem("a b")).toBe(null);
	get("red").id = "a b'][x]";
	expect(group.length).toBe(2);
});

it("radio group value sets the first matching radio and updates native form serialization", () => {
	const { tree, form, get, id } = fixture();
	const group = form.elements.namedItem("color") as List;
	expect(group.value).toBe("red");
	group.value = "blue";
	expect(group.value).toBe("blue");
	expect(get("red").checked).toBe(false);
	expect(get("blue").checked).toBe(true);
	const request = prepareFormSubmission(
		tree,
		tree.reference(id("main")),
	).request;
	expect(new URL(request.url).searchParams.get("color")).toBe("blue");
});

it("radio value assignment ignores disabled actionability but does not change absent values", () => {
	const { tree, form, get } = fixture();
	const group = form.elements.namedItem("color") as List;
	get("blue").disabled = true;
	group.value = "blue";
	expect(get("blue").checked).toBe(true);
	const revision = tree.revision;
	group.value = "absent";
	expect(group.value).toBe("blue");
	expect(tree.revision).toBe(revision);
});

it("radio values default to on and empty explicit values remain distinct", () => {
	const { tree, form, get, id } = fixture();
	tree.removeAttribute(id("red"), "value");
	get("blue").value = "";
	const group = form.elements.namedItem("color") as List;
	expect(group.value).toBe("on");
	group.value = "";
	expect(get("blue").checked).toBe(true);
	group.value = "on";
	expect(get("red").checked).toBe(true);
});

it("mixed named groups ignore non-radio controls in value operations", () => {
	const { form, get } = fixture();
	get("email").id = "color";
	const group = form.elements.namedItem("color") as List;
	expect(group.length).toBe(3);
	expect(group.value).toBe("red");
	group.value = "blue";
	expect(get("blue").checked).toBe(true);
	get("red").type = "checkbox";
	get("blue").type = "checkbox";
	expect(group.value).toBe("");
});

it("radio-group arguments reject guest coercion hooks without changing native state", () => {
	const { tree, form } = fixture();
	const group = form.elements.namedItem("color") as List;
	let called = false;
	const value = {
		toString() {
			called = true;
			return "blue";
		},
	};
	const revision = tree.revision;
	expect(() => {
		group.value = value;
	}).toThrow(/conversion/);
	expect(() => form.elements.namedItem(value)).toThrow(/conversion/);
	expect(called).toBe(false);
	expect(tree.revision).toBe(revision);
});

it("reflects form metadata and canonical getter defaults", () => {
	const { form } = fixture();
	expect(form.method).toBe("get");
	expect(form.enctype).toBe("application/x-www-form-urlencoded");
	expect(form.autocomplete).toBe("on");
	form.method = "POST";
	expect(form.method).toBe("post");
	expect(form.getAttribute("method")).toBe("POST");
	form.method = "invalid";
	expect(form.method).toBe("get");
	form.encoding = "text/plain";
	expect(form.enctype).toBe("text/plain");
	form.enctype = "MULTIPART/FORM-DATA";
	expect(form.encoding).toBe("multipart/form-data");
	form.noValidate = true;
	expect(form.getAttribute("novalidate")).toBe("");
	form.noValidate = false;
	expect(form.getAttribute("novalidate")).toBe(null);
	form.acceptCharset = "UTF-8";
	expect(form.getAttribute("accept-charset")).toBe("UTF-8");
});

it("resolves form action against the current base but empty action uses document URL", () => {
	const { tree, form } = fixture();
	const base = tree.createElement("base", {
		href: "https://other.example/root/",
	});
	tree.append(tree.root, base);
	expect(form.action).toBe("https://example.com/page");
	form.action = "send";
	expect(form.action).toBe("https://other.example/root/send");
	form.action = "";
	expect(form.action).toBe("https://example.com/page");
	form.action = "http://[";
	expect(form.action).toBe("http://[");
});

it("reflected control properties update native attributes and live membership", () => {
	const { form, get } = fixture();
	get("email").name = "updated";
	get("email").readOnly = true;
	get("email").required = true;
	expect(get("email").getAttribute("readonly")).toBe("");
	expect(get("email").getAttribute("required")).toBe("");
	expect(form.elements.namedItem("updated")).toBe(get("email"));
	get("image").type = "text";
	expect(form.elements.namedItem("image")).toBe(get("image"));
	expect(form.length).toBe(8);
	get("email").type = "invalid";
	expect(get("email").type).toBe("text");
});

it("reflects own disability rather than inherited fieldset disability", () => {
	const { get } = fixture();
	get("fieldset").disabled = true;
	expect(get("notes").disabled).toBe(false);
	expect(get("fieldset").disabled).toBe(true);
	expect(get("notes").form).toBe(get("main"));
	get("button").type = "RESET";
	expect(get("button").type).toBe("reset");
	get("button").value = "reset-value";
	expect(get("button").getAttribute("value")).toBe("reset-value");
});

it("saved collections and groups are revoked with the script document", () => {
	const { dom, document, form } = fixture();
	const forms = document.forms;
	const elements = form.elements;
	const group = elements.namedItem("color") as List;
	dom.close();
	expect(() => forms.length).toThrow(/closed/);
	expect(() => elements.length).toThrow(/closed/);
	expect(() => group.value).toThrow(/closed/);
	expect(() => {
		group.value = "blue";
	}).toThrow(/closed/);
	expect(() => form.action).toThrow(/closed/);
});

it("fresh named-group capabilities respect existing collection count limits", () => {
	const { tree, id } = fixture();
	const collections = new ScriptCollections(
		tree,
		{ createHostObject: factory },
		(target) => ({ id: target }),
		{ maxCollections: 3 },
	);
	const list = collections.get(id("main"), "form-controls") as List;
	expect(list.namedItem("color")).not.toBe(list.namedItem("color"));
	expect(() => list.namedItem("color")).toThrow(/count limit/);
	collections.close();
	expect(collections.stats.cachedEntries).toBe(0);
});
