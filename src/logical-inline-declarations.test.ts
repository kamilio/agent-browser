import { afterEach, expect, it } from "vitest";
import { parseBoxDeclarations } from "./css-box.js";
import {
	expandDeclaration,
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	marginInline: string;
	marginInlineStart: string;
	marginInlineEnd: string;
	paddingInline: string;
	paddingInlineStart: string;
	paddingInlineEnd: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: unknown, priority?: unknown): void;
	removeProperty(name: string): string;
}

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(source: string) {
	const tree = parseHtmlDocument(
		'<div id="target">Inline spacing fixture</div>',
		"https://fixture.invalid/logical-inline-declarations",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	queries.close();
	if (id === null) throw new Error("Missing inline spacing target");
	tree.setAttribute(id, "style", source);
	const owner = new InlineStyles(tree, {
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
	});
	const styles = documentStyles(tree);
	return { style: owner.get(id) as Style, box: () => styles.box(id) };
}

function sheet(source: string) {
	const issues: string[] = [];
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 256 },
		(issue) => issues.push(issue),
	);
	return { declarations, issues };
}

it.each([
	["margin-inline", "0", "0px", "0px"],
	["margin-inline", "-2px auto", "-2px", "auto"],
	["margin-inline", "2em 3rem", "2em", "3rem"],
	["margin-inline", "1e2px -5%", "100px", "-5%"],
	["padding-inline", "4ex", "4ex", "4ex"],
	["padding-inline", "2px 5%", "2px", "5%"],
] as const)(
	"expands %s:%s without losing authored identity",
	(name, value, start, end) => {
		const expected = [start, end].map((component, index) => ({
			property: `${name}-${index === 0 ? "start" : "end"}`,
			value: component,
			important: true,
		}));
		expect(sheet(`${name}:${value}!important`)).toEqual({
			declarations: expected,
			issues: [],
		});
		expect(parseInlineDeclarations(`${name}:${value}!important`, 2)).toEqual(
			expected.map(({ property, ...entry }) => ({ name: property, ...entry })),
		);
		expect(cssSupportsDeclaration(name, value)).toBe(true);
		expect(cssSupportsCondition(`(${name}:${value})`)).toBe(true);
	},
);

it.each([
	["margin-inline-start", "margin-left"],
	["margin-inline-end", "margin-right"],
	["padding-inline-start", "padding-left"],
	["padding-inline-end", "padding-right"],
] as const)(
	"uses physical length rules while retaining %s",
	(name, physical) => {
		for (const value of [
			"0",
			"2em",
			"3rem",
			"5%",
			"calc(10px + 2%)",
			"inherit",
		]) {
			const parsed = parseBoxDeclarations(physical, value);
			expect(parsed).toHaveLength(1);
			const expected = parsed?.map((entry) => ({
				property: name,
				value: entry.value,
				important: false,
			}));
			expect(sheet(`${name}:${value}`).declarations).toEqual(expected);
			expect(expandDeclaration(name, value, false)).toEqual(
				expected?.map(({ property, ...entry }) => ({
					name: property,
					...entry,
				})),
			);
			expect(cssSupportsDeclaration(name, value)).toBe(true);
		}
	},
);

it("rejects invalid pairs and negative or auto padding without changing CSSOM", () => {
	for (const [name, value] of [
		["margin-inline", "1px 2px 3px"],
		["margin-inline", "inherit 1px"],
		["margin-inline", "1px / 2px"],
		["margin-inline", "2"],
		["margin-inline-start", "1px 2px"],
		["margin-inline-end", "calc(1px + )"],
		["padding-inline", "-1px"],
		["padding-inline", "1px -2%"],
		["padding-inline", "auto"],
		["padding-inline-start", "auto"],
		["padding-inline-end", "-2px"],
	]) {
		expect(sheet(`${name}:${value}`)).toEqual({
			declarations: [],
			issues: ["unimplemented-or-invalid-css-value"],
		});
		expect(expandDeclaration(name, value, false)).toEqual([]);
		expect(cssSupportsDeclaration(name, value)).toBe(false);
		const page = fixture("margin-inline:2px 3px;padding-inline:4px 5px");
		const before = page.style.cssText;
		page.style.setProperty(name, value);
		expect(page.style.cssText).toBe(before);
		expect(page.box()).toMatchObject({
			"margin-left": "2px",
			"margin-right": "3px",
			"padding-left": "4px",
			"padding-right": "5px",
		});
	}
});

