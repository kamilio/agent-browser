import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import * as nativeLoader from "./document-loader.js";
import { type ErrorCode, AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchDocumentStrategyInfo,
	loadNativeReaderFallbackDocument,
	validateResearchDocumentStrategy,
} from "./research-fallback-loader.js";
import * as readerLoader from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

const policy = "native-reader-fallback-v1";
const trees = new Set<DocumentTree>();
const realNativeLoader = nativeLoader.loadBrowserDocument;
const realReaderLoader = readerLoader.loadResearchDocument;

afterEach(() => {
	try {
		for (const tree of trees) tree.close();
	} finally {
		trees.clear();
		vi.restoreAllMocks();
	}
});

function keep(tree: DocumentTree) {
	trees.add(tree);
	return tree;
}

function context(signal = new AbortController().signal): DocumentLoaderContext {
	return {
		tabId: "fallback-loader-test",
		signal,
		limits: {
			maxNodes: 128,
			maxDepth: 32,
			maxTextCodeUnits: 16_384,
			maxChanges: 128,
		},
	};
}

function response(source = "<p>Native content</p>"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://fallback.invalid/document",
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

function candidate() {
	return keep(new DocumentTree("https://fallback.invalid/document"));
}

function observeLoaders() {
	return {
		native: vi
			.spyOn(nativeLoader, "loadBrowserDocument")
			.mockImplementation(async (...args) =>
				keep(await realNativeLoader(...args)),
			),
		reader: vi
			.spyOn(readerLoader, "loadResearchDocument")
			.mockImplementation((...args) => keep(realReaderLoader(...args))),
	};
}

function inertHooks() {
	const forbidden = vi.fn((): never => {
		throw new Error(
			"Fallback strategy must not invoke execution or fetch hooks",
		);
	});
	return {
		forbidden,
		hooks: {
			fetch: forbidden,
			fetchScript: forbidden,
			fetchImage: forbidden,
			fetchStylesheet: forbidden,
			fetchStylesheetWithPolicy: forbidden,
			scripts: Object.freeze({
				start: forbidden,
				script: forbidden,
				finish: forbidden,
				prepareWrittenScript: forbidden,
				policy: forbidden,
				runParser: forbidden,
				parsed: forbidden,
			}),
		},
	};
}

it.each([undefined, policy])("accepts strategy %s", (value) => {
	expect(validateResearchDocumentStrategy(value)).toBe(value);
});

it.each(
	[
		null,
		"",
		"native",
		"reader",
		"native-reader-fallback-v2",
		true,
		0,
		{},
		[],
	].map((value) => ({ value })),
)("rejects invalid strategy $value", ({ value }) => {
	expect(() => validateResearchDocumentStrategy(value)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["", "<main><p>Useful native content</p></main>"])(
	"keeps CSS-hidden templates native even with visible suffix %j",
	async (suffix) => {
		const loaders = observeLoaders();
		const { hooks, forbidden } = inertHooks();
		const modes: ResearchDocumentStrategyInfo[] = [];
		const initializeDocument = vi.fn();
		const tree = await loadNativeReaderFallbackDocument(
			response(
				`<style>#template { display: none }</style><div id="template"><h1>Misleading error template</h1><img src="/never.png"></div><script src="/never.js">never()</script><link rel="stylesheet" href="/never.css">${suffix}`,
			),
			{ ...context(), ...hooks, initializeDocument },
			(information) => modes.push(information),
		);
		const extracted = extractDocument(tree);
		expect(extracted.content).not.toContain("Misleading error template");
		if (suffix) expect(extracted.content).toContain("Useful native content");
		else expect(extracted.content).toBe("");
		expect(researchReaderInfo(tree)).toBeUndefined();
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(modes).toEqual([{ policy, mode: "native" }]);
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(tree);
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each([
	{ category: "unsupported", prefix: '<body><frame src="/never.html">' },
	{
		category: "resource-limit",
		prefix: `<body><svg>${"<g></g>".repeat(12)}</svg>`,
	},
])(
	"recovers a real native $category failure with the bounded reader",
	async ({ category, prefix }) => {
		const loaders = observeLoaders();
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const modes: ResearchDocumentStrategyInfo[] = [];
		const { hooks, forbidden } = inertHooks();
		const options = context();
		const initializeDocument = vi.fn((tree: DocumentTree) => {
			expect(close).toHaveBeenCalledTimes(1);
			expect(tree.mutationMetrics().closed).toBe(false);
			expect(researchReaderInfo(tree)).toBeDefined();
		});
		const input = response(
			`${prefix}<p>Reader café</p><p hidden>Hidden source</p><p style="display:none">Inline hidden source</p><script src="/never.js">never()</script><link rel="stylesheet" href="/never.css">`,
		);
		const bytes = input.body.slice();
		const tree = await loadNativeReaderFallbackDocument(
			input,
			{
				...options,
				limits: { ...options.limits, maxNodes: 12 },
				...hooks,
				initializeDocument,
			},
			(information) => modes.push(information),
		);
		const extracted = extractDocument(tree);
		expect(extracted.content).toContain("Reader café");
		expect(extracted.content).not.toContain("Hidden source");
		expect(extracted.content).not.toContain("Inline hidden source");
		expect(researchReaderInfo(tree)).toMatchObject({
			profile: "native-semantic-reader-v1",
			scripting: false,
			styling: false,
			rawTextPolicy: "separate-omitted-raw-v1",
			visibilityPolicy: "source-hidden-inline-v1",
			hiddenContentSemantics: "source-attributes-and-inline-display",
			fallbackEncoding: "utf-8",
			encoding: "utf-8",
		});
		expect(modes.map((information) => information.mode)).toEqual([
			"native",
			"reader",
		]);
		expect(modes[1].nativeFailure).toMatchObject({ category, stage: "loader" });
		if (category === "resource-limit") {
			expect(modes[1].nativeFailure?.resourceLimit).toEqual({
				kind: "document.nodes",
				unit: "nodes",
				limit: 12,
				observed: 13,
			});
		}
		expect(close).toHaveBeenCalledTimes(1);
		const failedCandidate = close.mock.contexts[0] as DocumentTree;
		expect(failedCandidate).not.toBe(tree);
		expect(failedCandidate.mutationMetrics().closed).toBe(true);
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(tree);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(1);
		expect(input.body).toEqual(bytes);
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each(["native", "reader"] as const)(
	"shares the original inputs, strips every hook and initializes only the %s winner",
	async (mode) => {
		const loaders = observeLoaders();
		const { hooks, forbidden } = inertHooks();
		const events: string[] = [];
		const nativeCandidate = candidate();
		const selected = mode === "native" ? nativeCandidate : candidate();
		const closeNative = vi.spyOn(nativeCandidate, "close");
		const input = Object.freeze({
			...response(),
			headers: Object.freeze({
				"content-type": Object.freeze(["text/html"]),
			}),
			redirects: Object.freeze([]),
		});
		const bytes = input.body.slice();
		const initializeDocument = vi.fn((tree: DocumentTree) => {
			events.push("initialize");
			expect(tree).toBe(selected);
			expect(events).toEqual(
				mode === "native"
					? ["mode:native", "load:native", "initialize"]
					: [
							"mode:native",
							"load:native",
							"mode:reader",
							"load:reader",
							"initialize",
						],
			);
		});
		const options = Object.freeze({
			...context(),
			...hooks,
			initializeDocument,
		});
		Object.freeze(options.limits);
		const originalOptions = { ...options };
		const assertInputs = (
			received: NetworkResponse,
			inert: DocumentLoaderContext,
		) => {
			expect(received).toBe(input);
			expect(received.body).toBe(input.body);
			expect(inert).not.toBe(options);
			expect(Object.keys(inert).sort()).toEqual(["limits", "signal", "tabId"]);
			expect(inert.limits).toBe(options.limits);
			expect(inert.signal).toBe(options.signal);
			expect(inert.tabId).toBe(options.tabId);
			expect(initializeDocument).not.toHaveBeenCalled();
		};
		loaders.native.mockImplementation(async (received, inert) => {
			events.push("load:native");
			assertInputs(received, inert);
			if (mode === "reader") {
				nativeCandidate.close();
				throw new AgentBrowserError("unsupported", "Native candidate failed");
			}
			return selected;
		});
		loaders.reader.mockImplementation((received, inert) => {
			events.push("load:reader");
			assertInputs(received, inert);
			expect(closeNative).toHaveBeenCalledTimes(1);
			return selected;
		});
		expect(
			await loadNativeReaderFallbackDocument(input, options, (information) => {
				events.push(`mode:${information.mode}`);
			}),
		).toBe(selected);
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(selected);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(mode === "reader" ? 1 : 0);
		if (mode === "reader") {
			expect(loaders.reader).toHaveBeenCalledWith(
				input,
				loaders.native.mock.calls[0][1],
				undefined,
				"separate-omitted-raw-v1",
				"source-hidden-inline-v1",
				undefined,
				"utf-8",
			);
			expect(loaders.reader.mock.calls[0][1]).toBe(
				loaders.native.mock.calls[0][1],
			);
		} else expect(closeNative).not.toHaveBeenCalled();
		expect(selected.mutationMetrics().closed).toBe(false);
		expect(options).toEqual(originalOptions);
		expect(input).toEqual({ ...response(), body: bytes });
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each([
	["unsupported", "text/html"],
	["unsupported", " TEXT/HTML ; charset=utf-8"],
	["unsupported", "text/html; charset=windows-1252"],
	["resource-limit", "text/html"],
	["resource-limit", " TEXT/HTML ; charset=utf-8"],
	["resource-limit", "text/html; charset=windows-1252"],
] as const)(
	"permits %s fallback for one explicit %s MIME",
	async (code, mime) => {
		const loaders = observeLoaders();
		const selected = candidate();
		loaders.native.mockRejectedValueOnce(
			new AgentBrowserError(code, "Native failure"),
		);
		loaders.reader.mockReturnValueOnce(selected);
		const input = { ...response(), headers: { "content-type": [mime] } };
		expect(await loadNativeReaderFallbackDocument(input, context())).toBe(
			selected,
		);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(1);
	},
);

const refusedResponses: {
	name: string;
	status: number;
	types?: string[];
}[] = [
	...[201, 204, 206, 301, 304, 401, 403, 404, 429, 500].map((status) => ({
		name: `HTTP ${status}`,
		status,
		types: ["text/html"],
	})),
	{ name: "missing MIME", status: 200 },
	{ name: "no MIME values", status: 200, types: [] },
	{ name: "empty MIME", status: 200, types: [""] },
	{ name: "plain text", status: 200, types: ["text/plain"] },
	{ name: "XHTML", status: 200, types: ["application/xhtml+xml"] },
	{ name: "JSON", status: 200, types: ["application/json"] },
	{ name: "Markdown", status: 200, types: ["text/markdown"] },
	{ name: "duplicate MIME", status: 200, types: ["text/html", "text/html"] },
	{ name: "combined MIME", status: 200, types: ["text/html, text/html"] },
];

it.each(refusedResponses)(
	"preserves the native error for $name",
	async ({ status, types }) => {
		const loaders = observeLoaders();
		const error = resourceLimitError(
			"html.tokens",
			10,
			11,
			"Private native source",
		);
		const initializeDocument = vi.fn();
		const onMode = vi.fn();
		loaders.native.mockRejectedValueOnce(error);
		await expect(
			loadNativeReaderFallbackDocument(
				{
					...response(),
					status,
					headers: types === undefined ? {} : { "content-type": types },
				},
				{ ...context(), initializeDocument },
				onMode,
			),
		).rejects.toBe(error);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(onMode).toHaveBeenCalledExactlyOnceWith({ policy, mode: "native" });
	},
);

const refusedCodes: ErrorCode[] = [
	"invalid-input",
	"stale-reference",
	"not-found",
	"not-actionable",
	"policy-denied",
	"network-error",
	"timeout",
	"aborted",
	"closed",
];

it.each([
	...refusedCodes.map((code) => ({
		name: code,
		error: new AgentBrowserError(code, code),
	})),
	{ name: "unknown Error", error: new Error("unsupported") },
	{ name: "lookalike unsupported", error: { code: "unsupported" } },
	{ name: "lookalike resource-limit", error: { code: "resource-limit" } },
	{ name: "primitive", error: "unsupported" },
	{ name: "null", error: null },
])("does not fallback for $name errors", async ({ error }) => {
	const loaders = observeLoaders();
	const initializeDocument = vi.fn();
	const onMode = vi.fn();
	loaders.native.mockRejectedValueOnce(error);
	await expect(
		loadNativeReaderFallbackDocument(
			response(),
			{ ...context(), initializeDocument },
			onMode,
		),
	).rejects.toBe(error);
	expect(loaders.native).toHaveBeenCalledTimes(1);
	expect(loaders.reader).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
	expect(onMode).toHaveBeenCalledExactlyOnceWith({ policy, mode: "native" });
});

it.each(["unsupported", "resource-limit", "diagnostic"] as const)(
	"publishes deeply immutable sanitized %s attempt metadata",
	async (kind) => {
		const loaders = observeLoaders();
		const error =
			kind === "diagnostic"
				? resourceLimitError("html.tokens", 10, 11, "Private failure text")
				: new AgentBrowserError(kind, "Private failure text");
		Object.assign(error, {
			source: "Private source",
			resourceLimit: { source: "Private diagnostic" },
		});
		const selected = candidate();
		const modes: ResearchDocumentStrategyInfo[] = [];
		loaders.native.mockRejectedValueOnce(error);
		loaders.reader.mockReturnValueOnce(selected);
		await loadNativeReaderFallbackDocument(
			response(),
			context(),
			(information) => {
				expect(Object.isFrozen(information)).toBe(true);
				expect(Reflect.set(information, "mode", "changed")).toBe(false);
				if (information.nativeFailure) {
					expect(Object.isFrozen(information.nativeFailure)).toBe(true);
					expect(
						Reflect.set(information.nativeFailure, "category", "changed"),
					).toBe(false);
					if (information.nativeFailure.resourceLimit) {
						expect(
							Object.isFrozen(information.nativeFailure.resourceLimit),
						).toBe(true);
						expect(
							Reflect.set(
								information.nativeFailure.resourceLimit,
								"limit",
								999,
							),
						).toBe(false);
					}
				}
				modes.push(information);
			},
		);
		expect(modes).toEqual([
			{ policy, mode: "native" },
			{
				policy,
				mode: "reader",
				nativeFailure: {
					category: kind === "unsupported" ? "unsupported" : "resource-limit",
					stage: "loader",
					...(kind === "diagnostic"
						? {
								resourceLimit: {
									kind: "html.tokens",
									unit: "tokens",
									limit: 10,
									observed: 11,
								},
							}
						: {}),
				},
			},
		]);
		expect(modes[0]).not.toBe(modes[1]);
		expect(JSON.stringify(modes)).not.toContain("Private");
		expect(error.message).toBe("Private failure text");
	},
);

it.each(["native", "reader"] as const)(
	"propagates a throwing %s mode callback without attempting that loader",
	async (mode) => {
		const loaders = observeLoaders();
		const error = new Error("Callback failure");
		const initializeDocument = vi.fn();
		const onMode = vi.fn((information: ResearchDocumentStrategyInfo) => {
			if (information.mode === mode) throw error;
		});
		loaders.native.mockRejectedValueOnce(
			new AgentBrowserError("unsupported", "Native failure"),
		);
		await expect(
			loadNativeReaderFallbackDocument(
				response(),
				{ ...context(), initializeDocument },
				onMode,
			),
		).rejects.toBe(error);
		expect(onMode).toHaveBeenCalledTimes(mode === "native" ? 1 : 2);
		expect(loaders.native).toHaveBeenCalledTimes(mode === "native" ? 0 : 1);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it("does no parser or notification work for an already-aborted signal", async () => {
	const loaders = observeLoaders();
	const controller = new AbortController();
	controller.abort();
	const initializeDocument = vi.fn();
	const onMode = vi.fn();
	await expect(
		loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			onMode,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(loaders.native).not.toHaveBeenCalled();
	expect(loaders.reader).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
	expect(onMode).not.toHaveBeenCalled();
});

it.each([
	["native", false],
	["reader", false],
	["native", true],
	["reader", true],
] as const)(
	"handles cancellation in the %s callback (throws: %s)",
	async (mode, throws) => {
		const loaders = observeLoaders();
		const controller = new AbortController();
		const error = new Error("Callback abort and failure");
		const initializeDocument = vi.fn();
		loaders.native.mockRejectedValueOnce(
			new AgentBrowserError("resource-limit", "Native failure"),
		);
		const pending = loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			(information) => {
				if (information.mode !== mode) return;
				controller.abort();
				if (throws) throw error;
			},
		);
		if (throws) await expect(pending).rejects.toBe(error);
		else await expect(pending).rejects.toMatchObject({ code: "aborted" });
		expect(loaders.native).toHaveBeenCalledTimes(mode === "native" ? 0 : 1);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it.each(["resolves", "rejects"] as const)(
	"honors cancellation while native loading is pending and then %s",
	async (settlement) => {
		const loaders = observeLoaders();
		const controller = new AbortController();
		const selected = candidate();
		const close = vi.spyOn(selected, "close");
		const initializeDocument = vi.fn();
		const onMode = vi.fn();
		let resolveNative!: (tree: DocumentTree) => void;
		let rejectNative!: (error: unknown) => void;
		loaders.native.mockReturnValueOnce(
			new Promise<DocumentTree>((resolve, reject) => {
				resolveNative = resolve;
				rejectNative = reject;
			}),
		);
		const pending = loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			onMode,
		);
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		try {
			expect(loaders.native).toHaveBeenCalledTimes(1);
			controller.abort();
		} finally {
			if (settlement === "resolves") resolveNative(selected);
			else {
				selected.close();
				rejectNative(
					new AgentBrowserError("unsupported", "Late native failure"),
				);
			}
			await rejected;
		}
		expect(close).toHaveBeenCalledTimes(1);
		expect(selected.mutationMetrics().closed).toBe(true);
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(onMode).toHaveBeenCalledExactlyOnceWith({ policy, mode: "native" });
	},
);

it.each([
	new Error("Reader failure"),
	new AgentBrowserError("unsupported", "Reader unsupported"),
	new AgentBrowserError("aborted", "Reader aborted"),
])(
	"retains reader failure identity and attempted reader mode: %s",
	async (error) => {
		const loaders = observeLoaders();
		const initializeDocument = vi.fn();
		const modes: ResearchDocumentStrategyInfo[] = [];
		loaders.native.mockRejectedValueOnce(
			new AgentBrowserError("unsupported", "Native failure"),
		);
		loaders.reader.mockImplementationOnce(() => {
			throw error;
		});
		await expect(
			loadNativeReaderFallbackDocument(
				response(),
				{ ...context(), initializeDocument },
				(information) => modes.push(information),
			),
		).rejects.toBe(error);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(1);
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(modes).toEqual([
			{ policy, mode: "native" },
			{
				policy,
				mode: "reader",
				nativeFailure: { category: "unsupported", stage: "loader" },
			},
		]);
	},
);

it("keeps the reader's real resource limits and closes both failed parser candidates", async () => {
	const loaders = observeLoaders();
	const close = vi.spyOn(DocumentTree.prototype, "close");
	const options = context();
	const initializeDocument = vi.fn();
	const modes: ResearchDocumentStrategyInfo[] = [];
	const error: unknown = await loadNativeReaderFallbackDocument(
		response("<body><frame><p>Reader content</p>"),
		{
			...options,
			limits: { ...options.limits, maxNodes: 4 },
			initializeDocument,
		},
		(information) => modes.push(information),
	).catch((error: unknown) => error);
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "document.nodes",
		unit: "nodes",
		limit: 4,
		observed: 5,
	});
	expect(loaders.native).toHaveBeenCalledTimes(1);
	expect(loaders.reader).toHaveBeenCalledTimes(1);
	expect(close).toHaveBeenCalledTimes(2);
	expect(close.mock.contexts[0]).not.toBe(close.mock.contexts[1]);
	for (const tree of close.mock.contexts as DocumentTree[]) {
		expect(tree.mutationMetrics().closed).toBe(true);
	}
	expect(initializeDocument).not.toHaveBeenCalled();
	expect(modes[1].nativeFailure).toEqual({
		category: "unsupported",
		stage: "loader",
	});
});

it.each(["returns", "throws"] as const)(
	"handles cancellation inside a reader that %s without initializing or retrying",
	async (settlement) => {
		const loaders = observeLoaders();
		const controller = new AbortController();
		const selected = candidate();
		const close = vi.spyOn(selected, "close");
		const initializeDocument = vi.fn();
		const error = new AgentBrowserError("aborted", "Reader cancellation");
		loaders.native.mockRejectedValueOnce(
			new AgentBrowserError("unsupported", "Native failure"),
		);
		loaders.reader.mockImplementationOnce(() => {
			controller.abort();
			if (settlement === "throws") {
				selected.close();
				throw error;
			}
			return selected;
		});
		const pending = loadNativeReaderFallbackDocument(response(), {
			...context(controller.signal),
			initializeDocument,
		});
		if (settlement === "throws") await expect(pending).rejects.toBe(error);
		else await expect(pending).rejects.toMatchObject({ code: "aborted" });
		expect(close).toHaveBeenCalledTimes(1);
		expect(selected.mutationMetrics().closed).toBe(true);
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(1);
	},
);

it.each([
	["native", "throws"],
	["reader", "throws"],
	["native", "aborts"],
	["reader", "aborts"],
] as const)(
	"closes the %s winner when its initializer %s without fallback",
	async (mode, failure) => {
		const loaders = observeLoaders();
		const selected = candidate();
		const close = vi.spyOn(selected, "close");
		const controller = new AbortController();
		const error = resourceLimitError(
			"document.nodes",
			4,
			5,
			"Initializer failure",
		);
		const onMode = vi.fn();
		if (mode === "reader") {
			loaders.native.mockRejectedValueOnce(
				new AgentBrowserError("unsupported", "Native failure"),
			);
			loaders.reader.mockReturnValueOnce(selected);
		} else loaders.native.mockResolvedValueOnce(selected);
		const initializeDocument = vi.fn(() => {
			if (failure === "throws") throw error;
			controller.abort();
		});
		const pending = loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			onMode,
		);
		if (failure === "throws") await expect(pending).rejects.toBe(error);
		else await expect(pending).rejects.toMatchObject({ code: "aborted" });
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(selected);
		expect(close).toHaveBeenCalledTimes(1);
		expect(selected.mutationMetrics().closed).toBe(true);
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(mode === "reader" ? 1 : 0);
		expect(onMode).toHaveBeenCalledTimes(mode === "reader" ? 2 : 1);
		expect(onMode.mock.lastCall?.[0].mode).toBe(mode);
	},
);

it("does not fallback after successful native loading followed by extraction failure", async () => {
	const loaders = observeLoaders();
	const onMode = vi.fn();
	const tree = await loadNativeReaderFallbackDocument(
		response(`<p>${"Native content ".repeat(24)}</p>`),
		context(),
		onMode,
	);
	expect(() => extractDocument(tree, { maxBytes: 256 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(loaders.native).toHaveBeenCalledTimes(1);
	expect(loaders.reader).not.toHaveBeenCalled();
	expect(onMode).toHaveBeenCalledExactlyOnceWith({ policy, mode: "native" });
	expect(tree.mutationMetrics().closed).toBe(false);
});

it.each(
	(
		[
			"timeout",
			"closed",
			"aborted",
			"unsupported",
			"resource-limit",
			"policy-denied",
			"network-error",
		] as const
	).flatMap((code) =>
		(["before", "during"] as const).map((phase) => ({ code, phase })),
	),
)(
	"preserves typed $code cancellation $phase real native loading without reader retry",
	async ({ code, phase }) => {
		const loaders = observeLoaders();
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const controller = new AbortController();
		const error = new AgentBrowserError(code, "Typed cancellation sentinel");
		const initializeDocument = vi.fn();
		const onMode = vi.fn();
		if (phase === "before") controller.abort(error);
		const pending = loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			onMode,
		);
		if (phase === "during") controller.abort(error);
		await expect(pending).rejects.toBe(error);
		expect(loaders.native).toHaveBeenCalledTimes(phase === "during" ? 1 : 0);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(phase === "during" ? 1 : 0);
		if (phase === "during") {
			await expect(loaders.native.mock.results[0].value).rejects.toBe(error);
			const failedTree = close.mock.contexts[0] as DocumentTree;
			expect(failedTree.mutationMetrics().closed).toBe(true);
			expect(onMode).toHaveBeenCalledExactlyOnceWith({
				policy,
				mode: "native",
			});
		} else expect(onMode).not.toHaveBeenCalled();
	},
);

it.each(
	[
		{ name: "Error", reason: new Error("Private abort reason") },
		{ name: "string", reason: "Private abort reason" },
		{
			name: "error lookalike",
			reason: { code: "unsupported", message: "Private abort reason" },
		},
		{ name: "default reason", reason: undefined },
	].flatMap((entry) =>
		(["before", "during"] as const).map((phase) => ({ ...entry, phase })),
	),
)(
	"sanitizes untyped $name cancellation $phase real native loading",
	async ({ reason, phase }) => {
		const loaders = observeLoaders();
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const controller = new AbortController();
		const initializeDocument = vi.fn();
		const onMode = vi.fn();
		if (phase === "before") controller.abort(reason);
		const pending = loadNativeReaderFallbackDocument(
			response(),
			{ ...context(controller.signal), initializeDocument },
			onMode,
		);
		if (phase === "during") controller.abort(reason);
		const error: unknown = await pending.catch((error: unknown) => error);
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({
			code: "aborted",
			message: "Document loading aborted",
		});
		expect(String(error)).toBe("AgentBrowserError: Document loading aborted");
		expect(error).not.toBe(controller.signal.reason);
		expect(error).not.toHaveProperty("cause");
		expect(loaders.native).toHaveBeenCalledTimes(phase === "during" ? 1 : 0);
		expect(loaders.reader).not.toHaveBeenCalled();
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(phase === "during" ? 1 : 0);
		if (phase === "during") {
			const failedTree = close.mock.contexts[0] as DocumentTree;
			expect(failedTree.mutationMetrics().closed).toBe(true);
			expect(onMode).toHaveBeenCalledExactlyOnceWith({
				policy,
				mode: "native",
			});
		} else expect(onMode).not.toHaveBeenCalled();
	},
);

it.each(
	(["native", "reader"] as const).flatMap((mode) =>
		(
			[
				"policy-denied",
				"unsupported",
				"resource-limit",
				"timeout",
				"closed",
			] as const
		).map((code) => ({ mode, code })),
	),
)(
	"retains the $mode initializer's $code failure when real close cleanup throws",
	async ({ mode, code }) => {
		const loaders = observeLoaders();
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const controller = new AbortController();
		const error =
			code === "resource-limit"
				? resourceLimitError("document.nodes", 4, 5, "Initializer sentinel")
				: new AgentBrowserError(code, "Initializer sentinel");
		const cleanupError = new Error("Secondary cleanup sentinel");
		const throwingCleanup = vi.fn(() => {
			throw cleanupError;
		});
		const remainingCleanup = vi.fn();
		const modes: ResearchDocumentStrategyInfo[] = [];
		let selected: DocumentTree | undefined;
		const initializeDocument = vi.fn((tree: DocumentTree) => {
			selected = keep(tree);
			tree.onClose(throwingCleanup);
			tree.onClose(remainingCleanup);
			if (code === "timeout" || code === "closed") controller.abort(error);
			else throw error;
		});
		await expect(
			loadNativeReaderFallbackDocument(
				response(
					mode === "reader"
						? "<body><frame><p>Reader content</p>"
						: "<p>Native content</p>",
				),
				{ ...context(controller.signal), initializeDocument },
				(information) => modes.push(information),
			),
		).rejects.toBe(error);
		expect(selected).toBeDefined();
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(selected);
		expect(selected?.mutationMetrics().closed).toBe(true);
		expect(throwingCleanup).toHaveBeenCalledTimes(1);
		expect(remainingCleanup).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(mode === "reader" ? 2 : 1);
		expect(close.mock.contexts.at(-1)).toBe(selected);
		if (mode === "reader") {
			const failedTree = close.mock.contexts[0] as DocumentTree;
			expect(failedTree).not.toBe(selected);
			expect(failedTree.mutationMetrics().closed).toBe(true);
		}
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(mode === "reader" ? 1 : 0);
		expect(modes).toEqual(
			mode === "reader"
				? [
						{ policy, mode: "native" },
						{
							policy,
							mode: "reader",
							nativeFailure: { category: "unsupported", stage: "loader" },
						},
					]
				: [{ policy, mode: "native" }],
		);
	},
);

it.each(
	(["native", "reader"] as const).flatMap((mode) =>
		(["timeout", "closed"] as const).map((code) => ({ mode, code })),
	),
)(
	"preserves $code before initializing the real $mode winner despite throwing cleanup",
	async ({ mode, code }) => {
		const loaders = observeLoaders();
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const controller = new AbortController();
		const error = new AgentBrowserError(code, "Selected tree cancellation");
		const throwingCleanup = vi.fn(() => {
			throw new Error("Secondary selected tree cleanup failure");
		});
		const remainingCleanup = vi.fn();
		const initializeDocument = vi.fn();
		const onMode = vi.fn();
		let selected: DocumentTree | undefined;
		const cancelSelected = (tree: DocumentTree) => {
			selected = keep(tree);
			tree.onClose(throwingCleanup);
			tree.onClose(remainingCleanup);
			controller.abort(error);
			return tree;
		};
		if (mode === "native")
			loaders.native.mockImplementation(async (...args) =>
				cancelSelected(await realNativeLoader(...args)),
			);
		else
			loaders.reader.mockImplementation((...args) =>
				cancelSelected(realReaderLoader(...args)),
			);
		await expect(
			loadNativeReaderFallbackDocument(
				response(
					mode === "reader"
						? "<body><frame><p>Reader content</p>"
						: "<p>Native content</p>",
				),
				{ ...context(controller.signal), initializeDocument },
				onMode,
			),
		).rejects.toBe(error);
		expect(selected).toBeDefined();
		expect(selected?.mutationMetrics().closed).toBe(true);
		expect(initializeDocument).not.toHaveBeenCalled();
		expect(throwingCleanup).toHaveBeenCalledTimes(1);
		expect(remainingCleanup).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(mode === "reader" ? 2 : 1);
		expect(close.mock.contexts.at(-1)).toBe(selected);
		if (mode === "reader") {
			const failedTree = close.mock.contexts[0] as DocumentTree;
			expect(failedTree).not.toBe(selected);
			expect(failedTree.mutationMetrics().closed).toBe(true);
		}
		expect(loaders.native).toHaveBeenCalledTimes(1);
		expect(loaders.reader).toHaveBeenCalledTimes(mode === "reader" ? 1 : 0);
		expect(onMode).toHaveBeenCalledTimes(mode === "reader" ? 2 : 1);
		expect(onMode.mock.lastCall?.[0].mode).toBe(mode);
	},
);
