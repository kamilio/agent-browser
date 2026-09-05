import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type FidoHidMessage,
	FidoHidMessageAssembler,
} from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	type FidoHidResponseControl,
	decodeFidoHidResponseControl,
} from "./fido-hid-response-control.js";

const channel = new Uint8Array([1, 2, 3, 4]);
const commands = [0x3b, 0x3f];
const known = [
	{ command: 0x3b, code: 1, label: "STATUS_PROCESSING" },
	{ command: 0x3b, code: 2, label: "STATUS_UPNEEDED" },
	{ command: 0x3f, code: 0x01, label: "ERR_INVALID_CMD" },
	{ command: 0x3f, code: 0x02, label: "ERR_INVALID_PAR" },
	{ command: 0x3f, code: 0x03, label: "ERR_INVALID_LEN" },
	{ command: 0x3f, code: 0x04, label: "ERR_INVALID_SEQ" },
	{ command: 0x3f, code: 0x05, label: "ERR_MSG_TIMEOUT" },
	{ command: 0x3f, code: 0x06, label: "ERR_CHANNEL_BUSY" },
	{ command: 0x3f, code: 0x0a, label: "ERR_LOCK_REQUIRED" },
	{ command: 0x3f, code: 0x0b, label: "ERR_INVALID_CHANNEL" },
	{ command: 0x3f, code: 0x7f, label: "ERR_OTHER" },
];

function rejects(action: () => unknown) {
	expect(action).toThrowError(AgentBrowserError);
	expect(action).toThrowError(
		expect.objectContaining({
			code: "invalid-input",
			message: "Invalid FIDO HID response control input.",
		}),
	);
}

function rejectsBytes(command: number, makeBytes: (length: number) => unknown) {
	rejects(() =>
		decodeFidoHidResponseControl(
			makeBytes(4) as Uint8Array,
			command,
			new Uint8Array([1]),
		),
	);
	rejects(() =>
		decodeFidoHidResponseControl(channel, command, makeBytes(1) as Uint8Array),
	);
}

it.each(known)(
	"decodes $label as ordinary data",
	({ command, code, label }) => {
		const result = decodeFidoHidResponseControl(
			channel,
			command,
			new Uint8Array([code]),
		);
		expect(result).toEqual({
			kind: command === 0x3b ? "keepalive" : "error",
			channel,
			code,
			[command === 0x3b ? "status" : "error"]: label,
		});
		if (result.kind === "keepalive") {
			expect(result.status).toBe(label);
			expect(result).not.toHaveProperty("error");
		} else {
			expect(result.error).toBe(label);
			expect(result).not.toHaveProperty("status");
		}
	},
);

it.each(commands)("preserves every unknown byte for command %i", (command) => {
	const knownCodes =
		command === 0x3b ? [1, 2] : [1, 2, 3, 4, 5, 6, 10, 11, 127];
	let checked = 0;
	for (let code = 0; code <= 255; code++) {
		if (knownCodes.includes(code)) continue;
		const result = decodeFidoHidResponseControl(
			channel,
			command,
			new Uint8Array([code]),
		);
		expect(result).toEqual({
			kind: command === 0x3b ? "keepalive" : "error",
			channel,
			code,
			[command === 0x3b ? "status" : "error"]: "unknown",
		});
		if (result.kind === "error") expect(result.error).not.toBe("ERR_OTHER");
		else {
			expect(result.status).not.toBe("STATUS_PROCESSING");
			expect(result.status).not.toBe("STATUS_UPNEEDED");
		}
		checked++;
	}
	expect(checked).toBe(command === 0x3b ? 254 : 247);
});

it("rejects all other command bytes without masking wire bits", () => {
	let checked = 0;
	for (let command = 0; command <= 255; command++) {
		if (command === 0x3b || command === 0x3f) continue;
		rejects(() =>
			decodeFidoHidResponseControl(channel, command, new Uint8Array([1])),
		);
		checked++;
	}
	expect(checked).toBe(254);
});

it("rejects nonnumeric and out-of-range commands without coercion", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private command data");
	};
	const hostile = { valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap };
	for (const command of [
		-1,
		256,
		0x3b + 0.5,
		0x3f + 0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"59",
		"63",
		59n,
		63n,
		null,
		undefined,
		true,
		false,
		Symbol(),
		new Number(0x3b),
		new Number(0x3f),
		hostile,
		new Proxy({}, { get: trap, getPrototypeOf: trap }),
	])
		rejects(() =>
			decodeFidoHidResponseControl(
				channel,
				command as number,
				new Uint8Array([1]),
			),
		);
	expect(hooks).toBe(0);
});

it.each(commands)(
	"rejects malformed and reserved channels for %i",
	(command) => {
		for (const invalid of [
			...[0, 1, 2, 3, 5, 8, 64].map((length) => new Uint8Array(length).fill(1)),
			new Uint8Array(4),
			new Uint8Array([255, 255, 255, 255]),
		])
			rejects(() =>
				decodeFidoHidResponseControl(invalid, command, new Uint8Array([1])),
			);
	},
);

