import { AgentBrowserError } from "./errors.js";

declare const leaseIdentity: unique symbol;

export interface ResponseAccountingLease {
	readonly [leaseIdentity]: true;
}

export interface ResponseAccountingWriter {
	debit(kind: "encodedBytes" | "decodedBytes", bytes: number): boolean;
	remainingBytes(): number;
	finish(): void;
}

export interface ResponseAccountingMetrics {
	readonly observedEncodedBytes: number;
	readonly observedDecodedBytes: number;
	readonly completedOnlyBytes: number;
	readonly nativeRequests: number;
	readonly completedOnlyRequests: number;
	readonly unmeteredFailures: number;
	readonly outstanding: number;
	readonly draining: number;
	readonly closed: boolean;
	readonly overflowed: boolean;
	readonly maxTotalBytes: number;
	readonly maxOutstanding: number;
}

interface Counters {
	observedEncodedBytes: number;
	observedDecodedBytes: number;
	completedOnlyBytes: number;
	nativeRequests: number;
	completedOnlyRequests: number;
	unmeteredFailures: number;
}

interface AccountingState {
	readonly maxTotalBytes: number;
	readonly maxOutstanding: number;
	readonly counters: Counters;
	readonly outstanding: Set<LeaseState>;
	closed: boolean;
	overflowed: boolean;
	encodedOverflowed: boolean;
	decodedOverflowed: boolean;
}

interface LeaseState {
	readonly owner: AccountingState;
	claimed: boolean;
	settled: boolean;
	abandoned: boolean;
	finished: boolean;
	unmeteredFailure: boolean;
	decodedBytes: number;
}

const leases = new WeakMap<object, LeaseState>();

function integer(value: number, minimum: number) {
	if (!Number.isSafeInteger(value) || value < minimum)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid response accounting value",
		);
}

function invalidLease(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid response accounting lease",
	);
}

function leaseState(lease: unknown): LeaseState {
	if (!lease || typeof lease !== "object") return invalidLease();
	return leases.get(lease) ?? invalidLease();
}

function remaining(state: AccountingState): number {
	const encoded = Math.max(
		0,
		state.maxTotalBytes - state.counters.observedEncodedBytes,
	);
	const decoded = Math.max(
		0,
		state.maxTotalBytes - state.counters.observedDecodedBytes,
	);
	return Math.min(
		encoded,
		Math.max(0, decoded - state.counters.completedOnlyBytes),
	);
}

function admission(state: AccountingState) {
	if (state.closed)
		throw new AgentBrowserError("closed", "Response byte accounting is closed");
	if (state.overflowed || remaining(state) === 0)
		throw new AgentBrowserError(
			"resource-limit",
			"Fetch response body limit exceeded",
		);
}

function fresh(lease: LeaseState) {
	if (lease.claimed || lease.settled || lease.abandoned) invalidLease();
	admission(lease.owner);
}

function add(
	state: AccountingState,
	counter: keyof Counters,
	bytes: number,
): boolean {
	if (bytes > Number.MAX_SAFE_INTEGER - state.counters[counter]) {
		state.counters[counter] = Number.MAX_SAFE_INTEGER;
		state.overflowed = true;
		return false;
	}
	state.counters[counter] += bytes;
	return true;
}

function decodedAllowed(state: AccountingState): boolean {
	const { observedDecodedBytes, completedOnlyBytes } = state.counters;
	if (completedOnlyBytes > Number.MAX_SAFE_INTEGER - observedDecodedBytes) {
		state.decodedOverflowed = true;
		state.overflowed = true;
	}
	return (
		!state.decodedOverflowed &&
		observedDecodedBytes <= state.maxTotalBytes &&
		completedOnlyBytes <= state.maxTotalBytes - observedDecodedBytes
	);
}

function unmeteredFailure(lease: LeaseState) {
	if (lease.unmeteredFailure) return;
	lease.unmeteredFailure = true;
	add(lease.owner, "unmeteredFailures", 1);
}

function abandon(lease: LeaseState) {
	if (lease.abandoned) return;
	lease.abandoned = true;
	if (!lease.claimed) {
		if (!lease.settled) unmeteredFailure(lease);
		lease.owner.outstanding.delete(lease);
	}
}

export function validateResponseAccountingLease(lease: unknown): void {
	fresh(leaseState(lease));
}

