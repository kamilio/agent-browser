import { afterEach, expect, it } from "vitest";
import { ComputedStyles, computedStyleProperties } from "./computed-styles.js";
import { inlineProperties } from "./css-declarations.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import {
	computeTextStyle,
	cssTextProperties,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeClientRects } from "./range-geometry.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";
import { planTextSpacing, type TextSpacingInput } from "./text-spacing.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content = "ABC", css = "", doctype = "<!doctype html>") {
	const tree = parseHtmlDocument(
		`${doctype}<style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:8px}#main{width:96px;letter-spacing:4px}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/letter-spacing-core",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(160, 96);
	const id = (selector = "#main") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing spacing fixture ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing spacing context");
		return found;
	};
	return { tree, id, styles, context };
}

function declarations(source: string) {
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		(issue) => issues.push(issue),
	);
	return { parsed, issues };
}

it.each([
	["normal", "normal"],
	["0", "0px"],
	["-0", "0px"],
	["+2.50px", "2.5px"],
	[".5em", "0.5em"],
	["1e-1rem", "0.1rem"],
	["initial", "initial"],
	["inherit", "inherit"],
	["unset", "unset"],
	["revert", "revert"],
])("parses the bounded spacing value %s", (value, expected) => {
	expect(parseTextValue("letter-spacing", value)).toBe(expected);
	expect(cssSupportsDeclaration("letter-spacing", value)).toBe(true);
	expect(declarations(`letter-spacing:${value}`)).toEqual({
		parsed: [{ property: "letter-spacing", value: expected, important: false }],
		issues: [],
	});
});

it.each([
	"-1px",
	"-.1em",
	"-1rem",
	"1",
	"2%",
	"0%",
	"1ex",
	"1vw",
	"1pt",
	"calc(1px + 2px)",
	"1e999px",
	"NaNpx",
	"infinity",
	"normal 1px",
	"1px 2px",
])("rejects unsupported or invalid spacing %s explicitly", (value) => {
	expect(parseTextValue("letter-spacing", value)).toBeUndefined();
	expect(cssSupportsDeclaration("letter-spacing", value)).toBe(false);
	const result = declarations(`letter-spacing:2px;letter-spacing:${value}`);
	expect(result.parsed).toEqual([
		{ property: "letter-spacing", value: "2px", important: false },
	]);
	expect(result.issues.length).toBeGreaterThan(0);
});

it("computes lengths after font size and inherits pixels without rescaling", () => {
	const viewport = { width: 160, height: 96 };
	const root = computeTextStyle(
		{ "font-size": "20px", "letter-spacing": ".5rem" },
		initialTextStyle,
		viewport,
		16,
		false,
		true,
	);
	expect(root["letter-spacing"]).toBe("10px");
	const child = computeTextStyle({ "font-size": "5px" }, root, viewport, 20);
	expect(child["letter-spacing"]).toBe("10px");
	expect(
		computeTextStyle(
			{ "font-size": "12px", "letter-spacing": ".25em" },
			child,
			viewport,
			20,
		)["letter-spacing"],
	).toBe("3px");
	expect(
		computeTextStyle({ "letter-spacing": ".25rem" }, child, viewport, 20)[
			"letter-spacing"
		],
	).toBe("5px");
	expect(
		computeTextStyle({ "letter-spacing": "0px" }, child, viewport, 20)[
			"letter-spacing"
		],
	).toBe("0px");
	expect(initialTextStyle["letter-spacing"]).toBe("0px");
});

it.each([
	["inherit", "4px"],
	["unset", "4px"],
	["revert", "4px"],
	["initial", "0px"],
	["normal", "0px"],
])("resolves inherited CSS-wide spacing %s", (value, expected) => {
	const page = fixture(
		`<span id="child" style="font-size:16px;letter-spacing:${value}">ABC</span>`,
	);
	expect(page.styles.text(page.id("#child"))["letter-spacing"]).toBe(expected);
});

interface Style {
	letterSpacing: string;
	cssText: string;
	getPropertyValue(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

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

it("exposes CSSOM accessors and refreshes layout after style mutations", () => {
	const page = fixture();
	const inline = new InlineStyles(page.tree, factory).get(page.id()) as Style;
	const computed = new ComputedStyles(page.tree, factory).get(
		page.id(),
	) as Style;
	for (const properties of [
		cssTextProperties,
		inlineProperties,
		computedStyleProperties,
	])
		expect(
			properties.filter((property) => property === "letter-spacing"),
		).toHaveLength(1);
	expect(computed.letterSpacing).toBe("4px");
	inline.letterSpacing = "1em";
	expect(inline.getPropertyValue("letter-spacing")).toBe("1em");
	expect(computed.letterSpacing).toBe("8px");
	expect(page.context().lines[0].width).toBe(34);
	inline.letterSpacing = "-1px";
	expect(computed.letterSpacing).toBe("8px");
	inline.setProperty("letter-spacing", "normal");
	expect(page.context().lines[0].width).toBe(18);
	expect(inline.removeProperty("letter-spacing")).toBe("normal");
	expect(page.context().lines[0].width).toBe(26);
	inline.cssText = "letter-spacing:0;font:initial";
	expect(computed.letterSpacing).toBe("normal");
});

it.each(["normal", "0", "0px", "0em", "0rem", "initial", "var(--zero, 0px)"])(
	"computes %s as zero pixels but resolves CSSOM as normal",
	(value) => {
		const page = fixture("ABC", `#main{letter-spacing:${value}}`);
		const computed = new ComputedStyles(page.tree, factory).get(
			page.id(),
		) as Style;
		const inline = new InlineStyles(page.tree, factory).get(page.id()) as Style;
		expect(page.styles.text(page.id())["letter-spacing"]).toBe("0px");
		expect(computed.letterSpacing).toBe("normal");
		expect(computed.getPropertyValue("letter-spacing")).toBe("normal");
		expect(page.context().lines[0].width).toBe(18);
		inline.setProperty("letter-spacing", "2px");
		expect(computed.letterSpacing).toBe("2px");
		expect(page.context().lines[0].width).toBe(22);
		inline.setProperty("letter-spacing", "0");
		expect(inline.getPropertyValue("letter-spacing")).toBe("0px");
		expect(computed.letterSpacing).toBe("normal");
		expect(page.context().lines[0].width).toBe(18);
	},
);

