import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import {
	type DocumentScriptAdmission,
	documentScriptCsp,
} from "./document-script-csp.js";
import { documentScriptState } from "./document-script-state.js";
import { writeDocument } from "./document-write.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { HtmlModuleRequest, HtmlModuleSource } from "./html-module.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import {
	initializeScriptElement,
	setScriptElementAsync,
} from "./script-element-state.js";
import { ScriptLoader, type ScriptLoaderOptions } from "./script-loader.js";

const documents: DocumentTree[] = [];
const controllers: AbortController[] = [];

afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	for (const tree of documents.splice(0)) tree.close();
});

const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function response(
	source: string,
	url = "https://example.com/page",
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

type EvaluationOptions = {
	signal: AbortSignal;
	filename: string;
	discardResult: true;
	sourceType?: "module";
};

function fixture(
	html: string,
	options: {
		limits?: ScriptLoaderOptions;
		capable?: boolean;
		provider?: boolean;
		closed?: () => boolean;
		headers?: Record<string, readonly string[]>;
		prepare?: (request: HtmlModuleRequest) => Promise<HtmlModuleSource>;
		evaluate?: (
			source: string,
			tree: DocumentTree,
			options: EvaluationOptions,
		) => Promise<ScriptEvaluation>;
	} = {},
) {
	const controller = new AbortController();
	controllers.push(controller);
	const created = deferred<DocumentTree>();
	const interactive = deferred<void>();
	const domReady = deferred<void>();
	const events: string[] = [];
	const requests: HtmlModuleRequest[] = [];
	const seen: {
		source: string;
		options: EvaluationOptions;
		current: number | null | undefined;
		state: string | undefined;
		text: string;
	}[] = [];
	const input = response(html);
	Object.assign(input.headers, options.headers);
	const prepare = vi.fn(async (request: HtmlModuleRequest) => {
		requests.push(request);
		return options.prepare
			? options.prepare(request)
			: { id: request.id, source: request.source ?? request.id };
	});
	const fetch = vi.fn(async (url: string) => ({
		...response(new URL(url).pathname, url),
		headers: { "content-type": ["text/javascript"] },
	}));
	const fetchWithPolicy = vi.fn(async (url: string) => ({
		response: await fetch(url),
		type: "basic" as const,
	}));
	const scripts = new ScriptLoader({
		response: input,
		signal: controller.signal,
		limits: options.limits ?? { modules: true },
		fetch,
		fetchWithPolicy,
		owner: (tree) => {
			documents.push(tree);
			created.resolve(tree);
			const native = documentInteractions(tree).events;
			for (const type of ["load", "error"])
				native.addEventListener(
					tree.root,
					type,
					(event) => {
						if (event.target === null) return;
						const target = tree.get(event.target);
						if (target.tagName === "script")
							events.push(
								`${type}:${target.attributes.id ?? target.attributes.src}`,
							);
					},
					{ capture: true },
				);
			native.addEventListener(tree.root, "readystatechange", () => {
				const state = documentScriptState(tree)?.readyState;
				events.push(`state:${state}`);
				if (state === "interactive") interactive.resolve();
			});
			native.addEventListener(tree.root, "DOMContentLoaded", () => {
				events.push("DOMContentLoaded");
				domReady.resolve();
			});
			native.addEventListener(native.windowTarget as number, "load", () => {
				events.push("window-load");
			});
			return {
				get closed() {
					return options.closed?.() ?? false;
				},
				supportsHtmlModules: Object.hasOwn(options, "capable")
					? options.capable
					: true,
				...(options.provider === false ? {} : { prepareModule: prepare }),
				evaluate: async (source, evaluation) => {
					seen.push({
						source,
						options: evaluation,
						current: documentScriptState(tree)?.currentScript,
						state: documentScriptState(tree)?.readyState,
						text: tree.textContent(tree.root),
					});
					return options.evaluate
						? options.evaluate(source, tree, evaluation)
						: success;
				},
			};
		},
	});
	const loading = loadBrowserDocument(input, {
		scripts,
		signal: controller.signal,
		tabId: "html-module-fixture",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100_000,
			maxChanges: 100,
		},
	});
	void loading.catch(() => undefined);
	return {
		loading,
		scripts,
		created: created.promise,
		interactive: interactive.promise,
		domReady: domReady.promise,
		controller,
		requests,
		prepare,
		fetch,
		fetchWithPolicy,
		seen,
		events,
	};
}

function insertModule(
	tree: DocumentTree,
	attributes: Record<string, string> = {},
	text = "",
	async?: boolean,
) {
	const id = tree.createElement("script", { type: "module", ...attributes });
	initializeScriptElement(tree, id, "dynamic");
	if (async !== undefined) setScriptElementAsync(tree, id, async);
	if (text) tree.setTextContent(id, text);
	tree.append(tree.root, id);
	return id;
}

