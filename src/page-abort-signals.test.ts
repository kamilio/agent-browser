import { getEventListeners } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { PageAbortSignals } from "./page-abort-signals.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

interface Capability {
	readonly aborted: boolean;
	readonly reason: unknown;
	throwIfAborted(): void;
}

type Limits = { maxSignals?: number; maxSubscriptions?: number };
const owners: PageAbortSignals[] = [];
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
});

function nativeObject(definition: ScriptHostObjectDefinition): object {
	const capability = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(capability, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(capability, name, { value: method });
	return capability;
}

function fixture(limits?: Limits) {
	const tree = new DocumentTree("https://fixture.invalid/");
	trees.push(tree);
	const definitions: ScriptHostObjectDefinition[] = [];
	let provide = nativeObject;
	const factory: ScriptHostObjectFactory = {
		createHostObject(definition) {
			definitions.push(definition);
			return provide(definition);
		},
	};
	const owner = new PageAbortSignals(tree, factory, limits);
	owners.push(owner);
	return {
		owner,
		tree,
		definitions,
		provider(value: typeof provide) {
			provide = value;
		},
		publish(signal: AbortSignal) {
			return owner.publish(signal) as Capability;
		},
	};
}

function required<Value>(value: Value | undefined, name: string): Value {
	if (value === undefined) throw new Error(`Missing fixture ${name}`);
	return value;
}

function operations(definition: ScriptHostObjectDefinition | undefined) {
	const captured = required(definition, "host definition");
	const properties = required(captured.properties, "signal properties");
	const methods = required(captured.methods, "signal methods");
	const aborted = required(properties.aborted, "aborted property");
	const reason = required(properties.reason, "reason property");
	const throwIfAborted = required(
		methods.throwIfAborted,
		"throwIfAborted method",
	);
	if (
		typeof aborted.get !== "function" ||
		typeof reason.get !== "function" ||
		typeof throwIfAborted !== "function"
	)
		throw new Error("Missing fixture signal operation");
	return [() => aborted.get(), () => reason.get(), () => throwIfAborted()];
}

function expectClosed(operation: () => unknown) {
	expect(operation).toThrow(AgentBrowserError);
	expect(operation).toThrow(expect.objectContaining({ code: "closed" }));
}

function expectThrownReason(operation: () => unknown, reason: unknown) {
	let threw = false;
	try {
		operation();
	} catch (error) {
		threw = true;
		expect(error).toBe(reason);
	}
	expect(threw).toBe(true);
}

it("publishes readonly live state and reuses a same-owner native signal", () => {
	const test = fixture();
	const controller = new AbortController();
	const capability = test.publish(controller.signal);
	const resolved = test.owner.resolve(capability);
	expect(test.publish(controller.signal)).toBe(capability);
	expect(test.definitions).toHaveLength(1);
	expect(capability.aborted).toBe(false);
	expect(capability.reason).toBeUndefined();
	expect(resolved.aborted).toBe(false);
	expect(resolved.reason).toBeUndefined();
	expect(capability.throwIfAborted()).toBeUndefined();
	const definition = required(test.definitions[0], "host definition");
	const properties = required(definition.properties, "signal properties");
	for (const name of ["aborted", "reason"]) {
		expect(required(properties[name], `${name} property`).set).toBeUndefined();
		expect(Reflect.set(capability, name, "forged")).toBe(false);
		expect(Reflect.set(resolved, name, "forged")).toBe(false);
	}
	const reason = { source: "native fixture" };
	controller.abort(reason);
	expect(capability.aborted).toBe(true);
	expect(capability.reason).toBe(reason);
	expect(resolved.aborted).toBe(true);
	expect(resolved.reason).toBe(reason);
	expectThrownReason(() => capability.throwIfAborted(), reason);
	expect(test.owner.metrics()).toMatchObject({
		signals: 1,
		subscriptions: 0,
		created: 1,
		closed: false,
		partial: true,
	});
});

it("ignores native instance method overrides while preserving cancellation", () => {
	const test = fixture();
	const controller = new AbortController();
	let observations = 0;
	for (const name of [
		"throwIfAborted",
		"addEventListener",
		"removeEventListener",
	]) {
		Object.defineProperty(controller.signal, name, {
			get() {
				observations++;
				throw new Error("instance override must not run");
			},
		});
	}
	const capability = test.publish(controller.signal);
	const listener = vi.fn();
	test.owner.resolve(capability).subscribe(listener);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(capability.aborted).toBe(false);
	expect(capability.throwIfAborted()).toBeUndefined();
	controller.abort("intrinsic reason");
	expect(capability.reason).toBe("intrinsic reason");
	expectThrownReason(() => capability.throwIfAborted(), "intrinsic reason");
	expect(listener).toHaveBeenCalledExactlyOnceWith("intrinsic reason");
	expect(test.owner.metrics().subscriptions).toBe(0);
	test.owner.close();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(observations).toBe(0);
});

it.each([
	["aborted", "own", "accessor"],
	["aborted", "own", "data"],
	["aborted", "inherited", "accessor"],
	["aborted", "inherited", "data"],
	["reason", "own", "accessor"],
	["reason", "own", "data"],
	["reason", "inherited", "accessor"],
	["reason", "inherited", "data"],
] as const)(
	"rejects shadowed %s state in an %s %s descriptor before publication",
	(name, location, kind) => {
		const test = fixture({ maxSignals: 1 });
		const controller = new AbortController();
		let observations = 0;
		const observe = () => {
			observations++;
			throw new Error("untrusted source hook");
		};
		const target =
			location === "own"
				? controller.signal
				: Object.create(AbortSignal.prototype);
		Object.defineProperty(
			target,
			name,
			kind === "accessor"
				? { get: observe }
				: { value: name === "aborted" ? false : undefined },
		);
		if (location === "inherited")
			Object.setPrototypeOf(controller.signal, target);
		for (const method of [
			"throwIfAborted",
			"addEventListener",
			"removeEventListener",
		])
			Object.defineProperty(controller.signal, method, { get: observe });
		expect(() => test.publish(controller.signal)).toThrow(TypeError);
		expect(() => test.owner.resolve(controller.signal)).toThrow();
		expect(observations).toBe(0);
		expect(test.definitions).toHaveLength(0);
		expect(test.owner.metrics()).toMatchObject({
			signals: 0,
			subscriptions: 0,
			created: 0,
		});
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		expect(test.publish(new AbortController().signal).aborted).toBe(false);
	},
);

it("rejects a proxy prototype without invoking state getters or proxy traps", () => {
	const test = fixture();
	const controller = new AbortController();
	let observations = 0;
	const observe = () => {
		observations++;
		throw new Error("untrusted prototype hook");
	};
	const target = Object.create(AbortSignal.prototype);
	for (const name of ["aborted", "reason"])
		Object.defineProperty(target, name, { get: observe });
	const prototype = new Proxy(target, {
		get: observe,
		getPrototypeOf: observe,
		getOwnPropertyDescriptor: observe,
		ownKeys: observe,
	});
	Object.setPrototypeOf(controller.signal, prototype);
	expect(() => test.publish(controller.signal)).toThrow(TypeError);
	expect(observations).toBe(0);
	expect(test.definitions).toHaveLength(0);
	expect(test.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
		created: 0,
	});
});

