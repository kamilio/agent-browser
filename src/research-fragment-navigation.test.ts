import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	validateResearchReplayAdmission as admitResearchReplay,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	parseResearchArguments,
	researchNavigation,
	type ResearchNavigationReport,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import { type NetworkRequest, type NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const resource = "https://fragment.fixture.invalid/article";
const markup =
	'<!doctype html><title>Public article</title><h1>Overview</h1><p>Introduction.</p><h2 id="topic">Topic one</h2><p>First section content.</p><h2 id="other">Topic two</h2><p>Second section content.</p>';
const sessions: BrowserSession[] = [];
const requests: NetworkRequest[] = [];
let html = markup;
let finalUrl: string | undefined;
let status = 200;
const hash = (value: string | Uint8Array) =>
	createHash("sha256").update(value).digest("hex");

beforeEach(() => {
	html = markup;
	finalUrl = undefined;
	status = 200;
	const createTab = BrowserSession.prototype.createTab;
	vi.spyOn(BrowserSession.prototype, "createTab").mockImplementation(function (
		this: BrowserSession,
		...args
	) {
		sessions.push(this);
		return createTab.apply(this, args);
	});
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		async (input) => {
			requests.push(input);
			const body = new TextEncoder().encode(html);
			return {
				url: finalUrl ?? input.url,
				status,
				headers: { "content-type": ["text/html; charset=utf-8"] },
				body,
				encodedBytes: body.byteLength,
				elapsedMs: 1,
				redirects:
					finalUrl === undefined
						? []
						: [{ url: input.url, status: 302, location: finalUrl }],
			} satisfies NetworkResponse;
		},
	);
});

afterEach(() => {
	for (const session of sessions.splice(0)) {
		expect(session.metrics().closed).toBe(true);
		session.close();
	}
	for (const request of requests.splice(0)) {
		expect(request.cookieContext?.credentials).toBe("omit");
		expect(request.body).toBeUndefined();
		expect(
			Object.keys(request.headers ?? {}).some((name) =>
				/^(cookie|authorization|proxy-authorization)$/i.test(name),
			),
		).toBe(false);
	}
	vi.restoreAllMocks();
});

function navigate(
	url: string,
	profile?: "long-v1",
	selector?: string,
	section?: string,
	reader = true,
) {
	return researchNavigation(
		url,
		reader,
		undefined,
		selector,
		true,
		undefined,
		section,
		profile === "long-v1",
		undefined,
		profile,
	);
}

it.each([undefined, "long-v1"] as const)(
	"admits discovered fragment links under %s without relaxing the selected profile",
	(profile) => {
		const flags = profile
			? [
					"--document-profile",
					profile,
					"--reader",
					"--capture-body",
					"--headings",
				]
			: [];
		expect(
			parseResearchArguments([...flags, resource + "#topic"]).urls,
		).toEqual([resource + "#topic"]);
		expect(parseResearchArguments([...flags, resource + "#"]).urls).toEqual([
			resource + "#",
		]);
		expect(requests).toEqual([]);
	},
);

it.each([false, true])(
	"uses the existing native target with reader=%s without restricting default document extraction",
	async (reader) => {
		const report = await navigate(
			resource + "#topic",
			undefined,
			undefined,
			undefined,
			reader,
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.fragment).toMatchObject({
			schemaVersion: 1,
			requested: { codeUnits: 5, sha256: hash("topic") },
			effective: { codeUnits: 5, sha256: hash("topic") },
			resolution: "element",
			target: expect.stringMatching(/^e[1-9][0-9]*$/),
			semantics: "native-dom-target-no-scroll-or-script",
		});
		expect(report.requestedUrl).toBe(resource);
		expect(report.finalUrl).toBe(resource);
		expect(report.extraction?.content).toContain("Introduction");
		expect(report.extraction?.content).toContain("Second section content");
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toBe(resource + "#topic");
		expect(report.contentSuccess).toBeNull();
	},
);

it("supports explicit :target selection without interpolating a fragment into CSS", async () => {
	html = '<main><p id="weird: [x]">Selected body.</p><p>Other body.</p></main>';
	const report = await navigate(
		resource + "#weird:%20[x]",
		undefined,
		":target",
	);
	expect(report.fragment?.resolution).toBe("element");
	expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
	expect(report.extraction?.content).toContain("Selected body");
	expect(report.extraction?.content).not.toContain("Other body");
});

it("supports explicit heading-section extraction at :target", async () => {
	const report = await navigate(
		resource + "#topic",
		undefined,
		undefined,
		":target",
	);
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.selection).toEqual({ method: "heading-section", matches: 1 });
	expect(report.extraction?.content).toContain("First section content");
	expect(report.extraction?.content).not.toContain("Introduction");
	expect(report.extraction?.content).not.toContain("Second section content");
});

