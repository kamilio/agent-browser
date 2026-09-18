import { afterEach, expect, it, vi } from "vitest";
import { DocumentEvents } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { PageBindingContext } from "./page-bindings.js";
import {
	PageEventConstructors,
	pageEventConstructorLimits,
} from "./page-event-constructors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import {
	type ScriptCallbackRuntime,
	ScriptEventBindings,
} from "./script-events.js";

type Operation = (...args: readonly unknown[]) => unknown;
interface Facade {
	type: string;
	target: object | null;
	currentTarget: object | null;
	eventPhase: number;
	bubbles: boolean;
	cancelable: boolean;
	composed: boolean;
	isTrusted: boolean;
	defaultPrevented: boolean;
	returnValue: boolean;
	cancelBubble: boolean;
	preventDefault(): void;
	stopPropagation(): void;
	stopImmediatePropagation(): void;
	composedPath(): object[];
}
interface Port {
	window(): object;
	createLegacy(receiver: unknown): Facade;
	validateDocument(capability: unknown): boolean;
	publishLegacy(factory: unknown): void;
	initialize(
		facade: unknown,
		type: unknown,
		bubbles: unknown,
		cancelable: unknown,
	): boolean;
	publish(event: unknown, custom: unknown, dispatch: unknown): void;
	dispatch(target: unknown, facade: unknown): Promise<boolean>;
	create(
		type: unknown,
		bubbles: unknown,
		cancelable: unknown,
		composed: unknown,
		receiver: unknown,
	): Facade;
}

const cleanup: (() => void)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) close();
	for (let turn = 0; turn < 12; turn++) await Promise.resolve();
	vi.restoreAllMocks();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const object = { ...definition.methods };
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, descriptor);
	return object;
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function fixture(
	publish = true,
	opaqueReferences = false,
	registerWindow = true,
) {
	const tree = parseHtmlDocument(
		"<main><button>target</button></main>",
		"https://events.example/",
	);
	const events = new DocumentEvents(tree, {}, { window: true });
	const target = [...tree.walk()].find(({ node }) => node.tagName === "button")
		?.node.id;
	if (target === undefined) throw new Error("Missing test target");
	const parent = tree.get(target).parent;
	if (parent === null) throw new Error("Missing test parent");
	const objects = new Map<number, object>();
	const node = (id: number) => {
		let object = objects.get(id);
		if (!object) {
			object = { id };
			objects.set(id, object);
		}
		return object;
	};
	const window = {};
	const registered = new Set<Operation>();
	const retained = new Map<Operation, number>();
	const guestValues = new Map<object, unknown>();
	let setup = true;
	let factory = hostObject;
	const release = vi.fn<PageBindingContext["releaseGuestReference"]>(() => {});
	const context: PageBindingContext = {
		createHostObject: (definition) => factory(definition),
		nestedOperation: (operation) => {
			if (!setup) throw new Error("Registration after setup");
			registered.add(operation);
			return operation;
		},
		retainGuestArguments: (operation, from) => {
			if (!setup) throw new Error("Retention registration after setup");
			const wrapped = ((...args: readonly unknown[]) =>
				operation(
					...args.map((value, index) => {
						if (!opaqueReferences || index < from) return value;
						const handle = Object.freeze({});
						guestValues.set(handle, value);
						return handle;
					}),
				)) as typeof operation;
			retained.set(wrapped, from);
			return wrapped;
		},
		releaseGuestReference: release,
	};
	const callbacks: ScriptCallbackRuntime = {
		isClosed: () => false,
		startCallback(callback, args, options) {
			try {
				const result = Reflect.apply(
					callback as (...args: unknown[]) => unknown,
					options.thisValue,
					args.map((value) =>
						value !== null &&
						(typeof value === "object" || typeof value === "function") &&
						guestValues.has(value)
							? guestValues.get(value)
							: value,
					),
				);
				if (
					result &&
					typeof result === "object" &&
					"synchronous" in result &&
					"result" in result
				)
					return result as ReturnType<ScriptCallbackRuntime["startCallback"]>;
				return {
					synchronous: Promise.resolve(),
					result: Promise.resolve(result),
				};
			} catch (error) {
				const rejected = Promise.reject(error);
				void rejected.catch(() => {});
				return { synchronous: rejected, result: rejected };
			}
		},
	};
	const bindings = new ScriptEventBindings(tree, context, node, {
		events,
		callbacks,
		window,
	});
	let supplied: ScriptEventBindings | undefined = bindings;
	const owner = new PageEventConstructors(
		tree,
		context,
		events,
		() => supplied,
	);
	setup = false;
	cleanup.push(() => {
		owner.close();
		bindings.close();
		events.close();
		tree.close();
	});
	const windowTarget = events.windowTarget;
	if (windowTarget === null) throw new Error("Missing Window target");
	if (registerWindow) owner.registerTarget(windowTarget, window);
	owner.registerTarget(target, node(target));
	const port = owner.bootstrap() as Port;
	const constructors = [
		function Event() {},
		function CustomEvent() {},
		function dispatchEvent() {},
	] as const;
	if (publish) port.publish(...constructors);
	const create = (
		type = "sample",
		flags = { bubbles: true, cancelable: true, composed: false },
		receiver: object = {},
	) => {
		const facade = port.create(
			type,
			flags.bubbles,
			flags.cancelable,
			flags.composed,
			receiver,
		);
		return { receiver, facade };
	};
	return {
		tree,
		events,
		target,
		parent,
		node,
		window,
		owner,
		bindings,
		context,
		port,
		constructors,
		create,
		dispatch: (facade: unknown) => port.dispatch(node(target), facade),
		registered,
		retained,
		guestValues,
		release,
		setFactory(next: typeof hostObject) {
			factory = next;
		},
		setBindings(next: ScriptEventBindings | undefined) {
			supplied = next;
		},
	};
}

