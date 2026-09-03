import type { BoxStyle } from "./css-box.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export type BlockWidthStyle = Pick<
	BoxStyle,
	| "width"
	| "min-width"
	| "max-width"
	| "box-sizing"
	| "margin-left"
	| "margin-right"
	| "padding-left"
	| "padding-right"
>;

export interface BlockWidthOptions {
	containingDirection?: "ltr" | "rtl";
	borderLeft?: number;
	borderRight?: number;
}

export interface BlockWidth {
	containingWidth: number;
	contentWidth: number;
	paddingLeft: number;
	paddingRight: number;
	borderLeft: number;
	borderRight: number;
	marginLeft: number;
	marginRight: number;
	borderBoxWidth: number;
	contentOffset: number;
	clampedBy: "none" | "min-width" | "max-width";
}

export function resolveBlockWidth(
	style: BlockWidthStyle,
	containingWidth: number,
	options: BlockWidthOptions = {},
): Readonly<BlockWidth> {
	layoutNumber(containingWidth);
	if (
		!style ||
		typeof style !== "object" ||
		Array.isArray(style) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		throw new AgentBrowserError("invalid-input", "Invalid block width inputs");
	const direction = options.containingDirection ?? "ltr";
	if (direction !== "ltr" && direction !== "rtl")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid containing-block direction",
		);
	if (
		style["box-sizing"] !== "content-box" &&
		style["box-sizing"] !== "border-box"
	)
		throw new AgentBrowserError("unsupported", "Unsupported block box sizing");
	const borderLeft = layoutNumber(options.borderLeft ?? 0);
	const borderRight = layoutNumber(options.borderRight ?? 0);
	const paddingLeft = resolveLayoutLength(
		style["padding-left"],
		containingWidth,
	);
	const paddingRight = resolveLayoutLength(
		style["padding-right"],
		containingWidth,
	);
	const edges = layoutNumber(
		borderLeft + paddingLeft + paddingRight + borderRight,
	);
	const marginLeft =
		style["margin-left"] === "auto"
			? null
			: resolveLayoutLength(style["margin-left"], containingWidth, true);
	const marginRight =
		style["margin-right"] === "auto"
			? null
			: resolveLayoutLength(style["margin-right"], containingWidth, true);
	const contentSize = (value: string) =>
		Math.max(
			0,
			resolveLayoutLength(value, containingWidth) -
				(style["box-sizing"] === "border-box" ? edges : 0),
		);
	const preferred = style.width === "auto" ? null : contentSize(style.width);
	const minimum =
		style["min-width"] === "auto" ? 0 : contentSize(style["min-width"]);
	const maximum =
		style["max-width"] === "none" ? undefined : contentSize(style["max-width"]);
	const solve = (candidateWidth: number | null) => {
		let width = candidateWidth;
		let left = marginLeft;
		let right = marginRight;
		if (width === null) {
			left ??= 0;
			right ??= 0;
			const available = containingWidth - edges - left - right;
			if (available >= 0)
				return {
					contentWidth: available,
					marginLeft: left,
					marginRight: right,
				};
			width = 0;
		}
		if (width + edges + (left ?? 0) + (right ?? 0) > containingWidth) {
			left ??= 0;
			right ??= 0;
		}
		const free = containingWidth - width - edges - (left ?? 0) - (right ?? 0);
		let resolvedLeft = left ?? 0;
		let resolvedRight = right ?? 0;
		if (left === null && right === null)
			resolvedLeft = resolvedRight = free / 2;
		else if (left === null) resolvedLeft = free;
		else if (right === null) resolvedRight = free;
		else if (direction === "ltr") resolvedRight += free;
		else resolvedLeft += free;
		return {
			contentWidth: width,
			marginLeft: resolvedLeft,
			marginRight: resolvedRight,
		};
	};
	let used = solve(preferred);
	let clampedBy: BlockWidth["clampedBy"] = "none";
	if (maximum !== undefined && used.contentWidth > maximum) {
		used = solve(maximum);
		clampedBy = "max-width";
	}
	if (used.contentWidth < minimum) {
		used = solve(minimum);
		clampedBy = "min-width";
	}
	return Object.freeze({
		containingWidth,
		contentWidth: layoutNumber(used.contentWidth),
		paddingLeft,
		paddingRight,
		borderLeft,
		borderRight,
		marginLeft: layoutNumber(used.marginLeft, true),
		marginRight: layoutNumber(used.marginRight, true),
		borderBoxWidth: layoutNumber(used.contentWidth + edges),
		contentOffset: layoutNumber(
			used.marginLeft + borderLeft + paddingLeft,
			true,
		),
		clampedBy,
	});
}
