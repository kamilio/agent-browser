import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ResearchJsonContentReport,
	parseResearchJsonContentArguments,
	researchJsonContent,
	researchJsonContentLimits,
} from "../scripts/research-json-content.js";
import { runResearchJsonContentCli } from "../scripts/research-json-content-cli.js";

vi.mock("../scripts/research-json-content.js", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../scripts/research-json-content.js")
		>();
	return { ...actual, researchJsonContent: vi.fn() };
});

const url = "https://json-content.fixture.invalid/page";
const args = ["--script-id", "page-data", "--json-pointer", "/info", url];
const source =
	'{\r\n "integer": 9007199254740993, "negative": -0, "text": "😀"\r\n}';
const outputs: Writable[] = [];
const pendingWrites: Array<() => void> = [];

function report(content = source): ResearchJsonContentReport {
	return {
		kind: "native-research-json-content-v1",
		partial: true,
		rendered: false,
		verified: false,
		contentSuccess: null,
		outcome: "source-extracted-unverified",
		selection: { scriptId: "page-data", pointer: "/info" },
		capture: {
			requestedUrl: url,
			finalUrl: url,
			outcome: "empty-extraction",
			contentSuccess: false,
			classification: {
				classifier: "browser-challenges",
				barrier: null,
				diagnostic: null,
			},
			primaryResponse: null,
			receiptSha256: "a".repeat(64),
			receiptBytes: 1000,
			receiptDisposition: "complete",
		},
		extraction: {
			source: {
				kind: "decoded-html-source-v1",
				reportedFinalUrl: url,
				contentType: "text/html; charset=utf-8",
				bytes: { length: 200, sha256: "b".repeat(64) },
				decoder: {
					policy: "native-research-html-v1",
					encoding: "utf-8",
					bomConsumed: false,
				},
				text: {
					codeUnits: 200,
					sha256: "c".repeat(64),
					digestEncoding: "utf-8",
					coordinates: "decoder-output-utf16-before-parser-normalization",
				},
			},
			selection: {
				kind: "html-json-script-source-v1",
				scope: "lexical-html-source",
				scriptingMode: "disabled",
				rendered: false,
				verified: false,
				scriptId: "page-data",
				pointer: "/info",
				scriptStart: 0,
				start: 50,
				end: 150,
				sourceCodeUnits: 200,
				offsetBasis: "decoder-output-utf16",
				json: {
					kind: "json-source-selection-v1",
					method: "json-pointer",
					pointer: "/info",
					start: 10,
					end: 90,
					sourceCodeUnits: 100,
					selectedCodeUnits: 80,
					offsetBasis: "document-text-utf16",
					valueKind: "object",
					duplicateMembers: "rejected",
				},
				counters: { tokens: 1, operations: 1, workUnits: 200, issues: 0 },
			},
			format: "json-source",
			content,
			rendered: false,
			verified: false,
			networkRequests: 0,
		},
	};
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function sink(held = false, highWaterMark = 1) {
	const chunks: Buffer[] = [];
	const writing = deferred<void>();
	let complete: (error?: Error) => void = () => undefined;
	const output = new Writable({
		autoDestroy: false,
		highWaterMark,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			let completed = false;
			complete = (error) => {
				if (completed) return;
				completed = true;
				callback(error);
			};
			pendingWrites.push(() => complete());
			writing.resolve();
			if (!held) complete();
		},
	});
	outputs.push(output);
	return {
		output,
		chunks,
		writing: writing.promise,
		complete: (error?: Error) => complete(error),
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(output: Writable) {
	return new Map(
		output.eventNames().map((name) => [name, output.listeners(name)]),
	);
}

function turn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function fakeDeadline() {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
}

function pendingApi() {
	const cleanup = deferred<void>();
	const aborted = deferred<void>();
	let activeSignal!: AbortSignal;
	vi.mocked(researchJsonContent).mockImplementationOnce(
		async (_args, signal) => {
			if (!signal) throw new Error("Missing operation signal");
			activeSignal = signal;
			const onAbort = () => aborted.resolve();
			signal.addEventListener("abort", onAbort, { once: true });
			try {
				await aborted.promise;
				await cleanup.promise;
				throw new Error("private API failure/body/credentials");
			} finally {
				signal.removeEventListener("abort", onAbort);
			}
		},
	);
	return { cleanup, aborted, signal: () => activeSignal };
}

beforeEach(() => {
	vi.mocked(researchJsonContent).mockReset().mockResolvedValue(report());
});

afterEach(async () => {
	for (const complete of pendingWrites.splice(0)) complete();
	await turn();
	for (const output of outputs.splice(0)) output.destroy();
	await turn();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("native JSON content CLI", () => {
	it("uses the native API exactly once and emits its exact report as one JSONL record", async () => {
		const value = report();
		vi.mocked(researchJsonContent).mockResolvedValueOnce(value);
		const target = sink();
		const controller = new AbortController();
		expect(
			await runResearchJsonContentCli(args, target.output, controller.signal),
		).toBe(0);
		expect(researchJsonContent).toHaveBeenCalledTimes(1);
		expect(researchJsonContent).toHaveBeenCalledWith(
			args,
			expect.any(AbortSignal),
		);
		expect(vi.mocked(researchJsonContent).mock.calls[0][0]).toBe(args);
		const activeSignal = vi.mocked(researchJsonContent).mock.calls[0][1];
		expect(activeSignal).not.toBe(controller.signal);
		expect(activeSignal?.aborted).toBe(false);
		expect(target.chunks).toHaveLength(1);
		expect(target.text()).toBe(`${JSON.stringify(value)}\n`);
		expect(JSON.parse(target.text()).extraction.content).toBe(source);
		expect(JSON.parse(target.text()).capture.outcome).toBe("empty-extraction");
		expect(target.output.destroyed).toBe(false);
		expect(target.output.writableEnded).toBe(false);
	});

	it("returns one for native failure without rewriting capture metadata or retrying", async () => {
		const value: ResearchJsonContentReport = {
			...report(),
			outcome: "failure",
			contentSuccess: false,
			extraction: undefined,
			failure: { category: "not-found", stage: "source" },
		};
		vi.mocked(researchJsonContent).mockResolvedValueOnce(value);
		const target = sink();
		expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
		expect(target.text()).toBe(`${JSON.stringify(value)}\n`);
		expect(researchJsonContent).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ name: "missing options", values: [url] },
		{ name: "missing URL", values: args.slice(0, 4) },
		{
			name: "missing pointer value",
			values: [url, "--script-id", "page-data", "--json-pointer"],
		},
		{ name: "unknown option", values: [...args, "--unknown"] },
		{ name: "duplicate script", values: [...args, "--script-id", "other"] },
		{ name: "duplicate pointer", values: [...args, "--json-pointer", ""] },
		{ name: "duplicate URL", values: [...args, url] },
		{
			name: "non-HTTPS URL",
			values: [...args.slice(0, 4), "http://json-content.fixture.invalid/"],
		},
		{
			name: "invalid pointer",
			values: [url, "--script-id", "page-data", "--json-pointer", "info"],
		},
		{ name: "mixed help", values: ["--help", ...args] },
		{ name: "duplicate help", values: ["--help", "--help"] },
	])("rejects $name before API or output setup", async ({ values }) => {
		fakeDeadline();
		const target = sink();
		const before = listeners(target.output);
		expect(() => parseResearchJsonContentArguments(values)).toThrow();
		expect(await runResearchJsonContentCli(values, target.output)).toBe(1);
		expect(researchJsonContent).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual(before);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("accepts reordered options and preserves explicit empty root pointer", async () => {
		const values = [url, "--json-pointer", "", "--script-id", "page-data"];
		expect(parseResearchJsonContentArguments(values)).toEqual({
			url,
			selection: { scriptId: "page-data", pointer: "" },
		});
		const target = sink();
		expect(await runResearchJsonContentCli(values, target.output)).toBe(0);
		expect(researchJsonContent).toHaveBeenCalledExactlyOnceWith(
			values,
			expect.any(AbortSignal),
		);
	});

	it("prints bounded JSONL help without calling the native API", async () => {
		const target = sink();
		expect(await runResearchJsonContentCli(["--help"], target.output)).toBe(0);
		expect(researchJsonContent).not.toHaveBeenCalled();
		expect(target.chunks).toHaveLength(1);
		expect(JSON.parse(target.text())).toEqual({
			kind: "native-research-json-content-help-v1",
			usage: expect.stringContaining(
				"--script-id ID --json-pointer POINTER HTTPS_URL",
			),
		});
		expect(Buffer.byteLength(target.text())).toBeLessThanOrEqual(
			researchJsonContentLimits.maxOutputBytes,
		);
	});

	it.each([false, true])(
		"bounds UTF-8 bytes including the newline (overflow: %s)",
		async (overflow) => {
			const emptyBytes = Buffer.byteLength(JSON.stringify(report(""))) + 1;
			const contentBytes =
				researchJsonContentLimits.maxOutputBytes - emptyBytes;
			const content =
				"😀".repeat(Math.floor(contentBytes / 4)) +
				"x".repeat(contentBytes % 4) +
				(overflow ? "x" : "");
			const value = report(content);
			vi.mocked(researchJsonContent).mockResolvedValueOnce(value);
			const target = sink();
			expect(await runResearchJsonContentCli(args, target.output)).toBe(
				overflow ? 1 : 0,
			);
			expect(researchJsonContent).toHaveBeenCalledTimes(1);
			if (overflow) {
				expect(target.text()).toBe("");
				expect(vi.mocked(researchJsonContent).mock.calls[0][1]?.aborted).toBe(
					true,
				);
			} else
				expect(Buffer.byteLength(target.text())).toBe(
					researchJsonContentLimits.maxOutputBytes,
				);
		},
	);

	it.each([
		{
			name: "rejection",
			fail: () => Promise.reject(new Error("private body/token")),
		},
		{
			name: "synchronous throw",
			fail: () => {
				throw new Error("private body/token");
			},
		},
	])("contains API $name without output or retries", async ({ fail }) => {
		vi.mocked(researchJsonContent).mockImplementationOnce(fail);
		const target = sink();
		expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
		expect(target.text()).toBe("");
		expect(researchJsonContent).toHaveBeenCalledTimes(1);
		expect(vi.mocked(researchJsonContent).mock.calls[0][1]?.aborted).toBe(true);
	});

	it("contains serialization failures without exposing a partial record", async () => {
		const value = report();
		Object.assign(value, { circular: value });
		vi.mocked(researchJsonContent).mockResolvedValueOnce(value);
		const target = sink();
		expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
		expect(target.chunks).toHaveLength(0);
	});

	it("does not start the API for pre-aborted callers", async () => {
		const controller = new AbortController();
		controller.abort(new Error("private caller reason"));
		const target = sink();
		expect(
			await runResearchJsonContentCli(args, target.output, controller.signal),
		).toBe(1);
		expect(researchJsonContent).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	});

	it.each(["ended", "destroyed", "errored"])(
		"does not start the API for %s output",
		async (state) => {
			const target = sink();
			if (state === "ended") target.output.end();
			else if (state === "destroyed") target.output.destroy();
			else {
				target.output.on("error", () => undefined);
				target.output.destroy(new Error("private output failure"));
			}
			await turn();
			expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
			expect(researchJsonContent).not.toHaveBeenCalled();
			expect(target.text()).toBe("");
		},
	);

	it.each(["abort", "timeout", "error", "close", "finish"])(
		"waits for API cleanup after %s and never writes a stale report",
		async (cause) => {
			fakeDeadline();
			const api = pendingApi();
			const target = sink();
			const controller = new AbortController();
			const before = listeners(target.output);
			let settled = false;
			const operation = runResearchJsonContentCli(
				args,
				target.output,
				controller.signal,
			).finally(() => {
				settled = true;
			});
			if (cause === "abort")
				controller.abort(new Error("private caller reason"));
			else if (cause === "timeout")
				await vi.advanceTimersByTimeAsync(researchJsonContentLimits.timeoutMs);
			else target.output.emit(cause, new Error("private output error"));
			await api.aborted.promise;
			expect(api.signal().aborted).toBe(true);
			expect(api.signal().reason.message).not.toContain("private");
			expect(settled).toBe(false);
			api.cleanup.resolve();
			expect(await operation).toBe(1);
			expect(researchJsonContent).toHaveBeenCalledTimes(1);
			expect(target.text()).toBe("");
			expect(target.output.destroyed).toBe(false);
			expect(target.output.writableEnded).toBe(false);
			expect(listeners(target.output)).toEqual(before);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("discards a successful API result arriving after cancellation", async () => {
		const result = deferred<ResearchJsonContentReport>();
		vi.mocked(researchJsonContent).mockReturnValueOnce(result.promise);
		const target = sink();
		const controller = new AbortController();
		const operation = runResearchJsonContentCli(
			args,
			target.output,
			controller.signal,
		);
		controller.abort();
		result.resolve(report());
		expect(await operation).toBe(1);
		expect(target.text()).toBe("");
	});

	it.each([1, 1_000_000])(
		"waits for a real write callback at highWaterMark %s",
		async (highWaterMark) => {
			const target = sink(true, highWaterMark);
			let settled = false;
			const operation = runResearchJsonContentCli(args, target.output).finally(
				() => {
					settled = true;
				},
			);
			await target.writing;
			await turn();
			expect(settled).toBe(false);
			target.complete();
			expect(await operation).toBe(0);
		},
	);

	it.each(["callback-first", "drain-first", "synchronous"])(
		"handles write callback/drain sequencing: %s",
		async (order) => {
			const target = sink();
			const writing = deferred<void>();
			let callback!: (error?: Error | null) => void;
			vi.spyOn(target.output, "write").mockImplementation(
				(...values: unknown[]) => {
					callback = values[values.length - 1] as typeof callback;
					writing.resolve();
					if (order === "synchronous") {
						callback();
						target.output.emit("drain");
					}
					return false;
				},
			);
			let settled = false;
			const operation = runResearchJsonContentCli(args, target.output).finally(
				() => {
					settled = true;
				},
			);
			await writing.promise;
			if (order !== "synchronous") {
				if (order === "callback-first") callback();
				else target.output.emit("drain");
				await turn();
				expect(settled).toBe(false);
				if (order === "callback-first") target.output.emit("drain");
				else callback();
			}
			expect(await operation).toBe(0);
		},
	);

	it("contains synchronous write throws and aborts the operation signal", async () => {
		const target = sink();
		const before = listeners(target.output);
		vi.spyOn(target.output, "write").mockImplementation(() => {
			throw new Error("private write failure");
		});
		expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
		expect(vi.mocked(researchJsonContent).mock.calls[0][1]?.aborted).toBe(true);
		expect(listeners(target.output)).toEqual(before);
		expect(target.output.destroyed).toBe(false);
	});

	it("contains delayed write callback errors without retrying or closing caller output", async () => {
		const target = sink(true);
		const before = listeners(target.output);
		const operation = runResearchJsonContentCli(args, target.output);
		await target.writing;
		target.complete(new Error("private write callback failure"));
		expect(await operation).toBe(1);
		expect(vi.mocked(researchJsonContent).mock.calls[0][1]?.aborted).toBe(true);
		expect(target.chunks).toHaveLength(1);
		expect(target.output.destroyed).toBe(false);
		expect(target.output.writableEnded).toBe(false);
		expect(listeners(target.output)).toEqual(before);
	});

	it.each(["abort", "timeout", "error", "close"])(
		"cancels a pending write after %s without waiting forever for its callback",
		async (cause) => {
			fakeDeadline();
			const target = sink(true);
			const controller = new AbortController();
			const before = listeners(target.output);
			const operation = runResearchJsonContentCli(
				args,
				target.output,
				controller.signal,
			);
			await target.writing;
			if (cause === "abort") controller.abort();
			else if (cause === "timeout")
				await vi.advanceTimersByTimeAsync(researchJsonContentLimits.timeoutMs);
			else target.output.emit(cause, new Error("private stream failure"));
			expect(await operation).toBe(1);
			expect(vi.mocked(researchJsonContent).mock.calls[0][1]?.aborted).toBe(
				true,
			);
			expect(target.chunks).toHaveLength(1);
			expect(listeners(target.output)).toEqual(before);
			expect(target.output.destroyed).toBe(false);
			expect(target.output.writableEnded).toBe(false);
			expect(vi.getTimerCount()).toBe(0);
			target.complete(new Error("private late callback failure"));
			await turn();
			expect(listeners(target.output)).toEqual(before);
		},
	);

	it("checks the elapsed deadline after synchronous serialization", async () => {
		fakeDeadline();
		const value = report();
		Object.assign(value, {
			toJSON: () => {
				vi.advanceTimersByTime(researchJsonContentLimits.timeoutMs);
				return { kind: "late report" };
			},
		});
		vi.mocked(researchJsonContent).mockResolvedValueOnce(value);
		const target = sink();
		expect(await runResearchJsonContentCli(args, target.output)).toBe(1);
		expect(target.text()).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([false, true])(
		"preserves caller listeners, stream ownership and timers (cancel: %s)",
		async (cancel) => {
			fakeDeadline();
			const target = sink(cancel);
			const controller = new AbortController();
			const caller = vi.fn();
			for (const event of ["error", "close", "finish", "drain"])
				target.output.on(event, caller);
			controller.signal.addEventListener("abort", caller);
			const before = listeners(target.output);
			const abortListeners = getEventListeners(controller.signal, "abort");
			const callerTimer = setTimeout(
				caller,
				researchJsonContentLimits.timeoutMs * 2,
			);
			const operation = runResearchJsonContentCli(
				args,
				target.output,
				controller.signal,
			);
			if (cancel) {
				await target.writing;
				controller.abort();
			}
			expect(await operation).toBe(cancel ? 1 : 0);
			expect(listeners(target.output)).toEqual(before);
			expect(getEventListeners(controller.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(vi.getTimerCount()).toBe(1);
			clearTimeout(callerTimer);
			if (cancel) target.complete();
			else {
				const activeSignal = vi.mocked(researchJsonContent).mock.calls[0][1];
				controller.abort();
				expect(activeSignal?.aborted).toBe(false);
			}
			await new Promise<void>((resolve, reject) => {
				target.output.write("caller-owned\n", (error) =>
					error ? reject(error) : resolve(),
				);
				target.complete();
			});
			expect(target.output.destroyed).toBe(false);
			expect(target.output.writableEnded).toBe(false);
		},
	);
});
