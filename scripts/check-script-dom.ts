import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { BrowserEvent, DocumentEvents } from "../src/events.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { ScriptDom } from "../src/script-dom.js";
import { BrowserSession } from "../src/session.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";

import {
	type ExtendedCore,
	type Realm,
	loadExtendedCore,
} from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean; error?: string }[] = [];
const callbackBudgetSamples: {
	scope: "bare-callback" | "dom-listeners";
	maxSteps: number;
	stepsUsed: number;
	elapsedMs: number;
	exhausted: string;
	deadlineMs: number;
}[] = [];
let sdk: ExtendedCore | undefined;
const check = (label: string, passed: boolean) => {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Probe assertion failed");
};
const createRealm = (
	dom: ScriptDom,
	bindings: Record<string, unknown> = {},
) => {
	if (!sdk) throw new Error("The extended SDK has not been loaded");
	return sdk.createRealm({
		bindings: { ...bindings, document: dom.document },
		maxEvaluations: 32,
		maxSourceLength: 16_384,
		sink: { log() {}, error() {} },
	});
};

async function checkCallbacks(
	tree: DocumentTree,
	core: ExtendedCore,
	label: string,
) {
	const events = new DocumentEvents(tree);
	let realm: Realm | undefined;
	const invocations: ReturnType<ExtendedCore["startCallback"]>[] = [];
	const dom = new ScriptDom(tree, core, {
		events,
		callbacks: {
			isClosed: () => realm?.closed ?? false,
			startCallback: (callback, args, options) => {
				const invocation = core.startCallback(callback, args, options);
				invocations.push(invocation);
				return invocation;
			},
		},
	});
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	try {
		realm = createRealm(dom, { wait: () => pending });
		await realm.evaluate(
			'const heading = document.querySelector("h1"); let retainedEvent; async function listener(event) { if (this !== heading || event.target !== heading || event.currentTarget !== heading) throw new Error("identity"); retainedEvent = event; heading.textContent = "Callback prefix"; event.preventDefault(); await wait(); heading.textContent = "Callback completion"; } heading.addEventListener("click", listener);',
		);
		await realm.evaluate('heading.addEventListener("click", listener);');
		check(
			`Guest addEventListener deduplicates across separate sources: ${label}`,
			dom.eventBindings?.metrics().listeners === 1,
		);
		const heading = [...tree.walk()].find(
			({ node }) => node.kind === "element" && node.tagName === "h1",
		)?.node;
		if (!heading) throw new Error("Missing probe heading");
		let bubbleSawPrefix = false;
		events.addEventListener(tree.root, "click", () => {
			bubbleSawPrefix = renderSnapshot(snapshotDocument(tree)).includes(
				"Callback prefix",
			);
		});
		check(
			`Cancellation and bubbling wait for guest prefix, not pending await: ${label}`,
			!(await events.dispatchEventAsync(
				heading.id,
				new BrowserEvent("click", { bubbles: true, cancelable: true }),
			)) &&
				bubbleSawPrefix &&
				events.drainErrors().length === 0,
		);
		check(
			`Independent source can run while the callback awaits: ${label}`,
			(await realm.evaluate('heading.textContent === "Callback prefix"'))
				.returnValue === true,
		);
		check(
			`Retained guest event reflects completed dispatch state: ${label}`,
			(
				await realm.evaluate(
					"retainedEvent.target === heading && retainedEvent.currentTarget === null && retainedEvent.eventPhase === 0 && retainedEvent.composedPath().length === 0 && retainedEvent.defaultPrevented",
				)
			).returnValue === true,
		);
		release();
		if (invocations.length !== 1)
			throw new Error("Callback did not start exactly once");
		await invocations[0].result;
		check(
			`Resumed callback changes the authoritative snapshot: ${label}`,
			renderSnapshot(snapshotDocument(tree)).includes("Callback completion"),
		);
		await realm.evaluate('heading.removeEventListener("click", listener);');
		check(
			`Guest removeEventListener removes the original callback: ${label}`,
			dom.eventBindings?.metrics().listeners === 0 &&
				(await events.dispatchEventAsync(
					heading.id,
					new BrowserEvent("click", { cancelable: true }),
				)),
		);
		await realm.evaluate(
			'let passiveCalls = 0; heading.addEventListener("passive", function(event) { passiveCalls++; event.preventDefault(); }, { once: true, passive: true });',
		);
		const firstPassive = await events.dispatchEventAsync(
			heading.id,
			new BrowserEvent("passive", { cancelable: true }),
		);
		const secondPassive = await events.dispatchEventAsync(
			heading.id,
			new BrowserEvent("passive", { cancelable: true }),
		);
		check(
			`Guest once/passive options survive safe conversion: ${label}`,
			firstPassive &&
				secondPassive &&
				(await realm.evaluate("passiveCalls === 1")).returnValue === true,
		);
		await realm.evaluate(
			'let capturedEvent; let sameEvent = false; document.addEventListener("identity", function(event) { capturedEvent = event; }, true); heading.addEventListener("identity", function(event) { sameEvent = event === capturedEvent && event.composedPath()[0] === heading && event.composedPath()[event.composedPath().length - 1] === document; });',
		);
		await events.dispatchEventAsync(
			heading.id,
			new BrowserEvent("identity", { bubbles: true }),
		);
		check(
			`Capture and target guest listeners share one live event: ${label}`,
			(await realm.evaluate("sameEvent")).returnValue === true &&
				events.drainErrors().length === 0 &&
				dom.eventBindings?.drainErrors().length === 0,
		);
	} finally {
		release();
		await realm?.close();
		events.close();
		dom.close();
	}
}

