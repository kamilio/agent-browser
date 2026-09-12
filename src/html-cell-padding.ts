import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
export { htmlPixelLength as cellPaddingLength } from "./html-pixel-length.js";

export function supportsCellPaddingHint(node: Readonly<DocumentNode>): boolean {
	return isHtmlElement(node, "table");
}

export function cellPaddingOwner(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
	charge: (amount?: number) => void,
): number | undefined {
	if (
		!isHtmlElement(node) ||
		(node.tagName !== "td" && node.tagName !== "th") ||
		node.parent === null
	)
		return;
	charge();
	const row = tree.get(node.parent);
	if (!isHtmlElement(row, "tr") || row.parent === null) return;
	charge();
	const parent = tree.get(row.parent);
	if (supportsCellPaddingHint(parent)) return parent.id;
	if (
		!isHtmlElement(parent) ||
		(parent.tagName !== "thead" &&
			parent.tagName !== "tbody" &&
			parent.tagName !== "tfoot") ||
		parent.parent === null
	)
		return;
	charge();
	const table = tree.get(parent.parent);
	return supportsCellPaddingHint(table) ? table.id : undefined;
}
