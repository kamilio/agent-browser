import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	researchNavigation,
	type ResearchExecutionOptions,
} from "../scripts/research-browser.js";
import {
	extractResearchReplayJson,
	recoverResearchLoaderLimit,
	type ResearchJsonReplaySelection,
	researchJsonReplayLimits,
} from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";

const url = "https://loader-replay.fixture.invalid/article?item=17";
const html =
	'<title>Owned capture</title><main id="owned"><h2 id="section">Owned topic</h2><p>Known synthetic content 😀.</p><h2>Next topic</h2><p>Later content.</p></main>';
const streams: Array<Readable | Writable> = [];

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected loader replay fetch");
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

async function fixture(source = html, options: ResearchExecutionOptions = {}) {
	const body = new TextEncoder().encode(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	});
	const failedLoader = vi
		.spyOn(loader, "loadResearchDocument")
		.mockImplementationOnce(() => {
			throw new AgentBrowserError(
				"resource-limit",
				"Synthetic loader work bound",
			);
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
		{ ...options, minRequestIntervalMs: 0 },
	);
	failedLoader.mockRestore();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "resource-limit", stage: "loader" },
		metrics: { active: 0, closed: true },
	});
	expect(report).not.toHaveProperty("reader");
	const serialized = admission.serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	vi.clearAllMocks();
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.length, sha256: hash(body) },
		},
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const selections: ResearchJsonReplaySelection[] = [
	{ selector: "#owned" },
	{ section: "#section" },
	{ contentFocus: "main-content-v3" },
];

