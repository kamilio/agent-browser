import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import {
	extractResearchReplayJson,
	researchJsonReplayLimits,
} from "../scripts/research-json-replay.js";
import { runResearchReplayCli } from "../scripts/research-replay-cli.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type ExtractedNode, extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResearchReaderRawPolicy,
	setResearchReaderInfo,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const url = "https://math-alternatives.fixture.invalid/article";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const streams: Array<Readable | Writable> = [];
const policies = [undefined, "separate-omitted-raw-v1"] as const;
const configurations = (["default", "long-v1"] as const).flatMap((profile) =>
	policies.map((rawPolicy) => ({ profile, rawPolicy })),
);
type Configuration = {
	profile: ResearchDocumentProfileId;
	rawPolicy?: ResearchReaderRawPolicy;
};
const defaultConfiguration: Configuration = { profile: "default" };
const source = '<p>A<math alttext="x&amp;😀"><mi>G</mi></math>B</p>';
const html = "<p>A<code>MathML source: x&amp;😀</code>B</p>";
const alternative = { elements: 1, codeUnits: 4 };

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Math alternative tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const query of queries.splice(0)) query.close();
		for (const tree of trees.splice(0)) tree.close();
		for (const stream of streams.splice(0)) stream.destroy();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function sanitize(
	input: string,
	configuration = defaultConfiguration,
	limits: Partial<ResearchReaderLimits> = {},
	signal?: AbortSignal,
) {
	return sanitizeResearchHtml(
		input,
		limits,
		signal,
		configuration.profile,
		configuration.rawPolicy,
	);
}

