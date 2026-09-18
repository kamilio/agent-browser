import { expect, it, vi } from "vitest";
import {
	discoverMarkdownSourceLinks,
	markdownSourceLinkLimits,
} from "./markdown-source-links.js";

const baseUrl = "https://example.test/docs/page.md";
const discover = (
	source: string,
	query = "example.test",
	options?: Parameters<typeof discoverMarkdownSourceLinks>[3],
) => discoverMarkdownSourceLinks(source, baseUrl, query, options);

it.each([
	[
		"[Guide](https://example.test/guide)",
		"Guide",
		"https://example.test/guide",
	],
	["[Guide](/guide)", "Guide", "https://example.test/guide"],
	["[Guide](../guide)", "Guide", "https://example.test/guide"],
	["[Guide](guide)", "Guide", "https://example.test/docs/guide"],
	["[Guide](//example.test/guide)", "Guide", "https://example.test/guide"],
	[
		"[Query](?page=2&mode=source)",
		"Query",
		"https://example.test/docs/page.md?page=2&mode=source",
	],
	["[Section](#intro)", "Section", "https://example.test/docs/page.md#intro"],
	["[Balanced](/a(b(c)d)e)", "Balanced", "https://example.test/a(b(c)d)e"],
	[
		"[Angle](<https://example.test/a(b)>)",
		"Angle",
		"https://example.test/a(b)",
	],
	["[Relative](<../guide>)", "Relative", "https://example.test/guide"],
	["[Root](</guide>)", "Root", "https://example.test/guide"],
	["[Word](<script>)", "Word", "https://example.test/docs/script"],
	["<http://example.test/>", "http://example.test/", "http://example.test/"],
	[
		"<HTTPS://EXAMPLE.TEST/Guide>",
		"HTTPS://EXAMPLE.TEST/Guide",
		"https://example.test/Guide",
	],
	[
		"[*literal* &amp; label](/guide)",
		"*literal* &amp; label",
		"https://example.test/guide",
	],
	["[](/guide)", "", "https://example.test/guide"],
	["[Escaped\\]](/target)", "Escaped\\]", "https://example.test/target"],
	["[Unicode 😀](/é)", "Unicode 😀", "https://example.test/%C3%A9"],
	["[Encoded](/a%20b)", "Encoded", "https://example.test/a%20b"],
])("recognizes literal single-line source %j", (source, label, url) => {
	expect(discover(source).entries).toEqual([
		{ url, label, labelTruncated: false, startLine: 1, column: 1 },
	]);
});

it("exposes source provenance only, without DOM references or fetches", () => {
	const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
		throw new Error("Source discovery must not fetch");
	});
	try {
		const source = "Documentation: [PyTorch](https://docs.pytorch.org/docs)";
		const result = discoverMarkdownSourceLinks(
			source,
			"https://pytorch.org/",
			"PYTORCH",
		);
		expect(result).toEqual({
			kind: "markdown-source-links-v1",
			partial: true,
			query: "PYTORCH",
			sourceCodeUnits: source.length,
			scannedCodeUnits: source.length,
			truncated: false,
			entries: [
				{
					url: "https://docs.pytorch.org/docs",
					label: "PyTorch",
					labelTruncated: false,
					startLine: 1,
					column: 16,
				},
			],
		});
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		fetch.mockRestore();
	}
});

it.each(["\n", "\r", "\r\n"])(
	"tracks physical lines and UTF-16 columns with %j",
	(newline) => {
		const source = `plain${newline}😀 [One](/one) <https://example.test/two>${newline}   [Three](/three)${newline}`;
		const result = discover(source);
		expect(
			result.entries.map(({ startLine, column }) => [startLine, column]),
		).toEqual([
			[2, 4],
			[2, 16],
			[3, 4],
		]);
		expect(result.scannedCodeUnits).toBe(source.length);
	},
);

