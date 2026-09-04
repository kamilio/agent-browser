import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import {
	ScriptMutationObservers,
	type ScriptMutationObserverLimits,
} from "./script-mutation-observers.js";
import { AgentBrowserError } from "./errors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	if (definition.indexed) {
		const indexed = definition.indexed;
		Object.defineProperty(result, "length", { get: () => indexed.length() });
		for (let index = 0; index < indexed.length(); index++)
			Object.defineProperty(result, index, { get: () => indexed.get(index) });
	}
	return result;
}

interface ObserverView {
	observe(target: unknown, options?: unknown): void;
	takeRecords(): readonly {
		type: string;
		target: object;
		oldValue: string | null;
	}[];
	disconnect(): void;
}

function fixture(
	startCallback: ScriptCallbackRuntime["startCallback"] = (
		callback,
		args,
		options,
	) => {
		let result: unknown;
		try {
			result = Reflect.apply(
				callback as (...args: unknown[]) => unknown,
				options.thisValue,
				args,
			);
		} catch (error) {
			return {
				synchronous: Promise.reject(error),
				result: Promise.reject(error),
			};
		}
		return { synchronous: Promise.resolve(), result: Promise.resolve(result) };
	},
) {
	const tree = new DocumentTree("https://fixture.invalid/");
	trees.push(tree);
	const parent = tree.createElement("main");
	tree.append(tree.root, parent);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	const runtime = { isClosed: () => false, startCallback };
	const bindings = dom.mutationObservers(runtime);
	return { tree, parent, dom, runtime, bindings };
}

it("delivers records only at an explicit checkpoint with the observer receiver", async () => {
	const { tree, parent, dom, bindings } = fixture();
	const calls: unknown[][] = [];
	const observer = bindings.create(function (
		this: unknown,
		...args: unknown[]
	) {
		calls.push([this, ...args]);
	}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "value");
	expect(calls).toEqual([]);
	expect(bindings.hasPending()).toBe(true);
	await bindings.checkpoint();
	expect(calls).toHaveLength(1);
	expect(calls[0][0]).toBe(observer);
	expect(calls[0][2]).toBe(observer);
	expect(calls[0][1]).toMatchObject([
		{ type: "attributes", target: dom.node(parent) },
	]);
});

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function customFixture(
	limits: Partial<ScriptMutationObserverLimits>,
	startCallback?: ScriptCallbackRuntime["startCallback"],
) {
	const test = fixture(startCallback);
	test.bindings.close();
	const bindings = new ScriptMutationObservers(
		test.tree,
		{ createHostObject: hostObject },
		{
			identify: (node) => {
				if (node !== test.dom.node(test.parent))
					throw new TypeError("Foreign node");
				return test.parent;
			},
			records: (records) => test.dom.mutationRecords(records),
		},
		test.runtime,
		limits,
	);
	return { ...test, bindings };
}

it("reuses the document's observer owner and rejects runtime replacement", () => {
	const { dom, bindings, runtime } = fixture();
	expect(dom.mutationObservers(runtime)).toBe(bindings);
	expect(() => dom.mutationObservers({ ...runtime })).toThrow(/replaced/);
});

it.each([null, undefined, {}, 1, "source"])(
	"rejects non-function observer callback %s",
	(value) => {
		const { bindings } = fixture();
		expect(() => bindings.create(value)).toThrow(TypeError);
		expect(bindings.metrics().observers).toBe(0);
	},
);

it("rejects forged and foreign document nodes before option access", () => {
	const { bindings } = fixture();
	const other = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	let getters = 0;
	const options = {
		get attributes() {
			getters++;
			return true;
		},
	};
	for (const target of [{}, 1, null, other.dom.node(other.parent)])
		expect(() => observer.observe(target, options)).toThrow(/node/);
	expect(getters).toBe(0);
});

