import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
	summarizePrimaryResponse,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { AgentBrowserError } from "./errors.js";
import type { HttpsRedirectPolicy } from "./https-redirect-policy.js";
import type { NetworkResponse } from "./network.js";
import * as transportModule from "./node-transport.js";
import type { NodeTransportOptions } from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import { researchReaderProfile } from "./research-reader-info.js";
import * as sessionModule from "./session.js";

const NativeTransport = transportModule.NodeNetworkTransport;
const BrowserSession = sessionModule.BrowserSession;
const nativeMetrics = NativeTransport.prototype.metrics;
const origin = "https://https-upgrade.fixture.invalid";
const url = `${origin}/article`;
const policy: HttpsRedirectPolicy = "same-origin-upgrade-v1";
const flags = ["--https-redirect-policy", policy];
const body = new TextEncoder().encode(
	"<title>Owned article</title><main><h1>Owned heading</h1><p>Owned answer.</p></main>",
);
const constructions: NodeTransportOptions[] = [];
const transports: InstanceType<typeof NativeTransport>[] = [];
const starts: { url: string; time: number }[] = [];
const pending: Promise<unknown>[] = [];
const batches: {
	controller: AbortController;
	iterator: AsyncGenerator<ResearchNavigationReport>;
}[] = [];
let redirects: NetworkResponse["redirects"] = [];
let receivedUpgrades: number | undefined;

function response(responseUrl = url): NetworkResponse {
	return {
		url: responseUrl,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects,
		elapsedMs: 0,
	};
}

function mixedRedirects(): NetworkResponse["redirects"] {
	return Object.freeze([
		Object.freeze({
			url: "https://source:source-password@https-upgrade.fixture.invalid/start?source-secret#source-fragment",
			status: 302,
			location:
				"https://effective:effective-password@https-upgrade.fixture.invalid/step?effective-secret#effective-fragment",
			httpsUpgrade: Object.freeze({
				policy,
				originalLocation:
					"http://original:original-password@https-upgrade.fixture.invalid/step?original-secret#original-fragment",
			}),
		}),
		Object.freeze({
			url: `${origin}/step`,
			status: 301,
			location: `${origin}/middle`,
		}),
		Object.freeze({
			url: `${origin}/middle?second-source-secret#second-source-fragment`,
			status: 307,
			location: `${url}?second-effective-secret#second-effective-fragment`,
			httpsUpgrade: Object.freeze({
				policy,
				originalLocation:
					"http://https-upgrade.fixture.invalid/article?second-original-secret#second-original-fragment",
			}),
		}),
	]);
}

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function batch(args: readonly string[]) {
	const controller = new AbortController();
	const iterator = researchBatch(args, controller.signal);
	batches.push({ controller, iterator });
	return { next: () => track(iterator.next()) };
}

function navigate(
	reader: boolean,
	options: ResearchExecutionOptions = {},
	captureBody = false,
) {
	return researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		captureBody,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		options,
	);
}

function expectNoEffects() {
	expect(constructions).toEqual([]);
	expect(transportModule.NodeNetworkTransport).not.toHaveBeenCalled();
	expect(sessionModule.BrowserSession).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NativeTransport.prototype.request).not.toHaveBeenCalled();
	expect(NativeTransport.prototype.close).not.toHaveBeenCalled();
	expect(OriginRequestPacer.prototype.wait).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
}

function constructTransport(options: NodeTransportOptions = {}) {
	const transport = new NativeTransport(options);
	constructions.push(options);
	transports.push(transport);
	return transport;
}

function constructSession(
	...args: ConstructorParameters<typeof BrowserSession>
) {
	return new BrowserSession(...args);
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	redirects = [];
	receivedUpgrades = undefined;
	constructions.length = 0;
	starts.length = 0;
	vi.spyOn(transportModule, "NodeNetworkTransport").mockImplementation(
		constructTransport,
	);
	vi.spyOn(sessionModule, "BrowserSession").mockImplementation(
		constructSession,
	);
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(NativeTransport.prototype, "close");
	vi.spyOn(OriginRequestPacer.prototype, "wait");
	vi.spyOn(OriginRequestPacer.prototype, "close");
	vi.spyOn(NativeTransport.prototype, "request").mockImplementation(
		async (request) => {
			starts.push({ url: request.url, time: performance.now() });
			return response(request.url);
		},
	);
	vi.spyOn(NativeTransport.prototype, "metrics").mockImplementation(function (
		this: InstanceType<typeof NativeTransport>,
	) {
		const metrics = nativeMetrics.call(this);
		return receivedUpgrades === undefined
			? metrics
			: Object.freeze({ ...metrics, httpsRedirectUpgrades: receivedUpgrades });
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("HTTPS redirect CLI fixtures must not fetch");
		}),
	);
});

