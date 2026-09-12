import { initialBoxStyle } from "./css-box.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutPageDocument } from "./flex-document.js";
import type {
	FormattingBlockWidth,
	FormattingNode,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { resolveHeightConstraints } from "./replaced-box.js";
import type { OutsideMarker } from "./outside-markers.js";
import type { CollapsedTableBorderPaint } from "./table-collapsed-raster.js";
import type {
	DocumentTextLayout,
	TextContext,
	TextGlyph,
	TextLayoutOptions,
} from "./text-layout.js";

export interface MarginStrut {
	readonly positive: number;
	readonly negative: number;
	readonly value: number;
}
export interface DocumentBox extends FormattingBlockWidth {
	collapsedTableBorders?: readonly CollapsedTableBorderPaint[];
	flexBaselines?: Readonly<{
		first: number | null;
		last: number | null;
		unsupported: boolean;
	}>;
	borderTop: number;
	borderBottom: number;
	containingHeight: number | null;
	preferredHeight: number | null;
	minimumHeight: number;
	maximumHeight: number | null;
	definiteHeight: number | null;
	marginTop: number;
	marginBottom: number;
	paddingTop: number;
	paddingBottom: number;
	naturalContentHeight: number;
	contentHeight: number;
	borderBoxHeight: number;
	borderY: number;
	contentY: number;
	heightClampedBy: "none" | "min-height" | "max-height";
	marginCollapse: Readonly<{
		top: MarginStrut;
		bottom: MarginStrut;
		through: boolean;
		withFirstChild: boolean;
		withLastChild: boolean;
	}>;
}
export interface PositionedTextContext extends TextContext {
	readonly contentY: number;
}
export interface DocumentLayout {
	stage: "normal-flow-document-layout" | "isolated-block-layout";
	partial: true;
	text: DocumentTextLayout;
	boxes: readonly Readonly<DocumentBox>[];
	contexts: readonly Readonly<PositionedTextContext>[];
	flowHeight: number;
	outsideMarkers?: readonly Readonly<OutsideMarker>[];
	fixedIds?: readonly number[];
	positionedInsets?: readonly Readonly<{
		id: number;
		left: number;
		right: number;
		top: number;
		bottom: number;
	}>[];
	relativePositions?: readonly Readonly<{
		id: number;
		left: number;
		top: number;
	}>[];
	metrics: Readonly<{
		work: number;
		boxes: number;
		glyphs: number;
		lines: number;
	}>;
}
export const documentLayoutLimits = Object.freeze({ maxWork: 2_000_000 });
export interface DocumentLayoutOptions {
	maxWork?: number;
	text?: TextLayoutOptions;
}

function positionedGlyphReader(state: {
	source?: readonly Readonly<TextGlyph>[];
	contentY: number;
	result?: readonly Readonly<TextGlyph>[];
}) {
	return () => {
		if (!state.result) {
			const source = state.source as readonly Readonly<TextGlyph>[];
			state.result = Object.freeze(
				source.map((glyph) =>
					Object.freeze({
						...glyph,
						y: layoutNumber(state.contentY + glyph.y, true),
					}),
				),
			);
			state.source = undefined;
		}
		return state.result;
	};
}

interface State {
	borderTop: number;
	borderBottom: number;
	width: Readonly<FormattingBlockWidth>;
	node: Readonly<FormattingNode>;
	children: State[];
	containingHeight: number | null;
	preferred: number | null;
	minimum: number;
	maximum: number | null;
	definite: number | null;
	marginTop: number;
	marginBottom: number;
	paddingTop: number;
	paddingBottom: number;
	top: MarginStrut;
	bottom: MarginStrut;
	beforeBottom: MarginStrut;
	through: boolean;
	topEscape: boolean;
	bottomEscape: boolean;
	natural: number;
	height: number;
	borderHeight: number;
	clampedBy: DocumentBox["heightClampedBy"];
	relativeY: number;
	borderY: number;
	contentY: number;
}
export interface DocumentFlowFrame {
	node: Readonly<FormattingNode>;
	width: Readonly<FormattingBlockWidth>;
	borderY: number;
	contentY: number;
	marginTop: number;
	marginBottom: number;
	borderBoxHeight: number;
	naturalContentHeight: number;
}
export interface DocumentFlowCoordinator {
	work(): number;
	enterBlock(frame: Readonly<DocumentFlowFrame>): void;
	layoutText(
		context: Readonly<TextContext>,
		frame: Readonly<DocumentFlowFrame>,
		remainingWork: number,
	): Readonly<{
		context: Readonly<TextContext>;
		metrics: DocumentTextLayout["metrics"];
	}>;
	naturalHeight(frame: Readonly<DocumentFlowFrame>): number;
	positionBlock(frame: Readonly<DocumentFlowFrame>): number;
	finishBlock(frame: Readonly<DocumentFlowFrame>): void;
}
const zero: MarginStrut = Object.freeze({ positive: 0, negative: 0, value: 0 });
function margin(value: number): MarginStrut {
	return value === 0
		? zero
		: Object.freeze({
				positive: Math.max(0, value),
				negative: Math.min(0, value),
				value,
			});
}
function merge(first: MarginStrut, second: MarginStrut): MarginStrut {
	const positive = Math.max(first.positive, second.positive);
	const negative = Math.min(first.negative, second.negative);
	return Object.freeze({
		positive,
		negative,
		value: layoutNumber(positive + negative, true),
	});
}
function clamp(value: number, minimum: number, maximum: number | null) {
	let height = value;
	let clampedBy: DocumentBox["heightClampedBy"] = "none";
	if (maximum !== null && height > maximum) {
		height = maximum;
		clampedBy = "max-height";
	}
	if (height < minimum) {
		height = minimum;
		clampedBy = "min-height";
	}
	return { height, clampedBy };
}

export function layoutDocument(
	tree: DocumentTree,
	options: DocumentLayoutOptions = {},
): Readonly<DocumentLayout> {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["text", "maxWork"].includes(key))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document layout options",
		);
	const maxWork =
		options.maxWork === undefined
			? documentLayoutLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > documentLayoutLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document layout work limit",
		);
	return layoutPageDocument(tree, maxWork, options.text);
}