it("rejects native state beyond the bounded prototype walk without publication", () => {
	const test = fixture();
	const controller = new AbortController();
	let prototype: object = AbortSignal.prototype;
	for (let depth = 0; depth < 64; depth++) prototype = Object.create(prototype);
	Object.setPrototypeOf(controller.signal, prototype);
	expect(() => test.publish(controller.signal)).toThrow(TypeError);
	expect(test.definitions).toHaveLength(0);
	expect(test.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
		created: 0,
	});
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("rejects unbranded native inputs and unowned capabilities without reading getters", () => {
	const test = fixture();
	let observations = 0;
	const lookalike = Object.create(null);
	for (const name of ["aborted", "reason", "subscribe", "addEventListener"])
		Object.defineProperty(lookalike, name, {
			get() {
				observations++;
				throw new Error("untrusted getter");
			},
		});
	const native = new AbortController().signal;
	const foreign = fixture().publish(native);
	for (const value of [
		null,
		undefined,
		false,
		1,
		"signal",
		{},
		lookalike,
		Object.create(AbortSignal.prototype),
		new Proxy(native, {}),
	]) {
		expect(() => test.owner.publish(value as AbortSignal)).toThrow();
	}
	for (const value of [
		null,
		undefined,
		false,
		1,
		"signal",
		{},
		lookalike,
		native,
		foreign,
		new Proxy(foreign, {}),
	]) {
		expect(() => test.owner.resolve(value)).toThrow();
	}
	expect(observations).toBe(0);
	expect(test.definitions).toHaveLength(0);
	expect(test.owner.metrics()).toMatchObject({ signals: 0, subscriptions: 0 });
});

it.each(["maxSignals", "maxSubscriptions"] as const)(
	"rejects invalid %s values without coercing them",
	(field) => {
		let coerced = false;
		const object = {
			valueOf() {
				coerced = true;
				return 1;
			},
		};
		for (const value of [
			0,
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER,
			field === "maxSignals" ? 257 : 1025,
			"1",
			null,
			true,
			object,
		]) {
			expect(() => fixture({ [field]: value } as Limits)).toThrow();
		}
		expect(coerced).toBe(false);
	},
);

it("rejects nonplain limits and accessor options without invoking accessors", () => {
	let observations = 0;
	for (const field of ["maxSignals", "maxSubscriptions"]) {
		const limits = Object.defineProperty({}, field, {
			get() {
				observations++;
				return 1;
			},
		});
		expect(() => fixture(limits)).toThrow();
	}
	for (const limits of [
		null,
		[],
		1,
		"limits",
		Object.create({ maxSignals: 1 }),
	])
		expect(() => fixture(limits as Limits)).toThrow();
	expect(observations).toBe(0);
});

it("enforces the default signal bound without charging repeat publications", () => {
	const test = fixture();
	const signals = Array.from(
		{ length: 256 },
		() => new AbortController().signal,
	);
	const capabilities = signals.map((signal) => test.publish(signal));
	expect(test.publish(signals[0])).toBe(capabilities[0]);
	expect(() => test.publish(new AbortController().signal)).toThrow();
	expect(test.definitions).toHaveLength(256);
	expect(test.owner.metrics()).toMatchObject({ signals: 256, created: 256 });
});

it("enforces the default subscription bound across signals and releases slots", () => {
	const test = fixture();
	const signals = Array.from({ length: 256 }, () =>
		test.owner.resolve(test.publish(new AbortController().signal)),
	);
	const unsubscribers = signals.flatMap((signal) =>
		Array.from({ length: 4 }, () => signal.subscribe(() => {})),
	);
	expect(test.owner.metrics().subscriptions).toBe(1024);
	expect(() => signals[0].subscribe(() => {})).toThrow();
	unsubscribers[0]();
	unsubscribers[0]();
	expect(test.owner.metrics().subscriptions).toBe(1023);
	const unsubscribe = signals[1].subscribe(() => {});
	expect(test.owner.metrics().subscriptions).toBe(1024);
	unsubscribe();
	for (const release of unsubscribers) release();
	expect(test.owner.metrics().subscriptions).toBe(0);
});

it("honors smaller owner-wide limits and cleans subscriptions after native abortion", () => {
	const test = fixture({ maxSignals: 2, maxSubscriptions: 1 });
	const first = new AbortController();
	const second = new AbortController();
	const firstSignal = test.owner.resolve(test.publish(first.signal));
	const secondSignal = test.owner.resolve(test.publish(second.signal));
	expect(() => test.publish(new AbortController().signal)).toThrow();
	const listener = vi.fn();
	const unsubscribe = firstSignal.subscribe(listener);
	expect(() => secondSignal.subscribe(listener)).toThrow();
	first.abort("first");
	expect(listener).toHaveBeenCalledExactlyOnceWith("first");
	expect(test.owner.metrics().subscriptions).toBe(0);
	unsubscribe();
	const release = secondSignal.subscribe(listener);
	expect(test.owner.metrics().subscriptions).toBe(1);
	release();
	release();
	second.abort("second");
	expect(listener).toHaveBeenCalledTimes(1);
	expect(test.owner.metrics().subscriptions).toBe(0);
});

it("delivers already-aborted signals synchronously without retaining subscriptions", () => {
	const test = fixture({ maxSubscriptions: 1 });
	const controller = new AbortController();
	controller.abort("already aborted");
	const capability = test.publish(controller.signal);
	const signal = test.owner.resolve(capability);
	const order: unknown[] = [];
	const unsubscribe = signal.subscribe((reason) => order.push(reason));
	order.push("returned");
	expect(order).toEqual(["already aborted", "returned"]);
	expect(capability.aborted).toBe(true);
	expectThrownReason(() => capability.throwIfAborted(), "already aborted");
	expect(test.owner.metrics().subscriptions).toBe(0);
	unsubscribe();
	unsubscribe();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("ignores fabricated abort events without losing the real once-only notification", () => {
	const test = fixture();
	const controller = new AbortController();
	const capability = test.publish(controller.signal);
	const listener = vi.fn();
	test.owner.resolve(capability).subscribe(listener);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	controller.signal.dispatchEvent(new Event("abort"));
	controller.signal.dispatchEvent(new Event("abort"));
	expect(listener).not.toHaveBeenCalled();
	expect(capability.aborted).toBe(false);
	expect(test.owner.metrics().subscriptions).toBe(1);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	controller.abort("real");
	controller.signal.dispatchEvent(new Event("abort"));
	controller.abort("ignored");
	expect(listener).toHaveBeenCalledExactlyOnceWith("real");
	expect(test.owner.metrics().subscriptions).toBe(0);
});

it.each(["before publication", "after subscription"] as const)(
	"cannot suppress registry cancellation with a source listener installed %s",
	(timing) => {
		const test = fixture();
		const controller = new AbortController();
		const blocker = vi.fn((event: Event) => event.stopImmediatePropagation());
		if (timing === "before publication")
			controller.signal.addEventListener("abort", blocker);
		const capability = test.publish(controller.signal);
		const signal = test.owner.resolve(capability);
		const listener = vi.fn();
		const unsubscribe = signal.subscribe(listener);
		if (timing === "after subscription")
			controller.signal.addEventListener("abort", blocker);
		const suppressed = vi.fn();
		controller.signal.addEventListener("abort", suppressed);
		expect(getEventListeners(controller.signal, "abort")).toEqual([
			blocker,
			suppressed,
		]);
		controller.signal.dispatchEvent(new Event("abort"));
		expect(blocker).toHaveBeenCalledTimes(1);
		expect(suppressed).not.toHaveBeenCalled();
		expect(listener).not.toHaveBeenCalled();
		expect(capability.aborted).toBe(false);
		expect(test.owner.metrics().subscriptions).toBe(1);
		const reason = { source: "propagation-blocked native abort" };
		controller.abort(reason);
		expect(blocker).toHaveBeenCalledTimes(2);
		expect(suppressed).not.toHaveBeenCalled();
		expect(listener).toHaveBeenCalledExactlyOnceWith(reason);
		expect(capability.aborted).toBe(true);
		expect(capability.reason).toBe(reason);
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toBe(reason);
		expectThrownReason(() => capability.throwIfAborted(), reason);
		expect(test.owner.metrics().subscriptions).toBe(0);
		unsubscribe();
		unsubscribe();
		test.owner.close();
		controller.signal.dispatchEvent(new Event("abort"));
		expect(listener).toHaveBeenCalledTimes(1);
		expect(suppressed).not.toHaveBeenCalled();
		expect(getEventListeners(controller.signal, "abort")).toEqual([
			blocker,
			suppressed,
		]);
		expect(test.owner.metrics()).toMatchObject({
			signals: 0,
			subscriptions: 0,
			closed: true,
		});
	},
);

it("isolates owners of the same native signal when one owner closes", () => {
	const first = fixture();
	const second = fixture();
	const controller = new AbortController();
	const firstCapability = first.publish(controller.signal);
	const secondCapability = second.publish(controller.signal);
	expect(firstCapability).not.toBe(secondCapability);
	expect(() => first.owner.resolve(secondCapability)).toThrow();
	expect(() => second.owner.resolve(firstCapability)).toThrow();
	const firstListener = vi.fn();
	const secondListener = vi.fn();
	first.owner.resolve(firstCapability).subscribe(firstListener);
	second.owner.resolve(secondCapability).subscribe(secondListener);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	first.owner.close();
	expect(firstListener).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ code: "closed" }),
	);
	expect(secondListener).not.toHaveBeenCalled();
	expect(controller.signal.aborted).toBe(false);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	controller.abort("shared source");
	expect(secondListener).toHaveBeenCalledExactlyOnceWith("shared source");
	expect(firstListener).toHaveBeenCalledTimes(1);
	expect(secondCapability.reason).toBe("shared source");
});

