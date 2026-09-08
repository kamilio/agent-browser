import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { PagePasskeys } from "./page-passkeys.js";
import {
	type PasskeyAssertion,
	type PasskeyAssertionCredential,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyCreationCredential,
	type PasskeyCreationOptions,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
} from "./passkeys.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

const privateDetail = "synthetic-private-provider-exception";
const ceremonyTimeout = 100;
const operations = ["create", "get"] as const;
type Operation = (typeof operations)[number];
const proxyKinds = ["throwing", "revoked", "prototype-chain"] as const;
type ProxyKind = (typeof proxyKinds)[number];
const counterfeitKinds = [
	"prototype-data",
	"prototype-getters",
	"captured-constructor",
	"genuine-data",
	"genuine-getters",
] as const;
type CounterfeitKind = (typeof counterfeitKinds)[number];
const brokers: PasskeyBroker[] = [];
const owners: PagePasskeys[] = [];
const trees: DocumentTree[] = [];
const releases: (() => void)[] = [];
const fixedMessages = {
	TypeError: "Invalid passkey options",
	UnknownError: "Passkey authenticator failed",
	AbortError: "Passkey ceremony was aborted",
};

beforeEach(() => {
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"performance",
		],
	});
	vi.spyOn(crypto.subtle, "digest").mockImplementation(
		async () => new ArrayBuffer(32),
	);
});

afterEach(async () => {
	for (const owner of owners.splice(0)) owner.close();
	for (const broker of brokers.splice(0)) broker.close();
	for (const tree of trees.splice(0)) tree.close();
	for (const release of releases.splice(0)) release();
	await vi.advanceTimersByTimeAsync(0);
	expect(vi.getTimerCount()).toBe(0);
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function creation(): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([1]),
			name: "synthetic",
			displayName: "Synthetic user",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		timeout: ceremonyTimeout,
	};
}

function request(): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
		timeout: ceremonyTimeout,
	};
}

function registration(): PasskeyRegistration {
	return {
		credentialId: new Uint8Array([7, 8]),
		attestationObject: new Uint8Array([0xa0]),
		userConsented: true,
		userPresent: true,
		userVerified: false,
		residentKey: false,
		algorithm: -7,
	};
}

function assertion(): PasskeyAssertion {
	const authenticatorData = new Uint8Array(37);
	authenticatorData[32] = 1;
	return {
		credentialId: new Uint8Array([7, 8]),
		authenticatorData,
		signature: new Uint8Array([9]),
		userHandle: null,
		userConsented: true,
		userPresent: true,
		userVerified: false,
	};
}

function context(signal?: AbortSignal): PasskeyContext {
	return {
		origin: "https://login.fixture.invalid",
		topLevel: true,
		isCurrent: () => true,
		...(signal ? { signal } : {}),
	};
}

function callerFixture() {
	const controller = new AbortController();
	return {
		controller,
		context: context(controller.signal),
		add: vi.spyOn(controller.signal, "addEventListener"),
		remove: vi.spyOn(controller.signal, "removeEventListener"),
	};
}

function expectCallerReleased(caller: ReturnType<typeof callerFixture>) {
	expect(caller.add).toHaveBeenCalledTimes(1);
	expect(caller.add).toHaveBeenCalledWith("abort", expect.any(Function), {
		once: true,
	});
	expect(caller.remove).toHaveBeenCalledTimes(1);
	expect(caller.remove).toHaveBeenCalledWith(
		"abort",
		caller.add.mock.calls[0]?.[1],
	);
}

function fixture() {
	const create =
		vi.fn<(input: Parameters<PasskeyAuthenticator["create"]>[0]) => void>();
	const get =
		vi.fn<(input: Parameters<PasskeyAuthenticator["get"]>[0]) => void>();
	const createActions: PasskeyAuthenticator["create"][] = [];
	const getActions: PasskeyAuthenticator["get"][] = [];
	const provider: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		create(input) {
			create(input);
			const action = createActions.shift();
			return action ? action(input) : Promise.resolve(registration());
		},
		get(input) {
			get(input);
			const action = getActions.shift();
			return action ? action(input) : Promise.resolve(assertion());
		},
	};
	const broker = new PasskeyBroker(provider);
	brokers.push(broker);
	return { broker, provider, create, get, createActions, getActions };
}

