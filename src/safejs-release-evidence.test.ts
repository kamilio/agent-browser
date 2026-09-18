import { describe, expect, it, vi } from "vitest";
import { validateSafeJsReleaseEvidence } from "./safejs-release-evidence.js";

const version = "1.2.3";
const labels = {
	core: [
		"Realm-owned host aliases preserve identity and indexed reads",
		"Indexed capabilities remain live across evaluations",
		"Named writes reach native storage",
		"Named deletion reaches native storage",
		"Native named updates are visible without replacing the host object",
		"Named mutation cannot overwrite fixed members",
		"Explicit nested operations finish before the next guest statement",
		"Repeated close runs extension cleanup exactly once",
		"Closed realms reject further evaluation",
		"Context callback prefix completes while the final result remains pending",
		"Realm callback progresses while an earlier async tail is pending",
		"A new source evaluation progresses after a callback prefix while its async tail remains pending",
		"Callback result preserves async ordering and returned data",
		"Retained guest arguments can return through the owning callback",
		"Released guest references reject reuse",
		"Owner closure rejects a suspended callback without releasing its host wait",
		"Builtin console remains protected without explicit authorization before setup",
		"Authorized console and Window aliases share the actual owned host object",
		"Authorized console cleanup runs once across repeated owner closure",
	],
	page: [
		"Released extension setup preserves document, Window and owned console identity",
		"Owned console methods beyond the builtin sink remain available",
		"The shared console journal receives calls through the owned global",
		"Native label-targeted fill runs the released interpreter input handler",
		"Native click runs the released callback and updates the same document",
		"Retained timer arguments preserve guest identity, primitives and Window receiver",
		"Session-owned storage and history globals are declared and live",
		"Callback prefix cancellation prevents default without awaiting its pending async tail",
		"Reload closes the old extension owner while preserving session storage",
		"All released page owners close with no pending callbacks or timers",
	],
};

function fixture(kind: "core" | "page") {
	return {
		startedAt: "2026-09-18T10:00:00.000Z",
		finishedAt: "2026-09-18T10:00:01.000Z",
		selected: { packageName: "@poe-platform/safe-js", version },
		completed: true,
		publicationProvenanceVerified: false,
		...(kind === "core"
			? {
					scope: "explicit-local-release-contract-probe",
					browserIntegrationVerified: false,
					cleanupFailures: [],
				}
			: {
					scope: "explicit-local-release-native-browser-in-memory",
					realNetwork: false,
					realPty: false,
				}),
		checks: labels[kind].map((label) => ({ label, passed: true })),
		passed: labels[kind].length,
	};
}

describe("HTML module release evidence", () => {
	const moduleLabels = [
		"HTML module load completes without errors",
		"Inline modules mutate the native DOM in distinct scopes",
		"External entry imports its dependency",
		"Duplicate external entry evaluates and fetches once",
		"Modules keep document.currentScript null",
		"Thrown module error is surfaced without success",
		"All fixture owners close",
	];
	const evidence = () => ({
		...fixture("page"),
		scope: "explicit-local-release-html-modules-in-memory",
		failure: null,
		cleanupFailures: [],
		passed: 7,
		checks: moduleLabels.map((label) => ({ label, passed: true })),
	});
	it("accepts exact completed module fixture evidence", () =>
		expect(validateSafeJsReleaseEvidence("modules", evidence(), version)).toBe(
			true,
		));
	it.each([
		["failure", { stage: "fixture", message: "failed" }],
		["failure", undefined],
		["cleanupFailures", undefined],
		["cleanupFailures", [{ stage: "close", message: "failed" }]],
		["passed", 6],
		["checks", []],
		["realNetwork", true],
		["scope", "explicit-local-release-native-browser-in-memory"],
	])("rejects changed module %s", (field, value) =>
		expect(
			validateSafeJsReleaseEvidence(
				"modules",
				{ ...evidence(), [field as string]: value },
				version,
			),
		).toBe(false),
	);
	it("rejects reordered or duplicated checks", () => {
		const value = evidence();
		value.checks.reverse();
		expect(validateSafeJsReleaseEvidence("modules", value, version)).toBe(
			false,
		);
		value.checks = Array(7).fill(value.checks[0]);
		expect(validateSafeJsReleaseEvidence("modules", value, version)).toBe(
			false,
		);
	});
});

