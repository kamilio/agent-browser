import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { resolveLayoutLength } from "./layout-values.js";

export function resolveInlineEdges(
	containingWidth: number,
	style: BoxStyle = initialBoxStyle,
) {
	const margin = (side: "left" | "right") =>
		style[`margin-${side}`] === "auto"
			? 0
			: resolveLayoutLength(style[`margin-${side}`], containingWidth, true);
	return {
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
