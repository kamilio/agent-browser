import { expect, it } from "vitest";
import { imageMediaTypes } from "./image-decoder.js";
import type { NetworkResponse } from "./network.js";
import {
	ResourceReuseCache,
	type ResourceReuseCacheOptions,
	type ResourceReuseRequest,
	type ResourceReuseStamp,
} from "./resource-reuse-cache.js";

const epoch = Date.UTC(2026, 8, 14, 12);
const request: ResourceReuseRequest = {
	url: "https://fixture.invalid/assets/main.css?v=1",
	resource: "stylesheet",
	origin: "https://fixture.invalid",
	headers: { accept: "text/css", "accept-encoding": "identity" },
};

function response(
	input = request,
	mediaType = "text/css; charset=utf-8",
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: {
			"content-type": [mediaType],
			"cache-control": ["public, max-age=31536000, immutable"],
			date: [new Date(epoch).toUTCString()],
			vary: ["Accept-Encoding"],
		},
		body: new TextEncoder().encode("body { color: red }"),
		redirects: [],
		encodedBytes: 14,
		elapsedMs: 2.5,
	};
}

function fixture(options: Partial<ResourceReuseCacheOptions> = {}) {
	const clock = { wallMs: epoch, monotonicMs: 1000 };
	const cache = new ResourceReuseCache(options, () => clock);
	return {
		cache,
		clock,
		advance(wallMs: number, monotonicMs = wallMs) {
			clock.wallMs += wallMs;
			clock.monotonicMs += monotonicMs;
		},
		store(input = request, output = response(input)) {
			cache.put(input, output, cache.start());
		},
	};
}

function withHeaders(
	changes: Record<string, readonly string[] | undefined>,
): NetworkResponse {
	const output = response();
	const headers = { ...output.headers };
	for (const [name, values] of Object.entries(changes)) {
		if (values === undefined) delete headers[name];
		else headers[name] = values;
	}
	return { ...output, headers };
}

function invalid(action: () => unknown) {
	expect(action).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
}

it("validates and freezes default limits without retaining the options object", () => {
	const options = { maxEntries: 2 };
	const { cache } = fixture(options);
	options.maxEntries = 100;
	expect(new ResourceReuseCache().limits).toEqual({
		maxEntries: 64,
		maxBytes: 2_097_152,
		maxEntryBytes: 262_144,
		maxAgeMs: 60_000,
	});
	expect(cache.limits.maxEntries).toBe(2);
	expect(Object.isFrozen(cache.limits)).toBe(true);
	expect(Reflect.set(cache.limits, "maxEntries", 100)).toBe(false);
	expect(Reflect.set(cache, "limits", {})).toBe(false);
	expect(cache.metrics()).toEqual({
		cacheHits: 0,
		cachedDecodedBytes: 0,
		cacheEntries: 0,
		cacheBytes: 0,
	});
});

it("accepts the hard ceilings and positive minimum limits", () => {
	expect(
		new ResourceReuseCache({
			maxEntries: 1024,
			maxBytes: 16_777_216,
			maxEntryBytes: 16_777_216,
			maxAgeMs: 300_000,
		}).limits.maxEntries,
	).toBe(1024);
	expect(
		new ResourceReuseCache({
			maxEntries: 1,
			maxBytes: 1,
			maxEntryBytes: 1,
			maxAgeMs: 1,
		}).limits.maxBytes,
	).toBe(1);
});

it.each(["maxEntries", "maxBytes", "maxEntryBytes", "maxAgeMs"] as const)(
	"rejects invalid numeric values for %s",
	(name) => {
		for (const value of [
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			-Number.POSITIVE_INFINITY,
			2 ** 53,
			"1",
			null,
			undefined,
		])
			invalid(() => new ResourceReuseCache({ [name]: value }));
	},
);

it.each([
	{ maxEntries: 1025 },
	{ maxBytes: 16_777_217 },
	{ maxEntryBytes: 16_777_217 },
	{ maxAgeMs: 300_001 },
	{ maxEntryBytes: 200, maxBytes: 100 },
	{ maxBytes: 100 },
])("rejects inconsistent or over-cap options %j", (options) => {
	invalid(() => new ResourceReuseCache(options));
});

it.each([
	null,
	1,
	"limits",
	[],
	new Date(),
	{ unknown: 1 },
	{ [Symbol("limit")]: 1 },
	Object.create({ maxEntries: 2 }),
	Object.defineProperty({}, "maxEntries", {
		get() {
			throw new Error("must not read an accessor");
		},
	}),
])("rejects invalid options objects %#", (options) => {
	invalid(
		() => new ResourceReuseCache(options as Partial<ResourceReuseCacheOptions>),
	);
});

