import { afterEach, expect, it } from "vitest";
import {
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineDeclarationComponents,
	inlineProperties,
	parseInlineDeclarations,
	propertyValue,
} from "./css-declarations.js";
import { cssGridProperties, initialGridStyle } from "./css-grid.js";
import { parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(css = "", content = '<span id="target">text</span>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:20px}#outer{font-size:10px}#target{font-size:12px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/grid-css",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing grid fixture node");
		return found;
	};
	const styles = documentStyles(tree);
	return {
		tree,
		id,
		styles,
		grid: () => styles.grid(id()),
		read: (property: string) => resolvedStyleValue(tree, id(), property),
	};
}

it.each(cssGridProperties)(
	"registers %s in stylesheet, inline, all reset and computed style paths",
	(property) => {
		expect(inlineProperties).toContain(property);
		expect(computedStyleProperties).toContain(property);
		expect(inlineDeclarationComponents("all")).toContain(property);
		const { read, styles } = fixture();
		expect(read(property)).toBe(initialGridStyle[property]);
		expect(styles.metrics().gridProperties).toContain(property);
	},
);

it("preserves line and area name case while normalizing CSS keywords", () => {
	const { grid } = fixture(
		'#target{grid-template-columns:[Left LEFT] MINMAX(0, 1FR) [Right];grid-template-areas:"Header Header" "Body Sidebar";grid-area:Body;grid-auto-flow:COLUMN DENSE}',
	);
	expect(grid()).toMatchObject({
		"grid-template-columns": "[Left LEFT] minmax(0px, 1fr) [Right]",
		"grid-template-areas": '"Header Header" "Body Sidebar"',
		"grid-row-start": "Body",
		"grid-column-start": "Body",
		"grid-row-end": "Body",
		"grid-column-end": "Body",
		"grid-auto-flow": "column dense",
	});
});

it("substitutes captured MDN-style named tracks without lowercasing names", () => {
	const { grid, read } = fixture(
		'#outer{--sidebar:15rem;--gap:2rem;--content:48rem;--tracks:[Full-start Left-start] minmax(var(--sidebar),1fr) [Left-end] var(--gap) [Content-start] minmax(0,var(--content)) [Content-end] var(--gap) [Right-start] minmax(var(--sidebar),1fr) [Full-end Right-end]}#target{grid-template-columns:var(--tracks);grid-template-rows:min-content 1fr;grid-template-areas:"Left . Header . Right" "Left . Body . Right";grid-area:Body}',
	);
	expect(grid()["grid-template-columns"]).toBe(
		"[Full-start Left-start] minmax(300px, 1fr) [Left-end] 40px [Content-start] minmax(0px, 960px) [Content-end] 40px [Right-start] minmax(300px, 1fr) [Full-end Right-end]",
	);
	expect(read("grid-template-rows")).toBe("min-content 1fr");
	expect(read("grid-column-start")).toBe("Body");
});

it("computes local and root font units but retains percentage and flexible tracks", () => {
	const { grid } = fixture(
		"#target{grid-template-columns:1em 2rem 25% minmax(0,2fr);grid-auto-rows:3em}",
	);
	expect(grid()["grid-template-columns"]).toBe(
		"12px 40px 25% minmax(0px, 2fr)",
	);
	expect(grid()["grid-auto-rows"]).toBe("36px");
});

it.each([
	["font-size:1e20px", "grid-template-columns:[Name1em] 10px"],
	["font-size:1e20px", 'grid-template-areas:"Name1em"'],
	["font-size:1e20px", "grid-area:Name1em"],
	["font-size:1e20px", "grid-template-columns:[Name1rem] 10px"],
])(
	"does not treat Grid names as font-relative dimensions: %s; %s",
	(font, declaration) => {
		const { grid } = fixture(`html{${font}}#target{${font};${declaration}}`);
		expect(() => grid()).not.toThrow();
	},
);

