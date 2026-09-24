import { types } from "node:util";
import { loadBrowserDocument } from "../src/document-loader.js";
import {
	type ScriptLoadReport,
	documentScriptState,
} from "../src/document-script-state.js";
import { AgentBrowserError } from "../src/errors.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { NodeWebSocketTransport } from "../src/node-websocket-transport.js";
import type {
	PageRuntime,
	PageRuntimeError,
	PageRuntimeFactory,
	PageSourceModuleStatus,
} from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";

// Live-network/socket/SafeJS diagnostic, separate from native-tests.json. Run only
// with authorization for this meeting and its necessary sockets, for example:
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
//   /path/to/node24 --experimental-wasm-jspi --max-old-space-size=512 \
//     dist/scripts/check-zoom-initialization.js
// Enables bounded WASM and binary Worker messages for the media client. Neither
// initialization nor feature availability certifies working meeting media.
// Set AGENT_BROWSER_ZOOM_USER_AGENT explicitly to compare server-selected client
// documents; the same identity is published to HTTP requests and navigator.
// Observe delayed initialization in two windows of 10 s by default, settling
// inserted scripts after each window. The second window captures timers scheduled
// by scripts whose execution outlasts the first window. Set
// AGENT_BROWSER_ZOOM_OBSERVATION_MS between 0 and 30000 for each window.
// Observe pending source imports outside classic tasks for up to 30 s afterward. Set
// AGENT_BROWSER_ZOOM_IMPORT_WAIT_MS between 0 and 1800000 to change that bound.
// Set AGENT_BROWSER_ZOOM_NETWORK_TIMEOUT_MS between 1000 and 120000 to diagnose
// fetch deadlines during costly compilation; the default remains 15000 ms.
// Import settlement does not certify interactive readiness, admission or meeting media.
const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled SafeJS package explicitly");
const timeoutMs = Number(
	process.env.AGENT_BROWSER_ZOOM_SCRIPT_TIMEOUT_MS ?? 30000,
);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
	throw new Error("Zoom script timeout must be between 1000 and 120000 ms");
const observationMs = Number(
	process.env.AGENT_BROWSER_ZOOM_OBSERVATION_MS ?? 10000,
);
if (
	!Number.isSafeInteger(observationMs) ||
	observationMs < 0 ||
	observationMs > 30000
)
	throw new Error("Zoom observation window must be between 0 and 30000 ms");

const importWaitMs = Number(
	process.env.AGENT_BROWSER_ZOOM_IMPORT_WAIT_MS ?? 30000,
);
if (
	!Number.isSafeInteger(importWaitMs) ||
	importWaitMs < 0 ||
	importWaitMs > 1800000
)
	throw new Error("Zoom import wait must be between 0 and 1800000 ms");

const networkTimeoutMs = Number(
	process.env.AGENT_BROWSER_ZOOM_NETWORK_TIMEOUT_MS ?? 15000,
);
if (
	!Number.isSafeInteger(networkTimeoutMs) ||
	networkTimeoutMs < 1000 ||
	networkTimeoutMs > 120000
)
	throw new Error("Zoom network timeout must be between 1000 and 120000 ms");

const userAgent = process.env.AGENT_BROWSER_ZOOM_USER_AGENT;

