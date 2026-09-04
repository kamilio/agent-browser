import { expect, it } from "vitest";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { BrowserFocusEvent } from "./focus.js";
import { BrowserSubmitEvent } from "./form-actions.js";
import { BrowserHashChangeEvent, BrowserPopStateEvent } from "./history.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserInputEvent } from "./input-events.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import { BrowserPointerActivationEvent } from "./mouse.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

interface GuestNode {
	textContent: string;
	cloneNode(deep?: boolean): GuestNode;
	addEventListener(type: string, listener: unknown, options?: unknown): void;
	removeEventListener(type: string, listener: unknown, options?: unknown): void;
}

it("exposes history event data through owned event capabilities", async () => {
	const { tree, events, target, button } = fixture();
	const results: unknown[] = [];
	button.addEventListener("popstate", (event: { state: unknown }) =>
		results.push(event.state),
	);
	button.addEventListener(
		"hashchange",
		(event: { oldURL: string; newURL: string }) =>
			results.push([event.oldURL, event.newURL]),
	);
	await events.dispatchEventAsync(
		target,
		new BrowserPopStateEvent({ page: 1 }),
	);
	await events.dispatchEventAsync(
		target,
		new BrowserHashChangeEvent(
			"https://example.com/#one",
			"https://example.com/#two",
		),
	);
	expect(results).toEqual([
		{ page: 1 },
		["https://example.com/#one", "https://example.com/#two"],
	]);
	tree.close();
});

it("does not copy registered listeners when cloning a node", async () => {
	const { tree, target, events, button } = fixture();
	let calls = 0;
	button.addEventListener("click", () => {
		calls++;
	});
	const copy = button.cloneNode(true);
	expect(copy.textContent).toBe("Before");
	expect(events.metrics().listeners).toBe(1);
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	expect(calls).toBe(1);
	tree.close();
});
interface GuestEvent {
	type: string;
	target: GuestNode;
	currentTarget: GuestNode | null;
	defaultPrevented: boolean;
	eventPhase: number;
	cancelBubble: boolean;
	returnValue: boolean;
	composedPath(): GuestNode[];
	preventDefault(): void;
	stopImmediatePropagation(): void;
}

it("exposes readonly pointer activation fields with event identity and owner revocation", async () => {
	const { tree, events, target, button, dom } = fixture();
	const observed: Record<string, unknown>[] = [];
	button.addEventListener("click", (event: Record<string, unknown>) =>
		observed.push(event),
	);
	button.addEventListener("click", (event: Record<string, unknown>) =>
		observed.push(event),
	);
	await events.dispatchEventAsync(
		target,
		new BrowserPointerActivationEvent(
			"click",
			{
				x: 0,
				y: 0,
				button: 0,
				buttons: 0,
				shift: false,
				control: false,
				alt: false,
				meta: false,
			},
			"non-pointer",
		),
	);
	expect(observed).toHaveLength(2);
	expect(observed[0]).toBe(observed[1]);
	expect(observed[0]).toMatchObject({
		pointerId: -1,
		pointerType: "",
		width: 1,
		height: 1,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		altitudeAngle: Math.PI / 2,
		azimuthAngle: 0,
		isPrimary: false,
		persistentDeviceId: 0,
		view: null,
	});
	for (const property of [
		"pointerId",
		"pointerType",
		"width",
		"pressure",
		"isPrimary",
	])
		expect(Reflect.set(observed[0], property, 99)).toBe(false);
	expect(dom.eventBindings?.drainErrors()).toEqual([]);
	tree.close();
	expect(() => observed[0].pointerId).toThrow("closed");
});

