import { afterEach, expect, it } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import { describeControl } from "./control-rendering.js";
import type { TextStyle } from "./css-text.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { textFontExtent } from "./text-font.js";

const components = [
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"line-height",
] as const;
const initialFont = {
	"font-family": '"agent mono"',
	"font-size": "16px",
	"font-style": "normal",
	"font-weight": "400",
	"line-height": "normal",
};
const parentFont = {
	"font-family": '"Parent Face", serif',
	"font-size": "24px",
	"font-style": "italic",
	"font-weight": "700",
	"line-height": "2",
};
const localFont = {
	"font-family": '"Local Face", monospace',
	"font-size": "8px",
	"font-style": "normal",
	"font-weight": "400",
	"line-height": "8px",
};
const parentDeclarations =
	'font-family:"Parent Face",serif;font-size:24px;font-style:italic;font-weight:700;line-height:2';
const localDeclarations =
	'font-family:"Local Face",monospace;font-size:8px;font-style:normal;font-weight:400;line-height:8px';
const routes = ["stylesheet", "inline"] as const;
type Route = (typeof routes)[number];
const keywords = ["inherit", "initial", "unset", "revert"] as const;
const keywordRoutes = routes.flatMap((route) =>
	keywords.map((keyword) => ({ route, keyword })),
);
const controls = [
	{ kind: "input", markup: '<input id="target" value="AA">' },
	{ kind: "textarea", markup: '<textarea id="target">AA</textarea>' },
	{
		kind: "select",
		markup: '<select id="target"><option selected>AA</option></select>',
	},
] as const;
const invalidVariables = [
	{ name: "missing", value: "var(--Missing)", custom: "" },
	{
		name: "cyclic",
		value: "var(--Cycle)",
		custom: "--Cycle:var(--Other);--Other:var(--Cycle)",
	},
	{
		name: "unsupported full font",
		value: "var(--Full)",
		custom: "--Full:italic 16px/1.5 monospace",
	},
] as const;
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

interface InlineStyle {
	font: string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

interface ComputedStyle {
	getPropertyValue(name: string): string;
}

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(css: string, markup = '<span id="target">AA</span>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;background:white}${css}</style><main id="parent">${markup}</main>`,
		"https://fixture.invalid/font-wide-inheritance",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing font fixture ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(128, 128);
	return {
		tree,
		styles,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
		read: (property: string) => resolvedStyleValue(tree, id(), property),
		rect: () => documentGeometry(tree).getBoundingClientRect(id()),
	};
}

function fontFixture(
	declarations: string,
	route: Route = "stylesheet",
	markup?: string,
	css = "",
) {
	const page = fixture(
		`#parent{${parentDeclarations}}#target{${localDeclarations};${route === "stylesheet" ? declarations : ""}}${css}`,
		markup,
	);
	if (route === "inline")
		page.tree.setAttribute(page.id(), "style", declarations);
	return page;
}

function fontValues(text: TextStyle) {
	return Object.fromEntries(components.map((name) => [name, text[name]]));
}

function image(page: ReturnType<typeof fixture>) {
	return rasterizeDocument(page.tree, {
		clip: { x: 0, y: 0, width: 128, height: 128 },
	}).image;
}

function pixel(
	raster: ReturnType<typeof image>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * raster.width + horizontal) * 4;
	return [...raster.pixels.slice(offset, offset + 4)];
}

it.each(keywordRoutes)(
	"computes $route font:$keyword against the actual parent, replacing local fonts",
	({ route, keyword }) => {
		const page = fontFixture(`font:${keyword}`, route);
		expect(fontValues(page.text("#parent"))).toEqual(parentFont);
		expect(fontValues(page.text())).toEqual(
			keyword === "initial" ? initialFont : parentFont,
		);
		expect(page.read("line-height")).toBe(
			keyword === "initial" ? "normal" : "48px",
		);
		expect(page.read("font")).toBe("");
		expect(page.styles.metrics().issues).toEqual({});
	},
);

