import { afterEach, expect, it, vi } from "vitest";
import {
	SecretBroker,
	type SecretProvider,
	secretProviderLimits,
} from "./secret-providers.js";

const origin = "https://login.example";
const signal = () => new AbortController().signal;

afterEach(() => vi.restoreAllMocks());

function fixture(
	resolve: SecretProvider["resolve"] = async () => "synthetic-password",
) {
	const provider = { resolve: vi.fn(resolve) };
	const providers = { fixture: provider };
	const bindings = {
		LOGIN: { provider: "fixture", key: "accounts/login", origins: [origin] },
	};
	const broker = new SecretBroker({ providers, bindings });
	return { broker, provider, providers, bindings };
}

async function genericFailure(operation: Promise<unknown>) {
	const error = await operation.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toBe("Secret operation failed");
	expect((error as Error).cause).toBeUndefined();
}

it("consumes a configured secret with a captured provider receiver, without caching or exposing state", async () => {
	const { broker, provider } = fixture();
	const consume = vi.fn(async () => {});
	const inputSignal = signal();
	await broker.use("secret:LOGIN", origin, inputSignal, consume);
	await broker.use("secret:LOGIN", origin, inputSignal, consume);
	expect(provider.resolve).toHaveBeenCalledTimes(2);
	expect(provider.resolve).toHaveBeenCalledWith("accounts/login", inputSignal);
	expect(provider.resolve.mock.contexts[0]).toBe(provider);
	expect(consume).toHaveBeenCalledWith("synthetic-password");
	expect(Object.keys(broker)).toEqual([]);
	expect(JSON.stringify(broker)).toBe("{}");
	expect("resolve" in broker).toBe(false);
	expect("read" in broker).toBe(false);
});

it.each([
	"LOGIN",
	"secret:",
	"secret:missing",
	"secret:LOGIN\n",
	"secret:LOGIN\0",
	"secret:é",
	`secret:${"A".repeat(65)}`,
	"secret:constructor",
	"secret:toString",
	"secret:LOGIN/extra",
])("rejects reference case %# without resolving", async (reference) => {
	const { broker, provider } = fixture();
	expect(broker.allows(reference, origin)).toBe(false);
	await genericFailure(broker.use(reference, origin, signal(), vi.fn()));
	expect(provider.resolve).not.toHaveBeenCalled();
});

const invalidOrigins = [
	"http://login.example",
	"https://login.example/",
	"https://LOGIN.example",
	"https://login.example:443",
	"https://user:password@login.example",
	"https://*.example",
	"https://login.example/path",
	"https://login.example?query",
	"https://login.example#fragment",
	"https://login.example\n",
	"null",
];

it.each(invalidOrigins)(
	"rejects nonliteral configured origin case %#",
	(configured) => {
		expect(
			() =>
				new SecretBroker({
					providers: { fixture: { resolve: async () => "synthetic" } },
					bindings: {
						LOGIN: { provider: "fixture", key: "KEY", origins: [configured] },
					},
				}),
		).toThrow("Invalid secret configuration");
	},
);

it.each([
	...invalidOrigins,
	"https://other.example",
	"https://sub.login.example",
	"https://127.0.0.1",
	"https://localhost",
	"https://[::1]",
])("denies origin case %# without resolving", async (requested) => {
	const { broker, provider } = fixture();
	expect(broker.allows("secret:LOGIN", requested)).toBe(false);
	await genericFailure(
		broker.use("secret:LOGIN", requested, signal(), vi.fn()),
	);
	expect(provider.resolve).not.toHaveBeenCalled();
});

it("allows loopback only when explicitly bound to its literal HTTPS origin", () => {
	const broker = new SecretBroker({
		providers: { fixture: { resolve: async () => "synthetic" } },
		bindings: {
			LOCAL: {
				provider: "fixture",
				key: "KEY",
				origins: ["https://127.0.0.1:8443"],
			},
		},
	});
	expect(broker.allows("secret:LOCAL", "https://127.0.0.1:8443")).toBe(true);
	expect(broker.allows("secret:LOCAL", "http://127.0.0.1:8443")).toBe(false);
});

