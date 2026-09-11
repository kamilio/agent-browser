import { expect, it } from "vitest";
import {
	parseCssRules,
	type CssParseBudget,
	type CssRuleDiagnosticSink,
} from "./css-parser.js";
import { AgentBrowserError } from "./errors.js";

interface DiagnosticScope {
	issues: Readonly<Record<string, number>>;
	media: readonly string[];
}

function budget(overrides: Partial<CssParseBudget> = {}): CssParseBudget {
	return {
		rules: 0,
		declarations: 0,
		maxRules: 100,
		maxDeclarations: 100,
		...overrides,
	};
}

function collect(
	source: string,
	media: string[] = [],
	limits = budget(),
	depth = 0,
) {
	const raw: string[] = [];
	const globals: DiagnosticScope[] = [];
	const rules = parseCssRules(
		source,
		limits,
		(code) => raw.push(code),
		media,
		depth,
		undefined,
		(issues, chain) => globals.push({ issues, media: chain }),
	);
	return { rules, raw, globals, budget: limits };
}

it("preserves legacy return shapes, omitted rules and raw diagnostics without a sink", () => {
	const source =
		".valid{display:block;unknown-property:yes}.unsupported{other-unknown:no}.empty{}";
	const raw: string[] = [];
	const media = ["screen"];
	const rules = parseCssRules(
		source,
		budget(),
		(code) => raw.push(code),
		media,
	);
	expect(rules).toEqual([
		{
			selector: ".valid",
			declarations: [{ property: "display", value: "block", important: false }],
			media: ["screen"],
		},
	]);
	expect(rules[0]).not.toHaveProperty("issues");
	expect(rules[0].media).toBe(media);
	expect(raw).toEqual([
		"unimplemented-css-property",
		"unimplemented-css-property",
	]);
});

it("retains unsupported-only selector rules with one aggregated diagnostic map", () => {
	const source =
		".missing, #other {unknown-one:yes;unknown-two:no;display:invalid;broken}";
	const result = collect(source);
	expect(result.rules).toEqual([
		{
			selector: ".missing, #other",
			declarations: [],
			media: [],
			issues: {
				"unimplemented-css-property": 2,
				"unimplemented-or-invalid-css-value": 1,
				"invalid-css-declaration": 1,
			},
		},
	]);
	expect(result.raw).toEqual([
		"unimplemented-css-property",
		"unimplemented-css-property",
		"unimplemented-or-invalid-css-value",
		"invalid-css-declaration",
	]);
	expect(result.globals).toEqual([]);
	expect(result.budget).toMatchObject({ rules: 1, declarations: 3 });
});

it("keeps mixed-rule declarations while omitting clean empty rules and empty maps", () => {
	const result = collect(
		".mixed{unknown-one:yes;display:block}.clean{visibility:hidden}.empty{}.comment{/*empty*/}",
	);
	expect(result.rules).toEqual([
		{
			selector: ".mixed",
			declarations: [{ property: "display", value: "block", important: false }],
			media: [],
			issues: { "unimplemented-css-property": 1 },
		},
		{
			selector: ".clean",
			declarations: [
				{ property: "visibility", value: "hidden", important: false },
			],
			media: [],
		},
	]);
	expect(result.rules[1]).not.toHaveProperty("issues");
	expect(result.globals).toEqual([]);
});

it("aggregates structural diagnostics once per invocation, not per rule", () => {
	const result = collect(
		"@unknown{} @other{} @unknown-statement; stray; .target{unsupported:value}",
		["screen"],
	);
	expect(result.globals).toEqual([
		{
			issues: {
				"unimplemented-css-at-rule": 2,
				"unimplemented-or-invalid-css-rule": 2,
			},
			media: ["screen"],
		},
	]);
	expect(result.rules[0].issues).toEqual({ "unimplemented-css-property": 1 });
	expect(result.raw).toEqual([
		"unimplemented-css-at-rule",
		"unimplemented-css-at-rule",
		"unimplemented-or-invalid-css-rule",
		"unimplemented-or-invalid-css-rule",
		"unimplemented-css-property",
	]);
});

