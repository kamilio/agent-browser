import { expect, it } from "vitest";
import { parseCssContent } from "./css-content.js";
import {
	parseInlineDeclarations,
	serializeDeclarations,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import { cssVariableLimits } from "./css-variables.js";
import type { GeneratedContentStyle } from "./generated-content-style.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, type StyleLimits } from "./styles.js";

function fixture(
	css: string,
	html = '<main id="parent"><div id="target" class="item">Original text</div></main>',
	limits: Partial<StyleLimits> = {},
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><body>${html}`,
		"https://fixture.invalid/generated-content",
	);
	const queries = new DocumentQueries(tree);
	const styles = new DocumentStyles(tree, limits);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const generated = (
		name: "before" | "after" = "before",
	): GeneratedContentStyle => {
		const result = styles.generatedContent(target, name);
		if (!result) throw new Error(`Missing ::${name} style`);
		return result;
	};
	return { tree, queries, styles, id, target, generated };
}

it.each([
	['div::before{content:"tag"}.item::before{content:"class"}', "class"],
	['#target::before{content:"id"}.item::before{content:"class"}', "id"],
	['.item::before{content:"first"}.item::before{content:"last"}', "last"],
	[
		'#target::before{content:"id"}::before{content:"important"!important}',
		"important",
	],
	[
		'#target::before{content:"id"!important}.item::before{content:"class"!important}',
		"id",
	],
	[
		'.item::before{content:"first"!important}.item::before{content:"last"!important}',
		"last",
	],
	['.item::before{content:"first"!important;content:"last"}', "first"],
	[
		'#missing,.item::before{content:"list"}div.item::before{content:"compound"}',
		"compound",
	],
	[
		'#target,.item::before{content:"list"}div.item::before{content:"compound"}',
		"compound",
	],
	[
		'#target::after,.item::before{content:"list"}div.item::before{content:"compound"}',
		"compound",
	],
	[
		'#target:before{content:"legacy"}#target::before{content:"modern"}',
		"modern",
	],
] as const)("cascades generated content independently: %s", (css, expected) => {
	const { tree, generated } = fixture(css);
	expect(generated().content).toBe(expected);
	tree.close();
});

it("does not let many classes outweigh an ID in generated content cascade", () => {
	const { tree, generated } = fixture(
		`#target::before{content:"id"}${".item".repeat(100)}::before{content:"classes"}`,
	);
	expect(generated().content).toBe("id");
	tree.close();
});

it("keeps origin inline importance out of the pseudo cascade", () => {
	const { tree, styles, target, generated } = fixture(
		'#target::before{content:"pseudo";width:12px;color:red}',
	);
	tree.setAttribute(
		target,
		"style",
		'content:"inline"!important;width:91px!important;color:blue!important',
	);
	expect(generated()).toMatchObject({
		content: "pseudo",
		box: { width: "12px" },
		paint: { color: [255, 0, 0, 255] },
	});
	expect(styles.box(target).width).toBe("91px");
	expect(styles.paint(target).color).toEqual([0, 0, 255, 255]);
	tree.close();
});

it("applies mixed universal box sizing without leaking pseudo declarations onto origins", () => {
	const { tree, styles, target, generated } = fixture(`
		*, *::before, *::after { box-sizing: border-box }
		#target { width: 91px; content: "origin" }
		#target::before { content: "before"; width: 12px }
		#target::after { content: "after"; width: 23px }
	`);
	expect(styles.box(target)).toMatchObject({
		width: "91px",
		"box-sizing": "border-box",
	});
	expect(generated().box).toMatchObject({
		width: "12px",
		"box-sizing": "border-box",
	});
	expect(generated("after").box).toMatchObject({
		width: "23px",
		"box-sizing": "border-box",
	});
	expect(generated().content).toBe("before");
	expect(generated("after").content).toBe("after");
	tree.close();
});

