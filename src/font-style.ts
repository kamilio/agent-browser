import {
	bitmapFont,
	bitmapGlyph,
	type BitmapFontWeight,
} from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";

export type NativeFontStyle = "normal" | "italic" | "oblique";

const syntheticSlope = Math.tan((14 * Math.PI) / 180);

export function parseFontStyle(value: string): NativeFontStyle | undefined {
	if (typeof value !== "string" || value.length > 4096) return;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === "normal" ||
		normalized === "italic" ||
		normalized === "oblique"
	)
		return normalized;
}

export function fontStyleSlope(style: NativeFontStyle): number {
	if (style === "normal") return 0;
	if (style === "italic" || style === "oblique") return syntheticSlope;
	throw new AgentBrowserError("invalid-input", "Invalid native font style");
}

export function bitmapGlyphInk(
	character: string,
	weight: BitmapFontWeight = 400,
	style: NativeFontStyle = "normal",
): Readonly<{ x: number; y: number; width: number; height: number }> {
	const slope = fontStyleSlope(style);
	const ink = bitmapGlyph(character, weight).ink;
	if (slope === 0 || ink.width === 0 || ink.height === 0) return ink;
	return {
		x: ink.x + slope * (bitmapFont.ascent - ink.y - ink.height),
		y: ink.y,
		width: ink.width + slope * ink.height,
		height: ink.height,
	};
}
