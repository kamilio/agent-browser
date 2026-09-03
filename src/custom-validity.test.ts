import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentEvents, controlledEventListener } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { isValidationCandidate, validationMessage } from "./form-validation.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(tag = "input", attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const form = tree.createElement("form");
	const id = tree.createElement(tag, attributes);
	tree.append(tree.root, form);
	tree.append(form, id);
	const events = new DocumentEvents(tree);
	const forms = new DocumentForms(tree, events);
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			Object.assign(target, definition.methods);
			return target;
		},
	});
	return {
		tree,
		form,
		id,
		events,
		forms,
		dom,
		page: dom.node(id) as {
			willValidate: boolean;
			validationMessage: string;
			setCustomValidity: (...args: unknown[]) => void;
		},
	};
}

it.each(["input", "textarea", "select", "button"])(
	"blocks submission with a page-defined custom error on %s",
	(tag) => {
		const { tree, form, id, forms, page } = fixture(tag);
		page.setCustomValidity("Choose another value");
		expect(page.validationMessage).toBe("Choose another value");
		expect(forms.requestSubmit(tree.reference(form)).invalid).toEqual([
			{ reference: tree.reference(id), reason: "custom-error" },
		]);
		page.setCustomValidity("");
		expect(forms.requestSubmit(tree.reference(form)).submission).toBeDefined();
	},
);

it("reflects candidacy and hides custom messages while disabled", () => {
	const { tree, id, page } = fixture();
	expect(page.willValidate).toBe(true);
	page.setCustomValidity("error");
	tree.setAttribute(id, "disabled", "");
	expect(page.willValidate).toBe(false);
	expect(page.validationMessage).toBe("");
	tree.removeAttribute(id, "disabled");
	expect(page.validationMessage).toBe("error");
});

it("checks a native form without submitting or honoring novalidate", () => {
	const { tree, form, id, events, forms } = fixture("input", { required: "" });
	tree.setAttribute(form, "novalidate", "");
	const seen: string[] = [];
	events.addEventListener(id, "invalid", () => seen.push("invalid"));
	events.addEventListener(form, "submit", () => seen.push("submit"));
	expect(forms.checkValidity(tree.reference(form))).toBe(false);
	expect(seen).toEqual(["invalid"]);
});

it.each<[string, Record<string, string>, boolean]>([
	["input", { type: "hidden" }, false],
	["input", { type: "button" }, false],
	["input", { type: "reset" }, false],
	["input", { type: "submit" }, true],
	["input", { type: "image" }, true],
	["input", { type: "email", readonly: "" }, false],
	["input", { type: "checkbox", readonly: "" }, true],
	["input", { type: "range", readonly: "" }, true],
	["input", { type: "file", disabled: "" }, false],
	["textarea", { readonly: "" }, false],
	["select", { readonly: "" }, true],
	["button", { type: "button" }, false],
	["button", { type: "reset" }, false],
	["button", { type: "SUBMIT" }, true],
	["button", { type: "unknown" }, true],
	["button", { command: "--custom" }, false],
	["button", { commandfor: "target" }, false],
	["button", { type: "submit", command: "--custom" }, true],
	["fieldset", {}, false],
	["object", {}, false],
	["output", {}, false],
])("shares candidacy for %s with %o", (tag, attributes, expected) => {
	const { tree, id, form, page, forms } = fixture(tag, attributes);
	page.setCustomValidity("custom");
	expect(page.willValidate).toBe(expected);
	expect(page.validationMessage).toBe(expected ? "custom" : "");
	expect(forms.checkValidity(tree.reference(id))).toBe(!expected);
	expect(forms.requestSubmit(tree.reference(form)).invalid).toHaveLength(
		expected ? 1 : 0,
	);
});

it.each([false, true])(
	"handles disabled fieldsets, first legends and datalists when detached=%s",
	(detached) => {
		const { tree, id, form, page } = fixture();
		const fieldset = tree.createElement("fieldset", { disabled: "" });
		const legend = tree.createElement("legend");
		tree.append(form, fieldset);
		tree.append(fieldset, legend);
		tree.append(fieldset, id);
		if (detached) tree.remove(fieldset);
		page.setCustomValidity("error");
		expect(page.willValidate).toBe(false);
		tree.append(legend, id);
		expect(page.willValidate).toBe(true);
		const datalist = tree.createElement("datalist");
		tree.append(legend, datalist);
		tree.append(datalist, id);
		expect(page.willValidate).toBe(false);
		expect(page.validationMessage).toBe("");
	},
);