it("registers exactly one unretained dispatch identity during setup and publishes three references once", () => {
	const test = fixture(false);
	expect(test.registered.size).toBe(1);
	expect(test.retained.size).toBe(4);
	expect(test.owner.eventConstructorValue).toBeUndefined();
	expect(test.owner.dispatchEventValue).toBeUndefined();
	expect(() => test.create()).toThrow();
	test.port.publish(...test.constructors);
	expect(test.owner.eventConstructorValue).toBe(test.constructors[0]);
	expect(test.owner.customEventConstructorValue).toBe(test.constructors[1]);
	expect(test.owner.dispatchEventValue).toBe(test.constructors[2]);
	expect(() => test.owner.bootstrap()).toThrow();
	expect(() => test.port.publish(...test.constructors)).toThrow();
	expect(test.release).not.toHaveBeenCalledWith(test.constructors[0]);
	expect(test.registered.has(test.port.dispatch)).toBe(true);
	expect(test.retained.has(test.port.dispatch)).toBe(false);
	expect(test.retained.get(test.port.create)).toBe(4);
	expect(test.retained.get(test.port.publish)).toBe(0);
	expect(test.port.window()).toBe(test.window);
	expect(
		Object.getOwnPropertyDescriptor(test.port, "window")?.get,
	).toBeUndefined();
	expect(test.owner.metrics()).toMatchObject({
		constructorReferences: 2,
		dispatchReferences: 1,
	});
});

it("publishes and releases the document factory once without retaining its invocations", () => {
	const test = fixture();
	const factory = () => {};
	expect(test.owner.createEventValue).toBeUndefined();
	expect(test.retained.get(test.port.publishLegacy)).toBe(0);
	expect(test.retained.has(test.port.initialize)).toBe(false);
	test.port.publishLegacy(factory);
	expect(test.owner.createEventValue).toBe(factory);
	expect(test.owner.metrics().legacyFactoryReferences).toBe(1);
	expect(() => test.port.publishLegacy(factory)).toThrow();
	expect(test.release).not.toHaveBeenCalledWith(factory);
	test.owner.close();
	expect(test.owner.metrics().legacyFactoryReferences).toBe(0);
	expect(
		test.release.mock.calls.filter(([value]) => value === factory),
	).toHaveLength(1);
	expect(() => test.owner.createEventValue).toThrow();
});

it("validates the owning document and its publication guard before legacy creation", () => {
	const test = fixture();
	const document = test.node(test.tree.root);
	let active = true;
	test.owner.registerTarget(test.tree.root, document, () => {
		if (!active) throw new Error("Document revoked");
	});
	expect(test.port.validateDocument(document)).toBe(true);
	for (const invalid of [test.window, test.node(test.target), {}, null])
		expect(test.port.validateDocument(invalid)).toBe(false);
	active = false;
	expect(() => test.port.validateDocument(document)).toThrow(
		"Document revoked",
	);
});

