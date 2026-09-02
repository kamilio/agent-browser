import { expect, it } from "vitest";
import {
	controlChecked,
	controlValue,
	fillTextControl,
	formControls,
	formOwner,
	isControlDisabled,
	optionSelected,
	selectControlValues,
	selectedOptions,
	setControlChecked,
} from "./controls.js";
import { DocumentTree } from "./document.js";
import { snapshotDocument } from "./snapshot.js";

it("indexes disabled and selected controls within detached fragment roots", () => {
	const tree = new DocumentTree("https://example.com/");
	const fragment = tree.createFragment();
	const fieldset = tree.createElement("fieldset", { disabled: "" });
	const input = tree.createElement("input");
	const select = tree.createElement("select");
	const option = tree.createElement("option", { value: "detached" });
	tree.append(fragment, fieldset);
	tree.append(fieldset, input);
	tree.append(fragment, select);
	tree.append(select, option);
	expect(isControlDisabled(tree, input)).toBe(true);
	expect(controlValue(tree, select)).toBe("detached");
	expect(optionSelected(tree, option)).toBe(true);
	const copiedSelect = tree.clone(select, true);
	expect(controlValue(tree, copiedSelect)).toBe("detached");
	tree.append(tree.root, fragment);
	expect(controlValue(tree, copiedSelect)).toBe("detached");
	expect(controlValue(tree, select)).toBe("detached");
	expect(isControlDisabled(tree, input)).toBe(true);
	tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.com/form");
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = tree.root,
		text = "",
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		if (text) tree.append(id, tree.createText(text));
		return id;
	};
	return { tree, add };
}

it("resolves external form ownership and invalidates cached associations after mutations", () => {
	const { tree, add } = fixture();
	const first = add("form", { id: "one" });
	const second = add("form", { id: "two" });
	const internal = add("input", { name: "internal" }, first);
	const external = add("input", { form: "one", name: "external" }, tree.root);
	const override = add("input", { form: "two", name: "override" }, first);
	expect(formControls(tree, first).map((node) => node.id)).toEqual([
		internal,
		external,
	]);
	expect(formOwner(tree, override)).toBe(second);
	tree.setAttribute(external, "form", "two");
	expect(formOwner(tree, external)).toBe(second);
	tree.setAttribute(first, "id", "renamed");
	expect(formOwner(tree, internal)).toBe(first);
	const nonForm = add("div", { id: "collision" });
	add("form", { id: "collision" });
	tree.setAttribute(external, "form", "collision");
	expect(formOwner(tree, external)).toBeUndefined();
	tree.remove(nonForm);
	expect(formOwner(tree, external)).toBeDefined();
});

it("handles disabled fieldsets with the first-legend exception and nested disabled ancestors", () => {
	const { tree, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	add("span", {}, fieldset, "Before legend");
	const legend = add("legend", {}, fieldset);
	const allowed = add("input", {}, legend);
	const disabled = add("input", {}, fieldset);
	const secondLegend = add("legend", {}, fieldset);
	const alsoDisabled = add("input", {}, secondLegend);
	expect(isControlDisabled(tree, allowed)).toBe(false);
	expect(isControlDisabled(tree, disabled)).toBe(true);
	expect(isControlDisabled(tree, alsoDisabled)).toBe(true);
	const nested = add("fieldset", { disabled: "" }, fieldset);
	const nestedLegend = add("legend", {}, nested);
	const nestedInput = add("input", {}, nestedLegend);
	expect(isControlDisabled(tree, nestedInput)).toBe(true);
	tree.removeAttribute(fieldset, "disabled");
	expect(isControlDisabled(tree, nestedInput)).toBe(false);
});

it("fills supported controls without changing default attributes and rejects disabled, readonly or stale targets", () => {
	const { tree, add } = fixture();
	const input = add("input", { value: "default" });
	fillTextControl(tree, tree.reference(input), "new\r\nvalue");
	expect(controlValue(tree, input)).toBe("newvalue");
	expect(tree.get(input).attributes.value).toBe("default");
	const textarea = add("textarea", { type: "number" }, tree.root, "initial");
	fillTextControl(tree, tree.reference(textarea), "line1\rline2");
	expect(controlValue(tree, textarea)).toBe("line1\nline2");
	const readonly = add("input", { readonly: "" });
	expect(() =>
		fillTextControl(tree, tree.reference(readonly), "value"),
	).toThrow("readonly");
	const disabled = add("input", { disabled: "" });
	expect(() =>
		fillTextControl(tree, tree.reference(disabled), "value"),
	).toThrow("disabled");
	tree.remove(input);
	expect(() => fillTextControl(tree, tree.reference(input), "value")).toThrow(
		"no longer",
	);
});

it("sanitizes common input values and validates numeric fills before mutation", () => {
	const { tree, add } = fixture();
	const number = add("input", { type: "number", value: "not-a-number" });
	expect(controlValue(tree, number)).toBe("");
	fillTextControl(tree, tree.reference(number), "-1.5e2");
	expect(controlValue(tree, number)).toBe("-1.5e2");
	const revision = tree.revision;
	expect(() =>
		fillTextControl(tree, tree.reference(number), "Infinity"),
	).toThrow("numeric");
	expect(tree.revision).toBe(revision);
	const email = add("input", {
		type: "email",
		multiple: "",
		value: " a@example.test , b@example.test ",
	});
	expect(controlValue(tree, email)).toBe("a@example.test,b@example.test");
	const url = add("input", {
		type: "url",
		value: " https://example.com\n/path ",
	});
	expect(controlValue(tree, url)).toBe("https://example.com/path");
});

it("keeps radio groups exclusive, scoped by form and stable when a default-checked radio is cleared", () => {
	const { tree, add } = fixture();
	const form = add("form", { id: "first" });
	const otherForm = add("form");
	const first = add(
		"input",
		{ type: "radio", name: "choice", checked: "" },
		form,
	);
	const second = add(
		"input",
		{ type: "radio", name: "choice", value: "second", checked: "" },
		form,
	);
	const other = add(
		"input",
		{ type: "radio", name: "choice", checked: "" },
		otherForm,
	);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(true);
	setControlChecked(tree, tree.reference(second), false);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(false);
	setControlChecked(tree, tree.reference(first), true);
	expect(controlChecked(tree, first)).toBe(true);
	expect(controlChecked(tree, second)).toBe(false);
	expect(controlChecked(tree, other)).toBe(true);
	const external = add("input", {
		type: "radio",
		name: "choice",
		form: "first",
	});
	setControlChecked(tree, tree.reference(external), true);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, external)).toBe(true);
});