it.each([
	[
		'<p id="%74opic">Raw first.</p><p id="topic">Decoded second.</p>',
		"%74opic",
		"Raw first",
		"Decoded second",
	],
	[
		'<p id="café">Unicode body.</p><p>Other body.</p>',
		"caf%C3%A9",
		"Unicode body",
		"Other body",
	],
	[
		'<a name="legacy">Named anchor.</a><p>Other body.</p>',
		"legacy",
		"Named anchor",
		"Other body",
	],
	[
		'<p id="same">First duplicate.</p><p id="same">Second duplicate.</p>',
		"same",
		"First duplicate",
		"Second duplicate",
	],
	[
		'<p id="a+b">Literal plus.</p><p id="a b">Wrong space.</p>',
		"a+b",
		"Literal plus",
		"Wrong space",
	],
])(
	"keeps native fragment selection for %s",
	async (body, fragment, included, excluded) => {
		html = body;
		const report = await navigate(
			resource + "#" + fragment,
			undefined,
			":target",
		);
		expect(report.fragment?.resolution).toBe("element");
		expect(report.extraction?.content).toContain(included);
		expect(report.extraction?.content).not.toContain(excluded);
	},
);

it.each([undefined, "long-v1"] as const)(
	"redacts unknown private fragments and query strings in %s metadata",
	async (profile) => {
		const secret = "PRIVATE_FRAGMENT_SENTINEL";
		const report = await navigate(
			resource + "?TOKEN_QUERY_SENTINEL=private#" + secret,
			profile,
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.fragment).toMatchObject({
			requested: { sha256: hash(secret) },
			effective: { sha256: hash(secret) },
			resolution: "unmatched",
		});
		const emission = serializeResearchReport(report, profile);
		const serialized = new TextDecoder().decode(emission.jsonl);
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain("TOKEN_QUERY_SENTINEL");
		expect(serialized).toContain("?redacted");
		expect(requests).toHaveLength(1);
	},
);

it.each(["", "top", "TOP"])(
	"reports #%s as the document top without claiming scrolling",
	async (fragment) => {
		const report = await navigate(resource + "#" + fragment);
		expect(report.fragment?.resolution).toBe("document-top");
		expect(report.fragment).not.toHaveProperty("target");
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it("uses an actual top ID before the reserved top fallback", async () => {
	html = '<p id="top">A real target.</p>';
	const report = await navigate(resource + "#top");
	expect(report.fragment?.resolution).toBe("element");
});

it.each([":~:text=First", "topic:~:text=First"])(
	"keeps unsupported text directive #%s explicit",
	async (fragment) => {
		const report = await navigate(resource + "#" + fragment);
		expect(report.fragment?.resolution).toBe("unsupported-directive");
		expect(report.fragment).not.toHaveProperty("target");
		expect(report.contentSuccess).toBeNull();
		expect(requests).toHaveLength(1);
	},
);

it.each(["#other", "#", ""])(
	"describes the effective provided response fragment %s separately from the request",
	async (suffix) => {
		finalUrl = resource + "/redirected" + suffix;
		const report = await navigate(resource + "#topic");
		expect(report.fragment?.requested?.sha256).toBe(hash("topic"));
		expect(report.fragment?.resolution).toBe(
			suffix === "#other"
				? "element"
				: suffix === "#"
					? "document-top"
					: "absent",
		);
		expect(report.fragment?.effective).toEqual(
			suffix === ""
				? null
				: {
						codeUnits: suffix.length - 1,
						sha256: hash(suffix.slice(1)),
						digestEncoding: "utf8-serialized-fragment",
					},
		);
		expect(report.finalUrl).toBe(resource + "/redirected");
	},
);

it("reports a fragment introduced by a provided final response URL", async () => {
	finalUrl = resource + "#other";
	const report = await navigate(resource);
	expect(report.fragment).toMatchObject({
		requested: null,
		effective: { sha256: hash("other") },
		resolution: "element",
	});
});

it("leaves ordinary fragmentless report shapes unchanged", async () => {
	const report = await navigate(resource);
	expect(Object.hasOwn(report, "fragment")).toBe(false);
});

it("retains pending identity on network failure without reflecting private errors", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
		new AgentBrowserError("network-error", "PRIVATE_FRAGMENT_FAILURE"),
	);
	const report = await navigate(resource + "#SECRET_TARGET");
	expect(report.fragment?.resolution).toBe("pending");
	expect(report.fragment).not.toHaveProperty("effective");
	expect(report.outcome).toBe("failure");
	expect(JSON.stringify(report)).not.toMatch(
		/SECRET_TARGET|PRIVATE_FRAGMENT_FAILURE/,
	);
});

