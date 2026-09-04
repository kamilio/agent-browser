import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import { lengthHasPercentage } from "./css-math.js";
import type { FormattingNode } from "./formatting-tree.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import { AgentBrowserError } from "./errors.js";
import { flexLineLimits } from "./flex-line.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export function flexIntrinsicContribution(
	node: FormattingNode,
	measured: IntrinsicWidth,
	maximumContent: boolean,
) {
	const style = node.box ?? initialBoxStyle;
	const flex = node.flex ?? initialFlexStyle;
	if (
		Number(flex["flex-grow"]) > flexLineLimits.maxFactor ||
		Number(flex["flex-shrink"]) > flexLineLimits.maxFactor
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Flex intrinsic factor limit exceeded",
		);
	const borders = resolveBorders(style);
	const edges = layoutNumber(
		borders.borderLeft +
			borders.borderRight +
			resolveLayoutLength(style["padding-left"], 0) +
			resolveLayoutLength(style["padding-right"], 0),
	);
	const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
	const size = (value: string) =>
		Math.max(0, resolveLayoutLength(value, 0) - adjustment);
	const specified =
		style.width === "auto" || lengthHasPercentage(style.width)
			? null
			: size(style.width);
	const maximum =
		style["max-width"] === "none" || lengthHasPercentage(style["max-width"])
			? Number.POSITIVE_INFINITY
			: size(style["max-width"]);
	const minimum =
		style["min-width"] === "auto"
			? Math.min(
					measured.minContent,
					specified ?? Number.POSITIVE_INFINITY,
					maximum,
				)
			: size(style["min-width"]);
	const content = maximumContent ? measured.maxContent : measured.minContent;
	let basis = flex["flex-basis"];
	if (basis === "auto") basis = style.width;
	if (basis === "auto" || lengthHasPercentage(basis)) basis = "content";
	const base = ["content", "fit-content"].includes(basis)
		? content
		: basis === "min-content"
			? measured.minContent
			: basis === "max-content"
				? measured.maxContent
				: resolveLayoutLength(basis, 0) - adjustment;
	let contribution = Math.max(content, specified ?? 0);
	if (Number(flex["flex-grow"]) === 0)
		contribution = Math.min(contribution, base);
	if (Number(flex["flex-shrink"]) === 0)
		contribution = Math.max(contribution, base);
	const margin = (side: "left" | "right") =>
		style[`margin-${side}`] === "auto"
			? 0
			: resolveLayoutLength(style[`margin-${side}`], 0, true);
	return layoutNumber(
		Math.max(minimum, Math.min(contribution, maximum)) +
			edges +
			margin("left") +
			margin("right"),
		true,
	);
}