function fixture() {
	const tree = parseHtmlDocument(
		"<button>Before</button>",
		"https://example.com/",
	);
	const target = [...tree.walk()].find(({ node }) => node.tagName === "button")
		?.node.id;
	if (!target) throw new Error("Missing button");
	const events = new DocumentEvents(tree);
	let realmClosed = false;
	const callbacks: ScriptCallbackRuntime = {
		isClosed: () => realmClosed,
		startCallback(callback, args, options) {
			if (typeof callback !== "function") throw new Error("Expected callback");
			try {
				const result = Promise.resolve(callback.apply(options.thisValue, args));
				return { synchronous: Promise.resolve(), result };
			} catch (error) {
				const rejected = Promise.reject(error);
				return { synchronous: rejected, result: rejected };
			}
		},
	};
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, {
					get: property.get,
					set: property.set,
				});
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	};
	const dom = new ScriptDom(tree, factory, { events, callbacks });
	return {
		tree,
		target,
		events,
		dom,
		callbacks,
		button: dom.node(target) as GuestNode,
		document: dom.document as GuestNode,
		closeRealm: () => {
			realmClosed = true;
		},
	};
}

it("binds add/removeEventListener to the authoritative node with live event and receiver identities", async () => {
	const { tree, target, events, dom, button, document } = fixture();
	let captured: GuestEvent | undefined;
	let receiver: unknown;
	const listener = function (this: unknown, event: GuestEvent) {
		receiver = this;
		captured = event;
		expect(event.target).toBe(button);
		expect(event.currentTarget).toBe(button);
		expect(event.composedPath().at(-1)).toBe(document);
		button.textContent = "Changed";
		event.preventDefault();
	};
	button.addEventListener("click", listener);
	expect(
		await events.dispatchEventAsync(
			target,
			new BrowserEvent("click", { cancelable: true }),
		),
	).toBe(false);
	expect(receiver).toBe(button);
	expect(captured?.currentTarget).toBeNull();
	expect(captured?.eventPhase).toBe(0);
	expect(button.textContent).toBe("Changed");
	button.removeEventListener("click", listener);
	expect(events.metrics().listeners).toBe(0);
	expect(dom.eventBindings?.metrics().listeners).toBe(0);
	tree.close();
});

it("deduplicates by type/callback/capture and keeps once/passive semantics", async () => {
	const { tree, target, events, dom, button } = fixture();
	let calls = 0;
	const listener = (event: GuestEvent) => {
		calls++;
		event.preventDefault();
	};
	button.addEventListener("click", listener, { once: true, passive: true });
	button.addEventListener("click", listener, { once: false, passive: false });
	expect(events.metrics().listeners).toBe(1);
	expect(
		await events.dispatchEventAsync(
			target,
			new BrowserEvent("click", { cancelable: true }),
		),
	).toBe(true);
	expect(calls).toBe(1);
	expect(dom.eventBindings?.metrics().listeners).toBe(0);
	button.addEventListener("click", listener, true);
	button.addEventListener("click", listener, false);
	button.removeEventListener("click", listener, { capture: true });
	expect(events.metrics().listeners).toBe(1);
	tree.close();
});

it("retains one event capability across capture and target listeners", async () => {
	const { tree, target, events, button, document } = fixture();
	let captured: GuestEvent | undefined;
	document.addEventListener(
		"click",
		(event: GuestEvent) => {
			captured = event;
		},
		true,
	);
	button.addEventListener("click", (event: GuestEvent) => {
		expect(event).toBe(captured);
		event.returnValue = false;
	});
	expect(
		await events.dispatchEventAsync(
			target,
			new BrowserEvent("click", { cancelable: true }),
		),
	).toBe(false);
	tree.close();
});

it("reports asynchronous failures once without waiting for completion or losing later listeners", async () => {
	const { tree, target, events, dom, button } = fixture();
	let reject = (_error: Error) => {};
	const pending = new Promise<void>((_resolve, rejectPending) => {
		reject = rejectPending;
	});
	let later = false;
	button.addEventListener("click", () => pending);
	button.addEventListener("click", () => {
		later = true;
	});
	expect(
		await events.dispatchEventAsync(target, new BrowserEvent("click")),
	).toBe(true);
	expect(later).toBe(true);
	reject(new Error("later error"));
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(dom.eventBindings?.drainErrors()).toEqual([
		{ type: "click", target, message: "later error" },
	]);
	expect(events.drainErrors()).toEqual([]);
	tree.close();
});

it("leaves synchronous callback errors in the dispatcher without duplicate async reports", async () => {
	const { tree, target, events, dom, button } = fixture();
	button.addEventListener("click", () => {
		throw new Error("prefix error");
	});
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(events.drainErrors()).toEqual([
		{ type: "click", target, message: "prefix error" },
	]);
	expect(dom.eventBindings?.drainErrors()).toEqual([]);
	tree.close();
});

