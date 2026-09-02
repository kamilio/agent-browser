import { readFile } from "node:fs/promises";
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
const html = await readFile(
	new URL("../../fixtures/storage-todos.html", import.meta.url),
	"utf8",
);
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
function fixture() {
	const owners = new Map<DocumentTree, PageScripts>();
	let requests = 0;
	const browser = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests++;
				const body = new TextEncoder().encode(html);
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
				requests,
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
	fixtures.push({ browser, owners });
	const tab = browser.createTab().id;
	return {
		browser,
		tab,
		owners,
		async evaluate(source: string, target = tab) {
			const owner = owners.get(browser.page(target).document);
			if (!owner) throw new Error("Missing storage page owner");
			const result = await owner.evaluate(source);
			if (!result.ok)
				throw new Error(`Storage evaluation failed: ${result.error?.code}`);
			return result.value;
		},
		async click(selector: string) {
			const page = browser.page(tab);
			const target = page.queries.querySelector(selector);
			if (target === null) throw new Error("Missing action target");
			return browser.click(tab, page.document.reference(target));
		},
		async add(label: string) {
			const page = browser.page(tab);
			const target = page.queries.querySelector("#new-todo");
			if (target === null) throw new Error("Missing todo input");
			await page.interactions.fillAsync(page.document.reference(target), label);
			await this.click("#add-todo");
		},
		requests: () => requests,
		async flushStorageEvents() {
			const deadline = performance.now() + 2000;
			while (
				browser.metrics().storageEvents.pending ||
				browser.metrics().storageEvents.active
			) {
				if (performance.now() >= deadline)
					throw new Error("Storage event probe deadline exceeded");
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
			}
			if (browser.metrics().storageEvents.failed)
				throw new Error("Storage event dispatch failed");
		},
	};
}

