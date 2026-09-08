import { describe, expect, it } from "vitest";
import { HtmlTokenizer } from "./html-tokenizer.js";

it("inserts input before unread source and pauses without treating the boundary as EOF", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("<p>original</p>", (issue) =>
		issues.push(issue),
	);
	input.insert("<span>new</span>", 0);
	input.setBoundary(16);
	expect(input.next()).toMatchObject({ kind: "start", name: "span" });
	expect(input.next()).toEqual({ kind: "text", data: "new" });
	expect(input.next()).toMatchObject({ kind: "end", name: "span" });
	expect(input.next()).toBeUndefined();
	expect(input.paused).toBe(true);
	input.setBoundary(undefined);
	expect(input.next()).toMatchObject({ kind: "start", name: "p" });
	expect(issues).toEqual([]);
});

it("retains incomplete tags and quoted attributes across inserted chunks", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("after", (issue) => issues.push(issue));
	const first = '<span title="unfinished';
	input.insert(first, 0);
	input.setBoundary(first.length);
	expect(input.next()).toBeUndefined();
	expect(input.position).toBe(0);
	const second = '">text</span>';
	input.insert(second, first.length);
	input.setBoundary(first.length + second.length);
	expect(input.next()).toMatchObject({
		kind: "start",
		name: "span",
		attributes: { title: "unfinished" },
	});
	expect(input.next()).toEqual({ kind: "text", data: "text" });
	expect(issues).toEqual([]);
});

it("does not emit a split character reference prematurely", () => {
	const input = new HtmlTokenizer("", () => {});
	input.insert("text &am", 0);
	input.setBoundary(8);
	expect(input.next()).toEqual({ kind: "text", data: "text " });
	expect(input.next()).toBeUndefined();
	input.insert("p;", 8);
	input.setBoundary(10);
	expect(input.next()).toEqual({ kind: "text", data: "&" });
});

it("pauses raw script text until its closing token becomes available", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("", (issue) => issues.push(issue));
	input.insert("content</scr", 0);
	input.setBoundary(12);
	expect(input.raw("script")).toBeUndefined();
	input.insert("ipt>", 12);
	input.setBoundary(16);
	expect(input.raw("script")).toBe("content");
	expect(input.next()).toMatchObject({ kind: "end", name: "script" });
	expect(issues).toEqual([]);
});

it("rejects insertion into consumed source", () => {
	const input = new HtmlTokenizer("text", () => {});
	input.next();
	expect(() => input.insert("bad", 0)).toThrow();
});

