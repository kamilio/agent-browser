import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as evidence from "../scripts/research-admission-evidence.js";
import * as navigation from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	type ResearchLongContentReport,
	parseResearchLongContentArguments,
	researchLongContent,
	researchLongContentLimits,
	runResearchLongContentCli,
} from "../scripts/research-long-content.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchLongDocumentAdmission } from "./research-admission.js";

const url = "https://long-content.fixture.invalid/article";
const article =
	'<main id="owned"><p>Saved introduction: café.</p><table><tr><th>Name</th></tr><tr><td>Owned row</td></tr></table></main><div id="empty"></div>';
const headed = `<h1>Saved heading</h1>${article}`;
const privateFailure = "PRIVATE_LONG_CONTENT_FAILURE";
const originalNavigation = navigation.researchNavigation;
const originalSerialize = evidence.serializeResearchReport;
const originalExtract = replay.extractResearchReplayJson;
const outputs: Writable[] = [];
const completions: Array<() => void> = [];
const controllers: AbortController[] = [];
const receipts: Array<{ sha256: string; bytes: number; report: string }> = [];

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function response(
	source = headed,
	options: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...options,
	};
}

function serve(source = headed, options: Partial<NetworkResponse> = {}) {
	const value = response(source, options);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		value,
	);
	return value;
}

function controller() {
	const value = new AbortController();
	controllers.push(value);
	return value;
}

function sink(
	options: { held?: boolean; throws?: boolean; emitClose?: boolean } = {},
) {
	const chunks: Buffer[] = [];
	const callbacks: Array<(error?: Error) => void> = [];
	const output = new Writable({
		highWaterMark: 1,
		emitClose: options.emitClose ?? true,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			let completed = false;
			const complete = (error?: Error) => {
				if (completed) return;
				completed = true;
				callback(error);
			};
			callbacks.push(complete);
			completions.push(() => complete());
			if (options.throws) throw new Error(privateFailure);
			if (!options.held) complete();
		},
	});
	output.on("error", () => undefined);
	outputs.push(output);
	return {
		output,
		chunks,
		callbacks,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(output: Writable) {
	return new Map(
		output.eventNames().map((name) => [name, output.listeners(name)]),
	);
}

async function turns() {
	for (let turn = 0; turn < 16; turn++)
		await new Promise<void>((resolve) => process.nextTick(resolve));
}

function observe<Result>(operation: Promise<Result>) {
	let outcome: { value: Result } | { error: unknown } | undefined;
	void operation.then(
		(value) => {
			outcome = { value };
		},
		(error: unknown) => {
			outcome = { error };
		},
	);
	return {
		get outcome() {
			return outcome;
		},
	};
}

function sanitized(error: unknown) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected a sanitized workflow error");
	expect(error.message.length).toBeGreaterThan(0);
	expect(error.message.toLowerCase()).not.toContain(
		privateFailure.toLowerCase(),
	);
	expect(error.stack?.toLowerCase()).not.toContain(
		privateFailure.toLowerCase(),
	);
	expect(error.cause).toBeUndefined();
	expect(JSON.stringify(error).toLowerCase()).not.toContain(
		privateFailure.toLowerCase(),
	);
	return error;
}

async function failedWrite(operation: ReturnType<typeof observe<number>>) {
	await turns();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	return sanitized(outcome && "error" in outcome ? outcome.error : undefined);
}

function noReplay() {
	expect(replay.extractResearchReplayJson).not.toHaveBeenCalled();
	expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
}

function unverified(report: ResearchLongContentReport) {
	expect(report).toMatchObject({
		kind: "native-research-long-content-v1",
		partial: true,
		outcome: "extracted-unverified",
		contentSuccess: null,
		replay: {
			kind: "native-research-json-replay-v1",
			partial: true,
			outcome: "extracted-unverified",
			contentSuccess: null,
			networkRequests: 0,
			selection: { method: "css-selector", matches: 1 },
			extraction: { format: "markdown", tableRows: true },
			reader: { partial: true, scripting: false, styling: false },
		},
	});
	expect(report.failure).toBeUndefined();
	const json = JSON.stringify(report);
	expect(json).not.toMatch(
		/"(?:contentSuccess|renderingVerified|factsVerified|verified)":true/,
	);
	expect(report.capture).not.toHaveProperty("bodyCapture");
	expect(report.capture).not.toHaveProperty("receipt");
	expect(Buffer.byteLength(json)).toBeLessThan(65_536);
}