it("returns a frozen record with computed native style components", () => {
	const { tree, generated } = fixture(`
		html { font-size: 10px }
		#target { font-size: 20px }
		#target::before {
			content: ""; display: inline-block; font-size: 150%; color: red;
			width: 2rem; padding-left: .5em; position: relative; left: 3px;
			flex-direction: column; grid-auto-flow: column; list-style-type: square;
			border-collapse: collapse; outline: 2px solid blue;
			text-decoration-line: underline; clip-path: none;
		}
	`);
	const result = generated();
	expect(result).toMatchObject({
		content: "",
		display: "inline-block",
		visible: true,
		box: { width: "20px", "padding-left": "15px", left: "3px" },
		typography: { "font-size": "30px" },
		paint: { color: [255, 0, 0, 255] },
		flow: { position: "relative" },
		flex: { "flex-direction": "column" },
		grid: { "grid-auto-flow": "column" },
		list: { "list-style-type": "square" },
		table: { "border-collapse": "collapse" },
		outline: { "outline-width": "2px", "outline-style": "solid" },
		textDecoration: { "text-decoration-line": "underline" },
	});
	expect(Object.isFrozen(result)).toBe(true);
	for (const component of [
		result.box,
		result.typography,
		result.paint,
		result.flow,
		result.flex,
		result.grid,
		result.list,
		result.table,
		result.outline,
		result.textDecoration,
		result.clip,
	])
		expect(Object.isFrozen(component)).toBe(true);
	tree.close();
});

it("inherits inherited properties from the origin but initializes non-inherited ones", () => {
	const { tree, generated } = fixture(`
		#target {
			display: block; width: 91px; margin-left: 9px; box-sizing: border-box;
			font-size: 24px; font-weight: 700; white-space: pre; color: blue;
			background-color: red; position: relative; flex-direction: column;
			list-style-type: square; border-collapse: collapse;
			text-decoration-line: underline;
		}
		#target::before { content: "inherited" }
	`);
	expect(generated()).toMatchObject({
		display: "inline",
		box: { width: "auto", "margin-left": "0px", "box-sizing": "content-box" },
		typography: {
			"font-size": "24px",
			"font-weight": "700",
			"white-space": "pre",
		},
		paint: { color: [0, 0, 255, 255], "background-color": [0, 0, 0, 0] },
		flow: { position: "static" },
		flex: { "flex-direction": "row" },
		list: { "list-style-type": "square" },
		table: { "border-collapse": "collapse" },
		textDecoration: { "text-decoration-line": "none" },
	});
	tree.close();
});

it("resolves explicit inherit against the origin, including its non-rendered content", () => {
	const { tree, styles, target, generated } = fixture(`
		#target { content: "origin"; display: block; width: 91px; background-color: red; position: relative }
		#target::before { content: inherit; display: inherit; width: inherit; background-color: inherit; position: inherit }
	`);
	expect(generated()).toMatchObject({
		content: "origin",
		display: "block",
		box: { width: "91px" },
		paint: { "background-color": [255, 0, 0, 255] },
		flow: { position: "relative" },
	});
	expect(styles.generatedContent(target, "after")).toBeUndefined();
	expect(tree.textContent(target)).toBe("Original text");
	expect(styles.metrics().issues["unimplemented-element-content"]).toBe(1);
	tree.close();
});

it.each(["normal", "none"])(
	"does not diagnose ordinary-element content:%s as replacement",
	(value) => {
		const { tree, styles, target } = fixture(
			`#target{content:${value}}#target::before{content:inherit}`,
		);
		expect(styles.generatedContent(target, "before")).toBeUndefined();
		expect(styles.metrics().issues["unimplemented-element-content"] ?? 0).toBe(
			0,
		);
		expect(tree.textContent(target)).toBe("Original text");
		tree.close();
	},
);

