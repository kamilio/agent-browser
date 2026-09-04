import type { BoxStyle } from "./css-box.js";
import { lengthHasPercentage } from "./css-math.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export function imageDimensionHint(
	value: string | undefined,
): string | undefined {
	if (value === undefined) return;
	if (value.length > 4096)
		throw new AgentBrowserError(
			"resource-limit",
			"Image dimension attribute limit exceeded",
		);
	const parsed = /^[\t\n\f\r ]*(\d+(?:\.\d*)?)(%?)/.exec(value);
	if (!parsed) return;
	const number = Number(parsed[1]);
	if (!Number.isFinite(number))
		throw new AgentBrowserError(
			"resource-limit",
			"Image dimension magnitude limit exceeded",
		);
	return `${number}${parsed[2] || "px"}`;
}

function dimension(
	value: string,
	basis: number | null,
	edges: number,
	fallback: number | null,
) {
	if (
		value === "auto" ||
		value === "none" ||
		(lengthHasPercentage(value) && basis === null)
	)
		return fallback;
	return Math.max(0, resolveLayoutLength(value, basis ?? 0) - edges);
}

export function resolveHeightConstraints(
	style: BoxStyle,
	containingWidth: number,
	containingHeight: number | null,
) {
	if (!style || typeof style !== "object" || Array.isArray(style))
		throw new AgentBrowserError("invalid-input", "Invalid box height style");
	if (
		style["box-sizing"] !== "content-box" &&
		style["box-sizing"] !== "border-box"
	)
		throw new AgentBrowserError("unsupported", "Unsupported box sizing");
	layoutNumber(containingWidth);
	if (containingHeight !== null) layoutNumber(containingHeight);
	const paddingTop = resolveLayoutLength(style["padding-top"], containingWidth);
	const paddingBottom = resolveLayoutLength(
		style["padding-bottom"],
		containingWidth,
	);
	const edges = layoutNumber(paddingTop + paddingBottom);
	const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
	const preferred = dimension(style.height, containingHeight, adjustment, null);
	const minimum =
		dimension(style["min-height"], containingHeight, adjustment, 0) ?? 0;
	const maximum = dimension(
		style["max-height"],
		containingHeight,
		adjustment,
		null,
	);
	return {
		paddingTop,
		paddingBottom,
		preferred,
		minimum,
		maximum,
		definite:
			preferred === null
				? null
				: Math.max(
						minimum,
						Math.min(preferred, maximum ?? Number.POSITIVE_INFINITY),
					),
	};
}

export interface ReplacedSize {
	contentWidth: number;
	contentHeight: number;
	borderBoxWidth: number;
	borderBoxHeight: number;
	paddingLeft: number;
	paddingRight: number;
	paddingTop: number;
	paddingBottom: number;
	marginLeft: number;
	marginRight: number;
	marginTop: number;
	marginBottom: number;
}

export function resolveReplacedSize(
	intrinsicWidth: number,
	intrinsicHeight: number,
	style: BoxStyle,
	containingWidth: number,
	containingHeight: number | null,
): Readonly<ReplacedSize> {
	layoutNumber(intrinsicWidth);
	layoutNumber(intrinsicHeight);
	if (intrinsicWidth === 0 || intrinsicHeight === 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Replaced content requires positive intrinsic dimensions",
		);
	const vertical = resolveHeightConstraints(
		style,
		containingWidth,
		containingHeight,
	);
	const paddingLeft = resolveLayoutLength(
		style["padding-left"],
		containingWidth,
	);
	const paddingRight = resolveLayoutLength(
		style["padding-right"],
		containingWidth,
	);
	const edges = layoutNumber(paddingLeft + paddingRight);
	const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
	const preferredWidth = dimension(
		style.width,
		containingWidth,
		adjustment,
		null,
	);
	const minimumWidth =
		dimension(style["min-width"], containingWidth, adjustment, 0) ?? 0;
	const maximumWidth = Math.max(
		minimumWidth,
		dimension(style["max-width"], containingWidth, adjustment, null) ??
			Number.POSITIVE_INFINITY,
	);
	const minimumHeight = vertical.minimum;
	const maximumHeight = Math.max(
		minimumHeight,
		vertical.maximum ?? Number.POSITIVE_INFINITY,
	);
	const clampWidth = (value: number) =>
		Math.max(minimumWidth, Math.min(maximumWidth, value));
	const clampHeight = (value: number) =>
		Math.max(minimumHeight, Math.min(maximumHeight, value));
	let contentWidth = intrinsicWidth;
	let contentHeight = intrinsicHeight;
	if (preferredWidth !== null) {
		contentWidth = clampWidth(preferredWidth);
		contentHeight = clampHeight(
			vertical.preferred ?? (contentWidth * intrinsicHeight) / intrinsicWidth,
		);
	} else if (vertical.preferred !== null) {
		contentHeight = clampHeight(vertical.preferred);
		contentWidth = clampWidth(
			(contentHeight * intrinsicWidth) / intrinsicHeight,
		);
	} else if (contentWidth > maximumWidth && contentHeight < minimumHeight) {
		contentWidth = maximumWidth;
		contentHeight = minimumHeight;
	} else if (contentWidth < minimumWidth && contentHeight > maximumHeight) {
		contentWidth = minimumWidth;
		contentHeight = maximumHeight;
	} else if (contentWidth > maximumWidth || contentHeight > maximumHeight) {
		const scale = Math.min(
			maximumWidth / contentWidth,
			maximumHeight / contentHeight,
		);
		contentWidth = Math.max(minimumWidth, contentWidth * scale);
		contentHeight = Math.max(minimumHeight, contentHeight * scale);
	} else if (contentWidth < minimumWidth || contentHeight < minimumHeight) {
		const scale = Math.max(
			minimumWidth / contentWidth,
			minimumHeight / contentHeight,
		);
		contentWidth = Math.min(maximumWidth, contentWidth * scale);
		contentHeight = Math.min(maximumHeight, contentHeight * scale);
	}
	const margin = (side: "left" | "right" | "top" | "bottom") =>
		style[`margin-${side}`] === "auto"
			? 0
			: resolveLayoutLength(style[`margin-${side}`], containingWidth, true);
	return Object.freeze({
		contentWidth: layoutNumber(contentWidth),
		contentHeight: layoutNumber(contentHeight),
		borderBoxWidth: layoutNumber(contentWidth + edges),
		borderBoxHeight: layoutNumber(
			contentHeight + vertical.paddingTop + vertical.paddingBottom,
		),
		paddingLeft,
		paddingRight,
		paddingTop: vertical.paddingTop,
		paddingBottom: vertical.paddingBottom,
		marginLeft: margin("left"),
		marginRight: margin("right"),
		marginTop: margin("top"),
		marginBottom: margin("bottom"),
	});
}
