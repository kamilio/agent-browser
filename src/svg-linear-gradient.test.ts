import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import type { Rgba } from "./raster.js";
import {
	SvgLinearGradient,
	type SvgLinearGradientInput,
} from "./svg-linear-gradient.js";
import type { SvgMatrix } from "./svg-scene-types.js";

const charge = () => {};
const black: Rgba = [0, 0, 0, 255];
const white: Rgba = [255, 255, 255, 255];
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const input = (
	overrides: Partial<SvgLinearGradientInput> = {},
): SvgLinearGradientInput => ({
	x1: 0,
	y1: 0,
	x2: 4,
	y2: 0,
	colorInterpolation: "sRGB",
	stops: [
		{ offset: 0, color: black },
		{ offset: 1, color: white },
	],
	...overrides,
});
const gradient = (overrides: Partial<SvgLinearGradientInput> = {}) =>
	new SvgLinearGradient(input(overrides), charge);
const rejects = (operation: () => unknown, code: string) => {
	expect(operation).toThrow(AgentBrowserError);
	expect(operation).toThrow(expect.objectContaining({ code }));
};

it("samples independently expected opaque pixel-center colors", () => {
	const paint = gradient();
	expect(
		[0.5, 1.5, 2.5, 3.5].map((across) => paint.sample(across, 0.5, charge)),
	).toEqual([
		[32, 32, 32, 255],
		[96, 96, 96, 255],
		[159, 159, 159, 255],
		[223, 223, 223, 255],
	]);
	expect(paint.kind).toBe("linear-gradient");
	expect(Object.isFrozen(paint)).toBe(true);
	expect(Object.isFrozen(paint.sample(1, 0, charge))).toBe(true);
});

it("pads to first and last stops including partial offset ranges", () => {
	const paint = gradient({
		stops: [
			{ offset: 0.25, color: red },
			{ offset: 0.75, color: blue },
		],
	});
	for (const across of [-100, 0, 1])
		expect(paint.sample(across, 0, charge)).toEqual(red);
	for (const across of [3, 4, 100])
		expect(paint.sample(across, 0, charge)).toEqual(blue);
	expect(paint.sample(2, 0, charge)).toEqual([128, 0, 128, 255]);
});

it("uses the latter coincident stop at the overlap and endpoint boundaries", () => {
	const paint = gradient({
		stops: [
			{ offset: 0, color: black },
			{ offset: 0, color: red },
			{ offset: 0.5, color: red },
			{ offset: 0.5, color: blue },
			{ offset: 1, color: blue },
			{ offset: 1, color: white },
		],
	});
	expect(
		[-1, 0, 1.999, 2, 3.999, 4, 5].map((across) =>
			paint.sample(across, 0, charge),
		),
	).toEqual([black, red, red, blue, blue, white, white]);
});

it.each(["pad", "repeat", "reflect"] as const)(
	"uses the last stop's color and alpha for a zero-length %s vector",
	(spreadMethod) => {
		const paint = gradient({
			x1: 3,
			y1: 2,
			x2: 3,
			y2: 2,
			spreadMethod,
			stops: [
				{ offset: 0.25, color: red },
				{ offset: 0.75, color: [0, 0, 255, 129] },
			],
			opacity: 0.5,
		});
		for (const across of [-900, 3, 900]) {
			expect(paint.sample(across, 20, charge)).toEqual([0, 0, 255, 65]);
			expect(paint.withOpacity(0.5, charge).sample(across, 20, charge)).toEqual(
				[0, 0, 255, 32],
			);
		}
	},
);

it.each(["pad", "repeat", "reflect"] as const)(
	"uses a single stop's solid color outside the %s vector",
	(spreadMethod) => {
		const paint = gradient({
			spreadMethod,
			stops: [{ offset: 0.7, color: [255, 0, 0, 129] }],
			opacity: 0.5,
		});
		for (const across of [-100, 0, 4, 100]) {
			expect(paint.sample(across, 1, charge)).toEqual([255, 0, 0, 65]);
			expect(paint.withOpacity(0.5, charge).sample(across, 1, charge)).toEqual([
				255, 0, 0, 32,
			]);
		}
	},
);

it("interpolates up to the first overlapping stop and away from the last", () => {
	const paint = gradient({
		stops: [
			{ offset: 0, color: black },
			{ offset: 0.5, color: red },
			{ offset: 0.5, color: white },
			{ offset: 0.5, color: [0, 0, 255, 129] },
			{ offset: 1, color: white },
		],
	});
	expect(paint.sample(1, 0, charge)).toEqual([128, 0, 0, 255]);
	expect(paint.sample(2, 0, charge)).toEqual([0, 0, 255, 129]);
	expect(paint.sample(3, 0, charge)).toEqual([128, 128, 255, 192]);
	expect(paint.withOpacity(0.5, charge).sample(2, 0, charge)).toEqual([
		0, 0, 255, 65,
	]);
});

