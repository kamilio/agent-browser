import { DocumentFileSelections } from "./control-files.js";
import type { DocumentTree } from "./document.js";

const owners = new WeakMap<DocumentTree, DocumentFileSelections>();

export function existingDocumentFiles(tree: DocumentTree) {
	return owners.get(tree);
}

export function documentFiles(tree: DocumentTree): DocumentFileSelections {
	tree.get(tree.root);
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentFileSelections(tree);
		owners.set(tree, owner);
		tree.onClose(() => owners.delete(tree));
	}
	return owner;
}