async function checkCallbackFailures(
	core: ExtendedCore,
	maxSteps = 5000,
	deadlineMs?: number,
) {
	const started = performance.now();
	const budget = new core.Budget({
		maxSteps,
		deadline: deadlineMs === undefined ? undefined : Date.now() + deadlineMs,
	});
	let exhausted = "none";
	const tree = parseHtmlDocument(
		"<button>Failure probe</button>",
		"https://example.com/failures",
	);
	const events = new DocumentEvents(tree);
	let realm: Realm | undefined;
	const completions: Promise<unknown>[] = [];
	const dom = new ScriptDom(tree, core, {
		events,
		callbacks: {
			isClosed: () => realm?.closed ?? false,
			startCallback: (callback, args, options) => {
				const invocation = core.startCallback(callback, args, options);
				completions.push(invocation.result);
				return invocation;
			},
		},
	});
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	try {
		realm = core.createRealm({
			bindings: { document: dom.document, wait: () => pending },
			budget,
			maxEvaluations: 16,
			maxSourceLength: 16_384,
			sink: { log() {}, error() {} },
		});
		await realm.evaluate(
			'const button = document.querySelector("button"); button.addEventListener("ordinary", function() { const error = new Error("ordinary failure"); error.code = "budgetExceeded"; throw error; }); button.addEventListener("later", async function() { await wait(); throw new Error("later failure"); }); button.addEventListener("fatal", function() { while (true) {} });',
		);
		const button = [...tree.walk()].find(
			({ node }) => node.tagName === "button",
		)?.node.id;
		if (!button) throw new Error("Missing failure target");
		await events.dispatchEventAsync(button, new BrowserEvent("ordinary"));
		await Promise.allSettled(completions);
		check(
			"Ordinary guest errors are reported without trusting a spoofed fatal code",
			!realm.closed &&
				events.drainErrors().length === 1 &&
				dom.eventBindings?.drainErrors().length === 0,
		);
		await events.dispatchEventAsync(button, new BrowserEvent("later"));
		release();
		await Promise.allSettled(completions);
		await new Promise<void>((resolve) => setImmediate(resolve));
		check(
			"Resumed guest listener failure is observed once without closing the realm",
			!realm.closed &&
				events.drainErrors().length === 0 &&
				dom.eventBindings?.drainErrors().length === 1,
		);
		let laterRan = false;
		events.addEventListener(button, "fatal", () => {
			laterRan = true;
		});
		let rejectedClosed = false;
		try {
			await events.dispatchEventAsync(button, new BrowserEvent("fatal"));
		} catch (error) {
			rejectedClosed =
				error instanceof AgentBrowserError && error.code === "closed";
		}
		check(
			"Actual interpreter budget exhaustion aborts dispatch before later native listeners",
			rejectedClosed && realm.closed && events.metrics().closed && !laterRan,
		);
		const last = (await Promise.allSettled(completions)).at(-1);
		if (last?.status === "rejected" && typeof last.reason?.budget === "string")
			exhausted = last.reason.budget;
	} finally {
		release();
		await realm?.close();
		dom.close();
		tree.close();
		if (deadlineMs !== undefined)
			callbackBudgetSamples.push({
				scope: "dom-listeners",
				maxSteps,
				stepsUsed: budget.stepsUsed,
				elapsedMs: performance.now() - started,
				exhausted,
				deadlineMs,
			});
	}
}

async function profileCallbackBudgets(core: ExtendedCore) {
	for (const maxSteps of [5000, 50_000, 1_000_000]) {
		let callback: unknown;
		const deadlineMs = 2000;
		const budget = new core.Budget({
			maxSteps,
			deadline: Date.now() + deadlineMs,
		});
		const realm = core.createRealm({
			budget,
			bindings: {
				register: (value: unknown) => {
					callback = value;
				},
			},
			maxEvaluations: 1,
			maxSourceLength: 1024,
			sink: { log() {}, error() {} },
		});
		const started = performance.now();
		let exhausted = "none";
		try {
			await realm.evaluate("register(function() { while (true) {} });");
			const invocation = core.startCallback(callback, [], {
				thisValue: undefined,
			});
			try {
				await invocation.result;
			} catch (error) {
				if (
					error &&
					typeof error === "object" &&
					"budget" in error &&
					typeof error.budget === "string"
				)
					exhausted = error.budget;
			}
			check(
				`Synthetic callback budget ${maxSteps} terminates through the interpreter boundary`,
				realm.closed && (exhausted === "steps" || exhausted === "deadline"),
			);
		} finally {
			await realm.close();
			callbackBudgetSamples.push({
				scope: "bare-callback",
				maxSteps,
				stepsUsed: budget.stepsUsed,
				elapsedMs: performance.now() - started,
				exhausted,
				deadlineMs,
			});
		}
	}
}