it("normalizes CSS-wide pairs and preserves incomplete or mixed-priority longhands", () => {
	for (const name of ["margin-inline", "padding-inline"]) {
		for (const value of ["initial", "inherit", "unset", "revert"]) {
			const page = fixture(
				`${name.toUpperCase()}:/*space*/${value.toUpperCase()} ! IMPORTANT`,
			);
			expect(page.style.getPropertyValue(name)).toBe(value);
			expect(page.style.getPropertyPriority(name)).toBe("important");
			page.style.cssText = page.style.cssText;
			expect(page.style.getPropertyValue(name)).toBe(value);
		}
		for (const source of [
			`${name}-start:2px`,
			`${name}-start:2px!important;${name}-end:3px`,
			`${name}-start:initial;${name}-end:inherit`,
		]) {
			const entries = parseInlineDeclarations(source, 16);
			expect(propertyValue(entries, name)).toBe("");
			expect(
				parseInlineDeclarations(serializeDeclarations(entries), 16),
			).toEqual(entries);
		}
		const math = "calc(10px + 2%) min(2em, 30px)";
		expect(sheet(`${name}:${math}`).declarations).toHaveLength(2);
		expect(cssSupportsDeclaration(name, math)).toBe(true);
	}
});

it("supports all six camelCase accessors and get/set/remove with effective edges", () => {
	const page = fixture(
		"color:red;margin-block:11px 13px;padding-block:17px 19px",
	);
	const { style } = page;
	style.marginInline = "-2px auto";
	expect(style.marginInlineStart).toBe("-2px");
	expect(style.marginInlineEnd).toBe("auto");
	style.marginInlineStart = "4px";
	style.marginInlineEnd = "5px";
	style.paddingInline = "2px";
	style.paddingInlineStart = "3px";
	style.paddingInlineEnd = "4px";
	expect(style.marginInline).toBe("4px 5px");
	expect(style.paddingInline).toBe("3px 4px");
	expect(page.box()).toMatchObject({
		"margin-top": "11px",
		"margin-bottom": "13px",
		"margin-left": "4px",
		"margin-right": "5px",
		"padding-top": "17px",
		"padding-bottom": "19px",
		"padding-left": "3px",
		"padding-right": "4px",
	});
	style.setProperty("MARGIN-INLINE", "7px 8px", "IMPORTANT");
	expect(style.getPropertyPriority("margin-inline-start")).toBe("important");
	expect(style.getPropertyPriority("margin-inline-end")).toBe("important");
	expect(style.removeProperty("margin-inline")).toBe("7px 8px");
	expect(style.marginInlineStart).toBe("");
	expect(style.marginInlineEnd).toBe("");
	style.paddingInline = "";
	expect(style.paddingInlineStart).toBe("");
	expect(style.paddingInlineEnd).toBe("");
	expect(page.box()).toMatchObject({
		"margin-left": "0px",
		"padding-right": "0px",
	});
	expect(style.getPropertyValue("color")).toBe("red");
});

it("preserves parsed importance but replaces it on assignment", () => {
	const page = fixture(
		"margin-inline:2px 3px!important;margin-inline-start:9px",
	);
	expect(page.style.marginInline).toBe("2px 3px");
	page.style.marginInlineStart = "9px";
	expect(page.style.marginInline).toBe("");
	expect(page.style.getPropertyPriority("margin-inline-start")).toBe("");
	expect(page.style.getPropertyPriority("margin-inline-end")).toBe("important");
	expect(page.box()).toMatchObject({
		"margin-left": "9px",
		"margin-right": "3px",
	});
	const before = page.style.cssText;
	page.style.setProperty("margin-inline", "5px", "invalid");
	page.style.setProperty("margin-inline", "5px!important");
	expect(page.style.cssText).toBe(before);
	page.style.marginInline = "4px";
	expect(page.style.getPropertyPriority("margin-inline")).toBe("");
	expect(page.box()).toMatchObject({
		"margin-left": "4px",
		"margin-right": "4px",
	});
});

it.each(["margin", "padding"] as const)(
	"keeps %s physical, block and inline declarations independently removable",
	(family) => {
		const page = fixture(
			`${family}:1px;${family}-block:11px 13px;${family}-inline:2px 3px`,
		);
		page.style.setProperty(family, "4px");
		expect(page.style.getPropertyValue(`${family}-inline`)).toBe("2px 3px");
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "4px",
			[`${family}-top`]: "4px",
		});
		expect(page.style.removeProperty(family)).toBe("4px");
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "2px",
			[`${family}-top`]: "11px",
		});
		expect(page.style.removeProperty(`${family}-inline-start`)).toBe("2px");
		expect(page.style.getPropertyValue(`${family}-inline-end`)).toBe("3px");
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "0px",
			[`${family}-right`]: "3px",
		});
		for (const logicalFirst of [true, false]) {
			const first = logicalFirst ? `${family}-inline-start` : `${family}-left`;
			const second = logicalFirst ? `${family}-left` : `${family}-inline-start`;
			page.style.cssText = `${first}:1px;${second}:2px`;
			page.style.setProperty(first, "3px");
			expect(page.box()[`${family}-left`]).toBe("3px");
			page.style.cssText = page.style.cssText;
			expect(page.box()[`${family}-left`]).toBe("3px");
		}
	},
);

