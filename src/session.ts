import { CookieJar, type CookieLimits } from "./cookies.js";
import { imageMediaTypes } from "./image-decoder.js";
import {
	type ScriptLoadReport,
	documentScriptState,
} from "./document-script-state.js";
import { selectDocumentFragmentTarget, urlFragment } from "./document-url.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { FormRequestResult } from "./form-actions.js";
import type { FormSubmissionOptions } from "./forms.js";
import {
	type DocumentHistory,
	type HistoryArchive,
	documentHistory as sharedDocumentHistory,
} from "./history.js";
import { type HtmlParseInfo, htmlParseInfo } from "./html-info.js";
import type { HtmlScriptHooks } from "./html-parser.js";
import {
	type DocumentInteractions,
	type InteractionResult,
	documentInteractions,
} from "./interactions.js";
import type { KeyboardResult } from "./keyboard.js";
import {
	NavigationHistory,
	type TraversalTarget,
} from "./navigation-history.js";
import {
	NetworkJournal,
	type NetworkJournalSnapshot,
} from "./network-journal.js";
import { NetworkRoutes } from "./network-routes.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	type NetworkTransport,
	parseNetworkUrl,
} from "./network.js";
import { recordPageTraversalError } from "./page-console.js";
import type { PageFetchTransport } from "./page-fetch.js";
import type { ImageFetch } from "./document-images.js";
import { type PageHistoryPort, bindPageHistory } from "./page-history.js";
import { type PageStoragePort, bindPageStorage } from "./page-storage.js";
import { PageTraversals } from "./page-traversals.js";
import { DocumentQueries } from "./selectors.js";
import { type SnapshotOptions, snapshotDocument } from "./snapshot.js";
import { PageStorageEvents } from "./storage-events.js";
import { BrowserStorage, type StorageLimits } from "./storage.js";
import { type DocumentStyles, documentStyles } from "./styles.js";

export interface DocumentLoaderContext {
	readonly initializeDocument?: (tree: DocumentTree) => void;
	readonly fetch?: PageFetchTransport;
	readonly signal: AbortSignal;
	readonly tabId: string;
	readonly limits: Readonly<DocumentLimits>;
	readonly fetchStylesheet?: (url: string) => Promise<NetworkResponse>;
	readonly fetchScript?: (url: string) => Promise<NetworkResponse>;
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
	navigationTimeoutMs: number;
}

export interface BrowserSessionOptions {
	createTransport: (cookies: CookieJar) => NetworkTransport;
	loadDocument: DocumentLoader;
	limits?: Partial<SessionLimits>;
	documentLimits?: Partial<DocumentLimits>;
	storageLimits?: Partial<StorageLimits>;
	cookieLimits?: Partial<CookieLimits>;
}

