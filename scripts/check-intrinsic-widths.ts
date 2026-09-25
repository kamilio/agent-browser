import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { measureIntrinsicWidths, resolveFlexLines } from "../src/index.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
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
			'<!doctype html><style>html{font-size:8px}html,body{margin:0;padding:0}main{width:120px}#first{background:blue}#second{background:red}</style><button id="change">Change words</button><main><div id="first">aa bbbb</div><div id="second">cc</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/intrinsic"]);
await host.execute(["resize", "200", "120"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const target = (selector: string) => {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture target");
	return id;
};
const read = (selector = "#first") => {
	const ref = loaded.document.reference(target(selector));
	const found = measureIntrinsicWidths(loaded.document).widths.find(
		(entry) => entry.ref === ref,
	);
	if (!found) throw new Error("Missing intrinsic result");
	return found;
};
const allocate = () =>
	resolveFlexLines(
		[read(), read("#second")].map((entry) => ({
			baseSize: entry.maxContent,
			minSize: entry.minContent,
			grow: 1,
		})),
		120,
	).lines[0];
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(loaded.document).image.pixels)
		.digest("hex");
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
		"Actual SafeJS sees the ordinary native document",
		'var first = document.getElementById("first"); var second = document.getElementById("second"); return first.textContent === "aa bbbb" && getComputedStyle(first).fontSize === "8px";',
	);
	check(
		"Initial native min/max widths come from real text",
		read().minContent === 24 && read().maxContent === 42,
	);
	const originalPixels = pixels();
	const before = documentGeometry(loaded.document).getBoundingClientRect(
		target("#first"),
	);
	const revision = loaded.document.revision;
	const initial = allocate();
	check(
		"The line kernel consumes measured, not zero or guessed, bases",
		initial.items[0].contentSize === 75 && initial.items[1].contentSize === 45,
	);
	check(
		"Measurement/allocation leave actual DOM geometry and pixels unchanged",
		loaded.document.revision === revision &&
			documentGeometry(loaded.document).getBoundingClientRect(target("#first"))
				.width === before.width &&
			pixels() === originalPixels,
	);
	await guest(
		"A page listener mutates text through the existing DOM owner",
		'document.getElementById("change").addEventListener("click", function() { first.textContent = "longerword"; }); return true;',
	);
	await host.execute(["click", "#change"]);
	check(
		"CLI-triggered page mutation changes intrinsic content widths",
		read().minContent === 60 && read().maxContent === 60,
	);
	check(
		"Text mutation changes the existing ordinary-flow raster",
		pixels() !== originalPixels,
	);
	const changed = allocate();
	check(
		"Measured flex allocations follow the changed content",
		changed.items[0].contentSize === 84 && changed.items[1].contentSize === 36,
	);
	await guest(
		"Interpreted font changes use the existing style owner",
		'first.style.fontSize = "16px"; second.style.fontSize = "16px"; return getComputedStyle(first).fontSize === "16px";',
	);
	const constrained = allocate();
	check(
		"Real min-content floors preserve overflow instead of shrinking words to zero",
		constrained.items[0].contentSize === 120 &&
			constrained.items[1].contentSize === 24 &&
			constrained.remainingFreeSpace === -24,
	);
	await guest(
		"CSSOM custom tokens and math change contribution edges",
		'first.style.setProperty("--edge", "3px"); first.style.padding = "calc(10% + var(--edge))"; return first.style.getPropertyValue("--edge") === "3px";',
	);
	check(
		"Cyclic edge percentages keep the substituted constant",
		read().minContribution === 126 && read().maxContribution === 126,
	);
	await guest(
		"CSSOM whitespace changes share the same measurement tokenization",
		'first.textContent = "a b"; first.style.whiteSpace = "nowrap"; return first.textContent === "a b";',
	);
	check(
		"No-wrap content has equal min/max widths",
		read().minContent === 36 && read().maxContent === 36,
	);
	await guest(
		"Switching back to normal whitespace restores soft breaks",
		'first.style.whiteSpace = "normal"; return getComputedStyle(first).whiteSpace === "normal";',
	);
	check(
		"Normal text exposes its longest word again",
		read().minContent === 12 && read().maxContent === 36,
	);
	check(
		"Measurement, allocation and guest changes make no extra requests",
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
					"Synthetic in-memory HTML with actual experimental SafeJS and production CLI actions; no sockets or public-site requests",
				limitations:
					"Native intrinsic measurements feed the numeric flex-line kernel, not a DOM flex renderer; ordinary-flow raster checks only; not released-SDK, font-shaping, real-site or Worker acceptance",
			},
			null,
			2,
		),
	);
}
