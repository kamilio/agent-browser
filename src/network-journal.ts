import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { NetworkResponse } from "./network.js";

export type NetworkRequestKind =
	| "document"
	| "script"
	| "stylesheet"
	| "fetch"
	| "preflight";

export type NetworkCorsResult = "allowed" | "blocked" | "not-checked";
export type ObserveCorsResult = (
	report: (result: NetworkCorsResult) => void,
) => void;

export interface NetworkJournalEntry {
	readonly index: number;
	readonly kind: NetworkRequestKind;
	readonly method: string;
	readonly url: string;
	readonly state: "pending" | "complete" | "failed" | "blocked";
	readonly cors?: "pending" | NetworkCorsResult;
	readonly routeId?: number;
	readonly elapsedMs: number;
	readonly finalUrl?: string;
	readonly status?: number;
	readonly encodedBytes?: number;
	readonly decodedBytes?: number;
	readonly redirectCount?: number;
	readonly redirectsTruncated?: boolean;
	readonly redirects?: readonly {
		url: string;
		status: number;
		location: string;
	}[];
	readonly error?: ErrorCode;
}

export interface NetworkJournalSnapshot {
	readonly entries: readonly NetworkJournalEntry[];
	readonly dropped: number;
	readonly retainedBytes: number;
	readonly maxBytes: number;
	readonly maxEntries: number;
	readonly closed: boolean;
	readonly partial: true;
}

const errorCodes = new Set<ErrorCode>([
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
]);
const encoder = new TextEncoder();

export function diagnosticUrl(input: string, base?: string): string {
	try {
		if (input.length > 65_536 || (base?.length ?? 0) > 65_536)
			return "[unavailable]";
		const url = new URL(input, base);
		if (url.protocol !== "https:" && url.protocol !== "http:")
			return "[unavailable]";
		url.username = "";
		url.password = "";
		url.hash = "";
		if (url.search) url.search = "?redacted";
		return url.href.length > 2048
			? `${url.href.slice(0, 2034)}...[truncated]`
			: url.href;
	} catch {
		return "[unavailable]";
	}
}

function copy(entry: NetworkJournalEntry): NetworkJournalEntry {
	return {
		...entry,
		...(entry.redirects
			? { redirects: entry.redirects.map((redirect) => ({ ...redirect })) }
			: {}),
	};
}

export class NetworkJournal {
	private readonly entries = new Map<
		number,
		{ entry: NetworkJournalEntry; bytes: number }
	>();
	private readonly maxEntries: number;
	private readonly maxBytes: number;
	private readonly now: () => number;
	private retainedBytes = 0;
	private dropped = 0;
	private nextIndex = 0;
	private closed = false;

	constructor(
		options: {
			maxEntries?: number;
			maxBytes?: number;
			now?: () => number;
		} = {},
	) {
		this.maxEntries = options.maxEntries ?? 128;
		this.maxBytes = options.maxBytes ?? 262_144;
		this.now = options.now ?? Date.now;
		if (
			!Number.isSafeInteger(this.maxEntries) ||
			this.maxEntries < 1 ||
			this.maxEntries > 128 ||
			!Number.isSafeInteger(this.maxBytes) ||
			this.maxBytes < 256 ||
			this.maxBytes > 262_144
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid network journal limits",
			);
	}

	async run(
		kind: NetworkRequestKind,
		url: string,
		method: string,
		operation: () => Promise<NetworkResponse>,
		observeCorsResult?: ObserveCorsResult,
	): Promise<NetworkResponse> {
		if (this.closed) return operation();
		const index = this.nextIndex++;
		const started = this.now();
		const entry: NetworkJournalEntry = {
			index,
			kind,
			url: diagnosticUrl(url),
			method: /^[A-Za-z]{1,32}$/.test(method)
				? method.toUpperCase()
				: "[unavailable]",
			state: "pending",
			...(observeCorsResult ? { cors: "pending" as const } : {}),
			elapsedMs: 0,
		};
		this.retain(entry);
		let cors: NetworkJournalEntry["cors"] = entry.cors;
		const reportCors = (result: NetworkCorsResult) => {
			if (
				cors !== "pending" ||
				!["allowed", "blocked", "not-checked"].includes(result)
			)
				return;
			cors = result;
			const retained = this.entries.get(index);
			if (retained) this.retain({ ...retained.entry, cors });
		};
		try {
			observeCorsResult?.(reportCors);
		} catch {
			reportCors("not-checked");
		}
		try {
			const response = await operation();
			if (this.entries.has(index))
				this.retain({
					...entry,
					...(cors ? { cors } : {}),
					state: "complete",
					elapsedMs: Math.max(0, this.now() - started),
					finalUrl: diagnosticUrl(response.url),
					status: response.status,
					...(Number.isSafeInteger(response.routeId) &&
					(response.routeId ?? 0) > 0
						? { routeId: response.routeId }
						: {}),
					encodedBytes: response.encodedBytes,
					decodedBytes: response.body.byteLength,
					redirectCount: response.redirects.length,
					redirectsTruncated: response.redirects.length > 8,
					redirects: response.redirects.slice(0, 8).map((redirect) => ({
						url: diagnosticUrl(redirect.url),
						status: redirect.status,
						location: diagnosticUrl(redirect.location, redirect.url),
					})),
				});
			return response;
		} catch (error) {
			reportCors("not-checked");
			const code =
				error instanceof AgentBrowserError && errorCodes.has(error.code)
					? error.code
					: "network-error";
			if (this.entries.has(index))
				this.retain({
					...entry,
					...(cors ? { cors } : {}),
					state: code === "policy-denied" ? "blocked" : "failed",
					elapsedMs: Math.max(0, this.now() - started),
					error: code,
				});
			throw error;
		}
	}

	snapshot(): NetworkJournalSnapshot {
		return {
			partial: true,
			entries: Array.from(this.entries.values(), ({ entry }) => copy(entry)),
			dropped: this.dropped,
			retainedBytes: this.retainedBytes,
			maxBytes: this.maxBytes,
			maxEntries: this.maxEntries,
			closed: this.closed,
		};
	}

	detail(index: number): NetworkJournalEntry {
		if (!Number.isSafeInteger(index) || index < 0)
			throw new AgentBrowserError("invalid-input", "Invalid request index");
		const record = this.entries.get(index);
		if (!record)
			throw new AgentBrowserError(
				"not-found",
				"Request is not retained in this navigation journal",
			);
		return copy(record.entry);
	}

	close() {
		this.closed = true;
		this.entries.clear();
		this.retainedBytes = 0;
	}

	private retain(entry: NetworkJournalEntry) {
		if (this.closed) return;
		this.retainedBytes -= this.entries.get(entry.index)?.bytes ?? 0;
		const bytes = encoder.encode(JSON.stringify(entry)).byteLength;
		this.entries.set(entry.index, { entry, bytes });
		this.retainedBytes += bytes;
		while (
			this.entries.size > this.maxEntries ||
			this.retainedBytes > this.maxBytes
		) {
			const oldest = this.entries.entries().next().value;
			if (!oldest) break;
			this.entries.delete(oldest[0]);
			this.retainedBytes -= oldest[1].bytes;
			this.dropped++;
		}
	}
}
