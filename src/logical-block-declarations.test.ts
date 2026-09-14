import { afterEach, expect, it } from "vitest";
import { parseBoxDeclarations } from "./css-box.js";
import {
	expandDeclaration,
	inlineDeclarationComponents,
	parseInlineDeclarations,
	propertyPriority,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import {
	cssLogicalBlockProperties,
	logicalBlockComponents,
	logicalBlockPhysicalProperty,
	parseLogicalBlockDeclarations,
} from "./css-logical-box.js";
import { cssMathLimits } from "./css-math.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import { parseVariableValue, substituteVariables } from "./css-variables.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	marginBlock: string;
	marginBlockStart: string;
	marginBlockEnd: string;
	paddingBlock: string;
	paddingBlockStart: string;
	paddingBlockEnd: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: unknown, priority?: unknown): void;
	removeProperty(name: string): string;
}

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(source = "", maxDeclarations = 1024) {
	const tree = parseHtmlDocument(
		'<div id="target">Text</div>',
		"https://fixture.invalid/logical-block-declarations",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	queries.close();
	if (id === null) throw new Error("Missing logical block target");
	tree.setAttribute(id, "style", source);
	const owner = new InlineStyles(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const target = Object.create(null);
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(target, name, descriptor);
				for (const [name, value] of Object.entries(definition.methods ?? {}))
					Object.defineProperty(target, name, { value });
				return target;
			},
		},
		{ maxDeclarations },
	);
	return { tree, id, style: owner.get(id) as Style };
}

function sheet(source: string, maxDeclarations = 256) {
	const issues: string[] = [];
	const budget = { rules: 0, declarations: 0, maxRules: 1, maxDeclarations };
	const declarations = parseCssDeclarations(source, budget, (issue) =>
		issues.push(issue),
	);
	return { declarations, issues, budget };
}

function declarationState(source: string) {
	return Object.fromEntries(
		parseInlineDeclarations(source, 1024).map((entry) => [entry.name, entry]),
	);
}

it("exports distinct logical pairs and the native horizontal-tb mapping", () => {
	expect(cssLogicalBlockProperties).toEqual([
		"margin-block-start",
		"margin-block-end",
		"padding-block-start",
		"padding-block-end",
	]);
	expect(logicalBlockComponents("margin-block")).toEqual([
		"margin-block-start",
		"margin-block-end",
	]);
	expect(logicalBlockComponents("padding-block")).toEqual([
		"padding-block-start",
		"padding-block-end",
	]);
	expect(cssLogicalBlockProperties.map(logicalBlockPhysicalProperty)).toEqual([
		"margin-top",
		"margin-bottom",
		"padding-top",
		"padding-bottom",
	]);
	for (const name of ["margin", "padding", "margin-inline", "writing-mode"]) {
		expect(logicalBlockComponents(name)).toBeUndefined();
		expect(logicalBlockPhysicalProperty(name)).toBeUndefined();
		expect(parseLogicalBlockDeclarations(name, "1px")).toBeUndefined();
	}
});

it.each([
	["margin-block", "0", "0px", "0px"],
	["margin-block", "-2px auto", "-2px", "auto"],
	["margin-block", "2em 3rem", "2em", "3rem"],
	["margin-block", "1e2px -5%", "100px", "-5%"],
	["padding-block", "4ex", "4ex", "4ex"],
	["padding-block", "2px 5%", "2px", "5%"],
] as const)(
	"expands %s:%s into logical longhands only",
	(name, value, start, end) => {
		const components = [`${name}-start`, `${name}-end`];
		const expected = components.map((property, index) => ({
			property,
			value: index === 0 ? start : end,
			important: true,
		}));
		expect(sheet(`${name}:${value}!important`)).toMatchObject({
			declarations: expected,
			issues: [],
		});
		expect(parseInlineDeclarations(`${name}:${value}!important`, 2)).toEqual(
			expected.map(({ property, ...entry }) => ({ name: property, ...entry })),
		);
		expect(inlineDeclarationComponents(name)).toEqual(components);
		expect(cssSupportsDeclaration(name, value)).toBe(true);
		expect(cssSupportsCondition(`(${name}:${value})`)).toBe(true);
	},
);

