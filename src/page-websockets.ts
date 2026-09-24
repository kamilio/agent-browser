import type { DocumentWebSockets } from "./document-websockets.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	PageBindingContext,
	PageBindingLifecycle,
} from "./page-bindings.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { validateWebSocketProtocols } from "./websocket-protocols.js";
import type {
	NativeWebSocketMessage,
	WebSocketCloseResult,
	WebSocketConnection,
} from "./websocket-transport.js";

export interface PageWebSocketLimits {
	maxSockets: number;
	maxListeners: number;
	maxEvents: number;
	maxCallbacks: number;
	maxPendingCallbacks: number;
	maxMessageBytes: number;
	maxRetainedBytes: number;
	maxPendingSends: number;
	maxSends: number;
}

interface SocketListener {
	type: string;
	callback: unknown;
	capture: boolean;
	once: boolean;
	handler: boolean;
}

interface SocketWrite {
	data: string | Uint8Array;
	bytes: number;
	retainedBytes: number;
}

interface SocketRecord {
	url: string;
	protocols: readonly string[];
	protocol: string;
	receiver: unknown;
	state: number;
	binaryType: "blob" | "arraybuffer";
	bufferedAmount: number;
	controller: AbortController;
	stopped: Promise<void>;
	stop(): void;
	listeners: Set<SocketListener>;
	writes: SocketWrite[];
	writing: boolean;
	connection?: WebSocketConnection;
	requestedClose?: { code: number | undefined; reason: string };
	closeStarted: boolean;
	nativeSettled: boolean;
	failed: boolean;
	finished: boolean;
}

interface SocketEvent {
	socket: SocketRecord;
	type: string;
	fields: Record<string, unknown>;
	bytes: number;
}

const defaults: PageWebSocketLimits = {
	maxSockets: 32,
	maxListeners: 128,
	maxEvents: 4096,
	maxCallbacks: 8192,
	maxPendingCallbacks: 128,
	maxMessageBytes: 4 * 1024 * 1024,
	maxRetainedBytes: 8 * 1024 * 1024,
	maxPendingSends: 128,
	maxSends: 4096,
};

const abnormalClose: WebSocketCloseResult = Object.freeze({
	code: 1006,
	reason: "",
	wasClean: false,
});

export class PageWebSockets {
	readonly limits: Readonly<PageWebSocketLimits>;
	readonly bootstrap: () => object;
	private readonly sockets = new Set<SocketRecord>();
	private readonly events = new Set<SocketEvent>();
	private readonly pendingTasks = new Map<
		ReturnType<typeof setTimeout>,
		() => void
	>();
	private readonly unregisterClose: () => unknown;
	private readonly shutdown: Promise<void>;
	private stopCallbacks: () => void = () => undefined;
	private constructorReference: unknown;
	private bootstrapped = false;
	private published = false;
	private closed = false;
	private listeners = 0;
	private callbacks = 0;
	private pendingCallbacks = 0;
	private callbackFailures = 0;
	private cleanupFailures = 0;
	private retainedBytes = 0;
	private pendingAdmissions = 0;
	private pendingReads = 0;
	private pendingNativeClosures = 0;
	private pendingCloseRequests = 0;
	private pendingSends = 0;
	private sends = 0;

