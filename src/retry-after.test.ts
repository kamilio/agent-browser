import { afterEach, expect, it, vi } from "vitest";
import { parseRetryAfter, retryAfterLimits } from "./retry-after.js";

const receivedAt = Date.UTC(2026, 8, 11, 12);

function parse(value: string | readonly string[], now = receivedAt) {
	return parseRetryAfter({ "retry-after": value }, now);
}

afterEach(() => vi.restoreAllMocks());

it.each(["0", "30", "86400", "00030", "\t42 "])(
	"retains bounded decimal advice %j without sleeping",
	(value) => {
		const result = parse(value);
		expect(result).toEqual({
			kind: "delay-seconds",
			delaySeconds: Number(value),
			retryAt: new Date(receivedAt + Number(value) * 1000).toISOString(),
		});
		expect(Object.isFrozen(result)).toBe(true);
	},
);

it.each([
	"86401",
	"9".repeat(128),
	"-1",
	"+1",
	"1.5",
	"1e3",
	"0x10",
	"",
	"30, 30",
	"30\r\n",
	"\u00a030",
	"٣٠",
	"30\0",
	"0".repeat(129),
])(
	"ignores invalid or over-limit delay %j rather than shortening it",
	(value) => {
		expect(parse(value)).toBeUndefined();
	},
);

it.each([
	"Fri, 11 Sep 2026 12:00:30 GMT",
	"Friday, 11-Sep-26 12:00:30 GMT",
	"Fri Sep 11 12:00:30 2026",
])("interprets supported HTTP-date syntax %s", (value) => {
	expect(parse(value)).toEqual({
		kind: "http-date",
		delaySeconds: 30,
		retryAt: "2026-09-11T12:00:30.000Z",
	});
	expect(parse(value, receivedAt + 500)?.delaySeconds).toBe(30);
});

it.each([
	"Sun, 06 Nov 1994 08:49:37 GMT",
	"Sunday, 06-Nov-94 08:49:37 GMT",
	"Sun Nov  6 08:49:37 1994",
	"Sun Nov 06 08:49:37 1994",
])("reports expired dates %s as zero-delay metadata", (value) => {
	expect(parse(value)).toEqual({
		kind: "http-date",
		delaySeconds: 0,
		retryAt: "1994-11-06T08:49:37.000Z",
	});
});

it("keeps an exactly one-day date but ignores a longer instruction", () => {
	expect(parse("Sat, 12 Sep 2026 12:00:00 GMT")?.delaySeconds).toBe(86400);
	expect(parse("Sat, 12 Sep 2026 12:00:01 GMT")).toBeUndefined();
});

it.each([
	"Thu, 11 Sep 2026 12:00:30 GMT",
	"Fri, 11 SEP 2026 12:00:30 GMT",
	"Fri, 11 Sep 2026 12:00:30 gmt",
	"Fri, 11 Sep 2026 12:00:30 UTC",
	"Fri, 11 Sep 2026 12:00:30 +0000",
	"Fri, 11 Sep 2026 24:00:00 GMT",
	"Fri, 11 Sep 2026 12:60:00 GMT",
	"Fri, 11 Sep 2026 12:00:61 GMT",
	"Fri, 11 Sep 2026 12:00:60 GMT",
	"Fri, 11 Sep 2026 23:58:60 GMT",
	"Fri, 00 Sep 2026 12:00:00 GMT",
	"Fri, 31 Sep 2026 12:00:00 GMT",
	"Sun, 29 Feb 2026 12:00:00 GMT",
	"Fri, 11 Xxx 2026 12:00:00 GMT",
	"Friday, 11-Sep-2026 12:00:30 GMT",
	"Fri Sep 6 12:00:30 2026",
	"2026-09-11T12:00:30Z",
	"Fri, 11 Sep 2026 12:00:30 GMT trailing",
])("does not accept malformed or inconsistent date %s", (value) => {
	expect(parse(value)).toBeUndefined();
});

it("normalizes an HTTP leap second to the next representable UTC second", () => {
	expect(
		parse(
			"Sat, 31 Dec 2016 23:59:60 GMT",
			Date.UTC(2016, 11, 31, 23, 59, 58, 500),
		),
	).toEqual({
		kind: "http-date",
		delaySeconds: 2,
		retryAt: "2017-01-01T00:00:00.000Z",
	});
});

it("retains Gregorian leap days and rejects normalization of nonexistent dates", () => {
	expect(parse("Thu, 29 Feb 2024 12:00:00 GMT")?.retryAt).toBe(
		"2024-02-29T12:00:00.000Z",
	);
	expect(parse("Thu, 30 Feb 2024 12:00:00 GMT")).toBeUndefined();
});

it("includes leap-second normalization when applying the 50-year boundary", () => {
	expect(
		parse("Friday, 31-Dec-76 23:59:60 GMT", Date.UTC(2026, 11, 31, 23, 59, 59))
			?.retryAt,
	).toBe("1977-01-01T00:00:00.000Z");
});

