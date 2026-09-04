import type { DocumentTree } from "./document.js";
import { isContentEditable } from "./content-editability.js";
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
	if (
		node.tagName === "textarea" ||
		(node.tagName === "input" && keyboardInputs.has(inputType(node)))
	)
		return !Object.hasOwn(node.attributes, "readonly");
	return isContentEditable(tree, id);
}
