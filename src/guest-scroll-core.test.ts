import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { PageRuntime, PageRuntimeFactory } from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface GuestElement {
	scrollTop: number;
	scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;
	readonly offsetParent: object | null;
	readonly offsetTop: number;
	readonly offsetLeft: number;
	scrollIntoView(options?: unknown): Promise<void>;
}
interface GuestWindow {
	scroll(...args: unknown[]): Promise<void>;
	scrollTo(...args: unknown[]): Promise<void>;
	scrollBy(...args: unknown[]): Promise<void>;
	readonly scrollX: number;
	readonly scrollY: number;
	readonly pageXOffset: number;
	readonly pageYOffset: number;
	onscroll: ((event: { target: object; currentTarget: object }) => void) | null;
}
interface GuestDocument {
	readonly scrollingElement: GuestElement;
	readonly documentElement: GuestElement;
	onscroll: GuestWindow["onscroll"];
}
const resources: { tree: DocumentTree; scripts: PageScripts }[] = [];
afterEach(async () => {
	for (const { tree, scripts } of resources.splice(0)) {
		await scripts.close();
		tree.close();
	}
	vi.useRealTimers();
});
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}
function fixture() {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0}main{position:relative;width:200px}#before{height:120px}#target{margin-left:120px;width:20px;height:20px;background:blue}#after{height:180px}</style><main><div id="before"></div><div id="target"></div><div id="after"></div></main>',
		"https://fixture.invalid/guest-scroll-core",
	);
	documentStyles(tree).setViewport(100, 80);
	const interactions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	let globals: Record<string, unknown> = {};
	let evaluate: () => unknown = () => undefined;
	let prefixCallback: unknown;
	let prefix: Promise<void> | undefined;
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			Object.assign(object, definition.methods);
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference() {},
	};
	const runtime: PageRuntime = {
		budget: { stepsUsed: 0, peakCallDepth: 0, peakDataSize: 0 },
		closed: false,
		async initialize() {},
		async evaluate() {
			await evaluate();
			return { ok: true };
		},
		copyResult: (value) => value,
		startCallback(callback, args, receiver) {
			if (typeof callback !== "function") throw new Error("Expected callback");
			return {
				synchronous:
					callback === prefixCallback && prefix ? prefix : Promise.resolve(),
				result: Promise.resolve(callback.apply(receiver.thisValue, args)),
			};
		},
		errorDetails: () => ({ code: "script-error" }),
		async close() {},
	};
	const factory: PageRuntimeFactory = {
		createPageRuntime(options) {
			globals = options.setup(context);
			return runtime;
		},
	};
	const scripts = new PageScripts({ document: tree, interactions }, factory);
	resources.push({ tree, scripts });
	return {
		tree,
		id,
		interactions,
		scripts,
		globals,
		window: scripts.window as GuestWindow,
		document: scripts.dom.document as GuestDocument,
		target: scripts.dom.node(id("#target")) as GuestElement,
		evaluate: (operation: () => unknown) => {
			evaluate = operation;
		},
		holdPrefix: (callback: unknown, completion: Promise<void>) => {
			prefixCallback = callback;
			prefix = completion;
		},
	};
}

it.each(["scroll", "scrollTo", "scrollBy"] as const)(
	"shares the %s global with Window and returns completion after updating position",
	async (method) => {
		const { window, globals, document } = fixture();
		expect(globals[method]).toBe(window[method]);
		const completion = window[method](40.5, 60.25);
		expect([window.scrollX, window.pageXOffset]).toEqual([40.5, 40.5]);
		expect([window.scrollY, window.pageYOffset]).toEqual([60.25, 60.25]);
		expect(document.scrollingElement).toBe(document.documentElement);
		expect(document.scrollingElement.scrollTop).toBe(60.25);
		await expect(completion).resolves.toBeUndefined();
	},
);

it("shares root setters, window movement and scroll-into-view through one notification queue", async () => {
	const { window, document, target, scripts } = fixture();
	const trace: string[] = [];
	document.onscroll = (event) => {
		expect(event.target).toBe(document);
		expect(event.currentTarget).toBe(document);
		trace.push(`document:${window.scrollY}`);
	};
	window.onscroll = (event) => {
		expect(event.target).toBe(document);
		expect(event.currentTarget).toBe(window);
		trace.push(`window:${window.scrollY}`);
	};
	document.scrollingElement.scrollTop = 10;
	void window.scrollBy({ top: 20 });
	await target.scrollIntoView({ block: "end", inline: "end" });
	expect([window.scrollX, window.scrollY]).toEqual([40, 60]);
	expect(trace).toEqual([]);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["document:60", "window:60"]);
	expect(scripts.metrics().scrolling).toMatchObject({
		requests: 3,
		events: 1,
		pending: false,
	});
});

