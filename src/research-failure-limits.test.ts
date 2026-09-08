import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import { networkPolicyDiagnostic } from "./network-policy-diagnostic.js";
import { NetworkPolicy } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { resourceLimitError } from "./resource-limit.js";

const policyForwarding = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("Synthetic research policy tests forbid DNS and wire IO");
	}),
);
vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: policyForwarding,
	get: policyForwarding,
	createServer: policyForwarding,
}));
vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: policyForwarding,
	get: policyForwarding,
	createServer: policyForwarding,
}));
vi.mock("node:dns/promises", () => ({ Resolver: policyForwarding }));

afterEach(() => {
	expect(policyForwarding).not.toHaveBeenCalled();
	policyForwarding.mockClear();
});

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

const policyPrivate = "SYNTHETIC_RESEARCH_POLICY_PRIVATE";

function deniedAddressError(): AgentBrowserError {
	let caught: unknown;
	try {
		new NetworkPolicy().checkAddresses(url, ["127.0.0.1"]);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected the actual synthetic address-policy guard");
	expect(caught.code).toBe("policy-denied");
	return caught;
}

it("reports a genuine address-policy error through nonforwarding navigation", async () => {
	const error = deniedAddressError();
	const diagnostic = networkPolicyDiagnostic(error);
	expect(diagnostic).toEqual({
		kind: "network-policy-v1",
		reason: "resolved-address-policy",
	});
	error.message = policyPrivate;
	const loader = vi.spyOn(documentLoader, "loadBrowserDocument");
	vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
		error,
	);
	const report = await researchNavigation(url);
	expect(report.failure).toEqual({
		category: "policy-denied",
		stage: "network",
		networkPolicy: diagnostic,
	});
	expect(report.failure?.networkPolicy).toBe(diagnostic);
	expect(networkPolicyDiagnostic(error)).toBe(diagnostic);
	expect(report.outcome).toBe("failure");
	expect(report.partial).toBe(true);
	expect(report.contentSuccess).toBe(false);
	expect(report.classification).toEqual({
		classifier: "browser-challenges",
		barrier: null,
		diagnostic: null,
	});
	expect(report.primaryResponse).toBeNull();
	expect(report.extraction).toBeUndefined();
	expect(report.bodyCapture).toBeUndefined();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(loader).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
	expect(JSON.stringify(report)).not.toContain(policyPrivate);
	expect(networkPolicyDiagnostic(report.failure)).toBeUndefined();
	expect(
		networkPolicyDiagnostic(report.failure?.networkPolicy),
	).toBeUndefined();
});

it.each([
	{ kind: "unbranded-getter", category: "policy-denied" },
	{ kind: "ordinary-wrapper", category: "internal-error" },
	{ kind: "nonpolicy", category: "unsupported" },
	{ kind: "mutated-category", category: "unsupported" },
])(
	"does not infer producer policy metadata from $kind",
	async ({ kind, category }) => {
		const genuine = deniedAddressError();
		const diagnostic = networkPolicyDiagnostic(genuine);
		let reads = 0;
		let error: Error;
		if (kind === "unbranded-getter") {
			error = new AgentBrowserError("policy-denied", genuine.message);
			Object.defineProperty(error, "networkPolicy", {
				get() {
					reads++;
					throw new Error(policyPrivate);
				},
			});
		} else if (kind === "ordinary-wrapper") {
			error = new Error(policyPrivate, { cause: genuine });
		} else if (kind === "nonpolicy") {
			error = new AgentBrowserError("unsupported", policyPrivate);
		} else {
			error = genuine;
			Object.defineProperty(error, "code", { value: "unsupported" });
		}
		const loader = vi.spyOn(documentLoader, "loadBrowserDocument");
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			error,
		);
		const report = await researchNavigation(url);
		expect(report.failure).toEqual({ category, stage: "network" });
		expect(Object.hasOwn(report.failure as object, "networkPolicy")).toBe(
			false,
		);
		expect(report.outcome).toBe("failure");
		expect(report.partial).toBe(true);
		expect(report.contentSuccess).toBe(false);
		expect(report.primaryResponse).toBeNull();
		expect(report.extraction).toBeUndefined();
		expect(report.metrics).toMatchObject({ active: 0, closed: true });
		expect(loader).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		expect(reads).toBe(0);
		expect(networkPolicyDiagnostic(genuine)).toBe(diagnostic);
		expect(JSON.stringify(report)).not.toContain(policyPrivate);
	},
);

it("keeps a confirmed synthetic challenge unbranded and stops before loading", async () => {
	const loader = vi.spyOn(documentLoader, "loadBrowserDocument");
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 403,
		headers: { "cf-mitigated": ["challenge"] },
		body: new Uint8Array(),
		encodedBytes: 0,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(url);
	expect(report.outcome).toBe("semantic-barrier");
	expect(report.failure).toEqual({
		category: "policy-denied",
		stage: "semantic-barrier",
	});
	expect(report.classification.barrier).toBe("challenge");
	expect(report.classification.diagnostic).toMatchObject({
		confidence: "confirmed",
		action: "stop-and-request-user-handoff",
	});
	expect(report.contentSuccess).toBe(false);
	expect(report.partial).toBe(true);
	expect(report.extraction).toBeUndefined();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(loader).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
});
