import type { DocumentNode, DocumentTree } from "./document.js";

const firstElements = new WeakMap<Readonly<DocumentNode>, number | null>();

export function isInertRoot(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
): boolean {
	if (Object.hasOwn(node.attributes, "inert")) return true;
	if (node.tagName !== "button" || node.parent === null) return false;
	const parent = tree.get(node.parent);
	if (parent.tagName !== "select") return false;
	let first = firstElements.get(parent);
	if (first === undefined) {
		first = null;
		for (const child of parent.children) {
			if (tree.get(child).kind !== "element") continue;
			first = child;
			break;
		}
		firstElements.set(parent, first);
	}
	return first === node.id;
}
