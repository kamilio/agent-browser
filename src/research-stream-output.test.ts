import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { writeResearchOutput } from "../scripts/research-stream-output.js";

type WriteCallback = (error?: Error | null) => void;

const streams: Writable[] = [];
const body = "private research body\n";

function retain(output: Writable): Writable {
	streams.push(output);
	return output;
}

function nextTurn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function factories() {
	const closedError = new Error("Output closed");
	const abortedError = new Error("Output aborted");
	return {
		closedError,
		abortedError,
		closed: vi.fn(() => closedError),
		aborted: vi.fn((_signal: AbortSignal) => abortedError),
	};
}

function listeners(output: Writable) {
	return ["error", "close", "finish", "drain"].map((event) =>
		output.listeners(event),
	);
}

function controlled(accepted = true) {
	const output = retain(new Writable({ autoDestroy: false }));
	let callback: WriteCallback | undefined;
	const write = vi.spyOn(output, "write").mockImplementation((...args) => {
		callback = args.at(-1) as WriteCallback;
		return accepted;
	});
	return {
		output,
		write,
		acknowledge(error?: Error) {
			if (!callback) throw new Error("No pending write callback");
			const complete = callback;
			callback = undefined;
			complete(error);
		},
	};
}

function heldWrite(autoDestroy = false, holdDestroy = false) {
	let callback: WriteCallback | undefined;
	let destroyCallback: (() => void) | undefined;
	const output = retain(
		new Writable({
			autoDestroy,
			highWaterMark: 1,
			write(_chunk, _encoding, complete) {
				callback = complete;
			},
			destroy(error, complete) {
				if (holdDestroy) destroyCallback = () => complete(error);
				else complete(error);
			},
		}),
	);
	return {
		output,
		acknowledge(error?: Error) {
			if (!callback) throw new Error("No pending write callback");
			const complete = callback;
			callback = undefined;
			complete(error);
		},
		completeDestroy() {
			if (!destroyCallback) throw new Error("No pending destroy callback");
			const complete = destroyCallback;
			destroyCallback = undefined;
			complete();
		},
	};
}

function expectCallerOwned(output: Writable) {
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const output of streams.splice(0)) output.destroy();
	await nextTurn();
});

it.each([undefined, new AbortController().signal])(
	"writes the exact text once and cleans up after success (signal %s)",
	async (signal) => {
		const chunks: string[] = [];
		const output = retain(
			new Writable({
				autoDestroy: false,
				write(chunk, _encoding, callback) {
					chunks.push(chunk.toString());
					callback();
				},
			}),
		);
		const write = vi.spyOn(output, "write");
		const errors = factories();
		const before = listeners(output);
		await expect(
			writeResearchOutput(output, body, signal, errors),
		).resolves.toBeUndefined();
		expect(write).toHaveBeenCalledExactlyOnceWith(body, expect.any(Function));
		expect(chunks).toEqual([body]);
		expect(listeners(output)).toEqual(before);
		if (signal) expect(getEventListeners(signal, "abort")).toEqual([]);
		expect(errors.closed).not.toHaveBeenCalled();
		expect(errors.aborted).not.toHaveBeenCalled();
		expectCallerOwned(output);
	},
);

it.each([false, true])(
	"preserves every binary byte in one write without mutation (subarray %s)",
	async (useSubarray) => {
		const storage = Uint8Array.from([
			17,
			...Array.from({ length: 256 }, (_value, index) => index),
			34,
		]);
		const payload = useSubarray ? storage.subarray(1, -1) : storage;
		const before = storage.slice();
		const chunks: Buffer[] = [];
		const output = retain(
			new Writable({
				autoDestroy: false,
				highWaterMark: 1,
				write(chunk, _encoding, callback) {
					chunks.push(Buffer.from(chunk));
					callback();
				},
			}),
		);
		const write = vi.spyOn(output, "write");
		const errors = factories();
		const controller = new AbortController();
		await expect(
			writeResearchOutput(output, payload, controller.signal, errors),
		).resolves.toBeUndefined();
		expect(write).toHaveBeenCalledExactlyOnceWith(
			payload,
			expect.any(Function),
		);
		expect(chunks).toEqual([Buffer.from(payload)]);
		expect(storage).toEqual(before);
		expect(errors.closed).not.toHaveBeenCalled();
		expect(errors.aborted).not.toHaveBeenCalled();
		expect(listeners(output)).toEqual([[], [], [], []]);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		expectCallerOwned(output);
	},
);

