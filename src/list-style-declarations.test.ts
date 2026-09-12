import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	expandDeclaration,
	inlineDeclarationComponents,
	parseInlineDeclarations,
	propertyPriority,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import { cssListProperties } from "./css-list.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: unknown, priority?: unknown): void;
	removeProperty(name: string): string;
}
const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(source = "") {
	const tree = parseHtmlDocument(
		'<ul><li id="target">Text</li></ul>',
		"https://fixture.invalid/list-style-declarations",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	queries.close();
	if (id === null) throw new Error("Missing list style target");
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
	return { tree, id, owner, style: owner.get(id) as Style };
}
function sheet(source: string) {
	const issues: string[] = [];
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 100 },
		(issue) => issues.push(issue),
	);
	return { declarations, issues };
}

it.each([
	["none", "none", "outside"],
	["square inside", "square", "inside"],
	["inside none decimal", "decimal", "inside"],
	["outside", "disc", "outside"],
	["none none", "none", "outside"],
	["INSIDE /* gap */ NONE", "none", "inside"],
])(
	"expands authored %s consistently in stylesheets and inline declarations",
	(value, type, position) => {
		const parsed = sheet(`list-style:${value}!important`);
		expect(parsed.issues).toEqual([]);
		const expected = [
			{ property: "list-style-type", value: type, important: true },
			{ property: "list-style-position", value: position, important: true },
			{ property: "list-style-image", value: "none", important: true },
		];
		expect(parsed.declarations).toEqual(expected);
		expect(
			parseInlineDeclarations(`list-style:${value}!important`, 10),
		).toEqual(
			expected.map(({ property, ...entry }) => ({ name: property, ...entry })),
		);
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"expands %s through every shorthand component",
	(value) => {
		const declarations = parseInlineDeclarations(`list-style:${value}`, 10);
		expect(inlineDeclarationComponents("list-style")).toEqual(
			cssListProperties,
		);
		expect(declarations.map((entry) => entry.value)).toEqual([
			value,
			value,
			value,
		]);
		expect(propertyValue(declarations, "list-style")).toBe(value);
		expect(
			sheet(`all:${value}`)
				.declarations.filter((entry) =>
					cssListProperties.includes(
						entry.property as (typeof cssListProperties)[number],
					),
				)
				.map((entry) => entry.value),
		).toEqual([value, value, value]);
	},
);

it.each(["none", "inside square", "none none", "decimal-leading-zero outside"])(
	"advertises supported %s without a page runtime",
	(value) => {
		expect(cssSupportsDeclaration("list-style", value)).toBe(true);
		expect(cssSupportsCondition(`(list-style:${value})`)).toBe(true);
	},
);

it.each([
	"url(marker.png)",
	'"custom"',
	"symbols(cyclic x)",
	"unknown-counter",
	"none none none",
	"inside outside",
	"inherit none",
])("preserves unsupported diagnostics for %s", (value) => {
	expect(cssSupportsDeclaration("list-style", value)).toBe(false);
	expect(expandDeclaration("list-style", value, false)).toEqual([]);
	expect(sheet(`list-style:${value}`).issues).toEqual([
		"unimplemented-or-invalid-css-value",
	]);
});

it("supports only the none image longhand and keeps image URLs unsupported", () => {
	expect(cssSupportsDeclaration("list-style-image", "none")).toBe(true);
	expect(cssSupportsDeclaration("list-style-image", "url(marker.png)")).toBe(
		false,
	);
	expect(sheet("list-style-image:none").declarations).toEqual([
		{ property: "list-style-image", value: "none", important: false },
	]);
});

it.each(["list-style-type", "list-style-position", "list-style-image"])(
	"does not serialize an incomplete shorthand missing %s",
	(missing) => {
		const declarations = parseInlineDeclarations(
			"list-style:inside square",
			10,
		).filter((entry) => entry.name !== missing);
		expect(propertyValue(declarations, "list-style")).toBe("");
		expect(propertyPriority(declarations, "list-style")).toBe("");
	},
);

it("does not merge mixed component priorities", () => {
	const entries = parseInlineDeclarations(
		"list-style:inside square;list-style-image:none!important",
		10,
	);
	expect(propertyValue(entries, "list-style")).toBe("");
	expect(propertyPriority(entries, "list-style")).toBe("");
	expect(propertyPriority(entries, "list-style-image")).toBe("important");
});

it("serializes and reparses explicit native shorthand components without loss", () => {
	const entries = parseInlineDeclarations(
		"list-style:inside square!important",
		10,
	);
	expect(propertyValue(entries, "list-style")).toBe("inside none square");
	expect(propertyPriority(entries, "list-style")).toBe("important");
	expect(parseInlineDeclarations(serializeDeclarations(entries), 10)).toEqual(
		entries,
	);
});

it("resets all old longhands when CSSOM assigns a shorthand", () => {
	const { tree, id, style } = fixture("list-style:inside square");
	style.setProperty("list-style", "none");
	expect(style.getPropertyValue("list-style")).toBe("outside none none");
	expect(documentStyles(tree).list(id)).toEqual({
		"list-style-type": "none",
		"list-style-position": "outside",
		"list-style-image": "none",
	});
});

it("removes every CSSOM component together and restores inherited defaults", () => {
	const { tree, id, style } = fixture(
		"list-style:inside square!important;color:red",
	);
	expect(style.removeProperty("list-style")).toBe("inside none square");
	for (const property of cssListProperties)
		expect(style.getPropertyValue(property)).toBe("");
	expect(style.getPropertyValue("color")).toBe("red");
	expect(documentStyles(tree).list(id)).toEqual({
		"list-style-type": "disc",
		"list-style-position": "outside",
		"list-style-image": "none",
	});
});

it("leaves existing CSSOM entries intact after an invalid assignment", () => {
	const { style } = fixture("list-style:inside square");
	const before = style.cssText;
	style.setProperty("list-style", "inside outside");
	expect(style.cssText).toBe(before);
});

it("keeps shorthand importance across a later nonimportant type declaration", () => {
	const { tree, id, style } = fixture(
		"list-style:none!important;list-style-type:square",
	);
	expect(documentStyles(tree).list(id)["list-style-type"]).toBe("none");
	expect(style.getPropertyPriority("list-style")).toBe("important");
});

it("preserves a pending variable shorthand and resolves it in the native cascade", () => {
	const { tree, id, style } = fixture(
		"--markers:inside square;list-style:var(--markers)",
	);
	expect(style.getPropertyValue("list-style")).toBe("var(--markers)");
	expect(documentStyles(tree).list(id)["list-style-type"]).toBe("square");
	style.setProperty("--markers", "none");
	expect(style.getPropertyValue("list-style")).toBe("var(--markers)");
	expect(documentStyles(tree).list(id)).toEqual({
		"list-style-type": "none",
		"list-style-position": "outside",
		"list-style-image": "none",
	});
});

it("lets a later longhand override just one pending component", () => {
	const { tree, id, style } = fixture(
		"--markers:inside square;list-style:var(--markers);list-style-position:outside",
	);
	expect(style.getPropertyValue("list-style")).toBe("");
	expect(documentStyles(tree).list(id)).toEqual({
		"list-style-type": "square",
		"list-style-position": "outside",
		"list-style-image": "none",
	});
});

it("removes a pending shorthand without leaving image or position entries", () => {
	const { style } = fixture(
		"--markers:inside square;list-style:var(--markers)",
	);
	expect(style.removeProperty("list-style")).toBe("var(--markers)");
	for (const property of cssListProperties)
		expect(style.getPropertyValue(property)).toBe("");
	expect(style.getPropertyValue("--markers")).toBe("inside square");
});

it("resolves computed image and shorthand values through the same list owner", () => {
	const { tree, id, style } = fixture("list-style:inside square");
	expect(resolvedStyleValue(tree, id, "list-style-image")).toBe("none");
	expect(resolvedStyleValue(tree, id, "list-style")).toBe("inside none square");
	style.setProperty("list-style", "none");
	expect(resolvedStyleValue(tree, id, "list-style")).toBe("outside none none");
});

it("charges all three inline components against existing declaration limits", () => {
	expect(() => parseInlineDeclarations("list-style:none", 2)).toThrow();
	expect(parseInlineDeclarations("list-style:none", 3)).toHaveLength(3);
});

it.each(["", "!important"])(
	"preserves a partially overridden pending list shorthand through cssText with priority %s",
	(priority) => {
		const { tree, id, style } = fixture(
			`--markers:inside square;list-style:var(--markers)${priority};list-style-position:outside${priority}`,
		);
		const before = documentStyles(tree).list(id);
		expect(before["list-style-type"]).toBe("square");
		style.cssText = style.cssText;
		expect(documentStyles(tree).list(id)).toEqual(before);
		expect(style.cssText).toContain("var(--markers)");
	},
);

it("preserves an earlier important override when serializing pending components", () => {
	const { tree, id, style } = fixture(
		"--markers:inside square;list-style-type:circle!important;list-style:var(--markers)",
	);
	const before = documentStyles(tree).list(id);
	expect(before["list-style-type"]).toBe("circle");
	style.cssText = style.cssText;
	expect(documentStyles(tree).list(id)).toEqual(before);
});

it.each([
	["list-style-type", "decimal"],
	["list-style-position", "outside"],
	["list-style-image", "none"],
])(
	"keeps a pending shorthand round trip after overriding %s",
	(property, value) => {
		const { tree, id, style } = fixture(
			"--markers:inside square;list-style:var(--markers)",
		);
		style.setProperty(property, value);
		const before = documentStyles(tree).list(id);
		style.cssText = style.cssText;
		expect(documentStyles(tree).list(id)).toEqual(before);
	},
);

it("preserves another existing pending shorthand through the shared serializer", () => {
	const { tree, id, style } = fixture(
		"--space:2px 4px;margin:var(--space);margin-left:9px",
	);
	const before = documentStyles(tree).box(id);
	expect(before["margin-right"]).toBe("4px");
	style.cssText = style.cssText;
	expect(documentStyles(tree).box(id)["margin-right"]).toBe("4px");
	expect(documentStyles(tree).box(id)["margin-left"]).toBe("9px");
});
