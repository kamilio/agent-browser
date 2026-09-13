import { expect, it } from "vitest";
import {
	computePaintStyle,
	initialPaintStyle,
	parsePaintValue,
} from "./css-paint.js";
import { normalizeSvgClipPath, parseSvgClipPath } from "./svg-clip-value.js";

it.each([
	["none", "none", null],
	[" NONE\t", "none", null],
	["url(#Clip)", 'url("#Clip")', "Clip"],
	["URL( '#CaseSensitive' )", 'url("#CaseSensitive")', "CaseSensitive"],
	['url("#Älpha")', 'url("#Älpha")', "Älpha"],
	["url(#Cl%69p)", 'url("#Cl%69p")', "Cl%69p"],
	["url(#__proto__)", 'url("#__proto__")', "__proto__"],
] as const)(
	"normalizes fragment clipping %j without paint fallbacks",
	(source, normalized, reference) => {
		expect(normalizeSvgClipPath(source)).toBe(normalized);
		expect(parseSvgClipPath(source)).toBe(reference);
	},
);

it.each([
	"",
	"red",
	"currentColor",
	"transparent",
	"initial",
	"inherit",
	"unset",
	"revert",
	"url(#Clip) none",
	"url(#Clip) red",
	"url(#Clip) currentColor",
	"url(https://example.invalid/a.svg#Clip)",
	"url(a.svg#Clip)",
	"url(data:image/svg+xml,x)",
	"url(javascript:alert(1))",
	"url(#)",
	"url('#Clip\")",
	"url(#two words)",
	"url(#Clip);fill:red",
	"url(#Clip)!important",
	"url(#Clip) border-box",
	"circle(50%)",
	"inset(1px)",
	"path('M0 0H1V1Z')",
	"border-box",
	"url(#Cli\\p)",
	"url(#Cli\u0000p)",
	"url(#Cli\u007fp)",
	"\u00a0none\u00a0",
])("rejects unsupported clip-source grammar %j", (source) => {
	expect(normalizeSvgClipPath(source)).toBeUndefined();
	expect(parseSvgClipPath(source)).toBeUndefined();
});

it("bounds both input and canonical clip-source length", () => {
	const accepted = `url(#${"a".repeat(4088)})`;
	expect(normalizeSvgClipPath(accepted)).toHaveLength(4096);
	expect(normalizeSvgClipPath(`url(#${"a".repeat(4089)})`)).toBeUndefined();
	expect(normalizeSvgClipPath(" ".repeat(4097))).toBeUndefined();
});

it.each([undefined, null, 1, {}, []])(
	"rejects nonstring input %j without coercion",
	(source) => {
		expect(normalizeSvgClipPath(source as string)).toBeUndefined();
		expect(parseSvgClipPath(source as string)).toBeUndefined();
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"accepts the CSS-wide keyword %s only at the property layer",
	(value) => {
		expect(parsePaintValue(` ${value.toUpperCase()} `, "clip-path")).toBe(
			value,
		);
		expect(parsePaintValue(` ${value.toUpperCase()} `, "clip-rule")).toBe(
			value,
		);
	},
);

it("keeps clip-path noninherited and clip-rule inherited", () => {
	const parent = computePaintStyle(
		{ "clip-path": 'url("#Clip")', "clip-rule": "evenodd" },
		initialPaintStyle,
	);
	const child = computePaintStyle({}, parent);
	expect(parent["clip-path"]).toBe("Clip");
	expect(child["clip-path"]).toBeUndefined();
	expect(child["clip-rule"]).toBe("evenodd");
	expect(
		computePaintStyle({ "clip-path": "inherit" }, parent)["clip-path"],
	).toBe("Clip");
	for (const value of ["initial", "unset", "revert"])
		expect(
			computePaintStyle({ "clip-path": value }, parent)["clip-path"],
		).toBeUndefined();
	expect(
		computePaintStyle({ "clip-rule": "initial" }, parent)["clip-rule"],
	).toBeUndefined();
});

it("keeps invalid clip presentation state separate from irrelevant paint errors", () => {
	const badPaint = computePaintStyle({ fill: "bogus" }, initialPaintStyle);
	expect(badPaint.svgPaintError).toBe(true);
	expect(badPaint.svgClipError).toBeUndefined();
	for (const specified of [
		{ "clip-path": "circle(1px)" },
		{ "clip-rule": "bogus" },
	]) {
		const clip = computePaintStyle(specified, initialPaintStyle);
		expect(clip.svgClipError).toBe(true);
		expect(clip.svgPaintError).toBeUndefined();
		expect(computePaintStyle({}, clip).svgClipError).toBeUndefined();
	}
});
