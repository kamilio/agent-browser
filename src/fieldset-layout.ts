import { resolveBorders } from "./border-box.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { AgentBrowserError } from "./errors.js";
import type { FormattingNode } from "./formatting-tree.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	resolveShrinkToFitWidth,
	type ShrinkToFitIntrinsicWidths,
} from "./shrink-to-fit.js";

export function legendFitContentStyle(
	style: BoxStyle,
	containingWidth: number,
	intrinsic: Readonly<ShrinkToFitIntrinsicWidths>,
): BoxStyle {
	if (style.width !== "auto") return style;
	const used = resolveShrinkToFitWidth(
		style,
		containingWidth,
		intrinsic,
		resolveBorders(style),
	);
	return Object.freeze({
		...style,
		width: `${layoutNumber(style["box-sizing"] === "border-box" ? used.borderBoxWidth : used.contentWidth)}px`,
	});
}

export function fieldsetOuterStyle(style: BoxStyle): BoxStyle {
	return Object.freeze({
		...style,
		"padding-top": "0px",
		"padding-right": "0px",
		"padding-bottom": "0px",
		"padding-left": "0px",
	});
}

export function fieldsetContentStyle(style: BoxStyle): BoxStyle {
	return Object.freeze({
		...initialBoxStyle,
		height: "100%",
		"padding-top": style["padding-top"],
		"padding-right": style["padding-right"],
		"padding-bottom": style["padding-bottom"],
		"padding-left": style["padding-left"],
	});
}

export function fieldsetPaddingStyle(style: BoxStyle, basis: number): BoxStyle {
	layoutNumber(basis);
	return Object.freeze({
		...style,
		"padding-top": `${resolveLayoutLength(style["padding-top"], basis)}px`,
		"padding-right": `${resolveLayoutLength(style["padding-right"], basis)}px`,
		"padding-bottom": `${resolveLayoutLength(style["padding-bottom"], basis)}px`,
		"padding-left": `${resolveLayoutLength(style["padding-left"], basis)}px`,
	});
}

export function fieldsetIntrinsicPadding(style: BoxStyle, basis: number) {
	layoutNumber(basis);
	return layoutNumber(
		resolveLayoutLength(style["padding-left"], basis) +
			resolveLayoutLength(style["padding-right"], basis) -
			resolveLayoutLength(style["padding-left"], 0) -
			resolveLayoutLength(style["padding-right"], 0),
		true,
	);
}

export function fieldsetIntrinsicWidths(
	node: Readonly<FormattingNode>,
	nodes: readonly Readonly<FormattingNode>[],
	measured: Readonly<ShrinkToFitIntrinsicWidths>,
	widths: readonly Readonly<IntrinsicWidth>[],
	basis: number,
	charge: (work?: number) => void,
): Readonly<ShrinkToFitIntrinsicWidths> {
	if (node.fieldsetContent === undefined) return measured;
	const contentBox = nodes[node.fieldsetContent].box;
	const adjustment = contentBox
		? fieldsetIntrinsicPadding(contentBox, basis)
		: 0;
	if (node.fieldsetLegend === undefined)
		return {
			minContent: Math.max(0, measured.minContent + adjustment),
			maxContent: Math.max(0, measured.maxContent + adjustment),
		};
	let content: Readonly<IntrinsicWidth> | undefined;
	let legend: Readonly<IntrinsicWidth> | undefined;
	for (const entry of widths) {
		charge();
		if (entry.id === node.fieldsetContent) content = entry;
		if (entry.id === node.fieldsetLegend) legend = entry;
		if (content && legend) break;
	}
	if (!content || !legend)
		throw new AgentBrowserError(
			"unsupported",
			"Missing fieldset intrinsic child contributions",
		);
	const minContent = Math.max(
		0,
		legend.minContribution,
		content.minContribution + adjustment,
	);
	return {
		minContent,
		maxContent: Math.max(
			minContent,
			legend.maxContribution,
			content.maxContribution + adjustment,
		),
	};
}

export function resolveFieldsetMinimum(
	style: BoxStyle,
	minContent: number,
	paddingBasis = 0,
): BoxStyle {
	if (style["min-width"] !== "min-content") return style;
	layoutNumber(minContent);
	layoutNumber(paddingBasis);
	const borders = resolveBorders(style);
	const edges =
		style["box-sizing"] === "border-box"
			? borders.borderLeft +
				borders.borderRight +
				resolveLayoutLength(style["padding-left"], paddingBasis) +
				resolveLayoutLength(style["padding-right"], paddingBasis)
			: 0;
	return Object.freeze({
		...style,
		"min-width": `${layoutNumber(minContent + edges)}px`,
	});
}
