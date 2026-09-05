import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import {
	decodeFidoHidPacket,
	encodeFidoHidMessage,
} from "./fido-hid-packets.js";
import {
	decodeLinuxHidrawInputReport,
	encodeLinuxHidrawOutputReport,
} from "./linux-hidraw-reports.js";

const report = new Uint8Array([0, 0x12, 0x34, 0x56, 0x81, 0, 0]);
const fixtures = [
	{
		reportId: 0,
		input: new Uint8Array([0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
		output: new Uint8Array([0, 0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
	},
	{
		reportId: 1,
		input: new Uint8Array([1, 0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
		output: new Uint8Array([1, 0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
	},
	{
		reportId: 255,
		input: new Uint8Array([255, 0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
		output: new Uint8Array([255, 0, 0x12, 0x34, 0x56, 0x81, 0, 0]),
	},
];

function rejects(action: () => unknown): void {
	expect(action).toThrowError(AgentBrowserError);
	expect(action).toThrowError(
		expect.objectContaining({
			code: "invalid-input",
			message: "Invalid Linux hidraw report input.",
		}),
	);
}

it.each(fixtures)("encodes independent output fixture $reportId", (fixture) => {
	expect(encodeLinuxHidrawOutputReport(report, 7, fixture.reportId)).toEqual(
		fixture.output,
	);
});

it.each(fixtures)("decodes independent input fixture $reportId", (fixture) => {
	expect(
		decodeLinuxHidrawInputReport(fixture.input, 7, fixture.reportId),
	).toEqual(report);
});

it("defaults only the report ID and preserves leading zero payload bytes", () => {
	expect(encodeLinuxHidrawOutputReport(report, 7)).toEqual(fixtures[0].output);
	expect(decodeLinuxHidrawInputReport(report, 7)).toEqual(report);
	expect(encodeLinuxHidrawOutputReport(report, 7, undefined)).toEqual(
		fixtures[0].output,
	);
	expect(decodeLinuxHidrawInputReport(report, 7, undefined)).toEqual(report);
});

it("does not treat unnumbered writes as unnumbered reads", () => {
	const output = encodeLinuxHidrawOutputReport(report, 7);
	rejects(() => decodeLinuxHidrawInputReport(output, 7));
	rejects(() => encodeLinuxHidrawOutputReport(output, 7));
	rejects(() => decodeLinuxHidrawInputReport(report, 7, 1));
});

it.each([1, 255])(
	"rejects rather than routes a wrong prefix for ID %i",
	(reportId) => {
		for (const prefix of [0, 1, 2, 255]) {
			if (prefix === reportId) continue;
			const input = new Uint8Array([prefix, ...report]);
			rejects(() => decodeLinuxHidrawInputReport(input, 7, reportId));
		}
	},
);

it.each(Array.from({ length: 58 }, (_, index) => index + 7))(
	"enforces exact input lengths at admitted report size %i",
	(reportBytes) => {
		const payload = new Uint8Array(reportBytes).fill(0xa5);
		for (const reportId of [0, 1, 255]) {
			const expectedOutput = new Uint8Array(reportBytes + 1).fill(0xa5);
			expectedOutput[0] = reportId;
			const input = reportId === 0 ? payload : expectedOutput;
			expect(
				encodeLinuxHidrawOutputReport(payload, reportBytes, reportId),
			).toEqual(expectedOutput);
			expect(
				decodeLinuxHidrawInputReport(input, reportBytes, reportId),
			).toEqual(payload);
			for (const length of [0, reportBytes - 1, reportBytes + 1, 65536])
				rejects(() =>
					encodeLinuxHidrawOutputReport(
						new Uint8Array(length),
						reportBytes,
						reportId,
					),
				);
			for (const length of [0, input.length - 1, input.length + 1, 65536]) {
				const malformed = new Uint8Array(length);
				if (length > 0) malformed[0] = reportId;
				rejects(() =>
					decodeLinuxHidrawInputReport(malformed, reportBytes, reportId),
				);
			}
		}
	},
);

it("rejects invalid report sizes without numeric coercion or guessed metadata", () => {
	let hooks = 0;
	const hostile = {
		[Symbol.toPrimitive]() {
			hooks++;
			throw new Error("private report size");
		},
	};
	for (const reportBytes of [
		-1,
		0,
		6,
		65,
		65535,
		7.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"7",
		7n,
		null,
		undefined,
		true,
		Symbol(),
		new Number(7),
		hostile,
	]) {
		rejects(() => encodeLinuxHidrawOutputReport(report, reportBytes as number));
		rejects(() => decodeLinuxHidrawInputReport(report, reportBytes as number));
	}
	expect(hooks).toBe(0);
});

it("rejects an omitted report size even for a 64 byte input", () => {
	const encode = encodeLinuxHidrawOutputReport as unknown as (
		input: Uint8Array,
	) => Uint8Array;
	const decode = decodeLinuxHidrawInputReport as unknown as (
		input: Uint8Array,
	) => Uint8Array;
	rejects(() => encode(new Uint8Array(64)));
	rejects(() => decode(new Uint8Array(64)));
});

it("rejects out-of-range and nonnumeric report IDs without invoking hooks", () => {
	let hooks = 0;
	const trap = () => {
		hooks++;
		throw new Error("private report ID");
	};
	const hostile = { valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap };
	for (const reportId of [
		-1,
		256,
		65535,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"0",
		"1",
		"255",
		0n,
		1n,
		null,
		true,
		false,
		Symbol(),
		new Number(0),
		hostile,
	]) {
		rejects(() => encodeLinuxHidrawOutputReport(report, 7, reportId as number));
		for (const fixture of fixtures)
			rejects(() =>
				decodeLinuxHidrawInputReport(fixture.input, 7, reportId as number),
			);
	}
	expect(hooks).toBe(0);
});

it("admits every integer report ID without reserving packet command values", () => {
	for (let reportId = 0; reportId <= 255; reportId++) {
		const output = new Uint8Array([reportId, ...report]);
		expect(encodeLinuxHidrawOutputReport(report, 7, reportId)).toEqual(output);
		expect(
			decodeLinuxHidrawInputReport(
				reportId === 0 ? report : output,
				7,
				reportId,
			),
		).toEqual(report);
	}
});

it("rejects nonbyte values and spoofed byte branding", () => {
	for (const value of [
		null,
		undefined,
		false,
		7,
		"private bytes",
		[...report],
		{},
		new ArrayBuffer(7),
		new DataView(new ArrayBuffer(7)),
		new Int8Array(7),
		new Uint8ClampedArray(7),
		new Uint16Array(7),
		new Float32Array(7),
		Object.create(Uint8Array.prototype),
		{ length: 7, [Symbol.toStringTag]: "Uint8Array" },
	]) {
		rejects(() => encodeLinuxHidrawOutputReport(value as Uint8Array, 7));
		rejects(() => decodeLinuxHidrawInputReport(value as Uint8Array, 7));
	}
});

it("rejects shared and detached byte storage in both directions", () => {
	for (const fixture of fixtures) {
		for (const length of [report.length, fixture.input.length]) {
			const detached = new Uint8Array(length);
			structuredClone(detached.buffer, { transfer: [detached.buffer] });
			const shared = new Uint8Array(new SharedArrayBuffer(length));
			const foreignShared = runInNewContext(
				"new Uint8Array(new SharedArrayBuffer(length))",
				{ length },
			);
			for (const value of [detached, shared, foreignShared]) {
				rejects(() =>
					encodeLinuxHidrawOutputReport(value, 7, fixture.reportId),
				);
				rejects(() => decodeLinuxHidrawInputReport(value, 7, fixture.reportId));
			}
		}
	}
});

it("rejects proxies and hostile lookalikes without consulting their hooks", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private proxy bytes");
	};
	const revoked = Proxy.revocable(report, {});
	revoked.revoke();
	const lookalike = Object.create(null);
	for (const key of ["buffer", "length", "byteLength", Symbol.toStringTag])
		Object.defineProperty(lookalike, key, { get: trap });
	for (const value of [
		new Proxy(report, { get: trap, getPrototypeOf: trap }),
		new Proxy(report, {}),
		revoked.proxy,
		lookalike,
	]) {
		rejects(() => encodeLinuxHidrawOutputReport(value, 7));
		rejects(() => decodeLinuxHidrawInputReport(value, 7));
	}
	expect(hooks).toBe(0);
});

it("accepts genuine offset, Buffer, cross-realm and hostile subclass views without hooks", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private view hook");
	};
	class HostileBytes extends Uint8Array {
		static get [Symbol.species](): Uint8ArrayConstructor {
			return trap();
		}
	}
	const shadow = (input: Uint8Array): Uint8Array => {
		const view = new HostileBytes(input);
		for (const key of [
			"buffer",
			"byteOffset",
			"byteLength",
			"length",
			"constructor",
			"slice",
			"subarray",
			"set",
			"values",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(view, key, { get: trap });
		return view;
	};
	const variants: ((input: Uint8Array) => Uint8Array)[] = [
		shadow,
		(input) => new HostileBytes(input),
		(input) => new Uint8Array([99, ...input, 99]).subarray(1, input.length + 1),
		(input) => Buffer.from([99, ...input, 99]).subarray(1, input.length + 1),
		(input) =>
			runInNewContext(
				"new Uint8Array(new Uint8Array(bytes).buffer, 1, bytes.length - 2)",
				{ bytes: [99, ...input, 99] },
			),
	];
	for (const variant of variants)
		for (const fixture of fixtures) {
			expect(
				encodeLinuxHidrawOutputReport(variant(report), 7, fixture.reportId),
			).toEqual(fixture.output);
			expect(
				decodeLinuxHidrawInputReport(
					variant(fixture.input),
					7,
					fixture.reportId,
				),
			).toEqual(report);
		}
	expect(hooks).toBe(0);
});

it.each(fixtures)(
	"owns outputs and preserves input storage for ID $reportId",
	(fixture) => {
		const outputStorage = new Uint8Array([99, ...report, 88]);
		const inputStorage = new Uint8Array([77, ...fixture.input, 66]);
		const sourceReport = outputStorage.subarray(1, outputStorage.length - 1);
		const sourceInput = inputStorage.subarray(1, inputStorage.length - 1);
		const encoded = encodeLinuxHidrawOutputReport(
			sourceReport,
			7,
			fixture.reportId,
		);
		const encodedAgain = encodeLinuxHidrawOutputReport(
			sourceReport,
			7,
			fixture.reportId,
		);
		const decoded = decodeLinuxHidrawInputReport(
			sourceInput,
			7,
			fixture.reportId,
		);
		const decodedAgain = decodeLinuxHidrawInputReport(
			sourceInput,
			7,
			fixture.reportId,
		);
		expect(outputStorage).toEqual(new Uint8Array([99, ...report, 88]));
		expect(inputStorage).toEqual(new Uint8Array([77, ...fixture.input, 66]));
		expect(encoded.buffer).not.toBe(outputStorage.buffer);
		expect(decoded.buffer).not.toBe(inputStorage.buffer);
		expect(encoded.buffer).not.toBe(encodedAgain.buffer);
		expect(decoded.buffer).not.toBe(decodedAgain.buffer);
		expect(encoded.byteOffset).toBe(0);
		expect(decoded.byteOffset).toBe(0);
		expect(encoded.buffer.byteLength).toBe(8);
		expect(decoded.buffer.byteLength).toBe(7);
		encoded.fill(0xee);
		decoded.fill(0xdd);
		expect(sourceReport).toEqual(report);
		expect(sourceInput).toEqual(fixture.input);
		outputStorage.fill(0xcc);
		inputStorage.fill(0xbb);
		expect(encodedAgain).toEqual(fixture.output);
		expect(decodedAgain).toEqual(report);
	},
);

it("does not validate packet channels, commands or declared payload lengths", () => {
	for (const payload of [
		new Uint8Array(7),
		new Uint8Array([0, 0, 0, 0, 0xff, 0xff, 0xff]),
		new Uint8Array([255, 255, 255, 255, 127, 255, 255]),
	])
		for (const reportId of [0, 1, 255]) {
			const output = new Uint8Array([reportId, ...payload]);
			expect(encodeLinuxHidrawOutputReport(payload, 7, reportId)).toEqual(
				output,
			);
			expect(
				decodeLinuxHidrawInputReport(
					reportId === 0 ? payload : output,
					7,
					reportId,
				),
			).toEqual(payload);
		}
});

it.each([0, 1, 255])(
	"composes synthetic packet framing and assembly for ID %i",
	(reportId) => {
		const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
		const payload = Uint8Array.from({ length: 70 }, (_, index) => index);
		for (const [reportBytes, packetCount] of [
			[7, 36],
			[8, 24],
			[64, 2],
		]) {
			const assembler = new FidoHidMessageAssembler(channel, reportBytes);
			const packets = encodeFidoHidMessage(channel, 1, payload, reportBytes);
			expect(packets).toHaveLength(packetCount);
			for (let index = 0; index < packets.length; index++) {
				const packet = packets[index];
				const input =
					reportId === 0
						? packet.slice()
						: new Uint8Array([reportId, ...packet]);
				const normalized = decodeLinuxHidrawInputReport(
					input,
					reportBytes,
					reportId,
				);
				expect(normalized).toEqual(packet);
				expect(decodeFidoHidPacket(normalized, reportBytes)).toEqual(
					decodeFidoHidPacket(packet, reportBytes),
				);
				expect(
					encodeLinuxHidrawOutputReport(packet, reportBytes, reportId),
				).toEqual(new Uint8Array([reportId, ...packet]));
				const message = assembler.accept(normalized);
				if (index === packets.length - 1)
					expect(message).toEqual({ channel, command: 1, payload });
				else expect(message).toBeUndefined();
			}
		}
	},
);
