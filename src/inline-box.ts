import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { resolveLayoutLength } from "./layout-values.js";
import { resolveBorders } from "./border-box.js";

export function resolveInlineEdges(
	containingWidth: number,
	style: BoxStyle = initialBoxStyle,
) {
	const margin = (side: "left" | "right") =>
		style[`margin-${side}`] === "auto"
			? 0
			: resolveLayoutLength(style[`margin-${side}`], containingWidth, true);
	const borders = resolveBorders(style);
	return {
		"border-left-width": borders.borderLeft,
		"border-right-width": borders.borderRight,
		"border-top-width": borders.borderTop,
		"border-bottom-width": borders.borderBottom,
		"margin-left": margin("left"),
		"margin-right": margin("right"),
		"padding-left": resolveLayoutLength(style["padding-left"], containingWidth),
		"padding-right": resolveLayoutLength(
			style["padding-right"],
			containingWidth,
		),
		"padding-top": resolveLayoutLength(style["padding-top"], containingWidth),
		"padding-bottom": resolveLayoutLength(
			style["padding-bottom"],
			containingWidth,
		),
	};
}
