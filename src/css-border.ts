import { normalizeCssColor } from "./css-color.js";
import {
	isCssLengthMath,
	normalizeLengthMath,
	splitLengthComponents,
} from "./css-math.js";

export const borderSides = ["top", "right", "bottom", "left"] as const;
export type BorderSide = (typeof borderSides)[number];
export type BorderWidthProperty = `border-${BorderSide}-width`;
export type BorderStyleProperty = `border-${BorderSide}-style`;
export type BorderColorProperty = `border-${BorderSide}-color`;
export const borderWidthProperties = Object.freeze(
	borderSides.map((side) => `border-${side}-width` as BorderWidthProperty),
);
export const borderStyleProperties = Object.freeze(
	borderSides.map((side) => `border-${side}-style` as BorderStyleProperty),
);
export const borderColorProperties = Object.freeze(
	borderSides.map((side) => `border-${side}-color` as BorderColorProperty),
);
const wide = new Set(["initial", "inherit", "unset", "revert"]);
export function normalizeBorderWidth(value: string): string | undefined {
	if (wide.has(value)) return value;
	if (value === "thin") return "1px";
	if (value === "medium") return "3px";
	if (value === "thick") return "5px";
	if (isCssLengthMath(value)) return normalizeLengthMath(value, false);
	const parsed =
		/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|em|rem|ex|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax)?$/.exec(
			value,
		);
	if (
		!parsed ||
		!Number.isFinite(Number(parsed[1])) ||
		Number(parsed[1]) < 0 ||
		(!parsed[2] && Number(parsed[1]) !== 0)
	)
		return;
	return `${Number(parsed[1])}${parsed[2] ?? "px"}`;
}
export function normalizeBorderStyle(value: string): string | undefined {
	return wide.has(value) ||
		["none", "hidden", "solid", "dashed", "groove"].includes(value)
		? value
		: undefined;
}
export function isBorderShorthand(name: string) {
	return [
		"border",
		"border-width",
		"border-style",
		"border-color",
		...borderSides.map((side) => `border-${side}`),
	].includes(name);
}
export function parseBorderShorthand(
	property: string,
	value: string,
):
	| {
			property: BorderWidthProperty | BorderStyleProperty | BorderColorProperty;
			value: string;
	  }[]
	| undefined {
	if (value.length > 4096) return;
	const components = splitLengthComponents(value);
	if (!components) return;
	const suffix = property.slice(7);
	if (["width", "style", "color"].includes(suffix)) {
		if (
			components.length > 4 ||
			(components.length > 1 && components.some((part) => wide.has(part)))
		)
			return;
		const normalize =
			suffix === "width"
				? normalizeBorderWidth
				: suffix === "style"
					? normalizeBorderStyle
					: (part: string) => (wide.has(part) ? part : normalizeCssColor(part));
		const values = components.map(normalize);
		if (values.some((part) => part === undefined)) return;
		const sides = [
			values[0],
			values[1] ?? values[0],
			values[2] ?? values[0],
			values[3] ?? values[1] ?? values[0],
		];
		return borderSides.map((side, index) => ({
			property: `border-${side}-${suffix}` as
				| BorderWidthProperty
				| BorderStyleProperty
				| BorderColorProperty,
			value: sides[index] as string,
		}));
	}
	const sides: readonly BorderSide[] =
		property === "border"
			? borderSides
			: borderSides.filter((side) => property === `border-${side}`);
	if (!sides.length) return;
	let width: string | undefined;
	let style: string | undefined;
	let color: string | undefined;
	if (wide.has(value)) width = style = color = value;
	else
		for (const part of components) {
			if (wide.has(part)) return;
			const length = normalizeBorderWidth(part);
			const line = normalizeBorderStyle(part);
			const ink = normalizeCssColor(part);
			if (length !== undefined && width === undefined) width = length;
			else if (line !== undefined && style === undefined) style = line;
			else if (ink !== undefined && color === undefined) color = ink;
			else return;
		}
	return sides.flatMap((side) => [
		{
			property: `border-${side}-width` as BorderWidthProperty,
			value: width ?? "3px",
		},
		{
			property: `border-${side}-style` as BorderStyleProperty,
			value: style ?? "none",
		},
		{
			property: `border-${side}-color` as BorderColorProperty,
			value: color ?? "currentcolor",
		},
	]);
}
