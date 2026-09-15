import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://selector-recovery.fixture.invalid/project";
const description =
	'<div id="description"><p>Introductory project evidence.</p><pre>const value = 42;</pre><table><tr><td>42</td></tr></table></div>';
const source = `<h1>Project</h1>${description}<div id="files"><p>${"Repeated file metadata. ".repeat(14_000)}</p></div><div id="empty"></div>`;

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
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

async function fixture(html = source) {
	const body = encoder.encode(html);
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
		false,
		undefined,
		"default",
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: {
			category: "resource-limit",
			stage: "extraction",
			resourceLimit: { kind: "extraction.output", limit: 256_000 },
		},
		metrics: { active: 0, closed: true },
	});
	const raw = admission.serializeResearchReport(report, "default").jsonl;
	vi.clearAllMocks();
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function revised(input: Fixture, path: string, value: unknown) {
	const report = structuredClone(input.report);
	const keys = path.split(".");
	const last = keys.pop();
	if (!last) throw new Error("Missing mutation path");
	let parent = report as unknown as Record<string, unknown>;
	for (const key of keys) parent = parent[key] as Record<string, unknown>;
	if (value === undefined) delete parent[last];
	else parent[last] = value;
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
	return replay.recoverResearchOutputLimitSelector(
		input.raw,
		input.trusted,
		selection as replay.ResearchOutputLimitSelectorSelection,
		signal,
	);
}

function observeOwnership() {
	const validate = admission.validateResearchOutputLimitSectionAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	).mockImplementation((...args) => {
		const result = validate(...args);
		bodies.push(result.body);
		return result;
	});
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected an owned document");
		expect(tree.nodeCount).toBe(0);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	};
}

it.each(["json", "markdown"] as const)(
	"recovers a non-heading subtree as %s without admitting ordinary failed replay",
	async (format) => {
		const input = await fixture();
		const original = structuredClone(input);
		expect(
			admission.validateResearchReplayAdmission(input.raw, input.trusted),
		).toMatchObject({ kind: "evidence-only", reason: "native-failure" });
		expect(() =>
			replay.extractResearchReplayJson(input.raw, input.trusted, {
				selector: "#description",
			}),
		).toThrow(expect.objectContaining({ code: "policy-denied" }));
		const released = observeOwnership();
		const result = replay.recoverResearchOutputLimitSelector(
			input.raw,
			input.trusted,
			{
				selector: "#description",
				...(format === "markdown"
					? { tableRows: true }
					: { tableMetadata: true }),
			},
			undefined,
			format,
		);
		expect(result.report).toMatchObject({
			partial: true,
			contentSuccess: null,
			outcome: "extracted-unverified",
			networkRequests: 0,
			selection: { method: "css-selector", matches: 1 },
			recovery: {
				kind: "captured-output-limit-selector",
				originalOutcome: "failure",
				originalContentSuccess: false,
				originalFailure: input.report.failure,
				originalRequestRetried: false,
			},
		});
		if (result.report.extraction?.format === "markdown")
			expect(result.report.extraction.content).toContain(
				"Introductory project evidence\\.",
			);
		else expect(result.jsonl).toContain("Introductory project evidence.");
		expect(result.jsonl).toContain("const value = 42;");
		expect(result.jsonl).not.toContain("Repeated file metadata.");
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(input).toEqual(original);
		released();
	},
);

