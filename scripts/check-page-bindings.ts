import { setTimeout as delay } from "node:timers/promises";
import { DocumentTree } from "../src/document.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const document = new DocumentTree("https://example.com/");
const interactions = new DocumentInteractions(document);
const scripts = new PageScripts({ document, interactions }, core);

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

async function evaluate(source: string) {
	const result = await scripts.evaluate(source);
	if (!result.ok)
		throw new Error(`Page binding probe failed: ${result.error?.code}`);
	return result.value;
}

async function waitUntil(predicate: () => boolean) {
	const deadline = Date.now() + 2000;
	while (!predicate()) {
		if (Date.now() >= deadline)
			throw new Error("Page binding probe deadline exceeded");
		await delay(5);
	}
}

try {
	check(
		"Page capability extraction preserves document and Window aliases",
		(await evaluate(
			"return window.document === document && window.self === self && window.location === location;",
		)) === true,
	);
	await evaluate(`
let retainedValue = { count: 1 };
let timeoutIdentity = false;
let intervalIdentity = false;
let timeoutWindow = false;
let intervalWindow = false;
let intervalTicks = 0;
let canceledRan = false;
setTimeout(function(value) {
 timeoutIdentity = value === retainedValue;
 timeoutWindow = this === window;
 value.count++;
}, 1, retainedValue);
let intervalId = window.setInterval(function(value) {
 intervalIdentity = value === retainedValue;
 intervalWindow = this === window;
 value.count++;
 intervalTicks++;
 if (intervalTicks === 2) clearInterval(intervalId);
}, 1, retainedValue);
let canceledId = window.setTimeout(function() { canceledRan = true; }, 1000, retainedValue);
clearTimeout(canceledId);
`);
	await waitUntil(
		() =>
			scripts.metrics().timers.active === 0 &&
			scripts.metrics().pendingCallbacks === 0,
	);
	check(
		"Global timeout retains the original guest argument",
		(await evaluate("return timeoutIdentity;")) === true,
	);
	check(
		"Window interval retains the original guest argument across firings",
		(await evaluate("return intervalIdentity && intervalTicks === 2;")) ===
			true,
	);
	check(
		"Both timer paths preserve Window receivers and shared mutations",
		(await evaluate(
			"return timeoutWindow && intervalWindow && retainedValue.count === 4;",
		)) === true,
	);
	check(
		"Canceled retained timers do not run",
		(await evaluate("return canceledRan === false;")) === true,
	);
	await evaluate(
		"setTimeout(async function() { await new Promise(function() {}); }, 1);",
	);
	await waitUntil(() => scripts.metrics().pendingCallbacks === 1);
	await scripts.close();
	check(
		"Closing the owner clears pending callbacks and capability state",
		scripts.metrics().pendingCallbacks === 0 &&
			scripts.metrics().timers.closed &&
			scripts.metrics().dom.classLists.closed,
	);
	check(
		"Guest shutdown preserves native document interactions",
		!interactions.events.metrics().closed &&
			document.get(document.root).id === document.root,
	);
} finally {
	await scripts.close();
	document.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "existing-experimental-core-in-memory",
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
