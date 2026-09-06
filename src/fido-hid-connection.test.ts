import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const foreignChannel = new Uint8Array([0x98, 0x76, 0x54, 0x32]);
const request = new Uint8Array([0xa5, 0x5a, 0xc3]);
const privateText = "private adapter secret a55ac3";
type ConnectionOptions = ConstructorParameters<typeof FidoHidCborConnection>[2];
type ExchangeOptions = Parameters<FidoHidCborConnection["exchange"]>[1];
type Outcome<Value> = { value: Value } | { error: unknown };

function observe<Value>(promise: Promise<Value>): Promise<Outcome<Value>> {
	return promise.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
}

const pendingCleanup: Array<() => void> = [];
const connections: FidoHidCborConnection[] = [];

function deferred<Value>(cleanupValue: Value) {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	void promise.catch(() => undefined);
	pendingCleanup.push(() => resolve(cleanupValue));
	return { promise, resolve, reject };
}

function packets(
	command = 0x10,
	payload = new Uint8Array([0]),
	reportBytes = 64,
	packetChannel = channel,
) {
	return encodeFidoHidMessage(packetChannel, command, payload, reportBytes);
}

class FakeTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	readonly reads: ReturnType<typeof deferred<Uint8Array>>[] = [];
	readCalls = 0;
	closeCalls = 0;
	onWrite?: (report: Uint8Array, index: number) => Promise<number>;
	onRead?: () => Promise<Uint8Array>;
	onClose?: () => Promise<void>;

	write(report: Uint8Array): Promise<number> {
		const owned = new Uint8Array(report);
		this.reports.push(owned);
		return (
			this.onWrite?.(owned, this.reports.length - 1) ??
			Promise.resolve(owned.length)
		);
	}

	read(): Promise<Uint8Array> {
		this.readCalls++;
		if (this.onRead) return this.onRead();
		const report = this.incoming.shift();
		if (report) return Promise.resolve(report);
		const pending = deferred(packets()[0]);
		this.reads.push(pending);
		return pending.promise;
	}

	close(): Promise<void> {
		this.closeCalls++;
		return this.onClose?.() ?? Promise.resolve();
	}
}

function create(
	options?: ConnectionOptions,
	transport = new FakeTransport(),
	connectionChannel = channel,
) {
	const connection = new FidoHidCborConnection(
		connectionChannel,
		transport,
		options,
	);
	connections.push(connection);
	return { connection, transport };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

function safeError(error: unknown, code: ErrorCode) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
	expect((error as Error).message).not.toMatch(/private|a55ac3|165,90,195/i);
	return error as AgentBrowserError;
}

function throwsCode(action: () => unknown, code: ErrorCode = "invalid-input") {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	return safeError(caught, code);
}

async function fails<Value>(outcome: Promise<Outcome<Value>>, code: ErrorCode) {
	const result = await outcome;
	expect(result).toHaveProperty("error");
	return safeError("error" in result ? result.error : undefined, code);
}

