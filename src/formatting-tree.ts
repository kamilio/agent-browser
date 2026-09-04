import { type BlockWidth, resolveBlockWidth } from "./block-width.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import type { PaintStyle } from "./css-paint.js";
import type { TextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import {
	type ReplacedSize,
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import { AgentBrowserError } from "./errors.js";
import { resolveBorders } from "./border-box.js";
import { layoutNumber } from "./layout-values.js";
import { documentStyles } from "./styles.js";

export interface FormattingLimits {
	maxOwnedNodes: number;
	maxBoxes: number;
	maxDepth: number;
	maxTextCodeUnits: number;
	maxWork: number;
}
export const formattingLimits: Readonly<FormattingLimits> = Object.freeze({
	maxOwnedNodes: 50_000,
	maxBoxes: 50_000,
	maxDepth: 256,
	maxTextCodeUnits: 1_000_000,
	maxWork: 2_000_000,
});

export interface FormattingNode {
	id: number;
	parent: number | null;
	kind:
		| "viewport"
		| "block"
		| "anonymous-block"
		| "inline"
		| "text"
		| "break"
		| "replaced"
		| "deferred";
	level: "block" | "inline";
	children: readonly number[];
	ref?: string;
	display?: string;
	visible: boolean;
	text?: string;
	box?: BoxStyle;
	typography?: TextStyle;
	paint?: PaintStyle;
	contentMode?: "blocks" | "inline";
	independentContext?: boolean;
	fragmentIndex?: number;
	fragmentCount?: number;
	deferredReason?: string;
	intrinsic?: Readonly<{ width: number; height: number }>;
}
interface MutableFormattingNode extends Omit<FormattingNode, "children"> {
	children: number[];
}
export interface FormattingTree {
	stage: "display-decomposition";
	partial: true;
	revision: number;
	root: number;
	viewport: Readonly<{ width: number; height: number }>;
	nodes: readonly Readonly<FormattingNode>[];
	issues: Readonly<Record<string, number>>;
	metrics: Readonly<{
		visitedDomNodes: number;
		boxes: number;
		textCodeUnits: number;
		work: number;
		deferredSubtrees: number;
	}>;
}

const unusualContents = new Set([
	"br",
	"wbr",
	"meter",
	"progress",
	"canvas",
	"embed",
	"object",
	"audio",
	"iframe",
	"img",
	"video",
	"frame",
	"frameset",
	"input",
	"textarea",
	"select",
]);
const deferredElements = new Set([
	...unusualContents,
	"button",
	"fieldset",
	"legend",
	"details",
	"summary",
	"dialog",
	"noscript",
	"svg",
	"math",
	"center",
]);
const rootDisplays: Readonly<Record<string, string>> = Object.freeze({
	inline: "block",
	contents: "block",
	"inline flow": "block",
	"inline-block": "flow-root",
	"inline flow-root": "flow-root",
	"inline-flex": "flex",
	"inline flex": "flex",
	"inline-grid": "grid",
	"inline grid": "grid",
	"inline-table": "table",
	"inline table": "table",
});

function limitsFor(
	options: Partial<FormattingLimits>,
): Readonly<FormattingLimits> {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError("invalid-input", "Invalid formatting limits");
	for (const [key, value] of Object.entries(options))
		if (
			!Object.hasOwn(formattingLimits, key) ||
			!Number.isSafeInteger(value) ||
			value < 1 ||
			value > formattingLimits[key as keyof FormattingLimits]
		)
			throw new AgentBrowserError("invalid-input", "Invalid formatting limit");
	return { ...formattingLimits, ...options };
}

export function buildFormattingTree(
	tree: DocumentTree,
	options: Partial<FormattingLimits> = {},
): FormattingTree {
	const limits = limitsFor(options);
	tree.get(tree.root);
	if (tree.nodeCount > limits.maxOwnedNodes)
		throw new AgentBrowserError(
			"resource-limit",
			"Formatting owned-node limit exceeded",
		);
	const styles = documentStyles(tree);
	const styleMetrics = styles.metrics();
	const issues: Record<string, number> = Object.create(null);
	for (const [code, count] of Object.entries(styleMetrics.issues))
		issues[`css:${code}`] = count;
	const issue = (code: string) => {
		issues[code] = (issues[code] ?? 0) + 1;
	};
	const nodes: MutableFormattingNode[] = [];
	let work = 0;
	let textCodeUnits = 0;
	let visitedDomNodes = 0;
	let deferredSubtrees = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Formatting work limit exceeded",
			);
	};
	const create = (
		data: Omit<MutableFormattingNode, "id" | "parent" | "children">,
		children: readonly number[] = [],
	) => {
		charge(children.length + 1);
		if (nodes.length >= limits.maxBoxes)
			throw new AgentBrowserError(
				"resource-limit",
				"Formatting box limit exceeded",
			);
		const node: MutableFormattingNode = {
			...data,
			id: nodes.length,
			parent: null,
			children: [...children],
		};
		nodes.push(node);
		for (const child of children) nodes[child].parent = node.id;
		return node.id;
	};
	const root = create({
		kind: "viewport",
		level: "block",
		visible: true,
		independentContext: true,
		typography: styles.text(tree.root),
	});
	const rootChildren = tree.get(tree.root).children;
	charge(rootChildren.length);
	const topElements = rootChildren.filter(
		(id) => tree.get(id).kind === "element",
	);
	if (topElements.length > 1) issue("multiple-document-elements");
	if (topElements.length === 0) issue("missing-document-element");
	const rootElement = topElements[0];
	const append = (destination: number[], source: readonly number[]) => {
		charge(source.length);
		for (const child of source) destination.push(child);
	};
	const normalizeChildren = (parent: number, children: number[]) => {
		charge(children.length);
		if (!children.some((id) => nodes[id].level === "block")) {
			nodes[parent].children = children;
			nodes[parent].contentMode = "inline";
			for (const child of children) nodes[child].parent = parent;
			return;
		}
		const normalized: number[] = [];
		let run: number[] = [];
		const flush = () => {
			if (!run.length) return;
			normalized.push(
				create(
					{
						kind: "anonymous-block",
						level: "block",
						visible: nodes[parent].visible,
						contentMode: "inline",
						box: initialBoxStyle,
						typography: nodes[parent].typography,
					},
					run,
				),
			);
			run = [];
		};
		for (const child of children) {
			charge();
			if (nodes[child].level === "block") {
				flush();
				normalized.push(child);
			} else run.push(child);
		}
		flush();
		nodes[parent].children = normalized;
		nodes[parent].contentMode = "blocks";
		for (const child of normalized) nodes[child].parent = parent;
	};
	const visit = (id: number, depth: number): number[] => {
		charge();
		if (depth > limits.maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Formatting depth limit exceeded",
			);
		visitedDomNodes++;
		const node = tree.get(id);
		if (node.kind === "comment") return [];
		const visibility = styles.get(id);
		if (!visibility.displayed) return [];
		if (node.kind === "text") {
			if (!node.data) return [];
			textCodeUnits += node.data.length;
			if (textCodeUnits > limits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Formatting text limit exceeded",
				);
			charge(node.data.length);
			return [
				create({
					kind: "text",
					level: "inline",
					ref: tree.reference(id),
					visible: visibility.visible,
					text: node.data,
					typography: styles.text(id),
					paint: styles.paint(id),
				}),
			];
		}
		if (node.kind !== "element") return [];
		const ref = tree.reference(id);
		const flow = styles.flow(id);
		if (flow.position !== "static") issue("position-layout-not-supported");
		if (flow.float !== "none") issue("float-layout-not-supported");
		if (flow.clear !== "none") issue("clear-layout-not-supported");
		if (flow["overflow-x"] !== "visible" || flow["overflow-y"] !== "visible")
			issue("overflow-layout-not-supported");
		if (
			node.attributes.dir !== undefined &&
			node.attributes.dir.toLowerCase() !== "ltr"
		)
			issue("html-direction-not-supported");
		if (
			[
				"align",
				"valign",
				"width",
				"height",
				"hspace",
				"vspace",
				"border",
				"nowrap",
			].some(
				(name) =>
					Object.hasOwn(node.attributes, name) &&
					!(node.tagName === "img" && (name === "width" || name === "height")),
			)
		)
			issue("html-presentation-hint-not-supported");
		const display =
			id === rootElement
				? (rootDisplays[visibility.display] ?? visibility.display)
				: visibility.display;
		if (display === "contents" && unusualContents.has(node.tagName)) return [];
		const children = () => {
			const result: number[] = [];
			for (const child of node.children)
				append(result, visit(child, depth + 1));
			return result;
		};
		if (
			display === "contents" &&
			node.tagName !== "svg" &&
			node.tagName !== "math"
		)
			return children();
		const block = [
			"block",
			"block flow",
			"flow-root",
			"block flow-root",
		].includes(display);
		const inline = ["inline", "inline flow"].includes(display);
		if (node.tagName === "br" && inline)
			return [
				create({
					kind: "break",
					paint: styles.paint(id),
					typography: styles.text(id),
					level: "inline",
					ref,
					display,
					visible: visibility.visible,
				}),
			];
		if (
			node.tagName === "img" &&
			(block ||
				inline ||
				display === "inline-block" ||
				display === "inline flow-root")
		) {
			const decoded = documentImages(tree).decoded(id);
			if (decoded)
				return [
					create({
						kind: "replaced",
						level: block ? "block" : "inline",
						ref,
						display,
						visible: visibility.visible,
						box: styles.box(id),
						paint: styles.paint(id),
						typography: styles.text(id),
						intrinsic: Object.freeze({
							width: decoded.image.width,
							height: decoded.image.height,
						}),
					}),
				];
		}
		if (deferredElements.has(node.tagName) || (!block && !inline)) {
			const reason = deferredElements.has(node.tagName)
				? "element-layout-not-supported"
				: "display-layout-not-supported";
			issue(reason);
			deferredSubtrees++;
			return [
				create({
					kind: "deferred",
					level:
						display.startsWith("inline") || display === "contents"
							? "inline"
							: "block",
					ref,
					display,
					visible: visibility.visible,
					deferredReason: reason,
				}),
			];
		}
		if (block) {
			const result = create({
				kind: "block",
				level: "block",
				ref,
				display,
				visible: visibility.visible,
				box: styles.box(id),
				paint: styles.paint(id),
				typography: styles.text(id),
				independentContext: id === rootElement || display.includes("flow-root"),
			});
			normalizeChildren(result, children());
			return [result];
		}
		const result: number[] = [];
		const fragments: number[] = [];
		let run: number[] = [];
		const flush = () => {
			const fragment = create(
				{
					kind: "inline",
					paint: styles.paint(id),
					typography: styles.text(id),
					box: styles.box(id),
					level: "inline",
					ref,
					display,
					visible: visibility.visible,
					fragmentIndex: fragments.length,
				},
				run,
			);
			result.push(fragment);
			fragments.push(fragment);
			run = [];
		};
		for (const child of children()) {
			charge();
			if (nodes[child].level === "block") {
				flush();
				result.push(child);
			} else run.push(child);
		}
		flush();
		for (const fragment of fragments)
			nodes[fragment].fragmentCount = fragments.length;
		return result;
	};
	const children: number[] = [];
	for (const child of rootChildren) append(children, visit(child, 1));
	normalizeChildren(root, children);
	charge(nodes.length);
	return Object.freeze({
		stage: "display-decomposition",
		partial: true,
		revision: tree.revision,
		root,
		viewport: Object.freeze({ ...styles.viewport }),
		nodes: Object.freeze(
			nodes.map((node) =>
				Object.freeze({ ...node, children: Object.freeze(node.children) }),
			),
		),
		issues: Object.freeze(issues),
		metrics: Object.freeze({
			visitedDomNodes,
			boxes: nodes.length,
			textCodeUnits,
			work,
			deferredSubtrees,
		}),
	});
}

