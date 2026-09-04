import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
	type BoxFontMetrics,
} from "./css-box.js";
import { splitLengthComponents } from "./css-math.js";

export const cssFlexProperties = Object.freeze([
	"flex-direction",
	"flex-wrap",
	"flex-grow",
	"flex-shrink",
	"flex-basis",
	"order",
	"justify-content",
	"align-items",
	"align-self",
	"align-content",
	"row-gap",
	"column-gap",
] as const);
export type CssFlexProperty = (typeof cssFlexProperties)[number];
export type FlexStyle = Readonly<Record<CssFlexProperty, string>>;
export type FlexSpecifiedStyle = Readonly<
	Partial<Record<CssFlexProperty, string>>
>;
export const initialFlexStyle: FlexStyle = Object.freeze({
	"flex-direction": "row",
	"flex-wrap": "nowrap",
	"flex-grow": "0",
	"flex-shrink": "1",
	"flex-basis": "auto",
	order: "0",
	"justify-content": "normal",
	"align-items": "normal",
	"align-self": "auto",
	"align-content": "normal",
	"row-gap": "normal",
	"column-gap": "normal",
});
export const flexStyleCapabilities = Object.freeze({
	partial: true,
	properties: cssFlexProperties,
	omittedShorthandBasis: "0%",
	numericFunctions: false,
	canonicalShorthandSerialization: false,
	layout: true,
	layoutProfile: "block-and-inline-flex-containers",
	nestedFlex: true,
	column: true,
	columnWrap: true,
	inlineFlex: true,
});
const properties = new Set<string>(cssFlexProperties);
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const directions = new Set(["row", "row-reverse", "column", "column-reverse"]);
const wraps = new Set(["nowrap", "wrap", "wrap-reverse"]);
const basisKeywords = new Set([
	"auto",
	"content",
	"min-content",
	"max-content",
	"fit-content",
]);
const components: Readonly<Record<string, readonly CssFlexProperty[]>> =
	Object.freeze({
		flex: Object.freeze(["flex-grow", "flex-shrink", "flex-basis"] as const),
		"flex-flow": Object.freeze(["flex-direction", "flex-wrap"] as const),
		gap: Object.freeze(["row-gap", "column-gap"] as const),
	});