it("matches only resolved URLs by a case-insensitive literal query", () => {
	const source = "[needle](/other) [Different](/NEEDLE?x=a.b) [Again](/needle)";
	expect(discover(source, "needle").entries.map(({ label }) => label)).toEqual([
		"Different",
		"Again",
	]);
	expect(discover(source, "a.b").entries).toHaveLength(1);
	expect(discover(source, ".*").entries).toEqual([]);
	expect(discover("[Same](../guide) [Same](../guide)").entries).toHaveLength(2);
	expect(
		discover("[Base](relative)", "example.test/docs").entries,
	).toHaveLength(1);
});

it.each([
	"![Image](/image)",
	"[![Image](/image)](/target)",
	"[Outer [Nested](/inner)](/outer)",
	"[Reference][id]\n[id]: /target",
	"[Reference][]\n[Reference]: /target",
	"[Shortcut]\n[Shortcut]: /target",
	"https://example.test/bare",
	"<person@example.test>",
	'[Title](/target "title")',
	"[Title](</target> 'title')",
	"[Title](/target (title))",
	"[Spaced]( /target)",
	"[Spaced](/target )",
	"[Spaced](</two words>)",
	"[Spaced] (/target)",
	"[Empty]()",
	"[Empty](<>)",
	"[Multiline]\n(/target)",
	"[Multiline](/tar\nget)",
	"[Unclosed](/target",
	"[Unbalanced](/a(b)",
	"[Unclosed](</target)",
	"[Escaped](/a\\(b\\))",
	"[Escaped](https:\\\\example.test/path)",
	"\\[Escaped](/target)",
	"[Entity](/a&amp;b)",
	"[Entity](/a&#41;b)",
	"[Entity](/a&#x29;b)",
	"[Controls](/a\u0000b)",
	"[Controls](/a\u200bb)",
	"[Controls](/a\tb)",
	"[Bad](http://[)",
	"[User](https://user@example.test/)",
	"[Password](https://user:secret@example.test/)",
	"[Relative credentials](//user:secret@example.test/)",
	"[Script](javascript:alert(1))",
	"[Data](data:text/plain,example.test)",
	"[File](file:///example.test)",
	"[FTP](ftp://example.test/)",
])("omits unsupported, ambiguous or unsafe source %j", (source) => {
	expect(discover(source).entries).toEqual([]);
});

it.each([
	"```md\n[Hidden](/hidden)\n```\n[Live](/live)",
	"~~~md\n[Hidden](/hidden)\n~~~\n[Live](/live)",
	"````\n[Hidden](/hidden)\n```\n[Hidden](/hidden)\n````\n[Live](/live)",
	"~~~\n[Hidden](/hidden)\n~~~info\n[Hidden](/hidden)\n~~~~\n[Live](/live)",
	"   ```\n[Hidden](/hidden)\n   ```\n[Live](/live)",
	"    [Hidden](/hidden)\n[Live](/live)",
	" \t[Hidden](/hidden)\n[Live](/live)",
	"`[Hidden](/hidden)` [Live](/live)",
	"`` [Hidden](/hidden) ` still hidden `` [Live](/live)",
	"`[Hidden](/hidden)\n[Hidden](/hidden)` [Live](/live)",
	"---\n[Hidden](/hidden)\n---\n[Live](/live)",
	"\uFEFF---\n[Hidden](/hidden)\n...\n[Live](/live)",
	"+++\n[Hidden](/hidden)\n+++\n[Live](/live)",
	"<!-- [Hidden](/hidden) -->\n[Live](/live)",
	"text <!--\n[Hidden](/hidden)\n-->\n[Live](/live)",
	"<![CDATA[\n[Hidden](/hidden)\n]]>\n[Live](/live)",
	"<?source\n[Hidden](/hidden)\n?>\n[Live](/live)",
	"<div>\n[Hidden](/hidden)\n</div>\n\n[Live](/live)",
	"<custom-element>\n[Hidden](/hidden)\n\t\n[Live](/live)",
	"<span title='[Hidden](/hidden)'>\n\n[Live](/live)",
])("skips opaque source regions %j", (source) => {
	expect(discover(source).entries.map(({ label }) => label)).toEqual(["Live"]);
});

