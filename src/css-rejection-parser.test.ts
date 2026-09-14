import { expect, it } from "vitest";
import type { CssDiagnosticSink } from "./css-diagnostics.js";
import {
	parseCssDeclarations,
	parseCssRules,
	type CssParseBudget,
	type CssRule,
} from "./css-parser.js";

const invalidValue = "unimplemented-or-invalid-css-value";
const unsupportedProperty = "unimplemented-css-property";

function budget(overrides: Partial<CssParseBudget> = {}): CssParseBudget {
	return {
		rules: 0,
		declarations: 0,
		maxRules: 8192,
		maxDeclarations: 16384,
		...overrides,
	};
}

function collect(limit = 128) {
	const events: Parameters<CssDiagnosticSink>[] = [];
	const sink: CssDiagnosticSink = (code, context) => {
		const id = events.length;
		events.push([code, context]);
		return id < limit ? id : undefined;
	};
	return { events, sink };
}

function declarations(source: string, diagnostic?: CssDiagnosticSink) {
	const counters = budget();
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		counters,
		(code) => issues.push(code),
		diagnostic,
	);
	return { declarations: parsed, budget: counters, issues };
}

function stylesheet(
	source: string,
	diagnostic?: CssDiagnosticSink,
	aggregate = true,
	topLevel = true,
) {
	const counters = budget();
	const issues: string[] = [];
	const global: {
		issues: Readonly<Record<string, number>>;
		media: readonly string[];
	}[] = [];
	const rules = parseCssRules(
		source,
		counters,
		(code) => issues.push(code),
		[],
		0,
		undefined,
		aggregate ? (issues, media) => global.push({ issues, media }) : undefined,
		topLevel,
		diagnostic,
	);
	return { rules, budget: counters, issues, global };
}

function withoutSampleIds(rules: readonly CssRule[]) {
	return rules.map(
		({ diagnosticSampleIds: _diagnosticSampleIds, ...rule }) => rule,
	);
}

it.each([
	["DiSpLaY", "display", "Not-A-Display", invalidValue],
	["-WEBKIT-BOX-SIZING", "box-sizing", "Unknown-Box", invalidValue],
	["Word-Wrap", "overflow-wrap", "Unknown-Wrap", invalidValue],
	[
		"Unknown-Property",
		"unknown-property",
		"MiXeD/*keep*/ Case",
		unsupportedProperty,
	],
	["--Theme", "--Theme", "var(,red)", invalidValue],
	["width", "width", "var(,red)", invalidValue],
])(
	"preserves authored rejection details for %s independently of counts",
	(authoredProperty, property, value, code) => {
		const source = `/*before*/ ${authoredProperty} /*after*/: ${value} ! IMPORTANT`;
		const collector = collect();
		const result = declarations(source, collector.sink);
		expect(result).toEqual(declarations(source));
		expect(result.declarations).toEqual([]);
		expect(result.issues).toEqual([code]);
		expect(result.budget.declarations).toBe(1);
		expect(collector.events).toEqual([
			[
				code,
				{
					authoredProperty,
					property,
					value: `${value} ! IMPORTANT`,
					important: true,
				},
			],
		]);
	},
);

it("retains authored priority text in the value fragment", () => {
	const collector = collect();
	declarations("animation-name: Spin!important \t", collector.sink);
	expect(collector.events).toEqual([
		[
			unsupportedProperty,
			{
				authoredProperty: "animation-name",
				property: "animation-name",
				value: "Spin!important",
				important: true,
			},
		],
	]);
});

it.each([
	"content",
	"text-decoration",
	"outline",
	"table-layout",
	"list-style",
	"pointer-events",
	"overflow",
	"grid-template-columns",
	"flex",
	"border-radius",
	"border",
	"font-size",
	"background",
	"color",
	"width",
	"visibility",
	"all",
])("instruments the existing %s value rejection once", (property) => {
	const collector = collect();
	const source = `${property}:Definitely-Invalid`;
	const result = declarations(source, collector.sink);
	expect(result).toEqual(declarations(source));
	expect(result.issues).toEqual([invalidValue]);
	expect(collector.events).toEqual([
		[
			invalidValue,
			{
				authoredProperty: property,
				property,
				value: "Definitely-Invalid",
				important: false,
			},
		],
	]);
});

