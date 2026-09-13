import { bitmapGlyph } from "./bitmap-font.js";
import { resolveNativeFont } from "./font-family.js";
import { matchFontWeight } from "./font-weight.js";
import { layoutNumber } from "./layout-values.js";

export function nativeFontXHeight(
	fontSize: number,
	fontWeight = 400,
	fontFamily = '"agent mono"',
): number {
	const size = layoutNumber(fontSize);
	const { font } = resolveNativeFont(fontFamily);
	const glyph = bitmapGlyph("x", matchFontWeight(fontWeight));
	return layoutNumber((size * glyph.ink.height) / font.unitsPerEm);
}
