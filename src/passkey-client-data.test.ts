import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
} from "./passkeys.js";

type Operation = "create" | "get";
type ProviderRequest =
	| Parameters<PasskeyAuthenticator["create"]>[0]
	| Parameters<PasskeyAuthenticator["get"]>[0];
const operations: Operation[] = ["create", "get"];
const brokers: PasskeyBroker[] = [];
const canonicalOrigin = new URL(
	"https://LOGIN.fixture.invalid:8443/path-secret?query=secret#fragment-secret",
).origin;

afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
	vi.restoreAllMocks();
});

function context(): PasskeyContext {
	return {
		origin: canonicalOrigin,
		topLevel: true,
		isCurrent: () => true,
	};
}

function creation(
	challenge: BufferSource = new Uint8Array([251, 255, 0]),
): PasskeyCreationOptions {
	return {
		challenge,
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([1]),
			name: "synthetic",
			displayName: "Synthetic user",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}

function assertionOptions(
	challenge: BufferSource = new Uint8Array([251, 255, 0]),
): PasskeyRequestOptions {
	return {
		challenge,
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
	};
}

function registration(): PasskeyRegistration {
	return {
		credentialId: new Uint8Array([7, 8]),
		attestationObject: new Uint8Array([0xa0]),
		algorithm: -7,
		residentKey: false,
		userConsented: true,
		userPresent: true,
		userVerified: false,
	};
}

function assertion(rpId: string): PasskeyAssertion {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(createHash("sha256").update(rpId).digest());
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

function fixture(observe: (request: ProviderRequest) => void | Promise<void>) {
	const create = vi.fn<PasskeyAuthenticator["create"]>(async (request) => {
		await observe(request);
		return registration();
	});
	const get = vi.fn<PasskeyAuthenticator["get"]>(async (request) => {
		await observe(request);
		return assertion(request.rpId);
	});
	const provider: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			attachment: "cross-platform",
			residentKey: false,
			userVerification: false,
		},
		create,
		get,
	};
	const broker = new PasskeyBroker(provider);
	brokers.push(broker);
	return { broker, provider, create, get };
}

function invoke(
	broker: PasskeyBroker,
	operation: Operation,
	trusted = context(),
	challenge: BufferSource = new Uint8Array([251, 255, 0]),
) {
	return operation === "create"
		? broker.create(creation(challenge), trusted)
		: broker.get(assertionOptions(challenge), trusted);
}

function expected(operation: Operation, challenge = "-_8A") {
	return new TextEncoder().encode(
		`{"type":"webauthn.${operation}","challenge":"${challenge}","origin":"https://login.fixture.invalid:8443","crossOrigin":false}`,
	);
}

