import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { gridTrackSizingLimits, sizeGridTracks } from "./grid-tracks.js";
import type {
	GridTrack,
	GridTrackContribution,
	GridTrackSizingOptions,
} from "./grid-types.js";
import { layoutValueLimits } from "./layout-values.js";

const fixed = (value: number): GridTrack => ({
	minimum: `${value}px`,
	maximum: `${value}px`,
});
const range = (minimum: string, maximum: string): GridTrack => ({
	minimum,
	maximum,
});
const auto = (): GridTrack => range("auto", "auto");
const flex = (factor = 1, minimum = "0px"): GridTrack =>
	range(minimum, `${factor}fr`);
const fit = (value: string): GridTrack => ({
	minimum: "auto",
	maximum: "max-content",
	fitContent: value,
});
const item = (
	start: number,
	end: number,
	minimum: number,
	minContent = minimum,
	maxContent = minContent,
): GridTrackContribution => ({ start, end, minimum, minContent, maxContent });
const size = (
	tracks: readonly GridTrack[],
	items: readonly GridTrackContribution[] = [],
	availableSpace: number | null = null,
	options: Partial<GridTrackSizingOptions> = {},
) => sizeGridTracks(tracks, items, { availableSpace, gap: 0, ...options });
const expectSizes = (
	actual: readonly number[],
	expected: readonly number[],
) => {
	expect(actual).toHaveLength(expected.length);
	for (let index = 0; index < expected.length; index++)
		expect(actual[index]).toBeCloseTo(expected[index]!, 8);
};
const fails = (run: () => unknown, code: string) => {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		return;
	}
	throw new Error(`Expected ${code}`);
};

describe("Grid track initialization and definite maximization", () => {
	it.each([0, 50, 200, null])(
		"retains fixed sizes at available space %s",
		(available) => {
			const result = size([fixed(30), fixed(40)], [], available, { gap: 10 });
			expect(result.sizes).toEqual([30, 40]);
			expect(result.offsets).toEqual([0, 40, 80]);
			expect(result.extent).toBe(80);
		},
	);
	it("resolves percentages against the container before subtracting gutters", () => {
		const result = size([range("25%", "25%"), flex()], [], 200, { gap: 10 });
		expect(result.sizes).toEqual([50, 140]);
		expect(result.offsets).toEqual([0, 60, 200]);
	});
	it("keeps overflowing percentage tracks and gaps", () => {
		expect(
			size([range("50%", "50%"), range("50%", "50%")], [], 100, { gap: 20 })
				.extent,
		).toBe(120);
	});
	it.each([null, 0, 20, 100])(
		"floors a fixed maximum at its minimum for %s",
		(available) => {
			expect(size([range("80px", "30px")], [], available).sizes).toEqual([80]);
		},
	);
	it.each([
		[100, [50, 50]],
		[180, [60, 120]],
		[500, [60, 200]],
	] as const)(
		"maximizes to limits with freezing at %s",
		(available, expected) => {
			expectSizes(
				size([range("0px", "60px"), range("0px", "200px")], [], available)
					.sizes,
				expected,
			);
		},
	);
	it.each([
		[1280, [240, 32, 736, 32, 240]],
		[1600, [384, 32, 768, 32, 384]],
		[400, [240, 32, 0, 32, 240]],
	] as const)("sizes MDN's five-track shell at %s", (available, expected) => {
		const tracks = [
			flex(1, "240px"),
			fixed(32),
			range("0px", "768px"),
			fixed(32),
			flex(1, "240px"),
		];
		expectSizes(size(tracks, [], available).sizes, expected);
	});
	it("returns no leading or trailing gap for zero-sized tracks", () => {
		const result = size([fixed(0), fixed(0), fixed(0)], [], null, { gap: 7 });
		expect(result.offsets).toEqual([0, 7, 14, 14]);
		expect(result.extent).toBe(14);
	});
	it("does not add a gap to a single track", () => {
		expect(size([fixed(10)], [], null, { gap: 99 }).offsets).toEqual([0, 10]);
	});
});

