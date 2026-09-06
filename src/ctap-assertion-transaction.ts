import { type CtapCborValue, decodeCtapCbor } from "./ctap-cbor.js";
import {
	type CtapGetAssertionRequest,
	encodeCtapGetAssertionRequest,
} from "./ctap-get-assertion-request.js";
import {
	type CtapAssertionResponse,
	decodeCtapGetAssertionResponse,
} from "./ctap-get-assertion-response.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidCborResult,
} from "./fido-hid-connection.js";
import type { FidoHidResponseError } from "./fido-hid-response-control.js";

export interface CtapAssertionCandidate {
	readonly index: number;
	readonly userId: Uint8Array;
	readonly name?: string;
	readonly displayName?: string;
}

export interface CtapAssertionTransactionOptions {
	maxMessageSize?: bigint;
	timeoutMs?: number;
	maxCredentials?: number;
	maxResponseBytes?: number;
	signal?: AbortSignal;
	select?: (
		candidates: readonly CtapAssertionCandidate[],
		signal: AbortSignal,
	) => number | Promise<number>;
}

export interface CtapSelectedAssertion {
	credentialId: Uint8Array;
	authenticatorData: Uint8Array;
	signature: Uint8Array;
	userHandle: Uint8Array | null;
	userPresent: boolean;
	userVerified: boolean;
}

export type CtapAssertionTransactionResult =
	| { kind: "assertion"; assertion: CtapSelectedAssertion }
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
	return new AgentBrowserError(code, "CTAP assertion transaction failed.");
}

function sanitized(error: unknown): AgentBrowserError {
	try {
		if (error instanceof AgentBrowserError) {
			const code = error.code;
			if (errorCodes.includes(code)) return failure(code);
		}
	} catch {}
	return failure("unsupported");
}

