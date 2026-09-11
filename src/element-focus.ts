import {
	contentEditableState,
	isContentEditable,
} from "./content-editability.js";
import { summaryDetails } from "./details.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const parsedValues = new WeakMap<Readonly<DocumentNode>, number | null>();
const defaultZero = new Set([
	"a",
	"area",
	"button",
	"frame",
	"iframe",
	"input",
	"object",
	"select",
	"textarea",
]);

export function parsedTabIndex(node: Readonly<DocumentNode>): number | null {
	if (!isHtmlElement(node)) return null;
	const cached = parsedValues.get(node);
	if (cached !== undefined) return cached;
	const match = /^[\t\n\f\r ]*([+-]?[0-9]+)/.exec(
		node.attributes.tabindex ?? "",
	);
	const value = match ? Number(match[1]) : Number.NaN;
	const result = Number.isSafeInteger(value) ? (value === 0 ? 0 : value) : null;
	parsedValues.set(node, result);
	return result;
}

function elementTabIndex(tree: DocumentTree, node: Readonly<DocumentNode>) {
	if (!isHtmlElement(node)) return -1;
	const parsed = parsedTabIndex(node);
	if (parsed !== null && parsed >= -2_147_483_648 && parsed <= 2_147_483_647)
		return parsed;
	if (defaultZero.has(node.tagName)) return 0;
	if (summaryDetails(tree, node) !== undefined) return 0;
	return -1;
}

function signedLong(value: unknown) {
	if (
		value !== null &&
		(typeof value === "object" || typeof value === "function")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object-to-tabIndex conversion is not implemented",
		);
	return +(value as number) | 0;
}

export function scriptElementFocusProperties(
	tree: DocumentTree,
	id: number,
	read: () => Readonly<DocumentNode>,
	string: (value: unknown) => string,
): NonNullable<ScriptHostObjectDefinition["properties"]> {
	return {
		contentEditable: {
			get: () => contentEditableState(read()),
			set: (value) => {
				read();
				const state = string(value).toLowerCase();
				if (state === "inherit") tree.removeAttribute(id, "contenteditable");
				else if (["true", "false", "plaintext-only"].includes(state))
					tree.setAttribute(id, "contenteditable", state);
				else
					throw new DOMException(
						"Invalid contentEditable value",
						"SyntaxError",
					);
			},
		},
		isContentEditable: {
			get: () => {
				read();
				return isContentEditable(tree, id);
			},
		},
		tabIndex: {
			get: () => elementTabIndex(tree, read()),
			set: (value) => {
				read();
				tree.setAttribute(id, "tabindex", String(signedLong(value)));
			},
		},
		inert: {
			get: () => Object.hasOwn(read().attributes, "inert"),
			set: (value) => {
				read();
				if (value) tree.setAttribute(id, "inert", "");
				else tree.removeAttribute(id, "inert");
			},
		},
	};
}
