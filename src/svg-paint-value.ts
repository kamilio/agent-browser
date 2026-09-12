import {
	type CssColor,
	normalizeCssColor,
	parseCssColor,
} from "./css-color.js";
import type { Rgba } from "./raster.js";

export type SvgFill =
	| CssColor
	| null
	| Readonly<{ reference: string; fallback?: CssColor | null }>;

function localPaintReference(value: string) {
	return /^url\([\t\n\f\r ]*(["']?)#([^\s\u0000-\u001f\u007f"'()\\]+)\1[\t\n\f\r ]*\)(?:[\t\n\f\r ]+(.+))?$/i.exec(
		value,
	);
}

export function normalizeSvgFill(source: string): string | undefined {
	if (typeof source !== "string" || source.length > 4096) return undefined;
	const value = source.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
	if (value.toLowerCase() === "none") return "none";
	const reference = localPaintReference(value);
	if (!reference) return normalizeCssColor(value);
	const fallback = reference[3];
	const normalized =
		fallback === undefined
			? ""
			: fallback.toLowerCase() === "none"
				? "none"
				: normalizeCssColor(fallback);
	if (normalized === undefined) return undefined;
	const result = `url("#${reference[2]}")${normalized ? ` ${normalized}` : ""}`;
	return result.length <= 4096 ? result : undefined;
}

export function parseSvgFill(source: string): SvgFill | undefined {
	const normalized = normalizeSvgFill(source);
	if (normalized === undefined) return undefined;
	if (normalized === "none") return null;
	const reference = localPaintReference(normalized);
	if (!reference) return parseCssColor(normalized);
	return Object.freeze({
		reference: reference[2],
		...(reference[3] === undefined
			? {}
			: {
					fallback:
						reference[3] === "none" ? null : parseCssColor(reference[3]),
				}),
	});
}

export function serializeSvgFill(fill: SvgFill, currentColor: Rgba): string {
	if (fill === null) return "none";
	if (typeof fill === "object" && "reference" in fill)
		return `url("#${fill.reference}")${
			fill.fallback === undefined
				? ""
				: ` ${serializeSvgFill(fill.fallback, currentColor)}`
		}`;
	const color = fill === "currentcolor" ? currentColor : fill;
	return color[3] === 255
		? `rgb(${color[0]}, ${color[1]}, ${color[2]})`
		: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Number((color[3] / 255).toFixed(3))})`;
}
