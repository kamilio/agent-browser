import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import { PageScripts, type PageScriptOptions } from "./page-scripts.js";
import type { PageRuntime, PageRuntimeOptions } from "./page-runtime.js";
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
	expect(select()).toMatchObject({
		maxSourceCodeUnits: 262_144,
		maxSteps: 100_000,
		maxDataSize: 1_048_576,
		timeoutMs: 1000,
	});
	expect(select({ maxSteps: 1_600_000 }).maxSteps).toBe(1_600_000);
	expect(() => select({ maxSteps: 1_600_001 })).toThrow(/limit/);
});

it("explicitly admits large publisher source without increasing the time or data ceilings", () => {
	const limits = select({}, "large-source-v1");
	expect(limits).toMatchObject({
		maxSourceCodeUnits: 4_194_304,
		maxStringLength: 4_194_304,
		maxSteps: 16_000_000,
		maxDataSize: 16_777_216,
		timeoutMs: 16_000,
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

it("snapshots explicit smaller limits without changing either profile", () => {
	const overrides = { maxSteps: 2_800_000, timeoutMs: 2000 };
	const limits = select(overrides, "large-source-v1");
	overrides.maxSteps = 1;
	expect(limits.maxSteps).toBe(2_800_000);
	expect(limits.timeoutMs).toBe(2000);
	expect(select({}, "large-source-v1").maxSteps).toBe(16_000_000);
	expect(select().maxSteps).toBe(100_000);
});

it.each([null, false, true, 1, "", "large", "LARGE-SOURCE-V1", {}, []])(
	"rejects malformed budget profile %j",
	(profile) => {
		expect(() => select({}, profile)).toThrow(/profile/);
	},
);

it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"keeps large-source limits positive finite integers: %s",
	(value) => {
		expect(() => select({ maxSteps: value }, "large-source-v1")).toThrow(
			/limit/,
		);
	},
);

it("passes the selected profile limits into the real PageScripts factory boundary", async () => {
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
	const options = {
		budgetProfile: "large-source-v1",
		limits: { maxSteps: 3_000_000 },
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
	expect(received?.limits.maxSteps).toBe(3_000_000);
	expect(received?.limits.timeoutMs).toBe(16_000);
	await scripts.close();
	expect(closed).toBe(true);
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
