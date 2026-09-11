import { textareaDefaultValue } from "./control-defaults.js";
import { existingDocumentFiles } from "./document-files.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { isFormAssociatedTag } from "./html-form-association.js";
import { validNumberValue } from "./input-number.js";
import { inputType, sanitizeInputValue } from "./input-values.js";
import { optionDisabled } from "./option-disabled.js";
import { nearestSelect } from "./select-option-owner.js";

export { inputType } from "./input-values.js";

const fieldsetAffected = new Set([
	"button",
	"fieldset",
	"input",
	"select",
	"textarea",
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
	root: number;
	revision: number;
	formRevision: number;
	nodes: Map<number, Readonly<DocumentNode>>;
	owners: Map<number, number | undefined>;
	controls: Map<number | undefined, Readonly<DocumentNode>[]>;
	disabled: Set<number>;
	options: Map<number, Readonly<DocumentNode>[]>;
	optionOwners: Map<number, number>;
	datalist: Set<number>;
	radioGroups: Map<string, Readonly<DocumentNode>[]>;
	selected: Set<number>;
	labels: Map<number, number>;
}

const indexes = new WeakMap<DocumentTree, ControlIndex>();

export function isLabelable(node: Readonly<DocumentNode>) {
	if (!isHtmlElement(node)) return false;
	return (
		["button", "meter", "output", "progress", "select", "textarea"].includes(
			node.tagName,
		) ||
		(node.tagName === "input" && inputType(node) !== "hidden")
	);
}

export function isInteractiveElement(node: Readonly<DocumentNode>) {
	if (!isHtmlElement(node)) return false;
	return (
		[
			"button",
			"details",
			"embed",
			"iframe",
			"label",
			"select",
			"textarea",
		].includes(node.tagName) ||
		(node.tagName === "input" && inputType(node) !== "hidden") ||
		(node.tagName === "a" && Object.hasOwn(node.attributes, "href")) ||
		(["audio", "video"].includes(node.tagName) &&
			Object.hasOwn(node.attributes, "controls")) ||
		(["img", "object"].includes(node.tagName) &&
			Object.hasOwn(node.attributes, "usemap"))
	);
}

function radioKey(index: ControlIndex, node: Readonly<DocumentNode>) {
	return JSON.stringify([
		index.owners.get(node.id) ?? null,
		node.attributes.name ?? "",
	]);
}

function indexFor(tree: DocumentTree, target = tree.root): ControlIndex {
	tree.reference(tree.root);
	const root = tree.rootOf(target);
	const cached = indexes.get(tree);
	if (
		cached?.root === root &&
		cached.revision === tree.revision &&
		cached.formRevision === tree.formAssociationRevision
	)
		return cached;
	const nodes = new Map(
		Array.from(tree.walk(root), ({ node }) => [node.id, node] as const),
	);
	const index: ControlIndex = {
		root,
		revision: tree.revision,
		formRevision: tree.formAssociationRevision,
		nodes,
		owners: new Map(),
		controls: new Map(),
		disabled: new Set(),
		options: new Map(),
		optionOwners: new Map(),
		datalist: new Set(),
		radioGroups: new Map(),
		selected: new Set(),
		labels: new Map(),
	};
	const htmlIds = new Map<string, number>();
	const firstLegends = new Map<number, number>();
	for (const node of nodes.values()) {
		if (node.attributes.id && !htmlIds.has(node.attributes.id))
			htmlIds.set(node.attributes.id, node.id);
		if (isHtmlElement(node, "fieldset")) {
			const first = node.children.find((child) => {
				const candidate = nodes.get(child);
				return candidate && isHtmlElement(candidate, "legend");
			});
			if (first !== undefined) firstLegends.set(node.id, first);
		}
	}
	const inheritedFieldset = new Set<number>();
	for (const node of nodes.values()) {
		const parent = nodes.get(node.parent ?? -1);
		if (parent) {
			if (
				inheritedFieldset.has(parent.id) ||
				(isHtmlElement(parent, "fieldset") &&
					Object.hasOwn(parent.attributes, "disabled") &&
					firstLegends.get(parent.id) !== node.id)
			)
				inheritedFieldset.add(node.id);
			if (index.datalist.has(parent.id) || isHtmlElement(parent, "datalist"))
				index.datalist.add(node.id);
		}
		if (!isHtmlElement(node)) continue;
		if (
			fieldsetAffected.has(node.tagName) &&
			(Object.hasOwn(node.attributes, "disabled") ||
				inheritedFieldset.has(node.id))
		)
			index.disabled.add(node.id);
		if (
			(node.tagName === "option" &&
				optionDisabled(node, (id) => nodes.get(id))) ||
			(node.tagName === "optgroup" &&
				Object.hasOwn(node.attributes, "disabled"))
		)
			index.disabled.add(node.id);
		if (isFormAssociatedTag(node.tagName)) {
			let owner = tree.parserFormOwner(node.id);
			if (owner !== undefined && !isHtmlElement(tree.get(owner), "form"))
				owner = undefined;
			if (
				owner === undefined &&
				nodes.get(root)?.kind === "document" &&
				Object.hasOwn(node.attributes, "form")
			) {
				const target = nodes.get(htmlIds.get(node.attributes.form) ?? -1);
				if (target && isHtmlElement(target, "form")) owner = target.id;
			} else if (owner === undefined) {
				let ancestor = parent;
				while (ancestor) {
					if (isHtmlElement(ancestor, "form")) {
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
			const owner = nearestSelect(node.parent, (id) => nodes.get(id));
			if (owner !== undefined) {
				const options = index.options.get(owner) ?? [];
				options.push(node);
				index.options.set(owner, options);
				index.optionOwners.set(node.id, owner);
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
	for (const options of index.options.values())
		for (const option of options)
			if (option.control.selected) index.selected.add(option.id);
	const firstLabelableDescendant = new Map<number, number>();
	for (const node of [...nodes.values()].reverse()) {
		for (const childId of node.children) {
			const child = nodes.get(childId);
			const candidate =
				child && isLabelable(child)
					? child.id
					: firstLabelableDescendant.get(childId);
			if (candidate !== undefined) {
				firstLabelableDescendant.set(node.id, candidate);
				break;
			}
		}
		if (!isHtmlElement(node, "label")) continue;
		const target = Object.hasOwn(node.attributes, "for")
			? htmlIds.get(node.attributes.for)
			: firstLabelableDescendant.get(node.id);
		const control = target === undefined ? undefined : nodes.get(target);
		if (control && isLabelable(control)) index.labels.set(node.id, control.id);
	}
	if (!cached) tree.onClose(() => indexes.delete(tree));
	indexes.set(tree, index);
	return index;
}

export function labelControl(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id), "label"))
		throw new AgentBrowserError("invalid-input", "Expected a label element");
	return indexFor(tree, id).labels.get(id);
}

export function formOwner(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id))) return undefined;
	return indexFor(tree, id).owners.get(id);
}
export function formControls(tree: DocumentTree, formId: number) {
	if (!isHtmlElement(tree.get(formId), "form"))
		throw new AgentBrowserError("invalid-input", "Expected a form");
	return [...(indexFor(tree, formId).controls.get(formId) ?? [])];
}
export function isControlDisabled(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id))) return false;
	return indexFor(tree, id).disabled.has(id);
}
export function isInsideDatalist(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id))) return false;
	return indexFor(tree, id).datalist.has(id);
}
export function selectOptions(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id), "select")) return [];
	return [...(indexFor(tree, id).options.get(id) ?? [])];
}