it.each([
	"<https://a/`\n[x](/x)\n`\n[Live](/live)",
	"<https://a/``\n[x](/x)\n``\n[Live](/live)",
	"<https://a/```\n[x](/x)\n```\n[Live](/live)",
	"<https://a/` [x](/x) ` [Live](/live)",
	"<https://a/`\n<!--\n[x](/x)\n`\n[Live](/live)",
	"<https://a/`\n[x](/x)\n`>\n[Live](/live)",
])("retains code-span state inside failed autolinks: %j", (source) => {
	expect(discover(source).entries.map(({ label }) => label)).toEqual(["Live"]);
});

it.each(["script", "STYLE", "pre", "textarea"])(
	"keeps %s blocks opaque across blank lines",
	(tag) => {
		for (const hidden of ["[Hidden](/hidden)", "\n\n[Hidden](/hidden)\n"]) {
			const source = `<${tag}>${hidden}</${tag} >\n[Live](/live)`;
			expect(discover(source).entries.map(({ label }) => label)).toEqual([
				"Live",
			]);
		}
	},
);

it.each([
	"```\n[Hidden](/hidden)",
	"`unclosed\n[Hidden](/hidden)",
	"<!-- unclosed\n[Hidden](/hidden)",
	"<script>\n\n[Hidden](/hidden)",
	"---\n[Hidden](/hidden)",
	"[unfinished [Nested](/hidden)",
	"[<!--\n[Hidden](/hidden)\n-->",
	"[Label](<!--\n[Hidden](/hidden)\n-->",
	"[Label `code\n[Hidden](/hidden)\n`",
	"[Label](/`code\n[Hidden](/hidden)\n`",
])("does not recover invented candidates from unclosed source %j", (source) => {
	expect(discover(source).entries).toEqual([]);
});

it("documents conservative tail omissions rather than rendering Markdown", () => {
	for (const source of [
		"[reference] [Omitted](/tail)",
		"<!-- closed --> [Omitted](/tail)",
		"<span>inline</span> [Omitted](/tail)",
		"[Code `label`](/omitted)",
		"```invalid`info\n[Omitted](/tail)",
	])
		expect(discover(source).entries).toEqual([]);
});

it.each([
	["AB😀CD", 3, "AB", true],
	["AB😀CD", 4, "AB😀", true],
	["AB😀CD", 6, "AB😀CD", false],
	["😀", 1, "", true],
	["A\u0000B", 8, "A\\u{0}B", false],
	["A\u202eB", 9, "A\\u{202e}", true],
	["\u202e", 7, "", true],
	["A\tB", 3, "A\tB", false],
] as const)(
	"bounds escaped labels without splitting Unicode: %j / %i",
	(label, cap, expected, truncated) => {
		const result = discover(`[${label}](/target)`, "example.test", {
			maxLabelCodeUnits: cap,
		});
		expect(result.entries[0]).toMatchObject({
			label: expected,
			labelTruncated: truncated,
		});
		expect(result.entries[0].label.length).toBeLessThanOrEqual(cap);
		expect(result.truncated).toBe(false);
	},
);

it("enforces default and caller entry limits only on matching candidates", () => {
	const source = "[Match](/match)\n".repeat(33);
	expect(discover(source).entries).toHaveLength(32);
	expect(discover(source).truncated).toBe(true);
	expect(
		discover("[One](/one)", "example.test", { maxEntries: 1 }).truncated,
	).toBe(false);
	const result = discover(
		"[One](/one)\n[Other](/other)\n[One](/one)\nTail",
		"/one",
		{ maxEntries: 1 },
	);
	expect(result.entries).toHaveLength(1);
	expect(result.truncated).toBe(true);
	expect(result.scannedCodeUnits).toBeLessThan(result.sourceCodeUnits);
	expect(discover(source, "missing", { maxEntries: 1 }).truncated).toBe(false);
	expect(
		discover("[Match](/match)\n".repeat(256), "example.test", {
			maxEntries: 256,
		}).entries,
	).toHaveLength(256);
});

