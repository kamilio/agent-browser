import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { PageClock } from "./page-performance.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];

function fixture() {
	const document = new DocumentTree("https://example.com/");
	documents.push(document);
	const interactions = new DocumentInteractions(document);
	const definitions: ScriptHostObjectDefinition[] = [];
	const objects: object[] = [];
	const retained: {
		operation: (...args: readonly unknown[]) => unknown;
		from: number;
		wrapped: (...args: readonly unknown[]) => unknown;
	}[] = [];
	const calls: unknown[][] = [];
	const context: PageBindingContext = {
		createHostObject(definition) {
			definitions.push(definition);
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
			objects.push(object);
			return object;
		},
		retainGuestArguments(operation, from) {
			const wrapped = (...args: readonly unknown[]) => {
				calls.push([...args]);
				return operation(...args);
			};
			retained.push({ operation, from, wrapped });
			return wrapped as typeof operation;
		},
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: vi.fn((callback, args, options) => {
			if (typeof callback !== "function")
				throw new Error("Expected fixture callback");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(callback.apply(options.thisValue, args)),
			};
		}),
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	return {
		page: { document, interactions },
		context,
		lifecycle,
		definitions,
		objects,
		retained,
		calls,
	};
}

afterEach(() => {
	for (const document of documents.splice(0)) document.close();
	vi.useRealTimers();
});

