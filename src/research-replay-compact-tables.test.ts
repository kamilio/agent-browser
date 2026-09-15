import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import * as visibility from "../scripts/research-visibility.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://compact-replay.fixture.invalid/article";
const table =
	'<table><tr><th>Feature</th><th>Support</th></tr><tr><td colspan="2">Quantization</td><td>Available</td></tr><tr><td>雪</td><td><a href="/details">Details</a></td></tr></table>';
const source = `<aside>Outside prefix</aside><main><h2 id="wanted">Wanted</h2>${table}</main><h2>Next section</h2><p>Outside suffix</p>`;
const noise = `<h1 id="large">Large</h1><p>${"Background content. ".repeat(16_000)}</p>`;
const policy = "source-hidden-inline-v1" as const;
const rowBegin = "**Native row begin (selected structure only)**";
const cellBegin = "**Native cell begin (selected structure only)**";
const trusted: admission.TrustedResearchReplayAdmission = {
	expectedProfile: "default",
	expectedReceiptSha256: "a".repeat(64),
	expectedBody: { bytes: 64, sha256: "b".repeat(64) },
};
const streams: Array<Readable | Writable> = [];
const contexts = [
	{ profile: "default", method: "selector", recovery: false },
	{ profile: "default", method: "section", recovery: false },
	{ profile: "long-v1", method: "selector", recovery: false },
	{ profile: "long-v1", method: "section", recovery: false },
	{ profile: "default", method: "selector", recovery: true },
	{ profile: "default", method: "section", recovery: true },
] as const;
type Context = (typeof contexts)[number];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Compact replay fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const stream of streams.splice(0)) stream.destroy();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	options: {
		profile?: ResearchDocumentProfileId;
		recovery?: boolean;
		visibility?: boolean;
		html?: string;
	} = {},
) {
	const profile = options.profile ?? "default";
	const html = `${options.recovery ? noise : ""}${options.html ?? source}`;
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
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
		undefined,
		undefined,
		!options.recovery,
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.visibility ? { readerVisibilityPolicy: policy } : {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(html));
	if (options.recovery) {
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: {
				category: "resource-limit",
				stage: "extraction",
				resourceLimit: {
					kind: "extraction.output",
					unit: "bytes",
					limit: 256_000,
				},
			},
		});
		expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
	} else expect(report.outcome).toBe("extracted-unverified");
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function selectionFor(context: Context) {
	return context.method === "selector"
		? { selector: "main" }
		: { section: "#wanted" };
}

function execute(
	input: { raw: Uint8Array; trusted: admission.TrustedResearchReplayAdmission },
	context: Context,
	selection: unknown,
	format: replay.ResearchReplayFormat | undefined = "markdown",
	signal?: AbortSignal,
) {
	if (!context.recovery)
		return replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection as replay.ResearchJsonReplaySelection,
			signal,
			format as replay.ResearchReplayFormat,
		);
	if (context.method === "selector")
		return replay.recoverResearchOutputLimitSelector(
			input.raw,
			input.trusted,
			selection as replay.ResearchOutputLimitSelectorSelection,
			signal,
			format as replay.ResearchReplayFormat,
		);
	return replay.recoverResearchOutputLimitSection(
		input.raw,
		input.trusted,
		selection as replay.ResearchOutputLimitSectionSelection,
		signal,
		format as replay.ResearchReplayFormat,
	);
}

function markdown(result: ReturnType<typeof execute>) {
	const value = result.report.extraction;
	if (value?.format !== "markdown") throw new Error("Expected Markdown");
	return value;
}

function stableReferences(value: unknown) {
	return JSON.parse(
		JSON.stringify(value, (key, entry) =>
			["document", "scope", "ref", "heading", "end"].includes(key) &&
			typeof entry === "string" &&
			/^e\d+$/.test(entry)
				? "<reference>"
				: entry,
		),
	);
}

function expectEnvelope(result: ReturnType<typeof execute>, input: Fixture) {
	expect(result.report).toMatchObject({
		kind: "native-research-json-replay-v1",
		partial: true,
		networkRequests: 0,
		source: {
			profile: input.trusted.expectedProfile,
			reportedFinalUrl: input.report.finalUrl,
			receiptSha256: hash(input.raw),
			body: { bytes: input.body.byteLength, sha256: hash(input.body) },
		},
	});
	expect(JSON.parse(result.jsonl)).toEqual(result.report);
	expect(result.jsonl.split("\n")).toHaveLength(2);
	expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
	expect(result.outputBytes).toBeLessThanOrEqual(327_680);
	for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
		expect(result.jsonl).not.toContain(`"${key}"`);
}

