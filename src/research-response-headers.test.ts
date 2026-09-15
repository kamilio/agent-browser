import { expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import {
	captureResearchResponseHeaders,
	researchResponseHeaderLimits,
	researchResponseHeaderNames,
} from "./research-response-headers.js";

it("exports the fixed, immutable selection and budgets", () => {
	expect(researchResponseHeaderNames).toEqual([
		"content-type",
		"content-length",
		"content-encoding",
		"cf-mitigated",
		"retry-after",
	]);
	expect(researchResponseHeaderLimits).toEqual({
		maxValues: 16,
		maxValueCodeUnits: 160,
	});
	expect(Object.isFrozen(researchResponseHeaderNames)).toBe(true);
	expect(Object.isFrozen(researchResponseHeaderLimits)).toBe(true);
});

it("preserves all selected values, whitespace, duplicates and conflicts", () => {
	const headers = {
		"retry-after": [" 120\t", "Wed, 16 Sep 2026 00:00:00 GMT", " 120\t"],
		"cf-mitigated": ["challenge", "none", "challenge"],
		"content-encoding": ["gzip", "identity", "gzip"],
		"content-length": ["42", "043", "42"],
		"content-type": [" text/html\t", "text/plain", " text/html\t"],
	};
	const captured = captureResearchResponseHeaders(headers);
	expect(captured.headers).toEqual(headers);
	expect(Object.keys(captured.headers)).toEqual(researchResponseHeaderNames);
	expect(captured.headerCapture).toEqual({
		kind: "selected-response-headers-v1",
		partial: true,
		omitted: [],
	});
});

it.each(researchResponseHeaderNames)(
	"retains exactly 16 values of exactly 160 code units for %s",
	(name) => {
		const values = Array.from({ length: 16 }, (_, index) =>
			String(index).padEnd(160, "\xff"),
		);
		const captured = captureResearchResponseHeaders({ [name]: values });
		expect(captured.headers).toEqual({ [name]: values });
		expect(captured.headerCapture.omitted).toEqual([]);
	},
);

it.each(researchResponseHeaderNames)(
	"omits the whole over-budget field for %s",
	(name) => {
		for (const values of [
			Array.from({ length: 17 }, () => "valid"),
			[...Array.from({ length: 15 }, () => "valid"), "x".repeat(161)],
		]) {
			const captured = captureResearchResponseHeaders({ [name]: values });
			expect(captured.headers).toEqual({});
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
	},
);

it.each([
	["cf-mitigated", "challenge", "none"],
	["retry-after", "120", "0"],
])("never saves a misleading prefix for %s", (name, first, conflict) => {
	const prefix = Array.from({ length: 16 }, () => first);
	for (const values of [
		[...prefix, conflict],
		[...prefix.slice(0, 15), `${first}${" ".repeat(161)}`],
	]) {
		const captured = captureResearchResponseHeaders({
			"content-type": ["text/html"],
			[name]: values,
		});
		expect(captured.headers).toEqual({ "content-type": ["text/html"] });
		expect(captured.headerCapture.omitted).toEqual([name]);
	}
});

it("retains empty strings and header-safe Latin-1, but omits empty arrays", () => {
	const captured = captureResearchResponseHeaders({
		"content-type": ["", " \t", "\x20\x7e\x80\xff"],
		"content-length": [],
	});
	expect(captured.headers).toEqual({
		"content-type": ["", " \t", "\x20\x7e\x80\xff"],
	});
	expect(captured.headerCapture.omitted).toEqual(["content-length"]);
});

it("omits entire fields containing forbidden controls or non-Latin-1", () => {
	const invalidCodes = [
		...Array.from({ length: 32 }, (_, index) => index).filter(
			(code) => code !== 9,
		),
		127,
		256,
		0x2028,
		0xd800,
		0xdc00,
	];
	for (const code of invalidCodes) {
		const captured = captureResearchResponseHeaders({
			"cf-mitigated": ["challenge", `bad${String.fromCharCode(code)}`],
		});
		expect(captured.headers).toEqual({});
		expect(captured.headerCapture.omitted).toEqual(["cf-mitigated"]);
	}
});

it("ignores absent, inherited and unknown headers without reading getters", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected getter execution");
	});
	const inherited = Object.defineProperty({}, "retry-after", { get: read });
	const headers = Object.create(inherited);
	Object.defineProperty(headers, "content-type", { value: ["text/html"] });
	for (const name of [
		"cookie",
		"authorization",
		"set-cookie",
		"location",
		"x-private",
		"Content-Type",
	]) {
		Object.defineProperty(headers, name, { get: read, enumerable: true });
	}
	const captured = captureResearchResponseHeaders(headers);
	expect(captured.headers).toEqual({ "content-type": ["text/html"] });
	expect(captured.headerCapture.omitted).toEqual([]);
	expect(read).not.toHaveBeenCalled();
	expect(captureResearchResponseHeaders({})).toEqual({
		headers: {},
		headerCapture: {
			kind: "selected-response-headers-v1",
			partial: true,
			omitted: [],
		},
	});
});

