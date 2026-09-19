import { expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptState } from "./document-script-state.js";
import { writeDocument } from "./document-write.js";
import type { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import { ScriptLoader, type ScriptLoaderOptions } from "./script-loader.js";

function response(
	source: string,
	type = "text/html",
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
const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};

it("loads a document-written external script before remaining inserted and original markup", async () => {
	const result = await fixture("<body><script>outer</script><p>original</p>", {
		async evaluate(source, tree) {
			if (source === "outer")
				writeDocument(tree, '<script src="/child.js"></script><p>written</p>');
			if (source === "/child.js") writeDocument(tree, "<b>child</b>");
			return success;
		},
	});
	expect(result.seen.map((entry) => entry.source)).toEqual([
		"outer",
		"/child.js",
	]);
	expect(result.tree.textContent(result.tree.root)).toBe(
		"outerchildwrittenoriginal",
	);
	expect(result.report).toMatchObject({
		executed: 2,
		external: 1,
		halted: false,
	});
	expect(() => writeDocument(result.tree, "late")).toThrow();
	result.tree.close();
});

it("prepares written scripts before the caller changes their URL, base or connectedness", async () => {
	const result = await fixture('<base href="/before/"><script>outer</script>', {
		async evaluate(source, tree) {
			if (source === "outer") {
				writeDocument(tree, '<script id="written" src="child.js"></script>');
				for (const { node } of [...tree.walk()]) {
					if (node.tagName === "base")
						tree.setAttribute(node.id, "href", "/after/");
					if (node.attributes.id === "written") {
						tree.setAttribute(node.id, "src", "replacement.js");
						tree.remove(node.id);
					}
				}
			}
			return success;
		},
	});
	expect(result.seen.map((entry) => entry.source)).toEqual([
		"outer",
		"/before/child.js",
	]);
	expect(result.fetch).toHaveBeenCalledWith(
		"https://example.com/before/child.js",
	);
	result.tree.close();
});

it("treats written data blocks as inert and lets the writer observe following markup immediately", async () => {
	const result = await fixture("<body><script>outer</script>", {
		async evaluate(_source, tree) {
			writeDocument(
				tree,
				'<script type="application/json">{"data":true}</script><b>written</b>',
			);
			expect(tree.textContent(tree.root)).toContain("written");
			return success;
		},
	});
	expect(result.report).toMatchObject({
		executed: 1,
		skipped: 1,
		discovered: 2,
	});
	result.tree.close();
});

it("does not grant a parser writer to deferred or asynchronous scripts", async () => {
	const rejected: string[] = [];
	const result = await fixture(
		'<script defer src="/deferred.js"></script><script async src="/async.js"></script>',
		{
			async evaluate(source, tree) {
				expect(() => writeDocument(tree, "not inserted")).toThrow();
				rejected.push(source);
				return success;
			},
		},
	);
	expect(rejected.sort()).toEqual(["/async.js", "/deferred.js"]);
	result.tree.close();
});
async function fixture(
	html: string,
	options: {
		fetch?: (url: string) => Promise<NetworkResponse>;
		evaluate?: (
			source: string,
			tree: DocumentTree,
		) => Promise<ScriptEvaluation>;
		headers?: Record<string, readonly string[]>;
		limits?: ScriptLoaderOptions;
		closed?: boolean;
	} = {},
) {
	const seen: {
		source: string;
		state: string | undefined;
		current: number | null | undefined;
		text: string;
	}[] = [];
	const events: string[] = [];
	const input = response(html);
	Object.assign(input.headers, options.headers);
	const controller = new AbortController();
	const fetch = vi.fn(
		options.fetch ??
			(async (url) => response(new URL(url).pathname, "text/javascript", url)),
	);
	const scripts = new ScriptLoader({
		response: input,
		signal: controller.signal,
		fetch,
		limits: options.limits,
		owner: (tree) => {
			const native = documentInteractions(tree).events;
			for (const name of ["readystatechange", "DOMContentLoaded"])
				native.addEventListener(tree.root, name, () => {
					events.push(`${name}:${documentScriptState(tree)?.readyState}`);
				});
			native.addEventListener(native.windowTarget as number, "load", () => {
				events.push("window-load");
			});
			return {
				get closed() {
					return options.closed === true && seen.length > 0;
				},
				evaluate: async (source) => {
					seen.push({
						source,
						state: documentScriptState(tree)?.readyState,
						current: documentScriptState(tree)?.currentScript,
						text: tree.textContent(tree.root),
					});
					return options.evaluate ? options.evaluate(source, tree) : success;
				},
			};
		},
	});
	const tree = await loadBrowserDocument(input, {
		scripts,
		signal: controller.signal,
		tabId: "fixture",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100_000,
			maxChanges: 100,
		},
	});
	return {
		tree,
		seen,
		events,
		fetch,
		report: documentScriptState(tree)?.report,
	};
}

