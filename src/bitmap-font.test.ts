import { expect, it } from "vitest";
import { bitmapFont, bitmapFontMetrics, bitmapGlyph } from "./bitmap-font.js";

it("provides bounded immutable masks for every printable ASCII character", () => {
	for (let code = 32; code <= 126; code++) {
		const character = String.fromCharCode(code);
		const glyph = bitmapGlyph(character);
		expect(glyph.character).toBe(character);
		expect(glyph.supported).toBe(true);
		expect(glyph.rows).toHaveLength(8);
		expect(
			glyph.rows.every((row) => Number.isInteger(row) && row >= 0 && row <= 31),
		).toBe(true);
		expect(bitmapGlyph(character)).toBe(glyph);
		expect(
			Object.isFrozen(glyph) &&
				Object.isFrozen(glyph.rows) &&
				Object.isFrozen(glyph.ink),
		).toBe(true);
		const points = glyph.rows.flatMap((mask, row) =>
			Array.from({ length: 5 }, (_, column) => ({ column, row })).filter(
				({ column }) => mask & (16 >> column),
			),
		);
		if (code === 32) expect(points).toHaveLength(0);
		else {
			expect(points.length).toBeGreaterThan(0);
			expect(glyph.ink).toEqual({
				x: Math.min(...points.map(({ column }) => column)),
				y: Math.min(...points.map(({ row }) => row)),
				width:
					Math.max(...points.map(({ column }) => column)) -
					Math.min(...points.map(({ column }) => column)) +
					1,
				height:
					Math.max(...points.map(({ row }) => row)) -
					Math.min(...points.map(({ row }) => row)) +
					1,
			});
		}
	}
});

it("keeps spaces blank and lowercase descenders below the baseline", () => {
	expect(bitmapGlyph("A").rows).toEqual([14, 17, 17, 31, 17, 17, 17, 0]);
	for (const character of [" ", "\u00a0"]) {
		expect(bitmapGlyph(character).ink).toEqual({
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		});
		expect(bitmapGlyph(character).supported).toBe(true);
	}
	for (const character of "gjpqy")
		expect(bitmapGlyph(character).rows[7]).toBeGreaterThan(0);
});

it.each(["é", "中", "🙂", "\n", "\t", "\0", "\ud800", "\ufffd"])(
	"uses one shared explicit replacement for %j",
	(character) => {
		expect(bitmapGlyph(character)).toBe(bitmapGlyph("\ufffd"));
		expect(bitmapGlyph(character).supported).toBe(false);
	},
);

it.each(["", "ab", "e\u0301", "🙂a", null, 8])(
	"rejects non-single-code-point input %j",
	(value) => {
		expect(() => bitmapGlyph(value as string)).toThrow("single code point");
	},
);

it.each([8, 16, 10.5, 512])(
	"uses the same scaled metrics at size %s",
	(size) => {
		const metrics = bitmapFontMetrics(size);
		expect(metrics).toEqual({
			family: "Agent Mono",
			fontSize: size,
			scale: size / 8,
			advance: size * 0.75,
			ascent: size * 0.875,
			descent: size * 0.125,
			lineHeight: size * 1.25,
		});
		expect(Object.isFrozen(metrics)).toBe(true);
		expect(Object.isFrozen(bitmapFont)).toBe(true);
	},
);

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 513, "16"])(
	"rejects invalid font size %j",
	(size) => {
		expect(() => bitmapFontMetrics(size as number)).toThrow();
	},
);
