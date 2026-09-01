import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

const associatedTags = new Set([
	"button",
	"fieldset",
	"input",
	"object",
	"output",
	"select",
	"textarea",
]);
const fieldsetAffected = new Set([
	"button",
	"fieldset",
	"input",
	"select",
	"textarea",
]);
const inputTypes = new Set([
	"hidden",
	"text",
	"search",
	"tel",
	"url",
	"email",
	"password",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
	"number",
	"range",
	"color",
	"checkbox",
	"radio",
	"file",
	"submit",
	"image",
	"reset",
	"button",
]);
const textTypes = new Set([
	"text",
	"search",
	"tel",
	"url",
	"email",
	"password",
	"number",
]);

interface ControlIndex {
	revision: number;
	nodes: Map<number, Readonly<DocumentNode>>;
	owners: Map<number, number | undefined>;
	controls: Map<number | undefined, Readonly<DocumentNode>[]>;
	disabled: Set<number>;
	options: Map<number, Readonly<DocumentNode>[]>;
	datalist: Set<number>;
	radioGroups: Map<string, Readonly<DocumentNode>[]>;
	radioChecked: Set<number>;
	selected: Set<number>;
}

const indexes = new WeakMap<DocumentTree, ControlIndex>();

export function inputType(node: Readonly<DocumentNode>) {
	const type = node.attributes.type?.toLowerCase() ?? "text";
	return inputTypes.has(type) ? type : "text";
}

function radioKey(index: ControlIndex, node: Readonly<DocumentNode>) {
	return JSON.stringify([
		index.owners.get(node.id) ?? null,
		node.attributes.name ?? "",
	]);
}

function indexFor(tree: DocumentTree): ControlIndex {
	tree.reference(tree.root);
	const cached = indexes.get(tree);
	if (cached?.revision === tree.revision) return cached;
	const nodes = new Map(
		Array.from(tree.walk(), ({ node }) => [node.id, node] as const),
	);
	const index: ControlIndex = {
		revision: tree.revision,
		nodes,
		owners: new Map(),
		controls: new Map(),
		disabled: new Set(),
		options: new Map(),
		datalist: new Set(),
		radioGroups: new Map(),
		radioChecked: new Set(),
		selected: new Set(),
	};
	const htmlIds = new Map<string, number>();
	const firstLegends = new Map<number, number>();
	for (const node of nodes.values()) {
		if (node.attributes.id && !htmlIds.has(node.attributes.id))
			htmlIds.set(node.attributes.id, node.id);
		if (node.tagName === "fieldset") {
			const first = node.children.find(
				(child) => nodes.get(child)?.tagName === "legend",
			);
			if (first !== undefined) firstLegends.set(node.id, first);
		}
	}
	const inheritedFieldset = new Set<number>();
	const inheritedOptgroup = new Set<number>();
	for (const node of nodes.values()) {
		const parent = nodes.get(node.parent ?? -1);
		if (parent) {
			if (
				inheritedFieldset.has(parent.id) ||
				(parent.tagName === "fieldset" &&
					Object.hasOwn(parent.attributes, "disabled") &&
					firstLegends.get(parent.id) !== node.id)
			)
				inheritedFieldset.add(node.id);
			if (
				inheritedOptgroup.has(parent.id) ||
				(parent.tagName === "optgroup" &&
					Object.hasOwn(parent.attributes, "disabled"))
			)
				inheritedOptgroup.add(node.id);
			if (index.datalist.has(parent.id) || parent.tagName === "datalist")
				index.datalist.add(node.id);
		}
		if (
			fieldsetAffected.has(node.tagName) &&
			(Object.hasOwn(node.attributes, "disabled") ||
				inheritedFieldset.has(node.id))
		)
			index.disabled.add(node.id);
		if (
			["option", "optgroup"].includes(node.tagName) &&
			(Object.hasOwn(node.attributes, "disabled") ||
				inheritedOptgroup.has(node.id))
		)
			index.disabled.add(node.id);
		if (associatedTags.has(node.tagName)) {
			let owner: number | undefined;
			if (Object.hasOwn(node.attributes, "form")) {
				const target = nodes.get(htmlIds.get(node.attributes.form) ?? -1);
				if (target?.tagName === "form") owner = target.id;
			} else {
				let ancestor = parent;
				while (ancestor) {
					if (ancestor.tagName === "form") {
						owner = ancestor.id;
						break;
					}
					ancestor = nodes.get(ancestor.parent ?? -1);
				}
			}
			index.owners.set(node.id, owner);
			const controls = index.controls.get(owner) ?? [];
			controls.push(node);
			index.controls.set(owner, controls);
		}
		if (node.tagName === "option") {
			let ancestor = parent;
			while (ancestor) {
				if (ancestor.tagName === "select") {
					const options = index.options.get(ancestor.id) ?? [];
					options.push(node);
					index.options.set(ancestor.id, options);
					break;
				}
				ancestor = nodes.get(ancestor.parent ?? -1);
			}
		}
		if (
			node.tagName === "input" &&
			inputType(node) === "radio" &&
			node.attributes.name
		) {
			const key = radioKey(index, node);
			const group = index.radioGroups.get(key) ?? [];
			group.push(node);
			index.radioGroups.set(key, group);
		}
	}
	for (const group of index.radioGroups.values()) {
		const explicit = group.filter(
			(candidate) => candidate.control.checked === true,
		);
		const selected = explicit.length
			? explicit
			: group.filter(
					(candidate) =>
						candidate.control.checked ??
						Object.hasOwn(candidate.attributes, "checked"),
				);
		const winner = selected.at(-1);
		if (winner) index.radioChecked.add(winner.id);
	}
	for (const [id, options] of index.options) {
		const select = nodes.get(id);
		if (!select) continue;
		let selected = options.filter(
			(option) =>
				option.control.selected ?? Object.hasOwn(option.attributes, "selected"),
		);
		if (!Object.hasOwn(select.attributes, "multiple")) {
			if (selected.length) selected = selected.slice(-1);
			else if (
				!options.some((option) => option.control.selected !== undefined) &&
				!(Number.parseInt(select.attributes.size ?? "", 10) > 1)
			) {
				const first = options.find((option) => !index.disabled.has(option.id));
				selected = first ? [first] : [];
			}
		}
		for (const option of selected) index.selected.add(option.id);
	}
	if (!cached) tree.onClose(() => indexes.delete(tree));
	indexes.set(tree, index);
	return index;
}