it.each(commands)("requires exactly one payload byte for %i", (command) => {
	for (const length of [0, 2, 3, 4, 7, 8, 64, 7609])
		rejects(() =>
			decodeFidoHidResponseControl(
				channel,
				command,
				new Uint8Array(length).fill(1),
			),
		);
});

it.each(commands)("rejects wrong byte brands for %i", (command) => {
	for (const value of [null, undefined, true, 1, "bytes", 1n, Symbol()])
		rejectsBytes(command, () => value);
	const variants: ((length: number) => unknown)[] = [
		(length) => Array(length).fill(1),
		(length) => new ArrayBuffer(length),
		(length) => new DataView(new ArrayBuffer(length)),
		(length) => new Int8Array(length).fill(1),
		(length) => new Uint8ClampedArray(length).fill(1),
		(length) => new Uint16Array(length).fill(1),
		(length) => new Int16Array(length).fill(1),
		(length) => new Uint32Array(length).fill(1),
		(length) => new Int32Array(length).fill(1),
		(length) => new Float32Array(length).fill(1),
		(length) => new Float64Array(length).fill(1),
		(length) => new BigInt64Array(length).fill(1n),
		(length) => new BigUint64Array(length).fill(1n),
		(length) => ({
			0: 1,
			length,
			byteLength: length,
			byteOffset: 0,
			buffer: new ArrayBuffer(length),
			[Symbol.toStringTag]: "Uint8Array",
		}),
		() => Object.create(Uint8Array.prototype),
		(length) => {
			const spoof = new Int8Array(length).fill(1);
			Object.defineProperty(spoof, Symbol.toStringTag, {
				value: "Uint8Array",
			});
			return spoof;
		},
	];
	for (const variant of variants) rejectsBytes(command, variant);
});

it.each(commands)("rejects shared and detached storage for %i", (command) => {
	const variants: ((length: number) => Uint8Array)[] = [
		(length) => new Uint8Array(new SharedArrayBuffer(length)).fill(1),
		(length) =>
			runInNewContext("new Uint8Array(new SharedArrayBuffer(length)).fill(1)", {
				length,
			}),
		(length) => {
			const buffer = new SharedArrayBuffer(length);
			Object.defineProperty(buffer, Symbol.toStringTag, {
				value: "ArrayBuffer",
			});
			return new Uint8Array(buffer).fill(1);
		},
		(length) => {
			const bytes = new Uint8Array(length).fill(1);
			structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
			return bytes;
		},
	];
	for (const variant of variants) rejectsBytes(command, variant);
});

it.each(commands)("rejects proxies and lookalikes for %i", (command) => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private byte getter data");
	};
	const variants: ((length: number) => unknown)[] = [
		(length) => new Proxy(new Uint8Array(length).fill(1), {}),
		(length) =>
			new Proxy(new Uint8Array(length).fill(1), {
				get: trap,
				getPrototypeOf: trap,
			}),
		(length) => {
			const revoked = Proxy.revocable(new Uint8Array(length).fill(1), {});
			revoked.revoke();
			return revoked.proxy;
		},
		() => {
			const lookalike = Object.create(null);
			for (const key of [
				"buffer",
				"byteOffset",
				"byteLength",
				"length",
				Symbol.toStringTag,
			])
				Object.defineProperty(lookalike, key, { get: trap });
			return lookalike;
		},
	];
	for (const variant of variants) rejectsBytes(command, variant);
	expect(hooks).toBe(0);
});

it.each(commands)("accepts genuine views without hooks for %i", (command) => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private genuine view hook");
	};
	class HostileBytes extends Uint8Array {
		static get [Symbol.species](): Uint8ArrayConstructor {
			return trap();
		}
	}
	class OrdinaryBuffer extends ArrayBuffer {}
	const variants: ((input: Uint8Array) => Uint8Array)[] = [
		(input) => new Uint8Array(input),
		(input) => new HostileBytes(input),
		(input) => {
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
		},
		(input) => new Uint8Array([99, ...input, 88]).subarray(1, input.length + 1),
		(input) => Buffer.from([99, ...input, 88]).subarray(1, input.length + 1),
		(input) =>
			runInNewContext(
				"new Uint8Array(new Uint8Array(bytes).buffer, 1, bytes.length - 2)",
				{ bytes: [99, ...input, 88] },
			),
		(input) => {
			const buffer = new OrdinaryBuffer(input.length);
			Object.defineProperty(buffer, Symbol.toStringTag, {
				value: "SharedArrayBuffer",
			});
			const view = new Uint8Array(buffer);
			view.set(input);
			return view;
		},
	];
	for (const variant of variants) {
		const result = decodeFidoHidResponseControl(
			variant(channel),
			command,
			variant(new Uint8Array([1])),
		);
		expect(result).toEqual({
			kind: command === 0x3b ? "keepalive" : "error",
			channel,
			code: 1,
			[command === 0x3b ? "status" : "error"]:
				command === 0x3b ? "STATUS_PROCESSING" : "ERR_INVALID_CMD",
		});
		expect(Object.getPrototypeOf(result.channel)).toBe(Uint8Array.prototype);
	}
	expect(hooks).toBe(0);
});

