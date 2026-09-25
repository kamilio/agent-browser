import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import {
	pageDomConstructorBootstrapGlobal,
	pageDomConstructorBootstrapSource,
} from "./page-dom-constructor-bootstrap.js";
import {
	pageEventBootstrapGlobal,
	pageEventBootstrapSource,
} from "./page-event-bootstrap.js";
import { pageMediaStreamBootstrapSource } from "./page-media-stream-bootstrap.js";
import type {
	PageRuntime,
	PageRuntimeFactory,
	PageRuntimeOptions,
} from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";

const documents: DocumentTree[] = [];
type Operation = (...args: readonly unknown[]) => unknown;

function fixture() {
	const document = new DocumentTree("https://example.test/");
	documents.push(document);
	const interactions = new DocumentInteractions(document);
	const nested = new Set<Operation>();
	const retained = new Set<Operation>();
	const released = vi.fn();
	const context: PageBindingContext = {
		createHostObject(definition) {
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
		nestedOperation(operation) {
			nested.add(operation);
			return operation;
		},
		retainGuestArguments(operation) {
			retained.add(operation);
			return operation;
		},
		releaseGuestReference: released,
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback(callback, args, options) {
			if (typeof callback !== "function")
				throw new Error("Expected native fixture callback");
			const value = callback.apply(options.thisValue, args);
			return { synchronous: Promise.resolve(), result: Promise.resolve(value) };
		},
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	return {
		page: { document, interactions },
		context,
		lifecycle,
		nested,
		retained,
		released,
	};
}

afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});

type Target = {
	dispatchEvent(event: unknown): Promise<boolean>;
	addEventListener(type: string, callback: (event: unknown) => unknown): void;
};

it("keeps legacy contexts free of event-constructor setup", () => {
	const test = fixture();
	const bindings = new PageBindings(test.page, test.context, test.lifecycle);
	expect(bindings.eventConstructors).toBeUndefined();
	expect(bindings.globals).not.toHaveProperty(pageEventBootstrapGlobal);
	expect(pageBindingGlobalNames(test.page.document)).not.toContain(
		pageEventBootstrapGlobal,
	);
	expect(bindings.window).not.toHaveProperty("dispatchEvent");
	bindings.close();
});

it("publishes shared guest dispatch and passes native target and event handles to one registered operation", async () => {
	const test = fixture();
	const bindings = new PageBindings(
		test.page,
		test.context,
		test.lifecycle,
		{},
		undefined,
		false,
		true,
	);
	const bootstrap = bindings.globals[pageEventBootstrapGlobal] as () => {
		publish(event: unknown, custom: unknown, dispatch: unknown): void;
		publishLegacy(factory: unknown): void;
		dispatch(target: unknown, event: unknown): Promise<boolean>;
		create(
			type: string,
			bubbles: boolean,
			cancelable: boolean,
			composed: boolean,
			receiver: unknown,
		): { preventDefault(): void; target: unknown };
	};
	const port = bootstrap();
	const eventConstructor = function EventFixture() {};
	const customConstructor = function CustomEventFixture() {};
	const facades = new Map<unknown, unknown>();
	const dispatch = function (this: unknown, event: unknown) {
		return port.dispatch(this, facades.get(event));
	};
	port.publish(eventConstructor, customConstructor, dispatch);
	const legacyFactory = () => {};
	port.publishLegacy(legacyFactory);
	expect(test.nested.has(port.dispatch)).toBe(true);
	expect(test.retained.has(port.dispatch)).toBe(false);
	expect(bindings.window).toHaveProperty("Event", eventConstructor);
	expect(bindings.window).toHaveProperty("CustomEvent", customConstructor);
	expect(pageBindingGlobalNames(test.page.document, {}, false, true)).toContain(
		pageEventBootstrapGlobal,
	);
	const window = bindings.window as Target;
	const document = bindings.dom.document as Target & {
		createElement(name: string): Target;
	};
	const element = document.createElement("div");
	expect(document).toHaveProperty("createEvent", legacyFactory);
	expect(window).not.toHaveProperty("createEvent");
	expect(element).not.toHaveProperty("createEvent");
	for (const target of [window, document, element]) {
		expect(target.dispatchEvent).toBe(dispatch);
		const receiver = {};
		const native = port.create("test", false, true, false, receiver);
		facades.set(receiver, native);
		let invoked = false;
		target.addEventListener("test", function (this: unknown, event: unknown) {
			expect(event).toBe(receiver);
			expect(this).toBe(target);
			expect(native.target).toBe(target);
			native.preventDefault();
			invoked = true;
		});
		expect(await target.dispatchEvent(receiver)).toBe(false);
		expect(invoked).toBe(true);
	}
	bindings.close();
	expect(test.released).toHaveBeenCalledWith(eventConstructor);
	expect(test.released).toHaveBeenCalledWith(customConstructor);
	expect(test.released).toHaveBeenCalledWith(dispatch);
	expect(test.released).toHaveBeenCalledWith(legacyFactory);
	await expect(dispatch.call(window, {})).rejects.toMatchObject({
		code: "closed",
	});
});