it.each(["normal", "none", "initial", "unset"])(
	"does not generate for content: %s even when the origin has content",
	(value) => {
		const { tree, styles, target } = fixture(
			`#target{content:"origin"}#target::before{content:${value}}`,
		);
		expect(styles.generatedContent(target, "before")).toBeUndefined();
		tree.close();
	},
);

it.each(["initial", "unset"])(
	"applies all:%s without resetting custom properties",
	(keyword) => {
		const { tree, styles, target, id, generated } = fixture(`
		#target { color: blue; font-size: 24px; width: 91px }
		#target::before { --label: "kept"; content: "removed"; width: 15px; all: ${keyword} }
	`);
		expect(styles.generatedContent(target, "before")).toBeUndefined();
		tree.setTextContent(
			id("style"),
			`
		#target { color: blue; font-size: 24px; width: 91px }
		#target::before { --label: "kept"; width: 15px; all: ${keyword}; content: var(--label) }
	`,
		);
		expect(generated()).toMatchObject({
			content: "kept",
			display: "inline",
			box: { width: "auto" },
			typography: { "font-size": keyword === "initial" ? "16px" : "24px" },
			paint: {
				color: keyword === "initial" ? [0, 0, 0, 255] : [0, 0, 255, 255],
			},
		});
		tree.close();
	},
);

it("keeps important all resets ahead of later non-important content", () => {
	const { tree, styles, target } = fixture(
		'#target::before{content:"old";all:initial!important;content:"new"}',
	);
	expect(styles.generatedContent(target, "before")).toBeUndefined();
	tree.close();
});

it("scopes pseudo custom properties without leaking between targets or to descendants", () => {
	const { tree, styles, target, id, generated } = fixture(
		`
		#parent { --inherited: "parent" }
		#target { --label: "origin" }
		#target::before { --label: "before"; content: var(--label) " " var(--inherited) " " var(--missing, "fallback") }
		#target::after { content: var(--label) }
	`,
		'<main id="parent"><div id="target"><span id="child">Original text</span></div></main>',
	);
	expect(generated().content).toBe("before parent fallback");
	expect(generated("after").content).toBe("origin");
	expect(styles.custom(target, "--label")).toBe('"origin"');
	expect(styles.custom(id("#child"), "--label")).toBe('"origin"');
	tree.close();
});

it.each(["var(--missing)", "var(--number)", "var(--cycle)"] as const)(
	"invalid computed content does not revive an earlier winner: %s",
	(value) => {
		const { tree, styles, target } = fixture(`
		#target::before { --number: 42; --cycle: var(--cycle); content: "earlier"; content: ${value} }
	`);
		expect(styles.generatedContent(target, "before")).toBeUndefined();
		tree.close();
	},
);

it("uses variable fallbacks and unset inheritance for invalid computed non-content values", () => {
	const { tree, generated } = fixture(`
		#target { color: blue; width: 91px }
		#target::before {
			--cycle: var(--cycle); content: var(--cycle, "fallback");
			color: red; color: var(--missing); width: 12px; width: var(--missing);
		}
	`);
	expect(generated()).toMatchObject({
		content: "fallback",
		paint: { color: [0, 0, 255, 255] },
		box: { width: "auto" },
	});
	tree.close();
});

it("cascades pseudo custom-property importance before substituting content", () => {
	const { tree, generated } = fixture(`
		#target::before { --label: "id"; content: var(--label) }
		.item::before { --label: "important" !important }
		#target::before { --label: "later" }
	`);
	expect(generated().content).toBe("important");
	tree.close();
});

