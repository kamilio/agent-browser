import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { BrowserEvent } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

interface GuestElement {
	[key: string]: unknown;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	appendChild(child: GuestElement): GuestElement;
	addEventListener(type: string, listener: unknown): void;
}

interface GuestEvent {
	readonly type: string;
	readonly target: object | null;
	readonly currentTarget: object | null;
}

const properties = [
	"async",
	"defer",
	"noModule",
	"type",
	"charset",
	"integrity",
	"nonce",
	"crossOrigin",
	"src",
	"onload",
	"onerror",
];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object: object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};

function fixture() {
	const tree = new DocumentTree("https://example.com/meeting/index.html");
	trees.push(tree);
	const html = tree.createElement("html");
	const head = tree.createElement("head");
	tree.append(tree.root, html);
	tree.append(html, head);
	const interactions = new DocumentInteractions(tree);
	const callbacks: ScriptCallbackRuntime = {
		isClosed: () => false,
		startCallback: vi.fn((callback, args, options) => {
			if (typeof callback !== "function") throw new Error("Expected callback");
			const result = callback.apply(options.thisValue, args);
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(result),
			};
		}),
	};
	const dom = new ScriptDom(tree, factory, {
		events: interactions.events,
		callbacks,
	});
	const document = dom.document as {
		createElement(name: string): GuestElement;
	};
	const script = document.createElement("script");
	(dom.node(head) as GuestElement).appendChild(script);
	const id = tree.get(head).children[0];
	return { tree, head, id, dom, document, script, interactions, callbacks };
}

it("exposes fresh script defaults without creating reflected attributes", () => {
	const { script, callbacks } = fixture();
	expect(script.async).toBe(true);
	expect(script.defer).toBe(false);
	expect(script.noModule).toBe(false);
	for (const name of ["type", "charset", "integrity", "nonce", "src"])
		expect(script[name]).toBe("");
	for (const name of ["crossOrigin", "onload", "onerror"])
		expect(script[name]).toBeNull();
	for (const name of properties)
		expect(script.getAttribute(name.toLowerCase())).toBeNull();
	expect(callbacks.startCallback).not.toHaveBeenCalled();
});

it.each(["type", "charset", "integrity", "nonce"])(
	"reflects %s property and attribute mutations in both directions",
	(name) => {
		const { tree, id, script } = fixture();
		script[name] = " Property Value ";
		expect(script[name]).toBe(" Property Value ");
		expect(script.getAttribute(name)).toBe(" Property Value ");
		expect(tree.get(id).attributes[name]).toBe(" Property Value ");
		script.setAttribute(name.toUpperCase(), "attribute value");
		expect(script[name]).toBe("attribute value");
		script.removeAttribute(name);
		expect(script[name]).toBe("");
		for (const [value, expected] of [
			[null, "null"],
			[undefined, "undefined"],
			[17, "17"],
			[false, "false"],
		]) {
			script[name] = value;
			expect(script.getAttribute(name)).toBe(expected);
			expect(script[name]).toBe(expected);
		}
	},
);

it.each([
	["defer", "defer"],
	["noModule", "nomodule"],
])(
	"reflects %s as attribute presence rather than attribute text",
	(name, attribute) => {
		const { script } = fixture();
		script[name] = true;
		expect(script.getAttribute(attribute)).toBe("");
		expect(script[name]).toBe(true);
		script.setAttribute(attribute, "false");
		expect(script[name]).toBe(true);
		script[name] = false;
		expect(script.getAttribute(attribute)).toBeNull();
		expect(script[name]).toBe(false);
		script[name] = "false";
		expect(script.getAttribute(attribute)).toBe("");
		script[name] = 0;
		expect(script[name]).toBe(false);
		script.setAttribute(attribute, "");
		script.removeAttribute(attribute);
		expect(script[name]).toBe(false);
	},
);

