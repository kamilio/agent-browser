import { expect, it } from "vitest";
import { parseSvgPath, type SvgPathLimits, svgPathLimits } from "./svg-path.js";

const ignoreWork = () => {};
const parse = (source: string, limits?: Partial<SvgPathLimits>) =>
	parseSvgPath(source, ignoreWork, limits);
const point = (across: number, down: number) => ({ x: across, y: down });

it.each(["", " ", "\t\r\n "])("accepts empty path %j", (source) => {
	expect(parse(source)).toEqual([]);
	expect(Object.isFrozen(parse(source))).toBe(true);
});

it("normalizes move, line, horizontal, vertical and close commands", () => {
	expect(parse("M10 20 30 40 L50 60 H70 V80 z")).toEqual([
		{ kind: "move", end: point(10, 20) },
		{ kind: "line", start: point(10, 20), end: point(30, 40) },
		{ kind: "line", start: point(30, 40), end: point(50, 60) },
		{ kind: "line", start: point(50, 60), end: point(70, 60) },
		{ kind: "line", start: point(70, 60), end: point(70, 80) },
		{ kind: "close", start: point(70, 80), end: point(10, 20) },
	]);
});

it.each([
	["m10 20 20 20 l20 20 h20 v20 Z", "M10 20L30 40 50 60H70V80z"],
	["M10 20c1 2 3 4 5 6", "M10 20C11 22 13 24 15 26"],
	["M10 20q1 2 3 4", "M10 20Q11 22 13 24"],
	["M10 20s1 2 3 4", "M10 20S11 22 13 24"],
	["M10 20t1 2", "M10 20T11 22"],
	["M10 20a3 4 -30 0 1 5 6", "M10 20A3 4 -30 0 1 15 26"],
	["M1 2m3 4 5 6", "M1 2M4 6L9 12"],
	["M1 2h3 4v5 6", "M1 2H4 8V7 13"],
	["M1 2c1 2 3 4 5 6 1 2 3 4 5 6", "M1 2C2 4 4 6 6 8C7 10 9 12 11 14"],
	["M1 2q1 2 3 4 1 2 3 4", "M1 2Q2 4 4 6Q5 8 7 10"],
	["M1 2s1 2 3 4 1 2 3 4", "M1 2S2 4 4 6S5 8 7 10"],
	["M1 2t3 4 3 4", "M1 2T4 6T7 10"],
	["M1 2a3 4 5 0 1 6 7 3 4 5 1 0 6 7", "M1 2A3 4 5 0 1 7 9A3 4 5 1 0 13 16"],
])("normalizes relative and repeated groups %s", (source, absolute) => {
	expect(parse(source)).toEqual(parse(absolute));
});

it("reflects cubic and repeated smooth cubic controls", () => {
	expect(parse("M1 2C3 4 5 6 7 8S9 10 11 12 13 14 15 16")).toEqual([
		{ kind: "move", end: point(1, 2) },
		{
			kind: "cubic",
			start: point(1, 2),
			control1: point(3, 4),
			control2: point(5, 6),
			end: point(7, 8),
		},
		{
			kind: "cubic",
			start: point(7, 8),
			control1: point(9, 10),
			control2: point(9, 10),
			end: point(11, 12),
		},
		{
			kind: "cubic",
			start: point(11, 12),
			control1: point(13, 14),
			control2: point(13, 14),
			end: point(15, 16),
		},
	]);
});

it("reflects quadratic and repeated smooth quadratic controls", () => {
	expect(parse("M1 2Q3 4 5 6T7 8 9 10").slice(1)).toEqual([
		{
			kind: "quadratic",
			start: point(1, 2),
			control: point(3, 4),
			end: point(5, 6),
		},
		{
			kind: "quadratic",
			start: point(5, 6),
			control: point(7, 8),
			end: point(7, 8),
		},
		{
			kind: "quadratic",
			start: point(7, 8),
			control: point(7, 8),
			end: point(9, 10),
		},
	]);
});

