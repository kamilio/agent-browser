import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	type ResearchJsonReplaySelection,
	extractResearchReplayJson,
} from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { loadBrowserDocument } from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import {
	type ResearchReaderFallbackEncoding,
	validateResearchReaderFallbackEncoding,
} from "./research-reader-info.js";
import type { DocumentLoaderContext } from "./session.js";

const encoder = new TextEncoder();
const url = "https://reader-fallback.fixture.invalid/article";
const fallback: ResearchReaderFallbackEncoding = "utf-8";
const text = "“Quoted”—it’s €5… café; Zażółć gęślą jaźń; Ελληνικά; 日本語";
const article = `<main><h1>Owned heading</h1><p>${text}</p></main>`;
const lateSource = `${" ".repeat(1100)}<meta charset="utf-8">${article}`;
const trees: DocumentTree[] = [];

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
			throw new Error("Reader fallback tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const tree of trees.splice(0)) tree.close();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function context(): DocumentLoaderContext {
	return {
		tabId: "synthetic-reader-fallback",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
	};
}

function response(
	source: string | Uint8Array,
	mime = "text/html",
): NetworkResponse {
	const body = typeof source === "string" ? encoder.encode(source) : source;
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

function load(
	input: NetworkResponse,
	selected?: ResearchReaderFallbackEncoding,
) {
	const tree = loader.loadResearchDocument(
		input,
		context(),
		undefined,
		undefined,
		undefined,
		undefined,
		selected,
	);
	trees.push(tree);
	return tree;
}

function assertDecoded(
	tree: DocumentTree,
	encoding: string,
	expected: string,
	selected?: ResearchReaderFallbackEncoding,
) {
	expect(tree.textContent(tree.root)).toContain(expected);
	expect(loader.researchReaderInfo(tree)?.encoding).toBe(encoding);
	if (selected === undefined)
		expect(loader.researchReaderInfo(tree)).not.toHaveProperty(
			"fallbackEncoding",
		);
	else expect(loader.researchReaderInfo(tree)?.fallbackEncoding).toBe(selected);
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	source = lateSource,
	options: {
		profile?: ResearchDocumentProfileId;
		fallback?: ResearchReaderFallbackEncoding;
		mime?: string;
	} = {},
): Promise<Fixture> {
	const input = response(source, options.mime);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	let report: ResearchNavigationReport;
	try {
		report = await researchNavigation(
			url,
			true,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			profile === "long-v1",
			undefined,
			profile,
			{
				minRequestIntervalMs: 0,
				...(options.fallback === undefined
					? {}
					: { readerFallbackEncoding: options.fallback }),
			},
		);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	} finally {
		vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	}
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		raw: serialized.jsonl,
		body: input.body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: input.body.byteLength, sha256: hash(input.body) },
		},
	};
}

function revised(
	input: Fixture,
	mutate: (report: Record<string, unknown>) => void,
): Fixture {
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

function replay(
	input: Fixture,
	selection: ResearchJsonReplaySelection = { selector: "main" },
) {
	const unchanged = structuredClone(input);
	try {
		const result = extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
		);
		expect(result.report.source).toEqual({
			profile: input.trusted.expectedProfile,
			reportedFinalUrl: url,
			receiptSha256: hash(input.raw),
			body: input.trusted.expectedBody,
		});
		expect(result.report.networkRequests).toBe(0);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		return result;
	} finally {
		expect(input).toEqual(unchanged);
	}
}

function observeOwnership(
	mutate?: (metadata: Record<string, unknown>) => void,
) {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind !== "validated-capture") return admitted;
			bodies.push(admitted.body);
			if (!mutate) return admitted;
			const metadata = structuredClone(admitted.originalMetadata);
			mutate(metadata);
			return { ...admitted, originalMetadata: metadata };
		},
	);
	const load = vi.spyOn(loader, "loadResearchDocument");
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return {
		load,
		assert(count: number) {
			expect(bodies).toHaveLength(1);
			for (const body of bodies) {
				expect(body.byteLength).toBeGreaterThan(0);
				expect(body.every((value) => value === 0)).toBe(true);
			}
			expect(close).toHaveBeenCalledTimes(count);
			for (const tree of close.mock.contexts) {
				expect(tree).toBeInstanceOf(DocumentTree);
				if (!(tree instanceof DocumentTree)) throw new Error("Expected tree");
				expect(tree.mutationMetrics().closed).toBe(true);
				expect(loader.researchReaderInfo(tree)).toBeUndefined();
			}
		},
	};
}

