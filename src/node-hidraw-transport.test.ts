import type { FileHandle } from "node:fs/promises";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	type NodeHidrawHandle,
	NodeHidrawTransport,
	type NodeHidrawTransportOptions,
	type NodeHidrawTransportState,
} from "./node-hidraw-transport.js";

const report = new Uint8Array([0, 0x12, 0x34, 0x56, 0x81, 0, 0]);
const privateText = "/dev/hidraw-private secret a55ac3 165,90,195";
type ReadResult = Awaited<ReturnType<NodeHidrawHandle["read"]>>;
type WriteResult = Awaited<ReturnType<NodeHidrawHandle["write"]>>;
type Outcome<Value> = { value: Value } | { error: unknown };

const transports: NodeHidrawTransport[] = [];
const pendingCleanup: Array<() => void> = [];

function observe<Result>(
	action: () => Result,
): Promise<Outcome<Awaited<Result>>> {
	try {
		return Promise.resolve(action()).then(
			(value) => ({ value }),
			(error: unknown) => ({ error }),
		);
	} catch (error) {
		return Promise.resolve({ error });
	}
}

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

class FakeHandle implements NodeHidrawHandle {
	read = vi.fn<NodeHidrawHandle["read"]>(async (buffer) => {
		buffer.set(report);
		return { bytesRead: report.length };
	});
	write = vi.fn<NodeHidrawHandle["write"]>(
		async (_buffer, _offset, length) => ({
			bytesWritten: length,
		}),
	);
	close = vi.fn<NodeHidrawHandle["close"]>(async () => undefined);
}

