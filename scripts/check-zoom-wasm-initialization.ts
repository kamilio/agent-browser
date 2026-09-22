import { types } from "node:util";
import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { pageWasmBootstrapSource } from "../src/page-wasm-bootstrap.js";
import { PageWasm, type PageWasmBudget } from "../src/page-wasm.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { decodeWorkerImportedScript } from "../src/worker-fetch.js";

// Authorized opt-in public-network + SafeJS/Node24 JSPI diagnostic. Not a native test.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
// AGENT_BROWSER_ZOOM_MEDIA_ROOT=https://st1.zoom.us/web-media/u9n13za/ \
// /path/to/node24 --experimental-wasm-jspi --max-old-space-size=128 \
//   dist/scripts/check-zoom-wasm-initialization.js
// Runs the unmodified Emscripten tail, real imports and export w initializer.
// Does not run the complete Worker, parent download protocol, socket or meeting.
// Explicit 32 MiB quotas and 120 s deadline do not clear default startup limits.
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
let core: ReleasedCore | undefined;
await loadPageRuntime(
	root,
	{ adapter: "extension" },
	{
		async importModule(specifier) {
			core = (await import(specifier)) as ReleasedCore;
			return core;
		},
	},
);
if (!core) throw new Error("SDK core unavailable");
const transport = new NodeNetworkTransport({
	allowedOrigins: [media.origin],
	limits: { maxResponseBytes: 1048576, timeoutMs: 15000 },
});
const controller = new AbortController();
let realm: ReleasedRealm | undefined;
let bridge: PageWasm | undefined;
let budget:
	| (InstanceType<ReleasedCore["Budget"]> &
			PageWasmBudget & {
				readonly currentDataSize: number;
			})
	| undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let logCalls = 0;
let passed = false;
const reports: unknown[] = [];
const started = performance.now();

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
function failureDetails(error: unknown) {
	const details: Record<string, string> = {};
	if (!error || typeof error !== "object" || types.isProxy(error))
		return details;
	for (const key of ["name", "code", "budget"]) {
		const value = Object.getOwnPropertyDescriptor(error, key)?.value;
		if (typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value))
			details[key] = value;
	}
	return details;
}
async function evaluate(phase: string, source: string) {
	check(realm && budget, "Initializer realm unavailable");
	const result = await realm.evaluate(source);
	reports.push({
		phase,
		ok: result.ok,
		...(!result.ok ? { error: failureDetails(result.error) } : {}),
		steps: budget.stepsUsed,
		retainedDataSize: budget.currentDataSize,
		elapsedMs: Math.round(performance.now() - started),
	});
	check(result.ok, `Zoom WASM ${phase} failed`);
	return result.returnValue;
}

try {
	const response = await transport.request({
		url: new URL("net_thread.min.js", media).href,
		redirect: "error",
		signal: AbortSignal.timeout(20000),
	});
	const { source } = decodeWorkerImportedScript(response);
	const beginning = "var Module=void 0!==Module?Module:{},ENVIRONMENT_IS_WEB";
	const ending = "createWasm(),run();";
	check(
		source.split(beginning).length === 2 && source.split(ending).length === 2,
		"Unexpected Zoom glue boundaries",
	);
	const start = source.indexOf(beginning);
	const end = source.indexOf(ending);
	check(end > start, "Unexpected Zoom glue boundary order");
	const glue = source.slice(start, end);
	const binary = await transport.request({
		url: new URL("net.wasm", media).href,
		redirect: "error",
		signal: AbortSignal.timeout(20000),
	});
	check(
		binary.status === 200 && binary.body.length <= 1048576,
		"Unexpected Zoom WASM response",
	);
	const bytes = new Uint8Array(binary.body);
	budget = new core.Budget({
		maxSteps: 1000000,
		maxCallDepth: 64,
		arrayLength: 33554432,
		dataSize: 33554432,
		deadline: Date.now() + 120000,
	}) as NonNullable<typeof budget>;
	const ownerBudget = budget;
	const extension = core.defineExtension({
		manifest: {
			version: 1,
			name: "zoom-real-glue-initializer",
			globals: ["__agentBrowserWasm", "fixture"],
			capabilities: ["source:nested", "array-buffer:share"],
		},
		setup(context) {
			bridge = new PageWasm(context, ownerBudget);
			return {
				globals: {
					__agentBrowserWasm: bridge.port,
					fixture: context.createHostObject({
						properties: { bytes: { get: () => bytes } },
					}),
				},
			};
		},
	});
	realm = core.createRealm({
		classicScripts: true,
		stringCompilation: "deny",
		callbackScheduling: "after-prefix",
		extensions: [extension],
		grants: ["source:nested", "array-buffer:share"],
		budget,
		signal: controller.signal,
		sink: {
			log: () => {
				logCalls++;
			},
			error: () => {
				logCalls++;
			},
		},
	});
	timer = setTimeout(
		() => controller.abort(new Error("Zoom initializer timeout")),
		120000,
	);
	await evaluate("bridge", pageWasmBootstrapSource);
	await evaluate("unmodified-glue-tail", glue);
	const instantiated = await evaluate(
		"real-import-instantiation",
		"var module=new WebAssembly.Module(fixture.bytes);var instance=new WebAssembly.Instance(module,getWasmImports());wasmExports=instance.exports;assignWasmExports(wasmExports);[WebAssembly.Module.imports(module).filter(entry=>entry.kind==='function').length,Object.keys(wasmExports).length,wasmMemory.buffer.byteLength,runtimeInitialized];",
	);
	check(
		JSON.stringify(instantiated) === "[21,41,20971520,false]",
		"Unexpected Zoom imports, exports or memory",
	);
	const initialized = await evaluate(
		"export-w-initializer",
		"initRuntime();[runtimeInitialized,Module.HEAPU8.length];",
	);
	check(
		JSON.stringify(initialized) === "[true,20971520]",
		"Zoom initializer did not complete",
	);
	reports.push({ glueUnits: glue.length, binaryBytes: bytes.length });
	passed = true;
} finally {
	const closed = await Promise.allSettled([realm?.close()]);
	await bridge?.close();
	clearTimeout(timer);
	transport.close();
	const metrics = bridge?.metrics();
	const network = transport.metrics();
	const cleanupVerified =
		closed.every((result) => result.status === "fulfilled") &&
		(!metrics ||
			(metrics.modules.modules === 0 &&
				metrics.modules.pending === 0 &&
				metrics.modules.leases === 0 &&
				metrics.instances.instances === 0 &&
				metrics.memories.memories === 0 &&
				metrics.depth === 0 &&
				metrics.pending === 0)) &&
		(!budget || budget.currentDataSize === 0) &&
		network.closed &&
		network.active === 0;
	console.log(
		JSON.stringify({
			scope:
				"Isolated public Zoom Emscripten glue, real imports and export w initializer only",
			mediaRoot: media.href,
			passed,
			reports,
			logCalls,
			cleanup: {
				verified: cleanupVerified,
				...metrics,
				currentDataSize: budget?.currentDataSize,
				network,
			},
		}),
	);
	check(cleanupVerified, "Zoom WASM initializer cleanup leaked");
}
