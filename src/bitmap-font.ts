import { AgentBrowserError } from "./errors.js";

export interface BitmapGlyph {
	character: string;
	supported: boolean;
	rows: readonly number[];
	ink: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export const bitmapFont = Object.freeze({
	family: "Agent Mono",
	unitsPerEm: 8,
	glyphWidth: 5,
	glyphHeight: 8,
	advance: 6,
	ascent: 7,
	descent: 1,
	maxFontSize: 512,
});

const patterns: Record<string, readonly number[]> = {
	" ": [0, 0, 0, 0, 0, 0, 0, 0],
	"!": [4, 4, 4, 4, 4, 0, 4, 0],
	'"': [10, 10, 10, 0, 0, 0, 0, 0],
	"#": [10, 10, 31, 10, 31, 10, 10, 0],
	$: [4, 15, 20, 14, 5, 30, 4, 0],
	"%": [24, 25, 2, 4, 8, 19, 3, 0],
	"&": [12, 18, 20, 8, 21, 18, 13, 0],
	"'": [4, 4, 8, 0, 0, 0, 0, 0],
	"(": [2, 4, 8, 8, 8, 4, 2, 0],
	")": [8, 4, 2, 2, 2, 4, 8, 0],
	"*": [0, 4, 21, 14, 21, 4, 0, 0],
	"+": [0, 4, 4, 31, 4, 4, 0, 0],
	",": [0, 0, 0, 0, 0, 4, 4, 8],
	"-": [0, 0, 0, 31, 0, 0, 0, 0],
	".": [0, 0, 0, 0, 0, 0, 4, 0],
	"/": [1, 2, 2, 4, 8, 8, 16, 0],
	"0": [14, 17, 19, 21, 25, 17, 14, 0],
	"1": [4, 12, 4, 4, 4, 4, 14, 0],
	"2": [14, 17, 1, 2, 4, 8, 31, 0],
	"3": [30, 1, 1, 14, 1, 1, 30, 0],
	"4": [2, 6, 10, 18, 31, 2, 2, 0],
	"5": [31, 16, 16, 30, 1, 1, 30, 0],
	"6": [6, 8, 16, 30, 17, 17, 14, 0],
	"7": [31, 1, 2, 4, 8, 8, 8, 0],
	"8": [14, 17, 17, 14, 17, 17, 14, 0],
	"9": [14, 17, 17, 15, 1, 2, 12, 0],
	":": [0, 4, 4, 0, 4, 4, 0, 0],
	";": [0, 4, 4, 0, 4, 4, 8, 0],
	"<": [2, 4, 8, 16, 8, 4, 2, 0],
	"=": [0, 0, 31, 0, 31, 0, 0, 0],
	">": [8, 4, 2, 1, 2, 4, 8, 0],
	"?": [14, 17, 1, 2, 4, 0, 4, 0],
	"@": [14, 17, 23, 21, 23, 16, 14, 0],
	A: [14, 17, 17, 31, 17, 17, 17, 0],
	B: [30, 17, 17, 30, 17, 17, 30, 0],
	C: [14, 17, 16, 16, 16, 17, 14, 0],
	D: [30, 17, 17, 17, 17, 17, 30, 0],
	E: [31, 16, 16, 30, 16, 16, 31, 0],
	F: [31, 16, 16, 30, 16, 16, 16, 0],
	G: [14, 17, 16, 23, 17, 17, 15, 0],
	H: [17, 17, 17, 31, 17, 17, 17, 0],
	I: [14, 4, 4, 4, 4, 4, 14, 0],
	J: [7, 2, 2, 2, 2, 18, 12, 0],
	K: [17, 18, 20, 24, 20, 18, 17, 0],
	L: [16, 16, 16, 16, 16, 16, 31, 0],
	M: [17, 27, 21, 21, 17, 17, 17, 0],
	N: [17, 25, 21, 19, 17, 17, 17, 0],
	O: [14, 17, 17, 17, 17, 17, 14, 0],
	P: [30, 17, 17, 30, 16, 16, 16, 0],
	Q: [14, 17, 17, 17, 21, 18, 13, 0],
	R: [30, 17, 17, 30, 20, 18, 17, 0],
	S: [15, 16, 16, 14, 1, 1, 30, 0],
	T: [31, 4, 4, 4, 4, 4, 4, 0],
	U: [17, 17, 17, 17, 17, 17, 14, 0],
	V: [17, 17, 17, 17, 17, 10, 4, 0],
	W: [17, 17, 17, 21, 21, 21, 10, 0],
	X: [17, 17, 10, 4, 10, 17, 17, 0],
	Y: [17, 17, 10, 4, 4, 4, 4, 0],
	Z: [31, 1, 2, 4, 8, 16, 31, 0],
	"[": [14, 8, 8, 8, 8, 8, 14, 0],
	"\\": [16, 8, 8, 4, 2, 2, 1, 0],
	"]": [14, 2, 2, 2, 2, 2, 14, 0],
	"^": [4, 10, 17, 0, 0, 0, 0, 0],
	_: [0, 0, 0, 0, 0, 0, 0, 31],
	"`": [8, 4, 2, 0, 0, 0, 0, 0],
	a: [0, 0, 14, 1, 15, 17, 15, 0],
	b: [16, 16, 22, 25, 17, 17, 30, 0],
	c: [0, 0, 14, 17, 16, 17, 14, 0],
	d: [1, 1, 13, 19, 17, 17, 15, 0],
	e: [0, 0, 14, 17, 31, 16, 14, 0],
	f: [6, 9, 8, 28, 8, 8, 8, 0],
	g: [0, 0, 15, 17, 17, 15, 1, 14],
	h: [16, 16, 22, 25, 17, 17, 17, 0],
	i: [4, 0, 12, 4, 4, 4, 14, 0],
	j: [2, 0, 6, 2, 2, 2, 18, 12],
	k: [16, 16, 18, 20, 24, 20, 18, 0],
	l: [12, 4, 4, 4, 4, 4, 14, 0],
	m: [0, 0, 26, 21, 21, 17, 17, 0],
	n: [0, 0, 22, 25, 17, 17, 17, 0],
	o: [0, 0, 14, 17, 17, 17, 14, 0],
	p: [0, 0, 30, 17, 17, 30, 16, 16],
	q: [0, 0, 15, 17, 17, 15, 1, 1],
	r: [0, 0, 22, 25, 16, 16, 16, 0],
	s: [0, 0, 15, 16, 14, 1, 30, 0],
	t: [8, 8, 28, 8, 8, 9, 6, 0],
	u: [0, 0, 17, 17, 17, 19, 13, 0],
	v: [0, 0, 17, 17, 17, 10, 4, 0],
	w: [0, 0, 17, 17, 21, 21, 10, 0],
	x: [0, 0, 17, 10, 4, 10, 17, 0],
	y: [0, 0, 17, 17, 17, 15, 1, 14],
	z: [0, 0, 31, 2, 4, 8, 31, 0],
	"{": [2, 4, 4, 8, 4, 4, 2, 0],
	"|": [4, 4, 4, 4, 4, 4, 4, 0],
	"}": [8, 4, 4, 2, 4, 4, 8, 0],
	"~": [0, 0, 9, 22, 0, 0, 0, 0],
};

function makeGlyph(
	character: string,
	rows: readonly number[],
	supported: boolean,
): Readonly<BitmapGlyph> {
	let left: number = bitmapFont.glyphWidth;
	let top: number = bitmapFont.glyphHeight;
	let right = -1;
	let bottom = -1;
	for (let row = 0; row < rows.length; row++)
		for (let column = 0; column < bitmapFont.glyphWidth; column++)
			if (rows[row] & (1 << (bitmapFont.glyphWidth - column - 1))) {
				left = Math.min(left, column);
				top = Math.min(top, row);
				right = Math.max(right, column);
				bottom = Math.max(bottom, row);
			}
	return Object.freeze({
		character,
		supported,
		rows: Object.freeze([...rows]),
		ink: Object.freeze(
			right < 0
				? { x: 0, y: 0, width: 0, height: 0 }
				: {
						x: left,
						y: top,
						width: right - left + 1,
						height: bottom - top + 1,
					},
		),
	});
}
const glyphs = new Map(
	Object.entries(patterns).map(([character, rows]) => [
		character,
		makeGlyph(character, rows, true),
	]),
);
glyphs.set("\u00a0", makeGlyph("\u00a0", patterns[" "], true));
const replacement = makeGlyph("\ufffd", [31, 17, 21, 17, 21, 17, 31, 0], false);

export function bitmapGlyph(character: string): Readonly<BitmapGlyph> {
	if (
		typeof character !== "string" ||
		character.length < 1 ||
		character.length > 2 ||
		[...character].length !== 1
	)
		throw new AgentBrowserError(
			"invalid-input",
			"A single code point is required for a bitmap glyph",
		);
	return glyphs.get(character) ?? replacement;
}

export function bitmapFontMetrics(fontSize = 16) {
	if (
		typeof fontSize !== "number" ||
		!Number.isFinite(fontSize) ||
		fontSize <= 0
	)
		throw new AgentBrowserError("invalid-input", "Invalid bitmap font size");
	if (fontSize > bitmapFont.maxFontSize)
		throw new AgentBrowserError(
			"resource-limit",
			"Bitmap font size limit exceeded",
		);
	const scale = fontSize / bitmapFont.unitsPerEm;
	return Object.freeze({
		family: bitmapFont.family,
		fontSize,
		scale,
		advance: bitmapFont.advance * scale,
		ascent: bitmapFont.ascent * scale,
		descent: bitmapFont.descent * scale,
		lineHeight: fontSize * 1.25,
	});
}
