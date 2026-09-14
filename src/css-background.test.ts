import { afterEach, expect, it } from "vitest";
import {
	cssBackgroundProperties,
	initialBackgroundValues,
	parseBackgroundShorthand,
} from "./css-background.js";
import {
	inlineDeclarationComponents,
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import { paintBackground } from "./css-paint.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const result = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(result, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value });
		if (definition.indexed)
			Object.defineProperty(result, "length", {
				get: definition.indexed.length,
			});
		return result;
	},
};
interface Style {
	background: string;
	backgroundColor: string;
	backgroundImage: string;
	backgroundSize: string;
	backgroundPosition: string;
	cssText: string;
	length: number;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}
function fixture(css = "", inline = "") {
	const tree = parseHtmlDocument(
		`<style>main{font-size:8px} ${css}</style><main id="outer"><div id="target" style="${inline}">A</div></main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(24, 24);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target") as number;
	const dom = new ScriptDom(tree, factory);
	const node = dom.node(target) as { style: Style };
	return {
		tree,
		target,
		dom,
		style: node.style,
		computed: dom.getComputedStyle(node) as Style,
		paint: () => paintBackground(styles.paint(target)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each([
	"red",
	"none red",
	"red none",
	"NONE RED",
	"rgb(255 0 0)",
	"none rgb(255 0 0)",
	"hsl(0 100% 50%) none",
])(
	"expands %s to eight components shared by inline and stylesheet parsing",
	(value) => {
		const source = `background: ${value} !important`;
		const issues: string[] = [];
		const declarations = parseCssDeclarations(
			source,
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
			(issue) => issues.push(issue),
		);
		expect(issues).toEqual([]);
		expect(declarations).toHaveLength(8);
		expect(
			declarations.map(({ property, ...entry }) => ({
				name: property,
				...entry,
			})),
		).toEqual(parseInlineDeclarations(source, 10));
		expect(declarations.slice(0, 7).map((entry) => entry.value)).toEqual(
			Object.values(initialBackgroundValues).slice(0, 7),
		);
		expect(fixture("", source).paint()).toEqual([255, 0, 0, 255]);
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"expands CSS-wide %s across all background components",
	(value) => {
		const entries = parseInlineDeclarations(`background:${value}`, 10);
		expect(entries).toHaveLength(8);
		expect(entries.every((entry) => entry.value === value)).toBe(true);
		expect(propertyValue(entries, "background")).toBe(value);
		expect(serializeDeclarations(entries)).toBe(`background: ${value};`);
		const { paint } = fixture(
			`#outer{background:red}#target{background:${value}}`,
		);
		expect(paint()).toEqual(
			value === "inherit" ? [255, 0, 0, 255] : [0, 0, 0, 0],
		);
	},
);

it.each([
	"",
	"red blue",
	"none none",
	"none red none",
	"inherit red",
	"none unset",
	"url(a.png),url(b.png)",
	"linear-gradient(red,blue)",
	"red, none",
	"red left 1px top 1px",
	"red / cover",
	"red round",
])(
	"rejects unsupported or invalid shorthand %s without partial expansion",
	(value) => {
		expect(parseBackgroundShorthand(value)).toBeUndefined();
		expect(parseInlineDeclarations(`background:${value}`, 10)).toEqual([]);
	},
);

it("resets background but not foreground, respecting importance and source order", () => {
	const { style, paint, computed } = fixture(
		"#target{color:green;background-color:blue!important}",
		"background:red",
	);
	expect(paint()).toEqual([0, 0, 255, 255]);
	style.setProperty("background", "currentcolor", "important");
	expect(paint()).toEqual([0, 128, 0, 255]);
	expect(style.length).toBe(8);
	expect(style.getPropertyPriority("background")).toBe("important");
	style.setProperty("background", "none", "important");
	expect(paint()).toEqual([0, 0, 0, 0]);
	expect(computed.getPropertyValue("color")).toBe("rgb(0, 128, 0)");
	expect(
		fixture("#target{background:red;background-color:blue}").paint(),
	).toEqual([0, 0, 255, 255]);
	expect(
		fixture("#target{background-color:blue;background:red}").paint(),
	).toEqual([255, 0, 0, 255]);
});

