import { normalizeSvgFill, parseSvgFill } from "./svg-paint-value.js";

export function normalizeSvgClipPath(source: string): string | undefined {
	const normalized = normalizeSvgFill(source);
	if (normalized === undefined || normalized === "none") return normalized;
	const parsed = parseSvgFill(normalized);
	return parsed !== null &&
		typeof parsed === "object" &&
		"reference" in parsed &&
		parsed.fallback === undefined
		? normalized
		: undefined;
}

export function parseSvgClipPath(source: string): string | null | undefined {
	const normalized = normalizeSvgClipPath(source);
	if (normalized === undefined) return undefined;
	if (normalized === "none") return null;
	const parsed = parseSvgFill(normalized);
	return parsed !== null && typeof parsed === "object" && "reference" in parsed
		? parsed.reference
		: undefined;
}