it.each(["external", "inline"])(
	"loads a post-parse dynamic %s module with insertion-time inputs",
	async (kind) => {
		const value = fixture('<base href="/modules/">', {
			async evaluate(_source, tree) {
				expect(documentScriptState(tree)?.currentScript).toBeNull();
				expect(() => writeDocument(tree, "forbidden")).toThrow();
				return success;
			},
		});
		const tree = await value.loading;
		const external = kind === "external";
		const id = insertModule(
			tree,
			{
				id: "entry",
				nomodule: "",
				crossorigin: "use-credentials",
				integrity: "entry-integrity",
				...(external ? { src: "entry.js" } : {}),
			},
			external ? "" : "inline-entry",
		);
		tree.setAttribute(id, "src", "/replacement.js");
		tree.setTextContent(id, "replacement");
		await value.scripts.settle();
		expect(value.prepare).toHaveBeenCalledTimes(1);
		expect(value.requests[0]).toMatchObject({
			id: external
				? "https://example.com/modules/entry.js"
				: `urn:agent-browser:html-module:${id}`,
			baseUrl: "https://example.com/modules/",
			credentials: "include",
			...(external
				? { integrity: "entry-integrity" }
				: { source: "inline-entry" }),
		});
		expect(value.requests[0]).not.toHaveProperty(
			external ? "source" : "integrity",
		);
		expect(value.requests[0]).not.toHaveProperty("admission");
		expect(value.seen).toEqual([
			expect.objectContaining({
				source: external ? value.requests[0].id : "inline-entry",
				current: null,
				state: "complete",
				options: {
					signal: value.requests[0].signal,
					filename: value.requests[0].id,
					discardResult: true,
					sourceType: "module",
				},
			}),
		]);
		expect(value.fetch).not.toHaveBeenCalled();
		expect(value.fetchWithPolicy).not.toHaveBeenCalled();
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual(["load:entry"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			discovered: 1,
			executed: 1,
			external: external ? 1 : 0,
			failed: 0,
			complete: true,
		});
	},
);

it.each(["external", "inline"])(
	"runs dynamic %s modules asynchronously by default without delaying DOMContentLoaded",
	async (kind) => {
		const pending = deferred<HtmlModuleSource>();
		const fastRan = deferred<void>();
		const value = fixture("<script>bootstrap</script><p>parsed tail</p>", {
			prepare: async (request) =>
				request.source === "slow" || request.id.endsWith("/slow.js")
					? pending.promise
					: { id: request.id, source: "fast" },
			async evaluate(source, tree) {
				if (source === "bootstrap") {
					for (const name of ["slow", "fast"])
						insertModule(
							tree,
							{
								id: name,
								defer: "",
								...(kind === "external" ? { src: `/${name}.js` } : {}),
							},
							kind === "inline" ? name : "",
						);
					await Promise.resolve();
					expect(value.seen.map((entry) => entry.source)).toEqual([
						"bootstrap",
					]);
				} else if (source === "fast") fastRan.resolve();
				return success;
			},
		});
		await value.domReady;
		expect(value.requests).toHaveLength(2);
		await fastRan.promise;
		expect(value.seen.map((entry) => entry.source)).toEqual([
			"bootstrap",
			"fast",
		]);
		expect(value.events).not.toContain("window-load");
		pending.resolve({ id: value.requests[0].id, source: "slow" });
		await value.loading;
		expect(value.seen.map((entry) => entry.source)).toEqual([
			"bootstrap",
			"fast",
			"slow",
		]);
		expect(value.events.indexOf("DOMContentLoaded")).toBeLessThan(
			value.events.indexOf("load:slow"),
		);
		expect(value.events.indexOf("load:slow")).toBeLessThan(
			value.events.indexOf("window-load"),
		);
	},
);

it.each(["external", "inline"])(
	"orders dynamic async=false %s modules with classic scripts while async modules proceed",
	async (kind) => {
		const pending = deferred<HtmlModuleSource>();
		const independentRan = deferred<void>();
		const value = fixture("", {
			prepare: async (request) =>
				request.source === "first" || request.id.endsWith("/first.js")
					? pending.promise
					: { id: request.id, source: request.source ?? "second" },
			async evaluate(source) {
				if (source === "independent") independentRan.resolve();
				return success;
			},
		});
		const tree = await value.loading;
		for (const name of ["first", "second"]) {
			insertModule(
				tree,
				kind === "external" ? { src: `/${name}.js` } : {},
				kind === "inline" ? name : "",
				false,
			);
			if (name === "first")
				insertModule(tree, { type: "", src: "/classic.js" }, "", false);
		}
		insertModule(tree, {}, "independent");
		expect(value.requests).toHaveLength(3);
		await independentRan.promise;
		expect(value.seen.map((entry) => entry.source)).toEqual(["independent"]);
		pending.resolve({ id: value.requests[0].id, source: "first" });
		await value.scripts.settle();
		expect(value.seen.map((entry) => entry.source)).toEqual([
			"independent",
			"first",
			"/classic.js",
			"second",
		]);
	},
);

