import { afterEach, expect, it, vi } from "vitest";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyCreationOptions,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
	passkeyLimits,
} from "./passkeys.js";

const brokers: PasskeyBroker[] = [];
afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
	vi.useRealTimers();
});
function context(overrides: Partial<PasskeyContext> = {}): PasskeyContext {
	return {
		origin: "https://login.fixture.invalid",
		topLevel: true,
		isCurrent: () => true,
		...overrides,
	};
}
function creation(): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([251, 255, 0]),
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([1]),
			name: "synthetic",
			displayName: "Synthetic user",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}
function request(): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([251, 255, 0]),
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
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
async function assertion(
	host = "login.fixture.invalid",
): Promise<PasskeyAssertion> {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(host)),
		),
	);
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
function fixture(overrides: Partial<PasskeyAuthenticator> = {}) {
	const create = vi.fn<PasskeyAuthenticator["create"]>(async () =>
		registration(),
	);
	const get = vi.fn<PasskeyAuthenticator["get"]>(async () => assertion());
	const provider: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		create,
		get,
		...overrides,
	};
	const broker = new PasskeyBroker(provider);
	brokers.push(broker);
	return { broker, provider, create, get };
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
async function called(mock: { mock: { calls: unknown[] } }) {
	await vi.waitFor(() => expect(mock.mock.calls).toHaveLength(1));
}

it("requires an explicit provider and snapshots honest capabilities", () => {
	expect(
		() => new PasskeyBroker(undefined as unknown as PasskeyAuthenticator),
	).toThrow();
	const { broker, provider } = fixture();
	expect(broker.capabilities).toEqual({
		algorithms: [-7],
		userVerification: false,
		residentKey: false,
		attachment: "cross-platform",
	});
	(provider.capabilities.algorithms as number[]).push(-257);
	expect(broker.capabilities.algorithms).toEqual([-7]);
	expect(Object.isFrozen(broker.capabilities)).toBe(true);
	expect(Object.isFrozen(broker.capabilities.algorithms)).toBe(true);
});

it("builds create client data and gives only its SHA-256 hash to the synthetic provider", async () => {
	const { broker, create } = fixture();
	const result = await broker.create(creation(), context());
	expect(result).toMatchObject({ id: "Bwg", type: "public-key" });
	expect(new Uint8Array(result.rawId)).toEqual(new Uint8Array([7, 8]));
	const clientData = JSON.parse(
		new TextDecoder().decode(result.response.clientDataJSON),
	);
	expect(clientData).toEqual({
		type: "webauthn.create",
		challenge: "-_8A",
		origin: "https://login.fixture.invalid",
		crossOrigin: false,
	});
	const supplied = create.mock.calls[0][0];
	expect(supplied.rpId).toBe("login.fixture.invalid");
	expect(supplied.clientDataHash).toEqual(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", result.response.clientDataJSON),
		),
	);
	expect(Object.keys(supplied).sort()).toEqual([
		"clientDataHash",
		"options",
		"rpId",
		"signal",
	]);
	expect(supplied.options).toMatchObject({
		rp: { id: "login.fixture.invalid" },
		timeout: 60_000,
		attestation: "none",
		authenticatorSelection: {
			userVerification: "preferred",
			residentKey: "discouraged",
			requireResidentKey: false,
		},
	});
});

it("returns assertion bytes with the actual origin including its port", async () => {
	const { broker, get } = fixture();
	const result = await broker.get(
		request(),
		context({ origin: "https://login.fixture.invalid:8443" }),
	);
	expect(
		JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
	).toMatchObject({
		type: "webauthn.get",
		origin: "https://login.fixture.invalid:8443",
	});
	expect(get.mock.calls[0][0].rpId).toBe("login.fixture.invalid");
	expect(new Uint8Array(result.response.signature)).toEqual(
		new Uint8Array([9]),
	);
	expect(result.response.userHandle).toBeNull();
});

it.each([
	"http://login.fixture.invalid",
	"https://login.fixture.invalid/",
	"https://user:secret@login.fixture.invalid",
	"null",
	"https://127.0.0.1",
	"https://[::1]",
	"https://localhost",
	"https://login.fixture.invalid.",
])(
	"rejects unsupported origin %s before provider invocation",
	async (origin) => {
		const { broker, create } = fixture();
		await expect(
			broker.create(creation(), context({ origin })),
		).rejects.toMatchObject({ name: "SecurityError" });
		expect(create).not.toHaveBeenCalled();
	},
);