type Fixture = ReturnType<typeof fixture>;

function invoke(
	broker: PasskeyBroker,
	operation: Operation,
	trusted = context(),
): Promise<PasskeyCreationCredential | PasskeyAssertionCredential> {
	return operation === "create"
		? broker.create(creation(), trusted)
		: broker.get(request(), trusted);
}

function signalFor(current: Fixture, operation: Operation, index: number) {
	const calls =
		operation === "create" ? current.create.mock.calls : current.get.mock.calls;
	const input = calls[index]?.[0];
	if (!input) throw new Error("Expected a synthetic provider call");
	return input.signal;
}

function rejectOnce(
	current: Fixture,
	operation: Operation,
	value: unknown,
	synchronous = false,
) {
	const reject = () => {
		if (synchronous) throw value;
		return Promise.reject(value);
	};
	if (operation === "create") current.createActions.push(reject);
	else current.getActions.push(reject);
}

function observe<Value>(promise: Promise<Value>) {
	let settlements = 0;
	const result = promise.then(
		(value) => {
			settlements++;
			return { status: "fulfilled" as const, value };
		},
		(error: unknown) => {
			settlements++;
			return { status: "rejected" as const, error };
		},
	);
	return {
		result,
		get settlements() {
			return settlements;
		},
	};
}

async function promptly<Value>(observed: ReturnType<typeof observe<Value>>) {
	const started = performance.now();
	await vi.advanceTimersByTimeAsync(0);
	expect(performance.now()).toBe(started);
	expect(observed.settlements).toBe(1);
	return observed.result;
}

async function rejected<Value>(observed: ReturnType<typeof observe<Value>>) {
	const result = await promptly(observed);
	expect(result.status).toBe("rejected");
	if (result.status !== "rejected")
		throw new Error("Expected a synthetic broker rejection");
	return result;
}

function expectFixed(error: unknown, name: keyof typeof fixedMessages) {
	expect(error).toBeInstanceOf(Error);
	expect(error).toMatchObject({ name, message: fixedMessages[name] });
	expect(Object.hasOwn(error as object, "cause")).toBe(false);
	expect(Object.hasOwn(error as object, "then")).toBe(false);
	expect((error as Error).stack).not.toContain(privateDetail);
}

async function issuedError(current: Fixture) {
	const result = await rejected(
		observe(
			current.broker.create(
				{ ...creation(), challenge: new Uint8Array() },
				context(),
			),
		),
	);
	expectFixed(result.error, "TypeError");
	expect(current.create).not.toHaveBeenCalled();
	expect(current.get).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	return { error: result.error as Error };
}

async function expectReuse(current: Fixture, operation: Operation, count = 2) {
	const result = await promptly(observe(invoke(current.broker, operation)));
	expect(result.status).toBe("fulfilled");
	if (result.status !== "fulfilled")
		throw new Error("Expected immediate synthetic broker reuse");
	expect(result.value).toMatchObject({ id: "Bwg", type: "public-key" });
	expect(
		operation === "create" ? current.create : current.get,
	).toHaveBeenCalledTimes(count);
	expect(signalFor(current, operation, count - 1).aborted).toBe(false);
	expect(vi.getTimerCount()).toBe(0);
}

function hostileProxy(kind: ProxyKind) {
	const inspect = vi.fn(() => {
		throw new Error(privateDetail);
	});
	const wrapped = Proxy.revocable(
		{},
		{
			get: inspect,
			getPrototypeOf: inspect,
			getOwnPropertyDescriptor: inspect,
			ownKeys: inspect,
			has: inspect,
		},
	);
	if (kind === "revoked") wrapped.revoke();
	return {
		value:
			kind === "prototype-chain" ? Object.create(wrapped.proxy) : wrapped.proxy,
		inspect,
	};
}

