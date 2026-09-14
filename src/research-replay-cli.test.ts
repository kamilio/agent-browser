import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	researchReplayCliLimits,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";

const encoder = new TextEncoder();
const requestedUrl = "https://replay.fixture.invalid/start";
const finalUrl =
	"https://replay.fixture.invalid/final?private=query#not-reconstructed";
const streams: Array<Readable | Writable> = [];
const pendingWrites: Array<() => void> = [];
const profiles = ["default", "long-v1"] as const;
const parserArgs = [
	"--expected-profile",
	"default",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
	"--selector",
	"#owned",
];

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function replaceFlag(args: readonly string[], flag: string, value: string) {
	const result = [...args];
	const index = result.indexOf(flag);
	if (index < 0) throw new Error("Missing fixture flag");
	result[index + 1] = value;
	return result;
}

function track<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function input(chunks: Iterable<Uint8Array>) {
	return track(Readable.from(chunks, { objectMode: false }));
}

function pendingInput() {
	return track(new Readable({ read() {} }));
}

function sink(
	options: { held?: boolean; error?: Error; close?: boolean } = {},
) {
	const chunks: Buffer[] = [];
	let started: () => void = () => undefined;
	const writing = new Promise<void>((resolve) => {
		started = resolve;
	});
	const output = track(
		new Writable({
			highWaterMark: 1,
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				started();
				let completed = false;
				const finish = () => {
					if (completed) return;
					completed = true;
					callback(options.error);
				};
				pendingWrites.push(finish);
				if (options.close) this.destroy();
				else if (!options.held) finish();
			},
		}),
	);
	return {
		output,
		chunks,
		writing,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(stream: Readable | Writable) {
	return new Map(
		stream.eventNames().map((name) => [name, stream.listeners(name)]),
	);
}

async function streamCleanupTurn() {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function observed(operation: Promise<number>) {
	return operation.then(
		(code) => ({ kind: "success" as const, code }),
		(error: unknown) => ({ kind: "failure" as const, error }),
	);
}

async function fixture(
	source = '<h1>Owned heading</h1><main id="owned"><p>Owned body</p></main>',
	profile: ResearchDocumentProfileId = "default",
	reader = true,
	headings = true,
): Promise<Fixture> {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
		url: finalUrl,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	const report = await researchNavigation(
		requestedUrl,
		reader,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		headings,
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(source));
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

function argumentsFor(value: Fixture, selection = ["--selector", "#owned"]) {
	if (!value.trusted.expectedBody) throw new Error("Missing fixture body pin");
	return [
		"--expected-profile",
		value.trusted.expectedProfile,
		"--receipt-sha256",
		value.trusted.expectedReceiptSha256,
		"--body-sha256",
		value.trusted.expectedBody.sha256,
		"--body-bytes",
		String(value.trusted.expectedBody.bytes),
		...selection,
	];
}

function revised(
	value: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
) {
	const report = structuredClone(value.report);
	mutate(report);
	const raw = serializeResearchReport(
		report,
		value.trusted.expectedProfile,
	).jsonl;
	return {
		...value,
		report,
		raw,
		trusted: { ...value.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function record(
	target: ReturnType<typeof sink>,
): replay.ResearchJsonReplayReport {
	const text = target.text();
	expect(text.endsWith("\n")).toBe(true);
	expect(text.split("\n")).toHaveLength(2);
	expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
		replay.researchJsonReplayLimits.maxOutputBytes,
	);
	return JSON.parse(text) as replay.ResearchJsonReplayReport;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError(
			"policy-denied",
			"Unexpected synthetic replay request",
		),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Offline replay must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const stream of streams.splice(0)) stream.destroy();
		for (const complete of pendingWrites.splice(0)) complete();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("bounded replay CLI arguments", () => {
	it.each([false, true])(
		"accepts explicit output-limit section recovery with table metadata %s",
		(tableMetadata) => {
			const args = Object.freeze([
				...parserArgs.slice(0, 8),
				"--section",
				"#owned",
				"--recover-output-limit",
				...(tableMetadata ? ["--table-metadata"] : []),
			]);
			expect(parseResearchReplayArguments(args)).toMatchObject({
				recoverOutputLimit: true,
				selection: {
					section: "#owned",
					...(tableMetadata ? { tableMetadata: true } : {}),
				},
			});
		},
	);

	it.each([
		[...parserArgs, "--recover-output-limit"],
		[...parserArgs.slice(0, 8), "--links", "owned", "--recover-output-limit"],
		[
			...replaceFlag(parserArgs.slice(0, 8), "--expected-profile", "long-v1"),
			"--section",
			"#owned",
			"--recover-output-limit",
		],
		[
			...parserArgs.slice(0, 8),
			"--section",
			"#owned",
			"--recover-output-limit",
			"--recover-output-limit",
		],
		[
			...parserArgs.slice(0, 8),
			"--section",
			"#owned",
			"--recover-output-limit",
			"true",
		],
	])(
		"rejects recovery outside one explicit default-profile section: %j",
		(...args) => {
			expect(() => parseResearchReplayArguments(args)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		},
	);

	it("exposes fixed receipt, chunk and deadline bounds", () => {
		expect(researchReplayCliLimits).toEqual({
			maxReceiptBytes: 6_000_000,
			maxInputChunks: 65_536,
			timeoutMs: 30_000,
		});
	});

	it.each(profiles)(
		"parses independent pins for %s without mutating caller arguments",
		(profile) => {
			const args = Object.freeze(
				replaceFlag(parserArgs, "--expected-profile", profile),
			);
			const result = parseResearchReplayArguments(args);
			expect(result.trusted).toEqual({
				expectedProfile: profile,
				expectedReceiptSha256: "a".repeat(64),
				expectedBody: { bytes: 64, sha256: "b".repeat(64) },
			});
			expect(result.selection).toMatchObject({ selector: "#owned" });
			expect(args).toEqual(
				replaceFlag(parserArgs, "--expected-profile", profile),
			);
		},
	);

	it.each(["--selector", "--section"])(
		"accepts unordered flags and standalone table metadata with %s",
		(flag) => {
			const args = [
				"--table-metadata",
				flag,
				"#owned",
				"--body-bytes",
				"64",
				"--body-sha256",
				"b".repeat(64),
				"--receipt-sha256",
				"a".repeat(64),
				"--expected-profile",
				"long-v1",
			];
			expect(parseResearchReplayArguments(args).selection).toEqual({
				[flag.slice(2)]: "#owned",
				tableMetadata: true,
			});
		},
	);

	it("accepts bounded link substrings without enabling table metadata", () => {
		const result = parseResearchReplayArguments([
			...parserArgs.slice(0, 8),
			"--links",
			"graphics-cards/",
		]);
		expect(result.selection).toMatchObject({ links: "graphics-cards/" });
		expect(result.selection).not.toHaveProperty("tableMetadata");
	});

	it.each([
		["default", "0"],
		["default", "2000000"],
		["long-v1", "0"],
		["long-v1", "4000000"],
	])("accepts canonical body bound %s:%s", (profile, bytes) => {
		const args = replaceFlag(
			replaceFlag(parserArgs, "--expected-profile", profile),
			"--body-bytes",
			bytes,
		);
		expect(parseResearchReplayArguments(args).trusted.expectedBody?.bytes).toBe(
			Number(bytes),
		);
	});

	it("accepts exact selector and link-query length bounds", () => {
		const selector = `#${"a".repeat(4095)}`;
		expect(
			parseResearchReplayArguments(
				replaceFlag(parserArgs, "--selector", selector),
			).selection,
		).toMatchObject({ selector });
		const links = "a".repeat(256);
		expect(
			parseResearchReplayArguments([
				...parserArgs.slice(0, 8),
				"--links",
				links,
			]).selection,
		).toMatchObject({ links });
	});

	it.each([
		"--expected-profile",
		"--receipt-sha256",
		"--body-sha256",
		"--body-bytes",
		"--selector",
	])("requires the %s flag and value", (flag) => {
		const args = [...parserArgs];
		args.splice(args.indexOf(flag), 2);
		expect(() => parseResearchReplayArguments(args)).toThrow();
	});

	it.each([
		["--expected-profile", "other"],
		["--receipt-sha256", "A".repeat(64)],
		["--receipt-sha256", "a".repeat(63)],
		["--body-sha256", "g".repeat(64)],
		["--body-sha256", "b".repeat(65)],
		["--body-bytes", "-1"],
		["--body-bytes", "+1"],
		["--body-bytes", "00"],
		["--body-bytes", "01"],
		["--body-bytes", "1.0"],
		["--body-bytes", "1e2"],
		["--body-bytes", " 1"],
		["--body-bytes", "1 "],
		["--body-bytes", "2000001"],
		["--body-bytes", "9007199254740993"],
		["--selector", ""],
		["--selector", " #owned"],
		["--selector", "#owned "],
		["--selector", "main["],
		["--selector", `#${"a".repeat(4096)}`],
	])("rejects invalid %s value %#", (flag, value) => {
		expect(() =>
			parseResearchReplayArguments(replaceFlag(parserArgs, flag, value)),
		).toThrow();
	});

	it("rejects a long-profile body pin above its own cap", () => {
		const args = replaceFlag(
			replaceFlag(parserArgs, "--expected-profile", "long-v1"),
			"--body-bytes",
			"4000001",
		);
		expect(() => parseResearchReplayArguments(args)).toThrow();
	});

	it.each([
		"",
		"with space",
		"tab\tvalue",
		"line\nvalue",
		"nul\0value",
		"del\x7fvalue",
		"a".repeat(257),
	])("rejects invalid link substring %#", (links) => {
		expect(() =>
			parseResearchReplayArguments([
				...parserArgs.slice(0, 8),
				"--links",
				links,
			]),
		).toThrow();
	});

	it.each(
		[
			[...parserArgs, "receipt.json"],
			[...parserArgs, "https://example.invalid/receipt"],
			[...parserArgs, "--unknown"],
			[...parserArgs, "--selector", "main"],
			[...parserArgs, "--section", "h1"],
			[...parserArgs, "--table-metadata", "--table-metadata"],
			[...parserArgs.slice(0, 8), "--links", "result", "--table-metadata"],
			[...parserArgs.slice(0, 8), "--selector=#owned"],
			[...parserArgs.slice(0, 8), "--selector"],
			[...parserArgs.slice(0, 8), "--body-bytes", "64"],
		].map((args) => ({ args })),
	)(
		"rejects positional, duplicate, ambiguous or malformed flags %#",
		({ args }) => {
			expect(() => parseResearchReplayArguments(args)).toThrow();
		},
	);

	it("rejects arguments before reading, writing, destroying or attaching stream listeners", async () => {
		const source = pendingInput();
		const target = sink();
		const read = vi.spyOn(source, "read");
		const sourceDestroy = vi.spyOn(source, "destroy");
		const outputDestroy = vi.spyOn(target.output, "destroy");
		const sourceListeners = listeners(source);
		const outputListeners = listeners(target.output);
		await expect(
			runResearchReplayCli(["receipt.json"], source, target.output),
		).rejects.toBeInstanceOf(Error);
		expect(read).not.toHaveBeenCalled();
		expect(sourceDestroy).not.toHaveBeenCalled();
		expect(outputDestroy).not.toHaveBeenCalled();
		expect(listeners(source)).toEqual(sourceListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
		expect(target.text()).toBe("");
	});
});

describe("pinned offline replay integration", () => {
	it("recovers a pinned output-limited section without changing the original failed receipt", async () => {
		const destination = `https://example.com/${"x".repeat(4096)}`;
		const source = `<h2 id="owned">Owned section</h2><p>Readable saved content.</p><h2>References</h2><p>${`<a href="${destination}">Reference</a>`.repeat(70)}</p>`;
		const value = await fixture(source, "default", true, false);
		expect(value.report.failure?.resourceLimit?.kind).toBe("extraction.output");
		const original = value.raw.slice();
		const target = sink();
		const result = await runResearchReplayCli(
			argumentsFor(value, ["--section", "#owned", "--recover-output-limit"]),
			input([value.raw]),
			target.output,
		);
		expect(result).toBe(0);
		const output = record(target);
		expect(output.recovery).toMatchObject({
			kind: "captured-output-limit-section",
		});
		expect(output.networkRequests).toBe(0);
		expect(output.source.receiptSha256).toBe(
			value.trusted.expectedReceiptSha256,
		);
		expect(JSON.stringify(output.extraction)).toContain(
			"Readable saved content.",
		);
		expect(JSON.stringify(output.extraction)).not.toContain(destination);
		expect(value.raw).toEqual(original);
		expect(value.report.outcome).toBe("failure");
	});

	it.each(profiles)(
		"emits one bounded %s replay JSONL record without network or capture changes",
		async (profile) => {
			const value = await fixture(undefined, profile);
			const rawBefore = value.raw.slice();
			const bodyBefore = value.body.slice();
			const reportBefore = structuredClone(value.report);
			const source = input([value.raw.subarray(0, 17), value.raw.subarray(17)]);
			const target = sink();
			const sourceListeners = listeners(source);
			const outputListeners = listeners(target.output);
			const extract = vi.spyOn(replay, "extractResearchReplayJson");
			expect(
				await runResearchReplayCli(argumentsFor(value), source, target.output),
			).toBe(0);
			expect(extract).toHaveBeenCalledOnce();
			expect(record(target)).toMatchObject({
				kind: "native-research-json-replay-v1",
				outcome: "extracted-unverified",
				partial: true,
				contentSuccess: null,
				networkRequests: 0,
				source: {
					profile,
					receiptSha256: value.trusted.expectedReceiptSha256,
					body: value.trusted.expectedBody,
				},
				selection: { method: "css-selector", matches: 1 },
			});
			expect(target.text()).toContain("Owned body");
			expect(value.raw).toEqual(rawBefore);
			expect(value.body).toEqual(bodyBefore);
			expect(value.report).toEqual(reportBefore);
			await streamCleanupTurn();
			expect(listeners(source)).toEqual(sourceListeners);
			expect(listeners(target.output)).toEqual(outputListeners);
		},
	);

	it.each(profiles)(
		"retains %s reader math image alternatives in an explicitly selected section",
		async (profile) => {
			const formula = "x + y = z";
			const source =
				'<h1>Paper</h1><p>Outside prefix</p><h2 id="equation">Equation section</h2><p>Formula <math style="display:none"><mi>RAW_MATH_ONLY</mi></math><img aria-hidden="true" src="/equation.png" alt="x + y = z"> follows.</p><h2 id="next">Next section</h2><p>Outside suffix</p>';
			const value = await fixture(source, profile);
			const bodyBefore = value.body.slice();
			const rawBefore = value.raw.slice();
			const target = sink();
			expect(
				await runResearchReplayCli(
					argumentsFor(value, ["--section", "#equation"]),
					input([value.raw]),
					target.output,
				),
			).toBe(0);
			const result = record(target);
			expect(result.selection).toEqual({
				method: "heading-section",
				matches: 1,
			});
			expect(result.reader).toMatchObject({
				partial: true,
				scripting: false,
				styling: false,
				hiddenContentSemantics: false,
				omittedSubtrees: { math: 1 },
			});
			const extraction = JSON.stringify(result.extraction);
			expect(extraction).toContain(formula);
			expect(extraction).toContain("Equation section");
			for (const omitted of [
				"RAW_MATH_ONLY",
				"Outside prefix",
				"Outside suffix",
			])
				expect(extraction).not.toContain(omitted);
			expect(value.body).toEqual(bodyBefore);
			expect(value.raw).toEqual(rawBefore);
			const rawTree = parseHtmlDocument(source, finalUrl);
			try {
				expect(extractDocument(rawTree).content).not.toContain(formula);
			} finally {
				rawTree.close();
			}
		},
	);

	it("passes table metadata opt-in through to the existing replay extractor", async () => {
		const value = await fixture(
			'<h1>Results</h1><table id="owned"><tr><th id="heading" scope="col">Device</th></tr><tr><td headers="heading">42</td></tr></table>',
		);
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value, ["--selector", "#owned", "--table-metadata"]),
				input([value.raw]),
				target.output,
			),
		).toBe(0);
		expect(JSON.stringify(record(target).extraction)).toContain(
			"native-table-source-v1",
		);
	});

	it("discovers retained links without fetching their destinations", async () => {
		const value = await fixture(
			'<h1>Links</h1><a href="/graphics-cards/compare/">Compare</a><a href="/other/">Other</a>',
		);
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value, ["--links", "graphics-cards/"]),
				input([value.raw]),
				target.output,
			),
		).toBe(0);
		expect(record(target)).toMatchObject({
			selection: { method: "link-url-search", matches: 1 },
		});
		expect(target.text()).toContain("Compare");
	});

	it("returns one for an emitted empty extraction rather than inventing content", async () => {
		const value = await fixture(
			'<h1>Owned</h1><main id="owned"><span></span><br></main>',
		);
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value),
				input([value.raw]),
				target.output,
			),
		).toBe(1);
		expect(record(target)).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
		});
	});

	it("returns one for a barrier discovered during replay without retrying or falling back", async () => {
		const value = await fixture(
			'<title>Just a moment...</title><h1>Owned heading</h1><aside hidden>Checking your browser</aside><main id="owned">Selected</main>',
			"default",
			false,
		);
		expect(value.report.outcome).toBe("extracted-unverified");
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value),
				input([value.raw]),
				target.output,
			),
		).toBe(1);
		const result = record(target);
		expect(result).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			networkRequests: 0,
		});
		expect(result.extraction).toBeUndefined();
	});

	it.each(["--receipt-sha256", "--body-sha256", "--body-bytes"])(
		"rejects an independent mismatched %s pin with no stdout report",
		async (flag) => {
			const value = await fixture();
			const args = replaceFlag(
				argumentsFor(value),
				flag,
				flag === "--body-bytes"
					? String(value.body.byteLength + 1)
					: "0".repeat(64),
			);
			const target = sink();
			await expect(
				runResearchReplayCli(args, input([value.raw]), target.output),
			).rejects.toBeInstanceOf(Error);
			expect(target.text()).toBe("");
		},
	);

	it.each(["failed", "challenge", "429", "truncated"])(
		"does not promote a correctly pinned %s receipt into replay content",
		async (reason) => {
			const original = await fixture(undefined, "long-v1");
			const value = revised(original, (report) => {
				if (reason === "failed") {
					report.outcome = "failure";
					report.contentSuccess = false;
					report.failure = { category: "unsupported", stage: "extraction" };
				} else if (reason === "challenge") {
					report.outcome = "semantic-barrier";
					report.contentSuccess = false;
					report.classification.barrier = "challenge";
				} else if (reason === "429") {
					if (!report.primaryResponse)
						throw new Error("Missing fixture primary response");
					report.primaryResponse.status = 429;
				} else {
					if (!report.headings) throw new Error("Missing fixture headings");
					report.headings.truncated = true;
				}
			});
			const target = sink();
			await expect(
				runResearchReplayCli(
					argumentsFor(value),
					input([value.raw]),
					target.output,
				),
			).rejects.toBeInstanceOf(Error);
			expect(target.text()).toBe("");
		},
	);

	it("rejects multiple complete pinned JSONL records as a single input", async () => {
		const value = await fixture();
		const raw = Buffer.concat([value.raw, value.raw]);
		const args = replaceFlag(
			argumentsFor(value),
			"--receipt-sha256",
			hash(raw),
		);
		const target = sink();
		await expect(
			runResearchReplayCli(args, input([raw]), target.output),
		).rejects.toBeInstanceOf(Error);
		expect(target.text()).toBe("");
	});

	it("does not trim or re-encode receipt bytes before checking their external pin", async () => {
		const value = await fixture();
		const raw = Buffer.concat([
			Buffer.from(" \t"),
			value.raw,
			Buffer.from("\r\n"),
		]);
		const wrongTarget = sink();
		await expect(
			runResearchReplayCli(
				argumentsFor(value),
				input([raw]),
				wrongTarget.output,
			),
		).rejects.toBeInstanceOf(Error);
		expect(wrongTarget.text()).toBe("");
		const target = sink();
		const args = replaceFlag(
			argumentsFor(value),
			"--receipt-sha256",
			hash(raw),
		);
		expect(await runResearchReplayCli(args, input([raw]), target.output)).toBe(
			0,
		);
		expect(record(target).source.receiptSha256).toBe(hash(raw));
	});

	it.each([
		new Uint8Array(),
		Uint8Array.of(255),
		encoder.encode("{incomplete"),
	])(
		"rejects empty or malformed pinned bytes %# without emitting an error record",
		async (raw) => {
			const value = await fixture();
			const args = replaceFlag(
				argumentsFor(value),
				"--receipt-sha256",
				hash(raw),
			);
			const target = sink();
			await expect(
				runResearchReplayCli(args, input([raw]), target.output),
			).rejects.toBeInstanceOf(Error);
			expect(target.text()).toBe("");
		},
	);
});

