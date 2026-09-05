import { afterEach, expect, it, vi } from "vitest";
import { documentBaseUrl } from "./document-url.js";
import { DocumentTree } from "./document.js";
import { type PagePasskeyContext, PagePasskeys } from "./page-passkeys.js";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	type PasskeyCreationOptions,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
	passkeyLimits,
} from "./passkeys.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

interface CredentialFixture {
	id: string;
	rawId: ArrayBuffer;
	type: string;
	response: { clientDataJSON: ArrayBuffer; [name: string]: ArrayBuffer | null };
	getClientExtensionResults(): object;
}

interface CredentialsFixture {
	create(options?: unknown): Promise<CredentialFixture>;
	get(options?: unknown): Promise<CredentialFixture>;
}

const owners: PagePasskeys[] = [];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function factory() {
	const definitions: ScriptHostObjectDefinition[] = [];
	return {
		definitions,
		createHostObject(definition: ScriptHostObjectDefinition): object {
			definitions.push(definition);
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
		credentialId: new Uint8Array([251, 255, 0]),
		attestationObject: new Uint8Array([0xa0]),
		userConsented: true,
		userPresent: true,
		userVerified: false,
		residentKey: false,
		algorithm: -7,
	};
}

async function assertion(): Promise<PasskeyAssertion> {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(
		new Uint8Array(
			await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode("login.fixture.invalid"),
			),
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

function provider() {
	return {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform" as const,
		},
		create: vi.fn<PasskeyAuthenticator["create"]>(async () => registration()),
		get: vi.fn<PasskeyAuthenticator["get"]>(async () => assertion()),
	};
}

function fixture(
	authenticator = provider(),
	context: PagePasskeyContext = { topLevel: true, isCurrent: () => true },
	url = "https://login.fixture.invalid/path?query=1#fragment",
	hostFactory: ScriptHostObjectFactory = factory(),
) {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const owner = new PagePasskeys(tree, hostFactory, authenticator, context);
	owners.push(owner);
	return {
		tree,
		owner,
		authenticator,
		credentials: owner.credentials as CredentialsFixture,
	};
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

async function called(mock: { mock: { calls: unknown[] } }, count = 1) {
	await vi.waitFor(() => expect(mock.mock.calls).toHaveLength(count));
}

function buffer(value: ArrayBuffer | null): ArrayBuffer {
	if (!(value instanceof ArrayBuffer)) throw new Error("Expected public bytes");
	return value;
}

it("synthetically creates public host capabilities with document-derived client data", async () => {
	const hostFactory = factory();
	const { credentials, authenticator } = fixture(
		undefined,
		undefined,
		undefined,
		hostFactory,
	);
	const result = await credentials.create({ publicKey: creation() });
	expect(result.id).toBe("-_8A");
	expect(new Uint8Array(result.rawId)).toEqual(new Uint8Array([251, 255, 0]));
	expect(result.type).toBe("public-key");
	expect(Object.keys(result.response)).toEqual([
		"clientDataJSON",
		"attestationObject",
	]);
	expect(
		JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
	).toEqual({
		type: "webauthn.create",
		challenge: "-_8A",
		origin: "https://login.fixture.invalid",
		crossOrigin: false,
	});
	expect(authenticator.create.mock.calls[0][0].rpId).toBe(
		"login.fixture.invalid",
	);
	expect(authenticator.create.mock.calls[0][0].clientDataHash).toEqual(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", result.response.clientDataJSON),
		),
	);
	expect(result.getClientExtensionResults()).toEqual({});
	expect(hostFactory.definitions).toHaveLength(4);
	expect(hostFactory.definitions[0].methods).toHaveProperty("create");
	expect(hostFactory.definitions[1].properties).toHaveProperty(
		"attestationObject",
	);
	expect(hostFactory.definitions[2].properties).toHaveProperty("rawId");
	expect(hostFactory.definitions[3]).toEqual({});
});

it("synthetically gets an assertion without claiming registration or platform extras", async () => {
	const { credentials, authenticator } = fixture();
	const result = await credentials.get({
		publicKey: request(),
		mediation: "required",
	});
	expect(result.id).toBe("Bwg");
	expect(result.response.userHandle).toBeNull();
	expect(new Uint8Array(buffer(result.response.signature))).toEqual(
		new Uint8Array([9]),
	);
	expect(Object.keys(result.response)).toEqual([
		"clientDataJSON",
		"authenticatorData",
		"signature",
		"userHandle",
	]);
	expect(
		JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)).type,
	).toBe("webauthn.get");
	expect(authenticator.get).toHaveBeenCalledOnce();
	expect(authenticator.create).not.toHaveBeenCalled();
	expect(result.getClientExtensionResults()).toEqual({});
	for (const name of [
		"toJSON",
		"constructor",
		"isUserVerifyingPlatformAuthenticatorAvailable",
		"isConditionalMediationAvailable",
		"store",
		"preventSilentAccess",
		"provider",
		"capabilities",
	])
		expect(
			Object.hasOwn(credentials, name) || Object.hasOwn(result, name),
		).toBe(false);
});