export interface FormattingBlockWidth extends BlockWidth {
	id: number;
	ref?: string;
	containingBlock: number;
	borderX: number;
	contentX: number;
}

export interface DocumentBlockWidths {
	stage: "normal-flow-horizontal-only";
	partial: true;
	formatting: FormattingTree;
	widths: readonly Readonly<FormattingBlockWidth>[];
	images: readonly Readonly<FormattingImageSize>[];
}

export interface FormattingImageSize extends ReplacedSize {
	id: number;
	ref: string;
	containingHeight: number | null;
	containingWidth: number;
}

export function resolveDocumentBlockWidths(
	tree: DocumentTree,
	options: Partial<FormattingLimits> = {},
): Readonly<DocumentBlockWidths> {
	const formatting = buildFormattingTree(tree, options);
	if (Object.keys(formatting.issues).length)
		throw new AgentBrowserError(
			"unsupported",
			"Document width resolution requires an issue-free supported formatting profile",
		);
	const widths: Readonly<FormattingBlockWidth>[] = [];
	const images: Readonly<FormattingImageSize>[] = [];
	const pending = [
		{
			id: formatting.root,
			containingBlock: formatting.root,
			containingWidth: formatting.viewport.width,
			containingHeight: formatting.viewport.height as number | null,
			contentX: 0,
		},
	];
	while (pending.length) {
		const frame = pending.pop();
		if (!frame) break;
		const node = formatting.nodes[frame.id];
		let containingWidth = frame.containingWidth;
		let containingHeight = frame.containingHeight;
		let contentX = frame.contentX;
		let containingBlock = frame.containingBlock;
		let replaced: Readonly<ReplacedSize> | undefined;
		const style = node.box ?? initialBoxStyle;
		if (node.kind === "replaced" && node.intrinsic && node.ref) {
			replaced = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				style,
				containingWidth,
				containingHeight,
			);
			images.push(
				Object.freeze({
					...replaced,
					id: node.id,
					ref: node.ref,
					containingHeight,
					containingWidth,
				}),
			);
		}
		if (
			node.kind === "block" ||
			node.kind === "anonymous-block" ||
			(replaced && node.level === "block")
		) {
			const used = resolveBlockWidth(
				replaced
					? {
							...style,
							width: `${style["box-sizing"] === "border-box" ? replaced.borderBoxWidth : replaced.contentWidth}px`,
							"min-width": "0px",
							"max-width": "none",
						}
					: style,
				containingWidth,
				resolveBorders(style),
			);
			const borderX = layoutNumber(contentX + used.marginLeft, true);
			contentX = layoutNumber(contentX + used.contentOffset, true);
			widths.push(
				Object.freeze({
					...used,
					id: node.id,
					...(node.ref ? { ref: node.ref } : {}),
					containingBlock,
					borderX,
					contentX,
				}),
			);
			if (node.kind !== "anonymous-block")
				containingHeight =
					replaced?.contentHeight ??
					resolveHeightConstraints(style, containingWidth, containingHeight)
						.definite;
			containingWidth = used.contentWidth;
			containingBlock = node.id;
		}
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push({
				id: node.children[index],
				containingBlock,
				containingWidth,
				containingHeight,
				contentX,
			});
	}
	return Object.freeze({
		stage: "normal-flow-horizontal-only" as const,
		partial: true as const,
		formatting,
		widths: Object.freeze(widths),
		images: Object.freeze(images),
	});
}
