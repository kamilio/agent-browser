import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	decodeFidoHidAllocationResponse,
	encodeFidoHidAllocationRequest,
} from "./fido-hid-allocation.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const broadcast = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
const nonce = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
const response = new Uint8Array([
	0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x12, 0x34, 0xab, 0xcd, 2, 1,
	2, 3, 0x05,
]);
const allocation = {
	channel: new Uint8Array([0x12, 0x34, 0xab, 0xcd]),
	protocolVersion: 2,
	deviceVersion: { major: 1, minor: 2, build: 3 },
	capabilities: 0x05,
	wink: true,
	cbor: true,
	msg: true,
	extensions: new Uint8Array(),
};

function rejects(action: () => unknown) {
	expect(action).toThrowError(AgentBrowserError);
	expect(action).toThrowError(
		expect.objectContaining({
			code: "invalid-input",
			message: "Invalid FIDO HID allocation input.",
		}),
	);
}

function rejectsBytes(input: unknown) {
	const bytes = input as Uint8Array;
	rejects(() => encodeFidoHidAllocationRequest(bytes));
	rejects(() => decodeFidoHidAllocationResponse(bytes, 6, response, nonce));
	rejects(() => decodeFidoHidAllocationResponse(broadcast, 6, bytes, nonce));
	rejects(() => decodeFidoHidAllocationResponse(broadcast, 6, response, bytes));
}

it("encodes an independent default broadcast INIT wire fixture", () => {
	const expected = new Uint8Array(64);
	expected.set([
		0xff, 0xff, 0xff, 0xff, 0x86, 0, 8, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60,
		0x70, 0x80,
	]);
	expect(encodeFidoHidAllocationRequest(nonce)).toEqual([expected]);
});

it("encodes independent minimum and eight-byte report fixtures", () => {
	expect(encodeFidoHidAllocationRequest(nonce, 7)).toEqual([
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x86, 0, 8]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0x10, 0x20]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 0x30, 0x40]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 2, 0x50, 0x60]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 3, 0x70, 0x80]),
	]);
	expect(encodeFidoHidAllocationRequest(nonce, 8)).toEqual([
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x86, 0, 8, 0x10]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0x20, 0x30, 0x40]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 0x50, 0x60, 0x70]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 2, 0x80, 0, 0]),
	]);
});

it("decodes an independent response and keeps the assigned CID opaque", () => {
	expect(
		decodeFidoHidAllocationResponse(broadcast, 6, response, nonce),
	).toEqual(allocation);
	for (const channel of [
		[0, 0, 0, 1],
		[1, 0, 0, 0],
		[255, 255, 255, 254],
	]) {
		const payload = response.slice();
		payload.set(channel, 8);
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, nonce)?.channel,
		).toEqual(new Uint8Array(channel));
	}
});

it("accepts every byte value as a caller-supplied correlation nonce", () => {
	for (const value of [0, 255]) {
		const expectedNonce = new Uint8Array(8).fill(value);
		const payload = response.slice();
		payload.set(expectedNonce);
		expect(encodeFidoHidAllocationRequest(expectedNonce)).toHaveLength(1);
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, expectedNonce),
		).toEqual(allocation);
	}
});

it.each([0, 1, 7, 9, 17, 7609])("rejects nonce length %i", (length) => {
	const invalid = new Uint8Array(length);
	rejects(() => encodeFidoHidAllocationRequest(invalid));
	rejects(() =>
		decodeFidoHidAllocationResponse(broadcast, 6, response, invalid),
	);
});

it("rejects report sizes without coercion and normalizes packet errors", () => {
	let hooks = 0;
	const hostile = {
		valueOf() {
			hooks++;
			throw new Error("private coercion data");
		},
	};
	for (const value of [
		0,
		6,
		65,
		-1,
		7.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"8",
		null,
		true,
		8n,
		Symbol(),
		hostile,
	])
		rejects(() => encodeFidoHidAllocationRequest(nonce, value as number));
	expect(hooks).toBe(0);
});

it("rejects nonbroadcast or malformed envelopes even for unrelated nonces", () => {
	const unrelated = new Uint8Array(8);
	for (const channel of [
		new Uint8Array(),
		new Uint8Array(3),
		new Uint8Array(5).fill(255),
		new Uint8Array(4),
		allocation.channel,
		new Uint8Array([255, 255, 255, 254]),
	])
		for (const expectedNonce of [nonce, unrelated])
			rejects(() =>
				decodeFidoHidAllocationResponse(channel, 6, response, expectedNonce),
			);
});

