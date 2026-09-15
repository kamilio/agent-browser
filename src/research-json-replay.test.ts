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
import type { ExtractedNode } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const encoder = new TextEncoder();
const requestedUrl = "https://replay.fixture.invalid/start";
const finalUrl = "https://replay.fixture.invalid/final?private=query#fragment";
const reportedFinalUrl = "https://replay.fixture.invalid/final?redacted";
const privateMarker = "SYNTHETIC_REPLAY_PRIVATE";
const profiles = ["default", "long-v1"] as const;
const table =
	'<table id="results"><caption id="caption">Café 😀</caption><colgroup id="columns" span=" +02 "><col id="column" span="-2"></colgroup><thead id="head"><tr id="header-row"><th id="heading&amp;😀" headers=" missing&#9;duplicate duplicate " colspan="not-a-number" rowspan="-3" scope=" ROWGROUP " abbr="Short &amp; exact" title="PRIVATE_TITLE" data-private="PRIVATE_ATTRIBUTE">Header</th></tr></thead><tbody id="body"><tr id="data-row"><td id="value" headers="heading&amp;😀 heading&amp;😀 missing" colspan="0" rowspan="+0002" scope="PRIVATE_SCOPE" abbr="PRIVATE_ABBR">42</td></tr></tbody><tfoot id="foot"><tr id="footer-row"><td headers="" colspan="NaN" rowspan="1.5">End</td></tr></tfoot></table>';
const tableRecords = [
	{ tag: "table", attributes: { id: "results" } },
	{ tag: "caption", attributes: { id: "caption" } },
	{ tag: "colgroup", attributes: { id: "columns", span: " +02 " } },
	{ tag: "col", attributes: { id: "column", span: "-2" } },
	{ tag: "thead", attributes: { id: "head" } },
	{ tag: "tr", attributes: { id: "header-row" } },
	{
		tag: "th",
		attributes: {
			id: "heading&😀",
			headers: " missing\tduplicate duplicate ",
			colspan: "not-a-number",
			rowspan: "-3",
			scope: " ROWGROUP ",
			abbr: "Short & exact",
		},
	},
	{ tag: "tbody", attributes: { id: "body" } },
	{ tag: "tr", attributes: { id: "data-row" } },
	{
		tag: "td",
		attributes: {
			id: "value",
			headers: "heading&😀 heading&😀 missing",
			colspan: "0",
			rowspan: "+0002",
		},
	},
	{ tag: "tfoot", attributes: { id: "foot" } },
	{ tag: "tr", attributes: { id: "footer-row" } },
	{
		tag: "td",
		attributes: { headers: "", colspan: "NaN", rowspan: "1.5" },
	},
].map((record) => ({ kind: "native-table-source-v1", ...record }));

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
	source = `<h1 id="owned">Owned heading</h1><main>${table}</main>`,
	profile: ResearchDocumentProfileId = "default",
	options: { reader?: boolean; contentType?: string; status?: number } = {},
): Promise<Fixture> {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
		url: finalUrl,
		status: options.status ?? 200,
		headers: {
			"content-type": [options.contentType ?? "text/html; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	const report = await researchNavigation(
		requestedUrl,
		options.reader ?? true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		options.contentType === undefined,
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(source));
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted: TrustedResearchReplayAdmission = {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	vi.clearAllMocks();
	return { report, raw, body, trusted };
}

function revised(
	input: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report);
	const raw = serializeResearchReport(
		report,
		input.trusted.expectedProfile,
	).jsonl;
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function rejects(action: () => unknown, code: ErrorCode): AgentBrowserError {
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

function replay(
	input: Fixture,
	selection: ResearchJsonReplaySelection = { selector: "main" },
	signal?: AbortSignal,
) {
	const rawHash = hash(input.raw);
	const trusted = structuredClone(input.trusted);
	try {
		const result = extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
			signal,
		);
		expect(result).not.toBeInstanceOf(Promise);
		const text = result.jsonl;
		expect(text.endsWith("\n")).toBe(true);
		expect(text.split("\n")).toHaveLength(2);
		expect(JSON.parse(text)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(text).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: input.report.finalUrl,
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
			expect(text).not.toContain(`"${key}"`);
		expect(result.report.selection).not.toHaveProperty("selector");
		expect(result.report.selection).not.toHaveProperty("section");
		return result;
	} finally {
		expect(hash(input.raw)).toBe(rawHash);
		expect(input.trusted).toEqual(trusted);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	}
}

function nodes(result: ReturnType<typeof extractResearchReplayJson>) {
	const extracted = result.report.extraction;
	expect(extracted?.format).toBe("json");
	if (extracted?.format !== "json")
		throw new Error("Expected native JSON replay extraction");
	function flatten(node: ExtractedNode): ExtractedNode[] {
		return [node, ...(node.children ?? []).flatMap(flatten)];
	}
	return flatten(extracted.content);
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
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return {
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
				expect(loader.researchReaderInfo(tree)).toBeUndefined();
			} else expect(close).not.toHaveBeenCalled();
		},
	};
}

it.each(profiles)(
	"replays owned %s discovery with exact table metadata and reported URL",
	async (profile) => {
		const input = await fixture(undefined, profile);
		expect(input.report.outcome).toBe("extracted-unverified");
		const ownership = observeOwnership();
		const result = replay(input, {
			selector: "main > table",
			tableMetadata: true,
		});
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "css-selector", matches: 1 },
			classification: { barrier: null, diagnostic: null },
			source: { reportedFinalUrl },
			extraction: { format: "json", url: reportedFinalUrl, partial: true },
		});
		expect(nodes(result).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
		expect(JSON.stringify(result.report)).not.toContain("PRIVATE_");
		expect(JSON.stringify(result.report)).not.toContain("private=query");
		ownership.assert();
	},
);

