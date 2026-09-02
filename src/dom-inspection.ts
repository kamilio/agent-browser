import type { DocumentNode, DocumentTree, NodeKind } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface DomInspectionOptions {
	root?: string;
	maxDepth?: number;
	maxNodes?: number;
	maxCodeUnits?: number;
}

export interface InspectedDomNode {
	ref: string;
	parent: string | null;
	depth: number;
	kind: NodeKind;
	name: string;
	nameTruncated: boolean;
	childCount: number;
	returnedChildren: number;
	childrenTruncated: boolean;
	attributes: { name: string; value: string; truncated: boolean }[];
	attributesTruncated: boolean;
	text?: string;
	textTruncated?: boolean;
	control?: {
		value?: string;
		valueTruncated?: boolean;
		checked?: boolean;
		selected?: boolean;
		indeterminate?: boolean;
	};
	protected?: boolean;
}

export interface DomInspection {
	partial: true;
	document: string;
	root: string;
	revision: number;
	nodes: InspectedDomNode[];
	truncated: boolean;
	limits: { maxDepth: number; maxNodes: number; maxCodeUnits: number };
	chargedCodeUnits: number;
}

export function inspectDom(
	tree: DocumentTree,
	options: DomInspectionOptions = {},
): DomInspection {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["root", "maxDepth", "maxNodes", "maxCodeUnits"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid DOM inspection options",
		);
	const limits = {
		maxDepth: options.maxDepth ?? 4,
		maxNodes: options.maxNodes ?? 256,
		maxCodeUnits: options.maxCodeUnits ?? 32_768,
	};
	for (const [key, minimum, maximum] of [
		["maxDepth", 0, 64],
		["maxNodes", 1, 2048],
		["maxCodeUnits", 1024, 262_144],
	] as const)
		if (
			!Number.isSafeInteger(limits[key]) ||
			limits[key] < minimum ||
			limits[key] > maximum
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid DOM inspection limit",
			);
	if (options.root !== undefined && typeof options.root !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid DOM inspection root");
	const root =
		options.root === undefined
			? tree.get(tree.root)
			: tree.resolve(options.root);
	const result: DomInspection = {
		partial: true,
		document: tree.reference(tree.root),
		root: tree.reference(root.id),
		revision: tree.revision,
		nodes: [],
		truncated: false,
		limits,
		chargedCodeUnits: 256,
	};
	const clip = (value: string, maximum: number) => {
		const text = value.slice(
			0,
			Math.max(
				0,
				Math.min(maximum, limits.maxCodeUnits - result.chargedCodeUnits),
			),
		);
		result.chargedCodeUnits += text.length;
		const truncated = text.length !== value.length;
		if (truncated) result.truncated = true;
		return { text, truncated };
	};
	const stack: {
		node: Readonly<DocumentNode>;
		depth: number;
		nextChild: number;
		entry: InspectedDomNode;
	}[] = [];
	const append = (node: Readonly<DocumentNode>, depth: number) => {
		if (
			result.nodes.length >= limits.maxNodes ||
			result.chargedCodeUnits + 512 > limits.maxCodeUnits
		)
			return false;
		result.chargedCodeUnits += 512;
		const protectedValue =
			node.tagName === "input" &&
			["password", "file"].includes(
				(node.attributes.type ?? "text").toLowerCase(),
			);
		const name = clip(node.tagName || `#${node.kind}`, 256);
		const entry: InspectedDomNode = {
			ref: tree.reference(node.id),
			parent: node.parent === null ? null : tree.reference(node.parent),
			depth,
			kind: node.kind,
			name: name.text,
			nameTruncated: name.truncated,
			childCount: node.children.length,
			returnedChildren: 0,
			childrenTruncated: false,
			attributes: [],
			attributesTruncated: false,
			...(protectedValue ? { protected: true } : {}),
		};
		const attributes = Object.keys(node.attributes);
		for (const key of attributes) {
			if (
				entry.attributes.length >= 64 ||
				result.chargedCodeUnits + 64 > limits.maxCodeUnits
			)
				break;
			result.chargedCodeUnits += 64;
			const attributeName = clip(key, 256);
			const value = clip(
				protectedValue && key === "value" ? "[redacted]" : node.attributes[key],
				2048,
			);
			entry.attributes.push({
				name: attributeName.text,
				value: value.text,
				truncated: attributeName.truncated || value.truncated,
			});
		}
		entry.attributesTruncated = attributes.length !== entry.attributes.length;
		if (entry.attributesTruncated) result.truncated = true;
		if (node.kind === "text" || node.kind === "comment") {
			const value = clip(node.data, 4096);
			entry.text = value.text;
			entry.textTruncated = value.truncated;
		}
		if (Object.keys(node.control).length) {
			entry.control = {};
			for (const key of ["checked", "selected", "indeterminate"] as const)
				if (node.control[key] !== undefined)
					entry.control[key] = node.control[key];
			if (node.control.value !== undefined) {
				const value = clip(
					protectedValue ? "[redacted]" : node.control.value,
					4096,
				);
				entry.control.value = value.text;
				entry.control.valueTruncated = value.truncated;
			}
		}
		result.nodes.push(entry);
		stack.push({ node, depth, nextChild: 0, entry });
		return true;
	};
	append(root, 0);
	while (stack.length) {
		const frame = stack[stack.length - 1];
		if (
			frame.depth >= limits.maxDepth ||
			frame.nextChild >= frame.node.children.length
		) {
			stack.pop();
			continue;
		}
		if (
			result.nodes.length >= limits.maxNodes ||
			result.chargedCodeUnits + 512 > limits.maxCodeUnits
		)
			break;
		const child = tree.get(frame.node.children[frame.nextChild++]);
		if (!append(child, frame.depth + 1)) break;
		frame.entry.returnedChildren++;
	}
	for (const node of result.nodes) {
		node.childrenTruncated = node.returnedChildren !== node.childCount;
		if (node.childrenTruncated) result.truncated = true;
	}
	return result;
}
