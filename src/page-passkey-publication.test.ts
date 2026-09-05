import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { PagePasskeys } from "./page-passkeys.js";
import type {
	PasskeyAssertion,
	PasskeyAuthenticator,
	PasskeyCreationOptions,
	PasskeyRegistration,
	PasskeyRequestOptions,
} from "./passkeys.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface Credential {
	readonly id: string;
	readonly response: object;
	getClientExtensionResults(): object;
}
interface Credentials {
	create(options: unknown): Promise<Credential>;
	get(options: unknown): Promise<Credential>;
}
type Method = "create" | "get";
const methods = ["create", "get"] as const;
const payloadKinds = [
	"string",
	"object",
	"spoofed",
	"accessors",
	"proxy",
] as const;
const messages = {
	NotSupportedError: "Passkey requirement is not supported",
	InvalidStateError: "Passkey broker is unavailable",
	AbortError: "Passkey ceremony was aborted",
	UnknownError: "Passkey authenticator failed",
	NotAllowedError: "Passkey ceremony was not allowed",
	SecurityError: "Passkey origin is not supported",
};
const owners: PagePasskeys[] = [];
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function creation(): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([4]),
			name: "synthetic",
			displayName: "Synthetic",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}

function request(): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
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

async function assertion(rpId: string): Promise<PasskeyAssertion> {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
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

function hostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.assign(Object.create(null), definition.methods);
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, descriptor);
	return result;
}

function fixture(url = "https://login.fixture.invalid/") {
	vi.useFakeTimers();
	const tree = new DocumentTree(url);
	trees.push(tree);
	const controller = new AbortController();
	let current = true;
	const authenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform" as const,
		},
		create: vi.fn<PasskeyAuthenticator["create"]>(async () => registration()),
		get: vi.fn<PasskeyAuthenticator["get"]>(async ({ rpId }) =>
			assertion(rpId),
		),
	};
	const factoryCalls =
		vi.fn<(definition: ScriptHostObjectDefinition) => void>();
	let implementation = hostObject;
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			factoryCalls(definition);
			return implementation(definition);
		},
	};
	return {
		tree,
		controller,
		authenticator,
		factory,
		factoryCalls,
		setFactory: (next: typeof hostObject) => {
			implementation = next;
		},
		invalidate: () => {
			current = false;
		},
		build() {
			const owner = new PagePasskeys(tree, factory, authenticator, {
				topLevel: true,
				isCurrent: () => current,
				supportedSignals: new Set([controller.signal]),
			});
			owners.push(owner);
			return { owner, credentials: owner.credentials as Credentials };
		},
	};
}

function payload(kind: (typeof payloadKinds)[number]) {
	const reads = vi.fn(() => {
		throw new Error("RAW_FACTORY_ACCESS");
	});
	let value: unknown;
	if (kind === "string") value = "RAW_FACTORY_STRING";
	else if (kind === "object") value = { privateDetail: "RAW_FACTORY_OBJECT" };
	else if (kind === "spoofed")
		value = {
			name: "AbortError",
			message: "RAW_FACTORY_MESSAGE",
			stack: "RAW_FACTORY_STACK",
		};
	else if (kind === "accessors") {
		value = Object.create(null);
		for (const name of ["name", "message", "stack", "cause", "constructor"])
			Object.defineProperty(value, name, { get: reads });
	} else
		value = new Proxy(
			{},
			{
				get: reads,
				getPrototypeOf: reads,
				ownKeys: reads,
				getOwnPropertyDescriptor: reads,
			},
		);
	return { value, reads };
}

