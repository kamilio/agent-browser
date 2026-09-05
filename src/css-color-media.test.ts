import { expect, it } from "vitest";
import { compileCssMedia, cssMediaLimits } from "./css-media.js";
import { cssMediaMatches } from "./css-parser.js";

const features = [
	{ name: "color", actual: 8 },
	{ name: "color-index", actual: 0 },
	{ name: "monochrome", actual: 0 },
];
const viewports = [
	Object.freeze({ width: 1280, height: 720 }),
	Object.freeze({ width: 1, height: 1 }),
	Object.freeze({ width: 16_384, height: 1 }),
	Object.freeze({ width: 1, height: 16_384 }),
];

function supported(source: string, expected: boolean, media = source) {
	const compiled = compileCssMedia(source);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.media).toBe(media);
	expect(Object.isFrozen(compiled)).toBe(true);
	for (const viewport of viewports)
		expect(compiled.matches(viewport)).toBe(expected);
	const issues: string[] = [];
	expect(
		cssMediaMatches(source, viewports[0], (issue) => issues.push(issue)),
	).toBe(expected);
	expect(issues).toEqual([]);
	return compiled;
}

function unsupported(source: string) {
	const compiled = compileCssMedia(source);
	expect(compiled.unsupported).toBe(true);
	expect(compiled.media).toBe("not all");
	expect(Object.isFrozen(compiled)).toBe(true);
	for (const viewport of viewports)
		expect(compiled.matches(viewport)).toBe(false);
	const issues: string[] = [];
	expect(
		cssMediaMatches(source, viewports[0], (issue) => issues.push(issue)),
	).toBe(false);
	expect(issues).toEqual(["unimplemented-or-invalid-media-query"]);
}

it.each(features)(
	"distinguishes supported Boolean $name and its negation",
	({ name, actual }) => {
		supported(`(${name})`, actual !== 0);
		supported(`not (${name})`, actual === 0);
	},
);

it.each(features)(
	"evaluates colon/min/max $name across negative, zero and positive boundaries",
	({ name, actual }) => {
		for (const value of [-1, 0, 7, 8, 9, 256]) {
			supported(`(${name}: ${value})`, actual === value);
			supported(`(min-${name}: ${value})`, actual >= value);
			supported(`(max-${name}: ${value})`, actual <= value);
			supported(`not (${name}: ${value})`, actual !== value);
		}
	},
);

const comparisons = [
	{
		operator: "<",
		forward: [false, false, true],
		reverse: [true, false, false],
	},
	{
		operator: "<=",
		forward: [false, true, true],
		reverse: [true, true, false],
	},
	{
		operator: ">",
		forward: [true, false, false],
		reverse: [false, false, true],
	},
	{
		operator: ">=",
		forward: [true, true, false],
		reverse: [false, true, true],
	},
	{
		operator: "=",
		forward: [false, true, false],
		reverse: [false, true, false],
	},
];

it.each(
	features.flatMap((feature) =>
		comparisons.map((comparison) => ({ ...feature, ...comparison })),
	),
)(
	"evaluates $name $operator in both operand orders",
	({ name, actual, operator, forward, reverse }) => {
		for (const [index, value] of [actual - 1, actual, actual + 1].entries()) {
			supported(`(${name} ${operator} ${value})`, forward[index]);
			supported(`(${value} ${operator} ${name})`, reverse[index]);
		}
	},
);

it.each(features)(
	"supports both chain directions and strict/inclusive $name boundaries",
	({ name, actual }) => {
		for (const [source, expected] of [
			[`(${actual - 1} < ${name} < ${actual + 1})`, true],
			[`(${actual} <= ${name} <= ${actual})`, true],
			[`(${actual} < ${name} <= ${actual + 1})`, false],
			[`(${actual - 1} <= ${name} < ${actual})`, false],
			[`(${actual + 1} > ${name} > ${actual - 1})`, true],
			[`(${actual} >= ${name} >= ${actual})`, true],
			[`(${actual} > ${name} >= ${actual - 1})`, false],
			[`(${actual + 1} >= ${name} > ${actual})`, false],
		] as const)
			supported(source, expected);
	},
);

