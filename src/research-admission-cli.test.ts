import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchExitReport,
	researchEvidenceCodecLimits,
	researchLongAdmissionProvenance,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import * as capture from "../scripts/research-body-capture.js";
import {
	emitResearchReport,
	parseResearchArguments,
	researchExitCode,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type {
	NetworkLimits,
	NetworkRequest,
	NetworkResponse,
} from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://admission-cli.fixture.invalid/paper";
const otherUrl = "https://admission-cli.fixture.invalid/other";
const longFlags = [
	"--document-profile",
	"long-v1",
	"--reader",
	"--capture-body",
	"--headings",
];
const profiles = [undefined, "default", "long-v1"] as const;
const sessions: BrowserSession[] = [];
const streams: Readable[] = [];
const inputs: Array<{ body: Buffer; before: Buffer }> = [];
const requests: Array<{
	input: NetworkRequest;
	transport: NodeNetworkTransport;
	limits: Readonly<NetworkLimits>;
}> = [];
const outputs: Writable[] = [];
const completeWrites: Array<() => void> = [];
const privateWriteFailure = "PRIVATE_RESEARCH_WRITABLE_FAILURE";
type ResearchReport = Awaited<ReturnType<typeof researchNavigation>>;
type WriteOutcome = { value: ResearchExitReport } | { error: unknown };

function admission(
	report: ResearchReport,
	profile?: ResearchDocumentProfileId,
) {
	if (profile !== "long-v1") {
		expect(Object.hasOwn(report, "admission")).toBe(false);
		return;
	}
	expect(report.admission).toEqual({
		schemaVersion: 1,
		selection: "explicit-host",
		profile: "long-v1",
		effective: researchLongDocumentAdmission,
		codec: { maxDepth: 32, maxProperties: 16_384 },
	});
	expect(report.admission).toEqual(researchLongAdmissionProvenance);
	expect(report.profile).toBe("native-semantic-reader-v1");
	expect(Object.isFrozen(report.admission)).toBe(true);
	expect(Object.isFrozen(report.admission?.effective)).toBe(true);
	expect(Object.isFrozen(report.admission?.codec)).toBe(true);
	for (const value of Object.values(report.admission?.effective ?? {}))
		if (typeof value === "object") expect(Object.isFrozen(value)).toBe(true);
}

async function outputTurns() {
	for (let turn = 0; turn < 8; turn++)
		await new Promise<void>((resolve) => process.nextTick(resolve));
}

function observeWrite(operation: Promise<ResearchExitReport>) {
	let outcome: WriteOutcome | undefined;
	void operation.then(
		(value) => {
			outcome = { value };
		},
		(error: unknown) => {
			outcome = { error };
		},
	);
	return {
		get outcome() {
			return outcome;
		},
	};
}

async function written(operation: ReturnType<typeof observeWrite>) {
	await outputTurns();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("value");
	if (!outcome || !("value" in outcome))
		throw new Error("Expected completed in-memory research emission.");
	return outcome.value;
}

async function writeFailure(operation: ReturnType<typeof observeWrite>) {
	await outputTurns();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	const error = outcome && "error" in outcome ? outcome.error : undefined;
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected a static local research output failure.");
	expect(error.message.length).toBeGreaterThan(0);
	expect(error.message).not.toContain(privateWriteFailure);
	expect(error.stack).not.toContain(privateWriteFailure);
	expect(error.cause).toBeUndefined();
	expect(JSON.stringify(error)).not.toContain(privateWriteFailure);
	return error;
}

function sink(
	options: {
		held?: boolean;
		synchronousError?: Error;
		highWaterMark?: number;
	} = {},
) {
	const chunks: Buffer[] = [];
	const callbacks: Array<(error?: Error) => void> = [];
	const errors: Error[] = [];
	const output = new Writable({
		highWaterMark: options.highWaterMark ?? 65_536,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			let completed = false;
			const complete = (error?: Error) => {
				if (completed) return;
				completed = true;
				callback(error);
			};
			callbacks.push(complete);
			completeWrites.push(() => complete());
			if (options.synchronousError) throw options.synchronousError;
			if (!options.held) complete();
		},
	});
	output.on("error", (error) => errors.push(error));
	outputs.push(output);
	return { output, chunks, callbacks, errors };
}

interface NativeConsumer {
	readonly limits: Readonly<NetworkLimits>;
	consume(
		response: Readable,
		encoding: string,
		signal: AbortSignal,
		maxResponseBytes: number,
	): Promise<{ body: Uint8Array; encodedBytes: number }>;
}

interface Fixture {
	body: Buffer;
	status?: number;
	headers?: NetworkResponse["headers"];
	adapter?: "provided-response";
}

const pending: Fixture[] = [];

function enqueue(source: string | Buffer, options: Omit<Fixture, "body"> = {}) {
	const body = typeof source === "string" ? Buffer.from(source) : source;
	inputs.push({ body, before: Buffer.from(body) });
	pending.push({ body, ...options });
	return body;
}