it.each(keywords)(
	"uses native initial ancestry for root font:%s",
	(keyword) => {
		const page = fixture(`html{${localDeclarations};font:${keyword}}`);
		expect(fontValues(page.text("html"))).toEqual(initialFont);
		expect(fontValues(page.text())).toEqual(initialFont);
		expect(page.styles.metrics().issues).toEqual({});
	},
);

it.each(keywords)(
	"distinguishes button UA line-height from inherited font:%s",
	(keyword) => {
		const page = fontFixture(
			`font:${keyword}`,
			"stylesheet",
			'<button id="target"><span>AA</span></button>',
		);
		expect(fontValues(page.text())).toEqual(
			keyword === "initial"
				? initialFont
				: {
						...parentFont,
						"line-height": keyword === "revert" ? "normal" : "2",
					},
		);
		expect(page.text()).toMatchObject({
			"text-align": "center",
			"text-indent": "0px",
			"text-transform": "none",
		});
	},
);

it.each(
	controls.flatMap((control) =>
		keywords.map((keyword) => ({ ...control, keyword })),
	),
)(
	"computes all five $kind longhands for font:$keyword",
	({ markup, keyword }) => {
		const page = fontFixture(`font:${keyword}`, "inline", markup);
		const expected = keyword === "initial" ? initialFont : parentFont;
		expect(fontValues(page.text())).toEqual(expected);
		for (const component of components)
			expect(page.read(component)).toBe(
				component === "line-height" && keyword !== "initial"
					? "48px"
					: expected[component],
			);
		expect(page.styles.metrics().issues).toEqual({});
	},
);

it.each(
	routes.flatMap((route) =>
		["2", "48px"].map((lineHeight) => ({ route, lineHeight })),
	),
)(
	"retains $lineHeight inheritance after later child size changes through $route",
	({ route, lineHeight }) => {
		const page = fontFixture(
			"font:inherit;font-size:32px",
			route,
			undefined,
			`#parent{line-height:${lineHeight}}#target{display:block;width:96px}`,
		);
		expect(page.text()["line-height"]).toBe(lineHeight);
		expect(page.read("line-height")).toBe(lineHeight === "2" ? "64px" : "48px");
		expect(page.rect().height).toBe(lineHeight === "2" ? 64 : 48);
		const inline = new InlineStyles(page.tree, factory).get(
			page.id(),
		) as InlineStyle;
		inline.setProperty("font-size", "40px");
		expect(page.text()["font-size"]).toBe("40px");
		expect(page.text()["line-height"]).toBe(lineHeight);
		expect(page.read("line-height")).toBe(lineHeight === "2" ? "80px" : "48px");
		expect(page.rect().height).toBe(lineHeight === "2" ? 80 : 48);
	},
);

it.each(keywords)(
	"leaves unrelated local text properties intact for font:%s",
	(keyword) => {
		const page = fontFixture(
			`white-space:pre-wrap;overflow-wrap:anywhere;hyphens:none;text-align:right;text-indent:7px;text-transform:uppercase;font:${keyword}`,
		);
		expect(page.text()).toMatchObject({
			"white-space": "pre-wrap",
			"overflow-wrap": "anywhere",
			hyphens: "none",
			"text-align": "right",
			"text-indent": "7px",
			"text-transform": "uppercase",
		});
	},
);

const priorityCases = [
	{
		declaration: "font-size:12px!important;font:inherit",
		size: "12px",
		style: "italic",
	},
	{
		declaration: "font:inherit!important;font-size:12px",
		size: "24px",
		style: "italic",
	},
	{
		declaration: "font:inherit;font-size:12px",
		size: "12px",
		style: "italic",
	},
	{
		declaration: "font-size:12px;font:inherit",
		size: "24px",
		style: "italic",
	},
	{
		declaration: "font:initial!important;font:inherit!important",
		size: "24px",
		style: "italic",
	},
	{
		declaration: "font:inherit!important;font-style:normal!important",
		size: "24px",
		style: "normal",
	},
] as const;

