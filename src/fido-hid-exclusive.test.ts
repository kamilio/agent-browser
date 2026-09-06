import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidCborExchange,
	type FidoHidCborResult,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const request = new Uint8Array([0xa5, 0x5a, 0xc3]);
const privateText = "private exclusive secret a55ac3";
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
type ExchangeOptions = Parameters<FidoHidCborConnection["exchange"]>[1];
type Outcome<Value> = { value: Value } | { error: unknown };

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

function packets(payload = new Uint8Array([0]), command = 0x10) {
	return encodeFidoHidMessage(channel, command, payload, 64);
}

class FakeTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	readonly reads: ReturnType<typeof deferred<Uint8Array>>[] = [];
	readCalls = 0;
	closeCalls = 0;
	onWrite?: (report: Uint8Array) => Promise<number>;
	onRead?: () => Promise<Uint8Array>;
	onClose?: () => Promise<void>;

	write(report: Uint8Array): Promise<number> {
		const owned = new Uint8Array(report);
		this.reports.push(owned);
		return this.onWrite?.(owned) ?? Promise.resolve(owned.length);
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

function create() {
	const transport = new FakeTransport();
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	return { connection, transport };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

function safeError(error: unknown, code?: ErrorCode) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	const safe = error as AgentBrowserError;
	expect(errorCodes).toContain(safe.code);
	if (code !== undefined) expect(safe.code).toBe(code);
	expect(safe.message.length).toBeGreaterThan(0);
	expect(safe.message).not.toMatch(/private|a55ac3|165,90,195/i);
	expect(safe.stack).not.toMatch(/private|a55ac3|165,90,195/i);
	expect(safe.cause).toBeUndefined();
	expect(JSON.stringify(safe)).not.toMatch(/private|a55ac3|165,90,195/i);
	return safe;
}

function rejected<Value>(
	outcome: Outcome<Value> | undefined,
	code?: ErrorCode,
) {
	expect(outcome).toHaveProperty("error");
	return safeError(
		outcome && "error" in outcome ? outcome.error : undefined,
		code,
	);
}

async function fails<Value>(
	observed: ReturnType<typeof observe<Value>>,
	code?: ErrorCode,
) {
	await flush();
	return rejected(observed.outcome, code);
}

async function succeeds<Value>(observed: ReturnType<typeof observe<Value>>) {
	await flush();
	const outcome = observed.outcome;
	expect(outcome).toHaveProperty("value");
	if (!outcome || !("value" in outcome))
		throw new Error("Expected completed exclusive result.");
	return outcome.value;
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
	const action = vi.fn(async () => undefined);
	await fails(observe(connection.exchange(request)), "closed");
	await fails(observe(connection.withExclusiveExchange(action)), "closed");
	expect(action).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(writes);
	expect(transport.readCalls).toBe(reads);
	await connection.close();
	expect(transport.closeCalls).toBe(1);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(async () => {
	const closures = connections.map((connection) => observe(connection.close()));
	for (const settle of pendingCleanup) settle();
	await flush();
	await Promise.all(closures.map((closure) => closure.promise));
	connections.length = 0;
	pendingCleanup.length = 0;
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("reserves synchronously before callback entry and releases a no-I/O result", async () => {
	const { connection, transport } = create();
	const release = deferred(undefined);
	const result = { completed: true };
	const action = vi.fn(async () => {
		expect(connection.state).toBe("reserved");
		await release.promise;
		return result;
	});
	const scope = observe(connection.withExclusiveExchange(action));
	expect(connection.state).toBe("reserved");
	const competing = vi.fn(async () => undefined);
	await fails(observe(connection.exchange(request)), "not-actionable");
	await fails(
		observe(connection.withExclusiveExchange(competing)),
		"not-actionable",
	);
	expect(action).toHaveBeenCalledTimes(1);
	expect(competing).not.toHaveBeenCalled();
	expect(scope.outcome).toBeUndefined();
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	release.resolve(undefined);
	expect(await succeeds(scope)).toBe(result);
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
});

it("keeps sequential exchanges reserved across a paused gap and rejects nested owners", async () => {
	const { connection, transport } = create();
	const release = deferred(undefined);
	const payloads = [0x11, 0x22, 0x33].map(
		(value) => new Uint8Array([0, value]),
	);
	for (const payload of payloads) transport.incoming.push(...packets(payload));
	const nested = vi.fn(async () => undefined);
	const results: FidoHidCborResult[] = [];
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			rejected(
				await observe(connection.withExclusiveExchange(nested)).promise,
				"not-actionable",
			);
			for (const payload of payloads) {
				expect(connection.state).toBe("reserved");
				const pending = exchange(request);
				void pending.catch(() => undefined);
				expect(connection.state).toBe("active");
				const response = await pending;
				expect(response).toEqual({ kind: "response", payload });
				results.push(response);
				expect(connection.state).toBe("reserved");
				if (results.length === 1) await release.promise;
			}
			return results;
		}),
	);
	await flush();
	expect(results).toHaveLength(1);
	expect(connection.state).toBe("reserved");
	expect(connection.keepalive).toBeUndefined();
	await fails(observe(connection.exchange(request)), "not-actionable");
	await fails(
		observe(connection.withExclusiveExchange(nested)),
		"not-actionable",
	);
	expect(nested).not.toHaveBeenCalled();
	expect(transport.reports).toHaveLength(1);
	release.resolve(undefined);
	expect(await succeeds(scope)).toBe(results);
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(3);
	expect(transport.readCalls).toBe(3);
	transport.incoming.push(...packets(), ...packets());
	await succeeds(observe(connection.exchange(request)));
	await succeeds(
		observe(
			connection.withExclusiveExchange(async (exchange) => exchange(request)),
		),
	);
	expect(transport.reports).toHaveLength(5);
	expect(transport.closeCalls).toBe(0);
	await connection.close();
	expect(results).toEqual(
		payloads.map((payload) => ({ kind: "response", payload })),
	);
});

it("does not queue an exclusive callback behind an ordinary active exchange", async () => {
	const { connection, transport } = create();
	const ordinary = observe(connection.exchange(request));
	await flush();
	const action = vi.fn(async () => undefined);
	await fails(
		observe(connection.withExclusiveExchange(action)),
		"not-actionable",
	);
	expect(action).not.toHaveBeenCalled();
	expect(transport.reads).toHaveLength(1);
	transport.reads[0].resolve(packets()[0]);
	await succeeds(ordinary);
	expect(action).not.toHaveBeenCalled();
	await succeeds(observe(connection.withExclusiveExchange(action)));
	expect(action).toHaveBeenCalledTimes(1);
	expect(transport.reports).toHaveLength(1);
});

it("rejects concurrent scoped I/O without surrendering the still-active lease", async () => {
	const { connection, transport } = create();
	let concurrentError: AgentBrowserError | undefined;
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			const first = exchange(request);
			void first.catch(() => undefined);
			concurrentError = rejected(
				await observe(exchange(request)).promise,
				"not-actionable",
			);
			expect(connection.state).toBe("active");
			await first;
			return exchange(request);
		}),
	);
	await flush();
	expect(concurrentError).toBeInstanceOf(AgentBrowserError);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
	transport.incoming.push(...packets(new Uint8Array([0, 0x22])));
	transport.reads[0].resolve(packets()[0]);
	expect(await succeeds(scope)).toEqual({
		kind: "response",
		payload: new Uint8Array([0, 0x22]),
	});
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(2);
	expect(transport.closeCalls).toBe(0);
});

