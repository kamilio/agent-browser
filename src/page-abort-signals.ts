import { types as nodeTypes } from "node:util";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export interface PageAbortSignal {
	readonly aborted: boolean;
	readonly reason: unknown;
	subscribe(listener: (reason: unknown) => void): () => void;
}

export interface PageAbortSignalLimits {
	maxSignals: number;
	maxSubscriptions: number;
}

const defaults: Readonly<PageAbortSignalLimits> = Object.freeze({
	maxSignals: 256,
	maxSubscriptions: 1024,
});
const abortedGetter = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;
const reasonGetter = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"reason",
)?.get;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
const nativeAbortSignal = AbortSignal;
const followSignal = AbortSignal.any;
const publishedCapabilities = new WeakSet<object>();
const maxPublications = 1024;

interface SignalRecord {
	native?: AbortSignal;
	ready: boolean;
	listening: boolean;
	listener: () => void;
	subscribers: Set<(reason: unknown) => void>;
	view: PageAbortSignal;
	capability?: object;
}

function nativeAborted(signal: AbortSignal): boolean {
	if (!abortedGetter) throw new TypeError("Native AbortSignal is unavailable");
	return Reflect.apply(abortedGetter, signal, []) as boolean;
}

function nativeReason(signal: AbortSignal): unknown {
	if (!reasonGetter) throw new TypeError("Native AbortSignal is unavailable");
	return Reflect.apply(reasonGetter, signal, []);
}

function requireNativeStateAccess(
	signal: object,
	name: "aborted" | "reason",
	getter: (() => unknown) | undefined,
) {
	let current: object | null = signal;
	for (let depth = 0; current !== null && depth < 64; depth++) {
		if (nodeTypes.isProxy(current)) throw new TypeError();
		const descriptor = Object.getOwnPropertyDescriptor(current, name);
		if (descriptor !== undefined) {
			if (!getter || descriptor.get !== getter || "value" in descriptor)
				throw new TypeError();
			return;
		}
		current = Object.getPrototypeOf(current);
	}
	throw new TypeError();
}

function limitsFrom(
	input: Partial<PageAbortSignalLimits>,
): Readonly<PageAbortSignalLimits> {
	try {
		if (!input || typeof input !== "object" || nodeTypes.isProxy(input))
			throw new TypeError();
		const prototype = Object.getPrototypeOf(input);
		if (prototype !== null && prototype !== Object.prototype)
			throw new TypeError();
		const result = { ...defaults };
		for (const key of Reflect.ownKeys(input)) {
			if (key !== "maxSignals" && key !== "maxSubscriptions")
				throw new TypeError();
			const descriptor = Object.getOwnPropertyDescriptor(input, key);
			if (!descriptor || !("value" in descriptor)) throw new TypeError();
			const value: unknown = descriptor.value;
			if (
				typeof value !== "number" ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > defaults[key]
			)
				throw new TypeError();
			result[key] = value;
		}
		return Object.freeze(result);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid page abort signal limits",
		);
	}
}

