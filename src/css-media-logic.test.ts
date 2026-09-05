import { expect, it } from "vitest";
import { compileCssMedia, cssMediaLimits } from "./css-media.js";
import { cssMediaMatches } from "./css-parser.js";

const viewport = Object.freeze({ width: 80, height: 40 });
const knownTrue = "(width >= 40px)";
const knownFalse = "(width < 40px)";
const unknown = "(unknown-feature: value)";
const diagnostic = "unimplemented-or-invalid-media-query";
const terms = {
	true: knownTrue,
	false: knownFalse,
	unknown,
};

function check(
	source: string,
	matches: boolean,
	unsupported: boolean,
	media = source,
) {
	const compiled = compileCssMedia(source);
	expect(compiled.media).toBe(media);
	expect(compiled.unsupported).toBe(unsupported);
	expect(compiled.matches(viewport)).toBe(matches);
	expect(Object.isFrozen(compiled)).toBe(true);
	const issues: string[] = [];
	expect(cssMediaMatches(source, viewport, (issue) => issues.push(issue))).toBe(
		matches,
	);
	expect(issues).toEqual(unsupported ? [diagnostic] : []);
	return compiled;
}

const truthTable = [
	{ left: "true", right: "true", and: true, or: true },
	{ left: "true", right: "false", and: false, or: true },
	{ left: "true", right: "unknown", and: null, or: true },
	{ left: "false", right: "true", and: false, or: true },
	{ left: "false", right: "false", and: false, or: false },
	{ left: "false", right: "unknown", and: false, or: null },
	{ left: "unknown", right: "true", and: null, or: true },
	{ left: "unknown", right: "false", and: false, or: null },
	{ left: "unknown", right: "unknown", and: null, or: null },
] as const;

it.each(
	truthTable.flatMap((row) =>
		(["and", "or"] as const).map((operator) => ({ ...row, operator })),
	),
)(
	"evaluates $left $operator $right and its negation before public unknown conversion",
	(row) => {
		const source = `${terms[row.left]} ${row.operator} ${terms[row.right]}`;
		const unsupported = row.left === "unknown" || row.right === "unknown";
		const allUnknown = row.left === "unknown" && row.right === "unknown";
		check(
			source,
			row[row.operator] === true,
			unsupported,
			allUnknown ? "not all" : source,
		);
		const negated = `not (${source})`;
		check(
			negated,
			row[row.operator] === false,
			unsupported,
			allUnknown ? "not all" : negated,
		);
	},
);

it.each([
	{
		name: "true",
		source: knownTrue,
		value: true,
		negated: false,
		unsupported: false,
	},
	{
		name: "false",
		source: knownFalse,
		value: false,
		negated: true,
		unsupported: false,
	},
	{
		name: "unknown",
		source: unknown,
		value: false,
		negated: false,
		unsupported: true,
	},
])(
	"keeps single and double negation correct for $name",
	({ source, value, negated, unsupported }) => {
		check(source, value, unsupported, unsupported ? "not all" : source);
		const once = `not ${source}`;
		check(once, negated, unsupported, unsupported ? "not all" : once);
		const twice = `not (not ${source})`;
		check(twice, value, unsupported, unsupported ? "not all" : twice);
	},
);

it.each([
	{
		source: `${unknown} and ${knownTrue} and ${knownFalse}`,
		expected: false,
		negated: true,
	},
	{
		source: `${unknown} or ${knownFalse} or ${knownTrue}`,
		expected: true,
		negated: false,
	},
	{
		source: `${knownTrue} and ${unknown} and ${knownTrue}`,
		expected: false,
		negated: false,
	},
	{
		source: `${knownFalse} or ${unknown} or ${knownFalse}`,
		expected: false,
		negated: false,
	},
	{
		source: `(${knownFalse} and ${unknown}) or ${knownTrue}`,
		expected: true,
		negated: false,
	},
	{
		source: `(${knownTrue} or ${unknown}) and ${knownFalse}`,
		expected: false,
		negated: true,
	},
	{
		source: `(not ${unknown}) or ${knownTrue}`,
		expected: true,
		negated: false,
	},
	{
		source: `(not (${knownFalse} and ${unknown})) and ${knownTrue}`,
		expected: true,
		negated: false,
	},
])(
	"retains decisive nested and multi-term results: $source",
	({ source, expected, negated }) => {
		check(source, expected, true);
		check(`not (${source})`, negated, true);
	},
);