it("allows caught invalid preflight and pre-abort to be corrected without I/O", async () => {
	const { connection, transport } = create();
	const controller = new AbortController();
	controller.abort(new Error(privateText));
	const hostileOptions = Object.defineProperty({}, "timeoutMs", {
		get() {
			throw new Error(privateText);
		},
	});
	const invalid: Array<[Uint8Array, ExchangeOptions, ErrorCode]> = [
		[new Uint8Array(), {}, "invalid-input"],
		[null as unknown as Uint8Array, {}, "invalid-input"],
		[request, { timeoutMs: 0 }, "invalid-input"],
		[request, { maxReports: 0 }, "invalid-input"],
		[request, hostileOptions, "invalid-input"],
		[request, { signal: controller.signal }, "aborted"],
	];
	transport.incoming.push(...packets());
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			for (const [payload, options, code] of invalid) {
				rejected(await observe(exchange(payload, options)).promise, code);
				expect(connection.state).toBe("reserved");
				expect(transport.reports).toHaveLength(0);
				expect(transport.readCalls).toBe(0);
				expect(transport.closeCalls).toBe(0);
			}
			return exchange(request);
		}),
	);
	await succeeds(scope);
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(1);
	expect(transport.closeCalls).toBe(0);
});

it("permanently expires an escaped lease across later reserved and active scopes", async () => {
	const { connection, transport } = create();
	let escaped!: FidoHidCborExchange;
	await succeeds(
		observe(
			connection.withExclusiveExchange(async (exchange) => {
				escaped = exchange;
			}),
		),
	);
	await fails(observe(escaped(request)), "closed");
	expect(connection.state).toBe("idle");
	const release = deferred(undefined);
	const later = observe(
		connection.withExclusiveExchange(async (exchange) => {
			await release.promise;
			return exchange(request);
		}),
	);
	await fails(observe(escaped(request)), "closed");
	expect(connection.state).toBe("reserved");
	expect(transport.reports).toHaveLength(0);
	release.resolve(undefined);
	await flush();
	expect(connection.state).toBe("active");
	await fails(observe(escaped(request)), "closed");
	expect(connection.state).toBe("active");
	expect(transport.reads).toHaveLength(1);
	transport.reads[0].resolve(packets()[0]);
	await succeeds(later);
	await fails(observe(escaped(request)), "closed");
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(1);
	expect(transport.closeCalls).toBe(0);
});

