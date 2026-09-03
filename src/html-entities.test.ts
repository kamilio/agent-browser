import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { setInnerHtml } from "./html-content.js";
import { decodeHtmlEntities } from "./html-entities.js";
import { namedHtmlEntities } from "./html-named-entities.js";
import { parseHtmlDocument, parseHtmlFragment } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { DocumentQueries } from "./selectors.js";

function decode(value: string, attribute = false) {
	const issues: string[] = [];
	return {
		value: decodeHtmlEntities(value, attribute, (issue) => issues.push(issue)),
		issues,
	};
}

it("pins all named-reference records to the reviewed WHATWG code-point mapping", () => {
	const entries = Object.entries(namedHtmlEntities);
	expect(entries).toHaveLength(2231);
	expect(entries.filter(([name]) => !name.endsWith(";"))).toHaveLength(106);
	expect(Math.max(...entries.map(([name]) => name.length))).toBe(32);
	expect(Object.isFrozen(namedHtmlEntities)).toBe(true);
	const canonical = entries.map(([name, value]) => [
		name,
		Array.from(value, (character) => character.codePointAt(0)),
	]);
	expect(
		createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
	).toBe("d2bf9e24122990f845d824c5ba48fff235cbc9109ab59ff9091760f16138ace0");
});

it.each([false, true])(
	"decodes every published spelling with attribute=%s",
	(attribute) => {
		for (const [name, value] of Object.entries(namedHtmlEntities))
			expect(decode(`&${name}`, attribute), name).toEqual({
				value,
				issues: name.endsWith(";") ? [] : ["missing-entity-semicolon"],
			});
	},
);

it.each(["=", "0", "9", "A", "Z", "a", "z"])(
	"preserves every semicolonless attribute reference followed by %s",
	(suffix) => {
		for (const name of Object.keys(namedHtmlEntities)) {
			if (name.endsWith(";")) continue;
			const value = `&${name}${suffix}`;
			expect(decode(value, true), name).toEqual({ value, issues: [] });
		}
	},
);

it("decodes all entries in one stream without matching emitted characters again", () => {
	const entries = Object.entries(namedHtmlEntities);
	const result = decode(entries.map(([name]) => `&${name}`).join("|"));
	expect(result.value).toBe(entries.map(([, value]) => value).join("|"));
	expect(result.issues).toHaveLength(106);
});

it.each([
	["&CounterClockwiseContourIntegral;", "∳"],
	["&NotEqualTilde;", "≂̸"],
	["&fjlig;", "fj"],
	["&Afr;", "𝔄"],
	["&AElig;&aelig;", "Ææ"],
	["&Tab;&NewLine;", "\t\n"],
	["&notin; &notit; &notin", "∉ ¬it; ¬in"],
	["&ampersand; &copycat;", "&ersand; ©cat;"],
	["&notinE;", "⋹̸"],
])("decodes named references with longest matches: %s", (source, expected) => {
	expect(decode(source).value).toBe(expected);
});

it.each(["&notit;", "&notin", "&copycat;", "&amp=next", "&AElig2"])(
	"preserves legacy ambiguity in attributes: %s",
	(source) => {
		expect(decode(source, true)).toEqual({ value: source, issues: [] });
	},
);

it.each(["&unknown", "&1", "&constructor", "&toString"])(
	"does not report bare ambiguous ampersands as named-reference errors: %s",
	(source) => {
		expect(decode(source)).toEqual({ value: source, issues: [] });
	},
);

it.each(["&unknown;", "&1;", "&constructor;", "&toString;"])(
	"keeps unknown terminated references literal: %s",
	(source) => {
		expect(decode(source)).toEqual({
			value: source,
			issues: ["unresolved-named-reference"],
		});
	},
);

it("reports missing semicolons only for references that actually decode", () => {
	expect(decode("&AElig &notit; &copy;")).toEqual({
		value: "Æ ¬it; ©",
		issues: ["missing-entity-semicolon", "missing-entity-semicolon"],
	});
	expect(decode("&notit; &AElig!", true)).toEqual({
		value: "&notit; Æ!",
		issues: ["missing-entity-semicolon"],
	});
});

it("decodes once rather than reinterpreting emitted markup or entity syntax", () => {
	expect(decode("&amp;AElig; &lt;img&gt; &#38;copy;").value).toBe(
		"&AElig; <img> &copy;",
	);
});

