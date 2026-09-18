import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { PageWindowGlobal } from "./page-window-global.js";
import type {
	ReleasedContext,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";

const bridgeName = "__agentBrowserWindowGlobal";
const aliases = ["window", "self", "top", "parent"];

function fakeOwner() {
	const controller = new AbortController();
	const cleanups: (() => void | Promise<void>)[] = [];
	const definitions = new Map<object, ReleasedHostDefinition>();
	const nested = new WeakSet<(...args: readonly unknown[]) => unknown>();
	const retained = new WeakSet<(...args: readonly unknown[]) => unknown>();
	const context: ReleasedContext = {
		signal: controller.signal,
		onCleanup: vi.fn((cleanup) => {
			cleanups.push(cleanup);
		}),
		createHostObject: vi.fn((definition: ReleasedHostDefinition) => {
			const object: object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			definitions.set(object, definition);
			return object;
		}),
		startCallback: vi.fn(() => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(undefined),
		})),
		releaseCallback: vi.fn(),
		retainGuestArguments(operation, _from) {
			retained.add(operation);
			return operation;
		},
		releaseGuestReference: vi.fn(() => {
			if (controller.signal.aborted)
				throw new DOMException("Context already aborted", "AbortError");
		}),
		nestedOperation(operation) {
			nested.add(operation);
			return operation;
		},
		evaluateNested: vi.fn(async () => {
			throw new Error("Unexpected nested source");
		}),
	};
	const retainGuestArguments = vi.spyOn(context, "retainGuestArguments");
	const close = async () => {
		controller.abort();
		for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
		definitions.clear();
	};
	return {
		context,
		cleanups,
		definitions,
		nested,
		retained,
		retainGuestArguments,
		close,
	};
}

function fixture() {
	const owner = fakeOwner();
	const windowGlobal = new PageWindowGlobal([
		...aliases,
		"document",
		"console",
		"answer",
		"readOnly",
		"setOnly",
		"method",
	]);
	let answer: unknown = 42;
	const setAnswer = vi.fn((value: unknown) => {
		answer = value;
	});
	const document = windowGlobal.createHostObject(owner.context, {
		properties: { defaultView: { get: () => nativeWindow } },
	});
	const console = owner.context.createHostObject({});
	const definition: ReleasedHostDefinition = {
		properties: {
			...Object.fromEntries(
				aliases.map((name) => [name, { get: () => nativeWindow }]),
			),
			document: { get: () => document },
			console: { get: () => console },
			answer: { get: () => answer, set: setAnswer },
			readOnly: { get: () => 17 },
			setOnly: { set: setAnswer },
		},
		methods: { method: vi.fn() },
	};
	const nativeWindow = windowGlobal.createHostObject(owner.context, definition);
	const globals = {
		window: nativeWindow,
		self: nativeWindow,
		top: nativeWindow,
		parent: nativeWindow,
		document,
		console,
		answer: 42,
		readOnly: 17,
		setOnly: undefined,
		method: definition.methods?.method,
	};
	const installed: Record<string, unknown> = windowGlobal.install(
		owner.context,
		globals,
	);
	const bridgeDefinition = owner.definitions.get(
		installed[bridgeName] as object,
	);
	const bind = bridgeDefinition?.methods?.bind;
	const read = bridgeDefinition?.methods?.read;
	const write = bridgeDefinition?.methods?.write;
	if (!bind || !read || !write)
		throw new Error("Missing native window methods");
	return {
		...owner,
		windowGlobal,
		nativeWindow,
		definition,
		document,
		globals,
		installed,
		bridgeDefinition,
		bind,
		read,
		write,
		setAnswer,
	};
}

it("replaces alias declarations with one reserved bridge without mutating input", () => {
	const names = [...aliases, "document", "console"];
	const windowGlobal = new PageWindowGlobal(names);
	expect(names).toEqual([...aliases, "document", "console"]);
	expect(windowGlobal.names).toEqual(["document", "console", bridgeName]);
	names.push("later");
	expect(windowGlobal.names).not.toContain("later");
});