it("omits accessor fields and array entries without invoking getters", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected getter execution");
	});
	const values = ["challenge", "none"];
	Object.defineProperty(values, "1", { get: read });
	const headers = Object.defineProperty(
		{ "cf-mitigated": values },
		"retry-after",
		{ get: read },
	);
	const captured = captureResearchResponseHeaders(headers);
	expect(captured.headers).toEqual({});
	expect(captured.headerCapture.omitted).toEqual([
		"cf-mitigated",
		"retry-after",
	]);
	expect(read).not.toHaveBeenCalled();
});

it("rejects oversized arrays before inspecting entries", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected oversized array inspection");
	});
	for (const length of [17, 0xffffffff]) {
		const values = new Array(length);
		Object.defineProperty(values, "0", { get: read });
		const captured = captureResearchResponseHeaders({ "retry-after": values });
		expect(captured.headers).toEqual({});
		expect(captured.headerCapture.omitted).toEqual(["retry-after"]);
	}
	expect(read).not.toHaveBeenCalled();
});

it("rejects sparse, inherited-entry and wrong-type arrays without coercion", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected coercion or inherited getter execution");
	});
	const inherited = new Array(1);
	Object.setPrototypeOf(
		inherited,
		Object.defineProperty([], "0", { get: read }),
	);
	for (const value of [
		undefined,
		null,
		"120",
		{ 0: "120", length: 1 },
		new Array(1),
		inherited,
		["120", undefined],
		["120", 0],
		["120", ["0"]],
		["120", { toString: read }],
	]) {
		const captured = captureResearchResponseHeaders({
			"retry-after": value,
		} as NetworkResponse["headers"]);
		expect(captured.headers).toEqual({});
		expect(captured.headerCapture.omitted).toEqual(["retry-after"]);
	}
	expect(read).not.toHaveBeenCalled();
});

it("records omissions in canonical order rather than input order", () => {
	const captured = captureResearchResponseHeaders({
		"retry-after": [],
		"cf-mitigated": [],
		"content-encoding": [],
		"content-length": [],
		"content-type": [],
	});
	expect(captured.headers).toEqual({});
	expect(captured.headerCapture.omitted).toEqual(researchResponseHeaderNames);
});

it("returns independent deeply frozen snapshots without freezing caller data", () => {
	const values = ["challenge", "none"];
	const headers = { "cf-mitigated": values, "retry-after": [] as string[] };
	const captured = captureResearchResponseHeaders(headers);
	expect(captured.headers["cf-mitigated"]).not.toBe(values);
	expect(Object.isFrozen(headers)).toBe(false);
	expect(Object.isFrozen(values)).toBe(false);
	values[0] = "changed";
	values.push("new");
	headers["cf-mitigated"] = ["replaced"];
	headers["retry-after"].push("120");
	expect(captured.headers).toEqual({ "cf-mitigated": ["challenge", "none"] });
	expect(captured.headerCapture.omitted).toEqual(["retry-after"]);
	for (const snapshot of [
		captured,
		captured.headers,
		captured.headers["cf-mitigated"],
		captured.headerCapture,
		captured.headerCapture.omitted,
	]) {
		expect(Object.isFrozen(snapshot)).toBe(true);
	}
	expect(Reflect.set(captured, "headers", {})).toBe(false);
	expect(Reflect.set(captured.headers, "cf-mitigated", [])).toBe(false);
	expect(Reflect.set(captured.headers["cf-mitigated"], "0", "changed")).toBe(
		false,
	);
	expect(Reflect.set(captured.headerCapture, "partial", false)).toBe(false);
	expect(Reflect.set(captured.headerCapture.omitted, "0", "content-type")).toBe(
		false,
	);
	const later = captureResearchResponseHeaders(headers);
	expect(later.headers).toEqual({
		"cf-mitigated": ["replaced"],
		"retry-after": ["120"],
	});
	expect(later.headerCapture.omitted).toEqual([]);
});
