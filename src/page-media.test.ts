import { afterEach, expect, it, vi } from "vitest";
import { cssMediaMatches } from "./css-parser.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { pageMediaLimits } from "./page-media.js";
import { documentStyles } from "./styles.js";

interface MediaEvent {
	type: string;
	media: string;
	matches: boolean;
	target: MediaList;
	currentTarget: MediaList | null;
	eventPhase: number;
	bubbles: boolean;
	cancelable: boolean;
	composed: boolean;
	isTrusted: boolean;
	defaultPrevented: boolean;
	composedPath(): object[];
	preventDefault(): void;
	stopImmediatePropagation(): void;
}
type Listener = (this: MediaList, event: MediaEvent) => void;
interface MediaList {
	media: string;
	matches: boolean;
	onchange: Listener | null;
	addEventListener(
		type: string,
		listener: Listener | null,
		options?: unknown,
	): void;
	removeEventListener(
		type: string,
		listener: Listener | null,
		options?: unknown,
	): void;
	addListener(listener: Listener | null): void;
	removeListener(listener: Listener | null): void;
}
interface Window {
	innerWidth: number;
	innerHeight: number;
	onresize: (() => void) | null;
	matchMedia(...args: unknown[]): MediaList;
	addEventListener(type: string, listener: () => void): void;
}
const documents: DocumentTree[] = [];
function fixture(markup = "<main>A</main>") {
	vi.useFakeTimers();
	const document = parseHtmlDocument(markup, "https://fixture.invalid/");
	documents.push(document);
	const styles = documentStyles(document);
	styles.setViewport(80, 40);
	const interactions = documentInteractions(document);
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, value] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value });
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => {},
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: (callback, args, options) => {
			if (typeof callback !== "function") throw new Error("Expected callback");
			const result = callback.apply(options.thisValue, args);
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(result),
			};
		},
		fail: vi.fn(),
		onConsoleCall: () => {},
	};
	const bindings = new PageBindings(
		{ document, interactions },
		context,
		lifecycle,
	);
	const window = bindings.window as Window;
	return {
		document,
		styles,
		interactions,
		lifecycle,
		bindings,
		window,
		query: (source: string) => window.matchMedia(source),
		resize: (width: number, height: number) =>
			styles.setViewport(width, height),
	};
}
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
	vi.useRealTimers();
});

it.each([
	["", true],
	["all", true],
	["screen", true],
	["print", false],
	["(min-width: 80px)", true],
	["(max-width: 79px)", false],
	["(width: 5em)", true],
	["(height: 2.5rem)", true],
	["(orientation: landscape)", true],
	["(orientation: portrait)", false],
	["not screen and (max-width: 10px)", true],
	["print, (min-height: 40px)", true],
])("shares stylesheet and page matching for %s", (source, expected) => {
	const { query, styles } = fixture();
	expect(query(source as string).matches).toBe(expected);
	expect(cssMediaMatches(source as string, styles.viewport, () => {})).toBe(
		expected,
	);
});

it("shares the global function and live Window dimensions without creating document nodes", () => {
	const { document, bindings, window, resize } = fixture();
	const before = document.nodeCount;
	expect(bindings.globals.matchMedia).toBe(window.matchMedia);
	expect(pageBindingGlobalNames(document)).toContain("matchMedia");
	const first = window.matchMedia("(min-width: 60px)");
	const second = window.matchMedia("(min-width: 60px)");
	expect(first).not.toBe(second);
	expect(document.nodeCount).toBe(before);
	expect(window.innerWidth).toBe(80);
	expect(window.innerHeight).toBe(40);
	resize(40, 80);
	expect(first.matches).toBe(false);
	expect(second.matches).toBe(false);
	expect(window.innerWidth).toBe(40);
	expect(window.innerHeight).toBe(80);
});

it("keeps media and matches readonly and handles malformed/unsupported list branches explicitly", () => {
	const { query, window, bindings } = fixture();
	const list = query(" SCREEN and ( min-width : 60px ) , invalid, print ");
	expect(list.media).toBe("screen and (min-width: 60px), invalid, print");
	expect(list.matches).toBe(true);
	expect(query("(prefers-color-scheme: dark)").matches).toBe(false);
	expect(query("invalid").media).toBe("invalid");
	expect(query(",").matches).toBe(false);
	expect(() => {
		list.media = "print";
	}).toThrow("read-only");
	expect(() => {
		list.matches = false;
	}).toThrow("read-only");
	expect(() => window.matchMedia()).toThrow("requires");
	expect(window.matchMedia(null).matches).toBe(false);
	expect(() =>
		window.matchMedia({
			toString() {
				throw new Error("executed");
			},
		}),
	).toThrow();
	expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(1);
});