it.each(features)(
	"rejects mixed/equality chain directions and malformed $name operators",
	({ name }) => {
		for (const source of [
			`(0 < ${name} > 9)`,
			`(9 > ${name} < 10)`,
			`(0 <= ${name} >= 9)`,
			`(0 = ${name} = 8)`,
			`(0 < ${name} = 8)`,
			`(${name} == 8)`,
			`(${name} != 8)`,
			`(${name} <= = 8)`,
			`(min-${name} > 0)`,
			`(0 < min-${name} < 9)`,
			`(${name} < 8 < 9)`,
			`(${name} > width)`,
		])
			unsupported(source);
	},
);

const integerLiterals = [
	{ literal: "0", value: 0 },
	{ literal: "+0", value: 0 },
	{ literal: "-0", value: 0 },
	{ literal: "0000", value: 0 },
	{ literal: "+0000", value: 0 },
	{ literal: "-0000", value: 0 },
	{ literal: "8", value: 8 },
	{ literal: "+8", value: 8 },
	{ literal: "0008", value: 8 },
	{ literal: "+0008", value: 8 },
	{ literal: "-0008", value: -8 },
	{ literal: "-1", value: -1 },
];

it.each(
	features.flatMap((feature) =>
		integerLiterals.map((literal) => ({ ...feature, ...literal })),
	),
)(
	"accepts the signed decimal spelling $literal for $name without rewriting it",
	({ name, actual, literal, value }) => {
		supported(`(${name}: ${literal})`, actual === value);
		supported(`(min-${name}: ${literal})`, actual >= value);
		supported(`(max-${name}: ${literal})`, actual <= value);
	},
);

const invalidLiterals = [
	"",
	"+",
	"-",
	"8.0",
	".8",
	"8.",
	"8e0",
	"8E+0",
	"0x8",
	"0b1000",
	"0o10",
	"8px",
	"8dppx",
	"8%",
	"calc(4 + 4)",
	"min(8, 9)",
	"var(--bits)",
	"\\38",
	"８",
	"٨",
	"−8",
	"+ 8",
	"- 0",
	"8 0",
	"8_0",
	"8n",
	"Infinity",
	"NaN",
	"8/1",
	"0\u00008",
	"+-8",
	"--0",
	"0\u200b8",
];

it.each(
	features.flatMap((feature) =>
		invalidLiterals.map((literal) => ({ name: feature.name, literal })),
	),
)(
	"keeps nonliteral integer spelling $literal unsupported for $name, including negation",
	({ name, literal }) => {
		unsupported(`(${name}: ${literal})`);
		unsupported(`not (${name}: ${literal})`);
	},
);

it.each(features)(
	"retains supported huge signed $name values rather than clamping or rejecting",
	({ name }) => {
		for (const digits of [
			"9007199254740993",
			"9".repeat(512),
			"9".repeat(4096),
		]) {
			for (const [literal, positive] of [
				[digits, true],
				[`+${digits}`, true],
				[`-${digits}`, false],
			] as const) {
				supported(`(${name}: ${literal})`, false);
				supported(`not (${name}: ${literal})`, true);
				supported(`(min-${name}: ${literal})`, !positive);
				supported(`(max-${name}: ${literal})`, positive);
				supported(`(${literal} < ${name})`, !positive);
				supported(`(${literal} <= ${name})`, !positive);
				supported(`(${literal} > ${name})`, positive);
				supported(`(${literal} >= ${name})`, positive);
				supported(`(${name} < ${literal})`, positive);
				supported(`(${name} >= ${literal})`, !positive);
			}
			supported(`(-${digits} < ${name} < ${digits})`, true);
			supported(`(${digits} > ${name} > -${digits})`, true);
		}
	},
);

it.each(features)(
	"does not infer magnitude from thousands of leading zeroes for $name",
	({ name, actual }) => {
		for (const [ending, value] of [
			["0", 0],
			["7", 7],
			["8", 8],
			["9", 9],
		] as const) {
			const literal = `${"0".repeat(4096)}${ending}`;
			supported(`(${name}: +${literal})`, actual === value);
			supported(`(min-${name}: ${literal})`, actual >= value);
			supported(`(max-${name}: -${literal})`, actual <= -value);
		}
	},
);

