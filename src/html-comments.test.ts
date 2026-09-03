import { expect, it } from "vitest";
import { setInnerHtml } from "./html-content.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { type HtmlToken, HtmlTokenizer } from "./html-tokenizer.js";
import { DocumentQueries } from "./selectors.js";

function tokenize(source: string) {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer(source, (issue) => issues.push(issue));
	const tokens: HtmlToken[] = [];
	for (let token = tokenizer.next(); token; token = tokenizer.next())
		tokens.push(token);
	return { tokens, issues };
}

const cases: [string, string, string[]][] = [
	["<!---->", "", []],
	["<!-->", "", ["abrupt-closing-of-empty-comment"]],
	["<!--->", "", ["abrupt-closing-of-empty-comment"]],
	["<!--text-->", "text", []],
	["<!--text--!>", "text", ["incorrectly-closed-comment"]],
	["<!--text<!--nested-->", "text<!--nested", ["nested-comment"]],
	["<!--text<!-->", "text<!", []],
	[
		"<!--text<!--!>",
		"text<!",
		["nested-comment", "incorrectly-closed-comment"],
	],
	["<!--text--!x-->", "text--!x", []],
	["<!--text--!-->", "text--!", []],
	["<!--text---!>", "text-", ["incorrectly-closed-comment"]],
	["<!--text<<<<!x-->", "text<<<<!x", []],
	["<!--text<!-x-->", "text<!-x", []],
	["<!--&amp;<script>text</script>-->", "&amp;<script>text</script>", []],
	["<!--\0-->", "�", ["unexpected-null-character"]],
	["<!---x-->", "-x", []],
	["<!------>", "--", []],
];

const bogusCases: [string, string, string][] = [
	["<!>", "", "bogus-declaration"],
	['<!foo " >', 'foo " ', "bogus-declaration"],
	["<!foo ' >", "foo ' ", "bogus-declaration"],
	["<![CDATA[text]]>", "[CDATA[text]]", "bogus-declaration"],
	["<!foo--!>", "foo--!", "bogus-declaration"],
	["</42>", "42", "invalid-first-character-of-tag-name"],
	["</?bad>", "?bad", "invalid-first-character-of-tag-name"],
	["<//>", "/", "invalid-first-character-of-tag-name"],
];

it.each(bogusCases)(
	"ends bogus comments at the first greater-than sign: %s",
	(source, data, issue) => {
		const result = tokenize(`${source}<p>after</p>`);
		expect(result.tokens[0]).toEqual({ kind: "comment", data });
		expect(result.tokens.slice(1)).toMatchObject([
			{ kind: "start", name: "p" },
			{ kind: "text", data: "after" },
			{ kind: "end", name: "p" },
		]);
		expect(result.issues).toEqual([issue]);
	},
);

it.each(["<!foo", "<!foo--", "<!foo\0"])(
	"emits a bogus comment at EOF without an unterminated-comment error: %s",
	(source) => {
		expect(tokenize(source)).toEqual({
			tokens: [{ kind: "comment", data: source.slice(2).replace(/\0/g, "�") }],
			issues: [
				"bogus-declaration",
				...(source.includes("\0") ? ["unexpected-null-character"] : []),
			],
		});
	},
);

it.each(cases)(
	"recovers comment data and following markup: %s",
	(source, data, issues) => {
		const result = tokenize(`${source}<p>after</p>`);
		expect(result.tokens[0]).toEqual({ kind: "comment", data });
		expect(result.tokens.slice(1)).toMatchObject([
			{ kind: "start", name: "p" },
			{ kind: "text", data: "after" },
			{ kind: "end", name: "p" },
		]);
		expect(result.issues).toEqual(issues);
	},
);

it.each([
	...cases,
	...bogusCases.map(([source, data, issue]): [string, string, string[]] => [
		source,
		data,
		[issue],
	]),
])(
	"preserves output and issue order across every input split: %s",
	(comment, data, expectedIssues) => {
		const source = `${comment}<p>after</p>`;
		for (let split = 1; split < source.length; split++) {
			const issues: string[] = [];
			const tokenizer = new HtmlTokenizer(source, (issue) =>
				issues.push(issue),
			);
			const tokens: HtmlToken[] = [];
			const drain = () => {
				for (let token = tokenizer.next(); token; token = tokenizer.next())
					tokens.push(token);
			};
			tokenizer.setBoundary(split);
			drain();
			tokenizer.setBoundary(undefined);
			drain();
			expect(tokens[0], `split ${split}`).toEqual({ kind: "comment", data });
			expect(
				tokens
					.filter((token) => token.kind === "text")
					.map((token) => token.data)
					.join(""),
			).toBe("after");
			expect(issues, `split ${split}`).toEqual(expectedIssues);
			expect(tokenizer.paused).toBe(false);
		}
	},
);