it("preserves case, whitespace, escapes and comment-like text across declaration paths", () => {
	const value = String.raw`" MiXeD  \41  B /*literal*/ ; !important " "Tail"`;
	const expected = " MiXeD  A B /*literal*/ ; !important Tail";
	const source = `CONTENT: ${value} !important`;
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 10 },
		(issue) => issues.push(issue),
	);
	expect(issues).toEqual([]);
	expect(parsed).toHaveLength(1);
	expect(parsed[0]).toMatchObject({ property: "content", important: true });
	expect(parseCssContent(parsed[0].value)?.text).toBe(expected);
	const entries = parseInlineDeclarations(source, 10);
	expect(entries).toHaveLength(1);
	expect(entries[0]).toMatchObject({ name: "content", important: true });
	expect(parseCssContent(entries[0].value)?.text).toBe(expected);
	const { tree, target, generated } = fixture(`
		#target::before { ${source} }
		#target::after { content: inherit }
	`);
	tree.setAttribute(target, "style", source);
	expect(generated().content).toBe(expected);
	expect(generated("after").content).toBe(expected);
	tree.setInlineDeclarations(target, serializeDeclarations(entries), entries);
	expect(generated("after").content).toBe(expected);
	tree.close();
});

it("distinguishes display suppression from inherited visibility", () => {
	const { tree, styles, target, id, generated } = fixture(`
		#target { visibility: hidden }
		#target::before { content: "hidden" }
		#target::after { content: "visible"; visibility: visible }
	`);
	expect(generated().visible).toBe(false);
	expect(generated("after").visible).toBe(true);
	tree.setAttribute(target, "style", "display:none");
	expect(styles.generatedContent(target, "before")).toBeUndefined();
	expect(styles.generatedContent(target, "after")).toBeUndefined();
	tree.setAttribute(target, "style", "");
	expect(generated("after").visible).toBe(true);
	tree.setAttribute(id("#parent"), "style", "display:none");
	expect(styles.generatedContent(target, "after")).toBeUndefined();
	tree.setAttribute(id("#parent"), "style", "");
	tree.setTextContent(
		id("style"),
		'#target::before{content:"hidden";display:none}',
	);
	expect(styles.generatedContent(target, "before")).toBeUndefined();
	tree.close();
});

it("refreshes cached pseudo styles for class, native state, media and stylesheet changes", () => {
	const { tree, queries, styles, target, id, generated } = fixture(`
		#target::before { content: "base" }
		#target.ready::before { content: "class" }
		#target:hover::before { content: "hover" }
		#target:focus::before { content: "focus" }
		@media (min-width: 200px) { #target::before { content: "wide" } }
	`);
	tree.setAttribute(target, "tabindex", "0");
	styles.setViewport(100, 100);
	const initial = generated();
	expect(initial.content).toBe("base");
	expect(generated()).toBe(initial);
	tree.setAttribute(target, "class", "ready");
	expect(generated().content).toBe("class");
	tree.setPointerState(target, null);
	expect(generated().content).toBe("hover");
	tree.setActiveElement(target);
	expect(queries.matches(target, ":focus")).toBe(true);
	expect(generated().content).toBe("focus");
	tree.setActiveElement(null);
	tree.setPointerState(null, null);
	tree.setAttribute(target, "class", "");
	styles.setViewport(300, 100);
	expect(generated().content).toBe("wide");
	styles.setViewport(100, 100);
	expect(generated().content).toBe("base");
	tree.setTextContent(id("style"), '#target::before{content:"edited"}');
	expect(generated().content).toBe("edited");
	expect(initial.content).toBe("base");
	tree.close();
});

it("invalidates inherited inline custom properties and cached absent content", () => {
	const { tree, styles, target, id, generated } = fixture(
		"#target::before{content:var(--label)}",
	);
	expect(styles.generatedContent(target, "before")).toBeUndefined();
	tree.setAttribute(id("#parent"), "style", '--label:"parent"');
	expect(generated().content).toBe("parent");
	tree.setAttribute(target, "style", '--label:"own"');
	expect(generated().content).toBe("own");
	tree.setAttribute(target, "style", "--label:42");
	expect(styles.generatedContent(target, "before")).toBeUndefined();
	tree.setAttribute(target, "style", '--label:"recovered"');
	expect(generated().content).toBe("recovered");
	tree.close();
});

