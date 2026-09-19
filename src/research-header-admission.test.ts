import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	researchEvidenceCodecLimits,
	researchLongAdmissionProvenance,
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import type { ResearchNavigationReport } from "../scripts/research-browser.js";
import { researchFragmentReport } from "../scripts/research-fragment.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";

type Fixture = Record<string, unknown>;

const selectedNames = [
	"content-type",
	"content-length",
	"content-encoding",
	"cf-mitigated",
	"retry-after",
] as const;
const profiles = ["default", "long-v1"] as const;
const url = "https://research.example/synthetic-header-admission";
const timestamp = "2026-09-15T00:00:00.000Z";
const source = new TextEncoder().encode(
	"<h1 id=synthetic>Synthetic heading</h1>",
);
const { maxMetadataBytes, maxReceiptBytes } =
	researchLongDocumentAdmission.evidence;

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown): Fixture {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected synthetic header evidence record");
	return value as Fixture;
}

function marker(omitted: readonly string[] = []): Fixture {
	return { kind: "selected-response-headers-v1", partial: true, omitted };
}

function fixture(profile: ResearchDocumentProfileId): Fixture {
	return {
		requestedUrl: url,
		finalUrl: url,
		startedAt: timestamp,
		finishedAt: timestamp,
		elapsedMs: 0,
		profile: "native-semantic-reader-v1",
		partial: true,
		contentSuccess: null,
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		primaryResponse: {
			url,
			status: 200,
			receivedAt: timestamp,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			headerCapture: marker(),
			decodedBytes: source.byteLength,
			encodedBytes: source.byteLength,
			bodySha256: hash(source),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
			elapsedMs: 0,
		},
		bodyCapture: captureResearchBody(source, profile),
		selection: { method: "heading-outline" },
		outcome: "extracted-unverified",
		headings: {
			method: "heading-outline",
			document: "e1",
			revision: 0,
			partial: true,
			entries: [
				{
					ref: "e1:n3",
					level: 1,
					title: "Synthetic heading",
					titleTruncated: false,
					selector: "#synthetic",
				},
			],
			scannedNodes: 5,
			truncated: false,
		},
		metrics: {
			requests: 1,
			redirects: 0,
			encodedBytes: source.byteLength,
			decodedBytes: source.byteLength,
			active: 0,
			closed: true,
		},
		...(profile === "long-v1"
			? { admission: researchLongAdmissionProvenance }
			: {}),
	};
}

function serialize(report: Fixture, profile: ResearchDocumentProfileId) {
	return serializeResearchReport(
		report as unknown as ResearchNavigationReport,
		profile,
	);
}

