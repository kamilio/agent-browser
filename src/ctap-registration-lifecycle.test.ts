import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as cbor from "./ctap-cbor.js";
import * as requests from "./ctap-make-credential-request.js";
import * as responses from "./ctap-make-credential-response.js";
import * as registrationData from "./ctap-registration-authenticator-data.js";
import { makeCtapCredential } from "./ctap-registration-transaction.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import * as packetCodec from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const rpHash = new Uint8Array([
	0xca, 0x97, 0x81, 0x12, 0xca, 0x1b, 0xbd, 0xca, 0xfa, 0xc2, 0x31, 0xb3, 0x9a,
	0x23, 0xdc, 0x4d, 0xa7, 0x86, 0xef, 0xf8, 0x14, 0x7c, 0x4e, 0x72, 0xb9, 0x80,
	0x77, 0x85, 0xaf, 0xee, 0x48, 0xbb,
]);
const privateText = "SYNTHETIC_PRIVATE_REGISTRATION";
const connections: FidoHidCborConnection[] = [];
const cleanup: Array<() => void> = [];
type Outcome<Value> = { value: Value } | { error: unknown };
type RegistrationResult = Awaited<ReturnType<typeof makeCtapCredential>>;
type Allocation = { buffer: Uint8Array; before: Uint8Array };
type Stop = "timeout" | "abort";
const hashInputs: Allocation[] = [];
const hashOutputs: Allocation[] = [];

function remember(buffer: Uint8Array): Allocation {
	return { buffer, before: buffer.slice() };
}

function deferred<Value>(fallback: Value) {
	let resolve: (value: Value) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	void promise.catch(() => undefined);
	cleanup.push(() => resolve(fallback));
	return { promise, resolve, reject };
}

function observe<Value>(operation: Promise<Value>) {
	let outcome: Outcome<Value> | undefined;
	const promise = operation.then(
		(value) => {
			outcome = { value };
			return outcome;
		},
		(error: unknown) => {
			outcome = { error };
			return outcome;
		},
	);
	return {
		promise,
		get outcome() {
			return outcome;
		},
	};
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

async function flushMicrotasks() {
	for (let step = 0; step < 128; step++) await Promise.resolve();
}

function clockOnlyDeadline() {
	const start = performance.now();
	let now = start;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const timerCallback = vi.fn();
	const timer = setTimeout(timerCallback, 20);
	cleanup.push(() => clearTimeout(timer));
	return {
		timerCallback,
		expire() {
			now = start + 21;
		},
	};
}

async function exceptionalTimeout(
	operation: ReturnType<typeof observe<RegistrationResult>>,
) {
	await flushMicrotasks();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	const error = outcome && "error" in outcome ? outcome.error : undefined;
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected a microtask-settled deadline failure.");
	expect(error.code).toBe("timeout");
	expect(error.message).toBe("CTAP registration transaction failed.");
	expect(error.cause).toBeUndefined();
	expect(error.stack).not.toContain(privateText);
	expect(JSON.stringify(error)).not.toContain(privateText);
	return error;
}

async function succeeds<Value>(operation: ReturnType<typeof observe<Value>>) {
	await flush();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("value");
	if (!outcome || !("value" in outcome))
		throw new Error("Expected completed synthetic operation.");
	return outcome.value;
}

async function fails<Value>(
	operation: ReturnType<typeof observe<Value>>,
	code: ErrorCode,
) {
	await flush();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	const error = outcome && "error" in outcome ? outcome.error : undefined;
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected sanitized synthetic transaction failure.");
	expect(error.code).toBe(code);
	expect(error.message).toBe("CTAP registration transaction failed.");
	expect(error.cause).toBeUndefined();
	expect(error.stack).not.toContain(privateText);
	expect(JSON.stringify(error)).not.toContain(privateText);
	return error;
}

function header(major: number, length: number): number[] {
	if (length < 24) return [major | length];
	if (length < 256) return [major | 24, length];
	return [major | 25, length >>> 8, length & 255];
}

function bytes(value: readonly number[] | Uint8Array): number[] {
	return [...header(0x40, value.length), ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...header(0x60, encoded.length), ...encoded];
}

function map(entries: number[][]): number[] {
	return [...header(0xa0, entries.length), ...entries.flat()];
}

function reply(hash = rpHash): Uint8Array {
	const key = map([
		[1, 2],
		[3, 0x26],
		[0x20, 1],
		[0x21, ...bytes(new Uint8Array(32).fill(0x31))],
		[0x22, ...bytes(new Uint8Array(32).fill(0x52))],
	]);
	const authData = new Uint8Array([
		...hash,
		0x41,
		0x12,
		0x34,
		0x56,
		0x78,
		...new Uint8Array(16).fill(0x83),
		0,
		3,
		0x91,
		0x92,
		0x93,
		...key,
	]);
	return new Uint8Array([
		0,
		...map([
			[1, ...text("packed")],
			[2, ...bytes(authData)],
			[
				3,
				...map([
					[...text("sig"), ...bytes([0x30, 0x7f])],
					[...text("x5c"), 0x82, ...bytes([0x81, 0x82]), 0xf9, 0x3e, 0],
				]),
			],
		]),
	]);
}

function request(): requests.CtapMakeCredentialRequest {
	return {
		clientDataHash: new Uint8Array(32).fill(0x51),
		rp: { id: "a" },
		user: { id: new Uint8Array([0xa1, 0xa2]) },
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		excludeList: [{ type: "public-key", id: new Uint8Array([0xe1, 0xe2]) }],
	};
}

function packets(payload: Uint8Array, command = 0x10) {
	return packetCodec.encodeFidoHidMessage(channel, command, payload, 64);
}

class MemoryTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	readonly supplied = new WeakSet<Uint8Array>();
	readonly writes: Allocation[] = [];
	readonly pendingReads: ReturnType<typeof deferred<Uint8Array>>[] = [];
	readCalls = 0;
	closeCalls = 0;
	onWrite?: (report: Uint8Array) => Promise<number>;
	onClose?: () => Promise<void>;

	write(report: Uint8Array): Promise<number> {
		this.writes.push(remember(report));
		this.reports.push(report.slice());
		return this.onWrite?.(report) ?? Promise.resolve(report.length);
	}

	read(): Promise<Uint8Array> {
		this.readCalls++;
		const report = this.incoming.shift();
		if (report) {
			this.supplied.add(report);
			return Promise.resolve(report);
		}
		const pending = deferred(packets(new Uint8Array([0]))[0]);
		this.pendingReads.push(pending);
		return pending.promise;
	}

	close(): Promise<void> {
		this.closeCalls++;
		return this.onClose?.() ?? Promise.resolve();
	}

	deliver(payload: Uint8Array, command = 0x10) {
		this.incoming.push(...packets(payload, command));
		while (this.pendingReads.length && this.incoming.length) {
			const pending = this.pendingReads.shift();
			const report = this.incoming.shift();
			if (pending && report) {
				this.supplied.add(report);
				pending.resolve(report);
			}
		}
	}
}