function htmlBytes(length: number) {
	const prefix = "<!doctype html><h1>Bounded outline</h1><!--";
	const suffix = "-->";
	return Buffer.from(
		prefix + "x".repeat(length - prefix.length - suffix.length) + suffix,
	);
}

async function navigate(profile?: ResearchDocumentProfileId) {
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
	);
	admission(report, profile);
	return report;
}

function noSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.navigate).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(documentLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(capture.captureResearchBody).not.toHaveBeenCalled();
}

function closed(
	report: Awaited<ReturnType<typeof researchNavigation>>,
	count = 1,
) {
	expect(report.metrics?.closed).toBe(true);
	expect(BrowserSession.prototype.createTab).toHaveBeenCalledTimes(count);
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(count);
}

beforeEach(() => {
	const createTab = BrowserSession.prototype.createTab;
	vi.spyOn(BrowserSession.prototype, "createTab").mockImplementation(function (
		this: BrowserSession,
		...args
	) {
		sessions.push(this);
		return createTab.apply(this, args);
	});
	vi.spyOn(BrowserSession.prototype, "navigate");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(capture, "captureResearchBody");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(documentLoader, "loadBrowserDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		async function (this: NodeNetworkTransport, input) {
			const view = this as unknown as NativeConsumer;
			requests.push({ input, transport: this, limits: view.limits });
			const fixture = pending.shift();
			if (!fixture)
				throw new AgentBrowserError(
					"policy-denied",
					"Unexpected synthetic admission request",
				);
			let consumed: { body: Uint8Array; encodedBytes: number };
			if (fixture.adapter === "provided-response") {
				consumed = {
					body: fixture.body,
					encodedBytes: fixture.body.byteLength,
				};
			} else {
				const source = Readable.from([fixture.body]);
				streams.push(source);
				consumed = await view.consume(
					source,
					"identity",
					input.signal ?? new AbortController().signal,
					view.limits.maxResponseBytes,
				);
			}
			return {
				url: input.url,
				status: fixture.status ?? 200,
				headers: fixture.headers ?? {
					"content-type": ["text/html; charset=utf-8"],
				},
				...consumed,
				redirects: [],
				elapsedMs: 0,
			};
		},
	);
});

afterEach(async () => {
	try {
		for (const complete of completeWrites) complete();
		for (const output of outputs) output.destroy();
		await outputTurns();
		for (const source of streams) source.destroy();
		for (const { body, before } of inputs)
			expect(Buffer.compare(body, before)).toBe(0);
	} finally {
		streams.length = 0;
		sessions.length = 0;
		inputs.length = 0;
		requests.length = 0;
		pending.length = 0;
		outputs.length = 0;
		completeWrites.length = 0;
		vi.restoreAllMocks();
	}
});

const modes = [
	{ name: "full extraction", flags: [], fields: {} },
	{
		name: "selector",
		flags: ["--selector", "main"],
		fields: { selector: "main" },
	},
	{
		name: "lines",
		flags: ["--lines", "1:2"],
		fields: { lines: { start: 1, end: 2 } },
	},
	{ name: "section", flags: ["--section", "h2"], fields: { section: "h2" } },
	{ name: "headings", flags: ["--headings"], fields: { headings: true } },
	{ name: "find", flags: ["--find", "needle"], fields: { find: "needle" } },
];

it.each(
	modes.flatMap((mode) =>
		[false, true].flatMap((reader) =>
			[false, true].flatMap((captureBody) =>
				[undefined, "default"].map((profile) => ({
					...mode,
					reader,
					captureBody,
					profile,
				})),
			),
		),
	),
)(
	"preserves exact legacy shape for $name reader=$reader capture=$captureBody profile=$profile",
	({ flags, fields, reader, captureBody, profile }) => {
		const args = [
			...(profile === undefined ? [] : ["--document-profile", profile]),
			...(reader ? ["--reader"] : []),
			url,
			...flags,
			...(captureBody ? ["--capture-body"] : []),
			otherUrl,
		];
		expect(parseResearchArguments(args)).toEqual({
			reader,
			urls: [url, otherUrl],
			...fields,
			...(captureBody ? { captureBody: true } : {}),
			...(profile === undefined ? {} : { documentProfile: "default" }),
		});
		noSetup();
	},
);

it.each(
	modes
		.slice(1)
		.flatMap((first, index) =>
			modes
				.slice(index + 2)
				.flatMap((second) =>
					[undefined, "default"].map((profile) => ({ first, second, profile })),
				),
		),
)(
	"preserves rejection of $first.name with $second.name for profile $profile",
	({ first, second, profile }) => {
		const args = [
			...(profile === undefined ? [] : ["--document-profile", profile]),
			"--reader",
			"--capture-body",
			url,
			...first.flags,
			...second.flags,
		];
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		noSetup();
	},
);

