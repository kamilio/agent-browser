import { afterEach, expect, it } from "vitest";
import { parseCssDeclarations } from "./css-parser.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { pageCssSupports } from "./page-css.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const aliases = [
	{ property: "text-decoration", value: "underline red" },
	{ property: "text-decoration-line", value: "underline overline" },
	{ property: "text-decoration-style", value: "solid" },
	{ property: "text-decoration-color", value: "rgb(1 2 3 / 50%)" },
] as const;
const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function declarations(source: string) {
	const issues: string[] = [];
	const values = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		(issue) => issues.push(issue),
	);
	return { values, issues };
}

function fixture(css: string, inline = "", markup?: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">html,body{margin:0;padding:0;font-size:16px;line-height:16px;color:black}${css}</style>${markup ?? `<main id="parent"><span id="target" style="${inline}">AA</span></main>`}`,
		"https://fixture.invalid/text-decoration-aliases",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(80, 80);
	return { tree, queries, id, styles };
}

function rendered(css: string, markup?: string) {
	const { tree, id, styles } = fixture(css, "", markup);
	const rectangle = documentGeometry(tree).getBoundingClientRect(id());
	const raster = rasterizeDocument(tree);
	expect(styles.metrics().issues).toEqual({});
	expect(styles.diagnostics().samples).toEqual([]);
	return {
		rectangle,
		raster: {
			image: raster.image,
			metrics: raster.metrics,
			clip: raster.clip,
			canvasBackground: {
				color: raster.canvasBackground.color,
				sourceTag:
					raster.canvasBackground.sourceRef === null
						? null
						: tree.resolve(raster.canvasBackground.sourceRef).tagName,
			},
		},
	};
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("canonicalizes only the four exact aliases", () => {
	for (const { property } of aliases)
		expect(canonicalCssProperty(`-webkit-${property}`)).toBe(property);
	for (const property of [
		"-webkit-text-decoration-thickness",
		"-webkit-text-decoration-skip",
		"-webkit-text-underline-offset",
		"-moz-text-decoration",
		"--webkit-text-decoration",
		"-WEBKIT-TEXT-DECORATION",
		"constructor",
		"__proto__",
	])
		expect(canonicalCssProperty(property)).toBe(property);
});

it.each(
	aliases.flatMap(({ property, value }) =>
		[value, "initial", "inherit", "unset", "revert", "var(--decoration)"].map(
			(value) => ({ property, value }),
		),
	),
)(
	"parses prefixed $property:$value as its canonical declaration",
	({ property, value }) => {
		const canonical = declarations(`${property}:${value}!important`);
		expect(canonical.issues).toEqual([]);
		expect(canonical.values.length).toBeGreaterThan(0);
		expect(
			declarations(`-WEBKIT-${property.toUpperCase()}:${value}!important`),
		).toEqual(canonical);
		expect(pageCssSupports(`-webkit-${property}`, value)).toBe(true);
		expect(pageCssSupports(`(-webkit-${property}:${value})`)).toBe(true);
	},
);

it.each([
	["text-decoration", "underline wavy red"],
	["text-decoration", "underline underline"],
	["text-decoration", "none underline"],
	["text-decoration", "initial red"],
	["text-decoration", "var(,red)"],
	["text-decoration-line", "blink"],
	["text-decoration-style", "wavy"],
	["text-decoration-style", "double"],
	["text-decoration-color", "not-a-color"],
	["text-decoration-color", "rgb(1,2"],
])("retains native rejection for prefixed %s:%s", (property, value) => {
	expect(declarations(`-webkit-${property}:${value}`)).toEqual(
		declarations(`${property}:${value}`),
	);
	expect(declarations(`-webkit-${property}:${value}`).values).toEqual([]);
	expect(pageCssSupports(`-webkit-${property}`, value)).toBe(false);
});

it.each([
	["-webkit-text-decoration:underline;text-decoration:overline", "overline"],
	["text-decoration:overline;-webkit-text-decoration:underline", "underline"],
	[
		"-webkit-text-decoration:underline!important;text-decoration:overline",
		"underline",
	],
	[
		"text-decoration:overline!important;-webkit-text-decoration:underline",
		"overline",
	],
	[
		"-webkit-text-decoration:underline!important;text-decoration:overline!important",
		"overline",
	],
	[
		"text-decoration:overline!important;-webkit-text-decoration-line:underline!important",
		"underline",
	],
])("shares source order and priority for %s", (source, expected) => {
	for (const inline of [false, true]) {
		const { styles, id } = fixture(
			inline ? "" : `#target{${source}}`,
			inline ? source : "",
		);
		expect(styles.textDecoration(id())["text-decoration-line"]).toBe(expected);
		expect(styles.metrics().issues).toEqual({});
	}
});

it.each(["inherit", "initial", "unset", "revert", "var(--decoration)"])(
	"matches canonical computed behavior for %s",
	(value) => {
		const prefix =
			"#parent{color:blue;text-decoration:overline 3px red;--decoration:line-through 2px blue}";
		const alias = fixture(`${prefix}#target{-webkit-text-decoration:${value}}`);
		const canonical = fixture(`${prefix}#target{text-decoration:${value}}`);
		expect(alias.styles.textDecoration(alias.id())).toEqual(
			canonical.styles.textDecoration(canonical.id()),
		);
		expect(alias.styles.metrics().issues).toEqual({});
	},
);

it("resets canonical shorthand components and leaves underline offset untouched", () => {
	const { styles, id } = fixture(
		"#target{text-decoration:overline 3px blue;text-underline-offset:2px;-webkit-text-decoration:underline}",
	);
	expect(styles.textDecoration(id())).toEqual({
		"text-decoration-line": "underline",
		"text-decoration-thickness": "auto",
		"text-decoration-style": "solid",
		"text-decoration-color": "rgb(0, 0, 0)",
		"text-underline-offset": "2px",
	});
});

it("uses prefixed declarations in supports conditions", () => {
	const source =
		"@supports (-webkit-text-decoration:underline){#target{-webkit-text-decoration:underline red}}";
	const prefixed = rendered(source);
	const canonical = rendered(source.replaceAll("-webkit-", ""));
	expect(prefixed).toEqual(canonical);
	expect(pixel(prefixed.raster.image, 0, 15)).toEqual([255, 0, 0, 255]);
});

it("computes prefixed generated decoration without bypassing its layout guard", () => {
	const source =
		'#target::before{content:"A";-webkit-text-decoration:underline red}';
	const alias = fixture(source);
	const canonical = fixture(source.replaceAll("-webkit-", ""));
	expect(alias.styles.generatedContent(alias.id(), "before")).toEqual(
		canonical.styles.generatedContent(canonical.id(), "before"),
	);
	expect(
		alias.styles.generatedContent(alias.id(), "before")?.textDecoration,
	).toMatchObject({
		"text-decoration-line": "underline",
		"text-decoration-color": "rgb(255, 0, 0)",
	});
	expect(alias.styles.metrics().issues).toEqual({});
	expect(buildFormattingTree(alias.tree).issues).toEqual(
		buildFormattingTree(canonical.tree).issues,
	);
	for (const { tree, id } of [alias, canonical])
		expect(() => documentGeometry(tree).getBoundingClientRect(id())).toThrow(
			"generated-content-text-decoration-layout-not-supported",
		);
});

it.each([
	["underline", 15],
	["overline", 0],
	["line-through", 9],
] as const)(
	"paints native prefixed %s without changing geometry",
	(line, row) => {
		const alias = rendered(`#target{-webkit-text-decoration:${line} red}`);
		const canonical = rendered(`#target{text-decoration:${line} red}`);
		expect(alias).toEqual(canonical);
		expect(alias.rectangle).toEqual(rendered("").rectangle);
		expect(pixel(alias.raster.image, 0, row)).toEqual([255, 0, 0, 255]);
	},
);

it("paints separately prefixed line, style and color declarations", () => {
	const source =
		"#target{-webkit-text-decoration-line:underline;-webkit-text-decoration-style:solid;-webkit-text-decoration-color:blue}";
	const result = rendered(source);
	expect(result).toEqual(rendered(source.replaceAll("-webkit-", "")));
	expect(pixel(result.raster.image, 0, 15)).toEqual([0, 0, 255, 255]);
});

it("preserves ancestor propagation when a descendant uses the none alias", () => {
	const result = rendered(
		"#parent{-webkit-text-decoration:underline red}#target{-webkit-text-decoration:none;color:blue}",
	);
	expect(pixel(result.raster.image, 0, 15)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.raster.image, 0, 2)).toEqual([0, 0, 255, 255]);
});

it("attributes rejected prefixed values without reporting an unknown property", () => {
	const { styles } = fixture("#target{-webkit-text-decoration:wavy red}");
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toMatchObject([
		{
			code: { value: "unimplemented-or-invalid-css-value" },
			authoredProperty: { value: "-webkit-text-decoration" },
			property: { value: "text-decoration" },
			value: { value: "wavy red" },
			applicable: true,
		},
	]);
	expect(snapshot.issues["unimplemented-css-property"]).toBeUndefined();
});

it("invalidates the cascade after replacing a prefixed inline declaration", () => {
	const { tree, styles, id } = fixture(
		"",
		"-webkit-text-decoration:underline red",
	);
	expect(styles.textDecoration(id())["text-decoration-line"]).toBe("underline");
	const before = styles.diagnostics();
	tree.setAttribute(id(), "style", "-webkit-text-decoration:overline blue");
	expect(styles.textDecoration(id())["text-decoration-line"]).toBe("overline");
	expect(styles.diagnostics()).not.toBe(before);
	expect(styles.diagnostics().samples).toEqual([]);
});