it("uses the same mapping in text, RCDATA and attributes but not raw script/style text", () => {
	const tree = parseHtmlDocument(
		'<title>&AElig;</title><style>&AElig;</style><body><p title="&notit; &NotEqualTilde;">&Afr;&fjlig;</p><textarea>&notin;</textarea><script>&AElig;</script>',
		"https://fixture.invalid/",
	);
	try {
		const queries = new DocumentQueries(tree);
		const node = (selector: string) =>
			tree.get(queries.querySelector(selector) as number);
		expect(tree.textContent(node("title").id)).toBe("Æ");
		expect(tree.textContent(node("p").id)).toBe("𝔄fj");
		expect(node("p").attributes.title).toBe("&notit; ≂̸");
		expect(tree.textContent(node("textarea").id)).toBe("∉");
		expect(tree.textContent(node("style").id)).toBe("&AElig;");
		expect(tree.textContent(node("script").id)).toBe("&AElig;");
	} finally {
		tree.close();
	}
});

it("waits for a split long reference instead of committing its short legacy prefix", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("", (issue) => issues.push(issue));
	tokenizer.insert("before &not", 0);
	tokenizer.setBoundary(11);
	expect(tokenizer.next()).toEqual({ kind: "text", data: "before " });
	expect(tokenizer.next()).toBeUndefined();
	tokenizer.insert("inE; after", 11);
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual({ kind: "text", data: "⋹̸ after" });
	expect(issues).toEqual([]);
});

it.each([false, true])(
	"preserves every reference across each parser input split with attribute=%s",
	(attribute) => {
		for (const [name, expected] of Object.entries(namedHtmlEntities)) {
			const source = attribute ? `<p title="&${name}">` : `&${name}!`;
			const start = source.indexOf("&");
			for (let split = start + 1; split <= start + name.length; split++) {
				const issues: string[] = [];
				const tokenizer = new HtmlTokenizer(source, (issue) =>
					issues.push(issue),
				);
				let value = "";
				const drain = () => {
					for (let token = tokenizer.next(); token; token = tokenizer.next()) {
						if (token.kind === "text") value += token.data;
						else if (token.kind === "start") value += token.attributes.title;
						else throw new Error("Unexpected fixture token");
					}
				};
				tokenizer.setBoundary(split);
				drain();
				tokenizer.setBoundary(undefined);
				drain();
				expect(value, `${name} at ${split}`).toBe(
					attribute ? expected : `${expected}!`,
				);
				expect(issues, `${name} at ${split}`).toEqual(
					name.endsWith(";") ? [] : ["missing-entity-semicolon"],
				);
			}
		}
	},
);

it.each(["div", "title", "textarea"])(
	"uses the full mapping for %s fragments",
	(tagName) => {
		const { tree, fragment } = parseHtmlFragment(
			"&CounterClockwiseContourIntegral; &NotEqualTilde; &Afr;",
			"https://fixture.invalid/",
			{ tagName },
		);
		try {
			expect(tree.textContent(fragment)).toBe("∳ ≂̸ 𝔄");
		} finally {
			tree.close();
		}
	},
);

it("shares decoded identities across dynamic HTML, selectors and serialization", () => {
	const tree = parseHtmlDocument("<main></main>", "https://fixture.invalid/");
	try {
		const queries = new DocumentQueries(tree);
		const main = queries.querySelector("main") as number;
		setInnerHtml(
			tree,
			main,
			'<p id="&AElig;" title="&notit;">&Afr;&fjlig;&amp;copy;</p>',
		);
		const paragraph = queries.querySelector('[id="Æ"]') as number;
		expect(tree.textContent(paragraph)).toBe("𝔄fj&copy;");
		expect(serializeHtml(tree, main)).toBe(
			'<p id="Æ" title="&amp;notit;">𝔄fj&amp;copy;</p>',
		);
	} finally {
		tree.close();
	}
});

it("handles long unknown candidates and repeated short references without truncation", () => {
	const unknown = `&${"A".repeat(100_000)};`;
	expect(decode(unknown)).toEqual({
		value: unknown,
		issues: ["unresolved-named-reference"],
	});
	expect(decode("&notit;".repeat(10_000)).value).toBe("¬it;".repeat(10_000));
});

it.each([
	["&#65; &#x41; &#X1F600;", "A A 😀"],
	["&#0;&#xD800;&#1114112;", "���"],
	["&#128; &#x9f;", "€ Ÿ"],
	["&#65tail &#x41G", "Atail AG"],
	["&#999999999999999999999999999999999999;", "�"],
	["&#; &#x; &#-1;", "&#; &#x; &#-1;"],
])(
	"preserves numeric decoding while expanding named references: %s",
	(source, expected) => {
		expect(decode(source).value).toBe(expected);
	},
);
