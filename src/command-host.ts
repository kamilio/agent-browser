import { type WaitingAction, runWhenActionable } from "./action-wait.js";
import { type Invocation, parseInvocation } from "./cli-parser.js";
import { commands } from "./commands.js";
import { inspectDom } from "./dom-inspection.js";
import { AgentBrowserError } from "./errors.js";
import { type ExtractionOptions, extractDocument } from "./extraction.js";
import { serializeHtml } from "./html-serialization.js";
import { readPageConsole } from "./page-console.js";
import type { ScriptEvaluation } from "./safejs.js";
import { scriptMutationLimits } from "./script-mutations.js";
import { BrowserSession, type SessionPage } from "./session.js";
import { findInDocument } from "./snapshot-search.js";
import {
	type SemanticSnapshot,
	diffSnapshots,
	renderSnapshot,
} from "./snapshot.js";
import { resolveBrowserTarget } from "./target-locator.js";
import { textLocatorLimits } from "./text-locator.js";

export interface CommandHostOptions {
	websiteScripts?: boolean;
	pageFetch?: boolean;
	createSession: (name: string) => BrowserSession;
	evaluatePage?: (
		page: SessionPage,
		source: string,
		signal: AbortSignal,
	) => Promise<ScriptEvaluation>;
	maxSessions?: number;
	maxPendingCommands?: number;
	maxCommands?: number;
	timeoutMs?: number;
	maxSnapshotCacheBytes?: number;
	documentFormats?: readonly string[];
}

export interface CommandRequestOptions {
	session?: string;
	signal?: AbortSignal;
}

export interface CommandResult {
	schemaVersion: 1;
	command: string;
	session: string;
	data: unknown;
}

export interface CommandExecutor {
	execute(
		argv: readonly string[],
		options?: CommandRequestOptions,
	): Promise<CommandResult>;
	close(): void | Promise<void>;
}

interface SessionEntry {
	name: string;
	browser: BrowserSession;
	tail: Promise<void>;
	controllers: Set<AbortController>;
}

const ownedSessions = new WeakSet<BrowserSession>();
const frontendCommands = new Set([
	"serve",
	"stop-server",
	"playground",
	"terminal",
]);

const supportedOptions: Readonly<Record<string, readonly string[]>> = {
	open: [],
	goto: [],
	close: [],
	reload: [],
	"go-back": [],
	"go-forward": [],
	"tab-new": [],
	"tab-close": [],
	"tab-select": [],
	"tab-list": [],
	click: [],
	fill: ["submit"],
	type: [],
	press: [],
	resize: [],
	styles: [],
	select: [],
	check: [],
	uncheck: [],
	snapshot: ["depth", "diff", "max-bytes", "observe"],
	find: ["regex", "max-results", "context", "max-bytes"],
	text: [],
	html: ["max-code-units"],
	dom: ["depth", "max-nodes", "max-code-units"],
	extract: ["format", "max-bytes", "max-nodes", "depth"],
	requests: [],
	request: [],
	route: ["status", "body", "content-type", "header", "headers"],
	"route-list": [],
	unroute: [],
	"localstorage-list": [],
	"localstorage-get": [],
	"localstorage-set": [],
	"localstorage-delete": [],
	"localstorage-clear": [],
	"sessionstorage-list": [],
	"sessionstorage-get": [],
	"sessionstorage-set": [],
	"sessionstorage-delete": [],
	"sessionstorage-clear": [],
	"cookie-clear": [],
	list: [],
	"close-all": [],
	metrics: [],
	capabilities: [],
	help: [],
};

function cancellation(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Command aborted");
}

function abortable<Result>(
	work: Promise<Result>,
	signal: AbortSignal,
): Promise<Result> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(cancellation(signal));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

export class BrowserCommandHost {
	private sessions = new Map<string, SessionEntry>();
	private snapshots = new Map<
		string,
		{ snapshot: SemanticSnapshot; bytes: number }
	>();
	private cachedBytes = 0;
	private pending = 0;
	private executed = 0;
	private closed = false;
	private readonly limits;
	private readonly formats: readonly string[];
	private readonly createSession: CommandHostOptions["createSession"];
	private readonly evaluatePage: CommandHostOptions["evaluatePage"];
	private readonly websiteScripts: boolean;
	private readonly pageFetch: boolean;