it("releases rejected legacy factory and construction arguments", () => {
	const test = fixture();
	const factory = {};
	const extra = {};
	expect(() =>
		(test.port.publishLegacy as (...args: unknown[]) => void)(factory, extra),
	).toThrow();
	expect(test.release).toHaveBeenCalledWith(factory);
	expect(test.release).toHaveBeenCalledWith(extra);
	expect(test.owner.metrics().legacyFactoryReferences).toBe(0);
	const receiver = {};
	const extraReceiver = {};
	expect(() =>
		(test.port.createLegacy as (...args: unknown[]) => Facade)(
			receiver,
			extraReceiver,
		),
	).toThrow();
	expect(test.release).toHaveBeenCalledWith(receiver);
	expect(test.release).toHaveBeenCalledWith(extraReceiver);
	expect(test.owner.metrics().events).toBe(0);
});

it("keeps legacy events uninitialized until native initialization and permits reuse", async () => {
	const test = fixture();
	const receiver = {};
	const facade = test.port.createLegacy(receiver);
	const timestamp = (facade as Facade & { timeStamp: number }).timeStamp;
	expect(facade.type).toBe("");
	await expect(test.dispatch(facade)).rejects.toThrow();
	expect(test.port.initialize(facade, "legacy", true, true)).toBe(true);
	const listener = vi.fn(() => facade.preventDefault());
	test.bindings.add(test.target, "legacy", listener, false);
	expect(await test.dispatch(facade)).toBe(false);
	expect(listener).toHaveBeenCalledOnce();
	expect(listener.mock.calls[0]).toEqual([receiver]);
	expect(facade.target).toBe(test.node(test.target));
	expect(test.port.initialize(facade, "next", false, false)).toBe(true);
	expect(facade.target).toBeNull();
	expect(facade.defaultPrevented).toBe(false);
	expect((facade as Facade & { timeStamp: number }).timeStamp).toBe(timestamp);
	expect(await test.dispatch(facade)).toBe(true);
});

it("keeps primitive flags outside the retained suffix for ordinary and legacy construction", async () => {
	const test = fixture(true, true);
	const ordinary = test.create("ordinary");
	const legacy = test.port.createLegacy({});
	expect(test.retained.get(test.port.create)).toBe(4);
	expect(test.retained.get(test.port.createLegacy)).toBe(0);
	expect(ordinary.facade.type).toBe("ordinary");
	expect(legacy.type).toBe("");
	expect(
		[...test.guestValues.values()].some((value) => typeof value === "boolean"),
	).toBe(false);
	await expect(test.dispatch(legacy)).rejects.toThrow();
	expect(test.port.initialize(legacy, "legacy", false, false)).toBe(true);
	expect(await test.dispatch(legacy)).toBe(true);
});

it("ignores initialization during dispatch and rejects forged, invalid or closed initialization", async () => {
	const test = fixture();
	const { facade } = test.create();
	test.bindings.add(
		test.target,
		"sample",
		() => {
			expect(test.port.initialize(facade, "changed", false, false)).toBe(false);
			expect(facade.type).toBe("sample");
			facade.preventDefault();
		},
		false,
	);
	expect(await test.dispatch(facade)).toBe(false);
	for (const args of [
		[{}, "valid", false, false],
		[facade, "a".repeat(257), false, false],
		[facade, "valid", 1, false],
	] as const)
		expect(() =>
			test.port.initialize(args[0], args[1], args[2], args[3]),
		).toThrow();
	test.bindings.close();
	expect(() => test.port.initialize(facade, "valid", false, false)).toThrow();
});

it("uses the exact guest event identity without copying detail or recursing through guest getters", async () => {
	const test = fixture();
	const inspect = vi.fn(() => {
		throw new Error("Guest detail must not be inspected");
	});
	const receiver = Object.create(null, { detail: { get: inspect } });
	const { facade } = test.create("sample", undefined, receiver);
	Object.defineProperty(receiver, "type", { get: () => facade.type });
	const observed: unknown[] = [];
	test.bindings.add(
		test.target,
		"sample",
		(event: object) => {
			observed.push(event);
			expect((event as { type: string }).type).toBe("sample");
		},
		false,
	);
	expect(await test.dispatch(facade)).toBe(true);
	expect(observed).toEqual([receiver]);
	expect(inspect).not.toHaveBeenCalled();
	expect(facade.isTrusted).toBe(false);
	expect(facade.target).toBe(test.node(test.target));
	expect(facade.currentTarget).toBeNull();
	expect(facade.eventPhase).toBe(0);
	expect(facade.composedPath()).toEqual([]);
});

