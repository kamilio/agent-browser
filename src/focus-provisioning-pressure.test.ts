import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { extensionPageRuntimeLimits } from "./extension-page-runtime.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { type PageBindingContext, PageBindings } from "./page-bindings.js";
import {
	PageFocus,
	type PageFocusMethods,
	type PageFocusOperation,
	pageFocusLimits,
} from "./page-focus.js";
import { scriptLimits } from "./safejs.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptNodePublications } from "./script-node-publications.js";
import { DocumentQueries } from "./selectors.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function methodsOf(definition: ScriptHostObjectDefinition) {
	const methods = definition.methods;
	if (!methods) throw new Error("Missing published methods");
	return methods;
}

function retainedState(owner: PageFocus) {
	const state = owner as unknown as {
		slots: { operations?: PageFocusMethods }[];
		nextSlot: number;
	};
	return {
		slots: state.slots.length,
		consumed: state.nextSlot,
		bindings: state.slots.filter((slot) => slot.operations !== undefined)
			.length,
	};
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function fixture(maxBindings: number) {
	const document = new DocumentTree("https://fixture.invalid/focus-pressure");
	cleanup.push(() => document.close());
	const interactions = documentInteractions(document);
	const registered: PageFocusOperation[] = [];
	let setup = true;
	const owner = new PageFocus(interactions.focus, undefined, {
		document,
		maxBindings,
		register(operation) {
			if (!setup) throw new Error("Registration outside setup");
			registered.push(operation);
			return operation;
		},
	});
	setup = false;
	cleanup.push(() => owner.close());
	const definitions: ScriptHostObjectDefinition[] = [];
	const calls: [number, string][] = [];
	let provider = (_definition: ScriptHostObjectDefinition): object => ({});
	const publications = new ScriptNodePublications(
		{
			createHostObject(definition) {
				definitions.push(definition);
				return provider(definition);
			},
		},
		() => owner.assertDocument(document),
	);
	cleanup.push(() => publications.close());
	return {
		document,
		owner,
		registered,
		definitions,
		calls,
		publications,
		provide(next: typeof provider) {
			provider = next;
		},
		publish(
			id: number,
			commit: (capability: object) => void = () => {},
			methods: PageFocusMethods = {
				focus: () => calls.push([id, "focus"]),
				blur: () => calls.push([id, "blur"]),
			},
		) {
			return publications.publish("node", id, { methods }, commit, (guarded) =>
				owner.bindMethods(guarded),
			);
		},
	};
}

describe("deterministic native provisioning counts, not SDK measurements", () => {
	it.each([1, 64, 512, 4096])(
		"fully consumes %i slots without registration growth or identity reuse",
		async (maximum) => {
			const data = fixture(maximum);
			expect(data.registered).toHaveLength(maximum * 2);
			expect(new Set(data.registered).size).toBe(maximum * 2);
			expect(data.definitions).toHaveLength(0);
			expect(retainedState(data.owner)).toEqual({
				slots: maximum,
				consumed: 0,
				bindings: 0,
			});
			for (const operation of data.registered)
				expect(operation).toThrow("not bound");
			for (let index = 0; index < maximum; index++) {
				data.publish(index);
				const methods = methodsOf(data.definitions[index]);
				expect(methods.focus).toBe(data.registered[index * 2]);
				expect(methods.blur).toBe(data.registered[index * 2 + 1]);
				await expect(methods.focus()).resolves.toBeUndefined();
				await expect(methods.blur()).resolves.toBeUndefined();
			}
			for (let index = 0; index < 128; index++)
				expect(() => data.publish(maximum + index)).toThrow("binding limit");
			expect(data.registered).toHaveLength(maximum * 2);
			expect(data.definitions).toHaveLength(maximum);
			expect(data.publications.metrics()).toEqual({
				pending: 0,
				published: maximum,
				failed: 128,
				closed: false,
			});
			expect(retainedState(data.owner)).toEqual({
				slots: maximum,
				consumed: maximum,
				bindings: maximum,
			});
			for (let index = maximum - 1; index >= 0; index--)
				await data.registered[index * 2]();
			expect(data.calls).toEqual([
				...Array.from({ length: maximum }, (_, index) => [
					[index, "focus"],
					[index, "blur"],
				]).flat(),
				...Array.from({ length: maximum }, (_, index) => [
					maximum - index - 1,
					"focus",
				]),
			]);
			data.publications.close();
			for (const operation of data.registered)
				await expect(operation()).rejects.toMatchObject({ code: "closed" });
			expect(data.calls).toHaveLength(maximum * 3);
			data.owner.close();
			data.owner.close();
			expect(retainedState(data.owner)).toEqual({
				slots: 0,
				consumed: maximum,
				bindings: 0,
			});
			for (const operation of data.registered)
				expect(operation).toThrow("Page focus is closed");
		},
	);

	it.each([1, 64, 512, 4096])(
		"bounds retained targets across four owners of %i slots",
		async (maximum) => {
			const previous: PageFocusOperation[] = [];
			for (let round = 0; round < 4; round++) {
				const data = fixture(maximum);
				for (let index = 0; index < maximum; index++) data.publish(index);
				await data.registered[(maximum - 1) * 2]();
				expect(data.calls).toEqual([[maximum - 1, "focus"]]);
				data.owner.close();
				data.publications.close();
				data.document.close();
				expect(retainedState(data.owner)).toEqual({
					slots: 0,
					consumed: maximum,
					bindings: 0,
				});
				previous.push(...data.registered);
				for (const operation of previous)
					expect(operation).toThrow("Page focus is closed");
			}
			expect(previous).toHaveLength(maximum * 8);
			expect(new Set(previous).size).toBe(maximum * 8);
		},
	);
});

describe("failure and revocation pressure", () => {
	it.each(["factory", "commit", "invalid", "duplicate"] as const)(
		"burns all 64 failed %s slots without exposing or rebinding methods",
		async (failure) => {
			const data = fixture(64);
			const shared = {};
			if (failure === "duplicate") {
				data.provide(() => shared);
				data.publish(-1);
			}
			const initial = data.definitions.length;
			const rejectedDuringPublication: Promise<unknown>[] = [];
			data.provide((definition) => {
				for (const method of [
					methodsOf(definition).focus,
					methodsOf(definition).blur,
				])
					rejectedDuringPublication.push(
						expect(method()).rejects.toThrow("not published"),
					);
				if (failure === "factory") throw new Error("factory failed");
				if (failure === "invalid") return null as unknown as object;
				return failure === "duplicate" ? shared : {};
			});
			for (let index = initial; index < 64; index++) {
				expect(() =>
					data.publish(index, () => {
						throw new Error("commit failed");
					}),
				).toThrow(
					failure === "invalid"
						? "Invalid script node capability"
						: failure === "duplicate"
							? "identity was already published"
							: `${failure} failed`,
				);
			}
			await Promise.all(rejectedDuringPublication);
			data.provide(() => ({}));
			for (let index = 0; index < 128; index++)
				expect(() => data.publish(index)).toThrow("binding limit");
			for (const definition of data.definitions.slice(initial)) {
				await expect(methodsOf(definition).focus()).rejects.toThrow(
					"not published",
				);
				await expect(methodsOf(definition).blur()).rejects.toThrow(
					"not published",
				);
			}
			expect(data.calls).toEqual([]);
			expect(data.registered).toHaveLength(128);
			expect(data.definitions).toHaveLength(64);
			expect(data.publications.metrics()).toMatchObject({
				pending: 0,
				published: initial,
				failed: 64 - initial + 128,
			});
			expect(retainedState(data.owner)).toEqual({
				slots: 64,
				consumed: 64,
				bindings: 64,
			});
			data.owner.close();
			expect(retainedState(data.owner).bindings).toBe(0);
		},
	);

	it.each(["factory", "commit"] as const)(
		"revokes retained methods if publications close during %s",
		async (phase) => {
			const data = fixture(1);
			data.provide(() => {
				if (phase === "factory") data.publications.close();
				return {};
			});
			expect(() => data.publish(1, () => data.publications.close())).toThrow(
				"closed",
			);
			for (const operation of data.registered)
				await expect(operation()).rejects.toMatchObject({ code: "closed" });
			expect(data.calls).toEqual([]);
			expect(data.publications.metrics()).toEqual({
				pending: 0,
				published: 0,
				failed: 1,
				closed: true,
			});
		},
	);

	it("checks publication revocation after a pending native operation settles", async () => {
		const data = fixture(1);
		const pending = deferred();
		let calls = 0;
		data.publish(1, undefined, {
			focus: () => {
				calls++;
				return pending.promise;
			},
			blur: () => {},
		});
		const result = data.registered[0]();
		expect(calls).toBe(1);
		data.publications.close();
		const rejected = expect(result).rejects.toMatchObject({ code: "closed" });
		pending.resolve();
		await rejected;
		await expect(data.registered[0]()).rejects.toMatchObject({
			code: "closed",
		});
		expect(calls).toBe(1);
	});

	it("contains publication reentry and never leaks the uncommitted slot", async () => {
		const data = fixture(64);
		const failures: Promise<unknown>[] = [];
		data.provide((definition) => {
			failures.push(
				expect(methodsOf(definition).focus()).rejects.toThrow("not published"),
			);
			const depth = data.definitions.length;
			expect(() => data.publish(depth - 1)).toThrow("Reentrant");
			if (depth < 64) data.publish(depth);
			return {};
		});
		data.publish(0);
		await Promise.all(failures);
		expect(data.publications.metrics()).toEqual({
			pending: 0,
			published: 64,
			failed: 0,
			closed: false,
		});
		for (let index = 0; index < 64; index++) await data.registered[index * 2]();
		expect(data.calls).toEqual(
			Array.from({ length: 64 }, (_, index) => [index, "focus"]),
		);
	});

	it.each([1, 2, 127, 1024, 8192])(
		"closes every leaked operation after registration failure at call %i",
		async (failureAt) => {
			for (const failure of ["throw", "wrapper"] as const) {
				const document = new DocumentTree(
					"https://fixture.invalid/partial-setup",
				);
				cleanup.push(() => document.close());
				const operations: PageFocusOperation[] = [];
				expect(
					() =>
						new PageFocus(documentInteractions(document).focus, undefined, {
							document,
							register(operation) {
								operations.push(operation);
								expect(operation).toThrow("not bound");
								if (operations.length === failureAt) {
									if (failure === "throw")
										throw new Error("registration refused");
									return (() => operation()) as typeof operation;
								}
								return operation;
							},
						}),
				).toThrow(
					failure === "throw"
						? "registration refused"
						: "preserve operation identity",
				);
				expect(operations).toHaveLength(failureAt);
				for (const operation of operations)
					expect(operation).toThrow("Page focus is closed");
			}
		},
	);

	it("unwinds the 128-publication depth limit without recycling failed slots", async () => {
		const data = fixture(512);
		let peak = 0;
		data.provide(() => {
			peak = Math.max(peak, data.publications.metrics().pending);
			data.publish(data.definitions.length);
			return {};
		});
		expect(() => data.publish(0)).toThrow("publication depth limit");
		expect(peak).toBe(128);
		expect(data.definitions).toHaveLength(128);
		expect(data.publications.metrics()).toEqual({
			pending: 0,
			published: 0,
			failed: 128,
			closed: false,
		});
		expect(retainedState(data.owner)).toEqual({
			slots: 512,
			consumed: 128,
			bindings: 128,
		});
		data.provide(() => ({}));
		data.publish(0);
		expect(methodsOf(data.definitions[128]).focus).toBe(data.registered[256]);
		for (const operation of data.registered.slice(0, 256))
			await expect(operation()).rejects.toThrow("not published");
		await expect(data.registered[256]()).resolves.toBeUndefined();
		expect(data.calls).toEqual([[0, "focus"]]);
		expect(data.registered).toHaveLength(1024);
	});
});

it("preserves nested focus identity and bounds repeated controlled listener failures", async () => {
	const document = parseHtmlDocument(
		'<button id="first">First</button><button id="last">Last</button>',
		"https://fixture.invalid/reentry",
	);
	cleanup.push(() => document.close());
	const interactions = documentInteractions(document);
	const queries = new DocumentQueries(document);
	const first = queries.querySelector("#first");
	const last = queries.querySelector("#last");
	if (first === null || last === null) throw new Error("Missing focus targets");
	const registered: PageFocusOperation[] = [];
	const owner = new PageFocus(interactions.focus, undefined, {
		document,
		maxBindings: 2,
		register(operation) {
			registered.push(operation);
			return operation;
		},
	});
	cleanup.push(() => owner.close());
	const definitions: ScriptHostObjectDefinition[] = [];
	const publications = new ScriptNodePublications(
		{
			createHostObject(definition) {
				definitions.push(definition);
				return {};
			},
		},
		() => owner.assertDocument(document),
	);
	cleanup.push(() => publications.close());
	for (const id of [first, last])
		publications.publish(
			"node",
			id,
			{
				methods: {
					focus: () => owner.focusAsync(id, { preventScroll: true }),
					blur: () => owner.blurAsync(id),
				},
			},
			() => {},
			(methods) => owner.bindMethods(methods),
		);
	const order: string[] = [];
	interactions.events.addEventListener(
		first,
		"focus",
		controlledEventListener(async () => {
			order.push("outer");
			await registered[2]();
			order.push("returned");
		}),
	);
	interactions.events.addEventListener(
		last,
		"focus",
		controlledEventListener(async () => {
			order.push("inner");
			throw new Error("controlled listener failed");
		}),
	);
	for (let iteration = 0; iteration < 64; iteration++) {
		await expect(registered[0]()).resolves.toBeUndefined();
		expect(interactions.focus.active()).toBe(last);
		await expect(registered[3]()).resolves.toBeUndefined();
		expect(interactions.focus.active()).toBeNull();
		expect(interactions.events.drainErrors()).toEqual([
			expect.objectContaining({ message: "controlled listener failed" }),
		]);
		expect(interactions.events.metrics()).toMatchObject({
			activeDispatches: 0,
			retainedErrors: 0,
		});
	}
	expect(order).toEqual(
		Array.from({ length: 64 }, () => ["outer", "inner", "returned"]).flat(),
	);
	expect(registered).toHaveLength(4);
	expect(definitions.map((definition) => methodsOf(definition).focus)).toEqual([
		registered[0],
		registered[2],
	]);
	expect(retainedState(owner)).toEqual({ slots: 2, consumed: 2, bindings: 2 });
});

it("exposes the separate total host-object ceiling without claiming full-pool runtime capacity", async () => {
	const document = new DocumentTree("https://fixture.invalid/object-quota");
	cleanup.push(() => document.close());
	const registered: PageFocusOperation[] = [];
	let setup = true;
	let attempts = 0;
	const definitions: ScriptHostObjectDefinition[] = [];
	const refused: ScriptHostObjectDefinition[] = [];
	const context: PageBindingContext = {
		createHostObject(definition) {
			attempts++;
			if (definitions.length >= extensionPageRuntimeLimits.hostObjects) {
				refused.push(definition);
				throw new RangeError("Realm host object limit exceeded.");
			}
			definitions.push(definition);
			return {};
		},
		nestedOperation(operation) {
			if (!setup) throw new Error("Registration outside setup");
			registered.push(operation);
			return operation;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference() {},
	};
	const bindings = new PageBindings(
		{ document, interactions: documentInteractions(document) },
		context,
		{
			isClosed: () => false,
			startCallback() {
				throw new Error("No callback expected");
			},
			fail(error) {
				throw error;
			},
			onConsoleCall() {},
		},
	);
	cleanup.push(() => bindings.close());
	setup = false;
	const setupObjects = definitions.length;
	const definitionWork = (definition: ScriptHostObjectDefinition) =>
		Object.keys(definition.properties ?? {}).length +
		Object.keys(definition.methods ?? {}).length +
		1;
	const setupDefinitionWork = definitions.reduce(
		(total, definition) => total + definitionWork(definition),
		0,
	);
	expect(registered).toHaveLength(pageFocusLimits.maxBindings * 2);
	expect(setupObjects).toBe(6);
	expect(setupDefinitionWork).toBeGreaterThan(setupObjects);
	expect(setupDefinitionWork).toBeLessThan(scriptLimits().maxSteps);
	const available = extensionPageRuntimeLimits.hostObjects - setupObjects;
	for (let index = 0; index < available; index++) {
		const id = document.createElement("button");
		const capability = bindings.dom.node(id);
		expect(bindings.dom.node(id)).toBe(capability);
		expect(methodsOf(definitions[setupObjects + index]).focus).toBe(
			registered[index * 2],
		);
	}
	const rejected = document.createElement("button");
	const remaining = pageFocusLimits.maxBindings - available;
	for (let index = 0; index < remaining; index++)
		expect(() => bindings.dom.node(rejected)).toThrow(
			"Realm host object limit exceeded",
		);
	for (let index = 0; index < 64; index++)
		expect(() => bindings.dom.node(rejected)).toThrow(
			"Page focus binding limit exceeded",
		);
	for (const definition of refused) {
		await expect(methodsOf(definition).focus()).rejects.toThrow(
			"not published",
		);
		await expect(methodsOf(definition).blur()).rejects.toThrow("not published");
	}
	expect(attempts).toBe(setupObjects + pageFocusLimits.maxBindings);
	expect(definitions).toHaveLength(extensionPageRuntimeLimits.hostObjects);
	const elementDefinitionWork = new Set(
		definitions.slice(setupObjects).map(definitionWork),
	);
	expect([...elementDefinitionWork]).toEqual([109]);
	const definitionOnlyMaxElements = Math.floor(
		(scriptLimits().maxSteps - setupDefinitionWork) / 109,
	);
	expect(definitionOnlyMaxElements).toBe(916);
	expect(refused).toHaveLength(remaining);
	expect(retainedState(bindings.focus)).toEqual({
		slots: 4096,
		consumed: 4096,
		bindings: 4096,
	});
	bindings.close();
	expect(retainedState(bindings.focus).bindings).toBe(0);
	for (const operation of registered)
		expect(operation).toThrow("Page focus is closed");
	console.log(
		JSON.stringify({
			fixture: "native-public-contract-host-object-pressure",
			setupObjects,
			registered: registered.length,
			publishedElements: available,
			refusedPublications: refused.length,
			hostObjects: definitions.length,
			attempts,
			setupDefinitionWork,
			definitionOnlyMaxElements,
			elementDefinitionWork: [...elementDefinitionWork][0],
			totalDefinitionWork: definitions.reduce(
				(total, definition) => total + definitionWork(definition),
				0,
			),
		}),
	);
});