it("executes dynamic module identities once across parser entries, duplicate elements and moves", async () => {
	const value = fixture('<script type="module" src="/parser.js"></script>');
	const tree = await value.loading;
	insertModule(tree, { src: "/parser.js", id: "parser-copy" });
	const external = insertModule(tree, { src: "/dynamic.js", id: "dynamic" });
	insertModule(tree, {
		src: "https://EXAMPLE.com:443/dynamic.js",
		id: "dynamic-copy",
	});
	const inline = insertModule(tree, { id: "inline" }, "same");
	insertModule(tree, { id: "inline-copy" }, "same");
	for (const id of [external, inline]) {
		tree.remove(id);
		tree.append(tree.root, id);
		tree.setAttribute(id, "src", "/replacement.js");
		tree.setTextContent(id, "replacement");
	}
	await value.scripts.settle();
	for (const id of [external, inline]) {
		tree.remove(id);
		tree.append(tree.root, id);
	}
	await value.scripts.settle();
	expect(value.prepare).toHaveBeenCalledTimes(6);
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"https://example.com/parser.js",
		"https://example.com/dynamic.js",
		"same",
		"same",
	]);
	expect(value.events.filter((event) => event.startsWith("load:"))).toEqual([
		"load:/parser.js",
		"load:parser-copy",
		"load:dynamic",
		"load:dynamic-copy",
		"load:inline",
		"load:inline-copy",
	]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		discovered: 6,
		executed: 4,
		skipped: 2,
		issues: { "module-already-evaluated": 2 },
	});
});

it("releases failed dynamic module preparation and continues the ordered queue", async () => {
	const pending = deferred<HtmlModuleSource>();
	const value = fixture("", {
		prepare: async (request) =>
			request.id.endsWith("/failed.js")
				? pending.promise
				: { id: request.id, source: request.source ?? "good" },
	});
	const tree = await value.loading;
	const failed = insertModule(
		tree,
		{ src: "/failed.js", id: "failed" },
		"",
		false,
	);
	insertModule(tree, { id: "good" }, "good", false);
	expect(value.requests).toHaveLength(2);
	pending.reject(
		new AgentBrowserError("policy-denied", "Registry rejected entry"),
	);
	await value.scripts.settle();
	tree.remove(failed);
	tree.append(tree.root, failed);
	insertModule(tree, { id: "later" }, "later");
	await value.scripts.settle();
	expect(value.prepare).toHaveBeenCalledTimes(3);
	expect(value.seen.map((entry) => entry.source)).toEqual(["good", "later"]);
	expect(value.events.filter((event) => /^(load|error):/.test(event))).toEqual([
		"error:failed",
		"load:good",
		"load:later",
	]);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.fetchWithPolicy).not.toHaveBeenCalled();
	expect(documentScriptState(tree)?.report).toMatchObject({
		failed: 1,
		executed: 2,
		halted: false,
		complete: true,
		issues: { "fetch-policy-denied": 1 },
	});
});

it.each([
	{ method: "abort", async: true, reject: false },
	{ method: "close", async: true, reject: true },
	{ method: "abort", async: false, reject: true },
	{ method: "close", async: false, reject: false },
])(
	"cancels post-parse dynamic module preparation and queued work: %j",
	async (options) => {
		const pending = deferred<HtmlModuleSource>();
		const value = fixture("", { prepare: () => pending.promise });
		const tree = await value.loading;
		insertModule(
			tree,
			{ src: "/pending.js", id: "pending" },
			"",
			options.async,
		);
		insertModule(tree, { id: "queued" }, "queued", options.async);
		expect(value.requests).toHaveLength(2);
		const settled = expect(value.scripts.settle()).rejects.toMatchObject({
			code: "aborted",
		});
		if (options.method === "close") tree.close();
		else value.controller.abort();
		await settled;
		expect(value.requests.every((request) => request.signal.aborted)).toBe(
			true,
		);
		if (options.reject)
			pending.reject(new AgentBrowserError("network-error", "Late rejection"));
		else pending.resolve({ id: value.requests[0].id, source: "late" });
		await pending.promise.catch(() => undefined);
		await expect(value.scripts.settle()).rejects.toMatchObject({
			code: "aborted",
		});
		expect(value.seen).toEqual([]);
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual([]);
	},
);

it("does not evaluate dynamic modules when the runner closes during preparation", async () => {
	let closed = false;
	const pending = deferred<HtmlModuleSource>();
	const value = fixture("", {
		closed: () => closed,
		prepare: () => pending.promise,
	});
	const tree = await value.loading;
	insertModule(tree, { src: "/pending.js" });
	expect(value.requests).toHaveLength(1);
	closed = true;
	pending.resolve({ id: value.requests[0].id, source: "late" });
	await value.scripts.settle();
	expect(value.seen).toEqual([]);
	expect(value.events.filter((event) => /^(load|error):/.test(event))).toEqual(
		[],
	);
	expect(documentScriptState(tree)?.report).toMatchObject({
		halted: true,
		skipped: 1,
		issues: { "realm-halted": 1 },
	});
});

