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
			'<style>html,body{margin:0}select,button{display:block;font-size:8px}</style><form action="/send"><select id="pick" name="choice"><option value="a">Alpha</option><optgroup disabled><option value="skip">Skipped</option></optgroup><option value="b">Beta</option><option value="c">Gamma</option></select><button id="send">Send</button></form>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/select"]);
await host.execute(["resize", "180", "100"]);
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
function pixels() {
	return createHash("sha256")
		.update(rasterizeDocument(loaded.document).image.pixels)
		.digest("hex");
}
async function point(selector: string) {
	const id = new DocumentQueries(loaded.document).querySelector(selector);
	if (id === null) throw new Error("Missing visible control");
	const box = documentGeometry(loaded.document).getBoundingClientRect(id);
	await host.execute(["mousemove", String(box.x + 2), String(box.y + 2)]);
	await host.execute(["mousedown"]);
	return host.execute(["mouseup"]);
}
try {
	await guest(
		"Actual guest installs keyboard and select notification listeners",
		`
		var pick = document.getElementById("pick"); var trace = []; var block = false; var redirect = false;
		pick.addEventListener("keydown", function(event) { trace.push("down:" + pick.value); if(block) event.preventDefault(); });
		pick.addEventListener("input", function(event) { trace.push("input:" + pick.value + ":" + event.composed + ":" + event.cancelable); if(redirect) pick.value = "a"; });
		pick.addEventListener("change", function(event) { trace.push("change:" + pick.value + ":" + event.composed); });
		pick.addEventListener("keyup", function(event) { trace.push("up:" + pick.value); });
		return pick.value === "a";
	`,
	);
	await point("#pick");
	const initial = pixels();
	await host.execute(["press", "ArrowDown"]);
	await guest(
		"Arrow selection skips disabled optgroups and updates guest selectedIndex",
		'return pick.value === "b" && pick.selectedIndex === 2;',
	);
	await guest(
		"Native notifications reach guest listeners in order with correct flags",
		'return trace.join("|") === "down:a|input:b:true:false|change:b:false|up:b";',
	);
	check("Keyboard selection updates real visible pixels", initial !== pixels());
	await guest(
		"Guest arms keydown cancellation",
		"block = true; trace = []; return true;",
	);
	await host.execute(["press", "End"]);
	await guest(
		"Canceled keydown preserves selection and still emits keyup",
		'return pick.value === "b" && trace.join("|") === "down:b|up:b";',
	);
	await guest(
		"Guest enables input-time mutation",
		"block = false; redirect = true; trace = []; return true;",
	);
	await host.execute(["press", "End"]);
	await guest(
		"Input-time selection mutation is retained for change listeners",
		'return pick.value === "a" && trace.join("|") === "down:b|input:c:true:false|change:a:false|up:a";',
	);
	await guest("Guest removes mutation mode", "redirect = false; return true;");
	await host.execute(["keydown", "ArrowDown"]);
	await host.execute(["keydown", "ArrowDown"]);
	await host.execute(["keyup", "ArrowDown"]);
	await guest(
		"Held key repeat advances the actual native selection",
		'return pick.value === "c";',
	);
	const submitted = await point("#send");
	check(
		"Visible submit uses the keyboard-selected successful form value",
		!!(submitted.data as { navigation?: unknown }).navigation &&
			requests.length === 2 &&
			new URL(requests[1]).searchParams.get("choice") === "c",
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
					"visible parsed form, production command host and PageScripts, in-memory transport only",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"single-select navigation keybindings; typeahead has a separate probe; no popup, multiple selection or OS parity",
			},
			null,
			2,
		),
	);
}