describe("Grid intrinsic contributions", () => {
	it.each([
		["auto", "auto", 10, 100],
		["min-content", "min-content", 40, 40],
		["max-content", "max-content", 100, 100],
		["min-content", "max-content", 40, 100],
		["max-content", "min-content", 100, 100],
		["auto", "min-content", 10, 40],
	] as const)(
		"uses %s / %s without conflating the automatic minimum",
		(minimum, maximum, small, indefinite) => {
			const tracks = [range(minimum, maximum)];
			const items = [item(0, 1, 10, 40, 100)];
			expect(size(tracks, items, 0).sizes).toEqual([small]);
			expect(size(tracks, items).sizes).toEqual([indefinite]);
		},
	);
	it.each(["min-content", "max-content"] as const)(
		"uses limited min-content under the %s constraint",
		(mode) => {
			expect(
				size([range("auto", "60px")], [item(0, 1, 10, 90, 150)], null, { mode })
					.sizes,
			).toEqual([60]);
			expect(
				size([range("auto", "60px")], [item(0, 1, 80, 90, 150)], null, { mode })
					.sizes,
			).toEqual([80]);
		},
	);
	it("does not maximize tracks under a min-content constraint", () => {
		expect(
			size(
				[auto(), flex(1, "auto")],
				[item(0, 1, 5, 30, 100), item(1, 2, 5, 20, 80)],
				500,
				{ mode: "min-content", stretchAuto: true },
			).sizes,
		).toEqual([30, 20]);
	});
	it("uses infinite free space under a max-content constraint", () => {
		expect(
			size([auto(), fixed(20)], [item(0, 1, 5, 30, 100)], 1, {
				mode: "max-content",
			}).sizes,
		).toEqual([100, 20]);
	});
	it("takes maxima across multiple non-spanning items", () => {
		const items = [item(0, 1, 20, 30, 40), item(0, 1, 10, 50, 80)];
		expect(size([auto()], items, 0).sizes).toEqual([20]);
		expect(size([auto()], items).sizes).toEqual([80]);
		expect(size([range("min-content", "min-content")], items).sizes).toEqual([
			50,
		]);
	});
	it("treats cyclic percentages as auto without inventing definite space", () => {
		const tracks = [range("50%", "50%"), auto()];
		const items = [item(0, 1, 5, 20, 60), item(1, 2, 10, 40, 80)];
		expect(size(tracks, items).sizes).toEqual([60, 80]);
		expect(size(tracks, items, null, { mode: "min-content" }).sizes).toEqual([
			20, 40,
		]);
	});
	it.each([
		[10, 30, 50, 50],
		[10, 30, 200, 100],
		[120, 130, 200, 120],
	] as const)(
		"caps fit-content growth, not the minimum %s",
		(minimum, minContent, maxContent, expected) => {
			expect(
				size([fit("100px")], [item(0, 1, minimum, minContent, maxContent)])
					.sizes,
			).toEqual([expected]);
		},
	);
	it("limits fit-content under intrinsic sizing", () => {
		expect(
			size([fit("50px")], [item(0, 1, 10, 100, 200)], null, {
				mode: "min-content",
			}).sizes,
		).toEqual([50]);
	});
	it("resolves definite and cyclic fit-content percentages separately", () => {
		const tracks = [fit("25%")];
		const items = [item(0, 1, 10, 30, 200)];
		expect(size(tracks, items, 400).sizes).toEqual([100]);
		expect(size(tracks, items).sizes).toEqual([200]);
	});
	it.each([false, true])(
		"only stretches auto maxima when requested: %s",
		(stretchAuto) => {
			const result = size(
				[auto(), range("auto", "max-content"), fit("100px")],
				[
					item(0, 1, 10, 20, 30),
					item(1, 2, 10, 20, 30),
					item(2, 3, 10, 20, 30),
				],
				300,
				{ stretchAuto },
			);
			expect(result.sizes).toEqual(stretchAuto ? [240, 30, 30] : [30, 30, 30]);
		},
	);
	it("shares remaining definite space between auto tracks only", () => {
		expect(
			size([auto(), fixed(50), auto()], [item(0, 1, 20), item(2, 3, 40)], 230, {
				gap: 10,
				stretchAuto: true,
			}).sizes,
		).toEqual([70, 50, 90]);
	});
	it("does not stretch when available space is indefinite", () => {
		expect(
			size([auto(), auto()], [item(0, 1, 20), item(1, 2, 40)], null, {
				stretchAuto: true,
			}).sizes,
		).toEqual([20, 40]);
	});
});