it("preserves priority and keeps font-wide resets independent of spacing", () => {
	const page = fixture("ABC", "#main{letter-spacing:4px!important}");
	const inline = new InlineStyles(page.tree, factory).get(page.id()) as Style;
	inline.setProperty("letter-spacing", "8px");
	expect(page.styles.text(page.id())["letter-spacing"]).toBe("4px");
	inline.setProperty("letter-spacing", "8px", "important");
	expect(page.styles.text(page.id())["letter-spacing"]).toBe("8px");
	inline.setProperty("font", "initial");
	expect(page.styles.text(page.id())["letter-spacing"]).toBe("8px");
});

it("resolves variables, fallback and root-relative invalidation", () => {
	const page = fixture(
		'<span id="child">ABC</span>',
		"#main{--tracking:.5rem;letter-spacing:var(--tracking)}",
	);
	expect(page.styles.text(page.id("#child"))["letter-spacing"]).toBe("4px");
	page.tree.setAttribute(page.id("html"), "style", "font-size:20px");
	expect(page.styles.text(page.id("#child"))["letter-spacing"]).toBe("10px");
	page.tree.setAttribute(
		page.id(),
		"style",
		"letter-spacing:var(--missing, 2px)",
	);
	expect(page.context().lines[0].width).toBe(22);
	page.tree.setAttribute(
		page.id(),
		"style",
		"--tracking:-1px;letter-spacing:var(--tracking)",
	);
	expect(page.styles.text(page.id())["letter-spacing"]).toBe("0px");
});

it("trims outer line spacing and averages adjacent inline values", () => {
	const page = fixture(
		'A<span style="letter-spacing:8px">B</span><span style="letter-spacing:0">C</span>',
	);
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 12, 22]);
	expect(page.context().glyphs.map((glyph) => glyph.advance)).toEqual([
		12, 10, 6,
	]);
	expect(page.context().lines[0].width).toBe(28);
});

it("tracks generated and expanded text rather than source UTF-16 lengths", () => {
	const page = fixture(
		'<span id="word">ß</span>',
		'#main{text-transform:uppercase}#word::before{content:"A"}#word::after{content:"B"}',
	);
	const context = page.context();
	expect(context.glyphs.map((glyph) => glyph.character).join("")).toBe("ASSB");
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual([0, 10, 20, 30]);
	expect(context.lines[0].width).toBe(36);
});

it.each([
	["normal", 26, [16, 16]],
	["nowrap", 26, [46]],
])("measures whitespace and wrapping in %s", (mode, width, expected) => {
	const page = fixture(
		"  AA   AA  ",
		`#main{width:${width}px;white-space:${mode}}`,
	);
	expect(page.context().lines.map((line) => line.width)).toEqual(expected);
});

it("fits an exact spaced line and trims emergency-wrap boundaries", () => {
	const exact = fixture("ABC", "#main{width:26px;overflow-wrap:anywhere}");
	expect(exact.context().lines.map((line) => line.width)).toEqual([26]);
	const wrapped = fixture("ABC", "#main{width:16px;overflow-wrap:anywhere}");
	expect(wrapped.context().lines.map((line) => line.width)).toEqual([16, 6]);
	expect(wrapped.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 10, 0]);
});

it("keeps preserved spaces, hard breaks and existing tab stops", () => {
	const page = fixture("A \nB\tC", "#main{white-space:pre}");
	expect(page.context().lines.map((line) => line.width)).toEqual([16, 54]);
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([
		0, 10, 0, 6, 48,
	]);
});

it("measures min-content and max-content with the same spacing edges", () => {
	const page = fixture("AA AA");
	const measured = measureIntrinsicWidths(page.tree).widths.find(
		(entry) => entry.ref === page.tree.reference(page.id()),
	);
	expect(measured).toMatchObject({ minContent: 16, maxContent: 46 });
});

