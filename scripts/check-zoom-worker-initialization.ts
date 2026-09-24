import { setTimeout as delay } from "node:timers/promises";
import { types } from "node:util";
import { CookieJar } from "../src/cookies.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import {
	NodeWebSocketTransport,
	bindDocumentWebSockets,
} from "../src/node-websocket-transport.js";
import type { PageRuntime, PageRuntimeFactory } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { decodeWorkerImportedScript } from "../src/worker-fetch.js";

// Opt-in live-network + SafeJS diagnostic; not a native acceptance test.
// Run only with authorization, selecting the compiled SDK and public media root:
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
// AGENT_BROWSER_ZOOM_MEDIA_ROOT=https://st1.zoom.us/web-media/u9n13za/ \
//   /path/to/node24 --experimental-wasm-jspi --max-old-space-size=128 \
//     dist/scripts/check-zoom-worker-initialization.js
// The default initialization deadline is 30 s. Explicit diagnostic allowances up
// to 120 s do not clear that gate. This fixture loads no meeting/client and
// enables bounded Worker sockets and services the parent WASM-download protocol.
// Source completion and the completed original onRuntimeInitialized callback are
// separate observations; neither establishes meeting or media readiness.
// Parent WASM fetch uses an explicit 30 s deadline and 1 MiB decoded-byte bound.
const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
const mediaRootInput = process.env.AGENT_BROWSER_ZOOM_MEDIA_ROOT;
if (!packageRoot || !mediaRootInput)
	throw new Error(
		"Select the compiled SafeJS package and Zoom media root explicitly",
	);
const mediaRoot = new URL(mediaRootInput);
if (
	mediaRoot.origin !== "https://st1.zoom.us" ||
	!/^\/web-media\/[A-Za-z0-9_-]+\/$/.test(mediaRoot.pathname) ||
	mediaRoot.username ||
	mediaRoot.password ||
	mediaRoot.search ||
	mediaRoot.hash
)
	throw new Error(
		"Select a public https://st1.zoom.us/web-media/<version>/ root",
	);
const timeoutMs = Number(
	process.env.AGENT_BROWSER_ZOOM_SCRIPT_TIMEOUT_MS ?? 30000,
);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
	throw new Error("Worker timeout must be between 1000 and 120000 ms");

const completionSource = `
;const originalRuntimeInitialized=Module.onRuntimeInitialized;
Module.onRuntimeInitialized=function(){
 const result=originalRuntimeInitialized.apply(this,arguments);
 postMessage({agentBrowserWorkerWasmInitialized:true,memoryBytes:Module.HEAPU8.length});
 return result;
};
postMessage({agentBrowserWorkerSourceComplete:true});`;
const evaluations = new Set<Promise<unknown>>();
let childReport:
	| { ok: boolean; elapsedMs: number; error?: unknown }
	| undefined;
let runtime: PageRuntime | undefined;
let parentRuntimeError: Record<string, unknown> | undefined;
let parentNetworkError: Record<string, unknown> | undefined;

