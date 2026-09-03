import { documentElement, documentHead } from "./document-elements.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

function titleElement(tree: DocumentTree): number | undefined {
	for (const { node } of tree.walk())
		if (node.kind === "element" && node.tagName === "title") return node.id;
	return undefined;
}

export function titleElementText(tree: DocumentTree, id: number): string {
	const title = tree.get(id);
	if (title.kind !== "element" || title.tagName !== "title")
		throw new AgentBrowserError("invalid-input", "Expected a title element");
	const parts: string[] = [];
	for (const child of title.children) {
		const node = tree.get(child);
		if (node.kind === "text") parts.push(node.data);
	}
	return parts.join("");
}

export function documentTitle(tree: DocumentTree): string {
	const title = titleElement(tree);
	if (title === undefined) return "";
	return titleElementText(tree, title)
		.replace(/[\t\n\f\r ]+/g, " ")
		.replace(/^ | $/g, "");
}

export function setDocumentTitle(tree: DocumentTree, value: string): void {
	if (typeof value !== "string")
		throw new AgentBrowserError("invalid-input", "Expected title text");
	const element = documentElement(tree);
	if (element === undefined) return;
	const title = titleElement(tree);
	if (title !== undefined) {
		tree.setTextContent(title, value);
		return;
	}
	const head = documentHead(tree);
	if (head === undefined) return;
	const staged = new DocumentTree(tree.url, tree.limits);
	try {
		const fragment = staged.createFragment();
		const created = staged.createElement("title");
		staged.setTextContent(created, value);
		staged.append(fragment, created);
		tree.insertChildrenFrom(head, staged, fragment);
	} finally {
		staged.close();
	}
}