it.each(
	routes.flatMap((route) =>
		priorityCases.map((entry) => ({ route, ...entry })),
	),
)(
	"preserves component priority and order in $route $declaration",
	({ route, declaration, size, style }) => {
		const page = fontFixture(declaration, route);
		expect(fontValues(page.text())).toEqual({
			...parentFont,
			"font-size": size,
			"font-style": style,
		});
	},
);

it("respects stylesheet importance before and after inline shorthand replacement", () => {
	const page = fontFixture("font:initial!important");
	page.tree.setAttribute(page.id(), "style", "font:inherit");
	expect(fontValues(page.text())).toEqual(initialFont);
	page.tree.setAttribute(page.id(), "style", "font:inherit!important");
	expect(fontValues(page.text())).toEqual(parentFont);
});

it.each(keywordRoutes)(
	"resolves $route deferred fallback font:$keyword before button default handling",
	({ route, keyword }) => {
		const page = fontFixture(
			`font:var(--Missing, ${keyword})`,
			route,
			'<button id="target"><span>AA</span></button>',
		);
		expect(fontValues(page.text())).toEqual(
			keyword === "initial"
				? initialFont
				: {
						...parentFont,
						"line-height": keyword === "revert" ? "normal" : "2",
					},
		);
		expect(page.styles.metrics().issues).toEqual({});
	},
);

it.each(
	routes.flatMap((route) =>
		invalidVariables.map((entry) => ({ route, ...entry })),
	),
)(
	"does not resurrect earlier local fonts after $route $name substitution",
	({ route, value, custom }) => {
		const page = fontFixture(
			`font:${value};font-weight:400!important`,
			route,
			'<button id="target"><span>AA</span></button>',
			`#parent{${custom}}`,
		);
		expect(fontValues(page.text())).toEqual({
			...parentFont,
			"font-weight": "400",
		});
		expect(page.read("line-height")).toBe("48px");
	},
);

it.each(routes)(
	"keeps deferred custom-property names case-sensitive through %s",
	(route) => {
		const page = fontFixture(
			"font:var(--Font)",
			route,
			undefined,
			"#parent{--Font:var(--Absent, inherit);--font:var(--Absent, initial)}",
		);
		expect(fontValues(page.text())).toEqual(parentFont);
		page.tree.setAttribute(page.id(), "style", "font:var(--font)");
		expect(fontValues(page.text())).toEqual(initialFont);
	},
);

it("refreshes live ancestor, inline and computed caches without serializing a full computed font", () => {
	const page = fontFixture("font:inherit", "inline");
	const inlineStyles = new InlineStyles(page.tree, factory);
	const inline = inlineStyles.get(page.id()) as InlineStyle;
	const ancestor = inlineStyles.get(page.id("#parent")) as InlineStyle;
	const computed = new ComputedStyles(page.tree, factory).get(
		page.id(),
	) as ComputedStyle;
	const before = page.text();
	expect(page.text()).toBe(before);
	expect(inline.font).toBe("inherit");
	expect(computed.getPropertyValue("font-size")).toBe("24px");
	expect(computed.getPropertyValue("font")).toBe("");
	ancestor.setProperty("font-size", "32px");
	ancestor.setProperty("line-height", "3");
	expect(page.text()).not.toBe(before);
	expect(fontValues(before)).toEqual(parentFont);
	expect(computed.getPropertyValue("font-size")).toBe("32px");
	expect(computed.getPropertyValue("line-height")).toBe("96px");
	inline.font = "initial";
	expect(fontValues(page.text())).toEqual(initialFont);
	inline.font = "inherit";
	inline.setProperty("font-size", "20px");
	expect(computed.getPropertyValue("font-size")).toBe("20px");
	expect(computed.getPropertyValue("line-height")).toBe("60px");
	inline.removeProperty("font");
	expect(fontValues(page.text())).toEqual(localFont);
	page.tree.setAttribute(page.id(), "style", "font:inherit");
	page.tree.setAttribute(
		page.id("#parent"),
		"style",
		"font-size:40px;line-height:30px",
	);
	expect(inline.font).toBe("inherit");
	expect(computed.getPropertyValue("font-size")).toBe("40px");
	expect(computed.getPropertyValue("line-height")).toBe("30px");
	expect(computed.getPropertyValue("font")).toBe("");
});