it.each(cssLogicalBlockProperties)(
	"reuses physical length parsing for %s",
	(name) => {
		const physical = logicalBlockPhysicalProperty(name);
		if (!physical) throw new Error("Missing logical block physical property");
		for (const value of [
			"0",
			"2em",
			"3rem",
			"4ex",
			"5%",
			"1e2px",
			"calc(10px + 2%)",
			"min(2em, 30px)",
			"calc(0px - 1px)",
			"inherit",
		]) {
			const expected = parseBoxDeclarations(physical, value)?.map((entry) => ({
				property: name,
				value: entry.value,
			}));
			expect(expected).toHaveLength(1);
			expect(parseLogicalBlockDeclarations(name, value)).toEqual(expected);
			expect(sheet(`${name}:${value}`).declarations).toEqual(
				expected?.map((entry) => ({ ...entry, important: false })),
			);
			expect(expandDeclaration(name, value, false)).toEqual(
				expected?.map((entry) => ({
					name: entry.property,
					value: entry.value,
					important: false,
				})),
			);
		}
	},
);

it.each(["margin-block", "padding-block"])(
	"normalizes case, comments, CSS-wide values and math in %s",
	(name) => {
		for (const value of ["initial", "inherit", "unset", "revert"]) {
			const source = `${name.toUpperCase()}:/*before*/ ${value.toUpperCase()} /*after*/ ! IMPORTANT`;
			const entries = parseInlineDeclarations(source, 2);
			expect(sheet(source).issues).toEqual([]);
			expect(sheet(source).declarations).toEqual(
				[`${name}-start`, `${name}-end`].map((property) => ({
					property,
					value,
					important: true,
				})),
			);
			expect(propertyValue(entries, name)).toBe(value);
			expect(propertyPriority(entries, name)).toBe("important");
		}
		const value = "calc(10px + 2%) min(2em, 30px)";
		expect(sheet(`${name}:${value}`).declarations).toHaveLength(2);
		expect(expandDeclaration(name, value, false)).toHaveLength(2);
	},
);

it.each([
	["margin-block", ""],
	["margin-block", "1px 2px 3px"],
	["padding-block", "1px 2px 3px 4px"],
	["margin-block", "inherit 1px"],
	["padding-block", "1px unset"],
	["margin-block", "initial initial"],
	["margin-block", "revert-layer"],
	["margin-block", "1px / 2px"],
	["margin-block", "1px, 2px"],
	["margin-block", "2"],
	["margin-block", "1ch"],
	["margin-block", "none"],
	["padding-block", "-1px"],
	["padding-block", "1px -2%"],
	["padding-block", "auto"],
	["padding-block-start", "auto"],
	["padding-block-end", "-2px"],
	["margin-block-start", "1px 2px"],
	["margin-block-end", "calc(1px + )"],
	["padding-block", "calc(1px + 2px"],
	["margin-block", "var()"],
	["padding-block", "var(, 1px)"],
] as const)("rejects invalid or unsupported %s:%s", (name, value) => {
	expect(sheet(`${name}:${value}`)).toMatchObject({
		declarations: [],
		issues: ["unimplemented-or-invalid-css-value"],
	});
	expect(expandDeclaration(name, value, false)).toEqual([]);
	expect(cssSupportsDeclaration(name, value)).toBe(false);
});

