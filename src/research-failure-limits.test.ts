import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { resourceLimitError } from "./resource-limit.js";

const url = "https://resource-limits.fixture.invalid/";

beforeEach(() => {
	const body = new TextEncoder().encode("<p>Public fixture</p>");
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockResolvedValue({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
});

afterEach(() => vi.restoreAllMocks());

it("reports a tagged loader failure without publishing its message", async () => {
	vi.spyOn(documentLoader, "loadBrowserDocument").mockImplementation(() => {
		throw resourceLimitError("html.tokens", 8, 9, "PRIVATE_FAILURE_SENTINEL");
	});
	const report = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		true,
	);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "loader",
		resourceLimit: {
			kind: "html.tokens",
			unit: "tokens",
			limit: 8,
			observed: 9,
		},
	});
	expect(report.outcome).toBe("failure");
	expect(report.partial).toBe(true);
	expect(report.contentSuccess).toBe(false);
	expect(report.extraction).toBeUndefined();
	expect(report.metrics?.closed).toBe(true);
	expect(report.primaryResponse?.status).toBe(200);
	expect(report.bodyCapture).toBeDefined();
	expect(JSON.stringify(report)).not.toContain("PRIVATE_FAILURE_SENTINEL");
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
});

it.each(["resource-limit", "unsupported", "aborted"] as const)(
	"leaves untagged %s failures unchanged, ignoring forged properties",
	async (category) => {
		vi.spyOn(documentLoader, "loadBrowserDocument").mockImplementation(() => {
			const error = new AgentBrowserError(category, "PRIVATE_FAILURE_SENTINEL");
			Object.defineProperty(error, "resourceLimit", {
				get() {
					throw new Error("Getter must not run");
				},
			});
			throw error;
		});
		const report = await researchNavigation(url);
		expect(report.failure).toEqual({ category, stage: "loader" });
		expect(Object.hasOwn(report.failure as object, "resourceLimit")).toBe(
			false,
		);
		expect(report.contentSuccess).toBe(false);
		expect(report.metrics?.closed).toBe(true);
		expect(JSON.stringify(report)).not.toContain("PRIVATE_FAILURE_SENTINEL");
	},
);

it("measures actual reader depth through the complete mock navigation path", async () => {
	const body = new TextEncoder().encode("<div>".repeat(129));
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValue({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(url, true);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "loader",
		resourceLimit: {
			kind: "reader.depth",
			unit: "levels",
			limit: 128,
			observed: 129,
		},
	});
	expect(report.metrics?.closed).toBe(true);
	expect(report.extraction).toBeUndefined();
});

it("does not add diagnostics to successful partial extraction", async () => {
	const report = await researchNavigation(url, true);
	expect(report.failure).toBeUndefined();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.contentSuccess).toBeNull();
	expect(report.metrics?.closed).toBe(true);
});
