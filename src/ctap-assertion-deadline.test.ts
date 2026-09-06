import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type CtapAssertionCandidate,
	getCtapAssertion,
} from "./ctap-assertion-transaction.js";
import * as cbor from "./ctap-cbor.js";
import * as requests from "./ctap-get-assertion-request.js";
import * as responses from "./ctap-get-assertion-response.js";
import { AgentBrowserError } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import * as packets from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const rpHash = new Uint8Array([
	0xca, 0x97, 0x81, 0x12, 0xca, 0x1b, 0xbd, 0xca, 0xfa, 0xc2, 0x31, 0xb3, 0x9a,
	0x23, 0xdc, 0x4d, 0xa7, 0x86, 0xef, 0xf8, 0x14, 0x7c, 0x4e, 0x72, 0xb9, 0x80,
	0x77, 0x85, 0xaf, 0xee, 0x48, 0xbb,
]);
const privateText = "SYNTHETIC_PRIVATE_ASSERTION_DEADLINE";
const connections: FidoHidCborConnection[] = [];
const cleanup: Array<() => void> = [];
type Allocation = { buffer: Uint8Array; before: Uint8Array };
type Outcome<Value> = { value: Value } | { error: unknown };
const digests: Allocation[] = [];

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
	void operation.then(
		(value) => {
			outcome = { value };
		},
		(error: unknown) => {
			outcome = { error };
		},
	);
	return {
		get outcome() {
			return outcome;
		},
	};
}

async function microtasks() {
	for (let step = 0; step < 256; step++) await Promise.resolve();
}

function clockOnly() {
	const start = performance.now();
	let now = start;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const timerCallback = vi.fn();
	const timer = setTimeout(timerCallback, 20);
	cleanup.push(() => clearTimeout(timer));
	return {
		timerCallback,
		expire: vi.fn(() => {
			now = start + 21;
		}),
	};
}

async function timeout(
	operation: ReturnType<
		typeof observe<Awaited<ReturnType<typeof getCtapAssertion>>>
	>,
	underlying: unknown,
) {
	await microtasks();
	const outcome = operation.outcome;
	expect(outcome).toHaveProperty("error");
	const error = outcome && "error" in outcome ? outcome.error : undefined;
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected a settled assertion deadline failure.");
	expect(error).not.toBe(underlying);
	expect(error.code).toBe("timeout");
	expect(error.message).toBe("CTAP assertion transaction failed.");
	expect(error.cause).toBeUndefined();
	expect(error.stack).not.toContain(privateText);
	expect(JSON.stringify(error)).not.toContain(privateText);
}

function wiped(allocations: readonly Allocation[]) {
	expect(allocations.length).toBeGreaterThan(0);
	for (const { buffer, before } of allocations) {
		expect(before.some((byte) => byte !== 0)).toBe(true);
		expect([...buffer]).toEqual([...new Uint8Array(before.length)]);
	}
}

function unchanged(allocations: readonly Allocation[]) {
	for (const { buffer, before } of allocations) expect(buffer).toEqual(before);
}

function bytes(value: readonly number[] | Uint8Array): number[] {
	return value.length < 24
		? [0x40 | value.length, ...value]
		: [0x58, value.length, ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [0x60 | encoded.length, ...encoded];
}

function map(entries: number[][]): number[] {
	return [0xa0 | entries.length, ...entries.flat()];
}

function reply(identifier = 7, flags = 5, count?: number) {
	const authData = [...rpHash, flags, 0x12, 0x34, 0x56, 0x78];
	const entries = [
		[
			1,
			...map([
				[...text("id"), ...bytes([identifier, identifier + 1])],
				[...text("type"), ...text("public-key")],
			]),
		],
		[2, ...bytes(authData)],
		[3, ...bytes([0x30, 0x7f])],
		[
			4,
			...map([
				[...text("id"), ...bytes([0x8a + identifier, 0x8b + identifier])],
				[...text("name"), ...text(`Synthetic ${identifier}`)],
			]),
		],
	];
	if (count !== undefined) entries.push([5, count]);
	return new Uint8Array([0, ...map(entries)]);
}

function request(discoverable = false): requests.CtapGetAssertionRequest {
	return {
		rpId: "a",
		clientDataHash: new Uint8Array(32).fill(0x51),
		userVerification: true,
		...(discoverable
			? {}
			: {
					allowList: [
						{ type: "public-key" as const, id: new Uint8Array([7, 8]) },
					],
				}),
	};
}

function sources(
	input: requests.CtapGetAssertionRequest,
	...wire: Uint8Array[]
) {
	return [
		input.clientDataHash,
		...(input.allowList?.map((entry) => entry.id) ?? []),
		...wire,
	].map(remember);
}

class MemoryTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly writes: Allocation[] = [];
	readonly incoming: Uint8Array[] = [];
	readonly supplied = new WeakSet<Uint8Array>();
	readonly pending: ReturnType<typeof deferred<Uint8Array>>[] = [];
	readCalls = 0;
	closeCalls = 0;
	onWrite?: (report: Uint8Array) => Promise<number>;

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
		const gate = deferred<Uint8Array>(new Uint8Array(64));
		this.pending.push(gate);
		return gate.promise;
	}

	close(): Promise<void> {
		this.closeCalls++;
		return Promise.resolve();
	}

	deliver(payload: Uint8Array) {
		this.incoming.push(
			...packets.encodeFidoHidMessage(channel, 0x10, payload, 64),
		);
		while (this.pending.length && this.incoming.length) {
			const gate = this.pending.shift();
			const report = this.incoming.shift();
			if (gate && report) {
				this.supplied.add(report);
				gate.resolve(report);
			}
		}
	}
}