it("requires the logical INIT command without invoking numeric hooks", () => {
	let hooks = 0;
	const hostile = {
		valueOf() {
			hooks++;
			throw new Error("private command data");
		},
	};
	for (const command of [
		0,
		1,
		0x3f,
		0x86,
		-1,
		6.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"6",
		6n,
		null,
		undefined,
		true,
		Symbol(),
		hostile,
	])
		for (const expectedNonce of [nonce, new Uint8Array(8)])
			rejects(() =>
				decodeFidoHidAllocationResponse(
					broadcast,
					command as number,
					response,
					expectedNonce,
				),
			);
	expect(hooks).toBe(0);
});

it.each(Array.from({ length: 17 }, (_, length) => length))(
	"rejects truncated payload length %i before nonce matching",
	(length) => {
		for (const expectedNonce of [nonce, new Uint8Array(8)])
			rejects(() =>
				decodeFidoHidAllocationResponse(
					broadcast,
					6,
					response.slice(0, length),
					expectedNonce,
				),
			);
	},
);

it("bounds response payloads at 7609 bytes including unrelated responses", () => {
	const maximum = new Uint8Array(7609).fill(0xa5);
	maximum.set(response);
	expect(
		decodeFidoHidAllocationResponse(broadcast, 6, maximum, nonce)?.extensions,
	).toEqual(new Uint8Array(7592).fill(0xa5));
	for (const length of [7610, 65535]) {
		const excessive = new Uint8Array(length);
		excessive.set(response);
		for (const expectedNonce of [nonce, new Uint8Array(8)])
			rejects(() =>
				decodeFidoHidAllocationResponse(broadcast, 6, excessive, expectedNonce),
			);
	}
});

it.each([0, 1, 2, 3, 4, 5, 6, 7])(
	"ignores an unrelated echo differing at nonce byte %i",
	(index) => {
		const payload = response.slice();
		payload[index] ^= 0xff;
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, nonce),
		).toBeNull();
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, response, nonce),
		).toEqual(allocation);
	},
);

it.each([0, 255])(
	"rejects reserved assigned CID bytes %i only after nonce matching",
	(value) => {
		const payload = response.slice();
		payload.fill(value, 8, 12);
		rejects(() =>
			decodeFidoHidAllocationResponse(broadcast, 6, payload, nonce),
		);
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, new Uint8Array(8)),
		).toBeNull();
	},
);

it.each([
	[0x00, false, false, true],
	[0x01, true, false, true],
	[0x04, false, true, true],
	[0x05, true, true, true],
	[0x08, false, false, false],
	[0x09, true, false, false],
	[0x0c, false, true, false],
	[0x0d, true, true, false],
] as const)(
	"interprets capability combination %i including inverted NMSG",
	(capabilities, wink, cbor, msg) => {
		const payload = response.slice();
		payload[16] = capabilities;
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, nonce),
		).toEqual({
			...allocation,
			capabilities,
			wink,
			cbor,
			msg,
		});
	},
);

it("preserves unknown versions, capability bits and extension bytes", () => {
	for (const protocolVersion of [0, 1, 3, 255]) {
		const payload = new Uint8Array(21);
		payload.set(response);
		payload.set([protocolVersion, 255, 0, 128, 0xf2, 0, 0xff, 0x86, 0x06], 12);
		expect(
			decodeFidoHidAllocationResponse(broadcast, 6, payload, nonce),
		).toEqual({
			channel: allocation.channel,
			protocolVersion,
			deviceVersion: { major: 255, minor: 0, build: 128 },
			capabilities: 0xf2,
			wink: false,
			cbor: false,
			msg: true,
			extensions: new Uint8Array([0, 0xff, 0x86, 0x06]),
		});
	}
});

it("isolates request reports from nonce storage, other reports and later calls", () => {
	const input = nonce.slice();
	const before = input.slice();
	const reports = encodeFidoHidAllocationRequest(input, 8);
	const expected = reports.map((report) => report.slice());
	expect(input).toEqual(before);
	input.fill(0);
	expect(reports).toEqual(expected);
	reports[0].fill(0);
	expect(reports[1]).toEqual(expected[1]);
	expect(input).toEqual(new Uint8Array(8));
	expect(encodeFidoHidAllocationRequest(nonce, 8)).toEqual(expected);
});

