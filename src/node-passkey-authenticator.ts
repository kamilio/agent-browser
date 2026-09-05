import {
	type KeyObject,
	createHash,
	generateKeyPairSync,
	randomBytes,
	sign,
} from "node:crypto";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	type PasskeyCapabilities,
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
	passkeyLimits,
} from "./passkeys.js";

export interface NodePasskeyAccount {
	credentialId: Uint8Array<ArrayBuffer>;
	user: { id: Uint8Array<ArrayBuffer>; name: string; displayName: string };
}

export type NodePasskeyApprovalRequest = {
	rpId: string;
	clientDataHash: Uint8Array<ArrayBuffer>;
	signal: AbortSignal;
} & (
	| { operation: "create"; rpName: string; user: NodePasskeyAccount["user"] }
	| { operation: "get"; credentials: readonly NodePasskeyAccount[] }
);

export interface NodePasskeyApprovalDecision {
	approved: boolean;
	credentialId?: BufferSource;
}

export interface NodePasskeyAuthenticatorOptions {
	approve?: (
		request: NodePasskeyApprovalRequest,
	) => Promise<NodePasskeyApprovalDecision>;
	maxCredentials?: number;
	maxAssertionsPerCredential?: number;
}

type StoredCredential = {
	id: Buffer;
	rpId: string;
	user: NodePasskeyAccount["user"];
	privateKey: KeyObject;
	counter: number;
};
type Ceremony = {
	rpId: string;
	hash: Buffer;
	signal: AbortSignal;
	timeout: number;
};
type Creation = Ceremony & {
	rpName: string;
	user: NodePasskeyAccount["user"];
	excluded: Buffer[];
};
type Assertion = Ceremony & { allowed: Buffer[] };

function fail(name: string): never {
	const error = new Error("Ephemeral authenticator operation denied");
	error.name = name;
	throw error;
}

function dictionary(value: unknown, keys: readonly string[]) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		fail("TypeError");
	if (Object.getOwnPropertySymbols(value).length) fail("TypeError");
	const fields = Object.getOwnPropertyDescriptors(value);
	const result: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(fields)) {
		if (!Object.hasOwn(field, "value")) fail("TypeError");
		if (!keys.includes(key)) fail("NotSupportedError");
		Object.defineProperty(result, key, {
			value: field.value,
			enumerable: true,
		});
	}
	return result;
}

function bytes(value: unknown, maximum: number, minimum = 1): Buffer {
	try {
		const view = ArrayBuffer.isView(value) ? value : undefined;
		const buffer = view ? view.buffer : value;
		const size = Object.getOwnPropertyDescriptor(
			ArrayBuffer.prototype,
			"byteLength",
		)?.get?.call(buffer) as number;
		const length = view ? view.byteLength : size;
		if (length < minimum || length > maximum) fail("TypeError");
		return Buffer.from(
			new Uint8Array(buffer as ArrayBuffer, view?.byteOffset ?? 0, length),
		);
	} catch {
		return fail("TypeError");
	}
}

function text(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.length ||
		value.length > passkeyLimits.nameChars
	)
		fail("TypeError");
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) fail("TypeError");
	}
	return value;
}

function list(value: unknown, maximum: number): unknown[] {
	if (!Array.isArray(value) || value.length > maximum) fail("TypeError");
	return Array.from({ length: value.length }, (_, index) => {
		const field = Object.getOwnPropertyDescriptor(value, String(index));
		if (!field || !Object.hasOwn(field, "value")) fail("TypeError");
		return field.value;
	});
}

function descriptors(value: unknown): Buffer[] {
	return list(
		value === undefined ? [] : value,
		passkeyLimits.credentialCount,
	).map((entry) => {
		const descriptor = dictionary(entry, ["type", "id", "transports"]);
		if (descriptor.type !== "public-key") fail("NotSupportedError");
		if (descriptor.transports !== undefined) {
			for (const transport of list(descriptor.transports, 5)) {
				if (
					typeof transport !== "string" ||
					!["usb", "nfc", "ble", "internal", "hybrid"].includes(transport)
				)
					fail("NotSupportedError");
			}
		}
		return bytes(descriptor.id, passkeyLimits.credentialIdBytes);
	});
}

