import { expect, it } from "vitest";
import {
	CssDiagnosticCollector,
	type CssDiagnosticContext,
	type CssDiagnosticResolution,
} from "./css-diagnostics.js";
import type { SelectorNestingContext } from "./selectors.js";

const codes = [
	"invalid-css-declaration",
	"unimplemented-css-property",
	"unimplemented-or-invalid-css-value",
	"unimplemented-or-invalid-css-selector",
];

function text(value: string) {
	return { value, codeUnits: value.length, truncated: false };
}

function snapshot(collector: CssDiagnosticCollector) {
	return collector.snapshot(1, {}, {});
}

function expectDeeplyFrozen(value: unknown) {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

it("retains exact authored text, primitive context and leaf-first selectors", () => {
	const collector = new CssDiagnosticCollector();
	const id = collector.record(codes[2], {
		authoredProperty: "CoLoR",
		property: "color",
		value: '  unsupported("🧪")  ',
		important: false,
		selector: "& > .leaf",
		nesting: { selector: ".parent", parent: { selector: "#root" } },
		sheet: 0,
		importDepth: 2,
		owner: 37,
	});
	expect(id).toBe(0);
	expect(snapshot(collector).samples).toEqual([
		{
			id: 0,
			code: text(codes[2]),
			scope: "rule",
			sheet: 0,
			importDepth: 2,
			owner: 37,
			authoredProperty: text("CoLoR"),
			property: text("color"),
			value: text('  unsupported("🧪")  '),
			important: false,
			selectors: [text("& > .leaf"), text(".parent"), text("#root")],
			selectorChainTruncated: false,
			applicable: null,
			selectorState: "not-evaluated",
			mediaState: "not-evaluated",
		},
	]);
});

it("defaults to rule scope and distinguishes missing, empty and inline fields", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[0]);
	collector.record(codes[1], {
		scope: "inline",
		owner: 0,
		important: true,
		authoredProperty: "",
		property: "",
		value: "",
		selector: "",
	});
	const result = snapshot(collector);
	expect(result.samples[0]).toMatchObject({
		scope: "rule",
		selectors: [],
		selectorChainTruncated: false,
	});
	expect(result.samples[0].value).toBeUndefined();
	expect(result.samples[0].important).toBeUndefined();
	expect(result.samples[1]).toMatchObject({
		scope: "inline",
		owner: 0,
		important: true,
		authoredProperty: text(""),
		property: text(""),
		value: text(""),
		selectors: [text("")],
	});
	expect(result.truncated).toBe(false);
});

it("lists exactly the instrumented codes even in an empty nonexhaustive snapshot", () => {
	const collector = new CssDiagnosticCollector();
	expect(snapshot(collector)).toEqual({
		cascadeBuild: 1,
		issues: {},
		applicableIssues: {},
		instrumentedCodes: codes,
		samples: [],
		sampledOccurrences: 0,
		omittedOccurrences: 0,
		truncated: false,
		exhaustive: false,
	});
	for (const [index, code] of codes.entries()) {
		expect(collector.record(code)).toBe(index);
	}
	expect(snapshot(collector).samples.map((sample) => sample.code)).toEqual(
		codes.map(text),
	);
	expectDeeplyFrozen(snapshot(collector));
});

it("retains exactly 128 consecutive IDs and counts only instrumented omissions", () => {
	const collector = new CssDiagnosticCollector();
	for (let index = 0; index < 128; index++) {
		expect(collector.record(codes[index % codes.length])).toBe(index);
	}
	const full = snapshot(collector);
	expect(full.sampledOccurrences).toBe(128);
	expect(full.samples.map((sample) => sample.id)).toEqual(
		Array.from({ length: 128 }, (_, index) => index),
	);
	expect(full.omittedOccurrences).toBe(0);
	expect(full.truncated).toBe(false);
	for (const code of codes) expect(collector.record(code)).toBeUndefined();
	expect(collector.record("unimplemented-css-at-rule")).toBeUndefined();
	expect(snapshot(collector)).toMatchObject({
		sampledOccurrences: 128,
		omittedOccurrences: 4,
		truncated: true,
	});
	expect(snapshot(collector).samples).toEqual(full.samples);
	expect(full.omittedOccurrences).toBe(0);
	expect(full.truncated).toBe(false);
});

it("does not read contexts for unknown codes or after saturation", () => {
	const collector = new CssDiagnosticCollector();
	let reads = 0;
	const context = new Proxy({} as CssDiagnosticContext, {
		get() {
			reads++;
			throw new Error("Unexpected context read");
		},
		ownKeys() {
			throw new Error("Unexpected context enumeration");
		},
	});
	for (const code of [
		"",
		"INVALID-CSS-DECLARATION",
		"unknown",
		"x".repeat(100_000),
	]) {
		expect(collector.record(code, context)).toBeUndefined();
	}
	expect(snapshot(collector).omittedOccurrences).toBe(0);
	for (let index = 0; index < 128; index++) collector.record(codes[0]);
	for (let index = 0; index < 1_000; index++) {
		expect(
			collector.record(codes[index % codes.length], context),
		).toBeUndefined();
	}
	expect(collector.record("unknown", context)).toBeUndefined();
	expect(reads).toBe(0);
	expect(snapshot(collector).omittedOccurrences).toBe(1_000);
});