it("keeps tracked atomic inline boundaries explicitly unsupported", () => {
	const page = fixture(
		'A<span style="display:inline-block;width:8px;height:8px"></span>B',
	);
	expect(
		buildFormattingTree(page.tree).issues[
			"letter-spacing-atomic-boundary-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow();
	const detached = fixture('<span style="display:inline-block">ABC</span>');
	expect(
		buildFormattingTree(detached.tree).issues[
			"letter-spacing-atomic-boundary-not-supported"
		],
	).toBeUndefined();
	expect(
		layoutDocument(detached.tree).contexts.some(
			(context) => context.lines[0]?.width === 26,
		),
	).toBe(true);
});

it("tracks only visible discretionary hyphens and trims their line ends", () => {
	const unbroken = fixture("AB&shy;CD");
	expect(unbroken.context().lines[0].width).toBe(36);
	const broken = fixture("AB&shy;CD", "#main{width:26px}");
	expect(broken.context().lines.map((line) => line.width)).toEqual([26, 16]);
	expect(
		broken
			.context()
			.glyphs.map((glyph) => glyph.character)
			.join(""),
	).toBe("AB-CD");
});

function spacingInput(id: number, text: string): TextSpacingInput {
	return {
		id,
		text,
		transform: "none",
		whiteSpace: "normal",
		letterSpacing: 4,
	};
}

it("does not add boundaries inside cross-node combining or astral clusters", () => {
	const plan = planTextSpacing(
		[spacingInput(1, "e"), spacingInput(2, "\u0301B🙂C")],
		undefined,
		() => {},
	);
	expect(plan.get(1)).toBeUndefined();
	expect(
		[...plan.get(2)!.entries()].map(([offset, indices]) => [
			offset,
			[...indices],
		]),
	).toEqual([
		[0, [[0, 4]]],
		[1, [[0, 4]]],
		[2, [[0, 4]]],
	]);
	const page = fixture('e<span id="mark">\u0301</span>B');
	const partial = layoutDocumentText(page.tree).contexts.find(
		(entry) => entry.ref === page.tree.reference(page.id()),
	);
	expect(partial?.glyphs.map((glyph) => glyph.x)).toEqual([0, 6, 16]);
	const range = domRangeOwner(page.tree).createRange();
	const text = page.tree.get(page.id("#mark")).children[0];
	range.setStart(text, 0);
	range.setEnd(text, 1);
	expect(() => rangeClientRects(range)).toThrow("bidi or shaped text");
});

it("does not create extra tracking boundaries for invisible formatting units", () => {
	const plan = planTextSpacing(
		[spacingInput(1, "A\u200b\u2060\ufeffB")],
		undefined,
		() => {},
	);
	expect([...plan.get(1)!.keys()]).toEqual([0]);
	expect(plan.get(1)?.get(0)?.get(0)).toBe(4);
});

it("keeps replaced-text spacing explicitly unsupported", () => {
	const page = fixture('<input value="ABC">');
	expect(
		buildFormattingTree(page.tree).issues[
			"letter-spacing-replaced-text-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow();
});

it("rejects nonzero tracking in the independent quirks image label pipeline", () => {
	const page = fixture('<img alt="ABC" width="40">', "", "");
	expect(
		buildFormattingTree(page.tree).issues[
			"letter-spacing-replaced-text-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow();
	page.tree.setAttribute(page.id(), "style", "letter-spacing:normal");
	expect(
		buildFormattingTree(page.tree).issues[
			"letter-spacing-replaced-text-not-supported"
		],
	).toBeUndefined();
});

it.each(["inside", "outside"])(
	"rejects tracked %s numeric marker labels",
	(position) => {
		const page = fixture(
			"<ol><li>ABC</li></ol>",
			`li{list-style:decimal ${position}}`,
		);
		expect(
			buildFormattingTree(page.tree).issues[
				"letter-spacing-marker-text-not-supported"
			],
		).toBeGreaterThan(0);
		expect(() => layoutDocument(page.tree)).toThrow();
		page.tree.setAttribute(page.id(), "style", "letter-spacing:0");
		expect(
			buildFormattingTree(page.tree).issues[
				"letter-spacing-marker-text-not-supported"
			],
		).toBeUndefined();
	},
);

it("keeps spacing work and computed lengths bounded", () => {
	const page = fixture("ABC");
	expect(() => layoutDocumentText(page.tree, { maxWork: 8 })).toThrow();
	expect(() =>
		computeTextStyle(
			{ "letter-spacing": "16777217px" },
			initialTextStyle,
			{ width: 160, height: 96 },
			16,
		),
	).toThrow("Layout length limit exceeded");
	let work = 0;
	expect(() =>
		planTextSpacing([spacingInput(1, "ABC")], undefined, (units = 1) => {
			work += units;
			if (work > 4) throw new Error("spacing work exhausted");
		}),
	).toThrow("spacing work exhausted");
});