it("preserves capture, target, bubble, thisValue and cancellation", async () => {
	const test = fixture();
	const { receiver, facade } = test.create();
	const phases: string[] = [];
	test.bindings.add(
		test.parent,
		"sample",
		function (this: object, event: unknown) {
			expect(this).toBe(test.node(test.parent));
			expect(event).toBe(receiver);
			expect(facade.currentTarget).toBe(this);
			phases.push(`capture:${facade.eventPhase}`);
		},
		true,
	);
	test.bindings.add(
		test.target,
		"sample",
		() => {
			phases.push(`target:${facade.eventPhase}`);
			facade.preventDefault();
		},
		false,
	);
	test.bindings.add(
		test.parent,
		"sample",
		() => {
			phases.push(`bubble:${facade.eventPhase}`);
		},
		false,
	);
	expect(await test.dispatch(facade)).toBe(false);
	expect(phases).toEqual(["capture:1", "target:2", "bubble:3"]);
	expect(facade.defaultPrevented).toBe(true);
	expect(facade.returnValue).toBe(false);
});

it("preserves passive, once, stopImmediatePropagation and reuse semantics", async () => {
	const test = fixture();
	const { facade } = test.create();
	const observed: string[] = [];
	test.bindings.add(
		test.target,
		"sample",
		() => {
			facade.preventDefault();
			facade.stopImmediatePropagation();
			observed.push("once");
		},
		{ passive: true, once: true },
	);
	test.bindings.add(test.target, "sample", () => observed.push("next"), false);
	const dispatch = test.dispatch;
	expect(await dispatch(facade)).toBe(true);
	expect(observed).toEqual(["once"]);
	expect(await dispatch(facade)).toBe(true);
	expect(observed).toEqual(["once", "next"]);
});

it("keeps noncancelable defaults and stopPropagation behavior", async () => {
	const test = fixture();
	const { facade } = test.create("sample", {
		bubbles: true,
		cancelable: false,
		composed: true,
	});
	const parent = vi.fn();
	test.bindings.add(
		test.target,
		"sample",
		() => {
			facade.returnValue = false;
			facade.cancelBubble = true;
		},
		false,
	);
	test.bindings.add(test.parent, "sample", parent, false);
	expect(await test.dispatch(facade)).toBe(true);
	expect(parent).not.toHaveBeenCalled();
	expect(facade.defaultPrevented).toBe(false);
});

it("supports window dispatch and rejects recursive same-event dispatch without releasing its receiver", async () => {
	const test = fixture();
	const { receiver, facade } = test.create();
	const windowTarget = test.events.windowTarget;
	if (windowTarget === null) throw new Error("Missing window target");
	const dispatch = (facade: unknown) => test.port.dispatch(test.window, facade);
	let recursive: Promise<unknown> | undefined;
	test.bindings.add(
		windowTarget,
		"sample",
		() => {
			recursive = dispatch(facade).catch((error: unknown) => error);
			expect(facade.currentTarget).toBe(test.window);
		},
		{ once: true },
	);
	expect(await dispatch(facade)).toBe(true);
	expect(await recursive).toMatchObject({ code: "invalid-input" });
	expect(test.release).not.toHaveBeenCalledWith(receiver);
	expect(await dispatch(facade)).toBe(true);
});

it("reports listener failures while preserving following listeners", async () => {
	const test = fixture();
	const { facade } = test.create();
	const following = vi.fn();
	test.bindings.add(
		test.target,
		"sample",
		() => {
			throw new Error("synthetic callback failure");
		},
		false,
	);
	test.bindings.add(test.target, "sample", following, false);
	expect(await test.dispatch(facade)).toBe(true);
	expect(following).toHaveBeenCalledTimes(1);
	expect(test.events.metrics().retainedErrors).toBeGreaterThan(0);
});