function expectRecovery(
	result: ReturnType<typeof execute>,
	input: Fixture,
	context: Context,
) {
	if (context.recovery)
		expect(result.report.recovery).toEqual({
			kind: `captured-output-limit-${context.method}`,
			originalOutcome: "failure",
			originalContentSuccess: false,
			originalFailure: input.report.failure,
			originalRequestRetried: false,
		});
	else expect(result.report).not.toHaveProperty("recovery");
}

function observeOwnership(recovery: boolean) {
	const bodies: Uint8Array[] = [];
	if (recovery) {
		const validate = admission.validateResearchOutputLimitSectionAdmission;
		vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		).mockImplementation((...args) => {
			const admitted = validate(...args);
			bodies.push(admitted.body);
			return admitted;
		});
	} else {
		const validate = admission.validateResearchReplayAdmission;
		vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
			(...args) => {
				const admitted = validate(...args);
				if (admitted.kind === "validated-capture") bodies.push(admitted.body);
				return admitted;
			},
		);
	}
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return (bodyCount = 1, treeCount = bodyCount) => {
		expect(bodies).toHaveLength(bodyCount);
		for (const body of bodies) {
			expect(body.byteLength).toBeGreaterThan(0);
			expect(body.every((value) => value === 0)).toBe(true);
		}
		expect(close).toHaveBeenCalledTimes(treeCount);
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(tree.nodeCount).toBe(0);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
		}
	};
}

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

function pinArguments(pins = trusted) {
	if (!pins.expectedBody) throw new Error("Expected independent body pin");
	return [
		"--expected-profile",
		pins.expectedProfile,
		"--receipt-sha256",
		pins.expectedReceiptSha256,
		"--body-sha256",
		pins.expectedBody.sha256,
		"--body-bytes",
		String(pins.expectedBody.bytes),
	];
}

function cliArguments(
	input: { trusted: admission.TrustedResearchReplayAdmission },
	context: Context,
	extra = ["--compact-tables"],
) {
	return [
		...pinArguments(input.trusted),
		`--${context.method}`,
		context.method === "selector" ? "main" : "#wanted",
		"--format",
		"markdown",
		...extra,
		...(context.recovery ? ["--recover-output-limit"] : []),
	];
}

