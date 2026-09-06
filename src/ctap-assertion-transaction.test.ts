import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type CtapAssertionCandidate,
	type CtapAssertionTransactionOptions,
	getCtapAssertion,
} from "./ctap-assertion-transaction.js";
import * as cbor from "./ctap-cbor.js";
import type {
	CtapGetAssertionCredential,
	CtapGetAssertionRequest,
} from "./ctap-get-assertion-request.js";
import * as responses from "./ctap-get-assertion-response.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import * as packetCodec from "./fido-hid-packets.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const rpHash = Uint8Array.from([
	0xca, 0x97, 0x81, 0x12, 0xca, 0x1b, 0xbd, 0xca, 0xfa, 0xc2, 0x31, 0xb3, 0x9a,
	0x23, 0xdc, 0x4d, 0xa7, 0x86, 0xef, 0xf8, 0x14, 0x7c, 0x4e, 0x72, 0xb9, 0x80,
	0x77, 0x85, 0xaf, 0xee, 0x48, 0xbb,
]);
const privateText = "SYNTHETIC_PRIVATE_ASSERTION";
const errorCodes: ErrorCode[] = [
	"invalid-input",
	"stale-reference",
	"not-found",
	"not-actionable",
	"policy-denied",
	"resource-limit",
	"unsupported",
	"network-error",
	"timeout",
	"aborted",
	"closed",
];
type Outcome<Value> = { value: Value } | { error: unknown };
type AssertionResult = Awaited<ReturnType<typeof getCtapAssertion>>;

const connections: FidoHidCborConnection[] = [];
const transports = new WeakMap<FidoHidCborConnection, MemoryTransport>();
const cleanup: Array<() => void> = [];

function deferred<Value>(cleanupValue: Value) {
	const callbacks: {
		resolve?: (value: Value) => void;
		reject?: (error: unknown) => void;
	} = {};
	const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
		callbacks.resolve = resolvePromise;
		callbacks.reject = rejectPromise;
	});
	void promise.catch(() => undefined);
	const { resolve, reject } = callbacks;
	if (!resolve || !reject)
		throw new Error("Expected synchronous synthetic promise initialization.");
	const pending = { promise, resolve, reject };
	cleanup.push(() => pending.resolve(cleanupValue));
	return pending;
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

async function succeeds<Value>(observed: ReturnType<typeof observe<Value>>) {
	await flush();
	const outcome = observed.outcome;
	expect(outcome).toHaveProperty("value");
	if (!outcome || !("value" in outcome))
		throw new Error("Expected a completed synthetic transaction.");
	return outcome.value;
}

async function fails<Value>(
	observed: ReturnType<typeof observe<Value>>,
	code?: ErrorCode,
) {
	await flush();
	const outcome = observed.outcome;
	expect(outcome).toHaveProperty("error");
	const error = outcome && "error" in outcome ? outcome.error : undefined;
	expect(error).toBeInstanceOf(AgentBrowserError);
	const safe = error as AgentBrowserError;
	expect(errorCodes).toContain(safe.code);
	if (code !== undefined) expect(safe.code).toBe(code);
	expect(safe.message.length).toBeGreaterThan(0);
	expect(safe.message).not.toContain(privateText);
	expect(safe.stack).not.toContain(privateText);
	expect(safe.cause).toBeUndefined();
	expect(JSON.stringify(safe)).not.toContain(privateText);
	return safe;
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

function map(entries: readonly (readonly number[])[]): number[] {
	return [...header(0xa0, entries.length), ...entries.flat()];
}

function unsigned(value: bigint): number[] {
	if (value < 24n) return [Number(value)];
	if (value < 256n) return [0x18, Number(value)];
	if (value < 65536n) return [0x19, Number(value >> 8n), Number(value & 255n)];
	const length = value < 4294967296n ? 4 : 8;
	return [
		length === 4 ? 0x1a : 0x1b,
		...Array.from({ length }, (_value, index) =>
			Number((value >> BigInt((length - index - 1) * 8)) & 255n),
		),
	];
}

interface ReplyOptions {
	credentialId?: Uint8Array | null;
	userId?: Uint8Array | null;
	flags?: number;
	hash?: Uint8Array;
	counter?: number;
	tail?: Uint8Array;
	signature?: Uint8Array;
	count?: bigint;
	name?: string;
	displayName?: string;
	icon?: string;
}

function authData(options: ReplyOptions = {}) {
	const tail = options.tail ?? new Uint8Array();
	const output = new Uint8Array(37 + tail.length);
	output.set(options.hash ?? rpHash);
	output[32] = options.flags ?? 1;
	new DataView(output.buffer).setUint32(33, options.counter ?? 0x12345678);
	output.set(tail, 37);
	return output;
}

function reply(options: ReplyOptions = {}) {
	const entries: number[][] = [];
	const credentialId =
		options.credentialId === undefined
			? new Uint8Array([7, 8])
			: options.credentialId;
	if (credentialId !== null)
		entries.push([
			1,
			...map([
				[...text("id"), ...bytes(credentialId)],
				[...text("type"), ...text("public-key")],
			]),
		]);
	entries.push(
		[2, ...bytes(authData(options))],
		[3, ...bytes(options.signature ?? new Uint8Array([0x30, 1, 0x7f]))],
	);
	const userId =
		options.userId === undefined
			? new Uint8Array([0x91, 0x92])
			: options.userId;
	if (userId !== null) {
		const user = [[...text("id"), ...bytes(userId)]];
		if (options.icon !== undefined)
			user.push([...text("icon"), ...text(options.icon)]);
		if (options.name !== undefined)
			user.push([...text("name"), ...text(options.name)]);
		if (options.displayName !== undefined)
			user.push([...text("displayName"), ...text(options.displayName)]);
		entries.push([4, ...map(user)]);
	}
	if (options.count !== undefined)
		entries.push([5, ...unsigned(options.count)]);
	return new Uint8Array([0, ...map(entries)]);
}

function request(allowList = true): CtapGetAssertionRequest {
	return {
		rpId: "a",
		clientDataHash: Uint8Array.from({ length: 32 }, (_value, index) => index),
		...(allowList
			? {
					allowList: [
						{ type: "public-key" as const, id: new Uint8Array([7, 8]) },
					],
				}
			: {}),
	};
}

function expectedRequest(allowList = true, userVerification = false) {
	return new Uint8Array([
		0x02,
		allowList ? 0xa4 : 0xa3,
		0x01,
		0x61,
		0x61,
		0x02,
		0x58,
		0x20,
		...Array.from({ length: 32 }, (_value, index) => index),
		...(allowList
			? [
					0x03, 0x81, 0xa2, 0x62, 0x69, 0x64, 0x42, 0x07, 0x08, 0x64, 0x74,
					0x79, 0x70, 0x65, 0x6a, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d,
					0x6b, 0x65, 0x79,
				]
			: []),
		0x05,
		0xa2,
		0x62,
		0x75,
		0x70,
		0xf5,
		0x62,
		0x75,
		0x76,
		userVerification ? 0xf5 : 0xf4,
	]);
}

function packets(payload: Uint8Array, command = 0x10) {
	return encodeFidoHidMessage(channel, command, payload, 64);
}

class MemoryTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	readonly supplied = new WeakSet<Uint8Array>();
	readonly pendingReads: ReturnType<typeof deferred<Uint8Array>>[] = [];
	readCalls = 0;
	closeCalls = 0;
	onClose?: () => Promise<void>;
	onWrite?: (report: Uint8Array) => Promise<number>;

	write(report: Uint8Array): Promise<number> {
		const owned = report.slice();
		this.reports.push(owned);
		return this.onWrite?.(owned) ?? Promise.resolve(owned.length);
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

function create(...payloads: Uint8Array[]) {
	const transport = new MemoryTransport();
	for (const payload of payloads) transport.deliver(payload);
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	transports.set(connection, transport);
	return { connection, transport };
}

function messages(transport: MemoryTransport) {
	const output: Array<{ command: number; payload: Uint8Array }> = [];
	let assembler = new FidoHidMessageAssembler(channel, 64);
	try {
		for (const report of transport.reports) {
			const message = assembler.accept(report);
			if (message) {
				output.push({ command: message.command, payload: message.payload });
				assembler = new FidoHidMessageAssembler(channel, 64);
			}
		}
	} finally {
		assembler.close();
	}
	return output;
}

function commandBytes(transport: MemoryTransport) {
	return messages(transport)
		.filter((message) => message.command === 0x10)
		.map((message) => [...message.payload]);
}

function trace(connection: FidoHidCborConnection) {
	const captured: { requests: Uint8Array[]; raw: Uint8Array[] } = {
		requests: [],
		raw: [],
	};
	const encode = packetCodec.encodeFidoHidMessage;
	vi.spyOn(packetCodec, "encodeFidoHidMessage").mockImplementation(
		(...args) => {
			if (args[1] === 0x10 && connection.state === "reserved")
				captured.requests.push(args[2]);
			return encode(...args);
		},
	);
	const accept = FidoHidMessageAssembler.prototype.accept;
	vi.spyOn(FidoHidMessageAssembler.prototype, "accept").mockImplementation(
		function (this: FidoHidMessageAssembler, report) {
			const message = accept.call(this, report);
			if (
				message?.command === 0x10 &&
				transports.get(connection)?.supplied.has(report)
			)
				captured.raw.push(message.payload);
			return message;
		},
	);
	return { captured };
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

function trackOwnership(
	onAssertion?: (assertion: responses.CtapAssertionResponse) => void,
) {
	const assertions: responses.CtapAssertionResponse[] = [];
	const snapshots: Uint8Array[] = [];
	const decodeResponse = responses.decodeCtapGetAssertionResponse;
	const decodeCbor = cbor.decodeCtapCbor;
	vi.spyOn(responses, "decodeCtapGetAssertionResponse").mockImplementation(
		(input) => {
			const result = decodeResponse(input);
			if (result.kind === "assertion") {
				assertions.push(result.assertion);
				onAssertion?.(result.assertion);
			}
			return result;
		},
	);
	vi.spyOn(cbor, "decodeCtapCbor").mockImplementation((input) => {
		const result = decodeCbor(input);
		snapshots.push(...decodedBuffers(result));
		return result;
	});
	return { assertions, snapshots };
}

function wiped(buffers: readonly Uint8Array[]) {
	expect(buffers.length).toBeGreaterThan(0);
	for (const buffer of buffers)
		expect(buffer).toEqual(new Uint8Array(buffer.length));
}

function assertionBuffers(
	decoded: responses.CtapAssertionResponse | undefined,
) {
	if (
		decoded === undefined ||
		decoded.credentialId === undefined ||
		decoded.user === undefined
	)
		throw new Error("Expected owned synthetic assertion credential and user.");
	return [
		decoded.authenticatorData,
		decoded.signature,
		decoded.credentialId,
		decoded.user.id,
	];
}

function assertion(result: AssertionResult) {
	expect(result.kind).toBe("assertion");
	if (result.kind !== "assertion")
		throw new Error("Expected synthetic assertion output.");
	return result.assertion;
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
	await fails(observe(connection.exchange(new Uint8Array([4]))), "closed");
	const competing = vi.fn(async () => undefined);
	await fails(observe(connection.withExclusiveExchange(competing)), "closed");
	expect(competing).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, input) => {
		expect(typeof algorithm === "string" ? algorithm : algorithm.name).toBe(
			"SHA-256",
		);
		const encoded = ArrayBuffer.isView(input)
			? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
			: new Uint8Array(input);
		expect(encoded).toEqual(new TextEncoder().encode("a"));
		return Promise.resolve(rpHash.slice().buffer);
	});
});