it("continues ordered notification and cleanup after a subscriber throws", () => {
	const test = fixture();
	const controller = new AbortController();
	const signal = test.owner.resolve(test.publish(controller.signal));
	const calls: string[] = [];
	signal.subscribe(() => {
		calls.push("first");
		throw new Error("subscriber failure");
	});
	signal.subscribe(() => calls.push("second"));
	controller.abort("reason");
	expect(calls).toEqual(["first", "second"]);
	expect(test.owner.metrics().subscriptions).toBe(0);
	test.owner.close();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("allows reentrant self-unsubscribe and synchronous late subscriptions", () => {
	const test = fixture();
	const controller = new AbortController();
	const signal = test.owner.resolve(test.publish(controller.signal));
	const calls: unknown[] = [];
	let unsubscribe = () => {};
	unsubscribe = signal.subscribe((reason) => {
		unsubscribe();
		unsubscribe();
		calls.push("first");
		signal.subscribe((lateReason) => calls.push(lateReason));
		calls.push(reason);
	});
	signal.subscribe(() => calls.push("second"));
	controller.abort("reason");
	expect(calls).toEqual(["first", "reason", "reason", "second"]);
	expect(test.owner.metrics().subscriptions).toBe(0);
});

it("cleans other signals when a native abort callback reenters owner close", () => {
	const test = fixture();
	const first = new AbortController();
	const second = new AbortController();
	const firstListener = vi.fn(() => test.owner.close());
	const secondListener = vi.fn();
	test.owner.resolve(test.publish(first.signal)).subscribe(firstListener);
	test.owner.resolve(test.publish(second.signal)).subscribe(secondListener);
	first.abort("first");
	expect(firstListener).toHaveBeenCalledExactlyOnceWith("first");
	expect(secondListener).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ code: "closed" }),
	);
	expect(test.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
		closed: true,
	});
	expect(getEventListeners(first.signal, "abort")).toHaveLength(0);
	expect(getEventListeners(second.signal, "abort")).toHaveLength(0);
	expect(second.signal.aborted).toBe(false);
});

