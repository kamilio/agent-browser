import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptState } from "./document-script-state.js";
import { writeDocument } from "./document-write.js";
import type { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import { ScriptLoader } from "./script-loader.js";
import {
	cloneScriptElementState,
	initializeScriptElement,
	scriptElementAsync,
	scriptElementState,
	setScriptElementAsync,
} from "./script-element-state.js";
import { setInnerHtml } from "./html-content.js";

const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};

function response(
	source: string,
	type = "text/javascript",
	url = "https://example.com/page",
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

function gate<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function insert(
	tree: DocumentTree,
	attributes: Record<string, string> = {},
	text = "",
	parent = tree.root,
) {
	const id = tree.createElement("script", attributes);
	initializeScriptElement(tree, id, "dynamic");
	if (text) tree.setTextContent(id, text);
	tree.append(parent, id);
	return id;
}

async function fixture(
	options: Partial<ConstructorParameters<typeof ScriptLoader>[0]> & {
		html?: string;
		evaluate?: (
			source: string,
			tree: DocumentTree,
		) => Promise<ScriptEvaluation>;
	} = {},
) {
	const input =
		options.response ?? response(options.html ?? "<body>", "text/html");
	const controller = new AbortController();
	const seen: string[] = [];
	const events: string[] = [];
	const fetch = vi.fn(
		options.fetch ??
			(async (url: string) =>
				response(new URL(url).pathname, "text/javascript", url)),
	);
	let active = false;
	const scripts = new ScriptLoader({
		...options,
		response: input,
		signal: options.signal ?? controller.signal,
		fetch,
		owner(tree) {
			documents.push(tree);
			const dispatcher = documentInteractions(tree).events;
			dispatcher.addEventListener(tree.root, "DOMContentLoaded", () => {
				events.push("DOMContentLoaded");
			});
			dispatcher.addEventListener(
				dispatcher.windowTarget as number,
				"load",
				() => {
					events.push("window-load");
				},
			);
			return {
				closed: false,
				evaluate: async (source: string) => {
					expect(active).toBe(false);
					active = true;
					seen.push(source);
					try {
						return options.evaluate
							? await options.evaluate(source, tree)
							: success;
					} finally {
						active = false;
					}
				},
			};
		},
	});
	const tree = await loadBrowserDocument(input, {
		scripts,
		signal: options.signal ?? controller.signal,
		tabId: "dynamic-fixture",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100_000,
			maxChanges: 100,
		},
	});
	return { tree, scripts, seen, events, fetch, controller };
}

it("loads post-parse scripts using insertion-time URL and nonce with currentScript during execution only", async () => {
	const evaluation = gate<ScriptEvaluation>();
	const entered = gate<void>();
	let id = 0;
	const value = await fixture({
		html: '<base href="/before/"><body>',
		async evaluate(source, tree) {
			expect(source).toBe("/before/child.js");
			expect(documentScriptState(tree)?.currentScript).toBe(id);
			expect(tree.get(id).attributes.nonce).toBe("kept-nonce");
			entered.resolve();
			return evaluation.promise;
		},
	});
	id = insert(value.tree, { src: "child.js", nonce: "kept-nonce" });
	value.tree.setAttribute(id, "src", "/replacement.js");
	const events: string[] = [];
	documentInteractions(value.tree).events.addEventListener(id, "load", () => {
		expect(documentScriptState(value.tree)?.currentScript).toBeNull();
		events.push("load");
	});
	await entered.promise;
	expect(events).toEqual([]);
	evaluation.resolve(success);
	await value.scripts.settle();
	expect(value.fetch).toHaveBeenCalledExactlyOnceWith(
		"https://example.com/before/child.js",
	);
	expect(events).toEqual(["load"]);
	expect(documentScriptState(value.tree)?.report).toMatchObject({
		executed: 1,
		external: 1,
		complete: true,
	});
});

it("queues insertion during evaluation without reentering the runner or inheriting document.write", async () => {
	const order: string[] = [];
	const value = await fixture({
		html: "<body><script>outer</script><script>parser</script>",
		async evaluate(source, tree) {
			order.push(source);
			if (source === "outer") {
				insert(tree, {}, "inline-child");
				insert(tree, { src: "/external.js" });
				await Promise.resolve();
				expect(order).toEqual(["outer"]);
				order.push("outer-done");
			} else if (source.includes("child") || source.includes("external")) {
				expect(() => writeDocument(tree, "forbidden")).toThrow(/outside/);
			}
			return success;
		},
	});
	expect(order.slice(0, 3)).toEqual(["outer", "outer-done", "inline-child"]);
	expect(value.seen).toEqual(
		expect.arrayContaining(["outer", "inline-child", "/external.js", "parser"]),
	);
	expect(documentScriptState(value.tree)?.report?.executed).toBe(4);
});

