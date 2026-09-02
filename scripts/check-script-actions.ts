import { controlChecked, controlValue } from "../src/controls.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
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
const check = (label: string, passed: boolean) => {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Probe assertion failed");
};

function createScope(
	tree: DocumentTree,
	actions: DocumentInteractions,
	core: ExtendedCore,
	bindings: Record<string, unknown> = {},
) {
	let realm: Realm | undefined;
	let dom: ScriptDom | undefined;
	const pending: Promise<unknown>[] = [];
	const window = core.createHostObject({
		properties: { document: { get: () => dom?.document } },
	});
	dom = new ScriptDom(tree, core, {
		events: actions.events,
		window,
		callbacks: {
			isClosed: () => realm?.closed ?? false,
			startCallback: (callback, args, options) => {
				const invocation = core.startCallback(callback, args, options);
				pending.push(invocation.result);
				return invocation;
			},
		},
	});
	try {
		realm = core.createRealm({
			bindings: { ...bindings, document: dom.document, window },
			budget: new core.Budget({
				maxSteps: 100_000,
				deadline: Date.now() + 10_000,
			}),
			maxEvaluations: 32,
			maxSourceLength: 32_768,
			sink: { log() {}, error() {} },
		});
	} catch (error) {
		dom.close();
		throw error;
	}
	const owner = dom;
	const ownedRealm = realm;
	return {
		dom: owner,
		realm: ownedRealm,
		complete: () => Promise.all(pending),
		close: async () => {
			await ownedRealm.close();
			owner.close();
		},
	};
}

function nodeById(tree: DocumentTree, id: string) {
	const found = [...tree.walk()].find(
		({ node }) => node.attributes.id === id,
	)?.node;
	if (!found) throw new Error("Missing fixture node");
	return found;
}

