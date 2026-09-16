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
import * as loader from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

type Report = Awaited<ReturnType<typeof researchLinkContent>>;

const sourceUrl = "https://target-link.fixture.invalid/index";
const targetUrl = "https://target-link.fixture.invalid/articles/owned";
const source =
	'<main><a id="chosen" href="/articles/owned">Read owned article</a></main>';
const article =
	"<main><h1>Owned article</h1><p>Synthetic target content: café.</p><p hidden>HIDDEN_SENTINEL</p><script>RAW_SENTINEL</script></main>";
const privateFailure = "PRIVATE_TARGET_LINK_FAILURE";
const originalClick = BrowserSession.prototype.click;
const originalPage = BrowserSession.prototype.page;
const originalLoad = loader.loadResearchDocument;
const outputs: Writable[] = [];
const controllers: AbortController[] = [];

function args(target = targetUrl, page = sourceUrl) {
	return ["--target-link", target, page];
}

function cssArgs(selector = "a[href]") {
	return ["--target", targetUrl, "--selector", selector, sourceUrl];
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
	vi.mocked(NodeNetworkTransport.prototype.request)
		.mockResolvedValueOnce(response(sourceUrl, bodyText, sourceOptions))
		.mockResolvedValueOnce(response(targetUrl, targetText, targetOptions));
}

function controller() {
	const cancellation = new AbortController();
	controllers.push(cancellation);
	return cancellation;
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

function closed(report?: Report) {
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
	if (report) {
		expect(report.documentClosedStates.every(Boolean)).toBe(true);
		expect(report.metrics).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 0,
			network: { active: 0, closed: true },
		});
	}
}

function discovery(
	report: Report,
	anchorMatches: number,
	targetCandidates: number,
	eligibleCandidates: number,
) {
	expect(report).toHaveProperty("selectionMode", "exact-target-v1");
	expect(report).not.toHaveProperty("selector");
	expect(report).toHaveProperty("targetLinkDiscovery", {
		strategy: "first-eligible-target-v1",
		anchorMatches,
		targetCandidates,
		eligibleCandidates,
	});
}

function successful(report: Report) {
	expect(report).toMatchObject({
		kind: "native-research-link-content-v1",
		partial: true,
		contentSuccess: null,
		outcome: "extracted-unverified",
		sourceUrl,
		targetUrl,
		stage: "complete",
		events: ["mousedown", "mouseup", "click"],
		documentClosedStates: [true, true],
	});
	expect(report.failure).toBeUndefined();
	expect(report.responses).toHaveLength(2);
	expect(report.extraction?.content).toContain("Synthetic target content");
	expect(report.extraction?.content).not.toContain("HIDDEN_SENTINEL");
	expect(report.extraction?.content).not.toContain("RAW_SENTINEL");
	expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
	requests([sourceUrl, targetUrl]);
	closed(report);
}

function selectionFailure(report: Report, category = "not-found") {
	expect(report).toMatchObject({
		outcome: "failure",
		partial: true,
		contentSuccess: false,
		stage: "link-selection",
		failure: { category, stage: "link-selection" },
		events: [],
		documentClosedStates: [true],
	});
	expect(report.selection).toBeUndefined();
	expect(report.extraction).toBeUndefined();
	expect(report.responses).toHaveLength(1);
	expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.navigate).toHaveBeenCalledOnce();
	requests([sourceUrl]);
	closed(report);
}

function observeChosen(chosenSelector: string, otherSelector?: string) {
	let chosenReference = "";
	vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(function (
		this: BrowserSession,
		tab,
		reference,
		options,
	) {
		const page = this.page(tab);
		const chosen = page.queries.querySelector(chosenSelector);
		if (chosen === null) throw new Error("Missing synthetic chosen anchor");
		chosenReference = page.document.reference(chosen);
		expect(reference).toBe(chosenReference);
		if (otherSelector) {
			const other = page.queries.querySelector(otherSelector);
			if (other === null) throw new Error("Missing synthetic other anchor");
			expect(reference).not.toBe(page.document.reference(other));
		}
		return originalClick.call(this, tab, reference, options);
	});
	return () => chosenReference;
}

