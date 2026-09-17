import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptState } from "./document-script-state.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";
import { ScriptLoader, type ScriptLoaderOptions } from "./script-loader.js";

const documents: DocumentTree[] = [];
const controllers: AbortController[] = [];
const pageUrl = "https://example.com/page";
const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};

function response(
	source: string | Uint8Array,
	url = pageUrl,
	type = "text/javascript",
): NetworkResponse {
	const body =
		typeof source === "string" ? new TextEncoder().encode(source) : source;
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

function integrity(source: string | Uint8Array, algorithm = "sha256") {
	return `${algorithm}-${createHash(algorithm).update(source).digest("base64")}`;
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

function fixture(
	html: string,
	options: {
		provider?: boolean;
		controller?: AbortController;
		fetchWithPolicy?: (
			url: string,
			policy: ScriptFetchPolicy,
			signal: AbortSignal,
		) => Promise<Readonly<ScriptFetchResult>>;
		evaluate?: (
			source: string,
			tree: DocumentTree,
		) => Promise<ScriptEvaluation>;
		headers?: NetworkResponse["headers"];
		limits?: ScriptLoaderOptions;
	} = {},
) {
	const controller = options.controller ?? new AbortController();
	controllers.push(controller);
	const input = response(html, pageUrl, "text/html");
	Object.assign(input.headers, options.headers);
	const seen: { source: string; state: string | undefined; text: string }[] =
		[];
	const events: string[] = [];
	let ownedTree: DocumentTree | undefined;
	const fetch = vi.fn(async (url: string) =>
		response(new URL(url).pathname, url),
	);
	const fetchWithPolicy = vi.fn(
		options.fetchWithPolicy ??
			(async (
				url: string,
				_policy: ScriptFetchPolicy,
				_signal: AbortSignal,
			) => ({
				response: response(new URL(url).pathname, url),
				type: "basic" as const,
			})),
	);
	const scripts = new ScriptLoader({
		response: input,
		signal: controller.signal,
		fetch,
		fetchWithPolicy: options.provider === false ? undefined : fetchWithPolicy,
		limits: options.limits,
		owner: (tree) => {
			ownedTree = tree;
			documents.push(tree);
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
			native.addEventListener(tree.root, "DOMContentLoaded", () => {
				events.push("DOMContentLoaded");
			});
			native.addEventListener(native.windowTarget as number, "load", () => {
				events.push("window-load");
			});
			return {
				closed: false,
				evaluate: async (source) => {
					seen.push({
						source,
						state: documentScriptState(tree)?.readyState,
						text: tree.textContent(tree.root),
					});
					return options.evaluate ? options.evaluate(source, tree) : success;
				},
			};
		},
	});
	const loading = loadBrowserDocument(input, {
		scripts,
		signal: controller.signal,
		tabId: "constructed-script-policy",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100_000,
			maxChanges: 100,
		},
	});
	return {
		loading,
		controller,
		fetch,
		fetchWithPolicy,
		seen,
		events,
		get tree() {
			if (!ownedTree) throw new Error("Constructed document has not started");
			return ownedTree;
		},
	};
}

afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	for (const tree of documents.splice(0)) tree.close();
});

