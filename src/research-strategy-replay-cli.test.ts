import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	researchReplayCliLimits,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as fallbackLoader from "./research-fallback-loader.js";

const policy = "native-reader-fallback-v1";
const url = "https://strategy-replay-cli.fixture.invalid/article";
const modes = ["native", "reader"] as const;
const strategyFlag = ["--expected-document-strategy", policy];
const authority = [
	"--expected-profile",
	"default",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
];
const streams: Array<Readable | Writable> = [];
const realFallback = fallbackLoader.loadNativeReaderFallbackDocument;

beforeEach(() => {
	streams.length = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(replay, "extractResearchReplayJson");
	vi.spyOn(replay, "extractResearchStrategyReplayJson");
	vi.spyOn(fallbackLoader, "loadNativeReaderFallbackDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("CLI replay must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const stream of streams) stream.destroy();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function track<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function input(raw: Uint8Array) {
	return track(Readable.from([raw], { objectMode: false }));
}

function sink(write?: (callback: (error?: Error | null) => void) => void) {
	const chunks: Buffer[] = [];
	const output = track(
		new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				if (write) write(callback);
				else callback();
			},
		}),
	);
	return { output, text: () => Buffer.concat(chunks).toString("utf8") };
}

async function fixture(mode: (typeof modes)[number] | "untagged" = "native") {
	const body = new TextEncoder().encode(
		`<!doctype html><html><head><meta charset="utf-8"><title>Owned CLI fixture</title><style>.hidden{display:none}</style></head><body>${mode === "reader" ? "<frame>" : ""}<main id="article"><h1 id="heading">Owned fixture</h1><p>Visible café content for a synthetic replay article. Its substantial main text supports focused content extraction without additional requests.</p><p class="hidden">CSS_ONLY_SENTINEL</p><p hidden>HIDDEN_SENTINEL</p><p style="display:none">INLINE_SENTINEL</p><a href="/guide">Guide</a><table><tr><th>Item</th></tr><tr><td>42</td></tr></table></main></body></html>`,
	);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		elapsedMs: 0,
		redirects: [],
	});
	const report = await researchNavigation(
		url,
		mode === "untagged",
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			...(mode === "untagged" ? {} : { documentStrategy: policy }),
			format: "json",
			minRequestIntervalMs: 0,
		},
	);
	expect(report.outcome).toBe("extracted-unverified");
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	vi.clearAllMocks();
	return {
		raw,
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

it.each([
	["--selector", "main"],
	["--section", "h1"],
	["--content-focus", "main-content-v1"],
	["--content-focus", "main-content-v2"],
	["--content-focus", "main-content-v3"],
	["--links", "guide"],
])("parses explicit strategy HTML selection %j", (...selection) => {
	const options = parseResearchReplayArguments([
		...authority,
		...strategyFlag,
		...selection,
	]);
	expect(options.trusted.expectedDocumentStrategy).toBe(policy);
	expect(options.trusted.expectedProfile).toBe("default");
	expect(options).not.toHaveProperty("recoverOutputLimit");
	expect(options).not.toHaveProperty("recoverEmptyOutline");
});

it.each([
	["--table-metadata"],
	["--format", "markdown"],
	["--format", "markdown", "--table-rows"],
	["--format", "markdown", "--compact-tables"],
	["--format", "markdown", "--compact-tables", "--table-rows"],
])("preserves strategy replay format/table arguments %j", (...options) => {
	expect(
		parseResearchReplayArguments([
			...authority,
			...strategyFlag,
			"--selector",
			"main",
			...options,
		]).trusted.expectedDocumentStrategy,
	).toBe(policy);
});

it.each([
	["--recover-output-limit"],
	["--recover-empty-outline"],
	["--reader-mime-policy", "markdown-html-document-v1"],
	["--format", "markdown", "--output-limit-policy", "text-prefix-v1"],
	[
		"--format",
		"markdown",
		"--source-link-label-policy",
		"source-aria-label-v1",
	],
	["--expected-document-strategy", policy],
	["--expected-document-strategy"],
	["--table-metadata", "--format", "markdown"],
	["--table-rows"],
	["--compact-tables"],
])("rejects incompatible or duplicate strategy arguments %j", (...options) => {
	expect(() =>
		parseResearchReplayArguments([
			...authority,
			...strategyFlag,
			"--selector",
			"main",
			...options,
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	["--headings"],
	["--headings", "--recover-output-limit"],
	["--find", "Owned"],
	["--lines", "1:2"],
	["--json-pointer", "/article"],
	["--links", "guide", "--format", "markdown"],
])("rejects unsupported strategy selection arguments %j", (...selection) => {
	expect(() =>
		parseResearchReplayArguments([...authority, ...strategyFlag, ...selection]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"",
	"native",
	"native-reader-fallback-v2",
	"NATIVE-READER-FALLBACK-V1",
])("rejects invalid expected strategy %j", (value) => {
	expect(() =>
		parseResearchReplayArguments([
			...authority,
			"--selector",
			"main",
			"--expected-document-strategy",
			value,
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it("rejects strategy trust for long-v1", () => {
	const args = [...authority];
	args[1] = "long-v1";
	expect(() =>
		parseResearchReplayArguments([
			...args,
			...strategyFlag,
			"--selector",
			"main",
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it("retains the old argument cap and adds exactly two slots for the strategy flag", () => {
	const reads: string[] = [];
	const argumentsAt = (count: number, strategy: boolean) => {
		const args = Array<string>(count).fill("unrecognized");
		Object.defineProperty(args, 0, {
			get() {
				reads.push("read");
				return strategy ? "--expected-document-strategy" : "unrecognized";
			},
		});
		return args;
	};
	for (const [count, strategy, scans] of [
		[21, false, true],
		[22, false, false],
		[23, true, true],
		[24, true, false],
	] as const) {
		reads.length = 0;
		expect(() =>
			parseResearchReplayArguments(argumentsAt(count, strategy)),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(reads.length > 1).toBe(scans);
	}
});

it("does not introduce strategy trust or change untagged parser shapes", () => {
	expect(
		parseResearchReplayArguments([...authority, "--selector", "main"]),
	).toEqual({
		trusted: {
			expectedProfile: "default",
			expectedReceiptSha256: "a".repeat(64),
			expectedBody: { bytes: 64, sha256: "b".repeat(64) },
		},
		selection: { selector: "main" },
	});
});

it.each(modes)(
	"awaits actual %s strategy replay and writes one bounded JSONL report",
	async (mode) => {
		const value = await fixture(mode);
		const rawCopy = value.raw.slice();
		const target = sink();
		const code = await runResearchReplayCli(
			[...value.args, ...strategyFlag, "--selector", "main"],
			input(value.raw),
			target.output,
		);
		expect(code).toBe(0);
		expect(target.text().trim().split("\n")).toHaveLength(1);
		const report = JSON.parse(target.text());
		expect(report.documentStrategy).toMatchObject({ policy, mode });
		expect(report.source.documentStrategy).toEqual(report.documentStrategy);
		expect(report.source.capturedOutcome).toBe("extracted-unverified");
		expect(report.networkRequests).toBe(0);
		expect(target.text().includes("CSS_ONLY_SENTINEL")).toBe(mode === "reader");
		expect(target.text()).not.toContain("INLINE_SENTINEL");
		expect(Buffer.byteLength(target.text())).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(replay.extractResearchStrategyReplayJson).toHaveBeenCalledOnce();
		expect(replay.extractResearchReplayJson).not.toHaveBeenCalled();
		expect(value.raw).toEqual(rawCopy);
		const call = vi.mocked(replay.extractResearchStrategyReplayJson).mock
			.calls[0];
		expect(call[0]).not.toBe(value.raw);
		expect(call[0].every((byte) => byte === 0)).toBe(true);
		expect(target.output.listenerCount("close")).toBe(0);
		expect(target.output.listenerCount("error")).toBe(1);
	},
);

it.each(modes)(
	"retains %s CLI section Markdown and table extraction",
	async (mode) => {
		const value = await fixture(mode);
		const target = sink();
		expect(
			await runResearchReplayCli(
				[
					...value.args,
					...strategyFlag,
					"--section",
					"#heading",
					"--format",
					"markdown",
					"--table-rows",
					"--compact-tables",
				],
				input(value.raw),
				target.output,
			),
		).toBe(0);
		const report = JSON.parse(target.text());
		expect(report.extraction.format).toBe("markdown");
		expect(report.extraction.content).toContain("42");
		expect(report.selection.method).toBe("heading-section");
	},
);

it.each(modes)(
	"refuses a tagged %s receipt without the explicit CLI flag",
	async (mode) => {
		const value = await fixture(mode);
		const target = sink();
		await expect(
			runResearchReplayCli(
				[...value.args, "--selector", "main"],
				input(value.raw),
				target.output,
			),
		).rejects.toMatchObject({ code: "unsupported" });
		expect(target.text()).toBe("");
		expect(target.output.destroyed).toBe(true);
		expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
		expect(replay.extractResearchStrategyReplayJson).not.toHaveBeenCalled();
	},
);

it("preserves untagged CLI replay but refuses explicit trust on an untagged receipt", async () => {
	const value = await fixture("untagged");
	const target = sink();
	expect(
		await runResearchReplayCli(
			[...value.args, "--selector", "main"],
			input(value.raw),
			target.output,
		),
	).toBe(0);
	expect(JSON.parse(target.text())).not.toHaveProperty("documentStrategy");
	expect(JSON.parse(target.text()).source).not.toHaveProperty(
		"documentStrategy",
	);
	expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
	const denied = sink();
	await expect(
		runResearchReplayCli(
			[...value.args, ...strategyFlag, "--selector", "main"],
			input(value.raw),
			denied.output,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(denied.text()).toBe("");
});

it("returns one for empty strategy link discovery without fallback fetches", async () => {
	const value = await fixture("reader");
	const target = sink();
	expect(
		await runResearchReplayCli(
			[...value.args, ...strategyFlag, "--links", "missing"],
			input(value.raw),
			target.output,
		),
	).toBe(1);
	expect(JSON.parse(target.text()).outcome).toBe("empty-extraction");
});

it("aborts before reading or loading and closes streams", async () => {
	const controller = new AbortController();
	controller.abort();
	const source = track(new Readable({ read() {} }));
	const target = sink();
	await expect(
		runResearchReplayCli(
			[...authority, ...strategyFlag, "--selector", "main"],
			source,
			target.output,
			controller.signal,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(source.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
	expect(replay.extractResearchStrategyReplayJson).not.toHaveBeenCalled();
});

it("preserves the CLI deadline and cleans streams while waiting for input", async () => {
	vi.useFakeTimers();
	const source = track(new Readable({ read() {} }));
	const target = sink();
	const result = runResearchReplayCli(
		[...authority, ...strategyFlag, "--selector", "main"],
		source,
		target.output,
	).catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(researchReplayCliLimits.timeoutMs);
	expect(await result).toMatchObject({ code: "timeout" });
	expect(source.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
	expect(replay.extractResearchStrategyReplayJson).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it.each(modes)(
	"preserves output-close cancellation during actual %s loading",
	async (mode) => {
		const value = await fixture(mode);
		const target = sink();
		let selected: Awaited<ReturnType<typeof realFallback>> | undefined;
		vi.mocked(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).mockImplementationOnce(async (...args) => {
			selected = await realFallback(...args);
			target.output.emit("close");
			return selected;
		});
		await expect(
			runResearchReplayCli(
				[...value.args, ...strategyFlag, "--selector", "main"],
				input(value.raw),
				target.output,
			),
		).rejects.toMatchObject({ code: "closed" });
		expect(selected?.mutationMetrics().closed).toBe(true);
		expect(target.text()).toBe("");
		expect(target.output.destroyed).toBe(true);
	},
);

it("preserves output write failures after strategy replay", async () => {
	const value = await fixture();
	const target = sink((callback) =>
		callback(new Error("Synthetic writer failure")),
	);
	await expect(
		runResearchReplayCli(
			[...value.args, ...strategyFlag, "--selector", "main"],
			input(value.raw),
			target.output,
		),
	).rejects.toMatchObject({ code: "closed" });
	expect(target.output.destroyed).toBe(true);
});
