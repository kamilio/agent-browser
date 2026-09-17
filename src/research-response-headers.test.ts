import { expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import {
	captureResearchResponseHeaders,
	researchResponseHeaderLimits,
	researchResponseHeaderNames,
	researchResponseHeaderNamesV1,
} from "./research-response-headers.js";

const policyHeaderNames = [
	"content-security-policy",
	"content-security-policy-report-only",
] as const;

const captureVersions = [
	"selected-response-headers-v1",
	"selected-response-headers-v2",
] as const;

it("exports the fixed, immutable selection and budgets", () => {
	expect(researchResponseHeaderNamesV1).toEqual([
		"content-type",
		"content-length",
		"content-encoding",
		"cf-mitigated",
		"retry-after",
	]);
	expect(researchResponseHeaderNames).toEqual([
		...researchResponseHeaderNamesV1,
		...policyHeaderNames,
	]);
	expect(researchResponseHeaderLimits).toEqual({
		maxValues: 16,
		maxValueCodeUnits: 160,
		maxPolicyCodeUnits: 16384,
	});
	expect(Object.isFrozen(researchResponseHeaderNamesV1)).toBe(true);
	expect(Object.isFrozen(researchResponseHeaderNames)).toBe(true);
	expect(Object.isFrozen(researchResponseHeaderLimits)).toBe(true);
});

it("preserves all selected values, whitespace, duplicates and conflicts", () => {
	const headers = {
		"content-security-policy-report-only": [
			" default-src 'self'\t",
			"default-src *",
			" default-src 'self'\t",
		],
		"content-security-policy": [
			" script-src 'none'\t",
			"script-src 'self'",
			" script-src 'none'\t",
		],
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
		kind: "selected-response-headers-v2",
		partial: true,
		omitted: [],
	});
});

it.each(researchResponseHeaderNamesV1)(
	"retains exactly 16 values of exactly 160 code units for %s",
	(name) => {
		const values = Array.from({ length: 16 }, (_, index) =>
			String(index).padEnd(160, "\xff"),
		);
		for (const version of captureVersions) {
			const captured = captureResearchResponseHeaders(
				{ [name]: values },
				version,
			);
			expect(captured.headers).toEqual({ [name]: values });
			expect(captured.headerCapture.omitted).toEqual([]);
		}
	},
);

