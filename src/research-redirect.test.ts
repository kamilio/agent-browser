import { describe, expect, it, vi } from "vitest";
import {
	type ResearchRedirectHandoff,
	summarizeResearchRedirect,
	validateResearchRedirectHandoff,
} from "../scripts/research-redirect.js";
import type { NetworkResponse } from "./network.js";

const source = "https://docs.fixture.invalid/base/page";
const statuses = [301, 302, 303, 307, 308];
type Response = Pick<NetworkResponse, "url" | "status" | "headers">;

function response(
	location: readonly string[] = ["/next"],
	status = 308,
): Response {
	return { url: source, status, headers: { location } };
}

function available(): ResearchRedirectHandoff {
	return {
		kind: "http-redirect-handoff-v1",
		status: 308,
		action: "review-before-new-request",
		followed: false,
		reason: "available",
		location: {
			url: "https://docs.fixture.invalid/next?redacted",
			sameOrigin: true,
			queryRedacted: true,
			fragmentOmitted: true,
		},
	};
}

function expectInvalid(value: unknown, fromUrl = source, status = 308) {
	expect(() =>
		validateResearchRedirectHandoff(value, fromUrl, status),
	).toThrowError(
		expect.objectContaining({
			name: "AgentBrowserError",
			code: "invalid-input",
			message: "Invalid research redirect handoff",
		}),
	);
}

