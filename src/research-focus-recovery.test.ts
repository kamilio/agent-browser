import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	parseResearchArguments,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { parseResearchLinkContentArguments } from "../scripts/research-link-content.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ContentFocusPolicy } from "./extraction-content-focus.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://focus-recovery.fixture.invalid/article";
const policies = [
	"main-content-v1",
	"main-content-v2",
	"main-content-v3",
] as const;
const article =
	"<article><h1>Owned article</h1><p>Bounded article evidence.</p><pre>const answer = 42;</pre><table><tr><th>Value</th></tr><tr><td>42</td></tr></table></article>";
const navigation = `<nav><p>${"Repeated navigation entry. ".repeat(13_000)}</p></nav>`;
const source = `${navigation}<main>${article}</main>`;
const nestedSource = `<main>${navigation}${article}</main>`;
const streams: Array<Readable | Writable> = [];

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Focus recovery must not fetch");
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

async function fixture(
	html = source,
	successful = false,
	contentFocus?: ContentFocusPolicy,
) {
	const body = encoder.encode(html);
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
		false,
		undefined,
		"default",
		{
			minRequestIntervalMs: 0,
			...(contentFocus === undefined ? {} : { contentFocus }),
		},
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report).toMatchObject({
		outcome: successful ? "extracted-unverified" : "failure",
		contentSuccess: successful ? null : false,
		metrics: { active: 0, closed: true },
	});
	if (!successful) {
		expect(report.failure).toMatchObject({
			category: "resource-limit",
			stage: "extraction",
			resourceLimit: {
				kind: "extraction.output",
				unit: "bytes",
				limit: 256_000,
			},
		});
		expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
	}
	const serialized = admission.serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	expect(body).toEqual(encoder.encode(html));
	vi.clearAllMocks();
	return {
		report,
		raw: serialized.jsonl,
		body,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function revised(input: Fixture, path: string, value: unknown): Fixture {
	const report = structuredClone(input.report);
	const keys = path.split(".");
	const last = keys.pop();
	if (!last) throw new Error("Missing mutation path");
	let parent = report as unknown as Record<string, unknown>;
	for (const key of keys) parent = parent[key] as Record<string, unknown>;
	if (value === undefined) delete parent[last];
	else parent[last] = value;
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function recover(
	input: Fixture,
	selection: unknown = { contentFocus: "main-content-v3" },
	signal?: AbortSignal,
) {
	return replay.recoverResearchOutputLimitContentFocus(
		input.raw,
		input.trusted,
		selection as replay.ResearchOutputLimitContentFocusSelection,
		signal,
	);
}

function observeOwnership() {
	const validate = admission.validateResearchOutputLimitSectionAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	).mockImplementation((...args) => {
		const result = validate(...args);
		bodies.push(result.body);
		return result;
	});
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected an owned document");
		expect(tree.nodeCount).toBe(0);
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	};
}

