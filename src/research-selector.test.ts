import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchArguments,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchReaderProfile } from "./research-loader.js";

const url = "https://research.example/paper";
const otherUrl = "https://research.example/other";
const privateSelector = '[data-private="SELECTOR_PRIVATE_SENTINEL"]';

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 1,
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
});

afterEach(() => vi.restoreAllMocks());

async function navigate(
	input: NetworkResponse,
	selector: string,
	reader = false,
) {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(input);
	const report = await researchNavigation(url, reader, undefined, selector);
	expect(request).toHaveBeenCalledOnce();
	expect(report.metrics?.closed).toBe(true);
	expect(report.partial).toBe(true);
	expect(report.contentSuccess).not.toBe(true);
	expect(JSON.stringify(report)).not.toContain("SELECTOR_PRIVATE_SENTINEL");
	return report;
}

it.each(
	[
		["--selector", "main", url],
		[url, "--selector", "main"],
		["--reader", "--selector", "main", url, otherUrl],
		[url, "--selector", "main", "--reader", otherUrl],
		[url, otherUrl, "--reader", "--selector", "main"],
	].map((args) => ({ args })),
)("accepts one selector in flag/URL placement $args", ({ args }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: args.includes("--reader"),
		urls: args.filter((argument) => argument.startsWith("https:")),
		selector: "main",
	});
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
});

it("preserves the unscoped parser result without an own selector property", () => {
	const result = parseResearchArguments([url]);
	expect(result).toEqual({ reader: false, urls: [url] });
	expect(Object.hasOwn(result, "selector")).toBe(false);
});

it.each([
	"main, article",
	"main:is(article, main):not(.excluded)",
	"main:has(> p)",
	"main > p:nth-child(2)",
	'a[href^="https:"]',
])("preflights supported native syntax %s without transport", (selector) => {
	expect(parseResearchArguments([url, "--selector", selector]).selector).toBe(
		selector,
	);
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
});

it.each(
	[
		["--selector"],
		["--selector", "--reader"],
		["--selector", "--selector", "main"],
		["--selector", "main", "--selector", "article"],
		["--selector", "main", "--selector", "main"],
		["--selector", ""],
		["--selector", " \t\n"],
		["--selector", "main["],
		["--selector", "main,"],
		["--selector", "main::before"],
		["--selector", "main:unsupported-private-pseudo"],
		["--selector", ":is(main, :unsupported-private-pseudo)"],
		["--selector", `${privateSelector}[`],
		["--selector=main"],
		["--selector", "main", "--reader", "--reader"],
		["--selector", null],
		["--selector", 42],
		["--selector", {}],
	].map((suffix) => ({ suffix })),
)(
	"rejects invalid selector arguments $suffix with a static error",
	({ suffix }) => {
		expect(() =>
			parseResearchArguments([url, ...suffix] as unknown as string[]),
		).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: expect.stringMatching(
					/^Invalid research (arguments|selector)$/,
				),
			}),
		);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	},
);

