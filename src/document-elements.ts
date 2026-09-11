import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { isHtmlElement } from "./dom-namespaces.js";

export function documentElement(tree: DocumentTree): number | undefined {
	return tree
		.get(tree.root)
		.children.find((id) => tree.get(id).kind === "element");
}

function documentChild(
	tree: DocumentTree,
	names: readonly string[],
): number | undefined {
	const root = documentElement(tree);
	if (root === undefined) return undefined;
	const element = tree.get(root);
	if (!isHtmlElement(element, "html")) return undefined;
	return element.children.find((id) => {
		const child = tree.get(id);
		return isHtmlElement(child) && names.includes(child.tagName);
	});
}

export function documentHead(tree: DocumentTree): number | undefined {
	return documentChild(tree, ["head"]);
}

export function documentBody(tree: DocumentTree): number | undefined {
	return documentChild(tree, ["body", "frameset"]);
}

export function setDocumentBody(tree: DocumentTree, id: number): void {
	const body = tree.get(id);
	if (!isHtmlElement(body) || !["body", "frameset"].includes(body.tagName))
		throw new AgentBrowserError(
			"invalid-input",
			"Document body requires a body or frameset element",
		);
	const previous = documentBody(tree);
	if (previous === id) return;
	const root = documentElement(tree);
	if (root === undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Cannot set body without a document element",
		);
	if (previous === undefined) tree.append(root, id);
	else tree.replace(root, id, previous);
}
