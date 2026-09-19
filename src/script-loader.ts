import { documentImages } from "./document-images.js";
import {
	type DocumentScriptAdmission,
	type DocumentScriptCsp,
	initializeDocumentScriptCsp,
	snapshotDocumentScriptCspHeaders,
} from "./document-script-csp.js";
import {
	type ScriptLoadReport,
	updateDocumentScriptState,
} from "./document-script-state.js";
import { documentBaseUrl } from "./document-url.js";
import { withDocumentWrite } from "./document-write.js";
import type { DocumentMutation, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent } from "./events.js";
import { documentHistory } from "./history.js";
import type { HtmlModuleRequest, HtmlModuleSource } from "./html-module.js";
import type { HtmlScriptContext, HtmlScriptHooks } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import {
	initializeScriptElement,
	markScriptElementStarted,
	scriptElementAsync,
	scriptElementState,
} from "./script-element-state.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";
import {
	parseIntegrityMetadata,
	verifyIntegrityMetadata,
} from "./subresource-integrity.js";

export interface ScriptLoaderOptions {
	modules?: boolean;
	maxScripts?: number;
	maxExternal?: number;
	maxSourceBytes?: number;
}

interface ScriptRunner {
	readonly closed: boolean;
	close?(): void | Promise<void>;
	readonly supportsHtmlModules?: boolean;
	prepareModule?(request: HtmlModuleRequest): Promise<HtmlModuleSource>;
	evaluate(
		source: string,
		options: {
			signal: AbortSignal;
			filename: string;
			discardResult: true;
			sourceType?: "module";
		},
	): Promise<ScriptEvaluation>;
}

interface Source {
	id: number;
	text?: string;
	url: string;
	external: boolean;
	module?: boolean;
	error?: string;
	admission?: DocumentScriptAdmission;
	redirectCount?: number;
}

type PreparedScript =
	| { mode: "skip" }
	| { mode: "inline"; source: Source }
	| {
			mode: "blocking" | "async" | "defer" | "ordered";
			source: Promise<Source>;
	  };

const javascriptTypes = new Set([
	"application/ecmascript",
	"application/javascript",
	"application/x-ecmascript",
	"application/x-javascript",
	"text/ecmascript",
	"text/javascript",
	"text/javascript1.0",
	"text/javascript1.1",
	"text/javascript1.2",
	"text/javascript1.3",
	"text/javascript1.4",
	"text/javascript1.5",
	"text/jscript",
	"text/livescript",
	"text/x-ecmascript",
	"text/x-javascript",
]);

function scriptType(attributes: Readonly<Record<string, string>>) {
	return (
		attributes.type ??
		(attributes.language ? `text/${attributes.language}` : "")
	)
		.trim()
		.toLowerCase();
}

export class ScriptLoader implements HtmlScriptHooks {
	private tree?: DocumentTree;
	private runner?: ScriptRunner;
	private readonly maxScripts: number;
	private readonly maxExternal: number;
	private readonly maxBytes: number;
	private readonly controller = new AbortController();
	private readonly deferred: Promise<Source>[] = [];
	private readonly asynchronous: Promise<void>[] = [];
	private readonly fetchWaiters: (() => void)[] = [];
	private readonly prepared = new Map<number, PreparedScript>();
	private readonly started = new Set<number>();
	private readonly dynamic = new Set<Promise<void>>();
	private unsubscribeMutations?: () => void;
	private parserDepth = 0;
	private readonly moduleResults = new Map<string, { error?: string }>();
	private modules = false;
	private activeFetches = 0;
	private parsingFinished = false;
	private tail = Promise.resolve();
	private ordered = Promise.resolve();
	private csp = false;
	private readonly responseHeaders: unknown;
	private scriptPolicy?: DocumentScriptCsp;
	private unsubscribePolicy?: () => void;
	private runtimeClosing = false;
	private readonly counts = {
		mode: "classic" as ScriptLoadReport["mode"],
		partial: true as const,
		discovered: 0,
		executed: 0,
		skipped: 0,
		failed: 0,
		external: 0,
		sourceBytes: 0,
		halted: false,
		complete: false,
		issues: Object.create(null) as Record<string, number>,
	};
	private readonly abort = () => {
		this.controller.abort();
		this.scriptPolicy?.close();
		this.unsubscribePolicy?.();
		this.unsubscribePolicy = undefined;
		this.closeRuntime();
		this.unsubscribeMutations?.();
		this.unsubscribeMutations = undefined;
		this.options.signal.removeEventListener("abort", this.abort);
		this.fetchWaiters.length = 0;
		this.deferred.length = 0;
		this.asynchronous.length = 0;
		this.dynamic.clear();
		this.ordered = Promise.resolve();
		this.started.clear();
		this.prepared.clear();
		this.moduleResults.clear();
		if (this.tree && !this.tree.mutationMetrics().closed)
			updateDocumentScriptState(this.tree, { currentScript: null });
		this.tree = undefined;
		this.runner = undefined;
	};