it("keeps explicit async=false through subsequent attribute mutations", () => {
	const { tree, id, script } = fixture();
	expect(script.async).toBe(true);
	script.removeAttribute("async");
	expect(script.async).toBe(true);
	script.async = false;
	expect(script.async).toBe(false);
	expect(script.getAttribute("async")).toBeNull();
	script.setAttribute("async", "false");
	expect(script.async).toBe(true);
	script.removeAttribute("async");
	expect(script.async).toBe(false);
	tree.setAttribute(id, "async", "");
	expect(script.async).toBe(true);
	tree.removeAttribute(id, "async");
	expect(script.async).toBe(false);
	script.async = "false";
	expect(script.async).toBe(true);
	expect(script.getAttribute("async")).toBe("");
	script.async = 0;
	expect(script.async).toBe(false);
	expect(script.getAttribute("async")).toBeNull();
});

it("does not restore force-async when an attribute is added and removed before the first read", () => {
	const { script } = fixture();
	script.setAttribute("async", "");
	script.removeAttribute("async");
	expect(script.async).toBe(false);
});

it.each([
	["", "anonymous"],
	["ANONYMOUS", "anonymous"],
	["use-credentials", "use-credentials"],
	["UsE-CrEdEnTiAlS", "use-credentials"],
	[" use-credentials ", "anonymous"],
	["invalid", "anonymous"],
])(
	"normalizes crossOrigin %j while preserving the raw attribute",
	(raw, normalized) => {
		const { script } = fixture();
		script.crossOrigin = raw;
		expect(script.getAttribute("crossorigin")).toBe(raw);
		expect(script.crossOrigin).toBe(normalized);
		script.crossOrigin = null;
		expect(script.getAttribute("crossorigin")).toBeNull();
		expect(script.crossOrigin).toBeNull();
		script.setAttribute("crossorigin", raw);
		expect(script.crossOrigin).toBe(normalized);
		script.removeAttribute("crossorigin");
		expect(script.crossOrigin).toBeNull();
	},
);

it("distinguishes null crossOrigin removal from primitive string conversion", () => {
	const { script } = fixture();
	for (const value of [undefined, false, 42]) {
		script.crossOrigin = value;
		expect(script.getAttribute("crossorigin")).toBe(String(value));
		expect(script.crossOrigin).toBe("anonymous");
	}
});

it("keeps raw src separate from resolution against the current document base", () => {
	const { tree, head, script, callbacks } = fixture();
	script.src = "../sdk.js?build=1#entry";
	expect(script.getAttribute("src")).toBe("../sdk.js?build=1#entry");
	expect(script.src).toBe("https://example.com/sdk.js?build=1#entry");
	const base = tree.createElement("base", { href: "/assets/v2/" });
	tree.append(head, base);
	expect(script.src).toBe("https://example.com/assets/sdk.js?build=1#entry");
	script.setAttribute("src", "bundle.js");
	expect(script.src).toBe("https://example.com/assets/v2/bundle.js");
	script.src = "http://[bad";
	expect(script.src).toBe("http://[bad");
	expect(script.getAttribute("src")).toBe("http://[bad");
	script.src = "";
	expect(script.src).toBe("https://example.com/assets/v2/");
	script.removeAttribute("src");
	expect(script.src).toBe("");
	expect(callbacks.startCallback).not.toHaveBeenCalled();
});

it.each(["load", "error"])(
	"replaces on%s without duplicating listeners and dispatches native receiver/target identities",
	async (type) => {
		const { id, dom, script, interactions, callbacks } = fixture();
		const first = vi.fn();
		const order: string[] = [];
		const received: GuestEvent[] = [];
		script[`on${type}`] = first;
		script.addEventListener(type, () => order.push("listener"));
		const replacement = vi.fn(function (this: unknown, event: GuestEvent) {
			order.push("handler");
			received.push(event);
			expect(this).toBe(script);
			expect(event.type).toBe(type);
			expect(event.target).toBe(script);
			expect(event.currentTarget).toBe(script);
			for (const name of ["type", "target", "currentTarget"])
				expect(Reflect.set(event, name, null)).toBe(false);
		});
		script[`on${type}`] = replacement;
		expect(script[`on${type}`]).toBe(replacement);
		await interactions.events.dispatchEventAsync(id, new BrowserEvent(type));
		expect(first).not.toHaveBeenCalled();
		expect(replacement).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["handler", "listener"]);
		expect(received[0].target).toBe(script);
		expect(received[0].currentTarget).toBeNull();
		expect(callbacks.startCallback).toHaveBeenCalledWith(
			replacement,
			[received[0]],
			{ thisValue: script },
		);
		expect(script.getAttribute(`on${type}`)).toBeNull();
		script[`on${type}`] = null;
		expect(script[`on${type}`]).toBeNull();
		await interactions.events.dispatchEventAsync(id, new BrowserEvent(type));
		expect(replacement).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["handler", "listener", "listener"]);
		expect(dom.eventBindings?.drainErrors()).toEqual([]);
	},
);

