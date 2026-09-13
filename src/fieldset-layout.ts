import { resolveBorders } from "./border-box.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

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

export function resolveFieldsetMinimum(
	style: BoxStyle,
	minContent: number,
): BoxStyle {
	if (style["min-width"] !== "min-content") return style;
	layoutNumber(minContent);
	const borders = resolveBorders(style);
	const edges =
		style["box-sizing"] === "border-box"
			? borders.borderLeft +
				borders.borderRight +
				resolveLayoutLength(style["padding-left"], 0) +
				resolveLayoutLength(style["padding-right"], 0)
			: 0;
	return Object.freeze({
		...style,
		"min-width": `${layoutNumber(minContent + edges)}px`,
	});
}