describe("runtime-independent page capability setup", () => {
	it("dispatches Window onload with stable replacement ordering and the Window receiver", async () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const window = bindings.window as {
			onload: unknown;
			addEventListener(type: string, callback: unknown): void;
		};
		const order: string[] = [];
		const receiver: unknown[] = [];
		expect(window.onload).toBeNull();
		window.addEventListener("load", () => order.push("before"));
		window.onload = () => order.push("replaced");
		window.addEventListener("load", () => order.push("after"));
		const replacement = function (
			this: unknown,
			event: { type: string; target: unknown },
		) {
			order.push(event.type);
			receiver.push(this, event.target);
		};
		window.onload = replacement;
		expect(window.onload).toBe(replacement);
		await test.page.interactions.events.dispatchEventAsync(
			test.page.interactions.events.windowTarget as number,
			new BrowserEvent("load"),
		);
		expect(order).toEqual(["before", "load", "after"]);
		expect(receiver).toEqual([window, window]);
		window.onload = null;
		expect(window.onload).toBeNull();
		order.length = 0;
		await test.page.interactions.events.dispatchEventAsync(
			test.page.interactions.events.windowTarget as number,
			new BrowserEvent("load"),
		);
		expect(order).toEqual(["before", "after"]);
		bindings.close();
		expect(() => window.onload).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		expect(() => {
			window.onload = replacement;
		}).toThrow(expect.objectContaining({ code: "closed" }));
	});
	it.each([undefined, null, false, 0, "source", Symbol("handler")])(
		"clears onload for a non-object value %s",
		(value) => {
			const test = fixture();
			const bindings = new PageBindings(
				test.page,
				test.context,
				test.lifecycle,
			);
			const window = bindings.window as { onload: unknown };
			window.onload = () => {};
			window.onload = value;
			expect(window.onload).toBeNull();
			bindings.close();
		},
	);
	it("retains a non-callable onload object without invoking its handleEvent method", async () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const window = bindings.window as {
			onload: unknown;
			addEventListener(type: string, callback: unknown): void;
		};
		const order: string[] = [];
		const handleEvent = vi.fn();
		const value = { handleEvent };
		// Web IDL LegacyTreatNonObjectAsNull retains objects as inert callbacks.
		// https://webidl.spec.whatwg.org/#LegacyTreatNonObjectAsNull
		window.addEventListener("load", () => order.push("before"));
		window.onload = value;
		window.addEventListener("load", () => order.push("after"));
		expect(window.onload).toBe(value);
		const dispatch = () =>
			test.page.interactions.events.dispatchEventAsync(
				test.page.interactions.events.windowTarget as number,
				new BrowserEvent("load"),
			);
		await dispatch();
		expect(order).toEqual(["before", "after"]);
		expect(handleEvent).not.toHaveBeenCalled();
		order.length = 0;
		window.onload = () => order.push("replacement");
		await dispatch();
		expect(order).toEqual(["before", "replacement", "after"]);
		expect(bindings.dom.eventBindings?.drainErrors()).toEqual([]);
		bindings.close();
	});
	it("shares the page clock and frame functions between globals and Window", async () => {
		vi.useFakeTimers();
		const test = fixture();
		let reading = 10;
		const clock = new PageClock({ timeOrigin: 1000, now: () => reading });
		reading = 30;
		const bindings = new PageBindings(
			test.page,
			test.context,
			test.lifecycle,
			{},
			clock,
		);
		const window = bindings.window as {
			performance: { now(): number; timeOrigin: number };
			requestAnimationFrame(callback: unknown): number;
			cancelAnimationFrame(handle: unknown): void;
		};
		expect(bindings.globals.performance).toBe(window.performance);
		expect(window.performance).toBe(bindings.performance);
		expect(window.performance.now()).toBe(20);
		expect(window.performance.timeOrigin).toBe(1010);
		for (const name of [
			"requestAnimationFrame",
			"cancelAnimationFrame",
		] as const) {
			expect(bindings.globals[name]).toBe(window[name]);
			expect(pageBindingGlobalNames(test.page.document)).toContain(name);
		}
		expect(pageBindingGlobalNames(test.page.document)).toContain("performance");
		const callback = vi.fn();
		window.requestAnimationFrame(callback);
		reading = 47;
		await vi.advanceTimersByTimeAsync(17);
		expect(callback).toHaveBeenCalledWith(37);
		window.requestAnimationFrame(callback);
		test.page.document.close();
		expect(bindings.animationFrames.metrics()).toMatchObject({
			closed: true,
			active: 0,
			armed: false,
		});
		expect(clock.metrics().closed).toBe(true);
		expect(() => window.performance).toThrow(/closed/);
		expect(() => window.requestAnimationFrame(callback)).toThrow(/closed/);
		expect(() => window.cancelAnimationFrame(1)).toThrow(/closed/);
	});
	it("registers global and window computed styles with owned element branding", () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const document = bindings.dom.document as {
			createElement(name: string): object;
		};
		const element = document.createElement("div");
		const window = bindings.window as {
			getComputedStyle(element: unknown): { width: string };
		};
		expect(pageBindingGlobalNames(test.page.document)).toContain(
			"getComputedStyle",
		);
		expect(bindings.globals.getComputedStyle).toBe(window.getComputedStyle);
		expect(window.getComputedStyle(element).width).toBe("");
		expect(() => window.getComputedStyle({})).toThrow();
		bindings.close();
		expect(() => window.getComputedStyle(element)).toThrow(/closed/);
	});

	it("constructs live aliases with no Budget, realm, evaluator or error constructor", () => {
		const test = fixture();
		expect(Object.keys(test.context).sort()).toEqual([
			"createHostObject",
			"releaseGuestReference",
			"retainGuestArguments",
		]);
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const window = bindings.window as {
			document: object;
			self: object;
			location: object;
			console: object;
		};
		expect(bindings.globals.window).toBe(bindings.window);
		expect(bindings.globals.self).toBe(bindings.window);
		expect(window.self).toBe(bindings.window);
		expect(window.document).toBe(bindings.dom.document);
		expect(window.location).toBe(bindings.location.object);
		expect(window.console).toBe(bindings.console.object);
		expect(bindings.globals.fetch).toBeUndefined();
	});

	it("uses registered timer return values for both global and Window methods", () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const window = bindings.window as {
			setTimeout: unknown;
			setInterval: unknown;
		};
		expect(test.retained.map((entry) => entry.from)).toEqual([2, 2]);
		expect(bindings.globals.setTimeout).toBe(test.retained[0].wrapped);
		expect(bindings.globals.setInterval).toBe(test.retained[1].wrapped);
		expect(window.setTimeout).toBe(bindings.globals.setTimeout);
		expect(window.setInterval).toBe(bindings.globals.setInterval);
		expect(bindings.globals.setTimeout).not.toBe(
			bindings.timers.methods.setTimeout,
		);
	});

	it("releases timer arguments through the context on cancellation", () => {
		vi.useFakeTimers();
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const callback = () => undefined;
		const retainedValue = { marker: "native test handle" };
		const setTimeout = bindings.globals.setTimeout as (
			...args: unknown[]
		) => number;
		const identity = setTimeout(callback, 1000, retainedValue);
		expect(test.calls).toEqual([[callback, 1000, retainedValue]]);
		bindings.timers.methods.clearTimeout(identity);
		expect(test.context.releaseGuestReference).toHaveBeenCalledExactlyOnceWith(
			retainedValue,
		);
		expect(bindings.timers.metrics().active).toBe(0);
	});

	it("delegates timer callback phases and preserves Window as this", async () => {
		vi.useFakeTimers();
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		const callback = vi.fn();
		bindings.timers.methods.setTimeout(callback, 1, "argument");
		await vi.advanceTimersByTimeAsync(1);
		expect(test.lifecycle.startCallback).toHaveBeenCalledWith(
			callback,
			["argument"],
			{ thisValue: bindings.window },
		);
		expect(callback).toHaveBeenCalledExactlyOnceWith("argument");
		expect(test.lifecycle.fail).not.toHaveBeenCalled();
	});

	it("delegates console accounting without owning realm state", () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		(bindings.console.object as { log(value: string): void }).log("fixture");
		expect(test.lifecycle.onConsoleCall).toHaveBeenCalledTimes(1);
		expect(bindings.console.buffer.read().entries[0].text).toBe("fixture");
	});

	it("closes guest bindings without closing native document interactions", () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		bindings.close();
		bindings.close();
		expect(bindings.closed).toBe(true);
		expect(bindings.timers.metrics().closed).toBe(true);
		expect(test.page.interactions.events.metrics().closed).toBe(false);
		expect(test.page.document.get(test.page.document.root)).toBeDefined();
		expect(() => (bindings.location.object as { href: string }).href).toThrow(
			"closed",
		);
		expect(() => (bindings.console.object as { log(): void }).log()).toThrow(
			"closed",
		);
	});

	it("revokes bindings when the native document closes", () => {
		const test = fixture();
		const bindings = new PageBindings(test.page, test.context, test.lifecycle);
		test.page.document.close();
		expect(bindings.closed).toBe(true);
		expect(bindings.dom.metrics().classLists.closed).toBe(true);
	});

	it("cleans up previously constructed capabilities after registration fails", () => {
		const test = fixture();
		test.context.retainGuestArguments = () => {
			throw new Error("registration failed");
		};
		expect(
			() => new PageBindings(test.page, test.context, test.lifecycle),
		).toThrow("registration failed");
		const performanceIndex = test.definitions.findIndex((definition) =>
			Object.hasOwn(definition.properties ?? {}, "timeOrigin"),
		);
		expect(performanceIndex).toBeGreaterThanOrEqual(0);
		expect(
			() =>
				(test.objects[performanceIndex] as { timeOrigin: number }).timeOrigin,
		).toThrow("closed");
		expect(() => (test.objects[0] as { userAgent: string }).userAgent).toThrow(
			"closed",
		);
		expect(test.page.interactions.events.metrics().closed).toBe(false);
	});

	it("cleans up prior capabilities after a host factory failure", () => {
		const test = fixture();
		const create = test.context.createHostObject;
		test.context.createHostObject = (definition) => {
			if (test.objects.length === 1) throw new Error("host limit");
			return create(definition);
		};
		expect(
			() => new PageBindings(test.page, test.context, test.lifecycle),
		).toThrow("host limit");
		expect(test.objects).toHaveLength(1);
		expect(() => (test.objects[0] as { userAgent: string }).userAgent).toThrow(
			"closed",
		);
	});

	it("rejects a closed lifecycle before constructing any capability", () => {
		const test = fixture();
		test.lifecycle.isClosed = () => true;
		expect(
			() => new PageBindings(test.page, test.context, test.lifecycle),
		).toThrow("closed");
		expect(test.objects).toHaveLength(0);
	});

	it("rejects missing owned capability operations", () => {
		const test = fixture();
		expect(
			() =>
				new PageBindings(test.page, {} as PageBindingContext, test.lifecycle),
		).toThrow("owned host capability");
	});

	it("rejects a mismatched native event owner", () => {
		const test = fixture();
		const other = fixture();
		expect(
			() =>
				new PageBindings(
					{
						document: test.page.document,
						interactions: other.page.interactions,
					},
					test.context,
					test.lifecycle,
				),
		).toThrow("Window dispatcher");
		expect(test.objects).toHaveLength(0);
	});
});