it.each([undefined, "default"] as const)(
	"preserves the exact eight-URL admission boundary for profile %s",
	(profile) => {
		const urls = Array.from(
			{ length: researchRunLimits.maxUrls },
			(_value, index) => `${url}/${index}`,
		);
		const args = [
			...(profile === undefined ? [] : ["--document-profile", profile]),
			"--reader",
			"--capture-body",
			"--headings",
			...urls,
		];
		expect(parseResearchArguments(args)).toEqual({
			reader: true,
			captureBody: true,
			headings: true,
			urls,
			...(profile === undefined ? {} : { documentProfile: "default" }),
		});
		expect(() => parseResearchArguments([...args, otherUrl])).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		noSetup();
	},
);

it.each(Array.from({ length: 8 }, (_value, mask) => ({ mask })))(
	"requires all three long operation flags for combination $mask",
	({ mask }) => {
		const args = [
			"--document-profile",
			"long-v1",
			url,
			...(mask & 1 ? ["--reader"] : []),
			...(mask & 2 ? ["--capture-body"] : []),
			...(mask & 4 ? ["--headings"] : []),
		];
		if (mask === 7)
			expect(parseResearchArguments(args)).toEqual({
				reader: true,
				urls: [url],
				captureBody: true,
				headings: true,
				documentProfile: "long-v1",
			});
		else
			expect(() => parseResearchArguments(args)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		noSetup();
	},
);

it.each([
	{ name: "flags before URL", args: [...longFlags, url] },
	{
		name: "profile after URL",
		args: [
			"--headings",
			url,
			"--capture-body",
			"--reader",
			"--document-profile",
			"long-v1",
		],
	},
])("accepts explicit long profile with $name", ({ args }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: true,
		urls: [url],
		captureBody: true,
		headings: true,
		documentProfile: "long-v1",
	});
	noSetup();
});

it.each([
	{ name: "missing profile", args: [url, "--document-profile"] },
	{
		name: "missing separated value",
		args: ["--document-profile", "--reader", url],
	},
	{ name: "unknown profile", args: ["--document-profile", "long-v2", url] },
	{ name: "numeric profile", args: ["--document-profile", "4000000", url] },
	{
		name: "runtime numeric profile",
		args: ["--document-profile", 4_000_000 as unknown as string, url],
	},
	{ name: "wrong case", args: ["--document-profile", "LONG-V1", url] },
	{ name: "padded value", args: ["--document-profile", " long-v1", url] },
	{ name: "empty value", args: ["--document-profile", "", url] },
	{
		name: "equals long",
		args: [
			"--document-profile=long-v1",
			"--reader",
			"--capture-body",
			"--headings",
			url,
		],
	},
	{ name: "equals default", args: ["--document-profile=default", url] },
	{
		name: "duplicate default",
		args: [
			"--document-profile",
			"default",
			url,
			"--document-profile",
			"default",
		],
	},
	{
		name: "duplicate long",
		args: [...longFlags, url, "--document-profile", "long-v1"],
	},
	{
		name: "conflicting profiles",
		args: [...longFlags, url, "--document-profile", "default"],
	},
	{ name: "trailing duplicate reader", args: [...longFlags, url, "--reader"] },
	{
		name: "trailing duplicate capture",
		args: [...longFlags, url, "--capture-body"],
	},
	{
		name: "trailing duplicate headings",
		args: [...longFlags, url, "--headings"],
	},
	{
		name: "trailing unknown flag",
		args: [...longFlags, url, "--override-budget"],
	},
	{ name: "trailing malformed URL", args: [...longFlags, url, "not-a-url"] },
	{ name: "multiple long URLs", args: [...longFlags, url, otherUrl] },
	{ name: "missing long URL", args: longFlags },
	{
		name: "normalized fragment overflow",
		args: [...longFlags, `${url}#${"é".repeat(800)}`],
	},
	{
		name: "selector combination",
		args: [...longFlags, url, "--selector", "main"],
	},
	{ name: "lines combination", args: [...longFlags, url, "--lines", "1:2"] },
	{ name: "section combination", args: [...longFlags, url, "--section", "h2"] },
	{ name: "find combination", args: [...longFlags, url, "--find", "needle"] },
	{
		name: "full extraction flag",
		args: [...longFlags, url, "--full-extraction"],
	},
])("rejects $name before any navigation", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	noSetup();
});

it.each([null, false, 4_000_000, "long-v2", "LONG-V1", {}, Symbol("long-v1")])(
	"rejects programmatic profile %s before inspecting selection input",
	async (profile) => {
		const getter = vi.fn(() => {
			throw new Error("Selection must not be inspected.");
		});
		const lines = Object.defineProperty({}, "start", { get: getter }) as {
			start: number;
			end: number;
		};
		await expect(
			researchNavigation(
				url,
				true,
				undefined,
				undefined,
				true,
				lines,
				undefined,
				true,
				undefined,
				profile as ResearchDocumentProfileId,
			),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid research document profile",
		});
		expect(getter).not.toHaveBeenCalled();
		noSetup();
	},
);

