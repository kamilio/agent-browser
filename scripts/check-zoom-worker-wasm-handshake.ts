import { setTimeout as delay } from "node:timers/promises";
import { types } from "node:util";
import { CookieJar } from "../src/cookies.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import type { PageRuntime, PageRuntimeFactory } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { decodeWorkerImportedScript } from "../src/worker-fetch.js";

// Authorized opt-in public-network + SafeJS/Node24 JSPI probe, not a native test.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
// AGENT_BROWSER_ZOOM_MEDIA_ROOT=https://st1.zoom.us/web-media/u9n13za/ \
// /path/to/node24 --experimental-wasm-jspi --max-old-space-size=128 \
//   dist/scripts/check-zoom-worker-wasm-handshake.js
// Isolates Zoom's unchanged parent-download handler and Emscripten tail, including
// createWasm/run. The fixture supplies only wrapper configuration, a diagnostic
// logger and an initialization observer; no WASM function imports are stubbed.
// Actual page fetch/CORS, Worker transfer and WASM initialization are exercised.
// Explicit 1 MiB response, 32 MiB runtime quotas and 120 s deadline are diagnostic.
// No complete Worker/client, socket, meeting or media acceptance is established.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
const mediaInput = process.env.AGENT_BROWSER_ZOOM_MEDIA_ROOT;
if (!root || !mediaInput)
	throw new Error(
		"Select the compiled SDK and public Zoom media root explicitly",
	);
const media = new URL(mediaInput);
if (
	media.origin !== "https://st1.zoom.us" ||
	!/^\/web-media\/[A-Za-z0-9_-]+\/$/.test(media.pathname) ||
	media.username ||
	media.password ||
	media.search ||
	media.hash
)
	throw new Error(
		"Select a public https://st1.zoom.us/web-media/<version>/ root",
	);
