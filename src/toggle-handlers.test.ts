import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
} from "./page-bindings.js";

interface Toggle {
	type: string;
	oldState: string;
	newState: string;
	source: null;
	target: object;
	currentTarget: object | null;
	defaultPrevented: boolean;
	stopImmediatePropagation(): void;
}
type Handler = (this: Target, event: Toggle) => unknown;
interface Target {
	ontoggle: Handler | null;
	open: boolean;
	addEventListener(type: string, callback: Handler, options?: unknown): void;
	removeEventListener(type: string, callback: Handler): void;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(markup = "<details><summary>More</summary>Body</details>") {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(markup, "https://fixture.invalid/handlers");
	documents.push(tree);
	const interactions = documentInteractions(tree);
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => {},
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback(callback, args, options) {
			if (typeof callback !== "function")
				throw new TypeError("Expected callback");
			const result = callback.apply(options.thisValue, args);
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(result),
			};
		},
		fail: vi.fn(),
		onConsoleCall: () => {},
	};
	const bindings = new PageBindings(
		{ document: tree, interactions },
		context,
		lifecycle,
	);
	const node = (id: number) => bindings.dom.node(id) as Target;
	const target = [...tree.walk()].find(({ node }) => node.tagName === "details")
		?.node.id;
	if (target === undefined) throw new Error("Missing disclosure fixture");
	return {
		tree,
		bindings,
		interactions,
		target,
		node,
		details: node(target),
		document: bindings.dom.document as Target,
		window: bindings.window as Target,
	};
}

it("publishes owned null handler slots on elements, document and window only", () => {
	const { tree, bindings, node, details, document, window } = fixture();
	for (const target of [
		details,
		document,
		window,
		node(tree.createElement("div")),
	]) {
		expect(target.ontoggle).toBeNull();
		expect(Object.getOwnPropertyDescriptor(target, "ontoggle")?.set).toBeTypeOf(
			"function",
		);
	}
	for (const id of [tree.createText("text"), tree.createFragment()])
		expect("ontoggle" in bindings.dom.node(id)).toBe(false);
});

it("delivers coalesced state and authored target identity through the real task queue", async () => {
	const { tree, target, details, bindings } = fixture();
	const observed: unknown[] = [];
	details.ontoggle = function (event) {
		observed.push([
			this,
			event.target,
			event.currentTarget,
			event.oldState,
			event.newState,
			event.source,
			this.open,
		]);
	};
	tree.setAttribute(target, "open", "");
	tree.removeAttribute(target, "open");
	tree.setAttribute(target, "open", "");
	expect(observed).toEqual([]);
	await vi.runAllTimersAsync();
	expect(observed).toEqual([
		[details, details, details, "closed", "open", null, true],
	]);
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(1);
});

it("keeps replacement in its original listener position and reactivation at the end", async () => {
	const { tree, target, details } = fixture();
	const trace: string[] = [];
	details.addEventListener("toggle", () => trace.push("first"));
	details.ontoggle = () => trace.push("old");
	details.addEventListener("toggle", () => trace.push("last"));
	const replacement = () => trace.push("replacement");
	details.ontoggle = replacement;
	expect(details.ontoggle).toBe(replacement);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["first", "replacement", "last"]);
	trace.length = 0;
	details.ontoggle = null;
	details.ontoggle = replacement;
	tree.removeAttribute(target, "open");
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["first", "last", "replacement"]);
});

it.each([null, undefined, false, 1, "source text"])(
	"clears handler slots with %s without compiling strings",
	async (value) => {
		const { tree, target, details, bindings } = fixture();
		const callback = vi.fn();
		details.ontoggle = callback;
		Reflect.set(details, "ontoggle", value);
		expect(details.ontoggle).toBeNull();
		expect(bindings.dom.eventBindings?.metrics().listeners).toBe(0);
		tree.setAttribute(target, "open", "");
		await vi.runAllTimersAsync();
		expect(callback).not.toHaveBeenCalled();
	},
);

it("keeps handler registration independent of the same addEventListener callback", async () => {
	const { tree, target, details } = fixture();
	const callback = vi.fn();
	details.ontoggle = callback;
	details.addEventListener("toggle", callback);
	details.removeEventListener("toggle", callback);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(callback).toHaveBeenCalledTimes(1);
	expect(details.ontoggle).toBe(callback);
});

it("does not bubble details notifications to document or window handlers", async () => {
	const { tree, target, details, document, window } = fixture();
	const local = vi.fn();
	const ancestor = vi.fn();
	details.ontoggle = local;
	document.ontoggle = ancestor;
	window.ontoggle = ancestor;
	document.addEventListener("toggle", ancestor, { capture: true });
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(local).toHaveBeenCalledTimes(1);
	expect(ancestor).toHaveBeenCalledTimes(1);
});

it("dispatches directly to document and window with their own handler identity", async () => {
	const { tree, interactions, document, window } = fixture();
	for (const [target, object] of [
		[tree.root, document],
		[interactions.events.windowTarget, window],
	] as const) {
		if (target === null) throw new Error("Missing window target");
		const observed: unknown[] = [];
		object.ontoggle = function (event) {
			observed.push([this, event.target, event.currentTarget]);
		};
		await interactions.events.dispatchEventAsync(
			target,
			new BrowserEvent("toggle"),
		);
		expect(observed).toEqual([[object, object, object]]);
	}
});

