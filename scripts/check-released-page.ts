import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { extensionPageRuntime } from "../src/extension-page-runtime.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { loadReleasedCore } from "./released-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const owners = new Map<DocumentTree, PageScripts>();
let selected: { packageName: string; version: string } | undefined;
let host: BrowserCommandHost | undefined;
let completed = false;
let failure: { stage: string; message: string } | undefined;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	if (!host) throw new Error("Host unavailable");
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok)
		throw new Error(`Released page evaluation failed: ${result.error?.code}`);
	return result.value;
}
async function bounded<Value>(promise: Promise<Value>): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Released page cleanup deadline exceeded")),
					2000,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
try {
	const loaded = await loadReleasedCore(
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_ROOT,
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_VERSION,
	);
	selected = { packageName: loaded.packageName, version: loaded.version };
	const runtime = extensionPageRuntime(loaded.core);
	host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response, context) =>
					parseHtmlDocument(
						'<label for="name">Name</label><input id="name"><button id="button">Buy</button><label>Enabled<input id="enabled" type="checkbox"></label><p id="status">Waiting</p>',
						response.url,
						{ limits: context.limits, signal: context.signal },
					),
			}),
		evaluatePage: (page, source, signal) => {
			let owner = owners.get(page.document);
			if (!owner) {
				owner = new PageScripts(
					{ document: page.document, interactions: page.interactions },
					runtime,
				);
				owners.set(page.document, owner);
			}
			return owner.evaluate(source, { signal });
		},
	});
	await host.execute(["open", "https://example.com/"]);
	check(
		"Released extension setup preserves document, Window and owned console identity",
		(await evaluate(
			"return window === self && document === window.document && console === window.console && console === self.console;",
		)) === true,
	);
	check(
		"Owned console methods beyond the builtin sink remain available",
		(await evaluate(
			'console.warn("fixture warning"); console.count("fixture"); return typeof console.group === "function" && typeof console.time === "function";',
		)) === true,
	);
	const journal = JSON.stringify((await host.execute(["console"])).data);
	check(
		"The shared console journal receives calls through the owned global",
		journal.includes("fixture warning"),
	);
	await evaluate(
		'var clicks = 0; document.getElementById("button").addEventListener("click", function() { clicks++; document.getElementById("status").textContent = "Purchased"; }); document.getElementById("name").addEventListener("input", function() { document.getElementById("status").textContent = this.value; });',
	);
	await host.execute(["fill", "getByLabel('Name')", "Ada"]);
	check(
		"Native label-targeted fill runs the released interpreter input handler",
		(await evaluate(
			'return document.getElementById("status").textContent;',
		)) === "Ada",
	);
	await host.execute(["click", "getByText('Buy')"]);
	check(
		"Native click runs the released callback and updates the same document",
		(await evaluate(
			'return clicks === 1 && document.getElementById("status").textContent === "Purchased";',
		)) === true,
	);
	await evaluate(
		"var retained = { value: 1 }; var timerDone = false; setTimeout(function(value, primitive) { timerDone = this === window && value === retained && primitive === 7; value.value++; }, 5, retained, 7);",
	);
	const deadline = Date.now() + 2000;
	while ((await evaluate("return timerDone;")) !== true) {
		if (Date.now() >= deadline)
			throw new Error("Released retained timer deadline exceeded");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	check(
		"Retained timer arguments preserve guest identity, primitives and Window receiver",
		(await evaluate("return retained.value === 2;")) === true,
	);
	check(
		"Session-owned storage and history globals are declared and live",
		(await evaluate(
			'localStorage.setItem("fixture", "stored"); history.replaceState({ step: 1 }, "", "#step"); return window.localStorage === localStorage && history === window.history && history.state.step === 1 && localStorage.getItem("fixture") === "stored";',
		)) === true,
	);
	await evaluate(
		'document.getElementById("enabled").addEventListener("click", async function(event) { event.preventDefault(); await new Promise(function() {}); });',
	);
	await host.execute(["click", "getByLabel('Enabled')", "--timeout=2000"]);
	check(
		"Callback prefix cancellation prevents default without awaiting its pending async tail",
		(await evaluate(
			'return document.getElementById("enabled").checked === false;',
		)) === true,
	);
	const previous = [...owners.values()][0];
	await host.execute(["reload"]);
	check(
		"Reload closes the old extension owner while preserving session storage",
		previous.closed &&
			(await evaluate(
				'return localStorage.getItem("fixture") === "stored" && window.console === console;',
			)) === true,
	);
	host.close();
	for (const owner of owners.values()) await bounded(owner.close());
	check(
		"All released page owners close with no pending callbacks or timers",
		[...owners.values()].every(
			(owner) =>
				owner.closed &&
				owner.metrics().pendingCallbacks === 0 &&
				(owner.metrics().timers?.active ?? 0) === 0,
		),
	);
	completed = true;
} catch (error) {
	failure = {
		stage: selected ? "browser-contract" : "selection",
		message:
			error instanceof Error
				? error.message.slice(0, 512)
				: "Unknown probe failure",
	};
	process.exitCode = 1;
} finally {
	host?.close();
	for (const owner of owners.values()) {
		try {
			await bounded(owner.close());
		} catch {
			completed = false;
			process.exitCode = 1;
			failure ??= {
				stage: "cleanup",
				message: "Released page owner cleanup failed",
			};
		}
	}
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				selected: selected ?? null,
				scope: "explicit-local-release-native-browser-in-memory",
				realNetwork: false,
				realPty: false,
				publicationProvenanceVerified: false,
				completed,
				failure,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
