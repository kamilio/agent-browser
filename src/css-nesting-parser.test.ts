import { expect, it } from "vitest";
import {
	parseCssRules,
	type CssParseBudget,
	type CssRule,
} from "./css-parser.js";

function parse(source: string, limits: Partial<CssParseBudget> = {}) {
	const budget = {
		rules: 0,
		declarations: 0,
		maxRules: 8192,
		maxDeclarations: 16384,
		...limits,
	};
	const raw: string[] = [];
	const global: {
		issues: Readonly<Record<string, number>>;
		media: readonly string[];
	}[] = [];
	const rules = parseCssRules(
		source,
		budget,
		(code) => raw.push(code),
		[],
		0,
		undefined,
		(issues, media) => global.push({ issues, media }),
	);
	return { rules, budget, raw, global };
}

function ancestry(rule: CssRule) {
	type Context = { selector: string; parent?: Context };
	const result: string[] = [];
	let context = (rule as CssRule & { nesting?: Context }).nesting;
	while (context) {
		expect(Object.isFrozen(context)).toBe(true);
		result.push(context.selector);
		context = context.parent;
	}
	return result;
}

it.each([
	"span",
	"> span",
	"+ span",
	"~ span",
	"&.active",
	"div&",
	"& > span",
	".host &",
	"&&",
	"& + &",
	":is(&,.other)",
	"[data-token='&']",
	"&::before",
])("retains native nesting context without expanding %s", (selector) => {
	const result = parse(`main, #other { ${selector} { color:red } }`);
	expect(result.raw).toEqual([]);
	expect(result.rules).toHaveLength(1);
	expect(result.rules[0].selector).toBe(selector);
	expect(ancestry(result.rules[0])).toEqual(["main, #other"]);
	expect(result.rules[0].declarations).toEqual([
		{ property: "color", value: "red", important: false },
	]);
	expect(result.budget).toMatchObject({ rules: 2, declarations: 1 });
});

it("keeps flat parsing shape, media identity and source declarations unchanged", () => {
	const result = parse("main { color:red; width:10px } aside{height:4px}");
	expect(result.rules).toEqual([
		{
			selector: "main",
			declarations: [
				{ property: "color", value: "red", important: false },
				{ property: "width", value: "10px", important: false },
			],
			media: [],
		},
		{
			selector: "aside",
			declarations: [{ property: "height", value: "4px", important: false }],
			media: [],
		},
	]);
	expect(result.rules.every((rule) => !("nesting" in rule))).toBe(true);
	expect(result.rules[0].media).toBe(result.rules[1].media);
});

it("preserves declaration runs before, between and after nested rules", () => {
	const result = parse(
		"main{color:red;.first{color:blue}color:green;.second{width:2px}height:3px}",
	);
	expect(result.raw).toEqual([]);
	expect(result.rules.map((rule) => rule.selector)).toEqual([
		"main",
		".first",
		"main",
		".second",
		"main",
	]);
	expect(result.rules.map(ancestry)).toEqual([[], ["main"], [], ["main"], []]);
	expect(
		result.rules.map((rule) => rule.declarations.map((entry) => entry.value)),
	).toEqual([["red"], ["blue"], ["green"], ["2px"], ["3px"]]);
});

it("keeps three Python-style nested border rules separate from their parent", () => {
	const result = parse(
		"div.body{.good pre{border-left:3px solid var(--good-border)}.bad pre{border-left:3px solid var(--bad-border)}.maybe pre{border-left:3px solid var(--middle-border)}}",
	);
	expect(result.raw).toEqual([]);
	expect(result.rules.map((rule) => rule.selector)).toEqual([
		".good pre",
		".bad pre",
		".maybe pre",
	]);
	expect(result.rules.map(ancestry)).toEqual([
		["div.body"],
		["div.body"],
		["div.body"],
	]);
	expect(result.rules.every((rule) => rule.declarations.length === 3)).toBe(
		true,
	);
	expect(
		result.rules
			.flatMap((rule) => rule.declarations)
			.every((entry) => entry.substitution === "border-left"),
	).toBe(true);
});