it("converts native data flags and primitive attribute-filter members", () => {
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), {
		attributes: "yes",
		attributeOldValue: 1,
		attributeFilter: ["title", 1, null, true, 1n],
	});
	tree.setAttribute(parent, "title", "before");
	tree.setAttribute(parent, "title", "after");
	tree.setAttribute(parent, "id", "ignored");
	expect(observer.takeRecords().map((record) => record.oldValue)).toEqual([
		null,
		"before",
	]);
});

it("honors false old-value presence and copies the option filter", () => {
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	const filter = ["title"];
	observer.observe(dom.node(parent), {
		attributeOldValue: false,
		attributeFilter: filter,
	});
	filter[0] = "id";
	tree.setAttribute(parent, "title", "observed");
	expect(observer.takeRecords()).toHaveLength(1);
});

it.each([
	null,
	undefined,
	{},
	[],
	"options",
	{ attributes: false, attributeOldValue: true },
	{ attributeFilter: "id" },
])("rejects invalid options atomically: %j", (options) => {
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	expect(() => observer.observe(dom.node(parent), options)).toThrow(TypeError);
	tree.setAttribute(parent, "title", "still observed");
	expect(observer.takeRecords()).toHaveLength(1);
});

it("does not invoke option getters or object string coercion", () => {
	const { parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	let calls = 0;
	expect(() =>
		observer.observe(dom.node(parent), {
			get attributes() {
				calls++;
				return true;
			},
		}),
	).toThrow(/data properties/);
	expect(() =>
		observer.observe(dom.node(parent), {
			attributeFilter: [
				{
					toString() {
						calls++;
						return "id";
					},
				},
			],
		}),
	).toThrow(TypeError);
	const filter: unknown[] = [];
	Object.defineProperty(filter, "0", {
		get() {
			calls++;
			return "id";
		},
	});
	expect(() =>
		observer.observe(dom.node(parent), { attributeFilter: filter }),
	).toThrow(/data properties/);
	expect(calls).toBe(0);
});

it.each([{ filter: Array(129).fill("id") }, { filter: ["a".repeat(4097)] }])(
	"bounds filter conversion",
	({ filter }) => {
		const { parent, dom, bindings } = fixture();
		const observer = bindings.create(() => {}) as ObserverView;
		expect(() =>
			observer.observe(dom.node(parent), { attributeFilter: filter }),
		).toThrow(/limit/);
		expect(bindings.metrics().closed).toBe(false);
	},
);

it("waits for the actual first prefix before starting the next observer", async () => {
	const prefix = deferred();
	const entered = deferred();
	let calls = 0;
	const { tree, parent, dom, bindings } = fixture(() => {
		calls++;
		if (calls === 1) entered.resolve();
		return {
			synchronous: calls === 1 ? prefix.promise : Promise.resolve(),
			result: Promise.resolve(),
		};
	});
	for (let index = 0; index < 2; index++)
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
	tree.setAttribute(parent, "title", "queued");
	const delivery = bindings.checkpoint();
	await entered.promise;
	expect(calls).toBe(1);
	expect(bindings.metrics().pendingCallbacks).toBe(1);
	prefix.resolve();
	await delivery;
	expect(calls).toBe(2);
	expect(bindings.metrics().pendingCallbacks).toBe(0);
});

it("does not await a returned asynchronous tail before the next observer", async () => {
	const tail = deferred();
	let calls = 0;
	const { tree, parent, dom, bindings } = fixture(() => ({
		synchronous: Promise.resolve(),
		result: ++calls === 1 ? tail.promise : Promise.resolve(),
	}));
	for (let index = 0; index < 2; index++)
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(calls).toBe(2);
	expect(bindings.metrics().pendingCallbacks).toBe(1);
	tail.resolve();
	await tail.promise;
	expect(bindings.metrics().pendingCallbacks).toBe(0);
});

it("keeps unique admissions for callbacks sharing a returned Promise", async () => {
	const tail = deferred();
	const { tree, parent, dom, bindings } = fixture(() => ({
		synchronous: Promise.resolve(),
		result: tail.promise,
	}));
	for (let index = 0; index < 2; index++)
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(bindings.metrics().pendingCallbacks).toBe(2);
	tail.resolve();
	await tail.promise;
	expect(bindings.metrics().pendingCallbacks).toBe(0);
});

it("delivers callback mutations to later observers now and earlier observers next checkpoint", async () => {
	const { tree, parent, dom, bindings } = fixture();
	const batches: [string, number][] = [];
	let changed = false;
	const first = bindings.create((records: unknown[]) => {
		batches.push(["first", records.length]);
		if (!changed) {
			changed = true;
			tree.setAttribute(parent, "title", "during callback");
		}
	}) as ObserverView;
	const second = bindings.create((records: unknown[]) => {
		batches.push(["second", records.length]);
	}) as ObserverView;
	for (const observer of [first, second])
		observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "before callback");
	await bindings.checkpoint();
	expect(batches).toEqual([
		["first", 1],
		["second", 2],
	]);
	expect(bindings.hasPending()).toBe(true);
	await bindings.checkpoint();
	expect(batches).toEqual([
		["first", 1],
		["second", 2],
		["first", 1],
	]);
});