it("records the existing decoration length rejection without normalizing its value", () => {
	const collector = collect();
	const value = "X".repeat(4097);
	const source = `text-decoration:${value}`;
	expect(declarations(source, collector.sink)).toEqual(declarations(source));
	expect(collector.events).toEqual([
		[
			invalidValue,
			{
				authoredProperty: "text-decoration",
				property: "text-decoration",
				value,
				important: false,
			},
		],
	]);
});

it("leaves malformed statements and unknown importance unembellished", () => {
	const collector = collect();
	const source =
		"broken; /*only comment*/; width:10px !no; height: !important;";
	const result = declarations(source, collector.sink);
	expect(result).toEqual(declarations(source));
	expect(result.budget.declarations).toBe(2);
	expect(collector.events).toEqual([
		["invalid-css-declaration", undefined],
		[
			invalidValue,
			{ authoredProperty: "width", property: "width", value: "10px !no" },
		],
		[
			invalidValue,
			{
				authoredProperty: "height",
				property: "height",
				value: "!important",
				important: true,
			},
		],
	]);
});

it.each(["/*unfinished", '"unfinished'])(
	"does not attribute scanner failure %s to the preceding declaration",
	(fragment) => {
		const collector = collect();
		const source = `unknown:First; width:${fragment}`;
		const result = declarations(source, collector.sink);
		expect(result).toEqual(declarations(source));
		expect(result.issues).toEqual([
			unsupportedProperty,
			fragment.startsWith("/*")
				? "unterminated-css-comment"
				: "unterminated-css-string",
			invalidValue,
		]);
		expect(collector.events.map(([code]) => code)).toEqual([
			unsupportedProperty,
			invalidValue,
		]);
		expect(collector.events[1][1]).toEqual({
			authoredProperty: "width",
			property: "width",
			value: fragment,
		});
	},
);

it("does not sample accepted declarations or synthetic variable target probes", () => {
	const collector = collect();
	const source =
		"all:initial;--Theme:MiXeD;display:BLOCK;-webkit-box-sizing:border-box;width:var(--size);margin:var(--space);grid-template-columns:var(--tracks);content:var(--text)";
	const result = declarations(source, collector.sink);
	expect(result).toEqual(declarations(source));
	expect(result.issues).toEqual([]);
	expect(result.budget.declarations).toBe(8);
	expect(result.declarations.some((entry) => entry.substitution)).toBe(true);
	expect(collector.events).toEqual([]);
});

it("preserves legacy rule segments, aggregates and budgets when details are retained", () => {
	const source =
		"@unknown;.host{width:bad;color:red;.child{height:bad}display:bad}@media print{aside{unknown:yes}}@supports (width:1px){p{broken}}";
	const collector = collect();
	const result = stylesheet(source, collector.sink);
	expect({ ...result, rules: withoutSampleIds(result.rules) }).toEqual(
		stylesheet(source),
	);
	expect(result.rules.map((rule) => rule.diagnosticSampleIds)).toEqual([
		[0],
		[1],
		[2],
		[3],
		[4],
	]);
	expect(collector.events.map(([, context]) => context?.selector)).toEqual([
		".host",
		".child",
		".host",
		"aside",
		"p",
	]);
	expect(collector.events[1][1]?.nesting).toBe(result.rules[1].nesting);
	expect(collector.events[1][1]?.nesting).toEqual({ selector: ".host" });
	expect(
		collector.events.every(([, context]) => context?.scope === "rule"),
	).toBe(true);
	expect(result.rules[3].media).toEqual(["print"]);
	expect(collector.events[4][1]).toEqual({ selector: "p", scope: "rule" });
	for (const rule of result.rules)
		expect(Object.isFrozen(rule.diagnosticSampleIds)).toBe(true);
});

