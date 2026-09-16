import { createHash } from "node:crypto";
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
import type { BrowserEvent } from "./events.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchLongDocumentAdmission } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { BrowserSession } from "./session.js";

type Report = Awaited<ReturnType<typeof researchLinkContent>>;

const sourceUrl = "https://link-content.fixture.invalid/index";
const targetUrl = "https://link-content.fixture.invalid/articles/owned";
const selector = "#chosen";
const source =
	'<h1>Saved index</h1><main><a id="chosen" href="/articles/owned">Read owned article</a></main>';
const article =
	"<main><h1>Owned article</h1><p>Saved introduction: café.</p><table><tr><th>Name</th></tr><tr><td>Owned row</td></tr></table><p hidden>HIDDEN_SENTINEL</p><script>RAW_SENTINEL</script><style>.RAW_STYLE_SENTINEL{}</style></main>";
const privateFailure = "PRIVATE_LINK_CONTENT_FAILURE";
const originalClick = BrowserSession.prototype.click;
const originalPage = BrowserSession.prototype.page;
const originalLoad = loader.loadResearchDocument;
const originalExtract = extraction.extractDocument;
const outputs: Writable[] = [];
const completions: Array<() => void> = [];
const controllers: AbortController[] = [];

function args(link = targetUrl, page = sourceUrl, selected = selector) {
	return ["--target", link, "--selector", selected, page];
}

function response(
	url: string,
	bodyText: string,
	options: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(bodyText);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...options,
	};
}

function serve(
	bodyText = source,
	targetText = article,
	sourceOptions: Partial<NetworkResponse> = {},
	targetOptions: Partial<NetworkResponse> = {},
) {
	const responses = [
		response(sourceUrl, bodyText, sourceOptions),
		response(targetUrl, targetText, targetOptions),
	];
	for (const value of responses)
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			value,
		);
	return responses;
}

function articleCard(headingTag: "h3" | "h5", titleOn: "anchor" | "heading") {
	const title = ' title="Synthetic card metadata"';
	return `<main><article>
		<a id="card-image" href="${targetUrl}"><img alt="Synthetic card image"></a>
		<${headingTag} class="display-card-title"${titleOn === "heading" ? title : ""}>
			<a id="chosen" href="${targetUrl}"${titleOn === "anchor" ? title : ""}>Synthetic card headline</a>
		</${headingTag}>
	</article></main>`;
}

function redirectStub(destination = targetUrl, visibleAnchor = true) {
	return `<!DOCTYPE html>
<html><head>
	<title>Synthetic documentation redirect</title>
	<script>location.replace("${destination}" + location.search + location.hash);</script>
	<meta http-equiv="refresh" content="0; url=${destination}">
	<link rel="canonical" href="${destination}">
</head><body><main>
	<h1>Documentation moved</h1>
	${visibleAnchor ? `<a id="chosen" href="${targetUrl}">Continue</a>` : ""}
</main></body></html>`;
}

function controller() {
	const value = new AbortController();
	controllers.push(value);
	return value;
}

function sink(
	options: {
		held?: boolean;
		throws?: boolean;
		errorListener?: boolean;
		emitClose?: boolean;
	} = {},
) {
	const chunks: Buffer[] = [];
	const callbacks: Array<(error?: Error) => void> = [];
	const output = new Writable({
		highWaterMark: 1,
		emitClose: options.emitClose ?? false,
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
	for (const event of ["error", "close", "drain", "finish"])
		if (event !== "error" || options.errorListener !== false)
			output.on(event, () => undefined);
	outputs.push(output);
	return {
		output,
		callbacks,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(output: Writable) {
	return new Map(
		output.eventNames().map((name) => [name, output.listeners(name)]),
	);
}

function pendingWriteGuards(
	output: Writable,
	before: ReturnType<typeof listeners>,
) {
	for (const event of new Set([
		...output.eventNames(),
		...before.keys(),
		"error",
		"close",
	])) {
		const callerListeners = before.get(event) ?? [];
		const current = output.listeners(event);
		if (event === "error" || event === "close") {
			expect(
				current.filter((listener) => !callerListeners.includes(listener)),
			).toHaveLength(1);
			expect(
				current.filter((listener) => callerListeners.includes(listener)),
			).toEqual(callerListeners);
		} else expect(current).toEqual(callerListeners);
	}
}

async function turns() {
	for (let turn = 0; turn < 32; turn++)
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
		throw new Error("Expected a sanitized link workflow error");
	expect(error.message.length).toBeGreaterThan(0);
	for (const text of [error.message, error.stack ?? "", JSON.stringify(error)])
		expect(text.toLowerCase()).not.toContain(privateFailure.toLowerCase());
	expect(error.cause).toBeUndefined();
	return error;
}

async function failed<Result>(operation: ReturnType<typeof observe<Result>>) {
	await turns();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	return sanitized(outcome && "error" in outcome ? outcome.error : undefined);
}

function requests(expected: readonly string[]) {
	const calls = vi.mocked(NodeNetworkTransport.prototype.request).mock.calls;
	expect(calls.map(([request]) => request.url)).toEqual(expected);
	for (const [request] of calls) {
		expect(request.method ?? "GET").toBe("GET");
		expect(request.body).toBeUndefined();
		expect(request.cookieContext?.credentials).toBe("omit");
		const headers = Object.fromEntries(
			Object.entries(request.headers ?? {}).map(([name, value]) => [
				name.toLowerCase(),
				value,
			]),
		);
		expect(headers).toMatchObject({ "user-agent": "AgentBrowser/0.1" });
		for (const name of ["cookie", "authorization", "proxy-authorization"])
			expect(headers).not.toHaveProperty(name);
	}
}

function closed() {
	expect(BrowserSession.prototype.close).toHaveBeenCalled();
	for (const session of vi.mocked(BrowserSession.prototype.close).mock
		.contexts as BrowserSession[])
		expect(session.metrics()).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 0,
			network: { active: 0, closed: true },
		});
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	for (const result of vi.mocked(loader.loadResearchDocument).mock.results) {
		if (result.type === "return")
			expect(result.value.mutationMetrics().closed).toBe(true);
	}
}

function projectedLoads() {
	const mocked = vi.mocked(loader.loadResearchDocument).mock;
	return mocked.calls.flatMap((call, index) =>
		call[4] === "source-hidden-inline-v1"
			? [{ call, document: mocked.results[index].value }]
			: [],
	);
}

function noExtraction() {
	expect(
		vi
			.mocked(extraction.extractDocument)
			.mock.calls.filter(
				([, options]) => options?.contentFocus === "main-content-v2",
			),
	).toHaveLength(0);
}

function unsuccessful(report: Report, outcome = "failure") {
	expect(report).toMatchObject({
		kind: "native-research-link-content-v1",
		partial: true,
		contentSuccess: false,
		outcome,
		sourceUrl,
		targetUrl,
		selector,
		stage: expect.any(String),
		failure: { category: expect.any(String), stage: expect.any(String) },
	});
	expect(JSON.stringify(report)).not.toContain(privateFailure);
	expect(report.metrics).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		network: { active: 0, closed: true },
	});
	expect(report.documentClosedStates.every(Boolean)).toBe(true);
	closed();
}

