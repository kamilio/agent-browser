import { AgentBrowserError } from "./errors.js";
import { type ConsoleLimits, PageConsole } from "./page-console.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import { pageHistoryPort } from "./page-history.js";
import { pageStoragePort } from "./page-storage.js";
import { PageTimers, type TimerLimits } from "./page-timers.js";
import {
	ScriptDom,
	type ScriptHostObjectFactory,
	domString,
} from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import { ScriptHistory } from "./script-history.js";
import { ScriptLocation } from "./script-location.js";
import { ScriptStorage } from "./script-storage.js";
import type { SessionPage } from "./session.js";

export interface PageBindingContext extends ScriptHostObjectFactory {
	retainGuestArguments<
		Operation extends (...args: readonly unknown[]) => unknown,
	>(operation: Operation, from: number): Operation;
	releaseGuestReference(value: unknown): unknown;
}

export interface PageBindingOptions {
	fetch?: PageFetchTransport;
	fetchLimits?: Partial<PageFetchLimits>;
	consoleLimits?: Partial<ConsoleLimits>;
	timerLimits?: Partial<TimerLimits>;
}

export interface PageBindingLifecycle extends ScriptCallbackRuntime {
	fail(error?: unknown): void;
	onConsoleCall(): void;
}

export function pageBindingGlobalNames(
	document: SessionPage["document"],
	options: PageBindingOptions = {},
): readonly string[] {
	return Object.freeze([
		...(pageStoragePort(document) ? ["localStorage", "sessionStorage"] : []),
		...(pageHistoryPort(document) ? ["history"] : []),
		"location",
		...(options.fetch !== undefined ? ["fetch"] : []),
		"setTimeout",
		"setInterval",
		"clearTimeout",
		"clearInterval",
		"console",
		"document",
		"window",
		"self",
	]);
}

export class PageBindings {
	readonly dom: ScriptDom;
	readonly window: object;
	readonly console: PageConsole;
	readonly timers: PageTimers;
	readonly network?: PageFetch;
	readonly location: ScriptLocation;
	readonly history?: ScriptHistory;
	readonly storage?: ScriptStorage;
	readonly globals: Record<string, unknown>;
	private closedValue = false;
	private unregisterClose: () => void = () => {};

	constructor(
		page: Pick<SessionPage, "document" | "interactions">,
		context: PageBindingContext,
		private readonly lifecycle: PageBindingLifecycle,
		options: PageBindingOptions = {},
	) {
		if (
			!context ||
			![
				context.createHostObject,
				context.retainGuestArguments,
				context.releaseGuestReference,
			].every((operation) => typeof operation === "function")
		)
			throw new AgentBrowserError(
				"unsupported",
				"Page bindings require owned host capability operations",
			);
		if (
			!lifecycle ||
			![
				lifecycle.isClosed,
				lifecycle.startCallback,
				lifecycle.fail,
				lifecycle.onConsoleCall,
			].every((operation) => typeof operation === "function")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page binding lifecycle",
			);
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page binding options",
			);
		const events = page.interactions.events;
		const windowTarget = events.windowTarget;
		if (
			events.documentRoot !== page.document.root ||
			windowTarget === null ||
			events.metrics().closed
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page bindings require this document's active Window dispatcher",
			);
		this.ensureOpen();
		this.unregisterClose = page.document.onClose(() => this.close());
		try {
			const history = pageHistoryPort(page.document);
			this.location = new ScriptLocation(page.document, context, history);
			if (history)
				this.history = new ScriptHistory(page.document, context, history);
			const storage = pageStoragePort(page.document);
			if (storage)
				this.storage = new ScriptStorage(page.document, context, storage);
			if (options.fetch !== undefined) {
				if (typeof options.fetch !== "function")
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid page fetch transport",
					);
				this.network = new PageFetch(page.document, context, options.fetch, {
					limits: options.fetchLimits,
				});
			}
			this.timers = new PageTimers(
				{
					isClosed: () => this.closed,
					startCallback: (callback, args, value) =>
						lifecycle.startCallback(callback, args, value),
				},
				() => this.window,
				(error) => lifecycle.fail(error),
				options.timerLimits,
				(value) => context.releaseGuestReference(value),
			);
			const timerMethods = {
				...this.timers.methods,
				setTimeout: context.retainGuestArguments(
					this.timers.methods.setTimeout,
					2,
				),
				setInterval: context.retainGuestArguments(
					this.timers.methods.setInterval,
					2,
				),
			};
			this.window = context.createHostObject({
				properties: {
					...(this.storage
						? {
								localStorage: {
									get: () => {
										this.ensureOpen();
										return this.storage?.localStorage;
									},
								},
								sessionStorage: {
									get: () => {
										this.ensureOpen();
										return this.storage?.sessionStorage;
									},
								},
							}
						: {}),
					...(this.history
						? {
								history: {
									get: () => {
										this.ensureOpen();
										return this.history?.object;
									},
								},
							}
						: {}),
					location: {
						get: () => {
							this.ensureOpen();
							return this.location.object;
						},
						set: (value) => this.location.navigate(value),
					},
					console: { get: () => this.console.object },
					document: { get: () => this.dom.document },
					window: { get: () => this.window },
					self: { get: () => this.window },
					top: { get: () => this.window },
					parent: { get: () => this.window },
				},
				methods: {
					...(this.network ? { fetch: this.network.fetch } : {}),
					...timerMethods,
					addEventListener: (type, callback, value) => {
						this.ensureOpen();
						this.dom.eventBindings?.add(
							windowTarget,
							domString(type),
							callback,
							value,
						);
					},
					removeEventListener: (type, callback, value) => {
						this.ensureOpen();
						this.dom.eventBindings?.remove(
							windowTarget,
							domString(type),
							callback,
							value,
						);
					},
				},
			});
			this.dom = new ScriptDom(
				page.document,
				context,
				{
					events,
					window: this.window,
					storageArea: (kind) =>
						this.storage?.[
							kind === "local" ? "localStorage" : "sessionStorage"
						] ?? null,
					callbacks: {
						isClosed: () => this.closed,
						startCallback: (callback, args, value) =>
							lifecycle.startCallback(callback, args, value),
					},
				},
				this.location,
				this.storage,
			);
			this.console = new PageConsole(page.document, context, {
				limits: options.consoleLimits,
				isClosed: () => this.closed,
				onCall: () => lifecycle.onConsoleCall(),
				describe: (value) => this.dom.consoleLabel(value),
			});
			this.globals = {
				...(this.storage
					? {
							localStorage: this.storage.localStorage,
							sessionStorage: this.storage.sessionStorage,
						}
					: {}),
				...(this.history ? { history: this.history.object } : {}),
				location: this.location.object,
				...(this.network ? { fetch: this.network.fetch } : {}),
				...timerMethods,
				console: this.console.object,
				document: this.dom.document,
				window: this.window,
				self: this.window,
			};
		} catch (error) {
			this.close();
			throw error;
		}
	}

	get closed() {
		return this.closedValue || this.lifecycle.isClosed();
	}

	close() {
		if (this.closedValue) return;
		this.closedValue = true;
		this.timers?.close();
		this.network?.close();
		this.location?.close();
		this.history?.close();
		this.storage?.close();
		this.dom?.close();
		this.unregisterClose();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page bindings are closed");
	}
}
