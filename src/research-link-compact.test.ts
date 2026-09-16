import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseResearchLinkContentArguments,
	researchLinkContent,
	researchLinkContentLimits,
	runResearchLinkContentCli,
} from "../scripts/research-link-content.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchLongDocumentAdmission } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { BrowserSession } from "./session.js";

type Report = Awaited<ReturnType<typeof researchLinkContent>>;

const sourceUrl = "https://link-compact.fixture.invalid/index";
const targetUrl = "https://link-compact.fixture.invalid/articles/owned";
const selector = "#chosen";
const flag = "--compact-tables";
const source =
	'<main><a href="/articles/other">Other article</a><a id="chosen" href="/articles/owned">Read owned article</a></main>';
const originalClick = BrowserSession.prototype.click;
const originalExtract = extraction.extractDocument;
const outputs: Writable[] = [];
const controllers: AbortController[] = [];
const markers = {
	tableBegin:
		"**Native table begin (selected structure only; associations unspecified)**",
	tableEnd: "**Native table end**",
	rowBegin: "**Native row begin (selected structure only)**",
	cellBegin: "**Native cell begin (selected structure only)**",
};
const extractionOptions = {
	format: "markdown" as const,
	contentFocus: "main-content-v2" as const,
	outputLimitPolicy: "text-prefix-v1" as const,
	tableRows: true,
	maxBytes: 256_000,
	maxNodes: 50_000,
	maxDepth: 128,
};
const modes = [
	{
		name: "selector",
		args: ["--target", targetUrl, "--selector", selector, sourceUrl],
		expected: { url: sourceUrl, targetUrl, selector },
	},
	{
		name: "target-link",
		args: ["--target-link", targetUrl, sourceUrl],
		expected: { url: sourceUrl, targetUrl, targetLink: true },
	},
];
const targetOption = ["--target", targetUrl];
const selectorOption = ["--selector", selector];
const pageArgument = [sourceUrl];
const baseCommands = [
	...[
		[targetOption, selectorOption, pageArgument],
		[targetOption, pageArgument, selectorOption],
		[selectorOption, targetOption, pageArgument],
		[selectorOption, pageArgument, targetOption],
		[pageArgument, targetOption, selectorOption],
		[pageArgument, selectorOption, targetOption],
	].map((groups) => ({ groups, expected: modes[0].expected })),
	...[
		[["--target-link", targetUrl], pageArgument],
		[pageArgument, ["--target-link", targetUrl]],
	].map((groups) => ({ groups, expected: modes[1].expected })),
];
const fixtures = [
	{
		name: "simple row-list table",
		body: "<table><tr><th>Feature</th><th>Support</th></tr><tr><td>Quantization</td><td>Available</td></tr></table>",
		tables: 1,
		structural: false,
		rowList: "  - Cell 1: Quantization",
	},
	{
		name: "structural table",
		body: "<table><caption>Capabilities</caption><tr><td><p>First paragraph</p><p>Second paragraph</p></td><td>Available</td></tr></table>",
		tables: 1,
		structural: true,
		rowList: undefined,
	},
	{
		name: "nested table",
		body: "<table><tr><td><p>Before nested</p><table><tr><td>Inner value</td></tr></table><p>After nested</p></td></tr></table>",
		tables: 2,
		structural: true,
		rowList: "  - Cell 1: Inner value",
	},
	{
		name: "non-table page",
		body: "<p>Ordinary article content.</p>",
		tables: 0,
		structural: false,
		rowList: undefined,
	},
];

function article(body: string) {
	return `<main><h1>Owned article</h1><p>Synthetic target content: café.</p>${body}<p hidden>HIDDEN_SENTINEL</p><script>RAW_SENTINEL</script></main>`;
}

