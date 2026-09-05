import { describe, expect, it } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";

const channel = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
const foreignChannel = new Uint8Array([0x12, 0x34, 0x56, 0x79]);

function initialReport(
	payloadLength: number,
	data: readonly number[] = [],
	reportBytes = 64,
	command = 0x01,
	reportChannel = channel,
): Uint8Array {
	const report = new Uint8Array(reportBytes);
	report.set(reportChannel);
	report[4] = command | 0x80;
	report[5] = payloadLength >>> 8;
	report[6] = payloadLength & 0xff;
	report.set(data, 7);
	return report;
}

function continuationReport(
	sequence: number,
	data: readonly number[] = [],
	reportBytes = 64,
	reportChannel = channel,
): Uint8Array {
	const report = new Uint8Array(reportBytes);
	report.set(reportChannel);
	report[4] = sequence;
	report.set(data, 5);
	return report;
}

function expectError(action: () => unknown, code: ErrorCode): void {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({ code });
		return;
	}
	throw new Error(`Expected AgentBrowserError ${code}`);
}

function expectClosed(
	assembler: FidoHidMessageAssembler,
	reportBytes = 64,
): void {
	expectError(
		() => assembler.accept(initialReport(0, [], reportBytes)),
		"closed",
	);
	expect(() => assembler.close()).not.toThrow();
	expect(() => assembler.close()).not.toThrow();
	expectError(
		() => assembler.accept(initialReport(0, [], reportBytes)),
		"closed",
	);
}

describe("FidoHidMessageAssembler independent wire fixtures", () => {
	it("assembles a default-size report and ignores nonzero initialization padding", () => {
		const report = new Uint8Array(64).fill(0xe7);
		report.set([0x12, 0x34, 0x56, 0x78, 0x83, 0x00, 0x03, 0x00, 0xff, 0x80]);
		const assembler = new FidoHidMessageAssembler(channel);
		const message = assembler.accept(report);
		expect(message).toEqual({
			channel,
			command: 3,
			payload: new Uint8Array([0x00, 0xff, 0x80]),
		});
		report.fill(0);
		expectClosed(assembler);
		expect(message?.channel).toEqual(channel);
		expect(message?.payload).toEqual(new Uint8Array([0x00, 0xff, 0x80]));
	});

	it("assembles seven-byte reports with no initial data capacity", () => {
		const assembler = new FidoHidMessageAssembler(channel, 7);
		expect(
			assembler.accept(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0, 3])),
		).toBeUndefined();
		expect(
			assembler.accept(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0, 0xab, 0xcd])),
		).toBeUndefined();
		expect(
			assembler.accept(new Uint8Array([0x12, 0x34, 0x56, 0x78, 1, 0xef, 0xee])),
		).toEqual({
			channel,
			command: 127,
			payload: new Uint8Array([0xab, 0xcd, 0xef]),
		});
		expectClosed(assembler, 7);
	});

	it("waits for every declared byte and ignores final continuation padding", () => {
		const assembler = new FidoHidMessageAssembler(channel, 8);
		expect(
			assembler.accept(
				new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x80, 0, 5, 0x11]),
			),
		).toBeUndefined();
		expect(
			assembler.accept(
				new Uint8Array([0x12, 0x34, 0x56, 0x78, 0, 0x22, 0x33, 0x44]),
			),
		).toBeUndefined();
		expect(
			assembler.accept(
				new Uint8Array([0x12, 0x34, 0x56, 0x78, 1, 0x55, 0xaa, 0xbb]),
			),
		).toEqual({
			channel,
			command: 0,
			payload: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55]),
		});
		expectClosed(assembler, 8);
	});

	it.each([7, 8, 19, 63, 64])(
		"completes an empty message at report size %i",
		(reportBytes) => {
			const assembler = new FidoHidMessageAssembler(channel, reportBytes);
			const report = initialReport(0, [], reportBytes);
			report.fill(0xa5, 7);
			expect(assembler.accept(report)).toEqual({
				channel,
				command: 1,
				payload: new Uint8Array(),
			});
			expectClosed(assembler, reportBytes);
		},
	);

	it.each([7, 8, 19, 63, 64])(
		"assembles capacity boundaries through sequence 127 at size %i",
		(reportBytes) => {
			const initialCapacity = reportBytes - 7;
			const continuationCapacity = reportBytes - 5;
			const maximum = initialCapacity + 128 * continuationCapacity;
			if (reportBytes === 64) expect(maximum).toBe(7609);
			for (const payloadLength of [
				initialCapacity,
				initialCapacity + 1,
				initialCapacity + continuationCapacity,
				initialCapacity + continuationCapacity + 1,
				maximum - 1,
				maximum,
			]) {
				const expected = Uint8Array.from(
					{ length: payloadLength },
					(_, index) => (index * 37 + 11) & 0xff,
				);
				const assembler = new FidoHidMessageAssembler(channel, reportBytes);
				let message = assembler.accept(
					initialReport(
						payloadLength,
						Array.from(expected.subarray(0, initialCapacity)),
						reportBytes,
						0x7e,
					),
				);
				let offset = initialCapacity;
				let sequence = 0;
				while (offset < payloadLength) {
					expect(message).toBeUndefined();
					const fragment = Array.from(
						expected.subarray(offset, offset + continuationCapacity),
					);
					message = assembler.accept(
						continuationReport(sequence, fragment, reportBytes),
					);
					offset += continuationCapacity;
					sequence += 1;
				}
				if (payloadLength >= maximum - 1) expect(sequence).toBe(128);
				expect(message).toEqual({ channel, command: 0x7e, payload: expected });
				expectClosed(assembler, reportBytes);
				expect(message?.payload).toEqual(expected);
			}
		},
	);

	it.each([0, 1, 0x3f, 0x7f])(
		"returns uninterpreted command %i without semantic authorization",
		(command) => {
			const assembler = new FidoHidMessageAssembler(channel);
			expect(assembler.accept(initialReport(0, [], 64, command))?.command).toBe(
				command,
			);
		},
	);

	it("accepts the broadcast channel structurally", () => {
		const broadcast = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
		const assembler = new FidoHidMessageAssembler(broadcast);
		expect(
			assembler.accept(initialReport(1, [0x42], 64, 0x7f, broadcast)),
		).toEqual({
			channel: broadcast,
			command: 0x7f,
			payload: new Uint8Array([0x42]),
		});
	});
});