beforeEach(() => {
	vi.spyOn(globalThis, "setTimeout");
	vi.spyOn(globalThis, "clearTimeout");
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
	vi.spyOn(BrowserSession.prototype, "click");
	vi.spyOn(BrowserSession.prototype, "navigate");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Link-content tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
		for (const [index, call] of vi.mocked(setTimeout).mock.calls.entries()) {
			if (call[1] === 60_000)
				expect(clearTimeout).toHaveBeenCalledWith(
					vi.mocked(setTimeout).mock.results[index].value,
				);
		}
	} finally {
		for (const value of controllers.splice(0)) value.abort();
		for (const complete of completions.splice(0)) complete();
		for (const output of outputs.splice(0)) output.destroy();
		for (const session of vi.mocked(BrowserSession.prototype.navigate).mock
			.contexts as BrowserSession[])
			session.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("link-content argument preflight", () => {
	it.each([
		args(),
		[sourceUrl, "--selector", selector, "--target", targetUrl],
		["--selector", selector, "--target", targetUrl, sourceUrl],
		["--target", targetUrl, sourceUrl, "--selector", selector],
	])("accepts required arguments in either order %#", (...input) => {
		expect(parseResearchLinkContentArguments(input)).toEqual({
			url: sourceUrl,
			targetUrl,
			selector,
		});
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	});

	it.each([
		[],
		[sourceUrl],
		["--target", targetUrl, sourceUrl],
		["--selector", selector, sourceUrl],
		["--target", targetUrl, "--selector", selector],
		[...args(), sourceUrl],
		[...args(), "--target", targetUrl],
		[...args(), "--selector", selector],
		["--target", targetUrl, "--target", targetUrl, sourceUrl],
		["--selector", selector, "--selector", selector, sourceUrl],
		[sourceUrl, "--target", targetUrl, "--selector"],
		["--unknown", targetUrl, "--selector", selector, sourceUrl],
		args(targetUrl, sourceUrl, ""),
		args(targetUrl, sourceUrl, " "),
		args(targetUrl, sourceUrl, " #chosen"),
		args(targetUrl, sourceUrl, "#chosen "),
		args(targetUrl, sourceUrl, "["),
		args(targetUrl, sourceUrl, "a::before"),
		args(targetUrl, sourceUrl, "a:before"),
		args(targetUrl, sourceUrl, `a:${privateFailure}`),
		args(targetUrl, sourceUrl, "x".repeat(4097)),
	])("rejects malformed arguments before transport %#", async (...input) => {
		expect(() => parseResearchLinkContentArguments(input)).toThrow(
			AgentBrowserError,
		);
		expect((await failed(observe(researchLinkContent(input)))).code).toBe(
			"invalid-input",
		);
		const output = sink();
		const before = listeners(output.output);
		expect(
			(await failed(observe(runResearchLinkContentCli(input, output.output))))
				.code,
		).toBe("invalid-input");
		expect(output.text()).toBe("");
		expect(listeners(output.output)).toEqual(before);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(loader.loadResearchDocument).not.toHaveBeenCalled();
	});

	it.each([
		"http://link-content.fixture.invalid/article",
		"file:///synthetic-link-content-fixture",
		"https://other.fixture.invalid/article",
		`https://user:${privateFailure}@link-content.fixture.invalid/article`,
		`${targetUrl}?token=${privateFailure}`,
		`${targetUrl}#${privateFailure}`,
		"https://link-content.fixture.invalid/%61rticle",
		"https://link-content.fixture.invalid/account/profile",
		"https://link-content.fixture.invalid/login",
		"https://link-content.fixture.invalid/logout",
		"https://link-content.fixture.invalid/checkout",
		"https://link-content.fixture.invalid/articles\\owned",
		"https://link-content.fixture.invalid/art\ticle",
		` ${targetUrl}`,
		`${targetUrl}${"x".repeat(4096)}`,
	])(
		"rejects unsafe source and target URLs before transport %#",
		async (url) => {
			for (const input of [args(url), args(targetUrl, url)]) {
				expect(() => parseResearchLinkContentArguments(input)).toThrow(
					AgentBrowserError,
				);
				expect((await failed(observe(researchLinkContent(input)))).code).toBe(
					"invalid-input",
				);
			}
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		},
	);
});

describe.each(["source", "target"] as const)(
	"review regression: %s URL control preflight",
	(position) => {
		it.each([
			{ name: "U+0080", control: "\u0080" },
			{ name: "U+0085", control: "\u0085" },
			{ name: "U+009F", control: "\u009f" },
		])(
			"rejects literal $name generically before transport",
			async ({ control }) => {
				const url = `${position === "source" ? sourceUrl : targetUrl}/${privateFailure}${control}article`;
				const input = position === "source" ? args(targetUrl, url) : args(url);
				expect(() => parseResearchLinkContentArguments(input)).toThrow(
					new AgentBrowserError(
						"invalid-input",
						"Invalid link content arguments",
					),
				);
				expect((await failed(observe(researchLinkContent(input)))).code).toBe(
					"invalid-input",
				);
				const output = sink();
				const before = listeners(output.output);
				expect(
					(
						await failed(
							observe(runResearchLinkContentCli(input, output.output)),
						)
					).code,
				).toBe("invalid-input");
				expect(output.text()).toBe("");
				expect(listeners(output.output)).toEqual(before);
				expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
				expect(loader.loadResearchDocument).not.toHaveBeenCalled();
			},
		);

		it("still accepts an ordinary Unicode article path", () => {
			const url = `${position === "source" ? sourceUrl : targetUrl}/café`;
			const input = position === "source" ? args(targetUrl, url) : args(url);
			expect(parseResearchLinkContentArguments(input)).toEqual({
				url: position === "source" ? `${sourceUrl}/caf%C3%A9` : sourceUrl,
				targetUrl: position === "target" ? `${targetUrl}/caf%C3%A9` : targetUrl,
				selector,
			});
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		});
	},
);

describe("native source-present link navigation", () => {
	it("performs two exact GETs through a real click, extracts unverified content, and closes both documents", async () => {
		const responses = serve();
		const observedEvents: string[] = [];
		vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(function (
			this: BrowserSession,
			tab,
			reference,
			options,
		) {
			const page = this.page(tab);
			const node = page.queries.querySelector(selector);
			if (node === null) throw new Error("Missing fixture anchor");
			for (const event of ["mousedown", "mouseup", "click"])
				page.interactions.events.addEventListener(node, event, () =>
					observedEvents.push(event),
				);
			return originalClick.call(this, tab, reference, options);
		});
		const report = await researchLinkContent(args());
		expect(report).toMatchObject({
			kind: "native-research-link-content-v1",
			partial: true,
			outcome: "extracted-unverified",
			contentSuccess: null,
			sourceUrl,
			targetUrl,
			selector,
			selection: {
				reference: expect.any(String),
				label: "Read owned article",
				url: targetUrl,
				candidates: 1,
			},
			events: ["mousedown", "mouseup", "click"],
		});
		expect(observedEvents).toEqual(["mousedown", "mouseup", "click"]);
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
		const click = await vi.mocked(BrowserSession.prototype.click).mock
			.results[0].value;
		expect(click.navigation).toMatchObject({
			kind: "document",
			url: targetUrl,
		});
		requests([sourceUrl, targetUrl]);
		expect(projectedLoads()).toHaveLength(2);
		for (const [index, { call, document }] of projectedLoads().entries()) {
			expect(call).toEqual([
				responses[index],
				expect.any(Object),
				"long-v1",
				"separate-omitted-raw-v1",
				"source-hidden-inline-v1",
				undefined,
				"utf-8",
			]);
			expect(document.limits).toMatchObject(
				researchLongDocumentAdmission.document,
			);
		}
		expect(extraction.extractDocument).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				format: "markdown",
				contentFocus: "main-content-v2",
				tableRows: true,
				outputLimitPolicy: "text-prefix-v1",
				maxBytes: 256_000,
			}),
		);
		expect(report.extraction?.content).toContain("café");
		expect(report.extraction?.content).toContain("Owned row");
		for (const secret of [
			"HIDDEN_SENTINEL",
			"RAW_SENTINEL",
			"RAW_STYLE_SENTINEL",
		])
			expect(report.extraction?.content).not.toContain(secret);
		expect(report.responses).toHaveLength(2);
		for (const [index, value] of responses.entries()) {
			expect(report.responses[index]).toEqual({
				url: value.url,
				status: 200,
				decodedBytes: value.body.byteLength,
				bodySha256: createHash("sha256").update(value.body).digest("hex"),
			});
		}
		expect(report.stage).toBe("complete");
		expect(report.documentClosedStates).toEqual([true, true]);
		expect(report.metrics).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			network: { active: 0, closed: true },
		});
		closed();
	});

	it("follows an observed documentation redirect-stub anchor through an explicit native target-link click", async () => {
		serve(redirectStub());
		const observedEvents: string[] = [];
		let anchorReference = "";
		vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(function (
			this: BrowserSession,
			tab,
			reference,
			options,
		) {
			const page = this.page(tab);
			const anchor = page.queries.querySelector(selector);
			if (anchor === null) throw new Error("Missing fixture redirect anchor");
			anchorReference = page.document.reference(anchor);
			expect(reference).toBe(anchorReference);
			for (const event of ["mousedown", "mouseup", "click"])
				page.interactions.events.addEventListener(anchor, event, () =>
					observedEvents.push(event),
				);
			return originalClick.call(this, tab, reference, options);
		});
		const report = await researchLinkContent([
			"--target-link",
			targetUrl,
			sourceUrl,
		]);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			sourceUrl,
			targetUrl,
			selectionMode: "exact-target-v1",
			selection: {
				reference: anchorReference,
				label: "Continue",
				url: targetUrl,
				candidates: 1,
			},
			events: ["mousedown", "mouseup", "click"],
			stage: "complete",
			documentClosedStates: [true, true],
		});
		expect(observedEvents).toEqual(["mousedown", "mouseup", "click"]);
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
		const click = await vi.mocked(BrowserSession.prototype.click).mock
			.results[0].value;
		expect(click.navigation).toMatchObject({
			kind: "document",
			url: targetUrl,
		});
		expect(report.extraction?.content).toContain("Owned article");
		expect(report.extraction?.content).toContain("Saved introduction: café\\.");
		expect(report.extraction?.content).toContain("Owned row");
		expect(report.extraction?.content).not.toContain("Documentation moved");
		expect(report.responses).toHaveLength(2);
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("stops a documentation redirect stub without a visible anchor at target-link selection", async () => {
		serve(redirectStub(targetUrl, false));
		const report = await researchLinkContent([
			"--target-link",
			targetUrl,
			sourceUrl,
		]);
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
			sourceUrl,
			targetUrl,
			selectionMode: "exact-target-v1",
			stage: "link-selection",
			failure: { category: "not-found", stage: "link-selection" },
			events: [],
			documentClosedStates: [true],
		});
		expect(report.selection).toBeUndefined();
		expect(report.responses).toHaveLength(1);
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		requests([sourceUrl]);
		noExtraction();
		closed();
	});

	it("clicks the explicit target anchor instead of a conflicting declarative redirect destination", async () => {
		const declarativeUrl =
			"https://link-content.fixture.invalid/articles/declarative";
		serve(redirectStub(declarativeUrl));
		const report = await researchLinkContent([
			"--target-link",
			targetUrl,
			sourceUrl,
		]);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			sourceUrl,
			targetUrl,
			selectionMode: "exact-target-v1",
			selection: {
				reference: expect.any(String),
				label: "Continue",
				url: targetUrl,
				candidates: 1,
			},
			events: ["mousedown", "mouseup", "click"],
			stage: "complete",
			documentClosedStates: [true, true],
		});
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.click).toHaveBeenCalledWith(
			expect.any(String),
			report.selection?.reference,
			expect.any(Object),
		);
		const click = await vi.mocked(BrowserSession.prototype.click).mock
			.results[0].value;
		expect(click.navigation).toMatchObject({
			kind: "document",
			url: targetUrl,
		});
		expect(report.extraction?.content).toContain("Owned article");
		expect(report.extraction?.content).toContain("Saved introduction: café\\.");
		expect(report.extraction?.content).toContain("Owned row");
		expect(report.extraction?.content).not.toContain(declarativeUrl);
		expect(report.responses).toHaveLength(2);
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("configures bounded credential-free native transport and navigation", async () => {
		serve();
		await researchLinkContent(args());
		const transport = vi.mocked(NodeNetworkTransport.prototype.request).mock
			.contexts[0] as NodeNetworkTransport;
		expect(transport.limits).toMatchObject({
			timeoutMs: 15_000,
			maxResponseBytes: 4_000_000,
			maxTotalBytes: 8_000_000,
			maxRequests: 2,
			maxConcurrent: 1,
			maxRedirects: 0,
		});
		expect(Reflect.get(transport, "requestPacer")).toMatchObject({
			intervalMs: 2000,
		});
		const session = vi.mocked(BrowserSession.prototype.navigate).mock
			.contexts[0] as BrowserSession;
		expect(session.limits).toMatchObject({ navigationTimeoutMs: 20_000 });
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("keeps empty target extraction unsuccessful without fallback", async () => {
		serve(source, "<main></main>");
		const report = await researchLinkContent(args());
		expect(report).toMatchObject({
			outcome: "empty-extraction",
			partial: true,
			contentSuccess: false,
		});
		expect(report.extraction).toMatchObject({
			format: "markdown",
			content: "",
		});
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("accepts exactly one eligible target among unrelated selector matches", async () => {
		serve(`${source}<a href="/articles/other">Other article</a>`);
		const report = await researchLinkContent(args(targetUrl, sourceUrl, "a"));
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { url: targetUrl, candidates: 2 },
		});
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("refuses an anchor-title selector when article-card metadata moves to the h5 heading", async () => {
		serve(articleCard("h5", "heading"));
		const selected = `a[href="${targetUrl}"][title]`;
		const report = await researchLinkContent(
			args(targetUrl, sourceUrl, selected),
		);
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
			sourceUrl,
			targetUrl,
			selector: selected,
			stage: "link-selection",
			failure: { category: "not-found", stage: "link-selection" },
			events: [],
			documentClosedStates: [true],
		});
		expect(report.selection).toBeUndefined();
		expect(report.responses).toHaveLength(1);
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		requests([sourceUrl]);
		noExtraction();
		closed();
	});

	it.each([
		{ headingTag: "h3", titleOn: "anchor" },
		{ headingTag: "h5", titleOn: "heading" },
	] as const)(
		"selects the article-card headline under $headingTag with title metadata on the $titleOn",
		async ({ headingTag, titleOn }) => {
			serve(articleCard(headingTag, titleOn));
			const selected = `.display-card-title > a[href="${targetUrl}"]`;
			const observedEvents: string[] = [];
			let headlineReference = "";
			vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(
				function (this: BrowserSession, tab, reference, options) {
					const page = this.page(tab);
					const headline = page.queries.querySelector(selector);
					const image = page.queries.querySelector("#card-image");
					if (headline === null || image === null)
						throw new Error("Missing fixture article-card anchors");
					expect(
						page.queries.querySelectorAll(`a[href="${targetUrl}"]`),
					).toEqual([image, headline]);
					expect(page.queries.querySelectorAll(selected)).toEqual([headline]);
					headlineReference = page.document.reference(headline);
					expect(reference).toBe(headlineReference);
					expect(reference).not.toBe(page.document.reference(image));
					for (const event of ["mousedown", "mouseup", "click"])
						page.interactions.events.addEventListener(headline, event, () =>
							observedEvents.push(event),
						);
					return originalClick.call(this, tab, reference, options);
				},
			);
			const report = await researchLinkContent(
				args(targetUrl, sourceUrl, selected),
			);
			expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
			expect(report).toMatchObject({
				outcome: "extracted-unverified",
				partial: true,
				contentSuccess: null,
				sourceUrl,
				targetUrl,
				selector: selected,
				selection: {
					reference: headlineReference,
					label: "Synthetic card headline",
					url: targetUrl,
					candidates: 1,
				},
				events: ["mousedown", "mouseup", "click"],
				stage: "complete",
				documentClosedStates: [true, true],
			});
			expect(observedEvents).toEqual(["mousedown", "mouseup", "click"]);
			const click = await vi.mocked(BrowserSession.prototype.click).mock
				.results[0].value;
			expect(click.navigation).toMatchObject({
				kind: "document",
				url: targetUrl,
			});
			expect(report.extraction?.content).toContain("Owned article");
			expect(report.extraction?.content).toContain("Owned row");
			expect(report.extraction?.content).not.toContain(
				"Synthetic card headline",
			);
			expect(report.responses).toHaveLength(2);
			requests([sourceUrl, targetUrl]);
			closed();
		},
	);

	it("accepts the 1000-character label boundary without truncating it", async () => {
		const label = "x".repeat(1000);
		serve(`<a id="chosen" href="/articles/owned">${label}</a>`);
		const report = await researchLinkContent(args());
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			selection: { label },
		});
		requests([sourceUrl, targetUrl]);
		closed();
	});

	it("stops an over-budget selector result before clicking", async () => {
		serve(source.repeat(researchLinkContentLimits.maxCandidates + 1));
		const report = await researchLinkContent(args());
		unsuccessful(report);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "link-selection",
		});
		requests([sourceUrl]);
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "missing", html: "<main>No selected link</main>" },
		{ name: "ambiguous", html: `${source}${source}` },
		{ name: "non-anchor", html: '<p id="chosen">Read owned article</p>' },
		{ name: "empty label", html: '<a id="chosen" href="/articles/owned"></a>' },
		{
			name: "whitespace label",
			html: '<a id="chosen" href="/articles/owned">  </a>',
		},
		{
			name: "oversized label",
			html: `<a id="chosen" href="/articles/owned">${"x".repeat(1001)}</a>`,
		},
		{
			name: "different target",
			html: '<a id="chosen" href="/articles/other">Other article</a>',
		},
		{
			name: "button role",
			html: '<a id="chosen" href="/articles/owned" role="button">Read article</a>',
		},
		{
			name: "source-hidden",
			html: '<a id="chosen" href="/articles/owned" hidden>Read article</a>',
		},
		{
			name: "different base",
			html: '<base href="https://other.fixture.invalid/"><a id="chosen" href="/articles/owned">Read article</a>',
		},
	])("does not click or guess a URL for $name selection", async ({ html }) => {
		serve(html);
		unsuccessful(await researchLinkContent(args()));
		requests([sourceUrl]);
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		noExtraction();
	});

	it.each([
		["onclick", privateFailure],
		["disabled", ""],
		["aria-disabled", "true"],
		["hidden", ""],
		["inert", ""],
		["download", "article"],
		["ping", "/track"],
		["rel", "external"],
		["rel", "sponsored"],
		["target", "_blank"],
	])(
		"refuses projected %s behavior without asserting source attribute retention",
		async (name, value) => {
			serve();
			vi.spyOn(BrowserSession.prototype, "page").mockImplementation(function (
				this: BrowserSession,
				tab,
			) {
				const page = originalPage.call(this, tab);
				if (page.document.url === sourceUrl) {
					const node = page.queries.querySelector(selector);
					if (
						node !== null &&
						page.document.get(node).attributes[name] !== value
					)
						page.document.setAttribute(node, name, value);
				}
				return page;
			});
			unsuccessful(await researchLinkContent(args()));
			requests([sourceUrl]);
			expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		},
	);

	it("does not directly navigate when the native click fails", async () => {
		serve();
		vi.mocked(BrowserSession.prototype.click).mockRejectedValueOnce(
			new AgentBrowserError("not-actionable", privateFailure),
		);
		const report = await researchLinkContent(args());
		unsuccessful(report);
		expect(report.failure?.category).toBe("not-actionable");
		requests([sourceUrl]);
		expect(BrowserSession.prototype.navigate).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
	});

	it("does not directly navigate when native click default is prevented", async () => {
		serve();
		vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(function (
			this: BrowserSession,
			tab,
			reference,
			options,
		) {
			const page = this.page(tab);
			const node = page.queries.querySelector(selector);
			if (node === null) throw new Error("Missing fixture anchor");
			page.interactions.events.addEventListener(
				node,
				"click",
				(event: BrowserEvent) => event.preventDefault(),
			);
			return originalClick.call(this, tab, reference, options);
		});
		unsuccessful(await researchLinkContent(args()));
		requests([sourceUrl]);
		expect(BrowserSession.prototype.navigate).toHaveBeenCalledOnce();
	});
});