it("runs blocking scripts against the partially parsed authoritative document", async () => {
	const value = await fixture(
		"<p>before</p><script>first</script><p>after</p><script>second</script>",
	);
	expect(value.seen.map((entry) => entry.source)).toEqual(["first", "second"]);
	expect(value.seen[0]).toMatchObject({
		state: "loading",
		text: "beforefirst",
	});
	expect(value.seen.every((entry) => typeof entry.current === "number")).toBe(
		true,
	);
	expect(value.events).toEqual([
		"readystatechange:interactive",
		"DOMContentLoaded:interactive",
		"readystatechange:complete",
		"window-load",
	]);
	expect(documentScriptState(value.tree)).toMatchObject({
		readyState: "complete",
		currentScript: null,
		report: { executed: 2, complete: true },
	});
	value.tree.close();
});

it("defers external scripts until parsing completes while inline defer remains blocking", async () => {
	const value = await fixture(
		'<script defer src="/deferred"></script><script defer>inline</script><p>after</p>',
	);
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"inline",
		"/deferred",
	]);
	expect(value.seen[0].text).not.toContain("after");
	expect(value.seen[1]).toMatchObject({
		state: "interactive",
		text: "inlineafter",
	});
	expect(value.report).toMatchObject({ external: 1, executed: 2 });
	value.tree.close();
});

it("allows async scripts to finish after DOMContentLoaded but before window load", async () => {
	let release = (_value: NetworkResponse) => {};
	const delayed = new Promise<NetworkResponse>((resolve) => {
		release = resolve;
	});
	let contentLoaded = false;
	const loading = fixture(
		'<script async src="/async"></script><script>setup</script>',
		{
			fetch: () => delayed,
			evaluate: async (_source, tree) => {
				documentInteractions(tree).events.addEventListener(
					tree.root,
					"DOMContentLoaded",
					() => {
						contentLoaded = true;
						release(response("asynchronous", "text/javascript"));
					},
				);
				return success;
			},
		},
	);
	const value = await loading;
	expect(contentLoaded).toBe(true);
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"setup",
		"asynchronous",
	]);
	expect(value.seen[1].state).toBe("interactive");
	expect(value.events.at(-1)).toBe("window-load");
	value.tree.close();
});

it("skips data blocks, unsupported module/import maps and guarded script attributes", async () => {
	const value = await fixture(
		'<script type="application/json">{}</script><script type="module" src="/module"></script><script type="importmap">{}</script><script src="/integrity" integrity="sha256-fixture"></script><script src="/cors" crossorigin></script><script>valid</script>',
	);
	expect(value.seen.map((entry) => entry.source)).toEqual(["valid"]);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.report).toMatchObject({
		discovered: 6,
		skipped: 5,
		executed: 1,
	});
	value.tree.close();
});

it("does not silently bypass response or meta CSP", async () => {
	for (const options of [
		{ headers: { "content-security-policy": ["script-src 'none'"] } },
		{},
	]) {
		const value = await fixture(
			`${options.headers ? "" : '<meta http-equiv="Content-Security-Policy" content="script-src none">'}<script src="/blocked"></script><script>blocked</script>`,
			options,
		);
		expect(value.seen).toEqual([]);
		expect(value.fetch).not.toHaveBeenCalled();
		expect(value.report?.issues["csp-not-supported"]).toBe(2);
		value.tree.close();
	}
});

it("rejects non-JavaScript MIME and continues to another classic source", async () => {
	const value = await fixture(
		'<script src="/wrong"></script><script>valid</script>',
		{ fetch: async (url) => response("not JavaScript", "text/html", url) },
	);
	expect(value.seen.map((entry) => entry.source)).toEqual(["valid"]);
	expect(value.report).toMatchObject({ failed: 1, executed: 1, halted: false });
	value.tree.close();
});

it("halts script execution on realm failure without inventing successful execution", async () => {
	const value = await fixture(
		"<script>throws</script><script>later</script><p>readable</p>",
		{
			evaluate: async () => ({
				...success,
				ok: false,
				error: { code: "script-error" },
			}),
		},
	);
	expect(value.seen.map((entry) => entry.source)).toEqual(["throws"]);
	expect(value.tree.textContent(value.tree.root)).toContain("readable");
	expect(value.report).toMatchObject({
		failed: 1,
		executed: 0,
		halted: true,
		complete: true,
	});
	value.tree.close();
});