it("rejects a non-function clock", () => {
	invalid(() => new ResourceReuseCache({}, null as never));
});

it("returns fresh CSS bytes with zero transfer accounting and regenerated Age", () => {
	const { cache, store } = fixture();
	const original = response();
	store(request, original);
	const result = cache.get(request, 1000);
	expect(result).toEqual({
		...original,
		headers: { ...original.headers, age: ["0"] },
		encodedBytes: 0,
		elapsedMs: 0,
		delivery: "memory-cache",
	});
	expect(cache.metrics()).toMatchObject({
		cacheHits: 1,
		cachedDecodedBytes: original.body.byteLength,
		cacheEntries: 1,
	});
});

it.each(imageMediaTypes)(
	"admits supported native image MIME %s",
	(mediaType) => {
		const { cache, store } = fixture();
		const image: ResourceReuseRequest = { ...request, resource: "image" };
		const output = response(image, mediaType);
		output.body = new Uint8Array([0, 128, 255]);
		store(image, output);
		expect(cache.get(image, 3)?.body).toEqual(output.body);
		expect(cache.get(request, 1000)).toBeUndefined();
	},
);

it.each([
	"public, max-age=10",
	'public, max-age="60"',
	'public, max-age="9007199254740"',
	"PUBLIC, MAX-AGE=10, MUST-REVALIDATE",
	"immutable, max-age=00010, public, must-revalidate",
])("accepts explicit freshness policy %s", (policy) => {
	const { cache, store } = fixture();
	store(request, withHeaders({ "cache-control": [policy], vary: undefined }));
	expect(cache.get(request, 1000)).toBeDefined();
});

it.each([
	"text/css",
	'TEXT/CSS; CHARSET="utf-8"',
	'text/css ; charset = utf-8; extra="a;b"',
])("accepts a single valid Content-Type %s", (mediaType) => {
	const { cache, store } = fixture();
	store(request, response(request, mediaType));
	expect(cache.get(request, 1000)).toBeDefined();
});

it.each([
	"",
	"max-age=60",
	"public",
	"public, max-age=0",
	"public, max-age=-1",
	"public, max-age=+1",
	"public, max-age=1.5",
	"public, max-age=1e3",
	'public, max-age="0"',
	'public, max-age="\\0"',
	'public, max-age="9007199254741"',
	'public, max-age="9007199254740991"',
	'public, max-age="9007199254740992"',
	'public, max-age="\\9007199254740992"',
	'public, max-age=""',
	'public, max-age="60',
	'public, max-age=60"',
	'public, max-age="60"x',
	'public, max-age="6"0"',
	'public, max-age="60\\',
	'public, max-age="60\\"',
	'public, max-age="6\\\\0"',
	'public, max-age="6\\"0"',
	'public, max-age="\\x36\\x30"',
	'public, max-age="\\u0036\\u0030"',
	'public, max-age="-1"',
	'public, max-age="+1"',
	'public, max-age="1.5"',
	'public, max-age="1e3"',
	'public, max-age=" 60"',
	'public, max-age="60 "',
	'public, max-age="6\t0"',
	'public, max-age="6\\ 0"',
	'public, max-age="6,0"',
	'public, max-age="６０"',
	'public, max-age="60", MAX-AGE=60',
	'public, max-age=60, max-age="60"',
	'public, max-age="60", max-age="\\6\\0"',
	'max-age="60"',
	'public, max-age="60", private',
	'public, max-age="60", no-cache',
	'public, max-age="60", no-store',
	'public, max-age="60", s-maxage="60"',
	"public, max-age=9007199254740991",
	"public, max-age=9007199254740992",
	"public, max-age=60, private",
	"public, max-age=60, no-cache",
	"public, max-age=60, no-store",
	"public, max-age=60, s-maxage=60",
	"public, max-age=60, stale-if-error=1",
	"public, max-age=60, stale-while-revalidate=1",
	"public, max-age=60, unknown",
	"public, public, max-age=60",
	"public, max-age=60, MAX-AGE=60",
	"public, max-age=60, immutable, immutable",
	"public, max-age=60, must-revalidate, must-revalidate",
	"public=1, max-age=60",
	"public, max-age=60, immutable=1",
	"public, max-age=60, must-revalidate=1",
	"public, max-age=60,",
])("rejects and invalidates a replacement with Cache-Control %s", (policy) => {
	const { cache, store } = fixture();
	store();
	store(request, withHeaders({ "cache-control": [policy] }));
	expect(cache.get(request, 1000)).toBeUndefined();
	expect(cache.metrics()).toMatchObject({
		cacheEntries: 0,
		cacheBytes: 0,
		cacheHits: 0,
	});
});

