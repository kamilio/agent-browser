import { expect, it } from "vitest";
import {
	compileCssMedia,
	cssMediaLimits,
	type MediaViewport,
} from "./css-media.js";
import { AgentBrowserError } from "./errors.js";
import {
	effectiveColorScheme,
	nativeColorScheme,
	validateColorSchemePreference,
	type ColorSchemePreference,
} from "./native-color-scheme.js";

function expectInvalidInput(operation: () => unknown) {
	let failure: unknown;
	try {
		operation();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code: "invalid-input" });
}

function environment(
	colorSchemePreference?: ColorSchemePreference,
	width = 800,
	height = 600,
): Readonly<MediaViewport> {
	return Object.freeze({ width, height, colorSchemePreference });
}

it("publishes a frozen native profile without OS detection or site overrides", () => {
	expect(Object.isFrozen(nativeColorScheme)).toBe(true);
	expect(nativeColorScheme).toEqual({
		profile: "native-ua-color-preference",
		preference: null,
		systemIntegration: false,
		siteOverrides: false,
	});
});

it.each([
	{ preference: null, effective: "light" },
	{ preference: "light", effective: "light" },
	{ preference: "dark", effective: "dark" },
] as const)(
	"validates native preference $preference and resolves it to $effective",
	({ preference, effective }) => {
		expect(validateColorSchemePreference(preference)).toBe(preference);
		expect(effectiveColorScheme(preference)).toBe(effective);
	},
);

it("uses undefined only as the effective-preference default, not a valid preference", () => {
	expect(effectiveColorScheme(undefined)).toBe("light");
	expect(effectiveColorScheme(undefined)).toBe(
		effectiveColorScheme(nativeColorScheme.preference),
	);
	expectInvalidInput(() => validateColorSchemePreference(undefined));
});

it.each([
	{ name: "empty string", value: "" },
	{ name: "uppercase light", value: "LIGHT" },
	{ name: "uppercase dark", value: "DARK" },
	{ name: "padded light", value: " light " },
	{ name: "legacy keyword", value: "no-preference" },
	{ name: "unknown keyword", value: "sepia" },
	{ name: "null string", value: "null" },
	{ name: "undefined string", value: "undefined" },
	{ name: "zero", value: 0 },
	{ name: "one", value: 1 },
	{ name: "NaN", value: Number.NaN },
	{ name: "infinity", value: Infinity },
	{ name: "false", value: false },
	{ name: "true", value: true },
	{ name: "empty object", value: {} },
	{ name: "empty array", value: [] },
	{ name: "light array", value: ["light"] },
	{ name: "symbol", value: Symbol("light") },
	{ name: "function", value: () => "light" },
])("rejects $name in both native preference helpers", ({ value }) => {
	expectInvalidInput(() => validateColorSchemePreference(value));
	expectInvalidInput(() =>
		effectiveColorScheme(value as ColorSchemePreference),
	);
});

it("rejects preference objects without invoking coercion hooks", () => {
	let coercions = 0;
	const preference = Object.freeze({
		[Symbol.toPrimitive]() {
			coercions++;
			return "light";
		},
		toString() {
			coercions++;
			return "light";
		},
		valueOf() {
			coercions++;
			return "light";
		},
	});
	expectInvalidInput(() => validateColorSchemePreference(preference));
	expectInvalidInput(() =>
		effectiveColorScheme(preference as unknown as ColorSchemePreference),
	);
	expect(coercions).toBe(0);
});

it.each([
	{ preference: undefined, light: true, dark: false },
	{ preference: null, light: true, dark: false },
	{ preference: "light", light: true, dark: false },
	{ preference: "dark", light: false, dark: true },
] as const)(
	"matches known preference $preference",
	({ preference, light, dark }) => {
		const viewport = environment(preference);
		const lightQuery = compileCssMedia("(prefers-color-scheme: light)");
		const darkQuery = compileCssMedia("(prefers-color-scheme: dark)");
		expect(lightQuery.unsupported).toBe(false);
		expect(darkQuery.unsupported).toBe(false);
		expect(lightQuery.matches(viewport)).toBe(light);
		expect(darkQuery.matches(viewport)).toBe(dark);
		expect(lightQuery.media).toBe("(prefers-color-scheme: light)");
		expect(darkQuery.media).toBe("(prefers-color-scheme: dark)");
	},
);