it("removes only aliases from installed globals and preserves unrelated identities", () => {
	const test = fixture();
	expect(Object.keys(test.installed).sort()).toEqual(
		[...test.windowGlobal.names].sort(),
	);
	for (const [name, value] of Object.entries(test.globals)) {
		if (aliases.includes(name)) {
			expect(test.installed).not.toHaveProperty(name);
			expect(value).toBe(test.nativeWindow);
		} else {
			expect(Object.hasOwn(test.installed, name)).toBe(true);
			expect(test.installed[name]).toBe(value);
		}
	}
});

it("rejects repeated installation without crossing owner lifetimes", async () => {
	const test = fixture();
	const other = fakeOwner();
	const reference = {};
	test.bind(reference);
	expect(test.windowGlobal.initialized).toBe(true);
	expect(() => test.windowGlobal.install(other.context, test.globals)).toThrow(
		"Window bindings already installed",
	);
	expect(other.context.createHostObject).not.toHaveBeenCalled();
	expect(test.windowGlobal.map(test.nativeWindow)).toBe(reference);
	await test.close();
	expect(test.windowGlobal.initialized).toBe(false);
	expect(() => test.windowGlobal.install(test.context, test.globals)).toThrow(
		"Window bindings already installed",
	);
});

it("exposes raw window and accurate writable metadata through an owned bridge", () => {
	const test = fixture();
	const properties = test.bridgeDefinition?.properties;
	expect(properties?.window.get?.()).toBe(test.nativeWindow);
	expect(properties?.names.get?.()).toEqual([
		...Object.keys(test.definition.properties ?? {}),
		"method",
	]);
	expect(properties?.aliases.get?.()).toEqual(aliases);
	expect(properties?.writable.get?.()).toEqual(["answer", "setOnly"]);
	expect(properties?.methods.get?.()).toEqual(["method"]);
	expect(test.retainGuestArguments).toHaveBeenCalledExactlyOnceWith(
		expect.any(Function),
		0,
	);
	expect(test.retained.has(test.bind)).toBe(true);
	const reference = {};
	test.bind(reference);
	expect(properties?.window.get?.()).toBe(test.nativeWindow);
});

it("reads declared properties lazily and maps native window to the retained global", () => {
	const test = fixture();
	for (const name of aliases) expect(test.read(name)).toBe(test.nativeWindow);
	const reference = {};
	test.bind(reference);
	for (const name of aliases) expect(test.read(name)).toBe(reference);
	expect(test.read("document")).toBe(test.document);
	expect(test.read("console")).toBe(test.globals.console);
	expect(test.read("answer")).toBe(42);
	test.write("answer", 43);
	expect(test.read("answer")).toBe(43);
	expect(test.read("setOnly")).toBeUndefined();
	expect(() => test.read("method")).toThrowError(
		new AgentBrowserError("invalid-input", "Unknown window property"),
	);
});

it("forwards bridge writes to the original setter without changing value identity", () => {
	const test = fixture();
	const reference = {};
	test.bind(reference);
	expect(test.write("answer", reference)).toBeUndefined();
	expect(test.setAnswer).toHaveBeenCalledExactlyOnceWith(reference);
	expect(test.read("answer")).toBe(reference);
	test.write("setOnly", test.nativeWindow);
	expect(test.setAnswer).toHaveBeenNthCalledWith(2, test.nativeWindow);
	expect(test.read("answer")).toBe(reference);
	for (const name of ["readOnly", "document", "method", ...aliases])
		expect(() => test.write(name, {})).toThrowError(
			new AgentBrowserError("invalid-input", "Read-only window property"),
		);
	expect(test.setAnswer).toHaveBeenCalledTimes(2);
});

