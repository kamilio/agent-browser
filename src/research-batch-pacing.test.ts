import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import type { ExtractedNode } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import { researchReaderProfile } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const origin = "https://batch.fixture.invalid";
const firstUrl = `${origin}/first`;
const secondUrl = `${origin}/second`;
const tableMarkup =
	'<title>Owned batch</title><main><h1 id="heading">Batch heading</h1><table id="selected"><tr><th id="label" scope="col">Label</th><td headers="label" colspan="2">Owned value</td></tr></table><p>Outside table</p></main>';
const pending: Promise<unknown>[] = [];
const batches: {
	controller: AbortController;
	iterator: AsyncGenerator<ResearchNavigationReport>;
}[] = [];
const starts: { url: string; time: number; transport: NodeNetworkTransport }[] =
	[];
let source = tableMarkup;
let contentType = "text/html; charset=utf-8";
let responseUrl: string | undefined;

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function batch(args: readonly string[], controller = new AbortController()) {
	const iterator = researchBatch(args, controller.signal);
	batches.push({ controller, iterator });
	return {
		controller,
		next: () => track(iterator.next()),
		finish: () => track(iterator.return(undefined)),
	};
}

function paced(urls = [firstUrl, secondUrl], interval = 100) {
	return batch(["--min-request-interval-ms", String(interval), ...urls]);
}

async function report(test: ReturnType<typeof batch>) {
	const result = await test.next();
	expect(result.done).toBe(false);
	if (result.done) throw new Error("Expected an owned navigation report");
	expect(result.value.outcome).toBe("extracted-unverified");
	expect(result.value.metrics?.closed).toBe(true);
	return result.value;
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	source = tableMarkup;
	contentType = "text/html; charset=utf-8";
	responseUrl = undefined;
	starts.length = 0;
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(OriginRequestPacer.prototype, "close");
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		async function (
			this: NodeNetworkTransport,
			input,
		): Promise<NetworkResponse> {
			starts.push({ url: input.url, time: performance.now(), transport: this });
			const body = new TextEncoder().encode(source);
			return {
				url: responseUrl ?? input.url,
				status: 200,
				headers: { "content-type": [contentType] },
				body,
				encodedBytes: body.byteLength,
				redirects: [],
				elapsedMs: 0,
			};
		},
	);
});

