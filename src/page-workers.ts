import { types } from "node:util";
import {
	type BrowserIdentity,
	browserIdentityHeaders,
	defaultBrowserIdentity,
} from "./browser-identity.js";
import { AgentBrowserError } from "./errors.js";
import type { PageBlobs } from "./page-blobs.js";
import { PageBlobs as WorkerBlobs } from "./page-blobs.js";
import { PageClock, createPagePerformance } from "./page-performance.js";
import { PageTimers } from "./page-timers.js";
import { PageUrls } from "./page-urls.js";
import { pageWasmBootstrapSource } from "./page-wasm-bootstrap.js";
import { PageWasm, type PageWasmBudget } from "./page-wasm.js";
import { workerGlobalBootstrapSource } from "./page-worker-bootstrap.js";
import { PageWorkerImports } from "./page-worker-imports.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedRealm,
} from "./safejs-extension-types.js";
import type { SafeJsBudget, ScriptLimits } from "./safejs.js";
import type {
	WorkerImportFetch,
	WorkerImportPolicy,
	WorkerScriptFetch,
	WorkerScriptSource,
} from "./worker-fetch.js";

export interface WorkerBudget extends SafeJsBudget {
	forkRealm(): WorkerBudget;
	setRetainedDataUsage(owner: object, usage: number): void;
	acquireRealmOwner(): unknown;
}
export interface PageWorkerOptions {
	core: ReleasedCore;
	budget: WorkerBudget;
	limits: Readonly<ScriptLimits>;
	documentUrl: string;
	identity?: Readonly<BrowserIdentity>;
	policy(url: string, redirects?: number): void;
	fetch?: WorkerScriptFetch;
	importFetch?: WorkerImportFetch;
	importPolicy?: WorkerImportPolicy;
	stringCompilation?: "allow" | "deny";
	wasmCompilation?: "allow" | "deny";
	webAssembly?: "bounded-v1";
	report(message: string): void;
	fail(error: unknown): void;
}
export const pageWorkerLimits = Object.freeze({
	active: 4,
	created: 16,
	messages: 4096,
	transfers: 64,
	pending: 64,
	messageUnits: 65536,
	queuedUnits: 262144,
	depth: 128,
});
const nativeClone = structuredClone;
function intrinsicGetter<Value>(
	prototype: object,
	name: string,
): (this: object) => Value {
	const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
	if (!getter) throw new TypeError("Missing Worker intrinsic getter");
	return getter;
}
const bufferLength = intrinsicGetter<number>(
	ArrayBuffer.prototype,
	"byteLength",
);
const typedBuffer = intrinsicGetter<object>(
	Object.getPrototypeOf(Uint8Array.prototype),
	"buffer",
);
const viewBuffer = intrinsicGetter<object>(DataView.prototype, "buffer");
const regexpSource = intrinsicGetter<string>(RegExp.prototype, "source");
const decoder = new TextDecoder();
interface WorkerRecord {
	url: string;
	name: string;
	state: "loading" | "ready" | "closing" | "closed" | "terminated";
	controller: AbortController;
	dispatch?: unknown;
	receive?: unknown;
	self?: object;
	context?: ReleasedContext;
	realm?: ReleasedRealm;
	timers?: PageTimers;
	initialization?: Promise<void>;
	closing?: Promise<void>;
	prefixes: Set<Promise<void>>;
	outgoing: number;
	disposed: boolean;
	stringCompilation?: "allow" | "deny";
	wasmCompilation: "allow" | "deny";
	importPolicy?: WorkerImportPolicy;
	imports?: PageWorkerImports;
}
interface Packet {
	record: WorkerRecord;
	outgoing: boolean;
	data: { type: "message" | "error"; data?: unknown; message?: string };
	units: number;
	released: boolean;
}
function limited(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Worker resource limit exceeded",
	);
}
function cloneError(): never {
	throw new TypeError("Worker message is not cloneable");
}
function messageUnits(value: unknown): number {
	const pending: [unknown, number][] = [[value, 0]];
	const seen = new WeakSet<object>();
	let units = 0;
	while (pending.length) {
		const item = pending.pop();
		if (!item) break;
		const [data, depth] = item;
		if (depth > pageWorkerLimits.depth) limited();
		if (typeof data === "function" || typeof data === "symbol") cloneError();
		if (typeof data === "string") units += data.length;
		else if (data !== null && typeof data === "object") {
			if (types.isProxy(data)) cloneError();
			if (seen.has(data)) continue;
			seen.add(data);
			units++;
			if (types.isArrayBuffer(data)) units += bufferLength.call(data);
			else if (ArrayBuffer.isView(data)) {
				const buffer = (types.isDataView(data) ? viewBuffer : typedBuffer).call(
					data,
				);
				if (!types.isArrayBuffer(buffer)) cloneError();
				// Cloning even a small view copies its entire backing buffer.
				pending.push([buffer, depth + 1]);
			} else if (types.isMap(data)) {
				for (const [key, entry] of Map.prototype.entries.call(data)) {
					pending.push([key, depth + 1], [entry, depth + 1]);
					units += 2;
					if (units > pageWorkerLimits.messageUnits) limited();
				}
			} else if (types.isSet(data)) {
				for (const entry of Set.prototype.values.call(data)) {
					pending.push([entry, depth + 1]);
					units++;
					if (units > pageWorkerLimits.messageUnits) limited();
				}
			} else if (types.isDate(data)) units += 8;
			else if (types.isRegExp(data))
				units += regexpSource.call(data).length + 8;
			else {
				const prototype = Object.getPrototypeOf(data);
				if (
					!Array.isArray(data) &&
					prototype !== Object.prototype &&
					prototype !== null
				)
					cloneError();
				for (const key of Object.keys(data)) {
					const descriptor = Object.getOwnPropertyDescriptor(data, key);
					if (!descriptor || !Object.hasOwn(descriptor, "value")) cloneError();
					units += key.length + 1;
					if (units > pageWorkerLimits.messageUnits) limited();
					pending.push([descriptor.value, depth + 1]);
				}
			}
		} else units++;
		if (units > pageWorkerLimits.messageUnits) limited();
	}
	return units;
}
function fatal(error: unknown): boolean {
	if (!error || typeof error !== "object" || types.isProxy(error)) return false;
	const code = Object.getOwnPropertyDescriptor(error, "code")?.value;
	return code === "budgetExceeded" || code === "reentry";
}
function awaitSource(
	operation: Promise<Readonly<WorkerScriptSource>>,
	signal: AbortSignal,
): Promise<Readonly<WorkerScriptSource>> {
	return new Promise((resolve, reject) => {
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
}

export class PageWorkers {
	readonly port: object;
	private readonly records = new Set<WorkerRecord>();
	private readonly queue: Packet[] = [];
	private readonly packets = new Set<Packet>();
	private readonly results = new Set<Promise<unknown>>();
	private tick?: ReturnType<typeof setTimeout>;
	private readonly running = new Set<object>();
	private closed = false;
	private readonly identity: Readonly<BrowserIdentity>;
	private readonly webAssembly: boolean;
	private readonly bootstrapSource: string;
	private created = 0;
	private messages = 0;
	private retainedUnits = 0;
	constructor(
		private readonly owner: ReleasedContext,
		private readonly blobs: PageBlobs,
		private readonly options: PageWorkerOptions,
	) {
		this.ensureOpen();
		if (
			options.webAssembly !== undefined &&
			options.webAssembly !== "bounded-v1"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid Worker WASM installation policy",
			);
		if (
			options.wasmCompilation !== undefined &&
			options.wasmCompilation !== "allow" &&
			options.wasmCompilation !== "deny"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid Worker WASM compilation policy",
			);
		this.webAssembly = options.webAssembly === "bounded-v1";
		this.bootstrapSource =
			workerGlobalBootstrapSource +
			(this.webAssembly ? pageWasmBootstrapSource : "");
		this.identity = options.identity ?? defaultBrowserIdentity;
		browserIdentityHeaders(this.identity);
		this.port = owner.createHostObject({
			properties: {
				baseUrl: {
					get: () => {
						this.ensureOpen();
						return options.documentUrl;
					},
				},
			},
			methods: {
				create: (url, name, dispatch) => {
					try {
						return this.create(url, name, dispatch);
					} catch (error) {
						if (typeof dispatch === "function" && !owner.signal.aborted) {
							try {
								owner.releaseCallback(dispatch);
							} catch {}
						}
						throw error;
					}
				},
				report: (message) => this.report(message),
			},
		});
	}
	metrics() {
		return {
			closed: this.closed,
			active: this.records.size,
			created: this.created,
			messages: this.messages,
			queued: this.queue.length,
			pending: this.packets.size,
			retainedUnits: this.retainedUnits,
		};
	}
	async close() {
		if (this.closed) {
			await Promise.allSettled([...this.results]);
			return;
		}
		this.closed = true;
		clearTimeout(this.tick);
		this.tick = undefined;
		await Promise.allSettled(
			[...this.records].map((record) => this.terminate(record)),
		);
		for (const packet of [...this.packets]) this.release(packet);
		this.queue.length = 0;
		await Promise.allSettled([...this.results]);
	}
	private ensureOpen() {
		if (this.closed || this.owner.signal.aborted)
			throw new AgentBrowserError("closed", "Worker owner is closed");
	}
	private report(input: unknown) {
		if (typeof input !== "string" || input.length > 4096)
			throw new TypeError("Invalid Worker diagnostic");
		if (!this.closed && !this.owner.signal.aborted) this.options.report(input);
	}
	private create(input: unknown, name: unknown, dispatch: unknown): object {
		this.ensureOpen();
		if (
			typeof input !== "string" ||
			typeof name !== "string" ||
			input.length > 4096 ||
			name.length > 4096 ||
			typeof dispatch !== "function"
		)
			throw new TypeError("Invalid Worker input");
		if (
			this.records.size >= pageWorkerLimits.active ||
			this.created >= pageWorkerLimits.created
		)
			limited();
		const url = new URL(input);
		this.options.policy(url.href);
		let source: string | undefined;
		if (url.protocol === "blob:") {
			const blob = this.blobs.resolveObjectUrl(url.href);
			if (!blob)
				throw new TypeError(
					"Worker Blob URL is revoked or belongs to another page",
				);
			// Classic Worker MIME checks apply only to HTTP(S), not Blob sources.
			source = decoder.decode(blob.bytes);
		} else {
			if (
				!["https:", "http:"].includes(url.protocol) ||
				url.username ||
				url.password ||
				url.origin !== new URL(this.options.documentUrl).origin
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Classic Worker source must be same-origin",
				);
			if (!this.options.fetch)
				throw new AgentBrowserError(
					"unsupported",
					"Worker network loader is unavailable",
				);
		}
		if (
			source !== undefined &&
			source.length + this.bootstrapSource.length >
				this.options.limits.maxSourceCodeUnits
		)
			limited();
		const record: WorkerRecord = {
			url: url.href,
			name,
			state: "loading",
			controller: new AbortController(),
			dispatch,
			prefixes: new Set(),
			outgoing: 0,
			disposed: false,
			stringCompilation: this.options.stringCompilation,
			wasmCompilation: this.options.wasmCompilation ?? "allow",
			importPolicy: this.options.importPolicy,
		};
		const port = this.owner.createHostObject({
			properties: {
				accepting: {
					get: () => {
						this.ensureOpen();
						return record.state === "ready" || record.state === "loading";
					},
				},
			},
			methods: {
				post: (data) => this.post(record, false, data),
				terminate: () => {
					this.ensureOpen();
					void this.terminate(record);
				},
			},
		});
		this.records.add(record);
		this.created++;
		// Begin outside the parent's host call; source bytes were snapshotted above.
		record.initialization = Promise.resolve().then(() =>
			this.load(record, source),
		);
		void record.initialization.catch((error) => this.failure(record, error));
		return port;
	}
	private async load(record: WorkerRecord, snapshot: string | undefined) {
		let source = snapshot;
		if (this.closed || this.owner.signal.aborted || record.state !== "loading")
			return;
		const timeout = setTimeout(
			() =>
				this.failure(
					record,
					new AgentBrowserError("timeout", "Worker initialization timed out"),
				),
			this.options.limits.timeoutMs,
		);
		try {
			if (source === undefined) {
				const fetch = this.options.fetch;
				if (!fetch) throw new TypeError("Worker network loader is unavailable");
				const loaded = await awaitSource(
					fetch(record.url, record.controller.signal),
					record.controller.signal,
				);
				if (
					this.closed ||
					this.owner.signal.aborted ||
					record.state !== "loading"
				)
					return;
				const final = new URL(loaded.url);
				if (
					final.origin !== new URL(this.options.documentUrl).origin ||
					!["https:", "http:"].includes(final.protocol) ||
					final.username ||
					final.password
				)
					throw new AgentBrowserError(
						"policy-denied",
						"Worker loader returned a foreign source",
					);
				const redirects = loaded.redirectCount ?? 0;
				if (!Number.isSafeInteger(redirects) || redirects < 0 || redirects > 20)
					throw new TypeError("Invalid Worker redirect count");
				this.options.policy(final.href, redirects);
				if (
					typeof loaded.source !== "string" ||
					loaded.source.length + this.bootstrapSource.length >
						this.options.limits.maxSourceCodeUnits
				)
					limited();
				if (
					loaded.stringCompilation !== "allow" &&
					loaded.stringCompilation !== "deny"
				)
					throw new TypeError("Invalid Worker source policy");
				if (
					this.webAssembly &&
					loaded.wasmCompilation !== "allow" &&
					loaded.wasmCompilation !== "deny"
				)
					throw new TypeError("Invalid Worker WASM source policy");
				record.wasmCompilation =
					record.wasmCompilation === "deny" || loaded.wasmCompilation === "deny"
						? "deny"
						: "allow";
				record.url = final.href;
				if (
					loaded.checkImport !== undefined &&
					typeof loaded.checkImport !== "function"
				)
					throw new TypeError("Invalid Worker import policy");
				record.importPolicy = loaded.checkImport;
				record.stringCompilation =
					record.stringCompilation === "deny"
						? "deny"
						: loaded.stringCompilation;
				source = loaded.source;
			}
			await this.initialize(record, source);
		} finally {
			clearTimeout(timeout);
		}
	}
	private async initialize(record: WorkerRecord, source: string) {
		if (this.closed || this.owner.signal.aborted || record.state !== "loading")
			return;
		const budget = this.options.budget.forkRealm();
		const webAssembly = this.webAssembly;
		const capabilities = [
			"guest:retain",
			"source:nested",
			...(webAssembly ? ["array-buffer:share"] : []),
		];
		const extension = this.options.core.defineExtension({
			manifest: {
				version: 1,
				name: "agent-browser-worker",
				globals: [
					"__agentBrowserWorker",
					...(webAssembly ? ["__agentBrowserWasm"] : []),
				],
				capabilities,
			},
			setup: (context) => {
				record.context = context;
				const wasm = webAssembly
					? new PageWasm(
							context,
							budget as typeof budget & PageWasmBudget,
							undefined,
							record.wasmCompilation,
						)
					: undefined;
				const identity = this.identity;
				const clock = new PageClock();
				context.onCleanup(() => clock.close());
				const performance = createPagePerformance(context, clock);
				const urls = new PageUrls(context);
				const blobs = new WorkerBlobs(
					context,
					() => new URL(record.url).origin,
				);
				const imports = new PageWorkerImports(context, [blobs, this.blobs], {
					url: record.url,
					documentUrl: this.options.documentUrl,
					budget: this.options.budget,
					limits: this.options.limits,
					fetch: this.options.importFetch,
					isClosed: () =>
						record.state !== "loading" && record.state !== "ready",
					policy: (url, redirects) => {
						if (!record.importPolicy)
							throw new AgentBrowserError(
								"policy-denied",
								"Worker import CSP is unavailable",
							);
						record.importPolicy(url, redirects);
					},
				});
				record.imports = imports;
				context.onCleanup(() => {
					imports.close();
					urls.close();
					blobs.close();
				});
				const aborted = () => this.failure(record, context.signal.reason);
				context.signal.addEventListener("abort", aborted, { once: true });
				context.onCleanup(() =>
					context.signal.removeEventListener("abort", aborted),
				);
				const timers = new PageTimers(
					{
						isClosed: () =>
							context.signal.aborted ||
							(record.state !== "ready" && record.state !== "loading"),
						isBusy: () => record.state === "loading",
						startCallback: (callback, args, receiver) =>
							this.invoke(record, callback, args, receiver.thisValue),
					},
					() => {
						if (!record.self) throw new TypeError("Worker global is not bound");
						return record.self;
					},
					(error) => this.failure(record, error),
					{ maxActive: 32, maxScheduled: 1024, maxCallbacks: 512 },
					(reference) => {
						if (!context.signal.aborted)
							context.releaseGuestReference(reference);
					},
				);
				record.timers = timers;
				context.onCleanup(() => timers.close());
				const location = new URL(record.url);
				return {
					globals: {
						...(wasm ? { __agentBrowserWasm: wasm.port } : {}),
						__agentBrowserWorker: context.createHostObject({
							properties: {
								urls: { get: () => urls.port },
								blobs: { get: () => blobs.port },
								name: { get: () => record.name },
								performance: { get: () => performance },
								navigator: {
									get: () => ({
										userAgent: identity.userAgent,
										language: identity.language,
										languages: identity.languages,
									}),
								},
								location: {
									get: () => ({
										href: location.href,
										origin: location.origin,
										protocol: location.protocol,
										host: location.host,
										hostname: location.hostname,
										port: location.port,
										pathname: location.pathname,
										search: location.search,
										hash: location.hash,
									}),
								},
								accepting: {
									get: () =>
										record.state === "ready" || record.state === "loading",
								},
							},
							methods: {
								importScripts: imports.operation,
								bind: (callback) => {
									if (
										record.receive !== undefined ||
										typeof callback !== "function"
									)
										throw new TypeError("Invalid worker callback registration");
									record.receive = callback;
								},
								bindSelf: context.retainGuestArguments((reference) => {
									if (record.self !== undefined) {
										context.releaseGuestReference(reference);
										throw new TypeError("Worker already bound");
									}
									record.self = reference as object;
								}, 0),
								post: (data) => this.post(record, true, data),
								close: () => this.closeSelf(record),
								report: (message) => this.report(message),
								setTimeout: context.retainGuestArguments(
									timers.methods.setTimeout,
									2,
								),
								setInterval: context.retainGuestArguments(
									timers.methods.setInterval,
									2,
								),
								clearTimeout: timers.methods.clearTimeout,
								clearInterval: timers.methods.clearInterval,
							},
						}),
					},
				};
			},
		});
		record.realm = this.options.core.createRealm({
			classicScripts: true,
			callbackScheduling: "after-prefix",
			stringCompilation: record.stringCompilation,
			extensions: [extension],
			grants: capabilities,
			budget,
			signal: record.controller.signal,
			limits: {
				extensions: 1,
				hostObjects: 128,
				callbacks: 1024,
				guestReferences: 128,
				cleanups: 8,
				nestedEvaluations: 8,
			},
			sink: {
				log: () => undefined,
				error: () => this.report("Worker console error"),
			},
		});
		const result = await record.realm.evaluate(this.bootstrapSource + source, {
			filename: record.url,
			discardResult: true,
		});
		if (!result.ok)
			throw new AgentBrowserError(
				"invalid-input",
				"Worker script execution failed",
			);
		if (record.state === "loading") {
			record.state = "ready";
			record.timers?.wake();
			this.wake();
		}
	}
	private post(record: WorkerRecord, outgoing: boolean, value: unknown) {
		this.ensureOpen();
		if (record.state !== "loading" && record.state !== "ready") return;
		this.enqueue(record, outgoing, { type: "message", data: value });
	}
	private enqueue(
		record: WorkerRecord,
		outgoing: boolean,
		data: Packet["data"],
	) {
		if (
			this.messages >= pageWorkerLimits.messages ||
			this.packets.size >= pageWorkerLimits.pending
		)
			limited();
		const units = messageUnits(data);
		if (units > pageWorkerLimits.queuedUnits - this.retainedUnits) limited();
		const packet: Packet = {
			record,
			outgoing,
			data: nativeClone(data),
			units,
			released: false,
		};
		this.options.budget.setRetainedDataUsage(packet, units);
		this.packets.add(packet);
		this.retainedUnits += units;
		this.messages++;
		if (outgoing) record.outgoing++;
		this.queue.push(packet);
		this.wake();
	}
	private release(packet: Packet) {
		if (packet.released) return;
		packet.released = true;
		this.options.budget.setRetainedDataUsage(packet, 0);
		this.packets.delete(packet);
		this.retainedUnits -= packet.units;
		if (packet.outgoing) packet.record.outgoing--;
		this.retire(packet.record);
	}
	private wake() {
		if (
			this.closed ||
			this.owner.signal.aborted ||
			this.tick !== undefined ||
			!this.queue.length
		)
			return;
		if (!this.queue.some((packet) => this.deliverable(packet))) return;
		this.tick = setTimeout(() => {
			this.tick = undefined;
			void this.pump();
		}, 0);
	}
	private deliveryOwner(packet: Packet): object {
		return packet.outgoing ? this.owner : packet.record;
	}
	private deliverable(packet: Packet): boolean {
		return (
			(packet.outgoing || packet.record.state !== "loading") &&
			!this.running.has(this.deliveryOwner(packet))
		);
	}
	private async pump() {
		if (this.closed || this.owner.signal.aborted) return;
		const index = this.queue.findIndex((packet) => this.deliverable(packet));
		const packet = index < 0 ? undefined : this.queue.splice(index, 1)[0];
		if (!packet) return;
		const owner = this.deliveryOwner(packet);
		this.running.add(owner);
		// Each realm preserves its own task order. Another realm may still deliver
		// messages while this realm's synchronous prefix waits on native I/O.
		this.wake();
		try {
			const record = packet.record;
			if (
				record.state === "terminated" ||
				(!packet.outgoing && record.state !== "ready")
			) {
				this.release(packet);
				return;
			}
			const callback = packet.outgoing ? record.dispatch : record.receive;
			const invocation = packet.outgoing
				? this.owner.startCallback(callback, { args: [packet.data] })
				: this.invoke(record, callback, [packet.data], undefined);
			const result = invocation.result
				.catch((error) => {
					if (
						!this.closed &&
						record.state !== "terminated" &&
						record.state !== "closed"
					)
						this.failure(record, error);
				})
				.finally(() => {
					this.release(packet);
					this.results.delete(result);
				});
			this.results.add(result);
			await invocation.synchronous;
		} catch (error) {
			if (packet) {
				this.release(packet);
				this.failure(packet.record, error);
			}
		} finally {
			this.running.delete(owner);
			this.wake();
		}
	}
	private invoke(
		record: WorkerRecord,
		callback: unknown,
		args: readonly unknown[],
		thisValue: unknown,
	) {
		if (!record.realm) throw new TypeError("Worker realm is not initialized");
		const invocation = record.realm.startCallback(callback, {
			args,
			thisValue,
		});
		record.prefixes.add(invocation.synchronous);
		void invocation.synchronous
			.finally(() => record.prefixes.delete(invocation.synchronous))
			.catch(() => undefined);
		const deadline = setTimeout(
			() =>
				this.failure(
					record,
					new AgentBrowserError("timeout", "Worker callback timed out"),
				),
			this.options.limits.timeoutMs,
		);
		void invocation.result
			.finally(() => clearTimeout(deadline))
			.catch(() => undefined);
		return invocation;
	}
	private failure(record: WorkerRecord, error: unknown) {
		if (
			this.closed ||
			this.owner.signal.aborted ||
			record.state === "terminated" ||
			record.state === "closed"
		)
			return;
		if (record.state === "closing" && !fatal(error)) return;
		record.imports?.close();
		if (fatal(error)) this.options.fail(error);
		else {
			try {
				this.enqueue(record, true, {
					type: "error",
					message: "Worker script execution failed",
				});
			} catch {
				this.options.fail(error);
			}
		}
		if (!record.realm) record.controller.abort(error);
		this.closeSelf(record);
		if (error instanceof AgentBrowserError && error.code === "timeout")
			record.controller.abort(error);
	}
	private closeSelf(record: WorkerRecord) {
		if (
			record.state === "terminated" ||
			record.state === "closed" ||
			record.state === "closing"
		)
			return;
		record.state = "closing";
		record.timers?.close();
		// Finish the current task's synchronous part, then cancel suspended tails.
		record.closing = Promise.resolve().then(async () => {
			await Promise.allSettled([record.initialization, ...record.prefixes]);
			await record.realm?.close();
			record.disposed = true;
			record.state = "closed";
			this.retire(record);
			this.wake();
		});
		void record.closing.catch(() => {
			record.disposed = true;
			record.state = "closed";
			this.retire(record);
		});
		this.wake();
	}
	private async terminate(record: WorkerRecord) {
		record.state = "terminated";
		record.imports?.close();
		record.controller.abort();
		record.timers?.close();
		for (let index = this.queue.length - 1; index >= 0; index--)
			if (this.queue[index].record === record)
				this.release(this.queue.splice(index, 1)[0]);
		try {
			await record.realm?.close();
			await record.initialization?.catch(() => undefined);
			await record.closing?.catch(() => undefined);
		} finally {
			record.disposed = true;
			record.state = "terminated";
			this.retire(record);
		}
	}
	private retire(record: WorkerRecord) {
		if (
			!record.disposed ||
			(record.state !== "terminated" && record.state !== "closed") ||
			record.outgoing
		)
			return;
		if (record.dispatch !== undefined && !this.owner.signal.aborted) {
			try {
				this.owner.releaseCallback(record.dispatch);
			} catch {}
		}
		record.dispatch = undefined;
		record.receive = undefined;
		record.self = undefined;
		this.records.delete(record);
	}
}