it("keeps the exported replay ceilings fixed without increasing defaults", () => {
	expect(researchJsonReplayLimits).toEqual({
		maxSelectorCodeUnits: 4096,
		maxExtractionBytes: 256_000,
		maxOutputBytes: 327_680,
		maxNodes: 50_000,
		maxDepth: 128,
		timeoutMs: 20_000,
	});
	expect(Object.isFrozen(researchJsonReplayLimits)).toBe(true);
});

it.each(profiles)(
	"passes fixed extraction and profile document limits for %s",
	async (profile) => {
		const input = await fixture(undefined, profile);
		const load = vi.spyOn(loader, "loadResearchDocument");
		const extract = vi.spyOn(extraction, "extractDocument");
		replay(input);
		expect(load).toHaveBeenCalledWith(
			expect.objectContaining({ url: reportedFinalUrl }),
			expect.objectContaining({
				limits: {
					maxNodes: 50_000,
					maxDepth: 128,
					maxTextCodeUnits: profile === "long-v1" ? 4_000_000 : 2_000_000,
					maxChanges: 1024,
				},
			}),
			profile,
		);
		expect(extract).toHaveBeenCalledWith(
			expect.any(DocumentTree),
			expect.objectContaining({
				format: "json",
				maxBytes: 256_000,
				maxNodes: 50_000,
				maxDepth: 128,
			}),
		);
	},
);

it.each([undefined, false])(
	"omits table metadata when tableMetadata is %s",
	async (tableMetadata) => {
		const input = await fixture();
		const result = replay(input, { selector: "main", tableMetadata });
		for (const node of nodes(result))
			expect(node).not.toHaveProperty("tableSource");
		expect(JSON.stringify(result.report)).not.toContain("heading&😀");
	},
);

it("omits metadata when the option is absent and accepts native default receipts", async () => {
	const input = await fixture(undefined, "default", { reader: false });
	expect(input.report.profile).toBe("native");
	for (const node of nodes(replay(input)))
		expect(node).not.toHaveProperty("tableSource");
});

it("admits a greater-than-2MB long capture with an omitted script and small table", async () => {
	const source = `<!--${"x".repeat(700_000)}--><h1>Long owned heading</h1><script>${"x".repeat(1_500_000)}</script><main>${table}</main>`;
	const input = await fixture(source, "long-v1");
	expect(input.report.failure).toBeUndefined();
	expect(input.report.outcome).toBe("extracted-unverified");
	expect(input.body.byteLength).toBeGreaterThan(2_000_000);
	expect(input.body.byteLength).toBeLessThan(4_000_000);
	const result = replay(input, { selector: "table", tableMetadata: true });
	expect(result.report.outcome).toBe("extracted-unverified");
	expect(result.report.reader?.omittedSubtrees.script).toBe(1);
	expect(nodes(result).flatMap((node) => node.tableSource ?? [])).toEqual(
		tableRecords,
	);
	expect(result.outputBytes).toBeLessThan(20_000);
	expect(JSON.stringify(result.report)).not.toContain("x".repeat(100));
	rejects(
		() =>
			extractResearchReplayJson(
				input.raw,
				{ ...input.trusted, expectedProfile: "default" },
				{ selector: "table" },
			),
		"invalid-input",
	);
});

