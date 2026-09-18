import { documentNonce, setDocumentNonce } from "./document-nonce.js";
import type { DocumentTree } from "./document.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import {
	scriptElementAsync,
	setScriptElementAsync,
} from "./script-element-state.js";

export function scriptElementProperties(
	tree: DocumentTree,
	id: number,
	read: () => unknown,
	string: (value: unknown) => string,
): NonNullable<ScriptHostObjectDefinition["properties"]> {
	const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {
		nonce: {
			get: () => {
				read();
				return documentNonce(tree, id);
			},
			set: (value) => {
				read();
				setDocumentNonce(tree, id, string(value));
			},
		},
		async: {
			get: () => {
				read();
				return scriptElementAsync(tree, id);
			},
			set: (value) => {
				read();
				setScriptElementAsync(tree, id, Boolean(value));
			},
		},
	};
	for (const name of ["type", "charset", "integrity"])
		properties[name] = {
			get: () => {
				read();
				return tree.get(id).attributes[name] ?? "";
			},
			set: (value) => {
				read();
				tree.setAttribute(id, name, string(value));
			},
		};
	for (const [name, attribute] of [
		["defer", "defer"],
		["noModule", "nomodule"],
	])
		properties[name] = {
			get: () => {
				read();
				return Object.hasOwn(tree.get(id).attributes, attribute);
			},
			set: (value) => {
				read();
				if (value) tree.setAttribute(id, attribute, "");
				else tree.removeAttribute(id, attribute);
			},
		};
	properties.crossOrigin = {
		get: () => {
			read();
			const value = tree.get(id).attributes.crossorigin;
			return value === undefined
				? null
				: value.toLowerCase() === "use-credentials"
					? "use-credentials"
					: "anonymous";
		},
		set: (value) => {
			read();
			if (value === null) tree.removeAttribute(id, "crossorigin");
			else tree.setAttribute(id, "crossorigin", string(value));
		},
	};
	return properties;
}
