import { afterEach, expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Control {
	defaultValue: unknown;
	defaultChecked: unknown;
	value: unknown;
	checked: boolean;
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(
	tag = "input",
	attributes: Record<string, string> = {},
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/", limits);
	const form = tree.createElement("form");
	const id = tree.createElement(tag, attributes);
	tree.append(tree.root, form);
	tree.append(form, id);
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(target, name, { value: method });
			return Object.preventExtensions(target);
		},
	});
	const events = new DocumentEvents(tree);
	const forms = new DocumentForms(tree, events);
	cleanup.push(() => tree.close());
	return { tree, dom, form, id, forms, control: dom.node(id) as Control };
}

it("reflects the input default value and updates a clean current value", () => {
	const { tree, id, control } = fixture("input", { value: "initial" });
	expect(control.defaultValue).toBe("initial");
	control.defaultValue = "updated";
	expect(tree.get(id).attributes.value).toBe("updated");
	expect(control.value).toBe("updated");
});

it("keeps edited input state separate from its reset default", () => {
	const { tree, id, form, forms, control } = fixture("input", {
		value: "initial",
	});
	control.value = "edited";
	control.defaultValue = "reset";
	expect(control.value).toBe("edited");
	expect(control.defaultValue).toBe("reset");
	forms.reset(tree.reference(form));
	expect(controlValue(tree, id)).toBe("reset");
});

it("reflects checked presence without overwriting dirty checkedness", () => {
	const { tree, form, forms, id, control } = fixture("input", {
		type: "checkbox",
	});
	expect(control.defaultChecked).toBe(false);
	control.defaultChecked = true;
	expect(controlChecked(tree, id)).toBe(true);
	control.checked = false;
	control.defaultChecked = true;
	expect(control.checked).toBe(false);
	forms.reset(tree.reference(form));
	expect(control.checked).toBe(true);
});

it("reads only direct textarea text children for defaults and clean values", () => {
	const { tree, id, control } = fixture("textarea");
	tree.append(id, tree.createText("first\r\n"));
	const nested = tree.createElement("span");
	tree.append(nested, tree.createText("not a default"));
	tree.append(id, nested);
	tree.append(id, tree.createComment("ignored"));
	tree.append(id, tree.createText("last"));
	expect(control.defaultValue).toBe("first\r\nlast");
	expect(controlValue(tree, id)).toBe("first\nlast");
});

it("replaces textarea children without overwriting an edited value", () => {
	const { tree, id, form, forms, control } = fixture("textarea");
	const old = tree.createText("old");
	tree.append(id, old);
	control.value = "edited";
	control.defaultValue = "new\rdefault";
	expect(tree.get(old).parent).toBe(null);
	expect(control.defaultValue).toBe("new\rdefault");
	expect(control.value).toBe("edited");
	forms.reset(tree.reference(form));
	expect(control.value).toBe("new\ndefault");
});

it.each(["input", "textarea"])(
	"uses DOMString null conversion for %s defaults",
	(tag) => {
		const { control } = fixture(tag);
		control.defaultValue = null;
		expect(control.defaultValue).toBe("null");
		control.value = null;
		expect(control.value).toBe("");
	},
);

it("does not expose input defaults on ordinary elements", () => {
	const { control } = fixture("div");
	expect(control.defaultValue).toBeUndefined();
	expect(control.defaultChecked).toBeUndefined();
});

it.each(["input", "textarea"])(
	"keeps a same-value script write dirty on %s",
	(tag) => {
		const { control } = fixture(tag);
		control.defaultValue = "initial";
		control.value = "initial";
		control.defaultValue = "later";
		expect(control.value).toBe("initial");
	},
);

it.each([undefined, false, 42, 0n])(
	"stringifies primitive default values: %s",
	(value) => {
		for (const tag of ["input", "textarea"]) {
			const { control } = fixture(tag);
			control.defaultValue = value;
			expect(control.defaultValue).toBe(String(value));
		}
	},
);

it.each([false, null, undefined, 0, "", true, "false", {}, Symbol("truthy")])(
	"uses boolean conversion for defaultChecked: %s",
	(value) => {
		const { tree, id, control } = fixture("input", {
			type: "checkbox",
			checked: "initial",
		});
		control.defaultChecked = value;
		expect(control.defaultChecked).toBe(Boolean(value));
		expect(Object.hasOwn(tree.get(id).attributes, "checked")).toBe(
			Boolean(value),
		);
	},
);

it("keeps defaults live across native Attr edits and removal", () => {
	const { tree, id, control } = fixture("input", {
		value: "before",
		checked: "false",
	});
	const attribute = tree.getAttributeNode(id, "value");
	if (attribute === null) throw new Error("Missing default attribute");
	tree.setAttribute(id, "value", "native");
	expect(control.defaultValue).toBe("native");
	expect(tree.getAttributeNode(id, "value")).toBe(attribute);
	expect(control.defaultChecked).toBe(true);
	tree.removeAttribute(id, "value");
	tree.removeAttribute(id, "checked");
	expect(control.defaultValue).toBe("");
	expect(control.defaultChecked).toBe(false);
});

