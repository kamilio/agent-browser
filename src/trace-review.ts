import { traceArtifactLimits } from "./capture-artifacts.js";
import { AgentBrowserError } from "./errors.js";

function invalid(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid or unsupported trace review data",
	);
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
	return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 256): string {
	if (typeof value !== "string" || value.length > maximum) invalid();
	return value;
}
function count(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > maximum
	)
		invalid();
	return value;
}
function elapsed(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		invalid();
	return value;
}
function flag(value: unknown): boolean {
	if (typeof value !== "boolean") invalid();
	return value;
}
function list(value: unknown, maximum: number): unknown[] {
	if (!Array.isArray(value) || value.length > maximum) invalid();
	return value;
}
function choice<const Values extends readonly string[]>(
	value: unknown,
	values: Values,
): Values[number] {
	if (typeof value !== "string" || !values.includes(value)) invalid();
	return value;
}
function reference(value: unknown) {
	const result = text(value, 128);
	if (!result) invalid();
	return result;
}
function nullableReference(value: unknown) {
	return value === null ? null : reference(value);
}
const errorCodes = [
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
	"unavailable",
] as const;
function snapshot(value: unknown) {
	const source = object(value);
	const refs = new Set<string>();
	const entries = list(source.entries, 256).map((value) => {
		const entry = object(value);
		const ref = reference(entry.ref);
		if (refs.has(ref)) invalid();
		refs.add(ref);
		const states: Record<string, boolean> = {};
		for (const name of [
			"checked",
			"indeterminate",
			"targeted",
			"focused",
			"selected",
			"disabled",
			"readonly",
			"required",
			"protected",
		])
			if (entry[name] !== undefined) states[name] = flag(entry[name]);
		return Object.freeze({
			ref,
			role: text(entry.role, 128),
			name: text(entry.name),
			depth: count(entry.depth, 1024),
			...(entry.level === undefined ? {} : { level: count(entry.level, 1024) }),
			...(entry.href === undefined ? {} : { href: text(entry.href, 2048) }),
			states: Object.freeze(states),
		});
	});
	return Object.freeze({
		document: reference(source.document),
		scope: reference(source.scope),
		revision: count(source.revision),
		truncated: flag(source.truncated),
		entries: Object.freeze(entries),
	});
}
function network(value: unknown) {
	const source = object(value);
	if (source.scope !== "latest-network-navigation") invalid();
	let previous = -1;
	const entries = list(source.entries, 64).map((value) => {
		const entry = object(value);
		const index = count(entry.index);
		if (index <= previous) invalid();
		previous = index;
		const optional: Record<string, string | number> = {};
		for (const name of [
			"encodedBytes",
			"decodedBytes",
			"redirectCount",
			"routeId",
		])
			if (entry[name] !== undefined) optional[name] = count(entry[name]);
		if (entry.status !== undefined) optional.status = count(entry.status, 999);
		if (entry.finalUrl !== undefined)
			optional.finalUrl = text(entry.finalUrl, 2048);
		if (entry.error !== undefined)
			optional.error = choice(entry.error, errorCodes);
		if (entry.cors !== undefined)
			optional.cors = choice(entry.cors, [
				"pending",
				"allowed",
				"blocked",
				"not-checked",
			]);
		return Object.freeze({
			index,
			kind: choice(entry.kind, [
				"document",
				"script",
				"stylesheet",
				"image",
				"fetch",
				"preflight",
			]),
			method: text(entry.method, 128),
			url: text(entry.url, 2048),
			state: choice(entry.state, ["pending", "complete", "failed", "blocked"]),
			elapsedMs: elapsed(entry.elapsedMs),
			...optional,
		});
	});
	return Object.freeze({
		navigation: count(source.navigation),
		document: nullableReference(source.document),
		displayedDocument: nullableReference(source.displayedDocument),
		dropped: count(source.dropped),
		entries: Object.freeze(entries),
	});
}
function frame(value: unknown) {
	const source = object(value);
	const action = object(source.action);
	const command = text(action.command, 64);
	if (!/^[a-z][a-z0-9-]{0,63}$/.test(command)) invalid();
	const outcome = choice(action.outcome, ["returned", "threw", "interrupted"]);
	const errors: Record<string, string> = {};
	for (const name of ["snapshotError", "networkError", "sessionError"])
		if (source[name] !== undefined)
			errors[name] = choice(source[name], errorCodes);
	if (
		(source.snapshot !== undefined && source.snapshotError !== undefined) ||
		(source.network !== undefined && source.networkError !== undefined)
	)
		invalid();
	const ids = new Set<string>();
	const tabs = list(
		source.tabs ?? (source.sessionError === undefined ? undefined : []),
		256,
	).map((value) => {
		const tab = object(value);
		const id = reference(tab.id);
		if (ids.has(id)) invalid();
		ids.add(id);
		return Object.freeze({
			id,
			selected: flag(tab.selected),
			loading: flag(tab.loading),
			documentRef: nullableReference(tab.documentRef),
			url: tab.url === null ? null : text(tab.url, 2048),
		});
	});
	const activeTab = nullableReference(source.activeTab ?? null);
	const selected = tabs.filter((tab) => tab.selected);
	if (
		selected.length > 1 ||
		(activeTab !== null ? selected[0]?.id !== activeTab : selected.length !== 0)
	)
		invalid();
	const result = {
		sequence: count(source.sequence),
		atMs: elapsed(source.atMs),
		action: Object.freeze({
			command,
			outcome,
			durationMs: elapsed(action.durationMs),
			...(action.error === undefined
				? {}
				: { error: choice(action.error, errorCodes) }),
		}),
		activeTab,
		tabs: Object.freeze(tabs),
		errors: Object.freeze(errors),
		...(source.snapshot === undefined
			? {}
			: { snapshot: snapshot(source.snapshot) }),
		...(source.network === undefined
			? {}
			: { network: network(source.network) }),
	};
	if (activeTab === null && (result.snapshot || result.network)) invalid();
	if (result.snapshot && result.snapshot.document !== selected[0]?.documentRef)
		invalid();
	return Object.freeze(result);
}