it("isolates decoded fields and inputs in both mutation directions", () => {
	const channel = broadcast.slice();
	const expectedNonce = nonce.slice();
	const payload = new Uint8Array([...response, 0xaa, 0xbb]);
	const before = payload.slice();
	const first = decodeFidoHidAllocationResponse(
		channel,
		6,
		payload,
		expectedNonce,
	);
	const second = decodeFidoHidAllocationResponse(
		channel,
		6,
		payload,
		expectedNonce,
	);
	if (!first || !second) throw new Error("Expected matching allocations");
	expect(channel).toEqual(broadcast);
	expect(expectedNonce).toEqual(nonce);
	expect(payload).toEqual(before);
	for (const output of [first.channel, first.extensions]) {
		expect(output.buffer).not.toBe(channel.buffer);
		expect(output.buffer).not.toBe(expectedNonce.buffer);
		expect(output.buffer).not.toBe(payload.buffer);
	}
	expect(first.channel.buffer).not.toBe(first.extensions.buffer);
	first.channel.fill(0);
	first.extensions.fill(0);
	first.deviceVersion.major = 99;
	expect(payload).toEqual(before);
	expect(second).toEqual({
		...allocation,
		extensions: new Uint8Array([0xaa, 0xbb]),
	});
	channel.fill(0);
	expectedNonce.fill(0);
	payload.fill(0);
	expect(second).toEqual({
		...allocation,
		extensions: new Uint8Array([0xaa, 0xbb]),
	});
});

it("accepts offset views without copying surrounding bytes", () => {
	const storage = new Uint8Array(40).fill(0xee);
	storage.set(broadcast, 1);
	storage.set(nonce, 6);
	storage.set(response, 15);
	const channel = new Uint8Array(storage.buffer, 1, 4);
	const expectedNonce = new Uint8Array(storage.buffer, 6, 8);
	const payload = new Uint8Array(storage.buffer, 15, 17);
	const before = storage.slice();
	expect(encodeFidoHidAllocationRequest(expectedNonce)).toEqual(
		encodeFidoHidAllocationRequest(nonce),
	);
	const result = decodeFidoHidAllocationResponse(
		channel,
		6,
		payload,
		expectedNonce,
	);
	expect(result).toEqual(allocation);
	expect(storage).toEqual(before);
	storage.fill(0);
	expect(result).toEqual(allocation);
});

it("rejects nonbytes and shared or detached views at every byte entry point", () => {
	for (const length of [0, 4, 8, 17]) {
		const detached = new Uint8Array(length);
		structuredClone(detached.buffer, { transfer: [detached.buffer] });
		for (const input of [
			new ArrayBuffer(length),
			new DataView(new ArrayBuffer(length)),
			new Int8Array(length),
			new Uint8ClampedArray(length),
			new Uint16Array(length),
			new Float32Array(length),
			new BigUint64Array(length),
			new SharedArrayBuffer(length),
			new Uint8Array(new SharedArrayBuffer(length)),
			detached,
		])
			rejectsBytes(input);
	}
	for (const input of [null, undefined, 8, "private bytes", [...nonce], {}])
		rejectsBytes(input);
});

it("rejects proxies and property spoofs without invoking their hooks", () => {
	let hooks = 0;
	const trap = () => {
		hooks++;
		throw new Error("private input hook data");
	};
	const spoof = Object.create(Uint8Array.prototype);
	for (const property of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		"constructor",
		Symbol.toStringTag,
		Symbol.iterator,
	])
		Object.defineProperty(spoof, property, { get: trap });
	const revoked = Proxy.revocable(nonce.slice(), {});
	revoked.revoke();
	for (const input of [
		spoof,
		new Proxy(nonce.slice(), { get: trap, getPrototypeOf: trap }),
		revoked.proxy,
	])
		rejectsBytes(input);
	expect(hooks).toBe(0);
});

it("accepts genuine hostile-hook, Buffer and cross-realm byte views", () => {
	let hooks = 0;
	const trap = () => {
		hooks++;
		throw new Error("private byte hook data");
	};
	const shadow = (input: Uint8Array) => {
		const bytes = input.slice();
		for (const property of [
			"buffer",
			"byteOffset",
			"byteLength",
			"length",
			"constructor",
			"slice",
			"subarray",
			"set",
			"values",
			Symbol.toStringTag,
			Symbol.iterator,
		])
			Object.defineProperty(bytes, property, { get: trap });
		return bytes;
	};
	class HostileBytes extends Uint8Array {
		static get [Symbol.species](): Uint8ArrayConstructor {
			return trap();
		}
	}
	const variants: ((input: Uint8Array) => Uint8Array)[] = [
		shadow,
		(input) => new HostileBytes(input),
		(input) => Buffer.from([99, ...input, 99]).subarray(1, input.length + 1),
		(input) =>
			runInNewContext(
				"new Uint8Array(new Uint8Array(bytes).buffer, 1, bytes.length - 2)",
				{ bytes: [99, ...input, 99] },
			),
	];
	for (const variant of variants) {
		expect(encodeFidoHidAllocationRequest(variant(nonce))).toEqual(
			encodeFidoHidAllocationRequest(nonce),
		);
		expect(
			decodeFidoHidAllocationResponse(
				variant(broadcast),
				6,
				variant(response),
				variant(nonce),
			),
		).toEqual(allocation);
	}
	expect(hooks).toBe(0);
});

