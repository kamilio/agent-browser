import { AgentBrowserError } from "./errors.js";
import type {
	PageRuntimeError,
	PageRuntimeFactory,
	PageRuntimeResult,
} from "./page-runtime.js";
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

export function extensionPageRuntime(core: ReleasedCore): PageRuntimeFactory {
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
	return {
		createPageRuntime(options) {
			if (options.signal.aborted)
				throw new AgentBrowserError(
					"aborted",
					"Page runtime creation was aborted",
				);
			const controller = new AbortController();
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
			const extension = core.defineExtension({
				manifest: {
					version: 1,
					name: extensionName,
					globals: options.globals,
					capabilities: ["guest:retain", "source:nested"],
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
					const globals = options.setup({
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
							return owner.createHostObject(definition);
						},
						retainGuestArguments: (operation, from) => {
							ensureOpen();
							return owner.retainGuestArguments(operation, from);
						},
						releaseGuestReference: (reference) => {
							if (!closed) owner.releaseGuestReference(reference);
						},
					});
					setupComplete = true;
					return { globals };
				},
			});
			try {
				realm = core.createRealm({
					extensions: [extension],
					builtinOverrides: { console: extensionName },
					grants: ["guest:retain", "source:nested"],
					budget,
					signal: controller.signal,
					sink: options.sink,
					limits: extensionPageRuntimeLimits,
				});
				options.signal.addEventListener("abort", abort, { once: true });
				if (options.signal.aborted) abort();
			} catch (error) {
				void close().catch(() => undefined);
				throw error;
			}
			const evaluate = async (
				source: string,
				evaluation: { signal?: AbortSignal; filename?: string } = {},
			): Promise<PageRuntimeResult> => {
				ensureOpen();
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
					const result = await realm.evaluate(
						source,
						evaluation.filename === undefined
							? {}
							: { filename: evaluation.filename },
					);
					if (!result || typeof result.ok !== "boolean")
						throw new AgentBrowserError(
							"unsupported",
							"Invalid public SafeJS realm result",
						);
					if (!result.ok) {
						await close();
						return { ok: false, error: errorDetails(result.error) };
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
				get closed() {
					return closed;
				},
				initialize() {
					ensureOpen();
					initialized ??= (async () => {
						const result = await evaluate("");
						if (!result.ok)
							throw Object.assign(
								new Error("Page extension initialization failed"),
								result.error,
							);
						if (!setupComplete) {
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
						args,
						thisValue: receiver.thisValue,
					});
				},
				errorDetails,
				close,
			};
		},
	};
}
