import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
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
			'<style>html,body{margin:0;padding:0}select,input,button{font-size:8px}</style><form action="/chosen"><select id="pick" name="choice"><option value="a">Alpha</option><optgroup disabled><option>Blocked</option></optgroup><option value="b">Blue</option><option value="c">Black</option><option value="d">Green</option></select><input id="other"><button id="send">Send</button></form>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/typeahead"]);
await host.execute(["resize", "240", "100"]);
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
async function blur() {
	await host.execute(["press", "--target=#other", "ArrowRight"]);
}
async function press(key: string) {
	await host.execute(["press", "--target=#pick", "--", key]);
}
try {
	await guest(
		"Guest installs real keyboard and selection listeners",
		`
		var pick = document.getElementById("pick"); var trace = []; var block = false; var mutate = false;
		pick.addEventListener("keydown", function(event) { trace.push("down:" + pick.value); });
		pick.addEventListener("keypress", function(event) { trace.push("press:" + pick.value); if(block) event.preventDefault(); });
		pick.addEventListener("input", function(event) { trace.push("input:" + pick.value + ":" + event.composed + ":" + event.cancelable); if(mutate) pick.value = "a"; });
		pick.addEventListener("change", function(event) { trace.push("change:" + pick.value + ":" + event.composed); });
		pick.addEventListener("keyup", function(event) { trace.push("up:" + pick.value); });
		return pick.value === "a";
	`,
	);
	const initial = pixels();
	await press("b");
	await guest(
		"Label search skips disabled groups and exposes native selectedness",
		'return pick.value === "b" && pick.selectedIndex === 2 && pick.selectedOptions[0] === pick.options[2];',
	);
	await guest(
		"Typeahead delivers keypress before native input/change notifications",
		'return trace.join("|") === "down:a|press:a|input:b:true:false|change:b:false|up:b";',
	);
	const blue = pixels();
	check(
		"Typeahead changes the actual software-rendered control",
		initial !== blue,
	);
	await press("l");
	await press("a");
	await guest(
		"Successive keys refine the same live prefix",
		'return pick.value === "c";',
	);
	check(
		"Prefix refinement paints a different selected label",
		pixels() !== blue,
	);
	await blur();
	await press("b");
	await host.execute(["keydown", "b"]);
	await host.execute(["keydown", "b"]);
	await host.execute(["keyup", "b"]);
	await guest(
		"Refocus resets the prefix and held repeats cycle matching labels",
		'return pick.value === "b";',
	);
	await guest(
		"Guest arms keypress cancellation",
		"block = true; trace = []; return true;",
	);
	await press("g");
	await guest(
		"Canceled keypress leaves selectedness unchanged and still releases the key",
		'return pick.value === "b" && trace.join("|") === "down:b|press:b|up:b";',
	);
	await guest(
		"Guest changes a live display label",
		'block = false; pick.options[4].label = "Orange"; return pick.options[4].label === "Orange";',
	);
	await blur();
	await press("o");
	await guest(
		"Subsequent native search observes the guest label mutation",
		'return pick.value === "d" && pick.selectedOptions[0].label === "Orange";',
	);
	await guest(
		"Guest arms input-time selectedness mutation",
		"mutate = true; trace = []; return true;",
	);
	await blur();
	await press("b");
	await guest(
		"Change listeners retain the current value after input-time mutation",
		'return pick.value === "a" && trace.join("|") === "down:d|press:d|input:b:true:false|change:a:false|up:a";',
	);
	await guest("Guest removes mutation mode", "mutate = false; return true;");
	await blur();
	await press("o");
	const submitted = await host.execute(["click", "#send"]);
	check(
		"Submission uses the actual typeahead-selected form value",
		!!(submitted.data as { navigation?: unknown }).navigation &&
			requests.length === 2 &&
			new URL(requests[1]).searchParams.get("choice") === "d",
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
					"production command host and PageScripts over an in-memory visible form; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Single-select bounded software typeahead; native clock-boundary tests are separate, no popup, multiple selection, full locale collation or live-site parity",
			},
			null,
			2,
		),
	);
}
