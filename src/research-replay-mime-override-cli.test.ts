import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchBodyCaptureLimit } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";

const policy = "markdown-html-document-v1";
const mimeFlags = ["--reader-mime-policy", policy];
const pins = [
	"--expected-profile",
	"default",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
];
const modes = [
	{
		name: "selector",
		flags: ["--selector", "main"],
		selection: { selector: "main" },
		method: "css-selector",
	},
	{
		name: "section",
		flags: ["--section", "#owned"],
		selection: { section: "#owned" },
		method: "heading-section",
	},
	{
		name: "content-focus",
		flags: ["--content-focus", "main-content-v1"],
		selection: { contentFocus: "main-content-v1" },
		method: "content-focus",
	},
];
const formats = [undefined, "json", "markdown"] as const;
const tableOptions = [
	{ flags: ["--table-metadata"], selection: { tableMetadata: true } },
	{
		flags: ["--format", "json", "--table-metadata"],
		selection: { tableMetadata: true },
	},
	{
		flags: ["--format", "markdown", "--table-rows"],
		selection: { tableRows: true },
	},
	{
		flags: ["--format", "markdown", "--compact-tables"],
		selection: { compactTables: true },
	},
	{
		flags: ["--format", "markdown", "--table-rows", "--compact-tables"],
		selection: { tableRows: true, compactTables: true },
	},
	{
		flags: [
			"--format",
			"markdown",
			"--table-rows",
			"--compact-tables",
			"--output-limit-policy",
			"text-prefix-v1",
		],
		selection: {
			tableRows: true,
			compactTables: true,
			outputLimitPolicy: "text-prefix-v1",
		},
	},
];
const url = "https://mime-override-cli.fixture.invalid/article";
const prefix = "<!doctype html><html><head>";
const source = `${prefix}<title>Saved article</title></head><body><nav>Outside navigation</nav><main><h1 id="owned">Owned article</h1><p>Owned evidence survives replay.</p><table><tr><th>Item</th><th>Value</th></tr><tr><td>Owned row</td><td>42</td></tr></table></main><h1>Outside end</h1><footer>Outside footer</footer></body></html>`;
const streams: Array<Readable | Writable> = [];

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function invalid(args: string[]) {
	expect(() => parseResearchReplayArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
}

function captureStreams(raw: Uint8Array, writeError?: Error) {
	const input = Readable.from([raw.subarray(0, 11), raw.subarray(11)], {
		objectMode: false,
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		write(chunk, _encoding, callback) {
			if (!writeError) chunks.push(Buffer.from(chunk));
			callback(writeError);
		},
	});
	for (const stream of [input, output]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

function listeners(stream: Readable | Writable) {
	return new Map(
		stream.eventNames().map((name) => [name, stream.listeners(name)]),
	);
}

async function fixture(
	text = source,
	options: {
		mime?: string;
		capturedPolicy?: boolean;
		visibility?: boolean;
		reader?: boolean;
	} = {},
) {
	const body = new TextEncoder().encode(text);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: {
			"content-type": [options.mime ?? "text/markdown; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		options.reader !== false,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			minRequestIntervalMs: 0,
			...(options.capturedPolicy ? { readerMimePolicy: policy } : {}),
			...(options.visibility
				? { readerVisibilityPolicy: "source-hidden-inline-v1" as const }
				: {}),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.outcome).toBe("extracted-unverified");
	expect(body).toEqual(new TextEncoder().encode(text));
	if (!options.capturedPolicy) {
		expect(report).not.toHaveProperty("readerMimePolicy");
		expect(report.reader ?? {}).not.toHaveProperty("mimePolicy");
		expect(report.reader ?? {}).not.toHaveProperty("mimeInterpretation");
	}
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	return { report, raw: serialized.jsonl, body };
}

function argumentsFor(
	value: Awaited<ReturnType<typeof fixture>>,
	selection = modes[0].flags,
	extra = mimeFlags,
) {
	return [
		"--expected-profile",
		"default",
		"--receipt-sha256",
		hash(value.raw),
		"--body-sha256",
		hash(value.body),
		"--body-bytes",
		String(value.body.byteLength),
		...selection,
		...extra,
	];
}

function revised(
	value: Awaited<ReturnType<typeof fixture>>,
	mutate: (report: ResearchNavigationReport) => void,
) {
	const report = structuredClone(value.report);
	mutate(report);
	return {
		...value,
		report,
		raw: new TextEncoder().encode(`${JSON.stringify(report)}\n`),
	};
}

function record(target: ReturnType<typeof captureStreams>) {
	expect(target.text().endsWith("\n")).toBe(true);
	expect(target.text().split("\n")).toHaveLength(2);
	return JSON.parse(target.text()) as replay.ResearchJsonReplayReport;
}

function expectClosedTrees(close: { mock: { contexts: unknown[] } }) {
	expect(close).toHaveBeenCalledOnce();
	const tree = close.mock.contexts[0];
	if (!(tree instanceof DocumentTree))
		throw new Error("Expected the replay-owned document tree");
	expect(tree.mutationMetrics().closed).toBe(true);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("MIME override replay CLI must not fetch");
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

describe("explicit replay MIME policy arguments", () => {
	it.each(
		modes.flatMap((mode) => formats.map((format) => ({ ...mode, format }))),
	)(
		"accepts ordinary $name with format $format",
		({ flags, selection, format }) => {
			const args = [
				...pins,
				...flags,
				...mimeFlags,
				...(format === undefined ? [] : ["--format", format]),
			];
			const original = [...args];
			expect(parseResearchReplayArguments(args)).toEqual({
				trusted: {
					expectedProfile: "default",
					expectedReceiptSha256: "a".repeat(64),
					expectedBody: { bytes: 64, sha256: "b".repeat(64) },
				},
				selection: { ...selection, readerMimePolicy: policy },
				...(format === undefined ? {} : { format }),
			});
			expect(args).toEqual(original);
		},
	);

	it.each(modes)(
		"preserves compatible $name table/output flags in either order",
		(mode) => {
			for (const option of tableOptions) {
				for (const args of [
					[...pins, ...mode.flags, ...mimeFlags, ...option.flags],
					[...mimeFlags, ...option.flags, ...mode.flags, ...pins],
				])
					expect(parseResearchReplayArguments(args).selection).toEqual({
						...mode.selection,
						readerMimePolicy: policy,
						...option.selection,
					});
			}
		},
	);

	it("does not add a policy to existing default or long-profile selections", () => {
		for (const profile of ["default", "long-v1"]) {
			for (const mode of modes) {
				for (const format of formats) {
					const parsed = parseResearchReplayArguments([
						"--expected-profile",
						profile,
						...pins.slice(2),
						...mode.flags,
						...(format === undefined ? [] : ["--format", format]),
					]);
					expect(parsed.selection).toEqual(mode.selection);
					expect(parsed.trusted.expectedProfile).toBe(profile);
				}
			}
		}
	});

	it.each([
		"",
		"markdown-html-document-v2",
		"MARKDOWN-HTML-DOCUMENT-V1",
		` ${policy}`,
		`${policy} `,
		`${policy}\n`,
		`\t${policy}`,
		"true",
	])("rejects invalid policy %j", (value) =>
		invalid([...pins, ...modes[0].flags, "--reader-mime-policy", value]),
	);

	it("rejects duplicates, equals syntax and missing values", () => {
		for (const extra of [
			[...mimeFlags, ...mimeFlags],
			[`--reader-mime-policy=${policy}`],
			["--reader-mime-policy"],
			["--reader-mime-policy", "--table-metadata"],
			["--reader-mime-policy", "--format", "markdown"],
		])
			invalid([...pins, ...modes[0].flags, ...extra]);
	});

	it.each(modes)(
		"rejects long-profile MIME override for $name",
		({ flags }) => {
			for (const format of formats)
				invalid([
					"--expected-profile",
					"long-v1",
					...pins.slice(2),
					...flags,
					...mimeFlags,
					...(format === undefined ? [] : ["--format", format]),
				]);
		},
	);

	it.each([
		{ flags: ["--links", "article"] },
		{ flags: ["--find", "Owned"] },
		{ flags: ["--lines", "1:2"] },
		{ flags: ["--headings", "--recover-output-limit"] },
	])("rejects discovery and literal mode $flags", ({ flags }) => {
		for (const format of formats)
			invalid([
				...pins,
				...flags,
				...mimeFlags,
				...(format === undefined ? [] : ["--format", format]),
			]);
	});

	it.each(["--recover-output-limit", "--recover-empty-outline"])(
		"rejects %s in either order for every HTML mode",
		(recovery) => {
			for (const profile of ["default", "long-v1"]) {
				for (const mode of modes) {
					const args = [
						"--expected-profile",
						profile,
						...pins.slice(2),
						...mode.flags,
					];
					invalid([...args, ...mimeFlags, recovery]);
					invalid([recovery, ...mimeFlags, ...args]);
				}
			}
		},
	);

	it("retains selection exclusivity and incompatible format/table/output checks", () => {
		for (const extra of [
			["--section", "#owned"],
			["--headings"],
			["--format", "html"],
			["--format", "json", "--format", "markdown"],
			["--format", "markdown", "--table-metadata"],
			["--table-rows"],
			["--compact-tables"],
			["--table-metadata", "--table-metadata"],
			["--output-limit-policy", "text-prefix-v1"],
			["--format", "json", "--output-limit-policy", "text-prefix-v1"],
		])
			invalid([...pins, ...modes[0].flags, ...mimeFlags, ...extra]);
		invalid([...pins, ...mimeFlags]);
	});

	it("accepts the 18-argument combined mode and rejects more than 19 arguments", () => {
		const args = [
			...pins,
			...modes[2].flags,
			...mimeFlags,
			...tableOptions[5].flags,
		];
		expect(args).toHaveLength(18);
		expect(parseResearchReplayArguments(args).selection).toEqual({
			...modes[2].selection,
			readerMimePolicy: policy,
			...tableOptions[5].selection,
		});
		const oversized = [...args, ...mimeFlags];
		expect(oversized).toHaveLength(20);
		invalid(oversized);
		invalid([
			...pins,
			...modes[0].flags,
			"--reader-mime-policy",
			"a".repeat(4097),
		]);
	});

	it("keeps all trusted pins required and respects the default body cap", () => {
		const args = [...pins, ...modes[0].flags, ...mimeFlags];
		for (let index = 0; index < pins.length; index += 2) {
			const missing = [...args];
			missing.splice(index, 2);
			invalid(missing);
		}
		for (const [flag, value] of [
			["--expected-profile", "long-v2"],
			["--receipt-sha256", "A".repeat(64)],
			["--body-sha256", "g".repeat(64)],
			["--body-bytes", "064"],
			["--body-bytes", String(researchBodyCaptureLimit + 1)],
		]) {
			const changed = [...args];
			changed[changed.indexOf(flag) + 1] = value;
			invalid(changed);
		}
		args[7] = String(researchBodyCaptureLimit);
		expect(parseResearchReplayArguments(args).trusted.expectedBody?.bytes).toBe(
			researchBodyCaptureLimit,
		);
	});

	it("rejects invalid override before touching streams or listeners", async () => {
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		const inputDestroy = vi.spyOn(target.input, "destroy");
		const outputDestroy = vi.spyOn(target.output, "destroy");
		const inputListeners = listeners(target.input);
		const outputListeners = listeners(target.output);
		await expect(
			runResearchReplayCli(
				[...pins, ...modes[0].flags, ...mimeFlags, "--recover-output-limit"],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(inputDestroy).not.toHaveBeenCalled();
		expect(outputDestroy).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(listeners(target.input)).toEqual(inputListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
	});
});

describe("explicit in-process replay MIME interpretation", () => {
	it.each(
		modes.flatMap((mode) =>
			(["json", "markdown"] as const).map((format) => ({ ...mode, format })),
		),
	)(
		"replays $name as $format from original policy-free capture with immutable pins and cleanup",
		async ({ flags, selection, method, format }) => {
			const value = await fixture();
			const original = structuredClone(value);
			const extract = vi.spyOn(replay, "extractResearchReplayJson");
			const close = vi.spyOn(DocumentTree.prototype, "close");
			const target = captureStreams(value.raw);
			const outputListeners = listeners(target.output);
			const args = argumentsFor(value, flags, [
				...mimeFlags,
				"--format",
				format,
			]);
			expect(
				await runResearchReplayCli(args, target.input, target.output),
			).toBe(0);
			expect(extract).toHaveBeenCalledExactlyOnceWith(
				expect.any(Uint8Array),
				parseResearchReplayArguments(args).trusted,
				{ ...selection, readerMimePolicy: policy },
				expect.any(AbortSignal),
				format,
			);
			const output = record(target);
			expect(output).toMatchObject({
				kind: "native-research-json-replay-v1",
				partial: true,
				contentSuccess: null,
				networkRequests: 0,
				outcome: "extracted-unverified",
				source: {
					profile: "default",
					reportedFinalUrl: url,
					receiptSha256: hash(value.raw),
					body: { bytes: value.body.byteLength, sha256: hash(value.body) },
				},
				selection: { method, readerMimePolicy: policy },
				reader: {
					mimeInterpretation: {
						policy,
						declaredMime: "text/markdown",
						effectiveMime: "text/html",
						basis: "html5-doctype-root-prefix",
						prefixCodeUnits: prefix.length,
					},
				},
				extraction: { format },
			});
			const content = JSON.stringify(output.extraction?.content);
			expect(content).toContain("Owned article");
			expect(content).toContain("Owned evidence survives replay");
			expect(content).not.toContain("Outside");
			expect(output).not.toHaveProperty("recovery");
			expect(output.selection).not.toHaveProperty("outputLimitPolicy");
			expect(output.extraction).not.toHaveProperty("contentFallback");
			if (method === "content-focus")
				expect(output.extraction).toMatchObject({
					contentSelection: {
						policy: "main-content-v1",
						selected: "main",
						reason: "unique-main",
					},
				});
			expect(value).toEqual(original);
			expect(extract.mock.calls[0][0]).not.toBe(value.raw);
			expect(extract.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
			expectClosedTrees(close);
			expect(listeners(target.output)).toEqual(outputListeners);
		},
	);

	it.each(tableOptions)(
		"runs compatible table/output flags $flags without inventing fallback metadata",
		async ({ flags, selection }) => {
			const value = await fixture();
			const target = captureStreams(value.raw);
			const args = argumentsFor(value, modes[2].flags, [
				...mimeFlags,
				...flags,
			]);
			expect(
				await runResearchReplayCli(args, target.input, target.output),
			).toBe(0);
			expect(parseResearchReplayArguments(args).selection).toMatchObject(
				selection,
			);
			const output = record(target);
			expect(output.selection).toMatchObject({ readerMimePolicy: policy });
			if ("outputLimitPolicy" in selection)
				expect(output.selection.outputLimitPolicy).toBe("text-prefix-v1");
			else expect(output.selection).not.toHaveProperty("outputLimitPolicy");
			expect(output.extraction).not.toHaveProperty("contentFallback");
			expect(JSON.stringify(output.extraction?.content)).toContain("Owned row");
		},
	);

	it("leaves default HTML replay and literal Markdown replay unchanged", async () => {
		const html = await fixture(source, { mime: "text/html; charset=utf-8" });
		const htmlTarget = captureStreams(html.raw);
		expect(
			await runResearchReplayCli(
				argumentsFor(html, modes[0].flags, []),
				htmlTarget.input,
				htmlTarget.output,
			),
		).toBe(0);
		const output = record(htmlTarget);
		expect(output.selection).not.toHaveProperty("readerMimePolicy");
		expect(output.reader).not.toHaveProperty("mimeInterpretation");
		const markdown = await fixture();
		const rejected = captureStreams(markdown.raw);
		await expect(
			runResearchReplayCli(
				argumentsFor(markdown, modes[0].flags, []),
				rejected.input,
				rejected.output,
			),
		).rejects.toMatchObject({ code: "unsupported" });
		expect(rejected.text()).toBe("");
		const literal = captureStreams(markdown.raw);
		expect(
			await runResearchReplayCli(
				argumentsFor(markdown, ["--lines", "1:1"], ["--format", "markdown"]),
				literal.input,
				literal.output,
			),
		).toBe(0);
		expect(record(literal).extraction?.content).toContain(source);
	});

	it.each([
		"# Genuine Markdown\n\nOwned prose, not HTML",
		`\`\`\`html\n${source}\n\`\`\``,
		"<main><h1>HTML fragment</h1></main>",
		"<html><head></head><body><main>No doctype</main></body></html>",
		`Prose before document\n${source}`,
	])(
		"rejects non-document Markdown instead of silently treating it as HTML: %j",
		async (text) => {
			const value = await fixture(text);
			const original = structuredClone(value);
			const extract = vi.spyOn(replay, "extractResearchReplayJson");
			const target = captureStreams(value.raw);
			await expect(
				runResearchReplayCli(argumentsFor(value), target.input, target.output),
			).rejects.toMatchObject({ code: "unsupported" });
			expect(target.text()).toBe("");
			expect(target.input.destroyed).toBe(true);
			expect(target.output.destroyed).toBe(true);
			expect(extract.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
			expect(value).toEqual(original);
		},
	);

	it.each(["text/html; charset=utf-8", "text/plain; charset=utf-8"])(
		"does not override other captured MIME %s",
		async (mime) => {
			const value = await fixture(source, { mime });
			const target = captureStreams(value.raw);
			await expect(
				runResearchReplayCli(argumentsFor(value), target.input, target.output),
			).rejects.toBeInstanceOf(AgentBrowserError);
			expect(target.text()).toBe("");
		},
	);

	it("keeps genuinely captured MIME policy replay working only without an override", async () => {
		const value = await fixture(source, { capturedPolicy: true });
		expect(value.report.readerMimePolicy).toBe(policy);
		expect(value.report.reader).toHaveProperty("mimeInterpretation");
		const original = structuredClone(value);
		const ordinary = captureStreams(value.raw);
		expect(
			await runResearchReplayCli(
				argumentsFor(value, modes[0].flags, []),
				ordinary.input,
				ordinary.output,
			),
		).toBe(0);
		expect(record(ordinary).selection).not.toHaveProperty("readerMimePolicy");
		const override = captureStreams(value.raw);
		await expect(
			runResearchReplayCli(
				argumentsFor(value),
				override.input,
				override.output,
			),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(override.text()).toBe("");
		expect(value).toEqual(original);
	});

	it("validates original literal visibility before applying HTML visibility", async () => {
		const value = await fixture(
			source.replace("<main>", "<main><p hidden>Hidden descendant</p>"),
			{ visibility: true },
		);
		expect(value.report.reader).toMatchObject({
			hiddenContentSemantics: false,
			sourceHiddenSubtrees: 0,
		});
		const original = structuredClone(value);
		const target = captureStreams(value.raw);
		expect(
			await runResearchReplayCli(
				argumentsFor(value),
				target.input,
				target.output,
			),
		).toBe(0);
		const output = record(target);
		expect(output.reader).toMatchObject({
			visibilityPolicy: "source-hidden-inline-v1",
			hiddenContentSemantics: "source-attributes-and-inline-display",
			sourceHiddenSubtrees: 1,
		});
		expect(JSON.stringify(output.extraction?.content)).not.toContain(
			"Hidden descendant",
		);
		expect(value).toEqual(original);
	});

	it("returns a barrier without content for a hidden source challenge discovered at replay", async () => {
		const value = await fixture(
			`${prefix}<title>Just a moment...</title></head><body><aside hidden>Checking your browser</aside><main><h1 id="owned">Owned article</h1></main></body></html>`,
			{ reader: false },
		);
		const original = structuredClone(value);
		const target = captureStreams(value.raw);
		expect(
			await runResearchReplayCli(
				argumentsFor(value, modes[2].flags),
				target.input,
				target.output,
			),
		).toBe(1);
		expect(record(target)).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			networkRequests: 0,
			selection: { readerMimePolicy: policy },
		});
		expect(record(target)).not.toHaveProperty("extraction");
		expect(target.text()).not.toContain("Owned article");
		expect(value).toEqual(original);
	});

	it.each(["--receipt-sha256", "--body-sha256", "--body-bytes"])(
		"rejects mismatched %s pins and clears the owned receipt",
		async (flag) => {
			const value = await fixture();
			const original = structuredClone(value);
			const extract = vi.spyOn(replay, "extractResearchReplayJson");
			const target = captureStreams(value.raw);
			const args = argumentsFor(value);
			args[args.indexOf(flag) + 1] =
				flag === "--body-bytes"
					? String(value.body.byteLength + 1)
					: "0".repeat(64);
			await expect(
				runResearchReplayCli(args, target.input, target.output),
			).rejects.toBeInstanceOf(AgentBrowserError);
			expect(target.text()).toBe("");
			expect(target.input.destroyed).toBe(true);
			expect(target.output.destroyed).toBe(true);
			expect(extract.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
			expect(value).toEqual(original);
		},
	);

	it.each([
		"failure",
		"challenge",
		"http",
		"missing-body",
		"truncated",
		"tampered-body",
		"malformed-policy",
		"charset",
	])("does not promote a re-pinned %s capture", async (reason) => {
		const original = await fixture();
		const value = revised(original, (report) => {
			if (reason === "failure") {
				report.outcome = "failure";
				report.contentSuccess = false;
				report.failure = { category: "unsupported", stage: "extraction" };
			} else if (reason === "challenge") {
				report.outcome = "semantic-barrier";
				report.contentSuccess = false;
				report.classification.barrier = "challenge";
			} else if (reason === "http") {
				if (!report.primaryResponse)
					throw new Error("Missing primary response");
				report.primaryResponse.status = 429;
			} else if (reason === "missing-body") {
				Reflect.deleteProperty(report, "bodyCapture");
			} else if (reason === "tampered-body") {
				if (!report.bodyCapture) throw new Error("Missing body capture");
				report.bodyCapture.data = Buffer.from(original.body)
					.fill(120)
					.toString("base64");
			} else if (reason === "malformed-policy") {
				Object.assign(report, { readerMimePolicy: "unknown-policy" });
			} else if (reason === "charset") {
				if (!report.reader) throw new Error("Missing reader");
				Object.assign(report.reader, { encoding: "windows-1252" });
			}
		});
		if (reason === "truncated")
			value.raw = value.raw.subarray(0, value.raw.byteLength - 8);
		const before = structuredClone(value);
		const target = captureStreams(value.raw);
		await expect(
			runResearchReplayCli(argumentsFor(value), target.input, target.output),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(target.text()).toBe("");
		expect(value).toEqual(before);
	});

	it("closes trees, clears the receipt and detaches listeners after output failure", async () => {
		const value = await fixture();
		const original = structuredClone(value);
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		const target = captureStreams(
			value.raw,
			new Error("Synthetic output failure"),
		);
		const outputListeners = listeners(target.output);
		await expect(
			runResearchReplayCli(argumentsFor(value), target.input, target.output),
		).rejects.toMatchObject({ code: "closed" });
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
		expectClosedTrees(close);
		expect(extract.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
		expect(listeners(target.output)).toEqual(outputListeners);
		expect(value).toEqual(original);
	});

	it("honors a pre-aborted signal without extraction or output", async () => {
		const value = await fixture();
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		const target = captureStreams(value.raw);
		const controller = new AbortController();
		controller.abort();
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		await expect(
			runResearchReplayCli(
				argumentsFor(value),
				target.input,
				target.output,
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(extract).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	});
});
