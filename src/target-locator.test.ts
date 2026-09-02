import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { parseTargetLocator, resolveBrowserTarget } from "./target-locator.js";

const documents: DocumentTree[] = [];
function fixture() {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		text = "",
		parent = tree.root,
	) => {
		const node = tree.createElement(tag, attributes);
		tree.append(parent, node);
		if (text) tree.append(node, tree.createText(text));
		return tree.reference(node);
	};
	return {
		tree,
		queries,
		add,
		resolve: (source: string) => resolveBrowserTarget(tree, queries, source),
	};
}

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("parses literal role and test-ID syntax without evaluating expressions", () => {
	expect(
		parseTargetLocator(
			" getByRole('button', { name: 'Submit', exact: true, }) ",
		),
	).toEqual({ kind: "role", role: "button", name: "Submit", exact: true });
	expect(parseTargetLocator('getByRole("checkbox")')).toEqual({
		kind: "role",
		role: "checkbox",
		exact: false,
	});
	expect(
		parseTargetLocator(
			"getByRole('button', {'exact': false, \"name\": 'Run'})",
		),
	).toMatchObject({ name: "Run", exact: false });
	expect(parseTargetLocator("getByTestId('submit-button')")).toEqual({
		kind: "test-id",
		value: "submit-button",
	});
	expect(parseTargetLocator("#main > button")).toBeUndefined();
	expect(parseTargetLocator("e12")).toBeUndefined();
});

it("decodes bounded quote, slash, whitespace and hexadecimal escapes", () => {
	expect(
		parseTargetLocator(String.raw`getByTestId('a\'b\\c\n\t\x41\u0042')`),
	).toEqual({ kind: "test-id", value: "a'b\\c\n\tAB" });
});

it.each([
	"getByRole('button', {name: /run/i})",
	"getByRole('button', {name: String('run')})",
	"getByRole('button', {exact: 1})",
	"getByRole('button', {name: 'one', name: 'two'})",
	"getByRole('button', {includeHidden: true})",
	"getByRole('button').first()",
	"getByRole('button'); globalThis.polluted = true",
	"getByRole(`button`)",
	"getByRole('button', {...options})",
	"getByTestId(globalThis.polluted = true)",
	"getByTestId('a', 'b')",
	"getByTestId('unterminated)",
	String.raw`getByTestId('\u{41}')`,
	String.raw`getByTestId('\xZZ')`,
	"getByTestId('raw\nnewline')",
	"getByUnknown('Name')",
])("rejects unsupported syntax and executable input: %s", (source) => {
	expect(() => parseTargetLocator(source)).toThrow();
});

it("bounds source and decoded string sizes", () => {
	expect(() =>
		parseTargetLocator(`getByTestId('${"a".repeat(4097)}')`),
	).toThrow("string limit");
	expect(() =>
		parseTargetLocator(`getByTestId('${"a".repeat(8192)}')`),
	).toThrow("source limit");
});

it("resolves test IDs exactly without treating attribute content as selector syntax", () => {
	const test = fixture();
	const value = 'a"], button, [data-testid="b\u0000';
	const matching = test.add("input", { "data-testid": value });
	test.add("button", { "data-testid": "other" });
	test.add("input", { "data-testid": value.replace("\u0000", "\ufffd") });
	expect(test.resolve(`getByTestId(${JSON.stringify(value)})`)).toBe(matching);
	expect(() => test.resolve("getByTestId('OTHER')")).toThrow("matched no");
});

it("uses implicit/explicit roles with normalized substring or exact accessible names", () => {
	const test = fixture();
	const button = test.add("button", {}, "  Submit\n   order ");
	const custom = test.add("div", {
		role: "button",
		"aria-label": "Custom action",
	});
	expect(test.resolve("getByRole('button', {name: 'submit'})")).toBe(button);
	expect(
		test.resolve("getByRole('button', {name: 'Submit order', exact: true})"),
	).toBe(button);
	expect(test.resolve("getByRole('button', {name: 'custom action'})")).toBe(
		custom,
	);
	expect(() =>
		test.resolve("getByRole('button', {name: 'submit order', exact: true})"),
	).toThrow("matched no");
});

