import {
	type BrowserIdentity,
	type BrowserIdentityOptions,
	browserIdentityHeaders,
	createBrowserIdentity,
} from "./browser-identity.js";
import {
	clickTargetAriaDisabled,
	findClickPoint,
	findGeneratedClickPoint,
	findGeneratedHoverPoint,
	findHoverPoint,
} from "./click-target.js";
import { ContentSecurityPolicy } from "./content-security-policy.js";
import {
	CookieJar,
	type CookieJarOptions,
	type CookieLimits,
} from "./cookies.js";
import { documentFiles, existingDocumentFiles } from "./document-files.js";
import { bindDocumentIdentity } from "./document-identity.js";
import { documentImageContentSecurityPolicy } from "./document-image-content-security-policy.js";
import type { ImageFetch } from "./document-images.js";
import {
	type DocumentScriptAdmission,
	documentScriptCsp,
	initializeDocumentScriptCsp,
	snapshotDocumentScriptCspHeaders,
} from "./document-script-csp.js";
import {
	type ScriptLoadReport,
	documentScriptState,
} from "./document-script-state.js";
import { selectDocumentFragmentTarget, urlFragment } from "./document-url.js";
import {
	bindDocumentWebSockets,
	existingDocumentWebSockets,
} from "./document-websocket-owner.js";
import type { DocumentWebSockets } from "./document-websockets.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type EventAction, runEventActionAsync } from "./event-actions.js";
import { hasUnsupportedExecutionCsp } from "./execution-content-security-policy.js";
import type { FormRequestResult } from "./form-actions.js";
import type { FormSubmissionOptions } from "./forms.js";
import { resolveVisualTarget } from "./generated-controls.js";
import {
	type DocumentHistory,
	type HistoryArchive,
	documentHistory as sharedDocumentHistory,
} from "./history.js";
import { type HtmlParseInfo, htmlParseInfo } from "./html-info.js";
import type { HtmlScriptHooks } from "./html-parser.js";
import { ImageContentSecurityPolicy } from "./image-content-security-policy.js";
import { imageMediaTypes } from "./image-decoder.js";
import {
	type DocumentInteractions,
	type InteractionResult,
	documentInteractions,
} from "./interactions.js";
import { keyboardChord } from "./keyboard-state.js";
import type { KeyboardResult } from "./keyboard.js";
import type { DocumentMouse, MouseButton, MouseResult } from "./mouse.js";
import {
	type ColorSchemePreference,
	nativeColorScheme,
	validateColorSchemePreference,
} from "./native-color-scheme.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import {
	NavigationHistory,
	type TraversalTarget,
} from "./navigation-history.js";
import {
	NetworkJournal,
	type NetworkJournalSnapshot,
} from "./network-journal.js";
import { NetworkRequestQueue } from "./network-request-queue.js";
import { NetworkRoutes } from "./network-routes.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	type NetworkTransport,
	parseNetworkUrl,
} from "./network.js";
import { recordPageTraversalError } from "./page-console.js";
import type { PageFetchTransport } from "./page-fetch.js";
import { type PageHistoryPort, bindPageHistory } from "./page-history.js";
import { type PageStoragePort, bindPageStorage } from "./page-storage.js";
import { PageTraversals } from "./page-traversals.js";
import {
	type ScriptFetchPolicy,
	type ScriptFetchResult,
	fetchScriptResource,
} from "./script-fetch.js";
import {
	type ScrollIntoViewOptions,
	type ScrollIntoViewResult,
	documentScrollIntoView,
} from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { type SnapshotOptions, snapshotDocument } from "./snapshot.js";
import { PageStorageEvents } from "./storage-events.js";
import { BrowserStorage, type StorageLimits } from "./storage.js";
import { type DocumentStyles, documentStyles } from "./styles.js";
import {
	type StylesheetFetchPolicy,
	type StylesheetFetchResult,
	fetchStylesheetResource,
} from "./stylesheet-fetch.js";
import type { UploadActionRunner } from "./upload-transfers.js";
import type { WebSocketTransport } from "./websocket-transport.js";

export interface DocumentLoaderContext {
	readonly topLevelDocument?: true;
	readonly initializeDocument?: (tree: DocumentTree) => void;
	readonly fetch?: PageFetchTransport;
	readonly signal: AbortSignal;
	readonly tabId: string;
	readonly limits: Readonly<DocumentLimits>;
	readonly fetchStylesheet?: (url: string) => Promise<NetworkResponse>;
	readonly fetchStylesheetWithPolicy?: (
		url: string,
		policy: StylesheetFetchPolicy,
	) => Promise<Readonly<StylesheetFetchResult>>;
	readonly fetchScript?: (url: string) => Promise<NetworkResponse>;
	readonly fetchScriptWithPolicy?: (
		url: string,
		policy: ScriptFetchPolicy,
		signal: AbortSignal,
		admission?: DocumentScriptAdmission,
	) => Promise<Readonly<ScriptFetchResult>>;
	readonly fetchImage?: ImageFetch;
	readonly scripts?: HtmlScriptHooks;
}

export type DocumentLoader = (
	response: NetworkResponse,
	context: DocumentLoaderContext,
) => Promise<DocumentTree> | DocumentTree;

export interface SessionLimits {
	maxHistoryDocuments: number;
	maxHistoryBytes: number;
	maxTabs: number;
	maxNavigations: number;
	maxPendingNavigations: number;
	maxStylesheetRequests: number;
	maxScriptRequests: number;
	navigationTimeoutMs: number;
}

export interface BrowserSessionOptions {
	webSocketTransport?: WebSocketTransport;
	resourceCredentials?: "default" | "omit";
	createTransport: (cookies: CookieJar) => NetworkTransport;
	loadDocument: DocumentLoader;
	identity?: BrowserIdentityOptions;
	limits?: Partial<SessionLimits>;
	documentLimits?: Partial<DocumentLimits>;
	storageLimits?: Partial<StorageLimits>;
	cookieLimits?: Partial<CookieLimits>;
	cookiePolicy?: CookieJarOptions;
	colorSchemePreference?: ColorSchemePreference;
}

export interface SessionPage {
	readonly webSockets?: DocumentWebSockets;
	readonly fetch?: PageFetchTransport;
	readonly document: DocumentTree;
	readonly interactions: DocumentInteractions;
	readonly queries: DocumentQueries;
	readonly history: DocumentHistory;
	readonly styles: DocumentStyles;
}

export interface SessionTab {
	readonly id: string;
	readonly url: string | null;
	readonly selected: boolean;
	readonly loading: boolean;
	readonly documentRef: string | null;
}

export interface SessionRequests extends NetworkJournalSnapshot {
	readonly scope: "latest-network-navigation";
	readonly tabId: string;
	readonly navigation: number;
	readonly document: string | null;
	readonly displayedDocument: string | null;
}

export interface NavigationOptions {
	signal?: AbortSignal;
}

export interface KeyPressOptions extends NavigationOptions {
	target?: string;
}

export interface NavigationResult {
	kind: "document" | "same-document" | "no-content";
	tabId: string;
	url: string | null;
	documentRef: string | null;
	html?: Readonly<HtmlParseInfo>;
	styles?: ReturnType<DocumentStyles["metrics"]>;
	scripts?: Readonly<ScriptLoadReport>;
	response?: {
		url: string;
		status: number;
		bytes: number;
		redirects: number;
	};
}

export interface SessionClickResult {
	interaction: InteractionResult;
	mouse?: MouseResult;
	navigation?: NavigationResult;
	form?: Omit<FormRequestResult, "submission">;
}

export interface SessionDoubleClickResult {
	reference: string;
	clicks: readonly SessionClickResult[];
	doubleClick?: MouseResult;
	canceled: boolean;
	completed: boolean;
	interrupted?: "navigation";
	navigation?: NavigationResult;
}

export interface SessionHoverResult {
	reference: string;
	mouse: MouseResult;
}

export interface SessionSubmitResult {
	form: Omit<FormRequestResult, "submission">;
	navigation?: NavigationResult;
}
export interface SessionKeyResult {
	keyboard: KeyboardResult;
	navigation?: NavigationResult;
	form?: Omit<FormRequestResult, "submission">;
}
export interface SessionMouseResult {
	mouse: MouseResult;
	navigation?: NavigationResult;
	form?: Omit<FormRequestResult, "submission">;
}

interface TabState {
	pageTraversals: PageTraversals;
	journal: NetworkJournal;
	networkNavigation: number;
	networkDocument: string | null;
	history: NavigationHistory;
	id: string;
	openerUrl: string | null;
	viewport: { width: number; height: number };
	colorSchemePreference: ColorSchemePreference;
	page?: Readonly<SessionPage>;
	job?: NavigationJob;
	postDocument?: boolean;
}