	constructor(
		tree: Pick<DocumentTree, "onClose">,
		private readonly context: Pick<
			PageBindingContext,
			"createHostObject" | "retainGuestArguments" | "releaseGuestReference"
		>,
		private readonly lifecycle: Pick<
			PageBindingLifecycle,
			"startCallback" | "isClosed" | "fail"
		> & { whenReady?(): Promise<void> },
		private readonly owner: Pick<DocumentWebSockets, "start" | "metrics">,
		limits: Partial<PageWebSocketLimits> = {},
	) {
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof PageWebSocketLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid page WebSocket limits",
				);
		this.shutdown = new Promise((resolve) => {
			this.stopCallbacks = resolve;
		});
		const publish = context.retainGuestArguments((...args) => {
			try {
				this.ensureOpen();
				if (!this.bootstrapped || this.published || args.length !== 1)
					throw new AgentBrowserError(
						"invalid-input",
						"WebSocket constructor may be published exactly once",
					);
				if (!referenceValue(args[0]))
					throw new AgentBrowserError(
						"invalid-input",
						"WebSocket constructor requires a guest reference",
					);
				this.constructorReference = args[0];
				this.published = true;
			} catch (error) {
				for (const value of new Set(args)) this.releaseUnowned(value);
				throw error;
			}
		}, 0);
		const create = context.retainGuestArguments((...args) => {
			try {
				this.ensureOpen();
				if (!this.published || args.length !== 3)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid WebSocket construction",
					);
				return this.create(args[0], args[1], args[2]);
			} catch (error) {
				for (const value of new Set(args.slice(2))) this.releaseUnowned(value);
				throw error;
			}
		}, 2);
		this.bootstrap = () => {
			this.ensureOpen();
			if (this.bootstrapped)
				throw new AgentBrowserError(
					"invalid-input",
					"WebSocket bootstrap is available exactly once",
				);
			const capability = context.createHostObject({
				methods: { publish, create },
			});
			this.bootstrapped = true;
			return capability;
		};
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get constructorValue(): unknown {
		this.ensureOpen();
		return this.constructorReference;
	}

	metrics() {
		return Object.freeze({
			partial: true,
			binaryBlobReceive: false,
			closed: this.closed,
			socketObjects: this.sockets.size,
			connecting: [...this.sockets].filter((socket) => socket.state === 0)
				.length,
			open: [...this.sockets].filter((socket) => socket.state === 1).length,
			closing: [...this.sockets].filter((socket) => socket.state === 2).length,
			listeners: this.listeners,
			events: this.events.size,
			callbacks: this.callbacks,
			pendingCallbacks: this.pendingCallbacks,
			pendingTasks: this.pendingTasks.size,
			callbackFailures: this.callbackFailures,
			cleanupFailures: this.cleanupFailures,
			retainedBytes: this.retainedBytes,
			pendingAdmissions: this.pendingAdmissions,
			pendingReads: this.pendingReads,
			pendingNativeClosures: this.pendingNativeClosures,
			pendingCloseRequests: this.pendingCloseRequests,
			pendingSends: this.pendingSends,
			sends: this.sends,
			limits: this.limits,
			sharedOwner: this.owner.metrics(),
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
		this.stopCallbacks();
		for (const [timer, cancel] of this.pendingTasks) {
			clearTimeout(timer);
			cancel();
		}
		this.pendingTasks.clear();
		for (const socket of this.sockets) {
			socket.state = 3;
			socket.stop();
			socket.controller.abort();
			this.discardWrites(socket);
			socket.listeners.clear();
			this.release(socket.receiver);
			socket.receiver = undefined;
		}
		this.listeners = 0;
		for (const event of this.events) {
			this.retainedBytes -= event.bytes;
			event.bytes = 0;
			event.fields = {};
		}
		this.events.clear();
		this.release(this.constructorReference);
		this.constructorReference = undefined;
	}

	private create(input: unknown, offered: unknown, receiver: unknown): object {
		if (typeof input !== "string" || !referenceValue(receiver))
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket requires a URL string and a guest receiver",
			);
		if (
			receiver === this.constructorReference ||
			[...this.sockets].some((socket) => socket.receiver === receiver)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket receiver is already retained",
			);
		const protocols = socketProtocols(offered);
		if (this.sockets.size >= this.limits.maxSockets)
			throw new AgentBrowserError(
				"resource-limit",
				"Page WebSocket object limit exceeded",
			);
		let stop: () => void = () => undefined;
		const stopped = new Promise<void>((resolve) => {
			stop = resolve;
		});
		const socket: SocketRecord = {
			url: "",
			protocols,
			protocol: "",
			receiver,
			state: 0,
			binaryType: "blob",
			bufferedAmount: 0,
			controller: new AbortController(),
			stopped,
			stop,
			listeners: new Set(),
			writes: [],
			writing: false,
			closeStarted: false,
			nativeSettled: false,
			failed: false,
			finished: false,
		};
		const admission = this.owner.start(input, {
			protocols,
			signal: socket.controller.signal,
		});
		socket.url = admission.url;
		let capability: object;
		try {
			capability = this.capability(socket);
		} catch (error) {
			socket.controller.abort();
			void admission.connection.catch(() => undefined);
			throw error;
		}
		this.sockets.add(socket);
		this.pendingAdmissions++;
		void admission.connection
			.then(
				(connection) => {
					this.pendingAdmissions--;
					return this.connected(socket, connection);
				},
				() => {
					this.pendingAdmissions--;
					this.fail(socket);
					return this.finish(socket, abnormalClose);
				},
			)
			.catch(() => this.fatal());
		return capability;
	}

	private capability(socket: SocketRecord): object {
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		const reads: Record<string, () => string | number> = {
			url: () => socket.url,
			readyState: () => socket.state,
			protocol: () => socket.protocol,
			extensions: () => "",
			bufferedAmount: () => socket.bufferedAmount,
		};
		for (const [name, read] of Object.entries(reads))
			properties[name] = {
				get: () => {
					this.ensureOpen();
					return read();
				},
			};
		properties.binaryType = {
			get: () => {
				this.ensureOpen();
				return socket.binaryType;
			},
			set: (value) => {
				this.ensureOpen();
				if (value !== "blob" && value !== "arraybuffer")
					throw new AgentBrowserError(
						"unsupported",
						"WebSocket binaryType must be blob or arraybuffer",
					);
				socket.binaryType = value;
			},
		};
		for (const type of ["open", "message", "error", "close"])
			properties[`on${type}`] = {
				get: () => {
					this.ensureOpen();
					return this.handler(socket, type)?.callback ?? null;
				},
				set: (callback) => {
					this.ensureOpen();
					checkCallback(callback);
					const previous = this.handler(socket, type);
					if (callback == null) {
						if (previous) this.removeListener(socket, previous);
					} else if (previous) previous.callback = callback;
					else this.addListener(socket, type, callback, false, false, true);
				},
			};
		return this.context.createHostObject({
			properties,
			methods: {
				send: (value) => this.send(socket, value),
				close: (code, reason) => this.requestClose(socket, code, reason),
				addEventListener: (type, callback, options) => {
					this.ensureOpen();
					const name = eventType(type);
					const selected = listenerOptions(options);
					checkCallback(callback);
					if (callback == null) return;
					if (
						[...socket.listeners].some(
							(listener) =>
								!listener.handler &&
								listener.type === name &&
								listener.callback === callback &&
								listener.capture === selected.capture,
						)
					)
						return;
					this.addListener(
						socket,
						name,
						callback,
						selected.capture,
						selected.once,
						false,
					);
				},
				removeEventListener: (type, callback, options) => {
					this.ensureOpen();
					const name = eventType(type);
					const selected = listenerOptions(options);
					checkCallback(callback);
					for (const listener of socket.listeners)
						if (
							!listener.handler &&
							listener.type === name &&
							listener.callback === callback &&
							listener.capture === selected.capture
						)
							this.removeListener(socket, listener);
				},
			},
		});
	}

	private async connected(
		socket: SocketRecord,
		connection: WebSocketConnection,
	): Promise<void> {
		socket.connection = connection;
		this.pendingNativeClosures++;
		const completion = Promise.resolve()
			.then(() => connection.closed)
			.then(
				(result) => {
					this.pendingNativeClosures--;
					socket.nativeSettled = true;
					this.discardWrites(socket);
					try {
						return closeResult(result);
					} catch {
						this.fail(socket);
						return abnormalClose;
					}
				},
				() => {
					this.pendingNativeClosures--;
					socket.nativeSettled = true;
					this.fail(socket);
					return abnormalClose;
				},
			);
		try {
			if (this.closed) return;
			if (socket.state !== 0) {
				this.fail(socket);
				await this.finish(socket, abnormalClose);
				return;
			}
			const protocol = connection.protocol;
			if (
				typeof protocol !== "string" ||
				(protocol !== "" && !socket.protocols.includes(protocol))
			)
				throw new AgentBrowserError(
					"network-error",
					"Invalid negotiated WebSocket protocol",
				);
			await this.dispatch(socket, "open", {}, 0, () => {
				if (socket.state !== 0) return false;
				socket.protocol = protocol;
				socket.state = 1;
				return true;
			});
			while (!this.closed && !socket.failed) {
				const message = await Promise.race([
					this.read(socket, connection),
					socket.stopped.then(() => undefined),
				]);
				if (message === undefined || this.closed || socket.failed) break;
				await this.message(socket, message);
			}
			const result = socket.failed
				? abnormalClose
				: await Promise.race([
						completion,
						socket.stopped.then(() => abnormalClose),
					]);
			await this.finish(socket, result);
		} catch {
			this.fail(socket);
			await this.finish(socket, abnormalClose);
		}
	}

	private read(
		socket: SocketRecord,
		connection: WebSocketConnection,
	): Promise<NativeWebSocketMessage | undefined> {
		this.pendingReads++;
		return Promise.resolve()
			.then(() =>
				this.closed || socket.failed ? undefined : connection.read(),
			)
			.then(
				(message) => {
					this.pendingReads--;
					return message;
				},
				(error) => {
					this.pendingReads--;
					throw error;
				},
			);
	}

	private async message(
		socket: SocketRecord,
		message: NativeWebSocketMessage,
	): Promise<void> {
		let data: string | ArrayBuffer;
		let bytes: number;
		const received = message.data;
		if (typeof received === "string") {
			const wireBytes = utf8Length(received, this.limits.maxMessageBytes);
			bytes = Math.max(wireBytes, received.length * 2);
			this.reserveCheck(bytes);
			data = received;
		} else {
			if (socket.binaryType !== "arraybuffer")
				throw new AgentBrowserError(
					"unsupported",
					"Binary WebSocket receive requires binaryType arraybuffer",
				);
			const selected = binaryInput(received);
			bytes = selected.byteLength;
			if (bytes > this.limits.maxMessageBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"WebSocket message limit exceeded",
				);
			this.reserveCheck(bytes);
			data = new Uint8Array(selected).buffer;
		}
		await this.dispatch(
			socket,
			"message",
			{ data, origin: new URL(socket.url).origin, lastEventId: "" },
			bytes,
		);
	}

	private send(socket: SocketRecord, value: unknown): void {
		this.ensureOpen();
		if (socket.state === 0)
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket is still connecting",
			);
		const source = typeof value === "string" ? value : binaryInput(value);
		const bytes =
			typeof source === "string"
				? utf8Length(source, this.limits.maxMessageBytes)
				: source.byteLength;
		if (bytes > this.limits.maxMessageBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket message limit exceeded",
			);
		if (socket.state !== 1) return;
		const retainedBytes =
			typeof source === "string" ? Math.max(bytes, source.length * 2) : bytes;
		this.reserveCheck(retainedBytes);
		if (
			this.pendingSends >= this.limits.maxPendingSends ||
			this.sends >= this.limits.maxSends
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page WebSocket send limit exceeded",
			);
		const data = typeof source === "string" ? source : new Uint8Array(source);
		this.retainedBytes += retainedBytes;
		this.pendingSends++;
		this.sends++;
		socket.bufferedAmount += bytes;
		socket.writes.push({ data, bytes, retainedBytes });
		this.pumpWrites(socket);
	}

	private pumpWrites(socket: SocketRecord): void {
		if (socket.writing || this.closed || socket.failed || socket.nativeSettled)
			return;
		const write = socket.writes.shift();
		if (!write) {
			this.beginClose(socket);
			return;
		}
		socket.writing = true;
		void Promise.resolve()
			.then(() => {
				if (this.closed || socket.failed || socket.nativeSettled) return;
				return socket.connection?.send(write.data);
			})
			.then(
				() => {
					this.releaseWrite(socket, write);
					socket.writing = false;
					this.pumpWrites(socket);
				},
				() => {
					this.releaseWrite(socket, write);
					socket.writing = false;
					this.fail(socket);
				},
			)
			.catch(() => this.fatal());
	}

	private releaseWrite(socket: SocketRecord, write: SocketWrite): void {
		this.pendingSends--;
		this.retainedBytes -= write.retainedBytes;
		socket.bufferedAmount -= write.bytes;
	}

	private discardWrites(socket: SocketRecord): void {
		for (const write of socket.writes) this.releaseWrite(socket, write);
		socket.writes.length = 0;
	}

	private requestClose(
		socket: SocketRecord,
		code: unknown,
		reason: unknown,
	): void {
		this.ensureOpen();
		if (
			code !== undefined &&
			(typeof code !== "number" ||
				!Number.isInteger(code) ||
				(code !== 1000 && (code < 3000 || code > 4999)))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page WebSocket close code must be 1000 or 3000 through 4999",
			);
		const text = reason === undefined ? "" : reason;
		if (typeof text !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket close reason must be a string",
			);
		utf8Length(text, 123);
		if (socket.state >= 2) return;
		const connecting = socket.state === 0;
		socket.state = 2;
		socket.requestedClose = { code, reason: text };
		if (connecting) this.fail(socket);
		else this.pumpWrites(socket);
	}

	private beginClose(socket: SocketRecord): void {
		if (
			!socket.requestedClose ||
			!socket.connection ||
			socket.closeStarted ||
			socket.nativeSettled
		)
			return;
		socket.closeStarted = true;
		this.pendingCloseRequests++;
		const { code, reason } = socket.requestedClose;
		void Promise.resolve()
			.then(() => {
				if (this.closed || socket.failed || socket.nativeSettled) return;
				return socket.connection?.close(code, reason);
			})
			.then(
				() => {
					this.pendingCloseRequests--;
				},
				() => {
					this.pendingCloseRequests--;
					this.fail(socket);
				},
			)
			.catch(() => this.fatal());
	}

	private fail(socket: SocketRecord): void {
		if (socket.failed || socket.finished) return;
		socket.failed = true;
		if (socket.state !== 3) socket.state = 2;
		socket.stop();
		socket.controller.abort();
		this.discardWrites(socket);
	}

	private async finish(
		socket: SocketRecord,
		result: WebSocketCloseResult,
	): Promise<void> {
		if (socket.finished) return;
		socket.finished = true;
		this.discardWrites(socket);
		const transition = () => {
			socket.state = 3;
			this.discardWrites(socket);
			return true;
		};
		if (socket.failed || result.code === 1006)
			await this.dispatch(socket, "error", {}, 0, transition);
		await this.dispatch(socket, "close", { ...result }, 0, transition);
	}

	private nextTask(): Promise<boolean> {
		if (!this.live()) return Promise.resolve(false);
		if (this.pendingTasks.size >= this.limits.maxSockets) {
			this.fatal();
			return Promise.resolve(false);
		}
		return new Promise((resolve) => {
			try {
				const timer = setTimeout(() => {
					this.pendingTasks.delete(timer);
					resolve(this.live());
				}, 0);
				this.pendingTasks.set(timer, () => resolve(false));
			} catch {
				this.fatal();
				resolve(false);
			}
		});
	}

	private async dispatch(
		socket: SocketRecord,
		type: string,
		fields: Record<string, unknown> = {},
		bytes = 0,
		transition?: () => boolean,
	): Promise<void> {
		if (!this.live()) return;
		if (this.events.size >= this.limits.maxEvents) {
			this.fatal();
			return;
		}
		this.reserveCheck(bytes);
		const event: SocketEvent = { socket, type, fields, bytes };
		this.retainedBytes += bytes;
		this.events.add(event);
		if (!(await this.nextTask()) || !this.live()) return;
		if (this.lifecycle.whenReady) {
			await Promise.race([this.lifecycle.whenReady(), this.shutdown]);
			if (!this.live()) return;
		}
		if (transition && !transition()) {
			this.events.delete(event);
			this.retainedBytes -= event.bytes;
			return;
		}
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of [
			"type",
			"target",
			"currentTarget",
			...Object.keys(fields),
		])
			properties[name] = {
				get: () => {
					this.ensureOpen();
					if (name === "type") return event.type;
					if (name === "target" || name === "currentTarget")
						return event.socket.receiver;
					return event.fields[name];
				},
			};
		const capability = this.context.createHostObject({ properties });
		for (const listener of [...socket.listeners]) {
			if (!this.live()) return;
			if (listener.type !== type || !socket.listeners.has(listener)) continue;
			if (
				this.pendingCallbacks >= this.limits.maxPendingCallbacks ||
				this.callbacks >= this.limits.maxCallbacks
			) {
				this.fatal();
				return;
			}
			if (listener.once) this.removeListener(socket, listener);
			this.callbacks++;
			let invocation: ReturnType<PageBindingLifecycle["startCallback"]>;
			try {
				invocation = this.lifecycle.startCallback(
					listener.callback,
					[capability],
					{ thisValue: socket.receiver },
				);
			} catch {
				this.callbackFailures++;
				continue;
			}
			this.pendingCallbacks++;
			let phases = 2;
			let rejected = false;
			const settled = () => {
				if (--phases === 0) this.pendingCallbacks--;
			};
			const failed = () => {
				if (!rejected) this.callbackFailures++;
				rejected = true;
				settled();
			};
			void invocation.result.then(settled, failed);
			await Promise.race([
				invocation.synchronous.then(settled, failed),
				this.shutdown,
			]);
		}
	}

	private handler(socket: SocketRecord, type: string) {
		return [...socket.listeners].find(
			(listener) => listener.handler && listener.type === type,
		);
	}

	private addListener(
		socket: SocketRecord,
		type: string,
		callback: unknown,
		capture: boolean,
		once: boolean,
		handler: boolean,
	): void {
		if (this.listeners >= this.limits.maxListeners)
			throw new AgentBrowserError(
				"resource-limit",
				"Page WebSocket listener limit exceeded",
			);
		socket.listeners.add({ type, callback, capture, once, handler });
		this.listeners++;
	}

	private removeListener(socket: SocketRecord, listener: SocketListener): void {
		if (socket.listeners.delete(listener)) this.listeners--;
	}

	private reserveCheck(bytes: number): void {
		if (bytes > this.limits.maxRetainedBytes - this.retainedBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Page WebSocket retained byte limit exceeded",
			);
	}

	private releaseUnowned(value: unknown): void {
		if (
			value !== this.constructorReference &&
			![...this.sockets].some((socket) => socket.receiver === value)
		)
			this.release(value);
	}

	private release(value: unknown): void {
		if (!referenceValue(value)) return;
		try {
			void Promise.resolve(this.context.releaseGuestReference(value)).catch(
				() => {
					this.cleanupFailures++;
				},
			);
		} catch {
			this.cleanupFailures++;
		}
	}

	private fatal(): void {
		if (this.closed) return;
		this.close();
		try {
			this.lifecycle.fail(
				new AgentBrowserError(
					"resource-limit",
					"Page WebSocket callback or event limit exceeded",
				),
			);
		} catch {
			this.callbackFailures++;
		}
	}

	private live(): boolean {
		if (!this.closed && this.lifecycle.isClosed()) this.close();
		return !this.closed;
	}

	private ensureOpen(): void {
		if (!this.live())
			throw new AgentBrowserError("closed", "Page WebSockets are closed");
	}
}