	constructor(options: CommandHostOptions) {
		if (!options || typeof options.createSession !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"A command host requires a session factory",
			);
		this.limits = Object.freeze({
			maxSessions: options.maxSessions ?? 8,
			maxPendingCommands: options.maxPendingCommands ?? 64,
			maxCommands: options.maxCommands ?? 10_000,
			timeoutMs: options.timeoutMs ?? 30_000,
			maxSnapshotCacheBytes: options.maxSnapshotCacheBytes ?? 1_048_576,
		});
		for (const [name, value] of Object.entries(this.limits))
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value >
					(name === "maxSnapshotCacheBytes"
						? 16_777_216
						: name === "timeoutMs"
							? 300_000
							: name === "maxCommands"
								? 1_000_000
								: 256)
			)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid command host limit: ${name}`,
				);
		const formats = options.documentFormats ?? [];
		if (
			!Array.isArray(formats) ||
			formats.length > 32 ||
			formats.some((value) => typeof value !== "string" || value.length > 128)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document format capabilities",
			);
		this.formats = Object.freeze([...formats]);
		this.createSession = options.createSession;
		if (
			options.evaluatePage !== undefined &&
			typeof options.evaluatePage !== "function"
		)
			throw new AgentBrowserError("invalid-input", "Invalid page evaluator");
		this.evaluatePage = options.evaluatePage;
		if (
			(options.websiteScripts !== undefined &&
				typeof options.websiteScripts !== "boolean") ||
			(options.websiteScripts && !options.evaluatePage)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Website scripts require an explicit page evaluator",
			);
		this.websiteScripts = options.websiteScripts ?? false;
		if (
			(options.pageFetch !== undefined &&
				typeof options.pageFetch !== "boolean") ||
			(options.pageFetch && !options.evaluatePage)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page fetch requires an explicit page evaluator",
			);
		this.pageFetch = options.pageFetch ?? false;
	}

	capabilities() {
		return {
			apiVersion: 1,
			engine: "independent-typescript",
			documentFormats: this.formats,
			websiteJavaScript: this.websiteScripts,
			domMutations: {
				partial: true,
				parentNode: ["append", "prepend", "replaceChildren"],
				childNode: ["before", "after", "replaceWith", "remove"],
				replaceChild: true,
				maxArguments: scriptMutationLimits.maxArguments,
				objectStringCoercion: false,
				crossDocumentAdoption: false,
				mutationObservers: false,
			},
			htmlInsertion: {
				partial: true,
				innerHTML: true,
				outerHTML: true,
				insertAdjacentHTML: [
					"beforebegin",
					"afterbegin",
					"beforeend",
					"afterend",
				],
				insertedScripts: "inert",
				trustedTypes: false,
				sanitization: false,
			},
			domTokens: {
				partial: true,
				classList: true,
				indexed: true,
				iteration: true,
				valueAssignment: true,
				forEach: false,
				iteratorMethods: false,
			},
			pageUrls: {
				location: "session-owned",
				baseURI: true,
				hyperlinkComponents: true,
				resourceAttributes: true,
				locationNavigation: true,
				globalLocationAssignment: false,
				fragmentWrites: "synchronous-url-deferred-events",
				historyBindings: true,
			},
			pageStorage: {
				partial: true,
				localStorage: true,
				sessionStorage: true,
				documentCookie: true,
				namedProperties: false,
				storageEvents: true,
				eventScheduling: "bounded-session-task-queue",
				persistence: "in-memory-session-lifetime",
			},
			pageHistory: {
				partial: true,
				state: "finite-json",
				pushState: true,
				replaceState: true,
				length: "session-wide",
				guestTraversal: true,
				traversalScheduling: "bounded-session-task-queue",
				stateIdentity: false,
			},
			routing: {
				enabled: true,
				partial: true,
				scope: "session",
				fulfillment: true,
				redirectFulfillment: true,
				requestRewriting: false,
				transportRedirectHops: "adapter-dependent",
			},
			scriptLoading: {
				mode: this.websiteScripts ? "classic" : "disabled",
				partial: true,
				modules: false,
				dynamicInsertion: false,
				documentWrite: {
					mode: this.websiteScripts ? "parser-blocking-subset" : "disabled",
					nestedInline: false,
					documentReplacement: false,
				},
			},
			domInspection: {
				partial: true,
				scoped: true,
				hiddenNodes: true,
				passwordFileValuesRedacted: true,
				layout: false,
			},
			locators: {
				partial: true,
				methods: [
					"getByRole",
					"getByTestId",
					"getByText",
					"getByLabel",
					"getByPlaceholder",
					"getByAltText",
					"getByTitle",
				],
				roleOptions: ["name", "exact"],
				textOptions: ["exact"],
				textLimits: textLocatorLimits,
				textAndLabelIncludeHidden: true,
				regularExpressions: false,
				chaining: false,
				autoWait: true,
			},
			actionWaiting: {
				partial: true,
				commands: ["click", "fill", "select", "check", "uncheck"],
				intervalMs: 25,
				maxPolls: 2048,
				stableLayout: false,
				hitTesting: false,
				replayActions: false,
			},
			snapshotSearch: {
				partial: true,
				streaming: true,
				maxDocumentNodes: 50_000,
				maxStringLength: 4096,
				literalCaseSensitive: true,
				context: 3,
				maxPatternCodeUnits: 1024,
				maxStates: 2048,
				maxWork: 4_000_000,
				regex: {
					engine: "bounded-nfa",
					flags: ["i", "m", "s"],
					ignoreCase: "ascii",
					backreferences: false,
					lookarounds: false,
				},
			},
			pageEvaluation: !!this.evaluatePage,
			pageFetch: {
				enabled: this.pageFetch,
				partial: true,
				sameOrigin: true,
				cors: true,
				preflightCache: false,
				requestBodies: ["string"],
				responseBodies: ["text", "json"],
				streaming: false,
				abortSignal: false,
			},
			pageTimers: {
				enabled: !!this.evaluatePage,
				partial: true,
				methods: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"],
				stringHandlers: false,
			},
			pageConsole: {
				enabled: !!this.evaluatePage,
				partial: true,
				methods: [
					"log",
					"info",
					"debug",
					"warn",
					"error",
					"dir",
					"assert",
					"clear",
				],
			},
			cssVisibility: {
				partial: true,
				properties: ["display", "visibility"],
				layout: false,
			},
			browserEngineDependency: false,
			fullPlaywrightCliSuperset: false,
			limitations: [
				"HTML support depends on the loader; the built-in HTML parser is partial",
				this.websiteScripts
					? "Classic page scripts are partial; modules, many DOM APIs and CSS layout remain unimplemented"
					: "Automatic website JavaScript and CSS layout are disabled",
				"Cross-document back/forward, submission and non-self navigation targets are incomplete",
				"Disk profile persistence, artifact files and full locator/action semantics are incomplete",
			],
			commands: Array.from(commands.keys(), (name) => ({
				name,
				status: frontendCommands.has(name)
					? "frontend"
					: this.commandOptions(name) !== undefined
						? "partial"
						: "unsupported",
				options: this.commandOptions(name) ?? [],
			})),
			limits: this.limits,
		};
	}

	metrics() {
		return Object.freeze({
			sessions: this.sessions.size,
			pendingCommands: this.pending,
			executedCommands: this.executed,
			cachedSnapshotBytes: this.cachedBytes,
			closed: this.closed,
		});
	}

	async execute(
		argv: readonly string[],
		options: CommandRequestOptions = {},
	): Promise<CommandResult> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Command host is closed");
		if (
			!Array.isArray(argv) ||
			argv.length > 256 ||
			argv.some((argument) => typeof argument !== "string")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Command arguments must be a bounded string array",
			);
		if (
			!options ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid command request options",
			);
		const invocation = parseInvocation([...argv], {
			AGENT_BROWSER_SESSION: options.session,
		});
		const result = (data: unknown): CommandResult => ({
			schemaVersion: 1,
			command: invocation.command,
			session: invocation.session,
			data,
		});
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Command aborted");
		if (invocation.options.version)
			return result({ version: "0.1.0", engine: "independent-typescript" });
		if (invocation.command === "help" || invocation.options.help)
			return result(
				this.help(
					invocation.command === "help"
						? invocation.arguments[0]
						: invocation.command,
				),
			);
		this.validateInvocation(invocation);
		if (invocation.command === "capabilities")
			return result(this.capabilities());
		if (invocation.command === "list")
			return result(
				Array.from(this.sessions.values(), (entry) => ({
					name: entry.name,
					tabs: this.tabList(entry.browser),
					metrics: entry.browser.metrics(),
				})),
			);
		if (invocation.command === "close-all") {
			for (const entry of [...this.sessions.values()]) this.closeEntry(entry);
			return result({ closed: true });
		}
		if (invocation.command === "close") {
			const entry = this.sessions.get(invocation.session);
			if (entry) this.closeEntry(entry);
			return result({ closed: true });
		}
		if (
			this.pending >= this.limits.maxPendingCommands ||
			this.executed >= this.limits.maxCommands
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Command host limit exceeded",
			);
		let entry = this.sessions.get(invocation.session);
		if (!entry && invocation.command === "open") {
			if (this.sessions.size >= this.limits.maxSessions)
				throw new AgentBrowserError(
					"resource-limit",
					"Named session limit exceeded",
				);
			const browser = this.createSession(invocation.session);
			if (ownedSessions.has(browser))
				throw new AgentBrowserError(
					"invalid-input",
					"Session factory returned an already owned session",
				);
			if (!(browser instanceof BrowserSession) || browser.metrics().closed)
				throw new AgentBrowserError(
					"invalid-input",
					"Session factory must return a live browser session",
				);
			if (this.closed || this.sessions.size >= this.limits.maxSessions) {
				browser.close();
				throw new AgentBrowserError(
					"resource-limit",
					"Session creation is no longer allowed",
				);
			}
			ownedSessions.add(browser);
			entry = {
				name: invocation.session,
				browser,
				tail: Promise.resolve(),
				controllers: new Set(),
			};
			this.sessions.set(entry.name, entry);
		}
		if (!entry)
			throw new AgentBrowserError(
				"not-found",
				"No named session; run open first",
			);
		const activeEntry = entry;
		const controller = new AbortController();
		const signal = controller.signal;
		const inputSignal = options.signal;
		const abort = () =>
			controller.abort(new AgentBrowserError("aborted", "Command aborted"));
		const timeoutMs = Number(
			invocation.options.timeout ?? this.limits.timeoutMs,
		);
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Command deadline exceeded"),
				),
			timeoutMs,
		);
		const cleanup = () => {
			clearTimeout(timer);
			inputSignal?.removeEventListener("abort", abort);
		};
		signal.addEventListener("abort", cleanup, { once: true });
		inputSignal?.addEventListener("abort", abort, { once: true });
		activeEntry.controllers.add(controller);
		this.pending++;
		this.executed++;
		const work = activeEntry.tail
			.then(async () => {
				if (signal.aborted) throw cancellation(signal);
				if (this.closed || this.sessions.get(activeEntry.name) !== activeEntry)
					throw new AgentBrowserError("closed", "Named session is closed");
				return result(await this.run(activeEntry, invocation, signal));
			})
			.finally(() => {
				cleanup();
				signal.removeEventListener("abort", cleanup);
				activeEntry.controllers.delete(controller);
				this.pending--;
			});
		activeEntry.tail = work.then(
			() => {},
			() => {},
		);
		return abortable(work, signal);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const entry of [...this.sessions.values()]) this.closeEntry(entry);
	}

	private closeEntry(entry: SessionEntry) {
		this.sessions.delete(entry.name);
		for (const controller of entry.controllers)
			controller.abort(
				new AgentBrowserError("closed", "Named session is closed"),
			);
		entry.browser.close();
		for (const [key, cached] of this.snapshots)
			if (key.startsWith(`${entry.name}/`)) {
				this.snapshots.delete(key);
				this.cachedBytes -= cached.bytes;
			}
	}

	private help(name?: string) {
		if (name !== undefined && !commands.has(name))
			throw new AgentBrowserError("invalid-input", "Unknown help command");
		return {
			usage: "agent-browser [-s=name] <command> [arguments] [--json]",
			currentScope:
				"Independent browser core; HTML/JavaScript and full CLI parity are incomplete",
			commands: Array.from(commands.values())
				.filter((command) => !name || command.name === name)
				.map((command) => ({
					...command,
					availableOptions: this.commandOptions(command.name) ?? [],
					status: frontendCommands.has(command.name)
						? "frontend"
						: this.commandOptions(command.name) !== undefined
							? "partial"
							: "unsupported",
				})),
		};
	}

	private commandOptions(name: string) {
		return ["eval", "console"].includes(name) && this.evaluatePage
			? []
			: supportedOptions[name];
	}

	validateInvocation(invocation: Invocation) {
		if (invocation.command === "eval" && invocation.arguments[1] !== undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Element-scoped evaluation is not implemented",
			);
		if (
			invocation.command === "snapshot" &&
			invocation.options.observe &&
			invocation.options.diff
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Observer snapshots cannot consume diffs",
			);
		const supported = this.commandOptions(invocation.command);
		if (!supported)
			throw new AgentBrowserError(
				"unsupported",
				`Command is not implemented: ${invocation.command}`,
			);
		for (const key of Object.keys(invocation.options))
			if (!["json", "help", "version", "timeout", ...supported].includes(key))
				throw new AgentBrowserError(
					"unsupported",
					`Option is not implemented: --${key}`,
				);
		if (
			invocation.options.timeout !== undefined &&
			(Number(invocation.options.timeout) < 1 ||
				Number(invocation.options.timeout) > 300_000)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Command timeout must be between 1 and 300000 milliseconds",
			);
		if (
			invocation.command === "click" &&
			invocation.arguments[1] !== undefined &&
			invocation.arguments[1] !== "left"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Only left-button activation is implemented",
			);
	}

	private tabList(browser: BrowserSession) {
		return browser.tabs().map((tab, index) => ({ index, ...tab }));
	}

	private activeTab(browser: BrowserSession) {
		const tab = browser.tabs().find((candidate) => candidate.selected);
		if (!tab)
			throw new AgentBrowserError("not-found", "Session has no selected tab");
		return tab.id;
	}

	private indexedTab(browser: BrowserSession, value: string) {
		if (!/^(0|[1-9][0-9]*)$/.test(value))
			throw new AgentBrowserError(
				"invalid-input",
				"Tab must be a zero-based index",
			);
		const tab = browser.tabs()[Number(value)];
		if (!tab)
			throw new AgentBrowserError("not-found", "Tab index does not exist");
		return tab.id;
	}

	private target(browser: BrowserSession, tabId: string, value: string) {
		const page = browser.page(tabId);
		return resolveBrowserTarget(page.document, page.queries, value);
	}

	private async run(
		entry: SessionEntry,
		invocation: Invocation,
		signal: AbortSignal,
	): Promise<unknown> {
		const browser = entry.browser;
		const args = invocation.arguments;
		const options = invocation.options;
		if (invocation.command === "route-list") return browser.routes.list();
		if (invocation.command === "unroute")
			return { removed: browser.routes.remove(args[0]) };
		if (invocation.command === "route") {
			const headers: Record<string, string> = Object.create(null);
			if (options.headers !== undefined) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(options.headers as string);
				} catch {
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers must be a JSON record",
					);
				}
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers must be a JSON record",
					);
				for (const [name, value] of Object.entries(parsed)) {
					if (typeof value !== "string")
						throw new AgentBrowserError(
							"invalid-input",
							"Route header values must be strings",
						);
					const lower = name.toLowerCase();
					if (lower === "location" && Object.hasOwn(headers, lower))
						throw new AgentBrowserError(
							"invalid-input",
							"Duplicate route Location header",
						);
					headers[lower] = value;
				}
			}
			for (const header of (options.header ?? []) as string[]) {
				const colon = header.indexOf(":");
				if (colon < 1)
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers require Name: Value",
					);
				const name = header.slice(0, colon).trim().toLowerCase();
				const value = header.slice(colon + 1).trim();
				if (name === "location" && Object.hasOwn(headers, name))
					throw new AgentBrowserError(
						"invalid-input",
						"Duplicate route Location header",
					);
				headers[name] = Object.hasOwn(headers, name)
					? `${headers[name]}, ${value}`
					: value;
			}
			return browser.routes.add(args[0], {
				status: options.status as number | undefined,
				body: options.body as string | undefined,
				contentType: options["content-type"] as string | undefined,
				headers,
			});
		}
		if (
			invocation.command === "go-back" ||
			invocation.command === "go-forward"
		) {
			const tab = this.activeTab(browser);
			const navigation = await browser.go(
				tab,
				invocation.command === "go-back" ? -1 : 1,
				{ signal },
			);
			return {
				navigation,
				history: browser.history(tab),
				tabs: this.tabList(browser),
			};
		}
		if (invocation.command === "open") {
			const tab = browser.tabs().length
				? this.activeTab(browser)
				: browser.createTab().id;
			const navigation =
				args[0] === undefined
					? undefined
					: await browser.navigate(tab, args[0], { signal });
			return { navigation, tabs: this.tabList(browser) };
		}
		if (invocation.command === "metrics")
			return { host: this.metrics(), session: browser.metrics() };
		if (invocation.command === "resize")
			return browser.resize(
				this.activeTab(browser),
				Number(args[0]),
				Number(args[1]),
			);
		if (invocation.command === "styles") {
			const tab = this.activeTab(browser);
			const page = browser.page(tab);
			if (!args.length) return page.styles.metrics();
			const reference = this.target(browser, tab, args[0]);
			return {
				reference,
				...page.styles.get(page.document.resolve(reference).id),
				partial: true,
				layout: false,
			};
		}
		if (invocation.command === "tab-list") return this.tabList(browser);
		if (invocation.command === "tab-new") {
			const tab = browser.createTab();
			const navigation =
				args[0] === undefined
					? undefined
					: await browser.navigate(tab.id, args[0], { signal });
			return { navigation, tabs: this.tabList(browser) };
		}
		if (invocation.command === "tab-select") {
			browser.selectTab(this.indexedTab(browser, args[0]));
			return this.tabList(browser);
		}
		if (invocation.command === "tab-close") {
			const tab =
				args[0] === undefined
					? this.activeTab(browser)
					: this.indexedTab(browser, args[0]);
			browser.closeTab(tab);
			const key = `${entry.name}/${tab}`;
			const cached = this.snapshots.get(key);
			if (cached) {
				this.cachedBytes -= cached.bytes;
				this.snapshots.delete(key);
			}
			return this.tabList(browser);
		}
		if (invocation.command === "cookie-clear") {
			browser.cookies.clear();
			return { cleared: true };
		}
		const tabId = this.activeTab(browser);
		if (invocation.command === "requests") return browser.requests(tabId);
		if (invocation.command === "request") {
			if (!/^(0|[1-9]\d*)$/.test(args[0]))
				throw new AgentBrowserError("invalid-input", "Invalid request index");
			return browser.request(tabId, Number(args[0]));
		}
		if (invocation.command === "eval" && this.evaluatePage)
			return this.evaluatePage(browser.page(tabId), args[0], signal);
		if (invocation.command === "console")
			return readPageConsole(browser.page(tabId).document, args[0] ?? "info");
		if (invocation.command === "goto")
			return browser.navigate(tabId, args[0], { signal });
		if (invocation.command === "reload")
			return browser.reload(tabId, { signal });
		if (invocation.command === "html") {
			const tree = browser.page(tabId).document;
			const root =
				args[0] === undefined
					? tree.root
					: tree.resolve(this.target(browser, tabId, args[0])).id;
			return {
				url: tree.url,
				partial: true,
				html: serializeHtml(tree, root, {
					includeSelf: true,
					maxCodeUnits: Math.min(
						tree.limits.maxTextCodeUnits,
						Number(options["max-code-units"] ?? 1_000_000),
					),
				}),
			};
		}
		if (invocation.command === "dom") {
			return inspectDom(browser.page(tabId).document, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				maxDepth: options.depth as number | undefined,
				maxNodes: options["max-nodes"] as number | undefined,
				maxCodeUnits: options["max-code-units"] as number | undefined,
			});
		}
		if (invocation.command === "extract") {
			return extractDocument(browser.page(tabId).document, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				...(options.format === undefined
					? {}
					: { format: options.format as ExtractionOptions["format"] }),
				...(options["max-bytes"] === undefined
					? {}
					: { maxBytes: Number(options["max-bytes"]) }),
				...(options["max-nodes"] === undefined
					? {}
					: { maxNodes: Number(options["max-nodes"]) }),
				...(options.depth === undefined
					? {}
					: { maxDepth: Number(options.depth) }),
			});
		}
		if (invocation.command === "find")
			return findInDocument(browser.page(tabId).document, args[0], {
				regex: options.regex as boolean | undefined,
				maxResults: options["max-results"] as number | undefined,
				context: options.context as number | undefined,
				maxBytes: options["max-bytes"] as number | undefined,
			});
		if (invocation.command === "snapshot" || invocation.command === "text") {
			const snapshot = browser.snapshot(tabId, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				...(options.depth === undefined
					? {}
					: { maxDepth: Number(options.depth) }),
				...(options["max-bytes"] === undefined
					? {}
					: { maxBytes: Number(options["max-bytes"]) }),
			});
			if (invocation.command === "text")
				return {
					text: renderSnapshot(snapshot),
					truncated: snapshot.truncated,
				};
			if (options.observe) return snapshot;
			const key = `${entry.name}/${tabId}`;
			const previous = this.snapshots.get(key)?.snapshot;
			this.cache(key, snapshot);
			return options.diff ? diffSnapshots(previous, snapshot) : snapshot;
		}
		const storage =
			/^(localstorage|sessionstorage)-(list|get|set|delete|clear)$/.exec(
				invocation.command,
			);
		if (storage) {
			const url = browser.page(tabId).document.url;
			const area =
				storage[1] === "localstorage"
					? browser.storage.localStorage(tabId, url)
					: browser.storage.sessionStorage(tabId, url);
			if (storage[2] === "list") return area.entries();
			if (storage[2] === "get") return { value: area.getItem(args[0]) };
			if (storage[2] === "set") area.setItem(args[0], args[1]);
			if (storage[2] === "delete") area.removeItem(args[0]);
			if (storage[2] === "clear") area.clear();
			return { changed: true };
		}
		const actions = browser.page(tabId).interactions;
		if (invocation.command === "type")
			return actions.keyboard.typeAsync(args[0]);
		if (invocation.command === "press") {
			const result = await browser.press(tabId, args[0], { signal });
			if (result.keyboard.defaultAction && !result.navigation && !result.form)
				throw new AgentBrowserError(
					"unsupported",
					"Keyboard default action is not implemented",
				);
			return result;
		}
		const waitingAction: WaitingAction =
			invocation.command === "fill"
				? { kind: "fill", value: args[1] }
				: invocation.command === "select"
					? { kind: "select", values: [args[1]] }
					: invocation.command === "check" || invocation.command === "uncheck"
						? { kind: "checked", checked: invocation.command === "check" }
						: { kind: "click" };
		return runWhenActionable(
			() => browser.page(tabId),
			args[0],
			waitingAction,
			signal,
			async (page, target) => {
				const actions = page.interactions;
				if (invocation.command === "fill") {
					const interaction = await actions.fillAsync(target, args[1]);
					if (!options.submit) return interaction;
					if (interaction.defaultPrevented) return { interaction };
					const result = await browser.press(tabId, "Enter", { signal });
					if (
						result.keyboard.defaultAction &&
						!result.navigation &&
						!result.form
					)
						throw new AgentBrowserError(
							"unsupported",
							"Keyboard default action is not implemented",
						);
					return { interaction, ...result };
				}
				if (invocation.command === "check" || invocation.command === "uncheck")
					return actions.setCheckedAsync(
						target,
						invocation.command === "check",
					);
				if (invocation.command === "select")
					return actions.selectAsync(target, [args[1]]);
				if (invocation.command === "click") {
					const result = await browser.click(tabId, target, { signal });
					if (
						result.interaction.defaultAction &&
						!result.navigation &&
						!result.form
					)
						throw new AgentBrowserError(
							"unsupported",
							"Click event ran, but its pending default action is not implemented",
						);
					return result;
				}
				throw new AgentBrowserError(
					"unsupported",
					"Command dispatch is not implemented",
				);
			},
		);
	}

	private cache(key: string, snapshot: SemanticSnapshot) {
		const previous = this.snapshots.get(key);
		if (previous) {
			this.cachedBytes -= previous.bytes;
			this.snapshots.delete(key);
		}
		const serialized = JSON.stringify(snapshot);
		const bytes = new TextEncoder().encode(serialized).byteLength;
		if (bytes > this.limits.maxSnapshotCacheBytes) return;
		while (
			this.cachedBytes + bytes > this.limits.maxSnapshotCacheBytes &&
			this.snapshots.size
		) {
			const oldest = this.snapshots.entries().next().value;
			if (!oldest) break;
			this.snapshots.delete(oldest[0]);
			this.cachedBytes -= oldest[1].bytes;
		}
		this.snapshots.set(key, {
			snapshot: JSON.parse(serialized) as SemanticSnapshot,
			bytes,
		});
		this.cachedBytes += bytes;
	}
}
