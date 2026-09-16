import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const encoder = new TextEncoder();
const url = "https://content-focus-replay.fixture.invalid/article";
const focus = { contentFocus: "main-content-v1" } as const;
const policies = ["main-content-v1", "main-content-v2"] as const;
const prefixPolicy = { outputLimitPolicy: "text-prefix-v1" } as const;
const formats = ["json", "markdown"] as const;
const source =
	'<title>Saved article</title><nav>Outside navigation</nav><main><h1 id="owned">Owned heading</h1><p>Café 日本語 evidence.</p><a href="/details">Details</a></main><footer>Outside footer</footer>';

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: admission.TrustedResearchReplayAdmission;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Content-focus replay must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	html = source,
	options: {
		profile?: ResearchDocumentProfileId;
		contentType?: string;
		visibility?: boolean;
		fallback?: boolean;
		outline?: boolean;
		outcome?: ResearchNavigationReport["outcome"];
	} = {},
): Promise<Fixture> {
	const profile = options.profile ?? "default";
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: {
			"content-type": [options.contentType ?? "text/html; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		options.outline ?? options.contentType === undefined,
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.visibility
				? { readerVisibilityPolicy: "source-hidden-inline-v1" as const }
				: {}),
			...(options.fallback ? { readerFallbackEncoding: "utf-8" as const } : {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.outcome).toBe(options.outcome ?? "extracted-unverified");
	expect(hash(body)).toBe(hash(encoder.encode(html)));
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

const selectorRecoveries = [
	(
		input: Fixture,
		selection: replay.ResearchOutputLimitSelectorSelection,
		format: replay.ResearchReplayFormat,
	) =>
		replay.recoverResearchOutputLimitSelector(
			input.raw,
			input.trusted,
			selection,
			undefined,
			format,
		),
	(
		input: Fixture,
		selection: replay.ResearchOutputLimitSelectorSelection,
		format: replay.ResearchReplayFormat,
	) =>
		replay.recoverResearchEmptyOutlineSelector(
			input.raw,
			input.trusted,
			selection,
			undefined,
			format,
		),
];

function revised(
	input: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report);
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function execute(
	input: Fixture,
	selection: unknown = focus,
	format: replay.ResearchReplayFormat = "json",
	signal?: AbortSignal,
) {
	const originalReport = structuredClone(input.report);
	const originalTrusted = structuredClone(input.trusted);
	const originalRawHash = hash(input.raw);
	const originalBodyHash = hash(input.body);
	try {
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection as replay.ResearchJsonReplaySelection,
			signal,
			format,
		);
		expect(result).not.toBeInstanceOf(Promise);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: input.report.finalUrl,
				receiptSha256: hash(input.raw),
				body: input.trusted.expectedBody,
			},
		});
		for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
			expect(result.jsonl).not.toContain(`"${key}"`);
		return result;
	} finally {
		expect(input.report).toEqual(originalReport);
		expect(input.trusted).toEqual(originalTrusted);
		expect(hash(input.raw)).toBe(originalRawHash);
		expect(hash(input.body)).toBe(originalBodyHash);
	}
}

function observeOwnership() {
	const bodies: Uint8Array[] = [];
	const validate = admission.validateResearchReplayAdmission;
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind === "validated-capture") bodies.push(admitted.body);
			return admitted;
		},
	);
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return (captures = 1, documents = captures) => {
		expect(bodies).toHaveLength(captures);
		for (const body of bodies) {
			expect(body.byteLength).toBeGreaterThan(0);
			expect(body.every((value) => value === 0)).toBe(true);
		}
		expect(close).toHaveBeenCalledTimes(documents);
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected replay-owned document");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
		}
	};
}

const contexts = (["default", "long-v1"] as const).flatMap((profile) =>
	formats.flatMap((format) =>
		(["main", "article"] as const).flatMap((landmark) =>
			policies.map((contentFocus) => ({
				profile,
				format,
				landmark,
				contentFocus,
			})),
		),
	),
);