it.each([
	["start", 100, 120],
	["center", 80, 90],
	["end", 40, 60],
	["nearest", 40, 60],
] as const)(
	"integrates %s alignment with guest offsets, native geometry and capture",
	async (alignment, left, top) => {
		const { tree, id, window, scripts, target } = fixture();
		await target.scrollIntoView({ block: alignment, inline: alignment });
		expect([window.scrollX, window.scrollY]).toEqual([left, top]);
		expect(target.offsetParent).toBe(scripts.dom.node(id("main")));
		expect([target.offsetLeft, target.offsetTop]).toEqual([120, 120]);
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#target")),
		).toMatchObject({ x: 120 - left, y: 120 - top });
		expect(rasterizeDocument(tree).clip).toEqual({
			x: left,
			y: top,
			width: 100,
			height: 80,
		});
	},
);

it("keeps scroll extents and offset properties readonly while allowing root positions", () => {
	const { window, document, target } = fixture();
	for (const name of ["scrollX", "scrollY", "pageXOffset", "pageYOffset"])
		expect(Reflect.set(window, name, 99)).toBe(false);
	for (const name of [
		"offsetParent",
		"offsetTop",
		"offsetLeft",
		"scrollWidth",
		"scrollHeight",
	])
		expect(Reflect.set(target, name, 99)).toBe(false);
	expect([
		document.scrollingElement.scrollWidth,
		document.scrollingElement.scrollHeight,
	]).toEqual([200, 320]);
	document.scrollingElement.scrollLeft = 25;
	expect(window.scrollX).toBe(25);
});

it("reclamps aliases and geometry after content shrink without inventing a new programmatic event", async () => {
	const { tree, id, target, window, document, scripts } = fixture();
	await window.scrollTo(100, 240);
	await vi.runAllTimersAsync();
	tree.setAttribute(id("#after"), "style", "display:none");
	expect(window.scrollY).toBe(60);
	expect(document.scrollingElement.scrollHeight).toBe(140);
	expect(target.offsetTop).toBe(120);
	await vi.runAllTimersAsync();
	expect(scripts.metrics().scrolling?.events).toBe(1);
});

it.each([false, true])(
	"defers scroll notification until source evaluation finishes, failure=%s",
	async (failure) => {
		const test = fixture();
		expect(typeof test.window.scrollTo).toBe("function");
		const entered = deferred();
		const completion = deferred();
		const trace: number[] = [];
		test.window.onscroll = () => {
			trace.push(test.window.scrollY);
		};
		test.evaluate(async () => {
			test.document.scrollingElement.scrollTop = 50;
			entered.resolve();
			await completion.promise;
			if (failure) throw new Error("Injected source failure");
		});
		const evaluation = test.scripts.evaluate("0");
		await entered.promise;
		await vi.advanceTimersByTimeAsync(0);
		expect(trace).toEqual([]);
		expect(test.scripts.metrics().scrolling).toMatchObject({
			pending: true,
			queued: false,
		});
		completion.resolve();
		expect((await evaluation).ok).toBe(!failure);
		await vi.advanceTimersByTimeAsync(0);
		expect(trace).toEqual([50]);
	},
);

it("wakes pending scrolling when a callback prefix ends even if its result ended earlier", async () => {
	const test = fixture();
	const prefix = deferred();
	const trace: number[] = [];
	test.window.onscroll = () => {
		trace.push(test.window.scrollY);
	};
	const callback = () => {
		test.document.scrollingElement.scrollTop = 70;
	};
	test.holdPrefix(callback, prefix.promise);
	test.scripts.timers.methods.setTimeout(callback, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.scripts.metrics().scrolling).toMatchObject({
		pending: true,
		queued: false,
	});
	expect(trace).toEqual([]);
	prefix.resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(trace).toEqual([70]);
});

it("does not block scroll tasks on an asynchronous callback result after its prefix completes", async () => {
	const test = fixture();
	const result = deferred();
	const trace: number[] = [];
	test.window.onscroll = () => {
		trace.push(test.window.scrollY);
	};
	test.scripts.timers.methods.setTimeout(async () => {
		test.document.scrollingElement.scrollTop = 70;
		await result.promise;
	}, 1);
	await vi.advanceTimersByTimeAsync(2);
	expect(trace).toEqual([70]);
	result.resolve();
});

it.each(["window", "root", "target"] as const)(
	"revokes retained %s scroll operations and queued events on close",
	async (source) => {
		const { window, document, target, scripts } = fixture();
		const notified = vi.fn();
		window.onscroll = notified;
		void window.scrollTo(20, 30);
		await scripts.close();
		const operation =
			source === "window"
				? () => window.scrollBy(1, 1)
				: source === "root"
					? () => {
							document.scrollingElement.scrollTop = 40;
						}
					: () => target.scrollIntoView();
		expect(operation).toThrow(/closed/);
		expect(() => target.offsetTop).toThrow(/closed/);
		await vi.runAllTimersAsync();
		expect(notified).not.toHaveBeenCalled();
		expect(scripts.metrics().scrolling).toMatchObject({
			closed: true,
			pending: false,
			queued: false,
		});
	},
);