it("fails dispatch closed when the realm becomes unavailable during a callback", async () => {
	const { tree, target, events, button, closeRealm } = fixture();
	let later = false;
	button.addEventListener("click", closeRealm);
	button.addEventListener("click", () => {
		later = true;
	});
	await expect(
		events.dispatchEventAsync(target, new BrowserEvent("click")),
	).rejects.toMatchObject({ code: "closed" });
	expect(later).toBe(false);
	expect(events.metrics().closed).toBe(false);
	expect(
		await events.dispatchEventAsync(target, new BrowserEvent("click")),
	).toBe(true);
	tree.close();
});

it("closing the script DOM interrupts pending dispatch and removes listeners", async () => {
	const { tree, target, events, dom, callbacks, button } = fixture();
	callbacks.startCallback = () => ({
		synchronous: new Promise<void>(() => {}),
		result: new Promise<unknown>(() => {}),
	});
	button.addEventListener("click", () => {});
	const dispatch = events.dispatchEventAsync(target, new BrowserEvent("click"));
	dom.close();
	await expect(dispatch).rejects.toMatchObject({ code: "closed" });
	expect(events.metrics().listeners).toBe(0);
	expect(events.metrics().closed).toBe(false);
	expect(
		await events.dispatchEventAsync(target, new BrowserEvent("click")),
	).toBe(true);
	expect(() => button.addEventListener("click", () => {})).toThrow(/closed/i);
	tree.close();
});

it("rejects unsupported listener objects and guest signals explicitly", () => {
	const { tree, button } = fixture();
	button.addEventListener("click", null);
	button.addEventListener("click", undefined);
	expect(() => button.addEventListener("click", { handleEvent() {} })).toThrow(
		/listener objects/i,
	);
	expect(() =>
		button.addEventListener("click", () => {}, { signal: {} }),
	).toThrow(/signal/i);
	tree.close();
});

it("exposes explicit input, keyboard, focus and submit properties without arbitrary host reflection", async () => {
	const { tree, target, events, button } = fixture();
	const observed: unknown[] = [];
	for (const name of ["input", "keydown", "focus", "submit"])
		button.addEventListener(
			name,
			(event: GuestEvent & Record<string, unknown>) => {
				if (name === "input")
					observed.push([event.data, event.inputType, event.isComposing]);
				if (name === "keydown")
					observed.push([event.key, event.code, event.ctrlKey, event.altKey]);
				if (name === "focus") observed.push(event.relatedTarget === button);
				if (name === "submit") observed.push(event.submitter === button);
			},
		);
	await events.dispatchEventAsync(
		target,
		new BrowserInputEvent("input", "a", "insertText"),
	);
	await events.dispatchEventAsync(
		target,
		new BrowserKeyboardEvent("keydown", {
			key: "a",
			code: "KeyA",
			control: true,
			shift: false,
			meta: false,
		}),
	);
	await events.dispatchEventAsync(
		target,
		new BrowserFocusEvent("focus", target),
	);
	await events.dispatchEventAsync(target, new BrowserSubmitEvent(target));
	expect(observed).toEqual([
		["a", "insertText", false],
		["a", "KeyA", true, false],
		true,
		true,
	]);
	tree.close();
});

it("does not examine once/passive/signal while removing a listener", () => {
	const { tree, events, button } = fixture();
	const listener = () => {};
	button.addEventListener("click", listener);
	button.removeEventListener("click", listener, {
		capture: false,
		get once() {
			throw new Error("must not read");
		},
		get passive() {
			throw new Error("must not read");
		},
		get signal() {
			throw new Error("must not read");
		},
	});
	expect(events.metrics().listeners).toBe(0);
	tree.close();
});

