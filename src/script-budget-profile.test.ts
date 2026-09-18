import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import { PageScripts, type PageScriptOptions } from "./page-scripts.js";
import {
	legacyPageRuntime,
	type PageRuntime,
	type PageRuntimeOptions,
} from "./page-runtime.js";
import { scriptLimits, type ScriptLimits } from "./safejs.js";

const select = scriptLimits as (
	overrides?: Partial<ScriptLimits>,
	profile?: unknown,
) => Readonly<ScriptLimits>;
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("keeps the existing budget defaults and ceilings without explicit opt-in", () => {
	expect(select()).toEqual(select({}, "bounded-v1"));
	expect(select()).toEqual({
		maxSourceCodeUnits: 262_144,
		maxSteps: 100_000,
		maxCallDepth: 64,
		maxStringLength: 262_144,
		maxArrayLength: 16_384,
		maxDataSize: 1_048_576,
		timeoutMs: 1000,
		maxRuns: 128,
		maxResultBytes: 65_536,
	});
	expect(select({ maxSteps: 1_600_000 }).maxSteps).toBe(1_600_000);
	expect(() => select({ maxSteps: 1_600_001 })).toThrow(/limit/);
});

it("explicitly admits large publisher source without increasing the time or data ceilings", () => {
	const limits = select({}, "large-source-v1");
	expect(limits).toEqual({
		maxSourceCodeUnits: 4_194_304,
		maxStringLength: 4_194_304,
		maxSteps: 16_000_000,
		maxCallDepth: 512,
		maxArrayLength: 262_144,
		maxDataSize: 16_777_216,
		timeoutMs: 16_000,
		maxRuns: 128,
		maxResultBytes: 65_536,
	});
	expect(Object.isFrozen(limits)).toBe(true);
	expect(() => select({ timeoutMs: 16_001 }, "large-source-v1")).toThrow(
		/limit/,
	);
	expect(() => select({ maxDataSize: 16_777_217 }, "large-source-v1")).toThrow(
		/limit/,
	);
	expect(() => select({ maxSteps: 16_000_001 }, "large-source-v1")).toThrow(
		/limit/,
	);
});

it("explicitly admits bounded application initialization with only a longer time budget", () => {
	const limits = select({}, "application-v1");
	expect(limits).toEqual({
		...select({}, "large-source-v1"),
		timeoutMs: 120_000,
	});
	expect(Object.isFrozen(limits)).toBe(true);
});

it.each(["bounded-v1", "large-source-v1", "application-v1"])(
	"keeps every %s ceiling finite and rejects one unit above it",
	(profile) => {
		const ceilings: ScriptLimits = {
			maxSourceCodeUnits: 4_194_304,
			maxSteps: profile === "bounded-v1" ? 1_600_000 : 16_000_000,
			maxCallDepth: 1024,
			maxStringLength: 4_194_304,
			maxArrayLength: 262_144,
			maxDataSize: 16_777_216,
			timeoutMs: profile === "application-v1" ? 120_000 : 16_000,
			maxRuns: 2048,
			maxResultBytes: 1_048_576,
		};
		expect(select(ceilings, profile)).toEqual(ceilings);
		for (const [key, value] of Object.entries(ceilings))
			expect(() => select({ [key]: value + 1 }, profile)).toThrow(/limit/);
	},
);

it("snapshots smaller application overrides without mutating any profile", () => {
	const overrides: ScriptLimits = {
		maxSourceCodeUnits: 100,
		maxSteps: 200,
		maxCallDepth: 3,
		maxStringLength: 400,
		maxArrayLength: 5,
		maxDataSize: 600,
		timeoutMs: 700,
		maxRuns: 8,
		maxResultBytes: 900,
	};
	const limits = select(overrides, "application-v1");
	expect(limits).toEqual(overrides);
	overrides.timeoutMs = 1;
	expect(limits.timeoutMs).toBe(700);
	expect(select({}, "application-v1").timeoutMs).toBe(120_000);
	expect(select({}, "large-source-v1").timeoutMs).toBe(16_000);
	expect(select().timeoutMs).toBe(1000);
});

it("snapshots explicit smaller limits without changing either profile", () => {
	const overrides = { maxSteps: 2_800_000, timeoutMs: 2000 };
	const limits = select(overrides, "large-source-v1");
	overrides.maxSteps = 1;
	expect(limits.maxSteps).toBe(2_800_000);
	expect(limits.timeoutMs).toBe(2000);
	expect(select({}, "large-source-v1").maxSteps).toBe(16_000_000);
	expect(select().maxSteps).toBe(100_000);
});

it.each([
	null,
	false,
	true,
	1,
	"",
	"large",
	"LARGE-SOURCE-V1",
	"application",
	"APPLICATION-V1",
	{},
	[],
])("rejects malformed budget profile %j", (profile) => {
	expect(() => select({}, profile)).toThrow(/profile/);
});