function referenceValue(value: unknown): boolean {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

function socketProtocols(value: unknown): readonly string[] {
	if (value === undefined) return validateWebSocketProtocols();
	if (typeof value === "string") return validateWebSocketProtocols([value]);
	if (!Array.isArray(value) || value.length > 32)
		throw new AgentBrowserError("invalid-input", "Invalid WebSocket protocols");
	const protocols: string[] = [];
	for (let index = 0; index < value.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !("value" in descriptor))
			throw new AgentBrowserError(
				"unsupported",
				"WebSocket protocol accessors and sparse arrays are unsupported",
			);
		protocols.push(descriptor.value);
	}
	return validateWebSocketProtocols(protocols);
}

function eventType(value: unknown): string {
	if (typeof value !== "string" || value.length > 256)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid WebSocket event type",
		);
	return value;
}

function checkCallback(value: unknown): void {
	if (value != null && typeof value !== "function")
		throw new AgentBrowserError(
			"unsupported",
			"WebSocket listeners must be functions",
		);
}

function listenerOptions(value: unknown): { capture: boolean; once: boolean } {
	if (value == null) return { capture: false, once: false };
	if (typeof value === "boolean") return { capture: value, once: false };
	if (
		typeof value !== "object" ||
		Array.isArray(value) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(value))
	)
		throw new AgentBrowserError(
			"unsupported",
			"Invalid WebSocket listener options",
		);
	const selected = { capture: false, once: false };
	for (const key of Reflect.ownKeys(value)) {
		if (key !== "capture" && key !== "once")
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported WebSocket listener option",
			);
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (
			!descriptor ||
			!("value" in descriptor) ||
			(descriptor.value !== undefined && typeof descriptor.value !== "boolean")
		)
			throw new AgentBrowserError(
				"unsupported",
				"WebSocket listener options require own boolean data properties",
			);
		selected[key] = descriptor.value ?? false;
	}
	return selected;
}