it("bars auto-state buttons in select parents but allows explicit submit candidacy", () => {
	const { tree, id, form, page } = fixture("button");
	const select = tree.createElement("select");
	tree.append(form, select);
	tree.append(select, id);
	expect(page.willValidate).toBe(false);
	tree.setAttribute(id, "type", "submit");
	expect(page.willValidate).toBe(true);
});

it.each<[unknown, string]>([
	["first\r\nsecond\rthird\n", "first\nsecond\nthird\n"],
	[null, "null"],
	[undefined, "undefined"],
	[false, "false"],
	[12, "12"],
	[12n, "12"],
	[" ", " "],
])("converts and normalizes custom message %s", (raw, expected) => {
	const { tree, id, page } = fixture();
	page.setCustomValidity(raw);
	expect(tree.getCustomValidity(id)).toBe(expected);
	expect(page.validationMessage).toBe(expected);
});

it("rejects missing or unsupported page arguments without losing an existing error", () => {
	const { page } = fixture();
	page.setCustomValidity("keep");
	expect(() => page.setCustomValidity()).toThrow(TypeError);
	for (const value of [{}, () => "message", Symbol("message")])
		expect(() => page.setCustomValidity(value)).toThrow(/conversion/);
	expect(page.validationMessage).toBe("keep");
});

it.each<[Record<string, string>, string]>([
	[{ required: "" }, "fill out"],
	[{ type: "email", value: "invalid" }, "required format"],
	[{ type: "number", value: "1", min: "2" }, "minimum"],
	[{ type: "number", value: "2", max: "1" }, "maximum"],
	[{ type: "number", value: "0.5", step: "1", min: "0" }, "step"],
])(
	"reveals existing native errors after clearing custom messages: %o",
	(attributes, expected) => {
		const { page } = fixture("input", attributes);
		expect(page.validationMessage).toContain(expected);
		page.setCustomValidity("custom");
		expect(page.validationMessage).toBe("custom");
		page.setCustomValidity("");
		expect(page.validationMessage).toContain(expected);
	},
);

it("does not falsely approve unimplemented constraints when a custom error is cleared", () => {
	const { tree, form, forms, page } = fixture("input", {
		value: "value",
		pattern: "a+",
	});
	expect(page.willValidate).toBe(true);
	expect(() => page.validationMessage).toThrow(/not implemented/);
	page.setCustomValidity("custom");
	expect(forms.checkValidity(tree.reference(form))).toBe(false);
	page.setCustomValidity("");
	expect(() => forms.checkValidity(tree.reference(form))).toThrow(
		/not implemented/,
	);
});

it("retains errors across resets, type changes and detachment but not cloning or import", () => {
	const { tree, id, form, forms, page } = fixture("input", {
		value: "default",
	});
	page.setCustomValidity("custom");
	forms.reset(tree.reference(form));
	expect(page.validationMessage).toBe("custom");
	tree.setAttribute(id, "type", "hidden");
	expect(page.validationMessage).toBe("");
	tree.setAttribute(id, "type", "text");
	tree.remove(id);
	expect(page.validationMessage).toBe("custom");
	const clone = tree.clone(id);
	expect(tree.getCustomValidity(clone)).toBe("");
	const target = fixture();
	const imported = target.tree.copyFrom(tree, id);
	expect(target.tree.getCustomValidity(imported)).toBe("");
	expect(serializeHtml(tree, id, { includeSelf: true })).not.toContain(
		"custom",
	);
	tree.append(form, id);
	expect(forms.checkValidity(tree.reference(id))).toBe(false);
});

it("charges normalized UTF-16 messages to the shared text quota and releases replacement costs", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 32 });
	documents.push(tree);
	const id = tree.createElement("input");
	tree.setCustomValidity(id, "\r\n".repeat(27));
	expect(tree.getCustomValidity(id)).toBe("\n".repeat(27));
	const revision = tree.revision;
	const view = tree.get(id);
	expect(() => tree.setCustomValidity(id, "a".repeat(28))).toThrow(
		/text limit/,
	);
	expect(() => tree.setAttribute(id, "x", "y")).toThrow(/text limit/);
	expect(tree.get(id)).toBe(view);
	expect(tree.revision).toBe(revision);
	expect(tree.getCustomValidity(id)).toBe("\n".repeat(27));
	tree.setCustomValidity(id, "😀");
	tree.createText("a".repeat(25));
	expect(() => tree.createText("a")).toThrow(/text limit/);
	tree.setCustomValidity(id, "");
	tree.createText("ab");
	expect(tree.getCustomValidity(id)).toBe("");
});