it("uses labels and aria-labelledby rather than input current values", () => {
	const test = fixture();
	test.add("label", { for: "name" }, "Full name");
	const input = test.add("input", { id: "name", value: "not a label" });
	test.add("span", { id: "action-name" }, "Labelled action");
	const button = test.add(
		"button",
		{ "aria-labelledby": "action-name" },
		"Fallback",
	);
	expect(test.resolve("getByRole('textbox', {name: 'Full name'})")).toBe(input);
	expect(test.resolve("getByRole('button', {name: 'Labelled action'})")).toBe(
		button,
	);
});

it("does not manufacture implicit textbox/button roles for protected and date controls", () => {
	const test = fixture();
	for (const type of [
		"password",
		"file",
		"date",
		"color",
		"month",
		"time",
		"week",
		"datetime-local",
	])
		test.add("input", { type });
	expect(() => test.resolve("getByRole('textbox')")).toThrow("matched no");
	expect(() => test.resolve("getByRole('button')")).toThrow("matched no");
	const combo = test.add("input", {
		type: "search",
		list: "suggestions",
		"aria-label": "Search",
	});
	expect(test.resolve("getByRole('combobox', {name: 'Search'})")).toBe(combo);
});

it("rejects ambiguity, including matching descendants omitted from ordinary leaf snapshots", () => {
	const test = fixture();
	const outer = test.add("div", { role: "button", "aria-label": "Run" });
	const inner = test.add("button", {}, "Run", test.tree.resolve(outer).id);
	expect(
		snapshotDocument(test.tree).entries.some((entry) => entry.ref === inner),
	).toBe(false);
	expect(() =>
		test.resolve("getByRole('button', {name: 'Run', exact: true})"),
	).toThrow("multiple elements");
	test.add("input", { "data-testid": "duplicate" });
	test.add("input", { "data-testid": "duplicate" });
	expect(() => test.resolve("getByTestId('duplicate')")).toThrow(
		"multiple elements",
	);
});

it("rechecks live names, CSS visibility and test IDs on every resolution", () => {
	const test = fixture();
	const visible = test.add("button", { "data-testid": "before" }, "Run");
	test.add("button", { style: "display:none" }, "Run");
	test.add("button", { "aria-hidden": "true" }, "Run");
	expect(test.resolve("getByRole('button', {name:'Run'})")).toBe(visible);
	test.tree.setAttribute(test.tree.resolve(visible).id, "data-testid", "after");
	test.tree.setTextContent(test.tree.resolve(visible).id, "Changed");
	expect(() => test.resolve("getByTestId('before')")).toThrow("matched no");
	expect(test.resolve("getByTestId('after')")).toBe(visible);
	expect(test.resolve("getByRole('button', {name:'Changed'})")).toBe(visible);
});

it("fails closed when accessible candidate names exceed the projection budget", () => {
	const test = fixture();
	test.add("button", {}, "a".repeat(17000));
	test.add("button", {}, "Run");
	expect(() => test.resolve("getByRole('button', {name:'Run'})")).toThrow(
		"untruncated",
	);
});

it("preserves CSS/ref behavior and rejects stale refs after native removal", () => {
	const test = fixture();
	const reference = test.add("button", { id: "action" }, "Run");
	expect(test.resolve("#action")).toBe(reference);
	expect(test.resolve(reference)).toBe(reference);
	test.tree.remove(test.tree.resolve(reference).id);
	expect(() => test.resolve(reference)).toThrow("no longer in this document");
});

it("does not mistake a clipped accessible-name prefix for a complete uniqueness check", () => {
	const test = fixture();
	const first = test.add("button");
	const identity = test.tree.resolve(first).id;
	test.tree.append(identity, test.tree.createText(` ${"a".repeat(16383)} `));
	test.tree.append(identity, test.tree.createText("tail"));
	test.add("button", {}, "tail");
	expect(() => test.resolve("getByRole('button', {name:'tail'})")).toThrow(
		"untruncated",
	);
});