it.each(contexts)(
	"replays a unique $landmark with $contentFocus as $format from a complete $profile capture",
	async ({ profile, format, landmark, contentFocus }) => {
		const focus = { contentFocus };
		const input = await fixture(source.replaceAll("main>", `${landmark}>`), {
			profile,
		});
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const result = execute(input, focus, format);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "content-focus", matches: null },
			extraction: {
				format,
				url,
				partial: true,
				contentSelection: {
					policy: contentFocus,
					selected: landmark,
					reason: `unique-${landmark}`,
					mainCandidates: landmark === "main" ? 1 : 0,
					articleCandidates: landmark === "article" ? 1 : 0,
					scannedNodes: expect.any(Number),
				},
			},
		});
		expect(result.report.reader).toEqual(input.report.reader);
		expect(extract).toHaveBeenCalledOnce();
		expect(extract.mock.calls[0][1]).toMatchObject({
			...focus,
			format,
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		expect(extract.mock.calls[0][1]?.root).toBeUndefined();
		expect(extract.mock.calls[0][1]?.section).toBeUndefined();
		expect(result.report.extraction).toBe(extract.mock.results[0].value);
		expect(Object.isFrozen(result.report.extraction?.contentSelection)).toBe(
			true,
		);
		expect(
			result.report.extraction?.contentSelection?.scannedNodes,
		).toBeGreaterThan(0);
		const content = JSON.stringify(result.report.extraction?.content);
		expect(content).toContain("Owned heading");
		expect(content).toContain("Café 日本語 evidence");
		expect(content).toContain(`${url.replace("/article", "")}/details`);
		expect(content).not.toContain("Outside navigation");
		expect(content).not.toContain("Outside footer");
		if (contentFocus === "main-content-v2")
			expect(result.report.extraction?.contentSelection).toHaveProperty(
				"outsideArticleContent",
				landmark === "main",
			);
		else
			expect(result.report.extraction?.contentSelection).not.toHaveProperty(
				"outsideArticleContent",
			);
		expect(result.report.selection).toEqual({
			method: "content-focus",
			matches: null,
		});
		released();
	},
);

it.each([
	{
		reason: "ambiguous-main",
		html: "<main>First</main><article>Article</article><main>Second</main>",
		mainCandidates: 2,
		articleCandidates: 1,
	},
	{
		reason: "ambiguous-article",
		html: "<article>First</article><article>Second</article>",
		mainCandidates: 0,
		articleCandidates: 2,
	},
	{
		reason: "no-nonempty-landmark",
		html: "<main> </main><article></article><p>Ordinary evidence</p>",
		mainCandidates: 0,
		articleCandidates: 0,
	},
])(
	"preserves core document fallback for $reason rather than requiring one CSS match",
	async ({ html, reason, mainCandidates, articleCandidates }) => {
		const input = await fixture(
			`<h1>Outside heading</h1>${html}<footer>Outside footer</footer>`,
		);
		const released = observeOwnership();
		for (const format of formats) {
			const extract = vi.spyOn(extraction, "extractDocument");
			const result = execute(input, focus, format);
			expect(result.report.selection).toEqual({
				method: "content-focus",
				matches: null,
			});
			expect(result.report.extraction?.contentSelection).toMatchObject({
				policy: "main-content-v1",
				selected: "document",
				reason,
				mainCandidates,
				articleCandidates,
			});
			expect(result.report.extraction).toBe(extract.mock.results.at(-1)?.value);
			const content = JSON.stringify(result.report.extraction?.content);
			expect(content).toContain("Outside heading");
			expect(content).toContain("Outside footer");
		}
		released(2);
	},
);

