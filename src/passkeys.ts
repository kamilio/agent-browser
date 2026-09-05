export const passkeyLimits = Object.freeze({
	challengeBytes: 1024,
	credentialIdBytes: 1023,
	credentialCount: 64,
	nameChars: 256,
	responseBytes: 64 * 1024,
	defaultTimeoutMs: 60_000,
	maxTimeoutMs: 120_000,
	documentPollMs: 25,
});

export type PasskeyVerification = "required" | "preferred" | "discouraged";
export type PasskeyAttachment = "platform" | "cross-platform";
export type PasskeyTransport = "usb" | "nfc" | "ble" | "internal" | "hybrid";
export interface PasskeyDescriptor {
	type: "public-key";
	id: BufferSource;
	transports?: readonly PasskeyTransport[];
}
export interface PasskeyCreationOptions {
	challenge: BufferSource;
	rp: { id?: string; name: string };
	user: { id: BufferSource; name: string; displayName: string };
	pubKeyCredParams: readonly { type: "public-key"; alg: number }[];
	timeout?: number;
	excludeCredentials?: readonly PasskeyDescriptor[];
	authenticatorSelection?: {
		authenticatorAttachment?: PasskeyAttachment;
		residentKey?: PasskeyVerification;
		requireResidentKey?: boolean;
		userVerification?: PasskeyVerification;
	};
	attestation?: "none" | "indirect" | "direct" | "enterprise";
	extensions?: Record<string, unknown>;
}
export interface PasskeyRequestOptions {
	challenge: BufferSource;
	rpId?: string;
	timeout?: number;
	allowCredentials?: readonly PasskeyDescriptor[];
	userVerification?: PasskeyVerification;
	extensions?: Record<string, unknown>;
}
export interface PasskeyContext {
	origin: string;
	topLevel: boolean;
	signal?: AbortSignal;
	isCurrent: () => boolean;
}
export interface PasskeyCapabilities {
	algorithms: readonly number[];
	userVerification: boolean;
	residentKey: boolean;
	attachment: PasskeyAttachment;
}
export interface PasskeyProviderContext {
	rpId: string;
	clientDataHash: Uint8Array;
	clientDataJSON?: Uint8Array;
	signal: AbortSignal;
}
export interface PasskeyConsent {
	userConsented: boolean;
	userPresent: boolean;
	userVerified: boolean;
}
export interface PasskeyRegistration extends PasskeyConsent {
	credentialId: BufferSource;
	attestationObject: BufferSource;
	algorithm: number;
	residentKey: boolean;
}
export interface PasskeyAssertion extends PasskeyConsent {
	credentialId: BufferSource;
	authenticatorData: BufferSource;
	signature: BufferSource;
	userHandle: BufferSource | null;
}
export interface PasskeyAuthenticator {
	readonly capabilities: PasskeyCapabilities;
	create(
		request: PasskeyProviderContext & { options: PasskeyCreationOptions },
	): Promise<PasskeyRegistration>;
	get(
		request: PasskeyProviderContext & { options: PasskeyRequestOptions },
	): Promise<PasskeyAssertion>;
}
export interface PasskeyCredential<Response> {
	id: string;
	rawId: ArrayBuffer;
	type: "public-key";
	response: Response & { clientDataJSON: ArrayBuffer };
}
export type PasskeyCreationCredential = PasskeyCredential<{
	attestationObject: ArrayBuffer;
}>;
export type PasskeyAssertionCredential = PasskeyCredential<{
	authenticatorData: ArrayBuffer;
	signature: ArrayBuffer;
	userHandle: ArrayBuffer | null;
}>;

type ErrorName =
	| "TypeError"
	| "SecurityError"
	| "NotSupportedError"
	| "NotAllowedError"
	| "InvalidStateError"
	| "AbortError"
	| "UnknownError";