describe("Grid spanning intrinsic distribution", () => {
	it("distributes contributions across a span with internal gutters", () => {
		expect(
			size([auto(), auto()], [item(0, 2, 50, 90, 130)], null, { gap: 10 })
				.sizes,
		).toEqual([60, 60]);
		expect(
			size([auto(), auto()], [item(0, 2, 50, 90, 130)], 0, { gap: 10 }).sizes,
		).toEqual([20, 20]);
	});
	it("freezes a content-sized track and grows an initially infinite track", () => {
		const tracks = [
			range("min-content", "max-content"),
			range("min-content", "max-content"),
		];
		const items = [item(0, 1, 10), item(0, 2, 30, 30, 100)];
		expect(size(tracks, items).sizes).toEqual([10, 90]);
		expect(size(tracks, items, 0).sizes).toEqual([10, 20]);
	});
	it("redistributes base growth after a fit-content cap freezes", () => {
		expect(size([fit("40px"), auto()], [item(0, 2, 140)], 0).sizes).toEqual([
			40, 100,
		]);
	});
	it("allows a spanning minimum to exceed all fit-content caps", () => {
		expect(
			size([fit("40px"), fit("40px")], [item(0, 2, 140)], 0).sizes,
		).toEqual([70, 70]);
	});
	it("does not grow fit-content maximums beyond their arguments", () => {
		expect(
			size([fit("40px"), fit("60px")], [item(0, 2, 0, 0, 200)]).sizes,
		).toEqual([40, 60]);
	});
	it("grows non-affected tracks to their limits before exceeding affected limits", () => {
		expect(
			size([range("auto", "20px"), range("0px", "100px")], [item(0, 2, 80)], 0)
				.sizes,
		).toEqual([20, 60]);
	});
	it("preserves a spanning minimum after all finite limits are exhausted", () => {
		expect(
			size([range("auto", "20px"), range("0px", "30px")], [item(0, 2, 100)], 0)
				.sizes,
		).toEqual([70, 30]);
	});
	it("does not distribute into genuinely fixed tracks", () => {
		expect(size([fixed(20), fixed(30)], [item(0, 2, 200)]).sizes).toEqual([
			20, 30,
		]);
	});
	it("prioritizes intrinsic maximums when increasing bases beyond growth limits", () => {
		const tracks = [range("auto", "20px"), auto()];
		const items = [item(1, 2, 10), item(0, 2, 100)];
		expect(size(tracks, items, 0).sizes).toEqual([20, 80]);
	});
	it("retains an untouched infinite limit for a later larger span", () => {
		const tracks = [
			range("min-content", "max-content"),
			range("min-content", "max-content"),
			range("min-content", "max-content"),
		];
		const items = [item(0, 2, 20), item(0, 3, 30, 30, 100)];
		expect(size(tracks, items).sizes).toEqual([10, 10, 80]);
	});
	it("uses planned increases, not item-order-dependent incremental updates", () => {
		const tracks = [auto(), auto(), auto()];
		const items = [item(0, 2, 100), item(1, 3, 100)];
		expect(size(tracks, items).sizes).toEqual([50, 50, 50]);
		expect(size(tracks, [...items].reverse()).sizes).toEqual([50, 50, 50]);
	});
	it("processes shorter spans before longer ones regardless of input order", () => {
		const tracks = [auto(), auto(), auto()];
		const items = [item(0, 3, 180), item(0, 2, 100)];
		expect(size(tracks, items).sizes).toEqual([50, 50, 80]);
		expect(size(tracks, [...items].reverse()).sizes).toEqual([50, 50, 80]);
	});
	it("limits intrinsic spanning contributions only if every maximum is fixed", () => {
		const items = [item(0, 2, 20, 200, 300)];
		expect(
			size([range("auto", "40px"), range("auto", "60px")], items, null, {
				gap: 10,
				mode: "min-content",
			}).sizes,
		).toEqual([40, 60]);
		expect(
			size([range("auto", "40px"), auto()], items, null, {
				gap: 10,
				mode: "min-content",
			}).sizes,
		).toEqual([40, 150]);
	});
	it("does not apply the single-track fit-content limited-contribution cap to spans", () => {
		expect(
			size([fit("40px"), fit("40px")], [item(0, 2, 10, 200, 300)], null, {
				mode: "min-content",
			}).sizes,
		).toEqual([100, 100]);
	});
	it("accommodates max-content minimums even in a min-content container", () => {
		expect(
			size(
				[
					range("max-content", "max-content"),
					range("max-content", "max-content"),
				],
				[item(0, 2, 10, 40, 160)],
				null,
				{ mode: "min-content" },
			).sizes,
		).toEqual([80, 80]);
	});
});