try {
	const core = await loadExtendedCore();
	const tree = parseHtmlDocument(
		'<h1>Before</h1><form id="form" action="/submit"><input id="field" name="field" value="default"><input id="check" type="checkbox"><label id="label" for="check">Check</label><button id="reset" type="reset">Reset</button><button id="submit">Submit</button><select id="select"><option value="one">One</option><option value="two">Two</option></select></form>',
		"https://example.com/fixture",
	);
	const actions = new DocumentInteractions(tree);
	let release = () => {};
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const scope = createScope(tree, actions, core, { wait: () => waiting });
	try {
		await scope.realm.evaluate(`
const heading = document.querySelector("h1");
const field = document.getElementById("field");
const checkbox = document.getElementById("check");
const form = document.getElementById("form");
const submit = document.getElementById("submit");
let checkedDuringClick = false;
let keyups = 0;
let changes = 0;
field.addEventListener("beforeinput", function(event) {
  if (event.target !== field || this !== field || event.composedPath()[event.composedPath().length - 1] !== window) throw new Error("event identity");
  heading.textContent = "Native input prefix";
});
checkbox.addEventListener("click", function(event) { checkedDuringClick = checkbox.checked; event.preventDefault(); }, { once: true });
form.addEventListener("reset", async function() { heading.textContent = "Reset prefix"; await wait(); field.value = "Late handler value"; }, { once: true });
form.addEventListener("submit", function(event) { if (event.submitter !== submit) throw new Error("submitter identity"); field.value = "script submitted"; form.setAttribute("action", "/changed"); });
field.addEventListener("keydown", function(event) { if (event.key === "a") event.preventDefault(); });
field.addEventListener("keyup", function() { keyups++; });
document.getElementById("select").addEventListener("change", function() { changes++; });
`);
		const field = nodeById(tree, "field");
		const checkbox = nodeById(tree, "check");
		await actions.fillAsync(tree.reference(field.id), "filled");
		check(
			"Native fill runs guest beforeinput before applying the value",
			controlValue(tree, field.id) === "filled" &&
				renderSnapshot(snapshotDocument(tree)).includes("Native input prefix"),
		);
		const click = await actions.clickAsync(tree.reference(checkbox.id));
		check(
			"Guest click sees checkbox preactivation and can cancel it",
			click.defaultPrevented &&
				!controlChecked(tree, checkbox.id) &&
				(await scope.realm.evaluate("checkedDuringClick")).returnValue === true,
		);
		const reset = await actions.clickAsync(
			tree.reference(nodeById(tree, "reset").id),
		);
		check(
			"Reset defaults complete without awaiting the guest handler's pending promise",
			reset.reset?.reset === true &&
				controlValue(tree, field.id) === "default" &&
				renderSnapshot(snapshotDocument(tree)).includes("Reset prefix"),
		);
		release();
		await scope.complete();
		check(
			"Async handler continuation runs after the native reset default",
			controlValue(tree, field.id) === "Late handler value",
		);
		const submission = await actions.forms.requestSubmitAsync(
			tree.reference(nodeById(tree, "form").id),
			{ submitter: tree.reference(nodeById(tree, "submit").id) },
		);
		check(
			"Native submit serialization includes guest field/action changes",
			submission.submission?.request.url ===
				"https://example.com/changed?field=script+submitted",
		);
		await actions.fillAsync(tree.reference(field.id), "");
		const typed = await actions.keyboard.typeAsync("ab");
		check(
			"Native typing honors guest keydown cancellation and delivers keyup",
			typed.canceled &&
				controlValue(tree, field.id) === "b" &&
				(await scope.realm.evaluate("keyups === 2")).returnValue === true,
		);
		const selection = nodeById(tree, "select");
		await actions.selectAsync(tree.reference(selection.id), ["two"]);
		check(
			"Native selection dispatches the guest change listener",
			controlValue(tree, selection.id) === "two" &&
				(await scope.realm.evaluate("changes === 1")).returnValue === true,
		);
		const label = await actions.clickAsync(
			tree.reference(nodeById(tree, "label").id),
		);
		check(
			"Label forwarding reuses native activation after a once guest listener was removed",
			label.label?.forwarded === true && controlChecked(tree, checkbox.id),
		);
		await scope.complete();
		check(
			"Native fixture reports no swallowed guest listener failures",
			actions.events.drainErrors().length === 0 &&
				scope.dom.eventBindings?.drainErrors().length === 0,
		);
	} finally {
		release();
		await scope.close();
		tree.close();
	}
	if (process.argv.includes("--sites")) {
		const transports: NodeNetworkTransport[] = [];
		const session = new BrowserSession({
			createTransport: (cookieJar) => {
				const transport = new NodeNetworkTransport({
					cookieJar,
					allowedOrigins: ["https://example.com", "https://books.toscrape.com"],
					limits: { maxRequests: 10, timeoutMs: 15_000 },
				});
				transports.push(transport);
				return transport;
			},
			loadDocument: loadBrowserDocument,
			limits: { maxNavigations: 6 },
		});
		const requests = () =>
			transports.reduce(
				(total, transport) => total + transport.metrics().requests,
				0,
			);
		const tab = session.createTab();
		try {
			for (const url of [
				"https://example.com/",
				"https://books.toscrape.com/",
			]) {
				await session.navigate(tab.id, url);
				const page = session.page(tab.id);
				const scope = createScope(page.document, page.interactions, core);
				try {
					await scope.realm.evaluate(
						'const anchor = document.querySelector("a"); anchor.addEventListener("click", function(event) { if (this !== anchor || event.currentTarget !== anchor) throw new Error("anchor identity"); document.querySelector("h1").textContent = "Guest handled real link"; event.preventDefault(); }, { once: true });',
					);
					const anchor = [...page.document.walk()].find(
						({ node }) => node.tagName === "a",
					)?.node;
					if (!anchor) throw new Error("Missing real anchor");
					const before = requests();
					const click = await session.click(
						tab.id,
						page.document.reference(anchor.id),
					);
					check(
						`Native real-link click is canceled by a guest listener: ${url}`,
						click.interaction.defaultPrevented &&
							!click.navigation &&
							requests() === before,
					);
					check(
						`Real-page semantic output includes guest click mutation: ${url}`,
						renderSnapshot(session.snapshot(tab.id)).includes(
							"Guest handled real link",
						),
					);
					await scope.realm.evaluate(
						'anchor.addEventListener("click", function() { anchor.setAttribute("href", "#agent-browser-probe"); }, { once: true });',
					);
					const followed = await session.click(
						tab.id,
						page.document.reference(anchor.id),
					);
					check(
						`Native link default uses the guest-rewritten fragment without a request: ${url}`,
						followed.navigation?.kind === "same-document" &&
							new URL(page.document.url).hash === "#agent-browser-probe" &&
							requests() === before,
					);
					check(
						`Fragment navigation preserves the live script document and listener health: ${url}`,
						(
							await scope.realm.evaluate(
								'anchor === document.querySelector("a") && document.URL.endsWith("#agent-browser-probe")',
							)
						).returnValue === true &&
							page.interactions.events.drainErrors().length === 0 &&
							scope.dom.eventBindings?.drainErrors().length === 0,
					);
				} finally {
					await scope.close();
				}
			}
		} finally {
			session.close();
		}
	}
} catch (error) {
	checks.push({
		label: "Native script action probe",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
	if (process.argv.includes("--trace"))
		console.error(error instanceof Error ? error.message : "Probe failed");
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Actual locally extended SafeJS public-core execution against native form, focus, input, keyboard, selection, checkbox, label and session-link actions. Sources are explicit trusted probe scripts, not website-authored JavaScript. Optional public sites are read-only HTML downloads; real links are canceled or rewritten locally to same-document fragments. No form is sent, no server data is mutated, and no raw responses or credentials are retained. This in-process probe is not the production isolation boundary.",
			sites: process.argv.includes("--sites"),
			checks,
			rssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((entry) => !entry.passed)) process.exitCode = 1;
