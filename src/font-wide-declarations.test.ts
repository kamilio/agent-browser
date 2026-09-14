import { expect, it } from "vitest";
import type { CssDiagnosticContext } from "./css-diagnostics.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
	parseCssRules,
} from "./css-parser.js";
import { cssTextProperties, initialTextStyle } from "./css-text.js";
import { parseVariableValue, substituteVariables } from "./css-variables.js";

const fontProperties = [
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"line-height",
] as const;

function expanded(value: string, important = false) {
	return fontProperties.map((property) => ({ property, value, important }));
}

function declarations(source: string, maxDeclarations = 256) {
	const issues: string[] = [];
	const diagnostics: { code: string; context?: CssDiagnosticContext }[] = [];
	const budget = { rules: 0, declarations: 0, maxRules: 32, maxDeclarations };
	const parsed = parseCssDeclarations(
		source,
		budget,
		(code) => issues.push(code),
		(code, context) => {
			diagnostics.push({ code, context });
			return undefined;
		},
	);
	return { parsed, issues, diagnostics, budget };
}

function substitute(source: string, bindings: Record<string, string>) {
	const parsed = parseVariableValue(source);
	if (!parsed) throw new Error(`Invalid variable fixture: ${source}`);
	return substituteVariables(
		parsed,
		(name) => bindings[name] ?? null,
		() => {},
	);
}

it.each(["initial", "inherit", "unset", "revert"])(
	"expands font:%s into exactly five ordered native components",
	(value) => {
		const result = declarations(`font:${value}`);
		expect(result.parsed).toEqual(expanded(value));
		expect(result.parsed).toHaveLength(5);
		expect(result.issues).toEqual([]);
		expect(result.diagnostics).toEqual([]);
		expect(cssSupportsDeclaration("font", value)).toBe(true);
		expect(cssSupportsCondition(`(font:${value})`)).toBe(true);
	},
);

it.each([
	["FoNt: InHeRiT", "inherit", false],
	["FONT:\t\n\f\r INITIAL \t", "initial", false],
	["font:/*before*/UnSeT/*after*/ ! /*priority*/ IMPORTANT", "unset", true],
	["/*property*/ FONT /*colon*/: ReVeRt !important;", "revert", true],
] as const)("normalizes font declaration %s", (source, value, important) => {
	const result = declarations(source);
	expect(result.parsed).toEqual(expanded(value, important));
	expect(result.issues).toEqual([]);
});

it.each([
	"var(--Font)",
	"var(--Font, InHeRiT)",
	"var(--Missing, var(--Font, UNSET))",
	"var(--Font, italic 16px monospace)",
	"var(--Font,)",
	"/*keep*/ var(--Font, /*fallback*/ ReVeRt) /*end*/",
	"var(--Font) 16px monospace",
])("preserves pending font source and importance for %s", (value) => {
	const result = declarations(`FONT:${value}!important`);
	expect(result.parsed).toEqual(
		expanded(value, true).map((entry) => ({ ...entry, substitution: "font" })),
	);
	expect(result.parsed).toHaveLength(5);
	expect(result.issues).toEqual([]);
	expect(cssSupportsDeclaration("font", value)).toBe(true);
});

it.each([
	["var(--Font)", "INHERIT", "inherit"],
	["var(--Font, initial)", null, "initial"],
	["var(--Font, UNSET)", "ReVeRt", "revert"],
	["var(--Missing, var(--Font, revert))", null, "revert"],
	["var(--Missing, var(--Font, revert))", "INITIAL", "initial"],
	["var(--Font, /*fallback*/ INHERIT)", null, "inherit"],
] as const)(
	"reparses substituted wide font value %s with binding %s",
	(source, binding, expected) => {
		const bindings: Record<string, string> = {};
		if (binding !== null) bindings["--Font"] = binding;
		const value = substitute(source, bindings);
		expect(value).not.toBeNull();
		const result = declarations(`font:${value}`);
		expect(result.parsed).toEqual(expanded(expected));
		expect(result.issues).toEqual([]);
	},
);