function create(
	options: NodeHidrawTransportOptions = {
		inputReportBytes: 7,
		outputReportBytes: 7,
	},
	handle = new FakeHandle(),
) {
	const transport = new NodeHidrawTransport(handle, options);
	transports.push(transport);
	return { transport, handle };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

function safeError(error: unknown, code: ErrorCode): AgentBrowserError {
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected sanitized adapter error");
	expect(error.code).toBe(code);
	expect(error.message.length).toBeGreaterThan(0);
	expect(error.message).not.toMatch(/hidraw-private|secret|a55ac3|165,90,195/i);
	return error;
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

function expectWiped(buffer: Uint8Array) {
	expect(buffer).toEqual(new Uint8Array(buffer.length));
}

function expectNoIo(handle: FakeHandle) {
	expect(handle.read).not.toHaveBeenCalled();
	expect(handle.write).not.toHaveBeenCalled();
	expect(handle.close).not.toHaveBeenCalled();
}

async function expectQuarantined(
	transport: NodeHidrawTransport,
	handle: FakeHandle,
) {
	await flush();
	expect(transport.state).toBe("closed");
	expect(handle.close).toHaveBeenCalledTimes(1);
	const readCalls = handle.read.mock.calls.length;
	const writeCalls = handle.write.mock.calls.length;
	await fails(
		observe(() => transport.read()),
		"closed",
	);
	await fails(
		observe(() => transport.write(report)),
		"closed",
	);
	expect(handle.read).toHaveBeenCalledTimes(readCalls);
	expect(handle.write).toHaveBeenCalledTimes(writeCalls);
	await transport.close();
	expect(handle.close).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(async () => {
	const closures = transports.map((transport) =>
		observe(() => transport.close()),
	);
	for (const settle of pendingCleanup) settle();
	await flush();
	await Promise.all(closures);
	transports.length = 0;
	pendingCleanup.length = 0;
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("accepts the Node FileHandle shape without opening a descriptor", () => {
	expectTypeOf<FileHandle>().toMatchTypeOf<NodeHidrawHandle>();
	expectTypeOf<NodeHidrawTransportState>().toEqualTypeOf<
		"open" | "closing" | "closed" | "close-failed"
	>();
	const { transport, handle } = create();
	expect(transport.state).toBe("open");
	expectNoIo(handle);
});

it.each([
	{
		inputReportBytes: 7,
		outputReportBytes: 64,
		inputReportId: 0,
		outputReportId: 255,
	},
	{
		inputReportBytes: 64,
		outputReportBytes: 7,
		inputReportId: 255,
		outputReportId: 0,
	},
	{
		inputReportBytes: 7,
		outputReportBytes: 8,
		inputReportId: 1,
		outputReportId: 2,
	},
])(
	"uses independent sizes and IDs with exact one-call I/O: %j",
	async (options) => {
		const { transport, handle } = create(options);
		expectNoIo(handle);
		const input = new Uint8Array(options.inputReportBytes).fill(0xa5);
		input[0] = 0;
		const osInput =
			options.inputReportId === 0
				? input
				: new Uint8Array([options.inputReportId, ...input]);
		const output = new Uint8Array(options.outputReportBytes).fill(0x5a);
		const osOutput = new Uint8Array([options.outputReportId, ...output]);
		handle.read.mockImplementation(async (buffer) => {
			buffer.set(osInput);
			return { bytesRead: osInput.length };
		});
		handle.write.mockImplementation(async (buffer) => {
			expect(buffer).toEqual(osOutput);
			return { bytesWritten: osOutput.length };
		});
		const received = await transport.read();
		expect(received).toEqual(input);
		expect(received).not.toBe(input);
		expect(await transport.write(output)).toBe(output.length);
		expect(handle.read).toHaveBeenCalledExactlyOnceWith(
			expect.any(Uint8Array),
			0,
			osInput.length + 1,
			null,
		);
		expect(handle.write).toHaveBeenCalledExactlyOnceWith(
			expect.any(Uint8Array),
			0,
			osOutput.length,
			null,
		);
		expect(handle.read.mock.calls[0][0]).toHaveLength(osInput.length + 1);
		expect(handle.write.mock.calls[0][0]).toHaveLength(osOutput.length);
		expectWiped(handle.read.mock.calls[0][0]);
		expectWiped(handle.write.mock.calls[0][0]);
		expect(output).toEqual(
			new Uint8Array(options.outputReportBytes).fill(0x5a),
		);
		expect(transport.state).toBe("open");
	},
);

it("defaults both IDs to zero but only prefixes the write", async () => {
	const { transport, handle } = create();
	handle.write.mockImplementation(async (buffer) => {
		expect(buffer).toEqual(new Uint8Array([0, ...report]));
		return { bytesWritten: 8 };
	});
	expect(await transport.read()).toEqual(report);
	expect(await transport.write(report)).toBe(7);
	expect(handle.read.mock.calls[0].slice(1)).toEqual([0, 8, null]);
	expect(handle.write.mock.calls[0].slice(1)).toEqual([0, 8, null]);
});

it.each([
	["inputReportBytes", 6],
	["inputReportBytes", 65],
	["outputReportBytes", 6],
	["outputReportBytes", 65],
	["inputReportBytes", 7.5],
	["outputReportBytes", Number.NaN],
	["inputReportBytes", Number.POSITIVE_INFINITY],
	["outputReportBytes", "7"],
	["inputReportBytes", undefined],
	["outputReportBytes", undefined],
	["outputReportBytes", null],
	["inputReportId", -1],
	["inputReportId", 256],
	["outputReportId", -1],
	["outputReportId", 256],
	["inputReportId", 0.5],
	["outputReportId", Number.NaN],
	["inputReportId", "0"],
	["outputReportId", null],
] as const)(
	"rejects invalid %s=%s before claiming or touching the handle",
	(key, value) => {
		const handle = new FakeHandle();
		throwsCode(() =>
			create(
				{
					inputReportBytes: 7,
					outputReportBytes: 7,
					[key]: value,
				} as NodeHidrawTransportOptions,
				handle,
			),
		);
		expectNoIo(handle);
		expect(create(undefined, handle).transport.state).toBe("open");
	},
);

it("rejects missing options and hostile metadata without numeric coercion", () => {
	const coerce = vi.fn(() => {
		throw new Error(privateText);
	});
	for (const options of [
		undefined,
		null,
		{},
		{
			inputReportBytes: { valueOf: coerce, [Symbol.toPrimitive]: coerce },
			outputReportBytes: 7,
		},
	]) {
		const handle = new FakeHandle();
		throwsCode(
			() =>
				new NodeHidrawTransport(
					handle,
					options as unknown as NodeHidrawTransportOptions,
				),
		);
		expectNoIo(handle);
		create(undefined, handle);
	}
	expect(coerce).not.toHaveBeenCalled();
});

it("rejects absent methods and sanitizes constructor getter exceptions", () => {
	for (const handle of [
		null,
		undefined,
		{},
		{ read: 1 },
		{
			read: async () => ({ bytesRead: 7 }),
			write: async () => ({ bytesWritten: 8 }),
		},
	]) {
		throwsCode(
			() =>
				new NodeHidrawTransport(handle as unknown as NodeHidrawHandle, {
					inputReportBytes: 7,
					outputReportBytes: 7,
				}),
		);
	}
	for (const key of ["read", "write", "close"] as const) {
		const messages: string[] = [];
		for (const text of [privateText, "different secret"]) {
			const handle = new FakeHandle();
			Object.defineProperty(handle, key, {
				get() {
					throw new Error(text);
				},
			});
			messages.push(throwsCode(() => create(undefined, handle)).message);
		}
		expect(messages[0]).toBe(messages[1]);
	}
	for (const key of [
		"inputReportBytes",
		"outputReportBytes",
		"inputReportId",
		"outputReportId",
	]) {
		const handle = new FakeHandle();
		const options = { inputReportBytes: 7, outputReportBytes: 7 };
		Object.defineProperty(options, key, {
			get() {
				throw new Error(privateText);
			},
		});
		throwsCode(() => create(options, handle));
		expectNoIo(handle);
		create(undefined, handle);
	}
});

it("snapshots metadata and bound methods once rather than consulting replacements", async () => {
	const handle = new FakeHandle();
	const originalRead = handle.read;
	const originalWrite = handle.write;
	const originalClose = handle.close;
	const getters = [
		vi.fn(() => 7),
		vi.fn(() => 7),
		vi.fn(() => 0),
		vi.fn(() => 255),
		vi.fn(() => originalRead),
		vi.fn(() => originalWrite),
		vi.fn(() => originalClose),
	];
	const options = { inputReportBytes: 7, outputReportBytes: 7 };
	for (const [index, key] of [
		"inputReportBytes",
		"outputReportBytes",
		"inputReportId",
		"outputReportId",
	].entries())
		Object.defineProperty(options, key, {
			configurable: true,
			get: getters[index],
		});
	for (const [index, key] of ["read", "write", "close"].entries())
		Object.defineProperty(handle, key, {
			configurable: true,
			get: getters[index + 4],
		});
	originalRead.mockImplementation(async function (this: FakeHandle, buffer) {
		expect(this).toBe(handle);
		buffer.set(report);
		return { bytesRead: 7 };
	});
	originalWrite.mockImplementation(async function (this: FakeHandle, buffer) {
		expect(this).toBe(handle);
		expect(buffer).toEqual(new Uint8Array([255, ...report]));
		return { bytesWritten: 8 };
	});
	originalClose.mockImplementation(async function (this: FakeHandle) {
		expect(this).toBe(handle);
	});
	const { transport } = create(options, handle);
	for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
	for (const key of [
		"inputReportBytes",
		"outputReportBytes",
		"inputReportId",
		"outputReportId",
	])
		Object.defineProperty(options, key, {
			get() {
				throw new Error(privateText);
			},
		});
	for (const key of ["read", "write", "close"])
		Object.defineProperty(handle, key, {
			get() {
				throw new Error(privateText);
			},
		});
	expect(await transport.read()).toEqual(report);
	expect(await transport.write(report)).toBe(7);
	await transport.close();
	expect(originalRead).toHaveBeenCalledTimes(1);
	expect(originalWrite).toHaveBeenCalledTimes(1);
	expect(originalClose).toHaveBeenCalledTimes(1);
	for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
});

it("claims a handle for its lifetime including after successful closure", async () => {
	const { transport, handle } = create();
	throwsCode(() => create(undefined, handle), "not-actionable");
	expectNoIo(handle);
	await transport.close();
	throwsCode(() => create(undefined, handle), "not-actionable");
	expect(handle.close).toHaveBeenCalledTimes(1);
});

it("rechecks ownership after constructor getters create another owner", async () => {
	const handle = new FakeHandle();
	let nested: NodeHidrawTransport | undefined;
	throwsCode(
		() =>
			create(
				{
					get inputReportBytes() {
						nested = create(undefined, handle).transport;
						return 7;
					},
					outputReportBytes: 7,
				},
				handle,
			),
		"not-actionable",
	);
	expectNoIo(handle);
	expect(nested).toBeDefined();
	expect(await nested?.read()).toEqual(report);
});

it.each([
	0,
	6,
	8,
	9,
	-1,
	7.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"7",
	null,
	undefined,
])(
	"quarantines read count %s without accepting a prefix or making a second read",
	async (bytesRead) => {
		const { transport, handle } = create();
		handle.read.mockImplementation(async (buffer) => {
			buffer.fill(0xa5);
			return { bytesRead } as ReadResult;
		});
		await fails(
			observe(() => transport.read()),
			"unsupported",
		);
		expect(handle.read).toHaveBeenCalledTimes(1);
		expectWiped(handle.read.mock.calls[0][0]);
		await expectQuarantined(transport, handle);
	},
);

it.each([
	0,
	7,
	9,
	-1,
	8.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"8",
	null,
	undefined,
])(
	"quarantines write count %s without suffix writes or resending",
	async (bytesWritten) => {
		const { transport, handle } = create();
		handle.write.mockResolvedValue({ bytesWritten } as WriteResult);
		await fails(
			observe(() => transport.write(report)),
			"unsupported",
		);
		expect(handle.write).toHaveBeenCalledTimes(1);
		expectWiped(handle.write.mock.calls[0][0]);
		expect(report).toEqual(new Uint8Array([0, 0x12, 0x34, 0x56, 0x81, 0, 0]));
		await expectQuarantined(transport, handle);
	},
);

it.each(["read", "write"] as const)(
	"sanitizes malformed %s result objects and count getters",
	async (direction) => {
		for (const result of [
			null,
			undefined,
			{},
			{
				get bytesRead() {
					throw new Error(privateText);
				},
				get bytesWritten() {
					throw new Error(privateText);
				},
			},
		]) {
			const { transport, handle } = create();
			handle.read.mockResolvedValue(result as unknown as ReadResult);
			handle.write.mockResolvedValue(result as unknown as WriteResult);
			await fails(
				observe(() =>
					direction === "read" ? transport.read() : transport.write(report),
				),
				"unsupported",
			);
			const calls =
				direction === "read" ? handle.read.mock.calls : handle.write.mock.calls;
			expect(calls).toHaveLength(1);
			expectWiped(calls[0][0]);
			await expectQuarantined(transport, handle);
		}
	},
);

it("quarantines a wrong nonzero input ID even with an exact byte count", async () => {
	const { transport, handle } = create({
		inputReportBytes: 7,
		outputReportBytes: 7,
		inputReportId: 255,
	});
	handle.read.mockImplementation(async (buffer) => {
		buffer.set([1, ...report]);
		return { bytesRead: 8 };
	});
	await fails(
		observe(() => transport.read()),
		"unsupported",
	);
	expectWiped(handle.read.mock.calls[0][0]);
	await expectQuarantined(transport, handle);
});

it("rejects malformed caller reports without I/O or forfeiting an open handle", async () => {
	const { transport, handle } = create();
	const hostile = Object.defineProperty({}, "length", {
		get() {
			throw new Error(privateText);
		},
	});
	for (const value of [
		null,
		undefined,
		[...report],
		new Uint8Array(6),
		new Uint8Array(8),
		new DataView(new ArrayBuffer(7)),
		new Uint16Array(7),
		hostile,
	]) {
		await fails(
			observe(() => transport.write(value as Uint8Array)),
			"invalid-input",
		);
		expectNoIo(handle);
		expect(transport.state).toBe("open");
	}
	expect(await transport.write(report)).toBe(7);
});

it.each(["read", "write", "close"] as const)(
	"sanitizes synchronous and asynchronous %s failures with fixed messages",
	async (direction) => {
		const messages: string[] = [];
		for (const synchronous of [true, false]) {
			for (const reason of [
				new Error(privateText),
				new Error("another secret"),
				privateText,
			]) {
				const { transport, handle } = create();
				const fail = () => {
					if (synchronous) throw reason;
					return Promise.reject(reason);
				};
				if (direction === "read") handle.read.mockImplementation(fail);
				if (direction === "write") handle.write.mockImplementation(fail);
				if (direction === "close") handle.close.mockImplementation(fail);
				const outcome = observe(() => {
					if (direction === "read") return transport.read();
					if (direction === "write") return transport.write(report);
					return transport.close();
				});
				messages.push((await fails(outcome, "unsupported")).message);
				if (direction === "close") {
					expect(transport.state).toBe("close-failed");
					await fails(
						observe(() => transport.read()),
						"closed",
					);
					await fails(
						observe(() => transport.write(report)),
						"closed",
					);
					throwsCode(() => create(undefined, handle), "not-actionable");
				} else {
					const calls =
						direction === "read"
							? handle.read.mock.calls
							: handle.write.mock.calls;
					expectWiped(calls[0][0]);
					await expectQuarantined(transport, handle);
				}
				expect(handle.close).toHaveBeenCalledTimes(1);
			}
		}
		expect(new Set(messages).size).toBe(1);
	},
);

it.each(["EAGAIN", "EWOULDBLOCK"])(
	"delays empty %s reads by 10 ms without overlap or hot loops",
	async (code) => {
		const { transport, handle } = create();
		const pending = deferred<ReadResult>({ bytesRead: 7 });
		handle.read
			.mockImplementationOnce(async (buffer) => {
				buffer.fill(0xa5);
				throw Object.assign(new Error(privateText), { code });
			})
			.mockRejectedValueOnce({ code })
			.mockImplementationOnce((buffer) => {
				buffer.set(report);
				return pending.promise;
			});
		const reading = observe(() => transport.read());
		await flush();
		expect(handle.read).toHaveBeenCalledTimes(1);
		expectWiped(handle.read.mock.calls[0][0]);
		expect(vi.getTimerCount()).toBe(1);
		await fails(
			observe(() => transport.read()),
			"not-actionable",
		);
		expect(await transport.write(report)).toBe(7);
		await vi.advanceTimersByTimeAsync(9);
		expect(handle.read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(handle.read).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(10);
		expect(handle.read).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(100);
		expect(handle.read).toHaveBeenCalledTimes(3);
		pending.resolve({ bytesRead: 7 });
		expect(await reading).toEqual({ value: report });
		for (const [buffer, offset, length, position] of handle.read.mock.calls) {
			expect([offset, length, position]).toEqual([0, 8, null]);
			expect(buffer).toHaveLength(8);
			expectWiped(buffer);
		}
		expect(transport.state).toBe("open");
		expect(handle.close).not.toHaveBeenCalled();
	},
);

it.each(["EAGAIN", "EWOULDBLOCK"])(
	"never retries a write rejected with %s",
	async (code) => {
		const { transport, handle } = create();
		handle.write.mockRejectedValue(
			Object.assign(new Error(privateText), { code }),
		);
		await fails(
			observe(() => transport.write(report)),
			"unsupported",
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(handle.write).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
		expectWiped(handle.write.mock.calls[0][0]);
		await expectQuarantined(transport, handle);
	},
);

it("does not retry inherited, throwing or unrelated error codes", async () => {
	const inherited = new Error(privateText);
	Object.setPrototypeOf(inherited, { code: "EAGAIN" });
	const throwing = Object.defineProperty(new Error(privateText), "code", {
		get() {
			throw new Error(privateText);
		},
	});
	for (const reason of [
		inherited,
		throwing,
		{ code: "EIO" },
		{ code: "EAGAIN " },
	]) {
		const { transport, handle } = create();
		handle.read.mockRejectedValue(reason);
		await fails(
			observe(() => transport.read()),
			"unsupported",
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(handle.read).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
		await expectQuarantined(transport, handle);
	}
});

it("close wakes a delayed read, cancels its retry timer and never reads again", async () => {
	const { transport, handle } = create();
	handle.read.mockRejectedValue({ code: "EAGAIN" });
	const reading = observe(() => transport.read());
	await flush();
	expect(vi.getTimerCount()).toBe(1);
	const closing = observe(() => transport.close());
	await fails(reading, "closed");
	expect(await closing).toHaveProperty("value");
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	expect(handle.read).toHaveBeenCalledTimes(1);
	expect(handle.close).toHaveBeenCalledTimes(1);
	expect(transport.state).toBe("closed");
});

it("allows one pending operation per direction without replacement or cross-blocking", async () => {
	const { transport, handle } = create();
	const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
	const pendingWrite = deferred<WriteResult>({ bytesWritten: 8 });
	handle.read.mockImplementationOnce((buffer) => {
		buffer.set(report);
		return pendingRead.promise;
	});
	handle.write.mockReturnValueOnce(pendingWrite.promise);
	const reading = observe(() => transport.read());
	const writing = observe(() => transport.write(report));
	await flush();
	await fails(
		observe(() => transport.read()),
		"not-actionable",
	);
	await fails(
		observe(() => transport.write(report)),
		"not-actionable",
	);
	expect(handle.read).toHaveBeenCalledTimes(1);
	expect(handle.write).toHaveBeenCalledTimes(1);
	expect(handle.close).not.toHaveBeenCalled();
	pendingRead.resolve({ bytesRead: 7 });
	expect(await reading).toEqual({ value: report });
	expect(await transport.read()).toEqual(report);
	await fails(
		observe(() => transport.write(report)),
		"not-actionable",
	);
	pendingWrite.resolve({ bytesWritten: 8 });
	expect(await writing).toEqual({ value: 7 });
	expect(await transport.write(report)).toBe(7);
	expect(handle.read).toHaveBeenCalledTimes(2);
	expect(handle.write).toHaveBeenCalledTimes(2);
});

it.each(["read", "write"] as const)(
	"reserves %s admission before the driver callback reenters",
	async (direction) => {
		const { transport, handle } = create();
		let nested: Promise<Outcome<Uint8Array | number>> | undefined;
		if (direction === "read")
			handle.read.mockImplementationOnce(async (buffer) => {
				nested = observe(() => transport.read());
				buffer.set(report);
				return { bytesRead: 7 };
			});
		else
			handle.write.mockImplementationOnce(async () => {
				nested = observe(() => transport.write(report));
				return { bytesWritten: 8 };
			});
		const result = await observe(() =>
			direction === "read" ? transport.read() : transport.write(report),
		);
		expect(result).toHaveProperty("value");
		expect(nested).toBeDefined();
		if (!nested) throw new Error("Expected reentrant operation");
		await fails(nested, "not-actionable");
		expect(
			direction === "read" ? handle.read : handle.write,
		).toHaveBeenCalledTimes(1);
		expect(transport.state).toBe("open");
	},
);

it("keeps the entire write copy private until settlement and then wipes it", async () => {
	const { transport, handle } = create();
	const pending = deferred<WriteResult>({ bytesWritten: 8 });
	handle.write.mockReturnValueOnce(pending.promise);
	const storage = new Uint8Array([99, ...report, 88]);
	const supplied = storage.subarray(1, 8);
	const writing = observe(() => transport.write(supplied));
	await flush();
	const scratch = handle.write.mock.calls[0][0];
	expect(scratch).toEqual(new Uint8Array([0, ...report]));
	expect(scratch.buffer).not.toBe(supplied.buffer);
	supplied.fill(0x5a);
	expect(scratch).toEqual(new Uint8Array([0, ...report]));
	scratch.fill(0xa5);
	expect(storage).toEqual(
		new Uint8Array([99, ...new Uint8Array(7).fill(0x5a), 88]),
	);
	pending.resolve({ bytesWritten: 8 });
	expect(await writing).toEqual({ value: 7 });
	expectWiped(scratch);
	expect(supplied).toEqual(new Uint8Array(7).fill(0x5a));
});

it("transfers owned read results that survive scratch clearing and later reuse", async () => {
	const { transport, handle } = create();
	const received = await transport.read();
	const firstScratch = handle.read.mock.calls[0][0];
	expectWiped(firstScratch);
	expect(received.buffer).not.toBe(firstScratch.buffer);
	firstScratch.fill(0x5a);
	expect(received).toEqual(report);
	received.fill(0xa5);
	expect(await transport.read()).toEqual(report);
	expect(received).toEqual(new Uint8Array(7).fill(0xa5));
	await transport.close();
	expect(received).toEqual(new Uint8Array(7).fill(0xa5));
});

it.each(["nested-write", "close"] as const)(
	"does not bypass admission if report hooks trigger %s",
	async (action) => {
		const { transport, handle } = create();
		const pending = deferred<WriteResult>({ bytesWritten: 8 });
		handle.write.mockReturnValueOnce(pending.promise);
		let callback: Promise<Outcome<unknown>> | undefined;
		const supplied = report.slice();
		const hook = vi.fn(() => {
			callback ??= observe(() =>
				action === "close" ? transport.close() : transport.write(report),
			);
			return report.length;
		});
		Object.defineProperty(supplied, "length", { get: hook });
		Object.defineProperty(supplied, "byteLength", { get: hook });
		const outer = observe(() => transport.write(supplied));
		await flush();
		if (hook.mock.calls.length === 0) {
			expect(handle.write).toHaveBeenCalledTimes(1);
			pending.resolve({ bytesWritten: 8 });
			expect(await outer).toEqual({ value: 7 });
		} else if (action === "close") {
			await fails(outer, "closed");
			expect(handle.write).not.toHaveBeenCalled();
			expect(await callback).toHaveProperty("value");
		} else {
			await fails(outer, "not-actionable");
			expect(handle.write).toHaveBeenCalledTimes(1);
			pending.resolve({ bytesWritten: 8 });
			expect(await callback).toEqual({ value: 7 });
		}
	},
);

it.each(["read", "write"] as const)(
	"rechecks closure after a %s count getter reenters",
	async (direction) => {
		const { transport, handle } = create();
		let closing: Promise<Outcome<void>> | undefined;
		handle.read.mockImplementation(async (buffer) => {
			buffer.set(report);
			return {
				get bytesRead() {
					closing = observe(() => transport.close());
					return 7;
				},
			};
		});
		handle.write.mockResolvedValue({
			get bytesWritten() {
				closing = observe(() => transport.close());
				return 8;
			},
		});
		await fails(
			observe(() =>
				direction === "read" ? transport.read() : transport.write(report),
			),
			"closed",
		);
		expect(closing).toBeDefined();
		expect(await closing).toHaveProperty("value");
		const calls =
			direction === "read" ? handle.read.mock.calls : handle.write.mock.calls;
		expectWiped(calls[0][0]);
		expect(transport.state).toBe("closed");
		expect(handle.close).toHaveBeenCalledTimes(1);
	},
);

it("closes the handle once across concurrent, repeated and reentrant close calls", async () => {
	const { transport, handle } = create();
	const pending = deferred<void>(undefined);
	let nested: Promise<Outcome<void>> | undefined;
	handle.close.mockImplementationOnce(() => {
		nested = observe(() => transport.close());
		return pending.promise;
	});
	const first = observe(() => transport.close());
	const second = observe(() => transport.close());
	await flush();
	expect(transport.state).toBe("closing");
	expect(handle.close).toHaveBeenCalledTimes(1);
	await fails(
		observe(() => transport.read()),
		"closed",
	);
	await fails(
		observe(() => transport.write(report)),
		"closed",
	);
	expect(handle.read).not.toHaveBeenCalled();
	expect(handle.write).not.toHaveBeenCalled();
	pending.resolve(undefined);
	for (const outcome of [first, second, nested]) {
		expect(outcome).toBeDefined();
		expect(await outcome).toHaveProperty("value");
	}
	await transport.close();
	expect(transport.state).toBe("closed");
	expect(handle.close).toHaveBeenCalledTimes(1);
});

it("waits for close and both captured operations without returning late success", async () => {
	const { transport, handle } = create();
	const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
	const pendingWrite = deferred<WriteResult>({ bytesWritten: 8 });
	const pendingClose = deferred<void>(undefined);
	handle.read.mockImplementationOnce((buffer) => {
		buffer.set(report);
		return pendingRead.promise;
	});
	handle.write.mockReturnValueOnce(pendingWrite.promise);
	handle.close.mockReturnValueOnce(pendingClose.promise);
	const reading = observe(() => transport.read());
	const writing = observe(() => transport.write(report));
	await flush();
	let settled = false;
	const closing = observe(() => transport.close()).then((result) => {
		settled = true;
		return result;
	});
	await flush();
	pendingClose.resolve(undefined);
	await flush();
	expect(transport.state).toBe("closing");
	expect(settled).toBe(false);
	expect(handle.read.mock.calls[0][0].subarray(0, 7)).toEqual(report);
	expect(handle.write.mock.calls[0][0]).toEqual(new Uint8Array([0, ...report]));
	pendingRead.resolve({ bytesRead: 7 });
	await fails(reading, "closed");
	expectWiped(handle.read.mock.calls[0][0]);
	expect(transport.state).toBe("closing");
	expect(settled).toBe(false);
	pendingWrite.resolve({ bytesWritten: 8 });
	await fails(writing, "closed");
	expectWiped(handle.write.mock.calls[0][0]);
	expect(await closing).toHaveProperty("value");
	expect(transport.state).toBe("closed");
	expect(handle.close).toHaveBeenCalledTimes(1);
});

it("stays closing when driver close is unresolved after all I/O settles", async () => {
	const { transport, handle } = create();
	const pending = deferred<void>(undefined);
	handle.close.mockReturnValueOnce(pending.promise);
	let settled = false;
	const closing = observe(() => transport.close()).then((result) => {
		settled = true;
		return result;
	});
	await vi.advanceTimersByTimeAsync(60_000);
	expect(transport.state).toBe("closing");
	expect(settled).toBe(false);
	expect(handle.close).toHaveBeenCalledTimes(1);
	pending.resolve(undefined);
	expect(await closing).toHaveProperty("value");
	expect(transport.state).toBe("closed");
});

it.each(["read", "write"] as const)(
	"does not claim a deadline or completed close for an unresolved %s",
	async (direction) => {
		const { transport, handle } = create();
		const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
		const pendingWrite = deferred<WriteResult>({ bytesWritten: 8 });
		handle.read.mockReturnValueOnce(pendingRead.promise);
		handle.write.mockReturnValueOnce(pendingWrite.promise);
		const operation = observe(() =>
			direction === "read" ? transport.read() : transport.write(report),
		);
		await flush();
		let settled = false;
		const closing = observe(() => transport.close()).then((result) => {
			settled = true;
			return result;
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transport.state).toBe("closing");
		expect(settled).toBe(false);
		expect(handle.close).toHaveBeenCalledTimes(1);
		if (direction === "read") pendingRead.reject(new Error(privateText));
		else pendingWrite.reject(new Error(privateText));
		await fails(operation, "closed");
		expect(await closing).toHaveProperty("value");
		const calls =
			direction === "read" ? handle.read.mock.calls : handle.write.mock.calls;
		expectWiped(calls[0][0]);
		expect(transport.state).toBe("closed");
	},
);

it.each(["read", "write"] as const)(
	"reports a %s fault without awaiting hanging quarantine close",
	async (direction) => {
		const { transport, handle } = create();
		const pendingClose = deferred<void>(undefined);
		handle.close.mockReturnValueOnce(pendingClose.promise);
		handle.read.mockRejectedValueOnce(new Error(privateText));
		handle.write.mockRejectedValueOnce(new Error(privateText));
		await fails(
			observe(() =>
				direction === "read" ? transport.read() : transport.write(report),
			),
			"unsupported",
		);
		await flush();
		expect(transport.state).toBe("closing");
		expect(handle.close).toHaveBeenCalledTimes(1);
		await fails(
			observe(() => transport.read()),
			"closed",
		);
		await fails(
			observe(() => transport.write(report)),
			"closed",
		);
		pendingClose.resolve(undefined);
		await transport.close();
		expect(transport.state).toBe("closed");
	},
);

it.each(["resolve", "reject"] as const)(
	"keeps close-failed after late operation %s and never reclaims ownership",
	async (settlement) => {
		const { transport, handle } = create();
		const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
		handle.read.mockImplementationOnce((buffer) => {
			buffer.set(report);
			return pendingRead.promise;
		});
		handle.close.mockRejectedValue(new Error(privateText));
		const reading = observe(() => transport.read());
		await flush();
		const closing = observe(() => transport.close());
		let closeFinished = false;
		void closing.then(() => {
			closeFinished = true;
		});
		await flush();
		expect(transport.state).toBe("close-failed");
		expect(closeFinished).toBe(false);
		if (settlement === "resolve") pendingRead.resolve({ bytesRead: 7 });
		else pendingRead.reject(new Error(privateText));
		await fails(reading, "closed");
		await fails(closing, "unsupported");
		expect(closeFinished).toBe(true);
		await fails(
			observe(() => transport.close()),
			"unsupported",
		);
		expectWiped(handle.read.mock.calls[0][0]);
		expect(transport.state).toBe("close-failed");
		expect(handle.close).toHaveBeenCalledTimes(1);
		throwsCode(() => create(undefined, handle), "not-actionable");
	},
);

it.each(["resolve", "reject"] as const)(
	"quarantines a write fault and handles late read %s without discarding pending scratch",
	async (settlement) => {
		const { transport, handle } = create();
		const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
		handle.read.mockImplementationOnce((buffer) => {
			buffer.set(report);
			return pendingRead.promise;
		});
		handle.write.mockResolvedValueOnce({ bytesWritten: 7 });
		const reading = observe(() => transport.read());
		await flush();
		await fails(
			observe(() => transport.write(report)),
			"unsupported",
		);
		await flush();
		expect(transport.state).toBe("closing");
		expect(handle.read.mock.calls[0][0].subarray(0, 7)).toEqual(report);
		if (settlement === "resolve") pendingRead.resolve({ bytesRead: 7 });
		else pendingRead.reject(new Error(privateText));
		await fails(reading, "closed");
		expectWiped(handle.read.mock.calls[0][0]);
		await expectQuarantined(transport, handle);
	},
);

it.each(["EAGAIN", "EWOULDBLOCK"])(
	"reads an own %s code accessor once and retries only after 10 ms",
	async (code) => {
		const { transport, handle } = create();
		const getter = vi.fn(() => code);
		const reason = Object.defineProperty(new Error(privateText), "code", {
			get: getter,
		});
		handle.read.mockImplementationOnce(async (buffer) => {
			buffer.fill(0xa5);
			throw reason;
		});
		const reading = observe(() => transport.read());
		await flush();
		expect(getter).toHaveBeenCalledTimes(1);
		expect(handle.read).toHaveBeenCalledTimes(1);
		expectWiped(handle.read.mock.calls[0][0]);
		expect(vi.getTimerCount()).toBe(1);
		expect(handle.close).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(9);
		expect(handle.read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(await reading).toEqual({ value: report });
		expect(getter).toHaveBeenCalledTimes(1);
		expect(handle.read).toHaveBeenCalledTimes(2);
		expectWiped(handle.read.mock.calls[1][0]);
		expect(vi.getTimerCount()).toBe(0);
		expect(handle.close).not.toHaveBeenCalled();
		expect(transport.state).toBe("open");
	},
);

it("sanitizes a throwing own code getter after one access without retrying", async () => {
	const { transport, handle } = create();
	const getter = vi.fn(() => {
		throw new Error(privateText);
	});
	const reason = Object.defineProperty(new Error(privateText), "code", {
		get: getter,
	});
	handle.read.mockRejectedValueOnce(reason);
	await fails(
		observe(() => transport.read()),
		"unsupported",
	);
	await vi.advanceTimersByTimeAsync(100);
	expect(getter).toHaveBeenCalledTimes(1);
	expect(handle.read).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
	expectWiped(handle.read.mock.calls[0][0]);
	await expectQuarantined(transport, handle);
});

it.each(["EAGAIN", "EWOULDBLOCK"])(
	"does not evaluate an inherited %s code accessor or retry its read",
	async (code) => {
		const { transport, handle } = create();
		const getter = vi.fn(() => code);
		const prototype = Object.defineProperty({}, "code", { get: getter });
		const reason = new Error(privateText);
		Object.setPrototypeOf(reason, prototype);
		handle.read.mockRejectedValueOnce(reason);
		await fails(
			observe(() => transport.read()),
			"unsupported",
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(getter).not.toHaveBeenCalled();
		expect(handle.read).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
		await expectQuarantined(transport, handle);
	},
);

it.each(["EAGAIN", "EWOULDBLOCK"])(
	"does not schedule a retry when an own %s code getter closes the adapter",
	async (code) => {
		const { transport, handle } = create();
		const pendingClose = deferred<void>(undefined);
		handle.close.mockReturnValueOnce(pendingClose.promise);
		let closing: Promise<Outcome<void>> | undefined;
		const getter = vi.fn(() => {
			closing = observe(() => transport.close());
			return code;
		});
		const reason = Object.defineProperty(new Error(privateText), "code", {
			get: getter,
		});
		handle.read.mockImplementationOnce(async (buffer) => {
			buffer.fill(0xa5);
			throw reason;
		});
		await fails(
			observe(() => transport.read()),
			"closed",
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(getter).toHaveBeenCalledTimes(1);
		expect(handle.read).toHaveBeenCalledTimes(1);
		expect(handle.close).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
		expectWiped(handle.read.mock.calls[0][0]);
		expect(transport.state).toBe("closing");
		pendingClose.resolve(undefined);
		expect(closing).toBeDefined();
		expect(await closing).toHaveProperty("value");
		expect(transport.state).toBe("closed");
	},
);

it.each(["read", "write"] as const)(
	"rejects public %s success when its result getter queues close before settlement",
	async (direction) => {
		const { transport, handle } = create();
		const pendingRead = deferred<ReadResult>({ bytesRead: 7 });
		const pendingWrite = deferred<WriteResult>({ bytesWritten: 8 });
		const pendingClose = deferred<void>(undefined);
		let publicSettled = false;
		let closeSettled = false;
		let closeSawPendingPublicOperation: boolean | undefined;
		let closing: Promise<Outcome<void>> | undefined;
		const queueClose = () => {
			queueMicrotask(() => {
				closeSawPendingPublicOperation = !publicSettled;
				closing = observe(() => transport.close()).then((result) => {
					closeSettled = true;
					return result;
				});
			});
		};
		handle.close.mockReturnValueOnce(pendingClose.promise);
		handle.read.mockImplementationOnce((buffer) => {
			buffer.set(report);
			if (direction === "write") return pendingRead.promise;
			return Promise.resolve({
				get bytesRead() {
					queueClose();
					return 7;
				},
			});
		});
		handle.write.mockImplementationOnce(() => {
			if (direction === "read") return pendingWrite.promise;
			return Promise.resolve({
				get bytesWritten() {
					queueClose();
					return 8;
				},
			});
		});
		const opposite = observe(() =>
			direction === "read" ? transport.write(report) : transport.read(),
		);
		await flush();
		const operation = observe(() =>
			direction === "read" ? transport.read() : transport.write(report),
		).then((result) => {
			publicSettled = true;
			return result;
		});
		await fails(operation, "closed");
		expect(closeSawPendingPublicOperation).toBe(true);
		expect(closing).toBeDefined();
		expect(closeSettled).toBe(false);
		expect(transport.state).toBe("closing");
		expect(handle.close).toHaveBeenCalledTimes(1);
		const completedScratch =
			direction === "read"
				? handle.read.mock.calls[0][0]
				: handle.write.mock.calls[0][0];
		const pendingScratch =
			direction === "read"
				? handle.write.mock.calls[0][0]
				: handle.read.mock.calls[0][0];
		expectWiped(completedScratch);
		expect(pendingScratch).toEqual(
			direction === "read"
				? new Uint8Array([0, ...report])
				: new Uint8Array([...report, 0]),
		);
		pendingClose.resolve(undefined);
		await flush();
		expect(closeSettled).toBe(false);
		expect(transport.state).toBe("closing");
		await fails(
			observe(() => transport.read()),
			"closed",
		);
		await fails(
			observe(() => transport.write(report)),
			"closed",
		);
		if (direction === "read") pendingWrite.resolve({ bytesWritten: 8 });
		else pendingRead.resolve({ bytesRead: 7 });
		await fails(opposite, "closed");
		expectWiped(pendingScratch);
		expect(await closing).toHaveProperty("value");
		expect(closeSettled).toBe(true);
		expect(transport.state).toBe("closed");
		expect(handle.read).toHaveBeenCalledTimes(1);
		expect(handle.write).toHaveBeenCalledTimes(1);
		expect(handle.close).toHaveBeenCalledTimes(1);
	},
);