describe("manual redirect handoff summary", () => {
	it.each(statuses)("reports status %s without claiming a follow", (status) => {
		const handoff = summarizeResearchRedirect(response(["../next"], status));
		expect(handoff).toEqual({
			kind: "http-redirect-handoff-v1",
			status,
			action: "review-before-new-request",
			followed: false,
			reason: "available",
			location: {
				url: "https://docs.fixture.invalid/next",
				sameOrigin: true,
				queryRedacted: false,
				fragmentOmitted: false,
			},
		});
		expect(() =>
			validateResearchRedirectHandoff(handoff, source, status),
		).not.toThrow();
	});

	it.each([
		100,
		200,
		204,
		300,
		304,
		305,
		306,
		309,
		400,
		500,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])(
		"omits metadata for nonredirect status %s without reading headers",
		(status) => {
			const access = vi.fn(() => {
				throw new Error("must not read response headers");
			});
			const value = Object.defineProperty({ status }, "headers", {
				get: access,
			});
			expect(summarizeResearchRedirect(value as Response)).toBeUndefined();
			expect(access).not.toHaveBeenCalled();
		},
	);

	it.each([
		["next", "https://docs.fixture.invalid/base/next", true],
		["/next", "https://docs.fixture.invalid/next", true],
		[
			"//other.fixture.invalid/next",
			"https://other.fixture.invalid/next",
			false,
		],
		[
			"https://docs.fixture.invalid:443/next",
			"https://docs.fixture.invalid/next",
			true,
		],
		[
			"https://docs.fixture.invalid:8443/next",
			"https://docs.fixture.invalid:8443/next",
			false,
		],
		[
			"http://docs.fixture.invalid/next",
			"http://docs.fixture.invalid/next",
			false,
		],
	])("resolves %s informationally", (location, url, sameOrigin) => {
		const handoff = summarizeResearchRedirect(response([location as string]));
		expect(handoff?.location).toEqual({
			url,
			sameOrigin,
			queryRedacted: false,
			fragmentOmitted: false,
		});
		expect(handoff?.action).toBe("review-before-new-request");
		expect(handoff?.followed).toBe(false);
	});

	it.each([
		["/next?token=query-secret#fragment-secret", "/next?redacted", true, true],
		["?token=query-secret", "/base/page?redacted", true, false],
		["#fragment-secret", "/base/page", false, true],
		["/next?", "/next?redacted", true, false],
		["/next#", "/next", false, true],
		["/next?#", "/next?redacted", true, true],
		["/next#fragment?query-secret", "/next", false, true],
	])(
		"redacts query and omits fragment in %s",
		(location, suffix, queryRedacted, fragmentOmitted) => {
			const handoff = summarizeResearchRedirect(response([location as string]));
			expect(handoff?.location).toEqual({
				url: `https://docs.fixture.invalid${suffix}`,
				sameOrigin: true,
				queryRedacted,
				fragmentOmitted,
			});
			expect(JSON.stringify(handoff)).not.toMatch(
				/query-secret|fragment-secret/,
			);
			expect(() =>
				validateResearchRedirectHandoff(handoff, source, 308),
			).not.toThrow();
		},
	);

	it("redacts an inherited source query when a fragment-only target retains it", () => {
		const handoff = summarizeResearchRedirect({
			...response(["#target-secret"]),
			url: `${source}?source-secret#source-fragment`,
		});
		expect(handoff?.location).toEqual({
			url: `${source}?redacted`,
			sameOrigin: true,
			queryRedacted: true,
			fragmentOmitted: true,
		});
		expect(JSON.stringify(handoff)).not.toContain("secret");
	});

	it.each(["available", "missing-location", "invalid-location", "credentials"])(
		"does not mistake relative target %s for a diagnostic reason",
		(location) => {
			const handoff = summarizeResearchRedirect(response([location]));
			expect(handoff?.reason).toBe("available");
			expect(handoff?.location?.url).toBe(
				`https://docs.fixture.invalid/base/${location}`,
			);
		},
	);

	it.each([
		[{}, "missing-location"],
		[{ location: [] }, "missing-location"],
		[{ location: [""] }, "missing-location"],
		[{ location: ["   "] }, "missing-location"],
		[{ location: ["/one", "/two"] }, "ambiguous-location"],
		[{ location: ["/same", "/same"] }, "ambiguous-location"],
		[{ location: ["/one"], Location: ["/two"] }, "ambiguous-location"],
		[{ location: "/wrong-type" }, "invalid-location"],
		[{ location: [42] }, "invalid-location"],
		[{ location: new Array(1) }, "invalid-location"],
	])("handles missing, ambiguous or malformed header %j", (headers, reason) => {
		const handoff = summarizeResearchRedirect({
			...response(),
			headers,
		} as Response);
		expect(handoff?.reason).toBe(reason);
		expect(handoff?.location).toBeNull();
		expect(() =>
			validateResearchRedirectHandoff(handoff, source, 308),
		).not.toThrow();
	});

	it("accepts case-insensitive Location and ignores unrelated accessors", () => {
		const access = vi.fn();
		const headers = Object.defineProperty(
			{ LoCaTiOn: ["/next"] },
			"set-cookie",
			{ get: access },
		);
		expect(summarizeResearchRedirect({ ...response(), headers })?.reason).toBe(
			"available",
		);
		expect(access).not.toHaveBeenCalled();
	});

	it("does not dereference Location, array-item, response or inherited getters", () => {
		const access = vi.fn(() => {
			throw new Error("accessor-private-secret");
		});
		const values = Object.defineProperty(["unused"], "0", { get: access });
		const headers = Object.defineProperty({}, "location", { get: access });
		const inherited = Object.create(
			Object.defineProperty({}, "location", { get: access }),
		);
		for (const entry of [headers, { location: values }, inherited]) {
			const handoff = summarizeResearchRedirect({
				...response(),
				headers: entry,
			});
			expect(handoff?.reason).toBe("invalid-location");
			expect(JSON.stringify(handoff)).not.toContain("secret");
		}
		for (const field of ["headers", "url"]) {
			const value = Object.defineProperty(response(), field, { get: access });
			expect(summarizeResearchRedirect(value)?.reason).toBe("invalid-location");
		}
		const duplicate = Object.defineProperty(
			{ Location: ["/next"] },
			"location",
			{ get: access },
		);
		expect(
			summarizeResearchRedirect({ ...response(), headers: duplicate })?.reason,
		).toBe("ambiguous-location");
		expect(
			summarizeResearchRedirect(
				Object.defineProperty(response(), "status", { get: access }),
			),
		).toBeUndefined();
		expect(access).not.toHaveBeenCalled();
	});

	it("rejects proxy header data without triggering traps", () => {
		const trap = vi.fn(() => {
			throw new Error("proxy-private-secret");
		});
		const headers = new Proxy(
			{},
			{ getPrototypeOf: trap, ownKeys: trap, get: trap },
		);
		expect(summarizeResearchRedirect({ ...response(), headers })?.reason).toBe(
			"invalid-location",
		);
		const values = new Proxy(["/next"], {
			get: trap,
			getOwnPropertyDescriptor: trap,
		});
		expect(summarizeResearchRedirect(response(values))?.reason).toBe(
			"invalid-location",
		);
		expect(
			summarizeResearchRedirect(
				new Proxy(response(), { getPrototypeOf: trap }),
			),
		).toBeUndefined();
		const revoked = Proxy.revocable(["/next"], {});
		revoked.revoke();
		expect(summarizeResearchRedirect(response(revoked.proxy))?.reason).toBe(
			"invalid-location",
		);
		expect(trap).not.toHaveBeenCalled();
	});

	it.each([
		["https://[invalid/private-secret", "invalid-location"],
		["/next\nprivate-secret", "invalid-location"],
		["\t/next?private-secret", "invalid-location"],
		["/next\u0000private-secret", "invalid-location"],
		["/next\u007fprivate-secret", "invalid-location"],
		["/next\u0085private-secret", "invalid-location"],
		["javascript:private-secret", "unsupported-protocol"],
		["data:text/plain,private-secret", "unsupported-protocol"],
		["file:///private-secret", "unsupported-protocol"],
		["ftp://files.fixture.invalid/private-secret", "unsupported-protocol"],
		["https://user:private-secret@other.fixture.invalid/next", "credentials"],
		["//user@other.fixture.invalid/next", "credentials"],
		["http://127.0.0.1/private-secret", "disallowed-url"],
		["http://2130706433/private-secret", "disallowed-url"],
		["http://[::1]/private-secret", "disallowed-url"],
		["https://localhost/private-secret", "disallowed-url"],
		["https://service.internal/private-secret", "disallowed-url"],
		["https://other.fixture.invalid:25/private-secret", "disallowed-url"],
	])("withholds unsafe Location %s", (location, reason) => {
		const handoff = summarizeResearchRedirect(response([location]));
		expect(handoff?.reason).toBe(reason);
		expect(handoff?.location).toBeNull();
		expect(JSON.stringify(handoff)).not.toContain("private-secret");
		expect(() =>
			validateResearchRedirectHandoff(handoff, source, 308),
		).not.toThrow();
	});

	it.each([
		"",
		"not-an-absolute-base",
		"file:///private-secret",
		"https://user:private-secret@docs.fixture.invalid/",
		"http://localhost/private-secret",
	])("fails explicitly for an unusable source URL %s", (url) => {
		const handoff = summarizeResearchRedirect({
			...response(["https://other.fixture.invalid/next"]),
			url,
		});
		expect(handoff?.reason).toBe("invalid-location");
		expect(handoff?.location).toBeNull();
		expect(JSON.stringify(handoff)).not.toContain("private-secret");
	});

	it("bounds raw input and serialized output without truncating", () => {
		expect(
			summarizeResearchRedirect(response([`?${"x".repeat(4096)}`]))?.reason,
		).toBe("location-limit");
		expect(
			summarizeResearchRedirect(response([`/${"é".repeat(1000)}`]))?.reason,
		).toBe("location-limit");
		expect(
			summarizeResearchRedirect(response([`/${"é".repeat(3000)}`]))?.reason,
		).toBe("location-limit");
		const prefix = "https://docs.fixture.invalid/";
		const exact = prefix + "x".repeat(4096 - prefix.length);
		const handoff = summarizeResearchRedirect(response([exact]));
		expect(handoff?.location?.url).toBe(exact);
		expect(() =>
			validateResearchRedirectHandoff(handoff, source, 308),
		).not.toThrow();
		expect(
			summarizeResearchRedirect(response([`${exact}x`]))?.location,
		).toBeNull();
	});
});