it.each(["italic 16px monospace", "caption", "revert-layer", "inherit normal"])(
	"defers unsupported font value %s until substitution",
	(value) => {
		const source = `var(--Font, ${value})`;
		expect(declarations(`font:${source}`).parsed).toHaveLength(5);
		expect(cssSupportsDeclaration("font", source)).toBe(true);
		for (const resolved of [
			substitute(source, {}),
			substitute(source, { "--Font": value }),
		]) {
			expect(resolved).toBe(value);
			const result = declarations(`font:${resolved}`);
			expect(result.parsed).toEqual([]);
			expect(result.issues).toEqual(["unimplemented-or-invalid-css-value"]);
			expect(result.diagnostics[0]?.context?.property).toBe("font");
		}
	},
);

it("keeps custom property names case-sensitive through font substitution", () => {
	const bindings = { "--Font": "inherit" };
	expect(substitute("var(--Font)", bindings)).toBe("inherit");
	expect(substitute("var(--font, initial)", bindings)).toBe("initial");
	expect(substitute("var(--font)", bindings)).toBeNull();
	expect(declarations("font:var(--font)").parsed).toHaveLength(5);
});

it.each([
	"var()",
	"var( )",
	"var(/*empty*/)",
	"var(, initial)",
	"var(--Font, !important)",
])("rejects malformed font variable syntax %s", (value) => {
	const result = declarations(`font:${value}`);
	expect(result.parsed).toEqual([]);
	expect(result.issues).toEqual(["unimplemented-or-invalid-css-value"]);
	expect(cssSupportsDeclaration("font", value)).toBe(false);
});

it.each([
	["(FoNt: INHERIT)", true],
	["(font: /*wide*/ unset)", true],
	["not (font:initial)", false],
	["not (font:caption)", true],
	["(font:initial) and (font-weight:bold)", true],
	["(font:initial) and (font:caption)", false],
	["(font:caption) or (font:revert)", true],
	["(font:var(--Font, caption))", true],
	["(font:revert-layer)", false],
	["(font-synthesis:none) or (font:caption)", false],
] as const)("evaluates CSS.supports condition %s", (condition, supported) => {
	expect(cssSupportsCondition(condition)).toBe(supported);
});

it("permits bare font declarations only in the feature-query overload", () => {
	expect(cssSupportsCondition("font:initial")).toBe(false);
	expect(cssSupportsCondition("font:initial", true)).toBe(true);
});

it("shares conditional stylesheet admission with native font support queries", () => {
	const issues: string[] = [];
	const rules = parseCssRules(
		"@supports(font:initial){.wide{font:inherit!important}}" +
			"@supports(font:caption){.system{font:caption}}" +
			"@supports not (font:caption){.fallback{font:unset}}",
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 32 },
		(code) => issues.push(code),
	);
	expect(rules.map((rule) => rule.selector)).toEqual([".wide", ".fallback"]);
	expect(rules.map((rule) => rule.declarations)).toEqual([
		expanded("inherit", true),
		expanded("unset"),
	]);
	expect(issues).toEqual([]);
});

it.each([
	"",
	"normal",
	"none",
	"auto",
	"0",
	"16px",
	"serif",
	"italic 16px monospace",
	"16px/1.5 serif",
	"bold 12pt Arial",
	"caption",
	"icon",
	"menu",
	"message-box",
	"small-caption",
	"status-bar",
	"initial inherit",
	"inherit normal",
	"unset, revert",
	'"initial"',
	"in/*split*/herit",
	"revert-layer",
])("attributes rejected font value %s to the shorthand", (value) => {
	const result = declarations(`FoNt: ${value} !important`);
	expect(result.parsed).toEqual([]);
	expect(result.issues).toEqual(["unimplemented-or-invalid-css-value"]);
	expect(result.diagnostics).toEqual([
		{
			code: "unimplemented-or-invalid-css-value",
			context: {
				authoredProperty: "FoNt",
				property: "font",
				value: `${value} !important`.trim(),
				important: true,
			},
		},
	]);
	expect(cssSupportsDeclaration("font", value)).toBe(false);
	expect(cssSupportsCondition(`(font:${value})`)).toBe(false);
});

