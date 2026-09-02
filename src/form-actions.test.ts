import { expect, it, vi } from "vitest";
import {
	controlChecked,
	controlValue,
	selectControlValues,
} from "./controls.js";
import { type ControlState, DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms, type FormResetResult } from "./form-actions.js";
import { DocumentInteractions } from "./interactions.js";

function fixture() {
	const tree = new DocumentTree("https://example.com");
	const actions = new DocumentInteractions(tree);
	const form = tree.createElement("form", { id: "form" });
	tree.append(tree.root, form);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = form,
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		return id;
	};
	return {
		tree,
		actions,
		events: actions.events,
		forms: actions.forms,
		form,
		add,
	};
}

it("restores text/default checked state without clearing checkbox indeterminacy", () => {
	const { tree, forms, form, add } = fixture();
	const input = add("input", { value: "default", readonly: "" });
	const checkbox = add("input", {
		type: "checkbox",
		checked: "",
		disabled: "",
	});
	const textarea = add("textarea");
	tree.append(textarea, tree.createText("default\r\ntext"));
	tree.setControl(input, { value: "edited" });
	tree.setControl(checkbox, { checked: false, indeterminate: true });
	tree.setControl(textarea, { value: "edited" });
	expect(forms.reset(tree.reference(form))).toMatchObject({
		reset: true,
		canceled: false,
		controls: 3,
	});
	expect(controlValue(tree, input)).toBe("default");
	expect(controlValue(tree, textarea)).toBe("default\ntext");
	expect(controlChecked(tree, checkbox)).toBe(true);
	expect(tree.get(checkbox).control.indeterminate).toBe(true);
	tree.setAttribute(input, "value", "new default");
	expect(controlValue(tree, input)).toBe("new default");
	expect(tree.get(input).attributes.readonly).toBe("");
});

it("restores radio exclusivity and selected option defaults", () => {
	const { tree, forms, form, add } = fixture();
	const first = add("input", { type: "radio", name: "group", checked: "" });
	const second = add("input", { type: "radio", name: "group", checked: "" });
	tree.setControl(first, { checked: true });
	tree.setControl(second, { checked: false });
	const select = add("select");
	add("option", { value: "first", selected: "" }, select);
	add("option", { value: "second" }, select);
	selectControlValues(tree, tree.reference(select), ["second"]);
	forms.reset(tree.reference(form));
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(true);
	expect(controlValue(tree, select)).toBe("first");
});

it("dispatches reset before changes, bubbles to Window and does not emit input/change", () => {
	const { tree, events, forms, form, add } = fixture();
	const input = add("input", { value: "default" });
	tree.setControl(input, { value: "edited" });
	const calls: unknown[] = [];
	if (events.windowTarget === null) throw new Error("Missing Window");
	for (const target of [form, tree.root, events.windowTarget])
		events.addEventListener(target, "reset", (event) =>
			calls.push([
				event.currentTarget,
				controlValue(tree, input),
				event.bubbles,
				event.cancelable,
				event.composed,
			]),
		);
	for (const type of ["input", "change"])
		events.addEventListener(tree.root, type, () => calls.push(type));
	forms.reset(tree.reference(form));
	expect(calls).toEqual(
		[form, tree.root, events.windowTarget].map((target) => [
			target,
			"edited",
			true,
			true,
			false,
		]),
	);
	expect(controlValue(tree, input)).toBe("default");
});

it("honors reset cancellation without rolling back the listener's own changes", () => {
	const { tree, events, forms, form, add } = fixture();
	const input = add("input", { value: "default" });
	tree.setControl(input, { value: "edited" });
	events.addEventListener(
		form,
		"reset",
		(event) => {
			tree.setControl(input, { value: "handler" });
			event.preventDefault();
		},
		{ once: true },
	);
	expect(forms.reset(tree.reference(form))).toMatchObject({
		reset: false,
		canceled: true,
		controls: 0,
	});
	expect(controlValue(tree, input)).toBe("handler");
	expect(forms.reset(tree.reference(form)).reset).toBe(true);
	expect(controlValue(tree, input)).toBe("default");
});

it("suppresses recursive same-form resets and reuses the guard after completion", () => {
	const { tree, events, forms, form } = fixture();
	const nested: FormResetResult[] = [];
	events.addEventListener(form, "reset", () => {
		nested.push(forms.reset(tree.reference(form)));
	});
	expect(forms.reset(tree.reference(form)).reset).toBe(true);
	expect(forms.reset(tree.reference(form)).reset).toBe(true);
	expect(nested.map((result) => result.recursive)).toEqual([true, true]);
	expect(events.drainErrors()).toEqual([]);
});

