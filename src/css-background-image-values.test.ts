import { afterEach, expect, it } from "vitest";
import {
	backgroundImageUrl,
	cssBackgroundProperties,
	initialBackgroundValues,
	parseBackgroundComponent,
	parseBackgroundShorthand,
	serializeBackgroundValues,
	type NeutralBackgroundProperty,
} from "./css-background.js";
import {
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import {
	computePaintStyle,
	initialPaintStyle,
	parsePaintValue,
} from "./css-paint.js";
import { parseCssDeclarations } from "./css-parser.js";
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
	backgroundImage: string;
	backgroundPosition: string;
	backgroundSize: string;
	backgroundRepeat: string;
	backgroundOrigin: string;
	backgroundClip: string;
	cssText: string;
	getPropertyValue(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}
function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style><main id="outer"><div id="target"></div></main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const target = new DocumentQueries(tree).querySelector("#target") as number;
	const dom = new ScriptDom(tree, factory);
	const node = dom.node(target) as { style: Style };
	return {
		tree,
		target,
		style: node.style,
		computed: dom.getComputedStyle(node) as Style,
		paint: () => documentStyles(tree).paint(target),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("keeps stylesheet URL case, component inheritance, and noninherited defaults", () => {
	const { style, computed } = fixture(`
		#outer{background:URL("Art/Tile.PNG?Token=AbC") center / cover no-repeat content-box}
	`);
	expect(computed.backgroundImage).toBe("none");
	style.backgroundImage = "inherit";
	style.backgroundPosition = "inherit";
	expect(backgroundImageUrl(computed.backgroundImage)).toMatch(
		/Art\/Tile\.PNG\?Token=AbC$/,
	);
	expect(computed.backgroundPosition).toBe("50% 50%");
	expect(computed.backgroundSize).toBe("auto");
	style.background = "inherit";
	expect(computed.backgroundSize).toBe("cover");
	expect(computed.backgroundRepeat).toBe("no-repeat");
	expect(computed.backgroundClip).toBe("content-box");
	style.background = "unset";
	expect(computed.backgroundImage).toBe("none");
	expect(computed.backgroundSize).toBe("auto");
});

it("preserves mixed-priority and CSS-wide shorthand safety with real values", () => {
	const entries = parseInlineDeclarations(
		`background:url("Art/Tile.PNG") center / cover;background-size:auto!important`,
		16,
	);
	expect(propertyValue(entries, "background")).toBe("");
	const serialized = serializeDeclarations(entries);
	expect(serialized).not.toContain("background:");
	expect(serialized).toContain("background-size: auto !important;");
	expect(
		propertyValue(
			parseInlineDeclarations("background:inherit;background-size:cover", 16),
			"background",
		),
	).toBe("");
	for (const keyword of ["inherit", "initial", "unset", "revert"]) {
		const values =
			parseBackgroundShorthand(keyword)?.map(({ value }) => value) ?? [];
		expect(serializeBackgroundValues(values)).toBe(keyword);
		for (const property of cssBackgroundProperties)
			if (property !== "background-color")
				expect(parsePaintValue(` ${keyword.toUpperCase()} `, property)).toBe(
					keyword,
				);
	}
});

it("roundtrips CSSOM values, resets layers, and rejects invalid assignments", () => {
	const { style, computed, paint } = fixture();
	style.background =
		'url("Art/Tile.PNG") right bottom / 12px 25% no-repeat content-box red';
	expect(style.backgroundImage).toBe('url("Art/Tile.PNG")');
	expect(style.backgroundPosition).toBe("100% 100%");
	expect(computed.backgroundPosition).toBe("100% 100%");
	expect(computed.backgroundSize).toBe("12px 25%");
	expect(computed.backgroundOrigin).toBe("content-box");
	expect(computed.backgroundClip).toBe("content-box");
	expect(computed.background).toBe(
		`rgb(255, 0, 0) ${computed.backgroundImage} no-repeat scroll 100% 100% / 12px 25% content-box content-box`,
	);
	const serialized = style.cssText;
	style.cssText = serialized;
	expect(style.cssText).toBe(serialized);
	for (const invalid of [
		"url(a), url(b)",
		"url(a) center / -1px",
		"linear-gradient(red, blue)",
	])
		style.background = invalid;
	expect(style.cssText).toBe(serialized);
	style.background = "blue";
	expect(style.cssText).toBe("background: blue;");
	expect(paint().background).toBeUndefined();
	expect(computed.backgroundImage).toBe("none");
	expect(computed.backgroundPosition).toBe("0% 0%");
	expect(computed.backgroundClip).toBe("border-box");
	style.backgroundImage = 'URL("Art/Other.PNG?Token=AbC")';
	expect(style.backgroundImage).toBe('url("Art/Other.PNG?Token=AbC")');
	style.backgroundImage = "url(a), url(b)";
	expect(style.backgroundImage).toBe('url("Art/Other.PNG?Token=AbC")');
	style.removeProperty("background");
	expect(paint()).toBe(initialPaintStyle);
});

it.each([
	["URL(Art/Tile.PNG?Token=AbC#Part)", "Art/Tile.PNG?Token=AbC#Part"],
	[" url( 'Art/Tile (One).PNG' ) ", "Art/Tile (One).PNG"],
	['url("data:image/png;base64,AbC+/=")', "data:image/png;base64,AbC+/="],
	['url("Art/It\'s.PNG")', "Art/It's.PNG"],
	["url('Art/\"Tile\".PNG')", 'Art/"Tile".PNG'],
])("preserves the URL token payload in %s", (source, url) => {
	expect(backgroundImageUrl(source)).toBe(url);
	const parsed = parsePaintValue(source, "background-image");
	expect(parsed).toBeDefined();
	expect(backgroundImageUrl(parsed as string)).toBe(url);
	expect(parseBackgroundComponent("background-image", parsed as string)).toBe(
		parsed,
	);
});

it.each([
	"none",
	"url()",
	'url("")',
	"url (a.png)",
	"url(a b.png)",
	"url(a(b).png)",
	'url("a.png)',
	'url("a"b")',
	"url(a\\20b.png)",
	'url("a\\"b.png")',
	'url("a\nb.png")',
	"url(a\u0000b.png)",
	"url(a.png), url(b.png)",
	"linear-gradient(red, blue)",
	"url(a.png) trailing",
])(
	"does not extract malformed, empty, escaped, or layered URLs from %s",
	(source) => {
		expect(backgroundImageUrl(source)).toBeUndefined();
		expect(parseBackgroundComponent("background-image", source)).toBe(
			source === "none" ? "none" : undefined,
		);
	},
);

it.each<[NeutralBackgroundProperty, string, string]>([
	["background-position", "left top", "0% 0%"],
	["background-position", "TOP RIGHT", "100% 0%"],
	["background-position", "center left", "0% 50%"],
	["background-position", "center", "50% 50%"],
	["background-position", "bottom", "50% 100%"],
	["background-position", "-2PX", "-2px 50%"],
	["background-position", "-12.5% +2e1px", "-12.5% 20px"],
	["background-position", "0 0", "0px 0px"],
	["background-position", "left -4px", "0% -4px"],
	["background-size", "auto auto", "auto"],
	["background-size", "COVER", "cover"],
	["background-size", "contain", "contain"],
	["background-size", "20px", "20px"],
	["background-size", "auto 50%", "auto 50%"],
	["background-size", "+2e1px 0", "20px 0px"],
	["background-repeat", "repeat-x", "repeat no-repeat"],
	["background-repeat", "repeat-y", "no-repeat repeat"],
	["background-repeat", "repeat repeat", "repeat"],
	["background-repeat", "NO-REPEAT NO-REPEAT", "no-repeat"],
	["background-repeat", "no-repeat repeat", "no-repeat repeat"],
	["background-origin", "content-box", "content-box"],
	["background-clip", "padding-box", "padding-box"],
	["background-attachment", " SCROLL ", "scroll"],
])("normalizes %s: %s", (property, source, expected) => {
	expect(parseBackgroundComponent(property, source)).toBe(expected);
	expect(parseBackgroundComponent(property, expected)).toBe(expected);
});

it.each<[NeutralBackgroundProperty, string]>([
	["background-position", "left right"],
	["background-position", "top bottom"],
	["background-position", "top 10px"],
	["background-position", "10px left"],
	["background-position", "right 10px bottom 20px"],
	["background-position", "1em 0"],
	["background-position", "1rem 0"],
	["background-position", "calc(10px + 1%) 0"],
	["background-position", "1e999px 0"],
	["background-position", "1 0"],
	["background-size", "-1px"],
	["background-size", "auto -1%"],
	["background-size", "cover auto"],
	["background-size", "10px 20px 30px"],
	["background-size", "1e999px"],
	["background-repeat", "space"],
	["background-repeat", "round"],
	["background-repeat", "repeat-x repeat"],
	["background-attachment", "fixed"],
	["background-attachment", "local"],
	["background-clip", "text"],
	["background-origin", "margin-box"],
])("rejects unsupported %s: %s", (property, source) => {
	expect(parseBackgroundComponent(property, source)).toBeUndefined();
});

it("expands and serializes every supported shorthand component without losing URL case", () => {
	const source =
		'URL("Art/Tile (One).PNG") right top / 20px auto repeat-x scroll padding-box content-box rgb(1 2 3 / 50%)';
	const entries = parseBackgroundShorthand(source);
	expect(entries).toBeDefined();
	expect(
		Object.fromEntries(
			(entries ?? []).map(({ property, value }) => [property, value]),
		),
	).toEqual({
		"background-image": 'url("Art/Tile (One).PNG")',
		"background-position": "100% 0%",
		"background-size": "20px auto",
		"background-repeat": "repeat no-repeat",
		"background-attachment": "scroll",
		"background-origin": "padding-box",
		"background-clip": "content-box",
		"background-color": "rgba(1, 2, 3, 0.502)",
	});
	const values = Object.freeze((entries ?? []).map((entry) => entry.value));
	expect(parseBackgroundShorthand(serializeBackgroundValues(values))).toEqual(
		entries,
	);
	expect(
		parseBackgroundShorthand("content-box")
			?.filter(({ property }) =>
				["background-origin", "background-clip"].includes(property),
			)
			.map(({ value }) => value),
	).toEqual(["content-box", "content-box"]);
});

it.each([
	"url(a) url(b)",
	"url(a), url(b)",
	"linear-gradient(red, blue)",
	"url(a) left red top",
	"url(a) center / -10px",
	"url(a) center /",
	"url(a) / cover",
	"url(a) center / cover / auto",
	"url(a) center / inherit",
	"url(a) center / cover auto",
	"red blue",
	"none none",
	"none inherit",
	"padding-box content-box border-box",
	"repeat no-repeat repeat",
	"url(a) fixed",
	"url(a) round",
])("rejects the entire shorthand atomically: %s", (source) => {
	expect(parseBackgroundShorthand(source)).toBeUndefined();
	expect(parseInlineDeclarations(`background:${source}`, 16)).toEqual([]);
	const issues: string[] = [];
	expect(
		parseCssDeclarations(
			`background:${source}`,
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 16 },
			(issue) => issues.push(issue),
		),
	).toEqual([]);
	expect(issues).toContain("unimplemented-or-invalid-css-value");
});

it("keeps neutral default identity, freezes real layers, and inherits only explicit components", () => {
	expect(computePaintStyle({}, initialPaintStyle)).toBe(initialPaintStyle);
	expect(computePaintStyle(initialBackgroundValues, initialPaintStyle)).toBe(
		initialPaintStyle,
	);
	const specified = Object.freeze({
		"background-image": 'url("Art/Tile.PNG")',
		"background-position": "right bottom",
		"background-clip": "content-box",
	});
	const parent = computePaintStyle(specified, initialPaintStyle);
	expect(Object.isFrozen(parent)).toBe(true);
	expect(Object.isFrozen(parent.background)).toBe(true);
	expect(parent.background).toEqual({
		...Object.fromEntries(
			Object.entries(initialBackgroundValues).filter(
				([property]) => property !== "background-color",
			),
		),
		"background-image": specified["background-image"],
		"background-position": "100% 100%",
		"background-clip": "content-box",
	});
	expect(computePaintStyle({}, parent).background).toBeUndefined();
	const inherited = Object.fromEntries(
		cssBackgroundProperties.map((property) => [property, "inherit"]),
	);
	expect(computePaintStyle(inherited, parent)).toBe(parent);
	const child = computePaintStyle({ "background-image": "inherit" }, parent);
	expect(child.background?.["background-image"]).toBe(
		specified["background-image"],
	);
	expect(child.background?.["background-position"]).toBe("0% 0%");
	for (const keyword of ["initial", "unset", "revert"])
		expect(
			computePaintStyle(
				Object.fromEntries(
					cssBackgroundProperties.map((property) => [property, keyword]),
				),
				parent,
			).background,
		).toBeUndefined();
	expect(specified["background-position"]).toBe("right bottom");
	expect(parent.background?.["background-position"]).toBe("100% 100%");
});
import { BrowserCommandHost } from "./command-host.js";
it("advertises the bounded native background profile without starting a browser", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("Capability inspection must not create a session");
		},
	});
	try {
		const result = await host.execute(["capabilities"]);
		expect(result.data).toMatchObject({
			cssPaint: {
				partial: true,
				backgroundShorthand: "single-layer-url-or-color",
				backgroundImageProfile: "block-replaced-atomic-pseudo-and-canvas",
				backgroundImageLayers: 1,
				backgroundImageSampling: "nearest-neighbor",
				backgroundUnsupportedTargets: [
					"non-atomic-inline",
					"native-controls",
					"special-table-wrappers",
					"fieldset-legends",
				],
			},
		});
	} finally {
		await host.close();
	}
});
