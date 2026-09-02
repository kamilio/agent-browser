import { formControls, formOwner, inputType } from "./controls.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import type { ScriptCollections } from "./script-collections.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export function scriptFormProperties(
	tree: DocumentTree,
	id: number,
	read: () => Readonly<DocumentNode>,
	wrap: (id: number) => object,
	collections: ScriptCollections,
	string: (value: unknown) => string,
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
		properties.multiple = booleanAttribute("multiple");
		properties.type = {
			get: () => inputType(read()),
			set: (value) => {
				read();
				tree.setAttribute(id, "type", string(value));
			},
		};
	}
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