function binaryInput(value: unknown): Uint8Array {
	try {
		if (ArrayBuffer.isView(value)) {
			const prototype =
				value instanceof DataView
					? DataView.prototype
					: Object.getPrototypeOf(Uint8Array.prototype);
			const buffer = Object.getOwnPropertyDescriptor(
				prototype,
				"buffer",
			)?.get?.call(value);
			const offset = Object.getOwnPropertyDescriptor(
				prototype,
				"byteOffset",
			)?.get?.call(value);
			const length = Object.getOwnPropertyDescriptor(
				prototype,
				"byteLength",
			)?.get?.call(value);
			Object.getOwnPropertyDescriptor(
				ArrayBuffer.prototype,
				"byteLength",
			)?.get?.call(buffer);
			return new Uint8Array(buffer, offset, length);
		}
		const length = Object.getOwnPropertyDescriptor(
			ArrayBuffer.prototype,
			"byteLength",
		)?.get?.call(value);
		return new Uint8Array(value as ArrayBuffer, 0, length);
	} catch {
		throw new AgentBrowserError(
			"unsupported",
			"WebSocket data requires text or an unshared ArrayBuffer or view",
		);
	}
}

function utf8Length(value: string, maximum: number): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 0x80) bytes++;
		else if (code < 0x800) bytes += 2;
		else if (
			code >= 0xd800 &&
			code <= 0xdbff &&
			value.charCodeAt(index + 1) >= 0xdc00 &&
			value.charCodeAt(index + 1) <= 0xdfff
		) {
			bytes += 4;
			index++;
		} else bytes += 3;
		if (bytes > maximum)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket UTF-8 byte limit exceeded",
			);
	}
	return bytes;
}

function closeResult(value: WebSocketCloseResult): WebSocketCloseResult {
	if (
		!value ||
		!Number.isInteger(value.code) ||
		value.code < 1000 ||
		value.code > 4999 ||
		typeof value.reason !== "string" ||
		typeof value.wasClean !== "boolean"
	)
		throw new AgentBrowserError(
			"network-error",
			"Invalid WebSocket completion",
		);
	utf8Length(value.reason, 123);
	return { code: value.code, reason: value.reason, wasClean: value.wasClean };
}
