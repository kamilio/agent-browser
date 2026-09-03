import { afterEach, expect, it } from "vitest";
import { controlValidity, validityProperties } from "./control-validity.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptValidity } from "./script-validity.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function factory(definition: ScriptHostObjectDefinition) {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, property);
	Object.assign(target, definition.methods);
	return target;
}

function fixture(attributes: Record<string, string> = {}, tag = "input") {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement(tag, attributes);
	tree.append(tree.root, id);
	const dom = new ScriptDom(tree, { createHostObject: factory });
	return {
		tree,
		id,
		dom,
		page: dom.node(id) as { validity: Record<string, boolean> },
	};
}

it("exposes a stable live validity object across value changes", () => {
	const { tree, id, page } = fixture({ required: "" });
	const validity = page.validity;
	expect(validity).toBeDefined();
	expect(page.validity).toBe(validity);
	expect(validity.valueMissing).toBe(true);
	tree.setControl(id, { value: "filled" });
	expect(validity.valueMissing).toBe(false);
	expect(validity.valid).toBe(true);
});

it("reports custom error alongside native type mismatch", () => {
	const { tree, id, page } = fixture({ type: "email", value: "invalid" });
	tree.setCustomValidity(id, "custom");
	expect(page.validity.customError).toBe(true);
	expect(page.validity.typeMismatch).toBe(true);
	expect(page.validity.valid).toBe(false);
});

it("reports both range failures and a step mismatch without short circuiting", () => {
	const { page } = fixture({
		type: "number",
		value: "5",
		min: "10",
		max: "0",
		step: "2",
	});
	expect(page.validity.rangeUnderflow).toBe(true);
	expect(page.validity.rangeOverflow).toBe(true);
	expect(page.validity.stepMismatch).toBe(true);
});

it("keeps custom error visible on barred fields", () => {
	const { tree, id, page } = fixture({ disabled: "" });
	tree.setCustomValidity(id, "custom");
	expect(page.validity.customError).toBe(true);
	expect(page.validity.valid).toBe(false);
});

it.each<[string, Record<string, string>, boolean]>([
	["input", { required: "", disabled: "" }, false],
	["input", { required: "", readonly: "" }, false],
	["input", { type: "email", required: "", readonly: "" }, false],
	["input", { type: "number", required: "", disabled: "" }, false],
	["input", { type: "date", required: "", readonly: "" }, false],
	["textarea", { required: "", disabled: "" }, false],
	["textarea", { required: "", readonly: "" }, false],
	["input", { type: "checkbox", required: "", disabled: "" }, true],
	["input", { type: "file", required: "", disabled: "" }, true],
	["select", { required: "", disabled: "" }, true],
	["select", { required: "", readonly: "" }, true],
])(
	"distinguishes valueMissing from candidacy for %s %o",
	(tag, attributes, missing) => {
		const { page } = fixture(attributes, tag);
		expect(page.validity.valueMissing).toBe(missing);
		expect(page.validity.valid).toBe(!missing);
	},
);

it.each(["disabled", "readonly"])(
	"keeps email syntax errors visible when %s",
	(attribute) => {
		const { tree, id, page } = fixture({
			type: "email",
			value: "invalid",
			[attribute]: "",
		});
		expect(page.validity.typeMismatch).toBe(true);
		expect(page.validity.valid).toBe(false);
		const forms = new DocumentForms(tree, new DocumentEvents(tree));
		expect(forms.checkValidity(tree.reference(id))).toBe(true);
	},
);

it.each(["button", "fieldset", "object", "output"])(
	"exposes custom validity without inventing builtin failures on %s",
	(tag) => {
		const { tree, id, page } = fixture(
			{ required: "", pattern: "ignored" },
			tag,
		);
		for (const name of validityProperties)
			expect(page.validity[name]).toBe(name === "valid");
		tree.setCustomValidity(id, "custom");
		expect(page.validity.customError).toBe(true);
		expect(page.validity.valid).toBe(false);
		tree.setCustomValidity(id, "");
		expect(page.validity.valid).toBe(true);
	},
);

it.each(["hidden", "button", "reset", "submit", "image"])(
	"does not apply required to %s inputs",
	(type) => {
		const { page } = fixture({ type, required: "" });
		expect(page.validity.valueMissing).toBe(false);
		expect(page.validity.valid).toBe(true);
	},
);

