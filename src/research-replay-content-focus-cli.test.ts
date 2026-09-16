import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchBodyCaptureLimit } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchLongDocumentAdmission } from "./research-admission.js";

const policy = "main-content-v1";
const policies = [policy, "main-content-v2"] as const;
const profiles = ["default", "long-v1"] as const;
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
const focus = ["--content-focus", policy];
const outputPolicy = "text-prefix-v1";
const outputPolicyFlags = ["--output-limit-policy", outputPolicy];
const streams: Array<Readable | Writable> = [];

function argumentsFor(
	profile: "default" | "long-v1" = "default",
	contentFocus: (typeof policies)[number] = policy,
) {
	return [
		"--expected-profile",
		profile,
		...pins.slice(2),
		"--content-focus",
		contentFocus,
	];
}

function invalid(args: string[]) {
	expect(() => parseResearchReplayArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
}

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

function listeners(stream: Readable | Writable) {
	return new Map(
		stream.eventNames().map((name) => [name, stream.listeners(name)]),
	);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Content-focus replay CLI must not fetch");
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

describe("ordinary content-focus replay arguments", () => {
	it.each(
		profiles.flatMap((profile) =>
			([undefined, "json", "markdown"] as const).flatMap((format) =>
				policies.map((contentFocus) => ({ profile, format, contentFocus })),
			),
		),
	)(
		"accepts $contentFocus for $profile capture with format $format",
		({ profile, format, contentFocus }) => {
			expect(
				parseResearchReplayArguments([
					...argumentsFor(profile, contentFocus),
					...(format === undefined ? [] : ["--format", format]),
				]),
			).toEqual({
				trusted: {
					expectedProfile: profile,
					expectedReceiptSha256: "a".repeat(64),
					expectedBody: { bytes: 64, sha256: "b".repeat(64) },
				},
				selection: { contentFocus },
				...(format === undefined ? {} : { format }),
			});
		},
	);

	it("preserves table options and accepts focus before the trusted pins", () => {
		const options = [
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
		];
		for (const profile of profiles) {
			for (const option of options) {
				const parsed = parseResearchReplayArguments([
					...focus,
					...argumentsFor(profile).slice(0, 8),
					...option.flags,
				]);
				expect(parsed.selection).toEqual({
					contentFocus: policy,
					...option.selection,
				});
				expect(parsed).not.toHaveProperty("recoverOutputLimit");
				expect(parsed).not.toHaveProperty("recoverEmptyOutline");
			}
		}
	});

	it("rejects unknown, empty, case-changed and whitespace policies", () => {
		for (const value of [
			"",
			"main-content-v3",
			"MAIN-CONTENT-V2",
			" main-content-v2",
			"main-content-v2\n",
			"MAIN-CONTENT-V1",
			` ${policy}`,
			`${policy} `,
			`${policy}\n`,
			`\t${policy}`,
		])
			invalid([...pins, "--content-focus", value]);
	});

	it("rejects repeated focus flags and equals-style flags", () => {
		invalid([...argumentsFor(), ...focus]);
		invalid([...argumentsFor(), "--content-focus", "main-content-v2"]);
		invalid([...argumentsFor("default", "main-content-v2"), ...focus]);
		invalid([...pins, `--content-focus=${policy}`]);
	});

	it("rejects missing policy values, including a following flag", () => {
		invalid([...pins, "--content-focus"]);
		invalid([...pins, "--content-focus", "--table-metadata"]);
	});

	it.each([
		{ selection: ["--selector", "main"] },
		{ selection: ["--section", "#owned"] },
		{ selection: ["--links", "article"] },
		{ selection: ["--find", "Owned"] },
		{ selection: ["--lines", "1:2"] },
		{ selection: ["--headings"] },
	])("rejects mixed selection $selection in either order", ({ selection }) => {
		for (const profile of profiles) {
			const trusted = argumentsFor(profile).slice(0, 8);
			for (const contentFocus of policies) {
				const focus = ["--content-focus", contentFocus];
				invalid([...trusted, ...focus, ...selection]);
				invalid([...trusted, ...selection, ...focus]);
			}
		}
	});

	it.each(["--recover-output-limit", "--recover-empty-outline"])(
		"rejects %s without broadening named recovery contracts",
		(recovery) => {
			for (const profile of profiles) {
				for (const contentFocus of policies) {
					invalid([...argumentsFor(profile, contentFocus), recovery]);
					invalid([recovery, ...argumentsFor(profile, contentFocus)]);
				}
			}
		},
	);

	it("retains strict required profile, digest and body-size validation", () => {
		for (const [flag, value] of [
			["--expected-profile", "long-v2"],
			["--expected-profile", " default"],
			["--receipt-sha256", "A".repeat(64)],
			["--receipt-sha256", "a".repeat(63)],
			["--body-sha256", "B".repeat(64)],
			["--body-sha256", "g".repeat(64)],
			["--body-bytes", "064"],
			["--body-bytes", "-1"],
			["--body-bytes", "1.5"],
		]) {
			const args = argumentsFor();
			args[args.indexOf(flag) + 1] = value;
			invalid(args);
		}
		for (let index = 0; index < pins.length; index += 2) {
			const args = argumentsFor();
			args.splice(index, 2);
			invalid(args);
		}
		for (const profile of profiles) {
			const cap =
				profile === "default"
					? researchBodyCaptureLimit
					: researchLongDocumentAdmission.maxCaptureBytes;
			const args = argumentsFor(profile);
			args[7] = String(cap);
			expect(
				parseResearchReplayArguments(args).trusted.expectedBody?.bytes,
			).toBe(cap);
			args[7] = String(cap + 1);
			invalid(args);
		}
	});

	it("retains invalid format and table-flag combinations", () => {
		for (const extra of [
			["--format", "html"],
			["--format", "MARKDOWN"],
			["--format", "json", "--format", "markdown"],
			["--format"],
			["--table-rows"],
			["--compact-tables"],
			["--format", "json", "--table-rows"],
			["--format", "json", "--compact-tables"],
			["--format", "markdown", "--table-metadata"],
			["--table-metadata", "--table-metadata"],
			["--format", "markdown", "--table-rows", "--table-rows"],
			["--format", "markdown", "--compact-tables", "--compact-tables"],
		])
			invalid([...argumentsFor(), ...extra]);
	});

	it("accepts combined focus/table/output flags within the new 17-argument bound", () => {
		const args = [
			...argumentsFor(),
			"--format",
			"markdown",
			"--table-rows",
			"--compact-tables",
			...outputPolicyFlags,
		];
		expect(args).toHaveLength(16);
		for (const profile of profiles) {
			args[1] = profile;
			expect(parseResearchReplayArguments(args).selection).toEqual({
				contentFocus: policy,
				tableRows: true,
				compactTables: true,
				outputLimitPolicy: outputPolicy,
			});
		}
		const oversized = [...args, ...focus];
		expect(oversized).toHaveLength(18);
		invalid(oversized);
		invalid([...pins, "--content-focus", "a".repeat(4097)]);
	});

	it("rejects invalid focus before reading or writing in-memory streams", async () => {
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		const inputListeners = listeners(target.input);
		const outputListeners = listeners(target.output);
		await expect(
			runResearchReplayCli(
				[...argumentsFor(), "--recover-output-limit"],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(listeners(target.input)).toEqual(inputListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
	});
});

describe("ordinary replay output-limit policy arguments", () => {
	it("accepts explicit Markdown policy for selector, section and focus", () => {
		for (const profile of profiles) {
			for (const mode of [
				{ flags: ["--selector", "main"], selection: { selector: "main" } },
				{ flags: ["--section", "#owned"], selection: { section: "#owned" } },
				{ flags: focus, selection: { contentFocus: policy } },
			]) {
				const args = [
					...argumentsFor(profile).slice(0, 8),
					...mode.flags,
					"--format",
					"markdown",
				];
				const strict = parseResearchReplayArguments(args);
				expect(strict.selection).toEqual(mode.selection);
				for (const selected of [
					[...args, ...outputPolicyFlags],
					[...outputPolicyFlags, ...args],
				])
					expect(parseResearchReplayArguments(selected)).toEqual({
						...strict,
						selection: { ...mode.selection, outputLimitPolicy: outputPolicy },
					});
			}
		}
	});

	it("rejects noncanonical output policies without trimming or normalization", () => {
		for (const value of [
			"",
			"text-prefix-v2",
			"TEXT-PREFIX-V1",
			` ${outputPolicy}`,
			`${outputPolicy} `,
			`${outputPolicy}\n`,
			`\t${outputPolicy}`,
			"a".repeat(4097),
		])
			invalid([
				...argumentsFor(),
				"--format",
				"markdown",
				"--output-limit-policy",
				value,
			]);
	});

	it("rejects missing, repeated and equals-style policy flags before stream input", async () => {
		for (const extra of [
			["--output-limit-policy"],
			["--output-limit-policy", "--table-rows"],
			[...outputPolicyFlags, ...outputPolicyFlags],
			[`--output-limit-policy=${outputPolicy}`],
		]) {
			const target = captureStreams(Uint8Array.of(123));
			const read = vi.spyOn(target.input, "read");
			const inputListeners = listeners(target.input);
			const outputListeners = listeners(target.output);
			await expect(
				runResearchReplayCli(
					[...argumentsFor(), "--format", "markdown", ...extra],
					target.input,
					target.output,
				),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(read).not.toHaveBeenCalled();
			expect(target.text()).toBe("");
			expect(listeners(target.input)).toEqual(inputListeners);
			expect(listeners(target.output)).toEqual(outputListeners);
		}
	});

	it("requires explicit Markdown and keeps table metadata incompatible", () => {
		for (const profile of profiles) {
			for (const mode of [
				["--selector", "main"],
				["--section", "#owned"],
				focus,
			]) {
				for (const format of [
					[],
					["--format", "json"],
					["--format", "MARKDOWN"],
					["--format", "markdown", "--table-metadata"],
				])
					invalid([
						...argumentsFor(profile).slice(0, 8),
						...mode,
						...format,
						...outputPolicyFlags,
					]);
			}
		}
	});

	it("rejects output policy with links, text and heading discovery", () => {
		for (const mode of [
			["--links", "article"],
			["--find", "Owned"],
			["--lines", "1:2"],
			["--headings"],
		]) {
			for (const format of [[], ["--format", "json"], ["--format", "markdown"]])
				invalid([...pins, ...mode, ...format, ...outputPolicyFlags]);
		}
	});

	it("does not extend either named recovery contract with an output policy", () => {
		for (const recovery of [
			{
				profile: "default",
				flags: ["--selector", "main", "--recover-output-limit"],
			},
			{
				profile: "default",
				flags: ["--section", "#owned", "--recover-output-limit"],
			},
			{
				profile: "long-v1",
				flags: ["--selector", "main", "--recover-empty-outline"],
			},
		] as const) {
			const args = [
				...argumentsFor(recovery.profile).slice(0, 8),
				...recovery.flags,
				"--format",
				"markdown",
			];
			expect(parseResearchReplayArguments(args).format).toBe("markdown");
			invalid([...args, ...outputPolicyFlags]);
		}
		for (const profile of profiles) {
			for (const recovery of [
				"--recover-output-limit",
				"--recover-empty-outline",
			])
				invalid([
					...argumentsFor(profile),
					"--format",
					"markdown",
					...outputPolicyFlags,
					recovery,
				]);
		}
	});

	it("does not relax trusted pins or profile capture caps with an output policy", () => {
		for (const profile of profiles) {
			const args = [
				...argumentsFor(profile),
				"--format",
				"markdown",
				...outputPolicyFlags,
			];
			for (let index = 0; index < pins.length; index += 2) {
				const missing = [...args];
				missing.splice(index, 2);
				invalid(missing);
			}
			const cap =
				profile === "default"
					? researchBodyCaptureLimit
					: researchLongDocumentAdmission.maxCaptureBytes;
			for (const [flag, value] of [
				["--expected-profile", "long-v2"],
				["--receipt-sha256", "A".repeat(64)],
				["--body-sha256", "g".repeat(64)],
				["--body-bytes", "064"],
				["--body-bytes", String(cap + 1)],
			]) {
				const changed = [...args];
				changed[changed.indexOf(flag) + 1] = value;
				invalid(changed);
			}
		}
	});
});

it.each(
	(
		[
			{
				profile: "default",
				format: "json",
				flags: [],
				outputLimitPolicy: undefined,
			},
			{
				profile: "long-v1",
				format: "markdown",
				flags: ["--format", "markdown"],
				outputLimitPolicy: undefined,
			},
			{
				profile: "long-v1",
				format: "markdown",
				flags: ["--format", "markdown", ...outputPolicyFlags],
				outputLimitPolicy: outputPolicy,
			},
		] as const
	).flatMap((scenario) =>
		policies.flatMap((contentFocus) =>
			(["main", "article"] as const).map((landmark) => ({
				...scenario,
				contentFocus,
				landmark,
			})),
		),
	),
)(
	"replays $contentFocus $landmark as $format from synthetic $profile capture (output policy $outputLimitPolicy) and cleans up",
	async ({
		profile,
		format,
		flags,
		outputLimitPolicy,
		contentFocus,
		landmark,
	}) => {
		const fallback =
			contentFocus === "main-content-v2" && landmark === "article";
		const url = "https://content-focus-replay.fixture.invalid/article";
		const body = new TextEncoder().encode(
			`<!doctype html><html><head><title>Saved article</title></head><body><nav><h2>Outside navigation</h2></nav><${landmark}><h1 id="owned">Owned article</h1><p>Owned evidence survives replay.</p></${landmark}><section><h2>Useful sibling product</h2><p>Product evidence survives replay.</p></section><footer>Outside footer</footer></body></html>`,
		);
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
		const original = raw.slice();
		const extract = vi.spyOn(replay, "extractResearchReplayJson");
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const target = captureStreams(raw);
		const outputListeners = listeners(target.output);
		const args = [
			"--expected-profile",
			profile,
			"--receipt-sha256",
			hash(raw),
			"--body-sha256",
			hash(body),
			"--body-bytes",
			String(body.byteLength),
			"--content-focus",
			contentFocus,
			...flags,
		];
		expect(await runResearchReplayCli(args, target.input, target.output)).toBe(
			0,
		);
		expect(extract).toHaveBeenCalledExactlyOnceWith(
			expect.any(Uint8Array),
			parseResearchReplayArguments(args).trusted,
			{
				contentFocus,
				...(outputLimitPolicy === undefined ? {} : { outputLimitPolicy }),
			},
			expect.any(AbortSignal),
			format,
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
				receiptSha256: hash(raw),
				body: { bytes: body.byteLength, sha256: hash(body) },
			},
			extraction: {
				format,
				contentSelection: {
					policy: contentFocus,
					selected: fallback ? "document" : landmark,
					reason: fallback
						? "article-with-outside-content"
						: `unique-${landmark}`,
					mainCandidates: landmark === "main" ? 1 : 0,
					articleCandidates: landmark === "article" ? 1 : 0,
				},
			},
		});
		expect(output).not.toHaveProperty("recovery");
		if (outputLimitPolicy === undefined)
			expect(output.selection).not.toHaveProperty("outputLimitPolicy");
		else
			expect(output.selection).toMatchObject({
				outputLimitPolicy,
			});
		expect(output.extraction).not.toHaveProperty("contentFallback");
		const content =
			format === "markdown"
				? output.extraction.content
				: JSON.stringify(output.extraction.content);
		expect(content).toContain("Owned article");
		expect(content).toContain(
			format === "markdown"
				? "Owned evidence survives replay\\."
				: "Owned evidence survives replay.",
		);
		if (fallback) {
			expect(content).toContain("Useful sibling product");
			expect(content).toContain("Outside navigation");
			expect(output.extraction.scope).toBe(output.extraction.document);
		} else {
			expect(content).not.toContain("Useful sibling product");
			expect(content).not.toContain("Outside");
		}
		if (contentFocus === "main-content-v2")
			expect(output.extraction.contentSelection).toHaveProperty(
				"outsideArticleContent",
				true,
			);
		else
			expect(output.extraction.contentSelection).not.toHaveProperty(
				"outsideArticleContent",
			);
		expect(target.text().trim().split("\n")).toHaveLength(1);
		expect(raw).toEqual(original);
		expect(extract.mock.calls[0][0]).not.toBe(raw);
		expect(extract.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected the replay-owned document tree");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(listeners(target.output)).toEqual(outputListeners);
	},
);
