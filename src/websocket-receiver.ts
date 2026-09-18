import { AgentBrowserError } from "./errors.js";
import {
	type NativeWebSocketFrame,
	type NativeWebSocketServerFrameHeader,
	inspectNativeWebSocketServerFrameHeader,
} from "./websocket-frames.js";

export interface WebSocketReceiverLimits {
	maxFrameBytes: number;
	maxMessageBytes: number;
	maxFramesPerPush: number;
}

export type WebSocketIncomingEvent =
	| { type: "message"; data: string | Uint8Array }
	| { type: "ping" | "pong"; payload: Uint8Array }
	| { type: "close"; code: number | undefined; reason: string };

function decodeText(payload: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			payload,
		);
	} catch (error) {
		if (!(error instanceof TypeError)) throw error;
		throw new AgentBrowserError("network-error", "Invalid WebSocket UTF-8");
	}
}

function decodeClose(payload: Uint8Array): WebSocketIncomingEvent {
	if (payload.length === 0)
		return { type: "close", code: undefined, reason: "" };
	const code = payload[0] * 256 + payload[1];
	if (
		!(
			(code >= 1000 &&
				code <= 1014 &&
				code !== 1004 &&
				code !== 1005 &&
				code !== 1006) ||
			(code >= 3000 && code <= 4999)
		)
	)
		throw new AgentBrowserError(
			"network-error",
			"Invalid WebSocket close code",
		);
	return { type: "close", code, reason: decodeText(payload.subarray(2)) };
}

export class WebSocketReceiver {
	private readonly limits: WebSocketReceiverLimits;
	private readonly header = new Uint8Array(10);
	private headerBytes = 0;
	private frame: NativeWebSocketFrame | undefined;
	private payloadBytes = 0;
	private messageOpcode: 1 | 2 | undefined;
	private messageBytes = 0;
	private assembly: Uint8Array | undefined;
	private state: "open" | "received-close" | "closed" = "open";

