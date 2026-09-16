import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { textDocumentInfo } from "./text-document-info.js";

const encoder = new TextEncoder();
const url = "https://json-pointer-replay.fixture.invalid/source";
const privateMarker = "SYNTHETIC_JSON_POINTER_REPLAY_PRIVATE";

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
			throw new Error("JSON pointer replay must not fetch");
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
	source = '{"info":{"name":"Owned","requires_python":">=3.10"}}',
	options: {
		mime?: string;
		profile?: ResearchDocumentProfileId;
		reader?: boolean;
		lines?: { start: number; end: number };
		status?: number;
		outcome?: ResearchNavigationReport["outcome"];
		execution?: ResearchExecutionOptions;
	} = {},
): Promise<Fixture> {
	const body = encoder.encode(source);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: options.status ?? 200,
		headers: {
			"content-type": [options.mime ?? "application/json; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		options.reader ?? profile === "long-v1",
		undefined,
		undefined,
		true,
		options.lines,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		{ minRequestIntervalMs: 0, ...options.execution },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(source));
	expect(report.outcome).toBe(options.outcome ?? "extracted-unverified");
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	vi.clearAllMocks();
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
	mutate: (report: ResearchNavigationReport) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report);
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function run(
	input: Fixture,
	pointer: string,
	format: replay.ResearchReplayFormat = "json",
	signal?: AbortSignal,
) {
	const original = {
		raw: hash(input.raw),
		body: hash(input.body),
		report: JSON.stringify(input.report),
		trusted: structuredClone(input.trusted),
	};
	const selection = Object.freeze({ jsonPointer: pointer });
	try {
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
			signal,
			format,
		);
		expect(result).not.toBeInstanceOf(Promise);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			selection: { method: "json-pointer", pointer },
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: input.report.finalUrl,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		for (const key of [
			"bodyCapture",
			"rawReceipt",
			"originalMetadata",
			"recovery",
		])
			expect(result.report).not.toHaveProperty(key);
		return result;
	} finally {
		expect(hash(input.raw)).toBe(original.raw);
		expect(hash(input.body)).toBe(original.body);
		expect(JSON.stringify(input.report)).toBe(original.report);
		expect(input.trusted).toEqual(original.trusted);
		expect(selection).toEqual({ jsonPointer: pointer });
	}
}

function literalText(node: ExtractedNode): string {
	return node.type === "text"
		? (node.text ?? "")
		: (node.children ?? []).map(literalText).join("");
}

function observeOwnership() {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind === "validated-capture") bodies.push(admitted.body);
			return admitted;
		},
	);
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return (expectedTrees = bodies.length) => {
		expect(bodies.length).toBeGreaterThan(0);
		for (const body of bodies) {
			expect(body.byteLength).toBeGreaterThan(0);
			expect(body.every((value) => value === 0)).toBe(true);
		}
		expect(close).toHaveBeenCalledTimes(expectedTrees);
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
			expect(textDocumentInfo(tree)).toBeUndefined();
		}
	};
}

it("selects /info in JSON and Markdown with unchanged capture pins and native metadata", async () => {
	const selected = '{ "name":"Owned", "requires_python": ">=3.10" }';
	const source = `{"prefix":"😀","info":${selected},"outside":"${privateMarker}"}`;
	const input = await fixture(source);
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	const query = vi.spyOn(extraction, "discoverDocumentTextLines");
	for (const format of ["json", "markdown"] as const) {
		const result = run(input, "/info", format);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "json-pointer", pointer: "/info", matches: 1 },
			extraction: {
				format,
				jsonSelection: {
					kind: "json-source-selection-v1",
					method: "json-pointer",
					pointer: "/info",
					start: source.indexOf(selected),
					end: source.indexOf(selected) + selected.length,
					sourceCodeUnits: source.length,
					selectedCodeUnits: selected.length,
					offsetBasis: "document-text-utf16",
					valueKind: "object",
					duplicateMembers: "rejected",
				},
			},
		});
		const document = result.report.extraction;
		if (!document) throw new Error("Expected extraction");
		if (document.format === "json")
			expect(literalText(document.content)).toBe(selected);
		else expect(document.content).toBe(`\`\`\`\n${selected}\n\`\`\`\n`);
		expect(result.jsonl).not.toContain(privateMarker);
	}
	expect(extract).toHaveBeenCalledTimes(2);
	expect(extract).toHaveBeenCalledWith(
		expect.any(DocumentTree),
		expect.objectContaining({
			jsonPointer: "/info",
			maxBytes: replay.researchJsonReplayLimits.maxExtractionBytes,
			maxNodes: replay.researchJsonReplayLimits.maxNodes,
			maxDepth: replay.researchJsonReplayLimits.maxDepth,
		}),
	);
	expect(query).not.toHaveBeenCalled();
	released();
});