it("permits a callback to disconnect a later pending observer", async () => {
	const { tree, parent, dom, bindings } = fixture();
	const calls: string[] = [];
	const first = bindings.create(() => {
		calls.push("first");
		second.disconnect();
	}) as ObserverView;
	const second = bindings.create(() => {
		calls.push("second");
	}) as ObserverView;
	for (const observer of [first, second])
		observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(calls).toEqual(["first"]);
});

it("takeRecords drains without a callback and disconnect preserves delivered capabilities", async () => {
	let calls = 0;
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {
		calls++;
	}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "queued");
	const [record] = observer.takeRecords();
	observer.disconnect();
	await bindings.checkpoint();
	expect(calls).toBe(0);
	expect(record.target).toBe(dom.node(parent));
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "again");
	await bindings.checkpoint();
	expect(calls).toBe(1);
});

it("cleans detached-subtree transients before each callback", async () => {
	const { tree, parent, dom, bindings } = fixture();
	const child = tree.createElement("section");
	tree.append(parent, child);
	const lengths: number[] = [];
	const observer = bindings.create((records: unknown[]) => {
		lengths.push(records.length);
		tree.setAttribute(child, "title", "callback detached write");
	}) as ObserverView;
	observer.observe(dom.node(parent), {
		childList: true,
		attributes: true,
		subtree: true,
	});
	tree.remove(child);
	tree.setAttribute(child, "title", "observed detached write");
	await bindings.checkpoint();
	expect(lengths).toEqual([2]);
	expect(observer.takeRecords()).toEqual([]);
});

it("counts a failed invocation once even when both phases reject", async () => {
	let calls = 0;
	const { tree, parent, dom, bindings } = fixture(() => {
		calls++;
		return {
			synchronous: Promise.reject(new Error("prefix")),
			result: Promise.reject(new Error("tail")),
		};
	});
	for (let index = 0; index < 2; index++)
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(calls).toBe(2);
	expect(bindings.metrics()).toMatchObject({
		callbackFailures: 2,
		pendingCallbacks: 0,
		closed: false,
	});
});

it("continues after ordinary startup exceptions", async () => {
	let calls = 0;
	const { tree, parent, dom, bindings } = fixture(() => {
		if (++calls === 1) throw new Error("startup exception");
		return { synchronous: Promise.resolve(), result: Promise.resolve() };
	});
	for (let index = 0; index < 2; index++)
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(bindings.metrics()).toMatchObject({
		callbackFailures: 1,
		pendingCallbacks: 0,
		calls: 2,
		closed: false,
	});
});

it("surfaces runtime resource admission failure instead of dropping a delivery", async () => {
	const { tree, parent, dom, bindings } = fixture(() => {
		throw new AgentBrowserError("resource-limit", "runtime callback limit");
	});
	(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
		attributes: true,
	});
	tree.setAttribute(parent, "title", "queued");
	await expect(bindings.checkpoint()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(bindings.metrics().closed).toBe(true);
});