export interface SessionPage {
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
	navigation?: NavigationResult;
	form?: Omit<FormRequestResult, "submission">;
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

interface TabState {
	pageTraversals: PageTraversals;
	journal: NetworkJournal;
	networkNavigation: number;
	networkDocument: string | null;
	history: NavigationHistory;
	id: string;
	openerUrl: string | null;
	viewport: { width: number; height: number };
	page?: Readonly<SessionPage>;
	job?: NavigationJob;
	postDocument?: boolean;
}

interface NavigationJob {
	controller: AbortController;
	tab: TabState;
	pageTraversal: boolean;
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
	readonly limits: Readonly<SessionLimits>;
	readonly documentLimits: Readonly<DocumentLimits>;
	readonly cookies: CookieJar;
	readonly storage: BrowserStorage;
	readonly routes = new NetworkRoutes();
	private readonly storageEvents = new PageStorageEvents();
	private readonly transport: NetworkTransport;
	private readonly loadDocument: DocumentLoader;
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
		this.limits = Object.freeze({
			maxHistoryDocuments: 32,
			maxHistoryBytes: 8_388_608,
			maxTabs: 32,
			maxNavigations: 500,
			maxPendingNavigations: 8,
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
		this.cookies = new CookieJar(options.cookieLimits);
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
		if (options.select !== false || this.selected === null) this.selected = id;
		return this.describe(tab);
	}

	viewport(id: string) {
		const tab = this.tab(id);
		return Object.freeze({
			tabId: id,
			key: `${this.viewportIdentity}:${id}`,
			document: tab.page?.document.reference(tab.page.document.root) ?? null,
			...(tab.page?.styles.viewport ?? tab.viewport),
			deviceScaleFactor: 1,
			partial: true,
			profile: "logical-css-viewport",
		});
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
		this.selected = id;
		return this.describe(tab);
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
		options: NavigationOptions = {},
	): Promise<SessionKeyResult> {
		this.validateNavigationOptions(options);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Keyboard action aborted");
		const tab = this.tab(id);
		const previousJob = tab.job;
		const page = this.page(id);
		const keyboard = await page.interactions.keyboard.pressAsync(key);
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
		const interaction = await page.interactions.clickAsync(reference);
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
		const action = interaction.defaultAction;
		if (action?.kind === "submit")
			return {
				interaction,
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
				navigation: await this.navigate(id, action.url, options),
			};
		return { interaction };
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
		if (typeof this.transport.requestWithRoutes === "function")
			return this.transport.requestWithRoutes(input, (request) =>
				this.routes.fulfill(request),
			);
		const mocked = this.routes.fulfill(input);
		if (mocked) {
			if ([301, 302, 303, 307, 308].includes(mocked.status)) {
				if (input.redirect === "error")
					throw new AgentBrowserError(
						"policy-denied",
						"Redirects are disabled",
					);
				if (
					(input.redirect ?? "follow") === "follow" &&
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
			(input.redirect ?? "follow") !== "follow"
		)
			return this.transport.request(input);
		const response = await this.transport.request({
			...input,
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
		const fetchCspBlocked = Object.keys(response.headers).some(
			(name) => name.toLowerCase() === "content-security-policy",
		);
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
					if (fetchCspBlocked)
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
				if (fetchCspBlocked)
					throw new AgentBrowserError(
						"policy-denied",
						"Image CSP enforcement is not implemented",
					);
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
								redirect: "manual",
								signal: controller.signal,
								cookieContext: {
									siteUrl: responseUrl,
									credentials: "include",
									topLevelNavigation: false,
									crossSiteRedirect,
								},
							}),
							controller.signal,
						);
						assertOwner();
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
					signal,
					tabId: tab.id,
					limits: this.documentLimits,
					fetch,
					fetchImage,
					fetchScript: (resourceUrl: string) =>
						journal.run("script", resourceUrl, "GET", async () => {
							this.assertCurrent(job);
							if (++scriptResources > 16)
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
									signal,
									cookieContext: {
										siteUrl: responseUrl,
										credentials: "include",
										topLevelNavigation: false,
									},
								}),
								signal,
							);
							this.assertCurrent(job);
							return script;
						}),
					fetchStylesheet: (resourceUrl: string) =>
						journal.run("stylesheet", resourceUrl, "GET", async () => {
							this.assertCurrent(job);
							if (++resources > 8)
								throw new AgentBrowserError(
									"resource-limit",
									"Stylesheet request limit exceeded",
								);
							const target = parseNetworkUrl(resourceUrl);
							if (
								new URL(responseUrl).protocol === "https:" &&
								target.protocol !== "https:"
							)
								throw new AgentBrowserError(
									"policy-denied",
									"Mixed-content stylesheet is not allowed",
								);
							const sheet = await withAbort(
								this.fetchNetwork({
									url: target.href,
									method: "GET",
									headers: { accept: "text/css" },
									signal,
									cookieContext: {
										siteUrl: responseUrl,
										credentials: "include",
										topLevelNavigation: false,
									},
								}),
								signal,
							);
							this.assertCurrent(job);
							return sheet;
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
			const interactions = documentInteractions(candidate);
			const documentHistory = sharedDocumentHistory(
				candidate,
				interactions.events,
			);
			const page = Object.freeze({
				fetch,
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