const deniedHeaders: [string, Record<string, readonly string[] | undefined>][] =
	[
		["missing policy", { "cache-control": undefined }],
		["multiple policies", { "cache-control": ["public", "max-age=60"] }],
		["duplicate policy casing", { "Cache-Control": ["public, max-age=60"] }],
		["cookie", { "set-cookie": ["id=secret"] }],
		["range", { "content-range": ["bytes 0-1/2"] }],
		["authentication", { "www-authenticate": ["Basic"] }],
		["retry", { "retry-after": ["1"] }],
		["missing MIME", { "content-type": undefined }],
		["multiple MIME values", { "content-type": ["text/css", "text/css"] }],
		["combined MIME", { "content-type": ["text/css, text/css"] }],
		["wrong MIME", { "content-type": ["text/html"] }],
		["malformed MIME", { "content-type": ["text/css; invalid"] }],
		["empty MIME parameter", { "content-type": ["text/css; charset="] }],
		[
			"trailing MIME garbage",
			{ "content-type": ['text/css; charset="utf-8"x'] },
		],
		[
			"duplicate MIME parameter",
			{ "content-type": ["text/css; charset=a; Charset=b"] },
		],
		["MIME wildcard", { "content-type": ["text/*"] }],
		["missing Date", { date: undefined }],
		[
			"multiple Dates",
			{ date: [new Date(epoch).toUTCString(), new Date(epoch).toUTCString()] },
		],
		["wrong Date weekday", { date: ["Tue, 14 Sep 2026 12:00:00 GMT"] }],
		["impossible Date", { date: ["Mon, 31 Feb 2026 12:00:00 GMT"] }],
		["obsolete Date", { date: ["Monday, 14-Sep-26 12:00:00 GMT"] }],
		["numeric Date", { date: [String(epoch)] }],
		["non-GMT Date", { date: ["Mon, 14 Sep 2026 12:00:00 UTC"] }],
		["invalid Date hour", { date: ["Mon, 14 Sep 2026 24:00:00 GMT"] }],
		["leap second", { date: ["Mon, 14 Sep 2026 12:00:60 GMT"] }],
		["empty Age", { age: [""] }],
		["negative Age", { age: ["-1"] }],
		["fractional Age", { age: ["0.5"] }],
		["quoted Age", { age: ['"1"'] }],
		["exponential Age", { age: ["1e3"] }],
		["combined Age", { age: ["1, 1"] }],
		["multiple Ages", { age: ["1", "1"] }],
		["unsafe Age", { age: ["9007199254740992"] }],
		["Age multiplication overflow", { age: ["9007199254740991"] }],
		["vary wildcard", { vary: ["*"] }],
		["vary credentials", { vary: ["Cookie"] }],
		["vary extra field", { vary: ["Accept-Encoding, Accept"] }],
		["vary duplicate", { vary: ["Accept-Encoding, accept-encoding"] }],
		["multiple Vary values", { vary: ["Accept-Encoding", "Accept-Encoding"] }],
		["empty Vary", { vary: [""] }],
		["header newline", { "x-example": ["first\r\nsecond"] }],
		["header control", { "x-example": ["first\0second"] }],
		["header non-byte", { "x-example": ["😀"] }],
		["invalid header name", { "bad header": ["value"] }],
		["empty header values", { "x-example": [] }],
	];

it.each(deniedHeaders)(
	"rejects and invalidates %s response metadata",
	(_name, headers) => {
		const { cache, store } = fixture();
		store();
		store(request, withHeaders(headers));
		expect(cache.get(request, 1000)).toBeUndefined();
		expect(cache.metrics().cacheBytes).toBe(0);
	},
);

