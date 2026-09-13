import { AgentBrowserError } from "./errors.js";
import type { TextGlyph } from "./text-layout.js";

type SourceGlyph = Readonly<TextGlyph> & { readonly transformed?: true };

export function sourceGlyphCoordinatesEqual(
	first: number,
	second: number,
): boolean {
	return (
		Number.isFinite(first) &&
		Number.isFinite(second) &&
		Math.abs(first - second) <=
			4 * Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second))
	);
}

export function* consolidateSourceGlyphs(
	glyphs: readonly Readonly<TextGlyph>[],
	charge: (amount?: number) => void,
): IterableIterator<Readonly<TextGlyph>> {
	let pending: SourceGlyph | undefined;
	let last: SourceGlyph | undefined;
	let seen: Set<string> | undefined;
	const reject = () => {
		throw new AgentBrowserError(
			"unsupported",
			"Transformed glyph source geometry is ambiguous",
		);
	};
	for (const glyph of glyphs as readonly SourceGlyph[]) {
		charge();
		if (!glyph.ref) {
			if (pending) yield pending;
			pending = undefined;
			last = undefined;
			continue;
		}
		if (glyph.transformed === true) {
			if (
				!Number.isSafeInteger(glyph.formattingId) ||
				glyph.formattingId < 0 ||
				!Number.isSafeInteger(glyph.offset) ||
				glyph.offset < 0 ||
				!Number.isSafeInteger(glyph.codeUnits) ||
				glyph.codeUnits < 1 ||
				!Number.isSafeInteger(glyph.offset + glyph.codeUnits) ||
				!Number.isSafeInteger(glyph.line) ||
				glyph.line < 0 ||
				!Number.isFinite(glyph.x) ||
				!Number.isFinite(glyph.y) ||
				!Number.isFinite(glyph.advance) ||
				glyph.advance < 0 ||
				!Number.isFinite(glyph.x + glyph.advance) ||
				!Number.isFinite(glyph.fontSize) ||
				glyph.fontSize < 0 ||
				(glyph.fontSize === 0 && glyph.advance !== 0) ||
				!Number.isFinite(glyph.y + glyph.fontSize) ||
				glyph.kind !== "glyph"
			)
				reject();
		}
		if (
			pending?.transformed === true &&
			glyph.transformed === true &&
			pending.ref === glyph.ref &&
			pending.offset === glyph.offset &&
			pending.codeUnits === glyph.codeUnits
		) {
			if (
				pending.formattingId !== glyph.formattingId ||
				pending.line !== glyph.line ||
				pending.fontSize !== glyph.fontSize ||
				pending.visible !== glyph.visible ||
				pending.y !== glyph.y ||
				!last ||
				!sourceGlyphCoordinatesEqual(last.x + last.advance, glyph.x)
			)
				reject();
			const advance = glyph.x + glyph.advance - pending.x;
			if (!Number.isFinite(advance) || advance < pending.advance) reject();
			pending = Object.freeze({
				...pending,
				advance,
				supported: pending.supported && glyph.supported,
			});
		} else {
			if (pending) yield pending;
			if (glyph.transformed === true) {
				charge(glyph.ref.length);
				const key = `${glyph.ref}:${glyph.offset}:${glyph.codeUnits}`;
				seen ??= new Set();
				if (seen.has(key)) reject();
				seen.add(key);
			}
			pending = glyph;
		}
		last = glyph;
	}
	if (pending) yield pending;
}