it.each(profiles)(
	"scopes %s heading sections without selecting adjacent content",
	async (profile) => {
		const input = await fixture(
			`<p>Outside prefix</p><h2 id="chosen">Owned section</h2>${table}<h3>Nested heading</h3><p>Nested body</p><h2>Outside boundary</h2><p>Outside suffix</p>`,
			profile,
		);
		const result = replay(input, {
			section: "h2:first-of-type",
			tableMetadata: true,
		});
		expect(result.report.selection).toEqual({
			method: "heading-section",
			matches: 1,
		});
		expect(result.report.extraction?.sectionSelection).toMatchObject({
			method: "heading-section",
			level: 2,
		});
		const text = JSON.stringify(result.report.extraction);
		expect(text).toContain("Owned section");
		expect(text).toContain("Nested body");
		expect(text).not.toContain("Outside");
		expect(nodes(result).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
	},
);

it("does not promote a long capture whose omitted script exceeded the reader text limit", async () => {
	const input = await fixture(
		`<h1>Owned</h1><script>${"x".repeat(2_000_001)}</script><main>Selected</main>`,
		"long-v1",
	);
	expect(input.report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: {
			category: "resource-limit",
			resourceLimit: {
				kind: "reader.text",
				unit: "code-units",
				limit: 2_000_000,
				observed: 2_000_006,
			},
		},
	});
	expect(input.report.bodyCapture).toBeDefined();
	expect(
		admission.validateResearchReplayAdmission(input.raw, input.trusted),
	).toMatchObject({ kind: "evidence-only", reason: "native-failure" });
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(() => replay(input), "policy-denied");
	expect(load).not.toHaveBeenCalled();
});

it("preserves reader limitations while omitting controls and unselected private data", async () => {
	const input = await fixture(
		`<h1>Owned</h1><aside>${privateMarker}</aside><main><p hidden>Hidden source text</p><p>Visible text</p><input type="password" value="${privateMarker}"><textarea>${privateMarker}</textarea><script>${privateMarker}</script><style>${privateMarker}</style><svg><text>${privateMarker}</text></svg><math><mi>${privateMarker}</mi></math></main>`,
	);
	const result = replay(input, { selector: "main" });
	expect(result.report.reader).toMatchObject({
		profile: "native-semantic-reader-v1",
		partial: true,
		scripting: false,
		styling: false,
		hiddenContentSemantics: false,
		omittedSubtrees: { script: 1, style: 1, svg: 1, math: 1, input: 1 },
	});
	const text = JSON.stringify(result.report);
	expect(text).toContain("Hidden source text");
	expect(text).toContain("Visible text");
	expect(text).not.toContain(privateMarker);
});

const invalidSelections: { name: string; value: unknown }[] = [
	{ name: "null", value: null },
	{ name: "array", value: [] },
	{ name: "neither selector", value: {} },
	{ name: "both selectors", value: { selector: "main", section: "h1" } },
	{
		name: "own undefined selector",
		value: { selector: undefined, section: "h1" },
	},
	{ name: "empty selector", value: { selector: "" } },
	{ name: "blank selector", value: { selector: " \t" } },
	{ name: "untrimmed selector", value: { selector: " main " } },
	{ name: "non-string selector", value: { selector: 1 } },
	{ name: "invalid CSS", value: { selector: "main[" } },
	{ name: "empty section", value: { section: "" } },
	{ name: "untrimmed section", value: { section: " h1 " } },
	{ name: "invalid section CSS", value: { section: "h1[" } },
	{ name: "oversized selector", value: { selector: `#${"x".repeat(4096)}` } },
	{ name: "oversized section", value: { section: `#${"x".repeat(4096)}` } },
	{ name: "unknown key", value: { selector: "main", privateMarker } },
	{
		name: "larger requested limit",
		value: { selector: "main", maxBytes: 999_999 },
	},
	{ name: "null metadata", value: { selector: "main", tableMetadata: null } },
	{ name: "numeric metadata", value: { selector: "main", tableMetadata: 0 } },
	{
		name: "string metadata",
		value: { selector: "main", tableMetadata: "false" },
	},
	{
		name: "boxed metadata",
		value: { selector: "main", tableMetadata: Object(false) },
	},
];