it("snapshots maps, bindings, origin arrays, and provider methods", async () => {
	const { broker, provider, providers, bindings } = fixture();
	const originalResolve = provider.resolve;
	bindings.LOGIN.origins[0] = "https://evil.example";
	bindings.LOGIN.key = "OTHER";
	bindings.LOGIN.provider = "other";
	provider.resolve = vi.fn(async () => "changed");
	providers.fixture = { resolve: vi.fn(async () => "replaced") };
	const consume = vi.fn();
	await broker.use("secret:LOGIN", origin, signal(), consume);
	expect(originalResolve).toHaveBeenCalledWith(
		"accounts/login",
		expect.any(AbortSignal),
	);
	expect(consume).toHaveBeenCalledWith("synthetic-password");
	expect(broker.allows("secret:LOGIN", "https://evil.example")).toBe(false);
});

it("captures the validated provider method without rereading its getter", async () => {
	const originalResolve = vi.fn(async () => "synthetic-original");
	const replacementResolve = vi.fn(async () => "synthetic-replacement");
	const readResolve = vi
		.fn()
		.mockReturnValueOnce(originalResolve)
		.mockReturnValue(replacementResolve);
	const provider = {
		get resolve() {
			return readResolve();
		},
	};
	const broker = new SecretBroker({
		providers: { fixture: provider },
		bindings: {
			LOGIN: { provider: "fixture", key: "accounts/login", origins: [origin] },
		},
	});
	const consume = vi.fn();
	await broker.use("secret:LOGIN", origin, signal(), consume);
	expect(readResolve).toHaveBeenCalledOnce();
	expect(originalResolve.mock.contexts[0]).toBe(provider);
	expect(replacementResolve).not.toHaveBeenCalled();
	expect(consume).toHaveBeenCalledWith("synthetic-original");
});

it("uses intrinsic binding instead of a resolver's overridden bind", async () => {
	const resolve = vi.fn(async () => "synthetic-original");
	const replacementResolve = vi.fn(async () => "synthetic-replacement");
	const bind = vi.fn(() => replacementResolve);
	Object.defineProperty(resolve, "bind", { value: bind });
	const provider = { resolve };
	const broker = new SecretBroker({
		providers: { fixture: provider },
		bindings: {
			LOGIN: { provider: "fixture", key: "accounts/login", origins: [origin] },
		},
	});
	const inputSignal = signal();
	const consume = vi.fn();
	await broker.use("secret:LOGIN", origin, inputSignal, consume);
	expect(bind).not.toHaveBeenCalled();
	expect(replacementResolve).not.toHaveBeenCalled();
	expect(resolve).toHaveBeenCalledOnce();
	expect(resolve).toHaveBeenCalledWith("accounts/login", inputSignal);
	expect(resolve.mock.contexts[0]).toBe(provider);
	expect(consume).toHaveBeenCalledWith("synthetic-original");
});

it("keeps captured provider and key when an origins getter mutates the binding", async () => {
	const resolve = vi.fn(async () => "synthetic-original");
	const otherResolve = vi.fn(async () => "synthetic-other");
	const readOrigins = vi.fn(() => {
		binding.provider = "other";
		binding.key = "accounts/other";
		return [origin];
	});
	const binding = {
		provider: "fixture",
		key: "accounts/login",
		get origins() {
			return readOrigins();
		},
	};
	const broker = new SecretBroker({
		providers: { fixture: { resolve }, other: { resolve: otherResolve } },
		bindings: { LOGIN: binding },
	});
	const inputSignal = signal();
	const consume = vi.fn();
	await broker.use("secret:LOGIN", origin, inputSignal, consume);
	expect(readOrigins).toHaveBeenCalledOnce();
	expect(resolve).toHaveBeenCalledWith("accounts/login", inputSignal);
	expect(otherResolve).not.toHaveBeenCalled();
	expect(consume).toHaveBeenCalledWith("synthetic-original");
});