it.each([article, lateSource])(
	"preserves default windows-1252 decoding without supported early metadata (%#)",
	(source) => {
		const input = response(source);
		const ordinary = loader.loadResearchDocument(input, context());
		trees.push(ordinary);
		const explicitUndefined = load(input);
		assertDecoded(ordinary, "windows-1252", "â€œQuotedâ€");
		expect(ordinary.textContent(ordinary.root)).not.toContain(text);
		expect(explicitUndefined.textContent(explicitUndefined.root)).toBe(
			ordinary.textContent(ordinary.root),
		);
		expect(loader.researchReaderInfo(explicitUndefined)).toEqual(
			loader.researchReaderInfo(ordinary),
		);
	},
);

it("repairs late UTF-8 punctuation and multilingual text only with explicit fallback", () => {
	const input = response(lateSource);
	const original = input.body.slice();
	assertDecoded(load(input, fallback), "utf-8", text, fallback);
	expect(input.body).toEqual(original);
});

it.each([
	{
		name: "UTF-8 BOM over windows-1252 HTTP and meta",
		body: encoder.encode(`\uFEFF<meta charset="windows-1252">${article}`),
		mime: "text/html; charset=windows-1252",
		encoding: "utf-8",
	},
	{
		name: "UTF-16LE BOM over UTF-8 HTTP and fallback",
		body: new Uint8Array(Buffer.from(`\uFEFF${article}`, "utf16le")),
		mime: "text/html; charset=utf-8",
		encoding: "utf-16le",
	},
])("honors $name", ({ body, mime, encoding }) => {
	assertDecoded(load(response(body, mime), fallback), encoding, text, fallback);
});

it("honors HTTP charset over early meta and fallback", () => {
	const body = new Uint8Array(
		Buffer.from('<meta charset="utf-8"><main>caf\xe9 \x80</main>', "latin1"),
	);
	assertDecoded(
		load(response(body, "text/html; charset=windows-1252"), fallback),
		"windows-1252",
		"café €",
		fallback,
	);
});

it.each([
	'<meta charset="windows-1252">',
	'<meta http-equiv="content-type" content="text/html; charset=windows-1252">',
])("honors supported early metadata %s over fallback", (meta) => {
	const body = new Uint8Array(
		Buffer.from(`${meta}<main>caf\xe9</main>`, "latin1"),
	);
	assertDecoded(
		load(response(body), fallback),
		"windows-1252",
		"café",
		fallback,
	);
});

it.each([
	{
		source:
			'<meta charset="synthetic-unknown"><meta charset="utf-8"><main>café</main>',
		encoding: "utf-8",
	},
	{
		source:
			'<meta charset="x-user-defined"><meta charset="utf-8"><main>café</main>',
		encoding: "windows-1252",
	},
])(
	"matches the actual native loader for metadata precedence: $encoding",
	async ({ source, encoding }) => {
		const input = response(source);
		const native = await loadBrowserDocument(input, context());
		trees.push(native);
		const reader = load(input, fallback);
		expect(htmlParseInfo(native)?.encoding).toBe(encoding);
		expect(loader.researchReaderInfo(reader)?.encoding).toBe(encoding);
		expect(reader.textContent(reader.root)).toBe(
			native.textContent(native.root),
		);
	},
);

it.each([undefined, fallback])(
	"continues past an invalid meta to a supported UTF-8 label (fallback=%s)",
	(selected) => {
		const source = `<meta charset="not-an-encoding"><meta charset="utf-8">${article}`;
		assertDecoded(load(response(source), selected), "utf-8", text, selected);
	},
);

