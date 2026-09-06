import { AgentBrowserError } from "./errors.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import {
	copyFidoHidChannel,
	decodeFidoHidPacket,
	encodeFidoHidMessage,
	fidoHidMaximumPayload,
} from "./fido-hid-packets.js";
import {
	type FidoHidKeepaliveStatus,
	type FidoHidResponseError,
	decodeFidoHidResponseControl,
} from "./fido-hid-response-control.js";

export interface FidoHidReportTransport {
	read(): Promise<Uint8Array>;
	write(report: Uint8Array): Promise<number>;
	close(): Promise<void>;
}

export interface FidoHidConnectionOptions {
	inputReportBytes?: number;
	outputReportBytes?: number;
}

export interface FidoHidExchangeOptions {
	timeoutMs?: number;
	maxReports?: number;
	signal?: AbortSignal;
}

export type FidoHidCborResult =
	| { kind: "response"; payload: Uint8Array }
	| { kind: "error"; code: number; error: FidoHidResponseError };

export type FidoHidConnectionState =
	| "idle"
	| "active"
	| "closing"
	| "closed"
	| "close-failed";

interface Transaction {
	request: readonly Uint8Array[];
	assembler: FidoHidMessageAssembler;
	phase: "sending" | "waiting";
	stopped: boolean;
	cancelRequested: boolean;
	maxReports: number;
	deadline: number;
	cancelDeadline: number | undefined;
	signal: AbortSignal | undefined;
	abortListener: (() => void) | undefined;
	timer: ReturnType<typeof setTimeout> | undefined;
	cancelTimer: ReturnType<typeof setTimeout> | undefined;
	cancellation: Promise<void> | undefined;
	resolve: (result: FidoHidCborResult) => void;
	reject: (error: AgentBrowserError) => void;
}

const claimedTransports = new WeakSet<object>();
const signalAborted = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;

function invalidInput(): AgentBrowserError {
	return new AgentBrowserError(
		"invalid-input",
		"Invalid FIDO HID connection input.",
	);
}

function aborted(): AgentBrowserError {
	return new AgentBrowserError("aborted", "FIDO HID exchange aborted.");
}

function closed(): AgentBrowserError {
	return new AgentBrowserError("closed", "FIDO HID connection closed.");
}

function exchangeOptions(options: FidoHidExchangeOptions) {
	try {
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		)
			throw invalidInput();
		const timeoutOption = options.timeoutMs;
		const reportOption = options.maxReports;
		const signal = options.signal;
		const timeoutMs = timeoutOption === undefined ? 120_000 : timeoutOption;
		const maxReports = reportOption === undefined ? 4096 : reportOption;
		if (
			!Number.isSafeInteger(timeoutMs) ||
			timeoutMs < 1 ||
			timeoutMs > 600_000 ||
			!Number.isSafeInteger(maxReports) ||
			maxReports < 1 ||
			maxReports > 16_384
		)
			throw invalidInput();
		const alreadyAborted =
			signal === undefined ? false : signalAborted?.call(signal);
		if (typeof alreadyAborted !== "boolean") throw invalidInput();
		return { timeoutMs, maxReports, signal, alreadyAborted };
	} catch {
		throw invalidInput();
	}
}

export class FidoHidCborConnection {
	readonly #channel: Uint8Array;
	readonly #inputReportBytes: number;
	readonly #outputReportBytes: number;
	readonly #read: () => Promise<Uint8Array>;
	readonly #writeReport: (report: Uint8Array) => Promise<number>;
	readonly #closeTransport: () => Promise<void>;
	readonly #pending = new Set<Promise<unknown>>();
	#state: FidoHidConnectionState = "idle";
	#job: Transaction | undefined;
	#closePromise: Promise<void> | undefined;
	#keepalive: { code: number; status: FidoHidKeepaliveStatus } | undefined;