it.each(["x", "😀"])(
	"bounds selector values at 4096 UTF-16 units using %s",
	(character) => {
		const opening = '[title="';
		const ending = '"]';
		const available = 4096 - opening.length - ending.length;
		const selector =
			opening +
			character.repeat(Math.floor(available / character.length)) +
			"x".repeat(available % character.length) +
			ending;
		expect(selector.length).toBe(4096);
		expect(parseResearchArguments([url, "--selector", selector]).selector).toBe(
			selector,
		);
		expect(() =>
			parseResearchArguments([url, "--selector", `${selector} `]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	},
);

it.each(["main[", "main::before", `${privateSelector}[`, "x".repeat(4097)])(
	"rejects invalid direct-navigation selectors before transport: %s",
	async (selector) => {
		await expect(
			researchNavigation(url, false, undefined, selector),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid research selector",
		});
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"extracts exactly the structural native root (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const input = response(
			'<title>Public paper</title><aside>Outside sentinel</aside><main><h1>Selected paper</h1><p>Useful body.</p><a href="/result">Result</a></main><footer>Footer sentinel</footer>',
		);
		const originalBody = input.body.slice();
		const report = await navigate(input, "main:has(> h1)", reader);
		expect(report).toMatchObject({
			profile: reader ? researchReaderProfile : "native",
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "css-selector", matches: 1 },
			classification: { barrier: null, diagnostic: null },
			extraction: { title: "Public paper", partial: true },
		});
		expect(report.failure).toBeUndefined();
		expect(report.extraction?.content).toContain("Selected paper");
		expect(report.extraction?.content).toContain(
			"https://research.example/result",
		);
		expect(report.extraction?.content).not.toContain("Outside sentinel");
		expect(report.extraction?.content).not.toContain("Footer sentinel");
		expect(extract).toHaveBeenCalledOnce();
		expect(extract.mock.calls[0][1]).toMatchObject({
			root: report.extraction?.scope,
			maxBytes: 256_000,
		});
		expect(extract.mock.calls[0][1]?.root).toBeTruthy();
		expect(close.mock.instances).toContain(extract.mock.calls[0][0]);
		expect(input.body).toEqual(originalBody);
		expect(report.primaryResponse).toMatchObject({
			decodedBytes: originalBody.length,
			bodySha256: createHash("sha256").update(originalBody).digest("hex"),
			hashScope: "transport-decoded-body-before-loader",
		});
	},
);

it.each(["main, #chosen", ":is(main, article):not(.excluded)"])(
	"deduplicates a supported selector list/logical selector: %s",
	async (selector) => {
		const report = await navigate(
			response('<main id="chosen"><p>One root</p></main>'),
			selector,
		);
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it.each([false, true])(
	"selects retained link attributes (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response('<p>Outside</p><a href="/kept" title="Paper">Selected link</a>'),
			'a[title="Paper"][href]',
			reader,
		);
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.extraction?.content).toContain("Selected link");
		expect(report.extraction?.content).not.toContain("Outside");
	},
);

it.each(["#chosen", ".chosen"])(
	"preserves reader source IDs but strips classes for %s",
	async (selector) => {
		const input = response('<main id="chosen" class="chosen">Body</main>');
		const report = await navigate(input, selector, true);
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		if (selector === "#chosen") {
			expect(report.selection?.matches).toBe(1);
			expect(report.outcome).toBe("extracted-unverified");
			expect(report.failure).toBeUndefined();
			expect(report.extraction?.format).toBe("markdown");
			expect(report.extraction?.content).toBe("Body\n");
		} else {
			expect(report.selection?.matches).toBe(0);
			expect(report.failure).toEqual({
				category: "not-found",
				stage: "selection",
			});
			expect(report.extraction).toBeUndefined();
		}
	},
);

it.each([
	{ selector: privateSelector, matches: 0, category: "not-found" },
	{ selector: "p", matches: 2, category: "invalid-input" },
	{ selector: "main, aside", matches: 2, category: "invalid-input" },
])("rejects selection cardinality $matches for $selector", async (fixture) => {
	const extract = vi.spyOn(extraction, "extractDocument");
	const report = await navigate(
		response("<main><p>First</p><p>Second</p></main><aside>Other</aside>"),
		fixture.selector,
	);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		selection: { method: "css-selector", matches: fixture.matches },
		failure: { category: fixture.category, stage: "selection" },
	});
	expect(report.extraction).toBeUndefined();
	expect(extract).not.toHaveBeenCalled();
});

it.each([false, true])(
	"bounds selected extraction rather than the whole body (reader=%s)",
	async (reader) => {
		const input = response(
			`<aside>${"x".repeat(300_000)}</aside><main><p>Small selected root</p></main>`,
		);
		const report = await navigate(input, "main", reader);
		expect(report.primaryResponse?.decodedBytes).toBeGreaterThan(256_000);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.extraction?.content).toBe("Small selected root\n");
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
	},
);

it.each([false, true])(
	"retains the selected-root UTF-8 byte ceiling and provenance (reader=%s)",
	async (reader) => {
		const input = response(
			`<script>omitted()</script><main>${"é".repeat(128_001)}</main>`,
		);
		const report = await navigate(input, "main", reader);
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "extraction",
		});
		expect(report.extraction).toBeUndefined();
		expect(report.primaryResponse?.bodySha256).toBe(
			createHash("sha256").update(input.body).digest("hex"),
		);
		if (reader) expect(report.reader?.omittedSubtrees.script).toBe(1);
	},
);