it.each([false, undefined, 1, "true", {}, []])(
	"requires literal reader true for long programmatic input %s",
	async (reader) => {
		await expect(
			researchNavigation(
				url,
				reader as boolean,
				undefined,
				undefined,
				true,
				undefined,
				undefined,
				true,
				undefined,
				"long-v1",
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		noSetup();
	},
);

it.each([
	{ name: "no capture", captureBody: false, headings: true },
	{ name: "full extraction", captureBody: true, headings: false },
	{ name: "selector", captureBody: true, headings: true, selector: "main" },
	{
		name: "lines",
		captureBody: true,
		headings: true,
		lines: { start: 1, end: 2 },
	},
	{ name: "section", captureBody: true, headings: true, section: "h2" },
	{ name: "find", captureBody: true, headings: true, find: "needle" },
])("rejects programmatic long $name before setup", async (options) => {
	await expect(
		researchNavigation(
			url,
			true,
			undefined,
			"selector" in options ? options.selector : undefined,
			options.captureBody,
			"lines" in options ? options.lines : undefined,
			"section" in options ? options.section : undefined,
			options.headings,
			"find" in options ? options.find : undefined,
			"long-v1",
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it("uses actual operation-local long limits and selected capture/reader/heading implementations", async () => {
	const body = enqueue(htmlBytes(2_000_128));
	const headingLimits = { ...researchLongDocumentAdmission.headings };
	const report = await navigate("long-v1");
	expect(requests).toHaveLength(1);
	expect(requests[0].limits).toEqual(researchLongDocumentAdmission.network);
	expect(Object.isFrozen(requests[0].limits)).toBe(true);
	expect(sessions[0].limits).toMatchObject({
		maxTabs: 1,
		maxNavigations: 1,
		navigationTimeoutMs: researchLongDocumentAdmission.navigationTimeoutMs,
	});
	expect(sessions[0].documentLimits).toEqual(
		researchLongDocumentAdmission.document,
	);
	expect(capture.captureResearchBody).toHaveBeenCalledWith(
		expect.any(Uint8Array),
		"long-v1",
	);
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledWith(
		expect.any(Object),
		expect.objectContaining({
			limits: researchLongDocumentAdmission.document,
		}),
		"long-v1",
	);
	expect(extraction.discoverDocumentHeadings).toHaveBeenCalledWith(
		expect.any(Object),
		researchLongDocumentAdmission.headings,
	);
	const headingOptions = vi.mocked(extraction.discoverDocumentHeadings).mock
		.calls[0][1];
	expect(headingOptions).toStrictEqual(headingLimits);
	expect(headingOptions).not.toHaveProperty("sourceHeadingPolicy");
	expect(researchLongDocumentAdmission.headings).toStrictEqual(headingLimits);
	expect(Object.isFrozen(researchLongDocumentAdmission.headings)).toBe(true);
	expect(report.headings).not.toHaveProperty("sourceHeadingPolicy");
	expect(extraction.discoverDocumentHeadings).toHaveBeenCalledTimes(1);
	expect(documentLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(report.reader).toMatchObject({ sourceCodeUnits: body.byteLength });
	expect(report.headings?.entries.map((entry) => entry.title)).toEqual([
		"Bounded outline",
	]);
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
	});
	expect(report.failure).toBeUndefined();
	expect(
		Buffer.compare(
			Buffer.from(
				capture.decodeResearchBodyCapture(report.bodyCapture, "long-v1"),
			),
			body,
		),
	).toBe(0);
	expect(researchRunLimits.deadlineMs).toBe(
		researchLongDocumentAdmission.deadlineMs,
	);
	closed(report);
});

it.each(profiles)(
	"accepts the actual selected encoded response cap for profile %s",
	async (profile) => {
		const limit =
			profile === "long-v1"
				? researchLongDocumentAdmission.network.maxResponseBytes
				: researchRunLimits.network.maxResponseBytes;
		const body = enqueue(htmlBytes(limit));
		const report = await navigate(profile);
		expect(requests[0].limits.maxResponseBytes).toBe(limit);
		expect(report.failure).toBeUndefined();
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
		});
		expect(report.primaryResponse?.decodedBytes).toBe(limit);
		expect(report.bodyCapture?.decodedBytes).toBe(limit);
		expect(report.reader?.sourceCodeUnits).toBe(limit);
		expect(report.headings?.entries).toHaveLength(1);
		expect(
			Buffer.compare(
				Buffer.from(
					capture.decodeResearchBodyCapture(report.bodyCapture, profile),
				),
				body,
			),
		).toBe(0);
		closed(report);
	},
);

it.each(profiles)(
	"rejects selected response cap plus one in the actual consumer for profile %s",
	async (profile) => {
		const limit =
			profile === "long-v1"
				? researchLongDocumentAdmission.network.maxResponseBytes
				: researchRunLimits.network.maxResponseBytes;
		enqueue(htmlBytes(limit + 1));
		const report = await navigate(profile);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "network",
			resourceLimit: {
				kind: "network.response-encoded",
				unit: "bytes",
				limit,
				observed: limit + 1,
			},
		});
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
		});
		expect(report.primaryResponse).toBeNull();
		expect(report.bodyCapture).toBeUndefined();
		expect(report.reader).toBeUndefined();
		expect(report.headings).toBeUndefined();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(capture.captureResearchBody).not.toHaveBeenCalled();
		closed(report);
	},
);

