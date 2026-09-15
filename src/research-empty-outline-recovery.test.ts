import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://empty-outline.fixture.invalid/project";
const privateMarker = "EMPTY_OUTLINE_PRIVATE_SENTINEL";
const source = `<main id="description"><p>Useful non-heading evidence.</p><pre>const answer = 42;</pre><table id="data"><tr><td>42</td></tr></table></main><aside>Outside selected content. ${privateMarker}</aside><div id="empty"></div>`;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: admission.TrustedResearchReplayAdmission;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected fetch");
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

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	html = source,
	options: {
		profile?: ResearchDocumentProfileId;
		execution?: ResearchExecutionOptions;
		headingCount?: number;
	} = {},
): Promise<Fixture> {
	const body = encoder.encode(html);
	const profile = options.profile ?? "long-v1";
	const headingCount = options.headingCount ?? 0;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
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
		true,
		undefined,
		profile,
		{ minRequestIntervalMs: 0, ...options.execution },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report).toMatchObject({
		outcome: headingCount === 0 ? "empty-extraction" : "extracted-unverified",
		contentSuccess: headingCount === 0 ? false : null,
		classification: { barrier: null, diagnostic: null },
		headings: { method: "heading-outline", partial: true, truncated: false },
		reader: { scripting: false, styling: false },
		metrics: { active: 0, closed: true },
	});
	expect(report.headings?.entries).toHaveLength(headingCount);
	expect(report.headings?.document).toBe(report.navigation?.documentRef);
	expect(body).toEqual(encoder.encode(html));
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

function revised(
	input: Fixture,
	...changes: readonly (readonly [string, unknown])[]
): Fixture {
	const report = structuredClone(input.report);
	for (const [path, value] of changes) {
		const keys = path.split(".");
		const last = keys.pop();
		if (!last) throw new Error("Missing mutation path");
		let parent = report as unknown as Record<string, unknown>;
		for (const key of keys) parent = parent[key] as Record<string, unknown>;
		if (value === undefined) delete parent[last];
		else parent[last] = value;
	}
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function recover(
	input: Fixture,
	selection: unknown = { selector: "#description" },
	signal?: AbortSignal,
) {
	return replay.recoverResearchEmptyOutlineSelector(
		input.raw,
		input.trusted,
		selection as replay.ResearchEmptyOutlineSelectorSelection,
		signal,
	);
}

function rejects(action: () => unknown, code?: ErrorCode) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected recovery rejection");
	if (code !== undefined) expect(caught.code).toBe(code);
	expect(caught.message.length).toBeGreaterThan(0);
	expect(caught.message.length).toBeLessThan(200);
	expect(caught.message).not.toContain(privateMarker);
	expect(caught.message).not.toContain("Useful non-heading evidence");
	expect(Object.hasOwn(caught, "cause")).toBe(false);
	return caught;
}

function observeOwnership() {
	const validate = admission.validateResearchEmptyOutlineAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(
		admission,
		"validateResearchEmptyOutlineAdmission",
	).mockImplementation((...args) => {
		const result = validate(...args);
		bodies.push(result.body);
		return result;
	});
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].byteLength).toBeGreaterThan(0);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		expect(close).toHaveBeenCalled();
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned document");
			expect(tree.nodeCount).toBe(0);
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
		}
	};
}

it("admits only the explicit recovery while retaining original empty evidence", async () => {
	const input = await fixture();
	const original = structuredClone(input);
	expect(
		admission.validateResearchReplayAdmission(input.raw, input.trusted),
	).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
	});
	rejects(
		() =>
			replay.extractResearchReplayJson(input.raw, input.trusted, {
				selector: "#description",
			}),
		"policy-denied",
	);
	const accepted = admission.validateResearchEmptyOutlineAdmission(
		input.raw,
		input.trusted,
	);
	try {
		expect(accepted).toMatchObject({
			kind: "validated-capture",
			selectedProfile: "long-v1",
			receiptSha256: hash(input.raw),
			bodyIdentity: input.trusted.expectedBody,
			originalMetadata: { outcome: "empty-extraction", contentSuccess: false },
		});
		expect(accepted.recovery).toEqual({
			kind: "captured-empty-outline-selector",
			originalOutcome: "empty-extraction",
			originalContentSuccess: false,
			originalRequestRetried: false,
			originalDiscovery: {
				method: "heading-outline",
				entries: 0,
				truncated: false,
				scannedNodes: input.report.headings?.scannedNodes,
			},
		});
		expect(accepted.body).toEqual(input.body);
		expect(accepted.body).not.toBe(input.body);
		expect(Object.isFrozen(accepted)).toBe(true);
		expect(Object.isFrozen(accepted.recovery)).toBe(true);
	} finally {
		accepted.body.fill(0);
	}
	expect(input).toEqual(original);
});