describe("Grid flexible fractions", () => {
	it.each([
		[
			[1, 2],
			[100, 200],
		],
		[
			[0.25, 0.25],
			[75, 75],
		],
		[
			[0, 1],
			[0, 300],
		],
		[
			[0, 0],
			[0, 0],
		],
	] as const)("uses flexible factors %s", (factors, expected) => {
		expectSizes(
			size(
				factors.map((factor) => flex(factor)),
				[],
				300,
			).sizes,
			expected,
		);
	});
	it("subtracts fixed tracks and gaps before finding an fr", () => {
		expect(
			size([fixed(100), flex(), flex(2)], [], 440, { gap: 20 }).sizes,
		).toEqual([100, 100, 200]);
	});
	it("freezes flexible minima and recomputes the fraction", () => {
		expect(size([flex(1, "200px"), flex()], [], 300).sizes).toEqual([200, 100]);
	});
	it("restarts flexible freezing through multiple iterations", () => {
		expect(
			size([flex(1, "100px"), flex(1, "80px"), flex()], [], 240).sizes,
		).toEqual([100, 80, 60]);
	});
	it("preserves overflowing flexible minima", () => {
		expect(size([flex(1, "200px"), flex(2, "150px")], [], 100).sizes).toEqual([
			200, 150,
		]);
	});
	it("floors the unfrozen factor sum at one after freezing", () => {
		expect(size([flex(0.5, "200px"), flex(0.5)], [], 300).sizes).toEqual([
			200, 50,
		]);
	});
	it("honors an auto minimum on a bare fr track", () => {
		expect(
			size([flex(1, "auto"), flex()], [item(0, 1, 200, 220, 400)], 300).sizes,
		).toEqual([200, 100]);
	});
	it("honors the minimum of a zero-fr track", () => {
		expect(
			size([flex(0, "auto"), flex()], [item(0, 1, 50, 60, 100)], 200).sizes,
		).toEqual([50, 150]);
	});
	it("uses measured row content for an indefinite outer 1fr", () => {
		const tracks = [
			range("min-content", "min-content"),
			range("min-content", "min-content"),
			flex(1, "auto"),
			range("min-content", "min-content"),
		];
		const items = [
			item(0, 1, 40),
			item(1, 2, 20),
			item(2, 3, 80, 160, 480),
			item(3, 4, 30),
		];
		expect(size(tracks, items).sizes).toEqual([40, 20, 480, 30]);
	});
	it("finds a shared indefinite fraction from item max-content contributions", () => {
		expect(
			size([flex(1), flex(2)], [item(0, 1, 0, 50, 120), item(1, 2, 0, 20, 100)])
				.sizes,
		).toEqual([120, 240]);
	});
	it("includes flexible bases in an indefinite fraction even without items", () => {
		expect(size([flex(2, "100px"), flex(1, "10px")]).sizes).toEqual([100, 50]);
	});
	it("does not normalize factors below one in an indefinite grid", () => {
		expect(size([flex(0.5)], [item(0, 1, 0, 20, 100)]).sizes).toEqual([50]);
		expect(size([flex(0.5, "80px")]).sizes).toEqual([80]);
	});
	it("uses spanning max-content contributions when finding indefinite fractions", () => {
		expect(
			size([fixed(50), flex(), flex(2)], [item(0, 3, 0, 100, 370)], null, {
				gap: 10,
			}).sizes,
		).toEqual([50, 100, 200]);
	});
	it("distributes flexible intrinsic minima proportionally for a factor sum above one", () => {
		expect(
			size([flex(1, "auto"), flex(3, "auto")], [item(0, 2, 120)], 0).sizes,
		).toEqual([30, 90]);
	});
	it("shares the residual equally when intrinsic flexible factors sum below one", () => {
		expect(
			size([flex(0.1, "auto"), flex(0.3, "auto")], [item(0, 2, 100)], 0).sizes,
		).toEqual([40, 60]);
	});
	it("ignores non-flexible growth opportunities when accommodating flexible spans", () => {
		expect(
			size([range("auto", "200px"), flex(1, "auto")], [item(0, 2, 100)], 0)
				.sizes,
		).toEqual([0, 100]);
	});
	it("groups all flexible spans together independent of span length", () => {
		const tracks = [flex(1, "auto"), flex(1, "auto"), flex(1, "auto")];
		const items = [item(0, 2, 100), item(0, 3, 120)];
		expect(size(tracks, items, 0).sizes).toEqual([50, 50, 40]);
		expect(size(tracks, [...items].reverse(), 0).sizes).toEqual([50, 50, 40]);
	});
	it("does not expand flexible tracks under a min-content constraint", () => {
		expect(
			size(
				[flex(1, "auto"), flex(2, "auto")],
				[item(0, 2, 30, 90, 300)],
				1000,
				{ mode: "min-content" },
			).sizes,
		).toEqual([30, 60]);
	});
});

