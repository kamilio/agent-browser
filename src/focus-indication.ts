import type { DocumentTree } from "./document.js";
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
	let ancestor: number | null = id;
	while (ancestor !== null) {
		const current = tree.get(ancestor);
		const editable = current.attributes.contenteditable?.toLowerCase();
		if (editable === "false") return false;
		if (
			editable !== undefined &&
			["", "true", "plaintext-only"].includes(editable)
		)
			return true;
		ancestor = current.parent;
	}
	return false;
}