it("omits overlong raw and normalized URLs without publishing prefixes", () => {
	const exact = "https://example.test/";
	expect(
		discover(`[Exact](${exact})`, "example.test", {
			maxUrlCodeUnits: exact.length,
		}).entries,
	).toHaveLength(1);
	for (const destination of [
		exact,
		"/é",
		`/${"a".repeat(4096)}`,
		`https://example.test/${"a".repeat(4096)}`,
	]) {
		expect(
			discover(`[Long](${destination})`, "example.test", {
				maxUrlCodeUnits: exact.length - 1,
			}).entries,
		).toEqual([]);
	}
	expect(
		discover(`[Long](/${"a".repeat(4096)})\n[Live](/live)`).entries.map(
			({ label }) => label,
		),
	).toEqual(["Live"]);
});

it("bounds source size independently of syntax", () => {
	expect(markdownSourceLinkLimits).toEqual({
		maxSourceCodeUnits: 2_000_000,
		maxEntries: 32,
		maxLabelCodeUnits: 256,
		maxUrlCodeUnits: 4096,
		maxWorkCodeUnits: 8_000_000,
		maxNesting: 16,
	});
	const source = "x".repeat(markdownSourceLinkLimits.maxSourceCodeUnits);
	expect(discover(source)).toMatchObject({
		scannedCodeUnits: source.length,
		truncated: false,
		entries: [],
	});
	expect(() => discover(`${source}x`)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("stops at finite work and nesting budgets", () => {
	const source = "<https://example.test/no>\n".repeat(60_000);
	const result = discover(source, "missing");
	expect(result.entries).toEqual([]);
	expect(result.truncated).toBe(true);
	expect(result.scannedCodeUnits).toBeLessThan(source.length);
	for (const nested of [
		"[".repeat(17),
		`[Label](/${"(".repeat(16)}path${")".repeat(16)})`,
	]) {
		expect(discover(nested)).toMatchObject({ truncated: true, entries: [] });
	}
	const supported = `[Label](/${"(".repeat(15)}path${")".repeat(15)})`;
	expect(discover(supported).entries).toHaveLength(1);
});

it("bounds leading metadata and never scans its overflow as links", () => {
	for (const source of [
		`---\n${"metadata\n".repeat(128)}[Hidden](/hidden)`,
		`+++\n${"x".repeat(16_384)}\n+++\n[Hidden](/hidden)`,
	])
		expect(discover(source)).toMatchObject({ truncated: true, entries: [] });
});

it.each([
	"",
	"with space",
	"tab\t",
	"nul\0",
	"del\x7f",
	"x".repeat(257),
	null,
	42,
])("rejects invalid URL queries %j", (query) => {
	expect(() => discover("", query as string)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("accepts the exact query bound and empty source", () => {
	const query = "x".repeat(256);
	expect(discover(`[Exact](/${query})`, query).entries).toHaveLength(1);
	expect(discover("")).toMatchObject({
		sourceCodeUnits: 0,
		scannedCodeUnits: 0,
		truncated: false,
		entries: [],
	});
});

it.each(["maxEntries", "maxLabelCodeUnits", "maxUrlCodeUnits"] as const)(
	"validates %s",
	(name) => {
		const maximum = {
			maxEntries: 256,
			maxLabelCodeUnits: 1024,
			maxUrlCodeUnits: 4096,
		}[name];
		for (const value of [
			0,
			-1,
			maximum + 1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"2",
		]) {
			expect(() =>
				discover("", "example.test", { [name]: value }),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		}
		for (const value of [1, maximum])
			expect(discover("", "example.test", { [name]: value }).entries).toEqual(
				[],
			);
	},
);

it.each([null, [], 1, { checkpoint: true }])(
	"rejects malformed options %j",
	(options) => {
		expect(() =>
			discover("", "example.test", options as Parameters<typeof discover>[2]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([
	"not a URL",
	"javascript:void(0)",
	"https://user:secret@example.test/",
	"https://exam\nple.test/",
])("uses native URL validation for the document base %j", (base) => {
	expect(() =>
		discoverMarkdownSourceLinks("[Guide](/guide)", base, "guide"),
	).toThrow();
});

it("rejects non-string sources", () => {
	expect(() => discover(null as unknown as string)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each([
	"x".repeat(20_000),
	`[${"label".repeat(4000)}`,
	`<!--${"opaque".repeat(4000)}`,
	`\`\`\`\n${"code".repeat(4000)}`,
	`[Label](/${"url".repeat(8000)})`,
	`<script>${"raw".repeat(8000)}`,
])("propagates cancellation during hostile source scans", (source) => {
	const cancellation = new Error("cancelled");
	let checkpoints = 0;
	expect(() =>
		discover(source, "example.test", {
			checkpoint: () => {
				if (++checkpoints === 4) throw cancellation;
			},
		}),
	).toThrow(cancellation);
	expect(checkpoints).toBe(4);
});

it("never swallows cancellation near URL resolution or on completion", () => {
	const source = "[Guide](/guide)";
	const checkpoint = vi.fn();
	discover(source, "example.test", { checkpoint });
	expect(checkpoint.mock.calls.length).toBeGreaterThanOrEqual(2);
	for (const stopAt of [1, checkpoint.mock.calls.length]) {
		const cancellation = new Error("cancelled");
		let calls = 0;
		expect(() =>
			discover(source, "example.test", {
				checkpoint: () => {
					if (++calls === stopAt) throw cancellation;
				},
			}),
		).toThrow(cancellation);
	}
	const cancellation = new Error("cancelled during URL work");
	let calls = 0;
	expect(() =>
		discoverMarkdownSourceLinks(
			source,
			`${baseUrl}?${"x".repeat(4096)}`,
			"guide",
			{
				checkpoint: () => {
					if (++calls === 2) throw cancellation;
				},
			},
		),
	).toThrow(cancellation);
});

it.each([
	">     [Hidden](/hidden)\n[Live](/live)",
	"> >     [Hidden](/hidden)\n[Live](/live)",
	"> \t[Hidden](/hidden)\n[Live](/live)",
	"> ~~~\n> [Hidden](/hidden)\n> ~~~\n[Live](/live)",
	"> ```\n> [Hidden](/hidden)\n> ```\n[Live](/live)",
	"> ~~~~\n> ~~~\n> [Hidden](/hidden)\n> ~~~~\n[Live](/live)",
	"> > ~~~\n> > [Hidden](/hidden)\n> > ~~~\n[Live](/live)",
	"> - ~~~\n>   [Hidden](/hidden)\n>   ~~~\n[Live](/live)",
	"> - item\n>     ~~~\n>   [Hidden](/hidden)\n>   ~~~\n[Live](/live)",
	"-     [Hidden](/hidden)\n[Live](/live)",
	"1.     [Hidden](/hidden)\n[Live](/live)",
	"-     <https://example.test/hidden>\n[Live](/live)",
	"- ~~~\n  [Hidden](/hidden)\n  ~~~\n[Live](/live)",
	"- ```\n  [Hidden](/hidden)\n  ```\n[Live](/live)",
	"- - ~~~\n    [Hidden](/hidden)\n    ~~~\n[Live](/live)",
	"10. ~~~\n    [Hidden](/hidden)\n    ~~~\n[Live](/live)",
	"- item\n    ~~~\n  [Hidden](/hidden)\n  ~~~\n[Live](/live)",
	"- item\n\n    ~~~\n\n  [Hidden](/hidden)\n  ~~~\n[Live](/live)",
	"- item\n  - ~~~\n    [Hidden](/hidden)\n    ~~~\n[Live](/live)",
	"- item\n      [Hidden](/hidden)\n[Live](/live)",
	"- item\n  -     [Hidden](/hidden)\n[Live](/live)",
	"~~~\n> ~~~\n[Hidden](/hidden)\n~~~\n[Live](/live)",
	"~~~\n- ~~~\n[Hidden](/hidden)\n~~~\n[Live](/live)",
])(
	"omits container code and recovers after its closing boundary: %j",
	(source) => {
		const result = discover(source);
		expect(result.entries.map(({ label }) => label)).toEqual(["Live"]);
		expect(result.truncated).toBe(false);
		expect(result.scannedCodeUnits).toBe(source.length);
	},
);

it.each([
	"- [Live](/live)",
	"+ [Live](/live)",
	"* [Live](/live)",
	"1. [Live](/live)",
	"10) [Live](/live)",
	"123456789. [Live](/live)",
	"- - [Live](/live)",
	"-    [Live](/live)",
	"> [Live](/live)",
	"> - [Live](/live)",
])(
	"preserves ordinary space-delimited container links and original columns: %j",
	(source) => {
		expect(discover(source).entries).toEqual([
			{
				url: "https://example.test/live",
				label: "Live",
				labelTruncated: false,
				startLine: 1,
				column: source.indexOf("[Live]") + 1,
			},
		]);
	},
);

it("preserves ordinary sibling list links", () => {
	const source = "- [First](/first)\n- [Second](/second)\n[Last](/last)";
	expect(discover(source).entries.map(({ label }) => label)).toEqual([
		"First",
		"Second",
		"Last",
	]);
});

it.each([
	"- > ~~~\n  > [Omitted](/omitted)\n  > ~~~\n\n[Omitted](/tail)",
	"-\t[Omitted](/omitted)\n\n[Omitted](/tail)",
	"> ~~~\n[Omitted](/omitted)\n~~~\n\n[Omitted](/tail)",
	"- ~~~\n[Omitted](/omitted)\n~~~\n\n[Omitted](/tail)",
])(
	"suppresses unsupported mixed/tab containers and unclosed container fences to EOF: %j",
	(source) => {
		expect(discover(source).entries).toEqual([]);
	},
);

it("conservatively omits indentation-based list continuations without hiding dedented links", () => {
	const source =
		"- item\n  [Omitted](/continuation)\n\n  [Omitted](/continuation)\n[Live](/live)";
	expect(discover(source).entries.map(({ label }) => label)).toEqual(["Live"]);
});

it.each([
	"<https://example.test/<!--\n[Hidden](/hidden)\n-->\n[Live](/live)",
	"<https://example.test/<!--\n\n[Hidden](/hidden)\n-->\n[Live](/live)",
	"<https://example.test/<!-- --> [Hidden](/hidden)\n[Live](/live)",
	"<https://example.test/<![CDATA[\n[Hidden](/hidden)\n]]>\n[Live](/live)",
	"<https://example.test/<?source\n[Hidden](/hidden)\n?>\n[Live](/live)",
	"<https://example.test/<div>\n[Hidden](/hidden)\n</div>\n\n[Live](/live)",
	"<https://example.test/<custom-element>\n[Hidden](/hidden)\n\n[Live](/live)",
])("retains opaque openers swallowed by malformed autolinks: %j", (source) => {
	expect(discover(source).entries.map(({ label }) => label)).toEqual(["Live"]);
});

it.each(["script", "STYLE", "pre", "textarea"])(
	"retains malformed autolink %s blocks across blank lines",
	(tag) => {
		const source = `<https://example.test/<${tag}>\n\n[Hidden](/hidden)\n</${tag}>\n[Live](/live)`;
		expect(discover(source).entries.map(({ label }) => label)).toEqual([
			"Live",
		]);
	},
);

it.each([">".repeat(17), "- ".repeat(17)])(
	"bounds container-prefix nesting: %j",
	(prefix) => {
		expect(discover(`${prefix}[Hidden](/hidden)`)).toMatchObject({
			truncated: true,
			entries: [],
		});
	},
);

it.each([
	`> ~~~\n${"> [Hidden](/hidden)\n".repeat(2000)}`,
	`- item\n${"  [Hidden](/hidden)\n".repeat(2000)}`,
	`-\titem\n${"[Hidden](/hidden)\n".repeat(2000)}`,
	`<https://example.test/<!--\n${"[Hidden](/hidden)\n".repeat(2000)}`,
])("keeps cancellation active in suppressed regions", (source) => {
	const cancellation = new Error("cancelled in opaque source");
	let calls = 0;
	expect(() =>
		discover(source, "example.test", {
			checkpoint: () => {
				if (++calls === 4) throw cancellation;
			},
		}),
	).toThrow(cancellation);
	expect(calls).toBe(4);
});
