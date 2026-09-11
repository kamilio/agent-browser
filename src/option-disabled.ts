import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

interface OptionNode {
	kind: DocumentNode["kind"];
	parent: number | null;
	tagName: string;
	namespaceURI?: string;
	attributes: Readonly<Record<string, string>>;
}

export function optionDisabled(
	option: OptionNode,
	read: (id: number) => OptionNode | undefined,
): boolean {
	if (!isHtmlElement(option, "option")) return false;
	if (Object.hasOwn(option.attributes, "disabled")) return true;
	let current = option.parent;
	while (current !== null) {
		const ancestor = read(current);
		if (!ancestor) return false;
		if (!isHtmlElement(ancestor)) {
			current = ancestor.parent;
			continue;
		}
		if (["select", "hr", "datalist", "option"].includes(ancestor.tagName))
			return false;
		if (ancestor.tagName === "optgroup")
			return Object.hasOwn(ancestor.attributes, "disabled");
		current = ancestor.parent;
	}
	return false;
}