it.each(["L8 9", "H8", "V9", "M8 9", "Z", "A2 3 0 0 1 8 9"])(
	"resets both smooth reflections after %s",
	(command) => {
		const cubic = parse(`M1 2C3 4 5 6 7 8${command}S10 11 12 13`).at(-1);
		const quadratic = parse(`M1 2Q3 4 7 8${command}T12 13`).at(-1);
		if (cubic?.kind !== "cubic" || quadratic?.kind !== "quadratic")
			throw new Error("Expected curves");
		expect(cubic.control1).toEqual(cubic.start);
		expect(quadratic.control).toEqual(quadratic.start);
	},
);

it("does not reflect between cubic and quadratic families", () => {
	expect(parse("M1 2Q3 4 5 6S7 8 9 10").at(-1)).toMatchObject({
		control1: point(5, 6),
	});
	expect(parse("M1 2C3 4 5 6 7 8T9 10").at(-1)).toMatchObject({
		control: point(7, 8),
	});
});

it("restores closed subpaths and allows drawing or moving after close", () => {
	expect(parse("M10 20l5 6Zl2 3z m30 40l1 2Z")).toEqual([
		{ kind: "move", end: point(10, 20) },
		{ kind: "line", start: point(10, 20), end: point(15, 26) },
		{ kind: "close", start: point(15, 26), end: point(10, 20) },
		{ kind: "line", start: point(10, 20), end: point(12, 23) },
		{ kind: "close", start: point(12, 23), end: point(10, 20) },
		{ kind: "move", end: point(40, 60) },
		{ kind: "line", start: point(40, 60), end: point(41, 62) },
		{ kind: "close", start: point(41, 62), end: point(40, 60) },
	]);
	expect(parse("M1 2Zz").slice(1)).toEqual([
		{ kind: "close", start: point(1, 2), end: point(1, 2) },
		{ kind: "close", start: point(1, 2), end: point(1, 2) },
	]);
});

it.each([
	["M.6.5L1-2", "M0.6 0.5L1 -2"],
	["M1e2-2E+1L+3.e-1.4", "M100 -20L0.3 0.4"],
	["M1.,2. 3.,4.", "M1 2L3 4"],
	["\tM 1 ,\r2\nL3, 4 \r", "M1 2L3 4"],
	["M0 0A2 3 45 0110-20", "M0 0A2 3 45 0 1 10 -20"],
	["M0 0a2,3,45,10.5.6", "M0 0a2 3 45 1 0 0.5 0.6"],
])("accepts compact ASCII path grammar %s", (source, expanded) => {
	expect(parse(source)).toEqual(parse(expanded));
});

it.each([
	"M",
	"M0",
	"L0 0",
	"z",
	"0 0",
	"M,0 0",
	"M0,,0",
	"M0, ,0",
	"M0 0,",
	"M0 0,L1 1",
	"M0 0,L",
	"M0 0 L,1 1",
	"M0 0Z,",
	"M0 0Z1 2",
	"M0 0X1 2",
	"M0 0 trailing",
	"M0 0;",
	"M0 0\u0000",
	"M0 0\f",
	"M0\u00a00",
	"M0 0L1",
	"M0 0H",
	"M0 0V",
	"M0 0C1 2 3 4 5",
	"M0 0S1 2 3",
	"M0 0Q1 2 3",
	"M0 0T1",
	"M0 0A1 2 3 0 1 4",
	"M0 0L1 2 3",
	"M. 0",
	"M+ 0",
	"M--1 0",
	"M1e 0",
	"M1e+ 0",
	"M1e- 0",
	"M1e.2 0",
	"MNaN 0",
	"MInfinity 0",
	"M0x10 0",
	"M\u22121 0",
	"M\uff11 0",
	"M0 0A1 2 3 2 0 4 5",
	"M0 0A1 2 3 -1 0 4 5",
	"M0 0A1 2 3 +1 0 4 5",
	"M0 0A1 2 3 0.0 1 4 5",
	"M0 0A1 2 3 0 1.0 4 5",
	"M0 0A1 2 3 0 1e0 4 5",
	"M0 0A1 2 3 0, ,1 4 5",
	"M0 0A1 2 3 01 4 5,",
])("fails closed on malformed syntax %j", (source) => {
	expect(() => parse(source)).toThrow(SyntaxError);
});

