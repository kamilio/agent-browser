import {
	type KeyObject,
	createHash,
	generateKeyPairSync,
	sign,
	verify,
} from "node:crypto";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type NodePasskeyApprovalDecision,
	type NodePasskeyApprovalRequest,
	NodePasskeyAuthenticator,
} from "./node-passkey-authenticator.js";
import {
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
	type PasskeyRequestOptions,
	passkeyLimits,
} from "./passkeys.js";

const cryptoState = vi.hoisted(() => ({
	publicKeys: [] as KeyObject[],
	privateExports: vi.fn(() => {
		throw new Error("Unexpected synthetic private-key export");
	}),
}));

vi.mock("node:crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:crypto")>();
	return {
		...actual,
		generateKeyPairSync: vi.fn(
			(type: "ec", options: { namedCurve: string }) => {
				const result = actual.generateKeyPairSync(type, options);
				cryptoState.publicKeys.push(result.publicKey);
				Object.defineProperty(result.privateKey, "export", {
					value: cryptoState.privateExports,
				});
				return result;
			},
		),
		sign: vi.fn(actual.sign),
	};
});

type Operation = "create" | "get";
type CreationRequest = PasskeyProviderContext & {
	options: PasskeyCreationOptions;
};
type AssertionRequest = PasskeyProviderContext & {
	options: PasskeyRequestOptions;
};
type Request = CreationRequest | AssertionRequest;

const authenticators: NodePasskeyAuthenticator[] = [];
const parentRp = "example.com";
const initiatingOrigin = "https://login.example.com:8443";
const denial = {
	name: "SecurityError",
	message: "Ephemeral authenticator operation denied",
};