it.each(invalidSelections)(
	"rejects $name before admission or document loading",
	async ({ value }) => {
		const input = await fixture();
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(
			() => replay(input, value as ResearchJsonReplaySelection),
			"invalid-input",
		);
		expect(validate).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	},
);

it("rejects proxies, accessors, inherited selectors and symbol keys without executing hooks", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const revoked = Proxy.revocable({ selector: "main" }, {});
	revoked.revoke();
	const values = [
		new Proxy(
			{ selector: "main" },
			{ get: hook, ownKeys: hook, getPrototypeOf: hook },
		),
		revoked.proxy,
		Object.defineProperty({}, "selector", { enumerable: true, get: hook }),
		Object.defineProperty({ selector: "main" }, "tableMetadata", { get: hook }),
		Object.create({ selector: "main" }),
		Object.assign(Object.create({}), { selector: "main" }),
		{ selector: "main", [Symbol(privateMarker)]: true },
	];
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const value of values)
		rejects(() => replay(input, value), "invalid-input");
	expect(hook).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

it("accepts a plain null-prototype selection and the exact 4096-unit CSS bound", async () => {
	const selector = `main${" ".repeat(4089)}> p`;
	expect(selector.length).toBe(4096);
	const input = await fixture("<h1>Owned</h1><main><p>Selected</p></main>");
	const selection = Object.assign(Object.create(null), {
		selector,
	});
	const result = replay(input, selection);
	expect(result.report.outcome).toBe("extracted-unverified");
	expect(JSON.stringify(result.report)).not.toContain(selector);
});

it.each([
	{ selection: { selector: ".missing" }, code: "not-found" },
	{ selection: { selector: "h2" }, code: "invalid-input" },
	{ selection: { section: ".missing" }, code: "not-found" },
	{ selection: { section: "h2" }, code: "invalid-input" },
	{ selection: { section: "main" }, code: "unsupported" },
] as const)(
	"rejects $selection with $code and closes its document",
	async ({ selection, code }) => {
		const input = await fixture(
			"<h2>First</h2><main>Owned</main><h2>Second</h2>",
		);
		const ownership = observeOwnership();
		rejects(() => replay(input, selection), code);
		ownership.assert();
	},
);

it("does not mistake an existing empty element for a missing target or meaningful content", async () => {
	const input = await fixture(
		"<h1>Owned</h1><main><p> \t\n </p><span></span><br></main>",
	);
	const result = replay(input);
	expect(result.report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		selection: { method: "css-selector", matches: 1 },
		classification: { barrier: null, diagnostic: null },
	});
});

it.each(["receipt", "body-bytes", "body-sha256"] as const)(
	"rejects a wrong external %s pin before loading",
	async (pin) => {
		const input = await fixture();
		const trusted = structuredClone(input.trusted);
		const invalid = {
			...trusted,
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
		rejects(() => replay({ ...input, trusted: invalid }), "invalid-input");
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([
	Uint8Array.of(255),
	encoder.encode("{}\n{}\n"),
	encoder.encode("null\n"),
])("rejects malformed pinned receipt bytes %#", async (raw) => {
	const input = await fixture();
	rejects(
		() =>
			replay({
				...input,
				raw,
				trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
			}),
		"invalid-input",
	);
});

it.each([
	"failed",
	"challenged",
	"capture-missing",
	"body-pin-missing",
	"discovery-incomplete",
] as const)(
	"refuses evidence-only %s without weakening native admission",
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
				report.classification.barrier = "challenge";
			} else if (reason === "capture-missing") {
				Reflect.deleteProperty(report, "bodyCapture");
			} else if (reason === "discovery-incomplete") {
				if (!report.headings) throw new Error("Missing owned outline");
				report.headings.truncated = true;
			}
		});
		if (reason === "body-pin-missing") {
			const { expectedBody, ...trusted } = input.trusted;
			expect(expectedBody).toBeDefined();
			input = { ...input, trusted };
		}
		expect(
			admission.validateResearchReplayAdmission(input.raw, input.trusted).kind,
		).toBe("evidence-only");
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay(input), "policy-denied");
		expect(load).not.toHaveBeenCalled();
	},
);

