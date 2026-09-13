import { imageDimensionHint } from "./replaced-box.js";
import {
	cellPaddingLength,
	cellPaddingOwner,
	supportsCellPaddingHint,
} from "./html-cell-padding.js";
import { htmlPixelLength } from "./html-pixel-length.js";
import {
	htmlTextAlignment,
	supportsTextAlignmentHint,
} from "./html-alignment.js";
import {
	legacyColor,
	supportsBackgroundColorHint,
} from "./html-background-color.js";
import {
	imageBorderWidth,
	supportsImageBorderHint,
} from "./html-image-border.js";
import { htmlScriptingEnabled } from "./html-info.js";
import {
	cssGridProperties,
	isCssGridProperty,
	computeGridStyle,
	initialGridStyle,
	isGridDisplay,
	gridValueUsesFont,
	type CssGridProperty,
	type GridStyle,
	type GridSpecifiedStyle,
} from "./css-grid.js";
import {
	elementNamespace,
	isHtmlElement,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	cssInteractionProperties,
	computePointerEvents,
	type PointerEventsStyle,
} from "./css-interaction.js";
import {
	cssFlexProperties,
	isCssFlexProperty,
	computeFlexStyle,
	initialFlexStyle,
	isFlexDisplay,
	blockifyDisplay,
	type CssFlexProperty,
	type FlexStyle,
	type FlexSpecifiedStyle,
} from "./css-flex.js";
import {
	cssOutlineProperties,
	isCssOutlineProperty,
	computeOutlineStyle,
	initialOutlineStyle,
	type OutlineStyle,
	type OutlineSpecifiedStyle,
	type CssOutlineProperty,
} from "./css-outline.js";
import {
	cssTextDecorationProperties,
	isCssTextDecorationProperty,
	computeTextDecorationStyle,
	initialTextDecorationStyle,
	type TextDecorationStyle,
	type TextDecorationSpecifiedStyle,
	type CssTextDecorationProperty,
} from "./css-text-decoration.js";
import {
	cssFlowProperties,
	computeFlowStyle,
	initialFlowStyle,
	isCssFlowProperty,
	type FlowStyle,
	type FlowSpecifiedStyle,
	type CssFlowProperty,
} from "./css-flow.js";
import { lengthUsesFont } from "./css-math.js";
import {
	type BoxFontMetrics,
	type BoxSpecifiedStyle,
	type BoxStyle,
	type CssBoxProperty,
	computeBoxStyle,
	cssBoxProperties,
	initialBoxStyle,
	isCssBoxProperty,
} from "./css-box.js";
import {
	type ClipStyle,
	type CssPaintProperty,
	type PaintSpecifiedStyle,
	type PaintStyle,
	computeClipStyle,
	computePaintStyle,
	cssPaintProperties,
	initialClipStyle,
	initialPaintStyle,
	isCssPaintProperty,
} from "./css-paint.js";
import {
	type CssDeclaration,
	type CssParseBudget,
	type CssProperty,
	type CssRule,
	type StyleViewport,
	cssMediaMatches,
	parseCssDeclarations,
	parseCssRules,
} from "./css-parser.js";
import {
	type CssTextProperty,
	type TextSpecifiedStyle,
	type TextStyle,
	computeTextStyle,
	cssTextProperties,
	initialTextStyle,
	isCssTextProperty,
} from "./css-text.js";
import { documentBaseUrl } from "./document-url.js";
import { bitmapFont } from "./bitmap-font.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { cssMediaLimits, type MediaViewport } from "./css-media.js";
import {
	type ColorSchemePreference,
	effectiveColorScheme,
	nativeColorScheme,
	validateColorSchemePreference,
} from "./native-color-scheme.js";
import {
	stylesheetSourceSize,
	type StylesheetSource,
} from "./stylesheet-imports.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { closedDetailsChild } from "./details.js";
import { summaryDetails } from "./details.js";
import {
	cssListProperties,
	computeListStyle,
	initialListStyle,
	type ListStyle,
} from "./css-list.js";
import { htmlListStyleType } from "./list-ordinals.js";
import {
	cssTableProperties,
	computeTableStyle,
	initialTableStyle,
	isCssTableProperty,
	type CssTableProperty,
	type TableStyle,
	type TableSpecifiedStyle,
} from "./css-table.js";
import { svgPresentationDeclarations } from "./svg-presentation.js";
import {
	cssVariableLimits,
	parseVariableValue,
	resolveCustomProperties,
	substituteVariables,
} from "./css-variables.js";
import {
	DocumentQueries,
	type SelectorSpecificity,
	compareSpecificity,
} from "./selectors.js";

export interface StyleLimits {
	maxCodeUnits: number;
	maxRules: number;
	maxDeclarations: number;
	maxWork: number;
	maxSheets: number;
}
export interface VisibilityStyle {
	display: string;
	unpositionedDisplay?: string;
	visibility: "visible" | "hidden" | "collapse";
	displayed: boolean;
	visible: boolean;
}
interface Winner {
	declaration: CssDeclaration;
	specificity: SelectorSpecificity;
	inline: boolean;
	order: number;
}
interface ExternalSheet {
	url: string;
	text: string;
	source?: Readonly<StylesheetSource>;
	baseUrl?: string;
	sheets: number;
	codeUnits: number;
}

const floatAdjustedDisplays = new Set([
	"inline-table",
	"inline",
	"inline-block",
	"table-row-group",
	"table-column",
	"table-column-group",
	"table-header-group",
	"table-footer-group",
	"table-row",
	"table-cell",
	"table-caption",
]);

const blockTags = new Set([
	"html",
	"body",
	"center",
	"div",
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"form",
	"fieldset",
	"pre",
	"blockquote",
	"ol",
	"ul",
	"dl",
	"dt",
	"dd",
	"figure",
	"figcaption",
	"address",
	"details",
	"summary",
	"hr",
]);
const hiddenTags = new Set([
	"head",
	"script",
	"style",
	"template",
	"link",
	"meta",
	"base",
	"title",
]);
const instances = new WeakMap<DocumentTree, DocumentStyles>();

function userAgentDisplay(
	node: Readonly<DocumentNode>,
	primarySummary = false,
) {
	if (node.kind === "element" && !isHtmlElement(node)) {
		const hidden =
			elementNamespace(node) === svgNamespace &&
			["script", "style"].includes(node.tagName);
		return hidden ? "none" : "inline";
	}
	if (
		hiddenTags.has(node.tagName) ||
		Object.hasOwn(node.attributes, "hidden") ||
		(isHtmlElement(node, "input") &&
			node.attributes.type?.toLowerCase() === "hidden")
	)
		return "none";
	if (node.tagName === "li") return "list-item";
	if (primarySummary) return "list-item";
	if (["input", "button", "textarea", "select"].includes(node.tagName))
		return "inline-block";
	if (node.tagName === "table") return "table";
	if (node.tagName === "tr") return "table-row";
	if (["td", "th"].includes(node.tagName)) return "table-cell";
	if (node.tagName === "tbody") return "table-row-group";
	if (node.tagName === "thead") return "table-header-group";
	if (node.tagName === "tfoot") return "table-footer-group";
	if (node.tagName === "caption") return "table-caption";
	if (node.tagName === "col") return "table-column";
	if (node.tagName === "colgroup") return "table-column-group";
	return blockTags.has(node.tagName) || node.kind === "document"
		? "block"
		: "inline";
}

