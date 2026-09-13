import { normalizeCssColor, parseCssColor } from "./css-color.js";
import { splitLengthComponents } from "./css-math.js";
import type { Rgba } from "./raster.js";

export const cssTextDecorationProperties = Object.freeze([
	"text-decoration-line",
	"text-decoration-style",
	"text-decoration-color",
] as const);
export type CssTextDecorationProperty =
	(typeof cssTextDecorationProperties)[number];
export type TextDecorationStyle = Readonly<
	Record<CssTextDecorationProperty, string>
>;
export type TextDecorationSpecifiedStyle = Readonly<
	Partial<TextDecorationStyle>
>;
export const initialTextDecorationStyle: TextDecorationStyle = Object.freeze({
	"text-decoration-line": "none",
	"text-decoration-style": "solid",
	"text-decoration-color": "rgb(0, 0, 0)",
});
const initial = {
	...initialTextDecorationStyle,
	"text-decoration-color": "currentcolor",
};
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const lines = ["underline", "overline", "line-through"];

export function isCssTextDecorationProperty(
	property: string,
): property is CssTextDecorationProperty {
	return (cssTextDecorationProperties as readonly string[]).includes(property);
}

export function parseTextDecorationValue(
	property: CssTextDecorationProperty,
	source: string,
): string | undefined {
	if (source.length > 4096) return;
	const value = source
		.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
		.toLowerCase();
	if (wide.has(value)) return value;
	if (property === "text-decoration-color") return normalizeCssColor(value);
	if (property === "text-decoration-style")
		return value === "solid" ? value : undefined;
	if (value === "none") return value;
	const parts = value.split(/[\t\n\f\r ]+/);
	if (
		parts.some((part) => !lines.includes(part)) ||
		new Set(parts).size !== parts.length
	)
		return;
	return lines.filter((line) => parts.includes(line)).join(" ");
}

export function parseTextDecorationDeclarations(
	property: string,
	source: string,
): { property: CssTextDecorationProperty; value: string }[] | undefined {
	if (source.length > 4096) return;
	if (isCssTextDecorationProperty(property)) {
		const value = parseTextDecorationValue(property, source);
		return value === undefined ? undefined : [{ property, value }];
	}
	if (property !== "text-decoration") return;
	const value = source
		.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
		.toLowerCase();
	if (wide.has(value))
		return cssTextDecorationProperties.map((property) => ({ property, value }));
	const components = shorthandComponents(value);
	if (!components?.length) return;
	const values: Partial<Record<CssTextDecorationProperty, string>> = {};
	const lineParts: string[] = [];
	for (const part of components) {
		if (wide.has(part)) return;
		if (part === "none" || lines.includes(part)) {
			lineParts.push(part);
			continue;
		}
		const component = cssTextDecorationProperties
			.slice(1)
			.find(
				(property) =>
					values[property] === undefined &&
					parseTextDecorationValue(property, part) !== undefined,
			);
		if (!component) return;
		values[component] = parseTextDecorationValue(component, part);
	}
	if (lineParts.length) {
		const line = parseTextDecorationValue(
			"text-decoration-line",
			lineParts.join(" "),
		);
		if (line === undefined) return;
		values["text-decoration-line"] = line;
	}
	return cssTextDecorationProperties.map((property) => ({
		property,
		value: values[property] ?? initial[property],
	}));
}

function shorthandComponents(value: string): string[] | undefined {
	let depth = 0;
	for (let index = 0; index < value.length; index++) {
		if (value[index] === "(") depth++;
		if (value[index] === ")") depth--;
		if (depth === 0 && /[\t\n\f\r ]/.test(value[index])) {
			const first = splitLengthComponents(value.slice(0, index));
			const rest = splitLengthComponents(value.slice(index + 1));
			return first && rest ? [...first, ...rest] : undefined;
		}
	}
	return splitLengthComponents(value);
}

export function computeTextDecorationStyle(
	specified: TextDecorationSpecifiedStyle,
	parent: TextDecorationStyle,
	color: Rgba,
): TextDecorationStyle {
	const values = { ...initial };
	for (const property of cssTextDecorationProperties) {
		const value = specified[property];
		if (value === "inherit") values[property] = parent[property];
		else if (value !== undefined && !wide.has(value)) values[property] = value;
	}
	const ink = parseCssColor(values["text-decoration-color"]);
	const resolved = !ink || ink === "currentcolor" ? color : ink;
	return Object.freeze({
		...values,
		"text-decoration-color":
			resolved[3] === 255
				? `rgb(${resolved[0]}, ${resolved[1]}, ${resolved[2]})`
				: `rgba(${resolved[0]}, ${resolved[1]}, ${resolved[2]}, ${Number((resolved[3] / 255).toFixed(3))})`,
	});
}
