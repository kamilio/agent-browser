import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as captures from "../scripts/research-body-capture.js";
import * as sourceInput from "../scripts/research-source-input.js";
import { researchJsonContent } from "../scripts/research-json-content.js";
import { researchLongContent } from "../scripts/research-long-content.js";
import * as replay from "../scripts/research-json-replay.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://service-content.fixture.invalid/article";
const source =
	'<html><head><title>Unavailable</title><script id="data" type="application/json">{"value":"Not recovered during backoff"}</script></head><body><main><h1>Service response</h1><p>Do not recover this source as successful content.</p></main></body></html>';
const workflows = ["json", "long"] as const;
let attempts = 0;

beforeEach(() => {
	attempts = 0;
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-09-17T04:00:00.000Z"));
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			attempts,
		);
	} finally {
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

function serve(status: number, headers: Record<string, string[]>) {
	attempts++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		function (this: NodeNetworkTransport, input) {
			return this.requestWithRoutes(input, () => ({
				url,
				status,
				headers: { "content-type": ["text/html; charset=utf-8"], ...headers },
				body: new TextEncoder().encode(source),
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			}));
		},
	);
}

async function run(workflow: (typeof workflows)[number]) {
	return workflow === "json"
		? researchJsonContent([
				"--script-id",
				"data",
				"--json-pointer",
				"/value",
				url,
			])
		: researchLongContent([url]);
}

it.each(
	workflows.flatMap((workflow) =>
		["120", "0", "Thu, 17 Sep 2026 04:02:00 GMT"].map((advice) => ({
			workflow,
			advice,
		})),
	),
)(
	"retains $workflow service advice without source recovery: $advice",
	async ({ workflow, advice }) => {
		serve(503, { "retry-after": [advice] });
		const decode = vi.spyOn(captures, "decodeResearchBodyCapture");
		const admit = vi.spyOn(sourceInput, "admitResearchHtmlSource");
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		const result = await run(workflow);
		expect(result.contentSuccess).toBe(false);
		expect(result.failure).toMatchObject({
			category: "policy-denied",
			stage: "capture",
		});
		expect(result.capture).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			primaryResponse: { status: 503 },
			failure: { category: "policy-denied", stage: "service-backoff" },
			serviceBackoff: {
				kind: "http-service-backoff",
				status: 503,
				url,
				receivedAt: "2026-09-17T04:00:00.000Z",
				action: "stop-without-retry",
				retryAfter: { delaySeconds: advice === "0" ? 0 : 120 },
			},
			metrics: { active: 0, closed: true, requests: 1 },
			receiptDisposition: "complete",
		});
		expect(result.capture.rateLimit).toBeUndefined();
		expect(decode).not.toHaveBeenCalled();
		expect(admit).not.toHaveBeenCalled();
		expect(extract).not.toHaveBeenCalled();
	},
);

it.each(workflows)(
	"keeps header challenge precedence in %s capture",
	async (workflow) => {
		serve(503, { "retry-after": ["60"], "cf-mitigated": ["challenge"] });
		const result = await run(workflow);
		expect(result.contentSuccess).toBe(false);
		expect(result.capture).toMatchObject({
			outcome: "semantic-barrier",
			serviceBackoff: { status: 503, retryAfter: { delaySeconds: 60 } },
			classification: { barrier: "challenge" },
			failure: { stage: "semantic-barrier" },
			metrics: { active: 0, closed: true, requests: 1 },
		});
	},
);

it.each(
	workflows.flatMap((workflow) =>
		[200, 429, 503].map((status) => ({ workflow, status })),
	),
)(
	"does not fabricate service advice in $workflow status $status",
	async ({ workflow, status }) => {
		serve(status, { "retry-after": ["malformed"] });
		const result = await run(workflow);
		expect(result.capture.serviceBackoff).toBeUndefined();
		expect(result.capture.metrics).toMatchObject({
			active: 0,
			closed: true,
			requests: 1,
		});
		if (status === 200) {
			expect(result.contentSuccess).toBeNull();
			expect(result.failure).toBeUndefined();
		} else {
			expect(result.contentSuccess).toBe(false);
		}
		if (status === 429)
			expect(result.capture.rateLimit).toMatchObject({ status: 429 });
	},
);