it.each([
	unknown,
	"(width: future-unit)",
	"(orientation: diagonal)",
	"(color: future-value)",
	"future(foo)",
	"(future(foo))",
	"not(foo)",
	"and(foo)",
	"or(foo)",
	"only(foo)",
	"future()",
	"((width) and)",
	"(not (width) and (height))",
	"((width) or (height) and (orientation))",
])(
	"evaluates unknown features, values and balanced general-enclosed terms: %s",
	(term) => {
		check(term, false, true, "not all");
		check(`not (${term})`, false, true, "not all");
		check(`${knownTrue} or ${term}`, true, true);
		check(`not (${knownFalse} and ${term})`, true, true);
		check(`${knownFalse} or ${term}`, false, true);
	},
);

it.each([
	"unknown",
	"speech",
	"custom-type",
	"-custom",
	"--custom",
	"--",
	"_custom",
	"custom_2",
	"-_custom",
	"écran",
	"媒体",
	"not-layer",
])("treats the unescaped identifier media type %s as known false", (type) => {
	check(type, false, false);
	check(`not ${type}`, true, false);
	check(`only ${type}`, false, false);
	check(`${type} and ${knownTrue}`, false, false);
	check(`not ${type} and ${knownTrue}`, true, false);
	check(`not ${type} and ${knownFalse}`, true, false);
});

it.each([
	{ type: "screen", value: true },
	{ type: "all", value: true },
	{ type: "print", value: false },
	{ type: "unknown", value: false },
])(
	"combines typed $type conditions with unknowns before typed negation",
	({ type, value }) => {
		const conjunction = `${type} and (${knownTrue} and ${unknown})`;
		check(conjunction, false, true);
		check(`not ${conjunction}`, !value, true);
		check(`only ${conjunction}`, false, true);
		const decisive = `${type} and (${knownTrue} or ${unknown})`;
		check(decisive, value, true);
		check(`not ${decisive}`, !value, true);
		const falseCondition = `${type} and (${knownFalse} and ${unknown})`;
		check(falseCondition, false, true);
		check(`not ${falseCondition}`, true, true);
	},
);

it.each(["unknown", "print"])(
	"keeps known-false type %s decisive even with a bare unknown condition",
	(type) => {
		check(`${type} and ${unknown}`, false, true);
		check(`not ${type} and ${unknown}`, true, true);
		check(`only ${type} and ${unknown}`, false, true);
	},
);

it.each(["not", "only", "and", "or", "layer"])(
	"rejects reserved type keyword %s instead of treating it as known false",
	(type) => {
		for (const source of [
			type,
			`not ${type}`,
			`only ${type}`,
			`${type} and ${knownTrue}`,
		])
			check(source, false, true, "not all");
	},
);

it.each([
	"1screen",
	"-1screen",
	"-",
	"screen!",
	"foo.bar",
	"foo/bar",
	"@screen",
	"foo bar",
	"screen and",
	"not only screen",
	"only (width)",
	"screen and(width)",
	"screen or (width)",
	"foo (bar)",
])(
	"rejects malformed type/typed syntax without unknown-type negation leakage: %s",
	(source) => {
		check(source, false, true, "not all");
	},
);

it.each([
	{ source: `not ${knownFalse}`, expected: true, unsupported: false },
	{ source: `not(${knownFalse})`, expected: false, unsupported: true },
	{ source: `${knownTrue}or ${unknown}`, expected: true, unsupported: true },
	{ source: `${knownTrue} or(${unknown})`, expected: false, unsupported: true },
	{
		source: `${knownTrue}and ${knownFalse}`,
		expected: false,
		unsupported: false,
	},
	{
		source: `${knownTrue} and(${knownFalse})`,
		expected: false,
		unsupported: true,
	},
])(
	"respects function tokens and required keyword whitespace: $source",
	({ source, expected, unsupported }) => {
		const retain = !unsupported || source.includes(`or ${unknown}`);
		check(source, expected, unsupported, retain ? source : "not all");
	},
);