it("does not resolve or retry a rate-limited response", async () => {
	status = 429;
	const report = await navigate(resource + "#topic");
	expect(report.rateLimit?.action).toBe("stop-without-retry");
	expect(report.fragment?.resolution).toBe("pending");
	expect(requests).toHaveLength(1);
});

for (const reader of [false, true])
	for (const responseStatus of [200, 403])
		it(`cannot use :target to bypass a challenge with reader=${reader}, HTTP ${responseStatus}`, async () => {
			status = responseStatus;
			html =
				'<title>Client Challenge</title><h1 id="topic">Blocked target</h1><p>JavaScript is disabled in your browser. Please enable JavaScript to proceed.</p>';
			const report = await navigate(
				resource + "#topic",
				undefined,
				":target",
				undefined,
				reader,
			);
			expect(report.outcome).toBe("semantic-barrier");
			expect(report.classification.barrier).toBe("challenge");
			expect(report.classification.diagnostic?.action).toBe(
				"stop-and-request-user-handoff",
			);
			expect(report.fragment?.resolution).toBe("pending");
			expect(report.extraction).toBeUndefined();
			expect(report.headings).toBeUndefined();
			expect(requests).toHaveLength(1);
		});

it.each([undefined, "long-v1"] as const)(
	"preserves fragment provenance in %s captured-evidence replay",
	async (profile) => {
		const report = await navigate(resource + "#topic", profile);
		const emission = serializeResearchReport(report, profile);
		const capture = report.bodyCapture;
		if (!capture) throw new Error("Missing captured fixture");
		const replay = admitResearchReplay(emission.jsonl, {
			expectedProfile: profile ?? "default",
			expectedReceiptSha256: hash(emission.jsonl),
			expectedBody: { bytes: capture.decodedBytes, sha256: capture.sha256 },
		});
		expect(replay.kind).toBe("validated-capture");
		expect(replay.originalMetadata.fragment).toEqual(report.fragment);
		expect(replay.originalFieldPresence.fragment).toBe(true);
	},
);

it("retains fragment identity in the bounded long-output failure projection", async () => {
	const report = await navigate(resource + "#topic", "long-v1");
	const emission = serializeResearchReport(
		{
			...report,
			arbitraryMetadata: "x".repeat(70000),
		} as ResearchNavigationReport,
		"long-v1",
	);
	expect(emission.disposition).toBe("output-limit");
	expect(emission.record.fragment).toEqual(report.fragment);
	expect(emission.record.outcome).toBe("failure");
});

it.each([undefined, "long-v1"] as const)(
	"rejects forged raw fragment metadata under %s",
	async (profile) => {
		const report = await navigate(resource + "#topic", profile);
		for (const patch of [
			{ raw: "PRIVATE_FRAGMENT_VALUE" },
			{ target: "PRIVATE_FRAGMENT_VALUE" },
			{ resolution: "scrolled" },
			{ effective: null },
			{
				requested: {
					codeUnits: 1,
					sha256: "bad",
					digestEncoding: "utf8-serialized-fragment",
				},
			},
		]) {
			const altered = {
				...report,
				fragment: { ...report.fragment, ...patch },
			} as ResearchNavigationReport;
			expect(() => serializeResearchReport(altered, profile)).toThrow(
				"Invalid research",
			);
			const bytes = new TextEncoder().encode(JSON.stringify(altered) + "\n");
			expect(() =>
				admitResearchReplay(bytes, {
					expectedProfile: profile ?? "default",
					expectedReceiptSha256: hash(bytes),
				}),
			).toThrow("Invalid research");
		}
	},
);

it("does not call fragment getters during default serialization", async () => {
	const report = await navigate(resource + "#topic");
	let calls = 0;
	Object.defineProperty(report, "fragment", {
		get() {
			calls++;
			throw new Error("PRIVATE_FRAGMENT_GETTER");
		},
	});
	expect(() => serializeResearchReport(report)).toThrow("Invalid research");
	expect(calls).toBe(0);
});

it.each([
	"https://user:secret@fragment.fixture.invalid/#topic",
	"http://127.0.0.1/#topic",
	"file:///tmp/a#topic",
	"javascript:alert(1)#topic",
])("retains scheme/credential/private-address admission for %s", (url) => {
	expect(() => parseResearchArguments([url])).toThrow();
	expect(requests).toEqual([]);
});
