import { AgentBrowserError } from "./errors.js";
import type { FidoHidReportTransport } from "./fido-hid-connection.js";
import { fidoHidMaximumPayload } from "./fido-hid-packets.js";
import {
	decodeLinuxHidrawInputReport,
	encodeLinuxHidrawOutputReport,
} from "./linux-hidraw-reports.js";

export interface NodeHidrawHandle {
	read(
		buffer: Uint8Array,
		offset: number,
		length: number,
		position: null,
	): Promise<{ bytesRead: number }>;
	write(
		buffer: Uint8Array,
		offset: number,
		length: number,
		position: null,
	): Promise<{ bytesWritten: number }>;
	close(): Promise<void>;
}

export interface NodeHidrawTransportOptions {
	inputReportBytes: number;
	outputReportBytes: number;
	inputReportId?: number;
	outputReportId?: number;
}

export type NodeHidrawTransportState =
	| "open"
	| "closing"
	| "closed"
	| "close-failed";

const claimedHandles = new WeakSet<object>();

function invalidInput(): AgentBrowserError {
	return new AgentBrowserError(
		"invalid-input",
		"Invalid hidraw transport input.",
	);
}

function unavailable(): AgentBrowserError {
	return new AgentBrowserError(
		"not-actionable",
		"Hidraw transport operation is already owned.",
	);
}

function closed(): AgentBrowserError {
	return new AgentBrowserError("closed", "Hidraw transport is closed.");
}

function ioFailure(): AgentBrowserError {
	return new AgentBrowserError(
		"unsupported",
		"Hidraw transport operation failed.",
	);
}

function emptyQueue(error: unknown): boolean {
	try {
		if (typeof error !== "object" || error === null) return false;
		const property = Object.getOwnPropertyDescriptor(error, "code");
		if (property === undefined) return false;
		const code =
			"value" in property ? property.value : Reflect.get(error, "code");
		return code === "EAGAIN" || code === "EWOULDBLOCK";
	} catch {
		return false;
	}
}

export class NodeHidrawTransport implements FidoHidReportTransport {
	private readonly readHandle: NodeHidrawHandle["read"];
	private readonly writeHandle: NodeHidrawHandle["write"];
	private readonly closeHandle: NodeHidrawHandle["close"];
	private readonly inputReportBytes: number;
	private readonly outputReportBytes: number;
	private readonly inputReportId: number;
	private readonly outputReportId: number;
	private currentState: NodeHidrawTransportState = "open";
	private pendingRead: Promise<Uint8Array> | undefined;
	private pendingWrite: Promise<number> | undefined;
	private closingPromise: Promise<void> | undefined;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private retryWake: (() => void) | undefined;

	constructor(handle: NodeHidrawHandle, options: NodeHidrawTransportOptions) {
		let read: NodeHidrawHandle["read"];
		let write: NodeHidrawHandle["write"];
		let close: NodeHidrawHandle["close"];
		let inputBytes: number;
		let outputBytes: number;
		let inputId: number;
		let outputId: number;
		try {
			if (typeof handle !== "object" || handle === null) throw invalidInput();
			inputBytes = options.inputReportBytes;
			outputBytes = options.outputReportBytes;
			if (!Number.isInteger(inputBytes) || !Number.isInteger(outputBytes))
				throw invalidInput();
			const selectedInputId = options.inputReportId;
			const selectedOutputId = options.outputReportId;
			inputId = selectedInputId === undefined ? 0 : selectedInputId;
			outputId = selectedOutputId === undefined ? 0 : selectedOutputId;
			fidoHidMaximumPayload(inputBytes);
			fidoHidMaximumPayload(outputBytes);
			if (
				!Number.isInteger(inputId) ||
				inputId < 0 ||
				inputId > 255 ||
				!Number.isInteger(outputId) ||
				outputId < 0 ||
				outputId > 255
			)
				throw invalidInput();
			read = handle.read;
			write = handle.write;
			close = handle.close;
			if (
				typeof read !== "function" ||
				typeof write !== "function" ||
				typeof close !== "function"
			)
				throw invalidInput();
			read = Function.prototype.bind.call(read, handle);
			write = Function.prototype.bind.call(write, handle);
			close = Function.prototype.bind.call(close, handle);
		} catch {
			throw invalidInput();
		}
		if (claimedHandles.has(handle)) throw unavailable();
		claimedHandles.add(handle);
		this.inputReportBytes = inputBytes;
		this.outputReportBytes = outputBytes;
		this.inputReportId = inputId;
		this.outputReportId = outputId;
		this.readHandle = read;
		this.writeHandle = write;
		this.closeHandle = close;
	}