export function layoutFormattingDocument(
	text: Readonly<DocumentTextLayout>,
	maxWork: number = documentLayoutLimits.maxWork,
	isolated = false,
	flexSizes: ReadonlyMap<
		number,
		Readonly<{ naturalContentHeight: number }>
	> = new Map(),
	coordinator?: DocumentFlowCoordinator,
): Readonly<DocumentLayout> {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > documentLayoutLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid block layout work limit",
		);
	let work = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Document layout work limit exceeded",
			);
	};
	const formatting = text.horizontal.formatting;
	const contextsById = new Map(
		text.contexts.map((context) => {
			charge();
			return [context.id, context] as const;
		}),
	);
	const states = new Map<number, State>();
	const images = new Map(
		text.horizontal.images.map((image) => [image.id, image]),
	);
	const roots: State[] = [];
	for (const width of text.horizontal.widths) {
		charge();
		const node = formatting.nodes[width.id];
		const parent = states.get(width.containingBlock);
		const containingHeight = width.containingHeight;
		const style = node.box ?? initialBoxStyle;
		const resolvedHeight = resolveHeightConstraints(
			style,
			width.containingWidth,
			containingHeight,
		);
		const constraints = width.intrinsicHeight
			? {
					...resolvedHeight,
					preferred: null,
					minimum: 0,
					maximum: null,
					definite: null,
				}
			: resolvedHeight;
		const {
			paddingTop,
			paddingBottom,
			borderTop,
			borderBottom,
			minimum,
			maximum,
		} = constraints;
		const preferred =
			width.contentHeightOverride ??
			images.get(node.id)?.contentHeight ??
			constraints.preferred;
		const state: State = {
			borderTop,
			borderBottom,
			width,
			node,
			children: [],
			containingHeight,
			preferred,
			minimum,
			maximum,
			definite:
				width.intrinsicHeight ||
				width.contentHeightDefinite === false ||
				preferred === null
					? null
					: clamp(preferred, minimum, maximum).height,
			marginTop:
				style["margin-top"] === "auto"
					? 0
					: resolveLayoutLength(
							style["margin-top"],
							width.containingWidth,
							true,
						),
			marginBottom:
				style["margin-bottom"] === "auto"
					? 0
					: resolveLayoutLength(
							style["margin-bottom"],
							width.containingWidth,
							true,
						),
			paddingTop,
			paddingBottom,
			top: zero,
			bottom: zero,
			beforeBottom: zero,
			through: false,
			topEscape: false,
			bottomEscape: false,
			natural: 0,
			height: 0,
			borderHeight: 0,
			clampedBy: "none",
			relativeY: 0,
			borderY: 0,
			contentY: 0,
		};
		states.set(width.id, state);
		(parent?.children ?? roots).push(state);
	}
	const flow = (
		children: readonly State[],
		topEscape: boolean,
		bottomEscape: boolean,
		visit?: (child: State) => void,
	) => {
		let cursor = 0;
		let pending = zero;
		let leading = true;
		for (const child of children) {
			charge();
			if (child.through) {
				child.relativeY =
					topEscape && leading
						? 0
						: layoutNumber(
								cursor + merge(pending, child.beforeBottom).value,
								true,
							);
				visit?.(child);
				pending = merge(pending, child.top);
			} else {
				child.relativeY =
					topEscape && leading
						? 0
						: layoutNumber(cursor + merge(pending, child.top).value, true);
				visit?.(child);
				cursor = layoutNumber(child.relativeY + child.borderHeight, true);
				pending = child.bottom;
				leading = false;
			}
		}
		return layoutNumber(
			Math.max(
				0,
				cursor + (bottomEscape || (topEscape && leading) ? 0 : pending.value),
			),
		);
	};
	for (const state of [...states.values()].reverse()) {
		charge();
		const context = contextsById.get(state.width.id);
		const hasLines = (context?.lines.length ?? 0) > 0;
		const allThrough = state.children.every((child) => {
			charge();
			return child.through;
		});
		const independent = !!state.node.independentContext;
		state.topEscape =
			!independent &&
			state.paddingTop === 0 &&
			state.borderTop === 0 &&
			state.children.length > 0;
		state.bottomEscape =
			!independent &&
			state.paddingBottom === 0 &&
			state.borderBottom === 0 &&
			state.preferred === null &&
			state.children.length > 0 &&
			!(state.minimum > 0 && state.topEscape && allThrough);
		state.through =
			state.node.kind !== "replaced" &&
			!independent &&
			state.paddingTop === 0 &&
			state.borderTop === 0 &&
			state.borderBottom === 0 &&
			state.paddingBottom === 0 &&
			state.minimum === 0 &&
			(state.preferred === null || state.preferred === 0) &&
			!hasLines &&
			allThrough;
		state.top = margin(state.marginTop);
		if (state.topEscape)
			for (const child of state.children) {
				charge();
				state.top = merge(state.top, child.top);
				if (!child.through) break;
			}
		state.beforeBottom = state.top;
		state.bottom = margin(state.marginBottom);
		if (state.bottomEscape)
			for (let index = state.children.length - 1; index >= 0; index--) {
				charge();
				const child = state.children[index];
				state.bottom = merge(state.bottom, child.bottom);
				if (!child.through) break;
			}
		if (state.through) {
			state.top = merge(state.top, state.bottom);
			state.bottom = state.top;
		}
		state.natural =
			flexSizes.get(state.node.id)?.naturalContentHeight ??
			images.get(state.node.id)?.contentHeight ??
			(context
				? context.textHeight
				: flow(state.children, state.topEscape, state.bottomEscape));
		const used = clamp(
			state.node.contentMode === "table"
				? Math.max(state.preferred ?? 0, state.natural)
				: (state.preferred ?? state.natural),
			state.minimum,
			state.maximum,
		);
		state.height = used.height;
		state.clampedBy = used.clampedBy;
		state.borderHeight = layoutNumber(
			state.borderTop +
				state.paddingTop +
				state.height +
				state.paddingBottom +
				state.borderBottom,
		);
	}
	let resolvedText = text;
	let coordinatedVisit: ((state: State, borderY: number) => void) | undefined;
	let coordinatedMetrics: DocumentTextLayout["metrics"] | undefined;
	if (coordinator) {
		const textMetrics = {
			tokens: 0,
			lines: 0,
			glyphs: 0,
			fragments: 0,
			unsupportedGlyphs: 0,
			work: 0,
		};
		coordinatedMetrics = textMetrics;
		const invoke = <Value>(callback: () => Value): Value => {
			const before = coordinator.work();
			const value = callback();
			const after = coordinator.work();
			if (
				!Number.isSafeInteger(before) ||
				!Number.isSafeInteger(after) ||
				before < 0 ||
				after < before
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid document flow work accounting",
				);
			charge(after - before);
			return value;
		};
		const frame = (state: State): Readonly<DocumentFlowFrame> =>
			Object.freeze({
				node: state.node,
				width: state.width,
				borderY: state.borderY,
				contentY: state.contentY,
				marginTop: state.marginTop,
				marginBottom: state.marginBottom,
				borderBoxHeight: state.borderHeight,
				naturalContentHeight: state.natural,
			});
		const visit = (state: State, borderY: number) => {
			charge();
			state.borderY = layoutNumber(borderY, true);
			state.contentY = layoutNumber(
				state.borderY + state.borderTop + state.paddingTop,
				true,
			);
			invoke(() => coordinator.enterBlock(frame(state)));
			const context = contextsById.get(state.node.id);
			if (context) {
				const result = invoke(() =>
					coordinator.layoutText(context, frame(state), maxWork - work),
				);
				if (
					result.context.id !== context.id ||
					result.context.contentX !== state.width.contentX ||
					result.context.contentWidth !== state.width.contentWidth ||
					result.context.lines.length > 0 !== context.lines.length > 0
				)
					throw new AgentBrowserError(
						"unsupported",
						"Document flow changed structural text ownership",
					);
				for (const key of Object.keys(
					textMetrics,
				) as (keyof typeof textMetrics)[]) {
					const amount = result.metrics[key];
					if (!Number.isSafeInteger(amount) || amount < 0)
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid document flow text accounting",
						);
					textMetrics[key] += amount;
				}
				charge(result.metrics.work);
				contextsById.set(state.node.id, result.context);
				state.natural = layoutNumber(result.context.textHeight);
			} else {
				state.natural =
					flexSizes.get(state.node.id)?.naturalContentHeight ??
					images.get(state.node.id)?.contentHeight ??
					flow(state.children, state.topEscape, state.bottomEscape, (child) =>
						visit(child, state.contentY + child.relativeY),
					);
			}
			state.natural = layoutNumber(
				invoke(() => coordinator.naturalHeight(frame(state))),
			);
			const used = clamp(
				state.node.contentMode === "table"
					? Math.max(state.preferred ?? 0, state.natural)
					: (state.preferred ?? state.natural),
				state.minimum,
				state.maximum,
			);
			state.height = used.height;
			state.clampedBy = used.clampedBy;
			state.borderHeight = layoutNumber(
				state.borderTop +
					state.paddingTop +
					state.height +
					state.paddingBottom +
					state.borderBottom,
			);
			const top = layoutNumber(
				invoke(() => coordinator.positionBlock(frame(state))),
				true,
			);
			const offset = layoutNumber(top - state.borderY, true);
			if (offset < 0 || (offset > 0 && !state.node.independentContext))
				throw new AgentBrowserError(
					"unsupported",
					"Document flow can only lower independent formatting contexts",
				);
			if (offset) {
				state.relativeY = layoutNumber(state.relativeY + offset, true);
				state.borderY = layoutNumber(state.borderY + offset, true);
				state.contentY = layoutNumber(state.contentY + offset, true);
			}
			invoke(() => coordinator.finishBlock(frame(state)));
		};
		coordinatedVisit = visit;
	}
	let flowHeight = 0;
	if (isolated) {
		for (const root of roots) {
			charge();
			root.relativeY = 0;
			coordinatedVisit?.(root, 0);
			flowHeight = Math.max(flowHeight, root.borderHeight);
		}
	} else
		flowHeight = flow(
			roots,
			false,
			false,
			coordinatedVisit
				? (root) => coordinatedVisit?.(root, root.relativeY)
				: undefined,
		);
	if (coordinatedMetrics)
		resolvedText = Object.freeze({
			...text,
			contexts: Object.freeze(
				text.contexts.map((context) => {
					charge();
					return contextsById.get(context.id) as Readonly<TextContext>;
				}),
			),
			metrics: Object.freeze(coordinatedMetrics),
		});
	const boxes: Readonly<DocumentBox>[] = [];
	for (const state of states.values()) {
		charge();
		const parent = states.get(state.width.containingBlock);
		state.borderY = layoutNumber(
			(parent?.contentY ?? 0) + state.relativeY,
			true,
		);
		state.contentY = layoutNumber(
			state.borderY + state.borderTop + state.paddingTop,
			true,
		);
		layoutNumber(state.borderY + state.borderHeight, true);
		boxes.push(
			Object.freeze({
				...state.width,
				containingHeight: state.containingHeight,
				preferredHeight: state.preferred,
				minimumHeight: state.minimum,
				maximumHeight: state.maximum,
				definiteHeight: state.definite,
				marginTop: state.marginTop,
				marginBottom: state.marginBottom,
				paddingTop: state.paddingTop,
				borderTop: state.borderTop,
				borderBottom: state.borderBottom,
				paddingBottom: state.paddingBottom,
				naturalContentHeight: state.natural,
				contentHeight: state.height,
				borderBoxHeight: state.borderHeight,
				borderY: state.borderY,
				contentY: state.contentY,
				heightClampedBy: state.clampedBy,
				marginCollapse: Object.freeze({
					top: state.top,
					bottom: state.bottom,
					through: state.through,
					withFirstChild: state.topEscape,
					withLastChild: state.bottomEscape,
				}),
			}),
		);
	}
	let glyphCount = 0;
	let lineCount = 0;
	const contexts = resolvedText.contexts.map((context) => {
		charge();
		const state = states.get(context.id);
		if (!state)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing text containing block",
			);
		const contentY = state.contentY;
		const lines = context.lines.map((line) => {
			charge();
			lineCount++;
			layoutNumber(contentY + line.top + line.height, true);
			return Object.freeze({
				...line,
				top: layoutNumber(contentY + line.top, true),
				baseline: layoutNumber(contentY + line.baseline, true),
			});
		});
		for (const glyph of context.glyphs) {
			charge();
			glyphCount++;
			layoutNumber(contentY + glyph.y + glyph.fontSize, true);
			layoutNumber(contentY + glyph.y, true);
		}
		const fragments = context.fragments.map((fragment) => {
			charge();
			layoutNumber(contentY + fragment.y + fragment.height, true);
			return Object.freeze({
				...fragment,
				y: layoutNumber(contentY + fragment.y, true),
			});
		});
		const positioned = {
			...context,
			contentY,
			lines: Object.freeze(lines),
			glyphs: context.glyphs.length ? context.glyphs : Object.freeze([]),
			fragments: Object.freeze(fragments),
		};
		if (context.glyphs.length)
			Object.defineProperty(positioned, "glyphs", {
				get: positionedGlyphReader({ source: context.glyphs, contentY }),
				enumerable: true,
				configurable: true,
			});
		return Object.freeze(positioned);
	});
	return Object.freeze({
		stage: isolated
			? ("isolated-block-layout" as const)
			: ("normal-flow-document-layout" as const),
		partial: true as const,
		text: resolvedText,
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		flowHeight,
		metrics: Object.freeze({
			work,
			boxes: boxes.length,
			glyphs: glyphCount,
			lines: lineCount,
		}),
	});
}
