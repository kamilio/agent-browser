import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { runResearchReplayCli } from "../scripts/research-replay-cli.js";
import * as challenges from "./browser-challenges.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import * as extraction from "./extraction.js";
import { discoverDocumentLinks, extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const encoder = new TextEncoder();
const url = "https://source-label.fixture.invalid/document";
const rawPolicy = "separate-omitted-raw-v1";
const heading = '<h1 id="owned">Owned heading</h1>';
const iconLink =
	'<a id="resource" href="/resource" aria-label="Explore resources" title="Fallback"><svg><title>Omitted icon</title></svg></a>';
const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const streams: Array<Readable | Writable> = [];
let expectedRequests = 0;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source-label fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const stream of streams.splice(0)) stream.destroy();
		for (const owner of queries.splice(0)) owner.close();
		for (const tree of trees.splice(0)) tree.close();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned document cleanup");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function response(source: string, mime = "text/html"): NetworkResponse {
	const body = encoder.encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function reader(
	source: string,
	profile: ResearchDocumentProfileId = "default",
	mime = "text/html",
) {
	const tree = loadResearchDocument(
		response(source, mime),
		{
			tabId: "source-label-fixture",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
		profile,
		rawPolicy,
	);
	trees.push(tree);
	return tree;
}

function node(tree: DocumentTree, selector: string) {
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	const found = owner.querySelector(selector);
	if (found === null) throw new Error("Missing fixture node");
	return found;
}

function anchor(attributes: Record<string, string>, text = "") {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const target = tree.createElement("a", { href: "/resource", ...attributes });
	tree.append(tree.root, target);
	if (text) tree.append(target, tree.createText(text));
	return { tree, target };
}

function rejects(action: () => unknown, code: ErrorCode) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected bounded source-label rejection");
	expect(caught.code).toBe(code);
	for (const key of ["cause", "body", "rawReceipt", "originalMetadata"])
		expect(Object.hasOwn(caught, key)).toBe(false);
}

async function fixture(
	source = `${heading}<main>${iconLink}</main>`,
	profile: ResearchDocumentProfileId = "default",
	options: ResearchExecutionOptions = {},
): Promise<Fixture> {
	const original = response(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		original,
	);
	expectedRequests++;
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		true,
		undefined,
		profile,
		{ minRequestIntervalMs: 0, readerRawPolicy: rawPolicy, ...options },
	);
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(original.body).toEqual(encoder.encode(source));
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		raw: serialized.jsonl,
		body: original.body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: {
				bytes: original.body.byteLength,
				sha256: hash(original.body),
			},
		},
	};
}

function replay(input: Fixture, signal?: AbortSignal) {
	const before = structuredClone(input);
	const requestCount = vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls.length;
	try {
		const result = extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ links: "resource" },
			signal,
		);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		expect(result.report).toMatchObject({
			networkRequests: 0,
			partial: true,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: url,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
			expect(result.jsonl).not.toContain(`"${key}"`);
		return result;
	} finally {
		expect(input).toEqual(before);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			requestCount,
		);
	}
}

function observeAdmittedBody() {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind === "validated-capture") bodies.push(admitted.body);
			return admitted;
		},
	);
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].byteLength).toBeGreaterThan(0);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
	};
}

it.each(["default", "long-v1"] as const)(
	"retains authored aria-label only as anchor metadata in the %s reader",
	(profile) => {
		const source = `${iconLink}<a id="no-href" aria-label="Not a destination"></a>`;
		const sanitized = sanitizeResearchHtml(source, {}, undefined, profile);
		expect(sanitized.html).toContain('aria-label="Explore resources"');
		expect(sanitized.html).not.toContain("<svg");
		const tree = reader(source, profile);
		expect(tree.get(node(tree, "#resource")).attributes["aria-label"]).toBe(
			"Explore resources",
		);
		expect(tree.get(node(tree, "#no-href")).attributes["aria-label"]).toBe(
			"Not a destination",
		);
		expect(tree.textContent(node(tree, "#resource"))).toBe("");
		expect(discoverDocumentLinks(tree, "resource").entries).toEqual([
			{
				ref: tree.reference(node(tree, "#resource")),
				url: "https://source-label.fixture.invalid/resource",
				label: "",
				labelTruncated: false,
				sourceLabel: {
					attribute: "aria-label",
					text: "Explore resources",
					truncated: false,
				},
			},
		]);
	},
);

