import { documentHead } from "./document-elements.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const descriptionNames = new Set([
	"description",
	"og:description",
	"twitter:description",
]);

export function descriptionMeta(
	attributes: Readonly<Record<string, string>>,
):
	| { attribute: "name" | "property"; name: string; content: string }
	| undefined {
	if (
		Object.hasOwn(attributes, "http-equiv") ||
		!Object.hasOwn(attributes, "content")
	)
		return undefined;
	for (const attribute of ["name", "property"] as const) {
		const value = attributes[attribute];
		if (value === undefined || value.length > 64) continue;
		const name = value
			.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			.toLowerCase();
		if (descriptionNames.has(name))
			return { attribute, name, content: attributes.content };
	}
	return undefined;
}

export interface DocumentDescriptions {
	readonly kind: "html-meta-descriptions-v1";
	readonly partial: true;
	readonly truncated: boolean;
	readonly entries: readonly Readonly<{
		attribute: "name" | "property";
		name: string;
		text: string;
		truncated: boolean;
	}>[];
}

export function documentDescriptions(
	tree: DocumentTree,
): DocumentDescriptions | undefined {
	const head = documentHead(tree);
	if (head === undefined) return undefined;
	const entries: DocumentDescriptions["entries"][number][] = [];
	let truncated = false;
	for (const id of tree.get(head).children) {
		const node = tree.elementInfo(id);
		if (!isHtmlElement(node, "meta")) continue;
		const description = descriptionMeta(node.attributes);
		if (!description || !description.content.trim()) continue;
		if (entries.length === 8) {
			truncated = true;
			break;
		}
		let end = Math.min(description.content.length, 2048);
		if (
			end < description.content.length &&
			/[\uD800-\uDBFF]/.test(description.content.charAt(end - 1)) &&
			/[\uDC00-\uDFFF]/.test(description.content.charAt(end))
		)
			end--;
		const text = description.content
			.slice(0, end)
			.replace(/\r\n?/g, "\n")
			.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
				character === "\n" || character === "\t"
					? character
					: `\\u{${character.codePointAt(0)?.toString(16)}}`,
			);
		entries.push(
			Object.freeze({
				attribute: description.attribute,
				name: description.name,
				text,
				truncated: end < description.content.length,
			}),
		);
	}
	return entries.length
		? Object.freeze({
				kind: "html-meta-descriptions-v1",
				partial: true,
				truncated,
				entries: Object.freeze(entries),
			})
		: undefined;
}
