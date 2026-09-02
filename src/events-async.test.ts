import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	BrowserEvent,
	DocumentEvents,
	controlledEventListener,
} from "./events.js";

function fixture() {
	const tree = new DocumentTree("https://example.com");
	const button = tree.createElement("button");
	tree.append(tree.root, button);
	const events = new DocumentEvents(tree);
	return { tree, button, events };
}

it("bounds idle waiters and releases them when the owning document closes", async () => {
	const { tree, button, events } = fixture();
	events.addEventListener(
		button,
		"click",
		controlledEventListener(() => new Promise<void>(() => {})),
	);
	const dispatch = events.dispatchEventAsync(button, new BrowserEvent("click"));
	const waiting = Promise.allSettled(
		Array.from({ length: 16 }, () =>
			events.whenIdle(new AbortController().signal),
		),
	);
	expect(() => events.whenIdle(new AbortController().signal)).toThrow("limit");
	tree.close();
	await expect(dispatch).rejects.toMatchObject({ code: "closed" });
	expect((await waiting).every((result) => result.status === "rejected")).toBe(
		true,
	);
	expect(events.metrics().activeDispatches).toBe(0);
});

it("cancels a controlled prefix wait and unwinds event dispatch without closing the document", async () => {
	const { tree, button, events } = fixture();
	const controller = new AbortController();
	const trace: string[] = [];
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		button,
		"click",
		controlledEventListener(() => prefix),
		{ once: true },
	);
	events.addEventListener(tree.root, "click", () => {
		trace.push("bubble");
	});
	const event = new BrowserEvent("click", { bubbles: true });
	const dispatch = events.dispatchEventAsync(button, event, controller.signal);
	controller.abort();
	await expect(dispatch).rejects.toMatchObject({ code: "aborted" });
	expect(trace).toEqual([]);
	expect(events.metrics().activeDispatches).toBe(0);
	expect(event.currentTarget).toBeNull();
	release();
	await events.dispatchEventAsync(
		button,
		new BrowserEvent("click", { bubbles: true }),
	);
	expect(trace).toEqual(["bubble"]);
	tree.close();
});

it("waits for a controlled synchronous phase before bubbling and deciding cancellation", async () => {
	const { tree, button, events } = fixture();
	const trace: string[] = [];
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async (_target, event) => {
			trace.push("start");
			await pending;
			event.preventDefault();
			trace.push("end");
		}),
	);
	events.addEventListener(tree.root, "click", () => {
		trace.push("bubble");
	});
	const event = new BrowserEvent("click", { bubbles: true, cancelable: true });
	const dispatch = events.dispatchEventAsync(button, event);
	expect(trace).toEqual(["start"]);
	release();
	expect(await dispatch).toBe(false);
	expect(trace).toEqual(["start", "end", "bubble"]);
	expect(event.currentTarget).toBeNull();
	expect(event.eventPhase).toBe(0);
	tree.close();
});

it("refuses synchronous dispatch before any listener runs when a controlled listener is on the path", () => {
	const { tree, button, events } = fixture();
	const trace: string[] = [];
	events.addEventListener(
		tree.root,
		"click",
		() => {
			trace.push("capture");
		},
		true,
	);
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async () => {
			trace.push("script");
		}),
	);
	expect(() => events.dispatchEvent(button, new BrowserEvent("click"))).toThrow(
		/asynchronous dispatch/i,
	);
	expect(trace).toEqual([]);
	expect(events.metrics().activeDispatches).toBe(0);
	tree.close();
});

it("does not await promises returned by ordinary host listeners", async () => {
	const { tree, button, events } = fixture();
	events.addEventListener(button, "click", () => new Promise<void>(() => {}));
	expect(
		await events.dispatchEventAsync(button, new BrowserEvent("click")),
	).toBe(true);
	tree.close();
});

it("preserves passive and once semantics around the controlled phase", async () => {
	const { tree, button, events } = fixture();
	let calls = 0;
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			calls++;
			event.preventDefault();
		}),
		{ passive: true, once: true },
	);
	expect(
		await events.dispatchEventAsync(
			button,
			new BrowserEvent("click", { cancelable: true }),
		),
	).toBe(true);
	expect(
		await events.dispatchEventAsync(
			button,
			new BrowserEvent("click", { cancelable: true }),
		),
	).toBe(true);
	expect(calls).toBe(1);
	tree.close();
});

it("honors immediate propagation stop after a controlled phase", async () => {
	const { tree, button, events } = fixture();
	const calls: string[] = [];
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			calls.push("first");
			event.stopImmediatePropagation();
		}),
	);
	events.addEventListener(button, "click", () => {
		calls.push("second");
	});
	events.addEventListener(tree.root, "click", () => {
		calls.push("parent");
	});
	await events.dispatchEventAsync(
		button,
		new BrowserEvent("click", { bubbles: true }),
	);
	expect(calls).toEqual(["first"]);
	tree.close();
});

it("reports controlled listener failures and continues to later listeners", async () => {
	const { tree, button, events } = fixture();
	let later = false;
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async () => {
			throw new Error("listener failure");
		}),
	);
	events.addEventListener(button, "click", () => {
		later = true;
	});
	expect(
		await events.dispatchEventAsync(button, new BrowserEvent("click")),
	).toBe(true);
	expect(later).toBe(true);
	expect(events.drainErrors()).toEqual([
		{ type: "click", target: button, message: "listener failure" },
	]);
	tree.close();
});

it("cleans event state if the document closes during the controlled phase", async () => {
	const { tree, button, events } = fixture();
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async () => {
			tree.close();
		}),
	);
	const event = new BrowserEvent("click");
	await expect(events.dispatchEventAsync(button, event)).rejects.toMatchObject({
		code: "closed",
	});
	expect(event.currentTarget).toBeNull();
	expect(event.eventPhase).toBe(0);
	expect(events.metrics().activeDispatches).toBe(0);
});

it("interrupts a never-settling controlled phase when the document closes externally", async () => {
	const { tree, button, events } = fixture();
	events.addEventListener(
		button,
		"click",
		controlledEventListener(() => new Promise<void>(() => {})),
	);
	const event = new BrowserEvent("click");
	const dispatch = events.dispatchEventAsync(button, event);
	expect(events.metrics().activeDispatches).toBe(1);
	tree.close();
	await expect(dispatch).rejects.toMatchObject({ code: "closed" });
	expect(event.currentTarget).toBeNull();
	expect(event.eventPhase).toBe(0);
	expect(events.metrics().activeDispatches).toBe(0);
});

it("keeps nested dispatch budget failures fatal even when a controlled listener catches them", async () => {
	const { tree, button } = fixture();
	const events = new DocumentEvents(tree, { maxDispatchDepth: 1 });
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async () => {
			try {
				await events.dispatchEventAsync(button, new BrowserEvent("nested"));
			} catch {}
		}),
	);
	const event = new BrowserEvent("click");
	await expect(events.dispatchEventAsync(button, event)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(events.metrics().activeDispatches).toBe(0);
	expect(event.currentTarget).toBeNull();
	tree.close();
});

it("does not invoke a listener removed during a controlled phase", async () => {
	const { tree, button, events } = fixture();
	let calls = 0;
	const later = () => {
		calls++;
	};
	events.addEventListener(
		button,
		"click",
		controlledEventListener(async () => {
			await Promise.resolve();
			events.removeEventListener(button, "click", later);
		}),
	);
	events.addEventListener(button, "click", later);
	await events.dispatchEventAsync(button, new BrowserEvent("click"));
	expect(calls).toBe(0);
	tree.close();
});
