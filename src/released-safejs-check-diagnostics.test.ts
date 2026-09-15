import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
	ReleasedInvocation,
} from "./safejs-extension-types.js";

const loader = vi.hoisted(() => vi.fn());
vi.mock("../scripts/released-safejs-core.js", () => ({
	loadReleasedCore: loader,
}));

const labels = [
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
];

type Fault = {
	realm: number;
	mode: "throw" | "reject" | "pending";
	error: unknown;
};
type Options = {
	evaluation?: Fault & { source?: string };
	cleanup?: Fault & { call?: number };
	freshValue?: unknown;
	settleBeforeFresh?: boolean;
};
type Receipt = {
	completed: boolean;
	passed: number;
	checks: { label: string; passed: boolean; message?: string }[];
	failure?: { stage: string; message: string; label?: string };
	cleanupFailures: { fixture: string; message: string }[];
	publicationProvenanceVerified: boolean;
	browserIntegrationVerified: boolean;
};

function faultResult(fault: Fault): Promise<never> {
	if (fault.mode === "throw") throw fault.error;
	if (fault.mode === "reject") return Promise.reject(fault.error);
	return new Promise(() => {});
}

function fakeCore(options: Options = {}) {
	const realms: { sources: string[]; closes: number }[] = [];
	const core: ReleasedCore = {
		Budget: class {
			stepsUsed = 0;
			peakCallDepth = 0;
			peakDataSize = 0;
		},
		defineExtension: (definition) => definition,
		createRealm(realmOptions) {
			const extension = realmOptions.extensions[0] as Parameters<
				ReleasedCore["defineExtension"]
			>[0];
			if (
				extension.manifest.name === "browser-console-probe" &&
				!realmOptions.builtinOverrides
			)
				throw new Error("Fake builtin collision");
			const index = realms.length;
			const state = { sources: [] as string[], closes: 0 };
			realms.push(state);
			const ownerAbort = new AbortController();
			const cleanups: (() => void | Promise<void>)[] = [];
			const revoked = new Set<unknown>();
			const hostDefinitions: ReleasedHostDefinition[] = [];
			let closed = false;
			let finishFirst = () => {};
			let rejectFirst = (_reason: unknown) => {};
			const call = (name: string, ...args: unknown[]) => {
				const operation = globals[name];
				if (typeof operation !== "function")
					throw new Error(`Unexpected fake global ${name}`);
				return operation(...args);
			};
			const startCallback: ReleasedContext["startCallback"] = (
				callback,
				invocationOptions,
			): ReleasedInvocation => {
				if (callback === "first" || callback === "cancel") {
					if (callback === "first") call("mark", "prefix");
					const result = new Promise<unknown>((resolve, reject) => {
						rejectFirst = reject;
						finishFirst = () => {
							if (closed) return;
							call("mark", callback === "first" ? "tail" : "must not run");
							resolve(7);
						};
					});
					void (call("wait") as Promise<void>).then(() => finishFirst());
					return Object.freeze({ synchronous: Promise.resolve(), result });
				}
				const argument = invocationOptions?.args?.[0];
				if (callback === "second") call("mark", argument);
				else if (callback !== "retained")
					throw new Error("Unexpected fake callback");
				if (revoked.has(argument))
					return Object.freeze({
						synchronous: Promise.reject(new Error("Fake revoked reference")),
						result: Promise.reject(new Error("Fake revoked reference")),
					});
				return Object.freeze({
					synchronous: Promise.resolve(),
					result: Promise.resolve(callback === "retained" ? true : undefined),
				});
			};
			const context: ReleasedContext = {
				signal: ownerAbort.signal,
				onCleanup: (cleanup) => cleanups.push(cleanup),
				createHostObject(definition) {
					hostDefinitions.push(definition);
					return {};
				},
				startCallback,
				releaseCallback: () => {},
				retainGuestArguments: (operation) => operation,
				releaseGuestReference: (reference) => revoked.add(reference),
				nestedOperation: (operation) => operation,
				async evaluateNested(source) {
					expect(source).toBe('mark("nested");');
					call("mark", "nested");
				},
			};
			const globals = extension.setup(context).globals;
			return {
				evaluate(source) {
					state.sources.push(source);
					if (closed) return Promise.reject(new Error("Fake closed realm"));
					if (
						options.evaluation?.realm === index &&
						(!options.evaluation.source || options.evaluation.source === source)
					)
						return faultResult(options.evaluation);
					const evaluate = async () => {
						const named = hostDefinitions[0].named;
						switch (source) {
							case 'return probe === alias && probe.length === 2 && probe[0] === "first";':
								return true;
							case 'return Array.from(probe).join(",");':
								return "first,second,third";
							case 'probe.theme = "dark"; probe.fresh = "value"; return probe.theme === "dark" && probe.fresh === "value";':
								named?.set?.("theme", "dark");
								named?.set?.("fresh", "value");
								return true;
							case "return delete probe.fresh;":
								return named?.delete?.("fresh");
							case "return alias.theme;":
								return named?.get("theme");
							case 'try { probe.fixed = "bad"; } catch (error) {} return probe.fixed === "protected";':
								return true;
							case 'nested(); mark("after");':
								await call("nested");
								return call("mark", "after");
							case 'register(async function() { mark("prefix"); await wait(); mark("tail"); return 7; }); register(function(value) { mark(value); });':
								call("register", "first");
								return call("register", "second");
							case "return 1;":
								if (options.settleBeforeFresh) finishFirst();
								return options.freshValue ?? 1;
							case 'capture({ marker: "identity" }); register(function(value) { return value.marker === "identity"; });':
								call("capture", { marker: "identity" });
								return call("register", "retained");
							case 'register(async function() { await wait(); mark("must not run"); });':
								return call("register", "cancel");
							case 'console.warn("owned"); return console === window.console && console === self.console;':
								hostDefinitions[0].methods?.warn("owned");
								return true;
							default:
								throw new Error(`Unexpected fake source: ${source}`);
						}
					};
					return evaluate().then((returnValue) => ({ ok: true, returnValue }));
				},
				startCallback,
				releaseCallback: () => {},
				close() {
					state.closes++;
					if (!closed) {
						closed = true;
						ownerAbort.abort();
						rejectFirst(new Error("Fake owner closed"));
						for (const cleanup of cleanups) void cleanup();
					}
					if (
						options.cleanup?.realm === index &&
						state.closes === (options.cleanup.call ?? 1)
					)
						return faultResult(options.cleanup);
					return Promise.resolve();
				},
			};
		},
	};
	return { core, realms };
}