it.each([
	"__proto__",
	"constructor",
	"prototype",
	"toString",
	"valueOf",
	"hasOwnProperty",
	"__defineGetter__",
	"__lookupGetter__",
	"undeclared",
])(
	"rejects undeclared or prototype property %s without touching host accessors",
	(name) => {
		const test = fixture();
		const get = vi.fn();
		const set = vi.fn();
		Object.defineProperty(test.nativeWindow, name, { get, set });
		Object.setPrototypeOf(
			test.definition.properties,
			Object.fromEntries([[name, { get, set }]]),
		);
		expect(() => test.read(name)).toThrowError(
			new AgentBrowserError("invalid-input", "Unknown window property"),
		);
		expect(() => test.write(name, {})).toThrowError(
			new AgentBrowserError("invalid-input", "Read-only window property"),
		);
		expect(get).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
		expect(test.setAnswer).not.toHaveBeenCalled();
	},
);

it.each([undefined, null, false, 42, Symbol("answer")])(
	"rejects non-string bridge property names (%s)",
	(name) => {
		const test = fixture();
		expect(() => test.read(name)).toThrowError(
			new AgentBrowserError("invalid-input", "Unknown window property"),
		);
		expect(() => test.write(name, {})).toThrowError(
			new AgentBrowserError("invalid-input", "Read-only window property"),
		);
		expect(test.setAnswer).not.toHaveBeenCalled();
	},
);

it("does not coerce objects into whitelisted bridge property names", () => {
	const test = fixture();
	const toPrimitive = vi.fn(() => "answer");
	const name = { [Symbol.toPrimitive]: toPrimitive };
	expect(() => test.read(name)).toThrowError("Unknown window property");
	expect(() => test.write(name, {})).toThrowError("Read-only window property");
	expect(toPrimitive).not.toHaveBeenCalled();
	expect(test.setAnswer).not.toHaveBeenCalled();
});

it("maps window-valued property getters only after binding the guest reference", () => {
	const test = fixture();
	const reference = {};
	for (const name of aliases)
		expect(Reflect.get(test.nativeWindow, name)).toBe(test.nativeWindow);
	expect(Reflect.get(test.document, "defaultView")).toBe(test.nativeWindow);
	test.bind(reference);
	for (const name of aliases)
		expect(Reflect.get(test.nativeWindow, name)).toBe(reference);
	expect(Reflect.get(test.document, "defaultView")).toBe(reference);
	expect(Reflect.get(test.nativeWindow, "document")).toBe(test.document);
	expect(Reflect.get(test.nativeWindow, "console")).toBe(test.globals.console);
	const later = test.windowGlobal.createHostObject(test.context, {
		properties: { defaultView: { get: () => test.nativeWindow } },
	});
	expect(Reflect.get(later, "defaultView")).toBe(reference);
});

it("maps callback arguments explicitly without mutating or recursively translating data", async () => {
	const test = fixture();
	const reference = {};
	const unrelated = {};
	const container = { window: test.nativeWindow };
	const args = [test.nativeWindow, unrelated, container, null, undefined, 0];
	expect(test.windowGlobal.map(test.nativeWindow)).toBe(test.nativeWindow);
	test.bind(reference);
	const callback = {};
	const mapped = args.map((value) => test.windowGlobal.map(value));
	const invocation = test.context.startCallback(callback, {
		thisValue: test.windowGlobal.map(test.nativeWindow),
		args: mapped,
	});
	await invocation.synchronous;
	await invocation.result;
	expect(test.context.startCallback).toHaveBeenCalledExactlyOnceWith(callback, {
		thisValue: reference,
		args: [reference, unrelated, container, null, undefined, 0],
	});
	expect(mapped[0]).toBe(reference);
	expect(mapped[1]).toBe(unrelated);
	expect(mapped[2]).toBe(container);
	expect(args[0]).toBe(test.nativeWindow);
	expect(container.window).toBe(test.nativeWindow);
	expect(test.windowGlobal.map(reference)).toBe(reference);
});

