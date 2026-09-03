import { expect, it } from "vitest";
import { setInnerHtml } from "./html-content.js";
import { decodeHtmlEntities } from "./html-entities.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument, parseHtmlFragment } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { DocumentQueries } from "./selectors.js";

function decode(source: string, attribute = false) {
	const issues: string[] = [];
	const value = decodeHtmlEntities(source, attribute, (issue) =>
		issues.push(issue),
	);
	return { value, issues };
}

it.each([
	"&#;",
	"&#x;",
	"&#X;",
	"&#",
	"&#x",
	"&#-1;",
	"&#x+1;",
	"&#qux;",
	"&#xG;",
])(
	"reports missing digits while preserving the literal input: %s",
	(source) => {
		expect(decode(source)).toEqual({
			value: source,
			issues: ["missing-numeric-entity-digits"],
		});
		expect(decode(source, true)).toEqual({
			value: source,
			issues: ["missing-numeric-entity-digits"],
		});
	},
);

it.each([1, 8, 11, 13, 14, 31, 127])(
	"preserves disallowed control %s but records its numeric-reference issue",
	(point) => {
		expect(decode(`&#${point};`)).toEqual({
			value: String.fromCodePoint(point),
			issues: ["control-numeric-entity"],
		});
	},
);

it.each([0xfdd0, 0xfdef, 0xfffe, 0xffff, 0x1fffe, 0x10ffff])(
	"preserves Unicode noncharacter %s but records its reference issue",
	(point) => {
		expect(decode(`&#x${point.toString(16)};`)).toEqual({
			value: String.fromCodePoint(point),
			issues: ["noncharacter-numeric-entity"],
		});
	},
);

it("orders missing-semicolon issues before numeric-end issues", () => {
	expect(decode("&#13x &#xFFFFg &#0x")).toEqual({
		value: "\rx \uffffg \ufffdx",
		issues: [
			"missing-entity-semicolon",
			"control-numeric-entity",
			"missing-entity-semicolon",
			"noncharacter-numeric-entity",
			"missing-entity-semicolon",
			"invalid-numeric-entity",
		],
	});
});

it.each([false, true])(
	"covers every Unicode noncharacter in decimal and hexadecimal with attribute=%s",
	(attribute) => {
		const points = Array.from({ length: 32 }, (_, index) => 0xfdd0 + index);
		for (let plane = 0; plane <= 16; plane++)
			points.push(plane * 65_536 + 65_534, plane * 65_536 + 65_535);
		expect(new Set(points).size).toBe(66);
		for (const point of points)
			for (const reference of [`&#${point};`, `&#x${point.toString(16)};`])
				expect(decode(reference, attribute)).toEqual({
					value: String.fromCodePoint(point),
					issues: ["noncharacter-numeric-entity"],
				});
	},
);

it("distinguishes all C0 controls from permitted ASCII whitespace", () => {
	for (let point = 0; point <= 0x20; point++) {
		const issues =
			point === 0
				? ["invalid-numeric-entity"]
				: [9, 10, 12, 32].includes(point)
					? []
					: ["control-numeric-entity"];
		expect(decode(`&#${point};`)).toEqual({
			value: String.fromCodePoint(point === 0 ? 0xfffd : point),
			issues,
		});
	}
});

it("retains the complete legacy C1 mapping and its existing diagnostic category", () => {
	const expected = Array.from(
		"€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ",
	);
	expect(expected).toHaveLength(32);
	for (let index = 0; index < expected.length; index++)
		expect(decode(`&#${0x80 + index};`)).toEqual({
			value: expected[index],
			issues: ["legacy-numeric-entity"],
		});
});

it.each([0, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x110000, 0x1fffff])(
	"replaces invalid scalar %s with only the existing invalid-number category",
	(point) => {
		for (const source of [`&#${point};`, `&#X${point.toString(16)};`])
			expect(decode(source)).toEqual({
				value: "\ufffd",
				issues: ["invalid-numeric-entity"],
			});
	},
);

it.each([
	0x20, 0x7e, 0xa0, 0xd7ff, 0xe000, 0xfdcf, 0xfdf0, 0xfffd, 0x10000, 0x10fffd,
])("does not warn for valid scalar %s", (point) => {
	expect(decode(`&#x${point.toString(16)};`)).toEqual({
		value: String.fromCodePoint(point),
		issues: [],
	});
});

it.each([false, true])(
	"preserves output and issue ordering across every input split with attribute=%s",
	(attribute) => {
		for (const reference of [
			"&#;",
			"&#xG;",
			"&#x",
			"&#13;",
			"&#xFDD0;",
			"&#128;",
			"&#0;",
			"&#xD800;",
			"&#1114112;",
			"&#65tail",
			"&#x41G",
			"&#x0001;",
			"&#x10FFFF;",
			"&#999999999999999999999999;",
		]) {
			const content = `${reference}|`;
			const source = attribute ? `<p value="${content}">` : content;
			const expected = decode(content, attribute);
			for (let split = 1; split < source.length; split++) {
				const issues: string[] = [];
				const tokenizer = new HtmlTokenizer(source, (issue) =>
					issues.push(issue),
				);
				let value = "";
				const drain = () => {
					for (let token = tokenizer.next(); token; token = tokenizer.next()) {
						if (token.kind === "text") value += token.data;
						else if (token.kind === "start") value += token.attributes.value;
						else throw new Error("Unexpected numeric fixture token");
					}
				};
				tokenizer.setBoundary(split);
				drain();
				tokenizer.setBoundary(undefined);
				drain();
				expect({ value, issues }, `${reference} at ${split}`).toEqual(expected);
			}
		}
	},
);