function create(payload?: Uint8Array, command = 0x10) {
	const transport = new MemoryTransport();
	if (payload) transport.deliver(payload, command);
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	return { connection, transport };
}

function decodedBuffers(value: cbor.CtapCborValue): Uint8Array[] {
	if (value.kind === "bytes") return [value.value];
	if (value.kind === "float") return [value.encoding];
	if (value.kind === "array") return value.items.flatMap(decodedBuffers);
	if (value.kind === "map")
		return value.entries.flatMap(([key, entry]) => [
			...decodedBuffers(key),
			...decodedBuffers(entry),
		]);
	return [];
}

function credentialBuffers(credential: responses.CtapCredentialResponse) {
	const parsed = credential.attestedCredentialData;
	const key = parsed.credentialPublicKey;
	return [
		credential.authenticatorData,
		...decodedBuffers(credential.attestationStatement),
		parsed.rpIdHash,
		parsed.aaguid,
		parsed.credentialId,
		parsed.credentialPublicKeyBytes,
		...(key.kind === "rsa"
			? [key.modulus, key.exponent]
			: [
					key.x,
					...(key.kind === "ec2" && typeof key.y !== "boolean" ? [key.y] : []),
				]),
		...(parsed.extensions ? decodedBuffers(parsed.extensions) : []),
	];
}

function trace(
	transport: MemoryTransport,
	hooks: {
		assembled?: () => void;
		parsed?: (credential: responses.CtapCredentialResponse) => void;
	} = {},
) {
	const encoded: Allocation[] = [];
	const snapshots: Allocation[] = [];
	const payloads: Allocation[] = [];
	const parsed: Allocation[] = [];
	const packetRequests: Allocation[] = [];
	const encodeRequest = requests.encodeCtapMakeCredentialRequest;
	const encodePackets = packetCodec.encodeFidoHidMessage;
	const decodeCbor = cbor.decodeCtapCbor;
	const decodeResponse = responses.decodeCtapMakeCredentialResponse;
	const accept = FidoHidMessageAssembler.prototype.accept;
	vi.spyOn(requests, "encodeCtapMakeCredentialRequest").mockImplementation(
		(...args) => {
			const result = encodeRequest(...args);
			encoded.push(remember(result));
			return result;
		},
	);
	vi.spyOn(packetCodec, "encodeFidoHidMessage").mockImplementation(
		(...args) => {
			const result = encodePackets(...args);
			if (args[1] === 0x10 && args[2][0] === 1)
				packetRequests.push(...result.map(remember));
			return result;
		},
	);
	vi.spyOn(cbor, "decodeCtapCbor").mockImplementation((input) => {
		const result = decodeCbor(input);
		snapshots.push(...decodedBuffers(result).map(remember));
		return result;
	});
	vi.spyOn(responses, "decodeCtapMakeCredentialResponse").mockImplementation(
		(input) => {
			const result = decodeResponse(input);
			if (result.kind === "credential") {
				parsed.push(...credentialBuffers(result.credential).map(remember));
				hooks.parsed?.(result.credential);
			}
			return result;
		},
	);
	vi.spyOn(FidoHidMessageAssembler.prototype, "accept").mockImplementation(
		function (this: FidoHidMessageAssembler, report) {
			const message = accept.call(this, report);
			if (message && transport.supplied.has(report)) {
				payloads.push(remember(message.payload));
				hooks.assembled?.();
			}
			return message;
		},
	);
	return { encoded, snapshots, payloads, parsed, packetRequests };
}

