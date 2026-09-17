import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchHtmlJsonArguments,
	researchHtmlJsonCliLimits,
	runResearchHtmlJsonCli,
} from "../scripts/research-html-json.js";
import * as sourceInput from "../scripts/research-source-input.js";
import { AgentBrowserError } from "./errors.js";
import * as htmlJson from "./html-source-json.js";

const url = "https://source.fixture.invalid/document";
const streams: Array<Readable | Writable> = [];

function hash(body: string | Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

function html(json = '{"value":9007199254740993}', id = "data"): string {
	return `<html><script type="application/json" id="${id}">${json}</script></html>`;
}

function args(
	body: string | Uint8Array = html(),
	pointer = "/value",
): string[] {
	return [
		"--url",
		url,
		"--content-type",
		"text/html; charset=utf-8",
		"--sha256",
		hash(body),
		"--script-id",
		"data",
		"--json-pointer",
		pointer,
	];
}

function replace(flag: string, value: string): string[] {
	const result = args();
	result[result.indexOf(flag) + 1] = value;
	return result;
}

function retain<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function capture(body: Uint8Array = Buffer.from(html())) {
	const input = retain(
		Readable.from([body.subarray(0, 11), body.subarray(11)], {
			objectMode: false,
			autoDestroy: false,
		}),
	);
	const chunks: Buffer[] = [];
	const output = retain(
		new Writable({
			autoDestroy: false,
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		}),
	);
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

function listeners(stream: Readable | Writable) {
	return ["data", "end", "error", "close", "finish", "drain"].map((event) =>
		stream.listeners(event),
	);
}

function expectOpen(target: ReturnType<typeof capture>) {
	expect(target.input.destroyed).toBe(false);
	expect(target.output.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected network operation");
		}),
	);
});

