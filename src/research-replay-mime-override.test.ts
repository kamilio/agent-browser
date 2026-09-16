import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import * as visibility from "../scripts/research-visibility.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";

const encoder = new TextEncoder();
const url = "https://replay-mime-override.fixture.invalid/article";
const policy = "markdown-html-document-v1";
const override = { readerMimePolicy: policy } as const;
const focus = { contentFocus: "main-content-v1" } as const;
const prefixPolicy = { outputLimitPolicy: "text-prefix-v1" } as const;
const formats = ["json", "markdown"] as const;
const prefix = '<!DOCTYPE html><html lang="en"><head>';
const content =
	'<main><h2 id="owned">Owned heading</h2><p>Café 日本語 evidence.<p>Repaired paragraph <a href="/details">Details</a><script>PRIVATE_SCRIPT_MARKER</script><style>PRIVATE_STYLE_MARKER</style></main>';
const source = `${prefix}<title>Saved article</title></head><body><nav>Outside navigation</nav>${content}<h2>Next section</h2><footer>Outside footer</footer></body></html>`;
const interpretation = {
	policy,
	declaredMime: "text/markdown",
	effectiveMime: "text/html",
	basis: "html5-doctype-root-prefix",
	prefixCodeUnits: prefix.length,
};
const selections = [
	{ selection: { selector: "main" }, method: "css-selector", matches: 1 },
	{ selection: { section: "#owned" }, method: "heading-section", matches: 1 },
	{ selection: focus, method: "content-focus", matches: null },
] as const;

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
			throw new Error("MIME override replay must not fetch");
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

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	text = source,
	options: {
		mime?: string;
		capturedPolicy?: boolean;
		visibility?: ResearchReaderVisibilityPolicy;
		profile?: ResearchDocumentProfileId;
		utf16?: boolean;
		fallback?: boolean;
		captureFirstLine?: boolean;
	} = {},
): Promise<Fixture> {
	const body = options.utf16
		? new Uint8Array(Buffer.from(text, "utf16le"))
		: encoder.encode(text);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: {
			"content-type": [
				options.mime ??
					`text/markdown; charset=${options.utf16 ? "utf-16le" : "utf-8"}`,
			],
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
		undefined,
		true,
		options.captureFirstLine ? { start: 1, end: 1 } : undefined,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.capturedPolicy ? override : {}),
			...(options.visibility
				? { readerVisibilityPolicy: options.visibility }
				: {}),
			...(options.fallback ? { readerFallbackEncoding: "utf-8" as const } : {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.outcome).toBe("extracted-unverified");
	expect(hash(body)).toBe(
		hash(options.utf16 ? Buffer.from(text, "utf16le") : encoder.encode(text)),
	);
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		raw: serialized.jsonl,
		body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
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

function replaceBody(input: Fixture, text: string): Fixture {
	const body = encoder.encode(text);
	const changed = revised(input, (report) => {
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

function execute(
	input: Fixture,
	selection: unknown = { ...focus, ...override },
	format: replay.ResearchReplayFormat = "json",
) {
	const reportHash = hash(encoder.encode(JSON.stringify(input.report)));
	const rawHash = hash(input.raw);
	const bodyHash = hash(input.body);
	const headers = structuredClone(input.report.primaryResponse?.headers);
	const trusted = structuredClone(input.trusted);
	try {
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection as replay.ResearchJsonReplaySelection,
			undefined,
			format,
		);
		expect(result).not.toBeInstanceOf(Promise);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: url,
				receiptSha256: rawHash,
				body: input.trusted.expectedBody,
			},
		});
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
			expect(result.jsonl).not.toContain(`"${key}"`);
		return result;
	} finally {
		expect(hash(encoder.encode(JSON.stringify(input.report)))).toBe(reportHash);
		expect(hash(input.raw)).toBe(rawHash);
		expect(hash(input.body)).toBe(bodyHash);
		expect(input.report.primaryResponse?.headers).toEqual(headers);
		expect(input.trusted).toEqual(trusted);
	}
}

function observeOwnership(
	mutate?: (metadata: Record<string, unknown>) => void,
) {
	const bodies: Uint8Array[] = [];
	const validate = admission.validateResearchReplayAdmission;
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
		assert(trees: number, captures = 1) {
			expect(bodies).toHaveLength(captures);
			for (const body of bodies) {
				expect(body.byteLength).toBeGreaterThan(0);
				expect(body.every((value) => value === 0)).toBe(true);
			}
			expect(close).toHaveBeenCalledTimes(trees);
			for (const tree of close.mock.contexts) {
				if (!(tree instanceof DocumentTree)) throw new Error("Expected tree");
				expect(tree.mutationMetrics().closed).toBe(true);
				expect(loader.researchReaderInfo(tree)).toBeUndefined();
			}
		},
	};
}

