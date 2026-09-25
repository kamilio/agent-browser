import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
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
			'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#menu{width:60px}#trigger{display:block;width:40px;height:20px;background:blue}#trigger:hover{background:red;width:60px}#trigger:active{background:green}#submenu{display:none;width:60px;height:20px}#menu:hover #submenu{display:block}#label{display:block;width:40px;height:20px}#check{display:none}</style><nav id="menu"><button id="trigger">Menu</button><div id="submenu">Item</div></nav><label id="label" for="check">Check</label><section id="elsewhere"><input id="check" type="checkbox"></section>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/pointer-state"]);
await host.execute(["resize", "100", "80"]);
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
function pixel() {
	const image = rasterizeDocument(loaded.document).image;
	const offset = (18 * image.width + 2) * 4;
	return [...image.pixels.slice(offset, offset + 4)].join(",");
}
try {
	await guest(
		"Interpreted selectors initially have no pointer matches",
		'var trigger = document.getElementById("trigger"); var menu = document.getElementById("menu"); var submenu = document.getElementById("submenu"); var label = document.getElementById("label"); var checkControl = document.getElementById("check"); var elsewhere = document.getElementById("elsewhere"); var trace = []; trigger.addEventListener("mouseover", function () { trace.push("over:" + trigger.matches(":hover")); }); trigger.addEventListener("mousedown", function () { trace.push("down:" + trigger.matches(":active")); }); trigger.addEventListener("mouseup", function () { trace.push("up:" + trigger.matches(":active")); }); trigger.addEventListener("click", function () { trace.push("click:" + trigger.matches(":active")); }); return document.querySelectorAll(":hover, :active").length === 0 && getComputedStyle(submenu).display === "none";',
	);
	check(
		"Native raster starts with the stylesheet's blue background",
		pixel() === "0,0,255,255",
	);
	await host.execute(["hover", "#trigger"]);
	await guest(
		"Hover updates live matching, ancestors, computed style and geometry",
		'return trigger.matches(":hover") && menu.matches(":hover") && getComputedStyle(submenu).display === "block" && trigger.getBoundingClientRect().width === 60 && trace[0] === "over:true";',
	);
	check(
		"Native raster consumes the hovered red style",
		pixel() === "255,0,0,255",
	);
	await guest(
		"Existing logical selectors consume pointer state",
		'return document.querySelector("nav:has(> :hover)") === menu && document.querySelector("button:is(:hover):not(:active)") === trigger;',
	);
	await host.execute(["mousedown", "left"]);
	await guest(
		"Primary down publishes active to handlers and ancestors",
		'return trigger.matches(":active") && menu.matches(":active") && trace.indexOf("down:true") !== -1;',
	);
	check(
		"Native raster consumes the active green style",
		pixel() === "0,128,0,255",
	);
	await host.execute(["mouseup", "left"]);
	await guest(
		"Active clears before up and activation handlers",
		'return !trigger.matches(":active") && trigger.matches(":hover") && trace.indexOf("up:false") !== -1 && trace.indexOf("click:false") !== -1;',
	);
	await host.execute(["hover", "#submenu"]);
	await guest(
		"A stylesheet-only submenu stays open while its descendant receives hover",
		'return submenu.matches(":hover") && menu.matches(":hover") && !trigger.matches(":hover") && getComputedStyle(submenu).display === "block";',
	);
	await host.execute(["mousemove", "90", "70"]);
	await guest(
		"Leaving the menu removes its state and collapses the submenu",
		'return !menu.matches(":hover") && getComputedStyle(submenu).display === "none" && trigger.getBoundingClientRect().width === 40;',
	);
	await host.execute(["hover", "#label"]);
	await guest(
		"Hovered label forwards to its control, not the control's separate ancestor",
		'return label.matches(":hover") && checkControl.matches(":hover") && !elsewhere.matches(":hover");',
	);
	await host.execute(["mousedown", "left"]);
	await guest(
		"Active label forwarding has the same one-way ancestry rule",
		'return label.matches(":active") && checkControl.matches(":active") && !elsewhere.matches(":active");',
	);
	await host.execute(["mouseup", "left"]);
	await guest(
		"Release clears label-forwarded active state",
		'return !label.matches(":active") && !checkControl.matches(":active");',
	);
	await host.execute(["mousemove", "90", "70"]);
	await guest(
		"Changing styles remains live without injecting a second state model",
		'trigger.style.backgroundColor = "yellow"; return getComputedStyle(trigger).backgroundColor === "rgb(255, 255, 0)";',
	);
	check("State changes did not fetch or navigate", requests.length === 1);
	await page.close();
	host.close();
	check(
		"Runtime and native ownership close",
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
				page: page.metrics(),
				requests,
				transportClosed,
				fixture:
					"Actual experimental-SafeJS selectors/listeners through shared production CLI/session commands; synthetic transport and native raster, no network or sockets",
				limitations:
					"Single virtual mouse, ordinary DOM ancestry and label forwarding; keyboard Space/Enter activation is verified separately, not full keyboard defaults, touch, shadow tree, external CLI/PTY, live site, runtime-throughput or deployment acceptance",
			},
			null,
			2,
		),
	);
}