it.each(["00", "01", "10", "11"])(
	"preserves adjacent arc flags %s",
	(flags) => {
		expect(parse(`M1 2A-3 -4 -450 ${flags}5 6`).at(-1)).toEqual({
			kind: "arc",
			start: point(1, 2),
			end: point(5, 6),
			radiusX: 3,
			radiusY: 4,
			rotation: -450,
			largeArc: flags[0] === "1",
			sweep: flags[1] === "1",
		});
	},
);

it("preserves zero-radius and coincident-endpoint arcs for renderer handling", () => {
	expect(parse("M1 2A0 -4 720 0 1 3 4A5 0 0 1 0 3 4").slice(1)).toEqual([
		{
			kind: "arc",
			start: point(1, 2),
			end: point(3, 4),
			radiusX: 0,
			radiusY: 4,
			rotation: 720,
			largeArc: false,
			sweep: true,
		},
		{
			kind: "arc",
			start: point(3, 4),
			end: point(3, 4),
			radiusX: 5,
			radiusY: 0,
			rotation: 0,
			largeArc: true,
			sweep: false,
		},
	]);
});

it.each([
	"M1e309 0",
	"M-1e309 0",
	"M1000000001 0",
	"M0 -1000000001",
	"M1e9 0l1 0",
	"M0 -1e9v-1",
	"M1e9 0h1",
	"M0 0C0 0 -1e9 0 1e9 0S0 0 0 0",
	"M0 0Q-1e9 0 1e9 0T0 0",
	"M0 0c1e9 0 1e9 0 1e9 0c1 0 0 0 0 0",
	"M0 0A1e10 1 0 0 1 0 0",
	"M0 0A1 -1e10 0 0 1 0 0",
	"M0 0A1 1 1e10 0 1 0 0",
])("rejects numeric bounds and unsafe arithmetic %s", (source) => {
	expect(() => parse(source)).toThrow(RangeError);
});

it("accepts inclusive coordinate bounds and canonicalizes negative zero", () => {
	expect(parse("M1e9 -1e9L-0 -0")).toEqual([
		{ kind: "move", end: point(1e9, -1e9) },
		{ kind: "line", start: point(1e9, -1e9), end: point(0, 0) },
	]);
	expect(parse("M1e-999 0")[0].end).toEqual(point(0, 0));
});

it("exports frozen ceilings and accepts lowered inclusive limits", () => {
	expect(svgPathLimits).toEqual({
		maxSourceCodeUnits: 262144,
		maxSegments: 16384,
		maxCoordinate: 1e9,
	});
	expect(Object.isFrozen(svgPathLimits)).toBe(true);
	expect(
		parse("M1 1", { maxSourceCodeUnits: 4, maxSegments: 1, maxCoordinate: 1 }),
	).toHaveLength(1);
	expect(() => parse("M1 1 ", { maxSourceCodeUnits: 4 })).toThrow(RangeError);
	expect(() => parse("M1 1Z", { maxSegments: 1 })).toThrow(RangeError);
	expect(() => parse("M2 1", { maxCoordinate: 1 })).toThrow(RangeError);
});

it.each(["maxSourceCodeUnits", "maxSegments", "maxCoordinate"] as const)(
	"validates %s overrides before scanning even empty input",
	(name) => {
		for (const value of [
			0,
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER,
			svgPathLimits[name] + 1,
		]) {
			expect(() => parse("", { [name]: value })).toThrow(RangeError);
		}
		for (const value of [null, "1", true]) {
			expect(() =>
				parse("", { [name]: value } as Partial<SvgPathLimits>),
			).toThrow(RangeError);
		}
	},
);