it("does not create a required radio group from an absent or empty name", () => {
	const { tree, id, page } = fixture({ type: "radio", required: "" });
	const forms = new DocumentForms(tree, new DocumentEvents(tree));
	expect(page.validity.valueMissing).toBe(false);
	expect(forms.checkValidity(tree.reference(id))).toBe(true);
	tree.setAttribute(id, "name", "");
	expect(page.validity.valueMissing).toBe(false);
	tree.setAttribute(id, "name", "group");
	expect(page.validity.valueMissing).toBe(true);
	expect(forms.checkValidity(tree.reference(id))).toBe(false);
	tree.removeAttribute(id, "name");
	expect(page.validity.valueMissing).toBe(false);
});

it("refreshes held radio and select validity when their peer state changes", () => {
	const { tree, id, page } = fixture({
		type: "radio",
		name: "group",
		required: "",
	});
	const validity = page.validity;
	const peer = tree.createElement("input", { type: "radio", name: "group" });
	tree.append(tree.root, peer);
	expect(validity.valueMissing).toBe(true);
	tree.setControl(peer, { checked: true });
	expect(validity.valueMissing).toBe(false);
	tree.setAttribute(peer, "name", "other");
	expect(validity.valueMissing).toBe(true);
	tree.setControl(id, { checked: true });
	expect(validity.valueMissing).toBe(false);
	const select = fixture({ required: "" }, "select");
	const selection = select.page.validity;
	const option = select.tree.createElement("option", { value: "" });
	select.tree.append(select.id, option);
	expect(selection.valueMissing).toBe(true);
	select.tree.setAttribute(option, "value", "chosen");
	expect(selection.valueMissing).toBe(false);
});

it("refreshes custom, numeric and type flags without replacing the page object", () => {
	const { tree, id, page } = fixture({
		type: "number",
		value: "5",
		min: "10",
		max: "0",
		step: "2",
	});
	const validity = page.validity;
	tree.setAttribute(id, "min", "0");
	expect(validity.rangeUnderflow).toBe(false);
	expect(validity.rangeOverflow).toBe(true);
	tree.removeAttribute(id, "max");
	tree.setAttribute(id, "step", "any");
	expect(validity.valid).toBe(true);
	tree.setAttribute(id, "type", "hidden");
	expect(page.validity).toBe(validity);
	tree.setCustomValidity(id, "custom");
	expect(validity.customError).toBe(true);
	expect(validity.valid).toBe(false);
});

it("retains external upload options for submission without inventing a page FileList", () => {
	const { tree, id, page } = fixture({ type: "file", required: "" });
	expect(page.validity.valueMissing).toBe(true);
	expect(
		controlValidity(tree, id, {
			files: new Map([[id, [{ name: "fixture.txt", data: new Uint8Array() }]]]),
		}).valueMissing,
	).toBe(false);
	expect(page.validity.valueMissing).toBe(true);
});

it("does not manufacture successful flags for unsupported constraint profiles", () => {
	const { tree, id, page } = fixture({ value: "value", pattern: "a+" });
	const validity = page.validity;
	expect(validity.customError).toBe(false);
	expect(() => validity.valid).toThrow(/not implemented/);
	expect(() => validity.patternMismatch).toThrow(/not implemented/);
	tree.setCustomValidity(id, "custom");
	expect(validity.customError).toBe(true);
	expect(validity.valid).toBe(false);
	expect(() => validity.patternMismatch).toThrow(/not implemented/);
	tree.setCustomValidity(id, "");
	tree.removeAttribute(id, "pattern");
	expect(validity.patternMismatch).toBe(false);
	expect(validity.valid).toBe(true);
});

it("provides readonly flags and immutable native snapshots without dispatching events", () => {
	const { tree, id, page } = fixture({ required: "" });
	const validity = page.validity;
	expect(Reflect.set(validity, "valueMissing", false)).toBe(false);
	expect(Reflect.set(validity, "valid", true)).toBe(false);
	const snapshot = controlValidity(tree, id);
	expect(Object.isFrozen(snapshot)).toBe(true);
	expect(Reflect.set(snapshot, "valueMissing", false)).toBe(false);
	const events = new DocumentEvents(tree);
	let invalid = 0;
	events.addEventListener(id, "invalid", () => invalid++);
	const revision = tree.revision;
	for (const name of validityProperties)
		expect(typeof validity[name]).toBe("boolean");
	expect(invalid).toBe(0);
	expect(tree.revision).toBe(revision);
	tree.setControl(id, { value: "filled" });
	expect(snapshot.valueMissing).toBe(true);
	expect(validity.valueMissing).toBe(false);
});