it("keeps parser and written scripts owned once across moves and attribute edits", async () => {
	const value = await fixture({
		html: '<body><script id="empty"></script><script>outer</script><script defer src="/defer.js"></script><script async src="/async.js"></script>',
		async evaluate(source, tree) {
			if (source === "outer")
				writeDocument(tree, '<script src="/written.js"></script>');
			return success;
		},
	});
	for (const { node } of [...value.tree.walk()]) {
		if (node.tagName !== "script") continue;
		value.tree.remove(node.id);
		value.tree.append(value.tree.root, node.id);
		value.tree.setAttribute(node.id, "src", "/repeat.js");
	}
	await value.scripts.settle();
	expect(value.seen).toHaveLength(4);
	expect(value.seen).toEqual(
		expect.arrayContaining(["outer", "/written.js", "/defer.js", "/async.js"]),
	);
	expect(value.fetch).not.toHaveBeenCalledWith("https://example.com/repeat.js");
	expect(documentScriptState(value.tree)?.report?.discovered).toBe(5);
});

it("waits for connected content, handles fragment subtrees, and never reruns started nodes", async () => {
	const value = await fixture();
	const fragment = value.tree.createFragment();
	const parent = value.tree.createElement("div");
	value.tree.append(fragment, parent);
	const external = insert(value.tree, { src: "/detached.js" }, "", parent);
	const inline = insert(value.tree, {}, "detached-inline", parent);
	await Promise.resolve();
	expect(value.fetch).not.toHaveBeenCalled();
	value.tree.append(value.tree.root, fragment);
	value.tree.remove(parent);
	value.tree.append(value.tree.root, parent);
	value.tree.setTextContent(inline, "replacement");
	value.tree.setAttribute(external, "src", "/replacement.js");
	await value.scripts.settle();
	expect(value.seen.sort()).toEqual(["/detached.js", "detached-inline"]);
	expect(value.fetch).toHaveBeenCalledTimes(1);
	expect(value.tree.mutationMetrics().collectorFailures).toBe(0);
});

it("starts an empty connected script when src or inline text arrives", async () => {
	const value = await fixture();
	const external = insert(value.tree);
	const inline = insert(value.tree);
	value.tree.setAttribute(external, "src", "/late.js");
	value.tree.setTextContent(inline, "late-inline");
	await value.scripts.settle();
	expect(value.seen.sort()).toEqual(["/late.js", "late-inline"]);
});

