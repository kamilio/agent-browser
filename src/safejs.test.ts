import { expect, it, vi } from "vitest";
import { SafeJsRuntime, type SafeJsSdk } from "./safejs.js";

function fixture(run?: SafeJsSdk["run"], copy?: (value: unknown) => unknown) {
	class Budget {
		stepsUsed = 2;
		peakCallDepth = 1;
		peakDataSize = 10;
		constructor(readonly options: unknown) {}
	}
	class SandboxError extends Error {
		code = "budgetExceeded";
		budget = "steps";
	}
	const sdk = {
		Budget,
		SandboxError,
		run: vi.fn(
			run ?? (async () => ({ ok: true, returnValue: { result: 42 } })),
		),
		deepCopyFromSandbox: copy ?? ((value: unknown) => value),
	};
	return { sdk, runtime: new SafeJsRuntime(sdk) };
}

it("only grants explicit bindings and discards console output without granting modules", async () => {
	const { sdk, runtime } = fixture(async (_source, options) => {
		expect(options.modules).toEqual({});
		expect(options.bindings).toEqual({});
		options.sink.log("untrusted\u001b[2J");
		options.sink.error("untrusted sensitive fixture");
		expect(
			(options.budget as unknown as { options: object }).options,
		).toMatchObject({
			maxSteps: 100000,
			maxCallDepth: 64,
			stringLength: 262144,
			arrayLength: 16384,
			dataSize: 1048576,
		});
		return { ok: true, returnValue: { result: 42 } };
	});
	const result = await runtime.evaluate("return {result:42};");
	expect(result).toMatchObject({
		ok: true,
		value: { result: 42 },
		metrics: { consoleCalls: 2 },
	});
	expect(JSON.stringify(result)).not.toContain("untrusted");
	expect(sdk.run.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
	runtime.close();
});

it("validates source, runs and options before invoking the SDK", async () => {
	const { sdk } = fixture();
	const runtime = new SafeJsRuntime(sdk, { maxSourceCodeUnits: 4, maxRuns: 1 });
	await expect(runtime.evaluate("12345")).rejects.toMatchObject({
		code: "resource-limit",
	});
	await expect(
		runtime.evaluate("", { signal: {} as AbortSignal }),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(sdk.run).not.toHaveBeenCalled();
	await runtime.evaluate("1");
	await expect(runtime.evaluate("2")).rejects.toMatchObject({
		code: "resource-limit",
	});
	runtime.close();
	await expect(runtime.evaluate("3")).rejects.toMatchObject({ code: "closed" });
});

it.each([0, -1, 0.5, Number.POSITIVE_INFINITY, 2 ** 40])(
	"rejects invalid runtime limits %s",
	(limit) => {
		const { sdk } = fixture();
		expect(() => new SafeJsRuntime(sdk, { maxSteps: limit })).toThrow(
			"Invalid script runtime limit",
		);
	},
);

it("rejects concurrent evaluation and propagates close to an active SDK call", async () => {
	const { runtime } = fixture(
		async (_source, options) =>
			await new Promise((resolve) =>
				options.signal.addEventListener("abort", () => resolve({ ok: true }), {
					once: true,
				}),
			),
	);
	const pending = runtime.evaluate("pending");
	const rejection = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await expect(runtime.evaluate("another")).rejects.toMatchObject({
		code: "invalid-input",
	});
	runtime.close();
	await rejection;
	expect(runtime.metrics()).toEqual({ runs: 1, active: false, closed: true });
});

it("rejects an already aborted caller without starting an SDK run", async () => {
	const { sdk, runtime } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		runtime.evaluate("", { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(sdk.run).not.toHaveBeenCalled();
	runtime.close();
});

it("uses a timer to abort an otherwise pending SDK await", async () => {
	const { sdk } = fixture(
		async (_source, options) =>
			await new Promise((resolve) =>
				options.signal.addEventListener("abort", () => resolve({ ok: true }), {
					once: true,
				}),
			),
	);
	const runtime = new SafeJsRuntime(sdk, { timeoutMs: 10 });
	await expect(runtime.evaluate("pending")).rejects.toMatchObject({
		code: "aborted",
	});
	expect(runtime.metrics().active).toBe(false);
	runtime.close();
});

it("only recognizes genuine SDK budget errors and never exposes thrown host messages", async () => {
	const { sdk } = fixture();
	sdk.run.mockRejectedValueOnce(new sdk.SandboxError());
	sdk.run.mockRejectedValueOnce({
		code: "budgetExceeded",
		budget: "steps",
		message: "synthetic-private-value",
	});
	const runtime = new SafeJsRuntime(sdk);
	expect((await runtime.evaluate("first")).error).toEqual({
		code: "budgetExceeded",
		budget: "steps",
	});
	expect((await runtime.evaluate("second")).error).toEqual({
		code: "script-error",
	});
	runtime.close();
});

it("does not leak source, message or stack from a script failure result", async () => {
	const { runtime } = fixture(async () => ({
		ok: false,
		error: { code: "UNBOUND_IDENTIFIER", message: "private", stack: "private" },
	}));
	expect(await runtime.evaluate("script")).toMatchObject({
		ok: false,
		error: { code: "UNBOUND_IDENTIFIER" },
	});
	expect(JSON.stringify(await runtime.evaluate("script"))).not.toContain(
		"private",
	);
	runtime.close();
});

it("bounds script result output and refuses accessors, cycles and exotic objects", async () => {
	const cycle: unknown[] = [];
	cycle.push(cycle);
	const accessor = Object.defineProperty({}, "secret", {
		enumerable: true,
		get() {
			throw new Error("Getter must never run");
		},
	});
	const sparse: unknown[] = [];
	sparse.length = 1000000;
	for (const value of [
		cycle,
		accessor,
		new Date(),
		sparse,
		Number.POSITIVE_INFINITY,
		() => 1,
	]) {
		const { runtime } = fixture(async () => ({ ok: true, returnValue: value }));
		await expect(runtime.evaluate("result")).rejects.toMatchObject({
			name: "AgentBrowserError",
		});
		runtime.close();
	}
	const { sdk } = fixture(async () => ({
		ok: true,
		returnValue: "a".repeat(101),
	}));
	const runtime = new SafeJsRuntime(sdk, { maxResultBytes: 100 });
	await expect(runtime.evaluate("result")).rejects.toMatchObject({
		code: "resource-limit",
	});
	runtime.close();
});

it("copies prototype-shaped JSON keys without mutating host prototypes", async () => {
	const { runtime } = fixture(async () => ({
		ok: true,
		returnValue: JSON.parse(
			'{"__proto__":{"synthetic":true},"constructor":"ordinary data"}',
		),
	}));
	const result = await runtime.evaluate("result");
	expect(Object.getPrototypeOf(result.value)).toBeNull();
	expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true);
	expect(({} as { synthetic?: boolean }).synthetic).toBeUndefined();
	runtime.close();
});
