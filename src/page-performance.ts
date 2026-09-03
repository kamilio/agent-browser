import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export const pageClockPrecisionMs = 0.1;

export interface PageClockSource {
	readonly timeOrigin: number;
	now(): number;
}

function coarsen(value: number) {
	const result = Math.floor(value * 10) / 10;
	if (!Number.isFinite(value) || !Number.isFinite(result))
		throw new AgentBrowserError("invalid-input", "Invalid page clock reading");
	return result;
}

export class PageClock {
	private readonly started: number;
	private readonly origin: number;
	private last = 0;
	private reads = 0;
	private closed = false;

	constructor(
		private readonly source: PageClockSource = globalThis.performance,
	) {
		if (
			!source ||
			typeof source.now !== "function" ||
			!Number.isFinite(source.timeOrigin)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"A monotonic page clock is required",
			);
		this.started = source.now();
		if (!Number.isFinite(this.started))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page clock reading",
			);
		this.origin = coarsen(source.timeOrigin + this.started);
	}

	get timeOrigin() {
		this.ensureOpen();
		return this.origin;
	}
	now() {
		this.ensureOpen();
		const reading = this.source.now();
		if (!Number.isFinite(reading))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page clock reading",
			);
		const elapsed = coarsen(reading - this.started);
		this.last = Math.max(this.last, elapsed, 0);
		this.reads++;
		return this.last;
	}
	metrics() {
		return Object.freeze({
			partial: true,
			precisionMs: pageClockPrecisionMs,
			reads: this.reads,
			lastTimestamp: this.last,
			closed: this.closed,
		});
	}
	close() {
		this.closed = true;
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page clock is closed");
	}
}

export function createPagePerformance(
	factory: ScriptHostObjectFactory,
	clock: PageClock,
): object {
	return factory.createHostObject({
		properties: { timeOrigin: { get: () => clock.timeOrigin } },
		methods: {
			now: () => clock.now(),
			toJSON: () => ({ timeOrigin: clock.timeOrigin }),
		},
	});
}
