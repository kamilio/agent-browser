import {
	cssBackgroundProperties,
	isNeutralBackgroundProperty,
	parseBackgroundComponent,
} from "./css-background.js";
import {
	type CssColor,
	cssNamedColors,
	normalizeCssColor,
	parseCssColor,
	transparentColor,
} from "./css-color.js";
import type { Rgba } from "./raster.js";

export const cssPaintProperties = Object.freeze([
	"color",
	...cssBackgroundProperties,
] as const);
export type CssPaintProperty = (typeof cssPaintProperties)[number];
export type PaintSpecifiedStyle = Readonly<
	Partial<Record<CssPaintProperty, string>>
>;
export interface PaintStyle {
	readonly color: Rgba;
	readonly "background-color": CssColor;
}
export const initialPaintStyle: PaintStyle = Object.freeze({
	color: cssNamedColors.black,
	"background-color": transparentColor,
});
export function isCssPaintProperty(
	property: string,
): property is CssPaintProperty {
	return (
		property === "color" ||
		property === "background-color" ||
		isNeutralBackgroundProperty(property)
	);
}
export function parsePaintValue(
	value: string,
	property: CssPaintProperty = "color",
): string | undefined {
	if (isNeutralBackgroundProperty(property))
		return parseBackgroundComponent(property, value);
	return ["initial", "inherit", "unset", "revert"].includes(value)
		? value
		: normalizeCssColor(value);
}
export function computePaintStyle(
	specified: PaintSpecifiedStyle,
	parent: PaintStyle,
): PaintStyle {
	const value = specified.color;
	const foreground =
		value === "initial"
			? initialPaintStyle.color
			: value === undefined ||
					["inherit", "unset", "revert", "currentcolor"].includes(value)
				? parent.color
				: parseCssColor(value);
	const background = specified["background-color"];
	const fill =
		background === "inherit"
			? parent["background-color"]
			: background === undefined ||
					["initial", "unset", "revert"].includes(background)
				? transparentColor
				: parseCssColor(background);
	const result = {
		color:
			foreground && foreground !== "currentcolor" ? foreground : parent.color,
		"background-color": fill ?? transparentColor,
	};
	return result.color === parent.color &&
		result["background-color"] === parent["background-color"]
		? parent
		: Object.freeze(result);
}
export function paintBackground(style: PaintStyle): Rgba {
	return style["background-color"] === "currentcolor"
		? style.color
		: style["background-color"];
}
