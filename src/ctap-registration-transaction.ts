import { type CtapCborValue, decodeCtapCbor } from "./ctap-cbor.js";
import {
	type CtapMakeCredentialRequest,
	encodeCtapMakeCredentialRequest,
} from "./ctap-make-credential-request.js";
import {
	type CtapCredentialResponse,
	decodeCtapMakeCredentialResponse,
	wipeCtapCredentialResponse,
} from "./ctap-make-credential-response.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidCborResult,
} from "./fido-hid-connection.js";
import type { FidoHidResponseError } from "./fido-hid-response-control.js";

export interface CtapRegistrationTransactionOptions {
	maxMessageSize?: bigint;
	timeoutMs?: number;
	maxResponseBytes?: number;
	signal?: AbortSignal;
}

export interface CtapCreatedCredential extends CtapCredentialResponse {
	userPresent: boolean;
	userVerified: boolean;
	residentKeyRequested: boolean;
}

export type CtapRegistrationTransactionResult =
	| { kind: "credential"; credential: CtapCreatedCredential }
	| { kind: "ctap-error"; status: number }
	| { kind: "hid-error"; code: number; error: FidoHidResponseError };

const signalAborted = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
const exclusive = FidoHidCborConnection.prototype.withExclusiveExchange;
const fillBytes = Uint8Array.prototype.fill;
const errorCodes: readonly ErrorCode[] = [
	"invalid-input",
	"stale-reference",
	"not-found",
	"not-actionable",
	"policy-denied",
	"resource-limit",
	"unsupported",
	"network-error",
	"timeout",
	"aborted",
	"closed",
];

function failure(code: ErrorCode): AgentBrowserError {
	return new AgentBrowserError(code, "CTAP registration transaction failed.");
}

function sanitized(error: unknown): AgentBrowserError {
	try {
		if (error instanceof AgentBrowserError && errorCodes.includes(error.code))
			return failure(error.code);
	} catch {}
	return failure("unsupported");
}

function optionsRecord(input: unknown): Record<string, unknown> {
	try {
		if (!input || typeof input !== "object" || Array.isArray(input))
			throw failure("invalid-input");
		const descriptors = Object.getOwnPropertyDescriptors(input);
		const keys = ["maxMessageSize", "timeoutMs", "maxResponseBytes", "signal"];
		const result: Record<string, unknown> = Object.create(null);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !keys.includes(key))
				throw failure("invalid-input");
			const descriptor = descriptors[key];
			if (!Object.hasOwn(descriptor, "value")) throw failure("invalid-input");
			result[key] = descriptor.value;
		}
		return result;
	} catch {
		throw failure("invalid-input");
	}
}

function limit(input: unknown, fallback: number, maximum: number): number {
	const value = input === undefined ? fallback : input;
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 1 ||
		value > maximum
	)
		throw failure("invalid-input");
	return value;
}

function field(
	map: CtapCborValue,
	key: bigint | string,
): CtapCborValue | undefined {
	if (map.kind !== "map") throw failure("invalid-input");
	return map.entries.find(
		([candidate]) =>
			(candidate.kind === "unsigned" || candidate.kind === "text") &&
			candidate.value === key,
	)?.[1];
}

function wipeBytes(bytes: Uint8Array | undefined): void {
	if (bytes === undefined) return;
	try {
		fillBytes.call(bytes, 0);
	} catch {}
}

function wipeCbor(value: CtapCborValue): void {
	if (value.kind === "bytes") wipeBytes(value.value);
	else if (value.kind === "float") wipeBytes(value.encoding);
	else if (value.kind === "array")
		for (const item of value.items) wipeCbor(item);
	else if (value.kind === "map")
		for (const [key, item] of value.entries) {
			wipeCbor(key);
			wipeCbor(item);
		}
}

function same(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index++)
		difference |= left[index] ^ right[index];
	return difference === 0;
}