async function rejected(operation: () => unknown): Promise<unknown> {
	try {
		await operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected synthetic operation to reject");
}

function fixed(error: unknown, name: keyof typeof messages) {
	expect(error).toBeInstanceOf(Error);
	expect(error).toMatchObject({ name, message: messages[name] });
	expect(Object.hasOwn(error as object, "cause")).toBe(false);
	expect(String((error as Error).stack)).not.toContain("RAW_FACTORY");
}

function options(method: Method, signal?: AbortSignal) {
	return { publicKey: method === "create" ? creation() : request(), signal };
}

function signalAudit(signal: AbortSignal) {
	const added = vi.spyOn(EventTarget.prototype, "addEventListener");
	const removed = vi.spyOn(EventTarget.prototype, "removeEventListener");
	return () => {
		const listeners = added.mock.contexts.flatMap((target, index) =>
			target === signal ? [added.mock.calls[index][1]] : [],
		);
		const released = removed.mock.contexts.flatMap((target, index) =>
			target === signal ? [removed.mock.calls[index][1]] : [],
		);
		expect(listeners).toHaveLength(1);
		expect(released).toEqual(listeners);
	};
}

it.each(payloadKinds)(
	"fixes initial credentials publication throwing %s without reading the payload",
	async (kind) => {
		const test = fixture();
		const raw = payload(kind);
		test.setFactory(() => {
			throw raw.value;
		});
		const error = await rejected(() => test.build());
		expect(raw.reads).not.toHaveBeenCalled();
		expect(error === raw.value).toBe(false);
		fixed(error, "NotSupportedError");
		expect(test.factoryCalls).toHaveBeenCalledTimes(1);
		expect(test.authenticator.create).not.toHaveBeenCalled();
		expect(test.authenticator.get).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		test.tree.close();
	},
);

it.each(
	methods.flatMap((method) =>
		["response", "credential", "extensions"].flatMap((stage) =>
			payloadKinds.map((kind) => ({ method, stage, kind })),
		),
	),
)(
	"fixes $method $stage publication throwing $kind and releases signals",
	async ({ method, stage, kind }) => {
		const test = fixture();
		const { owner, credentials } = test.build();
		const raw = payload(kind);
		const call = stage === "response" ? 2 : stage === "credential" ? 3 : 4;
		test.setFactory((definition) => {
			if (test.factoryCalls.mock.calls.length === call) throw raw.value;
			return hostObject(definition);
		});
		const assertReleased = signalAudit(test.controller.signal);
		let credential: Credential | undefined;
		const error = await rejected(async () => {
			credential = await credentials[method](
				options(method, test.controller.signal),
			);
			if (stage === "extensions") return credential.getClientExtensionResults();
			return credential;
		});
		expect(raw.reads).not.toHaveBeenCalled();
		expect(error === raw.value).toBe(false);
		fixed(error, "NotSupportedError");
		expect(test.factoryCalls).toHaveBeenCalledTimes(call);
		expect(test.authenticator[method]).toHaveBeenCalledTimes(1);
		assertReleased();
		expect(vi.getTimerCount()).toBe(0);
		if (stage !== "extensions") expect(credential).toBeUndefined();
		test.setFactory(hostObject);
		if (credential)
			expect(credential.getClientExtensionResults()).toEqual(
				Object.create(null),
			);
		else
			await expect(
				credentials[method](options(method)),
			).resolves.toHaveProperty("type", "public-key");
		owner.close();
	},
);

it.each(
	methods.flatMap((method) =>
		["response", "credential", "extensions"].flatMap((stage) =>
			["close-return", "close-throw", "stale-throw"].map((action) => ({
				method,
				stage,
				action,
			})),
		),
	),
)(
	"rejects $method $stage after reentrant $action without stale publication",
	async ({ method, stage, action }) => {
		const test = fixture();
		const { owner, credentials } = test.build();
		const raw = payload("accessors");
		const call = stage === "response" ? 2 : stage === "credential" ? 3 : 4;
		const retained: object[] = [];
		test.setFactory((definition) => {
			const capability = hostObject(definition);
			retained.push(capability);
			if (test.factoryCalls.mock.calls.length === call) {
				if (action === "stale-throw") test.invalidate();
				else owner.close();
				if (action !== "close-return") throw raw.value;
			}
			return capability;
		});
		const assertReleased = signalAudit(test.controller.signal);
		let credential: Credential | undefined;
		const error = await rejected(async () => {
			credential = await credentials[method](
				options(method, test.controller.signal),
			);
			if (stage === "extensions") return credential.getClientExtensionResults();
			return credential;
		});
		expect(raw.reads).not.toHaveBeenCalled();
		fixed(error, action === "stale-throw" ? "AbortError" : "InvalidStateError");
		assertReleased();
		expect(test.factoryCalls).toHaveBeenCalledTimes(call);
		for (const capability of retained) {
			for (const descriptor of Object.values(
				Object.getOwnPropertyDescriptors(capability),
			)) {
				if (descriptor.get)
					expect(descriptor.get).toThrow("Passkey broker is unavailable");
			}
		}
		const published = credential;
		if (published)
			expect(() => published.id).toThrow("Passkey broker is unavailable");
		fixed(
			await rejected(() => credentials[method](options(method))),
			"InvalidStateError",
		);
		expect(test.factoryCalls).toHaveBeenCalledTimes(call);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(["return", "throw"])(
	"rejects initial publication after factory closes its tree and %ss",
	async (action) => {
		const test = fixture();
		const raw = payload("proxy");
		test.setFactory(() => {
			test.tree.close();
			if (action === "throw") throw raw.value;
			return {};
		});
		fixed(await rejected(() => test.build()), "InvalidStateError");
		expect(raw.reads).not.toHaveBeenCalled();
		expect(test.authenticator.create).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(
	methods.flatMap((method) =>
		["response", "credential"].map((stage) => ({ method, stage })),
	),
)(
	"still rejects reused $method $stage host capabilities",
	async ({ method, stage }) => {
		const test = fixture();
		const { owner, credentials } = test.build();
		let response: object = credentials;
		test.setFactory((definition) => {
			if (stage === "response") return credentials;
			if (test.factoryCalls.mock.calls.length === 2) {
				response = hostObject(definition);
				return response;
			}
			return response;
		});
		const assertReleased = signalAudit(test.controller.signal);
		const error = await rejected(() =>
			credentials[method](options(method, test.controller.signal)),
		);
		fixed(error, "NotSupportedError");
		expect(test.factoryCalls).toHaveBeenCalledTimes(
			stage === "response" ? 2 : 3,
		);
		assertReleased();
		expect(vi.getTimerCount()).toBe(0);
		owner.close();
	},
);

it.each(methods)(
	"never calls the factory for retained %s or extension methods after owner closure",
	async (method) => {
		const test = fixture();
		const { owner, credentials } = test.build();
		const credential = await credentials[method](options(method));
		const extension = credential.getClientExtensionResults;
		owner.close();
		const raw = payload("accessors");
		test.setFactory(() => {
			throw raw.value;
		});
		const count = test.factoryCalls.mock.calls.length;
		fixed(
			await rejected(() => credentials[method](options(method))),
			"InvalidStateError",
		);
		fixed(await rejected(extension), "InvalidStateError");
		expect(test.factoryCalls).toHaveBeenCalledTimes(count);
		expect(raw.reads).not.toHaveBeenCalled();
	},
);

it.each(
	methods.flatMap((method) =>
		["provider", "consent", "origin"].map((reason) => ({ method, reason })),
	),
)(
	"preserves broker $method $reason rejection rather than relabeling it as a factory failure",
	async ({ method, reason }) => {
		const test = fixture(
			reason === "origin" ? "http://login.fixture.invalid/" : undefined,
		);
		const { credentials } = test.build();
		if (reason === "provider")
			test.authenticator[method].mockRejectedValueOnce({
				name: "NotAllowedError",
				message: "RAW_PROVIDER",
			});
		if (reason === "consent") {
			test.authenticator.create.mockResolvedValueOnce({
				...registration(),
				userConsented: false,
			});
			test.authenticator.get.mockResolvedValueOnce({
				...(await assertion("login.fixture.invalid")),
				userConsented: false,
			});
		}
		const assertReleased = signalAudit(test.controller.signal);
		const error = await rejected(() =>
			credentials[method](options(method, test.controller.signal)),
		);
		fixed(
			error,
			reason === "provider"
				? "UnknownError"
				: reason === "consent"
					? "NotAllowedError"
					: "SecurityError",
		);
		expect(String((error as Error).stack)).not.toContain("RAW_PROVIDER");
		expect(test.factoryCalls).toHaveBeenCalledTimes(1);
		expect(test.authenticator[method]).toHaveBeenCalledTimes(
			reason === "origin" ? 0 : 1,
		);
		assertReleased();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(methods)(
	"aborts pending %s without late publication and releases the signal",
	async (method) => {
		const test = fixture();
		const { credentials } = test.build();
		let finishCreate: (value: PasskeyRegistration) => void = () => {};
		let finishGet: (value: PasskeyAssertion) => void = () => {};
		test.authenticator.create.mockReturnValueOnce(
			new Promise((resolve) => {
				finishCreate = resolve;
			}),
		);
		test.authenticator.get.mockReturnValueOnce(
			new Promise((resolve) => {
				finishGet = resolve;
			}),
		);
		const assertReleased = signalAudit(test.controller.signal);
		const error = rejected(() =>
			credentials[method](options(method, test.controller.signal)),
		);
		await vi.waitFor(() =>
			expect(test.authenticator[method]).toHaveBeenCalledTimes(1),
		);
		test.controller.abort();
		fixed(await error, "AbortError");
		expect(test.authenticator[method].mock.calls[0][0].signal.aborted).toBe(
			true,
		);
		assertReleased();
		finishCreate(registration());
		finishGet(await assertion("login.fixture.invalid"));
		await Promise.resolve();
		expect(test.factoryCalls).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	},
);
