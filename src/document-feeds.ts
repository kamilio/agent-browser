import { sourceTypedAlternateLink } from "./document-alternates.js";
import { documentHead } from "./document-elements.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export type DocumentFeedType = "application/rss+xml" | "application/atom+xml";

export interface DocumentFeeds {
	readonly kind: "html-feed-links-v1";
	readonly scope: "document-head";
	readonly partial: true;
	readonly verified: false;
	readonly truncated: boolean;
	readonly entries: readonly Readonly<{
		type: DocumentFeedType;
		url: string;
	}>[];
}

const encoder = new TextEncoder();

export function sourceFeedLink(
	attributes: Readonly<Record<string, string>>,
): { type: DocumentFeedType; href: string } | undefined {
	return sourceTypedAlternateLink(attributes, [
		"application/rss+xml",
		"application/atom+xml",
	]);
}

function envelope(
	entries: DocumentFeeds["entries"],
	truncated: boolean,
): DocumentFeeds {
	return Object.freeze({
		kind: "html-feed-links-v1",
		scope: "document-head",
		partial: true,
		verified: false,
		truncated,
		entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
	});
}

export function documentFeeds(tree: DocumentTree): DocumentFeeds | undefined {
	const head = documentHead(tree);
	if (head === undefined) return undefined;
	const entries: DocumentFeeds["entries"][number][] = [];
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
		const source = sourceFeedLink(node.attributes);
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
		entries.push({ type: source.type, url });
	}
	return entries.length ? envelope(entries, truncated) : undefined;
}

export function fitDocumentFeeds(
	data: DocumentFeeds,
	maxBytes: number,
): DocumentFeeds | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid source feeds byte limit",
		);
	if (!data.entries.length) return undefined;
	if (encoder.encode(JSON.stringify(data)).byteLength <= maxBytes) return data;
	for (let count = Math.min(data.entries.length - 1, 8); count > 0; count--) {
		const prefix = envelope(data.entries.slice(0, count), true);
		if (encoder.encode(JSON.stringify(prefix)).byteLength <= maxBytes)
			return prefix;
	}
	return undefined;
}
