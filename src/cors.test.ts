import { expect, it } from "vitest";
import {
	checkCors,
	checkPreflight,
	corsResponseHeaders,
	unsafeCorsHeaders,
} from "./cors.js";

const origin = "https://page.example";
it("identifies safelisted values, MIME types, ranges and unsafe bytes", () => {
	expect(
		unsafeCorsHeaders({
			accept: "application/json",
			"accept-language": "en-US,en;q=0.9",
			"content-type": "text/plain;charset=UTF-8",
			range: "bytes=0-9",
		}),
	).toEqual([]);
	const unsafe: Record<string, string>[] = [
		{ "content-type": "application/json" },
		{ accept: "text/html:bad" },
		{ "accept-language": "en_US" },
		{ range: "bytes=-10" },
		{ range: "bytes=9-0" },
		{ accept: "x".repeat(129) },
	];
	for (const headers of unsafe)
		expect(unsafeCorsHeaders(headers)).toHaveLength(1);
	expect(
		unsafeCorsHeaders({
			authorization: "Bearer fixture",
			"x-z": "z",
			"x-a": "a",
		}),
	).toEqual(["authorization", "x-a", "x-z"]);
});

it("requires a single matching origin and exact credential approval", () => {
	expect(() =>
		checkCors({ "access-control-allow-origin": "*" }, origin, "omit"),
	).not.toThrow();
	expect(() =>
		checkCors({ "access-control-allow-origin": origin }, origin, "same-origin"),
	).not.toThrow();
	expect(() =>
		checkCors(
			{
				"access-control-allow-origin": "null",
				"access-control-allow-credentials": "true",
			},
			"null",
			"include",
		),
	).not.toThrow();
	const denied: Record<string, string>[] = [
		{},
		{ "access-control-allow-origin": "*" },
		{ "access-control-allow-origin": `${origin}, ${origin}` },
		{
			"access-control-allow-origin": origin,
			"access-control-allow-credentials": "True",
		},
	];
	for (const headers of denied)
		expect(() => checkCors(headers, origin, "include")).toThrow("CORS");
});

it("checks preflight method/header permission without letting wildcards authorize credentials or Authorization", () => {
	const allowed = {
		"access-control-allow-origin": origin,
		"access-control-allow-methods": "PUT",
		"access-control-allow-headers": "x-client, AUTHORIZATION",
	};
	expect(() =>
		checkPreflight(204, allowed, origin, "omit", "PUT", [
			"authorization",
			"x-client",
		]),
	).not.toThrow();
	expect(() =>
		checkPreflight(403, allowed, origin, "omit", "PUT", []),
	).toThrow();
	expect(() =>
		checkPreflight(204, allowed, origin, "omit", "DELETE", []),
	).toThrow();
	const wildcard = {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "*",
		"access-control-allow-headers": "*",
	};
	expect(() =>
		checkPreflight(200, wildcard, origin, "omit", "PATCH", ["x-client"]),
	).not.toThrow();
	expect(() =>
		checkPreflight(200, wildcard, origin, "omit", "GET", ["authorization"]),
	).toThrow();
	expect(() =>
		checkPreflight(
			200,
			{
				...wildcard,
				"access-control-allow-origin": origin,
				"access-control-allow-credentials": "true",
			},
			origin,
			"include",
			"PATCH",
			["x-client"],
		),
	).toThrow();
});

it("permits safelisted methods without an allow-methods field but still requires unsafe headers", () => {
	const headers = {
		"access-control-allow-origin": origin,
		"access-control-allow-headers": "x-client",
	};
	expect(() =>
		checkPreflight(200, headers, origin, "omit", "POST", ["x-client"]),
	).not.toThrow();
	expect(() =>
		checkPreflight(200, headers, origin, "omit", "POST", ["other"]),
	).toThrow();
});

it("filters response headers, implements expose wildcards and never exposes cookies or prototype members", () => {
	const headers = {
		"content-type": "application/json",
		"x-visible": "yes",
		"x-hidden": "no",
		"set-cookie": "secret",
		"access-control-expose-headers": "X-Visible, Set-Cookie",
	};
	expect(corsResponseHeaders(headers, "omit")).toEqual({
		"content-type": "application/json",
		"x-visible": "yes",
	});
	const wildcard = { ...headers, "access-control-expose-headers": "*" };
	expect(corsResponseHeaders(wildcard, "omit")["x-hidden"]).toBe("no");
	expect(corsResponseHeaders(wildcard, "include")["x-hidden"]).toBeUndefined();
	expect(corsResponseHeaders(wildcard, "omit")["set-cookie"]).toBeUndefined();
	expect(Object.getPrototypeOf(corsResponseHeaders({}, "omit"))).toBeNull();
});

it("does not accept inherited permission headers or malformed permission lists", () => {
	expect(() =>
		checkCors(
			Object.create({ "access-control-allow-origin": "*" }),
			origin,
			"omit",
		),
	).toThrow("CORS");
	expect(() =>
		checkPreflight(
			200,
			{
				"access-control-allow-origin": "*",
				"access-control-allow-methods": "PUT, bad token",
			},
			origin,
			"omit",
			"PUT",
			[],
		),
	).toThrow("CORS");
	expect(
		corsResponseHeaders(
			{
				"content-type": "text/plain",
				private: "hidden",
				"access-control-expose-headers": "private, invalid token",
			},
			"omit",
		),
	).toEqual({ "content-type": "text/plain" });
});