it.each(keywords)(
	"inherits generated font:%s from its originating element",
	(keyword) => {
		const page = fontFixture(
			"font:inherit;font-size:20px",
			"stylesheet",
			undefined,
			`#target::before{content:"B";${localDeclarations};font:${keyword}}#target::after{content:"A";${localDeclarations};font:var(--Missing, ${keyword})}`,
		);
		for (const name of ["before", "after"] as const) {
			const generated = page.styles.generatedContent(page.id(), name);
			expect(generated).toBeDefined();
			if (!generated) throw new Error(`Missing ::${name}`);
			expect(fontValues(generated.typography)).toEqual(
				keyword === "initial"
					? initialFont
					: { ...parentFont, "font-size": "20px" },
			);
		}
	},
);

it.each(invalidVariables)(
	"does not resurrect generated local fonts after $name substitution",
	({ value, custom }) => {
		const page = fontFixture(
			"font:inherit;font-size:20px",
			"stylesheet",
			undefined,
			`#parent{${custom}}#target::before{content:"B";${localDeclarations};font:${value};font-weight:400!important}`,
		);
		expect(
			page.styles.generatedContent(page.id(), "before")?.typography,
		).toMatchObject({
			...parentFont,
			"font-size": "20px",
			"font-weight": "400",
		});
	},
);

it("invalidates generated inherited font caches after ancestor and inline variable changes", () => {
	const page = fontFixture(
		"font:inherit",
		"inline",
		undefined,
		`#target::before{content:"B";${localDeclarations};font:var(--Font, inherit)}`,
	);
	const before = page.styles.generatedContent(page.id(), "before");
	expect(before?.typography).toMatchObject(parentFont);
	page.tree.setAttribute(page.id("#parent"), "style", "font-size:32px");
	const inherited = page.styles.generatedContent(page.id(), "before");
	expect(inherited).not.toBe(before);
	expect(inherited?.typography).toMatchObject({
		...parentFont,
		"font-size": "32px",
	});
	page.tree.setAttribute(
		page.id(),
		"style",
		"font:inherit;--Font:var(--Absent, initial)",
	);
	expect(
		page.styles.generatedContent(page.id(), "before")?.typography,
	).toMatchObject(initialFont);
	expect(before?.typography).toMatchObject(parentFont);
});

