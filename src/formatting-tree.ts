import { type BlockWidth, resolveBlockWidth } from "./block-width.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { initialTableStyle, type TableStyle } from "./css-table.js";
import {
	applyCollapsedTableBorders,
	type CollapsedTableFormatting,
} from "./table-collapsed-formatting.js";
import { measureValidatedIntrinsicRoot } from "./intrinsic-widths.js";
import { buttonFitContentStyle, buttonUsedDisplay } from "./button-layout.js";
import {
	captionedTableStyle,
	resolveCaptionedTableWidth,
	tableWrapperStyle,
} from "./table-caption.js";
import {
	fieldsetContentStyle,
	fieldsetIntrinsicPadding,
	fieldsetOuterStyle,
	fieldsetPaddingStyle,
	resolveFieldsetMinimum,
} from "./fieldset-layout.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import type { TextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { supportsBackgroundColorHint } from "./html-background-color.js";
import { supportsCellPaddingHint } from "./html-cell-padding.js";
import {
	elementNamespace,
	isHtmlElement,
	svgNamespace,
	xmlNamespace,
} from "./dom-namespaces.js";
import { documentSvgScene } from "./svg-scene.js";
import { svgIntrinsicSize } from "./svg-projection.js";
import type { SvgScene } from "./svg-scene-types.js";
import { documentImages } from "./document-images.js";
import { imageIntrinsicSize } from "./image-decoder.js";
import {
	brokenImageAlternative,
	emptyImageAlternative,
} from "./image-fallback.js";
import { documentMode } from "./document-mode.js";
import {
	describeImageAlternative,
	type ImageAlternative,
} from "./image-alternative.js";
import { supportsImageBorderHint } from "./html-image-border.js";
import {
	htmlTextAlignment,
	supportsTextAlignmentHint,
} from "./html-alignment.js";
import {
	type ReplacedSize,
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import { AgentBrowserError } from "./errors.js";
import {
	resolveBlockContentAlignment,
	type BlockContentAlignment,
} from "./block-content-alignment.js";
import { layoutNumber } from "./layout-values.js";
import { documentStyles } from "./styles.js";
import { generatedControlStyle } from "./generated-style.js";
import type { GeneratedContentStyle } from "./generated-content-style.js";
import { firstDetailsSummary } from "./details.js";
import {
	describeButtonAppearance,
	describeControl,
	type SoftwareControl,
} from "./control-rendering.js";
import {
	type DisclosureMarker,
	disclosureMarkerExtent,
	disclosureMarkerText,
} from "./disclosure-marker.js";
import { markerTypes } from "./css-list.js";
import { resolveListOrdinals } from "./list-ordinals.js";
import { bitmapFont } from "./bitmap-font.js";
import {
	documentGeneratedControls,
	type GeneratedControlTarget,
} from "./generated-controls.js";
import { borderCapabilities, resolveBorders } from "./border-box.js";
import {
	blockifyDisplay,
	isFlexDisplay,
	initialFlexStyle,
	type FlexStyle,
} from "./css-flex.js";
import { isGridDisplay, initialGridStyle, type GridStyle } from "./css-grid.js";
import type { AtomicInlineMetrics } from "./inline-atomic.js";
import {
	layoutFormattingAtomicInline,
	type AtomicInlineLayout,
	type AtomicInlineResolutionContext,
} from "./inline-atomic-layout.js";
import { isAtomicInline } from "./inline-atomic.js";
import type { FloatBoxLayout } from "./float-document.js";

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
	floatSide?: "left" | "right" | "inline-start" | "inline-end";
	clear?: "left" | "right" | "both" | "inline-start" | "inline-end";
	staticDisplay?: string;
	staticFlex?: FlexStyle;
	zIndex?: number;
	visible: boolean;
	text?: string;
	box?: BoxStyle;
	typography?: TextStyle;
	language?: string;
	legacyChildAlignment?: "center";
	legacyAlignmentBoundary?: true;
	paint?: PaintStyle;
	contentMode?: "blocks" | "inline" | "flex" | "grid" | "table";
	table?: TableStyle;
	collapsedBorderOwner?: number;
	collapsedTable?: CollapsedTableFormatting;
	tableSpan?: Readonly<{ columns: number; rows: number }>;
	flex?: FlexStyle;
	flexItem?: boolean;
	grid?: GridStyle;
	gridItem?: boolean;
	orderModifiedChildren?: readonly number[];
	independentContext?: boolean;
	fieldsetContent?: number;
	fieldsetOwner?: number;
	buttonLayout?: true;
	buttonAppearance?: SoftwareControl;
	tableGrid?: number;
	tableWrapper?: number;
	tableCaptions?: readonly number[];
	blockContentAlignment?: Readonly<BlockContentAlignment>;
	fragmentIndex?: number;
	fragmentCount?: number;
	deferredReason?: string;
	intrinsic?: Readonly<{ width: number; height: number }>;
	intrinsicRatio?: boolean;
	imageAlternative?: Readonly<ImageAlternative>;
	emptyImage?: true;
	svg?: SvgScene;
	control?: SoftwareControl;
	marker?: DisclosureMarker;
	outsideMarker?: DisclosureMarker;
	generated?: GeneratedControlTarget;
	generatedContent?: Readonly<{
		owner: number;
		name: "before" | "after";
	}>;
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
		outsideMarkers?: number;
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
	"svg",
	"math",
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
	for (const [code, count] of Object.entries(styleMetrics.applicableIssues))
		issues[`css:${code}`] = count;
	const issue = (code: string) => {
		issues[code] = (issues[code] ?? 0) + 1;
	};
	const nodes: MutableFormattingNode[] = [];
	const tableNodes: MutableFormattingNode[] = [];
	const collapsedBorderGuards = new Set<string>();
	const generatedCollapsedTables = new Set<MutableFormattingNode>();
	const emptyCellGuards = new Set<string>();
	let work = 0;
	let textCodeUnits = 0;
	let visitedDomNodes = 0;
	let deferredSubtrees = 0;
	let outsideMarkers = 0;
	let clearanceRequests = 0;
	let hasCaptions = false;
	const renderedListItems = new Set<number>();
	const numericMarkers: { node: number; item: number; outside: boolean }[] = [];
	const charge = (units = 1) => {
		work += units;
		if (work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Formatting work limit exceeded",
			);
	};
	const languages = new Map<number, string>();
	const contentLanguage = (id: number): string => {
		const visited: number[] = [];
		let current: number | null = id;
		let language = "";
		while (current !== null) {
			charge();
			const cached = languages.get(current);
			if (cached !== undefined) {
				language = cached;
				break;
			}
			visited.push(current);
			const source = tree.get(current);
			if (source.kind === "element") {
				let value: string | undefined;
				for (const name of Object.keys(source.attributes)) {
					charge();
					const metadata = tree.getAttributeNamespace(current, name);
					if (
						metadata?.namespaceURI === xmlNamespace &&
						metadata.localName === "lang"
					) {
						value = source.attributes[name];
						break;
					}
				}
				if (
					value === undefined &&
					(isHtmlElement(source) || elementNamespace(source) === svgNamespace)
				)
					value = source.attributes.lang;
				if (value !== undefined) {
					charge(value.length);
					language =
						value.length <= 255 &&
						/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value)
							? value.toLowerCase()
							: "";
					break;
				}
			}
			current = source.parent;
		}
		for (const visitedId of visited) {
			charge();
			languages.set(visitedId, language);
		}
		return language;
	};
	const create = (
		data: Omit<MutableFormattingNode, "id" | "parent" | "children">,
		children: readonly number[] = [],
	) => {
		charge(children.length + 1);
		if (nodes.length + outsideMarkers >= limits.maxBoxes)
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
		const transform = data.typography?.["text-transform"] ?? "none";
		if (transform !== "none") {
			if (!["uppercase", "lowercase", "capitalize"].includes(transform))
				issue("text-transform-not-supported");
			if (data.ref && /^e[1-9][0-9]*$/.test(data.ref))
				node.language = contentLanguage(Number(data.ref.slice(1)));
			else if (data.generatedContent)
				node.language = contentLanguage(data.generatedContent.owner);
		}
		nodes.push(node);
		if (node.contentMode === "table") {
			charge();
			tableNodes.push(node);
		}
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
	const tableInternal = (id: number) =>
		nodes[id].display?.startsWith("table-") ?? false;
	const omittedTableWhitespace = new Set<number>();
	const tableGroup = (display: string | undefined) =>
		["table-row-group", "table-header-group", "table-footer-group"].includes(
			display ?? "",
		);
	const tableAnonymous = (
		parent: number,
		display: string,
		children: number[],
	): number => {
		const table = display === "table";
		if (table) {
			issue("display-layout-not-supported");
			deferredSubtrees++;
		}
		const result = create({
			kind: table ? "deferred" : "block",
			level: "block",
			display,
			visible: nodes[parent].visible,
			box: initialBoxStyle,
			typography: nodes[parent].typography,
			...(nodes[parent].legacyChildAlignment
				? { legacyChildAlignment: nodes[parent].legacyChildAlignment }
				: {}),
			table: Object.freeze({
				...initialTableStyle,
				"border-collapse":
					nodes[parent].table?.["border-collapse"] ?? "separate",
				"border-spacing": nodes[parent].table?.["border-spacing"] ?? "0px 0px",
				"empty-cells": nodes[parent].table?.["empty-cells"] ?? "show",
				"caption-side": nodes[parent].table?.["caption-side"] ?? "top",
			}),
			independentContext: table || display === "table-cell",
			...(table
				? {
						deferredReason: "display-layout-not-supported",
						contentMode: "table" as const,
					}
				: {}),
		});
		if (display === "table-cell") normalizeChildren(result, children);
		else repairTableChildren(result, children, display);
		return result;
	};
	const repairTableChildren = (
		parent: number,
		children: number[],
		display: string,
	) => {
		const filtered: number[] = [];
		const whitespace = (id: number) => {
			const node = nodes[id];
			charge((node.text?.length ?? 0) + 1);
			return node.kind === "text" && /^[\t\n\f\r ]*$/.test(node.text ?? "");
		};
		const adjacent = (id: number | undefined) => {
			if (id === undefined) return display.startsWith("table");
			const childDisplay = nodes[id].display;
			return display === "table-row"
				? childDisplay === "table-cell"
				: tableGroup(display)
					? childDisplay === "table-row"
					: tableInternal(id);
		};
		for (let index = 0; index < children.length; ) {
			const start = index++;
			if (!whitespace(children[start])) {
				filtered.push(children[start]);
				continue;
			}
			while (index < children.length && whitespace(children[index])) index++;
			const omit = adjacent(children[start - 1]) && adjacent(children[index]);
			for (let cursor = start; cursor < index; cursor++) {
				charge();
				if (omit) omittedTableWhitespace.add(children[cursor]);
				else filtered.push(children[cursor]);
			}
		}
		const normalized: number[] = [];
		let run: number[] = [];
		const flush = () => {
			if (!run.length) return;
			const wrapper =
				display === "table-row"
					? "table-cell"
					: tableGroup(display)
						? "table-row"
						: display === "table"
							? "table-row-group"
							: "table";
			normalized.push(tableAnonymous(parent, wrapper, run));
			run = [];
		};
		for (const child of filtered) {
			charge();
			const entry = nodes[child];
			const proper =
				display === "table"
					? tableGroup(entry.display) ||
						["table-caption", "table-column", "table-column-group"].includes(
							entry.display ?? "",
						)
					: tableGroup(display)
						? entry.display === "table-row"
						: display === "table-row"
							? entry.display === "table-cell"
							: !tableInternal(child);
			if (proper) {
				flush();
				normalized.push(child);
			} else run.push(child);
		}
		flush();
		nodes[parent].children = normalized;
		nodes[parent].contentMode = display === "table" ? "table" : "blocks";
		for (const child of normalized) nodes[child].parent = parent;
		if (display === "table") {
			const header = normalized.find(
				(child) => nodes[child].display === "table-header-group",
			);
			const footer = normalized.find(
				(child) => nodes[child].display === "table-footer-group",
			);
			charge(normalized.length * 3);
			if (header !== undefined || footer !== undefined)
				nodes[parent].orderModifiedChildren = [
					...(header === undefined ? [] : [header]),
					...normalized.filter((child) => child !== header && child !== footer),
					...(footer === undefined ? [] : [footer]),
				];
		}
		return normalized;
	};
	const inNormalFlow = (id: number) =>
		nodes[id].position !== "absolute" &&
		nodes[id].position !== "fixed" &&
		nodes[id].floatSide === undefined;
	const normalizeChildren = (parent: number, children: number[]) => {
		if (children.some(tableInternal))
			children = repairTableChildren(parent, children, "block");
		charge(children.length);
		if (
			!children.some((id) => inNormalFlow(id) && nodes[id].level === "block")
		) {
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
						...(nodes[parent].legacyChildAlignment
							? { legacyChildAlignment: nodes[parent].legacyChildAlignment }
							: {}),
					},
					run,
				),
			);
			run = [];
		};
		for (const child of children) {
			charge();
			if (inNormalFlow(child) && nodes[child].level === "block") {
				flush();
				normalized.push(child);
			} else run.push(child);
		}
		flush();
		nodes[parent].children = normalized;
		nodes[parent].contentMode = "blocks";
		for (const child of normalized) nodes[child].parent = parent;
	};
	const generatedContent = (
		owner: number,
		name: "before" | "after",
		style: GeneratedContentStyle,
		depth: number,
		itemMode?: "flex" | "grid",
	): number => {
		charge(style.content.length + 1);
		if (depth + (style.content.length ? 1 : 0) > limits.maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Generated content formatting depth limit exceeded",
			);
		textCodeUnits += style.content.length;
		if (textCodeUnits > limits.maxTextCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Formatting text limit exceeded",
			);
		const metadata = Object.freeze({ owner, name });
		const { display, flow } = style;
		const outOfFlow =
			display !== "contents" &&
			(flow.position === "absolute" || flow.position === "fixed");
		const inline = display === "inline" || display === "inline flow";
		const atomic = display === "inline-block" || display === "inline flow-root";
		const block = [
			"block",
			"block flow",
			"flow-root",
			"block flow-root",
		].includes(display);
		const table = display === "table" && flow.position === "static";
		const clearing =
			(block || table) &&
			!itemMode &&
			flow.float === "none" &&
			(flow.position === "static" || flow.position === "relative") &&
			["left", "right", "both"].includes(flow.clear);
		let deferredReason: string | undefined;
		if (table) {
			issue("display-layout-not-supported");
			deferredReason = "display-layout-not-supported";
			if (style.table["table-layout"] !== "auto")
				issue("table-fixed-layout-not-supported");
			if (style.table["border-collapse"] !== "separate")
				issue("table-collapsed-borders-not-supported");
		}
		if (!inline && !atomic && !block && !table) {
			issue("display-layout-not-supported");
			deferredReason = "generated-content-display-layout-not-supported";
			issue(deferredReason);
		}
		if (itemMode && !outOfFlow) {
			deferredReason = "generated-content-item-layout-not-supported";
			issue(deferredReason);
		}
		if (
			flow.position !== "static" &&
			flow.position !== "relative" &&
			!outOfFlow
		) {
			issue("position-layout-not-supported");
			issue("generated-content-position-layout-not-supported");
		}
		if (outOfFlow) issue("positioned-layout-requires-coordination");
		if (flow.float !== "none") {
			issue("generated-content-float-layout-not-supported");
		}
		if (
			flow.clear !== "none" &&
			!outOfFlow &&
			!inline &&
			!atomic &&
			!clearing
		) {
			issue("generated-content-clear-layout-not-supported");
		}
		if (clearing) clearanceRequests++;
		if (flow["overflow-x"] !== "visible" || flow["overflow-y"] !== "visible") {
			issue("overflow-layout-not-supported");
			issue("generated-content-overflow-layout-not-supported");
		}
		if (
			style.clip["clip-path"] != null ||
			style.clip.svgClipError ||
			style.paint["clip-path"] != null
		) {
			issue("clip-path-layout-not-supported");
			issue("generated-content-clip-layout-not-supported");
		}
		if (!["none", "hidden"].includes(style.outline["outline-style"]))
			issue("generated-content-outline-layout-not-supported");
		if (style.textDecoration["text-decoration-line"] !== "none")
			issue("generated-content-text-decoration-layout-not-supported");
		for (const side of ["top", "right", "bottom", "left"] as const) {
			charge();
			if (
				!borderCapabilities.styles.includes(style.box[`border-${side}-style`])
			) {
				issue("generated-content-border-layout-not-supported");
				break;
			}
		}
		if ((inline || atomic) && style.table["vertical-align"] !== "baseline") {
			issue("inline-vertical-align-not-supported");
			issue("generated-content-vertical-align-layout-not-supported");
		}
		const alignment =
			block || atomic
				? resolveBlockContentAlignment(style.flex["align-content"])
				: undefined;
		if (alignment === null) issue("block-content-alignment-not-supported");
		const content: number[] = [];
		if (
			style.content.length &&
			!(table && /^[\t\n\f\r ]*$/.test(style.content))
		)
			content.push(
				create({
					kind: "text",
					level: "inline",
					visible: style.visible,
					text: style.content,
					typography: style.typography,
					paint: style.paint,
					generatedContent: metadata,
				}),
			);
		if (deferredReason) deferredSubtrees++;
		const result = create(
			{
				kind: deferredReason ? "deferred" : inline ? "inline" : "block",
				level:
					itemMode || (!display.startsWith("inline") && display !== "contents")
						? "block"
						: "inline",
				display,
				visible: style.visible,
				box: style.box,
				typography: style.typography,
				paint: style.paint,
				generatedContent: metadata,
				...(table ? { table: style.table, contentMode: "table" as const } : {}),
				...(clearing
					? { clear: flow.clear as NonNullable<FormattingNode["clear"]> }
					: {}),
				...(flow.position === "relative" || outOfFlow
					? { position: flow.position as "relative" | "absolute" | "fixed" }
					: {}),
				...(outOfFlow
					? {
							staticDisplay: itemMode
								? blockifyDisplay(style.unpositionedDisplay ?? display)
								: (style.unpositionedDisplay ?? display),
							staticFlex: style.flex,
						}
					: {}),
				...(flow["z-index"] !== "auto" &&
				(flow.position === "relative" || outOfFlow)
					? { zIndex: Number(flow["z-index"]) }
					: {}),
				...(deferredReason ? { deferredReason } : {}),
				...(inline ? { fragmentIndex: 0, fragmentCount: 1 } : {}),
				...(table ||
				outOfFlow ||
				atomic ||
				display.includes("flow-root") ||
				alignment
					? { independentContext: true }
					: {}),
				...(alignment ? { blockContentAlignment: alignment } : {}),
			},
			content,
		);
		if (table) {
			repairTableChildren(result, content, "table");
			if (style.table["border-collapse"] === "collapse")
				generatedCollapsedTables.add(nodes[result]);
		} else if (!inline && !deferredReason) normalizeChildren(result, content);
		return result;
	};
	const visit = (
		id: number,
		depth: number,
		itemMode?: "flex" | "grid",
	): number[] => {
		let flexItem = itemMode === "flex";
		let gridItem = itemMode === "grid";
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
		let display =
			id === rootElement
				? (rootDisplays[visibility.display] ?? visibility.display)
				: visibility.display;
		const floating =
			visibility.display !== "contents" &&
			(flow.position === "static" || flow.position === "relative") &&
			!flexItem &&
			!gridItem &&
			flow.float !== "none";
		const buttonLayout =
			isHtmlElement(node, "button") &&
			(flow.position === "static" || flow.position === "relative") &&
			!flexItem &&
			!gridItem &&
			display !== "contents" &&
			!(isGridDisplay(display) && display.startsWith("inline")) &&
			node.children.some((child) => {
				charge();
				return tree.get(child).kind === "element";
			});
		if (buttonLayout) display = buttonUsedDisplay(display);
		const deferredElement = deferredElements.has(node.tagName) && !buttonLayout;
		const clearing =
			flow.clear !== "none" &&
			(flow.position === "static" || flow.position === "relative") &&
			!flexItem &&
			!gridItem &&
			(floating ||
				[
					"block",
					"block flow",
					"flow-root",
					"block flow-root",
					"list-item",
					"flex",
					"block flex",
					"grid",
					"block grid",
					"table",
					"block table",
				].includes(display));
		const boxFlowFields = {
			...(htmlTextAlignment(node) !== undefined
				? { legacyAlignmentBoundary: true as const }
				: {}),
			...(styles.legacyChildAlignment(id)
				? { legacyChildAlignment: "center" as const }
				: {}),
			...(floating
				? {
						floatSide: flow.float as NonNullable<FormattingNode["floatSide"]>,
						independentContext: true,
					}
				: {}),
			...(clearing
				? { clear: flow.clear as NonNullable<FormattingNode["clear"]> }
				: {}),
		};
		const embeddedSvg =
			elementNamespace(node) === svgNamespace && node.tagName === "svg";
		if (isHtmlElement(node) && styles.paint(id)["clip-path"] != null)
			issue("clip-path-layout-not-supported");
		if (!isHtmlElement(node) && !embeddedSvg) {
			const reason = "element-layout-not-supported";
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
					...boxFlowFields,
				}),
			];
		}
		if (flow.position === "sticky") issue("position-layout-not-supported");
		const outOfFlow =
			visibility.display !== "contents" &&
			(flow.position === "absolute" || flow.position === "fixed");
		if (outOfFlow) issue("positioned-layout-requires-coordination");
		if (outOfFlow) {
			flexItem = false;
			gridItem = false;
			itemMode = undefined;
		}
		if (floating) issue("float-layout-not-supported");
		if (clearing) clearanceRequests++;
		const svgClipping =
			embeddedSvg &&
			["hidden", "clip"].includes(flow["overflow-x"]) &&
			["hidden", "clip"].includes(flow["overflow-y"]);
		if (
			(flow["overflow-x"] !== "visible" || flow["overflow-y"] !== "visible") &&
			!svgClipping
		)
			issue("overflow-layout-not-supported");
		if (embeddedSvg && !svgClipping)
			issue("svg-viewport-overflow-not-supported");
		const positionFields = {
			...boxFlowFields,
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
			(flow.position === "relative" || outOfFlow || flexItem || gridItem)
				? { zIndex: Number(flow["z-index"]) }
				: {}),
		};
		const itemFields = {
			...positionFields,
			...(flexItem
				? { flexItem: true, flex: styles.flex(id), independentContext: true }
				: {}),
			...(gridItem
				? {
						gridItem: true,
						grid: styles.grid(id),
						flex: styles.flex(id),
						independentContext: true,
					}
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
					!(name === "align" && supportsTextAlignmentHint(node)) &&
					!(name === "border" && supportsImageBorderHint(node)) &&
					!(
						(node.tagName === "img" || embeddedSvg) &&
						(name === "width" || name === "height")
					),
			)
		)
			issue("html-presentation-hint-not-supported");
		if (
			[
				"table",
				"thead",
				"tbody",
				"tfoot",
				"tr",
				"td",
				"th",
				"col",
				"colgroup",
			].includes(node.tagName) &&
			[
				"cellpadding",
				"cellspacing",
				"rules",
				"frame",
				"bgcolor",
				"background",
			].some(
				(name) =>
					Object.hasOwn(node.attributes, name) &&
					!(name === "bgcolor" && supportsBackgroundColorHint(node)) &&
					!(name === "cellspacing" && isHtmlElement(node, "table")) &&
					!(name === "cellpadding" && supportsCellPaddingHint(node)),
			)
		)
			issue("html-table-presentation-hint-not-supported");
		if (
			display.startsWith("inline") &&
			styles.table(id)["vertical-align"] !== "baseline"
		)
			issue("inline-vertical-align-not-supported");
		if (embeddedSvg) {
			try {
				if (
					![
						"inline",
						"inline flow",
						"inline-block",
						"inline flow-root",
						"block",
						"block flow",
						"flow-root",
						"block flow-root",
					].includes(display)
				)
					throw new AgentBrowserError(
						"unsupported",
						"Unsupported SVG outer display",
					);
				const svg = documentSvgScene(tree, id, charge);
				const intrinsic = svgIntrinsicSize(svg, styles.box(id));
				return [
					create({
						kind: "replaced",
						level: display.startsWith("inline") ? "inline" : "block",
						ref,
						display,
						visible: visibility.visible,
						box: styles.box(id),
						paint: styles.paint(id),
						typography: styles.text(id),
						intrinsic: Object.freeze({
							width: intrinsic.width,
							height: intrinsic.height,
						}),
						intrinsicRatio: intrinsic.ratio,
						svg,
						...itemFields,
					}),
				];
			} catch (error) {
				if (
					!(error instanceof AgentBrowserError) ||
					!["unsupported", "invalid-input"].includes(error.code)
				)
					throw error;
				const reason = "svg-layout-not-supported";
				issue(reason);
				deferredSubtrees++;
				return [
					create({
						kind: "deferred",
						level: display.startsWith("inline") ? "inline" : "block",
						ref,
						display,
						visible: visibility.visible,
						deferredReason: reason,
						...itemFields,
					}),
				];
			}
		}
		if (display === "contents" && unusualContents.has(node.tagName)) return [];
		const brokenAlternative =
			node.tagName === "img" &&
			[
				"inline",
				"inline flow",
				"block",
				"block flow",
				"flow-root",
				"block flow-root",
				"inline-block",
				"inline flow-root",
			].includes(display)
				? brokenImageAlternative(tree, node)
				: undefined;
		const alternativeBox =
			brokenAlternative !== undefined && documentMode(tree) === "quirks"
				? styles.box(id)
				: undefined;
		const replacedAlternative =
			alternativeBox !== undefined &&
			(alternativeBox.width !== "auto" || alternativeBox.height !== "auto");
		const imageText = replacedAlternative ? undefined : brokenAlternative;
		const children = (asItems?: "flex" | "grid", extraDepth = 0) => {
			const result: number[] = [];
			if (imageText !== undefined) {
				if (depth + 1 > limits.maxDepth)
					throw new AgentBrowserError(
						"resource-limit",
						"Image alternative formatting depth limit exceeded",
					);
				textCodeUnits += imageText.length;
				if (textCodeUnits > limits.maxTextCodeUnits)
					throw new AgentBrowserError(
						"resource-limit",
						"Formatting text limit exceeded",
					);
				charge(imageText.length);
				return [
					create({
						kind: "text",
						level: "inline",
						ref,
						visible: visibility.visible,
						text: imageText,
						typography: styles.text(id),
						paint: styles.paint(id),
					}),
				];
			}
			const eligible =
				!unusualContents.has(node.tagName) &&
				(node.tagName !== "details" || Object.hasOwn(node.attributes, "open"));
			if (eligible) charge(2);
			const before = eligible
				? styles.generatedContent(id, "before")
				: undefined;
			const after = eligible ? styles.generatedContent(id, "after") : undefined;
			const summary =
				node.tagName === "details" && (before || after)
					? firstDetailsSummary(tree, node, charge)
					: null;
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
										...(asItems === "grid"
											? { gridItem: true, grid: initialGridStyle }
											: { flexItem: true }),
										flex: initialFlexStyle,
										independentContext: true,
									}
								: {}),
						},
						content,
					),
				);
			}
			if (summary !== null)
				append(result, visit(summary, depth + 1 + extraDepth, asItems));
			if (before)
				result.push(
					generatedContent(
						id,
						"before",
						before,
						depth + 1 + extraDepth,
						asItems,
					),
				);
			for (const child of node.children) {
				if (child === summary) continue;
				append(result, visit(child, depth + 1 + extraDepth, asItems));
			}
			if (after)
				result.push(
					generatedContent(id, "after", after, depth + 1 + extraDepth, asItems),
				);
			return result;
		};
		if (
			display === "contents" &&
			node.tagName !== "svg" &&
			node.tagName !== "math"
		)
			return children(itemMode);
		if (
			isHtmlElement(node, "fieldset") &&
			[
				"block",
				"block flow",
				"flow-root",
				"block flow-root",
				"inline",
				"inline flow",
				"inline-block",
				"inline flow-root",
			].includes(display) &&
			!flexItem &&
			!gridItem &&
			!floating &&
			!outOfFlow &&
			["top", "right", "bottom", "left"].every((side) =>
				["none", "hidden", "solid", "groove"].includes(
					styles.box(id)[`border-${side}-style` as keyof BoxStyle],
				),
			)
		) {
			if (depth + 1 > limits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Fieldset content formatting depth limit exceeded",
				);
			const box = styles.box(id);
			const typography = styles.text(id);
			const paint = styles.paint(id);
			const contentAlignment = resolveBlockContentAlignment(
				styles.flex(id)["align-content"],
			);
			if (contentAlignment === null)
				issue("block-content-alignment-not-supported");
			const outer = create({
				kind: "block",
				level: display.startsWith("inline") ? "inline" : "block",
				ref,
				display: display.startsWith("inline") ? "inline-block" : "flow-root",
				visible: visibility.visible,
				box: fieldsetOuterStyle(box),
				paint,
				typography,
				independentContext: true,
				...itemFields,
			});
			const content = create({
				kind: "block",
				level: "block",
				display: "flow-root",
				visible: visibility.visible,
				box: fieldsetContentStyle(box),
				paint: Object.freeze({ ...initialPaintStyle, color: paint.color }),
				typography,
				independentContext: true,
				fieldsetOwner: outer,
				...(contentAlignment
					? { blockContentAlignment: contentAlignment }
					: {}),
			});
			nodes[outer].fieldsetContent = content;
			const contents = children(undefined, 1);
			if (contents.some(tableInternal)) nodes[content].table = styles.table(id);
			normalizeChildren(content, contents);
			normalizeChildren(outer, [content]);
			return [outer];
		}
		if (
			(display === "table" || display.startsWith("table-")) &&
			!deferredElement
		) {
			const table = styles.table(id);
			const root = display === "table";
			if (flexItem || gridItem) issue("table-item-layout-not-supported");
			if (root) {
				issue("display-layout-not-supported");
				deferredSubtrees++;
			}
			if (table["border-collapse"] !== "separate") {
				issue("table-collapsed-borders-not-supported");
				collapsedBorderGuards.add(tree.reference(id));
			}
			if (root && table["table-layout"] !== "auto")
				issue("table-fixed-layout-not-supported");
			if (display === "table-column" || display === "table-column-group")
				issue("table-column-layout-not-supported");
			if (display === "table-caption") {
				hasCaptions = true;
				issue("table-caption-layout-not-supported");
			}
			if (display === "table-cell" && table["empty-cells"] !== "show") {
				issue("table-empty-cell-paint-not-supported");
				emptyCellGuards.add(tree.reference(id));
			}
			if (flow.position !== "static")
				issue("table-position-layout-not-supported");
			const cell = display === "table-cell";
			const captionAlignment =
				display === "table-caption"
					? resolveBlockContentAlignment(styles.flex(id)["align-content"])
					: undefined;
			if (captionAlignment === null)
				issue("block-content-alignment-not-supported");
			if (cell && styles.flex(id)["align-content"] !== "normal")
				issue("block-content-alignment-not-supported");
			const span = (
				name: string,
				fallback: number,
				maximum: number,
				zero: boolean,
			) => {
				const source = node.attributes[name];
				charge(source?.length ?? 0);
				const match = source?.match(/^[\t\n\f\r ]*\+?(\d+)/);
				const parsed = match ? Number(match[1]) : fallback;
				return parsed === 0 && !zero ? fallback : Math.min(parsed, maximum);
			};
			const box = styles.box(id);
			const result = create({
				kind: root ? "deferred" : "block",
				level: "block",
				ref,
				display,
				visible: visibility.visible,
				table,
				box: cell
					? Object.freeze({
							...box,
							"margin-top": "0px",
							"margin-right": "0px",
							"margin-bottom": "0px",
							"margin-left": "0px",
							"max-width": "none",
						})
					: box,
				typography: styles.text(id),
				paint: styles.paint(id),
				independentContext: root || cell || display === "table-caption",
				...(captionAlignment
					? { blockContentAlignment: captionAlignment }
					: {}),
				...(cell && (node.tagName === "td" || node.tagName === "th")
					? {
							tableSpan: Object.freeze({
								columns: span("colspan", 1, 1000, false),
								rows: span("rowspan", 1, 65534, true),
							}),
						}
					: {}),
				...(root
					? {
							contentMode: "table" as const,
							deferredReason: "display-layout-not-supported",
						}
					: {}),
				...itemFields,
			});
			if (cell || display === "table-caption")
				normalizeChildren(result, children());
			else if (!display.startsWith("table-column"))
				repairTableChildren(result, children(), display);
			return [result];
		}
		const gridContainer = isGridDisplay(display);
		if ((isFlexDisplay(display) || gridContainer) && !deferredElement) {
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
				gridItem,
				...(gridContainer || gridItem ? { grid: styles.grid(id) } : {}),
				independentContext: true,
				contentMode: gridContainer ? "grid" : "flex",
				deferredReason: "display-layout-not-supported",
				...(buttonLayout
					? {
							buttonLayout: true as const,
							buttonAppearance: describeButtonAppearance(tree, id),
						}
					: {}),
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
								...(gridContainer
									? { gridItem: true, grid: initialGridStyle }
									: { flexItem: true }),
								flex: initialFlexStyle,
								independentContext: true,
							},
							text,
						),
					);
				text = [];
			};
			for (const child of children(gridContainer ? "grid" : "flex")) {
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
		const listItem = display === "list-item" && !deferredElement;
		const block =
			listItem ||
			["block", "block flow", "flow-root", "block flow-root"].includes(display);
		const inline = ["inline", "inline flow"].includes(display);
		const atomicBlock = ["inline-block", "inline flow-root"].includes(display);
		const blockContentAlignment =
			(block || atomicBlock) && (!deferredElement || imageText !== undefined)
				? resolveBlockContentAlignment(styles.flex(id)["align-content"])
				: undefined;
		if (blockContentAlignment === null)
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
							width: imageIntrinsicSize(decoded).width,
							height: imageIntrinsicSize(decoded).height,
						}),
						...itemFields,
					}),
				];
			if (emptyImageAlternative(tree, node))
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
						intrinsic: Object.freeze({ width: 0, height: 0 }),
						intrinsicRatio: false,
						emptyImage: true,
						...itemFields,
					}),
				];
			if (replacedAlternative && brokenAlternative !== undefined) {
				textCodeUnits += brokenAlternative.length;
				if (textCodeUnits > limits.maxTextCodeUnits)
					throw new AgentBrowserError(
						"resource-limit",
						"Formatting text limit exceeded",
					);
				const typography = styles.text(id);
				const alternative = describeImageAlternative(
					brokenAlternative,
					Number.parseFloat(typography["font-size"]),
					charge,
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
						intrinsic: Object.freeze({
							width: alternative.width,
							height: alternative.height,
						}),
						intrinsicRatio: false,
						imageAlternative: alternative,
						...itemFields,
					}),
				];
			}
		}
		if (
			(deferredElement && imageText === undefined) ||
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
			const reason = deferredElement
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
					...(flexItem || gridItem ? { box: styles.box(id) } : {}),
				}),
			];
		}
		if (block || atomicBlock || floating) {
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
					atomicBlock ||
					id === rootElement ||
					display.includes("flow-root") ||
					(blockContentAlignment !== undefined &&
						blockContentAlignment !== null),
				...(blockContentAlignment ? { blockContentAlignment } : {}),
				...(buttonLayout
					? {
							buttonLayout: true as const,
							buttonAppearance: describeButtonAppearance(tree, id),
						}
					: {}),
				...itemFields,
			});
			const contents = children();
			if (contents.some(tableInternal)) nodes[result].table = styles.table(id);
			if (listItem) {
				renderedListItems.add(id);
				const list = styles.list(id);
				const typography = styles.text(id);
				const fontSize = Number.parseFloat(typography["font-size"]);
				const type = list["list-style-type"];
				if (!markerTypes.includes(type) && fontSize > 0)
					issue("list-marker-type-not-supported");
				else if (type !== "none" && fontSize > 0) {
					const outside = list["list-style-position"] === "outside";
					let markerNode = result;
					if (list["list-style-position"] === "outside") {
						charge();
						if (nodes.length + outsideMarkers >= limits.maxBoxes)
							throw new AgentBrowserError(
								"resource-limit",
								"Formatting box limit exceeded",
							);
						outsideMarkers++;
						nodes[result].outsideMarker = Object.freeze({
							type,
						});
					} else {
						markerNode = create({
							kind: "replaced",
							level: "inline",
							ref,
							visible: visibility.visible,
							typography,
							marker: Object.freeze({ type }),
							box: initialBoxStyle,
							paint: Object.freeze({
								...initialPaintStyle,
								color: styles.paint(id).color,
							}),
							intrinsic: Object.freeze({
								width: fontSize,
								height: (fontSize * bitmapFont.ascent) / bitmapFont.unitsPerEm,
							}),
						});
						contents.unshift(markerNode);
					}
					if (type === "decimal" || type === "decimal-leading-zero")
						numericMarkers.push({ node: markerNode, item: id, outside });
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
			if (tableInternal(child)) issue("inline-anonymous-table-not-supported");
			if (nodes[child].level === "block" && inNormalFlow(child)) {
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
	if (clearanceRequests && issues["float-layout-not-supported"])
		issues["clear-layout-not-supported"] = clearanceRequests;
	normalizeChildren(root, children);
	if (numericMarkers.length) {
		const boxProducers = new Set([tree.root]);
		for (const node of nodes) {
			charge();
			if (node.ref && node.kind !== "text" && node.kind !== "break")
				boxProducers.add(tree.resolve(node.ref).id);
		}
		const ordinals = resolveListOrdinals(
			tree,
			renderedListItems,
			boxProducers,
			charge,
			new Set(numericMarkers.map((marker) => marker.item)),
		);
		for (const target of numericMarkers) {
			charge();
			const node = nodes[target.node];
			const previous = target.outside ? node.outsideMarker : node.marker;
			const ordinal = ordinals.get(target.item);
			if (!previous || ordinal === undefined || !node.typography)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing numeric list marker owner",
				);
			const marker = Object.freeze({ type: previous.type, ordinal });
			const text = disclosureMarkerText(marker);
			if (text === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing numeric list marker text",
				);
			textCodeUnits += text.length;
			if (textCodeUnits > limits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Formatting text limit exceeded",
				);
			charge(text.length);
			if (target.outside) node.outsideMarker = marker;
			else {
				node.marker = marker;
				node.intrinsic = disclosureMarkerExtent(
					marker,
					Number.parseFloat(node.typography["font-size"]),
				);
			}
		}
	}
	if (omittedTableWhitespace.size) {
		const remap = new Int32Array(nodes.length).fill(-1);
		let retained = 0;
		for (const node of nodes) {
			charge();
			if (!omittedTableWhitespace.has(node.id)) remap[node.id] = retained++;
		}
		let write = 0;
		for (const node of nodes) {
			charge();
			if (omittedTableWhitespace.has(node.id)) continue;
			node.id = remap[node.id];
			if (node.parent !== null) node.parent = remap[node.parent];
			if (node.fieldsetContent !== undefined)
				node.fieldsetContent = remap[node.fieldsetContent];
			if (node.fieldsetOwner !== undefined)
				node.fieldsetOwner = remap[node.fieldsetOwner];
			charge(node.children.length + (node.orderModifiedChildren?.length ?? 0));
			node.children = node.children.map((child) => remap[child]);
			if (node.orderModifiedChildren)
				node.orderModifiedChildren = node.orderModifiedChildren.map(
					(child) => remap[child],
				);
			nodes[write++] = node;
		}
		nodes.length = retained;
	}
	for (const table of hasCaptions ? tableNodes : []) {
		charge(table.children.length + 1);
		const captions = table.children.filter(
			(child) => nodes[child].display === "table-caption",
		);
		if (
			!captions.length ||
			table.parent === null ||
			table.flexItem ||
			table.gridItem ||
			(table.position !== undefined && table.position !== "relative") ||
			captions.some((caption) => {
				charge();
				return (
					nodes[caption].position !== undefined || nodes[caption].floatSide
				);
			})
		)
			continue;
		const parent = nodes[table.parent];
		const before: number[] = [];
		const after: number[] = [];
		const captionSet = new Set(captions);
		for (const caption of captions) {
			charge();
			(nodes[caption].table?.["caption-side"] === "bottom"
				? after
				: before
			).push(caption);
			nodes[caption].display = "flow-root";
			const reference = nodes[caption].ref;
			if (reference) collapsedBorderGuards.delete(reference);
			const count = (issues["table-caption-layout-not-supported"] ?? 0) - 1;
			if (count) issues["table-caption-layout-not-supported"] = count;
			else delete issues["table-caption-layout-not-supported"];
		}
		const wrapper = create(
			{
				kind: "block",
				level: "block",
				display: "flow-root",
				contentMode: "blocks",
				visible: table.visible,
				independentContext: true,
				typography: table.typography,
				box: tableWrapperStyle(table.box ?? initialBoxStyle),
				tableGrid: table.id,
				...(table.position ? { position: table.position } : {}),
				...(table.zIndex === undefined ? {} : { zIndex: table.zIndex }),
				...(table.clear === undefined ? {} : { clear: table.clear }),
				...(table.floatSide === undefined
					? {}
					: { floatSide: table.floatSide }),
			},
			[...before, table.id, ...after],
		);
		nodes[wrapper].parent = parent.id;
		charge(parent.children.length + table.children.length);
		parent.children = parent.children.map((child) =>
			child === table.id ? wrapper : child,
		);
		table.children = table.children.filter((child) => !captionSet.has(child));
		table.tableWrapper = wrapper;
		table.tableCaptions = Object.freeze(captions);
		table.box = captionedTableStyle(table.box ?? initialBoxStyle);
		if (table.position === "relative") {
			const count = (issues["table-position-layout-not-supported"] ?? 0) - 1;
			if (count) issues["table-position-layout-not-supported"] = count;
			else delete issues["table-position-layout-not-supported"];
		}
		delete table.position;
		delete table.zIndex;
		delete table.clear;
		delete table.floatSide;
	}
	if (collapsedBorderGuards.size || generatedCollapsedTables.size) {
		const collapsed = applyCollapsedTableBorders(
			nodes,
			Math.max(1, limits.maxWork - work),
		);
		charge(collapsed.work);
		for (const ref of collapsed.resolvedRefs) {
			collapsedBorderGuards.delete(ref);
			emptyCellGuards.delete(ref);
		}
		let unresolvedGenerated = 0;
		for (const table of generatedCollapsedTables) {
			charge();
			if (!table.collapsedTable) unresolvedGenerated++;
		}
		if (collapsedBorderGuards.size || unresolvedGenerated)
			issues["table-collapsed-borders-not-supported"] =
				collapsedBorderGuards.size + unresolvedGenerated;
		else delete issues["table-collapsed-borders-not-supported"];
		if (emptyCellGuards.size)
			issues["table-empty-cell-paint-not-supported"] = emptyCellGuards.size;
		else delete issues["table-empty-cell-paint-not-supported"];
	}
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
			boxes: nodes.length + outsideMarkers,
			...(outsideMarkers ? { outsideMarkers } : {}),
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
	paddingBasis?: number;
}

export interface DocumentBlockWidths {
	stage: "normal-flow-horizontal-only" | "isolated-block-horizontal-reflow";
	partial: true;
	formatting: FormattingTree;
	widths: readonly Readonly<FormattingBlockWidth>[];
	images: readonly Readonly<FormattingImageSize>[];
	atomics?: readonly Readonly<AtomicInlineMetrics>[];
	atomicLayouts?: readonly Readonly<AtomicInlineLayout>[];
	floatLayouts?: readonly Readonly<FloatBoxLayout>[];
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

export function isAdvisoryFormattingIssue(code: string): boolean {
	return (
		code === "css:unimplemented-or-invalid-media-query" ||
		code === "css:discarded-incomplete-css-rule" ||
		code === "css:discarded-invalid-nested-css-rule"
	);
}

export function resolveFormattingPageWidths(
	formatting: FormattingTree,
	maxWork = formattingLimits.maxWork,
	onFlex?: (width: Readonly<FormattingBlockWidth>) => void,
	context: AtomicInlineResolutionContext = {},
): Readonly<DocumentBlockWidths> {
	const flexCount = onFlex
		? formatting.nodes.filter(
				(node) =>
					node.contentMode === "flex" ||
					node.contentMode === "grid" ||
					node.contentMode === "table",
			).length
		: 0;
	const blockers = Object.entries(formatting.issues).filter(
		([issue, count]) =>
			!isAdvisoryFormattingIssue(issue) &&
			(issue !== "display-layout-not-supported" ||
				!onFlex ||
				count !== flexCount),
	);
	if (blockers.length)
		throw new AgentBrowserError(
			"unsupported",
			"Document width resolution requires an issue-free supported formatting profile: " +
				blockers
					.slice(0, 8)
					.map(([issue, count]) => `${issue.slice(0, 96)} (${count})`)
					.join(", ") +
				(blockers.length > 8
					? `; ${blockers.length - 8} more issue types`
					: ""),
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
	paddingBasis?: number;
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
	const floatLayouts: Readonly<FloatBoxLayout>[] = [];
	const pending: Readonly<BlockReflowRoot>[] = [...roots].reverse();
	while (pending.length) {
		charge();
		const frame = pending.pop();
		if (!frame) break;
		const node = formatting.nodes[frame.id];
		if (node?.floatSide && node.id !== context.floatRoot) {
			if (!context.layoutFloat)
				throw new AgentBrowserError(
					"unsupported",
					"Float content requires coordinated page layout",
				);
			if (work >= maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Float width work limit exceeded",
				);
			const layout = context.layoutFloat(frame, maxWork - work, context);
			charge(layout.metrics.work);
			floatLayouts.push(layout);
			continue;
		}
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
			!!onFlex &&
			(node?.contentMode === "flex" ||
				node?.contentMode === "grid" ||
				node?.contentMode === "table") &&
			node.level === "block";
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
		let captionedGridWidth: Readonly<BlockWidth> | undefined;
		let style = node.box ?? initialBoxStyle;
		const paddingBasis =
			node.fieldsetOwner === undefined && node.tableWrapper === undefined
				? undefined
				: (frame.paddingBasis ?? containingWidth);
		if (paddingBasis !== undefined)
			style = fieldsetPaddingStyle(style, paddingBasis);
		if (node.tableGrid !== undefined) {
			const measured = measureValidatedIntrinsicRoot(
				formatting,
				node.id,
				frame.containingHeight,
				{
					maxWork: Math.min(4_000_000, Math.max(1, maxWork - work)),
					text: context.text,
				},
				context.nesting ?? 0,
			);
			charge(measured.metrics.work);
			let gridIntrinsic: (typeof measured.widths)[number] | undefined;
			let wrapperIntrinsic: (typeof measured.widths)[number] | undefined;
			for (const entry of measured.widths) {
				charge();
				if (entry.id === node.tableGrid) gridIntrinsic = entry;
				if (entry.id === node.id) wrapperIntrinsic = entry;
			}
			if (!gridIntrinsic || !wrapperIntrinsic)
				throw new AgentBrowserError(
					"unsupported",
					"Missing captioned table intrinsic widths",
				);
			captionedGridWidth = resolveCaptionedTableWidth(
				formatting.nodes[node.tableGrid].box ?? initialBoxStyle,
				style,
				frame.containingWidth,
				gridIntrinsic,
				wrapperIntrinsic.minContent,
			);
			style = {
				...style,
				width: `${layoutNumber(captionedGridWidth.borderBoxWidth)}px`,
			};
		}
		if (
			(style["min-width"] === "min-content" ||
				(node.buttonLayout && style.width === "auto")) &&
			!frame.usedWidth
		) {
			const measured = measureValidatedIntrinsicRoot(
				formatting,
				node.id,
				frame.containingHeight,
				{
					maxWork: Math.min(4_000_000, Math.max(1, maxWork - work)),
					text: context.text,
				},
				context.nesting ?? 0,
			);
			charge(measured.metrics.work);
			const intrinsic = measured.widths.find((entry) => {
				charge();
				return entry.id === node.id;
			});
			if (!intrinsic)
				throw new AgentBrowserError(
					"unsupported",
					"Missing intrinsic minimum width",
				);
			const contentBox =
				node.fieldsetContent === undefined
					? undefined
					: formatting.nodes[node.fieldsetContent].box;
			const adjustment = contentBox
				? fieldsetIntrinsicPadding(contentBox, frame.containingWidth)
				: 0;
			style = resolveFieldsetMinimum(
				style,
				Math.max(0, intrinsic.minContent + adjustment),
				frame.containingWidth,
			);
			if (node.buttonLayout)
				style = buttonFitContentStyle(style, frame.containingWidth, intrinsic);
		}
		if (node.contentMode === "table" && !frame.usedWidth) {
			const measured = measureValidatedIntrinsicRoot(
				formatting,
				node.id,
				frame.containingHeight,
				{
					maxWork: Math.min(4_000_000, Math.max(1, maxWork - work)),
					text: context.text,
				},
				context.nesting ?? 0,
			);
			charge(measured.metrics.work);
			const intrinsic = measured.widths.find((entry) => entry.id === node.id);
			if (!intrinsic)
				throw new AgentBrowserError(
					"unsupported",
					"Missing table intrinsic width",
				);
			const available = resolveBlockWidth(
				{ ...style, width: "auto" },
				frame.containingWidth,
				resolveBorders(style),
			);
			const specified = resolveBlockWidth(
				style,
				frame.containingWidth,
				resolveBorders(style),
			);
			const used = Math.max(
				intrinsic.minContent,
				style.width === "auto"
					? Math.min(intrinsic.maxContent, available.contentWidth)
					: specified.contentWidth,
			);
			style = {
				...style,
				width: `${used + (style["box-sizing"] === "border-box" ? specified.borderBoxWidth - specified.contentWidth : 0)}px`,
			};
		}
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
				!node.control && node.intrinsicRatio !== false,
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
					{
						...resolveBorders(style),
						...(node.level === "block" &&
						!node.legacyAlignmentBoundary &&
						!node.floatSide &&
						node.position !== "absolute" &&
						node.position !== "fixed" &&
						!node.flexItem &&
						!node.gridItem &&
						formatting.nodes[containingBlock]?.legacyChildAlignment
							? {
									legacyAlignment:
										formatting.nodes[containingBlock].legacyChildAlignment,
								}
							: {}),
					},
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
					...(paddingBasis === undefined ? {} : { paddingBasis }),
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
			const tableGrid = node.children[index] === node.tableGrid;
			pending.push({
				id: node.children[index],
				containingBlock,
				containingWidth,
				containingHeight: tableGrid ? frame.containingHeight : containingHeight,
				contentX,
				...(tableGrid && captionedGridWidth
					? { usedWidth: captionedGridWidth }
					: {}),
				...(node.fieldsetContent === undefined && !tableGrid
					? {}
					: { paddingBasis: frame.containingWidth }),
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
		...(floatLayouts.length
			? { floatLayouts: Object.freeze(floatLayouts) }
			: {}),
		metrics: Object.freeze({ work }),
	});
}
