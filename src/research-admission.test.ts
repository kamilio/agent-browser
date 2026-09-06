import { expect, it, vi } from "vitest";
import { researchBodyCaptureLimit } from "../scripts/research-body-capture.js";
import {
	parseResearchArguments,
	researchRunLimits,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import {
	researchLongDocumentAdmission,
	validateResearchDocumentProfile,
} from "./research-admission.js";
import { researchReaderLimits } from "./research-loader.js";

it("selects only explicit named profiles without changing omitted defaults", () => {
	expect(validateResearchDocumentProfile()).toBe("default");
	expect(validateResearchDocumentProfile(undefined)).toBe("default");
	expect(validateResearchDocumentProfile("default")).toBe("default");
	expect(validateResearchDocumentProfile("long-v1")).toBe("long-v1");
});

it.each([
	null,
	false,
	true,
	0,
	4_000_000,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	1n,
	Symbol("long-v1"),
	"",
	"long",
	"long-v2",
	"LONG-V1",
	" long-v1",
	"long-v1 ",
	"long-v1\n",
	"default\0",
	"constructor",
	"__proto__",
	{},
	[],
	["long-v1"],
])("rejects invalid profile %s with a fixed payload-free error", (value) => {
	let failure: unknown;
	try {
		validateResearchDocumentProfile(value);
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({
		code: "invalid-input",
		message: "Invalid research document profile",
	});
	expect(Object.hasOwn(failure as object, "cause")).toBe(false);
});

it("never coerces or inspects hostile and revoked profile objects", () => {
	const hook = vi.fn(() => {
		throw new Error("PRIVATE_PROFILE_SENTINEL");
	});
	const value = { [Symbol.toPrimitive]: hook, toString: hook, valueOf: hook };
	const proxy = Proxy.revocable(value, {
		get: hook,
		getPrototypeOf: hook,
		ownKeys: hook,
	});
	for (const profile of [value, proxy.proxy, hook])
		expect(() => validateResearchDocumentProfile(profile)).toThrow(
			"Invalid research document profile",
		);
	proxy.revoke();
	expect(() => validateResearchDocumentProfile(proxy.proxy)).toThrow(
		"Invalid research document profile",
	);
	expect(hook).not.toHaveBeenCalled();
});

it("retains the existing exported research defaults", () => {
	expect(researchBodyCaptureLimit).toBe(2_000_000);
	expect(researchReaderLimits).toEqual({
		maxSourceCodeUnits: 2_000_000,
		maxTextCodeUnits: 1_000_000,
		maxOutputCodeUnits: 2_000_000,
		maxTokens: 100_000,
		maxDepth: 128,
	});
	expect(researchRunLimits.network).toEqual({
		timeoutMs: 15_000,
		maxResponseBytes: 2_000_000,
		maxRequestBytes: 1,
		maxHeaderBytes: 16_384,
		maxRedirects: 5,
		maxConcurrent: 1,
		maxRequests: 12,
		maxTotalBytes: 8_000_000,
	});
	expect(researchRunLimits.deadlineMs).toBe(120_000);
	expect(researchRunLimits.navigationTimeoutMs).toBe(20_000);
	expect(researchRunLimits.extractionBytes).toBe(256_000);
	expect(Object.isFrozen(researchReaderLimits)).toBe(true);
	expect(Object.isFrozen(researchRunLimits)).toBe(true);
});

it("pins deeply immutable finite long-profile ceilings and derived bounds", () => {
	const profile = researchLongDocumentAdmission;
	expect(profile).toEqual({
		profile: "long-v1",
		maxUrls: 1,
		maxCaptureBytes: 4_000_000,
		deadlineMs: 120_000,
		navigationTimeoutMs: 20_000,
		network: { ...researchRunLimits.network, maxResponseBytes: 4_000_000 },
		reader: {
			maxSourceCodeUnits: 4_000_000,
			maxTextCodeUnits: 2_000_000,
			maxOutputCodeUnits: 4_000_000,
			maxTokens: 200_000,
			maxDepth: 128,
		},
		document: {
			maxNodes: 50_000,
			maxDepth: 128,
			maxTextCodeUnits: 4_000_000,
			maxChanges: 1024,
		},
		derived: {
			maxEncodedReaderBytes: 16_000_003,
			maxParserInputWorkCodeUnits: 32_000_000,
			maxParserTokens: 400_000,
		},
		headings: {
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
			maxEntries: 256,
			maxTitleCodeUnits: 256,
			maxSelectorCodeUnits: 4096,
		},
		evidence: { maxReceiptBytes: 6_000_000, maxMetadataBytes: 65_536 },
	});
	expect(Object.isFrozen(profile)).toBe(true);
	expect(Reflect.set(profile, "maxCaptureBytes", 8_000_000)).toBe(false);
	for (const value of Object.values(profile)) {
		if (typeof value !== "object") continue;
		expect(Object.isFrozen(value)).toBe(true);
		for (const [name, limit] of Object.entries(value)) {
			expect(Number.isSafeInteger(limit)).toBe(true);
			expect(limit).toBeGreaterThan(0);
			expect(Reflect.set(value, name, Number.POSITIVE_INFINITY)).toBe(false);
		}
	}
	expect(profile.derived.maxEncodedReaderBytes).toBe(
		profile.reader.maxSourceCodeUnits * 4 + 3,
	);
	expect(profile.derived.maxParserInputWorkCodeUnits).toBe(
		profile.document.maxTextCodeUnits * 8,
	);
	expect(profile.derived.maxParserTokens).toBe(profile.document.maxNodes * 8);
	expect(
		Math.ceil(profile.maxCaptureBytes / 3) * 4 +
			profile.headings.maxBytes +
			profile.evidence.maxMetadataBytes,
	).toBeLessThan(profile.evidence.maxReceiptBytes);
});

it("does not activate the future long-profile CLI flag in this first slice", () => {
	expect(() =>
		parseResearchArguments([
			"--reader",
			"--capture-body",
			"--headings",
			"--document-profile",
			"long-v1",
			"https://admission.fixture.invalid/",
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(researchRunLimits.network.maxResponseBytes).toBe(2_000_000);
});
