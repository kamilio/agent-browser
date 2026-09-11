import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

export function contentEditableState(
	node: Readonly<DocumentNode>,
): "true" | "false" | "plaintext-only" | "inherit" {
	if (!isHtmlElement(node)) return "inherit";
	const value = node.attributes.contenteditable?.toLowerCase();
	if (value === "" || value === "true") return "true";
	if (value === "false" || value === "plaintext-only") return value;
	return "inherit";
}

export function isContentEditable(tree: DocumentTree, id: number): boolean {
	const target = tree.get(id);
	if (target.kind === "element" && !isHtmlElement(target)) return false;
	let ancestor: number | null = id;
	while (ancestor !== null) {
		const node = tree.get(ancestor);
		const state = contentEditableState(node);
		if (state !== "inherit") return state !== "false";
		ancestor = node.parent;
	}
	return false;
}

export function isRootEditableElement(tree: DocumentTree, id: number): boolean {
	const node = tree.get(id);
	if (!isHtmlElement(node)) return false;
	const state = contentEditableState(node);
	let parent = node.parent;
	while (parent !== null && !isHtmlElement(tree.get(parent)))
		parent = tree.get(parent).parent;
	return (
		(state === "true" || state === "plaintext-only") &&
		(parent === null || !isContentEditable(tree, parent))
	);
}