it.each([undefined, null, "light", "dark"] as const)(
	"matches bare color scheme and its negation for preference %s",
	(preference) => {
		const viewport = environment(preference);
		const bare = compileCssMedia("(prefers-color-scheme)");
		const negated = compileCssMedia("not (prefers-color-scheme)");
		expect(bare.unsupported).toBe(false);
		expect(negated.unsupported).toBe(false);
		expect(bare.matches(viewport)).toBe(true);
		expect(negated.matches(viewport)).toBe(false);
	},
);

it.each([
	["(prefers-color-scheme) and (prefers-color-scheme: dark)", false, true],
	["(prefers-color-scheme) or (prefers-color-scheme: dark)", true, true],
	["(prefers-color-scheme) and (width > 800px)", false, false],
	["(prefers-color-scheme), print", true, true],
	["not (prefers-color-scheme), (prefers-color-scheme: dark)", false, true],
	[" ( PREFERS-COLOR-SCHEME /**/ ) ", true, true],
	["not/**/(PREFERS-COLOR-SCHEME)", false, false],
] as const)("composes bare color scheme in %s", (query, light, dark) => {
	const compiled = compileCssMedia(query);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.matches(environment("light"))).toBe(light);
	expect(compiled.matches(environment("dark"))).toBe(dark);
	expect(compiled.matches(environment(null))).toBe(light);
});

it.each([
	"no-preference",
	"sepia",
	"none",
	"0",
	"light dark",
	'"light"',
	"var(--scheme)",
	"",
])(
	"keeps unsupported color-scheme value %j unknown under negation",
	(value) => {
		for (const query of [
			`(prefers-color-scheme: ${value})`,
			`not (prefers-color-scheme: ${value})`,
		]) {
			const compiled = compileCssMedia(query);
			expect(compiled.unsupported).toBe(true);
			expect(compiled.media).toBe("not all");
			for (const preference of [undefined, null, "light", "dark"] as const)
				expect(compiled.matches(environment(preference))).toBe(false);
		}
	},
);

it.each([
	[
		"(prefers-color-scheme) and (prefers-color-scheme: no-preference)",
		false,
		false,
	],
	[
		"(prefers-color-scheme) or (prefers-color-scheme: no-preference)",
		true,
		true,
	],
	[
		"(prefers-color-scheme: no-preference) or (prefers-color-scheme)",
		true,
		true,
	],
	[
		"(prefers-color-scheme: dark) or (prefers-color-scheme: no-preference)",
		false,
		true,
	],
	[
		"not ((prefers-color-scheme: dark) and (prefers-color-scheme: no-preference))",
		true,
		false,
	],
	[
		"not ((prefers-color-scheme) and (prefers-color-scheme: no-preference))",
		false,
		false,
	],
	[
		"not ((prefers-color-scheme) or (prefers-color-scheme: no-preference))",
		false,
		false,
	],
] as const)(
	"preserves sourced three-valued color-scheme combinations: %s",
	(query, light, dark) => {
		const compiled = compileCssMedia(query);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.matches(environment("light"))).toBe(light);
		expect(compiled.matches(environment("dark"))).toBe(dark);
		expect(compiled.matches(environment(null))).toBe(light);
	},
);

it.each([
	"(prefers-color-scheme > dark)",
	"(prefers-color-scheme <= light)",
	"(prefers-color-scheme = dark)",
	"(dark < prefers-color-scheme)",
	"(light < prefers-color-scheme < dark)",
	"(min-prefers-color-scheme: dark)",
	"(max-prefers-color-scheme: light)",
])("does not reinterpret discrete color-scheme range syntax: %s", (query) => {
	for (const source of [query, `not ${query}`]) {
		const compiled = compileCssMedia(source);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.media).toBe("not all");
		for (const preference of [undefined, null, "light", "dark"] as const)
			expect(compiled.matches(environment(preference))).toBe(false);
	}
});