it("keeps omitted and explicit default operations at two million bytes after a long operation", async () => {
	const body = htmlBytes(2_000_128);
	enqueue(body);
	const long = await navigate("long-v1");
	expect(long.failure).toBeUndefined();
	for (const [index, profile] of [undefined, "default" as const].entries()) {
		enqueue(body);
		const report = await navigate(profile);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "network",
			resourceLimit: {
				kind: "network.response-encoded",
				unit: "bytes",
				limit: 2_000_000,
				observed: body.byteLength,
			},
		});
		expect(requests[index + 1].limits).toEqual(researchRunLimits.network);
		expect(sessions[index + 1].documentLimits.maxTextCodeUnits).toBe(2_000_000);
		closed(report, index + 2);
	}
	expect(requests[0].limits).toEqual(researchLongDocumentAdmission.network);
	expect(researchRunLimits.network.maxResponseBytes).toBe(2_000_000);
	expect(readerLoader.researchReaderLimits.maxSourceCodeUnits).toBe(2_000_000);
});

it.each([undefined, "default"] as const)(
	"preserves successful default capture/reader wiring after long with profile %s",
	async (profile) => {
		enqueue("<h1>Long operation</h1>");
		await navigate("long-v1");
		enqueue("<h1>Default operation</h1>");
		const report = await navigate(profile);
		expect(report.failure).toBeUndefined();
		expect(vi.mocked(capture.captureResearchBody).mock.calls[1]).toHaveLength(
			1,
		);
		expect(
			vi.mocked(readerLoader.loadResearchDocument).mock.calls[1],
		).toHaveLength(2);
		expect(requests[1].limits).toEqual(researchRunLimits.network);
		expect(sessions[1].documentLimits.maxTextCodeUnits).toBe(2_000_000);
		expect(
			vi.mocked(extraction.discoverDocumentHeadings).mock.calls[1][1],
		).toEqual({ maxBytes: 256_000, maxNodes: 50_000, maxDepth: 128 });
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			partial: true,
		});
		closed(report, 2);
	},
);

it("retains the independent long capture guard for a synthetic preconsumed oversized response", async () => {
	enqueue(htmlBytes(4_000_001), { adapter: "provided-response" });
	const report = await navigate("long-v1");
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "body-capture",
	});
	expect(report.primaryResponse?.decodedBytes).toBe(4_000_001);
	expect(report.bodyCapture).toBeUndefined();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(report.contentSuccess).toBe(false);
	closed(report);
});

it.each([undefined, "long-v1"] as const)(
	"retains the independent actual reader text budget for profile %s",
	async (profile) => {
		const limit =
			profile === "long-v1"
				? researchLongDocumentAdmission.reader.maxTextCodeUnits
				: readerLoader.researchReaderLimits.maxTextCodeUnits;
		const body = enqueue(`<p>${"x".repeat(limit + 1)}</p>`);
		const report = await navigate(profile);
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "loader",
			resourceLimit: {
				kind: "reader.text",
				unit: "code-units",
				limit,
				observed: limit + 1,
			},
		});
		expect(report.primaryResponse?.decodedBytes).toBe(body.byteLength);
		expect(report.bodyCapture?.decodedBytes).toBe(body.byteLength);
		expect(report.headings).toBeUndefined();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		expect(report.contentSuccess).toBe(false);
		closed(report);
	},
);

it.each([
	"text/plain; charset=utf-8",
	"application/json",
	"application/xhtml+xml",
])(
	"rejects non-HTML long input %s after capture without claiming content success",
	async (contentType) => {
		const body = enqueue("<h1>Synthetic title</h1>", {
			headers: { "content-type": [contentType] },
		});
		const report = await navigate("long-v1");
		expect(report.failure).toEqual({
			category: "unsupported",
			stage: "loader",
		});
		expect(report.bodyCapture?.decodedBytes).toBe(body.byteLength);
		expect(report.primaryResponse?.status).toBe(200);
		expect(report.contentSuccess).toBe(false);
		expect(report.partial).toBe(true);
		expect(report.headings).toBeUndefined();
		closed(report);
	},
);