function jsonl(report: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(report)}\n`);
}

function authority(
	raw: Uint8Array,
	profile: ResearchDocumentProfileId,
): TrustedResearchReplayAdmission {
	return {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: source.byteLength, sha256: hash(source) },
	};
}

function replay(report: Fixture, profile: ResearchDocumentProfileId) {
	const raw = jsonl(report);
	return validateResearchReplayAdmission(raw, authority(raw, profile));
}

function rejects(
	action: () => unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
): void {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic header evidence rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(
		code === "invalid-input"
			? "Invalid research evidence"
			: "Research evidence codec limit exceeded",
	);
	expect(Object.hasOwn(caught, "cause")).toBe(false);
}

function rejectSchema(change: (primary: Fixture) => void): void {
	for (const profile of profiles) {
		const report = fixture(profile);
		change(object(report.primaryResponse));
		if (
			profile === "long-v1" ||
			Object.hasOwn(object(report.primaryResponse), "headerCapture")
		)
			rejects(() => serialize(report, profile));
		rejects(() => replay(report, profile));
	}
}

function retained(report: Fixture, profile: ResearchDocumentProfileId): void {
	const before = structuredClone(report);
	const emission = serialize(report, profile);
	expect(emission.disposition).toBe("complete");
	expect(emission.jsonl).toEqual(jsonl(report));
	expect(emission.receiptBytes).toBe(emission.jsonl.byteLength);
	expect(emission.record.primaryResponse).toEqual(report.primaryResponse);
	if (profile === "long-v1") {
		const metadata = structuredClone(report);
		Reflect.deleteProperty(object(metadata.bodyCapture), "data");
		Reflect.deleteProperty(object(metadata.headings), "entries");
		expect(emission.metadataBytes).toBe(jsonl(metadata).byteLength);
	} else expect(emission.metadataBytes).toBeNull();
	const trusted = authority(emission.jsonl, profile);
	const result = validateResearchReplayAdmission(
		emission.jsonl,
		profile === "long-v1"
			? {
					expectedProfile: profile,
					expectedReceiptSha256: trusted.expectedReceiptSha256,
				}
			: trusted,
	);
	try {
		expect(result.kind).toBe(
			profile === "long-v1" ? "evidence-only" : "validated-capture",
		);
		expect(result.originalMetadata.primaryResponse).toEqual(
			report.primaryResponse,
		);
		expect(result.originalMetadata).not.toHaveProperty("bodyCapture.data");
		expect(result.originalMetadata).not.toHaveProperty("headings.entries");
		expect(result.originalFieldPresence["bodyCapture.data"]).toBe(true);
		expect(report).toEqual(before);
	} finally {
		result.body?.fill(0);
	}
}

describe.each(profiles)("selected-header evidence under %s", (profile) => {
	it("retains exactly five names with duplicate, conflicting and whitespace values", () => {
		const report = fixture(profile);
		object(report.primaryResponse).headers = {
			"content-type": ["text/html", "text/plain", "text/html"],
			"content-length": ["10", "20", "10"],
			"content-encoding": [" gzip ", "identity", "gzip"],
			"cf-mitigated": [" challenge\t", "managed", "challenge"],
			"retry-after": [" 120 ", "Tue, 15 Sep 2026 00:00:00 GMT", "0"],
		};
		retained(report, profile);
	});

	it.each(selectedNames)(
		"accepts 1 and 16 values for %s without clipping",
		(name) => {
			for (const count of [1, 16]) {
				const report = fixture(profile);
				object(object(report.primaryResponse).headers)[name] = Array.from(
					{ length: count },
					(_, index) => `${index}:\t ${"é".repeat(150)} `,
				);
				retained(report, profile);
			}
		},
	);

	it("accepts empty strings, tab, printable ASCII and Latin-1 through 160 units", () => {
		const report = fixture(profile);
		object(object(report.primaryResponse).headers)["retry-after"] = [
			"",
			"\t ",
			" ~\u0080\u0085\u009f\u00ff",
			"é".repeat(160),
		];
		retained(report, profile);
	});

	it("retains every canonical omission subset without manufacturing values", () => {
		for (let mask = 0; mask < 1 << selectedNames.length; mask++) {
			const report = fixture(profile);
			const primary = object(report.primaryResponse);
			primary.headers = {};
			primary.headerCapture = marker(
				selectedNames.filter((_, index) => (mask & (1 << index)) !== 0),
			);
			retained(report, profile);
		}
	});

	it("retains a mixture of present, omitted and absent unreported fields", () => {
		const report = fixture(profile);
		const primary = object(report.primaryResponse);
		primary.headerCapture = marker(["content-length", "cf-mitigated"]);
		object(primary.headers)["retry-after"] = [" 10\t"];
		retained(report, profile);
	});

	it("replays a successful capture with independent pins and detached cleanup", () => {
		const report = fixture(profile);
		const primary = object(report.primaryResponse);
		primary.headerCapture = marker(["content-length"]);
		object(primary.headers)["retry-after"] = ["0", " 1\t"];
		const emission = serialize(report, profile);
		const before = emission.jsonl.slice();
		const trusted = authority(emission.jsonl, profile);
		const first = validateResearchReplayAdmission(emission.jsonl, trusted);
		const second = validateResearchReplayAdmission(emission.jsonl, trusted);
		try {
			expect(first.kind).toBe("validated-capture");
			expect(second.kind).toBe("validated-capture");
			if (
				first.kind !== "validated-capture" ||
				second.kind !== "validated-capture"
			)
				throw new Error("Expected pinned synthetic header capture");
			expect(first.body).toEqual(source);
			expect(first.bodyIdentity).toEqual(trusted.expectedBody);
			expect(first.receiptSha256).toBe(hash(before));
			expect(first.receiptBytes).toBe(before.byteLength);
			expect(first.selectedProfile).toBe(profile);
			expect(first.originalMetadata.primaryResponse).toEqual(primary);
			expect(Object.isFrozen(first.originalMetadata.primaryResponse)).toBe(
				true,
			);
			expect(first.body.buffer).not.toBe(second.body.buffer);
			first.body.fill(0);
			expect(second.body).toEqual(source);
			expect(emission.jsonl).toEqual(before);
			expect(first).not.toHaveProperty("runtimeVerified");
			expect(first).not.toHaveProperty("networkAuthenticated");
		} finally {
			first.body?.fill(0);
			second.body?.fill(0);
		}
	});

	it("does not replace receipt or body authority with header evidence", () => {
		const report = fixture(profile);
		object(object(report.primaryResponse).headers)["retry-after"] = ["0"];
		const raw = serialize(report, profile).jsonl;
		const trusted = authority(raw, profile);
		for (const change of [
			{ expectedReceiptSha256: "0".repeat(64) },
			{ expectedBody: { bytes: source.byteLength + 1, sha256: hash(source) } },
			{ expectedBody: { bytes: source.byteLength, sha256: "0".repeat(64) } },
		])
			rejects(() =>
				validateResearchReplayAdmission(raw, { ...trusted, ...change }),
			);
		expect(
			validateResearchReplayAdmission(raw, {
				expectedProfile: profile,
				expectedReceiptSha256: hash(raw),
			}),
		).toMatchObject({
			kind: "evidence-only",
			reason: "body-pin-missing",
			body: null,
		});
	});

	it.each(["challenge", "login", "access-denied", "javascript-required"])(
		"never upgrades a %s barrier into replayable content",
		(barrier) => {
			const report = fixture(profile);
			report.outcome = "semantic-barrier";
			report.contentSuccess = false;
			object(report.classification).barrier = barrier;
			object(object(report.primaryResponse).headers)["cf-mitigated"] = [
				"challenge",
			];
			object(object(report.primaryResponse).headers)["retry-after"] = ["120"];
			object(report.bodyCapture).data = "deliberately-invalid-base64";
			const emission = serialize(report, profile);
			const result = validateResearchReplayAdmission(
				emission.jsonl,
				authority(emission.jsonl, profile),
			);
			expect(result).toMatchObject({
				kind: "evidence-only",
				reason: "native-failure",
				body: null,
				bodyIdentity: null,
			});
			expect(result.originalMetadata.primaryResponse).toEqual(
				report.primaryResponse,
			);
		},
	);
});

it.each([
	["null", null],
	["array", []],
	["string", "selected-response-headers-v1"],
	["boolean", true],
	["number", 1],
	["empty object", {}],
	["missing kind", { partial: true, omitted: [] }],
	["wrong kind", { ...marker(), kind: "selected-response-headers-v3" }],
	["missing partial", { kind: "selected-response-headers-v1", omitted: [] }],
	["false partial", { ...marker(), partial: false }],
	["string partial", { ...marker(), partial: "true" }],
	["missing omitted", { kind: "selected-response-headers-v1", partial: true }],
	["null omitted", { ...marker(), omitted: null }],
	["string omitted", { ...marker(), omitted: "retry-after" }],
	["object omitted", { ...marker(), omitted: {} }],
	["extra field", { ...marker(), complete: true }],
])("rejects a %s capture marker", (_, value) => {
	rejectSchema((primary) => {
		primary.headerCapture = value;
	});
});

it.each(profiles)(
	"rejects own-undefined markers and fields before %s JSON omission",
	(profile) => {
		for (const value of [
			undefined,
			{ ...marker(), kind: undefined },
			{ ...marker(), partial: undefined },
			{ ...marker(), omitted: undefined },
			{ ...marker(), extra: undefined },
		]) {
			const report = fixture(profile);
			object(report.primaryResponse).headerCapture = value;
			rejects(() => serialize(report, profile));
			if (profile === "default")
				rejects(() =>
					serializeResearchReport(
						report as unknown as ResearchNavigationReport,
					),
				);
		}
	},
);

it.each([null, [], "headers"])(
	"rejects a non-record selected header container: %j",
	(headers) => {
		rejectSchema((primary) => {
			primary.headers = headers;
		});
	},
);

it.each(profiles)(
	"rejects own-undefined selected fields before %s serialization",
	(profile) => {
		const report = fixture(profile);
		object(object(report.primaryResponse).headers)["retry-after"] = undefined;
		rejects(() => serialize(report, profile));
	},
);

it.each([
	["unknown", ["set-cookie"]],
	["mixed case", ["Retry-After"]],
	["non-string", [null]],
	["duplicate", ["retry-after", "retry-after"]],
	["out of order", ["retry-after", "content-length"]],
	["retained conflict", ["content-type"]],
])("rejects %s omissions", (_, omitted) => {
	rejectSchema((primary) => {
		primary.headerCapture = { ...marker(), omitted };
	});
});

it.each(selectedNames)("rejects retained/omitted conflicts for %s", (name) => {
	rejectSchema((primary) => {
		object(primary.headers)[name] = ["synthetic"];
		primary.headerCapture = marker([name]);
	});
});

it.each([
	"set-cookie",
	"cookie",
	"authorization",
	"location",
	"x-synthetic",
	"Content-Type",
	"Retry-After",
	"__proto__",
	"constructor",
])("rejects the unselected header %s", (name) => {
	rejectSchema((primary) => {
		primary.headers = { ...object(primary.headers), [name]: ["synthetic"] };
	});
});

describe.each(selectedNames)("selected field %s", (name) => {
	it.each([
		["null", null],
		["scalar", "synthetic"],
		["array-like object", { 0: "synthetic", length: 1 }],
		["empty array", []],
		["17 values", Array.from({ length: 17 }, () => "synthetic")],
		["161 units", ["x".repeat(161)]],
		["number entry", [1]],
		["null entry", [null]],
		["nested entry", [["synthetic"]]],
		["mixed invalid entry", ["valid", false]],
	])("rejects %s instead of dropping or clipping it", (_, values) => {
		rejectSchema((primary) => {
			object(primary.headers)[name] = values;
		});
	});
});

it.each([
	...Array.from({ length: 32 }, (_, code) => code).filter((code) => code !== 9),
	127,
	256,
	0x2028,
	0xd800,
	0xdc00,
])(
	"rejects header-unsafe code unit %i even inside an otherwise valid value",
	(code) => {
		rejectSchema((primary) => {
			object(primary.headers)["retry-after"] = [
				"valid",
				`before${String.fromCharCode(code)}after`,
			];
		});
	},
);

it.each(profiles)(
	"retains no-marker legacy behavior under %s without upgrading",
	(profile) => {
		for (const name of selectedNames.slice(0, 3)) {
			for (const values of [
				[],
				[""],
				["é".repeat(160), "😀".repeat(80)],
				["\0\r\n", "\ud800"],
			]) {
				const report = fixture(profile);
				const primary = object(report.primaryResponse);
				Reflect.deleteProperty(primary, "headerCapture");
				object(primary.headers)["content-length"] = ["1", "2"];
				object(primary.headers)[name] = values;
				retained(report, profile);
				expect(
					serialize(report, profile).record.primaryResponse,
				).not.toHaveProperty("headerCapture");
			}
		}
	},
);

it.each([
	["cf-mitigated", ["challenge"]],
	["retry-after", ["0"]],
	["content-encoding", ["one", "two", "three"]],
	["content-encoding", ["x".repeat(161)]],
	["content-encoding", "gzip"],
	["content-encoding", [null]],
])(
	"does not admit legacy %s values %j under the new bounds",
	(name, values) => {
		rejectSchema((primary) => {
			Reflect.deleteProperty(primary, "headerCapture");
			object(primary.headers)[String(name)] = values;
		});
	},
);

it("preserves no-marker omitted/default serialization without retrofitting legacy validation", () => {
	const report = fixture("default");
	const primary = object(report.primaryResponse);
	Reflect.deleteProperty(primary, "headerCapture");
	object(primary.headers)["cf-mitigated"] = ["challenge"];
	for (const emission of [
		serializeResearchReport(report as unknown as ResearchNavigationReport),
		serialize(report, "default"),
	]) {
		expect(emission.jsonl).toEqual(jsonl(report));
		expect(emission.metadataBytes).toBeNull();
		rejects(() =>
			validateResearchReplayAdmission(
				emission.jsonl,
				authority(emission.jsonl, "default"),
			),
		);
	}
});

it.each(profiles)(
	"validates explicit markers before %s evidence-only returns",
	(profile) => {
		for (const evidenceCase of ["barrier", "missing-capture", "missing-pin"]) {
			const report = fixture(profile);
			if (evidenceCase === "barrier") {
				report.outcome = "semantic-barrier";
				object(report.classification).barrier = "challenge";
			} else if (evidenceCase === "missing-capture")
				Reflect.deleteProperty(report, "bodyCapture");
			object(report.primaryResponse).headerCapture = null;
			const raw = jsonl(report);
			const trusted = authority(raw, profile);
			rejects(() =>
				validateResearchReplayAdmission(
					raw,
					evidenceCase === "missing-pin"
						? { expectedProfile: profile, expectedReceiptSha256: hash(raw) }
						: trusted,
				),
			);
		}
	},
);

it("does not retrofit legacy header validation into default metadata-only records", () => {
	const report = fixture("default");
	const primary = object(report.primaryResponse);
	Reflect.deleteProperty(primary, "headerCapture");
	object(primary.headers)["cf-mitigated"] = ["challenge"];
	report.outcome = "semantic-barrier";
	object(report.classification).barrier = "challenge";
	const emission = serialize(report, "default");
	const result = validateResearchReplayAdmission(
		emission.jsonl,
		authority(emission.jsonl, "default"),
	);
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
		bodyIdentity: null,
	});
	expect(result.originalMetadata.primaryResponse).toEqual(primary);
});

it.each(["metadata-bytes", "receipt-bytes"])(
	"retains marker and whole headers through long %s output projection",
	(cause) => {
		const report = fixture("long-v1");
		const primary = object(report.primaryResponse);
		primary.headerCapture = marker(["content-length", "content-encoding"]);
		object(primary.headers)["cf-mitigated"] = ["challenge", " challenge\t"];
		object(primary.headers)["retry-after"] = Array.from({ length: 16 }, () =>
			"é".repeat(160),
		);
		if (cause === "metadata-bytes")
			report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
		else object(report.bodyCapture).data = "A".repeat(maxReceiptBytes + 1);
		const before = structuredClone(report);
		const emission = serialize(report, "long-v1");
		expect(emission.disposition).toBe("output-limit");
		expect(emission.record.primaryResponse).toEqual(primary);
		expect(emission.record).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "evidence-output" },
			outputLimit: {
				cause,
				metadataRetention: "bounded-projection",
				omittedPayloads: ["bodyCapture", "headings"],
			},
		});
		expect(emission.record).not.toHaveProperty("bodyCapture");
		expect(emission.record).not.toHaveProperty("headings");
		expect(emission.receiptBytes).toBe(emission.jsonl.byteLength);
		expect(emission.receiptBytes).toBeLessThanOrEqual(maxReceiptBytes);
		expect(emission.metadataBytes).toBeLessThanOrEqual(maxMetadataBytes);
		const result = validateResearchReplayAdmission(
			emission.jsonl,
			authority(emission.jsonl, "long-v1"),
		);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "payload-omitted",
			body: null,
			bodyIdentity: null,
		});
		expect(result.originalMetadata.primaryResponse).toEqual(primary);
		expect(report).toEqual(before);
	},
);

it("keeps legacy markers absent through long output projection", () => {
	const report = fixture("long-v1");
	Reflect.deleteProperty(object(report.primaryResponse), "headerCapture");
	report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
	const emission = serialize(report, "long-v1");
	expect(emission.disposition).toBe("output-limit");
	expect(emission.record.primaryResponse).toEqual(report.primaryResponse);
	expect(emission.record.primaryResponse).not.toHaveProperty("headerCapture");
});

it("does not relax long HTML replay admission for captured conflicting content types", () => {
	for (const values of [
		["text/html", "text/html"],
		["text/html", "text/plain"],
		[],
	]) {
		const report = fixture("long-v1");
		const primary = object(report.primaryResponse);
		if (values.length === 0) {
			primary.headers = {};
			primary.headerCapture = marker(["content-type"]);
		} else object(primary.headers)["content-type"] = values;
		expect(serialize(report, "long-v1").disposition).toBe("complete");
		rejects(() => replay(report, "long-v1"));
	}
});

it.each([
	{ active: 1, closed: true },
	{ active: 0, closed: false },
])(
	"requires recorded transport cleanup despite valid selected headers: %j",
	(metrics) => {
		const report = fixture("long-v1");
		Object.assign(object(report.metrics), metrics);
		expect(replay(report, "long-v1")).toMatchObject({
			kind: "evidence-only",
			reason: "discovery-incomplete",
			body: null,
			bodyIdentity: null,
		});
	},
);

describe.each(["omitted", "default"] as const)(
	"explicit-header default serialization with %s profile selection",
	(selection) => {
		function emit(report: Fixture) {
			return serializeResearchReport(
				report as unknown as ResearchNavigationReport,
				selection === "omitted" ? undefined : "default",
			);
		}

		it.each(["marked", "legacy"])(
			"rejects an own-undefined fragment before pruning a %s report",
			(capture) => {
				const report = fixture("default");
				if (capture === "legacy")
					Reflect.deleteProperty(
						object(report.primaryResponse),
						"headerCapture",
					);
				expect(emit(report).record).not.toHaveProperty("fragment");
				report.fragment = undefined;
				rejects(() => emit(report));
				expect(Object.hasOwn(report, "fragment")).toBe(true);
				expect(report.fragment).toBeUndefined();
			},
		);

		it.each(["marked", "legacy"])(
			"rejects an extra own-undefined fragment field before pruning a %s report",
			(capture) => {
				const report = fixture("default");
				if (capture === "legacy")
					Reflect.deleteProperty(
						object(report.primaryResponse),
						"headerCapture",
					);
				const fragment = researchFragmentReport(
					`${url}#synthetic`,
					`${url}#synthetic`,
				);
				expect(fragment).toBeDefined();
				report.fragment = fragment;
				const baseline = emit(report);
				expect(baseline.disposition).toBe("complete");
				expect(object(baseline.record).fragment).toEqual(fragment);
				object(fragment).syntheticExtra = undefined;
				rejects(() => emit(report));
				expect(Object.hasOwn(object(fragment), "syntheticExtra")).toBe(true);
				expect(object(fragment).syntheticExtra).toBeUndefined();
			},
		);

		it.each(["marked", "legacy"])(
			"rejects own-undefined effective identity before pruning a pending %s fragment",
			(capture) => {
				const report = fixture("default");
				if (capture === "legacy")
					Reflect.deleteProperty(
						object(report.primaryResponse),
						"headerCapture",
					);
				const fragment = researchFragmentReport(`${url}#synthetic`);
				expect(fragment).toMatchObject({ resolution: "pending" });
				expect(fragment).not.toHaveProperty("effective");
				report.fragment = fragment;
				const baseline = emit(report);
				expect(baseline.disposition).toBe("complete");
				expect(object(baseline.record).fragment).toEqual(fragment);
				object(fragment).effective = undefined;
				rejects(() => emit(report));
				expect(Object.hasOwn(object(fragment), "effective")).toBe(true);
				expect(object(fragment).effective).toBeUndefined();
			},
		);

		it("rejects a preceding report getter without letting it rewrite validated headers", () => {
			const original = fixture("default");
			const primary = object(original.primaryResponse);
			const before = structuredClone(primary);
			const hook = vi.fn(() => {
				primary.headers = { "set-cookie": ["synthetic-private-value"] };
				return "synthetic";
			});
			const report = Object.assign(
				Object.defineProperty({}, "syntheticBeforePrimary", {
					get: hook,
					enumerable: true,
				}),
				original,
			);
			rejects(() => emit(report));
			expect(hook).not.toHaveBeenCalled();
			expect(primary).toEqual(before);
		});

		it("rejects root toJSON without invoking or emitting its replacement", () => {
			const report = fixture("default");
			const hook = vi.fn(() => ({ syntheticReplacement: true }));
			report.toJSON = hook;
			rejects(() => emit(report));
			expect(hook).not.toHaveBeenCalled();
		});

		it.each(["bodyCapture", "headings"])(
			"rejects nested %s getters and toJSON without invoking them",
			(field) => {
				for (const hookKind of ["getter", "toJSON"]) {
					const report = fixture("default");
					const hook = vi.fn(() => {
						throw new Error("Synthetic payload hook must not run");
					});
					const payload = object(report[field]);
					if (hookKind === "getter")
						Object.defineProperty(
							payload,
							field === "bodyCapture" ? "data" : "entries",
							{ get: hook, enumerable: true },
						);
					else payload.toJSON = hook;
					rejects(() => emit(report));
					expect(hook).not.toHaveBeenCalled();
				}
			},
		);

		it("rejects an accessor-backed primary before marker detection", () => {
			const report = fixture("default");
			const primary = report.primaryResponse;
			const hook = vi.fn(() => primary);
			Object.defineProperty(report, "primaryResponse", {
				get: hook,
				enumerable: true,
			});
			rejects(() => emit(report));
			expect(hook).not.toHaveBeenCalled();
		});

		it.each(["report", "primaryResponse", "bodyCapture"])(
			"rejects %s proxies before any reflection traps",
			(location) => {
				for (const trapKind of ["counting", "throwing"]) {
					const report = fixture("default");
					const target =
						location === "report" ? report : object(report[location]);
					const descriptor = vi.fn((value: Fixture, name: string | symbol) => {
						if (trapKind === "throwing")
							throw new Error("Synthetic descriptor trap must not run");
						return Reflect.getOwnPropertyDescriptor(value, name);
					});
					const hook = vi.fn(() => {
						throw new Error("Synthetic reflection trap must not run");
					});
					const proxy = new Proxy(target, {
						getOwnPropertyDescriptor: descriptor,
						get: hook,
						has: hook,
						ownKeys: hook,
						getPrototypeOf: hook,
					});
					if (location !== "report") report[location] = proxy;
					rejects(() => emit(location === "report" ? proxy : report));
					expect(descriptor).not.toHaveBeenCalled();
					expect(hook).not.toHaveBeenCalled();
				}
			},
		);

		it.each(["report", "primaryResponse", "bodyCapture"])(
			"rejects a revoked %s proxy with a controlled error",
			(location) => {
				const report = fixture("default");
				const target =
					location === "report" ? report : object(report[location]);
				const hook = vi.fn(() => {
					throw new Error("Synthetic revoked proxy hook must not run");
				});
				const revoked = Proxy.revocable(target, {
					get: hook,
					getOwnPropertyDescriptor: hook,
				});
				revoked.revoke();
				if (location !== "report") report[location] = revoked.proxy;
				rejects(() => emit(location === "report" ? revoked.proxy : report));
				expect(hook).not.toHaveBeenCalled();
			},
		);

		it.each(["report", "payload", "array"])(
			"rejects %s cycles rather than recursing into a native stringify error",
			(location) => {
				const report = fixture("default");
				if (location === "report") report.syntheticCycle = report;
				else if (location === "payload") {
					const payload = object(report.bodyCapture);
					payload.syntheticCycle = payload;
				} else {
					const cycle: unknown[] = [];
					cycle.push(cycle);
					report.syntheticCycle = cycle;
				}
				rejects(() => emit(report));
			},
		);

		it("emits and returns the same detached full graph despite caller mutation", () => {
			const report = fixture("default");
			const primary = object(report.primaryResponse);
			const values = ["0", " 10\t", "0"];
			const omitted = ["content-length", "content-encoding"];
			object(primary.headers)["retry-after"] = values;
			primary.headerCapture = marker(omitted);
			const before = structuredClone(report);
			const expectedJsonl = jsonl(before);
			const emission = emit(report);
			const emittedPrimary = object(emission.record.primaryResponse);
			expect(emission.disposition).toBe("complete");
			expect(emission.record).not.toBe(report);
			expect(emittedPrimary).not.toBe(primary);
			expect(emittedPrimary.headers).not.toBe(primary.headers);
			expect(object(emittedPrimary.headers)["retry-after"]).not.toBe(values);
			expect(emittedPrimary.headerCapture).not.toBe(primary.headerCapture);
			expect(object(emittedPrimary.headerCapture).omitted).not.toBe(omitted);
			expect(emission.record.bodyCapture).not.toBe(report.bodyCapture);
			expect(emission.record.headings).not.toBe(report.headings);
			expect(report).toEqual(before);
			values[0] = "999";
			values.push("synthetic-later-value");
			omitted.reverse();
			object(primary.headerCapture).kind = "synthetic-later-kind";
			primary.headers = { "set-cookie": ["synthetic-private-value"] };
			object(report.bodyCapture).data = "synthetic-later-payload";
			object(report.headings).entries = [];
			report.outcome = "failure";
			expect(emission.record).toEqual(before);
			expect(emission.jsonl).toEqual(expectedJsonl);
			expect(jsonl(emission.record)).toEqual(emission.jsonl);
			expect(JSON.parse(new TextDecoder().decode(emission.jsonl))).toEqual(
				emission.record,
			);
			expect(emission.receiptBytes).toBe(expectedJsonl.byteLength);
			expect(emission.metadataBytes).toBeNull();
			expect(emission.exitReport).toEqual({ outcome: "extracted-unverified" });
		});

		it.each(["depth", "properties"])(
			"does not retrofit long %s limits onto explicit default emission",
			(bound) => {
				const report = fixture("default");
				if (bound === "depth") {
					let nested: Fixture = {};
					for (let depth = 1; depth < 33; depth++) nested = { child: nested };
					report.syntheticGraph = nested;
				} else {
					report.syntheticGraph = Object.fromEntries(
						Array.from({ length: 16_385 }, (_, index) => [String(index), 0]),
					);
				}
				const expectedJsonl = jsonl(report);
				const emission = emit(report);
				expect(emission.disposition).toBe("complete");
				expect(emission.record).toEqual(report);
				expect(emission.record).not.toBe(report);
				expect(object(emission.record).syntheticGraph).not.toBe(
					report.syntheticGraph,
				);
				expect(emission.jsonl).toEqual(expectedJsonl);
				expect(emission.receiptBytes).toBe(expectedJsonl.byteLength);
				expect(emission.metadataBytes).toBeNull();
				rejects(
					() =>
						validateResearchReplayAdmission(
							emission.jsonl,
							authority(emission.jsonl, "default"),
						),
					"resource-limit",
				);
				const long = {
					...report,
					admission: researchLongAdmissionProvenance,
				};
				rejects(() => serialize(long, "long-v1"), "resource-limit");
				rejects(() => replay(long, "long-v1"), "resource-limit");
				const legacy = {
					...report,
					primaryResponse: { ...object(report.primaryResponse) },
				};
				Reflect.deleteProperty(object(legacy.primaryResponse), "headerCapture");
				expect(emit(legacy).jsonl).toEqual(jsonl(legacy));
			},
		);
	},
);