it.each(["checkbox", "radio", "hidden", "submit", "reset", "button"])(
	"shares value-mode reflection for %s input defaults",
	(type) => {
		const { control } = fixture("input", { type });
		control.value = "current";
		expect(control.defaultValue).toBe("current");
		control.defaultValue = "default";
		expect(control.value).toBe("default");
	},
);

it("keeps raw defaults separate from current-value sanitization", () => {
	const { control } = fixture("input", { type: "number" });
	control.defaultValue = "not a number";
	expect(control.defaultValue).toBe("not a number");
	expect(control.value).toBe("");
	control.defaultValue = "4.25";
	expect(control.value).toBe("4.25");
});

it("updates textarea defaults after text edits without reading nested descendants", () => {
	const { tree, id, control } = fixture("textarea");
	const text = tree.createText("before");
	tree.append(id, text);
	const nested = tree.createElement("span");
	tree.append(id, nested);
	for (let index = 0; index < 100; index++)
		tree.append(nested, tree.createText("ignored"));
	const originalGet = tree.get.bind(tree);
	let reads = 0;
	tree.get = (target) => {
		reads++;
		return originalGet(target);
	};
	expect(control.defaultValue).toBe("before");
	expect(reads).toBe(4);
	tree.setData(text, "after");
	expect(control.value).toBe("after");
	control.defaultValue = "";
	expect(tree.get(id).children).toEqual([]);
	expect(control.value).toBe("");
});

it.each(["input", "textarea"])(
	"preserves current/default separation through cloning %s",
	(tag) => {
		const { tree, dom, id, control } = fixture(tag);
		control.defaultValue = "default";
		control.value = "edited";
		const clone = dom.node(tree.clone(id, true)) as Control;
		expect(clone.defaultValue).toBe("default");
		expect(clone.value).toBe("edited");
		clone.defaultValue = "clone default";
		expect(control.defaultValue).toBe("default");
	},
);

it.each(["input", "textarea"])(
	"uses edited values for submission and defaults after reset: %s",
	(tag) => {
		const { tree, id, form, forms, control } = fixture(tag, { name: "field" });
		control.defaultValue = "default";
		control.value = "edited";
		const submitted = () =>
			new URL(
				prepareFormSubmission(tree, tree.reference(form)).request.url,
			).searchParams.get("field");
		expect(submitted()).toBe("edited");
		expect(serializeHtml(tree, id, { includeSelf: true })).toContain("default");
		expect(serializeHtml(tree, id, { includeSelf: true })).not.toContain(
			"edited",
		);
		forms.reset(tree.reference(form));
		expect(submitted()).toBe("default");
		control.defaultValue = "new clean default";
		expect(control.value).toBe("new clean default");
	},
);

it("keeps checked-state selectors separate from default-attribute selectors", () => {
	const { tree, id, control } = fixture("input", { type: "checkbox" });
	const queries = new DocumentQueries(tree);
	control.defaultChecked = true;
	expect(queries.matches(id, ":checked")).toBe(true);
	control.checked = false;
	expect(queries.matches(id, ":checked")).toBe(false);
	expect(queries.matches(id, "[checked]")).toBe(true);
	control.defaultChecked = false;
	expect(queries.matches(id, "[checked]")).toBe(false);
	expect(queries.matches(id, ":checked")).toBe(false);
});

it.each(["input", "textarea"])(
	"rejects oversized %s defaults without partial mutation",
	(tag) => {
		const { tree, id, control } = fixture(tag, {}, { maxTextCodeUnits: 64 });
		control.defaultValue = "old";
		control.value = "edited";
		const before = tree.get(id);
		const revision = tree.revision;
		const count = tree.nodeCount;
		expect(() => {
			control.defaultValue = "x".repeat(65);
		}).toThrow(/text limit/);
		expect(tree.get(id)).toBe(before);
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
		expect(control.defaultValue).toBe("old");
		expect(control.value).toBe("edited");
	},
);

it("fails textarea replacement atomically at the node limit", () => {
	const { tree, id, control } = fixture("textarea", {}, { maxNodes: 4 });
	control.defaultValue = "old";
	const before = tree.get(id);
	expect(() => {
		control.defaultValue = "new";
	}).toThrow(/node limit/);
	expect(tree.get(id)).toBe(before);
	expect(control.defaultValue).toBe("old");
});

it.each(["input", "textarea"])(
	"rejects object/string coercion without side effects: %s",
	(tag) => {
		const { control } = fixture(tag);
		control.defaultValue = "old";
		let calls = 0;
		const value = {
			toString() {
				calls++;
				return "coerced";
			},
		};
		expect(() => {
			control.defaultValue = value;
		}).toThrow(/conversion/);
		expect(() => {
			control.defaultValue = Symbol("invalid");
		}).toThrow(/conversion/);
		expect(calls).toBe(0);
		expect(control.defaultValue).toBe("old");
	},
);

it.each(["input", "textarea"])(
	"revokes default access after DOM closure: %s",
	(tag) => {
		const { dom, control } = fixture(tag);
		dom.close();
		expect(() => control.defaultValue).toThrow(/closed/);
		expect(() => {
			control.defaultValue = "new";
		}).toThrow(/closed/);
		if (tag === "input") {
			expect(() => control.defaultChecked).toThrow(/closed/);
			expect(() => {
				control.defaultChecked = true;
			}).toThrow(/closed/);
		}
	},
);
