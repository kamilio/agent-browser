import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { type PageNavigationTask, PageTraversals } from "./page-traversals.js";

const queues: PageTraversals[] = [];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const queue of queues.splice(0)) queue.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});
function document() {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	return tree;
}
function fixture(
	run = vi.fn(
		async (
			_tree: DocumentTree,
			_action: PageNavigationTask,
			_signal: AbortSignal,
		): Promise<unknown> => undefined,
	),
	limits = {},
) {
	vi.useFakeTimers();
	const errors = vi.fn();
	const queue = new PageTraversals(run, errors, limits);
	queues.push(queue);
	const tree = document();
	return { queue, tree, run, errors };
}

it("defers queued parser work until activation and a later task", async () => {
	const { queue, tree, run } = fixture();
	queue.enqueue(tree, -1);
	await vi.advanceTimersByTimeAsync(5);
	expect(run).not.toHaveBeenCalled();
	queue.activate(tree);
	expect(run).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(run).toHaveBeenCalledWith(
		tree,
		{ kind: "traverse", delta: -1 },
		expect.any(AbortSignal),
	);
	expect(queue.metrics()).toMatchObject({
		completed: 1,
		pending: 0,
		active: false,
	});
});

it("serializes requests without awaiting a later request inside the caller", async () => {
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const run = vi.fn(
		async (
			_tree: DocumentTree,
			action: PageNavigationTask,
			_signal: AbortSignal,
		) => {
			if (action.kind === "traverse" && action.delta === -1) await waiting;
		},
	);
	const { queue, tree } = fixture(run);
	queue.activate(tree);
	queue.enqueue(tree, -1);
	queue.enqueue(tree, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(run.mock.calls.map((call) => call[1])).toEqual([
		{ kind: "traverse", delta: -1 },
	]);
	expect(queue.metrics()).toMatchObject({ active: true, pending: 1 });
	release();
	await vi.advanceTimersByTimeAsync(1);
	expect(run.mock.calls.map((call) => call[1])).toEqual([
		{ kind: "traverse", delta: -1 },
		{ kind: "traverse", delta: 1 },
	]);
});

it("retiring the source after replacement does not abort its successful navigation", async () => {
	const next = document();
	const run = vi.fn(
		async (
			source: DocumentTree,
			_action: PageNavigationTask,
			signal: AbortSignal,
		) => {
			if (source !== next) {
				queue.enqueue(next, 1);
				queue.activate(next);
				queue.retire(source);
				expect(signal.aborted).toBe(false);
			}
		},
	);
	const test = fixture(run);
	const queue = test.queue;
	queue.activate(test.tree);
	queue.enqueue(test.tree, -1);
	queue.enqueue(test.tree, -2);
	await vi.advanceTimersByTimeAsync(5);
	expect(run.mock.calls.map((call) => call[0])).toEqual([test.tree, next]);
	expect(queue.metrics()).toMatchObject({
		accepted: 3,
		completed: 2,
		canceled: 1,
	});
});

it("cancels queued work and an active cooperative operation", async () => {
	const run = vi.fn(
		(_tree: DocumentTree, _action: PageNavigationTask, signal: AbortSignal) =>
			new Promise<void>((_resolve, reject) =>
				signal.addEventListener(
					"abort",
					() => reject(new AgentBrowserError("aborted", "canceled")),
					{ once: true },
				),
			),
	);
	const { queue, tree } = fixture(run);
	queue.activate(tree);
	queue.enqueue(tree, -1);
	queue.enqueue(tree, -2);
	await vi.advanceTimersByTimeAsync(1);
	queue.cancel();
	await vi.advanceTimersByTimeAsync(1);
	expect(run).toHaveBeenCalledTimes(1);
	expect(queue.metrics()).toMatchObject({
		canceled: 2,
		active: false,
		pending: 0,
	});
});

it("bounds pending work and retains its lifetime budget after cancellation", async () => {
	const { queue, tree, run } = fixture(undefined, {
		maxPending: 1,
		maxRequests: 2,
	});
	queue.enqueue(tree, -1);
	expect(() => queue.enqueue(tree, 1)).toThrow("limit");
	queue.cancel();
	queue.enqueue(tree, -1);
	queue.activate(tree);
	await vi.advanceTimersByTimeAsync(1);
	expect(() => queue.enqueue(tree, 1)).toThrow("limit");
	expect(run).toHaveBeenCalledTimes(1);
});

it("sanitizes failures, isolates diagnostic errors, and continues with later work", async () => {
	const run = vi.fn(
		async (
			_tree: DocumentTree,
			action: PageNavigationTask,
			_signal: AbortSignal,
		) => {
			if (action.kind === "traverse" && action.delta === -1)
				throw new AgentBrowserError(
					"private-secret" as ErrorCode,
					"private host path",
				);
		},
	);
	const { queue, tree, errors } = fixture(run);
	errors.mockImplementation(() => {
		throw new Error("diagnostic failure");
	});
	queue.activate(tree);
	queue.enqueue(tree, -1);
	queue.enqueue(tree, 1);
	await vi.advanceTimersByTimeAsync(5);
	expect(errors).toHaveBeenCalledWith(tree, "unsupported");
	expect(queue.metrics()).toMatchObject({ failed: 1, completed: 1 });
	expect(JSON.stringify(queue.metrics())).not.toContain("private");
});

it("closing prevents activation and discards unstarted work", async () => {
	const { queue, tree, run } = fixture();
	queue.enqueue(tree, -1);
	queue.close();
	expect(() => queue.activate(tree)).toThrow("closed");
	expect(() => queue.enqueue(tree, 1)).toThrow("closed");
	await vi.advanceTimersByTimeAsync(1);
	expect(run).not.toHaveBeenCalled();
	expect(queue.metrics()).toMatchObject({ closed: true, canceled: 1 });
});

it("rejects invalid deltas and limit configuration", () => {
	const { queue, tree } = fixture();
	for (const delta of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		1.5,
		2147483648,
		-2147483649,
	])
		expect(() => queue.enqueue(tree, delta)).toThrow("delta");
	expect(
		() => new PageTraversals(async () => {}, undefined, { maxPending: 9 }),
	).toThrow("limits");
	expect(queue.metrics().accepted).toBe(0);
});

