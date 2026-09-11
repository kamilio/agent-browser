import { documentBaseUrl } from "./document-url.js";
import { isHtmlElement } from "./dom-namespaces.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { BrowserEvent } from "./events.js";
import { documentInteractions } from "./interactions.js";
import { type NetworkResponse, parseNetworkUrl } from "./network.js";
import { diagnosticUrl } from "./network-journal.js";
import {
	decodeImage,
	imageMediaTypes,
	type DecodedImage,
	type ImageMediaType,
} from "./image-decoder.js";

export const documentImageLimits = Object.freeze({
	maxElements: 256,
	maxRequests: 128,
	maxConcurrent: 4,
	maxResponseBytes: 8_388_608,
	maxReceivedBytes: 33_554_432,
	maxDecodedBytes: 16_777_216,
	maxDecodeWork: 33_554_432,
	maxUrlCodeUnits: 4096,
	maxUpdates: 1024,
	maxScanWork: 2_000_000,
	maxDecodeWaiters: 128,
	timeoutMs: 10_000,
});
export type DocumentImageLimits = typeof documentImageLimits;
export type ImageFetch = (
	url: string,
	signal: AbortSignal,
) => Promise<NetworkResponse>;
export interface DocumentImageOptions {
	fetch?: ImageFetch;
	blockedByCsp?: boolean;
	limits?: Partial<Record<keyof DocumentImageLimits, number>>;
}
export interface ImageSnapshot {
	readonly ref: string;
	readonly state: "empty" | "loading" | "complete" | "broken";
	readonly complete: boolean;
	readonly currentSrc: string;
	readonly naturalWidth: number;
	readonly naturalHeight: number;
	readonly error?: ErrorCode;
	readonly originClean: boolean;
	readonly ignoredAncillaryChunks: readonly string[];
	readonly mediaType?: ImageMediaType;
	readonly ignoredMetadata: readonly string[];
}
interface Entry {
	id: number;
	controller: AbortController;
	version: number;
	selection: string;
	url: string;
	state: ImageSnapshot["state"];
	error?: ErrorCode;
	resource?: Resource;
}
interface Resource {
	url: string;
	finalUrl: string;
	originClean: boolean;
	state: "queued" | "loading" | "complete" | "broken";
	error?: ErrorCode;
	decoded?: Readonly<DecodedImage>;
	consumers: Set<Entry>;
	controller: AbortController;
	promise: Promise<void>;
	resolve: () => void;
}
function encodingError() {
	const error = new Error("Image decoding failed or the source changed");
	error.name = "EncodingError";
	return error;
}
function abortError(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Image operation aborted");
}
function withImageAbort<Value>(
	operation: Promise<Value>,
	signal: AbortSignal,
): Promise<Value> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortError(signal));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		operation
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