it("waits for the callback even when write returns true", async () => {
	const target = controlled();
	const settled = vi.fn();
	const pending = writeResearchOutput(
		target.output,
		body,
		undefined,
		factories(),
	);
	void pending.then(settled, settled);
	await nextTurn();
	expect(settled).not.toHaveBeenCalled();
	target.acknowledge();
	await expect(pending).resolves.toBeUndefined();
	expect(target.write).toHaveBeenCalledTimes(1);
	expect(listeners(target.output)).toEqual([[], [], [], []]);
});

it.each(["callback-first", "drain-first"])(
	"waits for both callback and required drain: %s",
	async (order) => {
		const target = controlled(false);
		const settled = vi.fn();
		const pending = writeResearchOutput(
			target.output,
			body,
			undefined,
			factories(),
		);
		void pending.then(settled, settled);
		if (order === "callback-first") target.acknowledge();
		else target.output.emit("drain");
		await nextTurn();
		expect(settled).not.toHaveBeenCalled();
		if (order === "callback-first") target.output.emit("drain");
		else target.acknowledge();
		await expect(pending).resolves.toBeUndefined();
		expect(target.write).toHaveBeenCalledTimes(1);
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expectCallerOwned(target.output);
	},
);

it("does not resolve a synchronous callback before learning write returned false", async () => {
	const target = controlled(false);
	target.write.mockImplementationOnce((...args) => {
		(args.at(-1) as WriteCallback)();
		return false;
	});
	const settled = vi.fn();
	const pending = writeResearchOutput(
		target.output,
		body,
		undefined,
		factories(),
	);
	void pending.then(settled, settled);
	await nextTurn();
	expect(settled).not.toHaveBeenCalled();
	target.output.emit("drain");
	await expect(pending).resolves.toBeUndefined();
	expect(target.write).toHaveBeenCalledTimes(1);
});

it("handles callback and drain occurring before write returns", async () => {
	const target = controlled(false);
	target.write.mockImplementationOnce((...args) => {
		target.output.emit("drain");
		(args.at(-1) as WriteCallback)();
		return false;
	});
	await expect(
		writeResearchOutput(target.output, body, undefined, factories()),
	).resolves.toBeUndefined();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
});

it("waits for genuine Writable backpressure without ending or destroying output", async () => {
	const target = heldWrite();
	const destroy = vi.spyOn(target.output, "destroy");
	const end = vi.spyOn(target.output, "end");
	const settled = vi.fn();
	const pending = writeResearchOutput(
		target.output,
		body,
		undefined,
		factories(),
	);
	void pending.then(settled, settled);
	await nextTurn();
	expect(target.output.writableNeedDrain).toBe(true);
	expect(settled).not.toHaveBeenCalled();
	target.acknowledge();
	await expect(pending).resolves.toBeUndefined();
	expect(destroy).not.toHaveBeenCalled();
	expect(end).not.toHaveBeenCalled();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
	expectCallerOwned(target.output);
});

it.each([
	"destroyed",
	"closed",
	"writableEnded",
	"writableFinished",
	"writable",
	"errored",
] as const)(
	"rejects an already unavailable output without writing: %s",
	async (property) => {
		const target = controlled();
		const errors = factories();
		const controller = new AbortController();
		vi.spyOn(target.output, property, "get").mockReturnValue(
			property === "errored" ? new Error(body) : property !== "writable",
		);
		await expect(
			writeResearchOutput(target.output, body, controller.signal, errors),
		).rejects.toBe(errors.closedError);
		expect(target.write).not.toHaveBeenCalled();
		expect(errors.closed).toHaveBeenCalledExactlyOnceWith();
		expect(errors.aborted).not.toHaveBeenCalled();
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	},
);

it("rejects an already aborted signal without writing or exposing its reason", async () => {
	const target = controlled();
	const errors = factories();
	const controller = new AbortController();
	controller.abort(new Error(body));
	await expect(
		writeResearchOutput(target.output, body, controller.signal, errors),
	).rejects.toBe(errors.abortedError);
	expect(target.write).not.toHaveBeenCalled();
	expect(errors.aborted).toHaveBeenCalledExactlyOnceWith(controller.signal);
	expect(errors.closed).not.toHaveBeenCalled();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expectCallerOwned(target.output);
});

