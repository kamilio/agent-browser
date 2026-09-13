import { normalizeCssColor, parseCssColor } from "./css-color.js";
import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
	type BoxFontMetrics,
} from "./css-box.js";
import { cssMathLimits, splitLengthComponents } from "./css-math.js";
import type { Rgba } from "./raster.js";

export const cssTextDecorationProperties = Object.freeze([
	"text-decoration-line",
	"text-decoration-thickness",
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
	"text-decoration-thickness": "auto",
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
	if (property === "text-decoration-thickness") {
		if (["auto", "from-font", "thin", "medium", "thick"].includes(value))
			return value;
		return parseBoxDeclarations("margin-top", value)?.[0].value;
	}
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
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index <= value.length; index++) {
		if (value[index] === "(" && ++depth > cssMathLimits.maxDepth) return;
		if (value[index] === ")" && --depth < 0) return;
		if (
			index === value.length ||
			(depth === 0 && /[\t\n\f\r ]/.test(value[index]))
		) {
			if (depth !== 0) return;
			if (index > start) {
				const component = splitLengthComponents(value.slice(start, index));
				if (!component || component.length !== 1) return;
				parts.push(component[0]);
				if (parts.length > 6) return;
			}
			start = index + 1;
		}
	}
	return parts.length ? parts : undefined;
}

export function serializeTextDecoration(
	values: TextDecorationSpecifiedStyle,
): string {
	return cssTextDecorationProperties
		.filter(
			(property) =>
				property !== "text-decoration-thickness" || values[property] !== "auto",
		)
		.map((property) => values[property] ?? "")
		.join(" ");
}

export function computeTextDecorationStyle(
	specified: TextDecorationSpecifiedStyle,
	parent: TextDecorationStyle,
	color: Rgba,
	viewport: { width: number; height: number } = { width: 1280, height: 720 },
	fonts?: Readonly<BoxFontMetrics>,
): TextDecorationStyle {
	const values = { ...initial };
	for (const property of cssTextDecorationProperties) {
		const value = specified[property];
		if (value === "inherit") values[property] = parent[property];
		else if (value !== undefined && !wide.has(value)) values[property] = value;
	}
	const thickness = values["text-decoration-thickness"];
	if (
		specified["text-decoration-thickness"] !== "inherit" &&
		!["auto", "from-font", "thin", "medium", "thick"].includes(thickness)
	)
		values["text-decoration-thickness"] = computeBoxStyle(
			{ "margin-top": thickness },
			initialBoxStyle,
			viewport,
			fonts,
		)["margin-top"];
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
