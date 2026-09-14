import { afterEach, describe, expect, it } from "vitest";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

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

interface ComputedStyle {
	marginBlock: string;
	marginBlockStart: string;
	marginBlockEnd: string;
	paddingBlock: string;
	paddingBlockStart: string;
	paddingBlockEnd: string;
	getPropertyValue(name: string): string;
}

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css: string, inline = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}html{font-size:20px}#parent{display:flow-root;width:200px}#target{font-size:10px}</style><style id="sheet">${css}</style><main id="parent"><div id="target" class="item" style="${inline}">AB</div></main>`,
		"https://fixture.invalid/logical-block-style",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing logical block ${selector}`);
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

describe.each(["margin", "padding"] as const)(
	"horizontal-tb %s block cascade",
	(family) => {
		it.each([
			{
				name: "later logical shorthand",
				declarations: "F-top:1px;F-bottom:2px;F-block:3px 4px",
				top: "3px",
				bottom: "4px",
			},
			{
				name: "later physical longhands",
				declarations: "F-block:3px 4px;F-top:5px;F-bottom:6px",
				top: "5px",
				bottom: "6px",
			},
			{
				name: "interleaved logical longhands",
				declarations:
					"F-block:3px 4px;F-top:5px;F-block-start:7px;F-block-end:8px;F-bottom:9px",
				top: "7px",
				bottom: "9px",
			},
			{
				name: "physical shorthand resets logical edges",
				declarations: "F-block-start:7px;F-block-end:8px;F:2px",
				top: "2px",
				bottom: "2px",
			},
			{
				name: "logical shorthand resets earlier logical longhands",
				declarations: "F-block-start:7px;F-block-end:8px;F-block:2px",
				top: "2px",
				bottom: "2px",
			},
			{
				name: "logical important survives normal physical shorthand",
				declarations: "F-block:3px 4px!important;F:2px",
				top: "3px",
				bottom: "4px",
			},
			{
				name: "physical important survives normal logical shorthand",
				declarations: "F-top:5px!important;F-bottom:6px!important;F-block:2px",
				top: "5px",
				bottom: "6px",
			},
			{
				name: "source order breaks equal important priority",
				declarations:
					"F-block:3px 4px!important;F-top:5px!important;F-block-end:6px!important",
				top: "5px",
				bottom: "6px",
			},
		])("respects $name", ({ declarations, top, bottom }) => {
			const page = fixture(
				`#target{${declarations.replaceAll("F", family)};${family}-left:11px;${family}-right:13px}`,
			);
			expect(page.box()).toMatchObject({
				[`${family}-top`]: top,
				[`${family}-bottom`]: bottom,
				[`${family}-left`]: "11px",
				[`${family}-right`]: "13px",
			});
			expect(page.read(`${family}-block-start`)).toBe(top);
			expect(page.read(`${family}-block-end`)).toBe(bottom);
		});

		it.each([
			{
				name: "ID beats a later physical class rule",
				css: "#target{F-block:3px 4px}.item{F-top:7px;F-bottom:8px}",
				inline: "",
				expected: "3px 4px",
			},
			{
				name: "physical ID beats a later logical class rule",
				css: "#target{F-top:7px;F-bottom:8px}.item{F-block:3px 4px}",
				inline: "",
				expected: "7px 8px",
			},
			{
				name: "equal-specificity later rule wins",
				css: ".item{F-block:3px 4px}.item{F-top:7px;F-bottom:8px}",
				inline: "",
				expected: "7px 8px",
			},
			{
				name: "inline order wins over normal stylesheet",
				css: "#target{F-block:3px 4px}",
				inline: "F-block:9px;F-top:5px;F-block-end:6px",
				expected: "5px 6px",
			},
			{
				name: "stylesheet important beats normal inline logical values",
				css: ".item{F-top:7px!important;F-bottom:8px!important}",
				inline: "F-block:9px",
				expected: "7px 8px",
			},
			{
				name: "inline important beats stylesheet important",
				css: "#target{F-block:3px 4px!important}",
				inline: "F-top:5px!important;F-block-end:6px!important",
				expected: "5px 6px",
			},
		])("respects $name", ({ css, inline, expected }) => {
			const page = fixture(
				css.replaceAll("F", family),
				inline.replaceAll("F", family),
			);
			expect(page.read(`${family}-block`)).toBe(expected);
		});

		it("substitutes inherited shorthand variables before competing with physical edges", () => {
			const page = fixture(
				`#parent{--Space:1em .5rem}#target{${family}-block:var(--Space);${family}-bottom:7px;${family}-block-start:var(--missing,3px)}`,
			);
			expect(page.read(`${family}-block`)).toBe("3px 7px");
			page.tree.setAttribute(
				page.id(),
				"style",
				`${family}-block:var(--Space)`,
			);
			expect(page.read(`${family}-block`)).toBe("10px");
		});

		it.each([
			{ name: "missing", custom: "", value: "var(--missing)" },
			{
				name: "cyclic",
				custom: "--space:var(--other);--other:var(--space)",
				value: "var(--space)",
			},
			{
				name: "invalid substituted value with an unused fallback",
				custom: "--space:red",
				value: "var(--space,9px)",
			},
			{
				name: "too many substituted components",
				custom: "--space:1px 2px 3px",
				value: "var(--space)",
			},
		])(
			"initializes both edges for $name without reviving losing values",
			({ custom, value }) => {
				const page = fixture(
					`#parent{${family}-block:17px}#target{${custom};${family}-top:5px;${family}-bottom:6px;${family}-block:${value}}`,
				);
				expect(page.box()).toMatchObject({
					[`${family}-top`]: "0px",
					[`${family}-bottom`]: "0px",
				});
				expect(page.read(`${family}-block`)).toBe("0px");
			},
		);

		it("keeps later physical winners when a logical shorthand is invalid at computed time", () => {
			const page = fixture(
				`#target{${family}-top:5px;${family}-bottom:6px;${family}-block:var(--missing);${family}-bottom:9px}`,
			);
			expect(page.read(`${family}-block`)).toBe("0px 9px");
			page.tree.setAttribute(
				page.id(),
				"style",
				`${family}-block:7px 8px;${family}-top:var(--missing)`,
			);
			expect(page.read(`${family}-block`)).toBe("0px 8px");
			page.tree.setAttribute(
				page.id(),
				"style",
				`${family}-top:7px;${family}-bottom:8px;${family}-block-end:var(--missing)`,
			);
			expect(page.read(`${family}-block`)).toBe("7px 0px");
		});

		it("does not inherit spacing by default but lets physical inherit read logical parent values", () => {
			const page = fixture(`#parent{${family}-block:11px 13px}`);
			expect(page.read(`${family}-block`)).toBe("0px");
			page.tree.setAttribute(
				page.id(),
				"style",
				`${family}-top:inherit;${family}-bottom:inherit`,
			);
			expect(page.read(`${family}-block`)).toBe("11px 13px");
			page.tree.setAttribute(
				page.id("#parent"),
				"style",
				`${family}-top:17px;${family}-block-end:19px`,
			);
			expect(page.read(`${family}-block`)).toBe("17px 19px");
		});

		it.each(["inherit", "unset", "initial", "revert"] as const)(
			"applies %s on logical shorthand and longhands using physical parent edges",
			(keyword) => {
				for (const declarations of [
					`${family}-block:${keyword}`,
					`${family}-block-start:${keyword};${family}-block-end:${keyword}`,
				]) {
					const page = fixture(
						`#parent{${family}-top:1em;${family}-bottom:7px}#target{${family}-block:3px 4px;${declarations}}`,
					);
					expect(page.read(`${family}-block`)).toBe(
						keyword === "inherit" ? "20px 7px" : "0px",
					);
				}
			},
		);

		it.each(["inherit", "unset", "initial", "revert"] as const)(
			"resets logical winners through all:%s without resetting custom properties",
			(keyword) => {
				const page = fixture(
					`#parent{${family}-block:11px 13px}#target{--keep:9px;${family}-block:3px 4px;all:${keyword}}`,
				);
				expect(page.box()).toMatchObject({
					[`${family}-top`]: keyword === "inherit" ? "11px" : "0px",
					[`${family}-bottom`]: keyword === "inherit" ? "13px" : "0px",
				});
				expect(page.read("--keep")).toBe("9px");
			},
		);

		it("honors all priority and later important logical longhands", () => {
			const page = fixture(
				`#target{${family}-block:3px 4px!important;all:initial!important;${family}-top:8px;${family}-block-end:9px!important}`,
			);
			expect(page.read(`${family}-block`)).toBe("0px 9px");
		});

		it.each(["before", "after"] as const)(
			"cascades ::%s separately and inherits logical edges only when requested",
			(name) => {
				const page = fixture(
					`#target{${family}-block:11px 13px;--space:3px 4px}#target::${name}{content:"";${family}-block:var(--space);${family}-top:5px}.item::${name}{${family}-block-end:8px!important}`,
					`${family}-block:17px!important`,
				);
				const generated = () => {
					const result = page.styles.generatedContent(page.id(), name);
					if (!result) throw new Error(`Missing ::${name}`);
					return result;
				};
				expect(generated().box).toMatchObject({
					[`${family}-top`]: "5px",
					[`${family}-bottom`]: "8px",
				});
				expect(page.read(`${family}-block`)).toBe("17px");
				for (const keyword of ["inherit", "unset", "initial", "revert"]) {
					for (const reset of [
						`${family}-block:${keyword}`,
						`all:${keyword}`,
					]) {
						page.tree.setTextContent(
							page.id("#sheet"),
							`#target::${name}{${family}-block:3px 4px;${reset};content:""}`,
						);
						expect(generated().box).toMatchObject({
							[`${family}-top`]: keyword === "inherit" ? "17px" : "0px",
							[`${family}-bottom`]: keyword === "inherit" ? "17px" : "0px",
						});
					}
				}
				page.tree.setTextContent(
					page.id("#sheet"),
					`#target::${name}{content:"";${family}-block:5px;${family}-block:var(--missing)}`,
				);
				expect(generated().box).toMatchObject({
					[`${family}-top`]: "0px",
					[`${family}-bottom`]: "0px",
				});
			},
		);
	},
);

