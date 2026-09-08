import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	consumeConsentedPasskeyExclusionError,
	createConsentedPasskeyExclusionError,
} from "./passkey-exclusion-error.js";
import {
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
} from "./passkeys.js";

const providerMessage = "Ephemeral authenticator operation denied";
const privateDetail = "synthetic-private-provider-detail";
const ceremonyTimeout = 100;
const brokers: PasskeyBroker[] = [];

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
	vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(32));
});

afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, deny) => {
		resolve = accept;
		reject = deny;
	});
	return { promise, resolve, reject };
}

function observeRejection<Value>(promise: Promise<Value>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error("Expected synthetic provider-contract rejection");
		},
		(error: unknown) => error,
	);
}

function context(): PasskeyContext {
	return {
		origin: "https://login.fixture.invalid",
		topLevel: true,
		isCurrent: () => true,
	};
}

function creation(): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([11, 22]),
			name: "synthetic",
			displayName: "Synthetic account",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		timeout: ceremonyTimeout,
	};
}

function syntheticBroker(
	perform: (request: PasskeyProviderContext) => Promise<never>,
) {
	const provider: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: true,
			attachment: "platform",
		},
		create: vi.fn<PasskeyAuthenticator["create"]>((request) =>
			perform(request),
		),
		get: vi.fn<PasskeyAuthenticator["get"]>((request) => perform(request)),
	};
	const broker = new PasskeyBroker(provider);
	brokers.push(broker);
	return { broker, provider };
}

function expectBrokerError(error: unknown, name: string, message: string) {
	expect(error).toBeInstanceOf(Error);
	expect(error).toMatchObject({ name, message });
	expect(Object.hasOwn(error as object, "cause")).toBe(false);
	expect(Object.hasOwn(error as object, "signal")).toBe(false);
	expect((error as Error).stack).not.toContain(privateDetail);
}

function expectRedacted(error: unknown) {
	expectBrokerError(error, "UnknownError", "Passkey authenticator failed");
}

function hostileGetters(value: object = {}) {
	const read = vi.fn(() => {
		throw new Error(privateDetail);
	});
	for (const property of [
		"name",
		"message",
		"stack",
		"cause",
		"signal",
		"consented",
		"userConsented",
	]) {
		Object.defineProperty(value, property, { get: read });
	}
	return { value, read };
}

const spoofs: {
	label: string;
	make: (original: Error, signal: AbortSignal) => unknown;
}[] = [
	{
		label: "copied descriptors",
		make: (original) =>
			Object.defineProperties(
				new Error(),
				Object.getOwnPropertyDescriptors(original),
			),
	},
	{ label: "spread properties", make: (original) => ({ ...original }) },
	{
		label: "error name",
		make: () =>
			Object.assign(new Error(providerMessage), { name: "InvalidStateError" }),
	},
	{
		label: "consent properties",
		make: (_original, signal) => ({
			name: "InvalidStateError",
			message: providerMessage,
			signal,
			consented: true,
			userConsented: true,
		}),
	},
	{ label: "branded prototype", make: (original) => Object.create(original) },
	{
		label: "matching error prototype",
		make: (original) =>
			Object.create(
				Object.getPrototypeOf(original),
				Object.getOwnPropertyDescriptors(original),
			),
	},
];