it("aborts a pending listener prefix on close and releases each retained reference once", async () => {
	const test = fixture();
	const { receiver, facade } = test.create();
	const entered = deferred();
	const prefix = deferred();
	cleanup.push(prefix.resolve);
	test.bindings.add(
		test.target,
		"sample",
		() => {
			entered.resolve();
			return { synchronous: prefix.promise, result: prefix.promise };
		},
		false,
	);
	const following = vi.fn();
	test.bindings.add(test.parent, "sample", following, false);
	const pending = test.dispatch(facade).catch((error: unknown) => error);
	await entered.promise;
	expect(test.owner.metrics().pending).toBe(1);
	test.owner.close();
	test.owner.close();
	expect(await pending).toMatchObject({ code: "aborted" });
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
	expect(
		test.release.mock.calls.filter(([value]) => value === receiver),
	).toHaveLength(1);
	expect(test.release).toHaveBeenCalledWith(test.constructors[0]);
	expect(test.release).toHaveBeenCalledWith(test.constructors[1]);
	expect(test.release).toHaveBeenCalledWith(test.constructors[2]);
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		events: 0,
		bindings: 0,
		pending: 0,
		pendingReleases: 0,
		constructorReferences: 0,
		dispatchReferences: 0,
	});
	expect(() => facade.type).toThrow();
	expect(() => facade.preventDefault()).toThrow();
	expect(() => facade.composedPath()).toThrow();
	prefix.resolve();
	await Promise.resolve();
	expect(following).not.toHaveBeenCalled();
});

it("revokes facades when only the event owner closes and leaves ordinary bindings alive", () => {
	const test = fixture();
	const { facade } = test.create();
	test.owner.close();
	expect(test.bindings.metrics().closed).toBe(false);
	for (const key of [
		"type",
		"target",
		"currentTarget",
		"isTrusted",
		"defaultPrevented",
	] as const)
		expect(() => facade[key]).toThrow();
	expect(() => {
		facade.returnValue = false;
	}).toThrow();
	expect(() => test.owner.eventConstructorValue).toThrow();
	expect(() => test.owner.customEventConstructorValue).toThrow();
	expect(() => test.owner.dispatchEventValue).toThrow();
	expect(() => test.port.window()).toThrow();
});

it("rejects guest references, unknown and cross-owner target/event capabilities without retaining or releasing dispatch arguments", async () => {
	const first = fixture();
	const second = fixture();
	const { receiver, facade } = first.create();
	const foreign = second.create();
	for (const [target, event] of [
		[first.node(first.target), receiver],
		[first.node(first.target), {}],
		[first.node(first.target), foreign.facade],
		[second.node(second.target), facade],
		[{}, facade],
		[first.target, facade],
		[first.port, facade],
		[facade, facade],
	])
		await expect(first.port.dispatch(target, event)).rejects.toMatchObject({
			code: "invalid-input",
		});
	await expect(second.dispatch(facade)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(await first.dispatch(facade)).toBe(true);
	expect(first.release).not.toHaveBeenCalled();
	expect(second.release).not.toHaveBeenCalled();
	expect(first.retained.size).toBe(4);
});

it.each([
	[42, false, false, false],
	["type", 1, false, false],
	["type", false, {}, false],
	["type", false, false, []],
	["x".repeat(257), false, false, false],
])(
	"rejects invalid primitive constructor flags/type %# and releases the new receiver",
	(type, bubbles, cancelable, composed) => {
		const test = fixture();
		const receiver = {};
		expect(() =>
			test.port.create(type, bubbles, cancelable, composed, receiver),
		).toThrow();
		expect(test.release).toHaveBeenCalledWith(receiver);
		expect(test.owner.metrics().events).toBe(0);
	},
);

it("does not invoke arbitrary receiver/prototype/detail getters or iterators", async () => {
	const test = fixture();
	const inspect = vi.fn(() => {
		throw new Error("must not inspect guest data");
	});
	const receiver = new Proxy(
		{},
		{ get: inspect, ownKeys: inspect, getPrototypeOf: inspect },
	);
	const { facade } = test.create("sample", undefined, receiver);
	expect(await test.dispatch(facade)).toBe(true);
	expect(inspect).not.toHaveBeenCalled();
});

it("bounds constructed event storage and preserves existing refs after rejected duplicate creation", () => {
	const test = fixture();
	const first = test.create();
	expect(() => test.create("sample", undefined, first.receiver)).toThrow();
	expect(
		test.release.mock.calls.some(([value]) => value === first.receiver),
	).toBe(false);
	for (let index = 1; index < pageEventConstructorLimits.maxEvents; index++)
		test.create();
	const extra = {};
	expect(() => test.create("sample", undefined, extra)).toThrow("limit");
	expect(test.release).toHaveBeenCalledWith(extra);
	expect(test.owner.metrics().events).toBe(
		pageEventConstructorLimits.maxEvents,
	);
});

it("bounds native target capabilities without registering additional runtime operations", () => {
	const test = fixture();
	for (
		let index = test.owner.metrics().bindings;
		index < pageEventConstructorLimits.maxBindings;
		index++
	) {
		const target = test.tree.createElement("div");
		test.owner.registerTarget(target, test.node(target));
	}
	expect(() =>
		test.owner.registerTarget(test.tree.createElement("div"), {}),
	).toThrow("limit");
	expect(test.registered.size).toBe(1);
	expect(test.retained.size).toBe(4);
	expect(test.owner.metrics().bindings).toBe(
		pageEventConstructorLimits.maxBindings,
	);
});

it("bounds cumulative dispatch work while preserving the owned receiver", async () => {
	const test = fixture();
	const { receiver, facade } = test.create();
	const dispatch = test.dispatch;
	for (let count = 0; count < pageEventConstructorLimits.maxDispatches; count++)
		await dispatch(facade);
	await expect(dispatch(facade)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.release).not.toHaveBeenCalledWith(receiver);
	expect(test.owner.metrics().dispatches).toBe(
		pageEventConstructorLimits.maxDispatches,
	);
});

it("rejects invalid target IDs and duplicate, foreign or wrong-role capabilities", async () => {
	const test = fixture();
	const foreign = fixture();
	const { facade } = test.create();
	for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 9999999])
		expect(() => test.owner.registerTarget(value, {})).toThrow();
	expect(() => test.owner.registerTarget(test.target, {})).toThrow();
	const target = test.tree.createElement("div");
	for (const capability of [
		test.node(test.target),
		foreign.window,
		facade,
		test.port,
	])
		expect(() => test.owner.registerTarget(target, capability)).toThrow();
	await expect(
		test.port.dispatch(test.node(target), facade),
	).rejects.toMatchObject({
		code: "invalid-input",
	});
	test.owner.registerTarget(target, test.node(target));
	expect(await test.port.dispatch(test.node(target), facade)).toBe(true);
});

