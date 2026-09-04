import { type FetchCredentials, needsPreflight } from "./cors.js";

interface Entry {
	origin: string;
	url: string;
	include: boolean;
	kind: "method" | "header";
	name: string;
	expires: number;
	units: number;
}

export class CorsPreflightCache {
	private entries: Entry[] = [];
	private units = 0;
	private previousTime = 0;
	private closed = false;
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	constructor(private readonly clock: () => number = () => performance.now()) {
		if (typeof clock !== "function")
			throw new TypeError("Invalid preflight clock");
	}

	metrics() {
		return {
			entries: this.entries.length,
			retainedUnits: this.units,
			hits: this.hits,
			misses: this.misses,
			evictions: this.evictions,
		};
	}

	matches(
		origin: string,
		url: string,
		credentials: FetchCredentials,
		method: string,
		headers: readonly string[],
	): boolean {
		const now = this.time();
		if (now === undefined) return false;
		this.expire(now);
		const matches = (kind: Entry["kind"], name: string) =>
			this.entries.some(
				(entry) =>
					entry.origin === origin &&
					entry.url === url &&
					(entry.include || credentials !== "include") &&
					entry.kind === kind &&
					(entry.name === name ||
						(entry.name === "*" &&
							!entry.include &&
							(kind === "method" || name !== "authorization"))),
			);
		const result =
			(!needsPreflight(method, []) || matches("method", method)) &&
			headers.every((name) => matches("header", name.toLowerCase()));
		if (result) this.hits++;
		else this.misses++;
		return result;
	}

	store(
		origin: string,
		url: string,
		credentials: FetchCredentials,
		grants: { methods: readonly string[]; headers: readonly string[] },
		maxAge: string | undefined,
	) {
		const now = this.time();
		if (now === undefined) return;
		this.expire(now);
		const value = maxAge?.replace(/^[\t ]+|[\t ]+$/g, "");
		const seconds =
			value !== undefined && /^\d+$/.test(value)
				? Math.min(Number(value), 7200)
				: 5;
		const include = credentials === "include";
		const add = (kind: Entry["kind"], name: string) => {
			const units = origin.length + url.length + name.length;
			this.remove(
				(entry) =>
					entry.origin === origin &&
					entry.url === url &&
					entry.include === include &&
					entry.kind === kind &&
					entry.name === name,
			);
			if (seconds === 0 || units > 65_536) return;
			while (this.entries.length >= 256 || this.units + units > 65_536) {
				const oldest = this.entries.shift();
				if (!oldest) break;
				this.units -= oldest.units;
				this.evictions++;
			}
			this.entries.push({
				origin,
				url,
				include,
				kind,
				name,
				expires: now + seconds * 1000,
				units,
			});
			this.units += units;
		};
		for (const method of grants.methods) add("method", method);
		for (const header of grants.headers) add("header", header.toLowerCase());
	}

	clear(origin: string, url: string) {
		this.remove((entry) => entry.origin === origin && entry.url === url);
	}

	close() {
		this.closed = true;
		this.entries = [];
		this.units = 0;
	}

	private remove(predicate: (entry: Entry) => boolean) {
		this.entries = this.entries.filter((entry) => {
			if (!predicate(entry)) return true;
			this.units -= entry.units;
			return false;
		});
	}

	private expire(now: number) {
		this.remove((entry) => entry.expires <= now);
	}

	private time(): number | undefined {
		if (this.closed) return undefined;
		let now: number;
		try {
			now = this.clock();
		} catch {
			now = Number.NaN;
		}
		if (
			this.closed ||
			!Number.isFinite(now) ||
			now < this.previousTime ||
			now < 0 ||
			now > Number.MAX_SAFE_INTEGER - 7_200_000
		) {
			this.entries = [];
			this.units = 0;
			this.previousTime = 0;
			return undefined;
		}
		this.previousTime = now;
		return now;
	}
}
