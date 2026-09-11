import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

export function textareaDefaultValue(tree: DocumentTree, id: number): string {
	const element = tree.get(id);
	if (!isHtmlElement(element, "textarea"))
		throw new AgentBrowserError("invalid-input", "Expected a textarea element");
	const parts: string[] = [];
	for (const child of element.children) {
		const node = tree.get(child);
		if (node.kind === "text") parts.push(node.data);
	}
	return parts.join("");
}
