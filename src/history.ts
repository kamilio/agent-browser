import {
	canRewriteDocumentUrl,
	documentBaseUrl,
	selectDocumentFragmentTarget,
	urlFragment,
} from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";

export type HistoryValue =
	| null
	| boolean
	| number
	| string
	| HistoryValue[]
	| { [key: string]: HistoryValue };
export interface HistoryLimits {
	maxEntries: number;
	maxStateBytes: number;
	maxTotalStateBytes: number;
	maxStateDepth: number;
	maxStateNodes: number;
	maxPending: number;
	maxOperations: number;
}
export interface HistorySnapshot {
	readonly key: string;
	readonly url: string;
	readonly state: HistoryValue;
	readonly index: number;
	readonly length: number;
}
export interface HistoryArchive {
	readonly index: number;
	readonly entries: readonly {
		readonly key: string;
		readonly url: string;
		readonly serialized: string;
	}[];
}
interface Entry {
	key: string;
	url: string;
	serialized: string;
	bytes: number;
}
interface Job {
	run: () => HistorySnapshot | Promise<HistorySnapshot>;
	resolve: (value: HistorySnapshot) => void;
	reject: (error: unknown) => void;
}

const histories = new WeakSet<DocumentTree>();
const sharedHistories = new WeakMap<DocumentTree, DocumentHistory>();

export function documentHistory(
	tree: DocumentTree,
	events: DocumentEvents,
): DocumentHistory {
	let history = sharedHistories.get(tree);
	if (!history) {
		history = new DocumentHistory(tree, events);
		sharedHistories.set(tree, history);
		tree.onClose(() => sharedHistories.delete(tree));
	}
	return history;
}
let nextHistoryId = 1;
const encoder = new TextEncoder();

function serializeState(input: HistoryValue, limits: Readonly<HistoryLimits>) {
	const chunks: string[] = [];
	const ancestors = new Set<object>();
	let bytes = 0;
	let nodes = 0;
	const write = (text: string) => {
		bytes += encoder.encode(text).byteLength;
		if (bytes > limits.maxStateBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"History state byte limit exceeded",
			);
		chunks.push(text);
	};
	const quote = (text: string) => {
		if (text.length > limits.maxStateBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"History state string limit exceeded",
			);
		write(JSON.stringify(text));
	};
	const visit = (value: unknown, depth: number): void => {
		if (++nodes > limits.maxStateNodes || depth > limits.maxStateDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"History state complexity limit exceeded",
			);
		if (value === null || typeof value === "boolean") {
			write(String(value));
			return;
		}
		if (typeof value === "string") {
			quote(value);
			return;
		}
		if (typeof value === "number" && Number.isFinite(value)) {
			write(JSON.stringify(value));
			return;
		}
		if (!value || typeof value !== "object")
			throw new AgentBrowserError(
				"unsupported",
				"History state must be finite JSON data",
			);
		if (ancestors.has(value))
			throw new AgentBrowserError(
				"unsupported",
				"Cyclic history state is not supported",
			);
		const array = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		if (!array && prototype !== null && prototype !== Object.prototype)
			throw new AgentBrowserError(
				"unsupported",
				"History state must contain plain objects",
			);
		const keys = Reflect.ownKeys(value);
		if (keys.length > limits.maxStateNodes + (array ? 1 : 0))
			throw new AgentBrowserError(
				"resource-limit",
				"History state property limit exceeded",
			);
		if (keys.some((key) => typeof key !== "string"))
			throw new AgentBrowserError(
				"unsupported",
				"Symbol history state keys are not supported",
			);
		if (
			array &&
			(keys.length !== value.length + 1 ||
				!keys.every(
					(key) =>
						key === "length" ||
						(/^(0|[1-9][0-9]*)$/.test(String(key)) &&
							Number(key) < value.length),
				))
		)
			throw new AgentBrowserError(
				"unsupported",
				"History arrays must be dense and have no extra properties",
			);
		ancestors.add(value);
		try {
			write(array ? "[" : "{");
			let count = 0;
			for (const key of keys) {
				if (array && key === "length") continue;
				const descriptor = Object.getOwnPropertyDescriptor(value, key);
				if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
					throw new AgentBrowserError(
						"unsupported",
						"History state accessors and hidden properties are not supported",
					);
				if (count++) write(",");
				if (!array) {
					quote(String(key));
					write(":");
				}
				visit(descriptor.value, depth + 1);
			}
			write(array ? "]" : "}");
		} finally {
			ancestors.delete(value);
		}
	};
	visit(input, 0);
	return { serialized: chunks.join(""), bytes };
}