async function expectQuarantined(
	connection: FidoHidCborConnection,
	transport: FakeTransport,
) {
	await flush();
	expect(connection.state).toBe("closed");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.closeCalls).toBe(1);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	await fails(observe(connection.exchange(request)), "closed");
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(async () => {
	const closures = connections.map((connection) => observe(connection.close()));
	for (const settle of pendingCleanup) settle();
	await flush();
	await Promise.all(closures);
	connections.length = 0;
	pendingCleanup.length = 0;
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("constructs idle without I/O and owns a copy of the allocated CID", async () => {
	const supplied = channel.slice();
	const { connection, transport } = create(undefined, undefined, supplied);
	supplied.fill(0);
	expect(connection.state).toBe("idle");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(transport.reports[0].subarray(0, 4)).toEqual(channel);
});

it("rejects zero, broadcast, wrong-length and non-byte CIDs without I/O", () => {
	for (const value of [
		new Uint8Array(4),
		new Uint8Array(4).fill(255),
		new Uint8Array(3),
		new Uint8Array(5),
		[1, 2, 3, 4],
		null,
	]) {
		const transport = new FakeTransport();
		throwsCode(() => new FidoHidCborConnection(value as Uint8Array, transport));
		expect(transport.reports).toHaveLength(0);
		expect(transport.readCalls).toBe(0);
		expect(transport.closeCalls).toBe(0);
	}
});

it("accepts independent inclusive report-size bounds without construction I/O", () => {
	for (const options of [
		{ inputReportBytes: 7, outputReportBytes: 64 },
		{ inputReportBytes: 64, outputReportBytes: 7 },
	]) {
		const { connection, transport } = create(options);
		expect(connection.state).toBe("idle");
		expect(transport.readCalls).toBe(0);
		expect(transport.reports).toHaveLength(0);
	}
});

it("rejects invalid report sizes without coercing hostile numeric objects", () => {
	const coerce = vi.fn(() => {
		throw new Error(privateText);
	});
	for (const [key, value] of [
		["inputReportBytes", 6],
		["outputReportBytes", 65],
		["inputReportBytes", 7.5],
		["outputReportBytes", Number.NaN],
		["inputReportBytes", "64"],
		["outputReportBytes", { valueOf: coerce }],
		["inputReportBytes", null],
	] as const) {
		const transport = new FakeTransport();
		throwsCode(
			() =>
				new FidoHidCborConnection(channel, transport, {
					[key]: value,
				} as ConnectionOptions),
		);
		expect(transport.closeCalls).toBe(0);
	}
	expect(coerce).not.toHaveBeenCalled();
});

it("snapshots constructor getters once and sanitizes hostile getter failures", async () => {
	const input = vi.fn(() => 64);
	const output = vi.fn(() => 8);
	const options = Object.defineProperties(
		{},
		{
			inputReportBytes: { get: input },
			outputReportBytes: { get: output },
		},
	);
	const { connection, transport } = create(options);
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(input).toHaveBeenCalledTimes(1);
	expect(output).toHaveBeenCalledTimes(1);
	expect(transport.reports.every((report) => report.length === 8)).toBe(true);
	const messages: string[] = [];
	for (const text of [privateText, "private alternate secret"]) {
		const hostile = Object.defineProperty({}, "inputReportBytes", {
			get() {
				throw new Error(text);
			},
		});
		messages.push(
			throwsCode(
				() => new FidoHidCborConnection(channel, new FakeTransport(), hostile),
			).message,
		);
	}
	expect(messages[0]).toBe(messages[1]);
});

it("claims a transport once for its lifetime including after close", async () => {
	const { connection, transport } = create();
	throwsCode(
		() => new FidoHidCborConnection(channel, transport),
		"not-actionable",
	);
	await connection.close();
	throwsCode(
		() => new FidoHidCborConnection(foreignChannel, transport),
		"not-actionable",
	);
	expect(transport.closeCalls).toBe(1);
	expect(transport.reports).toHaveLength(0);
});

it("rejects empty and non-byte requests while leaving a usable idle connection", async () => {
	const { connection, transport } = create();
	for (const value of [new Uint8Array(), [1], new Uint16Array([1]), null]) {
		await fails(
			observe(connection.exchange(value as Uint8Array)),
			"invalid-input",
		);
		expect(connection.state).toBe("idle");
	}
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
	transport.incoming.push(...packets());
	await connection.exchange(request);
});

it("validates timeout integers and bounds without coercion or I/O", async () => {
	const { connection, transport } = create();
	const coerce = vi.fn(() => {
		throw new Error(privateText);
	});
	for (const timeoutMs of [
		0,
		600001,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"1",
		null,
		{ valueOf: coerce },
	]) {
		await fails(
			observe(
				connection.exchange(request, {
					timeoutMs: timeoutMs as number,
				}),
			),
			"invalid-input",
		);
	}
	expect(coerce).not.toHaveBeenCalled();
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(0);
});

it("validates report-budget integers and bounds without coercion or I/O", async () => {
	const { connection, transport } = create();
	const coerce = vi.fn(() => {
		throw new Error(privateText);
	});
	for (const maxReports of [
		0,
		16385,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"1",
		null,
		{ valueOf: coerce },
	]) {
		await fails(
			observe(
				connection.exchange(request, {
					maxReports: maxReports as number,
				}),
			),
			"invalid-input",
		);
	}
	expect(coerce).not.toHaveBeenCalled();
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(0);
});

it("rejects non-native abort-signal lookalikes without calling their hooks", async () => {
	const { connection, transport } = create();
	const hook = vi.fn(() => {
		throw new Error(privateText);
	});
	const signal = {
		aborted: false,
		addEventListener: hook,
		removeEventListener: hook,
	};
	await fails(
		observe(
			connection.exchange(request, {
				signal: signal as unknown as AbortSignal,
			}),
		),
		"invalid-input",
	);
	expect(hook).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(0);
	expect(connection.state).toBe("idle");
});

it("normalizes throwing exchange-option getters to fixed safe input errors", async () => {
	const { connection, transport } = create();
	const messages: string[] = [];
	for (const text of [privateText, "private alternate secret"]) {
		const options = Object.defineProperty({}, "timeoutMs", {
			get() {
				throw new Error(text);
			},
		});
		messages.push(
			(
				await fails(
					observe(connection.exchange(request, options)),
					"invalid-input",
				)
			).message,
		);
	}
	expect(messages[0]).toBe(messages[1]);
	expect(transport.reports).toHaveLength(0);
	expect(transport.closeCalls).toBe(0);
});

it("snapshots exchange getters once and accepts inclusive option bounds", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const timeout = vi.fn(() => 600000);
	const budget = vi.fn(() => 16384);
	const signal = vi.fn(() => controller.signal);
	const options = Object.defineProperties(
		{},
		{
			timeoutMs: { get: timeout },
			maxReports: { get: budget },
			signal: { get: signal },
		},
	);
	transport.incoming.push(...packets(), ...packets());
	await connection.exchange(request, options);
	expect(timeout).toHaveBeenCalledTimes(1);
	expect(budget).toHaveBeenCalledTimes(1);
	expect(signal).toHaveBeenCalledTimes(1);
	await connection.exchange(request, { timeoutMs: 1, maxReports: 1 });
	expect(connection.state).toBe("idle");
});

it("rejects a pre-aborted signal without any I/O or releasing ownership", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	controller.abort(new Error(privateText));
	await fails(
		observe(connection.exchange(request, { signal: controller.signal })),
		"aborted",
	);
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
	transport.incoming.push(...packets());
	await connection.exchange(request);
});

