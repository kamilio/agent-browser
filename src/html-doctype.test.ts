import { expect, it } from "vitest";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { htmlParseInfo } from "./html-info.js";
import { documentMode } from "./document-mode.js";
import { serializeHtml } from "./html-serialization.js";
import type { HtmlDoctypeToken } from "./html-doctype.js";

it("tokenizes names and identifiers instead of a raw declaration string", () => {
	const input = new HtmlTokenizer(
		"<!doctype HTML PUBLIC \"Public\" 'System'>",
		() => {},
	);
	expect(input.next()).toEqual({
		kind: "doctype",
		name: "html",
		publicId: "Public",
		systemId: "System",
		forceQuirks: false,
	});
});

it("preserves a parsed document type before the document element", () => {
	const tree = parseHtmlDocument(
		'<!doctype HTML PUBLIC "Public" "System"><p>body',
		"https://example.com",
	);
	try {
		const first = tree.get(tree.get(tree.root).children[0]);
		expect(first.kind).toBe("doctype");
		expect(first.doctype).toEqual({
			name: "html",
			publicId: "Public",
			systemId: "System",
		});
	} finally {
		tree.close();
	}
});

it("terminates a quoted doctype identifier at the first greater-than sign", () => {
	const input = new HtmlTokenizer(
		'<!doctype html SYSTEM "bad><p>body',
		() => {},
	);
	expect(input.next()).toMatchObject({
		kind: "doctype",
		systemId: "bad",
		forceQuirks: true,
	});
	expect(input.next()).toMatchObject({ kind: "start", name: "p" });
});

function read(source: string) {
	const issues: string[] = [];
	const input = new HtmlTokenizer(source, (code) => issues.push(code));
	const token = input.next();
	expect(token?.kind).toBe("doctype");
	return { input, token: token as HtmlDoctypeToken, issues };
}

const valid: readonly [string, string | null, string | null, string][] = [
	["<!DOCTYPE html>", null, null, "html"],
	["<!doctypehtml>", null, null, "html"],
	["<!doctype hTmL PUBLIC ''>", "", null, "html"],
	['<!doctype html SYSTEM "">', null, "", "html"],
	["<!doctype html PUBLIC\"P\"'S'>", "P", "S", "html"],
	['<!doctype html SYSTEM"S">', null, "S", "html"],
	['<!doctype html PUBLIC "&amp;" "&#38;">', "&amp;", "&#38;", "html"],
	['<!doctype ÄHTML PUBLIC "ÄBC">', "ÄBC", null, "Ähtml"],
	["<!doctype \u00a0HTML>", null, null, "\u00a0html"],
];
for (const [source, publicId, systemId, name] of valid)
	it(`retains doctype data: ${source}`, () => {
		expect(read(source).token).toEqual({
			kind: "doctype",
			name,
			publicId,
			systemId,
			forceQuirks: false,
		});
	});

const malformed: readonly [string, string, boolean][] = [
	["<!doctype>", "missing-doctype-name", true],
	["<!doctype", "eof-in-doctype", true],
	["<!doctype  ", "eof-in-doctype", true],
	["<!doctype html", "eof-in-doctype", true],
	["<!doctype html ", "eof-in-doctype", true],
	[
		"<!doctype html WHAT>",
		"invalid-character-sequence-after-doctype-name",
		true,
	],
	["<!doctype html PUBLIC>", "missing-doctype-public-identifier", true],
	["<!doctype html SYSTEM >", "missing-doctype-system-identifier", true],
	[
		"<!doctype html PUBLIC raw>",
		"missing-quote-before-doctype-public-identifier",
		true,
	],
	[
		"<!doctype html SYSTEM raw>",
		"missing-quote-before-doctype-system-identifier",
		true,
	],
	['<!doctype html PUBLIC "open>', "abrupt-doctype-public-identifier", true],
	["<!doctype html SYSTEM 'open>", "abrupt-doctype-system-identifier", true],
	['<!doctype html PUBLIC "open', "eof-in-doctype", true],
	['<!doctype html PUBLIC "p"', "eof-in-doctype", true],
	[
		'<!doctype html PUBLIC "p" raw>',
		"missing-quote-before-doctype-system-identifier",
		true,
	],
	['<!doctype html SYSTEM "s"', "eof-in-doctype", true],
	[
		'<!doctype html SYSTEM "s" junk>',
		"unexpected-character-after-doctype-system-identifier",
		false,
	],
	[
		'<!doctype html SYSTEM "s" junk',
		"unexpected-character-after-doctype-system-identifier",
		false,
	],
];
for (const [source, issue, forceQuirks] of malformed)
	it(`recovers malformed doctype: ${source}`, () => {
		const result = read(source);
		expect(result.issues).toContain(issue);
		expect(result.token.forceQuirks).toBe(forceQuirks);
	});

it("replaces nulls in fields while ignoring nulls in bogus tails", () => {
	const result = read('<!doctype HT\0ML PUBLIC "A\0B" "C\0D" bad\0>');
	expect(result.token).toEqual({
		kind: "doctype",
		name: "ht\ufffdml",
		publicId: "A\ufffdB",
		systemId: "C\ufffdD",
		forceQuirks: false,
	});
	expect(
		result.issues.filter((code) => code === "unexpected-null-character"),
	).toHaveLength(4);
});

it("reports missing separators without forcing quirks", () => {
	const result = read('<!doctypehtml PUBLIC"p""s">');
	expect(result.issues).toEqual([
		"missing-whitespace-before-doctype-name",
		"missing-whitespace-after-doctype-public-keyword",
		"missing-whitespace-between-doctype-public-and-system-identifiers",
	]);
	expect(result.token.forceQuirks).toBe(false);
});

