import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://empty-outline-cli.fixture.invalid/article";
const html =
	'<main id="owned"><p>Saved introduction.</p><table><tr><th>Name</th></tr><tr><td>Owned row</td></tr></table></main><div id="empty"></div>';
const streams: Array<Readable | Writable> = [];
const pins = [
	"--expected-profile",
	"long-v1",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
];
const selectorArgs = [...pins, "--selector", "#owned"];
const recoveryArgs = [...selectorArgs, "--recover-empty-outline"];
const formats = [
	{ flags: [], format: "json", metadata: {} },
	{ flags: ["--format", "json"], format: "json", metadata: {} },
	{
		flags: ["--table-metadata"],
		format: "json",
		metadata: { tableMetadata: true },
	},
	{ flags: ["--format", "markdown"], format: "markdown", metadata: {} },
	{
		flags: ["--format", "markdown", "--table-rows"],
		format: "markdown",
		metadata: { tableRows: true },
	},
	{
		flags: ["--compact-tables", "--format", "markdown"],
		format: "markdown",
		metadata: { compactTables: true },
	},
	{
		flags: ["--table-rows", "--format", "markdown", "--compact-tables"],
		format: "markdown",
		metadata: { tableRows: true, compactTables: true },
	},
];

function track<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function captureStreams(raw?: Uint8Array) {
	const input = track(
		raw
			? Readable.from([raw.subarray(0, 11), raw.subarray(11)], {
					objectMode: false,
				})
			: new Readable({ read() {} }),
	);
	const chunks: Buffer[] = [];
	const output = track(
		new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		}),
	);
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

