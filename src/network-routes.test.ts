import { expect, it } from "vitest";
import { NetworkRoutes, type RouteFulfillment } from "./network-routes.js";
import { RoutePattern } from "./route-pattern.js";

it.each([
	["**/api/users", "https://example.com/api/users", true],
	["**/api/users", "https://example.com/api/users/extra", false],
	["**/api/*/details", "https://example.com/api/one/details", true],
	["**/api/*/details", "https://example.com/api/one/two/details", false],
	["**/*.{png,jpg,jpeg}", "https://example.com/image.jpeg", true],
	["**/*.{png,jpg,jpeg}", "https://example.com/image.svg", false],
	["https://example.com/**/file", "https://example.com/file", true],
	["https://example.com/**/file", "https://example.com/a/b/file", true],
	["https://example.com/**/file", "https://example.com/afile", false],
	["**/search?q=*", "https://example.com/search?q=hello", true],
	["**/search?q=*", "https://example.com/searchXq=hello", false],
	["**/literal\\*", "https://example.com/literal*", true],
	["**/{a,{b,c}}", "https://example.com/c", true],
	["https://EXAMPLE.COM:443/", "https://example.com/", true],
])(
	"matches bounded whole-URL globs: %s against %s",
	(pattern, url, expected) => {
		let work = 0;
		expect(
			new RoutePattern(pattern as string).matches(url as string, (steps) => {
				work += steps;
			}),
		).toBe(expected);
		expect(work).toBeGreaterThan(0);
	},
);

it.each([
	"",
	"**/{a",
	"**/a}",
	"**/{a,}",
	"**/{a}",
	"**/trailing\\",
	"a".repeat(513),
	"bad\npattern",
])("rejects malformed glob %s", (pattern) => {
	expect(() => new RoutePattern(pattern)).toThrow();
});

it("bounds expanded alternatives and matching work rather than using user regexes", () => {
	expect(() => new RoutePattern("{a,b}".repeat(6))).toThrow("expansion limit");
	const routes = new NetworkRoutes({ maxMatchSteps: 10 });
	routes.add("**/data", { body: "mock" });
	expect(() => routes.fulfill({ url: "https://example.com/data" })).toThrow(
		"matching work",
	);
	expect(routes.metrics().fulfilled).toBe(0);
});