it("writes an independent normalized default CBOR fixture and returns opaque bytes", async () => {
	const { connection, transport } = create();
	const payload = new Uint8Array([0xfe, 0xde, 0xad]);
	transport.incoming.push(...packets(0x10, payload));
	expect(await connection.exchange(request)).toEqual({
		kind: "response",
		payload,
	});
	const expected = new Uint8Array(64);
	expected.set([0x12, 0x34, 0xab, 0xcd, 0x90, 0, 3, 0xa5, 0x5a, 0xc3]);
	expect(transport.reports).toEqual([expected]);
	expect(transport.readCalls).toBe(1);
	expect(connection.state).toBe("idle");
});

it("independently frames seven-byte output with sixty-four-byte input", async () => {
	const { connection, transport } = create({
		outputReportBytes: 7,
		inputReportBytes: 64,
	});
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(transport.reports).toEqual([
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0x90, 0, 3]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0, 0xa5, 0x5a]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 1, 0xc3, 0]),
	]);
	expect(transport.readCalls).toBe(1);
});

it("assembles seven-byte input independently of sixty-four-byte output", async () => {
	const { connection, transport } = create({
		inputReportBytes: 7,
		outputReportBytes: 64,
	});
	transport.incoming.push(
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0x90, 0, 3]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0, 0xe1, 0xe2]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 1, 0xe3, 0]),
	);
	expect(await connection.exchange(request)).toEqual({
		kind: "response",
		payload: new Uint8Array([0xe1, 0xe2, 0xe3]),
	});
	expect(transport.reports).toHaveLength(1);
	expect(transport.reports[0]).toHaveLength(64);
	expect(transport.readCalls).toBe(3);
});

it("copies the whole request before first I/O without modifying caller bytes", async () => {
	const { connection, transport } = create({ outputReportBytes: 8 });
	const supplied = new Uint8Array([0xa5, 0x5a, 0xc3, 0x41]);
	transport.onWrite = (report, index) => {
		if (index === 0) supplied.fill(0x77);
		return Promise.resolve(report.length);
	};
	transport.incoming.push(...packets());
	await connection.exchange(supplied);
	expect(
		transport.reports.map((report) =>
			Array.from(report.subarray(report[4] === 0x90 ? 7 : 5)),
		),
	).toEqual([[0xa5], [0x5a, 0xc3, 0x41]]);
	expect(supplied).toEqual(new Uint8Array(4).fill(0x77));
	expect(request).toEqual(new Uint8Array([0xa5, 0x5a, 0xc3]));
});

it("awaits each request write and starts reading only after the final write", async () => {
	const { connection, transport } = create({ outputReportBytes: 8 });
	const first = deferred(8);
	const second = deferred(8);
	transport.onWrite = (_report, index) =>
		index === 0 ? first.promise : second.promise;
	transport.incoming.push(...packets());
	const result = observe(connection.exchange(request));
	await flush();
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	first.resolve(8);
	await flush();
	expect(transport.reports).toHaveLength(2);
	expect(transport.readCalls).toBe(0);
	second.resolve(8);
	expect(await result).toMatchObject({ value: { kind: "response" } });
	expect(transport.readCalls).toBe(1);
});

it("rejects concurrent exchanges without changing the active transaction", async () => {
	const { connection, transport } = create();
	const first = observe(connection.exchange(request));
	await flush();
	await fails(
		observe(connection.exchange(new Uint8Array([9]))),
		"not-actionable",
	);
	expect(connection.state).toBe("active");
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
	transport.reads[0].resolve(packets()[0]);
	expect(await first).toMatchObject({ value: { kind: "response" } });
});