for (const source of [
	"<!doctype html><p>",
	"<!DOCTYPEhtml PUBLIC \"p\" 's'><p>",
	'<!doctype html SYSTEM"a>b"><p>',
	"<!doctype html PUBLIC raw><p>",
	'<!doctype html SYSTEM "s" ignored><p>',
])
	it(`pauses atomically across every doctype boundary: ${source}`, () => {
		const complete = read(source);
		for (let boundary = 1; boundary < complete.input.position; boundary++) {
			const issues: string[] = [];
			const input = new HtmlTokenizer(source, (code) => issues.push(code));
			input.setBoundary(boundary);
			expect(input.next()).toBeUndefined();
			expect(input.paused).toBe(true);
			expect(input.position).toBe(0);
			expect(issues).toEqual([]);
			input.setBoundary(undefined);
			expect(input.next()).toEqual(complete.token);
			expect(issues).toEqual(complete.issues);
			expect(input.workUnits).toBeLessThanOrEqual(source.length * 2);
		}
	});

it("resumes a public identifier with inserted input without duplicating diagnostics", () => {
	const input = new HtmlTokenizer("", () => {});
	const first = '<!doctypehtml PUBLIC"par';
	input.insert(first, 0);
	input.setBoundary(first.length);
	expect(input.next()).toBeUndefined();
	input.insert('t" "system">', first.length);
	input.setBoundary(undefined);
	expect(input.next()).toMatchObject({
		name: "html",
		publicId: "part",
		systemId: "system",
		forceQuirks: false,
	});
});

it("preserves leading comments and keeps duplicate declarations out of the tree", () => {
	const tree = parseHtmlDocument(
		"<!--first-->\n<!doctype html><!--second--><!doctype bad><p>text",
		"https://example.com",
	);
	try {
		expect(tree.get(tree.root).children.map((id) => tree.get(id).kind)).toEqual(
			["comment", "doctype", "comment", "element"],
		);
		expect(documentMode(tree)).toBe("no-quirks");
		expect(htmlParseInfo(tree)?.issues["misplaced-doctype"]).toBe(1);
		expect(serializeHtml(tree, tree.root)).toContain("<!DOCTYPE html>");
	} finally {
		tree.close();
	}
});

for (const prefix of ["<html>", "<head>", "<body>", "text", "</unknown>"])
	it(`ignores doctypes after the initial mode: ${prefix}`, () => {
		const tree = parseHtmlDocument(
			`${prefix}<!doctype html>`,
			"https://example.com",
		);
		try {
			expect(
				tree
					.get(tree.root)
					.children.some((id) => tree.get(id).kind === "doctype"),
			).toBe(false);
			expect(documentMode(tree)).toBe("quirks");
			expect(htmlParseInfo(tree)?.issues).toMatchObject({
				"missing-doctype": 1,
				"misplaced-doctype": 1,
			});
		} finally {
			tree.close();
		}
	});

for (const tagName of ["html", "body", "div", "table"])
	it(`does not materialize fragment doctypes in ${tagName}`, () => {
		const { tree } = parseHtmlFragment(
			'<!doctype html PUBLIC "html"><p>x',
			"https://example.com",
			{ tagName },
		);
		try {
			expect([...tree.walk()].some(({ node }) => node.kind === "doctype")).toBe(
				false,
			);
			expect(documentMode(tree)).toBe("no-quirks");
			expect(htmlParseInfo(tree)?.issues["missing-doctype"]).toBeUndefined();
		} finally {
			tree.close();
		}
	});

it("charges the additional retained doctype node to parser quotas", () => {
	expect(() =>
		parseHtmlDocument("<!doctype html>", "https://example.com", {
			limits: { maxNodes: 4 },
		}),
	).toThrow("node limit");
	const tree = parseHtmlDocument("<!doctype html>", "https://example.com", {
		limits: { maxNodes: 5 },
	});
	expect(tree.nodeCount).toBe(5);
	tree.close();
});

it("makes the parsed doctype and mode available before parser script hooks", async () => {
	let seen = false;
	const tree = await parseHtmlDocumentAsync(
		'<!doctype html PUBLIC "html"><script>test</script>',
		"https://example.com",
		{},
		{
			start() {},
			async script(current) {
				seen = true;
				expect(
					current.get(current.get(current.root).children[0]).doctype?.publicId,
				).toBe("html");
				expect(documentMode(current)).toBe("quirks");
			},
			async finish() {},
		},
	);
	expect(seen).toBe(true);
	tree.close();
});

it("charges retained doctype name text in addition to the parser scaffold", () => {
	expect(() =>
		parseHtmlDocument("<!doctype html>", "https://example.com", {
			limits: { maxTextCodeUnits: 15 },
		}),
	).toThrow("text limit");
	const tree = parseHtmlDocument("<!doctype html>", "https://example.com", {
		limits: { maxTextCodeUnits: 16 },
	});
	expect(tree.resourceUsage().textCodeUnits).toBe(16);
	tree.close();
});

it("closes a quota-failed parser document rather than leaking the partial tree", () => {
	let closed = false;
	expect(() =>
		parseHtmlDocument("<!doctype html>", "https://example.com", {
			limits: { maxNodes: 4 },
			initializeDocument(tree) {
				tree.onClose(() => {
					closed = true;
				});
			},
		}),
	).toThrow("node limit");
	expect(closed).toBe(true);
});

it("does not overwrite a doctype inserted by the native initialization hook", () => {
	const tree = parseHtmlDocument("<!doctype html>", "https://example.com", {
		initializeDocument(current) {
			current.append(current.root, current.createDocumentType("native"));
		},
	});
	expect(tree.get(tree.get(tree.root).children[0]).doctype?.name).toBe(
		"native",
	);
	expect(documentMode(tree)).toBe("no-quirks");
	tree.close();
});
