import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface BrowserEventInit {
	bubbles?: boolean;
	cancelable?: boolean;
	composed?: boolean;
}

interface EventState {
	type: string;
	initialized: boolean;
	bubbles: boolean;
	cancelable: boolean;
	composed: boolean;
	timeStamp: number;
	target: number | null;
	currentTarget: number | null;
	phase: 0 | 1 | 2 | 3;
	path: number[];
	dispatching: boolean;
	canceled: boolean;
	stopped: boolean;
	immediate: boolean;
	passive: boolean;
}

const eventStates = new WeakMap<BrowserEvent, EventState>();

function stateOf(event: BrowserEvent) {
	const state = eventStates.get(event);
	if (!state)
		throw new AgentBrowserError("invalid-input", "Expected a browser event");
	return state;
}

export class BrowserEvent {
	constructor(type: string, init: BrowserEventInit = {}) {
		if (typeof type !== "string" || type.length > 256)
			throw new AgentBrowserError("invalid-input", "Invalid event type");
		if (!init || typeof init !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid event options");
		eventStates.set(this, {
			type,
			initialized: true,
			bubbles: Boolean(init.bubbles),
			cancelable: Boolean(init.cancelable),
			composed: Boolean(init.composed),
			timeStamp: performance.now(),
			target: null,
			currentTarget: null,
			phase: 0,
			path: [],
			dispatching: false,
			canceled: false,
			stopped: false,
			immediate: false,
			passive: false,
		});
	}

	static createLegacy(): BrowserEvent {
		const event = new BrowserEvent("");
		stateOf(event).initialized = false;
		return event;
	}

	get initialized() {
		return stateOf(this).initialized;
	}
	get type() {
		return stateOf(this).type;
	}
	get bubbles() {
		return stateOf(this).bubbles;
	}
	get cancelable() {
		return stateOf(this).cancelable;
	}
	get composed() {
		return stateOf(this).composed;
	}
	get timeStamp() {
		return stateOf(this).timeStamp;
	}
	get target() {
		return stateOf(this).target;
	}
	get currentTarget() {
		return stateOf(this).currentTarget;
	}
	get eventPhase() {
		return stateOf(this).phase;
	}
	get defaultPrevented() {
		return stateOf(this).canceled;
	}
	get isTrusted() {
		return false;
	}
	get cancelBubble() {
		return stateOf(this).stopped;
	}
	set cancelBubble(value: boolean) {
		if (value) this.stopPropagation();
	}
	get returnValue() {
		return !stateOf(this).canceled;
	}
	set returnValue(value: boolean) {
		if (!value) this.preventDefault();
	}

	initEvent(type: string, bubbles = false, cancelable = false): void {
		const state = stateOf(this);
		if (typeof type !== "string" || type.length > 256)
			throw new AgentBrowserError("invalid-input", "Invalid event type");
		if (state.dispatching) return;
		state.initialized = true;
		state.canceled = false;
		state.stopped = false;
		state.immediate = false;
		state.target = null;
		state.type = type;
		state.bubbles = Boolean(bubbles);
		state.cancelable = Boolean(cancelable);
	}

	preventDefault() {
		const state = stateOf(this);
		if (state.cancelable && !state.passive) state.canceled = true;
	}

	stopPropagation() {
		stateOf(this).stopped = true;
	}

	stopImmediatePropagation() {
		const state = stateOf(this);
		state.stopped = true;
		state.immediate = true;
	}

	composedPath() {
		return [...stateOf(this).path];
	}
}

export type BrowserEventListener =
	| ((this: number, event: BrowserEvent) => void)
	| { handleEvent(event: BrowserEvent): void };

type ControlledListener = (
	target: number,
	event: BrowserEvent,
) => Promise<void>;
const controlledListeners = new WeakMap<
	BrowserEventListener,
	ControlledListener
>();

export function controlledEventListener(
	invoke: ControlledListener,
): BrowserEventListener {
	if (typeof invoke !== "function")
		throw new AgentBrowserError("invalid-input", "Invalid controlled listener");
	const listener = Object.freeze({
		handleEvent() {
			throw new AgentBrowserError(
				"unsupported",
				"Controlled listeners require asynchronous dispatch",
			);
		},
	});
	controlledListeners.set(listener, invoke);
	return listener;
}

export interface BrowserListenerOptions {
	capture?: boolean;
	once?: boolean;
	passive?: boolean;
	signal?: AbortSignal;
}

export interface EventLimits {
	maxListeners: number;
	maxListenersPerNode: number;
	maxDispatchDepth: number;
	maxDispatchesPerTurn: number;
	maxInvocationsPerTurn: number;
	maxErrors: number;
}

export interface DocumentEventOptions {
	window?: boolean;
}

export interface BrowserListenerError {
	type: string;
	target: number;
	message: string;
}

interface ListenerRecord {
	target: number;
	type: string;
	callback: BrowserEventListener;
	capture: boolean;
	once: boolean;
	passive: boolean;
	removed: boolean;
	signal?: AbortSignal;
	abort?: () => void;
}

export class DocumentEvents {
	readonly limits: Readonly<EventLimits>;
	readonly windowTarget: number | null;
	private listeners = new Map<number, ListenerRecord[]>();
	private independentTargets = new Set<number>();
	private independentTargetCount = 0;
	private errors: BrowserListenerError[] = [];
	private listenerCount = 0;
	private depth = 0;
	private turnDispatches = 0;
	private turnInvocations = 0;
	private turnFailure: AgentBrowserError | undefined;
	private droppedErrors = 0;
	private closed = false;
	private interrupted = new Set<(error: AgentBrowserError) => void>();
	private idleWaiters = new Set<(error?: AgentBrowserError) => void>();
	private unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<EventLimits> = {},
		options: DocumentEventOptions = {},
	) {
		if (
			!options ||
			typeof options !== "object" ||
			(options.window !== undefined && typeof options.window !== "boolean")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document event options",
			);
		this.windowTarget = options.window ? -tree.root : null;
		this.limits = Object.freeze({
			maxListeners: 10_000,
			maxListenersPerNode: 256,
			maxDispatchDepth: 64,
			maxDispatchesPerTurn: 1000,
			maxInvocationsPerTurn: 20_000,
			maxErrors: 64,
			...limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid event limit");
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get documentRoot() {
		return this.tree.root;
	}

	createIndependentTarget(): number {
		this.ensureOpen();
		if (this.independentTargetCount >= 512)
			throw new AgentBrowserError(
				"resource-limit",
				"Independent event target limit exceeded",
			);
		const target = -this.tree.root - ++this.independentTargetCount;
		this.independentTargets.add(target);
		return target;
	}

	isIndependentTarget(target: number): boolean {
		this.ensureOpen();
		return this.independentTargets.has(target);
	}

	releaseIndependentTarget(target: number) {
		this.ensureOpen();
		if (!this.independentTargets.has(target)) return;
		for (const record of [...(this.listeners.get(target) ?? [])])
			this.remove(record);
		this.independentTargets.delete(target);
	}

	addEventListener(
		target: number,
		type: string,
		callback: BrowserEventListener | null,
		options: boolean | BrowserListenerOptions = {},
	) {
		this.ensureOpen();
		this.validateTarget(target);
		this.checkType(type);
		if (callback === null) return;
		if (
			typeof callback !== "function" &&
			(!callback || typeof callback !== "object")
		)
			throw new AgentBrowserError("invalid-input", "Invalid event listener");
		const normalized = this.options(options);
		if (
			normalized.signal !== undefined &&
			!(normalized.signal instanceof AbortSignal)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a host AbortSignal",
			);
		if (normalized.signal?.aborted) return;
		const records = this.listeners.get(target) ?? [];
		const capture = Boolean(normalized.capture);
		if (
			records.some(
				(record) =>
					record.type === type &&
					record.callback === callback &&
					record.capture === capture,
			)
		)
			return;
		if (
			this.listenerCount >= this.limits.maxListeners ||
			records.length >= this.limits.maxListenersPerNode
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Event listener limit exceeded",
			);
		const record: ListenerRecord = {
			target,
			type,
			callback,
			capture,
			once: Boolean(normalized.once),
			passive: Boolean(normalized.passive),
			removed: false,
			signal: normalized.signal,
		};
		if (record.signal) {
			record.abort = () => this.remove(record);
			record.signal.addEventListener("abort", record.abort, { once: true });
		}
		records.push(record);
		this.listeners.set(target, records);
		this.listenerCount++;
	}

	removeEventListener(
		target: number,
		type: string,
		callback: BrowserEventListener | null,
		options: boolean | BrowserListenerOptions = {},
	) {
		this.ensureOpen();
		this.validateTarget(target);
		this.checkType(type);
		const capture = Boolean(this.options(options).capture);
		const record = this.listeners
			.get(target)
			?.find(
				(candidate) =>
					candidate.type === type &&
					candidate.callback === callback &&
					candidate.capture === capture,
			);
		if (record) this.remove(record);
	}

	dispatchEvent(target: number, event: BrowserEvent) {
		for (const current of this.eventPath(target, event))
			for (const record of this.listeners.get(current) ?? [])
				if (
					!record.removed &&
					record.type === event.type &&
					(record.capture || current === target || event.bubbles) &&
					controlledListeners.has(record.callback)
				)
					throw new AgentBrowserError(
						"unsupported",
						"Controlled listeners require asynchronous dispatch",
					);
		for (const record of this.dispatch(target, event)) {
			if (controlledListeners.has(record.callback))
				throw new AgentBrowserError(
					"unsupported",
					"Controlled listeners require asynchronous dispatch",
				);
			try {
				if (typeof record.callback === "function")
					record.callback.call(record.target, event);
				else record.callback.handleEvent(event);
			} catch (error) {
				this.reportError(event.type, record.target, error);
			}
		}
		return !event.defaultPrevented;
	}

	async dispatchEventAsync(
		target: number,
		event: BrowserEvent,
		signal?: AbortSignal,
	) {
		if (signal !== undefined && !(signal instanceof AbortSignal))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid event dispatch signal",
			);
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Event dispatch aborted");
		for (const record of this.dispatch(target, event)) {
			const invoke = controlledListeners.get(record.callback);
			try {
				if (signal?.aborted)
					throw new AgentBrowserError("aborted", "Event dispatch aborted");
				if (invoke)
					await this.waitForPrefix(invoke(record.target, event), signal);
				else if (typeof record.callback === "function")
					record.callback.call(record.target, event);
				else record.callback.handleEvent(event);
				if (signal?.aborted)
					throw new AgentBrowserError("aborted", "Event dispatch aborted");
			} catch (error) {
				if (
					signal?.aborted ||
					this.closed ||
					(invoke &&
						error instanceof AgentBrowserError &&
						error.code === "closed")
				)
					throw error;
				this.reportError(event.type, record.target, error);
			}
		}
		return !event.defaultPrevented;
	}

	private *dispatch(
		target: number,
		event: BrowserEvent,
	): Generator<ListenerRecord, boolean> {
		this.ensureOpen();
		this.validateTarget(target);
		const state = stateOf(event);
		if (!state.initialized)
			throw new AgentBrowserError("invalid-input", "Event is not initialized");
		if (state.dispatching)
			throw new AgentBrowserError(
				"invalid-input",
				"Event is already being dispatched",
			);
		if (this.depth === 0) {
			this.turnDispatches = 0;
			this.turnInvocations = 0;
			this.turnFailure = undefined;
		}
		if (
			this.depth >= this.limits.maxDispatchDepth ||
			this.turnDispatches >= this.limits.maxDispatchesPerTurn
		)
			this.failTurn();
		if (this.turnFailure) throw this.turnFailure;
		const path = this.eventPath(target, event);
		state.target = target;
		state.path = path;
		state.dispatching = true;
		this.depth++;
		this.turnDispatches++;
		try {
			for (let index = path.length - 1; index >= 0; index--) {
				state.phase = index === 0 ? 2 : 1;
				yield* this.invoke(path[index], event, true);
			}
			for (let index = 0; index < path.length; index++) {
				if (index > 0 && !state.bubbles) break;
				state.phase = index === 0 ? 2 : 3;
				yield* this.invoke(path[index], event, false);
			}
			return !state.canceled;
		} finally {
			this.depth--;
			state.phase = 0;
			state.currentTarget = null;
			state.path = [];
			state.dispatching = false;
			state.stopped = false;
			state.immediate = false;
			state.passive = false;
			if (this.depth === 0) for (const finish of this.idleWaiters) finish();
		}
	}

	whenIdle(signal: AbortSignal): Promise<void> {
		this.ensureOpen();
		if (!(signal instanceof AbortSignal))
			throw new AgentBrowserError("invalid-input", "Invalid event idle signal");
		if (signal.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Event idle wait aborted"),
			);
		if (this.depth === 0) return Promise.resolve();
		if (this.idleWaiters.size >= 16)
			throw new AgentBrowserError(
				"resource-limit",
				"Event idle wait limit exceeded",
			);
		return new Promise<void>((resolve, reject) => {
			const finish = (error?: AgentBrowserError) => {
				this.idleWaiters.delete(finish);
				signal.removeEventListener("abort", abort);
				if (error) reject(error);
				else resolve();
			};
			const abort = () =>
				finish(new AgentBrowserError("aborted", "Event idle wait aborted"));
			this.idleWaiters.add(finish);
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
		});
	}

	drainErrors(): readonly BrowserListenerError[] {
		const result = this.errors;
		this.errors = [];
		return Object.freeze(result);
	}

	metrics() {
		return Object.freeze({
			listeners: this.listenerCount,
			activeDispatches: this.depth,
			retainedErrors: this.errors.length,
			droppedErrors: this.droppedErrors,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.tree.detailsToggleTasks.disconnect(this);
		for (const finish of this.idleWaiters)
			finish(new AgentBrowserError("closed", "Document events are closed"));
		for (const reject of this.interrupted)
			reject(new AgentBrowserError("closed", "Document events are closed"));
		this.interrupted.clear();
		for (const records of [...this.listeners.values()])
			for (const record of [...records]) this.remove(record);
		this.errors = [];
		this.unregisterClose();
		this.independentTargets.clear();
	}

	private *invoke(
		target: number,
		event: BrowserEvent,
		capture: boolean,
	): Generator<ListenerRecord> {
		this.ensureOpen();
		if (this.turnFailure) throw this.turnFailure;
		const state = stateOf(event);
		if (state.stopped) return;
		state.currentTarget = target;
		for (const record of [...(this.listeners.get(target) ?? [])]) {
			if (
				record.removed ||
				record.type !== state.type ||
				record.capture !== capture
			)
				continue;
			if (this.turnInvocations >= this.limits.maxInvocationsPerTurn)
				this.failTurn();
			this.turnInvocations++;
			if (record.once) this.remove(record);
			state.passive = record.passive;
			try {
				yield record;
			} finally {
				state.passive = false;
			}
			this.ensureOpen();
			if (this.turnFailure) throw this.turnFailure;
			if (state.immediate) break;
		}
	}

	private eventPath(target: number, event: BrowserEvent) {
		this.ensureOpen();
		this.validateTarget(target);
		const state = stateOf(event);
		if (!state.initialized)
			throw new AgentBrowserError("invalid-input", "Event is not initialized");
		if (state.dispatching)
			throw new AgentBrowserError(
				"invalid-input",
				"Event is already being dispatched",
			);
		const path: number[] = [];
		let current: number | null = target;
		while (current !== null) {
			path.push(current);
			current =
				current === this.windowTarget || this.independentTargets.has(current)
					? null
					: current === this.tree.root && state.type !== "load"
						? this.windowTarget
						: this.tree.get(current).parent;
		}
		return path;
	}

	private waitForPrefix(pending: Promise<void>, signal?: AbortSignal) {
		if (this.closed) {
			void pending.catch(() => undefined);
			return Promise.reject(
				new AgentBrowserError("closed", "Document events are closed"),
			);
		}
		return new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				this.interrupted.delete(interrupt);
				signal?.removeEventListener("abort", abort);
			};
			const interrupt = (error: AgentBrowserError) => {
				cleanup();
				reject(error);
			};
			const abort = () =>
				interrupt(new AgentBrowserError("aborted", "Event dispatch aborted"));
			this.interrupted.add(interrupt);
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
			pending.then(
				() => {
					cleanup();
					resolve();
				},
				(error) => {
					cleanup();
					reject(error);
				},
			);
		});
	}

	private remove(record: ListenerRecord) {
		if (record.removed) return;
		record.removed = true;
		const records = this.listeners.get(record.target);
		if (records) {
			const index = records.indexOf(record);
			if (index !== -1) records.splice(index, 1);
			if (!records.length) this.listeners.delete(record.target);
		}
		this.listenerCount--;
		if (record.signal && record.abort)
			record.signal.removeEventListener("abort", record.abort);
	}

	private reportError(type: string, target: number, error: unknown) {
		if (this.closed) return;
		if (this.errors.length >= this.limits.maxErrors) {
			this.droppedErrors++;
			return;
		}
		let message = "Event listener threw";
		try {
			if (typeof error === "string") message = error.slice(0, 512);
			else if (error instanceof Error && typeof error.message === "string")
				message = error.message.slice(0, 512);
		} catch {}
		this.errors.push(Object.freeze({ type, target, message }));
	}

	private failTurn(): never {
		this.turnFailure ??= new AgentBrowserError(
			"resource-limit",
			"Event dispatch budget exceeded",
		);
		throw this.turnFailure;
	}

	private checkType(type: string) {
		if (typeof type !== "string" || type.length > 256)
			throw new AgentBrowserError("invalid-input", "Invalid event type");
	}

	private options(options: boolean | BrowserListenerOptions) {
		if (typeof options === "boolean") return { capture: options };
		if (!options || typeof options !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid listener options");
		return options;
	}

	private validateTarget(target: number) {
		if (this.independentTargets.has(target)) return;
		if (target !== this.windowTarget || target === null) this.tree.get(target);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document events are closed");
	}
}