function create(...payloads: Uint8Array[]) {
	const transport = new MemoryTransport();
	for (const payload of payloads) transport.deliver(payload);
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	return { connection, transport };
}

function treeBuffers(value: cbor.CtapCborValue): Uint8Array[] {
	if (value.kind === "bytes") return [value.value];
	if (value.kind === "float") return [value.encoding];
	if (value.kind === "array") return value.items.flatMap(treeBuffers);
	if (value.kind === "map")
		return value.entries.flatMap(([key, item]) => [
			...treeBuffers(key),
			...treeBuffers(item),
		]);
	return [];
}

function trace(
	transport: MemoryTransport,
	onCopy?: (value: Uint8Array, parsing: boolean) => void,
) {
	const owned = {
		copies: [] as Allocation[],
		trees: [] as Allocation[],
		encoded: [] as Allocation[],
		payloads: [] as Allocation[],
		commands: [] as Allocation[],
		packets: [] as Allocation[],
		parsed: [] as Allocation[],
		requestErrors: [] as unknown[],
		responseErrors: [] as unknown[],
	};
	let parsing = false;
	const copy = cbor.copyCtapBytes;
	const decode = cbor.decodeCtapCbor;
	const encode = requests.encodeCtapGetAssertionRequest;
	const parse = responses.decodeCtapGetAssertionResponse;
	const encodePackets = packets.encodeFidoHidMessage;
	const accept = FidoHidMessageAssembler.prototype.accept;
	vi.spyOn(cbor, "copyCtapBytes").mockImplementation((input) => {
		const result = copy(input);
		owned.copies.push(remember(result));
		onCopy?.(result, parsing);
		return result;
	});
	vi.spyOn(cbor, "decodeCtapCbor").mockImplementation((input) => {
		const result = decode(input);
		owned.trees.push(...treeBuffers(result).map(remember));
		return result;
	});
	vi.spyOn(requests, "encodeCtapGetAssertionRequest").mockImplementation(
		(...args) => {
			try {
				const result = encode(...args);
				owned.encoded.push(remember(result));
				return result;
			} catch (error) {
				owned.requestErrors.push(error);
				throw error;
			}
		},
	);
	vi.spyOn(responses, "decodeCtapGetAssertionResponse").mockImplementation(
		(input) => {
			parsing = true;
			try {
				const result = parse(input);
				if (result.kind === "assertion") {
					const assertion = result.assertion;
					owned.parsed.push(
						...[
							assertion.authenticatorData,
							assertion.signature,
							...(assertion.credentialId ? [assertion.credentialId] : []),
							...(assertion.user ? [assertion.user.id] : []),
						].map(remember),
					);
				}
				return result;
			} catch (error) {
				owned.responseErrors.push(error);
				throw error;
			} finally {
				parsing = false;
			}
		},
	);
	vi.spyOn(packets, "encodeFidoHidMessage").mockImplementation((...args) => {
		const result = encodePackets(...args);
		if (args[1] === 0x10 && (args[2][0] === 2 || args[2][0] === 8)) {
			owned.commands.push(remember(args[2]));
			owned.packets.push(...result.map(remember));
		}
		return result;
	});
	vi.spyOn(FidoHidMessageAssembler.prototype, "accept").mockImplementation(
		function (this: FidoHidMessageAssembler, report) {
			const message = accept.call(this, report);
			if (message && transport.supplied.has(report))
				owned.payloads.push(remember(message.payload));
			return message;
		},
	);
	return owned;
}

function sentCommands(transport: MemoryTransport) {
	const commands: number[][] = [];
	let assembler = new FidoHidMessageAssembler(channel, 64);
	try {
		for (const report of transport.reports) {
			const message = assembler.accept(report);
			if (!message) continue;
			expect(message.command).toBe(0x10);
			commands.push([...message.payload]);
			message.payload.fill(0);
			message.channel.fill(0);
			assembler.close();
			assembler = new FidoHidMessageAssembler(channel, 64);
		}
	} finally {
		assembler.close();
	}
	return commands;
}

