import { type BlockWidth, resolveBlockWidth } from "./block-width.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import type { TextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import {
	type ReplacedSize,
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import { documentStyles } from "./styles.js";
import { generatedControlStyle } from "./generated-style.js";
import { describeControl, type SoftwareControl } from "./control-rendering.js";
import { summaryDetails } from "./details.js";
import type { DisclosureMarker } from "./disclosure-marker.js";
import { bitmapFont } from "./bitmap-font.js";
import {
	documentGeneratedControls,
	type GeneratedControlTarget,
} from "./generated-controls.js";
import { resolveBorders } from "./border-box.js";
import { isFlexDisplay, initialFlexStyle, type FlexStyle } from "./css-flex.js";
import type { AtomicInlineMetrics } from "./inline-atomic.js";
import {
	layoutFormattingAtomicInline,
	type AtomicInlineLayout,
	type AtomicInlineResolutionContext,
} from "./inline-atomic-layout.js";
import { isAtomicInline } from "./inline-atomic.js";

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
	position?: "relative" | "absolute" | "fixed";
	staticDisplay?: string;
	staticFlex?: FlexStyle;
	zIndex?: number;
	visible: boolean;
	text?: string;
	box?: BoxStyle;
	typography?: TextStyle;
	paint?: PaintStyle;
	contentMode?: "blocks" | "inline" | "flex";
	flex?: FlexStyle;
	flexItem?: boolean;
	orderModifiedChildren?: readonly number[];
	independentContext?: boolean;
	fragmentIndex?: number;
	fragmentCount?: number;
	deferredReason?: string;
	intrinsic?: Readonly<{ width: number; height: number }>;
	control?: SoftwareControl;
	marker?: DisclosureMarker;
	generated?: GeneratedControlTarget;
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
		const inFlow = (id: number) =>
			nodes[id].position !== "absolute" && nodes[id].position !== "fixed";
		if (!children.some((id) => inFlow(id) && nodes[id].level === "block")) {
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
			if (inFlow(child) && nodes[child].level === "block") {
				flush();
				normalized.push(child);
			} else run.push(child);
		}
		flush();
		nodes[parent].children = normalized;
		nodes[parent].contentMode = "blocks";
		for (const child of normalized) nodes[child].parent = parent;
	};
	const visit = (id: number, depth: number, flexItem = false): number[] => {
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
		if (flow.position === "sticky") issue("position-layout-not-supported");
		const outOfFlow =
			visibility.display !== "contents" &&
			(flow.position === "absolute" || flow.position === "fixed");
		if (outOfFlow) issue("positioned-layout-requires-coordination");
		if (outOfFlow) flexItem = false;
		if (flow.float !== "none") issue("float-layout-not-supported");
		if (flow.clear !== "none") issue("clear-layout-not-supported");
		if (flow["overflow-x"] !== "visible" || flow["overflow-y"] !== "visible")
			issue("overflow-layout-not-supported");
		const positionFields = {
			...(flow.position === "relative" || outOfFlow
				? { position: flow.position as "relative" | "absolute" | "fixed" }
				: {}),
			...(outOfFlow
				? {
						independentContext: true,
						staticDisplay: visibility.unpositionedDisplay,
						staticFlex: styles.flex(id),
					}
				: {}),
			...(flow["z-index"] !== "auto" &&
			(flow.position === "relative" || outOfFlow || flexItem)
				? { zIndex: Number(flow["z-index"]) }
				: {}),
		};
		const itemFields = {
			...positionFields,
			...(flexItem
				? { flexItem: true, flex: styles.flex(id), independentContext: true }
				: {}),
		};
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
		const children = (asItems = false) => {
			const result: number[] = [];
			const generated =
				node.tagName === "details"
					? documentGeneratedControls(tree).detailsSummary(id)
					: undefined;
			if (generated) {
				if (depth + 2 > limits.maxDepth)
					throw new AgentBrowserError(
						"resource-limit",
						"Generated summary formatting depth limit exceeded",
					);
				textCodeUnits += generated.label.length;
				if (textCodeUnits > limits.maxTextCodeUnits)
					throw new AgentBrowserError(
						"resource-limit",
						"Formatting text limit exceeded",
					);
				charge(generated.label.length);
				const generatedStyle = generatedControlStyle(tree, generated.ref);
				const typography = generatedStyle.text;
				const fontSize = Number.parseFloat(typography["font-size"]);
				const paint = generatedStyle.paint;
				const content: number[] = [];
				if (fontSize > 0)
					content.push(
						create({
							kind: "replaced",
							level: "inline",
							generated,
							visible: generatedStyle.visible,
							typography,
							paint,
							box: generatedStyle.box,
							marker: Object.freeze({
								type: generatedStyle.list["list-style-type"],
							}),
							intrinsic: Object.freeze({
								width: fontSize,
								height: (fontSize * bitmapFont.ascent) / bitmapFont.unitsPerEm,
							}),
						}),
					);
				content.push(
					create({
						kind: "text",
						level: "inline",
						generated,
						visible: generatedStyle.visible,
						text: generated.label,
						typography,
						paint,
					}),
				);
				result.push(
					create(
						{
							kind: "block",
							level: "block",
							generated,
							display: generatedStyle.display,
							visible: generatedStyle.visible,
							typography,
							paint,
							box: generatedStyle.box,
							contentMode: "inline",
							...(asItems
								? {
										flexItem: true,
										flex: initialFlexStyle,
										independentContext: true,
									}
								: {}),
						},
						content,
					),
				);
			}
			for (const child of node.children)
				append(result, visit(child, depth + 1, asItems));
			return result;
		};
		if (
			display === "contents" &&
			node.tagName !== "svg" &&
			node.tagName !== "math"
		)
			return children(flexItem);
		if (isFlexDisplay(display) && !deferredElements.has(node.tagName)) {
			issue("display-layout-not-supported");
			deferredSubtrees++;
			const result = create({
				kind: "deferred",
				level: display.startsWith("inline") ? "inline" : "block",
				ref,
				display,
				visible: visibility.visible,
				box: styles.box(id),
				typography: styles.text(id),
				paint: styles.paint(id),
				flex: styles.flex(id),
				flexItem,
				independentContext: true,
				contentMode: "flex",
				deferredReason: "display-layout-not-supported",
				...positionFields,
			});
			const items: number[] = [];
			let text: number[] = [];
			const flush = () => {
				if (!text.length) return;
				let content = false;
				for (const child of text) {
					const value = nodes[child].text ?? "";
					charge(value.length + 1);
					content ||= !/^[\t\n\f\r ]*$/.test(value);
				}
				if (content)
					items.push(
						create(
							{
								kind: "anonymous-block",
								level: "block",
								visible: visibility.visible,
								box: initialBoxStyle,
								typography: styles.text(id),
								paint: styles.paint(id),
								contentMode: "inline",
								flexItem: true,
								flex: initialFlexStyle,
								independentContext: true,
							},
							text,
						),
					);
				text = [];
			};
			for (const child of children(true)) {
				charge();
				if (nodes[child].kind === "text") text.push(child);
				else {
					flush();
					items.push(child);
				}
			}
			flush();
			nodes[result].children = items;
			for (const child of items) {
				charge();
				nodes[child].parent = result;
			}
			nodes[result].orderModifiedChildren = [...items].sort((first, second) => {
				charge();
				return (
					Number(nodes[first].flex?.order ?? 0) -
					Number(nodes[second].flex?.order ?? 0)
				);
			});
			return [result];
		}
		const markedSummary =
			display === "list-item" && summaryDetails(tree, node) !== undefined;
		const block =
			markedSummary ||
			["block", "block flow", "flow-root", "block flow-root"].includes(display);
		const inline = ["inline", "inline flow"].includes(display);
		const atomicBlock = ["inline-block", "inline flow-root"].includes(display);
		if (
			(block || atomicBlock) &&
			!deferredElements.has(node.tagName) &&
			styles.flex(id)["align-content"] !== "normal"
		)
			issue("block-content-alignment-not-supported");
		if (node.tagName === "br" && inline)
			return [
				create({
					kind: "break",
					...positionFields,
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
						...itemFields,
					}),
				];
		}
		if (
			deferredElements.has(node.tagName) ||
			(!block && !inline && !atomicBlock)
		) {
			if (
				block ||
				inline ||
				display === "inline-block" ||
				display === "inline flow-root"
			) {
				const typography = styles.text(id);
				const control = describeControl(
					tree,
					id,
					Number.parseFloat(typography["font-size"]),
				);
				if (control) {
					charge(control.text.length);
					textCodeUnits += control.text.length;
					if (textCodeUnits > limits.maxTextCodeUnits)
						throw new AgentBrowserError(
							"resource-limit",
							"Formatting text limit exceeded",
						);
					return [
						create({
							kind: "replaced",
							level: block ? "block" : "inline",
							ref,
							display,
							visible: visibility.visible,
							box: styles.box(id),
							paint: styles.paint(id),
							typography,
							control,
							intrinsic: Object.freeze({
								width: control.width,
								height: control.height,
							}),
							...itemFields,
						}),
					];
				}
			}
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
					...itemFields,
					...(flexItem ? { box: styles.box(id) } : {}),
				}),
			];
		}
		if (block || atomicBlock) {
			const result = create({
				kind: "block",
				level: atomicBlock ? "inline" : "block",
				ref,
				display,
				visible: visibility.visible,
				box: styles.box(id),
				paint: styles.paint(id),
				typography: styles.text(id),
				independentContext:
					atomicBlock || id === rootElement || display.includes("flow-root"),
				...itemFields,
			});
			const contents = children();
			if (markedSummary) {
				const list = styles.list(id);
				const typography = styles.text(id);
				const fontSize = Number.parseFloat(typography["font-size"]);
				if (list["list-style-type"] !== "none" && fontSize > 0) {
					if (
						list["list-style-position"] === "outside" &&
						contents.some((child) => nodes[child].level === "block")
					)
						throw new AgentBrowserError(
							"unsupported",
							"Outside disclosure markers with block content are not implemented",
						);
					contents.unshift(
						create({
							kind: "replaced",
							level: "inline",
							ref,
							visible: visibility.visible,
							typography,
							marker: Object.freeze({ type: list["list-style-type"] }),
							box: Object.freeze({
								...initialBoxStyle,
								"margin-left":
									list["list-style-position"] === "outside"
										? `${-fontSize}px`
										: "0px",
							}),
							paint: Object.freeze({
								...initialPaintStyle,
								color: styles.paint(id).color,
							}),
							intrinsic: Object.freeze({
								width: fontSize,
								height: (fontSize * bitmapFont.ascent) / bitmapFont.unitsPerEm,
							}),
						}),
					);
				}
			}
			normalizeChildren(result, contents);
			return [result];
		}
		const result: number[] = [];
		const fragments: number[] = [];
		let run: number[] = [];
		const flush = () => {
			const fragment = create(
				{
					kind: "inline",
					...positionFields,
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
			if (
				nodes[child].level === "block" &&
				nodes[child].position !== "absolute" &&
				nodes[child].position !== "fixed"
			) {
				flush();
				result.push(child);
			} else run.push(child);
		}
		flush();
		for (const fragment of fragments)
			nodes[fragment].fragmentCount = fragments.length;
		if (flow.position === "relative" && fragments.length > 1)
			issue("relative-block-in-inline-not-supported");
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
				Object.freeze({
					...node,
					children: Object.freeze(node.children),
					...(node.orderModifiedChildren
						? {
								orderModifiedChildren: Object.freeze(
									node.orderModifiedChildren,
								),
							}
						: {}),
				}),
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
	containingHeight: number | null;
	contentHeightOverride?: number;
	contentHeightDefinite?: boolean;
	intrinsicHeight?: boolean;
}

export interface DocumentBlockWidths {
	stage: "normal-flow-horizontal-only" | "isolated-block-horizontal-reflow";
	partial: true;
	formatting: FormattingTree;
	widths: readonly Readonly<FormattingBlockWidth>[];
	images: readonly Readonly<FormattingImageSize>[];
	atomics?: readonly Readonly<AtomicInlineMetrics>[];
	atomicLayouts?: readonly Readonly<AtomicInlineLayout>[];
	metrics: Readonly<{ work: number }>;
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
	return resolveFormattingPageWidths(formatting);
}

export function resolveFormattingPageWidths(
	formatting: FormattingTree,
	maxWork = formattingLimits.maxWork,
	onFlex?: (width: Readonly<FormattingBlockWidth>) => void,
	context: AtomicInlineResolutionContext = {},
): Readonly<DocumentBlockWidths> {
	const flexCount = onFlex
		? formatting.nodes.filter((node) => node.contentMode === "flex").length
		: 0;
	if (
		Object.entries(formatting.issues).some(
			([issue, count]) =>
				issue !== "display-layout-not-supported" ||
				!onFlex ||
				count !== flexCount,
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Document width resolution requires an issue-free supported formatting profile",
		);
	return resolveFormattingBlockWidths(
		formatting,
		[
			{
				id: formatting.root,
				containingBlock: formatting.root,
				containingWidth: formatting.viewport.width,
				containingHeight: formatting.viewport.height,
				contentX: 0,
			},
		],
		maxWork,
		false,
		onFlex,
		context,
	);
}

export interface BlockReflowRoot {
	id: number;
	containingBlock: number;
	containingWidth: number;
	containingHeight: number | null;
	contentX: number;
	usedWidth?: Readonly<BlockWidth>;
	contentHeightOverride?: number;
	contentHeightDefinite?: boolean;
	intrinsicHeight?: boolean;
}

export function resolveFormattingBlockWidths(
	formatting: FormattingTree,
	roots: readonly Readonly<BlockReflowRoot>[],
	maxWork = formattingLimits.maxWork,
	isolated = false,
	onFlex?: (width: Readonly<FormattingBlockWidth>) => void,
	context: AtomicInlineResolutionContext = {},
): Readonly<DocumentBlockWidths> {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > formattingLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid block reflow work limit",
		);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Block reflow work limit exceeded",
			);
	};
	const widths: Readonly<FormattingBlockWidth>[] = [];
	const images: Readonly<FormattingImageSize>[] = [];
	const atomicLayouts: Readonly<AtomicInlineLayout>[] = [];
	const pending: Readonly<BlockReflowRoot>[] = [...roots].reverse();
	while (pending.length) {
		charge();
		const frame = pending.pop();
		if (!frame) break;
		const node = formatting.nodes[frame.id];
		if (isAtomicInline(node) && node.id !== context.atomicRoot) {
			if (!onFlex)
				throw new AgentBrowserError(
					"unsupported",
					"Atomic inline content requires coordinated page layout",
				);
			if (work >= maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Atomic inline width work limit exceeded",
				);
			const layout = layoutFormattingAtomicInline(
				formatting,
				frame,
				maxWork - work,
				context,
			);
			charge(layout.metrics.work);
			atomicLayouts.push(layout);
			continue;
		}
		const flex =
			!!onFlex && node?.contentMode === "flex" && node.level === "block";
		if (!node || (node.kind === "deferred" && !flex))
			throw new AgentBrowserError(
				"unsupported",
				"Block reflow requires supported item content",
			);
		let containingWidth = frame.containingWidth;
		let containingHeight = frame.containingHeight;
		let contentX = frame.contentX;
		let containingBlock = frame.containingBlock;
		let replaced: Readonly<ReplacedSize> | undefined;
		const style = node.box ?? initialBoxStyle;
		let heightOverride = frame.contentHeightOverride;
		if (heightOverride !== undefined) {
			layoutNumber(heightOverride);
			const height = resolveHeightConstraints(
				style,
				containingWidth,
				containingHeight,
			);
			heightOverride = Math.max(
				height.minimum,
				Math.min(heightOverride, height.maximum ?? Number.POSITIVE_INFINITY),
			);
		}
		const contentReference = node.ref ?? node.generated?.ref;
		if (node.kind === "replaced" && node.intrinsic && contentReference) {
			const usedStyle = { ...style };
			if (frame.intrinsicHeight) {
				usedStyle.height = "auto";
				usedStyle["min-height"] = "0px";
				usedStyle["max-height"] = "none";
			}
			if (frame.usedWidth) {
				usedStyle.width = `${style["box-sizing"] === "border-box" ? frame.usedWidth.borderBoxWidth : frame.usedWidth.contentWidth}px`;
				usedStyle["min-width"] = "0px";
				usedStyle["max-width"] = "none";
			}
			if (heightOverride !== undefined) {
				const height = resolveHeightConstraints(
					style,
					containingWidth,
					containingHeight,
				);
				usedStyle.height = `${heightOverride + (style["box-sizing"] === "border-box" ? height.borderTop + height.borderBottom + height.paddingTop + height.paddingBottom : 0)}px`;
			}
			replaced = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				usedStyle,
				containingWidth,
				containingHeight,
				!node.control,
			);
			if (frame.usedWidth)
				replaced = Object.freeze({
					...replaced,
					marginLeft: frame.usedWidth.marginLeft,
					marginRight: frame.usedWidth.marginRight,
				});
			images.push(
				Object.freeze({
					...replaced,
					id: node.id,
					ref: contentReference,
					containingHeight,
					containingWidth,
				}),
			);
		}
		if (
			flex ||
			node.kind === "block" ||
			node.kind === "anonymous-block" ||
			(replaced && node.level === "block")
		) {
			const used =
				frame.usedWidth ??
				resolveBlockWidth(
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
			const borderX = layoutNumber(
				contentX + (frame.usedWidth ? 0 : used.marginLeft),
				true,
			);
			contentX = layoutNumber(
				borderX + used.borderLeft + used.paddingLeft,
				true,
			);
			widths.push(
				Object.freeze({
					...used,
					id: node.id,
					...(node.ref ? { ref: node.ref } : {}),
					containingBlock,
					borderX,
					contentX,
					containingHeight,
					...(frame.intrinsicHeight ? { intrinsicHeight: true } : {}),
					...(frame.contentHeightDefinite === false
						? { contentHeightDefinite: false }
						: {}),
					...(heightOverride === undefined
						? {}
						: { contentHeightOverride: heightOverride }),
				}),
			);
			if (node.kind !== "anonymous-block")
				containingHeight =
					frame.intrinsicHeight || frame.contentHeightDefinite === false
						? null
						: (heightOverride ??
							replaced?.contentHeight ??
							resolveHeightConstraints(style, containingWidth, containingHeight)
								.definite);
			containingWidth = used.contentWidth;
			containingBlock = node.id;
		}
		if (flex) {
			onFlex?.(widths[widths.length - 1]);
			continue;
		}
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({
				id: node.children[index],
				containingBlock,
				containingWidth,
				containingHeight,
				contentX,
			});
		}
	}
	return Object.freeze({
		stage: isolated
			? ("isolated-block-horizontal-reflow" as const)
			: ("normal-flow-horizontal-only" as const),
		partial: true as const,
		formatting,
		widths: Object.freeze(widths),
		images: Object.freeze(images),
		...(atomicLayouts.length
			? {
					atomicLayouts: Object.freeze(atomicLayouts),
					atomics: Object.freeze(atomicLayouts.map((layout) => layout.atomic)),
				}
			: {}),
		metrics: Object.freeze({ work }),
	});
}