afterEach(() => {
	for (const stream of streams.splice(0)) stream.destroy();
	expect(fetch).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("parses exactly the explicit source identity and selection flags", () => {
	expect(parseResearchHtmlJsonArguments(args())).toEqual({
		url,
		contentType: "text/html; charset=utf-8",
		sha256: hash(html()),
		selection: { scriptId: "data", pointer: "/value" },
	});
	expect(
		parseResearchHtmlJsonArguments(args(html(), "")).selection.pointer,
	).toBe("");
	expect(
		parseResearchHtmlJsonArguments(replace("--sha256", "A".repeat(64))).sha256,
	).toBe("a".repeat(64));
	const reordered = args();
	reordered.push(...reordered.splice(0, 2));
	expect(parseResearchHtmlJsonArguments(reordered)).toEqual(
		parseResearchHtmlJsonArguments(args()),
	);
});

it.each(
	[
		[],
		args().slice(0, -1),
		args().slice(0, -2),
		[...args(), "--selector", "script"],
		[...args(), "--json-pointer", ""],
		["--url", url, ...args().slice(0, 8)],
		["--unknown", url, ...args().slice(2)],
		["--url=https://source.fixture.invalid/", ...args().slice(1)],
		replace("--url", "http://source.fixture.invalid/document"),
		replace("--url", "https://user:secret@source.fixture.invalid/document"),
		replace("--url", `${url}#`),
		replace("--url", "https://SOURCE.fixture.invalid/document"),
		replace("--url", "https://source.fixture.invalid"),
		replace("--url", ` ${url}`),
		replace("--url", `${url}${"x".repeat(8192)}`),
		replace("--content-type", "application/json"),
		replace("--content-type", "text/html,text/plain"),
		replace("--content-type", "text/html\r\nX-Secret: value"),
		replace("--content-type", `text/html;${"x".repeat(1024)}`),
		replace("--sha256", "0".repeat(63)),
		replace("--sha256", "g".repeat(64)),
		replace("--script-id", ""),
		replace("--script-id", "data other"),
		replace("--script-id", "data\0"),
		replace("--script-id", "data\u200b"),
		replace("--script-id", "x".repeat(257)),
		replace("--json-pointer", "value"),
		replace("--json-pointer", "#/value"),
		replace("--json-pointer", "/bad~2"),
		replace("--json-pointer", `/${"x".repeat(4096)}`),
		replace("--json-pointer", "/x".repeat(129)),
	].map((value, index) => ({ value, index })),
)("rejects arguments $index before stream access", async ({ value }) => {
	expect(() => parseResearchHtmlJsonArguments(value)).toThrow(
		AgentBrowserError,
	);
	const target = capture();
	const operations = [
		vi.spyOn(target.input, "read"),
		vi.spyOn(target.input, "on"),
		vi.spyOn(target.input, "resume"),
		vi.spyOn(target.input, "pause"),
		vi.spyOn(target.input, "destroy"),
		vi.spyOn(target.output, "write"),
		vi.spyOn(target.output, "on"),
		vi.spyOn(target.output, "destroy"),
	];
	await expect(
		runResearchHtmlJsonCli(value, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	for (const operation of operations) expect(operation).not.toHaveBeenCalled();
});

it("writes one source-only JSONL record with the exact core metadata", async () => {
	const body = Buffer.from(html());
	const target = capture(body);
	const inputListeners = listeners(target.input);
	const outputListeners = listeners(target.output);
	const controller = new AbortController();
	const callerAbort = vi.fn();
	controller.signal.addEventListener("abort", callerAbort);
	const selected = htmlJson.selectHtmlJsonSource(body.toString(), {
		scriptId: "data",
		pointer: "/value",
	});
	const source = sourceInput.admitResearchHtmlSource(
		{ finalUrl: url, contentType: "text/html; charset=utf-8", body },
		2_000_000,
		2_000_000,
		() => undefined,
	);
	const admission = vi.spyOn(sourceInput, "admitResearchHtmlSource");
	await expect(
		runResearchHtmlJsonCli(
			args(body),
			target.input,
			target.output,
			controller.signal,
		),
	).resolves.toBe(0);
	expect(target.text().split("\n")).toHaveLength(2);
	expect(JSON.parse(target.text())).toEqual({
		kind: "html-json-source-selection-v1",
		partial: true,
		rendered: false,
		verified: false,
		scope: "document-source",
		source: source.identity,
		selection: selected.metadata,
		format: "json-source",
		content: "9007199254740993",
		networkRequests: 0,
	});
	const admittedBody = (admission.mock.calls[0][0] as { body: Uint8Array })
		.body;
	expect(admittedBody.every((byte) => byte === 0)).toBe(true);
	expect(body.toString()).toBe(html());
	expect(listeners(target.input)).toEqual(inputListeners);
	expect(listeners(target.output)).toEqual(outputListeners);
	expect(getEventListeners(controller.signal, "abort")).toEqual([callerAbort]);
	expectOpen(target);
});

it.each(
	[
		{
			json: '{"value":900719925474099312345678901234567890}',
			pointer: "/value",
			content: "900719925474099312345678901234567890",
		},
		{ json: '{"value":-0}', pointer: "/value", content: "-0" },
		{ json: '{"value":1e400}', pointer: "/value", content: "1e400" },
		{
			json: String.raw`{"a\u002fb":{"\u007ekey":"\u0041\/B"}}`,
			pointer: "/a~1b/~0key",
			content: String.raw`"\u0041\/B"`,
		},
		{
			json: '{\r\n "value": [true, null, 9007199254740993]\r\n}',
			pointer: "",
			content: '{\r\n "value": [true, null, 9007199254740993]\r\n}',
		},
		{ json: '{"value":[false,{"":42}]}', pointer: "/value/1/", content: "42" },
	].map((value, index) => ({ ...value, index })),
)(
	"preserves JSON spelling for case $index",
	async ({ json, pointer, content }) => {
		const body = Buffer.from(html(json));
		const target = capture(body);
		await runResearchHtmlJsonCli(
			args(body, pointer),
			target.input,
			target.output,
		);
		expect(JSON.parse(target.text()).content).toBe(content);
	},
);

it("keeps raw-byte and decoded-text identities distinct for BOM input", async () => {
	const text = html('{"value":"café"}');
	const body = Buffer.concat([
		Buffer.from([0xff, 0xfe]),
		Buffer.from(text, "utf16le"),
	]);
	const target = capture(body);
	await runResearchHtmlJsonCli(args(body), target.input, target.output);
	const record = JSON.parse(target.text());
	expect(record.source).toMatchObject({
		kind: "decoded-html-source-v1",
		reportedFinalUrl: url,
		bytes: { length: body.byteLength, sha256: hash(body) },
		decoder: { bomConsumed: true },
		text: {
			codeUnits: text.length,
			sha256: hash(text),
			coordinates: "decoder-output-utf16-before-parser-normalization",
		},
	});
	expect(record.content).toBe('"café"');
});

it("checks the exact byte digest before admission or JSON selection", async () => {
	const body = Buffer.from(`${html()} `);
	const target = capture(body);
	const admission = vi.spyOn(sourceInput, "admitResearchHtmlSource");
	const selection = vi.spyOn(htmlJson, "selectHtmlJsonSource");
	const allocation = vi.spyOn(Buffer, "alloc");
	const error = await runResearchHtmlJsonCli(
		args(),
		target.input,
		target.output,
	).catch((value: unknown) => value);
	expect(error).toMatchObject({
		code: "invalid-input",
		message: "Research HTML JSON operation failed",
	});
	expect(String(error)).not.toContain(hash(body));
	expect(String(error)).not.toContain(hash(html()));
	expect(admission).not.toHaveBeenCalled();
	expect(selection).not.toHaveBeenCalled();
	const owned = allocation.mock.results[0].value as Buffer;
	expect(owned.byteLength).toBe(researchHtmlJsonCliLimits.maxInputBytes);
	expect(owned.every((byte) => byte === 0)).toBe(true);
	expect(target.text()).toBe("");
	expect(body.toString()).toBe(`${html()} `);
	expectOpen(target);
});

it.each(
	[
		"",
		"<html></html>",
		html('{"value":1}', "other"),
		`${html()}${html()}`,
		'<script id="data" type="application/json">{"value":1}',
		'<script id="data" type="text/javascript">{"value":1}</script>',
		'<script id="data">{"value":1}</script>',
		'<script id="data" type="application/json" src="/data.json">{"value":1}</script>',
		'<script id="data" type="application/json" src="">{"value":1}</script>',
		html('{"value":1,}'),
		html('{"value":1,"value":2}'),
		html('{"value":1,"outside":NaN}'),
		html('{"other":1}'),
	].map((body, index) => ({ body, index })),
)(
	"rejects invalid or ambiguous source $index without output",
	async ({ body }) => {
		const target = capture(Buffer.from(body));
		const admission = vi.spyOn(sourceInput, "admitResearchHtmlSource");
		await expect(
			runResearchHtmlJsonCli(args(body), target.input, target.output),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(target.text()).toBe("");
		const owned = (admission.mock.calls[0][0] as { body: Uint8Array }).body;
		expect(owned.every((byte) => byte === 0)).toBe(true);
		expectOpen(target);
	},
);

it("allows unrelated script IDs without executing their contents", async () => {
	const body = Buffer.from(
		`<script id="other">throw new Error("do not execute")</script>${html()}<script id="third" type="application/json">{"value":2}</script>`,
	);
	const target = capture(body);
	await runResearchHtmlJsonCli(args(body), target.input, target.output);
	expect(JSON.parse(target.text()).content).toBe("9007199254740993");
});

it("rejects a byte over the stdin ceiling before decoding", async () => {
	const body = Buffer.alloc(researchHtmlJsonCliLimits.maxInputBytes + 1, 32);
	const target = capture(body);
	const admission = vi.spyOn(sourceInput, "admitResearchHtmlSource");
	await expect(
		runResearchHtmlJsonCli(args(body), target.input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(admission).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
	expect(body.every((byte) => byte === 32)).toBe(true);
	expectOpen(target);
});

it("accepts exactly the raw-byte ceiling", async () => {
	const body = Buffer.from(
		html().padEnd(researchHtmlJsonCliLimits.maxInputBytes, " "),
	);
	const target = capture(body);
	await runResearchHtmlJsonCli(args(body), target.input, target.output);
	expect(JSON.parse(target.text()).source.bytes.length).toBe(
		researchHtmlJsonCliLimits.maxInputBytes,
	);
});

it.each(
	[
		{
			body: html(
				`{"value":"${"x".repeat(htmlJson.htmlSourceJsonLimits.maxScriptCodeUnits)}"}`,
			),
			pointer: "/value",
		},
		{
			body: html(
				`{"value":"${"x".repeat(htmlJson.htmlSourceJsonLimits.maxOutputBytes)}"}`,
			),
			pointer: "/value",
		},
		{ body: `${"<i></i>".repeat(50_001)}${html()}`, pointer: "/value" },
	].map((value, index) => ({ ...value, index })),
)(
	"enforces core and JSONL resource bound $index",
	async ({ body, pointer }) => {
		const target = capture(Buffer.from(body));
		await expect(
			runResearchHtmlJsonCli(args(body, pointer), target.input, target.output),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(target.text()).toBe("");
	},
);

it("bounds the serialized JSONL independently of core selection limits", async () => {
	const target = capture();
	const selected = htmlJson.selectHtmlJsonSource(html(), {
		scriptId: "data",
		pointer: "/value",
	});
	vi.spyOn(htmlJson, "selectHtmlJsonSource").mockReturnValueOnce({
		...selected,
		text: "x".repeat(researchHtmlJsonCliLimits.maxOutputBytes),
	});
	await expect(
		runResearchHtmlJsonCli(args(), target.input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
});

it("rejects excessive input chunks even when they contain no bytes", async () => {
	const target = capture();
	const input = retain(
		Readable.from(
			Array.from({ length: researchHtmlJsonCliLimits.maxInputChunks + 1 }, () =>
				Buffer.alloc(0),
			),
			{ objectMode: true, autoDestroy: false },
		),
	);
	await expect(
		runResearchHtmlJsonCli(args(""), input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(input.destroyed).toBe(false);
	expect(target.text()).toBe("");
});

it.each(
	["text", { body: "not bytes" }, new Uint8Array(new SharedArrayBuffer(4))].map(
		(chunk, index) => ({ chunk, index }),
	),
)("rejects non-owned byte input $index", async ({ chunk }) => {
	const target = capture();
	const input = retain(
		Readable.from([chunk], { objectMode: true, autoDestroy: false }),
	);
	await expect(
		runResearchHtmlJsonCli(args(), input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(input.destroyed).toBe(false);
	expect(target.text()).toBe("");
});

it("resumes explicitly paused input and restores caller stream listeners", async () => {
	const target = capture();
	target.input.pause();
	expect(target.input.readableFlowing).toBe(false);
	const inputListeners = listeners(target.input);
	const outputListeners = listeners(target.output);
	await expect(
		runResearchHtmlJsonCli(args(), target.input, target.output),
	).resolves.toBe(0);
	expect(JSON.parse(target.text()).content).toBe("9007199254740993");
	expect(listeners(target.input)).toEqual(inputListeners);
	expect(listeners(target.output)).toEqual(outputListeners);
	expectOpen(target);
});

it("help writes usage without touching input", async () => {
	const target = capture();
	const read = vi.spyOn(target.input, "read");
	const attach = vi.spyOn(target.input, "on");
	await expect(
		runResearchHtmlJsonCli(["--help"], target.input, target.output),
	).resolves.toBe(0);
	expect(read).not.toHaveBeenCalled();
	expect(attach).not.toHaveBeenCalled();
	expect(target.text()).toContain("Usage: research-html-json");
	expectOpen(target);
});

it("pre-abort does not consume input or expose an abort reason", async () => {
	const target = capture();
	const controller = new AbortController();
	controller.abort(new Error("secret body or credentials"));
	const read = vi.spyOn(target.input, "read");
	await expect(
		runResearchHtmlJsonCli(
			args(),
			target.input,
			target.output,
			controller.signal,
		),
	).rejects.toMatchObject({
		code: "aborted",
		message: "Research HTML JSON operation failed",
	});
	expect(read).not.toHaveBeenCalled();
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expectOpen(target);
});

it("rejects an already ended output before reading input", async () => {
	const target = capture();
	target.output.end();
	const read = vi.spyOn(target.input, "read");
	const before = listeners(target.output);
	await expect(
		runResearchHtmlJsonCli(args(), target.input, target.output),
	).rejects.toMatchObject({ code: "closed" });
	expect(read).not.toHaveBeenCalled();
	expect(listeners(target.output)).toEqual(before);
	expect(target.input.destroyed).toBe(false);
});

it("times out a stalled input and clears owned listeners and storage", async () => {
	vi.useFakeTimers();
	const target = capture();
	const input = retain(new Readable({ read() {}, autoDestroy: false }));
	const before = listeners(input);
	const allocation = vi.spyOn(Buffer, "alloc");
	const pending = runResearchHtmlJsonCli(args(), input, target.output);
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	input.emit("data", Buffer.from("secret"));
	await vi.advanceTimersByTimeAsync(researchHtmlJsonCliLimits.timeoutMs);
	await rejected;
	const owned = allocation.mock.results[0].value as Buffer;
	expect(owned.every((byte) => byte === 0)).toBe(true);
	expect(listeners(input)).toEqual(before);
	expect(input.destroyed).toBe(false);
	expect(target.output.destroyed).toBe(false);
});

it.each([
	"abort",
	"input-error",
	"input-close",
	"output-error",
	"output-close",
	"output-finish",
])("cleans up an idle read after %s", async (event) => {
	const target = capture();
	const input = retain(new Readable({ read() {}, autoDestroy: false }));
	const inputListeners = listeners(input);
	const outputListeners = listeners(target.output);
	const controller = new AbortController();
	const pending = runResearchHtmlJsonCli(
		args(),
		input,
		target.output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({
		code: event === "abort" ? "aborted" : "closed",
	});
	if (event === "abort") controller.abort("secret");
	else if (event === "input-error") input.emit("error", new Error("secret"));
	else if (event === "input-close") input.emit("close");
	else if (event === "output-error")
		target.output.emit("error", new Error("secret"));
	else if (event === "output-close") target.output.emit("close");
	else target.output.emit("finish");
	await rejected;
	expect(listeners(input)).toEqual(inputListeners);
	expect(listeners(target.output)).toEqual(outputListeners);
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expect(input.destroyed).toBe(false);
	expect(target.output.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
});

it("waits for output acknowledgement and backpressure without ending output", async () => {
	const target = capture();
	let acknowledge: (() => void) | undefined;
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	const output = retain(
		new Writable({
			highWaterMark: 1,
			autoDestroy: false,
			write(_chunk, _encoding, callback) {
				acknowledge = callback;
				began?.();
			},
		}),
	);
	const before = listeners(output);
	let completed = false;
	const pending = runResearchHtmlJsonCli(args(), target.input, output).then(
		(code) => {
			completed = true;
			return code;
		},
	);
	await writing;
	expect(completed).toBe(false);
	expect(output.writableNeedDrain).toBe(true);
	acknowledge?.();
	await expect(pending).resolves.toBe(0);
	expect(listeners(output)).toEqual(before);
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
});

it("cleans up an aborted pending write while preserving the caller stream", async () => {
	const target = capture();
	const controller = new AbortController();
	let acknowledge: (() => void) | undefined;
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	const output = retain(
		new Writable({
			highWaterMark: 1,
			autoDestroy: false,
			write(_chunk, _encoding, callback) {
				acknowledge = callback;
				began?.();
			},
		}),
	);
	const before = listeners(output);
	const pending = runResearchHtmlJsonCli(
		args(),
		target.input,
		output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await writing;
	controller.abort();
	await rejected;
	expect(output.listenerCount("error")).toBe(before[2].length + 1);
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
	acknowledge?.();
	expect(listeners(output)).toEqual(before);
});

it("sanitizes output callback failures and removes owned listeners", async () => {
	const target = capture();
	const output = retain(
		new Writable({
			autoDestroy: false,
			write(_chunk, _encoding, callback) {
				callback(new Error("secret output detail"));
			},
		}),
	);
	const before = listeners(output);
	await expect(
		runResearchHtmlJsonCli(args(), target.input, output),
	).rejects.toMatchObject({
		code: "closed",
		message: "Research HTML JSON operation failed",
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(listeners(output)).toEqual(before);
	expect(output.destroyed).toBe(false);
});

it("sanitizes core failures after clearing the admitted input copy", async () => {
	const target = capture();
	const admission = vi.spyOn(sourceInput, "admitResearchHtmlSource");
	vi.spyOn(htmlJson, "selectHtmlJsonSource").mockImplementationOnce(() => {
		throw new Error("secret source or https://user:secret@example.invalid/");
	});
	await expect(
		runResearchHtmlJsonCli(args(), target.input, target.output),
	).rejects.toMatchObject({ message: "Research HTML JSON operation failed" });
	const owned = (admission.mock.calls[0][0] as { body: Uint8Array }).body;
	expect(owned.every((byte) => byte === 0)).toBe(true);
	expect(target.text()).toBe("");
});
