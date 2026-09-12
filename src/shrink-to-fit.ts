import type { BlockWidth, BlockWidthStyle } from "./block-width.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export interface ShrinkToFitIntrinsicWidths {
	minContent: number;
	maxContent: number;
}

export interface ShrinkToFitWidthOptions {
	borderLeft?: number;
	borderRight?: number;
	scrollbarWidth?: number;
}

export interface ShrinkToFitWidth extends BlockWidth {
	availableWidth: number;
	tentativeContentWidth: number;
}

export function resolveShrinkToFitWidth(
	style: BlockWidthStyle,
	containingWidth: number,
	intrinsic?: Readonly<ShrinkToFitIntrinsicWidths>,
	options: ShrinkToFitWidthOptions = {},
): Readonly<ShrinkToFitWidth> {
	layoutNumber(containingWidth);
	if (
		!style ||
		typeof style !== "object" ||
		Array.isArray(style) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid shrink-to-fit inputs",
		);
	if (
		style["box-sizing"] !== "content-box" &&
		style["box-sizing"] !== "border-box"
	)
		throw new AgentBrowserError("unsupported", "Unsupported box sizing");
	if (intrinsic !== undefined) {
		if (!intrinsic || typeof intrinsic !== "object" || Array.isArray(intrinsic))
			throw new AgentBrowserError("invalid-input", "Invalid intrinsic widths");
		layoutNumber(intrinsic.minContent);
		layoutNumber(intrinsic.maxContent);
		if (intrinsic.minContent > intrinsic.maxContent)
			throw new AgentBrowserError(
				"invalid-input",
				"Inconsistent intrinsic widths",
			);
	}
	const borderLeft = layoutNumber(options.borderLeft ?? 0);
	const borderRight = layoutNumber(options.borderRight ?? 0);
	const scrollbarWidth = layoutNumber(options.scrollbarWidth ?? 0);
	const paddingLeft = resolveLayoutLength(
		style["padding-left"],
		containingWidth,
	);
	const paddingRight = resolveLayoutLength(
		style["padding-right"],
		containingWidth,
	);
	const edges = layoutNumber(
		borderLeft + borderRight + paddingLeft + paddingRight,
	);
	const marginLeft =
		style["margin-left"] === "auto"
			? 0
			: resolveLayoutLength(style["margin-left"], containingWidth, true);
	const marginRight =
		style["margin-right"] === "auto"
			? 0
			: resolveLayoutLength(style["margin-right"], containingWidth, true);
	const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
	const contentSize = (value: string) =>
		Math.max(0, resolveLayoutLength(value, containingWidth) - adjustment);
	const minimum =
		style["min-width"] === "auto" ? 0 : contentSize(style["min-width"]);
	const maximum =
		style["max-width"] === "none" ? null : contentSize(style["max-width"]);
	const availableWidth =
		containingWidth - edges - marginLeft - marginRight - scrollbarWidth;
	let tentativeContentWidth: number;
	if (style.width === "auto") {
		if (intrinsic === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Auto width requires intrinsic measurements",
			);
		tentativeContentWidth = Math.min(
			intrinsic.maxContent,
			Math.max(intrinsic.minContent, availableWidth),
		);
	} else tentativeContentWidth = contentSize(style.width);
	let contentWidth = tentativeContentWidth;
	let clampedBy: BlockWidth["clampedBy"] = "none";
	if (maximum !== null && contentWidth > maximum) {
		contentWidth = maximum;
		clampedBy = "max-width";
	}
	if (contentWidth < minimum) {
		contentWidth = minimum;
		clampedBy = "min-width";
	}
	return Object.freeze({
		containingWidth,
		contentWidth: layoutNumber(contentWidth),
		paddingLeft,
		paddingRight,
		borderLeft,
		borderRight,
		marginLeft,
		marginRight,
		borderBoxWidth: layoutNumber(contentWidth + edges),
		contentOffset: layoutNumber(marginLeft + borderLeft + paddingLeft, true),
		clampedBy,
		availableWidth,
		tentativeContentWidth: layoutNumber(tentativeContentWidth),
	});
}
