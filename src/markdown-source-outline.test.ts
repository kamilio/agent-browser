import { expect, it } from "vitest";
import {
	markdownSourceOutlineLimits,
	outlineMarkdownSource,
} from "./markdown-source-outline.js";

it("records nested source sections through the next peer or ancestor", () => {
	const source =
		"# Top\nintro\n## Child\nbody\n### Sub\nx\n## Next\nend\n# Other\nlast\n";
	const result = outlineMarkdownSource(source);
	expect(result).toMatchObject({
		kind: "markdown-source-outline-v1",
		partial: true,
		sourceCodeUnits: source.length,
		totalLines: 11,
		matchedHeadings: 5,
		leadingMetadataLines: 0,
		truncated: false,
	});
	expect(
		result.entries.map(({ title, level, startLine, endLine }) => ({
			title,
			level,
			startLine,
			endLine,
		})),
	).toEqual([
		{ title: "Top", level: 1, startLine: 1, endLine: 8 },
		{ title: "Child", level: 2, startLine: 3, endLine: 6 },
		{ title: "Sub", level: 3, startLine: 5, endLine: 6 },
		{ title: "Next", level: 2, startLine: 7, endLine: 8 },
		{ title: "Other", level: 1, startLine: 9, endLine: 11 },
	]);
	expect(Object.keys(result.entries[0]).sort()).toEqual([
		"endLine",
		"level",
		"startLine",
		"title",
		"titleTruncated",
	]);
});

it.each(["\n", "\r", "\r\n"])(
	"uses physical source lines with %j",
	(newline) => {
		const source = ["# First", "Body", "## Second", "Tail", ""].join(newline);
		const result = outlineMarkdownSource(source);
		expect(result.totalLines).toBe(5);
		expect(
			result.entries.map(({ startLine, endLine }) => [startLine, endLine]),
		).toEqual([
			[1, 5],
			[3, 5],
		]);
		expect(result.sourceCodeUnits).toBe(source.length);
	},
);

it.each([
	["# Heading", "Heading", 1],
	[" ## Heading", "Heading", 2],
	["  ### Heading", "Heading", 3],
	["   #### Heading", "Heading", 4],
	["#####\tHeading", "Heading", 5],
	["###### Heading ###  ", "Heading", 6],
	["#", "", 1],
	["# ###", "", 1],
	["# C#", "C#", 1],
	["# Heading \\#", "Heading \\#", 1],
	["# [Link](unsafe:source) `code`", "[Link](unsafe:source) `code`", 1],
	["\uFEFF# Heading", "Heading", 1],
])("recognizes bounded ATX source %j", (source, title, level) => {
	expect(outlineMarkdownSource(source as string).entries).toEqual([
		{ title, level, titleTruncated: false, startLine: 1, endLine: 1 },
	]);
});

it.each([
	"    # Indented",
	"\t# Indented",
	"####### Too many",
	"#No delimiter",
	"> # Quoted",
	"- # Item",
	"1. # Item",
	"Title\n===",
	"Title\n---",
])("does not interpret other Markdown constructs %j", (source) => {
	expect(outlineMarkdownSource(source).entries).toEqual([]);
});

it.each([
	"```python\n# Hidden\n```\n# Live",
	"~~~python\n# Hidden\n~~~\n# Live",
	"   ```\n# Hidden\n   ```\n# Live",
	"````\n# Hidden\n```\n# Still hidden\n````\n# Live",
	"```\n# Hidden\n~~~\n# Still hidden\n```\n# Live",
	"~~~\n# Hidden\n~~~info\n# Still hidden\n~~~~~\n# Live",
	"```\n<script>\n# Hidden\n```\n# Live",
	"```bad`info\n# Live",
])("ignores fenced source while retaining following headings %j", (source) => {
	expect(
		outlineMarkdownSource(source).entries.map((entry) => entry.title),
	).toEqual(["Live"]);
});

it.each(["```\n# Hidden", "~~~\n# Hidden", "````\n```\n# Hidden"])(
	"omits an unclosed fenced tail %j",
	(source) => {
		expect(outlineMarkdownSource(source).entries).toEqual([]);
	},
);

it.each(["script", "STYLE", "pre", "textarea"])(
	"keeps %s raw blocks opaque through closing tags",
	(tag) => {
		const source = `<${tag} data-x="source">\n\n# Hidden\n</${tag} >\n# Live`;
		expect(
			outlineMarkdownSource(source).entries.map((entry) => entry.title),
		).toEqual(["Live"]);
	},
);

it.each([
	"<!--\n\n# Hidden\n-->\n# Live",
	"<![CDATA[\n# Hidden\n]]>\n# Live",
	"<?source\n# Hidden\n?>\n# Live",
	"<!DOCTYPE\n# Hidden\n>\n# Live",
	"<div>\n# Hidden\n\n# Live",
	"<custom-element>\n# Hidden\n\t\n# Live",
	"<!-- inline -->\n# Live",
	"<script>inline</script>\n# Live",
	"    <script>\n# Live",
	"<https://source.invalid/>\n# Live",
])("omits opaque HTML-shaped source blocks %j", (source) => {
	expect(
		outlineMarkdownSource(source).entries.map((entry) => entry.title),
	).toEqual(["Live"]);
});

it.each(["---", "+++"])(
	"omits a paired leading metadata block %s",
	(marker) => {
		const source = `${marker}\ntitle: source\n# Hidden\n${marker}\n# Live\nbody`;
		const result = outlineMarkdownSource(source);
		expect(result.leadingMetadataLines).toBe(4);
		expect(result.entries).toEqual([
			{
				level: 1,
				title: "Live",
				titleTruncated: false,
				startLine: 5,
				endLine: 6,
			},
		]);
	},
);

