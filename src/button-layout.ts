import { resolveBorders } from "./border-box.js";
import type { BoxStyle } from "./css-box.js";
import { isFlexDisplay } from "./css-flex.js";
import { isGridDisplay } from "./css-grid.js";
import { layoutNumber } from "./layout-values.js";
import {
	resolveShrinkToFitWidth,
	type ShrinkToFitIntrinsicWidths,
} from "./shrink-to-fit.js";

export function buttonUsedDisplay(display: string) {
	if (isFlexDisplay(display) || isGridDisplay(display)) return display;
	return display.startsWith("inline") ? "inline-block" : "flow-root";
}

export function buttonFitContentStyle(
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
