import { expect, it } from "vitest";
import { parseCssImports } from "./css-imports.js";
import {
	type CssParseBudget,
	type CssRule,
	parseCssRules,
} from "./css-parser.js";

const discarded = "discarded-incomplete-css-rule";
const valid = "p { margin-bottom: 0em }";

function budget(overrides: Partial<CssParseBudget> = {}): CssParseBudget {
	return {
		rules: 0,
		declarations: 0,
		maxRules: 100,
		maxDeclarations: 100,
		...overrides,
	};
}

function parse(
	source: string,
	options: {
		topLevel?: boolean;
		depth?: number;
		media?: string[];
		budget?: CssParseBudget;
		resolveImport?: Parameters<typeof parseCssRules>[5];
	} = {},
) {
	const issues: string[] = [];
	const diagnostics: {
		issues: Readonly<Record<string, number>>;
		media: readonly string[];
	}[] = [];
	const counters = options.budget ?? budget();
	const rules = parseCssRules(
		source,
		counters,
		(code) => issues.push(code),
		options.media ?? [],
		options.depth ?? 0,
		options.resolveImport,
		(issues, media) => diagnostics.push({ issues, media }),
		options.topLevel,
	);
	return { rules, issues, diagnostics, budget: counters };
}

it.each([
	`<!--${valid}-->`,
	`--><!--<!--${valid}--><!-- -->`,
	`\ufeff \n/* before */<!--\t/* between */-->${valid}/* after */-->`,
])("ignores only stylesheet-boundary markers in %j", (source) => {
	const result = parse(source);
	expect(result.rules).toEqual(parse(valid).rules);
	expect(result.issues).toEqual([]);
	expect(result.budget).toMatchObject({ rules: 1, declarations: 1 });
});

it("does not spend rule or declaration budget on marker-only trivia", () => {
	const result = parse("\ufeff<!-- /**/ --> <!-- -->\n", {
		budget: budget({ maxRules: 0, maxDeclarations: 0 }),
	});
	expect(result.rules).toEqual([]);
	expect(result.issues).toEqual([]);
	expect(result.budget).toMatchObject({ rules: 0, declarations: 0 });
});

it.each([
	[
		'[data-marker="<!-- -->"] { --marker: "<!-- -->"; width: 12px }',
		'[data-marker="<!-- -->"]',
	],
	[
		"p/* <!-- --> */ { width: 12px; /* <!-- --> */ height: 8px }",
		"p/* <!-- --> */",
	],
	["p<!-- -->span { width: 12px }", "p<!-- -->span"],
])("preserves marker bytes away from boundaries in %j", (source, selector) => {
	const result = parse(source);
	expect(result.rules[0].selector).toBe(selector);
	expect(result.rules[0].declarations).toContainEqual({
		property: "width",
		value: "12px",
		important: false,
	});
	if (source.includes("--marker:"))
		expect(result.rules[0].declarations).toContainEqual({
			property: "--marker",
			value: '"<!-- -->"',
			important: false,
		});
	expect(result.issues).toEqual([]);
});

it("honors an explicit false final topLevel argument", () => {
	const result = parse(`<!--${valid}-->`, { topLevel: false });
	expect(result.rules[0].selector).toBe("<!--p");
	expect(result.issues).toEqual([discarded]);
	expect(parse(`<!--${valid}-->`, { topLevel: true }).issues).toEqual([]);
});

it.each(["@media screen", "@supports (display: block)"])(
	"does not ignore markers inside %s groups",
	(group) => {
		const result = parse(`${group} { <!--${valid}--> }`);
		expect(result.rules[0].selector).toBe("<!--p");
		expect(result.rules[0].media).toEqual(
			group.startsWith("@media") ? ["screen"] : [],
		);
		expect(result.issues).toEqual([discarded]);
	},
);

it("keeps inactive supports diagnostics suppressed without rewriting its markers", () => {
	const result = parse(`@supports (animation-name: spin) { <!--${valid}--> }`);
	expect(result.rules).toEqual([]);
	expect(result.issues).toEqual([]);
	expect(result.diagnostics).toEqual([]);
	expect(result.budget).toMatchObject({ rules: 2, declarations: 1 });
});

