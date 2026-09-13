import { lengthUsesFont } from "./css-math.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { computeFontWeight, parseFontWeight } from "./font-weight.js";
import { layoutNumber } from "./layout-values.js";
import { computeTextIndent, parseTextIndent } from "./text-indent.js";
import { parseTextTransform } from "./text-transform-style.js";

export const cssTextProperties = Object.freeze([
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"white-space",
	"overflow-wrap",
	"text-align",
	"text-indent",
	"text-transform",
] as const);
export type CssTextProperty = (typeof cssTextProperties)[number];
export type TextStyle = Readonly<Record<CssTextProperty, string>>;
export type TextSpecifiedStyle = Readonly<
	Partial<Record<CssTextProperty, string>>
>;
export const initialTextStyle: TextStyle = Object.freeze({
	"font-family": '"agent mono"',
	"font-size": "16px",
	"font-weight": "400",
	"line-height": "normal",
	"white-space": "normal",
	"overflow-wrap": "normal",
	"text-align": "start",
	"text-indent": "0px",
	"text-transform": "none",
});
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const length =
	/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|em|rem|ex|%|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax)?$/;
const absoluteFactors: Readonly<Record<string, number>> = Object.freeze({
	px: 1,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
	in: 96,
	pt: 96 / 72,
	pc: 16,
});
const absoluteFontSizes: Readonly<Record<string, number>> = Object.freeze({
	"xx-small": (16 * 3) / 5,
	"x-small": (16 * 3) / 4,
	small: (16 * 8) / 9,
	medium: 16,
	large: (16 * 6) / 5,
	"x-large": (16 * 3) / 2,
	"xx-large": 16 * 2,
	"xxx-large": 16 * 3,
});

export function isCssTextProperty(
	property: string,
): property is CssTextProperty {
	return (cssTextProperties as readonly string[]).includes(property);
}

export function parseTextValue(
	property: CssTextProperty,
	value: string,
): string | undefined {
	if (wide.has(value)) return value;
	if (property === "text-transform") return parseTextTransform(value);
	if (property === "text-indent") return parseTextIndent(value);
	if (property === "font-weight") return parseFontWeight(value);
	if (property === "overflow-wrap")
		return ["normal", "break-word", "anywhere"].includes(value)
			? value
			: undefined;
	if (property === "white-space")
		return ["normal", "nowrap", "pre", "pre-line", "pre-wrap"].includes(value)
			? value
			: undefined;
	if (property === "text-align")
		return ["start", "end", "left", "right", "center"].includes(value)
			? value
			: undefined;
	if (property === "font-family")
		return ["monospace", '"agent mono"', "'agent mono'", "agent mono"].includes(
			value,
		)
			? '"agent mono"'
			: undefined;
	if (property === "line-height" && value === "normal") return value;
	if (property === "font-size") {
		if (Object.hasOwn(absoluteFontSizes, value))
			return `${absoluteFontSizes[value]}px`;
		if (value === "larger" || value === "smaller") return value;
	}
	const parsed = length.exec(value);
	if (!parsed || !Number.isFinite(Number(parsed[1])) || Number(parsed[1]) < 0)
		return;
	if (property === "font-size" && !parsed[2] && Number(parsed[1]) !== 0) return;
	return `${Number(parsed[1])}${parsed[2] ?? (property === "font-size" ? "px" : "")}`;
}

export function computeTextStyle(
	specified: TextSpecifiedStyle,
	parent: TextStyle,
	viewport: { width: number; height: number },
	rootFontSize: number,
	pre = false,
	root = false,
): TextStyle {
	const result = { ...parent };
	for (const property of cssTextProperties) {
		const value = specified[property];
		if (value === undefined || value === "revert") {
			if (property === "white-space" && pre) result[property] = "pre";
			continue;
		}
		if (value === "initial") result[property] = initialTextStyle[property];
		else if (value !== "inherit" && value !== "unset") result[property] = value;
	}
	result["font-weight"] = computeFontWeight(
		result["font-weight"],
		parent["font-weight"],
	);
	if (result["font-size"] === "larger" || result["font-size"] === "smaller") {
		const parentSize = Number.parseFloat(parent["font-size"]);
		result["font-size"] = `${layoutNumber(
			result["font-size"] === "larger" ? parentSize * 1.2 : parentSize / 1.2,
		)}px`;
	}
	const pixels = (
		value: string,
		relative: number,
		rootSize: number,
		font: TextStyle,
	) => {
		const parsed = length.exec(value);
		if (!parsed) return value;
		const unit = parsed[2] ?? "px";
		const factor =
			unit === "ex"
				? nativeFontXHeight(
						Number.parseFloat(font["font-size"]),
						Number(font["font-weight"]),
					)
				: (absoluteFactors[unit] ??
					{
						em: relative,
						rem: rootSize,
						"%": relative / 100,
						vw: viewport.width / 100,
						vh: viewport.height / 100,
						vmin: Math.min(viewport.width, viewport.height) / 100,
						vmax: Math.max(viewport.width, viewport.height) / 100,
					}[unit]);
		return `${layoutNumber(Number(parsed[1]) * factor)}px`;
	};
	result["font-size"] = pixels(
		result["font-size"],
		Number.parseFloat(parent["font-size"]),
		rootFontSize,
		root ? initialTextStyle : parent,
	);
	if (length.exec(result["line-height"])?.[2])
		result["line-height"] = pixels(
			result["line-height"],
			Number.parseFloat(result["font-size"]),
			root ? Number.parseFloat(result["font-size"]) : rootFontSize,
			result,
		);
	const indent = specified["text-indent"];
	if (indent !== undefined && !wide.has(indent))
		result["text-indent"] = computeTextIndent(
			indent,
			Number.parseFloat(result["font-size"]),
			root ? Number.parseFloat(result["font-size"]) : rootFontSize,
			viewport,
			lengthUsesFont(indent, "ex")
				? nativeFontXHeight(
						Number.parseFloat(result["font-size"]),
						Number(result["font-weight"]),
					)
				: undefined,
		);
	return cssTextProperties.every(
		(property) => result[property] === parent[property],
	)
		? parent
		: Object.freeze(result);
}
