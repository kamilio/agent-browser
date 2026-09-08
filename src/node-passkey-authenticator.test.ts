import {
	type KeyObject,
	createHash,
	createPublicKey,
	generateKeyPairSync,
	sign,
	verify,
} from "node:crypto";
import { inspect } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
	type NodePasskeyApprovalDecision,
	type NodePasskeyApprovalRequest,
	NodePasskeyAuthenticator,
	type NodePasskeyAuthenticatorOptions,
} from "./node-passkey-authenticator.js";
import {
	type PasskeyAssertion,
	PasskeyBroker,
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
} from "./passkeys.js";

const cryptoHooks = vi.hoisted(() => ({
	afterGenerate: undefined as (() => void) | undefined,
	afterSign: undefined as (() => void) | undefined,
}));

vi.mock("node:crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:crypto")>();
	return {
		...actual,
		generateKeyPairSync: vi.fn(
			(type: "ec", options: { namedCurve: string }) => {
				const result = actual.generateKeyPairSync(type, options);
				cryptoHooks.afterGenerate?.();
				return result;
			},
		),
		sign: vi.fn(
			(
				algorithm: string,
				data: Buffer,
				options: { key: KeyObject; dsaEncoding: "der" },
			) => {
				const result = actual.sign(algorithm, data, options);
				cryptoHooks.afterSign?.();
				return result;
			},
		),
	};
});

const authenticators: NodePasskeyAuthenticator[] = [];
afterEach(() => {
	for (const authenticator of authenticators.splice(0)) authenticator.close();
	vi.clearAllMocks();
	vi.useRealTimers();
	cryptoHooks.afterGenerate = undefined;
	cryptoHooks.afterSign = undefined;
});

function hash(value: string | Uint8Array) {
	return createHash("sha256").update(value).digest();
}

function buffer(value: BufferSource): Buffer {
	return ArrayBuffer.isView(value)
		? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		: Buffer.from(value);
}

function context(rpId = "login.fixture.invalid"): PasskeyProviderContext {
	return {
		rpId,
		clientDataHash: new Uint8Array(hash("synthetic client data")),
		signal: new AbortController().signal,
	};
}

function creation(): PasskeyProviderContext & {
	options: PasskeyCreationOptions;
} {
	return {
		...context(),
		options: {
			challenge: new Uint8Array([1, 2, 3]),
			rp: { name: "Synthetic RP" },
			user: {
				id: new Uint8Array([11, 22]),
				name: "synthetic",
				displayName: "Synthetic account",
			},
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		},
	};
}

function assertion(
	credentialId?: BufferSource,
): PasskeyProviderContext & { options: PasskeyRequestOptions } {
	return {
		...context(),
		options: {
			challenge: new Uint8Array([1, 2, 3]),
			...(credentialId === undefined
				? {}
				: { allowCredentials: [{ type: "public-key", id: credentialId }] }),
		},
	};
}