it("preserves the original call form without a diagnostic sink or topLevel argument", () => {
	const issues: string[] = [];
	const rules = parseCssRules(`<!--${valid}-->unfinished`, budget(), (code) =>
		issues.push(code),
	);
	expect(rules).toEqual(parse(valid).rules);
	expect(issues).toEqual([discarded]);
});

it("treats a newly imported sheet as top-level at nonzero depth", () => {
	const imported = `<!--${valid}-->`;
	const result = parse('@import "child.css";', {
		depth: 4,
		media: ["screen"],
		resolveImport(start, media, depth) {
			expect(start).toBe(0);
			expect(depth).toBe(4);
			const child = parse(imported, { depth: depth + 1, media: [...media] });
			expect(child.issues).toEqual([]);
			return child.rules;
		},
	});
	expect(result.rules).toEqual(parse(valid, { media: ["screen"] }).rules);
	expect(result.issues).toEqual([]);
});

it.each(["unfinished-selector", "<!-- https://fixture.invalid/trailing -->"])(
	"retains exact EOF evidence rather than treating %j as an HTML comment",
	(tail) => {
		const result = parse(`${valid}\n${tail}`);
		expect(result.rules).toEqual(parse(valid).rules);
		expect(result.issues).toEqual([discarded]);
		expect(result.diagnostics).toEqual([
			{ issues: { [discarded]: 1 }, media: [] },
		]);
	},
);

it.each([
	['p[title="unfinished', "unterminated-css-string"],
	["unfinished /* comment", "unterminated-css-comment"],
])("keeps lexical damage in %j non-advisory", (tail, lexical) => {
	const result = parse(`${valid}${tail}`);
	expect(result.issues).toContain(lexical);
	expect(result.issues).toContain("unimplemented-or-invalid-css-rule");
	expect(result.issues).not.toContain(discarded);
	expect(result.rules).toEqual(parse(valid).rules);
});

it.each([
	["unfinished;", "unimplemented-or-invalid-css-rule"],
	["unfinished}", "unimplemented-or-invalid-css-rule"],
	["@unknown;", "unimplemented-or-invalid-css-rule"],
	["@unknown", "unimplemented-or-invalid-css-rule"],
	["@unknown {}", "unimplemented-css-at-rule"],
])("does not reclassify non-EOF-qualified recovery in %j", (tail, issue) => {
	const result = parse(
		tail === "@unknown" ? `${valid}${tail}` : `${tail}${valid}`,
	);
	expect(result.issues).toEqual([issue]);
	expect(result.rules).toEqual(parse(valid).rules);
});

it("keeps a missing closing brace distinct from an incomplete EOF prelude", () => {
	const result = parse("<!--p { width: 12px");
	expect(result.issues).toEqual(["unterminated-css-rule"]);
	expect(result.rules[0].declarations[0].value).toBe("12px");
});

it("aligns exact import resolver offsets after repeated markers and trivia", () => {
	const prefix = '\ufeff<!-- -->@charset "UTF-8";\n/* first */<!--';
	const first = '@import "first.css";';
	const between = "\n-->/* second */<!--";
	const second = '@import "second.css" screen;';
	const source = `${prefix}${first}${between}${second}-->${valid}`;
	const imports = parseCssImports(source);
	expect(imports.issues).toEqual({});
	expect(imports.imports).toEqual([
		{
			start: prefix.length,
			end: prefix.length + first.length,
			url: "first.css",
			media: "",
		},
		{
			start: prefix.length + first.length + between.length,
			end: prefix.length + first.length + between.length + second.length,
			url: "second.css",
			media: "screen",
		},
	]);
	const offsets: number[] = [];
	const result = parse(source, {
		resolveImport(start) {
			offsets.push(start);
			expect(imports.imports.some((entry) => entry.start === start)).toBe(true);
			return [];
		},
	});
	expect(offsets).toEqual(imports.imports.map((entry) => entry.start));
	expect(
		imports.imports.map((entry) => source.slice(entry.start, entry.end)),
	).toEqual([first, second]);
	expect(result.issues).toEqual([]);
	expect(result.rules).toEqual(parse(valid).rules);
});

