import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { NodePasskeyAuthenticator } from "./node-passkey-authenticator.js";
import {
	type PageBindingContext,
	type PageBindingOptions,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { type PasskeyAuthenticator, PasskeyBroker } from "./passkeys.js";

const documents: DocumentTree[] = [];
const owners: PageBindings[] = [];
afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of documents.splice(0)) tree.close();
});

it("does not serialize the trusted authenticator's private state", () => {
	const broker = new PasskeyBroker({
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		...{ privateMaterial: "SYNTHETIC_PRIVATE_MARKER" },
		async create() {
			throw new Error("Unused synthetic provider");
		},
		async get() {
			throw new Error("Unused synthetic provider");
		},
	});
	try {
		expect(JSON.stringify(broker)).not.toContain("SYNTHETIC_PRIVATE_MARKER");
		expect(Object.getOwnPropertyNames(broker)).not.toContain("authenticator");
	} finally {
		broker.close();
	}
});

function fixture(enabled = true, provider?: PasskeyAuthenticator) {
	const document = new DocumentTree("https://login.fixture.invalid/path");
	documents.push(document);
	const interactions = new DocumentInteractions(document);
	const context: PageBindingContext = {
		createHostObject(definition) {
			const capability = Object.assign(Object.create(null), definition.methods);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(capability, name, {
					get: descriptor.get,
					set: descriptor.set,
				});
			return capability;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => {},
	};
	const create = vi.fn<PasskeyAuthenticator["create"]>(async () => ({
		credentialId: new Uint8Array([1, 2]),
		attestationObject: new Uint8Array([0xa0]),
		algorithm: -7,
		residentKey: false,
		userConsented: true,
		userPresent: true,
		userVerified: false,
	}));
	const authenticator: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		create,
		get: vi.fn(async () => {
			throw new Error("Synthetic unavailable assertion");
		}),
	};
	let current = true;
	const options: PageBindingOptions = enabled
		? {
				passkeys: {
					authenticator: provider ?? authenticator,
					context: { topLevel: true, isCurrent: () => current },
				},
			}
		: {};
	const owner = new PageBindings(
		{ document, interactions },
		context,
		{
			isClosed: () => false,
			startCallback: () => {
				throw new Error("No callback fixture");
			},
			fail: () => {},
			onConsoleCall: () => {},
		},
		options,
	);
	owners.push(owner);
	const credentials = (
		owner.navigator as
			| {
					credentials?: {
						create(options: unknown): Promise<{
							id: string;
							response: { clientDataJSON: ArrayBuffer };
						}>;
						get(options: unknown): Promise<unknown>;
					};
			  }
			| undefined
	)?.credentials;
	return {
		owner,
		document,
		options,
		get credentials() {
			if (!credentials)
				throw new Error("Missing synthetic credentials capability");
			return credentials;
		},
		create,
		invalidate: () => {
			current = false;
		},
	};
}

function creation() {
	return {
		publicKey: {
			challenge: new Uint8Array([3, 4]),
			rp: { name: "Synthetic RP" },
			user: {
				id: new Uint8Array([5]),
				name: "synthetic",
				displayName: "Synthetic",
			},
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		},
	};
}

it("does not invent navigator credentials without an explicit authenticator", () => {
	const { owner, document, options } = fixture(false);
	expect(pageBindingGlobalNames(document, options)).toContain("navigator");
	expect(owner.globals.navigator).toBe(owner.navigator);
	expect((owner.window as { navigator: object }).navigator).toBe(
		owner.navigator,
	);
	expect(owner.navigator).not.toHaveProperty("credentials");
});

it("shares the configured credentials capability between navigator and Window", () => {
	const { owner, document, options, credentials } = fixture();
	expect(pageBindingGlobalNames(document, options)).toContain("navigator");
	expect(owner.globals.navigator).toBe(owner.navigator);
	expect((owner.window as { navigator: object }).navigator).toBe(
		owner.navigator,
	);
	expect((owner.navigator as { credentials: object }).credentials).toBe(
		credentials,
	);
	expect(owner.navigator).toHaveProperty("userAgent", "AgentBrowser/0.1");
	expect(owner.navigator).not.toHaveProperty(
		"isUserVerifyingPlatformAuthenticatorAvailable",
	);
});