async function preservesOwner(
	connection: FidoHidCborConnection,
	transport: MemoryTransport,
	owner: ReturnType<typeof observe<unknown>>,
) {
	expect(connection.state).toBe("active");
	expect(transport.closeCalls).toBe(0);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
	expect(owner.outcome).toBeUndefined();
	transport.deliver(new Uint8Array([0, 0x71]));
	await microtasks();
	expect(owner.outcome).toEqual({
		value: { kind: "response", payload: new Uint8Array([0, 0x71]) },
	});
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
}

async function quarantined(
	connection: FidoHidCborConnection,
	transport: MemoryTransport,
) {
	await microtasks();
	expect(connection.state).toBe("closed");
	expect(connection.keepalive).toBeUndefined();
	expect(transport.closeCalls).toBe(1);
	const writes = transport.reports.length;
	const reads = transport.readCalls;
	const nextOwner = vi.fn(async () => undefined);
	const next = observe(connection.withExclusiveExchange(nextOwner));
	await microtasks();
	expect(next.outcome).toMatchObject({ error: { code: "closed" } });
	expect(nextOwner).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
	expect(transport.closeCalls).toBe(1);
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, input) => {
		expect(typeof algorithm === "string" ? algorithm : algorithm.name).toBe(
			"SHA-256",
		);
		const view = ArrayBuffer.isView(input)
			? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
			: new Uint8Array(input);
		expect(view).toEqual(new Uint8Array([0x61]));
		const output = rpHash.slice();
		digests.push(remember(output));
		return Promise.resolve(output.buffer);
	});
});