it("does not repopulate an owner closed during facade creation", async () => {
	const test = fixture();
	let leaked: Facade | undefined;
	test.setFactory((definition) => {
		test.owner.close();
		leaked = hostObject(definition) as Facade;
		return leaked;
	});
	const receiver = {};
	expect(() => test.create("sample", undefined, receiver)).toThrow();
	await Promise.resolve();
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		events: 0,
		bindings: 0,
	});
	expect(
		test.release.mock.calls.filter(([value]) => value === receiver),
	).toHaveLength(1);
	expect(() => leaked?.type).toThrow();
});

it("rejects reused facade identities and cleans only the new receiver", () => {
	const test = fixture();
	const first = test.create();
	test.setFactory(() => first.facade);
	const rejected = {};
	expect(() => test.create("sample", undefined, rejected)).toThrow();
	expect(test.release).toHaveBeenCalledWith(rejected);
	expect(
		test.release.mock.calls.some(([value]) => value === first.receiver),
	).toBe(false);
	expect(first.facade.type).toBe("sample");
});

it("reserves event capacity before reentrant host factory callbacks", () => {
	const test = fixture();
	for (let count = 0; count < pageEventConstructorLimits.maxEvents - 1; count++)
		test.create();
	test.setFactory((definition) => {
		expect(() => test.create()).toThrow("limit");
		return hostObject(definition);
	});
	test.create();
	expect(test.owner.metrics().events).toBe(
		pageEventConstructorLimits.maxEvents,
	);
});

it("releases receivers when bindings are missing and rejects dispatch with closed bindings", async () => {
	const test = fixture();
	test.setBindings(undefined);
	const rejected = {};
	expect(() => test.create("sample", undefined, rejected)).toThrow();
	expect(test.release).toHaveBeenCalledWith(rejected);
	test.setBindings(test.bindings);
	const { facade } = test.create();
	test.bindings.close();
	await expect(test.dispatch(facade)).rejects.toMatchObject({ code: "closed" });
});

