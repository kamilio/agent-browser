import { expect, it } from "vitest";
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
const asciiPunctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

it.each(Array.from(asciiPunctuation))(
	"retains the literal backslash before ASCII punctuation %j",
	(punctuation) => {
		const label = `Before\\${punctuation}After`;
		expect(discover(`[${label}](/target)`).entries).toEqual([
			{
				url: "https://example.test/target",
				label,
				labelTruncated: false,
				startLine: 1,
				column: 1,
			},
		]);
	},
);

it.each([
	"Near\\-Lossless \\(small\\) \\& fast\\!",
	"\\[literal\\] and \\`ticks\\`",
	"\\!\\[image\\]\\(\\/image\\)",
	"\\<span\\>literal\\<\\/span\\>",
	"\\<!-- literal comment --\\>",
	"\\<script\\>literal\\<\\/script\\>",
	"\\&amp; *literal* &amp;",
	Array.from(asciiPunctuation, (punctuation) => `\\${punctuation}`).join(""),
])("combines escapes without rendering the source label %j", (label) => {
	const source = `[${label}](</target>) [Same](/same)\n[Next](/next)`;
	const result = discover(source);
	expect(result.entries.map((entry) => entry.label)).toEqual([
		label,
		"Same",
		"Next",
	]);
	expect(result.scannedCodeUnits).toBe(source.length);
	expect(result.truncated).toBe(false);
});

it("recognizes the one-line producer headline with one actual backslash", () => {
	const label =
		"Bonsai 2 27B: Near\\-Lossless Compression in a 9x Smaller Footprint";
	const url = "https://prismml.com/news/bonsai-2-27b";
	const source = `[${label}](<${url}>)`;
	expect(label.split("\\")).toHaveLength(2);
	expect(source).not.toMatch(/[\r\n]/);
	expect(discover(source, "PRISMML.COM")).toEqual({
		kind: "markdown-source-links-v1",
		partial: true,
		query: "PRISMML.COM",
		sourceCodeUnits: source.length,
		scannedCodeUnits: source.length,
		truncated: false,
		entries: [{ url, label, labelTruncated: false, startLine: 1, column: 1 }],
	});
});

it.each([1, 2, 3, 4, 5, 6])(
	"pairs %i backslashes before closing brackets without losing source",
	(count) => {
		const slashes = "\\".repeat(count);
		const label = `Tail${slashes}${count % 2 ? "]" : ""}`;
		const source = `[${label}](/target) [Same](/same)\n[Next](/next)`;
		expect(discover(source).entries.map((entry) => entry.label)).toEqual([
			label,
			"Same",
			"Next",
		]);
		const malformed = `[Tail${slashes}${count % 2 ? "]" : "]]"}(/target)`;
		expect(
			discover(`${malformed}\n[Next](/next)`).entries.map(
				(entry) => entry.label,
			),
		).toEqual(["Next"]);
	},
);

it.each([1, 3, 5])(
	"keeps a backtick after %i backslashes out of inline-code state",
	(count) => {
		const label = `Tick${"\\".repeat(count)}\`tail`;
		const source = `[${label}](/target) \`[Hidden](/hidden)\` [Same](/same)\n[Next](/next)`;
		expect(discover(source).entries.map((entry) => entry.label)).toEqual([
			label,
			"Same",
			"Next",
		]);
	},
);

it.each([2, 4, 6])(
	"keeps a backtick after %i backslashes structural",
	(count) => {
		const prefix = `[Tick${"\\".repeat(count)}\`code`;
		expect(
			discover(
				`${prefix}\`](/hidden) [Same](/same)\n[Next](/next)`,
			).entries.map((entry) => entry.label),
		).toEqual(["Same", "Next"]);
		expect(
			discover(
				`${prefix}](/hidden)\n[Hidden](/hidden)\n\` [Live](/live)`,
			).entries.map((entry) => entry.label),
		).toEqual(["Live"]);
	},
);

it.each(["\n", "\r", "\r\n"])(
	"retains physical source positions and UTF-16 columns with %j",
	(newline) => {
		const label = "é😀\\[bracket\\]\\`";
		const first = `😀 [${label}](/one)`;
		const second = "[Two\\-two](/two)";
		const source = `intro${newline}${first} ${second}${newline}   [Three\\!](/three)`;
		const result = discover(source);
		expect(result.entries).toEqual([
			{
				url: "https://example.test/one",
				label,
				labelTruncated: false,
				startLine: 2,
				column: 4,
			},
			{
				url: "https://example.test/two",
				label: "Two\\-two",
				labelTruncated: false,
				startLine: 2,
				column: first.length + 2,
			},
			{
				url: "https://example.test/three",
				label: "Three\\!",
				labelTruncated: false,
				startLine: 3,
				column: 4,
			},
		]);
		expect(result.sourceCodeUnits).toBe(source.length);
		expect(result.scannedCodeUnits).toBe(source.length);
		expect(result.truncated).toBe(false);
	},
);