it("resolves external ownership and changed defaults after reset listeners run", () => {
	const { tree, events, forms, form, add } = fixture();
	const otherForm = add("form", { id: "other" }, tree.root);
	const external = add("input", { form: "form", value: "default" }, tree.root);
	const moved = add("input", { value: "default" });
	tree.setControl(external, { value: "edited" });
	tree.setControl(moved, { value: "edited" });
	let created: number | undefined;
	events.addEventListener(form, "reset", () => {
		tree.setAttribute(external, "value", "updated default");
		tree.append(otherForm, moved);
		created = add("input", { value: "new default" });
		tree.setControl(created, { value: "edited" });
	});
	forms.reset(tree.reference(form));
	expect(controlValue(tree, external)).toBe("updated default");
	expect(controlValue(tree, moved)).toBe("edited");
	expect(controlValue(tree, created as number)).toBe("new default");
});

it("fails explicitly for unsupported output reset before partially changing native controls", () => {
	const { tree, events, forms, form, add } = fixture();
	const input = add("input", { value: "default" });
	tree.setControl(input, { value: "edited" });
	add("output");
	expect(() => forms.reset(tree.reference(form))).toThrow("output controls");
	expect(controlValue(tree, input)).toBe("edited");
	events.addEventListener(form, "reset", (event) => event.preventDefault(), {
		once: true,
	});
	expect(forms.reset(tree.reference(form)).canceled).toBe(true);
});

it("runs reset-button defaults after click and reports canceled resets separately", () => {
	const { tree, events, actions, form, add } = fixture();
	const input = add("input", { value: "default" });
	const reset = add("button", { type: "reset" });
	tree.setControl(input, { value: "edited" });
	const calls: string[] = [];
	events.addEventListener(reset, "click", () => calls.push("click"));
	events.addEventListener(form, "reset", () => calls.push("reset"));
	const result = actions.click(tree.reference(reset));
	expect(calls).toEqual(["click", "reset"]);
	expect(result.defaultAction).toBeUndefined();
	expect(result.reset).toMatchObject({ reset: true, canceled: false });
	expect(result.revision).toBe(tree.revision);
	tree.setControl(input, { value: "edited again" });
	events.addEventListener(form, "reset", (event) => event.preventDefault(), {
		once: true,
	});
	const canceled = actions.click(tree.reference(reset));
	expect(canceled.defaultPrevented).toBe(false);
	expect(canceled.reset?.canceled).toBe(true);
	expect(controlValue(tree, input)).toBe("edited again");
});

it("constructs a reset plan once rather than rebuilding the tree for each select", () => {
	const { tree, forms, form, add } = fixture();
	for (let index = 0; index < 300; index++) {
		const select = add("select");
		const first = add("option", { value: "first" }, select);
		const second = add("option", { value: "second" }, select);
		tree.setControl(first, { selected: false });
		tree.setControl(second, { selected: true });
	}
	const walk = vi.spyOn(tree, "walk");
	expect(forms.reset(tree.reference(form)).controls).toBe(300);
	expect(walk.mock.calls.length).toBeLessThanOrEqual(2);
	walk.mockRestore();
});

it("releases control-value quota and validates all reset fields before mutation", () => {
	const tree = new DocumentTree("https://example.com", {
		maxTextCodeUnits: 100,
	});
	const input = tree.createElement("input");
	tree.append(tree.root, input);
	tree.setControl(input, {
		value: "x".repeat(80),
		checked: true,
		indeterminate: true,
	});
	expect(() =>
		tree.clearControl(input, ["value", "invalid" as keyof ControlState]),
	).toThrow("reset fields");
	expect(tree.get(input).control.value).toHaveLength(80);
	expect(() => tree.createText("x".repeat(20))).toThrow("limit");
	tree.clearControl(input, ["value", "checked"]);
	expect(tree.get(input).control).toEqual({ indeterminate: true });
	expect(() => tree.createText("x".repeat(80))).not.toThrow();
	const revision = tree.revision;
	tree.clearControl(input, ["value"]);
	expect(tree.revision).toBe(revision);
});

it("rejects stale or foreign form contexts and stops when listeners close the document", () => {
	const { tree, events, forms, form, add } = fixture();
	expect(
		() => new DocumentForms(new DocumentTree("https://other.test"), events),
	).toThrow("this document");
	expect(() => forms.reset(tree.reference(add("input")))).toThrow(
		"form reference",
	);
	const detached = tree.createElement("form");
	expect(() => forms.reset(tree.reference(detached))).toThrow("no longer");
	events.addEventListener(form, "reset", () => tree.close());
	expect(() => forms.reset(tree.reference(form))).toThrow("closed");
	expect(
		() =>
			new DocumentForms(
				tree,
				new DocumentEvents(new DocumentTree("https://other.test")),
			),
	).toThrow("this document");
});
