import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchHtmlJsonArguments,
	runResearchHtmlJsonCli,
} from "../scripts/research-html-json.js";

const streams: Array<Readable | Writable> = [];
const url = "https://source.fixture.invalid/document";

function hash(body: Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

function source(
	literal = '{"news":{"title":"A title","summary":"A complete summary"}}',
	trailer = "",
): string {
	return `<html><script id="news-data" type="text/javascript">const newsData = ${literal};${trailer}</script></html>`;
}

function args(body: Uint8Array, pointer = "/news"): string[] {
	return [
		"--url",
		url,
		"--content-type",
		"text/html; charset=utf-8",
		"--sha256",
		hash(body),
		"--script-id",
		"news-data",
		"--json-pointer",
		pointer,
		"--binding",
		"newsData",
	];
}

function capture(text = source()) {
	const body = Buffer.from(text);
	const input = Readable.from([body.subarray(0, 17), body.subarray(17)], {
		objectMode: false,
		autoDestroy: false,
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		autoDestroy: false,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const stream of [input, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	return {
		body,
		input,
		output,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected network");
		}),
	);
});

afterEach(() => {
	for (const stream of streams.splice(0)) stream.destroy();
	expect(fetch).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("parses an explicit binding without changing legacy selection fields", () => {
	const body = Buffer.from(source());
	expect(parseResearchHtmlJsonArguments(args(body))).toEqual({
		url,
		contentType: "text/html; charset=utf-8",
		sha256: hash(body),
		selection: { scriptId: "news-data", pointer: "/news", binding: "newsData" },
	});
	expect(
		parseResearchHtmlJsonArguments(args(body).slice(0, -2)).selection,
	).toEqual({
		scriptId: "news-data",
		pointer: "/news",
	});
});

it("returns paired source fields in a distinct unverified envelope", async () => {
	const target = capture();
	const original = Buffer.from(target.body);
	expect(
		await runResearchHtmlJsonCli(
			args(target.body),
			target.input,
			target.output,
		),
	).toBe(0);
	const result = JSON.parse(target.text());
	expect(result).toMatchObject({
		kind: "html-json-binding-source-selection-v1",
		partial: true,
		rendered: false,
		verified: false,
		scope: "document-source",
		format: "json-source",
		networkRequests: 0,
		content: '{"title":"A title","summary":"A complete summary"}',
	});
	expect(JSON.parse(result.content)).toEqual({
		title: "A title",
		summary: "A complete summary",
	});
	expect(target.body).toEqual(original);
	expect(target.input.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
	expect(target.input.listenerCount("data")).toBe(0);
	expect(target.input.listenerCount("end")).toBe(0);
});

it("preserves the selected JSON spelling and omits trailing source", async () => {
	const target = capture(
		source('{"news":"caf\\u00e9"}', 'throw new Error("MUST_NOT_RUN");'),
	);
	await runResearchHtmlJsonCli(args(target.body), target.input, target.output);
	const result = JSON.parse(target.text());
	expect(result.content).toBe('"caf\\u00e9"');
	expect(JSON.parse(result.content)).toBe("café");
	expect(target.text()).not.toContain("MUST_NOT_RUN");
});

it("preserves large numeric source spelling without Number conversion", async () => {
	const target = capture(source('{"news":9007199254740993}'));
	await runResearchHtmlJsonCli(args(target.body), target.input, target.output);
	expect(JSON.parse(target.text()).content).toBe("9007199254740993");
});

it("leaves application/json mode and its envelope unchanged", async () => {
	const target = capture(
		'<script type="application/json" id="news-data">{"news":"plain JSON"}</script>',
	);
	await runResearchHtmlJsonCli(
		args(target.body).slice(0, -2),
		target.input,
		target.output,
	);
	expect(JSON.parse(target.text())).toMatchObject({
		kind: "html-json-source-selection-v1",
		content: '"plain JSON"',
		selection: { kind: "html-json-script-source-v1" },
	});
});

it("does not implicitly admit a JavaScript binding in application/json mode", async () => {
	const target = capture();
	await expect(
		runResearchHtmlJsonCli(
			args(target.body).slice(0, -2),
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it.each([
	"",
	"bad-name",
	"newsData.other",
	"news Data",
	"caf\u00e9",
	"x".repeat(257),
	"null",
	"true",
	"false",
	"class",
	"const",
	"let",
	"yield",
	"await",
	"enum",
	"eval",
	"arguments",
])("rejects invalid binding %j before reading input", async (binding) => {
	const target = capture();
	const values = args(target.body);
	values[values.length - 1] = binding;
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
	expect(target.text()).toBe("");
});

it.each([
	["--binding", "newsData", "--binding", "other"],
	["--binding"],
	["--unknown", "newsData"],
])("rejects malformed explicit flags %j", async (...suffix) => {
	const target = capture();
	await expect(
		runResearchHtmlJsonCli(
			[...args(target.body).slice(0, -2), ...suffix],
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
	expect(target.text()).toBe("");
});

it.each([
	source().replace("const newsData", "const otherData"),
	source().replace("const newsData", "let newsData"),
	source().replace("};", "} + action();"),
	source().replace("};", "}, other = 1;"),
	source().replace("text/javascript", "module"),
	source().replace("text/javascript", "application/json"),
	source().replace(
		'id="news-data"',
		'id="news-data" src="https://source.fixture.invalid/script.js"',
	),
	source().replace('id="news-data"', 'id="news-data" id="news-data"'),
	`${source()}<div id="news-data">duplicate identity</div>`,
	source().replace("</script>", ""),
	source('{"news":"first","news":"second"}'),
	source('{"news":"selected","other":{"duplicate":1,"duplicate":2}}'),
	source('{"news": action()}'),
	source('{"news": "unterminated}'),
])("rejects unsupported source without partial output (%#)", async (body) => {
	const target = capture(body);
	await expect(
		runResearchHtmlJsonCli(args(target.body), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it("rejects a changed body hash before source selection", async () => {
	const target = capture();
	const values = args(target.body);
	values[values.indexOf("--sha256") + 1] = "0".repeat(64);
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it("fails closed on a missing pointer", async () => {
	const target = capture();
	await expect(
		runResearchHtmlJsonCli(
			args(target.body, "/missing"),
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "not-found" });
	expect(target.text()).toBe("");
});

it("keeps the selected-value output limit", async () => {
	const target = capture(source(JSON.stringify({ news: "x".repeat(65_536) })));
	await expect(
		runResearchHtmlJsonCli(args(target.body), target.input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
});

it("honors cancellation before consuming body bytes", async () => {
	const target = capture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		runResearchHtmlJsonCli(
			args(target.body),
			target.input,
			target.output,
			controller.signal,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(target.input.readableFlowing).toBe(null);
	expect(target.text()).toBe("");
});
