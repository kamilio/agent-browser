import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { documentInteractions } from "../src/interactions.js";
import type { NetworkRequest, NetworkResponse } from "../src/network.js";
import type { PageFetchTransport } from "../src/page-fetch.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const requests: NetworkRequest[] = [];
let pendingStarted!: () => void;
const startedPending = new Promise<void>((resolve) => {
	pendingStarted = resolve;
});
let closed = false;
const html =
	'<h1 id="status">Loading fixture</h1><script src="/app.js"></script>';
const source =
	'var task = fetch("/api/data?token=fixture").then(function (response) { if (!response.ok) throw new Error("bad response"); return response.json(); }).then(function (data) { document.querySelector("#status").textContent = data.title; return data.title; });';
const browser = new BrowserSession({
	createTransport: () => ({
		request: async (input): Promise<NetworkResponse> => {
			requests.push(input);
			const path = new URL(input.url).pathname;
			if (path === "/api/pending") {
				pendingStarted();
				return new Promise<NetworkResponse>(() => {});
			}
			const text =
				path === "/app.js"
					? source
					: path === "/api/data" || path === "/cors"
						? '{"title":"Loaded by interpreted fetch"}'
						: html;
			const body = new TextEncoder().encode(text);
			return {
				url: input.url,
				status:
					input.method === "OPTIONS"
						? 204
						: path === "/route-redirect"
							? 302
							: 200,
				headers: {
					...(path === "/route-redirect"
						? { location: ["https://api.fixture.invalid/routed"] }
						: {}),
					...(path === "/cors" || path === "/route-redirect"
						? {
								"access-control-allow-origin": ["*"],
								"access-control-allow-methods": ["PUT"],
								"access-control-allow-headers": ["content-type"],
							}
						: {}),
					"content-type": [
						path === "/app.js"
							? "text/javascript"
							: path === "/api/data" || path === "/cors"
								? "application/json"
								: "text/html;charset=utf-8",
					],
					"set-cookie": ["private=not-exposed"],
				},
				body,
				encodedBytes: body.length,
				elapsedMs: 0,
				redirects: [],
			};
		},
		metrics: () => ({
			requests: requests.length,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			active: 0,
			closed,
		}),
		close: () => {
			closed = true;
		},
	}),
	loadDocument: (response, context) =>
		loadBrowserDocument(response, {
			...context,
			scripts: new ScriptLoader({
				response,
				signal: context.signal,
				fetch: context.fetchScript,
				fetchWithPolicy: context.fetchScriptWithPolicy,
				owner: (document) => ownerFor(document, context.fetch),
			}),
		}),
});
function ownerFor(document: DocumentTree, fetch?: PageFetchTransport) {
	let owner = owners.get(document);
	if (!owner) {
		owner = new PageScripts(
			{ document, interactions: documentInteractions(document) },
			core,
			{ fetch },
		);
		owners.set(document, owner);
	}
	return owner;
}

