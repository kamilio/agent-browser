import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserEvent, DocumentEvents } from "./events.js";

it("supports optional Window capture/bubbling without inserting a Window node into the tree", () => {
	const tree = new DocumentTree("https://example.com");
	const child = tree.createElement("button");
	tree.append(tree.root, child);
	const events = new DocumentEvents(tree, {}, { window: true });
	const windowTarget = events.windowTarget;
	if (windowTarget === null) throw new Error("Expected Window target");
	const calls: unknown[] = [];
	for (const [target, capture] of [
		[windowTarget, true],
		[tree.root, true],
		[child, false],
		[tree.root, false],
		[windowTarget, false],
	] as const)
		events.addEventListener(
			target,
			"click",
			(event) =>
				calls.push([
					event.currentTarget,
					event.eventPhase,
					event.composedPath(),
				]),
			capture,
		);
	events.dispatchEvent(child, new BrowserEvent("click", { bubbles: true }));
	expect(calls).toEqual([
		[windowTarget, 1, [child, tree.root, windowTarget]],
		[tree.root, 1, [child, tree.root, windowTarget]],
		[child, 2, [child, tree.root, windowTarget]],
		[tree.root, 3, [child, tree.root, windowTarget]],
		[windowTarget, 3, [child, tree.root, windowTarget]],
	]);
	expect(tree.nodeCount).toBe(2);
	expect(events.documentRoot).toBe(tree.root);
	expect(events.drainErrors()).toEqual([]);
});

it("excludes Window from a document load path and keeps Window-targeted events local", () => {
	const tree = new DocumentTree("https://example.com");
	const events = new DocumentEvents(tree, {}, { window: true });
	const windowTarget = events.windowTarget;
	if (windowTarget === null) throw new Error("Expected Window target");
	const calls: unknown[] = [];
	for (const target of [tree.root, windowTarget])
		events.addEventListener(
			target,
			"load",
			(event) => calls.push([event.target, event.composedPath()]),
			true,
		);
	events.dispatchEvent(tree.root, new BrowserEvent("load", { bubbles: true }));
	events.dispatchEvent(
		windowTarget,
		new BrowserEvent("load", { bubbles: true }),
	);
	expect(calls).toEqual([
		[tree.root, [tree.root]],
		[windowTarget, [windowTarget]],
	]);
	tree.close();
	expect(events.metrics()).toMatchObject({ listeners: 0, closed: true });
});

it("does not connect detached subtrees or foreign Window targets to the document's Window", () => {
	const tree = new DocumentTree("https://example.com");
	const events = new DocumentEvents(tree, {}, { window: true });
	const detached = tree.createElement("div");
	const foreign = new DocumentEvents(
		new DocumentTree("https://other.test"),
		{},
		{ window: true },
	);
	let calls = 0;
	if (events.windowTarget === null || foreign.windowTarget === null)
		throw new Error("Expected Window targets");
	events.addEventListener(events.windowTarget, "test", () => calls++, true);
	events.dispatchEvent(detached, new BrowserEvent("test", { bubbles: true }));
	expect(calls).toBe(0);
	expect(() =>
		events.dispatchEvent(
			foreign.windowTarget as number,
			new BrowserEvent("test"),
		),
	).toThrow("Unknown");
	expect(new DocumentEvents(tree).windowTarget).toBeNull();
});

function fixture() {
	const tree = new DocumentTree("https://example.com");
	const parent = tree.createElement("div");
	const child = tree.createElement("button");
	tree.append(tree.root, parent);
	tree.append(parent, child);
	return { tree, parent, child, events: new DocumentEvents(tree) };
}