it.each([
	"<main hidden>Hidden</main>",
	"<main inert>Inert</main>",
	'<main aria-hidden="true">Hidden</main>',
	'<main style="display:none">Hidden</main>',
	"<section hidden><main>Hidden by ancestor</main></section>",
	"<main> \n </main>",
])(
	"reports an empty extraction for hidden/empty native roots: %s",
	async (source) => {
		const report = await navigate(response(source), "main");
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.outcome).toBe("empty-extraction");
		expect(report.contentSuccess).toBe(false);
		expect(report.extraction?.content).toBe("");
		expect(report.failure).toBeUndefined();
	},
);

it.each([false, true])(
	"stops on confirmed headers before parsing or selection (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response('<svg><invalid title="unterminated', {
				headers: {
					"content-type": ["text/html"],
					"cf-mitigated": ["challenge"],
					"set-cookie": ["PRIVATE_COOKIE=value"],
				},
			}),
			privateSelector,
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			selection: { method: "css-selector", matches: null },
			classification: { barrier: "challenge" },
			failure: { stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(report.navigation).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		expect(JSON.stringify(report)).not.toContain("PRIVATE_COOKIE");
	},
);

const barriers = [
	{
		name: "challenge",
		source:
			"<title>Just a moment...</title><aside>Checking your browser</aside>",
		kind: "challenge",
		status: 200,
		finalUrl: url,
	},
	{
		name: "login title",
		source:
			"<title>Sign in</title><aside>Sign in to continue with your password</aside>",
		kind: "login",
		status: 200,
		finalUrl: url,
	},
	{
		name: "final login URL",
		source:
			"<title>Public site</title><aside>Continue with GoogleContinue with Apple</aside>",
		kind: "login",
		status: 200,
		finalUrl: "https://research.example/login?return=PRIVATE_QUERY",
	},
	{
		name: "403 access denied",
		source:
			"<title>Public site</title><aside>You've been blocked by network security</aside>",
		kind: "access-denied",
		status: 403,
		finalUrl: url,
	},
];

it.each(
	barriers.flatMap((barrier) =>
		[false, true].flatMap((reader) =>
			["main", privateSelector].map((selector) => ({
				...barrier,
				reader,
				selector,
			})),
		),
	),
)(
	"does not mask document-prefix $name (reader=$reader, selector=$selector)",
	async (fixture) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response(`${fixture.source}<main>Benign paper</main>`, {
				status: fixture.status,
				url: fixture.finalUrl,
			}),
			fixture.selector,
			fixture.reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: fixture.kind },
			selection: { method: "css-selector", matches: null },
			failure: { stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		expect(JSON.stringify(report)).not.toContain("Checking your browser");
		expect(JSON.stringify(report)).not.toContain("PRIVATE_QUERY");
	},
);

it.each([
	"<script>Checking your browser</script>",
	"<style>Checking your browser</style>",
	"<template><p>Checking your browser</p></template>",
	"<aside hidden>Checking your browser</aside>",
	"<aside inert>Checking your browser</aside>",
	'<aside aria-hidden="true">Checking your browser</aside>',
	'<aside style="display:none">Checking your browser</aside>',
	'<style>.concealed{display:none}</style><aside class="concealed">Checking your browser</aside>',
])(
	"excludes omitted/hidden native prefix subtrees: %s",
	async (distraction) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title>${distraction}<main>Public paper</main>`,
			),
			"main",
		);
		expect(report.classification.diagnostic).toBeNull();
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
	},
);

it.each([false, true])(
	"keeps the body-prefix diagnostic bounded to 8192 units (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><aside>${"x".repeat(8192)} Checking your browser</aside><main>Public paper</main>`,
			),
			"main",
			reader,
		);
		expect(report.classification.diagnostic).toBeNull();
		expect(report.contentSuccess).toBeNull();
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it.each([false, true])(
	"classifies selected text after an inconclusive bounded prefix (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><aside>${"x".repeat(8192)}</aside><main>Checking your browser</main>`,
			),
			"main",
			reader,
		);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.classification.barrier).toBe("challenge");
		expect(report.contentSuccess).toBe(false);
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.extraction?.content).toBe("Checking your browser\n");
	},
);

