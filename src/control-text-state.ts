import { inputType, isControlDisabled } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { isInertSubtree } from "./inertness.js";

export function controlTextState(tree: DocumentTree, id: number) {
	const node = tree.get(id);
	if (!isHtmlElement(node)) return;
	if (
		!tree.isConnected(id) ||
		isControlDisabled(tree, id) ||
		isInertSubtree(tree, id)
	)
		return;
	if (
		node.tagName !== "textarea" &&
		!(
			node.tagName === "input" &&
			["text", "search", "url", "tel", "password"].includes(inputType(node))
		)
	)
		return;
	const reference = tree.reference(id);
	const layout = layoutDocument(tree);
	let used: (typeof layout.text.horizontal.images)[number] | undefined;
	for (const image of layout.text.horizontal.images) {
		if (image.ref !== reference) continue;
		if (used) return;
		used = image;
	}
	if (!used || used.contentWidth <= 0 || used.contentHeight <= 0) return;
	const formatting = layout.text.horizontal.formatting.nodes[used.id];
	const control = formatting.control;
	if (
		!formatting.visible ||
		!control ||
		(control.kind !== "text" && control.kind !== "textarea")
	)
		return;
	const rectangles = documentGeometry(tree).getClientRects(id);
	if (rectangles.length !== 1) return;
	const rectangle = rectangles[0];
	const originX = rectangle.x + used.borderLeft + used.paddingLeft;
	const originY = rectangle.y + used.borderTop + used.paddingTop;
	return {
		control,
		kind: control.kind,
		originX,
		originY,
		width: used.contentWidth,
		height: used.contentHeight,
		columns: Math.ceil(used.contentWidth),
		rows: Math.ceil(used.contentHeight),
		fingerprint: JSON.stringify([
			node.tagName,
			inputType(node),
			control.kind,
			control.text,
			control.fontSize,
			control.placeholder,
			originX,
			originY,
			used.contentWidth,
			used.contentHeight,
			rectangle,
		]),
	};
}