it.each(["margin-block", "padding-block"])(
	"serializes compact values and respects incomplete or mixed-priority %s",
	(name) => {
		for (const value of ["2px", "2px 3px", "inherit"]) {
			const entries = parseInlineDeclarations(`${name}:${value}!important`, 2);
			expect(propertyValue(entries, name)).toBe(value);
			expect(serializeDeclarations(entries)).toBe(
				`${name}: ${value} !important;`,
			);
			expect(propertyValue(entries.slice(0, 1), name)).toBe("");
		}
		for (const source of [
			`${name}-start:2px!important;${name}-end:3px`,
			`${name}-start:initial;${name}-end:inherit`,
			`${name}-start:initial;${name}-end:2px`,
		]) {
			const entries = parseInlineDeclarations(source, 2);
			expect(propertyValue(entries, name)).toBe("");
			expect(propertyPriority(entries, name)).toBe("");
			expect(declarationState(serializeDeclarations(entries))).toEqual(
				declarationState(source),
			);
		}
	},
);

it("supports direct camelCase assignment and shorthand set/get/remove", () => {
	const { style } = fixture("color:red");
	style.marginBlock = "-2px auto";
	expect(style.marginBlockStart).toBe("-2px");
	expect(style.marginBlockEnd).toBe("auto");
	style.marginBlockStart = "4px";
	style.marginBlockEnd = "5px";
	expect(style.marginBlock).toBe("4px 5px");
	style.paddingBlock = "2px";
	style.paddingBlockStart = "3px";
	style.paddingBlockEnd = "4px";
	expect(style.paddingBlock).toBe("3px 4px");
	style.setProperty("MARGIN-BLOCK", "7px 8px", "IMPORTANT");
	expect(style.getPropertyValue("margin-block")).toBe("7px 8px");
	expect(style.getPropertyPriority("margin-block-start")).toBe("important");
	expect(style.getPropertyPriority("margin-block-end")).toBe("important");
	expect(style.removeProperty("margin-block")).toBe("7px 8px");
	expect(style.marginBlockStart).toBe("");
	expect(style.marginBlockEnd).toBe("");
	style.paddingBlock = "";
	expect(style.paddingBlockStart).toBe("");
	expect(style.paddingBlockEnd).toBe("");
	expect(style.getPropertyValue("color")).toBe("red");
});

it("preserves priority on parse but replaces priority on direct assignment", () => {
	const { style } = fixture(
		"margin-block:2px 3px!important;margin-block-start:9px",
	);
	expect(style.marginBlock).toBe("2px 3px");
	expect(style.getPropertyPriority("margin-block")).toBe("important");
	style.marginBlockStart = "9px";
	expect(style.marginBlock).toBe("");
	expect(style.getPropertyPriority("margin-block-start")).toBe("");
	expect(style.getPropertyPriority("margin-block-end")).toBe("important");
	style.marginBlock = "4px";
	expect(style.marginBlock).toBe("4px");
	expect(style.getPropertyPriority("margin-block-end")).toBe("");
});

it("leaves declarations untouched after invalid CSSOM assignments", () => {
	const { style } = fixture("margin-block:2px 3px;padding-block:4px");
	const before = style.cssText;
	style.marginBlock = "1px 2px 3px";
	style.paddingBlock = "-1px";
	style.paddingBlockEnd = "auto";
	style.setProperty("margin-block", "5px", "invalid");
	style.setProperty("margin-block", "5px!important");
	expect(style.cssText).toBe(before);
});

it.each(["margin", "padding"])(
	"keeps %s physical and logical CSSOM declarations independent",
	(name) => {
		const { style } = fixture(`${name}:1px;${name}-block:2px 3px`);
		style.setProperty(name, "4px");
		expect(style.getPropertyValue(`${name}-block`)).toBe("2px 3px");
		expect(style.removeProperty(name)).toBe("4px");
		expect(style.getPropertyValue(`${name}-block`)).toBe("2px 3px");
		style.setProperty(`${name}-top`, "5px");
		style.setProperty(`${name}-block`, "6px");
		expect(style.getPropertyValue(`${name}-top`)).toBe("5px");
		expect(style.removeProperty(`${name}-block`)).toBe("6px");
		expect(style.getPropertyValue(`${name}-top`)).toBe("5px");
		expect(style.getPropertyValue(`${name}-block-start`)).toBe("");
		style.setProperty(`${name}-block`, "7px 8px");
		expect(style.removeProperty(`${name}-block-start`)).toBe("7px");
		expect(style.getPropertyValue(`${name}-block-end`)).toBe("8px");
		expect(style.getPropertyValue(`${name}-top`)).toBe("5px");
	},
);

