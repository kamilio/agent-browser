import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { inputType } from "./input-values.js";

export function lengthApplies(node: Readonly<DocumentNode>): boolean {
	if (!isHtmlElement(node)) return false;
	return (
		node.tagName === "textarea" ||
		(node.tagName === "input" &&
			["text", "search", "tel", "url", "email", "password"].includes(
				inputType(node),
			))
	);
}

export function parseLengthLimit(raw: string | undefined): number | undefined {
	const prefix = raw?.match(/^[\t\n\f\r ]*([+-]?[0-9]+)/)?.[1];
	if (prefix === undefined) return undefined;
	const value = Number(prefix);
	return value < 0
		? undefined
		: Math.min(Math.abs(value), Number.MAX_SAFE_INTEGER);
}

export function lengthValidity(
	node: Readonly<DocumentNode>,
	value: string,
	userEdited: boolean,
): { tooLong: boolean; tooShort: boolean } {
	if (!userEdited || !lengthApplies(node))
		return { tooLong: false, tooShort: false };
	const maximum = parseLengthLimit(node.attributes.maxlength);
	const minimum = parseLengthLimit(node.attributes.minlength);
	return {
		tooLong: maximum !== undefined && value.length > maximum,
		tooShort:
			minimum !== undefined && value.length > 0 && value.length < minimum,
	};
}
