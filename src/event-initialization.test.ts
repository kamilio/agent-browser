import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	BrowserEvent,
	DocumentEvents,
	controlledEventListener,
} from "./events.js";

function fixture() {
	const tree = new DocumentTree("https://example.com");
	const child = tree.createElement("button");
	tree.append(tree.root, child);
	const events = new DocumentEvents(tree);
	return { tree, child, events };
}

function snapshot(event: BrowserEvent) {
	return {
		initialized: event.initialized,
		type: event.type,
		bubbles: event.bubbles,
		cancelable: event.cancelable,
		composed: event.composed,
		timeStamp: event.timeStamp,
		target: event.target,
		currentTarget: event.currentTarget,
		phase: event.eventPhase,
		path: event.composedPath(),
		defaultPrevented: event.defaultPrevented,
		cancelBubble: event.cancelBubble,
		returnValue: event.returnValue,
	};
}

it("creates uninitialized legacy events with fresh timestamps and readonly state", () => {
	const before = performance.now();
	const event = BrowserEvent.createLegacy();
	const after = performance.now();
	expect(event).toBeInstanceOf(BrowserEvent);
	expect(snapshot(event)).toEqual({
		initialized: false,
		type: "",
		bubbles: false,
		cancelable: false,
		composed: false,
		timeStamp: event.timeStamp,
		target: null,
		currentTarget: null,
		phase: 0,
		path: [],
		defaultPrevented: false,
		cancelBubble: false,
		returnValue: true,
	});
	expect(event.timeStamp).toBeGreaterThanOrEqual(before);
	expect(event.timeStamp).toBeLessThanOrEqual(after);
	expect(event.isTrusted).toBe(false);
	expect(
		Object.getOwnPropertyDescriptor(BrowserEvent.prototype, "initialized")?.set,
	).toBeUndefined();
	expect(Reflect.set(event, "initialized", true)).toBe(false);
	expect(event.initialized).toBe(false);
});

it.each(["sync", "async"] as const)(
	"dispatches explicitly empty constructor types through %s dispatch",
	async (mode) => {
		const { tree, child, events } = fixture();
		const event = new BrowserEvent("");
		const calls: BrowserEvent[] = [];
		events.addEventListener(child, "", (received) => calls.push(received));
		expect(event.initialized).toBe(true);
		const result =
			mode === "sync"
				? events.dispatchEvent(child, event)
				: await events.dispatchEventAsync(child, event);
		expect(result).toBe(true);
		expect(calls).toEqual([event]);
		expect(event.target).toBe(child);
		tree.close();
	},
);

it.each(["sync", "async"] as const)(
	"rejects uninitialized events before %s listener invocation or consumption",
	async (mode) => {
		const { tree, child, events } = fixture();
		const event = BrowserEvent.createLegacy();
		const before = snapshot(event);
		const calls: string[] = [];
		const controlled = controlledEventListener(async () => {
			calls.push("controlled");
		});
		events.addEventListener(child, "", () => calls.push("native"), {
			once: true,
		});
		events.addEventListener(child, "", controlled, { once: true });
		const expected = new AgentBrowserError(
			"invalid-input",
			"Event is not initialized",
		);
		if (mode === "sync")
			expect(() => events.dispatchEvent(child, event)).toThrow(expected);
		else
			await expect(
				events.dispatchEventAsync(child, event),
			).rejects.toMatchObject({
				code: expected.code,
				message: expected.message,
			});
		expect(calls).toEqual([]);
		expect(snapshot(event)).toEqual(before);
		expect(events.metrics()).toMatchObject({
			listeners: 2,
			activeDispatches: 0,
			retainedErrors: 0,
		});
		event.initEvent("");
		if (mode === "sync") {
			events.removeEventListener(child, "", controlled);
			expect(events.dispatchEvent(child, event)).toBe(true);
		} else {
			expect(await events.dispatchEventAsync(child, event)).toBe(true);
		}
		expect(calls).toEqual(
			mode === "sync" ? ["native"] : ["native", "controlled"],
		);
		tree.close();
	},
);

