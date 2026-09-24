import { setTimeout as delay } from "node:timers/promises";
import { types } from "node:util";
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
// enables bounded Worker sockets. Source completion does not establish readiness.
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

const completionSource =
	"\n;postMessage({agentBrowserWorkerSourceComplete:true});";
const evaluations = new Set<Promise<unknown>>();
let childReport:
	| { ok: boolean; elapsedMs: number; error?: unknown }
	| undefined;
let runtime: PageRuntime | undefined;
let parentRuntimeError: Record<string, unknown> | undefined;

// Report bounded own-data error identifiers, never arbitrary source excerpts.
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
		if (typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value))
			fields[key] = value;
	}
	for (const key of ["current", "limit"]) {
		const value = own(key);
		if (typeof value === "number" && Number.isFinite(value)) fields[key] = value;
	}
	const message = own("message");
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
const transport = new NodeNetworkTransport({
	allowedOrigins: [mediaRoot.origin],
	limits: { maxResponseBytes: 1_048_576, timeoutMs: 15000 },
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
	},
);
let assetUnits: number | undefined;
let configuredUnits: number | undefined;
let sourceComplete = false;
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
		`wasmUrl = ${JSON.stringify(new URL("net.wasm", mediaRoot).href)}, isZoomWasm32Bit = false, shouldLimitWasmMemoryWithoutSAB = false, zoomWasmMaxPages = 4096, nonsabVB = false, self.__wasmCodeDataEndFlag = 1$1`,
	);
	configuredUnits = configured.length;
	const result = await page.evaluate(
		`
const statuses=[];
const url=URL.createObjectURL(new Blob([${JSON.stringify(configured + completionSource)}]));
const worker=new Worker(url);
URL.revokeObjectURL(url);
worker.onmessage=e=>{
 if(e.data && e.data.agentBrowserWorkerSourceComplete===true) document.body.setAttribute('data-source-complete','true');
 else if(e.data && typeof e.data.status==='number' && statuses.length<16) {
  statuses.push({status:e.data.status,data:typeof e.data.data==='boolean'?e.data.data:null});
  document.body.setAttribute('data-statuses',JSON.stringify(statuses));
 }
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
		// Early status 131 is not source completion. Require both the explicit EOF
		// message and a successful child evaluate result before claiming completion.
		if (childReport && (!childReport.ok || sourceComplete)) break;
		if (attributes["data-worker-error"] === "true" || page.closed) break;
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
		!wallTimedOut &&
		failure === undefined;
	console.log(
		JSON.stringify({
			scope: "Configured public network Worker source completion only",
			mediaRoot: mediaRoot.href,
			timeoutMs,
			assetUnits,
			configuredUnits,
			parentOk,
			parentRuntimeError,
			childReport,
			sourceComplete,
			statuses,
			wallTimedOut,
			failure,
			initialized,
			steps: runtime?.budget.stepsUsed,
			cleanup: {
				verified: cleanupVerified,
				currentDataSize,
				pendingCallbacks: metrics.pendingCallbacks,
				network,
				webSockets,
			},
		}),
	);
	process.exitCode = initialized && cleanupVerified ? 0 : 1;
	document.close();
}
