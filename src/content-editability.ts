import type { DocumentNode, DocumentTree } from "./document.js";

export function contentEditableState(
	node: Readonly<DocumentNode>,
): "true" | "false" | "plaintext-only" | "inherit" {
	const value = node.attributes.contenteditable?.toLowerCase();
	if (value === "" || value === "true") return "true";
	if (value === "false" || value === "plaintext-only") return value;
	return "inherit";
}

export function isContentEditable(tree: DocumentTree, id: number): boolean {
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
	if (node.kind !== "element") return false;
	const state = contentEditableState(node);
	return (
		(state === "true" || state === "plaintext-only") &&
		(node.parent === null || !isContentEditable(tree, node.parent))
	);
}