it("bounds huge text by UTF-16 units while reporting original lengths", () => {
	const collector = new CssDiagnosticCollector();
	const huge = `a${"🧪".repeat(100_000)}`;
	collector.record(codes[0], {
		authoredProperty: huge,
		property: huge,
		value: huge,
		selector: huge,
	});
	const result = snapshot(collector);
	const sample = result.samples[0];
	for (const [field, limit] of [
		[sample.authoredProperty, 128],
		[sample.property, 128],
		[sample.value, 256],
		[sample.selectors[0], 512],
	] as const) {
		expect(field).toEqual({
			value: huge.slice(0, limit),
			codeUnits: huge.length,
			truncated: true,
		});
		expect(field?.value.length).toBe(limit);
		expect(field?.value.charCodeAt(limit - 1)).toBe(0xd83e);
	}
	expect(sample.code.value.length).toBeLessThanOrEqual(96);
	expect(sample.selectorChainTruncated).toBe(true);
	expect(result.truncated).toBe(true);
});

it("does not mark exact text limits truncated", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[0], {
		authoredProperty: "a".repeat(128),
		property: "b".repeat(128),
		value: "c".repeat(256),
		selector: "d".repeat(512),
	});
	expect(snapshot(collector).truncated).toBe(false);
	expect(snapshot(collector).samples[0].selectorChainTruncated).toBe(false);
});

it.each(["authoredProperty", "property", "value"] as const)(
	"reports snapshot truncation for %s alone",
	(field) => {
		const collector = new CssDiagnosticCollector();
		collector.record(codes[0], { [field]: "x".repeat(257) });
		expect(snapshot(collector).truncated).toBe(true);
		expect(snapshot(collector).samples[0].selectorChainTruncated).toBe(false);
	},
);

it("shares the selector text budget across the leaf and nesting chain", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[3], {
		selector: "l".repeat(300),
		nesting: {
			selector: "p".repeat(300),
			get parent(): SelectorNestingContext {
				throw new Error("Traversal past truncated selector");
			},
		},
	});
	const sample = snapshot(collector).samples[0];
	expect(sample.selectors).toEqual([
		text("l".repeat(300)),
		{ value: "p".repeat(212), codeUnits: 300, truncated: true },
	]);
	expect(sample.selectorChainTruncated).toBe(true);
	expect(snapshot(collector).truncated).toBe(true);
});

it("does not read ancestor selectors after the text budget is exhausted", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[3], {
		selector: "l".repeat(512),
		nesting: {
			get selector(): string {
				throw new Error("Selector read after text budget");
			},
		},
	});
	const sample = snapshot(collector).samples[0];
	expect(sample.selectors).toEqual([text("l".repeat(512))]);
	expect(sample.selectorChainTruncated).toBe(true);
});

it("allows exactly 17 segments and stops before reading an eighteenth", () => {
	const collector = new CssDiagnosticCollector();
	let nesting: SelectorNestingContext | undefined;
	for (let index = 15; index >= 0; index--) {
		nesting = { selector: `parent-${index}`, parent: nesting };
	}
	collector.record(codes[3], { selector: "leaf", nesting });
	expect(snapshot(collector).samples[0].selectors).toHaveLength(17);
	expect(snapshot(collector).truncated).toBe(false);
	nesting = {
		get selector(): string {
			throw new Error("Selector read after segment budget");
		},
	};
	for (let index = 15; index >= 0; index--) {
		nesting = { selector: "", parent: nesting };
	}
	collector.record(codes[3], { selector: "", nesting });
	const sample = snapshot(collector).samples[1];
	expect(sample.selectors).toEqual(Array.from({ length: 17 }, () => text("")));
	expect(sample.selectorChainTruncated).toBe(true);
	expect(snapshot(collector).truncated).toBe(true);
});

it("bounds deep chains without a leaf and terminates cyclic chains", () => {
	const collector = new CssDiagnosticCollector();
	let nesting: SelectorNestingContext | undefined;
	for (let index = 0; index < 10_000; index++) {
		nesting = { selector: "&", parent: nesting };
	}
	collector.record(codes[3], { nesting });
	const cycle: { selector: string; parent?: SelectorNestingContext } = {
		selector: ".cycle",
	};
	cycle.parent = { selector: ".other", parent: cycle };
	collector.record(codes[3], { selector: "leaf", nesting: cycle });
	const result = snapshot(collector);
	expect(result.samples[0].selectors).toHaveLength(17);
	expect(result.samples[0].selectorChainTruncated).toBe(true);
	expect(result.samples[1].selectors).toEqual([
		text("leaf"),
		text(".cycle"),
		text(".other"),
	]);
	expect(result.samples[1].selectorChainTruncated).toBe(true);
});

