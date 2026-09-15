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
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";

const encoder = new TextEncoder();
const url = "https://mime-replay.fixture.invalid/article";
const policy = "markdown-html-document-v1";
const prefix = '<!DOCTYPE html><html lang="en"><head>';
const content =
	'<main><h2 id="owned">Owned heading</h2><p>Visible answer<p>Repaired paragraph <a href="/details">Details</a></main>';
const source = `${prefix}<title>Saved article</title></head><body><script>PRIVATE_SCRIPT_MARKER</script>${content}</body></html>`;
const expectedInterpretation = {
	policy,
	declaredMime: "text/markdown",
	effectiveMime: "text/html",
	basis: "html5-doctype-root-prefix",
	prefixCodeUnits: prefix.length,
};

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
			throw new Error("MIME replay must not fetch");
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
		policy?: boolean;
		visibility?: ResearchReaderVisibilityPolicy;
		profile?: ResearchDocumentProfileId;
		utf16?: boolean;
		recovery?: boolean;
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
		undefined,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.policy === false ? {} : { readerMimePolicy: policy }),
			...(options.visibility
				? { readerVisibilityPolicy: options.visibility }
				: {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.outcome).toBe(
		options.recovery ? "failure" : "extracted-unverified",
	);
	if (options.recovery)
		expect(report.failure).toMatchObject({
			category: "resource-limit",
			stage: "extraction",
			resourceLimit: { kind: "extraction.output", limit: 256_000 },
		});
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

function run(
	input: Fixture,
	selection: replay.ResearchJsonReplaySelection = { selector: "main" },
) {
	const unchanged = structuredClone(input);
	try {
		const result = replay.extractResearchReplayJson(
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
		return result;
	} finally {
		expect(input).toEqual(unchanged);
	}
}

function observeOwnership(
	mutate?: (metadata: Record<string, unknown>) => void,
	recovery = false,
) {
	const bodies: Uint8Array[] = [];
	const track = <Admission extends admission.ResearchReplayAdmission>(
		admitted: Admission,
	): Admission => {
		if (admitted.kind !== "validated-capture") return admitted;
		bodies.push(admitted.body);
		if (!mutate) return admitted;
		const metadata = structuredClone(admitted.originalMetadata);
		mutate(metadata);
		return { ...admitted, originalMetadata: metadata };
	};
	if (recovery) {
		const original = admission.validateResearchOutputLimitSectionAdmission;
		vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		).mockImplementation((...args) => track(original(...args)));
	} else {
		const original = admission.validateResearchReplayAdmission;
		vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
			(...args) => track(original(...args)),
		);
	}
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

it.each([false, true])(
	"replays repaired captured Markdown-labelled HTML without altering original bytes (utf16=%s)",
	async (utf16) => {
		const input = await fixture(source, { utf16 });
		expect(input.report.reader?.mimeInterpretation).toEqual(
			expectedInterpretation,
		);
		const ownership = observeOwnership();
		const result = run(input);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.jsonl).toContain("Visible answer");
		expect(result.jsonl).toContain("Repaired paragraph");
		expect(result.jsonl).not.toContain("PRIVATE_SCRIPT_MARKER");
		expect(ownership.load.mock.calls[0][0].headers).toEqual(
			input.report.primaryResponse?.headers,
		);
		expect(ownership.load.mock.calls[0].slice(2)).toEqual([
			"default",
			undefined,
			undefined,
			policy,
		]);
		expect(input.report.primaryResponse?.bodySha256).toBe(hash(input.body));
		ownership.assert(1);
	},
);

it.each(["both", "nested", "requested-only"])(
	"re-recognizes captured bytes for %s policy evidence",
	async (location) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			if (location === "nested")
				Reflect.deleteProperty(report, "readerMimePolicy");
			if (location === "requested-only") {
				const reader = report.reader as Record<string, unknown>;
				Reflect.deleteProperty(reader, "mimePolicy");
				Reflect.deleteProperty(reader, "mimeInterpretation");
			}
		});
		expect(run(input, { section: "#owned" }).report.reader).toEqual(
			original.report.reader,
		);
	},
);

it("does not infer a MIME policy from a complete HTML body", async () => {
	const input = await fixture(source, { policy: false });
	const ownership = observeOwnership();
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0);
});

it.each(
	["top", "nested"].flatMap((location) =>
		[null, false, 1, "", "unknown-policy", [], { policy }].map((value) => ({
			location,
			value,
		})),
	),
)(
	"rejects malformed $location policy $value before loading",
	async ({ location, value }) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			if (location === "top") report.readerMimePolicy = value;
			else (report.reader as Record<string, unknown>).mimePolicy = value;
		});
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each([
	["policy", "other-policy"],
	["declaredMime", "text/plain"],
	["effectiveMime", "application/xhtml+xml"],
	["basis", "fabricated-marker"],
	["prefixCodeUnits", 0],
	["prefixCodeUnits", 4097],
	["prefixCodeUnits", 1.5],
	["prefixCodeUnits", "35"],
	["extra", true],
])(
	"rejects malformed interpretation %s=%s before loading",
	async (field, value) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			const reader = report.reader as Record<string, unknown>;
			(reader.mimeInterpretation as Record<string, unknown>)[field as string] =
				value;
		});
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each([null, false, [], "text/html"])(
	"rejects malformed interpretation %s",
	async (value) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			(report.reader as Record<string, unknown>).mimeInterpretation = value;
		});
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		ownership.assert(0);
	},
);

