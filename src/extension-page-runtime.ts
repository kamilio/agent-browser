import { AgentBrowserError } from "./errors.js";
import type {
	HtmlClassicScriptRequest,
	HtmlModuleRequest,
} from "./html-module.js";
import {
	type PageNetworkModuleOptions,
	PageNetworkModuleRegistry,
} from "./page-network-modules.js";
import {
	type PageRuntimeError,
	type PageRuntimeEvaluationOptions,
	type PageRuntimeFactory,
	type PageRuntimeResult,
	readPageStringCompilation,
	readPageWasmCompilation,
} from "./page-runtime.js";
import {
	type PageSourceModuleOptions,
	PageSourceModuleRegistry,
} from "./page-source-modules.js";
import { pageWasmBootstrapSource } from "./page-wasm-bootstrap.js";
import { PageWasm, type PageWasmBudget } from "./page-wasm.js";
import { PageWindowGlobal } from "./page-window-global.js";
import type { WorkerBudget } from "./page-workers.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedRealm,
} from "./safejs-extension-types.js";

export const extensionPageRuntimeLimits = Object.freeze({
	extensions: 1,
	hostObjects: 4096,
	callbacks: 4096,
	guestReferences: 8192,
	cleanups: 64,
	nestedEvaluations: 8,
});
const extensionName = "agent-browser-page";

export interface ExtensionPageRuntimeOptions {
	webAssembly?: "bounded-v1";
	workerBinaryMessages?: "bounded-v1";
	classicScripts?: boolean;
	classicScriptErrors?: "fatal" | "report";
	callbackScheduling?: "after-prefix";
	stringCompilation?: "allow" | "deny";
	domExpandos?: "bounded-v1";
	sourceModules?: PageSourceModuleOptions;
	networkSourceModules?: PageNetworkModuleOptions;
}

function errorDetails(error: unknown): PageRuntimeError {
	const read = (name: string) => {
		if (!error || typeof error !== "object") return undefined;
		try {
			const descriptor = Object.getOwnPropertyDescriptor(error, name);
			return descriptor && "value" in descriptor ? descriptor.value : undefined;
		} catch {
			return undefined;
		}
	};
	const code = read("code");
	const budget = read("budget");
	return {
		code:
			typeof code === "string" && /^[A-Za-z_-]{1,64}$/.test(code)
				? code
				: "script-error",
		...(typeof budget === "string" && /^[A-Za-z]{1,32}$/.test(budget)
			? { budget }
			: {}),
	};
}