it.each([
	{ status: 201 },
	{ status: 206 },
	{ status: 304 },
	{ status: 404 },
	{ status: "200" },
	{ routeId: 0 },
	{ delivery: "memory-cache" },
	{ url: "https://fixture.invalid/elsewhere" },
	{ redirects: [{ url: request.url, status: 302, location: request.url }] },
	{ redirects: null },
	{ body: "not bytes" },
	{ body: new Uint16Array([1]) },
	{ headers: null },
	{ encodedBytes: -1 },
	{ encodedBytes: 0.5 },
	{ encodedBytes: Number.MAX_SAFE_INTEGER + 1 },
	{ elapsedMs: Number.NaN },
	{ elapsedMs: Number.POSITIVE_INFINITY },
	{ elapsedMs: -1 },
])("rejects a non-admissible response %#", (patch) => {
	const { cache, store } = fixture();
	store();
	store(request, { ...response(), ...patch } as unknown as NetworkResponse);
	expect(cache.metrics().cacheEntries).toBe(0);
});

it.each(["image/webp", "image/avif", "application/octet-stream", "text/css"])(
	"rejects unsupported image MIME %s",
	(mediaType) => {
		const { cache, store } = fixture();
		const image: ResourceReuseRequest = { ...request, resource: "image" };
		store(image, response(image, mediaType));
		expect(cache.metrics().cacheEntries).toBe(0);
	},
);

it.each([
	"Authorization",
	"Proxy-Authorization",
	"Cookie",
	"Cookie2",
	"Set-Cookie",
	"X-Api-Key",
	"X-Auth-Token",
	"X-Session-Id",
	"X-CSRF-Token",
	"X-XSRF-Token",
	"X-Secret",
	"X-Password",
	"X-Credentials",
	"Range",
	"If-Range",
	"If-Match",
	"If-None-Match",
	"If-Modified-Since",
	"If-Unmodified-Since",
	"Cache-Control",
	"Pragma",
])("denies request header %s even with an empty value", (name) => {
	const { cache, store } = fixture();
	const input = { ...request, headers: { ...request.headers, [name]: "" } };
	store(input);
	expect(cache.get(input, 1000)).toBeUndefined();
	expect(cache.metrics().cacheEntries).toBe(0);
});

it.each([
	{ url: "http://fixture.invalid/main.css", origin: "http://fixture.invalid" },
	{ url: "https://other.invalid/main.css" },
	{ url: "https://user:pass@fixture.invalid/main.css" },
	{ url: "https://fixture.invalid/main.css#part" },
	{ url: "https://fixture.invalid/main.css#" },
	{ url: "https://FIXTURE.invalid/main.css" },
	{ url: "https://fixture.invalid:443/main.css" },
	{ url: "https://fixture.invalid/a/../main.css" },
	{ url: "not a URL" },
	{ url: "/main.css" },
	{ url: "data:text/css,body{}" },
	{ origin: "https://fixture.invalid/" },
	{ origin: "https://FIXTURE.invalid" },
	{ resource: "document" },
	{ resource: "script" },
	{ headers: null },
	{ headers: { accept: "a", Accept: "b" } },
	{ headers: { "bad header": "value" } },
	{ headers: { accept: "text/css\nCookie: secret" } },
	{ headers: { accept: "\0" } },
	{ headers: { accept: 1 } },
])("denies unsafe or noncanonical request %#", (patch) => {
	const { cache, store } = fixture();
	const input = { ...request, ...patch } as unknown as ResourceReuseRequest;
	store(input);
	expect(cache.get(input, 1000)).toBeUndefined();
	expect(cache.metrics().cacheEntries).toBe(0);
});

it("normalizes header case, order and boundary whitespace but preserves values", () => {
	const { cache, store } = fixture();
	store({
		...request,
		headers: { "ACCEPT-ENCODING": "\tidentity ", ACCEPT: " text/css\t" },
	});
	expect(cache.get(request, 1000)).toBeDefined();
	expect(
		cache.get(
			{ ...request, headers: { ...request.headers, accept: "TEXT/CSS" } },
			1000,
		),
	).toBeUndefined();
});

it("keys every header, encoding, query, kind and canonical origin independently", () => {
	const { cache, store } = fixture();
	const variants: ResourceReuseRequest[] = [
		request,
		{ ...request, url: `${request.url}&other=1` },
		{
			...request,
			url: "https://other.invalid/main.css",
			origin: "https://other.invalid",
		},
		{
			...request,
			url: "https://fixture.invalid:8443/main.css",
			origin: "https://fixture.invalid:8443",
		},
		{ ...request, resource: "image" },
		{ ...request, headers: { ...request.headers, "accept-encoding": "gzip" } },
		{ ...request, headers: { accept: "text/css" } },
		{ ...request, headers: { ...request.headers, "x-custom": "first" } },
		{ ...request, headers: { ...request.headers, "accept-language": "en" } },
	];
	for (const [index, variant] of variants.entries()) {
		expect(cache.get(variant, 1000)).toBeUndefined();
		const output = response(
			variant,
			variant.resource === "image" ? "image/png" : "text/css",
		);
		output.body = new Uint8Array([index]);
		store(variant, output);
	}
	for (const [index, variant] of variants.entries())
		expect(cache.get(variant, 1000)?.body).toEqual(new Uint8Array([index]));
	expect(cache.metrics().cacheEntries).toBe(variants.length);
});

