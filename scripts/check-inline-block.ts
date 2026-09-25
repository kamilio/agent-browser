import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
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
			'<!doctype html><style>html{font-size:8px}main{width:60px}#atom{display:inline-block;padding:3px;border:1px solid red}#first{background:lime}#second{background:blue}</style><main id="host">A<span id="atom"><div id="first">aa</div><div id="second">bb</div></span>Z</main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/inline-block"]);
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
function pixel(pixelX: number, pixelY: number) {
	const image = rasterizeDocument(loaded.document).image;
	const start = (pixelY * image.width + pixelX) * 4;
	return [...image.pixels.subarray(start, start + 4)].join(",");
}
try {
	await guest(
		"Guest reads real inline-block and descendant geometry",
		'var atom = document.getElementById("atom"); var first = document.getElementById("first"); var second = document.getElementById("second"); var parent = document.getElementById("host"); var original = atom.getBoundingClientRect(); return original.x === 6 && original.y === 0 && original.width === 20 && original.height === 28 && first.getBoundingClientRect().x === 10 && first.getBoundingClientRect().y === 4 && second.getBoundingClientRect().y === 14;',
	);
	await guest(
		"Guest sees one rectangle and actual content-box computed width",
		'return atom.getClientRects().length === 1 && getComputedStyle(atom).width === "12px" && getComputedStyle(atom).height === "20px" && getComputedStyle(atom).marginRight === "0px";',
	);
	const hostId = new DocumentQueries(loaded.document).querySelector("#host");
	if (hostId === null) throw Error("Missing host");
	const context = layoutDocument(loaded.document).contexts.find(
		(entry) => entry.ref === loaded.document.reference(hostId),
	);
	check(
		"Surrounding native glyphs align to the last in-flow baseline",
		context?.lines[0].baseline === 22 && context.glyphs[0].y === 15,
	);
	check(
		"Native raster paints real border and descendant backgrounds",
		pixel(6, 0) === "255,0,0,255" &&
			pixel(21, 13) === "0,255,0,255" &&
			pixel(21, 23) === "0,0,255,255",
	);
	await guest(
		"Guest hit testing follows actual atomic painting",
		"return document.elementFromPoint(20, 11) === first && document.elementFromPoint(20, 21) === second && document.elementFromPoint(6, 0) === atom;",
	);
	await guest(
		"Guest registers a production CLI action listener",
		'second.addEventListener("click", function () { atom.style.width = "30px"; }); return true;',
	);
	await host.execute(["click", "#second"]);
	await guest(
		"CLI click updates intrinsic-independent used width",
		"return atom.getBoundingClientRect().width === 38 && first.getBoundingClientRect().width === 30 && original.width === 20;",
	);
	await guest(
		"Explicit height does not clip visible overflow or alter child geometry",
		'atom.style.height = "10px"; return atom.getBoundingClientRect().height === 18 && second.getBoundingClientRect().y === 14 && second.getBoundingClientRect().height === 10;',
	);
	await guest(
		"Guest creates a nested inline block with stable identity",
		'var inner = document.createElement("span"); inner.style.display = "inline-block"; inner.textContent = "Q"; second.appendChild(inner); return inner.getBoundingClientRect().width === 6 && inner.getBoundingClientRect().x === 22 && inner.getBoundingClientRect().y === 14 && second.children[0] === inner;',
	);
	await guest(
		"Text mutation wraps the nested atom without resizing a definite-height root",
		'inner.textContent = "QQQQ"; return inner.getBoundingClientRect().width === 24 && inner.getBoundingClientRect().y === 24 && atom.getBoundingClientRect().height === 18;',
	);
	await guest(
		"Auto sizing observes the guest-mutated nested intrinsic content",
		'atom.style.width = "auto"; atom.style.height = "auto"; return atom.getBoundingClientRect().width === 44 && atom.getBoundingClientRect().height === 28 && inner.getBoundingClientRect().y === 14;',
	);
	await guest(
		"A narrower containing block moves and reflows the complete atom",
		'parent.style.width = "30px"; return atom.getBoundingClientRect().x === 0 && atom.getBoundingClientRect().y === 10 && atom.getBoundingClientRect().width === 32 && inner.getBoundingClientRect().y > second.getBoundingClientRect().y;',
	);
	await guest(
		"Guest returns to viewport-dependent containing width",
		'parent.style.width = "auto"; return atom.getBoundingClientRect().width === 44;',
	);
	await host.execute(["resize", "36", "100"]);
	await guest(
		"CLI resize resolves inline shrink-to-fit and nested wrapping",
		"return atom.getBoundingClientRect().width === 36 && atom.getBoundingClientRect().height === 38 && inner.getBoundingClientRect().y > second.getBoundingClientRect().y;",
	);
	check(
		"PDF receives each placed glyph exactly once",
		renderDocumentPdf(loaded.document).metrics.glyphs === 10,
	);
	await guest(
		"Unsupported overflow rejects and a visible revision recovers",
		'atom.style.overflow = "hidden"; try { first.getBoundingClientRect(); return false; } catch (error) { atom.style.overflow = "visible"; return atom.getBoundingClientRect().width === 36; }',
	);
	const capabilities = await host.execute(["capabilities"]);
	check(
		"Capability identifies inline-block and its qualified baseline profile",
		(
			capabilities.data as {
				atomicInlineLayout: {
					inlineBlock: boolean;
					inlineBlockBaseline: string;
				};
			}
		).atomicInlineLayout.inlineBlock &&
			(
				capabilities.data as {
					atomicInlineLayout: { inlineBlockBaseline: string };
				}
			).atomicInlineLayout.inlineBlockBaseline === "last-in-flow",
	);
	check(
		"Layout and scripting require only the synthetic document request",
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
					"Existing experimental SafeJS, production CLI and native geometry/raster/PDF over one in-memory document; no sockets",
				limitations:
					"Not a real-site, released-runtime throughput, full CSS/font, live terminal/playground or Worker acceptance test",
			},
			null,
			2,
		),
	);
}