export function claimResponseAccounting(
	lease: unknown,
): ResponseAccountingWriter {
	const current = leaseState(lease);
	fresh(current);
	current.claimed = true;
	const state = current.owner;
	add(state, "nativeRequests", 1);
	return Object.freeze({
		debit(kind: "encodedBytes" | "decodedBytes", bytes: number): boolean {
			if (kind !== "encodedBytes" && kind !== "decodedBytes")
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid response accounting byte kind",
				);
			integer(bytes, 0);
			if (current.finished)
				throw new AgentBrowserError(
					"closed",
					"Response accounting writer is finished",
				);
			let allowed: boolean;
			if (kind === "encodedBytes") {
				if (!add(state, "observedEncodedBytes", bytes))
					state.encodedOverflowed = true;
				allowed =
					!state.encodedOverflowed &&
					state.counters.observedEncodedBytes <= state.maxTotalBytes;
			} else {
				current.decodedBytes =
					bytes > Number.MAX_SAFE_INTEGER - current.decodedBytes
						? Number.MAX_SAFE_INTEGER
						: current.decodedBytes + bytes;
				if (!add(state, "observedDecodedBytes", bytes))
					state.decodedOverflowed = true;
				allowed = decodedAllowed(state);
			}
			return allowed && !state.closed;
		},
		remainingBytes(): number {
			return remaining(state);
		},
		finish(): void {
			if (current.finished) return;
			current.finished = true;
			state.outstanding.delete(current);
		},
	});
}

export class ResponseByteAccounting {
	readonly #state: AccountingState;

	constructor(maxTotalBytes: number, maxOutstanding: number) {
		integer(maxTotalBytes, 1);
		integer(maxOutstanding, 1);
		this.#state = {
			maxTotalBytes,
			maxOutstanding,
			counters: {
				observedEncodedBytes: 0,
				observedDecodedBytes: 0,
				completedOnlyBytes: 0,
				nativeRequests: 0,
				completedOnlyRequests: 0,
				unmeteredFailures: 0,
			},
			outstanding: new Set(),
			closed: false,
			overflowed: false,
			encodedOverflowed: false,
			decodedOverflowed: false,
		};
	}

	createLease(): ResponseAccountingLease {
		const state = this.#state;
		admission(state);
		if (state.outstanding.size >= state.maxOutstanding)
			throw new AgentBrowserError(
				"resource-limit",
				"Response accounting operation limit exceeded",
			);
		const lease = Object.freeze({}) as ResponseAccountingLease;
		const current: LeaseState = {
			owner: state,
			claimed: false,
			settled: false,
			abandoned: false,
			finished: false,
			unmeteredFailure: false,
			decodedBytes: 0,
		};
		leases.set(lease, current);
		state.outstanding.add(current);
		return lease;
	}

	remainingBytes(): number {
		return remaining(this.#state);
	}

	settle(lease: ResponseAccountingLease, bodyBytes?: number): boolean {
		const current = leaseState(lease);
		if (current.owner !== this.#state || current.settled) invalidLease();
		if (bodyBytes !== undefined) integer(bodyBytes, 0);
		current.settled = true;
		if (!current.claimed) this.#state.outstanding.delete(current);
		if (bodyBytes === undefined) {
			if (!current.claimed) unmeteredFailure(current);
			return false;
		}
		const deficit = Math.max(0, bodyBytes - current.decodedBytes);
		if (!current.claimed || deficit > 0)
			add(this.#state, "completedOnlyRequests", 1);
		if (!add(this.#state, "completedOnlyBytes", deficit))
			this.#state.decodedOverflowed = true;
		const allowed = decodedAllowed(this.#state);
		return !this.#state.closed && (deficit === 0 || allowed);
	}

	abandon(lease: ResponseAccountingLease): void {
		const current = leaseState(lease);
		if (current.owner !== this.#state) invalidLease();
		abandon(current);
	}

	close(): void {
		if (this.#state.closed) return;
		this.#state.closed = true;
		for (const current of this.#state.outstanding) abandon(current);
	}

	metrics(): Readonly<ResponseAccountingMetrics> {
		let draining = 0;
		for (const current of this.#state.outstanding)
			if (current.claimed && (current.abandoned || current.settled)) draining++;
		return Object.freeze({
			...this.#state.counters,
			outstanding: this.#state.outstanding.size,
			draining,
			closed: this.#state.closed,
			overflowed: this.#state.overflowed,
			maxTotalBytes: this.#state.maxTotalBytes,
			maxOutstanding: this.#state.maxOutstanding,
		});
	}
}
