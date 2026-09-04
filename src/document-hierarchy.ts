import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export function validateDocumentInsertion(
	tree: DocumentTree,
	parentId: number,
	childId: number,
	excluded: readonly number[] = [],
	before?: number,
) {
	const parent = tree.get(parentId);
	if (parent.kind !== "document") return;
	if (before !== undefined && !parent.children.includes(before))
		throw new AgentBrowserError(
			"not-found",
			"Insertion reference is not a child",
		);
	const child = tree.get(childId);
	const incoming = child.kind === "fragment" ? child.children : [childId];
	const omitted = new Set([...excluded, ...incoming]);
	const remaining = parent.children.filter((current) => !omitted.has(current));
	const position =
		before === undefined
			? remaining.length
			: parent.children
					.slice(0, parent.children.indexOf(before))
					.filter((current) => !omitted.has(current)).length;
	const prospective = [
		...remaining.slice(0, position),
		...incoming,
		...remaining.slice(position),
	];
	let elements = 0;
	let doctypes = 0;
	for (const current of prospective) {
		const node = tree.get(current);
		if (node.kind === "element") elements++;
		if (node.kind === "doctype") doctypes++;
		if (
			node.kind === "text" ||
			elements > 1 ||
			doctypes > 1 ||
			(node.kind === "doctype" && elements > 0)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document child hierarchy",
			);
	}
}