describe("explicit loader-failure replay", () => {
	for (const format of ["json", "markdown"] as const) {
		it.each(selections)(
			`recovers %j as ${format} without rewriting the source failure`,
			async (selection) => {
				const input = await fixture();
				const before = input.raw.slice();
				const admitted = vi.spyOn(
					admission,
					"validateResearchLoaderLimitAdmission",
				);
				const close = vi.spyOn(DocumentTree.prototype, "close");
				const result = recoverResearchLoaderLimit(
					input.raw,
					input.trusted,
					selection,
					undefined,
					format,
				);
				expect(result.report).toMatchObject({
					outcome: "extracted-unverified",
					networkRequests: 0,
					source: {
						capturedOutcome: "failure",
						reportedFinalUrl:
							"https://loader-replay.fixture.invalid/article?redacted",
						body: input.trusted.expectedBody,
					},
					recovery: {
						kind: "captured-loader-limit",
						originalOutcome: "failure",
						originalContentSuccess: false,
						originalFailure: input.report.failure,
						originalRequestRetried: false,
					},
				});
				expect(result.report.extraction?.format).toBe(format);
				expect(JSON.stringify(result.report.extraction)).toContain(
					"Known synthetic content",
				);
				expect(JSON.parse(result.jsonl)).toEqual(result.report);
				expect(result.outputBytes).toBe(Buffer.byteLength(result.jsonl));
				expect(result.outputBytes).toBeLessThanOrEqual(
					researchJsonReplayLimits.maxOutputBytes,
				);
				expect(input.raw).toEqual(before);
				expect(close).toHaveBeenCalled();
				expect(admitted).toHaveBeenCalledOnce();
				expect(
					admitted.mock.results[0].value.body.every(
						(value: number) => value === 0,
					),
				).toBe(true);
			},
		);
	}

	it("keeps ordinary replay evidence-only for the same receipt", async () => {
		const input = await fixture();
		expect(
			admission.validateResearchReplayAdmission(input.raw, input.trusted),
		).toMatchObject({ kind: "evidence-only", reason: "native-failure" });
		expect(() =>
			extractResearchReplayJson(input.raw, input.trusted, {
				selector: "#owned",
			}),
		).toThrowError(expect.objectContaining({ code: "policy-denied" }));
	});

	it("honors captured UTF-8 fallback without inventing an original reader", async () => {
		const input = await fixture(html, { readerFallbackEncoding: "utf-8" });
		const result = recoverResearchLoaderLimit(
			input.raw,
			input.trusted,
			{ selector: "#owned" },
			undefined,
			"markdown",
		);
		expect(input.report).not.toHaveProperty("reader");
		expect(result.report.reader).toMatchObject({
			fallbackEncoding: "utf-8",
			encoding: "utf-8",
		});
		expect(JSON.stringify(result.report.extraction)).toContain("😀");
		expect(result.report.source.capturedOutcome).toBe("failure");
	});

	it("honors a captured source heading policy after the original loader failed", async () => {
		const input = await fixture(
			'<main><div role="heading" aria-level="2" id="section">Accessible topic</div><p>Heading body.</p></main>',
			{ sourceHeadingPolicy: "source-aria-heading-v1" },
		);
		const result = recoverResearchLoaderLimit(
			input.raw,
			input.trusted,
			{ section: "#section" },
			undefined,
			"markdown",
		);
		expect(input.report).not.toHaveProperty("reader");
		expect(result.report.reader).toMatchObject({
			sourceHeadingPolicy: "source-aria-heading-v1",
		});
		expect(result.report.source).toMatchObject({
			sourceHeadingPolicy: "source-aria-heading-v1",
			capturedOutcome: "failure",
		});
		expect(result.report.extraction?.content).toBe(
			"## Accessible topic\n\nHeading body\\.\n",
		);
	});

	it("preserves strict output failure and permits explicit complete plain-text recovery", async () => {
		const text = `${"*".repeat(140_000)} final marker`;
		const input = await fixture(`<main>${text}</main>`);
		expect(() =>
			recoverResearchLoaderLimit(
				input.raw,
				input.trusted,
				{ contentFocus: "main-content-v3" },
				undefined,
				"markdown",
			),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
		const result = recoverResearchLoaderLimit(
			input.raw,
			input.trusted,
			{ contentFocus: "main-content-v3", outputLimitPolicy: "text-prefix-v1" },
			undefined,
			"markdown",
		);
		expect(result.report.extraction?.content).toContain(text);
		expect(result.report.extraction?.contentFallback).toMatchObject({
			policy: "text-prefix-v1",
			representation: "indented-plain-text",
			truncated: false,
		});
		expect(result.report.selection.outputLimitPolicy).toBe("text-prefix-v1");
		expect(
			Buffer.byteLength(JSON.stringify(result.report.extraction)),
		).toBeLessThanOrEqual(256_000);
	});

	it("keeps truncation explicit when source text itself exceeds the output quota", async () => {
		const input = await fixture(`<main>${"😀".repeat(80_000)}</main>`);
		const result = recoverResearchLoaderLimit(
			input.raw,
			input.trusted,
			{ selector: "main", outputLimitPolicy: "text-prefix-v1" },
			undefined,
			"markdown",
		);
		expect(result.report.extraction?.contentFallback).toMatchObject({
			truncated: true,
		});
		expect(result.report.extraction?.content).not.toContain("�");
		expect(
			Buffer.byteLength(JSON.stringify(result.report.extraction)),
		).toBeLessThanOrEqual(256_000);
	});

	it("reclassifies challenge content rather than treating recovery as a bypass", async () => {
		const input = await fixture(
			"<title>Just a moment...</title><h1>Checking your browser</h1><main>Selected source</main>",
		);
		const result = recoverResearchLoaderLimit(input.raw, input.trusted, {
			selector: "main",
		});
		expect(result.report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			networkRequests: 0,
			classification: { barrier: "challenge" },
		});
		expect(result.report).not.toHaveProperty("extraction");
	});

	it("does not fabricate content for an empty selected element", async () => {
		const input = await fixture('<main id="owned"></main>');
		const result = recoverResearchLoaderLimit(input.raw, input.trusted, {
			selector: "#owned",
		});
		expect(result.report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
		});
	});

	it.each([
		{ links: "example" },
		{ lines: { start: 1, end: 2 } },
		{ find: "known" },
		{ jsonPointer: "" },
		{ selector: "main", readerMimePolicy: "markdown-html-document-v1" },
		{ selector: "main", sourceLinkLabelPolicy: "source-aria-label-v1" },
	] as ResearchJsonReplaySelection[])(
		"rejects incompatible selection %j before loading",
		async (selection) => {
			const input = await fixture();
			const load = vi.spyOn(loader, "loadResearchDocument");
			expect(() =>
				recoverResearchLoaderLimit(
					input.raw,
					input.trusted,
					selection,
					undefined,
					"markdown",
				),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
			expect(load).not.toHaveBeenCalled();
		},
	);

	it.each(["before", "after load"])(
		"honors cancellation %s and closes admitted documents",
		async (when) => {
			const input = await fixture();
			const controller = new AbortController();
			const close = vi.spyOn(DocumentTree.prototype, "close");
			if (when === "before") controller.abort();
			else {
				const original = loader.loadResearchDocument;
				vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
					(...args) => {
						const tree = original(...args);
						controller.abort();
						return tree;
					},
				);
			}
			expect(() =>
				recoverResearchLoaderLimit(
					input.raw,
					input.trusted,
					{ selector: "#owned" },
					controller.signal,
				),
			).toThrowError(expect.objectContaining({ code: "aborted" }));
			if (when === "after load") expect(close).toHaveBeenCalled();
		},
	);
});

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

