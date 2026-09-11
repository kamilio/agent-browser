import { contentEditableState } from "./content-editability.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { inputType } from "./input-values.js";

const keyboardInputs = new Set([
	"text",
	"search",
	"url",
	"tel",
	"email",
	"password",
	"number",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
]);

export function supportsFocusKeyboardInput(
	tree: DocumentTree,
	id: number,
): boolean {
	const node = tree.get(id);
	if (!isHtmlElement(node)) return false;
	if (
		node.tagName === "textarea" ||
		(node.tagName === "input" && keyboardInputs.has(inputType(node)))
	)
		return !Object.hasOwn(node.attributes, "readonly");
	let ancestor: number | null = id;
	while (ancestor !== null) {
		const current = tree.get(ancestor);
		if (isHtmlElement(current)) {
			const state = contentEditableState(current);
			if (state !== "inherit") return state !== "false";
		}
		ancestor = current.parent;
	}
	return false;
}