export function isCssFlexProperty(
	property: string,
): property is CssFlexProperty {
	return properties.has(property);
}
export function flexShorthandComponents(
	property: string,
): readonly CssFlexProperty[] | undefined {
	return Object.hasOwn(components, property) ? components[property] : undefined;
}
function factor(value: string): string | undefined {
	if (!/^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?$/.test(value)) return;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? String(number) : undefined;
}
function length(value: string): string | undefined {
	if (wide.has(value) || value === "auto") return;
	return parseBoxDeclarations("width", value)?.[0]?.value;
}
function basis(value: string) {
	return basisKeywords.has(value) ? value : length(value);
}
function alignment(property: CssFlexProperty, value: string) {
	const self = property === "align-self" || property === "align-items";
	if (
		value === "normal" ||
		value === "stretch" ||
		(property === "align-self" && value === "auto")
	)
		return value;
	if (
		property !== "justify-content" &&
		["baseline", "first baseline", "last baseline"].includes(value)
	)
		return value === "first baseline" ? "baseline" : value;
	if (
		!self &&
		["space-between", "space-around", "space-evenly"].includes(value)
	)
		return value;
	const position = value.replace(/^(safe|unsafe) /, "");
	const allowed = [
		"start",
		"end",
		"center",
		"flex-start",
		"flex-end",
		...(self ? ["self-start", "self-end"] : []),
		...(property === "align-self" ? ["normal"] : []),
		...(property === "justify-content" ? ["left", "right"] : []),
	];
	return allowed.includes(position) ? value : undefined;
}
export function parseFlexValue(
	property: CssFlexProperty,
	value: string,
): string | undefined {
	if (wide.has(value)) return value;
	if (property === "flex-direction")
		return directions.has(value) ? value : undefined;
	if (property === "flex-wrap") return wraps.has(value) ? value : undefined;
	if (property === "flex-grow" || property === "flex-shrink")
		return factor(value);
	if (property === "flex-basis") return basis(value);
	if (property === "order")
		return /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))
			? String(Number(value))
			: undefined;
	if (property === "row-gap" || property === "column-gap")
		return value === "normal" ? value : length(value);
	return alignment(property, value);
}
export function parseFlexDeclarations(
	property: string,
	value: string,
): { property: CssFlexProperty; value: string }[] | undefined {
	if (isCssFlexProperty(property)) {
		const parsed = parseFlexValue(property, value);
		return parsed === undefined ? undefined : [{ property, value: parsed }];
	}
	const names = flexShorthandComponents(property);
	if (!names) return;
	if (wide.has(value)) return names.map((name) => ({ property: name, value }));
	const parts = splitLengthComponents(value);
	if (!parts || parts.some((part) => wide.has(part))) return;
	let values: string[] | undefined;
	if (property === "gap" && parts.length <= 2) {
		const parsed = parts.map((part) => parseFlexValue("row-gap", part));
		if (parsed.every((part) => part !== undefined))
			values = [parsed[0] as string, (parsed[1] ?? parsed[0]) as string];
	} else if (property === "flex-flow" && parts.length <= 2) {
		let direction: string | undefined;
		let wrap: string | undefined;
		for (const part of parts) {
			if (directions.has(part) && direction === undefined) direction = part;
			else if (wraps.has(part) && wrap === undefined) wrap = part;
			else return;
		}
		values = [direction ?? "row", wrap ?? "nowrap"];
	} else if (property === "flex") {
		if (value === "none") values = ["0", "0", "auto"];
		else if (parts.length === 1) {
			const grow = factor(parts[0]);
			const size = basis(parts[0]);
			if (grow !== undefined) values = [grow, "1", "0%"];
			else if (size !== undefined) values = ["1", "1", size];
		} else if (parts.length === 2) {
			const first = factor(parts[0]);
			const second = factor(parts[1]);
			if (first !== undefined && second !== undefined)
				values = [first, second, "0%"];
			else if (first !== undefined && basis(parts[1]) !== undefined)
				values = [first, "1", basis(parts[1]) as string];
			else if (second !== undefined && basis(parts[0]) !== undefined)
				values = [second, "1", basis(parts[0]) as string];
		} else if (parts.length === 3) {
			if (
				factor(parts[0]) !== undefined &&
				factor(parts[1]) !== undefined &&
				basis(parts[2]) !== undefined
			)
				values = [
					factor(parts[0]) as string,
					factor(parts[1]) as string,
					basis(parts[2]) as string,
				];
			else if (
				factor(parts[0]) === undefined &&
				basis(parts[0]) !== undefined &&
				factor(parts[1]) !== undefined &&
				factor(parts[2]) !== undefined
			)
				values = [
					factor(parts[1]) as string,
					factor(parts[2]) as string,
					basis(parts[0]) as string,
				];
		}
	}
	return values?.map((entry, index) => ({
		property: names[index],
		value: entry,
	}));
}
export function serializeFlexShorthand(
	property: string,
	values: readonly string[],
): string {
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	return property === "gap" && values[0] === values[1]
		? values[0]
		: values.join(" ");
}
export function computeFlexStyle(
	specified: FlexSpecifiedStyle,
	parent: FlexStyle,
	viewport: { width: number; height: number },
	fonts?: BoxFontMetrics,
): FlexStyle {
	const result = { ...initialFlexStyle };
	for (const property of cssFlexProperties) {
		const value = specified[property];
		if (value === undefined || ["initial", "unset", "revert"].includes(value))
			continue;
		if (value === "inherit") result[property] = parent[property];
		else if (
			(property === "flex-basis" && !basisKeywords.has(value)) ||
			((property === "row-gap" || property === "column-gap") &&
				value !== "normal")
		)
			result[property] = computeBoxStyle(
				{ width: value },
				initialBoxStyle,
				viewport,
				fonts,
			).width;
		else result[property] = value;
	}
	return Object.freeze(result);
}
export function isFlexDisplay(value: string): boolean {
	return ["flex", "inline-flex", "block flex", "inline flex"].includes(value);
}
export function blockifyDisplay(value: string): string {
	if (["none", "contents"].includes(value)) return value;
	if (value === "inline-block" || value === "inline flow-root") return "block";
	if (value === "inline-table" || value === "inline table") return "table";
	if (value === "inline-flex" || value === "inline flex") return "flex";
	if (value === "inline-grid" || value === "inline grid") return "grid";
	if (["inline", "inline flow"].includes(value) || value.startsWith("table-"))
		return "block";
	return value;
}