it.each(errorCodes)(
	"preserves callback error code %s but replaces message and cause with fixed errors",
	async (code) => {
		const messages: string[] = [];
		for (const text of [privateText, "private alternate exclusive secret"]) {
			const { connection, transport } = create();
			const original = new AgentBrowserError(code, text);
			Object.defineProperty(original, "cause", {
				value: new Error(text),
			});
			const scope = observe(
				connection.withExclusiveExchange(async () => {
					throw original;
				}),
			);
			const safe = await fails(scope, code);
			expect(safe).not.toBe(original);
			messages.push(safe.message);
			expect(transport.reports).toHaveLength(0);
			await expectQuarantined(connection, transport);
		}
		expect(messages[0]).toBe(messages[1]);
	},
);

it("sanitizes synchronous callback throws before any report is sent", async () => {
	const { connection, transport } = create();
	const scope = observe(
		connection.withExclusiveExchange(() => {
			throw new Error(privateText);
		}),
	);
	await fails(scope);
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	await expectQuarantined(connection, transport);
});

it("redacts hostile thrown values without leaking getters, proxy traps or causes", async () => {
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	const hostileCode = new AgentBrowserError("timeout", privateText);
	Object.defineProperty(hostileCode, "code", {
		get() {
			throw new Error(privateText);
		},
	});
	const thrownValues: unknown[] = [
		new Error(privateText),
		privateText,
		null,
		undefined,
		42,
		Symbol(privateText),
		{ code: privateText, message: privateText, cause: privateText },
		Object.defineProperty({}, "code", {
			get() {
				throw new Error(privateText);
			},
		}),
		Object.defineProperty({}, "message", {
			get() {
				throw new Error(privateText);
			},
		}),
		Object.defineProperty({}, "cause", {
			get() {
				throw new Error(privateText);
			},
		}),
		new Proxy(
			{},
			{
				get() {
					throw new Error(privateText);
				},
			},
		),
		new Proxy(
			{},
			{
				getPrototypeOf() {
					throw new Error(privateText);
				},
			},
		),
		new Proxy(new AgentBrowserError("timeout", privateText), {
			get() {
				throw new Error(privateText);
			},
		}),
		hostileCode,
		revoked.proxy,
		{
			[Symbol.toPrimitive]() {
				throw new Error(privateText);
			},
		},
	];
	const signatures: Array<{ code: ErrorCode; message: string }> = [];
	for (const thrown of thrownValues) {
		const { connection, transport } = create();
		const safe = await fails(
			observe(
				connection.withExclusiveExchange(async () => {
					throw thrown;
				}),
			),
		);
		signatures.push({ code: safe.code, message: safe.message });
		await expectQuarantined(connection, transport);
	}
	for (const signature of signatures) expect(signature).toEqual(signatures[0]);
});

it("preserves a recognized code despite hostile callback message and cause getters", async () => {
	const { connection, transport } = create();
	const original = new AgentBrowserError("policy-denied", privateText);
	for (const name of ["message", "cause"]) {
		Object.defineProperty(original, name, {
			get() {
				throw new Error(privateText);
			},
		});
	}
	await fails(
		observe(
			connection.withExclusiveExchange(async () => {
				throw original;
			}),
		),
		"policy-denied",
	);
	await expectQuarantined(connection, transport);
});

it("quarantines an uncaught local validation failure without writing reports", async () => {
	const { connection, transport } = create();
	await fails(
		observe(
			connection.withExclusiveExchange(async (exchange) => {
				return exchange(new Uint8Array());
			}),
		),
		"invalid-input",
	);
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	await expectQuarantined(connection, transport);
});

