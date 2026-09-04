import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { htmlAttributeEntries } from "./html-attributes.js";

const voidTags = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
	"basefont",
	"bgsound",
	"frame",
	"keygen",
]);
const rawTags = new Set([
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"plaintext",
]);
const escaped: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"\u00a0": "&nbsp;",
};

export interface HtmlSerializationOptions {
	includeSelf?: boolean;
	maxCodeUnits?: number;
	scripting?: boolean;
}

export function serializeHtml(
	tree: DocumentTree,
	id = tree.root,
	options: HtmlSerializationOptions = {},
): string {
	tree.get(id);
	const limit = options.maxCodeUnits ?? tree.limits.maxTextCodeUnits;
	if (!Number.isSafeInteger(limit) || limit < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid HTML serialization limit",
		);
	const parts: string[] = [];
	let length = 0;
	const check = (extra: number) => {
		if (length + extra > limit)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML serialization output limit exceeded",
			);
	};
	const append = (value: string) => {
		check(value.length);
		if (value) parts.push(value);
		length += value.length;
	};
	const appendEscaped = (value: string, attribute = false) => {
		let size = value.length;
		for (const character of value) {
			const replacement =
				character === '"' && !attribute ? undefined : escaped[character];
			if (replacement) size += replacement.length - 1;
			check(size);
		}
		check(size);
		append(
			value.replace(
				attribute ? /[&<>"\u00a0]/g : /[&<>\u00a0]/g,
				(character) => escaped[character],
			),
		);
	};
	const pending: ({ id: number; include: boolean } | { close: string })[] = [
		{ id, include: options.includeSelf ?? false },
	];
	while (pending.length) {
		const entry = pending.pop();
		if (!entry) break;
		if ("close" in entry) {
			append(entry.close);
			continue;
		}
		const node = tree.get(entry.id);
		if (node.kind === "doctype") {
			if (entry.include) append(`<!DOCTYPE ${node.doctype?.name ?? ""}>`);
			continue;
		}
		if (node.kind === "element" && node.tagName === "template")
			throw new AgentBrowserError(
				"unsupported",
				"Template serialization is not implemented",
			);
		if (entry.include && node.kind === "text") {
			const parent = node.parent === null ? undefined : tree.get(node.parent);
			if (
				parent &&
				(rawTags.has(parent.tagName) ||
					(parent.tagName === "noscript" && (options.scripting ?? true)))
			)
				append(node.data);
			else appendEscaped(node.data);
			continue;
		}
		if (entry.include && node.kind === "comment") {
			append("<!--");
			append(node.data);
			append("-->");
			continue;
		}
		if (entry.include && node.kind === "element") {
			append(`<${node.tagName}`);
			for (const [name, value] of htmlAttributeEntries(node.attributes)) {
				append(` ${name}="`);
				appendEscaped(value, true);
				append('"');
			}
			append(">");
			if (!voidTags.has(node.tagName))
				pending.push({ close: `</${node.tagName}>` });
		}
		if (node.kind === "element" && voidTags.has(node.tagName)) continue;
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push({ id: node.children[index], include: true });
	}
	return parts.join("");
}