function counterfeit(original: Error, kind: CounterfeitKind) {
	const prototype = Object.getPrototypeOf(original);
	let value: object;
	if (kind === "captured-constructor") {
		const Constructor = Object.getOwnPropertyDescriptor(
			prototype,
			"constructor",
		)?.value as new (
			name: string,
		) => Error;
		value = new Constructor("InvalidStateError");
	} else if (kind === "genuine-data" || kind === "genuine-getters") {
		value = original;
	} else value = Object.create(prototype);
	const read = vi.fn(() => {
		throw new Error(privateDetail);
	});
	const getters = kind === "prototype-getters" || kind === "genuine-getters";
	const names = ["stack", "name", "message", "cause"];
	if (getters) names.push("then");
	for (const name of names) {
		Object.defineProperty(
			value,
			name,
			getters
				? { get: read, configurable: name !== "then" }
				: {
						value: name === "name" ? "InvalidStateError" : privateDetail,
						configurable: true,
					},
		);
	}
	return { value, read };
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, deny) => {
		resolve = accept;
		reject = deny;
	});
	return { promise, resolve, reject };
}

function hostFactory(): ScriptHostObjectFactory {
	return {
		createHostObject(definition: ScriptHostObjectDefinition): object {
			const capability = Object.assign(Object.create(null), definition.methods);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			)) {
				Object.defineProperty(capability, name, {
					get: descriptor.get,
					enumerable: true,
				});
			}
			return capability;
		},
	};
}

