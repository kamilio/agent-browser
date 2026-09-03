import { textareaDefaultValue } from "./control-defaults.js";
import {
	controlValue,
	formControls,
	formOwner,
	inputType,
} from "./controls.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { isValidationCandidate, validationMessage } from "./form-validation.js";
import { inputNumberValue, inputValueAsNumber } from "./input-value-number.js";
import { sanitizeInputValue } from "./input-values.js";
import { stepInputValue } from "./input-stepping.js";
import type { ScriptCollections } from "./script-collections.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptValidity } from "./script-validity.js";

export function scriptFormMethods(
	tree: DocumentTree,
	id: number,
	read: () => Readonly<DocumentNode>,
): NonNullable<ScriptHostObjectDefinition["methods"]> {
	if (read().tagName !== "input") return {};
	const step = (direction: 1 | -1, count: unknown) => {
		const node = read();
		const type = inputType(node);
		const value = stepInputValue(
			type,
			controlValue(tree, id),
			node.attributes,
			direction,
			count,
		);
		if (value !== undefined)
			tree.setControl(id, {
				value: sanitizeInputValue(type, value, node.attributes),
			});
	};
	return {
		stepUp: (count?: unknown) => step(1, count),
		stepDown: (count?: unknown) => step(-1, count),
	};
}

export function scriptFormProperties(
	tree: DocumentTree,
	id: number,
	read: () => Readonly<DocumentNode>,
	wrap: (id: number) => object,
	collections: ScriptCollections,
	string: (value: unknown) => string,
	validity: ScriptValidity,
) {
	const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {};
	const tag = read().tagName;
	const attribute = (
		name: string,
		values?: readonly string[],
		fallback = "",
	) => ({
		get: () => {
			const raw = read().attributes[name] ?? fallback;
			if (!values) return raw;
			const value = raw.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
			return values.includes(value) ? value : fallback;
		},
		set: (value: unknown) => {
			read();
			tree.setAttribute(id, name, string(value));
		},
	});
	const booleanAttribute = (name: string) => ({
		get: () => Object.hasOwn(read().attributes, name),
		set: (value: unknown) => {
			read();
			if (value) tree.setAttribute(id, name, "");
			else tree.removeAttribute(id, name);
		},
	});
	if (
		[
			"button",
			"fieldset",
			"input",
			"object",
			"output",
			"select",
			"textarea",
		].includes(tag)
	) {
		properties.name = attribute("name");
		properties.validity = {
			get: () => {
				read();
				return validity.get(id);
			},
		};
		properties.willValidate = {
			get: () => {
				read();
				return isValidationCandidate(tree, id);
			},
		};
		properties.validationMessage = {
			get: () => {
				read();
				return validationMessage(tree, id);
			},
		};
		properties.form = {
			get: () => {
				read();
				const owner = formOwner(tree, id);
				return owner === undefined ? null : wrap(owner);
			},
		};
	}
	if (["button", "fieldset", "input", "textarea"].includes(tag))
		properties.disabled = booleanAttribute("disabled");
	if (tag === "input" || tag === "textarea") {
		properties.readOnly = booleanAttribute("readonly");
		properties.required = booleanAttribute("required");
		properties.placeholder = attribute("placeholder");
	}
	if (tag === "input") {
		properties.valueAsNumber = {
			get: () => inputValueAsNumber(inputType(read()), controlValue(tree, id)),
			set: (value) => {
				const node = read();
				const type = inputType(node);
				const text = inputNumberValue(type, value);
				tree.setControl(id, {
					value: sanitizeInputValue(type, text, node.attributes),
				});
			},
		};
		properties.min = attribute("min");
		properties.max = attribute("max");
		properties.step = attribute("step");
		properties.defaultValue = attribute("value");
		properties.defaultChecked = booleanAttribute("checked");
		properties.multiple = booleanAttribute("multiple");
		properties.type = {
			get: () => inputType(read()),
			set: (value) => {
				read();
				tree.setAttribute(id, "type", string(value));
			},
		};
	}
	if (tag === "textarea")
		properties.defaultValue = {
			get: () => {
				read();
				return textareaDefaultValue(tree, id);
			},
			set: (value) => {
				read();
				tree.setTextContent(id, string(value));
			},
		};
	if (tag === "button") {
		properties.type = attribute(
			"type",
			["submit", "reset", "button"],
			"submit",
		);
		properties.value = attribute("value");
	}
	if (tag === "form") {
		properties.elements = {
			get: () => {
				read();
				return collections.get(id, "form-controls");
			},
		};
		properties.length = {
			get: () => {
				read();
				return formControls(tree, id).filter(
					(node) => !(node.tagName === "input" && inputType(node) === "image"),
				).length;
			},
		};
		properties.name = attribute("name");
		properties.target = attribute("target");
		properties.method = attribute("method", ["get", "post", "dialog"], "get");
		properties.enctype = attribute(
			"enctype",
			[
				"application/x-www-form-urlencoded",
				"multipart/form-data",
				"text/plain",
			],
			"application/x-www-form-urlencoded",
		);
		properties.encoding = properties.enctype;
		properties.autocomplete = attribute("autocomplete", ["on", "off"], "on");
		properties.acceptCharset = attribute("accept-charset");
		properties.noValidate = booleanAttribute("novalidate");
		properties.action = {
			get: () => {
				const raw = read().attributes.action;
				if (!raw) return tree.url;
				try {
					return new URL(raw, documentBaseUrl(tree)).href;
				} catch {
					return raw;
				}
			},
			set: (value) => {
				read();
				tree.setAttribute(id, "action", string(value));
			},
		};
	}
	return properties;
}
