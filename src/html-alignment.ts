import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

function hasTextAlignmentHint(node: Readonly<DocumentNode>): boolean {
	return (
		isHtmlElement(node) &&
		["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tagName)
	);
}

export function htmlTextAlignment(
	node: Readonly<DocumentNode>,
): "left" | "center" | "right" | "justify" | undefined {
	if (!hasTextAlignmentHint(node)) return;
	const value = node.attributes.align;
	if (value === undefined) return;
	if (value.length > 4096)
		throw new AgentBrowserError(
			"resource-limit",
			"HTML alignment attribute limit exceeded",
		);
	if (value.length > 7) return;
	const alignment = value.toLowerCase();
	if (
		alignment === "left" ||
		alignment === "center" ||
		alignment === "right" ||
		alignment === "justify"
	)
		return alignment;
}

export function supportsTextAlignmentHint(
	node: Readonly<DocumentNode>,
): boolean {
	return hasTextAlignmentHint(node) && htmlTextAlignment(node) !== "justify";
}