it.each([
	{ limits: { maxScripts: 1 }, issue: "script-count-limit" },
	{ limits: { maxExternal: 1 }, issue: "external-count-limit" },
	{ limits: { maxSourceBytes: 3 }, issue: "source-byte-limit" },
])(
	"shares parser and dynamic module resource limits: %j",
	async ({ limits, issue }) => {
		const value = fixture('<script type="module" src="/parser.js"></script>', {
			limits: { modules: true, ...limits },
			prepare: async (request) => ({ id: request.id, source: "é" }),
		});
		const tree = await value.loading;
		insertModule(tree, { src: "/dynamic.js" });
		await value.scripts.settle();
		expect(value.prepare).toHaveBeenCalledTimes(
			issue === "source-byte-limit" ? 2 : 1,
		);
		expect(value.seen.map((entry) => entry.source)).toEqual(["é"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 1,
			skipped: 1,
			sourceBytes: 2,
			halted: true,
			issues: { [issue]: 1 },
		});
	},
);

it.each([
	{ limits: {} },
	{ limits: { modules: false } },
	{ capable: false },
	{ capable: undefined },
	{ provider: false },
])(
	"keeps classic behavior unless both module mode and capability are present: %j",
	async (options) => {
		const value = fixture(
			'<script type="module">module</script><script nomodule>fallback</script><script type="importmap">{}</script>',
			options,
		);
		const tree = await value.loading;
		expect(value.prepare).not.toHaveBeenCalled();
		expect(value.seen.map((entry) => entry.source)).toEqual(["fallback"]);
		expect(value.seen[0].options).not.toHaveProperty("sourceType");
		expect(documentScriptState(tree)?.report).toMatchObject({
			mode: "classic",
			discovered: 3,
			executed: 1,
			skipped: 2,
			issues: { "module-not-supported": 1, "importmap-not-supported": 1 },
		});
	},
);

it.each([null, 0, 1, "true", {}])(
	"rejects non-boolean module mode: %j",
	(modules) => {
		expect(() =>
			fixture("", { limits: { modules: modules as boolean } }),
		).toThrow("Invalid module script mode");
	},
);

it("skips nomodule classics without fetching and keeps import maps unsupported", async () => {
	const value = fixture(
		'<script nomodule src="/fallback.js"></script><script nomodule>fallback</script><script type="module" nomodule id="module">entry</script><script type="importmap" src="/map.json">{}</script>',
	);
	const tree = await value.loading;
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.fetchWithPolicy).not.toHaveBeenCalled();
	expect(value.seen.map((entry) => entry.source)).toEqual(["entry"]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		mode: "classic-and-module",
		external: 0,
		executed: 1,
		skipped: 3,
		issues: { nomodule: 2, "importmap-not-supported": 1 },
	});
});

it("orders deferred modules and classic scripts before DOMContentLoaded despite preparation order", async () => {
	const first = deferred<HtmlModuleSource>();
	const second = deferred<HtmlModuleSource>();
	const firstEvaluation = deferred<ScriptEvaluation>();
	const evaluating = deferred<void>();
	const value = fixture(
		'<script type="module" id="first" src="/first.js"></script><script defer src="/classic.js"></script><script type="module" id="second">second</script><script>blocking</script><p>parsed tail</p>',
		{
			prepare: (request) =>
				request.source === undefined ? first.promise : second.promise,
			async evaluate(source) {
				if (source === "first") {
					evaluating.resolve();
					return firstEvaluation.promise;
				}
				return success;
			},
		},
	);
	await value.interactive;
	expect(value.requests).toHaveLength(2);
	second.resolve({ id: value.requests[1].id, source: "second" });
	first.resolve({ id: value.requests[0].id, source: "first" });
	await evaluating.promise;
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"blocking",
		"first",
	]);
	expect(value.events).not.toContain("DOMContentLoaded");
	firstEvaluation.resolve(success);
	const tree = await value.loading;
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"blocking",
		"first",
		"/classic.js",
		"second",
	]);
	expect(value.seen[0]).toMatchObject({
		state: "loading",
		current: expect.any(Number),
	});
	for (const entry of value.seen.filter(
		(entry) => entry.options.sourceType === "module",
	)) {
		expect(entry).toMatchObject({ state: "interactive", current: null });
		expect(entry.text).toContain("parsed tail");
	}
	expect(value.events).toEqual([
		"state:interactive",
		"load:first",
		"load:/classic.js",
		"load:second",
		"DOMContentLoaded",
		"state:complete",
		"window-load",
	]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		executed: 4,
		complete: true,
	});
});

it("lets an async module pass a pending deferred entry", async () => {
	const blocked = deferred<HtmlModuleSource>();
	const asynchronous = deferred<HtmlModuleSource>();
	const evaluated = deferred<void>();
	const value = fixture(
		'<script type="module" src="/deferred.js"></script><script type="module" async defer id="async">asynchronous</script>',
		{
			prepare: (request) =>
				request.source === undefined ? blocked.promise : asynchronous.promise,
			async evaluate(source) {
				if (source === "asynchronous") evaluated.resolve();
				return success;
			},
		},
	);
	await value.interactive;
	asynchronous.resolve({ id: value.requests[1].id, source: "asynchronous" });
	await evaluated.promise;
	expect(value.seen.map((entry) => entry.source)).toEqual(["asynchronous"]);
	expect(value.events).not.toContain("DOMContentLoaded");
	blocked.resolve({ id: value.requests[0].id, source: "deferred" });
	await value.loading;
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"asynchronous",
		"deferred",
	]);
});

