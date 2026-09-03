import { expect, it } from "vitest";
import {
	cssNamedColors,
	normalizeCssColor,
	parseCssColor,
} from "./css-color.js";

it("exposes 148 frozen named sRGB colors and aliases", () => {
	expect(Object.keys(cssNamedColors)).toHaveLength(148);
	expect(Object.isFrozen(cssNamedColors)).toBe(true);
	for (const [name, color] of Object.entries(cssNamedColors)) {
		expect(Object.isFrozen(color)).toBe(true);
		expect(parseCssColor(name.toUpperCase())).toBe(color);
		expect(color).toHaveLength(4);
		expect(
			color.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255),
		).toBe(true);
		expect(color[3]).toBe(255);
	}
	expect(cssNamedColors.rebeccapurple).toEqual([102, 51, 153, 255]);
	expect(cssNamedColors.green).toEqual([0, 128, 0, 255]);
	for (const [first, second] of [
		["gray", "grey"],
		["aqua", "cyan"],
		["fuchsia", "magenta"],
		["slategray", "slategrey"],
	])
		expect(cssNamedColors[first]).toEqual(cssNamedColors[second]);
});

it.each([
	["#abc", [170, 187, 204, 255]],
	["#ABCD", [170, 187, 204, 221]],
	["#010203", [1, 2, 3, 255]],
	["#01020380", [1, 2, 3, 128]],
	["rgb(1, 2, 3)", [1, 2, 3, 255]],
	["rgba(100%, 0%, 50%, 50%)", [255, 0, 128, 128]],
	["rgb(100% 0 50% / .5)", [255, 0, 128, 128]],
	["rgba(1 2 3)", [1, 2, 3, 255]],
	["rgb(1,2,3,.5)", [1, 2, 3, 128]],
	["rgb(-1 300 1e2 / 200%)", [0, 255, 100, 255]],
	["rgb(2 3 4 / -2)", [2, 3, 4, 0]],
	["hsl(0 100% 50%)", [255, 0, 0, 255]],
	["hsla(120, 100%, 50%, .5)", [0, 255, 0, 128]],
	["hsl(240deg 100% 50%)", [0, 0, 255, 255]],
	["hsl(.5turn 100% 50%)", [0, 255, 255, 255]],
	["hsl(200grad 100% 50%)", [0, 255, 255, 255]],
	[`hsl(${Math.PI}rad 100% 50%)`, [0, 255, 255, 255]],
	["hsl(-120 100% 50%)", [0, 0, 255, 255]],
	["hsl(480 100% 50%)", [0, 255, 0, 255]],
	["hsl(0 -1% 50%)", [128, 128, 128, 255]],
	["hsl(0 200% 200%)", [255, 255, 255, 255]],
	["\tRED\n", [255, 0, 0, 255]],
	["transparent", [0, 0, 0, 0]],
	["currentColor", "currentcolor"],
])(
	"parses %s into bounded RGBA8 or a currentcolor token",
	(source, expected) => {
		expect(parseCssColor(source as string)).toEqual(expected);
	},
);

it.each([
	"",
	"#12",
	"#12345",
	"#1234567",
	"#ggg",
	"constructor",
	"inherit",
	"CanvasText",
	"rgb(1%,2,3)",
	"rgb(1,2,3 / .5)",
	"rgb(1 2 3 /)",
	"rgb(1 2 3 / .5 / 1)",
	"rgb(1 2)",
	"rgb(1 2 3 4)",
	"rgb(none 0 0)",
	"rgb(1e999 0 0)",
	"rgb(1. 0 0)",
	"rgb(1\u00a02 3)",
	"\u00a0red",
	"hsl(1 2 3)",
	"hsl(1% 2% 3%)",
	"hsl(1 2% 3% / none)",
	"rgb(from red r g b)",
	"color(srgb 1 0 0)",
	"var(--red)",
	"red".repeat(100),
])("rejects unsupported or malformed %s", (source) => {
	expect(parseCssColor(source)).toBeUndefined();
	expect(normalizeCssColor(source)).toBeUndefined();
});

it("normalizes accepted values and round-trips every alpha byte", () => {
	expect(normalizeCssColor(" RebeccaPurple ")).toBe("rebeccapurple");
	expect(normalizeCssColor("#abc")).toBe("rgb(170, 187, 204)");
	for (let alpha = 0; alpha < 256; alpha++) {
		const source = `#112233${alpha.toString(16).padStart(2, "0")}`;
		const normalized = normalizeCssColor(source);
		if (normalized === undefined) throw new Error("Missing normalized color");
		expect(parseCssColor(normalized)).toEqual([17, 34, 51, alpha]);
	}
	expect(parseCssColor(null as unknown as string)).toBeUndefined();
	expect(normalizeCssColor(null as unknown as string)).toBeUndefined();
});