it("runs default dynamic external scripts in readiness order and ignores defer", async () => {
	const slow = gate<NetworkResponse>();
	const fastRan = gate<void>();
	const value = await fixture({
		fetch: async (url) =>
			url.endsWith("slow.js")
				? slow.promise
				: response("fast", "text/javascript", url),
		async evaluate(source) {
			if (source === "fast") fastRan.resolve();
			return success;
		},
	});
	insert(value.tree, { src: "/slow.js" });
	insert(value.tree, { src: "/fast.js", defer: "" });
	await fastRan.promise;
	expect(value.seen).toEqual(["fast"]);
	slow.resolve(response("slow"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["fast", "slow"]);
});

it("drains scripts inserted by load handlers before the window load event", async () => {
	const order: string[] = [];
	const value = await fixture({
		html: "<script>bootstrap</script>",
		async evaluate(source, tree) {
			order.push(source);
			if (source === "bootstrap") {
				const dispatcher = documentInteractions(tree).events;
				const id = insert(tree, { src: "/first.js" });
				dispatcher.addEventListener(id, "load", () => {
					insert(tree, { src: "/second.js" });
				});
				dispatcher.addEventListener(
					dispatcher.windowTarget as number,
					"load",
					() => {
						order.push("window-load");
					},
				);
			}
			return success;
		},
	});
	expect(order).toEqual([
		"bootstrap",
		"/first.js",
		"/second.js",
		"window-load",
	]);
	expect(value.events).toEqual(["DOMContentLoaded", "window-load"]);
});

it.each([
	["MIME", response("bad", "text/html"), "fetch-unsupported"],
	["HTTP", { ...response("bad"), status: 404 }, "fetch-network-error"],
	[
		"redirect downgrade",
		response("bad", "text/javascript", "http://example.com/bad.js"),
		"fetch-policy-denied",
	],
] as const)(
	"dispatches error, never load or evaluation, for %s failure",
	async (_label, fetched, issue) => {
		const value = await fixture({ fetch: async () => fetched });
		const id = insert(value.tree, { src: "/bad.js" });
		const events: string[] = [];
		for (const name of ["load", "error"])
			documentInteractions(value.tree).events.addEventListener(id, name, () => {
				events.push(name);
			});
		await value.scripts.settle();
		expect(events).toEqual(["error"]);
		expect(value.seen).toEqual([]);
		expect(documentScriptState(value.tree)?.report?.issues[issue]).toBe(1);
	},
);

it.each([false, true])(
	"dispatches execution error after currentScript clears (throw=%s)",
	async (throws) => {
		const value = await fixture({
			async evaluate() {
				if (throws) throw new Error("execution failed");
				return { ...success, ok: false };
			},
		});
		const id = insert(value.tree, { src: "/failure.js" });
		const events: string[] = [];
		for (const name of ["load", "error"])
			documentInteractions(value.tree).events.addEventListener(id, name, () => {
				expect(documentScriptState(value.tree)?.currentScript).toBeNull();
				events.push(name);
			});
		await value.scripts.settle();
		expect(events).toEqual(["error"]);
		expect(documentScriptState(value.tree)?.report).toMatchObject({
			failed: 1,
			executed: 0,
			halted: true,
		});
	},
);

it("uses CORS credentials and validates integrity before evaluating", async () => {
	const fetchWithPolicy = vi.fn(async () => ({
		response: response("bad"),
		type: "cors" as const,
	}));
	const value = await fixture({ fetchWithPolicy });
	const id = insert(value.tree, {
		src: "/integrity.js",
		crossorigin: "use-credentials",
		integrity: `sha256-${"A".repeat(43)}=`,
	});
	const errors: number[] = [];
	documentInteractions(value.tree).events.addEventListener(id, "error", () => {
		errors.push(id);
	});
	await value.scripts.settle();
	expect(fetchWithPolicy).toHaveBeenCalledWith(
		"https://example.com/integrity.js",
		{ mode: "cors", credentials: "include" },
		expect.any(AbortSignal),
	);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.seen).toEqual([]);
	expect(errors).toEqual([id]);
});

it.each([
	[{ maxScripts: 1 }, "script-count-limit"],
	[{ maxExternal: 1 }, "external-count-limit"],
] as const)(
	"shares parser and dynamic count budgets: %s",
	async (limits, issue) => {
		const value = await fixture({
			html: '<script src="/parser.js"></script>',
			limits,
		});
		insert(value.tree, { src: "/over-limit.js" });
		await value.scripts.settle();
		expect(value.fetch).toHaveBeenCalledTimes(1);
		expect(value.seen).toEqual(["/parser.js"]);
		expect(documentScriptState(value.tree)?.report?.issues[issue]).toBe(1);
	},
);

it("shares the UTF-8 source budget with parser scripts", async () => {
	const value = await fixture({
		html: "<script>one</script>",
		limits: { maxSourceBytes: 4 },
	});
	insert(value.tree, {}, "é");
	await value.scripts.settle();
	expect(value.seen).toEqual(["one"]);
	expect(
		documentScriptState(value.tree)?.report?.issues["source-byte-limit"],
	).toBe(1);
});

it("keeps CSP refusal and unsupported modules explicit without fetching", async () => {
	const input = response("<body>", "text/html");
	const value = await fixture({
		response: {
			...input,
			headers: {
				...input.headers,
				"content-security-policy": ["script-src 'nonce-ok'"],
			},
		},
	});
	insert(value.tree, { src: "/blocked.js", nonce: "ok" });
	insert(value.tree, { type: "module", src: "/module.js" });
	await value.scripts.settle();
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.seen).toEqual([]);
	expect(documentScriptState(value.tree)?.report?.issues).toMatchObject({
		"csp-not-supported": 1,
		"module-not-supported": 1,
	});
});