const previousArgs = process.argv;
const previousCode = process.exitCode;

beforeEach(() => {
	vi.resetModules();
	loader.mockReset();
	vi.useFakeTimers();
	vi.stubEnv("AGENT_BROWSER_SAFEJS_RELEASE_ROOT", "/fake/not-an-sdk");
	vi.stubEnv("AGENT_BROWSER_SAFEJS_RELEASE_VERSION", "0.0.0-fake");
	process.argv = ["node", "check-released-safejs", "--trace"];
	process.exitCode = 0;
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	try {
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	}
});

async function run(options: Options = {}) {
	const fake = fakeCore(options);
	loader.mockResolvedValue({
		core: fake.core,
		packageName: "fake-core-not-sdk",
		version: "0.0.0-fake",
	});
	const entry = import("../scripts/check-released-safejs.js");
	await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
	await vi.runAllTimersAsync();
	await entry;
	expect(loader).toHaveBeenCalledWith("/fake/not-an-sdk", "0.0.0-fake");
	expect(console.log).toHaveBeenCalledOnce();
	const report: Receipt = JSON.parse(vi.mocked(console.log).mock.calls[0][0]);
	expect(report.publicationProvenanceVerified).toBe(false);
	expect(report.browserIntegrationVerified).toBe(false);
	expect(vi.mocked(console.error).mock.calls.map(([line]) => line)).toEqual(
		report.checks.map(
			({ label, passed }) => `${passed ? "PASS" : "FAIL"} ${label}`,
		),
	);
	return { report, realms: fake.realms };
}

function expectFailedCheck(report: Receipt, index: number, message: string) {
	expect(process.exitCode).toBe(1);
	expect(report.completed).toBe(false);
	expect(report.passed).toBe(index);
	expect(report.checks.map((check) => check.label)).toEqual(
		labels.slice(0, index + 1),
	);
	expect(report.checks.slice(0, index).every((check) => check.passed)).toBe(
		true,
	);
	expect(report.checks[index]).toEqual({
		label: labels[index],
		passed: false,
		message,
	});
	expect(report.failure).toEqual({
		stage: "contract",
		label: labels[index],
		message,
	});
}