it("does not replay a real challenged capture even with correct external pins", async () => {
	const input = await fixture(
		"<title>Just a moment...</title><h1>Checking your browser</h1><main>Owned</main>",
	);
	expect(input.report.outcome).toBe("semantic-barrier");
	rejects(() => replay(input), "policy-denied");
});

it("rejects non-HTML validated captures as unsupported", async () => {
	const input = await fixture("Owned plain text", "default", {
		contentType: "text/plain; charset=utf-8",
	});
	expect(input.report.outcome).toBe("extracted-unverified");
	const ownership = observeOwnership();
	rejects(() => replay(input), "unsupported");
	ownership.assert(false);
});

it.each([
	{ name: "empty values", values: [] },
	{ name: "control characters", values: [`gzip\r\n${privateMarker}`] },
	{ name: "non-byte characters", values: ["gzip\u0100"] },
])(
	"rejects pinned optional headers with $name before loading",
	async ({ values }) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			if (!report.primaryResponse) throw new Error("Missing owned response");
			Reflect.deleteProperty(report.primaryResponse, "headerCapture");
			report.primaryResponse.headers = {
				...report.primaryResponse.headers,
				"content-encoding": values,
			};
		});
		const admitted = admission.validateResearchReplayAdmission(
			input.raw,
			input.trusted,
		);
		expect(admitted.kind).toBe("validated-capture");
		if (admitted.kind === "validated-capture") admitted.body.fill(0);
		const ownership = observeOwnership();
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay(input), "invalid-input");
		expect(load).not.toHaveBeenCalled();
		ownership.assert(false);
	},
);

it("runs the full-document diagnostic before extracting a scoped target", async () => {
	const input = await fixture(
		"<h1>Owned</h1><aside>Unselected diagnostic context</aside><main>Selected</main>",
	);
	const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
	const extract = vi.spyOn(extraction, "extractDocument");
	replay(input);
	expect(classify.mock.calls[0][0].text).toContain(
		"Unselected diagnostic context",
	);
	expect(classify.mock.invocationCallOrder[0]).toBeLessThan(
		extract.mock.invocationCallOrder[0],
	);
});

it("prechecks the whole document when the partial reader exposes a native-hidden challenge", async () => {
	const input = await fixture(
		"<title>Just a moment...</title><h1>Owned heading</h1><aside hidden>Checking your browser</aside><main>Selected</main>",
		"default",
		{ reader: false },
	);
	expect(input.report.outcome).toBe("extracted-unverified");
	const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
	const extract = vi.spyOn(extraction, "extractDocument");
	const ownership = observeOwnership();
	const result = replay(input, { selector: ".missing" });
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { method: "css-selector", matches: null },
		classification: {
			barrier: "challenge",
			diagnostic: { evidence: ["html-challenge-markers"] },
		},
	});
	expect(classify).toHaveBeenCalledOnce();
	expect(classify.mock.calls[0][0].text).toContain("Checking your browser");
	expect(result.report.extraction).toBeUndefined();
	expect(extract).not.toHaveBeenCalled();
	ownership.assert();
});

it.each(
	profiles.flatMap((profile) =>
		["selector", "section"].map((method) => ({ profile, method })),
	),
)(
	"detects a late $method challenge missed by the owned $profile heading discovery",
	async ({ profile, method }) => {
		const input = await fixture(
			`<title>Just a moment...</title><h1>Owned heading</h1><aside>${"x".repeat(8192)}</aside><main><h2 id="chosen">Selected heading</h2><p>Checking your browser</p></main><h2>Outside boundary</h2>`,
			profile,
		);
		expect(input.report.outcome).toBe("extracted-unverified");
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const result = replay(
			input,
			method === "section" ? { section: "main > h2" } : { selector: "main" },
		);
		expect(result.report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			selection: {
				method: method === "section" ? "heading-section" : "css-selector",
				matches: 1,
			},
			classification: {
				barrier: "challenge",
				diagnostic: { evidence: ["html-challenge-markers"] },
			},
		});
		expect(classify.mock.calls[0][0].text).not.toContain(
			"Checking your browser",
		);
		expect(classify.mock.calls[1][0].text).toContain("Checking your browser");
	},
);