it.each([
	"font-stretch",
	"font-variant",
	"font-variant-caps",
	"font-size-adjust",
	"font-kerning",
	"font-feature-settings",
	"font-synthesis",
	"font-synthesis-style",
])("keeps unsupported font property %s unknown", (property) => {
	const result = declarations(`${property}:initial`);
	expect(result.parsed).toEqual([]);
	expect(result.issues).toEqual(["unimplemented-css-property"]);
	expect(result.diagnostics[0]?.context?.property).toBe(property);
	expect(cssSupportsDeclaration(property, "initial")).toBe(false);
});

it.each([
	["font-family", "monospace", "monospace"],
	["font-size", "MEDIUM", "16px"],
	["font-style", "ITALIC", "italic"],
	["font-weight", "BOLD", "bold"],
	["line-height", "1.50", "1.5"],
] as const)("preserves canonical longhand %s", (property, source, value) => {
	const result = declarations(`${property}:${source}`);
	expect(result.parsed).toEqual([{ property, value, important: false }]);
	expect(result.issues).toEqual([]);
});

it("does not add font or unsupported components to the native text style", () => {
	expect(cssTextProperties).not.toContain("font");
	expect(initialTextStyle).not.toHaveProperty("font");
	expect(
		declarations("font:initial").parsed.map((entry) => entry.property),
	).toEqual(fontProperties);
});

it.each(["initial", "var(--Font, inherit)"])(
	"charges one authored declaration for five font components from %s",
	(value) => {
		const result = declarations(`font:${value}`, 1);
		expect(result.parsed).toHaveLength(5);
		expect(result.budget.declarations).toBe(1);
		expect(result.issues).toEqual([]);
	},
);

it("counts following declarations separately from font expansion", () => {
	const source = "font:initial;font-style:italic";
	const result = declarations(source, 2);
	expect(result.parsed).toHaveLength(6);
	expect(result.budget.declarations).toBe(2);
	expect(() => declarations(source, 1)).toThrow(
		"CSS declaration limit exceeded",
	);
	expect(() => declarations("font:initial", 0)).toThrow(
		"CSS declaration limit exceeded",
	);
});

it("charges rejected font declarations without manufacturing components", () => {
	const result = declarations("font:caption;font:inherit", 2);
	expect(result.parsed).toEqual(expanded("inherit"));
	expect(result.budget.declarations).toBe(2);
	expect(result.issues).toEqual(["unimplemented-or-invalid-css-value"]);
	expect(() => declarations("font:caption;font:inherit", 1)).toThrow(
		"CSS declaration limit exceeded",
	);
});

it.each(["", "!important"])(
	"preserves all expansion and authored order around font with priority %s",
	(priority) => {
		const all = declarations(`all:unset${priority}`).parsed;
		const font = expanded("inherit", priority !== "");
		const isFont = (property: string) =>
			(fontProperties as readonly string[]).includes(property);
		expect(all.filter((entry) => isFont(entry.property))).toEqual(
			expanded("unset", priority !== ""),
		);
		for (const [source, expected] of [
			[`all:unset${priority};font:inherit${priority}`, [...all, ...font]],
			[`font:inherit${priority};all:unset${priority}`, [...font, ...all]],
		] as const) {
			const result = declarations(source, 2);
			expect(result.parsed).toEqual(expected);
			expect(result.parsed).toHaveLength(all.length + 5);
			expect(result.parsed.filter((entry) => !isFont(entry.property))).toEqual(
				all.filter((entry) => !isFont(entry.property)),
			);
			expect(result.budget.declarations).toBe(2);
			expect(result.issues).toEqual([]);
		}
	},
);

it("retains surrounding longhands and pending font components in source order", () => {
	const result = declarations(
		"font-weight:bold!important;font:var(--Font);font-style:italic",
		3,
	);
	expect(result.parsed).toEqual([
		{ property: "font-weight", value: "bold", important: true },
		...expanded("var(--Font)").map((entry) => ({
			...entry,
			substitution: "font",
		})),
		{ property: "font-style", value: "italic", important: false },
	]);
	expect(result.issues).toEqual([]);
});
