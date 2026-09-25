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
			'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}button{display:block;width:40px;height:20px;background:blue}#target:active{background:red}</style><main id="parent"><button id="target" type="button">Go</button><button id="other" type="button">Other</button><input id="check" type="checkbox"></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/keyboard-active"]);
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
try {
	await guest(
		"Guest installs real key/click callbacks that read native CSS activation",
		'var target = document.getElementById("target"); var other = document.getElementById("other"); var parent = document.getElementById("parent"); var checkControl = document.getElementById("check"); var trace = []; var clicks = 0; var cancelUp = false; var identity = ""; target.addEventListener("keydown", function () { trace.push("down:" + target.matches(":active")); }); target.addEventListener("keypress", function () { trace.push("press:" + target.matches(":active")); }); target.addEventListener("keyup", function (event) { trace.push("up:" + target.matches(":active")); if (cancelUp) event.preventDefault(); }); target.addEventListener("click", function (event) { trace.push("click:" + target.matches(":active")); clicks++; identity = event.pointerId + ":" + event.pointerType; }); other.addEventListener("mousedown", function (event) { event.preventDefault(); }); return !target.matches(":active");',
	);
	await host.execute(["press", "Home", "--target", "#target"]);
	await guest(
		"Targeted press establishes focus without activation",
		'trace = []; return document.activeElement === target && !target.matches(":active");',
	);
	await host.execute(["keydown", "Space"]);
	await guest(
		"Held Space activates after key callbacks and propagates to ancestors",
		'return target.matches(":active") && parent.matches(":active") && !target.matches(":hover") && trace.join(",") === "down:false,press:false" && clicks === 0;',
	);
	const image = rasterizeDocument(loaded.document).image;
	const offset = (18 * image.width + 2) * 4;
	check(
		"The shared raster paints held-key active styling",
		[...image.pixels.slice(offset, offset + 4)].join(",") === "255,0,0,255",
	);
	await host.execute(["keyup", "Space"]);
	await guest(
		"Space release clears state before keyup and non-pointer click",
		'return !target.matches(":active") && trace.join(",") === "down:false,press:false,up:false,click:false" && clicks === 1 && identity === "-1:";',
	);
	await guest("Guest clears the trace for Enter", "trace = []; return true;");
	await host.execute(["press", "Enter"]);
	await guest(
		"Enter is active during its direct click, not after command completion",
		'return trace.join(",") === "down:false,press:false,click:true,up:false" && !target.matches(":active") && clicks === 2;',
	);
	await guest(
		"Guest cancels the next Space release",
		"cancelUp = true; trace = []; return true;",
	);
	await host.execute(["keydown", "Space"]);
	await host.execute(["keyup", "Space"]);
	await guest(
		"Canceled keyup clears formal state and suppresses activation",
		"cancelUp = false; return !target.matches(':active') && clicks === 2;",
	);
	await host.execute(["keydown", "Space"]);
	await host.execute(["press", "Tab"]);
	await guest(
		"Moving focus cancels the old active intent",
		'return document.activeElement === other && !target.matches(":active");',
	);
	await host.execute(["press", "Shift+Tab"]);
	await host.execute(["keyup", "Space"]);
	await guest(
		"Returning focus cannot revive a canceled held intent",
		"return document.activeElement === target && clicks === 2;",
	);
	await host.execute(["keydown", "Space"]);
	await host.execute(["keydown", "Space"]);
	await guest(
		"Repeated Space down keeps one formal hold without clicking",
		'return target.matches(":active") && clicks === 2;',
	);
	await host.execute(["keyup", "Space"]);
	await guest(
		"One release activates the repeated hold once",
		"return clicks === 3 && !target.matches(':active');",
	);
	await host.execute(["keydown", "Space"]);
	await host.execute(["hover", "#other"]);
	await host.execute(["mousedown", "left"]);
	await guest(
		"Mouse and keyboard origins can match active simultaneously",
		'return document.activeElement === target && target.matches(":active") && other.matches(":active");',
	);
	await host.execute(["keyup", "Space"]);
	await guest(
		"Releasing Space preserves the unrelated mouse activation",
		'return !target.matches(":active") && other.matches(":active");',
	);
	await host.execute(["mouseup", "left"]);
	await host.execute(["press", "Home", "--target", "#check"]);
	await host.execute(["keydown", "Space"]);
	await guest(
		"Checkbox activation is held without prematurely changing checked state",
		'return checkControl.matches(":active") && !checkControl.checked;',
	);
	await host.execute(["keyup", "Space"]);
	await guest(
		"Checkbox release clears active state and applies its default once",
		'return !checkControl.matches(":active") && checkControl.checked;',
	);
	check(
		"Keyboard interaction made no extra navigation requests",
		requests.length === 1,
	);
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
				page: page.metrics(),
				requests,
				transportClosed,
				fixture:
					"Actual experimental-SafeJS CSS queries/key/click callbacks and native raster through production shared CLI/session commands, with synthetic transport; no network or sockets",
				limitations:
					"Supported native Space controls and direct Enter activation only; not custom-role keyboard defaults, implicit submitter styling, OS/IME, live UI/sites, released-runtime throughput or deployment acceptance",
			},
			null,
			2,
		),
	);
}
