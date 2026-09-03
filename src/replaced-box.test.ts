import { expect, it } from "vitest";
import { initialBoxStyle, type BoxStyle } from "./css-box.js";
import { imageDimensionHint, resolveReplacedSize } from "./replaced-box.js";

function size(style: Partial<BoxStyle> = {}, height: number | null = null) {
	return resolveReplacedSize(
		100,
		50,
		{ ...initialBoxStyle, ...style },
		200,
		height,
	);
}

it.each([
	[{}, 100, 50],
	[{ width: "40px" }, 40, 20],
	[{ height: "40px" }, 80, 40],
	[{ width: "40px", height: "40px" }, 40, 40],
	[{ width: "0px" }, 0, 0],
	[{ height: "0px" }, 0, 0],
	[{ width: "25%" }, 50, 25],
	[{ height: "25%" }, 100, 50],
	[{ "max-width": "60px" }, 60, 30],
	[{ "max-height": "10px" }, 20, 10],
	[{ "min-width": "120px" }, 120, 60],
	[{ "min-height": "80px" }, 160, 80],
	[{ "max-width": "60px", "min-height": "80px" }, 60, 80],
	[{ "min-width": "120px", "max-height": "10px" }, 120, 10],
	[{ "max-width": "60px", "max-height": "20px" }, 40, 20],
	[{ "min-width": "120px", "min-height": "80px" }, 160, 80],
	[{ "max-width": "60px", "min-width": "120px" }, 120, 60],
	[{ "min-height": "80px", "max-height": "10px" }, 160, 80],
	[{ "max-width": "60px", "min-height": "40px" }, 60, 40],
	[{ "min-width": "120px", "max-height": "55px" }, 120, 55],
	[{ width: "40px", "min-width": "60px" }, 60, 30],
	[{ height: "40px", "max-height": "30px" }, 60, 30],
	[{ width: "40px", "min-height": "60px" }, 40, 60],
	[{ height: "40px", "min-width": "120px" }, 120, 40],
] as [Partial<BoxStyle>, number, number][])(
	"resolves intrinsic ratio and constraints %j",
	(style, width, height) => {
		expect(size(style)).toMatchObject({
			contentWidth: width,
			contentHeight: height,
		});
	},
);

it("resolves percentage height only against a definite containing height", () => {
	expect(size({ height: "25%" }, 80)).toMatchObject({
		contentWidth: 40,
		contentHeight: 20,
	});
	expect(size({ "max-height": "25%" }, null)).toMatchObject({
		contentWidth: 100,
		contentHeight: 50,
	});
	expect(size({ "max-height": "25%" }, 80)).toMatchObject({
		contentWidth: 40,
		contentHeight: 20,
	});
});

it("resolves padding against width and subtracts border-box edges before ratio sizing", () => {
	expect(
		size({
			width: "100px",
			"box-sizing": "border-box",
			"padding-left": "10%",
			"padding-right": "5%",
			"padding-top": "10%",
			"padding-bottom": "5%",
			"margin-left": "-5%",
			"margin-right": "auto",
		}),
	).toMatchObject({
		contentWidth: 70,
		contentHeight: 35,
		borderBoxWidth: 100,
		borderBoxHeight: 65,
		paddingTop: 20,
		paddingBottom: 10,
		marginLeft: -10,
		marginRight: 0,
	});
});

it("clamps specified border-box sizes below padding to zero content", () => {
	expect(
		size({
			width: "2px",
			height: "3px",
			"box-sizing": "border-box",
			"padding-left": "10px",
			"padding-top": "10px",
		}),
	).toMatchObject({
		contentWidth: 0,
		contentHeight: 0,
		borderBoxWidth: 10,
		borderBoxHeight: 10,
	});
});

it.each([
	[0, 2],
	[2, 0],
	[-1, 1],
	[Number.POSITIVE_INFINITY, 2],
	[Number.NaN, 2],
])("rejects invalid intrinsic dimensions %s/%s", (width, height) => {
	expect(() =>
		resolveReplacedSize(width, height, initialBoxStyle, 200, null),
	).toThrow();
});

it("enforces used size and attribute scan limits", () => {
	expect(() => size({ "min-width": "16777216px" })).not.toThrow();
	expect(() => size({ width: "16777217px" })).toThrow(/limit/);
	expect(() => imageDimensionHint("1".repeat(4097))).toThrow(/limit/);
	expect(() => imageDimensionHint("9".repeat(400))).toThrow(/limit/);
});

it.each([
	[undefined, undefined],
	["", undefined],
	["-1", undefined],
	["+1", undefined],
	[".5", undefined],
	[" 12", "12px"],
	["12.5%", "12.5%"],
	["0", "0px"],
	["12px", "12px"],
	["12junk", "12px"],
	["12 %", "12px"],
	["001.50%junk", "1.5%"],
])("parses bounded image presentation dimensions %j", (input, expected) => {
	expect(imageDimensionHint(input)).toBe(expected);
});