it("marks the connection active before reentrant transport callbacks run", async () => {
	const { connection, transport } = create();
	let reentrant: ReturnType<typeof observe> | undefined;
	transport.onWrite = (report) => {
		expect(connection.state).toBe("active");
		reentrant = observe(connection.exchange(request));
		return Promise.resolve(report.length);
	};
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(reentrant).toBeDefined();
	if (!reentrant) throw new Error("Expected reentrant exchange");
	await fails(reentrant, "not-actionable");
	expect(transport.reports).toHaveLength(1);
});

it("publishes fresh known and unknown KEEPALIVEs without completing the exchange", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request));
	await flush();
	for (const [index, code, status] of [
		[0, 1, "STATUS_PROCESSING"],
		[1, 2, "STATUS_UPNEEDED"],
		[2, 0xf2, "unknown"],
	] as const) {
		transport.reads[index].resolve(packets(0x3b, new Uint8Array([code]))[0]);
		await flush();
		const progress = connection.keepalive;
		expect(progress).toEqual({ code, status });
		expect(connection.keepalive).not.toBe(progress);
		expect(connection.state).toBe("active");
		if (progress) Reflect.set(progress, "code", 0);
		expect(connection.keepalive).toEqual({ code, status });
	}
	transport.reads[3].resolve(packets()[0]);
	await result;
	expect(connection.keepalive).toBeUndefined();
});

it("ignores foreign complete and continuation packets without disturbing assembly", async () => {
	const { connection, transport } = create({ inputReportBytes: 8 });
	const response = packets(0x10, new Uint8Array([4, 5, 6, 7]), 8);
	const foreign = packets(
		0x10,
		new Uint8Array([8, 9, 10, 11]),
		8,
		foreignChannel,
	);
	transport.incoming.push(
		...packets(0x3b, new Uint8Array([2]), 8, foreignChannel),
		response[0],
		foreign[1],
		response[1],
	);
	expect(await connection.exchange(request)).toEqual({
		kind: "response",
		payload: new Uint8Array([4, 5, 6, 7]),
	});
	expect(transport.readCalls).toBe(4);
	expect(connection.keepalive).toBeUndefined();
});

it("returns typed known ERROR results and allows a fresh exchange", async () => {
	const { connection, transport } = create();
	transport.incoming.push(...packets(0x3f, new Uint8Array([6])), ...packets());
	expect(await connection.exchange(request)).toEqual({
		kind: "error",
		code: 6,
		error: "ERR_CHANNEL_BUSY",
	});
	expect(connection.state).toBe("idle");
	expect(await connection.exchange(request)).toMatchObject({
		kind: "response",
	});
	expect(transport.closeCalls).toBe(0);
});

it("preserves unknown terminal ERROR codes rather than rejecting or interpreting them", async () => {
	const { connection, transport } = create();
	transport.incoming.push(...packets(0x3f, new Uint8Array([0xe7])));
	expect(await connection.exchange(request)).toEqual({
		kind: "error",
		code: 0xe7,
		error: "unknown",
	});
	expect(connection.state).toBe("idle");
});

it("isolates response buffers from driver and caller mutation across reuse", async () => {
	const { connection, transport } = create({ inputReportBytes: 8 });
	const payload = new Uint8Array([3, 4, 5, 6]);
	const reports = packets(0x10, payload, 8);
	transport.incoming.push(...reports);
	const first = await connection.exchange(request);
	expect(first).toEqual({ kind: "response", payload });
	for (const report of reports) report.fill(0);
	expect(first).toEqual({ kind: "response", payload });
	if (first.kind === "response") first.payload.fill(0xee);
	transport.incoming.push(
		...packets(0x3b, new Uint8Array([1]), 8),
		...packets(0x10, payload, 8),
	);
	const second = await connection.exchange(request);
	expect(second).toEqual({ kind: "response", payload });
	expect(second).not.toBe(first);
});

it("rejects an empty terminal CBOR payload and quarantines the channel", async () => {
	const { connection, transport } = create();
	transport.incoming.push(...packets(0x10, new Uint8Array()));
	await fails(observe(connection.exchange(request)), "invalid-input");
	await expectQuarantined(connection, transport);
});

it("rejects unexpected commands including an unsolicited CANCEL response", async () => {
	for (const command of [1, 6, 0x11]) {
		const { connection, transport } = create();
		transport.incoming.push(...packets(command));
		await fails(observe(connection.exchange(request)), "invalid-input");
		await expectQuarantined(connection, transport);
	}
});

it("rejects malformed normalized reports without reading another packet", async () => {
	for (const report of [
		new Uint8Array(63),
		new Uint8Array(65),
		new Uint8Array(64),
		[1, 2],
	]) {
		const { connection, transport } = create();
		transport.incoming.push(report as Uint8Array);
		await fails(observe(connection.exchange(request)), "invalid-input");
		expect(transport.readCalls).toBe(1);
		await expectQuarantined(connection, transport);
	}
});

