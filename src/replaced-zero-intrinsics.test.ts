import { expect, it } from "vitest";
import { initialBoxStyle, type BoxStyle } from "./css-box.js";
import { resolveReplacedSize } from "./replaced-box.js";

const intrinsicSizes = [
	[0, 0],
	[0, 50],
	[100, 0],
	[100, 50],
] as const;

it.each(intrinsicSizes)(
	"sizes independent intrinsic axes %s x %s without a ratio",
	(intrinsicWidth, intrinsicHeight) => {
		const cases: [Partial<BoxStyle>, number, number][] = [
			[{}, intrinsicWidth, intrinsicHeight],
			[{ width: "40px" }, 40, intrinsicHeight],
			[{ height: "30px" }, intrinsicWidth, 30],
			[{ width: "40px", height: "30px" }, 40, 30],
			[{ width: "0px" }, 0, intrinsicHeight],
			[{ height: "0px" }, intrinsicWidth, 0],
			[{ "min-width": "120px" }, 120, intrinsicHeight],
			[{ "min-height": "80px" }, intrinsicWidth, 80],
			[{ "max-width": "60px" }, intrinsicWidth === 0 ? 0 : 60, intrinsicHeight],
			[
				{ "max-height": "20px" },
				intrinsicWidth,
				intrinsicHeight === 0 ? 0 : 20,
			],
			[
				{ "min-width": "120px", "max-height": "20px" },
				120,
				intrinsicHeight === 0 ? 0 : 20,
			],
			[
				{ "max-width": "60px", "min-height": "80px" },
				intrinsicWidth === 0 ? 0 : 60,
				80,
			],
			[
				{
					"min-width": "120px",
					"max-width": "60px",
					"min-height": "80px",
					"max-height": "20px",
				},
				120,
				80,
			],
			[
				{
					width: "40px",
					height: "30px",
					"min-width": "60px",
					"max-height": "20px",
				},
				60,
				20,
			],
			[{ "max-width": "0px", "max-height": "0px" }, 0, 0],
		];
		for (const [overrides, contentWidth, contentHeight] of cases) {
			const result = resolveReplacedSize(
				intrinsicWidth,
				intrinsicHeight,
				{ ...initialBoxStyle, ...overrides },
				200,
				null,
				false,
			);
			expect(result, JSON.stringify(overrides)).toEqual({
				contentWidth,
				contentHeight,
				borderBoxWidth: contentWidth,
				borderBoxHeight: contentHeight,
				borderLeft: 0,
				borderRight: 0,
				borderTop: 0,
				borderBottom: 0,
				paddingLeft: 0,
				paddingRight: 0,
				paddingTop: 0,
				paddingBottom: 0,
				marginLeft: 0,
				marginRight: 0,
				marginTop: 0,
				marginBottom: 0,
			});
			expect(Object.isFrozen(result)).toBe(true);
			expect(Object.values(result).every(Number.isFinite)).toBe(true);
		}
	},
);

