import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { traceArtifactLimits, type TraceDetails } from "./capture-artifacts.js";
import { diagnosticUrl } from "./network-journal.js";
import type { BrowserSession } from "./session.js";

export const sessionTraceLimits = Object.freeze({
	...traceArtifactLimits,
	maxSnapshotBytes: 32_768,
	maxSnapshotEntries: 256,
	maxSnapshotString: 256,
	maxRequestsPerFrame: 64,
});
export const sessionTraceCapabilities = Object.freeze({
	partial: true,
	profile: "semantic-action-timeline",
	format: "agent-browser-trace-v1",
	activeTabSnapshots: true,
	containsPageText: true,
	commandArguments: false,
	controlValues: false,
	requestBodies: false,
	continuousRecording: false,
	...sessionTraceLimits,
});
export type TraceOutcome = "returned" | "threw" | "interrupted";

function errorCode(error: unknown): ErrorCode | "unavailable" {
	return error instanceof AgentBrowserError ? error.code : "unavailable";
}

export class SessionTrace {
	private readonly startedAt = new Date().toISOString();
	private readonly start = performance.now();
	private readonly frames: string[] = [];
	private retainedBytes = 0;
	private droppedFrames = 0;
	private stopped = false;
	private full = false;
	private closed = false;
	private sealed?: { bytes: Uint8Array; details: TraceDetails };
	private readonly limits;