it("bounds asynchronous error retention and records overflow without unhandled rejections", async () => {
	const { tree, target, events, dom, button } = fixture();
	button.addEventListener("click", async () => {
		throw new Error("x".repeat(1024));
	});
	for (let index = 0; index < events.limits.maxErrors + 2; index++)
		await events.dispatchEventAsync(target, new BrowserEvent("click"));
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(dom.eventBindings?.metrics().retainedErrors).toBe(
		events.limits.maxErrors,
	);
	expect(dom.eventBindings?.metrics().droppedErrors).toBe(2);
	expect(
		dom.eventBindings
			?.drainErrors()
			.every((error) => error.message.length === 512),
	).toBe(true);
	tree.close();
});

it("revokes script listeners without closing native events when a resumed callback closes its realm", async () => {
	const { tree, target, events, button, closeRealm } = fixture();
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	button.addEventListener("click", async () => {
		await pending;
		closeRealm();
		throw new Error("fatal");
	});
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	release();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(events.metrics().closed).toBe(false);
	expect(events.metrics().listeners).toBe(0);
	expect(
		await events.dispatchEventAsync(target, new BrowserEvent("click")),
	).toBe(true);
	tree.close();
});

it("script shutdown removes only its listeners and leaves native document ownership intact", async () => {
	const { tree, target, events, dom, button } = fixture();
	const calls: string[] = [];
	events.addEventListener(
		target,
		"click",
		() => calls.push("native capture"),
		true,
	);
	button.addEventListener("click", () => calls.push("guest"));
	events.addEventListener(target, "click", () => calls.push("native bubble"));
	dom.close();
	dom.close();
	expect(events.metrics()).toMatchObject({ closed: false, listeners: 2 });
	expect(dom.eventBindings?.metrics()).toMatchObject({
		closed: true,
		listeners: 0,
	});
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	expect(calls).toEqual(["native capture", "native bubble"]);
	tree.close();
	expect(events.metrics()).toMatchObject({ closed: true, listeners: 0 });
});

it("interrupts a callback that closes script bindings before returning a pending prefix", async () => {
	const { tree, target, events, dom, callbacks, button } = fixture();
	callbacks.startCallback = () => {
		dom.close();
		return {
			synchronous: new Promise<void>(() => {}),
			result: new Promise<unknown>(() => {}),
		};
	};
	button.addEventListener("click", () => {});
	let timer: ReturnType<typeof setImmediate> | undefined;
	try {
		const outcome = await Promise.race([
			events
				.dispatchEventAsync(target, new BrowserEvent("click"))
				.catch((error) => error),
			new Promise((resolve) => {
				timer = setImmediate(() => resolve("still pending"));
			}),
		]);
		expect(outcome).toMatchObject({ code: "closed" });
		expect(events.metrics().closed).toBe(false);
	} finally {
		clearImmediate(timer);
		tree.close();
	}
});

it("rejects another document's dispatcher without closing it", () => {
	const { tree, events, callbacks } = fixture();
	const other = parseHtmlDocument("<p>Other</p>", "https://example.com/other");
	expect(
		() =>
			new ScriptDom(
				other,
				{ createHostObject: () => ({}) },
				{ events, callbacks },
			),
	).toThrow(/another document/i);
	expect(events.metrics().closed).toBe(false);
	other.close();
	tree.close();
});

it("allows a once listener to register itself again for a later dispatch", async () => {
	const { tree, target, events, dom, button } = fixture();
	let calls = 0;
	const listener = () => {
		calls++;
		button.addEventListener("click", listener, { once: true });
	};
	button.addEventListener("click", listener, { once: true });
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	expect(calls).toBe(1);
	await events.dispatchEventAsync(target, new BrowserEvent("click"));
	expect(calls).toBe(2);
	expect(events.metrics().listeners).toBe(1);
	expect(dom.eventBindings?.metrics().listeners).toBe(1);
	tree.close();
});

it("does not retain a guest registration rejected by the native listener quota", () => {
	const { tree, target, events, dom, button } = fixture();
	for (let index = 0; index < events.limits.maxListenersPerNode; index++)
		events.addEventListener(target, "fill", () => {});
	expect(() => button.addEventListener("click", () => {})).toThrow(/limit/i);
	expect(dom.eventBindings?.metrics().listeners).toBe(0);
	expect(events.metrics().listeners).toBe(events.limits.maxListenersPerNode);
	tree.close();
});
