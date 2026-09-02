import {
	controlValue,
	formOwner,
	optionOwner,
	optionSelected,
	optionText,
	optionValue,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptCollections } from "./script-collections.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export function scriptSelectBindings(
	tree: DocumentTree,
	id: number,
	read: () => Readonly<DocumentNode>,
	wrap: (id: number) => object,
	collections: ScriptCollections,
	string: (value: unknown) => string,
): ScriptHostObjectDefinition {
	const tag = read().tagName;
	if (!["select", "option", "optgroup"].includes(tag)) return {};
	const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {};
	const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {};
	const booleanAttribute = (name: string) => ({
		get: () => Object.hasOwn(read().attributes, name),
		set: (value: unknown) => {
			read();
			if (value) tree.setAttribute(id, name, "");
			else tree.removeAttribute(id, name);
		},
	});
	const attribute = (name: string, fallback: () => string = () => "") => ({
		get: () => read().attributes[name] ?? fallback(),
		set: (value: unknown) => {
			read();
			tree.setAttribute(id, name, string(value));
		},
	});
	const options = () => {
		read();
		return selectOptions(tree, id);
	};
	const replaceSelection = (selected: number | undefined) => {
		read();
		tree.setSelectSelection(id, selected === undefined ? [] : [selected]);
	};
	properties.disabled = booleanAttribute("disabled");
	if (tag === "select") {
		properties.name = attribute("name");
		properties.multiple = booleanAttribute("multiple");
		properties.required = booleanAttribute("required");
		properties.type = {
			get: () =>
				Object.hasOwn(read().attributes, "multiple")
					? "select-multiple"
					: "select-one",
		};
		properties.value = {
			get: () => {
				read();
				return controlValue(tree, id);
			},
			set: (value) => {
				const wanted = string(value);
				const target = options().find(
					(option) => optionValue(tree, option.id) === wanted,
				);
				replaceSelection(target?.id);
			},
		};
		properties.selectedIndex = {
			get: () => {
				const entries = options();
				const selected = selectedOptions(tree, id)[0]?.id;
				return entries.findIndex((option) => option.id === selected);
			},
			set: (value) => {
				const index = long(value);
				replaceSelection(options()[index]?.id);
			},
		};
		properties.options = {
			get: () => {
				read();
				return collections.get(id, "options");
			},
		};
		properties.selectedOptions = {
			get: () => {
				read();
				return collections.get(id, "selected-options");
			},
		};
		properties.length = {
			get: () => options().length,
			set: () => {
				read();
				throw new AgentBrowserError(
					"unsupported",
					"Resizing select options through length is not implemented",
				);
			},
		};
		properties.form = {
			get: () => {
				read();
				const owner = formOwner(tree, id);
				return owner === undefined ? null : wrap(owner);
			},
		};
		methods.remove = (...args) => {
			read();
			if (!args.length) {
				tree.remove(id);
				return;
			}
			const option = options()[long(args[0])];
			if (option) tree.remove(option.id);
		};
	} else {
		properties.label = attribute(
			"label",
			tag === "option" ? () => optionText(tree, id) : undefined,
		);
		if (tag === "option") {
			properties.value = attribute("value", () => optionText(tree, id));
			properties.text = {
				get: () => {
					read();
					return optionText(tree, id);
				},
				set: (value) => {
					read();
					tree.setTextContent(id, string(value));
				},
			};
			properties.defaultSelected = booleanAttribute("selected");
			properties.selected = {
				get: () => {
					read();
					return optionSelected(tree, id);
				},
				set: (value) => {
					read();
					tree.setOptionSelected(id, Boolean(value));
				},
			};
			properties.index = {
				get: () => {
					read();
					const owner = optionOwner(tree, id);
					return owner === undefined
						? 0
						: selectOptions(tree, owner).findIndex(
								(option) => option.id === id,
							);
				},
			};
			properties.form = {
				get: () => {
					read();
					const select = optionOwner(tree, id);
					const owner =
						select === undefined ? undefined : formOwner(tree, select);
					return owner === undefined ? null : wrap(owner);
				},
			};
		}
	}
	return { properties, methods };
}

function long(value: unknown) {
	if (
		value !== null &&
		["object", "function", "symbol", "bigint"].includes(typeof value)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Non-primitive numeric conversion is not implemented",
		);
	const number = Number(value);
	return Number.isFinite(number) ? Math.trunc(number) >> 0 : 0;
}