it("keeps body handler identity separate from window", async () => {
	const { tree, node, window, interactions } = fixture();
	const body = [...tree.walk()].find(({ node }) => node.tagName === "body")
		?.node.id;
	if (body === undefined) throw new Error("Missing body");
	const callback = vi.fn();
	node(body).ontoggle = callback;
	expect(window.ontoggle).toBeNull();
	await interactions.events.dispatchEventAsync(
		body,
		new BrowserEvent("toggle"),
	);
	expect(callback).toHaveBeenCalledTimes(1);
});

it("allows reentrant state changes without dropping the subsequent toggle", async () => {
	const { tree, target, details } = fixture();
	const trace: string[] = [];
	details.ontoggle = function (event) {
		trace.push(event.newState);
		if (this.open) this.open = false;
	};
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["open", "closed"]);
});

it("honors immediate propagation stops from handlers", async () => {
	const { tree, target, details } = fixture();
	const callback = vi.fn();
	details.ontoggle = (event) => event.stopImmediatePropagation();
	details.addEventListener("toggle", callback);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(callback).not.toHaveBeenCalled();
});

it("does not copy handlers to clones or imported disclosures", async () => {
	const { tree, target, details, node } = fixture();
	const callback = vi.fn();
	details.ontoggle = callback;
	for (const copy of [tree.clone(target, true), tree.copyFrom(tree, target)]) {
		expect(node(copy).ontoggle).toBeNull();
		tree.setAttribute(copy, "open", "");
	}
	await vi.runAllTimersAsync();
	expect(callback).not.toHaveBeenCalled();
});

it("revokes retained handlers and cancels queued callbacks on close", async () => {
	const { tree, target, details, document, window, bindings } = fixture();
	const callback = vi.fn();
	for (const object of [details, document, window]) object.ontoggle = callback;
	tree.setAttribute(target, "open", "");
	bindings.close();
	for (const object of [details, document, window]) {
		expect(() => object.ontoggle).toThrow(/closed/i);
		expect(() => {
			object.ontoggle = null;
		}).toThrow(/closed/i);
	}
	await vi.runAllTimersAsync();
	expect(callback).not.toHaveBeenCalled();
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(0);
});

it("observes replacement during dispatch without taking a stale callback snapshot", async () => {
	const { tree, target, details } = fixture();
	const old = vi.fn();
	const replacement = vi.fn();
	details.addEventListener("toggle", () => {
		details.ontoggle = replacement;
	});
	details.ontoggle = old;
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(old).not.toHaveBeenCalled();
	expect(replacement).toHaveBeenCalledTimes(1);
});

it("skips a handler cleared by an earlier listener", async () => {
	const { tree, target, details } = fixture();
	const callback = vi.fn();
	details.addEventListener("toggle", () => {
		details.ontoggle = null;
	});
	details.ontoggle = callback;
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(callback).not.toHaveBeenCalled();
});

it("does not await a handler's returned promise before delivering later listeners", async () => {
	const { tree, target, details } = fixture();
	const later = vi.fn();
	details.ontoggle = () => new Promise(() => {});
	details.addEventListener("toggle", later);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(later).toHaveBeenCalledTimes(1);
	expect(tree.detailsToggleTasks.metrics()).toMatchObject({
		pending: 0,
		active: false,
	});
});

it.each(["throw", "reject"])(
	"reports a handler %s without suppressing later listeners",
	async (failure) => {
		const { tree, target, details, interactions, bindings } = fixture();
		const later = vi.fn();
		details.ontoggle = () => {
			if (failure === "throw") throw new Error("handler failure");
			return Promise.reject(new Error("handler failure"));
		};
		details.addEventListener("toggle", later);
		tree.setAttribute(target, "open", "");
		await vi.runAllTimersAsync();
		expect(later).toHaveBeenCalledTimes(1);
		const errors = [
			...interactions.events.drainErrors(),
			...(bindings.dom.eventBindings?.drainErrors() ?? []),
		];
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({
			type: "toggle",
			target,
			message: "handler failure",
		});
	},
);

it("counts handlers against native listener quotas without corrupting a rejected slot", () => {
	const { details, interactions, bindings } = fixture();
	const callback = () => {};
	for (
		let index = 0;
		index < interactions.events.limits.maxListenersPerNode;
		index++
	)
		details.addEventListener(`test-${index}`, callback);
	expect(() => {
		details.ontoggle = callback;
	}).toThrow(/listener limit/i);
	expect(details.ontoggle).toBeNull();
	details.removeEventListener("test-0", callback);
	details.ontoggle = callback;
	for (let index = 0; index < 1000; index++) details.ontoggle = () => {};
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(
		interactions.events.limits.maxListenersPerNode,
	);
});

it("keeps callback assignments separate from serialized event attributes", () => {
	const { tree, target, details } = fixture(
		'<details ontoggle="unexecuted()"><summary>More</summary></details>',
	);
	expect(details.ontoggle).toBeNull();
	const callback = () => {};
	details.ontoggle = callback;
	expect(tree.get(target).attributes.ontoggle).toBe("unexecuted()");
	expect(details.ontoggle).toBe(callback);
});

it("shares a single event capability with addEventListener and clears currentTarget after delivery", async () => {
	const { tree, target, details } = fixture();
	const events: Toggle[] = [];
	details.ontoggle = (event) => {
		events.push(event);
		return false;
	};
	details.addEventListener("toggle", (event) => {
		events.push(event);
	});
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(events).toHaveLength(2);
	expect(events[0]).toBe(events[1]);
	expect(events[0].currentTarget).toBeNull();
	expect(events[0].defaultPrevented).toBe(false);
	expect(details.open).toBe(true);
});
