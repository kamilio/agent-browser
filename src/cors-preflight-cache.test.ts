import { expect, it } from "vitest";
import { CorsPreflightCache } from "./cors-preflight-cache.js";

const origin = "https://example.com";
const url = "https://api.example/data";
const grants = { methods: ["PUT", "DELETE"], headers: ["X-First", "x-second"] };
function fixture() {
	let now = 0;
	const cache = new CorsPreflightCache(() => now);
	return {
		cache,
		setTime: (value: number) => {
			now = value;
		},
		store: (age?: string) => cache.store(origin, url, "omit", grants, age),
		matches: () => cache.matches(origin, url, "omit", "PUT", ["x-first"]),
	};
}

it.each([undefined, "garbage", "-1", "1.5", "5, 10", "", "+10"])(
	"defaults missing or invalid max-age %s to five seconds",
	(age) => {
		const { store, matches, setTime } = fixture();
		store(age);
		setTime(4999);
		expect(matches()).toBe(true);
		setTime(5000);
		expect(matches()).toBe(false);
	},
);

it.each(["7201", "9999999999999999999999999999", "9".repeat(400)])(
	"caps long max-age grants at two hours (%s)",
	(age) => {
		const { store, matches, setTime } = fixture();
		store(age);
		setTime(7_199_999);
		expect(matches()).toBe(true);
		setTime(7_200_000);
		expect(matches()).toBe(false);
	},
);

it("trims max-age whitespace and expires at the exact boundary", () => {
	const { store, matches, setTime, cache } = fixture();
	store("\t 0002 \t");
	setTime(1999);
	expect(matches()).toBe(true);
	setTime(2000);
	expect(matches()).toBe(false);
	expect(cache.metrics()).toMatchObject({ entries: 0, retainedUnits: 0 });
});

it("refreshes exact grants without accumulating duplicates", () => {
	const { store, matches, setTime, cache } = fixture();
	store("5");
	setTime(4000);
	store("10");
	expect(cache.metrics().entries).toBe(4);
	setTime(13_999);
	expect(matches()).toBe(true);
	setTime(14_000);
	expect(matches()).toBe(false);
});

it("zero max-age removes matching previous grants", () => {
	const { store, matches, cache } = fixture();
	store("60");
	store("0");
	expect(matches()).toBe(false);
	expect(cache.metrics().entries).toBe(0);
});

it("combines independently granted headers and safelisted methods", () => {
	const { cache } = fixture();
	cache.store(origin, url, "omit", { methods: [], headers: ["x-first"] }, "10");
	cache.store(
		origin,
		url,
		"omit",
		{ methods: [], headers: ["x-second"] },
		"10",
	);
	expect(
		cache.matches(origin, url, "omit", "POST", ["X-First", "x-second"]),
	).toBe(true);
	expect(cache.matches(origin, url, "omit", "PUT", ["x-first"])).toBe(false);
});

it("keeps method matching case-sensitive", () => {
	const { cache, store } = fixture();
	store();
	expect(cache.matches(origin, url, "omit", "put", [])).toBe(false);
});

it.each(["https://api.example/other", `${url}?query`, `${url}/`])(
	"does not broaden exact URL grants to %s",
	(other) => {
		const { cache, store } = fixture();
		store();
		expect(cache.matches(origin, other, "omit", "PUT", [])).toBe(false);
	},
);

it.each(["null", "https://other.example", "http://example.com"])(
	"isolates serialized origin %s",
	(other) => {
		const { cache, store } = fixture();
		store();
		expect(cache.matches(other, url, "omit", "PUT", [])).toBe(false);
	},
);

it("does not upgrade noncredentialed permissions", () => {
	const { cache, store } = fixture();
	store();
	expect(cache.matches(origin, url, "include", "PUT", [])).toBe(false);
	expect(cache.matches(origin, url, "same-origin", "PUT", [])).toBe(true);
});

it("allows exact credentialed grants to serve noncredentialed requests", () => {
	const { cache } = fixture();
	cache.store(origin, url, "include", grants, "5");
	for (const credentials of ["include", "omit", "same-origin"] as const)
		expect(cache.matches(origin, url, credentials, "PUT", ["x-first"])).toBe(
			true,
		);
});