it("invalidates an entire substituted padding pair when one component is negative", () => {
	const page = fixture(
		"#target{--space:3px -1px;padding-top:5px;padding-bottom:7px;padding-block:var(--space,9px)}",
	);
	expect(page.box()).toMatchObject({
		"padding-top": "0px",
		"padding-bottom": "0px",
	});
	expect(page.computed.paddingBlock).toBe("0px");
});

it("mirrors resolved physical edges through computed camelCase and property access", () => {
	const page = fixture(
		"#target{margin-block:1em .5rem;padding-block:5% 10%;height:10px}",
	);
	const { computed } = page;
	expect(computed.marginBlockStart).toBe("10px");
	expect(computed.marginBlockEnd).toBe("10px");
	expect(computed.marginBlock).toBe("10px");
	expect(computed.getPropertyValue("margin-block")).toBe("10px");
	expect(computed.paddingBlockStart).toBe("10px");
	expect(computed.paddingBlockEnd).toBe("20px");
	expect(computed.paddingBlock).toBe("10px 20px");
	expect(computed.getPropertyValue("padding-block")).toBe("10px 20px");
	for (const family of ["margin", "padding"]) {
		for (const [logical, physical] of [
			["start", "top"],
			["end", "bottom"],
		]) {
			expect(computed.getPropertyValue(`${family}-block-${logical}`)).toBe(
				computed.getPropertyValue(`${family}-${physical}`),
			);
		}
	}
	page.tree.setAttribute(page.id(), "style", "display:none");
	expect(computed.paddingBlockStart).toBe("5%");
	expect(computed.paddingBlockEnd).toBe("10%");
	expect(computed.paddingBlock).toBe("5% 10%");
});