describe.each(["source", "target"] as const)(
	"%s admission and cancellation",
	(stage) => {
		it.each([403, 429, 500, 302])(
			"does not retry HTTP %s or project its body",
			async (status) => {
				const options = {
					status,
					headers: {
						"content-type": ["text/html"],
						location: [targetUrl],
						"retry-after": ["60"],
					},
				};
				serve(
					source,
					article,
					stage === "source" ? options : {},
					stage === "target" ? options : {},
				);
				unsuccessful(await researchLinkContent(args()), "http-failure");
				requests(stage === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
				expect(projectedLoads()).toHaveLength(stage === "source" ? 0 : 1);
				noExtraction();
			},
		);

		it.each(["header", "hidden source text"] as const)(
			"stops a %s barrier before reader projection",
			async (barrier) => {
				const text = `<title>Just a moment...</title><aside hidden>Checking your browser. Verify you are human. Complete the CAPTCHA.</aside>${stage === "source" ? source : article}`;
				const options =
					barrier === "header"
						? {
								headers: {
									"content-type": ["text/html"],
									"cf-mitigated": ["challenge"],
								},
							}
						: {};
				serve(
					stage === "source" && barrier !== "header" ? text : source,
					stage === "target" && barrier !== "header" ? text : article,
					stage === "source" ? options : {},
					stage === "target" ? options : {},
				);
				const report = await researchLinkContent(args());
				unsuccessful(report, "semantic-barrier");
				expect(report.barrier).toBeTruthy();
				requests(stage === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
				expect(projectedLoads()).toHaveLength(stage === "source" ? 0 : 1);
				noExtraction();
			},
		);

		it.each(["timeout", "resource-limit", "network-error"] as const)(
			"sanitizes %s without retry",
			async (category) => {
				if (stage === "target")
					vi.mocked(
						NodeNetworkTransport.prototype.request,
					).mockResolvedValueOnce(response(sourceUrl, source));
				vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
					new AgentBrowserError(category, privateFailure),
				);
				const report = await researchLinkContent(args());
				unsuccessful(report);
				expect(report.failure?.category).toBe(category);
				requests(stage === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
			},
		);

		it("rejects an unexpected final response URL without following it", async () => {
			const options = { url: "https://other.fixture.invalid/unexpected" };
			serve(
				source,
				article,
				stage === "source" ? options : {},
				stage === "target" ? options : {},
			);
			unsuccessful(await researchLinkContent(args()));
			requests(stage === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
			noExtraction();
		});

		it("propagates sanitized cancellation during the request and closes ownership", async () => {
			const cancellation = controller();
			if (stage === "target")
				vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
					response(sourceUrl, source),
				);
			vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
				async () => {
					cancellation.abort(new Error(privateFailure));
					throw new AgentBrowserError("aborted", privateFailure);
				},
			);
			const output = sink();
			const before = listeners(output.output);
			const abortListeners = getEventListeners(cancellation.signal, "abort");
			expect(
				(
					await failed(
						observe(
							runResearchLinkContentCli(
								args(),
								output.output,
								cancellation.signal,
							),
						),
					)
				).code,
			).toBe("aborted");
			expect(output.text()).toBe("");
			expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			requests(stage === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
			closed();
		});
	},
);

describe("link-content extraction and cleanup failures", () => {
	it("sanitizes an extraction error after native navigation without retry", async () => {
		serve();
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				if (options?.contentFocus === "main-content-v2")
					throw new Error(privateFailure);
				return originalExtract(tree, options);
			},
		);
		const report = await researchLinkContent(args());
		unsuccessful(report);
		expect(report.failure).toEqual({
			category: "network-error",
			stage: "extraction",
		});
		requests([sourceUrl, targetUrl]);
	});

	it.each([false, true])(
		"closes documents and transport when session close throws, preserving primary failure: %s",
		async (primaryFailure) => {
			serve();
			if (primaryFailure)
				vi.mocked(BrowserSession.prototype.click).mockRejectedValueOnce(
					new AgentBrowserError("not-actionable", privateFailure),
				);
			vi.mocked(BrowserSession.prototype.close).mockImplementationOnce(() => {
				throw new Error(privateFailure);
			});
			const report = await researchLinkContent(args());
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				cleanupFailed: true,
				failure: primaryFailure
					? { category: "not-actionable", stage: "native-click" }
					: { category: "closed", stage: "cleanup" },
			});
			expect(report.documentClosedStates).toEqual(
				primaryFailure ? [true] : [true, true],
			);
			expect(report.metrics?.network).toMatchObject({
				active: 0,
				closed: true,
			});
			expect(JSON.stringify(report)).not.toContain(privateFailure);
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
			requests(primaryFailure ? [sourceUrl] : [sourceUrl, targetUrl]);
		},
	);
});