it.each(["top", "nested", "interpretation"])(
	"rejects own undefined %s declarations at the admission boundary",
	async (location) => {
		const input = await fixture();
		const ownership = observeOwnership((metadata) => {
			if (location === "top") metadata.readerMimePolicy = undefined;
			else {
				const reader = metadata.reader as Record<string, unknown>;
				reader[location === "nested" ? "mimePolicy" : "mimeInterpretation"] =
					undefined;
			}
		});
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it.each(["policy-missing", "interpretation-missing", "offset-mismatch"])(
	"rejects inconsistent MIME evidence: %s",
	async (kind) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			const reader = report.reader as Record<string, unknown>;
			if (kind === "policy-missing") {
				Reflect.deleteProperty(report, "readerMimePolicy");
				Reflect.deleteProperty(reader, "mimePolicy");
			} else if (kind === "interpretation-missing") {
				Reflect.deleteProperty(reader, "mimeInterpretation");
			} else {
				(reader.mimeInterpretation as Record<string, unknown>).prefixCodeUnits =
					prefix.length + 1;
			}
		});
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		ownership.assert(kind === "offset-mismatch" ? 1 : 0);
	},
);

it.each(["text/plain", "text/html"])(
	"rejects interpreted evidence contradicting captured %s MIME",
	async (mime) => {
		const original = await fixture(source, { mime });
		const input = revised(original, (report) => {
			Object.assign(report.reader as object, {
				mimePolicy: policy,
				mimeInterpretation: expectedInterpretation,
			});
		});
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(0);
	},
);

it("rejects MIME policy on a pinned long-v1 HTML capture", async () => {
	const original = await fixture(source, {
		policy: false,
		profile: "long-v1",
		mime: "text/html",
	});
	const input = revised(original, (report) => {
		report.readerMimePolicy = policy;
	});
	const ownership = observeOwnership();
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0);
});

it.each([
	"# Owned Markdown\n[Details](/details)",
	`\`\`\`html\n${source}\n\`\`\``,
	`    ${source}`,
	"<main>HTML fragment, not a document</main>",
])(
	"keeps unmatched Markdown literal despite a requested policy: %s",
	async (text) => {
		const input = await fixture(text);
		expect(input.report.readerMimePolicy).toBe(policy);
		expect(input.report.reader).not.toHaveProperty("mimePolicy");
		expect(input.report.reader).not.toHaveProperty("mimeInterpretation");
		const ownership = observeOwnership();
		expect(() => run(input)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		const lines = run(input, { lines: { start: 1, end: 1 } });
		expect(lines.report.reader).toEqual(input.report.reader);
		expect(run(input, { find: "Owned" }).report.selection.method).toBe(
			"text-line-discovery",
		);
		expect(run(input, { links: "details" }).report.selection.method).toBe(
			"link-url-search",
		);
		ownership.assert(4, 4);
	},
);

it("rejects fabricated conversion evidence on nonmatching Markdown", async () => {
	const original = await fixture("# Ordinary Markdown\nOwned text");
	const input = revised(original, (report) => {
		Object.assign(report.reader as object, {
			mimePolicy: policy,
			mimeInterpretation: expectedInterpretation,
		});
	});
	const ownership = observeOwnership();
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	ownership.assert(1);
});

it.each([{ lines: { start: 1, end: 1 } }, { find: "Owned" }])(
	"rejects literal text operations on actually converted HTML: %j",
	async (selection) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			const reader = report.reader as Record<string, unknown>;
			Reflect.deleteProperty(reader, "mimePolicy");
			Reflect.deleteProperty(reader, "mimeInterpretation");
		});
		const ownership = observeOwnership();
		expect(() => run(input, selection)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		ownership.assert(1);
	},
);

it("uses DOM link discovery on converted HTML, not Markdown link scanning", async () => {
	const input = await fixture();
	const result = run(input, { links: "details" });
	expect(result.report.reader?.mimeInterpretation).toEqual(
		expectedInterpretation,
	);
	expect(result.jsonl).toContain(
		`${url.slice(0, url.lastIndexOf("/"))}/details`,
	);
});

it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"reproduces interpreted visibility evidence for %s",
	async (visibilityPolicy) => {
		const input = await fixture(
			source.replace(content, `<aside hidden>Hidden note</aside>${content}`),
			{ visibility: visibilityPolicy },
		);
		const ownership = observeOwnership();
		const check = vi.spyOn(visibility, "researchVisibilityEvidence");
		const result = run(input);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report.reader?.sourceHiddenSubtrees).toBe(1);
		expect(check.mock.calls[0][5]).toBe(policy);
		expect(ownership.load.mock.calls.map((call) => call.slice(3))).toEqual([
			[undefined, undefined, policy],
			[undefined, visibilityPolicy, policy],
		]);
		ownership.assert(2);
	},
);