	constructor(
		private readonly browser: BrowserSession,
		limits: Partial<{ maxFrames: number; maxBytes: number }> = {},
	) {
		if (
			!limits ||
			typeof limits !== "object" ||
			Array.isArray(limits) ||
			Object.keys(limits).some(
				(name) => name !== "maxFrames" && name !== "maxBytes",
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid trace limit");
		this.limits = {
			...sessionTraceLimits,
			maxFrames:
				limits.maxFrames === undefined
					? sessionTraceLimits.maxFrames
					: limits.maxFrames,
			maxBytes:
				limits.maxBytes === undefined
					? sessionTraceLimits.maxBytes
					: limits.maxBytes,
		};
		for (const name of ["maxFrames", "maxBytes"] as const) {
			const value = this.limits[name];
			if (
				!Number.isSafeInteger(value) ||
				value < (name === "maxBytes" ? 4096 : 1) ||
				value > sessionTraceLimits[name]
			)
				throw new AgentBrowserError("invalid-input", "Invalid trace limit");
		}
		this.record("tracing-start");
	}

	status() {
		return Object.freeze({
			recording: !this.stopped && !this.closed,
			frames: this.sealed?.details.frames ?? this.frames.length,
			droppedFrames: this.droppedFrames,
			truncated: this.droppedFrames > 0,
			retainedBytes: this.sealed?.bytes.length ?? this.retainedBytes,
			closed: this.closed,
			limits: Object.freeze({ ...this.limits }),
		});
	}

	record(
		command: string,
		durationMs = 0,
		outcome: TraceOutcome = "returned",
		error?: unknown,
	) {
		if (this.closed || this.stopped) return;
		if (
			!/^[a-z][a-z0-9-]{0,63}$/.test(command) ||
			!Number.isFinite(durationMs) ||
			durationMs < 0 ||
			!["returned", "threw", "interrupted"].includes(outcome)
		)
			throw new AgentBrowserError("invalid-input", "Invalid trace action");
		if (
			this.full ||
			this.frames.length >= this.limits.maxFrames ||
			this.retainedBytes >= this.limits.maxBytes - 2048
		) {
			this.droppedFrames++;
			return;
		}
		const frame: Record<string, unknown> = {
			sequence: this.frames.length + this.droppedFrames,
			atMs: Math.max(0, performance.now() - this.start),
			action: {
				command,
				durationMs,
				outcome,
				...(outcome === "returned" ? {} : { error: errorCode(error) }),
			},
		};
		try {
			const tabs = this.browser.tabs();
			frame.tabs = tabs.map((tab) => ({
				id: tab.id,
				selected: tab.selected,
				loading: tab.loading,
				documentRef: tab.documentRef,
				url: tab.url === null ? null : diagnosticUrl(tab.url),
			}));
			const active = tabs.find((tab) => tab.selected);
			frame.activeTab = active?.id ?? null;
			if (active) {
				try {
					const snapshot = this.browser.snapshot(active.id, {
						maxBytes: this.limits.maxSnapshotBytes,
						maxEntries: this.limits.maxSnapshotEntries,
						maxStringLength: this.limits.maxSnapshotString,
					});
					frame.snapshot = {
						...snapshot,
						entries: snapshot.entries.map(
							({ value: _value, href, ...entry }) => ({
								...entry,
								...(href === undefined ? {} : { href: diagnosticUrl(href) }),
							}),
						),
					};
				} catch (error) {
					frame.snapshotError = errorCode(error);
				}
				try {
					const journal = this.browser.requests(active.id);
					frame.network = {
						navigation: journal.navigation,
						document: journal.document,
						displayedDocument: journal.displayedDocument,
						scope: journal.scope,
						dropped:
							journal.dropped +
							Math.max(
								0,
								journal.entries.length - this.limits.maxRequestsPerFrame,
							),
						entries: journal.entries
							.slice(0, this.limits.maxRequestsPerFrame)
							.map((entry) => ({
								index: entry.index,
								kind: entry.kind,
								method: entry.method,
								url: diagnosticUrl(entry.url),
								state: entry.state,
								status: entry.status,
								error: entry.error,
								elapsedMs: entry.elapsedMs,
								encodedBytes: entry.encodedBytes,
								decodedBytes: entry.decodedBytes,
								finalUrl:
									entry.finalUrl === undefined
										? undefined
										: diagnosticUrl(entry.finalUrl),
								redirectCount: entry.redirectCount,
								cors: entry.cors,
								routeId: entry.routeId,
							})),
					};
				} catch (error) {
					frame.networkError = errorCode(error);
				}
			}
		} catch (error) {
			frame.sessionError = errorCode(error);
		}
		let serialized: string;
		let size: number;
		try {
			serialized = JSON.stringify(frame);
			size = new TextEncoder().encode(serialized).length + 1;
		} catch {
			this.droppedFrames++;
			return;
		}
		if (this.retainedBytes + size > this.limits.maxBytes - 2048) {
			this.full = true;
			this.droppedFrames++;
			return;
		}
		this.frames.push(serialized);
		this.retainedBytes += size;
	}

	finish() {
		if (this.closed) throw new AgentBrowserError("closed", "Trace is closed");
		if (!this.sealed) {
			this.record("tracing-stop");
			this.stopped = true;
			const details: TraceDetails = {
				mediaType: "application/json",
				partial: true,
				profile: "semantic-action-timeline",
				frames: this.frames.length,
				droppedFrames: this.droppedFrames,
				truncated: this.droppedFrames > 0,
			};
			const header = JSON.stringify({
				format: "agent-browser-trace-v1",
				schemaVersion: 1,
				partial: true,
				startedAt: this.startedAt,
				endedAt: new Date().toISOString(),
				droppedFrames: this.droppedFrames,
				truncated: this.droppedFrames > 0,
				limits: this.limits,
				privacy: {
					containsPageText: true,
					arguments: "omitted",
					controlValues: "omitted",
					urlQueries: "redacted",
					bodiesAndHeaders: "omitted",
				},
			});
			const bytes = new TextEncoder().encode(
				`${header.slice(0, -1)},"frames":[${this.frames.join(",")}]}`,
			);
			if (bytes.length > this.limits.maxBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Trace export limit exceeded",
				);
			this.sealed = { bytes, details };
			this.frames.length = 0;
			this.retainedBytes = 0;
		}
		return {
			bytes: this.sealed.bytes.slice(),
			details: { ...this.sealed.details },
		};
	}

	close() {
		this.closed = true;
		this.stopped = true;
		this.frames.length = 0;
		this.retainedBytes = 0;
		this.sealed = undefined;
	}
}
