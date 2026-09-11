import { expect, it } from "vitest";
import {
	bitmapFont,
	bitmapFontMetrics,
	bitmapGlyph,
	type BitmapFontWeight,
	type BitmapGlyph,
} from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";

const supportedCharacters = [
	...Array.from({ length: 95 }, (_, index) => String.fromCodePoint(index + 32)),
	"\u00a0",
];

function expectInvalidInput(operation: () => unknown) {
	let failure: unknown;
	try {
		operation();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code: "invalid-input" });
}

it("publishes only the two registered immutable faces without changing metrics", () => {
	expect(bitmapFont).toEqual({
		family: "Agent Mono",
		weights: [400, 700],
		unitsPerEm: 8,
		glyphWidth: 5,
		glyphHeight: 8,
		advance: 6,
		ascent: 7,
		descent: 1,
		maxFontSize: 512,
	});
	expect(Object.isFrozen(bitmapFont)).toBe(true);
	expect(Object.isFrozen(bitmapFont.weights)).toBe(true);
});

it("keeps default and explicit 400 glyphs identical for coverage and fallbacks", () => {
	for (const character of [
		...supportedCharacters,
		"\ufffd",
		"é",
		"中",
		"🙂",
		"\t",
		"\n",
		"\0",
		"\ud800",
		"\udfff",
	]) {
		const regular = bitmapGlyph(character, 400);
		expect(bitmapGlyph(character)).toBe(regular);
		expect(bitmapGlyph(character, undefined)).toBe(regular);
	}
	expect(bitmapGlyph("A", 400)).toEqual({
		character: "A",
		supported: true,
		rows: [14, 17, 17, 31, 17, 17, 17, 0],
		ink: { x: 0, y: 0, width: 5, height: 7 },
	});
	expect(bitmapGlyph("I", 400)).toEqual({
		character: "I",
		supported: true,
		rows: [14, 4, 4, 4, 4, 4, 14, 0],
		ink: { x: 1, y: 0, width: 3, height: 7 },
	});
	expect(bitmapGlyph("\ufffd", 400).rows).toEqual([
		31, 17, 21, 17, 21, 17, 31, 0,
	]);
});

it.each([
	{
		character: "A",
		rows: [15, 25, 25, 31, 25, 25, 25, 0],
		ink: { x: 0, y: 0, width: 5, height: 7 },
	},
	{
		character: "I",
		rows: [15, 6, 6, 6, 6, 6, 15, 0],
		ink: { x: 1, y: 0, width: 4, height: 7 },
	},
	{
		character: "!",
		rows: [6, 6, 6, 6, 6, 0, 6, 0],
		ink: { x: 2, y: 0, width: 2, height: 7 },
	},
	{
		character: ".",
		rows: [0, 0, 0, 0, 0, 0, 6, 0],
		ink: { x: 2, y: 6, width: 2, height: 1 },
	},
	{
		character: "j",
		rows: [3, 0, 7, 3, 3, 3, 27, 14],
		ink: { x: 0, y: 0, width: 5, height: 8 },
	},
])(
	"provides exact distinct built-in bold pixels for $character",
	({ character, rows, ink }) => {
		const regular = bitmapGlyph(character, 400);
		const bold = bitmapGlyph(character, 700);
		expect(bold).toEqual({ character, supported: true, rows, ink });
		expect(bold.rows).not.toEqual(regular.rows);
		expect(bold).not.toBe(regular);
	},
);

it("preserves every supported pixel and recomputes bounded bold ink", () => {
	for (const character of supportedCharacters) {
		const regular = bitmapGlyph(character, 400);
		const bold = bitmapGlyph(character, 700);
		expect(regular.supported).toBe(true);
		expect(bold.supported).toBe(true);
		expect(bold.character).toBe(regular.character);
		expect(bold.rows).toHaveLength(8);
		const points: { column: number; row: number }[] = [];
		for (let row = 0; row < 8; row++) {
			const mask = bold.rows[row];
			expect(mask).toBe(regular.rows[row] | (regular.rows[row] >> 1));
			expect(mask & regular.rows[row]).toBe(regular.rows[row]);
			expect(Number.isInteger(mask)).toBe(true);
			expect(mask).toBeGreaterThanOrEqual(0);
			expect(mask).toBeLessThanOrEqual(31);
			for (let column = 0; column < 5; column++)
				if (mask & (16 >> column)) points.push({ column, row });
		}
		if (!points.length) {
			expect([" ", "\u00a0"]).toContain(character);
			expect(bold.ink).toEqual({ x: 0, y: 0, width: 0, height: 0 });
			continue;
		}
		const left = Math.min(...points.map((point) => point.column));
		const right = Math.max(...points.map((point) => point.column));
		const top = Math.min(...points.map((point) => point.row));
		const bottom = Math.max(...points.map((point) => point.row));
		expect(bold.ink).toEqual({
			x: left,
			y: top,
			width: right - left + 1,
			height: bottom - top + 1,
		});
		expect(bold.ink.x + bold.ink.width).toBeLessThanOrEqual(5);
		expect(bold.ink.y + bold.ink.height).toBeLessThanOrEqual(8);
	}
});