function captureStreams(raw: Uint8Array) {
	const input = Readable.from([raw.subarray(0, 11), raw.subarray(11)], {
		objectMode: false,
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const stream of [input, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

it.each(contexts)(
	"preserves absent/false parity and compacts pinned $profile $method (recovery=$recovery)",
	async (context) => {
		const input = await fixture(context);
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		const extract = vi.spyOn(extraction, "extractDocument");
		const selection = selectionFor(context);
		const baseline = execute(input, context, selection);
		const disabled = execute(input, context, {
			...selection,
			compactTables: false,
		});
		const compactSelection: replay.ResearchJsonReplaySelection = {
			...selection,
			compactTables: true,
		};
		const compact = execute(input, context, compactSelection);
		expect(stableReferences(disabled.report)).toEqual(
			stableReferences(baseline.report),
		);
		expect(markdown(baseline)).not.toHaveProperty("compactTables");
		expect(stableReferences(markdown(compact))).toEqual({
			...stableReferences(markdown(baseline)),
			compactTables: true,
			content: markdown(baseline)
				.content.replaceAll(rowBegin, "**Native row begin**")
				.replaceAll(cellBegin, "**Native cell begin**"),
		});
		expect(
			markdown(baseline).content.match(/\*\*Native row begin/g),
		).toHaveLength(3);
		expect(
			markdown(baseline).content.match(/\*\*Native cell begin/g),
		).toHaveLength(6);
		expect(
			encoder.encode(markdown(baseline).content).byteLength -
				encoder.encode(markdown(compact).content).byteLength,
		).toBe(9 * " (selected structure only)".length);
		expect(markdown(compact).content).toContain(
			"**Native table begin (selected structure only; associations unspecified)**",
		);
		expect(markdown(compact).content).toContain("雪");
		expect(markdown(compact).content).toContain(
			`[Details](<${url.replace("/article", "/details")}>)`,
		);
		expect(compact.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: {
				method:
					context.method === "selector" ? "css-selector" : "heading-section",
				matches: 1,
			},
			classification: { barrier: null, diagnostic: null },
		});
		for (const result of [baseline, disabled, compact]) {
			expectEnvelope(result, input);
			expectRecovery(result, input, context);
			expect(result.jsonl).not.toContain("Outside");
			expect(result.jsonl).not.toContain("Background content");
		}
		expect(extract).toHaveBeenCalledTimes(3);
		expect(extract.mock.calls[0][1]).not.toHaveProperty("compactTables");
		expect(extract.mock.calls[1][1]).not.toHaveProperty("compactTables");
		expect(extract.mock.calls[2][1]).toMatchObject({
			format: "markdown",
			compactTables: true,
			tableRows: false,
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		expect(input).toEqual(original);
		released(3);
	},
);

it.each(contexts)(
	"keeps default JSON and disabled compact metadata unchanged for $method (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const selected = selectionFor(context);
		const baseline = !context.recovery
			? replay.extractResearchReplayJson(input.raw, input.trusted, selected)
			: context.method === "selector"
				? replay.recoverResearchOutputLimitSelector(input.raw, input.trusted, {
						selector: "main",
					})
				: replay.recoverResearchOutputLimitSection(input.raw, input.trusted, {
						section: "#wanted",
					});
		const disabled = execute(
			input,
			context,
			{ ...selected, compactTables: false },
			"json",
		);
		expect(stableReferences(disabled.report)).toEqual(
			stableReferences(baseline.report),
		);
		expectEnvelope(baseline, input);
		expectEnvelope(disabled, input);
		expect(baseline.report.extraction?.format).toBe("json");
		expect(baseline.report.extraction).not.toHaveProperty("compactTables");
		const metadata = execute(
			input,
			context,
			{ ...selected, tableMetadata: true, compactTables: false },
			"json",
		);
		expect(metadata.jsonl).toContain('"tableSource"');
		expect(baseline.jsonl).not.toContain('"tableSource"');
		expect(metadata.report.extraction).not.toHaveProperty("compactTables");
	},
);

it.each(contexts)(
	"composes compact tables and row output with distinct metadata for $method (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const released = observeOwnership(context.recovery);
		const selected = selectionFor(context);
		const rows = execute(input, context, { ...selected, tableRows: true });
		const combined = execute(input, context, {
			...selected,
			tableRows: true,
			compactTables: true,
			tableMetadata: false,
		});
		expect(stableReferences(markdown(combined))).toEqual({
			...stableReferences(markdown(rows)),
			compactTables: true,
		});
		expect(markdown(combined)).toMatchObject({
			tableRows: true,
			compactTables: true,
		});
		expect(markdown(combined)).not.toHaveProperty("tableMetadata");
		expect(markdown(combined).content).toContain(
			"- Row 1\n  - Cell 1: Feature\n  - Cell 2: Support",
		);
		expect(markdown(combined).content).not.toContain("Native row begin");
		expectRecovery(combined, input, context);
		released(2);
	},
);

it.each(contexts)(
	"retains compact boundary fallback for complex row content in $method (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture({
			...context,
			html: '<main><h2 id="wanted">Wanted</h2><table><tr><td><p>First</p><p>Second</p></td></tr></table></main><h2>Next section</h2>',
		});
		const selected = { ...selectionFor(context), compactTables: true };
		const compact = execute(input, context, selected);
		const combined = execute(input, context, { ...selected, tableRows: true });
		expect(stableReferences(markdown(combined))).toEqual({
			...stableReferences(markdown(compact)),
			tableRows: true,
		});
		expect(markdown(combined).content).toContain("**Native row begin**");
		expect(markdown(combined).content).toContain("**Native cell begin**");
	},
);

it.each(contexts.filter((context) => context.profile === "default"))(
	"does not grant ordinary replay admission to a failed $method receipt",
	async (context) => {
		const input = await fixture({ recovery: true });
		const original = structuredClone(input);
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(
			admission.validateResearchReplayAdmission(input.raw, input.trusted),
		).toMatchObject({ kind: "evidence-only", reason: "native-failure" });
		for (const options of [
			{},
			{ compactTables: false },
			{ compactTables: true },
		])
			expect(() =>
				replay.extractResearchReplayJson(
					input.raw,
					input.trusted,
					{ ...selectionFor(context), ...options },
					undefined,
					"markdown",
				),
			).toThrow(expect.objectContaining({ code: "policy-denied" }));
		expect(load).not.toHaveBeenCalled();
		expect(input).toEqual(original);
	},
);

