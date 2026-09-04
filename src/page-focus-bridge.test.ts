import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import { extensionPageRuntime } from "./extension-page-runtime.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { PageFocus, type PageFocusOperation } from "./page-focus.js";
import type { PageRuntime } from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
	ReleasedInvocation,
} from "./safejs-extension-types.js";
import { scriptLimits } from "./safejs.js";
import { ScriptDom } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function publishedMethods(
	definitions: Map<object, ReleasedHostDefinition>,
	object: object,
) {
	const methods = definitions.get(object)?.methods;
	if (!methods) throw new Error("Missing published methods");
	return methods;
}

function publicCoreFixture() {
	const registered = new Set<PageFocusOperation>();
	const definitions = new Map<object, ReleasedHostDefinition>();
	const phases = new AsyncLocalStorage<{ active: boolean }>();
	let setup = false;
	let extension!: Parameters<ReleasedCore["defineExtension"]>[0];
	let context!: ReleasedContext;
	let realmOptions!: Parameters<ReleasedCore["createRealm"]>[0];
	let beforePublish: ((definition: ReleasedHostDefinition) => void) | undefined;
	const evaluateNested = vi.fn(async () => {
		throw new Error("Nested source is not permitted in this fixture");
	});
	const startCallback = vi.fn<ReleasedContext["startCallback"]>(
		(callback, options) => {
			if (!phases.getStore()?.active)
				throw new Error("Callback outside active host phase");
			try {
				const result = Reflect.apply(
					callback as (...args: unknown[]) => unknown,
					options?.thisValue,
					options?.args ?? [],
				);
				if (
					result &&
					typeof result === "object" &&
					"synchronous" in result &&
					"result" in result
				)
					return result as ReleasedInvocation;
				return {
					synchronous: Promise.resolve(),
					result: Promise.resolve(result),
				};
			} catch (error) {
				const rejected = Promise.reject(error);
				void rejected.catch(() => undefined);
				return { synchronous: rejected, result: rejected };
			}
		},
	);
	const core: ReleasedCore = {
		Budget: class {
			stepsUsed = 0;
			peakCallDepth = 0;
			peakDataSize = 0;
		},
		defineExtension(definition) {
			extension = definition;
			return definition;
		},
		createRealm(options) {
			realmOptions = options;
			const controller = new AbortController();
			const cleanups: (() => void | Promise<void>)[] = [];
			let globals: Record<string, unknown> | undefined;
			context = {
				signal: controller.signal,
				onCleanup: (operation) => {
					cleanups.push(operation);
				},
				createHostObject(definition) {
					beforePublish?.(definition);
					const object = Object.create(null);
					for (const [name, property] of Object.entries(
						definition.properties ?? {},
					))
						Object.defineProperty(object, name, property);
					for (const [name, operation] of Object.entries(
						definition.methods ?? {},
					))
						Object.defineProperty(object, name, { value: operation });
					definitions.set(object, definition);
					return object;
				},
				startCallback,
				releaseCallback() {},
				retainGuestArguments(operation) {
					if (!setup) throw new Error("Late retained declaration");
					return operation;
				},
				releaseGuestReference() {},
				nestedOperation(operation) {
					if (!setup) throw new Error("Late nested declaration");
					if (
						!extension.manifest.capabilities?.includes("source:nested") ||
						!options.grants?.includes("source:nested")
					)
						throw new Error("Missing source:nested authority");
					registered.add(operation);
					return operation;
				},
				evaluateNested,
			};
			return {
				async evaluate(source) {
					if (!globals) {
						setup = true;
						try {
							globals = extension.setup(context).globals;
						} finally {
							setup = false;
						}
					}
					if (source !== "")
						throw new Error(
							"This native fixture does not execute guest source",
						);
					return { ok: true };
				},
				startCallback,
				releaseCallback() {},
				async close() {
					if (controller.signal.aborted) return;
					controller.abort();
					for (const operation of cleanups.splice(0)) await operation();
				},
			};
		},
	};
	async function invoke(
		object: object,
		name: string,
		...args: unknown[]
	): Promise<{ kind: "value" | "promise"; value: unknown }> {
		const operation = definitions.get(object)?.methods?.[name];
		if (!operation) throw new Error(`Missing published method ${name}`);
		const phase = { active: true };
		return phases.run(phase, async () => {
			let result: unknown;
			try {
				result = operation(...args);
			} catch (error) {
				phase.active = false;
				throw error;
			}
			if (result instanceof Promise) {
				const settled = result.finally(() => {
					phase.active = false;
				});
				void settled.catch(() => undefined);
				return registered.has(operation)
					? { kind: "value", value: await settled }
					: { kind: "promise", value: settled };
			}
			phase.active = false;
			return { kind: "value", value: result };
		});
	}
	return {
		core,
		registered,
		definitions,
		invoke,
		evaluateNested,
		startCallback,
		get context() {
			return context;
		},
		get extension() {
			return extension;
		},
		get realmOptions() {
			return realmOptions;
		},
		onPublish(callback: typeof beforePublish) {
			beforePublish = callback;
		},
	};
}

