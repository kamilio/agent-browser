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
import { documentStyles } from "./styles.js";

interface Target {
	[property: string]: unknown;
	addEventListener(type: string, callback: unknown): void;
	removeEventListener(type: string, callback: unknown): void;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture() {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		"<details><summary>More</summary>Body</details><img>",
		"https://fixture.invalid/handler-object",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(80, 40);
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
	const startCallback = vi.fn(
		(
			callback: unknown,
			args: readonly unknown[],
			options: { thisValue: unknown },
		) => {
			if (typeof callback !== "function")
				throw new Error("Unexpected noncallable invocation");
			const result = Reflect.apply(callback, options.thisValue, args);
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(result),
			};
		},
	);
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback,
		fail: vi.fn(),
		onConsoleCall: () => {},
	};
	const bindings = new PageBindings(
		{ document: tree, interactions },
		context,
		lifecycle,
	);
	const id = (tag: string) => {
		const found = [...tree.walk()].find(({ node }) => node.tagName === tag)
			?.node.id;
		if (found === undefined) throw new Error("Missing fixture element");
		return found;
	};
	const details = bindings.dom.node(id("details")) as Target;
	const image = bindings.dom.node(id("img")) as Target;
	const window = bindings.window as Target;
	const document = bindings.dom.document as Target;
	const media = (
		Reflect.get(window, "matchMedia") as (query: string) => Target
	)("(min-width: 60px)");
	return {
		tree,
		interactions,
		bindings,
		details,
		image,
		window,
		document,
		media,
		id,
		startCallback,
	};
}

it.each([
	["details", "toggle"],
	["document", "toggle"],
	["document", "scroll"],
	["window", "toggle"],
	["window", "scroll"],
	["window", "resize"],
	["image", "load"],
	["image", "error"],
	["media", "change"],
] as const)(
	"retains object identity and registration order for %s.on%s",
	async (surface, type) => {
		const test = fixture();
		const object = test[surface];
		const property = `on${type}`;
		const placeholder = Object.freeze({});
		const trace: string[] = [];
		object.addEventListener(type, () => trace.push("first"));
		object[property] = placeholder;
		expect(object[property]).toBe(placeholder);
		object.addEventListener(type, () => trace.push("last"));
		object[property] = () => trace.push("handler");
		if (surface === "media") {
			documentStyles(test.tree).setViewport(20, 40);
			await vi.runAllTimersAsync();
		} else {
			const target =
				surface === "window"
					? test.interactions.events.windowTarget
					: surface === "document"
						? test.tree.root
						: test.id(surface === "image" ? "img" : "details");
			if (target === null) throw new Error("Missing window target");
			await test.interactions.events.dispatchEventAsync(
				target,
				new BrowserEvent(type),
			);
		}
		expect(trace).toEqual(["first", "handler", "last"]);
	},
);

it.each([
	["plain", () => ({})],
	["array", () => []],
	["null-prototype", () => Object.create(null)],
	["boxed string", () => new String("ignored")],
	["promise", () => Promise.resolve()],
	[
		"handleEvent",
		() => ({
			handleEvent: () => {
				throw new Error("Do not call handleEvent");
			},
		}),
	],
] as const)(
	"retains %s values without invoking them or publishing an event capability",
	async (_name, create) => {
		const { tree, details, id, bindings, startCallback } = fixture();
		const value = create();
		details.ontoggle = value;
		expect(details.ontoggle).toBe(value);
		expect(bindings.dom.eventBindings?.metrics().listeners).toBe(1);
		tree.setAttribute(id("details"), "open", "");
		await vi.runAllTimersAsync();
		expect(startCallback).not.toHaveBeenCalled();
		expect(bindings.dom.eventBindings?.drainErrors()).toEqual([]);
		expect(tree.detailsToggleTasks.metrics().delivered).toBe(1);
	},
);

it.each([undefined, null, false, true, 0, 1n, "source", Symbol("handler")])(
	"clears an existing object slot with primitive %s",
	(value) => {
		const { details, bindings } = fixture();
		details.ontoggle = {};
		expect(bindings.dom.eventBindings?.metrics().listeners).toBe(1);
		details.ontoggle = value;
		expect(details.ontoggle).toBeNull();
		expect(bindings.dom.eventBindings?.metrics().listeners).toBe(0);
	},
);