it("queues resize before change, coalesces same-task updates and uses real event target identity", async () => {
	const { query, resize, window } = fixture();
	const list = query("(min-width:60px)");
	const trace: string[] = [];
	let saved: MediaEvent | undefined;
	window.addEventListener("resize", () =>
		trace.push(`resize:${window.innerWidth}`),
	);
	list.addEventListener("change", function (event) {
		saved = event;
		expect(this).toBe(list);
		expect(event.target).toBe(list);
		expect(event.currentTarget).toBe(list);
		expect(event.composedPath()).toEqual([list]);
		expect(event.eventPhase).toBe(2);
		expect([
			event.bubbles,
			event.cancelable,
			event.composed,
			event.isTrusted,
		]).toEqual([false, false, false, false]);
		event.preventDefault();
		expect(event.defaultPrevented).toBe(false);
		trace.push(`${event.type}:${event.matches}:${event.media}`);
	});
	resize(50, 40);
	resize(40, 40);
	expect(trace).toEqual([]);
	expect(list.matches).toBe(false);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["resize:40", "change:false:(min-width: 60px)"]);
	expect(saved?.currentTarget).toBeNull();
	expect(saved?.composedPath()).toEqual([]);
	expect(saved?.eventPhase).toBe(0);
	resize(30, 40);
	await vi.runAllTimersAsync();
	expect(trace.at(-1)).toBe("resize:30");
	expect(trace.filter((value) => value.startsWith("change"))).toHaveLength(1);
});

it("does not notify an unchanged viewport or a round-trip before the rendering opportunity", async () => {
	const { query, resize, window, bindings } = fixture();
	const changed = vi.fn();
	query("(min-width:60px)").addListener(changed);
	window.onresize = changed;
	resize(80, 40);
	expect(bindings.media.metrics().queued).toBe(false);
	resize(20, 40);
	resize(80, 40);
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
});

it("preserves creation order, handler insertion order and replacement without duplicate callbacks", async () => {
	const { query, resize } = fixture();
	const first = query("(min-width:60px)");
	const second = query("(min-width:60px)");
	const trace: string[] = [];
	first.onchange = () => trace.push("old");
	const ordinary = () => {
		trace.push("ordinary");
	};
	first.addListener(ordinary);
	first.addEventListener("change", ordinary);
	first.onchange = () => trace.push("replacement");
	second.addListener(() => trace.push("second"));
	resize(20, 40);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["replacement", "ordinary", "second"]);
	first.removeListener(ordinary);
	first.onchange = null;
	resize(80, 40);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["replacement", "ordinary", "second", "second"]);
});

it("keeps handler registration separate from ordinary registration of the same callback", async () => {
	const { query, resize } = fixture();
	const list = query("(min-width:60px)");
	const listener = vi.fn();
	list.onchange = listener;
	list.addListener(listener);
	list.removeListener(listener);
	resize(20, 40);
	await vi.runAllTimersAsync();
	expect(listener).toHaveBeenCalledTimes(1);
	expect(list.onchange).toBe(listener);
});

it("supports capture, once, removal during dispatch and propagation control through the existing dispatcher", async () => {
	const { query, resize } = fixture();
	const list = query("(min-width:60px)");
	const trace: string[] = [];
	const removed = () => {
		trace.push("removed");
	};
	list.addListener(removed);
	list.addEventListener(
		"change",
		() => {
			trace.push("capture");
			list.removeListener(removed);
		},
		{ capture: true, once: true },
	);
	list.addEventListener(
		"change",
		(event) => {
			trace.push("once");
			event.stopImmediatePropagation();
		},
		{ once: true },
	);
	list.addListener(() => trace.push("last"));
	resize(20, 40);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["capture", "once"]);
	resize(80, 40);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["capture", "once", "last"]);
});

it("isolates ordinary listener exceptions and does not bubble media changes to Window", async () => {
	const { query, resize, window, interactions, lifecycle } = fixture();
	const list = query("(min-width:60px)");
	const reached = vi.fn();
	window.addEventListener("change", reached);
	list.addListener(() => {
		throw new Error("ordinary failure");
	});
	list.addListener(reached);
	resize(20, 40);
	await vi.runAllTimersAsync();
	expect(reached).toHaveBeenCalledTimes(1);
	expect(interactions.events.drainErrors()).toHaveLength(1);
	expect(lifecycle.fail).not.toHaveBeenCalled();
});

it("reevaluates new lists and viewport changes made during resize callbacks", async () => {
	const { query, resize, window } = fixture();
	const early = query("(min-width:60px)");
	const earlyCalls = vi.fn();
	const lateCalls = vi.fn();
	early.addListener(earlyCalls);
	let count = 0;
	window.onresize = () => {
		if (++count !== 1) return;
		query("(min-width:60px)").addListener(lateCalls);
		resize(80, 40);
	};
	resize(20, 40);
	await vi.runAllTimersAsync();
	expect(count).toBe(2);
	expect(earlyCalls).not.toHaveBeenCalled();
	expect(lateCalls).toHaveBeenCalledTimes(1);
});

