import { DocumentTree } from "../src/document.js";
import { BrowserEvent } from "../src/events.js";
import { DocumentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import type { PageRuntime } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import type { ReleasedCore } from "../src/safejs-extension-types.js";

// Authorized offline SafeJS check, separate from native-tests.json.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js node dist/scripts/check-window-load.js
// Uses the actual classic Script adapter with a deliberately small reference quota.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!root) throw new Error("Select the compiled SDK explicitly");
const { factory } = await loadPageRuntime(
	root,
	{
		adapter: "extension",
		runtimeOptions: {
			classicScripts: true,
			callbackScheduling: "after-prefix",
		},
	},
	{
		async importModule(specifier) {
			const core = (await import(specifier)) as ReleasedCore;
			return {
				...core,
				createRealm: (options: Parameters<ReleasedCore["createRealm"]>[0]) =>
					core.createRealm({
						...options,
						limits: { ...options.limits, guestReferences: 32 },
					}),
			};
		},
	},
);
const document = new DocumentTree("https://fixture.invalid/window-load");
const interactions = new DocumentInteractions(document);
let runtime: PageRuntime | undefined;
const page = new PageScripts(
	{ document, interactions },
	{
		...factory,
		createPageRuntime(options) {
			runtime = factory.createPageRuntime(options);
			return runtime;
		},
	},
	{ budgetProfile: "application-v1", limits: { timeoutMs: 16000 } },
);
const checks: string[] = [];
let cleaned = false;
async function check(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	checks.push(label);
}
async function dispatch() {
	await interactions.events.dispatchEventAsync(
		interactions.events.windowTarget as number,
		new BrowserEvent("load"),
	);
}
try {
	await check(
		"Object assignment preserves identity without reading its properties",
		`
		var order = []; var receivers = [];
		var inert = { get handleEvent() { throw new Error("Unexpected object inspection"); } };
		window.addEventListener("load", function() { order.push("before"); });
		window.onload = inert;
		window.addEventListener("load", function() { order.push("after"); });
		if (window.onload !== inert || onload !== inert) throw new Error("Object identity changed");
	`,
	);
	await dispatch();
	await check(
		"Inert objects do not run as load callbacks",
		`
		if (order.join(",") !== "before,after") throw new Error("Inert handler ran");
		order = [];
		var handler = function(event) { order.push(event.type); receivers.push(this === window, event.target === window); };
		window.onload = handler;
		if (window.onload !== handler) throw new Error("Function identity changed");
	`,
	);
	await dispatch();
	await check(
		"Replacement keeps listener order and the Window receiver",
		`
		if (order.join(",") !== "before,load,after" || receivers.join(",") !== "true,true") throw new Error("Load dispatch changed");
		order = []; window.onload = Symbol("ignored");
		if (window.onload !== null) throw new Error("Primitive handler retained");
	`,
	);
	await dispatch();
	await check(
		"Clearing removes the handler",
		`
		if (order.join(",") !== "before,after") throw new Error("Cleared handler ran");
	`,
	);
	await check(
		"Replacements and rejected extra arguments release bounded references",
		`
		for (var i = 0; i < 64; i++) {
			window.onload = inert;
			window.onload = {};
			window.onload = null;
			try { __agentBrowserWindowGlobal.writeEventObject("onload", {}, {}); }
			catch (error) { continue; }
			throw new Error("Extra handler arguments accepted");
		}
		window.onload = inert;
		if (window.onload !== inert) throw new Error("Handler lost after replacements");
	`,
	);
} finally {
	await page.close();
	document.close();
	cleaned =
		runtime?.closed === true &&
		"currentDataSize" in runtime.budget &&
		runtime.budget.currentDataSize === 0 &&
		page.metrics().pendingCallbacks === 0;
	console.log(
		JSON.stringify({
			scope: "offline SafeJS Window load handlers",
			checks,
			cleanupVerified: cleaned,
		}),
	);
}
if (!cleaned) throw new Error("Window load check retained runtime resources");
