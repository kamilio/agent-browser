import type { DocumentTree } from "./document.js";

export function documentNonce(tree: DocumentTree, id: number): string {
	return tree.nonceValue(id);
}

export function setDocumentNonce(
	tree: DocumentTree,
	id: number,
	value: string,
): void {
	tree.setAttribute(id, "nonce", value);
}
