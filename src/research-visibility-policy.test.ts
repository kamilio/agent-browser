import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	extractResearchReplayJson,
	outlineResearchOutputLimitCapture,
	recoverResearchOutputLimitSelector,
} from "../scripts/research-json-replay.js";
import { runResearchReplayCli } from "../scripts/research-replay-cli.js";
import * as visibility from "../scripts/research-visibility.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import { findInDocument, renderSnapshotSearch } from "./snapshot-search.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";

const url = "https://visibility-policy.fixture.invalid/document";
const policy = "source-hidden-v1";
const flags = ["--reader-visibility-policy", policy];
const source =
	'<h1>Visible title</h1><main><p>Visible answer</p><h2 hidden>HIDDEN_SAMPLE</h2><a aria-hidden="true" href="/hidden">HIDDEN_LINK</a><p inert>Inert remains</p></main>';
const encoder = new TextEncoder();

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected synthetic fetch");
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
		policy?: ResearchReaderVisibilityPolicy;
		legacy?: boolean;
		raw?: boolean;
		mime?: string;
		status?: number;
		challenge?: boolean;
		selector?: string;
		section?: string;
		headings?: boolean;
	} = {},
) {
	const body = encoder.encode(html);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: options.status ?? 200,
		headers: {
			"content-type": [options.mime ?? "text/html; charset=utf-8"],
			...(options.challenge ? { "cf-mitigated": ["challenge"] } : {}),
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		true,
		undefined,
		options.selector,
		true,
		undefined,
		options.section,
		options.headings ?? profile === "long-v1",
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.legacy
				? {}
				: { readerVisibilityPolicy: options.policy ?? policy }),
			...(options.raw
				? { readerRawPolicy: "separate-omitted-raw-v1" as const }
				: {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(html));
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

type Fixture = Awaited<ReturnType<typeof fixture>>;

function revise(
	input: Fixture,
	mutate: (report: Record<string, unknown>) => void,
) {
	const report = structuredClone(input.report) as unknown as Record<
		string,
		unknown
	>;
	mutate(report);
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function replay(input: Fixture) {
	return extractResearchReplayJson(input.raw, input.trusted, {
		selector: "main",
	});
}

function replaceBody(input: Fixture, html: string) {
	const body = encoder.encode(html);
	const changed = revise(input, (report) => {
		report.bodyCapture = {
			encoding: "base64",
			decodedBytes: body.length,
			sha256: hash(body),
			data: Buffer.from(body).toString("base64"),
		};
		Object.assign(report.primaryResponse as object, {
			decodedBytes: body.length,
			encodedBytes: body.length,
			bodySha256: hash(body),
		});
		(report.navigation as { response: { bytes: number } }).response.bytes =
			body.length;
	});
	return {
		...changed,
		body,
		trusted: {
			...changed.trusted,
			expectedBody: { bytes: body.length, sha256: hash(body) },
		},
	};
}

const lateBarrier = (hidden: boolean) =>
	`<title hidden>Security check</title><aside>${"x".repeat(9000)}</aside><main><h1 id="target"${hidden ? " hidden" : ""}>Verify you are human</h1><a href="https://visibility-policy.fixture.invalid/next"${hidden ? " hidden" : ""}>Verify you are human</a><p>Visible answer</p></main>`;

it.each([
	{ method: "selector", selection: { selector: "main" } },
	{ method: "section", selection: { section: "#target" } },
	{ method: "outline", selection: { headings: true } },
])(
	"retains the default late $method barrier with visible and hidden markers",
	async ({ selection }) => {
		for (const hidden of [false, true]) {
			for (const legacy of [false, true]) {
				const input = await fixture(lateBarrier(hidden), {
					...selection,
					legacy,
				});
				expect(input.report.outcome).toBe("semantic-barrier");
				expect(input.report.classification.barrier).toBe("challenge");
			}
		}
	},
);

it.each([
	{ method: "selector", selection: { selector: "main" } },
	{ method: "section", selection: { section: "#target" } },
	{ method: "links", selection: { links: "fixture.invalid" } },
])("checks late unfiltered $method replay evidence", async ({ selection }) => {
	const original = await fixture();
	for (const hidden of [false, true]) {
		const forged = replaceBody(original, lateBarrier(hidden));
		const check = vi.spyOn(visibility, "researchVisibilityEvidence");
		expect(() =>
			extractResearchReplayJson(forged.raw, forged.trusted, selection),
		).toThrowError(expect.objectContaining({ code: "policy-denied" }));
		expect(check).toHaveBeenCalledOnce();
		check.mockRestore();
	}
});

it("checks late unfiltered outline evidence during output-limit recovery", async () => {
	const noise = `<aside>${"Large surrounding text. ".repeat(13_000)}</aside>`;
	const original = await fixture(source + noise);
	expect(original.report.failure?.resourceLimit?.kind).toBe(
		"extraction.output",
	);
	const forged = replaceBody(original, lateBarrier(true) + noise);
	const check = vi.spyOn(visibility, "researchVisibilityEvidence");
	expect(() =>
		outlineResearchOutputLimitCapture(forged.raw, forged.trusted),
	).toThrowError(expect.objectContaining({ code: "policy-denied" }));
	expect(check).toHaveBeenCalledOnce();
});

it("checks the filtered title as well as the retained original title", async () => {
	const input = await fixture(
		"<title hidden>Welcome</title><title>Security check</title><main><p>Verify you are human</p></main>",
	);
	expect(input.report.outcome).toBe("semantic-barrier");
	expect(input.report.classification.barrier).toBe("challenge");
});

it("leaves the visibility option absent by default", () => {
	expect(parseResearchArguments(["--reader", url])).not.toHaveProperty(
		"readerVisibilityPolicy",
	);
});

it.each(["default", "long-v1"] as const)(
	"parses the explicit policy with the %s profile",
	(profile) => {
		expect(
			parseResearchArguments([
				"--reader",
				...flags,
				"--document-profile",
				profile,
				...(profile === "long-v1" ? ["--capture-body", "--headings"] : []),
				url,
			]),
		).toMatchObject({ reader: true, readerVisibilityPolicy: policy });
	},
);

it.each(
	[
		[...flags, url],
		["--reader", "--reader-visibility-policy"],
		["--reader", "--reader-visibility-policy", "", url],
		["--reader", "--reader-visibility-policy", "unknown", url],
		["--reader", ...flags, ...flags, url],
		["--reader", "--reader-visibility-policy", " source-hidden-v1", url],
	].map((args) => ({ args })),
)("rejects invalid visibility CLI arguments $args", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each([null, false, 1, {}, [], "", "unknown"])(
	"rejects invalid API visibility %j before a request",
	async (value) => {
		await expect(
			researchNavigation(
				url,
				true,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				{
					readerVisibilityPolicy: value,
				} as unknown as ResearchExecutionOptions,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
	},
);

it("rejects a visibility policy without the reader before a request", async () => {
	await expect(
		researchNavigation(
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
			{ readerVisibilityPolicy: policy },
		),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it.each(["default", "long-v1"] as const)(
	"replays %s visibility deterministically with unchanged source bytes",
	async (profile) => {
		const input = await fixture(source, { profile });
		expect(input.report.readerVisibilityPolicy).toBe(policy);
		expect(input.report.reader).toMatchObject({
			visibilityPolicy: policy,
			hiddenContentSemantics: "source-attributes",
			sourceHiddenSubtrees: 2,
		});
		const load = vi.spyOn(loader, "loadResearchDocument");
		const result = replay(input);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report.networkRequests).toBe(0);
		expect(result.jsonl).toContain("Visible answer");
		expect(result.jsonl).toContain("Inert remains");
		expect(result.jsonl).not.toContain("HIDDEN_SAMPLE");
		expect(result.jsonl).not.toContain("HIDDEN_LINK");
		expect(load).toHaveBeenCalledTimes(2);
		expect(load.mock.calls[1]).toHaveLength(5);
		expect(load.mock.calls[1].slice(2)).toEqual([profile, undefined, policy]);
		expect(hash(input.body)).toBe(input.trusted.expectedBody?.sha256);
		expect(hash(input.raw)).toBe(input.trusted.expectedReceiptSha256);
	},
);

it("keeps legacy replay behavior and loader arity unchanged", async () => {
	const input = await fixture(source, { legacy: true });
	const load = vi.spyOn(loader, "loadResearchDocument");
	const result = replay(input);
	expect(result.jsonl).toContain("HIDDEN_SAMPLE");
	expect(result.report.reader?.hiddenContentSemantics).toBe(false);
	expect(result.report.reader).not.toHaveProperty("visibilityPolicy");
	expect(load.mock.calls[0]).toHaveLength(3);
});

it("combines raw and visibility policies without changing source capture", async () => {
	const input = await fixture(`${source}<script>OMITTED_SCRIPT</script>`, {
		raw: true,
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	const result = replay(input);
	expect(result.report.reader).toMatchObject({
		rawTextPolicy: "separate-omitted-raw-v1",
		visibilityPolicy: policy,
		omittedRaw: { elements: 1 },
	});
	expect(load.mock.calls.at(-1)?.slice(3)).toEqual([
		"separate-omitted-raw-v1",
		policy,
	]);
});

it.each(["top", "reader"])(
	"accepts a valid %s-only declaration without losing semantics",
	async (declaration) => {
		const input = revise(await fixture(), (report) => {
			if (declaration === "top")
				Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
			else Reflect.deleteProperty(report, "readerVisibilityPolicy");
		});
		expect(replay(input).report.reader?.visibilityPolicy).toBe(policy);
	},
);

it.each([null, false, 1, {}, [], "", "unknown"])(
	"rejects conflicting or invalid replay policy %j",
	async (value) => {
		const input = revise(await fixture(), (report) => {
			report.readerVisibilityPolicy = value;
		});
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([false, true, null, "all", undefined])(
	"rejects contradictory HTML visibility semantics %j",
	async (value) => {
		const input = revise(await fixture(), (report) => {
			(report.reader as Record<string, unknown>).hiddenContentSemantics = value;
		});
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([-1, 0.5, null, "2", undefined])(
	"rejects invalid source-hidden subtree accounting %j",
	async (value) => {
		const input = revise(await fixture(), (report) => {
			(report.reader as Record<string, unknown>).sourceHiddenSubtrees = value;
		});
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it("rejects stripped declarations rather than silently changing replay content", async () => {
	const input = revise(await fixture(), (report) => {
		Reflect.deleteProperty(report, "readerVisibilityPolicy");
		Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
	});
	expect(() => replay(input)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("retains literal Markdown source and reports no HTML filtering", async () => {
	const input = await fixture("# Source\n<div hidden>HIDDEN_SAMPLE</div>\n", {
		mime: "text/markdown; charset=utf-8",
	});
	expect(input.report.extraction?.content).toContain("HIDDEN_SAMPLE");
	expect(input.report.reader).toMatchObject({
		visibilityPolicy: policy,
		hiddenContentSemantics: false,
		sourceHiddenSubtrees: 0,
	});
	const result = extractResearchReplayJson(input.raw, input.trusted, {
		lines: { start: 1, end: 2 },
	});
	expect(result.jsonl).toContain("HIDDEN_SAMPLE");
	expect(result.report.reader).toEqual(input.report.reader);
});

it("preserves output-limit admission and explicit bounded selector recovery", async () => {
	const input = await fixture(
		`${source}<aside><p>${"Large surrounding text. ".repeat(13_000)}</p></aside>`,
	);
	expect(input.report.outcome).toBe("failure");
	expect(input.report.failure?.resourceLimit?.kind).toBe("extraction.output");
	expect(() => replay(input)).toThrowError(
		expect.objectContaining({ code: "policy-denied" }),
	);
	const result = recoverResearchOutputLimitSelector(input.raw, input.trusted, {
		selector: "main",
	});
	expect(result.report.reader?.visibilityPolicy).toBe(policy);
	expect(result.report.networkRequests).toBe(0);
	expect(result.jsonl).toContain("Visible answer");
	expect(result.jsonl).not.toContain("HIDDEN_SAMPLE");
});

it("does not convert an all-hidden source into content success", async () => {
	const input = await fixture("<main hidden><p>HIDDEN_SAMPLE</p></main>");
	expect(input.report.outcome).toBe("empty-extraction");
	expect(input.report.contentSuccess).not.toBe(true);
	expect(input.report.extraction?.content).toBe("");
});

it("renders truthful source-hidden notices for snapshots and search", () => {
	const body = encoder.encode(source);
	const tree = loader.loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html"] },
			body,
			encodedBytes: body.byteLength,
			elapsedMs: 0,
			redirects: [],
		},
		{
			tabId: "visibility-snapshot",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 1000,
				maxDepth: 128,
				maxTextCodeUnits: 10000,
				maxChanges: 1024,
			},
		},
		"default",
		undefined,
		policy,
	);
	try {
		const snapshot = renderSnapshot(snapshotDocument(tree));
		const search = renderSnapshotSearch(findInDocument(tree, "Visible"));
		for (const text of [snapshot, search]) {
			expect(text).toContain("source-hidden");
			expect(text).not.toContain("hidden-content semantics ignored");
			expect(text).not.toContain("HIDDEN_SAMPLE");
		}
	} finally {
		tree.close();
	}
});

it("retains challenge admission rather than filtering away a barrier", async () => {
	const input = await fixture(source, { status: 403, challenge: true });
	expect(input.report.outcome).toBe("semantic-barrier");
	expect(input.report.contentSuccess).toBe(false);
	expect(input.report.readerVisibilityPolicy).toBe(policy);
	expect(() => replay(input)).toThrowError(
		expect.objectContaining({ code: "policy-denied" }),
	);
});

it.each([
	{
		kind: "challenge",
		html: "<title hidden>Security check</title><main><p>Verify you are human</p></main>",
	},
	{
		kind: "challenge",
		html: "<title>Security check</title><main><p hidden>Verify you are human</p><p>Visible answer</p></main>",
	},
	{
		kind: "login",
		html: '<title hidden>Sign in</title><main><p aria-hidden="true">Sign in to continue</p><p>Visible answer</p></main>',
	},
	{
		kind: "challenge",
		html: `<title hidden>Security check</title><main><p>${" ".repeat(9000)}Verify you are human</p></main>`,
	},
])(
	"keeps headerless $kind evidence before source filtering",
	async ({ kind, html }) => {
		const input = await fixture(html);
		expect(input.report.outcome).toBe("semantic-barrier");
		expect(input.report.classification.barrier).toBe(kind);
		expect(input.report.contentSuccess).toBe(false);
		expect(input.report.extraction).toBeUndefined();
		expect(input.report.reader).toBeUndefined();
	},
);

it("checks unfiltered replay source even when a receipt claims no barrier", async () => {
	const initial = await fixture();
	const body = encoder.encode(
		"<title hidden>Security check</title><main><p>Verify you are human</p></main>",
	);
	const input = revise(initial, (report) => {
		report.bodyCapture = {
			encoding: "base64",
			decodedBytes: body.length,
			sha256: hash(body),
			data: Buffer.from(body).toString("base64"),
		};
		Object.assign(report.primaryResponse as object, {
			decodedBytes: body.length,
			encodedBytes: body.length,
			bodySha256: hash(body),
		});
		const navigation = report.navigation as { response: { bytes: number } };
		navigation.response.bytes = body.length;
	});
	const forged = {
		...input,
		trusted: {
			...input.trusted,
			expectedBody: { bytes: body.length, sha256: hash(body) },
		},
	};
	const check = vi.spyOn(visibility, "researchVisibilityEvidence");
	expect(() => replay(forged)).toThrowError(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(check).toHaveBeenCalledOnce();
});

it("keeps top-only visibility provenance in explicit output-limit recovery", async () => {
	const input = revise(
		await fixture(
			`${source}<aside><p>${"Large surrounding text. ".repeat(13_000)}</p></aside>`,
		),
		(report) => {
			Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
		},
	);
	const result = recoverResearchOutputLimitSelector(input.raw, input.trusted, {
		selector: "main",
	});
	expect(result.report.reader?.visibilityPolicy).toBe(policy);
	expect(result.jsonl).not.toContain("HIDDEN_SAMPLE");
});

it("propagates the CLI flag through the research batch", async () => {
	const body = encoder.encode(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const reports = [];
	for await (const report of researchBatch([
		"--reader",
		...flags,
		"--min-request-interval-ms",
		"0",
		url,
	]))
		reports.push(report);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.clearAllMocks();
	expect(reports).toHaveLength(1);
	expect(reports[0].reader?.visibilityPolicy).toBe(policy);
	expect(reports[0].extraction?.content).not.toContain("HIDDEN_SAMPLE");
});

it.each(["json", "markdown"])(
	"preserves visibility provenance through the %s replay CLI",
	async (format) => {
		const fixtureValue = await fixture();
		const input = Readable.from([fixtureValue.raw], { objectMode: false });
		const chunks: Buffer[] = [];
		const output = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		});
		try {
			await runResearchReplayCli(
				[
					"--expected-profile",
					"default",
					"--receipt-sha256",
					hash(fixtureValue.raw),
					"--body-sha256",
					hash(fixtureValue.body),
					"--body-bytes",
					String(fixtureValue.body.byteLength),
					"--selector",
					"main",
					"--format",
					format,
				],
				input,
				output,
			);
			const text = Buffer.concat(chunks).toString("utf8");
			expect(text).toContain("Visible answer");
			expect(text).not.toContain("HIDDEN_SAMPLE");
			expect(JSON.parse(text).reader.visibilityPolicy).toBe(policy);
		} finally {
			input.destroy();
			output.destroy();
		}
	},
);