afterEach(async () => {
	const closures = connections.map((connection) => observe(connection.close()));
	try {
		for (const settle of cleanup) settle();
		await flush();
		for (const closure of closures) expect(closure.outcome).toBeDefined();
	} finally {
		connections.length = 0;
		cleanup.length = 0;
		vi.clearAllTimers();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

it.each(["explicit", "fallback", "discoverable"])(
	"collects a single %s assertion with exact wire bytes and owned output",
	async (mode) => {
		const allowList = mode !== "discoverable";
		const supplied = request(allowList);
		const hashBefore = supplied.clientDataHash.slice();
		const idBefore = supplied.allowList?.[0].id.slice();
		const options: ReplyOptions = {
			credentialId: mode === "fallback" ? null : new Uint8Array([7, 8]),
			userId: allowList ? null : new Uint8Array([0x91, 0x92]),
		};
		const incoming = reply(options);
		const incomingBefore = incoming.slice();
		const { connection, transport } = create(incoming);
		const { captured } = trace(connection);
		const owned = trackOwnership();
		const select = vi.fn(() => 0);
		const result = assertion(
			await succeeds(
				observe(getCtapAssertion(connection, supplied, { select })),
			),
		);
		expect(result).toEqual({
			credentialId: new Uint8Array([7, 8]),
			authenticatorData: authData(options),
			signature: new Uint8Array([0x30, 1, 0x7f]),
			userHandle: allowList ? null : new Uint8Array([0x91, 0x92]),
			userPresent: true,
			userVerified: false,
		});
		expect(result).not.toHaveProperty("userConsented");
		expect(select).not.toHaveBeenCalled();
		expect(transport.reports).toEqual(packets(expectedRequest(allowList)));
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
		expect(incoming).toEqual(incomingBefore);
		expect(supplied.clientDataHash).toEqual(hashBefore);
		expect(supplied.allowList?.[0].id).toEqual(idBefore);
		wiped(captured.requests);
		wiped(captured.raw);
		wiped(owned.snapshots);
		for (const report of transport.reports) report.fill(0xee);
		incoming.fill(0xee);
		expect(result.authenticatorData).toEqual(authData(options));
		expect(result.signature).toEqual(new Uint8Array([0x30, 1, 0x7f]));
		result.credentialId.fill(0x55);
		expect(supplied.allowList?.[0].id).toEqual(idBefore);
		expect(result.userHandle).toEqual(
			allowList ? null : new Uint8Array([0x91, 0x92]),
		);
		transport.deliver(new Uint8Array([0]));
		expect(
			await succeeds(observe(connection.exchange(new Uint8Array([4])))),
		).toEqual({ kind: "response", payload: new Uint8Array([0]) });
		expect(connection.state).toBe("idle");
	},
);

it.each([undefined, 1n])(
	"treats count %s as exactly one without selection or continuation",
	async (count) => {
		const { connection, transport } = create(reply({ count }));
		const select = vi.fn(() => 0);
		assertion(
			await succeeds(
				observe(getCtapAssertion(connection, request(false), { select })),
			),
		);
		expect(select).not.toHaveBeenCalled();
		expect(commandBytes(transport)).toEqual([[...expectedRequest(false)]]);
	},
);

it.each(["explicit", "fallback"])(
	"snapshots mutable request bytes, RP, list and UV for %s responses",
	async (mode) => {
		const { connection, transport } = create();
		const hashGate = deferred<ArrayBuffer>(rpHash.slice().buffer);
		const digest = vi.mocked(crypto.subtle.digest);
		const hashImplementation = digest.getMockImplementation();
		if (!hashImplementation)
			throw new Error("Expected a controlled synthetic digest implementation.");
		digest.mockImplementation((algorithm, input) => {
			void hashImplementation(algorithm, input);
			return hashGate.promise;
		});
		const credentials: CtapGetAssertionCredential[] = [
			{ type: "public-key", id: new Uint8Array([7, 8]) },
		];
		const supplied = {
			...request(),
			allowList: credentials,
			userVerification: true,
		};
		const originalId = credentials[0].id;
		const operation = observe(getCtapAssertion(connection, supplied));
		supplied.rpId = privateText;
		supplied.clientDataHash.fill(0xee);
		originalId.fill(0xee);
		credentials.splice(0, 1, { type: "public-key", id: new Uint8Array([9]) });
		supplied.userVerification = false;
		await flush();
		expect(transport.reports).toHaveLength(0);
		hashGate.resolve(rpHash.slice().buffer);
		await flush();
		expect(transport.reports).toEqual(packets(expectedRequest(true, true)));
		transport.deliver(
			reply({
				flags: 5,
				credentialId: mode === "fallback" ? null : new Uint8Array([7, 8]),
			}),
		);
		const result = assertion(await succeeds(operation));
		expect(result.credentialId).toEqual(new Uint8Array([7, 8]));
		expect(result.userVerified).toBe(true);
		expect(supplied.clientDataHash).toEqual(new Uint8Array(32).fill(0xee));
		expect(originalId).toEqual(new Uint8Array([0xee, 0xee]));
	},
);

it.each([true, false])(
	"binds validation to original UV=%s rather than later mutation",
	async (userVerification) => {
		const { connection, transport } = create();
		const supplied = { ...request(), userVerification };
		const operation = observe(getCtapAssertion(connection, supplied));
		supplied.userVerification = !userVerification;
		await flush();
		transport.deliver(reply({ flags: 1 }));
		if (userVerification) {
			await fails(operation);
			await quarantined(connection, transport);
		} else {
			expect(assertion(await succeeds(operation)).userVerified).toBe(false);
		}
	},
);

it("keeps one exclusive scope across the reply gap and asynchronous metadata-only selection", async () => {
	const first = reply({
		flags: 5,
		count: 3n,
		name: "Ada",
		displayName: "Ada One",
		icon: privateText,
	});
	const second = reply({
		flags: 5,
		credentialId: new Uint8Array([9]),
		userId: new Uint8Array([0x93]),
		name: "Bea",
	});
	const third = reply({
		flags: 5,
		credentialId: new Uint8Array([10]),
		userId: new Uint8Array([0x94]),
		displayName: "Cy",
	});
	const { connection, transport } = create(first, second, third);
	const choice = deferred(1);
	const { captured } = trace(connection);
	const gapContenders: ReturnType<typeof observe<unknown>>[] = [];
	let gapState = "";
	let gapWire: number[][] = [];
	const gapAction = vi.fn(async () => undefined);
	const owned = trackOwnership((decoded) => {
		if (decoded.numberOfCredentials !== 3n) return;
		gapState = connection.state;
		gapWire = commandBytes(transport);
		gapContenders.push(
			observe(connection.exchange(new Uint8Array([4]))),
			observe(connection.withExclusiveExchange(gapAction)),
			observe(getCtapAssertion(connection, request())),
		);
	});
	let candidates: readonly CtapAssertionCandidate[] = [];
	let selectionSignal: AbortSignal | undefined;
	const select = vi.fn(
		(available: readonly CtapAssertionCandidate[], signal: AbortSignal) => {
			candidates = available;
			selectionSignal = signal;
			expect(Object.isFrozen(available)).toBe(true);
			for (const candidate of available) {
				expect(Object.isFrozen(candidate)).toBe(true);
				expect(
					Object.keys(candidate).every((key) =>
						["index", "userId", "name", "displayName"].includes(key),
					),
				).toBe(true);
			}
			expect(available.map((candidate) => ({ ...candidate }))).toEqual([
				{
					index: 0,
					userId: new Uint8Array([0x91, 0x92]),
					name: "Ada",
					displayName: "Ada One",
				},
				{ index: 1, userId: new Uint8Array([0x93]), name: "Bea" },
				{ index: 2, userId: new Uint8Array([0x94]), displayName: "Cy" },
			]);
			for (const candidate of available) candidate.userId.fill(0xee);
			return choice.promise;
		},
	);
	const operation = observe(
		getCtapAssertion(connection, request(false), { select }),
	);
	await flush();
	expect(gapState).toBe("reserved");
	expect(gapWire).toEqual([[...expectedRequest(false)]]);
	expect(gapContenders).toHaveLength(3);
	for (const contender of gapContenders)
		await fails(contender, "not-actionable");
	expect(gapAction).not.toHaveBeenCalled();
	expect(connection.state).toBe("reserved");
	expect(transport.closeCalls).toBe(0);
	expect(select).toHaveBeenCalledTimes(1);
	expect(selectionSignal).toBeInstanceOf(AbortSignal);
	expect(selectionSignal?.aborted).toBe(false);
	expect(commandBytes(transport)).toEqual([
		[...expectedRequest(false)],
		[8],
		[8],
	]);
	const competing = vi.fn(async () => undefined);
	await fails(
		observe(connection.withExclusiveExchange(competing)),
		"not-actionable",
	);
	await fails(
		observe(connection.exchange(new Uint8Array([4]))),
		"not-actionable",
	);
	expect(competing).not.toHaveBeenCalled();
	expect(operation.outcome).toBeUndefined();
	choice.resolve(1);
	const selected = assertion(await succeeds(operation));
	expect(selected).toEqual({
		credentialId: new Uint8Array([9]),
		authenticatorData: authData({ flags: 5 }),
		signature: new Uint8Array([0x30, 1, 0x7f]),
		userHandle: new Uint8Array([0x93]),
		userPresent: true,
		userVerified: true,
	});
	wiped(captured.requests);
	wiped(captured.raw);
	wiped(owned.snapshots);
	wiped(candidates.map((candidate) => candidate.userId));
	for (const index of [0, 2]) {
		const discarded = owned.assertions[index];
		wiped(assertionBuffers(discarded));
	}
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
	transport.deliver(new Uint8Array([0]));
	await succeeds(observe(connection.exchange(new Uint8Array([4]))));
	expect(selected.userHandle).toEqual(new Uint8Array([0x93]));
});

it.each([
	{ label: "wrong RP hash", options: { hash: new Uint8Array(32) } },
	{ label: "UP absent", options: { flags: 4 } },
	{ label: "requested UV absent", options: { flags: 1 }, verification: true },
	{
		label: "credential outside allow-list",
		options: { credentialId: new Uint8Array([9]) },
	},
	{ label: "AT flag", options: { flags: 0x41 } },
	{ label: "ED with no tail", options: { flags: 0x81 } },
	{ label: "tail without ED", options: { tail: new Uint8Array([0xa0]) } },
	{ label: "BS without BE", options: { flags: 0x11 } },
	{ label: "identifying name without UV", options: { name: privateText } },
	{ label: "empty display name without UV", options: { displayName: "" } },
	{ label: "identifying icon without UV", options: { icon: privateText } },
	{ label: "empty signature", options: { signature: new Uint8Array() } },
])(
	"quarantines invalid assertion context: $label",
	async ({ options, verification }) => {
		const { connection, transport } = create(reply(options));
		const { captured } = trace(connection);
		await fails(
			observe(
				getCtapAssertion(connection, {
					...request(),
					userVerification: verification,
				}),
			),
		);
		expect(commandBytes(transport)).toHaveLength(1);
		wiped(captured.raw);
		wiped(captured.requests);
		await quarantined(connection, transport);
	},
);

it.each([
	{
		label: "absent allow-list and user",
		supplied: request(false),
		options: { userId: null },
	},
	{
		label: "discoverable descriptor missing",
		supplied: request(false),
		options: { credentialId: null },
	},
	{
		label: "ambiguous allow-list fallback",
		supplied: {
			...request(),
			allowList: [
				{ type: "public-key" as const, id: new Uint8Array([7, 8]) },
				{ type: "public-key" as const, id: new Uint8Array([9]) },
			],
		},
		options: { credentialId: null },
	},
])(
	"rejects missing request-bound identity: $label",
	async ({ supplied, options }) => {
		const { connection, transport } = create(reply(options));
		await fails(observe(getCtapAssertion(connection, supplied)));
		await quarantined(connection, transport);
	},
);

it("accepts an explicit match from a multi-entry allow-list", async () => {
	const allowList: CtapGetAssertionCredential[] = [
		{ type: "public-key" as const, id: new Uint8Array([9]) },
		{ type: "public-key" as const, id: new Uint8Array([7, 8]) },
	];
	const { connection } = create(reply());
	expect(
		assertion(
			await succeeds(
				observe(getCtapAssertion(connection, { ...request(), allowList })),
			),
		).credentialId,
	).toEqual(new Uint8Array([7, 8]));
});

it.each([0, 1, 0xffffffff])(
	"preserves sign counter %s without claiming signature verification or counter policy",
	async (counter) => {
		const options = { flags: 0x9d, tail: new Uint8Array([0xff]), counter };
		const { connection } = create(reply(options));
		const selected = assertion(
			await succeeds(observe(getCtapAssertion(connection, request()))),
		);
		expect(selected.authenticatorData).toEqual(authData(options));
		expect(selected.signature).toEqual(new Uint8Array([0x30, 1, 0x7f]));
		expect(selected).not.toHaveProperty("userConsented");
	},
);

it("rejects a multi-assertion response to a nonempty allow-list before continuation or selection", async () => {
	const { connection, transport } = create(reply({ count: 2n }));
	const select = vi.fn(() => 0);
	await fails(observe(getCtapAssertion(connection, request(), { select })));
	expect(commandBytes(transport)).toHaveLength(1);
	expect(select).not.toHaveBeenCalled();
	await quarantined(connection, transport);
});

it("requires selection for multiple discoverable assertions without blindly draining or choosing", async () => {
	const { connection, transport } = create(reply({ count: 2n }));
	await fails(
		observe(getCtapAssertion(connection, request(false))),
		"unsupported",
	);
	expect(commandBytes(transport)).toEqual([[...expectedRequest(false)]]);
	await quarantined(connection, transport);
});

it.each([
	{
		label: "repeated count",
		options: { count: 2n, credentialId: new Uint8Array([9]) },
	},
	{
		label: "count one still forbidden",
		options: { count: 1n, credentialId: new Uint8Array([9]) },
	},
	{ label: "duplicate credential", options: {} },
	{ label: "missing descriptor", options: { credentialId: null } },
	{
		label: "missing discoverable user",
		options: { credentialId: new Uint8Array([9]), userId: null },
	},
	{
		label: "wrong RP",
		options: { credentialId: new Uint8Array([9]), hash: new Uint8Array(32) },
	},
	{
		label: "missing UP",
		options: { credentialId: new Uint8Array([9]), flags: 4 },
	},
	{
		label: "missing required UV",
		options: { credentialId: new Uint8Array([9]), flags: 1 },
		verification: true,
	},
])(
	"validates every continuation before selection: $label",
	async ({ options, verification }) => {
		const { connection, transport } = create(
			reply({ flags: 5, count: 3n }),
			reply(options),
		);
		const owned = trackOwnership();
		const select = vi.fn(() => 0);
		await fails(
			observe(
				getCtapAssertion(
					connection,
					{ ...request(false), userVerification: verification },
					{ select },
				),
			),
		);
		expect(commandBytes(transport)).toEqual([
			[...expectedRequest(false, verification)],
			[8],
		]);
		expect(select).not.toHaveBeenCalled();
		for (const decoded of owned.assertions)
			wiped([
				decoded.authenticatorData,
				decoded.signature,
				...(decoded.credentialId ? [decoded.credentialId] : []),
				...(decoded.user ? [decoded.user.id] : []),
			]);
		await quarantined(connection, transport);
	},
);

it.each([0n, 65n, 9007199254740993n, 18446744073709551615n])(
	"rejects unusable or over-cap count %s without numeric truncation or continuation",
	async (count) => {
		const { connection, transport } = create(reply({ count }));
		const select = vi.fn(() => 0);
		await fails(
			observe(getCtapAssertion(connection, request(false), { select })),
		);
		expect(commandBytes(transport)).toHaveLength(1);
		expect(select).not.toHaveBeenCalled();
		await quarantined(connection, transport);
	},
);

it("honors a smaller count cap before collecting additional replies", async () => {
	const { connection, transport } = create(reply({ count: 2n }));
	const select = vi.fn(() => 0);
	await fails(
		observe(
			getCtapAssertion(connection, request(false), {
				maxCredentials: 1,
				select,
			}),
		),
		"resource-limit",
	);
	expect(commandBytes(transport)).toHaveLength(1);
	expect(select).not.toHaveBeenCalled();
	await quarantined(connection, transport);
});

it("collects the inclusive 64-credential cap with exactly 63 sequential argument-free next commands", async () => {
	const replies = Array.from({ length: 64 }, (_value, index) =>
		reply({
			credentialId: new Uint8Array([index + 1]),
			userId: new Uint8Array([index + 1]),
			count: index === 0 ? 64n : undefined,
			counter: 64 - index,
		}),
	);
	const { connection, transport } = create(...replies);
	const { captured } = trace(connection);
	const select = vi.fn((candidates: readonly CtapAssertionCandidate[]) => {
		expect(candidates).toHaveLength(64);
		return 63;
	});
	const selected = assertion(
		await succeeds(
			observe(
				getCtapAssertion(connection, request(false), {
					maxCredentials: 64,
					maxResponseBytes: 486976,
					select,
				}),
			),
		),
	);
	expect(selected.credentialId).toEqual(new Uint8Array([64]));
	expect(selected.authenticatorData).toEqual(authData({ counter: 1 }));
	expect(commandBytes(transport)).toEqual([
		[...expectedRequest(false)],
		...Array.from({ length: 63 }, () => [8]),
	]);
	expect(select).toHaveBeenCalledTimes(1);
	expect(transport.incoming).toHaveLength(0);
	wiped(captured.requests);
	wiped(captured.raw);
	expect(connection.state).toBe("idle");
});

it.each([0, -1])(
	"counts all raw response bytes including status at aggregate budget offset %s",
	async (offset) => {
		const first = reply({ count: 2n });
		const second = reply({ credentialId: new Uint8Array([9]) });
		const { connection, transport } = create(first, second);
		const select = vi.fn(() => 1);
		const operation = observe(
			getCtapAssertion(connection, request(false), {
				maxResponseBytes: first.length + second.length + offset,
				select,
			}),
		);
		if (offset === 0) {
			expect(assertion(await succeeds(operation)).credentialId).toEqual(
				new Uint8Array([9]),
			);
			expect(select).toHaveBeenCalledTimes(1);
		} else {
			await fails(operation, "resource-limit");
			expect(select).not.toHaveBeenCalled();
			await quarantined(connection, transport);
		}
		expect(commandBytes(transport)).toEqual([[...expectedRequest(false)], [8]]);
	},
);

it("enforces the default 65536-byte response budget before selecting an otherwise valid collection", async () => {
	const incoming = Array.from({ length: 10 }, (_value, index) =>
		reply({
			credentialId: new Uint8Array([index + 1]),
			count: index === 0 ? 10n : undefined,
			signature: new Uint8Array(6500).fill(0x7f),
		}),
	);
	expect(incoming.every((payload) => payload.length <= 7609)).toBe(true);
	expect(
		incoming.slice(0, 9).reduce((total, payload) => total + payload.length, 0),
	).toBeLessThan(65536);
	expect(
		incoming.reduce((total, payload) => total + payload.length, 0),
	).toBeGreaterThan(65536);
	const { connection, transport } = create(...incoming);
	const select = vi.fn(() => 0);
	const { captured } = trace(connection);
	await fails(
		observe(getCtapAssertion(connection, request(false), { select })),
		"resource-limit",
	);
	expect(commandBytes(transport)).toHaveLength(10);
	expect(select).not.toHaveBeenCalled();
	wiped(captured.raw);
	await quarantined(connection, transport);
});

it.each(["initial", "continuation"])(
	"applies the byte budget to %s CTAP status replies",
	async (phase) => {
		const first = reply({ count: 2n });
		const status = new Uint8Array([0x2e, 0xa0]);
		const { connection, transport } = create(
			...(phase === "initial" ? [status] : [first, status]),
		);
		await fails(
			observe(
				getCtapAssertion(connection, request(phase === "initial"), {
					maxResponseBytes: phase === "initial" ? 1 : first.length + 1,
					select: () => 0,
				}),
			),
			"resource-limit",
		);
		await quarantined(connection, transport);
	},
);

it.each([
	{ label: "zero timeout", options: { timeoutMs: 0 } },
	{ label: "oversized timeout", options: { timeoutMs: 120001 } },
	{ label: "fractional timeout", options: { timeoutMs: 1.5 } },
	{ label: "NaN timeout", options: { timeoutMs: Number.NaN } },
	{ label: "zero credentials", options: { maxCredentials: 0 } },
	{ label: "oversized credentials", options: { maxCredentials: 65 } },
	{ label: "fractional credentials", options: { maxCredentials: 1.5 } },
	{ label: "zero bytes", options: { maxResponseBytes: 0 } },
	{ label: "oversized bytes", options: { maxResponseBytes: 486977 } },
	{ label: "fractional bytes", options: { maxResponseBytes: 1.5 } },
	{
		label: "infinite bytes",
		options: { maxResponseBytes: Number.POSITIVE_INFINITY },
	},
	{ label: "zero message size", options: { maxMessageSize: 0n } },
	{ label: "numeric message size", options: { maxMessageSize: 1024 } },
	{
		label: "unsigned overflow message size",
		options: { maxMessageSize: 18446744073709551616n },
	},
	{ label: "fake signal", options: { signal: { aborted: false } } },
	{ label: "nonfunction select", options: { select: 0 } },
	{ label: "unknown field", options: { extra: privateText } },
	{ label: "null options", options: null },
	{ label: "array options", options: [] },
])(
	"rejects invalid options before reserving or touching an unrelated active exchange: $label",
	async ({ options }) => {
		const { connection, transport } = create();
		const unrelated = observe(connection.exchange(new Uint8Array([4])));
		await flush();
		const writes = transport.reports.length;
		const reads = transport.readCalls;
		await fails(
			observe(
				getCtapAssertion(
					connection,
					request(),
					options as CtapAssertionTransactionOptions,
				),
			),
			"invalid-input",
		);
		expect(connection.state).toBe("active");
		expect(transport.closeCalls).toBe(0);
		expect(transport.reports).toHaveLength(writes);
		expect(transport.readCalls).toBe(reads);
		transport.deliver(new Uint8Array([0]));
		await succeeds(unrelated);
		expect(connection.state).toBe("idle");
	},
);

it.each(["options", "request", "credential"])(
	"rejects accessors in %s without invoking them or doing I/O",
	async (location) => {
		const getter = vi.fn(() => {
			throw new Error(privateText);
		});
		const supplied = request();
		const options = {};
		const credential = supplied.allowList?.[0];
		if (!credential)
			throw new Error("Expected a synthetic request credential.");
		const target =
			location === "options"
				? options
				: location === "request"
					? supplied
					: credential;
		const key =
			location === "options"
				? "timeoutMs"
				: location === "request"
					? "rpId"
					: "id";
		Object.defineProperty(target, key, { get: getter, enumerable: true });
		const { connection, transport } = create();
		await fails(
			observe(getCtapAssertion(connection, supplied, options)),
			"invalid-input",
		);
		expect(getter).not.toHaveBeenCalled();
		expect(transport.reports).toHaveLength(0);
		expect(transport.readCalls).toBe(0);
		expect(transport.closeCalls).toBe(0);
		expect(connection.state).toBe("idle");
	},
);

it.each([
	{
		label: "unknown request key",
		supplied: { ...request(), extra: privateText },
	},
	{
		label: "short hash",
		supplied: { ...request(), clientDataHash: new Uint8Array(31) },
	},
	{ label: "empty RP", supplied: { ...request(), rpId: "" } },
	{
		label: "empty allow-list rejected by encoder",
		supplied: { ...request(), allowList: [] },
	},
	{
		label: "unknown descriptor key",
		supplied: {
			...request(),
			allowList: [
				{ type: "public-key", id: new Uint8Array([7]), extra: privateText },
			],
		},
	},
	{
		label: "empty credential",
		supplied: {
			...request(),
			allowList: [{ type: "public-key", id: new Uint8Array() }],
		},
	},
])("rejects invalid request before reserving: $label", async ({ supplied }) => {
	const { connection, transport } = create();
	await fails(
		observe(getCtapAssertion(connection, supplied as CtapGetAssertionRequest)),
		"invalid-input",
	);
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
});

it.each([undefined, 64n])(
	"checks encoder message limit %s before reservation or I/O",
	async (maxMessageSize) => {
		const { connection, transport } = create();
		const supplied =
			maxMessageSize === undefined
				? { ...request(), rpId: "a".repeat(1100) }
				: request();
		await fails(
			observe(getCtapAssertion(connection, supplied, { maxMessageSize })),
			"resource-limit",
		);
		expect(transport.reports).toHaveLength(0);
		expect(transport.readCalls).toBe(0);
		expect(transport.closeCalls).toBe(0);
	},
);

it("honors the inclusive encoded request limit and minimum transaction limits", async () => {
	const { connection, transport } = create(new Uint8Array([0x2e]));
	expect(
		await succeeds(
			observe(
				getCtapAssertion(connection, request(), {
					maxMessageSize: BigInt(expectedRequest().length),
					timeoutMs: 1,
					maxCredentials: 1,
					maxResponseBytes: 1,
				}),
			),
		),
	).toEqual({ kind: "ctap-error", status: 0x2e });
	expect(commandBytes(transport)).toEqual([[...expectedRequest()]]);
	await quarantined(connection, transport);
});

it("rejects initially aborted signals before reservation without closing an unrelated active exchange", async () => {
	const { connection, transport } = create();
	const unrelated = observe(connection.exchange(new Uint8Array([4])));
	await flush();
	const controller = new AbortController();
	controller.abort(new Error(privateText));
	await fails(
		observe(
			getCtapAssertion(connection, request(), { signal: controller.signal }),
		),
		"aborted",
	);
	expect(commandBytes(transport)).toEqual([[4]]);
	expect(connection.state).toBe("active");
	expect(transport.closeCalls).toBe(0);
	transport.deliver(new Uint8Array([0]));
	await succeeds(unrelated);
});

it("rejects a busy preflight without quarantining another caller's exchange", async () => {
	const { connection, transport } = create();
	const unrelated = observe(connection.exchange(new Uint8Array([4])));
	await flush();
	await fails(
		observe(getCtapAssertion(connection, request())),
		"not-actionable",
	);
	expect(connection.state).toBe("active");
	expect(transport.closeCalls).toBe(0);
	expect(commandBytes(transport)).toEqual([[4]]);
	transport.deliver(new Uint8Array([0]));
	await succeeds(unrelated);
});

it.each([
	{ phase: "initial", status: 0x2e, body: [] },
	{ phase: "initial", status: 0xff, body: [0xa0] },
	{ phase: "continuation", status: 0x2e, body: [] },
	{ phase: "continuation", status: 0x31, body: [0xa0] },
])(
	"retains typed CTAP status $status during $phase but quarantines without retry",
	async ({ phase, status, body }) => {
		const payload = new Uint8Array([status, ...body]);
		const { connection, transport } = create(
			...(phase === "initial" ? [payload] : [reply({ count: 3n }), payload]),
		);
		const { captured } = trace(connection);
		const owned = trackOwnership();
		const select = vi.fn(() => 0);
		expect(
			await succeeds(
				observe(
					getCtapAssertion(connection, request(phase === "initial"), {
						select,
					}),
				),
			),
		).toEqual({ kind: "ctap-error", status });
		expect(commandBytes(transport)).toHaveLength(phase === "initial" ? 1 : 2);
		expect(select).not.toHaveBeenCalled();
		wiped(captured.raw);
		wiped(captured.requests);
		for (const decoded of owned.assertions) wiped(assertionBuffers(decoded));
		await quarantined(connection, transport);
	},
);

it.each(["initial", "continuation"])(
	"retains HID error code and label during %s with no retry",
	async (phase) => {
		const { connection, transport } = create(
			...(phase === "initial" ? [] : [reply({ count: 3n })]),
		);
		const owned = trackOwnership();
		transport.deliver(new Uint8Array([0x06]), 0x3f);
		const select = vi.fn(() => 0);
		expect(
			await succeeds(
				observe(
					getCtapAssertion(connection, request(phase === "initial"), {
						select,
					}),
				),
			),
		).toEqual({ kind: "hid-error", code: 0x06, error: "ERR_CHANNEL_BUSY" });
		expect(commandBytes(transport)).toHaveLength(phase === "initial" ? 1 : 2);
		expect(select).not.toHaveBeenCalled();
		for (const decoded of owned.assertions) wiped(assertionBuffers(decoded));
		await quarantined(connection, transport);
	},
);

it.each([
	{
		label: "non-map CTAP error",
		payload: new Uint8Array([0x2e, 1]),
		command: 0x10,
	},
	{
		label: "truncated CTAP error",
		payload: new Uint8Array([0x2e, 0xa1]),
		command: 0x10,
	},
	{
		label: "trailing CTAP error bytes",
		payload: new Uint8Array([0x2e, 0xa0, 0]),
		command: 0x10,
	},
	{
		label: "missing successful map",
		payload: new Uint8Array([0]),
		command: 0x10,
	},
	{
		label: "missing successful fields",
		payload: new Uint8Array([0, 0xa0]),
		command: 0x10,
	},
	{ label: "empty HID error", payload: new Uint8Array(), command: 0x3f },
	{
		label: "oversized HID error",
		payload: new Uint8Array([6, 0]),
		command: 0x3f,
	},
])(
	"rejects malformed status payload rather than returning a typed error: $label",
	async ({ payload, command }) => {
		const { connection, transport } = create();
		transport.deliver(payload, command);
		await fails(observe(getCtapAssertion(connection, request())));
		expect(commandBytes(transport)).toHaveLength(1);
		await quarantined(connection, transport);
	},
);

it.each([
	-1,
	2,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"0",
	null,
	undefined,
])(
	"rejects invalid selection %s and wipes all owned candidates and assertions",
	async (choice) => {
		const { connection, transport } = create(
			reply({ count: 2n }),
			reply({ credentialId: new Uint8Array([9]) }),
		);
		const owned = trackOwnership();
		let candidates: readonly CtapAssertionCandidate[] = [];
		const select = vi.fn((available: readonly CtapAssertionCandidate[]) => {
			candidates = available;
			return choice as number;
		});
		await fails(
			observe(getCtapAssertion(connection, request(false), { select })),
		);
		expect(select).toHaveBeenCalledTimes(1);
		wiped(candidates.map((candidate) => candidate.userId));
		for (const decoded of owned.assertions) wiped(assertionBuffers(decoded));
		await quarantined(connection, transport);
	},
);

it.each(["throw", "reject", "hostile"])(
	"redacts %s selection failures and releases metadata byte copies",
	async (mode) => {
		const { connection, transport } = create(
			reply({ count: 2n }),
			reply({ credentialId: new Uint8Array([9]) }),
		);
		const selection = deferred(0);
		let candidates: readonly CtapAssertionCandidate[] = [];
		const select = (available: readonly CtapAssertionCandidate[]) => {
			candidates = available;
			if (mode === "throw")
				throw new Error(privateText, { cause: privateText });
			if (mode === "hostile")
				throw new Proxy(
					{},
					{
						get() {
							throw new Error(privateText);
						},
						getPrototypeOf() {
							throw new Error(privateText);
						},
					},
				);
			return selection.promise;
		};
		const operation = observe(
			getCtapAssertion(connection, request(false), { select }),
		);
		await flush();
		if (mode === "reject") selection.reject(new Error(privateText));
		await fails(operation);
		wiped(candidates.map((candidate) => candidate.userId));
		await quarantined(connection, transport);
	},
);

it.each(["timeout", "abort"])(
	"bounds an unresolved initial report with %s and preserves truthful closing state",
	async (mode) => {
		const { connection, transport } = create();
		const controller = new AbortController();
		const closeGate = deferred(undefined);
		transport.onClose = () => closeGate.promise;
		const operation = observe(
			getCtapAssertion(connection, request(), {
				timeoutMs: 20,
				signal: controller.signal,
			}),
		);
		await flush();
		expect(transport.pendingReads).toHaveLength(1);
		if (mode === "abort") controller.abort(new Error(privateText));
		else await vi.advanceTimersByTimeAsync(20);
		await fails(operation, mode === "abort" ? "aborted" : "timeout");
		expect(connection.state).toBe("closing");
		expect(transport.closeCalls).toBe(1);
		const closing = observe(connection.close());
		await flush();
		expect(closing.outcome).toBeUndefined();
		closeGate.resolve(undefined);
		await flush();
		expect(connection.state).toBe("closing");
		expect(closing.outcome).toBeUndefined();
		transport.pendingReads[0].resolve(packets(new Uint8Array([0x2d]))[0]);
		await succeeds(closing);
		await quarantined(connection, transport);
		expect(commandBytes(transport)).toHaveLength(1);
	},
);

it("bounds a pending continuation to 30000ms rather than the longer global timeout", async () => {
	const { connection, transport } = create(reply({ count: 2n }));
	const select = vi.fn(() => 0);
	const operation = observe(
		getCtapAssertion(connection, request(false), { timeoutMs: 120000, select }),
	);
	await flush();
	expect(transport.pendingReads).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(29999);
	expect(operation.outcome).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1);
	await fails(operation, "timeout");
	expect(select).not.toHaveBeenCalled();
	expect(commandBytes(transport)).toEqual([[...expectedRequest(false)], [8]]);
	transport.pendingReads[0].resolve(packets(new Uint8Array([0x2d]))[0]);
	await quarantined(connection, transport);
});

it("rejects a local gap over 30000ms after a reply without sending the next command", async () => {
	const decode = responses.decodeCtapGetAssertionResponse;
	vi.spyOn(responses, "decodeCtapGetAssertionResponse").mockImplementation(
		(input) => {
			const result = decode(input);
			if (
				result.kind === "assertion" &&
				result.assertion.numberOfCredentials === 2n
			)
				vi.advanceTimersByTime(30001);
			return result;
		},
	);
	const { connection, transport } = create(reply({ count: 2n }));
	const select = vi.fn(() => 0);
	await fails(
		observe(getCtapAssertion(connection, request(false), { select })),
		"timeout",
	);
	expect(commandBytes(transport)).toEqual([[...expectedRequest(false)]]);
	expect(select).not.toHaveBeenCalled();
	await quarantined(connection, transport);
});

it("uses one global deadline across initial wait, continuation and pending selection", async () => {
	const { connection, transport } = create();
	const { captured } = trace(connection);
	const choice = deferred(1);
	let signal: AbortSignal | undefined;
	let candidates: readonly CtapAssertionCandidate[] = [];
	const select = vi.fn(
		(
			available: readonly CtapAssertionCandidate[],
			selectionSignal: AbortSignal,
		) => {
			candidates = available;
			signal = selectionSignal;
			return choice.promise;
		},
	);
	const operation = observe(
		getCtapAssertion(connection, request(false), { timeoutMs: 10000, select }),
	);
	await flush();
	await vi.advanceTimersByTimeAsync(6000);
	transport.deliver(reply({ count: 2n }));
	await flush();
	expect(commandBytes(transport)).toEqual([[...expectedRequest(false)], [8]]);
	await vi.advanceTimersByTimeAsync(3000);
	transport.deliver(reply({ credentialId: new Uint8Array([9]) }));
	await flush();
	expect(select).toHaveBeenCalledTimes(1);
	expect(connection.state).toBe("reserved");
	await vi.advanceTimersByTimeAsync(999);
	expect(operation.outcome).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1);
	const error = await fails(operation, "timeout");
	expect(signal?.aborted).toBe(true);
	wiped(candidates.map((candidate) => candidate.userId));
	wiped(captured.raw);
	wiped(captured.requests);
	await quarantined(connection, transport);
	choice.resolve(1);
	await flush();
	expect(operation.outcome).toEqual({ error });
	expect(connection.state).toBe("closed");
});

it.each(["resolve", "reject"])(
	"aborts selection promptly and ignores its late %s without leaking metadata",
	async (late) => {
		const { connection, transport } = create(
			reply({ count: 2n }),
			reply({ credentialId: new Uint8Array([9]) }),
		);
		const controller = new AbortController();
		const choice = deferred(1);
		const owned = trackOwnership();
		let candidates: readonly CtapAssertionCandidate[] = [];
		let signal: AbortSignal | undefined;
		const select = (
			available: readonly CtapAssertionCandidate[],
			selectionSignal: AbortSignal,
		) => {
			candidates = available;
			signal = selectionSignal;
			return choice.promise;
		};
		const operation = observe(
			getCtapAssertion(connection, request(false), {
				select,
				signal: controller.signal,
			}),
		);
		await flush();
		controller.abort(new Error(privateText));
		const error = await fails(operation, "aborted");
		expect(signal?.aborted).toBe(true);
		wiped(candidates.map((candidate) => candidate.userId));
		for (const decoded of owned.assertions) wiped(assertionBuffers(decoded));
		await quarantined(connection, transport);
		if (late === "resolve") choice.resolve(1);
		else choice.reject(new Error(privateText));
		await flush();
		expect(operation.outcome).toEqual({ error });
		expect(transport.closeCalls).toBe(1);
	},
);

it.each(["timeout", "abort"])(
	"wipes a late owned successful payload when %s wins the exchange delivery race",
	async (mode) => {
		const { connection, transport } = create(reply());
		const { captured } = trace(connection);
		const controller = new AbortController();
		let stateAtStop = "";
		let sawOwnedPayload = false;
		const accept = vi
			.mocked(FidoHidMessageAssembler.prototype.accept)
			.getMockImplementation();
		if (!accept)
			throw new Error("Expected a call-through synthetic message observer.");
		vi.mocked(FidoHidMessageAssembler.prototype.accept).mockImplementation(
			function (this: FidoHidMessageAssembler, report) {
				const message = accept.call(this, report);
				if (message?.command === 0x10 && transport.supplied.has(report)) {
					sawOwnedPayload = message.payload.some((byte) => byte !== 0);
					queueMicrotask(() => {
						stateAtStop = connection.state;
						if (mode === "abort") controller.abort(new Error(privateText));
						else vi.advanceTimersByTime(20);
					});
				}
				return message;
			},
		);
		const operation = observe(
			getCtapAssertion(connection, request(), {
				timeoutMs: 20,
				signal: controller.signal,
			}),
		);
		const error = await fails(
			operation,
			mode === "abort" ? "aborted" : "timeout",
		);
		expect(captured.raw).toHaveLength(1);
		expect(sawOwnedPayload).toBe(true);
		expect(stateAtStop).toBe("reserved");
		await quarantined(connection, transport);
		wiped(captured.raw);
		wiped(captured.requests);
		expect(operation.outcome).toEqual({ error });
		expect(commandBytes(transport)).toHaveLength(1);
	},
);

it("rejects validation failure before a controlled hanging native close settles", async () => {
	const { connection, transport } = create(reply({ hash: new Uint8Array(32) }));
	const closeGate = deferred(undefined);
	transport.onClose = () => closeGate.promise;
	await fails(observe(getCtapAssertion(connection, request())));
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	const closing = observe(connection.close());
	await flush();
	expect(closing.outcome).toBeUndefined();
	closeGate.resolve(undefined);
	await succeeds(closing);
	await quarantined(connection, transport);
});

it("removes transaction abort effects after success so later work and returned bytes stay owned", async () => {
	const { connection, transport } = create(reply());
	const controller = new AbortController();
	const selected = assertion(
		await succeeds(
			observe(
				getCtapAssertion(connection, request(), { signal: controller.signal }),
			),
		),
	);
	const later = observe(connection.exchange(new Uint8Array([4])));
	await flush();
	controller.abort(new Error(privateText));
	await flush();
	expect(connection.state).toBe("active");
	expect(transport.closeCalls).toBe(0);
	expect(messages(transport).every((message) => message.command === 0x10)).toBe(
		true,
	);
	transport.deliver(new Uint8Array([0]));
	await succeeds(later);
	await vi.advanceTimersByTimeAsync(120000);
	expect(connection.state).toBe("idle");
	expect(selected.authenticatorData).toEqual(authData());
	expect(selected.credentialId).toEqual(new Uint8Array([7, 8]));
});

it.each([
	{ mutation: "detached userId", outcome: "success", shouldThrow: false },
	{
		mutation: "detached userId",
		outcome: "selection failure",
		shouldThrow: true,
	},
	{ mutation: "own fill", outcome: "success", shouldThrow: false },
	{ mutation: "own fill", outcome: "selection failure", shouldThrow: true },
])(
	"review regression: $mutation cleanup preserves $outcome",
	async ({ mutation, shouldThrow }) => {
		const { connection, transport } = create(
			reply({ count: 2n }),
			reply({
				credentialId: new Uint8Array([9]),
				userId: new Uint8Array([0x93]),
			}),
		);
		const { captured } = trace(connection);
		const owned = trackOwnership();
		const fillError = new Error(`${privateText}: replacement fill`);
		const selectionError = new Error(`${privateText}: selection failure`, {
			cause: privateText,
		});
		const replacementFill = vi.fn(() => {
			throw fillError;
		});
		let candidates: readonly CtapAssertionCandidate[] = [];
		let transferredUserId: Uint8Array | undefined;
		const select = vi.fn((available: readonly CtapAssertionCandidate[]) => {
			candidates = available;
			if (mutation === "detached userId") {
				const buffer = available[0].userId.buffer;
				transferredUserId = new Uint8Array(
					structuredClone(buffer, { transfer: [buffer] }),
				);
				cleanup.push(() => transferredUserId?.fill(0));
			} else {
				Object.defineProperty(available[0].userId, "fill", {
					value: replacementFill,
					configurable: true,
				});
			}
			if (shouldThrow) throw selectionError;
			return 0;
		});
		const operation = observe(
			getCtapAssertion(connection, request(false), { select }),
		);
		if (shouldThrow) {
			const error = await fails(operation);
			expect(error).not.toBe(selectionError);
			expect(error).not.toBe(fillError);
			await quarantined(connection, transport);
		} else {
			const selected = assertion(await succeeds(operation));
			expect(selected).toEqual({
				credentialId: new Uint8Array([7, 8]),
				authenticatorData: authData(),
				signature: new Uint8Array([0x30, 1, 0x7f]),
				userHandle: new Uint8Array([0x91, 0x92]),
				userPresent: true,
				userVerified: false,
			});
			expect(connection.state).toBe("idle");
			expect(transport.closeCalls).toBe(0);
		}
		expect(select).toHaveBeenCalledTimes(1);
		expect(candidates).toHaveLength(2);
		expect(replacementFill).not.toHaveBeenCalled();
		if (mutation === "detached userId") {
			expect(candidates[0].userId.byteLength).toBe(0);
			expect(transferredUserId).toEqual(new Uint8Array([0x91, 0x92]));
		} else {
			expect([...candidates[0].userId]).toEqual([0, 0]);
		}
		wiped(candidates.slice(1).map((candidate) => candidate.userId));
		expect(owned.assertions).toHaveLength(2);
		for (const decoded of owned.assertions) wiped(assertionBuffers(decoded));
		wiped(owned.snapshots);
		wiped(captured.requests);
		wiped(captured.raw);
		expect(commandBytes(transport)).toEqual([[...expectedRequest(false)], [8]]);
	},
);

async function reviewHandoff(lifecycle: "abort" | "deadline") {
	const { connection, transport } = create(
		reply({ count: 2n }),
		reply({
			credentialId: new Uint8Array([9]),
			userId: new Uint8Array([0x93]),
		}),
	);
	const controller = new AbortController();
	const handoff = deferred(undefined);
	const watched = observe(handoff.promise);
	let later: ReturnType<typeof observe<unknown>> | undefined;
	let outcomeAtRelease: Outcome<AssertionResult> | undefined;
	let selectionState = "";
	let stateBeforeEvent = "";
	let candidates: readonly CtapAssertionCandidate[] = [];
	let watcherTicks = 0;
	const watchRelease = () => {
		try {
			watcherTicks++;
			if (connection.state !== "idle") {
				if (watcherTicks >= 128) {
					handoff.reject(
						new Error("Synthetic handoff did not observe exclusive release."),
					);
					return;
				}
				queueMicrotask(watchRelease);
				return;
			}
			outcomeAtRelease = operation.outcome;
			later = observe(
				connection.exchange(new Uint8Array([4]), { timeoutMs: 1000 }),
			);
			stateBeforeEvent = connection.state;
			if (lifecycle === "abort") controller.abort(new Error(privateText));
			else vi.advanceTimersByTime(20);
			handoff.resolve(undefined);
		} catch (error) {
			handoff.reject(error);
		}
	};
	const select = vi.fn((available: readonly CtapAssertionCandidate[]) => {
		candidates = available;
		selectionState = connection.state;
		queueMicrotask(watchRelease);
		return 0;
	});
	const operation = observe(
		getCtapAssertion(connection, request(false), {
			select,
			signal: controller.signal,
			timeoutMs: 20,
		}),
	);
	await succeeds(watched);
	expect(select).toHaveBeenCalledTimes(1);
	expect(selectionState).toBe("reserved");
	expect(watcherTicks).toBeGreaterThan(0);
	expect(watcherTicks).toBeLessThanOrEqual(128);
	expect(outcomeAtRelease).toBeUndefined();
	expect(stateBeforeEvent).toBe("active");
	const selected = assertion(await succeeds(operation));
	expect(selected).toEqual({
		credentialId: new Uint8Array([7, 8]),
		authenticatorData: authData(),
		signature: new Uint8Array([0x30, 1, 0x7f]),
		userHandle: new Uint8Array([0x91, 0x92]),
		userPresent: true,
		userVerified: false,
	});
	wiped(candidates.map((candidate) => candidate.userId));
	expect(later).toBeDefined();
	if (!later) throw new Error("Expected a new owner during synthetic handoff.");
	expect(later.outcome).toBeUndefined();
	expect(connection.state).toBe("active");
	expect(transport.closeCalls).toBe(0);
	expect(transport.pendingReads).toHaveLength(1);
	expect(commandBytes(transport)).toEqual([
		[...expectedRequest(false)],
		[8],
		[4],
	]);
	expect(messages(transport).every((message) => message.command === 0x10)).toBe(
		true,
	);
	await vi.advanceTimersByTimeAsync(20);
	expect(connection.state).toBe("active");
	expect(later.outcome).toBeUndefined();
	expect(transport.closeCalls).toBe(0);
	transport.deliver(new Uint8Array([0, 0x7a]));
	expect(await succeeds(later)).toEqual({
		kind: "response",
		payload: new Uint8Array([0, 0x7a]),
	});
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
	expect(selected.authenticatorData).toEqual(authData());
	expect(selected.userHandle).toEqual(new Uint8Array([0x91, 0x92]));
}

it("review regression: old abort after release preserves the new owner", async () => {
	await reviewHandoff("abort");
});

it("review regression: old deadline after release preserves the new owner", async () => {
	await reviewHandoff("deadline");
});