it.each([
	["A\\-😀Z", 1, "A", true],
	["A\\-😀Z", 2, "A\\", true],
	["A\\-😀Z", 3, "A\\-", true],
	["A\\-😀Z", 4, "A\\-", true],
	["A\\-😀Z", 5, "A\\-😀", true],
	["A\\-😀Z", 6, "A\\-😀Z", false],
	["\\-\u0000😀", 7, "\\-\\u{0}", true],
	["\\-\u0000😀", 8, "\\-\\u{0}", true],
	["\\-\u0000😀", 9, "\\-\\u{0}😀", false],
] as const)(
	"caps literal-source labels without splitting Unicode: %j / %i",
	(label, cap, expected, labelTruncated) => {
		const result = discover(`[${label}](/target)`, "example.test", {
			maxLabelCodeUnits: cap,
		});
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			label: expected,
			labelTruncated,
		});
		expect(result.entries[0].label.length).toBeLessThanOrEqual(cap);
		expect(result.truncated).toBe(false);
	},
);

it("counts retained backslashes against the default label cap", () => {
	const exact = "\\-".repeat(markdownSourceLinkLimits.maxLabelCodeUnits / 2);
	const result = discover(`[${exact}](/exact) [${exact}Z](/long)`);
	expect(
		result.entries.map(({ label, labelTruncated }) => ({
			label,
			labelTruncated,
		})),
	).toEqual([
		{ label: exact, labelTruncated: false },
		{ label: exact, labelTruncated: true },
	]);
	expect(result.truncated).toBe(false);
});

it.each(["a", "Z", "0", " ", "\t", "é", "—", "😀", "\u007f"])(
	"does not extend escape scanning to non-ASCII-punctuation %j",
	(character) => {
		const source = `[Bad\\${character}label](/bad)\n[Live\\-label](/live)`;
		expect(discover(source).entries.map((entry) => entry.label)).toEqual([
			"Live\\-label",
		]);
	},
);

it.each([
	"/a\\-b",
	"/a\\(b\\)",
	"</a\\-b>",
	"https:\\\\example.test/path",
	"/a&amp;b",
	"/a&#41;b",
	"/a&#x29;b",
	"/a\u0000b",
	"/a\u200bb",
	"/a\tb",
	"<https://example.test/two words>",
	"https://user@example.test/",
	"https://user:secret@example.test/",
	"//user:secret@example.test/",
	"javascript:alert(1)",
	"data:text/plain,example.test",
	"file:///example.test",
	"ftp://example.test/",
])("does not relax destination rejection for escaped labels: %j", (url) => {
	const source = `[Near\\-lossless](${url})\n[Live](/live)`;
	expect(discover(source).entries.map((entry) => entry.label)).toEqual([
		"Live",
	]);
});

it("keeps encoded destinations literal and matches URLs rather than labels", () => {
	const source =
		"[Needle\\-label](/other) [Other\\-label](/NEEDLE%2Dvalue?x=%5Braw%5D)";
	expect(discover(source, "needle%2d").entries).toEqual([
		{
			url: "https://example.test/NEEDLE%2Dvalue?x=%5Braw%5D",
			label: "Other\\-label",
			labelTruncated: false,
			startLine: 1,
			column: source.indexOf("[Other") + 1,
		},
	]);
	expect(discover(source, "needle-value").entries).toEqual([]);
	expect(discover(source, "needle\\-label").entries).toEqual([]);
});

it.each([
	"![Image\\-label](/image)",
	"[Outer\\-label [Nested](/inner)](/outer)",
	"[Outer\\-label ![Image](/image)](/outer)",
	"[Code\\-label `code`](/hidden)",
	"[HTML\\-label <span>text</span>](/hidden)",
	"[Reference\\-label][id]\n[id]: /hidden",
	"[Reference\\-label][]\n[Reference\\-label]: /hidden",
	"[Reference\\-label]\n[Reference\\-label]: /hidden",
	'[Title\\-label](/hidden "title")',
	"[Title\\-label](</hidden> 'title')",
	"[Spaced\\-label] (/hidden)",
	"[Spaced\\-label]( /hidden)",
	"[Spaced\\-label](/hidden )",
	"[Empty\\-label]()",
	"[Empty\\-label](<>)",
	"[Unclosed\\-label](/hidden",
	"[Unclosed\\](/hidden)",
	"[Unbalanced\\-label](/a(b)",
	"\\[Escaped\\-opener](/hidden)",
	"[Split\\-label]\n(/hidden)",
	"[Split\\\nlabel](/hidden)",
	"[Split\\-label](/hid\nden)",
])("keeps unsupported syntax unsupported: %j", (source) => {
	expect(discover(source).entries).toEqual([]);
});