it("matches noncredentialed wildcards except authorization", () => {
	const { cache } = fixture();
	cache.store(origin, url, "omit", { methods: ["*"], headers: ["*"] }, "5");
	expect(cache.matches(origin, url, "omit", "PATCH", ["x-unlisted"])).toBe(
		true,
	);
	expect(cache.matches(origin, url, "omit", "PATCH", ["Authorization"])).toBe(
		false,
	);
	expect(cache.matches(origin, url, "include", "PATCH", [])).toBe(false);
	cache.store(
		origin,
		url,
		"omit",
		{ methods: [], headers: ["Authorization"] },
		"5",
	);
	expect(cache.matches(origin, url, "omit", "PATCH", ["authorization"])).toBe(
		true,
	);
});

it("does not amplify credentialed literal stars into wildcard grants", () => {
	const { cache } = fixture();
	cache.store(
		origin,
		url,
		"include",
		{ methods: ["PUT", "*"], headers: ["x-first", "*"] },
		"5",
	);
	for (const credentials of ["include", "omit"] as const) {
		expect(cache.matches(origin, url, credentials, "PUT", ["x-first"])).toBe(
			true,
		);
		expect(cache.matches(origin, url, credentials, "DELETE", [])).toBe(false);
		expect(cache.matches(origin, url, credentials, "PUT", ["x-second"])).toBe(
			false,
		);
	}
});

it("clears every credential variant for only the requested origin and URL", () => {
	const { cache, store, matches } = fixture();
	store();
	cache.store(origin, url, "include", grants, "5");
	cache.store("null", url, "include", grants, "5");
	cache.store(origin, `${url}?other`, "omit", grants, "5");
	cache.clear(origin, url);
	expect(matches()).toBe(false);
	expect(cache.matches(origin, url, "include", "PUT", [])).toBe(false);
	expect(cache.matches("null", url, "include", "PUT", [])).toBe(true);
	expect(cache.matches(origin, `${url}?other`, "omit", "PUT", [])).toBe(true);
});

it("evicts oldest entries to bound entry count", () => {
	const { cache } = fixture();
	for (let index = 0; index < 257; index++)
		cache.store(
			origin,
			`${url}?${index}`,
			"omit",
			{ methods: ["PUT"], headers: [] },
			"5",
		);
	expect(cache.metrics()).toMatchObject({ entries: 256, evictions: 1 });
	expect(cache.matches(origin, `${url}?0`, "omit", "PUT", [])).toBe(false);
	expect(cache.matches(origin, `${url}?256`, "omit", "PUT", [])).toBe(true);
});

it("bounds retained string units independently of entry count", () => {
	const { cache } = fixture();
	for (let index = 0; index < 20; index++)
		cache.store(
			origin,
			`${url}?${index}${"a".repeat(16_000)}`,
			"omit",
			grants,
			"5",
		);
	expect(cache.metrics().retainedUnits).toBeLessThanOrEqual(65_536);
	expect(cache.metrics().entries).toBeLessThanOrEqual(4);
	expect(cache.metrics().evictions).toBeGreaterThan(0);
});

it("skips an oversized entry without evicting usable grants", () => {
	const { cache, store, matches } = fixture();
	store();
	cache.store(origin, "x".repeat(65_537), "omit", grants, "5");
	expect(matches()).toBe(true);
	expect(cache.metrics().entries).toBe(4);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER])(
	"fails closed on an invalid clock reading %s",
	(value) => {
		const { cache, store, matches, setTime } = fixture();
		store();
		setTime(value);
		expect(matches()).toBe(false);
		store();
		expect(cache.metrics().entries).toBe(0);
	},
);

it("discards permissions on clock rollback", () => {
	const { store, matches, setTime } = fixture();
	setTime(2000);
	store();
	setTime(1000);
	expect(matches()).toBe(false);
	setTime(2000);
	expect(matches()).toBe(false);
});

it("treats clock failure as an optional cache miss", () => {
	const cache = new CorsPreflightCache(() => {
		throw new Error("clock failed");
	});
	cache.store(origin, url, "omit", grants, "5");
	expect(cache.matches(origin, url, "omit", "PUT", [])).toBe(false);
	expect(cache.metrics().entries).toBe(0);
});

it("releases entries on close and never reopens", () => {
	const { cache, store, matches } = fixture();
	store();
	cache.close();
	cache.close();
	store();
	expect(matches()).toBe(false);
	expect(cache.metrics()).toMatchObject({ entries: 0, retainedUnits: 0 });
});