function response(
	url: string,
	bodyText: string,
	status = 200,
): NetworkResponse {
	const body = new TextEncoder().encode(bodyText);
	return {
		url,
		status,
		headers: { "content-type": ["text/html"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function serve(body: string, sourceStatus = 200, targetStatus = 200) {
	vi.mocked(NodeNetworkTransport.prototype.request)
		.mockResolvedValueOnce(response(sourceUrl, source, sourceStatus))
		.mockResolvedValueOnce(response(targetUrl, body, targetStatus));
}

function sink() {
	const chunks: Buffer[] = [];
	const output = new Writable({
		highWaterMark: 1,
		emitClose: false,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const event of ["error", "close", "drain", "finish"])
		output.on(event, () => undefined);
	outputs.push(output);
	return { output, text: () => Buffer.concat(chunks).toString("utf8") };
}

function listeners(output: Writable) {
	return new Map(
		output.eventNames().map((name) => [name, output.listeners(name)]),
	);
}

function requests(expected: readonly string[]) {
	const calls = vi.mocked(NodeNetworkTransport.prototype.request).mock.calls;
	expect(calls.map(([request]) => request.url)).toEqual(expected);
	for (const [request] of calls) {
		expect(request.method ?? "GET").toBe("GET");
		expect(request.body).toBeUndefined();
		expect(request.redirect).toBe("error");
		expect(request.cookieContext?.credentials).toBe("omit");
		expect(request.headers).toEqual({
			"User-Agent": "AgentBrowser/0.1",
			"Accept-Language": "en-US",
		});
	}
}

function closed(report: Report) {
	expect(report.metrics).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
		network: { active: 0, closed: true },
	});
	expect(report.documentClosedStates.every(Boolean)).toBe(true);
	expect(BrowserSession.prototype.close).toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	for (const session of vi.mocked(BrowserSession.prototype.close).mock
		.contexts as BrowserSession[])
		expect(session.metrics()).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 0,
			network: { active: 0, closed: true },
		});
	for (const result of vi.mocked(loader.loadResearchDocument).mock.results)
		if (result.type === "return")
			expect(result.value.mutationMetrics().closed).toBe(true);
}

function markdown(report: Report) {
	if (report.extraction?.format !== "markdown")
		throw new Error("Expected synthetic destination Markdown");
	return report.extraction;
}

function successful(report: Report, mode: (typeof modes)[number]) {
	expect(report).toMatchObject({
		kind: "native-research-link-content-v1",
		partial: true,
		contentSuccess: null,
		outcome: "extracted-unverified",
		sourceUrl,
		targetUrl,
		stage: "complete",
		events: ["mousedown", "mouseup", "click"],
		selection: {
			url: targetUrl,
			label: "Read owned article",
			candidates: 1,
		},
		documentClosedStates: [true, true],
	});
	expect(report).not.toHaveProperty("compactTables");
	expect(report).not.toHaveProperty("failure");
	if (mode.name === "selector") {
		expect(report.selector).toBe(selector);
		expect(report).not.toHaveProperty("selectionMode");
		expect(report).not.toHaveProperty("targetLinkDiscovery");
	} else {
		expect(report).not.toHaveProperty("selector");
		expect(report.selectionMode).toBe("exact-target-v1");
		expect(report.targetLinkDiscovery).toEqual({
			strategy: "first-eligible-target-v1",
			anchorMatches: 2,
			targetCandidates: 1,
			eligibleCandidates: 1,
		});
	}
	expect(markdown(report).content).toContain(
		"Synthetic target content: café\\.",
	);
	expect(markdown(report).content).not.toContain("HIDDEN_SENTINEL");
	expect(markdown(report).content).not.toContain("RAW_SENTINEL");
	closed(report);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(
		NodeNetworkTransport.prototype,
		"requestWithRoutes",
	).mockImplementation(function (this: NodeNetworkTransport, request) {
		return this.request(request);
	});
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "navigate");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "click").mockImplementation(function (
		this: BrowserSession,
		tab,
		reference,
		options,
	) {
		const page = this.page(tab);
		const chosen = page.queries.querySelector(selector);
		if (chosen === null) throw new Error("Missing synthetic chosen anchor");
		expect(reference).toBe(page.document.reference(chosen));
		return originalClick.call(this, tab, reference, options);
	});
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Compact link tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const controller of controllers.splice(0)) controller.abort();
		for (const output of outputs.splice(0)) output.destroy();
		for (const session of vi.mocked(BrowserSession.prototype.navigate).mock
			.contexts as BrowserSession[])
			session.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("compact link argument preflight", () => {
	it.each(baseCommands)(
		"preserves default parser shape %#",
		({ groups, expected }) => {
			expect(parseResearchLinkContentArguments(groups.flat())).toEqual(
				expected,
			);
			requests([]);
		},
	);

	it.each(
		baseCommands.flatMap(({ groups, expected }) =>
			Array.from({ length: groups.length + 1 }, (_value, boundary) => ({
				input: [
					...groups.slice(0, boundary).flat(),
					flag,
					...groups.slice(boundary).flat(),
				],
				expected,
			})),
		),
	)(
		"accepts the boolean at every option boundary %#",
		({ input, expected }) => {
			expect(parseResearchLinkContentArguments(input)).toEqual({
				...expected,
				compactTables: true,
			});
			requests([]);
		},
	);

	it.each([
		...modes.flatMap(({ args }) => [
			[flag, ...args, flag],
			[flag, flag, ...args],
			[...args, flag, "true"],
			[...args, flag, "false"],
			[...args, `${flag}=true`],
			[...args, `${flag}=false`],
			[...args, flag, "--unknown"],
		]),
		[flag],
		[flag, "--target-link", targetUrl],
		[sourceUrl, flag, "--target-link"],
		["--target-link", flag, targetUrl, sourceUrl],
		["--target", flag, targetUrl, "--selector", selector, sourceUrl],
		["--target", targetUrl, "--selector", flag, selector, sourceUrl],
		["--target", targetUrl, sourceUrl, flag, "--selector"],
		["--target", targetUrl, sourceUrl, "--selector", flag],
		[...modes[0].args, flag, "--target-link", targetUrl],
		[...modes[1].args, flag, "--selector", selector],
		[...modes[1].args, flag, "--target", targetUrl],
	])(
		"rejects malformed flags before workflow or CLI I/O %#",
		async (...input) => {
			const error = new AgentBrowserError(
				"invalid-input",
				"Invalid link content arguments",
			);
			expect(() => parseResearchLinkContentArguments(input)).toThrow(error);
			await expect(researchLinkContent(input)).rejects.toThrow(error);
			const output = sink();
			const before = listeners(output.output);
			await expect(
				runResearchLinkContentCli(input, output.output),
			).rejects.toThrow(error);
			expect(output.text()).toBe("");
			expect(listeners(output.output)).toEqual(before);
			expect(output.output.destroyed).toBe(false);
			expect(output.output.writableEnded).toBe(false);
			expect(BrowserSession.prototype.navigate).not.toHaveBeenCalled();
			expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
			expect(loader.loadResearchDocument).not.toHaveBeenCalled();
			expect(extraction.extractDocument).not.toHaveBeenCalled();
			requests([]);
		},
	);
});