function wiped(allocations: readonly Allocation[]) {
	expect(allocations.length).toBeGreaterThan(0);
	for (const { buffer, before } of allocations) {
		expect(before.some((byte) => byte !== 0)).toBe(true);
		expect([...buffer]).toEqual([...new Uint8Array(before.length)]);
	}
}

function unchanged(allocations: readonly Allocation[]) {
	expect(allocations.length).toBeGreaterThan(0);
	for (const { buffer, before } of allocations) expect(buffer).toEqual(before);
}

function credential(result: RegistrationResult) {
	expect(result.kind).toBe("credential");
	if (result.kind !== "credential")
		throw new Error("Expected synthetic created credential.");
	return result.credential;
}

function stop(mode: Stop, controller: AbortController) {
	if (mode === "abort") controller.abort(new Error(privateText));
	else vi.advanceTimersByTime(20);
}

async function quarantined(
	connection: FidoHidCborConnection,
	transport: MemoryTransport,
) {
	await flush();
	expect(connection.state).toBe("closed");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.closeCalls).toBe(1);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	const competing = vi.fn(async () => undefined);
	const operation = observe(connection.withExclusiveExchange(competing));
	await flush();
	expect(operation.outcome).toMatchObject({ error: { code: "closed" } });
	expect(competing).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
}

function hashInput(input: BufferSource) {
	const view = ArrayBuffer.isView(input)
		? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
		: new Uint8Array(input);
	expect(view).toEqual(new Uint8Array([0x61]));
	hashInputs.push(remember(view));
}

function hashOutput() {
	const output = rpHash.slice();
	hashOutputs.push(remember(output));
	return output.buffer;
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, input) => {
		expect(typeof algorithm === "string" ? algorithm : algorithm.name).toBe(
			"SHA-256",
		);
		hashInput(input);
		return Promise.resolve(hashOutput());
	});
});

