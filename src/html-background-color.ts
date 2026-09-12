import { cssNamedColors } from "./css-color.js";
import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const backgroundColorElements = new Set([
	"body",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"td",
	"th",
	"marquee",
]);

export function supportsBackgroundColorHint(
	node: Readonly<DocumentNode>,
): boolean {
	return isHtmlElement(node) && backgroundColorElements.has(node.tagName);
}

export function legacyColor(value: string | undefined): string | undefined {
	if (value === undefined || value.length === 0) return;
	let start = 0;
	let end = value.length;
	while (start < end && /[\t\n\f\r ]/.test(value[start])) start++;
	while (end > start && /[\t\n\f\r ]/.test(value[end - 1])) end--;
	if (end - start <= 128) {
		const keyword = value
			.slice(start, end)
			.replace(/[A-Z]/g, (character) => character.toLowerCase());
		if (keyword === "transparent") return;
		if (Object.hasOwn(cssNamedColors, keyword))
			return `#${cssNamedColors[keyword]
				.slice(0, 3)
				.map((component) => component.toString(16).padStart(2, "0"))
				.join("")}`;
		if (/^#[0-9a-f]{3}$/.test(keyword))
			return `#${keyword
				.slice(1)
				.split("")
				.map((digit) => digit + digit)
				.join("")}`;
	}
	let input = "";
	let position = start;
	while (position < end && input.length < 128) {
		const codePoint = value.codePointAt(position) ?? 0;
		if (codePoint > 0xffff) {
			input += input.length === 127 ? "0" : "00";
			position += 2;
		} else {
			input += value[position];
			position++;
		}
	}
	if (input.startsWith("#")) input = input.slice(1);
	input = input.replace(/[^0-9a-fA-F]/g, "0").toLowerCase();
	while (input.length === 0 || input.length % 3 !== 0) input += "0";
	const length = input.length / 3;
	let components = [
		input.slice(0, length),
		input.slice(length, length * 2),
		input.slice(length * 2),
	].map((component) => component.slice(-8));
	while (
		components[0].length > 2 &&
		components.every((component) => component.startsWith("0"))
	)
		components = components.map((component) => component.slice(1));
	return `#${components
		.map((component) => component.slice(0, 2).padStart(2, "0"))
		.join("")}`;
}
