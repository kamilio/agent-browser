import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const baseUrlCache = new WeakMap<
	DocumentTree,
	{ revision: number; notifications: number; url: string }
>();

export function canRewriteDocumentUrl(current: URL, target: URL) {
	if (
		(["protocol", "username", "password", "hostname", "port"] as const).some(
			(key) => current[key] !== target[key],
		)
	)
		return false;
	if (target.protocol === "http:" || target.protocol === "https:") return true;
	if (current.pathname !== target.pathname) return false;
	return target.protocol === "file:" || current.search === target.search;
}

export function urlFragment(url: URL): string | null {
	const marker = url.href.indexOf("#");
	return marker === -1 ? null : url.href.slice(marker + 1);
}

export function decodeUrlFragment(fragment: string) {
	return (
		new URLSearchParams(
			`fragment=${fragment.replace(/\+/g, "%2B").replace(/&/g, "%26")}`,
		).get("fragment") ?? ""
	);
}

export function selectDocumentFragmentTarget(
	tree: DocumentTree,
	url = new URL(tree.url),
): number | null {
	tree.reference(tree.root);
	const fragment = urlFragment(url);
	if (!fragment) return null;
	const decoded = decodeUrlFragment(fragment);
	let rawId: number | null = null;
	let rawName: number | null = null;
	let decodedId: number | null = null;
	let decodedName: number | null = null;
	for (const { node } of tree.walk()) {
		if (node.kind !== "element") continue;
		if (node.attributes.id === fragment) rawId ??= node.id;
		if (isHtmlElement(node, "a") && node.attributes.name === fragment)
			rawName ??= node.id;
		if (node.attributes.id === decoded) decodedId ??= node.id;
		if (isHtmlElement(node, "a") && node.attributes.name === decoded)
			decodedName ??= node.id;
	}
	return rawId ?? rawName ?? decodedId ?? decodedName;
}

export function documentBaseUrl(tree: DocumentTree) {
	tree.get(tree.root);
	const revision = tree.revision;
	const notifications = tree.mutationMetrics().notifications;
	const cached = baseUrlCache.get(tree);
	if (cached?.revision === revision && cached.notifications === notifications)
		return cached.url;
	let baseUrl = tree.url;
	for (const { node } of tree.walk()) {
		if (!isHtmlElement(node, "base") || !Object.hasOwn(node.attributes, "href"))
			continue;
		try {
			const url = new URL(node.attributes.href, tree.url);
			baseUrl = ["data:", "javascript:"].includes(url.protocol)
				? tree.url
				: url.href;
		} catch {
			baseUrl = tree.url;
		}
		break;
	}
	baseUrlCache.set(tree, { revision, notifications, url: baseUrl });
	return baseUrl;
}

export function documentBaseTarget(tree: DocumentTree) {
	for (const { node } of tree.walk()) {
		if (
			!isHtmlElement(node, "base") ||
			!Object.hasOwn(node.attributes, "target")
		)
			continue;
		return /[\t\n\r<]/.test(node.attributes.target)
			? "_blank"
			: node.attributes.target || "_self";
	}
	return "_self";
}