export class DocumentImages {
	readonly limits: Readonly<Record<keyof DocumentImageLimits, number>>;
	private readonly entries = new Map<number, Entry>();
	private readonly resources = new Map<string, Resource>();
	private readonly queue: Resource[] = [];
	private readonly events: { id: number; version: number; type: string }[] = [];
	private readonly controller = new AbortController();
	private readonly unregisterChange: () => void;
	private readonly unregisterClose: () => unknown;
	private timer?: ReturnType<typeof setTimeout>;
	private running?: Promise<void>;
	private dirty = true;
	private closed = false;
	private failure?: AgentBrowserError;
	private active = 0;
	private requests = 0;
	private updates = 0;
	private receivedBytes = 0;
	private decodedBytes = 0;
	private decodeWork = 0;
	private scanWork = 0;
	private waiters = 0;
	private delivered = 0;
	private context?: { base: string; blocked: boolean };
	constructor(
		private readonly tree: DocumentTree,
		private readonly options: DocumentImageOptions = {},
	) {
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			Object.keys(options).some(
				(key) => !["fetch", "blockedByCsp", "limits"].includes(key),
			) ||
			(options.fetch !== undefined && typeof options.fetch !== "function") ||
			(options.blockedByCsp !== undefined &&
				typeof options.blockedByCsp !== "boolean")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid image owner options",
			);
		if (
			options.limits !== undefined &&
			(!options.limits ||
				typeof options.limits !== "object" ||
				Array.isArray(options.limits))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid image owner limits",
			);
		this.limits = Object.freeze({ ...documentImageLimits, ...options.limits });
		for (const [key, value] of Object.entries(this.limits))
			if (
				!Object.hasOwn(documentImageLimits, key) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > documentImageLimits[key as keyof DocumentImageLimits]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid image owner limit",
				);
		this.unregisterChange = tree.onChange((change) => {
			if (["insert", "remove", "attribute", "location"].includes(change.kind)) {
				this.context = undefined;
				this.dirty = true;
				this.schedule();
			}
		});
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unregisterChange();
			throw error;
		}
		this.schedule();
	}
	get(id: number): Readonly<ImageSnapshot> {
		this.ensureOpen();
		const entry = this.update(id);
		const decoded = entry.resource?.decoded;
		return Object.freeze({
			ref: this.tree.reference(id),
			state: entry.state,
			complete: entry.state !== "loading",
			currentSrc: entry.state === "empty" ? "" : entry.url,
			naturalWidth: decoded?.image.width ?? 0,
			naturalHeight: decoded?.image.height ?? 0,
			...(entry.error ? { error: entry.error } : {}),
			originClean:
				entry.resource?.state === "complete" && entry.resource.originClean,
			ignoredAncillaryChunks:
				decoded?.mediaType === "image/png"
					? decoded.ignoredAncillaryChunks
					: Object.freeze([]),
			...(decoded ? { mediaType: decoded.mediaType } : {}),
			ignoredMetadata:
				decoded?.mediaType === "image/png"
					? decoded.ignoredAncillaryChunks
					: (decoded?.ignoredAppMarkers ?? Object.freeze([])),
		});
	}
	decoded(id: number): Readonly<DecodedImage> | undefined {
		this.get(id);
		return this.entries.get(id)?.resource?.decoded;
	}
	async decode(id: number): Promise<void> {
		this.ensureOpen();
		if (this.waiters >= this.limits.maxDecodeWaiters)
			throw new AgentBrowserError(
				"resource-limit",
				"Image decode waiter limit exceeded",
			);
		this.waiters++;
		try {
			const entry = this.update(id);
			const version = entry.version;
			const controller = entry.controller;
			if (!entry.resource) throw encodingError();
			await withImageAbort(entry.resource.promise, controller.signal).catch(
				(error) => {
					this.ensureOpen();
					if (controller.signal.aborted) throw encodingError();
					throw error;
				},
			);
			this.ensureOpen();
			this.update(id);
			if (entry.version !== version || entry.state !== "complete")
				throw encodingError();
		} finally {
			this.waiters--;
		}
	}
	async settle(signal?: AbortSignal): Promise<void> {
		this.ensureOpen();
		for (;;) {
			if (signal?.aborted) throw abortError(signal);
			this.refresh();
			const pending = [...this.resources.values()]
				.filter(
					(resource) =>
						resource.state === "queued" || resource.state === "loading",
				)
				.map((resource) => resource.promise);
			if (pending.length)
				await withImageAbort(
					Promise.all(pending),
					signal ?? this.controller.signal,
				);
			await withImageAbort(this.deliver(), signal ?? this.controller.signal);
			this.ensureOpen();
			if (
				!this.dirty &&
				!this.events.length &&
				![...this.resources.values()].some(
					(resource) =>
						resource.state === "queued" || resource.state === "loading",
				)
			)
				return;
		}
	}
	inspect() {
		this.refresh();
		return Object.freeze({
			...this.metrics(),
			images: Object.freeze(
				[...this.entries.keys()].map((id) => {
					const state = this.get(id);
					return Object.freeze({
						...state,
						currentSrc: state.currentSrc ? diagnosticUrl(state.currentSrc) : "",
					});
				}),
			),
		});
	}
	metrics() {
		return Object.freeze({
			partial: true,
			profile: "png-resource-owner",
			elements: this.entries.size,
			resources: this.resources.size,
			active: this.active,
			queued: this.queue.filter((resource) => resource.consumers.size > 0)
				.length,
			requests: this.requests,
			updates: this.updates,
			receivedBytes: this.receivedBytes,
			decodedBytes: this.decodedBytes,
			decodeWork: this.decodeWork,
			scanWork: this.scanWork,
			waiters: this.waiters,
			delivered: this.delivered,
			closed: this.closed,
			...(this.failure ? { failure: this.failure.code } : {}),
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.controller.abort(
			new AgentBrowserError("closed", "Image owner is closed"),
		);
		this.unregisterChange();
		this.unregisterClose();
		for (const entry of this.entries.values())
			entry.controller.abort(this.controller.signal.reason);
		for (const resource of this.resources.values()) {
			resource.controller.abort(this.controller.signal.reason);
			resource.resolve();
			resource.decoded = undefined;
			resource.consumers.clear();
		}
		this.resources.clear();
		this.entries.clear();
		this.queue.length = 0;
		this.events.length = 0;
		this.decodedBytes = 0;
	}
	private ensureOpen() {
		if (this.failure) throw this.failure;
		if (this.closed)
			throw new AgentBrowserError("closed", "Image owner is closed");
	}
	private selectionContext() {
		if (this.context) return this.context;
		let blocked = this.options.blockedByCsp === true;
		for (const { node } of this.tree.walk()) {
			if (++this.scanWork > this.limits.maxScanWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Image scan work limit exceeded",
				);
			if (
				isHtmlElement(node, "meta") &&
				node.attributes["http-equiv"]?.toLowerCase() ===
					"content-security-policy"
			)
				blocked = true;
		}
		this.context = { base: documentBaseUrl(this.tree), blocked };
		return this.context;
	}
	private refresh() {
		this.ensureOpen();
		if (!this.dirty) return;
		this.dirty = false;
		try {
			const discovered = new Set<number>();
			for (const { node } of this.tree.walk()) {
				if (++this.scanWork > this.limits.maxScanWork)
					throw new AgentBrowserError(
						"resource-limit",
						"Image scan work limit exceeded",
					);
				if (isHtmlElement(node, "img")) discovered.add(node.id);
			}
			for (const id of this.entries.keys()) discovered.add(id);
			for (const id of discovered) this.update(id);
		} catch (error) {
			this.halt(error);
			throw error;
		}
	}
	private update(id: number): Entry {
		this.ensureOpen();
		const node = this.tree.get(id);
		if (!isHtmlElement(node, "img"))
			throw new AgentBrowserError(
				"invalid-input",
				"Image owner requires an img element",
			);
		const attributes = node.attributes;
		const { base, blocked } = this.selectionContext();
		const picture =
			node.parent !== null &&
			isHtmlElement(this.tree.get(node.parent), "picture");
		const sources = [
			attributes.src,
			attributes.srcset,
			attributes.crossorigin,
			attributes.referrerpolicy,
			base,
		];
		const oversized = sources.some(
			(value) => (value?.length ?? 0) > this.limits.maxUrlCodeUnits,
		);
		const selection = JSON.stringify([
			sources.map((value) =>
				value === undefined
					? null
					: [value.slice(0, this.limits.maxUrlCodeUnits), value.length],
			),
			picture,
		]);
		let entry = this.entries.get(id);
		if (entry?.selection === selection) return entry;
		if (!entry) {
			if (this.entries.size >= this.limits.maxElements)
				throw new AgentBrowserError(
					"resource-limit",
					"Image element limit exceeded",
				);
			entry = {
				id,
				controller: new AbortController(),
				version: 0,
				selection: "",
				url: "",
				state: "empty",
			};
			this.entries.set(id, entry);
		}
		if (++this.updates > this.limits.maxUpdates)
			throw new AgentBrowserError(
				"resource-limit",
				"Image update limit exceeded",
			);
		this.release(entry);
		entry.selection = selection;
		entry.version++;
		entry.url = "";
		entry.state = "empty";
		entry.error = undefined;
		try {
			if (oversized)
				throw new AgentBrowserError(
					"resource-limit",
					"Image source selection limit exceeded",
				);
			if (attributes.src === undefined && !attributes.srcset) return entry;
			if (!attributes.src?.trim())
				throw new AgentBrowserError("invalid-input", "Missing image source");
			if (attributes.src.length > this.limits.maxUrlCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Image URL limit exceeded",
				);
			const url = parseNetworkUrl(new URL(attributes.src, base).href);
			if (url.href.length > this.limits.maxUrlCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Image URL limit exceeded",
				);
			entry.url = url.href;
			url.hash = "";
			const resourceUrl = url.href;
			if (
				attributes.srcset ||
				picture ||
				attributes.crossorigin !== undefined ||
				attributes.referrerpolicy !== undefined
			)
				throw new AgentBrowserError(
					"unsupported",
					"Responsive image, CORS and referrer policy attributes are not implemented",
				);
			if (
				new URL(this.tree.url).protocol === "https:" &&
				url.protocol !== "https:"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Mixed-content image blocked",
				);
			if (blocked)
				throw new AgentBrowserError(
					"policy-denied",
					"Image CSP enforcement is not implemented",
				);
			if (!this.options.fetch)
				throw new AgentBrowserError(
					"unsupported",
					"Image fetch is unavailable",
				);
			let resource = this.resources.get(resourceUrl);
			if (!resource) {
				if (this.requests >= this.limits.maxRequests)
					throw new AgentBrowserError(
						"resource-limit",
						"Image request limit exceeded",
					);
				this.requests++;
				let resolve!: () => void;
				const promise = new Promise<void>((done) => {
					resolve = done;
				});
				resource = {
					url: resourceUrl,
					finalUrl: resourceUrl,
					originClean: false,
					state: "queued",
					consumers: new Set(),
					controller: new AbortController(),
					promise,
					resolve,
				};
				this.resources.set(resourceUrl, resource);
				this.queue.push(resource);
			}
			entry.resource = resource;
			resource.consumers.add(entry);
			entry.state = "loading";
			if (resource.state === "complete" || resource.state === "broken")
				this.finishEntry(entry, resource);
			this.pump();
		} catch (error) {
			entry.state = "broken";
			entry.error =
				error instanceof AgentBrowserError ? error.code : "invalid-input";
			this.events.push({ id, version: entry.version, type: "error" });
			this.schedule();
		}
		return entry;
	}
	private release(entry: Entry) {
		entry.controller.abort(
			new AgentBrowserError("aborted", "Image source changed"),
		);
		entry.controller = new AbortController();
		const resource = entry.resource;
		entry.resource = undefined;
		if (!resource) return;
		resource.consumers.delete(entry);
		if (resource.consumers.size) return;
		resource.controller.abort(
			new AgentBrowserError("aborted", "Image source no longer used"),
		);
		resource.resolve();
		if (resource.decoded)
			this.decodedBytes -= resource.decoded.image.pixels.length;
		resource.decoded = undefined;
		if (this.resources.get(resource.url) === resource)
			this.resources.delete(resource.url);
	}
	private pump() {
		while (
			!this.closed &&
			!this.failure &&
			this.active < this.limits.maxConcurrent &&
			this.queue.length
		) {
			const resource = this.queue.shift() as Resource;
			if (!resource.consumers.size) continue;
			resource.state = "loading";
			this.active++;
			void this.load(resource)
				.finally(() => {
					this.active--;
					this.pump();
				})
				.catch((error) => this.halt(error));
		}
	}
	private async load(resource: Resource) {
		const timer = setTimeout(
			() =>
				resource.controller.abort(
					new AgentBrowserError("timeout", "Image request timed out"),
				),
			this.limits.timeoutMs,
		);
		try {
			if (resource.controller.signal.aborted)
				throw abortError(resource.controller.signal);
			if (this.receivedBytes >= this.limits.maxReceivedBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Image received byte limit exhausted",
				);
			const response = await withImageAbort(
				(this.options.fetch as ImageFetch)(
					resource.url,
					resource.controller.signal,
				),
				resource.controller.signal,
			);
			if (this.closed || !resource.consumers.size) return;
			if (!(response.body instanceof Uint8Array))
				throw new AgentBrowserError("invalid-input", "Invalid image body");
			this.receivedBytes += response.body.length;
			if (
				response.body.length > this.limits.maxResponseBytes ||
				this.receivedBytes > this.limits.maxReceivedBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Image encoded byte limit exceeded",
				);
			if (response.status < 200 || response.status >= 300)
				throw new AgentBrowserError("network-error", "Image response failed");
			const types = response.headers["content-type"];
			const mediaType =
				types?.length === 1
					? types[0].split(";", 1)[0].trim().toLowerCase()
					: "";
			if (
				types?.length !== 1 ||
				!imageMediaTypes.includes(mediaType as ImageMediaType)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Image response MIME is not a supported PNG or JPEG type",
				);
			const finalUrl = parseNetworkUrl(response.url);
			if (
				new URL(this.tree.url).protocol === "https:" &&
				finalUrl.protocol !== "https:"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Mixed-content image redirect blocked",
				);
			const remainingPixels = Math.floor(
				(this.limits.maxDecodedBytes - this.decodedBytes) / 4,
			);
			if (remainingPixels < 1)
				throw new AgentBrowserError(
					"resource-limit",
					"Image decoded byte limit exceeded",
				);
			const decoded = decodeImage(response.body, mediaType, {
				maxWork: this.limits.maxDecodeWork,
				maxPixels: remainingPixels,
			});
			this.decodeWork += decoded.work;
			if (
				this.decodedBytes + decoded.image.pixels.length >
				this.limits.maxDecodedBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Image decoded byte limit exceeded",
				);
			const originClean = [
				resource.url,
				finalUrl.href,
				...response.redirects.map((redirect) => redirect.url),
			].every(
				(url) => parseNetworkUrl(url).origin === new URL(this.tree.url).origin,
			);
			resource.decoded = decoded;
			resource.finalUrl = finalUrl.href;
			resource.state = "complete";
			resource.originClean = originClean;
			this.decodedBytes += decoded.image.pixels.length;
		} catch (error) {
			resource.state = "broken";
			resource.error =
				error instanceof AgentBrowserError ? error.code : "network-error";
		} finally {
			clearTimeout(timer);
			if (!this.closed && resource.consumers.size) {
				for (const entry of resource.consumers)
					this.finishEntry(entry, resource);
				this.tree.invalidatePresentation();
			}
			resource.resolve();
		}
	}
	private finishEntry(entry: Entry, resource: Resource) {
		entry.state = resource.state === "complete" ? "complete" : "broken";
		entry.error = resource.error;
		this.events.push({
			id: entry.id,
			version: entry.version,
			type: entry.state === "complete" ? "load" : "error",
		});
		this.schedule();
	}
	private schedule() {
		if (this.closed || this.failure || this.timer !== undefined) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			try {
				this.refresh();
			} catch (error) {
				this.halt(error);
				return;
			}
			void this.deliver().catch((error) => this.halt(error));
		}, 0);
	}
	private deliver(): Promise<void> {
		if (this.running) return this.running;
		const run = async () => {
			const events = documentInteractions(this.tree).events;
			while (!this.closed && this.events.length) {
				const pending = this.events.shift() as {
					id: number;
					version: number;
					type: string;
				};
				await events.whenIdle(this.controller.signal);
				if (this.closed) return;
				const entry = this.update(pending.id);
				if (entry.version !== pending.version) continue;
				this.delivered++;
				await events.dispatchEventAsync(
					pending.id,
					new BrowserEvent(pending.type),
					this.controller.signal,
				);
			}
		};
		this.running = run().finally(() => {
			this.running = undefined;
			if (this.dirty || this.events.length) this.schedule();
		});
		return this.running;
	}
	private halt(error: unknown) {
		if (this.closed) return;
		this.failure =
			error instanceof AgentBrowserError
				? error
				: new AgentBrowserError("unsupported", "Image owner delivery failed");
		this.close();
	}
}

const owners = new WeakMap<DocumentTree, DocumentImages>();
export function documentImages(
	tree: DocumentTree,
	options?: DocumentImageOptions,
): DocumentImages {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentImages(tree, options);
		owners.set(tree, owner);
	} else if (options !== undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Image owner is already configured",
		);
	return owner;
}