it("keeps typed default JSON and explicit Markdown overloads for an empty root pointer", async () => {
	const source = ' \r\n {"info": -0, "large": 9007199254740993} \t';
	const selected = source.trim();
	const input = await fixture(source);
	const released = observeOwnership();
	const json = replay.extractResearchReplayJson(input.raw, input.trusted, {
		jsonPointer: "",
	});
	expectTypeOf(json.report.extraction?.content).toEqualTypeOf<
		ExtractedNode | undefined
	>();
	if (!json.report.extraction) throw new Error("Expected JSON extraction");
	expect(literalText(json.report.extraction.content)).toBe(selected);
	const markdown = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		{ jsonPointer: "" },
		undefined,
		"markdown",
	);
	expectTypeOf(markdown.report.extraction?.content).toEqualTypeOf<
		string | undefined
	>();
	expect(markdown.report.extraction?.content).toBe(
		`\`\`\`\n${selected}\n\`\`\`\n`,
	);
	expect(markdown.report.selection).toEqual({
		method: "json-pointer",
		pointer: "",
		matches: 1,
	});
	released();
});

it.each([
	["/info/a~1b/~0key/0", "9007199254740993", "number"],
	["/info/a~1b/~0key/1", "-0", "number"],
	["/info/a~1b/~0key/2", "1.2300e+400", "number"],
	["/info/a~1b/~0key/3", '"\\u0041\\/\\n"', "string"],
	["/info/a~1b/~0key/4", '""', "string"],
	["/info/a~1b/~0key/5", "true", "boolean"],
	["/info/a~1b/~0key/6", "null", "null"],
	["/info//😀", "[ 1, 2 ]", "array"],
	["/info/__proto__", '"literal"', "string"],
	["/info/percent%2Fkey", "false", "boolean"],
])(
	"preserves nested source spelling for %s",
	async (pointer, selected, valueKind) => {
		const source =
			'{"info":{"a/b":{"~key":[9007199254740993,-0,1.2300e+400,"\\u0041\\/\\n","",true,null]},"":{"😀":[ 1, 2 ]},"__proto__":"literal","percent%2Fkey":false}}';
		const input = await fixture(source);
		const released = observeOwnership();
		const result = run(input, pointer);
		const document = result.report.extraction;
		if (document?.format !== "json")
			throw new Error("Expected JSON extraction");
		expect(literalText(document.content)).toBe(selected);
		expect(document.jsonSelection).toMatchObject({ pointer, valueKind });
		expect(result.report.outcome).toBe("extracted-unverified");
		released();
	},
);

it.each([
	"application/json",
	"application/problem+json",
	"text/plain",
	"text/markdown",
	"text/csv",
])(
	"retains native literal %s admission without interpreting embedded code",
	async (mime) => {
		const selected = JSON.stringify(
			'<script>fetch("https://no-follow.invalid/")</script>',
		);
		const input = await fixture(`{"info":${selected}}`, { mime, reader: true });
		const released = observeOwnership();
		const result = run(input, "/info");
		const document = result.report.extraction;
		if (document?.format !== "json")
			throw new Error("Expected JSON extraction");
		expect(literalText(document.content)).toBe(selected);
		released();
	},
);

it("rejects malformed pointers, foreign selection modes and extras before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const invalid: unknown[] = [
		{ jsonPointer: undefined },
		{ jsonPointer: null },
		{ jsonPointer: 0 },
		{ jsonPointer: "info" },
		{ jsonPointer: "#/info" },
		{ jsonPointer: "/~" },
		{ jsonPointer: "/~2" },
		...["selector", "section", "links", "find", "contentFocus"].map((key) => ({
			jsonPointer: "",
			[key]: "pre",
		})),
		{ jsonPointer: "", lines: { start: 1, end: 1 } },
		{ jsonPointer: "", headings: true },
		...["tableMetadata", "tableRows", "compactTables"].map((key) => ({
			jsonPointer: "",
			[key]: false,
		})),
		{ jsonPointer: "", outputLimitPolicy: "text-prefix-v1" },
		{ jsonPointer: "", readerMimePolicy: "markdown-html-document-v1" },
		{ jsonPointer: "", readerFallbackEncoding: "windows-1252" },
	];
	for (const selection of invalid)
		expect(() =>
			replay.extractResearchReplayJson(
				input.raw,
				input.trusted,
				selection as replay.ResearchJsonReplaySelection,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
});

