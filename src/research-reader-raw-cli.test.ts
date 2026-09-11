import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import * as loader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://reader-raw.fixture.invalid/paper";
const otherUrl = "https://reader-raw.fixture.invalid/other";
const rawPolicy = "separate-omitted-raw-v1";
const rawFlags = ["--reader-raw-policy", rawPolicy];
const longFlags = [
	"--document-profile",
	"long-v1",
	"--reader",
	"--capture-body",
	"--headings",
];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected synthetic fetch");
		}),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function enqueue(source: string, overrides: Partial<NetworkResponse> = {}) {
	const body = new TextEncoder().encode(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	});
	return body;
}

function navigate(
	profile?: ResearchDocumentProfileId,
	options: ResearchExecutionOptions = { readerRawPolicy: rawPolicy },
	reader = true,
) {
	return researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		profile === "long-v1",
		undefined,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		options,
	);
}

function noSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(loader.loadResearchDocument).not.toHaveBeenCalled();
}

function closed(report: ResearchNavigationReport, count = 1) {
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(count);
	for (const [request] of vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls) {
		expect(request.cookieContext).toMatchObject({ credentials: "omit" });
		expect(request.body).toBeUndefined();
	}
}

it("adds only explicit raw policy selection to parsed arguments", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", url])).toEqual({
		reader: true,
		urls: [url],
	});
	for (const args of [
		["--reader", ...rawFlags, url],
		[...rawFlags, url, "--reader"],
		[...longFlags, ...rawFlags, url],
	]) {
		expect(parseResearchArguments(args)).toMatchObject({
			reader: true,
			readerRawPolicy: rawPolicy,
			urls: [url],
		});
	}
	noSetup();
});