async function preserved(report: ResearchLongContentReport) {
	const call = vi.mocked(navigation.researchNavigation).mock.results[0];
	expect(call.type).toBe("return");
	const capture = await call.value;
	expect(report.capture).toMatchObject({
		outcome: capture.outcome,
		contentSuccess: capture.contentSuccess,
		classification: capture.classification,
		metrics: { active: 0, closed: true },
	});
	expect(report.capture.failure).toEqual(capture.failure);
	expect(report.capture.metrics).toEqual(capture.metrics);
	expect(report.capture.primaryResponse).toEqual(capture.primaryResponse);
	expect(report.capture.rateLimit).toEqual(capture.rateLimit);
	expect(report.capture).not.toHaveProperty("bodyCapture");
	expect(report.capture).not.toHaveProperty("receipt");
	if (receipts.length) {
		expect(JSON.stringify(capture)).toBe(receipts[0].report);
		expect(report.capture).toMatchObject({
			receiptSha256: receipts[0].sha256,
			receiptBytes: receipts[0].bytes,
		});
	}
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	return capture;
}

beforeEach(() => {
	receipts.length = 0;
	vi.spyOn(globalThis, "setTimeout");
	vi.spyOn(globalThis, "clearTimeout");
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(navigation, "researchNavigation");
	vi.spyOn(evidence, "serializeResearchReport").mockImplementation(
		(report, profile) => {
			const serialized = originalSerialize(report, profile);
			receipts.push({
				sha256: hash(serialized.jsonl),
				bytes: serialized.jsonl.byteLength,
				report: JSON.stringify(report),
			});
			return serialized;
		},
	);
	vi.spyOn(replay, "extractResearchReplayJson");
	vi.spyOn(replay, "recoverResearchEmptyOutlineSelector");
	vi.spyOn(replay, "recoverResearchOutputLimitSelector");
	vi.spyOn(replay, "recoverResearchOutputLimitSection");
	vi.spyOn(replay, "outlineResearchOutputLimitCapture");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Long-content tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(replay.recoverResearchOutputLimitSelector).not.toHaveBeenCalled();
		expect(replay.recoverResearchOutputLimitSection).not.toHaveBeenCalled();
		expect(replay.outlineResearchOutputLimitCapture).not.toHaveBeenCalled();
		for (const [index, args] of vi.mocked(setTimeout).mock.calls.entries()) {
			if (args[1] === researchLongContentLimits.timeoutMs)
				expect(clearTimeout).toHaveBeenCalledWith(
					vi.mocked(setTimeout).mock.results[index].value,
				);
		}
	} finally {
		for (const value of controllers.splice(0)) value.abort();
		for (const complete of completions.splice(0)) complete();
		for (const output of outputs.splice(0)) output.destroy();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("long-content arguments", () => {
	it.each([
		{ args: [url], selector: "body" },
		{ args: [url, "--selector", "#owned"], selector: "#owned" },
		{ args: ["--selector", "#owned", url], selector: "#owned" },
	])(
		"accepts one URL with an explicit or default selector: $args",
		({ args, selector }) => {
			expect(parseResearchLongContentArguments(args)).toEqual({
				url,
				selector,
			});
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		},
	);

	it.each([
		[],
		[url, url],
		["--selector", "body"],
		[url, "--selector"],
		[url, "--selector", "body", "--selector", "#owned"],
		[url, "--unknown"],
		[url, "--reader"],
		[url, "--recover-empty-outline"],
		[url, "--selector", ""],
		[url, "--selector", "   "],
		[url, "--selector", " body"],
		[url, "--selector", "body "],
		[url, "--selector", "\tbody\n"],
		[url, "--selector", "["],
		[url, "--selector", "body::before"],
		[url, "--selector", "body::after"],
		[url, "--selector", "body:before"],
		[url, "--selector", "x".repeat(4097)],
		["not-a-url"],
		["file:///etc/passwd"],
		["https://user:password@example.com/"],
		["http://127.0.0.1/"],
		["http://[::1]/"],
		[`https://example.com/${"x".repeat(4096)}`],
	])("rejects invalid arguments before capture %#", async (...args) => {
		expect(() => parseResearchLongContentArguments(args)).toThrow(
			AgentBrowserError,
		);
		await expect(researchLongContent(args)).rejects.toBeInstanceOf(
			AgentBrowserError,
		);
		const target = sink();
		const before = listeners(target.output);
		await expect(
			runResearchLongContentCli(args, target.output),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual(before);
		expect(navigation.researchNavigation).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		noReplay();
	});

	it("does not echo an unsupported selector in argument errors", async () => {
		const args = [url, "--selector", `body:${privateFailure}`];
		const operation = observe(researchLongContent(args));
		await turns();
		const outcome = operation.outcome;
		expect(outcome).toHaveProperty("error");
		sanitized(outcome && "error" in outcome ? outcome.error : undefined);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		noReplay();
	});
});

describe("one-shot long-content capture and strict replay", () => {
	it("captures headings once, closes before replay, and pins the generated receipt and original body", async () => {
		const value = serve();
		const report = await researchLongContent([url]);
		unverified(report);
		const capture = await preserved(report);
		expect(navigation.researchNavigation).toHaveBeenCalledExactlyOnceWith(
			url,
			true,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			true,
			undefined,
			"long-v1",
			expect.objectContaining({
				readerRawPolicy: "separate-omitted-raw-v1",
				readerVisibilityPolicy: "source-hidden-inline-v1",
				readerFallbackEncoding: "utf-8",
				minRequestIntervalMs: 2000,
			}),
		);
		expect(evidence.serializeResearchReport).toHaveBeenCalledExactlyOnceWith(
			capture,
			"long-v1",
		);
		expect(replay.extractResearchReplayJson).toHaveBeenCalledExactlyOnceWith(
			expect.any(Uint8Array),
			{
				expectedProfile: "long-v1",
				expectedReceiptSha256: receipts[0].sha256,
				expectedBody: {
					bytes: value.body.byteLength,
					sha256: hash(value.body),
				},
			},
			{ selector: "body", tableRows: true },
			undefined,
			"markdown",
		);
		expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
		expect(
			vi.mocked(NodeNetworkTransport.prototype.close).mock
				.invocationCallOrder[0],
		).toBeLessThan(
			vi.mocked(replay.extractResearchReplayJson).mock.invocationCallOrder[0],
		);
		expect(report.replay?.source).toMatchObject({
			profile: "long-v1",
			receiptSha256: receipts[0].sha256,
			body: { bytes: value.body.byteLength, sha256: hash(value.body) },
		});
		expect(report.capture).toMatchObject({
			receiptSha256: receipts[0].sha256,
			receiptBytes: receipts[0].bytes,
			receiptDisposition: "complete",
			body: { bytes: value.body.byteLength, sha256: hash(value.body) },
		});
		expect(report.replay?.extraction?.content).toContain("Owned row");
	});

	it("recovers only the empty outline and preserves its unsuccessful original outcome", async () => {
		serve(article);
		const report = await researchLongContent([url, "--selector", "#owned"]);
		unverified(report);
		const capture = await preserved(report);
		expect(capture).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
			headings: { entries: [], truncated: false },
		});
		expect(replay.extractResearchReplayJson).not.toHaveBeenCalled();
		expect(
			replay.recoverResearchEmptyOutlineSelector,
		).toHaveBeenCalledExactlyOnceWith(
			expect.any(Uint8Array),
			expect.objectContaining({ expectedProfile: "long-v1" }),
			{ selector: "#owned", tableRows: true },
			undefined,
			"markdown",
		);
		expect(report.replay?.recovery).toMatchObject({
			kind: "captured-empty-outline-selector",
			originalOutcome: "empty-extraction",
			originalContentSuccess: false,
			originalRequestRetried: false,
			originalDiscovery: {
				method: "heading-outline",
				entries: 0,
				truncated: false,
			},
		});
		expect(report.replay?.extraction?.content).toContain("Owned row");
	});

	it("admits more than 2MB of inert source without putting the body or receipt into the result", async () => {
		const inert = "INERT_SOURCE_NOT_CONTENT_".repeat(90_000);
		const value = serve(
			`<script type="application/json">${inert}</script>${headed}`,
		);
		expect(value.body.byteLength).toBeGreaterThan(2_000_000);
		expect(value.body.byteLength).toBeLessThan(
			researchLongDocumentAdmission.maxCaptureBytes,
		);
		const report = await researchLongContent([url, "--selector", "#owned"]);
		unverified(report);
		const capture = await preserved(report);
		expect(capture.bodyCapture?.decodedBytes).toBe(value.body.byteLength);
		expect(receipts[0].bytes).toBeGreaterThan(2_000_000);
		expect(JSON.stringify(report)).not.toContain("INERT_SOURCE_NOT_CONTENT_");
		expect(capture.bodyCapture).toBeDefined();
		expect(JSON.stringify(report)).not.toContain(capture.bodyCapture?.data);
		expect(report.replay?.source.body).toEqual({
			bytes: value.body.byteLength,
			sha256: hash(value.body),
		});
	});

	it("keeps UTF-8 fallback, omitted raw text and inline-hidden text out of the selected content", async () => {
		serve(
			`<h1>Heading</h1><main id="owned"><p>Visible café.</p><p style="display:none">HIDDEN_SENTINEL</p><script>RAW_SENTINEL</script><style>.RAW_STYLE_SENTINEL{}</style></main>`,
			{
				headers: { "content-type": ["text/html"] },
			},
		);
		const report = await researchLongContent([url, "--selector", "#owned"]);
		unverified(report);
		await preserved(report);
		const extracted = report.replay?.extraction?.content;
		expect(extracted).toContain("Visible café\\.");
		expect(extracted).not.toContain("HIDDEN_SENTINEL");
		expect(extracted).not.toContain("RAW_SENTINEL");
		expect(extracted).not.toContain("RAW_STYLE_SENTINEL");
	});

	it.each([
		{ selector: "#missing", category: "not-found" },
		{ selector: "main, #empty", category: "invalid-input" },
	])(
		"fails a nonunique selection without retry: $selector",
		async ({ selector, category }) => {
			serve();
			const report = await researchLongContent([url, "--selector", selector]);
			expect(report).toMatchObject({
				contentSuccess: false,
				failure: { category, stage: expect.any(String) },
			});
			expect(report.outcome).not.toBe("extracted-unverified");
			await preserved(report);
			expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
			expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
		},
	);

	it.each([headed, article])(
		"reports empty selection without fallback %#",
		async (source) => {
			serve(source);
			const report = await researchLongContent([url, "--selector", "#empty"]);
			expect(report).toMatchObject({
				outcome: "empty-extraction",
				contentSuccess: false,
				failure: { category: "not-found", stage: "replay" },
				replay: {
					outcome: "empty-extraction",
					contentSuccess: false,
					networkRequests: 0,
				},
			});
			await preserved(report);
			expect(replay.extractResearchReplayJson).toHaveBeenCalledTimes(
				source === headed ? 1 : 0,
			);
			expect(replay.recoverResearchEmptyOutlineSelector).toHaveBeenCalledTimes(
				source === article ? 1 : 0,
			);
		},
	);
});

describe("capture and admission failure boundaries", () => {
	it("labels a replay barrier separately from the original successful capture", async () => {
		serve();
		vi.mocked(replay.extractResearchReplayJson).mockImplementationOnce(
			(...args) => {
				const extracted = originalExtract(...args);
				return {
					...extracted,
					report: {
						...extracted.report,
						outcome: "semantic-barrier",
						contentSuccess: false,
						classification: { barrier: "challenge", diagnostic: null },
					},
				};
			},
		);
		const report = await researchLongContent([url]);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			capture: { outcome: "extracted-unverified", contentSuccess: null },
			failure: { category: "policy-denied", stage: "replay" },
			replay: { outcome: "semantic-barrier", contentSuccess: false },
		});
		await preserved(report);
		expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
		expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
	});

	it.each([
		{
			status: 403,
			headers: { "cf-mitigated": ["challenge"] },
			outcome: "semantic-barrier",
		},
		{ status: 500, headers: {}, outcome: "http-failure" },
		{
			status: 429,
			headers: { "retry-after": ["60"] },
			outcome: "http-failure",
		},
	])(
		"does not replay or retry status $status",
		async ({ status, headers, outcome }) => {
			const responseHeaders: Record<string, readonly string[]> = {
				"content-type": ["text/html"],
			};
			for (const [name, values] of Object.entries(headers))
				if (values !== undefined) responseHeaders[name] = values;
			serve(headed, {
				status,
				headers: responseHeaders,
			});
			const report = await researchLongContent([url]);
			expect(report).toMatchObject({
				contentSuccess: false,
				capture: { outcome },
				failure: { category: expect.any(String), stage: expect.any(String) },
			});
			expect(report.replay).toBeUndefined();
			await preserved(report);
			noReplay();
		},
	);

	it.each(["timeout", "resource-limit", "network-error"] as const)(
		"retains sanitized %s capture failures without retry",
		async (category) => {
			vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
				new AgentBrowserError(category, privateFailure),
			);
			const report = await researchLongContent([url]);
			expect(report).toMatchObject({
				contentSuccess: false,
				failure: { category, stage: expect.any(String) },
				capture: { failure: { category } },
			});
			expect(JSON.stringify(report)).not.toContain(privateFailure);
			expect(report.replay).toBeUndefined();
			await preserved(report);
			noReplay();
		},
	);

	it.each(["body", "response"] as const)(
		"does not replay missing primary %s evidence",
		async (missing) => {
			serve();
			vi.mocked(navigation.researchNavigation).mockImplementationOnce(
				async (...args) => {
					const capture = await originalNavigation(...args);
					if (missing === "body") capture.bodyCapture = undefined;
					else capture.primaryResponse = null;
					return capture;
				},
			);
			const report = await researchLongContent([url]);
			expect(report).toMatchObject({
				contentSuccess: false,
				failure: { category: expect.any(String), stage: expect.any(String) },
			});
			expect(report.replay).toBeUndefined();
			await preserved(report);
			noReplay();
		},
	);

	it("refuses an output-limited serialization instead of using a recovery fallback", async () => {
		serve();
		vi.mocked(evidence.serializeResearchReport).mockImplementationOnce(
			(capture, profile) => ({
				...originalSerialize(capture, profile),
				disposition: "output-limit",
			}),
		);
		const report = await researchLongContent([url]);
		expect(report).toMatchObject({
			contentSuccess: false,
			failure: { category: "resource-limit", stage: expect.any(String) },
		});
		expect(report.replay).toBeUndefined();
		await preserved(report);
		noReplay();
	});

	it("lets strict admission reject an ineligible empty outline rather than accepting its outcome alone", async () => {
		serve(article);
		vi.mocked(navigation.researchNavigation).mockImplementationOnce(
			async (...args) => {
				const capture = await originalNavigation(...args);
				capture.failure = { category: "resource-limit", stage: "extraction" };
				return capture;
			},
		);
		const report = await researchLongContent([url, "--selector", "#owned"]);
		expect(report).toMatchObject({
			contentSuccess: false,
			capture: {
				outcome: "empty-extraction",
				failure: { category: "resource-limit", stage: "extraction" },
			},
			failure: { category: expect.any(String), stage: expect.any(String) },
		});
		expect(report.replay).toBeUndefined();
		await preserved(report);
		expect(replay.extractResearchReplayJson).not.toHaveBeenCalled();
	});

	it("does not trust a body-capture hash in place of independent primary-response identity", async () => {
		serve();
		vi.mocked(navigation.researchNavigation).mockImplementationOnce(
			async (...args) => {
				const capture = await originalNavigation(...args);
				if (!capture.primaryResponse)
					throw new Error("Expected primary response");
				capture.primaryResponse.bodySha256 = "a".repeat(64);
				return capture;
			},
		);
		const report = await researchLongContent([url]);
		expect(report.contentSuccess).toBe(false);
		expect(report.failure).toBeDefined();
		expect(report.replay).toBeUndefined();
		await preserved(report);
		expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
	});

	it("sanitizes unexpected replay errors without retry or recovery", async () => {
		serve();
		vi.mocked(replay.extractResearchReplayJson).mockImplementationOnce(() => {
			throw new Error(privateFailure);
		});
		const report = await researchLongContent([url]);
		expect(report).toMatchObject({
			contentSuccess: false,
			failure: { category: expect.any(String), stage: expect.any(String) },
		});
		expect(JSON.stringify(report)).not.toContain(privateFailure);
		await preserved(report);
		expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
		expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
	});
});