	constructor(
		channel: Uint8Array,
		transport: FidoHidReportTransport,
		options: FidoHidConnectionOptions = {},
	) {
		try {
			if (
				transport === null ||
				typeof transport !== "object" ||
				Array.isArray(transport) ||
				options === null ||
				typeof options !== "object" ||
				Array.isArray(options)
			)
				throw invalidInput();
			const inputOption = options.inputReportBytes;
			const outputOption = options.outputReportBytes;
			this.#inputReportBytes = inputOption === undefined ? 64 : inputOption;
			this.#outputReportBytes = outputOption === undefined ? 64 : outputOption;
			fidoHidMaximumPayload(this.#inputReportBytes);
			fidoHidMaximumPayload(this.#outputReportBytes);
			this.#channel = copyFidoHidChannel(channel);
			if (this.#channel.every((byte) => byte === 255)) throw invalidInput();
			const read = transport.read;
			const write = transport.write;
			const close = transport.close;
			if (
				typeof read !== "function" ||
				typeof write !== "function" ||
				typeof close !== "function"
			)
				throw invalidInput();
			this.#read = () => read.call(transport);
			this.#writeReport = (report) => write.call(transport, report);
			this.#closeTransport = () => close.call(transport);
		} catch {
			throw invalidInput();
		}
		if (claimedTransports.has(transport))
			throw new AgentBrowserError(
				"not-actionable",
				"FIDO HID transport already owned.",
			);
		claimedTransports.add(transport);
	}

	get state(): FidoHidConnectionState {
		return this.#state;
	}

	get keepalive():
		| { code: number; status: FidoHidKeepaliveStatus }
		| undefined {
		return this.#state === "active" && this.#keepalive
			? { ...this.#keepalive }
			: undefined;
	}

	async exchange(
		payload: Uint8Array,
		options: FidoHidExchangeOptions = {},
	): Promise<FidoHidCborResult> {
		this.#assertIdle();
		const configured = exchangeOptions(options);
		if (configured.alreadyAborted) throw aborted();
		const request = encodeFidoHidMessage(
			this.#channel,
			0x10,
			payload,
			this.#outputReportBytes,
		);
		const first = decodeFidoHidPacket(request[0], this.#outputReportBytes);
		const validRequest =
			first.type === "initialization" && first.payloadLength !== 0;
		first.data.fill(0);
		first.channel.fill(0);
		if (!validRequest) {
			for (const report of request) report.fill(0);
			throw invalidInput();
		}
		try {
			this.#assertIdle();
		} catch (error) {
			for (const report of request) report.fill(0);
			throw error;
		}
		return new Promise<FidoHidCborResult>((resolve, reject) => {
			const job: Transaction = {
				request,
				assembler: new FidoHidMessageAssembler(
					this.#channel,
					this.#inputReportBytes,
				),
				phase: "sending",
				stopped: false,
				cancelRequested: false,
				maxReports: configured.maxReports,
				deadline: performance.now() + configured.timeoutMs,
				cancelDeadline: undefined,
				signal: configured.signal,
				abortListener: undefined,
				timer: undefined,
				cancelTimer: undefined,
				cancellation: undefined,
				resolve,
				reject,
			};
			this.#job = job;
			this.#state = "active";
			this.#keepalive = undefined;
			try {
				job.timer = setTimeout(
					() =>
						this.#fail(
							job,
							job.cancelRequested
								? aborted()
								: new AgentBrowserError(
										"timeout",
										"FIDO HID exchange deadline exceeded.",
									),
						),
					configured.timeoutMs,
				);
				if (job.signal !== undefined) {
					job.abortListener = () => this.#abort(job);
					addListener.call(job.signal, "abort", job.abortListener, {
						once: true,
					});
					if (signalAborted?.call(job.signal)) this.#abort(job);
				}
			} catch {
				this.#fail(job, invalidInput());
			}
			if (!job.stopped) void this.#run(job);
		});
	}

	close(): Promise<void> {
		if (this.#job) this.#fail(this.#job, closed());
		return this.#beginClose();
	}

	#assertIdle(): void {
		if (this.#state === "active")
			throw new AgentBrowserError(
				"not-actionable",
				"FIDO HID exchange already active.",
			);
		if (this.#state !== "idle") throw closed();
	}

	#operation<Result>(
		job: Transaction,
		action: () => Promise<Result>,
	): Promise<Result> {
		const operation = Promise.resolve()
			.then(() => {
				if (!this.#current(job)) throw closed();
				return action();
			})
			.catch(() => {
				throw new AgentBrowserError(
					"unsupported",
					"FIDO HID transport operation failed.",
				);
			});
		this.#pending.add(operation);
		void operation.then(
			() => this.#pending.delete(operation),
			() => this.#pending.delete(operation),
		);
		return operation;
	}

	async #write(job: Transaction, packet: Uint8Array): Promise<void> {
		const wire = packet.slice();
		try {
			const written = await this.#operation(job, () => this.#writeReport(wire));
			if (written !== this.#outputReportBytes)
				throw new AgentBrowserError(
					"unsupported",
					"Incomplete FIDO HID report write.",
				);
		} finally {
			wire.fill(0);
		}
	}

	async #run(job: Transaction): Promise<void> {
		try {
			for (const packet of job.request) {
				if (!this.#current(job)) return;
				await this.#write(job, packet);
			}
			if (!this.#current(job)) return;
			job.phase = "waiting";
			for (let received = 0; received < job.maxReports; received++) {
				const report = await this.#operation(job, this.#read);
				if (!this.#current(job)) return;
				const message = job.assembler.accept(report);
				if (!message) continue;
				let result: FidoHidCborResult;
				if (message.command === 0x3b || message.command === 0x3f) {
					let control: ReturnType<typeof decodeFidoHidResponseControl>;
					try {
						control = decodeFidoHidResponseControl(
							message.channel,
							message.command,
							message.payload,
						);
					} finally {
						message.payload.fill(0);
						message.channel.fill(0);
					}
					control.channel.fill(0);
					if (control.kind === "keepalive") {
						if (!job.cancelRequested)
							this.#keepalive = { code: control.code, status: control.status };
						job.assembler = new FidoHidMessageAssembler(
							this.#channel,
							this.#inputReportBytes,
						);
						continue;
					}
					result = { kind: "error", code: control.code, error: control.error };
				} else {
					message.channel.fill(0);
					if (message.command !== 0x10 || message.payload.length === 0) {
						message.payload.fill(0);
						throw new AgentBrowserError(
							"invalid-input",
							"Unexpected FIDO HID response.",
						);
					}
					result = { kind: "response", payload: message.payload };
				}
				let transferred = false;
				try {
					if (job.cancelRequested && result.kind === "response")
						result.payload.fill(0);
					if (job.cancellation) await job.cancellation;
					if (!this.#current(job)) return;
					if (job.cancelRequested) {
						this.#finish(job);
						this.#state = "idle";
						job.reject(aborted());
					} else {
						this.#finish(job);
						this.#state = "idle";
						transferred = true;
						job.resolve(result);
					}
					return;
				} finally {
					if (!transferred && result.kind === "response")
						result.payload.fill(0);
				}
			}
			throw new AgentBrowserError(
				"resource-limit",
				"FIDO HID exchange report limit exceeded.",
			);
		} catch (error) {
			if (!job.stopped)
				this.#fail(
					job,
					error instanceof AgentBrowserError
						? error
						: new AgentBrowserError("unsupported", "FIDO HID exchange failed."),
				);
		}
	}

	#abort(job: Transaction): void {
		if (job.stopped || job.cancelRequested) return;
		if (job.phase === "sending") {
			this.#fail(job, aborted());
			return;
		}
		job.cancelRequested = true;
		this.#keepalive = undefined;
		job.cancelDeadline = Math.min(job.deadline, performance.now() + 1000);
		job.cancelTimer = setTimeout(() => this.#fail(job, aborted()), 1000);
		const packet = encodeFidoHidMessage(
			this.#channel,
			0x11,
			new Uint8Array(),
			this.#outputReportBytes,
		)[0];
		job.cancellation = this.#write(job, packet);
		packet.fill(0);
		void job.cancellation.catch(() => this.#fail(job, aborted()));
	}

	#current(job: Transaction): boolean {
		if (job.stopped) return false;
		const now = performance.now();
		if (
			now >= job.deadline ||
			(job.cancelDeadline !== undefined && now >= job.cancelDeadline)
		) {
			this.#fail(
				job,
				job.cancelRequested
					? aborted()
					: new AgentBrowserError(
							"timeout",
							"FIDO HID exchange deadline exceeded.",
						),
			);
			return false;
		}
		return true;
	}

	#finish(job: Transaction): void {
		job.stopped = true;
		if (job.timer !== undefined) clearTimeout(job.timer);
		if (job.cancelTimer !== undefined) clearTimeout(job.cancelTimer);
		if (job.signal && job.abortListener) {
			try {
				removeListener.call(job.signal, "abort", job.abortListener);
			} catch {}
		}
		job.assembler.close();
		for (const packet of job.request) packet.fill(0);
		this.#job = undefined;
		this.#keepalive = undefined;
	}

	#fail(job: Transaction, error: AgentBrowserError): void {
		if (job.stopped) return;
		this.#finish(job);
		this.#beginClose();
		job.reject(error);
	}

	#beginClose(): Promise<void> {
		if (this.#closePromise) return this.#closePromise;
		this.#state = "closing";
		const pending = [...this.#pending];
		const closing = Promise.resolve().then(this.#closeTransport);
		this.#closePromise = Promise.allSettled([...pending, closing]).then(
			(results) => {
				this.#channel.fill(0);
				if (results[results.length - 1].status === "rejected") {
					this.#state = "close-failed";
					throw new AgentBrowserError(
						"unsupported",
						"FIDO HID transport close failed.",
					);
				}
				this.#state = "closed";
			},
		);
		void this.#closePromise.catch(() => {});
		return this.#closePromise;
	}
}