describe("bounded byte-stream ownership and lifecycle", () => {
	it("passes a copied receipt to the extractor and clears it after success without wiping caller bytes", async () => {
		const value = await fixture();
		const caller = Buffer.from(value.raw);
		const before = caller.slice().toString("hex");
		const originalExtract = replay.extractResearchReplayJson;
		let owned: Uint8Array | undefined;
		vi.spyOn(replay, "extractResearchReplayJson").mockImplementation(
			(raw, ...rest) => {
				owned = raw;
				expect(raw).not.toBe(caller);
				if (raw.buffer === caller.buffer)
					expect(
						raw.byteOffset + raw.byteLength <= caller.byteOffset ||
							caller.byteOffset + caller.byteLength <= raw.byteOffset,
					).toBe(true);
				expect(hash(raw)).toBe(value.trusted.expectedReceiptSha256);
				return originalExtract(raw, ...rest);
			},
		);
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value),
				input([caller]),
				target.output,
			),
		).toBe(0);
		expect(owned).toBeDefined();
		expect(owned?.every((byte) => byte === 0)).toBe(true);
		expect(caller.toString("hex")).toBe(before);
	});

	it("clears the owned receipt on admission failure as well", async () => {
		const value = await fixture();
		const before = value.raw.slice();
		const originalExtract = replay.extractResearchReplayJson;
		let owned: Uint8Array | undefined;
		vi.spyOn(replay, "extractResearchReplayJson").mockImplementation(
			(raw, ...rest) => {
				owned = raw;
				return originalExtract(raw, ...rest);
			},
		);
		const target = sink();
		const args = replaceFlag(
			argumentsFor(value),
			"--body-sha256",
			"0".repeat(64),
		);
		await expect(
			runResearchReplayCli(args, input([value.raw]), target.output),
		).rejects.toBeInstanceOf(Error);
		expect(owned).toBeDefined();
		expect(owned?.every((byte) => byte === 0)).toBe(true);
		expect(value.raw).toEqual(before);
		expect(target.text()).toBe("");
	});

	it("accepts genuine Uint8Array chunks without requiring caller Buffer objects", async () => {
		const value = await fixture();
		const source = track(
			Readable.from([value.raw.slice(0, 31), value.raw.slice(31)], {
				objectMode: true,
			}),
		);
		const target = sink();
		expect(
			await runResearchReplayCli(argumentsFor(value), source, target.output),
		).toBe(0);
	});

	it.each([
		"string receipt",
		42,
		{ bytes: [123] },
		new DataView(new ArrayBuffer(4)),
	])("rejects non-byte stdin chunk %# before replay", async (chunk) => {
		const source = track(Readable.from([chunk], { objectMode: true }));
		const target = sink();
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		await expect(
			runResearchReplayCli(parserArgs, source, target.output),
		).rejects.toBeInstanceOf(Error);
		expect(extract).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(source.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	});

	it("enforces the aggregate receipt byte cap before invoking the extractor", async () => {
		const bytes = Buffer.alloc(researchReplayCliLimits.maxReceiptBytes, 32);
		const source = track(
			Readable.from([bytes, Uint8Array.of(32)], { objectMode: true }),
		);
		const target = sink();
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		await expect(
			runResearchReplayCli(parserArgs, source, target.output),
		).rejects.toBeInstanceOf(Error);
		expect(extract).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(source.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
		expect(bytes[0]).toBe(32);
		expect(bytes.at(-1)).toBe(32);
	});

	it("bounds chunk count independently of total receipt bytes", async () => {
		function* chunks() {
			for (
				let index = 0;
				index <= researchReplayCliLimits.maxInputChunks;
				index++
			)
				yield Uint8Array.of(32);
		}
		const source = track(Readable.from(chunks(), { objectMode: true }));
		const target = sink();
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		await expect(
			runResearchReplayCli(parserArgs, source, target.output),
		).rejects.toBeInstanceOf(Error);
		expect(extract).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(source.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	});

	it.each(["error", "close"])(
		"settles on premature input %s and restores caller listeners",
		async (mode) => {
			const source = track(
				new Readable({
					read() {
						this.destroy(
							mode === "error"
								? new Error("Synthetic input failure")
								: undefined,
						);
					},
				}),
			);
			const target = sink();
			const sourceListeners = listeners(source);
			const outputListeners = listeners(target.output);
			await expect(
				runResearchReplayCli(parserArgs, source, target.output),
			).rejects.toBeInstanceOf(Error);
			expect(target.text()).toBe("");
			expect(source.destroyed).toBe(true);
			expect(target.output.destroyed).toBe(true);
			await streamCleanupTurn();
			expect(listeners(source)).toEqual(sourceListeners);
			expect(listeners(target.output)).toEqual(outputListeners);
		},
	);

	it.each(["error", "close"])(
		"settles a pending output %s without retrying the JSONL record",
		async (mode) => {
			const value = await fixture();
			const source = input([value.raw]);
			const target = sink(
				mode === "error"
					? { error: new Error("Synthetic output failure") }
					: { close: true },
			);
			const outputListeners = listeners(target.output);
			await expect(
				runResearchReplayCli(argumentsFor(value), source, target.output),
			).rejects.toBeInstanceOf(Error);
			expect(target.chunks).toHaveLength(1);
			expect(target.text()).not.toContain("Synthetic output failure");
			expect(source.destroyed).toBe(true);
			expect(target.output.destroyed).toBe(true);
			await streamCleanupTurn();
			expect(listeners(target.output)).toEqual(outputListeners);
		},
	);

	it("waits for the output callback instead of reporting early success under backpressure", async () => {
		const value = await fixture();
		const target = sink({ held: true });
		let settled = false;
		const operation = runResearchReplayCli(
			argumentsFor(value),
			input([value.raw]),
			target.output,
		).finally(() => {
			settled = true;
		});
		const result = observed(operation);
		await target.writing;
		expect(settled).toBe(false);
		for (const complete of pendingWrites.splice(0)) complete();
		expect(await result).toEqual({ kind: "success", code: 0 });
		expect(target.chunks).toHaveLength(1);
		expect(record(target).outcome).toBe("extracted-unverified");
	});

	it("rejects a pre-aborted command without consuming its input", async () => {
		const controller = new AbortController();
		controller.abort();
		const source = pendingInput();
		const read = vi.spyOn(source, "read");
		const target = sink();
		await expect(
			runResearchReplayCli(
				parserArgs,
				source,
				target.output,
				controller.signal,
			),
		).rejects.toBeInstanceOf(Error);
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	});

	it("cancels pending input and removes command listeners", async () => {
		const controller = new AbortController();
		const source = pendingInput();
		const target = sink();
		const sourceListeners = listeners(source);
		const outputListeners = listeners(target.output);
		const result = observed(
			runResearchReplayCli(
				parserArgs,
				source,
				target.output,
				controller.signal,
			),
		);
		controller.abort();
		expect(await result).toMatchObject({
			kind: "failure",
			error: expect.any(Error),
		});
		expect(target.text()).toBe("");
		expect(source.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
		await streamCleanupTurn();
		expect(listeners(source)).toEqual(sourceListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
	});

	it("cancels an output write whose callback never arrives", async () => {
		const value = await fixture();
		const controller = new AbortController();
		const source = input([value.raw]);
		const target = sink({ held: true });
		const outputListeners = listeners(target.output);
		const result = observed(
			runResearchReplayCli(
				argumentsFor(value),
				source,
				target.output,
				controller.signal,
			),
		);
		await target.writing;
		controller.abort();
		expect(await result).toMatchObject({
			kind: "failure",
			error: expect.any(Error),
		});
		expect(target.output.destroyed).toBe(true);
		await streamCleanupTurn();
		expect(listeners(target.output)).toEqual(outputListeners);
		expect(target.chunks).toHaveLength(1);
	});

	it.each(["input", "output"])(
		"enforces and cleans up the deadline during pending %s",
		async (phase) => {
			const value = phase === "output" ? await fixture() : undefined;
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
			const source = value ? input([value.raw]) : pendingInput();
			const target = sink({ held: phase === "output" });
			const sourceListeners = listeners(source);
			const outputListeners = listeners(target.output);
			const result = observed(
				runResearchReplayCli(
					value ? argumentsFor(value) : parserArgs,
					source,
					target.output,
				),
			);
			if (phase === "output") await target.writing;
			await vi.advanceTimersByTimeAsync(researchReplayCliLimits.timeoutMs + 1);
			expect(await result).toMatchObject({
				kind: "failure",
				error: expect.any(Error),
			});
			expect(source.destroyed).toBe(true);
			expect(target.output.destroyed).toBe(true);
			await streamCleanupTurn();
			expect(listeners(source)).toEqual(sourceListeners);
			expect(listeners(target.output)).toEqual(outputListeners);
			expect(vi.getTimerCount()).toBe(0);
			if (phase === "input") expect(target.text()).toBe("");
		},
	);

	it("clears the deadline after a successful replay", async () => {
		const value = await fixture();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		const target = sink();
		expect(
			await runResearchReplayCli(
				argumentsFor(value),
				input([value.raw]),
				target.output,
			),
		).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});
