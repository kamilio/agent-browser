import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	type ResearchJsonReplaySelection,
	extractResearchReplayJson,
	researchJsonReplayLimits,
} from "../scripts/research-json-replay.js";
import * as challenges from "./browser-challenges.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import {
	type ResearchReaderRawPolicy,
	researchReaderInfo,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const encoder = new TextEncoder();
const url = "https://link-replay.fixture.invalid/document";
const policy = "separate-omitted-raw-v1";
const privateMarker = "SYNTHETIC_LINK_REPLAY_PRIVATE";
const heading = '<h1 id="owned">Owned heading</h1>';
const links =
	'<main><a href="/DGX-one">First system</a><a href="/dgx-two#details">Second system</a><a href="/other">DGX label only</a></main>';
const smallSource = `${heading}${links}`;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Replay must not fetch");
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
	source = smallSource,
	profile: ResearchDocumentProfileId = "default",
	options: { reader?: boolean; rawPolicy?: ResearchReaderRawPolicy } = {},
): Promise<Fixture> {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	const report = await researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		true,
		undefined,
		profile,
		{ minRequestIntervalMs: 0, readerRawPolicy: options.rawPolicy },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(hash(body)).toBe(hash(encoder.encode(source)));
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	vi.clearAllMocks();
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

function revised(
	input: Fixture,
	mutate: (report: Record<string, unknown>) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report as unknown as Record<string, unknown>);
	const serialized = serializeResearchReport(
		report,
		input.trusted.expectedProfile,
	);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function replay(
	input: Fixture,
	selection: ResearchJsonReplaySelection = { links: "dgx" },
	signal?: AbortSignal,
) {
	const rawHash = hash(input.raw);
	const bodyHash = hash(input.body);
	const trusted = structuredClone(input.trusted);
	try {
		const result = extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
			signal,
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
				reportedFinalUrl: url,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		for (const key of [
			"bodyCapture",
			"rawReceipt",
			"originalMetadata",
			"originalFieldPresence",
		])
			expect(result.jsonl).not.toContain(`"${key}"`);
		return result;
	} finally {
		expect(hash(input.raw)).toBe(rawHash);
		expect(hash(input.body)).toBe(bodyHash);
		expect(input.trusted).toEqual(trusted);
	}
}

function rejects(action: () => unknown, code: ErrorCode) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected bounded replay rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).not.toContain(privateMarker);
	for (const key of ["cause", "body", "rawReceipt", "originalMetadata"])
		expect(Object.hasOwn(caught, key)).toBe(false);
	return caught;
}

function observeOwnership() {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind === "validated-capture") bodies.push(admitted.body);
			return admitted;
		},
	);
	const load = vi.spyOn(loader, "loadResearchDocument");
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return {
		load,
		assert(closed = true) {
			expect(bodies).toHaveLength(1);
			expect(bodies[0].byteLength).toBeGreaterThan(0);
			expect(bodies[0].every((value) => value === 0)).toBe(true);
			if (closed) {
				expect(close).toHaveBeenCalledOnce();
				const tree = close.mock.contexts[0];
				if (!(tree instanceof DocumentTree))
					throw new Error("Expected owned replay document");
				expect(tree.mutationMetrics().closed).toBe(true);
				expect(researchReaderInfo(tree)).toBeUndefined();
			} else expect(close).not.toHaveBeenCalled();
		},
	};
}

it.each(["default", "long-v1"] as const)(
	"discovers multiple links from a pinned %s capture without whole-document extraction",
	async (profile) => {
		const input = await fixture(undefined, profile);
		const extract = vi.spyOn(extraction, "extractDocument");
		const ownership = observeOwnership();
		const result = replay(input, { links: "dGx" });
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "link-url-search", matches: 2 },
			classification: { barrier: null, diagnostic: null },
			links: {
				method: "link-discovery",
				partial: true,
				query: "dGx",
				truncated: false,
			},
		});
		expect(
			result.report.links?.entries.map(({ url, label }) => ({ url, label })),
		).toEqual([
			{
				url: "https://link-replay.fixture.invalid/DGX-one",
				label: "First system",
			},
			{
				url: "https://link-replay.fixture.invalid/dgx-two#details",
				label: "Second system",
			},
		]);
		expect(result.report).not.toHaveProperty("extraction");
		expect(extract).not.toHaveBeenCalled();
		expect(ownership.load.mock.calls[0]).toHaveLength(3);
		ownership.assert();
	},
);

