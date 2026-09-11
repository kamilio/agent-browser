import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/foreign-selectors");
	documents.push(tree);
	const html = tree.createElement("html");
	const body = tree.createElement("body");
	tree.append(tree.root, html);
	tree.append(html, body);
	const add = (
		tagName: string,
		namespaceURI = htmlNamespace,
		attributes: Record<string, string> = {},
		parent = body,
	) => {
		const id = tree.createParserElement(tagName, attributes, namespaceURI);
		tree.append(parent, id);
		return id;
	};
	return { tree, body, add, queries: new DocumentQueries(tree) };
}

it("preserves foreign selector case without changing HTML folding or cache keys", () => {
	const { tree, body, add, queries } = fixture();
	const htmlGradient = add("LINEARGRADIENT");
	const svgGradient = add("linearGradient", svgNamespace);
	const lowerGradient = add("lineargradient", svgNamespace);
	const mathLower = add("mi", mathmlNamespace);
	const mathUpper = add("Mi", mathmlNamespace);
	const ordinarySvg = tree.createElement("SVG");
	tree.append(body, ordinarySvg);
	const foreignSvg = add("svg", svgNamespace);

	for (let repeat = 0; repeat < 2; repeat++) {
		expect(queries.querySelectorAll("linearGradient")).toEqual([
			htmlGradient,
			svgGradient,
		]);
		expect(queries.querySelectorAll("lineargradient")).toEqual([
			htmlGradient,
			lowerGradient,
		]);
		expect(queries.querySelectorAll("LINEARGRADIENT")).toEqual([htmlGradient]);
	}
	expect(queries.querySelectorAll("linear\\47 radient")).toEqual([
		htmlGradient,
		svgGradient,
	]);
	expect(queries.querySelectorAll(":is(mi, Mi):not(mi)")).toEqual([mathUpper]);
	expect(queries.querySelectorAll("mi")).toEqual([mathLower]);
	expect(queries.querySelectorAll("svg")).toEqual([ordinarySvg, foreignSvg]);
	expect(queries.querySelectorAll("SVG")).toEqual([ordinarySvg]);
	expect(elementNamespace(tree.get(ordinarySvg))).toBe(htmlNamespace);
	expect(elementNamespace(tree.get(foreignSvg))).toBe(svgNamespace);
	expect(queries.matches(svgGradient, "linearGradient")).toBe(true);
	expect(queries.closest(svgGradient, "linearGradient")).toBe(svgGradient);
	expect(queries.closest(svgGradient, "lineargradient")).toBeNull();
	expect(
		queries.matchingSpecificities("linearGradient").get(svgGradient),
	).toEqual([0, 0, 1]);
	expect(queries.querySelector("body:has(> linearGradient)")).toBe(body);
});

it("folds attribute names and default enumerated values only for HTML", () => {
	const { tree, add, queries } = fixture();
	const html = add("div", htmlNamespace, { viewBox: "HTML", TYPE: "TEXT" });
	const svg = add("g", svgNamespace, {
		viewBox: "Upper",
		viewbox: "lower",
		type: "TEXT",
		"xlink:href": "#target",
	});
	const math = add("mi", mathmlNamespace, {
		definitionURL: "Target",
		type: "TEXT",
	});
	expect(queries.querySelectorAll("[viewBox]")).toEqual([html, svg]);
	expect(queries.querySelectorAll("[VIEWBOX]")).toEqual([html]);
	expect(queries.querySelectorAll('[viewBox="Upper"]')).toEqual([svg]);
	expect(queries.querySelectorAll('[viewbox="lower"]')).toEqual([svg]);
	expect(queries.querySelectorAll('[viewbox="Upper"]')).toEqual([]);
	expect(queries.querySelectorAll("[\\76 iewBox]")).toEqual([html, svg]);
	expect(queries.querySelectorAll("[xlink\\:href]")).toEqual([svg]);
	expect(queries.querySelectorAll("[definitionURL]")).toEqual([math]);
	expect(queries.querySelectorAll("[definitionurl]")).toEqual([]);
	expect(queries.querySelectorAll('[TYPE="text"]')).toEqual([html]);
	expect(queries.querySelectorAll('[type="text"]')).toEqual([html]);
	expect(queries.querySelectorAll('[type="text" i]')).toEqual([
		html,
		svg,
		math,
	]);
	expect(queries.querySelectorAll('[TYPE="text" i]')).toEqual([html]);
	expect(queries.querySelectorAll('[type="text" s]')).toEqual([]);
	expect(queries.querySelectorAll('[type="TEXT" s]')).toEqual([
		html,
		svg,
		math,
	]);
	tree.setAttribute(svg, "viewBox", "changed");
	expect(queries.querySelectorAll('[viewBox="Upper"]')).toEqual([]);
	expect(queries.querySelectorAll('[viewBox="changed"]')).toEqual([svg]);
	expect(queries.querySelectorAll('[viewbox="lower"]')).toEqual([svg]);
	tree.removeAttribute(svg, "viewBox");
	expect(queries.querySelectorAll("[viewBox]")).toEqual([html]);
	expect(queries.querySelectorAll("[viewbox]")).toEqual([html, svg]);
});