it.each(intrinsicSizes)(
	"resolves definite and indefinite percentages for %s x %s without a ratio",
	(intrinsicWidth, intrinsicHeight) => {
		const cases: [Partial<BoxStyle>, number, number | null, number, number][] =
			[
				[{ width: "25%", height: "25%" }, 200, 80, 50, 20],
				[{ width: "25%", height: "25%" }, 80, 200, 20, 50],
				[{ width: "25%", height: "25%" }, 0, 0, 0, 0],
				[{ width: "25%", height: "25%" }, 200, null, 50, intrinsicHeight],
				[{ "min-width": "60%", "min-height": "100%" }, 200, 80, 120, 80],
				[
					{ "max-width": "25%", "max-height": "25%" },
					200,
					80,
					intrinsicWidth === 0 ? 0 : 50,
					intrinsicHeight === 0 ? 0 : 20,
				],
				[
					{ height: "25%", "min-height": "100%", "max-height": "10%" },
					200,
					null,
					intrinsicWidth,
					intrinsicHeight,
				],
				[
					{ height: "25%", "min-height": "100%", "max-height": "10%" },
					200,
					80,
					intrinsicWidth,
					80,
				],
				[
					{ height: "calc(25% + 10px)" },
					200,
					null,
					intrinsicWidth,
					intrinsicHeight,
				],
				[{ height: "calc(25% + 10px)" }, 200, 80, intrinsicWidth, 30],
			];
		for (const [
			overrides,
			containingWidth,
			containingHeight,
			contentWidth,
			contentHeight,
		] of cases) {
			const result = resolveReplacedSize(
				intrinsicWidth,
				intrinsicHeight,
				{ ...initialBoxStyle, ...overrides },
				containingWidth,
				containingHeight,
				false,
			);
			expect(
				result,
				JSON.stringify([overrides, containingWidth, containingHeight]),
			).toMatchObject({
				contentWidth,
				contentHeight,
				borderBoxWidth: contentWidth,
				borderBoxHeight: contentHeight,
			});
			expect(Object.values(result).every(Number.isFinite)).toBe(true);
		}
	},
);

it.each(["content-box", "border-box"] as const)(
	"keeps zero-intrinsic edges and margins independent under %s sizing",
	(boxSizing) => {
		for (const [intrinsicWidth, intrinsicHeight] of intrinsicSizes) {
			for (const containingWidth of [0, 80, 200]) {
				const paddingLeft = containingWidth / 10;
				const paddingRight = containingWidth / 20;
				const horizontalEdges = paddingLeft + paddingRight + 5;
				const verticalEdges = paddingLeft + paddingRight + 9;
				const cases: [Partial<BoxStyle>, number, number][] = [
					[{}, intrinsicWidth, intrinsicHeight],
					[
						{ width: "100px", height: "80px" },
						boxSizing === "border-box" ? 100 - horizontalEdges : 100,
						boxSizing === "border-box" ? 80 - verticalEdges : 80,
					],
					[
						{ width: "1px", height: "1px" },
						boxSizing === "border-box" ? 0 : 1,
						boxSizing === "border-box" ? 0 : 1,
					],
					[
						{
							"min-width": "120px",
							"max-width": "60px",
							"min-height": "80px",
							"max-height": "20px",
						},
						boxSizing === "border-box" ? 120 - horizontalEdges : 120,
						boxSizing === "border-box" ? 80 - verticalEdges : 80,
					],
					[
						{
							width: "100px",
							height: "80px",
							"max-width": "60px",
							"max-height": "50px",
						},
						boxSizing === "border-box" ? 60 - horizontalEdges : 60,
						boxSizing === "border-box" ? 50 - verticalEdges : 50,
					],
				];
				for (const [overrides, contentWidth, contentHeight] of cases) {
					const result = resolveReplacedSize(
						intrinsicWidth,
						intrinsicHeight,
						{
							...initialBoxStyle,
							"box-sizing": boxSizing,
							"padding-left": "10%",
							"padding-right": "5%",
							"padding-top": "10%",
							"padding-bottom": "5%",
							"border-left-style": "solid",
							"border-right-style": "solid",
							"border-top-style": "solid",
							"border-bottom-style": "solid",
							"border-left-width": "2px",
							"border-right-width": "3px",
							"border-top-width": "4px",
							"border-bottom-width": "5px",
							"margin-left": "-5%",
							"margin-right": "auto",
							"margin-top": "10%",
							"margin-bottom": "-3px",
							...overrides,
						},
						containingWidth,
						null,
						false,
					);
					expect(
						result,
						JSON.stringify([
							intrinsicWidth,
							intrinsicHeight,
							containingWidth,
							overrides,
						]),
					).toEqual({
						contentWidth,
						contentHeight,
						borderBoxWidth: contentWidth + horizontalEdges,
						borderBoxHeight: contentHeight + verticalEdges,
						borderLeft: 2,
						borderRight: 3,
						borderTop: 4,
						borderBottom: 5,
						paddingLeft,
						paddingRight,
						paddingTop: paddingLeft,
						paddingBottom: paddingRight,
						marginLeft: containingWidth === 0 ? 0 : -containingWidth / 20,
						marginRight: 0,
						marginTop: containingWidth / 10,
						marginBottom: -3,
					});
					expect(Object.values(result).every(Number.isFinite)).toBe(true);
				}
			}
		}
	},
);