describe("consent-qualified exclusion identity contract", () => {
	it("creates fixed-field errors with independent unique identities", () => {
		const { signal } = new AbortController();
		const first = createConsentedPasskeyExclusionError(signal);
		const second = createConsentedPasskeyExclusionError(signal);
		for (const error of [first, second]) {
			expect(error).toBeInstanceOf(Error);
			expect(error).toMatchObject({
				name: "InvalidStateError",
				message: providerMessage,
			});
			expect(Object.hasOwn(error, "cause")).toBe(false);
			expect(Object.hasOwn(error, "signal")).toBe(false);
			expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(true);
		}
		expect(first).not.toBe(second);
	});

	it("accepts an original identity for its exact signal only once", () => {
		const { signal } = new AbortController();
		const error = createConsentedPasskeyExclusionError(signal);
		expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(true);
		expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(false);
	});

	it("does not consume an identity presented with a different signal", () => {
		const { signal } = new AbortController();
		const other = new AbortController();
		const error = createConsentedPasskeyExclusionError(signal);
		expect(consumeConsentedPasskeyExclusionError(error, other.signal)).toBe(
			false,
		);
		expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(true);
	});

	it("recognizes a branded identity without reading its hostile fields", () => {
		const { signal } = new AbortController();
		const error = createConsentedPasskeyExclusionError(signal);
		const hostile = hostileGetters(error);
		expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(true);
		expect(hostile.read).not.toHaveBeenCalled();
	});

	it.each(spoofs)(
		"rejects $label without consuming the original",
		({ make }) => {
			const { signal } = new AbortController();
			const error = createConsentedPasskeyExclusionError(signal);
			expect(
				consumeConsentedPasskeyExclusionError(make(error, signal), signal),
			).toBe(false);
			expect(consumeConsentedPasskeyExclusionError(error, signal)).toBe(true);
		},
	);

	it.each([undefined, null, privateDetail, 42])(
		"rejects unbranded primitive %s",
		(value) => {
			const { signal } = new AbortController();
			expect(consumeConsentedPasskeyExclusionError(value, signal)).toBe(false);
		},
	);

	it("rejects hostile getter objects without inspecting their fields", () => {
		const { signal } = new AbortController();
		const hostile = hostileGetters();
		expect(consumeConsentedPasskeyExclusionError(hostile.value, signal)).toBe(
			false,
		);
		expect(hostile.read).not.toHaveBeenCalled();
	});

	it.each(["unbranded", "branded", "revoked"])(
		"rejects a %s proxy without invoking any inspection traps",
		(kind) => {
			const { signal } = new AbortController();
			const original = createConsentedPasskeyExclusionError(signal);
			const inspect = vi.fn(() => {
				throw new Error(privateDetail);
			});
			const wrapped = Proxy.revocable(kind === "unbranded" ? {} : original, {
				get: inspect,
				getPrototypeOf: inspect,
				getOwnPropertyDescriptor: inspect,
				ownKeys: inspect,
				has: inspect,
			});
			if (kind === "revoked") wrapped.revoke();
			expect(consumeConsentedPasskeyExclusionError(wrapped.proxy, signal)).toBe(
				false,
			);
			expect(inspect).not.toHaveBeenCalled();
			expect(consumeConsentedPasskeyExclusionError(original, signal)).toBe(
				true,
			);
		},
	);
});