describe.each(["core", "page"] as const)("%s release evidence", (kind) => {
	const validate = (value: unknown) =>
		validateSafeJsReleaseEvidence(kind, value, version);

	it("accepts complete mocked JSON without changing it", () => {
		const encoded = JSON.stringify(fixture(kind));
		const evidence = JSON.parse(encoded);
		expect(validate(evidence)).toBe(true);
		expect(JSON.stringify(evidence)).toBe(encoded);
	});

	it("accepts equal timestamps and an explicit empty cleanup list", () => {
		const evidence = fixture(kind);
		evidence.finishedAt = evidence.startedAt;
		expect(validate({ ...evidence, cleanupFailures: [] })).toBe(true);
	});

	it.each([null, undefined, false, 19, "evidence", [], new Date()])(
		"rejects invalid top-level structure %s",
		(value) => expect(validate(value)).toBe(false),
	);

	it.each([
		["selected", null],
		["selected", []],
		["selected", version],
		["selected", {}],
		["selected", { packageName: "safe-js", version }],
		["selected", { packageName: "@poe-platform/safe-js", version: "1.2.4" }],
		["selected", { packageName: "@poe-platform/safe-js", version: 123 }],
		["scope", "other"],
		["completed", false],
		["completed", "true"],
		["completed", 1],
		["publicationProvenanceVerified", true],
		["publicationProvenanceVerified", 0],
		["failure", { stage: "cleanup", message: "failed" }],
		["failure", null],
		["failure", false],
		["failure", undefined],
		["passed", 0],
		["passed", 10],
		["passed", 19],
		["passed", String(labels[kind].length)],
		["passed", labels[kind].length + 0.5],
		["passed", true],
		["passed", Number.NaN],
		["checks", null],
		["checks", {}],
		["cleanupFailures", [{ fixture: "owner", message: "failed" }]],
		["cleanupFailures", null],
		["cleanupFailures", {}],
		["cleanupFailures", ""],
		["cleanupFailures", undefined],
	] as [string, unknown][])("validates %s = %j", (key, value) => {
		expect(validate({ ...fixture(kind), [key]: value })).toBe(
			key === "passed" && value === labels[kind].length,
		);
	});

	it.each([
		"selected",
		"scope",
		"completed",
		"publicationProvenanceVerified",
		"checks",
		"passed",
		"startedAt",
		"finishedAt",
		...(kind === "core"
			? ["browserIntegrationVerified", "cleanupFailures"]
			: ["realNetwork", "realPty"]),
	])("requires own data property %s without invoking getters", (key) => {
		const evidence: Record<string, unknown> = fixture(kind);
		const original = evidence[key];
		delete evidence[key];
		expect(validate(evidence)).toBe(false);
		const getter = vi.fn(() => original);
		Object.defineProperty(evidence, key, { get: getter });
		expect(validate(evidence)).toBe(false);
		expect(getter).not.toHaveBeenCalled();
	});

	it.each(
		kind === "core"
			? ["browserIntegrationVerified"]
			: ["realNetwork", "realPty"],
	)("requires %s to be exactly false", (key) => {
		for (const value of [true, 0, "false", null])
			expect(validate({ ...fixture(kind), [key]: value })).toBe(false);
	});

	it.each(["startedAt", "finishedAt"])(
		"validates timestamp %s strictly",
		(key) => {
			for (const value of [
				"",
				"invalid",
				"2026-09-18",
				"2026-09-18T10:00:00",
				"2026-02-30T10:00:00.000Z",
				"2026-09-18T25:00:00.000Z",
				0,
				null,
				new Date("2026-09-18T10:00:00.000Z"),
			])
				expect(validate({ ...fixture(kind), [key]: value })).toBe(false);
		},
	);

	it("rejects reversed timestamps, mismatched kind and version", () => {
		const evidence = fixture(kind);
		expect(
			validate({ ...evidence, finishedAt: "2026-09-18T09:59:59.999Z" }),
		).toBe(false);
		expect(validate(fixture(kind === "core" ? "page" : "core"))).toBe(false);
		expect(validateSafeJsReleaseEvidence(kind, evidence, "1.2.4")).toBe(false);
		expect(validateSafeJsReleaseEvidence(kind, evidence, "")).toBe(false);
	});

	it("rejects truncated, extended, duplicate, reordered and sparse checks", () => {
		const evidence = fixture(kind);
		const checks = evidence.checks;
		for (const changed of [
			checks.slice(0, -1),
			[...checks, checks[0]],
			[checks[0], ...checks.slice(0, -1)],
			[checks[1], checks[0], ...checks.slice(2)],
			new Array(checks.length),
		]) {
			expect(validate({ ...evidence, checks: changed })).toBe(false);
			expect(
				validate({ ...evidence, checks: changed, passed: changed.length }),
			).toBe(false);
		}
	});

	it("validates every check label, structure and boolean", () => {
		const evidence = fixture(kind);
		for (const [index, entry] of evidence.checks.entries()) {
			for (const changed of [
				null,
				[],
				{},
				{ ...entry, label: `${entry.label} ` },
				{ label: entry.label },
				{ passed: true },
				...[false, "true", 1, null].map((passed) => ({ ...entry, passed })),
			]) {
				const checks: unknown[] = [...evidence.checks];
				checks[index] = changed;
				expect(validate({ ...evidence, checks })).toBe(false);
			}
		}
	});

	it("rejects nested accessors without invoking them", () => {
		for (const target of [
			"selected",
			"entry",
			"index",
			"cleanupFailures",
			"failure",
		] as const) {
			const evidence = fixture(kind);
			const getter = vi.fn(() => {
				throw new Error("must not run");
			});
			const owner =
				target === "selected"
					? evidence.selected
					: target === "entry"
						? evidence.checks[0]
						: target === "index"
							? evidence.checks
							: evidence;
			const key =
				target === "selected"
					? "packageName"
					: target === "entry"
						? "passed"
						: target === "index"
							? "0"
							: target;
			Object.defineProperty(owner, key, { get: getter });
			expect(validate(evidence)).toBe(false);
			expect(getter).not.toHaveBeenCalled();
		}
	});

	it("rejects inherited evidence and catches hostile descriptor traps", () => {
		expect(validate(Object.create(fixture(kind)))).toBe(false);
		const evidence = fixture(kind);
		expect(
			validate({ ...evidence, selected: Object.create(evidence.selected) }),
		).toBe(false);
		expect(
			validate(
				new Proxy(evidence, {
					getOwnPropertyDescriptor() {
						throw new Error("invalid object");
					},
				}),
			),
		).toBe(false);
		const revoked = Proxy.revocable(evidence, {});
		revoked.revoke();
		expect(validate(revoked.proxy)).toBe(false);
	});
});