describe("in-memory link-content CLI lifecycle", () => {
	it.each([
		{
			target: article,
			status: 200,
			exitCode: 0,
			outcome: "extracted-unverified",
		},
		{
			target: "<main></main>",
			status: 200,
			exitCode: 1,
			outcome: "empty-extraction",
		},
		{ target: article, status: 500, exitCode: 1, outcome: "http-failure" },
	])(
		"writes one bounded JSONL report for $outcome",
		async ({ target, status, exitCode, outcome }) => {
			serve(source, target, {}, { status });
			const output = sink();
			const before = listeners(output.output);
			const cancellation = controller();
			const abortListeners = getEventListeners(cancellation.signal, "abort");
			expect(
				await runResearchLinkContentCli(
					args(),
					output.output,
					cancellation.signal,
				),
			).toBe(exitCode);
			const text = output.text();
			expect(text.endsWith("\n")).toBe(true);
			expect(text.trimEnd().split("\n")).toHaveLength(1);
			expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
				researchLinkContentLimits.maxOutputBytes,
			);
			expect(JSON.parse(text)).toMatchObject({
				kind: "native-research-link-content-v1",
				outcome,
				partial: true,
				contentSuccess: exitCode === 0 ? null : false,
			});
			expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(output.output.destroyed).toBe(false);
			expect(output.output.writableEnded).toBe(false);
			expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 60_000);
			requests([sourceUrl, targetUrl]);
			closed();
		},
	);

	it("waits for backpressure and preserves caller-owned streams and listeners", async () => {
		serve();
		const output = sink({ held: true });
		const before = listeners(output.output);
		const operation = observe(runResearchLinkContentCli(args(), output.output));
		await turns();
		expect(output.callbacks).toHaveLength(1);
		expect(operation.outcome).toBeUndefined();
		closed();
		output.callbacks[0]();
		await turns();
		expect(operation.outcome).toEqual({ value: 0 });
		expect(listeners(output.output)).toEqual(before);
		expect(output.output.destroyed).toBe(false);
		expect(output.output.writableEnded).toBe(false);
	});

	it("rejects an oversized JSONL report before writing any output", async () => {
		serve();
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				const extracted = originalExtract(tree, options);
				return options?.contentFocus === "main-content-v2"
					? {
							...extracted,
							format: "markdown" as const,
							content: "x".repeat(researchLinkContentLimits.maxOutputBytes + 1),
						}
					: extracted;
			},
		);
		const output = sink();
		const before = listeners(output.output);
		expect(
			(await failed(observe(runResearchLinkContentCli(args(), output.output))))
				.code,
		).toBe("resource-limit");
		expect(output.text()).toBe("");
		expect(listeners(output.output)).toEqual(before);
		closed();
	});

	it.each(["callback", "throw", "close", "abort"] as const)(
		"cleans up %s during held output without exposing private errors",
		async (failure) => {
			serve();
			const output = sink({ held: true, throws: failure === "throw" });
			const before = listeners(output.output);
			const cancellation = controller();
			const callerAbort = vi.fn();
			cancellation.signal.addEventListener("abort", callerAbort);
			const abortListeners = getEventListeners(cancellation.signal, "abort");
			const operation = observe(
				runResearchLinkContentCli(args(), output.output, cancellation.signal),
			);
			await turns();
			expect(output.callbacks).toHaveLength(1);
			if (failure === "callback")
				output.callbacks[0](new Error(privateFailure));
			if (failure === "close") output.output.emit("close");
			if (failure === "abort") cancellation.abort(new Error(privateFailure));
			expect((await failed(operation)).code).toBe(
				failure === "abort" ? "aborted" : "closed",
			);
			if (failure === "abort" || failure === "throw")
				pendingWriteGuards(output.output, before);
			else expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			if (failure === "abort" || failure === "throw") {
				if (failure === "abort") expect(callerAbort).toHaveBeenCalledOnce();
				expect(output.output.destroyed).toBe(false);
				expect(output.output.writableEnded).toBe(false);
				output.callbacks[0]();
				await turns();
				expect(listeners(output.output)).toEqual(before);
			}
			requests([sourceUrl, targetUrl]);
			closed();
		},
	);

	it.each(["destroyed", "ended"] as const)(
		"refuses %s output before transport",
		async (state) => {
			const output = sink();
			if (state === "destroyed") output.output.destroy();
			else output.output.end();
			await turns();
			const before = listeners(output.output);
			expect(
				(
					await failed(
						observe(runResearchLinkContentCli(args(), output.output)),
					)
				).code,
			).toBe("closed");
			expect(listeners(output.output)).toEqual(before);
			expect(output.text()).toBe("");
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		},
	);

	it("pre-aborts without transport and sanitizes the cancellation reason", async () => {
		const cancellation = controller();
		cancellation.abort(new Error(privateFailure));
		expect(
			(await failed(observe(researchLinkContent(args(), cancellation.signal))))
				.code,
		).toBe("aborted");
		const output = sink();
		const before = listeners(output.output);
		expect(
			(
				await failed(
					observe(
						runResearchLinkContentCli(
							args(),
							output.output,
							cancellation.signal,
						),
					),
				)
			).code,
		).toBe("aborted");
		expect(output.text()).toBe("");
		expect(listeners(output.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toHaveLength(0);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	});

	it("checks cancellation after reader work before clicking or emitting output", async () => {
		serve();
		const cancellation = controller();
		vi.mocked(loader.loadResearchDocument).mockImplementation((...input) => {
			const document = originalLoad(...input);
			if (input[4] === "source-hidden-inline-v1")
				cancellation.abort(new Error(privateFailure));
			return document;
		});
		const output = sink();
		expect(
			(
				await failed(
					observe(
						runResearchLinkContentCli(
							args(),
							output.output,
							cancellation.signal,
						),
					),
				)
			).code,
		).toBe("aborted");
		expect(output.text()).toBe("");
		requests([sourceUrl]);
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		closed();
	});

	it("checks cancellation after extraction without emitting a successful report", async () => {
		serve();
		const cancellation = controller();
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				const extracted = originalExtract(tree, options);
				if (options?.contentFocus === "main-content-v2")
					cancellation.abort(new Error(privateFailure));
				return extracted;
			},
		);
		const output = sink();
		const before = listeners(output.output);
		expect(
			(
				await failed(
					observe(
						runResearchLinkContentCli(
							args(),
							output.output,
							cancellation.signal,
						),
					),
				)
			).code,
		).toBe("aborted");
		expect(output.text()).toBe("");
		expect(listeners(output.output)).toEqual(before);
		expect(getEventListeners(cancellation.signal, "abort")).toHaveLength(0);
		requests([sourceUrl, targetUrl]);
		closed();
	});
});