it.each([
	`${knownTrue} or`,
	`${knownTrue} and`,
	`${knownTrue} or ${knownFalse} and ${unknown}`,
	`not ${knownTrue} and ${unknown}`,
	`${knownTrue} or arbitrary-token`,
	`screen and ${knownTrue} or ${unknown}`,
	`only screen and ${knownTrue} or ${unknown}`,
])(
	"keeps top-level malformed operators invalid rather than salvaging true terms: %s",
	(source) => {
		check(source, false, true, "not all");
	},
);

it.each([
	{
		source: `${unknown}, ${knownTrue}`,
		media: `not all, ${knownTrue}`,
		expected: true,
		unsupported: true,
	},
	{
		source: `${unknown}, ${knownFalse}`,
		media: `not all, ${knownFalse}`,
		expected: false,
		unsupported: true,
	},
	{
		source: `not ${unknown}, ${knownFalse}`,
		media: `not all, ${knownFalse}`,
		expected: false,
		unsupported: true,
	},
	{
		source: `${unknown}, not unknown`,
		media: "not all, not unknown",
		expected: true,
		unsupported: true,
	},
	{
		source: "unknown, print",
		media: "unknown, print",
		expected: false,
		unsupported: false,
	},
	{
		source: `${unknown}, not(foo)`,
		media: "not all, not all",
		expected: false,
		unsupported: true,
	},
	{
		source: `${knownTrue} or, ${knownTrue}`,
		media: `not all, ${knownTrue}`,
		expected: true,
		unsupported: true,
	},
	{
		source: `${knownFalse} and ${unknown}, ${unknown} or ${knownTrue}`,
		media: `${knownFalse} and ${unknown}, ${unknown} or ${knownTrue}`,
		expected: true,
		unsupported: true,
	},
	{
		source: `future(a, b), ${knownTrue}`,
		media: `not all, ${knownTrue}`,
		expected: true,
		unsupported: true,
	},
	{
		source: `, ${knownTrue},`,
		media: `not all, ${knownTrue}, not all`,
		expected: true,
		unsupported: true,
	},
])(
	"preserves comma recovery, unsupported aggregation and branch serialization: $source",
	({ source, media, expected, unsupported }) => {
		check(source, expected, unsupported, media);
	},
);

it.each([
	{
		source: " SCREEN AND (( WIDTH >= 40px ) OR ( UNKNOWN-FEATURE : value )) ",
		media: "screen and ((width >= 40px) or (unknown-feature: value))",
		expected: true,
		unsupported: true,
	},
	{
		source: "NOT\tUNKNOWN",
		media: "not unknown",
		expected: true,
		unsupported: false,
	},
	{
		source: "ONLY\nCUSTOM-TYPE",
		media: "only custom-type",
		expected: false,
		unsupported: false,
	},
	{
		source: `${knownTrue}/**/or/**/${unknown}`,
		media: `${knownTrue} or ${unknown}`,
		expected: true,
		unsupported: true,
	},
	{
		source: "not/**/(width < 40px)",
		media: "not (width < 40px)",
		expected: true,
		unsupported: false,
	},
	{
		source: `${knownTrue} or ${unknown} /* unfinished`,
		media: `${knownTrue} or ${unknown}`,
		expected: true,
		unsupported: true,
	},
])(
	"retains the partial normalization policy: $source",
	({ source, media, expected, unsupported }) => {
		check(source, expected, unsupported, media);
	},
);

it.each([
	{ source: `${knownTrue} or ${unknown}`, expected: [true, false, true] },
	{
		source: `not (${knownTrue} and ${unknown})`,
		expected: [false, true, false],
	},
	{
		source: `screen and (${knownTrue} or ${unknown})`,
		expected: [true, false, true],
	},
])(
	"keeps mixed serialization and diagnostics stable across viewport changes: $source",
	({ source, expected }) => {
		const compiled = compileCssMedia(source);
		const conditions = compiled.conditions;
		for (const [index, width] of [80, 20, 80].entries()) {
			const current = { width, height: 40 };
			expect(compiled.matches(current)).toBe(expected[index]);
			expect(compiled.media).toBe(source);
			expect(compiled.unsupported).toBe(true);
			expect(compiled.conditions).toBe(conditions);
			const issues: string[] = [];
			expect(
				cssMediaMatches(source, current, (issue) => issues.push(issue)),
			).toBe(expected[index]);
			expect(issues).toEqual([diagnostic]);
		}
	},
);