describe("redirect handoff evidence validation", () => {
	it.each(statuses)(
		"accepts an exact record for received status %s",
		(status) => {
			const value = { ...available(), status };
			expect(() =>
				validateResearchRedirectHandoff(value, source, status),
			).not.toThrow();
		},
	);

	it.each([
		"missing-location",
		"ambiguous-location",
		"invalid-location",
		"unsupported-protocol",
		"credentials",
		"disallowed-url",
		"location-limit",
	])(
		"accepts withheld reason %s without inventing remote-header proof",
		(reason) => {
			expect(() =>
				validateResearchRedirectHandoff(
					{ ...available(), reason, location: null },
					source,
					308,
				),
			).not.toThrow();
		},
	);

	it("accepts null-prototype exact data records and either fragment provenance boolean", () => {
		for (const fragmentOmitted of [true, false]) {
			const value = Object.assign(Object.create(null), available());
			value.location = Object.assign(Object.create(null), value.location, {
				fragmentOmitted,
			});
			expect(() =>
				validateResearchRedirectHandoff(value, source, 308),
			).not.toThrow();
		}
	});

	it.each([
		null,
		undefined,
		[],
		"private-secret",
		{},
		{ ...available(), extra: "private-secret" },
		{ ...available(), kind: "other" },
		{ ...available(), status: 302 },
		{ ...available(), status: "308" },
		{ ...available(), followed: true },
		{ ...available(), followed: 0 },
		{ ...available(), action: "follow" },
		{ ...available(), reason: "unknown" },
		{ ...available(), reason: "missing-location" },
		{ ...available(), location: null },
		{ ...available(), location: {} },
		{
			...available(),
			location: { ...available().location, extra: "private-secret" },
		},
	])("rejects malformed or contradictory exact-key evidence %j", (value) => {
		expectInvalid(value);
	});

	it.each([
		{ sameOrigin: false },
		{ sameOrigin: 1 },
		{ queryRedacted: false },
		{ queryRedacted: "true" },
		{ fragmentOmitted: null },
		{ url: "https://docs.fixture.invalid/next?private-secret" },
		{ url: "https://docs.fixture.invalid/next?redacted&private-secret" },
		{ url: "https://docs.fixture.invalid/next?redacted#private-secret" },
		{ url: "https://docs.fixture.invalid/next?redacted#" },
		{ url: "https://docs.fixture.invalid/next?", queryRedacted: false },
		{ url: "https://docs.fixture.invalid/next", queryRedacted: true },
		{ url: "https://user:private-secret@docs.fixture.invalid/next?redacted" },
		{ url: "http://127.0.0.1/next?redacted", sameOrigin: false },
		{ url: "https://localhost/next?redacted", sameOrigin: false },
		{
			url: "https://other.fixture.invalid:25/next?redacted",
			sameOrigin: false,
		},
		{ url: "javascript:private-secret", sameOrigin: false },
		{ url: "/next?redacted" },
		{ url: "https://docs.fixture.invalid/next\n?redacted" },
		{ url: `https://docs.fixture.invalid/${"x".repeat(4096)}` },
		{
			url: {
				toString: (): string => "https://docs.fixture.invalid/next?redacted",
			},
		},
	])("rejects invalid location fields %j", (changes) => {
		expectInvalid({
			...available(),
			location: { ...available().location, ...changes },
		});
	});

	it("accepts a query-free target only with queryRedacted false and correct origin", () => {
		const value = {
			...available(),
			location: {
				url: "http://other.fixture.invalid/next",
				sameOrigin: false,
				queryRedacted: false,
				fragmentOmitted: false,
			},
		};
		expect(() =>
			validateResearchRedirectHandoff(value, source, 308),
		).not.toThrow();
		expectInvalid(value, "http://other.fixture.invalid/source");
	});

	it.each([200, 304, 305, 306, 309, 500, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects sender status %s",
		(status) => {
			expectInvalid({ ...available(), status }, source, status);
		},
	);

	it.each([
		"",
		"invalid",
		"file:///private-secret",
		"https://user:private-secret@docs.fixture.invalid/",
		"http://localhost/private-secret",
	])("rejects unknown or disallowed sender URL %s generically", (fromUrl) =>
		expectInvalid(available(), fromUrl),
	);

	it("rejects missing fields, symbols, inheritance and accessors without reading them", () => {
		const access = vi.fn(() => {
			throw new Error("evidence-private-secret");
		});
		for (const field of Object.keys(available())) {
			const value = { ...available() } as Record<string, unknown>;
			delete value[field];
			expectInvalid(value);
			expectInvalid(
				Object.defineProperty({ ...available() }, field, { get: access }),
			);
		}
		for (const field of Object.keys(available().location ?? {})) {
			const location = { ...available().location } as Record<string, unknown>;
			delete location[field];
			expectInvalid({ ...available(), location });
			expectInvalid({
				...available(),
				location: Object.defineProperty({ ...available().location }, field, {
					get: access,
				}),
			});
		}
		expectInvalid({ ...available(), [Symbol("private-secret")]: true });
		expectInvalid(Object.create(available()));
		const proxy = new Proxy(available(), {
			get: access,
			ownKeys: access,
			getPrototypeOf: access,
		});
		expectInvalid(proxy);
		expectInvalid({
			...available(),
			location: new Proxy(available().location ?? {}, {
				getPrototypeOf: access,
			}),
		});
		expect(access).not.toHaveBeenCalled();
	});
});
