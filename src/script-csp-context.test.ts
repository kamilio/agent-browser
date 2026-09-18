import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptState } from "./document-script-state.js";
import type { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import { ScriptLoader } from "./script-loader.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";

const pageUrl = "https://example.com/page";
const ordinaryUrl = "https://example.com/ordinary.js";
const crossOriginUrl = "https://cdn.example.net/classic.js";
const dataUrl = "https://example.com/data";
const recordedTargetPolicy = "frame-ancestors 'self' https://*.target.com;";
const classicHtml = `<script>inline-source</script><script id="ordinary" src="${ordinaryUrl}"></script><script id="crossorigin" src="${crossOriginUrl}" crossorigin="anonymous"></script><p>Readable fixture</p>`;
const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];
const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};

function response(
	url: string,
	source: string,
	headers: NetworkResponse["headers"],
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers,
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

function ports(context: DocumentLoaderContext) {
	if (!context.fetchScript || !context.fetchScriptWithPolicy || !context.fetch)
		throw new Error("Missing constructed session resource ports");
	return {
		legacy: context.fetchScript,
		policy: context.fetchScriptWithPolicy,
		page: context.fetch,
	};
}

function fixture(
	headers: NetworkResponse["headers"],
	options: {
		html?: string;
		loaderContext?: "session" | "omitted" | boolean;
		allowCors?: boolean;
		beforeLoad?: (context: DocumentLoaderContext) => Promise<void>;
	} = {},
) {
	const requests: NetworkRequest[] = [];
	const contexts: DocumentLoaderContext[] = [];
	const seen: {
		source: string;
		state: string | undefined;
		signal: AbortSignal;
	}[] = [];
	const events: string[] = [];
	let active = 0;
	let closed = false;
	const transport: NetworkTransport = {
		limits: { maxConcurrent: 2, maxRedirects: 10 },
		request: async (input) => {
			requests.push(input);
			active++;
			try {
				if (input.url === pageUrl)
					return response(input.url, options.html ?? classicHtml, {
						"content-type": ["text/html"],
						...headers,
					});
				if (![ordinaryUrl, crossOriginUrl, dataUrl].includes(input.url))
					throw new Error(`Unexpected constructed request: ${input.url}`);
				return response(
					input.url,
					input.url === ordinaryUrl ? "ordinary-source" : "crossorigin-source",
					{
						"content-type": ["text/javascript"],
						...(options.allowCors === false
							? {}
							: { "access-control-allow-origin": [new URL(pageUrl).origin] }),
					},
				);
			} finally {
				active--;
			}
		},
		metrics: () => ({
			requests: requests.length,
			active,
			closed,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close: () => {
			closed = true;
		},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: async (input, context) => {
			contexts.push(context);
			await options.beforeLoad?.(context);
			const loaderContext = options.loaderContext ?? "session";
			const scripts = new ScriptLoader({
				response: input,
				signal: context.signal,
				fetch: context.fetchScript,
				fetchWithPolicy: context.fetchScriptWithPolicy,
				...(loaderContext === "omitted"
					? {}
					: {
							topLevelDocument:
								loaderContext === "session"
									? context.topLevelDocument
									: loaderContext,
						}),
				owner: (tree) => {
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
									events.push(`${type}:${target.attributes.id}`);
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
						evaluate: async (source, evaluation) => {
							seen.push({
								source,
								state: documentScriptState(tree)?.readyState,
								signal: evaluation.signal,
							});
							return success;
						},
					};
				},
			});
			return loadBrowserDocument(input, { ...context, scripts });
		},
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return { session, tab, requests, contexts, seen, events };
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

describe("native top-level execution CSP context with a fake script runner", () => {
	it.each<[string, NetworkResponse["headers"]]>([
		[
			"recorded September 17 Target policy",
			{ "content-security-policy": [recordedTargetPolicy] },
		],
		[
			"case-insensitive header",
			{ "CoNtEnT-SeCuRiTy-PoLiCy": [recordedTargetPolicy] },
		],
		["empty policy", { "content-security-policy": [""] }],
		[
			"framing and reporting",
			{
				"content-security-policy": [
					`${recordedTargetPolicy} report-uri /reports; report-to fixture`,
				],
			},
		],
		[
			"multiple framing policies",
			{
				"content-security-policy": [
					recordedTargetPolicy,
					"frame-ancestors 'none'; report-to fixture",
				],
			},
		],
	])(
		"admits %s only through the trusted session context",
		async (_name, headers) => {
			const test = fixture(headers);
			await test.session.navigate(test.tab, pageUrl);
			expect(test.contexts).toHaveLength(1);
			expect(test.contexts[0].topLevelDocument).toBe(true);
			expect(Object.isFrozen(test.contexts[0])).toBe(true);
			expect(test.seen.map(({ source }) => source)).toEqual([
				"inline-source",
				"ordinary-source",
				"crossorigin-source",
			]);
			expect(test.seen.map(({ state }) => state)).toEqual([
				"loading",
				"loading",
				"loading",
			]);
			expect(test.events).toEqual([
				"load:ordinary",
				"load:crossorigin",
				"DOMContentLoaded",
				"window-load",
			]);
			expect(
				documentScriptState(test.session.page(test.tab).document),
			).toMatchObject({
				readyState: "complete",
				currentScript: null,
				report: {
					discovered: 3,
					executed: 3,
					failed: 0,
					skipped: 0,
					complete: true,
				},
			});
			await expect(
				ports(test.contexts[0]).page({ url: dataUrl }),
			).resolves.toMatchObject({ status: 200 });
			expect(test.requests.map(({ url }) => url)).toEqual([
				pageUrl,
				ordinaryUrl,
				crossOriginUrl,
				dataUrl,
			]);
			expect(test.requests[2].headers?.origin).toBe(new URL(pageUrl).origin);
			expect(
				test.session
					.requests(test.tab)
					.entries.filter(({ kind }) => kind === "script"),
			).toMatchObject([{ state: "complete" }, { state: "complete" }]);
			expect(test.session.metrics().requestQueue).toMatchObject({
				active: 0,
				pending: 0,
			});
		},
	);

	it.each([
		["script-src *", ["ordinary-source", "crossorigin-source"]],
		["default-src 'self'", ["ordinary-source"]],
	] as const)(
		"admits only matching external scripts for %s",
		async (policy, sources) => {
			const test = fixture({ "content-security-policy": [policy] });
			await test.session.navigate(test.tab, pageUrl);
			expect(test.seen.map(({ source }) => source)).toEqual(sources);
			expect(test.requests).toHaveLength(sources.length + 1);
		},
	);

	it.each(["omitted", false] as const)(
		"retains conservative loader behavior with %s context",
		async (loaderContext) => {
			for (const policy of [recordedTargetPolicy, ""]) {
				const test = fixture(
					{ "content-security-policy": [policy] },
					{ loaderContext },
				);
				await test.session.navigate(test.tab, pageUrl);
				expect(test.contexts[0].topLevelDocument).toBe(true);
				if (policy === "") {
					expect(test.seen.map((entry) => entry.source)).toEqual([
						"inline-source",
						"ordinary-source",
						"crossorigin-source",
					]);
					continue;
				}
				expect(test.seen).toEqual([]);
				expect(test.requests.map(({ url }) => url)).toEqual([pageUrl]);
				expect(
					documentScriptState(test.session.page(test.tab).document)?.report,
				).toMatchObject({
					executed: 0,
					skipped: 3,
					complete: true,
					issues: { "csp-not-supported": 3 },
				});
				expect(test.events).toEqual([]);
			}
		},
	);

	it.each(["omitted", false, true] as const)(
		"does not enforce absent or report-only CSP with %s loader context",
		async (loaderContext) => {
			const headerCases: NetworkResponse["headers"][] = [
				{},
				{
					"Content-Security-Policy-Report-Only": [
						"script-src 'none'; connect-src 'none'",
					],
				},
			];
			for (const headers of headerCases) {
				const test = fixture(headers, { loaderContext });
				await test.session.navigate(test.tab, pageUrl);
				expect(test.seen).toHaveLength(3);
				await ports(test.contexts[0]).page({ url: dataUrl });
				expect(test.requests.map(({ url }) => url)).toEqual([
					pageUrl,
					ordinaryUrl,
					crossOriginUrl,
					dataUrl,
				]);
			}
		},
	);

	it.each<[string, NetworkResponse["headers"], boolean?]>([
		["sandbox", { "content-security-policy": ["sandbox allow-scripts"] }],
		[
			"unknown directive",
			{ "content-security-policy": ["future-directive allow"] },
		],
		[
			"mixed directives",
			{
				"content-security-policy": [
					`${recordedTargetPolicy} script-src 'none'`,
				],
			},
		],
		[
			"mixed values",
			{ "content-security-policy": [recordedTargetPolicy, "default-src *"] },
			true,
		],
		[
			"mixed policy list",
			{ "content-security-policy": [`${recordedTargetPolicy}, script-src *`] },
		],
		[
			"mixed case aliases",
			{
				"content-security-policy": [recordedTargetPolicy],
				"Content-Security-Policy": ["script-src *"],
			},
		],
		[
			"report-only alongside enforced",
			{
				"content-security-policy-report-only": [recordedTargetPolicy],
				"content-security-policy": ["script-src 'none'"],
			},
		],
	])(
		"blocks %s at the loader and all three session resource ports",
		async (_name, headers, rejectBeforeParse = false) => {
			const test = fixture(headers, {
				beforeLoad: async (context) => {
					expect(context.topLevelDocument).toBe(true);
					const fetch = ports(context);
					await expect(fetch.legacy(ordinaryUrl)).rejects.toMatchObject({
						code: "policy-denied",
					});
					await expect(
						fetch.policy(
							crossOriginUrl,
							{ mode: "cors", credentials: "same-origin" },
							context.signal,
						),
					).rejects.toMatchObject({ code: "policy-denied" });
					await expect(fetch.page({ url: dataUrl })).rejects.toMatchObject({
						code: "policy-denied",
					});
				},
			});
			if (rejectBeforeParse)
				await expect(
					test.session.navigate(test.tab, pageUrl),
				).rejects.toMatchObject({ code: "policy-denied" });
			else await test.session.navigate(test.tab, pageUrl);
			await expect(
				ports(test.contexts[0]).page({ url: dataUrl }),
			).rejects.toMatchObject({
				code: rejectBeforeParse ? "closed" : "policy-denied",
			});
			expect(test.seen).toEqual([]);
			expect(test.requests.map(({ url }) => url)).toEqual([pageUrl]);
			expect(
				test.session
					.requests(test.tab)
					.entries.filter(({ kind }) => kind === "script" || kind === "fetch"),
			).toMatchObject([
				{ kind: "script", state: "blocked", error: "policy-denied" },
				{ kind: "script", state: "blocked", error: "policy-denied" },
				{ kind: "fetch", state: "blocked", error: "policy-denied" },
				{
					kind: "fetch",
					state: rejectBeforeParse ? "failed" : "blocked",
					error: rejectBeforeParse ? "closed" : "policy-denied",
				},
			]);
			if (rejectBeforeParse) {
				expect(test.session.metrics().requestQueue).toMatchObject({
					active: 0,
					pending: 0,
				});
				return;
			}
			const tree = test.session.page(test.tab).document;
			expect(tree.textContent(tree.root)).toContain("Readable fixture");
			expect(documentScriptState(tree)?.report).toMatchObject({
				executed: 0,
				skipped: 3,
				complete: true,
				issues: { "csp-not-supported": 3 },
			});
			expect(test.events).toEqual(
				_name === "report-only alongside enforced"
					? ["DOMContentLoaded", "window-load"]
					: [],
			);
			expect(test.session.metrics().requestQueue).toMatchObject({
				active: 0,
				pending: 0,
			});
		},
	);

	it.each([recordedTargetPolicy, "script-src 'none'"])(
		"keeps meta CSP conservative even with trusted framing-only headers: %s",
		async (policy) => {
			const test = fixture(
				{ "content-security-policy": [recordedTargetPolicy] },
				{
					html: `<meta http-equiv="Content-Security-Policy" content="${policy}">${classicHtml}`,
				},
			);
			await test.session.navigate(test.tab, pageUrl);
			expect(test.seen).toEqual([]);
			expect(test.requests.map(({ url }) => url)).toEqual([pageUrl]);
			expect(
				documentScriptState(test.session.page(test.tab).document)?.report,
			).toMatchObject({
				skipped: 3,
				complete: true,
				issues: { "csp-not-supported": 3 },
			});
		},
	);

	it.each([
		["CORS rejection", false, true, false],
		["SRI mismatch", true, false, false],
		["matching CORS and SRI", true, true, true],
	] as const)(
		"preserves %s under the recorded framing-only policy",
		async (_name, allowCors, matchingIntegrity, executes) => {
			const digest = createHash("sha256")
				.update(matchingIntegrity ? "crossorigin-source" : "different-source")
				.digest("base64");
			const test = fixture(
				{ "content-security-policy": [recordedTargetPolicy] },
				{
					allowCors,
					html: `<script id="crossorigin" src="${crossOriginUrl}" crossorigin="anonymous" integrity="sha256-${digest}"></script><p>Readable fixture</p>`,
				},
			);
			await test.session.navigate(test.tab, pageUrl);
			expect(test.seen.map(({ source }) => source)).toEqual(
				executes ? ["crossorigin-source"] : [],
			);
			expect(test.requests.map(({ url }) => url)).toEqual([
				pageUrl,
				crossOriginUrl,
			]);
			expect(test.events).toEqual([
				`${executes ? "load" : "error"}:crossorigin`,
				"DOMContentLoaded",
				"window-load",
			]);
			expect(
				documentScriptState(test.session.page(test.tab).document)?.report,
			).toMatchObject({
				executed: executes ? 1 : 0,
				failed: executes ? 0 : 1,
				complete: true,
				issues: executes ? {} : { "fetch-policy-denied": 1 },
			});
			expect(
				test.session
					.requests(test.tab)
					.entries.filter(({ kind }) => kind === "script"),
			).toMatchObject([
				allowCors
					? { state: "complete" }
					: { state: "blocked", error: "policy-denied" },
			]);
		},
	);

	it.each([null, "true", 1, {}, []].map((value) => ({ value })))(
		"rejects invalid top-level loader context $value without acquiring resources",
		({ value }) => {
			const controller = new AbortController();
			const owner = vi.fn();
			const fetch = vi.fn();
			expect(
				() =>
					new ScriptLoader({
						response: response(pageUrl, classicHtml, {
							"content-security-policy": [recordedTargetPolicy],
						}),
						signal: controller.signal,
						topLevelDocument: value as unknown as boolean,
						owner,
						fetch,
					}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
			expect(owner).not.toHaveBeenCalled();
			expect(fetch).not.toHaveBeenCalled();
			expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		},
	);

	it("cleans up the admitted document and session without reopening resource access", async () => {
		const test = fixture({
			"content-security-policy": [recordedTargetPolicy],
		});
		await test.session.navigate(test.tab, pageUrl);
		const tree = test.session.page(test.tab).document;
		const fetch = ports(test.contexts[0]).page;
		expect(test.seen).toHaveLength(3);
		expect(test.seen.every(({ signal }) => !signal.aborted)).toBe(true);
		test.session.close();
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(documentScriptState(tree)).toBeUndefined();
		expect(test.seen.every(({ signal }) => signal.aborted)).toBe(true);
		await expect(fetch({ url: dataUrl })).rejects.toMatchObject({
			code: "closed",
		});
		expect(test.requests.map(({ url }) => url)).toEqual([
			pageUrl,
			ordinaryUrl,
			crossOriginUrl,
		]);
		expect(test.session.metrics().network).toMatchObject({
			closed: true,
			active: 0,
		});
		expect(test.session.metrics().requestQueue).toMatchObject({
			active: 0,
			pending: 0,
		});
	});
});