	get state(): NodeHidrawTransportState {
		return this.currentState;
	}

	read(): Promise<Uint8Array> {
		if (this.currentState !== "open") return Promise.reject(closed());
		if (this.pendingRead !== undefined) return Promise.reject(unavailable());
		const operation = Promise.resolve()
			.then(() => this.performRead())
			.then((report) => {
				if (this.currentState !== "open") {
					report.fill(0);
					throw closed();
				}
				return report;
			});
		this.pendingRead = operation;
		const clear = () => {
			if (this.pendingRead === operation) this.pendingRead = undefined;
		};
		void operation.then(clear, clear);
		return operation;
	}

	write(report: Uint8Array): Promise<number> {
		if (this.currentState !== "open") return Promise.reject(closed());
		if (this.pendingWrite !== undefined) return Promise.reject(unavailable());
		let output: Uint8Array;
		try {
			output = encodeLinuxHidrawOutputReport(
				report,
				this.outputReportBytes,
				this.outputReportId,
			);
		} catch {
			return Promise.reject(invalidInput());
		}
		if (this.currentState !== "open" || this.pendingWrite !== undefined) {
			output.fill(0);
			return Promise.reject(
				this.currentState !== "open" ? closed() : unavailable(),
			);
		}
		const operation = Promise.resolve()
			.then(() => this.performWrite(output))
			.then((count) => {
				this.assertOpen();
				return count;
			});
		this.pendingWrite = operation;
		const clear = () => {
			if (this.pendingWrite === operation) this.pendingWrite = undefined;
		};
		void operation.then(clear, clear);
		return operation;
	}

	close(): Promise<void> {
		if (this.closingPromise !== undefined) return this.closingPromise;
		this.currentState = "closing";
		const pending = [this.pendingRead, this.pendingWrite].filter(
			(operation) => operation !== undefined,
		);
		const closeOperation = Promise.resolve()
			.then(() => this.closeHandle())
			.catch(() => {
				this.currentState = "close-failed";
				throw ioFailure();
			});
		this.closingPromise = Promise.allSettled([...pending, closeOperation]).then(
			(results) => {
				if (results[results.length - 1].status === "rejected") {
					this.currentState = "close-failed";
					throw ioFailure();
				}
				this.currentState = "closed";
			},
		);
		void this.closingPromise.catch(() => {});
		if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		const wake = this.retryWake;
		this.retryWake = undefined;
		wake?.();
		return this.closingPromise;
	}

	private assertOpen(): void {
		if (this.currentState !== "open") throw closed();
	}

	private waitForRetry(): Promise<void> {
		return new Promise((resolve) => {
			if (this.currentState !== "open") {
				resolve();
				return;
			}
			this.retryWake = resolve;
			this.retryTimer = setTimeout(() => {
				this.retryTimer = undefined;
				this.retryWake = undefined;
				resolve();
			}, 10);
		});
	}

	private async performRead(): Promise<Uint8Array> {
		const expected = this.inputReportBytes + (this.inputReportId === 0 ? 0 : 1);
		const input = new Uint8Array(expected + 1);
		try {
			while (true) {
				this.assertOpen();
				let result: { bytesRead: number };
				try {
					result = await this.readHandle(input, 0, input.length, null);
				} catch (error) {
					this.assertOpen();
					if (!emptyQueue(error)) throw error;
					this.assertOpen();
					input.fill(0);
					await this.waitForRetry();
					continue;
				}
				this.assertOpen();
				const count = result.bytesRead;
				this.assertOpen();
				if (!Number.isInteger(count) || count !== expected) throw ioFailure();
				return decodeLinuxHidrawInputReport(
					input.subarray(0, count),
					this.inputReportBytes,
					this.inputReportId,
				);
			}
		} catch {
			const error = this.currentState === "open" ? ioFailure() : closed();
			if (this.currentState === "open") void this.close();
			throw error;
		} finally {
			input.fill(0);
		}
	}

	private async performWrite(output: Uint8Array): Promise<number> {
		try {
			this.assertOpen();
			const result = await this.writeHandle(output, 0, output.length, null);
			this.assertOpen();
			const count = result.bytesWritten;
			this.assertOpen();
			if (!Number.isInteger(count) || count !== output.length)
				throw ioFailure();
			return this.outputReportBytes;
		} catch {
			const error = this.currentState === "open" ? ioFailure() : closed();
			if (this.currentState === "open") void this.close();
			throw error;
		} finally {
			output.fill(0);
		}
	}
}