it("does not read proxy properties or coerce assigned objects", async () => {
	const { tree, details, id, startCallback } = fixture();
	const accessed = vi.fn(() => {
		throw new Error("Unexpected property access");
	});
	const value = new Proxy({}, { get: accessed, getPrototypeOf: accessed });
	details.ontoggle = value;
	expect(details.ontoggle).toBe(value);
	tree.setAttribute(id("details"), "open", "");
	await vi.runAllTimersAsync();
	expect(accessed).not.toHaveBeenCalled();
	expect(startCallback).not.toHaveBeenCalled();
});

it("retains a revoked noncallable proxy without invoking it", async () => {
	const { tree, details, id, startCallback } = fixture();
	const { proxy, revoke } = Proxy.revocable({}, {});
	revoke();
	details.ontoggle = proxy;
	expect(details.ontoggle).toBe(proxy);
	tree.setAttribute(id("details"), "open", "");
	await vi.runAllTimersAsync();
	expect(startCallback).not.toHaveBeenCalled();
});

it("rechecks callability after an earlier listener replaces a function with an object", async () => {
	const { tree, details, id, startCallback } = fixture();
	const callback = vi.fn();
	const placeholder = {};
	details.addEventListener("toggle", () => {
		details.ontoggle = placeholder;
	});
	details.ontoggle = callback;
	tree.setAttribute(id("details"), "open", "");
	await vi.runAllTimersAsync();
	expect(details.ontoggle).toBe(placeholder);
	expect(callback).not.toHaveBeenCalled();
	expect(startCallback).toHaveBeenCalledTimes(1);
});

it("rechecks callability after an earlier listener replaces an object with a function", async () => {
	const { tree, details, id } = fixture();
	const callback = vi.fn();
	details.addEventListener("toggle", () => {
		details.ontoggle = callback;
	});
	details.ontoggle = {};
	tree.setAttribute(id("details"), "open", "");
	await vi.runAllTimersAsync();
	expect(callback).toHaveBeenCalledTimes(1);
});

it("still invokes callable proxies with normal target ownership", async () => {
	const { tree, details, id } = fixture();
	const callback = vi.fn();
	const proxy = new Proxy(callback, {});
	details.ontoggle = proxy;
	tree.setAttribute(id("details"), "open", "");
	await vi.runAllTimersAsync();
	expect(callback).toHaveBeenCalledTimes(1);
	expect(callback.mock.contexts).toEqual([details]);
});

it("charges object slots to listener limits and replaces them without allocation growth", () => {
	const { details, bindings, interactions } = fixture();
	details.ontoggle = {};
	for (
		let index = 0;
		index < interactions.events.limits.maxListenersPerNode - 1;
		index++
	)
		details.addEventListener(`test-${index}`, () => {});
	for (let index = 0; index < 1000; index++)
		details.ontoggle = Object.freeze({ index });
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(
		interactions.events.limits.maxListenersPerNode,
	);
	details.ontoggle = null;
	details.addEventListener("extra", () => {});
	expect(() => {
		details.ontoggle = {};
	}).toThrow(/listener limit/i);
	expect(details.ontoggle).toBeNull();
});

it("does not confuse EventHandler object values with EventListener objects", () => {
	const { details } = fixture();
	const value = { handleEvent() {} };
	details.ontoggle = value;
	expect(details.ontoggle).toBe(value);
	expect(() => details.addEventListener("toggle", value)).toThrow(
		/listener objects/i,
	);
});

it("revokes object-valued slots and releases listener registrations on close", () => {
	const { details, window, document, media, bindings } = fixture();
	for (const object of [details, window, document]) object.ontoggle = {};
	media.onchange = {};
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(4);
	bindings.close();
	expect(bindings.dom.eventBindings?.metrics().listeners).toBe(0);
	for (const [object, property] of [
		[details, "ontoggle"],
		[window, "ontoggle"],
		[document, "ontoggle"],
		[media, "onchange"],
	] as const) {
		expect(() => object[property]).toThrow(/closed/i);
		expect(() => {
			object[property] = {};
		}).toThrow(/closed/i);
	}
});
