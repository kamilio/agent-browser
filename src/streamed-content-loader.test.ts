import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import * as htmlParser from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import * as streaming from "./react-streaming.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";
import {
	loadStreamedContentDocument,
	streamedContentLimits,
} from "./streamed-content-loader.js";

const segmentHelper =
	"$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};";
const trees = new Set<DocumentTree>();
const realParse = htmlParser.parseHtmlDocument;

beforeEach(() => {
	vi.spyOn(htmlParser, "parseHtmlDocument").mockImplementation((...args) => {
		const tree = realParse(...args);
		trees.add(tree);
		return tree;
	});
});

afterEach(() => {
	try {
		for (const tree of trees) tree.close();
	} finally {
		trees.clear();
		vi.restoreAllMocks();
	}
});

function context(signal = new AbortController().signal): DocumentLoaderContext {
	return {
		tabId: "streamed-content-loader-test",
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
		url: "https://streamed-content.invalid/document",
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

function source() {
	return `<main><p>Native content</p><template id="P:3"></template></main><div hidden id="S:3"><p>Resolved café</p></div><script>${segmentHelper}$RS("S:3","P:3")</script><aside hidden>PRIVATE_SENTINEL</aside>`;
}

function parsedTree() {
	expect(trees.size).toBe(1);
	return [...trees][0];
}

function inertHooks() {
	const forbidden = vi.fn((): never => {
		throw new Error("Streamed content must not execute or fetch resources");
	});
	return {
		forbidden,
		hooks: {
			fetch: forbidden,
			fetchScript: forbidden,
			fetchScriptWithPolicy: forbidden,
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

it("keeps styles, scripts, images and fetch hooks inert while projecting source", async () => {
	const { hooks, forbidden } = inertHooks();
	const tree = await loadStreamedContentDocument(
		response(
			`<style>@import url('/never-import.css');#styled { color: red }</style><link rel="stylesheet" href="/never.css"><script src="/never.js"></script><script>fetch('/never-fetch');throw new Error('must not run')</script><img src="/never.png" onload="fetch('/never-event')"><p id="styled">Stylesheet hooks remain inert</p>${source()}`,
		),
		{ ...context(), ...hooks },
	);
	const extracted = extractDocument(tree).content;
	expect(extracted).toContain("Stylesheet hooks remain inert");
	expect(extracted).toContain("Resolved café");
	expect(extracted).not.toContain("PRIVATE_SENTINEL");
	expect(forbidden).not.toHaveBeenCalled();
});

it.each([true, false])(
	"projects source before initialization with reporting callback=%s",
	async (withCallback) => {
		const input = response(source());
		const bytes = input.body.slice();
		const events: string[] = [];
		const onProjection = vi.fn((report: streaming.ReactStreamingReport) => {
			events.push("projection");
			expect(report).toEqual({
				policy: "react-completion-source-v1",
				rendered: false,
				verified: false,
				boundaries: 0,
				segments: 1,
				unresolved: 0,
			});
		});
		const initializeDocument = vi.fn((tree: DocumentTree) => {
			events.push("initialize");
			expect(extractDocument(tree).content).toContain("Resolved café");
			expect(tree.mutationMetrics().closed).toBe(false);
		});
		const tree = await loadStreamedContentDocument(
			input,
			{ ...context(), initializeDocument },
			withCallback ? onProjection : undefined,
		);
		expect(tree).toBe(parsedTree());
		expect(extractDocument(tree).content).not.toContain("PRIVATE_SENTINEL");
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(
			tree,
			"inert-reader",
		);
		expect(onProjection).toHaveBeenCalledTimes(withCallback ? 1 : 0);
		expect(events).toEqual(
			withCallback ? ["projection", "initialize"] : ["initialize"],
		);
		expect(input.body).toEqual(bytes);
	},
);

it.each([201, 204, 301, 404, 500])(
	"does not project an HTTP %s HTML document",
	async (status) => {
		const projection = vi.spyOn(streaming, "reconstructReactStreams");
		const onProjection = vi.fn();
		const initializeDocument = vi.fn();
		const tree = await loadStreamedContentDocument(
			{ ...response(source()), status },
			{ ...context(), initializeDocument },
			onProjection,
		);
		const extracted = extractDocument(tree).content;
		expect(extracted).toContain("Native content");
		expect(extracted).not.toContain("Resolved café");
		expect(extracted).not.toContain("PRIVATE_SENTINEL");
		expect(projection).not.toHaveBeenCalled();
		expect(onProjection).not.toHaveBeenCalled();
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(
			tree,
			"inert-reader",
		);
	},
);

it.each(["text/html", " Text/HTML ; charset=utf-8"])(
	"accepts a single explicit HTML Content-Type %j",
	async (type) => {
		const tree = await loadStreamedContentDocument(
			{ ...response(source()), headers: { "content-type": [type] } },
			context(),
		);
		expect(extractDocument(tree).content).toContain("Resolved café");
	},
);

it.each([
	{ name: "missing", types: undefined },
	{ name: "empty list", types: [] },
	{ name: "empty value", types: [""] },
	{ name: "plain text", types: ["text/plain"] },
	{ name: "XHTML", types: ["application/xhtml+xml"] },
	{ name: "duplicate HTML", types: ["text/html", "text/html"] },
	{ name: "conflicting duplicates", types: ["text/html", "text/plain"] },
	{ name: "coalesced duplicates", types: ["text/html, text/html"] },
])("rejects $name Content-Type before parsing", async ({ types }) => {
	const onProjection = vi.fn();
	const initializeDocument = vi.fn();
	await expect(
		loadStreamedContentDocument(
			{
				...response(source()),
				headers: types === undefined ? {} : { "content-type": types },
			},
			{ ...context(), initializeDocument },
			onProjection,
		),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(htmlParser.parseHtmlDocument).not.toHaveBeenCalled();
	expect(onProjection).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("rejects oversized response bytes before parsing regardless of encodedBytes", async () => {
	const onProjection = vi.fn();
	const initializeDocument = vi.fn();
	await expect(
		loadStreamedContentDocument(
			{
				...response(),
				body: new Uint8Array(
					streamedContentLimits.network.maxResponseBytes + 1,
				),
				encodedBytes: 1,
			},
			{ ...context(), initializeDocument },
			onProjection,
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(htmlParser.parseHtmlDocument).not.toHaveBeenCalled();
	expect(onProjection).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("admits the exact byte cap to the parser's separate text limit", async () => {
	const options = context();
	const limit = streamedContentLimits.network.maxResponseBytes;
	const pending = loadStreamedContentDocument(
		{ ...response(), body: new Uint8Array(limit).fill(32), encodedBytes: 1 },
		options,
	);
	await expect(pending).rejects.toMatchObject({ code: "resource-limit" });
	expect(
		resourceLimitDiagnostic(await pending.catch((error) => error)),
	).toEqual({
		kind: "html.source",
		unit: "code-units",
		limit: options.limits.maxTextCodeUnits,
		observed: limit,
	});
	expect(htmlParser.parseHtmlDocument).toHaveBeenCalledTimes(1);
});

it.each(["stricter", "larger"] as const)(
	"clamps document budgets while retaining %s caller limits",
	async (size) => {
		const options = context();
		const limits =
			size === "stricter"
				? options.limits
				: {
						maxNodes: streamedContentLimits.document.maxNodes + 1,
						maxDepth: streamedContentLimits.document.maxDepth + 1,
						maxTextCodeUnits:
							streamedContentLimits.document.maxTextCodeUnits + 1,
						maxChanges: 17,
					};
		const original = { ...limits };
		const tree = await loadStreamedContentDocument(response(), {
			...options,
			limits: Object.freeze(limits),
		});
		expect(tree.limits).toEqual({
			...(size === "stricter" ? limits : streamedContentLimits.document),
			maxChanges: limits.maxChanges,
		});
		expect(limits).toEqual(original);
	},
);

it.each([
	{
		name: "source text",
		limits: { maxTextCodeUnits: 8 },
		source: "<p>Too much text</p>",
		kind: "html.source",
		limit: 8,
	},
	{
		name: "node count",
		limits: { maxNodes: 8 },
		source: `<body>${"<p>Node</p>".repeat(8)}`,
		kind: "document.nodes",
		limit: 8,
	},
	{
		name: "depth",
		limits: { maxDepth: 4 },
		source: "<body><div><div><div><p>Deep</p></div></div></div>",
		kind: "document.depth",
		limit: 4,
	},
])("enforces the caller's $name limit", async (fixture) => {
	const options = context();
	const close = vi.spyOn(DocumentTree.prototype, "close");
	const onProjection = vi.fn();
	const initializeDocument = vi.fn();
	const pending = loadStreamedContentDocument(
		response(fixture.source),
		{
			...options,
			limits: { ...options.limits, ...fixture.limits },
			initializeDocument,
		},
		onProjection,
	);
	await expect(pending).rejects.toMatchObject({ code: "resource-limit" });
	expect(
		resourceLimitDiagnostic(await pending.catch((error) => error)),
	).toMatchObject({
		kind: fixture.kind,
		limit: fixture.limit,
	});
	expect(close).toHaveBeenCalledTimes(1);
	const failedTree = close.mock.contexts[0] as DocumentTree;
	expect(failedTree.mutationMetrics().closed).toBe(true);
	expect(onProjection).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("rejects prior cancellation before parsing or invoking callbacks", async () => {
	const controller = new AbortController();
	controller.abort();
	const onProjection = vi.fn();
	const initializeDocument = vi.fn();
	await expect(
		loadStreamedContentDocument(
			response(source()),
			{ ...context(controller.signal), initializeDocument },
			onProjection,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(htmlParser.parseHtmlDocument).not.toHaveBeenCalled();
	expect(onProjection).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("closes the candidate when cancelled during asynchronous projection", async () => {
	const controller = new AbortController();
	const onProjection = vi.fn();
	const initializeDocument = vi.fn();
	const pending = loadStreamedContentDocument(
		response(source()),
		{ ...context(controller.signal), initializeDocument },
		onProjection,
	);
	const tree = parsedTree();
	expect(extractDocument(tree).content).not.toContain("Resolved café");
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(tree.mutationMetrics().closed).toBe(true);
	expect(onProjection).not.toHaveBeenCalled();
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("closes the candidate without initialization if the projection callback cancels", async () => {
	const controller = new AbortController();
	const onProjection = vi.fn(() => controller.abort());
	const initializeDocument = vi.fn();
	await expect(
		loadStreamedContentDocument(
			response(source()),
			{ ...context(controller.signal), initializeDocument },
			onProjection,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(parsedTree().mutationMetrics().closed).toBe(true);
	expect(onProjection).toHaveBeenCalledTimes(1);
	expect(initializeDocument).not.toHaveBeenCalled();
});

it.each([200, 404])(
	"closes the HTTP %s candidate if initialization cancels",
	async (status) => {
		const controller = new AbortController();
		const initializeDocument = vi.fn(() => controller.abort());
		await expect(
			loadStreamedContentDocument(
				{ ...response(source()), status },
				{ ...context(controller.signal), initializeDocument },
			).then(() => undefined),
		).rejects.toMatchObject({ code: "aborted" });
		expect(parsedTree().mutationMetrics().closed).toBe(true);
		expect(initializeDocument).toHaveBeenCalledExactlyOnceWith(
			parsedTree(),
			"inert-reader",
		);
	},
);

it.each(["projection", "initialize"] as const)(
	"closes the candidate and preserves a throwing %s callback's error",
	async (stage) => {
		const failure = new Error(`${stage} failure`);
		const onProjection = vi.fn(() => {
			if (stage === "projection") throw failure;
		});
		const initializeDocument = vi.fn(() => {
			throw failure;
		});
		await expect(
			loadStreamedContentDocument(
				response(source()),
				{ ...context(), initializeDocument },
				onProjection,
			),
		).rejects.toBe(failure);
		expect(parsedTree().mutationMetrics().closed).toBe(true);
		expect(onProjection).toHaveBeenCalledTimes(1);
		expect(initializeDocument).toHaveBeenCalledTimes(
			stage === "initialize" ? 1 : 0,
		);
	},
);

it("preserves the initializer error even when a document cleanup handler throws", async () => {
	const failure = new Error("Initializer failure");
	const cleanup = vi.fn(() => {
		throw new Error("Cleanup failure");
	});
	const initializeDocument = vi.fn((tree: DocumentTree) => {
		tree.onClose(cleanup);
		throw failure;
	});
	await expect(
		loadStreamedContentDocument(response(), {
			...context(),
			initializeDocument,
		}),
	).rejects.toBe(failure);
	expect(parsedTree().mutationMetrics().closed).toBe(true);
	expect(cleanup).toHaveBeenCalledTimes(1);
});