it("keeps computed and generated styles live after ancestor, class, inline and sheet mutations", () => {
	const page = fixture(
		'#parent{--space:2px 4px}#target{margin-block:var(--space);padding-block:3px}#target.changed{margin-top:9px}#target::before,#target::after{content:"";padding-block:var(--space)}',
	);
	const before = page.box();
	expect(page.computed.marginBlock).toBe("2px 4px");
	for (const name of ["before", "after"] as const)
		expect(page.styles.generatedContent(page.id(), name)?.box).toMatchObject({
			"padding-top": "2px",
			"padding-bottom": "4px",
		});
	page.tree.setAttribute(page.id("#parent"), "style", "--space:5px 7px");
	expect(page.computed.marginBlock).toBe("5px 7px");
	expect(page.box()).not.toBe(before);
	expect(before).toMatchObject({ "margin-top": "2px", "margin-bottom": "4px" });
	for (const name of ["before", "after"] as const)
		expect(page.styles.generatedContent(page.id(), name)?.box).toMatchObject({
			"padding-top": "5px",
			"padding-bottom": "7px",
		});
	page.tree.setAttribute(page.id(), "class", "item changed");
	expect(page.computed.marginBlock).toBe("9px 7px");
	page.tree.setAttribute(
		page.id(),
		"style",
		"margin-block-start:11px;padding-bottom:8px",
	);
	expect(page.computed.marginBlock).toBe("11px 7px");
	expect(page.computed.paddingBlock).toBe("3px 8px");
	page.tree.removeAttribute(page.id(), "style");
	expect(page.computed.marginBlock).toBe("9px 7px");
	expect(page.computed.paddingBlock).toBe("3px");
	page.tree.setTextContent(
		page.id("#sheet"),
		"#target{margin-top:13px;margin-bottom:15px;padding-block:6px}",
	);
	expect(page.computed.marginBlock).toBe("13px 15px");
	expect(page.computed.paddingBlock).toBe("6px");
	expect(page.styles.generatedContent(page.id(), "before")).toBeUndefined();
	expect(page.styles.generatedContent(page.id(), "after")).toBeUndefined();
});
