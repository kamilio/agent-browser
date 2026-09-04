import { normalizeBorderWidth } from "./css-border.js";
import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
	type BoxFontMetrics,
} from "./css-box.js";
import { normalizeCssColor, parseCssColor } from "./css-color.js";
import {
	isCssLengthMath,
	normalizeLengthMath,
	splitLengthComponents,
} from "./css-math.js";
import type { Rgba } from "./raster.js";

export const cssOutlineProperties = Object.freeze([
	"outline-width",
	"outline-style",
	"outline-color",
	"outline-offset",
] as const);
export type CssOutlineProperty = (typeof cssOutlineProperties)[number];
export type OutlineStyle = Readonly<Record<CssOutlineProperty, string>>;
export type OutlineSpecifiedStyle = Readonly<Partial<OutlineStyle>>;
export const initialOutlineStyle: OutlineStyle = Object.freeze({
	"outline-width": "0px",
	"outline-style": "none",
	"outline-color": "rgb(0, 0, 0)",
	"outline-offset": "0px",
});
const initial = {
	...initialOutlineStyle,
	"outline-width": "3px",
	"outline-color": "auto",
};
const wide = new Set(["initial", "inherit", "unset", "revert"]);
export function isCssOutlineProperty(
	property: string,
): property is CssOutlineProperty {
	return (cssOutlineProperties as readonly string[]).includes(property);
}
export function parseOutlineValue(
	property: CssOutlineProperty,
	value: string,
): string | undefined {
	if (wide.has(value)) return value;
	if (property === "outline-width") return normalizeBorderWidth(value);
	if (property === "outline-style")
		return ["none", "solid", "auto", "dashed", "dotted", "double"].includes(
			value,
		)
			? value
			: undefined;
	if (property === "outline-color")
		return value === "auto" ? value : normalizeCssColor(value);
	if (isCssLengthMath(value)) return normalizeLengthMath(value, false);
	if (value === "auto" || value.includes("%")) return;
	return parseBoxDeclarations("margin-top", value)?.[0].value;
}
export function parseOutlineDeclarations(
	property: string,
	value: string,
): { property: CssOutlineProperty; value: string }[] | undefined {
	if (isCssOutlineProperty(property)) {
		const normalized = parseOutlineValue(property, value);
		return normalized === undefined
			? undefined
			: [{ property, value: normalized }];
	}
	if (property !== "outline" || value.length > 4096) return;
	const properties = cssOutlineProperties.slice(0, 3);
	if (wide.has(value))
		return properties.map((property) => ({ property, value }));
	const components = splitLengthComponents(value);
	if (!components?.length) return;
	const values: Partial<Record<CssOutlineProperty, string>> = {};
	let automatic = 0;
	for (const part of components) {
		if (wide.has(part)) return;
		if (part === "auto") {
			automatic++;
			continue;
		}
		const property = properties.find(
			(property) =>
				values[property] === undefined &&
				parseOutlineValue(property, part) !== undefined,
		);
		if (!property) return;
		values[property] = parseOutlineValue(property, part);
	}
	for (const property of ["outline-style", "outline-color"] as const) {
		if (automatic && values[property] === undefined) {
			values[property] = "auto";
			automatic--;
		}
	}
	if (automatic) return;
	return properties.map((property) => ({
		property,
		value: values[property] ?? initial[property],
	}));
}
export function computeOutlineStyle(
	specified: OutlineSpecifiedStyle,
	parent: OutlineStyle,
	viewport: { width: number; height: number },
	fonts: BoxFontMetrics | undefined,
	color: Rgba,
): OutlineStyle {
	const values = { ...initial };
	for (const property of cssOutlineProperties) {
		const value = specified[property];
		if (value === "inherit") values[property] = parent[property];
		else if (value !== undefined && !wide.has(value)) values[property] = value;
	}
	const lengths = computeBoxStyle(
		{
			"border-top-width": values["outline-width"],
			"margin-top": values["outline-offset"],
		},
		initialBoxStyle,
		viewport,
		fonts,
	);
	const ink =
		values["outline-color"] === "auto"
			? "currentcolor"
			: parseCssColor(values["outline-color"]);
	const resolved = !ink || ink === "currentcolor" ? color : ink;
	return Object.freeze({
		"outline-width":
			values["outline-style"] === "none" ? "0px" : lengths["border-top-width"],
		"outline-style": values["outline-style"],
		"outline-color":
			values["outline-color"] === "auto" && values["outline-style"] === "auto"
				? "auto"
				: resolved[3] === 255
					? `rgb(${resolved[0]}, ${resolved[1]}, ${resolved[2]})`
					: `rgba(${resolved[0]}, ${resolved[1]}, ${resolved[2]}, ${Number((resolved[3] / 255).toFixed(3))})`,
		"outline-offset": lengths["margin-top"],
	});
}
