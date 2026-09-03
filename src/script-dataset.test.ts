import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { type ScriptDatasetLimits, ScriptDatasets } from "./script-dataset.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Element {
	readonly dataset: Record<string, unknown>;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	innerHTML: string;
	cloneNode(deep?: boolean): Element;
}

function createHostObject(definition: ScriptHostObjectDefinition): object {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(target, name, { value: method });
	const named = definition.named;
	if (!named) return Object.preventExtensions(target);
	return new Proxy(target, {
		get(object, key) {
			if (Reflect.has(object, key)) return Reflect.get(object, key);
			return typeof key === "string" ? named.get(key) : undefined;
		},
		set(_object, key, value) {
			if (typeof key !== "string" || !named.set) return false;
			named.set(key, value);
			return true;
		},
		deleteProperty(_object, key) {
			return typeof key === "string" && named.delete
				? named.delete(key)
				: false;
		},
		has(object, key) {
			return (
				Reflect.has(object, key) ||
				(typeof key === "string" && named.keys().includes(key))
			);
		},
		ownKeys(object) {
			return [...new Set([...Reflect.ownKeys(object), ...named.keys()])];
		},
		getOwnPropertyDescriptor(object, key) {
			const existing = Reflect.getOwnPropertyDescriptor(object, key);
			if (existing) return existing;
			if (typeof key !== "string" || !named.keys().includes(key))
				return undefined;
			return {
				value: named.get(key),
				writable: !!named.set,
				enumerable: named.enumerable !== false,
				configurable: true,
			};
		},
	});
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(source = '<div id="target"></div>') {
	const tree = parseHtmlDocument(source, "https://example.test/");
	const dom = new ScriptDom(tree, { createHostObject });
	cleanup.push(() => tree.close());
	const document = dom.document as { getElementById(name: string): Element };
	return { tree, dom, element: document.getElementById("target") };
}

it("exposes a stable readonly dataset with live enumerable data properties", () => {
	const { element, dom } = fixture(
		'<div id="target" data-user-id="42" data-empty=""></div>',
	);
	const dataset = element.dataset;
	expect(dataset).toBeDefined();
	expect(element.dataset).toBe(dataset);
	expect(dataset.userId).toBe("42");
	expect(dataset.empty).toBe("");
	expect(dataset.missing).toBeUndefined();
	expect(Object.keys(dataset)).toEqual(["userId", "empty"]);
	expect({ ...dataset }).toEqual({ userId: "42", empty: "" });
	expect(Reflect.set(element, "dataset", {})).toBe(false);
	expect("dataset" in dom.document).toBe(false);
});

it.each([
	["data-", ""],
	["data-user-id", "userId"],
	["data--flag", "Flag"],
	["data-a--b", "a-B"],
	["data-x-9", "x-9"],
	["data-x-", "x-"],
	["data-a.b:c_d", "a.b:c_d"],
	["data-Ü", "Ü"],
	["data-ü", "ü"],
	["data-İ", "İ"],
	["data-Σ", "Σ"],
	["data-𐐀", "𐐀"],
])("maps %s to dataset[%s] without Unicode folding", (attribute, key) => {
	const { element } = fixture(`<div id="target" ${attribute}="before"></div>`);
	expect(element.dataset[key]).toBe("before");
	element.dataset[key] = "after";
	expect(element.getAttribute(attribute)).toBe("after");
	expect(element.hasAttribute(attribute)).toBe(true);
	expect(Object.keys(element.dataset)).toEqual([key]);
	expect(delete element.dataset[key]).toBe(true);
	expect(element.getAttribute(attribute)).toBeNull();
});

it("tracks direct attribute mutations and dataset writes in both directions", () => {
	const { element } = fixture();
	const dataset = element.dataset;
	element.setAttribute("DATA-NEXT-VALUE", "first");
	expect(dataset.nextValue).toBe("first");
	dataset.nextValue = "second";
	expect(element.getAttribute("data-next-value")).toBe("second");
	element.removeAttribute("DATA-NEXT-VALUE");
	expect("nextValue" in dataset).toBe(false);
	expect(Object.keys(dataset)).toEqual([]);
});

it("keeps non-ASCII attribute names distinct across native creation, lookup and mutation", () => {
	const tree = new DocumentTree("about:blank");
	cleanup.push(() => tree.close());
	const id = tree.createElement("div", {
		"DATA-Ü": "upper",
		"data-ü": "lower",
	});
	expect(tree.get(id).attributes).toEqual({
		"data-Ü": "upper",
		"data-ü": "lower",
	});
	const upper = tree.getAttributeNode(id, "DATA-Ü");
	const lower = tree.getAttributeNode(id, "data-ü");
	expect(upper).not.toBe(lower);
	tree.setAttribute(id, "DATA-Ü", "changed");
	expect(tree.get(id).attributes["data-ü"]).toBe("lower");
	tree.removeAttribute(id, "data-Ü");
	expect(tree.get(id).attributes).toEqual({ "data-ü": "lower" });
});

it("serializes dataset mutations through the shared document tree", () => {
	const { tree, element } = fixture();
	element.dataset.state = '<ready & "set">';
	expect(serializeHtml(tree)).toContain(
		'data-state="&lt;ready &amp; &quot;set&quot;&gt;"',
	);
});

it.each([
	[null, "null"],
	[undefined, "undefined"],
	[false, "false"],
	[42, "42"],
	[0n, "0"],
	[Number.NaN, "NaN"],
])("converts primitive dataset values %s to DOM strings", (value, expected) => {
	const { element } = fixture();
	element.dataset.value = value;
	expect(element.getAttribute("data-value")).toBe(expected);
});

it("does not invoke guest object or symbol coercions on dataset assignment", () => {
	const { tree, element } = fixture(
		'<div id="target" data-value="before"></div>',
	);
	let coerced = 0;
	const revision = tree.revision;
	for (const value of [
		{
			toString() {
				coerced++;
				return "bad";
			},
		},
		() => "bad",
		Symbol("bad"),
	])
		expect(() => {
			element.dataset.value = value;
		}).toThrow(/conversion/i);
	expect(coerced).toBe(0);
	expect(element.dataset.value).toBe("before");
	expect(tree.revision).toBe(revision);
});

it.each(["user-id", "a-b", "-lower"])(
	"rejects ambiguous setter names without aliasing an existing key: %s",
	(name) => {
		const { tree, element } = fixture(
			`<div id="target" data-${name}="before"></div>`,
		);
		const revision = tree.revision;
		expect(element.dataset[name]).toBeUndefined();
		expect(() => {
			element.dataset[name] = "bad";
		}).toThrow(/hyphen/i);
		expect(delete element.dataset[name]).toBe(true);
		expect(element.getAttribute(`data-${name}`)).toBe("before");
		expect(tree.revision).toBe(revision);
	},
);

it.each(["white space", "slash/", "equals=", "end>", "null\0"])(
	"rejects invalid attribute names before mutating: %s",
	(name) => {
		const { tree, element } = fixture();
		const revision = tree.revision;
		expect(() => {
			element.dataset[name] = "bad";
		}).toThrow(/attribute name/i);
		expect(Object.keys(element.dataset)).toEqual([]);
		expect(tree.revision).toBe(revision);
	},
);

it("handles prototype-like names as data without changing host prototypes", () => {
	const { element } = fixture();
	const dataset = element.dataset;
	const prototype = Object.getPrototypeOf(dataset);
	for (const name of [
		"__proto__",
		"constructor",
		"prototype",
		"toString",
		"hasOwnProperty",
	]) {
		dataset[name] = name;
		expect(dataset[name]).toBe(name);
		expect(Object.hasOwn(dataset, name)).toBe(true);
	}
	expect(Object.getPrototypeOf(dataset)).toBe(prototype);
	expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	expect(Object.keys(dataset)).toEqual([
		"__proto__",
		"constructor",
		"prototype",
		"toString",
		"hasOwnProperty",
	]);
});

it("keeps attribute-list order even for numeric dataset keys", () => {
	const { element } = fixture(
		'<div id="target" data-9="nine" data-1="one" data-next="next"></div>',
	);
	expect(Object.keys(element.dataset)).toEqual(["9", "1", "next"]);
	element.dataset[9] = "updated";
	expect(Object.keys(element.dataset)).toEqual(["9", "1", "next"]);
	expect(Reflect.deleteProperty(element.dataset, "9")).toBe(true);
	element.dataset[9] = "reinserted";
	expect(Object.keys(element.dataset)).toEqual(["1", "next", "9"]);
});

it("preserves distinct Unicode names during streamed attribute tokenization", () => {
	const source = '<div DATA-İ="upper" data-i="lower" data-Ü="other">';
	for (let split = 1; split < source.length; split++) {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (issue) => issues.push(issue));
		tokenizer.setBoundary(split);
		expect(tokenizer.next()).toBeUndefined();
		tokenizer.setBoundary(undefined);
		expect(tokenizer.next()).toMatchObject({
			attributes: { "data-İ": "upper", "data-i": "lower", "data-Ü": "other" },
		});
		expect(issues).toEqual([]);
	}
});