it("keeps spaces blank without inventing a tab glyph or enlarging full-width rows", () => {
	for (const weight of bitmapFont.weights) {
		for (const character of [" ", "\u00a0"]) {
			const glyph = bitmapGlyph(character, weight);
			expect(glyph.character).toBe(character);
			expect(glyph.supported).toBe(true);
			expect(glyph.rows).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
			expect(glyph.ink).toEqual({ x: 0, y: 0, width: 0, height: 0 });
		}
		expect(bitmapGlyph("\t", weight)).toBe(bitmapGlyph("\ufffd", weight));
		expect(bitmapGlyph("\t", weight).supported).toBe(false);
		expect(bitmapGlyph("\t", weight).ink.width).toBe(5);
		expect(bitmapGlyph("_", weight).rows).toEqual([0, 0, 0, 0, 0, 0, 0, 31]);
		for (const character of "gjpqy")
			expect(bitmapGlyph(character, weight).rows[7]).toBeGreaterThan(0);
	}
});

it("retains one immutable replacement per face for unsupported code points", () => {
	const regular = bitmapGlyph("\ufffd", 400);
	const bold = bitmapGlyph("\ufffd", 700);
	expect(bold).not.toBe(regular);
	expect(bold).toEqual({
		character: "\ufffd",
		supported: false,
		rows: [31, 25, 31, 25, 31, 25, 31, 0],
		ink: { x: 0, y: 0, width: 5, height: 7 },
	});
	for (const weight of bitmapFont.weights)
		for (const character of [
			"é",
			"中",
			"🙂",
			"\n",
			"\r",
			"\0",
			"\ud800",
			"\udfff",
		])
			expect(bitmapGlyph(character, weight)).toBe(
				bitmapGlyph("\ufffd", weight),
			);
});

it.each([
	{ name: "empty string", value: "" },
	{ name: "two ASCII code points", value: "ab" },
	{ name: "combining sequence", value: "e\u0301" },
	{ name: "astral plus ASCII", value: "🙂a" },
	{ name: "two astral code points", value: "🙂🙂" },
	{ name: "undefined", value: undefined },
	{ name: "null", value: null },
	{ name: "number", value: 8 },
	{ name: "object", value: {} },
	{ name: "array", value: ["A"] },
])("preserves single-code-point validation for $name", ({ value }) => {
	for (const weight of bitmapFont.weights)
		expectInvalidInput(() => bitmapGlyph(value as string, weight));
});

it.each([
	{ name: "unregistered light", value: 300 },
	{ name: "unregistered medium", value: 500 },
	{ name: "unregistered black", value: 900 },
	{ name: "fraction", value: 400.5 },
	{ name: "zero", value: 0 },
	{ name: "negative", value: -700 },
	{ name: "NaN", value: Number.NaN },
	{ name: "infinity", value: Infinity },
	{ name: "null", value: null },
	{ name: "regular string", value: "400" },
	{ name: "bold string", value: "700" },
	{ name: "boolean", value: true },
	{ name: "object", value: {} },
	{ name: "array", value: [700] },
	{ name: "symbol", value: Symbol("700") },
])("rejects $name rather than performing CSS face matching", ({ value }) => {
	expectInvalidInput(() => bitmapGlyph("A", value as BitmapFontWeight));
});

it("rejects face objects without coercion", () => {
	let coercions = 0;
	const weight = {
		[Symbol.toPrimitive]() {
			coercions++;
			return 700;
		},
		valueOf() {
			coercions++;
			return 700;
		},
		toString() {
			coercions++;
			return "700";
		},
	};
	expectInvalidInput(() =>
		bitmapGlyph("A", weight as unknown as BitmapFontWeight),
	);
	expect(coercions).toBe(0);
});

it("reuses the finite face identities across repeated supported and unknown requests", () => {
	for (const weight of bitmapFont.weights) {
		const glyphs = supportedCharacters.map((character) =>
			bitmapGlyph(character, weight),
		);
		const replacement = bitmapGlyph("\ufffd", weight);
		const identities = new Set<Readonly<BitmapGlyph>>([...glyphs, replacement]);
		expect(identities.size).toBe(supportedCharacters.length + 1);
		for (const glyph of identities)
			for (const value of [glyph, glyph.rows, glyph.ink])
				expect(Object.isFrozen(value)).toBe(true);
		for (let repeat = 0; repeat < 16; repeat++)
			for (const glyph of glyphs)
				expect(bitmapGlyph(glyph.character, weight)).toBe(glyph);
		for (let code = 0x100; code < 0x500; code++) {
			const glyph = bitmapGlyph(String.fromCodePoint(code), weight);
			expect(glyph).toBe(replacement);
			identities.add(glyph);
		}
		expect(identities.size).toBe(supportedCharacters.length + 1);
	}
});

it.each([8, 16, 10.5, 512])(
	"leaves scaled metrics unchanged at size %s",
	(fontSize) => {
		bitmapGlyph("A", 700);
		const metrics = bitmapFontMetrics(fontSize);
		expect(metrics).toEqual({
			family: "Agent Mono",
			fontSize,
			scale: fontSize / 8,
			advance: fontSize * 0.75,
			ascent: fontSize * 0.875,
			descent: fontSize * 0.125,
			lineHeight: fontSize * 1.25,
		});
		expect(Object.isFrozen(metrics)).toBe(true);
	},
);