it("preserves dimension-only callers and selects the explicit native default", () => {
	const viewport = Object.freeze({ width: 800, height: 600 });
	expect(compileCssMedia("(prefers-color-scheme)").matches(viewport)).toBe(
		true,
	);
	expect(
		compileCssMedia("(prefers-color-scheme: light)").matches(viewport),
	).toBe(true);
	expect(
		compileCssMedia("(prefers-color-scheme: dark)").matches(viewport),
	).toBe(false);
	expect(compileCssMedia("(width >= 800px)").matches(viewport)).toBe(true);
	expect(compileCssMedia("(height > 600px)").matches(viewport)).toBe(false);
	expect(compileCssMedia("(orientation: landscape)").matches(viewport)).toBe(
		true,
	);
	expect(Object.keys(viewport)).toEqual(["width", "height"]);
});

it.each([
	["not (prefers-color-scheme: dark)", true, false],
	["not (prefers-color-scheme: light)", false, true],
	["not screen and (prefers-color-scheme: dark)", true, false],
	["screen and (prefers-color-scheme: dark)", false, true],
	["only screen and (prefers-color-scheme: light)", true, false],
	["print and (prefers-color-scheme: light)", false, false],
	["not print and (prefers-color-scheme: light)", true, true],
	["(prefers-color-scheme: dark) and (width >= 800px)", false, true],
	["(prefers-color-scheme: dark) and (width > 800px)", false, false],
	["(width > 800px) or (prefers-color-scheme: light)", true, false],
	["(prefers-color-scheme: light), (prefers-color-scheme: dark)", true, true],
	["print, (prefers-color-scheme: dark)", false, true],
	[
		"(prefers-color-scheme: dark) and ((orientation: landscape) or (height > 600px))",
		false,
		true,
	],
] as const)(
	"composes supported color-scheme query %s",
	(query, light, dark) => {
		const compiled = compileCssMedia(query);
		expect(compiled.unsupported).toBe(false);
		expect(compiled.matches(environment("light"))).toBe(light);
		expect(compiled.matches(environment("dark"))).toBe(dark);
	},
);

it.each([
	"(PREFERS-COLOR-SCHEME: DARK)",
	" ( prefers-color-scheme : dark ) ",
	"\n(\tPREFERS-COLOR-SCHEME\r\n:\fDaRk\t) ",
	"/*lead*/(prefers-color-scheme/**/:/**/dark)/*tail*/",
])("normalizes supported case, whitespace and comments: %j", (query) => {
	const compiled = compileCssMedia(query);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.media).toBe("(prefers-color-scheme: dark)");
	expect(compiled.matches(environment("dark"))).toBe(true);
	expect(compiled.matches(environment("light"))).toBe(false);
});

it.each([
	["(prefers-color-scheme: dark) and (unknown-feature: value)", false, false],
	["(prefers-color-scheme: dark) or (unknown-feature: value)", false, true],
	["(unknown-feature: value) or (prefers-color-scheme: dark)", false, true],
	["(unknown-feature: value), (prefers-color-scheme: light)", true, false],
	["not (unknown-feature: value)", false, false],
	[
		"not ((prefers-color-scheme: dark) and (unknown-feature: value))",
		true,
		false,
	],
	[
		"not ((prefers-color-scheme: light) or (unknown-feature: value))",
		false,
		false,
	],
] as const)(
	"preserves unknown conditions in tri-valued combinations: %s",
	(query, light, dark) => {
		const compiled = compileCssMedia(query);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.matches(environment("light"))).toBe(light);
		expect(compiled.matches(environment("dark"))).toBe(dark);
	},
);