it.each(["json", "markdown"] as const)(
	"recovers a unique non-heading subtree as %s without retrying",
	async (format) => {
		const input = await fixture();
		const original = structuredClone(input);
		const released = observeOwnership();
		const result = replay.recoverResearchEmptyOutlineSelector(
			input.raw,
			input.trusted,
			{ selector: "#description" },
			undefined,
			format,
		);
		expect(result.report).toMatchObject({
			partial: true,
			contentSuccess: null,
			outcome: "extracted-unverified",
			networkRequests: 0,
			source: {
				profile: "long-v1",
				reportedFinalUrl: url,
				receiptSha256: hash(input.raw),
				body: input.trusted.expectedBody,
			},
			selection: { method: "css-selector", matches: 1 },
			recovery: {
				kind: "captured-empty-outline-selector",
				originalOutcome: "empty-extraction",
				originalContentSuccess: false,
				originalRequestRetried: false,
				originalDiscovery: {
					method: "heading-outline",
					entries: 0,
					truncated: false,
					scannedNodes: input.report.headings?.scannedNodes,
				},
			},
			extraction: { format },
		});
		if (result.report.extraction?.format === "markdown")
			expect(result.report.extraction.content).toContain(
				"Useful non\\-heading evidence",
			);
		else expect(result.jsonl).toContain("Useful non-heading evidence");
		expect(result.jsonl).toContain("const answer = 42;");
		expect(result.jsonl).not.toContain("Outside selected content");
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.report.headings).toBeUndefined();
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(input).toEqual(original);
		released();
	},
);

it.each([false, true])(
	"retains JSON table metadata opt-in %s",
	async (enabled) => {
		const input = await fixture();
		const released = observeOwnership();
		const result = recover(input, {
			selector: "#data",
			tableMetadata: enabled,
		});
		expect(result.report.outcome).toBe("extracted-unverified");
		expect(result.jsonl.includes("native-table-source-v1")).toBe(enabled);
		released();
	},
);

it.each([{ tableRows: true }, { compactTables: true }])(
	"retains explicit Markdown table options %j",
	async (options) => {
		const input = await fixture();
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const result = replay.recoverResearchEmptyOutlineSelector(
			input.raw,
			input.trusted,
			{ selector: "#data", ...options },
			undefined,
			"markdown",
		);
		expect(result.report.extraction).toMatchObject({ format: "markdown" });
		expect(result.jsonl).toContain("42");
		expect(extract).toHaveBeenCalledWith(
			expect.any(DocumentTree),
			expect.objectContaining({
				...options,
				format: "markdown",
				maxBytes: 256_000,
				maxNodes: 50_000,
				maxDepth: 128,
			}),
		);
		released();
	},
);

it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"reuses source visibility %s and raw separation policies",
	async (visibilityPolicy) => {
		const input = await fixture(
			`<main id="description"><p>Visible evidence</p><script>${privateMarker}</script><p hidden>Hidden attribute text</p><p style="display:none">Hidden inline text</p></main>`,
			{
				execution: {
					readerRawPolicy: "separate-omitted-raw-v1",
					readerVisibilityPolicy: visibilityPolicy,
				},
			},
		);
		const original = structuredClone(input);
		const released = observeOwnership();
		const result = recover(input);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			reader: {
				rawTextPolicy: "separate-omitted-raw-v1",
				visibilityPolicy,
				scripting: false,
				styling: false,
			},
		});
		expect(result.jsonl).toContain("Visible evidence");
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.jsonl).not.toContain("Hidden attribute text");
		expect(result.jsonl.includes("Hidden inline text")).toBe(
			visibilityPolicy === "source-hidden-v1",
		);
		expect(input).toEqual(original);
		released();
	},
);

