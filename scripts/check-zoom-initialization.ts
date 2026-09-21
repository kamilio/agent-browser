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
} from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { BrowserSession } from "../src/session.js";

// Live-network/socket/SafeJS diagnostic, separate from native-tests.json. Run only
// with authorization for this meeting and its necessary sockets, for example:
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
//   node --max-old-space-size=192 dist/scripts/check-zoom-initialization.js
// Set AGENT_BROWSER_ZOOM_USER_AGENT explicitly to compare server-selected client
// documents; the same identity is published to HTTP requests and navigator.
// This checks initialization; it never certifies admission or meeting media.
const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled SafeJS package explicitly");
const timeoutMs = Number(
	process.env.AGENT_BROWSER_ZOOM_SCRIPT_TIMEOUT_MS ?? 30000,
);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
	throw new Error("Zoom script timeout must be between 1000 and 120000 ms");

const userAgent = process.env.AGENT_BROWSER_ZOOM_USER_AGENT;

const url = "https://app.zoom.us/wc/7982110526/join";
const blockedOrigins = [
	"https://file-paa.zoom.us",
	"https://cdn.cookielaw.org",
];
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
const runtimes: PageRuntime[] = [];
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
			event: "runtime-failure",
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
		new NodeNetworkTransport({ cookieJar, blockedOrigins }),
	loadDocument: (response, context) =>
		loadBrowserDocument(response, {
			...context,
			scripts: new ScriptLoader({
				response,
				topLevelDocument: context.topLevelDocument,
				signal: context.signal,
				fetch: context.fetchScript,
				fetchWithPolicy: context.fetchScriptWithPolicy,
				limits: loaderLimits,
				owner(document) {
					if (!context.fetchScriptWithPolicy)
						throw new AgentBrowserError(
							"unsupported",
							"Zoom modules require policy-aware script fetching",
						);
					const owner = new PageScripts(
						{ document, interactions: documentInteractions(document) },
						observed,
						{
							fetch: context.fetch,
							networkSourceModules: {
								documentUrl: response.url,
								entries: [],
								htmlEntries: true,
								fetchWithPolicy: context.fetchScriptWithPolicy,
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
try {
	const tab = browser.createTab();
	const navigation = await browser.navigate(tab.id, url);
	status = navigation.response?.status;
	report = documentScriptState(browser.page(tab.id).document)?.report;
} catch (failure) {
	navigationError =
		failure instanceof AgentBrowserError ? failure.code : "probe-failed";
} finally {
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
			userAgent: browser.identity.userAgent,
			loaderLimits,
			blockedOrigins,
			moduleScripts: "enabled through the policy-aware native loader",
			status,
			navigationError,
			report,
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
		report.failed ||
		report.halted ||
		!cleanupVerified
	)
		process.exitCode = 1;
}