async function invalid(input: string[]) {
	const expected = new AgentBrowserError(
		"invalid-input",
		"Invalid link content arguments",
	);
	expect(() => parseResearchLinkContentArguments(input)).toThrow(expected);
	await expect(researchLinkContent(input)).rejects.toThrow(expected);
	const output = sink();
	const before = listeners(output.output);
	await expect(runResearchLinkContentCli(input, output.output)).rejects.toThrow(
		expected,
	);
	expect(output.text()).toBe("");
	expect(listeners(output.output)).toEqual(before);
	expect(output.output.destroyed).toBe(false);
	expect(output.output.writableEnded).toBe(false);
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.navigate).not.toHaveBeenCalled();
	expect(loader.loadResearchDocument).not.toHaveBeenCalled();
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
	vi.spyOn(BrowserSession.prototype, "click");
	vi.spyOn(BrowserSession.prototype, "navigate");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Target-link tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const cancellation of controllers.splice(0)) cancellation.abort();
		for (const output of outputs.splice(0)) output.destroy();
		for (const session of vi.mocked(BrowserSession.prototype.navigate).mock
			.contexts as BrowserSession[])
			session.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("explicit target-link argument preflight", () => {
	it.each([args(), [sourceUrl, "--target-link", targetUrl]])(
		"accepts the three-argument form in order %#",
		(...input) => {
			expect(parseResearchLinkContentArguments(input)).toEqual({
				url: sourceUrl,
				targetUrl,
				targetLink: true,
			});
			requests([]);
		},
	);

	it.each([
		cssArgs(),
		[sourceUrl, "--selector", "a[href]", "--target", targetUrl],
	])("preserves the old parser shape in order %#", (...input) => {
		expect(parseResearchLinkContentArguments(input)).toEqual({
			url: sourceUrl,
			targetUrl,
			selector: "a[href]",
		});
		requests([]);
	});

	it.each([
		[],
		["--target-link", targetUrl],
		[sourceUrl, "--target-link"],
		["--target-link", sourceUrl, "--target-link"],
		[...args(), sourceUrl],
		[...args(), "--selector", "a[href]"],
		[...args(), "--target", targetUrl],
		[...args(), "--target-link", targetUrl],
		[...cssArgs(), "--target-link", targetUrl],
		["--target-link", "--target", sourceUrl],
		["--target-link", "", sourceUrl],
		["--unknown", targetUrl, sourceUrl],
	])("rejects missing, extra, repeated or mixed flags %#", async (...input) => {
		await invalid(input);
	});

	it.each([
		"http://target-link.fixture.invalid/article",
		"file:///synthetic-target-link-fixture",
		"https://other.fixture.invalid/article",
		`https://user:${privateFailure}@target-link.fixture.invalid/article`,
		`${targetUrl}?token=${privateFailure}`,
		`${targetUrl}#${privateFailure}`,
		"https://target-link.fixture.invalid/%61rticle",
		"https://target-link.fixture.invalid/account/profile",
		"https://target-link.fixture.invalid/login",
		"https://target-link.fixture.invalid/checkout",
		"https://target-link.fixture.invalid/articles\\owned",
		` ${targetUrl}`,
		`${targetUrl} `,
		`${targetUrl}${"x".repeat(4096)}`,
	])("rejects unsafe source and target URLs generically %#", async (url) => {
		await invalid(args(url));
		await invalid(args(targetUrl, url));
	});

	describe.each(["source", "target"] as const)(
		"%s URL spelling",
		(position) => {
			it.each(["\u0000", "\t", "\n", "\u007f", "\u0085", "\u009f"])(
				"rejects a literal control generically %#",
				async (control) => {
					const url = `${position === "source" ? sourceUrl : targetUrl}/${privateFailure}${control}article`;
					await invalid(
						position === "source" ? args(targetUrl, url) : args(url),
					);
				},
			);

			it("still accepts an ordinary Unicode path", () => {
				const url = `${position === "source" ? sourceUrl : targetUrl}/café`;
				expect(
					parseResearchLinkContentArguments(
						position === "source" ? args(targetUrl, url) : args(url),
					),
				).toEqual({
					url: position === "source" ? `${sourceUrl}/caf%C3%A9` : sourceUrl,
					targetUrl:
						position === "target" ? `${targetUrl}/caf%C3%A9` : targetUrl,
					targetLink: true,
				});
			});
		},
	);

	it("refuses source and target resolving to the same URL", async () => {
		await invalid(args(sourceUrl));
		await invalid(args(`${sourceUrl}/../index`));
	});
});

