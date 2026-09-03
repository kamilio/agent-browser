import { afterEach, expect, it } from "vitest";
import { controlChecked, isControlDisabled } from "./controls.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Element {
	getAttribute(...args: unknown[]): string | null;
	hasAttribute(...args: unknown[]): boolean;
	setAttribute(...args: unknown[]): void;
	removeAttribute(...args: unknown[]): void;
	toggleAttribute(...args: unknown[]): boolean;
	hasAttributes(...args: unknown[]): boolean;
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(source = '<input id="target">') {
	const tree = parseHtmlDocument(source, "https://fixture.invalid/");
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
	const id = queries.querySelector("#target");
	if (id === null) throw new Error("Missing attribute fixture element");
	return { tree, dom, queries, id, element: dom.node(id) as Element };
}

it("toggles attribute presence and returns the resulting state", () => {
	const { element } = fixture();
	expect(element.toggleAttribute("disabled")).toBe(true);
	expect(element.getAttribute("disabled")).toBe("");
	expect(element.toggleAttribute("disabled")).toBe(false);
	expect(element.hasAttribute("disabled")).toBe(false);
});

it("preserves existing values, Attr identity and revision for forced no-ops", () => {
	const { tree, id, element } = fixture('<input id="target" disabled="kept">');
	const attribute = tree.getAttributeNode(id, "disabled");
	const revision = tree.revision;
	const nodeCount = tree.nodeCount;
	expect(element.toggleAttribute("DISABLED", true)).toBe(true);
	expect(element.getAttribute("disabled")).toBe("kept");
	expect(element.toggleAttribute("absent", false)).toBe(false);
	expect(tree.getAttributeNode(id, "disabled")).toBe(attribute);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(nodeCount);
});

it.each([false, true])(
	"treats an explicitly undefined force as omitted when present=%s",
	(present) => {
		const { element } = fixture();
		if (present) element.setAttribute("flag", "before");
		expect(element.toggleAttribute("flag", undefined)).toBe(!present);
		expect(element.hasAttribute("flag")).toBe(!present);
	},
);

it.each([
	"getAttribute",
	"hasAttribute",
	"removeAttribute",
	"setAttribute",
	"toggleAttribute",
] as const)(
	"rejects omitted mandatory arguments to %s without changing an undefined-named attribute",
	(method) => {
		const { tree, element } = fixture('<input id="target" undefined="kept">');
		const revision = tree.revision;
		expect(() => element[method]()).toThrow();
		expect(element.getAttribute("undefined")).toBe("kept");
		expect(tree.revision).toBe(revision);
	},
);

it("requires a setAttribute value but still stringifies explicit undefined", () => {
	const { tree, element } = fixture();
	const revision = tree.revision;
	expect(() => element.setAttribute("flag")).toThrow();
	expect(tree.revision).toBe(revision);
	element.setAttribute("flag", undefined);
	expect(element.getAttribute("flag")).toBe("undefined");
	expect(element.getAttribute(undefined)).toBeNull();
});

it("reports any attribute presence including prototype-like and empty-valued attributes", () => {
	const { element } = fixture();
	expect(element.hasAttributes()).toBe(true);
	element.removeAttribute("id");
	expect(element.hasAttributes()).toBe(false);
	element.setAttribute("__proto__", "");
	expect(element.hasAttributes()).toBe(true);
	element.removeAttribute("__proto__");
	expect(element.hasAttributes()).toBe(false);
});

it.each([null, false, 0, "", Number.NaN, 0n])(
	"converts falsy force %s without toggling it back on",
	(force) => {
		const { element } = fixture('<input id="target" flag="present">');
		expect(element.toggleAttribute("flag", force)).toBe(false);
		expect(element.toggleAttribute("flag", force)).toBe(false);
		expect(element.hasAttribute("flag")).toBe(false);
	},
);