export function selectedOptions(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id), "select")) return [];
	const index = indexFor(tree, id);
	return (index.options.get(id) ?? []).filter((option) =>
		index.selected.has(option.id),
	);
}

export function optionSelected(tree: DocumentTree, id: number) {
	const node = tree.get(id);
	if (!isHtmlElement(node, "option")) return false;
	const index = indexFor(tree, id);
	return index.optionOwners.has(id)
		? index.selected.has(id)
		: (node.control.selected ?? Object.hasOwn(node.attributes, "selected"));
}

export function optionOwner(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id), "option")) return undefined;
	return indexFor(tree, id).optionOwners.get(id);
}

export function optionText(tree: DocumentTree, id: number) {
	if (!isHtmlElement(tree.get(id), "option")) return "";
	const parts: string[] = [];
	const skipped = new Set<number>();
	for (const { node } of tree.walk(id)) {
		if (
			node.tagName === "script" ||
			(node.parent !== null && skipped.has(node.parent))
		) {
			skipped.add(node.id);
			continue;
		}
		if (node.kind === "text") parts.push(node.data);
	}
	return parts
		.join("")
		.replace(/[\t\n\f\r ]+/g, " ")
		.replace(/^ | $/g, "");
}

export function optionValue(tree: DocumentTree, id: number) {
	const option = tree.get(id);
	if (!isHtmlElement(option, "option")) return "";
	return option.attributes.value ?? optionText(tree, id);
}