it("does not make DOMContentLoaded wait for async preparation but delays window load", async () => {
	const prepared = deferred<HtmlModuleSource>();
	const value = fixture(
		'<script type="module" async id="async" src="/async.js"></script>',
		{
			prepare: () => prepared.promise,
		},
	);
	await value.domReady;
	expect(value.seen).toEqual([]);
	expect(value.events).not.toContain("window-load");
	prepared.resolve({ id: value.requests[0].id, source: "async" });
	await value.loading;
	expect(value.events).toEqual([
		"state:interactive",
		"DOMContentLoaded",
		"load:async",
		"state:complete",
		"window-load",
	]);
});

it("captures module attributes, inline identities and document bases without legacy fetching", async () => {
	const value = fixture(
		'<base href="https://EXAMPLE.com:443/before/"><script type="module" id="empty" integrity="ignored"></script><script type="module" crossorigin="USE-CREDENTIALS" integrity="also-ignored">inline</script><script type="module" src="../entry.js#first" integrity="sha256-forwarded" crossorigin="USE-CREDENTIALS" charset="windows-1252"></script><script>change-base</script><script type="module" src="next.js#second" crossorigin="invalid"></script>',
		{
			async evaluate(source, tree) {
				if (source === "change-base")
					for (const { node } of tree.walk())
						if (node.tagName === "base")
							tree.setAttribute(node.id, "href", "/after/");
				return success;
			},
		},
	);
	await value.loading;
	expect(value.requests).toHaveLength(4);
	for (const request of value.requests.slice(0, 2)) {
		expect(request.id).toMatch(/^urn:agent-browser:html-module:[1-9]\d*$/);
		expect(request).toMatchObject({
			baseUrl: "https://example.com/before/",
		});
		expect(request).not.toHaveProperty("integrity");
	}
	expect(value.requests[0].credentials).toBe("same-origin");
	expect(value.requests[1].credentials).toBe("include");
	expect(value.requests[0].source).toBe("");
	expect(value.requests[1].source).toBe("inline");
	expect(value.requests[0].id).not.toBe(value.requests[1].id);
	expect(value.requests[2]).toMatchObject({
		id: "https://example.com/entry.js#first",
		baseUrl: "https://example.com/before/",
		credentials: "include",
		integrity: "sha256-forwarded",
	});
	expect(value.requests[3]).toMatchObject({
		id: "https://example.com/after/next.js#second",
		baseUrl: "https://example.com/after/",
		credentials: "same-origin",
	});
	for (const request of value.requests.slice(2))
		expect(request).not.toHaveProperty("source");
	expect(
		value.requests.every(
			(request) => request.signal === value.requests[0].signal,
		),
	).toBe(true);
	expect(value.requests[0].signal.aborted).toBe(false);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.fetchWithPolicy).not.toHaveBeenCalled();
});

it("uses the prepared registry identity when evaluating redirected entries", async () => {
	const value = fixture(
		'<script type="module" src="/redirect.js#entry"></script>',
		{
			prepare: async () => ({
				id: "https://example.com/final/entry.js#entry",
				source: "prepared",
			}),
		},
	);
	await value.loading;
	expect(value.requests[0]).toMatchObject({
		id: "https://example.com/redirect.js#entry",
		baseUrl: "https://example.com/page",
	});
	expect(value.seen[0].options).toMatchObject({
		filename: "https://example.com/final/entry.js#entry",
		sourceType: "module",
		discardResult: true,
	});
});

it("keeps module currentScript null and denies document.write, including written entries", async () => {
	const value = fixture(
		'<script>writer</script><script type="module" async>async</script><script type="module">deferred</script>',
		{
			async evaluate(source, tree, options) {
				if (source === "writer") {
					expect(documentScriptState(tree)?.currentScript).toEqual(
						expect.any(Number),
					);
					writeDocument(
						tree,
						'<script type="module" id="written">written</script><b>inserted</b>',
					);
				} else {
					expect(options.sourceType).toBe("module");
					expect(documentScriptState(tree)?.currentScript).toBeNull();
					expect(() => writeDocument(tree, "forbidden")).toThrow();
				}
				return success;
			},
		},
	);
	const tree = await value.loading;
	expect(value.seen.map((entry) => entry.source).sort()).toEqual([
		"async",
		"deferred",
		"writer",
		"written",
	]);
	expect(documentScriptState(tree)?.currentScript).toBeNull();
	expect(tree.textContent(tree.root)).toContain("inserted");
	expect(tree.textContent(tree.root)).not.toContain("forbidden");
});

