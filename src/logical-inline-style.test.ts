import { afterEach, expect, it } from "vitest";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface ComputedStyle {
	marginInline: string;
	marginInlineStart: string;
	marginInlineEnd: string;
	paddingInline: string;
	paddingInlineStart: string;
	paddingInlineEnd: string;
	getPropertyValue(name: string): string;
}

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		return target;
	},
};

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css: string, inline = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}html{font-size:20px}#parent{display:flow-root;width:200px}#target{font-size:10px}</style><style id="sheet">${css}</style><main id="parent"><div id="target" class="item" style="${inline}">XY</div></main>`,
		"https://fixture.invalid/logical-inline-style",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing inline spacing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(240, 160);
	const computed = new ComputedStyles(tree, factory).get(id()) as ComputedStyle;
	return {
		tree,
		styles,
		id,
		computed,
		box: () => styles.box(id()),
		read: (property: string) => resolvedStyleValue(tree, id(), property),
	};
}

for (const family of ["margin", "padding"] as const) {
	it.each([
		[
			"logical after physical",
			"F-left:1px;F-right:2px;F-inline:3px 4px",
			"3px",
			"4px",
		],
		[
			"physical after logical",
			"F-inline:3px 4px;F-left:5px;F-right:6px",
			"5px",
			"6px",
		],
		[
			"interleaved longhands",
			"F-inline:3px 4px;F-left:5px;F-inline-start:7px;F-inline-end:8px;F-right:9px",
			"7px",
			"9px",
		],
		[
			"physical shorthand reset",
			"F-inline-start:7px;F-inline-end:8px;F:2px",
			"2px",
			"2px",
		],
	])(
		`maps ${family} start to left and end to right: %s`,
		(_name, declarations, left, right) => {
			const page = fixture(
				`#target{${declarations.replaceAll("F", family)};${family}-block:11px 13px}`,
			);
			expect(page.box()).toMatchObject({
				[`${family}-left`]: left,
				[`${family}-right`]: right,
				[`${family}-top`]: "11px",
				[`${family}-bottom`]: "13px",
			});
			expect(page.read(`${family}-inline-start`)).toBe(left);
			expect(page.read(`${family}-inline-end`)).toBe(right);
		},
	);

	it(`respects ${family} specificity, importance and inline origin across mappings`, () => {
		for (const [css, inline, left, right] of [
			[
				"#target{F-inline:3px 4px}.item{F-left:7px;F-right:8px}",
				"",
				"3px",
				"4px",
			],
			[
				"#target{F-left:7px;F-right:8px}.item{F-inline:3px 4px}",
				"",
				"7px",
				"8px",
			],
			[
				".item{F-inline:3px 4px}.item{F-left:7px;F-right:8px}",
				"",
				"7px",
				"8px",
			],
			[
				"#target{F-inline:3px 4px}",
				"F-inline:9px;F-left:5px;F-inline-end:6px",
				"5px",
				"6px",
			],
			[
				".item{F-left:7px!important;F-right:8px!important}",
				"F-inline:9px",
				"7px",
				"8px",
			],
			[
				"#target{F-inline:3px 4px!important}",
				"F-left:5px!important;F-inline-end:6px!important",
				"5px",
				"6px",
			],
			["#target{F-inline:3px 4px!important;F:2px}", "", "3px", "4px"],
			[
				"#target{F-inline:3px 4px!important;F-left:5px!important;F-inline-end:6px!important}",
				"",
				"5px",
				"6px",
			],
		]) {
			const page = fixture(
				css.replaceAll("F", family),
				inline.replaceAll("F", family),
			);
			expect(page.box()).toMatchObject({
				[`${family}-left`]: left,
				[`${family}-right`]: right,
			});
		}
	});

	it(`resolves inherited ${family} variables before physical competition without inheriting spacing`, () => {
		const page = fixture(
			`#parent{--Space:1em .5rem;${family}-inline:17px 19px}#target{${family}-inline:var(--Space);${family}-right:7px;${family}-inline-start:var(--missing,3px)}`,
		);
		expect(page.read(`${family}-inline`)).toBe("3px 7px");
		page.tree.setAttribute(page.id(), "style", `${family}-inline:var(--Space)`);
		expect(page.read(`${family}-inline`)).toBe("10px");
		page.tree.setTextContent(
			page.id("#sheet"),
			`#parent{${family}-inline:17px 19px}`,
		);
		page.tree.removeAttribute(page.id(), "style");
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "0px",
			[`${family}-right`]: "0px",
		});
		page.tree.setAttribute(
			page.id(),
			"style",
			`${family}-left:inherit;${family}-right:inherit`,
		);
		expect(page.read(`${family}-inline`)).toBe("17px 19px");
	});

	it(`invalidates pending ${family} pairs without reviving losing declarations`, () => {
		for (const [custom, value] of [
			["", "var(--missing)"],
			["--space:var(--other);--other:var(--space)", "var(--space)"],
			["--space:red", "var(--space,9px)"],
			["--space:1px 2px 3px", "var(--space)"],
			...(family === "padding"
				? [
						["--space:3px -1px", "var(--space,9px)"],
						["--space:auto", "var(--space)"],
					]
				: []),
		]) {
			const page = fixture(
				`#parent{${family}-inline:17px}#target{${custom};${family}-left:5px;${family}-right:6px;${family}-inline:${value}}`,
			);
			expect(page.box()).toMatchObject({
				[`${family}-left`]: "0px",
				[`${family}-right`]: "0px",
			});
			page.tree.setAttribute(page.id(), "style", `${family}-right:9px`);
			expect(page.box()).toMatchObject({
				[`${family}-left`]: "0px",
				[`${family}-right`]: "9px",
			});
		}
		const page = fixture(
			`#target{${family}-inline:7px 8px;${family}-left:var(--missing)}`,
		);
		expect(page.read(`${family}-inline`)).toBe("0px 8px");
	});

	it(`applies ${family} CSS-wide and all resets using physical parent edges`, () => {
		for (const keyword of ["inherit", "unset", "initial", "revert"]) {
			for (const reset of [
				`${family}-inline:${keyword}`,
				`${family}-inline-start:${keyword};${family}-inline-end:${keyword}`,
				`all:${keyword}`,
			]) {
				const page = fixture(
					`#parent{${family}-left:11px;${family}-inline-end:13px}#target{--keep:9px;${family}-inline:3px 4px;${reset}}`,
				);
				expect(page.box()).toMatchObject({
					[`${family}-left`]: keyword === "inherit" ? "11px" : "0px",
					[`${family}-right`]: keyword === "inherit" ? "13px" : "0px",
				});
				expect(page.read("--keep")).toBe("9px");
			}
		}
		const page = fixture(
			`#target{--Reset:initial;${family}-inline:3px 4px!important;all:var(--Reset)!important;${family}-left:8px;${family}-inline-end:9px!important}`,
		);
		expect(page.box()).toMatchObject({
			[`${family}-left`]: "0px",
			[`${family}-right`]: "9px",
		});
	});

	it(`cascades generated ${family} inline styles separately and honors explicit inheritance`, () => {
		for (const name of ["before", "after"] as const) {
			const page = fixture(
				`#target{${family}-inline:11px 13px;--space:3px 4px}#target::${name}{content:"";${family}-inline:var(--space);${family}-left:5px;${family}-block:7px 9px}.item::${name}{${family}-inline-end:8px!important}`,
				`${family}-inline:17px!important`,
			);
			const generated = () => {
				const result = page.styles.generatedContent(page.id(), name);
				if (!result) throw new Error(`Missing ::${name}`);
				return result.box;
			};
			expect(generated()).toMatchObject({
				[`${family}-left`]: "5px",
				[`${family}-right`]: "8px",
				[`${family}-top`]: "7px",
				[`${family}-bottom`]: "9px",
			});
			expect(page.read(`${family}-inline`)).toBe("17px");
			for (const keyword of ["inherit", "initial", "unset", "revert"]) {
				page.tree.setTextContent(
					page.id("#sheet"),
					`#target::${name}{${family}-inline:3px 4px;all:${keyword};content:""}`,
				);
				expect(generated()).toMatchObject({
					[`${family}-left`]: keyword === "inherit" ? "17px" : "0px",
					[`${family}-right`]: keyword === "inherit" ? "17px" : "0px",
				});
			}
			page.tree.setTextContent(
				page.id("#sheet"),
				`#target::${name}{content:"";${family}-inline:5px;${family}-inline:var(--missing)}`,
			);
			expect(generated()).toMatchObject({
				[`${family}-left`]: "0px",
				[`${family}-right`]: "0px",
			});
		}
	});
}