it("counts sibling types by namespace and case-preserved local name", () => {
	const { tree, body, add, queries } = fixture();
	const htmlFirst = add("glyph");
	const svgFirst = add("glyph", svgNamespace);
	const mathFirst = add("glyph", mathmlNamespace);
	const svgUpper = add("Glyph", svgNamespace);
	const svgLast = add("glyph", svgNamespace);
	const htmlLast = add("GLYPH");
	const mathLast = add("glyph", mathmlNamespace);
	const select = (selector: string) =>
		queries.querySelectorAll(`:scope > ${selector}`, body);
	expect(select(":first-of-type")).toEqual([
		htmlFirst,
		svgFirst,
		mathFirst,
		svgUpper,
	]);
	expect(select(":last-of-type")).toEqual([
		svgUpper,
		svgLast,
		htmlLast,
		mathLast,
	]);
	expect(select(":only-of-type")).toEqual([svgUpper]);
	expect(select(":nth-of-type(2)")).toEqual([svgLast, htmlLast, mathLast]);
	expect(select(":nth-last-of-type(2)")).toEqual([
		htmlFirst,
		svgFirst,
		mathFirst,
	]);
	expect(select(":nth-child(2 of glyph)")).toEqual([svgFirst]);
	expect(select(":nth-child(2 of GLYPH)")).toEqual([htmlLast]);
	tree.append(body, svgFirst);
	expect(select("glyph:first-of-type")).toEqual([
		htmlFirst,
		mathFirst,
		svgLast,
	]);
	expect(select("glyph:nth-of-type(2)")).toEqual([
		htmlLast,
		mathLast,
		svgFirst,
	]);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not grant HTML control or link pseudos to foreign names in %s",
	(namespaceURI) => {
		const { add, queries } = fixture();
		for (const tagName of [
			"input",
			"button",
			"select",
			"textarea",
			"fieldset",
			"option",
			"optgroup",
			"progress",
			"a",
			"area",
		]) {
			add(tagName, namespaceURI, {
				disabled: "",
				checked: "",
				selected: "",
				required: "",
				placeholder: "Hint",
				type: "checkbox",
				href: "#target",
			});
			add(tagName, namespaceURI);
		}
		add("input", namespaceURI, { type: "radio" });
		expect(
			queries.querySelectorAll(
				":checked, :indeterminate, :enabled, :disabled, :required, :optional, :placeholder-shown, :link, :any-link",
			),
		).toEqual([]);
	},
);

it("retains HTML control semantics inside foreignObject and ignores foreign fieldsets", () => {
	const { tree, add, queries } = fixture();
	const svg = add("svg", svgNamespace);
	const foreignFieldset = add("fieldset", svgNamespace, { disabled: "" }, svg);
	const host = add("foreignObject", svgNamespace, {}, foreignFieldset);
	const text = add(
		"input",
		htmlNamespace,
		{ placeholder: "Hint", required: "" },
		host,
	);
	const checkbox = add(
		"input",
		htmlNamespace,
		{ type: "checkbox", checked: "" },
		host,
	);
	const radio = add("input", htmlNamespace, { type: "radio" }, host);
	const progress = add("progress", htmlNamespace, {}, host);
	const select = add("select", htmlNamespace, {}, host);
	const option = add("option", htmlNamespace, { selected: "" }, select);
	const disabled = add("button", htmlNamespace, { disabled: "" }, host);
	expect(queries.matches(text, ":enabled:required:placeholder-shown")).toBe(
		true,
	);
	expect(queries.matches(checkbox, ":checked:optional")).toBe(true);
	expect(queries.querySelectorAll(":checked")).toEqual([checkbox, option]);
	expect(queries.querySelectorAll(":indeterminate")).toEqual([radio, progress]);
	expect(queries.querySelectorAll(":disabled")).toEqual([disabled]);
	tree.setControl(text, { value: "filled" });
	tree.setControl(checkbox, { checked: false, indeterminate: true });
	expect(queries.matches(text, ":placeholder-shown")).toBe(false);
	expect(queries.querySelectorAll(":checked")).toEqual([option]);
	expect(queries.querySelectorAll(":indeterminate")).toEqual([
		checkbox,
		radio,
		progress,
	]);
});

it("propagates label pointer state only from HTML labels", () => {
	const { tree, add, queries } = fixture();
	const control = add("input", htmlNamespace, { id: "control" });
	const foreign = add("label", svgNamespace, { for: "control" });
	const html = add("label", htmlNamespace, { for: "control" });
	tree.setPointerState(foreign, foreign);
	expect(queries.matches(foreign, ":hover:active")).toBe(true);
	expect(queries.matches(control, ":hover, :active")).toBe(false);
	tree.setPointerState(html, html);
	expect(queries.matches(control, ":hover:active")).toBe(true);
});

it.each([svgNamespace, mathmlNamespace])(
	"serializes foreign raw-text, void and template collisions as ordinary elements in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		for (const tagName of [
			"script",
			"style",
			"xmp",
			"iframe",
			"noembed",
			"noframes",
			"plaintext",
			"noscript",
			"input",
			"br",
			"template",
		]) {
			const foreign = add(tagName, namespaceURI);
			tree.append(foreign, tree.createText('<&>\u00a0"'));
			for (const scripting of [false, true]) {
				expect(
					serializeHtml(tree, foreign, { includeSelf: true, scripting }),
				).toBe(`<${tagName}>&lt;&amp;&gt;&nbsp;"</${tagName}>`);
				expect(serializeHtml(tree, foreign, { scripting })).toBe(
					'&lt;&amp;&gt;&nbsp;"',
				);
			}
			expect(elementNamespace(tree.get(foreign))).toBe(namespaceURI);
		}
	},
);

