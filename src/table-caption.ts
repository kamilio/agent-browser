import { resolveBlockWidth } from "./block-width.js";
import { resolveBorders } from "./border-box.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import { layoutNumber } from "./layout-values.js";

export function tableWrapperStyle(style: BoxStyle): BoxStyle {
	return Object.freeze({
		...initialBoxStyle,
		top: style.top,
		right: style.right,
		bottom: style.bottom,
		left: style.left,
		"margin-top": style["margin-top"],
		"margin-right": style["margin-right"],
		"margin-bottom": style["margin-bottom"],
		"margin-left": style["margin-left"],
	});
}

export function captionedTableStyle(style: BoxStyle): BoxStyle {
	return Object.freeze({
		...style,
		top: "auto",
		right: "auto",
		bottom: "auto",
		left: "auto",
		"margin-top": "0px",
		"margin-right": "0px",
		"margin-bottom": "0px",
		"margin-left": "0px",
	});
}

export function resolveCaptionedTableWidth(
	style: BoxStyle,
	wrapper: BoxStyle,
	containingWidth: number,
	intrinsic: Readonly<IntrinsicWidth>,
	minimumBorderWidth: number,
) {
	const borders = resolveBorders(style);
	const specified = resolveBlockWidth(style, containingWidth, borders);
	const available = resolveBlockWidth(
		{
			...style,
			width: "auto",
			"margin-left": wrapper["margin-left"],
			"margin-right": wrapper["margin-right"],
		},
		containingWidth,
		borders,
	);
	const edges = specified.borderBoxWidth - specified.contentWidth;
	const content = Math.max(
		intrinsic.minContent,
		minimumBorderWidth - edges,
		style.width === "auto"
			? Math.min(intrinsic.maxContent, available.contentWidth)
			: specified.contentWidth,
	);
	const used = resolveBlockWidth(
		{
			...style,
			width: `${layoutNumber(content + (style["box-sizing"] === "border-box" ? edges : 0))}px`,
		},
		containingWidth,
		borders,
	);
	return Object.freeze({
		...used,
		containingWidth: used.borderBoxWidth,
		marginLeft: 0,
		marginRight: 0,
	});
}