it.each([true, 1, "false", 1n, {}, Symbol("truthy")])(
	"converts truthy force %s without replacing existing values",
	(force) => {
		const { element } = fixture();
		expect(element.toggleAttribute("flag", force)).toBe(true);
		element.setAttribute("flag", "kept");
		expect(element.toggleAttribute("flag", force)).toBe(true);
		expect(element.getAttribute("flag")).toBe("kept");
	},
);

it("does not invoke object coercion for boolean force or ignored extra arguments", () => {
	const { element } = fixture();
	let coerced = 0;
	const value = {
		[Symbol.toPrimitive]() {
			coerced++;
			throw new Error("unexpected coercion");
		},
	};
	expect(element.toggleAttribute("flag", value, value)).toBe(true);
	expect(element.getAttribute("flag", value)).toBe("");
	expect(element.hasAttribute("flag", value)).toBe(true);
	expect(element.hasAttributes(value)).toBe(true);
	element.setAttribute("flag", "kept", value);
	element.removeAttribute("flag", value);
	expect(coerced).toBe(0);
});

it.each(["", "bad name", "bad/", "bad=", "bad>", "bad\0"])(
	"validates toggle names even when forced removal would be a no-op: %s",
	(name) => {
		const { tree, element } = fixture();
		const revision = tree.revision;
		expect(() => element.toggleAttribute(name, false)).toThrow(
			/attribute name/i,
		);
		expect(tree.revision).toBe(revision);
		expect(element.getAttribute(name)).toBeNull();
		expect(element.hasAttribute(name)).toBe(false);
		expect(() => element.removeAttribute(name)).not.toThrow();
		expect(tree.revision).toBe(revision);
	},
);

it("normalizes ASCII names without merging distinct non-ASCII names", () => {
	const { element } = fixture();
	expect(element.toggleAttribute("DATA-Ü", true)).toBe(true);
	expect(element.hasAttribute("data-Ü")).toBe(true);
	expect(element.hasAttribute("data-ü")).toBe(false);
	expect(element.toggleAttribute("data-ü", true)).toBe(true);
	element.removeAttribute("DATA-Ü");
	expect(element.hasAttribute("data-ü")).toBe(true);
});

it("detaches old Attr identities on removal and does not revive them on re-add", () => {
	const { tree, id, element } = fixture('<input id="target" flag="old">');
	const attribute = tree.getAttributeNode(id, "flag");
	if (attribute === null) throw new Error("Missing fixture attribute");
	expect(element.toggleAttribute("flag", false)).toBe(false);
	expect(tree.getAttributeRecord(attribute)).toMatchObject({
		value: "old",
		ownerElement: null,
	});
	expect(element.toggleAttribute("flag", true)).toBe(true);
	expect(element.getAttribute("flag")).toBe("");
	expect(tree.getAttributeNode(id, "flag")).not.toBe(attribute);
});

it("updates native disabled selectors and hidden styling through the same tree", () => {
	const { tree, id, element, queries } = fixture();
	const styles = documentStyles(tree);
	expect(isControlDisabled(tree, id)).toBe(false);
	expect(queries.querySelector("#target:disabled")).toBeNull();
	element.toggleAttribute("disabled", true);
	expect(isControlDisabled(tree, id)).toBe(true);
	expect(queries.querySelector("#target:disabled")).toBe(id);
	element.toggleAttribute("disabled", false);
	expect(queries.querySelector("#target:enabled")).toBe(id);
	expect(styles.get(id).display).not.toBe("none");
	element.toggleAttribute("hidden", true);
	expect(styles.get(id).display).toBe("none");
	element.toggleAttribute("hidden", false);
	expect(styles.get(id).display).not.toBe("none");
});

it("updates default checked state without overwriting a dirty checked value", () => {
	const { tree, id, element } = fixture('<input id="target" type="checkbox">');
	expect(controlChecked(tree, id)).toBe(false);
	element.toggleAttribute("checked", true);
	expect(controlChecked(tree, id)).toBe(true);
	tree.setControl(id, { checked: false });
	element.toggleAttribute("checked", false);
	element.toggleAttribute("checked", true);
	expect(element.hasAttribute("checked")).toBe(true);
	expect(controlChecked(tree, id)).toBe(false);
});