it("threads details through nested media and supports without inventing selector ancestors", () => {
	const source =
		"@media screen{@supports (width:1px){main{@media print{width:bad;@supports (height:1px){.child{height:bad;.leaf{color:bad}}}}}}}";
	const collector = collect();
	const result = stylesheet(source, collector.sink);
	expect({ ...result, rules: withoutSampleIds(result.rules) }).toEqual(
		stylesheet(source),
	);
	expect(result.rules.map((rule) => rule.media)).toEqual([
		["screen", "print"],
		["screen", "print"],
		["screen", "print"],
	]);
	expect(collector.events.map(([, context]) => context?.nesting)).toEqual([
		undefined,
		{ selector: "main" },
		{ selector: ".child", parent: { selector: "main" } },
	]);
});

it.each([
	"@supports (width:invalid){.hidden{width:bad;@media print{height:bad}}}",
	"main{@supports (width:invalid){width:bad;.hidden{height:bad}}}",
	"main{&div{width:bad;.hidden{height:bad}}}",
	"main{:not-native{width:bad;.hidden{height:bad}}}",
])(
	"suppresses rejected bodies in %s while preserving their budget charges",
	(body) => {
		const collector = collect();
		const source = `${body}.visible{unknown:yes}`;
		const result = stylesheet(source, collector.sink);
		expect({ ...result, rules: withoutSampleIds(result.rules) }).toEqual(
			stylesheet(source),
		);
		expect(result.budget.declarations).toBe(3);
		expect(collector.events).toHaveLength(1);
		expect(collector.events[0][1]?.selector).toBe(".visible");
	},
);

it("retains unsupported-only segments without an aggregate sink and keeps source order", () => {
	const source = "main{unknown:Before;.child{unknown:Child}unknown:After}";
	const collector = collect();
	const result = stylesheet(source, collector.sink, false);
	expect(stylesheet(source, undefined, false).rules).toEqual([]);
	expect(result.rules.map((rule) => rule.selector)).toEqual([
		"main",
		".child",
		"main",
	]);
	expect(result.rules.map((rule) => rule.diagnosticSampleIds)).toEqual([
		[0],
		[1],
		[2],
	]);
	expect(collector.events.map(([, context]) => context?.value)).toEqual([
		"Before",
		"Child",
		"After",
	]);
	for (const rule of result.rules) {
		expect(rule.declarations).toEqual([]);
		expect(Object.keys(rule).sort()).toEqual(
			[
				"selector",
				"declarations",
				"media",
				"diagnosticSampleIds",
				...(rule.nesting ? ["nesting"] : []),
			].sort(),
		);
	}
});

it.each([true, false])(
	"bounds retained IDs across repeated failures and rules with aggregate=%s",
	(aggregate) => {
		const source = Array.from(
			{ length: 200 },
			(_, index) => `.rule${index}{unknown:Repeat;unknown:Repeat}`,
		).join("");
		const collector = collect();
		const result = stylesheet(source, collector.sink, aggregate);
		const legacy = stylesheet(source, undefined, aggregate);
		expect(result.issues).toEqual(legacy.issues);
		expect(result.budget).toEqual(legacy.budget);
		expect(collector.events).toHaveLength(400);
		expect(
			result.rules.flatMap((rule) => rule.diagnosticSampleIds ?? []),
		).toEqual(Array.from({ length: 128 }, (_, index) => index));
		expect(result.rules).toHaveLength(aggregate ? 200 : 64);
		if (aggregate) {
			expect(withoutSampleIds(result.rules)).toEqual(legacy.rules);
			expect(result.rules[64]).not.toHaveProperty("diagnosticSampleIds");
		}
	},
);

it.each([true, false])(
	"does not add fields or segments when no IDs are retained with aggregate=%s",
	(aggregate) => {
		const source =
			".bad{unknown:yes}.mixed{width:bad;color:red}.clean{width:1px}.empty{}";
		const collector = collect(0);
		expect(stylesheet(source, collector.sink, aggregate)).toEqual(
			stylesheet(source, undefined, aggregate),
		);
		expect(collector.events).toHaveLength(2);
	},
);

