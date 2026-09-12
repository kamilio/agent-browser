import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

const maximumPrefix = Math.floor(Number.MAX_SAFE_INTEGER / 10);
const maximumLastDigit = Number.MAX_SAFE_INTEGER % 10;

export function supportsCellPaddingHint(node: Readonly<DocumentNode>): boolean {
	return isHtmlElement(node, "table");
}

export function cellPaddingLength(
	value: string | undefined,
): string | undefined {
	if (value === undefined) return;
	let position = 0;
	while (position < value.length) {
		const code = value.charCodeAt(position);
		if (code !== 9 && code !== 10 && code !== 12 && code !== 13 && code !== 32)
			break;
		position++;
	}
	const negative = value[position] === "-";
	if (negative || value[position] === "+") position++;
	let digits = false;
	let number = 0;
	while (position < value.length) {
		const digit = value.charCodeAt(position) - 48;
		if (digit < 0 || digit > 9) break;
		digits = true;
		if (negative && digit !== 0) return;
		if (
			number > maximumPrefix ||
			(number === maximumPrefix && digit > maximumLastDigit)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Cell padding integer precision limit exceeded",
			);
		number = number * 10 + digit;
		position++;
	}
	return digits ? `${number}px` : undefined;
}

export function cellPaddingOwner(
	tree: DocumentTree,
	node: Readonly<DocumentNode>,
	charge: (amount?: number) => void,
): number | undefined {
	if (
		!isHtmlElement(node) ||
		(node.tagName !== "td" && node.tagName !== "th") ||
		node.parent === null
	)
		return;
	charge();
	const row = tree.get(node.parent);
	if (!isHtmlElement(row, "tr") || row.parent === null) return;
	charge();
	const parent = tree.get(row.parent);
	if (supportsCellPaddingHint(parent)) return parent.id;
	if (
		!isHtmlElement(parent) ||
		(parent.tagName !== "thead" &&
			parent.tagName !== "tbody" &&
			parent.tagName !== "tfoot") ||
		parent.parent === null
	)
		return;
	charge();
	const table = tree.get(parent.parent);
	return supportsCellPaddingHint(table) ? table.id : undefined;
}