it.each([4096, 4097])(
	"enforces the %s-unit table attribute boundary only when requested",
	async (length) => {
		const value = `${"😀".repeat(2048)}${length === 4097 ? "x" : ""}`;
		const input = await fixture(
			`<h1>Owned</h1><main><table><tr><th headers="${value}" colspan="NaN">Owned</th></tr></table></main>`,
		);
		if (length === 4096) {
			const result = replay(input, { selector: "table", tableMetadata: true });
			expect(
				nodes(result).find((node) => node.tableSource?.tag === "th")
					?.tableSource?.attributes,
			).toEqual({ headers: value, colspan: "NaN" });
		} else
			rejects(
				() => replay(input, { selector: "table", tableMetadata: true }),
				"resource-limit",
			);
		expect(replay(input).report.outcome).toBe("extracted-unverified");
	},
);

it("enforces the fixed 256000-byte extraction bound and releases owned resources", async () => {
	const cell = `<td headers="${"x".repeat(4096)}">Owned</td>`;
	const input = await fixture(
		`<h1>Owned</h1><main><table><tr>${cell.repeat(70)}</tr></table></main>`,
	);
	const ownership = observeOwnership();
	rejects(
		() => replay(input, { selector: "table", tableMetadata: true }),
		"resource-limit",
	);
	ownership.assert();
});

it("preserves the real default reader text limit and wipes the admitted body on failure", async () => {
	const input = await fixture(
		`<h1>Owned</h1><main>${"x".repeat(1_000_001)}</main>`,
		"default",
		{ reader: false },
	);
	expect(input.report.outcome).toBe("extracted-unverified");
	const ownership = observeOwnership();
	const error = rejects(() => replay(input), "resource-limit");
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "reader.text",
		unit: "code-units",
		limit: 1_000_000,
		observed: 1_000_006,
	});
	ownership.assert(false);
});

it("independently rejects final JSONL overflow and releases owned resources", async () => {
	const input = await fixture();
	const extract = extraction.extractDocument;
	const ownership = observeOwnership();
	vi.spyOn(extraction, "extractDocument").mockImplementationOnce((...args) => {
		const result = extract(...args);
		if (result.format !== "json") throw new Error("Expected owned JSON result");
		return {
			...result,
			content: { ...result.content, text: "x".repeat(327_680) },
		};
	});
	rejects(() => replay(input), "resource-limit");
	ownership.assert();
});

it("closes an initialized document when its loader throws before returning", async () => {
	const input = await fixture();
	const load = loader.loadResearchDocument;
	const ownership = observeOwnership();
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		load(...args);
		throw new AgentBrowserError("unsupported", "Synthetic loader failure");
	});
	rejects(() => replay(input), "unsupported");
	ownership.assert();
});

it("checks abort preflight before admission or loading and does not echo its reason", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(
		() => replay(input, { selector: "main" }, controller.signal),
		"aborted",
	);
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("wipes its admitted body even if document close throws", async () => {
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

it.each(["aborted", "timeout"] as const)(
	"checks %s after synchronous loading and releases the completed document",
	async (code) => {
		const input = await fixture();
		const controller = new AbortController();
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const load = loader.loadResearchDocument;
		const ownership = observeOwnership();
		vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
			(...args) => {
				const tree = load(...args);
				if (code === "aborted") controller.abort(new Error(privateMarker));
				else now += 20_001;
				return tree;
			},
		);
		rejects(() => replay(input, { selector: "main" }, controller.signal), code);
		ownership.assert();
	},
);

it("checks the monotonic deadline after extraction before publishing JSONL", async () => {
	const input = await fixture();
	let now = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const extract = extraction.extractDocument;
	const ownership = observeOwnership();
	vi.spyOn(extraction, "extractDocument").mockImplementationOnce((...args) => {
		const result = extract(...args);
		now += 20_001;
		return result;
	});
	rejects(() => replay(input), "timeout");
	ownership.assert();
});

it.each([19_999, 20_000])(
	"enforces the exact monotonic deadline at %s milliseconds",
	async (elapsed) => {
		const input = await fixture();
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const load = loader.loadResearchDocument;
		const ownership = observeOwnership();
		vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
			(...args) => {
				const tree = load(...args);
				now += elapsed;
				return tree;
			},
		);
		if (elapsed === 20_000) rejects(() => replay(input), "timeout");
		else expect(replay(input).report.outcome).toBe("extracted-unverified");
		ownership.assert();
	},
);