it.each([
	["--reader", url, "--reader-raw-policy"],
	["--reader", "--reader-raw-policy", "--headings", url],
	["--reader", "--reader-raw-policy", "unknown", url],
	["--reader", "--reader-raw-policy", "", url],
	["--reader", "--reader-raw-policy", "default", url],
	["--reader", ...rawFlags, ...rawFlags, url],
	[...rawFlags, url],
	["--reader", `--reader-raw-policy=${rawPolicy}`, url],
	[...longFlags, ...rawFlags, url, otherUrl],
	[...longFlags.filter((flag) => flag !== "--capture-body"), ...rawFlags, url],
	[...longFlags.filter((flag) => flag !== "--headings"), ...rawFlags, url],
	[...longFlags, ...rawFlags, "--format", "json", url],
	["--reader", ...rawFlags, "--table-metadata", url],
])("rejects invalid CLI selection %j before setup", async (...args) => {
	expect(() => parseResearchArguments(args)).toThrow(AgentBrowserError);
	const batch = researchBatch(args);
	await expect(batch.next()).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it.each([null, false, 1, {}, [], "", "default", "unknown"])(
	"rejects invalid programmatic raw policy %j without requesting",
	async (value) => {
		await expect(
			navigate(undefined, {
				readerRawPolicy: value,
			} as unknown as ResearchExecutionOptions),
		).rejects.toMatchObject({ code: "invalid-input" });
		noSetup();
	},
);

it.each([false, 1, "true"])(
	"requires explicit programmatic reader true, not %j",
	async (reader) => {
		await expect(
			navigate(undefined, undefined, reader as boolean),
		).rejects.toMatchObject({ code: "invalid-input" });
		noSetup();
	},
);

it.each([undefined, "default", "long-v1"] as const)(
	"propagates selected policy into profile %s and its serialized report",
	async (profile) => {
		enqueue("<script>OMITTED_RAW</script><h1>Selected heading</h1>");
		const report = await navigate(profile);
		expect(report).toMatchObject({
			readerRawPolicy: rawPolicy,
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			reader: { rawTextPolicy: rawPolicy },
		});
		expect(report.reader).toHaveProperty("omittedRaw");
		expect(loader.loadResearchDocument).toHaveBeenCalledExactlyOnceWith(
			expect.any(Object),
			expect.any(Object),
			profile,
			rawPolicy,
		);
		const serialized = serializeResearchReport(report, profile);
		expect(serialized.disposition).toBe("complete");
		expect(
			JSON.parse(new TextDecoder().decode(serialized.jsonl)),
		).toMatchObject({
			readerRawPolicy: rawPolicy,
		});
		closed(report);
	},
);

it.each([undefined, "default", "long-v1"] as const)(
	"preserves legacy report shape and loader arity for profile %s",
	async (profile) => {
		enqueue("<script>legacy</script><h1>Legacy heading</h1>");
		const report = await navigate(profile, {});
		expect(report.outcome).toBe("extracted-unverified");
		expect(report).not.toHaveProperty("readerRawPolicy");
		expect(report.reader).not.toHaveProperty("rawTextPolicy");
		expect(report.reader).not.toHaveProperty("omittedRaw");
		expect(loader.loadResearchDocument).toHaveBeenCalledExactlyOnceWith(
			expect.any(Object),
			expect.any(Object),
			...(profile === "long-v1" ? [profile] : []),
		);
		closed(report);
	},
);

it("keeps the selected policy in a loader failure report", async () => {
	enqueue("<script>unterminated");
	const report = await navigate();
	expect(report).toMatchObject({
		readerRawPolicy: rawPolicy,
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "unsupported", stage: "loader" },
	});
	expect(report.reader).toBeUndefined();
	expect(report.extraction).toBeUndefined();
	closed(report);
});

it("keeps the selected policy on a network failure without retrying", async () => {
	const report = await navigate();
	expect(report).toMatchObject({
		readerRawPolicy: rawPolicy,
		outcome: "failure",
		primaryResponse: null,
		failure: { category: "policy-denied", stage: "network" },
	});
	expect(loader.loadResearchDocument).not.toHaveBeenCalled();
	closed(report);
});

it("admits long omitted script headings and capture only with explicit policy", async () => {
	const limit = researchLongDocumentAdmission.reader.maxTextCodeUnits;
	const source = `<script>${"x".repeat(limit + 1)}</script><h1>Long heading</h1>`;
	const body = enqueue(source);
	const selected = await navigate("long-v1");
	expect(selected).toMatchObject({
		readerRawPolicy: rawPolicy,
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		headings: { entries: [{ title: "Long heading" }], truncated: false },
		reader: { rawTextPolicy: rawPolicy, textCodeUnits: "Long heading".length },
	});
	expect(
		Buffer.compare(
			decodeResearchBodyCapture(selected.bodyCapture, "long-v1"),
			body,
		),
	).toBe(0);
	expect(selected.admission?.effective).toEqual(researchLongDocumentAdmission);
	expect(extraction.discoverDocumentHeadings).toHaveBeenCalledExactlyOnceWith(
		expect.any(Object),
		researchLongDocumentAdmission.headings,
	);
	closed(selected);
	enqueue(source);
	const legacy = await navigate("long-v1", {});
	expect(legacy).toMatchObject({
		outcome: "failure",
		failure: {
			category: "resource-limit",
			stage: "loader",
			resourceLimit: { kind: "reader.text", limit, observed: limit + 1 },
		},
	});
	expect(legacy).not.toHaveProperty("readerRawPolicy");
	expect(legacy.headings).toBeUndefined();
	expect(
		Buffer.compare(
			decodeResearchBodyCapture(legacy.bodyCapture, "long-v1"),
			body,
		),
	).toBe(0);
	expect(extraction.discoverDocumentHeadings).toHaveBeenCalledOnce();
	closed(legacy, 2);
});

it("preserves default JSON extraction with a separately bounded omitted script", async () => {
	const source = `<script>${"x".repeat(loader.researchReaderLimits.maxTextCodeUnits + 1)}</script><main><h1>JSON heading</h1><p>Retained text</p></main>`;
	enqueue(source);
	const report = await navigate(undefined, {
		readerRawPolicy: rawPolicy,
		format: "json",
	});
	expect(report).toMatchObject({
		readerRawPolicy: rawPolicy,
		outcome: "extracted-unverified",
		extraction: { format: "json", partial: true },
	});
	expect(report).not.toHaveProperty("admission");
	expect(report).not.toHaveProperty("bodyCapture");
	expect(JSON.stringify(report.extraction)).toContain("Retained text");
	expect(JSON.stringify(report.extraction)).not.toContain("x".repeat(100));
	expect(extraction.extractDocument).toHaveBeenCalledExactlyOnceWith(
		expect.any(Object),
		expect.objectContaining({
			format: "json",
			maxBytes: researchRunLimits.extractionBytes,
		}),
	);
	closed(report);
});

it.each([undefined, "long-v1"] as const)(
	"does not raise retained text caps for selected profile %s",
	async (profile) => {
		const limit =
			profile === "long-v1"
				? researchLongDocumentAdmission.reader.maxTextCodeUnits
				: loader.researchReaderLimits.maxTextCodeUnits;
		enqueue(`<p>${"x".repeat(limit + 1)}</p>`);
		const report = await navigate(profile);
		expect(report).toMatchObject({
			readerRawPolicy: rawPolicy,
			outcome: "failure",
			failure: {
				category: "resource-limit",
				stage: "loader",
				resourceLimit: { kind: "reader.text", limit, observed: limit + 1 },
			},
		});
		expect(extraction.extractDocument).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		closed(report);
	},
);

it("propagates the selected policy to every default batch request", async () => {
	enqueue("<h1>First batch heading</h1>");
	enqueue("<h1>Second batch heading</h1>", { url: otherUrl });
	const reports: ResearchNavigationReport[] = [];
	for await (const report of researchBatch([
		"--reader",
		...rawFlags,
		"--format",
		"json",
		url,
		otherUrl,
	]))
		reports.push(report);
	expect(reports).toHaveLength(2);
	for (const report of reports) {
		expect(report).toMatchObject({
			readerRawPolicy: rawPolicy,
			outcome: "extracted-unverified",
			reader: { rawTextPolicy: rawPolicy },
			extraction: { format: "json" },
		});
		closed(report, 2);
	}
	expect(loader.loadResearchDocument).toHaveBeenCalledTimes(2);
	for (const call of vi.mocked(loader.loadResearchDocument).mock.calls)
		expect(call.slice(2)).toEqual([undefined, rawPolicy]);
});

it.each(["header", "body", "rate-limit"] as const)(
	"keeps %s barriers blocking and stops the selected batch",
	async (barrier) => {
		enqueue(
			barrier === "body"
				? "<title>Just a moment...</title><p>Checking your browser</p><h1>Blocked</h1>"
				: "<h1>Blocked</h1>",
			barrier === "header"
				? {
						status: 403,
						headers: {
							"content-type": ["text/html"],
							"cf-mitigated": ["challenge"],
						},
					}
				: barrier === "rate-limit"
					? { status: 429 }
					: {},
		);
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			...rawFlags,
			"--capture-body",
			"--headings",
			url,
			otherUrl,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		const report = reports[0];
		expect(report).toMatchObject({
			readerRawPolicy: rawPolicy,
			contentSuccess: false,
		});
		expect(report.bodyCapture).toBeDefined();
		if (barrier === "rate-limit") {
			expect(report.outcome).toBe("http-failure");
			expect(report.primaryResponse?.status).toBe(429);
		} else {
			expect(report).toMatchObject({
				outcome: "semantic-barrier",
				classification: { barrier: "challenge" },
				failure: { category: "policy-denied", stage: "semantic-barrier" },
			});
			expect(report.headings).toBeUndefined();
			expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		}
		if (barrier === "header")
			expect(loader.loadResearchDocument).not.toHaveBeenCalled();
		closed(report);
	},
);