it.each(["span", "div", "button", "area"])(
	"does not promote aria-label on a non-anchor %s",
	(tag) => {
		const source = `<${tag} id="other" aria-label="Do not promote" href="/resource"></${tag}>`;
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.html).not.toContain("aria-label");
		expect(sanitized.html).not.toContain("Do not promote");
		expect(discoverDocumentLinks(reader(source), "resource").entries).toEqual(
			[],
		);
	},
);

it.each([8192, 8193])(
	"bounds reader aria-label retention at %s UTF-16 units without changing title policy",
	(length) => {
		const value = "a".repeat(length);
		const source = `<a href="/resource" aria-label="${value}" title="Fallback"></a>`;
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.report.ignoredAttributes).toBe(length > 8192 ? 1 : 0);
		const tree = reader(source);
		const attributes = tree.get(node(tree, "a")).attributes;
		if (length > 8192) {
			expect(attributes).not.toHaveProperty("aria-label");
			expect(sanitized.html).not.toContain(value);
		} else expect(attributes["aria-label"]).toBe(value);
		expect(
			discoverDocumentLinks(tree, "resource").entries[0].sourceLabel,
		).toEqual(
			length > 8192
				? { attribute: "title", text: "Fallback", truncated: false }
				: { attribute: "aria-label", text: "a".repeat(256), truncated: true },
		);
		const longTitle = "t".repeat(8193);
		expect(sanitizeResearchHtml(`<a title="${longTitle}"></a>`).html).toContain(
			`title="${longTitle}"`,
		);
	},
);

it.each(["markdown", "json"] as const)(
	"keeps ordinary %s extraction unchanged by source-label discovery",
	(format) => {
		const tree = reader(`${heading}<p>Body${iconLink}</p>`);
		const reference = tree.reference(node(tree, "#resource"));
		const before = extractDocument(tree, { format });
		const revision = tree.revision;
		expect(
			extractDocument(tree, { root: reference, format: "json" }).content,
		).toEqual({
			ref: reference,
			type: "link",
			url: "https://source-label.fixture.invalid/resource",
			children: [],
		});
		expect(extractDocument(tree, { root: reference }).content).toBe("");
		expect(discoverDocumentLinks(tree, "resource").entries[0]).toHaveProperty(
			"sourceLabel.text",
			"Explore resources",
		);
		expect(extractDocument(tree, { format })).toEqual(before);
		expect(JSON.stringify(before.content)).not.toContain("Explore resources");
		expect(JSON.stringify(before.content)).not.toContain("sourceLabel");
		expect(tree.revision).toBe(revision);
		if (format === "markdown")
			expect(before.content).toBe("# Owned heading\n\nBody\n");
	},
);

it.each(["text/plain", "text/markdown"])(
	"does not interpret literal %s source-label markup as real anchors",
	(mime) => {
		const source = '<a href="/resource" aria-label="Literal label"></a>';
		const tree = reader(source, "default", mime);
		const before = extractDocument(tree, { format: "json" });
		expect(discoverDocumentLinks(tree, "resource").entries).toEqual([]);
		expect(extractDocument(tree, { format: "json" })).toEqual(before);
		expect(tree.textContent(tree.root)).toContain(source);
	},
);

it.each<{
	name: string;
	attributes: Record<string, string>;
	expected:
		| { attribute: "aria-label" | "title"; text: string; truncated: boolean }
		| undefined;
}>([
	{
		name: "aria-label before title",
		attributes: { "aria-label": "Authored", title: "Fallback" },
		expected: { attribute: "aria-label", text: "Authored", truncated: false },
	},
	{
		name: "title without aria-label",
		attributes: { title: "Fallback" },
		expected: { attribute: "title", text: "Fallback", truncated: false },
	},
	{
		name: "blank aria-label falls back",
		attributes: { "aria-label": " \t\r\n ", title: "Fallback" },
		expected: { attribute: "title", text: "Fallback", truncated: false },
	},
	{
		name: "both labels blank",
		attributes: { "aria-label": "\t", title: " \n " },
		expected: undefined,
	},
	{
		name: "overlong aria-label falls back",
		attributes: { "aria-label": "a".repeat(8193), title: "Fallback" },
		expected: { attribute: "title", text: "Fallback", truncated: false },
	},
	{
		name: "exact 8192-unit attribute admitted",
		attributes: { "aria-label": "a".repeat(8192), title: "Fallback" },
		expected: {
			attribute: "aria-label",
			text: "a".repeat(16),
			truncated: true,
		},
	},
	{
		name: "both attributes overlong",
		attributes: { "aria-label": "a".repeat(8193), title: "b".repeat(8193) },
		expected: undefined,
	},
	{
		name: "normalized authored whitespace",
		attributes: { "aria-label": " \tAlpha\n\r Beta\u00a0 " },
		expected: { attribute: "aria-label", text: "Alpha Beta", truncated: false },
	},
])("selects bounded source provenance: $name", ({ attributes, expected }) => {
	const { tree } = anchor(attributes, " \t\n ");
	const entry = discoverDocumentLinks(tree, "resource", {
		maxLabelCodeUnits: 16,
	}).entries[0];
	if (expected === undefined) expect(entry).not.toHaveProperty("sourceLabel");
	else expect(entry.sourceLabel).toEqual(expected);
	expect(entry).toMatchObject({ label: "", labelTruncated: false });
});