describe("legacy raw input neutrality under shared script transitions", () => {
	it.each([
		{ name: "initial data ignores open script", body: "<script>inner" },
		{ name: "escaped closing", body: "<!--inner" },
		{
			name: "double closing returns to escaped",
			body: "<!--<ScRiPt>inner</sCrIpT>tail",
		},
		{ name: "double dash reset", body: "<!--<script>inner-->tail" },
		{
			name: "escaped dash reset before an open script",
			body: "<!-- --> <script>data",
		},
		{
			name: "comment prefix inside escaped data",
			body: "<!--<!--<script>nested</script>tail",
		},
		{
			name: "false open and close prefixes",
			body: "<!--<scriptx>one</scriptx></script-foo></script=bad>",
		},
		{ name: "quotes do not shield a close", body: 'const text = "' },
	])("preserves $name output, position and work", ({ body }) => {
		const issues: string[] = [];
		const input = new HtmlTokenizer(`${body}</ScRiPt>tail`, (issue) =>
			issues.push(issue),
		);
		expect(input.raw("script")).toBe(body);
		expect(input.position).toBe(body.length);
		expect(input.workUnits).toBe(body.length);
		expect(input.issueCount).toBe(0);
		expect(input.paused).toBe(false);
		expect(input.next()).toMatchObject({ kind: "end", name: "script" });
		expect(input.remainder()).toBe("tail");
		expect(issues).toEqual([]);
	});

	it.each(["\t", "\n", "\f", "\r", " ", "/", ">"])(
		"preserves each mixed-case script transition with delimiter %j",
		(delimiter) => {
			for (const body of ["plain", "<!--plain"]) {
				const closing = `</ScRiPt${delimiter}>`;
				const issues: string[] = [];
				const input = new HtmlTokenizer(`${body}${closing}`, (issue) =>
					issues.push(issue),
				);
				expect(input.raw("script")).toBe(body);
				expect(input.position).toBe(body.length);
				expect(input.workUnits).toBe(body.length);
				expect(input.issueCount).toBe(0);
				expect(input.remainder()).toBe(closing);
				expect(issues).toEqual([]);
			}
			for (const body of [
				`<!--<ScRiPt${delimiter}inner</sCrIpT>tail`,
				`<!--<ScRiPt>inner</sCrIpT${delimiter}tail`,
			]) {
				const issues: string[] = [];
				const input = new HtmlTokenizer(`${body}</SCRIPT>`, (issue) =>
					issues.push(issue),
				);
				expect(input.raw("script")).toBe(body);
				expect(input.position).toBe(body.length);
				expect(input.workUnits).toBe(body.length);
				expect(input.issueCount).toBe(0);
				expect(input.remainder()).toBe("</SCRIPT>");
				expect(issues).toEqual([]);
			}
		},
	);

	it.each(["x", "-", "=", "\0", "\v", "\u00a0"])(
		"does not recognize script names followed by %j",
		(delimiter) => {
			for (const body of [
				`<!--<script${delimiter}>one`,
				`one</script${delimiter}>two`,
			]) {
				const issues: string[] = [];
				const input = new HtmlTokenizer(`${body}</script>`, (issue) =>
					issues.push(issue),
				);
				expect(input.raw("script")).toBe(body);
				expect(input.position).toBe(body.length);
				expect(input.workUnits).toBe(body.length);
				expect(input.issueCount).toBe(0);
				expect(issues).toEqual([]);
			}
		},
	);

	it("starts legacy script state at an arbitrary consumed UTF16 position", () => {
		const prefix = "<p>😀</p>";
		const body = "<!--<script>one-->two";
		const issues: string[] = [];
		const input = new HtmlTokenizer(`${prefix}${body}</script>`, (issue) =>
			issues.push(issue),
		);
		expect(input.next()).toMatchObject({ kind: "start", name: "p" });
		expect(input.next()).toEqual({ kind: "text", data: "😀" });
		expect(input.next()).toMatchObject({ kind: "end", name: "p" });
		expect(input.position).toBe(9);
		expect(input.workUnits).toBe(9);
		expect(input.raw("script")).toBe(body);
		expect(input.position).toBe(prefix.length + body.length);
		expect(input.workUnits).toBe(prefix.length + body.length);
		expect(input.issueCount).toBe(0);
		expect(issues).toEqual([]);
	});

	it("restarts in data rather than carrying escaped state between raw calls", () => {
		const first = "<!--one";
		const second = "<script>two";
		const closing = "</script>";
		const issues: string[] = [];
		const input = new HtmlTokenizer(
			`${first}${closing}${second}${closing}`,
			(issue) => issues.push(issue),
		);
		expect(input.raw("script")).toBe(first);
		expect(input.next()).toMatchObject({ kind: "end", name: "script" });
		expect(input.raw("script")).toBe(second);
		expect(input.position).toBe(first.length + closing.length + second.length);
		expect(input.workUnits).toBe(input.position);
		expect(input.issueCount).toBe(0);
		expect(issues).toEqual([]);
	});

	it.each([
		"",
		"<",
		"<!",
		"<!-",
		"<!--",
		"<!--<script",
		"<!--<script>",
		"<!--<script>body</script",
		"<!--<script>body</script>",
		"body</scr",
		"body</script",
	])("preserves true EOF for incomplete script input %j", (source) => {
		const issues: string[] = [];
		const input = new HtmlTokenizer(source, (issue) => issues.push(issue));
		expect(input.raw("script")).toBe(source);
		expect(input.position).toBe(source.length);
		expect(input.workUnits).toBe(source.length);
		expect(input.paused).toBe(false);
		expect(input.issueCount).toBe(1);
		expect(issues).toEqual(["unterminated-raw-element"]);
		expect(input.next()).toBeUndefined();
		expect(input.issueCount).toBe(1);
	});

	it("rolls back every bounded script split and retains exact retry work", () => {
		const body = "<!--<ScRiPt>inner</sCrIpT>-->tail";
		const closing = "</script>";
		for (
			let boundary = 0;
			boundary < body.length + closing.length;
			boundary++
		) {
			const issues: string[] = [];
			const input = new HtmlTokenizer(`${body}${closing}`, (issue) =>
				issues.push(issue),
			);
			input.setBoundary(boundary);
			for (let attempt = 1; attempt <= 2; attempt++) {
				expect(input.raw("script")).toBeUndefined();
				expect(input.position).toBe(0);
				expect(input.paused).toBe(true);
				expect(input.workUnits).toBe(attempt * boundary);
				expect(input.issueCount).toBe(0);
				expect(issues).toEqual([]);
			}
			input.setBoundary(undefined);
			expect(input.raw("script")).toBe(body);
			expect(input.position).toBe(body.length);
			expect(input.workUnits).toBe(2 * boundary + body.length);
			expect(input.paused).toBe(false);
			expect(input.issueCount).toBe(0);
			expect(issues).toEqual([]);
		}
	});

	it("retries escaped and double prefixes after insertion without leaking state", () => {
		const first = "<!--<ScRi";
		const second = "Pt>inner</scr";
		const third = "ipt>-->tail</script>";
		const body = `${first}${second}ipt>-->tail`;
		const issues: string[] = [];
		const input = new HtmlTokenizer("AFTER", (issue) => issues.push(issue));
		input.insert(first, 0);
		input.setBoundary(first.length);
		expect(input.raw("script")).toBeUndefined();
		expect(input.workUnits).toBe(first.length);
		input.insert(second, first.length);
		input.setBoundary(first.length + second.length);
		expect(input.raw("script")).toBeUndefined();
		expect(input.position).toBe(0);
		expect(input.workUnits).toBe(2 * first.length + second.length);
		input.insert(third, first.length + second.length);
		input.setBoundary(first.length + second.length + third.length);
		expect(input.raw("script")).toBe(body);
		expect(input.position).toBe(body.length);
		expect(input.workUnits).toBe(
			2 * first.length + second.length + body.length,
		);
		expect(input.paused).toBe(false);
		expect(input.next()).toMatchObject({ kind: "end", name: "script" });
		expect(input.next()).toBeUndefined();
		expect(input.paused).toBe(true);
		input.setBoundary(undefined);
		expect(input.next()).toEqual({ kind: "text", data: "AFTER" });
		expect(input.issueCount).toBe(0);
		expect(issues).toEqual([]);
	});

	it.each([
		{
			name: "x-local",
			entities: false,
			body: "<!--<script>one",
			closing: "</X-LOCAL>",
			result: "<!--<script>one",
		},
		{
			name: "ScRiPt",
			entities: false,
			body: "<!--<script>one",
			closing: "</SCRIPT>",
			result: "<!--<script>one",
		},
		{
			name: "scrip[t]",
			entities: false,
			body: "literal",
			closing: "</script>",
			result: "literal",
		},
		{
			name: "title",
			entities: true,
			body: "A&amp;&#65;",
			closing: "</TiTlE>",
			result: "A&A",
		},
		{
			name: "textarea",
			entities: true,
			body: "&lt;body&gt;&amp;",
			closing: "</textarea>",
			result: "<body>&",
		},
		{
			name: "style",
			entities: false,
			body: "a\0&#0;&bogus;",
			closing: "</style>",
			result: "a\0&#0;&bogus;",
		},
		{
			name: "script",
			entities: true,
			body: "a\0&#0;&bogus;",
			closing: "</script>",
			result: "a\0&#0;&bogus;",
		},
	])(
		"keeps the legacy arbitrary-name/entity path for $name",
		({ name, entities, body, closing, result }) => {
			const issues: string[] = [];
			const input = new HtmlTokenizer(`${body}${closing}`, (issue) =>
				issues.push(issue),
			);
			expect(input.raw(name, entities)).toBe(result);
			expect(input.position).toBe(body.length);
			expect(input.workUnits).toBe(body.length);
			expect(input.paused).toBe(false);
			expect(input.issueCount).toBe(0);
			expect(input.remainder()).toBe(closing);
			expect(issues).toEqual([]);
		},
	);
});