it("creates a native public credential with actual document origin and no provider exposure", async () => {
	const { owner, credentials, create } = fixture();
	const credential = await credentials.create(creation());
	expect(credential.id).toBe("AQI");
	expect(
		JSON.parse(new TextDecoder().decode(credential.response.clientDataJSON)),
	).toEqual({
		type: "webauthn.create",
		challenge: "AwQ",
		origin: "https://login.fixture.invalid",
		crossOrigin: false,
	});
	expect(create.mock.calls[0][0].rpId).toBe("login.fixture.invalid");
	expect(owner.navigator).not.toHaveProperty("authenticator");
	expect(credentials).not.toHaveProperty("close");
});

it("keeps provider exceptions out of navigator.credentials.get", async () => {
	const { credentials } = fixture();
	await expect(
		credentials.get({
			publicKey: {
				challenge: new Uint8Array([1]),
				allowCredentials: [{ type: "public-key", id: new Uint8Array([2]) }],
			},
		}),
	).rejects.toMatchObject({ name: "UnknownError" });
});

it.each(["owner", "document", "obsolete"])(
	"revokes page passkeys when the %s closes or becomes obsolete",
	async (mode) => {
		const { owner, document, credentials, create, invalidate } = fixture();
		if (mode === "owner") owner.close();
		else if (mode === "document") document.close();
		else invalidate();
		await expect(credentials.create(creation())).rejects.toMatchObject({
			name: mode === "obsolete" ? "AbortError" : "InvalidStateError",
		});
		expect(create).not.toHaveBeenCalled();
		if (mode !== "obsolete")
			expect(
				() => (owner.navigator as { credentials: object }).credentials,
			).toThrow();
	},
);

it("denies page-supplied origin and unsupported verification without calling the provider", async () => {
	const { credentials, create } = fixture();
	await expect(
		credentials.create({ ...creation(), origin: "https://evil.invalid" }),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	const input = creation();
	await expect(
		credentials.create({
			publicKey: {
				...input.publicKey,
				authenticatorSelection: { userVerification: "required" },
			},
		}),
	).rejects.toMatchObject({ name: "NotSupportedError" });
	expect(create).not.toHaveBeenCalled();
});

it("runs explicit synthetic approval and real ephemeral signing through the page API", async () => {
	const approvals: string[] = [];
	const provider = new NodePasskeyAuthenticator({
		approve: async (request) => {
			approvals.push(`${request.operation}:${request.rpId}`);
			return { approved: true };
		},
	});
	try {
		const { credentials } = fixture(true, provider);
		const registered = await credentials.create(creation());
		const assertion = (await credentials.get({
			publicKey: { challenge: new Uint8Array([9, 8]) },
		})) as {
			id: string;
			response: {
				clientDataJSON: ArrayBuffer;
				authenticatorData: ArrayBuffer;
				signature: ArrayBuffer;
				userHandle: ArrayBuffer;
			};
		};
		expect(assertion.id).toBe(registered.id);
		expect(approvals).toEqual([
			"create:login.fixture.invalid",
			"get:login.fixture.invalid",
		]);
		expect(
			JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON)),
		).toEqual({
			type: "webauthn.get",
			challenge: "CQg",
			origin: "https://login.fixture.invalid",
			crossOrigin: false,
		});
		const data = new Uint8Array(assertion.response.authenticatorData);
		expect(data.slice(0, 32)).toEqual(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode("login.fixture.invalid"),
				),
			),
		);
		expect(data[32]).toBe(1);
		expect(
			new DataView(assertion.response.authenticatorData).getUint32(33),
		).toBe(1);
		expect(new Uint8Array(assertion.response.userHandle)).toEqual(
			new Uint8Array([5]),
		);
		expect(new Uint8Array(assertion.response.signature)[0]).toBe(0x30);
	} finally {
		provider.close();
	}
});