it.each([
	"```md\n[Hidden\\-label](/hidden)\n```",
	"    [Hidden\\-label](/hidden)",
	"`[Hidden\\-label](/hidden)`",
	"<!-- [Hidden\\-label](/hidden) -->",
	"<script>[Hidden\\-label](/hidden)</script>",
	"---\n[Hidden\\-label](/hidden)\n---",
])("does not expose escaped labels inside opaque source: %j", (hidden) => {
	expect(
		discover(`${hidden}\n[Live\\-label](/live)`).entries.map(
			(entry) => entry.label,
		),
	).toEqual(["Live\\-label"]);
});

it("does not count escaped opening brackets toward the nesting cap", () => {
	const label = "\\[".repeat(markdownSourceLinkLimits.maxNesting + 1);
	expect(discover(`[${label}](/target)`)).toMatchObject({
		truncated: false,
		entries: [{ label, labelTruncated: false }],
	});
	expect(
		discover(`[\\-${"[".repeat(markdownSourceLinkLimits.maxNesting)}`),
	).toMatchObject({ truncated: true, entries: [] });
	const depth = markdownSourceLinkLimits.maxNesting;
	expect(
		discover(`[\\-](/${"(".repeat(depth)}path${")".repeat(depth)})`),
	).toMatchObject({ truncated: true, entries: [] });
});

it("applies entry limits only to matching escaped-label candidates", () => {
	const source =
		"[Skip\\-label](/other) [One\\-label](/match) [Two\\-label](/match)";
	const result = discover(source, "/match", { maxEntries: 1 });
	expect(result.entries.map((entry) => entry.label)).toEqual(["One\\-label"]);
	expect(result.truncated).toBe(true);
	const defaultSource = "[Match\\-label](/match)\n".repeat(
		markdownSourceLinkLimits.maxEntries + 1,
	);
	const defaultResult = discover(defaultSource);
	expect(defaultResult.entries).toHaveLength(
		markdownSourceLinkLimits.maxEntries,
	);
	expect(defaultResult.truncated).toBe(true);
});

it("retains URL caps and later candidates after an escaped-label overflow", () => {
	const source = `[Long\\-label](/${"a".repeat(4096)}) [Live\\-label](/live)`;
	expect(discover(source).entries.map((entry) => entry.label)).toEqual([
		"Live\\-label",
	]);
	const url = "https://example.test/";
	expect(
		discover(`[Exact\\-label](${url})`, "example.test", {
			maxUrlCodeUnits: url.length,
		}).entries,
	).toHaveLength(1);
	expect(
		discover(`[Long\\-label](${url})`, "example.test", {
			maxUrlCodeUnits: url.length - 1,
		}).entries,
	).toEqual([]);
});

it("retains the source-size cap for escape-heavy input", () => {
	const source = "\\-".repeat(markdownSourceLinkLimits.maxSourceCodeUnits / 2);
	expect(() => discover(`${source}x`)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("stops escape-heavy unmatched candidates within the work budget", () => {
	const source = "[No\\-match](https://example.test/no)\n".repeat(50_000);
	expect(source.length).toBeLessThan(
		markdownSourceLinkLimits.maxSourceCodeUnits,
	);
	let checkpoints = 0;
	const result = discover(source, "missing", {
		checkpoint: () => {
			checkpoints++;
		},
	});
	expect(result.entries).toEqual([]);
	expect(result.truncated).toBe(true);
	expect(result.sourceCodeUnits).toBe(source.length);
	expect(result.scannedCodeUnits).toBeGreaterThan(0);
	expect(result.scannedCodeUnits).toBeLessThan(source.length);
	expect(checkpoints).toBeGreaterThan(2);
	expect(checkpoints).toBeLessThanOrEqual(
		Math.floor(markdownSourceLinkLimits.maxWorkCodeUnits / 1024) + 2,
	);
});

it.each(["\\]", "\\[", "\\`", "\\\\"])(
	"propagates cancellation while scanning repeated label escapes %j",
	(escapedSequence) => {
		const source = `[${escapedSequence.repeat(6000)}](/target)`;
		const cancellation = new Error("cancel escaped-label scan");
		const stopAt = Math.ceil(source.length / 1024) + 3;
		let checkpoints = 0;
		expect(() =>
			discover(source, "example.test", {
				checkpoint: () => {
					if (++checkpoints === stopAt) throw cancellation;
				},
			}),
		).toThrow(cancellation);
		expect(checkpoints).toBe(stopAt);
	},
);

it.each([1, 2])(
	"does not swallow cancellation at escaped-label checkpoint %i",
	(stopAt) => {
		const cancellation = new Error("cancel escaped-label discovery");
		let checkpoints = 0;
		expect(() =>
			discover("[Small\\-label](/target)", "example.test", {
				checkpoint: () => {
					if (++checkpoints === stopAt) throw cancellation;
				},
			}),
		).toThrow(cancellation);
		expect(checkpoints).toBe(stopAt);
	},
);