it("enforces pointer code-unit and segment bounds before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const pointer of [`/${"x".repeat(4096)}`, "/x".repeat(129)])
		expect(() => run(input, pointer)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(validate).not.toHaveBeenCalled();
});

it("rejects accessor and proxy selection records without invoking untrusted hooks", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const getter = Object.defineProperty({}, "jsonPointer", { get: hook });
	const proxy = new Proxy({ jsonPointer: "/info" }, { ownKeys: hook });
	for (const selection of [getter, proxy])
		expect(() =>
			replay.extractResearchReplayJson(
				input.raw,
				input.trusted,
				selection as replay.ResearchJsonReplaySelection,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(hook).not.toHaveBeenCalled();
});

it.each([
	"/missing",
	"/info/missing",
	"/info/constructor",
	"/array/01",
	"/array/-",
	"/array/2",
])(
	"rejects absent source path %s and releases the real document",
	async (pointer) => {
		const input = await fixture('{"info":{},"array":[1]}');
		const released = observeOwnership();
		expect(() => run(input, pointer)).toThrowError(
			expect.objectContaining({ code: "not-found" }),
		);
		released();
	},
);

it.each([
	'{"info":1} trailing',
	'{"info":1,"other":}',
	'{"info":1,}',
	'{"info":1,"info":2}',
	'{"info":1,"other":{"key":0,"\\u006bey":1}}',
	'{"info":01}',
	'{"info":"\\x41"}',
])(
	"rejects malformed or duplicate-key JSON throughout the captured source: %s",
	async (source) => {
		const input = await fixture(source);
		const released = observeOwnership();
		expect(() => run(input, "/info")).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		released();
	},
);

it.each(["default", "long-v1"] as const)(
	"does not admit %s HTML as JSON text",
	async (profile) => {
		const input = await fixture('<h1>Owned</h1><pre>{"info":1}</pre>', {
			mime: "text/html",
			profile,
		});
		const released = observeOwnership();
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => run(input, "/info")).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(load).not.toHaveBeenCalled();
		released(0);
	},
);

it("rejects a long-profile non-HTML receipt at capture admission before loading", async () => {
	const original = await fixture("<h1>Owned</h1><p>Source</p>", {
		mime: "text/html",
		profile: "long-v1",
	});
	const input = revised(original, (report) => {
		if (!report.primaryResponse) throw new Error("Expected response");
		report.primaryResponse.headers = {
			...report.primaryResponse.headers,
			"content-type": ["application/json"],
		};
	});
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	const close = vi.spyOn(DocumentTree.prototype, "close");
	expect(() => run(input, "")).toThrowError(
		expect.objectContaining({
			code: "invalid-input",
			message: "Invalid research evidence",
		}),
	);
	expect(validate).toHaveBeenCalledOnce();
	expect(validate.mock.results[0]?.type).toBe("throw");
	expect(load).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it("does not reinterpret a captured Markdown HTML document as JSON text", async () => {
	const input = await fixture(
		"<!doctype html><html><body><h1>Owned</h1></body></html>",
		{
			mime: "text/markdown",
			reader: true,
			execution: { readerMimePolicy: "markdown-html-document-v1" },
		},
	);
	const released = observeOwnership();
	expect(() => run(input, "")).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	released();
});

it("keeps source identity and receipt/body pins authoritative", async () => {
	const original = await fixture();
	const changedBody = original.body.slice();
	changedBody[0] ^= 1;
	const inputs = [
		{
			...original,
			trusted: { ...original.trusted, expectedReceiptSha256: "0".repeat(64) },
		},
		{
			...original,
			trusted: {
				...original.trusted,
				expectedBody: {
					bytes: original.body.byteLength + 1,
					sha256: hash(original.body),
				},
			},
		},
		{
			...original,
			trusted: {
				...original.trusted,
				expectedBody: {
					bytes: original.body.byteLength,
					sha256: "0".repeat(64),
				},
			},
		},
		revised(original, (report) => {
			if (!report.bodyCapture) throw new Error("Expected body capture");
			report.bodyCapture.data = Buffer.from(changedBody).toString("base64");
		}),
		revised(original, (report) => {
			report.finalUrl = `${url}/changed`;
		}),
	];
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const input of inputs)
		expect(() => run(input, "/info")).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(load).not.toHaveBeenCalled();
});

it("rejects a mutated native text document rather than selecting its replacement text", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const load = loader.loadResearchDocument;
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		const tree = load(...args);
		const info = textDocumentInfo(tree);
		if (!info) throw new Error("Expected native text document");
		tree.setTextContent(info.textNode, '{"info":"replacement"}');
		return tree;
	});
	expect(() => run(input, "/info")).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	released();
});

