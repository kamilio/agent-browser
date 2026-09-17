import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchRunLimits } from "../scripts/research-browser.js";
import {
	parseResearchVideoSearchArguments,
	researchVideoSearchLimits,
	runResearchVideoSearchCli,
} from "../scripts/research-video-search.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const query = "local llm hardware";
const url = "https://www.youtube.com/results?search_query=local+llm+hardware";
const args = ["--query", query];
const privateDetail = "PRIVATE_SENTINEL https://user:secret@example.invalid/";
const cleanups: Array<() => void> = [];

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function turn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function videoSource(count = 1, rich = false): string {
	const contents = Array.from({ length: count }, (_, index) => {
		const videoId = `video${String(index).padStart(6, "0")}`;
		return {
			videoRenderer: {
				videoId,
				title: {
					simpleText: rich ? "😀".repeat(512) : "Literal café 😀 source video",
				},
				navigationEndpoint: { watchEndpoint: { videoId } },
				...(rich
					? {
							ownerText: { simpleText: "é".repeat(256) },
							lengthText: { simpleText: "1:23" },
							publishedTimeText: { simpleText: "3 years ago" },
							viewCountText: { simpleText: "1,234 views" },
							detailedMetadataSnippets: [
								{ snippetText: { simpleText: "😀".repeat(1024) } },
							],
						}
					: {}),
			},
		};
	});
	const data = {
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: {
					sectionListRenderer: {
						contents: [{ itemSectionRenderer: { contents } }],
					},
				},
			},
		},
	};
	return `<html><head><script>var ytInitialData = ${JSON.stringify(data)};</script></head><body></body></html>`;
}

function enqueue(source = videoSource(), status = 200, responseUrl = url) {
	const body = new TextEncoder().encode(source);
	const response: NetworkResponse = {
		url: responseUrl,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
}

function sink(held = false, highWaterMark = 1, autoDestroy = false) {
	const chunks: Buffer[] = [];
	const writing = deferred<void>();
	let acknowledge: ((error?: Error) => void) | undefined;
	const complete = (error?: Error) => {
		const callback = acknowledge;
		acknowledge = undefined;
		callback?.(error);
	};
	const output = new Writable({
		autoDestroy,
		highWaterMark,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			acknowledge = callback;
			writing.resolve();
			if (!held) complete();
		},
	});
	cleanups.push(() => {
		output.on("error", () => undefined);
		complete();
		output.destroy();
	});
	return {
		output,
		chunks,
		writing: writing.promise,
		complete,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(output: Writable) {
	return ["error", "close", "finish", "drain"].map((event) =>
		output.listeners(event),
	);
}

function expectOpen(output: Writable) {
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
	expect(output.writableFinished).toBe(false);
}

function record(target: ReturnType<typeof sink>) {
	const text = target.text();
	expect(text.endsWith("\n")).toBe(true);
	expect(text.split("\n")).toHaveLength(2);
	expect(target.chunks).toHaveLength(1);
	expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(
		researchVideoSearchLimits.maxOutputBytes,
	);
	return JSON.parse(text);
}

async function sanitized(pending: Promise<number>, code: ErrorCode) {
	const error = await pending.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
	expect(String(error)).not.toContain("PRIVATE_SENTINEL");
	expect(String(error)).not.toContain("user:secret");
	expect(JSON.stringify(error)).not.toContain("PRIVATE_SENTINEL");
	expect(JSON.stringify(error)).not.toContain("user:secret");
}

function stalledRequest() {
	const started = deferred<AbortSignal>();
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		(request) =>
			new Promise<NetworkResponse>((_resolve, reject) => {
				const signal = request.signal;
				if (!signal) throw new Error("Missing native request signal");
				const abort = () => {
					signal.removeEventListener("abort", abort);
					reject(new AgentBrowserError("aborted", privateDetail));
				};
				signal.addEventListener("abort", abort, { once: true });
				started.resolve(signal);
				if (signal.aborted) abort();
			}),
	);
	return started.promise;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Network is forbidden in source-search CLI tests");
		}),
	);
});

afterEach(async () => {
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		for (const cleanup of cleanups.splice(0)) cleanup();
		await turn();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}
});

