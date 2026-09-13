import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { matchFontWeight } from "./font-weight.js";
import { layoutNumber } from "./layout-values.js";

export function nativeFontXHeight(fontSize: number, fontWeight = 400): number {
	const size = layoutNumber(fontSize);
	const glyph = bitmapGlyph("x", matchFontWeight(fontWeight));
	return layoutNumber((size * glyph.ink.height) / bitmapFont.unitsPerEm);
}