describe("FidoHidMessageAssembler ownership and channel isolation", () => {
	it("snapshots an offset channel view and each accepted report fragment", () => {
		const backing = new Uint8Array([0xaa, ...channel, 0xbb]);
		const inputChannel = backing.subarray(1, 5);
		const assembler = new FidoHidMessageAssembler(inputChannel, 8);
		backing.fill(0);
		const initialBacking = new Uint8Array([
			0xaa, 0x12, 0x34, 0x56, 0x78, 0x82, 0, 5, 0x11, 0xbb,
		]);
		expect(assembler.accept(initialBacking.subarray(1, 9))).toBeUndefined();
		initialBacking.fill(0);
		const fragment = continuationReport(0, [0x22, 0x33, 0x44], 8);
		expect(assembler.accept(fragment)).toBeUndefined();
		fragment.fill(0);
		const finalReport = continuationReport(1, [0x55, 0xee, 0xff], 8);
		const message = assembler.accept(finalReport);
		finalReport.fill(0);
		expect(message).toEqual({
			channel,
			command: 2,
			payload: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55]),
		});
		expectClosed(assembler, 8);
		expect(message?.payload).toEqual(
			new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55]),
		);
	});

	it("ignores valid foreign initialization and continuation packets before and during assembly", () => {
		const assembler = new FidoHidMessageAssembler(channel, 8);
		for (const sequence of [0, 1, 127]) {
			expect(
				assembler.accept(
					continuationReport(sequence, [9, 9, 9], 8, foreignChannel),
				),
			).toBeUndefined();
		}
		expect(
			assembler.accept(initialReport(0, [], 8, 0x7f, foreignChannel)),
		).toBeUndefined();
		expect(assembler.accept(initialReport(5, [1], 8))).toBeUndefined();
		expect(
			assembler.accept(initialReport(200, [9], 8, 0x7f, foreignChannel)),
		).toBeUndefined();
		expect(
			assembler.accept(continuationReport(0, [9, 9, 9], 8, foreignChannel)),
		).toBeUndefined();
		expect(
			assembler.accept(continuationReport(0, [2, 3, 4], 8)),
		).toBeUndefined();
		expect(
			assembler.accept(continuationReport(1, [9, 9, 9], 8, foreignChannel)),
		).toBeUndefined();
		expect(
			assembler.accept(continuationReport(127, [], 8, foreignChannel)),
		).toBeUndefined();
		expect(assembler.accept(continuationReport(1, [5], 8))).toEqual({
			channel,
			command: 1,
			payload: new Uint8Array([1, 2, 3, 4, 5]),
		});
	});

	it("transfers a writable completed payload that later close cannot erase", () => {
		const assembler = new FidoHidMessageAssembler(channel, 8);
		expect(assembler.accept(initialReport(2, [1], 8))).toBeUndefined();
		const message = assembler.accept(continuationReport(0, [2], 8));
		expect(message).toBeDefined();
		if (!message) throw new Error("Expected completed message");
		message.channel.fill(0);
		expect(message.payload).toEqual(new Uint8Array([1, 2]));
		message.payload[0] = 0xee;
		expectClosed(assembler, 8);
		expect(message.payload).toEqual(new Uint8Array([0xee, 2]));
		expect(channel).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
	});
});