it.each(["close", "abort"] as const)(
	"cancels pending and queued fetches and detaches ownership on %s",
	async (action) => {
		const pending = gate<NetworkResponse>();
		const signals: AbortSignal[] = [];
		const value = await fixture({
			fetchWithPolicy: async (_url, _policy, signal) => {
				signals.push(signal);
				return { response: await pending.promise, type: "cors" };
			},
		});
		for (let index = 0; index < 7; index++)
			insert(value.tree, { src: `/${index}.js`, crossorigin: "anonymous" });
		expect(signals).toHaveLength(4);
		const baseline = value.tree.mutationMetrics().collectors;
		const settling = value.scripts.settle();
		const rejected = expect(settling).rejects.toThrow(/aborted/);
		if (action === "close") value.tree.close();
		else value.controller.abort();
		await rejected;
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		expect(value.tree.mutationMetrics().collectors).toBeLessThan(baseline);
		pending.resolve(response("late"));
		await Promise.resolve();
		await Promise.resolve();
		expect(signals).toHaveLength(4);
		expect(value.seen).toEqual([]);
		if (action === "abort") {
			insert(value.tree, {}, "after-abort");
			expect(documentScriptState(value.tree)?.currentScript).toBeNull();
		}
	},
);

it("keeps four fetch slots and snapshots queued URL, base, charset and integrity", async () => {
	const pending = gate<NetworkResponse>();
	const bytes = new Uint8Array([0xe9]);
	const integrity = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
	const fetchWithPolicy = vi.fn(async (url: string) => {
		if (url.endsWith("queued.js"))
			return {
				type: "cors" as const,
				response: { ...response("", "text/javascript", url), body: bytes },
			};
		return { type: "cors" as const, response: await pending.promise };
	});
	const value = await fixture({
		html: '<base href="/before/">',
		fetchWithPolicy,
	});
	for (let index = 0; index < 4; index++)
		insert(value.tree, { src: `/slot-${index}.js`, crossorigin: "anonymous" });
	const queued = insert(value.tree, {
		src: "queued.js",
		crossorigin: "anonymous",
		charset: "windows-1252",
		integrity,
	});
	const base = [...value.tree.walk()].find(
		({ node }) => node.tagName === "base",
	)?.node.id as number;
	value.tree.setAttribute(base, "href", "/after/");
	value.tree.setAttribute(queued, "src", "changed.js");
	value.tree.setAttribute(queued, "charset", "utf-8");
	value.tree.setAttribute(queued, "crossorigin", "use-credentials");
	value.tree.setAttribute(queued, "integrity", `sha256-${"A".repeat(43)}=`);
	expect(fetchWithPolicy).toHaveBeenCalledTimes(4);
	pending.resolve(response("slot"));
	await value.scripts.settle();
	expect(fetchWithPolicy).toHaveBeenLastCalledWith(
		"https://example.com/before/queued.js",
		{ mode: "cors", credentials: "same-origin" },
		expect.any(AbortSignal),
	);
	expect(value.seen).toHaveLength(5);
	expect(value.seen).toContain("é");
});

it.each([
	["http://example.com/mixed.js", "fetch-policy-denied"],
	["data:text/javascript,forbidden", "fetch-policy-denied"],
	["", "fetch-invalid-input"],
] as const)(
	"rejects an ineligible URL before transport: %s",
	async (src, issue) => {
		const value = await fixture();
		insert(value.tree, { src });
		await value.scripts.settle();
		expect(value.fetch).not.toHaveBeenCalled();
		expect(value.seen).toEqual([]);
		expect(documentScriptState(value.tree)?.report?.issues[issue]).toBe(1);
	},
);

it("refuses integrity without a policy transport rather than falling back", async () => {
	const value = await fixture();
	insert(value.tree, { src: "/unverified.js", integrity: "sha256-invalid" });
	await value.scripts.settle();
	expect(value.fetch).not.toHaveBeenCalled();
	expect(
		documentScriptState(value.tree)?.report?.issues[
			"integrity-or-cors-not-supported"
		],
	).toBe(1);
});

it("rejects opaque CORS responses and oversized source bodies before execution", async () => {
	const opaque = await fixture({
		fetchWithPolicy: async () => ({
			type: "opaque",
			response: response("forbidden"),
		}),
	});
	insert(opaque.tree, { src: "/opaque.js", crossorigin: "anonymous" });
	await opaque.scripts.settle();
	expect(opaque.seen).toEqual([]);
	expect(
		documentScriptState(opaque.tree)?.report?.issues["fetch-policy-denied"],
	).toBe(1);
	const oversized = await fixture({
		limits: { maxSourceBytes: 2 },
		fetch: async () => response("oversized"),
	});
	insert(oversized.tree, { src: "/oversized.js" });
	await oversized.scripts.settle();
	expect(oversized.seen).toEqual([]);
	expect(
		documentScriptState(oversized.tree)?.report?.issues["fetch-resource-limit"],
	).toBe(1);
});

