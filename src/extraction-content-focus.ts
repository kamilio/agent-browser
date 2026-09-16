import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { snapshotElementRole } from "./snapshot.js";

export type ContentFocusPolicy = "main-content-v1" | "main-content-v2";

export interface ContentFocusMetadata {
	policy: ContentFocusPolicy;
	selected: "main" | "article" | "document";
	reason:
		| "unique-main"
		| "unique-article"
		| "ambiguous-main"
		| "ambiguous-article"
		| "article-with-outside-content"
		| "no-nonempty-landmark";
	mainCandidates: number;
	articleCandidates: number;
	scannedNodes: number;
	outsideArticleContent?: boolean;
}

const ancillaryTags = new Set(["header", "footer", "nav", "aside"]);
const ancillaryRoles = new Set([
	"banner",
	"contentinfo",
	"navigation",
	"complementary",
]);

interface FocusFrame {
	node: Readonly<DocumentNode>;
	childIndex: number;
	mainAncestor: boolean;
	articleAncestor: boolean;
	ancillaryAncestor: boolean;
	role?: "main" | "article";
	nonempty: boolean;
}

export function selectContentFocus(
	tree: DocumentTree,
	options: {
		policy: ContentFocusPolicy;
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
			ancillaryAncestor: false,
			nonempty: false,
		},
	];
	let scannedNodes = 0;
	let mainCandidates = 0;
	let articleCandidates = 0;
	let mainRoot = tree.root;
	let articleRoot = tree.root;
	const conservative = options.policy === "main-content-v2";
	let outsideArticleContent = false;
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
			const visible = options.visible(node.id);
			const html = isHtmlElement(node);
			const role =
				html && (visible || conservative)
					? snapshotElementRole(tree, node.id)
					: undefined;
			if (
				conservative &&
				html &&
				(ancillaryTags.has(node.tagName) || ancillaryRoles.has(role ?? ""))
			)
				current.ancillaryAncestor = true;
			if (visible) {
				if (node.kind === "text") current.nonempty = /\S/u.test(node.data);
				else if (html) {
					if (role === "main" || role === "article") current.role = role;
					if (node.tagName === "img")
						current.nonempty = /\S/u.test(node.attributes.alt ?? "");
				}
			}
			if (
				conservative &&
				current.nonempty &&
				!current.articleAncestor &&
				current.role !== "article" &&
				!current.ancillaryAncestor
			)
				outsideArticleContent = true;
			current.childIndex = options.descend(node) ? 0 : node.children.length;
		}
		if (current.childIndex < node.children.length) {
			pending.push({
				node: tree.get(node.children[current.childIndex++]),
				childIndex: -1,
				mainAncestor: current.mainAncestor || current.role === "main",
				articleAncestor: current.articleAncestor || current.role === "article",
				ancillaryAncestor: current.ancillaryAncestor,
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
	const articleWithOutsideContent =
		conservative &&
		mainCandidates === 0 &&
		articleCandidates === 1 &&
		outsideArticleContent;
	const selected =
		mainCandidates === 1
			? "main"
			: mainCandidates === 0 &&
					articleCandidates === 1 &&
					!articleWithOutsideContent
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
			policy: options.policy,
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
								: articleWithOutsideContent
									? "article-with-outside-content"
									: "no-nonempty-landmark",
			mainCandidates,
			articleCandidates,
			scannedNodes,
			...(conservative ? { outsideArticleContent } : {}),
		}),
	};
}