it.each(["margin-block", "padding-block"])(
	"retains pending source, components and priorities for %s",
	(name) => {
		const value = "var(--Space, var(--Fallback, 2px 3px))";
		expect(sheet(`${name}:${value}!important`).declarations).toEqual(
			[`${name}-start`, `${name}-end`].map((property) => ({
				property,
				value,
				important: true,
				substitution: name,
			})),
		);
		const { style } = fixture(`${name}:${value}!important;--Space:4px 5px`);
		expect(style.getPropertyValue(name)).toBe(value);
		expect(style.getPropertyValue(`${name}-start`)).toBe("");
		expect(style.getPropertyPriority(name)).toBe("important");
		expect(style.removeProperty(name)).toBe(value);
		expect(style.getPropertyValue(`${name}-end`)).toBe("");
		expect(style.getPropertyValue("--Space")).toBe("4px 5px");
	},
);

it.each(cssLogicalBlockProperties)(
	"retains pending longhand values for %s",
	(name) => {
		const value = "var(--Space, 2px)";
		expect(sheet(`${name}:${value}`).declarations).toEqual([
			{ property: name, value, important: false, substitution: name },
		]);
		const entries = parseInlineDeclarations(`${name}:${value}`, 1);
		expect(entries).toEqual([{ name, value, important: false }]);
		expect(propertyValue(entries, name)).toBe(value);
		expect(parseInlineDeclarations(serializeDeclarations(entries), 1)).toEqual(
			entries,
		);
	},
);

it.each([
	["margin-block", "-2px auto", 2],
	["padding-block", "2px 3px", 2],
	["padding-block", "-2px", 0],
	["padding-block", "auto", 0],
	["margin-block", "1px 2px 3px", 0],
	["margin-block", "inherit 2px", 0],
] as const)("revalidates %s after substituting %s", (name, value, count) => {
	const source = `var(--Space, ${value})`;
	expect(sheet(`${name}:${source}`).declarations).toHaveLength(2);
	const parsed = parseVariableValue(source);
	if (!parsed) throw new Error("Invalid logical block variable fixture");
	const resolved = substituteVariables(
		parsed,
		() => null,
		() => {},
	);
	expect(resolved).toBe(value);
	expect(sheet(`${name}:${resolved}`).declarations).toHaveLength(count);
	expect(expandDeclaration(name, resolved ?? "", false)).toHaveLength(count);
});

it.each([
	"margin-block:var(--Space);margin-block-end:9px",
	"margin-block-start:9px!important;margin-block:var(--Space)",
	"padding-block:var(--Space)!important;padding-block-end:9px!important",
	"all:var(--Reset);margin-block:var(--Space);margin-block-end:9px",
	"all:var(--Reset)!important;padding-block:var(--Space)!important;padding-block-start:9px!important",
	"margin:var(--Physical);margin-block:var(--Logical);margin-left:9px",
])(
	"round trips pending declarations without losing components: %s",
	(source) => {
		const entries = parseInlineDeclarations(source, 1024);
		const expected = declarationState(source);
		expect(declarationState(serializeDeclarations(entries))).toEqual(expected);
		const { style } = fixture(source);
		style.cssText = style.cssText;
		expect(declarationState(style.cssText)).toEqual(expected);
	},
);