function response(input: string): NetworkResponse {
	const body = encoder.encode(input);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function load(
	input: string,
	configuration = defaultConfiguration,
	limits: Partial<DocumentLimits> = {},
	context: Partial<DocumentLoaderContext> = {},
) {
	const tree = loadResearchDocument(
		response(input),
		{
			tabId: "synthetic-math-alternatives",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 1024,
				maxDepth: 64,
				maxTextCodeUnits: 100_000,
				maxChanges: 1024,
				...limits,
			},
			...context,
		},
		configuration.profile,
		configuration.rawPolicy,
	);
	trees.push(tree);
	return tree;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function json(tree: DocumentTree) {
	const result = extractDocument(tree, { format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected bounded rejection");
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function capture(input: string, configuration: Configuration) {
	const supplied = response(input);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		supplied,
	);
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
		configuration.profile,
		{ minRequestIntervalMs: 0, readerRawPolicy: configuration.rawPolicy },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(supplied.body).toEqual(encoder.encode(input));
	expect(
		decodeResearchBodyCapture(report.bodyCapture, configuration.profile),
	).toEqual(supplied.body);
	const serialized = serializeResearchReport(report, configuration.profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted = {
		expectedProfile: configuration.profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: {
			bytes: supplied.body.byteLength,
			sha256: hash(supplied.body),
		},
	} satisfies TrustedResearchReplayAdmission;
	return { report, raw, trusted, body: supplied.body };
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

it.each(configurations)(
	"retains exact labeled source and omission counts for $profile/$rawPolicy",
	(configuration) => {
		const sanitized = sanitize(source, configuration);
		expect(sanitized.html).toBe(html);
		expect(sanitized.report).toEqual({
			profile: "native-semantic-reader-v1",
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			sourceCodeUnits: source.length,
			textCodeUnits: 7,
			outputCodeUnits: html.length,
			tokens: 9,
			omittedTokens: 5,
			omittedSubtrees: { math: 1 },
			ignoredAttributes: 0,
			unwrappedElements: 0,
			tokenizerIssues: 0,
			mathAlternatives: alternative,
			...(configuration.rawPolicy
				? {
						rawTextPolicy: configuration.rawPolicy,
						omittedRaw: {
							codeUnits: 0,
							workUnits: 0,
							steps: 0,
							elements: 0,
							maxWorkUnits: 32_000_000,
							maxWindowCodeUnits: 65_536,
						},
					}
				: {}),
		});
		const tree = load(source, configuration);
		expect(researchReaderInfo(tree)).toEqual({
			...sanitized.report,
			encoding: "utf-8",
		});
		const result = json(tree);
		const codes = flattened(result.content).filter(
			(node) => node.type === "code",
		);
		expect(codes).toHaveLength(1);
		expect(codes[0].children).toEqual([
			expect.objectContaining({ type: "text", text: "MathML source: x&😀" }),
		]);
		expect(result.reader?.mathAlternatives).toEqual(alternative);
		expect(extractDocument(tree).content).toBe("A` MathML source: x&😀 `B\n");
	},
);

it.each([
	"",
	" alttext",
	'alttext=""',
	'alttext=" \t\r\n "',
	'alttext="&#32;&#9;&#10;"',
	'alttext="&nbsp;"',
	'title="not an alternative"',
	'aria-label="not an alternative"',
	'alt="not an alternative"',
])("keeps the no-alternative path unchanged for %s", (attributes) => {
	const input = `<p>A<math ${attributes}><mi>G</mi></math>B</p>`;
	for (const configuration of configurations) {
		const sanitized = sanitize(input, configuration);
		const baseline = sanitize(
			"<p>A<math><mi>G</mi></math>B</p>",
			configuration,
		);
		expect(sanitized.html).toBe("<p>AB</p>");
		expect(sanitized.report).toEqual({
			...baseline.report,
			sourceCodeUnits: input.length,
		});
		expect(sanitized.report).not.toHaveProperty("mathAlternatives");
		const tree = load(input, configuration);
		expect(researchReaderInfo(tree)).not.toHaveProperty("mathAlternatives");
		expect(json(tree).reader).not.toHaveProperty("mathAlternatives");
		expect(extractDocument(tree).content).toBe("AB\n");
	}
});

it.each([
	{
		encoded: "&amp;&lt;&gt;&quot;",
		decoded: '&<>"',
		escaped: "&amp;&lt;&gt;&quot;",
	},
	{ encoded: "&#x1f600;e&#769;", decoded: "😀é", escaped: "😀é" },
	{ encoded: "  x\t+ y  ", decoded: "  x\t+ y  ", escaped: "  x\t+ y  " },
	{ encoded: "x\r\ny\rz", decoded: "x\ny\nz", escaped: "x\ny\nz" },
	{ encoded: "x&#13;y", decoded: "x\ry", escaped: "x&#13;y" },
	{ encoded: "x\0y", decoded: "x\0y", escaped: "x\0y" },
	{ encoded: "&#0;&#xD800;&#x110000;", decoded: "���", escaped: "���" },
	{
		encoded: "&#1;&#27;&#x202e;x",
		decoded: "\u0001\u001b\u202ex",
		escaped: "\u0001\u001b\u202ex",
	},
	{
		encoded: "&amp;lt;script&amp;gt;",
		decoded: "&lt;script&gt;",
		escaped: "&amp;lt;script&amp;gt;",
	},
])(
	"decodes, counts and escapes source $encoded exactly once",
	({ encoded, decoded, escaped }) => {
		const input = `<math alttext="${encoded}"/>`;
		const sanitized = sanitize(input);
		const expected = `<code>MathML source: ${escaped}</code>`;
		expect(sanitized.html).toBe(expected);
		expect(sanitized.report).toMatchObject({
			sourceCodeUnits: input.length,
			textCodeUnits: decoded.length,
			outputCodeUnits: expected.length,
			tokens: 1,
			omittedTokens: 1,
			omittedSubtrees: { math: 1 },
			mathAlternatives: { elements: 1, codeUnits: decoded.length },
		});
	},
);

it.each([
	{ encoded: "x\r\ny\rz", cleaned: "x\ny\nz", inline: "x y z", codeUnits: 5 },
	{ encoded: "x&#13;y", cleaned: "x\ny", inline: "x y", codeUnits: 3 },
])(
	"uses native JSON cleaning and inline newline normalization for $encoded",
	({ encoded, cleaned, inline, codeUnits }) => {
		const tree = load(`<math alttext="${encoded}"/>`);
		const result = json(tree);
		expect(
			flattened(result.content)
				.filter((node) => node.type === "text")
				.map((node) => node.text),
		).toEqual([`MathML source: ${cleaned}`]);
		expect(result.reader?.mathAlternatives).toEqual({ elements: 1, codeUnits });
		expect(extractDocument(tree).content).toBe(
			`\` MathML source: ${inline} \`\n`,
		);
	},
);

it.each([
	{ attributes: 'alttext="first" alttext="second"', value: "first" },
	{ attributes: 'ALTTEXT="first" alttext="second"', value: "first" },
	{ attributes: 'alttext=" " alttext="second"', value: undefined },
])(
	"retains tokenizer first-wins semantics for $attributes",
	({ attributes, value }) => {
		const sanitized = sanitize(`<MATH ${attributes}/>`);
		expect(sanitized.html).toBe(
			value ? `<code>MathML source: ${value}</code>` : "",
		);
		expect(sanitized.report.tokenizerIssues).toBe(1);
		if (value)
			expect(sanitized.report.mathAlternatives).toEqual({
				elements: 1,
				codeUnits: value.length,
			});
		else expect(sanitized.report).not.toHaveProperty("mathAlternatives");
	},
);

it("retains multiple and selfclosing alternatives without leaking nested math", () => {
	const input =
		'<math alttext="x"/><math alttext="y"><mi>g</mi></math><math alttext="z"><math alttext="SECRET"><mi>h</mi></math></math>';
	const sanitized = sanitize(input);
	expect(sanitized.html).toBe(
		"<code>MathML source: x</code><code>MathML source: y</code><code>MathML source: z</code>",
	);
	expect(sanitized.report).toMatchObject({
		textCodeUnits: 5,
		tokens: 13,
		omittedTokens: 13,
		omittedSubtrees: { math: 3 },
		mathAlternatives: { elements: 3, codeUnits: 3 },
	});
});

it.each(
	[
		"svg",
		"script",
		"style",
		"template",
		"iframe",
		"object",
		"canvas",
		"textarea",
	].flatMap((ancestor) =>
		policies.map((rawPolicy) => ({ ancestor, rawPolicy })),
	),
)(
	"does not leak alternatives beneath omitted $ancestor/$rawPolicy",
	({ ancestor, rawPolicy }) => {
		const input = `<${ancestor}><math alttext="PRIVATE"><mi>G</mi></math></${ancestor}><p>After</p>`;
		const sanitized = sanitize(input, { profile: "default", rawPolicy });
		expect(sanitized.html).toBe("<p>After</p>");
		expect(sanitized.report.omittedSubtrees).toEqual({ [ancestor]: 1 });
		expect(sanitized.report).not.toHaveProperty("mathAlternatives");
		expect(
			JSON.stringify(json(load(input, { profile: "default", rawPolicy }))),
		).not.toContain("PRIVATE");
	},
);

it("keeps markup, backticks, controls and hydration inert in JSON and Markdown", () => {
	const payload = "</code><script>evil()</script>```[go](javascript:evil())";
	const encoded = payload.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	const input = `<main><math alttext="${encoded}&#27;&#x202e;"><semantics><mi>GLYPH_PRIVATE</mi><annotation>ANNOTATION_PRIVATE</annotation><annotation-xml><script>HYDRATION_PRIVATE</script></annotation-xml></semantics></math></main>`;
	const tree = load(input);
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	expect(
		owner.querySelectorAll("math, script, annotation, annotation-xml, a"),
	).toEqual([]);
	expect(owner.querySelectorAll("code")).toHaveLength(1);
	const result = json(tree);
	const cleaned = `MathML source: ${payload}\\u{1b}\\u{202e}`;
	expect(
		flattened(result.content)
			.filter((node) => node.type === "text")
			.map((node) => node.text),
	).toEqual([cleaned]);
	expect(extractDocument(tree).content).toBe(`\`\`\`\` ${cleaned} \`\`\`\`\n`);
	for (const marker of [
		"GLYPH_PRIVATE",
		"ANNOTATION_PRIVATE",
		"HYDRATION_PRIVATE",
		"\u001b",
		"\u202e",
	])
		expect(JSON.stringify(result)).not.toContain(marker);
});

it.each(configurations)(
	"keeps inline/table cell placement with tableRows for $profile/$rawPolicy",
	(configuration) => {
		const input =
			'<main><p>Before <math alttext="x"/> after</p><table><tr><th>Formula</th><td>Left <math alttext="y"/> right</td></tr></table></main>';
		expect(sanitize(input, configuration).html).toBe(
			"<main><p>Before <code>MathML source: x</code> after</p><table><tr><th>Formula</th><td>Left <code>MathML source: y</code> right</td></tr></table></main>",
		);
		const tree = load(input, configuration);
		const result = extractDocument(tree, { tableRows: true });
		expect(result).toMatchObject({
			format: "markdown",
			tableRows: true,
			reader: { mathAlternatives: { elements: 2, codeUnits: 2 } },
		});
		expect(result.content).toBe(
			[
				"Before ` MathML source: x ` after",
				"",
				"**Native table begin (selected structure only; associations unspecified)**",
				"- Row 1",
				"  - Cell 1: Formula",
				"  - Cell 2: Left ` MathML source: y ` right",
				"**Native table end**",
				"",
			].join("\n"),
		);
		const cells = flattened(json(tree).content).filter(
			(node) => node.type === "cell",
		);
		expect(cells).toHaveLength(2);
		expect(
			flattened(cells[1]).filter((node) => node.type === "code"),
		).toHaveLength(1);
	},
);

const boundedSource = '<math alttext="😀&amp;"><mi>G</mi></math>';
const boundedHtml = "<code>MathML source: 😀&amp;</code>";
const boundaries = [
	{
		option: "maxSourceCodeUnits",
		kind: "reader.source",
		boundary: boundedSource.length,
	},
	{ option: "maxTextCodeUnits", kind: "reader.text", boundary: 4 },
	{
		option: "maxOutputCodeUnits",
		kind: "reader.output",
		boundary: boundedHtml.length,
	},
	{ option: "maxTokens", kind: "reader.tokens", boundary: 5 },
	{ option: "maxDepth", kind: "reader.depth", boundary: 2 },
] as const;

it.each(
	configurations.flatMap((configuration) =>
		boundaries.map((boundary) => ({ ...configuration, ...boundary })),
	),
)(
	"keeps exact $option boundaries for $profile/$rawPolicy including omitted descendants",
	({ option, kind, boundary, ...configuration }) => {
		expect(
			sanitize(boundedSource, configuration, { [option]: boundary }).html,
		).toBe(boundedHtml);
		const error = failure(() =>
			sanitize(boundedSource, configuration, { [option]: boundary - 1 }),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind,
			limit: boundary - 1,
			observed: boundary,
		});
	},
);

it("keeps separate retained and omitted depth accounting after an alternative", () => {
	const input = '<main><p><math alttext="x"><mi>G</mi></math></p></main>';
	expect(sanitize(input, defaultConfiguration, { maxDepth: 2 }).html).toBe(
		"<main><p><code>MathML source: x</code></p></main>",
	);
});

it.each(
	[
		'<math alttext="x"><mi>G</math>',
		'<math alttext="x"><mi>G</mi>',
		'<math alttext="x"><!--unterminated',
		'<math alttext="x"><mi title="unterminated',
		'<math alttext="x"><script>unterminated',
		'<math alttext="x"><svg></math></svg>',
		'<math alttext="x"><![CDATA[private]]></math>',
	].flatMap((input) => policies.map((rawPolicy) => ({ input, rawPolicy }))),
)(
	"rejects malformed descendants after an alternative for $rawPolicy: $input",
	({ input, rawPolicy }) => {
		expect(() => sanitize(input, { profile: "default", rawPolicy })).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each(configurations)(
	"checks cancellation throughout alternatives and descendants for $profile/$rawPolicy",
	(configuration) => {
		const input = '<math alttext="x"><mi>G</mi><script>raw</script></math>';
		let checks = 0;
		sanitize(input, configuration, {}, {
			get aborted() {
				checks++;
				return false;
			},
		} as AbortSignal);
		expect(checks).toBeGreaterThan(5);
		for (let abortAt = 1; abortAt <= checks; abortAt++) {
			let current = 0;
			const signal = {
				get aborted() {
					return ++current >= abortAt;
				},
			} as AbortSignal;
			const error = failure(() => sanitize(input, configuration, {}, signal));
			expect(error).toMatchObject({ code: "aborted" });
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
		const controller = new AbortController();
		controller.abort();
		const initializeDocument = vi.fn();
		expect(() =>
			load(
				input,
				configuration,
				{},
				{ signal: controller.signal, initializeDocument },
			),
		).toThrow(expect.objectContaining({ code: "aborted" }));
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it.each(configurations)(
	"charges generated output to document admission for $profile/$rawPolicy",
	(configuration) => {
		const input = `<math alttext="${"&".repeat(20)}"/>`;
		const expected = `<code>MathML source: ${"&amp;".repeat(20)}</code>`;
		expect(input.length).toBeLessThan(expected.length);
		const error = failure(() =>
			load(input, configuration, { maxTextCodeUnits: expected.length - 1 }),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.output",
			unit: "code-units",
			limit: expected.length - 1,
			observed: expected.length,
		});
		const tree = load(input, configuration, {
			maxTextCodeUnits: expected.length,
		});
		expect(researchReaderInfo(tree)?.mathAlternatives).toEqual({
			elements: 1,
			codeUnits: 20,
		});
		expect(extractDocument(tree).content).toBe(
			`\` MathML source: ${"&".repeat(20)} \`\n`,
		);
	},
);

it("closes a partially initialized tree when generated code exceeds document nodes", () => {
	let initialized: DocumentTree | undefined;
	const error = failure(() =>
		load(
			'<math alttext="x"/>',
			defaultConfiguration,
			{ maxNodes: 5 },
			{
				initializeDocument(tree) {
					initialized = tree;
				},
			},
		),
	);
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "document.nodes",
		limit: 5,
		observed: 6,
	});
	expect(initialized).toBeDefined();
	expect(initialized?.mutationMetrics().closed).toBe(true);
	if (initialized) expect(researchReaderInfo(initialized)).toBeUndefined();
});

it("freezes independent sanitizer and attached metadata and removes it on close", () => {
	const sanitized = sanitize(source);
	const tree = load(source);
	const attached = researchReaderInfo(tree);
	expect(attached?.mathAlternatives).toEqual(alternative);
	for (const report of [sanitized.report, attached]) {
		expect(Object.isFrozen(report)).toBe(true);
		expect(Object.isFrozen(report?.mathAlternatives)).toBe(true);
		expect(Object.isFrozen(report?.omittedSubtrees)).toBe(true);
		expect(() =>
			Object.assign(report?.mathAlternatives ?? {}, { elements: 99 }),
		).toThrow(TypeError);
	}
	const mutable = { ...sanitized.report, mathAlternatives: { ...alternative } };
	setResearchReaderInfo(tree, mutable);
	mutable.mathAlternatives.elements = 99;
	expect(researchReaderInfo(tree)?.mathAlternatives).toEqual(alternative);
	expect(researchReaderInfo(tree)?.mathAlternatives).not.toBe(
		mutable.mathAlternatives,
	);
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	const revision = tree.revision;
	expect(json(tree).reader?.mathAlternatives).toEqual(alternative);
	expect(tree.revision).toBe(revision);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
	expect(tree.mutationMetrics().closed).toBe(true);
	expect(() => owner.querySelector("code")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(attached?.mathAlternatives).toEqual(alternative);
});

it.each(["json", "markdown"] as const)(
	"retains exact serialized extraction byte limits for %s",
	(format) => {
		const tree = load(source);
		const result = extractDocument(tree, { format });
		const bytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(result);
		const error = failure(() =>
			extractDocument(tree, { format, maxBytes: bytes - 1 }),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "extraction.output",
			unit: "bytes",
			limit: bytes - 1,
			observed: bytes,
		});
	},
);

it.each(configurations)(
	"preserves math reports and receipt bytes through mocked capture, admission and CLI for $profile/$rawPolicy",
	async (configuration) => {
		const input = `<main><h1 id="owned">Math fixture</h1>${source}<table><tr><td><math alttext="y"/></td></tr></table></main>`;
		const fixture = await capture(input, configuration);
		const retained = { elements: 2, codeUnits: 5 };
		expect(fixture.report.reader?.mathAlternatives).toEqual(retained);
		expect(
			JSON.parse(Buffer.from(fixture.raw).toString("utf8")).reader
				.mathAlternatives,
		).toEqual(retained);
		const original = fixture.raw.slice();
		const originalBody = fixture.body.slice();
		const originalPins = structuredClone(fixture.trusted);
		const close = vi.spyOn(DocumentTree.prototype, "close");
		for (const format of ["json", "markdown"] as const) {
			const selection = {
				selector: "main",
				...(format === "markdown" ? { tableRows: true } : {}),
			};
			const replay = extractResearchReplayJson(
				fixture.raw,
				fixture.trusted,
				selection,
				undefined,
				format,
			);
			expect(replay.report).toMatchObject({
				networkRequests: 0,
				outcome: "extracted-unverified",
				reader: { mathAlternatives: retained },
				extraction: { format, reader: { mathAlternatives: retained } },
			});
			expect(Object.isFrozen(replay.report.reader?.mathAlternatives)).toBe(
				true,
			);
			expect(JSON.parse(replay.jsonl).reader.mathAlternatives).toEqual(
				retained,
			);
			expect(JSON.stringify(replay.report.extraction)).toContain(
				"MathML source: x&😀",
			);
			const target = captureStreams(fixture.raw);
			expect(
				await runResearchReplayCli(
					[
						"--expected-profile",
						configuration.profile,
						"--receipt-sha256",
						fixture.trusted.expectedReceiptSha256,
						"--body-sha256",
						fixture.trusted.expectedBody.sha256,
						"--body-bytes",
						String(fixture.body.byteLength),
						"--selector",
						"main",
						"--format",
						format,
						...(format === "markdown" ? ["--table-rows"] : []),
					],
					target.input,
					target.output,
				),
			).toBe(0);
			const output = JSON.parse(target.text());
			expect(output).toMatchObject({
				networkRequests: 0,
				reader: { mathAlternatives: retained },
				extraction: { format, reader: { mathAlternatives: retained } },
				source: {
					receiptSha256: hash(original),
					body: fixture.trusted.expectedBody,
				},
			});
			if (format === "markdown")
				expect(output.extraction.content).toContain(
					"  - Cell 1: ` MathML source: y `",
				);
		}
		expect(close).toHaveBeenCalledTimes(4);
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected closed replay tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
		expect(() =>
			extractResearchReplayJson(
				fixture.raw,
				{ ...fixture.trusted, expectedReceiptSha256: "0".repeat(64) },
				{ selector: "main" },
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		const controller = new AbortController();
		controller.abort();
		expect(() =>
			extractResearchReplayJson(
				fixture.raw,
				fixture.trusted,
				{ selector: "main" },
				controller.signal,
			),
		).toThrow(expect.objectContaining({ code: "aborted" }));
		expect(close).toHaveBeenCalledTimes(4);
		expect(fixture.raw).toEqual(original);
		expect(fixture.body).toEqual(originalBody);
		expect(fixture.trusted).toEqual(originalPins);
	},
);

it.each(configurations)(
	"keeps replay extraction budgets and cleanup for $profile/$rawPolicy",
	async (configuration) => {
		const units = researchJsonReplayLimits.maxExtractionBytes + 1;
		const fixture = await capture(
			`<h1>Math fixture</h1><main><math alttext="${"x".repeat(units)}"/></main>`,
			configuration,
		);
		const original = fixture.raw.slice();
		expect(fixture.report.reader?.mathAlternatives).toEqual({
			elements: 1,
			codeUnits: units,
		});
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const error = failure(() =>
			extractResearchReplayJson(fixture.raw, fixture.trusted, {
				selector: "main",
			}),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind: "extraction.output",
			limit: 256_000,
		});
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected closed replay tree");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(researchReaderInfo(tree)).toBeUndefined();
		expect(fixture.raw).toEqual(original);
		expect(hash(fixture.body)).toBe(fixture.trusted.expectedBody.sha256);
	},
);
