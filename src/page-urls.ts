import { AgentBrowserError } from "./errors.js";
import type {
	ReleasedContext,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";

const NativeURL = globalThis.URL;
const NativeParams = globalThis.URLSearchParams;
const components = [
	"href",
	"protocol",
	"username",
	"password",
	"host",
	"hostname",
	"port",
	"pathname",
	"search",
	"hash",
] as const;

export const pageUrlLimits: Readonly<
	Record<
		| "maxUrls"
		| "maxSearchParams"
		| "maxInputCodeUnits"
		| "maxSerializedCodeUnits"
		| "maxRetainedCodeUnits"
		| "maxParams"
		| "maxWork",
		number
	>
> = Object.freeze({
	maxUrls: 128,
	maxSearchParams: 256,
	maxInputCodeUnits: 16_384,
	maxSerializedCodeUnits: 16_384,
	maxRetainedCodeUnits: 262_144,
	maxParams: 256,
	maxWork: 2_000_000,
});

interface UrlEntry {
	value?: URL;
	params?: object;
	units: number;
}
interface ParamsEntry {
	value?: URLSearchParams;
	url?: UrlEntry;
	units: number;
}

export class PageUrls {
	readonly port: object;
	readonly limits: typeof pageUrlLimits;
	private readonly urls = new Set<UrlEntry>();
	private readonly searchParams = new Set<ParamsEntry>();
	private retainedCodeUnits = 0;
	private work = 0;
	private closed = false;

	constructor(
		private readonly context: Pick<
			ReleasedContext,
			"signal" | "createHostObject"
		>,
		limits: Partial<typeof pageUrlLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new TypeError("Invalid URL limits");
		this.limits = Object.freeze({ ...pageUrlLimits, ...limits });
		for (const key of Object.keys(
			this.limits,
		) as (keyof typeof pageUrlLimits)[])
			if (
				!Object.hasOwn(pageUrlLimits, key) ||
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > pageUrlLimits[key]
			)
				throw new TypeError("Invalid URL limits");
		this.ensureOpen();
		this.port = context.createHostObject({
			properties: {
				limits: {
					get: () => {
						this.ensureOpen();
						return this.limits;
					},
				},
			},
			methods: {
				url: (input, base) => this.createUrl(input, base),
				params: (input) => this.createParams(input),
				encode: (name, value) => {
					const key = this.text(name);
					const item = this.text(value);
					this.charge(key.length + item.length + 1);
					const encoded = new NativeParams([[key, item]]).toString();
					this.serialized(encoded);
					return encoded;
				},
			},
		});
	}

	metrics() {
		return {
			closed: this.closed,
			urls: this.urls.size,
			searchParams: this.searchParams.size,
			retainedCodeUnits: this.retainedCodeUnits,
			work: this.work,
		};
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const entry of this.urls) {
			entry.value = undefined;
			entry.params = undefined;
		}
		for (const entry of this.searchParams) {
			entry.value = undefined;
			entry.url = undefined;
		}
		this.urls.clear();
		this.searchParams.clear();
		this.retainedCodeUnits = 0;
	}

	private ensureOpen() {
		if (this.context.signal.aborted) this.close();
		if (this.closed)
			throw new AgentBrowserError("closed", "URL owner is closed");
	}

	private limit() {
		throw new AgentBrowserError(
			"resource-limit",
			"URL resource limit exceeded",
		);
	}
	private charge(units: number) {
		this.ensureOpen();
		if (units > this.limits.maxWork - this.work) this.limit();
		this.work += units;
	}
	private text(value: unknown): string {
		this.ensureOpen();
		if (typeof value !== "string")
			throw new TypeError("URL port requires a string");
		if (value.length > this.limits.maxInputCodeUnits) this.limit();
		return value;
	}
	private serialized(value: string) {
		if (value.length > this.limits.maxSerializedCodeUnits) this.limit();
	}
	private measure(params: URLSearchParams, url?: URL) {
		if (params.size > this.limits.maxParams) this.limit();
		const query = params.toString();
		this.serialized(query);
		if (url) this.serialized(url.href);
		let units = query.length + (url?.href.length ?? 0);
		for (const [name, value] of params) units += name.length + value.length;
		return units;
	}
	private admit(units: number, previous = 0) {
		if (
			this.retainedCodeUnits - previous + units >
			this.limits.maxRetainedCodeUnits
		)
			this.limit();
	}
	private parse(input: string, base?: string): URL {
		try {
			return new NativeURL(input, base);
		} catch {
			throw new TypeError("Invalid URL");
		}
	}
	private urlValue(entry: UrlEntry): URL {
		this.ensureOpen();
		if (!entry.value)
			throw new AgentBrowserError("closed", "URL capability is closed");
		return entry.value;
	}
	private createUrl(input: unknown, base: unknown) {
		this.ensureOpen();
		if (
			this.urls.size >= this.limits.maxUrls ||
			this.searchParams.size >= this.limits.maxSearchParams
		)
			this.limit();
		const source = this.text(input);
		const relative = base === undefined ? undefined : this.text(base);
		this.charge(source.length + (relative?.length ?? 0) + 1);
		const value = this.parse(source, relative);
		const units = this.measure(value.searchParams, value);
		this.admit(units);
		const entry: UrlEntry = { value, units };
		this.urls.add(entry);
		this.retainedCodeUnits += units;
		const params: ParamsEntry = { url: entry, units: 0 };
		this.searchParams.add(params);
		entry.params = this.paramsPort(params);
		const properties: NonNullable<ReleasedHostDefinition["properties"]> = {};
		for (const name of [...components, "origin"] as const)
			properties[name] = {
				get: () => {
					this.charge(entry.units + 1);
					return this.urlValue(entry)[name];
				},
				...(name === "origin"
					? {}
					: { set: (input: unknown) => this.writeUrl(entry, name, input) }),
			};
		properties.params = {
			get: () => {
				this.charge(1);
				return entry.params;
			},
		};
		return this.context.createHostObject({ properties });
	}
	private writeUrl(
		entry: UrlEntry,
		name: (typeof components)[number],
		input: unknown,
	) {
		const text = this.text(input);
		this.charge(entry.units + text.length + 1);
		const next = this.parse(this.urlValue(entry).href);
		try {
			next[name] = text;
		} catch {
			throw new TypeError("Invalid URL");
		}
		const units = this.measure(next.searchParams, next);
		this.admit(units, entry.units);
		this.retainedCodeUnits += units - entry.units;
		entry.units = units;
		entry.value = next;
	}
	private createParams(input: unknown) {
		this.ensureOpen();
		if (this.searchParams.size >= this.limits.maxSearchParams) this.limit();
		const text = this.text(input);
		this.charge(text.length + 1);
		const value = new NativeParams(text);
		const units = this.measure(value);
		this.admit(units);
		const entry: ParamsEntry = { value, units };
		this.searchParams.add(entry);
		this.retainedCodeUnits += units;
		return this.paramsPort(entry);
	}
	private readParams(entry: ParamsEntry) {
		this.charge((entry.url?.units ?? entry.units) + 1);
		if (entry.url) return this.urlValue(entry.url).searchParams;
		if (!entry.value)
			throw new AgentBrowserError("closed", "URL parameters are closed");
		return entry.value;
	}
	private mutate(
		entry: ParamsEntry,
		method: "append" | "set" | "delete" | "sort",
		name?: unknown,
		value?: unknown,
	) {
		this.ensureOpen();
		const key = method === "sort" ? "" : this.text(name);
		const item =
			method === "append" || method === "set" || value !== undefined
				? this.text(value)
				: undefined;
		const previous = entry.url?.units ?? entry.units;
		const current = this.readParams(entry);
		this.charge(
			previous +
				(key?.length ?? 0) +
				(item?.length ?? 0) +
				current.size * Math.ceil(Math.log2(current.size + 1)) +
				1,
		);
		const url = entry.url
			? this.parse(this.urlValue(entry.url).href)
			: undefined;
		const next = url?.searchParams ?? new NativeParams(current.toString());
		if (method === "sort") next.sort();
		else if (method === "delete") next.delete(key, item);
		else next[method](key, this.text(item));
		const units = this.measure(next, url);
		this.admit(units, previous);
		this.retainedCodeUnits += units - previous;
		if (entry.url) {
			entry.url.value = url;
			entry.url.units = units;
		} else {
			entry.value = next;
			entry.units = units;
		}
	}
	private paramsPort(entry: ParamsEntry) {
		return this.context.createHostObject({
			properties: { size: { get: () => this.readParams(entry).size } },
			methods: {
				serialize: () => this.readParams(entry).toString(),
				get: (name) => this.readParams(entry).get(this.text(name)),
				getAll: (name) => this.readParams(entry).getAll(this.text(name)),
				has: (name, value) =>
					this.readParams(entry).has(
						this.text(name),
						value === undefined ? undefined : this.text(value),
					),
				append: (name, value) => this.mutate(entry, "append", name, value),
				set: (name, value) => this.mutate(entry, "set", name, value),
				delete: (name, value) => this.mutate(entry, "delete", name, value),
				sort: () => this.mutate(entry, "sort"),
				entry: (index) => {
					const params = this.readParams(entry);
					if (
						typeof index !== "number" ||
						!Number.isSafeInteger(index) ||
						index < 0 ||
						index > this.limits.maxParams
					)
						throw new TypeError("Invalid URL parameter index");
					let position = 0;
					for (const pair of params) {
						if (position++ === index) return pair;
					}
					return null;
				},
			},
		});
	}
}
