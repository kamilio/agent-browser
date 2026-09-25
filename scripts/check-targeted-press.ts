import { BrowserCommandHost } from "../src/command-host.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests.push(input.url);
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
			requests: requests.length,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: false,
		}),
		close() {},
	}),
	loadDocument: (response) =>
		parseHtmlDocument(
			'<form action="/send"><input id="field" name="text"><select id="pick" name="choice"><option>a</option><option>b</option></select><input id="disabling"><button id="send">Send</button></form>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/targeted"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await guest(
		"Guest installs focus, key, input and submission listeners",
		`
		var field = document.getElementById("field"); var pick = document.getElementById("pick");
		var trace = []; var block = false; var clicks = 0; var edits = 0; var blockedKeys = 0;
		field.addEventListener("focus", function(){ trace.push("focus"); });
		field.addEventListener("keydown", function(event){ trace.push("keydown"); if(block) event.preventDefault(); });
		field.addEventListener("input", function(){ edits++; });
		field.addEventListener("click", function(){ clicks++; });
		var disabling = document.getElementById("disabling");
		disabling.addEventListener("focus", function(){ disabling.setAttribute("disabled", ""); });
		disabling.addEventListener("keydown", function(){ blockedKeys++; });
		return field.value === "" && pick.value === "a";
	`,
	);
	await host.execute(["press", "a", "--target", "#field"]);
	await guest(
		"Targeted key focuses before dispatch without click emulation",
		'return field.value === "a" && edits === 1 && clicks === 0 && trace.join("|") === "focus|keydown";',
	);
	await host.execute(["press", "b", "--target", "#field"]);
	await host.execute(["press", "ArrowLeft", "--target", "#field"]);
	await host.execute(["press", "c", "--target", "#field"]);
	await guest(
		"Repeated targeted commands preserve the native caret",
		'return field.value === "acb" && edits === 3 && trace.join("|") === "focus|keydown|keydown|keydown|keydown";',
	);
	await guest(
		"Guest enables keyboard cancellation",
		"block = true; return true;",
	);
	await host.execute(["press", "x", "--target", "#field"]);
	await guest(
		"Canceled guest keydown leaves the field unchanged",
		'return field.value === "acb" && edits === 3;',
	);
	let rejected = false;
	try {
		await host.execute(["press", "x", "--target", "#disabling"]);
	} catch (error) {
		rejected = error instanceof Error && error.message.includes("lost focus");
	}
	check("Guest disabling during focus rejects before key dispatch", rejected);
	await guest(
		"No key or text reaches the disabled guest control",
		'return disabling.value === "" && blockedKeys === 0;',
	);
	await host.execute(["press", "ArrowDown", "--target", "#pick"]);
	await guest(
		"Targeted select navigation updates actual guest selectedness",
		'return pick.value === "b" && pick.selectedIndex === 1;',
	);
	const submitted = await host.execute(["press", "Enter", "--target", "#send"]);
	check(
		"Targeted Enter performs real session submission",
		!!(submitted.data as { navigation?: unknown }).navigation &&
			requests.length === 2,
	);
	const target = new URL(requests[1]);
	check(
		"Submission uses current typed and selected values",
		target.searchParams.get("text") === "acb" &&
			target.searchParams.get("choice") === "b",
	);
	passed = true;
} finally {
	await page.close();
	host.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				page: page.metrics(),
				fixture:
					"production command host and actual PageScripts with in-memory transport",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"no live website, PTY, frontend visual acceptance or page-side synchronous focus shim",
			},
			null,
			2,
		),
	);
}