it.each(
	selections.flatMap((context) =>
		formats.flatMap((format) =>
			[false, true].map((utf16) => ({ ...context, format, utf16 })),
		),
	),
)(
	"explicitly interprets $method as $format (utf16=$utf16) without rewriting evidence",
	async ({ selection, method, matches, format, utf16 }) => {
		const input = await fixture(source, { utf16 });
		expect(input.report).not.toHaveProperty("readerMimePolicy");
		expect(input.report.reader).not.toHaveProperty("mimeInterpretation");
		expect(input.report.reader).not.toHaveProperty("mimePolicy");
		const ownership = observeOwnership();
		const result = execute(input, { ...selection, ...override }, format);
		expect(result.report.selection).toEqual({ method, matches, ...override });
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			reader: { mimePolicy: policy, mimeInterpretation: interpretation },
			extraction: { format },
		});
		const output =
			typeof result.report.extraction?.content === "string"
				? result.report.extraction.content
				: JSON.stringify(result.report.extraction?.content);
		for (const text of [
			"Owned heading",
			format === "markdown"
				? "Café 日本語 evidence\\."
				: "Café 日本語 evidence.",
			"Repaired paragraph",
		])
			expect(output).toContain(text);
		for (const text of [
			"Outside",
			"PRIVATE_SCRIPT_MARKER",
			"PRIVATE_STYLE_MARKER",
		])
			expect(output).not.toContain(text);
		expect(result.report.reader?.omittedSubtrees).toMatchObject({
			script: 1,
			style: 1,
		});
		if (method === "content-focus")
			expect(result.report.extraction?.contentSelection).toMatchObject({
				policy: "main-content-v1",
				selected: "main",
				reason: "unique-main",
			});
		else
			expect(result.report.extraction).not.toHaveProperty("contentSelection");
		expect(ownership.load.mock.calls[0][0].headers).toEqual(
			input.report.primaryResponse?.headers,
		);
		expect(input.report.primaryResponse?.bodySha256).toBe(hash(input.body));
		ownership.assert(1);
	},
);