	constructor(
		private readonly options: {
			response: NetworkResponse;
			topLevelDocument?: boolean;
			signal: AbortSignal;
			owner: (tree: DocumentTree) => ScriptRunner;
			fetch?: (url: string) => Promise<NetworkResponse>;
			fetchWithPolicy?: (
				url: string,
				policy: ScriptFetchPolicy,
				signal: AbortSignal,
				admission?: DocumentScriptAdmission,
			) => Promise<Readonly<ScriptFetchResult>>;
			limits?: ScriptLoaderOptions;
		},
	) {
		if (
			options.limits?.modules !== undefined &&
			typeof options.limits.modules !== "boolean"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid module script mode",
			);
		this.maxScripts = options.limits?.maxScripts ?? 64;
		this.maxExternal = options.limits?.maxExternal ?? 16;
		this.maxBytes = options.limits?.maxSourceBytes ?? 1_048_576;
		for (const [value, maximum] of [
			[this.maxScripts, 256],
			[this.maxExternal, 64],
			[this.maxBytes, 8_388_608],
		])
			if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid script loading limits",
				);
		if (
			options.topLevelDocument !== undefined &&
			typeof options.topLevelDocument !== "boolean"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script document context",
			);
		this.responseHeaders = snapshotDocumentScriptCspHeaders(
			options.response.headers,
		);
		options.signal.addEventListener("abort", this.abort, { once: true });
		if (options.signal.aborted) this.abort();
	}

	start(tree: DocumentTree) {
		if (this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script loader already owns a document",
			);
		this.live();
		if (tree.url !== this.options.response.url)
			throw new AgentBrowserError(
				"policy-denied",
				"Script document URL does not match the response",
			);
		this.scriptPolicy = initializeDocumentScriptCsp(
			tree,
			this.responseHeaders,
			this.options.topLevelDocument === true,
		);
		this.tree = tree;
		updateDocumentScriptState(tree, {
			readyState: "loading",
			currentScript: null,
		});
		documentHistory(tree, documentInteractions(tree).events);
		tree.onClose(() => {
			this.abort();
			this.options.signal.removeEventListener("abort", this.abort);
		});
		this.unsubscribePolicy = this.scriptPolicy?.onInvalidated(() => {
			this.csp = true;
			this.closeRuntime();
		});
		if (!this.blocked()) {
			this.runner = this.options.owner(tree);
			if (this.blocked()) this.closeRuntime();
		}
		this.modules =
			this.options.limits?.modules === true &&
			this.runner?.supportsHtmlModules === true &&
			typeof this.runner?.prepareModule === "function";
		if (this.modules) this.counts.mode = "classic-and-module";
		this.unsubscribeMutations = tree.onMutation((record) =>
			this.mutation(record),
		);
		this.publish();
	}

	policy(tree: DocumentTree) {
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script policy document mismatch",
			);
		this.csp = true;
		this.scriptPolicy?.close();
		this.closeRuntime();
	}

	runParser(step: () => void): Promise<void> {
		return this.enqueue(async () => {
			this.parserStep(step);
		});
	}
	private parserStep(step: () => void) {
		this.parserDepth++;
		try {
			step();
		} finally {
			this.parserDepth--;
		}
	}

	private mutation(record: DocumentMutation) {
		const tree = this.tree;
		if (!tree || this.controller.signal.aborted) return;
		if (this.scriptPolicy?.unsupported || this.csp) this.closeRuntime();
		if (this.parserDepth) {
			for (const id of record.addedNodes)
				for (const { node } of tree.walk(id))
					if (
						isHtmlElement(node, "script") &&
						scriptElementState(tree, node.id).origin === "unknown"
					)
						initializeScriptElement(tree, node.id, "parser");
			return;
		}
		if (record.type === "attributes") {
			if (record.attributeName === "src" && record.attributeNamespace === null)
				this.inserted(record.target);
			return;
		}
		if (record.type === "characterData") {
			const parent = tree.get(record.target).parent;
			if (parent !== null) this.inserted(parent);
			return;
		}
		this.inserted(record.target);
		for (const id of record.addedNodes) {
			if (!tree.isConnected(id)) continue;
			for (const { node } of tree.walk(id)) this.inserted(node.id);
		}
	}

	private inserted(id: number) {
		const tree = this.tree;
		if (!tree || this.started.has(id) || !tree.isConnected(id)) return;
		const node = tree.get(id);
		if (!isHtmlElement(node, "script")) return;
		const state = scriptElementState(tree, id);
		if (state.alreadyStarted || state.origin === "parser") return;
		if (!Object.hasOwn(node.attributes, "src") && !tree.textContent(id).trim())
			return;
		if (this.options.signal.aborted) {
			this.abort();
			return;
		}
		this.options.signal.addEventListener("abort", this.abort, { once: true });
		const prepared = this.prepare(tree, id, true);
		if (prepared.mode === "skip") {
			this.releaseAbort();
			return;
		}
		const execution =
			prepared.mode === "inline"
				? this.enqueue(() => this.execute(prepared.source))
				: prepared.mode === "ordered"
					? this.enqueueOrdered(prepared.source)
					: this.enqueueSource(prepared.source);
		this.dynamic.add(execution);
		const complete = () => {
			this.dynamic.delete(execution);
			this.releaseAbort();
		};
		void execution.then(complete, complete);
	}

	private releaseAbort() {
		if (this.counts.complete && !this.dynamic.size)
			this.options.signal.removeEventListener("abort", this.abort);
	}

	async settle() {
		this.live();
		do {
			await this.awaitOperation(Promise.all([...this.dynamic]));
			await this.tail;
			this.live();
		} while (this.dynamic.size);
	}
	async parsed(tree: DocumentTree) {
		if (this.parsingFinished) return;
		this.parsingFinished = true;
		await this.enqueue(async () => {
			updateDocumentScriptState(tree, { readyState: "interactive" });
			await this.event(tree.root, "readystatechange");
		});
	}

	prepareWrittenScript(
		tree: DocumentTree,
		id: number,
	): "blocking" | "nonblocking" | "inline" {
		const prepared = this.prepare(tree, id);
		this.prepared.set(id, prepared);
		return prepared.mode === "inline" || prepared.mode === "blocking"
			? prepared.mode
			: "nonblocking";
	}

	async script(tree: DocumentTree, id: number, context?: HtmlScriptContext) {
		this.live();
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script loader document mismatch",
			);
		const prepared = this.prepared.get(id) ?? this.prepare(tree, id);
		this.prepared.delete(id);
		if (prepared.mode === "skip") return;
		if (prepared.mode === "inline")
			await this.enqueue(() => this.execute(prepared.source, context));
		else if (prepared.mode === "async") {
			const execution = prepared.source.then((value) =>
				this.enqueue(() => this.execute(value)),
			);
			this.asynchronous.push(execution);
			void execution.catch(() => undefined);
		} else if (prepared.mode === "defer") this.deferred.push(prepared.source);
		else await this.enqueueSource(prepared.source, context);
		this.publish();
	}

	private prepare(
		tree: DocumentTree,
		id: number,
		dynamic = false,
	): PreparedScript {
		this.live();
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script loader document mismatch",
			);
		if (this.started.has(id)) return { mode: "skip" };
		let state = scriptElementState(tree, id);
		if (!dynamic && state.origin === "unknown") {
			initializeScriptElement(tree, id, "parser");
			state = scriptElementState(tree, id);
		}
		if (state.alreadyStarted) return { mode: "skip" };
		this.started.add(id);
		this.counts.discovered++;
		if (this.counts.discovered > this.maxScripts) {
			this.counts.halted = true;
			this.skip("script-count-limit");
			return { mode: "skip" };
		}
		if (!this.blocked() && (this.counts.halted || this.runner?.closed)) {
			this.counts.halted = true;
			this.skip("realm-halted");
			return { mode: "skip" };
		}
		if (state.origin === "unknown" || state.origin === "inert") {
			this.skip(
				state.origin === "unknown" ? "unknown-script-origin" : "inert-script",
			);
			return { mode: "skip" };
		}
		const admission = this.scriptPolicy?.enforced
			? this.scriptPolicy.prepareScript(id)
			: undefined;
		markScriptElementStarted(tree, id);
		const node = tree.get(id);
		const attributes = node.attributes;
		const type = scriptType(attributes);
		const module = type === "module" && this.modules;
		if (type && !javascriptTypes.has(type) && !module) {
			this.skip(
				["module", "importmap", "speculationrules"].includes(type)
					? `${type}-not-supported`
					: "data-block",
			);
			return { mode: "skip" };
		}
		if (this.modules && !module && Object.hasOwn(attributes, "nomodule")) {
			this.skip("nomodule");
			return { mode: "skip" };
		}
		if (this.blocked() || (this.scriptPolicy?.enforced && !admission)) {
			this.skip("csp-not-supported");
			return { mode: "skip" };
		}
		if (!tree.isConnected(id)) {
			this.skip("disconnected-script");
			return { mode: "skip" };
		}
		if (admission) {
			let allowed = false;
			try {
				allowed = Object.hasOwn(attributes, "src")
					? admission.allows(
							parseNetworkUrl(
								new URL(attributes.src, documentBaseUrl(tree)).href,
							).href,
							0,
						)
					: admission.allows();
			} catch {}
			if (!allowed) {
				this.skip("csp-not-supported");
				return { mode: "skip" };
			}
		}
		if (module) {
			const external = Object.hasOwn(attributes, "src");
			if (external && ++this.counts.external > this.maxExternal) {
				this.counts.halted = true;
				this.skip("external-count-limit");
				return { mode: "skip" };
			}
			return {
				mode: dynamic
					? scriptElementAsync(tree, id)
						? "async"
						: "ordered"
					: Object.hasOwn(attributes, "async")
						? "async"
						: "defer",
				source: this.prepareModuleSource(
					tree,
					id,
					attributes,
					external,
					admission,
				),
			};
		}
		if (!Object.hasOwn(attributes, "src")) {
			const source = tree.textContent(id);
			if (!source.trim()) {
				this.skip("empty-script");
				return { mode: "skip" };
			}
			return {
				mode: "inline",
				source: { id, text: source, url: tree.url, external: false, admission },
			};
		}
		const requiresPolicy =
			!!admission ||
			["integrity", "crossorigin"].some((name) =>
				Object.hasOwn(attributes, name),
			);
		if (requiresPolicy && !this.options.fetchWithPolicy) {
			this.skip(
				admission ? "csp-not-supported" : "integrity-or-cors-not-supported",
			);
			return { mode: "skip" };
		}
		if (++this.counts.external > this.maxExternal) {
			this.counts.halted = true;
			this.skip("external-count-limit");
			return { mode: "skip" };
		}
		const crossorigin = attributes.crossorigin;
		const mode = dynamic
			? scriptElementAsync(tree, id)
				? "async"
				: "ordered"
			: Object.hasOwn(attributes, "async")
				? "async"
				: Object.hasOwn(attributes, "defer")
					? "defer"
					: "blocking";
		const source = this.fetchSource(
			id,
			attributes.src,
			attributes.charset,
			requiresPolicy
				? {
						policy: {
							mode: crossorigin === undefined ? "no-cors" : "cors",
							credentials:
								crossorigin === undefined ||
								crossorigin.toLowerCase() === "use-credentials"
									? "include"
									: "same-origin",
						},
						integrity: attributes.integrity ?? "",
					}
				: undefined,
			admission,
		);
		return { mode, source };
	}

	async finish(tree: DocumentTree) {
		this.live();
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script loader document mismatch",
			);
		try {
			await this.parsed(tree);
			for (const source of this.deferred) await this.enqueueSource(source);
			await this.enqueue(() => this.event(tree.root, "DOMContentLoaded", true));
			await Promise.all(this.asynchronous);
			await documentImages(tree).settle(this.controller.signal);
			await this.settle();
			await this.enqueue(async () => {
				updateDocumentScriptState(tree, { readyState: "complete" });
				await this.event(tree.root, "readystatechange");
				const window = documentInteractions(tree).events.windowTarget;
				if (window !== null) await this.event(window, "load");
			});
			this.counts.complete = true;
			this.publish();
		} finally {
			if (!this.dynamic.size)
				this.options.signal.removeEventListener("abort", this.abort);
			this.deferred.length = 0;
			this.asynchronous.length = 0;
			this.prepared.clear();
		}
	}

	private async prepareModuleSource(
		tree: DocumentTree,
		id: number,
		attributes: Readonly<Record<string, string>>,
		external: boolean,
		admission?: DocumentScriptAdmission,
	): Promise<Source> {
		let url = `urn:agent-browser:html-module:${id}`;
		try {
			const baseUrl = documentBaseUrl(tree);
			if (external) {
				if (!attributes.src.trim())
					throw new AgentBrowserError("invalid-input", "Missing module URL");
				url = parseNetworkUrl(new URL(attributes.src, baseUrl).href).href;
			}
			if (!this.runner?.prepareModule)
				throw new AgentBrowserError(
					"unsupported",
					"Module preparation unavailable",
				);
			const prepared = await this.awaitOperation(
				this.runner.prepareModule({
					id: url,
					...(external ? {} : { source: tree.textContent(id) }),
					baseUrl,
					credentials:
						attributes.crossorigin?.toLowerCase() === "use-credentials"
							? "include"
							: "same-origin",
					...(!external || attributes.integrity === undefined
						? {}
						: { integrity: attributes.integrity }),
					...(admission ? { admission } : {}),
					signal: this.controller.signal,
				}),
			);
			this.live();
			return {
				id,
				url: prepared.id,
				text: prepared.source,
				external,
				module: true,
				admission,
				redirectCount: 0,
			};
		} catch (error) {
			return {
				id,
				url,
				external,
				module: true,
				admission,
				error:
					error instanceof AgentBrowserError ? error.code : "network-error",
			};
		}
	}

	private awaitOperation<Value>(operation: Promise<Value>): Promise<Value> {
		const signal = this.controller.signal;
		return new Promise((resolve, reject) => {
			const cancel = () =>
				reject(new AgentBrowserError("aborted", "Page script loading aborted"));
			signal.addEventListener("abort", cancel, { once: true });
			operation.then(
				(value) => {
					signal.removeEventListener("abort", cancel);
					resolve(value);
				},
				(error: unknown) => {
					signal.removeEventListener("abort", cancel);
					reject(error);
				},
			);
			if (signal.aborted) {
				signal.removeEventListener("abort", cancel);
				cancel();
			}
		});
	}

	private async fetchSource(
		id: number,
		value: string,
		encoding?: string,
		selection?: { policy: ScriptFetchPolicy; integrity: string },
		admission?: DocumentScriptAdmission,
	): Promise<Source> {
		let url = this.options.response.url;
		const baseUrl = this.tree ? documentBaseUrl(this.tree) : url;
		let acquired = false;
		try {
			if (this.activeFetches < 4) this.activeFetches++;
			else
				await this.awaitOperation(
					new Promise<void>((resolve) => this.fetchWaiters.push(resolve)),
				);
			acquired = true;
			this.live();
			if (!value.trim() || !this.tree)
				throw new AgentBrowserError("invalid-input", "Missing script URL");
			url = parseNetworkUrl(new URL(value, baseUrl).href).href;
			if (this.blocked() || (admission && !admission.allows(url, 0)))
				throw new AgentBrowserError(
					"policy-denied",
					"Script policy no longer admits this request",
				);
			if (
				new URL(this.tree.url).protocol === "https:" &&
				new URL(url).protocol !== "https:"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Mixed-content script blocked",
				);
			const integrity = selection
				? parseIntegrityMetadata(selection.integrity)
				: null;
			let response: NetworkResponse;
			if (selection) {
				if (!this.options.fetchWithPolicy)
					throw new AgentBrowserError(
						"unsupported",
						"Script policy fetch is unavailable",
					);
				const result = await this.awaitOperation(
					this.options.fetchWithPolicy(
						url,
						selection.policy,
						this.controller.signal,
						...(admission ? ([admission] as const) : ([] as const)),
					),
				);
				this.live();
				if (
					!["basic", "cors", "opaque"].includes(result.type) ||
					(result.type === "opaque" &&
						(selection.policy.mode === "cors" || integrity !== null))
				)
					throw new AgentBrowserError(
						"policy-denied",
						"Script policy response is not eligible",
					);
				response = result.response;
			} else {
				if (!this.options.fetch)
					throw new AgentBrowserError(
						"unsupported",
						"Script fetch is unavailable",
					);
				response = await this.awaitOperation(this.options.fetch(url));
			}
			this.live();
			const finalUrl = parseNetworkUrl(response.url);
			if (
				admission &&
				(!Array.isArray(response.redirects) ||
					response.redirects.length > 20 ||
					!admission.allows(finalUrl.href, response.redirects.length))
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Script response blocked by document policy",
				);
			if (
				new URL(this.tree.url).protocol === "https:" &&
				finalUrl.protocol !== "https:"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Mixed-content script response blocked",
				);
			if (response.status < 200 || response.status >= 300)
				throw new AgentBrowserError("network-error", "Script response failed");
			const types = response.headers["content-type"];
			if (
				types?.length !== 1 ||
				!javascriptTypes.has(types[0].split(";", 1)[0].trim().toLowerCase())
			)
				throw new AgentBrowserError(
					"unsupported",
					"Script response MIME is not JavaScript",
				);
			if (response.body.byteLength > this.maxBytes)
				throw new AgentBrowserError("resource-limit", "Script body too large");
			if (
				integrity &&
				!verifyIntegrityMetadata(response.body, integrity, this.maxBytes)
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Script integrity verification failed",
				);
			return {
				id,
				text: decodeResponseText(response, encoding ?? "utf-8").text,
				url: response.url,
				external: true,
				admission,
				redirectCount: response.redirects.length,
			};
		} catch (error) {
			return {
				id,
				url,
				external: true,
				error:
					error instanceof AgentBrowserError ? error.code : "network-error",
			};
		} finally {
			if (acquired) {
				const next = this.fetchWaiters.shift();
				if (next) next();
				else this.activeFetches--;
			}
		}
	}

	private enqueueOrdered(source: Promise<Source>): Promise<void> {
		const execution = this.ordered.then(() => {
			this.live();
			return this.enqueueSource(source);
		});
		this.ordered = execution.catch(() => undefined);
		return execution;
	}

	private async enqueueSource(
		source: Promise<Source>,
		context?: HtmlScriptContext,
	) {
		const value = await source;
		await this.enqueue(() => this.execute(value, context));
	}
	private enqueue(task: () => Promise<void>): Promise<void> {
		const work = this.tail.then(() => {
			this.live();
			return task();
		});
		this.tail = work.catch(() => undefined);
		return work;
	}

	private async execute(source: Source, context?: HtmlScriptContext) {
		const tree = this.tree;
		if (this.blocked()) {
			this.skip("csp-not-supported");
			return;
		}
		if (!tree || !this.runner)
			throw new AgentBrowserError("closed", "Script document is unavailable");
		if (this.counts.halted || this.runner.closed) {
			this.counts.halted = true;
			this.skip("realm-halted");
			return;
		}
		if (this.blocked()) {
			this.skip("csp-not-supported");
			return;
		}
		if (source.error) {
			this.counts.failed++;
			this.issue(`fetch-${source.error}`);
			await this.event(source.id, "error");
			return;
		}
		if (
			source.admission &&
			!(source.external
				? source.admission.allows(source.url, source.redirectCount)
				: source.admission.allows())
		) {
			this.skip("csp-not-supported");
			return;
		}
		const previous = source.module
			? this.moduleResults.get(source.url)
			: undefined;
		if (previous) {
			if (previous.error) {
				this.counts.failed++;
				this.issue(previous.error);
			} else this.skip("module-already-evaluated");
			await this.event(source.id, previous.error ? "error" : "load");
			return;
		}
		const text = source.text ?? "";
		const bytes = new TextEncoder().encode(text).length;
		if (this.counts.sourceBytes + bytes > this.maxBytes) {
			this.counts.halted = true;
			this.skip("source-byte-limit");
			return;
		}
		this.counts.sourceBytes += bytes;
		if (source.module) return this.executeModule(source, text);
		const runner = this.runner;
		const writer = context
			? { write: (text: string) => this.parserStep(() => context.write(text)) }
			: undefined;
		return withDocumentWrite(tree, writer, async () => {
			let succeeded = false;
			updateDocumentScriptState(tree, { currentScript: source.id });
			try {
				const result = await this.awaitOperation(
					runner.evaluate(text, {
						signal: this.controller.signal,
						filename: source.url,
						discardResult: true,
					}),
				);
				this.live();
				if (result.ok) {
					succeeded = true;
					this.counts.executed++;
				} else {
					this.counts.failed++;
					this.counts.halted = true;
					this.issue(`execution-${result.error?.code ?? "failed"}`);
				}
			} catch (error) {
				this.live();
				this.counts.failed++;
				this.counts.halted = true;
				this.issue(
					error instanceof AgentBrowserError
						? `execution-${error.code}`
						: "execution-failed",
				);
			} finally {
				if (!this.controller.signal.aborted) {
					updateDocumentScriptState(tree, { currentScript: null });
					this.publish();
				}
			}
			if (source.external)
				await this.event(
					source.id,
					succeeded ? "load" : "error",
					false,
					!succeeded,
				);
		});
	}

	private async executeModule(source: Source, text: string) {
		const tree = this.tree;
		const runner = this.runner;
		if (!tree || !runner)
			throw new AgentBrowserError("closed", "Script document is unavailable");
		const outcome: { error?: string } = {};
		updateDocumentScriptState(tree, { currentScript: null });
		try {
			const result = await this.awaitOperation(
				runner.evaluate(text, {
					signal: this.controller.signal,
					filename: source.url,
					discardResult: true,
					sourceType: "module",
				}),
			);
			this.live();
			if (!result.ok)
				outcome.error = `execution-${result.error?.code ?? "failed"}`;
		} catch (error) {
			this.live();
			outcome.error =
				error instanceof AgentBrowserError
					? `execution-${error.code}`
					: "execution-failed";
		}
		this.moduleResults.set(source.url, outcome);
		if (outcome.error) {
			this.counts.failed++;
			this.issue(outcome.error);
		} else this.counts.executed++;
		if (runner.closed) this.counts.halted = true;
		this.publish();
		await this.event(source.id, outcome.error ? "error" : "load");
	}

	private async event(
		target: number,
		type: string,
		bubbles = false,
		allowHalted = false,
	) {
		if (
			!this.tree ||
			(this.counts.halted && !allowHalted) ||
			this.runner?.closed
		)
			return;
		const events = documentInteractions(this.tree).events;
		if (events.metrics().closed) {
			this.counts.halted = true;
			return;
		}
		try {
			await events.dispatchEventAsync(
				target,
				new BrowserEvent(type, { bubbles }),
			);
		} catch (error) {
			this.live();
			this.counts.halted = true;
			this.issue(
				error instanceof AgentBrowserError
					? `event-${error.code}`
					: "event-failed",
			);
		}
	}

	private blocked() {
		if (this.scriptPolicy?.unsupported) this.csp = true;
		if (!this.csp && !this.scriptPolicy && this.tree)
			this.csp = [...this.tree.walk()].some(
				({ node }) =>
					node.tagName === "meta" &&
					node.attributes["http-equiv"]?.trim().toLowerCase() ===
						"content-security-policy",
			);
		return this.csp;
	}
	private closeRuntime() {
		if (!this.runner || this.runtimeClosing) return;
		this.runtimeClosing = true;
		try {
			void Promise.resolve(this.runner.close?.()).catch(() => undefined);
		} catch {}
	}
	private skip(code: string) {
		this.counts.skipped++;
		this.issue(code);
	}
	private issue(code: string) {
		this.counts.issues[code] = (this.counts.issues[code] ?? 0) + 1;
		this.publish();
	}
	private publish() {
		if (this.tree)
			updateDocumentScriptState(this.tree, {
				report: this.counts as ScriptLoadReport,
			});
	}
	private live() {
		if (this.options.signal.aborted && !this.controller.signal.aborted)
			this.abort();
		if (this.controller.signal.aborted)
			throw new AgentBrowserError("aborted", "Page script loading aborted");
	}
}
