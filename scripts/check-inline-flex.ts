import { BrowserCommandHost } from "../src/command-host.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
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
			'<!doctype html><style>html{font-size:8px}main{width:60px}#atom{display:inline-flex;gap:3px;padding:2px;border:1px solid red}#first{background:lime}#second{background:blue}</style><main id="host">A<span id="atom"><div id="first">aa</div><div id="second">bb</div></span>Z</main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/inline-flex"]);
await host.execute(["resize", "160", "100"]);
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
function pixel(x: number, y: number) {
	const image = rasterizeDocument(loaded.document).image;
	const start = (y * image.width + x) * 4;
	return [...image.pixels.subarray(start, start + 4)].join(",");
}
try {
	await guest(
		"Guest reads actual inline-flex border and child geometry",
		'var atom = document.getElementById("atom"); var first = document.getElementById("first"); var second = document.getElementById("second"); var parent = document.getElementById("host"); var original = atom.getBoundingClientRect(); return original.x === 6 && original.y === 0 && original.width === 33 && original.height === 16 && first.getBoundingClientRect().x === 9 && second.getBoundingClientRect().x === 24;',
	);
	await guest(
		"Atomic markers do not duplicate client rectangles",
		'return atom.getClientRects().length === 1 && getComputedStyle(atom).width === "27px" && getComputedStyle(atom).marginRight === "0px";',
	);
	check(
		"Native raster paints the atomic border and child backgrounds",
		pixel(6, 0) === "255,0,0,255" &&
			pixel(19, 11) === "0,255,0,255" &&
			pixel(34, 11) === "0,0,255,255",
	);
	await guest(
		"Guest hit testing uses the shared atomic paint order",
		"return document.elementFromPoint(19, 11) === first && document.elementFromPoint(34, 11) === second && document.elementFromPoint(6, 0) === atom;",
	);
	await guest(
		"Guest registers a CLI action listener",
		'second.addEventListener("click", function () { atom.style.flexDirection = "column"; }); return true;',
	);
	await host.execute(["click", "#second"]);
	await guest(
		"Production CLI click reflows the atomic column",
		"return atom.getBoundingClientRect().width === 18 && atom.getBoundingClientRect().height === 29 && second.getBoundingClientRect().y === 16;",
	);
	await guest(
		"Guest changes width and observes used computed values",
		'atom.style.width = "50%"; return atom.getBoundingClientRect().width === 36 && getComputedStyle(atom).width === "30px" && original.width === 33;',
	);
	await guest(
		"Guest switches to border-box sizing",
		'atom.style.boxSizing = "border-box"; return atom.getBoundingClientRect().width === 30 && getComputedStyle(atom).width === "30px";',
	);
	await guest(
		"Guest creates wrapped columns using real item widths",
		'atom.style.cssText = "display:inline-flex;flex-direction:column;flex-wrap:wrap;height:10px;gap:3px;padding:0;border:0"; return atom.getBoundingClientRect().width === 27 && first.getBoundingClientRect().x === 6 && second.getBoundingClientRect().x === 21;',
	);
	await guest(
		"Guest creates a nested atomic container with preserved node identity",
		'atom.style.cssText = "display:inline-flex;gap:3px;padding:0;border:0"; var inner = document.createElement("span"); inner.style.display = "inline-flex"; var leaf = document.createElement("div"); leaf.textContent = "Q"; inner.appendChild(leaf); first.appendChild(inner); return inner.getBoundingClientRect().width === 6 && leaf.getBoundingClientRect().x === inner.getBoundingClientRect().x && first.children[0] === inner;',
	);
	await guest(
		"Text mutation invalidates intrinsic and final geometry",
		'leaf.textContent = "QQ"; return inner.getBoundingClientRect().width === 12 && atom.getBoundingClientRect().width === 39;',
	);
	await guest(
		"Inline wrapping moves the entire atomic subtree",
		'parent.style.width = "30px"; return atom.getBoundingClientRect().x === 0 && atom.getBoundingClientRect().y === 10 && first.getBoundingClientRect().y === 10 && inner.getBoundingClientRect().y === 20;',
	);
	await guest(
		"Whole containing width controls shrink-to-fit after resize",
		'parent.style.width = "auto"; return atom.getBoundingClientRect().width === 39;',
	);
	await host.execute(["resize", "30", "100"]);
	await guest(
		"CLI viewport resize reflows the nested inline content",
		"return atom.getBoundingClientRect().width === 30 && inner.getBoundingClientRect().y === 20;",
	);
	check(
		"PDF consumes all actual placed glyphs once",
		renderDocumentPdf(loaded.document).metrics.glyphs === 8,
	);
	await guest(
		"Unsupported grid rejects and a supported revision recovers",
		'atom.style.display = "grid"; try { first.getBoundingClientRect(); return false; } catch (error) { atom.style.display = "inline-flex"; return atom.getBoundingClientRect().width === 30; }',
	);
	const capabilities = await host.execute(["capabilities"]);
	check(
		"Capability explicitly includes inline-flex layout",
		(capabilities.data as { flexStyles: { inlineFlex: boolean } }).flexStyles
			.inlineFlex,
	);
	check("No extra requests are needed for layout or scripting", requests === 1);
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
					"Existing experimental SafeJS, production CLI and native geometry/raster/PDF over one in-memory document; no sockets",
				limitations:
					"Not a real-site, released-runtime throughput, full CSS/font, live terminal/playground or Worker acceptance test",
			},
			null,
			2,
		),
	);
}