it.each(
	(["default", "long-v1"] as const).flatMap((profile) =>
		formats.flatMap((format) =>
			["#default-layout", "body"].map((selector) => ({
				profile,
				format,
				selector,
			})),
		),
	),
)(
	"recovers sibling product content with $selector as $format from a focused $profile landing page",
	async ({ profile, format, selector }) => {
		const input = await fixture(
			'<title>Storefront</title><body><nav>Outside navigation</nav><div id="default-layout"><article><h2>Daily promotion</h2><a href="/sale">Browse savings</a></article><section><h2>Product Alpha</h2><p>Weatherproof garden light</p><p>Price 19.00</p><a href="/products/alpha">Product details</a></section><section><h2>Product Beta</h2><p>Rechargeable workshop lamp</p></section><p hidden>Hidden stock payload</p><script>"Script-only inventory"</script></div><footer>Outside footer</footer></body>',
			{ profile, visibility: true },
		);
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const focused = execute(input, focus, format);
		expect(focused.report.extraction?.contentSelection).toMatchObject({
			selected: "article",
			reason: "unique-article",
			mainCandidates: 0,
			articleCandidates: 1,
		});
		const focusedContent = JSON.stringify(focused.report.extraction?.content);
		expect(focusedContent).toContain("Daily promotion");
		expect(focusedContent).not.toContain("Product Alpha");
		expect(focusedContent).not.toContain("Product Beta");
		expect(focused.report.extraction?.contentSelection).not.toHaveProperty(
			"outsideArticleContent",
		);
		const conservative = execute(
			input,
			{ contentFocus: "main-content-v2" },
			format,
		);
		expect(extract.mock.calls.at(-1)?.[1]?.contentFocus).toBe(
			"main-content-v2",
		);
		expect(conservative.report.extraction?.contentSelection).toMatchObject({
			policy: "main-content-v2",
			selected: "document",
			reason: "article-with-outside-content",
			mainCandidates: 0,
			articleCandidates: 1,
			outsideArticleContent: true,
		});
		expect(conservative.report.extraction?.scope).toBe(
			conservative.report.extraction?.document,
		);
		const conservativeContent = JSON.stringify(
			conservative.report.extraction?.content,
		);
		const broader = execute(input, { selector }, format);
		expect(broader.report.selection).toMatchObject({
			method: "css-selector",
			matches: 1,
		});
		expect(broader.report.extraction).not.toHaveProperty("contentSelection");
		const content = JSON.stringify(broader.report.extraction?.content);
		for (const marker of [
			"Daily promotion",
			"Product Alpha",
			"Weatherproof garden light",
			"Product Beta",
			"Rechargeable workshop lamp",
			"https://content-focus-replay.fixture.invalid/products/alpha",
		]) {
			expect(content).toContain(marker);
			expect(conservativeContent).toContain(marker);
		}
		expect(content).toContain(format === "markdown" ? "19\\\\.00" : "19.00");
		for (const marker of ["Hidden stock payload", "Script-only inventory"]) {
			expect(content).not.toContain(marker);
			expect(conservativeContent).not.toContain(marker);
		}
		for (const marker of ["Outside navigation", "Outside footer"]) {
			if (selector === "body") expect(content).toContain(marker);
			else expect(content).not.toContain(marker);
		}
		expect(broader.report.contentSuccess).toBeNull();
		released(3, 6);
	},
);

it("keeps implicit JSON typing and explicit selector replay unchanged", async () => {
	const input = await fixture();
	const selected: replay.ResearchJsonReplaySelection = focus;
	const implicit = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selected,
	);
	expectTypeOf(implicit).toEqualTypeOf<replay.ResearchJsonReplayExtraction>();
	expectTypeOf(implicit.report.extraction?.content).toEqualTypeOf<
		ExtractedNode | undefined
	>();
	expect(implicit.report.extraction?.format).toBe("json");
	const explicit = execute(input, focus, "json");
	expect(explicit.report.extraction?.contentSelection).toEqual(
		implicit.report.extraction?.contentSelection,
	);
	const ordinary = execute(input, { selector: "main" });
	expect(ordinary.report.selection).toEqual({
		method: "css-selector",
		matches: 1,
	});
	expect(ordinary.report.extraction).not.toHaveProperty("contentSelection");
});