it("waits for missing digits to become decidable at an input boundary", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("&#xG;", (issue) => issues.push(issue));
	tokenizer.setBoundary(3);
	expect(tokenizer.next()).toBeUndefined();
	expect(issues).toEqual([]);
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual({ kind: "text", data: "&#xG;" });
	expect(issues).toEqual(["missing-numeric-entity-digits"]);
});

it.each([
	["&#13;", "control-numeric-entity"],
	["&#;", "missing-numeric-entity-digits"],
	["&copy", "missing-entity-semicolon"],
])(
	"reports references in discarded duplicate attribute values: %s",
	(value, issue) => {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(
			`<p value="kept" VALUE="${value}">`,
			(code) => issues.push(code),
		);
		expect(tokenizer.next()).toMatchObject({ attributes: { value: "kept" } });
		expect(issues).toEqual(["duplicate-attribute", issue]);
	},
);

it("does not recursively decode emitted ampersands or turn decoded text into markup", () => {
	expect(decode("&#38;#13; &#60;p&#62; &#x; &#65;")).toEqual({
		value: "&#13; <p> &#x; A",
		issues: ["missing-numeric-entity-digits"],
	});
});

it("reports discarded attribute references once across every input split", () => {
	const source = '<p value="kept" VALUE="&#13;&#x;&copy">';
	for (let split = 1; split < source.length; split++) {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (issue) => issues.push(issue));
		tokenizer.setBoundary(split);
		expect(tokenizer.next(), `split ${split}`).toBeUndefined();
		expect(issues, `split ${split}`).toEqual([]);
		tokenizer.setBoundary(undefined);
		expect(tokenizer.next()).toMatchObject({ attributes: { value: "kept" } });
		expect(tokenizer.next()).toBeUndefined();
		expect(issues, `split ${split}`).toEqual([
			"duplicate-attribute",
			"control-numeric-entity",
			"missing-numeric-entity-digits",
			"missing-entity-semicolon",
		]);
	}
});

it("shares numeric decoding and issue counts in text, attributes and RCDATA", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><title>x&#13;</title><body><p value="&#xFDD0;">&#;</p><textarea>x&#1;</textarea><style>&#1;</style><script>&#xFFFF;</script>',
		"https://fixture.invalid/",
	);
	try {
		const queries = new DocumentQueries(tree);
		const id = (selector: string) => {
			const found = queries.querySelector(selector);
			if (found === null) throw new Error("Missing numeric fixture element");
			return found;
		};
		expect(tree.textContent(id("title"))).toBe("x\r");
		expect(tree.get(id("p")).attributes.value).toBe("\ufdd0");
		expect(tree.textContent(id("p"))).toBe("&#;");
		expect(tree.textContent(id("textarea"))).toBe("x\u0001");
		expect(tree.textContent(id("style"))).toBe("&#1;");
		expect(tree.textContent(id("script"))).toBe("&#xFFFF;");
		expect(htmlParseInfo(tree)?.issues).toMatchObject({
			"control-numeric-entity": 2,
			"noncharacter-numeric-entity": 1,
			"missing-numeric-entity-digits": 1,
		});
	} finally {
		tree.close();
	}
});

it.each(["div", "title", "textarea"])(
	"shares numeric diagnostics in a %s fragment",
	(tagName) => {
		const { tree, fragment } = parseHtmlFragment(
			"x&#13;&#xFFFF;&#;",
			"https://fixture.invalid/",
			{ tagName },
		);
		try {
			expect(tree.textContent(fragment)).toBe("x\r\uffff&#;");
			expect(htmlParseInfo(tree)?.issues).toMatchObject({
				"control-numeric-entity": 1,
				"noncharacter-numeric-entity": 1,
				"missing-numeric-entity-digits": 1,
			});
		} finally {
			tree.close();
		}
	},
);

it("preserves decoded values through dynamic insertion and serialization", () => {
	const tree = parseHtmlDocument("<main></main>", "https://fixture.invalid/");
	try {
		const queries = new DocumentQueries(tree);
		const main = queries.querySelector("main");
		if (main === null) throw new Error("Missing numeric fixture root");
		setInnerHtml(tree, main, '<p title="&#xFDD0;">&#13;&#;</p>');
		expect(tree.textContent(main)).toBe("\r&#;");
		expect(serializeHtml(tree, main)).toBe('<p title="\ufdd0">\r&amp;#;</p>');
	} finally {
		tree.close();
	}
});

it("handles long overflow, leading-zero and malformed references without truncating following text", () => {
	expect(decode(`&#${"9".repeat(100_000)};after`)).toEqual({
		value: "\ufffdafter",
		issues: ["invalid-numeric-entity"],
	});
	expect(decode(`&#${"0".repeat(100_000)}65;after`)).toEqual({
		value: "Aafter",
		issues: [],
	});
	const malformed = `&#x${"G".repeat(100_000)};after`;
	expect(decode(malformed)).toEqual({
		value: malformed,
		issues: ["missing-numeric-entity-digits"],
	});
});