it.each([undefined, fallback])(
	"maps x-user-defined metadata to windows-1252 (fallback=%s)",
	(selected) => {
		const body = new Uint8Array(
			Buffer.from(
				'<meta charset="x-user-defined"><main>caf\xe9 \x80</main>',
				"latin1",
			),
		);
		assertDecoded(
			load(response(body), selected),
			"windows-1252",
			"café €",
			selected,
		);
	},
);

it.each([1024, 1025])(
	"keeps the metadata prescan bounded when a tag ends at byte %i",
	(end) => {
		const meta = '<meta charset="windows-1252">';
		const source = `${" ".repeat(end - meta.length)}${meta}${article}`;
		expect(encoder.encode(source.slice(0, end)).byteLength).toBe(end);
		assertDecoded(
			load(response(source), fallback),
			end === 1024 ? "windows-1252" : "utf-8",
			end === 1024 ? "â€œQuotedâ€" : text,
			fallback,
		);
	},
);

it.each([
	'<!-- <meta charset="windows-1252"> -->',
	'<script>"<meta charset=windows-1252>"</script>',
	'<textarea><meta charset="windows-1252"></textarea>',
	'<div title="<meta charset=windows-1252>"></div>',
])(
	"ignores comment, raw-text and attribute metadata lookalikes (%#)",
	(prefix) => {
		assertDecoded(
			load(response(`${prefix}${article}`), fallback),
			"utf-8",
			text,
			fallback,
		);
	},
);

it.each([
	{
		mime: "text/plain",
		body: encoder.encode(text),
		encoding: "utf-8",
		expected: text,
	},
	{
		mime: "text/markdown",
		body: encoder.encode(`# ${text}`),
		encoding: "utf-8",
		expected: text,
	},
	{
		mime: "text/plain; charset=windows-1252",
		body: new Uint8Array(Buffer.from("caf\xe9 \x80", "latin1")),
		encoding: "windows-1252",
		expected: "café €",
	},
])(
	"leaves non-HTML decoding unchanged for $mime",
	({ mime, body, encoding, expected }) => {
		const ordinary = load(response(body, mime));
		const explicit = load(response(body, mime), fallback);
		assertDecoded(ordinary, encoding, expected);
		assertDecoded(explicit, encoding, expected, fallback);
		expect(explicit.textContent(explicit.root)).toBe(
			ordinary.textContent(ordinary.root),
		);
	},
);

it("accepts only absent or canonical UTF-8 fallback", () => {
	expect(validateResearchReaderFallbackEncoding(undefined)).toBeUndefined();
	expect(validateResearchReaderFallbackEncoding(fallback)).toBe(fallback);
});