const messages: Record<ErrorName, string> = {
	TypeError: "Invalid passkey options",
	SecurityError: "Passkey origin is not supported",
	NotSupportedError: "Passkey requirement is not supported",
	NotAllowedError: "Passkey ceremony was not allowed",
	InvalidStateError: "Passkey broker is unavailable",
	AbortError: "Passkey ceremony was aborted",
	UnknownError: "Passkey authenticator failed",
};
class PasskeyError extends Error {
	constructor(name: ErrorName) {
		super(messages[name]);
		this.name = name;
	}
}
function fail(name: ErrorName): never {
	throw new PasskeyError(name);
}
function object(value: unknown, keys: readonly string[]) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		fail("TypeError");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Object.getOwnPropertySymbols(value).length) fail("TypeError");
	for (const [key, descriptor] of Object.entries(descriptors)) {
		if (!Object.hasOwn(descriptor, "value")) fail("TypeError");
		if (!keys.includes(key)) fail("NotSupportedError");
	}
	return Object.fromEntries(
		Object.entries(descriptors).map(([key, descriptor]) => [
			key,
			descriptor.value,
		]),
	) as Record<string, unknown>;
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
const arrayBufferLength = Object.getOwnPropertyDescriptor(
	ArrayBuffer.prototype,
	"byteLength",
)?.get;
const nativeViewSlots = [
	Object.getPrototypeOf(Uint8Array.prototype),
	DataView.prototype,
].map((prototype) => ({
	buffer: Object.getOwnPropertyDescriptor(prototype, "buffer")?.get,
	offset: Object.getOwnPropertyDescriptor(prototype, "byteOffset")?.get,
	length: Object.getOwnPropertyDescriptor(prototype, "byteLength")?.get,
}));

