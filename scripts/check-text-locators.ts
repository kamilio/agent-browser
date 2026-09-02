import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import type { DomInspection } from "../src/dom-inspection.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const owners = new Map<DocumentTree, PageScripts>();
const host = new BrowserCommandHost({
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
					'<label id="password-label" for="password">Account secret</label><input id="password" type="password"><label> Enabled <input id="enabled" type="checkbox"></label><input id="name" placeholder="Your name" title="Name field"><button id="buy"><span id="buy-text">Buy item</span></button><img id="logo" alt="Shop logo"><p id="status">Waiting</p>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				),
		}),
	evaluatePage: (page, source, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(source, { signal });
	},
});
let completed = false;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Text locator fixture evaluation failed");
	return result.value;
}
async function inspect(target: string) {
	return (await host.execute(["dom", target])).data as DomInspection;
}
function firstId(inspection: DomInspection) {
	return inspection.nodes[0].attributes.find(
		(attribute) => attribute.name === "id",
	)?.value;
}
try {
	await host.execute(["open", "https://example.com/"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	await evaluate(`
var clicks = 0; var inputEvents = 0; var checks = 0;
document.getElementById("password").addEventListener("input", function() { inputEvents++; });
document.getElementById("name").addEventListener("input", function() { document.getElementById("status").textContent = "Typed " + this.value; });
document.getElementById("enabled").addEventListener("change", function() { checks++; });
document.getElementById("buy").addEventListener("click", function() { clicks++; document.getElementById("status").textContent = "Purchased"; });
`);
	await host.execute([
		"fill",
		"getByLabel('Account secret', {exact: true})",
		"fixture-password",
	]);
	const password = await inspect("getByLabel('Account secret')");
	check(
		"Label-targeted password fill runs its interpreted handler without exposing its value",
		(await evaluate("return inputEvents;")) === 1 &&
			!JSON.stringify(password).includes("fixture-password"),
	);
	await host.execute(["check", "getByLabel('Enabled')"]);
	check(
		"Wrapping-label targeting changes native checked state and runs the interpreted change listener",
		(await evaluate(
			'return checks === 1 && document.getElementById("enabled").checked;',
		)) === true,
	);
	await host.execute(["fill", "getByPlaceholder('your NAME')", "Ada"]);
	check(
		"Placeholder targeting fills the shared control and exposes its interpreted DOM mutation",
		firstId(await inspect("getByText('Typed Ada', {exact:true})")) === "status",
	);
	const title = await inspect("getByTitle('Name field', {exact:true})");
	check(
		"Title targeting observes the same native control value",
		title.nodes[0].control?.value === "Ada",
	);
	check(
		"Alt-text targeting resolves the actual image node",
		firstId(await inspect("getByAltText('shop LOGO')")) === "logo",
	);
	const smallest = await inspect("getByText('Buy item', {exact:true})");
	await host.execute(["click", "getByText('Buy item', {exact:true})"]);
	check(
		"Smallest text target bubbles a real click to its interpreted button listener",
		firstId(smallest) === "buy-text" &&
			(await evaluate("return clicks;")) === 1 &&
			firstId(await inspect("getByText('Purchased')")) === "status",
	);
	await evaluate(
		'document.getElementById("password-label").textContent = "Updated secret";',
	);
	check(
		"Label resolution observes interpreted text changes while retaining node identity",
		(await inspect("getByLabel('Updated secret')")).root === password.root,
	);
	await evaluate(
		'setTimeout(function() { let button = document.createElement("button"); button.textContent = "Deferred action"; button.addEventListener("click", function() { clicks++; }); document.body.appendChild(button); }, 40);',
	);
	await host.execute([
		"click",
		"getByText('Deferred action', {exact:true})",
		"--timeout=2000",
	]);
	check(
		"Text-targeted action waiting observes interpreted timer insertion and dispatches once",
		(await evaluate("return clicks;")) === 2,
	);
	await evaluate(
		'let duplicate = document.createElement("button"); duplicate.textContent = "Buy item"; duplicate.setAttribute("hidden", ""); document.body.appendChild(duplicate);',
	);
	let ambiguous = false;
	try {
		await host.execute(["click", "getByText('Buy item')"]);
	} catch (error) {
		ambiguous =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check(
		"A hidden interpreted duplicate prevents ambiguous activation without dispatching",
		ambiguous && (await evaluate("return clicks;")) === 2,
	);
	let rejected = false;
	try {
		await host.execute(["dom", "getByLabel(String('Updated secret'))"]);
	} catch (error) {
		rejected =
			error instanceof AgentBrowserError && error.code === "invalid-input";
	}
	check(
		"Executable locator arguments fail safely and leave the shared command queue usable",
		rejected &&
			(await inspect("getByTitle('Name field')")).root === title.root &&
			host.metrics().pendingCommands === 0,
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Locator resolution and scoped DOM reads preserve the snapshot diff baseline",
		diff.reset === false && diff.fromRevision === baseline.revision,
	);
	completed = true;
} finally {
	host.close();
	for (const owner of owners.values()) await owner.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "existing-experimental-core-in-memory-command-host",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