it.each([
	["\u0001", "\\u{1}"],
	["\u200b", "\\u{200b}"],
	["\u202e", "\\u{202e}"],
])(
	"escapes authored Cc/Cf character %j without making body text",
	(value, escaped) => {
		const { tree } = anchor({ "aria-label": `A${value}B` });
		const entry = discoverDocumentLinks(tree, "resource").entries[0];
		expect(entry.sourceLabel).toEqual({
			attribute: "aria-label",
			text: `A${escaped}B`,
			truncated: false,
		});
		for (const cap of [escaped.length, escaped.length + 1]) {
			expect(
				discoverDocumentLinks(tree, "resource", { maxLabelCodeUnits: cap })
					.entries[0].sourceLabel,
			).toEqual({
				attribute: "aria-label",
				text: cap === escaped.length ? "A" : `A${escaped}`,
				truncated: true,
			});
		}
		expect(extractDocument(tree).content).toBe("");
	},
);

it.each([
	{ value: "😀x", cap: 1, text: "", truncated: true },
	{ value: "😀x", cap: 2, text: "😀", truncated: true },
	{ value: "😀x", cap: 3, text: "😀x", truncated: false },
	{ value: "A😀Z", cap: 2, text: "A", truncated: true },
])(
	"bounds source-label UTF-16 without splitting pairs: $value at $cap",
	(sample) => {
		const { tree } = anchor({ title: sample.value });
		const entry = discoverDocumentLinks(tree, "resource", {
			maxLabelCodeUnits: sample.cap,
		}).entries[0];
		expect(entry.sourceLabel).toEqual({
			attribute: "title",
			text: sample.text,
			truncated: sample.truncated,
		});
		expect(entry.sourceLabel?.text.length).toBeLessThanOrEqual(sample.cap);
		expect(entry.labelTruncated).toBe(false);
	},
);

it.each(["Visible", " \tVisible\n text "])(
	"keeps collected labels authoritative for %j",
	(text) => {
		const { tree } = anchor(
			{ "aria-label": "Authored", title: "Fallback" },
			text,
		);
		const entry = discoverDocumentLinks(tree, "resource").entries[0];
		expect(entry.label).toBe(text.replace(/\s+/g, " ").trim());
		expect(entry).not.toHaveProperty("sourceLabel");
		expect(entry.labelTruncated).toBe(false);
		const bounded = discoverDocumentLinks(tree, "resource", {
			maxLabelCodeUnits: 8,
		}).entries[0];
		expect(bounded.label).not.toBe("");
		expect(bounded).not.toHaveProperty("sourceLabel");
		expect(bounded.labelTruncated).toBe(text.length > 8);
	},
);

it("matches only resolved URL substrings, never source labels", () => {
	const { tree } = anchor({
		"aria-label": "LabelNeedle",
		title: "TitleNeedle",
	});
	for (const query of ["LabelNeedle", "TitleNeedle", "aria-label"])
		expect(discoverDocumentLinks(tree, query).entries).toEqual([]);
	expect(discoverDocumentLinks(tree, "ReSoUrCe").entries).toHaveLength(1);
});

it.each([
	"javascript:resource()",
	"data:text/plain,resource",
	"https://user:secret@example.invalid/resource",
	"/res\u0000ource",
])("does not admit unsafe href %j because it has an authored label", (href) => {
	const { tree } = anchor({ href, "aria-label": "Useful resource" });
	expect(discoverDocumentLinks(tree, "resource").entries).toEqual([]);
});