it("evaluates once per revision rather than once per flag", () => {
	const { tree, id } = fixture({
		type: "number",
		value: "5",
		min: "10",
		step: "2",
	});
	const states = new ScriptValidity(tree, { createHostObject: factory });
	const validity = states.get(id) as Record<string, boolean>;
	expect(states.metrics().evaluations).toBe(0);
	for (let repeat = 0; repeat < 50; repeat++)
		for (const name of validityProperties)
			expect(typeof validity[name]).toBe("boolean");
	expect(states.metrics().evaluations).toBe(1);
	tree.setControl(id, { value: "12" });
	expect(validity.valid).toBe(true);
	expect(states.metrics().evaluations).toBe(2);
	expect(states.get(id)).toBe(validity);
	states.close();
});

it("bounds capability admission while preserving existing live objects", () => {
	const { tree, id } = fixture();
	const states = new ScriptValidity(tree, { createHostObject: factory }, 1);
	const held = states.get(id);
	const other = tree.createElement("input");
	expect(() => states.get(other)).toThrow(/count limit/);
	expect(states.get(id)).toBe(held);
	expect(states.metrics().states).toBe(1);
	states.close();
	expect(states.metrics()).toMatchObject({ states: 0, closed: true });
});

it.each([0, -1, 0.5, 1025, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid validity capability limit %s",
	(limit) => {
		const { tree } = fixture();
		expect(
			() => new ScriptValidity(tree, { createHostObject: factory }, limit),
		).toThrow(/limit/);
	},
);

it("reserves factory admission before reentrant creation and recovers on failure", () => {
	const { tree, id } = fixture();
	const other = tree.createElement("input");
	let reenter = true;
	const states = new ScriptValidity(
		tree,
		{
			createHostObject(definition) {
				if (reenter) {
					expect(() => states.get(id)).toThrow(/Recursive/);
					expect(() => states.get(other)).toThrow(/count limit/);
					throw new Error("factory failed");
				}
				return factory(definition);
			},
		},
		1,
	);
	expect(() => states.get(id)).toThrow("factory failed");
	expect(states.metrics().states).toBe(0);
	reenter = false;
	expect(states.get(id)).toBeDefined();
	expect(states.metrics().states).toBe(1);
	states.close();
});

it("never revives getters leaked by a failed factory when creation is retried", () => {
	const { tree, id } = fixture();
	let leaked: Record<string, boolean> | undefined;
	let fail = true;
	const states = new ScriptValidity(tree, {
		createHostObject(definition) {
			const result = factory(definition);
			if (fail) {
				leaked = result;
				throw new Error("failed");
			}
			return result;
		},
	});
	expect(() => states.get(id)).toThrow("failed");
	fail = false;
	expect((states.get(id) as Record<string, boolean>).valid).toBe(true);
	expect(() => leaked?.valid).toThrow(/unavailable/);
	expect(() => leaked?.customError).toThrow(/unavailable/);
	states.close();
});

it("does not retain objects when the factory closes the owner", () => {
	const { tree, id } = fixture();
	const states = new ScriptValidity(tree, {
		createHostObject(definition) {
			states.close();
			return factory(definition);
		},
	});
	expect(() => states.get(id)).toThrow(/closed/);
	expect(states.metrics()).toMatchObject({ states: 0, closed: true });
});

it("releases cached snapshots and revokes held capabilities on owner or document closure", () => {
	const { tree, id } = fixture({ required: "" });
	const states = new ScriptValidity(tree, { createHostObject: factory });
	const held = states.get(id) as Record<string, boolean>;
	expect(held.valueMissing).toBe(true);
	tree.close();
	expect(states.metrics()).toMatchObject({ states: 0, closed: true });
	for (const name of validityProperties)
		expect(() => held[name]).toThrow(/closed/);
});

it("keeps validity identity local to a node, clone and script owner", () => {
	const { tree, id, dom, page } = fixture({ required: "" });
	const held = page.validity;
	const clone = tree.clone(id);
	const copied = (dom.node(clone) as { validity: Record<string, boolean> })
		.validity;
	expect(copied).not.toBe(held);
	tree.setControl(id, { value: "filled" });
	expect(held.valid).toBe(true);
	expect(copied.valid).toBe(false);
	const second = new ScriptDom(tree, { createHostObject: factory });
	expect((second.node(id) as { validity: object }).validity).not.toBe(held);
	dom.close();
	expect(() => held.valid).toThrow(/closed/);
	expect(
		(second.node(id) as { validity: Record<string, boolean> }).validity.valid,
	).toBe(true);
	second.close();
});