it.each(["callback", "drain", "both"])(
	"aborts while waiting for %s and releases operation listeners",
	async (waitingFor) => {
		const target = controlled(waitingFor === "callback");
		const errors = factories();
		const controller = new AbortController();
		const destroy = vi.spyOn(target.output, "destroy");
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		const rejected = expect(pending).rejects.toBe(errors.abortedError);
		if (waitingFor === "drain") target.acknowledge();
		controller.abort(new Error(body));
		await rejected;
		expect(errors.aborted).toHaveBeenCalledExactlyOnceWith(controller.signal);
		expect(errors.closed).not.toHaveBeenCalled();
		expect(target.output.listenerCount("drain")).toBe(0);
		expect(target.output.listenerCount("finish")).toBe(0);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		if (waitingFor !== "drain") target.acknowledge();
		await nextTurn();
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expect(destroy).not.toHaveBeenCalled();
		expectCallerOwned(target.output);
	},
);

it("uses the exact closed factory error for a synchronous write throw", async () => {
	const target = controlled();
	const errors = factories();
	const emit = vi.spyOn(target.output, "emit");
	target.write.mockImplementationOnce(() => {
		throw new Error(body);
	});
	await expect(
		writeResearchOutput(target.output, body, undefined, errors),
	).rejects.toBe(errors.closedError);
	expect(errors.closed).toHaveBeenCalledExactlyOnceWith();
	expect(errors.aborted).not.toHaveBeenCalled();
	expect(emit).not.toHaveBeenCalled();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
	expectCallerOwned(target.output);
});

it.each([false, true])(
	"sanitizes a real callback error without a caller guard (synchronous %s)",
	async (synchronous) => {
		const errors = factories();
		const output = retain(
			new Writable({
				autoDestroy: false,
				write(_chunk, _encoding, callback) {
					if (synchronous) callback(new Error(body));
					else setImmediate(() => callback(new Error(body)));
				},
			}),
		);
		await expect(
			writeResearchOutput(output, body, undefined, errors),
		).rejects.toBe(errors.closedError);
		await nextTurn();
		expect(errors.closed).toHaveBeenCalledExactlyOnceWith();
		expect(errors.aborted).not.toHaveBeenCalled();
		expect(listeners(output)).toEqual([[], [], [], []]);
		expectCallerOwned(output);
	},
);

it.each(["error", "close", "finish"])(
	"rejects %s during a pending write and cleans up after acknowledgement",
	async (event) => {
		const target = controlled();
		const errors = factories();
		const controller = new AbortController();
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		const rejected = expect(pending).rejects.toBe(errors.closedError);
		target.output.emit(event, new Error(body));
		await rejected;
		expect(errors.closed).toHaveBeenCalledExactlyOnceWith();
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		target.acknowledge();
		await nextTurn();
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expectCallerOwned(target.output);
	},
);

it.each([false, true])(
	"protects late failed callbacks after abort without a caller guard (autoDestroy %s)",
	async (autoDestroy) => {
		const target = heldWrite(autoDestroy);
		const controller = new AbortController();
		const errors = factories();
		expect(target.output.listenerCount("error")).toBe(0);
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		const rejected = expect(pending).rejects.toBe(errors.abortedError);
		controller.abort();
		await rejected;
		try {
			expect(target.output.listenerCount("error")).toBeGreaterThan(0);
			expectCallerOwned(target.output);
		} catch (error) {
			target.acknowledge();
			throw error;
		}
		target.acknowledge(new Error(body));
		await nextTurn();
		expect(errors.closed).not.toHaveBeenCalled();
		expect(errors.aborted).toHaveBeenCalledTimes(1);
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	},
);

it("protects late error events until the cancelled callback completes", async () => {
	const target = controlled();
	const controller = new AbortController();
	const errors = factories();
	const pending = writeResearchOutput(
		target.output,
		body,
		controller.signal,
		errors,
	);
	const rejected = expect(pending).rejects.toBe(errors.abortedError);
	controller.abort();
	await rejected;
	try {
		expect(() => target.output.emit("error", new Error(body))).not.toThrow();
		await nextTurn();
		expect(target.output.listenerCount("error")).toBeGreaterThan(0);
		expect(() => target.output.emit("error", new Error(body))).not.toThrow();
	} finally {
		target.acknowledge();
	}
	await nextTurn();
	expect(errors.closed).not.toHaveBeenCalled();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
	expectCallerOwned(target.output);
});

