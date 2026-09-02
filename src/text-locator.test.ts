import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { parseTargetLocator, resolveBrowserTarget } from "./target-locator.js";
import { textLocatorCandidates, textLocatorLimits } from "./text-locator.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(html: string) {
	const tree = parseHtmlDocument(html, "https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	return {
		tree,
		queries,
		resolve: (source: string) =>
			tree.resolve(resolveBrowserTarget(tree, queries, source)),
		id: (id: string) => queries.querySelector(`#${id}`) as number,
	};
}

it.each([
	["getByText", "text"],
	["getByLabel", "label"],
	["getByPlaceholder", "placeholder"],
	["getByAltText", "alt-text"],
	["getByTitle", "title"],
])("parses %s literals with optional exact matching", (method, kind) => {
	expect(parseTargetLocator(`${method}('Value')`)).toEqual({
		kind,
		value: "Value",
		exact: false,
	});
	expect(parseTargetLocator(`${method}("Value", { 'exact': true, })`)).toEqual({
		kind,
		value: "Value",
		exact: true,
	});
});

it.each([
	"getByText(/value/i)",
	"getByLabel(String('Name'))",
	"getByText('Name', {name: 'other'})",
	"getByLabel('Name', {exact: 1})",
	"getByText('Name', {exact: true, exact: false})",
	"getByTitle('Name').first()",
	"getByAltText('Name'); throw 1",
	"getByPlaceholder(`Name`)",
])("rejects unsupported/executable locator syntax: %s", (source) => {
	expect(() => parseTargetLocator(source)).toThrow();
});

it("matches normalized text case-insensitively by default and case-sensitively exactly", () => {
	const test = fixture(
		'<main><p id="greeting">  Welcome\n  Jo\u200bhn\u00ad!  </p></main>',
	);
	expect(test.resolve("getByText('WELCOME john')").attributes.id).toBe(
		"greeting",
	);
	expect(
		test.resolve("getByText('Welcome John!', {exact: true})").attributes.id,
	).toBe("greeting");
	expect(() =>
		test.resolve("getByText('welcome john!', {exact: true})"),
	).toThrow("matched no");
});

it("selects the smallest matching element and handles text spanning sibling descendants", () => {
	const test = fixture(
		'<section><button id="buy"><span id="small">Buy</span> <b>item</b></button></section>',
	);
	expect(test.resolve("getByText('Buy')").attributes.id).toBe("small");
	expect(
		test.resolve("getByText('Buy item', {exact: true})").attributes.id,
	).toBe("buy");
	expect(
		test.resolve("getByRole('button', {name: 'Buy item'})").attributes.id,
	).toBe("buy");
});

it("does not invent whitespace between elements or interpret comments as text", () => {
	const test = fixture(
		'<div id="joined">a<span>b</span><!-- ignored -->c</div>',
	);
	expect(test.resolve("getByText('abc', {exact: true})").attributes.id).toBe(
		"joined",
	);
	expect(() => test.resolve("getByText('a b c')")).toThrow("matched no");
	expect(() => test.resolve("getByText('ignored')")).toThrow("matched no");
});

it("skips head, script, style and noscript content without excluding hidden body text", () => {
	const test = fixture(
		'<head><title>metadata-only</title></head><body><script>script-only</script><style>style-only</style><noscript>noscript-only</noscript><p hidden id="hidden">retained-hidden</p></body>',
	);
	for (const value of [
		"metadata-only",
		"script-only",
		"style-only",
		"noscript-only",
	])
		expect(() => test.resolve(`getByText('${value}')`)).toThrow("matched no");
	expect(test.resolve("getByText('retained-hidden')").attributes.id).toBe(
		"hidden",
	);
});

it("keeps hidden duplicate text matches ambiguous instead of choosing the visible one", () => {
	const test = fixture(
		"<button>Continue</button><button hidden>Continue</button>",
	);
	expect(() => test.resolve("getByText('Continue')")).toThrow(
		"multiple elements",
	);
});

it("uses live button/submit/reset input values but not password or ordinary input values", () => {
	const test = fixture(
		'<input id="submit" type="submit" value="Send"><input id="button" type="button" value="Run"><input id="reset" type="reset" value="Clear"><input type="password" value="private-value"><input value="typed-value">',
	);
	for (const value of ["Send", "Run", "Clear"])
		expect(test.resolve(`getByText('${value}')`).tagName).toBe("input");
	test.tree.setControl(test.id("submit"), { value: "Changed" });
	expect(test.resolve("getByText('Changed')").attributes.id).toBe("submit");
	for (const value of ["Send", "private-value", "typed-value"])
		expect(() => test.resolve(`getByText('${value}')`)).toThrow("matched no");
});

