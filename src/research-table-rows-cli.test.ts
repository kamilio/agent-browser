import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import {
	parseResearchArguments,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://table-rows-cli.fixture.invalid/article";
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
const streams: Array<Readable | Writable> = [];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Table row CLI must not fetch");
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

it.each(
	[
		["--table-rows", url],
		[url, "--table-rows"],
		["--reader", "--selector", "main", "--table-rows", url],
		["--section", "#wanted", "--format", "markdown", url, "--table-rows"],
		["--lines", "1:5", "--table-rows", url],
		["--compact-tables", "--table-rows", url],
	].map((args) => ({ args })),
)("parses live row flag placement $args", ({ args }) => {
	expect(parseResearchArguments(args)).toMatchObject({
		tableRows: true,
		urls: [url],
	});
});

it.each(
	[
		["--table-rows", "--table-rows"],
		["--table-rows=true"],
		["--table-rows=false"],
		["--table-rows", "false"],
		["--table-rows", "--format", "json"],
		["--table-rows", "--format", "html"],
		["--table-rows", "--table-metadata"],
		["--table-rows", "--headings"],
		["--table-rows", "--find", "next"],
		["--table-rows", "--links", "next"],
	].map((extra) => ({ extra })),
)("rejects invalid live row flags $extra", ({ extra }) => {
	expect(() => parseResearchArguments([url, ...extra])).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["selector", "section"] as const)(
	"parses explicit replay Markdown rows for %s",
	(method) => {
		const selection = method === "selector" ? "main" : "#wanted";
		for (const flags of [
			["--table-rows", "--format", "markdown"],
			["--format", "markdown", "--table-rows"],
		]) {
			expect(
				parseResearchReplayArguments([
					...pins,
					`--${method}`,
					selection,
					...flags,
				]),
			).toMatchObject({
				format: "markdown",
				selection: { [method]: selection, tableRows: true },
			});
		}
	},
);

it("preserves replay's default JSON argument shape without a row flag", () => {
	const parsed = parseResearchReplayArguments([...pins, "--selector", "main"]);
	expect(parsed.selection).toEqual({ selector: "main" });
	expect(parsed).not.toHaveProperty("format");
});

it.each(
	[
		["--selector", "main", "--table-rows"],
		["--selector", "main", "--format", "json", "--table-rows"],
		[
			"--selector",
			"main",
			"--format",
			"markdown",
			"--table-rows",
			"--table-rows",
		],
		["--selector", "main", "--format", "markdown", "--table-rows=true"],
		["--selector", "main", "--format", "markdown", "--table-rows=false"],
		["--selector", "main", "--format", "markdown", "--table-rows", "false"],
		[
			"--selector",
			"main",
			"--format",
			"markdown",
			"--table-rows",
			"--table-metadata",
		],
		["--links", "next", "--format", "markdown", "--table-rows"],
		[
			"--headings",
			"--recover-output-limit",
			"--format",
			"markdown",
			"--table-rows",
		],
		["--selector", "main", "--format", "html", "--table-rows"],
		["--selector", "main", "--format", "MARKDOWN", "--table-rows"],
		["--selector", "main", "--table-rows", "--format"],
		["--selector", "main", "--table-rows", "--format=markdown"],
	].map((extra) => ({ extra })),
)(
	"rejects replay row flags $extra without consuming input",
	async ({ extra }) => {
		const args = [...pins, ...extra];
		expect(() => parseResearchReplayArguments(args)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		const write = vi.spyOn(target.output, "write");
		await expect(
			runResearchReplayCli(args, target.input, target.output),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	},
);

it.each(["selector", "section"] as const)(
	"accepts the full 14-argument %s row recovery form only for default admission",
	async (selection) => {
		const targetSelector = selection === "selector" ? "main" : "#wanted";
		const args = [
			...pins,
			`--${selection}`,
			targetSelector,
			"--recover-output-limit",
			"--format",
			"markdown",
			"--table-rows",
		];
		expect(args).toHaveLength(14);
		expect(parseResearchReplayArguments(args)).toMatchObject({
			format: "markdown",
			recoverOutputLimit: true,
			selection: { [selection]: targetSelector, tableRows: true },
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

it.each([
	{ profile: "default", selection: "selector", recovery: false },
	{ profile: "default", selection: "section", recovery: false },
	{ profile: "long-v1", selection: "selector", recovery: false },
	{ profile: "long-v1", selection: "section", recovery: false },
	{ profile: "default", selection: "section", recovery: true },
	{ profile: "default", selection: "selector", recovery: true },
] as const)(
	"emits pinned $profile $selection rows (recovery=$recovery) without network",
	async ({ profile, selection, recovery }) => {
		const source = `${recovery ? `<h1>Large</h1><p>${"Background content. ".repeat(16_000)}</p>` : ""}<aside>Outside prefix</aside><main><h2 id="wanted">Wanted</h2><table><tr><td colspan="2">Feature</td><td>Support</td></tr><tr><th>Quantization</th><td>Available</td></tr></table></main><h2>Next section</h2><p>Outside suffix</p>`;
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
			!recovery,
			undefined,
			profile,
			{ minRequestIntervalMs: 0 },
		);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
		expect(report.metrics).toMatchObject({ active: 0, closed: true });
		if (recovery)
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				failure: {
					category: "resource-limit",
					stage: "extraction",
					resourceLimit: { kind: "extraction.output", limit: 256_000 },
				},
			});
		else expect(report.outcome).toBe("extracted-unverified");
		const serialized = serializeResearchReport(report, profile);
		expect(serialized.disposition).toBe("complete");
		const raw = serialized.jsonl;
		const original = {
			raw: raw.slice(),
			body: body.slice(),
			report: structuredClone(report),
		};
		const target = captureStreams(raw);
		const args = [
			"--expected-profile",
			profile,
			"--receipt-sha256",
			hash(raw),
			"--body-sha256",
			hash(body),
			"--body-bytes",
			String(body.byteLength),
			`--${selection}`,
			selection === "selector" ? "main" : "#wanted",
			"--format",
			"markdown",
			"--table-rows",
			...(recovery ? ["--recover-output-limit"] : []),
		];
		expect(await runResearchReplayCli(args, target.input, target.output)).toBe(
			0,
		);
		const output = JSON.parse(target.text());
		expect(output).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			contentSuccess: null,
			networkRequests: 0,
			outcome: "extracted-unverified",
			source: {
				profile,
				reportedFinalUrl: report.finalUrl,
				receiptSha256: hash(raw),
				body: { bytes: body.byteLength, sha256: hash(body) },
			},
			selection: {
				method: selection === "selector" ? "css-selector" : "heading-section",
				matches: 1,
			},
			extraction: {
				format: "markdown",
				tableRows: true,
				content:
					"## Wanted\n\n**Native table begin (selected structure only; associations unspecified)**\n- Row 1\n  - Cell 1: Feature\n  - Cell 2: Support\n- Row 2\n  - Cell 1: Quantization\n  - Cell 2: Available\n**Native table end**\n",
			},
		});
		if (recovery)
			expect(output.recovery).toMatchObject({
				kind: `captured-output-limit-${selection}`,
				originalOutcome: "failure",
				originalContentSuccess: false,
				originalFailure: report.failure,
				originalRequestRetried: false,
			});
		else expect(output).not.toHaveProperty("recovery");
		for (const text of [
			"Outside",
			"Background content",
			'"bodyCapture"',
			'"rawReceipt"',
			'"originalMetadata"',
		])
			expect(target.text()).not.toContain(text);
		expect(target.text().split("\n")).toHaveLength(2);
		expect(Buffer.byteLength(target.text())).toBeLessThanOrEqual(327_680);
		expect({ raw, body, report }).toEqual(original);
	},
);