describe("constructed script loader policy fixtures without a page runtime", () => {
	it.each([
		['integrity="unknown-fixture"', "no-cors", "include"],
		["crossorigin", "cors", "same-origin"],
		['crossorigin=""', "cors", "same-origin"],
		['crossorigin="anonymous"', "cors", "same-origin"],
		['crossorigin="invalid"', "cors", "same-origin"],
		['crossorigin="use-credentials"', "cors", "include"],
		['crossorigin="UsE-CrEdEnTiAlS"', "cors", "include"],
		['crossorigin=" use-credentials "', "cors", "same-origin"],
	] as const)(
		"maps %s to %s/%s and supplies a live loader signal",
		async (attributes, mode, credentials) => {
			const test = fixture(`<script src="/policy.js" ${attributes}></script>`);
			const tree = await test.loading;
			expect(test.fetch).not.toHaveBeenCalled();
			expect(test.fetchWithPolicy).toHaveBeenCalledExactlyOnceWith(
				"https://example.com/policy.js",
				{ mode, credentials },
				expect.any(AbortSignal),
			);
			const signal = test.fetchWithPolicy.mock.calls[0][2];
			expect(signal).not.toBe(test.controller.signal);
			expect(signal.aborted).toBe(false);
			expect(test.seen.map((entry) => entry.source)).toEqual(["/policy.js"]);
			expect(getEventListeners(test.controller.signal, "abort")).toHaveLength(
				0,
			);
			tree.close();
			expect(signal.aborted).toBe(true);
		},
	);

	it("leaves inline attributes inert and ordinary external scripts on the legacy path", async () => {
		const test = fixture(
			'<script integrity="sha512-invalid" crossorigin>inline</script><script src="/ordinary.js"></script>',
		);
		await test.loading;
		expect(test.seen.map((entry) => entry.source)).toEqual([
			"inline",
			"/ordinary.js",
		]);
		expect(test.fetch).toHaveBeenCalledExactlyOnceWith(
			"https://example.com/ordinary.js",
		);
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	});

	it("retains the unsupported skip when no policy provider is supplied", async () => {
		const test = fixture(
			'<script src="/sri.js" integrity="unknown-fixture"></script><script src="/cors.js" crossorigin></script><script>inline</script>',
			{ provider: false },
		);
		const tree = await test.loading;
		expect(test.fetch).not.toHaveBeenCalled();
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
		expect(test.seen.map((entry) => entry.source)).toEqual(["inline"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 1,
			skipped: 2,
			issues: { "integrity-or-cors-not-supported": 2 },
		});
	});

	it("keeps blocking sources parser-blocking and deferred sources in document order", async () => {
		const test = fixture(
			'<p>before</p><script src="/blocking.js" crossorigin></script><script defer src="/first.js" crossorigin></script><script defer src="/second.js" crossorigin></script><script defer>inline</script><p>after</p>',
		);
		const tree = await test.loading;
		expect(test.seen.map((entry) => entry.source)).toEqual([
			"/blocking.js",
			"inline",
			"/first.js",
			"/second.js",
		]);
		expect(test.seen[0]).toMatchObject({ state: "loading", text: "before" });
		expect(test.seen[1].text).not.toContain("after");
		expect(test.seen.slice(2).map((entry) => entry.state)).toEqual([
			"interactive",
			"interactive",
		]);
		expect(test.events).toEqual([
			"load:/blocking.js",
			"load:/first.js",
			"load:/second.js",
			"DOMContentLoaded",
			"window-load",
		]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 4,
			external: 3,
			complete: true,
		});
	});

	it("lets an async policy source complete after DOMContentLoaded but before window load", async () => {
		const delayed = deferred<Readonly<ScriptFetchResult>>();
		const test = fixture(
			'<script async defer src="/async.js" crossorigin></script><script>setup</script>',
			{
				fetchWithPolicy: () => delayed.promise,
				evaluate: async (source, tree) => {
					if (source === "setup")
						documentInteractions(tree).events.addEventListener(
							tree.root,
							"DOMContentLoaded",
							() => {
								delayed.resolve({
									response: response("asynchronous"),
									type: "basic",
								});
							},
						);
					return success;
				},
			},
		);
		await test.loading;
		expect(test.seen.map((entry) => entry.source)).toEqual([
			"setup",
			"asynchronous",
		]);
		expect(test.seen[1].state).toBe("interactive");
		expect(test.events).toEqual([
			"DOMContentLoaded",
			"load:/async.js",
			"window-load",
		]);
	});

	it.each([
		[integrity("verified"), true],
		[`${integrity("wrong")} ${integrity("verified", "sha512")}`, true],
		[`${integrity("verified")} ${integrity("wrong", "sha512")}`, false],
		[`${integrity("verified")} sha512-malformed`, false],
		[
			`${integrity("wrong", "sha512")} ${integrity("verified", "sha512")}`,
			true,
		],
		["unknown-fixture", true],
		["", true],
	] as const)(
		"uses strongest supported integrity metadata %s (accepted=%s)",
		async (metadata, accepted) => {
			const test = fixture(
				`<script id="verified" src="/verified.js" integrity="${metadata}"></script><script>after</script>`,
				{
					fetchWithPolicy: async (url) => ({
						response: response("verified", url),
						type: "basic",
					}),
				},
			);
			const tree = await test.loading;
			expect(test.seen.map((entry) => entry.source)).toEqual(
				accepted ? ["verified", "after"] : ["after"],
			);
			expect(
				test.events.filter((event) => event.endsWith(":verified")),
			).toEqual([`${accepted ? "load" : "error"}:verified`]);
			expect(test.fetch).not.toHaveBeenCalled();
			expect(documentScriptState(tree)?.report).toMatchObject({
				executed: accepted ? 2 : 1,
				failed: accepted ? 0 : 1,
			});
			if (!accepted)
				expect(
					documentScriptState(tree)?.report?.issues["fetch-policy-denied"],
				).toBe(1);
		},
	);

	it.each([true, false])(
		"hashes original bytes before charset decoding (raw digest=%s)",
		async (rawDigest) => {
			const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
			const metadata = integrity(rawDigest ? bytes : "café");
			const test = fixture(
				`<script src="/latin.js" charset="windows-1252" integrity="${metadata}"></script>`,
				{
					fetchWithPolicy: async (url) => ({
						response: response(bytes, url),
						type: "basic",
					}),
				},
			);
			const tree = await test.loading;
			expect(test.seen.map((entry) => entry.source)).toEqual(
				rawDigest ? ["café"] : [],
			);
			expect(documentScriptState(tree)?.report).toMatchObject({
				failed: rawDigest ? 0 : 1,
			});
		},
	);

	it.each([
		[`integrity="${integrity("external")}"`, "opaque"],
		["crossorigin", "opaque"],
		["crossorigin", "invalid"],
	] as const)(
		"rejects unreadable or invalid policy result %s/%s without legacy fallback",
		async (attributes, type) => {
			const test = fixture(
				`<script id="denied" src="/denied.js" ${attributes}></script><script>after</script>`,
				{
					fetchWithPolicy: async (url) => ({
						response: response("external", url),
						type: type as ScriptFetchResult["type"],
					}),
				},
			);
			const tree = await test.loading;
			expect(test.seen.map((entry) => entry.source)).toEqual(["after"]);
			expect(test.events).toContain("error:denied");
			expect(test.events).not.toContain("load:denied");
			expect(test.fetch).not.toHaveBeenCalled();
			expect(documentScriptState(tree)?.report).toMatchObject({
				failed: 1,
				executed: 1,
			});
			expect(
				documentScriptState(tree)?.report?.issues["fetch-policy-denied"],
			).toBe(1);
		},
	);

	it.each([
		new AgentBrowserError("policy-denied", "Constructed CORS denial"),
		new Error("Constructed fetch failure"),
	])(
		"reports provider failure %s without retrying the legacy fetch",
		async (error) => {
			const test = fixture(
				'<script id="failed" src="/failed.js" crossorigin></script><script>after</script>',
				{
					fetchWithPolicy: async () => {
						throw error;
					},
				},
			);
			const tree = await test.loading;
			expect(test.fetchWithPolicy).toHaveBeenCalledOnce();
			expect(test.fetch).not.toHaveBeenCalled();
			expect(test.seen.map((entry) => entry.source)).toEqual(["after"]);
			expect(test.events).toEqual([
				"error:failed",
				"DOMContentLoaded",
				"window-load",
			]);
			expect(documentScriptState(tree)?.report).toMatchObject({
				failed: 1,
				halted: false,
			});
		},
	);

	it.each([
		["HTTP", { ...response("bad"), status: 404 }],
		["MIME", response("bad", pageUrl, "text/html")],
		["missing MIME", { ...response("bad"), headers: {} }],
		["body limit", response("oversized")],
	] as const)(
		"retains %s validation on policy responses",
		async (_name, result) => {
			const test = fixture(
				'<script id="invalid" src="/invalid.js" crossorigin></script><script>ok</script>',
				{
					limits: { maxSourceBytes: 4 },
					fetchWithPolicy: async () => ({ response: result, type: "basic" }),
				},
			);
			const tree = await test.loading;
			expect(test.seen.map((entry) => entry.source)).toEqual(["ok"]);
			expect(test.events).toContain("error:invalid");
			expect(documentScriptState(tree)?.report).toMatchObject({
				failed: 1,
				executed: 1,
				sourceBytes: 2,
			});
		},
	);

	it("shares aggregate source bytes between inline, legacy and policy scripts", async () => {
		const test = fixture(
			'<script>a</script><script src="/b"></script><script src="/c" crossorigin></script><script>later</script>',
			{ limits: { maxSourceBytes: 4 } },
		);
		const tree = await test.loading;
		expect(test.seen.map((entry) => entry.source)).toEqual(["a", "/b"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			sourceBytes: 3,
			halted: true,
			issues: { "source-byte-limit": 1 },
		});
	});

	it("bounds integrity metadata before calling the policy provider", async () => {
		const test = fixture(
			`<script id="metadata" src="/metadata.js" integrity="${"x".repeat(16_385)}"></script><script>ok</script>`,
		);
		const tree = await test.loading;
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
		expect(test.fetch).not.toHaveBeenCalled();
		expect(test.seen.map((entry) => entry.source)).toEqual(["ok"]);
		expect(test.events).toContain("error:metadata");
		expect(documentScriptState(tree)?.report).toMatchObject({
			failed: 1,
			executed: 1,
			issues: { "fetch-resource-limit": 1 },
		});
	});

	it.each(["http://example.com/insecure.js", "file:///private.js"])(
		"rejects the policy script target %s before provider retrieval",
		async (url) => {
			const test = fixture(
				`<script src="${url}" crossorigin></script><script>ok</script>`,
			);
			const tree = await test.loading;
			expect(test.fetchWithPolicy).not.toHaveBeenCalled();
			expect(test.fetch).not.toHaveBeenCalled();
			expect(test.seen.map((entry) => entry.source)).toEqual(["ok"]);
			expect(documentScriptState(tree)?.report).toMatchObject({
				failed: 1,
				executed: 1,
			});
		},
	);

	it.each([
		[{ maxExternal: 1 }, "external-count-limit"],
		[{ maxScripts: 1 }, "script-count-limit"],
	] as const)(
		"shares count limits with the legacy script path: %s",
		async (limits, issue) => {
			const test = fixture(
				'<script src="/first"></script><script src="/second" crossorigin></script>',
				{ limits },
			);
			const tree = await test.loading;
			expect(test.fetch).toHaveBeenCalledOnce();
			expect(test.fetchWithPolicy).not.toHaveBeenCalled();
			expect(documentScriptState(tree)?.report).toMatchObject({
				executed: 1,
				halted: true,
				issues: { [issue]: 1 },
			});
		},
	);

	it("snapshots queued URL, integrity, crossorigin and charset before parser mutation", async () => {
		const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
		const slots = Array.from({ length: 4 }, () =>
			deferred<Readonly<ScriptFetchResult>>(),
		);
		const test = fixture(
			`<base href="/before/">${slots.map((_, index) => `<script defer src="slot-${index}.js" crossorigin></script>`).join("")}<script id="queued" defer src="queued.js" crossorigin="anonymous" charset="windows-1252" integrity="${integrity(bytes)}"></script><script>mutate</script>`,
			{
				fetchWithPolicy: async (url) => {
					const slot = /slot-(\d)\.js$/.exec(url);
					return slot
						? slots[Number(slot[1])].promise
						: { response: response(bytes, url), type: "basic" };
				},
				evaluate: async (source, tree) => {
					if (source === "mutate") {
						for (const { node } of [...tree.walk()]) {
							if (node.tagName === "base")
								tree.setAttribute(node.id, "href", "/after/");
							if (node.attributes.id === "queued") {
								tree.setAttribute(node.id, "src", "replacement.js");
								tree.setAttribute(node.id, "integrity", integrity("wrong"));
								tree.setAttribute(node.id, "crossorigin", "use-credentials");
								tree.setAttribute(node.id, "charset", "utf-8");
							}
						}
						for (const slot of slots)
							slot.resolve({ response: response("slot"), type: "basic" });
					}
					return success;
				},
			},
		);
		const tree = await test.loading;
		expect(test.fetchWithPolicy.mock.calls[4]).toEqual([
			"https://example.com/before/queued.js",
			{ mode: "cors", credentials: "same-origin" },
			expect.any(AbortSignal),
		]);
		expect(test.seen.map((entry) => entry.source)).toEqual([
			"mutate",
			"slot",
			"slot",
			"slot",
			"slot",
			"café",
		]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			executed: 6,
			failed: 0,
		});
	});

	it.each(["response", "meta"] as const)(
		"keeps %s CSP blocking policy fetches",
		async (kind) => {
			const test = fixture(
				`${kind === "meta" ? '<meta http-equiv="Content-Security-Policy" content="script-src none">' : ""}<script src="/blocked.js" crossorigin></script><script>blocked</script>`,
				{
					headers:
						kind === "response"
							? { "content-security-policy": ["script-src 'none'"] }
							: undefined,
				},
			);
			const tree = await test.loading;
			expect(test.fetchWithPolicy).not.toHaveBeenCalled();
			expect(test.fetch).not.toHaveBeenCalled();
			expect(test.seen).toEqual([]);
			expect(
				documentScriptState(tree)?.report?.issues["csp-not-supported"],
			).toBe(2);
		},
	);

	it("keeps modules, import maps and data blocks inert with policy attributes", async () => {
		const test = fixture(
			'<script type="module" src="/module.js" crossorigin></script><script type="importmap" src="/map.json" crossorigin></script><script type="application/json" src="/data.json" integrity="unknown-fixture"></script><script>ok</script>',
		);
		const tree = await test.loading;
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
		expect(test.fetch).not.toHaveBeenCalled();
		expect(test.seen.map((entry) => entry.source)).toEqual(["ok"]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			skipped: 3,
			executed: 1,
		});
	});

	it.each(["navigation", "document-close"] as const)(
		"aborts the provider signal on %s and never evaluates a late response",
		async (kind) => {
			const started = deferred<AbortSignal>();
			const late = deferred<Readonly<ScriptFetchResult>>();
			const test = fixture('<script src="/pending.js" crossorigin></script>', {
				fetchWithPolicy: (_url, _policy, signal) => {
					started.resolve(signal);
					return late.promise;
				},
			});
			const outcome = test.loading.then(
				() => "loaded",
				() => "rejected",
			);
			const signal = await started.promise;
			expect(signal.aborted).toBe(false);
			if (kind === "navigation") test.controller.abort();
			else test.tree.close();
			expect(signal.aborted).toBe(true);
			late.resolve({ response: response("must-not-run"), type: "basic" });
			expect(await outcome).toBe("rejected");
			expect(test.seen).toEqual([]);
			expect(test.events).not.toContain("load:/pending.js");
			test.tree.close();
			expect(getEventListeners(test.controller.signal, "abort")).toHaveLength(
				0,
			);
		},
	);

	it("never starts a policy fetch for an already aborted document load", async () => {
		const controller = new AbortController();
		controller.abort();
		const test = fixture('<script src="/unstarted.js" crossorigin></script>', {
			controller,
		});
		await expect(test.loading).rejects.toMatchObject({ code: "aborted" });
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
		expect(test.fetch).not.toHaveBeenCalled();
		expect(test.seen).toEqual([]);
	});
});
