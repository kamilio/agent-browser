import { AgentBrowserError } from "./errors.js";

interface PendingRequest {
	readonly signal?: AbortSignal;
	readonly resolve: (release: () => void) => void;
	readonly reject: (error: AgentBrowserError) => void;
	readonly abort: () => void;
}

export const networkRequestQueueLimits = Object.freeze({
	maxConcurrent: 128,
	maxPending: 128,
});

function aborted(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Queued network request aborted");
}

export class NetworkRequestQueue {
	private readonly pending = new Set<PendingRequest>();
	private active = 0;
	private closed = false;

	constructor(private readonly maxConcurrent: number) {
		if (
			!Number.isSafeInteger(maxConcurrent) ||
			maxConcurrent < 1 ||
			maxConcurrent > networkRequestQueueLimits.maxConcurrent
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid transport concurrency capacity",
			);
	}

	acquire(signal?: AbortSignal): Promise<() => void> {
		if (this.closed)
			return Promise.reject(
				new AgentBrowserError("closed", "Network request queue is closed"),
			);
		if (signal?.aborted) return Promise.reject(aborted(signal));
		if (this.active < this.maxConcurrent) {
			this.active++;
			return Promise.resolve(this.releaseSlot());
		}
		if (this.pending.size >= networkRequestQueueLimits.maxPending)
			return Promise.reject(
				new AgentBrowserError(
					"resource-limit",
					"Pending network request limit exceeded",
				),
			);
		return new Promise((resolve, reject) => {
			const request: PendingRequest = {
				signal,
				resolve,
				reject,
				abort: () => {
					if (!this.pending.delete(request)) return;
					signal?.removeEventListener("abort", request.abort);
					reject(aborted(signal as AbortSignal));
				},
			};
			this.pending.add(request);
			signal?.addEventListener("abort", request.abort, { once: true });
			if (signal?.aborted) request.abort();
		});
	}

	metrics() {
		return Object.freeze({
			active: this.active,
			pending: this.pending.size,
			maxConcurrent: this.maxConcurrent,
			maxPending: networkRequestQueueLimits.maxPending,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const request of this.pending) {
			request.signal?.removeEventListener("abort", request.abort);
			request.reject(
				new AgentBrowserError("closed", "Network request queue is closed"),
			);
		}
		this.pending.clear();
	}

	private releaseSlot() {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.active--;
			while (
				!this.closed &&
				this.active < this.maxConcurrent &&
				this.pending.size > 0
			) {
				const request = this.pending.values().next().value as PendingRequest;
				this.pending.delete(request);
				request.signal?.removeEventListener("abort", request.abort);
				if (request.signal?.aborted) {
					request.reject(aborted(request.signal));
					continue;
				}
				this.active++;
				request.resolve(this.releaseSlot());
			}
		};
	}
}
