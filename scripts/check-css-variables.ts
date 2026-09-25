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
			'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px}:root{--Width:40px;--Color:red;--Space:2px 4px;--empty:;--invalid:initial}#target{display:block;width:var(--Width);height:20px;margin:var(--Space);background-color:var(--Color);border:var(--Border,1px solid black)}</style><button id="change">Change theme</button><div id="target">Variable content</div>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/variables"]);
await host.execute(["resize", "200", "100"]);
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
		"Interpreted computed styles expose initial variable-driven geometry and paint",
		'var root = document.documentElement; var target = document.getElementById("target"); var live = getComputedStyle(target); return live.width === "40px" && live.backgroundColor === "rgb(255, 0, 0)" && live.getPropertyValue("--Width") === "40px" && live.getPropertyValue("--width") === "";',
	);
	await guest(
		"Computed custom-property enumeration follows live additions and removals",
		'root.style.setProperty("--zLast", "marker"); var last = live.item(live.length - 1); root.style.removeProperty("--zLast"); return last === "--zLast" && live.item(live.length - 1) === "--empty";',
	);
	await guest(
		"Changing a root custom property updates a previously obtained style object",
		'root.style.setProperty("--Width", "80px"); return live.width === "80px" && target.getBoundingClientRect().width === 82;',
	);
	await guest(
		"Inline variable longhands preserve specified source and use the current scope",
		'target.style.width = "var(--Width)"; root.style.setProperty("--Width", "90px"); return target.style.width === "var(--Width)" && live.width === "90px";',
	);
	await guest(
		"Pending shorthand survives unrelated custom-property edits",
		'target.style.margin = "var(--Space)"; target.style.setProperty("--Space", "5px 9px"); return target.style.margin === "var(--Space)" && target.style.getPropertyValue("margin-left") === "" && live.marginLeft === "9px" && live.marginTop === "5px";',
	);
	await guest(
		"Valid empty values remain distinct from guaranteed-invalid values",
		'return live.getPropertyValue("--empty") === " " && live.getPropertyValue("--invalid") === "";',
	);
	await guest(
		"Case, quoted var text and custom-value comments survive CSSOM edits",
		`root.style.setProperty("--Label", '/*keep*/ "VAR(--Width)"'); return live.getPropertyValue("--Label") === '/*keep*/ "VAR(--Width)"';`,
	);
	await guest(
		"Evaluated cycles invalidate members while consumers can use fallback",
		'root.style.setProperty("--first", "var(--second, red)"); root.style.setProperty("--second", "var(--first, green)"); target.style.backgroundColor = "var(--first,blue)"; return live.getPropertyValue("--first") === "" && live.getPropertyValue("--second") === "" && live.backgroundColor === "rgb(0, 0, 255)";',
	);
	await guest(
		"Unused fallback cycles do not poison valid primary references",
		'root.style.setProperty("--safe", "red"); root.style.setProperty("--first", "var(--safe,var(--second))"); root.style.setProperty("--second", "var(--safe,var(--first))"); return live.getPropertyValue("--first") === "red" && live.backgroundColor === "rgb(255, 0, 0)";',
	);
	await guest(
		"Invalid target-property values do not select the variable fallback",
		'target.style.backgroundColor = "var(--Width,blue)"; return live.backgroundColor === "rgba(0, 0, 0, 0)";',
	);
	await guest(
		"Empty substitution does not merge a number and identifier into a dimension",
		'target.style.width = "var(--missing,10)px"; return live.width !== "10px";',
	);
	await guest(
		"A page listener changes the native theme through normal CSSOM",
		'target.style.width = "var(--Width)"; target.style.backgroundColor = "var(--Color)"; document.getElementById("change").addEventListener("click", function() { root.style.setProperty("--Color", "blue"); root.style.setProperty("--Width", "120px"); }); return live.backgroundColor === "rgb(255, 0, 0)";',
	);
	const before = pixels();
	await host.execute(["click", "#change"]);
	await guest(
		"The production agent click invokes the interpreted theme update",
		'return live.width === "120px" && live.backgroundColor === "rgb(0, 0, 255)" && target.getBoundingClientRect().width === 122;',
	);
	check(
		"Native raster pixels change after the interpreted click",
		pixels() !== before,
	);
	await guest(
		"Unrepresentable partial shorthand removal rejects without erasing style state",
		'var saved = target.style.cssText; var rejected = false; try { target.style.removeProperty("margin-left"); } catch(error) { rejected = true; } return rejected && target.style.cssText === saved;',
	);
	await guest(
		"Whole pending shorthand removal remains supported",
		'return target.style.removeProperty("margin") === "var(--Space)" && target.style.margin === "";',
	);
	await guest(
		"Detachment revokes resolved custom-property visibility",
		'target.remove(); return live.getPropertyValue("--Width") === "";',
	);
	check(
		"No action or variable resolution triggers additional network requests",
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
					"Actual interpreted CSSOM and production CLI on synthetic in-memory content; no network or sockets",
				runtime:
					"Existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Unregistered custom properties over existing renderer property grammar; no @property, animation taint, expanded pending-shorthand CSSOM enumeration, partial pending-shorthand removal or full browser/site conformance",
			},
			null,
			2,
		),
	);
}