const wasmUrl = new URL("net.wasm", media).href;
const cookieJar = new CookieJar();
const transport = new NodeNetworkTransport({
	allowedOrigins: [media.origin],
	cookieJar,
	limits: { maxResponseBytes: 1048576, timeoutMs: 15000 },
});
const tree = parseHtmlDocument(
	"<html><body></body></html>",
	"https://app.zoom.us/wc/7982110526/join",
);
let page: PageScripts | undefined;
let runtime: PageRuntime | undefined;
let passed = false;
let fixtureBody: number | undefined;
const evaluations = new Set<Promise<unknown>>();
const errors: Record<string, string>[] = [];
const reports: unknown[] = [];
const started = performance.now();
function check(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}
function failureDetails(error: unknown): Record<string, string> {
	if (!error || typeof error !== "object" || types.isProxy(error)) return {};
	const details: Record<string, string> = {};
	for (const key of ["name", "code", "budget"]) {
		const value = Object.getOwnPropertyDescriptor(error, key)?.value;
		if (typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value))
			details[key] = value;
	}
	return details;
}
try {
	const response = await transport.request({
		url: new URL("net_thread.min.js", media).href,
		redirect: "error",
		signal: AbortSignal.timeout(20000),
	});
	const { source } = decodeWorkerImportedScript(response);
	const beginning =
		"self.downloadAndInstantiateWebAssembly=async function(e,t){";
	const ending = ";var Ii,Ai,Ri,xi,Mi,Li,Oi,Fi,Di,Pi,Ui,Wi=";
	const glueBeginning =
		"var Module=void 0!==Module?Module:{},ENVIRONMENT_IS_WEB";
	const glueEnding = "createWasm(),run();";
	for (const marker of [beginning, ending, glueBeginning, glueEnding])
		check(
			source.split(marker).length === 2,
			"Unexpected public source boundary",
		);
	check(
		source.indexOf(ending) > source.indexOf(beginning) &&
			source.indexOf(glueEnding) > source.indexOf(glueBeginning),
		"Unexpected public source boundary order",
	);
	const download = `${source.slice(source.indexOf(beginning), source.indexOf(ending))};`;
	const glue = source.slice(
		source.indexOf(glueBeginning),
		source.indexOf(glueEnding) + glueEnding.length,
	);
	const workerSource = `
var wasmUrl=${JSON.stringify(wasmUrl)};
function ni(value){postMessage({fixtureDiagnostic:value});}
${download}
var Module={};
Module.locateFile=function(e){if(e.endsWith('wasm'))return wasmUrl};
Module.instantiateWasm=function(e,t){return self.downloadAndInstantiateWebAssembly(e,t),{}};
Module.onRuntimeInitialized=function(){postMessage({fixtureInitialized:true,memoryBytes:Module.HEAPU8.length});};
${glue}`;
	const { factory } = await loadPageRuntime(
		root,
		{
			adapter: "extension",
			runtimeOptions: {
				classicScripts: true,
				classicScriptErrors: "report",
				callbackScheduling: "after-prefix",
				webAssembly: "bounded-v1",
				workerBinaryMessages: "bounded-v1",
			},
		},
		{
			async importModule(specifier) {
				const core = (await import(specifier)) as ReleasedCore;
				return {
					...core,
					createRealm(options: Parameters<ReleasedCore["createRealm"]>[0]) {
						const realm = core.createRealm(options);
						const evaluate: ReleasedRealm["evaluate"] = (source, config) => {
							const evaluation = (async () => {
								try {
									const result = await realm.evaluate(source, config);
									if (!result.ok) errors.push(failureDetails(result.error));
									return result;
								} catch (error) {
									errors.push(failureDetails(error));
									throw error;
								}
							})();
							evaluations.add(evaluation);
							void evaluation
								.finally(() => evaluations.delete(evaluation))
								.catch(() => undefined);
							return evaluation;
						};
						const descriptors = Object.getOwnPropertyDescriptors(realm);
						descriptors.evaluate = { ...descriptors.evaluate, value: evaluate };
						return Object.freeze(
							Object.create(Object.getPrototypeOf(realm), descriptors),
						) as ReleasedRealm;
					},
				};
			},
		},
	);
	const diagnosticFactory: PageRuntimeFactory = {
		...factory,
		createPageRuntime(options) {
			runtime = factory.createPageRuntime({
				...options,
				limits: {
					...options.limits,
					maxArrayLength: 33554432,
					maxDataSize: 33554432,
					timeoutMs: 120000,
				},
			});
			return runtime;
		},
	};
	page = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		diagnosticFactory,
		{
			budgetProfile: "application-unicode-v1",
			limits: { timeoutMs: 120000 },
			fetchLimits: { maxResponseBytes: 1048576 },
			fetch(input) {
				check(
					input.url === wasmUrl && input.method === "GET",
					"Unexpected parent network request",
				);
				return transport.request({ ...input, redirect: "error" });
			},
		},
	);
	const html = tree
		.get(tree.root)
		.children.find((id) => tree.get(id).tagName === "html");
	check(html !== undefined, "Fixture HTML missing");
	const body = tree
		.get(html)
		.children.find((id) => tree.get(id).tagName === "body");
	check(body !== undefined, "Fixture body missing");
	fixtureBody = body;
	const result = await page.evaluate(
		`
var statuses=[],diagnostics=[],wasmDonor;
var url=URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}]));
var worker=new Worker(url);URL.revokeObjectURL(url);
worker.onmessage=async function(e){
 var data=e.data;
 if(data.fixtureDiagnostic){diagnostics.push(data.fixtureDiagnostic);document.body.setAttribute('data-diagnostics',JSON.stringify(diagnostics));}
 if(data.status===30){
  statuses.push(30);document.body.setAttribute('data-statuses',JSON.stringify(statuses));
  if(data.url!==${JSON.stringify(wasmUrl)} || data.isEx!==false)throw new Error('Unexpected WASM request');
  try {
   var response=await fetch(data.url);if(!response.ok)throw new Error('WASM download failed');
   wasmDonor=await response.arrayBuffer();document.body.setAttribute('data-downloaded',String(wasmDonor.byteLength));
   worker.postMessage({command:'DOWNLOAD_WASM_FROM_MAIN_THREAD_OK',data:wasmDonor},[wasmDonor]);
   document.body.setAttribute('data-donor',String(wasmDonor.byteLength));
  } catch(error){document.body.setAttribute('data-parent-error',error.name);worker.postMessage({command:'DOWNLOAD_WASM_FROM_MAIN_THREAD_FAILED'});}
 }
 if(data.status===61||data.status===63)document.body.setAttribute('data-initialization-error',String(data.status));
 if(data.fixtureInitialized===true)document.body.setAttribute('data-initialized',String(data.memoryBytes));
};
worker.onerror=function(){document.body.setAttribute('data-worker-error','true');};
`,
		{ filename: "isolated-zoom-worker-download", discardResult: true },
	);
	check(result.ok, "Parent setup failed");
	const deadline = performance.now() + 125000;
	while (!tree.get(body).attributes["data-initialized"]) {
		const attributes = tree.get(body).attributes;
		check(
			!page.closed &&
				!attributes["data-worker-error"] &&
				!attributes["data-parent-error"] &&
				!attributes["data-initialization-error"],
			"Parent/Worker initialization failed",
		);
		check(performance.now() < deadline, "Isolated initialization timeout");
		await delay(50);
	}
	const attributes = tree.get(body).attributes;
	check(
		attributes["data-initialized"] === "20971520",
		"Unexpected initialized memory",
	);
	check(
		attributes["data-downloaded"] === "465602" &&
			attributes["data-donor"] === "0",
		"Binary delivery or detachment failed",
	);
	check(
		attributes["data-diagnostics"] === '["DS","DE"]' &&
			attributes["data-statuses"] === "[30]",
		"Unexpected download diagnostics",
	);
	check(errors.length === 0, "Guest evaluation errors");
	reports.push({
		downloadUnits: download.length,
		glueUnits: glue.length,
		elapsedMs: Math.round(performance.now() - started),
		steps: runtime?.budget.stepsUsed,
		retainedDataSize: (
			runtime?.budget as { currentDataSize?: number } | undefined
		)?.currentDataSize,
		attributes,
	});
	passed = true;
} finally {
	const closed = await Promise.allSettled([page?.close()]);
	await Promise.allSettled([...evaluations]);
	transport.close();
	cookieJar.close();
	const data = (runtime?.budget as { currentDataSize?: number } | undefined)
		?.currentDataSize;
	const network = transport.metrics();
	const pendingCallbacks = page?.metrics().pendingCallbacks;
	const cleanupVerified =
		closed.every((result) => result.status === "fulfilled") &&
		(!runtime || data === 0) &&
		(!page || pendingCallbacks === 0) &&
		network.closed &&
		network.active === 0;
	console.log(
		JSON.stringify({
			scope:
				"Isolated public Zoom download handler/glue in actual Worker with page fetch/CORS and transfer",
			mediaRoot: media.href,
			passed,
			attributes:
				fixtureBody === undefined
					? undefined
					: tree.get(fixtureBody).attributes,
			reports,
			errors,
			cleanup: {
				verified: cleanupVerified,
				data,
				pendingCallbacks,
				fetch: page?.metrics().fetch,
				network,
			},
		}),
	);
	tree.close();
	check(cleanupVerified, "Worker handshake cleanup failed");
}
