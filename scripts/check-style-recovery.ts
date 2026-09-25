import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { AgentBrowserError } from "../src/errors.js";
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
			'<style>html{font-size:8px}#target{display:inline-block;width:20px}</style><main><span id="target">ab</span></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/style-recovery"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const target = new DocumentQueries(loaded.document).querySelector("#target");
if (target === null) throw Error("Missing target");
const steps = [
	[
		"capture",
		'var target = document.getElementById("target"); var declaration = target.style; return declaration.overflow;',
	],
	[
		"set-overflow",
		'declaration.overflow = "hidden"; return declaration.overflow;',
	],
	[
		"catch-geometry",
		'try { target.getBoundingClientRect(); return "rendered"; } catch (error) { return "caught"; }',
	],
	[
		"restore-overflow",
		'declaration.overflow = "visible"; return declaration.overflow;',
	],
	["read-restored-geometry", "return target.getBoundingClientRect().width;"],
	[
		"combined-overflow-recovery",
		'target.style.overflow = "hidden"; try { target.getBoundingClientRect(); return false; } catch (error) { target.style.overflow = "visible"; return target.getBoundingClientRect().width === 20; }',
	],
	[
		"set-position",
		'declaration.position = "absolute"; return declaration.position;',
	],
	[
		"restore-position",
		'declaration.position = "static"; return declaration.position;',
	],
	[
		"combined-position-recovery",
		'target.style.position = "absolute"; try { target.getBoundingClientRect(); return false; } catch (error) { target.style.position = "static"; return target.getBoundingClientRect().width === 20; }',
	],
	[
		"combined-display-recovery",
		'target.style.display = "inline-table"; try { target.getBoundingClientRect(); return false; } catch (error) { target.style.display = "inline-block"; return target.getBoundingClientRect().width === 20; }',
	],
	[
		"computed-neutral",
		'return getComputedStyle(target).position === "static" && getComputedStyle(target).overflow === "visible" && getComputedStyle(target).cssFloat === "none";',
	],
	[
		"computed-mixed",
		'declaration.overflow = "visible hidden"; return declaration.overflow === "visible hidden" && getComputedStyle(target).overflow === "auto hidden";',
	],
	[
		"computed-clip",
		'declaration.overflow = "clip auto"; return getComputedStyle(target).overflow === "clip auto";',
	],
	[
		"variable-hidden",
		'declaration.setProperty("--spill", "hidden"); declaration.overflow = "var(--spill)"; return declaration.overflow === "var(--spill)" && getComputedStyle(target).overflow === "hidden";',
	],
	[
		"variable-restored",
		'declaration.setProperty("--spill", "visible"); return target.getBoundingClientRect().width === 20;',
	],
	[
		"float-left",
		'declaration.cssFloat = "left"; return getComputedStyle(target).cssFloat === "left";',
	],
	[
		"clear-both",
		'declaration.cssFloat = "none"; declaration.clear = "both"; return getComputedStyle(target).clear === "both";',
	],
	[
		"clear-restored",
		'declaration.clear = "none"; return target.getBoundingClientRect().width === 20;',
	],
] as const;
const results = [];
const expected: Record<string, unknown> = {
	capture: "",
	"set-overflow": "hidden",
	"catch-geometry": "caught",
	"restore-overflow": "visible",
	"read-restored-geometry": 20,
	"combined-overflow-recovery": true,
	"set-position": "absolute",
	"restore-position": "static",
	"combined-position-recovery": true,
	"combined-display-recovery": true,
	"computed-neutral": true,
	"computed-mixed": true,
	"computed-clip": true,
	"variable-hidden": true,
	"variable-restored": true,
	"float-left": true,
	"clear-both": true,
	"clear-restored": true,
};
let passed = false;
try {
	for (const [label, source] of steps) {
		const result = await page.evaluate(source);
		let nativeLayout: unknown;
		try {
			nativeLayout = layoutDocument(loaded.document).boxes.find(
				(box) => box.ref === loaded.document.reference(target),
			)?.borderBoxWidth;
		} catch (error) {
			nativeLayout = {
				code: error instanceof AgentBrowserError ? error.code : "unexpected",
				message: error instanceof Error ? error.message : String(error),
			};
		}
		results.push({
			label,
			result,
			style: loaded.document.get(target).attributes.style ?? "",
			nativeLayout,
		});
		if (!result.ok || result.value !== expected[label])
			throw Error(`Unexpected guest result: ${label}`);
		const unsupported = [
			"set-overflow",
			"catch-geometry",
			"set-position",
			"computed-mixed",
			"computed-clip",
			"variable-hidden",
			"float-left",
			"clear-both",
		].includes(label);
		if (
			unsupported
				? !nativeLayout ||
					typeof nativeLayout !== "object" ||
					!("code" in nativeLayout) ||
					nativeLayout.code !== "unsupported"
				: nativeLayout !== 20
		)
			throw Error(`Unexpected native layout: ${label}`);
	}
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
				results,
				page: page.metrics(),
				transport: { requests, closed: transportClosed },
				fixture:
					"Existing experimental SafeJS and one synthetic request; native/guest recovery checked per step; no real-site or throughput acceptance",
			},
			null,
			2,
		),
	);
}