it.each(["read", "write"] as const)(
	"quarantines a scoped transport %s failure without automatic retries",
	async (phase) => {
		const { connection, transport } = create();
		const failure = () => Promise.reject(new Error(privateText));
		if (phase === "read") transport.onRead = failure;
		else transport.onWrite = failure;
		await fails(
			observe(
				connection.withExclusiveExchange(async (exchange) => exchange(request)),
			),
			"unsupported",
		);
		expect(transport.reports).toHaveLength(1);
		expect(transport.readCalls).toBe(phase === "read" ? 1 : 0);
		await expectQuarantined(connection, transport);
	},
);

it("cannot convert a caught transport failure into successful scope completion", async () => {
	const { connection, transport } = create();
	transport.onRead = () => Promise.reject(new Error(privateText));
	await fails(
		observe(
			connection.withExclusiveExchange(async (exchange) => {
				rejected(await observe(exchange(request)).promise, "unsupported");
				return "not a successful scope";
			}),
		),
		"closed",
	);
	await expectQuarantined(connection, transport);
});

it("forwards a scoped exchange deadline and rejects before its pending read drains", async () => {
	const { connection, transport } = create();
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			return exchange(request, { timeoutMs: 10 });
		}),
	);
	await flush();
	expect(transport.reads).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(10);
	await fails(scope, "timeout");
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
});

it("returns terminal HID error results without choosing protocol continuation policy", async () => {
	const { connection, transport } = create();
	transport.incoming.push(
		...packets(new Uint8Array([0x06]), 0x3f),
		...packets(),
	);
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			const first = await exchange(request);
			expect(first).toMatchObject({ kind: "error", code: 0x06 });
			expect(connection.state).toBe("reserved");
			return exchange(request);
		}),
	);
	expect(await succeeds(scope)).toEqual({
		kind: "response",
		payload: new Uint8Array([0]),
	});
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(2);
	expect(transport.closeCalls).toBe(0);
});

it("preserves fulfilled caller-owned payloads when a later callback fails", async () => {
	const { connection, transport } = create();
	const payload = new Uint8Array([0, 0xde, 0xad]);
	transport.incoming.push(...packets(payload));
	let response: FidoHidCborResult | undefined;
	let escaped!: FidoHidCborExchange;
	await fails(
		observe(
			connection.withExclusiveExchange(async (exchange) => {
				escaped = exchange;
				response = await exchange(request);
				throw new AgentBrowserError("aborted", privateText);
			}),
		),
		"aborted",
	);
	await expectQuarantined(connection, transport);
	expect(response).toEqual({ kind: "response", payload });
	await fails(observe(escaped(request)), "closed");
	expect(transport.reports).toHaveLength(1);
});

it("rejects a callback returning after external close even while transport close hangs", async () => {
	const { connection, transport } = create();
	const release = deferred(undefined);
	const closeGate = deferred(undefined);
	transport.onClose = () => closeGate.promise;
	let escaped!: FidoHidCborExchange;
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			escaped = exchange;
			await release.promise;
			return "late callback result";
		}),
	);
	await flush();
	const closing = observe(connection.close());
	await flush();
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	await fails(observe(escaped(request)), "closed");
	release.resolve(undefined);
	await fails(scope, "closed");
	expect(closing.outcome).toBeUndefined();
	expect(transport.reports).toHaveLength(0);
	closeGate.resolve(undefined);
	await succeeds(closing);
	await expectQuarantined(connection, transport);
});

it("rejects late scope success after external close cancels an active read", async () => {
	const { connection, transport } = create();
	const release = deferred(undefined);
	let caught: AgentBrowserError | undefined;
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			caught = rejected(await observe(exchange(request)).promise, "closed");
			await release.promise;
			return "late successful callback";
		}),
	);
	await flush();
	expect(transport.reads).toHaveLength(1);
	const closing = observe(connection.close());
	await flush();
	expect(caught).toBeInstanceOf(AgentBrowserError);
	release.resolve(undefined);
	await fails(scope, "closed");
	expect(connection.state).toBe("closing");
	expect(closing.outcome).toBeUndefined();
	transport.reads[0].resolve(packets()[0]);
	await succeeds(closing);
	await expectQuarantined(connection, transport);
	expect(transport.reports).toHaveLength(1);
	expect(transport.readCalls).toBe(1);
});

it("rejects callback failure without awaiting hanging native close and closes only once", async () => {
	const { connection, transport } = create();
	const closeGate = deferred(undefined);
	transport.onClose = () => closeGate.promise;
	const scope = observe(
		connection.withExclusiveExchange(async () => {
			throw new AgentBrowserError("timeout", privateText);
		}),
	);
	await fails(scope, "timeout");
	expect(connection.state).toBe("closing");
	expect(transport.closeCalls).toBe(1);
	const firstClose = connection.close();
	const secondClose = connection.close();
	expect(secondClose).toBe(firstClose);
	const closing = observe(firstClose);
	await flush();
	expect(closing.outcome).toBeUndefined();
	await fails(observe(connection.exchange(request)), "closed");
	closeGate.resolve(undefined);
	await succeeds(closing);
	await expectQuarantined(connection, transport);
});