describe("native exact-target selection", () => {
	it.each([
		{ heading: "h3", titleOnAnchor: true },
		{ heading: "h5", titleOnAnchor: false },
	])(
		"ignores changed $heading/title metadata",
		async ({ heading, titleOnAnchor }) => {
			serve(`<main><article>
			<a id="image" href="${targetUrl}"><img alt="Synthetic card image"></a>
			<${heading}${titleOnAnchor ? "" : ' title="Synthetic metadata"'}>
			<a id="chosen" href="${targetUrl}"${titleOnAnchor ? ' title="Synthetic metadata"' : ""}>Synthetic headline</a>
			</${heading}></article></main>`);
			const reference = observeChosen("#chosen", "#image");
			const report = await researchLinkContent(args());
			successful(report);
			discovery(report, 2, 2, 1);
			expect(report.selection).toEqual({
				reference: reference(),
				label: "Synthetic headline",
				url: targetUrl,
				candidates: 2,
			});
		},
	);

	it("clicks the first duplicate reference even when both labels are identical", async () => {
		serve(
			`<main><a id="first" href="${targetUrl}">Same label</a><a id="second" href="${targetUrl}">Same label</a></main>`,
		);
		const reference = observeChosen("#first", "#second");
		const report = await researchLinkContent(args());
		successful(report);
		discovery(report, 2, 2, 2);
		expect(report.selection).toEqual({
			reference: reference(),
			label: "Same label",
			url: targetUrl,
			candidates: 2,
		});
	});

	it.each(["/articles/owned", "articles/owned", targetUrl])(
		"resolves the exact target href %s before a real native click",
		async (href) => {
			serve(
				`<main><a id="chosen" href="${href}">Read owned article</a></main>`,
			);
			const reference = observeChosen("#chosen");
			const report = await researchLinkContent(args());
			successful(report);
			discovery(report, 1, 1, 1);
			expect(report.selection?.reference).toBe(reference());
			expect(report.selection?.url).toBe(targetUrl);
		},
	);

	it.each([
		"/articles/Owned",
		"/ARTICLES/owned",
		"/articles/owned/",
		"/articles/owned-extra",
		"https://other.fixture.invalid/articles/owned",
	])("never substitutes a near-match href %s", async (href) => {
		serve(`<a href="${href}">Read owned article</a>`);
		const report = await researchLinkContent(args());
		selectionFailure(report);
		discovery(report, 1, 0, 0);
	});

	it("skips empty, whitespace and 1001-character labels but counts their candidates", async () => {
		serve(
			`<main><a href="${targetUrl}"></a><a href="${targetUrl}"> \n </a><p><a id="long" href="${targetUrl}">${"x".repeat(1001)}</a></p><a id="chosen" href="${targetUrl}"> Read   owned\narticle </a></main>`,
		);
		const reference = observeChosen("#chosen", "#long");
		const report = await researchLinkContent(args());
		successful(report);
		discovery(report, 4, 4, 1);
		expect(report.selection).toMatchObject({
			reference: reference(),
			label: "Read owned article",
			candidates: 4,
		});
	});

	it("retains the inclusive 1000-character label boundary", async () => {
		const label = "x".repeat(1000);
		serve(`<a href="${targetUrl}">${label}</a>`);
		const report = await researchLinkContent(args());
		successful(report);
		discovery(report, 1, 1, 1);
		expect(report.selection?.label).toBe(label);
	});

	it("never directly navigates when the source has no target anchor", async () => {
		serve("<main><h1>No links</h1><p>Read owned article</p></main>");
		const report = await researchLinkContent(args());
		selectionFailure(report);
		discovery(report, 0, 0, 0);
	});

	it("does not charge 129 unrelated anchors against the target-candidate budget", async () => {
		serve(`${source}${'<a href="/other">Other</a>'.repeat(129)}`);
		const report = await researchLinkContent(args());
		successful(report);
		discovery(report, 130, 1, 1);
		expect(report.selection?.candidates).toBe(1);
	});

	it("completes the scan and clicks the first of exactly 64 eligible targets", async () => {
		serve(`${source}${`<a href="${targetUrl}">Later article</a>`.repeat(63)}`);
		const reference = observeChosen("#chosen");
		const report = await researchLinkContent(args());
		successful(report);
		discovery(report, 64, 64, 64);
		expect(report.selection?.candidates).toBe(64);
		expect(report.selection?.reference).toBe(reference());
	});

	it.each([
		{ name: "eligible", label: "Later article" },
		{ name: "empty", label: "" },
		{ name: "overlong", label: "x".repeat(1001) },
	])(
		"refuses 65 URL/attribute candidates with $name later labels before any click",
		async ({ label }) => {
			serve(`${source}${`<a href="${targetUrl}">${label}</a>`.repeat(64)}`);
			const report = await researchLinkContent(args());
			selectionFailure(report, "resource-limit");
			expect(report).not.toHaveProperty("targetLinkDiscovery");
		},
	);

	it.each([
		{ count: 10_000, category: "not-found" },
		{ count: 10_001, category: "resource-limit" },
	])(
		"bounds the fixed native scan at $count unrelated anchors without layout actions",
		async ({ count, category }) => {
			serve(`<main>${'<a href="/other">Other</a>'.repeat(count)}</main>`);
			const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
			const report = await researchLinkContent(args());
			expect(researchLinkContentLimits).toHaveProperty(
				"maxSourceAnchors",
				10_000,
			);
			expect(query).toHaveBeenCalledWith("a[href]");
			const scanIndex = query.mock.calls.findIndex(
				([selector]) => selector === "a[href]",
			);
			expect(scanIndex).toBeGreaterThanOrEqual(0);
			selectionFailure(report, category);
			if (count === 10_000) {
				expect(query.mock.results[scanIndex]).toMatchObject({
					type: "return",
					value: expect.any(Array),
				});
				expect(query.mock.results[scanIndex].value).toHaveLength(count);
				discovery(report, count, 0, 0);
			} else {
				expect(query.mock.results[scanIndex]).toMatchObject({
					type: "throw",
					value: expect.any(AgentBrowserError),
				});
				expect(report).not.toHaveProperty("targetLinkDiscovery");
			}
		},
	);

	it.each([
		["onclick", privateFailure],
		["download", "article"],
		["ping", "/track"],
		["hidden", ""],
		["inert", ""],
		["disabled", ""],
		["aria-hidden", "TRUE"],
		["aria-disabled", "true"],
		["role", "button"],
		["rel", "nofollow EXTERNAL"],
		["rel", "sponsored"],
		["target", "_blank"],
	])(
		"excludes projected %s behavior without assuming raw attribute retention",
		async (name, value) => {
			serve(
				`<main><a id="blocked" href="${targetUrl}">Blocked article</a><a id="chosen" href="${targetUrl}">Allowed article</a></main>`,
			);
			vi.spyOn(BrowserSession.prototype, "page").mockImplementation(function (
				this: BrowserSession,
				tab,
			) {
				const page = originalPage.call(this, tab);
				if (page.document.url === sourceUrl) {
					const blocked = page.queries.querySelector("#blocked");
					if (blocked === null)
						throw new Error("Missing synthetic blocked anchor");
					if (page.document.get(blocked).attributes[name] !== value)
						page.document.setAttribute(blocked, name, value);
				}
				return page;
			});
			const reference = observeChosen("#chosen", "#blocked");
			const report = await researchLinkContent(args());
			successful(report);
			discovery(report, 2, 1, 1);
			expect(report.selection?.reference).toBe(reference());
			expect(report.selection?.candidates).toBe(1);
		},
	);

	it("refuses a changed reader base before discovery", async () => {
		serve(`<base href="https://other.fixture.invalid/">${source}`);
		const report = await researchLinkContent(args());
		selectionFailure(report, "policy-denied");
		expect(report).not.toHaveProperty("targetLinkDiscovery");
	});

	it("keeps CSS mode's unique-match refusal for duplicate eligible anchors", async () => {
		serve(`${source}${source}`);
		const report = await researchLinkContent(cssArgs());
		selectionFailure(report);
		expect(report.selector).toBe("a[href]");
		expect(report).not.toHaveProperty("selectionMode");
		expect(report).not.toHaveProperty("targetLinkDiscovery");
	});

	it("keeps CSS mode's total-match count for a unique eligible target", async () => {
		serve(`${source}<a href="/other">Other article</a>`);
		const report = await researchLinkContent(cssArgs());
		successful(report);
		expect(report.selector).toBe("a[href]");
		expect(report.selection?.candidates).toBe(2);
		expect(report).not.toHaveProperty("selectionMode");
		expect(report).not.toHaveProperty("targetLinkDiscovery");
	});

	it("never tries a second eligible anchor or direct navigation after click failure", async () => {
		serve(
			`<main><a id="first" href="${targetUrl}">Same label</a><a id="second" href="${targetUrl}">Same label</a></main>`,
		);
		let firstReference = "";
		vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(
			async function (this: BrowserSession, tab, reference) {
				const page = this.page(tab);
				const first = page.queries.querySelector("#first");
				const second = page.queries.querySelector("#second");
				if (first === null || second === null)
					throw new Error("Missing duplicate fixture anchors");
				firstReference = page.document.reference(first);
				expect(reference).toBe(firstReference);
				expect(reference).not.toBe(page.document.reference(second));
				throw new AgentBrowserError("not-actionable", privateFailure);
			},
		);
		const report = await researchLinkContent(args());
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "not-actionable", stage: "native-click" },
			selection: { reference: firstReference, candidates: 2 },
		});
		discovery(report, 2, 2, 2);
		expect(JSON.stringify(report)).not.toContain(privateFailure);
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.navigate).toHaveBeenCalledOnce();
		requests([sourceUrl]);
		closed(report);
	});

	it("does not try another anchor when a real native click is prevented", async () => {
		serve(`${source}<a href="${targetUrl}">Second article</a>`);
		vi.mocked(BrowserSession.prototype.click).mockImplementationOnce(function (
			this: BrowserSession,
			tab,
			reference,
			options,
		) {
			const page = this.page(tab);
			const chosen = page.queries.querySelector("#chosen");
			if (chosen === null) throw new Error("Missing synthetic chosen anchor");
			expect(reference).toBe(page.document.reference(chosen));
			page.interactions.events.addEventListener(chosen, "click", (event) =>
				event.preventDefault(),
			);
			return originalClick.call(this, tab, reference, options);
		});
		const report = await researchLinkContent(args());
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "policy-denied", stage: "native-click" },
		});
		discovery(report, 2, 2, 2);
		expect(BrowserSession.prototype.click).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.navigate).toHaveBeenCalledOnce();
		requests([sourceUrl]);
		closed(report);
	});
});

