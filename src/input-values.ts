import type { DocumentNode } from "./document.js";
import { sanitizeCalendarInput } from "./input-calendar.js";
import { sanitizeEmailValue } from "./input-email.js";
import { validNumberValue } from "./input-number.js";
import { sanitizeRangeInput } from "./input-range.js";

const types = new Set([
	"hidden",
	"text",
	"search",
	"tel",
	"url",
	"email",
	"password",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
	"number",
	"range",
	"color",
	"checkbox",
	"radio",
	"file",
	"submit",
	"image",
	"reset",
	"button",
]);

export function inputTypeName(raw: string | undefined): string {
	const type =
		raw?.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) ?? "text";
	return types.has(type) ? type : "text";
}

export function inputType(node: Readonly<DocumentNode>): string {
	return inputTypeName(node.attributes.type);
}

export function inputValueMode(type: string) {
	if (type === "file") return "filename";
	if (type === "checkbox" || type === "radio") return "default/on";
	if (["hidden", "submit", "image", "reset", "button"].includes(type))
		return "default";
	return "value";
}

export function sanitizeInputValue(
	type: string,
	raw: string,
	attributes: Readonly<Record<string, string>>,
): string {
	if (type === "range") return sanitizeRangeInput(raw, attributes);
	const calendar = sanitizeCalendarInput(type, raw);
	if (calendar !== undefined) return calendar;
	if (type === "email")
		return sanitizeEmailValue(raw, Object.hasOwn(attributes, "multiple"));
	let value = raw;
	if (["text", "search", "tel", "url", "password"].includes(type))
		value = value.replace(/[\r\n]/g, "");
	if (type === "url") value = value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
	if (type === "number" && !validNumberValue(value)) return "";
	return value;
}