afterEach(async () => {
	await Promise.all(authenticators.splice(0).map((value) => value.close()));
	cryptoState.publicKeys.length = 0;
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function hash(value: string | Uint8Array) {
	return createHash("sha256").update(value).digest();
}

function clientFields(operation: Operation, origin = initiatingOrigin) {
	return {
		type: `webauthn.${operation}`,
		challenge: "AQID",
		origin,
		crossOrigin: false,
	};
}

function metadata(request: Request, encoded: string | Uint8Array) {
	request.clientDataJSON =
		typeof encoded === "string" ? Buffer.from(encoded, "utf8") : encoded;
	request.clientDataHash = hash(request.clientDataJSON);
}

function requestFor(operation: Operation, origin = initiatingOrigin): Request {
	const context: PasskeyProviderContext = {
		rpId: parentRp,
		clientDataHash: hash("legacy synthetic client data"),
		signal: new AbortController().signal,
	};
	const request: Request =
		operation === "create"
			? {
					...context,
					options: {
						challenge: new Uint8Array([1, 2, 3]),
						rp: { id: parentRp, name: "Synthetic parent" },
						user: {
							id: new Uint8Array([4, 5]),
							name: "synthetic",
							displayName: "Synthetic account",
						},
						pubKeyCredParams: [{ type: "public-key", alg: -7 }],
					},
				}
			: {
					...context,
					options: {
						challenge: new Uint8Array([1, 2, 3]),
						rpId: parentRp,
					},
				};
	metadata(request, JSON.stringify(clientFields(operation, origin)));
	return request;
}

function perform(
	authenticator: NodePasskeyAuthenticator,
	operation: Operation,
	request: Request,
) {
	return operation === "create"
		? authenticator.create(request as CreationRequest)
		: authenticator.get(request as AssertionRequest);
}

async function fixture(operation: Operation) {
	const approve = vi.fn<
		(
			request: NodePasskeyApprovalRequest,
		) => Promise<NodePasskeyApprovalDecision>
	>(async () => ({ approved: true }));
	const authenticator = new NodePasskeyAuthenticator({ approve });
	authenticators.push(authenticator);
	if (operation === "get") {
		const seed = requestFor("create") as CreationRequest;
		Reflect.deleteProperty(seed, "clientDataJSON");
		await authenticator.create(seed);
		vi.clearAllMocks();
	}
	return { authenticator, approve, request: requestFor(operation) };
}

function expectNoEffects(approve: ReturnType<typeof vi.fn>) {
	expect(approve).not.toHaveBeenCalled();
	expect(generateKeyPairSync).not.toHaveBeenCalled();
	expect(sign).not.toHaveBeenCalled();
	expect(cryptoState.privateExports).not.toHaveBeenCalled();
}

const invalidOrigins = [
	"http://login.example.com",
	"wss://login.example.com",
	"https://login.example.com/",
	"https://login.example.com/path",
	"https://login.example.com?query=private",
	"https://login.example.com?",
	"https://login.example.com#fragment",
	"https://login.example.com#",
	"https://user:private@login.example.com",
	"https://@login.example.com",
	"https://LOGIN.example.com",
	"HTTPS://login.example.com",
	"https://login.example.com:443",
	"https://login.example.com:08443",
	"https://login.example.com:",
	"https://login.example.com:65536",
	"https://login.example.com\\path",
	"https://bücher.example",
	"https://%6cogin.example.com",
	" https://login.example.com",
	"https://login.example.com\n",
	"https://login.\texample.com",
	"https://login.example.com\u0000",
	"data:text/plain,private",
	"null",
	"",
];

describe.each(["create", "get"] as const)("%s approval origin", (operation) => {
	it.each([
		"https://login.example.com",
		initiatingOrigin,
		"https://accounts.example.com:9443",
		"https://xn--bcher-kva.example:65535",
	])("exposes the exact hash-bound initiating origin %s", async (origin) => {
		const { authenticator, approve } = await fixture(operation);
		const request = requestFor(operation, origin);
		await perform(authenticator, operation, request);
		expect(approve).toHaveBeenCalledOnce();
		expect(approve.mock.calls[0][0]).toMatchObject({
			operation,
			origin,
			rpId: parentRp,
			clientDataHash: new Uint8Array(request.clientDataHash),
		});
		expect(approve.mock.calls[0][0]).not.toHaveProperty("clientDataJSON");
		expect(cryptoState.privateExports).not.toHaveBeenCalled();
	});

	it("keeps the origin property absent for legacy hash-only callers", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		Reflect.deleteProperty(request, "clientDataJSON");
		await perform(authenticator, operation, request);
		expect(Object.hasOwn(approve.mock.calls[0][0], "origin")).toBe(false);
	});

	it("omits origin for explicitly undefined legacy metadata", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		request.clientDataJSON = undefined;
		await perform(authenticator, operation, request);
		expect(Object.hasOwn(approve.mock.calls[0][0], "origin")).toBe(false);
	});

	it.each(invalidOrigins)(
		"rejects noncanonical origin %j before effects",
		async (origin) => {
			const { authenticator, approve } = await fixture(operation);
			await expect(
				perform(authenticator, operation, requestFor(operation, origin)),
			).rejects.toMatchObject(denial);
			expectNoEffects(approve);
		},
	);

	it.each([
		[
			"wrong ceremony",
			(current: Operation) => ({
				type: current === "create" ? "webauthn.get" : "webauthn.create",
			}),
		],
		["unknown ceremony", () => ({ type: "webauthn.other" })],
		["wrong challenge", () => ({ challenge: "BAUG" })],
		["padded challenge", () => ({ challenge: "AQID=" })],
		["empty challenge", () => ({ challenge: "" })],
		["numeric challenge", () => ({ challenge: 123 })],
		["cross-origin ceremony", () => ({ crossOrigin: true })],
		["string crossOrigin", () => ({ crossOrigin: "false" })],
		["null crossOrigin", () => ({ crossOrigin: null })],
		["null origin", () => ({ origin: null })],
		["object origin", () => ({ origin: { value: initiatingOrigin } })],
		["unexpected field", () => ({ topOrigin: initiatingOrigin })],
	] as const)("rejects %s before effects", async (_label, replace) => {
		const { authenticator, approve, request } = await fixture(operation);
		metadata(
			request,
			JSON.stringify({ ...clientFields(operation), ...replace(operation) }),
		);
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it.each(["type", "challenge", "origin", "crossOrigin"] as const)(
		"rejects missing %s before effects",
		async (field) => {
			const { authenticator, approve, request } = await fixture(operation);
			const fields: Record<string, unknown> = clientFields(operation);
			delete fields[field];
			metadata(request, JSON.stringify(fields));
			await expect(
				perform(authenticator, operation, request),
			).rejects.toMatchObject(denial);
			expectNoEffects(approve);
		},
	);

	it.each([
		["empty", () => new Uint8Array()],
		["too large", () => new Uint8Array(passkeyLimits.responseBytes + 1)],
		["malformed UTF-8", () => new Uint8Array([0xff, 0xfe, 0xfd])],
		["overlong UTF-8", () => new Uint8Array([0xc0, 0xaf])],
		["truncated UTF-8", () => new Uint8Array([0xe2, 0x82])],
		[
			"UTF-8 BOM",
			(valid: string) =>
				Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(valid)]),
		],
		["null", () => "null"],
		["array", (valid: string) => `[${valid}]`],
		["string", (valid: string) => JSON.stringify(valid)],
		["empty object", () => "{}"],
		["unterminated", (valid: string) => valid.slice(0, -1)],
		["trailing data", (valid: string) => `${valid} private`],
		["comment", (valid: string) => `/*private*/${valid}`],
		[
			"duplicate equal origin",
			(valid: string) =>
				valid.replace("{", `{"origin":${JSON.stringify(initiatingOrigin)},`),
		],
		[
			"duplicate differing origin",
			(valid: string) =>
				valid.replace("{", '{"origin":"https://attacker.invalid",'),
		],
		[
			"escaped duplicate origin",
			(valid: string) =>
				valid.replace("{", '{"or\\u0069gin":"https://attacker.invalid",'),
		],
		[
			"duplicate challenge",
			(valid: string) => valid.replace("{", '{"challenge":"AQID",'),
		],
		[
			"duplicate crossOrigin",
			(valid: string) => valid.replace("{", '{"crossOrigin":true,'),
		],
		[
			"prototype key",
			(valid: string) => valid.replace("{", '{"__proto__":{},'),
		],
	] as const)(
		"rejects %s client data before effects",
		async (_label, encode) => {
			const { authenticator, approve, request } = await fixture(operation);
			metadata(request, encode(JSON.stringify(clientFields(operation))));
			await expect(
				perform(authenticator, operation, request),
			).rejects.toMatchObject(denial);
			expectNoEffects(approve);
		},
	);

	it("checks the exact hash before parsing client data", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		request.clientDataHash[0] ^= 1;
		const parse = vi.spyOn(JSON, "parse");
		const pending = perform(authenticator, operation, request);
		expect(parse).not.toHaveBeenCalled();
		parse.mockRestore();
		await expect(pending).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it.each([0, 31, 33])(
		"rejects a %s-byte hash before effects",
		async (length) => {
			const { authenticator, approve, request } = await fixture(operation);
			request.clientDataHash = new Uint8Array(length);
			await expect(
				perform(authenticator, operation, request),
			).rejects.toMatchObject({ ...denial, name: "TypeError" });
			expectNoEffects(approve);
		},
	);

	it("does not leak a throwing metadata getter into the error", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		Object.defineProperty(request, "clientDataJSON", {
			get() {
				throw new Error("synthetic private metadata");
			},
		});
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it("rejects noncanonical base64url with nonzero unused challenge bits", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		request.options.challenge = new Uint8Array([255]);
		metadata(
			request,
			JSON.stringify({ ...clientFields(operation), challenge: "_x" }),
		);
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it("accepts reordered and escaped valid JSON without reserializing its hash", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		metadata(
			request,
			` { "crossOrigin": false, "origin": "https:\\/\\/login.example.com:8443", "challenge": "\\u0041QID", "type": "webauthn.${operation}" }\n`,
		);
		await perform(authenticator, operation, request);
		expect(approve.mock.calls[0][0]).toMatchObject({
			origin: initiatingOrigin,
			clientDataHash: new Uint8Array(request.clientDataHash),
		});
	});

	it("accepts exactly the existing client-data byte limit", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		metadata(
			request,
			JSON.stringify(clientFields(operation)).padEnd(
				passkeyLimits.responseBytes,
				" ",
			),
		);
		await perform(authenticator, operation, request);
		expect(approve.mock.calls[0][0].origin).toBe(initiatingOrigin);
	});

	it("accepts the existing maximum challenge and exact base64url binding", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		const challenge = Buffer.alloc(passkeyLimits.challengeBytes, 0xff);
		request.options.challenge = challenge;
		metadata(
			request,
			JSON.stringify({
				...clientFields(operation),
				challenge: challenge.toString("base64url"),
			}),
		);
		await perform(authenticator, operation, request);
		expect(approve.mock.calls[0][0].origin).toBe(initiatingOrigin);
	});

	it("reads only a Uint8Array view, not its oversized backing buffer", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		const encoded = Buffer.from(JSON.stringify(clientFields(operation)));
		const backing = new Uint8Array(passkeyLimits.responseBytes + 100);
		backing.set(encoded, 11);
		metadata(request, backing.subarray(11, 11 + encoded.length));
		await perform(authenticator, operation, request);
		expect(approve.mock.calls[0][0].origin).toBe(initiatingOrigin);
	});

	it("rejects shared client-data memory before effects", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		const shared = new Uint8Array(new SharedArrayBuffer(128));
		request.clientDataJSON = shared;
		request.clientDataHash = hash(shared);
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it("rejects detached client-data memory before effects", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		const encoded = new TextEncoder().encode(
			JSON.stringify(clientFields(operation)),
		);
		metadata(request, encoded);
		structuredClone(encoded.buffer, { transfer: [encoded.buffer] });
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject(denial);
		expectNoEffects(approve);
	});

	it("snapshots metadata, challenge, hash and RP before pending approval", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		const originalHash = Buffer.from(request.clientDataHash);
		let accept!: (decision: NodePasskeyApprovalDecision) => void;
		approve.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					accept = resolve;
				}),
		);
		const pending = perform(authenticator, operation, request);
		expect(approve).toHaveBeenCalledOnce();
		const approval = approve.mock.calls[0][0];
		request.clientDataJSON?.fill(0);
		request.clientDataHash.fill(0);
		(request.options.challenge as Uint8Array).fill(0);
		request.rpId = "attacker.invalid";
		if (operation === "create")
			(request as CreationRequest).options.rp.id = request.rpId;
		else (request as AssertionRequest).options.rpId = request.rpId;
		expect(approval.origin).toBe(initiatingOrigin);
		expect(approval.rpId).toBe(parentRp);
		expect(Buffer.from(approval.clientDataHash)).toEqual(originalHash);
		approval.origin = "https://callback-mutation.invalid";
		approval.rpId = "callback-mutation.invalid";
		approval.clientDataHash.fill(0);
		accept({ approved: true });
		const result = await pending;
		const assertionRequest = requestFor("get") as AssertionRequest;
		const asserted =
			"signature" in result
				? result
				: await authenticator.get(assertionRequest);
		const data = Buffer.from(asserted.authenticatorData as Uint8Array);
		expect(data.subarray(0, 32)).toEqual(hash(parentRp));
		expect(
			verify(
				"sha256",
				Buffer.concat([
					data,
					operation === "get"
						? originalHash
						: Buffer.from(assertionRequest.clientDataHash),
				]),
				cryptoState.publicKeys[0],
				asserted.signature as Uint8Array,
			),
		).toBe(true);
		expect(cryptoState.privateExports).not.toHaveBeenCalled();
	});

	it("does not interpret hash-bound origin as independent RP eligibility", async () => {
		const { authenticator, approve } = await fixture(operation);
		await perform(
			authenticator,
			operation,
			requestFor(operation, "https://unrelated.invalid:9443"),
		);
		expect(approve.mock.calls[0][0]).toMatchObject({
			rpId: parentRp,
			origin: "https://unrelated.invalid:9443",
		});
	});

	it("still denies approval and supports cancellation without crypto effects", async () => {
		const { authenticator, approve, request } = await fixture(operation);
		approve.mockResolvedValueOnce({ approved: false });
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(generateKeyPairSync).not.toHaveBeenCalled();
		expect(sign).not.toHaveBeenCalled();
		const controller = new AbortController();
		request.signal = controller.signal;
		approve.mockImplementationOnce(async () => {
			controller.abort();
			return { approved: true };
		});
		await expect(
			perform(authenticator, operation, request),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(generateKeyPairSync).not.toHaveBeenCalled();
		expect(sign).not.toHaveBeenCalled();
	});
});

it("never exports a private key or exposes raw client data in approval/public output", async () => {
	const { authenticator, approve } = await fixture("create");
	const registered = await authenticator.create(
		requestFor("create") as CreationRequest,
	);
	const asserted = await authenticator.get(
		requestFor("get") as AssertionRequest,
	);
	expect(generateKeyPairSync).toHaveBeenCalledOnce();
	expect(sign).toHaveBeenCalledOnce();
	expect(cryptoState.privateExports).not.toHaveBeenCalled();
	const observable = {
		authenticator,
		registered,
		asserted,
		approvals: approve.mock.calls.map(([request]) => request),
	};
	expect(
		`${JSON.stringify(observable)}\n${inspect(observable, { showHidden: true, depth: 8 })}`,
	).not.toMatch(
		/PRIVATE KEY|privateKey|pkcs8|"d"\s*:|KeyObject|clientDataJSON/,
	);
});
