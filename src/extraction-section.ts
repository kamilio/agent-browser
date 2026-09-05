import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface HeadingSectionMetadata {
	method: "heading-section";
	heading: string;
	level: number;
	end: string | null;
	scannedNodes: number;
	selectedNodes: number;
	contextNodes: number;
}

export function selectHeadingSection(
	tree: DocumentTree,
	headingReference: string,
	options: {
		maxNodes: number;
		maxDepth: number;
		skip: (node: Readonly<DocumentNode>) => boolean;
		visible: (id: number) => boolean;
		descend: (node: Readonly<DocumentNode>) => boolean;
	},
): {
	included: Set<number>;
	context: Set<number>;
	children: Map<number, number[]>;
	metadata: HeadingSectionMetadata;
} {
	if (typeof headingReference !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid heading reference");
	if (!/^e[1-9][0-9]*$/.test(headingReference)) tree.resolve(headingReference);
	let heading: Readonly<DocumentNode>;
	try {
		heading = tree.get(Number(headingReference.slice(1)));
	} catch (error) {
		tree.resolve(headingReference);
		throw error;
	}
	const context = new Set<number>();
	let ancestor = heading;
	while (ancestor.id !== tree.root) {
		if (ancestor.parent === null)
			throw new AgentBrowserError(
				"invalid-input",
				"Heading section requires a connected heading",
			);
		if (context.size >= options.maxDepth || context.size >= options.maxNodes)
			throw new AgentBrowserError(
				"resource-limit",
				"Heading section ancestor limit exceeded",
			);
		ancestor = tree.get(ancestor.parent);
		context.add(ancestor.id);
	}
	tree.resolve(headingReference);
	if (heading.kind !== "element" || !/^h[1-6]$/.test(heading.tagName))
		throw new AgentBrowserError(
			"unsupported",
			"Heading section requires a native h1 through h6 element",
		);
	let skipped = options.skip(heading);
	for (const id of context) {
		const node = tree.get(id);
		skipped = options.skip(node) || !options.descend(node) || skipped;
	}
	if (skipped || !options.visible(heading.id))
		throw new AgentBrowserError(
			"not-actionable",
			"Heading section target is not visible or admitted",
		);
	const level = Number(heading.tagName.slice(1));
	const included = new Set(context);
	const pending = [{ node: tree.get(tree.root), childIndex: -1 }];
	let selected = false;
	let scannedNodes = 0;
	let selectedNodes = 0;
	let end: string | null = null;
	while (pending.length) {
		const current = pending[pending.length - 1];
		if (current.childIndex === -1) {
			if (
				++scannedNodes > options.maxNodes ||
				pending.length - 1 > options.maxDepth
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Heading section scan limit exceeded",
				);
			if (options.skip(current.node)) {
				pending.pop();
				continue;
			}
			if (current.node.id === heading.id) selected = true;
			else if (
				selected &&
				current.node.kind === "element" &&
				/^h[1-6]$/.test(current.node.tagName) &&
				Number(current.node.tagName.slice(1)) <= level &&
				options.visible(current.node.id)
			) {
				end = tree.reference(current.node.id);
				break;
			}
			if (selected) {
				included.add(current.node.id);
				selectedNodes++;
			}
			if (!options.descend(current.node)) {
				pending.pop();
				continue;
			}
			current.childIndex = 0;
		}
		if (current.childIndex === current.node.children.length) {
			pending.pop();
			continue;
		}
		const child = current.node.children[current.childIndex++];
		pending.push({ node: tree.get(child), childIndex: -1 });
	}
	if (!selected)
		throw new AgentBrowserError(
			"not-found",
			"Heading was not found in the admitted section traversal",
		);
	const children = new Map<number, number[]>();
	for (const id of included) {
		const parent = tree.get(id).parent;
		if (parent === null || !included.has(parent)) continue;
		const siblings = children.get(parent);
		if (siblings) siblings.push(id);
		else children.set(parent, [id]);
	}
	return {
		included,
		context,
		children,
		metadata: Object.freeze({
			method: "heading-section",
			heading: tree.reference(heading.id),
			level,
			end,
			scannedNodes,
			selectedNodes,
			contextNodes: context.size,
		}),
	};
}