async function fixture(maxBindings = 32) {
	const provider = publicCoreFixture();
	const document = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0}main{width:400px;height:700px}#before{height:200px}#target{display:block;width:20px;height:20px;margin-left:180px}</style><main><input id="first"><div id="before"></div><input id="target"><input id="last"></main>',
		"https://fixture.invalid/focus-bridge",
	);
	documentStyles(document).setViewport(100, 80);
	const interactions = documentInteractions(document);
	const queries = new DocumentQueries(document);
	const lifetime = new AbortController();
	let bindings!: PageBindings;
	let bindingContext!: PageBindingContext;
	const runtime: PageRuntime = extensionPageRuntime(
		provider.core,
	).createPageRuntime({
		limits: scriptLimits(),
		signal: lifetime.signal,
		globals: pageBindingGlobalNames(document),
		onClosed: () => bindings?.close(),
		setup(context) {
			bindingContext = context;
			bindings = new PageBindings(
				{ document, interactions },
				context,
				{
					isClosed: () => runtime.closed,
					startCallback: (callback, args, receiver) =>
						runtime.startCallback(callback, args, receiver),
					fail: vi.fn(),
					onConsoleCall() {},
				},
				{ focusLimits: { maxBindings } },
			);
			return bindings.globals;
		},
		sink: { log() {}, error() {} },
	});
	cleanup.push(async () => {
		bindings?.close();
		await runtime.close();
		document.close();
	});
	await runtime.initialize();
	const id = (selector: string) => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const element = (selector: string) => bindings.dom.node(id(selector));
	const call = (object: object, name: string, ...args: unknown[]) =>
		publishedMethods(provider.definitions, object)[name](...args);
	const listen = (
		object: object,
		type: string,
		callback: (...args: unknown[]) => unknown,
	) => call(object, "addEventListener", type, callback);
	return {
		provider,
		document,
		interactions,
		bindings,
		runtime,
		bindingContext,
		lifetime,
		id,
		element,
		call,
		listen,
		invoke: provider.invoke,
		scroll: documentScroll(document),
	};
}