afterEach(async () => {
	try {
		const closures = connections.map((connection) =>
			observe(FidoHidCborConnection.prototype.close.call(connection)),
		);
		for (let index = 0; index < cleanup.length; index++) cleanup[index]();
		await microtasks();
		for (const closure of closures)
			expect(closure.outcome).toEqual({ value: undefined });
	} finally {
		connections.length = 0;
		cleanup.length = 0;
		digests.length = 0;
		vi.clearAllTimers();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

it("exceptional assertion deadline overrides real request size failure without disturbing another owner", async () => {
	const clock = clockOnly();
	const { connection, transport } = create();
	const owner = observe(connection.exchange(new Uint8Array([4])));
	await microtasks();
	const owned = trace(transport, () => clock.expire());
	const input = request();
	const caller = sources(input);
	const operation = observe(
		getCtapAssertion(connection, input, { timeoutMs: 20, maxMessageSize: 1n }),
	);
	await microtasks();
	expect(owned.requestErrors).toHaveLength(1);
	expect(owned.requestErrors[0]).toBeInstanceOf(AgentBrowserError);
	expect(owned.requestErrors[0]).toMatchObject({ code: "resource-limit" });
	await timeout(operation, owned.requestErrors[0]);
	expect(clock.expire).toHaveBeenCalled();
	expect(crypto.subtle.digest).not.toHaveBeenCalled();
	expect(owned.commands).toHaveLength(0);
	wiped(owned.copies);
	unchanged(caller);
	await preservesOwner(connection, transport, owner);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional assertion deadline overrides deferred digest rejection before acquisition", async () => {
	const clock = clockOnly();
	const { connection, transport } = create();
	const owner = observe(connection.exchange(new Uint8Array([4])));
	await microtasks();
	const owned = trace(transport);
	const gate = deferred(new ArrayBuffer(32));
	vi.mocked(crypto.subtle.digest).mockReturnValue(gate.promise);
	const input = request();
	const caller = sources(input);
	const operation = observe(
		getCtapAssertion(connection, input, { timeoutMs: 20 }),
	);
	await microtasks();
	expect(crypto.subtle.digest).toHaveBeenCalledTimes(1);
	expect(operation.outcome).toBeUndefined();
	const rejection = new AgentBrowserError("network-error", privateText);
	clock.expire();
	gate.reject(rejection);
	await timeout(operation, rejection);
	expect(owned.commands).toHaveLength(0);
	wiped(owned.copies);
	wiped(owned.encoded);
	wiped(owned.trees);
	unchanged(caller);
	await preservesOwner(connection, transport, owner);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional assertion deadline overrides owned write rejection and quarantines", async () => {
	const clock = clockOnly();
	const { connection, transport } = create();
	const owned = trace(transport);
	const gate = deferred(64);
	transport.onWrite = () => gate.promise;
	const input = request();
	const caller = sources(input);
	const operation = observe(
		getCtapAssertion(connection, input, { timeoutMs: 20 }),
	);
	await microtasks();
	expect(connection.state).toBe("active");
	expect(operation.outcome).toBeUndefined();
	expect(transport.writes).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	const rejection = new AgentBrowserError("network-error", privateText);
	clock.expire();
	gate.reject(rejection);
	await timeout(operation, rejection);
	wiped(owned.copies);
	wiped(owned.encoded);
	wiped(owned.trees);
	wiped(owned.commands);
	wiped(owned.packets);
	wiped(transport.writes);
	wiped(digests);
	unchanged(caller);
	await quarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(0);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional assertion deadline overrides the real parser's forbidden unverified metadata error", async () => {
	const clock = clockOnly();
	const wire = reply(7, 1);
	const { connection, transport } = create(wire);
	const owned = trace(transport, (value, parsing) => {
		if (parsing && value.length === 2 && value[0] === 0x91 && value[1] === 0x92)
			clock.expire();
	});
	const input = request();
	input.userVerification = false;
	const caller = sources(input, wire);
	const operation = observe(
		getCtapAssertion(connection, input, { timeoutMs: 20 }),
	);
	await microtasks();
	expect(clock.expire).toHaveBeenCalledTimes(1);
	expect(owned.responseErrors).toHaveLength(1);
	expect(owned.responseErrors[0]).toBeInstanceOf(AgentBrowserError);
	expect(owned.responseErrors[0]).toMatchObject({ code: "invalid-input" });
	await timeout(operation, owned.responseErrors[0]);
	expect(owned.parsed).toHaveLength(0);
	expect(owned.payloads).toHaveLength(1);
	wiped(owned.copies);
	wiped(owned.encoded);
	wiped(owned.trees);
	wiped(owned.payloads);
	wiped(owned.commands);
	wiped(owned.packets);
	wiped(transport.writes);
	wiped(digests);
	unchanged(caller);
	await quarantined(connection, transport);
	expect(sentCommands(transport).map((command) => command[0])).toEqual([2]);
	expect(clock.timerCallback).not.toHaveBeenCalled();
});

it("exceptional assertion deadline overrides deferred selection rejection while retaining exclusive ownership", async () => {
	const clock = clockOnly();
	const first = reply(7, 5, 2);
	const second = reply(9, 5);
	const { connection, transport } = create(first, second);
	const owned = trace(transport);
	const gate = deferred(0);
	const candidates: Allocation[] = [];
	const select = vi.fn(
		(available: readonly CtapAssertionCandidate[], signal: AbortSignal) => {
			expect(connection.state).toBe("reserved");
			expect(signal.aborted).toBe(false);
			expect(available).toEqual([
				{ index: 0, userId: new Uint8Array([0x91, 0x92]), name: "Synthetic 7" },
				{ index: 1, userId: new Uint8Array([0x93, 0x94]), name: "Synthetic 9" },
			]);
			candidates.push(
				...available.map((candidate) => remember(candidate.userId)),
			);
			return gate.promise;
		},
	);
	const input = request(true);
	const caller = sources(input, first, second);
	const operation = observe(
		getCtapAssertion(connection, input, { timeoutMs: 20, select }),
	);
	await microtasks();
	expect(select).toHaveBeenCalledTimes(1);
	expect(operation.outcome).toBeUndefined();
	expect(connection.state).toBe("reserved");
	const commands = sentCommands(transport);
	expect(commands).toHaveLength(2);
	expect(commands[0][0]).toBe(2);
	expect(commands[1]).toEqual([8]);
	expect(owned.payloads).toHaveLength(2);
	expect(owned.parsed).toHaveLength(8);
	const competitor = vi.fn(async () => undefined);
	const competing = observe(connection.withExclusiveExchange(competitor));
	await microtasks();
	expect(competing.outcome).toMatchObject({
		error: { code: "not-actionable" },
	});
	expect(competitor).not.toHaveBeenCalled();
	expect(connection.state).toBe("reserved");
	expect(transport.closeCalls).toBe(0);
	const rejection = new AgentBrowserError("policy-denied", privateText);
	clock.expire();
	gate.reject(rejection);
	await timeout(operation, rejection);
	wiped(candidates);
	wiped(owned.parsed);
	wiped(owned.copies);
	wiped(owned.encoded);
	wiped(owned.trees);
	wiped(owned.payloads);
	wiped(owned.commands);
	wiped(owned.packets);
	wiped(transport.writes);
	wiped(digests);
	unchanged(caller);
	await quarantined(connection, transport);
	expect(sentCommands(transport)).toEqual(commands);
	expect(competitor).not.toHaveBeenCalled();
	expect(clock.timerCallback).not.toHaveBeenCalled();
});
