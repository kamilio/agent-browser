import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

export function supportsImageBorderHint(node: Readonly<DocumentNode>): boolean {
	return (
		isHtmlElement(node) &&
		(node.tagName === "img" ||
			node.tagName === "object" ||
			(node.tagName === "input" &&
				node.attributes.type?.toLowerCase() === "image"))
	);
}

export function imageBorderWidth(
	value: string | undefined,
): string | undefined {
	if (value === undefined) return;
	if (value.length > 4096)
		throw new AgentBrowserError(
			"resource-limit",
			"Image border attribute limit exceeded",
		);
	const parsed = /^[\t\n\f\r ]*([+-]?\d+)/.exec(value);
	if (!parsed) return;
	const number = Number(parsed[1]);
	if (!Number.isSafeInteger(number))
		throw new AgentBrowserError(
			"resource-limit",
			"Image border precision limit exceeded",
		);
	return number > 0 ? `${number}px` : undefined;
}