function bytes(
	value: unknown,
	maximum: number,
	minimum = 1,
): Uint8Array<ArrayBuffer> {
	try {
		const view = ArrayBuffer.isView(value);
		let buffer = value;
		let offset = 0;
		let size: number;
		if (view) {
			let slots = nativeViewSlots[0];
			try {
				buffer = slots.buffer?.call(value);
			} catch {
				slots = nativeViewSlots[1];
				buffer = slots.buffer?.call(value);
			}
			offset = slots.offset?.call(value) as number;
			size = slots.length?.call(value) as number;
		} else size = arrayBufferLength?.call(buffer) as number;
		const length = arrayBufferLength?.call(buffer) as number;
		if (
			!Number.isSafeInteger(length) ||
			!Number.isSafeInteger(offset) ||
			!Number.isSafeInteger(size) ||
			offset < 0 ||
			size < minimum ||
			size > maximum ||
			offset > length - size
		)
			fail("TypeError");
		return new Uint8Array(new Uint8Array(buffer as ArrayBuffer, offset, size));
	} catch {
		return fail("TypeError");
	}
}
function list(value: unknown, maximum: number): unknown[] {
	if (!Array.isArray(value) || value.length > maximum) fail("TypeError");
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value")) fail("TypeError");
		return descriptor.value;
	});
}
function choice<Value extends string>(
	value: unknown,
	allowed: readonly Value[],
	fallback: Value,
): Value {
	if (value === undefined) return fallback;
	if (typeof value !== "string" || !allowed.includes(value as Value))
		fail("TypeError");
	return value as Value;
}
function verification(
	value: unknown,
	fallback: PasskeyVerification = "preferred",
) {
	return choice(value, ["required", "preferred", "discouraged"], fallback);
}
function descriptors(value: unknown): PasskeyDescriptor[] {
	if (value === undefined) return [];
	return list(value, passkeyLimits.credentialCount).map((input) => {
		const descriptor = object(input, ["type", "id", "transports"]);
		if (descriptor.type !== "public-key") fail("TypeError");
		const result: PasskeyDescriptor = {
			type: "public-key",
			id: bytes(descriptor.id, passkeyLimits.credentialIdBytes),
		};
		if (descriptor.transports !== undefined)
			result.transports = list(descriptor.transports, 5).map((transport) =>
				choice(
					transport,
					["usb", "nfc", "ble", "internal", "hybrid"],
					"internal",
				),
			);
		return result;
	});
}
function timeout(value: unknown): number {
	if (value === undefined) return passkeyLimits.defaultTimeoutMs;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
		fail("TypeError");
	return Math.min(Math.max(1, Math.floor(value)), passkeyLimits.maxTimeoutMs);
}
function base64url(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
function same(left: Uint8Array, right: Uint8Array): boolean {
	return (
		left.length === right.length &&
		left.every((byte, index) => byte === right[index])
	);
}
function origin(context: PasskeyContext): string {
	try {
		const url = new URL(context.origin);
		if (
			context.topLevel !== true ||
			url.protocol !== "https:" ||
			url.origin !== context.origin ||
			url.username ||
			url.password ||
			url.hostname.endsWith(".") ||
			!url.hostname.includes(".") ||
			!/^[a-z0-9.-]+$/.test(url.hostname) ||
			/^[0-9.]+$/.test(url.hostname)
		)
			fail("SecurityError");
		return url.hostname;
	} catch {
		return fail("SecurityError");
	}
}
function rpId(value: unknown, host: string): string {
	if (value !== undefined && value !== host) fail("SecurityError");
	return host;
}
function extensions(value: unknown) {
	if (value !== undefined) object(value, []);
}

export class PasskeyBroker {
	readonly capabilities: Readonly<PasskeyCapabilities>;
	readonly #authenticator: PasskeyAuthenticator;
	private active: { cancel: (name: ErrorName) => void } | undefined;
	private starting = false;
	private closed = false;

	constructor(authenticator: PasskeyAuthenticator) {
		this.#authenticator = authenticator;
		const input = object(authenticator?.capabilities, [
			"algorithms",
			"userVerification",
			"residentKey",
			"attachment",
		]);
		const algorithms = list(input.algorithms, 16).map((algorithm) => {
			if (typeof algorithm !== "number" || ![-7, -257, -8].includes(algorithm))
				fail("NotSupportedError");
			return algorithm;
		});
		if (
			!algorithms.length ||
			typeof input.userVerification !== "boolean" ||
			typeof input.residentKey !== "boolean" ||
			!["platform", "cross-platform"].includes(String(input.attachment)) ||
			typeof authenticator.create !== "function" ||
			typeof authenticator.get !== "function"
		)
			fail("TypeError");
		this.capabilities = Object.freeze({
			algorithms: Object.freeze(algorithms),
			userVerification: input.userVerification,
			residentKey: input.residentKey,
			attachment: input.attachment as PasskeyAttachment,
		});
	}

	create(
		options: PasskeyCreationOptions,
		context: PasskeyContext,
	): Promise<PasskeyCreationCredential> {
		return this.run(
			"webauthn.create",
			options,
			context,
		) as Promise<PasskeyCreationCredential>;
	}

	get(
		options: PasskeyRequestOptions,
		context: PasskeyContext,
	): Promise<PasskeyAssertionCredential> {
		return this.run(
			"webauthn.get",
			options,
			context,
		) as Promise<PasskeyAssertionCredential>;
	}

	close(): void {
		this.closed = true;
		this.active?.cancel("AbortError");
	}

	private creation(value: unknown, host: string): PasskeyCreationOptions {
		const input = object(value, [
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
		const rp = object(input.rp, ["id", "name"]);
		const user = object(input.user, ["id", "name", "displayName"]);
		const selection =
			input.authenticatorSelection === undefined
				? {}
				: object(input.authenticatorSelection, [
						"authenticatorAttachment",
						"residentKey",
						"requireResidentKey",
						"userVerification",
					]);
		if (
			selection.requireResidentKey !== undefined &&
			typeof selection.requireResidentKey !== "boolean"
		)
			fail("TypeError");
		const residentKey = verification(
			selection.residentKey,
			selection.requireResidentKey === true ? "required" : "discouraged",
		);
		const userVerification = verification(selection.userVerification);
		const attachment =
			selection.authenticatorAttachment === undefined
				? undefined
				: choice(
						selection.authenticatorAttachment,
						["platform", "cross-platform"],
						"cross-platform",
					);
		if (attachment !== undefined && attachment !== this.capabilities.attachment)
			fail("NotSupportedError");
		if (
			(residentKey === "required" && !this.capabilities.residentKey) ||
			(userVerification === "required" && !this.capabilities.userVerification)
		)
			fail("NotSupportedError");
		const attestation = choice(
			input.attestation,
			["none", "direct", "indirect", "enterprise"],
			"none",
		);
		if (attestation !== "none") fail("NotSupportedError");
		extensions(input.extensions);
		const algorithms = list(input.pubKeyCredParams, 16)
			.map((entry) => {
				const param = object(entry, ["type", "alg"]);
				if (
					param.type !== "public-key" ||
					typeof param.alg !== "number" ||
					!Number.isSafeInteger(param.alg)
				)
					fail("TypeError");
				return { type: "public-key" as const, alg: param.alg };
			})
			.filter((param) => this.capabilities.algorithms.includes(param.alg));
		if (!algorithms.length) fail("NotSupportedError");
		return {
			challenge: bytes(input.challenge, passkeyLimits.challengeBytes),
			rp: { id: rpId(rp.id, host), name: text(rp.name) },
			user: {
				id: bytes(user.id, 64),
				name: text(user.name),
				displayName: text(user.displayName),
			},
			pubKeyCredParams: algorithms,
			timeout: timeout(input.timeout),
			excludeCredentials: descriptors(input.excludeCredentials),
			authenticatorSelection: {
				residentKey,
				requireResidentKey: residentKey === "required",
				userVerification,
				...(attachment === undefined
					? {}
					: { authenticatorAttachment: attachment }),
			},
			attestation: "none",
		};
	}

	private request(value: unknown, host: string): PasskeyRequestOptions {
		const input = object(value, [
			"challenge",
			"rpId",
			"timeout",
			"allowCredentials",
			"userVerification",
			"extensions",
		]);
		const userVerification = verification(input.userVerification);
		if (userVerification === "required" && !this.capabilities.userVerification)
			fail("NotSupportedError");
		extensions(input.extensions);
		const allowCredentials = descriptors(input.allowCredentials);
		if (!allowCredentials.length && !this.capabilities.residentKey)
			fail("NotSupportedError");
		return {
			challenge: bytes(input.challenge, passkeyLimits.challengeBytes),
			rpId: rpId(input.rpId, host),
			timeout: timeout(input.timeout),
			allowCredentials,
			userVerification,
		};
	}

	private async run(
		type: "webauthn.create" | "webauthn.get",
		input: unknown,
		trusted: PasskeyContext,
	) {
		if (this.closed || this.active || this.starting) fail("InvalidStateError");
		this.starting = true;
		let context: PasskeyContext;
		let options: PasskeyCreationOptions | PasskeyRequestOptions;
		let host: string;
		try {
			context = {
				origin: trusted.origin,
				topLevel: trusted.topLevel,
				signal: trusted.signal,
				isCurrent: trusted.isCurrent,
			};
			host = origin(context);
			if (context.signal?.aborted) fail("AbortError");
			try {
				if (context.isCurrent() !== true) fail("AbortError");
			} catch {
				fail("AbortError");
			}
			options =
				type === "webauthn.create"
					? this.creation(input, host)
					: this.request(input, host);
		} catch (error) {
			throw error instanceof PasskeyError
				? error
				: new PasskeyError("TypeError");
		} finally {
			this.starting = false;
		}
		const clientData = new TextEncoder().encode(
			JSON.stringify({
				type,
				challenge: base64url(
					bytes(options.challenge, passkeyLimits.challengeBytes),
				),
				origin: context.origin,
				crossOrigin: false,
			}),
		);
		const controller = new AbortController();
		const deadline = performance.now() + (options.timeout as number);
		return new Promise<PasskeyCreationCredential | PasskeyAssertionCredential>(
			(resolve, reject) => {
				let settled = false;
				const finish = (
					error?: PasskeyError,
					result?: PasskeyCreationCredential | PasskeyAssertionCredential,
				) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					clearInterval(poll);
					context.signal?.removeEventListener("abort", aborted);
					if (this.active === operation) this.active = undefined;
					if (error) {
						reject(error);
						controller.abort();
					} else
						resolve(
							result as PasskeyCreationCredential | PasskeyAssertionCredential,
						);
				};
				const operation = {
					cancel: (name: ErrorName) => finish(new PasskeyError(name)),
				};
				const aborted = () => operation.cancel("AbortError");
				const valid = () => {
					if (settled) return false;
					try {
						if (
							this.closed ||
							context.signal?.aborted ||
							context.isCurrent() !== true
						)
							aborted();
						else if (performance.now() >= deadline)
							operation.cancel("NotAllowedError");
					} catch {
						aborted();
					}
					return !settled;
				};
				this.active = operation;
				const timer = setTimeout(
					() => operation.cancel("NotAllowedError"),
					options.timeout,
				);
				const poll = setInterval(valid, passkeyLimits.documentPollMs);
				context.signal?.addEventListener("abort", aborted, { once: true });
				const perform = async () => {
					if (!valid()) return;
					const hash = new Uint8Array(
						await crypto.subtle.digest("SHA-256", clientData),
					);
					if (!valid()) return;
					const providerContext = {
						rpId: host,
						clientDataHash: hash,
						clientDataJSON: new Uint8Array(clientData),
						signal: controller.signal,
					};
					const requiredUV =
						type === "webauthn.create"
							? (options as PasskeyCreationOptions).authenticatorSelection
									?.userVerification === "required"
							: (options as PasskeyRequestOptions).userVerification ===
								"required";
					const requiredResident =
						type === "webauthn.create" &&
						(options as PasskeyCreationOptions).authenticatorSelection
							?.residentKey === "required";
					const identifiers = (
						(type === "webauthn.create"
							? (options as PasskeyCreationOptions).excludeCredentials
							: (options as PasskeyRequestOptions).allowCredentials) ?? []
					).map((descriptor) =>
						bytes(descriptor.id, passkeyLimits.credentialIdBytes),
					);
					const algorithms =
						type === "webauthn.create"
							? (options as PasskeyCreationOptions).pubKeyCredParams.map(
									(param) => param.alg,
								)
							: [];
					const result =
						type === "webauthn.create"
							? await this.#authenticator.create({
									...providerContext,
									options: options as PasskeyCreationOptions,
								})
							: await this.#authenticator.get({
									...providerContext,
									options: options as PasskeyRequestOptions,
								});
					if (!valid()) return;
					const userVerified = result.userVerified;
					if (
						result.userConsented !== true ||
						result.userPresent !== true ||
						typeof userVerified !== "boolean" ||
						(requiredUV && userVerified !== true)
					)
						fail("NotAllowedError");
					const rawId = bytes(
						result.credentialId,
						passkeyLimits.credentialIdBytes,
					);
					const common = {
						id: base64url(rawId),
						rawId: rawId.buffer,
						type: "public-key" as const,
					};
					let credential:
						| PasskeyCreationCredential
						| PasskeyAssertionCredential;
					if (type === "webauthn.create") {
						const registration = result as PasskeyRegistration;
						if (
							!algorithms.includes(registration.algorithm) ||
							typeof registration.residentKey !== "boolean"
						)
							fail("UnknownError");
						if (requiredResident && !registration.residentKey)
							fail("NotAllowedError");
						if (identifiers.some((identifier) => same(identifier, rawId)))
							fail("InvalidStateError");
						credential = {
							...common,
							response: {
								clientDataJSON: clientData.buffer,
								attestationObject: bytes(
									registration.attestationObject,
									passkeyLimits.responseBytes,
								).buffer,
							},
						};
					} else {
						const assertion = result as PasskeyAssertion;
						if (
							identifiers.length &&
							!identifiers.some((identifier) => same(identifier, rawId))
						)
							fail("NotAllowedError");
						const authenticatorData = bytes(
							assertion.authenticatorData,
							passkeyLimits.responseBytes,
							37,
						);
						const signature = bytes(
							assertion.signature,
							passkeyLimits.responseBytes,
						);
						const userHandle =
							assertion.userHandle === null
								? null
								: bytes(assertion.userHandle, 64).buffer;
						if (!identifiers.length && userHandle === null)
							fail("NotAllowedError");
						const rpHash = new Uint8Array(
							await crypto.subtle.digest(
								"SHA-256",
								new TextEncoder().encode(host),
							),
						);
						if (!valid()) return;
						if (
							!same(authenticatorData.subarray(0, 32), rpHash) ||
							(authenticatorData[32] & 1) === 0 ||
							((authenticatorData[32] & 4) !== 0) !== userVerified
						)
							fail("NotAllowedError");
						credential = {
							...common,
							response: {
								clientDataJSON: clientData.buffer,
								authenticatorData: authenticatorData.buffer,
								signature: signature.buffer,
								userHandle,
							},
						};
					}
					if (valid()) finish(undefined, credential);
				};
				void perform().catch((error: unknown) => {
					if (valid())
						finish(
							error instanceof PasskeyError
								? error
								: new PasskeyError("UnknownError"),
						);
				});
			},
		);
	}
}
