import { describe, expect, it, vi } from "vitest";
import { pageWebSocketCheckLabels } from "./page-websocket-check-labels.js";
import { validateSafeJsReleaseEvidence } from "./safejs-release-evidence.js";

const version = "0.1.640";
const checkIds = [
	"constructor-identity",
	"synchronous-admission",
	"connecting",
	"open",
	"text-send",
	"text-receive",
	"binary-send",
	"binary-receive",
	"listeners",
	"close-open",
	"close-connecting",
	"bootstrap-authority",
	"document-cleanup",
	"realm-cleanup",
	"all-owners-closed",
];

function evidence() {
	return {
		startedAt: "2026-09-18T01:00:00.000Z",
		finishedAt: "2026-09-18T01:00:01.000Z",
		selected: { packageName: "@poe-platform/safe-js", version },
		scope: "explicit-local-release-websocket-bridge-in-memory",
		realNetwork: false,
		realSockets: false,
		realPty: false,
		credentials: false,
		devices: false,
		publicationProvenanceVerified: false,
		completed: true,
		plannedCheckIds: [...checkIds],
		checks: pageWebSocketCheckLabels.map((label, index) => ({
			id: checkIds[index],
			label,
			passed: true,
		})),
		passed: 15,
		failed: 0,
		notReached: [],
		cleanupFailures: [],
		evidence: [],
	};
}

function validate(value: unknown) {
	return validateSafeJsReleaseEvidence("websocket", value, version);
}