export function extensionPageRuntime(
	core: ReleasedCore,
	configuration: ExtensionPageRuntimeOptions = {},
): PageRuntimeFactory {
	if (
		!core ||
		![core.Budget, core.defineExtension, core.createRealm].every(
			(operation) => typeof operation === "function",
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"The public SafeJS extension core is required",
		);
	if (
		!configuration ||
		typeof configuration !== "object" ||
		Array.isArray(configuration)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid extension page runtime options",
		);
	const binaryDescriptor = Object.getOwnPropertyDescriptor(
		configuration,
		"workerBinaryMessages",
	);
	if (
		binaryDescriptor
			? !Object.hasOwn(binaryDescriptor, "value") ||
				!binaryDescriptor.enumerable ||
				binaryDescriptor.value !== "bounded-v1"
			: "workerBinaryMessages" in configuration
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid Worker binary message policy",
		);
	const binaryMessages = binaryDescriptor ? "bounded-v1" : undefined;
	const wasmDescriptor = Object.getOwnPropertyDescriptor(
		configuration,
		"webAssembly",
	);
	if (
		wasmDescriptor
			? !Object.hasOwn(wasmDescriptor, "value") ||
				!wasmDescriptor.enumerable ||
				wasmDescriptor.value !== "bounded-v1"
			: "webAssembly" in configuration
	)
		throw new AgentBrowserError("invalid-input", "Invalid WASM runtime policy");
	const webAssembly = wasmDescriptor ? "bounded-v1" : undefined;
	const expandoDescriptor = Object.getOwnPropertyDescriptor(
		configuration,
		"domExpandos",
	);
	if (
		expandoDescriptor
			? !Object.hasOwn(expandoDescriptor, "value") ||
				!expandoDescriptor.enumerable ||
				expandoDescriptor.value !== "bounded-v1"
			: "domExpandos" in configuration
	)
		throw new AgentBrowserError("invalid-input", "Invalid DOM expando policy");
	const domExpandos = expandoDescriptor ? "bounded-v1" : undefined;
	const stringPolicyDescriptor = Object.getOwnPropertyDescriptor(
		configuration,
		"stringCompilation",
	);
	if (
		stringPolicyDescriptor
			? !Object.hasOwn(stringPolicyDescriptor, "value") ||
				!stringPolicyDescriptor.enumerable
			: "stringCompilation" in configuration
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid guest string compilation policy",
		);
	const stringCompilation = stringPolicyDescriptor?.value;
	if (
		stringCompilation !== undefined &&
		stringCompilation !== "allow" &&
		stringCompilation !== "deny"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid guest string compilation policy",
		);
	const moduleOptions = configuration.sourceModules;
	if (
		configuration.classicScripts !== undefined &&
		typeof configuration.classicScripts !== "boolean"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid classic Script option",
		);
	const classicScripts = configuration.classicScripts === true;
	const scriptErrorDescriptor = Object.getOwnPropertyDescriptor(
		configuration,
		"classicScriptErrors",
	);
	if (
		scriptErrorDescriptor
			? !Object.hasOwn(scriptErrorDescriptor, "value") ||
				!scriptErrorDescriptor.enumerable
			: "classicScriptErrors" in configuration
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid classic Script error policy",
		);
	const classicScriptErrors = scriptErrorDescriptor?.value;
	if (
		(classicScriptErrors !== undefined &&
			classicScriptErrors !== "fatal" &&
			classicScriptErrors !== "report") ||
		(classicScriptErrors === "report" && !classicScripts)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid classic Script error policy",
		);
	const callbackScheduling = configuration.callbackScheduling;
	if (callbackScheduling !== undefined && callbackScheduling !== "after-prefix")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid callback scheduling option",
		);
	const networkModuleOptions = configuration.networkSourceModules;
	if (moduleOptions !== undefined && networkModuleOptions !== undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Static and network source modules cannot be configured together",
		);
	const modules =
		moduleOptions !== undefined
			? new PageSourceModuleRegistry(moduleOptions)
			: networkModuleOptions !== undefined
				? new PageNetworkModuleRegistry(networkModuleOptions)
				: undefined;
	return {
		supportsPageInitialization: true,
		createPageRuntime(options) {
			const wasmCompilation = readPageWasmCompilation(options) ?? "allow";
			if (webAssembly && options.globals.includes("__agentBrowserWasm"))
				throw new AgentBrowserError("invalid-input", "Reserved WASM global");
			const pageStringCompilation = readPageStringCompilation(options);
			const effectiveStringCompilation =
				stringCompilation === "deny" || pageStringCompilation === "deny"
					? "deny"
					: (pageStringCompilation ?? stringCompilation);
			const windowGlobal = classicScripts
				? new PageWindowGlobal(options.globals)
				: undefined;
			const initializationSource = options.initializationSource;
			if (
				initializationSource !== undefined &&
				typeof initializationSource !== "string"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid page initialization source",
				);
			if (
				initializationSource !== undefined &&
				initializationSource.length > options.limits.maxSourceCodeUnits
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Page initialization source is too large",
				);
			const bootstrapSource =
				(windowGlobal?.source ?? "") +
				(webAssembly ? pageWasmBootstrapSource : "") +
				(initializationSource ?? "");
			if (bootstrapSource.length > options.limits.maxSourceCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Page initialization source is too large",
				);
			if (options.signal.aborted)
				throw new AgentBrowserError(
					"aborted",
					"Page runtime creation was aborted",
				);
			const runtimeModuleOptions = options.networkSourceModules;
			if (runtimeModuleOptions !== undefined && modules !== undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Runtime and factory module configurations cannot be combined",
				);
			const selectedModules =
				runtimeModuleOptions !== undefined
					? new PageNetworkModuleRegistry(runtimeModuleOptions)
					: modules;
			const htmlEntries =
				(runtimeModuleOptions ?? networkModuleOptions)?.htmlEntries === true;
			const controller = new AbortController();
			const moduleScope =
				selectedModules instanceof PageNetworkModuleRegistry
					? selectedModules.createScope(
							controller.signal,
							options.limits.maxSourceCodeUnits,
							options.limits.maxDataSize,
						)
					: selectedModules?.createScope(
							controller.signal,
							options.limits.maxSourceCodeUnits,
						);
			let realm: ReleasedRealm | undefined;
			let context: ReleasedContext | undefined;
			let closed = false;
			let notified = false;
			let closing: Promise<void> | undefined;
			let initialized: Promise<void> | undefined;
			let setupComplete = false;
			const budget = new core.Budget({
				maxSteps: options.limits.maxSteps,
				maxCallDepth: options.limits.maxCallDepth,
				stringLength: options.limits.maxStringLength,
				...(options.regexSourceLength === undefined
					? {}
					: { regexSourceLength: options.regexSourceLength }),
				...(options.regexCompileAllocations === undefined
					? {}
					: { regexCompileAllocations: options.regexCompileAllocations }),
				arrayLength: options.limits.maxArrayLength,
				dataSize: options.limits.maxDataSize,
			});
			if (
				![budget.stepsUsed, budget.peakCallDepth, budget.peakDataSize].every(
					(value) => Number.isSafeInteger(value) && value >= 0,
				)
			)
				throw new AgentBrowserError(
					"unsupported",
					"SafeJS budget metrics are unavailable",
				);
			const wasmBudget = budget as typeof budget & PageWasmBudget;
			if (
				webAssembly &&
				![
					wasmBudget.visitNode,
					wasmBudget.setRetainedDataUsage,
					wasmBudget.allocateArrayLength,
					wasmBudget.provisionDataUsage,
					wasmBudget.enterCall,
				].every((operation) => typeof operation === "function")
			)
				throw new AgentBrowserError(
					"unsupported",
					"SafeJS WASM budget operations unavailable",
				);
			const wasmGlobals = webAssembly ? ["__agentBrowserWasm"] : [];
			const capabilities = [
				"guest:retain",
				"source:nested",
				...(webAssembly ? ["array-buffer:share"] : []),
			];
			const ensureOpen = () => {
				if (closed || controller.signal.aborted)
					throw new AgentBrowserError(
						"closed",
						"Page extension runtime is closed",
					);
			};
			const notifyClosed = () => {
				closed = true;
				if (notified) return;
				notified = true;
				controller.abort();
				options.onClosed();
			};
			const close = () => {
				if (closing) return closing;
				closed = true;
				closing = Promise.resolve().then(async () => {
					try {
						await realm?.close();
					} finally {
						options.signal.removeEventListener("abort", abort);
						context?.signal.removeEventListener("abort", notifyClosed);
					}
				});
				controller.abort();
				notifyClosed();
				return closing;
			};
			const abort = () => {
				void close().catch(() => undefined);
			};
			const workerBudget = budget as WorkerBudget;
			if (
				windowGlobal &&
				callbackScheduling === "after-prefix" &&
				options.workerPolicy &&
				options.workerDocumentUrl &&
				[
					workerBudget.forkRealm,
					workerBudget.acquireRealmOwner,
					workerBudget.setRetainedDataUsage,
				].every((operation) => typeof operation === "function")
			)
				windowGlobal.configureWorkers({
					core,
					budget: workerBudget,
					limits: options.limits,
					documentUrl: options.workerDocumentUrl,
					identity: options.workerIdentity,
					policy: options.workerPolicy,
					fetch: options.workerFetch,
					importFetch: options.workerImportFetch,
					importPolicy: options.workerImportPolicy,
					stringCompilation: effectiveStringCompilation,
					webAssembly,
					binaryMessages,
					wasmCompilation,
					report: (message) => options.sink.error(message),
					fail: () => {
						void close().catch(() => undefined);
					},
				});
			const extension = core.defineExtension({
				manifest: {
					version: 1,
					name: extensionName,
					globals: [
						...(windowGlobal?.names ?? options.globals),
						...wasmGlobals,
					],
					capabilities,
				},
				setup(owner) {
					ensureOpen();
					if (context)
						throw new AgentBrowserError(
							"invalid-input",
							"Page extension setup ran twice",
						);
					context = owner;
					owner.signal.addEventListener("abort", notifyClosed, { once: true });
					owner.onCleanup(() => {
						owner.signal.removeEventListener("abort", notifyClosed);
						notifyClosed();
					});
					if (owner.signal.aborted) {
						notifyClosed();
						ensureOpen();
					}
					const retainCallbacks =
						typeof owner.retainCallbackArguments === "function"
							? owner.retainCallbackArguments.bind(owner)
							: undefined;
					const pageContext: Parameters<typeof options.setup>[0] = {
						...(typeof owner.setHostObjectPrototype === "function"
							? {
									setHostObjectPrototype: (
										value: object,
										prototype: unknown,
										assertActive?: () => void,
									) => {
										ensureOpen();
										owner.setHostObjectPrototype?.(
											value,
											prototype,
											assertActive,
										);
										ensureOpen();
									},
								}
							: {}),
						eventTargetValue: (target) => {
							ensureOpen();
							return windowGlobal ? windowGlobal.map(target) : target;
						},
						nestedOperation: (operation) => {
							ensureOpen();
							if (setupComplete || typeof owner.nestedOperation !== "function")
								throw new AgentBrowserError(
									"unsupported",
									"Focus operations require public setup-time nested registration",
								);
							return owner.nestedOperation(operation);
						},
						createHostObject: (definition) => {
							ensureOpen();
							return windowGlobal
								? windowGlobal.createHostObject(owner, definition)
								: owner.createHostObject(definition);
						},
						retainGuestArguments: (operation, from) => {
							ensureOpen();
							return owner.retainGuestArguments(operation, from);
						},
						releaseGuestReference: (reference) => {
							if (!closed) owner.releaseGuestReference(reference);
						},
						...(retainCallbacks
							? {
									retainCallbackArguments: <
										Operation extends (...args: readonly unknown[]) => unknown,
									>(
										operation: Operation,
									): Operation => {
										ensureOpen();
										return retainCallbacks(operation);
									},
									releaseCallback: (callback: unknown) => {
										if (!closed) owner.releaseCallback(callback);
									},
								}
							: {}),
					};
					if (domExpandos)
						Object.defineProperty(pageContext, "domExpandos", {
							value: domExpandos,
							enumerable: true,
						});
					const globals = options.setup(pageContext);
					const installed: Record<string, unknown> =
						windowGlobal?.install(owner, globals) ?? globals;
					if (webAssembly) {
						if (Object.hasOwn(installed, "__agentBrowserWasm"))
							throw new AgentBrowserError(
								"invalid-input",
								"Reserved WASM global",
							);
						installed.__agentBrowserWasm = new PageWasm(
							owner,
							wasmBudget,
							undefined,
							wasmCompilation,
						).port;
					}
					setupComplete = true;
					return { globals: installed };
				},
			});
			try {
				realm = core.createRealm({
					...(classicScripts ? { classicScripts: true } : {}),
					...(classicScriptErrors === undefined ? {} : { classicScriptErrors }),
					...(callbackScheduling ? { callbackScheduling } : {}),
					...(effectiveStringCompilation === undefined
						? {}
						: { stringCompilation: effectiveStringCompilation }),
					...(moduleScope
						? {
								sourceImportTimeoutMs: options.limits.timeoutMs,
								sourceResolver: (specifier, referrer, resolution) => {
									ensureOpen();
									return moduleScope.resolve(specifier, referrer, resolution);
								},
							}
						: {}),
					extensions: [extension],
					builtinOverrides: { console: extensionName },
					grants: capabilities,
					budget,
					signal: controller.signal,
					sink: options.sink,
					limits: extensionPageRuntimeLimits,
				});
				if (moduleScope) {
					const policy = Object.getOwnPropertyDescriptor(
						realm,
						"sourceImportTimeoutMs",
					);
					if (
						!policy ||
						!Object.hasOwn(policy, "value") ||
						policy.value !== options.limits.timeoutMs ||
						policy.writable ||
						policy.configurable
					)
						throw new AgentBrowserError(
							"unsupported",
							"SafeJS source import deadline policy is unavailable",
						);
				}
				if (effectiveStringCompilation !== undefined) {
					const policy = Object.getOwnPropertyDescriptor(
						realm,
						"stringCompilation",
					);
					if (
						!policy ||
						!Object.hasOwn(policy, "value") ||
						policy.value !== effectiveStringCompilation ||
						policy.writable ||
						policy.configurable
					)
						throw new AgentBrowserError(
							"unsupported",
							"SafeJS guest string compilation policy is unavailable",
						);
				}
				if (classicScriptErrors !== undefined) {
					const policy = Object.getOwnPropertyDescriptor(
						realm,
						"classicScriptErrors",
					);
					if (
						!policy ||
						!Object.hasOwn(policy, "value") ||
						policy.value !== classicScriptErrors ||
						policy.writable ||
						policy.configurable
					)
						throw new AgentBrowserError(
							"unsupported",
							"SafeJS classic Script error policy is unavailable",
						);
				}
				options.signal.addEventListener("abort", abort, { once: true });
				if (options.signal.aborted) abort();
			} catch (error) {
				void close().catch(() => undefined);
				throw error;
			}
			const evaluate = async (
				source: string,
				evaluation: Partial<PageRuntimeEvaluationOptions> = {},
			): Promise<PageRuntimeResult> => {
				ensureOpen();
				const sourceType = evaluation.sourceType;
				const filename = evaluation.filename;
				const classicScriptId = evaluation.classicScriptId;
				if (classicScriptId !== undefined) {
					if (
						!classicScripts ||
						sourceType !== undefined ||
						!moduleScope ||
						!("validateClassicEntry" in moduleScope)
					)
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid classic source identity",
						);
					moduleScope.validateClassicEntry(source, classicScriptId);
				}
				if (sourceType !== undefined) {
					if (sourceType !== "module")
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid page source type",
						);
					if (!moduleScope)
						throw new AgentBrowserError(
							"unsupported",
							"Source modules require explicit host configuration",
						);
					moduleScope.validateEntry(source, filename);
				}
				// SafeJS uses its filename as the import referrer. Keep arbitrary host
				// labels from borrowing the network registry's admitted source identity.
				const sdkFilename =
					classicScriptId ??
					(sourceType !== "module" &&
					selectedModules instanceof PageNetworkModuleRegistry &&
					filename !== undefined &&
					/^(?:https?:|urn:agent-browser:html-(?:classic|module):)/.test(
						filename,
					)
						? "agent-browser:unadmitted-classic"
						: filename);
				if (!realm)
					throw new AgentBrowserError(
						"closed",
						"Page extension realm is unavailable",
					);
				if (evaluation.signal?.aborted) {
					await close();
					throw new AgentBrowserError("aborted", "Page evaluation was aborted");
				}
				evaluation.signal?.addEventListener("abort", abort, { once: true });
				try {
					const discard = Object.getOwnPropertyDescriptor(
						realm,
						"supportsDiscardResult",
					);
					const result = await realm.evaluate(source, {
						...(sdkFilename === undefined ? {} : { filename: sdkFilename }),
						...(sourceType === "module" ? { sourceType: "module" } : {}),
						...(evaluation.discardResult === true &&
						discard &&
						"value" in discard &&
						discard.value === true &&
						!discard.writable &&
						!discard.configurable
							? { discardResult: true }
							: {}),
					});
					if (!result || typeof result.ok !== "boolean")
						throw new AgentBrowserError(
							"unsupported",
							"Invalid public SafeJS realm result",
						);
					if (!result.ok) {
						const error = errorDetails(result.error);
						const recovery = Object.getOwnPropertyDescriptor(
							result,
							"recoverable",
						);
						if (
							classicScriptErrors === "report" &&
							sourceType !== "module" &&
							recovery &&
							Object.hasOwn(recovery, "value") &&
							recovery.value === true &&
							error.code === "UNCAUGHT_EXCEPTION" &&
							error.budget === undefined
						)
							ensureOpen();
						else await close();
						return { ok: false, error };
					}
					ensureOpen();
					return { ok: true, returnValue: result.returnValue };
				} catch (error) {
					try {
						await close();
					} catch (cleanup) {
						if (cleanup !== error)
							throw new AggregateError(
								[error, cleanup],
								"Page extension execution and cleanup failed",
							);
					}
					throw error;
				} finally {
					evaluation.signal?.removeEventListener("abort", abort);
				}
			};
			return {
				budget,
				sourceModuleStatus() {
					if (closed || !realm?.sourceModuleStatus) return undefined;
					ensureOpen();
					const status = realm.sourceModuleStatus();
					const result = {} as Record<keyof typeof status, number>;
					for (const key of [
						"pendingImports",
						"preparedModules",
						"fulfilledImports",
						"rejectedImports",
					] as const) {
						const descriptor =
							status && Object.getOwnPropertyDescriptor(status, key);
						if (
							!descriptor ||
							!("value" in descriptor) ||
							!Number.isSafeInteger(descriptor.value) ||
							descriptor.value < 0
						)
							throw new AgentBrowserError(
								"unsupported",
								"SafeJS source-module status is unavailable",
							);
						result[key] = descriptor.value;
					}
					return Object.freeze(result);
				},
				supportsSourceModules: moduleScope !== undefined,
				...(classicScripts &&
				htmlEntries &&
				moduleScope &&
				"prepareHtmlClassicScript" in moduleScope
					? {
							prepareClassicScript: async (
								request: HtmlClassicScriptRequest,
							) => {
								ensureOpen();
								const source =
									await moduleScope.prepareHtmlClassicScript(request);
								ensureOpen();
								return source;
							},
						}
					: {}),
				...(htmlEntries && moduleScope && "prepareHtmlModule" in moduleScope
					? {
							prepareModule: async (request: HtmlModuleRequest) => {
								ensureOpen();
								const source = await moduleScope.prepareHtmlModule(request);
								ensureOpen();
								return source;
							},
						}
					: {}),
				get closed() {
					return closed;
				},
				initialize() {
					ensureOpen();
					initialized ??= (async () => {
						const result = await evaluate(
							bootstrapSource,
							initializationSource === undefined && !windowGlobal
								? {}
								: { filename: "agent-browser:page-bootstrap" },
						);
						if (!result.ok)
							throw Object.assign(
								new Error("Page extension initialization failed"),
								result.error,
							);
						if (!setupComplete || (windowGlobal && !windowGlobal.initialized)) {
							await close();
							throw new AgentBrowserError(
								"unsupported",
								"SafeJS did not initialize page extension bindings",
							);
						}
					})();
					return initialized;
				},
				evaluate,
				copyResult: (value) => value,
				startCallback(callback, args, receiver) {
					ensureOpen();
					if (!realm || !setupComplete)
						throw new AgentBrowserError(
							"closed",
							"Page extension callbacks are unavailable",
						);
					return realm.startCallback(callback, {
						args: windowGlobal
							? args.map((value) => windowGlobal.map(value))
							: args,
						thisValue: windowGlobal
							? windowGlobal.map(receiver.thisValue)
							: receiver.thisValue,
					});
				},
				errorDetails,
				close,
			};
		},
	};
}