function argumentsFor(
	trusted: admission.TrustedResearchReplayAdmission,
	contentFocus: ContentFocusPolicy = "main-content-v3",
) {
	if (!trusted.expectedBody) throw new Error("Expected body authority");
	return [
		"--expected-profile",
		trusted.expectedProfile,
		"--receipt-sha256",
		trusted.expectedReceiptSha256,
		"--body-sha256",
		trusted.expectedBody.sha256,
		"--body-bytes",
		String(trusted.expectedBody.bytes),
		"--content-focus",
		contentFocus,
	];
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

it.each(
	policies.flatMap((contentFocus) =>
		(["json", "markdown"] as const).map((format) => ({
			contentFocus,
			format,
		})),
	),
)(
	"recovers $contentFocus as $format with original failure provenance",
	async ({ contentFocus, format }) => {
		const input = await fixture();
		const original = structuredClone(input);
		expect(() =>
			replay.extractResearchReplayJson(input.raw, input.trusted, {
				contentFocus,
			}),
		).toThrow(expect.objectContaining({ code: "policy-denied" }));
		const released = observeOwnership();
		const result = replay.recoverResearchOutputLimitContentFocus(
			input.raw,
			input.trusted,
			{
				contentFocus,
				...(format === "markdown"
					? { tableRows: true, compactTables: true }
					: { tableMetadata: true }),
			},
			undefined,
			format,
		);
		expect(result.report).toMatchObject({
			partial: true,
			contentSuccess: null,
			outcome: "extracted-unverified",
			networkRequests: 0,
			source: {
				profile: "default",
				reportedFinalUrl: url,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
			selection: { method: "content-focus", matches: null },
			extraction: {
				format,
				contentSelection: {
					policy: contentFocus,
					selected: contentFocus === "main-content-v3" ? "article" : "main",
					reason:
						contentFocus === "main-content-v3"
							? "unique-article-in-main"
							: "unique-main",
				},
			},
			recovery: {
				kind: "captured-output-limit-content-focus",
				originalOutcome: "failure",
				originalContentSuccess: false,
				originalFailure: input.report.failure,
				originalRequestRetried: false,
			},
		});
		expect(result.jsonl).toContain("Owned article");
		expect(result.jsonl).toContain("const answer = 42;");
		expect(result.jsonl).not.toContain("Repeated navigation entry");
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(Buffer.byteLength(result.jsonl));
		expect(result.outputBytes).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(Object.isFrozen(result.report.extraction?.contentSelection)).toBe(
			true,
		);
		expect(input).toEqual(original);
		released();
	},
);

it.each(policies)(
	"keeps nested navigation limits unless explicitly refined with %s",
	async (contentFocus) => {
		const input = await fixture(nestedSource);
		const released = observeOwnership();
		if (contentFocus === "main-content-v3") {
			const result = recover(input, { contentFocus });
			expect(result.report.extraction?.contentSelection).toMatchObject({
				policy: contentFocus,
				selected: "article",
				reason: "unique-article-in-main",
				mainArticleCandidates: 1,
				outsideMainArticleContent: false,
			});
			expect(result.jsonl).toContain("Owned article");
			expect(result.jsonl).not.toContain("Repeated navigation entry");
		} else {
			expect(() => recover(input, { contentFocus })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
		released();
	},
);

it.each([
	`<main>${navigation}<p>Substantive sibling</p>${article}</main>`,
	`<main>${navigation}${article}<article>Second article</article></main>`,
	`<main><article><p>${"Oversized article content. ".repeat(13_000)}</p></article></main>`,
])(
	"retains conservative output limits and releases failed focus state",
	async (html) => {
		const input = await fixture(html);
		const released = observeOwnership();
		expect(() => recover(input)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		released();
	},
);

it.each(["json", "markdown"] as const)(
	"uses ordinary admission for a successful v3 capture replayed as %s",
	async (format) => {
		const input = await fixture(
			`<main><nav>Small navigation</nav>${article}</main>`,
			true,
			"main-content-v3",
		);
		expect(input.report.contentFocus).toBe("main-content-v3");
		const ordinary = vi.spyOn(admission, "validateResearchReplayAdmission");
		const failed = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ contentFocus: "main-content-v3" },
			undefined,
			format,
		);
		expect(ordinary).toHaveBeenCalledOnce();
		expect(failed).not.toHaveBeenCalled();
		expect(result.report.recovery).toBeUndefined();
		expect(result.report.extraction?.contentSelection).toMatchObject({
			policy: "main-content-v3",
			selected: "article",
			reason: "unique-article-in-main",
		});
		expect(result.jsonl).not.toContain("Small navigation");
		expect(() => recover(input)).toThrow(AgentBrowserError);
	},
);

it.each([
	null,
	undefined,
	[],
	{},
	{ selector: "main" },
	{ section: "h1" },
	{ headings: true },
	{ links: "article" },
	{ find: "article" },
	{ lines: { start: 1, end: 2 } },
	{ jsonPointer: "" },
	{ contentFocus: "" },
	{ contentFocus: "main-content-v4" },
	{ contentFocus: " main-content-v3" },
	{ contentFocus: "main-content-v3 " },
	{ contentFocus: true },
	{ contentFocus: "main-content-v3", selector: "article" },
	{ contentFocus: "main-content-v3", tableMetadata: "true" },
	{ contentFocus: "main-content-v3", tableRows: true },
	{ contentFocus: "main-content-v3", compactTables: true },
	{ contentFocus: "main-content-v3", extra: true },
	{ contentFocus: "main-content-v3", outputLimitPolicy: "text-prefix-v1" },
	{
		contentFocus: "main-content-v3",
		readerMimePolicy: "markdown-html-document-v1",
	},
])("rejects malformed recovery selection before admission: %j", (selection) => {
	const validate = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	expect(() =>
		replay.recoverResearchOutputLimitContentFocus(
			new Uint8Array(),
			{} as admission.TrustedResearchReplayAdmission,
			selection as replay.ResearchOutputLimitContentFocusSelection,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
});

it("does not invoke selection getters, coercions or proxy traps", () => {
	const trap = vi.fn(() => "main-content-v3");
	const proxyTrap = vi.fn(() => Object.prototype);
	for (const selection of [
		Object.defineProperty({}, "contentFocus", { get: trap, enumerable: true }),
		{ contentFocus: { toString: trap, valueOf: trap } },
		new Proxy(
			{ contentFocus: "main-content-v3" },
			{ getPrototypeOf: proxyTrap },
		),
		Object.create({ contentFocus: "main-content-v3" }),
	])
		expect(() =>
			replay.recoverResearchOutputLimitContentFocus(
				new Uint8Array(),
				{} as admission.TrustedResearchReplayAdmission,
				selection,
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(trap).not.toHaveBeenCalled();
	expect(proxyTrap).not.toHaveBeenCalled();
});

it.each([
	{ tableMetadata: true },
	{ outputLimitPolicy: "text-prefix-v1" },
	{ readerMimePolicy: "markdown-html-document-v1" },
])(
	"rejects incompatible Markdown recovery options before admission: %j",
	(options) => {
		const validate = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		expect(() =>
			replay.recoverResearchOutputLimitContentFocus(
				new Uint8Array(),
				{} as admission.TrustedResearchReplayAdmission,
				{ contentFocus: "main-content-v3", ...options },
				undefined,
				"markdown",
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(validate).not.toHaveBeenCalled();
	},
);

it.each([
	["failure.stage", "loader"],
	["failure.category", "timeout"],
	["failure.resourceLimit.kind", "network.response-decoded"],
	["failure.resourceLimit.unit", "code-units"],
	["failure.resourceLimit.observed", 256_000],
	["outcome", "extracted-unverified"],
	["contentSuccess", null],
	["classification.barrier", "challenge"],
	["bodyCapture", undefined],
	["bodyCapture.data", "AAAA"],
	["bodyCapture.sha256", "0".repeat(64)],
	["primaryResponse.bodySha256", "0".repeat(64)],
	["primaryResponse.status", 403],
	["navigation.response.status", 429],
	["primaryResponse.headers.content-type", ["text/markdown"]],
	["reader.scripting", true],
	["metrics.active", 1],
	["metrics.closed", false],
])(
	"retains complete failed-capture admission checks for %s",
	async (path, value) => {
		const input = revised(await fixture(), path as string, value);
		expect(() => recover(input)).toThrow(AgentBrowserError);
	},
);

it.each(["receipt", "body", "bytes", "profile"] as const)(
	"rejects changed %s authority",
	async (field) => {
		const input = await fixture();
		const trusted = {
			...input.trusted,
			...(field === "receipt" ? { expectedReceiptSha256: "0".repeat(64) } : {}),
			...(field === "profile" ? { expectedProfile: "long-v1" as const } : {}),
			...(field === "body" || field === "bytes"
				? {
						expectedBody: {
							bytes: input.body.byteLength + Number(field === "bytes"),
							sha256: field === "body" ? "0".repeat(64) : hash(input.body),
						},
					}
				: {}),
		};
		expect(() =>
			replay.recoverResearchOutputLimitContentFocus(input.raw, trusted, {
				contentFocus: "main-content-v3",
			}),
		).toThrow(AgentBrowserError);
	},
);

it("rejects modified receipt bytes without repinning", async () => {
	const input = await fixture();
	const raw = encoder.encode(`${new TextDecoder().decode(input.raw)} `);
	expect(() => recover({ ...input, raw })).toThrow(AgentBrowserError);
});

it("rejects cancellation before admission", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort();
	const validate = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	expect(() =>
		recover(input, { contentFocus: "main-content-v3" }, controller.signal),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(validate).not.toHaveBeenCalled();
});

it("cleans up admitted bytes and the document on cancellation after loading", async () => {
	const input = await fixture();
	const controller = new AbortController();
	const released = observeOwnership();
	const load = loader.loadResearchDocument;
	vi.spyOn(loader, "loadResearchDocument").mockImplementation((...args) => {
		const tree = load(...args);
		controller.abort();
		return tree;
	});
	expect(() =>
		recover(input, { contentFocus: "main-content-v3" }, controller.signal),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	released();
});

it.each(policies)(
	"parses explicit %s in browser, link and replay CLIs",
	(contentFocus) => {
		expect(
			parseResearchArguments([
				"--reader",
				"--content-focus",
				contentFocus,
				url,
			]),
		).toMatchObject({ contentFocus });
		for (const mode of [
			["--target", url, "--selector", "a"],
			["--target-link", url],
		]) {
			const args = [...mode, "https://focus-recovery.fixture.invalid/"];
			expect(
				parseResearchLinkContentArguments(args).contentFocus,
			).toBeUndefined();
			expect(
				parseResearchLinkContentArguments([
					"--content-focus",
					contentFocus,
					"--compact-tables",
					...args,
				]),
			).toMatchObject({ contentFocus, compactTables: true });
		}
		for (const profile of ["default", "long-v1"] as const) {
			const args = argumentsFor(
				{
					expectedProfile: profile,
					expectedReceiptSha256: "a".repeat(64),
					expectedBody: { bytes: 64, sha256: "b".repeat(64) },
				},
				contentFocus,
			);
			expect(parseResearchReplayArguments(args)).toMatchObject({
				selection: { contentFocus },
				trusted: { expectedProfile: profile },
			});
			if (profile === "default")
				expect(
					parseResearchReplayArguments([...args, "--recover-output-limit"]),
				).toMatchObject({
					recoverOutputLimit: true,
					selection: { contentFocus },
				});
			else
				expect(() =>
					parseResearchReplayArguments([...args, "--recover-output-limit"]),
				).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
	},
);

it("preserves browser selection conflicts and rejects malformed link focus", () => {
	for (const selection of [
		["--selector", "main"],
		["--section", "h1"],
		["--headings"],
		["--find", "article"],
		["--lines", "1:2"],
		["--json-pointer", ""],
	])
		expect(() =>
			parseResearchArguments([
				"--reader",
				"--content-focus",
				"main-content-v3",
				...selection,
				url,
			]),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	for (const flags of [
		["--content-focus"],
		["--content-focus", "main-content-v4"],
		["--content-focus", " main-content-v3"],
		[
			"--content-focus",
			"main-content-v3",
			"--content-focus",
			"main-content-v2",
		],
	])
		expect(() =>
			parseResearchLinkContentArguments([
				"--target-link",
				url,
				"https://focus-recovery.fixture.invalid/",
				...flags,
			]),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each(
	policies.flatMap((contentFocus) =>
		(["json", "markdown"] as const).map((format) => ({
			contentFocus,
			format,
		})),
	),
)(
	"runs exported CLI recovery for $contentFocus as $format without requests",
	async ({ contentFocus, format }) => {
		const input = await fixture();
		const original = structuredClone(input);
		const target = captureStreams(input.raw);
		const outputListeners = listeners(target.output);
		const controller = new AbortController();
		const add = vi.spyOn(controller.signal, "addEventListener");
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const released = observeOwnership();
		const ordinary = vi.spyOn(admission, "validateResearchReplayAdmission");
		const code = await runResearchReplayCli(
			[
				...argumentsFor(input.trusted, contentFocus),
				"--recover-output-limit",
				"--format",
				format,
				...(format === "markdown"
					? ["--table-rows", "--compact-tables"]
					: ["--table-metadata"]),
			],
			target.input,
			target.output,
			controller.signal,
		);
		expect(code).toBe(0);
		expect(JSON.parse(target.text())).toMatchObject({
			networkRequests: 0,
			outcome: "extracted-unverified",
			extraction: { format, contentSelection: { policy: contentFocus } },
			recovery: {
				kind: "captured-output-limit-content-focus",
				originalFailure: input.report.failure,
				originalRequestRetried: false,
			},
		});
		expect(target.text()).not.toContain("Repeated navigation entry");
		expect(ordinary).not.toHaveBeenCalled();
		expect(target.input.listenerCount("data")).toBe(0);
		expect(listeners(target.output)).toEqual(outputListeners);
		expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
		expect(input).toEqual(original);
		released();
	},
);

it("recovers nested article through CLI but keeps successful capture replay ordinary", async () => {
	for (const successful of [false, true]) {
		const input = await fixture(
			successful ? `<main>${article}</main>` : nestedSource,
			successful,
		);
		const target = captureStreams(input.raw);
		expect(
			await runResearchReplayCli(
				[
					...argumentsFor(input.trusted),
					...(successful ? [] : ["--recover-output-limit"]),
				],
				target.input,
				target.output,
			),
		).toBe(0);
		const report = JSON.parse(target.text());
		expect(report.extraction.contentSelection).toMatchObject({
			policy: "main-content-v3",
			selected: "article",
			reason: "unique-article-in-main",
		});
		if (successful) expect(report.recovery).toBeUndefined();
		else
			expect(report.recovery.kind).toBe("captured-output-limit-content-focus");
	}
});

it.each(
	[
		["--recover-empty-outline"],
		["--recover-output-limit"],
		["--selector", "main"],
		["--headings"],
		["--content-focus", "main-content-v3"],
		["--table-rows"],
		["--compact-tables"],
		["--format", "markdown", "--table-metadata"],
		["--format", "markdown", "--output-limit-policy", "text-prefix-v1"],
		["--reader-mime-policy", "markdown-html-document-v1"],
		["--format", "html"],
	].map((flags) => ({ flags })),
)(
	"rejects conflicting recovery flags before touching streams: $flags",
	async ({ flags }) => {
		const target = captureStreams(Uint8Array.of(123));
		const read = vi.spyOn(target.input, "read");
		const inputListeners = listeners(target.input);
		const outputListeners = listeners(target.output);
		await expect(
			runResearchReplayCli(
				[
					...argumentsFor({
						expectedProfile: "default",
						expectedReceiptSha256: "a".repeat(64),
						expectedBody: { bytes: 64, sha256: "b".repeat(64) },
					}),
					"--recover-output-limit",
					...flags,
				],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(read).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
		expect(listeners(target.input)).toEqual(inputListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
	},
);

it.each([
	"ordinary-failure",
	"tampered-body",
	"wrong-failure",
	"successful-recovery",
] as const)("fails closed without CLI output for %s", async (scenario) => {
	const original = await fixture(
		scenario === "successful-recovery" ? `<main>${article}</main>` : source,
		scenario === "successful-recovery",
	);
	const input =
		scenario === "tampered-body"
			? revised(original, "bodyCapture.data", "AAAA")
			: scenario === "wrong-failure"
				? revised(original, "failure.category", "timeout")
				: original;
	const target = captureStreams(input.raw);
	await expect(
		runResearchReplayCli(
			[
				...argumentsFor(input.trusted),
				...(scenario === "ordinary-failure" ? [] : ["--recover-output-limit"]),
			],
			target.input,
			target.output,
		),
	).rejects.toBeInstanceOf(AgentBrowserError);
	expect(target.text()).toBe("");
	expect(target.input.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
	expect(target.input.listenerCount("data")).toBe(0);
});

it("closes CLI streams on pre-aborted recovery without admitting a body", async () => {
	const input = await fixture();
	const target = captureStreams(input.raw);
	const controller = new AbortController();
	controller.abort();
	const validate = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	await expect(
		runResearchReplayCli(
			[...argumentsFor(input.trusted), "--recover-output-limit"],
			target.input,
			target.output,
			controller.signal,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(validate).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
	expect(target.input.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
});

it("releases replay ownership and closes CLI streams when writing fails", async () => {
	const input = await fixture(nestedSource);
	const target = captureStreams(input.raw);
	const released = observeOwnership();
	target.output._write = (_chunk, _encoding, callback) => {
		callback(new Error("Synthetic output failure"));
	};
	await expect(
		runResearchReplayCli(
			[...argumentsFor(input.trusted), "--recover-output-limit"],
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "closed" });
	expect(target.text()).toBe("");
	expect(target.input.destroyed).toBe(true);
	expect(target.output.destroyed).toBe(true);
	released();
});
