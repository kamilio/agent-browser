import { AgentBrowserError } from "./errors.js";
import {
	copyFidoHidChannel,
	decodeFidoHidPacket,
	fidoHidMaximumPayload,
} from "./fido-hid-packets.js";

export interface FidoHidMessage {
	channel: Uint8Array;
	command: number;
	payload: Uint8Array;
}

export class FidoHidMessageAssembler {
	readonly #channel: Uint8Array;
	readonly #reportBytes: number;
	readonly #maximumPayload: number;
	#payload: Uint8Array | undefined;
	#command = 0;
	#written = 0;
	#nextSequence = 0;
	#closed = false;

	constructor(channel: Uint8Array, reportBytes = 64) {
		this.#maximumPayload = fidoHidMaximumPayload(reportBytes);
		this.#channel = copyFidoHidChannel(channel);
		this.#reportBytes = reportBytes;
	}

	accept(report: Uint8Array): FidoHidMessage | undefined {
		if (this.#closed)
			throw new AgentBrowserError(
				"closed",
				"FIDO HID message assembler closed",
			);
		try {
			const packet = decodeFidoHidPacket(report, this.#reportBytes);
			if (packet.channel.some((value, index) => value !== this.#channel[index]))
				return undefined;
			if (this.#payload === undefined) {
				if (packet.type !== "initialization")
					throw new AgentBrowserError(
						"invalid-input",
						"FIDO HID message requires an initialization packet",
					);
				if (packet.payloadLength > this.#maximumPayload)
					throw new AgentBrowserError(
						"resource-limit",
						"FIDO HID message payload limit exceeded",
					);
				this.#command = packet.command;
				this.#payload = new Uint8Array(packet.payloadLength);
			} else {
				if (
					packet.type !== "continuation" ||
					packet.sequence !== this.#nextSequence
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid FIDO HID message packet sequence",
					);
				this.#nextSequence++;
			}
			const count = Math.min(
				packet.data.length,
				this.#payload.length - this.#written,
			);
			this.#payload.set(packet.data.subarray(0, count), this.#written);
			this.#written += count;
			if (this.#written !== this.#payload.length) return undefined;
			const message = Object.freeze({
				channel: this.#channel.slice(),
				command: this.#command,
				payload: this.#payload,
			});
			this.#payload = undefined;
			this.close();
			return message;
		} catch (error) {
			this.close();
			throw error;
		}
	}

	close() {
		if (this.#closed) return;
		this.#closed = true;
		this.#payload?.fill(0);
		this.#payload = undefined;
		this.#channel.fill(0);
		this.#command = 0;
		this.#written = 0;
		this.#nextSequence = 0;
	}
}