it.each([0, 0.5, 1])(
	"keeps source order when all offsets equal %s",
	(offset) => {
		const paint = gradient({
			stops: [
				{ offset, color: red },
				{ offset, color: white },
				{ offset, color: blue },
			],
		});
		expect(paint.sample(offset * 4 - 0.5, 0, charge)).toEqual(red);
		expect(paint.sample(offset * 4, 0, charge)).toEqual(blue);
		expect(paint.sample(offset * 4 + 0.5, 0, charge)).toEqual(blue);
	},
);

it.each([
	["repeat", -4, red],
	["repeat", 4, red],
	["repeat", 8, red],
	["reflect", -4, white],
	["reflect", 4, white],
	["reflect", 8, red],
] as const)(
	"resolves duplicate endpoints after %s spread at %s",
	(spreadMethod, across, color) => {
		const paint = gradient({
			spreadMethod,
			stops: [
				{ offset: 0, color: black },
				{ offset: 0, color: red },
				{ offset: 1, color: blue },
				{ offset: 1, color: white },
			],
		});
		expect(paint.sample(across, 0, charge)).toEqual(color);
	},
);

it.each([
	["repeat", -1, 191],
	["repeat", 1, 64],
	["repeat", 4, 0],
	["repeat", 5, 64],
	["reflect", -1, 64],
	["reflect", -5, 191],
	["reflect", 4, 255],
	["reflect", 5, 191],
	["reflect", 8, 0],
] as const)("samples %s at coordinate %s", (spreadMethod, across, value) => {
	expect(gradient({ spreadMethod }).sample(across, 0, charge)).toEqual([
		value,
		value,
		value,
		255,
	]);
});

it("inverts anisotropic mappings rather than projecting transformed endpoints", () => {
	const paint = gradient({ x2: 1, y2: 1, transform: [4, 0, 0, 1, 0, 0] });
	expect(paint.sample(0, 1, charge)).toEqual([128, 128, 128, 255]);
});

it("inverts a translated shear with independently known local coordinates", () => {
	const paint = gradient({ x2: 1, y2: 1, transform: [1, 0, 2, 1, 10, -3] });
	expect(paint.sample(12, -2, charge)).toEqual([128, 128, 128, 255]);
	expect(paint.sample(11, -3, charge)).toEqual([128, 128, 128, 255]);
});

it("left-composes parent transforms and preserves the original paint", () => {
	const original = gradient({ transform: [1, 0, 0, 1, 10, 20] });
	const mapped = original.transformed([2, 0, 0, 3, -4, 5], charge);
	expect(mapped.sample(18, 65, charge)).toEqual([64, 64, 64, 255]);
	expect(original.sample(11, 20, charge)).toEqual([64, 64, 64, 255]);
	expect(mapped).not.toBe(original);
});

it("supports rotations and negative scales", () => {
	expect(
		gradient({ transform: [0, 1, -1, 0, 3, 4] }).sample(3, 5, charge),
	).toEqual([64, 64, 64, 255]);
	expect(
		gradient({ transform: [-2, 0, 0, 1, 0, 0] }).sample(-2, 0, charge),
	).toEqual([64, 64, 64, 255]);
});

it("deeply copies caller colors, stops and transform", () => {
	const color = [255, 255, 255, 255];
	const transform = [1, 0, 0, 1, 0, 0];
	const stops = [
		{ offset: 0, color: black },
		{ offset: 1, color: color as unknown as Rgba },
	];
	const source = input({ stops, transform: transform as unknown as SvgMatrix });
	const paint = new SvgLinearGradient(source, charge);
	color[0] = 0;
	transform[4] = 99;
	stops[1].offset = 0;
	stops.length = 0;
	expect(paint.sample(2, 0, charge)).toEqual([128, 128, 128, 255]);
	expect(paint.withOpacity(1, charge).sample(2, 0, charge)).toEqual([
		128, 128, 128, 255,
	]);
});

it("uses bounded logarithmic stop lookup without reading caller data per sample", () => {
	let reads = 0;
	const stops = Array.from({ length: 256 }, (_, index) => ({
		offset: index / 255,
		get color(): Rgba {
			reads++;
			return [index, index, index, 255];
		},
	}));
	const paint = gradient({ stops });
	const before = reads;
	let work = 0;
	expect(
		paint.sample(2, 0, (amount) => {
			work += amount;
		}),
	).toEqual([128, 128, 128, 255]);
	expect(reads).toBe(before);
	expect(work).toBeLessThanOrEqual(42);
});

