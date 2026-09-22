import { setTimeout as delay } from "node:timers/promises";
import { bindDocumentResourceCsp } from "../src/document-resource-csp.js";
import { initializeDocumentScriptCsp } from "../src/document-script-csp.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import type { PageRuntime } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";

// Authorized opt-in offline SafeJS/JSPI probe. No network/socket/meeting/media.
// Select AGENT_BROWSER_SAFEJS_SOURCE_ROOT and run with Node24 JSPI, 128 MiB.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!root) throw new Error("Select the compiled SafeJS SDK explicitly");
let lastGuestError: unknown;
const { factory } = await loadPageRuntime(
	root,
	{
		adapter: "extension",
		runtimeOptions: {
			classicScripts: true,
			classicScriptErrors: "report",
			callbackScheduling: "after-prefix",
			webAssembly: "bounded-v1",
		},
	},
	{
		async importModule(specifier) {
			const core = (await import(specifier)) as ReleasedCore;
			return {
				...core,
				createRealm(options: Parameters<ReleasedCore["createRealm"]>[0]) {
					const realm = core.createRealm(options);
					const evaluate: ReleasedRealm["evaluate"] = async (
						source,
						config,
					) => {
						const result = await realm.evaluate(source, config);
						if (
							!result.ok &&
							result.error &&
							typeof result.error === "object"
						) {
							const descriptors = Object.getOwnPropertyDescriptors(
								result.error,
							);
							lastGuestError = Object.fromEntries(
								["code", "name", "message"]
									.map((key) => [key, descriptors[key]?.value])
									.filter(
										([, value]) =>
											typeof value === "string" && value.length <= 512,
									),
							);
						}
						return result;
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
const bytes = [
	0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 127, 1, 127, 3, 2, 1, 0, 7, 7, 1,
	3, 114, 117, 110, 0, 0, 10, 9, 1, 7, 0, 32, 0, 65, 1, 106, 11,
];
function check(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}
const reports: object[] = [];
for (const compilation of ["allow", "deny"] as const) {
	const tree = parseHtmlDocument(
		"<html><body></body></html>",
		"https://example.test/page",
	);
	const headers = {
		"content-security-policy": [
			`default-src 'self'; worker-src blob:; script-src 'self' blob: 'unsafe-inline' ${compilation === "allow" ? "'wasm-unsafe-eval'" : ""}`,
		],
	};
	const resourcePolicy = bindDocumentResourceCsp(tree, headers);
	const scriptPolicy = initializeDocumentScriptCsp(tree, headers, true);
	check(resourcePolicy && scriptPolicy, "Fixture CSP owners missing");
	resourcePolicy.attach(scriptPolicy);
	let runtime: PageRuntime | undefined;
	const page = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		{
			...factory,
			createPageRuntime(options) {
				runtime = factory.createPageRuntime(options);
				return runtime;
			},
		},
		{ budgetProfile: "application-v1", limits: { timeoutMs: 16000 } },
	);
	try {
		const result = await page.evaluate(
			`
var bytes=new Uint8Array(${JSON.stringify(bytes)});
var denied=false;try{eval("1");}catch(e){denied=e.name==="EvalError";}
var compiled=false,value;
try{var module=new WebAssembly.Module(bytes);value=new WebAssembly.Instance(module).exports.run(41);compiled=true;}
catch(e){if(!(e instanceof WebAssembly.CompileError))throw e;}
[denied,compiled,value===42,window.WebAssembly===WebAssembly];
`,
			{ filename: "wasm-page-fixture" },
		);
		check(
			result.ok &&
				JSON.stringify(result.value) ===
					JSON.stringify([
						true,
						compilation === "allow",
						compilation === "allow",
						true,
					]),
			"Page WASM/string CSP behavior failed",
		);
		const workerSource = `var compiled=false,value;try{var m=new WebAssembly.Module(new Uint8Array(${JSON.stringify(bytes)}));value=new WebAssembly.Instance(m).exports.run(41);compiled=true;}catch(e){if(!(e instanceof WebAssembly.CompileError))throw e;}postMessage([compiled,value===42,typeof WebAssembly.Memory]);`;
		const worker = await page.evaluate(
			`
var url=URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}]));
var worker=new Worker(url);URL.revokeObjectURL(url);
worker.onmessage=e=>document.body.setAttribute('data-wasm-result',JSON.stringify(e.data));
worker.onerror=()=>document.body.setAttribute('data-wasm-error','true');
`,
			{ filename: "wasm-worker-fixture", discardResult: true },
		);
		check(
			worker.ok,
			`Parent Worker creation failed: ${JSON.stringify(lastGuestError)}`,
		);
		const html = tree
			.get(tree.root)
			.children.find((id) => tree.get(id).tagName === "html");
		const body =
			html === undefined
				? undefined
				: tree.get(html).children.find((id) => tree.get(id).tagName === "body");
		check(body !== undefined, "Fixture body missing");
		const deadline = performance.now() + 16000;
		while (tree.get(body).attributes["data-wasm-result"] === undefined) {
			check(
				!page.closed && tree.get(body).attributes["data-wasm-error"] !== "true",
				"Worker WASM execution failed",
			);
			check(performance.now() < deadline, "Worker WASM result timed out");
			await delay(10);
		}
		check(
			tree.get(body).attributes["data-wasm-result"] ===
				JSON.stringify([
					compilation === "allow",
					compilation === "allow",
					"function",
				]),
			"Worker inherited WASM CSP behavior failed",
		);
		reports.push({
			compilation,
			page: true,
			worker: true,
			stringEvalDenied: true,
		});
	} finally {
		await page.close();
		const data = (runtime?.budget as { currentDataSize?: number } | undefined)
			?.currentDataSize;
		check(
			page.metrics().pendingCallbacks === 0 && data === 0,
			"WASM installation cleanup leaked",
		);
		tree.close();
	}
}
console.log(
	JSON.stringify({
		scope: "Offline actual page/Blob Worker WASM installation and CSP",
		node: process.version,
		passed: true,
		reports,
		cleanupData: 0,
	}),
);