it("rejects orphan, out-of-order and interrupted continuation sequences", async () => {
	for (const variant of ["orphan", "sequence", "initialization"] as const) {
		const { connection, transport } = create({ inputReportBytes: 8 });
		const response = packets(0x10, new Uint8Array([1, 2, 3, 4]), 8);
		if (variant === "orphan") transport.incoming.push(response[1]);
		else {
			const next = variant === "sequence" ? response[1].slice() : response[0];
			if (variant === "sequence") next[4] = 1;
			transport.incoming.push(response[0], next);
		}
		await fails(observe(connection.exchange(request)), "invalid-input");
		await expectQuarantined(connection, transport);
	}
});

it("requires exactly one payload byte in KEEPALIVE and ERROR controls", async () => {
	for (const [command, payload] of [
		[0x3b, new Uint8Array()],
		[0x3b, new Uint8Array([1, 2])],
		[0x3f, new Uint8Array()],
		[0x3f, new Uint8Array([1, 2])],
	] as const) {
		const { connection, transport } = create();
		transport.incoming.push(...packets(command, payload));
		await fails(observe(connection.exchange(request)), "invalid-input");
		await expectQuarantined(connection, transport);
	}
});

it("accepts a terminal response exactly at the all-report budget", async () => {
	const { connection, transport } = create({ inputReportBytes: 8 });
	transport.incoming.push(
		...packets(0x10, new Uint8Array([7]), 8, foreignChannel),
		...packets(0x3b, new Uint8Array([1]), 8),
		...packets(0x10, new Uint8Array([1, 2, 3, 4]), 8),
	);
	expect(await connection.exchange(request, { maxReports: 4 })).toMatchObject({
		kind: "response",
	});
	expect(transport.readCalls).toBe(4);
	expect(connection.state).toBe("idle");
});

it("counts foreign packets against the budget and never reads beyond it", async () => {
	const { connection, transport } = create();
	transport.incoming.push(
		...packets(0x3b, new Uint8Array([1]), 64, foreignChannel),
		...packets(),
	);
	await fails(
		observe(connection.exchange(request, { maxReports: 1 })),
		"resource-limit",
	);
	expect(transport.readCalls).toBe(1);
	expect(transport.incoming).toHaveLength(1);
	await expectQuarantined(connection, transport);
});

it("uses the default 4096-report budget without an extra read", async () => {
	const { connection, transport } = create();
	transport.onRead = () =>
		Promise.resolve(packets(0x3b, new Uint8Array([1]), 64, foreignChannel)[0]);
	await fails(observe(connection.exchange(request)), "resource-limit");
	expect(transport.readCalls).toBe(4096);
	await expectQuarantined(connection, transport);
});

it("does not extend the absolute deadline for KEEPALIVEs or foreign packets", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request, { timeoutMs: 100 }));
	await flush();
	await vi.advanceTimersByTimeAsync(40);
	transport.reads[0].resolve(packets(0x3b, new Uint8Array([1]))[0]);
	await flush();
	await vi.advanceTimersByTimeAsync(40);
	transport.reads[1].resolve(
		packets(0x3b, new Uint8Array([2]), 64, foreignChannel)[0],
	);
	await flush();
	await vi.advanceTimersByTimeAsync(19);
	expect(connection.state).toBe("active");
	await vi.advanceTimersByTimeAsync(1);
	await fails(result, "timeout");
	expect(connection.state).toBe("closing");
	expect(connection.keepalive).toBeUndefined();
	transport.reads[2].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
	expect(transport.readCalls).toBe(3);
});

it("uses a default deadline of 120000 milliseconds", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request));
	await flush();
	await vi.advanceTimersByTimeAsync(119999);
	expect(connection.state).toBe("active");
	await vi.advanceTimersByTimeAsync(1);
	await fails(result, "timeout");
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
});

it("requires exact write counts with no suffix writes, retries or reads", async () => {
	for (const count of [0, 7, 9, 8.5, "8"] as const) {
		const { connection, transport } = create({ outputReportBytes: 8 });
		transport.onWrite = () => Promise.resolve(count as number);
		await fails(observe(connection.exchange(request)), "unsupported");
		expect(transport.reports).toHaveLength(1);
		expect(transport.readCalls).toBe(0);
		await expectQuarantined(connection, transport);
	}
});

it("sanitizes synchronous and asynchronous write failures to a fixed error", async () => {
	const messages: string[] = [];
	for (const synchronous of [true, false]) {
		const { connection, transport } = create();
		transport.onWrite = () => {
			if (synchronous) throw new Error(privateText);
			return Promise.reject(new Error("private alternate write"));
		};
		messages.push(
			(await fails(observe(connection.exchange(request)), "unsupported"))
				.message,
		);
		expect(transport.reports).toHaveLength(1);
		expect(transport.readCalls).toBe(0);
		await expectQuarantined(connection, transport);
	}
	expect(messages[0]).toBe(messages[1]);
});

