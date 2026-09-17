import {
	type ScriptLoadReport,
	updateDocumentScriptState,
} from "./document-script-state.js";
import { documentBaseUrl } from "./document-url.js";
import { documentImages } from "./document-images.js";
import { withDocumentWrite } from "./document-write.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent } from "./events.js";
import { documentHistory } from "./history.js";
import type { HtmlScriptContext, HtmlScriptHooks } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import type { ScriptEvaluation } from "./safejs.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";
import {
	parseIntegrityMetadata,
	verifyIntegrityMetadata,
} from "./subresource-integrity.js";

export interface ScriptLoaderOptions {
	maxScripts?: number;
	maxExternal?: number;
	maxSourceBytes?: number;
}

interface ScriptRunner {
	readonly closed: boolean;
	evaluate(
		source: string,
		options: { signal: AbortSignal; filename: string; discardResult: true },
	): Promise<ScriptEvaluation>;
}

interface Source {
	id: number;
	text?: string;
	url: string;
	external: boolean;
	error?: string;
}

type PreparedScript =
	| { mode: "skip" }
	| { mode: "inline"; source: Source }
	| { mode: "blocking" | "async" | "defer"; source: Promise<Source> };

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
	private activeFetches = 0;
	private parsingFinished = false;
	private tail = Promise.resolve();
	private csp = false;
	private readonly counts = {
		mode: "classic" as const,
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
		this.prepared.clear();
	};

	constructor(
		private readonly options: {
			response: NetworkResponse;
			signal: AbortSignal;
			owner: (tree: DocumentTree) => ScriptRunner;
			fetch?: (url: string) => Promise<NetworkResponse>;
			fetchWithPolicy?: (
				url: string,
				policy: ScriptFetchPolicy,
				signal: AbortSignal,
			) => Promise<Readonly<ScriptFetchResult>>;
			limits?: ScriptLoaderOptions;
		},
	) {
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
		this.csp = !!options.response.headers["content-security-policy"]?.length;
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
		this.runner = this.options.owner(tree);
		this.publish();
	}

	policy(tree: DocumentTree) {
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script policy document mismatch",
			);
		this.csp = true;
	}

	runParser(step: () => void): Promise<void> {
		return this.enqueue(async () => {
			step();
		});
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

	private prepare(tree: DocumentTree, id: number): PreparedScript {
		this.live();
		if (tree !== this.tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Script loader document mismatch",
			);
		this.counts.discovered++;
		if (this.counts.discovered > this.maxScripts) {
			this.counts.halted = true;
			this.skip("script-count-limit");
			return { mode: "skip" };
		}
		if (this.counts.halted || this.runner?.closed) {
			this.counts.halted = true;
			this.skip("realm-halted");
			return { mode: "skip" };
		}
		const node = tree.get(id);
		const attributes = node.attributes;
		const type = scriptType(attributes);
		if (type && !javascriptTypes.has(type)) {
			this.skip(
				["module", "importmap", "speculationrules"].includes(type)
					? `${type}-not-supported`
					: "data-block",
			);
			return { mode: "skip" };
		}
		if (this.blocked()) {
			this.skip("csp-not-supported");
			return { mode: "skip" };
		}
		if (!tree.isConnected(id)) {
			this.skip("disconnected-script");
			return { mode: "skip" };
		}
		if (!Object.hasOwn(attributes, "src")) {
			const source = tree.textContent(id);
			if (!source.trim()) {
				this.skip("empty-script");
				return { mode: "skip" };
			}
			return {
				mode: "inline",
				source: { id, text: source, url: tree.url, external: false },
			};
		}
		const requiresPolicy = ["integrity", "crossorigin"].some((name) =>
			Object.hasOwn(attributes, name),
		);
		if (requiresPolicy && !this.options.fetchWithPolicy) {
			this.skip("integrity-or-cors-not-supported");
			return { mode: "skip" };
		}
		if (++this.counts.external > this.maxExternal) {
			this.counts.halted = true;
			this.skip("external-count-limit");
			return { mode: "skip" };
		}
		const crossorigin = attributes.crossorigin;
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
		);
		const mode = Object.hasOwn(attributes, "async")
			? "async"
			: Object.hasOwn(attributes, "defer")
				? "defer"
				: "blocking";
		return { mode, source };
	}

	async finish(tree: DocumentTree) {
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
			await this.enqueue(async () => {
				updateDocumentScriptState(tree, { readyState: "complete" });
				await this.event(tree.root, "readystatechange");
				const window = documentInteractions(tree).events.windowTarget;
				if (window !== null) await this.event(window, "load");
			});
			this.counts.complete = true;
			this.publish();
		} finally {
			this.options.signal.removeEventListener("abort", this.abort);
			this.deferred.length = 0;
			this.asynchronous.length = 0;
			this.prepared.clear();
		}
	}

	private async fetchSource(
		id: number,
		value: string,
		encoding?: string,
		selection?: { policy: ScriptFetchPolicy; integrity: string },
	): Promise<Source> {
		let url = this.options.response.url;
		const baseUrl = this.tree ? documentBaseUrl(this.tree) : url;
		if (this.activeFetches < 4) this.activeFetches++;
		else await new Promise<void>((resolve) => this.fetchWaiters.push(resolve));
		try {
			this.live();
			if (!value.trim() || !this.tree)
				throw new AgentBrowserError("invalid-input", "Missing script URL");
			url = parseNetworkUrl(new URL(value, baseUrl).href).href;
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
				const result = await this.options.fetchWithPolicy(
					url,
					selection.policy,
					this.controller.signal,
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
				const finalUrl = parseNetworkUrl(response.url);
				if (
					new URL(this.tree.url).protocol === "https:" &&
					finalUrl.protocol !== "https:"
				)
					throw new AgentBrowserError(
						"policy-denied",
						"Mixed-content script response blocked",
					);
			} else {
				if (!this.options.fetch)
					throw new AgentBrowserError(
						"unsupported",
						"Script fetch is unavailable",
					);
				response = await this.options.fetch(url);
			}
			this.live();
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
			const next = this.fetchWaiters.shift();
			if (next) next();
			else this.activeFetches--;
		}
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
		const text = source.text ?? "";
		const bytes = new TextEncoder().encode(text).length;
		if (this.counts.sourceBytes + bytes > this.maxBytes) {
			this.counts.halted = true;
			this.skip("source-byte-limit");
			return;
		}
		this.counts.sourceBytes += bytes;
		const runner = this.runner;
		return withDocumentWrite(tree, context, async () => {
			updateDocumentScriptState(tree, { currentScript: source.id });
			try {
				const result = await runner.evaluate(text, {
					signal: this.controller.signal,
					filename: source.url,
					discardResult: true,
				});
				this.live();
				if (result.ok) this.counts.executed++;
				else {
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
			if (source.external) await this.event(source.id, "load");
		});
	}

	private async event(target: number, type: string, bubbles = false) {
		if (!this.tree || this.counts.halted || this.runner?.closed) return;
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
		if (!this.csp && this.tree)
			this.csp = [...this.tree.walk()].some(
				({ node }) =>
					node.tagName === "meta" &&
					node.attributes["http-equiv"]?.trim().toLowerCase() ===
						"content-security-policy",
			);
		return this.csp;
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
		if (this.controller.signal.aborted)
			throw new AgentBrowserError("aborted", "Page script loading aborted");
	}
}