it.each([
	null,
	false,
	1,
	"",
	"UTF-8",
	"utf8",
	"windows-1252",
	" utf-8 ",
	[],
	{},
])("rejects invalid fallback %j in both validator and loader", (value) => {
	expect(() => validateResearchReaderFallbackEncoding(value)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() =>
		load(response(article), value as ResearchReaderFallbackEncoding),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("does not rescue unsupported HTTP charset with a valid fallback", () => {
	expect(() =>
		load(response(article, "text/html; charset=not-an-encoding"), fallback),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	{ profile: "default", selected: undefined },
	{ profile: "default", selected: fallback },
	{ profile: "long-v1", selected: undefined },
	{ profile: "long-v1", selected: fallback },
] as const)(
	"inherits validated fallback=$selected in $profile replay",
	async ({ profile, selected }) => {
		const input = await fixture(lateSource, { profile, fallback: selected });
		expect(input.report.outcome).toBe("extracted-unverified");
		if (selected === undefined) {
			expect(input.report).not.toHaveProperty("readerFallbackEncoding");
			expect(input.report.reader).not.toHaveProperty("fallbackEncoding");
		} else {
			expect(input.report.readerFallbackEncoding).toBe(selected);
			expect(input.report.reader?.fallbackEncoding).toBe(selected);
		}
		const ownership = observeOwnership();
		const result = replay(input);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report.reader?.encoding).toBe(selected ?? "windows-1252");
		expect(result.jsonl).toContain(
			selected === undefined ? "â€œQuotedâ€" : text,
		);
		expect(ownership.load).toHaveBeenCalledOnce();
		expect(ownership.load.mock.calls[0].slice(2)).toEqual(
			selected === undefined
				? [profile]
				: [profile, undefined, undefined, undefined, fallback],
		);
		ownership.assert(1);
	},
);

it("replays explicit fallback metadata when authoritative charset selects another encoding", async () => {
	const input = await fixture(lateSource, {
		fallback,
		mime: "text/html; charset=windows-1252",
	});
	const ownership = observeOwnership();
	expect(replay(input).report.reader).toMatchObject({
		fallbackEncoding: fallback,
		encoding: "windows-1252",
	});
	ownership.assert(1);
});

it.each([
	{ name: "top null", top: null, nested: fallback },
	{ name: "nested null", top: fallback, nested: null },
	{ name: "top invalid", top: "utf8", nested: fallback },
	{ name: "nested disagreement", top: fallback, nested: "windows-1252" },
	{ name: "matching invalid labels", top: "UTF-8", nested: "UTF-8" },
	{ name: "missing top counterpart", top: undefined, nested: fallback },
	{ name: "missing nested counterpart", top: fallback, nested: undefined },
])(
	"rejects replay metadata with $name before loading",
	async ({ top, nested }) => {
		const input = revised(await fixture(lateSource, { fallback }), (report) => {
			const reader = report.reader as Record<string, unknown>;
			if (top === undefined)
				Reflect.deleteProperty(report, "readerFallbackEncoding");
			else report.readerFallbackEncoding = top;
			if (nested === undefined)
				Reflect.deleteProperty(reader, "fallbackEncoding");
			else reader.fallbackEncoding = nested;
		});
		const ownership = observeOwnership();
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each([undefined, null, false, "utf-8", []])(
	"rejects non-record reader metadata %j",
	async (reader) => {
		const input = revised(await fixture(lateSource, { fallback }), (report) => {
			report.reader = reader;
		});
		const ownership = observeOwnership();
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each(["top", "nested"])(
	"rejects own undefined %s fallback at the admission boundary",
	async (location) => {
		const input = await fixture(lateSource, { fallback });
		const ownership = observeOwnership((metadata) => {
			if (location === "top") metadata.readerFallbackEncoding = undefined;
			else
				(metadata.reader as Record<string, unknown>).fallbackEncoding =
					undefined;
		});
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it("rejects a recorded reader encoding inconsistent with the replayed bytes", async () => {
	const input = revised(await fixture(lateSource, { fallback }), (report) => {
		(report.reader as Record<string, unknown>).encoding = "windows-1252";
	});
	const ownership = observeOwnership();
	expect(() => replay(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(ownership.load).toHaveBeenCalledOnce();
	ownership.assert(1);
});

it("keeps source pins and original failure admission authoritative with fallback", async () => {
	const original = await fixture(lateSource, { fallback });
	const failed = revised(original, (report) => {
		report.outcome = "failure";
		report.failure = { category: "unsupported", stage: "navigation" };
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => replay(failed)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	for (const trusted of [
		{ ...original.trusted, expectedReceiptSha256: "0".repeat(64) },
		{
			...original.trusted,
			expectedBody: { bytes: original.body.byteLength, sha256: "0".repeat(64) },
		},
	])
		expect(() => replay({ ...original, trusted })).toThrow(AgentBrowserError);
	expect(load).not.toHaveBeenCalled();
});

it("does not admit a captured challenge barrier merely because fallback is declared", async () => {
	const input = await fixture(
		"<title>Security check</title><main>Verify you are human</main>",
		{ fallback },
	);
	expect(input.report.outcome).toBe("semantic-barrier");
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => replay(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(load).not.toHaveBeenCalled();
});

it("retains the fixed replay extraction budget with fallback and releases owned data", async () => {
	const cell = `<td headers="${"x".repeat(4096)}">Owned</td>`;
	const input = await fixture(
		`<main><h1>Owned</h1><table><tr>${cell.repeat(70)}</tr></table></main>`,
		{ fallback },
	);
	expect(input.report.outcome).toBe("extracted-unverified");
	const ownership = observeOwnership();
	expect(() =>
		replay(input, { selector: "table", tableMetadata: true }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	ownership.assert(1);
});