it("forwards table options without widening their existing format contracts", async () => {
	const input = await fixture(
		'<h1>Owned</h1><main><table><tr><th scope="col">Name</th></tr><tr><td>Value</td></tr></table></main>',
	);
	const extract = vi.spyOn(extraction, "extractDocument");
	const json = execute(input, { ...focus, tableMetadata: true });
	expect(JSON.stringify(json.report.extraction?.content)).toContain(
		'"tableSource"',
	);
	expect(extract.mock.calls.at(-1)?.[1]).toMatchObject({
		...focus,
		tableMetadata: true,
	});
	for (const tableRows of [false, true]) {
		const result = execute(
			input,
			{ ...focus, tableRows, compactTables: true },
			"markdown",
		);
		expect(result.report.extraction).toMatchObject({
			format: "markdown",
			compactTables: true,
			contentSelection: { selected: "main", reason: "unique-main" },
		});
		expect(result.report.extraction?.content).toContain("Value");
		expect(extract.mock.calls.at(-1)?.[1]).toMatchObject({
			...focus,
			tableRows,
			compactTables: true,
		});
	}
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const [selection, format] of [
		[{ ...focus, tableMetadata: true }, "markdown"],
		[{ ...focus, tableRows: true }, "json"],
		[{ ...focus, compactTables: true }, "json"],
	] as const)
		expect(() => execute(input, selection, format)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(validate).not.toHaveBeenCalled();
});

