import type { DocumentNode, DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import { isHtmlElement } from "./dom-namespaces.js";

export function emptyImageAlternative(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): boolean {
	if (
		!isHtmlElement(node, "img") ||
		node.attributes.srcset !== undefined ||
		node.attributes.crossorigin !== undefined ||
		node.attributes.referrerpolicy !== undefined ||
		(node.parent !== null && isHtmlElement(tree.get(node.parent), "picture"))
	)
		return false;
	const sourceAbsentOrEmpty =
		node.attributes.src === undefined || node.attributes.src === "";
	if (
		node.attributes.alt !== "" &&
		!(node.attributes.alt === undefined && sourceAbsentOrEmpty)
	)
		return false;
	const images = documentImages(tree);
	const state = images.get(node.id);
	if (
		!state.complete ||
		state.naturalWidth !== 0 ||
		state.naturalHeight !== 0 ||
		state.error === "policy-denied" ||
		state.error === "resource-limit" ||
		images.decoded(node.id) !== undefined
	)
		return false;
	return (
		(state.state === "empty" && sourceAbsentOrEmpty) || state.state === "broken"
	);
}

export function brokenImageAlternative(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): string | undefined {
	if (
		!isHtmlElement(node, "img") ||
		!Object.hasOwn(node.attributes, "alt") ||
		node.attributes.alt === "" ||
		node.attributes.srcset !== undefined ||
		node.attributes.crossorigin !== undefined ||
		node.attributes.referrerpolicy !== undefined ||
		(node.parent !== null && isHtmlElement(tree.get(node.parent), "picture"))
	)
		return;
	const images = documentImages(tree);
	const state = images.get(node.id);
	if (
		(state.state !== "broken" && state.state !== "empty") ||
		!state.complete ||
		state.naturalWidth !== 0 ||
		state.naturalHeight !== 0 ||
		images.decoded(node.id) !== undefined
	)
		return;
	return node.attributes.alt;
}