it("keeps explicit-header long serialization and replay depth bounds at 32/33", () => {
	expect(researchEvidenceCodecLimits.maxDepth).toBe(32);
	for (const depth of [32, 33]) {
		const report = fixture("long-v1");
		let nested: Fixture = {};
		for (let level = 1; level < depth; level++) nested = { child: nested };
		report.syntheticGraph = nested;
		if (depth === 33) {
			rejects(() => serialize(report, "long-v1"), "resource-limit");
			rejects(() => replay(report, "long-v1"), "resource-limit");
		} else {
			expect(serialize(report, "long-v1").disposition).toBe("complete");
			const result = replay(report, "long-v1");
			try {
				expect(result.kind).toBe("validated-capture");
			} finally {
				result.body?.fill(0);
			}
		}
	}
});

it("keeps explicit-header long serialization and replay property bounds at 16384/16385", () => {
	function countProperties(value: unknown): number {
		if (value === null || typeof value !== "object") return 0;
		const values = Object.values(value);
		return (
			values.length +
			values.reduce<number>((count, entry) => count + countProperties(entry), 0)
		);
	}
	expect(researchEvidenceCodecLimits.maxProperties).toBe(16_384);
	for (const properties of [16_384, 16_385]) {
		const report = fixture("long-v1");
		report.syntheticGraph = [];
		report.syntheticGraph = new Array(
			properties - countProperties(report),
		).fill(0);
		expect(countProperties(report)).toBe(properties);
		if (properties === 16_385) {
			rejects(() => serialize(report, "long-v1"), "resource-limit");
			rejects(() => replay(report, "long-v1"), "resource-limit");
		} else {
			expect(serialize(report, "long-v1").disposition).toBe("complete");
			const result = replay(report, "long-v1");
			try {
				expect(result.kind).toBe("validated-capture");
			} finally {
				result.body?.fill(0);
			}
		}
	}
});