export type ReviewFrame = ReturnType<typeof frame>;
export type ReviewTrace = ReturnType<typeof parseTraceForReview>;

export function parseTraceForReview(bytes: Uint8Array) {
	if (
		!(bytes instanceof Uint8Array) ||
		bytes.length > traceArtifactLimits.maxBytes
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Trace file exceeds the 2 MiB review limit",
		);
	let decoded: unknown;
	try {
		decoded = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(bytes),
		);
	} catch {
		invalid();
	}
	const source = object(decoded);
	if (
		source.format !== "agent-browser-trace-v1" ||
		source.schemaVersion !== 1 ||
		source.partial !== true
	)
		invalid();
	const startedAt = text(source.startedAt, 32);
	const endedAt = text(source.endedAt, 32);
	for (const value of [startedAt, endedAt])
		if (
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
			!Number.isFinite(Date.parse(value)) ||
			new Date(value).toISOString() !== value
		)
			invalid();
	const droppedFrames = count(source.droppedFrames);
	const truncated = flag(source.truncated);
	if (truncated !== droppedFrames > 0) invalid();
	let sequence = -1;
	let atMs = 0;
	const frames = list(source.frames, traceArtifactLimits.maxFrames).map(
		(value) => {
			const result = frame(value);
			if (result.sequence <= sequence || result.atMs < atMs) invalid();
			sequence = result.sequence;
			atMs = result.atMs;
			return result;
		},
	);
	return Object.freeze({
		startedAt,
		endedAt,
		droppedFrames,
		truncated,
		frames: Object.freeze(frames),
	});
}

export async function readTraceFile(
	file: Pick<File, "size" | "stream">,
	signal: AbortSignal,
) {
	if (
		!Number.isSafeInteger(file.size) ||
		file.size < 1 ||
		file.size > traceArtifactLimits.maxBytes
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Choose a trace file up to 2 MiB",
		);
	if (signal.aborted)
		throw new AgentBrowserError("aborted", "Trace file read canceled");
	const reader = file.stream().getReader();
	const bytes = new Uint8Array(file.size);
	let offset = 0;
	let reads = 0;
	const abort = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		while (true) {
			if (signal.aborted)
				throw new AgentBrowserError("aborted", "Trace file read canceled");
			const chunk = await reader.read();
			if (signal.aborted)
				throw new AgentBrowserError("aborted", "Trace file read canceled");
			if (chunk.done) break;
			if (
				++reads > 4096 ||
				!(chunk.value instanceof Uint8Array) ||
				offset + chunk.value.length > bytes.length
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Trace file stream exceeds its declared bounds",
				);
			bytes.set(chunk.value, offset);
			offset += chunk.value.length;
		}
		if (offset !== bytes.length) invalid();
		return parseTraceForReview(bytes);
	} finally {
		signal.removeEventListener("abort", abort);
		void reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

export function describeTraceFrame(frame: ReviewFrame) {
	const snapshotText = frame.snapshot
		? [
				`${frame.snapshot.document} · revision ${frame.snapshot.revision}${frame.snapshot.truncated ? " · snapshot truncated" : ""}`,
				...frame.snapshot.entries.map(
					(entry) =>
						`${"  ".repeat(Math.min(entry.depth, 24))}${entry.depth > 24 ? "… " : ""}${entry.ref} ${entry.role} ${JSON.stringify(entry.name)} ${JSON.stringify(entry.states)}${entry.href === undefined ? "" : ` href=${JSON.stringify(entry.href)}`}`,
				),
			].join("\n")
		: `Snapshot unavailable${frame.errors.snapshotError ? `: ${frame.errors.snapshotError}` : " (not recorded)"}`;
	const networkText = frame.network
		? `Navigation ${frame.network.navigation} · omitted requests ${frame.network.dropped}\n${frame.network.entries.map((entry) => JSON.stringify(entry)).join("\n")}`
		: `Network unavailable${frame.errors.networkError ? `: ${frame.errors.networkError}` : " (not recorded)"}`;
	return {
		snapshotText,
		networkText,
		metadataText: JSON.stringify(
			{
				sequence: frame.sequence,
				atMs: frame.atMs,
				action: frame.action,
				activeTab: frame.activeTab,
				tabs: frame.tabs,
				errors: frame.errors,
			},
			null,
			2,
		),
	};
}