it.each([403, 404, 429, 500])(
	"preserves synthetic HTTP %s failure with an otherwise valid long outline",
	async (status) => {
		enqueue("<h1>Unavailable</h1>", { status });
		const report = await navigate("long-v1");
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			partial: true,
		});
		expect(report.primaryResponse?.status).toBe(status);
		if (status === 429) {
			expect(report.headings).toBeUndefined();
			expect(report.rateLimit?.action).toBe("stop-without-retry");
		} else expect(report.headings?.entries).toHaveLength(1);
		expect(report.bodyCapture).toBeDefined();
		closed(report);
	},
);

it.each(["header", "document"])(
	"preserves the long %s challenge handoff without retry",
	async (barrier) => {
		enqueue(
			barrier === "header"
				? "<h1>Benign title</h1>"
				: "<title>Just a moment...</title><p>Checking your browser</p><h1>Benign title</h1>",
			barrier === "header"
				? {
						status: 403,
						headers: {
							"content-type": ["text/html"],
							"cf-mitigated": ["challenge"],
						},
					}
				: {},
		);
		const report = await navigate("long-v1");
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			partial: true,
			classification: { barrier: "challenge" },
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.bodyCapture).toBeDefined();
		expect(report.headings).toBeUndefined();
		if (barrier === "header")
			expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		closed(report);
	},
);

it("keeps long discovery bounded to 256 actual headings with partial/null success", async () => {
	enqueue(
		Array.from(
			{ length: 257 },
			(_value, index) => `<h2>Heading ${index}</h2>`,
		).join(""),
	);
	const report = await navigate("long-v1");
	expect(report.failure).toBeUndefined();
	expect(report.headings?.entries).toHaveLength(256);
	expect(report.headings?.truncated).toBe(true);
	expect(
		Buffer.byteLength(JSON.stringify(report.headings)),
	).toBeLessThanOrEqual(researchLongDocumentAdmission.headings.maxBytes);
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		partial: true,
	});
	closed(report);
});

it("keeps empty long outlines unsuccessful without escalating to full extraction", async () => {
	enqueue("<p>No headings in this bounded fixture.</p>");
	const report = await navigate("long-v1");
	expect(report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		partial: true,
	});
	expect(report.headings?.entries).toHaveLength(0);
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	closed(report);
});

it.each(profiles)(
	"keeps synthetic navigation GET-only and credential-omitting for profile %s",
	async (profile) => {
		enqueue("<h1>Public fixture</h1>");
		const report = await navigate(profile);
		expect(requests).toHaveLength(1);
		const input = requests[0].input;
		expect(input.method ?? "GET").toBe("GET");
		expect(input.body).toBeUndefined();
		expect(input.cookieContext?.credentials).toBe("omit");
		for (const name of Object.keys(input.headers ?? {}))
			expect(["authorization", "proxy-authorization", "cookie"]).not.toContain(
				name.toLowerCase(),
			);
		expect(report.contentSuccess).toBeNull();
		closed(report);
	},
);

it("reports the settled codec guards separately from the frozen host admission budgets", () => {
	expect(researchEvidenceCodecLimits).toEqual({
		maxDepth: 32,
		maxProperties: 16_384,
	});
	expect(Object.isFrozen(researchEvidenceCodecLimits)).toBe(true);
	expect(researchLongAdmissionProvenance).toEqual({
		schemaVersion: 1,
		selection: "explicit-host",
		profile: "long-v1",
		effective: researchLongDocumentAdmission,
		codec: researchEvidenceCodecLimits,
	});
	expect(Object.isFrozen(researchLongAdmissionProvenance)).toBe(true);
	expect(researchLongAdmissionProvenance.effective).toBe(
		researchLongDocumentAdmission,
	);
	expect(Object.hasOwn(researchLongDocumentAdmission, "codec")).toBe(false);
	noSetup();
});

it.each([undefined, "default"] as const)(
	"does not infer admission from synthetic response headers, URL or page text for profile %s",
	async (profile) => {
		enqueue("<h1>long-v1</h1><p>document-profile=long-v1</p>", {
			headers: {
				"content-type": ["text/html"],
				"x-research-document-profile": ["long-v1"],
			},
		});
		const report = await researchNavigation(
			`${url}?document-profile=long-v1`,
			true,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			true,
			undefined,
			profile,
		);
		admission(report, profile);
		expect(requests[0].limits).toEqual(researchRunLimits.network);
		expect(report.failure).toBeUndefined();
		expect(report.contentSuccess).toBeNull();
		closed(report);
	},
);

