import { contentEditableState } from "./content-editability.js";
import type { DocumentTree } from "./document.js";
import {
	type DomBoundaryPoint,
	type DomRange,
	domRangeOwner,
} from "./dom-range.js";
import { AgentBrowserError } from "./errors.js";
import { isInertSubtree } from "./inertness.js";
import { documentStyles } from "./styles.js";

const inlineTags = new Set([
	"a",
	"abbr",
	"b",
	"br",
	"cite",
	"code",
	"em",
	"i",
	"mark",
	"q",
	"s",
	"small",
	"span",
	"strike",
	"strong",
	"sub",
	"sup",
	"u",
]);

export const editableBlockMergeCapabilities = Object.freeze({
	partial: true,
	blocks: "immediately-adjacent-direct-p-div-siblings",
	survivor: "left-block",
	placeholder: "sole-unattributed-br-in-otherwise-empty-inline-content",
	maxNodes: 4096,
	maxDepth: 256,
	composition: false,
	geometry: false,
});

export type EditableBlockMergePlan =
	| { readonly kind: "edge" }
	| { readonly kind: "merge"; apply(range: DomRange): void };

interface Token {
	node: number;
	start: DomBoundaryPoint;
	end: DomBoundaryPoint;
}

function unsupported(): never {
	throw new AgentBrowserError(
		"unsupported",
		"Paragraph merging requires adjacent editable p/div siblings with safe inline content",
	);
}

function scope(tree: DocumentTree, host: number, point: DomBoundaryPoint) {
	let node = tree.get(point.node);
	while (true) {
		const state = contentEditableState(node);
		if (state === "false") unsupported();
		if (state === "true" || state === "plaintext-only")
			return { id: node.id, plaintext: state === "plaintext-only" };
		if (node.id === host || node.parent === null) unsupported();
		node = tree.get(node.parent);
	}
}

function inspect(tree: DocumentTree, block: number) {
	const root = tree.get(block);
	let supported =
		root.kind === "element" && ["p", "div"].includes(root.tagName);
	const tokens: Token[] = [];
	let count = 0;
	for (const { node, depth } of tree.walk(block)) {
		if (
			++count > editableBlockMergeCapabilities.maxNodes ||
			depth > editableBlockMergeCapabilities.maxDepth
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Paragraph merge scan limit exceeded",
			);
		if (node.kind === "text") {
			if (node.data.length)
				tokens.push({
					node: node.id,
					start: { node: node.id, offset: 0 },
					end: { node: node.id, offset: node.data.length },
				});
			continue;
		}
		const safe =
			node.kind === "element" &&
			(node.id === block || inlineTags.has(node.tagName)) &&
			contentEditableState(node) === "inherit" &&
			!isInertSubtree(tree, node.id) &&
			!Object.hasOwn(node.attributes, "hidden") &&
			documentStyles(tree).get(node.id).visible;
		if (!safe) supported = false;
		if (node.id === block || (safe && node.tagName !== "br")) continue;
		const parent = node.parent as number;
		const offset = tree.get(parent).children.indexOf(node.id);
		tokens.push({
			node: node.id,
			start: { node: parent, offset },
			end: { node: parent, offset: offset + 1 },
		});
	}
	const only = tokens.length === 1 ? tree.get(tokens[0].node) : undefined;
	const placeholder =
		supported && only?.tagName === "br" && !Object.keys(only.attributes).length
			? only.id
			: undefined;
	return { supported, tokens, placeholder, count };
}

function endpoint(tree: DocumentTree, block: number): DomBoundaryPoint {
	let node = tree.get(block);
	while (node.kind !== "text" && node.children.length) {
		const last = tree.get(node.children[node.children.length - 1]);
		if (last.tagName === "br")
			return { node: node.id, offset: node.children.length };
		node = last;
	}
	return {
		node: node.id,
		offset: node.kind === "text" ? node.data.length : node.children.length,
	};
}

export function planEditableBlockMerge(
	tree: DocumentTree,
	host: number,
	range: DomRange,
	backward: boolean,
	focused: number,
): EditableBlockMergePlan | undefined {
	if (!range.collapsed) return undefined;
	const owner = domRangeOwner(tree);
	if (!owner.contains(host, range.start.node)) unsupported();
	const editing = scope(tree, host, range.start);
	let current = tree.get(range.start.node);
	while (
		current.id !== editing.id &&
		(current.kind === "text" || inlineTags.has(current.tagName))
	) {
		if (current.parent === null) unsupported();
		current = tree.get(current.parent);
	}
	const view = inspect(tree, current.id);
	const atBoundary = view.tokens.every(
		(token) =>
			token.node === view.placeholder ||
			(backward
				? owner.compare(range.start, token.start) <= 0
				: owner.compare(range.start, token.end) >= 0),
	);
	if (!atBoundary) return undefined;
	if (current.id === editing.id) return { kind: "edge" };
	if (editing.plaintext || current.parent !== editing.id || !view.supported)
		unsupported();
	const siblings = tree.get(editing.id).children;
	const adjacent = siblings[siblings.indexOf(current.id) + (backward ? -1 : 1)];
	if (adjacent === undefined) return { kind: "edge" };
	const left = backward ? tree.get(adjacent) : current;
	const right = backward ? current : tree.get(adjacent);
	const check = (): [
		ReturnType<typeof inspect>,
		ReturnType<typeof inspect>,
	] => {
		const children = tree.get(editing.id).children;
		if (
			tree.get(left.id).parent !== editing.id ||
			tree.get(right.id).parent !== editing.id ||
			children[children.indexOf(left.id) + 1] !== right.id ||
			owner.contains(right.id, focused)
		)
			unsupported();
		const first = inspect(tree, left.id);
		const second = inspect(tree, right.id);
		if (!first.supported || !second.supported) unsupported();
		if (first.count + second.count > editableBlockMergeCapabilities.maxNodes)
			throw new AgentBrowserError(
				"resource-limit",
				"Paragraph merge scan limit exceeded",
			);
		return [first, second];
	};
	check();
	return {
		kind: "merge",
		apply(selected) {
			const [first, second] = check();
			for (const placeholder of [first.placeholder, second.placeholder])
				if (placeholder !== undefined) tree.remove(placeholder);
			const join = endpoint(tree, left.id);
			for (const child of tree.get(right.id).children)
				tree.append(left.id, child);
			tree.remove(right.id);
			selected.setStart(join.node, join.offset);
			selected.collapse(true);
		},
	};
}