it.each([
	[0, 0],
	[0, 50],
	[100, 0],
])(
	"retains explicit and default ratio rejection of %s x %s",
	(intrinsicWidth, intrinsicHeight) => {
		const style = { ...initialBoxStyle, width: "40px", height: "30px" };
		expect(() =>
			resolveReplacedSize(intrinsicWidth, intrinsicHeight, style, 200, null),
		).toThrow(/positive intrinsic dimensions/);
		expect(() =>
			resolveReplacedSize(
				intrinsicWidth,
				intrinsicHeight,
				style,
				200,
				null,
				true,
			),
		).toThrow(/positive intrinsic dimensions/);
		for (const invalidFlag of [
			undefined,
			null,
			0,
			"",
			"false",
			"0",
		] as unknown as boolean[]) {
			expect(() =>
				resolveReplacedSize(
					intrinsicWidth,
					intrinsicHeight,
					style,
					200,
					null,
					invalidFlag,
				),
			).toThrow(/positive intrinsic dimensions/);
		}
	},
);

it.each([
	-1,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	16_777_217,
	"0",
	null,
	undefined,
])(
	"rejects invalid intrinsic metrics %s even with explicit independent dimensions",
	(metric) => {
		const invalid = metric as number;
		const style = { ...initialBoxStyle, width: "40px", height: "30px" };
		for (const valid of [0, 50]) {
			for (const preserveAspectRatio of [false, true]) {
				expect(() =>
					resolveReplacedSize(
						invalid,
						valid,
						style,
						200,
						null,
						preserveAspectRatio,
					),
				).toThrow();
				expect(() =>
					resolveReplacedSize(
						valid,
						invalid,
						style,
						200,
						null,
						preserveAspectRatio,
					),
				).toThrow();
			}
		}
	},
);

it("keeps independent fractional, signed-zero and boundary dimensions finite and bounded", () => {
	for (const [intrinsicWidth, intrinsicHeight] of [
		[-0, -0],
		[0, 0.125],
		[0.25, 0],
		[0, 16_777_216],
		[16_777_216, 0],
	]) {
		const result = resolveReplacedSize(
			intrinsicWidth,
			intrinsicHeight,
			initialBoxStyle,
			0,
			null,
			false,
		);
		expect(result.contentWidth).toBe(intrinsicWidth === 0 ? 0 : intrinsicWidth);
		expect(result.contentHeight).toBe(
			intrinsicHeight === 0 ? 0 : intrinsicHeight,
		);
		expect(Object.values(result).every(Number.isFinite)).toBe(true);
	}
	for (const overrides of [
		{ width: "16777217px" },
		{ height: "16777217px" },
		{ width: "16777216px", "padding-left": "1px" },
		{ height: "16777216px", "padding-top": "1px" },
	]) {
		expect(() =>
			resolveReplacedSize(
				0,
				0,
				{ ...initialBoxStyle, ...overrides },
				200,
				null,
				false,
			),
		).toThrow(/limit/);
	}
	for (const containingWidth of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		16_777_217,
	]) {
		expect(() =>
			resolveReplacedSize(0, 0, initialBoxStyle, containingWidth, null, false),
		).toThrow();
		expect(() =>
			resolveReplacedSize(0, 0, initialBoxStyle, 200, containingWidth, false),
		).toThrow();
	}
});