it("requires an explicit trusted authenticator instead of inventing availability", () => {
	const tree = new DocumentTree("https://login.fixture.invalid");
	trees.push(tree);
	expect(
		() =>
			new PagePasskeys(
				tree,
				factory(),
				undefined as unknown as PasskeyAuthenticator,
				{
					topLevel: true,
					isCurrent: () => true,
				},
			),
	).toThrow("Invalid passkey options");
});

it.each(["create", "get"] as const)(
	"rejects absent or malformed %s outer dictionaries",
	async (method) => {
		const { credentials, authenticator } = fixture();
		for (const options of [
			undefined,
			null,
			[],
			"options",
			{},
			{ publicKey: undefined },
			{ publicKey: null },
		])
			await expect(credentials[method](options)).rejects.toMatchObject({
				name: "TypeError",
			});
		expect(authenticator.create).not.toHaveBeenCalled();
		expect(authenticator.get).not.toHaveBeenCalled();
	},
);

it.each([
	"password",
	"federated",
	"otp",
	"unknown",
	"origin",
	"topLevel",
	"isCurrent",
])(
	"rejects unsupported outer %s without invoking the provider",
	async (name) => {
		const { credentials, authenticator } = fixture();
		await expect(
			credentials.create({ publicKey: creation(), [name]: "secret" }),
		).rejects.toMatchObject({
			name: "NotSupportedError",
			message: "Passkey requirement is not supported",
		});
		expect(authenticator.create).not.toHaveBeenCalled();
	},
);

it.each(["conditional", "silent", "invalid", null, 1])(
	"rejects unsupported mediation %s",
	async (mediation) => {
		const { credentials, authenticator } = fixture();
		await expect(
			credentials.get({ publicKey: request(), mediation }),
		).rejects.toMatchObject({ name: "NotSupportedError" });
		expect(authenticator.get).not.toHaveBeenCalled();
	},
);

it.each([undefined, "optional", "required"])(
	"accepts supported explicit-consent mediation %s",
	async (mediation) => {
		const { credentials } = fixture();
		await expect(
			credentials.create({ publicKey: creation(), mediation }),
		).resolves.toHaveProperty("type", "public-key");
	},
);

it("rejects accessors, symbols and hostile proxies without retaining or leaking guest errors", async () => {
	const { credentials, authenticator } = fixture();
	const getter = vi.fn(() => creation());
	const accessor = Object.defineProperty({}, "publicKey", { get: getter });
	const proxy = new Proxy(
		{},
		{
			ownKeys() {
				throw new Error("private guest detail");
			},
		},
	);
	for (const options of [
		accessor,
		proxy,
		{ publicKey: creation(), [Symbol("private")]: true },
	])
		await expect(credentials.create(options)).rejects.toMatchObject({
			name: "TypeError",
			message: "Invalid passkey options",
		});
	expect(getter).not.toHaveBeenCalled();
	expect(authenticator.create).not.toHaveBeenCalled();
});

it.each([
	null,
	{},
	{ aborted: false, addEventListener() {} },
	"signal",
	new Proxy(new AbortController().signal, {}),
])("rejects unsupported signal fixture %#", async (signal) => {
	const { credentials, authenticator } = fixture();
	await expect(
		credentials.create({ publicKey: creation(), signal }),
	).rejects.toMatchObject({ name: "TypeError" });
	expect(authenticator.create).not.toHaveBeenCalled();
});