it.each(["synchronous", "result"] as const)(
	"rejects malformed %s phases without orphaned rejections",
	async (phase) => {
		const { tree, parent, dom, bindings } = fixture(
			() =>
				({
					synchronous:
						phase === "synchronous"
							? undefined
							: Promise.reject(new Error("prefix")),
					result:
						phase === "result" ? undefined : Promise.reject(new Error("tail")),
				}) as unknown as ReturnType<ScriptCallbackRuntime["startCallback"]>,
		);
		(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
			attributes: true,
		});
		tree.setAttribute(parent, "title", "queued");
		await expect(bindings.checkpoint()).rejects.toThrow(/completion phases/);
		expect(bindings.metrics()).toMatchObject({
			closed: true,
			pendingCallbacks: 0,
		});
	},
);

it("rejects overlapping checkpoints without revoking the active one", async () => {
	const prefix = deferred();
	const entered = deferred();
	const { tree, parent, dom, bindings } = fixture(() => {
		entered.resolve();
		return { synchronous: prefix.promise, result: Promise.resolve() };
	});
	(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
		attributes: true,
	});
	tree.setAttribute(parent, "title", "queued");
	const active = bindings.checkpoint();
	await entered.promise;
	await expect(bindings.checkpoint()).rejects.toThrow(/active/);
	expect(bindings.metrics().closed).toBe(false);
	prefix.resolve();
	await active;
});

it("reserves admission before a callback reenters the controller", async () => {
	const { tree, parent, dom, bindings } = fixture();
	let pending = 0;
	let nested: Promise<void> | undefined;
	const observer = bindings.create(() => {
		pending = bindings.metrics().pendingCallbacks;
		nested = bindings.checkpoint();
		void nested.catch(() => {});
	}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	expect(pending).toBe(1);
	await expect(nested).rejects.toThrow(/active/);
});

it("bounds callbacks with suspended tails across checkpoint turns", async () => {
	const tail = deferred();
	const { tree, parent, dom, bindings } = customFixture(
		{ maxPendingCallbacks: 1 },
		() => ({ synchronous: Promise.resolve(), result: tail.promise }),
	);
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "first");
	await bindings.checkpoint();
	tree.setAttribute(parent, "title", "second");
	await expect(bindings.checkpoint()).rejects.toThrow(/limit/);
	expect(bindings.metrics()).toMatchObject({
		closed: true,
		pendingCallbacks: 0,
		calls: 1,
	});
	tail.reject(new Error("late"));
	await tail.promise.catch(() => {});
	expect(bindings.metrics().callbackFailures).toBe(0);
});

it("bounds cumulative callback work even after admission slots settle", async () => {
	const { tree, parent, dom, bindings } = customFixture({ maxCallbacks: 1 });
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "first");
	await bindings.checkpoint();
	tree.setAttribute(parent, "title", "second");
	await expect(bindings.checkpoint()).rejects.toThrow(/limit/);
	expect(bindings.metrics().calls).toBe(1);
});

it("bounds observer lifetime even when every observer is disconnected", () => {
	const { bindings } = customFixture({ maxObservers: 1 });
	(bindings.create(() => {}) as ObserverView).disconnect();
	expect(() => bindings.create(() => {})).toThrow(/limit/);
	expect(bindings.metrics().closed).toBe(false);
});

it("surfaces native capture overflow at the next checked boundary", () => {
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	for (let index = 0; index < 1025; index++)
		tree.setAttribute(parent, "id", String(index));
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
	expect(() => bindings.hasPending()).toThrow(/limit/);
	expect(bindings.metrics().closed).toBe(true);
	expect(() => observer.takeRecords()).toThrow();
});