it("replays a native capture that did not use the partial reader", async () => {
	const input = await fixture(undefined, "default", { reader: false });
	const ownership = observeOwnership();
	expect(replay(input).report.selection).toEqual({
		method: "link-url-search",
		matches: 2,
	});
	ownership.assert();
});

it("keeps the whole-body JSON cap while bounded link replay succeeds", async () => {
	const input = await fixture(
		`${heading}<p>${"Body".repeat(90_000)}</p>${links}`,
	);
	rejects(() => replay(input, { selector: "body" }), "resource-limit");
	const ownership = observeOwnership();
	const result = replay(input);
	expect(result.report.links?.entries).toHaveLength(2);
	expect(result.jsonl).not.toContain("Body");
	expect(result.outputBytes).toBeLessThan(4096);
	ownership.assert();
});

it("reports an empty link result without claiming content success", async () => {
	const input = await fixture();
	const ownership = observeOwnership();
	expect(replay(input, { links: "not-present" }).report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		selection: { method: "link-url-search", matches: 0 },
		links: { entries: [], truncated: false },
	});
	ownership.assert();
});

it("reports returned entry count rather than total matches when truncated", async () => {
	const anchors = Array.from(
		{ length: 35 },
		(_, index) => `<a href="/dgx-${index}">${"L".repeat(257)}</a>`,
	).join("");
	const input = await fixture(`${heading}<main>${anchors}</main>`);
	const result = replay(input);
	expect(result.report.selection).toEqual({
		method: "link-url-search",
		matches: 32,
	});
	expect(result.report.links?.truncated).toBe(true);
	expect(result.report.links?.entries).toHaveLength(32);
	expect(result.report.links?.entries[0]).toMatchObject({
		label: "L".repeat(256),
		labelTruncated: true,
	});
	expect(result.report.links?.entries[31].url).toBe(
		"https://link-replay.fixture.invalid/dgx-31",
	);
});

it.each(["top", "reader", "both"] as const)(
	"preserves the pinned %s raw-policy declaration for a >2MB omitted script",
	async (location) => {
		const script = `${privateMarker}${"x".repeat(2_100_001)}`;
		const original = await fixture(
			`${heading}<script>${script}</script>${links}`,
			"long-v1",
			{ rawPolicy: policy },
		);
		const input = revised(original, (report) => {
			if (location === "reader")
				Reflect.deleteProperty(report, "readerRawPolicy");
			if (location === "top")
				Reflect.deleteProperty(report.reader as object, "rawTextPolicy");
		});
		const ownership = observeOwnership();
		const result = replay(input);
		expect(input.body.byteLength).toBeGreaterThan(2 * 1024 * 1024);
		expect(result.report).toMatchObject({
			selection: { method: "link-url-search", matches: 2 },
			reader: {
				rawTextPolicy: policy,
				omittedRaw: { codeUnits: script.length, elements: 1 },
			},
		});
		expect(result.report.reader).toEqual(original.report.reader);
		expect(result.jsonl).not.toContain(privateMarker);
		expect(ownership.load.mock.calls[0]).toHaveLength(4);
		expect(ownership.load.mock.calls[0][3]).toBe(policy);
		ownership.assert();
	},
);

it("does not grant the separate raw budget to a legacy-policy capture", async () => {
	const original = await fixture(
		`${heading}<script>${"x".repeat(2_100_001)}</script>${links}`,
		"long-v1",
		{ rawPolicy: policy },
	);
	const input = revised(original, (report) => {
		Reflect.deleteProperty(report, "readerRawPolicy");
		Reflect.deleteProperty(report.reader as object, "rawTextPolicy");
		Reflect.deleteProperty(report.reader as object, "omittedRaw");
	});
	const ownership = observeOwnership();
	const error = rejects(() => replay(input), "resource-limit");
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.text",
		limit: 2_000_000,
	});
	expect(ownership.load.mock.calls[0]).toHaveLength(3);
	ownership.assert(false);
});

