import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { snapshotElementRole } from "./snapshot.js";

export interface ContentFocusMetadata {
	policy: "main-content-v1";
	selected: "main" | "article" | "document";
	reason:
		| "unique-main"
		| "unique-article"
		| "ambiguous-main"
		| "ambiguous-article"
		| "no-nonempty-landmark";
	mainCandidates: number;
	articleCandidates: number;
	scannedNodes: number;
}

interface FocusFrame {
	node: Readonly<DocumentNode>;
	childIndex: number;
	mainAncestor: boolean;
	articleAncestor: boolean;
	role?: "main" | "article";
	nonempty: boolean;
}

export function selectContentFocus(
	tree: DocumentTree,
	options: {
		maxNodes: number;
		maxDepth: number;
		skip: (node: Readonly<DocumentNode>) => boolean;
		visible: (id: number) => boolean;
		descend: (node: Readonly<DocumentNode>) => boolean;
	},
): { root: number; metadata: Readonly<ContentFocusMetadata> } {
	const pending: FocusFrame[] = [
		{
			node: tree.get(tree.root),
			childIndex: -1,
			mainAncestor: false,
			articleAncestor: false,
			nonempty: false,
		},
	];
	let scannedNodes = 0;
	let mainCandidates = 0;
	let articleCandidates = 0;
	let mainRoot = tree.root;
	let articleRoot = tree.root;
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
					"Content focus scan limit exceeded",
				);
			if (options.skip(node)) {
				pending.pop();
				continue;
			}
			if (options.visible(node.id)) {
				if (node.kind === "text") current.nonempty = /\S/u.test(node.data);
				else if (isHtmlElement(node)) {
					const role = snapshotElementRole(tree, node.id);
					if (role === "main" || role === "article") current.role = role;
					if (node.tagName === "img")
						current.nonempty = /\S/u.test(node.attributes.alt ?? "");
				}
			}
			current.childIndex = options.descend(node) ? 0 : node.children.length;
		}
		if (current.childIndex < node.children.length) {
			pending.push({
				node: tree.get(node.children[current.childIndex++]),
				childIndex: -1,
				mainAncestor: current.mainAncestor || current.role === "main",
				articleAncestor: current.articleAncestor || current.role === "article",
				nonempty: false,
			});
			continue;
		}
		if (current.nonempty) {
			if (current.role === "main" && !current.mainAncestor) {
				mainCandidates++;
				mainRoot = node.id;
			} else if (current.role === "article" && !current.articleAncestor) {
				articleCandidates++;
				articleRoot = node.id;
			}
		}
		pending.pop();
		if (current.nonempty && pending.length)
			pending[pending.length - 1].nonempty = true;
	}
	const selected =
		mainCandidates === 1
			? "main"
			: mainCandidates === 0 && articleCandidates === 1
				? "article"
				: "document";
	return {
		root:
			selected === "main"
				? mainRoot
				: selected === "article"
					? articleRoot
					: tree.root,
		metadata: Object.freeze({
			policy: "main-content-v1",
			selected,
			reason:
				mainCandidates > 1
					? "ambiguous-main"
					: selected === "main"
						? "unique-main"
						: articleCandidates > 1
							? "ambiguous-article"
							: selected === "article"
								? "unique-article"
								: "no-nonempty-landmark",
			mainCandidates,
			articleCandidates,
			scannedNodes,
		}),
	};
}