it("rejects tampered visibility counts against the regenerated interpretation", async () => {
	const original = await fixture(source, { visibility: "source-hidden-v1" });
	const input = revised(original, (report) => {
		(report.reader as Record<string, unknown>).sourceHiddenSubtrees = 1;
	});
	const ownership = observeOwnership();
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	ownership.assert(2);
});

it("checks hidden challenge evidence with the MIME policy before filtered loading", async () => {
	const original = await fixture(source, {
		visibility: "source-hidden-inline-v1",
	});
	const input = replaceBody(
		original,
		`${prefix}<title style="display:none">Security check</title></head><body><aside hidden>Verify you are human</aside>${content}</body></html>`,
	);
	const ownership = observeOwnership();
	const check = vi.spyOn(visibility, "researchVisibilityEvidence");
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(check.mock.calls[0][5]).toBe(policy);
	expect(check.mock.results[0].value?.diagnostic?.kind).toBe("challenge");
	expect(ownership.load).toHaveBeenCalledOnce();
	expect(ownership.load.mock.calls[0].slice(3)).toEqual([
		undefined,
		undefined,
		policy,
	]);
	ownership.assert(1);
});

it("keeps body pins and original failure gates authoritative", async () => {
	const original = await fixture();
	const input = revised(original, (report) => {
		report.outcome = "failure";
		report.failure = { category: "unsupported", stage: "navigation" };
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(() =>
		run({
			...original,
			trusted: {
				...original.trusted,
				expectedBody: {
					bytes: original.body.byteLength,
					sha256: "0".repeat(64),
				},
			},
		}),
	).toThrow(AgentBrowserError);
	expect(load).not.toHaveBeenCalled();
});

it("does not widen declared-HTML-only output-limit recovery admission", async () => {
	const input = await fixture(
		source.replace(
			content,
			`<aside>${"Background content. ".repeat(16_000)}</aside>${content}`,
		),
		{ recovery: true },
	);
	const ownership = observeOwnership(undefined, true);
	for (const operation of [
		() =>
			replay.recoverResearchOutputLimitSelector(input.raw, input.trusted, {
				selector: "main",
			}),
		() =>
			replay.recoverResearchOutputLimitSection(input.raw, input.trusted, {
				section: "#owned",
			}),
		() => replay.outlineResearchOutputLimitCapture(input.raw, input.trusted),
	])
		expect(operation).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(ownership.load).not.toHaveBeenCalled();
	ownership.assert(0, 0);
});

it("reclassifies interpreted HTML barriers without changing captured MIME evidence", async () => {
	const original = await fixture();
	const input = replaceBody(
		original,
		`${prefix}<title>Security check</title></head><body><main>Verify you are human</main></body></html>`,
	);
	const ownership = observeOwnership();
	const result = run(input);
	expect(result.report.outcome).toBe("semantic-barrier");
	expect(result.report.classification.barrier).toBe("challenge");
	expect(result.report.classification.diagnostic?.evidence).toContain(
		"reader-mime-interpretation",
	);
	expect(input.report.primaryResponse?.headers["content-type"]).toEqual([
		"text/markdown; charset=utf-8",
	]);
	ownership.assert(1);
});

it("rejects a re-pinned body whose recognized prefix offset has changed", async () => {
	const original = await fixture();
	const input = replaceBody(original, `\n${source}`);
	const ownership = observeOwnership();
	expect(() => run(input)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	ownership.assert(1);
});

it("keeps unmatched Markdown visibility semantics and reader fields unchanged", async () => {
	const input = await fixture("# Owned Markdown\n[Details](/details)", {
		visibility: "source-hidden-inline-v1",
	});
	const ownership = observeOwnership();
	const result = run(input, { lines: { start: 1, end: 1 } });
	expect(result.report.reader).toEqual(input.report.reader);
	expect(result.report.reader).toMatchObject({
		hiddenContentSemantics: false,
		sourceHiddenSubtrees: 0,
	});
	expect(result.report.reader).not.toHaveProperty("mimeInterpretation");
	ownership.assert(2);
});

it("does not label already-declared HTML as a MIME interpretation", async () => {
	const input = await fixture(source, { mime: "text/html; charset=utf-8" });
	const result = run(input);
	expect(result.report.reader).toEqual(input.report.reader);
	expect(result.report.reader).not.toHaveProperty("mimePolicy");
	expect(result.report.reader).not.toHaveProperty("mimeInterpretation");
});

it("rejects changed policy metadata without a matching receipt pin", async () => {
	const original = await fixture();
	const input = revised(original, (report) => {
		Reflect.deleteProperty(report, "readerMimePolicy");
	});
	input.trusted = original.trusted;
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => run(input)).toThrow(AgentBrowserError);
	expect(load).not.toHaveBeenCalled();
});