try {
	const tab = browser.createTab().id;
	await browser.navigate(tab, "https://fixture.invalid/");
	const page = browser.page(tab);
	const owner = ownerFor(page.document, page.fetch);
	const result = await owner.evaluate("return await task;");
	check(
		"Actual interpreted Promise callbacks receive fetch JSON",
		result.ok && result.value === "Loaded by interpreted fetch",
	);
	check(
		"The interpreted fetch callback updates the retained semantic document",
		browser
			.snapshot(tab)
			.entries.some((entry) => entry.name === "Loaded by interpreted fetch"),
	);
	check(
		"One document, script and fetch request are recorded by the same session",
		browser
			.requests(tab)
			.entries.map((entry) => entry.kind)
			.join(",") === "document,script,fetch",
	);
	check(
		"Request diagnostics omit query secrets",
		!JSON.stringify(browser.requests(tab)).includes("token=fixture"),
	);
	const headers = await owner.evaluate(
		'var response = await window.fetch("/api/data"); return response.headers.get("set-cookie");',
	);
	check(
		"Response header capabilities do not expose Set-Cookie",
		headers.ok && headers.value === null,
	);
	const before = requests.length;
	const denied = await owner.evaluate(
		'try { await fetch("https://other.invalid/data", {mode: "same-origin"}); return false; } catch (error) { return true; }',
	);
	check(
		"Explicit same-origin mode rejects before the mock transport is invoked",
		denied.ok && denied.value === true && requests.length === before,
	);
	const consumed = await owner.evaluate(
		"var body = await response.text(); try { await response.json(); return false; } catch (error) { return body.length > 0; }",
	);
	check(
		"Response bodies are consumed once across real realm evaluations",
		consumed.ok && consumed.value === true,
	);
	const cors = await owner.evaluate(
		'var corsResponse = await fetch("https://api.fixture.invalid/cors", {method: "PUT", headers: {"Content-Type": "application/json"}, body: "{}"}); var corsData = await corsResponse.json(); document.querySelector("#status").textContent = "CORS: " + corsData.title; return corsResponse.type;',
	);
	check(
		"Real SafeJS reads permitted cross-origin JSON after a preflight",
		cors.ok && cors.value === "cors",
	);
	check(
		"Cross-origin JSON updates the same live DOM",
		browser
			.snapshot(tab)
			.entries.some(
				(entry) => entry.name === "CORS: Loaded by interpreted fetch",
			),
	);
	const preflight = requests.find((request) => request.method === "OPTIONS");
	check(
		"Cross-origin preflight has no credentials or request body",
		preflight?.cookieContext?.credentials === "omit" &&
			preflight.body === undefined,
	);
	const beforeDenied = requests.length;
	const corsDenied = await owner.evaluate(
		'try { await fetch("https://api.fixture.invalid/cors-denied", {method: "DELETE"}); return false; } catch (error) { return true; }',
	);
	check(
		"Denied preflight never sends the requested DELETE",
		corsDenied.ok &&
			corsDenied.value === true &&
			requests.length === beforeDenied + 1 &&
			requests.at(-1)?.method === "OPTIONS",
	);
	check(
		"The real session distinguishes preflight diagnostics",
		browser.requests(tab).entries.filter((entry) => entry.kind === "preflight")
			.length === 2,
	);
	check(
		"The real session separates CORS decisions from successful HTTP statuses",
		JSON.stringify(
			browser
				.requests(tab)
				.entries.filter((entry) => entry.cors)
				.map((entry) => entry.cors),
		) === JSON.stringify(["allowed", "allowed", "blocked"]) &&
			browser.requests(tab).entries.at(-1)?.state === "complete" &&
			browser.requests(tab).entries.at(-1)?.status === 204,
	);
	const routed = browser.routes.add("**/routed", {
		body: '{"title":"Loaded from a route"}',
		contentType: "application/json",
		headers: { "access-control-allow-origin": "*" },
	});
	const beforeRoute = requests.length;
	const routedResult = await owner.evaluate(
		'var routedResponse = await fetch("https://api.fixture.invalid/routed"); var routedData = await routedResponse.json(); document.querySelector("#status").textContent = routedData.title; return routedData.title;',
	);
	check(
		"Real SafeJS consumes a routed CORS response without calling the transport",
		routedResult.ok &&
			routedResult.value === "Loaded from a route" &&
			requests.length === beforeRoute,
	);
	check(
		"The session identifies mocked responses and retains the CORS check",
		browser.requests(tab).entries.at(-1)?.routeId === routed.id &&
			browser.requests(tab).entries.at(-1)?.cors === "allowed",
	);
	const routedRedirect = await owner.evaluate(
		'var redirectedRoute = await fetch("https://api.fixture.invalid/route-redirect"); var redirectedData = await redirectedRoute.json(); return redirectedRoute.redirected && redirectedData.title === "Loaded from a route";',
	);
	check(
		"Page fetch checks routes on manual redirect hops without sending the mocked target",
		routedRedirect.ok &&
			routedRedirect.value === true &&
			requests.length === beforeRoute + 1 &&
			browser.requests(tab).entries.at(-1)?.routeId === routed.id,
	);
	const redirectRoute = browser.routes.add("**/mock-hop", {
		status: 302,
		headers: {
			location: "https://api.fixture.invalid/routed",
			"access-control-allow-origin": "*",
		},
	});
	const beforeMockedRedirect = requests.length;
	const mockedRedirect = await owner.evaluate(
		'var mockHop = await fetch("https://api.fixture.invalid/mock-hop"); var mockHopData = await mockHop.json(); return mockHop.redirected && mockHopData.title === "Loaded from a route";',
	);
	check(
		"Interpreted fetch follows a fully mocked redirect without calling the transport",
		mockedRedirect.ok &&
			mockedRedirect.value === true &&
			requests.length === beforeMockedRedirect,
	);
	check(
		"Both mocked redirect hops retain route identity and CORS observations",
		JSON.stringify(
			browser
				.requests(tab)
				.entries.slice(-2)
				.map((entry) => [entry.routeId, entry.cors]),
		) ===
			JSON.stringify([
				[redirectRoute.id, "allowed"],
				[routed.id, "allowed"],
			]),
	);
	const mockedRedirectError = await owner.evaluate(
		'try { await fetch("https://api.fixture.invalid/mock-hop", {redirect: "error"}); return false; } catch (error) { return true; }',
	);
	check(
		"Interpreted fetch rejects a mocked redirect in error mode without transport fallback",
		mockedRedirectError.ok &&
			mockedRedirectError.value === true &&
			requests.length === beforeMockedRedirect,
	);
	const mockedRedirectManual = await owner.evaluate(
		'var manualHop = await fetch("https://api.fixture.invalid/mock-hop", {redirect: "manual"}); return manualHop.type === "opaqueredirect" && manualHop.status === 0;',
	);
	check(
		"Interpreted fetch exposes a filtered manual mocked redirect",
		mockedRedirectManual.ok &&
			mockedRedirectManual.value === true &&
			requests.length === beforeMockedRedirect,
	);
	browser.routes.remove("**/routed");
	const beforeRemoval = requests.length;
	const afterRemoval = await owner.evaluate(
		'try { await fetch("https://api.fixture.invalid/routed"); return false; } catch (error) { return true; }',
	);
	check(
		"Unroute restores the ordinary transport and its CORS policy",
		afterRemoval.ok &&
			afterRemoval.value === true &&
			requests.length === beforeRemoval + 1 &&
			browser.requests(tab).entries.at(-1)?.routeId === undefined,
	);
	const pending = owner.evaluate('return await fetch("/api/pending");').then(
		() => "settled",
		() => "rejected",
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			startedPending,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Pending fetch did not start")),
					2000,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
	check(
		"A real interpreted fetch can own a pending mocked network request",
		owner.network?.metrics().active === 1,
	);
	await owner.close();
	await pending;
	check(
		"Closing the page aborts pending interpreted fetch work without transport cooperation",
		requests.at(-1)?.signal?.aborted === true,
	);
	check(
		"Closing the real page owner releases fetch bodies and requests",
		owner.network?.metrics().closed === true &&
			owner.network.metrics().retainedBytes === 0 &&
			owner.network.metrics().active === 0,
	);
} catch (error) {
	checks.push({
		label: error instanceof Error ? error.message : "Page fetch probe failed",
		passed: false,
	});
} finally {
	browser.close();
	await Promise.all([...owners.values()].map((owner) => owner.close()));
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Actual explicitly selected SafeJS core, parsed HTML and interpreted asynchronous callbacks with an in-memory mock transport. No HTTP server, public network, PTY, child process or browser service is started. Not a substitute for denied live acceptance gates.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((entry) => !entry.passed)) process.exitCode = 1;