it("leaves ordinary HTML rejection and literal Markdown replay unchanged without an override", async () => {
	const input = await fixture();
	const ownership = observeOwnership();
	for (const { selection } of selections)
		expect(() => execute(input, selection)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	expect(ownership.load).not.toHaveBeenCalled();
	const literal = execute(input, { lines: { start: 1, end: 1 } });
	expect(literal.report.reader).toEqual(input.report.reader);
	expect(literal.jsonl).toContain("PRIVATE_SCRIPT_MARKER");
	expect(literal.report.selection).not.toHaveProperty("readerMimePolicy");
	ownership.assert(1, 4);
});

it("recognizes a complete HTML5 document whose root starts with body rather than head", async () => {
	const bodyPrefix = "<!DOCTYPE html><html><body>";
	const input = await fixture(`${bodyPrefix}${content}</body></html>`);
	const ownership = observeOwnership();
	const result = execute(input);
	expect(result.report.reader?.mimeInterpretation).toEqual({
		...interpretation,
		prefixCodeUnits: bodyPrefix.length,
	});
	expect(result.jsonl).toContain("Owned heading");
	ownership.assert(1);
});

it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"validates literal visibility but reports interpreted HTML counters for %s",
	async (visibilityPolicy) => {
		const input = await fixture(
			source.replace(
				content,
				`<main hidden>Hidden main</main>${content.replace("<script>", "<p hidden>Hidden descendant</p><script>")}`,
			),
			{ visibility: visibilityPolicy },
		);
		expect(input.report.reader).toMatchObject({
			visibilityPolicy,
			hiddenContentSemantics: false,
			sourceHiddenSubtrees: 0,
		});
		const ownership = observeOwnership();
		const result = execute(input);
		expect(result.report.reader).toMatchObject({
			visibilityPolicy,
			hiddenContentSemantics:
				visibilityPolicy === "source-hidden-v1"
					? "source-attributes"
					: "source-attributes-and-inline-display",
			sourceHiddenSubtrees: 2,
			mimeInterpretation: interpretation,
		});
		expect(result.report.extraction?.contentSelection).toMatchObject({
			selected: "main",
			reason: "unique-main",
		});
		expect(result.jsonl).not.toContain("Hidden main");
		expect(result.jsonl).not.toContain("Hidden descendant");
		ownership.assert(2);
	},
);

