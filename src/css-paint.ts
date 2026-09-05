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
import {
	borderColorProperties,
	type BorderColorProperty,
} from "./css-border.js";

export const cssPaintProperties = Object.freeze([
	...borderColorProperties,
	"color",
	"caret-color",
	"accent-color",
	...cssBackgroundProperties,
] as const);
export type CssPaintProperty = (typeof cssPaintProperties)[number];
export type PaintSpecifiedStyle = Readonly<
	Partial<Record<CssPaintProperty, string>>
>;
export interface PaintStyle
	extends Readonly<Partial<Record<BorderColorProperty, Rgba>>> {
	readonly color: Rgba;
	readonly "caret-color"?: CssColor | "auto";
	readonly "accent-color"?: CssColor | "auto";
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
		borderColorProperties.includes(property as BorderColorProperty) ||
		property === "color" ||
		property === "caret-color" ||
		property === "accent-color" ||
		property === "background-color" ||
		isNeutralBackgroundProperty(property)
	);
}
export function parsePaintValue(
	value: string,
	property: CssPaintProperty = "color",
): string | undefined {
	if (
		(property === "caret-color" || property === "accent-color") &&
		value.trim().toLowerCase() === "auto"
	)
		return "auto";
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
	const result: {
		color: Rgba;
		"background-color": CssColor;
		"caret-color"?: CssColor | "auto";
		"accent-color"?: CssColor | "auto";
	} & Partial<Record<BorderColorProperty, Rgba>> = {
		color:
			foreground && foreground !== "currentcolor" ? foreground : parent.color,
		"background-color": fill ?? transparentColor,
	};
	for (const property of ["caret-color", "accent-color"] as const) {
		const specifiedColor = specified[property];
		let inheritedColor = parent[property];
		if (specifiedColor === "initial" || specifiedColor === "auto")
			inheritedColor = undefined;
		else if (
			specifiedColor !== undefined &&
			!["inherit", "unset", "revert"].includes(specifiedColor)
		)
			inheritedColor = parseCssColor(specifiedColor) ?? parent[property];
		if (inheritedColor !== undefined) result[property] = inheritedColor;
	}
	for (const property of borderColorProperties) {
		const value = specified[property];
		if (value === "inherit") {
			if (parent[property] !== undefined) result[property] = parent[property];
		} else if (
			value !== undefined &&
			!["initial", "unset", "revert", "currentcolor"].includes(value)
		) {
			const color = parseCssColor(value);
			if (color && color !== "currentcolor") result[property] = color;
		}
	}
	return result.color === parent.color &&
		result["caret-color"] === parent["caret-color"] &&
		result["accent-color"] === parent["accent-color"] &&
		borderColorProperties.every(
			(property) => result[property] === parent[property],
		) &&
		result["background-color"] === parent["background-color"]
		? parent
		: Object.freeze(result);
}
export function paintBackground(style: PaintStyle): Rgba {
	return style["background-color"] === "currentcolor"
		? style.color
		: style["background-color"];
}

export function paintCaret(style: PaintStyle): Rgba {
	const color = style["caret-color"];
	return color === undefined || color === "auto" || color === "currentcolor"
		? style.color
		: color;
}
