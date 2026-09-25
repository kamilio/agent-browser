import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { describeControl } from "../src/control-rendering.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { DocumentQueries } from "../src/selectors.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
let transportClosed = false;
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
			closed: transportClosed,
		}),
		close() {
			transportClosed = true;
		},
	}),
	loadDocument: (response) =>
		parseHtmlDocument(
			'<style>html,body{margin:0}input,textarea{display:block;font-size:8px}span{display:block;background-color:red}:placeholder-shown + span{background-color:green}</style><form id="form"><input id="field" placeholder="Hint"><span id="label">Name</span><textarea id="notes" placeholder="Notes" rows="3"></textarea><input id="changing" type="hidden" placeholder="Type"><span id="type-label">Type state</span><button id="reset" type="reset">Reset</button></form>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/placeholder"]);
await host.execute(["resize", "240", "200"]);
const loaded = session.page(session.tabs()[0].id);
const tree = loaded.document;
const page = new PageScripts(loaded, core);
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
function id(selector: string) {
	const value = queries.querySelector(selector);
	if (value === null) throw new Error(`Missing ${selector}`);
	return value;
}
function capture(label: string) {
	const raster = rasterizeDocument(tree);
	const sha256 = createHash("sha256").update(raster.image.pixels).digest("hex");
	captures.push({ label, sha256, controls: raster.metrics.paintedControls });
	return sha256;
}
try {
	await guest(
		"Guest selectors and computed styles see the initial empty controls",
		'var field = document.getElementById("field"); var notes = document.getElementById("notes"); var changing = document.getElementById("changing"); var form = document.getElementById("form"); var label = document.getElementById("label"); var saved = document.querySelectorAll(":placeholder-shown"); var observed = ""; field.addEventListener("input", function(){ observed = field.matches(":placeholder-shown") + ":" + getComputedStyle(label).backgroundColor; }); return saved.length === 2 && field.matches(":placeholder-shown") && notes.matches(":placeholder-shown") && !changing.matches(":placeholder-shown") && getComputedStyle(label).backgroundColor === "rgb(0, 128, 0)";',
	);
	const initial = capture("initial");
	await host.execute(["fill", tree.reference(id("#field")), "filled"]);
	await guest(
		"Command fill changes matching and CSS before the guest input listener",
		'return field.value === "filled" && !field.matches(":placeholder-shown") && observed === "false:rgb(255, 0, 0)" && saved.length === 2 && saved[0] === field;',
	);
	const filled = capture("filled");
	check(
		"Filled form pixels differ from the initial empty form",
		filled !== initial,
	);
	await host.execute(["fill", tree.reference(id("#field")), ""]);
	await guest(
		"Clearing a focused field restores placeholder state and guest-observed CSS",
		'return field.matches(":focus:placeholder-shown") && observed === "true:rgb(0, 128, 0)";',
	);
	check(
		"Cleared form pixels differ from the filled form",
		capture("cleared") !== filled,
	);
	await guest(
		"Empty reflected placeholders remain eligible; nonempty live values do not",
		'field.placeholder = ""; notes.placeholder = ""; var empty = field.matches(":placeholder-shown") && notes.matches(":placeholder-shown"); field.value = "No RED"; notes.value = "No RED"; return empty && !field.matches(":placeholder-shown") && !notes.matches(":placeholder-shown");',
	);
	await host.execute(["click", tree.reference(id("#reset"))]);
	await guest(
		"Command reset restores both empty default values and matching",
		'return field.value === "" && notes.value === "" && field.matches(":placeholder-shown") && notes.matches(":placeholder-shown");',
	);
	check(
		"Native rendering agrees that an empty hint is present",
		describeControl(tree, id("#field"), 8)?.placeholder === true,
	);
	await guest(
		"Changing hidden input to text invalidates sibling styling",
		'changing.type = ""; return changing.matches(":placeholder-shown") && getComputedStyle(document.getElementById("type-label")).backgroundColor === "rgb(0, 128, 0)";',
	);
	await guest(
		"Changing text input to checkbox removes placeholder matching",
		'changing.type = "checkbox"; return !changing.matches(":placeholder-shown") && getComputedStyle(document.getElementById("type-label")).backgroundColor === "rgb(255, 0, 0)";',
	);
	await guest(
		"Newline hints keep reflected attributes and control values separate",
		String.raw`field.placeholder = "first\r\nsecond"; notes.placeholder = "first\r\nsecond\rthird"; return field.placeholder === "first\r\nsecond" && notes.placeholder === "first\r\nsecond\rthird" && field.value === "" && notes.value === "";`,
	);
	check(
		"Input rendering strips hint newlines",
		describeControl(tree, id("#field"), 8)?.text === "firstsecond",
	);
	check(
		"Textarea rendering normalizes hint line breaks",
		describeControl(tree, id("#notes"), 8)?.text === "first\nsecond\nthird",
	);
	capture("normalized-hints");
	await guest(
		"Detached guest controls use local placeholder state and relational matching",
		'var detached = document.createElement("input"); detached.placeholder = ""; var local = detached.matches(":placeholder-shown"); form.appendChild(detached); return local && detached.closest(":placeholder-shown") === detached && form.matches(":has(> :placeholder-shown)");',
	);
	await guest(
		"Removing placeholders invalidates matching without changing old snapshots",
		'field.removeAttribute("placeholder"); detached.removeAttribute("placeholder"); return !field.matches(":placeholder-shown") && !detached.matches(":placeholder-shown") && saved.length === 2 && saved[0] === field;',
	);
	check(
		"Only the synthetic initial document request was used",
		requests.length === 1,
	);
	await page.close();
	await host.close();
	check(
		"Runtime, queries and transport close with the session",
		page.closed &&
			queries.metrics().closed &&
			queries.metrics().indexedNodes === 0 &&
			transportClosed,
	);
	passed = true;
} finally {
	await page.close();
	queries.close();
	await host.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				captures,
				requests,
				page: page.metrics(),
				fixture:
					"Actual experimental-SafeJS bindings, shared command host, native document/style/control/raster owners and one synthetic transport response; no network, sockets or external browser",
				limitations:
					"Functional form-state and shared-rendering evidence, not public-site, browser-reference pixel parity, guest-loop throughput or deployment acceptance",
			},
			null,
			2,
		),
	);
}