describe("in-memory long-content CLI lifecycle", () => {
	it.each([
		{ source: headed, selector: "#owned", exitCode: 0 },
		{ source: article, selector: "#owned", exitCode: 0 },
		{ source: headed, selector: "#empty", exitCode: 1 },
	])(
		"writes one bounded JSONL report with exit $exitCode %#",
		async ({ source, selector, exitCode }) => {
			serve(source);
			const target = sink();
			const before = listeners(target.output);
			const cancellation = controller();
			const abortListeners = getEventListeners(cancellation.signal, "abort");
			expect(
				await runResearchLongContentCli(
					[url, "--selector", selector],
					target.output,
					cancellation.signal,
				),
			).toBe(exitCode);
			const text = target.text();
			expect(text.endsWith("\n")).toBe(true);
			expect(text.trimEnd().split("\n")).toHaveLength(1);
			expect(Buffer.byteLength(text)).toBeLessThan(65_536);
			const report = JSON.parse(text);
			expect(report).toMatchObject({
				kind: "native-research-long-content-v1",
				partial: true,
				contentSuccess: exitCode === 0 ? null : false,
			});
			if (exitCode === 0) unverified(report);
			await preserved(report);
			expect(listeners(target.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
		},
	);

	it("waits for a held output callback and removes listeners afterwards", async () => {
		serve();
		const target = sink({ held: true });
		const before = listeners(target.output);
		const operation = observe(runResearchLongContentCli([url], target.output));
		await turns();
		expect(target.callbacks).toHaveLength(1);
		expect(operation.outcome).toBeUndefined();
		target.callbacks[0]();
		await turns();
		expect(operation.outcome).toEqual({ value: 0 });
		expect(listeners(target.output)).toEqual(before);
	});

	it("rejects an oversized final report before writing any output", async () => {
		serve();
		vi.mocked(replay.extractResearchReplayJson).mockImplementationOnce(
			(...args) => {
				const extracted = originalExtract(...args);
				if (!extracted.report.extraction)
					throw new Error("Expected replay extraction");
				return {
					...extracted,
					report: {
						...extracted.report,
						extraction: {
							...extracted.report.extraction,
							title: "x".repeat(researchLongContentLimits.maxOutputBytes + 1),
						},
					},
				};
			},
		);
		const target = sink();
		const before = listeners(target.output);
		const cancellation = controller();
		const operation = observe(
			runResearchLongContentCli([url], target.output, cancellation.signal),
		);
		expect((await failedWrite(operation)).code).toBe("resource-limit");
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toHaveLength(0);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		expect(replay.extractResearchReplayJson).toHaveBeenCalledOnce();
		expect(replay.recoverResearchEmptyOutlineSelector).not.toHaveBeenCalled();
	});

	it.each(["destroyed", "ended"] as const)(
		"rejects an already %s output before requests",
		async (state) => {
			const target = sink();
			if (state === "destroyed") target.output.destroy();
			else target.output.end();
			await turns();
			const before = listeners(target.output);
			const operation = observe(
				runResearchLongContentCli([url], target.output),
			);
			expect((await failedWrite(operation)).code).toBe("closed");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual(before);
			noReplay();
		},
	);

	it.each(["callback", "throw", "close", "abort"] as const)(
		"cleans up a %s during output without leaking error text",
		async (failure) => {
			serve();
			const target = sink({ held: true, throws: failure === "throw" });
			const before = listeners(target.output);
			const cancellation = controller();
			const abortListeners = getEventListeners(cancellation.signal, "abort");
			const operation = observe(
				runResearchLongContentCli([url], target.output, cancellation.signal),
			);
			await turns();
			expect(target.callbacks).toHaveLength(1);
			if (failure === "callback")
				target.callbacks[0](new Error(privateFailure));
			if (failure === "close") target.output.destroy();
			if (failure === "abort") cancellation.abort(new Error(privateFailure));
			const error = await failedWrite(operation);
			expect(error.code).toBe(failure === "abort" ? "aborted" : "closed");
			expect(listeners(target.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		},
	);

	it("preserves caller-owned listeners on abort when emitClose is false", async () => {
		serve();
		const target = sink({ held: true, emitClose: false });
		for (const event of ["close", "drain", "finish"])
			target.output.on(event, () => undefined);
		const before = listeners(target.output);
		const cancellation = controller();
		const callerAbort = vi.fn();
		cancellation.signal.addEventListener("abort", callerAbort);
		const abortListeners = getEventListeners(cancellation.signal, "abort");
		const operation = observe(
			runResearchLongContentCli([url], target.output, cancellation.signal),
		);
		await turns();
		expect(target.callbacks).toHaveLength(1);
		expect(operation.outcome).toBeUndefined();
		cancellation.abort(new Error(privateFailure));
		expect((await failedWrite(operation)).code).toBe("aborted");
		expect(target.output.destroyed).toBe(false);
		expect(target.output.writableEnded).toBe(false);
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toEqual(
			abortListeners,
		);
		expect(callerAbort).toHaveBeenCalledOnce();
		target.callbacks[0]();
		await turns();
		expect(target.output.destroyed).toBe(false);
		expect(listeners(target.output)).toEqual(before);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	});

	it("pre-aborts without a request or replay and sanitizes the reason", async () => {
		const cancellation = controller();
		cancellation.abort(new Error(privateFailure));
		const result = observe(researchLongContent([url], cancellation.signal));
		await turns();
		const outcome = result.outcome;
		expect(outcome).toBeDefined();
		expect(outcome).toHaveProperty("error");
		expect(
			sanitized(outcome && "error" in outcome ? outcome.error : undefined).code,
		).toBe("aborted");
		const target = sink();
		const before = listeners(target.output);
		expect(
			(
				await failedWrite(
					observe(
						runResearchLongContentCli(
							[url],
							target.output,
							cancellation.signal,
						),
					),
				)
			).code,
		).toBe("aborted");
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toHaveLength(0);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		noReplay();
	});

	it("cancels during capture, closes transport, and never replays or retries", async () => {
		const cancellation = controller();
		vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
			async () => {
				cancellation.abort(new Error(privateFailure));
				throw new AgentBrowserError("aborted", privateFailure);
			},
		);
		const target = sink();
		const before = listeners(target.output);
		const operation = observe(
			runResearchLongContentCli([url], target.output, cancellation.signal),
		);
		expect((await failedWrite(operation)).code).toBe("aborted");
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toHaveLength(0);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		noReplay();
	});
});
