import { types } from "node:util";
import { AgentBrowserError } from "./errors.js";
import type { PageBlobs } from "./page-blobs.js";
import type { WorkerBudget } from "./page-workers.js";
import type { ReleasedContext } from "./safejs-extension-types.js";
import type { ScriptLimits } from "./safejs.js";
import {
	type WorkerImportFetch,
	type WorkerImportPolicy,
	isWorkerJavaScriptMimeType,
} from "./worker-fetch.js";

export const workerImportLimits = Object.freeze({
	calls: 128,
	scripts: 128,
	arguments: 32,
	depth: 8,
	totalSourceCodeUnits: 8_388_608,
});
export interface WorkerImportOptions {
	url: string;
	documentUrl: string;
	budget: WorkerBudget;
	limits: Readonly<ScriptLimits>;
	policy: WorkerImportPolicy;
	fetch?: WorkerImportFetch;
	isClosed(): boolean;
}
export class PageWorkerImports {
	readonly operation: (urls: unknown) => Promise<void>;
	private calls = 0;
	private scripts = 0;
	private units = 0;
	private depth = 0;
	private closed = false;
	private readonly controller = new AbortController();
	private readonly credits = new Set<object>();
	constructor(
		private readonly context: ReleasedContext,
		private readonly blobs: readonly PageBlobs[],
		private readonly options: WorkerImportOptions,
	) {
		this.operation = context.nestedOperation((urls) => this.import(urls));
	}
	close() {
		this.closed = true;
		this.controller.abort();
	}
	metrics() {
		return {
			closed: this.closed,
			calls: this.calls,
			scripts: this.scripts,
			sourceCodeUnits: this.units,
			depth: this.depth,
			pending: this.credits.size,
		};
	}
	private ensureOpen() {
		if (this.closed || this.context.signal.aborted || this.options.isClosed())
			throw new AgentBrowserError("closed", "Worker imports are closed");
	}
	private limited(): never {
		throw new AgentBrowserError(
			"resource-limit",
			"Worker import limit exceeded",
		);
	}
	private async import(input: unknown) {
		this.ensureOpen();
		if (
			types.isProxy(input) ||
			!Array.isArray(input) ||
			input.length > workerImportLimits.arguments
		)
			throw new TypeError("Invalid Worker import arguments");
		// Resolve every argument before fetching any, as required by importScripts.
		const urls: string[] = [];
		for (let index = 0; index < input.length; index++) {
			const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
			if (!descriptor || !Object.hasOwn(descriptor, "value"))
				throw new TypeError("Worker imports require data arguments");
			const value: unknown = descriptor.value;
			if (typeof value !== "string" || value.length > 4096)
				throw new TypeError("Invalid Worker import URL");
			const url = new URL(value, this.options.url);
			if (
				url.username ||
				url.password ||
				!["http:", "https:", "blob:"].includes(url.protocol)
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Unsupported Worker import URL",
				);
			if (
				new URL(this.options.documentUrl).protocol === "https:" &&
				url.protocol === "http:"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Mixed-content Worker import denied",
				);
			if (url.href.length > 4096) this.limited();
			urls.push(url.href);
		}
		if (
			this.calls >= workerImportLimits.calls ||
			this.scripts + urls.length > workerImportLimits.scripts ||
			this.depth >= workerImportLimits.depth
		)
			this.limited();
		this.calls++;
		this.depth++;
		const deadline = new AbortController();
		const timeout = setTimeout(
			() =>
				deadline.abort(
					new AgentBrowserError("timeout", "Worker import timed out"),
				),
			this.options.limits.timeoutMs,
		);
		const signal = AbortSignal.any([
			deadline.signal,
			this.controller.signal,
			this.context.signal,
		]);
		try {
			for (const url of urls) {
				signal.throwIfAborted();
				this.ensureOpen();
				this.options.policy(url, 0);
				if (this.scripts >= workerImportLimits.scripts) this.limited();
				this.scripts++;
				let source: string;
				if (url.startsWith("blob:")) {
					let blob: ReturnType<PageBlobs["resolveObjectUrl"]>;
					for (const owner of this.blobs) {
						blob = owner.resolveObjectUrl(url);
						if (blob) break;
					}
					if (!blob)
						throw new TypeError("Worker import Blob URL is revoked or foreign");
					if (!isWorkerJavaScriptMimeType(blob.type))
						throw new TypeError(
							"Imported Worker scripts require a JavaScript MIME type",
						);
					source = new TextDecoder().decode(blob.bytes);
				} else {
					const fetch = this.options.fetch;
					if (!fetch)
						throw new AgentBrowserError(
							"unsupported",
							"Worker import network loader is unavailable",
						);
					const operation = Promise.resolve().then(() =>
						fetch(url, signal, this.options.policy),
					);
					const loaded = await new Promise<
						Awaited<ReturnType<WorkerImportFetch>>
					>((resolve, reject) => {
						const cancel = () => reject(signal.reason);
						operation.then(
							(value) => {
								signal.removeEventListener("abort", cancel);
								resolve(value);
							},
							(error) => {
								signal.removeEventListener("abort", cancel);
								reject(error);
							},
						);
						if (signal.aborted) cancel();
						else signal.addEventListener("abort", cancel, { once: true });
					});
					this.ensureOpen();
					signal.throwIfAborted();
					const final = new URL(loaded.url);
					if (
						!["http:", "https:"].includes(final.protocol) ||
						final.username ||
						final.password ||
						(new URL(this.options.documentUrl).protocol === "https:" &&
							final.protocol !== "https:")
					)
						throw new AgentBrowserError(
							"policy-denied",
							"Worker import loader returned an invalid destination",
						);
					const redirects = loaded.redirectCount ?? 0;
					if (
						!Number.isSafeInteger(redirects) ||
						redirects < 0 ||
						redirects > 20
					)
						throw new TypeError("Invalid Worker import redirect count");
					this.options.policy(final.href, redirects);
					source = loaded.source;
				}
				if (
					typeof source !== "string" ||
					source.length > this.options.limits.maxSourceCodeUnits ||
					source.length > workerImportLimits.totalSourceCodeUnits - this.units
				)
					this.limited();
				this.units += source.length;
				const credit = {};
				this.options.budget.setRetainedDataUsage(credit, source.length);
				this.credits.add(credit);
				try {
					this.ensureOpen();
					signal.throwIfAborted();
					await this.context.evaluateNested(source);
				} finally {
					this.options.budget.setRetainedDataUsage(credit, 0);
					this.credits.delete(credit);
				}
			}
		} finally {
			clearTimeout(timeout);
			deadline.abort();
			this.depth--;
		}
	}
}