it("does not silently substitute heading or outline recovery", async () => {
	const input = await fixture();
	expect(() =>
		replay.recoverResearchOutputLimitSection(input.raw, input.trusted, {
			section: "h1",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	const outline = replay.outlineResearchOutputLimitCapture(
		input.raw,
		input.trusted,
	);
	expect(outline.report.recovery.kind).toBe("captured-output-limit-outline");
	expect(outline.report.headings?.entries).toHaveLength(1);
	expect(recover(input).report.recovery.kind).toBe(
		"captured-output-limit-selector",
	);
});

it.each(["#absent", "div"])(
	"requires exactly one match for %s and releases all owned state",
	async (selector) => {
		const input = await fixture();
		const released = observeOwnership();
		expect(() => recover(input, { selector })).toThrow(
			expect.objectContaining({
				code: selector === "#absent" ? "not-found" : "invalid-input",
			}),
		);
		released();
	},
);

it.each(["body", "#files"])(
	"retains output limits for %s",
	async (selector) => {
		const input = await fixture();
		const released = observeOwnership();
		expect(() => recover(input, { selector })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		released();
	},
);

it("keeps empty subtree recovery explicitly unsuccessful", async () => {
	const input = await fixture();
	const released = observeOwnership();
	expect(recover(input, { selector: "#empty" }).report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		selection: { matches: 1 },
	});
	released();
});

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
	{ selector: " div" },
	{ selector: "[" },
	{ selector: "div::before" },
	{ selector: "div", section: "h1" },
	{ selector: "div", tableMetadata: "true" },
	{ selector: "div", tableRows: true },
	{ selector: "div", extra: true },
	{ selector: "x".repeat(4097) },
])(
	"rejects invalid selector recovery before admission %j",
	async (selection) => {
		const input = await fixture();
		const validate = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		expect(() =>
			replay.recoverResearchOutputLimitSelector(
				input.raw,
				input.trusted,
				selection as never,
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(validate).not.toHaveBeenCalled();
	},
);

it("does not invoke selection accessors", async () => {
	const input = await fixture();
	const getter = vi.fn(() => "#description");
	const selection = Object.defineProperty({}, "selector", {
		get: getter,
		enumerable: true,
	});
	expect(() => recover(input, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(getter).not.toHaveBeenCalled();
});

it.each([
	["failure.stage", "loader"],
	["failure.category", "timeout"],
	["failure.resourceLimit.kind", "network.response-decoded"],
	["failure.resourceLimit.unit", "code-units"],
	["failure.resourceLimit.observed", 256_000],
	["outcome", "extracted-unverified"],
	["contentSuccess", null],
	["classification.barrier", "challenge"],
	["bodyCapture", undefined],
	["bodyCapture.sha256", "0".repeat(64)],
	["primaryResponse.bodySha256", "0".repeat(64)],
	["primaryResponse.status", 403],
	["navigation.response.status", 429],
	["primaryResponse.headers.content-type", ["text/markdown"]],
	["reader.scripting", true],
	["metrics.active", 1],
	["metrics.closed", false],
])("retains failure-admission rejection for %s", async (path, value) => {
	const input = revised(await fixture(), path as string, value);
	expect(() => recover(input)).toThrow(AgentBrowserError);
});

it.each(["receipt", "body", "profile"])(
	"requires the original %s authority",
	async (field) => {
		const input = await fixture();
		const trusted =
			field === "receipt"
				? { ...input.trusted, expectedReceiptSha256: "0".repeat(64) }
				: field === "body"
					? {
							...input.trusted,
							expectedBody: {
								bytes: input.body.byteLength,
								sha256: "0".repeat(64),
							},
						}
					: { ...input.trusted, expectedProfile: "long-v1" as const };
		expect(() =>
			replay.recoverResearchOutputLimitSelector(input.raw, trusted, {
				selector: "#description",
			}),
		).toThrow(AgentBrowserError);
	},
);

it("rejects cancellation before admission", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort();
	const validate = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	expect(() =>
		recover(input, { selector: "#description" }, controller.signal),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(validate).not.toHaveBeenCalled();
});

it("reclassifies selected challenge text beyond the document diagnostic prefix", async () => {
	const input = await fixture(
		`<title>Just a moment...</title><p>${"Ordinary source prefix. ".repeat(14_000)}</p><div id="description">Verify you are human. Checking your browser. Complete the CAPTCHA.</div>`,
	);
	const released = observeOwnership();
	expect(recover(input).report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
	});
	released();
});
