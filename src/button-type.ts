import type { DocumentNode, DocumentTree } from "./document.js";
import { inputType } from "./input-values.js";

export function buttonType(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): "submit" | "reset" | "button" {
	const type = node.attributes.type?.replace(/[A-Z]/g, (letter) =>
		letter.toLowerCase(),
	);
	if (type === "submit" || type === "reset" || type === "button") return type;
	return Object.hasOwn(node.attributes, "command") ||
		Object.hasOwn(node.attributes, "commandfor") ||
		(node.parent !== null && tree.get(node.parent).tagName === "select")
		? "button"
		: "submit";
}

export function isSubmitButton(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): boolean {
	return node.tagName === "button"
		? buttonType(tree, node) === "submit"
		: node.tagName === "input" && ["submit", "image"].includes(inputType(node));
}