it("includes all four logical longhands in literal and pending all resets", () => {
	for (const value of [
		"initial",
		"inherit",
		"unset",
		"revert",
		"var(--Reset)",
	]) {
		const declarations = sheet(`all:${value}!important`).declarations;
		for (const property of cssLogicalBlockProperties) {
			expect(inlineDeclarationComponents("all")).toContain(property);
			expect(
				declarations.filter((entry) => String(entry.property) === property),
			).toEqual([
				{
					property,
					value,
					important: true,
					...(value.startsWith("var(") ? { substitution: "all" } : {}),
				},
			]);
		}
	}
	const { style } = fixture("margin-block:2px;padding-block:3px;--Space:4px");
	style.setProperty("all", "initial");
	for (const name of cssLogicalBlockProperties)
		expect(style.getPropertyValue(name)).toBe("initial");
	expect(style.removeProperty("all")).toBe("initial");
	for (const name of cssLogicalBlockProperties)
		expect(style.getPropertyValue(name)).toBe("");
	expect(style.getPropertyValue("--Space")).toBe("4px");
});

it("charges authored parser statements and expanded inline components", () => {
	const result = sheet("margin-block:1px;padding-block:2px", 2);
	expect(result.budget.declarations).toBe(2);
	expect(result.declarations).toHaveLength(4);
	expect(() => sheet("margin-block:1px;padding-block:2px", 1)).toThrow(
		"CSS declaration limit exceeded",
	);
	for (const value of ["1px", "var(--Space)"]) {
		expect(() => parseInlineDeclarations(`margin-block:${value}`, 1)).toThrow(
			"CSS declaration limit exceeded",
		);
		expect(parseInlineDeclarations(`margin-block:${value}`, 2)).toHaveLength(2);
	}
	const { tree, id, style } = fixture("margin-top:3px", 2);
	const before = tree.get(id).attributes.style;
	expect(() => style.setProperty("margin-block", "2px")).toThrow(
		"CSS declaration limit exceeded",
	);
	expect(tree.get(id).attributes.style).toBe(before);
	expect(style.getPropertyValue("margin-top")).toBe("3px");
});

it("retains existing length source and nesting bounds", () => {
	const longValue = `${"0".repeat(cssMathLimits.maxSourceCodeUnits)}px`;
	const deepValue = `${"calc(".repeat(cssMathLimits.maxDepth + 1)}1px${")".repeat(cssMathLimits.maxDepth + 1)}`;
	for (const value of [longValue, deepValue]) {
		expect(
			parseLogicalBlockDeclarations("margin-block", value),
		).toBeUndefined();
		expect(expandDeclaration("margin-block", value, false)).toEqual([]);
	}
	expect(sheet(`margin-block:${longValue}`).declarations).toEqual([]);
	expect(() => sheet(`margin-block:${deepValue}`)).toThrow(
		"CSS component nesting limit exceeded",
	);
});

it.each(["margin-inline", "padding-inline", "writing-mode", "direction"])(
	"does not widen the native property profile to %s",
	(name) => {
		expect(sheet(`${name}:initial`)).toMatchObject({
			declarations: [],
			issues: ["unimplemented-css-property"],
		});
		expect(expandDeclaration(name, "initial", false)).toEqual([]);
	},
);