it("aborts a ceremony with a genuine signal and fixed errors, ignoring overridden signal methods", async () => {
	const controller = new AbortController();
	const { credentials, authenticator } = fixture(undefined, {
		topLevel: true,
		isCurrent: () => true,
		supportedSignals: new Set([controller.signal]),
	});
	const pending = deferred<PasskeyRegistration>();
	authenticator.create.mockReturnValueOnce(pending.promise);
	const override = vi.fn(() => {
		throw new Error("private signal detail");
	});
	Object.defineProperty(controller.signal, "addEventListener", {
		value: override,
	});
	const result = credentials.create({
		publicKey: creation(),
		signal: controller.signal,
	});
	const rejection = expect(result).rejects.toMatchObject({
		name: "AbortError",
		message: "Passkey ceremony was aborted",
	});
	await called(authenticator.create);
	controller.abort("private abort reason");
	await rejection;
	expect(authenticator.create.mock.calls[0][0].signal.aborted).toBe(true);
	expect(override).not.toHaveBeenCalled();
	pending.resolve(registration());
	await expect(
		credentials.create({ publicKey: creation() }),
	).resolves.toHaveProperty("id", "-_8A");
});

it("rejects pre-aborted signals before provider work", async () => {
	const controller = new AbortController();
	const { credentials, authenticator } = fixture(undefined, {
		topLevel: true,
		isCurrent: () => true,
		supportedSignals: new Set([controller.signal]),
	});
	controller.abort();
	await expect(
		credentials.get({ publicKey: request(), signal: controller.signal }),
	).rejects.toMatchObject({ name: "AbortError" });
	expect(authenticator.get).not.toHaveBeenCalled();
});

it.each(["tree", "owner", "current", "url", "throwing"])(
	"cancels pending work on document lifecycle change: %s",
	async (change) => {
		let current = true;
		let throwing = false;
		const { tree, owner, credentials, authenticator } = fixture(undefined, {
			topLevel: true,
			isCurrent: () => {
				if (throwing) throw new Error("private context");
				return current;
			},
		});
		const pending = deferred<PasskeyRegistration>();
		authenticator.create.mockReturnValueOnce(pending.promise);
		const result = credentials.create({ publicKey: creation() });
		const rejection = expect(result).rejects.toMatchObject({
			name: "AbortError",
		});
		await called(authenticator.create);
		if (change === "tree") tree.close();
		if (change === "owner") owner.close();
		if (change === "current") current = false;
		if (change === "url") tree.setUrl("https://login.fixture.invalid/changed");
		if (change === "throwing") throwing = true;
		await rejection;
		expect(authenticator.create.mock.calls[0][0].signal.aborted).toBe(true);
		pending.resolve(registration());
		await expect(
			credentials.create({ publicKey: creation() }),
		).rejects.toMatchObject({ name: "InvalidStateError" });
	},
);

it("shares a provider without sharing cancellation between document brokers", async () => {
	const authenticator = provider();
	const firstPending = deferred<PasskeyRegistration>();
	const secondPending = deferred<PasskeyRegistration>();
	authenticator.create
		.mockReturnValueOnce(firstPending.promise)
		.mockReturnValueOnce(secondPending.promise);
	const first = fixture(authenticator);
	const second = fixture(authenticator);
	const firstResult = first.credentials.create({ publicKey: creation() });
	const rejection = expect(firstResult).rejects.toMatchObject({
		name: "AbortError",
	});
	await called(authenticator.create);
	const secondResult = second.credentials.create({ publicKey: creation() });
	await called(authenticator.create, 2);
	first.tree.close();
	await rejection;
	expect(authenticator.create.mock.calls[1][0].signal.aborted).toBe(false);
	firstPending.resolve(registration());
	secondPending.resolve(registration());
	await expect(secondResult).resolves.toHaveProperty("type", "public-key");
});

it("rejects overlapping ceremonies and bounds provider lifetime", async () => {
	const { credentials, authenticator } = fixture();
	const pending = deferred<PasskeyRegistration>();
	authenticator.create.mockReturnValueOnce(pending.promise);
	const result = credentials.create({
		publicKey: { ...creation(), timeout: 100 },
	});
	const rejection = expect(result).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	await expect(credentials.get({ publicKey: request() })).rejects.toMatchObject(
		{ name: "InvalidStateError" },
	);
	await rejection;
	expect(authenticator.create.mock.calls[0][0].signal.aborted).toBe(true);
	pending.resolve(registration());
});

it.each(["create", "get"] as const)(
	"sanitizes synthetic %s provider failure",
	async (method) => {
		const { credentials, authenticator } = fixture();
		authenticator[method].mockRejectedValueOnce(
			new Error("private key and provider config"),
		);
		await expect(
			credentials[method]({
				publicKey: method === "create" ? creation() : request(),
			}),
		).rejects.toMatchObject({
			name: "UnknownError",
			message: "Passkey authenticator failed",
		});
	},
);