it("uses initial-font media units and portrait-inclusive square orientation in actual CSS painting", async () => {
	const { query, resize, document } = fixture(
		"<style>main{font-size:8px;background:red}@media (max-width:3em){main{background:blue}}@media (orientation:portrait){main{color:white}}</style><main>A</main>",
	);
	const size = query("(max-width:3em)");
	const orientation = query("(orientation:portrait)");
	resize(40, 40);
	expect(size.matches).toBe(true);
	expect(orientation.matches).toBe(true);
	const raster = rasterizeDocument(document).image;
	expect(Array.from(raster.pixels.slice(0, 4))).toEqual([0, 0, 255, 255]);
	await vi.runAllTimersAsync();
});

it("bounds list allocations and query text without growing the DOM", () => {
	const { query, document, bindings } = fixture();
	const before = document.nodeCount;
	expect(() =>
		query("x".repeat(pageMediaLimits.maxQueryCodeUnits + 1)),
	).toThrow("limit");
	for (let index = 0; index < pageMediaLimits.maxLists; index++)
		query("screen");
	expect(() => query("screen")).toThrow("limit");
	expect(bindings.media.metrics().lists).toBe(256);
	expect(document.nodeCount).toBe(before);
});

it("charges expanded serialized query text rather than only short invalid input", () => {
	const { query, bindings } = fixture();
	const source = Array.from({ length: 1000 }, () => "?").join(",");
	for (let index = 0; index < 7; index++) query(source);
	expect(() => query(source)).toThrow("text limit");
	expect(bindings.media.metrics().retainedCodeUnits).toBe(7 * 8998);
});

it("revokes saved capabilities, pending notifications, listeners and viewport subscriptions on close", async () => {
	const { query, bindings, resize, interactions, window } = fixture();
	const list = query("(min-width:60px)");
	const changed = vi.fn();
	list.onchange = changed;
	list.addListener(changed);
	resize(20, 40);
	bindings.close();
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
	expect(bindings.media.metrics()).toMatchObject({
		closed: true,
		queued: false,
		running: false,
		lists: 0,
		retainedCodeUnits: 0,
	});
	expect(interactions.events.metrics().listeners).toBe(0);
	for (const operation of [
		() => list.media,
		() => list.matches,
		() => list.onchange,
		() => list.addListener(changed),
		() => window.innerWidth,
		() => query("screen"),
	])
		expect(operation).toThrow("closed");
	resize(80, 40);
	expect(vi.getTimerCount()).toBe(0);
});

it("keeps independent native event targets detached, bounded, distinct and revocable", () => {
	const { document, interactions } = fixture();
	const events = interactions.events;
	const target = events.createIndependentTarget();
	const rootListener = vi.fn();
	const listener = vi.fn();
	events.addEventListener(document.root, "test", rootListener);
	events.addEventListener(target, "test", listener);
	events.dispatchEvent(target, new BrowserEvent("test", { bubbles: true }));
	expect(listener).toHaveBeenCalledTimes(1);
	expect(rootListener).not.toHaveBeenCalled();
	events.releaseIndependentTarget(target);
	expect(events.isIndependentTarget(target)).toBe(false);
	expect(() =>
		events.dispatchEvent(target, new BrowserEvent("test")),
	).toThrow();
	const next = events.createIndependentTarget();
	expect(next).not.toBe(target);
	for (let index = 2; index < 512; index++) events.createIndependentTarget();
	expect(() => events.createIndependentTarget()).toThrow("limit");
});

it("stops a repeated resize workload at the cumulative event quota and releases its listener graph", async () => {
	const { query, resize, bindings, lifecycle, interactions } = fixture();
	let callbacks = 0;
	for (let index = 0; index < pageMediaLimits.maxLists; index++)
		query("(min-width:60px)").addListener(() => {
			callbacks++;
		});
	for (let index = 0; index < 16; index++) {
		resize(index % 2 === 0 ? 20 : 80, 40);
		await vi.runAllTimersAsync();
	}
	expect(callbacks).toBe(4080);
	expect(bindings.media.metrics()).toMatchObject({
		eventsDelivered: 4096,
		closed: true,
		lists: 0,
		retainedCodeUnits: 0,
		queued: false,
		running: false,
	});
	expect(lifecycle.fail).toHaveBeenCalledTimes(1);
	expect(interactions.events.metrics().listeners).toBe(0);
});

it("bounds native viewport subscriptions and unregisters without delivering further updates", () => {
	const { styles, resize } = fixture();
	const listener = vi.fn();
	const unregister = styles.onViewportChange(listener);
	for (let index = 0; index < 14; index++) styles.onViewportChange(() => {});
	expect(() => styles.onViewportChange(() => {})).toThrow("limit");
	resize(20, 40);
	expect(listener).toHaveBeenCalledTimes(1);
	unregister();
	resize(80, 40);
	expect(listener).toHaveBeenCalledTimes(1);
});
