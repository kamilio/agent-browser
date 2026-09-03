import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import type { GeneratedLocator } from "../src/locator-generation.js";
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
					'<main><input id="secret" type="password"><button id="save" data-testid="save">Save</button><button id="cancel">Cancel</button><div id="status">Waiting</div><div class="plain"></div><div class="plain"></div></main><aside></aside>',
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
	if (!result.ok)
		throw new Error("Locator-generation interpreted fixture failed");
	return result.value;
}
async function generate(target: string) {
	return (await host.execute(["generate-locator", target]))
		.data as GeneratedLocator;
}
async function errorCode(argv: string[]) {
	try {
		await host.execute(argv);
	} catch (error) {
		return error instanceof AgentBrowserError ? error.code : "unexpected";
	}
	return "none";
}
try {
	await host.execute(["open", "https://example.com/"]);
	await evaluate(`
var calls = 0;
document.getElementById("secret").addEventListener("input", function() { document.getElementById("status").textContent = this.value; });
document.getElementById("save").addEventListener("click", function() { calls++; document.getElementById("status").textContent = "Saved " + calls; });
`);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	const secret = await generate("#secret");
	const save = await generate("#save");
	const cancel = await generate("#cancel");
	check(
		"Native generator chooses verified test-ID, role and CSS literals",
		secret.strategy === "id" &&
			save.strategy === "test-id" &&
			cancel.strategy === "role",
	);
	check(
		"Raw mode retains structured API metadata without changing the locator",
		(
			(await host.execute(["--raw", "generate-locator", "#save"]))
				.data as GeneratedLocator
		).locator === save.locator,
	);
	await host.execute(["fill", secret.locator, "fixture-secret"]);
	check(
		"Generated CSS locator fills the native control and runs its interpreted input handler",
		(await evaluate('document.getElementById("status").textContent')) ===
			"fixture-secret",
	);
	await host.execute(["click", save.locator]);
	check(
		"Generated test-ID locator runs the actual interpreted click handler",
		(await evaluate('document.getElementById("status").textContent')) ===
			"Saved 1",
	);
	await evaluate(
		'document.querySelector("aside").append(document.getElementById("save"));',
	);
	await host.execute(["click", save.locator]);
	check(
		"A semantic generated locator survives guest DOM moves and retained listeners",
		(await evaluate("calls")) === 2,
	);
	const structural = await generate("main > div.plain:nth-child(5)");
	check(
		"Duplicate anonymous elements receive a verified structural locator",
		structural.strategy === "path" &&
			structural.structural &&
			(await generate(structural.locator)).ref === structural.ref,
	);
	await evaluate(
		'document.querySelector("main").insertAdjacentHTML("beforeend", \'<button data-testid="save">Save</button>\');',
	);
	check(
		"An old locator fails rather than choosing the first newly ambiguous match",
		(await errorCode(["click", save.locator])) === "not-actionable",
	);
	check(
		"Regeneration after guest mutation chooses a different unique strategy",
		(await generate(save.ref)).strategy === "id",
	);
	const hostile = '"); globalThis.injection = true; ("\u001b[31m\u202e';
	await evaluate(
		`document.getElementById("cancel").setAttribute("data-testid", ${JSON.stringify(hostile)});`,
	);
	const escaped = await generate("#cancel");
	check(
		"Page-controlled locator literals are escaped and resolved as data",
		escaped.strategy === "test-id" &&
			!/[\p{Cc}\p{Cf}]/u.test(escaped.locator) &&
			(await generate(escaped.locator)).ref === escaped.ref &&
			(await evaluate("typeof injection")) === "undefined",
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Generation and round-trip queries preserve the snapshot diff baseline",
		!diff.reset && diff.fromRevision === baseline.revision,
	);
	await host.execute(["reload"]);
	check(
		"Old element references become stale on navigation",
		(await errorCode(["generate-locator", secret.ref])) === "stale-reference",
	);
	await host.execute(["fill", secret.locator, "after-reload"]);
	check(
		"Generated locator re-resolves into a fresh page after navigation",
		(await evaluate('document.getElementById("secret").value')) ===
			"after-reload",
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"All actual interpreter page owners close",
		[...owners.values()].every((owner) => owner.closed),
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
				scope:
					"existing-experimental-core-in-memory-command-host-no-public-network-or-PTY",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