it("copies bytes, request metadata, response header arrays and returned metrics", () => {
	const { cache, store } = fixture();
	const input = { ...request, headers: { ...request.headers } };
	const original = response();
	const expected = new Uint8Array(original.body);
	store(input, original);
	input.headers.accept = "mutated";
	input.url = "https://fixture.invalid/mutated";
	original.body.fill(0);
	(original.headers["content-type"] as string[])[0] = "text/html";
	(original.headers.date as string[]).push("invalid");
	const first = cache.get(request, 1000);
	expect(first?.body).toEqual(expected);
	first?.body.fill(255);
	(first?.headers["content-type"] as string[])[0] = "changed";
	(first?.headers.age as string[])[0] = "999";
	(first?.redirects as unknown[]).push({});
	const metrics = cache.metrics();
	metrics.cacheBytes = 0;
	metrics.cacheHits = 99;
	const second = cache.get(request, 1000);
	expect(second?.body).toEqual(expected);
	expect(second?.headers["content-type"]).toEqual(["text/css; charset=utf-8"]);
	expect(second?.headers.age).toEqual(["0"]);
	expect(second?.redirects).toEqual([]);
	expect(cache.metrics().cacheBytes).toBeGreaterThan(0);
	expect(cache.metrics().cacheHits).toBe(2);
});

it("copies Buffer-backed bytes rather than retaining a shared slice", () => {
	const { cache, store } = fixture();
	const output = response();
	output.body = Buffer.from([1, 2, 3]);
	store(request, output);
	output.body.fill(0);
	expect(cache.get(request, 3)?.body).toEqual(new Uint8Array([1, 2, 3]));
});

it.each(["10", '"10"', '"\\1\\0"'])(
	"uses corrected Age, request delay and residence with max-age=%s",
	(argument) => {
		const { cache, advance } = fixture();
		const stamp = cache.start();
		advance(1200, 2300);
		cache.put(
			request,
			withHeaders({
				"cache-control": [`public, max-age=${argument}`],
				age: ["4"],
			}),
			stamp,
		);
		expect(cache.get(request, 1000)?.headers.age).toEqual(["6"]);
		advance(1, 1750);
		expect(cache.get(request, 1000)?.headers.age).toEqual(["8"]);
		advance(1949.5);
		expect(cache.get(request, 1000)?.headers.age).toEqual(["9"]);
		advance(0.5);
		expect(cache.get(request, 1000)).toBeUndefined();
	},
);

it("uses apparent age when it exceeds corrected age", () => {
	const { cache, store, advance } = fixture();
	store(
		request,
		withHeaders({ date: [new Date(epoch - 20_000).toUTCString()], age: ["2"] }),
	);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["20"]);
	advance(1999);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["21"]);
});

it("counts positive wall delay conservatively even when Date is in the future", () => {
	const { cache, advance } = fixture();
	const stamp = cache.start();
	advance(2500, 500);
	cache.put(
		request,
		withHeaders({ date: [new Date(epoch + 10_000).toUTCString()], age: ["1"] }),
		stamp,
	);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["3"]);
});

it("does not trust response elapsedMs in place of the start stamp", () => {
	const { cache, advance } = fixture();
	const stamp = cache.start();
	advance(2100);
	cache.put(request, { ...response(), elapsedMs: 0 }, stamp);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["2"]);
});

it.each(["10", "00010", '"10"', '"00010"', '"\\1\\0"', '"0\\01\\0"'])(
	"expires strictly at equivalent remaining freshness for max-age=%s",
	(argument) => {
		const { cache, store, advance } = fixture();
		store(
			request,
			withHeaders({
				"cache-control": [`public, max-age=${argument}`],
				age: ["8"],
			}),
		);
		advance(1999.5);
		expect(cache.get(request, 1000)?.headers.age).toEqual(["9"]);
		advance(0.5);
		expect(cache.get(request, 1000)).toBeUndefined();
		expect(cache.metrics()).toMatchObject({
			cacheEntries: 0,
			cacheBytes: 0,
			cacheHits: 1,
		});
	},
);