describe("Grid sizing validation, bounds and immutability", () => {
	it("returns a frozen empty axis", () => {
		const result = size([], [], 100, { gap: 20 });
		expect(result.sizes).toEqual([]);
		expect(result.offsets).toEqual([0]);
		expect(result.extent).toBe(0);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.sizes)).toBe(true);
		expect(Object.isFrozen(result.offsets)).toBe(true);
		expect(Object.isFrozen(result.metrics)).toBe(true);
	});
	it("does not mutate tracks, contributions, or options", () => {
		const tracks = Object.freeze([
			Object.freeze(auto()),
			Object.freeze(flex()),
		]);
		const items = Object.freeze([Object.freeze(item(0, 2, 20, 40, 100))]);
		const options = Object.freeze({
			availableSpace: 300,
			gap: 10,
			stretchAuto: true,
		});
		const before = JSON.stringify([tracks, items, options]);
		const result = sizeGridTracks(tracks, items, options);
		expect(JSON.stringify([tracks, items, options])).toBe(before);
		expect(sizeGridTracks(tracks, items, options)).toEqual(result);
	});
	it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
		"rejects invalid available space %s",
		(available) => {
			fails(
				() =>
					sizeGridTracks([], [], {
						availableSpace: available as number,
						gap: 0,
					}),
				"invalid-input",
			);
		},
	);
	it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid gaps %s",
		(gap) => {
			fails(() => size([], [], null, { gap }), "invalid-input");
		},
	);
	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		gridTrackSizingLimits.maxWork + 1,
	])("rejects invalid work budget %s", (maxWork) => {
		fails(() => size([], [], null, { maxWork }), "invalid-input");
	});
	it.each([
		{ mode: "wrong" },
		{ mode: null },
		{ stretchAuto: 1 },
		{ stretchAuto: null },
	])("rejects invalid option %s", (options) => {
		fails(
			() => size([], [], null, options as Partial<GridTrackSizingOptions>),
			"invalid-input",
		);
	});
	it.each([
		item(-1, 1, 0),
		item(0, 0, 0),
		item(0, 2, 0),
		item(0.5, 1, 0),
		item(0, 1.5, 0),
		item(0, 1, -1),
		item(0, 1, 2, 1, 3),
		item(0, 1, 0, 3, 2),
		item(0, 1, Number.NaN),
		item(0, 1, 0, 1, Number.POSITIVE_INFINITY),
	])("rejects invalid contribution %s", (contribution) => {
		fails(() => size([auto()], [contribution]), "invalid-input");
	});
	it("rejects contributions into an empty axis", () => {
		fails(() => size([], [item(0, 1, 0)]), "invalid-input");
	});
	it.each([
		"subgrid",
		"masonry",
		"fit-content(20px)",
		"minmax(0px, 1fr)",
		"2em",
		"-1fr",
	])("explicitly rejects uncomputed or unsupported function %s", (maximum) => {
		fails(() => size([range("0px", maximum)]), "unsupported");
	});
	it("rejects a flexible minimum", () => {
		fails(() => size([range("1fr", "1fr")]), "invalid-input");
	});
	it("rejects an invalid fit-content shape", () => {
		fails(() => size([{ ...fixed(0), fitContent: "100px" }]), "invalid-input");
		fails(() => size([fit("auto")]), "invalid-input");
	});
	it("bounds source length and numeric overflow", () => {
		fails(() => size([flex(Number.POSITIVE_INFINITY)]), "unsupported");
		fails(() => size([range("0px", "1e999fr")]), "resource-limit");
		fails(
			() => size([range("0px", `${"0".repeat(8193)}px`)]),
			"resource-limit",
		);
		fails(
			() => size([fixed(layoutValueLimits.maxAbsoluteLength + 1)]),
			"resource-limit",
		);
	});
	it("bounds total extent and aggregate gutters", () => {
		fails(
			() => size([fixed(layoutValueLimits.maxAbsoluteLength), fixed(1)]),
			"resource-limit",
		);
		fails(
			() =>
				size([fixed(0), fixed(0), fixed(0)], [], null, {
					gap: layoutValueLimits.maxAbsoluteLength,
				}),
			"resource-limit",
		);
	});
	it("accepts the exact absolute-length boundary", () => {
		expect(size([fixed(layoutValueLimits.maxAbsoluteLength)]).extent).toBe(
			layoutValueLimits.maxAbsoluteLength,
		);
	});
	it("accepts exactly the track count limit and rejects one over", () => {
		const tracks = Array.from({ length: gridTrackSizingLimits.maxTracks }, () =>
			fixed(0),
		);
		expect(size(tracks).sizes).toHaveLength(gridTrackSizingLimits.maxTracks);
		fails(() => size([...tracks, fixed(0)]), "resource-limit");
	});
	it("accepts exactly the item count limit and rejects one over", () => {
		const items = Array.from({ length: gridTrackSizingLimits.maxItems }, () =>
			item(0, 1, 0),
		);
		expect(size([auto()], items).sizes).toEqual([0]);
		fails(() => size([auto()], [...items, item(0, 1, 0)]), "resource-limit");
	});
	it("charges scanning, planning and freezing deterministically", () => {
		const tracks = [auto(), fit("30px"), flex(2, "auto")];
		const items = [item(0, 2, 100, 120, 200), item(1, 3, 120, 150, 250)];
		const baseline = size(tracks, items, 400, { gap: 10 });
		expect(baseline.metrics.work).toBeGreaterThan(100);
		expect(
			size(tracks, items, 400, { gap: 10, maxWork: baseline.metrics.work }),
		).toEqual(baseline);
		fails(
			() =>
				size(tracks, items, 400, {
					gap: 10,
					maxWork: baseline.metrics.work - 1,
				}),
			"resource-limit",
		);
		expect(size(tracks, items, 400, { gap: 10 })).toEqual(baseline);
	});
	it("fails before unbounded distribution when a low budget is exhausted", () => {
		const tracks = Array.from({ length: 200 }, () => auto());
		const items = Array.from({ length: 200 }, () => item(0, 200, 1000));
		fails(() => size(tracks, items, null, { maxWork: 1000 }), "resource-limit");
	});
	it("rejects malformed values instead of native type errors", () => {
		fails(() => size(new Array<GridTrack>(1)), "invalid-input");
		fails(
			() => size([], [], null, { maxWork: null as unknown as number }),
			"invalid-input",
		);
		fails(() => size([null as unknown as GridTrack]), "invalid-input");
		fails(
			() => size([auto()], [null as unknown as GridTrackContribution]),
			"invalid-input",
		);
		fails(
			() => size([range(undefined as unknown as string, "auto")]),
			"invalid-input",
		);
	});
});

