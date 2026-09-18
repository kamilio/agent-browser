import { afterEach, expect, it } from "vitest";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptEventBindings } from "./script-events.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(
	eventTargetValue?: (target: object) => unknown,
	window?: object,
) {
	const tree = parseHtmlDocument(
		"<button>event</button>",
		"https://events.example/",
	);
	const events = new DocumentEvents(tree, {}, { window: window !== undefined });
	let factory = (definition: ScriptHostObjectDefinition): object => {
		const object = { ...definition.methods };
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		return object;
	};
	const seen: unknown[] = [];
	const bindings = new ScriptEventBindings(
		tree,
		{ createHostObject: (definition) => factory(definition), eventTargetValue },
		(target) => ({ target }),
		{
			events,
			window,
			callbacks: {
				isClosed: () => false,
				startCallback(_callback, args) {
					seen.push(args[0]);
					return { synchronous: Promise.resolve(), result: Promise.resolve() };
				},
			},
		},
	);
	cleanup.push(() => {
		bindings.close();
		events.close();
		tree.close();
	});
	bindings.add(tree.root, "sample", () => {}, false);
	return {
		tree,
		events,
		bindings,
		seen,
		setFactory(next: typeof factory) {
			factory = next;
		},
	};
}

it("keeps ordinary native event facades stable and separates guest callback identity", async () => {
	const test = fixture();
	const native = new BrowserEvent("sample");
	const ordinary = test.bindings.nativeEvent(native);
	await test.events.dispatchEventAsync(test.tree.root, native);
	expect(test.seen).toEqual([ordinary]);
	expect(test.bindings.nativeEvent(native)).toBe(ordinary);
	const constructed = new BrowserEvent("sample");
	const receiver = {};
	test.bindings.bindGuestEvent(constructed, receiver);
	const facade = test.bindings.nativeEvent(constructed) as {
		type: string;
		preventDefault(): void;
	};
	expect(facade).not.toBe(receiver);
	await test.events.dispatchEventAsync(test.tree.root, constructed);
	expect(test.seen[1]).toBe(receiver);
	test.bindings.unbindGuestEvent(constructed);
	test.bindings.unbindGuestEvent(constructed);
	expect(() => facade.type).toThrow();
	expect(() => facade.preventDefault()).toThrow();
	expect(() => test.bindings.bindGuestEvent(constructed, {})).toThrow();
	expect(test.bindings.nativeEvent(native)).toBe(ordinary);
});

it("rejects replacement guest bindings without changing the first receiver", async () => {
	const test = fixture();
	const event = new BrowserEvent("sample");
	const receiver = {};
	test.bindings.bindGuestEvent(event, receiver);
	expect(() => test.bindings.bindGuestEvent(event, {})).toThrow();
	await test.events.dispatchEventAsync(test.tree.root, event);
	expect(test.seen).toEqual([receiver]);
});

it("rejects facade publication after a reentrant close", () => {
	const test = fixture();
	test.setFactory(() => {
		test.bindings.close();
		return {};
	});
	expect(() => test.bindings.nativeEvent(new BrowserEvent("sample"))).toThrow();
	expect(test.bindings.metrics().closed).toBe(true);
});

it("rejects recursive facade construction for the same native event", () => {
	const test = fixture();
	const event = new BrowserEvent("sample");
	test.setFactory(() => test.bindings.nativeEvent(event));
	expect(() => test.bindings.nativeEvent(event)).toThrow("already active");
});

it("maps Window identity inside composed paths through the runtime target boundary", async () => {
	const nativeWindow = {};
	const guestWindow = {};
	const test = fixture(
		(target) => (target === nativeWindow ? guestWindow : target),
		nativeWindow,
	);
	const event = new BrowserEvent("mapped", { bubbles: true });
	const facade = test.bindings.nativeEvent(event) as {
		composedPath(): unknown[];
	};
	let path: unknown[] = [];
	test.events.addEventListener(test.tree.root, "mapped", () => {
		path = facade.composedPath();
	});
	await test.events.dispatchEventAsync(test.tree.root, event);
	expect(path).toHaveLength(2);
	expect(path[1]).toBe(guestWindow);
	expect(path[1]).not.toBe(nativeWindow);
});

it("clears guest listener ownership when bindings close before the document dispatcher", () => {
	const tree = parseHtmlDocument(
		"<button>close</button>",
		"https://events.example/",
	);
	tree.onClose(() => bindings.close());
	const events = new DocumentEvents(tree);
	const bindings = new ScriptEventBindings(
		tree,
		{ createHostObject: () => ({}) },
		() => ({}),
		{
			events,
			callbacks: {
				isClosed: () => false,
				startCallback: () => ({
					synchronous: Promise.resolve(),
					result: Promise.resolve(),
				}),
			},
		},
	);
	bindings.add(tree.root, "close-order", () => {}, false);
	expect(bindings.metrics().listeners).toBe(1);
	expect(() => tree.close()).not.toThrow();
	expect(bindings.metrics()).toMatchObject({ closed: true, listeners: 0 });
	expect(events.metrics()).toMatchObject({ closed: true, listeners: 0 });
});