it("does not execute data blocks or foreign scripts and emits no inline load", async () => {
	const value = await fixture();
	const svg = value.tree.createParserElement(
		"script",
		{ src: "/foreign.js" },
		"http://www.w3.org/2000/svg",
	);
	value.tree.append(value.tree.root, svg);
	insert(
		value.tree,
		{ type: "application/json", src: "/data.json" },
		'{"data":true}',
	);
	const inline = insert(value.tree, {}, "inline");
	const loads: number[] = [];
	documentInteractions(value.tree).events.addEventListener(
		inline,
		"load",
		() => {
			loads.push(inline);
		},
	);
	await value.scripts.settle();
	expect(value.seen).toEqual(["inline"]);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(loads).toEqual([]);
});

it("cancels a runner that ignores its signal without publishing late success", async () => {
	const pending = gate<ScriptEvaluation>();
	const entered = gate<void>();
	const value = await fixture({
		async evaluate() {
			entered.resolve();
			return pending.promise;
		},
	});
	const id = insert(value.tree, { src: "/pending.js" });
	const loads: number[] = [];
	documentInteractions(value.tree).events.addEventListener(id, "load", () => {
		loads.push(id);
	});
	await entered.promise;
	const settling = value.scripts.settle();
	const rejected = expect(settling).rejects.toThrow(/aborted/);
	value.controller.abort();
	await rejected;
	expect(documentScriptState(value.tree)?.currentScript).toBeNull();
	pending.resolve(success);
	await Promise.resolve();
	await Promise.resolve();
	expect(loads).toEqual([]);
	expect(documentScriptState(value.tree)?.report?.executed).toBe(0);
});

function ordered(tree: DocumentTree, src: string) {
	const id = tree.createElement("script", { src });
	initializeScriptElement(tree, id, "dynamic");
	setScriptElementAsync(tree, id, false);
	tree.append(tree.root, id);
	return id;
}

async function checkpoint() {
	for (let index = 0; index < 30; index++) await Promise.resolve();
}