it("charges generated style work once per cached target and revokes reads on close", () => {
	const { tree, styles, target, generated } = fixture(
		'#target::before{content:"before"}#target::after{content:"after"}',
	);
	const baseline = styles.metrics();
	expect(baseline.generatedContentWork).toBe(0);
	const before = generated();
	const firstRead = styles.metrics();
	expect(firstRead.generatedContentWork).toBeGreaterThan(0);
	expect(generated()).toBe(before);
	expect(styles.metrics().generatedContentWork).toBe(
		firstRead.generatedContentWork,
	);
	generated("after");
	expect(styles.metrics().generatedContentWork).toBeGreaterThan(
		firstRead.generatedContentWork,
	);
	const limited = new DocumentStyles(tree, { maxWork: baseline.work + 1 });
	expect(limited.metrics().work).toBe(baseline.work);
	expect(() => limited.generatedContent(target, "before")).toThrow(
		"CSS generated content work limit exceeded",
	);
	limited.close();
	tree.close();
	expect(() => styles.generatedContent(target, "before")).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
});

it("bounds retained bindings across both pseudo targets and recovers without stale content", () => {
	const declarations = Array.from(
		{ length: cssVariableLimits.maxProperties },
		(_value, index) => `--value${index}:"text"`,
	).join(";");
	const count =
		Math.floor(
			cssVariableLimits.maxRetainedBindings /
				(2 * cssVariableLimits.maxProperties),
		) + 1;
	const { tree, styles, target, id, generated } = fixture(
		'#target::before{content:"original"}',
		`<div id="target" class="scope"></div>${'<div class="scope"></div>'.repeat(count - 1)}`,
		{ maxWork: 50_000_000 },
	);
	expect(generated().content).toBe("original");
	tree.setTextContent(
		id("style"),
		`.scope::before,.scope::after{${declarations};content:var(--value0)}`,
	);
	expect(() => styles.generatedContent(target, "before")).toThrow(
		"CSS variable retention limit exceeded",
	);
	expect(() => styles.generatedContent(target, "before")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	tree.setTextContent(id("style"), '#target::before{content:"recovered"}');
	expect(generated().content).toBe("recovered");
	expect(styles.generatedContent(target, "after")).toBeUndefined();
	tree.close();
});

it("bounds retained custom-property text across pseudo targets", () => {
	const payload = "x".repeat(60_000);
	const count =
		Math.floor(cssVariableLimits.maxRetainedCodeUnits / (2 * payload.length)) +
		1;
	const { tree, styles, target } = fixture(
		`.scope::before,.scope::after{--payload:${payload};content:"text"}`,
		`<div id="target" class="scope"></div>${'<div class="scope"></div>'.repeat(count - 1)}`,
		{ maxWork: 50_000_000 },
	);
	expect(() => styles.generatedContent(target, "before")).toThrow(
		"CSS variable retention limit exceeded",
	);
	tree.close();
});

it("does not create DOM nodes, alter text or rebuild the cascade on repeated reads", () => {
	const { tree, styles, target, generated } = fixture(
		'#target::before{content:"before"}#target::after{content:"after"}',
	);
	const revision = tree.revision;
	const nodes = [...tree.walk()].map(({ node }) => node.id);
	const children = [...tree.get(target).children];
	generated();
	generated("after");
	const builds = styles.metrics().cascadeBuilds;
	for (let index = 0; index < 3; index++) {
		generated();
		generated("after");
	}
	expect(styles.metrics().cascadeBuilds).toBe(builds);
	expect(styles.metrics().issues["unimplemented-element-content"] ?? 0).toBe(0);
	expect(tree.revision).toBe(revision);
	expect([...tree.walk()].map(({ node }) => node.id)).toEqual(nodes);
	expect(tree.get(target).children).toEqual(children);
	expect(tree.textContent(target)).toBe("Original text");
	tree.close();
});