afterEach(async () => {
	try {
		const closures = connections.map((connection) =>
			observe(FidoHidCborConnection.prototype.close.call(connection)),
		);
		for (let index = 0; index < cleanup.length; index++) cleanup[index]();
		await flush();
		for (const closure of closures) expect(closure.outcome).toBeDefined();
	} finally {
		connections.length = 0;
		cleanup.length = 0;
		hashInputs.length = 0;
		hashOutputs.length = 0;
		vi.clearAllTimers();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

it("rejects an already-aborted signal without hashing or disturbing an active owner", async () => {
	const { connection, transport } = create();
	const owner = observe(connection.exchange(new Uint8Array([4])));
	await flush();
	const writes = transport.reports.length;
	const controller = new AbortController();
	controller.abort(new Error(privateText));
	await fails(
		observe(
			makeCtapCredential(connection, request(), {
				signal: controller.signal,
			}),
		),
		"aborted",
	);
	expect(crypto.subtle.digest).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.closeCalls).toBe(0);
	expect(owner.outcome).toBeUndefined();
	transport.deliver(new Uint8Array([0, 0x71]));
	await succeeds(owner);
	expect(connection.state).toBe("idle");
});

it.each(["abort", "timeout"] as const)(
	"observes %s during synchronous encoding before hashing or writing",
	async (mode) => {
		const { connection, transport } = create();
		const controller = new AbortController();
		const encode = requests.encodeCtapMakeCredentialRequest;
		const encoded: Allocation[] = [];
		vi.spyOn(requests, "encodeCtapMakeCredentialRequest").mockImplementation(
			(...args) => {
				const result = encode(...args);
				encoded.push(remember(result));
				stop(mode, controller);
				return result;
			},
		);
		await fails(
			observe(
				makeCtapCredential(connection, request(), {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
			mode === "abort" ? "aborted" : "timeout",
		);
		expect(crypto.subtle.digest).not.toHaveBeenCalled();
		expect(transport.reports).toHaveLength(0);
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
		wiped(encoded);
	},
);

it.each([
	{ mode: "abort", late: "resolve" },
	{ mode: "abort", late: "reject" },
	{ mode: "timeout", late: "resolve" },
	{ mode: "timeout", late: "reject" },
] as const)(
	"bounds pending hash by $mode and abandons its late $late",
	async ({ mode, late }) => {
		const { connection, transport } = create();
		const owned = trace(transport);
		const gate = deferred(new ArrayBuffer(32));
		vi.mocked(crypto.subtle.digest).mockImplementation((_algorithm, input) => {
			hashInput(input);
			return gate.promise;
		});
		const controller = new AbortController();
		const input = request();
		const source = [input.clientDataHash, input.user.id].map(remember);
		const operation = observe(
			makeCtapCredential(connection, input, {
				timeoutMs: 20,
				signal: controller.signal,
			}),
		);
		await flush();
		expect(operation.outcome).toBeUndefined();
		expect(transport.reports).toHaveLength(0);
		stop(mode, controller);
		const error = await fails(
			operation,
			mode === "abort" ? "aborted" : "timeout",
		);
		wiped(owned.encoded);
		wiped(owned.snapshots);
		wiped(hashInputs);
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
		const laterOwner = observe(connection.exchange(new Uint8Array([4])));
		await flush();
		const writes = transport.reports.length;
		if (late === "resolve") gate.resolve(hashOutput());
		else gate.reject(new Error(privateText));
		await flush();
		if (late === "resolve") wiped(hashOutputs);
		expect(operation.outcome).toEqual({ error });
		expect(transport.reports).toHaveLength(writes);
		expect(connection.state).toBe("active");
		expect(transport.closeCalls).toBe(0);
		expect(laterOwner.outcome).toBeUndefined();
		transport.deliver(new Uint8Array([0, 0x72]));
		expect(await succeeds(laterOwner)).toEqual({
			kind: "response",
			payload: new Uint8Array([0, 0x72]),
		});
		unchanged(source);
	},
);

it.each(["throw", "reject"])(
	"sanitizes hash %s and releases pre-wire allocations",
	async (mode) => {
		const { connection, transport } = create();
		const owned = trace(transport);
		vi.mocked(crypto.subtle.digest).mockImplementation((_algorithm, input) => {
			hashInput(input);
			if (mode === "throw") throw new Error(privateText);
			return Promise.reject(new Error(privateText));
		});
		await fails(
			observe(makeCtapCredential(connection, request())),
			"unsupported",
		);
		expect(transport.reports).toHaveLength(0);
		wiped(owned.encoded);
		wiped(owned.snapshots);
		wiped(hashInputs);
	},
);

it.each(["active", "reserved"])(
	"busy %s ownership survives failed acquisition and old lifecycle events",
	async (state) => {
		const { connection, transport } = create();
		const gate = deferred(undefined);
		const owner =
			state === "active"
				? observe(
						connection.exchange(new Uint8Array([4])).then(() => undefined),
					)
				: observe(connection.withExclusiveExchange(() => gate.promise));
		await flush();
		expect(connection.state).toBe(state);
		const writes = transport.reports.length;
		const owned = trace(transport);
		const controller = new AbortController();
		await fails(
			observe(
				makeCtapCredential(connection, request(), {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
			"not-actionable",
		);
		controller.abort(new Error(privateText));
		await vi.advanceTimersByTimeAsync(20);
		expect(connection.state).toBe(state);
		expect(transport.closeCalls).toBe(0);
		expect(transport.reports).toHaveLength(writes);
		expect(owner.outcome).toBeUndefined();
		wiped(owned.encoded);
		wiped(owned.snapshots);
		if (state === "active") transport.deliver(new Uint8Array([0]));
		else gate.resolve(undefined);
		await succeeds(owner);
	},
);

it("uses intrinsic abort state and listeners despite hostile own signal shadows", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	const shadow = vi.fn(() => {
		throw new Error(privateText);
	});
	for (const key of ["aborted", "addEventListener", "removeEventListener"])
		Object.defineProperty(controller.signal, key, { get: shadow });
	const operation = observe(
		makeCtapCredential(connection, request(), {
			signal: controller.signal,
		}),
	);
	await flush();
	expect(connection.state).toBe("active");
	controller.abort(new Error(privateText));
	await fails(operation, "aborted");
	expect(shadow).not.toHaveBeenCalled();
	transport.deliver(new Uint8Array([0]));
	await quarantined(connection, transport);
});

it.each([
	{ mode: "abort", phase: "write" },
	{ mode: "timeout", phase: "write" },
	{ mode: "abort", phase: "read" },
	{ mode: "timeout", phase: "read" },
] as const)(
	"bounds deferred $phase by $mode and prevents late I/O resurrection",
	async ({ mode, phase }) => {
		const { connection, transport } = create();
		const owned = trace(transport);
		const gate = deferred(64);
		if (phase === "write") transport.onWrite = () => gate.promise;
		const controller = new AbortController();
		const operation = observe(
			makeCtapCredential(connection, request(), {
				timeoutMs: 20,
				signal: controller.signal,
			}),
		);
		await flush();
		expect(operation.outcome).toBeUndefined();
		expect(connection.state).toBe("active");
		if (phase === "write") {
			expect(transport.writes).toHaveLength(1);
			expect(transport.readCalls).toBe(0);
		} else expect(transport.pendingReads).toHaveLength(1);
		stop(mode, controller);
		const error = await fails(
			operation,
			mode === "abort" ? "aborted" : "timeout",
		);
		const writes = transport.reports.length;
		const reads = transport.readCalls;
		if (phase === "write") gate.resolve(64);
		else transport.deliver(reply());
		await flush();
		expect(operation.outcome).toEqual({ error });
		expect(transport.reports).toHaveLength(writes);
		expect(transport.readCalls).toBe(reads);
		expect(owned.parsed).toHaveLength(0);
		wiped(owned.encoded);
		wiped(owned.snapshots);
		wiped(owned.packetRequests);
		wiped(transport.writes);
		wiped(hashInputs);
		wiped(hashOutputs);
		await quarantined(connection, transport);
	},
);

it("spends one deadline across hashing, a blocked write, and the final read", async () => {
	const { connection, transport } = create();
	const hashGate = deferred(new ArrayBuffer(32));
	const writeGate = deferred(64);
	vi.mocked(crypto.subtle.digest).mockImplementation((_algorithm, input) => {
		hashInput(input);
		return hashGate.promise;
	});
	transport.onWrite = () => writeGate.promise;
	const operation = observe(
		makeCtapCredential(connection, request(), { timeoutMs: 20 }),
	);
	await vi.advanceTimersByTimeAsync(8);
	hashGate.resolve(hashOutput());
	await flush();
	expect(transport.writes).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(7);
	writeGate.resolve(64);
	await flush();
	expect(transport.pendingReads).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(4);
	expect(operation.outcome).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1);
	await fails(operation, "timeout");
	transport.deliver(reply());
	await quarantined(connection, transport);
	wiped(hashInputs);
	wiped(hashOutputs);
	wiped(transport.writes);
});

it.each(["abort", "timeout"] as const)(
	"wipes actual assembled late response when %s wins delivery",
	async (mode) => {
		const { connection, transport } = create(reply());
		const controller = new AbortController();
		let stateAtStop = "";
		const owned = trace(transport, {
			assembled: () =>
				queueMicrotask(() => {
					stateAtStop = connection.state;
					stop(mode, controller);
				}),
		});
		await fails(
			observe(
				makeCtapCredential(connection, request(), {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
			mode === "abort" ? "aborted" : "timeout",
		);
		expect(stateAtStop).toBe("reserved");
		expect(owned.payloads).toHaveLength(1);
		wiped(owned.payloads);
		wiped(owned.encoded);
		wiped(owned.snapshots);
		wiped(hashOutputs);
		await quarantined(connection, transport);
	},
);

it.each(["abort", "timeout"] as const)(
	"checks %s again after real response parsing and wipes parsed allocations",
	async (mode) => {
		const { connection, transport } = create(reply());
		const controller = new AbortController();
		const owned = trace(transport, { parsed: () => stop(mode, controller) });
		await fails(
			observe(
				makeCtapCredential(connection, request(), {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
			mode === "abort" ? "aborted" : "timeout",
		);
		wiped(owned.parsed);
		wiped(owned.payloads);
		wiped(owned.snapshots);
		wiped(owned.encoded);
		await quarantined(connection, transport);
	},
);

it.each([
	{ mode: "abort", terminal: "ctap", command: 0x10, payload: 0x2e },
	{ mode: "timeout", terminal: "ctap", command: 0x10, payload: 0x2e },
	{ mode: "abort", terminal: "hid", command: 0x3f, payload: 0x06 },
	{ mode: "timeout", terminal: "hid", command: 0x3f, payload: 0x06 },
] as const)(
	"lets $mode beat a $terminal terminal at the actual delivery boundary",
	async ({ mode, command, payload }) => {
		const { connection, transport } = create(
			new Uint8Array([payload]),
			command,
		);
		const controller = new AbortController();
		const owned = trace(transport, {
			assembled: () => queueMicrotask(() => stop(mode, controller)),
		});
		await fails(
			observe(
				makeCtapCredential(connection, request(), {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
			mode === "abort" ? "aborted" : "timeout",
		);
		expect(owned.parsed).toHaveLength(0);
		wiped(owned.payloads);
		wiped(owned.encoded);
		await quarantined(connection, transport);
	},
);

it.each(["abort", "timeout"] as const)(
	"commits before handoff so old %s cannot close the next owner",
	async (mode) => {
		const { connection, transport } = create(reply());
		const controller = new AbortController();
		const handoff = deferred(undefined);
		const watched = observe(handoff.promise);
		let later: ReturnType<typeof observe<unknown>> | undefined;
		let outcomeAtRelease: Outcome<RegistrationResult> | undefined;
		let stateBeforeStop = "";
		let parserState = "";
		let ticks = 0;
		const watchRelease = () => {
			try {
				ticks++;
				if (connection.state !== "idle") {
					if (ticks >= 128)
						throw new Error("Synthetic handoff did not release.");
					queueMicrotask(watchRelease);
					return;
				}
				outcomeAtRelease = operation.outcome;
				later = observe(
					connection.exchange(new Uint8Array([4]), { timeoutMs: 1000 }),
				);
				stateBeforeStop = connection.state;
				stop(mode, controller);
				handoff.resolve(undefined);
			} catch (error) {
				handoff.reject(error);
			}
		};
		trace(transport, {
			parsed: () => {
				parserState = connection.state;
				queueMicrotask(watchRelease);
			},
		});
		const operation = observe(
			makeCtapCredential(connection, request(), {
				timeoutMs: 20,
				signal: controller.signal,
			}),
		);
		await succeeds(watched);
		expect(parserState).toBe("reserved");
		expect(outcomeAtRelease).toBeUndefined();
		expect(stateBeforeStop).toBe("active");
		expect(ticks).toBeLessThanOrEqual(128);
		const result = credential(await succeeds(operation));
		const returned = credentialBuffers(result).map(remember);
		if (!later) throw new Error("Expected a new synthetic owner.");
		expect(later.outcome).toBeUndefined();
		expect(transport.closeCalls).toBe(0);
		await vi.advanceTimersByTimeAsync(20);
		expect(connection.state).toBe("active");
		expect(later.outcome).toBeUndefined();
		transport.deliver(new Uint8Array([0, 0x7a]));
		expect(await succeeds(later)).toEqual({
			kind: "response",
			payload: new Uint8Array([0, 0x7a]),
		});
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
		unchanged(returned);
	},
);

it("keeps returned allocations private while wiping real temporary allocations", async () => {
	const wire = reply();
	const input = request();
	const sources = [
		wire,
		input.clientDataHash,
		input.user.id,
		...(input.excludeList?.map((entry) => entry.id) ?? []),
	].map(remember);
	const { connection, transport } = create(wire);
	const owned = trace(transport);
	const controller = new AbortController();
	const result = credential(
		await succeeds(
			observe(
				makeCtapCredential(connection, input, {
					timeoutMs: 20,
					signal: controller.signal,
				}),
			),
		),
	);
	const returned = credentialBuffers(result).map(remember);
	expect(returned.length).toBeGreaterThanOrEqual(10);
	expect(new Set(returned.map(({ buffer }) => buffer.buffer)).size).toBe(
		returned.length,
	);
	wiped(owned.encoded);
	wiped(owned.snapshots);
	wiped(owned.packetRequests);
	wiped(owned.payloads);
	wiped(transport.writes);
	wiped(hashInputs);
	wiped(hashOutputs);
	unchanged(sources);
	controller.abort(new Error(privateText));
	await vi.advanceTimersByTimeAsync(20);
	await succeeds(observe(connection.close()));
	unchanged(returned);
	for (let index = 0; index < returned.length; index++) {
		returned[index].buffer.fill(0);
		if (index + 1 < returned.length) unchanged(returned.slice(index + 1));
	}
	unchanged(sources);
});

it.each(["plain", "detached", "own-fill"])(
	"cleans all parsed rejection allocations with %s buffers",
	async (mode) => {
		const mismatchedHash = rpHash.slice();
		mismatchedHash[0] ^= 1;
		const wire = reply(mismatchedHash);
		const input = request();
		const source = [wire, input.clientDataHash, input.user.id].map(remember);
		const { connection, transport } = create(wire);
		const shadow = vi.fn(() => {
			throw new Error(privateText);
		});
		let detached: Uint8Array | undefined;
		let transferred: Uint8Array | undefined;
		const owned = trace(transport, {
			parsed: (parsed) => {
				if (mode === "detached") {
					detached = parsed.attestedCredentialData.aaguid;
					transferred = structuredClone(detached, {
						transfer: [detached.buffer],
					});
					cleanup.push(() => transferred?.fill(0));
				} else if (mode === "own-fill") {
					for (const buffer of credentialBuffers(parsed))
						Object.defineProperty(buffer, "fill", { value: shadow });
				}
			},
		});
		await fails(
			observe(makeCtapCredential(connection, input)),
			"policy-denied",
		);
		expect(shadow).not.toHaveBeenCalled();
		if (mode === "detached") {
			expect(detached?.byteLength).toBe(0);
			expect(transferred).toEqual(new Uint8Array(16).fill(0x83));
			transferred?.fill(0);
		}
		wiped(owned.parsed.filter(({ buffer }) => buffer !== detached));
		wiped(owned.payloads);
		wiped(owned.snapshots);
		wiped(owned.encoded);
		wiped(hashInputs);
		wiped(hashOutputs);
		unchanged(source);
		await quarantined(connection, transport);
	},
);

it("reports semantic failure and cleans allocations before deferred transport close completes", async () => {
	const mismatchedHash = rpHash.slice();
	mismatchedHash[0] ^= 1;
	const { connection, transport } = create(reply(mismatchedHash));
	const owned = trace(transport);
	const gate = deferred(undefined);
	transport.onClose = () => gate.promise;
	await fails(
		observe(makeCtapCredential(connection, request())),
		"policy-denied",
	);
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	wiped(owned.parsed);
	wiped(owned.payloads);
	wiped(owned.encoded);
	wiped(owned.snapshots);
	const closing = observe(connection.close());
	await flush();
	expect(closing.outcome).toBeUndefined();
	gate.resolve(undefined);
	await succeeds(closing);
	await quarantined(connection, transport);
});

it.each(["success", "rejection"])(
	"ignores instance exchange, scope, and close overrides on %s",
	async (outcome) => {
		const hash = rpHash.slice();
		if (outcome === "rejection") hash[0] ^= 1;
		const { connection, transport } = create(reply(hash));
		const override = vi.fn(() => {
			throw new Error(privateText);
		});
		for (const key of ["exchange", "withExclusiveExchange", "close"])
			Object.defineProperty(connection, key, { value: override });
		const owned = trace(transport);
		const operation = observe(makeCtapCredential(connection, request()));
		if (outcome === "success") {
			credential(await succeeds(operation));
			expect(connection.state).toBe("idle");
			expect(transport.closeCalls).toBe(0);
		} else {
			await fails(operation, "policy-denied");
			expect(connection.state).toBe("closed");
			expect(transport.closeCalls).toBe(1);
			wiped(owned.parsed);
		}
		expect(override).not.toHaveBeenCalled();
		expect(owned.payloads).toHaveLength(1);
		wiped(owned.encoded);
		wiped(owned.payloads);
		wiped(transport.writes);
	},
);

it("exceptional absolute deadline overrides synchronous request-encoding failure without closing another owner", async () => {
	const clock = clockOnlyDeadline();
	const { connection, transport } = create();
	const owner = observe(connection.exchange(new Uint8Array([4])));
	await flushMicrotasks();
	expect(connection.state).toBe("active");
	expect(transport.pendingReads).toHaveLength(1);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	const input = request();
	const sources = [input.clientDataHash, input.user.id].map(remember);
	const copied: Allocation[] = [];
	const copyBytes = cbor.copyCtapBytes;
	vi.spyOn(cbor, "copyCtapBytes").mockImplementation((value) => {
		const result = copyBytes(value);
		copied.push(remember(result));
		clock.expire();
		return result;
	});
	let encodingError: unknown;
	const encode = requests.encodeCtapMakeCredentialRequest;
	const encoder = vi
		.spyOn(requests, "encodeCtapMakeCredentialRequest")
		.mockImplementation((...args) => {
			try {
				return encode(...args);
			} catch (error) {
				encodingError = error;
				throw error;
			}
		});
	const operation = observe(
		makeCtapCredential(connection, input, {
			timeoutMs: 20,
			maxMessageSize: 1n,
		}),
	);
	const error = await exceptionalTimeout(operation);
	expect(encoder).toHaveBeenCalledTimes(1);
	expect(encodingError).toBeInstanceOf(AgentBrowserError);
	expect(encodingError).toMatchObject({ code: "resource-limit" });
	expect(error).not.toBe(encodingError);
	expect(clock.timerCallback).not.toHaveBeenCalled();
	expect(crypto.subtle.digest).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
	expect(transport.closeCalls).toBe(0);
	expect(connection.state).toBe("active");
	expect(owner.outcome).toBeUndefined();
	wiped(copied);
	unchanged(sources);
	transport.deliver(new Uint8Array([0, 0x74]));
	await flushMicrotasks();
	expect(owner.outcome).toEqual({
		value: { kind: "response", payload: new Uint8Array([0, 0x74]) },
	});
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional absolute deadline overrides delayed digest rejection without closing another owner", async () => {
	const clock = clockOnlyDeadline();
	const { connection, transport } = create();
	const owner = observe(connection.exchange(new Uint8Array([4])));
	await flushMicrotasks();
	expect(connection.state).toBe("active");
	expect(transport.pendingReads).toHaveLength(1);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	const owned = trace(transport);
	const gate = deferred(new ArrayBuffer(32));
	vi.mocked(crypto.subtle.digest).mockImplementation((_algorithm, input) => {
		hashInput(input);
		return gate.promise;
	});
	const input = request();
	const sources = [input.clientDataHash, input.user.id].map(remember);
	const operation = observe(
		makeCtapCredential(connection, input, {
			timeoutMs: 20,
		}),
	);
	await flushMicrotasks();
	expect(crypto.subtle.digest).toHaveBeenCalledTimes(1);
	expect(operation.outcome).toBeUndefined();
	const digestError = new AgentBrowserError("network-error", privateText);
	clock.expire();
	gate.reject(digestError);
	expect(await exceptionalTimeout(operation)).not.toBe(digestError);
	expect(clock.timerCallback).not.toHaveBeenCalled();
	expect(connection.state).toBe("active");
	expect(owner.outcome).toBeUndefined();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
	expect(transport.closeCalls).toBe(0);
	expect(owned.packetRequests).toHaveLength(0);
	wiped(owned.encoded);
	wiped(owned.snapshots);
	wiped(hashInputs);
	unchanged(sources);
	transport.deliver(new Uint8Array([0, 0x75]));
	await flushMicrotasks();
	expect(owner.outcome).toEqual({
		value: { kind: "response", payload: new Uint8Array([0, 0x75]) },
	});
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional absolute deadline overrides owned write rejection and quarantines the real connection", async () => {
	const clock = clockOnlyDeadline();
	const { connection, transport } = create();
	const owned = trace(transport);
	const gate = deferred(64);
	transport.onWrite = () => gate.promise;
	const input = request();
	const sources = [input.clientDataHash, input.user.id].map(remember);
	const operation = observe(
		makeCtapCredential(connection, input, {
			timeoutMs: 20,
		}),
	);
	await flushMicrotasks();
	expect(operation.outcome).toBeUndefined();
	expect(connection.state).toBe("active");
	expect(transport.writes).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	const writeError = new AgentBrowserError("network-error", privateText);
	clock.expire();
	gate.reject(writeError);
	expect(await exceptionalTimeout(operation)).not.toBe(writeError);
	expect(clock.timerCallback).not.toHaveBeenCalled();
	expect(connection.state).toBe("closed");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.closeCalls).toBe(1);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	wiped(owned.encoded);
	wiped(owned.snapshots);
	wiped(owned.packetRequests);
	wiped(transport.writes);
	wiped(hashInputs);
	wiped(hashOutputs);
	unchanged(sources);
	const later = observe(connection.exchange(new Uint8Array([4])));
	await flushMicrotasks();
	expect(later.outcome).toMatchObject({ error: { code: "closed" } });
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(1);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional absolute deadline overrides response-parser throw after actual parse and cleans owned data", async () => {
	const clock = clockOnlyDeadline();
	const wire = new Uint8Array([...reply(), 4, 0xf5]);
	wire[1] = 0xa4;
	const { connection, transport } = create(wire);
	const owned = trace(transport);
	const attested: Allocation[] = [];
	const decodeData = registrationData.decodeCtapRegistrationAuthenticatorData;
	const dataParser = vi
		.spyOn(registrationData, "decodeCtapRegistrationAuthenticatorData")
		.mockImplementation((input) => {
			const result = decodeData(input);
			const key = result.credentialPublicKey;
			if (key.kind !== "ec2" || typeof key.y === "boolean")
				throw new Error("Expected the actual synthetic EC2 registration key.");
			attested.push(
				remember(input),
				...[
					result.rpIdHash,
					result.aaguid,
					result.credentialId,
					result.credentialPublicKeyBytes,
					key.x,
					key.y,
				].map(remember),
			);
			clock.expire();
			return result;
		});
	const decodeResponse = vi
		.mocked(responses.decodeCtapMakeCredentialResponse)
		.getMockImplementation();
	if (!decodeResponse)
		throw new Error(
			"Expected the actual response parser call-through observer.",
		);
	let parserError: unknown;
	vi.mocked(responses.decodeCtapMakeCredentialResponse).mockImplementation(
		(input) => {
			try {
				return decodeResponse(input);
			} catch (error) {
				parserError = error;
				throw error;
			}
		},
	);
	const input = request();
	const sources = [wire, input.clientDataHash, input.user.id].map(remember);
	const operation = observe(
		makeCtapCredential(connection, input, {
			timeoutMs: 20,
		}),
	);
	const error = await exceptionalTimeout(operation);
	expect(dataParser).toHaveBeenCalledTimes(1);
	expect(responses.decodeCtapMakeCredentialResponse).toHaveBeenCalledTimes(1);
	expect(parserError).toBeInstanceOf(AgentBrowserError);
	expect(parserError).toMatchObject({ code: "unsupported" });
	expect(error).not.toBe(parserError);
	expect(clock.timerCallback).not.toHaveBeenCalled();
	expect(connection.state).toBe("closed");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.closeCalls).toBe(1);
	expect(owned.payloads).toHaveLength(1);
	expect(owned.parsed).toHaveLength(0);
	wiped(attested);
	wiped(owned.payloads);
	wiped(owned.encoded);
	wiped(owned.snapshots);
	wiped(owned.packetRequests);
	wiped(transport.writes);
	wiped(hashInputs);
	wiped(hashOutputs);
	unchanged(sources);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	const later = observe(connection.exchange(new Uint8Array([4])));
	await flushMicrotasks();
	expect(later.outcome).toMatchObject({ error: { code: "closed" } });
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
	expect(transport.closeCalls).toBe(1);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});
