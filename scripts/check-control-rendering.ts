import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { DocumentQueries } from "../src/selectors.js";
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
			'<style>html,body{margin:0}input,button{display:block;font-size:8px}</style><form id="form" action="/send"><input id="name" name="name"><input id="agree" name="agree" type="checkbox"><button id="send" name="which" value="go">Send</button></form>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/form"]);
await host.execute(["resize", "180", "100"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const tree = loaded.document;
const queries = new DocumentQueries(tree);
const checks: { label: string; passed: boolean }[] = [];
const captures: { label: string; sha256: string; controls: number }[] = [];
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
function capture(label: string) {
	const raster = rasterizeDocument(tree);
	const sha256 = createHash("sha256").update(raster.image.pixels).digest("hex");
	captures.push({ label, sha256, controls: raster.metrics.paintedControls });
	return sha256;
}
async function point(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing control");
	const rect = documentGeometry(tree).getBoundingClientRect(id);
	await host.execute([
		"mousemove",
		String(rect.x + Math.min(3, rect.width / 2)),
		String(rect.y + Math.min(3, rect.height / 2)),
	]);
	await host.execute(["mousedown"]);
	return host.execute(["mouseup"]);
}
try {
	await guest(
		"Actual guest installs input, change and submit listeners on visible native controls",
		'var edits = 0; var changed = 0; var submits = 0; var block = true; var field = document.getElementById("name"); field.addEventListener("input", function(){ edits++; }); document.getElementById("agree").addEventListener("change", function(){ changed++; }); document.getElementById("form").addEventListener("submit", function(event){ submits++; if(block) event.preventDefault(); }); return true;',
	);
	const initial = capture("initial");
	check(
		"The real form paints all three native controls",
		captures[0].controls === 3,
	);
	await point("#name");
	await host.execute(["type", "hello"]);
	await guest(
		"Pointer focus and typing update the visible native field and guest input listeners",
		'return field.value === "hello" && edits === 5;',
	);
	check(
		"Input state and focus produce different actual pixels",
		capture("typed") !== initial,
	);
	await point("#agree");
	await guest(
		"A visible checkbox click changes native checked state and emits change",
		'return document.getElementById("agree").checked && changed === 1;',
	);
	capture("checked");
	const canceled = await point("#send");
	check(
		"Actual guest submit prevention stops session navigation",
		!(canceled.data as { navigation?: unknown }).navigation &&
			requests.length === 1,
	);
	await guest(
		"Submission remains observable after cancellation",
		"block = false; return submits === 1;",
	);
	const submitted = await point("#send");
	check(
		"Uncanceled visible button submission reaches the owned session transport",
		!!(submitted.data as { navigation?: unknown }).navigation &&
			requests.length === 2,
	);
	const target = new URL(requests[1]);
	check(
		"The actual form includes typed, checked and submitter values",
		target.pathname === "/send" &&
			target.searchParams.get("name") === "hello" &&
			target.searchParams.get("agree") === "on" &&
			target.searchParams.get("which") === "go",
	);
	check(
		"Replacing the submitted document closes its native mouse state",
		loaded.interactions.mouse.metrics().closed,
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
				captures,
				page: page.metrics(),
				fixture:
					"actual PageScripts and command-host form flow over in-memory transport; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Agent Mono software control theme; rich button content, platform appearance, popups, text scrolling and broader CSS remain open",
			},
			null,
			2,
		),
	);
}