it.each(['"1"', '"\\1"'])(
	"still rejects quoted Age %s with quoted max-age",
	(age) => {
		const { cache, store } = fixture();
		store();
		store(
			request,
			withHeaders({ "cache-control": ['public, max-age="10"'], age: [age] }),
		);
		expect(cache.get(request, 1000)).toBeUndefined();
		expect(cache.metrics().cacheEntries).toBe(0);
	},
);

it("caps local residence rather than discarding otherwise fresh older responses", () => {
	const { cache, store, advance } = fixture({ maxAgeMs: 1000 });
	store(request, withHeaders({ age: ["100"] }));
	advance(999);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["100"]);
	advance(1);
	expect(cache.get(request, 1000)).toBeUndefined();
});

it("applies the default local lifetime to year-long public resources", () => {
	const { cache, store, advance } = fixture();
	store();
	advance(59_999);
	expect(cache.get(request, 1000)).toBeDefined();
	advance(1);
	expect(cache.metrics()).toMatchObject({ cacheEntries: 0, cacheBytes: 0 });
});

it.each(["age", "date", "delay"])(
	"does not admit an already stale response due to %s",
	(cause) => {
		const { cache, advance } = fixture();
		const stamp = cache.start();
		const output = withHeaders({
			"cache-control": ["public, max-age=10"],
			...(cause === "age" ? { age: ["10"] } : {}),
			...(cause === "date"
				? { date: [new Date(epoch - 10_000).toUTCString()] }
				: {}),
		});
		if (cause === "delay") advance(10_000);
		cache.put(request, output, stamp);
		expect(cache.metrics().cacheEntries).toBe(0);
	},
);

it("uses monotonic residence after admission even when wall time jumps ahead", () => {
	const { cache, store, advance } = fixture();
	store();
	advance(86_400_000, 1000);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["1"]);
});

it.each(["wallMs", "monotonicMs"] as const)(
	"fails closed permanently after %s rollback",
	(field) => {
		const { cache, store, clock, advance } = fixture();
		store();
		const pending = cache.start();
		advance(100);
		expect(cache.get(request, 1000)).toBeDefined();
		clock[field] -= 1;
		expect(cache.get(request, 1000)).toBeUndefined();
		advance(1000);
		cache.put(request, response(), pending);
		cache.clear();
		store();
		expect(cache.get(request, 1000)).toBeUndefined();
		expect(cache.metrics()).toMatchObject({
			cacheEntries: 0,
			cacheBytes: 0,
			cacheHits: 1,
		});
	},
);

it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	-1,
	Number.MAX_SAFE_INTEGER + 1,
])("fails closed on invalid clock value %s", (value) => {
	for (const field of ["wallMs", "monotonicMs"] as const) {
		const { cache, store, clock } = fixture();
		store();
		clock[field] = value;
		expect(cache.get(request, 1000)).toBeUndefined();
		clock[field] = field === "wallMs" ? epoch : 1000;
		store();
		expect(cache.metrics().cacheEntries).toBe(0);
	}
});

it("fails closed on a throwing or malformed clock", () => {
	for (const now of [
		() => {
			throw new Error("clock");
		},
		() => null as never,
	]) {
		const cache = new ResourceReuseCache({}, now);
		expect(() => cache.start()).not.toThrow();
		expect(cache.get(request, 1000)).toBeUndefined();
	}
});

it("rejects overflowing Date and Age arithmetic", () => {
	const { cache, clock } = fixture();
	clock.wallMs = Number.MAX_SAFE_INTEGER;
	const stamp = cache.start();
	cache.put(
		request,
		withHeaders({ date: [new Date(-86_400_000).toUTCString()] }),
		stamp,
	);
	expect(cache.metrics().cacheEntries).toBe(0);
	const second = fixture({ maxAgeMs: 300_000 });
	const started = second.cache.start();
	second.advance(10_000);
	second.cache.put(
		request,
		withHeaders({
			age: ["9007199254739"],
			"cache-control": ["public, max-age=9007199254740"],
		}),
		started,
	);
	expect(second.cache.metrics().cacheEntries).toBe(0);
});

it("keeps Age arithmetic ordered near the monotonic numeric ceiling", () => {
	const { cache, clock, store } = fixture();
	clock.monotonicMs = Number.MAX_SAFE_INTEGER - 100;
	store(
		request,
		withHeaders({
			age: ["9007199254738"],
			"cache-control": ["public, max-age=9007199254740"],
		}),
	);
	expect(cache.get(request, 1000)?.headers.age).toEqual(["9007199254738"]);
});