it("keeps accessible names separate from text content", () => {
	const test = fixture(
		'<button id="button" aria-label="Accessible">Visible</button><img alt="Picture">',
	);
	expect(test.resolve("getByText('Visible')").attributes.id).toBe("button");
	expect(() => test.resolve("getByText('Accessible')")).toThrow("matched no");
	expect(() => test.resolve("getByText('Picture')")).toThrow("matched no");
});

it("resolves external and wrapping labels, including password controls", () => {
	const test = fixture(
		'<label for="name">Full <b>name</b></label><input id="name"><label> Secret <input id="password" type="password"></label>',
	);
	expect(test.resolve("getByLabel('full name')").attributes.id).toBe("name");
	expect(
		test.resolve("getByLabel('Secret', {exact: true})").attributes.id,
	).toBe("password");
});

it("matches each associated label independently, not their concatenation", () => {
	const test = fixture(
		'<label for="field">First</label><label for="field">Second</label><input id="field">',
	);
	expect(test.resolve("getByLabel('First', {exact: true})").attributes.id).toBe(
		"field",
	);
	expect(
		test.resolve("getByLabel('Second', {exact: true})").attributes.id,
	).toBe("field");
	expect(() => test.resolve("getByLabel('First Second')")).toThrow(
		"matched no",
	);
});

it("gives valid aria-labelledby references precedence and matches each referenced text", () => {
	const test = fixture(
		'<span id="first" hidden>First label</span><span id="second">Second label</span><label for="field">Native label</label><input id="field" aria-labelledby="first missing first second" aria-label="ARIA fallback">',
	);
	for (const value of ["First label", "Second label"])
		expect(
			test.resolve(`getByLabel('${value}', {exact: true})`).attributes.id,
		).toBe("field");
	for (const value of [
		"First label Second label",
		"ARIA fallback",
		"Native label",
	])
		expect(() => test.resolve(`getByLabel('${value}')`)).toThrow("matched no");
});

it("falls back from invalid label references to aria-label and then native labels", () => {
	const test = fixture(
		'<label for="field">Native label</label><input id="field" aria-labelledby="missing" aria-label="ARIA fallback">',
	);
	expect(test.resolve("getByLabel('aria FALLBACK')").attributes.id).toBe(
		"field",
	);
	test.tree.setAttribute(test.id("field"), "aria-label", "   ");
	expect(test.resolve("getByLabel('Native label')").attributes.id).toBe(
		"field",
	);
});

it("does not use empty HTML IDs as implicit labels for every element", () => {
	const test = fixture(
		'<span id="">Not a label</span><input id="field" aria-label="Named">',
	);
	expect(test.resolve("getByLabel('Named')").attributes.id).toBe("field");
	expect(() => test.resolve("getByLabel('Not a label')")).toThrow("matched no");
});

it("honors first-ID ownership and does not associate a label with a non-labelable first match", () => {
	const test = fixture(
		'<label for="duplicate">Wrong</label><div id="duplicate">First text</div><input id="duplicate"><div id="ref">First name</div><div id="ref">Second name</div><input id="field" aria-labelledby="ref">',
	);
	expect(() => test.resolve("getByLabel('Wrong')")).toThrow("matched no");
	expect(test.resolve("getByLabel('First name')").attributes.id).toBe("field");
	expect(() => test.resolve("getByLabel('Second name')")).toThrow("matched no");
});

it("resolves ARIA labels on arbitrary elements but not native labels for hidden inputs", () => {
	const test = fixture(
		'<div id="custom" role="textbox" aria-label="Custom input"></div><label for="hidden">Hidden native</label><input id="hidden" type="hidden">',
	);
	expect(test.resolve("getByLabel('Custom input')").attributes.id).toBe(
		"custom",
	);
	expect(() => test.resolve("getByLabel('Hidden native')")).toThrow(
		"matched no",
	);
});

