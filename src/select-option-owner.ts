import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

interface AncestorNode {
	id: number;
	kind: DocumentNode["kind"];
	parent: number | null;
	tagName: string;
	namespaceURI?: string;
}

export function nearestSelect(
	parent: number | null,
	read: (id: number) => AncestorNode | undefined,
): number | undefined {
	let optgroup = false;
	let current = parent;
	while (current !== null) {
		const ancestor = read(current);
		if (!ancestor) return undefined;
		if (!isHtmlElement(ancestor)) {
			current = ancestor.parent;
			continue;
		}
		if (["datalist", "hr", "option"].includes(ancestor.tagName))
			return undefined;
		if (ancestor.tagName === "optgroup") {
			if (optgroup) return undefined;
			optgroup = true;
		}
		if (ancestor.tagName === "select") return ancestor.id;
		current = ancestor.parent;
	}
	return undefined;
}
