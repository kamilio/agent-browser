import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

export function rustdocLineNumberAnchor(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
	atLineStart: boolean,
): boolean {
	const identifier = node.attributes.id;
	if (
		!atLineStart ||
		!isHtmlElement(node, "a") ||
		node.attributes["data-nosnippet"] !== "" ||
		!identifier ||
		!/^[1-9][0-9]{0,8}$/.test(identifier) ||
		node.attributes.href !== `#${identifier}` ||
		node.children.length !== 1
	)
		return false;
	const label = tree.get(node.children[0]);
	if (label.kind !== "text" || label.data !== identifier) return false;
	let parent = node.parent;
	let code = false;
	for (let steps = 0; parent !== null && steps < 128; steps++) {
		const ancestor = tree.get(parent);
		if (!isHtmlElement(ancestor)) return false;
		if (ancestor.tagName === "code") code = true;
		if (ancestor.tagName === "pre") {
			const classes = ancestor.attributes.class ?? "";
			return (
				code &&
				classes.length <= 1024 &&
				/(?:^|[\t\n\f\r ])rust(?:$|[\t\n\f\r ])/.test(classes)
			);
		}
		parent = ancestor.parent;
	}
	return false;
}