it("sanitizes read failures without inspecting hostile thrown objects", async () => {
	const inspect = vi.fn(() => {
		throw new Error(privateText);
	});
	const hostile = Object.defineProperties(
		{},
		{
			message: { get: inspect },
			toString: { value: inspect },
		},
	);
	const messages: string[] = [];
	for (const synchronous of [true, false]) {
		const { connection, transport } = create();
		transport.onRead = () => {
			if (synchronous) throw hostile;
			return Promise.reject(new Error(privateText));
		};
		messages.push(
			(await fails(observe(connection.exchange(request)), "unsupported"))
				.message,
		);
		expect(transport.readCalls).toBe(1);
		await expectQuarantined(connection, transport);
	}
	expect(inspect).not.toHaveBeenCalled();
	expect(messages[0]).toBe(messages[1]);
});

it("rejects an unencodable request before I/O without closing an idle connection", async () => {
	const { connection, transport } = create({ outputReportBytes: 7 });
	await fails(
		observe(connection.exchange(new Uint8Array(257))),
		"resource-limit",
	);
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
});

it("aborts a pending first request write without CANCEL or further request writes", async () => {
	const { connection, transport } = create({ outputReportBytes: 8 });
	const pending = deferred(8);
	transport.onWrite = () => pending.promise;
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort(new Error(privateText));
	await fails(result, "aborted");
	expect(connection.state).toBe("closing");
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	pending.resolve(8);
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
});

it("handles reentrant abort during a later request write without sending CANCEL", async () => {
	const { connection, transport } = create({ outputReportBytes: 7 });
	const controller = new AbortController();
	transport.onWrite = (report, index) => {
		if (index === 1) controller.abort();
		return Promise.resolve(report.length);
	};
	await fails(
		observe(connection.exchange(request, { signal: controller.signal })),
		"aborted",
	);
	await expectQuarantined(connection, transport);
	expect(transport.reports.map((report) => report[4])).toEqual([0x90, 0]);
	expect(transport.readCalls).toBe(0);
});

it("sends one independent zero-payload CANCEL and consumes the original terminal response", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort();
	controller.abort();
	await flush();
	const cancel = new Uint8Array(64);
	cancel.set([0x12, 0x34, 0xab, 0xcd, 0x91, 0, 0]);
	expect(transport.reports).toHaveLength(2);
	expect(transport.reports[1]).toEqual(cancel);
	expect(transport.readCalls).toBe(1);
	transport.reads[0].resolve(packets(0x10, new Uint8Array([0xfe, 0x11]))[0]);
	await fails(result, "aborted");
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(transport.reports).toHaveLength(3);
});

it("does not treat a completed CANCEL write as a response or issue a second read", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	let settled = false;
	void result.then(() => {
		settled = true;
	});
	await flush();
	controller.abort();
	await vi.advanceTimersByTimeAsync(999);
	expect(settled).toBe(false);
	expect(connection.state).toBe("active");
	expect(transport.readCalls).toBe(1);
	expect(transport.reports).toHaveLength(2);
	transport.reads[0].resolve(packets(0x3f, new Uint8Array([0xe7]))[0]);
	await fails(result, "aborted");
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
});

it("does not release the channel when a terminal response precedes CANCEL-write settlement", async () => {
	const { connection, transport } = create();
	const cancelWrite = deferred(64);
	transport.onWrite = (report) =>
		report[4] === 0x91 ? cancelWrite.promise : Promise.resolve(report.length);
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort();
	await flush();
	transport.reads[0].resolve(packets()[0]);
	await flush();
	expect(connection.state).toBe("active");
	await fails(observe(connection.exchange(request)), "not-actionable");
	expect(transport.reports).toHaveLength(2);
	cancelWrite.resolve(64);
	await fails(result, "aborted");
	expect(connection.state).toBe("idle");
	transport.incoming.push(...packets());
	await connection.exchange(request);
	expect(transport.reports.map((report) => report[4])).toEqual([
		0x90, 0x91, 0x90,
	]);
});

it("quarantines after the 1000-millisecond abort grace without claiming read interruption", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort();
	await vi.advanceTimersByTimeAsync(1000);
	await fails(result, "aborted");
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
	expect(transport.readCalls).toBe(1);
	expect(transport.reports).toHaveLength(2);
});

it("keeps the original deadline as the upper bound on abort grace", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal, timeoutMs: 100 }),
	);
	await flush();
	await vi.advanceTimersByTimeAsync(90);
	controller.abort();
	await vi.advanceTimersByTimeAsync(9);
	expect(connection.state).toBe("active");
	await vi.advanceTimersByTimeAsync(1);
	await fails(result, "aborted");
	expect(transport.closeCalls).toBe(1);
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
});