it("keeps dataset values synchronized with attached Attr identities", () => {
	const { tree, element } = fixture('<div id="target" DATA-Ü="before"></div>');
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw new Error("Missing fixture element");
	const attribute = tree.getAttributeNode(id, "DATA-Ü");
	if (attribute === null) throw new Error("Missing fixture attribute");
	element.dataset.Ü = "after";
	expect(tree.getAttributeRecord(attribute)).toMatchObject({
		name: "data-Ü",
		value: "after",
		ownerElement: id,
	});
	delete element.dataset.Ü;
	expect(tree.getAttributeRecord(attribute).ownerElement).toBeNull();
	const replacement = tree.createAttribute("DATA-Ü", "new");
	tree.setAttributeNode(id, replacement);
	expect(element.dataset.Ü).toBe("new");
	expect(tree.getAttributeNode(id, "DATA-Ü")).toBe(replacement);
});

it("invalidates selector state and preserves dataset identity through content edits and detachment", () => {
	const { tree, element } = fixture();
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	if (id === null) throw new Error("Missing fixture element");
	const dataset = element.dataset;
	expect(queries.querySelector('[data-state="ready"]')).toBeNull();
	dataset.state = "ready";
	expect(queries.querySelector('[data-state="ready"]')).toBe(id);
	element.innerHTML = '<span data-child="yes"></span>';
	expect(element.dataset).toBe(dataset);
	expect(Object.keys(dataset)).toEqual(["state"]);
	tree.remove(id);
	dataset.state = "detached";
	expect(element.getAttribute("data-state")).toBe("detached");
	expect(queries.querySelector('[data-state="detached"]')).toBeNull();
	queries.close();
});