describe("synthetic provider-contract broker exclusion mapping", () => {
	it("promotes only the active create identity to a fresh fixed broker error", async () => {
		let original!: Error;
		let providerSignal!: AbortSignal;
		const { broker, provider } = syntheticBroker(async ({ signal }) => {
			providerSignal = signal;
			original = createConsentedPasskeyExclusionError(signal);
			Object.assign(original, {
				name: privateDetail,
				message: privateDetail,
				stack: privateDetail,
				cause: privateDetail,
				signal,
			});
			throw original;
		});
		const error = await observeRejection(broker.create(creation(), context()));
		expectBrokerError(
			error,
			"InvalidStateError",
			"Passkey broker is unavailable",
		);
		expect(error).not.toBe(original);
		expect(
			consumeConsentedPasskeyExclusionError(original, providerSignal),
		).toBe(false);
		expect(provider.create).toHaveBeenCalledTimes(1);
		expect(provider.get).not.toHaveBeenCalled();
	});

	it("redacts an identity bound to the caller signal rather than the provider signal", async () => {
		const caller = new AbortController();
		const original = createConsentedPasskeyExclusionError(caller.signal);
		let providerSignal!: AbortSignal;
		const { broker } = syntheticBroker(async ({ signal }) => {
			providerSignal = signal;
			throw original;
		});
		const error = await observeRejection(
			broker.create(creation(), { ...context(), signal: caller.signal }),
		);
		expect(providerSignal).not.toBe(caller.signal);
		expectRedacted(error);
		expect(consumeConsentedPasskeyExclusionError(original, caller.signal)).toBe(
			true,
		);
	});

	it("redacts an assertion identity without consuming it", async () => {
		let original!: Error;
		let providerSignal!: AbortSignal;
		const { broker, provider } = syntheticBroker(async ({ signal }) => {
			providerSignal = signal;
			original = createConsentedPasskeyExclusionError(signal);
			throw original;
		});
		const error = await observeRejection(
			broker.get(
				{ challenge: new Uint8Array([1]), timeout: ceremonyTimeout },
				context(),
			),
		);
		expectRedacted(error);
		expect(
			consumeConsentedPasskeyExclusionError(original, providerSignal),
		).toBe(true);
		expect(provider.get).toHaveBeenCalledTimes(1);
		expect(provider.create).not.toHaveBeenCalled();
	});

	it("redacts an already consumed identity even for the same provider signal", async () => {
		let consumed: boolean | undefined;
		const { broker } = syntheticBroker(async ({ signal }) => {
			const original = createConsentedPasskeyExclusionError(signal);
			consumed = consumeConsentedPasskeyExclusionError(original, signal);
			throw original;
		});
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expect(consumed).toBe(true);
	});

	it.each(spoofs)("redacts a provider's $label", async ({ make }) => {
		let original!: Error;
		let providerSignal!: AbortSignal;
		const { broker } = syntheticBroker(async ({ signal }) => {
			providerSignal = signal;
			original = createConsentedPasskeyExclusionError(signal);
			throw make(original, signal);
		});
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expect(
			consumeConsentedPasskeyExclusionError(original, providerSignal),
		).toBe(true);
	});

	it("redacts ordinary provider rejection details", async () => {
		const original = Object.assign(new Error(privateDetail), {
			cause: privateDetail,
			stack: privateDetail,
		});
		const { broker } = syntheticBroker(async () => {
			throw original;
		});
		const error = await observeRejection(broker.create(creation(), context()));
		expectRedacted(error);
		expect(error).not.toBe(original);
	});

	it("redacts hostile provider getters without reading their fields", async () => {
		const hostile = hostileGetters();
		const { broker } = syntheticBroker(async () => {
			throw hostile.value;
		});
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expect(hostile.read).not.toHaveBeenCalled();
	});

	it("does not replay a promoted identity into a later create ceremony", async () => {
		let original: Error | undefined;
		const signals: AbortSignal[] = [];
		const { broker } = syntheticBroker(async ({ signal }) => {
			signals.push(signal);
			original ??= createConsentedPasskeyExclusionError(signal);
			throw original;
		});
		expectBrokerError(
			await observeRejection(broker.create(creation(), context())),
			"InvalidStateError",
			"Passkey broker is unavailable",
		);
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expect(signals).toHaveLength(2);
		expect(signals[0]).not.toBe(signals[1]);
	});

	it("does not promote an unconsumed identity from an earlier ceremony", async () => {
		let original: Error | undefined;
		let originalSignal!: AbortSignal;
		let laterSignal!: AbortSignal;
		const { broker } = syntheticBroker(async ({ signal }) => {
			if (!original) {
				originalSignal = signal;
				original = createConsentedPasskeyExclusionError(signal);
				throw new Error(privateDetail);
			}
			laterSignal = signal;
			throw original;
		});
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expectRedacted(
			await observeRejection(broker.create(creation(), context())),
		);
		expect(laterSignal).not.toBe(originalSignal);
		expect(
			consumeConsentedPasskeyExclusionError(original, originalSignal),
		).toBe(true);
	});

	it.each([
		{ action: "abort", timing: "before rejection", name: "AbortError" },
		{ action: "abort", timing: "after rejection", name: "AbortError" },
		{ action: "timeout", timing: "before rejection", name: "NotAllowedError" },
		{ action: "timeout", timing: "after rejection", name: "NotAllowedError" },
		{ action: "close", timing: "before rejection", name: "AbortError" },
		{ action: "close", timing: "after rejection", name: "AbortError" },
		{
			action: "stale document",
			timing: "before rejection",
			name: "AbortError",
		},
		{ action: "stale document", timing: "after rejection", name: "AbortError" },
	])(
		"lets $action win $timing without consuming the identity",
		async ({ action, timing, name }) => {
			const entered = deferred<PasskeyProviderContext>();
			const decision = deferred<never>();
			const caller = new AbortController();
			let current = true;
			const { broker } = syntheticBroker((request) => {
				entered.resolve(request);
				return decision.promise;
			});
			const pending = observeRejection(
				broker.create(creation(), {
					...context(),
					signal: caller.signal,
					isCurrent: () => current,
				}),
			);
			const request = await Promise.race([
				entered.promise,
				pending.then(() => {
					throw new Error("Synthetic provider was not entered");
				}),
			]);
			const original = createConsentedPasskeyExclusionError(request.signal);
			expect(request.signal.aborted).toBe(false);
			if (timing === "after rejection") decision.reject(original);
			if (action === "abort") caller.abort(privateDetail);
			else if (action === "close") broker.close();
			else if (action === "timeout") vi.advanceTimersByTime(ceremonyTimeout);
			else current = false;
			if (timing === "before rejection") decision.reject(original);
			const error = await pending;
			await vi.advanceTimersByTimeAsync(0);
			expectBrokerError(
				error,
				name,
				name === "AbortError"
					? "Passkey ceremony was aborted"
					: "Passkey ceremony was not allowed",
			);
			expect(request.signal.aborted).toBe(true);
			expect(
				consumeConsentedPasskeyExclusionError(original, request.signal),
			).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		},
	);
});