it("honors smaller caller caps without counting misses or evicting usable bytes", () => {
	const { cache, store } = fixture();
	store();
	const length = response().body.byteLength;
	expect(cache.get(request, length - 1)).toBeUndefined();
	expect(cache.metrics()).toMatchObject({
		cacheHits: 0,
		cachedDecodedBytes: 0,
		cacheEntries: 1,
	});
	expect(cache.get(request, length)?.body.byteLength).toBe(length);
	expect(cache.get(request, length)?.body.byteLength).toBe(length);
	expect(cache.metrics()).toMatchObject({
		cacheHits: 2,
		cachedDecodedBytes: length * 2,
	});
});

it.each([
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	undefined,
	"10",
])("validates caller byte cap %s", (value) => {
	const { cache } = fixture();
	invalid(() => cache.get(request, value as number));
	cache.close();
	invalid(() => cache.get(request, value as number));
});

it("accepts a zero-byte caller cap without serving a nonempty body", () => {
	const { cache, store } = fixture();
	store();
	expect(cache.get(request, 0)).toBeUndefined();
	expect(cache.metrics().cacheHits).toBe(0);
	store(request, { ...response(), body: new Uint8Array() });
	expect(cache.get(request, 0)?.body).toEqual(new Uint8Array());
	expect(cache.metrics().cacheHits).toBe(1);
	cache.close();
	expect(cache.get(request, 0)).toBeUndefined();
});

it("admits empty bytes and enforces the decoded entry body ceiling", () => {
	const { cache, store } = fixture({ maxEntryBytes: 2 });
	store(request, { ...response(), body: new Uint8Array() });
	expect(cache.get(request, 1)?.body.byteLength).toBe(0);
	expect(cache.metrics()).toMatchObject({
		cacheHits: 1,
		cachedDecodedBytes: 0,
	});
	store(request, { ...response(), body: new Uint8Array(2) });
	expect(cache.get(request, 2)?.body.byteLength).toBe(2);
	store(request, { ...response(), body: new Uint8Array(3) });
	expect(cache.metrics().cacheEntries).toBe(0);
});

it("evicts deterministically in FIFO order even when the oldest entry was served", () => {
	const { cache, store } = fixture({ maxEntries: 2 });
	const second = { ...request, url: `${request.url}&n=2` };
	const third = { ...request, url: `${request.url}&n=3` };
	store();
	store(second);
	expect(cache.get(request, 1000)).toBeDefined();
	store(third);
	expect(cache.get(request, 1000)).toBeUndefined();
	expect(cache.get(second, 1000)).toBeDefined();
	expect(cache.get(third, 1000)).toBeDefined();
	expect(cache.metrics().cacheEntries).toBe(2);
});

it("charges metadata plus decoded bodies against the byte budget exactly", () => {
	const measured = fixture();
	measured.store();
	const bytes = measured.cache.metrics().cacheBytes;
	expect(bytes).toBeGreaterThan(response().body.byteLength);
	const exact = fixture({ maxBytes: bytes, maxEntryBytes: 100 });
	exact.store();
	expect(exact.cache.metrics().cacheBytes).toBe(bytes);
	const small = fixture({ maxBytes: bytes - 1, maxEntryBytes: 100 });
	small.store();
	expect(small.cache.metrics().cacheBytes).toBe(0);
	const second = { ...request, url: request.url.replace("v=1", "v=2") };
	exact.store(second);
	expect(exact.cache.get(request, 1000)).toBeUndefined();
	expect(exact.cache.get(second, 1000)).toBeDefined();
	expect(exact.cache.metrics().cacheBytes).toBe(bytes);
});

it("does not evict unrelated entries to attempt an individually oversized admission", () => {
	const { cache, store } = fixture({ maxBytes: 2000, maxEntryBytes: 2000 });
	store();
	const second = { ...request, url: request.url.replace("v=1", "v=2") };
	store(second, { ...response(second), body: new Uint8Array(2000) });
	expect(cache.get(request, 1000)).toBeDefined();
	expect(cache.metrics().cacheEntries).toBe(1);
});

