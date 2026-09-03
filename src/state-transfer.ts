import {
	type BrowserStateOwner,
	exportBrowserState,
	replaceBrowserState,
} from "./browser-state.js";
import { AgentBrowserError } from "./errors.js";

export const stateTransferLimits = Object.freeze({
	maxBytes: 134_217_728,
	maxTransfers: 4,
	maxChunkBytes: 32_768,
	ttlMs: 300_000,
});

export interface StateTransferInfo {
	id: string;
	direction: "export" | "import";
	bytes: number;
	receivedBytes: number;
}

interface Transfer {
	owner: BrowserStateOwner;
	info: StateTransferInfo;
	content: Uint8Array;
	expires: number;
	timer?: ReturnType<typeof setTimeout>;
}

export function encodeStateChunk(bytes: Uint8Array): string {
	if (bytes.length > stateTransferLimits.maxChunkBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"State chunk exceeds its byte limit",
		);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function decodeStateChunk(value: unknown): Uint8Array {
	if (
		typeof value !== "string" ||
		!value.length ||
		value.length > Math.ceil(stateTransferLimits.maxChunkBytes / 3) * 4 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
			value,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state chunk encoding",
		);
	const binary = atob(value);
	if (
		binary.length > stateTransferLimits.maxChunkBytes ||
		btoa(binary) !== value
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state chunk encoding",
		);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class StateTransfers {
	private readonly identity = crypto.randomUUID();
	private readonly entries = new Map<string, Transfer>();
	private sequence = 0;
	private bytes = 0;
	private readonly limits: Readonly<
		Record<keyof typeof stateTransferLimits, number>
	>;

	constructor(
		limits: Partial<Record<keyof typeof stateTransferLimits, number>> = {},
		private readonly clock: () => number = () => performance.now(),
	) {
		this.limits = Object.freeze({ ...stateTransferLimits, ...limits });
		if (typeof clock !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state transfer clock",
			);
		for (const key of Object.keys(
			stateTransferLimits,
		) as (keyof typeof stateTransferLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > stateTransferLimits[key]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid state transfer limits",
				);
	}

	export(owner: BrowserStateOwner): Readonly<StateTransferInfo> {
		this.capacity(1);
		const json = JSON.stringify(exportBrowserState(owner));
		this.capacity(json.length);
		const content = new TextEncoder().encode(json);
		this.capacity(content.length);
		return this.store(owner, "export", content);
	}

	begin(owner: BrowserStateOwner, bytes: number): Readonly<StateTransferInfo> {
		this.capacity(bytes);
		return this.store(owner, "import", new Uint8Array(bytes));
	}

	append(owner: BrowserStateOwner, id: string, offset: number, data: unknown) {
		const entry = this.owned(owner, id, "import");
		if (!Number.isSafeInteger(offset) || offset !== entry.info.receivedBytes)
			throw new AgentBrowserError(
				"invalid-input",
				"State chunk offset is not the next import offset",
			);
		const content = decodeStateChunk(data);
		if (
			content.length > this.limits.maxChunkBytes ||
			offset + content.length > entry.info.bytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"State chunk exceeds the remaining import size",
			);
		entry.content.set(content, offset);
		entry.info.receivedBytes += content.length;
		return Object.freeze({ ...entry.info });
	}

	read(owner: BrowserStateOwner, id: string, offset: number) {
		const entry = this.owned(owner, id, "export");
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset >= entry.info.bytes
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state export offset",
			);
		const content = entry.content.subarray(
			offset,
			offset + this.limits.maxChunkBytes,
		);
		return Object.freeze({
			id,
			offset,
			bytes: content.length,
			totalBytes: entry.info.bytes,
			encoding: "base64",
			data: encodeStateChunk(content),
			eof: offset + content.length === entry.info.bytes,
		});
	}

	commit(owner: BrowserStateOwner, id: string) {
		const entry = this.owned(owner, id, "import");
		if (entry.info.receivedBytes !== entry.info.bytes)
			throw new AgentBrowserError(
				"invalid-input",
				"State import is incomplete",
			);
		try {
			let state: unknown;
			try {
				state = JSON.parse(
					new TextDecoder("utf-8", { fatal: true }).decode(entry.content),
				);
			} catch {
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid state import JSON or UTF-8",
				);
			}
			replaceBrowserState(owner, state);
			return Object.freeze({ id, bytes: entry.info.bytes, loaded: true });
		} finally {
			this.remove(id, entry);
		}
	}

	delete(owner: BrowserStateOwner, id: string) {
		const entry = this.owned(owner, id);
		this.remove(id, entry);
		return { deleted: true };
	}

	clear(owner: BrowserStateOwner) {
		for (const [id, entry] of this.entries)
			if (entry.owner === owner) this.remove(id, entry);
	}

	metrics() {
		this.sweep();
		return Object.freeze({
			transfers: this.entries.size,
			bytes: this.bytes,
			...this.limits,
		});
	}

	private now() {
		const now = this.clock();
		if (!Number.isFinite(now) || now < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state transfer clock",
			);
		return now;
	}

	private sweep() {
		const now = this.now();
		for (const [id, entry] of this.entries)
			if (entry.expires <= now) this.remove(id, entry);
	}

	private capacity(bytes: number) {
		this.sweep();
		if (
			!Number.isSafeInteger(bytes) ||
			bytes < 1 ||
			this.entries.size >= this.limits.maxTransfers ||
			bytes + this.bytes > this.limits.maxBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"State transfer capacity exceeded",
			);
	}

	private store(
		owner: BrowserStateOwner,
		direction: StateTransferInfo["direction"],
		content: Uint8Array,
	) {
		const id = `state-${this.identity}-${++this.sequence}`;
		const info = {
			id,
			direction,
			bytes: content.length,
			receivedBytes: direction === "export" ? content.length : 0,
		};
		const entry: Transfer = {
			owner,
			info,
			content,
			expires: this.now() + this.limits.ttlMs,
		};
		entry.timer = setTimeout(() => this.remove(id, entry), this.limits.ttlMs);
		if (typeof entry.timer === "object" && "unref" in entry.timer)
			entry.timer.unref();
		this.entries.set(id, entry);
		this.bytes += content.length;
		return Object.freeze({ ...info });
	}

	private owned(
		owner: BrowserStateOwner,
		id: string,
		direction?: StateTransferInfo["direction"],
	) {
		this.sweep();
		const entry = this.entries.get(id);
		if (!entry || entry.owner !== owner)
			throw new AgentBrowserError(
				"not-found",
				"State transfer not found in this session",
			);
		if (direction && entry.info.direction !== direction)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state transfer direction",
			);
		return entry;
	}

	private remove(id: string, entry: Transfer) {
		if (this.entries.get(id) !== entry) return;
		clearTimeout(entry.timer);
		this.entries.delete(id);
		this.bytes -= entry.content.length;
		entry.content.fill(0);
	}
}