it("rejects invalid focus tokens and nonboolean table values before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const contentFocus of [
		undefined,
		null,
		true,
		1,
		"",
		"main",
		"main-content-v3",
		"MAIN-CONTENT-V2",
		" main-content-v2",
		"main-content-v2\n",
		" main-content-v1",
		"main-content-v1 ",
		["main-content-v1"],
		{},
		Object("main-content-v1"),
	])
		expect(() => execute(input, { contentFocus })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	for (const key of ["tableMetadata", "tableRows", "compactTables"])
		for (const value of [null, 1, "true", {}])
			expect(() => execute(input, { ...focus, [key]: value })).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it.each(policies)(
	"rejects proxies, accessors and inherited %s without invoking user code",
	async (contentFocus) => {
		const focus = { contentFocus };
		const input = await fixture();
		const trap = vi.fn(() => {
			throw new Error("Selection must not invoke user code");
		});
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		const revoked = Proxy.revocable({ ...focus }, {});
		revoked.revoke();
		for (const selection of [
			new Proxy(focus, {
				get: trap,
				getPrototypeOf: trap,
				ownKeys: trap,
				getOwnPropertyDescriptor: trap,
			}),
			revoked.proxy,
			Object.defineProperty({}, "contentFocus", {
				get: trap,
				enumerable: true,
			}),
			Object.defineProperty({ ...focus }, "tableMetadata", {
				get: trap,
				enumerable: true,
			}),
			Object.create(focus),
			{ contentFocus: { toString: trap, valueOf: trap } },
			{ ...focus, [Symbol("extra")]: true },
		])
			expect(() => execute(input, selection)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		expect(trap).not.toHaveBeenCalled();
		expect(validate).not.toHaveBeenCalled();
		const ownData = Object.create(null);
		Object.defineProperty(ownData, "contentFocus", {
			value: focus.contentFocus,
		});
		expect(execute(input, ownData).report.selection).toEqual({
			method: "content-focus",
			matches: null,
		});
	},
);

it.each(policies)(
	"rejects every mixed %s selection including own undefined selectors",
	async (contentFocus) => {
		const focus = { contentFocus };
		const input = await fixture();
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		for (const other of [
			{ selector: "main" },
			{ section: "#owned" },
			{ links: "details" },
			{ find: "Owned" },
			{ lines: { start: 1, end: 2 } },
			{ selector: undefined },
			{ section: undefined },
			{ links: undefined },
			{ find: undefined },
			{ lines: undefined },
		])
			expect(() => execute(input, { ...focus, ...other })).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		expect(validate).not.toHaveBeenCalled();
	},
);

it.each(policies)(
	"does not widen named output-limit or empty-outline recovery with %s",
	async (contentFocus) => {
		const focus = { contentFocus };
		const input = await fixture();
		const outputAdmission = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		const emptyAdmission = vi.spyOn(
			admission,
			"validateResearchEmptyOutlineAdmission",
		);
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const format of formats) {
			for (const selection of [focus, { ...focus, section: "#owned" }])
				expect(() =>
					replay.recoverResearchOutputLimitSection(
						input.raw,
						input.trusted,
						selection as unknown as replay.ResearchOutputLimitSectionSelection,
						undefined,
						format,
					),
				).toThrow(expect.objectContaining({ code: "invalid-input" }));
			for (const recover of selectorRecoveries)
				for (const selection of [focus, { ...focus, selector: "main" }])
					expect(() =>
						recover(
							input,
							selection as unknown as replay.ResearchOutputLimitSelectorSelection,
							format,
						),
					).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(outputAdmission).not.toHaveBeenCalled();
		expect(emptyAdmission).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	},
);

it("retains receipt and body pins and rejects altered captured bytes before loading", async () => {
	const input = await fixture();
	const corrupted = revised(input, (report) => {
		if (!report.bodyCapture) throw new Error("Expected native capture");
		report.bodyCapture.data = Buffer.from(input.body)
			.fill(120)
			.toString("base64");
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const trusted of [
		{ ...input.trusted, expectedReceiptSha256: "0".repeat(64) },
		{
			...input.trusted,
			expectedBody: { bytes: input.body.byteLength, sha256: "0".repeat(64) },
		},
		{
			...input.trusted,
			expectedBody: {
				bytes: input.body.byteLength + 1,
				sha256: hash(input.body),
			},
		},
	])
		expect(() => execute({ ...input, trusted })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(() => execute(corrupted)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(load).not.toHaveBeenCalled();
});

it("refuses failed, challenged and incomplete captures rather than rescuing them with focus", async () => {
	const original = await fixture(undefined, { profile: "long-v1" });
	const failed = await fixture(
		`<h1>Large</h1><p>${"Background content. ".repeat(16_000)}</p>${source}`,
		{ outline: false, outcome: "failure" },
	);
	expect(failed.report.failure).toMatchObject({
		category: "resource-limit",
		stage: "extraction",
		resourceLimit: { kind: "extraction.output", limit: 256_000 },
	});
	const blocked = await fixture(
		"<title>Just a moment...</title><h1>Checking your browser</h1><main>Owned</main>",
		{ outcome: "semantic-barrier" },
	);
	const missing = revised(original, (report) => {
		Reflect.deleteProperty(report, "bodyCapture");
	});
	const incomplete = revised(original, (report) => {
		if (!report.headings) throw new Error("Expected native outline");
		report.headings.truncated = true;
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const input of [failed, blocked, missing, incomplete])
		for (const contentFocus of policies)
			expect(() => execute(input, { contentFocus })).toThrow(
				expect.objectContaining({ code: "policy-denied" }),
			);
	expect(load).not.toHaveBeenCalled();
});

it.each(["default", "long-v1"] as const)(
	"v2 keeps output bounds when broader %s content needs explicit text-prefix fallback",
	async (profile) => {
		const input = await fixture(
			`<article><h1>Daily promotion</h1></article><section><p>${"Outside product details. ".repeat(16_000)}</p></section>`,
			{ profile },
		);
		const released = observeOwnership();
		const legacy = execute(input, focus, "markdown");
		expect(legacy.report.extraction?.contentSelection?.selected).toBe(
			"article",
		);
		expect(legacy.report.extraction?.content).not.toContain("Outside product");
		const conservative = { contentFocus: "main-content-v2" } as const;
		expect(() => execute(input, conservative, "markdown")).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const bounded = execute(
			input,
			{ ...conservative, ...prefixPolicy },
			"markdown",
		);
		expect(bounded.report.extraction?.contentSelection).toMatchObject({
			policy: "main-content-v2",
			selected: "document",
			reason: "article-with-outside-content",
			outsideArticleContent: true,
		});
		expect(bounded.report.extraction?.contentFallback).toMatchObject({
			policy: "text-prefix-v1",
			truncated: true,
			trigger: { kind: "extraction.output", limit: 256_000 },
		});
		expect(bounded.report.extraction?.content).toContain("Outside product");
		expect(bounded.outputBytes).toBeLessThanOrEqual(327_680);
		expect(bounded.report.networkRequests).toBe(0);
		released(3);
	},
);

it("retains MIME admission and recorded fallback encoding checks", async () => {
	const plain = await fixture("# Literal source", {
		contentType: "text/plain; charset=utf-8",
	});
	const markdown = await fixture("# Literal source", {
		contentType: "text/markdown; charset=utf-8",
	});
	const original = await fixture(undefined, { fallback: true });
	const inconsistent = revised(original, (report) => {
		if (!report.reader) throw new Error("Expected native reader metadata");
		(report.reader as Record<string, unknown>).encoding = "windows-1252";
	});
	const released = observeOwnership();
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const input of [plain, markdown])
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	expect(load).not.toHaveBeenCalled();
	expect(() => execute(inconsistent)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(execute(original).report.reader).toMatchObject({
		fallbackEncoding: "utf-8",
		encoding: "utf-8",
	});
	released(4, 2);
});

it("inherits source visibility before choosing the unique visible landmark", async () => {
	const input = await fixture(
		'<h1>Outside heading</h1><main style="display:none">Hidden main</main><main><h2>Visible heading</h2><p>Visible evidence</p><p hidden>Hidden descendant</p></main>',
		{ visibility: true },
	);
	const released = observeOwnership();
	for (const format of formats) {
		const result = execute(input, focus, format);
		expect(result.report.reader).toMatchObject({
			visibilityPolicy: "source-hidden-inline-v1",
			hiddenContentSemantics: "source-attributes-and-inline-display",
		});
		expect(result.report.extraction?.contentSelection).toMatchObject({
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
		});
		const content = JSON.stringify(result.report.extraction?.content);
		expect(content).toContain("Visible evidence");
		expect(content).not.toContain("Hidden main");
		expect(content).not.toContain("Hidden descendant");
		expect(content).not.toContain("Outside heading");
	}
	released(2, 4);
});

it("honors cancellation before admission and after loading while releasing owners", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const validate = vi.mocked(admission.validateResearchReplayAdmission);
	const load = loader.loadResearchDocument;
	const loadSpy = vi.spyOn(loader, "loadResearchDocument");
	const preflight = new AbortController();
	preflight.abort();
	expect(() => execute(input, focus, "json", preflight.signal)).toThrow(
		expect.objectContaining({ code: "aborted" }),
	);
	expect(validate).not.toHaveBeenCalled();
	expect(loadSpy).not.toHaveBeenCalled();
	const duringLoad = new AbortController();
	loadSpy.mockImplementationOnce((...args) => {
		const tree = load(...args);
		duringLoad.abort();
		return tree;
	});
	expect(() => execute(input, focus, "markdown", duringLoad.signal)).toThrow(
		expect.objectContaining({ code: "aborted" }),
	);
	released();
});

it("enforces the UTF-8 focus output ceiling on an otherwise complete capture", async () => {
	const text = "界".repeat(90_000);
	expect(text.length).toBeLessThan(256_000);
	expect(encoder.encode(text).byteLength).toBeGreaterThan(256_000);
	const input = await fixture(`<h1>Owned</h1><main>${text}</main>`);
	const released = observeOwnership();
	for (const format of formats)
		expect(() => execute(input, focus, format)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	released(2);
});

it("wipes the admitted focus body even when closing its document throws", async () => {
	const input = await fixture();
	const close = DocumentTree.prototype.close;
	const released = observeOwnership();
	vi.mocked(DocumentTree.prototype.close).mockImplementationOnce(function (
		this: DocumentTree,
	) {
		close.call(this);
		throw new AgentBrowserError("closed", "Synthetic close failure");
	});
	expect(() => execute(input)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	released();
});

const prefixContexts = [
	{
		method: "css-selector",
		selection: { selector: "main" },
		profile: "default",
	},
	{
		method: "heading-section",
		selection: { section: "#owned" },
		profile: "long-v1",
	},
	{ method: "content-focus", selection: focus, profile: "long-v1" },
] as const;

it.each(prefixContexts)(
	"uses explicit text-prefix output only after a real $profile $method Markdown limit failure",
	async ({ selection, profile, method }) => {
		const text = "Selected evidence 界. ".repeat(16_000);
		const input = await fixture(
			`<nav>Outside navigation</nav><main><h1 id="owned">Selected heading</h1><p>${text}</p><p>Unretained suffix</p></main><h1>Outside heading</h1><footer>Outside footer</footer>`,
			{ profile },
		);
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		expect(() => execute(input, selection, "markdown")).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(extract.mock.results[0].type).toBe("throw");
		const trigger = resourceLimitDiagnostic(extract.mock.results[0].value);
		expect(trigger).toMatchObject({
			kind: "extraction.output",
			unit: "bytes",
			limit: 256_000,
		});
		const result = execute(
			input,
			{ ...selection, ...prefixPolicy },
			"markdown",
		);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: {
				method,
				matches: method === "content-focus" ? null : 1,
				...prefixPolicy,
			},
		});
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report).not.toHaveProperty("recovery");
		expect(extract.mock.calls[1][1]).toMatchObject({
			...prefixPolicy,
			format: "markdown",
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		const output = result.report.extraction;
		if (output?.format !== "markdown")
			throw new Error("Expected prefix Markdown extraction");
		expect(output).toBe(extract.mock.results[1].value);
		const fallback = output.contentFallback;
		if (!fallback) throw new Error("Expected explicit prefix metadata");
		expect(fallback).toMatchObject({
			policy: "text-prefix-v1",
			representation: "indented-plain-text",
			truncated: true,
			trigger,
		});
		expect(fallback.trigger.observed).toBeGreaterThan(256_000);
		expect(fallback.sourceCodeUnits).toBeGreaterThanOrEqual(text.length);
		expect(fallback.retainedCodeUnits).toBeGreaterThan(0);
		expect(fallback.retainedCodeUnits).toBeLessThan(fallback.sourceCodeUnits);
		expect(Object.isFrozen(fallback)).toBe(true);
		expect(Object.isFrozen(fallback.trigger)).toBe(true);
		expect(
			encoder.encode(JSON.stringify(output)).byteLength,
		).toBeLessThanOrEqual(256_000);
		expect(output.content).toContain("Selected heading");
		expect(output.content).toContain("Selected evidence 界");
		expect(output.content).not.toContain("Outside");
		expect(output.content).not.toContain("Unretained suffix");
		expect(output.content.endsWith("\n")).toBe(true);
		for (const line of output.content.slice(0, -1).split("\n"))
			expect(line.startsWith("    ")).toBe(true);
		expect(new TextDecoder().decode(encoder.encode(output.content))).toBe(
			output.content,
		);
		if (method === "content-focus")
			expect(output.contentSelection).toMatchObject({
				policy: "main-content-v1",
				selected: "main",
				reason: "unique-main",
			});
		else expect(output).not.toHaveProperty("contentSelection");
		expect(() => execute(input, selection, "markdown")).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		released(3);
	},
);

it("does not emit prefix metadata or change fitting Markdown for any ordinary HTML selection", async () => {
	const input = await fixture();
	const released = observeOwnership();
	for (const { selection } of prefixContexts) {
		const strict = execute(input, selection, "markdown");
		const optedIn = execute(
			input,
			{ ...selection, ...prefixPolicy },
			"markdown",
		);
		expect(optedIn.report.extraction?.content).toBe(
			strict.report.extraction?.content,
		);
		expect(optedIn.report.extraction?.contentSelection).toEqual(
			strict.report.extraction?.contentSelection,
		);
		expect(optedIn.report.selection).toEqual({
			...strict.report.selection,
			...prefixPolicy,
		});
		expect(strict.report.selection).not.toHaveProperty("outputLimitPolicy");
		expect(optedIn.report.extraction).not.toHaveProperty("contentFallback");
		expect(strict.report.extraction).not.toHaveProperty("contentFallback");
		expect(optedIn.report.reader).toEqual(strict.report.reader);
	}
	released(6);
});

it("accepts five own selection keys combining focus, prefix and all table flags", async () => {
	const input = await fixture(
		'<h1>Outside heading</h1><main><table><tr><th scope="col">Name</th></tr><tr><td>Value</td></tr></table></main>',
	);
	const selection: replay.ResearchJsonReplaySelection = {
		...focus,
		...prefixPolicy,
		tableMetadata: false,
		tableRows: true,
		compactTables: true,
	};
	expect(Reflect.ownKeys(selection)).toHaveLength(5);
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	const result = execute(input, Object.freeze(selection), "markdown");
	expect(extract.mock.calls[0][1]).toMatchObject(selection);
	expect(result.report.selection).toEqual({
		method: "content-focus",
		matches: null,
		...prefixPolicy,
	});
	expect(result.report.extraction).toMatchObject({
		format: "markdown",
		tableRows: true,
		compactTables: true,
		contentSelection: { selected: "main", reason: "unique-main" },
	});
	expect(result.report.extraction?.content).toContain("Value");
	expect(result.report.extraction).not.toHaveProperty("contentFallback");
	const validate = vi.mocked(admission.validateResearchReplayAdmission);
	validate.mockClear();
	expect(() =>
		execute(input, { ...selection, selector: undefined }, "markdown"),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		execute(input, { ...selection, tableMetadata: true }, "markdown"),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
	released();
});

it("rejects invalid prefix tokens, accessors, non-Markdown formats and discovery modes before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const outputLimitPolicy of [
		undefined,
		null,
		true,
		1,
		"",
		"text-prefix-v2",
		" text-prefix-v1",
		"text-prefix-v1 ",
		["text-prefix-v1"],
		{},
		Object("text-prefix-v1"),
	])
		expect(() =>
			execute(input, { ...focus, outputLimitPolicy }, "markdown"),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	const getter = vi.fn(() => {
		throw new Error("Output policy must be an own data value");
	});
	expect(() =>
		execute(
			input,
			Object.defineProperty({ ...focus }, "outputLimitPolicy", {
				get: getter,
				enumerable: true,
			}),
			"markdown",
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(getter).not.toHaveBeenCalled();
	for (const { selection } of prefixContexts) {
		const optedIn = { ...selection, ...prefixPolicy };
		expect(() => execute(input, optedIn, "json")).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() =>
			replay.extractResearchReplayJson(input.raw, input.trusted, optedIn),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	}
	for (const mode of [
		{ links: "details" },
		{ lines: { start: 1, end: 2 } },
		{ find: "Owned" },
		{ headings: true },
	])
		for (const format of formats)
			expect(() =>
				execute(input, { ...mode, ...prefixPolicy }, format),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects explicit prefix policy on every named recovery selector and section contract", async () => {
	const input = await fixture();
	const outputAdmission = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	const emptyAdmission = vi.spyOn(
		admission,
		"validateResearchEmptyOutlineAdmission",
	);
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const format of formats) {
		expect(() =>
			replay.recoverResearchOutputLimitSection(
				input.raw,
				input.trusted,
				{
					section: "#owned",
					...prefixPolicy,
				} as replay.ResearchOutputLimitSectionSelection,
				undefined,
				format,
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		for (const recover of selectorRecoveries)
			expect(() =>
				recover(
					input,
					{
						selector: "main",
						...prefixPolicy,
					} as replay.ResearchOutputLimitSelectorSelection,
					format,
				),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	}
	expect(outputAdmission).not.toHaveBeenCalled();
	expect(emptyAdmission).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("does not let prefix output bypass pins, incomplete or failed evidence, barriers or HTML admission", async () => {
	const original = await fixture(undefined, { profile: "long-v1" });
	const failed = await fixture(
		`<h1>Large</h1><main>${"Large evidence. ".repeat(20_000)}</main>`,
		{ outline: false, outcome: "failure" },
	);
	expect(failed.report.failure).toMatchObject({
		category: "resource-limit",
		stage: "extraction",
		resourceLimit: { kind: "extraction.output", limit: 256_000 },
	});
	const blocked = await fixture(
		"<title>Just a moment...</title><h1>Checking your browser</h1><main>Owned</main>",
		{ outcome: "semantic-barrier" },
	);
	const plain = await fixture("Literal source", {
		contentType: "text/plain; charset=utf-8",
	});
	const incomplete = revised(original, (report) => {
		if (!report.headings) throw new Error("Expected native outline");
		report.headings.truncated = true;
	});
	const selection = { ...focus, ...prefixPolicy };
	const released = observeOwnership();
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const trusted of [
		{ ...original.trusted, expectedReceiptSha256: "0".repeat(64) },
		{
			...original.trusted,
			expectedBody: { bytes: original.body.byteLength, sha256: "0".repeat(64) },
		},
	])
		expect(() =>
			execute({ ...original, trusted }, selection, "markdown"),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	for (const input of [failed, blocked, incomplete])
		expect(() => execute(input, selection, "markdown")).toThrow(
			expect.objectContaining({ code: "policy-denied" }),
		);
	expect(() => execute(plain, selection, "markdown")).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(load).not.toHaveBeenCalled();
	released(1, 0);
});