function userAgentTableStyle(
	node: Readonly<DocumentNode>,
): TableSpecifiedStyle {
	if (!isHtmlElement(node)) return {};
	if (node.tagName === "table") return { "border-spacing": "2px" };
	if (["thead", "tbody", "tfoot"].includes(node.tagName))
		return { "vertical-align": "middle" };
	if (["tr", "td", "th"].includes(node.tagName))
		return { "vertical-align": "inherit" };
	return {};
}

function outranks(candidate: Winner, previous: Winner) {
	return (
		Number(candidate.declaration.important) -
			Number(previous.declaration.important) ||
		Number(candidate.inline) - Number(previous.inline) ||
		compareSpecificity(candidate.specificity, previous.specificity) ||
		candidate.order - previous.order
	);
}

export class DocumentStyles {
	readonly limits: Readonly<StyleLimits>;
	private viewportValue: Readonly<StyleViewport> = Object.freeze({
		width: 1280,
		height: 720,
	});
	private readonly viewportListeners = new Set<() => void>();
	private readonly mediaListeners = new Set<() => void>();
	private mediaEnvironmentValue: Readonly<MediaViewport> = Object.freeze({
		...this.viewportValue,
		colorSchemePreference: nativeColorScheme.preference,
	});
	private readonly queries: DocumentQueries;
	private readonly external = new Map<number, ExternalSheet>();
	private readonly loadIssues: Record<string, number> = Object.create(null);
	private readonly unregister: () => unknown;
	private computed = new Map<number, Readonly<VisibilityStyle>>();
	private boxSpecified = new Map<number, BoxSpecifiedStyle>();
	private boxComputed = new Map<number, BoxStyle>();
	private flexSpecified = new Map<number, FlexSpecifiedStyle>();
	private flexComputed = new Map<number, FlexStyle>();
	private gridSpecified = new Map<number, GridSpecifiedStyle>();
	private gridComputed = new Map<number, GridStyle>();
	private flowComputed = new Map<number, FlowStyle>();
	private pointerEventsNone = new Set<number>();
	private listComputed = new Map<number, ListStyle>();
	private tableSpecified = new Map<number, TableSpecifiedStyle>();
	private tableComputed = new Map<number, TableStyle>();
	private outlineSpecified = new Map<number, OutlineSpecifiedStyle>();
	private outlineComputed = new Map<number, OutlineStyle>();
	private textDecorationSpecified = new Map<
		number,
		TextDecorationSpecifiedStyle
	>();
	private textDecorationComputed = new Map<number, TextDecorationStyle>();
	private textSpecified = new Map<number, TextSpecifiedStyle>();
	private textComputed = new Map<number, TextStyle>();
	private legacyCentered = new Set<number>();
	private paintSpecified = new Map<number, PaintSpecifiedStyle>();
	private paintComputed = new Map<number, PaintStyle>();
	private clipComputed = new Map<number, ClipStyle>();
	private customComputed = new Map<
		number,
		ReadonlyMap<string, string | null>
	>();
	private revision = -1;
	private cascadeBuilds = 0;
	private closed = false;
	private info = {
		rules: 0,
		declarations: 0,
		work: 0,
		codeUnits: 0,
		issues: {} as Readonly<Record<string, number>>,
		applicableIssues: {} as Readonly<Record<string, number>>,
	};

	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<StyleLimits> = {},
	) {
		this.limits = Object.freeze({
			maxCodeUnits: 524_288,
			maxRules: 8192,
			maxDeclarations: 16_384,
			maxWork: 5_000_000,
			maxSheets: 32,
			...limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid style limit");
		this.queries = new DocumentQueries(tree, {
			maxIndexedNodes: tree.limits.maxNodes,
			maxResults: tree.limits.maxNodes,
			maxWork: this.limits.maxWork,
		});
		this.unregister = tree.onClose(() => this.close());
	}

	get viewport() {
		return this.viewportValue;
	}
	get colorSchemePreference(): ColorSchemePreference {
		return this.mediaEnvironmentValue.colorSchemePreference ?? null;
	}
	get mediaEnvironment() {
		return this.mediaEnvironmentValue;
	}
	setColorSchemePreference(preference: ColorSchemePreference) {
		this.ensureOpen();
		validateColorSchemePreference(preference);
		if (preference === this.colorSchemePreference) return;
		this.mediaEnvironmentValue = Object.freeze({
			...this.viewport,
			colorSchemePreference: preference,
		});
		this.tree.invalidatePresentation();
		for (const listener of [...this.mediaListeners]) listener();
	}
	onMediaChange(listener: () => void): () => void {
		this.ensureOpen();
		if (typeof listener !== "function")
			throw new TypeError("Expected a media listener");
		if (
			!this.mediaListeners.has(listener) &&
			this.viewportListeners.size + this.mediaListeners.size >= 16
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Media listener limit exceeded",
			);
		this.mediaListeners.add(listener);
		return () => {
			this.mediaListeners.delete(listener);
		};
	}
	onViewportChange(listener: () => void): () => void {
		this.ensureOpen();
		if (typeof listener !== "function")
			throw new TypeError("Expected a viewport listener");
		if (
			!this.viewportListeners.has(listener) &&
			this.viewportListeners.size + this.mediaListeners.size >= 16
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Viewport listener limit exceeded",
			);
		this.viewportListeners.add(listener);
		return () => {
			this.viewportListeners.delete(listener);
		};
	}
	setViewport(width: number, height: number) {
		this.ensureOpen();
		if (
			![width, height].every(
				(value) => Number.isSafeInteger(value) && value >= 1 && value <= 16_384,
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid CSS viewport");
		if (width === this.viewport.width && height === this.viewport.height)
			return;
		this.viewportValue = Object.freeze({ width, height });
		this.mediaEnvironmentValue = Object.freeze({
			...this.viewportValue,
			colorSchemePreference: this.colorSchemePreference,
		});
		this.tree.invalidatePresentation();
		for (const listener of [...this.viewportListeners]) listener();
		for (const listener of [...this.mediaListeners]) listener();
	}

	setExternalSheet(id: number, url: string, text: string) {
		this.storeSheet(id, url, text);
	}

	setStylesheetSource(
		id: number,
		url: string,
		source: Readonly<StylesheetSource>,
	) {
		stylesheetSourceSize(source);
		this.storeSheet(id, url, source.text, source);
	}

	private storeSheet(
		id: number,
		url: string,
		text: string,
		source?: Readonly<StylesheetSource>,
	) {
		this.ensureOpen();
		const inline = Boolean(source) && isHtmlElement(this.tree.get(id), "style");
		if (typeof url !== "string" || url.length > 16_384)
			throw new AgentBrowserError("invalid-input", "Invalid stylesheet URL");
		if (
			(!isHtmlElement(this.tree.get(id), "link") && !inline) ||
			typeof text !== "string" ||
			text.length > this.limits.maxCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Invalid or oversized external stylesheet",
			);
		const size = source
			? stylesheetSourceSize(source)
			: { sheets: 1, codeUnits: text.length };
		const sheets = [...this.external.entries()].reduce(
			(total, [key, sheet]) => total + (key === id ? 0 : sheet.sheets),
			size.sheets,
		);
		if (sheets > this.limits.maxSheets)
			throw new AgentBrowserError(
				"resource-limit",
				"External stylesheet count exceeded",
			);
		const total = [...this.external.entries()].reduce(
			(size, [key, sheet]) => size + (key === id ? 0 : sheet.codeUnits),
			size.codeUnits,
		);
		if (total > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"External stylesheet text limit exceeded",
			);
		this.external.set(id, {
			url,
			text,
			source,
			...size,
			baseUrl: inline ? url : undefined,
		});
		this.tree.invalidatePresentation();
	}

	noteLoadIssue(code: string) {
		this.ensureOpen();
		if (
			!/^[a-z-]{1,64}$/.test(code) ||
			(!Object.hasOwn(this.loadIssues, code) &&
				Object.keys(this.loadIssues).length >= 32)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid stylesheet diagnostic",
			);
		this.loadIssues[code] = (this.loadIssues[code] ?? 0) + 1;
		this.tree.invalidatePresentation();
	}

	get(id: number): Readonly<VisibilityStyle> {
		this.refresh();
		const value = this.computed.get(id);
		if (!value)
			throw new AgentBrowserError("not-found", "Style target is not connected");
		return value;
	}

	flow(id: number): FlowStyle {
		this.get(id);
		return this.flowComputed.get(id) ?? initialFlowStyle;
	}

	pointerEvents(id: number): PointerEventsStyle {
		this.get(id);
		return this.pointerEventsNone.has(id) ? "none" : "auto";
	}

	list(id: number): ListStyle {
		this.get(id);
		return this.listComputed.get(id) ?? initialListStyle;
	}

	table(id: number): TableStyle {
		this.get(id);
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.tableComputed.has(current)) {
			pending.push(current);
			current = this.tree.get(current).parent;
		}
		for (const target of pending.reverse()) {
			const node = this.tree.get(target);
			const specified = this.tableSpecified.get(target) ?? {};
			const defaults = userAgentTableStyle(node);
			const value = specified["border-spacing"];
			const spacing =
				(value === undefined || value === "revert"
					? defaults["border-spacing"]
					: value) ?? "";
			let fonts: BoxFontMetrics | undefined;
			if (lengthUsesFont(spacing, "em"))
				fonts = { fontSize: Number.parseFloat(this.text(target)["font-size"]) };
			if (lengthUsesFont(spacing, "ex")) {
				const text = this.text(target);
				fonts = {
					...fonts,
					xHeight: nativeFontXHeight(
						Number.parseFloat(text["font-size"]),
						Number(text["font-weight"]),
						text["font-family"],
					),
				};
			}
			if (lengthUsesFont(spacing, "rem")) {
				const root =
					this.tree
						.get(this.tree.root)
						.children.find(
							(child) => this.tree.get(child).kind === "element",
						) ?? this.tree.root;
				fonts = {
					...fonts,
					rootFontSize: Number.parseFloat(this.text(root)["font-size"]),
				};
			}
			this.tableComputed.set(
				target,
				computeTableStyle(
					specified,
					node.parent === null
						? initialTableStyle
						: (this.tableComputed.get(node.parent) ?? initialTableStyle),
					this.viewport,
					fonts,
					defaults,
				),
			);
		}
		return this.tableComputed.get(id) ?? initialTableStyle;
	}

	hasTextDecorations(): boolean {
		this.get(this.tree.root);
		for (const specified of this.textDecorationSpecified.values())
			if (
				/(?:^| )(?:underline|overline|line-through)(?: |$)/.test(
					specified["text-decoration-line"] ?? "",
				)
			)
				return true;
		return false;
	}

	textDecoration(id: number): TextDecorationStyle {
		this.get(id);
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.textDecorationComputed.has(current)) {
			pending.push(current);
			const specified = this.textDecorationSpecified.get(current);
			if (!specified || !Object.values(specified).includes("inherit")) break;
			const parent: number | null = this.tree.get(current).parent;
			current =
				parent !== null && this.tree.get(parent).kind === "element"
					? parent
					: null;
		}
		for (const target of pending.reverse()) {
			const parent = this.tree.get(target).parent;
			const color = this.paint(target).color;
			this.textDecorationComputed.set(
				target,
				computeTextDecorationStyle(
					this.textDecorationSpecified.get(target) ?? {},
					(parent === null
						? undefined
						: this.textDecorationComputed.get(parent)) ??
						computeTextDecorationStyle({}, initialTextDecorationStyle, color),
					color,
				),
			);
		}
		return this.textDecorationComputed.get(id) ?? initialTextDecorationStyle;
	}

	outline(id: number): OutlineStyle {
		this.get(id);
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.outlineComputed.has(current)) {
			pending.push(current);
			const specified = this.outlineSpecified.get(current);
			if (!specified || !Object.values(specified).includes("inherit")) break;
			current = this.tree.get(current).parent;
		}
		for (const target of pending.reverse()) {
			const parent = this.tree.get(target).parent;
			const specified = this.outlineSpecified.get(target) ?? {};
			const values = Object.values(specified);
			let fonts: BoxFontMetrics | undefined;
			if (values.some((value) => lengthUsesFont(value, "em")))
				fonts = { fontSize: Number.parseFloat(this.text(target)["font-size"]) };
			if (values.some((value) => lengthUsesFont(value, "ex"))) {
				const text = this.text(target);
				fonts = {
					...fonts,
					xHeight: nativeFontXHeight(
						Number.parseFloat(text["font-size"]),
						Number(text["font-weight"]),
						text["font-family"],
					),
				};
			}
			if (values.some((value) => lengthUsesFont(value, "rem"))) {
				const root =
					this.tree
						.get(this.tree.root)
						.children.find(
							(child) => this.tree.get(child).kind === "element",
						) ?? this.tree.root;
				fonts = {
					...fonts,
					rootFontSize: Number.parseFloat(this.text(root)["font-size"]),
				};
			}
			this.outlineComputed.set(
				target,
				computeOutlineStyle(
					specified,
					parent === null
						? initialOutlineStyle
						: (this.outlineComputed.get(parent) ?? initialOutlineStyle),
					this.viewport,
					fonts,
					this.paint(target).color,
				),
			);
		}
		return this.outlineComputed.get(id) ?? initialOutlineStyle;
	}

	flex(id: number): FlexStyle {
		this.get(id);
		const pending: number[] = [];
		let current = id;
		while (!this.flexComputed.has(current)) {
			const specified = this.flexSpecified.get(current);
			if (!specified) {
				this.flexComputed.set(current, initialFlexStyle);
				break;
			}
			pending.push(current);
			const parent = this.tree.get(current).parent;
			if (parent === null || !Object.values(specified).includes("inherit"))
				break;
			current = parent;
		}
		for (const target of pending.reverse()) {
			const specified = this.flexSpecified.get(target) ?? {};
			const parent = this.tree.get(target).parent;
			const values = Object.values(specified);
			let fonts: BoxFontMetrics | undefined;
			if (values.some((value) => lengthUsesFont(value, "em")))
				fonts = { fontSize: Number.parseFloat(this.text(target)["font-size"]) };
			if (values.some((value) => lengthUsesFont(value, "ex"))) {
				const text = this.text(target);
				fonts = {
					...fonts,
					xHeight: nativeFontXHeight(
						Number.parseFloat(text["font-size"]),
						Number(text["font-weight"]),
						text["font-family"],
					),
				};
			}
			if (values.some((value) => lengthUsesFont(value, "rem"))) {
				const root =
					this.tree
						.get(this.tree.root)
						.children.find(
							(child) => this.tree.get(child).kind === "element",
						) ?? this.tree.root;
				fonts = {
					...fonts,
					rootFontSize: Number.parseFloat(this.text(root)["font-size"]),
				};
			}
			this.flexComputed.set(
				target,
				computeFlexStyle(
					specified,
					parent === null
						? initialFlexStyle
						: (this.flexComputed.get(parent) ?? initialFlexStyle),
					this.viewport,
					fonts,
				),
			);
		}
		return this.flexComputed.get(id) ?? initialFlexStyle;
	}

	grid(id: number): GridStyle {
		this.get(id);
		const pending: number[] = [];
		let current = id;
		while (!this.gridComputed.has(current)) {
			const specified = this.gridSpecified.get(current);
			if (!specified) {
				this.gridComputed.set(current, initialGridStyle);
				break;
			}
			pending.push(current);
			const parent = this.tree.get(current).parent;
			if (parent === null || !Object.values(specified).includes("inherit"))
				break;
			current = parent;
		}
		for (const target of pending.reverse()) {
			const specified = this.gridSpecified.get(target) ?? {};
			const parent = this.tree.get(target).parent;
			const values = Object.values(specified);
			let fonts: BoxFontMetrics | undefined;
			if (values.some((value) => gridValueUsesFont(value, "em")))
				fonts = { fontSize: Number.parseFloat(this.text(target)["font-size"]) };
			if (values.some((value) => gridValueUsesFont(value, "ex"))) {
				const text = this.text(target);
				fonts = {
					...fonts,
					xHeight: nativeFontXHeight(
						Number.parseFloat(text["font-size"]),
						Number(text["font-weight"]),
						text["font-family"],
					),
				};
			}
			if (values.some((value) => gridValueUsesFont(value, "rem"))) {
				const root =
					this.tree
						.get(this.tree.root)
						.children.find(
							(child) => this.tree.get(child).kind === "element",
						) ?? this.tree.root;
				fonts = {
					...fonts,
					rootFontSize: Number.parseFloat(this.text(root)["font-size"]),
				};
			}
			this.gridComputed.set(
				target,
				computeGridStyle(
					specified,
					parent === null
						? initialGridStyle
						: (this.gridComputed.get(parent) ?? initialGridStyle),
					this.viewport,
					fonts,
				),
			);
		}
		return this.gridComputed.get(id) ?? initialGridStyle;
	}

	box(id: number): BoxStyle {
		this.get(id);
		const pending: number[] = [];
		let current = id;
		while (!this.boxComputed.has(current)) {
			const specified = this.boxSpecified.get(current);
			if (!specified) {
				this.boxComputed.set(current, initialBoxStyle);
				break;
			}
			pending.push(current);
			const parent = this.tree.get(current).parent;
			if (parent === null || !Object.values(specified).includes("inherit"))
				break;
			current = parent;
		}
		for (const target of pending.reverse()) {
			const parent = this.tree.get(target).parent;
			const specified = this.boxSpecified.get(target) ?? {};
			let fonts: BoxFontMetrics | undefined;
			const values = Object.values(specified);
			if (values.some((value) => lengthUsesFont(value, "em")))
				fonts = { fontSize: Number.parseFloat(this.text(target)["font-size"]) };
			if (values.some((value) => lengthUsesFont(value, "ex"))) {
				const text = this.text(target);
				fonts = {
					...fonts,
					xHeight: nativeFontXHeight(
						Number.parseFloat(text["font-size"]),
						Number(text["font-weight"]),
						text["font-family"],
					),
				};
			}
			if (values.some((value) => lengthUsesFont(value, "rem"))) {
				const rootElement = this.tree
					.get(this.tree.root)
					.children.find((child) => this.tree.get(child).kind === "element");
				fonts = {
					...fonts,
					rootFontSize: Number.parseFloat(
						this.text(rootElement ?? this.tree.root)["font-size"],
					),
				};
			}
			this.boxComputed.set(
				target,
				computeBoxStyle(
					specified,
					parent === null
						? initialBoxStyle
						: (this.boxComputed.get(parent) ?? initialBoxStyle),
					this.viewport,
					fonts,
				),
			);
		}
		return this.boxComputed.get(id) ?? initialBoxStyle;
	}

	legacyChildAlignment(id: number): "center" | undefined {
		this.get(id);
		return this.legacyCentered.has(id) ? "center" : undefined;
	}

	text(id: number): TextStyle {
		this.get(id);
		if (this.textComputed.has(id))
			return this.textComputed.get(id) as TextStyle;
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.textComputed.has(current)) {
			pending.push(current);
			current = this.tree.get(current).parent;
		}
		const rootElement = this.tree
			.get(this.tree.root)
			.children.find((child) => this.tree.get(child).kind === "element");
		for (const target of pending.reverse()) {
			const node = this.tree.get(target);
			const parent =
				node.parent === null
					? initialTextStyle
					: (this.textComputed.get(node.parent) ?? initialTextStyle);
			const rootFontSize = Number.parseFloat(
				(rootElement === undefined
					? initialTextStyle
					: (this.textComputed.get(rootElement) ?? initialTextStyle))[
					"font-size"
				],
			);
			this.textComputed.set(
				target,
				computeTextStyle(
					this.textSpecified.get(target) ?? {},
					parent,
					this.viewport,
					rootFontSize,
					node.kind === "element" && node.tagName === "pre",
					target === rootElement,
				),
			);
		}
		return this.textComputed.get(id) as TextStyle;
	}

	clip(id: number): ClipStyle {
		this.get(id);
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.clipComputed.has(current)) {
			if (pending.length >= this.tree.limits.maxNodes)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS clip ancestry limit exceeded",
				);
			pending.push(current);
			current = this.tree.get(current).parent;
		}
		for (const target of pending.reverse()) {
			const parent = this.tree.get(target).parent;
			this.clipComputed.set(
				target,
				computeClipStyle(
					this.paintSpecified.get(target) ?? {},
					parent === null
						? initialClipStyle
						: (this.clipComputed.get(parent) ?? initialClipStyle),
				),
			);
		}
		return this.clipComputed.get(id) as ClipStyle;
	}

	paint(id: number): PaintStyle {
		this.get(id);
		const pending: number[] = [];
		let current: number | null = id;
		while (current !== null && !this.paintComputed.has(current)) {
			pending.push(current);
			current = this.tree.get(current).parent;
		}
		for (const target of pending.reverse()) {
			const parent = this.tree.get(target).parent;
			this.paintComputed.set(
				target,
				computePaintStyle(
					this.paintSpecified.get(target) ?? {},
					parent === null
						? initialPaintStyle
						: (this.paintComputed.get(parent) ?? initialPaintStyle),
				),
			);
		}
		return this.paintComputed.get(id) as PaintStyle;
	}

	custom(id: number, name: string): string {
		this.refresh();
		const value = this.customComputed.get(id)?.get(name);
		return value === "" ? " " : (value ?? "");
	}
	customNames(id: number): readonly string[] {
		this.refresh();
		return [...(this.customComputed.get(id)?.entries() ?? [])]
			.filter(([, value]) => value !== null)
			.map(([name]) => name)
			.sort();
	}

	metrics() {
		this.refresh();
		return Object.freeze({
			partial: true,
			cascadeBuilds: this.cascadeBuilds,
			properties: Object.freeze(["display", "visibility"]),
			boxProperties: cssBoxProperties,
			flexProperties: cssFlexProperties,
			gridProperties: cssGridProperties,
			flowProperties: cssFlowProperties,
			interactionProperties: cssInteractionProperties,
			listProperties: cssListProperties,
			tableProperties: cssTableProperties,
			outlineProperties: cssOutlineProperties,
			textDecorationProperties: cssTextDecorationProperties,
			textProperties: cssTextProperties,
			textFont: bitmapFont.family,
			textFontWeights: bitmapFont.weights,
			paintProperties: cssPaintProperties,
			paintColorSpace: "srgb-8bit",
			customProperties: "unregistered-bounded-substitution",
			boxValues: "computed-subset-not-used-geometry",
			layout: false,
			viewport: this.viewport,
			colorScheme: Object.freeze({
				...nativeColorScheme,
				preference: this.colorSchemePreference,
				effective: effectiveColorScheme(this.colorSchemePreference),
			}),
			externalSheets: [...this.external.values()].filter(
				(sheet) => sheet.baseUrl === undefined,
			).length,
			importedSheets: [...this.external.values()].reduce(
				(total, sheet) => total + sheet.sheets - 1,
				0,
			),
			...this.info,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.viewportListeners.clear();
		this.mediaListeners.clear();
		this.external.clear();
		this.computed.clear();
		this.boxSpecified.clear();
		this.boxComputed.clear();
		this.flexSpecified.clear();
		this.flexComputed.clear();
		this.gridSpecified.clear();
		this.gridComputed.clear();
		this.flowComputed.clear();
		this.pointerEventsNone.clear();
		this.listComputed.clear();
		this.tableSpecified.clear();
		this.tableComputed.clear();
		this.outlineSpecified.clear();
		this.outlineComputed.clear();
		this.textDecorationSpecified.clear();
		this.textDecorationComputed.clear();
		this.textSpecified.clear();
		this.textComputed.clear();
		this.legacyCentered.clear();
		this.paintSpecified.clear();
		this.paintComputed.clear();
		this.clipComputed.clear();
		this.customComputed.clear();
		this.queries.close();
		this.unregister();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document styles are closed");
	}
	private refresh() {
		this.ensureOpen();
		if (this.revision === this.tree.revision) return;
		if (this.revision >= 0) {
			const journal = this.tree.changesSince(this.revision);
			const controlValueDependent =
				this.queries.metrics().controlValueDependent;
			if (
				!journal.reset &&
				journal.changes.every((change) => {
					if (change.kind === "style" && change.presentationOnly === true)
						return true;
					if (change.kind !== "control" || controlValueDependent) return false;
					const node = this.tree.get(change.target);
					return (
						node.tagName === "textarea" ||
						(isHtmlElement(node, "input") &&
							!["checkbox", "radio"].includes(
								node.attributes.type?.toLowerCase() ?? "text",
							))
					);
				})
			) {
				this.revision = this.tree.revision;
				return;
			}
		}
		this.revision = -1;
		this.computed.clear();
		this.boxSpecified.clear();
		this.boxComputed.clear();
		this.flexSpecified.clear();
		this.flexComputed.clear();
		this.gridSpecified.clear();
		this.gridComputed.clear();
		this.flowComputed.clear();
		this.pointerEventsNone.clear();
		this.listComputed.clear();
		this.tableSpecified.clear();
		this.tableComputed.clear();
		this.outlineSpecified.clear();
		this.outlineComputed.clear();
		this.textDecorationSpecified.clear();
		this.textDecorationComputed.clear();
		this.textSpecified.clear();
		this.textComputed.clear();
		this.legacyCentered.clear();
		this.paintSpecified.clear();
		this.paintComputed.clear();
		this.clipComputed.clear();
		this.customComputed.clear();
		const issues: Record<string, number> = { ...this.loadIssues };
		const applicableIssues: Record<string, number> = { ...this.loadIssues };
		const rawIssue = (code: string) => {
			issues[code] = (issues[code] ?? 0) + 1;
		};
		const issue = (code: string) => {
			rawIssue(code);
			applicableIssues[code] = (applicableIssues[code] ?? 0) + 1;
		};
		const budget: CssParseBudget = {
			rules: 0,
			declarations: 0,
			maxRules: this.limits.maxRules,
			maxDeclarations: this.limits.maxDeclarations,
		};
		let codeUnits = 0;
		let work = 0;
		let order = 0;
		const charge = (amount = 1) => {
			work += amount;
			if (work > this.limits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS cascade work limit exceeded",
				);
		};
		const source = (text: string) => {
			codeUnits += text.length;
			if (codeUnits > this.limits.maxCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS source text limit exceeded",
				);
			return text;
		};
		const winners = new Map<number, Map<CssProperty, Winner>>();
		const applicable = (
			diagnostics: Readonly<Record<string, number>> | undefined,
		) => {
			if (!diagnostics) return;
			for (const [code, count] of Object.entries(diagnostics)) {
				charge(1);
				applicableIssues[code] = (applicableIssues[code] ?? 0) + count;
			}
		};
		const mediaCache = new Map<
			string,
			{ matches: boolean; diagnostics: readonly string[] }
		>();
		const mediaApplicability = (media: readonly string[]) => {
			let matches = true;
			for (const query of media) {
				charge(1);
				let state = mediaCache.get(query);
				if (!state) {
					charge(query.length * (2 * cssMediaLimits.maxDepth + 8));
					const diagnostics: string[] = [];
					state = {
						matches: cssMediaMatches(query, this.mediaEnvironment, (code) =>
							diagnostics.push(code),
						),
						diagnostics,
					};
					mediaCache.set(query, state);
				}
				for (const code of state.diagnostics) issue(code);
				matches &&= state.matches;
				if (!state.matches && !state.diagnostics.length)
					return { matches: false, possible: false };
			}
			return { matches, possible: true };
		};
		const parseSheet = (
			text: string,
			graph: Readonly<StylesheetSource> | undefined,
			media: string[],
			depth = 0,
		): CssRule[] => {
			const imports = new Map(
				graph?.imports.map((entry) => [entry.start, entry]),
			);
			return parseCssRules(
				source(text),
				budget,
				rawIssue,
				media,
				depth,
				(start, inherited, nesting) => {
					const entry = imports.get(start);
					if (!entry) return undefined;
					if (entry.cycle) return [];
					if (!entry.sheet) return undefined;
					charge(1);
					return parseSheet(
						entry.sheet.text,
						entry.sheet,
						entry.media ? [...inherited, entry.media] : [...inherited],
						nesting + 1,
					);
				},
				(diagnostics, inherited) => {
					if (mediaApplicability(inherited).possible) applicable(diagnostics);
				},
			);
		};
		const nodes = [...this.tree.walk()].map((entry) => entry.node);
		const apply = (
			id: number,
			declarations: CssDeclaration[],
			specificity: SelectorSpecificity,
			inline: boolean,
			baseOrder: number,
		) => {
			let properties = winners.get(id);
			if (!properties) {
				properties = new Map();
				winners.set(id, properties);
			}
			for (let index = 0; index < declarations.length; index++) {
				const declaration = declarations[index];
				const candidate: Winner = {
					declaration,
					specificity,
					inline,
					order: baseOrder + index,
				};
				const previous = properties.get(declaration.property);
				if (!previous || outranks(candidate, previous) >= 0)
					properties.set(declaration.property, candidate);
			}
		};
		const cellPaddingByTable = new Map<number, string>();
		for (const node of nodes) {
			if (supportsTextAlignmentHint(node)) {
				const raw = node.attributes.align;
				if (raw !== undefined) charge(raw.length + 1);
				const alignment = htmlTextAlignment(node);
				if (alignment !== undefined)
					apply(
						node.id,
						[{ property: "text-align", value: alignment, important: false }],
						[0, 0, 0],
						false,
						-2,
					);
			}
			if (isHtmlElement(node, "table")) {
				const raw = node.attributes.cellspacing;
				if (raw !== undefined) charge(raw.length + 1);
				const spacing = htmlPixelLength(raw);
				if (spacing !== undefined)
					apply(
						node.id,
						[{ property: "border-spacing", value: spacing, important: false }],
						[0, 0, 0],
						false,
						-2,
					);
			}
			if (supportsCellPaddingHint(node)) {
				const raw = node.attributes.cellpadding;
				if (raw !== undefined) charge(raw.length + 1);
				const padding = cellPaddingLength(raw);
				if (padding !== undefined) cellPaddingByTable.set(node.id, padding);
			}
			if (cellPaddingByTable.size) {
				const owner = cellPaddingOwner(this.tree, node, charge);
				const padding =
					owner === undefined ? undefined : cellPaddingByTable.get(owner);
				if (padding !== undefined) {
					for (const side of ["top", "right", "bottom", "left"] as const) {
						charge(1);
						apply(
							node.id,
							[
								{
									property: `padding-${side}`,
									value: padding,
									important: false,
								},
							],
							[0, 0, 0],
							false,
							-2,
						);
					}
				}
			}
			if (supportsBackgroundColorHint(node)) {
				const raw = node.attributes.bgcolor;
				if (raw !== undefined) charge(raw.length + 1);
				const color = legacyColor(raw);
				if (color !== undefined)
					apply(
						node.id,
						[
							{
								property: "background-color",
								value: color,
								important: false,
							},
						],
						[0, 0, 0],
						false,
						-2,
					);
			}
			if (elementNamespace(node) === svgNamespace) {
				for (const declaration of svgPresentationDeclarations(node, charge))
					apply(node.id, [declaration], [0, 0, 0], false, -2);
			}
			if (supportsImageBorderHint(node)) {
				const raw = node.attributes.border;
				if (raw !== undefined) charge(raw.length + 1);
				const width = imageBorderWidth(raw);
				if (width !== undefined) {
					for (const side of ["top", "right", "bottom", "left"] as const) {
						apply(
							node.id,
							[
								{
									property: `border-${side}-width`,
									value: width,
									important: false,
								},
								{
									property: `border-${side}-style`,
									value: "solid",
									important: false,
								},
							],
							[0, 0, 0],
							false,
							-2,
						);
					}
				}
			}
			if (!isHtmlElement(node, "img")) continue;
			for (const property of ["width", "height"] as const) {
				const raw = node.attributes[property];
				if (raw !== undefined) charge(raw.length + 1);
				const value = imageDimensionHint(raw);
				if (value !== undefined)
					apply(
						node.id,
						[{ property, value, important: false }],
						[0, 0, 0],
						false,
						-2,
					);
			}
		}
		for (const node of nodes) {
			let text: string | undefined;
			let graph: Readonly<StylesheetSource> | undefined;
			if (
				node.tagName === "style" &&
				(isHtmlElement(node) || elementNamespace(node) === svgNamespace) &&
				(!node.attributes.type ||
					node.attributes.type.trim().toLowerCase() === "text/css")
			) {
				text = this.tree.textContent(node.id);
				const sheet = this.external.get(node.id);
				if (sheet?.source) {
					if (
						sheet.text === text &&
						sheet.baseUrl === documentBaseUrl(this.tree)
					)
						graph = sheet.source;
					else issue("changed-stylesheet-needs-reload");
				}
			}
			if (
				isHtmlElement(node, "link") &&
				!Object.hasOwn(node.attributes, "disabled") &&
				(!node.attributes.type ||
					node.attributes.type.trim().toLowerCase() === "text/css")
			) {
				const rel =
					node.attributes.rel?.toLowerCase().split(/[\t\n\f\r ]+/) ?? [];
				if (rel.includes("stylesheet") && !rel.includes("alternate")) {
					const sheet = this.external.get(node.id);
					if (sheet) {
						try {
							if (
								new URL(node.attributes.href ?? "", documentBaseUrl(this.tree))
									.href === sheet.url
							) {
								text = sheet.text;
								graph = sheet.source;
							} else issue("changed-stylesheet-needs-reload");
						} catch {
							issue("invalid-stylesheet-url");
						}
					} else issue("external-stylesheet-not-loaded");
				}
			}
			if (text === undefined) continue;
			const rules = parseSheet(
				text,
				graph,
				node.attributes.media ? [node.attributes.media] : [],
			);
			for (const rule of rules) {
				if (rule.declarations.length === 0 && !rule.issues) continue;
				const baseOrder = order;
				order += rule.declarations.length;
				const media = mediaApplicability(rule.media);
				if (!media.possible || (!media.matches && !rule.issues)) continue;
				if (work >= this.limits.maxWork)
					throw new AgentBrowserError(
						"resource-limit",
						"CSS cascade work limit exceeded",
					);
				let matches: ReadonlyMap<number, SelectorSpecificity>;
				try {
					matches = this.queries.matchingSpecificities(
						rule.selector,
						this.limits.maxWork - work,
					);
				} catch (error) {
					if (
						error instanceof AgentBrowserError &&
						error.code === "resource-limit"
					)
						throw error;
					issue("unimplemented-or-invalid-css-selector");
					applicable(rule.issues);
					continue;
				}
				charge(this.queries.metrics().lastWork);
				if (matches.size) applicable(rule.issues);
				if (!media.matches) continue;
				charge(matches.size * rule.declarations.length);
				for (const [id, specificity] of matches)
					apply(id, rule.declarations, specificity, false, baseOrder);
			}
		}
		for (const node of nodes) {
			if (node.kind !== "element") continue;
			const owned = this.tree.getInlineDeclarations(node.id);
			if (!node.attributes.style && !owned) continue;
			const parsed = new Map<string, CssDeclaration[]>();
			const declarations = owned
				? owned.flatMap((entry) => {
						const key = JSON.stringify([
							entry.pending ?? entry.name,
							entry.value,
							entry.important,
						]);
						let values = parsed.get(key);
						if (!values) {
							values = parseCssDeclarations(
								source(
									`${entry.pending ?? entry.name}:${entry.value}${entry.important ? "!important" : ""}`,
								),
								budget,
								issue,
							);
							parsed.set(key, values);
						}
						return values.filter(
							(declaration) =>
								!entry.pending || declaration.property === entry.name,
						);
					})
				: parseCssDeclarations(source(node.attributes.style), budget, issue);
			charge(declarations.length);
			apply(node.id, declarations, [0, 0, 0], true, order);
			order += declarations.length;
		}
		const customComputed = new Map<
			number,
			ReadonlyMap<string, string | null>
		>();
		const emptyCustom = new Map<string, string | null>();
		let unchangedCustom:
			| {
					parent: ReadonlyMap<string, string | null>;
					declarations: readonly CssDeclaration[];
			  }
			| undefined;
		let retainedBindings = 0;
		let retainedCodeUnits = 0;
		for (const node of nodes) {
			const properties = winners.get(node.id);
			const specified = new Map<string, string>();
			const customDeclarations: CssDeclaration[] = [];
			for (const [name, winner] of properties ?? []) {
				charge(1);
				if (name.startsWith("--")) {
					specified.set(name, winner.declaration.value);
					customDeclarations.push(winner.declaration);
				}
			}
			const parent =
				node.parent === null
					? emptyCustom
					: (customComputed.get(node.parent) ?? emptyCustom);
			const unchanged =
				unchangedCustom?.parent === parent &&
				unchangedCustom.declarations.length === customDeclarations.length &&
				customDeclarations.every((declaration, index) => {
					charge(1);
					return declaration === unchangedCustom?.declarations[index];
				});
			const values = unchanged
				? parent
				: resolveCustomProperties(specified, parent, charge);
			if (specified.size && values === parent)
				unchangedCustom = { parent, declarations: customDeclarations };
			if (values !== parent) {
				retainedBindings += values.size;
				for (const [name, value] of values)
					retainedCodeUnits += name.length + (value?.length ?? 0);
				if (
					retainedBindings > cssVariableLimits.maxRetainedBindings ||
					retainedCodeUnits > cssVariableLimits.maxRetainedCodeUnits
				)
					throw new AgentBrowserError(
						"resource-limit",
						"CSS variable retention limit exceeded",
					);
			}
			customComputed.set(node.id, values);
			for (const [name, winner] of properties ?? []) {
				const original = winner.declaration;
				if (!original.substitution) continue;
				const parsed = parseVariableValue(original.value, charge);
				const substituted = parsed
					? substituteVariables(
							parsed,
							(key) => values.get(key) ?? null,
							charge,
						)
					: null;
				const resolved =
					substituted === null
						? undefined
						: parseCssDeclarations(
								`${original.substitution}:${substituted}`,
								{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
								() => {},
							).find(
								(declaration) =>
									declaration.property === name && !declaration.substitution,
							);
				winner.declaration = {
					property: name,
					value: resolved?.value ?? "unset",
					important: original.important,
				};
			}
		}
		const boxSpecified = new Map<number, BoxSpecifiedStyle>();
		const flexSpecified = new Map<number, FlexSpecifiedStyle>();
		const gridSpecified = new Map<number, GridSpecifiedStyle>();
		const flowSpecified = new Map<number, FlowSpecifiedStyle>();
		const tableSpecified = new Map<number, TableSpecifiedStyle>();
		const textSpecified = new Map<number, TextSpecifiedStyle>();
		const paintSpecified = new Map<number, PaintSpecifiedStyle>();
		const outlineSpecified = new Map<number, OutlineSpecifiedStyle>();
		const textDecorationSpecified = new Map<
			number,
			TextDecorationSpecifiedStyle
		>();
		for (const [id, properties] of winners) {
			const specified: Partial<Record<CssBoxProperty, string>> = {};
			const flexValues: Partial<Record<CssFlexProperty, string>> = {};
			const gridValues: Partial<Record<CssGridProperty, string>> = {};
			const flowValues: Partial<Record<CssFlowProperty, string>> = {};
			const tableValues: Partial<Record<CssTableProperty, string>> = {};
			const textValues: Partial<Record<CssTextProperty, string>> = {};
			const paintValues: Partial<Record<CssPaintProperty, string>> = {};
			const outlineValues: Partial<Record<CssOutlineProperty, string>> = {};
			const textDecorationValues: Partial<
				Record<CssTextDecorationProperty, string>
			> = {};
			for (const [property, winner] of properties) {
				charge(1);
				if (isCssOutlineProperty(property))
					outlineValues[property] = winner.declaration.value;
				if (isCssTextDecorationProperty(property))
					textDecorationValues[property] = winner.declaration.value;
				if (isCssBoxProperty(property))
					specified[property] = winner.declaration.value;
				if (isCssFlexProperty(property))
					flexValues[property] = winner.declaration.value;
				if (isCssGridProperty(property))
					gridValues[property] = winner.declaration.value;
				if (isCssFlowProperty(property))
					flowValues[property] = winner.declaration.value;
				if (isCssTableProperty(property))
					tableValues[property] = winner.declaration.value;
				if (isCssTextProperty(property))
					textValues[property] = winner.declaration.value;
				if (isCssPaintProperty(property))
					paintValues[property] = winner.declaration.value;
			}
			if (Object.keys(specified).length)
				boxSpecified.set(id, Object.freeze(specified));
			if (Object.keys(flexValues).length)
				flexSpecified.set(id, Object.freeze(flexValues));
			if (Object.keys(gridValues).length)
				gridSpecified.set(id, Object.freeze(gridValues));
			if (Object.keys(flowValues).length)
				flowSpecified.set(id, Object.freeze(flowValues));
			if (Object.keys(tableValues).length)
				tableSpecified.set(id, Object.freeze(tableValues));
			if (Object.keys(textValues).length)
				textSpecified.set(id, Object.freeze(textValues));
			if (Object.keys(paintValues).length)
				paintSpecified.set(id, Object.freeze(paintValues));
			if (Object.keys(outlineValues).length)
				outlineSpecified.set(id, Object.freeze(outlineValues));
			if (Object.keys(textDecorationValues).length)
				textDecorationSpecified.set(id, Object.freeze(textDecorationValues));
		}
		const computed = new Map<number, Readonly<VisibilityStyle>>();
		const boxParentDisplay = new Map<number, string>();
		const flowComputed = new Map<number, FlowStyle>();
		const pointerEventsNone = new Set<number>();
		const listComputed = new Map<number, ListStyle>();
		const legacyCentered = new Set<number>();
		for (const node of nodes) {
			charge(1);
			const textAlign = textSpecified.get(node.id)?.["text-align"];
			if (
				isHtmlElement(node, "center") &&
				(textAlign === undefined || textAlign === "revert")
			) {
				textSpecified.set(
					node.id,
					Object.freeze({
						...textSpecified.get(node.id),
						"text-align": "center",
					}),
				);
				legacyCentered.add(node.id);
			} else if (
				(textAlign === undefined ||
					["inherit", "unset", "revert"].includes(textAlign)) &&
				node.parent !== null &&
				legacyCentered.has(node.parent)
			)
				legacyCentered.add(node.id);
			if (isHtmlElement(node, "td") || isHtmlElement(node, "th")) {
				const specified = { ...boxSpecified.get(node.id) };
				for (const property of [
					"padding-top",
					"padding-right",
					"padding-bottom",
					"padding-left",
				] as const) {
					charge(1);
					if (
						specified[property] === undefined ||
						specified[property] === "revert"
					)
						specified[property] = "1px";
				}
				boxSpecified.set(node.id, Object.freeze(specified));
				if (node.tagName === "th") {
					charge(1);
					const text = textSpecified.get(node.id) ?? {};
					if (
						text["text-align"] === undefined ||
						text["text-align"] === "revert"
					)
						textSpecified.set(
							node.id,
							Object.freeze({ ...text, "text-align": "center" }),
						);
				}
			}
			const parent =
				node.parent === null ? undefined : computed.get(node.parent);
			const properties = winners.get(node.id);
			const details = summaryDetails(this.tree, node);
			const listType = htmlListStyleType(node);
			charge(cssListProperties.length);
			listComputed.set(
				node.id,
				computeListStyle(
					{
						"list-style-type":
							properties?.get("list-style-type")?.declaration.value,
						"list-style-position": properties?.get("list-style-position")
							?.declaration.value,
						"list-style-image":
							properties?.get("list-style-image")?.declaration.value,
					},
					node.parent === null
						? initialListStyle
						: (listComputed.get(node.parent) ?? initialListStyle),
					details === undefined
						? listType === undefined
							? {}
							: { "list-style-type": listType }
						: {
								"list-style-type": Object.hasOwn(
									this.tree.get(details).attributes,
									"open",
								)
									? "disclosure-open"
									: "disclosure-closed",
								"list-style-position": "inside",
							},
				),
			);
			let display =
				properties?.get("display")?.declaration.value ??
				userAgentDisplay(node, details !== undefined);
			if (display === "inherit") display = parent?.display ?? "inline";
			else if (display === "initial" || display === "unset") display = "inline";
			else if (display === "revert")
				display = userAgentDisplay(node, details !== undefined);
			if (
				(isHtmlElement(node, "input") &&
					node.attributes.type?.toLowerCase() === "hidden") ||
				(isHtmlElement(node, "noscript") && htmlScriptingEnabled(this.tree))
			)
				display = "none";
			const parentDisplay =
				node.parent === null ? "" : (boxParentDisplay.get(node.parent) ?? "");
			const flowValues = flowSpecified.get(node.id);
			if (flowValues) {
				charge(cssFlowProperties.length);
				const computedFlow = computeFlowStyle(
					flowValues,
					node.parent === null
						? initialFlowStyle
						: (flowComputed.get(node.parent) ?? initialFlowStyle),
				);
				const positionedBox =
					display !== "none" &&
					display !== "contents" &&
					(computedFlow.position === "absolute" ||
						computedFlow.position === "fixed");
				flowComputed.set(
					node.id,
					positionedBox && computedFlow.float !== "none"
						? Object.freeze({ ...computedFlow, float: "none" })
						: computedFlow,
				);
			}
			const position = flowComputed.get(node.id)?.position;
			const item = isFlexDisplay(parentDisplay) || isGridDisplay(parentDisplay);
			const unpositionedDisplay = item ? blockifyDisplay(display) : display;
			if (
				node.kind === "element" &&
				(item || position === "absolute" || position === "fixed")
			)
				display = blockifyDisplay(display);
			else if (
				node.kind === "element" &&
				(flowComputed.get(node.id)?.float ?? "none") !== "none" &&
				floatAdjustedDisplays.has(display)
			)
				display = blockifyDisplay(display);
			boxParentDisplay.set(
				node.id,
				display === "contents" ? parentDisplay : display,
			);
			let visibility =
				properties?.get("visibility")?.declaration.value ?? "inherit";
			if (["inherit", "unset", "revert"].includes(visibility))
				visibility = parent?.visibility ?? "visible";
			else if (visibility === "initial") visibility = "visible";
			const displayed =
				(parent?.displayed ?? true) &&
				display !== "none" &&
				!closedDetailsChild(this.tree, node, charge);
			charge(1);
			if (
				computePointerEvents(
					properties?.get("pointer-events")?.declaration.value,
					node.parent !== null && pointerEventsNone.has(node.parent)
						? "none"
						: "auto",
				) === "none"
			)
				pointerEventsNone.add(node.id);
			computed.set(
				node.id,
				Object.freeze({
					display,
					...(position === "absolute" || position === "fixed"
						? { unpositionedDisplay }
						: {}),
					visibility: visibility as VisibilityStyle["visibility"],
					displayed,
					visible: displayed && visibility === "visible",
				}),
			);
		}
		this.computed = computed;
		this.boxSpecified = boxSpecified;
		this.flexSpecified = flexSpecified;
		this.gridSpecified = gridSpecified;
		this.flowComputed = flowComputed;
		this.pointerEventsNone = pointerEventsNone;
		this.listComputed = listComputed;
		this.tableSpecified = tableSpecified;
		this.textSpecified = textSpecified;
		this.legacyCentered = legacyCentered;
		this.paintSpecified = paintSpecified;
		this.outlineSpecified = outlineSpecified;
		this.textDecorationSpecified = textDecorationSpecified;
		this.customComputed = customComputed;
		this.info = {
			rules: budget.rules,
			declarations: budget.declarations,
			codeUnits,
			work,
			issues: Object.freeze(issues),
			applicableIssues: Object.freeze(applicableIssues),
		};
		this.cascadeBuilds++;
		this.revision = this.tree.revision;
	}
}

export function documentStyles(tree: DocumentTree) {
	let styles = instances.get(tree);
	if (!styles) {
		styles = new DocumentStyles(tree);
		instances.set(tree, styles);
		tree.onClose(() => instances.delete(tree));
	}
	return styles;
}
