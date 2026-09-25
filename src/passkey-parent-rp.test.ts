import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { PagePasskeys } from "./page-passkeys.js";
import {
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyBrokerOptions,
	type PasskeyCreationOptions,
	type PasskeyRequestOptions,
} from "./passkeys.js";
import {
	type PinnedPublicSuffixSnapshot,
	createPinnedPublicSuffixSnapshot,
} from "./pinned-public-suffix.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

let snapshot: PinnedPublicSuffixSnapshot;
const brokers: PasskeyBroker[] = [];
const trees: DocumentTree[] = [];
const pages: PagePasskeys[] = [];
const operations = ["create", "get"] as const;
type Operation = (typeof operations)[number];
const host = "login.example.com";
const origin = `https://${host}:8443`;
const hash = (value: string) =>
	new Uint8Array(createHash("sha256").update(value).digest());

beforeAll(async () => {
	snapshot = await createPinnedPublicSuffixSnapshot(
		readFileSync(
			new URL(
				"../vendor/public-suffix/public_suffix_list.dat",
				import.meta.url,
			),
		),
	);
});
afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
	for (const page of pages.splice(0)) page.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function creation(rpId?: string): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		rp: { name: "Synthetic RP", ...(rpId === undefined ? {} : { id: rpId }) },
		user: {
			id: new Uint8Array([1]),
			name: "synthetic",
			displayName: "Synthetic",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}