it("does not share dataset capabilities between clones or document owners", () => {
	const first = fixture('<div id="target" data-value="first"></div>');
	const second = fixture('<div id="target" data-value="second"></div>');
	const clone = first.element.cloneNode();
	expect(clone.dataset).not.toBe(first.element.dataset);
	clone.dataset.value = "clone";
	expect(first.element.dataset.value).toBe("first");
	expect(second.element.dataset.value).toBe("second");
	expect(clone.dataset.value).toBe("clone");
});

it.each(["binding", "tree"])(
	"revokes all saved dataset operations on %s close",
	(owner) => {
		const { tree, dom, element } = fixture(
			'<div id="target" data-value="before"></div>',
		);
		const dataset = element.dataset;
		if (owner === "binding") dom.close();
		else tree.close();
		for (const operation of [
			() => element.dataset,
			() => dataset.value,
			() => Object.keys(dataset),
			() => {
				dataset.value = "after";
			},
			() => Reflect.deleteProperty(dataset, "value"),
		])
			expect(operation).toThrow(/closed/i);
	},
);

function boundedFixture(
	limits: Partial<ScriptDatasetLimits> = {},
	textLimit = 1000,
) {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: textLimit });
	cleanup.push(() => tree.close());
	const id = tree.createElement("div");
	const store = new ScriptDatasets(tree, { createHostObject }, limits);
	cleanup.push(() => store.close());
	return { tree, id, store, dataset: store.get(id) as Record<string, unknown> };
}

