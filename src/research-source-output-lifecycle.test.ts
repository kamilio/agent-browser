import { getEventListeners } from "node:events";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	researchHtmlJsonCliLimits,
	runResearchHtmlJsonCli,
} from "../scripts/research-html-json.js";
import {
	researchSourceIndexCliLimits,
	runResearchSourceIndexCli,
} from "../scripts/research-source-index.js";

const consumers = [
	{
		name: "HTML JSON",
		run: runResearchHtmlJsonCli,
		timeoutMs: researchHtmlJsonCliLimits.timeoutMs,
		message: "Research HTML JSON operation failed",
	},
	{
		name: "source index",
		run: runResearchSourceIndexCli,
		timeoutMs: researchSourceIndexCliLimits.timeoutMs,
		message: "Research source index operation failed",
	},
];
const cleanups: Array<() => void> = [];

function nextTurn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function stalledOutput(autoDestroy: boolean, holdDestroy = false) {
	let acknowledge: ((error?: Error | null) => void) | undefined;
	let completeDestroy: ((error?: Error | null) => void) | undefined;
	let destroyError: Error | null | undefined;
	const read = vi.fn();
	const input = new Readable({ autoDestroy: false, read });
	const write = vi.fn(
		(
			_chunk: Buffer,
			_encoding: BufferEncoding,
			callback: typeof acknowledge,
		) => {
			acknowledge = callback;
		},
	);
	const output = new Writable({
		autoDestroy,
		highWaterMark: 1,
		write,
		...(holdDestroy
			? {
					destroy(error: Error | null, callback: typeof completeDestroy) {
						destroyError = error;
						completeDestroy = callback;
					},
				}
			: {}),
	});
	const acknowledgeWrite = (error?: Error) => {
		const callback = acknowledge;
		acknowledge = undefined;
		callback?.(error);
	};
	const finishDestroy = () => {
		const callback = completeDestroy;
		completeDestroy = undefined;
		callback?.(destroyError);
	};
	cleanups.push(() => {
		acknowledgeWrite();
		input.destroy();
		output.destroy();
		completeDestroy?.(null);
	});
	return { input, output, read, write, acknowledgeWrite, finishDestroy };
}

function expectCleanOutput(output: Writable): void {
	for (const event of ["error", "close", "finish", "drain"])
		expect(output.listenerCount(event)).toBe(0);
}

function expectPendingProtection(output: Writable): void {
	expect(output.listenerCount("error")).toBe(1);
	expect(output.listenerCount("close")).toBe(1);
	expect(output.listenerCount("finish")).toBe(0);
	expect(output.listenerCount("drain")).toBe(0);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Network is forbidden in output lifecycle tests");
		}),
	);
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	expect(globalThis.fetch).not.toHaveBeenCalled();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe.each(consumers)("$name output lifecycle", (consumer) => {
	describe.each(["abort", "timeout"] as const)("after %s", (stop) => {
		async function cancel(target: ReturnType<typeof stalledOutput>) {
			const controller = new AbortController();
			const pending = consumer.run(
				["--help"],
				target.input,
				target.output,
				controller.signal,
			);
			const rejected = expect(pending).rejects.toMatchObject({
				code: stop === "abort" ? "aborted" : "timeout",
				message: consumer.message,
			});
			expect(target.write).toHaveBeenCalledTimes(1);
			if (stop === "abort") controller.abort(new Error("private reason"));
			else await vi.advanceTimersByTimeAsync(consumer.timeoutMs);
			await rejected;
			expect(target.read).not.toHaveBeenCalled();
			expect(target.input.destroyed).toBe(false);
			expect(target.output.destroyed).toBe(false);
			expect(target.output.writableEnded).toBe(false);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
			expectPendingProtection(target.output);
			await nextTurn();
			expectPendingProtection(target.output);
		}

		it.each([false, true])(
			"handles a late write error without a caller error listener (autoDestroy %s)",
			async (autoDestroy) => {
				const target = stalledOutput(autoDestroy);
				expectCleanOutput(target.output);
				await cancel(target);
				target.acknowledgeWrite(new Error("private late write failure"));
				await nextTurn();
				expectCleanOutput(target.output);
				expect(target.output.destroyed).toBe(autoDestroy);
				expect(target.write).toHaveBeenCalledTimes(1);
			},
		);

		it("keeps protection until held asynchronous destruction finishes", async () => {
			const target = stalledOutput(true, true);
			await cancel(target);
			target.acknowledgeWrite(
				new Error("private asynchronous destroy failure"),
			);
			for (let turn = 0; turn < 3; turn++) {
				await nextTurn();
				expect(target.output.destroyed).toBe(true);
				expect(target.output.closed).toBe(false);
				expectPendingProtection(target.output);
			}
			target.finishDestroy();
			await nextTurn();
			expect(target.output.closed).toBe(true);
			expectCleanOutput(target.output);
		});

		it.each([false, true])(
			"protects a late successful callback after caller destruction (destroy completed first %s)",
			async (destroyCompletedFirst) => {
				const target = stalledOutput(true, true);
				await cancel(target);
				target.output.destroy(new Error("private caller destroy failure"));
				if (destroyCompletedFirst) target.finishDestroy();
				target.acknowledgeWrite();
				try {
					expectPendingProtection(target.output);
					expect(target.output.destroyed).toBe(true);
					expect(target.output.closed).toBe(destroyCompletedFirst);
					if (!destroyCompletedFirst) {
						for (let turn = 0; turn < 3; turn++) {
							await nextTurn();
							expect(target.output.closed).toBe(false);
							expectPendingProtection(target.output);
						}
					}
				} catch (error) {
					target.output.once("error", () => undefined);
					if (!destroyCompletedFirst) target.finishDestroy();
					await nextTurn();
					throw error;
				}
				if (!destroyCompletedFirst) target.finishDestroy();
				await nextTurn();
				expect(target.output.closed).toBe(true);
				expectCleanOutput(target.output);
				expect(target.write).toHaveBeenCalledTimes(1);
				expect(target.read).not.toHaveBeenCalled();
				expect(target.input.destroyed).toBe(false);
				expect(target.output.writableEnded).toBe(false);
				expect(vi.getTimerCount()).toBe(0);
			},
		);

		it("releases protection after a late successful callback", async () => {
			const target = stalledOutput(false);
			await cancel(target);
			target.acknowledgeWrite();
			await nextTurn();
			expectCleanOutput(target.output);
			expect(target.output.destroyed).toBe(false);
			expect(target.output.writableEnded).toBe(false);
		});

		it("releases protection on caller-owned close without a write callback", async () => {
			const target = stalledOutput(false);
			await cancel(target);
			target.output.destroy();
			await nextTurn();
			expect(target.output.closed).toBe(true);
			expectCleanOutput(target.output);
		});
	});
});