it.each(["document", "dom", "bindings"])(
	"interrupts an unfinished prefix on %s closure",
	async (source) => {
		const prefix = deferred();
		const tail = deferred();
		const entered = deferred();
		const { tree, parent, dom, bindings } = fixture(() => {
			entered.resolve();
			return { synchronous: prefix.promise, result: tail.promise };
		});
		const observer = bindings.create(() => {}) as ObserverView;
		observer.observe(dom.node(parent), { attributes: true });
		tree.setAttribute(parent, "title", "queued");
		const active = bindings.checkpoint();
		const rejected = expect(active).rejects.toThrow();
		await entered.promise;
		if (source === "document") tree.close();
		else if (source === "dom") dom.close();
		else bindings.close();
		await rejected;
		expect(() => observer.disconnect()).toThrow();
		expect(bindings.metrics()).toMatchObject({
			closed: true,
			pendingCallbacks: 0,
			observers: 0,
			running: false,
		});
		prefix.reject(new Error("late prefix"));
		tail.reject(new Error("late tail"));
		await Promise.allSettled([prefix.promise, tail.promise]);
		expect(bindings.metrics().callbackFailures).toBe(0);
	},
);

it("revokes operations when the runtime is already closed", async () => {
	const { bindings, runtime } = fixture();
	runtime.isClosed = () => true;
	await expect(bindings.checkpoint()).rejects.toThrow(/closed/);
	expect(bindings.metrics().closed).toBe(true);
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid callback limits %s",
	(maxCallbacks) => {
		expect(() => customFixture({ maxCallbacks })).toThrow(/Invalid/);
	},
);

it("observes an already rejected result before rejecting a throwing prefix getter", async () => {
	const { tree, parent, dom, bindings } = fixture(() => ({
		result: Promise.reject(new Error("tail already rejected")),
		get synchronous(): Promise<void> {
			throw new Error("prefix getter failed");
		},
	}));
	(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
		attributes: true,
	});
	tree.setAttribute(parent, "title", "queued");
	await expect(bindings.checkpoint()).rejects.toThrow("prefix getter failed");
	expect(bindings.metrics()).toMatchObject({
		closed: true,
		pendingCallbacks: 0,
	});
});

it("counts late tail rejection without retaining the payload or stopping healthy observers", async () => {
	const tail = deferred();
	const { tree, parent, dom, bindings } = fixture(() => ({
		synchronous: Promise.resolve(),
		result: tail.promise,
	}));
	(bindings.create(() => {}) as ObserverView).observe(dom.node(parent), {
		attributes: true,
	});
	tree.setAttribute(parent, "title", "queued");
	await bindings.checkpoint();
	tail.reject(new Error("private callback payload"));
	await tail.promise.catch(() => {});
	expect(bindings.metrics()).toMatchObject({
		closed: false,
		pendingCallbacks: 0,
		callbackFailures: 1,
	});
	expect(JSON.stringify(bindings.metrics())).not.toContain("private");
});

it("releases failed observer construction admission and leaves existing handles usable", () => {
	const { tree, parent, dom, runtime } = fixture();
	let fail = true;
	const bindings = new ScriptMutationObservers(
		tree,
		{
			createHostObject: (definition) => {
				if (fail) throw new Error("factory rejected");
				return hostObject(definition);
			},
		},
		{
			identify: () => parent,
			records: (records) => dom.mutationRecords(records),
		},
		runtime,
		{ maxObservers: 1 },
	);
	expect(() => bindings.create(() => {})).toThrow("factory rejected");
	expect(bindings.metrics().observers).toBe(0);
	fail = false;
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	expect(bindings.metrics().observers).toBe(1);
});

it("reserves observer capacity before calling a reentrant host-object provider", () => {
	const { tree, parent, dom, runtime } = fixture();
	const bindings = new ScriptMutationObservers(
		tree,
		{
			createHostObject: (definition) => {
				expect(() => bindings.create(() => {})).toThrow(/limit/);
				return hostObject(definition);
			},
		},
		{
			identify: () => parent,
			records: (records) => dom.mutationRecords(records),
		},
		runtime,
		{ maxObservers: 1 },
	);
	expect(bindings.create(() => {})).toBeTruthy();
	expect(bindings.metrics().observers).toBe(1);
});