it.each(["unknown", "contradictory"])(
	"rejects %s raw-policy declarations before loading",
	async (kind) => {
		const original = await fixture(undefined, "long-v1", { rawPolicy: policy });
		const input = revised(original, (report) => {
			report.readerRawPolicy =
				kind === "unknown" ? privateMarker : "legacy-shared-v1";
		});
		const ownership = observeOwnership();
		rejects(() => replay(input), "invalid-input");
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(false);
	},
);

it("leaves the fixed replay limits and selector/section defaults unchanged", async () => {
	expect(researchJsonReplayLimits).toEqual({
		maxSelectorCodeUnits: 4096,
		maxExtractionBytes: 256_000,
		maxOutputBytes: 327_680,
		maxNodes: 50_000,
		maxDepth: 128,
		timeoutMs: 20_000,
	});
	const input = await fixture();
	for (const selection of [{ selector: "main" }, { section: "h1" }] as const) {
		const result = replay(input, selection);
		expect(result.report.selection).toEqual({
			method: "selector" in selection ? "css-selector" : "heading-section",
			matches: 1,
		});
		expect(result.report.extraction?.format).toBe("json");
		expect(result.report).not.toHaveProperty("links");
		expect(result.jsonl).not.toContain("tableSource");
	}
	for (const selection of [{ selector: "a" }, { section: "a" }] as const)
		rejects(() => replay(input, selection), "invalid-input");
	for (const selection of [
		{ selector: ".missing" },
		{ section: ".missing" },
	] as const)
		rejects(() => replay(input, selection), "not-found");
});

it.each([
	{},
	{ links: "" },
	{ links: "x".repeat(257) },
	{ links: "dgx one" },
	{ links: "dgx\t" },
	{ links: "dgx\0" },
	{ links: "dgx\x7f" },
	{ links: 1 },
	{ links: undefined },
	{ links: "dgx", selector: "main" },
	{ links: "dgx", section: "h1" },
	{ links: "dgx", selector: undefined },
	{ links: "dgx", tableMetadata: true },
	{ links: "dgx", tableMetadata: false },
	{ links: "dgx", tableMetadata: undefined },
	{ links: "dgx", maxEntries: 256 },
	{ selector: "main", section: "h1" },
])("rejects invalid selection %# before admission", async (selection) => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(
		() => replay(input, selection as ResearchJsonReplaySelection),
		"invalid-input",
	);
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects selection hooks, proxies, inherited links and symbol keys without executing them", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const accessor = Object.defineProperty({}, "links", { get: hook });
	const proxy = new Proxy(
		{ links: "dgx" },
		{ get: hook, getPrototypeOf: hook, ownKeys: hook },
	);
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const selection of [
		accessor,
		proxy,
		Object.create({ links: "dgx" }),
		{ links: "dgx", [Symbol("private")]: true },
	])
		rejects(() => replay(input, selection), "invalid-input");
	expect(hook).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

it("accepts a null-prototype selection with the exact literal query bound", async () => {
	const query = "x".repeat(256);
	const input = await fixture(`${heading}<a href="/${query}">Exact query</a>`);
	const selection = Object.assign(Object.create(null), { links: query });
	expect(replay(input, selection).report.links?.entries).toHaveLength(1);
});

it.each(["receipt", "body-bytes", "body-sha256"] as const)(
	"rejects an unauthorized %s pin before loading",
	async (pin) => {
		const input = await fixture();
		const trusted = {
			...input.trusted,
			...(pin === "receipt"
				? { expectedReceiptSha256: "0".repeat(64) }
				: {
						expectedBody: {
							bytes: input.body.byteLength + (pin === "body-bytes" ? 1 : 0),
							sha256: pin === "body-sha256" ? "0".repeat(64) : hash(input.body),
						},
					}),
		};
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay({ ...input, trusted }), "invalid-input");
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([
	"failed",
	"challenged",
	"capture-missing",
	"body-pin-missing",
	"discovery-incomplete",
] as const)(
	"rejects evidence-only %s receipts rather than weakening capture admission",
	async (reason) => {
		const original = await fixture(undefined, "long-v1");
		let input = revised(original, (report) => {
			if (reason === "failed") {
				report.outcome = "failure";
				report.contentSuccess = false;
				report.failure = { category: "unsupported", stage: "extraction" };
			} else if (reason === "challenged") {
				report.outcome = "semantic-barrier";
				report.contentSuccess = false;
				(report.classification as Record<string, unknown>).barrier =
					"challenge";
			} else if (reason === "capture-missing")
				Reflect.deleteProperty(report, "bodyCapture");
			else if (reason === "discovery-incomplete")
				(report.headings as Record<string, unknown>).truncated = true;
		});
		if (reason === "body-pin-missing") {
			const { expectedBody, ...trusted } = input.trusted;
			expect(expectedBody).toBeDefined();
			input = { ...input, trusted };
		}
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay(input), "policy-denied");
		expect(load).not.toHaveBeenCalled();
	},
);

