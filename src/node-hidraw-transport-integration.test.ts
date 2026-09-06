import type { FileHandle } from "node:fs/promises";
import { expect, expectTypeOf, it, vi } from "vitest";
import { FidoHidCborConnection } from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	type NodeHidrawHandle,
	NodeHidrawTransport,
} from "./node-hidraw-transport.js";

function deferred<Value>() {
	let resolve = (_value: Value): void => {
		throw new Error("Uninitialized synthetic completion");
	};
	const promise = new Promise<Value>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

it("accepts the Node FileHandle type without opening a handle", () => {
	expectTypeOf<FileHandle>().toMatchTypeOf<NodeHidrawHandle>();
});

it.each([
	{
		inputReportBytes: 64,
		outputReportBytes: 64,
		inputReportId: 0,
		outputReportId: 0,
	},
	{
		inputReportBytes: 7,
		outputReportBytes: 64,
		inputReportId: 3,
		outputReportId: 9,
	},
	{
		inputReportBytes: 64,
		outputReportBytes: 7,
		inputReportId: 5,
		outputReportId: 11,
	},
])(
	"runs an owned exchange over synthetic hidraw $inputReportBytes/$outputReportBytes reports",
	async (options) => {
		const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
		const reply = new Uint8Array([0, 0xa1, 1, 0xf5]);
		const request = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const packets = [
			...encodeFidoHidMessage(
				channel,
				0x3b,
				new Uint8Array([2]),
				options.inputReportBytes,
			),
			...encodeFidoHidMessage(channel, 0x10, reply, options.inputReportBytes),
		];
		const incoming = packets.map((packet) =>
			options.inputReportId === 0
				? packet.slice()
				: new Uint8Array([options.inputReportId, ...packet]),
		);
		const scratch: Uint8Array[] = [];
		const writes: Uint8Array[] = [];
		let readCount = 0;
		const handle: NodeHidrawHandle = {
			async read(buffer, offset, length, position) {
				expect(offset).toBe(0);
				expect(position).toBeNull();
				expect(length).toBe(
					options.inputReportBytes + (options.inputReportId === 0 ? 1 : 2),
				);
				const wire = incoming[readCount++];
				if (!wire) throw new Error("Unexpected synthetic read");
				buffer.fill(0xa5);
				buffer.set(wire);
				scratch.push(buffer);
				return { bytesRead: wire.length };
			},
			async write(buffer, offset, length, position) {
				expect(offset).toBe(0);
				expect(position).toBeNull();
				expect(length).toBe(options.outputReportBytes + 1);
				expect(buffer[0]).toBe(options.outputReportId);
				writes.push(buffer.slice());
				scratch.push(buffer);
				return { bytesWritten: length };
			},
			close: vi.fn(async () => {}),
		};
		const transport = new NodeHidrawTransport(handle, options);
		const connection = new FidoHidCborConnection(channel, transport, options);
		try {
			expect(await connection.exchange(request)).toEqual({
				kind: "response",
				payload: reply,
			});
			expect(connection.state).toBe("idle");
			expect(transport.state).toBe("open");
			expect(readCount).toBe(options.inputReportBytes === 7 ? 5 : 2);
			expect(writes).toHaveLength(options.outputReportBytes === 7 ? 6 : 1);
			const assembler = new FidoHidMessageAssembler(
				channel,
				options.outputReportBytes,
			);
			const messages = writes.map((wire) => assembler.accept(wire.slice(1)));
			expect(messages[messages.length - 1]).toMatchObject({
				command: 0x10,
				payload: request,
				channel,
			});
			expect(writes[0].slice(1, 8)).toEqual(
				new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x90, 0, 9]),
			);
			expect(request).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
			for (const buffer of scratch)
				expect(buffer.every((value) => value === 0)).toBe(true);
		} finally {
			await connection.close();
		}
		expect(connection.state).toBe("closed");
		expect(transport.state).toBe("closed");
		expect(handle.close).toHaveBeenCalledTimes(1);
	},
);

it("does not confuse an exchange deadline with closure of a pending OS read", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
	const readCompletion = deferred<{ bytesRead: number }>();
	const readStarted = deferred<void>();
	let retained: Uint8Array | undefined;
	const handle: NodeHidrawHandle = {
		read(buffer) {
			buffer.fill(0x66);
			retained = buffer;
			readStarted.resolve();
			return readCompletion.promise;
		},
		async write(_buffer, _offset, length) {
			return { bytesWritten: length };
		},
		close: vi.fn(async () => {}),
	};
	const transport = new NodeHidrawTransport(handle, {
		inputReportBytes: 64,
		outputReportBytes: 64,
	});
	const connection = new FidoHidCborConnection(
		new Uint8Array([1, 2, 3, 4]),
		transport,
	);
	try {
		const exchange = connection.exchange(new Uint8Array([4]), {
			timeoutMs: 10,
		});
		const rejection = expect(exchange).rejects.toMatchObject({
			code: "timeout",
		});
		await readStarted.promise;
		await vi.advanceTimersByTimeAsync(11);
		await rejection;
		expect(connection.state).toBe("closing");
		expect(transport.state).toBe("closing");
		expect(handle.close).toHaveBeenCalledTimes(1);
		expect(retained?.every((value) => value === 0x66)).toBe(true);
		readCompletion.resolve({ bytesRead: 64 });
		await connection.close();
		expect(retained?.every((value) => value === 0)).toBe(true);
		expect(transport.state).toBe("closed");
		expect(connection.state).toBe("closed");
	} finally {
		readCompletion.resolve({ bytesRead: 0 });
		await connection.close().catch(() => {});
		vi.useRealTimers();
	}
});

it("keeps the exchange alive across a delayed empty nonblocking queue", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
	const channel = new Uint8Array([1, 2, 3, 4]);
	const ready = deferred<void>();
	const packet = encodeFidoHidMessage(
		channel,
		0x10,
		new Uint8Array([0]),
		64,
	)[0];
	let reads = 0;
	const handle: NodeHidrawHandle = {
		async read(buffer) {
			reads++;
			if (reads === 1) {
				ready.resolve();
				throw Object.assign(new Error("Synthetic empty queue"), {
					code: "EAGAIN",
				});
			}
			buffer.set(packet);
			return { bytesRead: packet.length };
		},
		async write(_buffer, _offset, length) {
			return { bytesWritten: length };
		},
		close: vi.fn(async () => {}),
	};
	const transport = new NodeHidrawTransport(handle, {
		inputReportBytes: 64,
		outputReportBytes: 64,
	});
	const connection = new FidoHidCborConnection(channel, transport);
	try {
		const exchange = connection.exchange(new Uint8Array([4]), {
			timeoutMs: 100,
		});
		await ready.promise;
		await vi.advanceTimersByTimeAsync(9);
		expect(reads).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(await exchange).toEqual({
			kind: "response",
			payload: new Uint8Array([0]),
		});
		expect(reads).toBe(2);
		expect(connection.state).toBe("idle");
	} finally {
		await connection.close();
		vi.useRealTimers();
	}
});