it.each([false, true])(
	"continues reported guest exceptions only while the realm is open (%s)",
	async (closed) => {
		const value = await fixture(
			"<script>throws</script><script>later</script>",
			{
				closed,
				evaluate: async (source) =>
					source === "throws"
						? { ...success, ok: false, error: { code: "UNCAUGHT_EXCEPTION" } }
						: success,
			},
		);
		expect(value.seen.map((entry) => entry.source)).toEqual(
			closed ? ["throws"] : ["throws", "later"],
		);
		expect(value.report).toMatchObject({
			failed: 1,
			executed: closed ? 0 : 1,
			halted: closed,
			complete: true,
		});
		expect(value.report?.issues["execution-UNCAUGHT_EXCEPTION"]).toBe(1);
		value.tree.close();
	},
);

it("bounds source bytes and script count", async () => {
	const value = await fixture(
		"<script>oversized</script><script>later</script>",
		{ limits: { maxScripts: 1, maxSourceBytes: 3 } },
	);
	expect(value.seen).toEqual([]);
	expect(value.report?.halted).toBe(true);
	expect(value.report?.sourceBytes).toBe(0);
	value.tree.close();
});

it("keeps successful external loading distinct from a reported script exception", async () => {
	const resourceEvents: string[] = [];
	const value = await fixture(
		'<script>observe</script><script src="/throws.js"></script><script>later</script>',
		{
			evaluate: async (source, tree) => {
				if (source === "observe") {
					for (const type of ["load", "error"])
						documentInteractions(tree).events.addEventListener(
							tree.root,
							type,
							(event) => {
								if (
									event.target !== null &&
									tree.get(event.target).tagName === "script"
								)
									resourceEvents.push(type);
							},
							{ capture: true },
						);
				}
				return source === "/throws.js"
					? { ...success, ok: false, error: { code: "UNCAUGHT_EXCEPTION" } }
					: success;
			},
		},
	);
	expect(resourceEvents).toEqual(["load"]);
	expect(value.report).toMatchObject({ failed: 1, executed: 2, halted: false });
	value.tree.close();
});

it("does not cancel an already prepared deferred script merely because its element is detached", async () => {
	const value = await fixture(
		'<script id="deferred" defer src="/prepared"></script><script>remove</script>',
		{
			evaluate: async (source, tree) => {
				if (source === "remove") {
					const node = [...tree.walk()].find(
						({ node }) => node.attributes.id === "deferred",
					)?.node;
					if (node) tree.remove(node.id);
				}
				return success;
			},
		},
	);
	expect(value.seen.map((entry) => entry.source)).toEqual([
		"remove",
		"/prepared",
	]);
	value.tree.close();
});

it("blocks mixed-content and non-network script URLs before retrieval", async () => {
	const value = await fixture(
		'<script src="http://example.com/insecure.js"></script><script src="file:///private.js"></script><script>valid</script>',
	);
	expect(value.fetch).not.toHaveBeenCalled();
	expect(value.seen.map((entry) => entry.source)).toEqual(["valid"]);
	expect(value.report).toMatchObject({ failed: 2, executed: 1 });
	value.tree.close();
});

it("serializes parser advancement with asynchronous interpreted execution", async () => {
	let changedDuringExecution = false;
	const value = await fixture(
		'<script async src="/asynchronous"></script><script defer src="/deferred"></script><p>future</p>',
		{
			evaluate: async (_source, tree) => {
				const before = tree.textContent(tree.root);
				await Promise.resolve();
				await Promise.resolve();
				if (tree.textContent(tree.root) !== before)
					changedDuringExecution = true;
				return success;
			},
		},
	);
	expect(changedDuringExecution).toBe(false);
	expect(value.report?.executed).toBe(2);
	value.tree.close();
});

it("captures script URLs before waiting for a fetch slot", async () => {
	const release: (() => void)[] = [];
	const value = await fixture(
		'<base href="/initial/"><script defer src="1.js"></script><script defer src="2.js"></script><script defer src="3.js"></script><script defer src="4.js"></script><script defer src="5.js"></script><script>change-base</script>',
		{
			fetch: async (url) =>
				release.length < 4
					? new Promise((resolve) => {
							release.push(() =>
								resolve(response("external", "text/javascript", url)),
							);
						})
					: response("external", "text/javascript", url),
			evaluate: async (source, tree) => {
				if (source === "change-base") {
					const base = [...tree.walk()].find(
						({ node }) => node.tagName === "base",
					)?.node;
					if (base) tree.setAttribute(base.id, "href", "/changed/");
					for (const resolve of release) resolve();
				}
				return success;
			},
		},
	);
	expect(value.fetch.mock.calls[4][0]).toBe("https://example.com/initial/5.js");
	value.tree.close();
});
