import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export interface StorageLimits {
	maxTabs: number;
	maxAreas: number;
	maxEntriesPerArea: number;
	maxTotalEntries: number;
	maxAreaBytes: number;
	maxTotalBytes: number;
}

export interface StorageArea {
	readonly length: number;
	key(index: number): string | null;
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
	clear(): void;
	entries(): readonly (readonly [string, string])[];
}

export interface StorageMutation {
	readonly kind: "local" | "session";
	readonly tabId: string;
	readonly origin: string;
	readonly url: string;
	readonly source?: object;
	readonly key: string | null;
	readonly oldValue: string | null;
	readonly newValue: string | null;
}

export interface LocalStorageState {
	origins: {
		origin: string;
		localStorage: { name: string; value: string }[];
	}[];
}

interface Store {
	values: Map<string, string>;
	bytes: number;
}

interface TabStorage {
	id: string;
	session: Map<string, Store>;
}

function string(value: unknown): asserts value is string {
	if (typeof value !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Storage keys and values must be strings",
		);
}

function validId(id: string) {
	if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(id))
		throw new AgentBrowserError("invalid-input", "Invalid storage tab ID");
}

export class BrowserStorage {
	readonly limits: Readonly<StorageLimits>;
	private local = new Map<string, Store>();
	private tabs = new Map<string, TabStorage>();
	private closed = false;
	private currentRevision = 0;
	private notificationFailures = 0;