it("keeps nested media rule issues and globals in separate applicability chains", () => {
	const result = collect(
		"@outer{} @media screen { @inside{} .first{unknown-one:x} @media (min-width: 20px) { @deep{} .second{unknown-two:y} } }",
		["print"],
	);
	expect(
		result.rules.map((rule) => ({ media: rule.media, issues: rule.issues })),
	).toEqual([
		{ media: ["print", "screen"], issues: { "unimplemented-css-property": 1 } },
		{
			media: ["print", "screen", "(min-width: 20px)"],
			issues: { "unimplemented-css-property": 1 },
		},
	]);
	expect(result.globals).toEqual([
		{
			issues: { "unimplemented-css-at-rule": 1 },
			media: ["print", "screen", "(min-width: 20px)"],
		},
		{ issues: { "unimplemented-css-at-rule": 1 }, media: ["print", "screen"] },
		{ issues: { "unimplemented-css-at-rule": 1 }, media: ["print"] },
	]);
	expect(result.raw).toEqual([
		"unimplemented-css-at-rule",
		"unimplemented-css-at-rule",
		"unimplemented-css-property",
		"unimplemented-css-at-rule",
		"unimplemented-css-property",
	]);
});

it("does not emit empty global scopes for clean recursive invocations", () => {
	const result = collect("@media screen{.target{display:block}}");
	expect(result.rules[0].media).toEqual(["screen"]);
	expect(result.rules[0]).not.toHaveProperty("issues");
	expect(result.globals).toEqual([]);
	expect(result.raw).toEqual([]);
	expect(collect("")).toMatchObject({ rules: [], globals: [], raw: [] });
});

it.each([
	{
		source: '.broken[title="unterminated',
		issues: {
			"unterminated-css-string": 1,
			"unimplemented-or-invalid-css-rule": 1,
		},
	},
	{
		source: "/* unterminated",
		issues: { "unterminated-css-comment": 1 },
	},
])("keeps malformed prelude recovery global: $source", ({ source, issues }) => {
	const result = collect(source, ["screen"]);
	expect(result.rules).toEqual([]);
	expect(result.globals).toEqual([{ issues, media: ["screen"] }]);
});

it.each([
	{
		source: ".broken{unknown-one:x;/*unterminated",
		globals: { "unterminated-css-comment": 2, "unterminated-css-rule": 1 },
		local: { "unimplemented-css-property": 1 },
	},
	{
		source: '.broken{width:"unterminated',
		globals: { "unterminated-css-string": 2, "unterminated-css-rule": 1 },
		local: { "unimplemented-or-invalid-css-value": 1 },
	},
])(
	"keeps declaration-scanner errors global without changing raw counts: $source",
	({ source, globals, local }) => {
		const raw: string[] = [];
		parseCssRules(source, budget(), (code) => raw.push(code));
		const result = collect(source);
		expect(result.raw).toEqual(raw);
		expect(result.globals).toEqual([{ issues: globals, media: [] }]);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0].issues).toEqual(local);
	},
);

it("keeps outer scanner recovery global even for false supports", () => {
	const source = "@supports (unknown-property:x){/*unterminated";
	const raw: string[] = [];
	parseCssRules(source, budget(), (code) => raw.push(code));
	const result = collect(source);
	expect(result.raw).toEqual(raw);
	expect(result.rules).toEqual([]);
	expect(result.globals).toEqual([
		{
			issues: { "unterminated-css-comment": 1, "unterminated-css-rule": 1 },
			media: [],
		},
	]);
});

