import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export function wordSpacingAdvance(
	character: string,
	advance: number,
	spacing: number,
): number {
	layoutNumber(advance);
	layoutNumber(spacing, true);
	if (spacing === 0 || advance === 0) return advance;
	if (/^[\u1361\u{10100}\u{10101}\u{1039f}\u{1091f}]$/u.test(character))
		throw new AgentBrowserError(
			"unsupported",
			"Word spacing for non-native separator glyphs is unsupported",
		);
	if (character !== " " && character !== "\u00a0") return advance;
	const result = layoutNumber(advance + spacing, true);
	if (result < 0)
		throw new AgentBrowserError(
			"unsupported",
			"Word spacing with a backwards separator advance is unsupported",
		);
	return result;
}