	constructor(
		limits: Partial<StorageLimits> = {},
		private readonly onMutation?: (mutation: StorageMutation) => unknown,
	) {
		if (onMutation !== undefined && typeof onMutation !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid storage mutation observer",
			);
		this.limits = Object.freeze({
			maxTabs: 32,
			maxAreas: 256,
			maxEntriesPerArea: 5000,
			maxTotalEntries: 20_000,
			maxAreaBytes: 5_242_880,
			maxTotalBytes: 16_777_216,
			...limits,
		});
		for (const [name, value] of Object.entries(this.limits))
			if (!Number.isSafeInteger(value) || value < 1 || value > 1_073_741_824)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid storage limit: ${name}`,
				);
	}

	openTab(id: string, opener?: string) {
		this.ensureOpen();
		validId(id);
		if (this.tabs.has(id))
			throw new AgentBrowserError(
				"invalid-input",
				"Storage tab already exists",
			);
		if (this.tabs.size >= this.limits.maxTabs)
			throw new AgentBrowserError(
				"resource-limit",
				"Storage tab limit exceeded",
			);
		const source = opener === undefined ? undefined : this.tab(opener);
		const session = new Map<string, Store>();
		if (source) {
			this.validateStores([...this.stores(), ...source.session.values()]);
			for (const [origin, store] of source.session)
				session.set(origin, {
					values: new Map(store.values),
					bytes: store.bytes,
				});
		}
		this.tabs.set(id, { id, session });
		this.currentRevision++;
	}

	closeTab(id: string) {
		const tab = this.tab(id);
		tab.session.clear();
		this.tabs.delete(id);
		this.currentRevision++;
	}

	localStorage(tabId: string, url: string, source?: object): StorageArea {
		return this.area("local", tabId, url, source);
	}
	sessionStorage(tabId: string, url: string, source?: object): StorageArea {
		return this.area("session", tabId, url, source);
	}

	metrics() {
		const stores = this.stores();
		return Object.freeze({
			tabs: this.tabs.size,
			areas: stores.length,
			entries: stores.reduce((sum, store) => sum + store.values.size, 0),
			bytes: stores.reduce((sum, store) => sum + store.bytes, 0),
			revision: this.currentRevision,
			notificationFailures: this.notificationFailures,
			closed: this.closed,
		});
	}

	exportLocalState(): LocalStorageState {
		this.ensureOpen();
		return {
			origins: Array.from(this.local, ([origin, store]) => ({
				origin,
				localStorage: Array.from(store.values, ([name, value]) => ({
					name,
					value,
				})),
			})),
		};
	}

	replaceLocalState(input: unknown) {
		this.ensureOpen();
		if (
			!input ||
			typeof input !== "object" ||
			!("origins" in input) ||
			!Array.isArray(input.origins) ||
			input.origins.length > this.limits.maxAreas
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid local storage state",
			);
		const replacement = new Map<string, Store>();
		for (const item of input.origins) {
			if (
				!item ||
				typeof item !== "object" ||
				typeof item.origin !== "string" ||
				!Array.isArray(item.localStorage)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid local storage origin",
				);
			const url = parseNetworkUrl(item.origin);
			if (
				url.pathname !== "/" ||
				url.search ||
				url.hash ||
				replacement.has(url.origin)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid or duplicate storage origin",
				);
			if (item.localStorage.length > this.limits.maxEntriesPerArea)
				throw new AgentBrowserError(
					"resource-limit",
					"Storage entry limit exceeded",
				);
			const store: Store = { values: new Map(), bytes: 0 };
			for (const entry of item.localStorage) {
				if (!entry || typeof entry !== "object")
					throw new AgentBrowserError("invalid-input", "Invalid storage entry");
				string(entry.name);
				string(entry.value);
				if (store.values.has(entry.name))
					throw new AgentBrowserError("invalid-input", "Duplicate storage key");
				store.bytes += 2 * (entry.name.length + entry.value.length);
				if (store.bytes > this.limits.maxAreaBytes)
					throw new AgentBrowserError(
						"resource-limit",
						"Storage area byte limit exceeded",
					);
				store.values.set(entry.name, entry.value);
			}
			replacement.set(url.origin, store);
		}
		this.validateStores([
			...replacement.values(),
			...Array.from(this.tabs.values()).flatMap((tab) => [
				...tab.session.values(),
			]),
		]);
		this.local = replacement;
		this.currentRevision++;
	}

	close() {
		this.closed = true;
		this.local.clear();
		for (const tab of this.tabs.values()) tab.session.clear();
		this.tabs.clear();
	}

	private area(
		kind: "local" | "session",
		tabId: string,
		url: string,
		source?: object,
	): StorageArea {
		if (source !== undefined && (source === null || typeof source !== "object"))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid storage mutation source",
			);
		const tab = this.tab(tabId);
		const target = parseNetworkUrl(url);
		const origin = target.origin;
		const notify = (
			key: string | null,
			oldValue: string | null,
			newValue: string | null,
		) => {
			if (!this.onMutation) return;
			try {
				const result = this.onMutation(
					Object.freeze({
						kind,
						tabId,
						origin,
						url: target.href,
						source,
						key,
						oldValue,
						newValue,
					}),
				);
				if (result !== undefined)
					void Promise.resolve(result).catch(() => {
						this.notificationFailures++;
					});
			} catch {
				this.notificationFailures++;
			}
		};
		const map = () => {
			this.ensureOpen();
			if (this.tabs.get(tabId) !== tab)
				throw new AgentBrowserError("closed", "Storage tab is closed");
			return kind === "local" ? this.local : tab.session;
		};
		const values = () => map().get(origin)?.values;
		return Object.freeze({
			get length() {
				return values()?.size ?? 0;
			},
			key: (index: number) => {
				const keys = values()?.keys() ?? [];
				if (!Number.isSafeInteger(index) || index < 0) return null;
				let position = 0;
				for (const key of keys) {
					if (position === index) return key;
					position++;
				}
				return null;
			},
			getItem: (key: string) => {
				string(key);
				return values()?.get(key) ?? null;
			},
			setItem: (key: string, value: string) => {
				string(key);
				string(value);
				const areas = map();
				const previous = areas.get(origin);
				const old = previous?.values.get(key);
				if (old === value) return;
				const delta =
					old === undefined
						? 2 * (key.length + value.length)
						: 2 * (value.length - old.length);
				const bytes = (previous?.bytes ?? 0) + delta;
				const addedEntry = old === undefined ? 1 : 0;
				const metrics = this.metrics();
				if (
					bytes > this.limits.maxAreaBytes ||
					metrics.bytes + delta > this.limits.maxTotalBytes
				)
					throw new AgentBrowserError(
						"resource-limit",
						"Storage byte limit exceeded",
					);
				if (
					(previous?.values.size ?? 0) + addedEntry >
						this.limits.maxEntriesPerArea ||
					metrics.entries + addedEntry > this.limits.maxTotalEntries ||
					metrics.areas + (previous ? 0 : 1) > this.limits.maxAreas
				)
					throw new AgentBrowserError(
						"resource-limit",
						"Storage area or entry limit exceeded",
					);
				const store = previous ?? {
					values: new Map<string, string>(),
					bytes: 0,
				};
				store.values.set(key, value);
				store.bytes = bytes;
				areas.set(origin, store);
				this.currentRevision++;
				notify(key, old ?? null, value);
			},
			removeItem: (key: string) => {
				string(key);
				const areas = map();
				const store = areas.get(origin);
				const previous = store?.values.get(key);
				if (previous === undefined || !store) return;
				store.bytes -= 2 * (key.length + previous.length);
				store.values.delete(key);
				if (!store.values.size) areas.delete(origin);
				this.currentRevision++;
				notify(key, previous, null);
			},
			clear: () => {
				const areas = map();
				const changed = !!areas.get(origin)?.values.size;
				if (areas.delete(origin)) {
					this.currentRevision++;
					if (changed) notify(null, null, null);
				}
			},
			entries: () =>
				Object.freeze(
					Array.from(values() ?? [], ([key, value]) =>
						Object.freeze([key, value] as const),
					),
				),
		});
	}

	private stores() {
		return [
			...this.local.values(),
			...Array.from(this.tabs.values()).flatMap((tab) => [
				...tab.session.values(),
			]),
		];
	}

	private validateStores(stores: readonly Store[]) {
		if (
			stores.length > this.limits.maxAreas ||
			stores.reduce((sum, store) => sum + store.values.size, 0) >
				this.limits.maxTotalEntries ||
			stores.reduce((sum, store) => sum + store.bytes, 0) >
				this.limits.maxTotalBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Storage profile limit exceeded",
			);
	}

	private tab(id: string) {
		this.ensureOpen();
		validId(id);
		const tab = this.tabs.get(id);
		if (!tab)
			throw new AgentBrowserError("not-found", "Storage tab does not exist");
		return tab;
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Storage profile is closed");
	}
}
