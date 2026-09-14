import type { CssTextProperty } from "./css-text.js";

export const cssFontProperties = Object.freeze([
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"line-height",
] as const satisfies readonly CssTextProperty[]);

const wide = new Set(["initial", "inherit", "unset", "revert"]);

export function parseFontWideDeclarations(source: string) {
	const value = source
		.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
		.toLowerCase();
	if (!wide.has(value)) return;
	return cssFontProperties.map((property) => ({ property, value }));
}