it.each([403, 404, 500])(
	"keeps non-barrier HTTP %s outcomes",
	async (status) => {
		const report = await navigate(
			response(
				"<title>Unavailable paper</title><main>No article available.</main>",
				{
					status,
				},
			),
			"main",
		);
		expect(report.outcome).toBe("http-failure");
		expect(report.classification.diagnostic).toBeNull();
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBe(1);
		expect(report.contentSuccess).toBe(false);
		expect(report.primaryResponse?.status).toBe(status);
	},
);

it("retains reader omissions and original response provenance in scoped reports", async () => {
	const input = response(
		"<title>Paper</title><svg><text>Omitted graphic</text></svg><script>privateScript()</script><main><p>Selected</p></main>",
	);
	const report = await navigate(input, "main", true);
	expect(report.reader).toMatchObject({
		profile: researchReaderProfile,
		partial: true,
		scripting: false,
		styling: false,
		hiddenContentSemantics: false,
		omittedSubtrees: { svg: 1, script: 1 },
	});
	expect(report.extraction?.reader).toEqual(report.reader);
	expect(report.primaryResponse?.bodySha256).toBe(
		createHash("sha256").update(input.body).digest("hex"),
	);
	expect(report.extraction?.content).toBe("Selected\n");
});

it("preserves existing unscoped navigation calls and the extraction limit", async () => {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(
		response("<main>Body</main><aside>Outside</aside>"),
	);
	const report = await researchNavigation(url);
	expect(Object.hasOwn(report, "selection")).toBe(false);
	expect(report.extraction?.content).toContain("Outside");
	expect(report.metrics?.closed).toBe(true);
	expect(request).toHaveBeenCalledOnce();
	expect(researchRunLimits.extractionBytes).toBe(256_000);
});

it("cleans up pre-aborted scoped navigation without transport or extraction", async () => {
	const controller = new AbortController();
	controller.abort();
	const extract = vi.spyOn(extraction, "extractDocument");
	const report = await researchNavigation(
		url,
		false,
		controller.signal,
		"main",
	);
	expect(report.failure?.category).toBe("aborted");
	expect(report.selection).toEqual({ method: "css-selector", matches: null });
	expect(report.extraction).toBeUndefined();
	expect(report.contentSuccess).toBe(false);
	expect(report.metrics?.closed).toBe(true);
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(extract).not.toHaveBeenCalled();
});

it("cleans up cancellation during a synthetic request", async () => {
	const controller = new AbortController();
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockImplementationOnce(async () => {
		controller.abort();
		throw new AgentBrowserError("aborted", "Synthetic request cancelled");
	});
	const report = await researchNavigation(
		url,
		false,
		controller.signal,
		"main",
	);
	expect(report.failure?.category).toBe("aborted");
	if (report.selection?.method !== "css-selector")
		throw new Error("Expected css-selector selection");
	expect(report.selection?.matches).toBeNull();
	expect(report.extraction).toBeUndefined();
	expect(report.metrics?.closed).toBe(true);
	expect(request).toHaveBeenCalledOnce();
});

it("does not echo a successful selector into reports or extraction metadata", async () => {
	const report = await navigate(
		response('<main id="chosen" class="paper">Public body</main>'),
		`main#chosen.paper:not(${privateSelector})`,
	);
	expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.extraction?.content).toBe("Public body\n");
});