it("still resolves font metrics for real Grid dimensions", () => {
	expect(() =>
		fixture("#target{font-size:1e20px;grid-template-columns:2em}").grid(),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(
		fixture("#target{font-size:1e20px;grid-template-columns:2px}").grid()[
			"grid-template-columns"
		],
	).toBe("2px");
});

it("inherits computed tracks without resolving the parent's em again", () => {
	const { grid } = fixture(
		"#outer{grid-template-columns:[Start] 2em [End];grid-area:Panel}#target{grid-template-columns:inherit;grid-area:inherit}",
	);
	expect(grid()["grid-template-columns"]).toBe("[Start] 20px [End]");
	expect(grid()["grid-row-start"]).toBe("Panel");
	expect(
		fixture("#outer{grid-template-columns:50px;grid-area:Panel}").grid(),
	).toEqual(initialGridStyle);
});

it.each(["initial", "unset", "revert"])(
	"resets Grid with all:%s",
	(keyword) => {
		expect(
			fixture(
				`#target{grid-template-columns:25px;grid-area:Panel;all:${keyword}}`,
			).grid(),
		).toEqual(initialGridStyle);
	},
);

it("preserves mixed-case custom identifiers in variable placement shorthands", () => {
	const { grid } = fixture(
		"#outer{--place:Panel / Main / span 2 / End}#target{grid-area:var(--place)}",
	);
	expect(grid()).toMatchObject({
		"grid-row-start": "Panel",
		"grid-column-start": "Main",
		"grid-row-end": "span 2",
		"grid-column-end": "End",
	});
});

it("uses initial tracks for invalid-at-computed-value variables rather than earlier winners", () => {
	const { grid } = fixture(
		"#target{--bad:-1px;grid-template-columns:20px;grid-template-columns:var(--bad);grid-area:Panel;grid-area:var(--missing)}",
	);
	expect(grid()).toEqual(initialGridStyle);
});

it("keeps valid earlier declarations when later Grid syntax is invalid", () => {
	const { grid, styles } = fixture(
		'#target{grid-template-columns:20px;grid-template-columns:-1fr;grid-template-areas:"Area Area";grid-template-areas:"Area ." ". Area"}',
	);
	expect(grid()["grid-template-columns"]).toBe("20px");
	expect(grid()["grid-template-areas"]).toBe('"Area Area"');
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(2);
});

it("invalidates computed Grid after viewport, font, style and parent changes", () => {
	const { tree, styles, id, grid } = fixture(
		"#target{grid-template-columns:10vw 2rem;grid-row-start:inherit}#outer{grid-row-start:Upper}",
	);
	styles.setViewport(200, 100);
	expect(grid()["grid-template-columns"]).toBe("20px 40px");
	expect(grid()["grid-row-start"]).toBe("Upper");
	tree.setAttribute(id("html"), "style", "font-size:30px");
	styles.setViewport(400, 100);
	expect(grid()["grid-template-columns"]).toBe("40px 60px");
	tree.append(id("body"), id());
	expect(grid()["grid-row-start"]).toBe("auto");
	tree.setAttribute(id(), "style", "grid-template-columns:[Next] 15px");
	expect(grid()["grid-template-columns"]).toBe("[Next] 15px");
});

it("serializes authored Grid values and preserves pending CSSOM shorthands", () => {
	const declarations = parseInlineDeclarations(
		'grid-template-areas:"Header Main";grid-area:Panel;grid-row:Start / End',
		100,
	);
	expect(propertyValue(declarations, "grid-template-areas")).toBe(
		'"Header Main"',
	);
	expect(propertyValue(declarations, "grid-row-start")).toBe("Start");
	expect(propertyValue(declarations, "grid-column-start")).toBe("Panel");
	expect(propertyValue(declarations, "grid-row")).toBe("Start / End");
	const pending = parseInlineDeclarations("grid-area:var(--Place)", 100);
	expect(propertyValue(pending, "grid-area")).toBe("var(--Place)");
	expect(propertyValue(pending, "grid-row-start")).toBe("");
	expect(
		propertyValue(
			parseInlineDeclarations(
				"grid-row:Start / End;grid-row-end:Finish!important",
				100,
			),
			"grid-row",
		),
	).toBe("");
});

it("mutates Grid through native CSSOM accessors without a page runtime", () => {
	const { tree, id, grid, read } = fixture();
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, value] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value });
			return object;
		},
	};
	const inline = new InlineStyles(tree, factory);
	const style = inline.get(id()) as {
		gridArea: string;
		gridTemplateColumns: string;
		setProperty(name: string, value: string, priority?: string): void;
		removeProperty(name: string): string;
	};
	style.gridArea = "Panel";
	expect(grid()["grid-column-start"]).toBe("Panel");
	style.gridTemplateColumns = "[Start] 2em [End]";
	expect(read("grid-template-columns")).toBe("[Start] 24px [End]");
	style.setProperty("grid-row-start", "Header", "important");
	expect(read("grid-row-start")).toBe("Header");
	style.removeProperty("grid-area");
	expect(read("grid-row-start")).toBe("auto");
	expect(read("grid-column-start")).toBe("auto");
	style.gridTemplateColumns = "-1fr";
	expect(read("grid-template-columns")).toBe("[Start] 24px [End]");
	inline.close();
});

it.each(["grid", "inline-grid", "block grid", "inline grid"])(
	"blockifies %s items through contents but not through a box",
	(display) => {
		const { styles, id } = fixture(
			`#outer{display:${display}}#flat{display:contents}`,
			'<section id="flat"><span id="target">first</span></section><section id="box"><span id="inner">second</span></section>',
		);
		expect(styles.get(id()).display).toBe("block");
		expect(styles.get(id("#flat")).display).toBe("contents");
		expect(styles.get(id("#inner")).display).toBe("inline");
	},
);

it("keeps the real Grid layout acceptance guard until geometry is implemented", () => {
	const { tree, id, styles } = fixture(
		"#outer{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:min-content min-content 1fr min-content}",
	);
	expect(styles.metrics().issues).toEqual({});
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find((node) => node.ref === tree.reference(id("#outer")))
			?.kind,
	).toBe("deferred");
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("does not accept unsupported Grid grammar through the stylesheet allowlist", () => {
	const issues: string[] = [];
	const declarations = parseCssDeclarations(
		"grid-template-columns:subgrid;grid: auto / auto;grid-template-rows:10px",
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 3 },
		(issue) => issues.push(issue),
	);
	expect(declarations).toEqual([
		{ property: "grid-template-rows", value: "10px", important: false },
	]);
	expect(issues).toEqual([
		"unimplemented-or-invalid-css-value",
		"unimplemented-css-property",
	]);
});