it("evaluates duplicate external entries once while keeping inline and fragment identities distinct", async () => {
	const value = fixture(
		'<script type="module" id="one" src="/entry.js#one"></script><script type="module" id="duplicate" src="https://EXAMPLE.com:443/entry.js#one"></script><script type="module" id="fragment" src="/entry.js#two"></script><script type="module" id="inline-one">same</script><script type="module" id="inline-two">same</script>',
	);
	const tree = await value.loading;
	expect(value.seen).toHaveLength(4);
	expect(value.seen.map((entry) => entry.options.filename)).toEqual([
		"https://example.com/entry.js#one",
		"https://example.com/entry.js#two",
		value.requests[3].id,
		value.requests[4].id,
	]);
	expect(value.events.filter((event) => event.startsWith("load:"))).toEqual([
		"load:one",
		"load:duplicate",
		"load:fragment",
		"load:inline-one",
		"load:inline-two",
	]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		discovered: 5,
		executed: 4,
		skipped: 1,
		external: 3,
		sourceBytes: value.seen.reduce(
			(total, entry) => total + new TextEncoder().encode(entry.source).length,
			0,
		),
		issues: { "module-already-evaluated": 1 },
	});
});

it("deduplicates an async entry that evaluates before its deferred duplicate", async () => {
	const deferredSource = deferred<HtmlModuleSource>();
	const asyncSource = deferred<HtmlModuleSource>();
	const evaluated = deferred<void>();
	let preparations = 0;
	const value = fixture(
		'<script type="module" id="deferred" src="/same.js"></script><script type="module" async id="async" src="/same.js"></script>',
		{
			prepare: () =>
				++preparations === 1 ? deferredSource.promise : asyncSource.promise,
			async evaluate() {
				evaluated.resolve();
				return success;
			},
		},
	);
	await value.interactive;
	asyncSource.resolve({ id: value.requests[1].id, source: "same" });
	await evaluated.promise;
	deferredSource.resolve({ id: value.requests[0].id, source: "same" });
	await value.loading;
	expect(value.seen).toHaveLength(1);
	expect(value.events.filter((event) => event.startsWith("load:"))).toEqual([
		"load:async",
		"load:deferred",
	]);
});

it.each(["result", "throw"])(
	"preserves failed entry state and dispatches per-element errors after evaluation %s",
	async (failure) => {
		const value = fixture(
			'<script type="module" id="failed" src="/failed.js"></script><script type="module" id="duplicate" src="/failed.js"></script><script type="module" id="good">good</script>',
			{
				async evaluate(source) {
					if (source.endsWith("/failed.js")) {
						if (failure === "throw")
							throw new AgentBrowserError(
								"unsupported",
								"module evaluation failed",
							);
						return { ...success, ok: false, error: { code: "script-error" } };
					}
					return success;
				},
			},
		);
		const tree = await value.loading;
		expect(value.seen.map((entry) => entry.source)).toEqual([
			"https://example.com/failed.js",
			"good",
		]);
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual(["error:failed", "error:duplicate", "load:good"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			failed: 2,
			executed: 1,
			halted: false,
			complete: true,
			issues: {
				[failure === "throw"
					? "execution-unsupported"
					: "execution-script-error"]: 2,
			},
		});
	},
);

it("reports module preparation failures without load events or legacy fallback", async () => {
	const value = fixture(
		'<script type="module" id="external" src="/bad.js"></script><script type="module" id="inline">bad</script><script type="module" id="good">good</script>',
		{
			async prepare(request) {
				if (request.source !== "good")
					throw new AgentBrowserError(
						"policy-denied",
						"registry rejected entry",
					);
				return { id: request.id, source: request.source };
			},
		},
	);
	const tree = await value.loading;
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.fetchWithPolicy).not.toHaveBeenCalled();
	expect(value.seen.map((entry) => entry.source)).toEqual(["good"]);
	expect(value.events.filter((event) => /^(load|error):/.test(event))).toEqual([
		"error:external",
		"error:inline",
		"load:good",
	]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		failed: 2,
		executed: 1,
		halted: false,
		issues: { "fetch-policy-denied": 2 },
	});
});

it("still prepares duplicate elements with their own external integrity metadata", async () => {
	const value = fixture(
		'<script type="module" id="first" src="/same.js" integrity="accepted"></script><script type="module" id="second" src="/same.js" integrity="rejected"></script>',
		{
			async prepare(request) {
				if (request.integrity === "rejected")
					throw new AgentBrowserError("policy-denied", "Integrity mismatch");
				return { id: request.id, source: "entry" };
			},
		},
	);
	const tree = await value.loading;
	expect(value.prepare).toHaveBeenCalledTimes(2);
	expect(value.requests.map((request) => request.integrity)).toEqual([
		"accepted",
		"rejected",
	]);
	expect(
		value.requests.every((request) => request.credentials === "same-origin"),
	).toBe(true);
	expect(value.seen).toHaveLength(1);
	expect(value.events.filter((event) => /^(load|error):/.test(event))).toEqual([
		"load:first",
		"error:second",
	]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		executed: 1,
		failed: 1,
	});
});