it("keeps HTML raw-text, void and template behavior inside foreignObject", () => {
	const { tree, add } = fixture();
	const host = add("foreignObject", svgNamespace);
	const script = add("script", htmlNamespace, {}, host);
	tree.append(script, tree.createText("<&>"));
	const input = add("input", htmlNamespace, {}, host);
	tree.append(input, tree.createText("omitted"));
	const template = add("template", htmlNamespace, {}, host);
	tree.append(template, tree.createText("not template contents"));
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("<&>"));
	expect(serializeHtml(tree, host, { includeSelf: true })).toBe(
		"<foreignObject><script><&></script><input><template>&lt;&amp;&gt;</template></foreignObject>",
	);
	const noscript = add("noscript", htmlNamespace, {}, host);
	tree.append(noscript, tree.createText("<&>"));
	expect(serializeHtml(tree, noscript, { scripting: true })).toBe("<&>");
	expect(serializeHtml(tree, noscript, { scripting: false })).toBe(
		"&lt;&amp;&gt;",
	);
});

it("preserves foreign tag and attribute spelling, escaping and output limits", () => {
	const { tree, add } = fixture();
	const gradient = add("linearGradient", svgNamespace, {
		viewBox: '"<&>\u00a0',
		viewbox: "different",
		"xlink:href": "#target",
	});
	const expected =
		'<linearGradient viewBox="&quot;&lt;&amp;&gt;&nbsp;" viewbox="different" xlink:href="#target"></linearGradient>';
	const revision = tree.revision;
	expect(
		serializeHtml(tree, gradient, {
			includeSelf: true,
			maxCodeUnits: expected.length,
		}),
	).toBe(expected);
	expect(() =>
		serializeHtml(tree, gradient, {
			includeSelf: true,
			maxCodeUnits: expected.length - 1,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(tree.revision).toBe(revision);
	expect(tree.get(gradient)).toMatchObject({
		tagName: "linearGradient",
		namespaceURI: svgNamespace,
	});
});

it("retains selector error contracts and bounded foreign queries", () => {
	const { tree, add, queries } = fixture();
	add("linearGradient", svgNamespace);
	add("linearGradient", svgNamespace);
	for (const selector of [
		"svg|linearGradient",
		"*|linearGradient",
		"[svg|viewBox]",
	])
		expect(() => queries.querySelectorAll(selector)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	expect(() => queries.querySelectorAll("[viewBox=")).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() =>
		new DocumentQueries(tree, { maxResults: 1 }).querySelectorAll(
			"linearGradient",
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		new DocumentQueries(tree, { maxWork: 1 }).querySelectorAll(
			"linearGradient",
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	const detached = tree.createParserElement("input", {}, svgNamespace);
	expect(queries.matches(detached, "input:only-of-type")).toBe(true);
	expect(() => queries.matches(detached, ":checked")).toThrow(/detached/);
});

it("round-trips supported mixed SVG, MathML and HTML integration through HTML serialization", () => {
	const tree = parseHtmlDocument(
		'<svg viewBox="0 0 10 10"><linearGradient id="gradient"></linearGradient><script>&lt;&amp;&gt;</script><foreignObject><input id="control" required></foreignObject></svg><math><mi definitionURL="Target">x &amp; y</mi></math>',
		"https://fixture.invalid/foreign-roundtrip",
	);
	documents.push(tree);
	const serialized = serializeHtml(tree);
	const reparsed = parseHtmlDocument(serialized, tree.url);
	documents.push(reparsed);
	expect(serializeHtml(reparsed)).toBe(serialized);
	for (const document of [tree, reparsed]) {
		const queries = new DocumentQueries(document);
		for (const [selector, namespaceURI] of [
			["svg[viewBox] > linearGradient", svgNamespace],
			["foreignObject > input:enabled:required", htmlNamespace],
			["math > mi[definitionURL]", mathmlNamespace],
		]) {
			const id = queries.querySelector(selector);
			expect(id).not.toBeNull();
			if (id !== null)
				expect(elementNamespace(document.get(id))).toBe(namespaceURI);
		}
		expect(queries.querySelector("lineargradient")).toBeNull();
		expect(queries.querySelector("svg[viewbox]")).toBeNull();
		const script = queries.querySelector("svg > script");
		expect(script).not.toBeNull();
		if (script !== null) expect(document.textContent(script)).toBe("<&>");
	}
});