it("keeps failed, blocked and incomplete receipts evidence-only", async () => {
	const original = await fixture();
	const httpFailure = await fixture('{"info":1}', {
		status: 404,
		outcome: "http-failure",
	});
	const inputs = [
		httpFailure,
		revised(original, (report) => {
			Reflect.deleteProperty(report, "bodyCapture");
		}),
		revised(original, (report) => {
			report.outcome = "failure";
			report.contentSuccess = false;
			report.failure = { category: "unsupported", stage: "extraction" };
		}),
		revised(original, (report) => {
			report.outcome = "semantic-barrier";
			report.contentSuccess = false;
			report.classification.barrier = "challenge";
		}),
		{
			...original,
			trusted: {
				expectedProfile: original.trusted.expectedProfile,
				expectedReceiptSha256: original.trusted.expectedReceiptSha256,
			},
		},
	];
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const input of inputs)
		expect(() => run(input, "/info")).toThrowError(
			expect.objectContaining({ code: "policy-denied" }),
		);
	expect(load).not.toHaveBeenCalled();
});

it("enforces extraction byte limits without truncating a selected JSON literal", async () => {
	const input = await fixture(`{"info":1,\n"large":"${"é".repeat(128001)}"}`, {
		lines: { start: 1, end: 1 },
	});
	const released = observeOwnership();
	expect(run(input, "/info").report.selection.matches).toBe(1);
	for (const format of ["json", "markdown"] as const)
		expect(() => run(input, "/large", format)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	released();
});

it("accounts for serialized escapes within the extraction and final JSONL byte limits", async () => {
	const selected = `"${"\\n".repeat(70000)}"`;
	const bounded = await fixture(`{\n"info":${selected}}`, {
		lines: { start: 1, end: 1 },
	});
	const input = await fixture(`{\n"info":"${"\\n".repeat(110000)}"}`, {
		lines: { start: 1, end: 1 },
	});
	const released = observeOwnership();
	const result = run(bounded, "/info", "markdown");
	expect(result.report.extraction?.content).toBe(
		`\`\`\`\n${selected}\n\`\`\`\n`,
	);
	expect(result.outputBytes).toBeGreaterThan(210000);
	expect(() => run(input, "/info", "markdown")).toThrowError(
		expect.objectContaining({
			code: "resource-limit",
		}),
	);
	released();
});

it("checks cancellation before admission without exposing the abort reason", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	expect(() => run(input, "/info", "json", controller.signal)).toThrowError(
		expect.objectContaining({
			code: "aborted",
			message: expect.not.stringContaining(privateMarker),
		}),
	);
	expect(validate).not.toHaveBeenCalled();
});

it("checks cancellation after loading and releases admitted bytes and document", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const controller = new AbortController();
	const load = loader.loadResearchDocument;
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		const tree = load(...args);
		controller.abort();
		return tree;
	});
	expect(() => run(input, "/info", "json", controller.signal)).toThrowError(
		expect.objectContaining({ code: "aborted" }),
	);
	released();
});

it("checks deadlines after real extraction before publishing a result", async () => {
	const input = await fixture();
	const released = observeOwnership();
	let now = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const extract = extraction.extractDocument;
	vi.spyOn(extraction, "extractDocument").mockImplementationOnce((...args) => {
		const result = extract(...args);
		now += replay.researchJsonReplayLimits.timeoutMs + 1;
		return result;
	});
	expect(() => run(input, "/info")).toThrowError(
		expect.objectContaining({ code: "timeout" }),
	);
	released();
});

it("closes an initialized document when the real loader subsequently throws", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const load = loader.loadResearchDocument;
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		load(...args);
		throw new AgentBrowserError("unsupported", "Synthetic loader failure");
	});
	expect(() => run(input, "/info")).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	released();
});
