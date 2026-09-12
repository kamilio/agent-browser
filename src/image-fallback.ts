import type { DocumentNode, DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import { isHtmlElement } from "./dom-namespaces.js";

export function brokenImageAlternative(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): string | undefined {
	if (
		!isHtmlElement(node, "img") ||
		!Object.hasOwn(node.attributes, "alt") ||
		node.attributes.alt === "" ||
		!node.attributes.src ||
		node.attributes.srcset !== undefined ||
		node.attributes.crossorigin !== undefined ||
		node.attributes.referrerpolicy !== undefined ||
		(node.parent !== null && isHtmlElement(tree.get(node.parent), "picture"))
	)
		return;
	const images = documentImages(tree);
	const state = images.get(node.id);
	if (
		state.state !== "broken" ||
		!state.complete ||
		!state.currentSrc ||
		state.naturalWidth !== 0 ||
		state.naturalHeight !== 0 ||
		images.decoded(node.id) !== undefined
	)
		return;
	return node.attributes.alt;
}