it("bounds attribute names before getter or mutation work", () => {
	const { tree, element } = fixture();
	const name = "a".repeat(65_537);
	const revision = tree.revision;
	for (const method of [
		"getAttribute",
		"hasAttribute",
		"removeAttribute",
		"toggleAttribute",
	] as const)
		expect(() => element[method](name)).toThrow(/name limit/i);
	expect(() => element.setAttribute(name, "value")).toThrow(/name limit/i);
	expect(tree.revision).toBe(revision);
});

it("rejects object name/value coercion without invoking it", () => {
	const { tree, element } = fixture();
	let coerced = false;
	const value = {
		toString() {
			coerced = true;
			return "bad";
		},
	};
	const revision = tree.revision;
	for (const method of [
		"getAttribute",
		"hasAttribute",
		"removeAttribute",
		"toggleAttribute",
	] as const)
		expect(() => element[method](value)).toThrow(/conversion/i);
	expect(() => element.setAttribute("flag", value)).toThrow(/conversion/i);
	expect(coerced).toBe(false);
	expect(tree.revision).toBe(revision);
});

it("keeps native toggle failure atomic at the text quota and allows no-op force calls", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 7 });
	cleanup.push(() => tree.close());
	const id = tree.createElement("div", { flag: "" });
	const revision = tree.revision;
	expect(tree.toggleAttribute(id, "flag", true)).toBe(true);
	expect(tree.toggleAttribute(id, "absent", false)).toBe(false);
	expect(() => tree.toggleAttribute(id, "other", true)).toThrow(/text limit/i);
	expect(tree.revision).toBe(revision);
	expect(tree.get(id).attributes).toEqual({ flag: "" });
	expect(tree.toggleAttribute(id, "flag", false)).toBe(false);
	expect(tree.toggleAttribute(id, "next", true)).toBe(true);
});

it("validates native force types and element ownership", () => {
	const tree = new DocumentTree("about:blank");
	cleanup.push(() => tree.close());
	const id = tree.createElement("div");
	expect(() =>
		tree.toggleAttribute(id, "flag", "true" as unknown as boolean),
	).toThrow(/boolean/i);
	expect(() => tree.toggleAttribute(tree.root, "flag")).toThrow(/element/i);
	expect(() => tree.toggleAttribute(-1, "flag")).toThrow();
	expect(tree.get(id).attributes).toEqual({});
});

it.each(["binding", "tree"])(
	"revokes all attribute operations on %s close",
	(owner) => {
		const { tree, dom, element } = fixture();
		if (owner === "binding") dom.close();
		else tree.close();
		for (const read of [
			() => element.getAttribute("id"),
			() => element.hasAttribute("id"),
			() => element.setAttribute("id", "bad"),
			() => element.removeAttribute("id"),
			() => element.toggleAttribute("id"),
			() => element.hasAttributes(),
		])
			expect(read).toThrow(/closed/i);
	},
);

it("does not install element attribute operations on document or character data capabilities", () => {
	const { tree, dom } = fixture();
	for (const id of [
		tree.root,
		tree.createText("text"),
		tree.createComment("comment"),
		tree.createFragment(),
	])
		for (const name of ["toggleAttribute", "hasAttributes", "setAttribute"])
			expect(name in dom.node(id)).toBe(false);
});

it.each(["constructor", "toString", "__proto__"])(
	"does not expose inherited attribute-view properties as %s values",
	(name) => {
		const { element } = fixture();
		expect(element.getAttribute(name)).toBeNull();
		expect(element.hasAttribute(name)).toBe(false);
		expect(element.toggleAttribute(name, true)).toBe(true);
		expect(element.getAttribute(name)).toBe("");
		element.removeAttribute(name);
		expect(element.getAttribute(name)).toBeNull();
	},
);