describe("synthetic provider exception identity boundary", () => {
	it.each(
		operations.flatMap((operation) =>
			proxyKinds.map((kind) => ({ operation, kind })),
		),
	)(
		"settles $operation with a $kind proxy without inspection or timeout",
		async ({ operation, kind }) => {
			const current = fixture();
			const caller = callerFixture();
			const hostile = hostileProxy(kind);
			rejectOnce(current, operation, hostile.value, kind === "throwing");
			const result = await rejected(
				observe(invoke(current.broker, operation, caller.context)),
			);
			expect(result.error === hostile.value).toBe(false);
			expect(hostile.inspect).not.toHaveBeenCalled();
			expectFixed(result.error, "UnknownError");
			expect(signalFor(current, operation, 0).aborted).toBe(true);
			expectCallerReleased(caller);
			expect(vi.getTimerCount()).toBe(0);
			await expectReuse(current, operation);
			expect(hostile.inspect).not.toHaveBeenCalled();
		},
	);

	it.each(
		operations.flatMap((operation) =>
			counterfeitKinds.map((kind) => ({ operation, kind })),
		),
	)(
		"reconstructs fixed $operation errors for $kind without trusting public fields",
		async ({ operation, kind }) => {
			const current = fixture();
			const issued = await issuedError(current);
			const forged = counterfeit(issued.error, kind);
			const caller = callerFixture();
			rejectOnce(current, operation, forged.value);
			const result = await rejected(
				observe(invoke(current.broker, operation, caller.context)),
			);
			expect(result.error === forged.value).toBe(false);
			expect(result.error === issued.error).toBe(false);
			expect(forged.read).not.toHaveBeenCalled();
			expectFixed(
				result.error,
				kind === "genuine-data" || kind === "genuine-getters"
					? "TypeError"
					: "UnknownError",
			);
			expect(signalFor(current, operation, 0).aborted).toBe(true);
			expectCallerReleased(caller);
			expect(vi.getTimerCount()).toBe(0);
			await expectReuse(current, operation);
			expect(forged.read).not.toHaveBeenCalled();
		},
	);

	it("ignores a late hostile rejection after cancellation without disturbing the next ceremony", async () => {
		const current = fixture();
		const caller = callerFixture();
		const first = deferred<PasskeyRegistration>();
		const second = deferred<PasskeyAssertion>();
		const hostile = hostileProxy("throwing");
		releases.push(() => first.reject(new Error("Synthetic cleanup")));
		releases.push(() => second.resolve(assertion()));
		current.createActions.push(() => first.promise);
		current.getActions.push(() => second.promise);
		const cancelled = observe(invoke(current.broker, "create", caller.context));
		await vi.advanceTimersByTimeAsync(0);
		expect(current.create).toHaveBeenCalledTimes(1);
		expect(cancelled.settlements).toBe(0);
		caller.controller.abort();
		const cancellation = await rejected(cancelled);
		expectFixed(cancellation.error, "AbortError");
		expect(signalFor(current, "create", 0).aborted).toBe(true);
		expectCallerReleased(caller);
		expect(vi.getTimerCount()).toBe(0);
		const nextCaller = callerFixture();
		const next = observe(invoke(current.broker, "get", nextCaller.context));
		await vi.advanceTimersByTimeAsync(0);
		expect(current.get).toHaveBeenCalledTimes(1);
		expect(next.settlements).toBe(0);
		expect(signalFor(current, "get", 0).aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(2);
		first.reject(hostile.value);
		await vi.advanceTimersByTimeAsync(0);
		expect(hostile.inspect).not.toHaveBeenCalled();
		expect(cancelled.settlements).toBe(1);
		expectFixed(cancellation.error, "AbortError");
		expect(next.settlements).toBe(0);
		expect(signalFor(current, "get", 0).aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(2);
		second.resolve(assertion());
		const result = await promptly(next);
		expect(result.status).toBe("fulfilled");
		if (result.status !== "fulfilled")
			throw new Error("Expected the next ceremony to succeed");
		expect(result.value).toMatchObject({ id: "Bwg", type: "public-key" });
		expectCallerReleased(nextCaller);
		expect(vi.getTimerCount()).toBe(0);
		expect(hostile.inspect).not.toHaveBeenCalled();
	});

	it("maps an initial descriptor trap's hostile throw to fixed TypeError and releases starting", async () => {
		const current = fixture();
		const caller = callerFixture();
		const hostile = hostileProxy("throwing");
		const descriptor = vi.fn();
		const options = new Proxy(creation(), {
			getOwnPropertyDescriptor(target, name) {
				descriptor(target, name);
				throw hostile.value;
			},
		});
		const result = await rejected(
			observe(current.broker.create(options, caller.context)),
		);
		expect(result.error === hostile.value).toBe(false);
		expect(descriptor).toHaveBeenCalledTimes(1);
		expect(hostile.inspect).not.toHaveBeenCalled();
		expectFixed(result.error, "TypeError");
		expect(current.create).not.toHaveBeenCalled();
		expect(current.get).not.toHaveBeenCalled();
		expect(caller.add).not.toHaveBeenCalled();
		expect(caller.remove).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		await expectReuse(current, "create", 1);
		expect(hostile.inspect).not.toHaveBeenCalled();
	});

	it("sanitizes a provider result getter's hostile rejection without inspecting the thrown value", async () => {
		const current = fixture();
		const caller = callerFixture();
		const hostile = hostileProxy("revoked");
		const read = vi.fn();
		const output = registration();
		Object.defineProperty(output, "userConsented", {
			get() {
				read();
				throw hostile.value;
			},
		});
		current.createActions.push(async () => output);
		const result = await rejected(
			observe(invoke(current.broker, "create", caller.context)),
		);
		expect(result.error === hostile.value).toBe(false);
		expect(read).toHaveBeenCalledTimes(1);
		expect(hostile.inspect).not.toHaveBeenCalled();
		expectFixed(result.error, "UnknownError");
		expect(signalFor(current, "create", 0).aborted).toBe(true);
		expectCallerReleased(caller);
		expect(vi.getTimerCount()).toBe(0);
		await expectReuse(current, "create");
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("propagates only fresh fixed broker errors through the native PagePasskeys capability", async () => {
		const current = fixture();
		const issued = await issuedError(current);
		const forged = counterfeit(issued.error, "prototype-getters");
		const tree = new DocumentTree("https://login.fixture.invalid/");
		trees.push(tree);
		const owner = new PagePasskeys(tree, hostFactory(), current.provider, {
			topLevel: true,
			isCurrent: () => true,
		});
		owners.push(owner);
		const credentials = owner.credentials as {
			create(options: unknown): Promise<object>;
		};
		rejectOnce(current, "create", forged.value);
		const result = await rejected(
			observe(credentials.create({ publicKey: creation() })),
		);
		expect(result.error === forged.value).toBe(false);
		expect(forged.read).not.toHaveBeenCalled();
		expectFixed(result.error, "UnknownError");
		expect(signalFor(current, "create", 0).aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		const reused = await promptly(
			observe(credentials.create({ publicKey: creation() })),
		);
		expect(reused.status).toBe("fulfilled");
		if (reused.status !== "fulfilled")
			throw new Error("Expected native page capability reuse");
		expect(reused.value).toMatchObject({ id: "Bwg", type: "public-key" });
		expect(current.create).toHaveBeenCalledTimes(2);
		expect(signalFor(current, "create", 1).aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		expect(forged.read).not.toHaveBeenCalled();
	});
});