it.each([false, true])(
	"retains protection until held asynchronous destruction finishes (abort first %s)",
	async (abortFirst) => {
		const target = heldWrite(true, true);
		const controller = new AbortController();
		const errors = factories();
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		const rejected = expect(pending).rejects.toBe(
			abortFirst ? errors.abortedError : errors.closedError,
		);
		if (abortFirst) {
			controller.abort();
			await rejected;
		}
		target.acknowledge(new Error(body));
		try {
			await rejected;
			await nextTurn();
			await nextTurn();
			expect(target.output.destroyed).toBe(true);
			expect(target.output.closed).toBe(false);
			expect(target.output.listenerCount("error")).toBeGreaterThan(0);
			expect(target.output.listenerCount("drain")).toBe(0);
			expect(target.output.listenerCount("finish")).toBe(0);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		} catch (error) {
			target.output.once("error", () => undefined);
			target.completeDestroy();
			await nextTurn();
			throw error;
		}
		target.completeDestroy();
		await nextTurn();
		expect(target.output.closed).toBe(true);
		expect(listeners(target.output)).toEqual([[], [], [], []]);
	},
);

it.each([false, true])(
	"protects a late successful callback after caller destruction (destroy completed first %s)",
	async (destroyCompletedFirst) => {
		const target = heldWrite(true, true);
		const controller = new AbortController();
		const errors = factories();
		const destroy = vi.spyOn(target.output, "destroy");
		const end = vi.spyOn(target.output, "end");
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		const rejected = expect(pending).rejects.toBe(errors.abortedError);
		controller.abort();
		await rejected;
		expectCallerOwned(target.output);
		expect(destroy).not.toHaveBeenCalled();
		expect(target.output.listenerCount("error")).toBe(1);
		expect(target.output.listenerCount("close")).toBe(1);
		const protectedListeners = listeners(target.output);
		target.output.destroy(new Error(body));
		if (destroyCompletedFirst) target.completeDestroy();
		target.acknowledge();
		try {
			expect(listeners(target.output)).toEqual(protectedListeners);
			expect(target.output.destroyed).toBe(true);
			expect(target.output.closed).toBe(destroyCompletedFirst);
			if (!destroyCompletedFirst) {
				for (let turn = 0; turn < 3; turn++) {
					await nextTurn();
					expect(target.output.closed).toBe(false);
					expect(listeners(target.output)).toEqual(protectedListeners);
				}
			}
		} catch (error) {
			target.output.once("error", () => undefined);
			if (!destroyCompletedFirst) target.completeDestroy();
			await nextTurn();
			throw error;
		}
		if (!destroyCompletedFirst) target.completeDestroy();
		await nextTurn();
		expect(target.output.closed).toBe(true);
		expect(listeners(target.output)).toEqual([[], [], [], []]);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		expect(errors.closed).not.toHaveBeenCalled();
		expect(errors.aborted).toHaveBeenCalledExactlyOnceWith(controller.signal);
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(end).not.toHaveBeenCalled();
	},
);

it("releases cancellation protection when the caller closes an outstanding stream", async () => {
	const target = heldWrite();
	const errors = factories();
	const controller = new AbortController();
	const destroy = vi.spyOn(target.output, "destroy");
	const pending = writeResearchOutput(
		target.output,
		body,
		controller.signal,
		errors,
	);
	const rejected = expect(pending).rejects.toBe(errors.abortedError);
	controller.abort();
	await rejected;
	expect(destroy).not.toHaveBeenCalled();
	expect(target.output.listenerCount("error")).toBeGreaterThan(0);
	target.output.destroy();
	await nextTurn();
	expect(listeners(target.output)).toEqual([[], [], [], []]);
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});

it.each([false, true])(
	"preserves caller listeners after settlement (abort %s)",
	async (abort) => {
		const target = controlled();
		const errors = factories();
		const controller = new AbortController();
		const callerListener = vi.fn();
		for (const event of ["error", "close", "finish", "drain"])
			target.output.on(event, callerListener);
		controller.signal.addEventListener("abort", callerListener);
		const before = listeners(target.output);
		const abortBefore = getEventListeners(controller.signal, "abort");
		const pending = writeResearchOutput(
			target.output,
			body,
			controller.signal,
			errors,
		);
		if (abort) {
			const rejected = expect(pending).rejects.toBe(errors.abortedError);
			controller.abort();
			await rejected;
			target.acknowledge();
		} else {
			target.acknowledge();
			await expect(pending).resolves.toBeUndefined();
		}
		await nextTurn();
		expect(listeners(target.output)).toEqual(before);
		expect(getEventListeners(controller.signal, "abort")).toEqual(abortBefore);
		expectCallerOwned(target.output);
	},
);