it.each(profiles)(
	"emits complete actual codec bytes and matching effective state through a real Writable for profile %s",
	async (profile) => {
		enqueue('<h1>Bounded π "quoted" \\ heading</h1>');
		const report = await navigate(profile);
		const before = JSON.stringify(report);
		const expected = serializeResearchReport(report, profile);
		expect(expected.disposition).toBe("complete");
		const target = sink();
		const state = await written(
			observeWrite(emitResearchReport(target.output, report, profile)),
		);
		expect(target.chunks).toHaveLength(1);
		expect(Buffer.compare(target.chunks[0], Buffer.from(expected.jsonl))).toBe(
			0,
		);
		expect(target.chunks[0].byteLength).toBe(expected.receiptBytes);
		expect(target.chunks[0].at(-1)).toBe(10);
		expect(target.chunks[0].toString("utf8").split("\n")).toHaveLength(2);
		expect(JSON.parse(target.chunks[0].toString("utf8"))).toEqual(
			JSON.parse(before),
		);
		expect(state).toEqual(expected.exitReport);
		expect(researchExitCode([state])).toBe(0);
		expect(JSON.stringify(report)).toBe(before);
		expect(target.errors).toHaveLength(0);
		expect(target.output.writableEnded).toBe(false);
		if (profile !== "long-v1") {
			expect(expected.metadataBytes).toBeNull();
			expect(target.chunks[0].toString("utf8")).toBe(`${before}\n`);
			expect(
				Object.hasOwn(
					JSON.parse(target.chunks[0].toString("utf8")),
					"admission",
				),
			).toBe(false);
		}
		closed(report);
	},
);

it.each([1, 65_536])(
	"waits for held write completion at highWaterMark=%s and returns the detached effective state",
	async (highWaterMark) => {
		enqueue("<h1>Held callback</h1>");
		const report = await navigate("long-v1");
		const expected = serializeResearchReport(report, "long-v1");
		expect(expected.receiptBytes).toBeLessThan(65_536);
		const target = sink({ held: true, highWaterMark });
		const operation = observeWrite(
			emitResearchReport(target.output, report, "long-v1"),
		);
		await outputTurns();
		expect(target.chunks).toHaveLength(1);
		expect(target.callbacks).toHaveLength(1);
		expect(operation.outcome).toBeUndefined();
		expect(target.output.writableNeedDrain).toBe(highWaterMark === 1);
		expect(target.output.writableLength).toBe(expected.receiptBytes);
		report.outcome = "failure";
		report.contentSuccess = false;
		target.callbacks[0]();
		const state = await written(operation);
		expect(state).toEqual(expected.exitReport);
		expect(state.outcome).toBe("extracted-unverified");
		expect(researchExitCode([state])).toBe(0);
		expect(Buffer.compare(target.chunks[0], Buffer.from(expected.jsonl))).toBe(
			0,
		);
		expect(target.chunks).toHaveLength(1);
		expect(target.output.writableLength).toBe(0);
		expect(target.errors).toHaveLength(0);
	},
);

it("emits one bounded failure and exit one for a defensive synthetic oversized-heading report", async () => {
	enqueue("<h1>Native-sized original</h1>");
	const original = await navigate("long-v1");
	const originalSnapshot = JSON.stringify(original);
	if (!original.headings?.entries[0])
		throw new Error("Expected a synthetic native heading.");
	const defensive: ResearchReport = {
		...original,
		headings: {
			...original.headings,
			entries: [
				{
					...original.headings.entries[0],
					title: "x".repeat(
						researchLongDocumentAdmission.evidence.maxReceiptBytes + 1,
					),
				},
			],
		},
	};
	const expected = serializeResearchReport(defensive, "long-v1");
	expect(expected.disposition).toBe("output-limit");
	expect(researchExitCode([defensive])).toBe(0);
	const target = sink();
	const state = await written(
		observeWrite(emitResearchReport(target.output, defensive, "long-v1")),
	);
	expect(target.chunks).toHaveLength(1);
	expect(Buffer.compare(target.chunks[0], Buffer.from(expected.jsonl))).toBe(0);
	expect(target.chunks[0].byteLength).toBeLessThanOrEqual(
		researchLongDocumentAdmission.evidence.maxReceiptBytes,
	);
	const record = JSON.parse(target.chunks[0].toString("utf8"));
	expect(record).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "resource-limit", stage: "evidence-output" },
		outputLimit: {
			prior: {
				outcome: "extracted-unverified",
				partial: true,
				contentSuccess: null,
				failurePresent: false,
			},
		},
	});
	expect(Object.hasOwn(record, "bodyCapture")).toBe(false);
	expect(Object.hasOwn(record, "headings")).toBe(false);
	expect(state).toEqual(expected.exitReport);
	expect(state.outcome).toBe(record.outcome);
	expect(researchExitCode([state])).toBe(1);
	expect(defensive.outcome).toBe("extracted-unverified");
	expect(defensive.headings?.entries[0].title.length).toBe(
		researchLongDocumentAdmission.evidence.maxReceiptBytes + 1,
	);
	expect(JSON.stringify(original)).toBe(originalSnapshot);
	expect(target.errors).toHaveLength(0);
});