it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"keeps large-source limits positive finite integers: %s",
	(value) => {
		expect(() => select({ maxSteps: value }, "large-source-v1")).toThrow(
			/limit/,
		);
	},
);

it.each([
	{ profile: undefined, limits: {} },
	{ profile: "bounded-v1", limits: {} },
	{ profile: "large-source-v1", limits: { maxSteps: 3_000_000 } },
	{ profile: "application-v1", limits: {} },
	{
		profile: "application-v1",
		limits: { maxSteps: 3_000_000, timeoutMs: 2000 },
	},
])(
	"passes $profile limits through the PageScripts factory with one profile read",
	async ({ profile, limits }) => {
		const tree = new DocumentTree("https://example.com/");
		documents.push(tree);
		let received: PageRuntimeOptions | undefined;
		let closed = false;
		const runtime: PageRuntime = {
			budget: { stepsUsed: 0, peakCallDepth: 0, peakDataSize: 0 },
			get closed() {
				return closed;
			},
			initialize: async () => undefined,
			evaluate: async () => ({ ok: true }),
			copyResult: (value) => value,
			startCallback() {
				throw new Error("No callback expected");
			},
			errorDetails: () => ({ code: "unsupported" }),
			close: async () => {
				closed = true;
			},
		};
		const readProfile = vi.fn(() => profile);
		const options = {
			get budgetProfile() {
				return readProfile();
			},
			limits,
		} as PageScriptOptions;
		const scripts = new PageScripts(
			{ document: tree, interactions: documentInteractions(tree) },
			{
				createPageRuntime(configuration) {
					received = configuration;
					return runtime;
				},
			},
			options,
		);
		expect(received?.limits).toBe(scripts.limits);
		expect(received?.limits).toEqual(select(limits, profile));
		if (profile === "large-source-v1" || profile === "application-v1") {
			expect(received).toHaveProperty("regexSourceLength", 8192);
			expect(received).toHaveProperty("regexCompileAllocations", 32768);
		} else {
			expect(received).not.toHaveProperty("regexSourceLength");
			expect(received).not.toHaveProperty("regexCompileAllocations");
		}
		expect(readProfile).toHaveBeenCalledTimes(1);
		await scripts.close();
		expect(closed).toBe(true);
		expect(received?.signal.aborted).toBe(true);
	},
);

it("forwards an explicitly selected regex-source allowance through the legacy budget boundary", async () => {
	let recorded: unknown;
	class Budget {
		stepsUsed = 0;
		peakCallDepth = 0;
		peakDataSize = 0;
		constructor(options: unknown) {
			recorded = options;
		}
	}
	const factory = legacyPageRuntime({
		Budget,
		SandboxError: Error as never,
		createHostObject: () => ({}),
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => false,
		deepCopyFromSandbox: (value) => value,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(undefined),
		}),
		createRealm: () => ({
			closed: false,
			evaluate: async () => ({}),
			close: async () => undefined,
		}),
	});
	const runtime = factory.createPageRuntime({
		limits: select({}, "large-source-v1"),
		regexSourceLength: 8192,
		regexCompileAllocations: 32768,
		signal: new AbortController().signal,
		globals: [],
		setup: () => ({}),
		onClosed() {},
		sink: { log() {}, error() {} },
	} as PageRuntimeOptions);
	expect(recorded).toMatchObject({
		regexSourceLength: 8192,
		regexCompileAllocations: 32768,
	});
	await runtime.close();
});

it("rejects a malformed PageScripts profile before allocating runtime state", () => {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const createPageRuntime = vi.fn(() => {
		throw new Error("Unexpected runtime allocation");
	});
	expect(
		() =>
			new PageScripts(
				{ document: tree, interactions: documentInteractions(tree) },
				{ createPageRuntime },
				{ budgetProfile: "invalid" } as unknown as PageScriptOptions,
			),
	).toThrow(/profile/);
	expect(createPageRuntime).not.toHaveBeenCalled();
});

it.each([
	0,
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	null,
	undefined,
	false,
	"120000",
	{},
	[],
	120_001,
])(
	"rejects invalid application limits before allocating runtime state: %j",
	(value) => {
		const tree = new DocumentTree("https://example.com/");
		documents.push(tree);
		const createPageRuntime = vi.fn(() => {
			throw new Error("Unexpected runtime allocation");
		});
		for (const key of Object.keys(select())) {
			if (value === 120_001 && key !== "timeoutMs") continue;
			const readProfile = vi.fn(() => "application-v1");
			const options = {
				get budgetProfile() {
					return readProfile();
				},
				limits: { [key]: value },
			} as unknown as PageScriptOptions;
			expect(
				() =>
					new PageScripts(
						{ document: tree, interactions: documentInteractions(tree) },
						{ createPageRuntime },
						options,
					),
			).toThrow(/runtime limit/);
			expect(readProfile).toHaveBeenCalledTimes(1);
		}
		expect(createPageRuntime).not.toHaveBeenCalled();
	},
);
