import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptState } from "./document-script-state.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentInteractions } from "./interactions.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";
import { ScriptLoader } from "./script-loader.js";
import { initializeScriptElement } from "./script-element-state.js";
import {
	BrowserSession,
	type BrowserSessionOptions,
	type DocumentLoaderContext,
} from "./session.js";

const initialUrl = "https://example.com/start";
const scriptUrl = "https://example.com/entry.js";
const crossOriginUrl = "https://cdn.example.net/final.js";
const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];

function response(
	url: string,
	source = "constructed-source",
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/javascript"] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 1,
		...overrides,
	};
}

function documentFixture(
	result: NetworkResponse,
	context: DocumentLoaderContext,
) {
	const tree = new DocumentTree(result.url, context.limits);
	documents.push(tree);
	const body = tree.createElement("body");
	tree.append(tree.root, body);
	tree.append(body, tree.createText("Constructed script policy fixture"));
	return tree;
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

function policyFetch(context: DocumentLoaderContext) {
	if (!context.fetchScriptWithPolicy)
		throw new Error("Missing constructed script policy provider");
	return context.fetchScriptWithPolicy;
}

function legacyFetch(context: DocumentLoaderContext) {
	if (!context.fetchScript) throw new Error("Missing legacy script provider");
	return context.fetchScript;
}

function fixture(
	options: Partial<BrowserSessionOptions> = {},
	handler: (input: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => response(input.url),
	limits: NetworkTransport["limits"] = { maxConcurrent: 2, maxRedirects: 10 },
) {
	const requests: NetworkRequest[] = [];
	let active = 0;
	let closed = false;
	const transport: NetworkTransport = {
		limits,
		request: async (input) => {
			requests.push(input);
			active++;
			try {
				return await handler(input);
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
		loadDocument: documentFixture,
		...options,
	});
	sessions.push(session);
	return { session, requests };
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

describe("constructed BrowserSession script policy transport fixtures", () => {
	it.each([
		"complete",
		"stop",
		"close",
	] as const)("keeps a script inserted by window load pending until %s", async (action) => {
		const started = deferred<NetworkRequest>();
		const release = deferred<void>();
		const seen: string[] = [];
		const { session } = fixture(
			{
				loadDocument: async (input, context) => {
					const scripts = new ScriptLoader({
						response: input,
						signal: context.signal,
						fetch: context.fetchScript,
						fetchWithPolicy: policyFetch(context),
						owner(tree) {
							documents.push(tree);
							const events = documentInteractions(tree).events;
							events.addEventListener(
								events.windowTarget as number,
								"load",
								() => {
									const id = tree.createElement("script", {
										src: scriptUrl,
										crossorigin: "anonymous",
									});
									initializeScriptElement(tree, id, "dynamic");
									tree.append(tree.root, id);
								},
							);
							return {
								closed: false,
								evaluate: async (source): Promise<ScriptEvaluation> => {
									seen.push(source);
									return {
										engine: "poe-safe-js",
										partial: true,
										ok: true,
										metrics: {
											steps: 0,
											peakCallDepth: 0,
											peakDataSize: 0,
											consoleCalls: 0,
										},
									};
								},
							};
						},
					});
					return loadBrowserDocument(input, { ...context, scripts });
				},
			},
			async (input) => {
				if (input.url === initialUrl)
					return response(input.url, "<body>Window load fixture</body>", {
						headers: { "content-type": ["text/html"] },
					});
				started.resolve(input);
				await release.promise;
				return response(input.url, "late-window-load-source");
			},
		);
		const tab = session.createTab().id;
		let navigationFinished = false;
		const navigation = session.navigate(tab, initialUrl).then(
			() => {
				navigationFinished = true;
				return { committed: true };
			},
			(error: AgentBrowserError) => {
				navigationFinished = true;
				return { committed: false, code: error.code };
			},
		);
		try {
			const request = await started.promise;
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(navigationFinished).toBe(false);
			expect(request.signal?.aborted).toBe(false);
			if (action === "stop") session.stop(tab);
			else if (action === "close") session.close();
			release.resolve();
			expect(await navigation).toEqual(
				action === "complete"
					? { committed: true }
					: {
							committed: false,
							code: action === "stop" ? "aborted" : "closed",
						},
			);
			expect(seen).toEqual(
				action === "complete" ? ["late-window-load-source"] : [],
			);
			if (action === "complete")
				expect(
					documentScriptState(session.page(tab).document)?.report,
				).toMatchObject({
					discovered: 1,
					executed: 1,
					failed: 0,
				});
			else expect(request.signal?.aborted).toBe(true);
		} finally {
			release.resolve();
			await navigation;
		}
	});
	it.each([
		["cors", "same-origin", "omit", "cors", "https://example.com"],
		["cors", "include", "include", "cors", "https://example.com"],
		["cors", "omit", "omit", "cors", "https://example.com"],
		["no-cors", "include", "include", "opaque", undefined],
	] as const)(
		"forwards %s/%s policy through manual redirects and the script journal",
		async (mode, credentials, finalCredentials, type, origin) => {
			let result: Readonly<ScriptFetchResult> | undefined;
			const controller = new AbortController();
			const { session, requests } = fixture(
				{
					loadDocument: async (input, context) => {
						result = await policyFetch(context)(
							scriptUrl,
							{ mode, credentials },
							controller.signal,
						);
						return documentFixture(input, context);
					},
				},
				async (input) => {
					if (input.url === scriptUrl)
						return response(input.url, "", {
							status: 302,
							headers: { location: [crossOriginUrl] },
						});
					return response(input.url, "constructed-source", {
						headers: {
							"content-type": ["text/javascript"],
							"access-control-allow-origin": ["https://example.com"],
							"access-control-allow-credentials": ["true"],
						},
					});
				},
			);
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			expect(requests.map((request) => request.url)).toEqual([
				initialUrl,
				scriptUrl,
				crossOriginUrl,
			]);
			expect(requests[1]).toMatchObject({
				method: "GET",
				redirect: "manual",
				cookieContext: {
					siteUrl: initialUrl,
					topLevelNavigation: false,
					credentials,
				},
			});
			expect(requests[1].headers?.origin).toBeUndefined();
			expect(requests[2]).toMatchObject({
				method: "GET",
				redirect: "manual",
				cookieContext: {
					siteUrl: initialUrl,
					topLevelNavigation: false,
					credentials: finalCredentials,
				},
			});
			expect(requests[2].headers?.origin).toBe(origin);
			expect(result).toMatchObject({
				type,
				response: {
					url: crossOriginUrl,
					redirects: [
						{ url: scriptUrl, status: 302, location: crossOriginUrl },
					],
				},
			});
			expect(
				session
					.requests(tab)
					.entries.filter((entry) => entry.kind === "script"),
			).toMatchObject([
				{
					state: "complete",
					url: scriptUrl,
					finalUrl: crossOriginUrl,
					redirectCount: 1,
					encodedBytes: 18,
					decodedBytes: 18,
				},
			]);
			expect(controller.signal.aborted).toBe(false);
			expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		},
	);

	it.each(["cors", "no-cors"] as const)(
		"resourceCredentials omit overrides %s policy credentials while preserving the legacy path",
		async (mode) => {
			const { session, requests } = fixture(
				{
					resourceCredentials: "omit",
					loadDocument: async (input, context) => {
						await legacyFetch(context)(scriptUrl);
						await policyFetch(context)(
							crossOriginUrl,
							{ mode, credentials: "include" },
							new AbortController().signal,
						);
						return documentFixture(input, context);
					},
				},
				async (input) =>
					response(input.url, "fixture", {
						headers: {
							"content-type": ["text/javascript"],
							"access-control-allow-origin": ["*"],
						},
					}),
			);
			await session.navigate(session.createTab().id, initialUrl);
			expect(requests[0].cookieContext?.credentials).toBe("include");
			expect(
				requests.slice(1).map((request) => request.cookieContext?.credentials),
			).toEqual(["include", "omit"]);
			expect(requests[2].headers?.origin).toBe(
				mode === "cors" ? "https://example.com" : undefined,
			);
		},
	);

	it("retains CORS and credential taint when a redirect returns to the document origin", async () => {
		const returnUrl = "https://example.com/returned.js";
		let result: Readonly<ScriptFetchResult> | undefined;
		const { session, requests } = fixture(
			{
				loadDocument: async (input, context) => {
					result = await policyFetch(context)(
						scriptUrl,
						{ mode: "cors", credentials: "same-origin" },
						new AbortController().signal,
					);
					return documentFixture(input, context);
				},
			},
			async (input) => {
				const location =
					input.url === scriptUrl
						? crossOriginUrl
						: input.url === crossOriginUrl
							? returnUrl
							: undefined;
				return response(input.url, "fixture", {
					status: location ? 302 : 200,
					headers: {
						"content-type": ["text/javascript"],
						"access-control-allow-origin": [
							input.headers?.origin ?? "https://example.com",
						],
						...(location ? { location: [location] } : {}),
					},
				});
			},
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expect(requests.map((request) => request.url)).toEqual([
			initialUrl,
			scriptUrl,
			crossOriginUrl,
			returnUrl,
		]);
		expect(requests[3]).toMatchObject({
			redirect: "manual",
			headers: { origin: "null" },
			cookieContext: { credentials: "omit" },
		});
		expect(result).toMatchObject({
			type: "cors",
			response: { url: returnUrl },
		});
		expect(
			session.requests(tab).entries.filter((entry) => entry.kind === "script"),
		).toMatchObject([{ state: "complete", redirectCount: 2 }]);
	});

	it("journals a CORS denial as blocked without retrying as an ordinary script", async () => {
		const { session, requests } = fixture({
			loadDocument: async (input, context) => {
				await expect(
					policyFetch(context)(
						crossOriginUrl,
						{ mode: "cors", credentials: "same-origin" },
						new AbortController().signal,
					),
				).rejects.toMatchObject({ code: "policy-denied" });
				return documentFixture(input, context);
			},
		});
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expect(requests.map((request) => request.url)).toEqual([
			initialUrl,
			crossOriginUrl,
		]);
		expect(session.requests(tab).entries).toMatchObject([
			{ kind: "document", state: "complete" },
			{ kind: "script", state: "blocked", error: "policy-denied" },
		]);
	});

	it("uses the transport redirect limit for policy scripts", async () => {
		const { session, requests } = fixture(
			{
				loadDocument: async (input, context) => {
					await expect(
						policyFetch(context)(
							scriptUrl,
							{ mode: "cors", credentials: "same-origin" },
							new AbortController().signal,
						),
					).rejects.toMatchObject({ code: "resource-limit" });
					return documentFixture(input, context);
				},
			},
			async (input) =>
				input.url === scriptUrl
					? response(input.url, "", {
							status: 302,
							headers: { location: [crossOriginUrl] },
						})
					: response(input.url),
			{ maxConcurrent: 1, maxRedirects: 0 },
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expect(requests.map((request) => request.url)).toEqual([
			initialUrl,
			scriptUrl,
		]);
		expect(
			session.requests(tab).entries.filter((entry) => entry.kind === "script"),
		).toMatchObject([{ state: "failed", error: "resource-limit" }]);
	});

	it.each([
		["content-security-policy", "script-src 'none'", true],
		["Content-Security-Policy", "script-src *", true],
		["content-security-policy-report-only", "script-src 'none'", false],
	] as const)(
		"conservatively handles response header %s=%s before policy transport",
		async (header, value, blocked) => {
			const { session, requests } = fixture(
				{
					loadDocument: async (input, context) => {
						const pending = policyFetch(context)(
							scriptUrl,
							{ mode: "cors", credentials: "same-origin" },
							new AbortController().signal,
						);
						if (blocked)
							await expect(pending).rejects.toMatchObject({
								code: "policy-denied",
							});
						else
							await expect(pending).resolves.toMatchObject({ type: "basic" });
						return documentFixture(input, context);
					},
				},
				async (input) =>
					response(input.url, "fixture", {
						headers:
							input.url === initialUrl
								? { "content-type": ["text/html"], [header]: [value] }
								: { "content-type": ["text/javascript"] },
					}),
			);
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			expect(requests.map((request) => request.url)).toEqual(
				blocked ? [initialUrl] : [initialUrl, scriptUrl],
			);
			expect(
				session
					.requests(tab)
					.entries.filter((entry) => entry.kind === "script"),
			).toMatchObject([
				blocked
					? { state: "blocked", error: "policy-denied" }
					: { state: "complete" },
			]);
		},
	);

	it.each([true, false])(
		"shares the sixteen initial script requests across both paths (policy first=%s)",
		async (policyFirst) => {
			const { session, requests } = fixture({
				loadDocument: async (input, context) => {
					for (let index = 0; index < 20; index++) {
						const url = `https://example.com/script-${index}.js`;
						const pending =
							(index % 2 === 0) === policyFirst
								? policyFetch(context)(
										url,
										{ mode: "cors", credentials: "same-origin" },
										new AbortController().signal,
									).then((result) => result.response)
								: legacyFetch(context)(url);
						if (index < 16)
							await expect(pending).resolves.toMatchObject({ status: 200 });
						else
							await expect(pending).rejects.toMatchObject({
								code: "resource-limit",
							});
					}
					return documentFixture(input, context);
				},
			});
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			expect(requests).toHaveLength(17);
			expect(session.limits.maxScriptRequests).toBe(16);
			const entries = session
				.requests(tab)
				.entries.filter((entry) => entry.kind === "script");
			expect(entries).toHaveLength(20);
			expect(
				entries.slice(0, 16).every((entry) => entry.state === "complete"),
			).toBe(true);
			expect(
				entries
					.slice(16)
					.map((entry) => ({ state: entry.state, error: entry.error })),
			).toEqual(
				Array.from({ length: 4 }, () => ({
					state: "failed",
					error: "resource-limit",
				})),
			);
		},
	);

	it.each(
		[1, 19, 128].flatMap((maxScriptRequests) =>
			[true, false].map((policyFirst) => ({ maxScriptRequests, policyFirst })),
		),
	)(
		"shares configured $maxScriptRequests script requests across both paths (policy first=$policyFirst)",
		async ({ maxScriptRequests, policyFirst }) => {
			const { session, requests } = fixture({
				limits: { maxScriptRequests },
				loadDocument: async (input, context) => {
					for (let index = 0; index < maxScriptRequests + 2; index++) {
						const url = `https://example.com/configured-${index}.js`;
						const pending =
							(index % 2 === 0) === policyFirst
								? policyFetch(context)(
										url,
										{ mode: "cors", credentials: "same-origin" },
										new AbortController().signal,
									).then((result) => result.response)
								: legacyFetch(context)(url);
						if (index < maxScriptRequests)
							await expect(pending).resolves.toMatchObject({ status: 200 });
						else
							await expect(pending).rejects.toMatchObject({
								code: "resource-limit",
							});
					}
					return documentFixture(input, context);
				},
			});
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			expect(session.limits.maxScriptRequests).toBe(maxScriptRequests);
			expect(requests).toHaveLength(maxScriptRequests + 1);
			const entries = session
				.requests(tab)
				.entries.filter((entry) => entry.kind === "script");
			expect(
				entries.slice(0, -2).every((entry) => entry.state === "complete"),
			).toBe(true);
			expect(entries.slice(-2)).toMatchObject([
				{ state: "failed", error: "resource-limit" },
				{ state: "failed", error: "resource-limit" },
			]);
		},
	);

	it.each([true, false])(
		"resets the configured shared script budget for each navigation (policy first=%s)",
		async (policyFirst) => {
			const maxScriptRequests = 19;
			let loadedDocuments = 0;
			const { session, requests } = fixture({
				limits: { maxScriptRequests },
				loadDocument: async (input, context) => {
					loadedDocuments++;
					for (let index = 0; index <= maxScriptRequests; index++) {
						const url = `https://example.com/page-${loadedDocuments}-${index}.js`;
						const pending =
							(index % 2 === 0) === policyFirst
								? policyFetch(context)(
										url,
										{ mode: "cors", credentials: "same-origin" },
										new AbortController().signal,
									).then((result) => result.response)
								: legacyFetch(context)(url);
						if (index < maxScriptRequests)
							await expect(pending).resolves.toMatchObject({ status: 200 });
						else
							await expect(pending).rejects.toMatchObject({
								code: "resource-limit",
							});
					}
					return documentFixture(input, context);
				},
			});
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			await session.navigate(tab, `${initialUrl}?next`);
			expect(loadedDocuments).toBe(2);
			expect(requests).toHaveLength(2 * (maxScriptRequests + 1));
			expect(
				requests.filter((request) => request.url.endsWith("-19.js")),
			).toHaveLength(0);
		},
	);

	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		129,
		"19",
		null,
		undefined,
	])(
		"rejects invalid script allowance %s before creating transport",
		(value) => {
			let transportCreated = false;
			expect(
				() =>
					new BrowserSession({
						createTransport: () => {
							transportCreated = true;
							throw new Error("Unexpected transport construction");
						},
						loadDocument: documentFixture,
						limits: { maxScriptRequests: value as number },
					}),
			).toThrow(
				expect.objectContaining({
					code: "invalid-input",
					message: "Invalid session limit: maxScriptRequests",
				}),
			);
			expect(transportCreated).toBe(false);
		},
	);

	it("counts a redirected policy fetch as one initial script resource", async () => {
		const { session, requests } = fixture(
			{
				loadDocument: async (input, context) => {
					await policyFetch(context)(
						scriptUrl,
						{ mode: "no-cors", credentials: "include" },
						new AbortController().signal,
					);
					for (let index = 0; index < 15; index++)
						await legacyFetch(context)(
							`https://example.com/legacy-${index}.js`,
						);
					await expect(
						policyFetch(context)(
							"https://example.com/over-budget.js",
							{ mode: "cors", credentials: "same-origin" },
							new AbortController().signal,
						),
					).rejects.toMatchObject({ code: "resource-limit" });
					return documentFixture(input, context);
				},
			},
			async (input) =>
				input.url === scriptUrl
					? response(input.url, "", {
							status: 302,
							headers: { location: [crossOriginUrl] },
						})
					: response(input.url),
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expect(requests).toHaveLength(18);
		expect(
			requests.some((request) => request.url.endsWith("over-budget.js")),
		).toBe(false);
		expect(
			session
				.requests(tab)
				.entries.filter(
					(entry) => entry.kind === "script" && entry.state === "complete",
				),
		).toHaveLength(16);
	});

	it.each([
		["crossorigin=anonymous", true, true],
		["crossorigin=anonymous", false, false],
		["", true, false],
	] as const)(
		"connects session fetch policy to the fake loader runner (%s, matching=%s)",
		async (attributes, matching, executes) => {
			const source = "constructed-source";
			const digest = createHash("sha256")
				.update(matching ? source : "different")
				.digest("base64");
			const seen: string[] = [];
			const { session, requests } = fixture(
				{
					loadDocument: async (input, context) => {
						const scripts = new ScriptLoader({
							response: input,
							signal: context.signal,
							fetch: context.fetchScript,
							fetchWithPolicy: policyFetch(context),
							owner: (tree) => {
								documents.push(tree);
								return {
									closed: false,
									evaluate: async (text): Promise<ScriptEvaluation> => {
										seen.push(text);
										return {
											engine: "poe-safe-js",
											partial: true,
											ok: true,
											metrics: {
												steps: 0,
												peakCallDepth: 0,
												peakDataSize: 0,
												consoleCalls: 0,
											},
										};
									},
								};
							},
						});
						return loadBrowserDocument(input, { ...context, scripts });
					},
				},
				async (input) =>
					input.url === initialUrl
						? response(
								input.url,
								`<script src="${crossOriginUrl}" ${attributes} integrity="sha256-${digest}"></script><p>Readable fixture</p>`,
								{ headers: { "content-type": ["text/html"] } },
							)
						: response(input.url, source, {
								headers: {
									"content-type": ["text/javascript"],
									"access-control-allow-origin": ["https://example.com"],
								},
							}),
			);
			const tab = session.createTab().id;
			await session.navigate(tab, initialUrl);
			expect(seen).toEqual(executes ? [source] : []);
			expect(requests).toHaveLength(2);
			expect(
				documentScriptState(session.page(tab).document)?.report,
			).toMatchObject({
				executed: executes ? 1 : 0,
				failed: executes ? 0 : 1,
				complete: true,
			});
			expect(
				session
					.requests(tab)
					.entries.filter((entry) => entry.kind === "script"),
			).toMatchObject([{ state: "complete" }]);
		},
	);

	it("cancels an active policy request with the loader signal without aborting navigation", async () => {
		const controller = new AbortController();
		const started = deferred<NetworkRequest>();
		let navigationAborted: boolean | undefined;
		const { session } = fixture(
			{
				loadDocument: async (input, context) => {
					await expect(
						policyFetch(context)(
							scriptUrl,
							{ mode: "cors", credentials: "same-origin" },
							controller.signal,
						),
					).rejects.toMatchObject({ code: "aborted" });
					navigationAborted = context.signal.aborted;
					return documentFixture(input, context);
				},
			},
			async (input) => {
				if (input.url !== scriptUrl) return response(input.url);
				return new Promise<NetworkResponse>((_resolve, reject) => {
					input.signal?.addEventListener(
						"abort",
						() =>
							reject(
								new AgentBrowserError(
									"aborted",
									"Constructed request canceled",
								),
							),
						{ once: true },
					);
					started.resolve(input);
				});
			},
		);
		const tab = session.createTab().id;
		const navigation = session.navigate(tab, initialUrl);
		const request = await started.promise;
		expect(request.signal).not.toBe(controller.signal);
		expect(request.signal?.aborted).toBe(false);
		controller.abort();
		await navigation;
		expect(request.signal?.aborted).toBe(true);
		expect(navigationAborted).toBe(false);
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		expect(
			session.requests(tab).entries.filter((entry) => entry.kind === "script"),
		).toMatchObject([{ state: "failed", error: "aborted" }]);
		expect(session.metrics().requestQueue).toMatchObject({
			active: 0,
			pending: 0,
		});
	});

	it.each(["stop", "close"] as const)(
		"combines the navigation lifetime with the loader signal on %s",
		async (action) => {
			const controller = new AbortController();
			const started = deferred<NetworkRequest>();
			const finished = deferred<void>();
			const { session } = fixture(
				{
					loadDocument: async (input, context) => {
						try {
							await policyFetch(context)(
								scriptUrl,
								{ mode: "cors", credentials: "same-origin" },
								controller.signal,
							);
							return documentFixture(input, context);
						} finally {
							finished.resolve();
						}
					},
				},
				async (input) => {
					if (input.url !== scriptUrl) return response(input.url);
					return new Promise<NetworkResponse>((_resolve, reject) => {
						input.signal?.addEventListener(
							"abort",
							() => reject(input.signal?.reason),
							{ once: true },
						);
						started.resolve(input);
					});
				},
			);
			const tab = session.createTab().id;
			const navigation = session.navigate(tab, initialUrl);
			const canceled = expect(navigation).rejects.toMatchObject({
				code: action === "stop" ? "aborted" : "closed",
			});
			const request = await started.promise;
			if (action === "stop") session.stop(tab);
			else session.close();
			await canceled;
			await finished.promise;
			expect(request.signal?.aborted).toBe(true);
			expect(controller.signal.aborted).toBe(false);
			expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		},
	);

	it.each([true, false])(
		"cancels queued and active policy work when bootstrap settles (commit=%s)",
		async (commit) => {
			const started = deferred<NetworkRequest>();
			const release = deferred<void>();
			const controller = new AbortController();
			const resources: Promise<unknown>[] = [];
			const queuedUrl = "https://example.com/queued.js";
			const recoveredUrl = "https://example.com/recovered";
			const policy: ScriptFetchPolicy = {
				mode: "cors",
				credentials: "same-origin",
			};
			const { session, requests } = fixture(
				{
					loadDocument: async (input, context) => {
						if (input.url === recoveredUrl)
							return documentFixture(input, context);
						const fetch = policyFetch(context);
						resources.push(
							fetch(scriptUrl, policy, controller.signal).catch(
								(error: unknown) => error,
							),
						);
						await started.promise;
						resources.push(
							fetch(queuedUrl, policy, controller.signal).catch(
								(error: unknown) => error,
							),
						);
						if (!commit) throw new Error("Constructed loader failure");
						return documentFixture(input, context);
					},
				},
				async (input) => {
					if (input.url === scriptUrl) {
						started.resolve(input);
						await release.promise;
					}
					return response(input.url);
				},
				{ maxConcurrent: 1, maxRedirects: 10 },
			);
			const tab = session.createTab().id;
			try {
				const navigation = session.navigate(tab, initialUrl);
				if (commit) await navigation;
				else
					await expect(navigation).rejects.toMatchObject({
						code: "unsupported",
					});
				expect((await started.promise).signal?.aborted).toBe(true);
				expect(controller.signal.aborted).toBe(false);
				expect(session.metrics().requestQueue).toMatchObject({
					active: 1,
					pending: 0,
				});
				release.resolve();
				expect(await Promise.all(resources)).toMatchObject([
					{ code: "closed" },
					{ code: "closed" },
				]);
				expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
				await session.navigate(tab, recoveredUrl);
				expect(requests.map((request) => request.url)).toEqual([
					initialUrl,
					scriptUrl,
					recoveredUrl,
				]);
				expect(session.metrics().requestQueue).toMatchObject({
					active: 0,
					pending: 0,
				});
			} finally {
				release.resolve();
				await Promise.all(resources);
			}
		},
	);
});

function modulePolicyFetch(context: DocumentLoaderContext) {
	if (!context.fetchModuleWithPolicy)
		throw new Error("Missing document module policy provider");
	return context.fetchModuleWithPolicy;
}

it("keeps an admitted module dependency started before commit alive after bootstrap retirement", async () => {
	const started = deferred<NetworkRequest>();
	const release = deferred<void>();
	let pending: Promise<Readonly<ScriptFetchResult>> | undefined;
	const { session } = fixture(
		{
			loadDocument(input, context) {
				pending = modulePolicyFetch(context)(
					scriptUrl,
					{ mode: "cors", credentials: "same-origin" },
					new AbortController().signal,
				);
				void pending.catch(() => undefined);
				return documentFixture(input, context);
			},
		},
		async (input) => {
			if (input.url === scriptUrl) {
				started.resolve(input);
				await release.promise;
			}
			return response(input.url);
		},
	);
	const tab = session.createTab().id;
	try {
		await session.navigate(tab, initialUrl);
		const request = await started.promise;
		expect(request.signal?.aborted).toBe(false);
		release.resolve();
		await expect(pending).resolves.toMatchObject({ response: { status: 200 } });
		expect(
			session.requests(tab).entries.filter((entry) => entry.kind === "script"),
		).toMatchObject([{ state: "complete" }]);
	} finally {
		release.resolve();
	}
});

it.each([
	"stop",
	"close",
] as const)("cancels precommit document module dependency on %s", async (action) => {
	const started = deferred<NetworkRequest>();
	const release = deferred<void>();
	let pending: Promise<Readonly<ScriptFetchResult>> | undefined;
	const { session } = fixture(
		{
			async loadDocument(input, context) {
				const tree = documentFixture(input, context);
				pending = modulePolicyFetch(context)(
					scriptUrl,
					{ mode: "cors", credentials: "same-origin" },
					new AbortController().signal,
				);
				void pending.catch(() => undefined);
				await release.promise;
				return tree;
			},
		},
		async (input) => {
			if (input.url === scriptUrl) {
				started.resolve(input);
				await release.promise;
			}
			return response(input.url);
		},
	);
	const tab = session.createTab().id;
	const navigation = session.navigate(tab, initialUrl);
	void navigation.catch(() => undefined);
	try {
		const request = await started.promise;
		if (action === "stop") session.stop(tab);
		else session.close();
		await expect(pending).rejects.toBeDefined();
		expect(request.signal?.aborted).toBe(true);
		await expect(navigation).rejects.toBeDefined();
	} finally {
		release.resolve();
	}
});

it("revokes a pending document module dependency when its committed owner is replaced", async () => {
	const started = deferred<NetworkRequest>();
	const release = deferred<void>();
	let pending: Promise<Readonly<ScriptFetchResult>> | undefined;
	const { session } = fixture(
		{
			loadDocument(input, context) {
				if (input.url === initialUrl) {
					pending = modulePolicyFetch(context)(
						scriptUrl,
						{ mode: "cors", credentials: "same-origin" },
						new AbortController().signal,
					);
					void pending.catch(() => undefined);
				}
				return documentFixture(input, context);
			},
		},
		async (input) => {
			if (input.url === scriptUrl) {
				started.resolve(input);
				await release.promise;
			}
			return response(input.url);
		},
	);
	const tab = session.createTab().id;
	try {
		await session.navigate(tab, initialUrl);
		const request = await started.promise;
		await session.navigate(tab, "https://example.com/replacement");
		await expect(pending).rejects.toBeDefined();
		expect(request.signal?.aborted).toBe(true);
	} finally {
		release.resolve();
	}
});

it("shares the script request limit with the document module provider", async () => {
	const { session, requests } = fixture({
		limits: { maxScriptRequests: 2 },
		async loadDocument(input, context) {
			const policy = { mode: "cors", credentials: "same-origin" } as const;
			await policyFetch(context)(
				scriptUrl,
				policy,
				new AbortController().signal,
			);
			await modulePolicyFetch(context)(
				"https://example.com/module-child.js",
				policy,
				new AbortController().signal,
			);
			await expect(
				legacyFetch(context)("https://example.com/extra.js"),
			).rejects.toMatchObject({ code: "resource-limit" });
			return documentFixture(input, context);
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(requests.map((input) => input.url)).toEqual([
		initialUrl,
		scriptUrl,
		"https://example.com/module-child.js",
	]);
});

it("loads Worker entry source under worker-src while script-src denies page scripts", async () => {
	let fetch!: NonNullable<DocumentLoaderContext["fetchWorker"]>;
	const { session, requests } = fixture(
		{
			loadDocument: async (input, context) => {
				if (!context.fetchWorker) throw Error("Missing Worker provider");
				fetch = context.fetchWorker;
				return loadBrowserDocument(input, context);
			},
		},
		async (input) =>
			response(
				input.url,
				input.url === initialUrl
					? "<html><body>Worker policy fixture</body></html>"
					: "postMessage('ready');",
				{
					headers:
						input.url === initialUrl
							? {
									"content-type": ["text/html"],
									"content-security-policy": [
										"worker-src 'self'; script-src 'none'",
									],
								}
							: { "content-type": ["text/javascript"] },
				},
			),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	await expect(
		fetch(scriptUrl, new AbortController().signal),
	).resolves.toMatchObject({ url: scriptUrl, source: "postMessage('ready');" });
	expect(requests.map((input) => input.url)).toEqual([initialUrl, scriptUrl]);
});

it("enforces Worker entry policy and foreign redirects before issuing forbidden requests", async () => {
	let fetch!: NonNullable<DocumentLoaderContext["fetchWorker"]>;
	const { session, requests } = fixture(
		{
			loadDocument: async (input, context) => {
				if (!context.fetchWorker) throw Error("Missing Worker provider");
				fetch = context.fetchWorker;
				return loadBrowserDocument(input, context);
			},
		},
		async (input) =>
			response(input.url, input.url === initialUrl ? "<html></html>" : "", {
				headers:
					input.url === initialUrl
						? {
								"content-type": ["text/html"],
								"content-security-policy": [
									"worker-src 'self'; script-src 'unsafe-inline'",
								],
							}
						: { location: [crossOriginUrl] },
				status: input.url === initialUrl ? 200 : 302,
			}),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	await expect(
		fetch(crossOriginUrl, new AbortController().signal),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		fetch(scriptUrl, new AbortController().signal),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests.map((input) => input.url)).toEqual([initialUrl, scriptUrl]);
});

it("blocks Worker loading before a network request when worker-src denies it", async () => {
	let fetch!: NonNullable<DocumentLoaderContext["fetchWorker"]>;
	const { session, requests } = fixture(
		{
			loadDocument: async (input, context) => {
				if (!context.fetchWorker) throw Error("Missing Worker provider");
				fetch = context.fetchWorker;
				return loadBrowserDocument(input, context);
			},
		},
		async (input) =>
			response(input.url, "<html></html>", {
				headers: {
					"content-type": ["text/html"],
					"content-security-policy": ["worker-src 'none'; script-src 'self'"],
				},
			}),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	await expect(
		fetch(scriptUrl, new AbortController().signal),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests.map((input) => input.url)).toEqual([initialUrl]);
});