export function formOwner(tree: DocumentTree, id: number) {
	tree.get(id);
	return indexFor(tree).owners.get(id);
}
export function formControls(tree: DocumentTree, formId: number) {
	if (tree.get(formId).tagName !== "form")
		throw new AgentBrowserError("invalid-input", "Expected a form");
	return [...(indexFor(tree).controls.get(formId) ?? [])];
}
export function isControlDisabled(tree: DocumentTree, id: number) {
	tree.get(id);
	return indexFor(tree).disabled.has(id);
}
export function isInsideDatalist(tree: DocumentTree, id: number) {
	tree.get(id);
	return indexFor(tree).datalist.has(id);
}
export function selectOptions(tree: DocumentTree, id: number) {
	tree.get(id);
	return [...(indexFor(tree).options.get(id) ?? [])];
}

export function selectedOptions(tree: DocumentTree, id: number) {
	tree.get(id);
	const index = indexFor(tree);
	return (index.options.get(id) ?? []).filter((option) =>
		index.selected.has(option.id),
	);
}

export function optionSelected(tree: DocumentTree, id: number) {
	tree.get(id);
	return indexFor(tree).selected.has(id);
}

export function optionValue(tree: DocumentTree, id: number) {
	const option = tree.get(id);
	return (
		option.attributes.value ??
		tree
			.textContent(id)
			.replace(/[\t\n\f\r ]+/g, " ")
			.replace(/^ | $/g, "")
	);
}

export function controlChecked(tree: DocumentTree, id: number) {
	const node = tree.get(id);
	if (inputType(node) !== "radio" || !node.attributes.name)
		return node.control.checked ?? Object.hasOwn(node.attributes, "checked");
	return indexFor(tree).radioChecked.has(id);
}