	constructor(limits: WebSocketReceiverLimits) {
		if (!limits)
			throw new AgentBrowserError("invalid-input", "Missing WebSocket limits");
		const { maxFrameBytes, maxMessageBytes, maxFramesPerPush } = limits;
		for (const bound of [maxFrameBytes, maxMessageBytes, maxFramesPerPush])
			if (!Number.isSafeInteger(bound) || bound < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"WebSocket receiver limits must be positive safe integers",
				);
		if (maxFrameBytes > maxMessageBytes)
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket frame bound must not exceed the message bound",
			);
		this.limits = { maxFrameBytes, maxMessageBytes, maxFramesPerPush };
	}

	push(chunk: Uint8Array): readonly WebSocketIncomingEvent[] {
		if (this.state === "closed")
			throw new AgentBrowserError("closed", "WebSocket receiver is closed");
		if (this.state === "received-close") return [];
		if (!(chunk instanceof Uint8Array))
			throw new AgentBrowserError("invalid-input", "Expected WebSocket bytes");
		const events: WebSocketIncomingEvent[] = [];
		let outputBytes = 0;
		let processedFrames = 0;
		let offset = 0;
		try {
			while (offset < chunk.length) {
				if (processedFrames >= this.limits.maxFramesPerPush)
					throw new AgentBrowserError(
						"resource-limit",
						"WebSocket frame work exceeds the per-push bound",
					);
				if (!this.frame) {
					this.header[this.headerBytes++] = chunk[offset++];
					const header = inspectNativeWebSocketServerFrameHeader(
						this.header.subarray(0, this.headerBytes),
						this.limits.maxFrameBytes,
					);
					if (!header) continue;
					this.admitFrame(header);
					this.frame = {
						fin: header.fin,
						opcode: header.opcode,
						payload: new Uint8Array(header.payloadLength),
					};
					this.headerBytes = 0;
				}
				const frame = this.frame;
				const copiedBytes = Math.min(
					frame.payload.length - this.payloadBytes,
					chunk.length - offset,
				);
				frame.payload.set(
					chunk.subarray(offset, offset + copiedBytes),
					this.payloadBytes,
				);
				this.payloadBytes += copiedBytes;
				offset += copiedBytes;
				if (this.payloadBytes !== frame.payload.length) continue;
				this.frame = undefined;
				this.payloadBytes = 0;
				processedFrames++;
				const eventBytes =
					frame.payload.length + (frame.opcode === 0 ? this.messageBytes : 0);
				if (frame.fin && eventBytes > this.limits.maxMessageBytes - outputBytes)
					throw new AgentBrowserError(
						"resource-limit",
						"WebSocket events exceed the per-push byte bound",
					);
				const event = this.completeFrame(frame);
				if (event) {
					outputBytes += eventBytes;
					events.push(event);
				}
				if (event?.type === "close") break;
			}
			return events;
		} catch (error) {
			this.close();
			if (!(error instanceof RangeError)) throw error;
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket receiver exceeds an allocation limit",
			);
		}
	}

	close(): void {
		this.clear();
		this.state = "closed";
	}

	metrics() {
		return Object.freeze({
			state: this.state,
			partialFrameAllocatedBytes: this.frame?.payload.byteLength ?? 0,
			assembledMessageBytes: this.messageBytes,
			assemblyCapacityBytes: this.assembly?.byteLength ?? 0,
		});
	}

	private admitFrame(header: NativeWebSocketServerFrameHeader): void {
		const { opcode, payloadLength } = header;
		if (opcode === 0 && this.messageOpcode === undefined)
			throw new AgentBrowserError(
				"network-error",
				"WebSocket continuation requires an open message",
			);
		if ((opcode === 1 || opcode === 2) && this.messageOpcode !== undefined)
			throw new AgentBrowserError(
				"network-error",
				"WebSocket data frame interrupts a fragmented message",
			);
		if (
			opcode < 8 &&
			payloadLength > this.limits.maxMessageBytes - this.messageBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket message exceeds its byte bound",
			);
	}

	private completeFrame(
		frame: NativeWebSocketFrame,
	): WebSocketIncomingEvent | undefined {
		const { fin, opcode, payload } = frame;
		if (opcode === 8) {
			const event = decodeClose(payload);
			this.clear();
			this.state = "received-close";
			return event;
		}
		if (opcode === 9 || opcode === 10)
			return { type: opcode === 9 ? "ping" : "pong", payload };
		const messageOpcode = opcode === 0 ? this.messageOpcode : opcode;
		if (!fin) {
			this.messageOpcode = messageOpcode;
			this.appendFragment(payload);
			return undefined;
		}
		let message = payload;
		if (this.assembly) {
			message = new Uint8Array(this.messageBytes + payload.length);
			message.set(this.assembly.subarray(0, this.messageBytes));
			message.set(payload, this.messageBytes);
		}
		this.messageOpcode = undefined;
		this.messageBytes = 0;
		this.assembly = undefined;
		return {
			type: "message",
			data: messageOpcode === 1 ? decodeText(message) : message,
		};
	}

	private appendFragment(payload: Uint8Array): void {
		if (payload.length === 0) return;
		const requiredBytes = this.messageBytes + payload.length;
		let assembly = this.assembly;
		if (!assembly || requiredBytes > assembly.length) {
			const capacity = assembly?.length ?? 0;
			const grownCapacity =
				capacity + Math.min(capacity, this.limits.maxMessageBytes - capacity);
			const grown = new Uint8Array(Math.max(requiredBytes, grownCapacity));
			if (assembly) grown.set(assembly.subarray(0, this.messageBytes));
			assembly = grown;
			this.assembly = assembly;
		}
		assembly.set(payload, this.messageBytes);
		this.messageBytes = requiredBytes;
	}

	private clear(): void {
		this.header.fill(0);
		this.headerBytes = 0;
		this.frame = undefined;
		this.payloadBytes = 0;
		this.messageOpcode = undefined;
		this.messageBytes = 0;
		this.assembly = undefined;
	}
}