afterEach(async () => {
	try {
		for (const entry of batches.splice(0)) {
			entry.controller.abort();
			track(entry.iterator.return(undefined));
		}
		await vi.runAllTimersAsync();
		await Promise.allSettled(pending.splice(0));
		for (const transport of transports.splice(0)) transport.close();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}
});

it("accepts only the explicit flag while preserving the default parser shape", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	for (const reader of [false, true]) {
		const mode = reader ? ["--reader"] : [];
		for (const args of [
			[...mode, ...flags, url],
			[url, ...mode, ...flags],
		])
			expect(parseResearchArguments(args)).toEqual({
				reader,
				urls: [url],
				httpsRedirectPolicy: policy,
			});
	}
	expectNoEffects();
});

it("rejects missing, duplicate, aliased and invalid CLI policies before batch effects", async () => {
	for (const args of [
		[url, "--https-redirect-policy"],
		[...flags, url, ...flags],
		["--https-redirect-policy", "--reader", url],
		["--https-redirect-policy=same-origin-upgrade-v1", url],
		["--https-upgrade", url],
		...[
			"",
			"same-origin",
			"SAME-ORIGIN-UPGRADE-V1",
			` ${policy}`,
			`${policy}\n`,
			null,
		].map((value) => ["--https-redirect-policy", value as string, url]),
	]) {
		expect(() => parseResearchArguments(args)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		await expect(
			batch(["--min-request-interval-ms", "100", ...args]).next(),
		).rejects.toMatchObject({ code: "invalid-input" });
	}
	expectNoEffects();
});

it("rejects noncanonical API values before constructing sessions or transports", async () => {
	for (const value of [
		null,
		false,
		1,
		"",
		"same-origin",
		`${policy} `,
		{},
		[policy],
	]) {
		await expect(
			navigate(true, {
				httpsRedirectPolicy: value as HttpsRedirectPolicy,
				minRequestIntervalMs: 100,
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
	}
	await expect(
		navigate(false, {
			httpsRedirectPolicy: null as unknown as HttpsRedirectPolicy,
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expectNoEffects();
});

it.each([false, true])(
	"propagates the policy to transport and receipt with reader=%s",
	async (reader) => {
		const report = await navigate(reader, { httpsRedirectPolicy: policy });
		expect(constructions).toHaveLength(1);
		expect(constructions[0]).toMatchObject({ httpsRedirectPolicy: policy });
		expect(report).toMatchObject({
			httpsRedirectPolicy: policy,
			profile: reader ? researchReaderProfile : "native",
			outcome: "extracted-unverified",
			metrics: { httpsRedirectUpgrades: 0, active: 0, closed: true },
		});
		expect(report.primaryResponse).not.toHaveProperty("httpsRedirectUpgrades");
		expect(NativeTransport.prototype.request).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	},
);

it.each([false, true])(
	"keeps omitted and undefined policy fields absent with reader=%s",
	async (reader) => {
		for (const options of [{}, { httpsRedirectPolicy: undefined }]) {
			const report = await navigate(reader, options);
			expect(report.outcome).toBe("extracted-unverified");
			expect(Object.hasOwn(report, "httpsRedirectPolicy")).toBe(false);
			expect(
				Object.hasOwn(constructions.at(-1) ?? {}, "httpsRedirectPolicy"),
			).toBe(false);
			expect(report.metrics).not.toHaveProperty("httpsRedirectUpgrades");
			expect(report.primaryResponse).not.toHaveProperty(
				"httpsRedirectUpgrades",
			);
		}
	},
);

it("sanitizes ordered upgrade provenance without mutating mixed frozen redirects", () => {
	redirects = mixedRedirects();
	const input = Object.freeze(response());
	const original = structuredClone(input);
	const summary = summarizePrimaryResponse(input);
	expect(summary.redirects).toBe(3);
	expect(summary.httpsRedirectUpgrades).toEqual([
		{
			policy,
			fromUrl: `${origin}/start?redacted`,
			originalLocation: "http://https-upgrade.fixture.invalid/step?redacted",
			effectiveLocation: `${origin}/step?redacted`,
		},
		{
			policy,
			fromUrl: `${origin}/middle?redacted`,
			originalLocation: "http://https-upgrade.fixture.invalid/article?redacted",
			effectiveLocation: `${url}?redacted`,
		},
	]);
	expect(input).toEqual(original);
	expect(JSON.stringify(summary)).not.toMatch(/password|secret|fragment/);
	redirects = [redirects[1]];
	expect(summarizePrimaryResponse(response())).not.toHaveProperty(
		"httpsRedirectUpgrades",
	);
});

it("applies the existing URL bound to every upgrade provenance URL", () => {
	const path = "x".repeat(researchRunLimits.maxUrlCodeUnits + 100);
	const https = `https://user:password@https-upgrade.fixture.invalid/${path}?secret#fragment`;
	redirects = [
		{
			url: https,
			status: 302,
			location: https,
			httpsUpgrade: {
				policy,
				originalLocation: https.replace("https:", "http:"),
			},
		},
	];
	const summary = summarizePrimaryResponse(response());
	const upgrade = summary.httpsRedirectUpgrades?.[0];
	expect(upgrade?.policy).toBe(policy);
	for (const value of [
		upgrade?.fromUrl,
		upgrade?.originalLocation,
		upgrade?.effectiveLocation,
	]) {
		expect(value).toHaveLength(researchRunLimits.maxUrlCodeUnits);
		expect(value).not.toMatch(/user|password|secret|fragment/);
	}
});

it("retains received metrics rather than deriving them from summarized upgrades", async () => {
	redirects = mixedRedirects();
	receivedUpgrades = 7;
	const report = await navigate(false, { httpsRedirectPolicy: policy });
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.primaryResponse?.httpsRedirectUpgrades).toHaveLength(2);
	expect(report.metrics).toMatchObject({
		httpsRedirectUpgrades: 7,
		closed: true,
	});
	expect(Object.isFrozen(report.metrics)).toBe(true);
});

it("forwards policy and pacing to every batch navigation without skipping waits", async () => {
	const secondUrl = `${origin}/second`;
	const iterator = batch([
		"--reader",
		...flags,
		"--min-request-interval-ms",
		"100",
		url,
		secondUrl,
	]);
	const first = await iterator.next();
	expect(first).toMatchObject({
		done: false,
		value: { httpsRedirectPolicy: policy, outcome: "extracted-unverified" },
	});
	const secondPending = iterator.next();
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	const second = await secondPending;
	expect(second).toMatchObject({
		done: false,
		value: { httpsRedirectPolicy: policy, outcome: "extracted-unverified" },
	});
	expect(starts.map((start) => start.url)).toEqual([url, secondUrl]);
	expect(starts[1].time - starts[0].time).toBe(100);
	expect(constructions).toHaveLength(2);
	for (const options of constructions)
		expect(options).toMatchObject({
			httpsRedirectPolicy: policy,
			minRequestIntervalMs: 100,
		});
	expect(await iterator.next()).toMatchObject({ done: true });
	expect(OriginRequestPacer.prototype.close).toHaveBeenCalled();
	expect(transports.every((transport) => transport.metrics().closed)).toBe(
		true,
	);
	expect(vi.getTimerCount()).toBe(0);
});

it("retains requested policy and metrics while closing a failed navigation", async () => {
	receivedUpgrades = 1;
	vi.mocked(NativeTransport.prototype.request).mockRejectedValueOnce(
		new AgentBrowserError("policy-denied", "Owned redirect failure"),
	);
	const report = await navigate(true, {
		httpsRedirectPolicy: policy,
		minRequestIntervalMs: 100,
	});
	expect(report).toMatchObject({
		httpsRedirectPolicy: policy,
		outcome: "failure",
		primaryResponse: null,
		failure: { category: "policy-denied", stage: "network" },
		metrics: { httpsRedirectUpgrades: 1, active: 0, closed: true },
	});
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NativeTransport.prototype.close).toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("serializes upgraded and legacy captures for offline fixture replay", async () => {
	for (const enabled of [false, true]) {
		redirects = enabled ? mixedRedirects() : [];
		const report = await navigate(
			true,
			enabled ? { httpsRedirectPolicy: policy } : {},
			true,
		);
		const emission = serializeResearchReport(report);
		expect(emission.disposition).toBe("complete");
		const receipt = JSON.parse(new TextDecoder().decode(emission.jsonl));
		if (enabled) {
			expect(receipt.httpsRedirectPolicy).toBe(policy);
			expect(receipt.primaryResponse.httpsRedirectUpgrades).toEqual(
				report.primaryResponse?.httpsRedirectUpgrades,
			);
		} else {
			expect(receipt).not.toHaveProperty("httpsRedirectPolicy");
			expect(receipt.primaryResponse).not.toHaveProperty(
				"httpsRedirectUpgrades",
			);
		}
		const requestsBeforeReplay = starts.length;
		const replay = extractResearchReplayJson(
			emission.jsonl,
			{
				expectedProfile: "default",
				expectedReceiptSha256: createHash("sha256")
					.update(emission.jsonl)
					.digest("hex"),
				expectedBody: {
					bytes: body.byteLength,
					sha256: createHash("sha256").update(body).digest("hex"),
				},
			},
			{ selector: "main" },
		);
		expect(replay.report.networkRequests).toBe(0);
		expect(replay.jsonl).toContain("Owned answer.");
		expect(starts).toHaveLength(requestsBeforeReplay);
	}
});