it("exposes resolved inline camelCase and named accessors for lengths, math, percentages and auto", () => {
	const page = fixture(
		"#target{margin-inline:1em .5rem;padding-inline:5% 10%;height:10px}",
	);
	expect(page.computed.marginInlineStart).toBe("10px");
	expect(page.computed.marginInlineEnd).toBe("10px");
	expect(page.computed.marginInline).toBe("10px");
	expect(page.computed.paddingInlineStart).toBe("10px");
	expect(page.computed.paddingInlineEnd).toBe("20px");
	expect(page.computed.paddingInline).toBe("10px 20px");
	for (const family of ["margin", "padding"]) {
		for (const [logical, physical] of [
			["start", "left"],
			["end", "right"],
		])
			expect(
				page.computed.getPropertyValue(`${family}-inline-${logical}`),
			).toBe(page.computed.getPropertyValue(`${family}-${physical}`));
		expect(page.computed.getPropertyValue(`${family}-inline`)).toBe(
			page.read(`${family}-inline`),
		);
	}
	page.tree.setAttribute(
		page.id(),
		"style",
		"margin-inline:calc(10px + 5%) calc(1em + 2px);padding-inline:calc(0px - 3px) calc(10% - 5px)",
	);
	expect(page.computed.marginInline).toBe("20px 12px");
	expect(page.computed.paddingInline).toBe("0px 15px");
	page.tree.setAttribute(
		page.id(),
		"style",
		"width:100px;margin-inline:auto;padding-inline:0",
	);
	expect(page.box()).toMatchObject({
		"margin-left": "auto",
		"margin-right": "auto",
	});
	expect(page.computed.marginInlineStart).toBe(
		page.computed.getPropertyValue("margin-left"),
	);
	expect(page.computed.marginInlineEnd).toBe(
		page.computed.getPropertyValue("margin-right"),
	);
	page.tree.setAttribute(page.id(), "style", "display:none");
	expect(page.computed.paddingInlineStart).toBe("5%");
	expect(page.computed.paddingInlineEnd).toBe("10%");
	expect(page.computed.paddingInline).toBe("5% 10%");
});