// Public-source diagnostic: report bounded own-data errors, never whole sources.
function failureDetails(failure: unknown): Record<string, unknown> {
	const own = (key: string): unknown => {
		if (!failure || typeof failure !== "object" || types.isProxy(failure))
			return;
		const descriptor = Object.getOwnPropertyDescriptor(failure, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	};
	const fields: Record<string, unknown> = {};
	for (const key of ["name", "code", "budget"]) {
		const value = own(key);
		if (
			typeof value === "string" &&
			/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
		)
			fields[key] = value;
	}
	for (const key of ["current", "limit"]) {
		const value = own(key);
		if (typeof value === "number" && Number.isFinite(value))
			fields[key] = value;
	}
	const message = own("message");
	if (typeof message === "string" && message.length <= 256)
		fields.message = message;
	if (typeof message === "string" && message.length < 512) {
		const missing =
			/^Identifier '([A-Za-z_$][A-Za-z0-9_$]{0,63})' is not defined\.$/.exec(
				message,
			);
		if (missing) fields.missingIdentifier = missing[1];
		if (message === "Unknown host object definition field.")
			fields.diagnostic = "unknownHostObjectDefinitionField";
	}
	return fields;
}

const { factory } = await loadPageRuntime(
	packageRoot,
	{
		adapter: "extension",
		runtimeOptions: {
			classicScripts: true,
			classicScriptErrors: "report",
			callbackScheduling: "after-prefix",
			webAssembly: "bounded-v1",
			workerBinaryMessages: "bounded-v1",
			domExpandos: "bounded-v1",
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
						const isFixture = source.endsWith(completionSource);
						const start = performance.now();
						const evaluation = (async () => {
							try {
								const result = await realm.evaluate(source, config);
								if (!isFixture && !result.ok)
									parentRuntimeError = failureDetails(result.error);
								if (isFixture)
									childReport = {
										ok: result.ok,
										elapsedMs: Math.round(performance.now() - start),
										...(!result.ok
											? { error: failureDetails(result.error) }
											: {}),
									};
								return result;
							} catch (error) {
								if (!isFixture) parentRuntimeError = failureDetails(error);
								if (isFixture)
									childReport = {
										ok: false,
										elapsedMs: Math.round(performance.now() - start),
										error: failureDetails(error),
									};
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
const observed: PageRuntimeFactory = {
	...factory,
	createPageRuntime(options) {
		runtime = factory.createPageRuntime(options);
		return runtime;
	},
};
const wasmUrl = new URL("net.wasm", mediaRoot).href;
const cookieJar = new CookieJar();
const transport = new NodeNetworkTransport({
	cookieJar,
	allowedOrigins: [mediaRoot.origin],
	limits: { maxResponseBytes: 1_048_576, timeoutMs: 30000 },
});
const document = parseHtmlDocument(
	"<html><body></body></html>",
	"https://app.zoom.us/wc/7982110526/join",
);
const socketTransport = new NodeWebSocketTransport();
bindDocumentWebSockets(document, socketTransport);
const html = document
	.get(document.root)
	.children.find((id) => document.get(id).tagName === "html");
const body =
	html === undefined
		? undefined
		: document
				.get(html)
				.children.find((id) => document.get(id).tagName === "body");
if (body === undefined) throw new Error("Fixture body is missing");
const page = new PageScripts(
	{ document, interactions: documentInteractions(document) },
	observed,
	{
		budgetProfile: "application-media-v1",
		limits: { timeoutMs },
		fetchLimits: { maxResponseBytes: 1_048_576, timeoutMs: 30000 },
		fetch(input) {
			if (input.url !== wasmUrl || input.method !== "GET")
				throw new Error("Unexpected parent network request");
			return transport
				.request({ ...input, redirect: "error" })
				.catch((error) => {
					parentNetworkError = failureDetails(error);
					throw error;
				});
		},
	},
);
let assetUnits: number | undefined;
let configuredUnits: number | undefined;
let sourceComplete = false;
let wasmInitialized = false;
let downloadedBytes = 0;
let donorDetached = false;
let statuses: unknown = [];
let parentOk = false;
let wallTimedOut = false;
let failure: unknown;
let cleanupVerified = false;

try {
	const response = await transport.request({
		url: new URL("net_thread.min.js", mediaRoot).href,
		method: "GET",
		signal: AbortSignal.timeout(20000),
	});
	const { source } = decodeWorkerImportedScript(response);
	assetUnits = source.length;
	// js_media.min.js's network Worker factory K replaces this marker in place.
	// These flags are Zoom wrapper configuration, not browser globals. Reject asset
	// changes instead of guessing a different configuration or prepending globals.
	const marker = /self\.__wasmCodeDataEndFlag\s*=\s*1([;,])/g;
	if ([...source.matchAll(marker)].length !== 1)
		throw new Error(
			"Expected exactly one Zoom network Worker configuration marker",
		);
	const configured = source.replace(
		marker,
		`wasmUrl = ${JSON.stringify(wasmUrl)}, isZoomWasm32Bit = false, shouldLimitWasmMemoryWithoutSAB = false, zoomWasmMaxPages = 4096, nonsabVB = false, self.__wasmCodeDataEndFlag = 1$1`,
	);
	configuredUnits = configured.length;
	const result = await page.evaluate(
		`
const statuses=[];
const url=URL.createObjectURL(new Blob([${JSON.stringify(configured + completionSource)}]));
const worker=new Worker(url);
URL.revokeObjectURL(url);
worker.onmessage=async e=>{
 if(e.data && e.data.agentBrowserWorkerWasmInitialized===true) document.body.setAttribute('data-wasm-memory',String(e.data.memoryBytes));
 else if(e.data && e.data.agentBrowserWorkerSourceComplete===true) document.body.setAttribute('data-source-complete','true');
 else if(e.data && typeof e.data.status==='number' && statuses.length<16) {
  statuses.push({status:e.data.status,data:typeof e.data.data==='boolean'?e.data.data:null});
  document.body.setAttribute('data-statuses',JSON.stringify(statuses));
 }
 if(e.data && e.data.status===30){
  try {
   if(e.data.url!==${JSON.stringify(wasmUrl)} || e.data.isEx!==false || document.body.getAttribute('data-wasm-request'))throw new Error('Unexpected WASM request');
   document.body.setAttribute('data-wasm-request','true');
   const response=await fetch(e.data.url);if(!response.ok)throw new Error('WASM download failed');
   const donor=await response.arrayBuffer();document.body.setAttribute('data-downloaded',String(donor.byteLength));
   worker.postMessage({command:'DOWNLOAD_WASM_FROM_MAIN_THREAD_OK',data:donor},[donor]);
   document.body.setAttribute('data-donor',String(donor.byteLength));
  }catch(error){
   document.body.setAttribute('data-parent-error','true');
   worker.postMessage({command:'DOWNLOAD_WASM_FROM_MAIN_THREAD_FAILED'});
  }
 }
 if(e.data && (e.data.status===63 || e.data.status===-7))document.body.setAttribute('data-initialization-error',String(e.data.status));
};
worker.onerror=()=>document.body.setAttribute('data-worker-error','true');
`,
		{ filename: "zoom-network-worker-fixture", discardResult: true },
	);
	parentOk = result.ok;
	if (!result.ok) failure = result.error;
	const deadline = performance.now() + timeoutMs + 5000;
	while (parentOk) {
		const attributes = document.get(body).attributes;
		sourceComplete = attributes["data-source-complete"] === "true";
		statuses = JSON.parse(attributes["data-statuses"] ?? "[]");
		wasmInitialized = attributes["data-wasm-memory"] === "20971520";
		downloadedBytes = Number(attributes["data-downloaded"] ?? 0);
		donorDetached = attributes["data-donor"] === "0";
		// Early status 131 is not source completion. Require both the explicit EOF
		// message, child evaluation and original WASM callback completion.
		if (childReport && (!childReport.ok || (sourceComplete && wasmInitialized)))
			break;
		if (
			attributes["data-worker-error"] === "true" ||
			attributes["data-parent-error"] === "true" ||
			attributes["data-initialization-error"] !== undefined ||
			page.closed
		)
			break;
		if (performance.now() >= deadline) {
			wallTimedOut = true;
			break;
		}
		await delay(50);
	}
} catch (error) {
	failure = failureDetails(error);
} finally {
	const closes = await Promise.allSettled([page.close()]);
	await Promise.allSettled([...evaluations]);
	transport.close();
	cookieJar.close();
	await socketTransport.close();
	const metrics = page.metrics();
	const currentDataSize = (
		runtime?.budget as { currentDataSize?: number } | undefined
	)?.currentDataSize;
	const network = transport.metrics();
	const webSockets = socketTransport.metrics();
	cleanupVerified =
		closes.every((result) => result.status === "fulfilled") &&
		metrics.closed &&
		metrics.pendingCallbacks === 0 &&
		currentDataSize === 0 &&
		network.closed &&
		network.active === 0 &&
		webSockets.closed &&
		webSockets.active === 0 &&
		webSockets.pending === 0;
	const initialized =
		parentOk &&
		childReport?.ok === true &&
		sourceComplete &&
		wasmInitialized &&
		downloadedBytes > 0 &&
		donorDetached &&
		parentRuntimeError === undefined &&
		!wallTimedOut &&
		failure === undefined;
	console.log(
		JSON.stringify({
			scope:
				"Complete configured public Worker with parent WASM download and original initialization callback",
			mediaRoot: mediaRoot.href,
			timeoutMs,
			assetUnits,
			configuredUnits,
			parentOk,
			parentRuntimeError,
			parentNetworkError,
			childReport,
			sourceComplete,
			wasmInitialized,
			downloadedBytes,
			donorDetached,
			statuses,
			wallTimedOut,
			failure,
			initialized,
			steps: runtime?.budget.stepsUsed,
			cleanup: {
				verified: cleanupVerified,
				currentDataSize,
				pendingCallbacks: metrics.pendingCallbacks,
				fetch: metrics.fetch,
				network,
				webSockets,
			},
		}),
	);
	process.exitCode = initialized && cleanupVerified ? 0 : 1;
	document.close();
}