describe.each(["source", "target"] as const)(
	"target-link %s stops",
	(position) => {
		it.each([403, 429, 500, 302])("does not retry HTTP %s", async (status) => {
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
				position === "source" ? options : {},
				position === "target" ? options : {},
			);
			const report = await researchLinkContent(args());
			expect(report).toMatchObject({
				outcome: "http-failure",
				contentSuccess: false,
			});
			expect(report.extraction).toBeUndefined();
			expect(report.failure?.category).toBe("policy-denied");
			requests(position === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
			if (position === "source") {
				expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
				expect(report).not.toHaveProperty("targetLinkDiscovery");
			} else discovery(report, 1, 1, 1);
			closed(report);
		});

		it.each(["header", "hidden source text"] as const)(
			"stops a %s barrier",
			async (barrier) => {
				const text = `<title>Just a moment...</title><aside hidden>Checking your browser. Verify you are human. Complete the CAPTCHA.</aside>${position === "source" ? source : article}`;
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
					position === "source" && barrier !== "header" ? text : source,
					position === "target" && barrier !== "header" ? text : article,
					position === "source" ? options : {},
					position === "target" ? options : {},
				);
				const report = await researchLinkContent(args());
				expect(report).toMatchObject({
					outcome: "semantic-barrier",
					contentSuccess: false,
				});
				expect(report.barrier).toBeTruthy();
				expect(report.extraction).toBeUndefined();
				const projected = vi
					.mocked(loader.loadResearchDocument)
					.mock.calls.filter((input) => input[4] === "source-hidden-inline-v1");
				expect(projected).toHaveLength(position === "source" ? 0 : 1);
				requests(position === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
				if (position === "source") {
					expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
					expect(report).not.toHaveProperty("targetLinkDiscovery");
				} else discovery(report, 1, 1, 1);
				closed(report);
			},
		);

		it("sanitizes request cancellation and preserves caller output ownership", async () => {
			const cancellation = controller();
			if (position === "target")
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
			await expect(
				runResearchLinkContentCli(args(), output.output, cancellation.signal),
			).rejects.toThrow(
				new AgentBrowserError("aborted", "Link content operation stopped"),
			);
			expect(output.text()).toBe("");
			expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(output.output.destroyed).toBe(false);
			expect(output.output.writableEnded).toBe(false);
			requests(position === "source" ? [sourceUrl] : [sourceUrl, targetUrl]);
			closed();
		});
	},
);