it.each(researchResponseHeaderNamesV1)(
	"omits the whole over-budget field for %s",
	(name) => {
		for (const values of [
			Array.from({ length: 17 }, () => "valid"),
			[...Array.from({ length: 15 }, () => "valid"), "x".repeat(161)],
		]) {
			for (const version of captureVersions) {
				const captured = captureResearchResponseHeaders(
					{ [name]: values },
					version,
				);
				expect(captured.headers).toEqual({});
				expect(captured.headerCapture.omitted).toEqual([name]);
			}
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

it.each(researchResponseHeaderNames)(
	"retains empty strings and header-safe Latin-1, but omits empty arrays for %s",
	(name) => {
		const values = ["", " \t", "\x20\x7e\x80\xff"];
		const captured = captureResearchResponseHeaders({ [name]: values });
		expect(captured.headers).toEqual({ [name]: values });
		expect(captured.headerCapture.omitted).toEqual([]);
		const empty = captureResearchResponseHeaders({ [name]: [] });
		expect(empty.headers).toEqual({});
		expect(empty.headerCapture.omitted).toEqual([name]);
	},
);

it("keeps valid fields when another selected field is empty", () => {
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
	for (const name of researchResponseHeaderNames) {
		for (const code of invalidCodes) {
			const captured = captureResearchResponseHeaders({
				[name]: ["valid", `bad${String.fromCharCode(code)}`],
			});
			expect(captured.headers).toEqual({});
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
	}
});

it("ignores absent, inherited and unknown headers without reading getters", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected getter execution");
	});
	const inherited = Object.defineProperty({}, "retry-after", { get: read });
	for (const name of policyHeaderNames) {
		Object.defineProperty(inherited, name, { get: read });
	}
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
			kind: "selected-response-headers-v2",
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

it.each(researchResponseHeaderNames)(
	"omits accessor fields and entries without reading them for %s",
	(name) => {
		const read = vi.fn(() => {
			throw new Error("Unexpected getter execution");
		});
		const values = ["valid", "conflicting"];
		Object.defineProperty(values, "1", { get: read });
		for (const headers of [
			Object.defineProperty({}, name, { get: read }),
			{ [name]: values },
		]) {
			const captured = captureResearchResponseHeaders(headers);
			expect(captured.headers).toEqual({});
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
		expect(read).not.toHaveBeenCalled();
	},
);

it("rejects oversized arrays before inspecting entries", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected oversized array inspection");
	});
	for (const length of [17, 0xffffffff]) {
		const values = new Array(length);
		Object.defineProperty(values, "0", { get: read });
		for (const name of researchResponseHeaderNames) {
			const captured = captureResearchResponseHeaders({ [name]: values });
			expect(captured.headers).toEqual({});
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
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
		for (const name of researchResponseHeaderNames) {
			const captured = captureResearchResponseHeaders({
				[name]: value,
			} as NetworkResponse["headers"]);
			expect(captured.headers).toEqual({});
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
	}
	expect(read).not.toHaveBeenCalled();
});

it("records omissions in canonical order rather than input order", () => {
	const captured = captureResearchResponseHeaders({
		"content-security-policy-report-only": [],
		"content-security-policy": [],
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

it.each(policyHeaderNames)(
	"retains a complete maximum-size policy and 16 policies totaling the budget for %s",
	(name) => {
		for (const values of [
			["x".repeat(16384)],
			Array.from({ length: 16 }, (_, index) =>
				String(index).padEnd(1024, "\xff"),
			),
			["x".repeat(16384), ...Array.from({ length: 15 }, () => "")],
		]) {
			const captured = captureResearchResponseHeaders({ [name]: values });
			expect(captured.headers).toEqual({ [name]: values });
			expect(captured.headerCapture.omitted).toEqual([]);
		}
	},
);

it.each(policyHeaderNames)(
	"omits all policies on individual, cumulative or value-count overflow for %s",
	(name) => {
		for (const values of [
			["x".repeat(16385)],
			["x".repeat(8192), "y".repeat(8193)],
			[...Array.from({ length: 15 }, () => "x".repeat(1024)), "y".repeat(1025)],
			Array.from({ length: 17 }, () => ""),
		]) {
			const captured = captureResearchResponseHeaders({
				"content-type": ["text/html"],
				[name]: values,
			});
			expect(captured.headers).toEqual({ "content-type": ["text/html"] });
			expect(captured.headerCapture.omitted).toEqual([name]);
		}
	},
);

it("budgets enforced and report-only policies independently", () => {
	const headers = {
		"content-security-policy": ["x".repeat(16384)],
		"content-security-policy-report-only": ["y".repeat(16384)],
	};
	const captured = captureResearchResponseHeaders(headers);
	expect(captured.headers).toEqual(headers);
	expect(captured.headerCapture.omitted).toEqual([]);
	for (const name of policyHeaderNames) {
		const otherName =
			name === "content-security-policy"
				? "content-security-policy-report-only"
				: "content-security-policy";
		const omitted = captureResearchResponseHeaders({
			...headers,
			[name]: ["x".repeat(16385)],
		});
		expect(omitted.headers).toEqual({ [otherName]: headers[otherName] });
		expect(omitted.headerCapture.omitted).toEqual([name]);
	}
});

it.each(policyHeaderNames)(
	"takes an independent deeply frozen policy snapshot for %s",
	(name) => {
		const values = ["default-src 'self'", "script-src 'none'"];
		const headers = { [name]: values };
		const captured = captureResearchResponseHeaders(headers);
		expect(captured.headers[name]).not.toBe(values);
		expect(Object.isFrozen(headers)).toBe(false);
		expect(Object.isFrozen(values)).toBe(false);
		values[0] = "default-src *";
		values.push("script-src *");
		headers[name] = [];
		expect(captured.headers[name]).toEqual([
			"default-src 'self'",
			"script-src 'none'",
		]);
		for (const snapshot of [
			captured,
			captured.headers,
			captured.headers[name],
			captured.headerCapture,
			captured.headerCapture.omitted,
		]) {
			expect(Object.isFrozen(snapshot)).toBe(true);
		}
	},
);

it.each(captureVersions)(
	"uses the explicitly requested %s marker",
	(version) => {
		const captured = captureResearchResponseHeaders({}, version);
		expect(captured.headerCapture).toEqual({
			kind: version,
			partial: true,
			omitted: [],
		});
	},
);

it("uses v2 when the optional version is explicitly undefined", () => {
	expect(captureResearchResponseHeaders({}, undefined).headerCapture.kind).toBe(
		"selected-response-headers-v2",
	);
});

it("preserves the original v1 selection without reading or marking CSP fields", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected policy getter execution");
	});
	for (const descriptor of [
		{ value: ["default-src 'self'"] },
		{ value: [] },
		{ value: ["x".repeat(16385)] },
		{ get: read },
	]) {
		const headers = Object.fromEntries(
			researchResponseHeaderNamesV1.map((name) => [name, ["valid"]]),
		);
		for (const name of policyHeaderNames) {
			Object.defineProperty(headers, name, descriptor);
		}
		const captured = captureResearchResponseHeaders(
			headers,
			"selected-response-headers-v1",
		);
		expect(Object.keys(captured.headers)).toEqual(
			researchResponseHeaderNamesV1,
		);
		expect(captured.headerCapture).toEqual({
			kind: "selected-response-headers-v1",
			partial: true,
			omitted: [],
		});
	}
	expect(read).not.toHaveBeenCalled();
});

it("rejects invalid runtime versions without coercion or inspecting headers", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected version coercion or header inspection");
	});
	const headers = new Proxy({}, { getOwnPropertyDescriptor: read });
	for (const version of [
		null,
		false,
		1,
		2,
		"",
		"v1",
		"v2",
		"selected-response-headers-v3",
		["selected-response-headers-v2"],
		{ toString: read, [Symbol.toPrimitive]: read },
		Symbol("selected-response-headers-v2"),
	]) {
		expect(() =>
			captureResearchResponseHeaders(
				headers,
				version as (typeof captureVersions)[number],
			),
		).toThrow(TypeError);
	}
	expect(read).not.toHaveBeenCalled();
});