export async function makeCtapCredential(
	connection: FidoHidCborConnection,
	request: CtapMakeCredentialRequest,
	options: CtapRegistrationTransactionOptions = {},
): Promise<CtapRegistrationTransactionResult> {
	const controller = new AbortController();
	let committed = false;
	let stopReason: AgentBrowserError | undefined;
	let rejectStop: (error: AgentBrowserError) => void = () => undefined;
	const stopped = new Promise<never>((_resolve, reject) => {
		rejectStop = reject;
	});
	void stopped.catch(() => undefined);
	const stop = (code: "timeout" | "aborted") => {
		if (stopReason || committed) return;
		stopReason = failure(code);
		controller.abort();
		rejectStop(stopReason);
	};
	const relay = () => stop("aborted");
	let sourceSignal: AbortSignal | undefined;
	let listening = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let deadline = Number.POSITIVE_INFINITY;
	let encoded: Uint8Array | undefined;
	let snapshot: CtapCborValue | undefined;
	let rpBytes: Uint8Array<ArrayBuffer> | undefined;
	let rpHash: Uint8Array | undefined;
	let credential: CtapCredentialResponse | undefined;
	let selected: CtapCreatedCredential | undefined;
	let transferred = false;
	let terminal:
		| Exclude<CtapRegistrationTransactionResult, { kind: "credential" }>
		| undefined;
	const check = () => {
		if (!stopReason && performance.now() >= deadline) stop("timeout");
		if (stopReason) throw stopReason;
	};
	const bounded = async <Value>(operation: Promise<Value>): Promise<Value> => {
		void operation.catch(() => undefined);
		check();
		return Promise.race([operation, stopped]);
	};
	const disarm = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		if (sourceSignal && listening) {
			listening = false;
			try {
				removeListener.call(sourceSignal, "abort", relay);
			} catch {}
		}
	};
	try {
		const settings = optionsRecord(options);
		const timeoutMs = limit(settings.timeoutMs, 120_000, 120_000);
		const maxResponseBytes = limit(settings.maxResponseBytes, 7609, 7609);
		if (settings.signal !== undefined) {
			try {
				const aborted = signalAborted?.call(settings.signal);
				if (typeof aborted !== "boolean") throw failure("invalid-input");
				sourceSignal = settings.signal as AbortSignal;
				if (aborted) throw failure("aborted");
			} catch (error) {
				if (error instanceof AgentBrowserError && error.code === "aborted")
					throw error;
				throw failure("invalid-input");
			}
		}
		deadline = performance.now() + timeoutMs;
		encoded = encodeCtapMakeCredentialRequest(
			request,
			settings.maxMessageSize as bigint | undefined,
		);
		snapshot = decodeCtapCbor(encoded.subarray(1));
		const hash = field(snapshot, 1n);
		const rp = field(snapshot, 2n);
		const parameters = field(snapshot, 4n);
		const requestOptions = field(snapshot, 7n);
		if (
			hash?.kind !== "bytes" ||
			hash.value.length !== 32 ||
			!rp ||
			parameters?.kind !== "array" ||
			!requestOptions
		)
			throw failure("invalid-input");
		const rpId = field(rp, "id");
		const uv = field(requestOptions, "uv");
		const rk = field(requestOptions, "rk");
		if (
			rpId?.kind !== "text" ||
			uv?.kind !== "simple" ||
			(uv.value !== 20 && uv.value !== 21) ||
			rk?.kind !== "simple" ||
			(rk.value !== 20 && rk.value !== 21)
		)
			throw failure("invalid-input");
		const requiredUV = uv.value === 21;
		const residentKeyRequested = rk.value === 21;
		const offered = new Set<bigint>();
		for (const parameter of parameters.items) {
			const type = field(parameter, "type");
			const algorithm = field(parameter, "alg");
			if (
				type?.kind !== "text" ||
				type.value !== "public-key" ||
				(algorithm?.kind !== "unsigned" && algorithm?.kind !== "negative")
			)
				throw failure("invalid-input");
			offered.add(algorithm.value);
		}
		const excluded: Uint8Array[] = [];
		const listed = field(snapshot, 5n);
		if (listed !== undefined) {
			if (listed.kind !== "array") throw failure("invalid-input");
			for (const descriptor of listed.items) {
				const identifier = field(descriptor, "id");
				if (identifier?.kind !== "bytes") throw failure("invalid-input");
				excluded.push(identifier.value);
			}
		}
		timer = setTimeout(
			() => stop("timeout"),
			Math.max(0, deadline - performance.now()),
		);
		if (sourceSignal !== undefined) {
			addListener.call(sourceSignal, "abort", relay, { once: true });
			listening = true;
			if (signalAborted?.call(sourceSignal)) stop("aborted");
		}
		check();
		rpBytes = new TextEncoder().encode(rpId.value);
		let digestDelivered: Uint8Array | undefined;
		let digestAbandoned = false;
		const digest = crypto.subtle.digest("SHA-256", rpBytes).then((buffer) => {
			const bytes = new Uint8Array(buffer);
			digestDelivered = bytes;
			if (digestAbandoned) wipeBytes(bytes);
			return bytes;
		});
		try {
			rpHash = await bounded(digest);
		} catch (error) {
			digestAbandoned = true;
			wipeBytes(digestDelivered);
			throw error;
		}
		if (rpHash.length !== 32) throw failure("unsupported");
		check();
		await exclusive.call(connection, async (exchange) => {
			check();
			if (!encoded) throw failure("invalid-input");
			let delivered: FidoHidCborResult | undefined;
			let abandoned = false;
			const operation = exchange(encoded, {
				signal: controller.signal,
				timeoutMs: Math.ceil(deadline - performance.now()),
			}).then((response) => {
				delivered = response;
				if (abandoned && response.kind === "response")
					wipeBytes(response.payload);
				return response;
			});
			let response: FidoHidCborResult;
			try {
				response = await bounded(operation);
			} catch (error) {
				abandoned = true;
				if (delivered?.kind === "response") wipeBytes(delivered.payload);
				throw error;
			}
			if (response.kind === "error") {
				check();
				terminal = {
					kind: "hid-error",
					code: response.code,
					error: response.error,
				};
				throw failure("unsupported");
			}
			try {
				check();
				if (response.payload.length > maxResponseBytes)
					throw failure("resource-limit");
				const result = decodeCtapMakeCredentialResponse(response.payload);
				if (result.kind === "ctap-error") {
					check();
					terminal = result;
					throw failure("unsupported");
				}
				credential = result.credential;
				check();
				const attested = credential.attestedCredentialData;
				if (
					!rpHash ||
					!same(attested.rpIdHash, rpHash) ||
					(attested.flags & 1) === 0 ||
					(requiredUV && (attested.flags & 4) === 0) ||
					!offered.has(BigInt(attested.credentialPublicKey.algorithm)) ||
					excluded.some((identifier) =>
						same(identifier, attested.credentialId),
					) ||
					attested.extensions !== undefined
				)
					throw failure("policy-denied");
				selected = {
					...credential,
					userPresent: (attested.flags & 1) !== 0,
					userVerified: (attested.flags & 4) !== 0,
					residentKeyRequested,
				};
				check();
				committed = true;
				disarm();
			} finally {
				wipeBytes(response.payload);
			}
		});
		if (!selected) throw failure("invalid-input");
		transferred = true;
		return { kind: "credential", credential: selected };
	} catch (error) {
		if (!committed && !stopReason && performance.now() >= deadline)
			stop("timeout");
		if (stopReason) throw stopReason;
		if (terminal) return terminal;
		throw sanitized(error);
	} finally {
		disarm();
		wipeBytes(encoded);
		if (snapshot) wipeCbor(snapshot);
		wipeBytes(rpBytes);
		wipeBytes(rpHash);
		if (!transferred && credential) wipeCtapCredentialResponse(credential);
	}
}