it("shares immutable parent context across siblings and retains deeper context chains", () => {
	const result = parse("main{.first{.leaf{width:1px}}.second{height:2px}}");
	expect(result.raw).toEqual([]);
	expect(result.rules.map(ancestry)).toEqual([[".first", "main"], ["main"]]);
	const first = result.rules[0] as CssRule & { nesting: { parent: unknown } };
	const second = result.rules[1] as CssRule & { nesting: unknown };
	expect(first.nesting.parent).toBe(second.nesting);
});

it.each([
	"--data:{first:red;second:{value:blue}};",
	"--data:one {first:red} two {second:blue};",
	"--data:'{not-a-rule}';",
	"--data:func({first:red;second:blue});",
])(
	"does not reinterpret custom-property component blocks as nesting: %s",
	(declaration) => {
		const result = parse(`main{${declaration}.child{width:2px}color:red}`);
		expect(result.raw).toEqual([]);
		expect(result.rules.map((rule) => rule.selector)).toEqual([
			"main",
			".child",
			"main",
		]);
		expect(result.rules[0].declarations[0].property).toBe("--data");
		expect(result.budget.rules).toBe(2);
	},
);

it("keeps comments, quoted braces and semicolons inside declarations", () => {
	const result = parse(
		'main{content:"{a;b}";/* a{broken} */ .child/* } */{color:red}width:4px}',
	);
	expect(result.raw).toEqual([]);
	expect(result.rules[0].declarations[0].value).toBe('"{a;b}"');
	expect(result.rules[1].selector).toBe(".child/* } */");
	expect(result.rules[2].declarations[0].value).toBe("4px");
});

it("retains parent selectors rather than ampersand wrappers for conditional declaration runs", () => {
	const result = parse(
		"main::before{content:'x';@media screen{color:red;.child{width:1px}height:2px}color:blue}",
	);
	expect(result.raw).toEqual([]);
	expect(
		result.rules.map((rule) => [rule.selector, rule.media, ancestry(rule)]),
	).toEqual([
		["main::before", [], []],
		["main::before", ["screen"], []],
		[".child", ["screen"], ["main::before"]],
		["main::before", ["screen"], []],
		["main::before", [], []],
	]);
});

it("combines outer and nested media while preserving the nearest style context", () => {
	const result = parse(
		"@media screen{main{.child{@media (min-width:1px){color:red;& > span{width:2px}}}}}",
	);
	expect(result.raw).toEqual([]);
	expect(result.rules.map((rule) => rule.media)).toEqual([
		["screen", "(min-width:1px)"],
		["screen", "(min-width:1px)"],
	]);
	expect(result.rules.map(ancestry)).toEqual([["main"], [".child", "main"]]);
});

it("applies active supports and charges but does not emit inactive nested rules", () => {
	const result = parse(
		"main{@supports (color:red){color:blue;.child{width:1px}}@supports (not-native:yes){unknown:bad;.other{height:2px}}height:3px}",
	);
	expect(result.raw).toEqual([]);
	expect(result.rules.map((rule) => rule.selector)).toEqual([
		"main",
		".child",
		"main",
	]);
	expect(result.budget).toMatchObject({ rules: 5, declarations: 5 });
});

it.each(["&div", ".good, ???", ">", ".child > > span"])(
	"discards invalid nested selector %s without losing the parent",
	(selector) => {
		const result = parse(
			`main{color:red;${selector}{height:99px;.deep{width:8px}}width:3px}`,
		);
		expect(result.raw).toContain("discarded-invalid-nested-css-rule");
		expect(
			result.rules
				.flatMap((rule) => rule.declarations)
				.map((entry) => entry.value),
		).toEqual(["red", "3px"]);
		expect(result.budget.declarations).toBe(4);
	},
);