it("clears ownership before reentrant release hooks and reports asynchronous release failure", async () => {
	const test = fixture();
	test.create();
	test.release.mockImplementation(() => {
		test.owner.close();
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			events: 0,
			bindings: 0,
		});
		expect(() =>
			test.owner.registerTarget(test.target, test.node(test.target)),
		).toThrow();
		return Promise.reject(new Error("release failure"));
	});
	test.owner.close();
	for (let turn = 0; turn < 6; turn++) await Promise.resolve();
	expect(test.owner.metrics()).toMatchObject({ events: 0, pendingReleases: 0 });
	expect(test.owner.metrics().cleanupFailures).toBeGreaterThan(0);
});

it("asserts exact document identity before binding and refuses a closed owner", () => {
	const test = fixture();
	const foreign = fixture();
	expect(() => test.owner.assertDocument(test.tree)).not.toThrow();
	expect(() => test.owner.assertDocument(foreign.tree)).toThrow(
		"another document",
	);
	test.owner.close();
	expect(() => test.owner.assertDocument(test.tree)).toThrow("closed");
});

it("closes constructed facades and releases receivers when the document closes", async () => {
	const test = fixture();
	const { receiver, facade } = test.create();
	test.tree.close();
	await Promise.resolve();
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		events: 0,
		bindings: 0,
	});
	expect(() => facade.type).toThrow();
	expect(() => test.owner.assertDocument(test.tree)).toThrow("closed");
	expect(
		test.release.mock.calls.filter(([value]) => value === receiver),
	).toHaveLength(1);
});

it("dispatches by facade with fresh opaque retained handles for the same guest receiver", async () => {
	const test = fixture(true, true);
	const receiver = {};
	const first = test.create("sample", undefined, receiver);
	const second = test.create("sample", undefined, receiver);
	const handles = [...test.guestValues]
		.filter(([, guest]) => guest === receiver)
		.map(([handle]) => handle);
	expect(handles).toHaveLength(2);
	expect(handles[0]).not.toBe(handles[1]);
	expect(first.facade).not.toBe(second.facade);
	const listener = vi.fn((event: unknown) => expect(event).toBe(receiver));
	test.bindings.add(test.target, "sample", listener, false);
	const references = test.guestValues.size;
	expect(await test.dispatch(first.facade)).toBe(true);
	expect(await test.dispatch(second.facade)).toBe(true);
	expect(await test.dispatch(first.facade)).toBe(true);
	expect(listener).toHaveBeenCalledTimes(3);
	expect(test.guestValues.size).toBe(references);
	for (const handle of handles)
		await expect(test.dispatch(handle)).rejects.toMatchObject({
			code: "invalid-input",
		});
	expect(test.release).not.toHaveBeenCalled();
	test.owner.close();
	await Promise.resolve();
	for (const handle of test.guestValues.keys())
		expect(
			test.release.mock.calls.filter(([value]) => value === handle),
		).toHaveLength(1);
	expect(test.owner.metrics()).toMatchObject({
		constructorReferences: 0,
		dispatchReferences: 0,
		pendingReleases: 0,
		events: 0,
	});
});

it("requires the third published reference and preserves owned publication references on failure", async () => {
	const test = fixture(false);
	const eventConstructor = {};
	const customConstructor = {};
	expect(() =>
		test.port.publish(eventConstructor, customConstructor, undefined),
	).toThrow();
	await Promise.resolve();
	expect(test.owner.metrics()).toMatchObject({
		constructorReferences: 0,
		dispatchReferences: 0,
		pendingReleases: 0,
	});
	for (const reference of [eventConstructor, customConstructor])
		expect(
			test.release.mock.calls.filter(([value]) => value === reference),
		).toHaveLength(1);
	test.port.publish(...test.constructors);
	const extra = {};
	expect(() =>
		test.port.publish(test.constructors[0], extra, test.constructors[2]),
	).toThrow();
	expect(
		test.release.mock.calls.some(
			([value]) =>
				value === test.constructors[0] || value === test.constructors[2],
		),
	).toBe(false);
	expect(
		test.release.mock.calls.filter(([value]) => value === extra),
	).toHaveLength(1);
	expect(test.owner.dispatchEventValue).toBe(test.constructors[2]);
});

it("returns Window only through an ordinary method and rejects unavailable or closed Window", () => {
	const test = fixture(true, false, false);
	expect(() => test.port.window()).toThrow("not registered");
	const target = test.events.windowTarget;
	if (target === null) throw new Error("Missing Window target");
	test.owner.registerTarget(target, test.window);
	expect(test.port.window()).toBe(test.window);
	expect(
		Object.getOwnPropertyDescriptor(test.port, "window")?.get,
	).toBeUndefined();
	test.owner.close();
	expect(() => test.port.window()).toThrow("closed");
});