it("invalidates cached inline, computed and pseudo styles after ancestor, class, inline and sheet changes", () => {
	const page = fixture(
		'#parent{--space:2px 4px}#target{margin-inline:var(--space);padding-inline:3px}#target.changed{margin-left:9px}#target::before,#target::after{content:"";padding-inline:var(--space)}',
	);
	const before = page.box();
	expect(page.computed.marginInline).toBe("2px 4px");
	for (const name of ["before", "after"] as const)
		expect(page.styles.generatedContent(page.id(), name)?.box).toMatchObject({
			"padding-left": "2px",
			"padding-right": "4px",
		});
	page.tree.setAttribute(page.id("#parent"), "style", "--space:5px 7px");
	expect(page.computed.marginInline).toBe("5px 7px");
	expect(page.box()).not.toBe(before);
	expect(before).toMatchObject({ "margin-left": "2px", "margin-right": "4px" });
	for (const name of ["before", "after"] as const)
		expect(page.styles.generatedContent(page.id(), name)?.box).toMatchObject({
			"padding-left": "5px",
			"padding-right": "7px",
		});
	page.tree.setAttribute(page.id(), "class", "item changed");
	expect(page.computed.marginInline).toBe("9px 7px");
	page.tree.setAttribute(
		page.id(),
		"style",
		"margin-inline-start:11px;padding-right:8px",
	);
	expect(page.computed.marginInline).toBe("11px 7px");
	expect(page.computed.paddingInline).toBe("3px 8px");
	page.tree.removeAttribute(page.id(), "style");
	expect(page.computed.marginInline).toBe("9px 7px");
	expect(page.computed.paddingInline).toBe("3px");
	page.tree.setTextContent(
		page.id("#sheet"),
		"#target{margin-left:13px;margin-right:15px;padding-inline:6px}",
	);
	expect(page.computed.marginInline).toBe("13px 15px");
	expect(page.computed.paddingInline).toBe("6px");
	expect(page.styles.generatedContent(page.id(), "before")).toBeUndefined();
	expect(page.styles.generatedContent(page.id(), "after")).toBeUndefined();
});

it("uses inline support conditions to select effective spacing rather than syntax alone", () => {
	const page = fixture(
		"#target{margin:1px;padding:2px}@supports (margin-inline:3px 4px) and (padding-inline-end:5%){#target{margin-inline:3px 4px;padding-inline:5px 6px}}@supports (padding-inline:-1px){#target{padding-left:99px}}@supports not (margin-inline-start:2px){#target{margin-right:99px}}",
	);
	expect(page.box()).toMatchObject({
		"margin-left": "3px",
		"margin-right": "4px",
		"margin-top": "1px",
		"padding-left": "5px",
		"padding-right": "6px",
		"padding-bottom": "2px",
	});
});

it("does not advertise vertical writing modes or RTL as supported CSS", () => {
	for (const [name, value] of [
		["writing-mode", "vertical-rl"],
		["writing-mode", "vertical-lr"],
		["direction", "rtl"],
	]) {
		expect(cssSupportsDeclaration(name, value)).toBe(false);
		const issues: string[] = [];
		const declarations = parseCssDeclarations(
			`${name}:${value};margin-inline:3px 4px`,
			{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 4 },
			(issue) => issues.push(issue),
		);
		expect(issues).toContain("unimplemented-css-property");
		expect(declarations.map((entry) => String(entry.property))).toEqual([
			"margin-inline-start",
			"margin-inline-end",
		]);
	}
});
