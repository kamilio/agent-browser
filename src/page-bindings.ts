import { AgentBrowserError } from "./errors.js";
import { existingDocumentWebSockets } from "./document-websocket-owner.js";
import { PageWebSockets, type PageWebSocketLimits } from "./page-websockets.js";
import { pageWebSocketBootstrapGlobal } from "./page-websocket-bootstrap.js";
import { PageXmlHttpRequests } from "./page-xml-http-requests.js";
import { pageXmlHttpRequestBootstrapGlobal } from "./page-xml-http-request-bootstrap.js";
import {
	PageDomMethods,
	pageDomMethodsBootstrapGlobal,
} from "./page-dom-methods.js";
import { PageEventConstructors } from "./page-event-constructors.js";
import { pageEventBootstrapGlobal } from "./page-event-bootstrap.js";
import {
	pageDomConstructorBootstrapGlobal,
	pageDomParserBootstrapGlobal,
} from "./page-dom-constructor-bootstrap.js";
import type { PageAbortSignals } from "./page-abort-signals.js";
import { documentIdentity } from "./document-identity.js";
import { PagePasskeys, type PagePasskeyContext } from "./page-passkeys.js";
import type { PasskeyAuthenticator } from "./passkeys.js";
import { pageCssEscape, pageCssSupports } from "./page-css.js";
import { documentScrollPosition } from "./document-scroll.js";
import { PageScroll } from "./page-scroll.js";
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
import {
	PageAnimationFrames,
	type AnimationFrameLimits,
} from "./page-animation-frames.js";
import { PageClock, createPagePerformance } from "./page-performance.js";
import { PageMedia } from "./page-media.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import { createPageScreen } from "./page-screen.js";
import { documentStyles } from "./styles.js";
import { PageFocus, type PageFocusRegistration } from "./page-focus.js";
import {
	PageIdleCallbacks,
	type IdleCallbackLimits,
} from "./page-idle-callbacks.js";

export interface PageBindingContext extends ScriptHostObjectFactory {
	nestedOperation?: PageFocusRegistration;
	retainGuestArguments<
		Operation extends (...args: readonly unknown[]) => unknown,
	>(operation: Operation, from: number): Operation;
	releaseGuestReference(value: unknown): unknown;
}

export interface PageBindingOptions {
	webSocketLimits?: Partial<PageWebSocketLimits>;
	passkeys?: {
		authenticator: PasskeyAuthenticator;
		context: PagePasskeyContext;
	};
	fetch?: PageFetchTransport;
	fetchLimits?: Partial<PageFetchLimits>;
	fetchSignals?: PageAbortSignals;
	consoleLimits?: Partial<ConsoleLimits>;
	timerLimits?: Partial<TimerLimits>;
	animationFrameLimits?: Partial<AnimationFrameLimits>;
	idleCallbackLimits?: Partial<IdleCallbackLimits>;
	focusLimits?: { maxBindings?: number };
}

export interface PageBindingLifecycle extends ScriptCallbackRuntime {
	isBusy?(): boolean;
	isTimerBusy?(): boolean;
	fail(error?: unknown): void;
	onConsoleCall(): void;
}