export class PageAbortSignals {
	readonly limits: Readonly<PageAbortSignalLimits>;
	private readonly records = new Set<SignalRecord>();
	private nativeRecords = new WeakMap<AbortSignal, SignalRecord>();
	private capabilities = new WeakMap<object, SignalRecord>();
	private subscriptions = 0;
	private created = 0;
	private closedValue = false;
	private unregisterClose: () => unknown = () => {};

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		limits: Partial<PageAbortSignalLimits> = {},
	) {
		this.limits = limitsFrom(limits);
		if (typeof followSignal !== "function" || !abortedGetter || !reasonGetter)
			throw new AgentBrowserError(
				"unsupported",
				"Native AbortSignal following is unavailable",
			);
		if (!factory || typeof factory.createHostObject !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid abort signal host factory",
			);
		const unregister = tree.onClose(() => this.close());
		if (typeof unregister !== "function") {
			this.close();
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid abort signal cleanup registration",
			);
		}
		this.unregisterClose = unregister;
		if (this.closedValue) unregister();
	}

	isFor(tree: DocumentTree): boolean {
		return this.tree === tree;
	}

	publish(signal: AbortSignal): object {
		this.ensureOpen();
		try {
			if (!signal || typeof signal !== "object" || nodeTypes.isProxy(signal))
				throw new TypeError();
			requireNativeStateAccess(signal, "aborted", abortedGetter);
			requireNativeStateAccess(signal, "reason", reasonGetter);
			nativeAborted(signal);
			nativeReason(signal);
		} catch {
			throw new TypeError("An approved native AbortSignal is required");
		}
		const existing = this.nativeRecords.get(signal);
		if (existing) {
			this.ensureRecord(existing);
			if (!existing.capability)
				throw new AgentBrowserError(
					"unsupported",
					"Abort signal publication is incomplete",
				);
			return existing.capability;
		}
		if (
			this.records.size >= this.limits.maxSignals ||
			this.created >= maxPublications
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page abort signal limit exceeded",
			);
		const owner = this;
		this.created++;
		let followed: AbortSignal;
		try {
			followed = Reflect.apply(followSignal, nativeAbortSignal, [
				[signal],
			]) as AbortSignal;
		} catch {
			throw new AgentBrowserError(
				"unsupported",
				"Abort signal following failed",
			);
		}
		const record: SignalRecord = {
			native: followed,
			ready: false,
			listening: false,
			subscribers: new Set(),
			listener: () => {
				if (
					!this.closedValue &&
					record.ready &&
					record.native &&
					nativeAborted(record.native)
				)
					this.notify(record, nativeReason(record.native));
			},
			view: Object.freeze({
				get aborted() {
					owner.ensureRecord(record);
					return nativeAborted(owner.source(record));
				},
				get reason() {
					owner.ensureRecord(record);
					return nativeReason(owner.source(record));
				},
				subscribe: (listener: (reason: unknown) => void) =>
					this.subscribe(record, listener),
			}),
		};
		this.records.add(record);
		this.nativeRecords.set(signal, record);
		try {
			const capability = this.factory.createHostObject({
				properties: {
					aborted: { get: () => record.view.aborted },
					reason: { get: () => record.view.reason },
				},
				methods: {
					throwIfAborted: () => {
						if (record.view.aborted) throw record.view.reason;
					},
				},
			});
			this.ensureOpen();
			if (
				!capability ||
				typeof capability !== "object" ||
				nodeTypes.isProxy(capability) ||
				publishedCapabilities.has(capability)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid abort signal capability",
				);
			record.capability = capability;
			record.ready = true;
			this.capabilities.set(capability, record);
			publishedCapabilities.add(capability);
			return capability;
		} catch {
			record.ready = false;
			record.native = undefined;
			this.records.delete(record);
			this.nativeRecords.delete(signal);
			if (this.closedValue)
				throw new AgentBrowserError("closed", "Page abort signals are closed");
			throw new AgentBrowserError(
				"unsupported",
				"Abort signal publication failed",
			);
		}
	}

	resolve(capability: unknown): PageAbortSignal {
		this.ensureOpen();
		const record =
			capability && typeof capability === "object"
				? this.capabilities.get(capability)
				: undefined;
		if (!record)
			throw new TypeError("AbortSignal does not belong to this document");
		this.ensureRecord(record);
		return record.view;
	}

	metrics() {
		return Object.freeze({
			signals: this.records.size,
			subscriptions: this.subscriptions,
			created: this.created,
			closed: this.closedValue,
			partial: true as const,
		});
	}

	close(): void {
		if (this.closedValue) return;
		this.closedValue = true;
		this.capabilities = new WeakMap();
		this.nativeRecords = new WeakMap();
		const reason = new AgentBrowserError(
			"closed",
			"Page abort signals are closed",
		);
		for (const record of this.records) {
			record.ready = false;
			this.notify(
				record,
				record.native && nativeAborted(record.native)
					? nativeReason(record.native)
					: reason,
			);
			record.native = undefined;
		}
		this.records.clear();
		const unregister = this.unregisterClose;
		this.unregisterClose = () => {};
		try {
			unregister();
		} catch {
			throw new AgentBrowserError("unsupported", "Abort signal cleanup failed");
		}
	}

	private ensureOpen() {
		if (this.closedValue)
			throw new AgentBrowserError("closed", "Page abort signals are closed");
	}

	private ensureRecord(record: SignalRecord) {
		this.ensureOpen();
		if (!record.ready || !this.records.has(record))
			throw new AgentBrowserError(
				"invalid-input",
				"Abort signal is not published",
			);
	}

	private source(record: SignalRecord): AbortSignal {
		this.ensureRecord(record);
		if (!record.native)
			throw new AgentBrowserError("closed", "Page abort signals are closed");
		return record.native;
	}

	private subscribe(
		record: SignalRecord,
		listener: (reason: unknown) => void,
	): () => void {
		this.ensureRecord(record);
		if (typeof listener !== "function")
			throw new TypeError("Invalid abort listener");
		const native = this.source(record);
		if (nativeAborted(native)) {
			this.deliver(listener, nativeReason(native));
			return () => {};
		}
		if (this.subscriptions >= this.limits.maxSubscriptions)
			throw new AgentBrowserError(
				"resource-limit",
				"Page abort subscription limit exceeded",
			);
		const subscription = (reason: unknown) => listener(reason);
		record.subscribers.add(subscription);
		this.subscriptions++;
		try {
			if (!record.listening) {
				record.listening = true;
				Reflect.apply(addListener, native, ["abort", record.listener]);
			}
			if (nativeAborted(native)) this.notify(record, nativeReason(native));
		} catch {
			if (record.subscribers.delete(subscription)) this.subscriptions--;
			if (record.subscribers.size === 0) this.stopListening(record);
			throw new AgentBrowserError(
				"unsupported",
				"Abort subscription registration failed",
			);
		}
		return () => {
			if (!record.subscribers.delete(subscription)) return;
			this.subscriptions--;
			if (record.subscribers.size === 0) this.stopListening(record);
		};
	}

	private stopListening(record: SignalRecord) {
		if (!record.listening) return;
		record.listening = false;
		if (record.native)
			Reflect.apply(removeListener, record.native, ["abort", record.listener]);
	}

	private notify(record: SignalRecord, reason: unknown) {
		this.stopListening(record);
		for (const listener of [...record.subscribers]) {
			if (!record.subscribers.delete(listener)) continue;
			this.subscriptions--;
			this.deliver(listener, reason);
		}
	}

	private deliver(listener: (reason: unknown) => void, reason: unknown) {
		try {
			listener(reason);
		} catch {}
	}
}
