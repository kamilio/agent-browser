import { afterEach, describe, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { htmlAttributeEntries } from "./html-attributes.js";
import { htmlParseInfo } from "./html-info.js";
import { type HtmlParseOptions, parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { sanitizeResearchHtml } from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const unexpectedName = "unexpected-character-in-attribute-name";
const unexpectedEquals = "unexpected-equals-sign-before-attribute-name";
const unexpectedNull = "unexpected-null-character";

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function parse(source: string, options: HtmlParseOptions = {}) {
	const tree = parseHtmlDocument(source, "https://example.test/", options);
	trees.push(tree);
	return tree;
}

function element(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing synthetic element: ${selector}`);
	return id;
}

function attribute(tree: DocumentTree, id: number, name: string) {
	const record = tree.getAttributeNode(id, name);
	if (record === null) throw new Error(`Missing synthetic attribute: ${name}`);
	return record;
}

function failure(action: () => unknown) {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected native resource failure");
}

const tokenCases = [
	{
		name: "the single double-quote Bing reproducer",
		source: '<a ">',
		attributes: { '"': "" },
		issues: [unexpectedName],
	},
	{
		name: "quote, apostrophe and less-than spelling with decoded values",
		source: `<a X"Y='A&amp;B' O'K="&quot;" L<T=MiXeD>`,
		attributes: { 'x"y': "A&B", "o'k": '"', "l<t": "MiXeD" },
		issues: [unexpectedName, unexpectedName, unexpectedName],
	},
	{
		name: "every unexpected character within a single name",
		source: `<a "'<="value">`,
		attributes: { "\"'<": "value" },
		issues: [unexpectedName, unexpectedName, unexpectedName],
	},
	{
		name: "leading equals as part of the name, not a missing name",
		source: "<a =NAME=first =name=second ==third>",
		attributes: { "=name": "first", "=": "third" },
		issues: [
			unexpectedEquals,
			unexpectedEquals,
			"duplicate-attribute",
			unexpectedEquals,
		],
	},
	{
		name: "ASCII folding without folding non-ASCII letters",
		source: `<a ÄX"=FIRST Äx"=second äX"=THIRD İD=UP İd=down>`,
		attributes: { 'Äx"': "FIRST", 'äx"': "THIRD", İd: "UP" },
		issues: [
			unexpectedName,
			unexpectedName,
			"duplicate-attribute",
			unexpectedName,
			"duplicate-attribute",
		],
	},
	{
		name: "NULL replacement before duplicate detection",
		source: '<a A\0B=first a�b=second \0\0="kept">',
		attributes: { "a�b": "first", "��": "kept" },
		issues: [
			unexpectedNull,
			"duplicate-attribute",
			unexpectedNull,
			unexpectedNull,
		],
	},
	{
		name: "malformed names after a quoted value without whitespace",
		source: `<a title="safe""=one '=two <=three>`,
		attributes: { title: "safe", '"': "one", "'": "two", "<": "three" },
		issues: [unexpectedName, unexpectedName, unexpectedName],
	},
];

describe("native malformed attribute token recovery", () => {
	it.each(tokenCases)("preserves $name", ({ source, attributes, issues }) => {
		const delivered: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (code) => delivered.push(code));
		expect(tokenizer.next()).toEqual({
			kind: "start",
			name: "a",
			attributes,
			selfClosing: false,
		});
		expect(tokenizer.position).toBe(source.length);
		expect(tokenizer.next()).toBeUndefined();
		expect(delivered).toEqual(issues);
		expect(tokenizer.issueCount).toBe(issues.length);
	});

	it.each(tokenCases)(
		"recovers $name at every inserted-chunk boundary",
		({ source, attributes, issues }) => {
			for (let boundary = 1; boundary < source.length; boundary++) {
				const delivered: string[] = [];
				const tokenizer = new HtmlTokenizer("tail", (code) =>
					delivered.push(code),
				);
				tokenizer.insert(source.slice(0, boundary), 0);
				tokenizer.setBoundary(boundary);
				expect(tokenizer.next()).toBeUndefined();
				expect(tokenizer.paused).toBe(true);
				expect(tokenizer.position).toBe(0);
				expect(delivered).toEqual([]);
				const speculativeIssues = tokenizer.issueCount;
				tokenizer.insert(source.slice(boundary), boundary);
				tokenizer.setBoundary(source.length);
				expect(tokenizer.next()).toEqual({
					kind: "start",
					name: "a",
					attributes,
					selfClosing: false,
				});
				expect(delivered).toEqual(issues);
				expect(tokenizer.issueCount).toBe(speculativeIssues + issues.length);
				expect(tokenizer.next()).toBeUndefined();
				expect(tokenizer.paused).toBe(true);
				tokenizer.setBoundary(undefined);
				expect(tokenizer.next()).toEqual({ kind: "text", data: "tail" });
				expect(tokenizer.next()).toBeUndefined();
				expect(delivered).toEqual(issues);
			}
		},
	);

	it.each(tokenCases)(
		"enforces the exact issue quota for $name",
		({ source, attributes, issues }) => {
			const accepted = new HtmlTokenizer(source, () => {}, issues.length);
			expect(accepted.next()).toMatchObject({ attributes });
			expect(accepted.issueCount).toBe(issues.length);
			for (const limit of new Set([0, issues.length - 1])) {
				const delivered: string[] = [];
				const rejected = new HtmlTokenizer(
					source,
					(code) => delivered.push(code),
					limit,
				);
				const error = failure(() => rejected.next());
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toEqual({
					kind: "html.issues",
					unit: "issues",
					limit,
					observed: limit + 1,
				});
				expect(delivered).toEqual([]);
				expect(rejected.issueCount).toBe(limit + 1);
			}
		},
	);

	it.each([false, true])(
		"retains the 1024 attribute cap with duplicate names: %s",
		(duplicates) => {
			const names = Array.from({ length: 1024 }, (_, index) =>
				duplicates ? 'x"' : `x${index}"`,
			);
			const source = names.join(" ");
			const delivered: string[] = [];
			const tokenizer = new HtmlTokenizer(`<a ${source}>`, (code) =>
				delivered.push(code),
			);
			const token = tokenizer.next();
			if (token?.kind !== "start") throw new Error("Missing start token");
			expect(Object.keys(token.attributes)).toHaveLength(duplicates ? 1 : 1024);
			expect(delivered.filter((code) => code === unexpectedName)).toHaveLength(
				1024,
			);
			expect(
				delivered.filter((code) => code === "duplicate-attribute"),
			).toHaveLength(duplicates ? 1023 : 0);
			expect(tokenizer.issueCount).toBe(duplicates ? 2047 : 1024);
			const rejectedIssues: string[] = [];
			const rejected = new HtmlTokenizer(`<a ${source} extra>`, (code) =>
				rejectedIssues.push(code),
			);
			const error = failure(() => rejected.next());
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "html.attributes",
				unit: "attributes",
				limit: 1024,
				observed: 1025,
			});
			expect(rejectedIssues).toEqual([]);
		},
	);

	it.each([
		{ source: '<a "', issue: unexpectedName },
		{ source: "<a '=", issue: unexpectedName },
		{ source: '<a <="unfinished', issue: unexpectedName },
		{ source: "<a =", issue: unexpectedEquals },
		{ source: "<a \0", issue: unexpectedNull },
	])(
		"does not invent a completed tag at EOF for $source",
		({ source, issue }) => {
			const delivered: string[] = [];
			const tokenizer = new HtmlTokenizer(source, (code) =>
				delivered.push(code),
			);
			expect(tokenizer.next()).toBeUndefined();
			expect(tokenizer.next()).toBeUndefined();
			expect(tokenizer.paused).toBe(false);
			expect(delivered).toEqual([issue, "unterminated-tag"]);
			expect(tokenizer.issueCount).toBe(2);
			const tree = parse(`<p>kept</p>${source}`);
			expect(new DocumentQueries(tree).querySelector("a")).toBeNull();
			expect(tree.textContent(element(tree, "body"))).toBe("kept");
			expect(htmlParseInfo(tree)?.issues["unterminated-tag"]).toBe(1);
		},
	);
});