it("uses completed effective states for mixed exit accounting across sequential writes", async () => {
	enqueue("<h1>Available</h1>");
	const success = await navigate("long-v1");
	enqueue("<h1>Unavailable</h1>", { status: 404 });
	const failed = await navigate("long-v1");
	const target = sink();
	const states: ResearchExitReport[] = [];
	for (const report of [success, failed]) {
		const expected = serializeResearchReport(report, "long-v1");
		states.push(
			await written(
				observeWrite(emitResearchReport(target.output, report, "long-v1")),
			),
		);
		expect(
			Buffer.compare(
				target.chunks[states.length - 1],
				Buffer.from(expected.jsonl),
			),
		).toBe(0);
	}
	expect(target.chunks).toHaveLength(2);
	expect(states).toEqual([
		{ outcome: "extracted-unverified" },
		{ outcome: "http-failure" },
	]);
	expect(researchExitCode(states)).toBe(2);
	expect(researchExitCode([states[0]])).toBe(0);
	expect(researchExitCode([states[1]])).toBe(1);
	expect(target.output.writableEnded).toBe(false);
	expect(target.errors).toHaveLength(0);
	closed(failed, 2);
});

it.each(["synchronous", "callback", "event", "premature-close"] as const)(
	"rejects real Writable %s failure without a retry or successful exit state",
	async (mode) => {
		enqueue("<h1>Output failure fixture</h1>");
		const report = await navigate("long-v1");
		const before = JSON.stringify(report);
		const expected = serializeResearchReport(report, "long-v1");
		const messages: string[] = [];
		for (const suffix of ["first", "second"]) {
			const sourceError = new Error(`${privateWriteFailure}:${suffix}`);
			const target = sink({
				held: true,
				highWaterMark: 1,
				...(mode === "synchronous" ? { synchronousError: sourceError } : {}),
			});
			const operation = observeWrite(
				emitResearchReport(target.output, report, "long-v1"),
			);
			await outputTurns();
			expect(target.chunks).toHaveLength(1);
			if (mode !== "synchronous") expect(operation.outcome).toBeUndefined();
			if (mode === "callback") target.callbacks[0](sourceError);
			else if (mode === "event") target.output.destroy(sourceError);
			else if (mode === "premature-close") target.output.destroy();
			const error = await writeFailure(operation);
			expect(error).toMatchObject({
				code: "closed",
				message: "Research output could not be written",
			});
			messages.push(error.message);
			expect(error).not.toBe(sourceError);
			expect(operation.outcome).not.toHaveProperty("value");
			expect(
				Buffer.compare(target.chunks[0], Buffer.from(expected.jsonl)),
			).toBe(0);
			target.callbacks[0]();
			await outputTurns();
			expect(operation.outcome).toEqual({ error });
			expect(target.chunks).toHaveLength(1);
		}
		expect(messages[0]).toBe(messages[1]);
		expect(JSON.stringify(report)).toBe(before);
	},
);

it.each([false, true])(
	"removes emission listeners after clean close before a late failed callback=%s",
	async (lateFailure) => {
		enqueue("<h1>Terminal clean close fixture</h1>");
		const report = await navigate("long-v1");
		const target = sink({ held: true });
		const errorListeners = target.output.listenerCount("error");
		const closeListeners = target.output.listenerCount("close");
		const operation = observeWrite(
			emitResearchReport(target.output, report, "long-v1"),
		);
		await outputTurns();
		expect(target.output.listenerCount("error")).toBe(errorListeners + 1);
		expect(target.output.listenerCount("close")).toBe(closeListeners + 1);
		target.output.destroy();
		const error = await writeFailure(operation);
		expect(target.output.listenerCount("error")).toBe(errorListeners);
		expect(target.output.listenerCount("close")).toBe(closeListeners);
		target.callbacks[0](
			lateFailure ? new Error(privateWriteFailure) : undefined,
		);
		await outputTurns();
		expect(target.output.listenerCount("error")).toBe(errorListeners);
		expect(target.output.listenerCount("close")).toBe(closeListeners);
		expect(target.chunks).toHaveLength(1);
		expect(operation.outcome).toEqual({ error });
	},
);

it.each(["destroyed", "ended"] as const)(
	"rejects an already %s Writable without emitting a fragment",
	async (mode) => {
		enqueue("<h1>Closed output fixture</h1>");
		const report = await navigate("long-v1");
		const target = sink();
		if (mode === "destroyed") target.output.destroy();
		else target.output.end();
		await outputTurns();
		const operation = observeWrite(
			emitResearchReport(target.output, report, "long-v1"),
		);
		expect(await writeFailure(operation)).toMatchObject({
			code: "closed",
			message: "Research output could not be written",
		});
		expect(target.chunks).toHaveLength(0);
		expect(operation.outcome).not.toHaveProperty("value");
	},
);

it.each([undefined, "default"] as const)(
	"rejects long provenance with writer profile %s before writing any bytes",
	async (profile) => {
		enqueue("<h1>Profile mismatch fixture</h1>");
		const report = await navigate("long-v1");
		const target = sink();
		const operation = observeWrite(
			emitResearchReport(target.output, report, profile),
		);
		await writeFailure(operation);
		expect(target.chunks).toHaveLength(0);
		expect(operation.outcome).not.toHaveProperty("value");
	},
);