function request(rpId?: string): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([1, 2, 3]),
		...(rpId === undefined ? {} : { rpId }),
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
	};
}
function registration() {
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
function assertion(rpId: string) {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(hash(rpId));
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
function fixture(
	options: PasskeyBrokerOptions = { publicSuffixSnapshot: snapshot },
) {
	const create = vi.fn<PasskeyAuthenticator["create"]>(async () =>
		registration(),
	);
	const get = vi.fn<PasskeyAuthenticator["get"]>(async (input) =>
		assertion(input.rpId),
	);
	const authenticator: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		create,
		get,
	};
	const broker = new PasskeyBroker(authenticator, options);
	brokers.push(broker);
	return { broker, authenticator, create, get };
}
function invoke(
	broker: PasskeyBroker,
	operation: Operation,
	rpId?: string,
	site = origin,
	signal?: AbortSignal,
) {
	const context = {
		origin: site,
		topLevel: true,
		isCurrent: () => true,
		signal,
	};
	return operation === "create"
		? broker.create(creation(rpId), context)
		: broker.get(request(rpId), context);
}

it.each(operations)(
	"keeps parent RPs disabled by default for %s",
	async (operation) => {
		const { broker, create, get } = fixture({});
		await expect(
			invoke(broker, operation, "example.com"),
		).rejects.toMatchObject({ name: "SecurityError" });
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
		await expect(invoke(broker, operation, host)).resolves.toMatchObject({
			type: "public-key",
		});
	},
);

it.each(operations)(
	"keeps omitted %s RP equal to the origin host, not its registrable parent",
	async (operation) => {
		const { broker, create, get } = fixture();
		const result = await invoke(broker, operation);
		const delivered = (operation === "create" ? create : get).mock.calls[0][0];
		expect(delivered.rpId).toBe(host);
		expect(
			JSON.parse(new TextDecoder().decode(result.response.clientDataJSON))
				.origin,
		).toBe(origin);
	},
);

const allowed = [
	["login.example.com", "example.com"],
	["auth.accounts.example.com", "accounts.example.com"],
	["auth.accounts.example.com", "example.com"],
	["auth.alice.blogspot.com", "alice.blogspot.com"],
	["auth.alice.github.io", "alice.github.io"],
	["auth.www.ck", "www.ck"],
	["auth.city.kawasaki.jp", "city.kawasaki.jp"],
	[
		"auth.tenant.eastus-01.azurewebsites.net",
		"tenant.eastus-01.azurewebsites.net",
	],
	["auth.xn--85x722f.xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn"],
] as const;
for (const operation of operations) {
	it.each(allowed)(
		`${operation} binds %s to approved parent %s while preserving its origin`,
		async (hostname, rpId) => {
			const { broker, create, get } = fixture();
			const site = `https://${hostname}:8443`;
			const result = await invoke(broker, operation, rpId, site);
			const delivered = (operation === "create" ? create : get).mock
				.calls[0][0];
			expect(delivered.rpId).toBe(rpId);
			expect(delivered.options).toMatchObject(
				operation === "create" ? { rp: { id: rpId } } : { rpId },
			);
			expect(delivered.clientDataHash).toEqual(
				new Uint8Array(
					createHash("sha256")
						.update(new Uint8Array(result.response.clientDataJSON))
						.digest(),
				),
			);
			expect(
				JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
			).toMatchObject({
				origin: site,
				type: `webauthn.${operation}`,
				challenge: "AQID",
				crossOrigin: false,
			});
			if ("authenticatorData" in result.response)
				expect(
					new Uint8Array(result.response.authenticatorData).subarray(0, 32),
				).toEqual(hash(rpId));
		},
	);
}

const denied = [
	[host, "com"],
	[host, "m.login.example.com"],
	[host, "other.example.com"],
	[host, "ample.com"],
	[host, "example.com.evil.test"],
	["auth.example.co.uk", "co.uk"],
	["auth.alice.blogspot.com", "blogspot.com"],
	["auth.alice.github.io", "github.io"],
	["auth.foo.ck", "foo.ck"],
	["auth.foo.kawasaki.jp", "foo.kawasaki.jp"],
	["auth.foo.kawasaki.jp", "kawasaki.jp"],
	["auth.city.kawasaki.jp", "kawasaki.jp"],
	["tenant.s3.amazonaws.com", "amazonaws.com"],
	["s3.amazonaws.com", "amazonaws.com"],
	["auth.tenant.eastus-01.azurewebsites.net", "eastus-01.azurewebsites.net"],
	[host, "example.com."],
	[host, "EXAMPLE.COM"],
	[host, ".example.com"],
	[host, "https://example.com"],
	[host, "example.com:8443"],
	[host, "example.com/path"],
	[host, "example%2ecom"],
	[host, "example。com"],
	[host, "127.0.0.1"],
	["auth.xn--85x722f.xn--55qx5d.cn", "食狮.公司.cn"],
] as const;
for (const operation of operations) {
	it.each(denied)(
		`${operation} rejects unauthorized/noncanonical parent %s -> %s before provider access`,
		async (hostname, rpId) => {
			const { broker, create, get } = fixture();
			await expect(
				invoke(broker, operation, rpId, `https://${hostname}:8443`),
			).rejects.toMatchObject({ name: "SecurityError" });
			expect(create).not.toHaveBeenCalled();
			expect(get).not.toHaveBeenCalled();
		},
	);
}

it("rejects lookalike, cloned and proxied policy snapshots without invoking their getters", () => {
	const getter = vi.fn(() => {
		throw new Error("Untrusted snapshot getter");
	});
	const hostile = Object.defineProperty({}, "match", { get: getter });
	const { authenticator } = fixture();
	for (const value of [
		{ ...snapshot },
		Object.create(snapshot),
		new Proxy(snapshot, {}),
		hostile,
		null,
	]) {
		expect(
			() =>
				new PasskeyBroker(authenticator, {
					publicSuffixSnapshot: value as PinnedPublicSuffixSnapshot,
				}),
		).toThrow(expect.objectContaining({ name: "TypeError" }));
	}
	expect(getter).not.toHaveBeenCalled();
});

it("snapshots trusted constructor configuration and does not enable later adoption", async () => {
	const configured: PasskeyBrokerOptions = { publicSuffixSnapshot: snapshot };
	const enabled = fixture(configured);
	configured.publicSuffixSnapshot = undefined;
	await expect(
		invoke(enabled.broker, "get", "example.com"),
	).resolves.toMatchObject({ type: "public-key" });
	const absent: PasskeyBrokerOptions = {};
	const disabled = fixture(absent);
	absent.publicSuffixSnapshot = snapshot;
	await expect(
		invoke(disabled.broker, "get", "example.com"),
	).rejects.toMatchObject({ name: "SecurityError" });
});

it("does not invoke constructor policy getters or inherit an ambient policy", async () => {
	const getter = vi.fn(() => snapshot);
	const { authenticator } = fixture();
	const configured = Object.defineProperty({}, "publicSuffixSnapshot", {
		get: getter,
	});
	expect(() => new PasskeyBroker(authenticator, configured)).toThrow(
		expect.objectContaining({ name: "TypeError" }),
	);
	expect(getter).not.toHaveBeenCalled();
	const inherited = fixture(Object.create({ publicSuffixSnapshot: snapshot }));
	await expect(
		invoke(inherited.broker, "get", "example.com"),
	).rejects.toMatchObject({
		name: "SecurityError",
	});
});

it("requires an own data policy field in trusted page context", async () => {
	const { authenticator } = fixture();
	const tree = new DocumentTree(origin);
	trees.push(tree);
	const factory: ScriptHostObjectFactory = {
		createHostObject: (definition) => Object.assign({}, definition.methods),
	};
	const getter = vi.fn(() => snapshot);
	const context = { topLevel: true, isCurrent: () => true };
	Object.defineProperty(context, "publicSuffixSnapshot", { get: getter });
	expect(() => new PagePasskeys(tree, factory, authenticator, context)).toThrow(
		expect.objectContaining({ name: "TypeError" }),
	);
	expect(getter).not.toHaveBeenCalled();
	const inherited = Object.assign(
		Object.create({ publicSuffixSnapshot: snapshot }),
		{
			topLevel: true,
			isCurrent: () => true,
		},
	);
	const page = new PagePasskeys(tree, factory, authenticator, inherited);
	pages.push(page);
	const credentials = page.credentials as {
		get(options: unknown): Promise<object>;
	};
	await expect(
		credentials.get({ publicKey: request("example.com") }),
	).rejects.toMatchObject({
		name: "SecurityError",
	});
});

it("rejects the origin-host hash for a parent assertion even if the provider mutates its options", async () => {
	const { broker, get } = fixture();
	get.mockImplementationOnce(async (input) => {
		input.rpId = host;
		input.options.rpId = host;
		return assertion(host);
	});
	await expect(invoke(broker, "get", "example.com")).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	await expect(invoke(broker, "get", "example.com")).resolves.toMatchObject({
		type: "public-key",
	});
});

it.each(operations)(
	"still requires consent for parent %s",
	async (operation) => {
		const { broker, create, get } = fixture();
		create.mockResolvedValueOnce({ ...registration(), userConsented: false });
		get.mockResolvedValueOnce({
			...assertion("example.com"),
			userConsented: false,
		});
		await expect(
			invoke(broker, operation, "example.com"),
		).rejects.toMatchObject({ name: "NotAllowedError" });
	},
);

it.each(operations)(
	"cancels a pending parent %s and rejects its late result",
	async (operation) => {
		const { broker, create, get } = fixture();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		create.mockImplementationOnce(async () => {
			await gate;
			return registration();
		});
		get.mockImplementationOnce(async () => {
			await gate;
			return assertion("example.com");
		});
		const controller = new AbortController();
		const pending = invoke(
			broker,
			operation,
			"example.com",
			origin,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		const called = operation === "create" ? create : get;
		await vi.waitFor(() => expect(called).toHaveBeenCalledOnce());
		const delivered = called.mock.calls[0][0];
		expect(delivered.rpId).toBe("example.com");
		controller.abort();
		await rejected;
		expect(delivered.signal.aborted).toBe(true);
		release();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(called).toHaveBeenCalledOnce();
	},
);

it.each(operations)(
	"passes trusted page snapshot adoption into %s without letting page options supply it",
	async (operation) => {
		const { authenticator } = fixture();
		const tree = new DocumentTree(`${origin}/account?query=private`);
		trees.push(tree);
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				const value = Object.assign(Object.create(null), definition.methods);
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(value, name, {
						get: descriptor.get,
						enumerable: true,
					});
				return value;
			},
		};
		const page = new PagePasskeys(tree, factory, authenticator, {
			topLevel: true,
			isCurrent: () => true,
			publicSuffixSnapshot: snapshot,
		});
		pages.push(page);
		const credentials = page.credentials as Record<
			Operation,
			(
				options: unknown,
			) => Promise<{ response: { clientDataJSON: ArrayBuffer } }>
		>;
		const publicKey =
			operation === "create" ? creation("example.com") : request("example.com");
		await expect(
			credentials[operation]({ publicKey, publicSuffixSnapshot: snapshot }),
		).rejects.toMatchObject({ name: "NotSupportedError" });
		const result = await credentials[operation]({ publicKey });
		expect(
			JSON.parse(new TextDecoder().decode(result.response.clientDataJSON))
				.origin,
		).toBe(origin);
	},
);
