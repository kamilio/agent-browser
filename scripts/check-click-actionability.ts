import { BrowserCommandHost } from "../src/command-host.js";
import { documentScroll } from "../src/document-scroll.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import type { NetworkRequest } from "../src/network.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: NetworkRequest[] = [];
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(request) {
			requests.push(request);
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
			'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px;margin-top:200px}#overlay{display:none;position:relative;top:-20px;width:40px;height:20px;z-index:1}#link{display:block;width:60px;height:20px}</style><button id="target">Go</button><div id="overlay"></div><p id="output">initial</p><a id="link" href="/next">Next</a>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/click-actionability"]);
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
		"Guest installs real scroll, pointer and focus listeners on an offscreen target",
		'var target = document.getElementById("target"); var overlay = document.getElementById("overlay"); var output = document.getElementById("output"); var trace = []; var clicks = 0; var coverOnDown = false; var identity = ""; document.addEventListener("scroll", function () { trace.push("scroll"); }); target.addEventListener("mousemove", function () { trace.push("move"); }); target.addEventListener("mousedown", function () { trace.push("down"); if (coverOnDown) overlay.style.pointerEvents = "auto"; }); target.addEventListener("focus", function () { trace.push("focus"); }); target.addEventListener("mouseup", function () { trace.push("up"); }); target.addEventListener("click", function (event) { trace.push("click"); clicks++; identity = event.pointerType + ":" + event.pointerId; output.textContent = "clicked:" + clicks; }); return target.getBoundingClientRect().top >= 200;',
	);
	observations.push(await host.execute(["click", "#target"]));
	await guest(
		"Production selector click scrolls, moves, presses, focuses, releases and clicks in order",
		'return trace.join(",") === "scroll,move,down,focus,up,click" && clicks === 1 && identity === "mouse:1" && document.activeElement === target && output.textContent === "clicked:1";',
	);
	check(
		"The authoritative root scroll owner moved",
		documentScroll(loaded.document).get().y === 140,
	);
	await guest(
		"Guest covers the target with a real overlapping layout box",
		'overlay.style.display = "block"; trace = []; return overlay.getBoundingClientRect().top === target.getBoundingClientRect().top;',
	);
	let timedOut = false;
	try {
		await host.execute(["click", "#target", "--timeout=30"]);
	} catch (error) {
		timedOut = error instanceof AgentBrowserError && error.code === "timeout";
	}
	check("A covered selector click times out before dispatch", timedOut);
	await guest(
		"Waiting did not fire pointer events or duplicate a click",
		"return trace.length === 0 && clicks === 1;",
	);
	await guest(
		"Guest makes the overlay pointer-transparent",
		'overlay.style.pointerEvents = "none"; return getComputedStyle(overlay).pointerEvents === "none";',
	);
	await host.execute(["click", "#target"]);
	await guest(
		"The next command reaches the actual target through pointer exclusion",
		'return clicks === 2 && trace.join(",") === "move,down,up,click";',
	);
	await guest(
		"Arms a guest mousedown handler that changes the receiving element",
		"coverOnDown = true; trace = []; return true;",
	);
	let intercepted = false;
	try {
		await host.execute(["click", "#target"]);
	} catch (error) {
		intercepted =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check(
		"Post-mousedown interception fails without redirecting or replaying the click",
		intercepted,
	);
	await guest(
		"Only the already-dispatched move/down callbacks ran",
		'return clicks === 2 && trace.join(",") === "move,down";',
	);
	check(
		"Failure released the gesture's button and mouse lock",
		loaded.interactions.mouse.metrics().buttons === 0 &&
			!loaded.interactions.mouse.metrics().busy,
	);
	await guest(
		"Removes the race for a later independent command",
		'coverOnDown = false; overlay.style.pointerEvents = "none"; trace = []; return true;',
	);
	await host.execute(["click", "#target"]);
	await guest(
		"The command queue and target remain usable after the failed gesture",
		'return clicks === 3 && trace.join(",") === "move,down,up,click";',
	);
	check(
		"All interaction checks used one synthetic document request",
		requests.length === 1,
	);
	const navigated = await host.execute(["click", "#link"]);
	observations.push(navigated);
	check(
		"A receiving link performs its default navigation exactly once",
		requests.length === 2 && requests[1].url === "https://fixture.invalid/next",
	);
	await page.close();
	host.close();
	check(
		"Runtime, session and synthetic transport close",
		page.metrics().closed && transportClosed && session.metrics().closed,
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
				requests: requests.map((request) => ({
					url: request.url,
					method: request.method ?? "GET",
				})),
				transportClosed,
				fixture:
					"Production CLI/session click path with actual experimental-SafeJS handlers and a synthetic transport; no network or sockets",
				limitations:
					"Supported-layout sampled hit points and root scroll only; no stable animation frames, nested scrolling, full ARIA retargeting, force click, guest HTMLElement.click, released-runtime throughput, real-site or deployment acceptance",
			},
			null,
			2,
		),
	);
}
