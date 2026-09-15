import { documentHead } from "./document-elements.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { parseNetworkUrl } from "./network.js";

export function sourceAlternateLink(
	attributes: Readonly<Record<string, string>>,
): { type: "text/markdown"; href: string } | undefined {
	const { rel, type, href } = attributes;
	if (
		Object.hasOwn(attributes, "http-equiv") ||
		rel === undefined ||
		rel.length > 256 ||
		!rel
			.toLowerCase()
			.split(/[\t\n\f\r ]+/)
			.includes("alternate") ||
		type === undefined ||
		type.length > 256 ||
		type.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "").toLowerCase() !==
			"text/markdown" ||
		href === undefined ||
		href.length > 4096 ||
		!href.trim() ||
		/[\p{Cc}\p{Cf}]/u.test(href)
	)
		return undefined;
	try {
		const resolved = parseNetworkUrl(
			new URL(href, "https://alternate.invalid/").href,
		);
		if (
			/^ *[a-z][a-z\d+.-]*:[/\\]{2}/i.test(href) &&
			resolved.href.length > 4096
		)
			return undefined;
	} catch {
		return undefined;
	}
	return { type: "text/markdown", href };
}

export interface DocumentAlternates {
	readonly kind: "html-alternate-representations-v1";
	readonly partial: true;
	readonly truncated: boolean;
	readonly entries: readonly Readonly<{
		type: "text/markdown";
		url: string;
	}>[];
}

export function documentAlternates(
	tree: DocumentTree,
): DocumentAlternates | undefined {
	const head = documentHead(tree);
	if (head === undefined) return undefined;
	const entries: DocumentAlternates["entries"][number][] = [];
	let truncated = false;
	let base: string | undefined;
	const children = tree.get(head).children;
	for (let index = 0; index < children.length; index++) {
		if (index >= 256) {
			truncated = true;
			break;
		}
		const node = tree.elementInfo(children[index]);
		if (!isHtmlElement(node, "link")) continue;
		const source = sourceAlternateLink(node.attributes);
		if (!source) continue;
		base ??= documentBaseUrl(tree);
		let url: string;
		try {
			url = parseNetworkUrl(new URL(source.href, base).href).href;
		} catch {
			continue;
		}
		if (url.length > 4096) continue;
		if (entries.length === 8) {
			truncated = true;
			break;
		}
		entries.push(Object.freeze({ type: source.type, url }));
	}
	return entries.length || truncated
		? Object.freeze({
				kind: "html-alternate-representations-v1",
				partial: true,
				truncated,
				entries: Object.freeze(entries),
			})
		: undefined;
}