it.each(["#absent", "main, aside"])(
	"requires exactly one selector match for %s and cleans up",
	async (selector) => {
		const input = await fixture();
		const original = structuredClone(input);
		const released = observeOwnership();
		rejects(
			() => recover(input, { selector }),
			selector === "#absent" ? "not-found" : "invalid-input",
		);
		expect(input).toEqual(original);
		released();
	},
);

it("keeps an actually empty selected subtree explicitly unsuccessful", async () => {
	const input = await fixture();
	const released = observeOwnership();
	expect(recover(input, { selector: "#empty" }).report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		networkRequests: 0,
		selection: { method: "css-selector", matches: 1 },
		recovery: {
			originalOutcome: "empty-extraction",
			originalRequestRetried: false,
		},
	});
	released();
});

it.each([
	["outcome", "extracted-unverified"],
	["contentSuccess", null],
	["partial", false],
	["failure", { category: "timeout", stage: "loader" }],
	["outputLimit", { omittedPayloads: ["bodyCapture"] }],
	["rateLimit", { kind: "http-rate-limit", status: 429 }],
	["classification", undefined],
	["classification.classifier", "other"],
	["classification.barrier", "challenge"],
	["classification.barrier", "login"],
	["classification.barrier", "access-denied"],
	["classification.diagnostic", {}],
	["bodyCapture", undefined],
	["bodyCapture", null],
	["bodyCapture.sha256", "0".repeat(64)],
	["bodyCapture.decodedBytes", 1],
	["bodyCapture.decodedBytes", 4_000_001],
	["bodyCapture.data", "not-base64"],
	["bodyCapture.encoding", "utf-8"],
	["primaryResponse", null],
	["primaryResponse.url", `${url}/other`],
	["primaryResponse.status", 302],
	["primaryResponse.status", 403],
	["primaryResponse.status", 429],
	["primaryResponse.bodySha256", "0".repeat(64)],
	["primaryResponse.decodedBytes", 1],
	["primaryResponse.hashScope", "reader-output"],
	["primaryResponse.headers.content-type", undefined],
	["primaryResponse.headers.content-type", ["text/plain"]],
	["primaryResponse.headers.content-type", ["text/markdown"]],
	["primaryResponse.headers.content-type", ["text/html", "text/html"]],
	["finalUrl", `${url}/other`],
	["navigation", undefined],
	["navigation.kind", "download"],
	["navigation.url", `${url}/other`],
	["navigation.tabId", ""],
	["navigation.documentRef", ""],
	["navigation.scripts", {}],
	["navigation.response.url", `${url}/other`],
	["navigation.response.status", 201],
	["navigation.response.bytes", 1],
	["navigation.response.redirects", 1],
	["reader", undefined],
	["reader.profile", "native"],
	["reader.partial", false],
	["reader.scripting", true],
	["reader.styling", true],
	["reader.hiddenContentSemantics", true],
	["metrics", undefined],
	["metrics.active", 1],
	["metrics.closed", false],
	["selection", undefined],
	["selection.method", "css-selector"],
	["selection.matches", 0],
	["headings", undefined],
	["headings", null],
	["headings.method", "text-line-discovery"],
	["headings.entries", undefined],
	["headings.entries", {}],
	["headings.entries", [null]],
	["headings.truncated", true],
	["headings.truncated", undefined],
	["headings.partial", false],
	["headings.document", "different-document"],
	["headings.revision", -1],
	["headings.revision", 0.5],
	["headings.revision", null],
	["headings.scannedNodes", undefined],
	["headings.scannedNodes", 0],
	["headings.scannedNodes", -1],
	["headings.scannedNodes", 0.5],
	["headings.scannedNodes", null],
	["headings.scannedNodes", "5"],
	["headings.scannedNodes", 50_001],
] as const)(
	"rejects re-pinned invalid receipt field %s (%j)",
	async (path, value) => {
		const input = revised(await fixture(), [path, value]);
		const original = structuredClone(input);
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() =>
			admission.validateResearchEmptyOutlineAdmission(input.raw, input.trusted),
		);
		rejects(() => recover(input));
		expect(load).not.toHaveBeenCalled();
		expect(input).toEqual(original);
	},
);