it.each([
	"url",
	"request value",
	"request count",
	"request total",
	"response value",
	"response count",
	"response total",
	"response arrays",
])("bounds %s metadata independently of body size", (kind) => {
	const { cache, store } = fixture();
	const input = { ...request };
	let output = response();
	if (kind === "url") input.url += "a".repeat(4096);
	if (kind === "request value") input.headers = { extra: "a".repeat(8193) };
	if (kind === "request count")
		input.headers = Object.fromEntries(
			Array.from({ length: 65 }, (_, index) => [`x-${index}`, ""]),
		);
	if (kind === "request total")
		input.headers = Object.fromEntries(
			Array.from({ length: 4 }, (_, index) => [`x-${index}`, "a".repeat(8192)]),
		);
	if (kind === "response value")
		output = withHeaders({ extra: ["a".repeat(8193)] });
	if (kind === "response count")
		output = withHeaders(
			Object.fromEntries(
				Array.from({ length: 65 }, (_, index) => [`x-${index}`, [""]]),
			),
		);
	if (kind === "response total")
		output = withHeaders({ extra: Array(4).fill("a".repeat(8192)) });
	if (kind === "response arrays")
		output = withHeaders({ extra: Array(17).fill("") });
	output.url = input.url;
	store(input, output);
	expect(cache.metrics().cacheEntries).toBe(0);
});

it("purges expired entries on unrelated reads, puts, starts and metrics", () => {
	for (const operation of ["get", "put", "start", "metrics"]) {
		const { cache, store, advance } = fixture({ maxAgeMs: 1 });
		store();
		advance(1);
		if (operation === "get")
			cache.get({ ...request, url: `${request.url}&absent` }, 1000);
		if (operation === "put")
			cache.put(request, response(), {} as ResourceReuseStamp);
		if (operation === "start") cache.start();
		expect(cache.metrics()).toMatchObject({
			cacheEntries: 0,
			cacheBytes: 0,
			cacheHits: 0,
		});
	}
});

it("replaces completed values without collapsing independently stamped requests", () => {
	const { cache } = fixture();
	const first = cache.start();
	const second = cache.start();
	expect(cache.get(request, 1000)).toBeUndefined();
	cache.put(request, response(), first);
	const bytes = cache.metrics().cacheBytes;
	cache.put(request, response(), second);
	expect(cache.metrics()).toMatchObject({ cacheEntries: 1, cacheBytes: bytes });
	expect(cache.get(request, 1000)).toBeDefined();
});

it("clear rejects late inserts, preserves counters and allows a new generation", () => {
	const { cache, store } = fixture();
	store();
	cache.get(request, 1000);
	const pending = cache.start();
	expect(Object.isFrozen(pending)).toBe(true);
	cache.clear();
	expect(cache.start().generation).toBe(pending.generation + 1);
	cache.put(request, response(), pending);
	expect(cache.get(request, 1000)).toBeUndefined();
	expect(cache.metrics()).toEqual({
		cacheEntries: 0,
		cacheBytes: 0,
		cacheHits: 1,
		cachedDecodedBytes: response().body.byteLength,
	});
	store();
	expect(cache.get(request, 1000)).toBeDefined();
});

it("close is terminal and idempotent for old and newly started work", () => {
	const { cache, store } = fixture();
	store();
	const pending = cache.start();
	cache.close();
	const closedGeneration = cache.start().generation;
	expect(closedGeneration).toBe(pending.generation + 1);
	cache.close();
	expect(cache.start().generation).toBe(closedGeneration);
	cache.put(request, response(), pending);
	store();
	cache.clear();
	store();
	expect(cache.get(request, 1000)).toBeUndefined();
	expect(cache.metrics()).toMatchObject({ cacheEntries: 0, cacheBytes: 0 });
});

it("rejects forged, cross-cache, consumed and malformed stamps", () => {
	const { cache } = fixture();
	const original = cache.start();
	const other = fixture().cache.start();
	for (const stamp of [
		null,
		{},
		{ ...original },
		other,
		{ ...original, wallMs: Number.NaN },
		{ ...original, generation: -1 },
	]) {
		cache.put(request, response(), stamp as ResourceReuseStamp);
		expect(cache.metrics().cacheEntries).toBe(0);
	}
	cache.put(request, response(), original);
	expect(cache.get(request, 1000)).toBeDefined();
	cache.put(request, response(), original);
	expect(cache.get(request, 1000)).toBeDefined();
});

it("does not let a pre-clear response invalidate a newer generation", () => {
	const { cache, store } = fixture();
	const pending = cache.start();
	cache.clear();
	store();
	cache.put(request, { ...response(), status: 404 }, pending);
	expect(cache.get(request, 1000)).toBeDefined();
});