function verification(value: unknown) {
	if (
		value !== undefined &&
		(typeof value !== "string" ||
			!["required", "preferred", "discouraged"].includes(value))
	)
		fail("TypeError");
}

function common(
	request: PasskeyProviderContext,
	options: Record<string, unknown>,
): Ceremony {
	const rpId = text(request.rpId);
	if (
		!/^[a-z0-9.-]+$/.test(rpId) ||
		!rpId.includes(".") ||
		rpId.endsWith(".") ||
		/^[0-9.]+$/.test(rpId) ||
		new URL(`https://${rpId}`).hostname !== rpId
	)
		fail("SecurityError");
	if (!(request.signal instanceof AbortSignal)) fail("TypeError");
	bytes(options.challenge, passkeyLimits.challengeBytes);
	if (options.extensions !== undefined) dictionary(options.extensions, []);
	const timeout =
		options.timeout === undefined
			? passkeyLimits.defaultTimeoutMs
			: options.timeout;
	if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)
		fail("TypeError");
	return {
		rpId,
		hash: bytes(request.clientDataHash, 32, 32),
		signal: request.signal,
		timeout: Math.min(
			Math.max(1, Math.floor(timeout)),
			passkeyLimits.maxTimeoutMs,
		),
	};
}

function creation(
	request: PasskeyProviderContext & { options: PasskeyCreationOptions },
): Creation {
	const options = dictionary(request.options, [
		"challenge",
		"rp",
		"user",
		"pubKeyCredParams",
		"timeout",
		"excludeCredentials",
		"authenticatorSelection",
		"attestation",
		"extensions",
	]);
	const context = common(request, options);
	const rp = dictionary(options.rp, ["id", "name"]);
	if (rp.id !== undefined && rp.id !== context.rpId) fail("SecurityError");
	const user = dictionary(options.user, ["id", "name", "displayName"]);
	const selection = dictionary(
		options.authenticatorSelection === undefined
			? {}
			: options.authenticatorSelection,
		[
			"authenticatorAttachment",
			"residentKey",
			"requireResidentKey",
			"userVerification",
		],
	);
	verification(selection.residentKey);
	verification(selection.userVerification);
	if (
		selection.requireResidentKey !== undefined &&
		typeof selection.requireResidentKey !== "boolean"
	)
		fail("TypeError");
	if (
		selection.userVerification === "required" ||
		(selection.authenticatorAttachment !== undefined &&
			selection.authenticatorAttachment !== "cross-platform") ||
		(options.attestation !== undefined && options.attestation !== "none")
	)
		fail("NotSupportedError");
	const algorithms = list(options.pubKeyCredParams, 16).map((entry) => {
		const algorithm = dictionary(entry, ["type", "alg"]);
		if (algorithm.type !== "public-key" || !Number.isSafeInteger(algorithm.alg))
			fail("TypeError");
		return algorithm.alg;
	});
	if (!algorithms.includes(-7)) fail("NotSupportedError");
	return {
		...context,
		rpName: text(rp.name),
		user: {
			id: new Uint8Array(bytes(user.id, 64)),
			name: text(user.name),
			displayName: text(user.displayName),
		},
		excluded: descriptors(options.excludeCredentials),
	};
}

function assertion(
	request: PasskeyProviderContext & { options: PasskeyRequestOptions },
): Assertion {
	const options = dictionary(request.options, [
		"challenge",
		"rpId",
		"timeout",
		"allowCredentials",
		"userVerification",
		"extensions",
	]);
	const context = common(request, options);
	if (options.rpId !== undefined && options.rpId !== context.rpId)
		fail("SecurityError");
	verification(options.userVerification);
	if (options.userVerification === "required") fail("NotSupportedError");
	return { ...context, allowed: descriptors(options.allowCredentials) };
}

function cborHeader(major: number, size: number): Buffer {
	if (size < 24) return Buffer.from([(major << 5) | size]);
	if (size < 256) return Buffer.from([(major << 5) | 24, size]);
	const result = Buffer.alloc(3);
	result[0] = (major << 5) | 25;
	result.writeUInt16BE(size, 1);
	return result;
}