it.each(["margin", "padding"] as const)(
	"retains %s pending shorthand identity and effective setter order",
	(family) => {
		const name = `${family}-inline`;
		const value = "var(--Space, var(--Fallback, 2px 3px))";
		expect(sheet(`${name}:${value}!important`).declarations).toEqual(
			[`${name}-start`, `${name}-end`].map((property) => ({
				property,
				value,
				important: true,
				substitution: name,
			})),
		);
		const page = fixture(
			`--Space:4px 5px;${name}-start:1px;${family}-right:2px;${name}-end:3px`,
		);
		page.style.setProperty(name, value, "important");
		expect(page.style.getPropertyValue(name)).toBe(value);
		expect(page.style.getPropertyValue(`${name}-start`)).toBe("");
		expect(page.style.getPropertyPriority(name)).toBe("important");
		const expected = { [`${family}-left`]: "4px", [`${family}-right`]: "5px" };
		expect(page.box()).toMatchObject(expected);
		page.style.cssText = page.style.cssText;
		expect(page.box()).toMatchObject(expected);
		expect(page.style.removeProperty(name)).toBe(value);
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "0px",
			[`${family}-right`]: "2px",
		});
		expect(page.style.getPropertyValue("--Space")).toBe("4px 5px");
	},
);

it.each(["margin", "padding"] as const)(
	"never synthesizes %s inline shorthand from independent variable longhands",
	(family) => {
		for (const [start, end, left, right] of [
			["var(--Pair)", "var(--Pair)", "0px", "0px"],
			["var(--Pair)", "var(--Single)", "0px", "6px"],
			["var(--Single)", "var(--Single)", "6px", "6px"],
			["calc(var(--Single) + 1px)", "calc(var(--Single) + 1px)", "7px", "7px"],
		]) {
			const page = fixture(
				`--Pair:4px 5px;--Single:6px;${family}-inline-start:${start}!important;${family}-inline-end:${end}!important`,
			);
			const expected = { [`${family}-left`]: left, [`${family}-right`]: right };
			expect(page.box()).toMatchObject(expected);
			expect(page.style.getPropertyValue(`${family}-inline`)).toBe("");
			expect(page.style.getPropertyValue(`${family}-inline-start`)).toBe(start);
			expect(page.style.cssText).toContain(`${family}-inline-start:`);
			expect(page.style.cssText).toContain(`${family}-inline-end:`);
			page.style.cssText = page.style.cssText;
			expect(page.box()).toMatchObject(expected);
		}
	},
);

it.each(["margin", "padding"] as const)(
	"round trips %s interleaving and partial pending values without changing physical winners",
	(family) => {
		for (const [source, left, right] of [
			[
				`${family}-inline-start:1px;${family}-right:2px;${family}-inline-end:3px`,
				"1px",
				"3px",
			],
			[
				`${family}-inline-start:1px;${family}-left:2px;${family}-inline-end:3px`,
				"2px",
				"3px",
			],
			[`${family}-inline:var(--Pair);${family}-inline-end:9px`, "4px", "9px"],
			[
				`${family}-inline-start:9px!important;${family}-inline:var(--Pair)`,
				"9px",
				"5px",
			],
			[
				`all:var(--Reset,initial);${family}-right:9px;${family}-inline:var(--Pair)`,
				"4px",
				"5px",
			],
			[
				`${family}:var(--Single);${family}-inline:var(--Pair);${family}-right:9px;${family}-block:11px 13px`,
				"4px",
				"9px",
			],
		]) {
			const page = fixture(`--Pair:4px 5px;--Single:6px;${source}`);
			expect(page.box()).toMatchObject({
				[`${family}-left`]: left,
				[`${family}-right`]: right,
			});
			const before = page.box();
			page.style.cssText = page.style.cssText;
			expect(page.box()).toEqual(before);
		}
	},
);

it("includes inline longhands in literal and pending all without removing custom properties", () => {
	const names = [
		"margin-inline-start",
		"margin-inline-end",
		"padding-inline-start",
		"padding-inline-end",
	];
	for (const value of [
		"initial",
		"inherit",
		"unset",
		"revert",
		"var(--Reset)",
	]) {
		const declarations = sheet(`all:${value}!important`).declarations;
		for (const name of names)
			expect(
				declarations.filter((entry) => String(entry.property) === name),
			).toEqual([
				{
					property: name,
					value,
					important: true,
					...(value.startsWith("var(") ? { substitution: "all" } : {}),
				},
			]);
	}
	const page = fixture("margin-inline:2px;padding-inline:3px;--keep:4px");
	page.style.setProperty("all", "initial");
	for (const name of names)
		expect(page.style.getPropertyValue(name)).toBe("initial");
	expect(page.box()).toMatchObject({
		"margin-left": "0px",
		"padding-right": "0px",
	});
	expect(page.style.removeProperty("all")).toBe("initial");
	for (const name of names) expect(page.style.getPropertyValue(name)).toBe("");
	expect(page.style.getPropertyValue("--keep")).toBe("4px");
});
