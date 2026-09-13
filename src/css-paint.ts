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
	computeSvgStrokeWidth,
	normalizeSvgStrokeWidth,
} from "./svg-stroke-width.js";
import {
	normalizeSvgFill,
	parseSvgFill,
	type SvgFill,
} from "./svg-paint-value.js";
import {
	borderColorProperties,
	type BorderColorProperty,
} from "./css-border.js";

export const cssPaintProperties = Object.freeze([
	...borderColorProperties,
	"color",
	"caret-color",
	"accent-color",
	"stop-color",
	"stop-opacity",
	"fill",
	"fill-opacity",
	"fill-rule",
	"stroke",
	"stroke-opacity",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
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
	readonly "stop-color"?: CssColor;
	readonly "stop-opacity"?: number;
	readonly fill?: SvgFill;
	readonly "fill-opacity"?: number;
	readonly "fill-rule"?: "nonzero" | "evenodd";
	readonly stroke?: SvgFill;
	readonly "stroke-opacity"?: number;
	readonly "stroke-width"?: string;
	readonly "stroke-linecap"?: "butt" | "round" | "square";
	readonly "stroke-linejoin"?: "miter" | "round" | "bevel";
	readonly "stroke-miterlimit"?: number;
	readonly svgPaintError?: true;
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
		property === "stop-color" ||
		property === "stop-opacity" ||
		property === "fill" ||
		property === "fill-opacity" ||
		property === "fill-rule" ||
		property === "stroke" ||
		property === "stroke-opacity" ||
		property === "stroke-width" ||
		property === "stroke-linecap" ||
		property === "stroke-linejoin" ||
		property === "stroke-miterlimit" ||
		property === "background-color" ||
		isNeutralBackgroundProperty(property)
	);
}
export function parsePaintValue(
	value: string,
	property: CssPaintProperty = "color",
): string | undefined {
	if (property === "fill" || property === "stroke") {
		const keyword = value
			.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			.toLowerCase();
		return ["initial", "inherit", "unset", "revert"].includes(keyword)
			? keyword
			: normalizeSvgFill(value);
	}
	if (property === "fill-rule") {
		const keyword = value
			.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			.toLowerCase();
		return [
			"initial",
			"inherit",
			"unset",
			"revert",
			"nonzero",
			"evenodd",
		].includes(keyword)
			? keyword
			: undefined;
	}
	if (property === "stroke-width") return normalizeSvgStrokeWidth(value);
	if (
		property === "stroke-linecap" ||
		property === "stroke-linejoin" ||
		property === "stroke-miterlimit"
	) {
		const keyword = value
			.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			.toLowerCase();
		if (["initial", "inherit", "unset", "revert"].includes(keyword))
			return keyword;
		if (property === "stroke-miterlimit") {
			return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/.test(keyword) &&
				Number.isFinite(Number(keyword)) &&
				Number(keyword) >= 0
				? String(Number(keyword))
				: undefined;
		}
		return (property === "stroke-linecap"
			? ["butt", "round", "square"]
			: ["miter", "round", "bevel"]
		).includes(keyword)
			? keyword
			: undefined;
	}
	if (
		property === "stop-opacity" ||
		property === "fill-opacity" ||
		property === "stroke-opacity"
	) {
		if (["initial", "inherit", "unset", "revert"].includes(value)) return value;
		if (
			property === "stroke-opacity" &&
			!/^[\t\n\f\r ]*[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?%?[\t\n\f\r ]*$/i.test(
				value,
			)
		)
			return undefined;
		const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%)?$/i.exec(
			property !== "stop-opacity"
				? value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
				: value.trim(),
		);
		if (!match || !Number.isFinite(Number(match[1]))) return undefined;
		return `${Number(match[1])}${match[2] ?? ""}`;
	}
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
		"stop-color"?: CssColor;
		"stop-opacity"?: number;
		fill?: SvgFill;
		"fill-opacity"?: number;
		"fill-rule"?: "nonzero" | "evenodd";
		stroke?: SvgFill;
		"stroke-opacity"?: number;
		"stroke-width"?: string;
		"stroke-linecap"?: "butt" | "round" | "square";
		"stroke-linejoin"?: "miter" | "round" | "bevel";
		"stroke-miterlimit"?: number;
		svgPaintError?: true;
	} & Partial<Record<BorderColorProperty, Rgba>> = {
		color:
			foreground && foreground !== "currentcolor" ? foreground : parent.color,
		"background-color": fill ?? transparentColor,
	};
	for (const property of ["fill", "stroke"] as const) {
		const svgFill = specified[property];
		if (
			svgFill === undefined ||
			["inherit", "unset", "revert"].includes(svgFill)
		) {
			if (parent[property] !== undefined) result[property] = parent[property];
		} else if (svgFill !== "initial") {
			const parsed = parseSvgFill(svgFill);
			if (parsed !== undefined) result[property] = parsed;
			else result.svgPaintError = true;
		}
	}
	for (const property of [
		"stroke-width",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
	] as const) {
		const value = specified[property];
		if (value === undefined || ["inherit", "unset", "revert"].includes(value)) {
			Object.assign(
				result,
				parent[property] === undefined ? {} : { [property]: parent[property] },
			);
		} else if (value !== "initial") {
			const parsed = parsePaintValue(value, property);
			if (parsed === undefined) result.svgPaintError = true;
			else
				Object.assign(result, {
					[property]:
						property === "stroke-width"
							? computeSvgStrokeWidth(parsed)
							: property === "stroke-miterlimit"
								? Number(parsed)
								: parsed,
				});
		}
	}
	const fillRule = specified["fill-rule"];
	if (
		fillRule === undefined ||
		["inherit", "unset", "revert"].includes(fillRule)
	) {
		if (parent["fill-rule"] !== undefined)
			result["fill-rule"] = parent["fill-rule"];
	} else if (fillRule === "nonzero" || fillRule === "evenodd")
		result["fill-rule"] = fillRule;
	else if (fillRule !== "initial") result.svgPaintError = true;
	for (const property of ["fill-opacity", "stroke-opacity"] as const) {
		const fillOpacity = specified[property];
		if (
			fillOpacity === undefined ||
			["inherit", "unset", "revert"].includes(fillOpacity)
		) {
			if (parent[property] !== undefined) result[property] = parent[property];
		} else if (fillOpacity !== "initial") {
			const parsed = parsePaintValue(fillOpacity, property);
			const percent = parsed?.endsWith("%") ?? false;
			const amount =
				parsed === undefined
					? Number.NaN
					: Number(percent ? parsed.slice(0, -1) : parsed);
			if (Number.isFinite(amount))
				result[property] = Math.max(
					0,
					Math.min(1, percent ? amount / 100 : amount),
				);
			else result.svgPaintError = true;
		}
	}
	const stopColor = specified["stop-color"];
	if (stopColor === "inherit") {
		if (parent["stop-color"] !== undefined)
			result["stop-color"] = parent["stop-color"];
	} else if (
		stopColor !== undefined &&
		!["initial", "unset", "revert"].includes(stopColor)
	) {
		const parsed = parseCssColor(stopColor);
		if (parsed !== undefined) result["stop-color"] = parsed;
	}
	const stopOpacity = specified["stop-opacity"];
	if (stopOpacity === "inherit") {
		if (parent["stop-opacity"] !== undefined)
			result["stop-opacity"] = parent["stop-opacity"];
	} else if (
		stopOpacity !== undefined &&
		!["initial", "unset", "revert"].includes(stopOpacity)
	) {
		const parsed = parsePaintValue(stopOpacity, "stop-opacity");
		const percent = parsed?.endsWith("%") ?? false;
		const amount =
			parsed === undefined
				? Number.NaN
				: Number(percent ? parsed.slice(0, -1) : parsed);
		if (Number.isFinite(amount))
			result["stop-opacity"] = Math.max(
				0,
				Math.min(1, percent ? amount / 100 : amount),
			);
	}
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
		result["stop-color"] === parent["stop-color"] &&
		result["stop-opacity"] === parent["stop-opacity"] &&
		result.fill === parent.fill &&
		result["fill-opacity"] === parent["fill-opacity"] &&
		result["fill-rule"] === parent["fill-rule"] &&
		result.stroke === parent.stroke &&
		result["stroke-opacity"] === parent["stroke-opacity"] &&
		result["stroke-width"] === parent["stroke-width"] &&
		result["stroke-linecap"] === parent["stroke-linecap"] &&
		result["stroke-linejoin"] === parent["stroke-linejoin"] &&
		result["stroke-miterlimit"] === parent["stroke-miterlimit"] &&
		result.svgPaintError === parent.svgPaintError &&
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