it("suppresses inactive supports metadata while retaining active nested scopes", () => {
	const source =
		"@supports (unknown-property:x) { @hidden{} .hidden{unknown-one:x} @media screen{.hidden-too{unknown-two:x}} } @supports (width:1px) { @active{} @media print { .visible{unknown-three:x} } }";
	const result = collect(source, ["screen"]);
	expect(result.rules).toEqual([
		{
			selector: ".visible",
			declarations: [],
			media: ["screen", "print"],
			issues: { "unimplemented-css-property": 1 },
		},
	]);
	expect(result.globals).toEqual([
		{ issues: { "unimplemented-css-at-rule": 1 }, media: ["screen"] },
	]);
	expect(result.raw).toEqual([
		"unimplemented-css-at-rule",
		"unimplemented-css-property",
	]);
	expect(result.budget.declarations).toBe(3);
});

it("does not activate nested true supports inside false supports", () => {
	const result = collect(
		"@supports (unknown-property:x){@supports (width:1px){@hidden{}.hidden{unknown-one:x}}}",
	);
	expect(result.rules).toEqual([]);
	expect(result.globals).toEqual([]);
	expect(result.raw).toEqual([]);
	expect(result.budget.declarations).toBe(1);
});

it("preserves the sixth import callback and does not re-report child metadata", () => {
	const raw: string[] = [];
	const globals: DiagnosticScope[] = [];
	const sink: CssRuleDiagnosticSink = (issues, media) => {
		globals.push({ issues, media });
	};
	const media = ["screen", "print"];
	const imported = parseCssRules(
		"@child-global{} .imported{unknown-one:x}",
		budget(),
		(code) => raw.push(code),
		media,
		0,
		undefined,
		sink,
	);
	const calls: { start: number; media: readonly string[]; depth: number }[] =
		[];
	const source = '\ufeff/*lead*/@import "child.css"; .local{display:block}';
	const rules = parseCssRules(
		source,
		budget(),
		(code) => raw.push(code),
		media,
		2,
		(start, chain, depth) => {
			calls.push({ start, media: chain, depth });
			return imported;
		},
		sink,
	);
	expect(calls).toEqual([{ start: 0, media, depth: 2 }]);
	expect(rules).toHaveLength(2);
	expect(rules[0]).toBe(imported[0]);
	expect(rules[0].issues).toEqual({ "unimplemented-css-property": 1 });
	expect(rules[1]).not.toHaveProperty("issues");
	expect(raw).toEqual([
		"unimplemented-css-at-rule",
		"unimplemented-css-property",
	]);
	expect(globals).toEqual([
		{ issues: { "unimplemented-css-at-rule": 1 }, media },
	]);
});

it("keeps unresolved imports global and accepts resolved empty imports", () => {
	const unresolved = collect('@import "missing.css";', ["screen"]);
	expect(unresolved.rules).toEqual([]);
	expect(unresolved.globals).toEqual([
		{ issues: { "css-import-not-loaded": 1 }, media: ["screen"] },
	]);
	const raw: string[] = [];
	const globals: DiagnosticScope[] = [];
	const rules = parseCssRules(
		'@import "empty.css";',
		budget(),
		(code) => raw.push(code),
		[],
		0,
		() => [],
		(issues, media) => globals.push({ issues, media }),
	);
	expect(rules).toEqual([]);
	expect(raw).toEqual([]);
	expect(globals).toEqual([]);
});

it("does not forward a top-level import resolver into nested media", () => {
	let resolutions = 0;
	const globals: DiagnosticScope[] = [];
	const raw: string[] = [];
	parseCssRules(
		'@media screen{@import "nested.css";}',
		budget(),
		(code) => raw.push(code),
		[],
		0,
		() => {
			resolutions++;
			return [];
		},
		(issues, media) => globals.push({ issues, media }),
	);
	expect(resolutions).toBe(0);
	expect(raw).toEqual(["css-import-not-loaded"]);
	expect(globals).toEqual([
		{ issues: { "css-import-not-loaded": 1 }, media: ["screen"] },
	]);
});