type Cbor = number | string | Uint8Array | Map<string | number, Cbor>;
function cbor(value: Cbor): Buffer {
	if (typeof value === "number")
		return cborHeader(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
	if (value instanceof Map)
		return Buffer.concat([
			cborHeader(5, value.size),
			...Array.from(value, ([key, entry]) =>
				Buffer.concat([cbor(key), cbor(entry)]),
			),
		]);
	const content =
		typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
	return Buffer.concat([
		cborHeader(typeof value === "string" ? 3 : 2, content.length),
		content,
	]);
}

function authenticatorData(rpId: string, counter: number, attested: boolean) {
	const result = Buffer.alloc(37);
	createHash("sha256").update(rpId).digest().copy(result);
	result[32] = attested ? 0x41 : 0x01;
	result.writeUInt32BE(counter, 33);
	return result;
}

function limit(value: unknown, maximum: number): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 1 ||
		value > maximum
	)
		fail("TypeError");
	return value;
}

export class NodePasskeyAuthenticator implements PasskeyAuthenticator {
	readonly #capabilities: PasskeyCapabilities = Object.freeze({
		algorithms: Object.freeze([-7]),
		userVerification: false,
		attachment: "cross-platform",
		residentKey: true,
	});
	readonly #credentials = new Map<string, StoredCredential>();
	readonly #approve: NodePasskeyAuthenticatorOptions["approve"];
	readonly #maxCredentials: number;
	readonly #maxAssertions: number;
	#active: AbortController | undefined;
	#closed = false;

	constructor(options: NodePasskeyAuthenticatorOptions = {}) {
		this.#approve = options.approve;
		if (this.#approve !== undefined && typeof this.#approve !== "function")
			fail("TypeError");
		this.#maxCredentials = limit(options.maxCredentials ?? 64, 64);
		this.#maxAssertions = limit(
			options.maxAssertionsPerCredential ?? 0xffffffff,
			0xffffffff,
		);
	}

	get capabilities(): PasskeyCapabilities {
		return this.#capabilities;
	}

	close(): void {
		this.#closed = true;
		this.#credentials.clear();
		this.#active?.abort();
	}

	create(
		request: PasskeyProviderContext & { options: PasskeyCreationOptions },
	): Promise<PasskeyRegistration> {
		return this.#run(
			() => creation(request),
			async (input, signal, check) => {
				const checkExcluded = () => {
					for (const excluded of input.excluded) {
						if (
							this.#credentials.get(excluded.toString("hex"))?.rpId ===
							input.rpId
						)
							fail("InvalidStateError");
					}
				};
				checkExcluded();
				if (this.#credentials.size >= this.#maxCredentials)
					fail("NotAllowedError");
				await this.#consent(
					{
						operation: "create",
						rpId: input.rpId,
						rpName: input.rpName,
						user: { ...input.user, id: new Uint8Array(input.user.id) },
						clientDataHash: new Uint8Array(input.hash),
						signal,
					},
					check,
				);
				check();
				checkExcluded();
				const { privateKey, publicKey } = generateKeyPairSync("ec", {
					namedCurve: "prime256v1",
				});
				const publicJwk = publicKey.export({ format: "jwk" });
				if (!publicJwk.x || !publicJwk.y) fail("UnknownError");
				const publicCose = cbor(
					new Map<number, Cbor>([
						[1, 2],
						[3, -7],
						[-1, 1],
						[-2, Buffer.from(publicJwk.x, "base64url")],
						[-3, Buffer.from(publicJwk.y, "base64url")],
					]),
				);
				const credentialId = randomBytes(32);
				if (this.#credentials.has(credentialId.toString("hex")))
					fail("UnknownError");
				const attestationObject = cbor(
					new Map<string, Cbor>([
						["fmt", "none"],
						["attStmt", new Map()],
						[
							"authData",
							Buffer.concat([
								authenticatorData(input.rpId, 0, true),
								Buffer.alloc(16),
								Buffer.from([0, 32]),
								credentialId,
								publicCose,
							]),
						],
					]),
				);
				return () => {
					check();
					this.#credentials.set(credentialId.toString("hex"), {
						id: credentialId,
						rpId: input.rpId,
						user: input.user,
						privateKey,
						counter: 0,
					});
					return {
						credentialId: new Uint8Array(credentialId),
						attestationObject: new Uint8Array(attestationObject),
						algorithm: -7,
						residentKey: true,
						userConsented: true,
						userPresent: true,
						userVerified: false,
					};
				};
			},
		);
	}

	get(
		request: PasskeyProviderContext & { options: PasskeyRequestOptions },
	): Promise<PasskeyAssertion> {
		return this.#run(
			() => assertion(request),
			async (input, signal, check) => {
				const candidates = [...this.#credentials.values()]
					.filter(
						(credential) =>
							credential.rpId === input.rpId &&
							(!input.allowed.length ||
								input.allowed.some((allowed) => allowed.equals(credential.id))),
					)
					.map((credential) => ({
						id: Buffer.from(credential.id),
						user: {
							...credential.user,
							id: new Uint8Array(credential.user.id),
						},
					}));
				if (!candidates.length) fail("NotAllowedError");
				const selection = await this.#consent(
					{
						operation: "get",
						rpId: input.rpId,
						clientDataHash: new Uint8Array(input.hash),
						signal,
						credentials: candidates.map((credential) => ({
							credentialId: new Uint8Array(credential.id),
							user: {
								...credential.user,
								id: new Uint8Array(credential.user.id),
							},
						})),
					},
					check,
				);
				check();
				const selected =
					selection === undefined
						? candidates.length === 1
							? candidates[0]
							: undefined
						: candidates.find((candidate) => candidate.id.equals(selection));
				const credential =
					selected === undefined
						? undefined
						: this.#credentials.get(selected.id.toString("hex"));
				if (!credential || credential.counter >= this.#maxAssertions)
					fail("NotAllowedError");
				const counter = credential.counter + 1;
				const authData = authenticatorData(input.rpId, counter, false);
				const signature = sign(
					"sha256",
					Buffer.concat([authData, input.hash]),
					{
						key: credential.privateKey,
						dsaEncoding: "der",
					},
				);
				return () => {
					check();
					credential.counter = counter;
					return {
						credentialId: new Uint8Array(credential.id),
						authenticatorData: new Uint8Array(authData),
						signature: new Uint8Array(signature),
						userHandle: new Uint8Array(credential.user.id),
						userConsented: true,
						userPresent: true,
						userVerified: false,
					};
				};
			},
		);
	}

	async #consent(
		request: NodePasskeyApprovalRequest,
		check: () => void,
	): Promise<Buffer | undefined> {
		if (!this.#approve) fail("NotAllowedError");
		const operation = request.operation;
		let response: unknown;
		try {
			response = await this.#approve(request);
		} catch {
			check();
			fail("NotAllowedError");
		}
		check();
		const decision = dictionary(response, ["approved", "credentialId"]);
		if (decision.approved !== true) fail("NotAllowedError");
		if (operation === "create" && decision.credentialId !== undefined)
			fail("NotSupportedError");
		return decision.credentialId === undefined
			? undefined
			: bytes(decision.credentialId, 32, 32);
	}

	async #run<Input extends Ceremony, Result>(
		snapshot: () => Input,
		operation: (
			input: Input,
			signal: AbortSignal,
			check: () => void,
		) => Promise<() => Result>,
	): Promise<Result> {
		if (this.#closed || this.#active) fail("InvalidStateError");
		if (!this.#approve) fail("NotAllowedError");
		const controller = new AbortController();
		this.#active = controller;
		let cleanup = () => {};
		try {
			const input = snapshot();
			const deadline = performance.now() + input.timeout;
			const check = () => {
				if (this.#closed || controller.signal.aborted || input.signal.aborted)
					fail("AbortError");
				if (performance.now() >= deadline) fail("NotAllowedError");
			};
			check();
			let rejectCancellation!: (error: Error) => void;
			const cancelled = new Promise<never>((_, reject) => {
				rejectCancellation = reject;
			});
			const cancel = () => {
				controller.abort();
				const error = new Error("Ephemeral authenticator operation denied");
				error.name = "AbortError";
				rejectCancellation(error);
			};
			controller.signal.addEventListener("abort", cancel, { once: true });
			input.signal.addEventListener("abort", cancel, { once: true });
			const timer = setTimeout(cancel, input.timeout);
			cleanup = () => {
				clearTimeout(timer);
				controller.signal.removeEventListener("abort", cancel);
				input.signal.removeEventListener("abort", cancel);
			};
			const result = await Promise.race([
				operation(input, controller.signal, check),
				cancelled,
			]);
			check();
			return result();
		} finally {
			cleanup();
			if (this.#active === controller) this.#active = undefined;
		}
	}
}