describe("FidoHidMessageAssembler terminal framing failures", () => {
	it.each([0, 1, 127])(
		"rejects owned continuation %i before initialization",
		(sequence) => {
			const assembler = new FidoHidMessageAssembler(channel);
			expectError(
				() => assembler.accept(continuationReport(sequence)),
				"invalid-input",
			);
			expectClosed(assembler);
		},
	);

	it.each([1, 2, 127])(
		"rejects missing sequence zero rather than accepting sequence %i",
		(sequence) => {
			const assembler = new FidoHidMessageAssembler(channel, 8);
			expect(assembler.accept(initialReport(8, [1], 8))).toBeUndefined();
			expectError(
				() => assembler.accept(continuationReport(sequence, [2, 3, 4], 8)),
				"invalid-input",
			);
			expectClosed(assembler, 8);
		},
	);

	it.each([0, 2, 127])(
		"rejects duplicate or missing sequence one when given %i",
		(sequence) => {
			const assembler = new FidoHidMessageAssembler(channel, 8);
			expect(assembler.accept(initialReport(8, [1], 8))).toBeUndefined();
			expect(
				assembler.accept(continuationReport(0, [2, 3, 4], 8)),
			).toBeUndefined();
			expectError(
				() => assembler.accept(continuationReport(sequence, [5, 6, 7], 8)),
				"invalid-input",
			);
			expectError(
				() => assembler.accept(continuationReport(1, [5, 6, 7], 8)),
				"closed",
			);
			expectClosed(assembler, 8);
		},
	);

	it.each([0, 1, 8])(
		"rejects a second owned initialization declaring %i bytes",
		(payloadLength) => {
			const assembler = new FidoHidMessageAssembler(channel, 8);
			expect(assembler.accept(initialReport(8, [1], 8))).toBeUndefined();
			expectError(
				() => assembler.accept(initialReport(payloadLength, [], 8)),
				"invalid-input",
			);
			expectClosed(assembler, 8);
		},
	);

	it.each([7, 8, 19, 63, 64])(
		"rejects declarations above the negotiated maximum at size %i",
		(reportBytes) => {
			const maximum = reportBytes - 7 + 128 * (reportBytes - 5);
			for (const payloadLength of [maximum + 1, 0xffff]) {
				const assembler = new FidoHidMessageAssembler(channel, reportBytes);
				expectError(
					() => assembler.accept(initialReport(payloadLength, [], reportBytes)),
					"resource-limit",
				);
				expectClosed(assembler, reportBytes);
			}
		},
	);

	it.each([false, true])(
		"rejects malformed owned and foreign report sizes with pending=%s",
		(pending) => {
			for (const reportChannel of [channel, foreignChannel]) {
				for (const reportBytes of [0, 4, 6, 7, 9, 64, 65]) {
					const assembler = new FidoHidMessageAssembler(channel, 8);
					if (pending)
						expect(assembler.accept(initialReport(5, [1], 8))).toBeUndefined();
					const report = new Uint8Array(reportBytes);
					if (reportBytes >= 4) report.set(reportChannel);
					if (reportBytes >= 5) report[4] = 0x81;
					expectError(() => assembler.accept(report), "invalid-input");
					expectClosed(assembler, 8);
				}
			}
		},
	);

	it.each([false, true])(
		"rejects reserved-zero-channel packets with pending=%s",
		(pending) => {
			for (const marker of [0, 0x81]) {
				const assembler = new FidoHidMessageAssembler(channel, 8);
				if (pending)
					expect(assembler.accept(initialReport(5, [1], 8))).toBeUndefined();
				const report = new Uint8Array(8);
				report[4] = marker;
				expectError(() => assembler.accept(report), "invalid-input");
				expectClosed(assembler, 8);
			}
		},
	);

	it.each([false, true])(
		"rejects malformed report types terminally with pending=%s",
		(pending) => {
			const detached = new Uint8Array(8);
			structuredClone(detached.buffer, { transfer: [detached.buffer] });
			for (const report of [
				null,
				undefined,
				"12345678",
				[0x12, 0x34, 0x56, 0x78, 0x81, 0, 0, 0],
				new ArrayBuffer(8),
				new DataView(new ArrayBuffer(8)),
				new Uint16Array(4),
				new Int8Array(8),
				new Uint8ClampedArray(8),
				new Proxy(initialReport(0, [], 8), {}),
				new Uint8Array(new SharedArrayBuffer(8)),
				detached,
			]) {
				const assembler = new FidoHidMessageAssembler(channel, 8);
				if (pending)
					expect(assembler.accept(initialReport(5, [1], 8))).toBeUndefined();
				expectError(
					() => assembler.accept(report as Uint8Array),
					"invalid-input",
				);
				expectClosed(assembler, 8);
			}
		},
	);

	it.each([false, true])(
		"close is idempotent and prevents resuming with pending=%s",
		(pending) => {
			const assembler = new FidoHidMessageAssembler(channel, 8);
			const initial = initialReport(5, [0x42], 8);
			if (pending) expect(assembler.accept(initial)).toBeUndefined();
			assembler.close();
			expect(initial[7]).toBe(0x42);
			expectError(
				() => assembler.accept(continuationReport(0, [1, 2, 3], 8)),
				"closed",
			);
			expectClosed(assembler, 8);
		},
	);

	it("does not let later malformed input reopen a completed assembler", () => {
		const assembler = new FidoHidMessageAssembler(channel);
		const message = assembler.accept(initialReport(1, [0xa7]));
		expectError(() => assembler.accept(new Uint8Array()), "closed");
		expectClosed(assembler);
		expect(message?.payload).toEqual(new Uint8Array([0xa7]));
	});
});

describe("FidoHidMessageAssembler constructor validation", () => {
	it.each([
		0,
		6,
		65,
		-1,
		7.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER,
	])("rejects unsupported report size %s", (reportBytes) => {
		expectError(
			() => new FidoHidMessageAssembler(channel, reportBytes),
			"invalid-input",
		);
	});

	it.each([null, "8", true, {}])(
		"rejects nonnumeric report size %s",
		(reportBytes) => {
			expectError(
				() => new FidoHidMessageAssembler(channel, reportBytes as number),
				"invalid-input",
			);
		},
	);

	it("rejects malformed, wrong-sized and reserved channels", () => {
		for (const inputChannel of [
			null,
			undefined,
			[1, 2, 3, 4],
			new Uint8Array(),
			new Uint8Array([1, 2, 3]),
			new Uint8Array([1, 2, 3, 4, 5]),
			new Uint8Array(4),
			new Uint16Array([1, 2, 3, 4]),
			new DataView(new ArrayBuffer(4)),
			new Proxy(channel, {}),
			new Uint8Array(new SharedArrayBuffer(4)),
		]) {
			expectError(
				() => new FidoHidMessageAssembler(inputChannel as Uint8Array),
				"invalid-input",
			);
		}
	});
});
