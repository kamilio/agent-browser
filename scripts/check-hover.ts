import { BrowserCommandHost } from "../src/command-host.js";
import { documentScroll } from "../src/document-scroll.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(request) {
			requests.push(request.url);
			return {
				url: request.url,
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
			'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px;margin-top:200px}#overlay{display:none;position:relative;top:-20px;width:40px;height:20px;z-index:1}</style><button id="target" disabled aria-disabled="true">Go</button><div id="overlay"></div><p id="output">initial</p>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/hover"]);
await host.execute(["resize", "100", "80"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
const observations: unknown[] = [];
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
		"Guest installs real pointer boundary, movement and scroll handlers",
		'var target = document.getElementById("target"); var overlay = document.getElementById("overlay"); var output = document.getElementById("output"); var trace = []; var moves = 0; var buttons = -1; var coverOnMove = false; document.addEventListener("scroll", function () { trace.push("scroll"); }); target.addEventListener("mouseover", function () { trace.push("over"); }); target.addEventListener("mouseenter", function () { trace.push("enter"); }); target.addEventListener("mousemove", function (event) { trace.push("move"); moves++; buttons = event.buttons; output.textContent = "hovered:" + moves; if (coverOnMove) overlay.style.pointerEvents = "auto"; }); target.addEventListener("mousedown", function () { trace.push("down"); }); target.addEventListener("mouseup", function () { trace.push("up"); }); target.addEventListener("click", function () { trace.push("click"); }); target.addEventListener("focus", function () { trace.push("focus"); }); return target.disabled && target.getAttribute("aria-disabled") === "true";',
	);
	observations.push(
		await host.execute(["hover", 'getByRole("button", { name: "Go" })']),
	);
	await guest(
		"Disabled and ARIA-disabled selector hover scrolls and moves without activation or focus",
		'return trace.join(",") === "scroll,over,enter,move" && output.textContent === "hovered:1" && document.activeElement !== target && buttons === 0;',
	);
	check(
		"Root scroll uses the document owner",
		documentScroll(loaded.document).get().y === 140,
	);
	await guest(
		"Guest covers the hovered element with real layout",
		'overlay.style.display = "block"; trace = []; return overlay.getBoundingClientRect().top === target.getBoundingClientRect().top;',
	);
	let timeout = false;
	try {
		await host.execute(["hover", "#target", "--timeout=30"]);
	} catch (error) {
		timeout = error instanceof AgentBrowserError && error.code === "timeout";
	}
	check("Covered hover times out before dispatch", timeout);
	await guest(
		"No movement or activation was replayed during waiting",
		"return trace.length === 0 && moves === 1;",
	);
	await guest(
		"Guest makes the overlay transparent to pointer hits",
		'overlay.style.pointerEvents = "none"; return getComputedStyle(overlay).pointerEvents === "none";',
	);
	await host.execute(["hover", "#target"]);
	await guest(
		"Independent hover succeeds through the transparent overlay",
		'return trace.join(",") === "move" && moves === 2 && output.textContent === "hovered:2";',
	);
	await guest(
		"Guest arms a movement-time interception",
		"coverOnMove = true; trace = []; return true;",
	);
	let intercepted = false;
	try {
		await host.execute(["hover", "#target"]);
	} catch (error) {
		intercepted =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check(
		"Post-movement interception is reported instead of silently succeeding",
		intercepted,
	);
	await guest(
		"The already-dispatched movement ran once without replay or activation",
		'return trace.join(",") === "move" && moves === 3;',
	);
	check(
		"Interception releases the mouse lock",
		loaded.interactions.mouse.metrics().busy === false,
	);
	await guest(
		"Guest removes interception for a later independent command",
		'coverOnMove = false; overlay.style.pointerEvents = "none"; trace = []; return true;',
	);
	await host.execute(["mousemove", "90", "0"]);
	await host.execute(["mousedown", "left"]);
	observations.push(await host.execute(["hover", "#target"]));
	await guest(
		"Hover preserves an existing held button without down, up, focus or click",
		'return buttons === 1 && moves === 4 && trace.indexOf("down") === -1 && trace.indexOf("up") === -1 && trace.indexOf("click") === -1 && trace.indexOf("focus") === -1;',
	);
	check(
		"The existing button remains held",
		loaded.interactions.mouse.metrics().buttons === 1,
	);
	await host.execute(["mousemove", "90", "0"]);
	await host.execute(["mouseup", "left"]);
	check("Hover did not navigate or make extra requests", requests.length === 1);
	await page.close();
	host.close();
	check(
		"Runtime, session and synthetic transport close",
		page.metrics().closed && session.metrics().closed && transportClosed,
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
				observations,
				page: page.metrics(),
				requests,
				transportClosed,
				fixture:
					"Shared production CLI/session hover with actual experimental-SafeJS listeners and synthetic transport; no network or sockets",
				limitations:
					"Supported layout, sampled receiving points and root scrolling with partial mouse and Space/Enter CSS activation; no full keyboard defaults, stable frames, nested scrolling, full pointer streams, external CLI/PTY, live-site, released-runtime throughput or deployment acceptance",
			},
			null,
			2,
		),
	);
}