it("rejects every iframe and an origin smuggled through page options", async () => {
	const { broker, create } = fixture();
	await expect(
		broker.create(creation(), context({ topLevel: false })),
	).rejects.toMatchObject({ name: "SecurityError" });
	await expect(
		broker.create(
			{
				...creation(),
				origin: "https://attacker.invalid",
			} as PasskeyCreationOptions,
			context(),
		),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	expect(create).not.toHaveBeenCalled();
});

it.each([
	"fixture.invalid",
	"other.invalid",
	"invalid",
	"LOGIN.fixture.invalid",
	"login.fixture.invalid:443",
	"login.fixture.invalid.",
])("rejects non-exact RP ID %s in both ceremonies", async (id) => {
	const { broker, create, get } = fixture();
	const options = creation();
	options.rp.id = id;
	await expect(broker.create(options, context())).rejects.toMatchObject({
		name: "SecurityError",
	});
	await expect(
		broker.get({ ...request(), rpId: id }, context()),
	).rejects.toMatchObject({ name: "SecurityError" });
	expect(create).not.toHaveBeenCalled();
	expect(get).not.toHaveBeenCalled();
});

it("clones ArrayBuffer and view slices synchronously before caller mutation", async () => {
	const { broker, create } = fixture();
	const backing = new Uint8Array([99, 10, 11, 98]);
	const options = creation();
	options.challenge = new DataView(backing.buffer, 1, 2);
	options.user.id = backing.subarray(1, 2);
	options.excludeCredentials = [
		{ type: "public-key", id: backing.subarray(2, 3), transports: ["usb"] },
	];
	const pending = broker.create(options, context());
	backing.fill(0);
	options.rp.name = "mutated";
	options.user.name = "mutated";
	(options.pubKeyCredParams as { type: "public-key"; alg: number }[])[0].alg =
		-257;
	(options.excludeCredentials[0].transports as string[])[0] = "nfc";
	const result = await pending;
	const copied = create.mock.calls[0][0].options;
	expect(copied.challenge).toEqual(new Uint8Array([10, 11]));
	expect(copied.user.id).toEqual(new Uint8Array([10]));
	expect(copied.excludeCredentials?.[0]).toEqual({
		type: "public-key",
		id: new Uint8Array([11]),
		transports: ["usb"],
	});
	expect(copied.rp.name).toBe("Synthetic RP");
	expect(copied.user.name).toBe("synthetic");
	expect(copied.pubKeyCredParams[0].alg).toBe(-7);
	expect(
		JSON.parse(new TextDecoder().decode(result.response.clientDataJSON))
			.challenge,
	).toBe("Cgs");
});

it.each([
	new Uint8Array(),
	new Uint8Array(1025),
	"AQ",
	[1],
	new SharedArrayBuffer(4),
	new Uint8Array(new SharedArrayBuffer(4)),
])("rejects invalid or unbounded challenge %#", async (challenge) => {
	const { broker, create } = fixture();
	await expect(
		broker.create(
			{ ...creation(), challenge: challenge as BufferSource },
			context(),
		),
	).rejects.toMatchObject({ name: "TypeError" });
	expect(create).not.toHaveBeenCalled();
});

it("rejects detached buffers and accepts raw buffers", async () => {
	const { broker } = fixture();
	const challenge = new ArrayBuffer(2);
	await expect(
		broker.create({ ...creation(), challenge }, context()),
	).resolves.toHaveProperty("id");
	structuredClone(challenge, { transfer: [challenge] });
	await expect(
		broker.create({ ...creation(), challenge }, context()),
	).rejects.toMatchObject({ name: "TypeError" });
});

it.each([0, 65])("enforces user handle bound %s", async (size) => {
	const { broker } = fixture();
	const options = creation();
	options.user.id = new Uint8Array(size);
	await expect(broker.create(options, context())).rejects.toMatchObject({
		name: "TypeError",
	});
});

it.each(["", "x".repeat(257), "name\u0000", 123])(
	"validates RP and user names %#",
	async (name) => {
		const { broker } = fixture();
		for (const field of ["rp", "user"] as const) {
			const options = creation();
			options[field].name = name as string;
			await expect(broker.create(options, context())).rejects.toMatchObject({
				name: "TypeError",
			});
		}
	},
);

it("rejects accessors without invoking them", async () => {
	const { broker, create } = fixture();
	const getter = vi.fn(() => new Uint8Array([1]));
	const options = creation();
	Object.defineProperty(options, "challenge", { get: getter });
	await expect(broker.create(options, context())).rejects.toMatchObject({
		name: "TypeError",
	});
	expect(getter).not.toHaveBeenCalled();
	expect(create).not.toHaveBeenCalled();
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, "50"])(
	"rejects invalid timeout %s",
	async (timeout) => {
		const { broker } = fixture();
		await expect(
			broker.get({ ...request(), timeout: timeout as number }, context()),
		).rejects.toMatchObject({ name: "TypeError" });
	},
);

it("caps timeout and filters algorithms without inventing support", async () => {
	const { broker, create } = fixture();
	await broker.create(
		{
			...creation(),
			timeout: 1e12,
			pubKeyCredParams: [
				{ type: "public-key", alg: -999 },
				{ type: "public-key", alg: -7 },
			],
		},
		context(),
	);
	expect(create.mock.calls[0][0].options.timeout).toBe(
		passkeyLimits.maxTimeoutMs,
	);
	expect(create.mock.calls[0][0].options.pubKeyCredParams).toEqual([
		{ type: "public-key", alg: -7 },
	]);
	await expect(
		broker.create(
			{ ...creation(), pubKeyCredParams: [{ type: "public-key", alg: -257 }] },
			context(),
		),
	).rejects.toMatchObject({ name: "NotSupportedError" });
});

it.each([
	{ authenticatorSelection: { userVerification: "required" } },
	{ authenticatorSelection: { residentKey: "required" } },
	{ authenticatorSelection: { requireResidentKey: true } },
	{ authenticatorSelection: { authenticatorAttachment: "platform" } },
	{ attestation: "direct" },
	{ attestation: "indirect" },
	{ attestation: "enterprise" },
	{ extensions: { prf: {} } },
])("fails closed for unsupported creation requirements %#", async (patch) => {
	const { broker, create } = fixture();
	await expect(
		broker.create(
			{ ...creation(), ...patch } as PasskeyCreationOptions,
			context(),
		),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	expect(create).not.toHaveBeenCalled();
});

it("rejects required UV and discoverable requests when unsupported", async () => {
	const { broker, get } = fixture();
	await expect(
		broker.get({ ...request(), userVerification: "required" }, context()),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	await expect(
		broker.get({ challenge: new Uint8Array([1]) }, context()),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	expect(get).not.toHaveBeenCalled();
});

it.each(
	[
		[{ type: "password", id: new Uint8Array([1]) }],
		[{ type: "public-key", id: new Uint8Array() }],
		[{ type: "public-key", id: new Uint8Array(1024) }],
		Array.from({ length: 65 }, () => ({
			type: "public-key",
			id: new Uint8Array([1]),
		})),
		[{ type: "public-key", id: new Uint8Array([1]), transports: ["unknown"] }],
	].map((allowCredentials) => ({ allowCredentials })),
)("bounds and validates descriptors %#", async ({ allowCredentials }) => {
	const { broker, get } = fixture();
	await expect(
		broker.get(
			{ ...request(), allowCredentials } as PasskeyRequestOptions,
			context(),
		),
	).rejects.toMatchObject({ name: "TypeError" });
	expect(get).not.toHaveBeenCalled();
});

it.each(["userConsented", "userPresent"] as const)(
	"requires provider %s rather than fabricating consent",
	async (field) => {
		const { broker, create, get } = fixture();
		create.mockResolvedValue({ ...registration(), [field]: false });
		get.mockResolvedValue({ ...(await assertion()), [field]: false });
		await expect(broker.create(creation(), context())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		await expect(broker.get(request(), context())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
	},
);

it("checks required UV and resident results despite provider support declarations", async () => {
	const { broker, create, get } = fixture({
		capabilities: {
			algorithms: [-7],
			userVerification: true,
			residentKey: true,
			attachment: "cross-platform",
		},
	});
	await expect(
		broker.create(
			{
				...creation(),
				authenticatorSelection: { userVerification: "required" },
			},
			context(),
		),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	await expect(
		broker.create(
			{ ...creation(), authenticatorSelection: { residentKey: "required" } },
			context(),
		),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	await expect(
		broker.get({ ...request(), userVerification: "required" }, context()),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	create.mockResolvedValue({
		...registration(),
		userVerified: true,
		residentKey: true,
	});
	await expect(
		broker.create(
			{
				...creation(),
				authenticatorSelection: {
					userVerification: "required",
					residentKey: "required",
				},
			},
			context(),
		),
	).resolves.toHaveProperty("id");
	const verified = await assertion();
	verified.userVerified = true;
	(verified.authenticatorData as Uint8Array)[32] = 5;
	get.mockResolvedValue(verified);
	await expect(
		broker.get({ ...request(), userVerification: "required" }, context()),
	).resolves.toHaveProperty("id");
});

it("checks allow/exclude IDs against snapshots even if the provider mutates options", async () => {
	const { broker, create, get } = fixture();
	create.mockImplementation(async ({ options }) => {
		(options.excludeCredentials?.[0].id as Uint8Array).fill(0);
		return registration();
	});
	await expect(
		broker.create(
			{ ...creation(), excludeCredentials: request().allowCredentials },
			context(),
		),
	).rejects.toMatchObject({ name: "InvalidStateError" });
	get.mockImplementation(async ({ options }) => {
		(options.allowCredentials?.[0].id as Uint8Array).fill(0);
		return { ...(await assertion()), credentialId: new Uint8Array([0, 0]) };
	});
	await expect(broker.get(request(), context())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
});

it("rejects wrong RP hashes, missing UP, contradictory UV, and short authenticator data", async () => {
	const { broker, get } = fixture();
	const wrongHost = await assertion("other.invalid");
	const absentUP = await assertion();
	(absentUP.authenticatorData as Uint8Array)[32] = 0;
	const falseUV = await assertion();
	(falseUV.authenticatorData as Uint8Array)[32] = 5;
	const short = {
		...(await assertion()),
		authenticatorData: new Uint8Array(36),
	};
	for (const result of [wrongHost, absentUP, falseUV, short]) {
		get.mockResolvedValue(result);
		await expect(broker.get(request(), context())).rejects.toHaveProperty(
			"name",
		);
	}
});

it("requires a bounded user handle for discoverable assertions", async () => {
	const { broker, get } = fixture({
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: true,
			attachment: "cross-platform",
		},
	});
	const options = { challenge: new Uint8Array([1]) };
	await expect(broker.get(options, context())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	get.mockResolvedValue({
		...(await assertion()),
		userHandle: new Uint8Array([3]),
	});
	expect(
		new Uint8Array(
			(await broker.get(options, context())).response.userHandle as ArrayBuffer,
		),
	).toEqual(new Uint8Array([3]));
	get.mockResolvedValue({
		...(await assertion()),
		userHandle: new Uint8Array(65),
	});
	await expect(broker.get(options, context())).rejects.toMatchObject({
		name: "TypeError",
	});
});

it("clones provider outputs and excludes provider-only fields", async () => {
	const { broker, create, get } = fixture();
	const registered = registration();
	create.mockResolvedValue(registered);
	const created = await broker.create(creation(), context());
	(registered.credentialId as Uint8Array).fill(0);
	(registered.attestationObject as Uint8Array).fill(0);
	expect(new Uint8Array(created.rawId)).toEqual(new Uint8Array([7, 8]));
	expect(new Uint8Array(created.response.attestationObject)).toEqual(
		new Uint8Array([0xa0]),
	);
	const signed = await assertion();
	get.mockResolvedValue(signed);
	const result = await broker.get(request(), context());
	(signed.authenticatorData as Uint8Array).fill(0);
	(signed.signature as Uint8Array).fill(0);
	expect(new Uint8Array(result.response.signature)).toEqual(
		new Uint8Array([9]),
	);
	expect(new Uint8Array(result.response.authenticatorData)[32]).toBe(1);
	expect(Object.keys(result).sort()).toEqual([
		"id",
		"rawId",
		"response",
		"type",
	]);
});

it("bounds provider blobs and rejects unselected algorithms", async () => {
	const { broker, create, get } = fixture();
	create.mockResolvedValue({ ...registration(), algorithm: -257 });
	await expect(broker.create(creation(), context())).rejects.toMatchObject({
		name: "UnknownError",
	});
	create.mockResolvedValue({
		...registration(),
		attestationObject: new Uint8Array(65537),
	});
	await expect(broker.create(creation(), context())).rejects.toMatchObject({
		name: "TypeError",
	});
	get.mockResolvedValue({
		...(await assertion()),
		signature: new Uint8Array(),
	});
	await expect(broker.get(request(), context())).rejects.toMatchObject({
		name: "TypeError",
	});
});

it("sanitizes provider throws, rejections, and forged error names without leaking details", async () => {
	const { broker, create } = fixture();
	for (const error of [
		new Error("PRIVATE_FIXTURE_ERROR"),
		{ name: "SecurityError", message: "PRIVATE_FIXTURE_ERROR" },
		"PRIVATE_FIXTURE_ERROR",
	]) {
		create.mockRejectedValueOnce(error);
		await expect(broker.create(creation(), context())).rejects.toMatchObject({
			name: "UnknownError",
			message: "Passkey authenticator failed",
		});
	}
	create.mockImplementationOnce(() => {
		throw new Error("PRIVATE_FIXTURE_ERROR");
	});
	await expect(broker.create(creation(), context())).rejects.toMatchObject({
		name: "UnknownError",
		message: "Passkey authenticator failed",
	});
	await expect(broker.create(creation(), context())).resolves.toHaveProperty(
		"id",
	);
});

it("permits only one live ceremony across create and get", async () => {
	const pending = deferred<PasskeyRegistration>();
	const { broker, create, get } = fixture();
	create.mockReturnValueOnce(pending.promise);
	const first = broker.create(creation(), context());
	await expect(broker.get(request(), context())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	await expect(broker.create(creation(), context())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	expect(get).not.toHaveBeenCalled();
	pending.resolve(registration());
	await first;
	await expect(broker.get(request(), context())).resolves.toHaveProperty("id");
});

it("rejects pre-aborted and obsolete documents without asking the provider", async () => {
	const { broker, create } = fixture();
	const controller = new AbortController();
	controller.abort("PRIVATE_REASON");
	await expect(
		broker.create(creation(), context({ signal: controller.signal })),
	).rejects.toMatchObject({
		name: "AbortError",
		message: "Passkey ceremony was aborted",
	});
	await expect(
		broker.create(creation(), context({ isCurrent: () => false })),
	).rejects.toMatchObject({ name: "AbortError" });
	expect(create).not.toHaveBeenCalled();
});

it("aborts immediately during hashing without provider dispatch", async () => {
	const { broker, create } = fixture();
	const controller = new AbortController();
	const pending = broker.create(
		creation(),
		context({ signal: controller.signal }),
	);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(create).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"] as const)(
	"ignores late provider %s after abort without disturbing a new ceremony",
	async (late) => {
		const firstProvider = deferred<PasskeyRegistration>();
		const secondProvider = deferred<PasskeyRegistration>();
		const { broker, create } = fixture();
		create
			.mockReturnValueOnce(firstProvider.promise)
			.mockReturnValueOnce(secondProvider.promise);
		const controller = new AbortController();
		const first = broker.create(
			creation(),
			context({ signal: controller.signal }),
		);
		const denied = expect(first).rejects.toMatchObject({ name: "AbortError" });
		await called(create);
		controller.abort();
		await denied;
		expect(create.mock.calls[0][0].signal.aborted).toBe(true);
		const second = broker.create(creation(), context());
		if (late === "resolve") firstProvider.resolve(registration());
		else firstProvider.reject(new Error("PRIVATE_LATE"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		await expect(broker.get(request(), context())).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		secondProvider.resolve(registration());
		await expect(second).resolves.toHaveProperty("id");
	},
);

it("times out a noncooperative provider and rejects its late result", async () => {
	const providerResult = deferred<PasskeyRegistration>();
	const { broker, create } = fixture();
	create.mockReturnValueOnce(providerResult.promise);
	const pending = broker.create({ ...creation(), timeout: 100 }, context());
	const rejected = expect(pending).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	await called(create);
	await rejected;
	expect(create.mock.calls[0][0].signal.aborted).toBe(true);
	providerResult.resolve(registration());
	await expect(broker.create(creation(), context())).resolves.toHaveProperty(
		"id",
	);
});

it.each([false, "throw"])(
	"cancels a stalled provider after document invalidation %s",
	async (invalid) => {
		const providerResult = deferred<PasskeyRegistration>();
		const { broker, create } = fixture();
		create.mockReturnValueOnce(providerResult.promise);
		let current = true;
		const pending = broker.create(
			creation(),
			context({
				isCurrent: () => {
					if (!current && invalid === "throw")
						throw new Error("PRIVATE_DOCUMENT");
					return current;
				},
			}),
		);
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await called(create);
		current = false;
		await rejected;
		expect(create.mock.calls[0][0].signal.aborted).toBe(true);
		providerResult.resolve(registration());
	},
);

it("checks document validity on completion before the next poll", async () => {
	const providerResult = deferred<PasskeyRegistration>();
	const { broker, create } = fixture();
	create.mockReturnValueOnce(providerResult.promise);
	let current = true;
	const pending = broker.create(
		creation(),
		context({ isCurrent: () => current }),
	);
	await called(create);
	current = false;
	providerResult.resolve(registration());
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("close cancels pending work, never reopens, and discards late completion", async () => {
	const providerResult = deferred<PasskeyRegistration>();
	const { broker, create } = fixture();
	create.mockReturnValueOnce(providerResult.promise);
	const pending = broker.create(creation(), context());
	await called(create);
	broker.close();
	broker.close();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	expect(create.mock.calls[0][0].signal.aborted).toBe(true);
	providerResult.resolve(registration());
	await expect(broker.create(creation(), context())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
});

it("removes abort listeners after success and cancellation", async () => {
	const { broker } = fixture();
	const controller = new AbortController();
	const added = vi.spyOn(controller.signal, "addEventListener");
	const removed = vi.spyOn(controller.signal, "removeEventListener");
	await broker.create(creation(), context({ signal: controller.signal }));
	expect(removed.mock.calls[0][1]).toBe(added.mock.calls[0][1]);
	const pending = broker.create(
		creation(),
		context({ signal: controller.signal }),
	);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	expect(removed.mock.calls[1][1]).toBe(added.mock.calls[1][1]);
});

it("binds each provider request to fresh challenge/type/origin rather than cached client data", async () => {
	const { broker, create } = fixture();
	await broker.create(creation(), context());
	await broker.create(
		{ ...creation(), challenge: new Uint8Array([1]) },
		context(),
	);
	await broker.create(
		creation(),
		context({ origin: "https://other.fixture.invalid" }),
	);
	const hashes = create.mock.calls.map(([input]) =>
		Array.from(input.clientDataHash).join(","),
	);
	expect(new Set(hashes).size).toBe(3);
});

it("fails closed if the trusted validity callback initially throws", async () => {
	const { broker, create } = fixture();
	await expect(
		broker.create(
			creation(),
			context({
				isCurrent: () => {
					throw new Error("PRIVATE_CONTEXT");
				},
			}),
		),
	).rejects.toMatchObject({
		name: "AbortError",
		message: "Passkey ceremony was aborted",
	});
	expect(create).not.toHaveBeenCalled();
});

it("reserves the broker before synchronous validation callbacks can reenter", async () => {
	const { broker } = fixture();
	let reentered: Promise<unknown> | undefined;
	await broker.create(
		creation(),
		context({
			isCurrent: () => {
				if (!reentered)
					reentered = expect(
						broker.get(request(), context()),
					).rejects.toMatchObject({ name: "InvalidStateError" });
				return true;
			},
		}),
	);
	await reentered;
});

it("does not dispatch or return a credential when hashing finishes beyond its deadline", async () => {
	const { broker, create } = fixture();
	let clock = 0;
	const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
	try {
		const pending = broker.create({ ...creation(), timeout: 1000 }, context());
		clock = 1001;
		await expect(pending).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(create).not.toHaveBeenCalled();
	} finally {
		now.mockRestore();
	}
});