it("freezes all output objects without freezing or modifying caller limits", () => {
	const limits = { maxCoordinate: 100 };
	const output = parse(
		"M1 2L3 4C5 6 7 8 9 10Q11 12 13 14A1 2 3 01 15 16Z",
		limits,
	);
	expect(Object.isFrozen(output)).toBe(true);
	for (const segment of output) {
		expect(Object.isFrozen(segment)).toBe(true);
		for (const value of Object.values(segment)) {
			if (typeof value === "object") expect(Object.isFrozen(value)).toBe(true);
		}
	}
	expect(() => Object.assign(output[0].end, { x: 99 })).toThrow(TypeError);
	expect(() => Object.assign(output[0], { kind: "line" })).toThrow(TypeError);
	expect(() => Object.assign(output, { 0: output[1] })).toThrow(TypeError);
	expect(Object.isFrozen(limits)).toBe(false);
	limits.maxCoordinate = 1;
	expect(output[0].end).toEqual(point(1, 2));
});

it("propagates owner exceptions at every work checkpoint without wrapping", () => {
	const source = "M1 2C3 4 5 6 7 8S9 10 11 12Q3 4 5 6T7 8A3 4 5 0110 20Z";
	const charges: number[] = [];
	parseSvgPath(source, (amount) => charges.push(amount));
	expect(
		charges.every((amount) => Number.isSafeInteger(amount) && amount > 0),
	).toBe(true);
	for (let checkpoint = 0; checkpoint < charges.length; checkpoint++) {
		const failure = new Error(`Owner budget exhausted ${checkpoint}`);
		let calls = 0;
		expect(() =>
			parseSvgPath(source, () => {
				if (calls++ === checkpoint) throw failure;
			}),
		).toThrow(failure);
		expect(calls).toBe(checkpoint + 1);
	}
	const sentinel = { owner: "non-Error sentinel" };
	try {
		parseSvgPath("", () => {
			throw sentinel;
		});
		throw new Error("Expected owner exception");
	} catch (error) {
		expect(error).toBe(sentinel);
	}
});

it("charges before scanning and rejects oversize sources before length-based work", () => {
	const work: number[] = [];
	expect(() =>
		parseSvgPath(" ".repeat(svgPathLimits.maxSourceCodeUnits + 1), (amount) =>
			work.push(amount),
		),
	).toThrow(RangeError);
	expect(work).toEqual([1]);
	const exhausted = new Error("No scanning budget");
	let calls = 0;
	expect(() =>
		parseSvgPath(" ".repeat(svgPathLimits.maxSourceCodeUnits), () => {
			if (++calls === 2) throw exhausted;
		}),
	).toThrow(exhausted);
	expect(calls).toBe(2);
});

it("bounds long whitespace, degenerate groups and greedy numeric scans", () => {
	expect(parse(" ".repeat(svgPathLimits.maxSourceCodeUnits))).toEqual([]);
	const degenerate = `M0 0${"z".repeat(svgPathLimits.maxSegments - 1)}`;
	expect(parse(degenerate)).toHaveLength(svgPathLimits.maxSegments);
	expect(() => parse(`${degenerate}z`)).toThrow(RangeError);
	expect(() =>
		parse(`M0 0${" 0 0".repeat(svgPathLimits.maxSegments)}`),
	).toThrow(RangeError);
	expect(() => parse(`M${"9".repeat(200000)} 0`)).toThrow(RangeError);
	expect(() => parse(`M0 0${" ".repeat(200000)},`)).toThrow(SyntaxError);
	expect(parse(`M${"0".repeat(200000)} 0`)[0].end).toEqual(point(0, 0));
});
