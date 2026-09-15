import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { researchJsonReplayLimits } from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import type { ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://text-replay-cli.fixture.invalid/document";
const pins = [
	"--expected-profile",
	"default",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
];
const trusted = {
	expectedProfile: "default",
	expectedReceiptSha256: "a".repeat(64),
	expectedBody: { bytes: 64, sha256: "b".repeat(64) },
};
const textModes = [
	["--find", " Needle "],
	["--lines", "2:3"],
];
const streams: Array<Readable | Writable> = [];

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function captureStreams(raw: Uint8Array) {
	const input = Readable.from([raw.subarray(0, 11), raw.subarray(11)], {
		objectMode: false,
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const stream of [input, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

async function rejectsBeforeInput(args: string[]) {
	expect(() => parseResearchReplayArguments(args)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	const target = captureStreams(Uint8Array.of(123));
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
		runResearchReplayCli(args, target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	for (const operation of operations) expect(operation).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
}

async function fixture(source: string, mime: string) {
	const body = new TextEncoder().encode(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		raw,
		body,
		args: [
			"--expected-profile",
			"default",
			"--receipt-sha256",
			hash(raw),
			"--body-sha256",
			hash(body),
			"--body-bytes",
			String(body.byteLength),
		],
	};
}

function textContent(node: ExtractedNode): string {
	return node.type === "text"
		? (node.text ?? "")
		: (node.children ?? []).map(textContent).join("");
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "No replay network"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Replay must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const stream of streams.splice(0)) stream.destroy();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

it.each([
	"x",
	" MiXeD query ",
	" ",
	"\t",
	"\u0000",
	"\u2028",
	"a.*[b]",
	"<main>&amp;</main>",
	'"a,b",{"key":1}',
	"--lines",
	"--find",
	"--format",
	"--recover-output-limit",
	"x".repeat(256),
	"😀".repeat(128),
])("preserves literal find query %j with absent or explicit JSON", (query) => {
	for (const flags of [[], ["--format", "json"]]) {
		expect(
			parseResearchReplayArguments([...pins, "--find", query, ...flags]),
		).toEqual({
			trusted,
			selection: { find: query },
			...(flags.length ? { format: "json" } : {}),
		});
	}
});

it.each([
	{ value: "1:1", start: 1, end: 1 },
	{ value: "2:3", start: 2, end: 3 },
	{ value: "1:2000001", start: 1, end: 2_000_001 },
	{ value: "2000001:2000001", start: 2_000_001, end: 2_000_001 },
])(
	"parses inclusive range $value in all allowed formats",
	({ value, start, end }) => {
		for (const format of [undefined, "json", "markdown"]) {
			const flags = format === undefined ? [] : ["--format", format];
			for (const args of [
				[...pins, "--lines", value, ...flags],
				[...flags, "--lines", value, ...pins],
			]) {
				expect(parseResearchReplayArguments(args)).toEqual({
					trusted,
					selection: { lines: { start, end } },
					...(format === undefined ? {} : { format }),
				});
			}
		}
	},
);

it.each([
	"",
	"\r",
	"\n",
	"x\r\ny",
	"x\ny",
	"x\ry",
	"x".repeat(257),
	"😀".repeat(129),
])("rejects invalid find query %j before touching streams", async (query) =>
	rejectsBeforeInput([...pins, "--find", query]),
);

it.each([
	"",
	"1",
	"1:",
	":1",
	"1:2:3",
	"0:1",
	"1:0",
	"2:1",
	"01:2",
	"1:02",
	"+1:2",
	"1:+2",
	"-1:2",
	"1:-2",
	"1.0:2",
	"1:2.0",
	"1e0:2",
	"1:2e0",
	"0x1:2",
	"1:0x2",
	"1_0:20",
	"1:2_0",
	" 1:2",
	"1:2 ",
	"1 :2",
	"1: 2",
	"1:\t2",
	"1:2\n",
	"1:2\r",
	"1:2\u2028",
	"１:２",
	"1:2000002",
	"2000002:2000002",
	"1:9999999",
	"1:10000000",
	"10000000:10000000",
	"1:9007199254740992",
	"NaN:2",
	"1:Infinity",
])(
	"rejects noncanonical or out-of-bounds range %j before input",
	async (value) => {
		await rejectsBeforeInput([...pins, "--lines", value]);
	},
);

it.each(
	textModes.flatMap((mode) =>
		[
			["--find", "other"],
			["--lines", "1:1"],
			["--selector", "main"],
			["--section", "#owned"],
			["--links", "next"],
			["--headings"],
			["--recover-output-limit"],
			["--table-metadata"],
			["--table-rows"],
			["--format", "json", "--table-rows"],
			["--format", "markdown", "--table-rows"],
			["--format", "json", "--table-metadata"],
			["--format", "markdown", "--table-metadata"],
			["--format"],
			["--format", "html"],
			["--format", "JSON"],
			["--format", "json", "--format", "json"],
		].map((extra) => ({ mode, extra })),
	),
)(
	"rejects mixed or duplicate text arguments $mode $extra before input",
	async ({ mode, extra }) => {
		await rejectsBeforeInput([...pins, ...mode, ...extra]);
		await rejectsBeforeInput([...pins, ...extra, ...mode]);
	},
);

it.each(textModes.map((mode) => ({ mode })))(
	"rejects long profile and missing pins for $mode before input",
	async ({ mode }) => {
		await rejectsBeforeInput([pins[0], "long-v1", ...pins.slice(2), ...mode]);
		for (let index = 0; index < pins.length; index += 2) {
			await rejectsBeforeInput([
				...pins.slice(0, index),
				...pins.slice(index + 2),
				...mode,
			]);
		}
	},
);

it.each(
	[
		["--find"],
		["--lines"],
		["--find=value"],
		["--lines=1:2"],
		["--find", "query", "--format", "markdown"],
	].map((mode) => ({ mode })),
)(
	"rejects incomplete or unsupported mode $mode before input",
	async ({ mode }) => {
		await rejectsBeforeInput([...pins, ...mode]);
	},
);

it.each(["text/plain", "text/markdown", "text/csv"])(
	"replays literal discovery and JSON/Markdown lines from pinned %s without requests",
	async (mime) => {
		const selected =
			'  Needle <tag>&literal</tag>,"a,b"\r\nneedle Needleless\r\n';
		const source = `Outside prefix\r\n${selected}  Needle second\r\nOutside suffix`;
		const saved = await fixture(source, mime);
		const original = saved.raw.slice();
		for (const mode of [
			["--find", " Needle "],
			["--find", " Needle ", "--format", "json"],
			["--lines", "2:3"],
			["--lines", "2:3", "--format", "json"],
			["--lines", "2:3", "--format", "markdown"],
		]) {
			const target = captureStreams(saved.raw);
			expect(
				await runResearchReplayCli(
					[...saved.args, ...mode],
					target.input,
					target.output,
				),
			).toBe(0);
			const output = JSON.parse(target.text());
			expect(output).toMatchObject({
				kind: "native-research-json-replay-v1",
				partial: true,
				contentSuccess: null,
				outcome: "extracted-unverified",
				networkRequests: 0,
				source: {
					profile: "default",
					receiptSha256: hash(saved.raw),
					body: { bytes: saved.body.byteLength, sha256: hash(saved.body) },
				},
			});
			if (mode[0] === "--find") {
				expect(output.selection).toEqual({
					method: "text-line-discovery",
					matches: 2,
				});
				expect(output.textLines).toMatchObject({
					method: "text-line-discovery",
					partial: true,
					entries: [
						{ line: 2, column: 2 },
						{ line: 4, column: 2 },
					],
					matchedLines: 2,
					totalLines: 5,
					sourceCodeUnits: source.length,
					truncated: false,
				});
				expect(output).not.toHaveProperty("extraction");
			} else {
				expect(output.selection).toEqual({ method: "text-lines", matches: 2 });
				expect(output).not.toHaveProperty("textLines");
				expect(output.extraction.textSelection).toEqual({
					method: "text-lines",
					start: 2,
					end: 3,
					totalLines: 5,
					sourceCodeUnits: source.length,
					selectedCodeUnits: selected.length,
				});
				if (mode.includes("markdown")) {
					expect(output.extraction.format).toBe("markdown");
					expect(output.extraction.content).toContain(
						selected.replace(/\r\n/g, "\n"),
					);
				} else {
					expect(output.extraction.format).toBe("json");
					expect(textContent(output.extraction.content)).toBe(
						selected.replace(/\r\n/g, "\n"),
					);
				}
				expect(JSON.stringify(output.extraction)).not.toContain("Outside");
			}
			expect(target.text().trim().split("\n")).toHaveLength(1);
			expect(Buffer.byteLength(target.text())).toBeLessThanOrEqual(
				researchJsonReplayLimits.maxOutputBytes,
			);
			expect(target.output.listenerCount("close")).toBe(0);
			expect(target.output.listenerCount("error")).toBe(1);
		}
		expect(saved.raw).toEqual(original);
	},
);

it("returns an empty unverified discovery without extraction for a case-sensitive miss", async () => {
	const saved = await fixture("Needle\nNEEDLE", "text/plain");
	const target = captureStreams(saved.raw);
	expect(
		await runResearchReplayCli(
			[...saved.args, "--find", "needle"],
			target.input,
			target.output,
		),
	).toBe(1);
	const output = JSON.parse(target.text());
	expect(output).toMatchObject({
		partial: true,
		contentSuccess: false,
		outcome: "empty-extraction",
		networkRequests: 0,
		selection: { method: "text-line-discovery", matches: 0 },
		textLines: { entries: [], matchedLines: 0, truncated: false },
	});
	expect(output).not.toHaveProperty("extraction");
});

it("rejects a beyond-source range and closes streams without output", async () => {
	const saved = await fixture("First\nLast", "text/plain");
	const original = saved.raw.slice();
	const target = captureStreams(saved.raw);
	await expect(
		runResearchReplayCli(
			[...saved.args, "--lines", "1:3"],
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "not-found" });
	expect(target.text()).toBe("");
	expect(target.input.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
	expect(saved.raw).toEqual(original);
});

it.each(textModes.map((mode) => ({ mode })))(
	"preserves pre-aborted cleanup for $mode without reading",
	async ({ mode }) => {
		const controller = new AbortController();
		controller.abort();
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		await expect(
			runResearchReplayCli(
				[...pins, ...mode],
				target.input,
				target.output,
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	},
);