it.each([
	".target{unknown-one:x;unknown-two:y}",
	"@media screen{.target{unknown-one:x;unknown-two:y}}",
	"@supports (unknown-property:x){.target{unknown-one:x;unknown-two:y}}",
])(
	"preserves declaration budget errors with or without metadata: %s",
	(source) => {
		for (const diagnostics of [
			undefined,
			(() => {}) as CssRuleDiagnosticSink,
		]) {
			const limits = budget({ maxDeclarations: 1 });
			expect(() =>
				parseCssRules(source, limits, () => {}, [], 0, undefined, diagnostics),
			).toThrow("CSS declaration limit exceeded");
			expect(limits.declarations).toBe(2);
		}
	},
);

it("preserves rule budget accounting for omitted and issue-only rules", () => {
	const source = ".first{unknown-one:x}.second{}";
	const exact = collect(source, [], budget({ maxRules: 2 }));
	expect(exact.rules).toHaveLength(1);
	expect(exact.budget.rules).toBe(2);
	for (const diagnostics of [undefined, (() => {}) as CssRuleDiagnosticSink]) {
		const limits = budget({ maxRules: 1 });
		expect(() =>
			parseCssRules(source, limits, () => {}, [], 0, undefined, diagnostics),
		).toThrow("CSS rule limit exceeded");
		expect(limits.rules).toBe(2);
	}
});

it("preserves recursion and component-scanner limits", () => {
	const nested = `${"@media screen{".repeat(17)}.target{display:block}${"}".repeat(17)}`;
	const component = `.target{unknown-one:${"(".repeat(33)}x${")".repeat(33)}}`;
	for (const diagnostics of [undefined, (() => {}) as CssRuleDiagnosticSink]) {
		for (const source of [nested, component])
			expect(() =>
				parseCssRules(
					source,
					budget(),
					() => {},
					[],
					0,
					undefined,
					diagnostics,
				),
			).toThrow(AgentBrowserError);
	}
	expect(
		collect(".target{display:block}", [], budget(), 16).rules,
	).toHaveLength(1);
	expect(() => collect("", [], budget(), 17)).toThrow(
		"CSS rule nesting limit exceeded",
	);
});

it("freezes diagnostic maps and snapshots global media without mutating inputs", () => {
	const media = ["screen"];
	const source = "@future{} .first{unknown-one:x}.second{unknown-two:y}";
	const result = collect(source, media);
	const firstIssues = result.rules[0].issues;
	const secondIssues = result.rules[1].issues;
	expect(firstIssues).not.toBe(secondIssues);
	for (const value of [
		firstIssues,
		secondIssues,
		result.globals[0].issues,
		result.globals[0].media,
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(Object.isFrozen(media)).toBe(false);
	expect(result.globals[0].media).not.toBe(media);
	media.push("print");
	expect(result.globals[0].media).toEqual(["screen"]);
	expect(firstIssues).toEqual({ "unimplemented-css-property": 1 });
	expect(source).toBe("@future{} .first{unknown-one:x}.second{unknown-two:y}");
});

it("bounds retained diagnostic metadata by rule and code, not raw issue count", () => {
	const source = `.target{${"unknown-one:x;".repeat(64)}}`;
	const result = collect(source);
	expect(result.rules).toHaveLength(1);
	expect(result.rules[0].issues).toEqual({ "unimplemented-css-property": 64 });
	expect(result.raw).toHaveLength(64);
	expect(result.globals).toEqual([]);
});

it("keeps callback errors synchronous instead of replacing them with metadata", () => {
	const rawFailure = new Error("Raw diagnostic callback failed");
	expect(() =>
		parseCssRules(
			".target{unknown-one:x}",
			budget(),
			() => {
				throw rawFailure;
			},
			[],
			0,
			undefined,
			() => {},
		),
	).toThrow(rawFailure);
	const sinkFailure = new Error("Diagnostic sink failed");
	expect(() =>
		parseCssRules(
			"@future{}",
			budget(),
			() => {},
			[],
			0,
			undefined,
			() => {
				throw sinkFailure;
			},
		),
	).toThrow(sinkFailure);
});
