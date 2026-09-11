import { expect, it } from "vitest";
import {
	multiplySvgMatrices,
	parseSvgTransform,
	svgIdentity,
	transformSvgPoint,
} from "./svg-affine.js";

const charge = () => {};

it("composes translation and scale in SVG list order", () => {
	const transform = parseSvgTransform("translate(10,20) scale(2,3)", charge);
	expect(transform).toEqual([2, 0, 0, 3, 10, 20]);
	expect(transformSvgPoint(transform, { x: 4, y: 5 })).toEqual({
		x: 18,
		y: 35,
	});
	expect(multiplySvgMatrices(svgIdentity, transform, charge)).toEqual(
		transform,
	);
	expect(Object.isFrozen(transform)).toBe(true);
});

it("rotates around an explicit center", () => {
	const result = transformSvgPoint(
		parseSvgTransform("rotate(90 10 20)", charge),
		{ x: 12, y: 20 },
	);
	expect(result.x).toBeCloseTo(10);
	expect(result.y).toBeCloseTo(22);
});

it.each([
	[undefined, [1, 0, 0, 1, 0, 0]],
	["", [1, 0, 0, 1, 0, 0]],
	["matrix(1 2 3 4 5 6)", [1, 2, 3, 4, 5, 6]],
	["translate(-2e1)", [1, 0, 0, 1, -20, 0]],
	["scale(-2)", [-2, 0, 0, -2, 0, 0]],
	["scale(0)", [0, 0, 0, 0, 0, 0]],
] as const)("parses bounded transform %s", (source, expected) => {
	expect(parseSvgTransform(source, charge)).toEqual(expected);
});

it.each(["skewX", "skewY"])("supports %s", (name) => {
	const result = transformSvgPoint(parseSvgTransform(`${name}(45)`, charge), {
		x: 2,
		y: 3,
	});
	expect(result.x).toBeCloseTo(name === "skewX" ? 5 : 2);
	expect(result.y).toBeCloseTo(name === "skewY" ? 5 : 3);
});

it.each([" ", "\t", "\n", "\r", "\r\n"])(
	"accepts SVG ASCII whitespace %j throughout a transform list",
	(whitespace) => {
		expect(parseSvgTransform(whitespace, charge)).toEqual(svgIdentity);
		expect(
			parseSvgTransform(
				`${whitespace}translate${whitespace}(${whitespace}10${whitespace},${whitespace}20${whitespace})${whitespace},${whitespace}scale(2)${whitespace}`,
				charge,
			),
		).toEqual([2, 0, 0, 2, 10, 20]);
	},
);

it.each([
	"\f",
	"\v",
	"\u00a0",
	"\u1680",
	"\u2003",
	"\u2028",
	"\u2029",
	"\u202f",
	"\u205f",
	"\u3000",
	"\ufeff",
])("rejects non-SVG whitespace %j at every parsing boundary", (whitespace) => {
	for (const source of [
		whitespace,
		`${whitespace}scale(2)`,
		`scale(2)${whitespace}`,
		`scale${whitespace}(2)`,
		`scale(${whitespace}2)`,
		`scale(2${whitespace})`,
		`translate(1${whitespace}2)`,
		`translate(1,${whitespace}2)`,
		`scale(2)${whitespace}translate(1)`,
		`scale(2),${whitespace}translate(1)`,
	])
		expect(() => parseSvgTransform(source, charge)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
});

it("rejects the reported cancellation before returning a displaced point", () => {
	const coordinate = 1e9 - 2 ** -23;
	for (const transform of [
		[1e9, 0, -1e9, 0, 128, 0],
		[0, 1e9, 0, -1e9, 0, 128],
	] as const)
		expect(() =>
			transformSvgPoint(transform, { x: coordinate, y: 1e9 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects the reported cancellation in both composed translations", () => {
	const coordinate = 1e9 - 2 ** -23;
	for (const transform of [
		[1e9, 0, -1e9, 0, 128, 0],
		[0, 1e9, 0, -1e9, 0, 128],
	] as const)
		expect(() =>
			multiplySvgMatrices(transform, [1, 0, 0, 1, coordinate, 1e9], charge),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("applies product bounds to composed linear coefficients too", () => {
	const coordinate = 1e9 - 2 ** -23;
	expect(() =>
		multiplySvgMatrices(
			[1e9, 0, -1e9, 0, 0, 0],
			[coordinate, 1e9, 0, 0, 0, 0],
			charge,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects an oversized partial sum even when translation would restore the bound", () => {
	expect(() =>
		transformSvgPoint([1, 0, 1, 0, -1e9, 0], { x: 1e9, y: 1e9 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("preserves bounded cancellation, ceiling coordinates and singular transforms", () => {
	expect(transformSvgPoint([1e9, 0, -1e9, 0, 128, 0], { x: 1, y: 1 })).toEqual({
		x: 128,
		y: 0,
	});
	expect(
		multiplySvgMatrices([1e9, 0, -1e9, 0, 128, 0], [1, 0, 0, 1, 1, 1], charge),
	).toEqual([1e9, 0, -1e9, 0, 128, 0]);
	expect(transformSvgPoint(svgIdentity, { x: 1e9, y: -1e9 })).toEqual({
		x: 1e9,
		y: -1e9,
	});
	expect(transformSvgPoint([0, 0, 0, 0, 2, 3], { x: 1e9, y: -1e9 })).toEqual({
		x: 2,
		y: 3,
	});
});

it("rejects product underflow without rejecting exact zero or retained subnormals", () => {
	const transform = [Number.MIN_VALUE, 0, 0, 1, 0, 0] as const;
	expect(() => transformSvgPoint(transform, { x: 0.5, y: 0 })).toThrow(
		"precision limit",
	);
	expect(() =>
		multiplySvgMatrices(transform, [0.5, 0, 0, 1, 0, 0], charge),
	).toThrow("precision limit");
	expect(transformSvgPoint(transform, { x: 1, y: 0 })).toEqual({
		x: Number.MIN_VALUE,
		y: 0,
	});
	expect(transformSvgPoint(transform, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
});

it.each([
	"rotate()",
	"translate(1px)",
	"scale(1,,2)",
	"rotate(1 2)",
	"matrix(1 2 3)",
	"unknown(1)",
	"translate(1),",
	"translate(1) junk",
	"scale(NaN)",
])("rejects invalid transform %s", (source) => {
	expect(() => parseSvgTransform(source, charge)).toThrow();
});

it("enforces source, operation, intermediate-coordinate and work bounds", () => {
	expect(() => parseSvgTransform(" ".repeat(4097), charge)).toThrow(
		"source limit",
	);
	expect(() => parseSvgTransform("scale(1) ".repeat(129), charge)).toThrow(
		"count limit",
	);
	expect(() => parseSvgTransform("scale(1e9) scale(2)", charge)).toThrow(
		"coordinate limit",
	);
	expect(() => transformSvgPoint([2, 0, 0, 2, 0, 0], { x: 1e9, y: 0 })).toThrow(
		"coordinate limit",
	);
	const failure = new Error("work exhausted");
	expect(() =>
		parseSvgTransform("scale(2)", () => {
			throw failure;
		}),
	).toThrow(failure);
});