it("keeps unsupported native nested selectors explicit when applicability is unknown", () => {
	const result = parse("main{:not-native{color:red}width:3px}");
	expect(result.raw).toEqual(["unimplemented-nested-css-selector"]);
	expect(result.global).toEqual([
		{
			issues: { "unimplemented-nested-css-selector": 1 },
			media: [],
		},
	]);
	expect(result.rules).toHaveLength(1);
	expect(result.rules[0].declarations[0].value).toBe("3px");
});

it("keeps unknown nesting applicability guarded within the actual media context", () => {
	const result = parse(".missing{@media print{:not(&):lang(en){color:red}}}");
	expect(result.rules).toEqual([]);
	expect(result.global).toEqual([
		{
			issues: { "unimplemented-nested-css-selector": 1 },
			media: ["print"],
		},
	]);
});

it("keeps unsupported grouping rules conservative when their children can escape the parent", () => {
	const result = parse(
		".missing{@media print{@layer theme{:not(&){color:red}}}}",
	);
	expect(result.rules).toEqual([]);
	expect(result.global).toEqual([
		{
			issues: { "unimplemented-css-at-rule": 1 },
			media: ["print"],
		},
	]);
});

it("does not leak unknown nested selectors out of discarded or inactive rules", () => {
	const result = parse(
		"main{&div{:not(&):lang(en){color:red}}@supports (width:invalid){:not(&):lang(en){color:blue}}width:2px}",
	);
	expect(result.raw).toEqual(["discarded-invalid-nested-css-rule"]);
	expect(result.global).toEqual([]);
	expect(
		result.rules
			.flatMap((rule) => rule.declarations)
			.map((entry) => entry.value),
	).toEqual(["2px"]);
});

it("keeps unsupported nested grouping rules and imports guarded without fetching", () => {
	const result = parse(
		"main{@layer components{color:red}@scope (.a){color:blue}@import 'other.css';width:2px}",
	);
	expect(result.raw).toEqual([
		"unimplemented-css-at-rule",
		"unimplemented-css-at-rule",
		"unimplemented-css-at-rule",
	]);
	expect(result.rules.flatMap((rule) => rule.declarations)).toEqual([
		{ property: "width", value: "2px", important: false },
	]);
});

it("keeps declaration issue ownership on each ordered run", () => {
	const result = parse("main{unknown-a:x;.child{unknown-b:y}unknown-c:z}");
	expect(result.raw).toEqual(Array(3).fill("unimplemented-css-property"));
	expect(result.rules.map((rule) => rule.selector)).toEqual([
		"main",
		".child",
		"main",
	]);
	expect(result.rules.map((rule) => rule.issues)).toEqual(
		Array(3).fill({ "unimplemented-css-property": 1 }),
	);
	expect(result.rules.every((rule) => Object.isFrozen(rule.issues))).toBe(true);
});

it.each([
	"main{color:red;.child{color:blue}}",
	"main{@supports (not-native:yes){color:red;.child{color:blue}}}",
	"main{&div{color:red;.child{color:blue}}}",
])(
	"does not bypass declaration quotas in parsed, inactive or discarded content: %s",
	(source) => {
		expect(() => parse(source, { maxDeclarations: 1 })).toThrow(
			/declaration limit/,
		);
	},
);

it("charges nested style and grouping rules against the shared rule quota", () => {
	expect(() =>
		parse("main{.child{@media screen{height:1px}}}", { maxRules: 2 }),
	).toThrow(/rule limit/);
});

it("bounds nesting depth including inactive conditional groups", () => {
	const source = `main{${"@supports (not-native:yes){".repeat(17)}color:red;${"}".repeat(18)}`;
	expect(() => parse(source)).toThrow(/nesting limit/);
});

it("does not create placeholder parent rules in the legacy no-sink profile", () => {
	const raw: string[] = [];
	const rules = parseCssRules(
		"main{&div{height:9px}.child{width:3px}}",
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
		(code) => raw.push(code),
	);
	expect(raw).toEqual(["discarded-invalid-nested-css-rule"]);
	expect(rules.map((rule) => rule.selector)).toEqual([".child"]);
});