it("captures, invokes at target and bubbles over a frozen path", () => {
	const { tree, parent, child, events } = fixture();
	const calls: unknown[] = [];
	for (const target of [tree.root, parent, child]) {
		for (const capture of [true, false]) {
			events.addEventListener(
				target,
				"click",
				function (event) {
					calls.push([
						this,
						event.currentTarget,
						event.target,
						event.eventPhase,
						capture,
					]);
					expect(event.composedPath()).toEqual([child, parent, tree.root]);
				},
				capture,
			);
		}
	}
	const event = new BrowserEvent("click", { bubbles: true });
	expect(events.dispatchEvent(child, event)).toBe(true);
	expect(calls).toEqual([
		[tree.root, tree.root, child, 1, true],
		[parent, parent, child, 1, true],
		[child, child, child, 2, true],
		[child, child, child, 2, false],
		[parent, parent, child, 3, false],
		[tree.root, tree.root, child, 3, false],
	]);
	expect(event.target).toBe(child);
	expect(event.currentTarget).toBe(null);
	expect(event.eventPhase).toBe(0);
	expect(event.composedPath()).toEqual([]);
	expect(event.isTrusted).toBe(false);
	expect(event.timeStamp).toBeGreaterThanOrEqual(0);
	const copy = event.composedPath();
	copy.push(123);
	expect(event.composedPath()).toEqual([]);
});

it("captures non-bubbling events but invokes both listener groups at target", () => {
	const { parent, child, events } = fixture();
	const calls: string[] = [];
	events.addEventListener(parent, "focus", () => calls.push("capture"), true);
	events.addEventListener(parent, "focus", () => calls.push("bubble"));
	events.addEventListener(
		child,
		"focus",
		() => calls.push("target capture"),
		true,
	);
	events.addEventListener(child, "focus", () => calls.push("target"));
	events.dispatchEvent(child, new BrowserEvent("focus"));
	expect(calls).toEqual(["capture", "target capture", "target"]);
});

it.each([false, true])(
	"respects stop propagation with immediate=%s",
	(immediate) => {
		const { parent, child, events } = fixture();
		const calls: string[] = [];
		events.addEventListener(
			parent,
			"test",
			(event) => {
				calls.push("first");
				if (immediate) event.stopImmediatePropagation();
				else event.stopPropagation();
			},
			true,
		);
		events.addEventListener(parent, "test", () => calls.push("second"), true);
		events.addEventListener(child, "test", () => calls.push("child"));
		events.dispatchEvent(child, new BrowserEvent("test", { bubbles: true }));
		expect(calls).toEqual(immediate ? ["first"] : ["first", "second"]);
	},
);

it("stopping target capture prevents target bubble without canceling defaults", () => {
	const { child, events } = fixture();
	const calls: string[] = [];
	events.addEventListener(
		child,
		"test",
		(event) => event.stopPropagation(),
		true,
	);
	events.addEventListener(child, "test", () => calls.push("bubble"));
	expect(
		events.dispatchEvent(child, new BrowserEvent("test", { cancelable: true })),
	).toBe(true);
	expect(calls).toEqual([]);
});

it("cancels only cancelable non-passive events and preserves cancellation on reuse", () => {
	const { child, events } = fixture();
	const prevent = (event: BrowserEvent) => event.preventDefault();
	events.addEventListener(child, "test", prevent, { passive: true });
	const event = new BrowserEvent("test", { cancelable: true });
	expect(events.dispatchEvent(child, event)).toBe(true);
	events.removeEventListener(child, "test", prevent);
	events.addEventListener(child, "test", prevent);
	expect(events.dispatchEvent(child, new BrowserEvent("test"))).toBe(true);
	expect(events.dispatchEvent(child, event)).toBe(false);
	events.removeEventListener(child, "test", prevent);
	expect(events.dispatchEvent(child, event)).toBe(false);
	expect(event.returnValue).toBe(false);
	event.returnValue = true;
	expect(event.defaultPrevented).toBe(true);
});

it("de-duplicates by type callback capture without changing once or passive", () => {
	const { child, events } = fixture();
	let calls = 0;
	const listener = () => {
		calls++;
	};
	events.addEventListener(child, "test", listener);
	events.addEventListener(child, "test", listener, { once: true });
	events.addEventListener(child, "test", listener, true);
	expect(events.metrics().listeners).toBe(2);
	events.removeEventListener(child, "test", listener, true);
	events.dispatchEvent(child, new BrowserEvent("test"));
	events.dispatchEvent(child, new BrowserEvent("test"));
	expect(calls).toBe(2);
});