describe.each(modes)("$name compact destination extraction", (mode) => {
	it.each(fixtures)(
		"compares $name to default without changing native navigation",
		async (fixture) => {
			expect(researchLinkContentLimits).toEqual({
				maxOutputBytes: 512_000,
				maxCandidates: 64,
				maxSourceAnchors: 10_000,
				timeoutMs: 60_000,
			});
			let sameDocumentDefault: extraction.DocumentExtraction | undefined;
			vi.mocked(extraction.extractDocument).mockImplementation(
				(tree, options) => {
					if (options?.compactTables === true) {
						expect(tree.url).toBe(targetUrl);
						expect(options).toEqual({
							...extractionOptions,
							compactTables: true,
						});
						sameDocumentDefault = originalExtract(tree, extractionOptions);
					}
					return originalExtract(tree, options);
				},
			);
			serve(article(fixture.body));
			const baseline = await researchLinkContent(mode.args);
			successful(baseline, mode);
			expect(markdown(baseline)).not.toHaveProperty("compactTables");
			serve(article(fixture.body));
			const compact = await researchLinkContent([flag, ...mode.args]);
			successful(compact, mode);
			const expectedContent = markdown(baseline)
				.content.replaceAll(markers.rowBegin, "**Native row begin**")
				.replaceAll(markers.cellBegin, "**Native cell begin**");
			expect(sameDocumentDefault).toBeDefined();
			expect(markdown(compact)).toEqual({
				...sameDocumentDefault,
				compactTables: true,
				content: expectedContent,
			});
			expect(Object.keys(compact).sort()).toEqual(Object.keys(baseline).sort());
			expect(compact.responses).toEqual(baseline.responses);
			for (const marker of [markers.tableBegin, markers.tableEnd]) {
				expect(markdown(baseline).content.split(marker)).toHaveLength(
					fixture.tables + 1,
				);
				expect(markdown(compact).content.split(marker)).toHaveLength(
					fixture.tables + 1,
				);
			}
			if (fixture.structural) {
				expect(markdown(baseline).content).toContain(markers.rowBegin);
				expect(markdown(baseline).content).toContain(markers.cellBegin);
				expect(Buffer.byteLength(markdown(compact).content)).toBeLessThan(
					Buffer.byteLength(markdown(baseline).content),
				);
			} else expect(markdown(compact).content).toBe(markdown(baseline).content);
			if (fixture.rowList) {
				expect(markdown(baseline).content).toContain(fixture.rowList);
				expect(markdown(compact).content).toContain(fixture.rowList);
			}
			const destinationCalls = vi
				.mocked(extraction.extractDocument)
				.mock.calls.filter(
					([, options]) => options?.contentFocus === "main-content-v2",
				);
			expect(
				destinationCalls.map(([tree, options]) => ({ url: tree.url, options })),
			).toEqual([
				{ url: targetUrl, options: extractionOptions },
				{
					url: targetUrl,
					options: { ...extractionOptions, compactTables: true },
				},
			]);
			for (const [, options] of vi.mocked(extraction.extractDocument).mock
				.calls)
				if (options?.contentFocus !== "main-content-v2")
					expect(options?.compactTables).toBeUndefined();
			expect(BrowserSession.prototype.click).toHaveBeenCalledTimes(2);
			for (const result of vi.mocked(BrowserSession.prototype.click).mock
				.results)
				expect((await result.value).navigation).toMatchObject({
					kind: "document",
					url: targetUrl,
				});
			requests([sourceUrl, targetUrl, sourceUrl, targetUrl]);
			for (const transport of vi.mocked(NodeNetworkTransport.prototype.request)
				.mock.contexts as NodeNetworkTransport[]) {
				expect(transport.limits).toMatchObject({
					timeoutMs: 15_000,
					maxResponseBytes: 4_000_000,
					maxRequestBytes: 1,
					maxHeaderBytes: 16_384,
					maxRedirects: 0,
					maxConcurrent: 1,
					maxRequests: 2,
					maxTotalBytes: 8_000_000,
				});
				expect(Reflect.get(transport, "requestPacer")).toMatchObject({
					intervalMs: 2000,
				});
			}
			for (const session of vi.mocked(BrowserSession.prototype.navigate).mock
				.contexts as BrowserSession[])
				expect(session.limits).toMatchObject({
					maxTabs: 1,
					maxNavigations: 2,
					maxPendingNavigations: 1,
					navigationTimeoutMs: 20_000,
				});
			const loads = vi.mocked(loader.loadResearchDocument).mock;
			for (const [index, call] of loads.calls.entries()) {
				if (call[4] !== "source-hidden-inline-v1") continue;
				expect(call.slice(2)).toEqual([
					"long-v1",
					"separate-omitted-raw-v1",
					"source-hidden-inline-v1",
					undefined,
					"utf-8",
				]);
				expect(loads.results[index].value.limits).toMatchObject(
					researchLongDocumentAdmission.document,
				);
			}
		},
	);

	it.each([
		{
			name: "structural success",
			body: article(fixtures[1].body),
			sourceStatus: 200,
			targetStatus: 200,
			outcome: "extracted-unverified",
			stage: "complete",
			exitCode: 0,
		},
		{
			name: "non-table success",
			body: article(fixtures[3].body),
			sourceStatus: 200,
			targetStatus: 200,
			outcome: "extracted-unverified",
			stage: "complete",
			exitCode: 0,
		},
		{
			name: "empty target",
			body: "<main></main>",
			sourceStatus: 200,
			targetStatus: 200,
			outcome: "empty-extraction",
			stage: "extraction",
			exitCode: 1,
		},
		{
			name: "source failure",
			body: article(fixtures[1].body),
			sourceStatus: 500,
			targetStatus: 200,
			outcome: "http-failure",
			stage: "source-navigation",
			exitCode: 1,
		},
		{
			name: "target failure",
			body: article(fixtures[1].body),
			sourceStatus: 200,
			targetStatus: 500,
			outcome: "http-failure",
			stage: "native-click",
			exitCode: 1,
		},
	])(
		"roundtrips $name JSONL and preserves caller ownership",
		async (fixture) => {
			const timers = vi.spyOn(globalThis, "setTimeout");
			const clear = vi.spyOn(globalThis, "clearTimeout");
			serve(fixture.body, fixture.sourceStatus, fixture.targetStatus);
			const output = sink();
			const before = listeners(output.output);
			const controller = new AbortController();
			controllers.push(controller);
			controller.signal.addEventListener("abort", () => undefined);
			const abortListeners = getEventListeners(controller.signal, "abort");
			expect(
				await runResearchLinkContentCli(
					[...mode.args, flag],
					output.output,
					controller.signal,
				),
			).toBe(fixture.exitCode);
			const text = output.text();
			expect(text.endsWith("\n")).toBe(true);
			expect(text.trimEnd().split("\n")).toHaveLength(1);
			expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
				researchLinkContentLimits.maxOutputBytes,
			);
			const report: Report = JSON.parse(text);
			expect(report).toMatchObject({
				kind: "native-research-link-content-v1",
				partial: true,
				contentSuccess: fixture.exitCode === 0 ? null : false,
				outcome: fixture.outcome,
				stage: fixture.stage,
			});
			expect(report).not.toHaveProperty("compactTables");
			if (fixture.outcome === "http-failure") {
				expect(report).not.toHaveProperty("extraction");
				expect(report.failure).toEqual({
					category: "policy-denied",
					stage: fixture.stage,
				});
				expect(
					vi
						.mocked(extraction.extractDocument)
						.mock.calls.filter(
							([, options]) => options?.contentFocus === "main-content-v2",
						),
				).toHaveLength(0);
			} else {
				expect(markdown(report)).toMatchObject({
					compactTables: true,
					tableRows: true,
				});
				const extractionResults = vi.mocked(extraction.extractDocument).mock
					.results;
				expect(report.extraction).toEqual(
					JSON.parse(JSON.stringify(extractionResults.at(-1)?.value)),
				);
				if (fixture.exitCode === 0) successful(report, mode);
				else expect(markdown(report).content).toBe("");
			}
			const reachedTarget = fixture.sourceStatus === 200;
			expect(report.events).toEqual(
				reachedTarget ? ["mousedown", "mouseup", "click"] : [],
			);
			expect(report.documentClosedStates).toEqual(
				!reachedTarget
					? []
					: fixture.targetStatus === 200
						? [true, true]
						: [true],
			);
			expect(BrowserSession.prototype.click).toHaveBeenCalledTimes(
				reachedTarget ? 1 : 0,
			);
			requests(reachedTarget ? [sourceUrl, targetUrl] : [sourceUrl]);
			closed(report);
			expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(controller.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(output.output.destroyed).toBe(false);
			expect(output.output.writableEnded).toBe(false);
			expect(controller.signal.aborted).toBe(false);
			expect(timers).toHaveBeenCalledWith(expect.any(Function), 60_000);
			for (const [index, call] of timers.mock.calls.entries())
				if (call[1] === 60_000)
					expect(clear).toHaveBeenCalledWith(timers.mock.results[index].value);
		},
	);
});