describe("native malformed attributes in document construction", () => {
	it("retains body attribute spelling, order, values and prototype-looking names", () => {
		const tree = parse(
			`<a ID=link X"='A&amp;B' =NAME=first =name=second ÄX=UP äX=down A\0B=null __proto__=own constructor=ctor toString=string>useful</a>`,
		);
		const id = element(tree, "a");
		expect(htmlAttributeEntries(tree.get(id).attributes)).toEqual([
			["id", "link"],
			['x"', "A&B"],
			["=name", "first"],
			["Äx", "UP"],
			["äx", "down"],
			["a�b", "null"],
			["__proto__", "own"],
			["constructor", "ctor"],
			["tostring", "string"],
		]);
		for (const name of ["__proto__", "constructor", "tostring"]) {
			expect(Object.hasOwn(tree.get(id).attributes, name)).toBe(true);
			expect(tree.getAttributeRecord(attribute(tree, id, name))).toMatchObject({
				name,
				value: tree.get(id).attributes[name],
				ownerElement: id,
			});
		}
		expect(tree.textContent(id)).toBe("useful");
		expect(htmlParseInfo(tree)?.issues).toMatchObject({
			[unexpectedName]: 1,
			[unexpectedEquals]: 2,
			"duplicate-attribute": 1,
		});
	});

	it("retains head attributes and merges html/body attributes without replacing earlier values", () => {
		const tree = parse(
			`<html X"=first><head "=metadata></head><body '=first><html X"=later <=html><body '=later =body=value><p>kept</p>`,
		);
		expect(tree.get(element(tree, "html")).attributes).toEqual({
			'x"': "first",
			"<": "html",
		});
		expect(tree.get(element(tree, "head")).attributes).toEqual({
			'"': "metadata",
		});
		expect(tree.get(element(tree, "body")).attributes).toEqual({
			"'": "first",
			"=body": "value",
		});
		expect(tree.textContent(element(tree, "p"))).toBe("kept");
	});

	it.each([
		{
			source: `<p><b X"=kept>one</p>two`,
			html: `<p><b x"="kept">one</b></p><b x"="kept">two</b>`,
		},
		{
			source: `<b X"=kept><p>one</b>two</p>`,
			html: `<b x"="kept"></b><p><b x"="kept">one</b>two</p>`,
		},
	])(
		"preserves recovered formatting attributes for $source",
		({ source, html }) => {
			const tree = parse(source);
			expect(serializeHtml(tree, element(tree, "body"))).toBe(html);
			const formatted = new DocumentQueries(tree).querySelectorAll("b");
			expect(formatted).toHaveLength(2);
			for (const id of formatted)
				expect(tree.get(id).attributes).toEqual({ 'x"': "kept" });
		},
	);

	it("preserves recovered names through template content, cloning, copying and reparse", () => {
		const tree = parse(
			`<template '=host><a X"='A&amp;&quot;&lt;' =name=value ÄX=UP äX=down __proto__=own>text</a></template>`,
		);
		const template = element(tree, "template");
		const content = tree.templateContent(template);
		const anchor = content.tree.get(content.id).children[0];
		const attributes = content.tree.get(anchor).attributes;
		expect(attributes).toEqual({
			'x"': 'A&"<',
			"=name": "value",
			Äx: "UP",
			äx: "down",
			["__proto__"]: "own",
		});
		const destination = parse("<p>destination</p>");
		const copies = [
			{ tree, id: tree.clone(template, true) },
			{ tree: destination, id: destination.copyFrom(tree, template, true) },
		];
		const html = serializeHtml(tree, template, { includeSelf: true });
		const reparsed = parse(html);
		copies.push({ tree: reparsed, id: element(reparsed, "template") });
		for (const copy of copies) {
			expect(serializeHtml(copy.tree, copy.id, { includeSelf: true })).toBe(
				html,
			);
			expect(copy.tree.get(copy.id).attributes).toEqual({ "'": "host" });
			const copiedContent = copy.tree.templateContent(copy.id);
			const copiedAnchor = copiedContent.tree.get(copiedContent.id).children[0];
			expect(copiedContent.tree.get(copiedAnchor).attributes).toEqual(
				attributes,
			);
			expect(copiedContent.tree.textContent(copiedAnchor)).toBe("text");
			const record = attribute(copiedContent.tree, copiedAnchor, 'X"');
			copiedContent.tree.setAttributeValue(record, "copy-only");
			expect(copiedContent.tree.get(copiedAnchor).attributes['x"']).toBe(
				"copy-only",
			);
			expect(content.tree.get(anchor).attributes['x"']).toBe('A&"<');
		}
	});
});