interface NavigationJob {
	controller: AbortController;
	tab: TabState;
	pageTraversal: boolean;
	document?: DocumentTree;
}

interface HistoryNavigation {
	kind: "reload" | "traverse";
	source: DocumentHistory;
	revision: number;
	archive: HistoryArchive;
	target?: TraversalTarget;
}

const ownedDocuments = new WeakSet<DocumentTree>();

function aborted(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Navigation aborted");
}

function withAbort<Result>(
	work: Promise<Result>,
	signal: AbortSignal,
): Promise<Result> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(aborted(signal));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

export class BrowserSession {
	private readonly viewportIdentity = crypto.randomUUID();
	readonly identity: Readonly<BrowserIdentity>;
	readonly limits: Readonly<SessionLimits>;
	readonly documentLimits: Readonly<DocumentLimits>;
	readonly cookies: CookieJar;
	readonly storage: BrowserStorage;
	readonly routes = new NetworkRoutes();
	private readonly storageEvents = new PageStorageEvents();
	private readonly transport: NetworkTransport;
	private readonly webSocketTransport?: WebSocketTransport;
	private readonly resourceCredentials: "default" | "omit";
	private readonly networkQueue?: NetworkRequestQueue;
	private readonly loadDocument: DocumentLoader;
	private readonly initialColorSchemePreference: ColorSchemePreference;
	private tabStates = new Map<string, TabState>();
	private jobs = new Set<NavigationJob>();
	private selected: string | null = null;
	private nextTabId = 1;
	private navigations = 0;
	private commits = 0;
	private cleanupErrors = 0;
	private closed = false;
	private readonly pageTraversalSignals = new WeakSet<AbortSignal>();