it.each([
	"receipt",
	"body",
	"bytes",
	"profile",
	"missing-receipt",
	"missing-body",
])("requires independent host authority: %s", async (field) => {
	const input = await fixture();
	const trusted = structuredClone(input.trusted) as unknown as Record<
		string,
		unknown
	>;
	if (field === "receipt") trusted.expectedReceiptSha256 = "0".repeat(64);
	else if (field === "profile") trusted.expectedProfile = "default";
	else if (field === "missing-receipt")
		Reflect.deleteProperty(trusted, "expectedReceiptSha256");
	else if (field === "missing-body")
		Reflect.deleteProperty(trusted, "expectedBody");
	else
		trusted.expectedBody = {
			bytes:
				field === "bytes" ? input.body.byteLength + 1 : input.body.byteLength,
			sha256: field === "body" ? "0".repeat(64) : hash(input.body),
		};
	const changed = {
		...input,
		trusted: trusted as unknown as admission.TrustedResearchReplayAdmission,
	};
	rejects(() =>
		admission.validateResearchEmptyOutlineAdmission(
			changed.raw,
			changed.trusted,
		),
	);
	rejects(() => recover(changed));
});

it("rejects a genuine default-profile empty receipt", async () => {
	const input = await fixture(source, { profile: "default" });
	rejects(() =>
		admission.validateResearchEmptyOutlineAdmission(input.raw, input.trusted),
	);
	rejects(() => recover(input));
});

it("cannot replace the body by re-pinning only the receipt and body metadata", async () => {
	const input = await fixture();
	const replacement = encoder.encode(source.replace("Useful", "Forged"));
	const changed = revised(
		input,
		["bodyCapture", captureResearchBody(replacement, "long-v1")],
		["primaryResponse.bodySha256", hash(replacement)],
	);
	expect(replacement.byteLength).toBe(input.body.byteLength);
	expect(changed.trusted.expectedBody).toEqual(input.trusted.expectedBody);
	rejects(() => recover(changed), "invalid-input");
});

it("reparses pinned bytes before trusting a forged empty heading receipt", async () => {
	const input = revised(
		await fixture(`<h1>Actual heading</h1>${source}`, { headingCount: 1 }),
		["outcome", "empty-extraction"],
		["contentSuccess", false],
		["headings.entries", []],
	);
	const original = structuredClone(input);
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	rejects(() => recover(input), "policy-denied");
	expect(extract).not.toHaveBeenCalled();
	expect(input).toEqual(original);
	released();
});

it("rejects a nonempty native outline relabeled as empty extraction", async () => {
	const input = revised(
		await fixture(`<h1>Actual heading</h1>${source}`, { headingCount: 1 }),
		["outcome", "empty-extraction"],
		["contentSuccess", false],
	);
	rejects(() =>
		admission.validateResearchEmptyOutlineAdmission(input.raw, input.trusted),
	);
	rejects(() => recover(input));
});

it("reclassifies challenge response headers rather than returning recovered content", async () => {
	const input = revised(await fixture(), [
		"primaryResponse.headers.cf-mitigated",
		["challenge"],
	]);
	const original = structuredClone(input);
	const released = observeOwnership();
	const result = recover(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
		networkRequests: 0,
	});
	expect(result.report.extraction).toBeUndefined();
	expect(result.jsonl).not.toContain(privateMarker);
	expect(input).toEqual(original);
	released();
});

it.each([
	["challenge", "Security check", "Verify you are human"],
	["login", "Sign in", "Sign in to continue"],
] as const)(
	"does not recover hidden %s source as content",
	async (_kind, title, marker) => {
		const input = await fixture(
			`<title style="display:none">${title}</title><aside>${"x".repeat(9000)}</aside><main id="description"><p style="display:none">${marker}</p><p>Visible answer</p></main>`,
			{ execution: { readerVisibilityPolicy: "source-hidden-inline-v1" } },
		);
		const original = structuredClone(input);
		const released = observeOwnership();
		rejects(() => recover(input), "policy-denied");
		expect(input).toEqual(original);
		released();
	},
);

