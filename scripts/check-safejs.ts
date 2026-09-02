import { loadSafeJsSdk } from "../src/node-safejs.js";
import { SafeJsRuntime } from "../src/safejs.js";

const startedAt = new Date().toISOString();
const { sdk, version } = await loadSafeJsSdk(
	process.env.AGENT_BROWSER_SAFEJS_ROOT,
);
const checks: Record<string, unknown>[] = [];
const cases: {
	label: string;
	source: string;
	expected?: unknown;
	failure?: boolean;
	budget?: string;
	limits?: ConstructorParameters<typeof SafeJsRuntime>[1];
}[] = [
	{
		label: "Arithmetic and return values",
		source: "return 2 + 3 * 4;",
		expected: 14,
	},
	{
		label: "Closures, mutable lexical state and loops",
		source:
			"let total = 0; function add(value) { total += value; } for (let index = 0; index < 5; index++) { add(index); } return total;",
		expected: 10,
	},
	{
		label: "Arrays, callbacks, objects and JSON",
		source:
			"const values = [1, 2, 3].map(value => value * 2); return JSON.parse(JSON.stringify({ values }));",
		expected: { values: [2, 4, 6] },
	},
	{
		label: "Promises and async await",
		source: "const value = await Promise.resolve(7); return value + 1;",
		expected: 8,
	},
	{
		label: "Host process is absent",
		source: "return typeof process;",
		expected: "undefined",
	},
	{
		label: "Host require is absent",
		source: "return typeof require;",
		expected: "undefined",
	},
	{
		label: "Ambient network fetch is absent",
		source: "return typeof fetch;",
		expected: "undefined",
	},
	{
		label: "Global host object is absent",
		source: "return globalThis;",
		failure: true,
	},
	{
		label: "Dynamic Function construction is denied",
		source: 'return Function("return process")();',
		failure: true,
	},
	{ label: "Eval is denied", source: 'return eval("process");', failure: true },
	{
		label: "Constructor-chain escape is denied",
		source: 'return ({}).constructor.constructor("return process")();',
		failure: true,
	},
	{
		label: "Unregistered filesystem module is denied",
		source: 'import fs from "node:fs"; return fs;',
		failure: true,
	},
	{
		label: "Dynamic imports are denied",
		source: 'return await import("node:fs");',
		failure: true,
	},
	{
		label: "Infinite loop exhausts steps",
		source: "while (true) {}",
		failure: true,
		budget: "steps",
		limits: { maxSteps: 1000 },
	},
	{
		label: "Guest catch cannot suppress a step-budget failure",
		source: "try { while (true) {} } catch (error) { return true; }",
		failure: true,
		budget: "steps",
		limits: { maxSteps: 1000 },
	},
	{
		label: "Guest finally cannot suppress a step-budget failure",
		source: "try { while (true) {} } finally { return true; }",
		failure: true,
		budget: "steps",
		limits: { maxSteps: 1000 },
	},
	{
		label: "Recursive calls exhaust call-depth",
		source: "function recurse() { return recurse(); } return recurse();",
		failure: true,
		budget: "callDepth",
		limits: { maxCallDepth: 8 },
	},
	{
		label: "String growth is bounded",
		source: 'return "a".repeat(10000);',
		failure: true,
		budget: "stringLength",
		limits: { maxStringLength: 100 },
	},
];
for (const item of cases) {
	const runtime = new SafeJsRuntime(sdk, item.limits);
	try {
		const result = await runtime.evaluate(item.source);
		checks.push({
			label: item.label,
			passed: item.failure
				? !result.ok &&
					(!item.budget ||
						(result.error?.code === "budgetExceeded" &&
							result.error.budget === item.budget))
				: result.ok &&
					JSON.stringify(result.value) === JSON.stringify(item.expected),
			ok: result.ok,
			error: result.error,
			metrics: result.metrics,
		});
	} catch {
		checks.push({
			label: item.label,
			passed: false,
			error: "adapter-exception",
		});
	} finally {
		runtime.close();
	}
}

const runtime = new SafeJsRuntime(sdk);
let hostCalls = 0;
const result = await runtime.evaluate("return capability(6);", {
	bindings: {
		capability: (value: unknown) => {
			hostCalls++;
			if (value !== 6) throw new Error("Invalid fixture input");
			return { doubled: 12 };
		},
	},
});
checks.push({
	label: "Only an explicitly granted validated host capability is called",
	passed:
		result.ok &&
		hostCalls === 1 &&
		JSON.stringify(result.value) === JSON.stringify({ doubled: 12 }),
	metrics: result.metrics,
});
runtime.close();
const second = new SafeJsRuntime(sdk);
const isolation = await second.evaluate("return typeof capability;");
checks.push({
	label: "Independent runs do not inherit granted host capabilities",
	passed: isolation.ok && isolation.value === "undefined",
});
second.close();
const pendingRuntime = new SafeJsRuntime(sdk, { timeoutMs: 30 });
let pendingAborted = false;
try {
	await pendingRuntime.evaluate("return await pending();", {
		bindings: { pending: async () => await new Promise(() => {}) },
	});
} catch (error) {
	pendingAborted =
		error instanceof Error && "code" in error && error.code === "aborted";
} finally {
	pendingRuntime.close();
}
checks.push({
	label: "Deadline timer cancels an otherwise pending host await",
	passed: pendingAborted && !pendingRuntime.metrics().active,
});
const revoked = new SafeJsRuntime(sdk);
let captured: (() => unknown) | undefined;
let effects = 0;
const registered = await revoked.evaluate(
	"register(() => effect()); return true;",
	{
		bindings: {
			register: (callback: unknown) => {
				if (typeof callback !== "function")
					throw new Error("Expected fixture callback");
				captured = callback as () => unknown;
			},
			effect: () => {
				effects++;
			},
		},
	},
);
revoked.close();
let callbackRejected = false;
try {
	await captured?.();
} catch {
	callbackRejected = true;
}
checks.push({
	label:
		"Completed evaluation revokes later host effects from captured callbacks",
	passed: registered.ok && !!captured && callbackRejected && effects === 0,
});
const allPassed = checks.every((check) => check.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "installed-public-safejs-sdk-boundary",
			startedAt,
			finishedAt: new Date().toISOString(),
			runtimeVersion: version,
			rssBytes: process.memoryUsage().rss,
			node: process.versions.node,
			allPassed,
			checks,
			limitations: [
				"This tests the installed public SDK, not complete ECMAScript conformance or website JavaScript execution.",
				"No DOM, filesystem, process, network or browser bindings are enabled by this probe.",
				"Website execution remains disabled. A persistent page realm, DOM/lifecycle bindings and real dynamic-site acceptance remain required.",
				"The adapter uses cooperative interpreter budgets and aborts. An external hard watchdog is used for this probe; production process containment is still pending.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
