import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchHtmlJsonArguments,
	runResearchHtmlJsonCli,
} from "../scripts/research-html-json.js";
import * as bindings from "./html-source-json-binding.js";

const streams: Array<Readable | Writable> = [];
const url = "https://source.fixture.invalid/batch";

function source(
	json = '{"title":"A title","description":"A complete description","number":9007199254740993}',
) {
	return `<script id="data">const data = ${json};throw new Error("DO_NOT_EXECUTE");</script>`;
}

function args(
	body: Uint8Array,
	pointers: unknown = ["/title", "/description"],
): string[] {
	return [
		"--url",
		url,
		"--content-type",
		"text/html; charset=utf-8",
		"--sha256",
		createHash("sha256").update(body).digest("hex"),
		"--script-id",
		"data",
		"--binding",
		"data",
		"--json-pointers",
		JSON.stringify(pointers),
	];
}

function capture(text = source()) {
	const body = Buffer.from(text);
	const input = Readable.from([body], {
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

it("parses and snapshots an explicit ordered batch", () => {
	const values = args(Buffer.from(source()), ["/description", "/title"]);
	const parsed = parseResearchHtmlJsonArguments(values);
	expect(parsed.selection).toEqual({
		scriptId: "data",
		binding: "data",
		pointers: ["/description", "/title"],
	});
	expect(Object.isFrozen(parsed.selection)).toBe(true);
	expect(
		"pointers" in parsed.selection &&
			Object.isFrozen(parsed.selection.pointers),
	).toBe(true);
	values[values.length - 1] = '["/number"]';
	expect(parsed.selection).toMatchObject({
		pointers: ["/description", "/title"],
	});
});

it("delegates once and preserves requested order and exact source spelling", async () => {
	const batch = vi.spyOn(bindings, "selectHtmlJsonBindingSources");
	const single = vi.spyOn(bindings, "selectHtmlJsonBindingSource");
	const target = capture();
	const original = Buffer.from(target.body);
	expect(
		await runResearchHtmlJsonCli(
			args(target.body, ["/number", "/title", "/description"]),
			target.input,
			target.output,
		),
	).toBe(0);
	expect(batch).toHaveBeenCalledTimes(1);
	expect(single).not.toHaveBeenCalled();
	const result = JSON.parse(target.text());
	expect(result).toMatchObject({
		kind: "html-json-binding-source-batch-selection-v1",
		format: "json-source-batch",
		partial: true,
		rendered: false,
		verified: false,
		scope: "document-source",
		networkRequests: 0,
	});
	expect(
		result.content.map((value: { pointer: string; text: string }) => [
			value.pointer,
			value.text,
		]),
	).toEqual([
		["/number", "9007199254740993"],
		["/title", '"A title"'],
		["/description", '"A complete description"'],
	]);
	expect(target.text()).not.toContain("DO_NOT_EXECUTE");
	expect(target.body).toEqual(original);
	expect(target.input.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
	expect(target.input.listenerCount("data")).toBe(0);
	expect(target.input.listenerCount("end")).toBe(0);
});

it.each([
	null,
	7,
	"/title",
	{},
	[],
	[1],
	[null],
	["/title", "/title"],
	["bad"],
	["/~2"],
	Array.from({ length: 33 }, (_, index) => `/${index}`),
	[`/${"x".repeat(4096)}`],
])(
	"rejects invalid pointer-array arguments before input consumption (%#)",
	async (pointers) => {
		const target = capture();
		await expect(
			runResearchHtmlJsonCli(
				args(target.body, pointers),
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(target.input.readableFlowing).toBe(null);
		expect(target.text()).toBe("");
	},
);

it.each([
	'["/title",]',
	'["/title"',
	'["/title"] + action()',
	"undefined",
	'["/title", "\u0000"]',
])("rejects malformed pointer JSON %j before reading", async (text) => {
	const target = capture();
	const values = args(target.body);
	values[values.length - 1] = text;
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
	expect(target.text()).toBe("");
});

it("requires a binding for batch mode", async () => {
	const target = capture();
	const values = args(target.body);
	values.splice(values.indexOf("--binding"), 2);
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
});

it.each([
	["--json-pointer", "/title"],
	["--json-pointers", '["/description"]'],
])("rejects conflicting or duplicate selection flags %j", async (...extra) => {
	const target = capture();
	await expect(
		runResearchHtmlJsonCli(
			[...args(target.body), ...extra],
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
	expect(target.text()).toBe("");
});

it("rejects both pointer forms even when the total flag count is otherwise valid", async () => {
	const target = capture();
	const values = args(target.body);
	values.splice(values.indexOf("--binding"), 2, "--json-pointer", "/title");
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
});

it("does not write partial output when a requested field is missing", async () => {
	const target = capture();
	await expect(
		runResearchHtmlJsonCli(
			args(target.body, ["/title", "/missing"]),
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "not-found" });
	expect(target.text()).toBe("");
});

it("validates nonselected JSON members before returning any values", async () => {
	const target = capture(
		source(
			'{"title":"selected","description":"selected","other":{"duplicate":1,"duplicate":2}}',
		),
	);
	await expect(
		runResearchHtmlJsonCli(args(target.body), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it("applies the selected-output cap to the aggregate batch", async () => {
	const target = capture(
		source(
			JSON.stringify({
				title: "x".repeat(35000),
				description: "x".repeat(35000),
			}),
		),
	);
	await expect(
		runResearchHtmlJsonCli(args(target.body), target.input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
});

it("rejects restricted binding names before consuming the body", async () => {
	const target = capture();
	const values = args(target.body);
	values[values.indexOf("--binding") + 1] = "null";
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.input.readableFlowing).toBe(null);
});

it("retains body-hash admission before batch selection", async () => {
	const selected = vi.spyOn(bindings, "selectHtmlJsonBindingSources");
	const target = capture();
	const values = args(target.body);
	values[values.indexOf("--sha256") + 1] = "0".repeat(64);
	await expect(
		runResearchHtmlJsonCli(values, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(selected).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
});

it("honors a pre-aborted batch without consuming input", async () => {
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