it("enables initialization and event setup without a fetch transport", async () => {
	const test = fixture();
	let input: PageRuntimeOptions | undefined;
	let globals: Record<string, unknown> | undefined;
	const runtime: PageRuntime = {
		budget: { stepsUsed: 0, peakCallDepth: 0, peakDataSize: 0 },
		closed: false,
		initialize: async () => undefined,
		evaluate: async () => ({ ok: true }),
		copyResult: (value) => value,
		startCallback: test.lifecycle.startCallback,
		errorDetails: () => ({ code: "script-error" }),
		close: async () => undefined,
	};
	const factory: PageRuntimeFactory = {
		supportsPageInitialization: true,
		createPageRuntime(options) {
			input = options;
			globals = options.setup(test.context);
			return runtime;
		},
	};
	const scripts = new PageScripts(test.page, factory);
	expect(input?.initializationSource).toBe(
		pageEventBootstrapSource +
			pageDomConstructorBootstrapSource +
			pageMediaStreamBootstrapSource,
	);
	expect(input?.globals).toContain(pageDomConstructorBootstrapGlobal);
	expect(globals?.[pageDomConstructorBootstrapGlobal]).toBeTypeOf("function");
	expect(input?.globals).toContain(pageEventBootstrapGlobal);
	expect(globals?.[pageEventBootstrapGlobal]).toBeTypeOf("function");
	expect(globals).not.toHaveProperty("fetch");
	await scripts.close();
});

it("keeps node dispatcher publication guarded and revokes saved dispatch targets with ScriptDom", async () => {
	const test = fixture();
	const bindings = new PageBindings(
		test.page,
		test.context,
		test.lifecycle,
		{},
		undefined,
		false,
		true,
	);
	const bootstrap = bindings.globals[pageEventBootstrapGlobal] as () => {
		publish(event: unknown, custom: unknown, dispatch: unknown): void;
		dispatch(target: unknown, event: unknown): Promise<boolean>;
		create(
			type: string,
			bubbles: boolean,
			cancelable: boolean,
			composed: boolean,
			receiver: unknown,
		): unknown;
	};
	const port = bootstrap();
	const facades = new Map<unknown, unknown>();
	const dispatch = function (this: unknown, event: unknown) {
		return port.dispatch(this, facades.get(event));
	};
	port.publish(
		function EventFixture() {},
		function CustomEventFixture() {},
		dispatch,
	);
	const receiver = {};
	facades.set(
		receiver,
		port.create("publication", false, false, false, receiver),
	);
	const createHostObject = test.context.createHostObject;
	let guarded = false;
	test.context.createHostObject = (definition) => {
		if (definition.properties?.dispatchEvent) {
			expect(() => definition.properties?.dispatchEvent.get()).toThrow(
				"not published",
			);
			guarded = true;
		}
		return createHostObject(definition);
	};
	const document = bindings.dom.document as {
		createElement(name: string): Target;
	};
	const element = document.createElement("span");
	expect(guarded).toBe(true);
	expect(element.dispatchEvent).toBe(dispatch);
	expect(await element.dispatchEvent(receiver)).toBe(true);
	bindings.dom.close();
	expect(() => element.dispatchEvent).toThrow("closed");
	await expect(dispatch.call(element, receiver)).rejects.toMatchObject({
		code: "closed",
	});
	bindings.close();
});
