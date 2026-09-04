import { expect, it } from "vitest";
import { type TextStyle, initialTextStyle } from "./css-text.js";
import { AgentBrowserError } from "./errors.js";
import { textFontExtent } from "./text-font.js";

function style(fontSize: string, lineHeight = "normal"): TextStyle {
	return {
		...initialTextStyle,
		"font-size": fontSize,
		"line-height": lineHeight,
	};
}

it.each([
	["16px", "normal", [16, 12, 14, 16, 4]],
	["16px", "24px", [16, 12, 14, 18, 6]],
	["16px", "1.5", [16, 12, 14, 18, 6]],
	["16px", "1", [16, 12, 14, 14, 2]],
	["16px", "8px", [16, 12, 14, 10, -2]],
	["16px", "0", [16, 12, 14, 6, -6]],
	["0.5px", "normal", [0.5, 0.375, 0.4375, 0.5, 0.125]],
	["12.5px", "1.2", [12.5, 9.375, 10.9375, 12.1875, 2.8125]],
	["0px", "normal", [0, 0, 0, 0, 0]],
	["0px", "2", [0, 0, 0, 0, 0]],
	["0px", "10px", [0, 0, 0, 5, 5]],
	["512px", "normal", [512, 384, 448, 512, 128]],
	["16px", "16777216px", [16, 12, 14, 8388614, 8388602]],
] as const)(
	"preserves advance, ascent, descent and leading for %s / %s",
	(fontSize, lineHeight, expected) => {
		const [size, advance, ascent, above, below] = expected;
		expect(textFontExtent(style(fontSize, lineHeight))).toEqual({
			fontSize: size,
			advance,
			ascent,
			above,
			below,
		});
	},
);

it.each([
	["font-size", "-1px", "invalid-input", "Invalid layout length"],
	["font-size", "NaNpx", "invalid-input", "Invalid layout length"],
	["font-size", "Infinity", "invalid-input", "Invalid layout length"],
	["font-size", "513px", "resource-limit", "Text font size limit exceeded"],
	["font-size", "16777217px", "resource-limit", "Layout length limit exceeded"],
	["line-height", "-1px", "invalid-input", "Invalid layout length"],
	["line-height", "-1", "invalid-input", "Invalid layout length"],
	["line-height", "NaN", "invalid-input", "Invalid layout length"],
	["line-height", "Infinity", "invalid-input", "Invalid layout length"],
	["line-height", "1em", "invalid-input", "Invalid layout length"],
	[
		"line-height",
		"16777217px",
		"resource-limit",
		"Layout length limit exceeded",
	],
	["line-height", "1048577", "resource-limit", "Layout length limit exceeded"],
] as const)("preserves the %s=%s error", (property, value, code, message) => {
	expect(() =>
		textFontExtent({ ...initialTextStyle, [property]: value }),
	).toThrowError(new AgentBrowserError(code, message));
	try {
		textFontExtent({ ...initialTextStyle, [property]: value });
	} catch (error) {
		expect(error).toMatchObject({ code, message });
	}
});

it("checks the font ceiling before reading line height", () => {
	const input = {
		...initialTextStyle,
		"font-size": "513px",
		get "line-height"(): string {
			throw new Error("Line height should not be read");
		},
	};
	expect(() => textFontExtent(input)).toThrowError(
		new AgentBrowserError("resource-limit", "Text font size limit exceeded"),
	);
});

it("retains existing parseFloat behavior without adding CSS validation", () => {
	expect(textFontExtent(style("16trailing", "24trailingpx"))).toEqual(
		textFontExtent(style("16px", "24px")),
	);
});

it("does not normalize negative zero in the font fields", () => {
	const result = textFontExtent(style("-0px"));
	expect(Object.is(result.fontSize, -0)).toBe(true);
	expect(Object.is(result.advance, -0)).toBe(true);
	expect(Object.is(result.ascent, -0)).toBe(true);
});

it("returns fresh mutable scalar extents without changing the input", () => {
	const input = Object.freeze(style("16px"));
	const first = textFontExtent(input);
	const second = textFontExtent(input);
	expect(first).not.toBe(second);
	expect(Object.isFrozen(first)).toBe(false);
	first.above = 0;
	expect(second.above).toBe(16);
	expect(input).toEqual(style("16px"));
});
