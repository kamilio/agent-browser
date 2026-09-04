import { contentEditableState } from "./content-editability.js";
import type { DocumentNode, DocumentTree } from "./document.js";
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

export const editableParagraphCapabilities = Object.freeze({
	partial: true,
	plaintext: "line-feed",
	richLineBreak: "br",
	richParagraph: "inline-div-host-or-direct-p-div-child",
	maxNodes: 4096,
	maxDepth: 256,
	paragraphMerging: false,
	placeholderBreaks: false,
});

export type EditableParagraphPlan =
	| { readonly inputType: "insertLineBreak"; readonly plaintext: true }
	| {
			readonly inputType: "insertLineBreak" | "insertParagraph";
			readonly plaintext: false;
			apply(range: DomRange): void;
	  };

function unsupported(): never {
	throw new AgentBrowserError(
		"unsupported",
		"Paragraph editing requires one simple editable scope and supported inline content",
	);
}

function limited(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function attributes(node: Readonly<DocumentNode>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(node.attributes).filter(
			([name]) => !["id", "name", "contenteditable"].includes(name),
		),
	);
}

function elementCost(tag: string, values: Record<string, string>): number {
	return Object.entries(values).reduce(
		(total, [name, value]) => total + name.length + value.length,
		tag.length,
	);
}

