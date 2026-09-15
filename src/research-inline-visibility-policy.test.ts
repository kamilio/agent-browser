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
import {
	type ResearchReaderVisibilityPolicy,
	researchReaderInfo,
	researchReaderNotice,
	researchReaderNoticeFor,
} from "./research-reader-info.js";
import { findInDocument, renderSnapshotSearch } from "./snapshot-search.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";

const url = "https://inline-visibility.fixture.invalid/document";
const policy = "source-hidden-inline-v1";
const flags = ["--reader-visibility-policy", policy];
const encoder = new TextEncoder();
const source =
	'<h1>Visible title</h1><main><p>Visible answer</p><p style="display:none">INLINE_SAMPLE</p><h2 hidden>HIDDEN_SAMPLE</h2><a aria-hidden="true" href="/hidden">ARIA_SAMPLE</a><p inert>Inert remains</p></main>';
const noise = `<aside><p>${"Large surrounding text. ".repeat(13_000)}</p></aside>`;

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(loader, "loadResearchDocument");
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
		for (const result of vi.mocked(loader.loadResearchDocument).mock.results) {
			if (result.type !== "return") continue;
			expect(result.value.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(result.value)).toBeUndefined();
		}
	} finally {
		for (const result of vi.mocked(loader.loadResearchDocument).mock.results)
			if (result.type === "return") result.value.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function response(html: string, mime = "text/html; charset=utf-8") {
	const body = encoder.encode(html);
	return {
		url,
		status: 200,
		headers: { "content-type": [mime] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

async function fixture(
	html = source,
	options: {
		profile?: ResearchDocumentProfileId;
		policy?: ResearchReaderVisibilityPolicy;
		legacy?: boolean;
		raw?: boolean;
		mime?: string;
		selector?: string;
		section?: string;
		headings?: boolean;
	} = {},
) {
	const primary = response(html, options.mime);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		primary,
	);
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
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(hash(primary.body)).toBe(hash(encoder.encode(html)));
	expect(report.bodyCapture).toMatchObject({
		decodedBytes: primary.body.byteLength,
		sha256: hash(primary.body),
		data: Buffer.from(primary.body).toString("base64"),
	});
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted: TrustedResearchReplayAdmission = {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: {
			bytes: primary.body.byteLength,
			sha256: hash(primary.body),
		},
	};
	return { report, raw, body: primary.body, trusted };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function revise(
	input: Fixture,
	mutate: (report: Record<string, unknown>) => void,
) {
	const report = structuredClone(input.report);
	mutate(report as unknown as Record<string, unknown>);
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function replaceBody(input: Fixture, html: string) {
	const body = encoder.encode(html);
	const changed = revise(input, (report) => {
		report.bodyCapture = {
			encoding: "base64",
			decodedBytes: body.byteLength,
			sha256: hash(body),
			data: Buffer.from(body).toString("base64"),
		};
		Object.assign(report.primaryResponse as object, {
			decodedBytes: body.byteLength,
			encodedBytes: body.byteLength,
			bodySha256: hash(body),
		});
		(report.navigation as { response: { bytes: number } }).response.bytes =
			body.byteLength;
	});
	return {
		...changed,
		body,
		trusted: {
			...changed.trusted,
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

function replay(input: Fixture) {
	return extractResearchReplayJson(input.raw, input.trusted, {
		selector: "main",
	});
}

it.each(["default", "long-v1"] as const)(
	"round-trips combined source omissions and provenance under %s",
	async (profile) => {
		const input = await fixture(source, { profile });
		expect(input.report.readerVisibilityPolicy).toBe(policy);
		expect(input.report.reader).toMatchObject({
			visibilityPolicy: policy,
			hiddenContentSemantics: "source-attributes-and-inline-display",
			sourceHiddenSubtrees: 3,
			omittedSubtrees: { p: 1, h2: 1, a: 1 },
			scripting: false,
			styling: false,
		});
		const result = replay(input);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report.networkRequests).toBe(0);
		expect(result.jsonl).toContain("Visible answer");
		expect(result.jsonl).toContain("Inert remains");
		for (const hidden of ["INLINE_SAMPLE", "HIDDEN_SAMPLE", "ARIA_SAMPLE"])
			expect(result.jsonl).not.toContain(hidden);
		expect(
			vi.mocked(loader.loadResearchDocument).mock.calls.at(-1)?.slice(2),
		).toEqual([profile, undefined, policy]);
	},
);

it.each([undefined, "source-hidden-v1"] as const)(
	"retains inline-hidden content under the prior policy %j",
	async (selected) => {
		const input = await fixture(source, {
			legacy: selected === undefined,
			policy: selected,
		});
		const result = replay(input);
		expect(input.report.extraction?.content).toContain("INLINE\\_SAMPLE");
		expect(result.jsonl).toContain("INLINE_SAMPLE");
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report.reader?.hiddenContentSemantics).toBe(
			selected ? "source-attributes" : false,
		);
		if (selected) {
			expect(result.report.reader?.sourceHiddenSubtrees).toBe(2);
			expect(result.jsonl).not.toContain("HIDDEN_SAMPLE");
		} else {
			expect(input.report).not.toHaveProperty("readerVisibilityPolicy");
			expect(result.report.reader).not.toHaveProperty("visibilityPolicy");
			expect(result.report.reader).not.toHaveProperty("sourceHiddenSubtrees");
			expect(result.jsonl).toContain("HIDDEN_SAMPLE");
		}
	},
);

it("does not infer computed styles or synthesize counter values", async () => {
	const input = await fixture(
		'<style>.css-hidden{display:none}</style><main><h3><span style="display:none">2</span><span>9</span>%</h3><h3>+<span aria-hidden="true">3</span><span>8</span>%</h3><p class="css-hidden">CLASS</p><p style="visibility:hidden">VISIBILITY</p><p style="opacity:0">OPACITY</p><p style="display:none;display:block">OVERRIDE</p><p style="display:var(--mode)">VARIABLE</p><pre>&lt;p style="display:none"&gt;EXAMPLE&lt;/p&gt;</pre></main>',
	);
	const control = await fixture(
		'<main><h3><span>9</span>%</h3><h3>+<span>8</span>%</h3><p>CLASS</p><p>VISIBILITY</p><p>OPACITY</p><p>OVERRIDE</p><p>VARIABLE</p><pre>&lt;p style="display:none"&gt;EXAMPLE&lt;/p&gt;</pre></main>',
	);
	expect(input.report.extraction?.content).toBeDefined();
	expect(input.report.extraction?.content).toEqual(
		control.report.extraction?.content,
	);
	expect(input.report.reader?.sourceHiddenSubtrees).toBe(2);
	const withoutReferences = (value: unknown) =>
		JSON.parse(
			JSON.stringify(value, (key, entry) =>
				key === "ref" ? undefined : entry,
			),
		);
	expect(withoutReferences(replay(input).report.extraction?.content)).toEqual(
		withoutReferences(replay(control).report.extraction?.content),
	);
});

it("composes raw accounting with inline visibility without changing capture", async () => {
	const input = await fixture(`${source}<script>OMITTED_SCRIPT</script>`, {
		raw: true,
	});
	expect(input.report.readerRawPolicy).toBe("separate-omitted-raw-v1");
	const result = replay(input);
	expect(result.report.reader).toEqual(input.report.reader);
	expect(result.report.reader).toMatchObject({
		rawTextPolicy: "separate-omitted-raw-v1",
		visibilityPolicy: policy,
		hiddenContentSemantics: "source-attributes-and-inline-display",
		sourceHiddenSubtrees: 3,
		omittedRaw: { elements: 1 },
	});
	expect(result.jsonl).not.toContain("OMITTED_SCRIPT");
	expect(result.jsonl).not.toContain("INLINE_SAMPLE");
	expect(
		vi.mocked(loader.loadResearchDocument).mock.calls.at(-1)?.slice(3),
	).toEqual(["separate-omitted-raw-v1", policy]);
});

it.each(["text/plain", "text/markdown"])(
	"keeps %s literal with false semantics and no omissions",
	async (mime) => {
		const input = await fixture(
			'# Source\n<div hidden style="display:none">INLINE_SAMPLE</div>\n',
			{ mime },
		);
		expect(input.report.extraction?.content).toContain("INLINE_SAMPLE");
		expect(input.report.reader).toMatchObject({
			visibilityPolicy: policy,
			hiddenContentSemantics: false,
			sourceHiddenSubtrees: 0,
		});
		const result = extractResearchReplayJson(input.raw, input.trusted, {
			lines: { start: 1, end: 2 },
		});
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.jsonl).toContain("INLINE_SAMPLE");
		expect(researchReaderNoticeFor(result.report.reader)).toBe(
			researchReaderNotice,
		);
		const invalid = revise(input, (report) => {
			(report.reader as Record<string, unknown>).sourceHiddenSubtrees = 1;
		});
		expect(() =>
			extractResearchReplayJson(invalid.raw, invalid.trusted, {
				lines: { start: 1, end: 2 },
			}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(["top", "reader"])(
	"accepts consistent %s-only replay declarations",
	async (declaration) => {
		const input = revise(await fixture(), (report) => {
			if (declaration === "top")
				Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
			else Reflect.deleteProperty(report, "readerVisibilityPolicy");
		});
		const result = replay(input);
		expect(result.report.reader).toMatchObject({
			visibilityPolicy: policy,
			hiddenContentSemantics: "source-attributes-and-inline-display",
			sourceHiddenSubtrees: 3,
		});
		expect(result.jsonl).not.toContain("INLINE_SAMPLE");
	},
);

it.each(["top", "reader"])(
	"rejects conflicting %s policy and stripped declarations",
	async (declaration) => {
		const original = await fixture();
		const conflict = revise(original, (report) => {
			if (declaration === "top")
				report.readerVisibilityPolicy = "source-hidden-v1";
			else
				(report.reader as Record<string, unknown>).visibilityPolicy =
					"source-hidden-v1";
		});
		expect(() => replay(conflict)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		const stripped = revise(original, (report) => {
			Reflect.deleteProperty(report, "readerVisibilityPolicy");
			Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
		});
		expect(() => replay(stripped)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([false, true, null, "source-attributes", undefined])(
	"rejects old, stripped or contradictory HTML semantics %j",
	async (value) => {
		const input = revise(await fixture(), (report) => {
			(report.reader as Record<string, unknown>).hiddenContentSemantics = value;
		});
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, "3", undefined])(
	"rejects invalid or missing combined subtree count %j",
	async (value) => {
		const input = revise(await fixture(), (report) => {
			(report.reader as Record<string, unknown>).sourceHiddenSubtrees = value;
		});
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([null, {}, "", "source-hidden-inline-v2", " source-hidden-inline-v1"])(
	"rejects malformed policy %j at API and replay boundaries",
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
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		const original = await fixture();
		for (const declaration of ["top", "reader"]) {
			const input = revise(original, (report) => {
				if (declaration === "top") report.readerVisibilityPolicy = value;
				else
					(report.reader as Record<string, unknown>).visibilityPolicy = value;
			});
			expect(() => replay(input)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
	},
);

it("accepts the CLI literal only with reader and propagates both policies", async () => {
	expect(parseResearchArguments(["--reader", url])).not.toHaveProperty(
		"readerVisibilityPolicy",
	);
	for (const args of [
		[...flags, url],
		["--reader", "--reader-visibility-policy"],
		["--reader", ...flags, ...flags, url],
		["--reader", "--reader-visibility-policy", `${policy} `, url],
	])
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	for (const profile of ["default", "long-v1"]) {
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
	}
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response(`${source}<script>OMITTED_SCRIPT</script>`),
	);
	const reports = [];
	for await (const report of researchBatch([
		"--reader",
		...flags,
		"--reader-raw-policy",
		"separate-omitted-raw-v1",
		"--min-request-interval-ms",
		"0",
		url,
	]))
		reports.push(report);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(reports).toHaveLength(1);
	expect(reports[0].reader).toMatchObject({
		visibilityPolicy: policy,
		rawTextPolicy: "separate-omitted-raw-v1",
		sourceHiddenSubtrees: 3,
	});
	expect(reports[0].extraction?.content).not.toContain("INLINE_SAMPLE");
	expect(reports[0].metrics).toMatchObject({ active: 0, closed: true });
});

it.each(["json", "markdown"])(
	"retains inline policy provenance through the %s replay CLI",
	async (format) => {
		const captured = await fixture();
		const input = Readable.from([captured.raw], { objectMode: false });
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
					hash(captured.raw),
					"--body-sha256",
					hash(captured.body),
					"--body-bytes",
					String(captured.body.byteLength),
					"--selector",
					"main",
					"--format",
					format,
				],
				input,
				output,
			);
			const text = Buffer.concat(chunks).toString("utf8");
			expect(JSON.parse(text).reader).toMatchObject({
				visibilityPolicy: policy,
				hiddenContentSemantics: "source-attributes-and-inline-display",
				sourceHiddenSubtrees: 3,
			});
			expect(text).toContain("Visible answer");
			expect(text).not.toContain("INLINE_SAMPLE");
		} finally {
			input.destroy();
			output.destroy();
		}
	},
);

it("renders distinct truthful notices without claiming computed visibility", () => {
	for (const selected of [undefined, "source-hidden-v1", policy] as const) {
		const tree = loader.loadResearchDocument(
			response(source),
			{
				tabId: "synthetic-inline-notices",
				signal: new AbortController().signal,
				limits: {
					maxNodes: 1000,
					maxDepth: 128,
					maxTextCodeUnits: 10_000,
					maxChanges: 1024,
				},
			},
			"default",
			undefined,
			selected,
		);
		try {
			const notice = researchReaderNoticeFor(researchReaderInfo(tree));
			for (const text of [
				renderSnapshot(snapshotDocument(tree)),
				renderSnapshotSearch(findInDocument(tree, "Visible")),
			])
				expect(text).toContain(notice);
			if (selected === policy) {
				expect(notice).toContain("simple inline display:none subtrees omitted");
				expect(notice).toContain("computed CSS visibility ignored");
				expect(renderSnapshot(snapshotDocument(tree))).not.toContain(
					"INLINE_SAMPLE",
				);
			} else if (selected) {
				expect(notice).toContain("source-hidden subtrees omitted");
				expect(notice).not.toContain("inline display:none");
			} else expect(notice).toBe(researchReaderNotice);
		} finally {
			tree.close();
		}
	}
});

const barriers = [
	{
		kind: "challenge",
		title: "Security check",
		marker: "Verify you are human",
	},
	{ kind: "login", title: "Sign in", marker: "Sign in to continue" },
] as const;

it.each(barriers)(
	"retains unfiltered $kind title and body evidence before CSS omission",
	async ({ kind, title, marker }) => {
		for (const hidden of ["title", "body", "both"]) {
			const input = await fixture(
				`<title${hidden !== "body" ? ' style="display:none"' : ""}>${title}</title><main><p${hidden !== "title" ? ' style="display:none"' : ""}>${marker}</p><p>Visible answer</p></main>`,
			);
			expect(input.report.outcome).toBe("semantic-barrier");
			expect(input.report.classification.barrier).toBe(kind);
			expect(input.report.contentSuccess).toBe(false);
			expect(input.report.extraction).toBeUndefined();
			expect(input.report.reader).toBeUndefined();
			expect(() => replay(input)).toThrowError(
				expect.objectContaining({ code: "policy-denied" }),
			);
		}
	},
);

it("checks a retained title even when an inline-hidden title comes first", async () => {
	const input = await fixture(
		'<title style="display:none">Welcome</title><title>Security check</title><main><p>Verify you are human</p></main>',
	);
	expect(input.report.outcome).toBe("semantic-barrier");
	expect(input.report.classification.barrier).toBe("challenge");
	expect(input.report.contentSuccess).toBe(false);
});

function lateBarrier(title: string, marker: string) {
	return `<title style="display:none">${title}</title><aside>${"x".repeat(9000)}</aside><main><h1 id="target" style="display:none">${marker}</h1><a href="${url}/next" style="display:none">${marker}</a><p>Visible answer</p></main>`;
}

it.each([
	{ method: "selector", selection: { selector: "main" } },
	{ method: "section", selection: { section: "#target" } },
	{ method: "outline", selection: { headings: true } },
])(
	"checks late unfiltered $method navigation evidence beyond the document prefix",
	async ({ selection }) => {
		for (const { kind, title, marker } of barriers) {
			const input = await fixture(lateBarrier(title, marker), selection);
			expect(input.report.outcome).toBe("semantic-barrier");
			expect(input.report.classification.barrier).toBe(kind);
			expect(input.report.contentSuccess).toBe(false);
			expect(input.report.extraction).toBeUndefined();
			expect(input.report.headings).toBeUndefined();
		}
	},
);

it.each([
	{ method: "selector", selection: { selector: "main" } },
	{ method: "section", selection: { section: "#target" } },
	{ method: "links", selection: { links: "fixture.invalid" } },
])(
	"rejects forged clear receipts with late CSS-hidden $method replay evidence",
	async ({ selection }) => {
		const original = await fixture();
		const check = vi.spyOn(visibility, "researchVisibilityEvidence");
		for (const { kind, title, marker } of barriers) {
			const forged = replaceBody(original, lateBarrier(title, marker));
			expect(() =>
				extractResearchReplayJson(forged.raw, forged.trusted, selection),
			).toThrowError(expect.objectContaining({ code: "policy-denied" }));
			expect(check.mock.results.at(-1)?.value?.diagnostic?.kind).toBe(kind);
		}
		expect(check).toHaveBeenCalledTimes(barriers.length);
	},
);

it.each(["top", "reader"])(
	"preserves %s-only provenance and barriers through output-limit recovery",
	async (declaration) => {
		const input = revise(await fixture(source + noise), (report) => {
			if (declaration === "top")
				Reflect.deleteProperty(report.reader as object, "visibilityPolicy");
			else Reflect.deleteProperty(report, "readerVisibilityPolicy");
		});
		expect(input.report.outcome).toBe("failure");
		expect(input.report.failure?.resourceLimit?.kind).toBe("extraction.output");
		expect(() => replay(input)).toThrowError(
			expect.objectContaining({ code: "policy-denied" }),
		);
		const result = recoverResearchOutputLimitSelector(
			input.raw,
			input.trusted,
			{
				selector: "main",
			},
		);
		expect(result.report.reader).toMatchObject({
			visibilityPolicy: policy,
			hiddenContentSemantics: "source-attributes-and-inline-display",
			sourceHiddenSubtrees: 3,
		});
		expect(result.report.networkRequests).toBe(0);
		expect(result.jsonl).toContain("Visible answer");
		expect(result.jsonl).not.toContain("INLINE_SAMPLE");
		for (const { kind, title, marker } of barriers) {
			const forged = replaceBody(input, lateBarrier(title, marker) + noise);
			const check = vi.spyOn(visibility, "researchVisibilityEvidence");
			expect(() =>
				recoverResearchOutputLimitSelector(forged.raw, forged.trusted, {
					selector: "main",
				}),
			).toThrowError(expect.objectContaining({ code: "policy-denied" }));
			expect(() =>
				outlineResearchOutputLimitCapture(forged.raw, forged.trusted),
			).toThrowError(expect.objectContaining({ code: "policy-denied" }));
			expect(check).toHaveBeenCalledTimes(2);
			expect(check.mock.results.at(-1)?.value?.diagnostic?.kind).toBe(kind);
			check.mockRestore();
		}
	},
);

it("charges omitted text and counts a mixed hidden subtree only once", async () => {
	const html =
		'<main><div hidden style="display:none">DROP<span aria-hidden="true" style="display:none">NESTED</span></div><p style="display:none">INLINE</p><p>KEEP</p></main>';
	const input = await fixture(html);
	expect(input.report.reader).toMatchObject({
		sourceCodeUnits: html.length,
		textCodeUnits: "DROPNESTEDINLINEKEEP".length,
		sourceHiddenSubtrees: 2,
		omittedSubtrees: { div: 1, p: 1 },
	});
	expect(replay(input).jsonl).not.toContain("NESTED");
	const oversized = await fixture(
		`<main style="display:none">${"x".repeat(loader.researchReaderLimits.maxTextCodeUnits + 1)}</main>`,
	);
	expect(oversized.report.outcome).toBe("failure");
	expect(oversized.report.failure?.resourceLimit).toMatchObject({
		kind: "reader.text",
		limit: loader.researchReaderLimits.maxTextCodeUnits,
		observed: loader.researchReaderLimits.maxTextCodeUnits + 1,
	});
	expect(() => replay(oversized)).toThrowError(
		expect.objectContaining({ code: "policy-denied" }),
	);
});

it("does not claim content success for an all-inline-hidden source", async () => {
	const input = await fixture(
		'<main style="display:none"><p>INLINE_SAMPLE</p></main>',
	);
	expect(input.report.outcome).toBe("empty-extraction");
	expect(input.report.contentSuccess).not.toBe(true);
	expect(input.report.extraction?.content).toBe("");
	expect(input.report.reader?.sourceHiddenSubtrees).toBe(1);
});