it("retains unknown list branches rather than inventing a preference", () => {
	const compiled = compileCssMedia(
		"(unknown-feature: value), (prefers-color-scheme: dark)",
	);
	expect(compiled.media).toBe("not all, (prefers-color-scheme: dark)");
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(environment(null))).toBe(false);
	expect(compiled.matches(environment("dark"))).toBe(true);
});

it.each([
	"not(prefers-color-scheme)",
	"(prefers-color-scheme) and(width)",
	"(prefers-color-scheme) or (width) and (height)",
	"((prefers-color-scheme: dark)",
	"(prefers-color-scheme: dark))",
	"(prefers-color-scheme: dark) and",
	"(prefers-color-scheme: dark) and(width)",
	"not (prefers-color-scheme: dark) and (width)",
	"screen and (prefers-color-scheme: dark) or (width)",
	"(prefers-color-scheme: dark) xor (width)",
])("rejects malformed condition operators conservatively: %s", (query) => {
	const compiled = compileCssMedia(query);
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(environment("dark"))).toBe(false);
	expect(compiled.matches(environment("light"))).toBe(false);
});

it("reuses one compiled predicate with changing immutable environments", () => {
	const source = "(prefers-color-scheme: dark) and (width >= 800px)";
	const compiled = compileCssMedia(source);
	const conditions = compiled.conditions;
	const viewports = [
		environment("dark", 800),
		environment("light", 800),
		environment("dark", 799),
		environment(null, 800),
		environment(undefined, 800),
		environment("dark", 900),
	];
	for (let repeat = 0; repeat < 64; repeat++)
		expect(viewports.map((viewport) => compiled.matches(viewport))).toEqual([
			true,
			false,
			false,
			false,
			false,
			true,
		]);
	expect(Object.isFrozen(compiled)).toBe(true);
	for (const viewport of viewports)
		expect(Object.isFrozen(viewport)).toBe(true);
	expect(compiled.conditions).toBe(conditions);
	expect(compiled.media).toBe(source);
	expect(viewports[0]).toEqual({
		width: 800,
		height: 600,
		colorSchemePreference: "dark",
	});
});

it.each(
	["no-preference", "sepia", "", 0, false, {}, []].map(
		(preference) => [preference] as const,
	),
)("rejects invalid host preference configuration: %j", (preference) => {
	const viewport = environment(preference as ColorSchemePreference);
	for (const query of [
		"(prefers-color-scheme)",
		"not (prefers-color-scheme)",
		"(prefers-color-scheme: light)",
		"(prefers-color-scheme: dark)",
	]) {
		const compiled = compileCssMedia(query);
		expectInvalidInput(() => compiled.matches(viewport));
	}
});

it("preserves exact compiler source and nesting limits", () => {
	const query = "(prefers-color-scheme: light)";
	const maximum = query.padEnd(cssMediaLimits.maxCodeUnits, " ");
	expect(compileCssMedia(maximum).matches(environment(null))).toBe(true);
	expect(() => compileCssMedia(`${maximum} `)).toThrow("source limit");
	const exactDepth = `${"(".repeat(cssMediaLimits.maxDepth - 1)}${query}${")".repeat(cssMediaLimits.maxDepth - 1)}`;
	expect(compileCssMedia(exactDepth).matches(environment(null))).toBe(true);
	expect(() => compileCssMedia(`(${exactDepth})`)).toThrow("nesting limit");
});

it("keeps condition limits active even when an earlier alternative matches", () => {
	const alternatives = Array.from(
		{ length: cssMediaLimits.maxConditions + 1 },
		() => "(prefers-color-scheme: light)",
	).join(",");
	expect(() => compileCssMedia(alternatives)).toThrow("condition limit");
	expect(() =>
		compileCssMedia(
			Array.from(
				{ length: cssMediaLimits.maxConditions + 1 },
				() => "(prefers-color-scheme: light)",
			).join(" or "),
		),
	).toThrow("condition limit");
});