const url = "https://app.zoom.us/wc/7982110526/join";
const blockedOrigins = [
	"https://file-paa.zoom.us",
	"https://cdn.cookielaw.org",
];
// The loginview module exceeds the transport default of 2 MiB. Keep the
// diagnostic allowance explicit and bounded separately from guest source quotas.
const transportLimits = {
	maxResponseBytes: 4_194_304,
	timeoutMs: networkTimeoutMs,
};
const loaderLimits = {
	modules: true,
	maxScripts: 256,
	maxExternal: 64,
	maxSourceBytes: 8388608,
};
const { factory } = await loadPageRuntime(
	packageRoot,
	{
		adapter: "extension",
		runtimeOptions: {
			classicScripts: true,
			classicScriptErrors: "report",
			callbackScheduling: "after-prefix",
			domExpandos: "bounded-v1",
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
					const resolver = options.sourceResolver;
					let observedLifetime = false;
					const realm = core.createRealm({
						...options,
						...(resolver
							? {
									sourceResolver: async (
										...args: Parameters<NonNullable<typeof resolver>>
									) => {
										const signal = args[2].signal;
										if (signal && !observedLifetime) {
											observedLifetime = true;
											signal.addEventListener(
												"abort",
												() => {
													reportFailure(
														signal.reason,
														0,
														undefined,
														"module-lifetime-abort",
													);
												},
												{ once: true },
											);
										}
										const start = performance.now();
										try {
											const result = await resolver(...args);
											console.log(
												JSON.stringify({
													event: "module-source",
													specifier: moduleLabel(args[0]),
													referrer: moduleLabel(args[1]),
													admitted: result !== undefined,
													filename: result ? moduleLabel(result.id) : undefined,
													characters: result?.source.length,
													elapsedMs: Math.round(performance.now() - start),
												}),
											);
											return result;
										} catch (failure) {
											console.log(
												JSON.stringify({
													event: "module-source-failure",
													specifier: moduleLabel(args[0]),
													referrer: moduleLabel(args[1]),
													elapsedMs: Math.round(performance.now() - start),
													code:
														failure instanceof AgentBrowserError
															? failure.code
															: "source-failed",
												}),
											);
											throw failure;
										}
									},
								}
							: {}),
					});
					const evaluate: ReleasedRealm["evaluate"] = async (
						source,
						evaluationOptions,
					) => {
						try {
							const result = await realm.evaluate(source, evaluationOptions);
							if (!result.ok)
								reportFailure(
									result.error,
									source.length,
									evaluationOptions?.filename,
								);
							return result;
						} catch (failure) {
							reportFailure(
								failure,
								source.length,
								evaluationOptions?.filename,
							);
							throw failure;
						}
					};
					// The SDK freezes its public facade. Copy its descriptors so the
					// observer preserves readonly markers and does not violate Proxy
					// invariants when replacing the evaluate function.
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

const owners = new Set<PageScripts>();
const loaders = new Set<ScriptLoader>();
function createScriptLoader(
	options: ConstructorParameters<typeof ScriptLoader>[0],
) {
	const loader = new ScriptLoader(options);
	loaders.add(loader);
	return loader;
}

const runtimes: PageRuntime[] = [];
const pendingCallbacks = new Set<Promise<unknown>>();
const webclientScripts: { format: "classic" | "module"; ok: boolean }[] = [];
function webclientFormat(
	value: string | undefined,
): "classic" | "module" | undefined {
	if (value === undefined) return undefined;
	try {
		const pathname = new URL(value).pathname;
		if (pathname.endsWith("/webclient.min.js")) return "classic";
		if (pathname.endsWith("/webclient.es.min.js")) return "module";
	} catch {
		return undefined;
	}
	return undefined;
}
function currentDataSize(runtime: PageRuntime): number | undefined {
	return (runtime.budget as { currentDataSize?: number }).currentDataSize;
}
function scriptLabel(filename: string | undefined): string | undefined {
	if (filename === undefined) return undefined;
	try {
		const parsed = new URL(filename);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return filename;
	}
}

function moduleLabel(value: string): string {
	if (
		/^urn:agent-browser:html-(?:classic|module):[1-9][0-9]{0,15}$/.test(value)
	)
		return value;
	if (value.length > 4096) return "[source-label-too-long]";
	try {
		const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
		const parsed = new URL(value, "https://module-relative.invalid/");
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
			return "[non-network-source]";
		return `${absolute ? parsed.origin : ""}${parsed.pathname}`.slice(0, 512);
	} catch {
		return "[invalid-source-label]";
	}
}

const failureIdentifiers: Readonly<Record<string, readonly string[]>> = {
	name: [
		"Error",
		"EvalError",
		"RangeError",
		"ReferenceError",
		"SyntaxError",
		"TypeError",
		"URIError",
		"AggregateError",
		"SandboxError",
		"UnhandledRejectionError",
	],
	code: [
		"aborted",
		"budgetExceeded",
		"reentry",
		"LABEL_NOT_FOUND",
		"UNBOUND_IDENTIFIER",
		"UNSUPPORTED_NODE",
		"UNCAUGHT_EXCEPTION",
	],
	budget: [
		"steps",
		"deadline",
		"callDepth",
		"stringLength",
		"arrayLength",
		"dataSize",
		"dataDepth",
	],
	// Unlisted AST kinds are omitted; no arbitrary guest identifier is logged.
	nodeType: [
		"Program",
		"BlockStatement",
		"ExpressionStatement",
		"CallExpression",
		"NewExpression",
		"MemberExpression",
		"Identifier",
		"ReturnStatement",
		"ThrowStatement",
		"VariableDeclaration",
		"VariableDeclarator",
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"AssignmentExpression",
		"BinaryExpression",
		"ForStatement",
		"ForInStatement",
		"ForOfStatement",
		"WhileStatement",
		"IfStatement",
	],
};

// Read only allowlisted own-data identifiers and bounded positions from SDK
// failures. Messages and source excerpts may contain page data, so they never
// enter this diagnostic.
function reportFailure(
	failure: unknown,
	characters: number,
	filename?: string,
	event:
		| "runtime-failure"
		| "module-lifetime-abort"
		| "callback-runtime-failure" = "runtime-failure",
) {
	function own(value: unknown, key: string): unknown {
		if (!value || typeof value !== "object" || types.isProxy(value))
			return undefined;
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	}
	const fields: Record<string, unknown> = {};
	for (const [key, allowed] of Object.entries(failureIdentifiers)) {
		const value = own(failure, key);
		if (typeof value === "string" && allowed.includes(value))
			fields[key] = value;
	}
	const span = own(failure, "span");
	for (const edge of ["start", "end"]) {
		const position = own(span, edge);
		const values = ["offset", "line", "column"].map((key) =>
			own(position, key),
		);
		if (
			values.every(
				(value) =>
					typeof value === "number" &&
					Number.isSafeInteger(value) &&
					value >= 0 &&
					value <= characters + 1,
			)
		)
			fields[edge] = Object.fromEntries(
				["offset", "line", "column"].map((key, index) => [key, values[index]]),
			);
	}
	console.log(
		JSON.stringify({
			event,
			filename: scriptLabel(filename),
			characters,
			...fields,
		}),
	);
}

const observed: PageRuntimeFactory = {
	...factory,
	createPageRuntime(options) {
		const runtime = factory.createPageRuntime(options);
		runtimes.push(runtime);
		const startCallback: PageRuntime["startCallback"] = (...args) => {
			try {
				const invocation = runtime.startCallback(...args);
				pendingCallbacks.add(invocation.result);
				void invocation.result.then(
					() => pendingCallbacks.delete(invocation.result),
					() => pendingCallbacks.delete(invocation.result),
				);
				void invocation.result.catch((failure) =>
					reportFailure(failure, 0, undefined, "callback-runtime-failure"),
				);
				return invocation;
			} catch (failure) {
				reportFailure(failure, 0, undefined, "callback-runtime-failure");
				throw failure;
			}
		};
		const evaluate: PageRuntime["evaluate"] = async (
			source,
			evaluationOptions,
		) => {
			const start = performance.now();
			const cpu = process.cpuUsage();
			const stepsBefore = runtime.budget.stepsUsed;
			const filename = scriptLabel(evaluationOptions.filename);
			console.log(
				JSON.stringify({
					event: "script-start",
					filename,
					characters: source.length,
					currentDataSize: currentDataSize(runtime),
					memory: process.memoryUsage(),
				}),
			);
			let ok = false;
			let error: PageRuntimeError | undefined;
			try {
				const result = await runtime.evaluate(source, evaluationOptions);
				ok = result.ok;
				if (!result.ok) error = result.error;
				return result;
			} catch (failure) {
				error = runtime.errorDetails(failure);
				throw failure;
			} finally {
				const format = webclientFormat(evaluationOptions.filename);
				if (format) webclientScripts.push({ format, ok });
				console.log(
					JSON.stringify({
						event: "script",
						filename,
						characters: source.length,
						elapsedMs: Math.round(performance.now() - start),
						cpu: process.cpuUsage(cpu),
						ok,
						error,
						stepsUsed: runtime.budget.stepsUsed,
						stepsDelta: runtime.budget.stepsUsed - stepsBefore,
						currentDataSize: currentDataSize(runtime),
						peakDataSize: runtime.budget.peakDataSize,
					}),
				);
			}
		};
		return new Proxy(runtime, {
			get(target, key) {
				if (key === "evaluate") return evaluate;
				if (key === "startCallback") return startCallback;
				const value = Reflect.get(target, key, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	},
};
const socketTransport = new NodeWebSocketTransport({ blockedOrigins });
const browser = new BrowserSession({
	identity: { userAgent },
	webSocketTransport: socketTransport,
	limits: { maxScriptRequests: 64, navigationTimeoutMs: 180000 },
	createTransport: (cookieJar) =>
		new NodeNetworkTransport({
			cookieJar,
			blockedOrigins,
			limits: transportLimits,
		}),
	loadDocument: (response, context) =>
		loadBrowserDocument(response, {
			...context,
			scripts: createScriptLoader({
				response,
				topLevelDocument: context.topLevelDocument,
				signal: context.signal,
				fetch: context.fetchScript,
				fetchWithPolicy: context.fetchScriptWithPolicy,
				limits: loaderLimits,
				owner(document) {
					if (!context.fetchScriptWithPolicy || !context.fetchModuleWithPolicy)
						throw new AgentBrowserError(
							"unsupported",
							"Zoom modules require policy-aware script fetching",
						);
					const owner = new PageScripts(
						{ document, interactions: documentInteractions(document) },
						observed,
						{
							fetch: context.fetch,
							workerFetch: context.fetchWorker,
							workerImportFetch: context.fetchWorkerImport,
							networkSourceModules: {
								documentUrl: response.url,
								entries: [],
								htmlEntries: true,
								fetchWithPolicy: context.fetchModuleWithPolicy,
							},
							budgetProfile: "application-unicode-v1",
							limits: { timeoutMs },
						},
					);
					owners.add(owner);
					return owner;
				},
			}),
		}),
});
let report: Readonly<ScriptLoadReport> | undefined;
let navigationError: string | undefined;
let status: number | undefined;
let webclientImports: Record<string, unknown>[] = [];
let importObservationTimedOut = false;
let webclientFetchVerified = false;
let sourceModuleStatuses: (Readonly<PageSourceModuleStatus> | undefined)[] = [];
let moduleSettlementVerified = false;
let webclientCodeVerified = false;
try {
	const tab = browser.createTab();
	const navigation = await browser.navigate(tab.id, url);
	status = navigation.response?.status;
	if (observationMs > 0) {
		for (let round = 1; round <= 2; round++) {
			console.log(
				JSON.stringify({ event: "post-navigation", observationMs, round }),
			);
			await new Promise<void>((resolve) => setTimeout(resolve, observationMs));
			// Settlement can outlast its window. Give timers scheduled by those
			// scripts a bounded second window before inspecting the final state.
			await Promise.all([...loaders].map((loader) => loader.settle()));
		}
	}
	const imports = () =>
		browser
			.requests(tab.id)
			.entries.filter(
				(entry) =>
					entry.kind === "script" && webclientFormat(entry.url) !== undefined,
			);
	const moduleStatuses = () =>
		runtimes.map((runtime) =>
			runtime.closed ? undefined : runtime.sourceModuleStatus?.(),
		);
	const importsPending = () =>
		imports().some((entry) => entry.state === "pending") ||
		moduleStatuses().some((status) => status && status.pendingImports > 0);
	// A settled script loader can still have a callback loading the client.
	// Keep the bounded observation open until its entry actually executes or a
	// source import begins, rather than treating an empty import list as idle.
	const bootstrapPending = () =>
		!webclientScripts.some((script) => script.format === "classic") &&
		!imports().some((entry) => webclientFormat(entry.url) === "module");
	const clientWorkPending = () => importsPending() || bootstrapPending();
	const importDeadline = performance.now() + importWaitMs;
	if (clientWorkPending()) {
		const importStart = performance.now();
		let nextProgress = importStart;
		console.log(
			JSON.stringify({ event: "pending-source-modules", importWaitMs }),
		);
		while (
			clientWorkPending() &&
			performance.now() < importDeadline &&
			![...owners].every((owner) => owner.closed)
		) {
			const now = performance.now();
			if (now >= nextProgress) {
				nextProgress = now + 10000;
				console.log(
					JSON.stringify({
						event: "source-module-progress",
						elapsedMs: Math.round(now - importStart),
						bootstrapPending: bootstrapPending(),
						pendingCallbacks: pendingCallbacks.size,
						sourceModuleStatuses: moduleStatuses(),
						runtimes: runtimes.map((runtime) => ({
							closed: runtime.closed,
							stepsUsed: runtime.budget.stepsUsed,
							currentDataSize: currentDataSize(runtime),
						})),
					}),
				);
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 250));
		}
	}
	importObservationTimedOut =
		clientWorkPending() && performance.now() >= importDeadline;
	sourceModuleStatuses = moduleStatuses();
	moduleSettlementVerified =
		sourceModuleStatuses.length > 0 &&
		sourceModuleStatuses.every(
			(status) =>
				status &&
				status.pendingImports === 0 &&
				status.fulfilledImports > 0 &&
				status.rejectedImports === 0,
		);
	report = documentScriptState(browser.page(tab.id).document)?.report;
	webclientImports = imports()
		.slice(0, 16)
		.map((entry) => ({
			state: entry.state,
			status: entry.status,
			error: entry.error,
			elapsedMs: entry.elapsedMs,
			decodedBytes: entry.decodedBytes,
		}));
	webclientFetchVerified =
		webclientImports.length > 0 &&
		webclientImports.every(
			(entry) => entry.state === "complete" && entry.status === 200,
		);
	const formats = new Set(imports().map((entry) => webclientFormat(entry.url)));
	webclientCodeVerified =
		webclientFetchVerified &&
		(!formats.has("module") || moduleSettlementVerified) &&
		(!formats.has("classic") ||
			(webclientScripts.some((script) => script.format === "classic") &&
				webclientScripts.every((script) => script.ok)));
} catch (failure) {
	navigationError =
		failure instanceof AgentBrowserError ? failure.code : "probe-failed";
} finally {
	const pageRuntimeClosedBeforeCleanup =
		owners.size > 0 && [...owners].every((owner) => owner.closed);
	browser.close();
	const closes = await Promise.allSettled(
		[...owners].map((owner) => owner.close()),
	);
	const socketCloses = await Promise.allSettled([socketTransport.close()]);
	const webSockets = socketTransport.metrics();
	const cleanup = runtimes.map((runtime) => ({
		closed: runtime.closed,
		currentDataSize: currentDataSize(runtime) ?? "unavailable",
	}));
	const cleanupVerified =
		closes.every((result) => result.status === "fulfilled") &&
		socketCloses.every((result) => result.status === "fulfilled") &&
		webSockets.closed &&
		webSockets.active === 0 &&
		webSockets.pending === 0 &&
		cleanup.length > 0 &&
		cleanup.every((runtime) => runtime.closed && runtime.currentDataSize === 0);
	console.log(
		JSON.stringify({
			event: "result",
			scope: "Native Zoom navigation and script initialization only",
			timeoutMs,
			observationMs,
			importWaitMs,
			importObservationTimedOut,
			userAgent: browser.identity.userAgent,
			loaderLimits,
			transportLimits,
			blockedOrigins,
			moduleScripts: "enabled through the policy-aware native loader",
			status,
			navigationError,
			report,
			webclientImports,
			webclientFetchVerified,
			webclientScripts,
			webclientCodeVerified,
			sourceModuleStatuses,
			moduleSettlementVerified,
			pageRuntimeClosedBeforeCleanup,
			applicationReadinessVerified: false,
			meetingJoinVerified: false,
			webSockets,
			cleanupVerified,
			cleanup,
		}),
	);
	if (
		navigationError ||
		!report?.complete ||
		pageRuntimeClosedBeforeCleanup ||
		importObservationTimedOut ||
		!webclientCodeVerified ||
		report.failed ||
		report.halted ||
		!cleanupVerified
	)
		process.exitCode = 1;
}
