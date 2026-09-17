import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { selectorSyntaxLimits } from "./selectors.js";
import {
	type SourceHeadingMetadata,
	type SourceHeadingPolicy,
	documentHeading,
	validateSourceHeadingPolicy,
} from "./source-headings.js";

export interface HeadingTarget {
	ref: string;
	level: number;
	sourceHeading?: SourceHeadingMetadata;
	title: string;
	titleTruncated: boolean;
	selector: string | null;
	selectorUnavailable?: "unsupported-ancestor" | "selector-limit";
}

interface HeadingFrame {
	node: Readonly<DocumentNode>;
	childIndex: number;
	elementChildren: number;
	siblingPosition: number;
	segment: string | null;
	selectorLength: number;
	selectorComponents: number;
	selectorUnavailable?: HeadingTarget["selectorUnavailable"];
	heading: HeadingTarget | null;
}

export function collectHeadingTargets(
	tree: DocumentTree,
	options: {
		sourceHeadingPolicy?: SourceHeadingPolicy;
		maxNodes: number;
		maxDepth: number;
		maxEntries: number;
		maxTitleCodeUnits: number;
		maxSelectorCodeUnits: number;
		skip: (node: Readonly<DocumentNode>) => boolean;
		visible: (id: number) => boolean;
		descend: (node: Readonly<DocumentNode>) => boolean;
	},
): {
	entries: HeadingTarget[];
	scannedNodes: number;
	truncated: boolean;
} {
	const sourceHeadingPolicy = validateSourceHeadingPolicy(
		options.sourceHeadingPolicy,
	);
	const entries: HeadingTarget[] = [];
	const active: HeadingTarget[] = [];
	const pending: HeadingFrame[] = [
		{
			node: tree.get(tree.root),
			childIndex: -1,
			elementChildren: 0,
			siblingPosition: 1,
			segment: null,
			selectorLength: 0,
			selectorComponents: 0,
			heading: null,
		},
	];
	let scannedNodes = 0;
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
					"Heading discovery scan limit exceeded",
				);
			if (options.skip(node)) {
				pending.pop();
				continue;
			}
			if (
				node.kind !== "element" &&
				(pending.length !== 1 ||
					node.kind !== "document" ||
					node.parent !== null)
			)
				current.selectorUnavailable = "unsupported-ancestor";
			if (node.kind === "element") {
				const parent = pending[pending.length - 2]?.node;
				const documentChild =
					pending.length === 2 && parent?.kind === "document";
				if (
					!parent ||
					node.parent !== parent.id ||
					(!documentChild && parent.kind !== "element") ||
					node.tagName.length > 64 ||
					!/^[a-z][a-z0-9_-]*$/.test(node.tagName)
				) {
					current.selectorUnavailable = "unsupported-ancestor";
				} else if (!current.selectorUnavailable) {
					const position = String(current.siblingPosition);
					const anchorLength = documentChild
						? current.siblingPosition === 1
							? 5
							: 8
						: 0;
					const components =
						current.selectorComponents + (documentChild ? 3 : 2);
					const additional =
						node.tagName.length +
						12 +
						position.length +
						anchorLength +
						(current.selectorLength ? 3 : 0);
					if (
						components > selectorSyntaxLimits.maxComponents ||
						additional >
							Math.min(
								options.maxSelectorCodeUnits,
								selectorSyntaxLimits.maxSelectorCodeUnits,
							) -
								current.selectorLength
					) {
						current.selectorUnavailable = "selector-limit";
					} else {
						if (documentChild && current.siblingPosition === 1) {
							current.segment = `${node.tagName}:root:nth-child(${position})`;
						} else if (documentChild) {
							current.segment = `:root ~ ${node.tagName}:nth-child(${position})`;
						} else {
							current.segment = `${node.tagName}:nth-child(${position})`;
						}
						current.selectorLength += additional;
						current.selectorComponents = components;
					}
				}
				const interpretation = documentHeading(node, sourceHeadingPolicy);
				if (interpretation && options.visible(node.id)) {
					if (entries.length === options.maxEntries) {
						for (const heading of active) heading.titleTruncated = true;
						return { entries, scannedNodes, truncated: true };
					}
					const heading: HeadingTarget = {
						ref: tree.reference(node.id),
						...interpretation,
						title: "",
						titleTruncated: false,
						selector: null,
					};
					if (current.selectorUnavailable) {
						heading.selectorUnavailable = current.selectorUnavailable;
					} else {
						const segments: string[] = [];
						for (const ancestor of pending) {
							if (ancestor.segment !== null) segments.push(ancestor.segment);
						}
						heading.selector = segments.join(" > ");
					}
					entries.push(heading);
					active.push(heading);
					current.heading = heading;
				}
			} else if (
				node.kind === "text" &&
				active.length &&
				options.visible(node.id)
			) {
				for (const heading of active) {
					const remaining = options.maxTitleCodeUnits - heading.title.length;
					if (node.data.length > remaining) heading.titleTruncated = true;
					if (remaining > 0) heading.title += node.data.slice(0, remaining);
				}
			}
			if (!options.descend(node)) {
				if (current.heading) active.pop();
				pending.pop();
				continue;
			}
			current.childIndex = 0;
		}
		if (current.childIndex === node.children.length) {
			if (current.heading) active.pop();
			pending.pop();
			continue;
		}
		const child = tree.get(node.children[current.childIndex++]);
		if (child.kind === "element") current.elementChildren++;
		pending.push({
			node: child,
			childIndex: -1,
			elementChildren: 0,
			siblingPosition: current.elementChildren,
			segment: null,
			selectorLength: current.selectorLength,
			selectorComponents: current.selectorComponents,
			selectorUnavailable: current.selectorUnavailable,
			heading: null,
		});
	}
	return { entries, scannedNodes, truncated: false };
}