it.each([0, secretProviderLimits.maxOrigins + 1])(
	"validates the copied origin count when an array iterator yields %i origins",
	(count) => {
		const origins = [origin];
		origins[Symbol.iterator] = () =>
			Array.from({ length: count }, () => origin).values();
		expect(
			() =>
				new SecretBroker({
					providers: { fixture: { resolve: async () => "synthetic" } },
					bindings: { LOGIN: { provider: "fixture", key: "KEY", origins } },
				}),
		).toThrow("Invalid secret configuration");
	},
);

it.each([false, true])(
	"bounds an endless origin iterator and closes it with throwing cleanup: %s",
	(throwOnClose) => {
		const next = vi.fn(() => ({ done: false, value: origin }));
		const close = vi.fn(() => {
			if (throwOnClose)
				throw new Error("synthetic-private-cleanup-error", {
					cause: "synthetic-private-cleanup-cause",
				});
			return { done: true, value: undefined };
		});
		const origins = [origin];
		Object.defineProperty(origins, Symbol.iterator, {
			value: () => ({ next, return: close }),
		});
		let error: unknown;
		try {
			new SecretBroker({
				providers: { fixture: { resolve: async () => "synthetic" } },
				bindings: { LOGIN: { provider: "fixture", key: "KEY", origins } },
			});
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("Invalid secret configuration");
		expect((error as Error).cause).toBeUndefined();
		expect(next).toHaveBeenCalledTimes(secretProviderLimits.maxOrigins + 1);
		expect(close).toHaveBeenCalledOnce();
	},
);

it.each([
	"",
	"\0",
	"synthetic\0password",
	"x".repeat(4097),
	"é".repeat(2049),
	42,
	undefined,
])("rejects invalid provider result case %#", async (value) => {
	const { broker } = fixture(async () => value as string);
	const consume = vi.fn();
	await genericFailure(broker.use("secret:LOGIN", origin, signal(), consume));
	expect(consume).not.toHaveBeenCalled();
});

it("accepts the exact UTF-8 byte bound", async () => {
	const value = "é".repeat(secretProviderLimits.maxSecretBytes / 2);
	const { broker } = fixture(async () => value);
	const consume = vi.fn();
	await broker.use("secret:LOGIN", origin, signal(), consume);
	expect(consume).toHaveBeenCalledWith(value);
});

it("scrubs provider and consumer errors and abort reasons", async () => {
	const leaked = new Error("synthetic-private-error", {
		cause: "synthetic-private-cause",
	});
	const { broker } = fixture(async () => {
		throw leaked;
	});
	await genericFailure(broker.use("secret:LOGIN", origin, signal(), vi.fn()));
	await genericFailure(
		fixture().broker.use("secret:LOGIN", origin, signal(), () => {
			throw leaked;
		}),
	);
	const aborted = AbortSignal.abort(leaked);
	const fresh = fixture();
	await genericFailure(
		fresh.broker.use("secret:LOGIN", origin, aborted, vi.fn()),
	);
	expect(fresh.provider.resolve).not.toHaveBeenCalled();
});

it("rechecks abort after provider completion and never consumes late secrets", async () => {
	const controller = new AbortController();
	const { broker } = fixture(async () => {
		controller.abort("synthetic-reason");
		return "synthetic-password";
	});
	const consume = vi.fn();
	await genericFailure(
		broker.use("secret:LOGIN", origin, controller.signal, consume),
	);
	expect(consume).not.toHaveBeenCalled();
});

it("cancels a pending provider even when it ignores the signal", async () => {
	const controller = new AbortController();
	let finish: (value: string) => void = () => {};
	const { broker, provider } = fixture(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const consume = vi.fn();
	const pending = broker.use(
		"secret:LOGIN",
		origin,
		controller.signal,
		consume,
	);
	await Promise.resolve();
	expect(provider.resolve).toHaveBeenCalledOnce();
	controller.abort();
	await genericFailure(pending);
	finish("late-synthetic-password");
	await Promise.resolve();
	expect(consume).not.toHaveBeenCalled();
});

it("rejects malformed and inherited configuration without leaking it", () => {
	const provider = { resolve: async () => "synthetic" };
	for (const key of ["", "KEY\n", "KEY\0", "K".repeat(1025)]) {
		expect(
			() =>
				new SecretBroker({
					providers: { fixture: provider },
					bindings: { LOGIN: { provider: "fixture", key, origins: [origin] } },
				}),
		).toThrow("Invalid secret configuration");
	}
	for (const name of ["LOGIN\n", "é", "A".repeat(65)]) {
		expect(
			() =>
				new SecretBroker({
					providers: { fixture: provider },
					bindings: {
						[name]: { provider: "fixture", key: "KEY", origins: [origin] },
					},
				}),
		).toThrow("Invalid secret configuration");
	}
	expect(
		() =>
			new SecretBroker({
				providers: Object.create({ fixture: provider }),
				bindings: {
					LOGIN: { provider: "fixture", key: "KEY", origins: [origin] },
				},
			}),
	).toThrow("Invalid secret configuration");
	const inherited = new SecretBroker({
		providers: { fixture: provider },
		bindings: Object.create({
			LOGIN: { provider: "fixture", key: "KEY", origins: [origin] },
		}),
	});
	expect(inherited.allows("secret:LOGIN", origin)).toBe(false);
});

it("bounds provider, binding, origin counts and rejects invalid provider definitions", () => {
	const provider = { resolve: async () => "synthetic" };
	const binding = { provider: "fixture", key: "KEY", origins: [origin] };
	const excessive = Object.fromEntries(
		Array.from({ length: 1025 }, (_, index) => [`NAME${index}`, binding]),
	);
	expect(
		() =>
			new SecretBroker({
				providers: { fixture: provider },
				bindings: excessive,
			}),
	).toThrow("Invalid secret configuration");
	const providers = Object.fromEntries(
		Array.from({ length: 1025 }, (_, index) => [`NAME${index}`, provider]),
	);
	expect(() => new SecretBroker({ providers, bindings: {} })).toThrow(
		"Invalid secret configuration",
	);
	for (const origins of [
		[],
		new Array(1),
		Array.from({ length: 65 }, () => origin),
	]) {
		expect(
			() =>
				new SecretBroker({
					providers: { fixture: provider },
					bindings: { LOGIN: { ...binding, origins } },
				}),
		).toThrow("Invalid secret configuration");
	}
	expect(
		() =>
			new SecretBroker({ providers: { "fixture\n": provider }, bindings: {} }),
	).toThrow("Invalid secret configuration");
	expect(
		() =>
			new SecretBroker({
				providers: { fixture: {} as SecretProvider },
				bindings: {},
			}),
	).toThrow("Invalid secret configuration");
});

it("zeroes temporary UTF-8 bytes even when consumption fails", async () => {
	const bytes = Uint8Array.of(115, 121, 110);
	vi.spyOn(TextEncoder.prototype, "encode").mockReturnValue(bytes);
	await genericFailure(
		fixture().broker.use("secret:LOGIN", origin, signal(), () => {
			throw new Error("synthetic-failure");
		}),
	);
	expect(bytes).toEqual(Uint8Array.of(0, 0, 0));
});

it("rejects synchronous provider exceptions and aborts during async consumption", async () => {
	const throwing = fixture(() => {
		throw new Error("synthetic-private-error");
	});
	await genericFailure(
		throwing.broker.use("secret:LOGIN", origin, signal(), vi.fn()),
	);
	const controller = new AbortController();
	await genericFailure(
		fixture().broker.use(
			"secret:LOGIN",
			origin,
			controller.signal,
			async () => {
				controller.abort("synthetic-private-reason");
			},
		),
	);
});