describe("separate WebSocket bridge evidence", () => {
	it("accepts exactly fifteen ordered checks without modifying the report", () => {
		const encoded = JSON.stringify(evidence());
		const value = JSON.parse(encoded);
		expect(pageWebSocketCheckLabels).toHaveLength(15);
		expect(validate(value)).toBe(true);
		expect(JSON.stringify(value)).toBe(encoded);
	});
	it("accepts equal timestamps and null-prototype own data records", () => {
		const value = evidence();
		value.finishedAt = value.startedAt;
		Object.setPrototypeOf(value, null);
		Object.setPrototypeOf(value.selected, null);
		for (const check of value.checks) Object.setPrototypeOf(check, null);
		expect(validate(value)).toBe(true);
	});
	it.each([null, undefined, false, 15, "evidence", [], new Date(0)])(
		"rejects malformed report %s",
		(value) => expect(validate(value)).toBe(false),
	);
	it.each([
		["completed", false],
		["completed", "true"],
		["publicationProvenanceVerified", true],
		["realNetwork", true],
		["realSockets", true],
		["realPty", true],
		["credentials", true],
		["devices", true],
		["passed", 14],
		["passed", 16],
		["passed", "15"],
		["failed", 1],
		["failed", "0"],
		["notReached", ["all-owners-closed"]],
		["notReached", { length: 0 }],
		["cleanupFailures", [{ stage: "close", message: "failed" }]],
		["cleanupFailures", { length: 0 }],
		["selected", null],
		["selected", { packageName: "safe-js", version }],
		["selected", { packageName: "@poe-platform/safe-js", version: "0.1.639" }],
		["startedAt", "invalid"],
		["startedAt", "2026-09-18T01:00:02.000Z"],
		["startedAt", 0],
		["finishedAt", "2026-09-18T01:00:01Z"],
		["finishedAt", "2026-09-18T01:00:01.000+00:00"],
		["checks", []],
		["checks", { length: 15 }],
		["plannedCheckIds", []],
		["plannedCheckIds", { length: 15 }],
		["scope", "explicit-local-release-contract-probe"],
		["scope", "explicit-local-release-native-browser-in-memory"],
		["scope", "explicit-local-release-html-modules-in-memory"],
	])("rejects inconsistent %s", (field, value) => {
		expect(validate({ ...evidence(), [field as string]: value })).toBe(false);
	});
	it.each([undefined, null, false, "", { stage: "bridge", message: "failed" }])(
		"rejects any own failure property even when its value is %s",
		(failure) => expect(validate({ ...evidence(), failure })).toBe(false),
	);
	it.each([
		"startedAt",
		"finishedAt",
		"selected",
		"scope",
		"realNetwork",
		"realSockets",
		"realPty",
		"credentials",
		"devices",
		"publicationProvenanceVerified",
		"completed",
		"plannedCheckIds",
		"checks",
		"passed",
		"failed",
		"notReached",
		"cleanupFailures",
	])("requires own data for %s without calling accessors", (field) => {
		const value = evidence();
		const descriptor = Object.getOwnPropertyDescriptor(value, field);
		const getter = vi.fn(() => descriptor?.value);
		Object.defineProperty(value, field, { get: getter, configurable: true });
		expect(validate(value)).toBe(false);
		expect(getter).not.toHaveBeenCalled();
		Reflect.deleteProperty(value, field);
		expect(validate(value)).toBe(false);
	});
	it.each(["packageName", "version"])(
		"rejects selected %s accessors without calling them",
		(field) => {
			const value = evidence();
			const descriptor = Object.getOwnPropertyDescriptor(value.selected, field);
			const getter = vi.fn(() => descriptor?.value);
			Object.defineProperty(value.selected, field, { get: getter });
			expect(validate(value)).toBe(false);
			expect(getter).not.toHaveBeenCalled();
		},
	);
	it.each(["id", "label", "passed"])(
		"rejects check %s accessors without calling them",
		(field) => {
			const value = evidence();
			const descriptor = Object.getOwnPropertyDescriptor(
				value.checks[0],
				field,
			);
			const getter = vi.fn(() => descriptor?.value);
			Object.defineProperty(value.checks[0], field, { get: getter });
			expect(validate(value)).toBe(false);
			expect(getter).not.toHaveBeenCalled();
		},
	);
	it.each(["checks", "plannedCheckIds"] as const)(
		"rejects sparse and accessor-backed %s without reading getters",
		(field) => {
			const value = evidence();
			const descriptor = Object.getOwnPropertyDescriptor(value[field], "0");
			const getter = vi.fn(() => descriptor?.value);
			Object.defineProperty(value[field], "0", {
				get: getter,
				configurable: true,
			});
			expect(validate(value)).toBe(false);
			expect(getter).not.toHaveBeenCalled();
			Reflect.deleteProperty(value[field], "0");
			expect(validate(value)).toBe(false);
		},
	);
	it.each(Array.from({ length: 15 }, (_value, index) => index))(
		"requires check %s to have the exact label, ID and literal success",
		(index) => {
			for (const replacement of [
				{ label: "forged label" },
				{ id: "forged-id" },
				{ passed: false },
				{ passed: 1 },
			]) {
				const value = evidence();
				Object.assign(value.checks[index], replacement);
				expect(validate(value)).toBe(false);
			}
		},
	);
	it("rejects partial, extra, reordered and duplicated check arrays", () => {
		const value = evidence();
		for (const checks of [
			value.checks.slice(0, 14),
			[...value.checks, value.checks[0]],
			[...value.checks].reverse(),
			Array(15).fill(value.checks[0]),
		])
			expect(validate({ ...value, checks })).toBe(false);
		for (const plannedCheckIds of [
			checkIds.slice(0, 14),
			[...checkIds, checkIds[0]],
			[...checkIds].reverse(),
			Array(15).fill(checkIds[0]),
		])
			expect(validate({ ...value, plannedCheckIds })).toBe(false);
	});
	it("rejects inherited success fields and selected metadata", () => {
		expect(validate(Object.create(evidence()))).toBe(false);
		const value = evidence();
		value.selected = Object.create(value.selected);
		expect(validate(value)).toBe(false);
	});
	it("rejects exceptional report reflection without escaping", () => {
		const value = new Proxy(evidence(), {
			getOwnPropertyDescriptor() {
				throw new Error("Synthetic reflection failure");
			},
		});
		expect(validate(value)).toBe(false);
	});
	it.each(["core", "page", "modules"] as const)(
		"does not substitute bridge evidence for the %s gate",
		(kind) => {
			expect(validateSafeJsReleaseEvidence(kind, evidence(), version)).toBe(
				false,
			);
		},
	);
	it("requires the selected version to match the separately supplied pin", () => {
		expect(
			validateSafeJsReleaseEvidence("websocket", evidence(), "0.1.639"),
		).toBe(false);
	});
});