it.each(commands)(
	"isolates owned copies and offset storage for %i",
	(command) => {
		const storage = new Uint8Array([99, 1, 2, 3, 4, 88, 1, 77]);
		const before = storage.slice();
		const inputChannel = new Uint8Array(storage.buffer, 1, 4);
		const payload = new Uint8Array(storage.buffer, 6, 1);
		const first = decodeFidoHidResponseControl(inputChannel, command, payload);
		const second = decodeFidoHidResponseControl(inputChannel, command, payload);
		const expected = {
			kind: command === 0x3b ? "keepalive" : "error",
			channel,
			code: 1,
			[command === 0x3b ? "status" : "error"]:
				command === 0x3b ? "STATUS_PROCESSING" : "ERR_INVALID_CMD",
		};
		expect(first).toEqual(expected);
		expect(second).toEqual(expected);
		expect(storage).toEqual(before);
		expect(first.channel).not.toBe(inputChannel);
		expect(first.channel.buffer).not.toBe(storage.buffer);
		expect(first.channel.buffer).not.toBe(second.channel.buffer);
		expect(first.channel.byteOffset).toBe(0);
		expect(first.channel.buffer.byteLength).toBe(4);
		first.channel.fill(0xee);
		expect(storage).toEqual(before);
		expect(second).toEqual(expected);
		storage.fill(0);
		expect(second).toEqual(expected);
		expect(first).toEqual({
			...expected,
			channel: new Uint8Array(4).fill(0xee),
		});
	},
);

it.each(commands)(
	"makes no CID ownership or lifecycle claims for %i",
	(command) => {
		for (const bytes of [
			[0, 0, 0, 1],
			[1, 0, 0, 0],
			[255, 255, 255, 254],
		]) {
			const differentChannel = new Uint8Array(bytes);
			const result = decodeFidoHidResponseControl(
				differentChannel,
				command,
				new Uint8Array([2]),
			);
			expect(result.channel).toEqual(differentChannel);
			expect(result.channel).not.toEqual(channel);
			expect(Object.keys(result).sort()).toEqual(
				[
					"kind",
					"channel",
					"code",
					command === 0x3b ? "status" : "error",
				].sort(),
			);
			for (const field of [
				"terminal",
				"cancelled",
				"retryable",
				"consent",
				"owned",
				"userPresence",
			])
				expect(result).not.toHaveProperty(field);
		}
	},
);

it("does not decode CANCEL or the original CBOR cancellation response", () => {
	rejects(() => decodeFidoHidResponseControl(channel, 0x11, new Uint8Array()));
	rejects(() =>
		decodeFidoHidResponseControl(channel, 0x10, new Uint8Array([1])),
	);
});

it.each([
	{ reportBytes: 7, packetCount: 2 },
	{ reportBytes: 8, packetCount: 1 },
	{ reportBytes: 64, packetCount: 1 },
])("assembles successive controls at $reportBytes bytes", (configuration) => {
	const { reportBytes, packetCount } = configuration;
	const fixtures = [
		{ command: 0x3b, wireCommand: 0xbb, code: 1 },
		{ command: 0x3b, wireCommand: 0xbb, code: 2 },
		{ command: 0x3f, wireCommand: 0xbf, code: 6 },
	];
	const results: FidoHidResponseControl[] = [];
	for (const fixture of fixtures) {
		const payload = new Uint8Array([fixture.code]);
		const packets = encodeFidoHidMessage(
			channel,
			fixture.command,
			payload,
			reportBytes,
		);
		expect(packets.length).toBeGreaterThan(0);
		expect(packets).toHaveLength(packetCount);
		expect(Array.from(packets[0].subarray(0, 7))).toEqual([
			1,
			2,
			3,
			4,
			fixture.wireCommand,
			0,
			1,
		]);
		if (reportBytes === 7) packets[1].fill(0xa5, 6);
		else packets[0].fill(0xa5, 8);
		const assembler = new FidoHidMessageAssembler(channel, reportBytes);
		let assembled: FidoHidMessage | undefined;
		let completed = 0;
		for (let index = 0; index < packets.length; index++) {
			expect(packets[index]).toHaveLength(reportBytes);
			const message = assembler.accept(packets[index]);
			if (index < packets.length - 1) expect(message).toBeUndefined();
			else {
				expect(message).toEqual({
					channel,
					command: fixture.command,
					payload,
				});
				assembled = message;
				completed++;
			}
		}
		expect(completed).toBe(1);
		expect(assembled).toBeDefined();
		if (!assembled) throw new Error("Expected one assembled control message");
		expect(assembled.payload).toHaveLength(1);
		results.push(
			decodeFidoHidResponseControl(
				assembled.channel,
				assembled.command,
				assembled.payload,
			),
		);
	}
	expect(results).toEqual([
		{ kind: "keepalive", channel, code: 1, status: "STATUS_PROCESSING" },
		{ kind: "keepalive", channel, code: 2, status: "STATUS_UPNEEDED" },
		{ kind: "error", channel, code: 6, error: "ERR_CHANNEL_BUSY" },
	]);
});