function fixture(options: NodePasskeyAuthenticatorOptions = {}) {
	const approve = vi.fn<
		NonNullable<NodePasskeyAuthenticatorOptions["approve"]>
	>(async () => ({ approved: true }));
	const authenticator = new NodePasskeyAuthenticator({ approve, ...options });
	authenticators.push(authenticator);
	return { authenticator, approve };
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

type Decoded = number | string | Buffer | Map<Decoded, Decoded>;
function decode(
	encoded: Buffer,
	start = 0,
): { value: Decoded; offset: number } {
	let offset = start;
	const header = encoded[offset++];
	const major = header >>> 5;
	let count = header & 31;
	if (count === 24) count = encoded[offset++];
	else if (count === 25) {
		count = encoded.readUInt16BE(offset);
		offset += 2;
	} else if (count >= 26) throw new Error("Unexpected fixture CBOR length");
	if (major === 0) return { value: count, offset };
	if (major === 1) return { value: -1 - count, offset };
	if (major === 2 || major === 3) {
		const value = encoded.subarray(offset, offset + count);
		expect(value.length).toBe(count);
		return {
			value: major === 2 ? value : value.toString("utf8"),
			offset: offset + count,
		};
	}
	if (major !== 5) throw new Error("Unexpected fixture CBOR major type");
	const value = new Map<Decoded, Decoded>();
	for (let index = 0; index < count; index++) {
		const key = decode(encoded, offset);
		const entry = decode(encoded, key.offset);
		expect(value.has(key.value)).toBe(false);
		value.set(key.value, entry.value);
		offset = entry.offset;
	}
	return { value, offset };
}

function registrationPublicKey(
	registration: PasskeyRegistration,
	rpId = context().rpId,
): KeyObject {
	const encoded = buffer(registration.attestationObject);
	const decoded = decode(encoded);
	expect(decoded.offset).toBe(encoded.length);
	expect(decoded.value).toBeInstanceOf(Map);
	const attestation = decoded.value as Map<string, Decoded>;
	expect([...attestation.keys()].sort()).toEqual([
		"attStmt",
		"authData",
		"fmt",
	]);
	expect(attestation.get("fmt")).toBe("none");
	expect(attestation.get("attStmt")).toEqual(new Map());
	const data = attestation.get("authData") as Buffer;
	expect(Buffer.isBuffer(data)).toBe(true);
	expect(data.subarray(0, 32)).toEqual(hash(rpId));
	expect(data[32]).toBe(0x41);
	expect(data.readUInt32BE(33)).toBe(0);
	expect(data.subarray(37, 53)).toEqual(Buffer.alloc(16));
	expect(data.readUInt16BE(53)).toBe(32);
	expect(data.subarray(55, 87)).toEqual(buffer(registration.credentialId));
	const decodedCose = decode(data, 87);
	expect(decodedCose.offset).toBe(data.length);
	const cose = decodedCose.value as Map<number, Decoded>;
	expect([...cose.keys()]).toEqual([1, 3, -1, -2, -3]);
	expect(cose.get(1)).toBe(2);
	expect(cose.get(3)).toBe(-7);
	expect(cose.get(-1)).toBe(1);
	const coordinateX = cose.get(-2) as Buffer;
	const coordinateY = cose.get(-3) as Buffer;
	expect(coordinateX.length).toBe(32);
	expect(coordinateY.length).toBe(32);
	return createPublicKey({
		format: "jwk",
		key: {
			kty: "EC",
			crv: "P-256",
			x: coordinateX.toString("base64url"),
			y: coordinateY.toString("base64url"),
		},
	});
}

function relyingPartyAccepts(
	result: PasskeyAssertion,
	publicKey: KeyObject,
	rpId: string,
	clientDataHash: Uint8Array,
	previousCounter = 0,
) {
	const data = buffer(result.authenticatorData);
	return (
		data.length === 37 &&
		data.subarray(0, 32).equals(hash(rpId)) &&
		data[32] === 1 &&
		data.readUInt32BE(33) > previousCounter &&
		verify(
			"sha256",
			Buffer.concat([data, clientDataHash]),
			{ key: publicKey, dsaEncoding: "der" },
			buffer(result.signature),
		)
	);
}

it("advertises only ephemeral cross-platform ES256 without UV and hides its private state", () => {
	const { authenticator } = fixture();
	expect(authenticator.capabilities).toEqual({
		algorithms: [-7],
		userVerification: false,
		attachment: "cross-platform",
		residentKey: true,
	});
	expect(Object.isFrozen(authenticator.capabilities)).toBe(true);
	expect(Object.isFrozen(authenticator.capabilities.algorithms)).toBe(true);
	expect(Reflect.ownKeys(authenticator)).toEqual([]);
	expect(
		Object.getOwnPropertyNames(NodePasskeyAuthenticator.prototype).sort(),
	).toEqual(["capabilities", "close", "constructor", "create", "get"]);
});

it("encodes genuine none attestation and verifies real DER ES256 assertions independently", async () => {
	const { authenticator, approve } = fixture();
	const registration = await authenticator.create(creation());
	const publicKey = registrationPublicKey(registration);
	expect(buffer(registration.credentialId).length).toBe(32);
	expect(registration).toMatchObject({
		userConsented: true,
		userPresent: true,
		userVerified: false,
		algorithm: -7,
		residentKey: true,
	});
	const request = assertion(registration.credentialId);
	for (const expectedCounter of [1, 2, 3]) {
		const result = await authenticator.get(request);
		expect(buffer(result.authenticatorData).readUInt32BE(33)).toBe(
			expectedCounter,
		);
		expect(buffer(result.signature)[0]).toBe(0x30);
		expect(result.userHandle).toEqual(new Uint8Array([11, 22]));
		expect(result).toMatchObject({
			userConsented: true,
			userPresent: true,
			userVerified: false,
		});
		expect(
			relyingPartyAccepts(
				result,
				publicKey,
				request.rpId,
				request.clientDataHash,
				expectedCounter - 1,
			),
		).toBe(true);
		expect(
			relyingPartyAccepts(
				result,
				publicKey,
				"other.fixture.invalid",
				request.clientDataHash,
			),
		).toBe(false);
		expect(
			relyingPartyAccepts(
				result,
				publicKey,
				request.rpId,
				hash("wrong challenge"),
			),
		).toBe(false);
		expect(
			relyingPartyAccepts(
				result,
				publicKey,
				request.rpId,
				request.clientDataHash,
				expectedCounter,
			),
		).toBe(false);
		const corrupted = new Uint8Array(buffer(result.signature));
		corrupted[corrupted.length - 1] ^= 1;
		expect(
			relyingPartyAccepts(
				{ ...result, signature: corrupted },
				publicKey,
				request.rpId,
				request.clientDataHash,
			),
		).toBe(false);
	}
	expect(approve).toHaveBeenCalledTimes(4);
	expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
	expect(sign).toHaveBeenCalledTimes(3);
});

it("integrates with the existing broker and binds its generated client data", async () => {
	const { authenticator } = fixture();
	const broker = new PasskeyBroker(authenticator);
	const trusted = {
		origin: "https://login.fixture.invalid",
		topLevel: true,
		isCurrent: () => true,
	};
	try {
		const registration = await broker.create(creation().options, trusted);
		const publicKey = registrationPublicKey({
			credentialId: registration.rawId,
			attestationObject: registration.response.attestationObject,
			algorithm: -7,
			residentKey: true,
			userConsented: true,
			userPresent: true,
			userVerified: false,
		});
		const request = assertion(registration.rawId);
		const result = await broker.get(request.options, trusted);
		const clientData = JSON.parse(
			Buffer.from(result.response.clientDataJSON).toString(),
		);
		expect(clientData).toEqual({
			type: "webauthn.get",
			challenge: "AQID",
			origin: trusted.origin,
			crossOrigin: false,
		});
		expect(
			relyingPartyAccepts(
				{
					...result.response,
					credentialId: result.rawId,
					userConsented: true,
					userPresent: true,
					userVerified: false,
				},
				publicKey,
				request.rpId,
				hash(new Uint8Array(result.response.clientDataJSON)),
			),
		).toBe(true);
	} finally {
		broker.close();
	}
});

it("requires an explicit approving host and denies absent or negative approval", async () => {
	const absent = fixture({ approve: undefined }).authenticator;
	await expect(absent.create(creation())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	await expect(absent.get(assertion())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	const { authenticator, approve } = fixture();
	approve.mockResolvedValueOnce({ approved: false });
	await expect(authenticator.create(creation())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	expect(generateKeyPairSync).not.toHaveBeenCalled();
	const registration = await authenticator.create(creation());
	approve.mockRejectedValueOnce(new Error("secret approval backend detail"));
	await expect(
		authenticator.get(assertion(registration.credentialId)),
	).rejects.toMatchObject({
		name: "NotAllowedError",
		message: "Ephemeral authenticator operation denied",
	});
	approve.mockResolvedValueOnce({ approved: false });
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	expect(sign).not.toHaveBeenCalled();
});

it.each([
	{ authenticatorSelection: { userVerification: "required" as const } },
	{ authenticatorSelection: { authenticatorAttachment: "platform" as const } },
	{ attestation: "direct" as const },
	{ attestation: "indirect" as const },
	{ attestation: "enterprise" as const },
	{ extensions: { credProps: true } },
	{ pubKeyCredParams: [{ type: "public-key" as const, alg: -257 }] },
	{ pubKeyCredParams: [] },
])(
	"rejects unsupported creation requirements before approval: %j",
	async (options) => {
		const { authenticator, approve } = fixture();
		const request = creation();
		Object.assign(request.options, options);
		await expect(authenticator.create(request)).rejects.toMatchObject({
			name: "NotSupportedError",
		});
		expect(approve).not.toHaveBeenCalled();
		expect(generateKeyPairSync).not.toHaveBeenCalled();
	},
);

it("rejects required assertion UV and extensions, but supports required memory residency", async () => {
	const { authenticator, approve } = fixture();
	const request = creation();
	request.options.authenticatorSelection = {
		residentKey: "required",
		requireResidentKey: true,
		userVerification: "preferred",
	};
	request.options.pubKeyCredParams = [
		{ type: "public-key", alg: -257 },
		...request.options.pubKeyCredParams,
	];
	const registration = await authenticator.create(request);
	expect(registration.residentKey).toBe(true);
	for (const options of [
		{ userVerification: "required" },
		{ extensions: { appid: "other" } },
	]) {
		const request = assertion();
		Object.assign(request.options, options);
		await expect(authenticator.get(request)).rejects.toMatchObject({
			name: "NotSupportedError",
		});
	}
	expect(approve).toHaveBeenCalledTimes(1);
});

it("scopes resident discovery and allow lists to the exact RP", async () => {
	const { authenticator, approve } = fixture();
	const first = await authenticator.create(creation());
	const otherRequest = creation();
	otherRequest.rpId = "other.fixture.invalid";
	const other = await authenticator.create(otherRequest);
	const result = await authenticator.get(assertion());
	expect(result.credentialId).toEqual(first.credentialId);
	const consent = approve.mock.lastCall?.[0];
	expect(consent?.operation).toBe("get");
	if (consent?.operation !== "get") throw new Error("Missing get approval");
	expect(consent.credentials.map((account) => account.credentialId)).toEqual([
		first.credentialId,
	]);
	const before = approve.mock.calls.length;
	await expect(
		authenticator.get(assertion(other.credentialId)),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	await expect(
		authenticator.get({ ...assertion(), rpId: "child.login.fixture.invalid" }),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	expect(approve).toHaveBeenCalledTimes(before);
	const resultOther = await authenticator.get({
		...assertion(),
		rpId: otherRequest.rpId,
	});
	expect(resultOther.credentialId).toEqual(other.credentialId);
});

it("requires host selection for multiple matches and never accepts a nonmatching selection", async () => {
	const { authenticator, approve } = fixture();
	const first = await authenticator.create(creation());
	const nextRequest = creation();
	nextRequest.options.user.id = new Uint8Array([33]);
	const second = await authenticator.create(nextRequest);
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	approve.mockResolvedValueOnce({
		approved: true,
		credentialId: new Uint8Array(32),
	});
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	approve.mockResolvedValueOnce({
		approved: true,
		credentialId: second.credentialId,
	});
	await expect(
		authenticator.get(assertion(first.credentialId)),
	).rejects.toMatchObject({ name: "NotAllowedError" });
	approve.mockImplementationOnce(async (request) => {
		if (request.operation !== "get")
			throw new Error("Expected account selection");
		expect(request.credentials).toHaveLength(2);
		return {
			approved: true,
			credentialId: request.credentials[1].credentialId,
		};
	});
	const result = await authenticator.get(assertion());
	expect(result.credentialId).toEqual(second.credentialId);
	expect(result.userHandle).toEqual(new Uint8Array([33]));
	expect(buffer(result.authenticatorData).readUInt32BE(33)).toBe(1);
});

it("checks excludes after consent and does not apply another RP's exclusion", async () => {
	const { authenticator, approve } = fixture();
	const registration = await authenticator.create(creation());
	const request = creation();
	request.options.excludeCredentials = [
		{ type: "public-key", id: registration.credentialId },
	];
	await expect(authenticator.create(request)).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	expect(approve).toHaveBeenCalledTimes(2);
	request.rpId = "other.fixture.invalid";
	await expect(authenticator.create(request)).resolves.toMatchObject({
		algorithm: -7,
	});
	expect(approve).toHaveBeenCalledTimes(3);
});

it("snapshots caller buffers and approval metadata before awaits", async () => {
	const { authenticator, approve } = fixture();
	const gate = deferred<NodePasskeyApprovalDecision>();
	const request = creation();
	approve.mockImplementationOnce((consent) => {
		if (consent.operation !== "create") throw new Error("Expected creation");
		consent.user.id.fill(99);
		consent.user.name = "changed by host";
		consent.clientDataHash.fill(99);
		consent.rpId = "other.fixture.invalid";
		return gate.promise;
	});
	const pending = authenticator.create(request);
	buffer(request.options.user.id).fill(77);
	request.options.user.name = "changed by caller";
	request.options.rp.name = "changed RP";
	request.options.pubKeyCredParams = [];
	request.rpId = "other.fixture.invalid";
	gate.resolve({ approved: true });
	const registration = await pending;
	const publicKey = registrationPublicKey(registration);
	const getGate = deferred<NodePasskeyApprovalDecision>();
	const getRequest = assertion(registration.credentialId);
	const originalHash = new Uint8Array(getRequest.clientDataHash);
	approve.mockImplementationOnce((consent) => {
		if (consent.operation !== "get") throw new Error("Expected assertion");
		expect(consent.credentials[0].user.name).toBe("synthetic");
		consent.credentials[0].user.id.fill(88);
		consent.credentials[0].credentialId.fill(88);
		Object.defineProperty(consent.credentials, "length", { value: 0 });
		return getGate.promise;
	});
	const pendingGet = authenticator.get(getRequest);
	getRequest.clientDataHash.fill(66);
	buffer(registration.credentialId).fill(66);
	getRequest.rpId = "other.fixture.invalid";
	getGate.resolve({ approved: true });
	const result = await pendingGet;
	expect(result.userHandle).toEqual(new Uint8Array([11, 22]));
	expect(
		relyingPartyAccepts(result, publicKey, context().rpId, originalHash),
	).toBe(true);
	buffer(result.userHandle as BufferSource).fill(99);
	buffer(result.credentialId).fill(99);
	const fresh = await authenticator.get(assertion());
	expect(fresh.userHandle).toEqual(new Uint8Array([11, 22]));
	expect(
		relyingPartyAccepts(
			fresh,
			publicKey,
			context().rpId,
			context().clientDataHash,
			1,
		),
	).toBe(true);
});

it("bounds quota before consent and rejects concurrent/reentrant ceremonies", async () => {
	const { authenticator, approve } = fixture({ maxCredentials: 1 });
	const gate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(gate.promise);
	const pending = authenticator.create(creation());
	await expect(authenticator.create(creation())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	gate.resolve({ approved: true });
	await pending;
	await expect(authenticator.create(creation())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	expect(approve).toHaveBeenCalledTimes(1);
	expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
});

it.each(["abort", "close"])(
	"denies %s during consent immediately, signals the host and ignores late approval",
	async (action) => {
		const { authenticator, approve } = fixture({ maxCredentials: 1 });
		const gate = deferred<NodePasskeyApprovalDecision>();
		approve.mockReturnValueOnce(gate.promise);
		const controller = new AbortController();
		const pending = authenticator.create({
			...creation(),
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		if (action === "abort") controller.abort("private abort reason");
		else authenticator.close();
		await rejected;
		expect(approve.mock.calls[0][0].signal.aborted).toBe(true);
		gate.resolve({ approved: true });
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(generateKeyPairSync).not.toHaveBeenCalled();
		if (action === "abort") {
			await expect(authenticator.get(assertion())).rejects.toMatchObject({
				name: "NotAllowedError",
			});
			await expect(authenticator.create(creation())).resolves.toMatchObject({
				algorithm: -7,
			});
		} else {
			await expect(authenticator.create(creation())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			await expect(authenticator.get(assertion())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
		}
	},
);

it("does not sign or advance counters after aborted assertion consent", async () => {
	const { authenticator, approve } = fixture();
	await authenticator.create(creation());
	const gate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(gate.promise);
	const controller = new AbortController();
	const pending = authenticator.get({
		...assertion(),
		signal: controller.signal,
	});
	const rejected = expect(pending).rejects.toMatchObject({
		name: "AbortError",
	});
	controller.abort();
	await rejected;
	const fresh = await authenticator.get(assertion());
	gate.resolve({ approved: true });
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	expect(sign).toHaveBeenCalledTimes(1);
	expect(buffer(fresh.authenticatorData).readUInt32BE(33)).toBe(1);
});

it("rejects pre-aborted requests before consent or key generation", async () => {
	const { authenticator, approve } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		authenticator.create({ ...creation(), signal: controller.signal }),
	).rejects.toMatchObject({ name: "AbortError" });
	expect(approve).not.toHaveBeenCalled();
	expect(generateKeyPairSync).not.toHaveBeenCalled();
});

it("bounds a stalled callback by timeout and denies a late rejection", async () => {
	vi.useFakeTimers();
	const { authenticator, approve } = fixture();
	const gate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(gate.promise);
	const request = creation();
	request.options.timeout = 10;
	const rejected = expect(authenticator.create(request)).rejects.toMatchObject({
		name: "AbortError",
	});
	await vi.advanceTimersByTimeAsync(10);
	await rejected;
	gate.reject(new Error("private late rejection"));
	await vi.advanceTimersByTimeAsync(1);
	expect(generateKeyPairSync).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("fails closed at the counter ceiling without wraparound or reuse", async () => {
	const { authenticator } = fixture({ maxAssertionsPerCredential: 2 });
	await authenticator.create(creation());
	for (const expected of [1, 2]) {
		const result = await authenticator.get(assertion());
		expect(buffer(result.authenticatorData).readUInt32BE(33)).toBe(expected);
	}
	for (let attempt = 0; attempt < 2; attempt++)
		await expect(authenticator.get(assertion())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
	expect(sign).toHaveBeenCalledTimes(2);
});

it.each([0, -1, 65, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid credential quota %s",
	(maxCredentials) => {
		expect(() => new NodePasskeyAuthenticator({ maxCredentials })).toThrow();
	},
);

it.each([0, -1, 0x100000000, 1.5, Number.NaN])(
	"rejects invalid signature ceiling %s",
	(maxAssertionsPerCredential) => {
		expect(
			() => new NodePasskeyAuthenticator({ maxAssertionsPerCredential }),
		).toThrow();
	},
);

it.each([0, 65])(
	"rejects user IDs of length %s before approval",
	async (size) => {
		const { authenticator, approve } = fixture();
		const request = creation();
		request.options.user.id = new Uint8Array(size);
		await expect(authenticator.create(request)).rejects.toMatchObject({
			name: "TypeError",
		});
		expect(approve).not.toHaveBeenCalled();
	},
);

it("preserves bounded user handle views and distinct unpredictable credential IDs", async () => {
	const { authenticator } = fixture();
	const request = creation();
	const source = new Uint8Array(66).fill(7);
	source[0] = 99;
	source[65] = 99;
	request.options.user.id = new DataView(source.buffer, 1, 64);
	const first = await authenticator.create(request);
	const second = await authenticator.create(request);
	expect(first.credentialId).not.toEqual(second.credentialId);
	const result = await authenticator.get(assertion(first.credentialId));
	expect(result.userHandle).toEqual(new Uint8Array(64).fill(7));
	const other = fixture().authenticator;
	await expect(other.get(assertion(first.credentialId))).rejects.toMatchObject({
		name: "NotAllowedError",
	});
});

it("rejects oversized, shared, detached, unsupported and accessor-bearing input", async () => {
	const { authenticator, approve } = fixture();
	const invalid: Array<(request: ReturnType<typeof creation>) => void> = [
		(request) => {
			request.clientDataHash = new Uint8Array(31);
		},
		(request) => {
			request.options.challenge = new Uint8Array(1025);
		},
		(request) => {
			request.options.user.name = "x".repeat(257);
		},
		(request) => {
			request.options.user.id = new Uint8Array(
				new SharedArrayBuffer(2),
			) as unknown as BufferSource;
		},
		(request) => {
			const detached = new ArrayBuffer(2);
			structuredClone(detached, { transfer: [detached] });
			request.options.user.id = detached;
		},
		(request) => {
			Object.defineProperty(request.options, "challenge", {
				get() {
					throw new Error("Getter must not execute");
				},
			});
		},
		(request) => {
			Object.assign(request.options, { futureRequirement: true });
		},
		(request) => {
			request.options.excludeCredentials = Array.from({ length: 65 }, () => ({
				type: "public-key",
				id: new Uint8Array([1]),
			}));
		},
		(request) => {
			request.options.rp.id = "other.fixture.invalid";
		},
	];
	for (const mutate of invalid) {
		const request = creation();
		mutate(request);
		await expect(authenticator.create(request)).rejects.toThrow();
	}
	expect(approve).not.toHaveBeenCalled();
	expect(generateKeyPairSync).not.toHaveBeenCalled();
});

it("public outputs and host approval payloads contain no private key material", async () => {
	const seen: NodePasskeyApprovalRequest[] = [];
	const { authenticator } = fixture({
		approve: async (request) => {
			seen.push(request);
			return { approved: true };
		},
	});
	const registration = await authenticator.create(creation());
	const result = await authenticator.get(assertion());
	registrationPublicKey(registration);
	expect(Object.keys(registration).sort()).toEqual([
		"algorithm",
		"attestationObject",
		"credentialId",
		"residentKey",
		"userConsented",
		"userPresent",
		"userVerified",
	]);
	expect(Object.keys(result).sort()).toEqual([
		"authenticatorData",
		"credentialId",
		"signature",
		"userConsented",
		"userHandle",
		"userPresent",
		"userVerified",
	]);
	const publicInspection = `${JSON.stringify({ authenticator, registration, result, seen })}\n${inspect(authenticator, { showHidden: true, depth: 8 })}`;
	expect(publicInspection).not.toMatch(
		/PRIVATE KEY|privateKey|pkcs8|"d"\s*:|KeyObject/i,
	);
	expect(JSON.stringify(authenticator)).toBe("{}");
	authenticator.close();
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
});

it.each([
	true,
	{ approved: 1 },
	{ approved: "true" },
	{ approved: true, userVerified: true },
])(
	"does not treat malformed approval or unverifiable UV claims as consent: %j",
	async (decision) => {
		const { authenticator, approve } = fixture();
		approve.mockResolvedValueOnce(
			decision as unknown as NodePasskeyApprovalDecision,
		);
		await expect(authenticator.create(creation())).rejects.toThrow();
		expect(generateKeyPairSync).not.toHaveBeenCalled();
	},
);

it("rejects host callback reentrancy without deadlock or extra capacity", async () => {
	const { authenticator, approve } = fixture({ maxCredentials: 1 });
	approve.mockImplementationOnce(async () => {
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		return { approved: true };
	});
	await expect(authenticator.create(creation())).resolves.toMatchObject({
		algorithm: -7,
	});
	expect(approve).toHaveBeenCalledTimes(1);
	expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
});

it("keeps exclusion snapshots independent of caller mutation during consent", async () => {
	const { authenticator, approve } = fixture();
	const existing = await authenticator.create(creation());
	const request = creation();
	const excluded = new Uint8Array(32);
	request.options.excludeCredentials = [{ type: "public-key", id: excluded }];
	const gate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(gate.promise);
	const pending = authenticator.create(request);
	excluded.set(buffer(existing.credentialId));
	gate.resolve({ approved: true });
	await expect(pending).resolves.toMatchObject({ algorithm: -7 });
	await expect(authenticator.create(request)).rejects.toMatchObject({
		name: "InvalidStateError",
	});
});

it("cannot let an old cancelled callback unlock a newer ceremony", async () => {
	const { authenticator, approve } = fixture();
	const oldGate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(oldGate.promise);
	const controller = new AbortController();
	const old = authenticator.create({
		...creation(),
		signal: controller.signal,
	});
	const oldRejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
	controller.abort();
	await oldRejected;
	const newGate = deferred<NodePasskeyApprovalDecision>();
	approve.mockReturnValueOnce(newGate.promise);
	const pending = authenticator.create(creation());
	oldGate.resolve({ approved: true });
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	await expect(authenticator.create(creation())).rejects.toMatchObject({
		name: "InvalidStateError",
	});
	expect(generateKeyPairSync).not.toHaveBeenCalled();
	newGate.resolve({ approved: true });
	await expect(pending).resolves.toMatchObject({ algorithm: -7 });
});

it("does not commit a registration when aborted immediately after real key generation", async () => {
	const { authenticator } = fixture({ maxCredentials: 1 });
	const controller = new AbortController();
	cryptoHooks.afterGenerate = () => controller.abort();
	await expect(
		authenticator.create({ ...creation(), signal: controller.signal }),
	).rejects.toMatchObject({ name: "AbortError" });
	expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
	cryptoHooks.afterGenerate = undefined;
	await expect(authenticator.get(assertion())).rejects.toMatchObject({
		name: "NotAllowedError",
	});
	await expect(authenticator.create(creation())).resolves.toMatchObject({
		algorithm: -7,
	});
});

it("does not commit counters or publish a result when aborted immediately after real signing", async () => {
	const { authenticator } = fixture();
	await authenticator.create(creation());
	const controller = new AbortController();
	cryptoHooks.afterSign = () => controller.abort();
	await expect(
		authenticator.get({ ...assertion(), signal: controller.signal }),
	).rejects.toMatchObject({ name: "AbortError" });
	cryptoHooks.afterSign = undefined;
	const result = await authenticator.get(assertion());
	expect(buffer(result.authenticatorData).readUInt32BE(33)).toBe(1);
	expect(sign).toHaveBeenCalledTimes(2);
});