export function optionLabel(tree: DocumentTree, id: number) {
	const option = tree.get(id);
	if (!isHtmlElement(option, "option")) return "";
	return option.attributes.label || optionText(tree, id);
}

export function controlChecked(tree: DocumentTree, id: number) {
	const node = tree.get(id);
	if (!isHtmlElement(node)) return false;
	return node.control.checked ?? Object.hasOwn(node.attributes, "checked");
}

export function controlShowsPlaceholder(
	tree: DocumentTree,
	id: number,
): boolean {
	const node = tree.get(id);
	return (
		Object.hasOwn(node.attributes, "placeholder") &&
		isTextControl(node) &&
		controlValue(tree, id) === ""
	);
}

export function controlValue(tree: DocumentTree, id: number): string {
	const node = tree.get(id);
	if (!isHtmlElement(node)) return "";
	if (node.tagName === "select") {
		const selected = selectedOptions(tree, id)[0];
		return selected ? optionValue(tree, selected.id) : "";
	}
	if (node.tagName === "textarea")
		return (node.control.value ?? textareaDefaultValue(tree, id)).replace(
			/\r\n?/g,
			"\n",
		);
	const type = inputType(node);
	if (node.tagName === "input" && type === "file") {
		const selected = existingDocumentFiles(tree)?.selectionMetadata(id)[0];
		return selected ? `C:\\fakepath\\${selected.name}` : "";
	}
	const fallback =
		type === "checkbox" || type === "radio"
			? "on"
			: type === "submit"
				? "Submit Query"
				: type === "reset"
					? "Reset"
					: "";
	const value = node.control.value ?? node.attributes.value ?? fallback;
	if (node.tagName !== "input")
		return node.control.value ?? node.attributes.value ?? "";
	return sanitizeInputValue(type, value, node.attributes);
}

function editable(tree: DocumentTree, reference: string) {
	const node = tree.resolve(reference);
	if (!isHtmlElement(node))
		throw new AgentBrowserError("not-actionable", "Expected an HTML control");
	if (isControlDisabled(tree, node.id))
		throw new AgentBrowserError("not-actionable", "Control is disabled");
	return node;
}

export function isTextControl(node: Readonly<DocumentNode>) {
	if (!isHtmlElement(node)) return false;
	return (
		node.tagName === "textarea" ||
		(node.tagName === "input" && textTypes.has(inputType(node)))
	);
}

export function validateTextControl(
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
	if (!isTextControl(node))
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
		!validNumberValue(value)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid numeric control value",
		);
	return node;
}

export function fillTextControl(
	tree: DocumentTree,
	reference: string,
	value: string,
) {
	const node = validateTextControl(tree, reference, value);
	tree.setControl(
		node.id,
		{
			value:
				node.tagName === "textarea"
					? value.replace(/\r\n?/g, "\n")
					: sanitizeInputValue(inputType(node), value, node.attributes),
		},
		"user",
	);
}

export function radioGroup(
	tree: DocumentTree,
	id: number,
): readonly Readonly<DocumentNode>[] {
	const node = tree.get(id);
	if (!isHtmlElement(node, "input") || inputType(node) !== "radio")
		throw new AgentBrowserError("invalid-input", "Expected a radio control");
	const index = indexFor(tree, id);
	return Object.freeze(
		node.attributes.name
			? [...(index.radioGroups.get(radioKey(index, node)) ?? [node])]
			: [node],
	);
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
	setControlCheckedState(tree, node.id, checked);
}

export function setControlCheckedState(
	tree: DocumentTree,
	id: number,
	checked: boolean,
) {
	if (typeof checked !== "boolean")
		throw new AgentBrowserError(
			"invalid-input",
			"Checked state must be boolean",
		);
	const node = tree.get(id);
	if (
		!isHtmlElement(node, "input") ||
		!["checkbox", "radio"].includes(inputType(node))
	)
		throw new AgentBrowserError(
			"not-actionable",
			"Expected a checkbox or radio",
		);
	tree.setInputChecked(node.id, checked);
}

export function selectControlValues(
	tree: DocumentTree,
	reference: string,
	values: readonly string[],
) {
	const prepared = prepareSelectControlValues(tree, reference, values);
	tree.setSelectSelection(
		tree.resolve(reference).id,
		[...prepared.selected],
		true,
	);
	return prepared.values;
}

export function prepareSelectControlValues(
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
	return {
		options,
		selected,
		values: options
			.filter((option) => selected.has(option.id))
			.map((option) => optionValue(tree, option.id)),
	};
}