it("buffers diagnostics while a comment remains incomplete across repeated insertions", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("", (issue) => issues.push(issue));
	const chunks = ["<!--", "one<!--", "two\0", "--!", ">"];
	let length = 0;
	for (const chunk of chunks) {
		tokenizer.insert(chunk, length);
		length += chunk.length;
		tokenizer.setBoundary(length);
		const token = tokenizer.next();
		if (chunk !== ">") {
			expect(token).toBeUndefined();
			expect(issues).toEqual([]);
		} else {
			expect(token).toEqual({ kind: "comment", data: "one<!--two�" });
			expect(issues).toEqual([
				"nested-comment",
				"unexpected-null-character",
				"incorrectly-closed-comment",
			]);
		}
	}
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toBeUndefined();
});

it("keeps incomplete trailing delimiter bytes pending until actual EOF", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("<!--text--!", (issue) =>
		issues.push(issue),
	);
	tokenizer.setBoundary(11);
	expect(tokenizer.next()).toBeUndefined();
	expect(issues).toEqual([]);
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual({ kind: "comment", data: "text" });
	expect(issues).toEqual(["unterminated-comment"]);
	expect(tokenizer.next()).toBeUndefined();
});

it.each(["<!--unfinished", "<!unfinished", "</42 unfinished"])(
	"charges rescanned incomplete comment input to the parser work budget: %s",
	(source) => {
		const tokenizer = new HtmlTokenizer(source, () => {
			throw new Error("Premature diagnostic");
		});
		tokenizer.setBoundary(source.length);
		for (let attempt = 1; attempt <= 3; attempt++) {
			expect(tokenizer.next()).toBeUndefined();
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.workUnits).toBe(source.length * attempt);
		}
	},
);

it("scans a long comment without per-character output fragments", () => {
	const data = "<&!text😀".repeat(25_000);
	const source = `<!--${data}-->`;
	const tokenizer = new HtmlTokenizer(source, () => {
		throw new Error("Unexpected comment issue");
	});
	expect(tokenizer.next()).toEqual({ kind: "comment", data });
	expect(tokenizer.workUnits).toBe(source.length);
	expect(tokenizer.next()).toBeUndefined();
	expect(() =>
		parseHtmlDocument(source, "https://fixture.invalid/", {
			limits: { maxTextCodeUnits: source.length - 1 },
		}),
	).toThrow("source text limit");
});

it("does not apply comment recovery to script and style raw text", () => {
	const tree = parseHtmlDocument(
		"<script><!-->code</script><style><!-->css</style><p>after</p>",
		"https://fixture.invalid/",
	);
	try {
		const queries = new DocumentQueries(tree);
		expect(tree.textContent(queries.querySelector("script") as number)).toBe(
			"<!-->code",
		);
		expect(tree.textContent(queries.querySelector("style") as number)).toBe(
			"<!-->css",
		);
		expect(tree.textContent(queries.querySelector("p") as number)).toBe(
			"after",
		);
	} finally {
		tree.close();
	}
});

it.each([
	["<!--", ""],
	["<!---", ""],
	["<!----", ""],
	["<!--text", "text"],
	["<!--text-", "text"],
	["<!--text--", "text"],
	["<!--text--!", "text"],
	["<!--text<", "text<"],
	["<!--text<!", "text<!"],
	["<!--text<!-", "text<!"],
	["<!--text<!--", "text<!"],
	["<!--text--!-", "text--!"],
])("drops pending delimiters at actual EOF: %s", (source, data) => {
	expect(tokenize(source)).toEqual({
		tokens: [{ kind: "comment", data }],
		issues: ["unterminated-comment"],
	});
});

it.each(["<!-->", "<!--->", "<!--hidden--!>"])(
	"does not swallow visible document content after %s",
	(source) => {
		const tree = parseHtmlDocument(
			`${source}<main><h1>Visible</h1></main>`,
			"https://fixture.invalid/",
		);
		try {
			const heading = new DocumentQueries(tree).querySelector("h1");
			expect(heading).not.toBeNull();
			expect(tree.textContent(heading as number)).toBe("Visible");
		} finally {
			tree.close();
		}
	},
);

it("uses comment recovery for fragments and dynamic innerHTML without parsing commented markup", () => {
	const source = "<!--><p>visible</p><!--<img src=hidden>--!>";
	const { tree, fragment } = parseHtmlFragment(
		source,
		"https://fixture.invalid/",
		{ tagName: "main" },
	);
	try {
		const queries = new DocumentQueries(tree);
		expect(tree.textContent(fragment)).toBe("visible");
		expect(queries.querySelector("img", fragment)).toBeNull();
		const main = tree.createElement("main");
		setInnerHtml(tree, main, source);
		expect(tree.textContent(main)).toBe("visible");
		expect(queries.querySelector("img", main)).toBeNull();
	} finally {
		tree.close();
	}
});

it("recovers a parser-written empty comment before following source", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<script>writer</script><h1>after</h1>",
		"https://fixture.invalid/",
		{},
		{
			start() {},
			async script(_tree, _id, context) {
				context.write("<!-->");
			},
			async finish() {},
		},
	);
	try {
		const heading = new DocumentQueries(tree).querySelector("h1");
		expect(heading).not.toBeNull();
		expect(tree.textContent(heading as number)).toBe("after");
	} finally {
		tree.close();
	}
});