it("preserves trivia-inclusive resolver offsets when no markers occur", () => {
	const first = '\ufeff /* first */ @import "first.css";';
	const second = '\n/* second */ @import "second.css";';
	const source = first + second;
	const imports = parseCssImports(source);
	const offsets: number[] = [];
	parse(source, {
		resolveImport: (start) => {
			offsets.push(start);
			return [];
		},
	});
	expect(offsets).toEqual([0, first.length]);
	expect(imports.imports.map((entry) => entry.start)).toEqual(offsets);
	expect(
		imports.imports.map((entry) => source.slice(entry.start, entry.end)),
	).toEqual([first, second]);
});

it.each([valid, "@unknown;"])(
	"does not reopen import ordering after %j and boundary markers",
	(prior) => {
		const source = `<!--${prior}--><!--@import "late.css";-->`;
		const imports = parseCssImports(source);
		expect(imports.imports).toEqual([]);
		expect(imports.issues).toEqual({ "late-css-import": 1 });
		const result = parse(source, {
			resolveImport: (start) =>
				imports.imports.find((entry) => entry.start === start) ? [] : undefined,
		});
		expect(result.issues).toContain("css-import-not-loaded");
		expect(result.issues).not.toContain(discarded);
	},
);

it("does not expose marker-wrapped imports inside grouped rules", () => {
	const source = '@media screen { <!--@import "nested.css";--> }';
	expect(parseCssImports(source).imports).toEqual([]);
	const result = parse(source, {
		resolveImport: () => {
			throw new Error("Nested import resolved");
		},
	});
	expect(result.rules).toEqual([]);
	expect(result.issues).toContain("unimplemented-or-invalid-css-rule");
});

it("preserves source, imported rules and frozen diagnostic snapshots", () => {
	const source = '<!--@import "child.css";-->unfinished';
	const imported: CssRule[] = parse(valid).rules;
	const snapshot = structuredClone(imported);
	for (const rule of imported) {
		for (const declaration of rule.declarations) Object.freeze(declaration);
		Object.freeze(rule.declarations);
		Object.freeze(rule.media);
		Object.freeze(rule);
	}
	Object.freeze(imported);
	const media = ["screen"];
	const result = parse(source, { media, resolveImport: () => imported });
	expect(result.rules).toEqual(snapshot);
	expect(imported).toEqual(snapshot);
	expect(source).toBe('<!--@import "child.css";-->unfinished');
	expect(Object.isFrozen(result.diagnostics[0].issues)).toBe(true);
	expect(Object.isFrozen(result.diagnostics[0].media)).toBe(true);
	media.push("print");
	parse("another unfinished selector");
	expect(result.diagnostics).toEqual([
		{ issues: { [discarded]: 1 }, media: ["screen"] },
	]);
});

it.each(["maxRules", "maxDeclarations"] as const)(
	"does not bypass %s through marker wrapping",
	(limit) => {
		expect(() =>
			parse(`<!--${valid}--><!--${valid}-->`, {
				budget: budget({ [limit]: 1 }),
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("retains rule-depth bounds independently of top-level marker handling", () => {
	expect(parse(`<!--${valid}-->`, { depth: 16 }).issues).toEqual([]);
	expect(() => parse(`<!--${valid}-->`, { depth: 17 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		parse(`<!--${"@media screen {".repeat(17)}${valid}${"}".repeat(17)}-->`),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("retains component nesting bounds in marker-wrapped rules", () => {
	expect(() =>
		parse(`<!--p { --deep: ${"(".repeat(33)}x${")".repeat(33)} }-->`),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("charges import source, entry and work limits before ignoring markers", () => {
	const source = '<!--@import "first.css";--><!--@import "second.css";-->';
	for (const options of [
		{ maxCodeUnits: source.length - 1 },
		{ maxImports: 1 },
		{ maxWork: 1 },
	])
		expect(() => parseCssImports(source, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});
