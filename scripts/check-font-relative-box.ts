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
			'<!doctype html><style>html{font-size:20px}html,body{margin:0;padding:0}main{font-size:10px;width:240px}#target{font-size:12px;width:4em;height:2rem;padding:.5em 1rem;border:.25em solid red;background:blue}@media(max-width:200px){html{font-size:10px}}</style><main id="parent"><button id="change">Change fonts</button><div id="target">Relative boxes</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/font-units"]);
await host.execute(["resize", "300", "160"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
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
		"Actual computed styles distinguish own em and root rem bases",
		'var root = document.documentElement; var target = document.getElementById("target"); var parent = document.getElementById("parent"); var live = getComputedStyle(target); return live.width === "48px" && live.height === "40px" && live.paddingTop === "6px" && live.paddingLeft === "20px" && live.borderTopWidth === "3px";',
	);
	await guest(
		"Native geometry includes converted padding and borders",
		"var originalRect = target.getBoundingClientRect(); return originalRect.width === 94 && originalRect.height === 58;",
	);
	await guest(
		"Changing the root font invalidates rem without changing an explicit own em basis",
		'root.style.fontSize = "30px"; return live.width === "48px" && live.height === "60px" && live.paddingLeft === "30px" && target.getBoundingClientRect().width === 114;',
	);
	await guest(
		"Changing the element font updates em through an already obtained style object",
		'target.style.fontSize = "20px"; return live.width === "80px" && live.borderTopWidth === "5px" && target.getBoundingClientRect().width === 150 && originalRect.width === 94;',
	);
	await guest(
		"A page listener changes both font bases through normal CSSOM",
		'document.getElementById("change").addEventListener("click", function() { root.style.fontSize = "24px"; target.style.fontSize = "16px"; }); return target.style.fontSize === "20px";',
	);
	const before = pixels();
	await host.execute(["click", "#change"]);
	await guest(
		"Production CLI activation invokes the interpreted font update",
		'return live.width === "64px" && live.height === "48px" && target.getBoundingClientRect().width === 120 && target.getBoundingClientRect().height === 72;',
	);
	check(
		"Native pixels change after the interpreted font update",
		pixels() !== before,
	);
	await guest(
		"Root font-size rem resolves from the initial font before other rem boxes",
		'root.style.fontSize = "2rem"; return getComputedStyle(root).fontSize === "32px" && live.height === "64px" && live.paddingLeft === "32px";',
	);
	await guest(
		"Inherited variable tokens use the consuming element's current font",
		'root.style.setProperty("--Box", "2em"); target.style.width = "var(--Box)"; return target.style.width === "var(--Box)" && live.width === "32px";',
	);
	await guest(
		"Explicit inherit copies computed pixels rather than reusing the child's font",
		'parent.style.width = "2em"; target.style.width = "inherit"; return getComputedStyle(parent).width === "20px" && live.width === "20px";',
	);
	await guest(
		"Signed em margins preserve fractional conversion",
		'target.style.marginLeft = "-.25em"; return live.marginLeft === "-4px";',
	);
	await guest(
		"Relative borders retain the existing minimum-pixel snapping profile",
		'target.style.borderTopWidth = ".01em"; return live.borderTopWidth === "1px";',
	);
	await guest(
		"Removing a root inline override restores stylesheet font selection",
		'root.style.removeProperty("font-size"); return getComputedStyle(root).fontSize === "20px" && live.height === "40px";',
	);
	await host.execute(["resize", "150", "160"]);
	await guest(
		"A production viewport resize recomputes media-selected rem bases",
		'return getComputedStyle(root).fontSize === "10px" && live.height === "20px" && live.paddingLeft === "10px";',
	);
	check(
		"Font and layout changes do not perform network requests",
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
					"em/rem box lengths only; existing Agent Mono text and normal-flow layout profiles; no ex/ch/lh/rlh support, math functions, font loading or full browser conformance",
			},
			null,
			2,
		),
	);
}