it("honors reentrant unsubscribe before another subscriber's turn", () => {
	const test = fixture();
	const controller = new AbortController();
	const signal = test.owner.resolve(test.publish(controller.signal));
	const calls: string[] = [];
	let unsubscribe = () => {};
	signal.subscribe(() => {
		calls.push("first");
		unsubscribe();
		unsubscribe();
	});
	unsubscribe = signal.subscribe(() => calls.push("unsubscribed"));
	signal.subscribe(() => calls.push("last"));
	controller.abort("reason");
	expect(calls).toEqual(["first", "last"]);
	expect(test.owner.metrics().subscriptions).toBe(0);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("counts duplicate callback subscriptions independently and rejects nonfunctions", () => {
	const test = fixture();
	const controller = new AbortController();
	const signal = test.owner.resolve(test.publish(controller.signal));
	for (const listener of [undefined, null, {}, "listener", 1])
		expect(() => signal.subscribe(listener as () => void)).toThrow();
	expect(test.owner.metrics().subscriptions).toBe(0);
	const listener = vi.fn();
	const unsubscribe = signal.subscribe(listener);
	signal.subscribe(listener);
	expect(test.owner.metrics().subscriptions).toBe(2);
	unsubscribe();
	controller.abort("reason");
	expect(listener).toHaveBeenCalledExactlyOnceWith("reason");
	expect(test.owner.metrics().subscriptions).toBe(0);
});

it.each(["owner", "tree"] as const)(
	"revokes all operations and notifies pending consumers at %s close",
	(source) => {
		const test = fixture();
		const controller = new AbortController();
		const external = vi.fn();
		controller.signal.addEventListener("abort", external);
		const capability = test.publish(controller.signal);
		const signal = test.owner.resolve(capability);
		const reasons: unknown[] = [];
		const unsubscribe = signal.subscribe((reason) => {
			reasons.push(reason);
			test.owner.close();
			throw new Error("close subscriber failure");
		});
		signal.subscribe((reason) => reasons.push(reason));
		expect(getEventListeners(controller.signal, "abort")).toEqual([external]);
		test[source].close();
		test[source].close();
		expect(reasons).toHaveLength(2);
		for (const reason of reasons) {
			expect(reason).toBeInstanceOf(AgentBrowserError);
			expect(reason).toMatchObject({ code: "closed" });
		}
		for (const operation of [
			...operations(test.definitions[0]),
			() => capability.aborted,
			() => capability.reason,
			() => capability.throwIfAborted(),
			() => signal.aborted,
			() => signal.reason,
			() => signal.subscribe(() => {}),
			() => test.owner.resolve(capability),
			() => test.publish(controller.signal),
		])
			expectClosed(operation);
		unsubscribe();
		unsubscribe();
		const metrics = test.owner.metrics();
		expect(metrics).toMatchObject({
			signals: 0,
			subscriptions: 0,
			created: 1,
			closed: true,
			partial: true,
		});
		expect(getEventListeners(controller.signal, "abort")).toEqual([external]);
		expect(controller.signal.aborted).toBe(false);
		expect(controller.signal.reason).toBeUndefined();
		controller.abort("external still owns source");
		expect(external).toHaveBeenCalledTimes(1);
		expect(reasons).toHaveLength(2);
		expect(test.owner.metrics()).toEqual(metrics);
	},
);

it("revokes captured factory callbacks on failure and permits a clean retry", () => {
	const test = fixture({ maxSignals: 1 });
	const controller = new AbortController();
	test.provider(() => {
		throw new Error("factory failed");
	});
	expect(() => test.publish(controller.signal)).toThrow();
	const failed = test.definitions[0];
	for (const operation of operations(failed)) expect(operation).toThrow();
	expect(test.owner.metrics()).toMatchObject({ signals: 0, subscriptions: 0 });
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	test.provider(nativeObject);
	const capability = test.publish(controller.signal);
	expect(capability.aborted).toBe(false);
	for (const operation of operations(failed)) expect(operation).toThrow();
});

it("caps cumulative failed publications at 1024 even when live records are released", () => {
	const test = fixture({ maxSignals: 1, maxSubscriptions: 1 });
	const controller = new AbortController();
	test.provider(() => {
		throw new Error("factory failed");
	});
	for (let attempt = 0; attempt < 1024; attempt++) {
		expect(() => test.publish(controller.signal)).toThrow(AgentBrowserError);
		expect(test.definitions).toHaveLength(attempt + 1);
		expect(test.owner.metrics()).toMatchObject({
			signals: 0,
			subscriptions: 0,
			created: attempt + 1,
		});
	}
	for (const definition of test.definitions)
		for (const operation of operations(definition)) expect(operation).toThrow();
	test.provider(nativeObject);
	for (const source of [controller.signal, new AbortController().signal])
		expect(() => test.publish(source)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(test.definitions).toHaveLength(1024);
	expect(test.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
		created: 1024,
		closed: false,
	});
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	const metrics = test.owner.metrics();
	controller.abort("failed publications remain revoked");
	expect(test.owner.metrics()).toEqual(metrics);
	test.owner.close();
	expect(test.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
		created: 1024,
		closed: true,
	});
});

it("blocks pending callbacks and same-signal factory reentrancy", () => {
	const test = fixture({ maxSignals: 1 });
	const controller = new AbortController();
	test.provider((definition) => {
		for (const operation of operations(definition)) expect(operation).toThrow();
		expect(() => test.publish(controller.signal)).toThrow();
		expect(() => test.publish(new AbortController().signal)).toThrow();
		return nativeObject(definition);
	});
	const capability = test.publish(controller.signal);
	expect(test.definitions).toHaveLength(1);
	expect(test.publish(controller.signal)).toBe(capability);
	expect(capability.aborted).toBe(false);
	expect(test.owner.metrics()).toMatchObject({ signals: 1, created: 1 });
});

it.each(["owner", "tree"] as const)(
	"does not publish or retain resources when the factory closes the %s",
	(source) => {
		const test = fixture();
		const controller = new AbortController();
		let leaked: object | undefined;
		test.provider((definition) => {
			leaked = nativeObject(definition);
			test[source].close();
			return leaked;
		});
		expectClosed(() => test.publish(controller.signal));
		for (const operation of operations(test.definitions[0]))
			expect(operation).toThrow();
		expectClosed(() => test.owner.resolve(leaked));
		expect(test.owner.metrics()).toMatchObject({
			signals: 0,
			subscriptions: 0,
			closed: true,
		});
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		expect(controller.signal.aborted).toBe(false);
	},
);

it("rejects reused factory identities without publishing the second signal", () => {
	const test = fixture();
	const alias = {};
	const first = new AbortController();
	const second = new AbortController();
	test.provider(() => alias);
	expect(test.publish(first.signal)).toBe(alias);
	const original = test.owner.resolve(alias);
	expect(() => test.publish(second.signal)).toThrow();
	for (const operation of operations(test.definitions[1]))
		expect(operation).toThrow();
	expect(getEventListeners(second.signal, "abort")).toHaveLength(0);
	second.abort("unpublished");
	const resolved = test.owner.resolve(alias);
	expect(resolved).toBe(original);
	expect(resolved.aborted).toBe(false);
	expect(resolved.reason).toBeUndefined();
	test.owner.close();
	expect(getEventListeners(first.signal, "abort")).toHaveLength(0);
	expect(test.owner.metrics()).toMatchObject({ signals: 0, subscriptions: 0 });
});

it("rejects hostile factory results without invoking proxy traps", () => {
	const test = fixture({ maxSignals: 1 });
	const controller = new AbortController();
	let observations = 0;
	const observe = () => {
		observations++;
		throw new Error("factory result trap");
	};
	const hostile = new Proxy(
		{},
		{
			get: observe,
			getPrototypeOf: observe,
			ownKeys: observe,
			getOwnPropertyDescriptor: observe,
		},
	);
	for (const result of [null, undefined, false, 1, "capability", hostile]) {
		test.provider(() => result as object);
		expect(() => test.publish(controller.signal)).toThrow();
		expect(test.owner.metrics()).toMatchObject({
			signals: 0,
			subscriptions: 0,
		});
		for (const operation of operations(test.definitions.at(-1)))
			expect(operation).toThrow();
	}
	expect(observations).toBe(0);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	test.provider(nativeObject);
	expect(test.publish(controller.signal).aborted).toBe(false);
});

it("does not let a shared factory identity become owned by two registries", () => {
	const first = fixture();
	const second = fixture();
	const alias = {};
	const controller = new AbortController();
	first.provider(() => alias);
	second.provider(() => alias);
	first.publish(controller.signal);
	expect(() => second.publish(controller.signal)).toThrow();
	expect(() => second.owner.resolve(alias)).toThrow();
	for (const operation of operations(second.definitions[0]))
		expect(operation).toThrow();
	expect(second.owner.metrics()).toMatchObject({
		signals: 0,
		subscriptions: 0,
	});
});