describe.each([false, true])(
	"review regression: pending writes with caller error listener %s",
	(hasCallerListener) => {
		it.each([
			{ stop: "abort", settlement: "callback-success" },
			{ stop: "abort", settlement: "callback-error" },
			{ stop: "abort", settlement: "close" },
			{ stop: "deadline", settlement: "callback-success" },
			{ stop: "deadline", settlement: "callback-error" },
			{ stop: "deadline", settlement: "close" },
		] as const)(
			"retains guards after $stop until $settlement",
			async ({ stop, settlement }) => {
				serve();
				const output = sink({
					held: true,
					errorListener: false,
					emitClose: settlement === "close",
				});
				const callerError = vi.fn();
				if (hasCallerListener) output.output.on("error", callerError);
				const before = listeners(output.output);
				const cancellation = controller();
				const callerAbort = vi.fn();
				cancellation.signal.addEventListener("abort", callerAbort);
				const abortListeners = getEventListeners(cancellation.signal, "abort");
				const operation = observe(
					runResearchLinkContentCli(args(), output.output, cancellation.signal),
				);
				try {
					await turns();
					expect(output.callbacks).toHaveLength(1);
					expect(operation.outcome).toBeUndefined();
					expect(output.output.listenerCount("error")).toBeGreaterThan(
						hasCallerListener ? 1 : 0,
					);
					const abort = vi.spyOn(AbortController.prototype, "abort");
					const timers = vi.mocked(setTimeout).mock;
					const deadlineIndex = timers.calls.findIndex(
						([, delay]) => delay === researchLinkContentLimits.timeoutMs,
					);
					expect(deadlineIndex).toBeGreaterThanOrEqual(0);
					if (stop === "abort") cancellation.abort(new Error(privateFailure));
					else {
						const expire = timers.calls[deadlineIndex][0];
						if (typeof expire !== "function")
							throw new Error("Missing command deadline callback");
						expire();
					}
					const rejection = await failed(operation);
					expect(rejection.code).toBe(stop === "abort" ? "aborted" : "timeout");
					expect(clearTimeout).toHaveBeenCalledWith(
						timers.results[deadlineIndex].value,
					);
					expect(getEventListeners(cancellation.signal, "abort")).toEqual(
						abortListeners,
					);
					for (const owner of abort.mock.contexts as AbortController[])
						expect(getEventListeners(owner.signal, "abort")).toEqual(
							owner === cancellation ? abortListeners : [],
						);
					expect(callerAbort).toHaveBeenCalledTimes(stop === "abort" ? 1 : 0);
					expect(output.output.destroyed).toBe(false);
					expect(output.output.writableEnded).toBe(false);
					pendingWriteGuards(output.output, before);
					await turns();
					pendingWriteGuards(output.output, before);
					closed();
					if (settlement === "callback-error")
						output.callbacks[0](new Error(privateFailure));
					else if (settlement === "callback-success") output.callbacks[0]();
					else output.output.destroy();
					await turns();
					expect(operation.outcome).toEqual({ error: rejection });
					expect(listeners(output.output)).toEqual(before);
					expect(getEventListeners(cancellation.signal, "abort")).toEqual(
						abortListeners,
					);
					if (settlement === "callback-error" && hasCallerListener) {
						expect(callerError).toHaveBeenCalledOnce();
						expect(callerError.mock.calls[0][0]).toMatchObject({
							message: privateFailure,
						});
					} else expect(callerError).not.toHaveBeenCalled();
					if (settlement === "callback-success") {
						expect(output.output.destroyed).toBe(false);
						expect(output.output.writableEnded).toBe(false);
					}
					requests([sourceUrl, targetUrl]);
				} finally {
					const cleanupError = () => undefined;
					output.output.on("error", cleanupError);
					output.callbacks[0]?.();
					await turns();
					output.output.off("error", cleanupError);
				}
			},
		);
	},
);