it("reports only real message changes after mutation and never logs message contents", () => {
	const { tree, id } = fixture();
	const revision = tree.revision;
	const observed: string[] = [];
	tree.onChange(() => observed.push(tree.getCustomValidity(id)));
	tree.setCustomValidity(id, "a\r\nb");
	tree.setCustomValidity(id, "a\rb");
	expect(observed).toEqual(["a\nb"]);
	expect(tree.changesSince(revision).changes).toEqual([
		{ revision: revision + 1, kind: "control", target: id },
	]);
});

it("clears owned messages and rejects held getters and setters on closure", () => {
	const { tree, id, page } = fixture();
	page.setCustomValidity("custom");
	const owner = (tree as unknown as { customValidity: Map<number, string> })
		.customValidity;
	expect(owner.size).toBe(1);
	tree.close();
	expect(owner.size).toBe(0);
	expect(() => tree.getCustomValidity(id)).toThrow(/closed/);
	expect(() => page.validationMessage).toThrow(/closed/);
	expect(() => page.setCustomValidity("new")).toThrow(/closed/);
});

it("keeps invalid results despite listener repair or cancellation and visits all snapshotted controls", () => {
	const { tree, form, id, events, forms, page } = fixture();
	const second = tree.createElement("input");
	tree.append(form, second);
	page.setCustomValidity("first");
	tree.setCustomValidity(second, "second");
	const visited: number[] = [];
	events.addEventListener(id, "invalid", (event) => {
		expect(event.bubbles).toBe(false);
		expect(event.cancelable).toBe(true);
		event.preventDefault();
		visited.push(id);
		page.setCustomValidity("");
		tree.setCustomValidity(second, "");
		tree.remove(second);
	});
	events.addEventListener(second, "invalid", () => visited.push(second));
	expect(forms.checkValidity(tree.reference(form))).toBe(false);
	expect(visited).toEqual([id, second]);
	expect(forms.checkValidity(tree.reference(form))).toBe(true);
});

it("checks external form owners without validating controls owned by another form", () => {
	const { tree, form, id, forms } = fixture();
	tree.setAttribute(form, "id", "main");
	const other = tree.createElement("form", { id: "other" });
	tree.append(tree.root, other);
	tree.setAttribute(id, "form", "other");
	tree.setCustomValidity(id, "other error");
	expect(forms.checkValidity(tree.reference(form))).toBe(true);
	const external = tree.createElement("input", { form: "main" });
	tree.append(tree.root, external);
	tree.setCustomValidity(external, "external error");
	expect(forms.checkValidity(tree.reference(form))).toBe(false);
	tree.setCustomValidity(external, "");
	expect(forms.checkValidity(tree.reference(form))).toBe(true);
});

it("awaits controlled native invalid callbacks and rejects unsafe synchronous dispatch", async () => {
	const { tree, id, events, forms, page } = fixture();
	page.setCustomValidity("custom");
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let calls = 0;
	events.addEventListener(
		id,
		"invalid",
		controlledEventListener(async () => {
			calls++;
			await gate;
			page.setCustomValidity("");
		}),
	);
	expect(() => forms.checkValidity(tree.reference(id))).toThrow(/asynchronous/);
	expect(calls).toBe(0);
	const checked = forms.checkValidityAsync(tree.reference(id));
	expect(calls).toBe(1);
	expect(page.validationMessage).toBe("custom");
	release();
	expect(await checked).toBe(false);
	expect(await forms.checkValidityAsync(tree.reference(id))).toBe(true);
});

it("rejects wrong or stale native targets and unrelated page capability exposure", () => {
	const { tree, id, dom, forms } = fixture();
	const div = tree.createElement("div");
	tree.append(tree.root, div);
	expect(
		(dom.node(div) as { setCustomValidity?: unknown }).setCustomValidity,
	).toBeUndefined();
	expect(() => forms.checkValidity(tree.reference(div))).toThrow(
		/validation control/,
	);
	const reference = tree.reference(id);
	tree.remove(id);
	expect(() => forms.checkValidity(reference)).toThrow(/no longer/);
	tree.close();
	expect(() => forms.checkValidity(reference)).toThrow(/closed/);
});

it("keeps custom validity isolated between documents", () => {
	const first = fixture();
	const second = fixture();
	first.page.setCustomValidity("first");
	expect(second.page.validationMessage).toBe("");
	expect(isValidationCandidate(second.tree, second.id)).toBe(true);
	expect(validationMessage(first.tree, first.id)).toBe("first");
});
