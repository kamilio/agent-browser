import type { TextStyle } from "./css-text.js";
import { AgentBrowserError } from "./errors.js";
import { resolveNativeFont } from "./font-family.js";
import { layoutNumber } from "./layout-values.js";

export interface TextFontExtent {
	fontSize: number;
	advance: number;
	ascent: number;
	above: number;
	below: number;
}

export function textFontExtent(style: TextStyle): TextFontExtent {
	const { font } = resolveNativeFont(style["font-family"]);
	const fontSize = Number.parseFloat(style["font-size"]);
	layoutNumber(fontSize);
	if (fontSize > font.maxFontSize)
		throw new AgentBrowserError(
			"resource-limit",
			"Text font size limit exceeded",
		);
	const lineHeight = layoutNumber(
		style["line-height"] === "normal"
			? fontSize * 1.25
			: style["line-height"].endsWith("px")
				? Number.parseFloat(style["line-height"])
				: Number(style["line-height"]) * fontSize,
	);
	const scale = fontSize / font.unitsPerEm;
	const ascent = font.ascent * scale;
	return {
		fontSize,
		advance: font.advance * scale,
		ascent,
		above: ascent + (lineHeight - fontSize) / 2,
		below: font.descent * scale + (lineHeight - fontSize) / 2,
	};
}