it.each(["sync", "async"] as const)(
	"resets cancellation, propagation and target for legacy reuse after %s dispatch",
	async (mode) => {
		const { tree, child, events } = fixture();
		const event = BrowserEvent.createLegacy();
		const timeStamp = event.timeStamp;
		const dispatch = () =>
			mode === "sync"
				? events.dispatchEvent(child, event)
				: events.dispatchEventAsync(child, event);
		event.initEvent("first", true, true);
		events.addEventListener(child, "first", (received) => {
			received.preventDefault();
			received.stopImmediatePropagation();
		});
		expect(await dispatch()).toBe(false);
		expect(event.target).toBe(child);
		expect(event.defaultPrevented).toBe(true);
		event.stopImmediatePropagation();
		expect(event.cancelBubble).toBe(true);
		expect(event.initEvent("second")).toBeUndefined();
		expect(snapshot(event)).toMatchObject({
			initialized: true,
			type: "second",
			bubbles: false,
			cancelable: false,
			timeStamp,
			target: null,
			currentTarget: null,
			phase: 0,
			path: [],
			defaultPrevented: false,
			cancelBubble: false,
			returnValue: true,
		});
		const calls: string[] = [];
		events.addEventListener(child, "second", (received) => {
			calls.push("first listener");
			received.preventDefault();
		});
		events.addEventListener(child, "second", () =>
			calls.push("second listener"),
		);
		events.addEventListener(tree.root, "second", () => calls.push("parent"));
		expect(await dispatch()).toBe(true);
		expect(calls).toEqual(["first listener", "second listener"]);
		event.initEvent("second", true, true);
		expect(await dispatch()).toBe(false);
		expect(calls.slice(2)).toEqual([
			"first listener",
			"second listener",
			"parent",
		]);
		expect(events.drainErrors()).toEqual([]);
		tree.close();
	},
);

it.each([false, true])(
	"preserves timestamp and composed=%s across repeated initialization",
	(composed) => {
		const event = new BrowserEvent("original", { composed });
		const timeStamp = event.timeStamp;
		event.initEvent("changed", true, true);
		event.initEvent("");
		expect(event.initialized).toBe(true);
		expect(event.type).toBe("");
		expect(event.composed).toBe(composed);
		expect(event.timeStamp).toBe(timeStamp);
	},
);

it.each([
	["sync", false],
	["sync", true],
	["async", false],
	["async", true],
] as const)(
	"ignores initialization during %s dispatch with immediate stop=%s",
	async (mode, immediate) => {
		const { tree, child, events } = fixture();
		const event = new BrowserEvent("original", {
			bubbles: true,
			cancelable: true,
			composed: true,
		});
		const calls: string[] = [];
		const observations: ReturnType<typeof snapshot>[] = [];
		const initialize = (received: BrowserEvent) => {
			calls.push("first");
			received.preventDefault();
			if (immediate) received.stopImmediatePropagation();
			observations.push(snapshot(received));
			received.initEvent("replacement");
			observations.push(snapshot(received));
		};
		events.addEventListener(
			child,
			"original",
			mode === "sync"
				? initialize
				: controlledEventListener(async (_target, received) => {
						await Promise.resolve();
						initialize(received);
					}),
		);
		events.addEventListener(child, "original", () => calls.push("second"));
		events.addEventListener(tree.root, "original", () => calls.push("parent"));
		events.addEventListener(child, "replacement", () =>
			calls.push("replacement"),
		);
		const result =
			mode === "sync"
				? events.dispatchEvent(child, event)
				: await events.dispatchEventAsync(child, event);
		expect(result).toBe(false);
		expect(observations).toHaveLength(2);
		expect(observations[1]).toEqual(observations[0]);
		expect(observations[0]).toMatchObject({
			target: child,
			currentTarget: child,
			phase: 2,
			path: [child, tree.root],
			defaultPrevented: true,
			cancelBubble: immediate,
		});
		expect(calls).toEqual(
			immediate ? ["first"] : ["first", "second", "parent"],
		);
		expect(event.type).toBe("original");
		expect(event.target).toBe(child);
		expect(event.currentTarget).toBeNull();
		expect(event.eventPhase).toBe(0);
		expect(event.composedPath()).toEqual([]);
		expect(events.drainErrors()).toEqual([]);
		tree.close();
	},
);

it.each([undefined, null, 1, {}, "x".repeat(257)])(
	"rejects invalid initialization types atomically: %j",
	(type) => {
		for (const event of [
			BrowserEvent.createLegacy(),
			new BrowserEvent("original", { cancelable: true }),
		]) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const before = snapshot(event);
			expect(() => event.initEvent(type as string, true, true)).toThrow(
				new AgentBrowserError("invalid-input", "Invalid event type"),
			);
			expect(snapshot(event)).toEqual(before);
		}
	},
);

it("accepts the native event type length boundary", () => {
	const event = BrowserEvent.createLegacy();
	const type = "x".repeat(256);
	event.initEvent(type, true, true);
	expect(event.initialized).toBe(true);
	expect(event.type).toBe(type);
	expect(event.bubbles).toBe(true);
	expect(event.cancelable).toBe(true);
});

it.each([undefined, null, 1, {}, Object.create(BrowserEvent.prototype)])(
	"rejects invalid native initialization receivers: %j",
	(receiver) => {
		const getter = Object.getOwnPropertyDescriptor(
			BrowserEvent.prototype,
			"initialized",
		)?.get;
		expect(getter).toBeTypeOf("function");
		const expected = new AgentBrowserError(
			"invalid-input",
			"Expected a browser event",
		);
		expect(() =>
			BrowserEvent.prototype.initEvent.call(receiver as BrowserEvent, "test"),
		).toThrow(expected);
		expect(() => getter?.call(receiver)).toThrow(expected);
	},
);