it("suppresses progress updates after abort while draining to an original terminal response", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	transport.reads[0].resolve(packets(0x3b, new Uint8Array([1]))[0]);
	await flush();
	expect(connection.keepalive).toEqual({
		code: 1,
		status: "STATUS_PROCESSING",
	});
	controller.abort();
	await flush();
	const atAbort = connection.keepalive;
	transport.reads[1].resolve(packets(0x3b, new Uint8Array([2]))[0]);
	await flush();
	expect(connection.keepalive).toEqual(atAbort);
	transport.reads[2].resolve(packets()[0]);
	await fails(result, "aborted");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.reports).toHaveLength(2);
});

it("quarantines a short or rejected CANCEL write without retrying", async () => {
	for (const rejection of [false, true]) {
		const { connection, transport } = create();
		transport.onWrite = (report) =>
			report[4] !== 0x91
				? Promise.resolve(report.length)
				: rejection
					? Promise.reject(new Error(privateText))
					: Promise.resolve(63);
		const controller = new AbortController();
		const result = observe(
			connection.exchange(request, { signal: controller.signal }),
		);
		await flush();
		controller.abort();
		await fails(result, "aborted");
		expect(transport.closeCalls).toBe(1);
		transport.reads[0].resolve(packets()[0]);
		await expectQuarantined(connection, transport);
		expect(transport.reports).toHaveLength(2);
	}
});

it("quarantines a hung CANCEL write even after terminal response and ignores its late rejection", async () => {
	const { connection, transport } = create();
	const cancelWrite = deferred(64);
	transport.onWrite = (report) =>
		report[4] === 0x91 ? cancelWrite.promise : Promise.resolve(64);
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort();
	await flush();
	transport.reads[0].resolve(packets()[0]);
	await flush();
	await vi.advanceTimersByTimeAsync(1000);
	await fails(result, "aborted");
	expect(connection.state).toBe("closing");
	await fails(observe(connection.exchange(request)), "closed");
	cancelWrite.reject(new Error(privateText));
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(2);
	expect(transport.readCalls).toBe(1);
});

it("explicit close rejects an active read with closed and never sends CANCEL", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request));
	await flush();
	const closed = observe(connection.close());
	await fails(result, "closed");
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	transport.reads[0].resolve(packets(0x3b, new Uint8Array([2]))[0]);
	await closed;
	await expectQuarantined(connection, transport);
	expect(transport.readCalls).toBe(1);
	expect(transport.reports).toHaveLength(1);
});

it("explicit close rejects an active write and its completion cannot trigger more I/O", async () => {
	const { connection, transport } = create({ outputReportBytes: 8 });
	const pending = deferred(8);
	transport.onWrite = () => pending.promise;
	const result = observe(connection.exchange(request));
	await flush();
	const closed = observe(connection.close());
	await fails(result, "closed");
	expect(connection.state).toBe("closing");
	pending.resolve(8);
	await closed;
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
});

it("closes an idle connection idempotently with exactly one physical close", async () => {
	const { connection, transport } = create();
	await Promise.all([
		connection.close(),
		connection.close(),
		connection.close(),
	]);
	await connection.close();
	expect(connection.state).toBe("closed");
	expect(transport.closeCalls).toBe(1);
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	await fails(observe(connection.exchange(request)), "closed");
});

it("stays closing while physical close hangs even with no pending I/O", async () => {
	const { connection, transport } = create();
	const physicalClose = deferred<void>(undefined);
	transport.onClose = () => physicalClose.promise;
	const closed = observe(connection.close());
	await flush();
	await vi.advanceTimersByTimeAsync(600000);
	expect(connection.state).toBe("closing");
	await fails(observe(connection.exchange(request)), "closed");
	expect(transport.closeCalls).toBe(1);
	physicalClose.resolve(undefined);
	expect(await closed).toEqual({ value: undefined });
	expect(connection.state).toBe("closed");
});

it("does not report closed when physical close fulfills but a read remains pending", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request, { timeoutMs: 10 }));
	await flush();
	await vi.advanceTimersByTimeAsync(10);
	await fails(result, "timeout");
	await vi.advanceTimersByTimeAsync(600000);
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	await fails(observe(connection.exchange(request)), "closed");
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
});

it("normalizes close failure, never retries and never returns to idle", async () => {
	const messages: string[] = [];
	for (const synchronous of [true, false]) {
		const { connection, transport } = create();
		transport.onClose = () => {
			if (synchronous) throw new Error(privateText);
			return Promise.reject(new Error("private alternate close"));
		};
		messages.push(
			(await fails(observe(connection.close()), "unsupported")).message,
		);
		expect(connection.state).toBe("close-failed");
		await fails(observe(connection.close()), "unsupported");
		await fails(observe(connection.exchange(request)), "closed");
		expect(transport.closeCalls).toBe(1);
		expect(connection.keepalive).toBeUndefined();
	}
	expect(messages[0]).toBe(messages[1]);
});