it.each([
	{
		reference: Date.UTC(2026, 8, 11, 12),
		year: 1976,
		month: 8,
		day: 11,
		second: 1,
	},
	{
		reference: Date.UTC(2026, 8, 11, 12),
		year: 1977,
		month: 0,
		day: 1,
		second: 0,
	},
	{
		reference: Date.UTC(2094, 0, 1, 12),
		year: 2094,
		month: 0,
		day: 1,
		second: 30,
	},
	{
		reference: Date.UTC(2099, 11, 31, 23, 59, 50),
		year: 2100,
		month: 0,
		day: 1,
		second: 0,
	},
	{
		reference: Date.UTC(2106, 0, 1, 12),
		year: 2106,
		month: 0,
		day: 1,
		second: 30,
	},
])(
	"uses the obsolete-date 50-year interpretation around $year",
	({ reference, year, month, day, second }) => {
		const target = new Date(Date.UTC(year, month, day, 12, 0, second));
		const weekdays = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const parts = target.toUTCString().split(" ");
		const value = `${weekdays[target.getUTCDay()]}, ${parts[1]}-${parts[2]}-${String(year).slice(-2)} ${parts[4]} GMT`;
		expect(parse(value, reference)?.retryAt).toBe(target.toISOString());
	},
);

it("does not reinterpret a next-century date as an old expired date", () => {
	const target = new Date(Date.UTC(2106, 0, 1, 12));
	const weekdays = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	const value = `${weekdays[target.getUTCDay()]}, 01-Jan-06 12:00:00 GMT`;
	expect(parse(value, Date.UTC(2094, 0, 1, 12))).toBeUndefined();
});

it("accepts identical duplicates after OWS normalization but not ambiguity", () => {
	expect(
		parseRetryAfter(
			{ "Retry-After": " 30", "retry-after": ["30\t"] },
			receivedAt,
		),
	).toEqual(parse("30"));
	expect(parse(["30", "31"])).toBeUndefined();
	expect(parse(["30", "030"])).toBeUndefined();
	expect(parse(["30", "Fri, 11 Sep 2026 12:00:30 GMT"])).toBeUndefined();
});

it("applies header-name, value-count and field-length limits", () => {
	expect(retryAfterLimits).toEqual({
		maxHeaderNames: 128,
		maxValues: 16,
		maxValueCodeUnits: 128,
		maxDelaySeconds: 86400,
	});
	expect(Object.isFrozen(retryAfterLimits)).toBe(true);
	expect(parse(Array(16).fill("30"))).toEqual(parse("30"));
	expect(parse(Array(17).fill("30"))).toBeUndefined();
	const headers = Object.fromEntries(
		Array.from({ length: 127 }, (_, index) => [`x-${index}`, "unused"]),
	);
	expect(
		parseRetryAfter({ ...headers, "retry-after": "30" }, receivedAt),
	).toEqual(parse("30"));
	expect(
		parseRetryAfter(
			{ ...headers, extra: "unused", "retry-after": "30" },
			receivedAt,
		),
	).toBeUndefined();
});

it("uses only own data properties without coercion or getter calls", () => {
	const trap = vi.fn(() => {
		throw new Error("PRIVATE_HEADER");
	});
	const header = Object.defineProperty({}, "retry-after", { get: trap });
	const values = Object.defineProperty(["30"], "0", { get: trap });
	expect(parseRetryAfter(header, receivedAt)).toBeUndefined();
	expect(parse(values)).toBeUndefined();
	expect(
		parseRetryAfter({ "retry-after": { toString: trap } } as never, receivedAt),
	).toBeUndefined();
	expect(
		parseRetryAfter(Object.create({ "retry-after": "30" }), receivedAt),
	).toBeUndefined();
	expect(
		parseRetryAfter(
			{ [Symbol("private")]: "30", "retry-after": "30" },
			receivedAt,
		),
	).toBeUndefined();
	expect(parse(Array(1))).toBeUndefined();
	expect(trap).not.toHaveBeenCalled();
});

it.each([null, [], false, "30"])("ignores non-record headers %j", (headers) => {
	expect(parseRetryAfter(headers as never, receivedAt)).toBeUndefined();
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 8.65e15])(
	"rejects an invalid reference time %s",
	(now) => {
		expect(parse("30", now)).toBeUndefined();
	},
);

it("does not consult an implicit clock or mutate caller-owned headers", () => {
	vi.spyOn(Date, "now").mockImplementation(() => {
		throw new Error("Unexpected clock read");
	});
	const values = Object.freeze(["30"]);
	const headers = Object.freeze({ "retry-after": values });
	expect(parseRetryAfter(headers, receivedAt)?.delaySeconds).toBe(30);
	expect(headers["retry-after"]).toBe(values);
});
