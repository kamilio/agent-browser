import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export interface LinkTarget {
	ref: string;
	url: string;
	label: string;
	labelTruncated: boolean;
}

interface LinkFrame {
	node: Readonly<DocumentNode>;
	childIndex: number;
	link: LinkTarget | null;
}

function resolveLinkUrl(
	href: string,
	baseUrl: string,
	maxCodeUnits: number,
): string | null {
	if (href.length > maxCodeUnits || /\p{Cc}/u.test(href)) return null;
	try {
		const resolved = new URL(href, baseUrl).href;
		if (resolved.length > maxCodeUnits) return null;
		return parseNetworkUrl(resolved).href;
	} catch {
		return null;
	}
}

export function collectLinkTargets(
	tree: DocumentTree,
	query: string,
	options: {
		maxNodes: number;
		maxDepth: number;
		maxEntries: number;
		maxLabelCodeUnits: number;
		maxUrlCodeUnits: number;
		baseUrl: string;
		skip: (node: Readonly<DocumentNode>) => boolean;
		visible: (id: number) => boolean;
		descend: (node: Readonly<DocumentNode>) => boolean;
		checkpoint?: () => void;
	},
): {
	entries: LinkTarget[];
	scannedNodes: number;
	truncated: boolean;
} {
	const entries: LinkTarget[] = [];
	const active: LinkTarget[] = [];
	const pending: LinkFrame[] = [
		{ node: tree.get(tree.root), childIndex: -1, link: null },
	];
	const needle = query.toLowerCase();
	let scannedNodes = 0;
	const finish = (truncated: boolean) => {
		if (truncated) {
			for (const link of active) link.labelTruncated = true;
		}
		for (const link of entries)
			link.label = link.label.replace(/\s+/g, " ").trim();
		return { entries, scannedNodes, truncated };
	};
	while (pending.length) {
		const current = pending[pending.length - 1];
		const node = current.node;
		if (current.childIndex === -1) {
			if (
				++scannedNodes > options.maxNodes ||
				pending.length - 1 > options.maxDepth
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Link discovery scan limit exceeded",
				);
			options.checkpoint?.();
			if (options.skip(node)) {
				pending.pop();
				continue;
			}
			if (
				node.kind === "element" &&
				node.tagName === "a" &&
				node.attributes.href !== undefined &&
				options.visible(node.id)
			) {
				const url = resolveLinkUrl(
					node.attributes.href,
					options.baseUrl,
					options.maxUrlCodeUnits,
				);
				if (url?.toLowerCase().includes(needle)) {
					if (entries.length === options.maxEntries) return finish(true);
					const link: LinkTarget = {
						ref: tree.reference(node.id),
						url,
						label: "",
						labelTruncated: false,
					};
					entries.push(link);
					active.push(link);
					current.link = link;
				}
			} else if (
				node.kind === "text" &&
				active.length &&
				options.visible(node.id)
			) {
				for (const link of active) {
					const remaining = options.maxLabelCodeUnits - link.label.length;
					if (node.data.length > remaining) link.labelTruncated = true;
					if (remaining > 0) link.label += node.data.slice(0, remaining);
				}
			}
			if (!options.descend(node)) {
				if (current.link) active.pop();
				pending.pop();
				continue;
			}
			current.childIndex = 0;
		}
		if (current.childIndex === node.children.length) {
			if (current.link) active.pop();
			pending.pop();
			continue;
		}
		pending.push({
			node: tree.get(node.children[current.childIndex++]),
			childIndex: -1,
			link: null,
		});
	}
	return finish(false);
}