describe("Grid sizing cross-phase invariants", () => {
	it.each(["normal", "min-content", "max-content"] as const)(
		"is item-order independent in %s mode",
		(mode) => {
			const definitions = [
				auto(),
				fit("40px"),
				range("min-content", "max-content"),
				range("max-content", "min-content"),
				range("auto", "50px"),
				flex(0.25, "auto"),
				flex(2, "min-content"),
			];
			for (let seed = 0; seed < 70; seed++) {
				const tracks = Array.from(
					{ length: 4 },
					(_, index) => definitions[(seed + index * 2) % definitions.length]!,
				);
				const items = [
					item(0, 1, seed, seed + 15, seed + 80),
					item(1, 3, 10, 80, 150),
					item(2, 4, 30, 70, 130),
					item(0, 4, 40, 90, 230),
					item(0, 2, 20, 60, 120),
					item(2, 3, 5, 30, 40),
				];
				for (const availableSpace of [null, 0, 160, 600]) {
					const baseline = size(tracks, items, availableSpace, {
						gap: 7,
						mode,
					});
					expectSizes(
						size(tracks, [...items].reverse(), availableSpace, { gap: 7, mode })
							.sizes,
						baseline.sizes,
					);
					const rotated = [...items.slice(3), ...items.slice(0, 3)];
					expectSizes(
						size(tracks, rotated, availableSpace, { gap: 7, mode }).sizes,
						baseline.sizes,
					);
				}
			}
		},
	);
	it("preserves finite geometry and definite fr conservation across varied minima", () => {
		for (let seed = 0; seed < 100; seed++) {
			const minima = [seed % 17, (seed * 11) % 83, (seed * 7) % 47];
			const tracks = minima.map((minimum, index) =>
				flex(index + 1, `${minimum}px`),
			);
			const availableSpace = 200 + seed;
			const result = size(tracks, [], availableSpace, { gap: 7 });
			expect(result.extent).toBeCloseTo(availableSpace, 8);
			for (let index = 0; index < tracks.length; index++) {
				expect(result.sizes[index]).toBeGreaterThanOrEqual(minima[index]!);
				expect(Number.isFinite(result.sizes[index])).toBe(true);
				expect(result.offsets[index + 1]).toBeGreaterThanOrEqual(
					result.offsets[index]!,
				);
			}
			const reversed = size([...tracks].reverse(), [], availableSpace, {
				gap: 7,
			});
			expectSizes([...reversed.sizes].reverse(), result.sizes);
		}
	});
	it("scales track functions, contributions, available space and gaps coherently", () => {
		const first = size(
			[range("auto", "100px"), fit("60px"), flex(2, "auto")],
			[item(0, 2, 80, 120, 190), item(1, 3, 40, 90, 160)],
			300,
			{ gap: 10 },
		);
		const second = size(
			[range("auto", "200px"), fit("120px"), flex(2, "auto")],
			[item(0, 2, 160, 240, 380), item(1, 3, 80, 180, 320)],
			600,
			{ gap: 20 },
		);
		expectSizes(
			second.sizes,
			first.sizes.map((value) => value * 2),
		);
		expectSizes(
			second.offsets,
			first.offsets.map((value) => value * 2),
		);
	});
});