describe("loader recovery CLI arguments", () => {
	for (const flag of ["--selector", "--section", "--content-focus"]) {
		for (const format of [undefined, "json", "markdown"] as const) {
			it(`accepts ${flag} with ${format ?? "default"} output`, () => {
				const target =
					flag === "--content-focus" ? "main-content-v3" : "#owned";
				const result = parseResearchReplayArguments([
					...pins,
					flag,
					target,
					"--recover-loader-limit",
					...(format ? ["--format", format] : []),
				]);
				expect(result.recoverLoaderLimit).toBe(true);
				expect(result).not.toHaveProperty("recoverOutputLimit");
			});
		}
	}

	it("allows explicit Markdown prefix recovery with existing table flags", () => {
		const result = parseResearchReplayArguments([
			...pins,
			"--content-focus",
			"main-content-v3",
			"--recover-loader-limit",
			"--format",
			"markdown",
			"--output-limit-policy",
			"text-prefix-v1",
			"--compact-tables",
			"--table-rows",
		]);
		expect(result.selection).toMatchObject({
			outputLimitPolicy: "text-prefix-v1",
			compactTables: true,
			tableRows: true,
		});
	});

	it.each(
		[
			["--recover-loader-limit"],
			["--recover-output-limit"],
			["--recover-empty-outline"],
			["--expected-document-strategy", "native-reader-fallback-v1"],
			["--reader-mime-policy", "markdown-html-document-v1"],
			[
				"--source-link-label-policy",
				"source-aria-label-v1",
				"--format",
				"markdown",
			],
			["--output-limit-policy", "text-prefix-v1"],
		].map((extra) => ({ extra })),
	)("rejects incompatible or duplicate flags $extra", ({ extra }) => {
		expect(() =>
			parseResearchReplayArguments([
				...pins,
				"--selector",
				"main",
				"--recover-loader-limit",
				...extra,
			]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	});

	it.each(
		[
			["--headings"],
			["--links", "example"],
			["--find", "text"],
			["--lines", "1:2"],
		].map((selection) => ({ selection })),
	)(
		"rejects unsupported loader-recovery discovery $selection",
		({ selection }) => {
			expect(() =>
				parseResearchReplayArguments([
					...pins,
					...selection,
					"--recover-loader-limit",
				]),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		},
	);

	it("rejects long-profile loader recovery", () => {
		expect(() =>
			parseResearchReplayArguments([
				"--expected-profile",
				"long-v1",
				...pins.slice(2),
				"--selector",
				"main",
				"--recover-loader-limit",
			]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	});
});

function argumentsFor(input: Fixture, extra: string[] = []) {
	return [
		"--expected-profile",
		"default",
		"--receipt-sha256",
		input.trusted.expectedReceiptSha256,
		"--body-sha256",
		input.trusted.expectedBody.sha256,
		"--body-bytes",
		String(input.body.length),
		"--selector",
		"main",
		"--recover-loader-limit",
		...extra,
	];
}

function memoryStreams(raw: Uint8Array, error?: Error) {
	const input = Readable.from([raw.subarray(0, 7), raw.subarray(7)], {
		objectMode: false,
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback(error);
		},
	});
	for (const stream of [input, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

describe("loader recovery CLI execution", () => {
	it.each(["json", "markdown"])(
		"emits one bounded %s record through memory streams",
		async (format) => {
			const input = await fixture();
			const before = input.raw.slice();
			const io = memoryStreams(input.raw);
			expect(
				await runResearchReplayCli(
					argumentsFor(input, ["--format", format]),
					io.input,
					io.output,
				),
			).toBe(0);
			const report = JSON.parse(io.text());
			expect(report).toMatchObject({
				outcome: "extracted-unverified",
				networkRequests: 0,
				recovery: {
					kind: "captured-loader-limit",
					originalRequestRetried: false,
				},
			});
			expect(report.extraction.format).toBe(format);
			expect(io.text().split("\n")).toHaveLength(2);
			expect(input.raw).toEqual(before);
		},
	);

	it("returns failure for challenge content through the actual dispatch", async () => {
		const input = await fixture(
			"<title>Just a moment...</title><h1>Checking your browser</h1><main>Content</main>",
		);
		const io = memoryStreams(input.raw);
		expect(
			await runResearchReplayCli(argumentsFor(input), io.input, io.output),
		).toBe(1);
		expect(JSON.parse(io.text()).outcome).toBe("semantic-barrier");
	});

	it("refuses bad pins without writing a success record", async () => {
		const input = await fixture();
		const io = memoryStreams(input.raw);
		const args = argumentsFor(input);
		args[args.indexOf("--body-sha256") + 1] = "0".repeat(64);
		await expect(
			runResearchReplayCli(args, io.input, io.output),
		).rejects.toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(io.text()).toBe("");
	});

	it("propagates sink failure without retrying or modifying the receipt", async () => {
		const input = await fixture();
		const before = input.raw.slice();
		const io = memoryStreams(input.raw, new Error("Synthetic sink failure"));
		await expect(
			runResearchReplayCli(argumentsFor(input), io.input, io.output),
		).rejects.toBeInstanceOf(Error);
		expect(input.raw).toEqual(before);
	});
});
