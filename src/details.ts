import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const summaries = new WeakMap<Readonly<DocumentNode>, number | null>();

export function firstDetailsSummary(
	tree: DocumentTree,
	details: Readonly<DocumentNode>,
	charge?: (amount: number) => void,
): number | null {
	if (!isHtmlElement(details, "details")) return null;
	const cached = summaries.get(details);
	if (cached !== undefined) return cached;
	let first: number | null = null;
	for (const child of details.children) {
		charge?.(1);
		if (isHtmlElement(tree.get(child), "summary")) {
			first = child;
			break;
		}
	}
	summaries.set(details, first);
	return first;
}

export function summaryDetails(
	tree: DocumentTree,
	summary: Readonly<DocumentNode>,
): number | undefined {
	if (!isHtmlElement(summary, "summary") || summary.parent === null) return;
	const parent = tree.get(summary.parent);
	if (firstDetailsSummary(tree, parent) === summary.id) return parent.id;
}

export function closedDetailsChild(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
	charge?: (amount: number) => void,
): boolean {
	if (node.parent === null) return false;
	const parent = tree.get(node.parent);
	return (
		isHtmlElement(parent, "details") &&
		!Object.hasOwn(parent.attributes, "open") &&
		firstDetailsSummary(tree, parent, charge) !== node.id
	);
}