describe("source-search CLI reports", () => {
	it("emits one unverified JSONL source result despite an empty native DOM", async () => {
		enqueue();
		const target = sink();
		const controller = new AbortController();
		const callerAbort = vi.fn();
		const callerOutput = vi.fn();
		controller.signal.addEventListener("abort", callerAbort);
		for (const event of ["error", "close", "finish", "drain"])
			target.output.on(event, callerOutput);
		const before = listeners(target.output);
		await expect(
			runResearchVideoSearchCli(args, target.output, controller.signal),
		).resolves.toBe(0);
		expect(record(target)).toMatchObject({
			kind: "native-video-search-v1",
			query,
			url,
			partial: true,
			rendered: false,
			verified: false,
			outcome: "source-results-unverified",
			nativeOutcome: "empty-extraction",
			contentSuccess: null,
			source: {
				status: 200,
				url: "https://www.youtube.com/results?redacted",
			},
			sourceVideos: {
				kind: "youtube-search-video-results-v1",
				scope: "document-source",
				query,
				partial: true,
				rendered: false,
				verified: false,
				entries: [
					{
						videoId: "video000000",
						url: "https://www.youtube.com/watch?v=video000000",
						title: "Literal café 😀 source video",
						source: { offsetBasis: "lf-normalized-utf16" },
					},
				],
			},
			metrics: { active: 0, closed: true },
		});
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
			expect.objectContaining({
				url,
				cookieContext: expect.objectContaining({ credentials: "omit" }),
			}),
		);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
		expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(1);
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(controller.signal, "abort")).toEqual([
			callerAbort,
		]);
		expect(callerAbort).not.toHaveBeenCalled();
		expectOpen(target.output);
	});

	it.each([
		{ name: "empty DOM", source: "<html><body></body></html>" },
		{
			name: "ordinary DOM",
			source: "<main><p>Ordinary source text.</p></main>",
		},
	])("returns one empty-source JSONL report for $name", async ({ source }) => {
		enqueue(source);
		const target = sink();
		await expect(runResearchVideoSearchCli(args, target.output)).resolves.toBe(
			1,
		);
		expect(record(target)).toMatchObject({
			outcome: "empty-source",
			contentSuccess: false,
			partial: true,
			rendered: false,
			verified: false,
		});
		expect(record(target)).not.toHaveProperty("sourceVideos");
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		expectOpen(target.output);
	});

	it.each([404, 500])(
		"does not promote source videos from HTTP %s",
		async (status) => {
			enqueue(videoSource(), status);
			const target = sink();
			await expect(
				runResearchVideoSearchCli(args, target.output),
			).resolves.toBe(1);
			expect(record(target)).toMatchObject({
				outcome: "http-failure",
				nativeOutcome: "http-failure",
				contentSuccess: false,
				source: { status },
			});
			expect(record(target)).not.toHaveProperty("sourceVideos");
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		},
	);

	it("emits a sanitized failure report without retrying a failed native request", async () => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			new Error(privateDetail),
		);
		const target = sink();
		await expect(runResearchVideoSearchCli(args, target.output)).resolves.toBe(
			1,
		);
		expect(record(target)).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			source: null,
		});
		expect(record(target)).not.toHaveProperty("sourceVideos");
		expect(target.text()).not.toContain("PRIVATE_SENTINEL");
		expect(target.text()).not.toContain("user:secret");
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
	});

	it("keeps a real bounded multibyte source fixture below the JSONL byte cap", async () => {
		expect(researchVideoSearchLimits).toMatchObject({
			maxOutputBytes: 65_536,
			timeoutMs: 120_000,
		});
		enqueue(videoSource(20, true));
		const target = sink();
		await expect(runResearchVideoSearchCli(args, target.output)).resolves.toBe(
			0,
		);
		const report = record(target);
		expect(report.sourceVideos.truncated).toBe(true);
		expect(report.sourceVideos.entries.length).toBeGreaterThan(0);
		expect(report.sourceVideos.entries.length).toBeLessThan(20);
		expect(
			Buffer.byteLength(JSON.stringify(report.sourceVideos)),
		).toBeLessThanOrEqual(32_768);
		expect(Buffer.byteLength(target.text())).toBeGreaterThan(
			target.text().length,
		);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
	});
});

