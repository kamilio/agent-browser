import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
let requests = 0;
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests++;
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
			requests,
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
			'<!doctype html><style>html{font-size:20px}html,body{margin:0;padding:0}main{width:240px}#target{font-size:12px;box-sizing:border-box;width:calc(100% - var(--gap, 2rem));height:clamp(20px, 2em + 1rem, 60px);padding:calc(.5em + 2px) min(10%, 20px);border:calc(1px + 1px) solid red;background:blue}</style><main id="parent"><button id="change">Change size</button><div id="target">CSS math</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/css-math"]);
await host.execute(["resize", "300", "160"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, result: boolean) {
	checks.push({ label, passed: result });
	if (!result) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(loaded.document).image.pixels)
		.digest("hex");
try {
	await guest(
		"Actual SafeJS reads native calc, comparison and shorthand used values",
		'var root = document.documentElement; var target = document.getElementById("target"); var parent = document.getElementById("parent"); var live = getComputedStyle(target); return live.width === "200px" && live.height === "44px" && live.paddingTop === "8px" && live.paddingLeft === "20px" && live.borderTopWidth === "2px";',
	);
	await guest(
		"Actual bounding geometry shares the calculated border box",
		"var beforeRect = target.getBoundingClientRect(); return beforeRect.width === 200 && beforeRect.height === 44;",
	);
	await guest(
		"Changing the containing block reevaluates percentage expressions",
		'parent.style.width = "200px"; return live.width === "160px" && beforeRect.width === 200;',
	);
	await guest(
		"Root font changes invalidate rem leaves",
		'root.style.fontSize = "30px"; return live.width === "140px" && live.height === "54px";',
	);
	await guest(
		"Own font changes update em and apply the upper clamp only at the top level",
		'target.style.fontSize = "20px"; return live.height === "60px" && live.paddingTop === "12px";',
	);
	await guest(
		"Page listener uses the ordinary inline custom-property owner",
		'document.getElementById("change").addEventListener("click", function() { parent.style.setProperty("--gap", "1rem"); }); return parent.style.getPropertyValue("--gap") === "";',
	);
	const before = pixels();
	await host.execute(["click", "#change"]);
	await guest(
		"Production CLI activation changes the interpreted formula",
		'return live.width === "170px" && target.getBoundingClientRect().width === 170;',
	);
	check("CLI math mutation changes native raster pixels", pixels() !== before);
	await guest(
		"CSSOM shorthand splitting preserves nested functions",
		'target.style.padding = "calc(1px + 2px) max(1px, 2px)"; return live.paddingTop === "3px" && live.paddingLeft === "2px";',
	);
	await guest(
		"CSSOM math setter preserves the previous value on invalid numeric addition",
		'target.style.width = "calc(50% + 10px)"; target.style.width = "calc(1 + 2px)"; return live.width === "110px";',
	);
	await guest(
		"Negative top-level sizes clamp while signed margins stay negative",
		'target.style.width = "calc(1px - 5px)"; target.style.marginTop = "calc(1px - 5px)"; target.style.padding = "0px"; target.style.borderWidth = "0px"; return live.width === "0px" && live.marginTop === "-4px";',
	);
	await guest(
		"Indefinite percentage height uses both naturally wrapped text lines",
		'target.style.height = "calc(50% + 10px)"; target.style.width = "100px"; return live.height === "50px";',
	);
	await guest(
		"Definite parent height provides the percentage basis",
		'parent.style.height = "200px"; return live.height === "110px";',
	);
	await guest(
		"Viewport units remain independent of containing-block width",
		'target.style.width = "calc(50% + 10vw)"; return true;',
	);
	await host.execute(["resize", "400", "300"]);
	await guest(
		"Production resize invalidates the formula through existing owners",
		'return live.width === "140px";',
	);
	check(
		"Math, CSSOM and layout changes make no network requests",
		requests === 1,
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
				transport: { requests, closed: transportClosed },
				fixture:
					"Actual interpreted CSSOM and production CLI over synthetic in-memory HTML; no network or sockets",
				runtime:
					"Existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Finite box-length calc/min/max/clamp profile only; no dimensional division, nonfinite values, full CSS serialization, full layout or browser conformance",
			},
			null,
			2,
		),
	);
}
