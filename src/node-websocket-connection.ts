import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import { AgentBrowserError } from "./errors.js";
import { encodeNativeWebSocketClientFrame } from "./websocket-frames.js";
import {
	WebSocketReceiver,
	type WebSocketReceiverLimits,
} from "./websocket-receiver.js";

export interface WebSocketConnectionLimits extends WebSocketReceiverLimits {
	maxQueuedMessages: number;
	maxQueuedBytes: number;
	maxPendingSendBytes: number;
	maxPendingWrites: number;
	maxReceivedBytes: number;
	maxSentBytes: number;
	writeTimeoutMs: number;
	closeTimeoutMs: number;
}

export interface WebSocketCloseResult {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;
}

export interface NativeWebSocketMessage {
	readonly data: string | Uint8Array;
}

interface PendingRead {
	resolve: (message: NativeWebSocketMessage | undefined) => void;
	reject: (error: AgentBrowserError) => void;
}

export class NodeWebSocketConnection {
	readonly closed: Promise<WebSocketCloseResult>;
	private readonly receiver: WebSocketReceiver;
	private readonly messages: NativeWebSocketMessage[] = [];
	private status: "open" | "closing" | "closed" = "open";
	private queuedBytes = 0;
	private pendingSendBytes = 0;
	private pendingWrites = 0;
	private receivedBytes = 0;
	private sentBytes = 0;
	private readWaiter?: PendingRead;
	private writeTail: Promise<void> = Promise.resolve();
	private failure?: AgentBrowserError;
	private peerClose?: { code: number | undefined; reason: string };
	private sentClose = false;
	private closeTimer?: ReturnType<typeof setTimeout>;
	private resolveClosed!: (result: WebSocketCloseResult) => void;