it("preserves original refs and makes no document mutations during discovery", () => {
	const { tree, target } = anchor({ "aria-label": "Authored" });
	const revision = tree.revision;
	const nodeCount = tree.nodeCount;
	const entry = discoverDocumentLinks(tree, "resource").entries[0];
	expect(entry.ref).toBe(tree.reference(target));
	expect(entry.url).toBe("https://source-label.fixture.invalid/resource");
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(nodeCount);
	expect(tree.get(target).attributes["aria-label"]).toBe("Authored");
});

it("charges source-label UTF-8 metadata to the existing JSON byte limit", () => {
	const { tree } = anchor({ "aria-label": "😀".repeat(60) });
	const result = discoverDocumentLinks(tree, "resource");
	const bytes = encoder.encode(JSON.stringify(result)).byteLength;
	expect(bytes).toBeGreaterThan(256);
	expect(discoverDocumentLinks(tree, "resource", { maxBytes: bytes })).toEqual(
		result,
	);
	rejects(
		() => discoverDocumentLinks(tree, "resource", { maxBytes: bytes - 1 }),
		"resource-limit",
	);
});

it.each([{ maxNodes: 1 }, { maxDepth: 0 }])(
	"keeps structural discovery limit %j for labeled empty anchors",
	(limits) => {
		const { tree } = anchor({ "aria-label": "Authored" });
		rejects(
			() => discoverDocumentLinks(tree, "resource", limits),
			"resource-limit",
		);
	},
);

it("keeps the entry limit without merging or fabricating labeled links", () => {
	const tree = reader(
		`${iconLink}${iconLink.replace('id="resource"', 'id="second"')}`,
	);
	const result = discoverDocumentLinks(tree, "resource", { maxEntries: 1 });
	expect(result.truncated).toBe(true);
	expect(result.entries).toHaveLength(1);
	expect(result.entries[0]).toMatchObject({
		ref: tree.reference(node(tree, "#resource")),
		label: "",
		labelTruncated: false,
		sourceLabel: { attribute: "aria-label", text: "Explore resources" },
	});
});

it.each(["aborted", "timeout"] as const)(
	"honors %s at a discovery checkpoint with authored labels",
	(code) => {
		const { tree } = anchor({ "aria-label": "Authored" });
		let calls = 0;
		const checkpoint = vi.fn(() => {
			if (++calls === 3)
				throw new AgentBrowserError(code, "Fixture checkpoint");
		});
		rejects(
			() => discoverDocumentLinks(tree, "resource", { checkpoint }),
			code,
		);
		expect(checkpoint).toHaveBeenCalledTimes(3);
	},
);

it.each(["receipt", "body-bytes", "body-sha256"] as const)(
	"rejects changed %s pins before loading source labels",
	async (pin) => {
		const original = await fixture();
		const trusted: TrustedResearchReplayAdmission = {
			...original.trusted,
			...(pin === "receipt"
				? { expectedReceiptSha256: "0".repeat(64) }
				: {
						expectedBody: {
							bytes: original.body.byteLength + (pin === "body-bytes" ? 1 : 0),
							sha256:
								pin === "body-sha256" ? "0".repeat(64) : hash(original.body),
						},
					}),
		};
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay({ ...original, trusted }), "invalid-input");
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(["default", "long-v1"] as const)(
	"replays pinned %s raw captures as metadata without executing raw text",
	async (profile) => {
		const source = `${heading}<script>const sample = '<a href="/resource-fake" aria-label="RAW_PRIVATE"></a>';</script><main>${iconLink}</main>`;
		const input = await fixture(source, profile);
		const ownership = observeAdmittedBody();
		const result = replay(input);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "link-url-search", matches: 1 },
			reader: { scripting: false, rawTextPolicy: rawPolicy },
		});
		expect(result.report.links?.entries).toHaveLength(1);
		expect(result.report.links?.entries[0]).toMatchObject({
			label: "",
			labelTruncated: false,
			sourceLabel: {
				attribute: "aria-label",
				text: "Explore resources",
				truncated: false,
			},
		});
		expect(result.jsonl).not.toContain("RAW_PRIVATE");
		expect(result.report).not.toHaveProperty("extraction");
		ownership();
	},
);

it("retains unfiltered source-label challenge evidence under visibility filtering", async () => {
	const source = `<title>Just a moment...</title>${heading}<p>${"x".repeat(8192)}</p><a hidden href="/resource" aria-label="Checking your browser"><svg></svg></a>`;
	const input = await fixture(source, "default", {
		readerVisibilityPolicy: "source-hidden-v1",
	});
	const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
	const ownership = observeAdmittedBody();
	rejects(() => replay(input), "policy-denied");
	expect(
		classify.mock.calls.some(([value]) =>
			value.text?.includes("Checking your browser"),
		),
	).toBe(true);
	expect(input.report.primaryResponse?.status).toBe(200);
	expect(input.report.classification.barrier).toBeNull();
	ownership();
});

