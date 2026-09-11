import {
	type BoxFontMetrics,
	type BoxSpecifiedStyle,
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import {
	cssMathLimits,
	lengthHasPercentage,
	splitLengthComponents,
} from "./css-math.js";
import { AgentBrowserError } from "./errors.js";

export const cssTableProperties = Object.freeze([
	"table-layout",
	"border-collapse",
	"border-spacing",
	"caption-side",
	"empty-cells",
	"vertical-align",
] as const);
export type CssTableProperty = (typeof cssTableProperties)[number];
export type TableStyle = Readonly<Record<CssTableProperty, string>>;
export type TableSpecifiedStyle = Readonly<
	Partial<Record<CssTableProperty, string>>
>;
export const initialTableStyle: TableStyle = Object.freeze({
	"table-layout": "auto",
	"border-collapse": "separate",
	"border-spacing": "0px 0px",
	"caption-side": "top",
	"empty-cells": "show",
	"vertical-align": "baseline",
});

const wide = new Set(["initial", "inherit", "unset", "revert"]);
const inherited = new Set<CssTableProperty>([
	"border-collapse",
	"border-spacing",
	"caption-side",
	"empty-cells",
]);
const keywords: Record<CssTableProperty, readonly string[]> = {
	"table-layout": ["auto", "fixed"],
	"border-collapse": ["separate", "collapse"],
	"border-spacing": [],
	"caption-side": ["top", "bottom"],
	"empty-cells": ["show", "hide"],
	"vertical-align": ["baseline", "top", "middle", "bottom"],
};

export function isCssTableProperty(name: string): name is CssTableProperty {
	return Object.hasOwn(keywords, name);
}

export function parseTableValue(
	name: CssTableProperty,
	source: string,
): string | undefined {
	if (source.length > cssMathLimits.maxSourceCodeUnits) return;
	const value = source.toLowerCase().trim();
	if (wide.has(value)) return value;
	if (name !== "border-spacing")
		return keywords[name].includes(value) ? value : undefined;
	if (lengthHasPercentage(value)) return;
	const parts = splitLengthComponents(value);
	if (!parts || parts.length > 2) return;
	const normalized: string[] = [];
	for (const part of parts) {
		if (wide.has(part)) return;
		const length = parseBoxDeclarations("padding-top", part)?.[0]?.value;
		if (length === undefined) return;
		normalized.push(length);
	}
	return normalized.join(" ");
}

export function parseTableDeclarations(
	name: string,
	source: string,
): { property: CssTableProperty; value: string }[] | undefined {
	if (!isCssTableProperty(name)) return;
	const value = parseTableValue(name, source);
	return value === undefined ? undefined : [{ property: name, value }];
}

export function computeTableStyle(
	specified: TableSpecifiedStyle,
	parent: TableStyle,
	viewport: { width: number; height: number },
	fonts?: Readonly<BoxFontMetrics>,
	defaults: TableSpecifiedStyle = {},
): TableStyle {
	const result = { ...initialTableStyle };
	let inheritedSpacing = false;
	for (const name of cssTableProperties) {
		let value = specified[name];
		if (value === undefined || value === "revert") value = defaults[name];
		if (
			value === "inherit" ||
			(inherited.has(name) &&
				(value === undefined || value === "unset" || value === "revert"))
		) {
			result[name] = parent[name];
			if (name === "border-spacing") inheritedSpacing = true;
		} else if (value !== undefined && !wide.has(value)) result[name] = value;
	}
	let spacing: BoxSpecifiedStyle = {};
	if (!inheritedSpacing) {
		const value = parseTableValue("border-spacing", result["border-spacing"]);
		const parts =
			value === undefined ? undefined : splitLengthComponents(value);
		if (!parts)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported CSS table spacing",
			);
		spacing = {
			"padding-left": parts[0],
			"padding-top": parts[1] ?? parts[0],
		};
	}
	const box = computeBoxStyle(spacing, initialBoxStyle, viewport, fonts);
	if (!inheritedSpacing)
		result["border-spacing"] = `${box["padding-left"]} ${box["padding-top"]}`;
	if (
		Object.isFrozen(parent) &&
		cssTableProperties.every((name) => result[name] === parent[name])
	)
		return parent;
	return Object.freeze(result);
}