it("does not publish an observer after reentrant document closure", () => {
	const { tree, parent, dom, runtime } = fixture();
	const bindings = new ScriptMutationObservers(
		tree,
		{
			createHostObject: (definition) => {
				tree.close();
				return hostObject(definition);
			},
		},
		{
			identify: () => parent,
			records: (records) => dom.mutationRecords(records),
		},
		runtime,
	);
	expect(() => bindings.create(() => {})).toThrow();
	expect(bindings.metrics()).toMatchObject({ closed: true, observers: 0 });
});

it("rejects reused observer capability identities without corrupting the original", () => {
	const { tree, parent, dom, runtime } = fixture();
	let shared: object | undefined;
	const bindings = new ScriptMutationObservers(
		tree,
		{
			createHostObject: (definition) => {
				shared ??= hostObject(definition);
				return shared;
			},
		},
		{
			identify: () => parent,
			records: (records) => dom.mutationRecords(records),
		},
		runtime,
	);
	const observer = bindings.create(() => {}) as ObserverView;
	expect(() => bindings.create(() => {})).toThrow(
		/Invalid observer capability/,
	);
	observer.observe(dom.node(parent), { attributes: true });
	tree.setAttribute(parent, "title", "queued");
	expect(observer.takeRecords()).toHaveLength(1);
	expect(bindings.metrics()).toMatchObject({ observers: 1, closed: false });
});

it.each(["takeRecords", "checkpoint"])(
	"revokes the controller after record materialization fails during %s",
	async (operation) => {
		const { tree, parent, dom, runtime } = fixture();
		const bindings = new ScriptMutationObservers(
			tree,
			{ createHostObject: hostObject },
			{
				identify: () => parent,
				records: () => {
					throw new AgentBrowserError(
						"resource-limit",
						"delivered-record limit",
					);
				},
			},
			runtime,
		);
		const observer = bindings.create(() => {}) as ObserverView;
		observer.observe(dom.node(parent), { attributes: true });
		tree.setAttribute(parent, "title", "queued");
		if (operation === "takeRecords")
			expect(() => observer.takeRecords()).toThrow(/limit/);
		else await expect(bindings.checkpoint()).rejects.toThrow(/limit/);
		expect(bindings.metrics()).toMatchObject({
			closed: true,
			observers: 0,
			pendingCallbacks: 0,
		});
		expect(() => bindings.hasPending()).toThrow();
	},
);

it.each(["sparse", "wrong length", "primitive"])(
	"rejects a %s materialized record array",
	(kind) => {
		const { tree, parent, dom, runtime } = fixture();
		const bindings = new ScriptMutationObservers(
			tree,
			{ createHostObject: hostObject },
			{
				identify: () => parent,
				records: () =>
					kind === "sparse"
						? Array(1)
						: kind === "wrong length"
							? []
							: ([123] as unknown as object[]),
			},
			runtime,
		);
		const observer = bindings.create(() => {}) as ObserverView;
		observer.observe(dom.node(parent), { attributes: true });
		tree.setAttribute(parent, "title", "queued");
		expect(() => observer.takeRecords()).toThrow(/Invalid observer record/);
		expect(bindings.metrics().closed).toBe(true);
	},
);

it("does not accumulate admission across repeated settled callback turns", async () => {
	const { tree, parent, dom, bindings } = fixture();
	const observer = bindings.create(() => {}) as ObserverView;
	observer.observe(dom.node(parent), { attributes: true });
	for (let index = 0; index < 250; index++) {
		tree.setAttribute(parent, "id", String(index));
		await bindings.checkpoint();
		expect(bindings.metrics().pendingCallbacks).toBe(0);
	}
	expect(bindings.metrics()).toMatchObject({
		calls: 250,
		callbackFailures: 0,
		closed: false,
	});
});