it("removes once listeners before reentrant dispatch", () => {
	const { child, events } = fixture();
	let calls = 0;
	events.addEventListener(
		child,
		"test",
		() => {
			calls++;
			events.dispatchEvent(child, new BrowserEvent("test"));
		},
		{ once: true },
	);
	events.dispatchEvent(child, new BrowserEvent("test"));
	expect(calls).toBe(1);
	expect(events.metrics().listeners).toBe(0);
});

it("snapshots listeners per invocation and honors removal during dispatch", () => {
	const { parent, child, events } = fixture();
	const calls: string[] = [];
	const removed = () => calls.push("removed");
	const late = () => calls.push("late");
	events.addEventListener(child, "test", () => {
		events.removeEventListener(child, "test", removed);
		events.addEventListener(child, "test", late);
		events.addEventListener(parent, "test", () => calls.push("parent"), {
			once: true,
		});
	});
	events.addEventListener(child, "test", removed);
	events.dispatchEvent(child, new BrowserEvent("test", { bubbles: true }));
	expect(calls).toEqual(["parent"]);
	events.dispatchEvent(child, new BrowserEvent("test", { bubbles: true }));
	expect(calls).toEqual(["parent", "late", "parent"]);
});

it("uses the original path after reparenting and handles detached subtrees", () => {
	const { tree, parent, child, events } = fixture();
	const other = tree.createElement("aside");
	tree.append(tree.root, other);
	const calls: number[] = [];
	events.addEventListener(child, "move", () => tree.append(other, child));
	for (const target of [parent, other, tree.root])
		events.addEventListener(target, "move", () => calls.push(target));
	events.dispatchEvent(child, new BrowserEvent("move", { bubbles: true }));
	expect(calls).toEqual([parent, tree.root]);
	tree.remove(other);
	calls.length = 0;
	events.dispatchEvent(child, new BrowserEvent("move", { bubbles: true }));
	expect(calls).toEqual([other]);
});

it("supports abort removal including during propagation without allocating aborted listeners", () => {
	const { parent, child, events } = fixture();
	const controller = new AbortController();
	let calls = 0;
	events.addEventListener(parent, "test", () => controller.abort(), true);
	events.addEventListener(child, "test", () => calls++, {
		signal: controller.signal,
	});
	events.dispatchEvent(child, new BrowserEvent("test"));
	events.addEventListener(child, "test", () => calls++, {
		signal: controller.signal,
	});
	expect(calls).toBe(0);
	expect(events.metrics().listeners).toBe(1);
});

it("reports bounded listener exceptions without stopping sibling listeners", () => {
	const { tree, child } = fixture();
	const events = new DocumentEvents(tree, { maxErrors: 1 });
	let calls = 0;
	const object = {
		handleEvent() {
			calls++;
			throw new Error("x".repeat(1000));
		},
	};
	events.addEventListener(child, "test", object);
	events.addEventListener(child, "test", () => calls++);
	events.dispatchEvent(child, new BrowserEvent("test"));
	events.dispatchEvent(child, new BrowserEvent("test"));
	expect(calls).toBe(4);
	expect(events.metrics()).toMatchObject({
		retainedErrors: 1,
		droppedErrors: 1,
	});
	const [error] = events.drainErrors();
	expect(error.message).toHaveLength(512);
	expect(error.target).toBe(child);
	expect(events.drainErrors()).toEqual([]);
});

it("rejects redispatch of an active event but restores event state afterwards", () => {
	const { child, events } = fixture();
	const event = new BrowserEvent("test");
	events.addEventListener(
		child,
		"test",
		() => events.dispatchEvent(child, event),
		{ once: true },
	);
	expect(events.dispatchEvent(child, event)).toBe(true);
	expect(events.drainErrors()[0].message).toContain("already being dispatched");
	expect(events.dispatchEvent(child, event)).toBe(true);
	expect(event.currentTarget).toBeNull();
});