it.each([
	"",
	"data:text/javascript,entry",
	"https://user:password@example.com/entry.js",
])(
	"rejects invalid external module URLs before preparation: %s",
	async (url) => {
		const value = fixture(
			`<script type="module" id="bad" src="${url}"></script>`,
		);
		const tree = await value.loading;
		expect(value.prepare).not.toHaveBeenCalled();
		expect(value.seen).toEqual([]);
		expect(value.events).toContain("error:bad");
		expect(documentScriptState(tree)?.report).toMatchObject({
			failed: 1,
			executed: 0,
		});
	},
);

it.each(["abort", "close"])(
	"cancels pending module preparation on %s even if the runner ignores the signal",
	async (method) => {
		const pending = deferred<HtmlModuleSource>();
		const value = fixture(
			'<script type="module" id="pending" src="/pending.js"></script>',
			{
				prepare: () => pending.promise,
			},
		);
		const tree = await value.created;
		await value.interactive;
		if (method === "close") tree.close();
		else value.controller.abort();
		await expect(value.loading).rejects.toMatchObject({
			code: method === "close" ? "closed" : "aborted",
		});
		expect(value.requests[0].signal.aborted).toBe(true);
		pending.resolve({ id: value.requests[0].id, source: "late" });
		await pending.promise;
		expect(value.seen).toEqual([]);
		expect(value.events).not.toContain("load:pending");
		expect(value.events).not.toContain("DOMContentLoaded");
		expect(documentScriptState(tree)).toBeUndefined();
	},
);

it("cancels pending module evaluation without publishing success or reviving a closed tree", async () => {
	const pending = deferred<ScriptEvaluation>();
	const entered = deferred<void>();
	const value = fixture('<script type="module" id="pending">pending</script>', {
		async evaluate() {
			entered.resolve();
			return pending.promise;
		},
	});
	const tree = await value.created;
	await entered.promise;
	value.controller.abort();
	await expect(value.loading).rejects.toMatchObject({ code: "aborted" });
	expect(value.seen[0].options.signal.aborted).toBe(true);
	pending.resolve(success);
	await pending.promise;
	expect(value.events).not.toContain("load:pending");
	expect(value.events).not.toContain("DOMContentLoaded");
	expect(documentScriptState(tree)).toBeUndefined();
});

it("bounds UTF-8 source bytes across classic and module entries", async () => {
	const value = fixture(
		'<script>a</script><script type="module" id="large">éé</script>',
		{
			limits: { modules: true, maxSourceBytes: 4 },
		},
	);
	const tree = await value.loading;
	expect(value.seen.map((entry) => entry.source)).toEqual(["a"]);
	expect(value.events).not.toContain("load:large");
	expect(documentScriptState(tree)?.report).toMatchObject({
		executed: 1,
		sourceBytes: 1,
		halted: true,
		issues: { "source-byte-limit": 1 },
	});
});

it.each([
	{ maxScripts: 1, issue: "script-count-limit" },
	{ maxExternal: 1, issue: "external-count-limit" },
])(
	"bounds module admission before preparing excessive entries: %j",
	async ({ issue, ...limits }) => {
		const value = fixture(
			'<script type="module" src="/one.js"></script><script type="module" src="/two.js"></script>',
			{ limits: { modules: true, ...limits } },
		);
		const tree = await value.loading;
		expect(value.prepare).toHaveBeenCalledTimes(1);
		expect(value.seen).toEqual([]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			halted: true,
			issues: { [issue]: 1 },
		});
	},
);

it("checks prepared external source bytes before evaluation", async () => {
	const value = fixture('<script type="module" src="/large.js"></script>', {
		limits: { modules: true, maxSourceBytes: 3 },
		prepare: async (request) => ({ id: request.id, source: "éé" }),
	});
	const tree = await value.loading;
	expect(value.seen).toEqual([]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		sourceBytes: 0,
		halted: true,
		issues: { "source-byte-limit": 1 },
	});
});

it.each([
	{ dynamic: false, external: false },
	{ dynamic: false, external: true },
	{ dynamic: true, external: false },
	{ dynamic: true, external: true },
])(
	"carries the exact nonce module admission through preparation and evaluation: %j",
	async ({ dynamic, external }) => {
		let captured: DocumentScriptAdmission | undefined;
		const value = fixture(
			dynamic
				? ""
				: `<script type="module" id="entry" nonce="native"${external ? ' src="/entry.js"' : ""}>entry</script>`,
			{
				headers: { "content-security-policy": ["script-src 'nonce-native'"] },
				async prepare(request) {
					const tree = await value.created;
					captured = request.admission;
					expect(
						captured &&
							documentScriptCsp(tree)?.allowsRequest(
								captured,
								"https://example.com/entry.js",
								0,
							),
					).toBe(true);
					for (const { node } of tree.walk())
						if (node.attributes.id === "entry")
							tree.setAttribute(node.id, "nonce", "changed");
					return { id: request.id, source: "entry" };
				},
				async evaluate(_source, tree) {
					expect(value.requests[0].admission).toBe(captured);
					expect(
						captured &&
							documentScriptCsp(tree)?.allowsRequest(
								captured,
								"https://example.com/entry.js",
								0,
							),
					).toBe(true);
					return success;
				},
			},
		);
		const tree = await value.loading;
		if (dynamic) {
			insertModule(
				tree,
				{
					id: "entry",
					nonce: "native",
					...(external ? { src: "/entry.js" } : {}),
				},
				external ? "" : "entry",
			);
			await value.scripts.settle();
		}
		expect(value.prepare).toHaveBeenCalledTimes(1);
		expect(captured).toBeDefined();
		expect(value.seen.map((entry) => entry.source)).toEqual(["entry"]);
		expect(value.seen[0].options.sourceType).toBe("module");
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual(["load:entry"]);
		expect(value.fetch).not.toHaveBeenCalled();
		expect(value.fetchWithPolicy).not.toHaveBeenCalled();
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 1,
			failed: 0,
			skipped: 0,
		});
	},
);