	constructor(
		private readonly socket: Duplex,
		readonly url: string,
		readonly protocol: string,
		private readonly limits: Readonly<WebSocketConnectionLimits>,
		private readonly signal?: AbortSignal,
		private readonly onClosed?: () => void,
	) {
		for (const name of [
			"maxFrameBytes",
			"maxMessageBytes",
			"maxFramesPerPush",
			"maxQueuedMessages",
			"maxQueuedBytes",
			"maxPendingSendBytes",
			"maxPendingWrites",
			"maxReceivedBytes",
			"maxSentBytes",
			"writeTimeoutMs",
			"closeTimeoutMs",
		] as const) {
			const value = limits[name];
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid WebSocket connection limits",
				);
		}
		this.limits = Object.freeze({ ...limits });
		this.receiver = new WebSocketReceiver(this.limits);
		this.closed = new Promise((resolve) => {
			this.resolveClosed = resolve;
		});
		socket.on("data", this.onData);
		socket.on("error", this.onError);
		socket.on("end", this.onEnd);
		socket.on("close", this.onSocketClose);
		signal?.addEventListener("abort", this.onAbort, { once: true });
		if (signal?.aborted) this.onAbort();
	}

	get state() {
		return this.status;
	}

	metrics() {
		return Object.freeze({
			state: this.status,
			queuedMessages: this.messages.length,
			queuedBytes: this.queuedBytes,
			pendingSendBytes: this.pendingSendBytes,
			pendingWrites: this.pendingWrites,
			receivedBytes: this.receivedBytes,
			sentBytes: this.sentBytes,
		});
	}

	async read(): Promise<NativeWebSocketMessage | undefined> {
		if (this.failure) throw this.failure;
		if (this.readWaiter)
			throw new AgentBrowserError(
				"invalid-input",
				"A WebSocket read is pending",
			);
		const message = this.messages.shift();
		if (message) {
			this.queuedBytes -= this.messageBytes(message.data);
			return message;
		}
		if (this.status === "closed") return undefined;
		return new Promise((resolve, reject) => {
			this.readWaiter = { resolve, reject };
		});
	}

	async send(data: string | Uint8Array): Promise<void> {
		this.ensureOpen();
		if (typeof data !== "string" && !(data instanceof Uint8Array))
			throw new AgentBrowserError("invalid-input", "Invalid WebSocket message");
		if (data.length > this.limits.maxMessageBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket message is too large",
			);
		const length = this.messageBytes(data);
		if (length > this.limits.maxMessageBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket message is too large",
			);
		const frames = Math.max(1, Math.ceil(length / this.limits.maxFrameBytes));
		if (frames > this.limits.maxFramesPerPush)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket send frame limit exceeded",
			);
		let encodedBytes = 0;
		for (let offset = 0; offset < frames; offset++) {
			const size = Math.min(
				this.limits.maxFrameBytes,
				length - offset * this.limits.maxFrameBytes,
			);
			encodedBytes += size + (size > 65535 ? 14 : size > 125 ? 8 : 6);
		}
		this.admitWrite(encodedBytes);
		const payload =
			typeof data === "string"
				? Buffer.from(data, "utf8")
				: new Uint8Array(data);
		const encoded: Uint8Array[] = [];
		for (let index = 0; index < frames; index++) {
			const start = index * this.limits.maxFrameBytes;
			encoded.push(
				encodeNativeWebSocketClientFrame(
					{
						fin: index === frames - 1,
						opcode: index === 0 ? (typeof data === "string" ? 1 : 2) : 0,
						payload: payload.subarray(
							start,
							Math.min(length, start + this.limits.maxFrameBytes),
						),
					},
					randomBytes(4),
					this.limits.maxFrameBytes,
				),
			);
		}
		return this.enqueue(encoded, encodedBytes, false);
	}

	close(code = 1000, reason = ""): Promise<WebSocketCloseResult> {
		if (this.status !== "open") return this.closed;
		if (
			!Number.isInteger(code) ||
			(code !== 1000 && (code < 3000 || code > 4999)) ||
			typeof reason !== "string"
		)
			return Promise.reject(
				new AgentBrowserError(
					"invalid-input",
					"Invalid WebSocket close options",
				),
			);
		if (reason.length > 123)
			return Promise.reject(
				new AgentBrowserError(
					"invalid-input",
					"WebSocket close reason is too long",
				),
			);
		const length = Buffer.byteLength(reason);
		if (length > 123)
			return Promise.reject(
				new AgentBrowserError(
					"invalid-input",
					"WebSocket close reason is too long",
				),
			);
		const payload = new Uint8Array(length + 2);
		payload[0] = code >>> 8;
		payload[1] = code & 0xff;
		payload.set(Buffer.from(reason), 2);
		this.status = "closing";
		this.startCloseTimer();
		void this.sendControl(8, payload).then(
			() => {
				this.sentClose = true;
				if (this.peerClose) this.socket.end();
			},
			(error) => this.abort(this.asFailure(error)),
		);
		return this.closed;
	}

	abort(
		error = new AgentBrowserError("closed", "WebSocket connection closed"),
	): void {
		if (this.status === "closed") return;
		this.failure ??= error;
		this.status = "closing";
		this.messages.length = 0;
		this.queuedBytes = 0;
		this.receiver.close();
		const waiter = this.readWaiter;
		this.readWaiter = undefined;
		waiter?.reject(this.failure);
		this.socket.destroy();
	}

	accept(chunk: Uint8Array): void {
		if (this.status === "closed" || this.failure || this.peerClose) return;
		try {
			if (!(chunk instanceof Uint8Array))
				throw new AgentBrowserError(
					"network-error",
					"Invalid WebSocket stream bytes",
				);
			if (chunk.length > this.limits.maxReceivedBytes - this.receivedBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"WebSocket receive budget exceeded",
				);
			this.receivedBytes += chunk.length;
			for (const event of this.receiver.push(chunk)) {
				if (this.failure) break;
				if (event.type === "message") {
					if (this.status === "open") this.deliver({ data: event.data });
				} else if (event.type === "ping") {
					if (this.status === "open")
						void this.sendControl(10, event.payload).catch((error) =>
							this.abort(this.asFailure(error)),
						);
				} else if (event.type === "close") {
					this.peerClose = event;
					this.startCloseTimer();
					if (this.status === "open") {
						this.status = "closing";
						const reason = Buffer.from(event.reason);
						const payload = new Uint8Array(
							event.code === undefined ? 0 : reason.length + 2,
						);
						if (event.code !== undefined) {
							payload[0] = event.code >>> 8;
							payload[1] = event.code & 0xff;
							payload.set(reason, 2);
						}
						void this.sendControl(8, payload).then(
							() => {
								this.sentClose = true;
								this.socket.end();
							},
							(error) => this.abort(this.asFailure(error)),
						);
					} else if (this.sentClose) this.socket.end();
				}
			}
		} catch (error) {
			this.abort(this.asFailure(error));
		}
	}

	private deliver(message: NativeWebSocketMessage) {
		const waiter = this.readWaiter;
		if (waiter) {
			this.readWaiter = undefined;
			waiter.resolve(message);
			return;
		}
		const bytes = this.messageBytes(message.data);
		if (
			this.messages.length >= this.limits.maxQueuedMessages ||
			bytes > this.limits.maxQueuedBytes - this.queuedBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket unread-message limit exceeded",
			);
		this.messages.push(message);
		this.queuedBytes += bytes;
	}

	private messageBytes(data: string | Uint8Array) {
		return typeof data === "string" ? Buffer.byteLength(data) : data.length;
	}

	private ensureOpen() {
		if (this.status !== "open" || this.failure)
			throw (
				this.failure ?? new AgentBrowserError("closed", "WebSocket is not open")
			);
	}

	private admitWrite(bytes: number) {
		if (
			this.pendingWrites >= this.limits.maxPendingWrites ||
			bytes > this.limits.maxPendingSendBytes - this.pendingSendBytes ||
			bytes > this.limits.maxSentBytes - this.sentBytes - this.pendingSendBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket send budget exceeded",
			);
	}

	private sendControl(opcode: 8 | 10, payload: Uint8Array) {
		try {
			const bytes = payload.length + 6;
			this.admitWrite(bytes);
			const encoded = encodeNativeWebSocketClientFrame(
				{ fin: true, opcode, payload },
				randomBytes(4),
				this.limits.maxFrameBytes,
			);
			return this.enqueue([encoded], bytes, true);
		} catch (error) {
			this.abort(this.asFailure(error));
			return Promise.reject(error);
		}
	}

	private enqueue(
		frames: readonly Uint8Array[],
		bytes: number,
		control: boolean,
	) {
		this.pendingSendBytes += bytes;
		this.pendingWrites++;
		let remaining = bytes;
		const task = this.writeTail.then(async () => {
			for (const frame of frames) {
				if (
					this.failure ||
					this.status === "closed" ||
					(!control && this.peerClose)
				)
					throw (
						this.failure ??
						new AgentBrowserError("closed", "WebSocket send interrupted")
					);
				await this.writeFrame(frame);
				this.pendingSendBytes -= frame.length;
				remaining -= frame.length;
			}
		});
		const result = task.finally(() => {
			this.pendingSendBytes -= remaining;
			this.pendingWrites--;
		});
		this.writeTail = result.catch(() => undefined);
		return result;
	}

	private writeFrame(frame: Uint8Array): Promise<void> {
		return new Promise((resolve, reject) => {
			let finished = false;
			const done = (error?: Error | null) => {
				if (finished) return;
				finished = true;
				clearTimeout(timer);
				this.socket.removeListener("close", closed);
				if (error) {
					const failure = this.asFailure(error);
					this.abort(failure);
					reject(failure);
				} else {
					this.sentBytes += frame.length;
					resolve();
				}
			};
			const closed = () =>
				done(
					this.failure ??
						new AgentBrowserError("closed", "WebSocket closed during write"),
				);
			const timer = setTimeout(
				() =>
					done(new AgentBrowserError("timeout", "WebSocket write timed out")),
				this.limits.writeTimeoutMs,
			);
			timer.unref();
			this.socket.once("close", closed);
			try {
				this.socket.write(frame, done);
			} catch (error) {
				done(this.asFailure(error));
			}
		});
	}

	private startCloseTimer() {
		if (this.closeTimer) return;
		this.closeTimer = setTimeout(
			() =>
				this.abort(
					new AgentBrowserError("timeout", "WebSocket close timed out"),
				),
			this.limits.closeTimeoutMs,
		);
		this.closeTimer.unref();
	}

	private asFailure(error: unknown): AgentBrowserError {
		return error instanceof AgentBrowserError
			? error
			: new AgentBrowserError("network-error", "WebSocket stream failed");
	}

	private readonly onData = (chunk: Uint8Array) => this.accept(chunk);
	private readonly onError = () =>
		this.abort(
			new AgentBrowserError("network-error", "WebSocket stream failed"),
		);
	private readonly onAbort = () =>
		this.abort(new AgentBrowserError("aborted", "WebSocket aborted"));
	private readonly onEnd = () => {
		if (!this.peerClose)
			this.abort(
				new AgentBrowserError(
					"network-error",
					"WebSocket ended without a close frame",
				),
			);
		else if (this.sentClose) this.socket.end();
	};
	private readonly onSocketClose = () => {
		if (this.status === "closed") return;
		if (!this.peerClose)
			this.failure ??= new AgentBrowserError(
				"network-error",
				"WebSocket closed without a close frame",
			);
		this.status = "closed";
		if (this.failure) {
			this.messages.length = 0;
			this.queuedBytes = 0;
		}
		clearTimeout(this.closeTimer);
		this.receiver.close();
		this.signal?.removeEventListener("abort", this.onAbort);
		this.socket.removeListener("data", this.onData);
		this.socket.removeListener("error", this.onError);
		this.socket.removeListener("end", this.onEnd);
		this.socket.removeListener("close", this.onSocketClose);
		const result = Object.freeze({
			code: this.peerClose ? (this.peerClose.code ?? 1005) : 1006,
			reason: this.peerClose?.reason ?? "",
			wasClean: Boolean(this.peerClose && this.sentClose && !this.failure),
		});
		const waiter = this.readWaiter;
		this.readWaiter = undefined;
		if (this.failure) waiter?.reject(this.failure);
		else waiter?.resolve(undefined);
		void this.writeTail.then(() => {
			this.resolveClosed(result);
			this.onClosed?.();
		});
	};
}
