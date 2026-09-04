import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { pageScrollLimits } from "./page-scroll.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Window {
	scroll(...args: unknown[]): Promise<void>;
	scrollTo(...args: unknown[]): Promise<void>;
	scrollBy(...args: unknown[]): Promise<void>;
	scrollX: number;
	scrollY: number;
	onscroll: (() => void) | null;
}
const trees: DocumentTree[] = [];
function fixture() {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0}div{width:160px;height:60px}#first{background:red}#second{background:blue}</style><div id="first"></div><div id="second"></div><div></div>',
		"https://fixture.invalid/page-scroll",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const interactions = documentInteractions(tree);
	let busy = false;
	const context: PageBindingContext = {
		createHostObject(definition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			Object.assign(target, definition.methods);
			return target;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference() {},
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		isBusy: () => busy,
		startCallback(callback, args, receiver) {
			if (typeof callback !== "function") throw new Error("Expected callback");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(callback.apply(receiver.thisValue, args)),
			};
		},
		fail: vi.fn(),
		onConsoleCall() {},
	};
	const bindings = new PageBindings(
		{ document: tree, interactions },
		context,
		lifecycle,
	);
	const window = bindings.window as Window;
	const trace: number[] = [];
	interactions.events.addEventListener(tree.root, "scroll", () =>
		trace.push(window.scrollY),
	);
	return {
		tree,
		window,
		bindings,
		interactions,
		trace,
		lifecycle,
		busy: (value: boolean) => {
			busy = value;
		},
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

it.each(["scroll", "scrollTo", "scrollBy"] as const)(
	"%s updates position immediately and returns a resolved completion promise",
	async (name) => {
		const { window, trace } = fixture();
		const completion = window[name](20, 60);
		expect(window.scrollX).toBe(20);
		expect(window.scrollY).toBe(60);
		expect(completion).toBeInstanceOf(Promise);
		expect(trace).toEqual([]);
		await expect(completion).resolves.toBeUndefined();
	},
);

it("declares and exposes callable global methods through the same owner", async () => {
	const { tree, bindings, window } = fixture();
	for (const name of ["scroll", "scrollTo", "scrollBy"])
		expect(pageBindingGlobalNames(tree)).toContain(name);
	await (bindings.globals.scrollTo as Window["scrollTo"])(10, 30);
	expect(window.scrollY).toBe(30);
	await (bindings.globals.scrollBy as Window["scrollBy"])({ top: 5 });
	expect(window.scrollY).toBe(35);
});

it.each([undefined, null, {}])(
	"empty options %s preserve the current position",
	async (options) => {
		const { window } = fixture();
		await window.scrollTo(10, 30);
		await window.scrollTo(options);
		expect([window.scrollX, window.scrollY]).toEqual([10, 30]);
		await window.scrollBy(options);
		expect([window.scrollX, window.scrollY]).toEqual([10, 30]);
	},
);

it("preserves omitted axes and applies relative options", async () => {
	const { window } = fixture();
	await window.scrollTo(10, 30);
	await window.scrollTo({ top: 60, behavior: "instant" });
	expect([window.scrollX, window.scrollY]).toEqual([10, 60]);
	await window.scrollBy({ left: 5, top: -10, behavior: "auto" });
	expect([window.scrollX, window.scrollY]).toEqual([15, 50]);
});

it("converts primitive coordinates and normalizes nonfinite values", async () => {
	const { window } = fixture();
	await window.scrollTo("10.5", "30.25");
	expect([window.scrollX, window.scrollY]).toEqual([10.5, 30.25]);
	await window.scrollTo(true, null);
	expect([window.scrollX, window.scrollY]).toEqual([1, 0]);
	await window.scrollTo(Number.NaN, Number.POSITIVE_INFINITY);
	expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
});

it("normalizes nonfinite relative deltas to zero rather than resetting the position", async () => {
	const { window } = fixture();
	await window.scrollTo(10, 30);
	await window.scrollBy(Number.NaN, Number.NEGATIVE_INFINITY);
	expect([window.scrollX, window.scrollY]).toEqual([10, 30]);
});

it("distinguishes undefined positional numbers from omitted dictionary coordinates", async () => {
	const { window } = fixture();
	await window.scrollTo(10, 30);
	await window.scrollTo(undefined, undefined);
	expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
	await window.scrollTo(10, 30);
	await window.scrollTo({ left: undefined, top: undefined });
	expect([window.scrollX, window.scrollY]).toEqual([10, 30]);
});

it("saturates huge finite requests instead of passing them into layout coordinates", async () => {
	const { window } = fixture();
	await window.scrollTo(Number.MAX_VALUE, Number.MAX_VALUE);
	expect([window.scrollX, window.scrollY]).toEqual([60, 100]);
	await window.scrollBy(-Number.MAX_VALUE, -Number.MAX_VALUE);
	expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
});

it("coalesces programmatic changes into a deferred event with the final position", async () => {
	const { window, bindings, trace } = fixture();
	void window.scrollTo(0, 20);
	void window.scrollBy(0, 10);
	void window.scrollTo({ top: 60 });
	expect(trace).toEqual([]);
	expect(bindings.scrolling.metrics()).toMatchObject({
		pending: true,
		queued: true,
	});
	await vi.runAllTimersAsync();
	expect(trace).toEqual([60]);
	expect(bindings.scrolling.metrics()).toMatchObject({
		events: 1,
		pending: false,
		queued: false,
		running: false,
	});
});

it("still notifies when multiple changes return to the original position", async () => {
	const { window, trace } = fixture();
	void window.scrollTo(0, 20);
	void window.scrollTo(0, 0);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([0]);
});

it("does not notify for unchanged or already-clamped requests", async () => {
	const { window, trace } = fixture();
	await window.scrollTo();
	await window.scrollTo(-10, -10);
	await window.scrollBy();
	await vi.runAllTimersAsync();
	expect(trace).toEqual([]);
});

it("waits for explicit source completion rather than polling while the realm is busy", async () => {
	const { window, bindings, busy, trace } = fixture();
	busy(true);
	void window.scrollTo(0, 60);
	expect(vi.getTimerCount()).toBe(0);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([]);
	busy(false);
	bindings.scrolling.wake();
	await vi.runAllTimersAsync();
	expect(trace).toEqual([60]);
});

it("retains pending work if a source begins after a task has been queued", async () => {
	const { window, bindings, busy, trace } = fixture();
	void window.scrollTo(0, 60);
	busy(true);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([]);
	expect(vi.getTimerCount()).toBe(0);
	busy(false);
	bindings.scrolling.wake();
	await vi.runAllTimersAsync();
	expect(trace).toEqual([60]);
});

it("defers a listener-triggered movement to a subsequent notification", async () => {
	const { window, trace } = fixture();
	window.onscroll = () => {
		if (window.scrollY === 20) void window.scrollTo(0, 60);
	};
	void window.scrollTo(0, 20);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([20, 60]);
});

it("uses native document/Window handler identities, event flags and replacement", async () => {
	const { tree, window, bindings, interactions } = fixture();
	const document = bindings.dom.document as { onscroll: (() => void) | null };
	const calls: string[] = [];
	document.onscroll = function () {
		expect(this).toBe(document);
		calls.push("document");
	};
	window.onscroll = () => calls.push("old");
	window.onscroll = function () {
		expect(this).toBe(window);
		calls.push("window");
	};
	interactions.events.addEventListener(tree.root, "scroll", (event) => {
		expect(event).toMatchObject({
			bubbles: true,
			cancelable: false,
			composed: false,
			isTrusted: false,
		});
	});
	void window.scrollTo(0, 60);
	await vi.runAllTimersAsync();
	expect(calls).toEqual(["document", "window"]);
	document.onscroll = null;
	window.onscroll = null;
	void window.scrollTo(0, 0);
	await vi.runAllTimersAsync();
	expect(calls).toEqual(["document", "window"]);
});

it.each(["smooth", "unknown", null, false])(
	"does not silently substitute instant behavior for %s",
	(behavior) => {
		const { window } = fixture();
		expect(() => window.scrollTo({ top: 60, behavior })).toThrow();
		expect(window.scrollY).toBe(0);
	},
);

it.each([1, true, "10", []])(
	"rejects invalid one-argument dictionary %s",
	(options) => {
		const { window } = fixture();
		expect(() => window.scrollTo(options)).toThrow("dictionary");
		expect(window.scrollY).toBe(0);
	},
);

it("does not execute option accessors or inherited option coercion", () => {
	const { window } = fixture();
	const getter = vi.fn(() => 60);
	expect(() =>
		window.scrollTo(Object.defineProperty({}, "top", { get: getter })),
	).toThrow("accessors");
	expect(getter).not.toHaveBeenCalled();
	expect(() => window.scrollTo(Object.create({ top: 60 }))).toThrow(
		"Inherited",
	);
	expect(window.scrollY).toBe(0);
});

it.each([{}, () => 10, Symbol("number"), 10n])(
	"rejects unsupported coordinate coercion without partial movement",
	(value) => {
		const { window } = fixture();
		expect(() => window.scrollTo(10, value)).toThrow();
		expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
	},
);

it("shares native geometry and actual capture pixels with programmatic scrolling", async () => {
	const { window, tree } = fixture();
	const id = new DocumentQueries(tree).querySelector("#second") as number;
	const before = rasterizeDocument(tree).image.pixels;
	await window.scrollTo(10, 60);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		x: -10,
		y: 0,
	});
	expect(rasterizeDocument(tree).clip.y).toBe(60);
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it("bounds requests including no-ops without changing the native owner limit", () => {
	const { window, tree } = fixture();
	for (let index = 0; index < pageScrollLimits.maxRequests; index++)
		void window.scrollTo(0, 0);
	expect(() => window.scrollTo(0, 0)).toThrow("request limit");
	expect(documentScroll(tree).metrics().updates).toBe(
		pageScrollLimits.maxRequests,
	);
});

it("cancels pending tasks on binding closure and revokes stored methods", async () => {
	const { window, bindings, trace } = fixture();
	const method = window.scrollTo;
	void method(0, 60);
	bindings.close();
	await vi.runAllTimersAsync();
	expect(trace).toEqual([]);
	expect(bindings.scrolling.metrics()).toMatchObject({
		closed: true,
		pending: false,
		queued: false,
	});
	expect(() => method(0, 0)).toThrow("closed");
});

it("reports dispatcher failure and stops its owned notification task", async () => {
	const { window, interactions, lifecycle, bindings } = fixture();
	void window.scrollTo(0, 60);
	interactions.events.close();
	await vi.runAllTimersAsync();
	expect(lifecycle.fail).toHaveBeenCalledOnce();
	expect(bindings.scrolling.metrics().closed).toBe(true);
});