it.each(["aria-label", "title"])(
	"detects real HTML %s challenge labels beyond the body diagnostic prefix",
	async (attribute) => {
		const source = `<title>Just a moment...</title>${heading}<p>${"x".repeat(8192)}</p><a href="/resource" ${attribute}="Checking your browser"><svg></svg></a>`;
		const input = await fixture(source);
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const ownership = observeAdmittedBody();
		const result = replay(input);
		expect(classify.mock.calls[0][0].text).not.toContain(
			"Checking your browser",
		);
		expect(
			classify.mock.calls.some(([value]) =>
				value.text?.includes("Checking your browser"),
			),
		).toBe(true);
		expect(result.report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			selection: { method: "link-url-search", matches: 1 },
		});
		expect(result.report.links?.entries[0]).toMatchObject({
			label: "",
			sourceLabel: { attribute, text: "Checking your browser" },
		});
		ownership();
	},
);

it("emits source-label metadata through the native replay CLI with memory streams", async () => {
	const input = await fixture();
	const bodyPin = input.trusted.expectedBody;
	if (!bodyPin) throw new Error("Missing fixture body pin");
	const source = Readable.from(
		[input.raw.subarray(0, 19), input.raw.subarray(19)],
		{
			objectMode: false,
		},
	);
	const chunks: Buffer[] = [];
	const output = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const stream of [source, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	const ownership = observeAdmittedBody();
	expect(
		await runResearchReplayCli(
			[
				"--expected-profile",
				input.trusted.expectedProfile,
				"--receipt-sha256",
				input.trusted.expectedReceiptSha256,
				"--body-sha256",
				bodyPin.sha256,
				"--body-bytes",
				String(bodyPin.bytes),
				"--links",
				"resource",
			],
			source,
			output,
		),
	).toBe(0);
	const text = Buffer.concat(chunks).toString("utf8");
	expect(text.split("\n")).toHaveLength(2);
	expect(JSON.parse(text)).toMatchObject({
		networkRequests: 0,
		contentSuccess: null,
		source: {
			receiptSha256: input.trusted.expectedReceiptSha256,
			body: bodyPin,
		},
		links: {
			entries: [
				{
					label: "",
					sourceLabel: {
						attribute: "aria-label",
						text: "Explore resources",
						truncated: false,
					},
				},
			],
		},
	});
	expect(text).not.toContain('"bodyCapture"');
	ownership();
});

it.each(["failure", "challenge", "missing-capture"])(
	"refuses %s evidence rather than recovering source labels from it",
	async (reason) => {
		const original = await fixture();
		const report = structuredClone(original.report);
		if (reason === "failure") {
			report.outcome = "failure";
			report.contentSuccess = false;
			report.failure = { category: "unsupported", stage: "extraction" };
		} else if (reason === "challenge") {
			report.outcome = "semantic-barrier";
			report.contentSuccess = false;
			report.classification.barrier = "challenge";
		} else Reflect.deleteProperty(report, "bodyCapture");
		const serialized = serializeResearchReport(report, "default");
		expect(serialized.disposition).toBe("complete");
		const input = {
			...original,
			report,
			raw: serialized.jsonl,
			trusted: {
				...original.trusted,
				expectedReceiptSha256: hash(serialized.jsonl),
			},
		};
		const load = vi.spyOn(loader, "loadResearchDocument");
		rejects(() => replay(input), "policy-denied");
		expect(load).not.toHaveBeenCalled();
	},
);

it("wipes admitted bytes and closes the tree when labeled discovery fails", async () => {
	const input = await fixture();
	const ownership = observeAdmittedBody();
	const before = vi.mocked(DocumentTree.prototype.close).mock.calls.length;
	vi.spyOn(extraction, "discoverDocumentLinks").mockImplementationOnce(() => {
		throw new AgentBrowserError(
			"resource-limit",
			"Fixture source-label budget",
		);
	});
	rejects(() => replay(input), "resource-limit");
	expect(DocumentTree.prototype.close).toHaveBeenCalledTimes(before + 1);
	ownership();
});

it("rejects cancelled source-label replay before capture admission", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error("Private cancellation detail"));
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	rejects(() => replay(input, controller.signal), "aborted");
	expect(validate).not.toHaveBeenCalled();
});