function responseReports(): Uint8Array[] {
	return [
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x86, 0, 17, 0x10]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0x20, 0x30, 0x40]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 0x50, 0x60, 0x70]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 2, 0x80, 0x12, 0x34]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 3, 0xab, 0xcd, 2]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 4, 1, 2, 3]),
		new Uint8Array([0xff, 0xff, 0xff, 0xff, 5, 5, 0xee, 0xee]),
	];
}

it("composes independent small reports with assembly and ignores foreign traffic and padding", () => {
	const assembler = new FidoHidMessageAssembler(broadcast, 8);
	const reports = responseReports();
	for (let index = 0; index < reports.length - 1; index++) {
		const foreign = reports[index].slice();
		foreign.set([1, 2, 3, 4]);
		expect(assembler.accept(foreign)).toBeUndefined();
		expect(assembler.accept(reports[index])).toBeUndefined();
	}
	const message = assembler.accept(reports[reports.length - 1]);
	if (!message) throw new Error("Expected complete allocation response");
	expect(message).toEqual({
		channel: broadcast,
		command: 6,
		payload: response,
	});
	expect(
		decodeFidoHidAllocationResponse(
			message.channel,
			message.command,
			message.payload,
			nonce,
		),
	).toEqual(allocation);
	expect(() => assembler.accept(reports[0])).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
});

it("uses a fresh assembler after an unrelated completed broadcast response", () => {
	for (const mismatch of [true, false]) {
		const assembler = new FidoHidMessageAssembler(broadcast, 8);
		const reports = responseReports();
		if (mismatch) reports[0][7] ^= 0xff;
		let completed = 0;
		for (let index = 0; index < reports.length; index++) {
			const message = assembler.accept(reports[index]);
			if (index < reports.length - 1) expect(message).toBeUndefined();
			else {
				if (!message) throw new Error("Expected complete broadcast response");
				completed++;
				expect(
					decodeFidoHidAllocationResponse(
						message.channel,
						message.command,
						message.payload,
						nonce,
					),
				).toEqual(mismatch ? null : allocation);
			}
		}
		expect(completed).toBe(1);
		expect(() => assembler.accept(reports[0])).toThrowError(
			expect.objectContaining({ code: "closed" }),
		);
	}
});

it.each(["skipped", "repeated"])(
	"does not assemble a %s continuation",
	(kind) => {
		const assembler = new FidoHidMessageAssembler(broadcast, 8);
		const reports = responseReports();
		expect(assembler.accept(reports[0])).toBeUndefined();
		if (kind === "repeated")
			expect(assembler.accept(reports[1])).toBeUndefined();
		expect(() =>
			assembler.accept(reports[kind === "skipped" ? 2 : 1]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(() => assembler.accept(reports[0])).toThrowError(
			expect.objectContaining({ code: "closed" }),
		);
	},
);

it.each([7, 8, 16, 64])(
	"composes request and extended response helpers at report size %i",
	(reportBytes) => {
		const requestAssembler = new FidoHidMessageAssembler(
			broadcast,
			reportBytes,
		);
		const requests = encodeFidoHidAllocationRequest(nonce, reportBytes);
		for (let index = 0; index < requests.length; index++) {
			const message = requestAssembler.accept(requests[index]);
			if (index === requests.length - 1)
				expect(message).toEqual({
					channel: broadcast,
					command: 6,
					payload: nonce,
				});
			else expect(message).toBeUndefined();
		}
		const payload = new Uint8Array([...response, 0xde, 0xad]);
		const reports = encodeFidoHidMessage(broadcast, 6, payload, reportBytes);
		const responseAssembler = new FidoHidMessageAssembler(
			broadcast,
			reportBytes,
		);
		for (let index = 0; index < reports.length; index++) {
			const message = responseAssembler.accept(reports[index]);
			if (index === reports.length - 1) {
				if (!message) throw new Error("Expected complete allocation response");
				expect(
					decodeFidoHidAllocationResponse(
						message.channel,
						message.command,
						message.payload,
						nonce,
					),
				).toEqual({
					...allocation,
					extensions: new Uint8Array([0xde, 0xad]),
				});
			} else expect(message).toBeUndefined();
		}
	},
);