it.each(
	features.flatMap((feature) =>
		["", "+", "-"].map((sign) => ({ ...feature, sign })),
	),
)(
	"admits $name signed digits up to the original source ceiling (sign=$sign)",
	({ name, sign }) => {
		const prefix = `(${name}: ${sign}`;
		const source = `${prefix}${"9".repeat(cssMediaLimits.maxCodeUnits - prefix.length - 1)})`;
		expect(source.length).toBe(65_536);
		supported(source, false);
		expect(() => compileCssMedia(`${source} `)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("keeps a source-boundary color value ending in eight equal to eight despite leading zeros", () => {
	const prefix = "(color: +";
	const source = `${prefix}${"0".repeat(cssMediaLimits.maxCodeUnits - prefix.length - 2)}8)`;
	expect(source.length).toBe(cssMediaLimits.maxCodeUnits);
	supported(source, true);
});

it.each([
	{ source: " ( COLOR : +0008 ) ", media: "(color: +0008)", expected: true },
	{
		source: "\t(MAX-COLOR-INDEX:\n-0)\r",
		media: "(max-color-index: -0)",
		expected: true,
	},
	{
		source: "\f(MIN-MONOCHROME : +0000) ",
		media: "(min-monochrome: +0000)",
		expected: true,
	},
	{
		source: "(color/*feature*/:/*value*/8)",
		media: "(color: 8)",
		expected: true,
	},
	{
		source: "(color: 8)/**/and/**/(monochrome: 0)",
		media: "(color: 8) and (monochrome: 0)",
		expected: true,
	},
	{
		source: "SCREEN AND (COLOR > 7) /* tail",
		media: "screen and (color > 7)",
		expected: true,
	},
	{
		source: "not (COLOR-INDEX : 256)",
		media: "not (color-index: 256)",
		expected: true,
	},
	{ source: "(8>=COLOR>=+0008)", media: "(8>=color>=+0008)", expected: true },
])(
	"preserves supported normalization and original numeric spelling: $source",
	({ source, media, expected }) => {
		supported(source, expected, media);
	},
);

it.each([
	"(color: +/**/8)",
	"(color: 0/**/8)",
	"(co/**/lor: 8)",
	"(color/* gap */-index: 0)",
	"(color: 8)and(color-index: 0)",
])("does not fuse distinct tokens around comments/whitespace: %s", (source) => {
	unsupported(source);
});

it.each([
	{ source: "not (color: -1)", expected: true },
	{ source: "not ((color) and (monochrome))", expected: true },
	{
		source: "((color: 8) or (color-index)) and (monochrome: 0)",
		expected: true,
	},
	{ source: "not screen and (color: 8)", expected: false },
	{ source: "not screen and (color: -1)", expected: true },
	{ source: "only screen and (color: 8)", expected: true },
	{ source: "print and (color), (color-index: 0)", expected: true },
	{ source: "(color-index), (monochrome)", expected: false },
	{ source: "(color: 9), (monochrome: -1)", expected: false },
])(
	"supports grouping, lists and negation without turning false into unsupported: $source",
	({ source, expected }) => {
		supported(source, expected);
	},
);

it.each([
	{
		source: "(unknown: value), (color: 8)",
		media: "not all, (color: 8)",
		expected: true,
	},
	{
		source: "not (unknown: value), (color: -1)",
		media: "not all, (color: -1)",
		expected: false,
	},
	{
		source: "(color-gamut: srgb), (monochrome: 0)",
		media: "not all, (monochrome: 0)",
		expected: true,
	},
	{
		source: "(color: 8.0), (color-index: 0)",
		media: "not all, (color-index: 0)",
		expected: true,
	},
	{
		source: "[invalid, branch], (color)",
		media: "not all, (color)",
		expected: true,
	},
])(
	"aggregates unknown branches without dropping supported list alternatives: $source",
	({ source, media, expected }) => {
		const compiled = compileCssMedia(source);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.media).toBe(media);
		expect(Object.isFrozen(compiled)).toBe(true);
		for (const viewport of viewports)
			expect(compiled.matches(viewport)).toBe(expected);
		const issues: string[] = [];
		expect(
			cssMediaMatches(source, viewports[0], (issue) => issues.push(issue)),
		).toBe(expected);
		expect(issues).toEqual(["unimplemented-or-invalid-media-query"]);
	},
);

it.each([
	"(color-gamut: srgb)",
	"(color-gamut: p3)",
	"(device-width: 1280px)",
	"(device-height: 720px)",
	"(device-aspect-ratio: 16/9)",
	"(prefers-contrast: more)",
	"(unknown: value)",
	"not (unknown: value)",
	"(unknown(color))",
	"(color(8))",
	'(color: "8")',
	"(color: [8])",
	"(color: {8})",
	'(unknown: "x, (color), y")',
	"(color) or (color-index) and (monochrome)",
	"not (color) and (monochrome)",
	"screen and (color) or (monochrome)",
	"(color: 8",
	"(color: 8))",
])(
	"keeps unknown/general-enclosed/malformed syntax unsupported: %s",
	(source) => {
		unsupported(source);
	},
);

it("preserves compiled record immutability and color-only results across repeated viewport changes", () => {
	const source = "(color: 8) and (color-index: 0) and (monochrome: 0)";
	const compiled = supported(source, true);
	const conditions = compiled.conditions;
	const predicate = compiled.matches;
	for (let index = 0; index < 64; index++) {
		expect(compiled.matches(viewports[index % viewports.length])).toBe(true);
		expect(compiled.media).toBe(source);
		expect(compiled.conditions).toBe(conditions);
		expect(compiled.matches).toBe(predicate);
	}
	for (const key of ["media", "unsupported", "conditions", "matches"])
		expect(Reflect.set(compiled, key, "replacement")).toBe(false);
	expect(Reflect.deleteProperty(compiled, "matches")).toBe(false);
	expect(Reflect.defineProperty(compiled, "extra", { value: true })).toBe(
		false,
	);
});

it("preserves the exact frozen original parser limits", () => {
	expect(cssMediaLimits).toEqual({
		maxCodeUnits: 65_536,
		maxDepth: 32,
		maxConditions: 1024,
	});
	expect(Object.isFrozen(cssMediaLimits)).toBe(true);
	const source = "(color)";
	const padded =
		source + " ".repeat(cssMediaLimits.maxCodeUnits - source.length);
	supported(padded, true, source);
	expect(() => compileCssMedia(`${padded} `)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps depth limits for nested color conditions at the exact boundary", () => {
	const source = `${"(".repeat(cssMediaLimits.maxDepth)}color${")".repeat(cssMediaLimits.maxDepth)}`;
	supported(source, true);
	expect(() => compileCssMedia(`(${source})`)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps condition budgets for long color lists and grouped predicates", () => {
	const count = cssMediaLimits.maxConditions / 2;
	const source = Array.from({ length: count }, () => "(color)").join(", ");
	const compiled = supported(source, true);
	expect(compiled.conditions).toBe(cssMediaLimits.maxConditions);
	expect(() => compileCssMedia(`${source}, (color)`)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const grouped = Array.from(
		{ length: cssMediaLimits.maxConditions - 1 },
		() => "(color)",
	).join(" or ");
	expect(supported(grouped, true).conditions).toBe(
		cssMediaLimits.maxConditions,
	);
	expect(() => compileCssMedia(`${grouped} or (color)`)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	{ source: "(width: 8e2px)", expected: true },
	{ source: "(width: +800.0px)", expected: true },
	{ source: "(height: 6e2px)", expected: true },
	{ source: "(height > .5px)", expected: true },
	{ source: "(resolution: 1.0dppx)", expected: true },
	{ source: "(resolution: 9.6e1dpi)", expected: true },
	{ source: "(resolution < infinite)", expected: true },
	{ source: "(aspect-ratio: 4e0/3.0)", expected: true },
	{ source: "(width: 0)", expected: false },
])(
	"keeps old dimensional numeric syntax unchanged: $source",
	({ source, expected }) => {
		const compiled = compileCssMedia(source);
		expect(compiled.unsupported).toBe(false);
		expect(compiled.media).toBe(source);
		expect(compiled.matches({ width: 800, height: 600 })).toBe(expected);
	},
);

it.each([
	"(width: 8)",
	"(height: 8)",
	"(resolution: 8)",
	"(width: 1e999px)",
	"(aspect-ratio: -1/2)",
])("does not broaden other numeric feature grammars: %s", (source) =>
	unsupported(source),
);

it("changes mixed predicates only with their viewport component", () => {
	const compiled = compileCssMedia(
		"(color: 8) and (color-index: 0) and (width >= 900px)",
	);
	expect(compiled.unsupported).toBe(false);
	for (const viewport of viewports)
		expect(compiled.matches(viewport)).toBe(viewport.width >= 900);
});