it("supports a BOM and YAML-style closing marker without interpreting metadata", () => {
	const result = outlineMarkdownSource("\uFEFF---\n# Hidden\n...\n# Live");
	expect(result.leadingMetadataLines).toBe(3);
	expect(result.entries[0].startLine).toBe(4);
});

it("does not discard unmatched or later delimiter blocks", () => {
	for (const source of ["---\n# Live", "Intro\n---\n# Live\n---"]) {
		const result = outlineMarkdownSource(source);
		expect(result.leadingMetadataLines).toBe(0);
		expect(result.entries[0].title).toBe("Live");
	}
});

it("bounds leading metadata lookahead independently of the full scan", () => {
	const inside = [
		"---",
		...Array.from({ length: 126 }, () => "field: value"),
		"---",
		"# Live",
	].join("\n");
	expect(outlineMarkdownSource(inside).leadingMetadataLines).toBe(128);
	const outside = [
		"---",
		...Array.from({ length: 127 }, () => "field: value"),
		"---",
		"# Live",
	].join("\n");
	expect(outlineMarkdownSource(outside).leadingMetadataLines).toBe(0);
	expect(outlineMarkdownSource(outside).entries[0].title).toBe("Live");
});

it("finishes recorded ranges even after exhausting the entry allowance", () => {
	const lines = ["# Root"];
	for (let index = 1; index <= 128; index++)
		lines.push(`## Section ${index}`, "Body");
	lines.push("# Final", "Tail");
	const result = outlineMarkdownSource(lines.join("\n"));
	expect(result.entries).toHaveLength(128);
	expect(result.matchedHeadings).toBe(130);
	expect(result.truncated).toBe(true);
	expect(result.entries[0].endLine).toBe(lines.indexOf("# Final"));
	expect(result.entries.at(-1)?.endLine).toBe(lines.indexOf("## Section 128"));
	expect(result.totalLines).toBe(lines.length);
});

it.each([127, 128, 129])("bounds title source units at %s", (length) => {
	const entry = outlineMarkdownSource(`# ${"x".repeat(length)}`).entries[0];
	expect(entry.title.length).toBe(Math.min(length, 128));
	expect(entry.titleTruncated).toBe(length > 128);
});

it("does not split a title surrogate pair or emit raw terminal controls", () => {
	expect(
		outlineMarkdownSource(`# ${"x".repeat(127)}😀`).entries[0],
	).toMatchObject({ title: "x".repeat(127), titleTruncated: true });
	expect(
		outlineMarkdownSource("# A\u001b[31m\u202eB\tC").entries[0].title,
	).toBe("A\\u{1b}[31m\\u{202e}B\tC");
});

it("returns deeply frozen outline records", () => {
	const result = outlineMarkdownSource("# First\n# Second");
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.entries)).toBe(true);
	expect(Object.isFrozen(result.entries[0])).toBe(true);
	expect(Reflect.set(result.entries[0], "endLine", 100)).toBe(false);
});

it("scans long non-closing title padding without quadratic suffix matching", () => {
	const source = `# A${" ".repeat(100_000)}Z`;
	const result = outlineMarkdownSource(source);
	expect(result.entries[0].title).toBe(`A${" ".repeat(127)}`);
	expect(result.entries[0].titleTruncated).toBe(true);
});

it.each(["\u2028", "\u2029"])(
	"treats Unicode separator %j as fence info, not a physical line break",
	(separator) => {
		for (const marker of ["`", "~"]) {
			const delimiter = marker.repeat(100_000);
			const source = `${delimiter}${separator}\n# Hidden\n${delimiter}\n# Live`;
			const result = outlineMarkdownSource(source);
			expect(result.totalLines).toBe(4);
			expect(result.entries.map((entry) => entry.title)).toEqual(["Live"]);
		}
	},
);

it.each(["\u2028", "\u2029"])(
	"does not close a fence with Unicode separator %j suffix",
	(separator) => {
		const source = `~~~\n~~~${separator}\n# Hidden\n~~~\n# Live`;
		expect(
			outlineMarkdownSource(source).entries.map((entry) => entry.title),
		).toEqual(["Live"]);
	},
);

it("retains unfenced comment-shaped candidates without guessing author intent", () => {
	const result = outlineMarkdownSource(
		"x = source()\n# x.device is source data\ny = source()\n# y.device is source data",
	);
	expect(result.entries.map((entry) => [entry.title, entry.startLine])).toEqual(
		[
			["x.device is source data", 2],
			["y.device is source data", 4],
		],
	);
	expect(result.partial).toBe(true);
});

it("admits the exact source ceiling and rejects one additional unit", () => {
	const source = "x".repeat(markdownSourceOutlineLimits.maxSourceCodeUnits);
	expect(outlineMarkdownSource(source).sourceCodeUnits).toBe(source.length);
	expect(() => outlineMarkdownSource(`${source}x`)).toThrow(
		"Markdown source outline limit exceeded",
	);
});

it.each([null, undefined, 0, {}, []])(
	"rejects non-string source without coercion %j",
	(value) => {
		expect(() => outlineMarkdownSource(value as never)).toThrow(
			"Expected Markdown source text",
		);
	},
);

it("retains exact physical line counts for empty and trailing-line sources", () => {
	for (const [source, totalLines] of [
		["", 1],
		["\n", 2],
		["\r\n", 2],
		["\r\n\r\n", 3],
	] as const)
		expect(outlineMarkdownSource(source).totalLines).toBe(totalLines);
});