it.each(["read", "write"] as const)(
	"quarantines callback completion that abandons a pending scoped %s",
	async (phase) => {
		const { connection, transport } = create();
		const completeCallback = deferred(undefined);
		const pendingWrite = deferred(64);
		if (phase === "write") transport.onWrite = () => pendingWrite.promise;
		let ignored!: ReturnType<typeof observe<FidoHidCborResult>>;
		let escaped!: FidoHidCborExchange;
		const scope = observe(
			connection.withExclusiveExchange(async (exchange) => {
				escaped = exchange;
				ignored = observe(exchange(request));
				await completeCallback.promise;
				return "abandoned exchange";
			}),
		);
		await flush();
		expect(connection.state).toBe("active");
		expect(ignored.outcome).toBeUndefined();
		expect(transport.reports).toHaveLength(1);
		completeCallback.resolve(undefined);
		await fails(scope);
		await fails(ignored, "closed");
		expect(connection.state).toBe("closing");
		expect(transport.closeCalls).toBe(1);
		await fails(observe(escaped(request)), "closed");
		const closing = observe(connection.close());
		expect(closing.outcome).toBeUndefined();
		if (phase === "write") pendingWrite.resolve(64);
		else transport.reads[0].resolve(packets()[0]);
		await succeeds(closing);
		await expectQuarantined(connection, transport);
		expect(transport.reports).toHaveLength(1);
		expect(transport.readCalls).toBe(phase === "read" ? 1 : 0);
	},
);

it("preserves callback failure when it also abandons an active scoped exchange", async () => {
	const { connection, transport } = create();
	const completeCallback = deferred(undefined);
	let ignored!: ReturnType<typeof observe<FidoHidCborResult>>;
	const scope = observe(
		connection.withExclusiveExchange(async (exchange) => {
			ignored = observe(exchange(request));
			await completeCallback.promise;
			throw new AgentBrowserError("policy-denied", privateText);
		}),
	);
	await flush();
	completeCallback.resolve(undefined);
	await fails(scope, "policy-denied");
	await fails(ignored, "closed");
	expect(transport.closeCalls).toBe(1);
	transport.reads[0].resolve(packets()[0]);
	await expectQuarantined(connection, transport);
});

it("keeps scope rejection redacted when native close itself rejects", async () => {
	const { connection, transport } = create();
	transport.onClose = () => Promise.reject(new Error(privateText));
	await fails(
		observe(
			connection.withExclusiveExchange(async () => {
				throw new AgentBrowserError("aborted", privateText);
			}),
		),
		"aborted",
	);
	expect(connection.state).toBe("close-failed");
	await fails(observe(connection.close()), "unsupported");
	await fails(observe(connection.exchange(request)), "closed");
	const action = vi.fn(async () => undefined);
	await fails(observe(connection.withExclusiveExchange(action)), "closed");
	expect(action).not.toHaveBeenCalled();
	expect(transport.closeCalls).toBe(1);
});

it("does not invent an overall scope timeout or prevent external lifecycle closure", async () => {
	const { connection, transport } = create();
	const release = deferred(undefined);
	const scope = observe(
		connection.withExclusiveExchange(async () => {
			await release.promise;
			return "caller-controlled completion";
		}),
	);
	await vi.advanceTimersByTimeAsync(600_001);
	expect(scope.outcome).toBeUndefined();
	expect(connection.state).toBe("reserved");
	expect(transport.closeCalls).toBe(0);
	await connection.close();
	release.resolve(undefined);
	await fails(scope, "closed");
	await expectQuarantined(connection, transport);
});

it.each(["getter", "method"])(
	"quarantines internally without invoking an instance close %s override",
	async (shape) => {
		const { connection, transport } = create();
		const hook = vi.fn(() => {
			throw new Error(privateText);
		});
		Object.defineProperty(connection, "close", {
			configurable: true,
			...(shape === "getter" ? { get: hook } : { value: hook }),
		});
		try {
			await fails(
				observe(
					connection.withExclusiveExchange(() => {
						throw new Error(privateText);
					}),
				),
				"unsupported",
			);
			expect(hook).not.toHaveBeenCalled();
		} finally {
			Reflect.deleteProperty(connection, "close");
		}
		await expectQuarantined(connection, transport);
	},
);