it.each([
	{ dynamic: false, external: false },
	{ dynamic: false, external: true },
	{ dynamic: true, external: false },
	{ dynamic: true, external: true },
])(
	"blocks wrong-nonce modules before preparation: %j",
	async ({ dynamic, external }) => {
		const value = fixture(
			dynamic
				? ""
				: `<script type="module" nonce="wrong"${external ? ' src="/entry.js"' : ""}>entry</script>`,
			{ headers: { "content-security-policy": ["script-src 'nonce-native'"] } },
		);
		const tree = await value.loading;
		if (dynamic) {
			insertModule(
				tree,
				{ nonce: "wrong", ...(external ? { src: "/entry.js" } : {}) },
				external ? "" : "entry",
			);
			await value.scripts.settle();
		}
		expect(value.prepare).not.toHaveBeenCalled();
		expect(value.seen).toEqual([]);
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual([]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 0,
			skipped: 1,
			issues: { "csp-not-supported": 1 },
		});
	},
);

it.each([false, true])(
	"blocks a prepared dynamic module after CSP invalidation (external=%s)",
	async (external) => {
		const value = fixture('<script nonce="native">bootstrap</script>', {
			headers: { "content-security-policy": ["script-src 'nonce-native'"] },
			async evaluate(source, tree) {
				if (source === "bootstrap") {
					insertModule(
						tree,
						{
							id: "entry",
							nonce: "native",
							...(external ? { src: "/entry.js" } : {}),
						},
						external ? "" : "entry",
					);
					expect(value.prepare).toHaveBeenCalledTimes(1);
					await value.prepare.mock.results[0].value;
					expect(value.requests[0].admission).toBeDefined();
					expect(value.seen.map((entry) => entry.source)).toEqual([
						"bootstrap",
					]);
					documentScriptCsp(tree)?.close();
				}
				return success;
			},
		});
		const tree = await value.loading;
		expect(
			value.requests[0].admission?.allows("https://example.com/entry.js", 0),
		).toBe(false);
		expect(value.seen.map((entry) => entry.source)).toEqual(["bootstrap"]);
		expect(
			value.events.filter((event) => /^(load|error):/.test(event)),
		).toEqual([]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 1,
			failed: 0,
			skipped: 1,
			issues: { "csp-not-supported": 1 },
		});
	},
);

it("rechecks the captured module admission against the prepared external URL", async () => {
	const value = fixture("", {
		headers: {
			"content-security-policy": ["script-src https://example.com/allowed/"],
		},
		prepare: async () => ({
			id: "https://other.example/entry.js",
			source: "blocked",
		}),
	});
	const tree = await value.loading;
	insertModule(tree, { src: "/allowed/entry.js" });
	await value.scripts.settle();
	expect(value.prepare).toHaveBeenCalledTimes(1);
	expect(documentScriptCsp(tree)?.unsupported).toBe(false);
	expect(value.seen).toEqual([]);
	expect(value.events.filter((event) => /^(load|error):/.test(event))).toEqual(
		[],
	);
	expect(documentScriptState(tree)?.report).toMatchObject({
		executed: 0,
		skipped: 1,
		issues: { "csp-not-supported": 1 },
	});
});

it("preserves CSP rejection before module preparation", async () => {
	const value = fixture('<script type="module">blocked</script>', {
		headers: { "content-security-policy": ["script-src 'none'"] },
	});
	const tree = await value.loading;
	expect(value.prepare).not.toHaveBeenCalled();
	expect(value.seen).toEqual([]);
	expect(documentScriptState(tree)?.report).toMatchObject({
		skipped: 1,
		issues: { "csp-not-supported": 1 },
	});
});

it("halts remaining module evaluation when the runner closes", async () => {
	let closed = false;
	const value = fixture(
		'<script type="module">first</script><script type="module">second</script>',
		{
			closed: () => closed,
			async evaluate() {
				closed = true;
				return { ...success, ok: false, error: { code: "script-error" } };
			},
		},
	);
	const tree = await value.loading;
	expect(value.seen).toHaveLength(1);
	expect(documentScriptState(tree)?.report).toMatchObject({
		failed: 1,
		halted: true,
		skipped: 1,
	});
});