it("derives select defaults without confusing a disabled select with a disabled option", () => {
	const { tree, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const select = add("select", {}, fieldset);
	add("option", { disabled: "", value: "unavailable" }, select);
	const first = add("option", { value: "first" }, select);
	const second = add("option", { value: "second", selected: "" }, select);
	expect(isControlDisabled(tree, select)).toBe(true);
	expect(isControlDisabled(tree, first)).toBe(false);
	expect(controlValue(tree, select)).toBe("second");
	expect(optionSelected(tree, second)).toBe(true);
	tree.removeAttribute(second, "selected");
	expect(controlValue(tree, select)).toBe("first");
	tree.setAttribute(select, "size", "2");
	expect(selectedOptions(tree, select)).toEqual([]);
});

it("selects values, supports empty selections and preserves state on failures", () => {
	const { tree, add } = fixture();
	const select = add("select");
	add("option", { value: "first" }, select);
	const group = add("optgroup", { disabled: "" }, select);
	add("option", { value: "disabled" }, group);
	add("option", {}, select, "  second\n label  ");
	expect(
		selectControlValues(tree, tree.reference(select), ["second label"]),
	).toEqual(["second label"]);
	expect(controlValue(tree, select)).toBe("second label");
	const revision = tree.revision;
	expect(() =>
		selectControlValues(tree, tree.reference(select), ["missing"]),
	).toThrow("not found");
	expect(() =>
		selectControlValues(tree, tree.reference(select), ["disabled"]),
	).toThrow("disabled");
	expect(tree.revision).toBe(revision);
	selectControlValues(tree, tree.reference(select), []);
	expect(controlValue(tree, select)).toBe("");
	tree.setAttribute(select, "multiple", "");
	expect(
		selectControlValues(tree, tree.reference(select), [
			"second label",
			"first",
		]),
	).toEqual(["first", "second label"]);
});

it("projects the same inherited disability and current selection into agent snapshots", () => {
	const { tree, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const input = add("input", { "aria-label": "Disabled text" }, fieldset);
	const select = add("select", { "aria-label": "Choice" });
	const option = add("option", { value: "one" }, select, "One");
	const before = snapshotDocument(tree);
	expect(
		before.entries.find((entry) => entry.ref === tree.reference(input))
			?.disabled,
	).toBe(true);
	expect(
		before.entries.find((entry) => entry.ref === tree.reference(select))?.value,
	).toBe("one");
	expect(
		before.entries.find((entry) => entry.ref === tree.reference(option))
			?.selected,
	).toBe(true);
	selectControlValues(tree, tree.reference(select), []);
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(option),
		)?.selected,
	).toBe(false);
});

it("invalidates control indexes on close and handles a large disabled fieldset without rescanning every sibling", () => {
	const { tree, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const inputs = Array.from({ length: 2000 }, () => add("input", {}, fieldset));
	for (const input of inputs) expect(isControlDisabled(tree, input)).toBe(true);
	tree.close();
	expect(() => isControlDisabled(tree, inputs[0])).toThrow("closed");
});