it("checks queue admission before invoking synchronous fragment preparation", () => {
	const { queue, tree } = fixture(undefined, { maxPending: 1 });
	const prepare = vi.fn(() => async () => undefined);
	queue.enqueueNavigation(tree, "https://example.com/private", false);
	expect(() => queue.enqueueFragment(tree, prepare)).toThrow("limit");
	expect(prepare).not.toHaveBeenCalled();
	queue.cancel();
	queue.enqueueFragment(tree, prepare);
	expect(prepare).toHaveBeenCalledTimes(1);
	expect(queue.metrics()).toMatchObject({ accepted: 2, pending: 1 });
});

it("does not consume queue entries for rejected fragment preparation", () => {
	const { queue, tree } = fixture();
	expect(() =>
		queue.enqueueFragment(tree, () => {
			throw new Error("rejected");
		}),
	).toThrow("rejected");
	expect(queue.metrics()).toMatchObject({ accepted: 0, pending: 0 });
});

it("omits Location URLs from outcome metrics while retaining task kind", async () => {
	const { queue, tree } = fixture();
	queue.activate(tree);
	queue.enqueueNavigation(tree, "https://example.com/?private=secret", true);
	await vi.advanceTimersByTimeAsync(5);
	expect(queue.metrics().last).toEqual({
		sequence: 1,
		kind: "navigate",
		outcome: "complete",
	});
	expect(JSON.stringify(queue.metrics())).not.toContain("secret");
});
