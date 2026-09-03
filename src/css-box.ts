import { AgentBrowserError } from "./errors.js";

export const cssBoxProperties = Object.freeze([
	"width",
	"height",
	"min-width",
	"min-height",
	"max-width",
	"max-height",
	"box-sizing",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
] as const);
export type CssBoxProperty = (typeof cssBoxProperties)[number];
export type BoxStyle = Readonly<Record<CssBoxProperty, string>>;
export type BoxSpecifiedStyle = Readonly<
	Partial<Record<CssBoxProperty, string>>
>;
const properties = new Set<string>(cssBoxProperties);
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const length =
	/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax|%)?$/;
const absoluteFactors: Readonly<Record<string, number>> = Object.freeze({
	px: 1,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
	in: 96,
	pt: 96 / 72,
	pc: 16,
});

export const initialBoxStyle: BoxStyle = Object.freeze(
	Object.fromEntries(
		cssBoxProperties.map((property) => [
			property,
			property === "box-sizing"
				? "content-box"
				: property.startsWith("max-")
					? "none"
					: property.startsWith("margin-") || property.startsWith("padding-")
						? "0px"
						: "auto",
		]),
	) as Record<CssBoxProperty, string>,
);

export function isCssBoxProperty(property: string): property is CssBoxProperty {
	return properties.has(property);
}

function normalize(
	property: CssBoxProperty,
	value: string,
): string | undefined {
	if (wide.has(value)) return value;
	if (property === "box-sizing")
		return ["content-box", "border-box"].includes(value) ? value : undefined;
	if (
		value === "auto" &&
		!property.startsWith("padding-") &&
		!property.startsWith("max-")
	)
		return value;
	if (value === "none" && property.startsWith("max-")) return value;
	const parsed = length.exec(value);
	if (!parsed) return;
	const number = Number(parsed[1]);
	if (
		!Number.isFinite(number) ||
		(!parsed[2] && number !== 0) ||
		(number < 0 && !property.startsWith("margin-"))
	)
		return;
	return `${number}${parsed[2] ?? "px"}`;
}

export function parseBoxDeclarations(
	property: string,
	value: string,
): { property: CssBoxProperty; value: string }[] | undefined {
	if (property === "margin" || property === "padding") {
		const parts = value.split(" ");
		if (
			parts.length < 1 ||
			parts.length > 4 ||
			(parts.length > 1 && parts.some((part) => wide.has(part)))
		)
			return;
		const values = [
			parts[0],
			parts[1] ?? parts[0],
			parts[2] ?? parts[0],
			parts[3] ?? parts[1] ?? parts[0],
		];
		const result: { property: CssBoxProperty; value: string }[] = [];
		for (const [index, side] of ["top", "right", "bottom", "left"].entries()) {
			const name = `${property}-${side}` as CssBoxProperty;
			const normalized = normalize(name, values[index]);
			if (normalized === undefined) return;
			result.push({ property: name, value: normalized });
		}
		return result;
	}
	if (!isCssBoxProperty(property)) return;
	const normalized = normalize(property, value);
	return normalized === undefined
		? undefined
		: [{ property, value: normalized }];
}

export function computeBoxStyle(
	specified: BoxSpecifiedStyle,
	parent: BoxStyle,
	viewport: { width: number; height: number },
): BoxStyle {
	const result = { ...initialBoxStyle };
	for (const property of cssBoxProperties) {
		const value = specified[property];
		if (value === undefined || ["initial", "unset", "revert"].includes(value))
			continue;
		if (value === "inherit") {
			result[property] = parent[property];
			continue;
		}
		const parsed = length.exec(value);
		if (!parsed || parsed[2] === "%") {
			result[property] = value;
			continue;
		}
		const unit = parsed[2] ?? "px";
		const factor =
			absoluteFactors[unit] ??
			{
				vw: viewport.width / 100,
				vh: viewport.height / 100,
				vmin: Math.min(viewport.width, viewport.height) / 100,
				vmax: Math.max(viewport.width, viewport.height) / 100,
			}[unit];
		const pixels = Number(parsed[1]) * factor;
		if (!Number.isFinite(pixels))
			throw new AgentBrowserError(
				"resource-limit",
				"CSS box computed length overflow",
			);
		result[property] = `${pixels}px`;
	}
	return Object.freeze(result);
}