for (const family of ["margin", "padding"] as const) {
	for (const variant of [
		{
			start: "var(--Pair)",
			end: "var(--Pair)",
			important: false,
			top: "0px",
			bottom: "0px",
		},
		{
			start: "var(--Pair)",
			end: "var(--Pair)",
			important: true,
			top: "0px",
			bottom: "0px",
		},
		{
			start: "var(--Pair)",
			end: "var(--Single)",
			important: false,
			top: "0px",
			bottom: "6px",
		},
		{
			start: "var(--Pair)",
			end: "8px",
			important: false,
			top: "0px",
			bottom: "8px",
		},
		{
			start: "var(--Single)",
			end: "var(--Single)",
			important: false,
			top: "6px",
			bottom: "6px",
		},
		{
			start: "calc(var(--Single) + 1px)",
			end: "calc(var(--Single) + 1px)",
			important: false,
			top: "7px",
			bottom: "7px",
		},
	]) {
		it(`does not synthesize ${family}-block from independent variable longhands: ${JSON.stringify(variant)}`, () => {
			const priority = variant.important ? "!important" : "";
			const { tree, id, style } = fixture(
				`--Pair:4px 5px;--Single:6px;${family}-block-start:${variant.start}${priority};${family}-block-end:${variant.end}${priority}`,
			);
			const styles = documentStyles(tree);
			expect(styles.box(id)[`${family}-top`]).toBe(variant.top);
			expect(styles.box(id)[`${family}-bottom`]).toBe(variant.bottom);
			expect(style.getPropertyValue(`${family}-block`)).toBe("");
			const serialized = style.cssText;
			expect(serialized).toContain(`${family}-block-start:`);
			expect(serialized).toContain(`${family}-block-end:`);
			style.cssText = serialized;
			expect(styles.box(id)[`${family}-top`]).toBe(variant.top);
			expect(styles.box(id)[`${family}-bottom`]).toBe(variant.bottom);
		});
	}
	for (const side of ["left", "right"]) {
		it(`retains interposed ${family}-${side} declaration order`, () => {
			const source = `${family}-block-start:1px;${family}-${side}:2px;${family}-block-end:3px`;
			const entries = parseInlineDeclarations(source, 16);
			const serialized = serializeDeclarations(entries);
			expect(
				parseInlineDeclarations(serialized, 16).map((entry) => entry.name),
			).toEqual(entries.map((entry) => entry.name));
		});
	}
	for (const source of [
		`${family}-top:1px;${family}-block-end:2px;${family}-bottom:3px;${family}-left:1px;${family}-right:1px`,
		`${family}-block-start:1px;${family}-bottom:2px;${family}-block-end:3px`,
		`${family}-block-start:1px!important;${family}-bottom:2px!important;${family}-block-end:3px!important`,
		`--Space:3px;all:var(--Reset,initial);${family}-bottom:9px;${family}-block:var(--Space)`,
		`--Space:3px;all:var(--Reset,initial);${family}-block-end:9px;${family}:var(--Space)`,
	]) {
		it(`preserves ${family} effective order across cssText: ${source}`, () => {
			const { tree, id, style } = fixture(source);
			const styles = documentStyles(tree);
			expect(styles.box(id)[`${family}-bottom`]).toBe("3px");
			const before = styles.box(id);
			style.cssText = style.cssText;
			expect(styles.box(id)).toEqual(before);
		});
	}
	for (const logicalFirst of [true, false]) {
		it(`moves a ${family} setter after a later opposite mapping: ${logicalFirst}`, () => {
			const first = logicalFirst ? `${family}-block-start` : `${family}-top`;
			const second = logicalFirst ? `${family}-top` : `${family}-block-start`;
			const { tree, id, style } = fixture(`${first}:1px;${second}:2px`);
			style.setProperty(first, "3px");
			expect(documentStyles(tree).box(id)[`${family}-top`]).toBe("3px");
			style.cssText = style.cssText;
			expect(documentStyles(tree).box(id)[`${family}-top`]).toBe("3px");
		});
	}
	it(`keeps a complete pending ${family}-block setter after physical declarations`, () => {
		const { tree, id, style } = fixture(
			`--Space:4px 5px;${family}-block-start:1px;${family}-bottom:2px;${family}-block-end:3px`,
		);
		style.setProperty(`${family}-block`, "var(--Space)");
		const styles = documentStyles(tree);
		expect(styles.box(id)[`${family}-top`]).toBe("4px");
		expect(styles.box(id)[`${family}-bottom`]).toBe("5px");
		style.cssText = style.cssText;
		expect(styles.box(id)[`${family}-top`]).toBe("4px");
		expect(styles.box(id)[`${family}-bottom`]).toBe("5px");
	});
}