describe("native public-contract focus bridge, not SafeJS execution", () => {
	it("preserves fixed target geometry and root scroll through published focus and blur", async () => {
		const test = await fixture();
		const target = test.element("#target");
		test.call(
			target,
			"setAttribute",
			"style",
			"position:fixed;left:12px;top:18px;margin-left:0",
		);
		test.scroll.to(100, 300);
		const before = documentGeometry(test.document).getBoundingClientRect(
			test.id("#target"),
		);
		const seen: string[] = [];
		for (const type of ["focus", "focusin", "blur", "focusout"])
			test.listen(target, type, () => {
				seen.push(type);
			});
		expect(await test.invoke(target, "focus", { focusVisible: true })).toEqual({
			kind: "value",
			value: undefined,
		});
		expect(test.document.activeElement).toBe(test.id("#target"));
		expect(test.document.focusIndicated).toBe(true);
		expect(await test.invoke(target, "blur")).toEqual({
			kind: "value",
			value: undefined,
		});
		expect(seen).toEqual(["focus", "focusin", "blur", "focusout"]);
		expect(test.scroll.get()).toEqual({ x: 100, y: 300 });
		expect(
			documentGeometry(test.document).getBoundingClientRect(test.id("#target")),
		).toEqual(before);
	});
	it("registers final published identities during setup, including lazily created elements", async () => {
		const test = await fixture();
		expect(test.provider.registered.size).toBe(64);
		expect(test.provider.extension.manifest.capabilities).toEqual([
			"guest:retain",
			"source:nested",
		]);
		expect(test.provider.realmOptions.grants).toEqual([
			"guest:retain",
			"source:nested",
		]);
		const first = test.element("#first");
		const created = test.call(
			test.bindings.dom.document,
			"createElement",
			"input",
		) as object;
		test.call(test.element("main"), "appendChild", created);
		for (const object of [first, created]) {
			const methods = publishedMethods(test.provider.definitions, object);
			expect(test.provider.registered.has(methods.focus)).toBe(true);
			expect(test.provider.registered.has(methods.blur)).toBe(true);
			expect(test.provider.registered.has(methods.setAttribute)).toBe(false);
		}
		expect(publishedMethods(test.provider.definitions, first).focus).not.toBe(
			publishedMethods(test.provider.definitions, created).focus,
		);
		expect(test.element("#first")).toBe(first);
		expect(test.provider.registered.size).toBe(64);
		expect(() =>
			test.bindingContext.nestedOperation?.(() => undefined),
		).toThrow(/setup-time/);
		expect(test.bindingContext).not.toHaveProperty("evaluateNested");
		expect(test.bindings.globals).not.toHaveProperty("nestedOperation");
		expect(test.bindings.window).not.toHaveProperty("evaluateNested");
		expect(test.provider.evaluateNested).not.toHaveBeenCalled();
		expect(
			await test.invoke(created, "focus", { preventScroll: true }),
		).toEqual({ kind: "value", value: undefined });
	});

	it("returns undefined after listener prefixes, without awaiting listener tails", async () => {
		const test = await fixture();
		const target = test.element("#target");
		const prefix = deferred();
		const tail = deferred();
		const seen: string[] = [];
		test.listen(target, "focus", function (this: unknown) {
			expect(this).toBe(target);
			seen.push("focus");
			return {
				synchronous: prefix.promise.then(() => {
					seen.push("prefix");
				}),
				result: tail.promise.then(() => {
					seen.push("tail");
				}),
			};
		});
		test.listen(target, "focusin", () => {
			seen.push("focusin");
		});
		const pending = test
			.invoke(target, "focus", { preventScroll: true })
			.then((result) => {
				seen.push("returned");
				return result;
			});
		expect(seen).toEqual(["focus"]);
		expect(test.document.activeElement).toBe(test.id("#target"));
		prefix.resolve();
		expect(await pending).toEqual({ kind: "value", value: undefined });
		expect(seen).toEqual(["focus", "prefix", "focusin", "returned"]);
		tail.resolve();
		await tail.promise;
		expect(seen.at(-1)).toBe("tail");
	});

	it("allows nested focus from a controlled listener in the active host phase", async () => {
		const test = await fixture();
		const first = test.element("#first");
		const last = test.element("#last");
		const tail = deferred();
		const seen: string[] = [];
		test.listen(last, "focus", () => {
			seen.push("inner");
		});
		test.listen(first, "focus", () => {
			seen.push("outer");
			const synchronous = test
				.invoke(last, "focus", { preventScroll: true })
				.then((result) => {
					expect(result).toEqual({ kind: "value", value: undefined });
					seen.push("inner-returned");
				});
			return { synchronous, result: tail.promise };
		});
		await test.invoke(first, "focus");
		seen.push("returned");
		expect(seen).toEqual(["outer", "inner", "inner-returned", "returned"]);
		expect(test.document.activeElement).toBe(test.id("#last"));
		expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
		tail.resolve();
	});

	it("preserves same-target reentry and its final focus options", async () => {
		const test = await fixture();
		const target = test.element("#target");
		let calls = 0;
		test.listen(target, "focus", () => {
			calls++;
			const synchronous = test
				.invoke(target, "focus", { preventScroll: true, focusVisible: true })
				.then(() => undefined);
			return { synchronous, result: synchronous };
		});
		await test.invoke(target, "focus", { focusVisible: false });
		expect(calls).toBe(1);
		expect(test.document.focusIndicated).toBe(true);
		expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
	});

	it("reports thrown callbacks but completes focus and ordered blur prefixes", async () => {
		const test = await fixture();
		const target = test.element("#target");
		test.listen(target, "focus", () => {
			throw new Error("listener failure");
		});
		expect(await test.invoke(target, "focus", { preventScroll: true })).toEqual(
			{ kind: "value", value: undefined },
		);
		expect(test.interactions.events.drainErrors()).toMatchObject([
			{ type: "focus", message: "listener failure" },
		]);
		const seen: string[] = [];
		test.listen(target, "blur", () => {
			seen.push("blur");
		});
		test.listen(target, "focusout", () => {
			seen.push("focusout");
		});
		await test.invoke(target, "blur");
		seen.push("returned");
		expect(seen).toEqual(["blur", "focusout", "returned"]);
		expect(test.interactions.focus.active()).toBeNull();
	});

	it("keeps focusVisible, preventScroll, and invalid option semantics", async () => {
		const test = await fixture();
		expect(buildFormattingTree(test.document).issues).toEqual({});
		const target = test.element("#target");
		await test.invoke(target, "focus", {
			preventScroll: true,
			focusVisible: false,
		});
		expect(test.document.focusIndicated).toBe(false);
		expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
		await test.invoke(target, "focus", { focusVisible: true });
		expect(test.document.focusIndicated).toBe(true);
		expect(test.scroll.get().y).toBeGreaterThan(0);
		let reads = 0;
		await expect(
			test.invoke(target, "focus", {
				get preventScroll() {
					reads++;
					return false;
				},
			}),
		).rejects.toThrow(/accessors/);
		expect(reads).toBe(0);
		await expect(test.invoke(target, "focus", 1)).rejects.toThrow(TypeError);
	});

	it("leaves ordinary Promise-returning published methods as guest Promises", async () => {
		const test = await fixture();
		const image = test.call(
			test.bindings.dom.document,
			"createElement",
			"img",
		) as object;
		const method = publishedMethods(test.provider.definitions, image).decode;
		expect(test.provider.registered.has(method)).toBe(false);
		const result = await test.invoke(image, "decode");
		expect(result.kind).toBe("promise");
		expect(result.value).toBeInstanceOf(Promise);
		await (result.value as Promise<unknown>).catch(() => undefined);
		const scroll = await test.invoke(test.bindings.window, "scrollTo", 0, 0);
		expect(scroll.kind).toBe("promise");
		expect(
			test.provider.registered.has(
				test.bindings.globals.scrollTo as PageFocusOperation,
			),
		).toBe(false);
		await (scroll.value as Promise<unknown>);
	});

	it.each(["bindings", "document", "runtime-abort"])(
		"interrupts pending prefixes on %s close",
		async (kind) => {
			const test = await fixture();
			const target = test.element("#target");
			const blocked = deferred();
			test.listen(target, "focus", () => ({
				synchronous: blocked.promise,
				result: blocked.promise,
			}));
			const pending = test.invoke(target, "focus", { focusVisible: true });
			const rejection = expect(pending).rejects.toThrow(/closed|aborted/);
			if (kind === "bindings") test.bindings.close();
			else if (kind === "document") test.document.close();
			else test.lifetime.abort();
			await rejection;
			blocked.resolve();
			await expect(test.invoke(target, "focus")).rejects.toThrow(/closed/);
			expect(test.interactions.events.metrics().activeDispatches).toBe(0);
		},
	);

	it("guards unpublished and failed-publication methods using their registered identity", async () => {
		const test = await fixture();
		let leaked!: PageFocusOperation;
		let early!: Promise<unknown>;
		test.provider.onPublish((definition) => {
			if (!definition.methods?.focus) return;
			leaked = definition.methods.focus;
			expect(test.provider.registered.has(leaked)).toBe(true);
			early = Promise.resolve(leaked());
			void early.catch(() => undefined);
			throw new Error("publication failed");
		});
		expect(() => test.element("#target")).toThrow(/publication failed/);
		await expect(early).rejects.toThrow(/not published/);
		test.provider.onPublish(undefined);
		const target = test.element("#target");
		expect(publishedMethods(test.provider.definitions, target).focus).not.toBe(
			leaked,
		);
		await expect(Promise.resolve(leaked())).rejects.toThrow(/not published/);
		expect(test.document.activeElement).toBeNull();
	});

	it("bounds lazy binding slots without late registration or identity recycling", async () => {
		const test = await fixture(1);
		const first = test.element("#first");
		expect(() => test.element("#target")).toThrow(/binding limit/);
		expect(test.element("#first")).toBe(first);
		expect(test.provider.registered.size).toBe(2);
		expect(await test.invoke(first, "focus", { preventScroll: true })).toEqual({
			kind: "value",
			value: undefined,
		});
	});

	it("omits active element focus/blur on legacy contexts and rejects foreign focus owners", async () => {
		const test = await fixture();
		const other = parseHtmlDocument(
			"<input id=other>",
			"https://other.invalid/",
		);
		cleanup.push(() => other.close());
		const factory = {
			createHostObject: (definition: ReleasedHostDefinition) =>
				test.provider.context.createHostObject(definition),
		};
		const legacyBindings = new PageBindings(
			{ document: other, interactions: documentInteractions(other) },
			{
				...factory,
				retainGuestArguments: (operation) => operation,
				releaseGuestReference() {},
			},
			{
				isClosed: () => false,
				startCallback() {
					throw new Error("Unexpected legacy callback");
				},
				fail() {},
				onConsoleCall() {},
			},
		);
		const legacy = legacyBindings.dom;
		expect(legacyBindings.focus.synchronousPageMethods).toBe(false);
		cleanup.push(() => legacyBindings.close());
		const id = new DocumentQueries(other).querySelector("#other");
		if (id === null) throw new Error("Missing other input");
		const methods = publishedMethods(
			test.provider.definitions,
			legacy.node(id),
		);
		expect(methods.focus).toBeUndefined();
		expect(methods.blur).toBeUndefined();
		expect(
			() =>
				new ScriptDom(
					other,
					factory,
					undefined,
					undefined,
					undefined,
					undefined,
					test.bindings.focus,
				),
		).toThrow(/another document/);
	});

	it("rejects registration wrappers and invalid pool limits rather than losing identity", async () => {
		const test = await fixture();
		for (const maximum of [0, -1, 1.5, 4097, Number.NaN])
			expect(
				() =>
					new PageFocus(test.interactions.focus, undefined, {
						document: test.document,
						register: (operation) => operation,
						maxBindings: maximum,
					}),
			).toThrow(/Invalid page focus bridge/);
		let captured!: PageFocusOperation;
		expect(
			() =>
				new PageFocus(test.interactions.focus, undefined, {
					document: test.document,
					maxBindings: 1,
					register: (operation) => {
						captured = operation;
						return ((...args: readonly unknown[]) =>
							operation(...args)) as typeof operation;
					},
				}),
		).toThrow(/preserve operation identity/);
		expect(() => captured()).toThrow(/closed/);
	});

	it("composes with the real PageScripts callback lifecycle without waiting for tails", async () => {
		const provider = publicCoreFixture();
		const document = parseHtmlDocument(
			"<main><input id=target></main>",
			"https://fixture.invalid/focus-lifecycle",
		);
		const interactions = documentInteractions(document);
		const scripts = new PageScripts(
			{ document, interactions },
			extensionPageRuntime(provider.core),
			{ focusLimits: { maxBindings: 8 } },
		);
		cleanup.push(async () => {
			await scripts.close();
			document.close();
		});
		expect(await scripts.evaluate("")).toMatchObject({ ok: true });
		const id = new DocumentQueries(document).querySelector("#target");
		if (id === null) throw new Error("Missing target input");
		const target = scripts.dom.node(id);
		const prefix = deferred();
		const tail = deferred();
		publishedMethods(provider.definitions, target).addEventListener(
			"focus",
			() => ({
				synchronous: prefix.promise,
				result: tail.promise,
			}),
		);
		const pending = provider.invoke(target, "focus", { preventScroll: true });
		expect(scripts.metrics().pendingCallbacks).toBe(1);
		prefix.resolve();
		expect(await pending).toEqual({ kind: "value", value: undefined });
		expect(scripts.metrics().pendingCallbacks).toBe(1);
		tail.resolve();
		await tail.promise;
		await Promise.resolve();
		expect(scripts.metrics().pendingCallbacks).toBe(0);
		expect(document.activeElement).toBe(id);
	});

	it("keeps inert document focus methods synchronous without consuming focus slots", async () => {
		const test = await fixture();
		const implementation = (
			test.bindings.dom.document as { implementation: object }
		).implementation;
		const inert = test.call(
			implementation,
			"createHTMLDocument",
			"Inert",
		) as object;
		const input = test.call(inert, "createElement", "input") as object;
		const operation = publishedMethods(test.provider.definitions, input).focus;
		expect(test.provider.registered.has(operation)).toBe(false);
		expect(await test.invoke(input, "focus")).toEqual({
			kind: "value",
			value: undefined,
		});
		expect(test.document.activeElement).toBeNull();
		expect(test.provider.registered.size).toBe(64);
	});

	it("rejects detached or disabled focus targets without changing focus or scrolling", async () => {
		const test = await fixture();
		const first = test.element("#first");
		await test.invoke(first, "focus", { preventScroll: true });
		const detached = test.call(
			test.bindings.dom.document,
			"createElement",
			"input",
		) as object;
		expect(await test.invoke(detached, "focus")).toEqual({
			kind: "value",
			value: undefined,
		});
		const target = test.element("#target");
		test.call(target, "setAttribute", "disabled", "");
		expect(await test.invoke(target, "focus")).toEqual({
			kind: "value",
			value: undefined,
		});
		expect(test.document.activeElement).toBe(test.id("#first"));
		expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
	});
});