function depth(tree: DocumentTree, id: number): number {
	let count = 0;
	let parent = tree.get(id).parent;
	while (parent !== null) {
		if (++count > editableParagraphCapabilities.maxDepth)
			limited("Paragraph ancestor depth limit exceeded");
		parent = tree.get(parent).parent;
	}
	return count;
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

export function planEditableParagraph(
	tree: DocumentTree,
	host: number,
	range: DomRange,
	lineBreak: boolean,
): EditableParagraphPlan {
	const owner = domRangeOwner(tree);
	if (!owner.contains(host, range.start.node)) unsupported();
	const editing = scope(tree, host, range.start);
	if (
		!owner.contains(editing.id, range.end.node) ||
		scope(tree, host, range.end).id !== editing.id
	)
		unsupported();
	let root = tree.get(range.start.node);
	while (
		root.id !== editing.id &&
		(editing.plaintext || !["p", "div"].includes(root.tagName))
	) {
		if (root.parent === null) unsupported();
		root = tree.get(root.parent);
	}
	if (!owner.contains(root.id, range.end.node)) unsupported();
	if (
		!editing.plaintext &&
		root.id !== editing.id &&
		root.parent !== editing.id
	)
		unsupported();
	const convert = root.id === editing.id;
	if (!editing.plaintext && !lineBreak && convert && root.tagName !== "div")
		unsupported();
	if (!editing.plaintext && !["div", "p", ...inlineTags].includes(root.tagName))
		unsupported();
	const full = !editing.plaintext && !lineBreak;
	let nodes = 0;
	const rootDepth = depth(tree, root.id);
	let deepest = rootDepth;
	for (const entry of tree.walk(root.id)) {
		if (++nodes > editableParagraphCapabilities.maxNodes)
			limited("Paragraph subtree node limit exceeded");
		if (entry.depth > editableParagraphCapabilities.maxDepth)
			limited("Paragraph subtree depth limit exceeded");
		deepest = Math.max(deepest, rootDepth + entry.depth);
		const node = entry.node;
		if (node.id === root.id) continue;
		if (
			!full &&
			!owner.contains(node.id, range.start.node) &&
			!owner.contains(node.id, range.end.node) &&
			!range.intersectsNode(node.id)
		)
			continue;
		if (node.kind === "text") continue;
		if (
			node.kind !== "element" ||
			!inlineTags.has(node.tagName) ||
			contentEditableState(node) !== "inherit" ||
			isInertSubtree(tree, node.id) ||
			Object.hasOwn(node.attributes, "hidden") ||
			!documentStyles(tree).get(node.id).visible
		)
			unsupported();
	}
	if (editing.plaintext)
		return {
			inputType: "insertLineBreak",
			plaintext: true,
		};
	const startNode = tree.get(range.start.node);
	const container =
		startNode.kind === "text" ? (startNode.parent as number) : startNode.id;
	const path: Readonly<DocumentNode>[] = [];
	let ancestor = tree.get(container);
	while (ancestor.id !== root.id) {
		path.push(ancestor);
		ancestor = tree.get(ancestor.parent as number);
	}
	const splitText =
		startNode.kind === "text" &&
		range.start.offset > 0 &&
		range.end.node === startNode.id &&
		range.end.offset < startNode.data.length;
	const copies = lineBreak ? [] : path;
	const rootTag = convert ? "div" : root.tagName;
	const rootAttributes = convert ? {} : attributes(root);
	const extraNodes =
		(lineBreak ? 1 : copies.length + (convert ? 2 : 1)) + (splitText ? 1 : 0);
	const extraText = lineBreak
		? 2
		: copies.reduce(
				(total, node) => total + elementCost(node.tagName, attributes(node)),
				elementCost(rootTag, rootAttributes) + (convert ? 3 : 0),
			);
	const requiredDepth = lineBreak
		? depth(tree, container) + 1
		: Math.max(rootDepth + (convert ? 1 : 0), deepest + (convert ? 1 : 0));
	const checkBudget = () => {
		const usage = tree.resourceUsage();
		if (usage.nodes + extraNodes > tree.limits.maxNodes)
			limited("Paragraph node limit exceeded");
		if (usage.textCodeUnits + extraText > tree.limits.maxTextCodeUnits)
			limited("Paragraph metadata text limit exceeded");
		if (requiredDepth > tree.limits.maxDepth)
			limited("Paragraph insertion depth limit exceeded");
	};
	checkBudget();
	return {
		inputType: lineBreak ? "insertLineBreak" : "insertParagraph",
		plaintext: false,
		apply(selected) {
			checkBudget();
			const start = selected.start;
			const end = selected.end;
			const caret = selected.cloneRange();
			caret.collapse(true);
			const right = tree.createElement(
				lineBreak ? "br" : rootTag,
				lineBreak ? {} : rootAttributes,
			);
			const left =
				!lineBreak && convert ? tree.createElement("div") : undefined;
			const cloned = new Map<number, number>([[root.id, right]]);
			for (const node of copies)
				cloned.set(node.id, tree.createElement(node.tagName, attributes(node)));
			const suffix = splitText
				? owner.splitText(start.node, end.offset)
				: undefined;
			if (start.node === end.node && startNode.kind === "text")
				owner.replaceText(
					start.node,
					start.offset,
					end.offset - start.offset,
					"",
				);
			else selected.deleteContents();
			const point = caret.start;
			const node = tree.get(point.node);
			let parent = node.id;
			let offset = point.offset;
			let following: number | undefined;
			if (node.kind === "text") {
				parent = node.parent as number;
				const index = tree.get(parent).children.indexOf(node.id);
				if (point.offset === 0) {
					offset = index;
					following = node.id;
				} else {
					following = suffix;
					offset = index + 1;
				}
			}
			let destination: DomBoundaryPoint;
			if (lineBreak) {
				tree.insert(parent, right, tree.get(parent).children[offset]);
				destination =
					following === undefined
						? { node: parent, offset: offset + 1 }
						: { node: following, offset: 0 };
			} else {
				destination = {
					node: following ?? (cloned.get(parent) as number),
					offset: 0,
				};
				while (true) {
					const target = cloned.get(parent) as number;
					for (const child of tree.get(parent).children.slice(offset))
						tree.append(target, child);
					if (parent === root.id) break;
					const outer = tree.get(parent).parent as number;
					offset = tree.get(outer).children.indexOf(parent) + 1;
					tree.append(cloned.get(outer) as number, target);
					parent = outer;
				}
				if (left !== undefined) {
					for (const child of tree.get(root.id).children)
						tree.append(left, child);
					tree.append(root.id, left);
					tree.append(root.id, right);
				} else {
					const outer = root.parent as number;
					const siblings = tree.get(outer).children;
					tree.insert(outer, right, siblings[siblings.indexOf(root.id) + 1]);
				}
			}
			selected.setStart(destination.node, destination.offset);
			selected.collapse(true);
		},
	};
}