it("requires synthetic provider consent instead of manufacturing success", async () => {
	const { credentials, authenticator } = fixture();
	authenticator.create.mockResolvedValueOnce({
		...registration(),
		userConsented: false,
	});
	await expect(
		credentials.create({ publicKey: creation() }),
	).rejects.toMatchObject({ name: "NotAllowedError" });
});

it("clones registration input synchronously with typed view offsets", async () => {
	const { credentials, authenticator } = fixture();
	const buffer = new Uint8Array([99, 251, 255, 0, 99]);
	const options = creation();
	options.challenge = new DataView(buffer.buffer, 1, 3);
	options.user.id = buffer.subarray(1, 2);
	options.excludeCredentials = [
		{ type: "public-key", id: buffer.subarray(2, 3) },
	];
	const result = credentials.create({ publicKey: options });
	buffer.fill(0);
	options.rp.name = "mutated";
	options.user.name = "mutated";
	options.pubKeyCredParams = [];
	await result;
	const delivered = authenticator.create.mock.calls[0][0].options;
	expect(delivered.challenge).toEqual(new Uint8Array([251, 255, 0]));
	expect(delivered.user.id).toEqual(new Uint8Array([251]));
	expect(delivered.excludeCredentials?.[0].id).toEqual(new Uint8Array([255]));
	expect(delivered.rp.name).toBe("Synthetic RP");
	expect(delivered.user.name).toBe("synthetic");
	expect(delivered.pubKeyCredParams).toEqual([{ type: "public-key", alg: -7 }]);
});

it("clones assertion inputs and drops guest proxies before provider work", async () => {
	const { credentials, authenticator } = fixture();
	const buffer = new Uint8Array([99, 7, 8, 99]);
	const options = request();
	options.challenge = buffer.subarray(1, 3);
	options.allowCredentials = [
		{ type: "public-key", id: new DataView(buffer.buffer, 1, 2) },
	];
	const inner = Proxy.revocable(options, {});
	const outer = Proxy.revocable({ publicKey: inner.proxy }, {});
	const result = credentials.get(outer.proxy);
	inner.revoke();
	outer.revoke();
	buffer.fill(0);
	await result;
	expect(authenticator.get.mock.calls[0][0].options.challenge).toEqual(
		new Uint8Array([7, 8]),
	);
	expect(
		authenticator.get.mock.calls[0][0].options.allowCredentials?.[0].id,
	).toEqual(new Uint8Array([7, 8]));
});

it.each(["create", "get"] as const)(
	"owns %s output bytes and exposes no provider private fields",
	async (method) => {
		const { credentials, authenticator } = fixture();
		const registrationResult = {
			...registration(),
			privateKey: "SECRET",
			config: "SECRET",
		};
		const assertionResult = {
			...(await assertion()),
			privateKey: "SECRET",
			config: "SECRET",
		};
		authenticator.create.mockResolvedValueOnce(registrationResult);
		authenticator.get.mockResolvedValueOnce(assertionResult);
		const result = await credentials[method]({
			publicKey: method === "create" ? creation() : request(),
		});
		const expectedId = new Uint8Array(result.rawId);
		new Uint8Array(result.rawId).fill(42);
		(
			(method === "create" ? registrationResult : assertionResult)
				.credentialId as Uint8Array
		).fill(43);
		expect(new Uint8Array(result.rawId)).toEqual(expectedId);
		for (const [name, bytes] of Object.entries(result.response)) {
			if (bytes === null) continue;
			const expected = new Uint8Array(bytes).slice();
			new Uint8Array(bytes).fill(44);
			expect(new Uint8Array(buffer(result.response[name]))).toEqual(expected);
		}
		expect(JSON.stringify(result)).not.toMatch(
			/SECRET|privateKey|config|userConsented|userVerified|algorithm|residentKey/,
		);
		expect(Object.keys(result)).toEqual([
			"getClientExtensionResults",
			"id",
			"rawId",
			"type",
			"response",
		]);
	},
);