it("leaves handler content attributes inert and separate from IDL callbacks", async () => {
	const { id, script, interactions, callbacks } = fixture();
	for (const type of ["load", "error"]) {
		script.setAttribute(`on${type}`, "inert handler attribute");
		expect(script[`on${type}`]).toBeNull();
		await interactions.events.dispatchEventAsync(id, new BrowserEvent(type));
	}
	expect(callbacks.startCallback).not.toHaveBeenCalled();
	const load = vi.fn();
	script.onload = load;
	expect(script.getAttribute("onload")).toBe("inert handler attribute");
	await interactions.events.dispatchEventAsync(id, new BrowserEvent("load"));
	expect(load).toHaveBeenCalledTimes(1);
});

it("keeps load/error handlers independent and clears them with non-callable primitives", async () => {
	const { id, script, interactions, dom } = fixture();
	const load = vi.fn();
	const error = vi.fn();
	script.onload = load;
	script.onerror = error;
	await interactions.events.dispatchEventAsync(id, new BrowserEvent("load"));
	expect(load).toHaveBeenCalledTimes(1);
	expect(error).not.toHaveBeenCalled();
	await interactions.events.dispatchEventAsync(id, new BrowserEvent("error"));
	expect(error).toHaveBeenCalledTimes(1);
	for (const value of [undefined, false, 1, "inert handler attribute"]) {
		script.onload = load;
		script.onload = value;
		expect(script.onload).toBeNull();
		expect(script.onerror).toBe(error);
	}
	dom.close();
	await interactions.events.dispatchEventAsync(id, new BrowserEvent("error"));
	expect(error).toHaveBeenCalledTimes(1);
});

it.each(["bindings", "document"])(
	"revokes script property reads and writes when the %s closes",
	(owner) => {
		const { tree, dom, script } = fixture();
		if (owner === "bindings") dom.close();
		else tree.close();
		for (const name of properties) {
			expect(() => Reflect.get(script, name), name).toThrow(/closed/);
			expect(() => Reflect.set(script, name, null), name).toThrow(/closed/);
		}
	},
);

it("does not expose HTML script IDL on non-script elements or foreign SVG scripts", () => {
	const { tree, dom, document } = fixture();
	const div = document.createElement("div");
	const svg = dom.node(tree.createParserElement("script", {}, svgNamespace));
	for (const element of [div, svg])
		for (const name of properties)
			expect(
				Object.getOwnPropertyDescriptor(element, name),
				name,
			).toBeUndefined();
	expect(Reflect.get(svg, "namespaceURI")).toBe(svgNamespace);
});

it("leaves structural node identity readonly while script properties remain writable", () => {
	const { dom, script } = fixture();
	for (const name of [
		"nodeType",
		"nodeName",
		"tagName",
		"namespaceURI",
		"ownerDocument",
	])
		expect(Reflect.set(script, name, null), name).toBe(false);
	expect(script.ownerDocument).toBe(dom.document);
	for (const name of properties)
		expect(Object.getOwnPropertyDescriptor(script, name)?.set, name).toBeTypeOf(
			"function",
		);
});

it("rejects unsupported object-to-string conversion without invoking coercion or changing attributes", () => {
	const { script } = fixture();
	const toPrimitive = vi.fn(() => "coerced");
	const value = { [Symbol.toPrimitive]: toPrimitive };
	for (const name of [
		"type",
		"charset",
		"integrity",
		"nonce",
		"crossOrigin",
		"src",
	]) {
		script[name] = "before";
		expect(() => Reflect.set(script, name, value)).toThrow(
			/Object-to-DOM-string/,
		);
		expect(script.getAttribute(name.toLowerCase())).toBe("before");
	}
	expect(toPrimitive).not.toHaveBeenCalled();
});