it.each([
	{ maxDispatchDepth: 3 },
	{ maxDispatchesPerTurn: 3 },
	{ maxInvocationsPerTurn: 3 },
])("aborts an entire runaway nested dispatch turn: %j", (limits) => {
	const { tree, child } = fixture();
	const events = new DocumentEvents(tree, limits);
	const event = new BrowserEvent("test");
	let calls = 0;
	events.addEventListener(child, "test", () => {
		calls++;
		try {
			events.dispatchEvent(child, new BrowserEvent("test"));
		} catch {}
	});
	expect(() => events.dispatchEvent(child, event)).toThrow("budget");
	expect(calls).toBeLessThanOrEqual(3);
	expect(event.eventPhase).toBe(0);
	expect(event.currentTarget).toBeNull();
	expect(event.composedPath()).toEqual([]);
	expect(events.metrics().activeDispatches).toBe(0);
	expect(events.dispatchEvent(child, new BrowserEvent("different"))).toBe(true);
});

it("enforces listener quotas atomically and releases listeners on close", () => {
	const { tree, parent, child } = fixture();
	const events = new DocumentEvents(tree, {
		maxListeners: 2,
		maxListenersPerNode: 1,
	});
	const listener = () => {};
	events.addEventListener(child, "test", listener);
	expect(() => events.addEventListener(child, "other", listener)).toThrow(
		"limit",
	);
	events.addEventListener(parent, "test", listener);
	expect(() => events.addEventListener(tree.root, "test", listener)).toThrow(
		"limit",
	);
	expect(events.metrics().listeners).toBe(2);
	events.removeEventListener(child, "test", listener);
	events.addEventListener(tree.root, "test", listener, {
		signal: new AbortController().signal,
	});
	tree.close();
	expect(events.metrics()).toMatchObject({ listeners: 0, closed: true });
	expect(() => events.dispatchEvent(child, new BrowserEvent("test"))).toThrow(
		"closed",
	);
	events.close();
});

it("stops immediately when a listener closes the document", () => {
	const { tree, child, events } = fixture();
	let later = false;
	events.addEventListener(child, "test", () => tree.close());
	events.addEventListener(child, "test", () => {
		later = true;
	});
	const event = new BrowserEvent("test");
	expect(() => events.dispatchEvent(child, event)).toThrow("closed");
	expect(later).toBe(false);
	expect(events.metrics()).toMatchObject({ listeners: 0, activeDispatches: 0 });
	expect(event.eventPhase).toBe(0);
});

it("keeps legacy cancellation flags monotonic until dispatch cleanup", () => {
	const { child, events } = fixture();
	let calls = 0;
	const event = new BrowserEvent("test", { cancelable: true });
	event.cancelBubble = true;
	event.cancelBubble = false;
	event.returnValue = false;
	events.addEventListener(child, "test", () => calls++);
	expect(events.dispatchEvent(child, event)).toBe(false);
	expect(calls).toBe(0);
	expect(event.cancelBubble).toBe(false);
	events.dispatchEvent(child, event);
	expect(calls).toBe(1);
});

it("rejects malformed host inputs and foreign node identifiers", () => {
	const { child, events } = fixture();
	expect(() => new BrowserEvent("x".repeat(257))).toThrow("type");
	expect(
		() =>
			new DocumentEvents(new DocumentTree("https://example.com"), {
				maxErrors: 0,
			}),
	).toThrow("limit");
	expect(() => events.dispatchEvent(child, {} as BrowserEvent)).toThrow(
		"browser event",
	);
	expect(() =>
		events.dispatchEvent(999_999_999, new BrowserEvent("test")),
	).toThrow();
	expect(() =>
		events.addEventListener(child, "test", () => {}, {
			signal: {} as AbortSignal,
		}),
	).toThrow("AbortSignal");
	events.addEventListener(child, "", null);
	expect(events.metrics().listeners).toBe(0);
});