export function controlValue(tree: DocumentTree, id: number): string {
	const node = tree.get(id);
	if (node.tagName === "select") {
		const selected = selectedOptions(tree, id)[0];
		return selected ? optionValue(tree, selected.id) : "";
	}
	if (node.tagName === "textarea")
		return (node.control.value ?? tree.textContent(id)).replace(/\r\n?/g, "\n");
	const type = inputType(node);
	const fallback =
		type === "checkbox" || type === "radio"
			? "on"
			: type === "submit"
				? "Submit Query"
				: type === "reset"
					? "Reset"
					: "";
	let value = node.control.value ?? node.attributes.value ?? fallback;
	if (node.tagName !== "input")
		return node.control.value ?? node.attributes.value ?? "";
	if (textTypes.has(type) && type !== "number")
		value = value.replace(/[\r\n]/g, "");
	if (type === "url" || type === "email")
		value = value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
	if (type === "email" && Object.hasOwn(node.attributes, "multiple"))
		value = value
			.split(",")
			.map((part) => part.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""))
			.join(",");
	if (
		type === "number" &&
		(!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
			!Number.isFinite(Number(value)))
	)
		return "";
	return value;
}

function editable(tree: DocumentTree, reference: string) {
	const node = tree.resolve(reference);
	if (isControlDisabled(tree, node.id))
		throw new AgentBrowserError("not-actionable", "Control is disabled");
	return node;
}

export function fillTextControl(
	tree: DocumentTree,
	reference: string,
	value: string,
) {
	if (typeof value !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Control value must be a string",
		);
	const node = editable(tree, reference);
	if (
		node.tagName !== "textarea" &&
		(node.tagName !== "input" || !textTypes.has(inputType(node)))
	)
		throw new AgentBrowserError(
			"not-actionable",
			"Expected a text or number control",
		);
	if (Object.hasOwn(node.attributes, "readonly"))
		throw new AgentBrowserError("not-actionable", "Control is readonly");
	if (
		node.tagName === "input" &&
		inputType(node) === "number" &&
		value &&
		(!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
			!Number.isFinite(Number(value)))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid numeric control value",
		);
	tree.setControl(node.id, {
		value:
			node.tagName === "textarea"
				? value.replace(/\r\n?/g, "\n")
				: value.replace(/[\r\n]/g, ""),
	});
}

export function setControlChecked(
	tree: DocumentTree,
	reference: string,
	checked: boolean,
) {
	if (typeof checked !== "boolean")
		throw new AgentBrowserError(
			"invalid-input",
			"Checked state must be boolean",
		);
	const node = editable(tree, reference);
	if (
		node.tagName !== "input" ||
		!["checkbox", "radio"].includes(inputType(node))
	)
		throw new AgentBrowserError(
			"not-actionable",
			"Expected a checkbox or radio",
		);
	if (inputType(node) === "radio" && node.attributes.name) {
		const index = indexFor(tree);
		const states = (index.radioGroups.get(radioKey(index, node)) ?? []).map(
			(candidate) => ({
				id: candidate.id,
				checked:
					candidate.id === node.id
						? checked
						: checked
							? false
							: controlChecked(tree, candidate.id),
			}),
		);
		for (const state of states)
			tree.setControl(state.id, { checked: state.checked });
	} else tree.setControl(node.id, { checked });
}

export function selectControlValues(
	tree: DocumentTree,
	reference: string,
	values: readonly string[],
) {
	if (
		!Array.isArray(values) ||
		values.length > 5000 ||
		values.some((value) => typeof value !== "string")
	)
		throw new AgentBrowserError("invalid-input", "Invalid option values");
	const node = editable(tree, reference);
	if (node.tagName !== "select")
		throw new AgentBrowserError("not-actionable", "Expected a select control");
	const requested = new Set(values);
	if (!Object.hasOwn(node.attributes, "multiple") && requested.size > 1)
		throw new AgentBrowserError(
			"invalid-input",
			"Single select requires at most one value",
		);
	const options = selectOptions(tree, node.id);
	const matches = options.filter((option) =>
		requested.has(optionValue(tree, option.id)),
	);
	if (
		[...requested].some(
			(value) =>
				!matches.some((option) => optionValue(tree, option.id) === value),
		)
	)
		throw new AgentBrowserError("not-found", "Select option was not found");
	if (matches.some((option) => isControlDisabled(tree, option.id)))
		throw new AgentBrowserError("not-actionable", "Select option is disabled");
	const selected = new Set(
		(Object.hasOwn(node.attributes, "multiple")
			? matches
			: matches.slice(0, 1)
		).map((option) => option.id),
	);
	for (const option of options)
		tree.setControl(option.id, { selected: selected.has(option.id) });
	return options
		.filter((option) => selected.has(option.id))
		.map((option) => optionValue(tree, option.id));
}