it("absorbs a late rejected read after timeout without reviving or changing the job", async () => {
	const { connection, transport } = create();
	const result = observe(connection.exchange(request, { timeoutMs: 10 }));
	await flush();
	await vi.advanceTimersByTimeAsync(10);
	const failure = await fails(result, "timeout");
	transport.reads[0].reject(new Error(privateText));
	await expectQuarantined(connection, transport);
	expect(await fails(result, "timeout")).toBe(failure);
	expect(transport.readCalls).toBe(1);
	expect(transport.reports).toHaveLength(1);
});

it("does not retry or read after a timed-out write eventually succeeds", async () => {
	const { connection, transport } = create({ outputReportBytes: 8 });
	const pending = deferred(8);
	transport.onWrite = () => pending.promise;
	const result = observe(connection.exchange(request, { timeoutMs: 10 }));
	await flush();
	await vi.advanceTimersByTimeAsync(10);
	await fails(result, "timeout");
	expect(connection.state).toBe("closing");
	pending.resolve(8);
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
});

it("removes completed exchange abort effects so late abort cannot cancel reuse", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	transport.incoming.push(...packets());
	await connection.exchange(request, { signal: controller.signal });
	const second = observe(connection.exchange(request));
	await flush();
	controller.abort(new Error(privateText));
	await vi.advanceTimersByTimeAsync(1000);
	expect(connection.state).toBe("active");
	expect(transport.reports.map((report) => report[4])).toEqual([0x90, 0x90]);
	expect(transport.closeCalls).toBe(0);
	transport.reads[0].resolve(packets()[0]);
	expect(await second).toMatchObject({ value: { kind: "response" } });
	expect(connection.state).toBe("idle");
});

it("prevents option getters from overwriting or reviving connection ownership", async () => {
	const { connection, transport } = create();
	let inner: ReturnType<typeof observe> | undefined;
	const outer = observe(
		connection.exchange(request, {
			get timeoutMs() {
				inner = observe(connection.exchange(new Uint8Array([9])));
				return 100;
			},
		}),
	);
	await fails(outer, "not-actionable");
	await flush();
	expect(connection.state).toBe("active");
	expect(transport.reports).toHaveLength(1);
	expect(transport.reports[0][7]).toBe(9);
	expect(transport.closeCalls).toBe(0);
	transport.reads[0].resolve(packets()[0]);
	expect(await inner).toMatchObject({ value: { kind: "response" } });
	const next = create();
	let closing: Promise<unknown> | undefined;
	await fails(
		observe(
			next.connection.exchange(request, {
				get maxReports() {
					closing = observe(next.connection.close());
					return 1;
				},
			}),
		),
		"closed",
	);
	await closing;
	expect(next.connection.state).toBe("closed");
	expect(next.transport.reports).toHaveLength(0);
	expect(next.transport.readCalls).toBe(0);
	expect(next.transport.closeCalls).toBe(1);
});

it("rejects late immediate responses before the timeout callback gets a turn", async () => {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const { connection, transport } = create();
	transport.onRead = async () => {
		now = 11;
		return packets()[0];
	};
	await fails(
		observe(connection.exchange(request, { timeoutMs: 10 })),
		"timeout",
	);
	await connection.close();
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
	expect(connection.state).toBe("closed");
});

it("wipes a discarded terminal payload while the CANCEL write is still hung", async () => {
	let retained: Uint8Array | undefined;
	const accept = FidoHidMessageAssembler.prototype.accept;
	vi.spyOn(FidoHidMessageAssembler.prototype, "accept").mockImplementation(
		function (this: FidoHidMessageAssembler, report) {
			const message = accept.call(this, report);
			if (message?.command === 0x10) retained = message.payload;
			return message;
		},
	);
	const { connection, transport } = create();
	const cancel = deferred(64);
	transport.onWrite = async (report) =>
		report[4] === 0x91 ? cancel.promise : report.length;
	const controller = new AbortController();
	const result = observe(
		connection.exchange(request, { signal: controller.signal }),
	);
	await flush();
	controller.abort();
	await flush();
	const terminal = packets(0x10, new Uint8Array([0, 0x61, 0x62]))[0];
	const original = terminal.slice();
	transport.reads[0].resolve(terminal);
	await flush();
	expect(retained).toEqual(new Uint8Array(3));
	expect(terminal).toEqual(original);
	expect(connection.state).toBe("active");
	await vi.advanceTimersByTimeAsync(1000);
	await fails(result, "aborted");
	expect(connection.state).toBe("closing");
	expect(retained).toEqual(new Uint8Array(3));
	cancel.reject(new Error(privateText));
	await expectQuarantined(connection, transport);
});