describe("actual release-check entry diagnostics with a deliberately fake core, not SDK conformance", () => {
	it("keeps all nineteen expectations in order on fake success", async () => {
		const { report, realms } = await run();
		expect(process.exitCode).toBe(0);
		expect(report.completed).toBe(true);
		expect(report.failure).toBeUndefined();
		expect(report.cleanupFailures).toEqual([]);
		expect(report.checks).toEqual(
			labels.map((label) => ({ label, passed: true })),
		);
		expect(report.passed).toBe(19);
		expect(realms.map((realm) => realm.closes)).toEqual([2, 1, 2, 2]);
	});

	it.each(["throw", "reject"] as const)(
		"records fresh-source %s and preserves it over secondary cleanup rejection",
		async (mode) => {
			const { report, realms } = await run({
				evaluation: {
					realm: 1,
					source: "return 1;",
					mode,
					error: new Error("primary fresh-source failure"),
				},
				cleanup: {
					realm: 1,
					mode: "reject",
					error: new Error("secondary close failure"),
				},
			});
			expectFailedCheck(report, 11, "primary fresh-source failure");
			expect(report.cleanupFailures).toEqual([
				{ fixture: "phases", message: "secondary close failure" },
			]);
			expect(realms).toHaveLength(2);
			expect(realms[1].closes).toBe(1);
		},
	);

	it.each(["throw", "reject", "pending"] as const)(
		"fails fast on cleanup-only %s",
		async (mode) => {
			const message =
				mode === "pending"
					? "SafeJS release probe deadline exceeded"
					: "cleanup alone failed";
			const { report, realms } = await run({
				cleanup: { realm: 0, mode, error: new Error(message) },
			});
			expect(process.exitCode).toBe(1);
			expect(report.completed).toBe(false);
			expect(report.passed).toBe(7);
			expect(report.checks).toEqual(
				labels.slice(0, 7).map((label) => ({ label, passed: true })),
			);
			expect(report.failure?.message).toBe(message);
			expect(report.cleanupFailures).toEqual([
				{ fixture: "capabilities", message },
			]);
			expect(realms).toHaveLength(1);
		},
	);

	it("bounds operation and cleanup diagnostics separately", async () => {
		const { report } = await run({
			evaluation: {
				realm: 1,
				source: "return 1;",
				mode: "reject",
				error: new Error("primary".repeat(200)),
			},
			cleanup: {
				realm: 1,
				mode: "throw",
				error: new Error("cleanup".repeat(200)),
			},
		});
		expectFailedCheck(report, 11, "primary".repeat(200).slice(0, 512));
		expect(report.cleanupFailures).toEqual([
			{ fixture: "phases", message: "cleanup".repeat(200).slice(0, 512) },
		]);
	});

	it.each([undefined, null, "non-Error primary"])(
		"does not replace non-Error operation failure %s with cleanup failure",
		async (error) => {
			const { report } = await run({
				evaluation: { realm: 1, source: "return 1;", mode: "throw", error },
				cleanup: {
					realm: 1,
					mode: "reject",
					error: new Error("secondary close failure"),
				},
			});
			expectFailedCheck(report, 11, "Unknown probe failure");
			expect(report.cleanupFailures).toEqual([
				{ fixture: "phases", message: "secondary close failure" },
			]);
		},
	);

	it.each([
		{ realm: 1, call: 1, passed: 15, fixture: "phases" },
		{ realm: 2, call: 2, passed: 16, fixture: "cancellation" },
		{ realm: 3, call: 1, passed: 18, fixture: "console" },
	])(
		"fails fast on cleanup-only failure in $fixture",
		async ({ realm, call, passed, fixture }) => {
			const { report, realms } = await run({
				cleanup: {
					realm,
					call,
					mode: "reject",
					error: new Error("cleanup alone failed"),
				},
			});
			expect(process.exitCode).toBe(1);
			expect(report.completed).toBe(false);
			expect(report.passed).toBe(passed);
			expect(report.checks).toEqual(
				labels.slice(0, passed).map((label) => ({ label, passed: true })),
			);
			expect(report.failure?.message).toBe("cleanup alone failed");
			expect(report.cleanupFailures).toEqual([
				{ fixture, message: "cleanup alone failed" },
			]);
			expect(realms).toHaveLength(realm + 1);
		},
	);

	it("preserves an operation timeout over a cleanup timeout", async () => {
		const { report } = await run({
			evaluation: {
				realm: 1,
				source: "return 1;",
				mode: "pending",
				error: undefined,
			},
			cleanup: { realm: 1, mode: "pending", error: undefined },
		});
		expectFailedCheck(report, 11, "SafeJS release probe deadline exceeded");
		expect(report.cleanupFailures).toEqual([
			{ fixture: "phases", message: "SafeJS release probe deadline exceeded" },
		]);
	});

	it.each([{ freshValue: 0 }, { settleBeforeFresh: true }])(
		"does not weaken fresh-source progress: %j",
		async (options) => {
			const { report } = await run(options);
			expectFailedCheck(report, 11, "SafeJS release acceptance failed");
			expect(report.cleanupFailures).toEqual([]);
		},
	);

	it.each([
		{ realm: 0, index: 0, fixture: "capabilities" },
		{ realm: 1, index: 9, fixture: "phases" },
		{ realm: 2, index: 15, fixture: "cancellation" },
		{ realm: 3, index: 17, fixture: "console" },
	])(
		"attributes preparatory evaluation failure in $fixture",
		async ({ realm, index, fixture }) => {
			const { report } = await run({
				evaluation: {
					realm,
					mode: "reject",
					error: new Error("setup evaluation failed"),
				},
				cleanup: { realm, mode: "throw", error: new Error("cleanup failed") },
			});
			expectFailedCheck(report, index, "setup evaluation failed");
			expect(report.cleanupFailures).toEqual([
				{ fixture, message: "cleanup failed" },
			]);
		},
	);
});
