import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const firstElements = new WeakMap<Readonly<DocumentNode>, number | null>();

export function isInertRoot(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
	charge?: () => void,
): boolean {
	if (Object.hasOwn(node.attributes, "inert")) return true;
	if (!isHtmlElement(node, "button") || node.parent === null) return false;
	const parent = tree.get(node.parent);
	if (!isHtmlElement(parent, "select")) return false;
	let first = firstElements.get(parent);
	if (first === undefined) {
		first = null;
		for (const child of parent.children) {
			charge?.();
			if (tree.get(child).kind !== "element") continue;
			first = child;
			break;
		}
		firstElements.set(parent, first);
	}
	return first === node.id;
}

export function isInertSubtree(
	tree: DocumentTree,
	id: number,
	charge?: () => void,
): boolean {
	let current: number | null = id;
	while (current !== null) {
		charge?.();
		const node = tree.get(current);
		if (isInertRoot(tree, node, charge)) return true;
		current = node.parent;
	}
	return false;
}
