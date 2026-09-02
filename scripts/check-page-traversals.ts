import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { documentInteractions } from "../src/interactions.js";
import { readPageConsole } from "../src/page-console.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession, type SessionLimits } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const fixtures: {
	browser: BrowserSession;
	owners: Map<DocumentTree, PageScripts>;
}[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
async function waitFor(predicate: () => boolean) {
	const deadline = performance.now() + 2000;
	while (!predicate()) {
		if (performance.now() >= deadline)
			throw new Error("Page traversal probe deadline exceeded");
		await pause();
	}
}
function fixture(limits: Partial<SessionLimits> = {}) {
	const requests: string[] = [];
	const owners = new Map<DocumentTree, PageScripts>();
	let source = "";
	const browser = new BrowserSession({
		limits,
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				const body = new TextEncoder().encode(
					`<h1 id="status">Ready</h1><script>${source}</script>`,
				);
				return {
					url: input.url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response, context) =>
			loadBrowserDocument(response, {
				...context,
				scripts: new ScriptLoader({
					response,
					signal: context.signal,
					owner: (tree) => {
						const owner = new PageScripts(
							{ document: tree, interactions: documentInteractions(tree) },
							core,
						);
						owners.set(tree, owner);
						return owner;
					},
				}),
			}),
	});
	const tab = browser.createTab().id;
	const result = {
		browser,
		tab,
		owners,
		requests,
		source(value: string) {
			source = value;
		},
		stats: () => browser.metrics().pageTraversals[0],
		async evaluate(text: string) {
			const owner = owners.get(browser.page(tab).document);
			if (!owner) throw new Error("Missing page owner");
			const result = await owner.evaluate(text);
			if (!result.ok)
				throw new Error(`Traversal evaluation failed: ${result.error?.code}`);
			return result.value;
		},
	};
	fixtures.push(result);
	return result;
}
try {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://fixture.invalid/first");
	const initial = test.browser.page(test.tab).document;
	check(
		"Interpreted back queues traversal and returns before changing history state",
		(await test.evaluate(
			'history.pushState(1, "", "#one"); history.pushState(2, "", "#two"); window.addEventListener("popstate", function(event) { document.querySelector("#status").textContent = "state:" + event.state; }); var result = history.go("-1"); return result === undefined && history.state === 2;',
		)) === true,
	);
	await waitFor(() => test.stats().completed === 1);
	check(
		"The queued traversal updates the same document and runs interpreted popstate",
		(await test.evaluate(
			'return history.state === 1 && document.querySelector("#status").textContent === "state:1";',
		)) === true &&
			test.requests.length === 1 &&
			test.browser.page(test.tab).document === initial,
	);
	await test.evaluate("history.forward(); return true;");
	await waitFor(() => test.stats().completed === 2);
	check(
		"Interpreted forward restores the next state without a fetch",
		(await test.evaluate("return history.state === 2;")) === true &&
			test.requests.length === 1,
	);
	test.source(
		'document.querySelector("#status").textContent = "restored:" + history.state;',
	);
	check(
		"Interpreted go() returns undefined while requesting reload",
		(await test.evaluate("return history.go() === undefined;")) === true,
	);
	await waitFor(() => test.stats().completed === 3);
	check(
		"Reload creates a new realm with restored state before parser scripts",
		(await test.evaluate(
			'return history.state === 2 && document.querySelector("#status").textContent === "restored:2";',
		)) === true &&
			test.browser.page(test.tab).document !== initial &&
			test.owners.get(initial)?.closed === true,
	);
	test.source(
		'if (location.pathname === "/second") { history.back(); document.querySelector("#status").textContent = "queued"; }',
	);
	await test.browser.navigate(test.tab, "https://fixture.invalid/second");
	check(
		"Parser-requested traversal waits for its document to commit",
		test.browser.page(test.tab).document.url ===
			"https://fixture.invalid/second",
	);
	await waitFor(() => test.stats().completed === 4);
	check(
		"Parser-requested back crosses document boundaries through the session",
		test.browser.page(test.tab).document.url ===
			"https://fixture.invalid/first#two" &&
			(await test.evaluate("return history.state === 2;")) === true,
	);
	const beforeStop = test.requests.length;
	await test.evaluate("history.go(); return true;");
	test.browser.stop(test.tab);
	await pause();
	check(
		"Stop cancels queued guest work before another request",
		test.requests.length === beforeStop && test.stats().canceled === 1,
	);
	await test.evaluate("history.back(); return true;");
	test.source("");
	await test.browser.navigate(test.tab, "https://fixture.invalid/manual");
	await pause();
	check(
		"Explicit agent navigation supersedes already queued page traversal",
		test.browser.page(test.tab).document.url ===
			"https://fixture.invalid/manual" && test.stats().canceled === 2,
	);
	const limited = fixture({ maxNavigations: 1 });
	await limited.browser.navigate(
		limited.tab,
		"https://fixture.invalid/private?token=fixture",
	);
	const current = limited.browser.page(limited.tab).document;
	await limited.evaluate("history.go(); return true;");
	await waitFor(() => limited.stats().failed === 1);
	const errors = readPageConsole(current, "error").entries;
	check(
		"Failed asynchronous traversal preserves the old page and makes no forbidden request",
		limited.browser.page(limited.tab).document === current &&
			limited.requests.length === 1 &&
			limited.stats().last?.code === "resource-limit",
	);
	check(
		"Traversal failure diagnostics expose a sanitized code, not private URL data",
		errors.some(
			(entry) =>
				entry.source === "navigation" &&
				entry.text === "Page navigation failed: resource-limit",
		) && !JSON.stringify(errors).includes("token"),
	);
	const location = fixture();
	await location.browser.navigate(
		location.tab,
		"https://fixture.invalid/first",
	);
	const original = location.browser.page(location.tab).document;
	check(
		"Interpreted Location hash writes update URL and history synchronously",
		(await location.evaluate(
			'window.addEventListener("hashchange", function(event) { document.querySelector("#status").textContent = event.oldURL + " -> " + event.newURL; }); location.hash = "first"; return location.hash === "#first" && history.length === 2 && document.querySelector("#status").textContent === "Ready";',
		)) === true,
	);
	await waitFor(() => location.stats().completed === 1);
	check(
		"Deferred interpreted hashchange observes captured old and new URLs without fetching",
		(await location.evaluate(
			'return document.querySelector("#status").textContent === "https://fixture.invalid/first -> https://fixture.invalid/first#first";',
		)) === true && location.requests.length === 1,
	);
	check(
		"Window Location assignment queues session navigation and returns to its caller",
		(await location.evaluate(
			'window.location = "/second"; return location.pathname === "/first";',
		)) === true,
	);
	await waitFor(() => location.stats().completed === 2);
	check(
		"Window Location assignment commits a fresh document and retires the old owner",
		location.browser.page(location.tab).document.url ===
			"https://fixture.invalid/second" &&
			original !== location.browser.page(location.tab).document &&
			location.owners.get(original)?.closed === true,
	);
	await location.evaluate(
		'history.replaceState({ saved: true }, ""); location.reload(); return true;',
	);
	await waitFor(() => location.stats().completed === 3);
	check(
		"Location reload restores history state before creating the new realm",
		(await location.evaluate(
			"return history.state.saved === true && history.length === 3;",
		)) === true,
	);
	await location.browser.back(location.tab);
	await location.evaluate('location.replace("/replacement"); return true;');
	await waitFor(() => location.stats().completed === 4);
	check(
		"Location replace preserves adjacent backward and forward entries",
		JSON.stringify(
			location.browser.history(location.tab).entries.map((entry) => entry.url),
		) ===
			JSON.stringify([
				"https://fixture.invalid/first",
				"https://fixture.invalid/replacement",
				"https://fixture.invalid/second",
			]),
	);
	await location.evaluate(
		'document.location = "/document-write"; return true;',
	);
	await waitFor(() => location.stats().completed === 5);
	check(
		"Document Location assignment uses the same owned navigation path",
		location.browser.page(location.tab).document.url ===
			"https://fixture.invalid/document-write",
	);
	await location.evaluate('location.search = "next=1"; return true;');
	await waitFor(() => location.stats().completed === 6);
	check(
		"Interpreted Location component writes navigate with the resolved URL",
		location.browser.page(location.tab).document.url ===
			"https://fixture.invalid/document-write?next=1",
	);
	location.source(
		'if (location.pathname === "/parser") { location.assign("/landing"); }',
	);
	await location.browser.navigate(
		location.tab,
		"https://fixture.invalid/parser",
	);
	await waitFor(() => location.stats().completed === 7);
	check(
		"Parser-time Location assignment waits for commit and replaces the loading entry",
		location.browser.page(location.tab).document.url ===
			"https://fixture.invalid/landing" &&
			!location.browser
				.history(location.tab)
				.entries.some((entry) => entry.url.endsWith("/parser")),
	);
	await limited.evaluate(
		'location.assign("/location?private=secret"); return true;',
	);
	await waitFor(() => limited.stats().failed === 2);
	check(
		"Asynchronous Location failures preserve the owner and sanitize navigation diagnostics",
		limited.browser.page(limited.tab).document === current &&
			limited.requests.length === 1 &&
			limited.stats().last?.kind === "navigate" &&
			!JSON.stringify(limited.stats()).includes("secret") &&
			!JSON.stringify(readPageConsole(current).entries).includes("secret"),
	);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"Existing experimental SafeJS, actual parser/DOM/history/events and session-owned task queue over in-memory transport. No public site, socket, server, PTY, service activation or released-SDK migration.",
				checks,
			},
			null,
			2,
		),
	);
} finally {
	for (const test of fixtures) test.browser.close();
	await Promise.all(
		fixtures.flatMap((test) =>
			[...test.owners.values()].map((owner) => owner.close()),
		),
	);
}
