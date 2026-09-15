import type { DocumentTree } from "./document.js";

interface TextDocumentInfo {
	textNode: number;
	revision: number;
	mime?: string;
}

const information = new WeakMap<DocumentTree, Readonly<TextDocumentInfo>>();

export function textDocumentInfo(tree: DocumentTree) {
	return information.get(tree);
}

export function registerTextDocument(
	tree: DocumentTree,
	textNode: number,
	mime?: string,
) {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(
		tree,
		Object.freeze({
			textNode,
			revision: tree.revision,
			...(mime === undefined ? {} : { mime }),
		}),
	);
}