describe("source-search CLI admission", () => {
	it("writes help without creating a session or requesting a page", async () => {
		const target = sink();
		const before = listeners(target.output);
		await expect(
			runResearchVideoSearchCli(["--help"], target.output),
		).resolves.toBe(0);
		expect(target.text()).toContain("Usage:");
		expect(target.text()).toContain("--query");
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
		expect(listeners(target.output)).toEqual(before);
		expectOpen(target.output);
	});

	it.each([
		"  café 😀 + &amp; 3 years ago  ",
		"cats&search_query=dogs#watch?v=video000000",
		"x".repeat(256),
		"😀".repeat(128),
	])(
		"preserves valid query text and encodes a sole URL parameter: %j",
		(text) => {
			const parsed = parseResearchVideoSearchArguments(["--query", text]);
			const expectedUrl = new URL("https://www.youtube.com/results");
			expectedUrl.search = new URLSearchParams({
				search_query: text,
			}).toString();
			expect(parsed).toEqual({ query: text, url: expectedUrl.href });
			expect([...new URL(parsed.url).searchParams]).toEqual([
				["search_query", text],
			]);
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		},
	);

	it.each(
		[
			[],
			["--query"],
			[query],
			["--query", query, "extra"],
			["--query", query, "--query", query],
			["--help", "--query", query],
			["--query", query, "--help"],
			["--url", url],
			["--query=example"],
			["--query", ""],
			["--query", " \u00a0 "],
			["--query", "x".repeat(257)],
			["--query", `${"😀".repeat(128)}x`],
			...[
				"\u0000",
				"\t",
				"\n",
				"\r",
				"\u001b",
				"\u007f",
				"\u0085",
				"\u200b",
				"\u202e",
				"\u2066",
				"\ud800",
				"\udc00",
			].map((character) => ["--query", `left${character}right`]),
		].map((values) => ({ values })),
	)(
		"rejects invalid arguments before output or navigation: $values",
		async ({ values }) => {
			const target = sink();
			expect(() => parseResearchVideoSearchArguments(values)).toThrow(
				AgentBrowserError,
			);
			await sanitized(
				runResearchVideoSearchCli(values, target.output),
				"invalid-input",
			);
			expect(target.text()).toBe("");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
			expect(listeners(target.output)).toEqual([[], [], [], []]);
		},
	);

	it.each([null, undefined, {}, ["--query", 123], ["--query", null]])(
		"rejects non-string runtime arguments without coercion: %j",
		async (values) => {
			const target = sink();
			await sanitized(
				runResearchVideoSearchCli(values as unknown as string[], target.output),
				"invalid-input",
			);
			expect(target.text()).toBe("");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		},
	);

	it.each([args, ["--help"]].map((values) => ({ values })))(
		"rejects pre-abort without requests or output: $values",
		async ({ values }) => {
			const controller = new AbortController();
			controller.abort(new Error(privateDetail));
			const target = sink();
			await sanitized(
				runResearchVideoSearchCli(values, target.output, controller.signal),
				"aborted",
			);
			expect(target.text()).toBe("");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(listeners(target.output)).toEqual([[], [], [], []]);
			expectOpen(target.output);
		},
	);

	it.each(["ended", "destroyed", "closed", "errored"])(
		"rejects already %s output before making a request",
		async (state) => {
			const target = sink();
			target.output.on("error", () => undefined);
			if (state === "ended") target.output.end();
			else
				target.output.destroy(
					state === "errored" ? new Error(privateDetail) : undefined,
				);
			if (state !== "destroyed") await turn();
			const before = listeners(target.output);
			await sanitized(runResearchVideoSearchCli(args, target.output), "closed");
			expect(target.text()).toBe("");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(listeners(target.output)).toEqual(before);
		},
	);
});