it("keeps getters lazy and setters identical without mutating the definition", () => {
	const test = fixture();
	const get = vi.fn(() => test.nativeWindow);
	const set = vi.fn();
	const property = { get, set };
	const definition = { properties: { current: property } };
	const object = test.windowGlobal.createHostObject(test.context, definition);
	expect(get).not.toHaveBeenCalled();
	expect(definition.properties.current).toBe(property);
	expect(property.get).toBe(get);
	expect(Object.getOwnPropertyDescriptor(object, "current")?.set).toBe(set);
	const reference = {};
	test.bind(reference);
	expect(Reflect.get(object, "current")).toBe(reference);
	expect(get).toHaveBeenCalledTimes(1);
	expect(Reflect.set(object, "current", reference)).toBe(true);
	expect(set).toHaveBeenCalledExactlyOnceWith(reference);
	expect(Reflect.set(test.nativeWindow, "answer", "changed")).toBe(true);
	expect(test.setAnswer).toHaveBeenCalledExactlyOnceWith("changed");
	expect(Reflect.get(test.nativeWindow, "answer")).toBe("changed");
	expect(Reflect.set(test.nativeWindow, "readOnly", "ignored")).toBe(false);
	expect(
		Object.getOwnPropertyDescriptor(test.nativeWindow, "setOnly")?.get,
	).toBe(undefined);
});

it.each([false, true])(
	"preserves method, nested-operation and retention function identity (properties: %s)",
	(withProperties) => {
		const test = fixture();
		const plain = vi.fn(() => test.nativeWindow);
		const nested = test.context.nestedOperation(() => test.nativeWindow);
		const retained = test.context.retainGuestArguments(
			(value: unknown) => value,
			0,
		);
		const methods = { plain, nested, retained };
		const indexed = { length: () => 0, get: () => undefined, maxLength: 1 };
		const named = {
			keys: () => [],
			get: () => undefined,
			maxKeys: 1,
			maxKeyCodeUnits: 16,
		};
		const object = test.windowGlobal.createHostObject(test.context, {
			methods,
			indexed,
			named,
			...(withProperties
				? { properties: { returnedMethod: { get: () => plain } } }
				: {}),
		});
		test.bind({});
		const definition = test.definitions.get(object);
		expect(definition?.methods).toBe(methods);
		expect(definition?.indexed).toBe(indexed);
		expect(definition?.named).toBe(named);
		for (const [name, operation] of Object.entries(methods)) {
			expect(Reflect.get(object, name)).toBe(operation);
			expect(test.windowGlobal.map(operation)).toBe(operation);
		}
		if (withProperties)
			expect(Reflect.get(object, "returnedMethod")).toBe(plain);
		expect(test.nested.has(Reflect.get(object, "nested"))).toBe(true);
		expect(test.retained.has(Reflect.get(object, "retained"))).toBe(true);
		expect(test.context.evaluateNested).not.toHaveBeenCalled();
	},
);

it("rejects a declared reserved bridge name", () => {
	expect(() => new PageWindowGlobal(["window", bridgeName])).toThrowError(
		new AgentBrowserError("invalid-input", "Reserved window global"),
	);
});

it.each([undefined, null, false, 1, "window", () => undefined])(
	"rejects a missing or non-object native window (%s) before retaining anything",
	(window) => {
		const owner = fakeOwner();
		const windowGlobal = new PageWindowGlobal(aliases);
		expect(() =>
			windowGlobal.install(owner.context, { window, self: window }),
		).toThrowError(
			new AgentBrowserError("unsupported", "Native window bindings required"),
		);
		expect(owner.context.createHostObject).not.toHaveBeenCalled();
		expect(owner.retainGuestArguments).not.toHaveBeenCalled();
		expect(owner.cleanups).toHaveLength(0);
	},
);