it.each(
	[
		null,
		[],
		{ x1: "0" },
		{ x1: Number.NaN },
		{ y2: Number.POSITIVE_INFINITY },
		{ stops: [] },
		{ stops: Array(2) },
		{ stops: [{ offset: -0.1, color: black }] },
		{ stops: [{ offset: 1.1, color: black }] },
		{ stops: [{ offset: Number.NaN, color: black }] },
		{
			stops: [
				{ offset: 0.7, color: black },
				{ offset: 0.2, color: white },
			],
		},
		{ stops: [{ offset: 0, color: [0, 0, 256, 255] }] },
		{ stops: [{ offset: 0, color: [0, 0.2, 0, 255] }] },
		{ stops: [{ offset: 0, color: [0, 0, 0] }] },
		{ transform: [1, 0] },
		{ transform: [1, 0, 0, Number.NaN, 0, 0] },
		{ spreadMethod: "other" },
		{ colorInterpolation: "other" },
		{ opacity: -1 },
		{ opacity: 2 },
		{ opacity: Number.NaN },
	].map((value) => ({ value })),
)("rejects malformed input %j", ({ value }) => {
	const source =
		value === null || Array.isArray(value)
			? value
			: input(value as Partial<SvgLinearGradientInput>);
	rejects(
		() => new SvgLinearGradient(source as SvgLinearGradientInput, charge),
		"invalid-input",
	);
});

it("rejects empty records, sparse colors, and nonnumeric channels", () => {
	rejects(
		() => new SvgLinearGradient({} as SvgLinearGradientInput, charge),
		"invalid-input",
	);
	const sparse = Array(4);
	sparse[3] = 255;
	for (const color of [sparse, [0, 0, "1", 255], [0, 0, Number.NaN, 255]])
		rejects(
			() =>
				gradient({ stops: [{ offset: 0, color: color as unknown as Rgba }] }),
			"invalid-input",
		);
});

it.each([
	{ x1: 1e9 + 1 },
	{ stops: Array.from({ length: 257 }, () => ({ offset: 0, color: black })) },
	{ transform: [1e9 + 1, 0, 0, 1, 0, 0] },
	{ transform: [1e-10, 0, 0, 1e-10, 0, 0] },
] as Partial<SvgLinearGradientInput>[])(
	"retains fixed resource bounds %j",
	(overrides) => {
		rejects(() => gradient(overrides), "resource-limit");
	},
);

it.each(
	[
		[0, 0, 0, 0, 0, 0],
		[1, 2, 2, 4, 0, 0],
		[1, 0, 0, 1e-16, 0, 0],
	].map((transform) => ({ transform: transform as unknown as SvgMatrix })),
)(
	"explicitly rejects singular or ill-conditioned mapping %j",
	({ transform }) => {
		rejects(() => gradient({ transform }), "unsupported");
	},
);

it("rejects nonfinite sampling and excessive inverse coordinates", () => {
	rejects(() => gradient().sample(Number.NaN, 0, charge), "invalid-input");
	rejects(() => gradient().sample(1e9 + 1, 0, charge), "resource-limit");
	rejects(
		() => gradient({ transform: [0.1, 0, 0, 1, 0, 0] }).sample(1e9, 0, charge),
		"resource-limit",
	);
	rejects(
		() => gradient({ x2: 1e-9, spreadMethod: "repeat" }).sample(1e9, 0, charge),
		"resource-limit",
	);
});

it("retains the explicit linearRGB transfer-function evidence boundary", () => {
	rejects(() => gradient({ colorInterpolation: "linearRGB" }), "unsupported");
});

it("defaults omitted color interpolation to sRGB including transformed opacity", () => {
	const { colorInterpolation, ...omitted } = input();
	expect(colorInterpolation).toBe("sRGB");
	const paint = new SvgLinearGradient(omitted, charge);
	expect(paint.sample(2, 0, charge)).toEqual([128, 128, 128, 255]);
	expect(
		gradient({ colorInterpolation: undefined }).sample(2, 0, charge),
	).toEqual([128, 128, 128, 255]);
	expect(
		paint
			.transformed([2, 0, 1, 1, 5, 3], charge)
			.withOpacity(0.5, charge)
			.sample(9, 3, charge),
	).toEqual([128, 128, 128, 128]);
});