it("observes live label edits, associations, text mutations and removals", () => {
	const test = fixture(
		'<label id="label" for="first">Name</label><input id="first"><input id="second"><p id="text">Before</p>',
	);
	expect(test.resolve("getByLabel('Name')").attributes.id).toBe("first");
	test.tree.setAttribute(test.id("label"), "for", "second");
	test.tree.setTextContent(test.id("label"), "Changed");
	expect(test.resolve("getByLabel('Changed')").attributes.id).toBe("second");
	expect(() => test.resolve("getByLabel('Name')")).toThrow("matched no");
	test.tree.setTextContent(test.id("text"), "After");
	expect(test.resolve("getByText('After')").attributes.id).toBe("text");
	test.tree.remove(test.id("text"));
	expect(() => test.resolve("getByText('After')")).toThrow("matched no");
});

it.each([
	["getByPlaceholder", "placeholder"],
	["getByAltText", "alt"],
	["getByTitle", "title"],
])(
	"matches %s attributes literally without whitespace normalization or selector injection",
	(method, attribute) => {
		const test = fixture(
			`<input id="target" ${attribute}="  Keep   spaces  "><div id="other"></div>`,
		);
		expect(test.resolve(`${method}('KEEP   SPACES')`).attributes.id).toBe(
			"target",
		);
		expect(
			test.resolve(`${method}('  Keep   spaces  ', {exact: true})`).attributes
				.id,
		).toBe("target");
		expect(() => test.resolve(`${method}('Keep spaces')`)).toThrow(
			"matched no",
		);
		const value = '"] , div, [title="';
		test.tree.setAttribute(test.id("target"), attribute, value);
		expect(
			test.resolve(`${method}(${JSON.stringify(value)}, {exact: true})`)
				.attributes.id,
		).toBe("target");
	},
);

it("preserves strict ambiguity for labels and attributes", () => {
	const test = fixture(
		'<input aria-label="Name" placeholder="Hint"><input aria-label="Name" placeholder="Hint">',
	);
	expect(() => test.resolve("getByLabel('Name')")).toThrow("multiple elements");
	expect(() => test.resolve("getByPlaceholder('Hint')")).toThrow(
		"multiple elements",
	);
});

it("does not manufacture uniqueness from clipped text", () => {
	const test = fixture(
		`<p>Target</p><p>${"x".repeat(textLocatorLimits.maxTextCodeUnits + 1)}Target</p>`,
	);
	expect(() => test.resolve("getByText('Target')")).toThrow("content limit");
});

it("bounds repeated ancestor text accounting rather than caching unbounded copies", () => {
	const test = fixture(
		`${"<div>".repeat(50)}${"x".repeat(100_000)}${"</div>".repeat(50)}`,
	);
	expect(() =>
		textLocatorCandidates(test.tree, {
			kind: "text",
			value: "x",
			exact: false,
		}),
	).toThrow(/locator (work|cache) limit/);
});

it("does not build unrelated page text for label or attribute queries", () => {
	const test = fixture(
		`<p>${"x".repeat(300_000)}</p><label for="field">Field</label><input id="field" placeholder="Hint"><input id="aria" aria-label="ARIA">`,
	);
	expect(test.resolve("getByLabel('Field')").attributes.id).toBe("field");
	expect(test.resolve("getByLabel('ARIA')").attributes.id).toBe("aria");
	expect(test.resolve("getByPlaceholder('Hint')").attributes.id).toBe("field");
});

it("does not use clipped native labels to manufacture uniqueness", () => {
	const test = fixture(
		`<label for="first">Field</label><input id="first"><label for="second">${"x".repeat(300_000)}Field</label><input id="second">`,
	);
	expect(() => test.resolve("getByLabel('Field')")).toThrow("content limit");
});

it("bounds label reference tokenization before building large candidate arrays", () => {
	const test = fixture(
		'<span id="label">Name</span><input id="field" aria-label="Fallback">',
	);
	test.tree.setAttribute(
		test.id("field"),
		"aria-labelledby",
		"label ".repeat(textLocatorLimits.maxLabelReferences + 1),
	);
	expect(() => test.resolve("getByLabel('Name')")).toThrow(
		"reference count limit",
	);
	test.tree.setAttribute(
		test.id("field"),
		"aria-labelledby",
		"x".repeat(textLocatorLimits.maxLabelReferenceCodeUnits + 1),
	);
	expect(() => test.resolve("getByLabel('Fallback')")).toThrow(
		"reference text limit",
	);
});
