import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	parseResearchArguments,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as nativeLoader from "./document-loader.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const url = "https://stream.fixture.invalid/article";
const policy = "native-streamed-content-v1";
const flags = ["--document-strategy", policy];
const segmentHelper =
	"$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};";
const source = `<title>Streamed fixture</title><main><template id="P:3"></template></main><div hidden id="S:3"><h1>Leaderboard</h1><p>Useful streamed content.</p><aside hidden>HIDDEN_SENTINEL</aside></div><script>${segmentHelper}$RS("S:3","P:3")</script><link rel="stylesheet" href="/remote.css"><script src="/application.js"></script>`;

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(nativeLoader, "loadBrowserDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function enqueue(html = source, overrides: Partial<NetworkResponse> = {}) {
	const body = new TextEncoder().encode(html);
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
	return body.byteLength;
}

function navigate(options: ResearchExecutionOptions = {}) {
	return researchNavigation(
		url,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		{ documentStrategy: policy, ...options },
	);
}

it("accepts explicit streamed content with main-content and prefix extraction", () => {
	expect(
		parseResearchArguments([
			...flags,
			"--content-focus",
			"main-content-v3",
			"--output-limit-policy",
			"text-prefix-v1",
			url,
		]),
	).toMatchObject({
		documentStrategy: policy,
		contentFocus: "main-content-v3",
		outputLimitPolicy: "text-prefix-v1",
	});
});

it.each([
	["--capture-body"],
	["--format", "json"],
	["--reader"],
	["--document-profile", "long-v1"],
	["--selector", "main"],
	["--headings"],
	["--prefer-markdown"],
	[url],
])("rejects incompatible streamed-content arguments %j before I/O", (extra) => {
	expect(() => parseResearchArguments([...flags, ...extra, url])).toThrow();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
});

it("extracts streamed HTML above the old four-megabyte cap without CSS or script execution", async () => {
	const bytes = enqueue(`${source}<!--${"x".repeat(4_100_000)}-->`);
	const report = await navigate({
		contentFocus: "main-content-v3",
		outputLimitPolicy: "text-prefix-v1",
	});
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.primaryResponse).toMatchObject({
		status: 200,
		decodedBytes: bytes,
	});
	expect(report.documentStrategy).toEqual({
		policy,
		mode: "native",
		streaming: {
			policy: "react-completion-source-v1",
			rendered: false,
			verified: false,
			boundaries: 0,
			segments: 1,
			unresolved: 0,
		},
	});
	expect(report.extraction?.content).toContain("Useful streamed content");
	expect(report.extraction?.content).not.toContain("HIDDEN_SENTINEL");
	expect(report.bodyCapture).toBeUndefined();
	expect(report.admission).toBeUndefined();
	expect(() => serializeResearchReport(report)).not.toThrow();
	expect(nativeLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
});

it("does not turn an access-denied response into projected content", async () => {
	enqueue(source, { status: 403 });
	const report = await navigate();
	expect(report.outcome).toBe("http-failure");
	expect(report.documentStrategy?.streaming).toBeUndefined();
	expect(report.extraction?.content ?? "").not.toContain(
		"Useful streamed content",
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
});

it("retains inert extraction for policies unsupported by the active CSS/script runtime", async () => {
	enqueue(source, {
		headers: {
			"content-type": ["text/html"],
			"content-security-policy": [
				"default-src 'self'; script-src 'nonce-fixture' 'strict-dynamic'; require-trusted-types-for 'script'",
			],
		},
	});
	const report = await navigate();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.extraction?.content).toContain("Useful streamed content");
	expect(nativeLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
});