function providerBytes(request: PasskeyProviderContext): Uint8Array {
	expect(request.clientDataJSON).toBeInstanceOf(Uint8Array);
	if (!request.clientDataJSON) throw new Error("Missing broker client data");
	return request.clientDataJSON;
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

async function drained() {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

it.each(operations)(
	"supplies exact %s bytes and their hash without URL details",
	async (operation) => {
		const requests: ProviderRequest[] = [];
		const { broker } = fixture((request) => {
			requests.push(request);
		});
		const result = await invoke(broker, operation);
		expect(requests).toHaveLength(1);
		const request = requests[0];
		const bytes = providerBytes(request);
		expect(bytes).toEqual(expected(operation));
		expect(bytes.byteOffset).toBe(0);
		expect(bytes.buffer.byteLength).toBe(bytes.byteLength);
		expect(request.clientDataHash).toEqual(
			new Uint8Array(createHash("sha256").update(bytes).digest()),
		);
		expect(request.rpId).toBe("login.fixture.invalid");
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(bytes);
		expect(bytes.buffer).not.toBe(result.response.clientDataJSON);
		const text = new TextDecoder().decode(bytes);
		for (const secret of ["path-secret", "query=secret", "fragment-secret"])
			expect(text).not.toContain(secret);
	},
);

for (const view of ["typed-array", "data-view"] as const) {
	it.each(operations)(
		`snapshots %s challenge ${view} offsets before source mutation`,
		async (operation) => {
			const source = new Uint8Array([99, 251, 255, 0, 88]);
			const challenge =
				view === "typed-array"
					? source.subarray(1, 4)
					: new DataView(source.buffer, 1, 3);
			const trusted = context();
			const { broker } = fixture((request) => {
				expect(request.options.challenge).toEqual(
					new Uint8Array([251, 255, 0]),
				);
				expect((request.options.challenge as Uint8Array).buffer).not.toBe(
					source.buffer,
				);
				(request.options.challenge as Uint8Array).fill(17);
				expect(providerBytes(request)).toEqual(expected(operation));
			});
			const pending = invoke(broker, operation, trusted, challenge);
			source.fill(42);
			trusted.origin = "https://changed.fixture.invalid";
			const result = await pending;
			expect(new Uint8Array(result.response.clientDataJSON)).toEqual(
				expected(operation),
			);
			expect(source).toEqual(new Uint8Array(5).fill(42));
		},
	);
}

it.each(operations)(
	"isolates %s provider mutations before and after response publication",
	async (operation) => {
		let retained!: Uint8Array;
		const { broker } = fixture((request) => {
			retained = providerBytes(request);
			expect(retained).toEqual(expected(operation));
			retained.fill(0);
		});
		const result = await invoke(broker, operation);
		const response = new Uint8Array(result.response.clientDataJSON);
		expect(response).toEqual(expected(operation));
		retained.fill(255);
		expect(response).toEqual(expected(operation));
		response.fill(18);
		expect(retained).toEqual(new Uint8Array(retained.length).fill(255));
	},
);

it.each(operations)(
	"isolates %s provider buffer transfer from response storage",
	async (operation) => {
		const { broker } = fixture((request) => {
			const bytes = providerBytes(request);
			const transferred = structuredClone(bytes, { transfer: [bytes.buffer] });
			expect(bytes.byteLength).toBe(0);
			expect(transferred).toEqual(expected(operation));
		});
		const result = await invoke(broker, operation);
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(
			expected(operation),
		);
	},
);

it("keeps successive create/get ceremonies and separate brokers independent", async () => {
	const requests: ProviderRequest[] = [];
	const observe = (request: ProviderRequest) => {
		requests.push(request);
	};
	const first = fixture(observe);
	const second = fixture(observe);
	const created = await invoke(first.broker, "create");
	providerBytes(requests[0]).fill(0);
	const asserted = await invoke(
		first.broker,
		"get",
		context(),
		new Uint8Array([1]),
	);
	const separate = await invoke(second.broker, "create");
	const buffers = requests.map((request) => providerBytes(request).buffer);
	expect(new Set(buffers).size).toBe(3);
	expect(new Uint8Array(created.response.clientDataJSON)).toEqual(
		expected("create"),
	);
	expect(providerBytes(requests[1])).toEqual(expected("get", "AQ"));
	expect(providerBytes(requests[2])).toEqual(expected("create"));
	providerBytes(requests[1]).fill(3);
	providerBytes(requests[2]).fill(4);
	expect(new Uint8Array(asserted.response.clientDataJSON)).toEqual(
		expected("get", "AQ"),
	);
	expect(new Uint8Array(separate.response.clientDataJSON)).toEqual(
		expected("create"),
	);
	expect(first.create).toHaveBeenCalledTimes(1);
	expect(first.get).toHaveBeenCalledTimes(1);
	expect(second.create).toHaveBeenCalledTimes(1);
	expect(second.get).not.toHaveBeenCalled();
});

it.each(operations)(
	"does not call %s for a pre-aborted ceremony",
	async (operation) => {
		const controller = new AbortController();
		controller.abort();
		const { broker, create, get } = fixture(() => {});
		await expect(
			invoke(broker, operation, { ...context(), signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	},
);

it.each(operations)(
	"does not call %s after cancellation during hashing",
	async (operation) => {
		const digest = deferred<ArrayBuffer>();
		vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
			() => digest.promise,
		);
		const controller = new AbortController();
		const { broker, create, get } = fixture(() => {});
		const pending = invoke(broker, operation, {
			...context(),
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		controller.abort();
		await rejected;
		digest.resolve(new ArrayBuffer(32));
		await drained();
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	},
);

for (const ending of ["abort", "close", "stale"] as const) {
	it.each(operations)(
		`keeps one %s provider call on pending ${ending} and rejects its late result`,
		async (operation) => {
			const entered = deferred<ProviderRequest>();
			const release = deferred<void>();
			const controller = new AbortController();
			let current = true;
			const { broker, create, get } = fixture(async (request) => {
				entered.resolve(request);
				await release.promise;
			});
			const pending = invoke(broker, operation, {
				...context(),
				signal: controller.signal,
				isCurrent: () => current,
			});
			const rejected = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			const request = await entered.promise;
			expect(providerBytes(request)).toEqual(expected(operation));
			if (ending === "abort") controller.abort();
			else if (ending === "close") broker.close();
			else current = false;
			await rejected;
			expect(request.signal.aborted).toBe(true);
			providerBytes(request).fill(0);
			release.resolve();
			await drained();
			expect(create).toHaveBeenCalledTimes(operation === "create" ? 1 : 0);
			expect(get).toHaveBeenCalledTimes(operation === "get" ? 1 : 0);
		},
	);
}

it.each(operations)(
	"does not start an extra %s provider call while a ceremony is active",
	async (operation) => {
		const entered = deferred<void>();
		const release = deferred<void>();
		const { broker, create, get } = fixture(async () => {
			entered.resolve();
			await release.promise;
		});
		const pending = invoke(broker, operation);
		await entered.promise;
		await expect(invoke(broker, operation)).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		release.resolve();
		await pending;
		expect(create).toHaveBeenCalledTimes(operation === "create" ? 1 : 0);
		expect(get).toHaveBeenCalledTimes(operation === "get" ? 1 : 0);
	},
);

it("keeps direct hash-only create/get provider callers type-compatible", async () => {
	const legacy: PasskeyProviderContext = {
		rpId: "login.fixture.invalid",
		clientDataHash: new Uint8Array(32),
		signal: new AbortController().signal,
	};
	const { provider, create, get } = fixture((request) => {
		expect(request.clientDataJSON).toBeUndefined();
	});
	await provider.create({ ...legacy, options: creation() });
	await provider.get({ ...legacy, options: assertionOptions() });
	expect(create).toHaveBeenCalledTimes(1);
	expect(get).toHaveBeenCalledTimes(1);
});