it.each([
	["hiddenContentSemantics", "source-attributes-and-inline-display"],
	["sourceHiddenSubtrees", 1],
	["sourceHiddenSubtrees", -1],
	["sourceHiddenSubtrees", "0"],
])(
	"rejects forged literal visibility %s=%s before loading",
	async (field, value) => {
		const original = await fixture(source, {
			visibility: "source-hidden-inline-v1",
		});
		const input = revised(original, (report) => {
			(report.reader as Record<string, unknown>)[field as string] = value;
		});
		const ownership = observeOwnership();
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it("checks hidden challenges with effective HTML MIME before filtered extraction", async () => {
	const original = await fixture(source, {
		visibility: "source-hidden-inline-v1",
	});
	const input = replaceBody(
		original,
		`${prefix}<title style="display:none">Security check</title></head><body><aside hidden>Verify you are human</aside>${content}</body></html>`,
	);
	const ownership = observeOwnership();
	const check = vi.spyOn(visibility, "researchVisibilityEvidence");
	const extract = vi.spyOn(extraction, "extractDocument");
	expect(() => execute(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(check.mock.calls[0][5]).toBe(policy);
	expect(check.mock.results[0].value?.diagnostic?.kind).toBe("challenge");
	expect(extract).not.toHaveBeenCalled();
	expect(ownership.load).toHaveBeenCalledOnce();
	ownership.assert(1);
});

it("classifies interpreted challenges without relabelling the original response", async () => {
	const original = await fixture();
	const input = replaceBody(
		original,
		`${prefix}<title>Security check</title></head><body><main>Verify you are human</main></body></html>`,
	);
	const ownership = observeOwnership();
	const result = execute(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
		selection: { ...override },
	});
	expect(result.report.classification.diagnostic?.evidence).toContain(
		"reader-mime-interpretation",
	);
	ownership.assert(1);
});

it("forwards table flags while preserving their JSON and Markdown contracts", async () => {
	const input = await fixture(
		source.replace(
			content,
			'<main><h2 id="owned">Owned</h2><table><tr><th scope="col">Name</th></tr><tr><td>Value</td></tr></table></main>',
		),
	);
	const ownership = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	const json = execute(input, { ...focus, ...override, tableMetadata: true });
	expect(JSON.stringify(json.report.extraction?.content)).toContain(
		'"tableSource"',
	);
	expect(extract.mock.calls.at(-1)?.[1]).toMatchObject({
		...focus,
		tableMetadata: true,
	});
	for (const tableRows of [false, true]) {
		const result = execute(
			input,
			{ ...focus, ...override, tableRows, compactTables: true },
			"markdown",
		);
		expect(result.report.extraction).toMatchObject({
			format: "markdown",
			compactTables: true,
		});
		expect(result.report.extraction?.content).toContain("Value");
		expect(extract.mock.calls.at(-1)?.[1]).toMatchObject({
			...focus,
			tableRows,
			compactTables: true,
		});
	}
	const validate = vi.mocked(admission.validateResearchReplayAdmission);
	validate.mockClear();
	for (const [flags, format] of [
		[{ tableMetadata: true }, "markdown"],
		[{ tableRows: true }, "json"],
		[{ compactTables: true }, "json"],
	] as const)
		expect(() =>
			execute(input, { ...focus, ...override, ...flags }, format),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
	ownership.assert(3, 3);
});

it("keeps content-focus document fallback after explicit interpretation", async () => {
	const input = await fixture(
		source.replace(
			content,
			"<main>First candidate</main><main>Second candidate</main>",
		),
	);
	const ownership = observeOwnership();
	for (const format of formats) {
		const result = execute(input, { ...focus, ...override }, format);
		expect(result.report.extraction?.contentSelection).toMatchObject({
			policy: "main-content-v1",
			selected: "document",
			reason: "ambiguous-main",
			mainCandidates: 2,
			articleCandidates: 0,
		});
		expect(result.jsonl).toContain("First candidate");
		expect(result.jsonl).toContain("Second candidate");
		expect(result.jsonl).toContain("Outside footer");
	}
	ownership.assert(2, 2);
});

it.each(selections)(
	"records both requested policies for fitting $method Markdown without fallback metadata",
	async ({ selection, method, matches }) => {
		const input = await fixture();
		const ownership = observeOwnership();
		const strict = execute(input, { ...selection, ...override }, "markdown");
		const optedIn = execute(
			input,
			{ ...selection, ...override, ...prefixPolicy },
			"markdown",
		);
		expect(optedIn.report.selection).toEqual({
			method,
			matches,
			...override,
			...prefixPolicy,
		});
		expect({
			...optedIn.report.extraction,
			document: undefined,
			scope: undefined,
			sectionSelection: optedIn.report.extraction?.sectionSelection
				? {
						...optedIn.report.extraction.sectionSelection,
						heading: typeof optedIn.report.extraction.sectionSelection.heading,
						end:
							optedIn.report.extraction.sectionSelection.end === null
								? null
								: typeof optedIn.report.extraction.sectionSelection.end,
					}
				: undefined,
		}).toEqual({
			...strict.report.extraction,
			document: undefined,
			scope: undefined,
			sectionSelection: strict.report.extraction?.sectionSelection
				? {
						...strict.report.extraction.sectionSelection,
						heading: typeof strict.report.extraction.sectionSelection.heading,
						end:
							strict.report.extraction.sectionSelection.end === null
								? null
								: typeof strict.report.extraction.sectionSelection.end,
					}
				: undefined,
		});
		expect(optedIn.report.extraction).not.toHaveProperty("contentFallback");
		expect(optedIn.report).not.toHaveProperty("recovery");
		ownership.assert(2, 2);
	},
);

it("keeps the real output cap and uses an explicit bounded Markdown text prefix", async () => {
	const text = "Selected evidence 界. ".repeat(16_000);
	const input = await fixture(
		`${prefix}\n<title>Saved article</title></head><body><nav>Outside navigation</nav><main><h2 id="owned">Selected heading</h2><p>${text}</p><p>Unretained suffix</p></main></body></html>`,
		{ captureFirstLine: true },
	);
	expect(input.body.byteLength).toBeLessThan(512_000);
	const ownership = observeOwnership();
	for (const format of formats)
		expect(() => execute(input, { ...focus, ...override }, format)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	const result = execute(
		input,
		{ ...focus, ...override, ...prefixPolicy },
		"markdown",
	);
	expect(result.report.selection).toEqual({
		method: "content-focus",
		matches: null,
		...override,
		...prefixPolicy,
	});
	const output = result.report.extraction;
	if (output?.format !== "markdown")
		throw new Error("Expected Markdown prefix");
	expect(output.contentFallback).toMatchObject({
		policy: "text-prefix-v1",
		representation: "indented-plain-text",
		truncated: true,
		trigger: { kind: "extraction.output", unit: "bytes", limit: 256_000 },
	});
	expect(output.contentFallback?.trigger.observed).toBeGreaterThan(256_000);
	expect(output.contentFallback?.retainedCodeUnits).toBeGreaterThan(0);
	expect(output.contentFallback?.retainedCodeUnits).toBeLessThan(text.length);
	expect(encoder.encode(JSON.stringify(output)).byteLength).toBeLessThanOrEqual(
		256_000,
	);
	expect(output.content).toContain("Selected heading");
	expect(output.content).toContain("Selected evidence 界");
	expect(output.content).not.toContain("Outside");
	expect(output.content).not.toContain("Unretained suffix");
	expect(output.content.endsWith("\n")).toBe(true);
	for (const line of output.content.slice(0, -1).split("\n"))
		expect(line.startsWith("    ")).toBe(true);
	expect(result.report).not.toHaveProperty("recovery");
	ownership.assert(3, 3);
});

it("rejects invalid policy values, including explicit undefined, before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const readerMimePolicy of [
		undefined,
		null,
		false,
		true,
		0,
		1,
		"",
		"text/html",
		"markdown-html-document-v2",
		` ${policy}`,
		`${policy} `,
		[],
		[policy],
		{},
		Object(policy),
	])
		expect(() => execute(input, { ...focus, readerMimePolicy })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects accessor, inherited and proxy selections without invoking user code", async () => {
	const input = await fixture();
	const trap = vi.fn(() => {
		throw new Error("Do not invoke selection code");
	});
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const revoked = Proxy.revocable({ ...focus, ...override }, {});
	revoked.revoke();
	for (const selection of [
		new Proxy(
			{ ...focus, ...override },
			{
				get: trap,
				ownKeys: trap,
				getPrototypeOf: trap,
				getOwnPropertyDescriptor: trap,
			},
		),
		revoked.proxy,
		Object.defineProperty({ ...focus }, "readerMimePolicy", {
			get: trap,
			enumerable: true,
		}),
		Object.defineProperty({ ...focus }, "readerMimePolicy", { get: trap }),
		Object.assign(Object.create(override), focus),
		{ ...focus, readerMimePolicy: { toString: trap, valueOf: trap } },
		{ ...focus, readerMimePolicy: new Proxy(Object(policy), { get: trap }) },
	])
		expect(() => execute(input, selection)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(trap).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

it("rejects text, links, headings, mixed selectors and JSON output fallback before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const format of formats)
		for (const selection of [
			{ lines: { start: 1, end: 1 } },
			{ find: "Owned" },
			{ links: "details" },
			{ headings: true },
			{},
			{ ...focus, selector: "main" },
			{ ...focus, links: undefined },
			{ ...focus, section: undefined },
		])
			expect(() =>
				execute(input, { ...selection, ...override }, format),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		execute(input, { ...focus, ...override, ...prefixPolicy }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
});

it.each([
	{ name: "genuine Markdown", text: "# Owned Markdown\n[Details](/details)" },
	{ name: "fenced document", text: `\`\`\`html\n${source}\n\`\`\`` },
	{ name: "indented document", text: `    ${source}` },
	{ name: "fragment", text: "<main>HTML fragment, not a document</main>" },
	{ name: "missing root", text: "<!DOCTYPE html><main>Missing root</main>" },
	{
		name: "missing head/body",
		text: "<!DOCTYPE html><html><main>Missing head or body prefix</main></html>",
	},
	{
		name: "prefix code-unit cap",
		text: `<!DOCTYPE html><!--${"x".repeat(4096)}--><html><body>Beyond prefix cap</body></html>`,
	},
	{
		name: "prefix token cap",
		text: `<!DOCTYPE html>${"<!--gap-->".repeat(65)}<html><body>Beyond token cap</body></html>`,
	},
])("does not interpret unrecognized Markdown: $name", async ({ text }) => {
	const input = await fixture(text);
	const ownership = observeOwnership();
	expect(() => execute(input)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	ownership.assert(1);
});

it.each(["text/plain; charset=utf-8", "text/html; charset=utf-8"])(
	"rejects non-Markdown %s even when bytes look like HTML",
	async (mime) => {
		const input = await fixture(source, { mime });
		const ownership = observeOwnership();
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each([
	{ name: "empty", values: [] },
	{ name: "duplicate", values: ["text/markdown", "text/markdown"] },
	{ name: "conflicting", values: ["text/markdown", "text/html"] },
	{ name: "comma-joined", values: ["text/markdown, text/html"] },
	{ name: "missing", values: undefined },
])("rejects $name captured Content-Type", async ({ values }) => {
	const original = await fixture();
	const input = revised(original, (report) => {
		const headers = (
			report.primaryResponse as { headers: Record<string, string[]> }
		).headers;
		if (values === undefined) Reflect.deleteProperty(headers, "content-type");
		else headers["content-type"] = values;
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => execute(input)).toThrow(
		expect.objectContaining({
			code: values?.length === 0 ? "invalid-input" : "unsupported",
		}),
	);
	expect(load).not.toHaveBeenCalled();
});

it("rejects long-v1 regardless of a re-pinned Markdown declaration", async () => {
	const original = await fixture(source, {
		profile: "long-v1",
		mime: "text/html; charset=utf-8",
	});
	const markdown = revised(original, (report) => {
		(report.primaryResponse as { headers: Record<string, string[]> }).headers[
			"content-type"
		] = ["text/markdown; charset=utf-8"];
	});
	const ownership = observeOwnership();
	for (const input of [original, markdown])
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0, 1);
});

it("rejects any prior captured policy while keeping already-interpreted ordinary replay", async () => {
	const original = await fixture();
	const captured = await fixture(source, { capturedPolicy: true });
	const requestedOnly = revised(original, (report) => {
		report.readerMimePolicy = policy;
	});
	const nestedOnly = revised(captured, (report) => {
		Reflect.deleteProperty(report, "readerMimePolicy");
	});
	const interpretationOnly = revised(original, (report) => {
		(report.reader as Record<string, unknown>).mimeInterpretation =
			interpretation;
	});
	const ownership = observeOwnership();
	for (const input of [captured, requestedOnly, nestedOnly, interpretationOnly])
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(ownership.load).not.toHaveBeenCalled();
	for (const format of formats) {
		const result = execute(captured, focus, format);
		expect(result.report.reader).toEqual(captured.report.reader);
		expect(result.report.selection).not.toHaveProperty("readerMimePolicy");
	}
	ownership.assert(2, 6);
});

it.each(["top", "nested", "interpretation"])(
	"rejects malformed captured %s declarations rather than replacing them",
	async (location) => {
		const original = await fixture();
		const ownership = observeOwnership();
		const values = [
			null,
			false,
			1,
			"",
			"unknown-policy",
			[],
			{},
			{ ...interpretation, prefixCodeUnits: 0 },
		];
		for (const value of values) {
			const input = revised(original, (report) => {
				if (location === "top") report.readerMimePolicy = value;
				else
					(report.reader as Record<string, unknown>)[
						location === "nested" ? "mimePolicy" : "mimeInterpretation"
					] = value;
			});
			expect(() => execute(input)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0, values.length);
	},
);

it.each(["top", "nested", "interpretation"])(
	"rejects own undefined captured %s evidence at the admission boundary",
	async (location) => {
		const input = await fixture();
		const ownership = observeOwnership((metadata) => {
			if (location === "top") metadata.readerMimePolicy = undefined;
			else
				(metadata.reader as Record<string, unknown>)[
					location === "nested" ? "mimePolicy" : "mimeInterpretation"
				] = undefined;
		});
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it("retains fallback charset evidence checks after interpreting the original bytes", async () => {
	const original = await fixture(source, { fallback: true });
	const changed = revised(original, (report) => {
		(report.reader as Record<string, unknown>).encoding = "windows-1252";
	});
	const ownership = observeOwnership();
	const result = execute(original);
	expect(result.report.reader).toMatchObject({
		encoding: "utf-8",
		fallbackEncoding: "utf-8",
		mimeInterpretation: interpretation,
	});
	expect(() => execute(changed)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	ownership.assert(2, 2);
});

it("does not admit failed, partial, HTTP, barrier or missing-body captures", async () => {
	const original = await fixture();
	const mutations: Array<(report: Record<string, unknown>) => void> = [
		(report) => {
			report.outcome = "failure";
			report.failure = { category: "unsupported", stage: "navigation" };
		},
		(report) => {
			report.outputLimit = { omitted: true };
		},
		(report) => {
			report.outcome = "http-failure";
			report.contentSuccess = false;
			(report.primaryResponse as { status: number }).status = 403;
		},
		(report) => {
			report.outcome = "semantic-barrier";
			report.contentSuccess = false;
			(report.classification as { barrier: string }).barrier = "challenge";
		},
		(report) => {
			Reflect.deleteProperty(report, "bodyCapture");
		},
	];
	const ownership = observeOwnership();
	for (const mutate of mutations)
		expect(() => execute(revised(original, mutate))).toThrow(
			expect.objectContaining({ code: "policy-denied" }),
		);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0, 0);
});

it("keeps receipt and body pins authoritative for tampered captures", async () => {
	const input = await fixture();
	const corrupted = revised(input, (report) => {
		(report.bodyCapture as { data: string }).data = Buffer.from(input.body)
			.fill(120)
			.toString("base64");
	});
	const changed = revised(input, (report) => {
		report.readerMimePolicy = policy;
	});
	changed.trusted = input.trusted;
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const trusted of [
		{ ...input.trusted, expectedReceiptSha256: "0".repeat(64) },
		{
			...input.trusted,
			expectedBody: { bytes: input.body.byteLength, sha256: "0".repeat(64) },
		},
		{
			...input.trusted,
			expectedBody: {
				bytes: input.body.byteLength + 1,
				sha256: hash(input.body),
			},
		},
	])
		expect(() => execute({ ...input, trusted })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	for (const tampered of [corrupted, changed])
		expect(() => execute(tampered)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(load).not.toHaveBeenCalled();
});

it("does not add MIME overrides to named output-limit or empty-outline recovery", async () => {
	const input = await fixture();
	const outputAdmission = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	const emptyAdmission = vi.spyOn(
		admission,
		"validateResearchEmptyOutlineAdmission",
	);
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const format of formats) {
		const section = { section: "#owned", ...override };
		expect(() =>
			replay.recoverResearchOutputLimitSection(
				input.raw,
				input.trusted,
				section,
				undefined,
				format,
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		const selector = { selector: "main", ...override };
		for (const recover of [
			() =>
				replay.recoverResearchOutputLimitSelector(
					input.raw,
					input.trusted,
					selector,
					undefined,
					format,
				),
			() =>
				replay.recoverResearchEmptyOutlineSelector(
					input.raw,
					input.trusted,
					selector,
					undefined,
					format,
				),
		])
			expect(recover).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
	}
	expect(outputAdmission).not.toHaveBeenCalled();
	expect(emptyAdmission).not.toHaveBeenCalled();
	expect(() =>
		replay.outlineResearchOutputLimitCapture(input.raw, input.trusted),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(load).not.toHaveBeenCalled();
});

it("closes the interpreted document and wipes its admitted body on extraction failure", async () => {
	const input = await fixture();
	const ownership = observeOwnership();
	const failure = new AgentBrowserError(
		"resource-limit",
		"Synthetic extraction failure",
	);
	vi.spyOn(extraction, "extractDocument").mockImplementationOnce(() => {
		throw failure;
	});
	expect(() => execute(input)).toThrow(failure);
	ownership.assert(1);
});

it("wipes its admitted body even when interpreted document close throws", async () => {
	const input = await fixture();
	const close = DocumentTree.prototype.close;
	const ownership = observeOwnership();
	vi.mocked(DocumentTree.prototype.close).mockImplementationOnce(function (
		this: DocumentTree,
	) {
		close.call(this);
		throw new AgentBrowserError("closed", "Synthetic close failure");
	});
	expect(() => execute(input)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	ownership.assert(1);
});

it.each([
	{ name: "true", value: true },
	{ name: "null", value: null },
	{ name: "unknown", value: "unknown-semantics" },
	{ name: "missing", value: undefined },
])(
	"rejects re-pinned policy-free $name literal visibility before loading",
	async ({ value }) => {
		const original = await fixture();
		expect(original.report).not.toHaveProperty("readerVisibilityPolicy");
		expect(original.report.reader).not.toHaveProperty("visibilityPolicy");
		expect(original.report.reader).not.toHaveProperty("sourceHiddenSubtrees");
		const input = revised(original, (report) => {
			const reader = report.reader as Record<string, unknown>;
			if (value === undefined)
				Reflect.deleteProperty(reader, "hiddenContentSemantics");
			else reader.hiddenContentSemantics = value;
		});
		const ownership = observeOwnership();
		expect(() => execute(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it("rejects a re-pinned null policy-free reader before loading", async () => {
	const original = await fixture();
	expect(original.report).not.toHaveProperty("readerVisibilityPolicy");
	const input = revised(original, (report) => {
		report.reader = null;
	});
	expect(input.report.reader).toBeNull();
	const ownership = observeOwnership();
	expect(() => execute(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0);
});

it.each(formats)(
	"accepts policy-free false visibility without a hidden-subtree counter as %s",
	async (format) => {
		const input = await fixture();
		expect(input.report).not.toHaveProperty("readerVisibilityPolicy");
		expect(input.report.reader).toMatchObject({
			hiddenContentSemantics: false,
		});
		expect(input.report.reader).not.toHaveProperty("visibilityPolicy");
		expect(input.report.reader).not.toHaveProperty("sourceHiddenSubtrees");
		const ownership = observeOwnership();
		const result = execute(input, { ...focus, ...override }, format);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			reader: {
				hiddenContentSemantics: false,
				mimeInterpretation: interpretation,
			},
			extraction: { format },
		});
		expect(result.report.reader).not.toHaveProperty("sourceHiddenSubtrees");
		expect(result.jsonl).toContain("Owned heading");
		expect(ownership.load).toHaveBeenCalledOnce();
		ownership.assert(1);
	},
);

it.each(formats)(
	"accepts an admitted capture with a genuinely absent reader as %s",
	async (format) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			Reflect.deleteProperty(report, "reader");
		});
		expect(input.report).not.toHaveProperty("reader");
		expect(input.report).not.toHaveProperty("readerVisibilityPolicy");
		const ownership = observeOwnership();
		const result = execute(input, { ...focus, ...override }, format);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			reader: { mimeInterpretation: interpretation },
			extraction: { format },
		});
		expect(result.jsonl).toContain("Owned heading");
		expect(ownership.load).toHaveBeenCalledOnce();
		ownership.assert(1);
	},
);
