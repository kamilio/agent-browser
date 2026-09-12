import { expect, it } from "vitest";
import { parseInlineDeclarations } from "./css-declarations.js";
import {
	computePaintStyle,
	initialPaintStyle,
	parsePaintValue,
} from "./css-paint.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	normalizeSvgFill,
	parseSvgFill,
	serializeSvgFill,
} from "./svg-paint-value.js";

it.each([
	["RED", "red"],
	[" NoNe ", "none"],
	["currentColor", "currentcolor"],
	["url(#Paint)", 'url("#Paint")'],
	["URL( '#MixedCase' ) RED", 'url("#MixedCase") red'],
	['url("#Paint") none', 'url("#Paint") none'],
	["url(#Paint) currentColor", 'url("#Paint") currentcolor'],
])(
	"normalizes native SVG fill %s without lowercasing fragment IDs",
	(source, value) => {
		expect(normalizeSvgFill(source)).toBe(value);
	},
);

it.each([
	"",
	"context-fill",
	"context-stroke",
	"url(https://example.invalid/paint.svg#Paint)",
	"url(paint.svg#Paint)",
	"url(#)",
	"url(#Paint) bogus",
	"url(#Paint) red blue",
	"url(#Paint) inherit",
	"url(#Paint) url(#Other)",
	"url('#Paint\" )",
	"url(#Paint\\31)",
	"url(#Paint Name)",
	"red; fill:blue",
	"rgb(NaN, 0, 0)",
	"\u00a0red",
	"\u00a0none",
	"\u00a0url(#Paint)",
	"url(#Paint\u0000)",
])("rejects unsupported or malformed native SVG fill %s", (source) => {
	expect(normalizeSvgFill(source)).toBeUndefined();
	expect(parseSvgFill(source)).toBeUndefined();
});

it("bounds local paint references without truncating their identities", () => {
	const within = `url(#${"A".repeat(4088)})`;
	expect(normalizeSvgFill(within)).toHaveLength(4096);
	expect(parseSvgFill(within)).toEqual({ reference: "A".repeat(4088) });
	expect(normalizeSvgFill(`url(#${"A".repeat(4089)})`)).toBeUndefined();
});

it("preserves explicit none and currentColor fallback values", () => {
	expect(parseSvgFill("none")).toBeNull();
	expect(parseSvgFill("currentColor")).toBe("currentcolor");
	expect(parseSvgFill("url(#Paint)")).toEqual({ reference: "Paint" });
	expect(parseSvgFill("url(#Paint) none")).toEqual({
		reference: "Paint",
		fallback: null,
	});
	expect(parseSvgFill("url(#Paint) currentColor")).toEqual({
		reference: "Paint",
		fallback: "currentcolor",
	});
	const paint = parseSvgFill("url(#Paint) red");
	expect(paint).toEqual({ reference: "Paint", fallback: [255, 0, 0, 255] });
	expect(Object.isFrozen(paint)).toBe(true);
});

it("serializes computed SVG paint without collapsing local server references", () => {
	const color = [0, 0, 255, 255] as const;
	expect(serializeSvgFill(null, color)).toBe("none");
	expect(serializeSvgFill("currentcolor", color)).toBe("rgb(0, 0, 255)");
	expect(
		serializeSvgFill({ reference: "Paint", fallback: "currentcolor" }, color),
	).toBe('url("#Paint") rgb(0, 0, 255)');
	expect(serializeSvgFill({ reference: "Paint", fallback: null }, color)).toBe(
		'url("#Paint") none',
	);
	expect(serializeSvgFill([255, 0, 0, 128], color)).toBe(
		"rgba(255, 0, 0, 0.502)",
	);
});

it("retains case through both CSS parsers and registers fill components in all", () => {
	const issues: string[] = [];
	const source =
		"FILL: URL('#PaintServer') RED; fill-opacity:25%; fill-rule:evenodd";
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 4 },
		(issue) => issues.push(issue),
	);
	expect(issues).toEqual([]);
	expect(declarations.map((entry) => [entry.property, entry.value])).toEqual([
		["fill", 'url("#PaintServer") red'],
		["fill-opacity", "25%"],
		["fill-rule", "evenodd"],
	]);
	expect(
		parseInlineDeclarations(source, 4).map((entry) => [
			entry.name,
			entry.value,
		]),
	).toEqual(declarations.map((entry) => [entry.property, entry.value]));
	const reset = parseCssDeclarations(
		"all:initial",
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
		(issue) => issues.push(issue),
	);
	for (const property of ["fill", "fill-opacity", "fill-rule"])
		expect(reset).toContainEqual({
			property,
			value: "initial",
			important: false,
		});
});

it.each(["initial", "inherit", "unset", "revert"])(
	"accepts CSS-wide keyword %s on all SVG fill properties",
	(keyword) => {
		for (const property of ["fill", "fill-opacity", "fill-rule"] as const)
			expect(parsePaintValue(keyword, property)).toBe(keyword);
	},
);

it("inherits fill paint and fill opacity without multiplying them per level", () => {
	const parent = computePaintStyle(
		{ fill: "none", "fill-opacity": "25%", "fill-rule": "evenodd" },
		initialPaintStyle,
	);
	const child = computePaintStyle({}, parent);
	expect(child).toBe(parent);
	expect(computePaintStyle({}, child)["fill-opacity"]).toBe(0.25);
	expect(child.fill).toBeNull();
	expect(child["fill-rule"]).toBe("evenodd");
	const initial = computePaintStyle(
		{ fill: "initial", "fill-opacity": "initial", "fill-rule": "initial" },
		parent,
	);
	expect(initial.fill).toBeUndefined();
	expect(initial["fill-opacity"]).toBeUndefined();
	expect(initial["fill-rule"]).toBeUndefined();
});

it.each([
	["-1", 0],
	["2", 1],
	["25%", 0.25],
	["125%", 1],
	["-20%", 0],
	["5e-1", 0.5],
])("computes and clamps inherited fill opacity %s", (value, expected) => {
	const style = computePaintStyle(
		{ "fill-opacity": String(value) },
		initialPaintStyle,
	);
	expect(style["fill-opacity"]).toBe(expected);
});

it("does not reuse a parent paint object when any SVG fill component changes", () => {
	const parent = computePaintStyle(
		{ fill: "red", "fill-opacity": ".5", "fill-rule": "evenodd" },
		initialPaintStyle,
	);
	for (const specified of [
		{ fill: "blue" },
		{ "fill-opacity": ".75" },
		{ "fill-rule": "nonzero" },
	] as const)
		expect(computePaintStyle(specified, parent)).not.toBe(parent);
});

it("does not turn non-CSS whitespace into valid SVG paint keywords or numbers", () => {
	expect(parsePaintValue("\u00a0inherit", "fill")).toBeUndefined();
	expect(parsePaintValue("\u00a0evenodd", "fill-rule")).toBeUndefined();
	expect(parsePaintValue("\u00a050%", "fill-opacity")).toBeUndefined();
});