it.each([true, false])(
	"retains the existing eighth topLevel argument behavior for %s",
	(topLevel) => {
		const source = "<!--p{width:bad}-->";
		const collector = collect();
		const result = stylesheet(source, collector.sink, true, topLevel);
		expect({ ...result, rules: withoutSampleIds(result.rules) }).toEqual(
			stylesheet(source, undefined, true, topLevel),
		);
		expect(collector.events[0][1]?.selector).toBe(topLevel ? "p" : "<!--p");
	},
);

it("preserves the stylesheet context guard instead of treating argument eight as a sink", () => {
	const collector = collect();
	expect(() =>
		parseCssRules(
			"p{width:bad}",
			budget(),
			() => {},
			[],
			0,
			undefined,
			undefined,
			collector.sink as unknown as boolean,
		),
	).toThrow("Invalid stylesheet context");
	expect(collector.events).toEqual([]);
});

it("leaves import source ownership with the caller and shares only retained IDs", () => {
	const collector = collect();
	const counters = budget();
	const issues: string[] = [];
	const report = (code: string) => issues.push(code);
	let imported: CssRule[] = [];
	const rules = parseCssRules(
		'@import "synthetic.css";main{unknown:Root}',
		counters,
		report,
		["screen"],
		0,
		(start, media, depth) => {
			expect(start).toBe(0);
			expect(media).toEqual(["screen"]);
			expect(depth).toBe(0);
			imported = parseCssRules(
				"aside{unknown:Imported}",
				counters,
				report,
				[...media],
				depth + 1,
				undefined,
				undefined,
				true,
				(code, context) =>
					collector.sink(code, { ...context, sheet: 2, importDepth: 1 }),
			);
			return imported;
		},
		undefined,
		true,
		(code, context) =>
			collector.sink(code, { ...context, sheet: 1, importDepth: 0 }),
	);
	expect(rules[0]).toBe(imported[0]);
	expect(rules.map((rule) => rule.diagnosticSampleIds)).toEqual([[0], [1]]);
	expect(
		collector.events.map(([, context]) => [
			context?.sheet,
			context?.importDepth,
			context?.value,
		]),
	).toEqual([
		[2, 1, "Imported"],
		[1, 0, "Root"],
	]);
	expect(issues).toEqual([unsupportedProperty, unsupportedProperty]);
	expect(counters).toMatchObject({ rules: 2, declarations: 2 });
});

it.each([
	[
		"p{unknown:yes;unknown:no}",
		{ maxDeclarations: 1 },
		"CSS declaration limit exceeded",
	],
	[
		"p{unknown:yes}aside{unknown:no}",
		{ maxRules: 1 },
		"CSS rule limit exceeded",
	],
	[
		"@supports (width:invalid){p{unknown:yes;unknown:no}}",
		{ maxDeclarations: 1 },
		"CSS declaration limit exceeded",
	],
	[
		`${"@media screen{".repeat(18)}p{width:bad}${"}".repeat(18)}`,
		{},
		"CSS rule nesting limit exceeded",
	],
	[
		`p{width:${"(".repeat(33)}bad${")".repeat(33)}}`,
		{},
		"CSS component nesting limit exceeded",
	],
])("preserves budget and recovery guards for %s", (source, limits, message) => {
	const legacyBudget = budget(limits);
	const detailedBudget = budget(limits);
	const legacyIssues: string[] = [];
	const detailedIssues: string[] = [];
	const collector = collect();
	expect(() =>
		parseCssRules(source, legacyBudget, (code) => legacyIssues.push(code)),
	).toThrow(message);
	expect(() =>
		parseCssRules(
			source,
			detailedBudget,
			(code) => detailedIssues.push(code),
			[],
			0,
			undefined,
			undefined,
			true,
			collector.sink,
		),
	).toThrow(message);
	expect(detailedBudget).toEqual(legacyBudget);
	expect(detailedIssues).toEqual(legacyIssues);
});