it("interpolates straight RGBA rather than premultiplying transparent endpoints", () => {
	const paint = gradient({
		stops: [
			{ offset: 0, color: [255, 0, 0, 0] },
			{ offset: 1, color: blue },
		],
	});
	expect(paint.sample(2, 0, charge)).toEqual([128, 0, 128, 128]);
	expect(paint.sample(1, 0, charge)).toEqual([191, 0, 64, 64]);
	const transparentBlack = gradient({
		stops: [
			{ offset: 0, color: [0, 0, 0, 0] },
			{ offset: 1, color: red },
		],
	});
	expect(transparentBlack.sample(2, 0, charge)).toEqual([128, 0, 0, 128]);
});

it("retains unassociated RGB even when interpolated alpha is zero", () => {
	const paint = gradient({
		stops: [
			{ offset: 0, color: [255, 0, 0, 0] },
			{ offset: 1, color: [0, 0, 255, 0] },
		],
	});
	expect(paint.sample(2, 0, charge)).toEqual([128, 0, 128, 0]);
});

it("multiplies opacity without repeated byte rounding or RGB changes", () => {
	const original = gradient({
		stops: [
			{ offset: 0, color: [255, 0, 0, 0] },
			{ offset: 1, color: blue },
		],
		opacity: 0.5,
	});
	expect(original.sample(2, 0, charge)).toEqual([128, 0, 128, 64]);
	expect(original.withOpacity(0.5, charge).sample(2, 0, charge)).toEqual([
		128, 0, 128, 32,
	]);
	expect(original.withOpacity(0, charge).sample(2, 0, charge)).toEqual([
		128, 0, 128, 0,
	]);
	expect(original.sample(4, 0, charge)).toEqual([0, 0, 255, 128]);
	expect(original.sample(-1, 0, charge)).toEqual([255, 0, 0, 0]);
});

it("propagates charge failures without changing existing paint", () => {
	const error = new Error("budget stop");
	const fail = () => {
		throw error;
	};
	expect(() => new SvgLinearGradient(input(), fail)).toThrow(error);
	const paint = gradient();
	expect(() => paint.sample(1, 0, fail)).toThrow(error);
	expect(() => paint.transformed([1, 0, 0, 1, 0, 0], fail)).toThrow(error);
	expect(() => paint.withOpacity(1, fail)).toThrow(error);
	expect(paint.sample(1, 0, charge)).toEqual([64, 64, 64, 255]);
});

it.each([
	{
		name: "single stop",
		overrides: { stops: [{ offset: 0.5, color: [10, 20, 30, 0] as Rgba }] },
	},
	{
		name: "zero vector",
		overrides: {
			x2: 0,
			stops: [
				{ offset: 0, color: black },
				{ offset: 1, color: [10, 20, 30, 0] as Rgba },
			],
		},
	},
])(
	"keeps $name sampling immutable, bounded, charged and unassociated",
	({ overrides }) => {
		const stops = overrides.stops.map((stop) => ({
			...stop,
			color: [...stop.color] as [number, number, number, number],
		}));
		const paint = gradient({ ...overrides, stops });
		const error = new Error("constant budget stop");
		expect(() =>
			paint.sample(0, 0, () => {
				throw error;
			}),
		).toThrow(error);
		rejects(() => paint.sample(Number.NaN, 0, charge), "invalid-input");
		rejects(() => paint.sample(0, 1e9 + 1, charge), "resource-limit");
		rejects(() => paint.withOpacity(-1, charge), "invalid-input");
		rejects(() => paint.transformed([0, 0, 0, 0, 0, 0], charge), "unsupported");
		let work = 0;
		expect(
			paint.sample(-1e9, 1e9, (amount) => {
				work += amount;
			}),
		).toEqual([10, 20, 30, 0]);
		expect(work).toBe(24);
		const transformed = paint.transformed([2, 0, 1, 1, 10, -3], charge);
		expect(transformed.withOpacity(0, charge).sample(100, 100, charge)).toEqual(
			[10, 20, 30, 0],
		);
		stops[stops.length - 1].color[0] = 200;
		expect(paint.sample(1, 1, charge)).toEqual([10, 20, 30, 0]);
	},
);

it("keeps duplicate lookup bounded at the fixed stop limit and charges probes", () => {
	const stops = Array.from({ length: 256 }, (_, index) => ({
		offset: index === 255 ? 1 : 0.5,
		color: (index === 254 ? blue : red) as Rgba,
	}));
	const paint = gradient({ stops });
	let work = 0;
	expect(
		paint.sample(2, 0, (amount) => {
			work += amount;
		}),
	).toEqual(blue);
	expect(work).toBeGreaterThan(24);
	expect(work).toBeLessThanOrEqual(42);
	const error = new Error("lookup budget stop");
	expect(() =>
		paint.sample(2, 0, (amount) => {
			if (amount === 2) throw error;
		}),
	).toThrow(error);
	expect(paint.sample(2, 0, charge)).toEqual(blue);
});
