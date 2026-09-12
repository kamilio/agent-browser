import { AgentBrowserError } from "./errors.js";

interface PendingRequest {
	readonly signal: AbortSignal;
	readonly start: () => void;
	readonly reject: (error: unknown) => void;
	readonly abort: () => void;
}

interface OriginQueue {
	nextStart: number;
	active: boolean;
	readonly pending: PendingRequest[];
	timer?: ReturnType<typeof setTimeout>;
}

function aborted(signal: AbortSignal): AgentBrowserError {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Request aborted");
}

export class OriginRequestPacer {
	private readonly origins = new Map<string, OriginQueue>();
	private pending = 0;
	private closed = false;

	constructor(private readonly intervalMs: number) {
		if (
			!Number.isSafeInteger(intervalMs) ||
			intervalMs < 1 ||
			intervalMs > 60_000
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid request pacing interval",
			);
	}

	wait(origin: string, signal: AbortSignal): Promise<void> {
		return this.dispatch(origin, signal, () => undefined);
	}

	dispatch<Result>(
		origin: string,
		signal: AbortSignal,
		start: () => Result | PromiseLike<Result>,
	): Promise<Result> {
		if (this.closed)
			return Promise.reject(
				new AgentBrowserError("closed", "Request pacing is closed"),
			);
		if (signal.aborted) return Promise.reject(aborted(signal));
		const now = performance.now();
		for (const [name, queue] of this.origins) {
			if (
				!queue.active &&
				queue.pending.length === 0 &&
				queue.timer === undefined &&
				queue.nextStart <= now
			)
				this.origins.delete(name);
		}
		let queue = this.origins.get(origin);
		if (!queue) {
			if (this.origins.size >= 256)
				return Promise.reject(
					new AgentBrowserError(
						"resource-limit",
						"Request pacing origin limit exceeded",
					),
				);
			queue = { nextStart: now, active: false, pending: [] };
			this.origins.set(origin, queue);
		}
		const immediate =
			!queue.active && queue.pending.length === 0 && queue.nextStart <= now;
		if (!immediate && this.pending >= 128)
			return Promise.reject(
				new AgentBrowserError(
					"resource-limit",
					"Request pacing queue limit exceeded",
				),
			);
		const selected = queue;
		return new Promise<Result>((resolve, reject) => {
			const invoke = () => resolve(start());
			if (immediate) {
				this.grant(selected, invoke, reject);
				return;
			}
			const request: PendingRequest = {
				signal,
				start: invoke,
				reject,
				abort: () => {
					const index = selected.pending.indexOf(request);
					if (index < 0) return;
					selected.pending.splice(index, 1);
					this.pending--;
					signal.removeEventListener("abort", request.abort);
					reject(aborted(signal));
					this.pump(selected);
				},
			};
			selected.pending.push(request);
			this.pending++;
			signal.addEventListener("abort", request.abort, { once: true });
			if (signal.aborted) request.abort();
			else this.pump(selected);
		});
	}

	close(): void {
		this.closed = true;
		for (const queue of this.origins.values()) {
			if (queue.timer !== undefined) clearTimeout(queue.timer);
			queue.timer = undefined;
			for (const request of queue.pending) {
				request.signal.removeEventListener("abort", request.abort);
				request.reject(
					new AgentBrowserError("closed", "Request pacing is closed"),
				);
			}
			queue.pending.length = 0;
		}
		this.origins.clear();
		this.pending = 0;
	}

	private grant(
		queue: OriginQueue,
		start: () => void,
		reject: (error: unknown) => void,
	): void {
		queue.active = true;
		try {
			start();
		} catch (error) {
			reject(error);
		} finally {
			queue.nextStart = performance.now() + this.intervalMs;
			queue.active = false;
			this.pump(queue);
		}
	}

	private pump(queue: OriginQueue): void {
		if (this.closed || queue.active) return;
		if (queue.timer !== undefined) {
			clearTimeout(queue.timer);
			queue.timer = undefined;
		}
		if (queue.pending.length === 0) return;
		const remaining = queue.nextStart - performance.now();
		if (remaining > 0) {
			queue.timer = setTimeout(() => {
				queue.timer = undefined;
				this.pump(queue);
			}, Math.ceil(remaining));
			return;
		}
		const request = queue.pending.shift();
		if (!request) return;
		this.pending--;
		request.signal.removeEventListener("abort", request.abort);
		this.grant(queue, request.start, request.reject);
	}
}
