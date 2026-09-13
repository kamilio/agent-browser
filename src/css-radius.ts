import {
	type BoxFontMetrics,
	type CssBoxProperty,
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import {
	cssMathLimits,
	lengthUsesFont,
	splitLengthComponents,
} from "./css-math.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import type { CornerRadii } from "./rounded-box.js";

export const cssRadiusProperties = Object.freeze([
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
] as const);
export type CssRadiusProperty = (typeof cssRadiusProperties)[number];
export type RadiusSpecifiedStyle = Readonly<
	Partial<Record<CssRadiusProperty, string>>
>;
export type RadiusStyle = Readonly<Record<CssRadiusProperty, string>>;
export const initialRadiusStyle: RadiusStyle = Object.freeze({
	"border-top-left-radius": "0px",
	"border-top-right-radius": "0px",
	"border-bottom-right-radius": "0px",
	"border-bottom-left-radius": "0px",
});
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const paddingProperties = [
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
] as const;

export function isCssRadiusProperty(
	property: string,
): property is CssRadiusProperty {
	return (cssRadiusProperties as readonly string[]).includes(property);
}

function pairValue(horizontal: string, vertical: string): string {
	return horizontal === vertical ? horizontal : `${horizontal} ${vertical}`;
}

function expandCorners(values: readonly string[]): string[] {
	return [
		values[0],
		values[1] ?? values[0],
		values[2] ?? values[0],
		values[3] ?? values[1] ?? values[0],
	];
}

function normalizeComponents(value: string): string[] | undefined {
	const parts = splitLengthComponents(value);
	if (!parts || parts.some((part) => wide.has(part))) return;
	const normalized: string[] = [];
	for (const part of parts) {
		const declaration = parseBoxDeclarations("padding-top", part)?.[0];
		if (!declaration) return;
		normalized.push(declaration.value);
	}
	return normalized;
}

export function parseRadiusDeclarations(
	property: string,
	value: string,
): { property: CssRadiusProperty; value: string }[] | undefined {
	if (property !== "border-radius" && !isCssRadiusProperty(property)) return;
	if (value.length > cssMathLimits.maxSourceCodeUnits) return;
	const normalized = value.trim().toLowerCase();
	const properties =
		property === "border-radius" ? cssRadiusProperties : [property];
	if (wide.has(normalized))
		return properties.map((property) => ({ property, value: normalized }));
	if (isCssRadiusProperty(property)) {
		const parts = normalizeComponents(normalized);
		if (!parts || parts.length > 2) return;
		return [{ property, value: pairValue(parts[0], parts[1] ?? parts[0]) }];
	}
	let depth = 0;
	let slash = -1;
	for (let index = 0; index < normalized.length; index++) {
		if (normalized[index] === "(") depth++;
		else if (normalized[index] === ")") {
			if (--depth < 0) return;
		} else if (normalized[index] === "/" && depth === 0) {
			if (slash !== -1) return;
			slash = index;
		}
	}
	if (depth !== 0) return;
	const horizontal = normalizeComponents(
		slash === -1 ? normalized : normalized.slice(0, slash),
	);
	const vertical =
		slash === -1
			? horizontal
			: normalizeComponents(normalized.slice(slash + 1));
	if (!horizontal || !vertical) return;
	const horizontalCorners = expandCorners(horizontal);
	const verticalCorners = expandCorners(vertical);
	return cssRadiusProperties.map((property, index) => ({
		property,
		value: pairValue(horizontalCorners[index], verticalCorners[index]),
	}));
}

function radiusPair(value: string): readonly [string, string] {
	const parts = splitLengthComponents(value);
	if (!parts || parts.length < 1 || parts.length > 2)
		throw new AgentBrowserError("unsupported", "Unsupported CSS radius pair");
	return [parts[0], parts[1] ?? parts[0]];
}

export function computeRadiusStyle(
	specified: RadiusSpecifiedStyle,
	parent: RadiusStyle,
	viewport: { width: number; height: number },
	fonts?: Readonly<BoxFontMetrics>,
): RadiusStyle {
	const horizontal: Partial<Record<CssBoxProperty, string>> = {};
	const vertical: Partial<Record<CssBoxProperty, string>> = {};
	for (const [index, property] of cssRadiusProperties.entries()) {
		const value = specified[property];
		if (value === undefined || wide.has(value)) continue;
		const pair = radiusPair(value);
		horizontal[paddingProperties[index]] = pair[0];
		vertical[paddingProperties[index]] = pair[1];
	}
	const horizontalStyle = computeBoxStyle(
		horizontal,
		initialBoxStyle,
		viewport,
		fonts,
	);
	const verticalStyle = computeBoxStyle(
		vertical,
		initialBoxStyle,
		viewport,
		fonts,
	);
	const result = { ...initialRadiusStyle };
	for (const [index, property] of cssRadiusProperties.entries())
		result[property] =
			specified[property] === "inherit"
				? parent[property]
				: pairValue(
						horizontalStyle[paddingProperties[index]],
						verticalStyle[paddingProperties[index]],
					);
	return Object.freeze(result);
}

export function resolveRadiusStyle(
	style: RadiusStyle,
	width: number,
	height: number,
): CornerRadii {
	layoutNumber(width);
	layoutNumber(height);
	return Object.freeze(
		cssRadiusProperties.map((property) => {
			const [horizontal, vertical] = radiusPair(style[property]);
			return Object.freeze({
				horizontal: resolveLayoutLength(horizontal, width),
				vertical: resolveLayoutLength(vertical, height),
			});
		}),
	) as unknown as CornerRadii;
}

export function radiusValueUsesFont(
	value: string,
	unit: "em" | "rem" | "ex",
): boolean {
	return lengthUsesFont(value, unit);
}

export function hasRadiusStyle(style: RadiusStyle): boolean {
	return cssRadiusProperties.some((property) =>
		radiusPair(style[property]).some(
			(value) => value !== "0px" && value !== "0%",
		),
	);
}

function serializeCorners(values: readonly string[]): string {
	if (values[1] !== values[3]) return values.join(" ");
	if (values[0] !== values[2]) return values.slice(0, 3).join(" ");
	if (values[0] !== values[1]) return values.slice(0, 2).join(" ");
	return values[0];
}

export function serializeRadiusStyle(style: RadiusStyle): string {
	const values = cssRadiusProperties.map((property) => style[property]);
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	const pairs = values.map(radiusPair);
	const horizontal = serializeCorners(pairs.map((pair) => pair[0]));
	const vertical = serializeCorners(pairs.map((pair) => pair[1]));
	return horizontal === vertical ? horizontal : `${horizontal} / ${vertical}`;
}