it("provides live aliases, shorthand serialization, removal and owned cleanup", () => {
	const { tree, style, computed } = fixture();
	style.background = "red";
	expect(style.cssText).toBe("background: red;");
	expect(style.background).toBe("red");
	expect(style.backgroundImage).toBe("none");
	expect(style.backgroundPosition).toBe("0% 0%");
	expect(
		Array.from({ length: style.length }, (_, index) => style.item(index)),
	).toEqual(cssBackgroundProperties);
	expect(computed.background).toBe(
		"rgb(255, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box",
	);
	expect(computed.backgroundSize).toBe("auto");
	style.background = "none blue none";
	expect(style.background).toBe("red");
	expect(() => {
		computed.background = "blue";
	}).toThrow("read-only");
	expect(style.removeProperty("background")).toBe("red");
	expect(style.length).toBe(0);
	expect(computed.backgroundColor).toBe("rgba(0, 0, 0, 0)");
	tree.close();
	expect(() => style.background).toThrow();
	expect(() => computed.background).toThrow();
});

it("does not serialize partial or mixed-priority components as a shorthand", () => {
	const { style } = fixture(
		"",
		"background:red;background-color:blue!important",
	);
	expect(style.background).toBe("");
	expect(style.cssText).toContain("background-color: blue !important;");
	expect(style.cssText).not.toContain("background:");
	expect(style.removeProperty("background")).toBe("");
	expect(style.length).toBe(0);
	style.backgroundColor = "red";
	expect(style.background).toBe("");
	style.removeProperty("background");
	expect(style.length).toBe(0);
});

it("keeps all resets in order and declines mixed CSS-wide shorthand serialization", () => {
	const source = "background:red;all:initial;background-color:blue";
	const entries = parseInlineDeclarations(
		source,
		inlineDeclarationComponents("all").length,
	);
	const serialized = serializeDeclarations(entries);
	expect(serialized).not.toContain("background:");
	expect(fixture("", serialized).paint()).toEqual(fixture("", source).paint());
	expect(
		propertyValue(
			parseInlineDeclarations("background:inherit;background-color:red", 10),
			"background",
		),
	).toBe("");
});

it("accepts initial non-color components and keeps unsupported layered values explicit", () => {
	const { style, computed } = fixture();
	for (const name of cssBackgroundProperties.slice(0, 7)) {
		style.setProperty(name, initialBackgroundValues[name]);
		expect(computed.getPropertyValue(name)).toBe(initialBackgroundValues[name]);
	}
	style.backgroundSize = "auto auto";
	expect(style.backgroundSize).toBe("auto");
	style.backgroundImage = "url(first.png),url(second.png)";
	expect(style.backgroundImage).toBe("none");
	const unsupported = fixture(
		"#target{background:url(first.png),url(second.png)}",
	);
	expect(() => rasterizeDocument(unsupported.tree)).toThrow();
	const invalidClip = fixture("#target{background-clip:text}");
	expect(() => rasterizeDocument(invalidClip.tree)).toThrow();
});

it("paints the same native PNG pixels and PDF bytes as the equivalent longhand", () => {
	const shorthand = fixture("#target{background:rgba(255,0,0,.5)}");
	const longhand = fixture("#target{background-color:rgba(255,0,0,.5)}");
	expect(rasterizeDocument(shorthand.tree).image.pixels).toEqual(
		rasterizeDocument(longhand.tree).image.pixels,
	);
	expect(renderDocumentPdf(shorthand.tree).bytes).toEqual(
		renderDocumentPdf(longhand.tree).bytes,
	);
});

it("returns empty computed shorthand and components for detached nodes, then restores live values", () => {
	const { tree, target, style, computed } = fixture("", "background:red");
	const parent = tree.get(target).parent;
	if (parent === null) throw new Error("Missing parent");
	tree.remove(target);
	expect(computed.background).toBe("");
	expect(computed.backgroundImage).toBe("");
	expect(style.background).toBe("red");
	tree.append(parent, target);
	expect(computed.backgroundColor).toBe("rgb(255, 0, 0)");
});