it.each([
	null,
	undefined,
	[],
	{},
	{ section: "#description" },
	{ links: "project" },
	{ lines: { start: 1, end: 2 } },
	{ find: "project" },
	{ headings: true },
	{ selector: "" },
	{ selector: " main" },
	{ selector: "[" },
	{ selector: "main::before" },
	{ selector: "main", section: "main" },
	{ selector: "main", tableMetadata: "true" },
	{ selector: "main", tableRows: true },
	{ selector: "main", compactTables: true },
	{ selector: "main", extra: true },
	{ selector: "x".repeat(4097) },
])("rejects invalid selection before admission: %j", async (selection) => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchEmptyOutlineAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(
		() =>
			replay.recoverResearchEmptyOutlineSelector(
				input.raw,
				input.trusted,
				selection as never,
			),
		"invalid-input",
	);
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects selection proxies and accessors without invoking untrusted code", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const revoked = Proxy.revocable({ selector: "main" }, {});
	revoked.revoke();
	const selections = [
		new Proxy(
			{ selector: "main" },
			{ get: hook, ownKeys: hook, getPrototypeOf: hook },
		),
		revoked.proxy,
		Object.defineProperty({}, "selector", { enumerable: true, get: hook }),
		Object.defineProperty({ selector: "main" }, "tableMetadata", { get: hook }),
		Object.create({ selector: "main" }),
		{ selector: "main", [Symbol(privateMarker)]: true },
	];
	const validate = vi.spyOn(admission, "validateResearchEmptyOutlineAdmission");
	for (const selection of selections)
		rejects(() => recover(input, selection), "invalid-input");
	expect(hook).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

it("accepts a plain null-prototype selection at the existing selector bound", async () => {
	const input = await fixture();
	const selector = `main${" ".repeat(4080)}> table#data`;
	expect(selector).toHaveLength(4096);
	const released = observeOwnership();
	const result = recover(
		input,
		Object.assign(Object.create(null), { selector }),
	);
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		selection: { method: "css-selector", matches: 1 },
	});
	released();
});

it("rejects authority and receipt hooks without invoking them or loading bodies", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	const hostile = [
		{ ...input, raw: new Proxy(input.raw, { get: hook, ownKeys: hook }) },
		{
			...input,
			trusted: new Proxy(input.trusted, {
				get: hook,
				ownKeys: hook,
				getPrototypeOf: hook,
			}),
		},
		{
			...input,
			trusted: Object.defineProperty(
				{ ...input.trusted },
				"expectedReceiptSha256",
				{
					enumerable: true,
					get: hook,
				},
			),
		},
		{
			...input,
			trusted: {
				...input.trusted,
				expectedBody: Object.defineProperty({}, "sha256", {
					enumerable: true,
					get: hook,
				}),
			},
		},
	];
	for (const changed of hostile)
		rejects(() => recover(changed as Fixture), "invalid-input");
	expect(hook).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects pre-cancellation before admission or hostile selection inspection", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const validate = vi.spyOn(admission, "validateResearchEmptyOutlineAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(
		() =>
			recover(
				input,
				new Proxy({}, { ownKeys: hook, get: hook }),
				controller.signal,
			),
		"aborted",
	);
	expect(hook).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it.each(["aborted", "timeout"] as const)(
	"cleans up after %s during reparse",
	async (code) => {
		const input = await fixture();
		const controller = new AbortController();
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const released = observeOwnership();
		const load = loader.loadResearchDocument;
		vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
			(...args) => {
				const tree = load(...args);
				if (code === "aborted") controller.abort(new Error(privateMarker));
				else now += replay.researchJsonReplayLimits.timeoutMs;
				return tree;
			},
		);
		rejects(() => recover(input, undefined, controller.signal), code);
		released();
	},
);

it("retains extraction byte limits even with an admissible empty outline", async () => {
	const input = await fixture(
		`<main id="description"><p>${"Large evidence. ".repeat(20_000)}</p></main>`,
	);
	const original = structuredClone(input);
	const released = observeOwnership();
	rejects(() => recover(input), "resource-limit");
	expect(input).toEqual(original);
	released();
});

it("keeps byte, work and deadline caps unchanged", () => {
	expect(replay.researchJsonReplayLimits).toEqual({
		maxSelectorCodeUnits: 4096,
		maxExtractionBytes: 256_000,
		maxOutputBytes: 327_680,
		maxNodes: 50_000,
		maxDepth: 128,
		timeoutMs: 20_000,
	});
	expect(researchLongDocumentAdmission).toMatchObject({
		maxCaptureBytes: 4_000_000,
		document: { maxNodes: 50_000, maxDepth: 128 },
		derived: {
			maxParserInputWorkCodeUnits: 32_000_000,
			maxParserTokens: 400_000,
		},
		headings: { maxBytes: 256_000, maxNodes: 50_000, maxEntries: 256 },
		evidence: { maxReceiptBytes: 6_000_000, maxMetadataBytes: 65_536 },
	});
});