export function pageBindingGlobalNames(
	document: SessionPage["document"],
	options: PageBindingOptions = {},
	enableXmlHttpRequests = true,
	enableEventConstructors = false,
): readonly string[] {
	return Object.freeze([
		...(enableEventConstructors ? [pageEventBootstrapGlobal] : []),
		...(enableEventConstructors ? [pageDomConstructorBootstrapGlobal] : []),
		...(enableEventConstructors ? [pageDomParserBootstrapGlobal] : []),
		...(enableEventConstructors ? [pageDomMethodsBootstrapGlobal] : []),
		...(existingDocumentWebSockets(document)
			? [pageWebSocketBootstrapGlobal]
			: []),
		"navigator",
		"screen",
		...Object.keys(nativeHeadlessDisplay),
		...(pageStoragePort(document) ? ["localStorage", "sessionStorage"] : []),
		...(pageHistoryPort(document) ? ["history"] : []),
		"location",
		...(options.fetch !== undefined
			? [
					"fetch",
					...(!enableXmlHttpRequests
						? []
						: [pageXmlHttpRequestBootstrapGlobal]),
				]
			: []),
		"setTimeout",
		"setInterval",
		"clearTimeout",
		"clearInterval",
		"getComputedStyle",
		"getSelection",
		"CSS",
		"matchMedia",
		"scroll",
		"scrollTo",
		"scrollBy",
		"requestAnimationFrame",
		"cancelAnimationFrame",
		"requestIdleCallback",
		"cancelIdleCallback",
		"performance",
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
	readonly animationFrames: PageAnimationFrames;
	readonly idleCallbacks: PageIdleCallbacks;
	readonly performance: object;
	readonly css: object;
	readonly media: PageMedia;
	readonly scrolling: PageScroll;
	readonly focus: PageFocus;
	readonly network?: PageFetch;
	readonly xmlHttpRequests?: PageXmlHttpRequests;
	readonly eventConstructors?: PageEventConstructors;
	readonly domMethods?: PageDomMethods;
	readonly passkeys?: PagePasskeys;
	readonly webSockets?: PageWebSockets;
	readonly navigator: object;
	readonly screen: object;
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
		private readonly clock = new PageClock(),
		enableXmlHttpRequests = true,
		enableEventConstructors = false,
	) {
		if (
			!context ||
			![
				context.createHostObject,
				context.retainGuestArguments,
				context.releaseGuestReference,
			].every((operation) => typeof operation === "function") ||
			(context.nestedOperation !== undefined &&
				typeof context.nestedOperation !== "function")
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
			if (enableEventConstructors)
				this.eventConstructors = new PageEventConstructors(
					page.document,
					context,
					events,
					() => this.dom?.eventBindings,
				);
			if (enableEventConstructors)
				this.domMethods = new PageDomMethods(page.document, context);
			const socketOwner = existingDocumentWebSockets(page.document);
			if (socketOwner)
				this.webSockets = new PageWebSockets(
					page.document,
					context,
					lifecycle,
					socketOwner,
					options.webSocketLimits,
				);
			if (options.passkeys !== undefined) {
				this.passkeys = new PagePasskeys(
					page.document,
					context,
					options.passkeys.authenticator,
					options.passkeys.context,
				);
			}
			const identity = documentIdentity(page.document);
			const readIdentity =
				(name: "userAgent" | "language" | "languages") => () => {
					this.ensureOpen();
					return identity[name];
				};
			this.navigator = context.createHostObject({
				properties: {
					userAgent: { get: readIdentity("userAgent") },
					language: { get: readIdentity("language") },
					languages: { get: readIdentity("languages") },
					...(this.passkeys
						? {
								credentials: {
									get: () => {
										this.ensureOpen();
										return this.passkeys?.credentials;
									},
								},
							}
						: {}),
				},
			});
			this.performance = createPagePerformance(context, this.clock);
			this.css = context.createHostObject({
				methods: {
					escape: (...args) => {
						this.ensureOpen();
						return pageCssEscape(...args);
					},
					supports: (...args) => {
						this.ensureOpen();
						return pageCssSupports(...args);
					},
				},
			});
			this.ensureOpen();
			this.animationFrames = new PageAnimationFrames(
				{
					isClosed: () => this.closed,
					startCallback: (callback, args, value) =>
						lifecycle.startCallback(callback, args, value),
				},
				() => this.window,
				(error) => lifecycle.fail(error),
				this.clock,
				options.animationFrameLimits,
			);
			this.idleCallbacks = new PageIdleCallbacks(
				{
					isClosed: () => this.closed,
					isBusy: () => lifecycle.isBusy?.() ?? false,
					startCallback: (callback, args, value) =>
						lifecycle.startCallback(callback, args, value),
				},
				context,
				(error) => lifecycle.fail(error),
				this.clock,
				options.idleCallbackLimits,
			);
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
					signals: options.fetchSignals,
				});
				if (context.nestedOperation && enableXmlHttpRequests)
					this.xmlHttpRequests = new PageXmlHttpRequests(
						page.document,
						context,
						this.network,
					);
			}
			this.timers = new PageTimers(
				{
					isClosed: () => this.closed,
					isBusy: () => lifecycle.isTimerBusy?.() ?? false,
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
			const getComputedStyle = (element: unknown, pseudo?: unknown) => {
				this.ensureOpen();
				return this.dom.getComputedStyle(element, pseudo);
			};
			const getSelection = () => {
				this.ensureOpen();
				return this.dom.getSelection();
			};
			const matchMedia = (...args: unknown[]) => {
				this.ensureOpen();
				return this.media.matchMedia(...args);
			};
			this.scrolling = new PageScroll(
				page.document,
				events,
				() => lifecycle.isBusy?.() ?? false,
				(error) => lifecycle.fail(error),
			);
			this.screen = createPageScreen(
				context,
				() => documentStyles(page.document).viewport,
				() => this.ensureOpen(),
			);
			this.window = context.createHostObject({
				properties: {
					...(this.xmlHttpRequests
						? {
								XMLHttpRequest: {
									get: () => {
										this.ensureOpen();
										return this.xmlHttpRequests?.constructorValue;
									},
								},
							}
						: {}),
					...(this.webSockets
						? {
								WebSocket: {
									get: () => {
										this.ensureOpen();
										return this.webSockets?.constructorValue;
									},
								},
							}
						: {}),
					screen: {
						get: () => {
							this.ensureOpen();
							return this.screen;
						},
					},
					...Object.fromEntries(
						Object.entries(nativeHeadlessDisplay).map(([name, value]) => [
							name,
							{
								get: () => {
									this.ensureOpen();
									return value;
								},
							},
						]),
					),
					CSS: {
						get: () => {
							this.ensureOpen();
							return this.css;
						},
					},
					...Object.fromEntries(
						["scrollX", "scrollY", "pageXOffset", "pageYOffset"].map((name) => [
							name,
							{
								get: () => {
									this.ensureOpen();
									const scroll = documentScrollPosition(page.document);
									return name === "scrollX" || name === "pageXOffset"
										? scroll.x
										: scroll.y;
								},
							},
						]),
					),
					innerWidth: {
						get: () => {
							this.ensureOpen();
							return this.media.width;
						},
					},
					innerHeight: {
						get: () => {
							this.ensureOpen();
							return this.media.height;
						},
					},
					onresize: {
						get: () => {
							this.ensureOpen();
							return (
								this.dom.eventBindings?.getHandler(windowTarget, "resize") ??
								null
							);
						},
						set: (value) => {
							this.ensureOpen();
							this.dom.eventBindings?.setHandler(windowTarget, "resize", value);
						},
					},
					ontoggle: {
						get: () => {
							this.ensureOpen();
							return (
								this.dom.eventBindings?.getHandler(windowTarget, "toggle") ??
								null
							);
						},
						set: (value) => {
							this.ensureOpen();
							this.dom.eventBindings?.setHandler(windowTarget, "toggle", value);
						},
					},
					onscroll: {
						get: () => {
							this.ensureOpen();
							return (
								this.dom.eventBindings?.getHandler(windowTarget, "scroll") ??
								null
							);
						},
						set: (value) => {
							this.ensureOpen();
							this.dom.eventBindings?.setHandler(windowTarget, "scroll", value);
						},
					},
					performance: {
						get: () => {
							this.ensureOpen();
							return this.performance;
						},
					},
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
					navigator: {
						get: () => {
							this.ensureOpen();
							return this.navigator;
						},
					},
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
					...(this.eventConstructors
						? {
								Event: {
									get: () => this.eventConstructors?.eventConstructorValue,
								},
								CustomEvent: {
									get: () =>
										this.eventConstructors?.customEventConstructorValue,
								},
								dispatchEvent: {
									get: () => this.eventConstructors?.dispatchEventValue,
								},
							}
						: {}),
				},
				methods: {
					...this.animationFrames.methods,
					...this.idleCallbacks.methods,
					...this.scrolling.methods,
					getComputedStyle,
					getSelection,
					matchMedia,
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
			this.eventConstructors?.registerTarget(windowTarget, this.window);
			const registerFocus = context.nestedOperation?.bind(context);
			this.focus = new PageFocus(
				page.interactions.focus,
				(position) => {
					void this.scrolling.requestPosition(position);
				},
				registerFocus
					? {
							document: page.document,
							register: (operation) => {
								this.ensureOpen();
								const registered = registerFocus(operation);
								this.ensureOpen();
								return registered;
							},
							maxBindings: options.focusLimits?.maxBindings,
						}
					: undefined,
			);
			this.dom = new ScriptDom(
				page.document,
				this.domMethods?.factory ?? context,
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
				(position) => {
					void this.scrolling.requestPosition(position);
				},
				this.focus.synchronousPageMethods ? this.focus : undefined,
				this.eventConstructors,
			);
			this.console = new PageConsole(page.document, context, {
				limits: options.consoleLimits,
				isClosed: () => this.closed,
				onCall: () => lifecycle.onConsoleCall(),
				describe: (value) => this.dom.consoleLabel(value),
			});
			if (!this.dom.eventBindings)
				throw new AgentBrowserError(
					"unsupported",
					"Media queries require event bindings",
				);
			this.media = new PageMedia(
				page.document,
				context,
				events,
				this.dom.eventBindings,
				(error) => lifecycle.fail(error),
			);
			this.globals = {
				...(enableEventConstructors
					? {
							[pageDomParserBootstrapGlobal]: (
								source: unknown,
								type: unknown,
							) => this.dom.parseFromString(source, type),
							[pageDomConstructorBootstrapGlobal]: (
								value: unknown,
								name: unknown,
							) => this.dom.hasInstance(value, name),
						}
					: {}),
				...(this.domMethods
					? { [pageDomMethodsBootstrapGlobal]: this.domMethods.bootstrap }
					: {}),
				...(this.eventConstructors
					? { [pageEventBootstrapGlobal]: this.eventConstructors.bootstrap }
					: {}),
				...(this.xmlHttpRequests
					? {
							[pageXmlHttpRequestBootstrapGlobal]:
								this.xmlHttpRequests.bootstrap,
						}
					: {}),
				...(this.webSockets
					? { [pageWebSocketBootstrapGlobal]: this.webSockets.bootstrap }
					: {}),
				...nativeHeadlessDisplay,
				navigator: this.navigator,
				screen: this.screen,
				CSS: this.css,
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
				...this.animationFrames.methods,
				...this.idleCallbacks.methods,
				performance: this.performance,
				getComputedStyle,
				getSelection,
				matchMedia,
				document: this.dom.document,
				...this.scrolling.methods,
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
		this.eventConstructors?.close();
		this.domMethods?.close();
		this.webSockets?.close();
		this.xmlHttpRequests?.close();
		this.passkeys?.close();
		this.focus?.close();
		this.timers?.close();
		this.animationFrames?.close();
		this.idleCallbacks?.close();
		this.media?.close();
		this.scrolling?.close();
		this.clock.close();
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