it("stores publication guards without invoking them until dispatch and checks both dispatch boundaries", async () => {
	const test = fixture();
	const { facade } = test.create();
	const target = test.tree.createElement("div");
	const capability = test.node(target);
	let active = false;
	const guard = vi.fn(() => {
		if (!active) throw new Error("unpublished or invalidated");
	});
	test.owner.registerTarget(target, capability, guard);
	expect(guard).not.toHaveBeenCalled();
	const listener = vi.fn();
	test.bindings.add(target, "sample", listener, false);
	await expect(test.port.dispatch(capability, facade)).rejects.toThrow(
		"unpublished",
	);
	expect(listener).not.toHaveBeenCalled();
	active = true;
	expect(await test.port.dispatch(capability, facade)).toBe(true);
	expect(listener).toHaveBeenCalledOnce();
	expect(guard).toHaveBeenCalledTimes(3);
	active = false;
	await expect(test.port.dispatch(capability, facade)).rejects.toThrow(
		"invalidated",
	);
	expect(listener).toHaveBeenCalledOnce();
});

it("rejects publication invalidation during an awaited listener prefix", async () => {
	const test = fixture();
	const { facade } = test.create();
	const target = test.tree.createElement("div");
	const capability = test.node(target);
	let active = true;
	const guard = vi.fn(() => {
		if (!active) throw new Error("publication invalidated");
	});
	test.owner.registerTarget(target, capability, guard);
	const entered = deferred();
	const prefix = deferred();
	cleanup.push(prefix.resolve);
	test.bindings.add(
		target,
		"sample",
		() => {
			entered.resolve();
			return { synchronous: prefix.promise, result: prefix.promise };
		},
		false,
	);
	const pending = test.port
		.dispatch(capability, facade)
		.catch((error: unknown) => error);
	await entered.promise;
	active = false;
	prefix.resolve();
	expect(await pending).toMatchObject({ message: "publication invalidated" });
	expect(guard).toHaveBeenCalledTimes(2);
	expect(test.owner.metrics().pending).toBe(0);
});

it.each([1, 2])(
	"does not dispatch or return success when publication guard call %s closes the owner",
	async (closeAt) => {
		const test = fixture();
		const { facade, receiver } = test.create();
		const target = test.tree.createElement("div");
		const capability = test.node(target);
		let calls = 0;
		test.owner.registerTarget(target, capability, () => {
			if (++calls === closeAt) test.owner.close();
		});
		const listener = vi.fn();
		test.bindings.add(target, "sample", listener, false);
		await expect(test.port.dispatch(capability, facade)).rejects.toMatchObject({
			code: "closed",
		});
		expect(listener).toHaveBeenCalledTimes(closeAt - 1);
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			pending: 0,
			bindings: 0,
			events: 0,
		});
		expect(
			test.release.mock.calls.filter(([value]) => value === receiver),
		).toHaveLength(1);
	},
);

it("rejects wrong-role facade identities without leaking the new receiver", () => {
	const test = fixture();
	for (const capability of [test.window, test.node(test.target), test.port]) {
		const receiver = {};
		test.setFactory(() => capability);
		expect(() => test.create("sample", undefined, receiver)).toThrow();
		expect(
			test.release.mock.calls.filter(([value]) => value === receiver),
		).toHaveLength(1);
	}
	expect(test.owner.metrics().events).toBe(0);
});

it("rejects altered nested registration identity and revokes the captured dispatch operation", async () => {
	const tree = parseHtmlDocument("<main></main>", "https://events.example/");
	const events = new DocumentEvents(tree, {}, { window: true });
	cleanup.push(() => {
		events.close();
		tree.close();
	});
	let captured: Operation | undefined;
	const context: PageBindingContext = {
		createHostObject: hostObject,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference() {},
		nestedOperation(operation) {
			captured = operation;
			return ((...args: readonly unknown[]) =>
				operation(...args)) as typeof operation;
		},
	};
	expect(
		() => new PageEventConstructors(tree, context, events, () => undefined),
	).toThrow("identity");
	if (!captured) throw new Error("Missing captured dispatch");
	await expect(captured({}, {})).rejects.toMatchObject({ code: "closed" });
});