it.each([undefined, {}])(
	"rejects a missing or mismatched self alias (%s)",
	(self) => {
		const owner = fakeOwner();
		const windowGlobal = new PageWindowGlobal(aliases);
		const window = windowGlobal.createHostObject(owner.context, {});
		expect(() =>
			windowGlobal.install(owner.context, { window, self }),
		).toThrowError(
			new AgentBrowserError("unsupported", "Native window bindings required"),
		);
		expect(owner.retainGuestArguments).not.toHaveBeenCalled();
		expect(owner.cleanups).toHaveLength(0);
	},
);

it.each(["untracked", "other bridge"])(
	"rejects a window with an %s definition before registering cleanup",
	(kind) => {
		const owner = fakeOwner();
		const windowGlobal = new PageWindowGlobal(aliases);
		const window =
			kind === "untracked"
				? owner.context.createHostObject({})
				: new PageWindowGlobal(aliases).createHostObject(owner.context, {});
		expect(() =>
			windowGlobal.install(owner.context, { window, self: window }),
		).toThrowError(
			new AgentBrowserError("unsupported", "Native window definition missing"),
		);
		expect(owner.retainGuestArguments).not.toHaveBeenCalled();
		expect(owner.cleanups).toHaveLength(0);
	},
);

it("does not release a guest reference when setup closes before binding", async () => {
	const test = fixture();
	expect(test.cleanups).toHaveLength(1);
	await test.close();
	expect(test.context.signal.aborted).toBe(true);
	expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(test.windowGlobal.map(test.nativeWindow)).toBe(test.nativeWindow);
	expect(test.windowGlobal.map(undefined)).toBe(undefined);
});

it("clears local mappings on owner close without releasing revoked references", async () => {
	const test = fixture();
	const reference = {};
	test.bind(reference);
	expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(test.cleanups).toHaveLength(1);
	const cleanup = test.cleanups[0];
	await test.close();
	expect(test.context.signal.aborted).toBe(true);
	expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(test.windowGlobal.map(test.nativeWindow)).toBe(test.nativeWindow);
	expect(test.windowGlobal.map(undefined)).toBe(undefined);
	await cleanup();
	await test.close();
	expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
});

it("rejects repeated binds, releases each rejected reference and preserves the first", async () => {
	const test = fixture();
	const reference = {};
	const rejected = [{}, {}];
	test.bind(reference);
	for (const [index, duplicate] of rejected.entries()) {
		expect(() => test.bind(duplicate)).toThrowError(
			new AgentBrowserError("invalid-input", "Window already initialized"),
		);
		expect(test.context.releaseGuestReference).toHaveBeenNthCalledWith(
			index + 1,
			duplicate,
		);
		expect(test.windowGlobal.map(test.nativeWindow)).toBe(reference);
		expect(Reflect.get(test.document, "defaultView")).toBe(reference);
	}
	await test.close();
	expect(vi.mocked(test.context.releaseGuestReference).mock.calls).toEqual([
		[rejected[0]],
		[rejected[1]],
	]);
});

it("isolates window mappings and retained-reference cleanup between page owners", async () => {
	const first = fixture();
	const second = fixture();
	const firstReference = {};
	const secondReference = {};
	first.bind(firstReference);
	second.bind(secondReference);
	expect(first.windowGlobal.map(second.nativeWindow)).toBe(second.nativeWindow);
	expect(second.windowGlobal.map(first.nativeWindow)).toBe(first.nativeWindow);
	await first.close();
	expect(first.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(first.windowGlobal.map(first.nativeWindow)).toBe(first.nativeWindow);
	expect(second.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(second.windowGlobal.map(second.nativeWindow)).toBe(secondReference);
	expect(second.context.signal.aborted).toBe(false);
	await second.close();
	expect(second.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(second.windowGlobal.map(second.nativeWindow)).toBe(
		second.nativeWindow,
	);
});