	constructor(options: BrowserSessionOptions) {
		if (
			!options ||
			typeof options.createTransport !== "function" ||
			typeof options.loadDocument !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"A session requires explicit transport and document loader adapters",
			);
		if (
			options.webSocketTransport !== undefined &&
			(!options.webSocketTransport ||
				typeof options.webSocketTransport.connect !== "function")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid session WebSocket transport",
			);
		this.webSocketTransport = options.webSocketTransport;
		this.resourceCredentials =
			options.resourceCredentials === undefined
				? "default"
				: options.resourceCredentials;
		if (!["default", "omit"].includes(this.resourceCredentials))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid resource credentials mode",
			);
		try {
			this.identity = createBrowserIdentity(options.identity);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid browser identity");
		}
		this.initialColorSchemePreference = validateColorSchemePreference(
			options.colorSchemePreference === undefined
				? nativeColorScheme.preference
				: options.colorSchemePreference,
		);
		this.limits = Object.freeze({
			maxHistoryDocuments: 32,
			maxHistoryBytes: 8_388_608,
			maxTabs: 32,
			maxNavigations: 500,
			maxPendingNavigations: 8,
			maxStylesheetRequests: 8,
			maxScriptRequests: 16,
			navigationTimeoutMs: 30_000,
			...options.limits,
		});
		for (const [name, value] of Object.entries(this.limits))
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value >
					(name === "maxHistoryBytes"
						? 67_108_864
						: name === "navigationTimeoutMs"
							? 300_000
							: name === "maxNavigations"
								? 1_000_000
								: 128)
			)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid session limit: ${name}`,
				);
		this.documentLimits = Object.freeze({
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
			...options.documentLimits,
		});
		for (const [name, value] of Object.entries(this.documentLimits))
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value >
					(name === "maxTextCodeUnits"
						? 67_108_864
						: name === "maxNodes"
							? 1_000_000
							: 65_536)
			)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid session document limit: ${name}`,
				);
		const cookiePolicy = Object.getOwnPropertyDescriptor(
			options,
			"cookiePolicy",
		);
		if (
			cookiePolicy
				? !Object.hasOwn(cookiePolicy, "value") || !cookiePolicy.enumerable
				: "cookiePolicy" in options
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid session cookie policy",
			);
		this.cookies = new CookieJar(
			options.cookieLimits,
			Date.now,
			cookiePolicy?.value,
		);
		this.storage = new BrowserStorage(
			{
				...options.storageLimits,
				maxTabs: this.limits.maxTabs,
			},
			(mutation) => this.storageEvents.publish(mutation),
		);
		this.loadDocument = options.loadDocument;
		let transport: NetworkTransport | undefined;
		try {
			transport = options.createTransport(this.cookies);
			if (
				!transport ||
				typeof transport.request !== "function" ||
				typeof transport.close !== "function" ||
				typeof transport.metrics !== "function"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid session transport adapter",
				);
			this.transport = transport;
			if (transport.limits !== undefined)
				this.networkQueue = new NetworkRequestQueue(
					transport.limits?.maxConcurrent,
				);
		} catch (error) {
			if (transport && typeof transport.close === "function")
				this.cleanup(() => transport?.close());
			this.cookies.close();
			this.storage.close();
			this.storageEvents.close();
			throw error;
		}
	}

	createTab(options: { opener?: string; select?: boolean } = {}): SessionTab {
		this.ensureOpen();
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			(options.opener !== undefined && typeof options.opener !== "string") ||
			(options.select !== undefined && typeof options.select !== "boolean")
		)
			throw new AgentBrowserError("invalid-input", "Invalid tab options");
		if (
			this.tabStates.size >= this.limits.maxTabs ||
			!Number.isSafeInteger(this.nextTabId)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Session tab limit exceeded",
			);
		const opener =
			options.opener === undefined ? undefined : this.tab(options.opener);
		const id = `tab-${this.nextTabId++}`;
		this.storage.openTab(id, opener?.id);
		const tab: TabState = {
			id,
			pageTraversals: new PageTraversals(async (document, action, signal) => {
				await documentInteractions(document).events.whenIdle(signal);
				if (this.tab(id).page?.document !== document)
					throw new AgentBrowserError(
						"closed",
						"Traversal document is no longer active",
					);
				this.pageTraversalSignals.add(signal);
				try {
					if (action.kind === "fragment") return await action.run(signal);
					if (action.kind === "navigate")
						return await this.startNavigation(
							id,
							action.url,
							{ signal },
							false,
							undefined,
							undefined,
							action.replace,
						);
					return await this.go(id, action.delta, { signal });
				} finally {
					this.pageTraversalSignals.delete(signal);
				}
			}, recordPageTraversalError),
			viewport: { width: 1280, height: 720 },
			colorSchemePreference: this.initialColorSchemePreference,
			journal: new NetworkJournal(),
			networkNavigation: 0,
			networkDocument: null,
			openerUrl: opener?.page?.document.url ?? null,
			history: new NavigationHistory(
				this.limits.maxHistoryDocuments,
				this.limits.maxHistoryBytes,
			),
		};
		this.tabStates.set(id, tab);
		if (options.select !== false || this.selected === null) this.selectTab(id);
		return this.describe(tab);
	}

	viewport(id: string) {
		const tab = this.tab(id);
		return Object.freeze({
			tabId: id,
			key: `${this.viewportIdentity}:${id}`,
			document: tab.page?.document.reference(tab.page.document.root) ?? null,
			...(tab.page?.styles.viewport ?? tab.viewport),
			deviceScaleFactor: nativeHeadlessDisplay.devicePixelRatio,
			partial: true,
			profile: "logical-css-viewport",
		});
	}

	colorSchemePreference(id: string): ColorSchemePreference {
		return this.tab(id).colorSchemePreference;
	}

	setColorSchemePreference(id: string, preference: ColorSchemePreference) {
		const tab = this.tab(id);
		validateColorSchemePreference(preference);
		tab.colorSchemePreference = preference;
		if (tab.job?.document && tab.job.document !== tab.page?.document)
			documentStyles(tab.job.document).setColorSchemePreference(preference);
		tab.page?.styles.setColorSchemePreference(preference);
		return preference;
	}

	resize(id: string, width: number, height: number) {
		const tab = this.tab(id);
		if (
			![width, height].every(
				(value) => Number.isSafeInteger(value) && value >= 1 && value <= 16_384,
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid CSS viewport");
		tab.page?.styles.setViewport(width, height);
		tab.viewport = { width, height };
		return { ...tab.viewport, partial: true, layout: false };
	}

	tabs(): readonly SessionTab[] {
		this.ensureOpen();
		return Object.freeze(
			Array.from(this.tabStates.values(), (tab) => this.describe(tab)),
		);
	}

	selectTab(id: string): SessionTab {
		const tab = this.tab(id);
		if (this.selected !== id && this.selected !== null) {
			const previous = this.tabStates.get(this.selected)?.page;
			if (previous)
				existingDocumentFiles(previous.document)?.invalidateTargets();
		}
		this.selected = id;
		return this.describe(tab);
	}

	uploadContext(id: string) {
		const tab = this.tab(id);
		const page = this.page(id);
		const check = () => {
			this.ensureOpen();
			if (
				this.selected !== id ||
				this.tabStates.get(id) !== tab ||
				tab.page !== page ||
				tab.job
			)
				throw new AgentBrowserError(
					"stale-reference",
					"Upload document is not current",
				);
		};
		check();
		const run: UploadActionRunner = (action, signal) =>
			runEventActionAsync(
				page.interactions.events,
				this.uploadOwnedAction(action, () => {
					if (signal.aborted)
						throw new AgentBrowserError("aborted", "Upload action aborted");
					check();
				}),
				signal,
			);
		return { owner: documentFiles(page.document), run };
	}

	private *uploadOwnedAction<Result>(
		action: EventAction<Result>,
		check: () => void,
	): EventAction<Result> {
		try {
			check();
			let step = action.next();
			while (!step.done) {
				let allowed: boolean;
				try {
					check();
					allowed = yield step.value;
					check();
				} catch (error) {
					step = action.throw(error);
					continue;
				}
				step = action.next(allowed);
			}
			check();
			return step.value;
		} finally {
			action.return(undefined as never);
		}
	}

	page(id: string): Readonly<SessionPage> {
		const page = this.tab(id).page;
		if (!page)
			throw new AgentBrowserError("not-found", "Tab has no committed document");
		page.document.reference(page.document.root);
		return page;
	}

	snapshot(id: string, options: SnapshotOptions = {}) {
		return snapshotDocument(this.page(id).document, options);
	}

	requests(id: string): SessionRequests {
		const tab = this.tab(id);
		return {
			...tab.journal.snapshot(),
			scope: "latest-network-navigation",
			tabId: id,
			navigation: tab.networkNavigation,
			document: tab.networkDocument,
			displayedDocument:
				tab.page?.document.reference(tab.page.document.root) ?? null,
		};
	}

	request(id: string, index: number) {
		const tab = this.tab(id);
		const { entries, ...metadata } = this.requests(id);
		return { ...metadata, entry: tab.journal.detail(index) };
	}

	history(id: string) {
		const tab = this.tab(id);
		return tab.history.snapshot(tab.page?.history.capture());
	}

	async go(
		id: string,
		delta: number,
		options: NavigationOptions = {},
	): Promise<NavigationResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "History traversal aborted");
		if (!Number.isSafeInteger(delta))
			throw new AgentBrowserError(
				"invalid-input",
				"History delta must be a safe integer",
			);
		if (delta === 0) return this.reload(id, options);
		const tab = this.tab(id);
		const page = this.page(id);
		const history = page.history;
		const target = tab.history.target(history.capture(), delta);
		if (!target) return this.result("same-document", tab);
		if (
			target.post &&
			(!target.sameDocument || page.interactions.events.metrics().closed)
		)
			throw new AgentBrowserError(
				"unsupported",
				"History entry requires explicit POST resubmission",
			);
		return this.startNavigation(
			id,
			target.archive.entries[target.archive.index].url,
			options,
			true,
			undefined,
			{
				kind: "traverse",
				source: history,
				revision: history.revision,
				archive: target.archive,
				target,
			},
		);
	}

	back(id: string, options: NavigationOptions = {}) {
		return this.go(id, -1, options);
	}
	forward(id: string, options: NavigationOptions = {}) {
		return this.go(id, 1, options);
	}

	navigate(
		id: string,
		url: string,
		options: NavigationOptions = {},
	): Promise<NavigationResult> {
		return this.startNavigation(id, url, options, false);
	}

	reload(
		id: string,
		options: NavigationOptions = {},
	): Promise<NavigationResult> {
		if (this.tab(id).postDocument)
			throw new AgentBrowserError(
				"unsupported",
				"Reload requires explicit form resubmission; automatic POST replay is disabled",
			);
		const page = this.page(id);
		return this.startNavigation(
			id,
			page.document.url,
			options,
			true,
			undefined,
			{
				kind: "reload",
				source: page.history,
				revision: page.history.revision,
				archive: page.history.capture(),
			},
		);
	}

	async requestSubmit(
		id: string,
		reference: string,
		formOptions: FormSubmissionOptions = {},
		options: NavigationOptions = {},
	): Promise<SessionSubmitResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Submission aborted");
		const tab = this.tab(id);
		const page = this.page(id);
		const previousJob = tab.job;
		const { submission, ...form } =
			await page.interactions.forms.requestSubmitAsync(reference, formOptions);
		if (options.signal?.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Submission aborted during events",
			);
		if (this.page(id) !== page || tab.job !== previousJob)
			throw new AgentBrowserError(
				"aborted",
				"Submission document or navigation changed during events",
			);
		if (!submission) return { form };
		if (
			!["", "_self", "_top", "_parent"].includes(
				submission.target.toLowerCase(),
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Form submission to another target is not implemented",
			);
		return {
			form,
			navigation: await this.startNavigation(
				id,
				submission.request.url,
				options,
				submission.request.method === "POST",
				submission.request,
			),
		};
	}

	async press(
		id: string,
		key: string,
		options: KeyPressOptions = {},
	): Promise<SessionKeyResult> {
		return this.keyboardAction(id, "pressAsync", key, options);
	}

	async keydown(
		id: string,
		key: string,
		options: NavigationOptions = {},
	): Promise<SessionKeyResult> {
		return this.keyboardAction(id, "downAsync", key, options);
	}

	async keyup(
		id: string,
		key: string,
		options: NavigationOptions = {},
	): Promise<SessionKeyResult> {
		return this.keyboardAction(id, "upAsync", key, options);
	}

	private async keyboardAction(
		id: string,
		method: "pressAsync" | "downAsync" | "upAsync",
		key: string,
		options: KeyPressOptions,
	): Promise<SessionKeyResult> {
		this.validateNavigationOptions(options);
		if (
			options.target !== undefined &&
			(method !== "pressAsync" || typeof options.target !== "string")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Only press accepts a target reference",
			);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Keyboard action aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		if (options.target !== undefined) {
			keyboardChord(key);
			const target = resolveVisualTarget(page.document, options.target);
			await runEventActionAsync(
				page.interactions.events,
				page.interactions.focus.focusAction(options.target),
				options.signal,
			);
			if (options.signal?.aborted || tab.job !== previousJob)
				throw new AgentBrowserError(
					"aborted",
					"Keyboard action interrupted during focus",
				);
			if (this.page(id) !== page)
				throw new AgentBrowserError(
					"stale-reference",
					"Keyboard focus document was replaced",
				);
			if (
				page.interactions.focus.activeReference() !==
				(target.generated?.ref ?? page.document.reference(target.node.id))
			)
				throw new AgentBrowserError(
					"not-actionable",
					"Keyboard target lost focus before key dispatch",
				);
		}
		const keyboard = await page.interactions.keyboard[method](
			key,
			options.signal,
		);
		if (options.signal?.aborted || tab.job !== previousJob)
			throw new AgentBrowserError(
				"aborted",
				"Keyboard action interrupted during events",
			);
		if (this.page(id) !== page)
			throw new AgentBrowserError(
				"stale-reference",
				"Keyboard action document was replaced",
			);
		const action = keyboard.defaultAction;
		if (action?.kind === "submit")
			return {
				keyboard,
				...(await this.requestSubmit(
					id,
					action.formRef,
					{ submitter: action.submitterRef },
					options,
				)),
			};
		if (
			action?.kind === "navigate" &&
			["", "_self", "_top", "_parent"].includes(action.target.toLowerCase())
		)
			return {
				keyboard,
				navigation: await this.navigate(id, action.url, options),
			};
		return { keyboard };
	}

	async mousemove(
		id: string,
		x: number,
		y: number,
		options: NavigationOptions = {},
	): Promise<SessionMouseResult> {
		return this.mouseAction(
			id,
			(mouse) => mouse.moveAsync(x, y, options.signal),
			options,
		);
	}
	async mousewheel(
		id: string,
		deltaX: number,
		deltaY: number,
		options: NavigationOptions = {},
	): Promise<SessionMouseResult> {
		return this.mouseAction(
			id,
			(mouse) => mouse.wheelAsync(deltaX, deltaY, options.signal),
			options,
		);
	}
	async mousedown(
		id: string,
		button: MouseButton = "left",
		options: NavigationOptions = {},
	): Promise<SessionMouseResult> {
		return this.mouseAction(
			id,
			(mouse) => mouse.downAsync(button, options.signal),
			options,
		);
	}
	async mouseup(
		id: string,
		button: MouseButton = "left",
		options: NavigationOptions = {},
	): Promise<SessionMouseResult> {
		return this.mouseAction(
			id,
			(mouse) => mouse.upAsync(button, options.signal),
			options,
		);
	}
	private async mouseAction(
		id: string,
		invoke: (mouse: DocumentMouse) => Promise<MouseResult>,
		options: NavigationOptions,
	): Promise<SessionMouseResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Mouse action aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		const mouse = await invoke(page.interactions.mouse);
		if (options.signal?.aborted || tab.job !== previousJob)
			throw new AgentBrowserError(
				"aborted",
				"Mouse action interrupted during events",
			);
		if (this.page(id) !== page)
			throw new AgentBrowserError(
				"stale-reference",
				"Mouse action document was replaced",
			);
		const action = mouse.defaultAction;
		if (action?.kind === "submit")
			return {
				mouse,
				...(await this.requestSubmit(
					id,
					action.formRef,
					{ submitter: action.submitterRef },
					options,
				)),
			};
		if (
			action?.kind === "navigate" &&
			["", "_self", "_top", "_parent"].includes(action.target.toLowerCase())
		)
			return {
				mouse,
				navigation: await this.navigate(id, action.url, options),
			};
		return { mouse };
	}

	async scrollIntoView(
		id: string,
		reference: string,
		alignment: ScrollIntoViewOptions = {},
		options: NavigationOptions = {},
	): Promise<ScrollIntoViewResult> {
		return this.scrollTargetIntoView(id, reference, alignment, options);
	}

	private async scrollTargetIntoView(
		id: string,
		reference: string,
		alignment: ScrollIntoViewOptions,
		options: NavigationOptions,
		includeOutsideMarkers = false,
	): Promise<ScrollIntoViewResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Scroll into view aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		const target = resolveVisualTarget(page.document, reference);
		const result = await runEventActionAsync(
			page.interactions.events,
			documentScrollIntoView(page.document).action(
				target.generated?.ref ?? target.node.id,
				alignment,
				includeOutsideMarkers,
			),
			options.signal,
		);
		if (options.signal?.aborted || tab.job !== previousJob)
			throw new AgentBrowserError(
				"aborted",
				"Scroll into view interrupted during events",
			);
		if (this.page(id) !== page)
			throw new AgentBrowserError(
				"stale-reference",
				"Scroll-into-view document was replaced",
			);
		if (!result.hasBox)
			throw new AgentBrowserError(
				"not-actionable",
				"Scroll-into-view target has no layout box",
			);
		return result;
	}

	async hover(
		id: string,
		reference: string,
		options: NavigationOptions = {},
	): Promise<SessionHoverResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Hover aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		if (page.interactions.actionability(reference, false, true).blocked)
			throw new AgentBrowserError(
				"not-actionable",
				"Hover target is hidden or inert",
			);
		await this.scrollTargetIntoView(
			id,
			reference,
			{ block: "nearest", inline: "nearest" },
			options,
			true,
		);
		const status = page.interactions.actionability(reference, false, true);
		if (status.blocked)
			throw new AgentBrowserError(
				"not-actionable",
				"Hover target became hidden or inert during scrolling",
			);
		const generated = resolveVisualTarget(page.document, reference).generated;
		const target = generated
			? findGeneratedHoverPoint(page.document, generated.ref)
			: findHoverPoint(page.document, status.node.id);
		if (!target.point)
			throw new AgentBrowserError(
				"not-actionable",
				`Hover target is not actionable: ${target.blocked}`,
			);
		const mouse = await page.interactions.mouse.hoverTargetAsync(
			reference,
			target.point,
			options.signal,
		);
		if (options.signal?.aborted || tab.job !== previousJob)
			throw new AgentBrowserError("aborted", "Hover interrupted during events");
		if (this.page(id) !== page)
			throw new AgentBrowserError(
				"stale-reference",
				"Hover document was replaced",
			);
		return { reference, mouse };
	}

	async click(
		id: string,
		reference: string,
		options: NavigationOptions = {},
	): Promise<SessionClickResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Action aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		const status = page.interactions.actionability(reference);
		const generated = resolveVisualTarget(page.document, reference).generated;
		if (
			status.blocked ||
			clickTargetAriaDisabled(
				page.document,
				status.node.id,
				generated !== undefined,
			)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Click target is hidden, inert or disabled",
			);
		await this.scrollTargetIntoView(
			id,
			reference,
			{ block: "nearest", inline: "nearest" },
			options,
			true,
		);
		if (page.interactions.actionability(reference).blocked)
			throw new AgentBrowserError(
				"not-actionable",
				"Click target became hidden, inert or disabled during scrolling",
			);
		const target = generated
			? findGeneratedClickPoint(page.document, generated.ref)
			: findClickPoint(page.document, status.node.id);
		if (!target.point)
			throw new AgentBrowserError(
				"not-actionable",
				`Click target is not actionable: ${target.blocked}${target.interceptingRef ? ` (${target.interceptingRef} intercepts)` : ""}`,
			);
		const mouse = await page.interactions.mouse.clickTargetAsync(
			reference,
			target.point,
			options.signal,
		);
		if (!mouse.interaction)
			throw new AgentBrowserError(
				"not-actionable",
				"Target did not receive a click after pointer events",
			);
		const interaction = { ...mouse.interaction, reference };
		if (options.signal?.aborted || tab.job !== previousJob)
			throw new AgentBrowserError(
				"aborted",
				"Action interrupted during events",
			);
		if (this.page(id) !== page)
			throw new AgentBrowserError(
				"stale-reference",
				"Action document was replaced",
			);
		return this.clickDefault(id, interaction, mouse, options);
	}

	async dblclick(
		id: string,
		reference: string,
		options: NavigationOptions = {},
	): Promise<SessionDoubleClickResult> {
		this.validateNavigationOptions(options);
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		const checkOwnership = () => {
			if (options.signal?.aborted || tab.job !== previousJob)
				throw new AgentBrowserError("aborted", "Double-click interrupted");
			if (this.page(id) !== page)
				throw new AgentBrowserError(
					"stale-reference",
					"Double-click document was replaced",
				);
		};
		checkOwnership();
		const status = page.interactions.actionability(reference);
		const generated = resolveVisualTarget(page.document, reference).generated;
		if (
			status.blocked ||
			clickTargetAriaDisabled(
				page.document,
				status.node.id,
				generated !== undefined,
			)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Double-click target is hidden, inert or disabled",
			);
		await this.scrollTargetIntoView(
			id,
			reference,
			{ block: "nearest", inline: "nearest" },
			options,
			true,
		);
		checkOwnership();
		if (page.interactions.actionability(reference).blocked)
			throw new AgentBrowserError(
				"not-actionable",
				"Double-click target became hidden, inert or disabled during scrolling",
			);
		const target = generated
			? findGeneratedClickPoint(page.document, generated.ref)
			: findClickPoint(page.document, status.node.id);
		if (!target.point)
			throw new AgentBrowserError(
				"not-actionable",
				`Double-click target is not actionable: ${target.blocked}`,
			);
		const clicks: SessionClickResult[] = [];
		const navigationStop = new Error(
			"Double-click ended after document navigation",
		);
		let navigation: NavigationResult | undefined;
		try {
			const result = await page.interactions.mouse.doubleClickTargetAsync(
				reference,
				target.point,
				{
					signal: options.signal,
					checkOwnership,
					afterClick: async (mouse) => {
						checkOwnership();
						if (!mouse.interaction)
							throw new AgentBrowserError(
								"not-actionable",
								"Target did not receive a click",
							);
						const click = await this.clickDefault(
							id,
							{ ...mouse.interaction, reference },
							mouse,
							options,
						);
						clicks.push(click);
						if (
							click.interaction.defaultAction &&
							!click.navigation &&
							!click.form
						)
							throw new AgentBrowserError(
								"unsupported",
								"Double-click stopped: pending click default action is not implemented",
							);
						if (click.navigation) {
							navigation = click.navigation;
							if (click.navigation.kind === "document") {
								if (options.signal?.aborted)
									throw new AgentBrowserError(
										"aborted",
										"Double-click interrupted",
									);
								throw navigationStop;
							}
						}
					},
				},
			);
			checkOwnership();
			return {
				reference,
				clicks,
				doubleClick: result.doubleClick,
				canceled: result.canceled,
				completed: result.doubleClick !== undefined,
				...(navigation ? { navigation } : {}),
			};
		} catch (error) {
			if (error !== navigationStop) throw error;
			return {
				reference,
				clicks,
				canceled: clicks.some((click) => click.mouse?.canceled),
				completed: false,
				interrupted: "navigation",
				navigation,
			};
		}
	}

	private async clickDefault(
		id: string,
		interaction: InteractionResult,
		mouse: MouseResult,
		options: NavigationOptions,
	): Promise<SessionClickResult> {
		const action = interaction.defaultAction;
		if (action?.kind === "submit")
			return {
				interaction,
				mouse,
				...(await this.requestSubmit(
					id,
					action.formRef,
					{ submitter: action.submitterRef },
					options,
				)),
			};
		if (
			action?.kind === "navigate" &&
			["", "_self", "_top", "_parent"].includes(action.target.toLowerCase())
		)
			return {
				interaction,
				mouse,
				navigation: await this.navigate(id, action.url, options),
			};
		return { interaction, mouse };
	}

	stop(id: string) {
		const tab = this.tab(id);
		tab.pageTraversals.cancel();
		tab.job?.controller.abort(
			new AgentBrowserError("aborted", "Navigation stopped"),
		);
	}

	closeTab(id: string) {
		const tab = this.tab(id);
		tab.pageTraversals.close();
		this.tabStates.delete(id);
		if (this.selected === id)
			this.selected = this.tabStates.keys().next().value ?? null;
		tab.job?.controller.abort(new AgentBrowserError("closed", "Tab is closed"));
		if (tab.page) this.cleanup(() => tab.page?.document.close());
		tab.page = undefined;
		tab.history.close();
		tab.journal.close();
		this.cleanup(() => this.storage.closeTab(id));
	}

	metrics() {
		return Object.freeze({
			tabs: this.tabStates.size,
			selectedTab: this.selected,
			pendingLoads: this.jobs.size,
			pageTraversals: Object.freeze(
				[...this.tabStates.values()].map((tab) =>
					Object.freeze({ tabId: tab.id, ...tab.pageTraversals.metrics() }),
				),
			),
			navigations: this.navigations,
			commits: this.commits,
			cleanupErrors: this.cleanupErrors,
			closed: this.closed,
			network: this.transport.metrics(),
			...(this.networkQueue
				? { requestQueue: this.networkQueue.metrics() }
				: {}),
			routes: {
				...this.routes.metrics(),
				automaticRedirects:
					typeof this.transport.requestWithRoutes === "function",
			},
			cookies: this.cookies.metrics(),
			storage: this.storage.metrics(),
			storageEvents: this.storageEvents.metrics(),
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.networkQueue?.close();
		for (const job of this.jobs)
			job.controller.abort(
				new AgentBrowserError("closed", "Session is closed"),
			);
		const tabs = Array.from(this.tabStates.values());
		this.tabStates.clear();
		this.selected = null;
		for (const tab of tabs) {
			tab.pageTraversals.close();
			if (tab.page) this.cleanup(() => tab.page?.document.close());
			tab.page = undefined;
			tab.history.close();
			tab.journal.close();
		}
		this.cleanup(() => this.transport.close());
		this.cleanup(() => this.routes.close());
		this.cleanup(() => this.cookies.close());
		this.cleanup(() => this.storage.close());
		this.cleanup(() => this.storageEvents.close());
	}

	private ensureOpen() {
		if (this.closed) throw new AgentBrowserError("closed", "Session is closed");
	}

	private async fetchNetwork(input: NetworkRequest): Promise<NetworkResponse> {
		this.ensureOpen();
		if (!this.networkQueue) return this.dispatchNetwork(input);
		const release = await this.networkQueue.acquire(input.signal);
		try {
			if (input.signal?.aborted) throw aborted(input.signal);
			return await this.dispatchNetwork(input);
		} finally {
			release();
		}
	}

	private async dispatchNetwork(
		input: NetworkRequest,
	): Promise<NetworkResponse> {
		this.ensureOpen();
		const request: NetworkRequest = {
			...input,
			headers: browserIdentityHeaders(this.identity, input.headers),
		};
		if (typeof this.transport.requestWithRoutes === "function")
			return this.transport.requestWithRoutes(request, (routeRequest) =>
				this.routes.fulfill(routeRequest),
			);
		const mocked = this.routes.fulfill(request);
		if (mocked) {
			if ([301, 302, 303, 307, 308].includes(mocked.status)) {
				if (request.redirect === "error")
					throw new AgentBrowserError(
						"policy-denied",
						"Redirects are disabled",
					);
				if (
					(request.redirect ?? "follow") === "follow" &&
					mocked.headers.location
				)
					throw new AgentBrowserError(
						"unsupported",
						"Automatic redirects with active routes are not implemented",
					);
			}
			return mocked;
		}
		if (
			!this.routes.metrics().routes ||
			(request.redirect ?? "follow") !== "follow"
		)
			return this.transport.request(request);
		const response = await this.transport.request({
			...request,
			redirect: "manual",
		});
		if (response.redirects.length)
			throw new AgentBrowserError(
				"policy-denied",
				"The transport followed redirects despite route interception",
			);
		if (
			[301, 302, 303, 307, 308].includes(response.status) &&
			Object.keys(response.headers).some(
				(name) => name.toLowerCase() === "location",
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Automatic redirects with active routes are not implemented",
			);
		return response;
	}

	private tab(id: string) {
		this.ensureOpen();
		const tab = this.tabStates.get(id);
		if (!tab) throw new AgentBrowserError("not-found", "Unknown session tab");
		return tab;
	}

	private describe(tab: TabState): SessionTab {
		return Object.freeze({
			id: tab.id,
			url: tab.page?.document.url ?? null,
			selected: this.selected === tab.id,
			loading: !!tab.job,
			documentRef: tab.page?.document.reference(tab.page.document.root) ?? null,
		});
	}

	private cleanup(action: () => void) {
		try {
			action();
		} catch {
			this.cleanupErrors++;
		}
	}

	private validateNavigationOptions(options: NavigationOptions) {
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid navigation options",
			);
	}

	private assertCurrent(job: NavigationJob) {
		if (job.controller.signal.aborted) throw aborted(job.controller.signal);
		if (
			this.closed ||
			this.tabStates.get(job.tab.id) !== job.tab ||
			job.tab.job !== job
		)
			throw new AgentBrowserError("aborted", "Navigation superseded");
	}

	private async startNavigation(
		id: string,
		input: string,
		options: NavigationOptions,
		reload: boolean,
		request?: NetworkRequest,
		history?: HistoryNavigation,
		replaceDocument = false,
	): Promise<NavigationResult> {
		const tab = this.tab(id);
		this.validateNavigationOptions(options);
		const inputSignal = options.signal;
		if (inputSignal?.aborted)
			throw new AgentBrowserError("aborted", "Navigation aborted");
		if (
			typeof input !== "string" ||
			input.length > 16_384 ||
			/\p{Cc}/u.test(input)
		)
			throw new AgentBrowserError("invalid-input", "Invalid navigation URL");
		let url: URL;
		try {
			url = new URL(input, tab.page?.document.url);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid navigation URL");
		}
		url = parseNetworkUrl(url.href);
		if (
			this.navigations >= this.limits.maxNavigations ||
			this.jobs.size >= this.limits.maxPendingNavigations
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Session navigation limit exceeded",
			);
		if (!inputSignal || !this.pageTraversalSignals.has(inputSignal))
			tab.pageTraversals.cancel();
		const controller = new AbortController();
		const job = {
			controller,
			tab,
			pageTraversal:
				!!inputSignal && this.pageTraversalSignals.has(inputSignal),
		};
		const previousJob = tab.job;
		tab.job = job;
		if (tab.page) existingDocumentFiles(tab.page.document)?.invalidateTargets();
		this.jobs.add(job);
		this.navigations++;
		const stop = () => {
			clearTimeout(timer);
			inputSignal?.removeEventListener("abort", abort);
			if (tab.job === job) tab.job = undefined;
		};
		controller.signal.addEventListener("abort", stop, { once: true });
		const abort = () =>
			controller.abort(new AgentBrowserError("aborted", "Navigation aborted"));
		inputSignal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Navigation deadline exceeded"),
				),
			this.limits.navigationTimeoutMs,
		);
		const task = Promise.resolve()
			.then(() =>
				this.performNavigation(
					job,
					url,
					reload,
					request,
					history,
					replaceDocument,
				),
			)
			.finally(() => {
				clearTimeout(timer);
				inputSignal?.removeEventListener("abort", abort);
				controller.signal.removeEventListener("abort", stop);
				stop();
				this.jobs.delete(job);
			});
		previousJob?.controller.abort(
			new AgentBrowserError("aborted", "Navigation superseded"),
		);
		return withAbort(task, controller.signal);
	}

	private async performNavigation(
		job: NavigationJob,
		url: URL,
		reload: boolean,
		request?: NetworkRequest,
		history?: HistoryNavigation,
		replaceDocument = false,
	): Promise<NavigationResult> {
		this.assertCurrent(job);
		const tab = job.tab;
		const signal = job.controller.signal;
		const previous = tab.page;
		const checkHistory = () => {
			if (
				history &&
				(tab.page?.history !== history.source ||
					history.source.revision !== history.revision)
			)
				throw new AgentBrowserError(
					"aborted",
					"Document history changed during navigation",
				);
		};
		checkHistory();
		if (
			history?.target?.sameDocument &&
			previous &&
			!previous.interactions.events.metrics().closed
		) {
			await previous.history.go(history.target.delta, signal);
			this.assertCurrent(job);
			tab.history.snapshot(previous.history.capture());
			return this.result("same-document", tab);
		}
		if (
			previous &&
			!previous.interactions.events.metrics().closed &&
			!reload &&
			urlFragment(url) !== null
		) {
			const currentResource = new URL(previous.document.url);
			const nextResource = new URL(url.href);
			currentResource.hash = "";
			nextResource.hash = "";
			if (currentResource.href === nextResource.href) {
				await previous.history.navigateFragment(
					url.href,
					replaceDocument,
					signal,
				);
				this.assertCurrent(job);
				return this.result("same-document", tab);
			}
		}
		tab.journal.close();
		const journal = new NetworkJournal();
		tab.journal = journal;
		tab.networkNavigation++;
		tab.networkDocument = null;
		const response = await journal.run(
			"document",
			url.href,
			request?.method ?? "GET",
			() =>
				withAbort(
					this.fetchNetwork({
						...request,
						url: url.href,
						signal,
						cookieContext: {
							siteUrl: previous?.document.url ?? tab.openerUrl,
							credentials: "include",
							topLevelNavigation: true,
						},
					}),
					signal,
				),
		);
		this.assertCurrent(job);
		const responseUrl = parseNetworkUrl(response.url).href;
		if ([204, 205].includes(response.status))
			return this.result("no-content", tab, response);
		checkHistory();
		if (
			history &&
			new URL(history.archive.entries[history.archive.index].url).origin !==
				new URL(responseUrl).origin
		)
			throw new AgentBrowserError(
				"unsupported",
				"Cross-origin history redirect restoration is not implemented",
			);
		if (response.status === 304)
			throw new AgentBrowserError(
				"unsupported",
				"Navigation requires a cached body for HTTP 304",
			);
		if (
			response.headers["content-disposition"]?.some(
				(value) => value.split(";", 1)[0].trim().toLowerCase() === "attachment",
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Download navigation is not implemented",
			);
		let candidate: DocumentTree | undefined;
		let ownsCandidate = false;
		let committed = false;
		let resources = 0;
		let scriptResources = 0;
		let fetchResources = 0;
		const fetchLifetime = new AbortController();
		const bootstrapLifetime = new AbortController();
		const bootstrapSignal = AbortSignal.any([
			signal,
			fetchLifetime.signal,
			bootstrapLifetime.signal,
		]);
		const scriptHeaders = snapshotDocumentScriptCspHeaders(response.headers);
		if (scriptHeaders === null)
			throw new AgentBrowserError(
				"policy-denied",
				"Invalid document script policy headers",
			);
		const fetchCspBlocked = hasUnsupportedExecutionCsp(
			scriptHeaders as NetworkResponse["headers"],
			true,
		);
		const imageCspHeaders: string[] = Object.getOwnPropertyNames(scriptHeaders)
			.filter(
				(name) =>
					name.length === 23 &&
					name.toLowerCase() === "content-security-policy",
			)
			.flatMap(
				(name) => Object.getOwnPropertyDescriptor(scriptHeaders, name)?.value,
			);
		const assertScriptOwner = () => {
			this.ensureOpen();
			if (fetchLifetime.signal.aborted) throw aborted(fetchLifetime.signal);
			if (!committed) this.assertCurrent(job);
			else if (!candidate || tab.page?.document !== candidate)
				throw new AgentBrowserError(
					"closed",
					"Script document is no longer active",
				);
		};
		const scriptResourceSignal = (requestSignal?: AbortSignal) =>
			AbortSignal.any([
				fetchLifetime.signal,
				...(!committed ? [bootstrapSignal] : []),
				...(requestSignal ? [requestSignal] : []),
			]);
		const imageCsp = new ImageContentSecurityPolicy(
			responseUrl,
			imageCspHeaders,
		);
		const stylesheetCsp = new ContentSecurityPolicy(
			responseUrl,
			imageCspHeaders,
			"style",
		);
		const checkStylesheetCsp = (url: string, redirectCount: number) => {
			if (candidate)
				documentImageContentSecurityPolicy(candidate).checkStylesheet(
					url,
					redirectCount,
				);
			else if (!stylesheetCsp.allows(url, redirectCount))
				throw new AgentBrowserError(
					"policy-denied",
					"Stylesheet blocked by Content Security Policy",
				);
		};
		const checkImageCsp = (url: string, redirectCount: number) => {
			if (candidate)
				documentImageContentSecurityPolicy(candidate).check(url, redirectCount);
			else if (!imageCsp.allows(url, redirectCount))
				throw new AgentBrowserError(
					"policy-denied",
					"Image blocked by Content Security Policy",
				);
		};
		const postDocument =
			request?.method === "POST" &&
			!response.redirects.some((redirect) =>
				[301, 302, 303].includes(redirect.status),
			);
		const initializeDocument = (document: DocumentTree) => {
			if (!(document instanceof DocumentTree))
				throw new AgentBrowserError(
					"invalid-input",
					"Loader must initialize a document tree",
				);
			if (candidate === document) {
				this.assertCurrent(job);
				return;
			}
			if (ownedDocuments.has(document))
				throw new AgentBrowserError(
					"invalid-input",
					"Loader returned an already owned document",
				);
			if (candidate) {
				this.cleanup(() => document.close());
				throw new AgentBrowserError(
					"invalid-input",
					"Loader must initialize one document",
				);
			}
			candidate = document;
			ownsCandidate = true;
			ownedDocuments.add(document);
			try {
				this.assertCurrent(job);
				if (document.url !== responseUrl)
					throw new AgentBrowserError(
						"invalid-input",
						"Loaded document URL must match the final response URL",
					);
				bindDocumentIdentity(document, this.identity);
				initializeDocumentScriptCsp(document, scriptHeaders, true);
				documentImageContentSecurityPolicy(document, imageCspHeaders);
				if (this.webSocketTransport)
					bindDocumentWebSockets(document, this.webSocketTransport, {
						headerValues: imageCspHeaders,
					});
				documentStyles(document).setColorSchemePreference(
					tab.colorSchemePreference,
				);
				job.document = document;
				for (const [name, limit] of Object.entries(this.documentLimits))
					if (document.limits[name as keyof DocumentLimits] > limit)
						throw new AgentBrowserError(
							"resource-limit",
							"Loader document limits exceed session limits",
						);
				document.onClose(() => {
					tab.pageTraversals.retire(document);
					fetchLifetime.abort(
						new AgentBrowserError("closed", "Fetch document is closed"),
					);
				});
				const documentHistory = sharedDocumentHistory(
					document,
					documentInteractions(document).events,
				);
				if (history)
					documentHistory.restore({
						...history.archive,
						entries: history.archive.entries.map((entry, index) =>
							index === history.archive.index
								? { ...entry, url: responseUrl }
								: entry,
						),
					});
				const ensureOwner = () => {
					this.ensureOpen();
					document.get(document.root);
					if (committed) {
						if (tab.page?.document !== document)
							throw new AgentBrowserError(
								"closed",
								"History document is no longer active",
							);
					} else {
						this.assertCurrent(job);
						checkHistory();
					}
				};
				const length = (archive: HistoryArchive) => {
					ensureOwner();
					return tab.history.previewLength(
						committed ? undefined : previous?.history.capture(),
						archive,
						{
							post: !!postDocument,
							replace: history?.kind === "reload",
							replaceDocument,
							target: committed ? undefined : history?.target,
							committed,
						},
					);
				};
				const storageOrigin = new URL(responseUrl).origin;
				const ensureStorageOwner = () => {
					ensureOwner();
					if (new URL(document.url).origin !== storageOrigin)
						throw new AgentBrowserError(
							"policy-denied",
							"Document storage origin changed",
						);
				};
				const storagePort = Object.freeze<PageStoragePort>({
					area: (kind) => {
						ensureStorageOwner();
						return kind === "local"
							? this.storage.localStorage(tab.id, document.url, document)
							: this.storage.sessionStorage(tab.id, document.url, document);
					},
					readCookie: () => {
						ensureStorageOwner();
						return this.cookies.documentCookie(document.url, document.url);
					},
					writeCookie: (value) => {
						ensureStorageOwner();
						this.cookies.setDocumentCookie(document.url, value, document.url);
					},
				});
				bindPageStorage(document, storagePort);
				this.storageEvents.register(
					document,
					tab.id,
					documentInteractions(document).events,
					(kind) => storagePort.area(kind),
				);
				bindPageHistory(
					document,
					Object.freeze<PageHistoryPort>({
						snapshot: () => {
							ensureOwner();
							return {
								state: documentHistory.snapshot().state,
								length: length(documentHistory.capture()),
							};
						},
						pushState: (state, url) => {
							ensureOwner();
							documentHistory.pushState(state, url, length);
						},
						replaceState: (state, url) => {
							ensureOwner();
							documentHistory.replaceState(state, url, length);
						},
						traverse: (delta) => {
							ensureOwner();
							if (committed && tab.job && !tab.job.pageTraversal)
								throw new AgentBrowserError(
									"aborted",
									"An explicit navigation is already in progress",
								);
							tab.pageTraversals.enqueue(document, delta);
						},
						navigate: (input, replace) => {
							ensureOwner();
							if (committed && tab.job && !tab.job.pageTraversal)
								throw new AgentBrowserError(
									"aborted",
									"An explicit navigation is already in progress",
								);
							const target = parseNetworkUrl(input);
							const currentResource = new URL(document.url);
							const nextResource = new URL(target.href);
							currentResource.hash = "";
							nextResource.hash = "";
							const replaceEntry =
								replace || !committed || target.href === document.url;
							if (
								currentResource.href === nextResource.href &&
								urlFragment(target) !== null
							)
								tab.pageTraversals.enqueueFragment(document, () =>
									documentHistory.prepareFragment(
										target.href,
										replaceEntry,
										length,
									),
								);
							else
								tab.pageTraversals.enqueueNavigation(
									document,
									target.href,
									replaceEntry,
								);
						},
					}),
				);
			} catch (error) {
				this.cleanup(() => document.close());
				throw error;
			}
		};
		const fetch: PageFetchTransport = (input, context) =>
			journal.run(
				context?.preflight ? "preflight" : "fetch",
				input.url,
				input.method ?? "GET",
				async () => {
					const assertOwner = () => {
						if (fetchLifetime.signal.aborted)
							throw aborted(fetchLifetime.signal);
						if (!committed) this.assertCurrent(job);
						else if (
							this.closed ||
							!candidate ||
							tab.page?.document !== candidate
						)
							throw new AgentBrowserError(
								"closed",
								"Fetch document is no longer active",
							);
					};
					assertOwner();
					if (++fetchResources > 64 * 21)
						throw new AgentBrowserError(
							"resource-limit",
							"Document fetch request limit exceeded",
						);
					const target = parseNetworkUrl(input.url);
					if (
						target.origin !== new URL(responseUrl).origin &&
						context?.cors !== true
					)
						throw new AgentBrowserError(
							"policy-denied",
							"Cross-origin document fetch is not enabled",
						);
					if (
						new URL(responseUrl).protocol === "https:" &&
						target.protocol !== "https:"
					)
						throw new AgentBrowserError(
							"policy-denied",
							"Mixed-content document fetch is not allowed",
						);
					if (
						fetchCspBlocked ||
						(candidate && documentScriptCsp(candidate)?.unsupported)
					)
						throw new AgentBrowserError(
							"policy-denied",
							"Fetch CSP enforcement is not implemented",
						);
					const controller = new AbortController();
					const abortInput = () =>
						controller.abort(
							input.signal?.reason ??
								new AgentBrowserError("aborted", "Document fetch aborted"),
						);
					const abortNavigation = () => {
						if (!committed) controller.abort(signal.reason);
					};
					const abortLifetime = () =>
						controller.abort(fetchLifetime.signal.reason);
					input.signal?.addEventListener("abort", abortInput, { once: true });
					fetchLifetime.signal.addEventListener("abort", abortLifetime, {
						once: true,
					});
					signal.addEventListener("abort", abortNavigation, { once: true });
					if (input.signal?.aborted) abortInput();
					if (signal.aborted) abortNavigation();
					try {
						if (controller.signal.aborted) throw aborted(controller.signal);
						const result = await withAbort(
							this.fetchNetwork({
								...input,
								url: target.href,
								redirect: "manual",
								signal: controller.signal,
								cookieContext: {
									siteUrl: responseUrl,
									credentials:
										input.cookieContext?.credentials ?? "same-origin",
									crossSiteRedirect:
										input.cookieContext?.crossSiteRedirect ?? false,
									topLevelNavigation: false,
								},
							}),
							controller.signal,
						);
						assertOwner();
						return result;
					} finally {
						input.signal?.removeEventListener("abort", abortInput);
						fetchLifetime.signal.removeEventListener("abort", abortLifetime);
						signal.removeEventListener("abort", abortNavigation);
					}
				},
				context?.cors ? context.observeCorsResult : undefined,
			);
		const fetchImage: ImageFetch = (resourceUrl, imageSignal) =>
			journal.run("image", resourceUrl, "GET", async () => {
				const assertOwner = () => {
					if (fetchLifetime.signal.aborted) throw aborted(fetchLifetime.signal);
					if (!committed) this.assertCurrent(job);
					else if (
						this.closed ||
						!candidate ||
						tab.page?.document !== candidate
					)
						throw new AgentBrowserError(
							"closed",
							"Image document is no longer active",
						);
				};
				assertOwner();
				const controller = new AbortController();
				const abortImage = () => controller.abort(imageSignal.reason);
				const abortLifetime = () =>
					controller.abort(fetchLifetime.signal.reason);
				const abortNavigation = () => {
					if (!committed) controller.abort(signal.reason);
				};
				imageSignal.addEventListener("abort", abortImage, { once: true });
				fetchLifetime.signal.addEventListener("abort", abortLifetime, {
					once: true,
				});
				signal.addEventListener("abort", abortNavigation, { once: true });
				if (imageSignal.aborted) abortImage();
				if (signal.aborted) abortNavigation();
				let target = parseNetworkUrl(resourceUrl);
				const redirects: { url: string; status: number; location: string }[] =
					[];
				let encodedBytes = 0;
				let crossSiteRedirect = false;
				try {
					for (;;) {
						assertOwner();
						if (controller.signal.aborted) throw aborted(controller.signal);
						checkImageCsp(target.href, redirects.length);
						if (
							new URL(responseUrl).protocol === "https:" &&
							target.protocol !== "https:"
						)
							throw new AgentBrowserError(
								"policy-denied",
								"Mixed-content image blocked",
							);
						const image = await withAbort(
							this.fetchNetwork({
								url: target.href,
								method: "GET",
								headers: { accept: imageMediaTypes.join(", ") },
								...(this.transport.resourceReuse
									? { resourceReuse: "image" as const }
									: {}),
								redirect: "manual",
								signal: controller.signal,
								cookieContext: {
									siteUrl: responseUrl,
									credentials:
										this.resourceCredentials === "omit" ? "omit" : "include",
									topLevelNavigation: false,
									crossSiteRedirect,
								},
							}),
							controller.signal,
						);
						assertOwner();
						checkImageCsp(image.url, redirects.length);
						encodedBytes += image.encodedBytes;
						if (![301, 302, 303, 307, 308].includes(image.status))
							return { ...image, encodedBytes, redirects };
						const locations = image.headers.location;
						if (locations?.length !== 1)
							throw new AgentBrowserError(
								"network-error",
								"Image redirect requires one Location",
							);
						if (redirects.length >= 20)
							throw new AgentBrowserError(
								"resource-limit",
								"Image redirect limit exceeded",
							);
						const next = parseNetworkUrl(
							new URL(locations[0], target.href).href,
						);
						redirects.push({
							url: target.href,
							status: image.status,
							location: next.href,
						});
						crossSiteRedirect ||= next.origin !== target.origin;
						target = next;
					}
				} finally {
					imageSignal.removeEventListener("abort", abortImage);
					fetchLifetime.signal.removeEventListener("abort", abortLifetime);
					signal.removeEventListener("abort", abortNavigation);
				}
			});
		try {
			const loaded = await this.loadDocument(
				response,
				Object.freeze({
					initializeDocument,
					topLevelDocument: true,
					signal,
					tabId: tab.id,
					limits: this.documentLimits,
					fetch,
					fetchImage,
					fetchStylesheetWithPolicy: async (
						resourceUrl: string,
						policy: StylesheetFetchPolicy,
					) => {
						let type: StylesheetFetchResult["type"] = "opaque";
						const response = await journal.run(
							"stylesheet",
							resourceUrl,
							"GET",
							async () => {
								this.assertCurrent(job);
								if (++resources > this.limits.maxStylesheetRequests)
									throw new AgentBrowserError(
										"resource-limit",
										"Stylesheet request limit exceeded",
									);
								const result = await fetchStylesheetResource(
									resourceUrl,
									this.resourceCredentials === "omit"
										? { ...policy, credentials: "omit" }
										: policy,
									{
										documentUrl: responseUrl,
										signal: bootstrapSignal,
										maxRedirects: this.transport.limits?.maxRedirects ?? 10,
										checkContentSecurityPolicy: checkStylesheetCsp,
										request: async (input) => {
											this.assertCurrent(job);
											const sheet = await withAbort(
												this.fetchNetwork({
													...input,
													...(this.transport.resourceReuse
														? { resourceReuse: "stylesheet" as const }
														: {}),
													signal: bootstrapSignal,
												}),
												bootstrapSignal,
											);
											this.assertCurrent(job);
											return sheet;
										},
									},
								);
								type = result.type;
								return result.response;
							},
						);
						return Object.freeze({ response, type });
					},
					fetchScriptWithPolicy: async (
						resourceUrl: string,
						policy: ScriptFetchPolicy,
						scriptSignal: AbortSignal,
						admission?: DocumentScriptAdmission,
					) => {
						const policySignal = scriptResourceSignal(scriptSignal);
						let type: ScriptFetchResult["type"] = "opaque";
						const response = await journal.run(
							"script",
							resourceUrl,
							"GET",
							async () => {
								assertScriptOwner();
								policySignal.throwIfAborted();
								if (++scriptResources > this.limits.maxScriptRequests)
									throw new AgentBrowserError(
										"resource-limit",
										"Script request limit exceeded",
									);
								const result = await fetchScriptResource(
									resourceUrl,
									this.resourceCredentials === "omit"
										? { ...policy, credentials: "omit" }
										: policy,
									{
										documentUrl: responseUrl,
										signal: policySignal,
										maxRedirects: this.transport.limits?.maxRedirects ?? 10,
										checkContentSecurityPolicy: (url, redirectCount) => {
											const owner = candidate
												? documentScriptCsp(candidate)
												: undefined;
											if (
												owner?.unsupported ||
												((fetchCspBlocked || owner?.enforced) &&
													(!owner ||
														!admission ||
														!owner.allowsRequest(
															admission,
															url,
															redirectCount,
														)))
											)
												throw new AgentBrowserError(
													"policy-denied",
													"Script Content Security Policy is not supported",
												);
										},
										request: async (input) => {
											assertScriptOwner();
											const script = await withAbort(
												this.fetchNetwork({ ...input, signal: policySignal }),
												policySignal,
											);
											assertScriptOwner();
											return script;
										},
									},
								);
								type = result.type;
								return result.response;
							},
						);
						return Object.freeze({ response, type });
					},
					fetchScript: (resourceUrl: string) =>
						journal.run("script", resourceUrl, "GET", async () => {
							assertScriptOwner();
							const scriptSignal = scriptResourceSignal();
							const owner = candidate
								? documentScriptCsp(candidate)
								: undefined;
							if (fetchCspBlocked || owner?.enforced || owner?.unsupported)
								throw new AgentBrowserError(
									"policy-denied",
									"Script CSP enforcement is not implemented",
								);
							if (++scriptResources > this.limits.maxScriptRequests)
								throw new AgentBrowserError(
									"resource-limit",
									"Script request limit exceeded",
								);
							const target = parseNetworkUrl(resourceUrl);
							if (
								new URL(responseUrl).protocol === "https:" &&
								target.protocol !== "https:"
							)
								throw new AgentBrowserError(
									"policy-denied",
									"Mixed-content script is not allowed",
								);
							const script = await withAbort(
								this.fetchNetwork({
									url: target.href,
									method: "GET",
									headers: {
										accept: "text/javascript, application/javascript",
									},
									signal: scriptSignal,
									cookieContext: {
										siteUrl: responseUrl,
										credentials: "include",
										topLevelNavigation: false,
									},
								}),
								scriptSignal,
							);
							assertScriptOwner();
							return script;
						}),
					fetchStylesheet: (resourceUrl: string) =>
						journal.run("stylesheet", resourceUrl, "GET", async () => {
							this.assertCurrent(job);
							if (++resources > this.limits.maxStylesheetRequests)
								throw new AgentBrowserError(
									"resource-limit",
									"Stylesheet request limit exceeded",
								);
							const result = await fetchStylesheetResource(
								parseNetworkUrl(resourceUrl).href,
								{
									mode: "no-cors",
									credentials:
										this.resourceCredentials === "omit" ? "omit" : "include",
								},
								{
									documentUrl: responseUrl,
									signal: bootstrapSignal,
									maxRedirects: this.transport.limits?.maxRedirects ?? 10,
									checkContentSecurityPolicy: checkStylesheetCsp,
									request: async (input) => {
										this.assertCurrent(job);
										const sheet = await withAbort(
											this.fetchNetwork({
												...input,
												...(this.transport.resourceReuse
													? { resourceReuse: "stylesheet" as const }
													: {}),
												signal: bootstrapSignal,
											}),
											bootstrapSignal,
										);
										this.assertCurrent(job);
										return sheet;
									},
								},
							);
							this.assertCurrent(job);
							return result.response;
						}),
				}),
			);
			if (!(loaded instanceof DocumentTree))
				throw new AgentBrowserError(
					"invalid-input",
					"Loader must return a document tree",
				);
			initializeDocument(loaded);
			candidate = loaded;
			this.assertCurrent(job);
			candidate.reference(candidate.root);
			const styles = documentStyles(candidate);
			styles.setViewport(tab.viewport.width, tab.viewport.height);
			styles.setColorSchemePreference(tab.colorSchemePreference);
			const interactions = documentInteractions(candidate);
			const documentHistory = sharedDocumentHistory(
				candidate,
				interactions.events,
			);
			const page = Object.freeze({
				fetch,
				...(this.webSocketTransport
					? {
							webSockets: existingDocumentWebSockets(candidate),
						}
					: {}),
				document: candidate,
				styles,
				interactions,
				queries: new DocumentQueries(candidate),
				history: documentHistory,
			});
			candidate.setTargetElement(
				selectDocumentFragmentTarget(candidate, new URL(responseUrl)),
			);
			styles.metrics();
			this.assertCurrent(job);
			checkHistory();
			if (history?.target)
				tab.history.commitTraversal(history.target, documentHistory.capture());
			else if (replaceDocument)
				tab.history.replaceDocument(
					previous?.history.capture(),
					documentHistory.capture(),
					postDocument,
				);
			else
				tab.history.record(
					previous?.history.capture(),
					documentHistory.capture(),
					postDocument,
					history?.kind === "reload",
				);
			tab.page = page;
			tab.networkDocument = candidate.reference(candidate.root);
			tab.postDocument = postDocument;
			committed = true;
			this.storageEvents.activate(candidate);
			tab.pageTraversals.activate(candidate);
			this.commits++;
			if (previous) this.cleanup(() => previous.document.close());
			this.assertCurrent(job);
			return this.result("document", tab, response);
		} catch (error) {
			if (signal.aborted) throw aborted(signal);
			if (error instanceof AgentBrowserError) throw error;
			throw new AgentBrowserError("unsupported", "Document loader failed");
		} finally {
			bootstrapLifetime.abort(
				new AgentBrowserError("closed", "Document bootstrap finished"),
			);
			if (!committed)
				fetchLifetime.abort(
					new AgentBrowserError("closed", "Fetch document did not commit"),
				);
			if (candidate && ownsCandidate && !committed)
				this.cleanup(() => candidate?.close());
		}
	}

	private result(
		kind: NavigationResult["kind"],
		tab: TabState,
		response?: NetworkResponse,
	): NavigationResult {
		return {
			kind,
			tabId: tab.id,
			url: tab.page?.document.url ?? null,
			documentRef: tab.page?.document.reference(tab.page.document.root) ?? null,
			...(tab.page ? { styles: tab.page.styles.metrics() } : {}),
			...(tab.page && documentScriptState(tab.page.document)?.report
				? { scripts: documentScriptState(tab.page.document)?.report }
				: {}),
			...(tab.page && htmlParseInfo(tab.page.document)
				? { html: htmlParseInfo(tab.page.document) }
				: {}),
			...(response
				? {
						response: {
							url: response.url,
							status: response.status,
							bytes: response.body.byteLength,
							redirects: response.redirects.length,
						},
					}
				: {}),
		};
	}
}