it("matches a bounded independent regex oracle for small wildcard combinations", () => {
	const values = [""];
	for (let length = 1; length <= 4; length++)
		for (const prefix of values.filter((value) => value.length === length - 1))
			for (const character of ["a", "b", "/"]) values.push(prefix + character);
	for (const first of ["a", "b", "*", "**", "/"])
		for (const second of ["a", "b", "*", "**", "/"])
			for (const third of ["a", "b", "*", "**", "/"]) {
				const pattern = first + second + third;
				const expression = pattern
					.replace(/\*{2,}\//g, "\u0001")
					.replace(/\*{2,}/g, "\u0002")
					.replace(/\*/g, "[^/]*")
					.replaceAll("\u0001", "(?:.*/)?")
					.replaceAll("\u0002", ".*");
				const oracle = new RegExp(`^(?:${expression})$`);
				const compiled = new RoutePattern(pattern);
				for (const value of values)
					expect(
						compiled.matches(value, () => {}),
						`${pattern} against ${value}`,
					).toBe(oracle.test(value));
			}
});

it("fulfills newest matching rules, returns detached data and removes all exact-pattern duplicates", () => {
	const routes = new NetworkRoutes();
	const broad = routes.add("**/*", { status: 404 });
	routes.add("**/data", { body: "old" });
	const newest = routes.add("**/data", {
		body: "new",
		contentType: "application/json",
	});
	const response = routes.fulfill({ url: "https://example.com/data#fragment" });
	expect(response).toMatchObject({
		status: 200,
		url: "https://example.com/data",
		routeId: newest.id,
		encodedBytes: 0,
	});
	expect(new TextDecoder().decode(response?.body)).toBe("new");
	response?.body.fill(0);
	(response?.headers["content-type"] as string[]).push("mutated");
	expect(
		new TextDecoder().decode(
			routes.fulfill({ url: "https://example.com/data" })?.body,
		),
	).toBe("new");
	expect(routes.list()[2].contentType).toBe("application/json");
	expect(routes.remove("**/data")).toBe(2);
	expect(routes.fulfill({ url: "https://example.com/data" })?.routeId).toBe(
		broad.id,
	);
	expect(routes.remove()).toBe(1);
	expect(routes.fulfill({ url: "https://example.com/data" })).toBeUndefined();
	expect(routes.metrics().retainedBytes).toBe(0);
});

it("preserves route state when an invalid or over-budget registration fails", () => {
	const routes = new NetworkRoutes({ maxRoutes: 1, maxBodyBytes: 4 });
	routes.add("**/*", { body: "okay" });
	const before = routes.list();
	const invalidOptions: RouteFulfillment[] = [
		{ body: "large" },
		{ status: 101 },
		{ body: "x", status: 204 },
		{ body: "x", headers: { "Content-Length": "1" } },
		{ body: "x", headers: { "Set-Cookie": "private=1" } },
	];
	for (const options of invalidOptions)
		expect(() => routes.add("**/*", options)).toThrow();
	expect(() => routes.add("**/another", { body: "new" })).toThrow(
		"retention limit",
	);
	expect(routes.list()).toEqual(before);
	expect(() =>
		new NetworkRoutes({ maxBodyBytes: 1 }).add("**/*", { body: "é" }),
	).toThrow("body limit");
});

it("requires real fulfillment instead of silently ignoring rewrite-only options", () => {
	const routes = new NetworkRoutes();
	expect(() => routes.add("**/*", {})).toThrow("request rewriting");
	expect(() => routes.add("**/*", { headers: { "X-Test": "value" } })).toThrow(
		"request rewriting",
	);
	expect(() =>
		routes.add("**/*", {
			body: "",
			contentType: "text/plain\r\nInjected: value",
		}),
	).toThrow("header");
});

it("retains a single redirect Location without following it inside the rule table", () => {
	const routes = new NetworkRoutes();
	routes.add("**/start", {
		status: 302,
		headers: { Location: " /next?value=one " },
	});
	expect(routes.fulfill({ url: "https://example.com/start" })).toMatchObject({
		status: 302,
		headers: { location: ["/next?value=one"] },
		redirects: [],
		routeId: 1,
	});
	const before = routes.list();
	expect(() =>
		routes.add("**/ambiguous", {
			status: 302,
			headers: { Location: "/one", location: "/two" },
		}),
	).toThrow("Location");
	expect(routes.list()).toEqual(before);
});

it("honors HEAD and null-body statuses while retaining bounded lifetime delivery accounting", () => {
	const routes = new NetworkRoutes({ maxFulfilled: 2, maxServedBytes: 4 });
	routes.add("**/*", { body: "four" });
	expect(
		routes.fulfill({ url: "https://example.com/", method: "HEAD" })?.body,
	).toHaveLength(0);
	expect(routes.fulfill({ url: "https://example.com/" })?.body).toHaveLength(4);
	routes.remove();
	routes.add("**/*", { status: 204 });
	expect(() => routes.fulfill({ url: "https://example.com/" })).toThrow(
		"delivery limit",
	);
	expect(routes.metrics()).toMatchObject({ fulfilled: 2, servedBytes: 4 });
});

it("bounds retained and cumulative response bytes independently", () => {
	expect(() =>
		new NetworkRoutes({ maxRetainedBytes: 1 }).add("**/*", { body: "" }),
	).toThrow("retention limit");
	const routes = new NetworkRoutes({ maxServedBytes: 3 });
	routes.add("**/*", { body: "four" });
	expect(() => routes.fulfill({ url: "https://example.com/" })).toThrow(
		"delivery limit",
	);
	expect(routes.metrics().fulfilled).toBe(0);
});

it("rejects canceled and invalid requests without consuming mock delivery budgets, and revokes on close", () => {
	const routes = new NetworkRoutes();
	routes.add("**/*", { body: "mock" });
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		routes.fulfill({ url: "https://example.com/", signal: controller.signal }),
	).toThrow("aborted");
	expect(() => routes.fulfill({ url: "file:///private" })).toThrow();
	expect(() =>
		routes.fulfill({ url: "https://user:secret@example.com/" }),
	).toThrow();
	expect(routes.metrics().fulfilled).toBe(0);
	routes.close();
	routes.close();
	expect(routes.metrics()).toMatchObject({
		routes: 0,
		retainedBytes: 0,
		closed: true,
	});
	expect(() => routes.list()).toThrow("closed");
	expect(() => routes.remove()).toThrow("closed");
	expect(() => routes.add("**/*", { body: "" })).toThrow("closed");
	expect(() => routes.fulfill({ url: "https://example.com/" })).toThrow(
		"closed",
	);
});