describe("owned recovered attribute records", () => {
	it.each(['X"', "O'K", "L<T", "=NAME", "ÄX", "A�B", "__proto__"])(
		"updates and removes parsed %s without losing attached record identity",
		(name) => {
			const tree = parse(`<p ${name}=before>text</p>`);
			const id = element(tree, "p");
			const normalized = name.replace(/[A-Z]/g, (letter) =>
				letter.toLowerCase(),
			);
			const record = attribute(tree, id, name);
			expect(attribute(tree, id, normalized)).toBe(record);
			tree.setAttributeValue(record, "after");
			expect(tree.get(id).attributes[normalized]).toBe("after");
			expect(tree.getAttributeRecord(record)).toMatchObject({
				name: normalized,
				value: "after",
				ownerElement: id,
			});
			expect(attribute(tree, id, name)).toBe(record);
			tree.removeAttribute(id, name);
			expect(Object.hasOwn(tree.get(id).attributes, normalized)).toBe(false);
			expect(tree.getAttributeNode(id, name)).toBeNull();
			expect(tree.getAttributeRecord(record)).toMatchObject({
				value: "after",
				ownerElement: null,
			});
			tree.setAttributeValue(record, "detached");
			expect(tree.setAttributeNode(id, record)).toBeNull();
			expect(attribute(tree, id, name)).toBe(record);
			expect(tree.get(id).attributes[normalized]).toBe("detached");
			expect(tree.removeAttributeNode(id, record)).toBe(record);
			expect(tree.getAttributeNode(id, name)).toBeNull();
			expect(tree.getAttributeRecord(record).ownerElement).toBeNull();
		},
	);

	it.each(['"', "'", "=name", "bad name", "bad/name", "bad>name", "\0"])(
		"keeps ordinary creation, set and toggle validation strict for %j",
		(name) => {
			const tree = parse('<p "=kept>text</p>');
			const id = element(tree, "p");
			const usage = tree.resourceUsage();
			const revision = tree.revision;
			for (const mutate of [
				() => tree.createElement("div", { [name]: "value" }),
				() => tree.setAttribute(id, name, "value"),
				() => tree.createAttribute(name, "value"),
				() => tree.toggleAttribute(id, name),
				() => tree.toggleAttribute(id, name, false),
			]) {
				expect(mutate).toThrow(/attribute name/i);
				expect(tree.resourceUsage()).toEqual(usage);
				expect(tree.revision).toBe(revision);
				expect(tree.get(id).attributes).toEqual({ '"': "kept" });
			}
		},
	);

	it("rejects unspellable parser names and non-string values without partial writes", () => {
		const tree = parse('<p "=kept></p>');
		const id = element(tree, "p");
		const record = attribute(tree, id, '"');
		const usage = tree.resourceUsage();
		const revision = tree.revision;
		const invalid = [
			...[
				"",
				"\0",
				"a b",
				"a\tb",
				"a\nb",
				"a\fb",
				"a\rb",
				"a/b",
				"a>b",
				"a=b",
				"==",
			].map((name) => ({ name, value: "value" })),
			...[null, undefined, 1, false, {}].map((value) => ({
				name: '"',
				value: value as unknown as string,
			})),
		];
		for (const { name, value } of invalid) {
			for (const mutate of [
				() =>
					tree.createParserElement("div", { valid: "first", [name]: value }),
				() => tree.setParserAttribute(id, name, value),
			]) {
				expect(failure(mutate)).toMatchObject({ code: "invalid-input" });
				expect(tree.resourceUsage()).toEqual(usage);
				expect(tree.revision).toBe(revision);
				expect(tree.get(id).attributes).toEqual({ '"': "kept" });
				expect(tree.getAttributeRecord(record)).toMatchObject({
					value: "kept",
					ownerElement: id,
				});
			}
		}
	});

	it("does not bypass the node quota through parser element creation", () => {
		const tree = parse('<p "=kept></p>', { limits: { maxNodes: 5 } });
		const usage = tree.resourceUsage();
		const revision = tree.revision;
		const error = failure(() => tree.createParserElement("a", { '"': "new" }));
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "document.nodes",
			unit: "nodes",
			limit: 5,
			observed: 6,
		});
		expect(tree.resourceUsage()).toEqual(usage);
		expect(tree.revision).toBe(revision);
	});

	it("keeps parser creation, parser writes and attached Attr values atomic at the text quota", () => {
		const tree = parse('<p "=a>text</p>', {
			limits: { maxTextCodeUnits: 128 },
		});
		const id = element(tree, "p");
		const record = attribute(tree, id, '"');
		const usage = tree.resourceUsage();
		const revision = tree.revision;
		const before = tree.getAttributeRecord(record);
		for (const mutate of [
			() => tree.setAttributeValue(record, "x".repeat(128)),
			() => tree.setParserAttribute(id, '"', "x".repeat(128)),
			() => tree.setParserAttribute(id, "=new", "x".repeat(128)),
			() => tree.createParserElement("a", { '"': "x".repeat(128) }),
		]) {
			const error = failure(mutate);
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toMatchObject({
				kind: "document.text",
				limit: 128,
			});
			expect(tree.resourceUsage()).toEqual(usage);
			expect(tree.revision).toBe(revision);
			expect(tree.getAttributeRecord(record)).toEqual(before);
			expect(tree.get(id).attributes).toEqual({ '"': "a" });
			expect(attribute(tree, id, '"')).toBe(record);
		}
		tree.setAttributeValue(record, "ok");
		expect(tree.get(id).attributes['"']).toBe("ok");
	});
});

it("retains reader-safe attributes and text while counting rejected malformed names", () => {
	const result = sanitizeResearchHtml(
		`<a " href="/safe?q=one&amp;two" title="A&amp;B" '=x <=y =name=z __proto__=own constructor=ctor toString=string>Useful &amp; safe</a>`,
	);
	expect(result.html).toBe(
		'<a href="/safe?q=one&amp;two" title="A&amp;B">Useful &amp; safe</a>',
	);
	expect(result.report).toMatchObject({
		ignoredAttributes: 7,
		tokenizerIssues: 4,
	});
	const tree = parse(result.html);
	const anchor = element(tree, "a");
	expect(tree.get(anchor).attributes).toEqual({
		href: "/safe?q=one&two",
		title: "A&B",
	});
	expect(tree.textContent(anchor)).toBe("Useful & safe");
});
