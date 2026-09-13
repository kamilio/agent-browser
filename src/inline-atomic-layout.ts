import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingFlexFlow } from "./flex-document.js";
import { flexLayoutLimits } from "./flex-layout.js";
import {
	resolveFormattingBlockWidths,
	formattingLimits,
	type BlockReflowRoot,
	type DocumentBlockWidths,
	type FormattingBlockWidth,
	type FormattingTree,
} from "./formatting-tree.js";
import { isAtomicInline, type AtomicInlineMetrics } from "./inline-atomic.js";
import { collectFlexBaselines } from "./flex-placement.js";
import {
	intrinsicWidthLimits,
	measureValidatedIntrinsicRoot,
} from "./intrinsic-widths.js";
import { layoutNumber } from "./layout-values.js";
import {
	fieldsetIntrinsicPadding,
	resolveFieldsetMinimum,
} from "./fieldset-layout.js";
import {
	resolveShrinkToFitWidth,
	type ShrinkToFitIntrinsicWidths,
} from "./shrink-to-fit.js";
import { layoutFormattingText, type TextLayoutLimits } from "./text-layout.js";
import {
	layoutFormattingFloatFlow,
	type FloatBoxLayout,
} from "./float-document.js";

export interface AtomicInlineResolutionContext {
	nesting?: number;
	text?: Partial<TextLayoutLimits>;
	atomicRoot?: number;
	floatRoot?: number;
	layoutFloat?: (
		frame: Readonly<BlockReflowRoot>,
		maxWork: number,
		context: AtomicInlineResolutionContext,
	) => Readonly<FloatBoxLayout>;
}
export interface AtomicInlineLayout {
	id: number;
	atomic: Readonly<AtomicInlineMetrics>;
	document: Readonly<DocumentLayout>;
	metrics: Readonly<{ work: number }>;
}

export function layoutFormattingAtomicInline(
	formatting: FormattingTree,
	frame: Readonly<BlockReflowRoot>,
	maxWork: number,
	context: AtomicInlineResolutionContext,
): Readonly<AtomicInlineLayout> {
	const nesting = context.nesting ?? 0;
	if (
		!Number.isSafeInteger(nesting) ||
		nesting < 0 ||
		nesting >= flexLayoutLimits.maxNesting
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Atomic inline nesting limit exceeded",
		);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Atomic inline work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Atomic inline work limit exceeded",
			);
		return maxWork - work;
	};
	const node = formatting.nodes[frame.id];
	if (!node?.ref || !isAtomicInline(node))
		throw new AgentBrowserError(
			"unsupported",
			"Atomic sizing requires a retained inline container",
		);
	let style = node.box ?? initialBoxStyle;
	const borders = resolveBorders(style);
	const basis = frame.containingWidth;
	let intrinsicWidths: ShrinkToFitIntrinsicWidths | undefined;
	if (style.width === "auto" || style["min-width"] === "min-content") {
		const intrinsic = measureValidatedIntrinsicRoot(
			formatting,
			node.id,
			frame.containingHeight,
			{
				maxWork: Math.min(intrinsicWidthLimits.maxWork, remaining()),
				text: context.text,
			},
			nesting,
		);
		charge(intrinsic.metrics.work);
		const measured = intrinsic.widths.find((entry) => {
			charge();
			return entry.id === node.id;
		});
		if (!measured)
			throw new AgentBrowserError(
				"unsupported",
				"Missing atomic intrinsic width",
			);
		const contentBox =
			node.fieldsetContent === undefined
				? undefined
				: formatting.nodes[node.fieldsetContent].box;
		const adjustment = contentBox
			? fieldsetIntrinsicPadding(contentBox, basis)
			: 0;
		intrinsicWidths = {
			minContent: Math.max(0, measured.minContent + adjustment),
			maxContent: Math.max(0, measured.maxContent + adjustment),
		};
		style = resolveFieldsetMinimum(style, intrinsicWidths.minContent, basis);
	}
	const resolved = resolveShrinkToFitWidth(
		style,
		basis,
		intrinsicWidths,
		borders,
	);
	const { contentWidth, paddingLeft, paddingRight, marginLeft, marginRight } =
		resolved;
	const width: FormattingBlockWidth = Object.freeze({
		id: node.id,
		ref: node.ref,
		containingBlock: node.id,
		containingWidth: basis,
		containingHeight: frame.containingHeight,
		contentWidth,
		paddingLeft,
		paddingRight,
		borderLeft: borders.borderLeft,
		borderRight: borders.borderRight,
		marginLeft,
		marginRight,
		borderBoxWidth: resolved.borderBoxWidth,
		contentOffset: resolved.contentOffset,
		borderX: 0,
		contentX: borders.borderLeft + paddingLeft,
		clampedBy:
			contentWidth > resolved.tentativeContentWidth
				? "min-width"
				: contentWidth < resolved.tentativeContentWidth
					? "max-width"
					: "none",
	});
	charge();
	const horizontal: DocumentBlockWidths =
		node.contentMode === "flex"
			? {
					stage: "isolated-block-horizontal-reflow",
					partial: true,
					formatting,
					widths: [width],
					images: [],
					metrics: { work: 0 },
				}
			: resolveFormattingBlockWidths(
					formatting,
					[
						{
							...frame,
							containingBlock: node.id,
							contentX: 0,
							usedWidth: width,
						},
					],
					Math.min(formattingLimits.maxWork, remaining()),
					true,
					() => {},
					{ ...context, atomicRoot: node.id, nesting: nesting + 1 },
				);
	charge(horizontal.metrics.work);
	const document = horizontal.floatLayouts?.length
		? layoutFormattingFloatFlow(
				horizontal,
				remaining(),
				context.text,
				true,
				nesting + 1,
			)
		: (() => {
				const text = layoutFormattingText(horizontal, {
					...context.text,
					maxWork: Math.min(context.text?.maxWork ?? remaining(), remaining()),
				});
				charge(text.metrics.work);
				return layoutFormattingFlexFlow(
					text,
					remaining(),
					context.text,
					true,
					node.contentMode === "flex" ? nesting : nesting + 1,
				);
			})();
	charge(document.metrics.work);
	const root = document.boxes.find((box) => {
		charge();
		return box.id === node.id;
	});
	if (!root)
		throw new AgentBrowserError("unsupported", "Missing used atomic root");
	const baseline =
		node.contentMode === "flex"
			? {
					value: root.flexBaselines?.first ?? null,
					unsupported: root.flexBaselines?.unsupported ?? false,
				}
			: (() => {
					const measured = collectFlexBaselines(
						document,
						formatting,
						charge,
					).get(node.id);
					if (!measured)
						throw new AgentBrowserError(
							"unsupported",
							"Missing inline block baseline state",
						);
					return {
						value:
							measured.last === null
								? null
								: layoutNumber(measured.last - root.borderY, true),
						unsupported: measured.unsupported,
					};
				})();
	const atomic: AtomicInlineMetrics = Object.freeze({
		id: node.id,
		borderBoxWidth: root.borderBoxWidth,
		marginLeft,
		marginRight,
		block: Object.freeze({
			borderBoxHeight: root.borderBoxHeight,
			marginTop: root.marginTop,
			marginBottom: root.marginBottom,
			baseline: baseline.value,
			unsupportedBaseline: baseline.unsupported,
		}),
	});
	return Object.freeze({
		id: node.id,
		atomic,
		document,
		metrics: Object.freeze({ work }),
	});
}