it("detaches samples from mutable contexts and never retains extra objects", () => {
	const collector = new CssDiagnosticCollector();
	const parent = { selector: ".root" };
	const nesting = { selector: ".parent", parent };
	const context = {
		authoredProperty: "BadProperty",
		property: "badproperty",
		value: "old",
		selector: ".leaf",
		nesting,
		sheet: 1,
		importDepth: 2,
		owner: 3,
		important: false,
		get source(): never {
			throw new Error("Unexpected source read");
		},
	};
	collector.record(codes[1], context);
	const before = snapshot(collector);
	context.authoredProperty = "Changed";
	context.property = "changed";
	context.value = "new";
	context.selector = ".new";
	context.sheet = 9;
	context.importDepth = 9;
	context.owner = 9;
	context.important = true;
	nesting.selector = ".new-parent";
	parent.selector = ".new-root";
	const after = snapshot(collector);
	expect(after).toEqual(before);
	expect(after.samples[0]).not.toHaveProperty("source");
	expect(after.samples[0]).not.toHaveProperty("nesting");
	expect(Object.isFrozen(context)).toBe(false);
	expect(Object.isFrozen(nesting)).toBe(false);
	expectDeeplyFrozen(after);
});

it("resolves retained IDs using frozen copies without changing earlier snapshots", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[0]);
	collector.record(codes[1]);
	const initial = snapshot(collector);
	const matches = { elements: 3, before: 2, after: 1 };
	const resolution: CssDiagnosticResolution = {
		applicable: true,
		selectorState: "matched",
		mediaState: "active",
		matches,
	};
	collector.resolve(
		[0, 0, 1, -1, 2, 128, 0.5, Number.NaN, Infinity],
		resolution,
	);
	const resolved = snapshot(collector);
	for (const sample of resolved.samples) {
		expect(sample).toMatchObject(resolution);
		expect(sample.matches).not.toBe(matches);
	}
	matches.elements = 99;
	resolution.applicable = false;
	resolution.selectorState = "unmatched";
	expect(snapshot(collector).samples[0]).toMatchObject({
		applicable: true,
		selectorState: "matched",
		matches: { elements: 3, before: 2, after: 1 },
	});
	collector.resolve([0], {
		applicable: false,
		selectorState: "unresolved",
		mediaState: "uncertain",
	});
	const updated = snapshot(collector);
	expect(updated.samples[0]).toMatchObject({
		applicable: false,
		selectorState: "unresolved",
		mediaState: "uncertain",
	});
	expect(updated.samples[0].matches).toBeUndefined();
	expect(updated.samples[1]).toEqual(resolved.samples[1]);
	expect(initial.samples[0].applicable).toBeNull();
	expect(initial.samples[0].selectorState).toBe("not-evaluated");
	expect(resolved.samples[0].applicable).toBe(true);
	expect(resolved.samples[0].matches?.elements).toBe(3);
	expectDeeplyFrozen(initial);
	expectDeeplyFrozen(resolved);
	expectDeeplyFrozen(updated);
});

it("ignores missing and invalid IDs without inspecting the resolution", () => {
	const collector = new CssDiagnosticCollector();
	collector.record(codes[0]);
	const resolution = new Proxy({} as CssDiagnosticResolution, {
		get() {
			throw new Error("Unexpected resolution read");
		},
	});
	collector.resolve(undefined, resolution);
	collector.resolve([], resolution);
	collector.resolve([-1, 1, 128, 1.5, Number.NaN, Infinity], resolution);
	expect(snapshot(collector).samples[0].applicable).toBeNull();
});

it("copies and freezes count maps while leaving caller state mutable", () => {
	const collector = new CssDiagnosticCollector();
	const issues = { [codes[0]]: 4, "unimplemented-css-at-rule": 2 };
	const applicableIssues = { [codes[0]]: 1 };
	collector.record(codes[0]);
	const first = collector.snapshot(7, issues, applicableIssues);
	issues[codes[0]] = 10;
	applicableIssues[codes[0]] = 3;
	collector.record(codes[1]);
	const second = collector.snapshot(8, issues, applicableIssues);
	expect(first).toMatchObject({
		cascadeBuild: 7,
		issues: { [codes[0]]: 4, "unimplemented-css-at-rule": 2 },
		applicableIssues: { [codes[0]]: 1 },
		sampledOccurrences: 1,
		exhaustive: false,
	});
	expect(first.samples).toHaveLength(1);
	expect(second).toMatchObject({
		cascadeBuild: 8,
		issues: { [codes[0]]: 10 },
		applicableIssues: { [codes[0]]: 3 },
		sampledOccurrences: 2,
	});
	expect(first.issues).not.toBe(issues);
	expect(first.applicableIssues).not.toBe(applicableIssues);
	expect(first.samples).not.toBe(second.samples);
	expect(Reflect.set(first.issues, codes[0], 100)).toBe(false);
	expect(Reflect.set(first.samples[0], "applicable", true)).toBe(false);
	expect(Reflect.set(first.samples[0].code, "value", "changed")).toBe(false);
	expectDeeplyFrozen(first);
	expectDeeplyFrozen(second);
});