try {
	const test = fixture();
	test.browser.cookies.setCookie(
		"https://fixture.invalid/",
		"server=hidden; HttpOnly; Secure; Path=/",
		{ siteUrl: "https://fixture.invalid/" },
	);
	await test.browser.navigate(test.tab, "https://fixture.invalid/todos");
	check(
		"Parser-time interpreted application reads local storage and increments session visits",
		(await test.evaluate(
			'return document.getElementById("status").textContent === "0 todos; visit 1";',
		)) === true,
	);
	check(
		"Global and Window storage aliases have stable per-realm identity",
		(await test.evaluate(
			"return localStorage === window.localStorage && sessionStorage === window.sessionStorage && localStorage !== sessionStorage;",
		)) === true,
	);
	await test.add("Write tests");
	await test.add("Read docs");
	check(
		"Agent fill/click drives interpreted submit handlers and saves real native storage",
		test.browser.storage
			.localStorage(test.tab, "https://fixture.invalid/")
			.getItem("agent-todos") ===
			'[{"label":"Write tests","done":false},{"label":"Read docs","done":false}]' &&
			test.requests() === 1,
	);
	await test.click("#toggle-0");
	check(
		"Agent click toggles stored state and the live DOM",
		(await test.evaluate(
			'return JSON.parse(localStorage.getItem("agent-todos"))[0].done === true && document.querySelector("#todos li span").textContent === "Write tests (done)";',
		)) === true,
	);
	const original = test.browser.page(test.tab).document;
	await test.browser.reload(test.tab);
	check(
		"Reload restores rendered application data before parser completion",
		(await test.evaluate(
			'return document.getElementById("status").textContent === "2 todos; visit 2" && document.querySelector("#todos li span").textContent === "Write tests (done)";',
		)) === true && test.owners.get(original)?.closed === true,
	);
	await test.click("#remove-1");
	check(
		"Agent removal updates both stored state and the rendered list",
		(await test.evaluate(
			'return JSON.parse(localStorage.getItem("agent-todos")).length === 1 && document.querySelectorAll("#todos li").length === 1;',
		)) === true,
	);
	check(
		"Interpreted cookie writes cannot read or replace HttpOnly values",
		(await test.evaluate(
			'document.cookie = "server=attacker; Path=/; Secure"; document.cookie = "visible=page; Path=/; Secure"; return document.cookie === "visible=page";',
		)) === true &&
			test.browser.cookies.cookieHeader("https://fixture.invalid/", {
				siteUrl: "https://fixture.invalid/",
			}) === "server=hidden; visible=page",
	);
	check(
		"Interpreted Storage methods preserve primitive values and reject missing arguments",
		(await test.evaluate(
			'localStorage.setItem("__proto__", 42); localStorage.setItem(null, undefined); var rejected = false; try { localStorage.setItem("missing"); } catch (error) { rejected = true; } return rejected && localStorage.getItem("__proto__") === "42" && localStorage.getItem(null) === "undefined";',
		)) === true,
	);
	const namedPropertyObservation = await test.evaluate(
		'var namedThrew = false; try { localStorage.unsupportedNamedKey = "value"; } catch (error) { namedThrew = true; } return { threw: namedThrew, persisted: localStorage.getItem("unsupportedNamedKey"), lookup: localStorage.unsupportedNamedKey };',
	);
	if (
		(await test.evaluate(
			'return localStorage.getItem("unsupportedNamedKey") === null;',
		)) !== true
	)
		throw new Error(
			"Named storage behavior changed; reassess the unsupported capability before publishing evidence",
		);
	const other = test.browser.createTab().id;
	await test.browser.navigate(other, "https://fixture.invalid/other");
	check(
		"Same-origin tabs share persisted todos but have independent session counters",
		(await test.evaluate(
			'return document.getElementById("status").textContent === "1 todos; visit 1";',
			other,
		)) === true,
	);
	const child = test.browser.createTab({ opener: test.tab }).id;
	await test.evaluate(
		'var receivedStorage = []; window.addEventListener("storage", function(event) { receivedStorage.push({ key: event.key, oldValue: event.oldValue, newValue: event.newValue, url: event.url, local: event.storageArea === localStorage, bubbles: event.bubbles, cancelable: event.cancelable }); });',
	);
	await test.evaluate(
		'var receivedStorage = []; window.addEventListener("storage", function(event) { receivedStorage.push({ key: event.key, oldValue: event.oldValue, newValue: event.newValue, url: event.url, local: event.storageArea === localStorage, bubbles: event.bubbles, cancelable: event.cancelable }); });',
		other,
	);
	check(
		"Storage mutation is immediate but cross-tab interpreted event callbacks are deferred",
		(await test.evaluate(
			'history.replaceState(null, "", "?source=live"); localStorage.setItem("shared-event", "one"); localStorage.setItem("shared-event", "one"); localStorage.setItem("shared-event", "two"); localStorage.removeItem("shared-event"); return receivedStorage.length === 0;',
		)) === true,
	);
	await test.flushStorageEvents();
	check(
		"The receiving realm gets captured changes, source URL and its own storageArea identity",
		(await test.evaluate(
			'return receivedStorage.length === 3 && receivedStorage[0].oldValue === null && receivedStorage[0].newValue === "one" && receivedStorage[1].oldValue === "one" && receivedStorage[1].newValue === "two" && receivedStorage[2].newValue === null && receivedStorage[0].url === "https://fixture.invalid/todos?source=live" && receivedStorage[0].local === true && receivedStorage[0].bubbles === false && receivedStorage[0].cancelable === false;',
			other,
		)) === true,
	);
	check(
		"Page storage writes never dispatch storage events to their own originating realm",
		(await test.evaluate("return receivedStorage.length === 0;")) === true,
	);
	const beforeUpdateRequests = test.requests();
	await test.add("Cross-tab update");
	await test.flushStorageEvents();
	check(
		"Agent changes rerender a second tab through its interpreted storage listener without reloading",
		(await test.evaluate(
			'return document.querySelectorAll("#todos li").length === 2 && document.getElementById("status").textContent === "2 todos; visit 1";',
			other,
		)) === true && test.requests() === beforeUpdateRequests,
	);
	await test.evaluate(
		'sessionStorage.setItem("only-this-tab", "private"); return true;',
	);
	await test.flushStorageEvents();
	check(
		"Session-storage writes do not notify or modify a different tab",
		(await test.evaluate(
			'return receivedStorage.length === 4 && sessionStorage.getItem("only-this-tab") === null;',
			other,
		)) === true,
	);
	await test.browser.navigate(child, "https://fixture.invalid/child");
	check(
		"Opener session state is copied once and subsequent writes are independent",
		(await test.evaluate(
			'return sessionStorage.getItem("visits") === "3";',
			child,
		)) === true &&
			(await test.evaluate(
				'return sessionStorage.getItem("visits") === "2";',
			)) === true,
	);
	await test.browser.navigate(other, "https://other.invalid/");
	check(
		"Cross-origin navigation cannot see the previous origin's storage or cookies",
		(await test.evaluate(
			'return localStorage.getItem("agent-todos") === null && document.cookie === "" && sessionStorage.getItem("visits") === "1";',
			other,
		)) === true,
	);
	const isolated = fixture();
	await isolated.browser.navigate(isolated.tab, "https://fixture.invalid/");
	check(
		"Independent browser sessions do not share interpreted storage or cookies",
		(await isolated.evaluate(
			'return localStorage.getItem("agent-todos") === null && document.cookie === "";',
		)) === true,
	);
	await test.evaluate(
		'var externalSessionEvent = false; window.addEventListener("storage", function(event) { if (event.key === "external-session") externalSessionEvent = event.storageArea === sessionStorage && event.newValue === "host-update"; });',
	);
	test.browser.storage
		.sessionStorage(test.tab, "https://fixture.invalid/native-state")
		.setItem("external-session", "host-update");
	await test.flushStorageEvents();
	check(
		"External native session writes notify the page with its sessionStorage identity",
		(await test.evaluate("return externalSessionEvent === true;")) === true,
	);
	await test.evaluate(
		'var clearedStorage = false; window.addEventListener("storage", function(event) { if (event.key === null) clearedStorage = event.oldValue === null && event.newValue === null && event.storageArea === localStorage; });',
		child,
	);
	await test.evaluate("localStorage.clear(); return true;");
	await test.flushStorageEvents();
	check(
		"Clear broadcasts null event fields and rerenders another tab from the emptied store",
		(await test.evaluate(
			'return clearedStorage === true && document.querySelectorAll("#todos li").length === 0;',
			child,
		)) === true,
	);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"Existing experimental SafeJS; self-authored storage-backed application; actual parser, DOM, interpreted submit/click handlers, agent input, reload and native session stores over in-memory responses. No public site, network socket, PTY, service or released-SDK migration. Named properties are characterized as an unsupported gap, not counted as web Storage conformance.",
				namedPropertyObservation,
				checks,
			},
			null,
			2,
		),
	);
} finally {
	for (const fixture of fixtures) fixture.browser.close();
	await Promise.all(
		fixtures.flatMap((fixture) =>
			[...fixture.owners.values()].map((owner) => owner.close()),
		),
	);
}