describe("target-link in-memory CLI lifecycle", () => {
	it("pre-aborts without navigation or output", async () => {
		const cancellation = controller();
		cancellation.abort(new Error(privateFailure));
		const output = sink();
		const before = listeners(output.output);
		await expect(
			runResearchLinkContentCli(args(), output.output, cancellation.signal),
		).rejects.toThrow(
			new AgentBrowserError("aborted", "Link content operation stopped"),
		);
		expect(output.text()).toBe("");
		expect(listeners(output.output)).toEqual(before);
		expect(BrowserSession.prototype.navigate).not.toHaveBeenCalled();
		requests([]);
	});

	it("stops after source projection when cancelled before selection", async () => {
		serve();
		const cancellation = controller();
		vi.mocked(loader.loadResearchDocument).mockImplementation((...input) => {
			const document = originalLoad(...input);
			if (input[4] === "source-hidden-inline-v1")
				cancellation.abort(new Error(privateFailure));
			return document;
		});
		const output = sink();
		await expect(
			runResearchLinkContentCli(args(), output.output, cancellation.signal),
		).rejects.toThrow(
			new AgentBrowserError("aborted", "Link content operation stopped"),
		);
		expect(output.text()).toBe("");
		expect(BrowserSession.prototype.click).not.toHaveBeenCalled();
		requests([sourceUrl]);
		closed();
	});

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
		"emits one bounded new-mode JSONL report for $outcome",
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
			const report = JSON.parse(text);
			expect(report).toMatchObject({
				kind: "native-research-link-content-v1",
				outcome,
				partial: true,
				contentSuccess: exitCode === 0 ? null : false,
				selection: { url: targetUrl, candidates: 1 },
			});
			discovery(report, 1, 1, 1);
			expect(listeners(output.output)).toEqual(before);
			expect(getEventListeners(cancellation.signal, "abort")).toEqual(
				abortListeners,
			);
			expect(output.output.destroyed).toBe(false);
			expect(output.output.writableEnded).toBe(false);
			requests([sourceUrl, targetUrl]);
			closed(report);
		},
	);
});