try {
	sdk = await loadExtendedCore();
	const tree = parseHtmlDocument(
		'<h1 id="heading">Before</h1><input id="input" value="old"><input id="check" type="checkbox">',
		"https://example.com/fixture",
	);
	const dom = new ScriptDom(tree, sdk);
	const realm = createRealm(dom);
	try {
		await realm.evaluate(
			'const heading = document.getElementById("heading"); heading.textContent = "After script";',
		);
		check(
			"SafeJS textContent setter changes the authoritative semantic snapshot",
			renderSnapshot(snapshotDocument(tree)).includes("After script"),
		);
		check(
			"Separate script sources retain DOM object identity",
			(await realm.evaluate('heading === document.querySelector("h1")'))
				.returnValue === true,
		);
		await realm.evaluate(
			'const paragraph = document.createElement("p"); paragraph.setAttribute("id", "created"); paragraph.textContent = "Created by script"; document.body.appendChild(paragraph);',
		);
		check(
			"Created nodes support lookup, parent identity and attributes",
			(
				await realm.evaluate(
					'document.getElementById("created") === paragraph && paragraph.parentNode === document.body && paragraph.getAttribute("id") === "created"',
				)
			).returnValue === true,
		);
		check(
			"Created script content appears in snapshots",
			renderSnapshot(snapshotDocument(tree)).includes("Created by script"),
		);
		await realm.evaluate(
			'document.getElementById("input").value = "programmatic"; document.getElementById("check").checked = true;',
		);
		check(
			"Live input state differs from unchanged default attributes",
			(
				await realm.evaluate(
					'document.getElementById("input").value === "programmatic" && document.getElementById("input").getAttribute("value") === "old" && document.getElementById("check").checked',
				)
			).returnValue === true,
		);
		await realm.evaluate("document.body.removeChild(paragraph);");
		check(
			"Detached nodes retain identity without appearing in document lookup",
			(
				await realm.evaluate(
					'!paragraph.isConnected && paragraph.textContent === "Created by script" && document.getElementById("created") === null',
				)
			).returnValue === true,
		);
		check(
			"The DOM grant does not expose ambient network or host process",
			(
				await realm.evaluate(
					'typeof fetch === "undefined" && typeof process === "undefined"',
				)
			).returnValue === true,
		);
		await checkCallbacks(tree, sdk, "fixture");
	} finally {
		await realm.close();
		dom.close();
		tree.close();
	}
	await checkCallbackFailures(sdk);
	if (process.argv.includes("--budget-profile")) {
		await profileCallbackBudgets(sdk);
		await checkCallbackFailures(sdk, 1_000_000, 2000);
	}
	if (process.argv.includes("--sites")) {
		const session = new BrowserSession({
			createTransport: (cookieJar) =>
				new NodeNetworkTransport({
					cookieJar,
					allowedOrigins: ["https://example.com", "https://books.toscrape.com"],
					limits: { maxRequests: 8, timeoutMs: 15_000 },
				}),
			loadDocument: loadBrowserDocument,
			limits: { maxNavigations: 3 },
		});
		const tab = session.createTab();
		try {
			for (const [url, marker] of [
				["https://example.com/", "Example Domain"],
				["https://books.toscrape.com/", "All products"],
			]) {
				await session.navigate(tab.id, url);
				const page = session.page(tab.id);
				const siteDom = new ScriptDom(page.document, sdk);
				const siteRealm = createRealm(siteDom);
				try {
					check(
						`Actual parsed heading read through SafeJS: ${url}`,
						(
							await siteRealm.evaluate(
								'document.querySelector("h1").textContent',
							)
						).returnValue === marker,
					);
					await siteRealm.evaluate(
						'const heading = document.querySelector("h1"); heading.textContent = "Local probe heading";',
					);
					check(
						`Local-only script mutation reaches the session snapshot: ${url}`,
						renderSnapshot(session.snapshot(tab.id)).includes(
							"Local probe heading",
						),
					);
					check(
						`Real document wrapper identity is stable: ${url}`,
						(
							await siteRealm.evaluate(
								'heading === document.querySelector("h1") && heading.ownerDocument === document',
							)
						).returnValue === true,
					);
					await checkCallbacks(page.document, sdk, url);
				} finally {
					await siteRealm.close();
					siteDom.close();
				}
			}
		} finally {
			session.close();
		}
	}
} catch (error) {
	checks.push({
		label: "Script DOM probe",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Explicit test-source execution using the locally extended compiled SafeJS public core and our own document model. Public sites are read-only HTTP loads; injected scripts use actual guest DOM addEventListener/removeEventListener bindings and modify only local trees. Host-dispatched events are not a native click/default-action pipeline. No website-authored scripts, browser engine or automatic page-script execution are enabled. No raw responses or credentials are retained.",
			sites: process.argv.includes("--sites"),
			checks,
			callbackBudgetSamples,
			rssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((entry) => !entry.passed)) process.exitCode = 1;