it("preflights dataset key-count limits without partial writes and allows recovery", () => {
	const { tree, id, dataset } = boundedFixture({ maxKeys: 1 });
	dataset.first = "before";
	const revision = tree.revision;
	expect(() => {
		dataset.second = "bad";
	}).toThrow(/key limit/i);
	expect(tree.revision).toBe(revision);
	expect(Object.keys(dataset)).toEqual(["first"]);
	dataset.first = "after";
	expect(dataset.first).toBe("after");
	tree.setAttribute(id, "data-second", "external");
	expect(() => Object.keys(dataset)).toThrow(/key limit/i);
	expect(Reflect.deleteProperty(dataset, "first")).toBe(true);
	expect(Object.keys(dataset)).toEqual(["second"]);
});

it("preflights aggregate key units and bounds individual property requests", () => {
	const { tree, dataset } = boundedFixture({ maxKeyCodeUnits: 3 });
	dataset.ab = "value";
	const revision = tree.revision;
	expect(() => {
		dataset.cd = "bad";
	}).toThrow(/key limit/i);
	expect(() => dataset.long).toThrow(/name limit/i);
	expect(() => {
		dataset.long = "bad";
	}).toThrow(/name limit/i);
	expect(() => Reflect.deleteProperty(dataset, "long")).toThrow(/name limit/i);
	expect(tree.revision).toBe(revision);
	dataset.c = "fits";
	expect(Object.keys(dataset)).toEqual(["ab", "c"]);
});

it("charges irrelevant attribute names against the traversal-work limit", () => {
	const { tree, id, dataset } = boundedFixture({ maxWork: 4 });
	tree.setAttribute(id, "title", "value");
	const revision = tree.revision;
	expect(() => Object.keys(dataset)).toThrow(/work limit/i);
	expect(() => {
		dataset.value = "bad";
	}).toThrow(/work limit/i);
	expect(tree.revision).toBe(revision);
	tree.removeAttribute(id, "title");
	expect(Object.keys(dataset)).toEqual([]);
});

it("shares native text quotas and leaves value, Attr and revision unchanged on failure", () => {
	const { tree, id, dataset } = boundedFixture({}, 30);
	dataset.a = "before";
	const attribute = tree.getAttributeNode(id, "data-a");
	if (attribute === null) throw new Error("Missing fixture attribute");
	const revision = tree.revision;
	expect(() => {
		dataset.a = "a very long replacement value";
	}).toThrow(/text limit/i);
	expect(dataset.a).toBe("before");
	expect(tree.getAttributeRecord(attribute).value).toBe("before");
	expect(tree.revision).toBe(revision);
});

it("bounds retained maps without evicting existing capabilities", () => {
	const { tree, id, store, dataset } = boundedFixture({ maxMaps: 1 });
	expect(store.get(id)).toBe(dataset);
	expect(() => store.get(tree.createElement("p"))).toThrow(/map limit/i);
	dataset.a = "still live";
	expect(dataset.a).toBe("still live");
	store.close();
	expect(() => Object.keys(dataset)).toThrow(/closed/i);
});

it("validates dataset owners and limits before creating capabilities", () => {
	const tree = new DocumentTree("about:blank");
	cleanup.push(() => tree.close());
	for (const limits of [
		{ maxMaps: 0 },
		{ maxKeys: Number.NaN },
		{ maxWork: -1 },
		{ maxKeyCodeUnits: 1.5 },
	])
		expect(
			() => new ScriptDatasets(tree, { createHostObject }, limits),
		).toThrow(/limit/i);
	const store = new ScriptDatasets(tree, { createHostObject });
	cleanup.push(() => store.close());
	for (const id of [
		tree.root,
		tree.createText("text"),
		tree.createComment("comment"),
		tree.createFragment(),
	])
		expect(() => store.get(id)).toThrow(/element/i);
});

it("does not retain failed host construction or spend its map capacity", () => {
	const tree = new DocumentTree("about:blank");
	cleanup.push(() => tree.close());
	const id = tree.createElement("div");
	let attempts = 0;
	const store = new ScriptDatasets(
		tree,
		{
			createHostObject(definition) {
				if (++attempts === 1) throw new Error("factory failure");
				return createHostObject(definition);
			},
		},
		{ maxMaps: 1 },
	);
	cleanup.push(() => store.close());
	expect(() => store.get(id)).toThrow("factory failure");
	const dataset = store.get(id) as Record<string, unknown>;
	dataset.ready = "yes";
	expect(store.get(id)).toBe(dataset);
	expect(dataset.ready).toBe("yes");
	expect(attempts).toBe(2);
});