describe("source-search CLI output lifecycle", () => {
	it.each([1, 1_000_000])(
		"waits for the write callback with highWaterMark %s",
		async (highWaterMark) => {
			enqueue();
			const target = sink(true, highWaterMark);
			const before = listeners(target.output);
			let settled = false;
			const pending = runResearchVideoSearchCli(args, target.output).finally(
				() => {
					settled = true;
				},
			);
			await target.writing;
			await turn();
			expect(settled).toBe(false);
			expect(target.output.writableNeedDrain).toBe(highWaterMark === 1);
			target.complete();
			await expect(pending).resolves.toBe(0);
			expect(listeners(target.output)).toEqual(before);
			expectOpen(target.output);
		},
	);

	it.each(["callback-first", "drain-first"])(
		"requires both acknowledgements when output returns false: %s",
		async (order) => {
			const target = sink();
			let acknowledge: ((error?: Error | null) => void) | undefined;
			vi.spyOn(target.output, "write").mockImplementation(
				(_chunk, callback) => {
					if (typeof callback !== "function")
						throw new Error("Expected write callback");
					acknowledge = callback;
					return false;
				},
			);
			let settled = false;
			const pending = runResearchVideoSearchCli(
				["--help"],
				target.output,
			).finally(() => {
				settled = true;
			});
			await turn();
			expect(acknowledge).toBeTypeOf("function");
			if (order === "callback-first") acknowledge?.();
			else target.output.emit("drain");
			await turn();
			expect(settled).toBe(false);
			if (order === "callback-first") target.output.emit("drain");
			else acknowledge?.();
			await expect(pending).resolves.toBe(0);
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(listeners(target.output)).toEqual([[], [], [], []]);
			expectOpen(target.output);
		},
	);

	it.each(["throw", "callback", "error", "close", "finish"])(
		"sanitizes output %s and removes owned listeners",
		async (cause) => {
			enqueue();
			const target = sink(true);
			const controller = new AbortController();
			if (cause === "throw")
				vi.spyOn(target.output, "write").mockImplementation(() => {
					throw new Error(privateDetail);
				});
			const pending = runResearchVideoSearchCli(
				args,
				target.output,
				controller.signal,
			);
			const rejected = sanitized(pending, "closed");
			if (cause !== "throw") {
				await target.writing;
				if (cause === "callback") target.complete(new Error(privateDetail));
				else target.output.emit(cause, new Error(privateDetail));
			}
			await rejected;
			target.complete();
			await turn();
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(listeners(target.output)).toEqual([[], [], [], []]);
			expectOpen(target.output);
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
			expect(target.text()).not.toContain("PRIVATE_SENTINEL");
		},
	);

	it.each(["abort", "timeout"] as const)(
		"stops a stalled native request on %s without source results",
		async (cause) => {
			const started = stalledRequest();
			const target = sink();
			const controller = new AbortController();
			const pending = runResearchVideoSearchCli(
				args,
				target.output,
				controller.signal,
			);
			const rejected =
				cause === "abort" ? sanitized(pending, "aborted") : undefined;
			const signal = await started;
			if (cause === "abort") controller.abort(new Error(privateDetail));
			else
				await vi.advanceTimersByTimeAsync(
					researchRunLimits.navigationTimeoutMs,
				);
			if (rejected) await rejected;
			else {
				await expect(pending).resolves.toBe(1);
				expect(record(target)).toMatchObject({
					outcome: "failure",
					nativeOutcome: "failure",
					contentSuccess: false,
					failure: { category: "timeout" },
				});
				expect(record(target)).not.toHaveProperty("sourceVideos");
				expect(target.text()).not.toContain("PRIVATE_SENTINEL");
			}
			expect(signal.aborted).toBe(true);
			expect(getEventListeners(signal, "abort")).toEqual([]);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			if (cause === "abort") expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual([[], [], [], []]);
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
			expectOpen(target.output);
		},
	);

	it.each(["error", "close", "finish"])(
		"cancels navigation when output emits %s before writing",
		async (event) => {
			const started = stalledRequest();
			const target = sink();
			const controller = new AbortController();
			const pending = runResearchVideoSearchCli(
				args,
				target.output,
				controller.signal,
			);
			const rejected = sanitized(pending, "closed");
			const signal = await started;
			target.output.emit(event, new Error(privateDetail));
			await rejected;
			expect(signal.aborted).toBe(true);
			expect(getEventListeners(signal, "abort")).toEqual([]);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual([[], [], [], []]);
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
			expectOpen(target.output);
		},
	);

	describe.each(["abort", "timeout"] as const)(
		"after mid-output %s",
		(cause) => {
			it.each([
				{ lateError: false, autoDestroy: false },
				{ lateError: true, autoDestroy: false },
				{ lateError: true, autoDestroy: true },
			])(
				"protects the pending callback then releases listeners: $lateError/$autoDestroy",
				async ({ lateError, autoDestroy }) => {
					enqueue();
					const target = sink(true, 1, autoDestroy);
					const controller = new AbortController();
					const pending = runResearchVideoSearchCli(
						args,
						target.output,
						controller.signal,
					);
					const rejected = sanitized(
						pending,
						cause === "abort" ? "aborted" : "timeout",
					);
					await target.writing;
					if (cause === "abort") controller.abort(new Error(privateDetail));
					else
						await vi.advanceTimersByTimeAsync(
							researchVideoSearchLimits.timeoutMs,
						);
					await rejected;
					expect(getEventListeners(controller.signal, "abort")).toEqual([]);
					expect(vi.getTimerCount()).toBe(0);
					expectOpen(target.output);
					await turn();
					expect(target.output.listenerCount("error")).toBe(1);
					expect(target.output.listenerCount("close")).toBe(1);
					expect(target.output.listenerCount("finish")).toBe(0);
					expect(target.output.listenerCount("drain")).toBe(0);
					target.complete(lateError ? new Error(privateDetail) : undefined);
					await turn();
					expect(listeners(target.output)).toEqual([[], [], [], []]);
					expect(target.output.destroyed).toBe(lateError && autoDestroy);
					expect(target.output.writableEnded).toBe(false);
					expect(target.chunks).toHaveLength(1);
					expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
						1,
					);
				},
			);
		},
	);
});