it.each([false, true])(
	"uses the final response URL rather than HTML base for prefix classification (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				'<title>Public article</title><base href="https://research.example/login"><aside>Continue with GoogleContinue with Apple</aside><main>Public body</main>',
				{ url: otherUrl },
			),
			"main",
			reader,
		);
		expect(report.finalUrl).toBe(otherUrl);
		expect(report.classification.diagnostic).toBeNull();
		expect(report.contentSuccess).toBeNull();
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it.each(
	["script", "style", "template"].flatMap((tag) =>
		[false, true].map((reader) => ({ tag, reader })),
	),
)(
	"does not let omitted $tag text exhaust the prefix budget (reader=$reader)",
	async ({ tag, reader }) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><${tag}>${"x".repeat(8192)}</${tag}><aside>Checking your browser</aside><main>Benign body</main>`,
			),
			"main",
			reader,
		);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.classification.barrier).toBe("challenge");
		expect(report.failure?.stage).toBe("semantic-barrier");
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBeNull();
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"does not bypass document depth limits with a small selected root (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<main>Small root</main>${"<div>".repeat(140)}Too deep${"</div>".repeat(140)}`,
			),
			"main",
			reader,
		);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "loader",
			resourceLimit: {
				kind: reader ? "reader.depth" : "document.depth",
				unit: "levels",
				limit: 128,
				observed: 129,
			},
		});
		if (report.selection?.method !== "css-selector")
			throw new Error("Expected css-selector selection");
		expect(report.selection?.matches).toBeNull();
		expect(report.extraction).toBeUndefined();
	},
);

it("does not bypass reader source limits with a small selected root", async () => {
	const source = `<main>Small root</main><!--${"x".repeat(2_000_001)}-->`;
	const report = await navigate(response(source), "main", true);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "loader",
		resourceLimit: {
			kind: "reader.decoded",
			unit: "code-units",
			limit: 2_000_000,
			observed: source.length,
		},
	});
	if (report.selection?.method !== "css-selector")
		throw new Error("Expected css-selector selection");
	expect(report.selection?.matches).toBeNull();
	expect(report.extraction).toBeUndefined();
	expect(report.primaryResponse?.decodedBytes).toBeGreaterThan(2_000_000);
});

async function expectPrefixChallenge(
	source: string,
	selector: string,
	reader = false,
) {
	const extract = vi.spyOn(extraction, "extractDocument");
	const report = await navigate(response(source), selector, reader);
	expect(report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { method: "css-selector", matches: null },
		classification: {
			barrier: "challenge",
			diagnostic: {
				confidence: "possible",
				evidence: ["html-challenge-markers"],
			},
		},
		failure: { category: "policy-denied", stage: "semantic-barrier" },
	});
	expect(report.extraction).toBeUndefined();
	expect(extract).not.toHaveBeenCalled();
}

it.each(
	[false, true].flatMap((reader) =>
		["main", privateSelector].map((selector) => ({ reader, selector })),
	),
)(
	"detects a challenge phrase split by a visible break before selection (reader=$reader, selector=$selector)",
	async ({ reader, selector }) => {
		await expectPrefixChallenge(
			"<title>Just a moment...</title><p>Verify<br>you are human</p><main>Benign article</main>",
			selector,
			reader,
		);
	},
);

it.each(["main", privateSelector])(
	"skips 4096 undisplayed closed-details blocks before the visible challenge for %s",
	async (selector) => {
		await expectPrefixChallenge(
			`<title>Just a moment...</title><details><summary>Info</summary>${"<div></div>".repeat(4096)}</details><p>Verify you are human</p><main>Benign article</main>`,
			selector,
		);
	},
);

it.each(["main", privateSelector])(
	"preserves restored descendant visibility in native prefix classification for %s",
	async (selector) => {
		await expectPrefixChallenge(
			'<title>Just a moment...</title><p style="visibility:hidden">Hidden text<span style="visibility:visible">Verify<br>you are human</span></p><main>Benign article</main>',
			selector,
		);
	},
);

it.each([
	"hidden",
	"inert",
	'aria-hidden="true"',
	'style="display:none"',
	'style="visibility:hidden"',
])(
	"does not insert a diagnostic separator for a native hidden break: %s",
	async (attributes) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><p>Verify<br ${attributes}>you are human</p><main>Benign article</main>`,
			),
			"main",
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(report.classification.diagnostic).toBeNull();
		expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
		expect(report.extraction?.content).toBe("Benign article\n");
		expect(report.failure).toBeUndefined();
	},
);