function optionsRecord(input: unknown): Record<string, unknown> {
	try {
		if (!input || typeof input !== "object" || Array.isArray(input))
			throw failure("invalid-input");
		const descriptors = Object.getOwnPropertyDescriptors(input);
		const keys = [
			"maxMessageSize",
			"timeoutMs",
			"maxCredentials",
			"maxResponseBytes",
			"signal",
			"select",
		];
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

function wipeAssertion(assertion: CtapAssertionResponse): void {
	wipeBytes(assertion.credentialId);
	wipeBytes(assertion.authenticatorData);
	wipeBytes(assertion.signature);
	wipeBytes(assertion.user?.id);
}

function wipeBytes(bytes: Uint8Array | null | undefined): void {
	if (bytes === undefined || bytes === null) return;
	try {
		fillBytes.call(bytes, 0);
	} catch {}
}

function same(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index++)
		difference |= left[index] ^ right[index];
	return difference === 0;
}

export async function getCtapAssertion(
	connection: FidoHidCborConnection,
	request: CtapGetAssertionRequest,
	options: CtapAssertionTransactionOptions = {},
): Promise<CtapAssertionTransactionResult> {
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
	let rpHash: Uint8Array | undefined;
	let transferred = false;
	let selected: CtapSelectedAssertion | undefined;
	let terminal:
		| Exclude<CtapAssertionTransactionResult, { kind: "assertion" }>
		| undefined;
	const responses: CtapAssertionResponse[] = [];
	const selectionBuffers: Uint8Array[] = [];
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
		const maxCredentials = limit(settings.maxCredentials, 64, 64);
		const maxResponseBytes = limit(settings.maxResponseBytes, 65_536, 486_976);
		const selector =
			settings.select as CtapAssertionTransactionOptions["select"];
		if (selector !== undefined && typeof selector !== "function")
			throw failure("invalid-input");
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
		encoded = encodeCtapGetAssertionRequest(
			request,
			settings.maxMessageSize as bigint | undefined,
		);
		snapshot = decodeCtapCbor(encoded.subarray(1));
		const rp = field(snapshot, 1n);
		const hash = field(snapshot, 2n);
		const requestOptions = field(snapshot, 5n);
		if (
			rp?.kind !== "text" ||
			hash?.kind !== "bytes" ||
			hash.value.length !== 32 ||
			!requestOptions
		)
			throw failure("invalid-input");
		const up = field(requestOptions, "up");
		const uv = field(requestOptions, "uv");
		if (
			up?.kind !== "simple" ||
			up.value !== 21 ||
			uv?.kind !== "simple" ||
			(uv.value !== 20 && uv.value !== 21)
		)
			throw failure("invalid-input");
		const requiredUV = uv.value === 21;
		const listed = field(snapshot, 3n);
		const allowed: Uint8Array[] = [];
		if (listed !== undefined) {
			if (listed.kind !== "array") throw failure("invalid-input");
			for (const descriptor of listed.items) {
				const identifier = field(descriptor, "id");
				if (identifier?.kind !== "bytes") throw failure("invalid-input");
				allowed.push(identifier.value);
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
		rpHash = new Uint8Array(
			await bounded(
				crypto.subtle.digest("SHA-256", new TextEncoder().encode(rp.value)),
			),
		);
		check();
		let responseBytes = 0;
		let lastReplyAt = Number.NEGATIVE_INFINITY;
		await exclusive.call(connection, async (exchange) => {
			const receive = async (
				payload: Uint8Array,
				continuation: boolean,
			): Promise<CtapAssertionResponse> => {
				check();
				if (continuation && performance.now() - lastReplyAt > 30_000)
					throw failure("timeout");
				let delivered: FidoHidCborResult | undefined;
				let abandoned = false;
				const operation = exchange(payload, {
					signal: controller.signal,
					timeoutMs: Math.min(
						Math.ceil(deadline - performance.now()),
						continuation ? 30_000 : 120_000,
					),
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
					lastReplyAt = performance.now();
					responseBytes += response.payload.length;
					if (responseBytes > maxResponseBytes) throw failure("resource-limit");
					const result = decodeCtapGetAssertionResponse(response.payload);
					if (result.kind === "ctap-error") {
						check();
						terminal = result;
						throw failure("unsupported");
					}
					const assertion = result.assertion;
					responses.push(assertion);
					check();
					if (
						!rpHash ||
						!same(assertion.authenticatorData.subarray(0, 32), rpHash) ||
						(assertion.authenticatorData[32] & 1) === 0 ||
						(requiredUV && (assertion.authenticatorData[32] & 4) === 0)
					)
						throw failure("policy-denied");
					if (assertion.credentialId === undefined) {
						if (allowed.length !== 1) throw failure("invalid-input");
						assertion.credentialId = new Uint8Array(allowed[0]);
					}
					if (
						allowed.length &&
						!allowed.some((identifier) =>
							same(identifier, assertion.credentialId as Uint8Array),
						)
					)
						throw failure("policy-denied");
					if (!allowed.length && !assertion.user)
						throw failure("invalid-input");
					if (continuation && assertion.numberOfCredentials !== undefined)
						throw failure("invalid-input");
					for (let index = 0; index < responses.length - 1; index++) {
						const previous = responses[index].credentialId;
						if (previous && same(previous, assertion.credentialId))
							throw failure("invalid-input");
					}
					return assertion;
				} finally {
					wipeBytes(response.payload);
				}
			};
			if (!encoded) throw failure("invalid-input");
			const first = await receive(encoded, false);
			const count = first.numberOfCredentials ?? 1n;
			if (count > BigInt(maxCredentials)) throw failure("resource-limit");
			if (allowed.length && count !== 1n) throw failure("invalid-input");
			if (count > 1n && !selector) throw failure("unsupported");
			for (let index = 1; index < Number(count); index++) {
				const next = new Uint8Array([8]);
				try {
					await receive(next, true);
				} finally {
					wipeBytes(next);
				}
			}
			let index = 0;
			if (responses.length > 1) {
				if (!selector) throw failure("unsupported");
				const candidates = responses.map(
					(assertion, position): CtapAssertionCandidate => {
						if (!assertion.user) throw failure("invalid-input");
						const userId = new Uint8Array(assertion.user.id);
						selectionBuffers.push(userId);
						return Object.freeze({
							index: position,
							userId,
							...(assertion.user.name === undefined
								? {}
								: { name: assertion.user.name }),
							...(assertion.user.displayName === undefined
								? {}
								: { displayName: assertion.user.displayName }),
						});
					},
				);
				check();
				index = await bounded(
					Promise.resolve(
						selector(Object.freeze(candidates), controller.signal),
					),
				);
				if (
					!Number.isSafeInteger(index) ||
					index < 0 ||
					index >= responses.length
				)
					throw failure("invalid-input");
			}
			check();
			const assertion = responses[index];
			if (!assertion.credentialId) throw failure("invalid-input");
			selected = {
				credentialId: new Uint8Array(assertion.credentialId),
				authenticatorData: new Uint8Array(assertion.authenticatorData),
				signature: new Uint8Array(assertion.signature),
				userHandle: assertion.user ? new Uint8Array(assertion.user.id) : null,
				userPresent: (assertion.authenticatorData[32] & 1) !== 0,
				userVerified: (assertion.authenticatorData[32] & 4) !== 0,
			};
			check();
			committed = true;
			disarm();
		});
		if (!selected) throw failure("invalid-input");
		transferred = true;
		return { kind: "assertion", assertion: selected };
	} catch (error) {
		if (stopReason) throw stopReason;
		if (terminal) return terminal;
		throw sanitized(error);
	} finally {
		disarm();
		wipeBytes(encoded);
		if (snapshot) wipeCbor(snapshot);
		wipeBytes(rpHash);
		for (const assertion of responses) wipeAssertion(assertion);
		for (const bytes of selectionBuffers) wipeBytes(bytes);
		if (!transferred && selected) {
			wipeBytes(selected.credentialId);
			wipeBytes(selected.authenticatorData);
			wipeBytes(selected.signature);
			wipeBytes(selected.userHandle);
		}
	}
}