it.each([
	`${knownTrue} or (unknown: "value")`,
	`${knownTrue} or (unknown: [value])`,
	`${knownTrue} or (unknown: {value})`,
	`${knownTrue} or (unknown: \\76 alue)`,
	"scr\\65 en",
	"not scr\\65 en",
])(
	"preserves quoted, escaped and bracketed branch limitations: %s",
	(source) => {
		check(source, false, true, "not all");
	},
);

it.each([
	`${knownTrue}, (`,
	`${knownTrue}, future(`,
	`${knownTrue}, "unterminated`,
	`${knownTrue}, [unterminated`,
	`${knownTrue})`,
])(
	"retains global malformed-block recovery even after a true branch: %s",
	(source) => {
		check(source, false, true, "not all");
	},
);

it("preserves frozen public records with Boolean-only matching and unchanged field shape", () => {
	for (const source of [unknown, "not unknown", `${knownTrue} or ${unknown}`]) {
		const compiled = compileCssMedia(source);
		expect(Object.isFrozen(compiled)).toBe(true);
		expect(Object.keys(compiled).sort()).toEqual([
			"conditions",
			"matches",
			"media",
			"unsupported",
		]);
		expect(typeof compiled.matches(viewport)).toBe("boolean");
		for (const key of Object.keys(compiled))
			expect(Reflect.set(compiled, key, null)).toBe(false);
		expect(Reflect.deleteProperty(compiled, "matches")).toBe(false);
		expect(Reflect.defineProperty(compiled, "unknown", { value: null })).toBe(
			false,
		);
	}
});

it("retains the empty-list policy without creating an unsupported branch", () => {
	for (const source of ["", " \t\n", "/* comment */"])
		check(source, true, false, "");
});

it("retains the original source limit for unknown conditions and media identifiers", () => {
	expect(cssMediaLimits).toEqual({
		maxCodeUnits: 65_536,
		maxDepth: 32,
		maxConditions: 1024,
	});
	expect(Object.isFrozen(cssMediaLimits)).toBe(true);
	const identifier = "x".repeat(cssMediaLimits.maxCodeUnits);
	check(identifier, false, false);
	const condition = `(${"x".repeat(cssMediaLimits.maxCodeUnits - 2)})`;
	check(condition, false, true, "not all");
	for (const source of [identifier, condition])
		expect(() => compileCssMedia(`${source} `)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("retains depth limits for nested unknown terms and general-enclosed functions", () => {
	const depth = cssMediaLimits.maxDepth;
	for (const source of [
		`${"(".repeat(depth)}unknown${")".repeat(depth)}`,
		`${"future(".repeat(depth)}value${")".repeat(depth)}`,
	]) {
		check(source, false, true, "not all");
		expect(() => compileCssMedia(`(${source})`)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
});

it("keeps condition budgets for typed lists and known-condition lists", () => {
	const types = Array.from(
		{ length: cssMediaLimits.maxConditions },
		() => "screen",
	).join(", ");
	expect(check(types, true, false).conditions).toBe(
		cssMediaLimits.maxConditions,
	);
	expect(() => compileCssMedia(`${types}, screen`)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const source = Array.from(
		{ length: cssMediaLimits.maxConditions / 2 },
		() => "(width)",
	).join(", ");
	expect(check(source, true, false).conditions).toBe(
		cssMediaLimits.maxConditions,
	);
	expect(() => compileCssMedia(`${source}, (width)`)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not skip parser condition budgets after a decisive true or false operand", () => {
	const tail = Array.from(
		{ length: cssMediaLimits.maxConditions },
		() => unknown,
	);
	for (const source of [
		`${knownTrue} or ${tail.join(" or ")}`,
		`${knownFalse} and ${tail.join(" and ")}`,
	])
		expect(() => compileCssMedia(source)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});