it.each(
	routes.flatMap((route) =>
		[
			{ kind: "ordinary text", markup: '<div id="target">AA</div>' },
			{
				kind: "rich button",
				markup: '<button id="target"><span id="content">AA</span></button>',
			},
		].map((entry) => ({ route, ...entry })),
	),
)(
	"changes real geometry, raster and hits for $route $kind like canonical longhands",
	({ route, markup }) => {
		const css =
			'#parent{font-family:"agent mono";font-style:normal;font-weight:400}#target{display:block;width:64px;margin:0;padding:0;border:0;background:red;text-align:left}';
		const page = fontFixture("", route, markup, css);
		const beforeRect = page.rect();
		const beforeImage = image(page);
		expect(beforeRect).toMatchObject({ x: 0, y: 0, width: 64, height: 8 });
		expect(pixel(beforeImage, 60, 40)).toEqual([255, 255, 255, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(60, 47)).not.toBe(
			page.id(),
		);
		if (route === "inline") {
			const inline = new InlineStyles(page.tree, factory).get(
				page.id(),
			) as InlineStyle;
			inline.font = "inherit";
		} else {
			page.tree.setTextContent(
				page.id("style"),
				`html,body{margin:0;padding:0;background:white}#parent{${parentDeclarations}}#target{${localDeclarations};font:inherit}${css}`,
			);
		}
		const canonical = fontFixture(
			components.map((component) => `${component}:inherit`).join(";"),
			route,
			markup,
			css,
		);
		const afterRect = page.rect();
		const afterImage = image(page);
		expect(afterRect).toMatchObject({ x: 0, y: 0, width: 64, height: 48 });
		expect(afterRect).not.toEqual(beforeRect);
		expect(afterRect).toEqual(canonical.rect());
		expect(afterImage).not.toEqual(beforeImage);
		expect(afterImage).toEqual(image(canonical));
		expect(pixel(afterImage, 60, 40)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(60, 47)).toBe(
			page.id(),
		);
		expect(documentHitTesting(canonical.tree).elementFromPoint(60, 47)).toBe(
			canonical.id(),
		);
		expect(page.styles.metrics().issues).toEqual({});
		expect(page.styles.diagnostics().samples).toEqual([]);
		expect(canonical.styles.metrics().issues).toEqual({});
	},
);

it.each(controls)(
	"preserves $kind bitmap metrics rather than adding arbitrary CSS line-height rendering",
	({ markup }) => {
		const css = "#target{display:block;width:96px;height:80px}";
		const page = fontFixture("font:inherit", "stylesheet", markup, css);
		const tallerLine = fontFixture(
			"font:inherit;line-height:100px",
			"stylesheet",
			markup,
			css,
		);
		expect(page.read("line-height")).toBe("48px");
		expect(tallerLine.read("line-height")).toBe("100px");
		for (const current of [page, tallerLine]) {
			const formatting = buildFormattingTree(current.tree);
			const target = formatting.nodes.find(
				(node) => node.ref === current.tree.reference(current.id()),
			);
			expect(target?.control).toMatchObject({ fontSize: 24 });
		}
		expect(page.rect()).toEqual(tallerLine.rect());
		expect(image(page)).toEqual(image(tallerLine));
	},
);

it("does not bypass the native text font limit through shorthand inheritance", () => {
	const page = fontFixture(
		"font:inherit",
		"stylesheet",
		undefined,
		`#parent{font-size:${bitmapFont.maxFontSize + 1}px}`,
	);
	expect(page.text()["font-size"]).toBe(`${bitmapFont.maxFontSize + 1}px`);
	expect(() => textFontExtent(page.text())).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Text font size limit exceeded",
		}),
	);
});

it.each(controls)(
	"does not bypass the native $kind font guard through shorthand inheritance",
	({ markup }) => {
		const page = fontFixture(
			"font:inherit",
			"inline",
			markup,
			`#parent{font-size:${bitmapFont.maxFontSize + 1}px}`,
		);
		expect(page.text()["font-size"]).toBe(`${bitmapFont.maxFontSize + 1}px`);
		expect(() =>
			describeControl(
				page.tree,
				page.id(),
				Number.parseFloat(page.read("font-size")),
			),
		).toThrow(
			expect.objectContaining({
				code: "resource-limit",
				message: "Control font limit exceeded",
			}),
		);
	},
);

it.each([
	["font:italic 16px/1.5 monospace", "unimplemented-or-invalid-css-value"],
	["font:caption", "unimplemented-or-invalid-css-value"],
	["font:inherit 16px", "unimplemented-or-invalid-css-value"],
	["font:revert-layer", "unimplemented-or-invalid-css-value"],
	["font-variant:small-caps", "unimplemented-css-property"],
	["font-kerning:none", "unimplemented-css-property"],
] as const)(
	"retains the native unsupported boundary for %s",
	(declaration, issue) => {
		const page = fontFixture(declaration);
		expect(fontValues(page.text())).toEqual(localFont);
		expect(page.styles.metrics().issues[issue]).toBe(1);
	},
);
