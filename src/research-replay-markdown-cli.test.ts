import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://markdown-replay-cli.fixture.invalid/article";
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
	"main",
];
const streams: Array<Readable | Writable> = [];

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

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "No replay network"),
	);
});

afterEach(() => {
	for (const stream of streams.splice(0)) stream.destroy();
	vi.restoreAllMocks();
});

it.each(["json", "markdown"] as const)(
	"parses explicit %s extraction",
	(format) => {
		expect(
			parseResearchReplayArguments([...parserArgs, "--format", format]),
		).toEqual({
			...parseResearchReplayArguments(parserArgs),
			format,
		});
	},
);

it.each(
	[
		["--format"],
		["--format", "html"],
		["--format", "MARKDOWN"],
		["--format", "markdown", "--format", "json"],
		["--format=markdown"],
		["--format", "markdown", "--table-metadata"],
	].map((extra) => ({ extra })),
)(
	"rejects unsupported format arguments $extra before consuming input",
	async ({ extra }) => {
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		await expect(
			runResearchReplayCli(
				[...parserArgs, ...extra],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	},
);

it.each(
	[
		["--links", "example"],
		["--headings", "--recover-output-limit"],
	].map((selection) => ({ selection })),
)("rejects Markdown discovery $selection", ({ selection }) => {
	expect(() =>
		parseResearchReplayArguments([
			...parserArgs.slice(0, 8),
			...selection,
			"--format",
			"markdown",
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it("accepts explicit Markdown section recovery without relaxing the profile", () => {
	const args = [
		...parserArgs.slice(0, 8),
		"--section",
		"#owned",
		"--recover-output-limit",
		"--format",
		"markdown",
	];
	expect(parseResearchReplayArguments(args)).toMatchObject({
		format: "markdown",
		recoverOutputLimit: true,
		selection: { section: "#owned" },
	});
	args[1] = "long-v1";
	expect(() => parseResearchReplayArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["default", "long-v1"] as const)(
	"emits readable scoped Markdown from %s capture with JSONL provenance and no request",
	async (profile) => {
		const source =
			'<nav>Unrelated menu</nav><main><h1 id="owned">Article</h1><p>Useful &amp; safe.</p><pre><code>if ready:\n    print("hello")</code></pre><a href="/next">Next</a></main><h1>Next section</h1><footer>Unrelated footer</footer>';
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
		const raw = serializeResearchReport(report, profile).jsonl;
		const original = raw.slice();
		vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
		for (const selection of [
			["--selector", "main"],
			["--section", "#owned"],
		]) {
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
				...selection,
				"--format",
				"markdown",
			];
			expect(
				await runResearchReplayCli(args, target.input, target.output),
			).toBe(0);
			const output = JSON.parse(target.text());
			expect(output).toMatchObject({
				kind: "native-research-json-replay-v1",
				partial: true,
				contentSuccess: null,
				networkRequests: 0,
				outcome: "extracted-unverified",
				source: {
					profile,
					receiptSha256: hash(raw),
					body: { bytes: body.byteLength, sha256: hash(body) },
				},
				extraction: { format: "markdown" },
			});
			expect(output.extraction.content).toContain("# Article");
			expect(output.extraction.content).toContain(
				'if ready:\n    print("hello")',
			);
			expect(output.extraction.content).toContain("Useful &amp; safe");
			expect(output.extraction.content).not.toContain("Unrelated");
			expect(target.text().trim().split("\n")).toHaveLength(1);
		}
		expect(raw).toEqual(original);
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	},
);
