import { contentEditableState } from "./content-editability.js";
import type { DocumentTree } from "./document.js";

const nonEditableContainers = new Set([
	"input",
	"textarea",
	"select",
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
	"basefont",
	"bgsound",
	"frame",
	"keygen",
]);

export function editableFillHost(
	tree: DocumentTree,
	id: number,
): number | null {
	const target = tree.get(id);
	if (target.kind !== "element" || nonEditableContainers.has(target.tagName))
		return null;
	let ancestor: number | null = id;
	let host: number | null = null;
	while (ancestor !== null) {
		const node = tree.get(ancestor);
		const state = contentEditableState(node);
		if (state === "false") break;
		if (state === "true" || state === "plaintext-only") host = node.id;
		ancestor = node.parent;
	}
	return host;
}
