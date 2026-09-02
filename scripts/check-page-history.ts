import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { documentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const requests: string[] = [];
let source =
	'document.querySelector("#status").textContent = history.length + ":" + history.state; history.replaceState({step: 1}, "");';
const browser = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests.push(input.url);
			const body = new TextEncoder().encode(
				`<h1 id="status">Waiting</h1><script>${source}</script>`,
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
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
try {
	const tab = browser.createTab().id;
	const evaluate = async (text: string) => {
		const owner = owners.get(browser.page(tab).document);
		if (!owner) throw new Error("Missing page owner");
		const result = await owner.evaluate(text);
		if (!result.ok)
			throw new Error(`History evaluation failed: ${result.error?.code}`);
		return result.value;
	};
	await browser.navigate(tab, "https://fixture.invalid/first");
	check(
		"Parser-time interpreted code reads initialized History and changes its state",
		(await evaluate(
			'return document.querySelector("#status").textContent === "1:null" && history.state.step === 1;',
		)) === true,
	);
	check(
		"Global History and Window History share their page-owned identity",
		(await evaluate("return history === window.history;")) === true,
	);
	check(
		"Interpreted pushState updates the real document URL and session history",
		(await evaluate(
			'var original = {step: 2}; var result = history.pushState(original, "", "?entry#two"); original.step = 99; return result === undefined && location.search === "?entry" && history.length === 2 && history.state.step === 2;',
		)) === true &&
			browser.history(tab).length === 2 &&
			requests.length === 1,
	);
	check(
		"State reads cannot mutate retained history state",
		(await evaluate(
			"var detached = history.state; detached.step = 88; return history.state.step === 2;",
		)) === true,
	);
	check(
		"Foreign-origin state URLs are rejected without changing document state",
		(await evaluate(
			'try { history.replaceState({bad: true}, "", "https://foreign.invalid/"); return false; } catch (error) { return history.state.step === 2 && location.hostname === "fixture.invalid"; }',
		)) === true,
	);
	await evaluate(
		'var events = []; window.addEventListener("popstate", function(event) { events.push("pop:" + event.state.step); document.querySelector("#status").textContent = "pop:" + event.state.step; }); window.addEventListener("hashchange", function(event) { events.push("hash:" + event.oldURL + ":" + event.newURL); });',
	);
	await browser.go(tab, -1);
	check(
		"Same-document traversal runs interpreted popstate before hashchange with event data",
		(await evaluate(
			'return events.length === 2 && events[0] === "pop:1" && events[1] === "hash:https://fixture.invalid/first?entry#two:https://fixture.invalid/first" && document.querySelector("#status").textContent === "pop:1";',
		)) === true,
	);
	await browser.go(tab, 1);
	check(
		"Forward traversal restores the original state without another request",
		(await evaluate(
			"return history.state.step === 2 && history.length === 2;",
		)) === true && requests.length === 1,
	);
	source =
		'document.querySelector("#status").textContent = history.length + ":" + history.state; history.replaceState({second: true}, "");';
	await browser.navigate(tab, "https://fixture.invalid/second");
	check(
		"A new document sees session-wide history length, not its local entry count",
		(await evaluate(
			'return history.length === 3 && document.querySelector("#status").textContent === "3:null";',
		)) === true,
	);
	source =
		'document.querySelector("#status").textContent = history.state.second + ":" + history.length; history.replaceState({reloaded: true}, "", "?reloaded");';
	await browser.reload(tab);
	check(
		"Reload restores state before interpreted parser scripts run",
		(await evaluate(
			'return document.querySelector("#status").textContent === "true:3" && history.state.reloaded && location.search === "?reloaded";',
		)) === true && browser.history(tab).length === 3,
	);
	source =
		'document.querySelector("#status").textContent = history.state.step + ":" + history.length; history.pushState({branch: true}, "", "#branch");';
	await browser.go(tab, -1);
	check(
		"Cross-document traversal restores state before scripts create a new history branch",
		(await evaluate(
			'return document.querySelector("#status").textContent === "2:3" && history.state.branch && history.length === 3;',
		)) === true,
	);
	check(
		"Parser-created history branches remove obsolete forward documents",
		browser
			.history(tab)
			.entries.every((entry) => !entry.url.includes("/second")) &&
			browser.history(tab).entries.at(-1)?.url ===
				"https://fixture.invalid/first?entry#branch",
	);
	check(
		"Guest traversal returns without exposing a host promise",
		(await evaluate("return history.back() === undefined;")) === true,
	);
	browser.stop(tab);
	check(
		"Retired page realms are closed after document replacement",
		[...owners]
			.filter(([tree]) => tree !== browser.page(tab).document)
			.every(([, owner]) => owner.closed),
	);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"Existing experimental SafeJS core with actual parser, DOM, history, callbacks and browser-session code. All responses use an in-memory transport; no public site, actual network, PTY, service or released-SDK migration.",
				checks,
			},
			null,
			2,
		),
	);
} finally {
	browser.close();
	await Promise.all([...owners.values()].map((owner) => owner.close()));
}