it("revokes already-issued capability getters and extension methods on close", async () => {
	const { credentials, owner } = fixture();
	const result = await credentials.create({ publicKey: creation() });
	const response = result.response;
	owner.close();
	owner.close();
	expect(() => result.rawId).toThrow("Passkey broker is unavailable");
	expect(() => response.clientDataJSON).toThrow(
		"Passkey broker is unavailable",
	);
	expect(() => result.getClientExtensionResults()).toThrow(
		"Passkey broker is unavailable",
	);
	await expect(credentials.get({ publicKey: request() })).rejects.toMatchObject(
		{ name: "InvalidStateError" },
	);
});

it("rejects untrusted origins, subframes, RP overrides and extensions", async () => {
	const insecure = fixture(
		undefined,
		undefined,
		"http://login.fixture.invalid",
	);
	const framed = fixture(undefined, { topLevel: false, isCurrent: () => true });
	for (const { credentials, authenticator } of [insecure, framed]) {
		await expect(
			credentials.create({ publicKey: creation() }),
		).rejects.toMatchObject({ name: "SecurityError" });
		expect(authenticator.create).not.toHaveBeenCalled();
	}
	const { credentials } = fixture();
	await expect(
		credentials.get({ publicKey: { ...request(), rpId: "other.invalid" } }),
	).rejects.toMatchObject({ name: "SecurityError" });
	await expect(
		credentials.create({
			publicKey: { ...creation(), extensions: { prf: {} } },
		}),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	await expect(
		credentials.create({
			publicKey: {
				...creation(),
				challenge: new Uint8Array(passkeyLimits.challengeBytes + 1),
			},
		}),
	).rejects.toMatchObject({ name: "TypeError" });
});

it("snapshots trusted context rather than accepting later top-level mutation", async () => {
	const context = { topLevel: false, isCurrent: () => true };
	const { credentials } = fixture(undefined, context);
	context.topLevel = true;
	await expect(
		credentials.create({ publicKey: creation() }),
	).rejects.toMatchObject({ name: "SecurityError" });
});

it("fails closed for reused host capabilities and closure during factory invocation", async () => {
	const hostFactory = factory();
	let reused: object | undefined;
	const { credentials } = fixture(undefined, undefined, undefined, {
		createHostObject: (definition) => {
			reused ??= hostFactory.createHostObject(definition);
			return reused;
		},
	});
	expect(credentials).toBe(reused);
	await expect(
		credentials.create({ publicKey: creation() }),
	).rejects.toMatchObject({
		name: "NotSupportedError",
	});
	const tree = new DocumentTree("https://login.fixture.invalid");
	trees.push(tree);
	expect(
		() =>
			new PagePasskeys(
				tree,
				{
					createHostObject: () => {
						tree.close();
						return {};
					},
				},
				provider(),
				{
					topLevel: true,
					isCurrent: () => true,
				},
			),
	).toThrow("Passkey broker is unavailable");
});

it("rejects signal proxies and unregistered native signals by trusted identity", async () => {
	const controller = new AbortController();
	const supportedSignals = new Set([controller.signal]);
	const { credentials, authenticator } = fixture(undefined, {
		topLevel: true,
		isCurrent: () => true,
		supportedSignals,
	});
	const laterSignal = new AbortController().signal;
	supportedSignals.add(laterSignal);
	for (const signal of [
		new Proxy(controller.signal, {}),
		laterSignal,
		new AbortController().signal,
	]) {
		await expect(
			credentials.create({ publicKey: creation(), signal }),
		).rejects.toMatchObject({ name: "TypeError" });
	}
	expect(authenticator.create).not.toHaveBeenCalled();
	await expect(
		credentials.create({ publicKey: creation(), signal: controller.signal }),
	).resolves.toHaveProperty("type", "public-key");
});

it("checks native signal branding even when the trusted set contains a malformed identity", async () => {
	const malformed = { aborted: false } as AbortSignal;
	const { credentials, authenticator } = fixture(undefined, {
		topLevel: true,
		isCurrent: () => true,
		supportedSignals: new Set([malformed]),
	});
	await expect(
		credentials.create({ publicKey: creation(), signal: malformed }),
	).rejects.toMatchObject({ name: "TypeError" });
	expect(authenticator.create).not.toHaveBeenCalled();
});

it.each(["success", "invalid", "failure", "close"])(
	"releases approved signal listeners after %s",
	async (outcome) => {
		const controller = new AbortController();
		const { credentials, authenticator, owner } = fixture(undefined, {
			topLevel: true,
			isCurrent: () => true,
			supportedSignals: new Set([controller.signal]),
		});
		const add = vi.spyOn(EventTarget.prototype, "addEventListener");
		const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
		const pending = deferred<PasskeyRegistration>();
		if (outcome === "close")
			authenticator.create.mockReturnValueOnce(pending.promise);
		if (outcome === "failure")
			authenticator.create.mockRejectedValueOnce(new Error("private"));
		const result = credentials.create({
			publicKey: outcome === "invalid" ? null : creation(),
			signal: controller.signal,
		});
		if (outcome === "success") await result;
		else {
			const rejected = expect(result).rejects.toHaveProperty("name");
			if (outcome === "close") {
				await called(authenticator.create);
				owner.close();
			}
			await rejected;
		}
		const added = add.mock.contexts.flatMap((target, index) =>
			target === controller.signal ? [add.mock.calls[index][1]] : [],
		);
		const removed = remove.mock.contexts.flatMap((target, index) =>
			target === controller.signal ? [remove.mock.calls[index][1]] : [],
		);
		expect(added).toHaveLength(1);
		expect(removed).toEqual(added);
		pending.resolve(registration());
	},
);

it("blocks outer-dictionary reentrancy before the broker snapshots options", async () => {
	const { credentials, authenticator } = fixture();
	let nested: Promise<unknown> | undefined;
	const options = new Proxy(
		{ publicKey: creation() },
		{
			ownKeys(target) {
				nested = credentials
					.get({ publicKey: request() })
					.catch((error: unknown) => error);
				return Reflect.ownKeys(target);
			},
		},
	);
	await credentials.create(options);
	expect(await nested).toMatchObject({ name: "InvalidStateError" });
	expect(authenticator.create).toHaveBeenCalledOnce();
	expect(authenticator.get).not.toHaveBeenCalled();
});

it("does not revive an adapter once its trusted document becomes stale", async () => {
	let current = true;
	const { credentials, authenticator } = fixture(undefined, {
		topLevel: true,
		isCurrent: () => current,
	});
	current = false;
	await expect(
		credentials.create({ publicKey: creation() }),
	).rejects.toMatchObject({ name: "AbortError" });
	current = true;
	await expect(credentials.get({ publicKey: request() })).rejects.toMatchObject(
		{ name: "InvalidStateError" },
	);
	expect(authenticator.create).not.toHaveBeenCalled();
	expect(authenticator.get).not.toHaveBeenCalled();
});

it("rejects installation on an already closed document without creating capabilities", () => {
	const tree = new DocumentTree("https://login.fixture.invalid");
	tree.close();
	const hostFactory = factory();
	expect(
		() =>
			new PagePasskeys(tree, hostFactory, provider(), {
				topLevel: true,
				isCurrent: () => true,
			}),
	).toThrow("Document is closed");
	expect(hostFactory.definitions).toHaveLength(0);
});

it("keeps registration result views isolated from subsequent provider mutations", async () => {
	const { credentials, authenticator } = fixture();
	const providerBytes = new Uint8Array([99, 251, 255, 0, 0xa0, 99]);
	authenticator.create.mockResolvedValueOnce({
		...registration(),
		credentialId: new DataView(providerBytes.buffer, 1, 3),
		attestationObject: providerBytes.subarray(4, 5),
	});
	const result = await credentials.create({ publicKey: creation() });
	providerBytes.fill(42);
	expect(result.id).toBe("-_8A");
	expect(new Uint8Array(result.rawId)).toEqual(new Uint8Array([251, 255, 0]));
	expect(new Uint8Array(buffer(result.response.attestationObject))).toEqual(
		new Uint8Array([0xa0]),
	);
});

it("copies discoverable assertion user handles and provider response views", async () => {
	const authenticator = provider();
	authenticator.capabilities.residentKey = true;
	const { credentials } = fixture(authenticator);
	const resultBytes = await assertion();
	const authenticatorData = new Uint8Array(39);
	authenticatorData.set(
		new Uint8Array(resultBytes.authenticatorData as Uint8Array),
		1,
	);
	const signature = new Uint8Array([99, 9, 99]);
	const userHandle = new Uint8Array([99, 1, 2, 99]);
	authenticator.get.mockResolvedValueOnce({
		...resultBytes,
		authenticatorData: new DataView(authenticatorData.buffer, 1, 37),
		signature: signature.subarray(1, 2),
		userHandle: userHandle.subarray(1, 3),
	});
	const result = await credentials.get({
		publicKey: { ...request(), allowCredentials: [] },
	});
	const expectedAuthenticatorData = new Uint8Array(
		buffer(result.response.authenticatorData),
	);
	authenticatorData.fill(0);
	signature.fill(0);
	userHandle.fill(0);
	expect(new Uint8Array(buffer(result.response.authenticatorData))).toEqual(
		expectedAuthenticatorData,
	);
	expect(new Uint8Array(buffer(result.response.signature))).toEqual(
		new Uint8Array([9]),
	);
	expect(new Uint8Array(buffer(result.response.userHandle))).toEqual(
		new Uint8Array([1, 2]),
	);
});

it("does not read revoked nested registration dictionaries after provider dispatch", async () => {
	const { credentials, authenticator } = fixture();
	const options = creation();
	const user = Proxy.revocable(options.user, {});
	const relyingParty = Proxy.revocable(options.rp, {});
	const publicKey = Proxy.revocable(
		{ ...options, user: user.proxy, rp: relyingParty.proxy },
		{},
	);
	const outer = Proxy.revocable({ publicKey: publicKey.proxy }, {});
	const result = credentials.create(outer.proxy);
	user.revoke();
	relyingParty.revoke();
	publicKey.revoke();
	outer.revoke();
	await expect(result).resolves.toHaveProperty("type", "public-key");
	expect(authenticator.create.mock.calls[0][0].options.user.name).toBe(
		"synthetic",
	);
});

it("retains core error semantics for an unsupported empty discovery request", async () => {
	const { credentials, authenticator } = fixture();
	await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({
		name: "NotSupportedError",
	});
	expect(authenticator.get).not.toHaveBeenCalled();
});

it.each(
	(["create", "get"] as const).flatMap((method) =>
		[false, true].map((spoofBase) => ({ method, spoofBase })),
	),
)(
	"delivers detached $method client data from the canonical document origin with spoofBase=$spoofBase",
	async ({ method, spoofBase }) => {
		const { tree, credentials, authenticator } = fixture(
			undefined,
			undefined,
			"https://LOGIN.FIXTURE.INVALID:8443/private-path?private-query=1#private-fragment",
		);
		if (spoofBase) {
			const html = tree.createElement("html");
			const head = tree.createElement("head");
			const base = tree.createElement("base", {
				href: "https://spoof.fixture.invalid:9443/base/",
			});
			tree.append(tree.root, html);
			tree.append(html, head);
			tree.append(head, base);
			expect(documentBaseUrl(tree)).toBe(
				"https://spoof.fixture.invalid:9443/base/",
			);
		}
		const result = await credentials[method]({
			publicKey: method === "create" ? creation() : request(),
		});
		const delivered = authenticator[method].mock.calls[0][0];
		const raw = delivered.clientDataJSON;
		expect(raw).toBeInstanceOf(Uint8Array);
		if (!raw) throw new Error("Expected provider client data");
		const expected = new TextEncoder().encode(
			JSON.stringify({
				type: `webauthn.${method}`,
				challenge: "-_8A",
				origin: "https://login.fixture.invalid:8443",
				crossOrigin: false,
			}),
		);
		expect(delivered.rpId).toBe("login.fixture.invalid");
		expect(raw).toEqual(expected);
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(expected);
		expect(raw.buffer).not.toBe(result.response.clientDataJSON);
		expect(delivered.clientDataHash).toEqual(
			new Uint8Array(await crypto.subtle.digest("SHA-256", expected)),
		);
		expect(new TextDecoder().decode(raw)).not.toMatch(
			/private-path|private-query|private-fragment|spoof\.fixture/,
		);
	},
);

it.each(
	(["create", "get"] as const).flatMap((method) =>
		["outer", "publicKey"].map((location) => ({ method, location })),
	),
)(
	"rejects $method origin spoofing in $location and retains the trusted origin on recovery",
	async ({ method, location }) => {
		const { credentials, authenticator } = fixture(
			undefined,
			undefined,
			"https://login.fixture.invalid:8443/private",
		);
		const publicKey = method === "create" ? creation() : request();
		const origin = "https://spoof.fixture.invalid:9443";
		await expect(
			credentials[method](
				location === "outer"
					? { publicKey, origin }
					: { publicKey: { ...publicKey, origin } },
			),
		).rejects.toMatchObject({ name: "NotSupportedError" });
		expect(authenticator.create).not.toHaveBeenCalled();
		expect(authenticator.get).not.toHaveBeenCalled();
		const result = await credentials[method]({ publicKey });
		const delivered = authenticator[method].mock.calls[0][0];
		expect(delivered.rpId).toBe("login.fixture.invalid");
		expect(delivered.clientDataJSON).toEqual(
			new Uint8Array(result.response.clientDataJSON),
		);
		expect(
			JSON.parse(new TextDecoder().decode(delivered.clientDataJSON)).origin,
		).toBe("https://login.fixture.invalid:8443");
		expect(authenticator[method]).toHaveBeenCalledOnce();
	},
);

it.each(
	(["create", "get"] as const).flatMap((method) =>
		["path", "query", "fragment"].map((change) => ({ method, change })),
	),
)(
	"invalidates pending $method on a same-origin $change navigation before publishing client data",
	async ({ method, change }) => {
		const hostFactory = factory();
		const { tree, credentials, authenticator } = fixture(
			undefined,
			undefined,
			"https://login.fixture.invalid:8443/path?query=1#fragment",
			hostFactory,
		);
		const pendingRegistration = deferred<PasskeyRegistration>();
		const pendingAssertion = deferred<PasskeyAssertion>();
		authenticator.create.mockReturnValueOnce(pendingRegistration.promise);
		authenticator.get.mockReturnValueOnce(pendingAssertion.promise);
		const result = credentials[method]({
			publicKey: method === "create" ? creation() : request(),
		});
		const rejection = expect(result).rejects.toMatchObject({
			name: "AbortError",
			message: "Passkey ceremony was aborted",
		});
		await called(authenticator[method]);
		const delivered = authenticator[method].mock.calls[0][0];
		expect(
			JSON.parse(new TextDecoder().decode(delivered.clientDataJSON)).origin,
		).toBe("https://login.fixture.invalid:8443");
		const target = new URL(tree.url);
		if (change === "path") target.pathname = "/changed";
		if (change === "query") target.search = "?changed=1";
		if (change === "fragment") target.hash = "#changed";
		tree.setUrl(target.href);
		await rejection;
		expect(delivered.signal.aborted).toBe(true);
		pendingRegistration.resolve(registration());
		pendingAssertion.resolve(await assertion());
		await Promise.resolve();
		expect(hostFactory.definitions).toHaveLength(1);
		await expect(
			credentials[method]({
				publicKey: method === "create" ? creation() : request(),
			}),
		).rejects.toMatchObject({ name: "InvalidStateError" });
		expect(authenticator[method]).toHaveBeenCalledOnce();
	},
);

it.each(
	(["create", "get"] as const).flatMap((method) =>
		["overwrite", "transfer"].map((mutation) => ({ method, mutation })),
	),
)(
	"isolates returned $method page client data from provider-buffer $mutation before and after publication",
	async ({ method, mutation }) => {
		const { credentials, authenticator } = fixture(
			undefined,
			undefined,
			"https://login.fixture.invalid:8443/private",
		);
		const pendingRegistration = deferred<PasskeyRegistration>();
		const pendingAssertion = deferred<PasskeyAssertion>();
		authenticator.create.mockReturnValueOnce(pendingRegistration.promise);
		authenticator.get.mockReturnValueOnce(pendingAssertion.promise);
		const operation = credentials[method]({
			publicKey: method === "create" ? creation() : request(),
		});
		await called(authenticator[method]);
		const delivered = authenticator[method].mock.calls[0][0];
		const raw = delivered.clientDataJSON;
		if (!raw) throw new Error("Expected provider client data");
		const expected = raw.slice();
		const retained =
			mutation === "transfer"
				? structuredClone(raw, { transfer: [raw.buffer] })
				: raw;
		if (mutation === "transfer") expect(raw.byteLength).toBe(0);
		retained.fill(65);
		pendingRegistration.resolve(registration());
		pendingAssertion.resolve(await assertion());
		const result = await operation;
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(expected);
		expect(
			JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
		).toEqual({
			type: `webauthn.${method}`,
			challenge: "-_8A",
			origin: "https://login.fixture.invalid:8443",
			crossOrigin: false,
		});
		retained.fill(66);
		delivered.clientDataHash.fill(67);
		const pageCopy = result.response.clientDataJSON;
		new Uint8Array(pageCopy).fill(68);
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(expected);
		expect(new Uint8Array(result.response.clientDataJSON)).not.toEqual(
			retained,
		);
	},
);