it("executes explicit async=false scripts in insertion order despite reversed fetch completion", async () => {
	const first = gate<NetworkResponse>();
	const second = gate<NetworkResponse>();
	const value = await fixture({
		fetch: async (url) =>
			url.endsWith("first.js") ? first.promise : second.promise,
	});
	const firstId = ordered(value.tree, "/first.js");
	const secondId = ordered(value.tree, "/second.js");
	const events: number[] = [];
	for (const id of [firstId, secondId])
		documentInteractions(value.tree).events.addEventListener(id, "load", () => {
			events.push(id);
		});
	expect(value.fetch).toHaveBeenCalledTimes(2);
	second.resolve(response("second"));
	await checkpoint();
	expect(value.seen).toEqual([]);
	expect(events).toEqual([]);
	first.resolve(response("first"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["first", "second"]);
	expect(events).toEqual([firstId, secondId]);
});

it("does not let an unfetched ordered head block default or explicit async scripts", async () => {
	const pending = gate<NetworkResponse>();
	const value = await fixture({
		fetch: async (url) =>
			url.endsWith("slow.js")
				? pending.promise
				: response(new URL(url).pathname),
	});
	ordered(value.tree, "/slow.js");
	ordered(value.tree, "/ordered.js");
	insert(value.tree, { src: "/default.js" });
	const explicit = value.tree.createElement("script", { src: "/true.js" });
	initializeScriptElement(value.tree, explicit, "dynamic");
	setScriptElementAsync(value.tree, explicit, true);
	value.tree.append(value.tree.root, explicit);
	await checkpoint();
	expect(value.seen).toEqual(["/default.js", "/true.js"]);
	pending.resolve(response("slow"));
	await value.scripts.settle();
	expect(value.seen).toEqual([
		"/default.js",
		"/true.js",
		"slow",
		"/ordered.js",
	]);
});

it.each(["head", "tail"] as const)(
	"keeps fetch-error events in ordered position for a failed %s",
	async (failed) => {
		const pending = gate<NetworkResponse>();
		const outcome: string[] = [];
		const value = await fixture({
			fetch: async (url) =>
				url.endsWith("first.js")
					? pending.promise
					: failed === "tail"
						? { ...response("bad"), status: 404 }
						: response("second"),
			async evaluate(source) {
				outcome.push(source);
				return success;
			},
		});
		const first = ordered(value.tree, "/first.js");
		const second = ordered(value.tree, "/second.js");
		for (const [id, label] of [
			[first, "first"],
			[second, "second"],
		] as const)
			for (const event of ["load", "error"])
				documentInteractions(value.tree).events.addEventListener(
					id,
					event,
					() => {
						outcome.push(`${label}:${event}`);
					},
				);
		await checkpoint();
		expect(outcome).toEqual([]);
		pending.resolve(
			failed === "head"
				? { ...response("bad"), status: 500 }
				: response("first"),
		);
		await value.scripts.settle();
		expect(outcome).toEqual(
			failed === "head"
				? ["first:error", "second", "second:load"]
				: ["first", "first:load", "second:error"],
		);
	},
);

it("freezes async mode at preparation, not at fetch completion", async () => {
	const pending = gate<NetworkResponse>();
	const value = await fixture({
		fetch: async (url) =>
			url.endsWith("head.js")
				? pending.promise
				: response(new URL(url).pathname),
	});
	const head = ordered(value.tree, "/head.js");
	const tail = ordered(value.tree, "/tail.js");
	setScriptElementAsync(value.tree, head, true);
	setScriptElementAsync(value.tree, tail, true);
	const independent = insert(value.tree, { src: "/independent.js" });
	setScriptElementAsync(value.tree, independent, false);
	await checkpoint();
	expect(value.seen).toEqual(["/independent.js"]);
	expect(scriptElementAsync(value.tree, tail)).toBe(true);
	expect(scriptElementAsync(value.tree, independent)).toBe(false);
	pending.resolve(response("head"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["/independent.js", "head", "/tail.js"]);
	value.tree.remove(tail);
	setScriptElementAsync(value.tree, tail, false);
	value.tree.append(value.tree.root, tail);
	await value.scripts.settle();
	expect(value.seen).toHaveLength(3);
	expect(scriptElementState(value.tree, tail).alreadyStarted).toBe(true);
});

it("honors toggles made before preparation and does not order dynamic inline scripts behind fetches", async () => {
	const pending = gate<NetworkResponse>();
	const value = await fixture({ fetch: async () => pending.promise });
	const head = value.tree.createElement("script", { src: "/head.js" });
	initializeScriptElement(value.tree, head, "dynamic");
	setScriptElementAsync(value.tree, head, true);
	setScriptElementAsync(value.tree, head, false);
	value.tree.append(value.tree.root, head);
	const inline = value.tree.createElement("script");
	initializeScriptElement(value.tree, inline, "dynamic");
	setScriptElementAsync(value.tree, inline, false);
	value.tree.setTextContent(inline, "inline");
	value.tree.append(value.tree.root, inline);
	await checkpoint();
	expect(value.seen).toEqual(["inline"]);
	pending.resolve(response("external"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["inline", "external"]);
});

it.each(["close", "abort"] as const)(
	"cancels the ordered queue and waiting fetches on %s",
	async (action) => {
		const pending = gate<NetworkResponse>();
		const value = await fixture({ fetch: async () => pending.promise });
		for (let index = 0; index < 7; index++) ordered(value.tree, `/${index}.js`);
		expect(value.fetch).toHaveBeenCalledTimes(4);
		const settled = expect(value.scripts.settle()).rejects.toThrow(/aborted/);
		if (action === "close") value.tree.close();
		else value.controller.abort();
		await settled;
		pending.resolve(response("late"));
		await checkpoint();
		expect(value.seen).toEqual([]);
		expect(value.fetch).toHaveBeenCalledTimes(4);
	},
);

it("registers parser defaults and preserves written/parser ordering alongside ordered insertion", async () => {
	const value = await fixture({
		html: '<script>outer</script><script defer src="/defer.js"></script>',
		async evaluate(source, tree) {
			const current = documentScriptState(tree)?.currentScript as number;
			if (
				source === "outer" ||
				source === "/written.js" ||
				source === "/defer.js"
			) {
				expect(scriptElementState(tree, current).origin).toBe("parser");
				expect(scriptElementAsync(tree, current)).toBe(false);
			}
			if (source === "outer") {
				ordered(tree, "/dynamic.js");
				writeDocument(tree, '<script src="/written.js"></script>');
			}
			return success;
		},
	});
	expect(value.seen).toHaveLength(4);
	expect(value.seen.indexOf("/written.js")).toBeLessThan(
		value.seen.indexOf("/defer.js"),
	);
	expect(documentScriptState(value.tree)?.report).toMatchObject({
		executed: 4,
		failed: 0,
	});
});

it("refuses unknown and inert fragment scripts and clones of already-started scripts", async () => {
	const value = await fixture();
	const parent = value.tree.createElement("div");
	value.tree.append(value.tree.root, parent);
	setInnerHtml(value.tree, parent, '<script src="/fragment.js"></script>');
	const unknown = value.tree.createElement("script", { src: "/unknown.js" });
	value.tree.append(value.tree.root, unknown);
	const inert = value.tree.createElement("script", { src: "/inert.js" });
	initializeScriptElement(value.tree, inert, "inert");
	value.tree.append(value.tree.root, inert);
	const original = ordered(value.tree, "/original.js");
	await value.scripts.settle();
	const clone = value.tree.clone(original, true);
	cloneScriptElementState(value.tree, original, value.tree, clone);
	value.tree.append(value.tree.root, clone);
	await value.scripts.settle();
	expect(value.seen).toEqual(["/original.js"]);
	expect(value.fetch).toHaveBeenCalledTimes(1);
	expect(documentScriptState(value.tree)?.report?.issues).toMatchObject({
		"unknown-script-origin": 2,
		"inert-script": 1,
	});
});

it("honors false-to-true before insertion as completion-ordered async loading", async () => {
	const pending = gate<NetworkResponse>();
	const value = await fixture({
		fetch: async (url) =>
			url.endsWith("slow.js") ? pending.promise : response("fast"),
	});
	for (const src of ["/slow.js", "/fast.js"]) {
		const id = value.tree.createElement("script", { src });
		initializeScriptElement(value.tree, id, "dynamic");
		setScriptElementAsync(value.tree, id, false);
		setScriptElementAsync(value.tree, id, true);
		value.tree.append(value.tree.root, id);
	}
	await checkpoint();
	expect(value.seen).toEqual(["fast"]);
	pending.resolve(response("slow"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["fast", "slow"]);
});

it("reports ordered execution failure before halting subsequent ordered evaluation", async () => {
	const value = await fixture({
		async evaluate() {
			return { ...success, ok: false };
		},
	});
	const first = ordered(value.tree, "/first.js");
	const second = ordered(value.tree, "/second.js");
	const events: string[] = [];
	for (const [id, label] of [
		[first, "first"],
		[second, "second"],
	] as const)
		for (const event of ["load", "error"])
			documentInteractions(value.tree).events.addEventListener(
				id,
				event,
				() => {
					events.push(`${label}:${event}`);
				},
			);
	await value.scripts.settle();
	expect(value.seen).toEqual(["/first.js"]);
	expect(events).toEqual(["first:error"]);
	expect(documentScriptState(value.tree)?.report).toMatchObject({
		executed: 0,
		failed: 1,
		halted: true,
	});
});

it("retains insertion order when ordered load handlers append more ordered scripts", async () => {
	const value = await fixture();
	const first = ordered(value.tree, "/first.js");
	ordered(value.tree, "/second.js");
	documentInteractions(value.tree).events.addEventListener(
		first,
		"load",
		() => {
			ordered(value.tree, "/third.js");
		},
	);
	await value.scripts.settle();
	expect(value.seen).toEqual(["/first.js", "/second.js", "/third.js"]);
});

it("freezes ordering before invoking a synchronous transport provider", async () => {
	const first = gate<NetworkResponse>();
	const value = await fixture({
		fetch: async (url) => {
			if (url.endsWith("first.js")) return first.promise;
			const active = [...tree.walk()].find(
				({ node }) => node.attributes.src === "/second.js",
			)?.node.id as number;
			setScriptElementAsync(tree, active, true);
			return response("second");
		},
	});
	const tree = value.tree;
	ordered(tree, "/first.js");
	ordered(tree, "/second.js");
	await checkpoint();
	expect(value.seen).toEqual([]);
	first.resolve(response("first"));
	await value.scripts.settle();
	expect(value.seen).toEqual(["first", "second"]);
});
