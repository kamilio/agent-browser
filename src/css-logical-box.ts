import { parseBoxDeclarations } from "./css-box.js";
import { splitLengthComponents } from "./css-math.js";

const marginBlockComponents = Object.freeze([
	"margin-block-start",
	"margin-block-end",
] as const);
const paddingBlockComponents = Object.freeze([
	"padding-block-start",
	"padding-block-end",
] as const);
const marginInlineComponents = Object.freeze([
	"margin-inline-start",
	"margin-inline-end",
] as const);
const paddingInlineComponents = Object.freeze([
	"padding-inline-start",
	"padding-inline-end",
] as const);

export const cssLogicalBlockProperties = Object.freeze([
	...marginBlockComponents,
	...paddingBlockComponents,
] as const);
export type CssLogicalBlockProperty =
	(typeof cssLogicalBlockProperties)[number];
export const cssLogicalSpacingProperties = Object.freeze([
	...cssLogicalBlockProperties,
	...marginInlineComponents,
	...paddingInlineComponents,
] as const);
export type CssLogicalSpacingProperty =
	(typeof cssLogicalSpacingProperties)[number];

const properties = new Set<string>(cssLogicalBlockProperties);
const spacingProperties = new Set<string>(cssLogicalSpacingProperties);
const horizontalTbPhysicalProperties = Object.freeze({
	"margin-block-start": "margin-top",
	"margin-block-end": "margin-bottom",
	"padding-block-start": "padding-top",
	"padding-block-end": "padding-bottom",
	"margin-inline-start": "margin-left",
	"margin-inline-end": "margin-right",
	"padding-inline-start": "padding-left",
	"padding-inline-end": "padding-right",
} as const);

export function isCssLogicalBlockProperty(
	name: string,
): name is CssLogicalBlockProperty {
	return properties.has(name);
}

export function logicalBlockComponents(
	name: string,
): readonly [CssLogicalBlockProperty, CssLogicalBlockProperty] | undefined {
	if (name === "margin-block") return marginBlockComponents;
	if (name === "padding-block") return paddingBlockComponents;
	return undefined;
}

export function logicalBlockPhysicalProperty(name: string) {
	return isCssLogicalBlockProperty(name)
		? horizontalTbPhysicalProperties[name]
		: undefined;
}

export function parseLogicalBlockDeclarations(
	name: string,
	value: string,
): { property: CssLogicalBlockProperty; value: string }[] | undefined {
	const components = logicalBlockComponents(name);
	if (components) {
		const parts = splitLengthComponents(value);
		if (!parts || parts.length > 2) return;
		const expanded = parseBoxDeclarations(
			name === "margin-block" ? "margin" : "padding",
			value,
		);
		return expanded?.slice(0, 2).map((entry, index) => ({
			property: components[index],
			value: entry.value,
		}));
	}
	if (!isCssLogicalBlockProperty(name)) return;
	const expanded = parseBoxDeclarations(
		horizontalTbPhysicalProperties[name],
		value,
	);
	return expanded?.map((entry) => ({ property: name, value: entry.value }));
}

export function isCssLogicalSpacingProperty(
	name: string,
): name is CssLogicalSpacingProperty {
	return spacingProperties.has(name);
}

export function logicalSpacingComponents(
	name: string,
): readonly [CssLogicalSpacingProperty, CssLogicalSpacingProperty] | undefined {
	if (name === "margin-inline") return marginInlineComponents;
	if (name === "padding-inline") return paddingInlineComponents;
	return logicalBlockComponents(name);
}

export function logicalSpacingPhysicalProperty(name: string) {
	return isCssLogicalSpacingProperty(name)
		? horizontalTbPhysicalProperties[name]
		: undefined;
}

export function parseLogicalSpacingDeclarations(
	name: string,
	value: string,
): { property: CssLogicalSpacingProperty; value: string }[] | undefined {
	if (isCssLogicalBlockProperty(name) || logicalBlockComponents(name))
		return parseLogicalBlockDeclarations(name, value);
	const components = logicalSpacingComponents(name);
	if (components) {
		const parts = splitLengthComponents(value);
		if (!parts || parts.length > 2) return;
		const expanded = parseBoxDeclarations(
			name === "margin-inline" ? "margin" : "padding",
			value,
		);
		return expanded?.slice(0, 2).map((entry, index) => ({
			property: components[index],
			value: entry.value,
		}));
	}
	if (!isCssLogicalSpacingProperty(name)) return;
	const expanded = parseBoxDeclarations(
		horizontalTbPhysicalProperties[name],
		value,
	);
	return expanded?.map((entry) => ({ property: name, value: entry.value }));
}
