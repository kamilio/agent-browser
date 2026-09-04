import { afterEach, expect, it, vi } from "vitest";
import {
	controlValue,
	isControlDisabled,
	optionOwner,
	selectControlValues,
	selectedOptions,
} from "./controls.js";
import { DocumentTree } from "./document.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { optionDisabled } from "./option-disabled.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	const add = (
		tag: string,
		parent = form,
		attributes: Record<string, string> = {},
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		return id;
	};
	const outer = add("optgroup", form, { disabled: "" });
	return { tree, form, outer, add };
}

it("stops inherited option disabling at a select boundary", () => {
	const { tree, outer, add } = fixture();
	const select = add("select", outer);
	const option = add("option", select);
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("does not make a nested optgroup disabled through its outer group", () => {
	const { tree, outer, add } = fixture();
	const inner = add("optgroup", outer);
	const option = add("option", inner);
	expect(isControlDisabled(tree, inner)).toBe(false);
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("retains successful options below a select boundary inside a disabled group", () => {
	const { tree, form, outer, add } = fixture();
	const select = add("select", outer, { name: "choice" });
	add("option", select, { value: "yes", selected: "" });
	expect(prepareFormSubmission(tree, tree.reference(form)).request.url).toBe(
		"https://example.test/?choice=yes",
	);
});

it.each(["select", "hr", "datalist", "option"])(
	"stops inherited disabled state at a %s ancestor through wrappers",
	(tag) => {
		const { tree, outer, add } = fixture();
		const boundary = add(tag, outer, { disabled: "" });
		const wrapper = add("div", boundary);
		const option = add("option", wrapper);
		expect(isControlDisabled(tree, option)).toBe(false);
		const queries = new DocumentQueries(tree);
		expect(queries.matches(option, ":disabled")).toBe(false);
		expect(queries.matches(option, ":enabled")).toBe(true);
	},
);

it.each(["select", "hr", "datalist", "option"])(
	"keeps an option's own disabled attribute inside a %s boundary",
	(tag) => {
		const { tree, outer, add } = fixture();
		const boundary = add(tag, outer);
		const option = add("option", boundary, { disabled: "false" });
		expect(isControlDisabled(tree, option)).toBe(true);
	},
);

it.each([
	[false, false],
	[false, true],
	[true, false],
	[true, true],
])(
	"uses the nearest group's flag: outer=%s inner=%s",
	(outerDisabled, innerDisabled) => {
		const { tree, outer, add } = fixture();
		if (!outerDisabled) tree.removeAttribute(outer, "disabled");
		const wrapper = add("div", outer);
		const inner = add(
			"optgroup",
			wrapper,
			innerDisabled ? { disabled: "" } : {},
		);
		const option = add("option", add("span", inner));
		expect(isControlDisabled(tree, inner)).toBe(innerDisabled);
		expect(isControlDisabled(tree, option)).toBe(innerDisabled);
	},
);

it("does not use a disabled attribute on an ordinary wrapper", () => {
	const { tree, outer, add } = fixture();
	tree.removeAttribute(outer, "disabled");
	const option = add("option", add("div", outer, { disabled: "" }));
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("still inherits from a disabled group through ordinary wrappers", () => {
	const { tree, outer, add } = fixture();
	const option = add("option", add("div", add("span", outer)));
	expect(isControlDisabled(tree, option)).toBe(true);
});

it("does not conflate a disabled fieldset or select with an option's disabled state", () => {
	const { tree, form, add } = fixture();
	const fieldset = add("fieldset", form, { disabled: "" });
	const select = add("select", fieldset, { disabled: "" });
	const group = add("optgroup", select);
	const option = add("option", group);
	expect(isControlDisabled(tree, select)).toBe(true);
	expect(isControlDisabled(tree, group)).toBe(false);
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("retains own disabled flags on optgroups even below a boundary", () => {
	const { tree, outer, add } = fixture();
	const select = add("select", outer);
	const inner = add("optgroup", select, { disabled: "false" });
	const option = add("option", inner);
	expect(isControlDisabled(tree, inner)).toBe(true);
	expect(isControlDisabled(tree, option)).toBe(true);
});

it("invalidates cached disabled states when nearest-group attributes change", () => {
	const { tree, outer, add } = fixture();
	const inner = add("optgroup", outer);
	const option = add("option", inner);
	expect(isControlDisabled(tree, option)).toBe(false);
	tree.setAttribute(inner, "disabled", "");
	expect(isControlDisabled(tree, option)).toBe(true);
	tree.removeAttribute(inner, "disabled");
	expect(isControlDisabled(tree, option)).toBe(false);
	tree.removeAttribute(outer, "disabled");
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("updates disabled state when moving options across a boundary", () => {
	const { tree, outer, add } = fixture();
	const select = add("select", outer);
	const option = add("option", outer);
	expect(isControlDisabled(tree, option)).toBe(true);
	tree.append(select, option);
	expect(isControlDisabled(tree, option)).toBe(false);
	tree.append(outer, option);
	expect(isControlDisabled(tree, option)).toBe(true);
	tree.remove(option);
	expect(isControlDisabled(tree, option)).toBe(false);
});

it("updates disabled state when moving an intervening wrapper", () => {
	const { tree, outer, add } = fixture();
	const select = add("select", outer);
	const wrapper = add("div", outer);
	const option = add("option", wrapper);
	expect(isControlDisabled(tree, option)).toBe(true);
	tree.append(select, wrapper);
	expect(isControlDisabled(tree, option)).toBe(false);
	tree.append(outer, wrapper);
	expect(isControlDisabled(tree, option)).toBe(true);
});

it("uses clone parentage without copying inherited disabled state", () => {
	const { tree, outer, add } = fixture();
	const option = add("option", outer);
	expect(isControlDisabled(tree, option)).toBe(true);
	const clone = tree.clone(option, true);
	expect(isControlDisabled(tree, clone)).toBe(false);
	tree.append(add("select", outer), clone);
	expect(isControlDisabled(tree, clone)).toBe(false);
	tree.append(outer, clone);
	expect(isControlDisabled(tree, clone)).toBe(true);
});

it("keeps default selection and native control selection consistent at a select boundary", () => {
	const { tree, outer, add } = fixture();
	const select = add("select", outer);
	const first = add("option", select, { value: "first" });
	const next = add("option", select, { value: "next" });
	expect(selectedOptions(tree, select).map((option) => option.id)).toEqual([
		first,
	]);
	expect(isControlDisabled(tree, first)).toBe(false);
	selectControlValues(tree, tree.reference(select), ["next"]);
	expect(selectedOptions(tree, select).map((option) => option.id)).toEqual([
		next,
	]);
	expect(controlValue(tree, select)).toBe("next");
});

it("still skips disabled grouped options during native default selection", () => {
	const { tree, form, add } = fixture();
	const select = add("select", form);
	const group = add("optgroup", select, { disabled: "" });
	const disabled = add("option", add("div", group), { value: "disabled" });
	const enabled = add("option", select, { value: "enabled" });
	expect(isControlDisabled(tree, disabled)).toBe(true);
	expect(selectedOptions(tree, select).map((option) => option.id)).toEqual([
		enabled,
	]);
	expect(() =>
		selectControlValues(tree, tree.reference(select), ["disabled"]),
	).toThrow();
});

it("keeps explicitly selected disabled options selected but out of successful entries", () => {
	const { tree, form, add } = fixture();
	const select = add("select", form, { name: "choice" });
	const group = add("optgroup", select);
	const option = add("option", group, { value: "yes", selected: "" });
	tree.setAttribute(group, "disabled", "");
	expect(selectedOptions(tree, select).map((entry) => entry.id)).toEqual([
		option,
	]);
	expect(prepareFormSubmission(tree, tree.reference(form)).request.url).toBe(
		"https://example.test/",
	);
	tree.removeAttribute(group, "disabled");
	expect(prepareFormSubmission(tree, tree.reference(form)).request.url).toBe(
		"https://example.test/?choice=yes",
	);
});

it("does not confuse enabledness with list-of-options ownership", () => {
	const { tree, form, add } = fixture();
	const select = add("select", form);
	const outer = add("optgroup", select, { disabled: "" });
	const inner = add("optgroup", outer);
	const option = add("option", inner);
	expect(isControlDisabled(tree, option)).toBe(false);
	expect(optionOwner(tree, option)).toBeUndefined();
	expect(selectedOptions(tree, select)).toEqual([]);
});

it("preserves richer parsed group descendants and ignores later ancestor flags", () => {
	const tree = parseHtmlDocument(
		"<!doctype html><select><optgroup disabled><div><option id=blocked value=no>No</option></div></optgroup><optgroup><span><option id=enabled value=yes>Yes</option></span></optgroup></select>",
		"https://example.test/",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const blocked = queries.querySelector("#blocked");
	const enabled = queries.querySelector("#enabled");
	const select = queries.querySelector("select");
	if (blocked === null || enabled === null || select === null)
		throw new Error("Missing parsed control");
	expect(isControlDisabled(tree, blocked)).toBe(true);
	expect(isControlDisabled(tree, enabled)).toBe(false);
	expect(controlValue(tree, select)).toBe("yes");
});

it("keeps the host disabled property as a reflected own attribute", () => {
	const { tree, outer, add } = fixture();
	const option = add("option", outer);
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
	const host = dom.node(option) as { disabled: boolean };
	expect(isControlDisabled(tree, option)).toBe(true);
	expect(host.disabled).toBe(false);
	tree.append(add("select", outer), option);
	expect(isControlDisabled(tree, option)).toBe(false);
	host.disabled = true;
	expect(isControlDisabled(tree, option)).toBe(true);
	expect(host.disabled).toBe(true);
});

it.each(["select", "hr", "datalist", "option", "optgroup"])(
	"stops the ancestor reader at the nearest %s boundary",
	(tag) => {
		const { tree, outer, add } = fixture();
		const boundary = add(tag, outer);
		const wrapper = add("div", boundary);
		const option = add("option", wrapper);
		const read = vi.fn((id: number) => tree.get(id));
		expect(optionDisabled(tree.get(option), read)).toBe(false);
		expect(read.mock.calls).toEqual([[wrapper], [boundary]]);
	},
);

it("does not inspect ancestors when the option owns a disabled attribute", () => {
	const { tree, outer, add } = fixture();
	const option = add("option", outer, { disabled: "" });
	const read = vi.fn((id: number) => tree.get(id));
	expect(optionDisabled(tree.get(option), read)).toBe(true);
	expect(read).not.toHaveBeenCalled();
});

it("rejects cached control-state reads after the native owner closes", () => {
	const { tree, outer, add } = fixture();
	const option = add("option", add("select", outer));
	expect(isControlDisabled(tree, option)).toBe(false);
	tree.close();
	expect(() => isControlDisabled(tree, option)).toThrow();
});