export class BrowserPopStateEvent extends BrowserEvent {
	readonly #state: HistoryValue;
	constructor(state: HistoryValue) {
		super("popstate");
		this.#state = state;
	}
	get state() {
		return this.#state;
	}
}

export class BrowserHashChangeEvent extends BrowserEvent {
	readonly #oldURL: string;
	readonly #newURL: string;
	constructor(oldURL: string, newURL: string) {
		super("hashchange");
		this.#oldURL = oldURL;
		this.#newURL = newURL;
	}
	get oldURL() {
		return this.#oldURL;
	}
	get newURL() {
		return this.#newURL;
	}
}

export class DocumentHistory {
	readonly limits: Readonly<HistoryLimits>;
	private entries: Entry[];
	private index = 0;
	private sequence = 1;
	private readonly identity: number;
	private queue: Job[] = [];
	private scheduled = false;
	private running = false;
	private operations = 0;
	private evictions = 0;
	private closed = false;
	private revisionValue = 0;
	private readonly windowTarget: number;
	private unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
		limits: Partial<HistoryLimits> = {},
	) {
		this.limits = Object.freeze({
			maxEntries: 128,
			maxStateBytes: 1_048_576,
			maxTotalStateBytes: 4_194_304,
			maxStateDepth: 32,
			maxStateNodes: 10_000,
			maxPending: 64,
			maxOperations: 10_000,
			...limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid history limit");
		if (
			events.documentRoot !== tree.root ||
			events.windowTarget === null ||
			events.metrics().closed
		)
			throw new AgentBrowserError(
				"invalid-input",
				"History requires this document's active Window event target",
			);
		if (!["http:", "https:"].includes(new URL(tree.url).protocol))
			throw new AgentBrowserError(
				"unsupported",
				"History currently requires an HTTP(S) document",
			);
		if (tree.url.length > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"History URL limit exceeded",
			);
		if (histories.has(tree))
			throw new AgentBrowserError(
				"invalid-input",
				"Document already has an active history",
			);
		if (!Number.isSafeInteger(nextHistoryId))
			throw new AgentBrowserError(
				"resource-limit",
				"History identity limit exceeded",
			);
		this.identity = nextHistoryId++;
		this.windowTarget = events.windowTarget;
		const state = serializeState(null, this.limits);
		if (state.bytes > this.limits.maxTotalStateBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Total history state byte limit exceeded",
			);
		this.entries = [{ key: this.newKey(), url: tree.url, ...state }];
		this.unregisterClose = tree.onClose(() => this.close());
		histories.add(tree);
	}

	snapshot(): HistorySnapshot {
		this.ensureRetained();
		const entry = this.entries[this.index];
		return Object.freeze({
			key: entry.key,
			url: entry.url,
			state: JSON.parse(entry.serialized) as HistoryValue,
			index: this.index,
			length: this.entries.length,
		});
	}

	get revision() {
		this.ensureRetained();
		return this.revisionValue;
	}

	capture(): HistoryArchive {
		this.ensureRetained();
		return Object.freeze({
			index: this.index,
			entries: Object.freeze(
				this.entries.map(({ key, url, serialized }) =>
					Object.freeze({ key, url, serialized }),
				),
			),
		});
	}

	restore(archive: HistoryArchive) {
		this.ensureActive();
		if (this.operations || this.revisionValue || this.entries.length !== 1)
			throw new AgentBrowserError(
				"invalid-input",
				"History restoration requires a fresh document history",
			);
		if (
			!archive ||
			!Array.isArray(archive.entries) ||
			!archive.entries.length ||
			archive.entries.length > this.limits.maxEntries ||
			!Number.isSafeInteger(archive.index) ||
			archive.index < 0 ||
			archive.index >= archive.entries.length
		)
			throw new AgentBrowserError("invalid-input", "Invalid history archive");
		const keys = new Set<string>();
		let total = 0;
		const next = archive.entries.map((entry): Entry => {
			if (
				!entry ||
				typeof entry.key !== "string" ||
				!/^h[1-9][0-9]*-[1-9][0-9]*$/.test(entry.key) ||
				entry.key.length > 64 ||
				keys.has(entry.key) ||
				typeof entry.url !== "string" ||
				entry.url.length > 16_384 ||
				typeof entry.serialized !== "string" ||
				entry.serialized.length > this.limits.maxStateBytes
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid history archive entry",
				);
			keys.add(entry.key);
			try {
				if (new URL(entry.url).href !== entry.url)
					throw new Error("noncanonical");
			} catch {
				throw new AgentBrowserError(
					"invalid-input",
					"Archived history URL must be absolute and canonical",
				);
			}
			const url = this.resolve(entry.url);
			let state: HistoryValue;
			try {
				state = JSON.parse(entry.serialized) as HistoryValue;
			} catch {
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid archived history state",
				);
			}
			const encoded = serializeState(state, this.limits);
			total += encoded.bytes;
			if (total > this.limits.maxTotalStateBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Total history state byte limit exceeded",
				);
			return { key: entry.key, url, ...encoded };
		});
		if (total > this.limits.maxTotalStateBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Total history state byte limit exceeded",
			);
		if (next[archive.index].url !== this.tree.url)
			throw new AgentBrowserError(
				"invalid-input",
				"Restored history URL must match the loaded document",
			);
		this.entries = next;
		this.index = archive.index;
		this.revisionValue++;
		return this.snapshot();
	}

	list() {
		this.ensureActive();
		return Object.freeze(
			this.entries.map((entry, index) =>
				Object.freeze({
					key: entry.key,
					url: entry.url,
					active: index === this.index,
				}),
			),
		);
	}

	pushState(
		state: HistoryValue,
		url?: string | null,
		validate?: (archive: HistoryArchive) => void,
	) {
		this.charge();
		this.commit(
			this.resolve(url),
			serializeState(state, this.limits),
			false,
			validate,
		);
		return this.snapshot();
	}

	replaceState(
		state: HistoryValue,
		url?: string | null,
		validate?: (archive: HistoryArchive) => void,
	) {
		this.charge();
		this.commit(
			this.resolve(url),
			serializeState(state, this.limits),
			true,
			validate,
		);
		return this.snapshot();
	}

	async go(delta: number, signal?: AbortSignal): Promise<HistorySnapshot> {
		this.ensureActive();
		if (signal !== undefined && !(signal instanceof AbortSignal))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid history traversal signal",
			);
		if (!Number.isSafeInteger(delta))
			throw new AgentBrowserError(
				"invalid-input",
				"History delta must be a safe integer",
			);
		if (delta === 0)
			throw new AgentBrowserError(
				"unsupported",
				"Reload requires the navigation controller",
			);
		return this.enqueue(async () => {
			if (signal?.aborted)
				throw new AgentBrowserError("aborted", "History traversal aborted");
			if (delta < -this.index || delta >= this.entries.length - this.index)
				return this.snapshot();
			const oldURL = this.tree.url;
			const target = this.index + delta;
			this.tree.setUrl(this.entries[target].url);
			this.index = target;
			this.revisionValue++;
			this.tree.setTargetElement(selectDocumentFragmentTarget(this.tree));
			await this.notify(oldURL, this.snapshot(), signal);
			return this.snapshot();
		});
	}
	back() {
		return this.go(-1);
	}
	forward() {
		return this.go(1);
	}

	async navigateFragment(
		url: string,
		replace = false,
		signal?: AbortSignal,
	): Promise<HistorySnapshot> {
		this.ensureActive();
		if (
			typeof url !== "string" ||
			url.length > 16_384 ||
			typeof replace !== "boolean" ||
			(signal !== undefined && !(signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid fragment navigation",
			);
		return this.enqueue(async () => {
			if (signal?.aborted)
				throw new AgentBrowserError("aborted", "Fragment navigation aborted");
			await this.applyFragment(url, replace)(signal);
			return this.snapshot();
		});
	}

	prepareFragment(
		url: string,
		replace = false,
		validate?: (archive: HistoryArchive) => void,
	) {
		this.charge();
		return this.applyFragment(url, replace, validate);
	}

	private applyFragment(
		url: string,
		replace: boolean,
		validate?: (archive: HistoryArchive) => void,
	) {
		this.ensureActive();
		if (
			typeof url !== "string" ||
			url.length > 16_384 ||
			typeof replace !== "boolean"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid fragment navigation",
			);
		let next: URL;
		try {
			next = new URL(url, documentBaseUrl(this.tree));
		} catch {
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid fragment navigation URL",
			);
		}
		const current = new URL(this.tree.url);
		const currentResource = new URL(current.href);
		const nextResource = new URL(next.href);
		currentResource.hash = "";
		nextResource.hash = "";
		if (currentResource.href !== nextResource.href)
			throw new AgentBrowserError(
				"unsupported",
				"Cross-document navigation requires a document loader",
			);
		const changed = next.href !== current.href;
		if (changed)
			this.commit(
				this.resolve(next.href),
				serializeState(null, this.limits),
				replace,
				validate,
			);
		this.tree.setTargetElement(selectDocumentFragmentTarget(this.tree));
		const snapshot = this.snapshot();
		return async (signal?: AbortSignal) => {
			this.ensureActive();
			if (signal?.aborted)
				throw new AgentBrowserError("aborted", "Fragment navigation aborted");
			if (changed) await this.notify(current.href, snapshot, signal);
			return snapshot;
		};
	}

	metrics() {
		return Object.freeze({
			entries: this.entries.length,
			stateBytes: this.entries.reduce((total, entry) => total + entry.bytes, 0),
			pending: this.queue.length,
			running: this.running,
			operations: this.operations,
			evictions: this.evictions,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.entries = [];
		for (const job of this.queue.splice(0))
			job.reject(new AgentBrowserError("closed", "Document history is closed"));
		histories.delete(this.tree);
		this.unregisterClose();
	}

	private resolve(value?: string | null) {
		if (value === undefined || value === null || value === "")
			return this.tree.url;
		if (typeof value !== "string" || value.length > 16_384)
			throw new AgentBrowserError("invalid-input", "Invalid history URL");
		let target: URL;
		try {
			target = new URL(value, documentBaseUrl(this.tree));
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid history URL");
		}
		if (!canRewriteDocumentUrl(new URL(this.tree.url), target))
			throw new AgentBrowserError(
				"policy-denied",
				"History cannot rewrite this document URL",
			);
		if (target.href.length > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"History URL limit exceeded",
			);
		return target.href;
	}

	private commit(
		url: string,
		state: { serialized: string; bytes: number },
		replace: boolean,
		validate?: (archive: HistoryArchive) => void,
	) {
		this.ensureActive();
		const entry: Entry = {
			key: replace ? this.entries[this.index].key : this.newKey(),
			url,
			...state,
		};
		const next = replace
			? [...this.entries]
			: this.entries.slice(0, this.index + 1);
		if (replace) next[this.index] = entry;
		else next.push(entry);
		let evicted = 0;
		if (next.length > this.limits.maxEntries) {
			if (this.limits.maxEntries < 2)
				throw new AgentBrowserError(
					"resource-limit",
					"History entry limit prevents new entries",
				);
			next.splice(1, next.length - this.limits.maxEntries);
			evicted = this.index + 2 - next.length;
		}
		if (
			next.reduce((total, candidate) => total + candidate.bytes, 0) >
			this.limits.maxTotalStateBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Total history state byte limit exceeded",
			);
		validate?.(
			Object.freeze({
				index: replace ? this.index : next.length - 1,
				entries: Object.freeze(
					next.map(({ key, url, serialized }) =>
						Object.freeze({ key, url, serialized }),
					),
				),
			}),
		);
		this.tree.setUrl(url);
		this.entries = next;
		this.revisionValue++;
		if (!replace) this.index = next.length - 1;
		this.evictions += evicted;
	}

	private async notify(
		oldURL: string,
		snapshot: HistorySnapshot,
		signal?: AbortSignal,
	) {
		await this.events.dispatchEventAsync(
			this.windowTarget,
			new BrowserPopStateEvent(snapshot.state),
			signal,
		);
		this.ensureActive();
		if (urlFragment(new URL(oldURL)) !== urlFragment(new URL(snapshot.url)))
			await this.events.dispatchEventAsync(
				this.windowTarget,
				new BrowserHashChangeEvent(oldURL, snapshot.url),
				signal,
			);
	}

	private enqueue(run: Job["run"]) {
		this.ensureActive();
		if (this.queue.length + Number(this.running) >= this.limits.maxPending)
			throw new AgentBrowserError(
				"resource-limit",
				"Pending history operation limit exceeded",
			);
		this.charge();
		return new Promise<HistorySnapshot>((resolve, reject) => {
			this.queue.push({ run, resolve, reject });
			this.schedule();
		});
	}
	private schedule() {
		if (this.scheduled || this.running || !this.queue.length) return;
		this.scheduled = true;
		queueMicrotask(async () => {
			this.scheduled = false;
			const job = this.queue.shift();
			if (!job) return;
			this.running = true;
			try {
				this.ensureActive();
				job.resolve(await job.run());
			} catch (error) {
				job.reject(error);
			} finally {
				this.running = false;
				this.schedule();
			}
		});
	}
	private charge() {
		this.ensureActive();
		if (this.operations >= this.limits.maxOperations)
			throw new AgentBrowserError(
				"resource-limit",
				"History operation limit exceeded",
			);
		this.operations++;
	}
	private newKey() {
		let key: string;
		do {
			key = `h${this.identity}-${this.sequence++}`;
		} while (this.entries?.some((entry) => entry.key === key));
		return key;
	}
	private ensureActive() {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document history is closed");
		this.ensureRetained();
	}
	private ensureRetained() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document history is closed");
		if (this.entries[this.index].url !== this.tree.url)
			throw new AgentBrowserError(
				"invalid-input",
				"Document URL changed outside its history",
			);
	}
}