it("stops at the whole-document barrier before link discovery", async () => {
	const input = await fixture(
		`<title>Just a moment...</title>${heading}<aside hidden>Checking your browser</aside>${links}`,
		"default",
		{ reader: false },
	);
	const discover = vi.spyOn(extraction, "discoverDocumentLinks");
	const ownership = observeOwnership();
	const result = replay(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { method: "link-url-search", matches: null },
		classification: { barrier: "challenge" },
	});
	expect(result.report).not.toHaveProperty("links");
	expect(result.report).not.toHaveProperty("extraction");
	expect(discover).not.toHaveBeenCalled();
	ownership.assert();
});

it("classifies selected link labels after the bounded whole-document diagnostic", async () => {
	const input = await fixture(
		`<title>Just a moment...</title>${heading}<aside>${"x".repeat(8192)}</aside><a href="/dgx">Checking your browser</a>`,
	);
	const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
	const ownership = observeOwnership();
	const result = replay(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { method: "link-url-search", matches: 1 },
		classification: { barrier: "challenge" },
	});
	expect(classify.mock.calls[0][0].text).not.toContain("Checking your browser");
	expect(classify.mock.calls[1][0].text).toBe("Checking your browser");
	expect(result.report).not.toHaveProperty("extraction");
	ownership.assert();
});

it("passes unchanged bounds and a cancellation checkpoint to link discovery", async () => {
	const input = await fixture();
	const discover = vi.spyOn(extraction, "discoverDocumentLinks");
	replay(input);
	expect(discover).toHaveBeenCalledWith(expect.any(DocumentTree), "dgx", {
		maxBytes: 256_000,
		maxNodes: 50_000,
		maxDepth: 128,
		checkpoint: expect.any(Function),
	});
});

it("releases the document and admitted body when link discovery fails", async () => {
	const input = await fixture();
	const ownership = observeOwnership();
	vi.spyOn(extraction, "discoverDocumentLinks").mockImplementationOnce(() => {
		throw new AgentBrowserError("resource-limit", "Synthetic link limit");
	});
	rejects(() => replay(input), "resource-limit");
	ownership.assert();
});

it("wipes the admitted body even when document cleanup throws", async () => {
	const input = await fixture();
	const close = DocumentTree.prototype.close;
	const ownership = observeOwnership();
	vi.mocked(DocumentTree.prototype.close).mockImplementationOnce(function (
		this: DocumentTree,
	) {
		close.call(this);
		throw new AgentBrowserError("closed", "Synthetic close failure");
	});
	rejects(() => replay(input), "closed");
	ownership.assert();
});

it("rejects an already aborted request before admission", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	rejects(() => replay(input, { links: "dgx" }, controller.signal), "aborted");
	expect(validate).not.toHaveBeenCalled();
});

it.each(["aborted", "timeout"] as const)(
	"honors %s inside the link-discovery checkpoint",
	async (code) => {
		const input = await fixture();
		const controller = new AbortController();
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const discover = extraction.discoverDocumentLinks;
		const ownership = observeOwnership();
		vi.spyOn(extraction, "discoverDocumentLinks").mockImplementationOnce(
			(...args) => {
				if (code === "aborted") controller.abort(new Error(privateMarker));
				else now += 20_000;
				return discover(...args);
			},
		);
		rejects(() => replay(input, { links: "dgx" }, controller.signal), code);
		ownership.assert();
	},
);

it("checks the deadline after link discovery before publishing JSONL", async () => {
	const input = await fixture();
	let now = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const discover = extraction.discoverDocumentLinks;
	const ownership = observeOwnership();
	vi.spyOn(extraction, "discoverDocumentLinks").mockImplementationOnce(
		(...args) => {
			const result = discover(...args);
			now += 20_000;
			return result;
		},
	);
	rejects(() => replay(input), "timeout");
	ownership.assert();
});