afterEach(async () => {
	try {
		for (const test of batches.splice(0)) {
			test.controller.abort(new AgentBrowserError("aborted", "Test cleanup"));
			track(test.iterator.return(undefined));
		}
		await vi.runAllTimersAsync();
		await Promise.allSettled(pending.splice(0));
	} finally {
		for (const start of starts.splice(0)) start.transport.close();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

it("keeps all new parser fields absent by default", () => {
	const parsed = parseResearchArguments([firstUrl]);
	expect(parsed).toEqual({ reader: false, urls: [firstUrl] });
	for (const field of ["minRequestIntervalMs", "format", "tableMetadata"])
		expect(Object.hasOwn(parsed, field)).toBe(false);
	expectNoSetup();
});

it.each(["0", "1", "100", "60000"])(
	"accepts canonical pacing interval %s before or after URLs",
	(value) => {
		for (const args of [
			["--min-request-interval-ms", value, firstUrl],
			[firstUrl, "--min-request-interval-ms", value],
		])
			expect(parseResearchArguments(args)).toEqual({
				reader: false,
				urls: [firstUrl],
				minRequestIntervalMs: Number(value),
			});
		expectNoSetup();
	},
);

it.each([
	"",
	"-1",
	"-0",
	"+1",
	"00",
	"01",
	"0.5",
	"1.0",
	" 1",
	"1 ",
	"1\n",
	"\t1",
	"1e2",
	"0x10",
	"NaN",
	"Infinity",
	"60001",
	"9007199254740992",
])("rejects noncanonical pacing %j before batch setup", async (value) => {
	const args = [firstUrl, "--min-request-interval-ms", value];
	expect(() => parseResearchArguments(args)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	await expect(batch(args).next()).rejects.toMatchObject({
		code: "invalid-input",
	});
	expectNoSetup();
});

it.each([
	[firstUrl, "--min-request-interval-ms"],
	[firstUrl, "--min-request-interval-ms", "--reader"],
	[
		firstUrl,
		"--min-request-interval-ms",
		"0",
		"--min-request-interval-ms",
		"0",
	],
	[
		firstUrl,
		"--min-request-interval-ms",
		"100",
		"--min-request-interval-ms",
		"1",
	],
	[firstUrl, "--min-request-interval-ms", "100", "--unknown"],
	[firstUrl, "--min-request-interval-ms", "100", "not-a-url"],
])(
	"preflights the entire batch without requesting the first URL: %j",
	async (...args) => {
		expect(() => parseResearchArguments(args)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		await expect(batch(args).next()).rejects.toMatchObject({
			code: "invalid-input",
		});
		expectNoSetup();
	},
);

it.each(
	[
		-1,
		0.5,
		60_001,
		Number.MAX_SAFE_INTEGER + 1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		null,
		"100",
		true,
		{},
		[],
	].map((value) => ({ value })),
)(
	"rejects invalid direct pacing option $value before setup",
	async ({ value }) => {
		await expect(
			track(
				researchNavigation(
					firstUrl,
					false,
					undefined,
					undefined,
					false,
					undefined,
					undefined,
					false,
					undefined,
					undefined,
					{ minRequestIntervalMs: value as number },
				),
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

it.each([undefined, 0, 1, 60_000])(
	"accepts direct pacing %s and configures a transport pacer only when enabled",
	async (interval) => {
		const result = await track(
			researchNavigation(
				firstUrl,
				false,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				{ minRequestIntervalMs: interval },
			),
		);
		expect(result.outcome).toBe("extracted-unverified");
		expect(result.metrics?.closed).toBe(true);
		expect(starts.map((start) => start.time)).toEqual([0]);
		expect(OriginRequestPacer.prototype.close).toHaveBeenCalledTimes(
			interval ? 1 : 0,
		);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("starts immediately, then paces normalized same-origin URLs FIFO", async () => {
	const thirdUrl = `${origin}/third`;
	const test = paced([
		"https://BATCH.fixture.invalid:443/first",
		secondUrl,
		thirdUrl,
	]);
	expectNoSetup();
	expect((await report(test)).requestedUrl).toBe(firstUrl);
	expect(starts.map((start) => start.time)).toEqual([0]);
	const second = test.next();
	const third = test.next();
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	expect((await second).value).toMatchObject({ requestedUrl: secondUrl });
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(1);
	expect((await third).value).toMatchObject({ requestedUrl: thirdUrl });
	expect(starts.map(({ url, time }) => [url, time])).toEqual([
		[firstUrl, 0],
		[secondUrl, 100],
		[thirdUrl, 200],
	]);
	expect(new Set(starts.map((start) => start.transport)).size).toBe(3);
	await expect(test.next()).resolves.toEqual({ done: true, value: undefined });
	expect(vi.getTimerCount()).toBe(0);
});

it.each([
	"https://other.fixture.invalid/second",
	"http://batch.fixture.invalid/second",
	"https://batch.fixture.invalid:8443/second",
])("does not delay the independent origin %s", async (otherUrl) => {
	const test = paced([firstUrl, otherUrl, secondUrl]);
	await report(test);
	await report(test);
	expect(starts.map((start) => start.time)).toEqual([0, 0]);
	const waiting = test.next();
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(1);
	await waiting;
	expect(starts.map((start) => start.time)).toEqual([0, 0, 100]);
});

it.each([[], ["--min-request-interval-ms", "0"]])(
	"does not pace a default or zero-interval batch: %j",
	async (...flags) => {
		const test = batch([...flags, firstUrl, secondUrl]);
		await report(test);
		await report(test);
		await expect(test.next()).resolves.toMatchObject({ done: true });
		expect(starts.map((start) => start.time)).toEqual([0, 0]);
		expect(OriginRequestPacer.prototype.close).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([40, 100, 150])(
	"only waits for remaining cooldown after a %s ms consumer pause",
	async (pause) => {
		const test = paced();
		await report(test);
		await vi.advanceTimersByTimeAsync(pause);
		const waiting = test.next();
		await vi.advanceTimersByTimeAsync(0);
		if (pause < 100) {
			expect(starts).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(100 - pause - 1);
			expect(starts).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1);
		}
		await waiting;
		expect(starts.map((start) => start.time)).toEqual([
			0,
			Math.max(100, pause),
		]);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("accepts the 60000 ms boundary without shortening the cooldown", async () => {
	const test = paced(undefined, 60_000);
	await report(test);
	const waiting = test.next();
	await vi.advanceTimersByTimeAsync(59_999);
	expect(starts).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	await waiting;
	expect(starts.map((start) => start.time)).toEqual([0, 60_000]);
});

it("paces requested origins rather than the owned response's final URL", async () => {
	responseUrl = "https://landing.fixture.invalid/owned";
	const test = paced();
	expect((await report(test)).finalUrl).toBe(responseUrl);
	const waiting = test.next();
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	await waiting;
	expect(starts.map((start) => start.time)).toEqual([0, 100]);
});

it("does not coordinate pacing state across separate batches", async () => {
	const first = paced();
	const independent = paced([firstUrl]);
	await report(first);
	const waiting = first.next();
	await report(independent);
	expect(starts.map((start) => start.time)).toEqual([0, 0]);
	await vi.advanceTimersByTimeAsync(100);
	await waiting;
	expect(starts.map((start) => start.time)).toEqual([0, 0, 100]);
});

it("aborts a queued next without starting another request", async () => {
	const test = paced();
	await report(test);
	const waiting = test.next();
	await vi.advanceTimersByTimeAsync(0);
	expect(vi.getTimerCount()).toBe(1);
	const reason = new AgentBrowserError("aborted", "Owned batch cancellation");
	test.controller.abort(reason);
	await expect(waiting).rejects.toBe(reason);
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	expect(starts).toHaveLength(1);
	await expect(test.next()).resolves.toMatchObject({ done: true });
});

it("rejects a preaborted paced batch before creating a session", async () => {
	const controller = new AbortController();
	const reason = new AgentBrowserError("aborted", "Owned preaborted batch");
	controller.abort(reason);
	const test = batch(
		["--min-request-interval-ms", "100", firstUrl],
		controller,
	);
	await expect(test.next()).rejects.toBe(reason);
	expectNoSetup();
});

it("closes the batch pacer on early iterator return without future requests", async () => {
	const test = paced();
	await report(test);
	const closes = vi.mocked(OriginRequestPacer.prototype.close).mock.calls
		.length;
	await expect(test.finish()).resolves.toEqual({
		done: true,
		value: undefined,
	});
	expect(OriginRequestPacer.prototype.close).toHaveBeenCalledTimes(closes + 1);
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	await expect(test.next()).resolves.toMatchObject({ done: true });
	expect(starts).toHaveLength(1);
});

it.each([false, true])(
	"forwards JSON, table metadata, selector and reader=%s across the batch",
	async (reader) => {
		const test = batch([
			"--min-request-interval-ms",
			"100",
			"--format",
			"json",
			"--table-metadata",
			"--selector",
			"table",
			...(reader ? ["--reader"] : []),
			firstUrl,
			secondUrl,
		]);
		const first = await report(test);
		const waiting = test.next();
		await vi.advanceTimersByTimeAsync(100);
		const second = await waiting;
		expect(second.done).toBe(false);
		if (second.done) throw new Error("Expected the second JSON report");
		for (const result of [first, second.value]) {
			expect(result).toMatchObject({
				profile: reader ? researchReaderProfile : "native",
				partial: true,
				contentSuccess: null,
				selection: { method: "css-selector", matches: 1 },
			});
			const extraction = result.extraction;
			expect(extraction?.format).toBe("json");
			if (extraction?.format !== "json")
				throw new Error("Expected JSON extraction from the batch");
			const nodes: ExtractedNode[] = [];
			const remaining = [extraction.content];
			while (remaining.length) {
				const node = remaining.pop();
				if (!node) break;
				nodes.push(node);
				remaining.push(...(node.children ?? []));
			}
			expect(nodes.filter((node) => node.type === "cell")).toEqual([
				expect.objectContaining({
					tableSource: expect.objectContaining({
						attributes: { headers: "label", colspan: "2" },
					}),
				}),
				expect.objectContaining({
					tableSource: expect.objectContaining({
						attributes: { id: "label", scope: "col" },
					}),
				}),
			]);
			expect(JSON.stringify(extraction.content)).not.toContain("Outside table");
			if (reader) expect(result.reader?.profile).toBe(researchReaderProfile);
		}
		expect(starts.map((start) => start.time)).toEqual([0, 100]);
	},
);

it.each([
	{ flags: [], selection: undefined },
	{ flags: ["--format", "markdown"], selection: undefined },
	{
		flags: ["--section", "h1"],
		selection: { method: "heading-section", matches: 1 },
	},
	{ flags: ["--headings"], selection: { method: "heading-outline" } },
	{
		flags: ["--document-profile", "long-v1", "--headings"],
		selection: { method: "heading-outline" },
	},
	{
		flags: ["--lines", "2:2"],
		selection: { method: "text-lines", start: 2, end: 2 },
	},
	{ flags: ["--find", "Owned"], selection: { method: "text-line-discovery" } },
])(
	"forwards reader, capture and selection flags $flags",
	async ({ flags, selection }) => {
		if (flags.includes("--lines") || flags.includes("--find")) {
			source = "First line\nOwned value\nLast line";
			contentType = "text/plain; charset=utf-8";
		}
		const test = batch(["--reader", "--capture-body", ...flags, firstUrl]);
		const result = await report(test);
		expect(result.selection).toEqual(selection);
		expect(result.profile).toBe(researchReaderProfile);
		expect(result.bodyCapture).toBeDefined();
		if (flags.includes("long-v1"))
			expect(result.admission?.profile).toBe("long-v1");
		if (flags.includes("--headings")) expect(result.headings).toBeDefined();
		else if (flags.includes("--find")) expect(result.textLines).toBeDefined();
		else expect(result.extraction?.format).toBe("markdown");
		expect(starts).toHaveLength(1);
	},
);