it.each(contexts)(
	"requires all source pins before $method loading (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const pin of ["receipt", "bytes", "body", "profile"] as const) {
			const invalid = structuredClone(input.trusted);
			if (pin === "receipt") invalid.expectedReceiptSha256 = "0".repeat(64);
			else if (pin === "bytes") invalid.expectedBody.bytes++;
			else if (pin === "body") invalid.expectedBody.sha256 = "0".repeat(64);
			else
				invalid.expectedProfile =
					context.profile === "default" ? "long-v1" : "default";
			expect(() =>
				execute({ ...input, trusted: invalid }, context, {
					...selectionFor(context),
					compactTables: true,
				}),
			).toThrow(
				expect.objectContaining({
					code:
						context.recovery && pin === "profile"
							? "unsupported"
							: "invalid-input",
				}),
			);
		}
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([
	["failure", { category: "timeout", stage: "extraction" }],
	[
		"failure",
		{
			category: "resource-limit",
			stage: "loader",
			resourceLimit: {
				kind: "reader.tokens",
				unit: "tokens",
				limit: 1,
				observed: 2,
			},
		},
	],
	["classification", { barrier: "challenge", diagnostic: {} }],
	["metrics", { active: 1, closed: false }],
] as const)(
	"keeps compact recovery closed for forged %s provenance",
	async (field, value) => {
		const input = revise(await fixture({ recovery: true }), (report) => {
			report[field] = value;
		});
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const context of contexts.filter((entry) => entry.recovery))
			expect(() =>
				execute(input, context, {
					...selectionFor(context),
					compactTables: true,
				}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(
	[null, "true", "false", 0, 1, {}, [], () => true].map((compactTables) => ({
		compactTables,
	})),
)(
	"rejects compactTables=$compactTables before admission",
	({ compactTables }) => {
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const context of contexts)
			expect(() =>
				execute({ raw: new Uint8Array(), trusted }, context, {
					...selectionFor(context),
					compactTables,
				}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([
	"getter",
	"setter",
	"proxy",
	"revoked-proxy",
	"inherited",
	"extra",
	"symbol",
	"hidden-extra",
] as const)(
	"rejects %s compact descriptors without invoking traps or admission",
	(kind) => {
		const trap = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE_TRAP");
		});
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		for (const context of contexts) {
			let selection: object = { ...selectionFor(context), compactTables: true };
			if (kind === "getter")
				Object.defineProperty(selection, "compactTables", { get: trap });
			else if (kind === "setter")
				Object.defineProperty(selection, "compactTables", { set: trap });
			else if (kind === "proxy")
				selection = new Proxy(selection, {
					get: trap,
					getPrototypeOf: trap,
					ownKeys: trap,
					getOwnPropertyDescriptor: trap,
				});
			else if (kind === "revoked-proxy") {
				const revoked = Proxy.revocable(selection, {});
				revoked.revoke();
				selection = revoked.proxy;
			} else if (kind === "inherited")
				selection = Object.assign(
					Object.create({ compactTables: true }),
					selectionFor(context),
				);
			else
				Object.defineProperty(
					selection,
					kind === "symbol" ? Symbol("private") : "extra",
					{ value: true, enumerable: kind !== "hidden-extra" },
				);
			expect(() =>
				execute({ raw: new Uint8Array(), trusted }, context, selection),
			).toThrow(
				expect.objectContaining({
					code: "invalid-input",
					message: "Invalid research replay selection",
				}),
			);
		}
		expect(trap).not.toHaveBeenCalled();
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
	},
);

it.each(contexts)(
	"accepts own compact data on a null prototype for $method (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const selection = Object.assign(Object.create(null), selectionFor(context));
		Object.defineProperty(selection, "compactTables", { value: true });
		expect(markdown(execute(input, context, selection))).toHaveProperty(
			"compactTables",
			true,
		);
	},
);

it.each([true, false])(
	"rejects compactTables=%s in discovery, literal, outline and mixed API modes",
	(compactTables) => {
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		for (const selection of [
			{ links: "next" },
			{ find: "Wanted" },
			{ lines: { start: 1, end: 2 } },
			{ headings: true },
			{ selector: "main", section: "#wanted" },
		])
			for (const context of contexts)
				expect(() =>
					execute({ raw: new Uint8Array(), trusted }, context, {
						...selection,
						compactTables,
					}),
				).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
	},
);

it.each(["json", "html", null, 0] as const)(
	"requires Markdown for enabled compact mode, not %j",
	(format) => {
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		for (const context of contexts)
			expect(() =>
				execute(
					{ raw: new Uint8Array(), trusted },
					context,
					{ ...selectionFor(context), compactTables: true },
					format as replay.ResearchReplayFormat,
				),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
	},
);

it("rejects compact mode with implicit JSON and with Markdown table metadata before admission", () => {
	const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
	const recover = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	const raw = new Uint8Array();
	expect(() =>
		replay.extractResearchReplayJson(raw, trusted, {
			selector: "main",
			compactTables: true,
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		replay.recoverResearchOutputLimitSelector(raw, trusted, {
			selector: "main",
			compactTables: true,
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		replay.recoverResearchOutputLimitSection(raw, trusted, {
			section: "#wanted",
			compactTables: true,
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	for (const context of contexts)
		expect(() =>
			execute({ raw, trusted }, context, {
				...selectionFor(context),
				compactTables: true,
				tableMetadata: true,
			}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(admit).not.toHaveBeenCalled();
	expect(recover).not.toHaveBeenCalled();
});

it.each(contexts)(
	"preserves empty output (mocked for sections) and releases $method ownership (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture({
			...context,
			html:
				context.method === "selector"
					? "<h1>Owned</h1><main></main><h2>Next</h2>"
					: '<h1>Owned</h1><main><h2 id="wanted">Wanted</h2></main><h2>Next</h2>',
		});
		const released = observeOwnership(context.recovery);
		if (context.method === "section") {
			const extract = extraction.extractDocument;
			vi.spyOn(extraction, "extractDocument").mockImplementationOnce(
				(...args) => {
					const result = extract(...args);
					if (result.format !== "markdown")
						throw new Error("Expected Markdown");
					return { ...result, content: "" };
				},
			);
		}
		const result = execute(input, context, {
			...selectionFor(context),
			compactTables: true,
		});
		expect(result.report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
			selection: { matches: 1 },
			extraction: { format: "markdown", compactTables: true, content: "" },
		});
		expectEnvelope(result, input);
		expectRecovery(result, input, context);
		released();
	},
);

it.each(contexts)(
	"closes compact $method trees for missing targets and extraction failures (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		const selection = { ...selectionFor(context), compactTables: true };
		expect(() =>
			execute(input, context, {
				[context.method]: ".missing",
				compactTables: true,
			}),
		).toThrow(expect.objectContaining({ code: "not-found" }));
		expect(() =>
			execute(input, context, { [context.method]: "h2", compactTables: true }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		vi.spyOn(extraction, "extractDocument").mockImplementationOnce(() => {
			throw new AgentBrowserError(
				"unsupported",
				"Synthetic extraction failure",
			);
		});
		expect(() => execute(input, context, selection)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(input).toEqual(original);
		released(3);
	},
);

it.each(contexts)(
	"fits a table-heavy $method below the unchanged cap only with compact output (recovery=$recovery, $profile)",
	async (context) => {
		const repeatedRows = "<tr><td>Evidence</td><td>Available</td></tr>".repeat(
			1250,
		);
		const input = await fixture({
			...context,
			html: `<main><h2 id="wanted">Wanted</h2><table>${repeatedRows}</table></main><h2>Next</h2>`,
		});
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		const selection = selectionFor(context);
		expect(() => execute(input, context, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const result = execute(input, context, {
			...selection,
			compactTables: true,
		});
		expect(result.report.outcome).toBe("extracted-unverified");
		expect(
			markdown(result).content.match(/\*\*Native row begin\*\*/g),
		).toHaveLength(1250);
		expect(
			markdown(result).content.match(/\*\*Native cell begin\*\*/g),
		).toHaveLength(2500);
		expect(
			encoder.encode(markdown(result).content).byteLength,
		).toBeLessThanOrEqual(256_000);
		expectEnvelope(result, input);
		expectRecovery(result, input, context);
		expect(input).toEqual(original);
		released(2);
	},
);

it.each(contexts)(
	"does not enlarge compact $method output budgets (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture({
			...context,
			html: `<main><h2 id="wanted">Wanted</h2><table><tr><td>${"x".repeat(256_000)}</td></tr></table></main><h2>Next</h2>`,
		});
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		expect(() =>
			execute(input, context, {
				...selectionFor(context),
				compactTables: true,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(input).toEqual(original);
		released();
	},
);

it.each(contexts)(
	"enforces the final JSONL ceiling, abort and time checkpoints for compact $method (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const released = observeOwnership(context.recovery);
		const extract = extraction.extractDocument;
		const spy = vi.spyOn(extraction, "extractDocument");
		spy.mockImplementationOnce((...args) => {
			const result = extract(...args);
			if (result.format !== "markdown") throw new Error("Expected Markdown");
			return { ...result, content: "界".repeat(110_000) };
		});
		const selection = { ...selectionFor(context), compactTables: true };
		expect(() => execute(input, context, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const controller = new AbortController();
		spy.mockImplementationOnce((...args) => {
			const result = extract(...args);
			controller.abort();
			return result;
		});
		expect(() =>
			execute(input, context, selection, "markdown", controller.signal),
		).toThrow(expect.objectContaining({ code: "aborted" }));
		const clock = vi.spyOn(performance, "now").mockReturnValue(0);
		spy.mockImplementationOnce((...args) => {
			const result = extract(...args);
			clock.mockReturnValue(replay.researchJsonReplayLimits.timeoutMs);
			return result;
		});
		expect(() => execute(input, context, selection)).toThrow(
			expect.objectContaining({ code: "timeout" }),
		);
		released(3);
	},
);

it.each(contexts)(
	"classifies document and selected barriers in compact $method (recovery=$recovery, $profile)",
	async (context) => {
		const original = await fixture(context);
		const released = observeOwnership(context.recovery);
		const extract = vi.spyOn(extraction, "extractDocument");
		for (const late of [false, true]) {
			const input = replaceBody(
				original,
				`<title>Just a moment...</title>${late ? `<aside>${"x".repeat(9000)}</aside>` : "<aside hidden>Checking your browser</aside>"}<main><h2 id="wanted">Wanted</h2><table><tr><td>Checking your browser</td></tr></table></main>${context.recovery ? noise : ""}`,
			);
			const result = execute(input, context, {
				...(late ? selectionFor(context) : { [context.method]: ".missing" }),
				compactTables: true,
			});
			expect(result.report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				classification: { barrier: "challenge" },
				selection: { matches: late ? 1 : null },
			});
			if (late) expect(markdown(result)).toHaveProperty("compactTables", true);
			else {
				expect(result.report.extraction).toBeUndefined();
				expect(extract).not.toHaveBeenCalled();
			}
			expectEnvelope(result, input);
			expectRecovery(result, input, context);
		}
		released(2);
	},
);

it.each(contexts)(
	"forwards the requested compact $method through unfiltered visibility preflight (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture({ ...context, visibility: true });
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		const check = vi.spyOn(visibility, "researchVisibilityEvidence");
		const extract = vi.spyOn(extraction, "extractDocument");
		for (const tableRows of [false, true]) {
			const result = execute(input, context, {
				...selectionFor(context),
				compactTables: true,
				tableRows,
			});
			expect(check.mock.calls.at(-1)?.[4]).toMatchObject({
				method:
					context.method === "selector" ? "css-selector" : "heading-section",
				target: context.method === "selector" ? "main" : "#wanted",
				format: "markdown",
				compactTables: true,
				tableRows,
				limits: { maxBytes: 256_000, maxNodes: 50_000, maxDepth: 128 },
			});
			for (const call of extract.mock.calls.slice(-2))
				expect(call[1]).toMatchObject({
					format: "markdown",
					compactTables: true,
					tableRows,
					maxBytes: 256_000,
					maxNodes: 50_000,
					maxDepth: 128,
				});
			expect(result.report.reader).toMatchObject({
				visibilityPolicy: policy,
				hiddenContentSemantics: "source-attributes-and-inline-display",
			});
			expect(markdown(result)).toHaveProperty("compactTables", true);
			expectEnvelope(result, input);
			expectRecovery(result, input, context);
		}
		expect(check).toHaveBeenCalledTimes(2);
		expect(extract).toHaveBeenCalledTimes(4);
		expect(input).toEqual(original);
		released(2, 4);
	},
);

it.each(contexts)(
	"denies late hidden challenge/login evidence before filtered compact $method loading (recovery=$recovery, $profile)",
	async (context) => {
		const original = await fixture({ ...context, visibility: true });
		const released = observeOwnership(context.recovery);
		const check = vi.spyOn(visibility, "researchVisibilityEvidence");
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const [kind, title, marker] of [
			["challenge", "Security check", "Verify you are human"],
			["login", "Sign in", "Sign in to continue"],
		]) {
			const input = replaceBody(
				original,
				`<title style="display:none">${title}</title><aside>${"x".repeat(9000)}</aside><main><h2 id="wanted">Wanted</h2><table><tr><td style="display:none">${marker}</td><td>Visible answer</td></tr></table></main>${context.recovery ? noise : ""}`,
			);
			const unchanged = structuredClone(input);
			expect(() =>
				execute(input, context, {
					...selectionFor(context),
					compactTables: true,
				}),
			).toThrow(expect.objectContaining({ code: "policy-denied" }));
			expect(check.mock.results.at(-1)?.value?.diagnostic?.kind).toBe(kind);
			expect(check.mock.calls.at(-1)?.[4]).toMatchObject({
				compactTables: true,
				format: "markdown",
				target: context.method === "selector" ? "main" : "#wanted",
			});
			expect(input).toEqual(unchanged);
		}
		expect(load).toHaveBeenCalledTimes(2);
		released(2);
	},
);

it.each(contexts)(
	"parses explicit compact CLI flags for $method (recovery=$recovery, $profile)",
	(context) => {
		const input = { trusted: { ...trusted, expectedProfile: context.profile } };
		const args = cliArguments(input, context);
		for (const arranged of [
			args,
			[
				"--compact-tables",
				...args.filter((value) => value !== "--compact-tables"),
			],
		])
			expect(parseResearchReplayArguments(arranged)).toEqual({
				trusted: input.trusted,
				selection: { ...selectionFor(context), compactTables: true },
				format: "markdown",
				...(context.recovery ? { recoverOutputLimit: true } : {}),
			});
	},
);

it("preserves the default CLI shape and all pre-existing replay budgets", () => {
	expect(
		parseResearchReplayArguments([...pinArguments(), "--selector", "main"]),
	).toEqual({ trusted, selection: { selector: "main" } });
	expect(replay.researchJsonReplayLimits).toEqual({
		maxSelectorCodeUnits: 4096,
		maxExtractionBytes: 256_000,
		maxOutputBytes: 327_680,
		maxNodes: 50_000,
		maxDepth: 128,
		timeoutMs: 20_000,
	});
});

const invalidCli = [
	["--selector", "main", "--compact-tables"],
	["--selector", "main", "--format", "json", "--compact-tables"],
	["--selector", "main", "--format", "html", "--compact-tables"],
	[
		"--selector",
		"main",
		"--format",
		"markdown",
		"--compact-tables",
		"--compact-tables",
	],
	["--selector", "main", "--format", "markdown", "--compact-tables=true"],
	["--selector", "main", "--format", "markdown", "--compact-tables=false"],
	["--selector", "main", "--format", "markdown", "--compact-tables", "false"],
	["--selector", "main", "--format", "markdown", "--compact-tables", "true"],
	[
		"--selector",
		"main",
		"--format",
		"markdown",
		"--compact-tables",
		"--table-metadata",
	],
	[
		"--selector",
		"main",
		"--format",
		"json",
		"--compact-tables",
		"--table-metadata",
	],
	["--links", "next", "--format", "markdown", "--compact-tables"],
	["--links", "next", "--compact-tables"],
	["--find", "Wanted", "--format", "markdown", "--compact-tables"],
	["--find", "Wanted", "--compact-tables"],
	["--lines", "1:2", "--format", "markdown", "--compact-tables"],
	["--lines", "1:2", "--compact-tables"],
	["--headings", "--recover-output-limit", "--compact-tables"],
	[
		"--headings",
		"--recover-output-limit",
		"--format",
		"markdown",
		"--compact-tables",
	],
	["--format", "markdown", "--compact-tables"],
	[
		"--selector",
		"main",
		"--section",
		"#wanted",
		"--format",
		"markdown",
		"--compact-tables",
	],
	[
		"--selector",
		"main",
		"--format",
		"markdown",
		"--compact-tables",
		"--table-rows",
		"--recover-output-limit",
		"--compact-tables",
	],
];

it.each(invalidCli.map((extra) => ({ extra })))(
	"rejects invalid compact CLI $extra before touching either stream",
	async ({ extra }) => {
		const args = [...pinArguments(), ...extra];
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		const write = vi.spyOn(target.output, "write");
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		expect(() => parseResearchReplayArguments(args)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		await expect(
			runResearchReplayCli(args, target.input, target.output),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	},
);

it.each(contexts.filter((context) => context.recovery))(
	"accepts the full 15-argument $method CLI composition, but not long-profile recovery",
	async (context) => {
		const args = cliArguments({ trusted }, context, [
			"--compact-tables",
			"--table-rows",
		]);
		expect(args).toHaveLength(15);
		expect(parseResearchReplayArguments(args)).toEqual({
			trusted,
			selection: {
				...selectionFor(context),
				compactTables: true,
				tableRows: true,
			},
			format: "markdown",
			recoverOutputLimit: true,
		});
		args[1] = "long-v1";
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		await expect(
			runResearchReplayCli(args, target.input, target.output),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	},
);

it.each(contexts)(
	"streams pinned compact $method JSONL with row composition (recovery=$recovery, $profile)",
	async (context) => {
		const input = await fixture(context);
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		for (const tableRows of [false, true]) {
			const expected = execute(input, context, {
				...selectionFor(context),
				compactTables: true,
				...(tableRows ? { tableRows: true } : {}),
			});
			const args = cliArguments(input, context, [
				"--compact-tables",
				...(tableRows ? ["--table-rows"] : []),
			]);
			if (context.recovery && tableRows) expect(args).toHaveLength(15);
			const target = captureStreams(input.raw);
			expect(
				await runResearchReplayCli(args, target.input, target.output),
			).toBe(0);
			const output = JSON.parse(target.text());
			expect(target.text()).toBe(`${JSON.stringify(output)}\n`);
			expect(stableReferences(output)).toEqual(
				stableReferences(expected.report),
			);
			expectEnvelope(expected, input);
			expectRecovery(expected, input, context);
			expect(target.text().split("\n")).toHaveLength(2);
			expect(Buffer.byteLength(target.text())).toBeLessThanOrEqual(327_680);
			expect(target.text()).not.toContain("Outside");
			expect(target.text()).not.toContain("Background content");
		}
		expect(input).toEqual(original);
		released(4);
	},
);

it.each(["empty", "barrier"] as const)(
	"returns CLI exit 1 and one report for compact %s output",
	async (kind) => {
		const context = contexts[0];
		const input = replaceBody(
			await fixture(),
			kind === "empty"
				? "<main></main>"
				: "<title>Just a moment...</title><main>Checking your browser</main>",
		);
		const original = structuredClone(input);
		const released = observeOwnership(false);
		const target = captureStreams(input.raw);
		expect(
			await runResearchReplayCli(
				cliArguments(input, context),
				target.input,
				target.output,
			),
		).toBe(1);
		const output = JSON.parse(target.text());
		expect(output).toMatchObject({
			outcome: kind === "empty" ? "empty-extraction" : "semantic-barrier",
			contentSuccess: false,
			networkRequests: 0,
		});
		if (kind === "empty")
			expect(output.extraction).toMatchObject({
				compactTables: true,
				content: "",
			});
		else expect(output.extraction).toBeUndefined();
		expect(target.text().split("\n")).toHaveLength(2);
		expect(input).toEqual(original);
		released();
	},
);

it("rejects ordinary failed compact CLI replay without emitting recovery output", async () => {
	const input = await fixture({ recovery: true });
	const original = structuredClone(input);
	const load = vi.spyOn(loader, "loadResearchDocument");
	const target = captureStreams(input.raw);
	await expect(
		runResearchReplayCli(
			cliArguments(input, contexts[0]),
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(target.text()).toBe("");
	expect(load).not.toHaveBeenCalled();
	expect(input).toEqual(original);
});

it.each(contexts.filter((context) => context.profile === "default"))(
	"releases compact $method source ownership even when CLI output fails (recovery=$recovery)",
	async (context) => {
		const input = await fixture(context);
		const original = structuredClone(input);
		const released = observeOwnership(context.recovery);
		const target = captureStreams(input.raw);
		vi.spyOn(target.output, "write").mockImplementation(() => {
			throw new Error("Synthetic output failure");
		});
		await expect(
			runResearchReplayCli(
				cliArguments(input, context),
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "closed" });
		expect(target.text()).toBe("");
		expect(input).toEqual(original);
		released();
	},
);