function listeners(stream: Readable | Writable) {
	return new Map(
		stream.eventNames().map((name) => [name, stream.listeners(name)]),
	);
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	profile: "default" | "long-v1" = "long-v1",
	source = html,
) {
	const body = new TextEncoder().encode(source);
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
		true,
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted = {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	const args = [
		"--expected-profile",
		profile,
		"--receipt-sha256",
		trusted.expectedReceiptSha256,
		"--body-sha256",
		trusted.expectedBody.sha256,
		"--body-bytes",
		String(body.byteLength),
		"--selector",
		"#owned",
	];
	return { report, raw, body, trusted, args };
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Empty-outline replay CLI must not fetch");
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

describe("explicit empty-outline CLI arguments", () => {
	it.each(formats)("preserves format and table options %#", (options) => {
		const parsed = parseResearchReplayArguments([
			...recoveryArgs,
			...options.flags,
		]);
		expect(parsed).toEqual({
			trusted: {
				expectedProfile: "long-v1",
				expectedReceiptSha256: "a".repeat(64),
				expectedBody: { bytes: 64, sha256: "b".repeat(64) },
			},
			selection: { selector: "#owned", ...options.metadata },
			recoverEmptyOutline: true,
			...(options.flags.includes("--format") ? { format: options.format } : {}),
		});
	});

	it.each([0, 8, 10])("accepts the recovery flag at argument %s", (index) => {
		const args = [...selectorArgs];
		args.splice(index, 0, "--recover-empty-outline");
		expect(parseResearchReplayArguments(args)).toEqual(
			parseResearchReplayArguments(recoveryArgs),
		);
	});

	it("keeps generic selection and output-limit recovery opt-in unchanged", () => {
		for (const profile of ["default", "long-v1"]) {
			const trustedArgs = ["--expected-profile", profile, ...pins.slice(2)];
			for (const selection of [
				["--selector", "#owned"],
				["--section", "#heading"],
				["--links", "article"],
				...(profile === "default"
					? [
							["--find", "Saved"],
							["--lines", "1:2"],
						]
					: []),
			]) {
				const parsed = parseResearchReplayArguments([
					...trustedArgs,
					...selection,
				]);
				expect(parsed).not.toHaveProperty("recoverEmptyOutline");
				expect(parsed).not.toHaveProperty("recoverOutputLimit");
				if (
					profile === "default" &&
					selection[0] !== "--links" &&
					selection[0] !== "--find" &&
					selection[0] !== "--lines"
				) {
					expect(
						parseResearchReplayArguments([
							...trustedArgs,
							...selection,
							"--recover-output-limit",
						]),
					).toEqual({ ...parsed, recoverOutputLimit: true });
				}
			}
		}
		expect(
			parseResearchReplayArguments([
				"--expected-profile",
				"default",
				...pins.slice(2),
				"--headings",
				"--recover-output-limit",
			]),
		).toMatchObject({
			selection: { headings: true },
			recoverOutputLimit: true,
		});
	});

	const invalidCases = [
		["--expected-profile", "default", ...recoveryArgs.slice(2)],
		[...pins, "--recover-empty-outline"],
		[...recoveryArgs, "--recover-empty-outline"],
		[...recoveryArgs, "--recover-output-limit"],
		[...selectorArgs, "--recover-output-limit", "--recover-empty-outline"],
		[...selectorArgs, "--recover-empty-outline=true"],
		[...recoveryArgs, "false"],
		[...recoveryArgs, "--selector", "#owned"],
		[...recoveryArgs, "--section", "#heading"],
		[...recoveryArgs, "--headings"],
		[...recoveryArgs, "--format", "html"],
		[...recoveryArgs, "--format", "markdown", "--table-metadata"],
		[...recoveryArgs, "--table-rows"],
		[...recoveryArgs, "--compact-tables"],
		[...recoveryArgs, "--table-rows", "--format", "json"],
		[...recoveryArgs, "--compact-tables", "--format", "json"],
		[...recoveryArgs, "--table-metadata", "--table-metadata"],
		[...recoveryArgs, "--format", "markdown", "--table-rows", "--table-rows"],
		[
			...recoveryArgs,
			"--format",
			"markdown",
			"--compact-tables",
			"--compact-tables",
		],
		[...recoveryArgs, "--format", "json", "--format", "json"],
		[
			...recoveryArgs,
			"--format",
			"markdown",
			"--table-rows",
			"--compact-tables",
			"--table-metadata",
		],
		[...pins.slice(0, 6), "--body-bytes", "4000001", ...recoveryArgs.slice(8)],
		[...pins.slice(0, 6), "--body-bytes", "064", ...recoveryArgs.slice(8)],
		[...recoveryArgs.slice(2)],
		[...pins, "--recover-empty-outline", "--selector"],
		...["", " #owned", "#owned ", "div[", "p::before", "a".repeat(4097)].map(
			(selector) => [
				...pins,
				"--recover-empty-outline",
				"--selector",
				selector,
			],
		),
		...["default", "long-v1"].flatMap((profile) =>
			[
				["--section", "#heading"],
				["--links", "article"],
				["--find", "Saved"],
				["--lines", "1:2"],
				["--headings"],
			].map((selection) => [
				"--expected-profile",
				profile,
				...pins.slice(2),
				"--recover-empty-outline",
				...selection,
			]),
		),
	].map((args) => ({ args }));

	it.each(invalidCases)(
		"rejects invalid args before touching input %#",
		async ({ args }) => {
			const target = captureStreams();
			const read = vi.spyOn(target.input, "read");
			const inputDestroy = vi.spyOn(target.input, "destroy");
			const outputDestroy = vi.spyOn(target.output, "destroy");
			const inputListeners = listeners(target.input);
			const outputListeners = listeners(target.output);
			expect(() => parseResearchReplayArguments(args)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
			await expect(
				runResearchReplayCli(args, target.input, target.output),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(read).not.toHaveBeenCalled();
			expect(inputDestroy).not.toHaveBeenCalled();
			expect(outputDestroy).not.toHaveBeenCalled();
			expect(listeners(target.input)).toEqual(inputListeners);
			expect(listeners(target.output)).toEqual(outputListeners);
			expect(target.text()).toBe("");
		},
	);
});

describe("empty-outline CLI dispatch", () => {
	it.each(formats)(
		"routes selector recovery with format/table options %#",
		async (options) => {
			const value = await fixture();
			expect(value.report).toMatchObject({
				outcome: "empty-extraction",
				contentSuccess: false,
				headings: { entries: [], truncated: false },
			});
			const before = structuredClone(value);
			const recover = vi.spyOn(replay, "recoverResearchEmptyOutlineSelector");
			const ordinary = vi.spyOn(replay, "extractResearchReplayJson");
			const outputLimit = vi.spyOn(
				replay,
				"recoverResearchOutputLimitSelector",
			);
			const section = vi.spyOn(replay, "recoverResearchOutputLimitSection");
			const outline = vi.spyOn(replay, "outlineResearchOutputLimitCapture");
			const target = captureStreams(value.raw);
			expect(
				await runResearchReplayCli(
					[...value.args, "--recover-empty-outline", ...options.flags],
					target.input,
					target.output,
				),
			).toBe(0);
			expect(recover).toHaveBeenCalledExactlyOnceWith(
				expect.any(Uint8Array),
				value.trusted,
				{ selector: "#owned", ...options.metadata },
				expect.any(AbortSignal),
				options.format,
			);
			for (const other of [ordinary, outputLimit, section, outline])
				expect(other).not.toHaveBeenCalled();
			expect(JSON.parse(target.text())).toMatchObject({
				outcome: "extracted-unverified",
				partial: true,
				contentSuccess: null,
				networkRequests: 0,
				selection: { method: "css-selector", matches: 1 },
				extraction: {
					format: options.format,
					...(options.metadata.tableRows ? { tableRows: true } : {}),
					...(options.metadata.compactTables ? { compactTables: true } : {}),
				},
				recovery: {
					kind: "captured-empty-outline-selector",
					originalOutcome: "empty-extraction",
					originalContentSuccess: false,
					originalRequestRetried: false,
					originalDiscovery: {
						method: "heading-outline",
						entries: 0,
						truncated: false,
						scannedNodes: value.report.headings?.scannedNodes,
					},
				},
			});
			expect(target.text()).toContain("Owned row");
			expect(recover.mock.calls[0][0]).not.toBe(value.raw);
			expect(recover.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
			expect(value).toEqual(before);
		},
	);

	it("returns a nonzero exit code for an empty selected node", async () => {
		const value = await fixture();
		const target = captureStreams(value.raw);
		expect(
			await runResearchReplayCli(
				[
					...value.args.slice(0, 8),
					"--selector",
					"#empty",
					"--recover-empty-outline",
				],
				target.input,
				target.output,
			),
		).toBe(1);
		expect(JSON.parse(target.text())).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
			networkRequests: 0,
			recovery: { kind: "captured-empty-outline-selector" },
		});
	});

	it("does not auto-recover an empty outline in generic replay", async () => {
		const value = await fixture();
		const recover = vi.spyOn(replay, "recoverResearchEmptyOutlineSelector");
		const ordinary = vi.spyOn(replay, "extractResearchReplayJson");
		const target = captureStreams(value.raw);
		await expect(
			runResearchReplayCli(value.args, target.input, target.output),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(ordinary).toHaveBeenCalledOnce();
		expect(recover).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	});

	it.each(["default", "long-v1"] as const)(
		"keeps successful generic %s replay unchanged",
		async (profile) => {
			const value = await fixture(profile, `<h1>Heading</h1>${html}`);
			const recover = vi.spyOn(replay, "recoverResearchEmptyOutlineSelector");
			const ordinary = vi.spyOn(replay, "extractResearchReplayJson");
			const target = captureStreams(value.raw);
			expect(
				await runResearchReplayCli(value.args, target.input, target.output),
			).toBe(0);
			expect(ordinary).toHaveBeenCalledExactlyOnceWith(
				expect.any(Uint8Array),
				value.trusted,
				{ selector: "#owned" },
				expect.any(AbortSignal),
				"json",
			);
			expect(recover).not.toHaveBeenCalled();
			expect(JSON.parse(target.text())).not.toHaveProperty("recovery");
			expect(target.text()).toContain("Owned row");
		},
	);

	it("propagates helper rejection without fallback and clears receipt bytes", async () => {
		const value = await fixture();
		const failure = new AgentBrowserError(
			"invalid-input",
			"Synthetic rejection",
		);
		const recover = vi
			.spyOn(replay, "recoverResearchEmptyOutlineSelector")
			.mockImplementation(() => {
				throw failure;
			});
		const ordinary = vi.spyOn(replay, "extractResearchReplayJson");
		const outputLimit = vi.spyOn(replay, "recoverResearchOutputLimitSelector");
		const target = captureStreams(value.raw);
		await expect(
			runResearchReplayCli(
				[...value.args, "--recover-empty-outline"],
				target.input,
				target.output,
			),
		).rejects.toBe(failure);
		expect(recover).toHaveBeenCalledOnce();
		expect(recover.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
		expect(ordinary).not.toHaveBeenCalled();
		expect(outputLimit).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	});

	it("retains the CLI output cap for empty-outline recovery", async () => {
		const value = await fixture();
		const result = replay.recoverResearchEmptyOutlineSelector(
			value.raw,
			value.trusted,
			{ selector: "#owned" },
		);
		const recover = vi
			.spyOn(replay, "recoverResearchEmptyOutlineSelector")
			.mockReturnValue({
				...result,
				jsonl: "x".repeat(replay.researchJsonReplayLimits.maxOutputBytes + 1),
			});
		const target = captureStreams(value.raw);
		await expect(
			runResearchReplayCli(
				[...value.args, "--recover-empty-outline"],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(recover).toHaveBeenCalledOnce();
		expect(recover.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
		expect(target.text()).toBe("");
		expect(target.input.destroyed).toBe(true);
		expect(target.output.destroyed).toBe(true);
	});
});
