import { afterEach, expect, it, vi } from "vitest";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { type BrowserEvent, DocumentEvents } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { PageScroll, pageScrollLimits } from "./page-scroll.js";
import { RootScroll } from "./root-scroll.js";
import { ScriptDom, type ScriptHostObjectFactory } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface ElementView {
	scrollTop: number;
	scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;
	scroll(...args: unknown[]): Promise<void>;
	scrollTo(...args: unknown[]): Promise<void>;
	scrollBy(...args: unknown[]): Promise<void>;
}
interface DocumentView {
	documentElement: ElementView;
	getElementById(id: string): ElementView;
}

const trees: DocumentTree[] = [];
const factory: ScriptHostObjectFactory = {
	createHostObject(definition) {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		return target;
	},
};

function box(name: string, overflow = "hidden") {
	return `<div id="${name}" style="width:80px;height:40px;overflow:${overflow}"><div style="width:200px;height:180px"></div></div>`;
}

function fixture(content = box("box") + box("other")) {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}</style>${content}<div style="width:300px;height:400px"></div>`,
		"https://fixture.invalid/overflow-host",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const events = new DocumentEvents(tree, {}, { window: true });
	let busy = false;
	const fail = vi.fn();
	const scrolling = new PageScroll(tree, events, () => busy, fail);
	const request = (position: Parameters<PageScroll["requestPosition"]>[0]) => {
		void scrolling.requestPosition(position);
	};
	const native = new RootScroll(tree, request);
	const dom = new ScriptDom(
		tree,
		factory,
		undefined,
		undefined,
		undefined,
		request,
	);
	const document = dom.document as DocumentView;
	const queries = new DocumentQueries(tree);
	const id = (name: string) => {
		const target = queries.querySelector(`#${name}`);
		if (target === null) throw new Error(`Missing ${name}`);
		return target;
	};
	return {
		tree,
		events,
		fail,
		scrolling,
		native,
		dom,
		document,
		id,
		element: (name = "box") => document.getElementById(name),
		busy: (value: boolean) => {
			busy = value;
		},
	};
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

it.each(["hidden", "auto", "scroll"])(
	"routes %s element setters through the host and clamps both axes",
	(overflow) => {
		const { tree, element, id, scrolling } = fixture(box("box", overflow));
		const target = element();
		target.scrollLeft = 12.5;
		target.scrollTop = 24.5;
		expect(documentElementScroll(tree).get(id("box"))).toMatchObject({
			scrollLeft: 12.5,
			scrollTop: 24.5,
			scrollWidth: 200,
			scrollHeight: 180,
		});
		target.scrollLeft = 1e300;
		target.scrollTop = 1e300;
		expect([target.scrollLeft, target.scrollTop]).toEqual([120, 140]);
		expect(scrolling.metrics()).toMatchObject({ requests: 4, pending: true });
	},
);

it.each(["visible", "clip"])(
	"keeps %s overflow setters and methods hostless no-ops",
	async (overflow) => {
		const { tree, id, element, scrolling } = fixture(box("box", overflow));
		const hostless = new RootScroll(tree);
		hostless.set(id("box"), "scrollTop", 30);
		await hostless.scroll(id("box"), false, [20, 30]);
		element().scrollLeft = 20;
		await element().scrollBy(20, 30);
		expect([element().scrollLeft, element().scrollTop]).toEqual([0, 0]);
		expect(scrolling.metrics()).toMatchObject({ requests: 0, pending: false });
	},
);

it.each([
	["hidden", "clip", 20, 0],
	["clip", "hidden", 0, 30],
] as const)(
	"preserves the mixed %s/%s axis profile",
	async (horizontal, vertical, left, top) => {
		const { element } = fixture(
			`<div id="box" style="width:80px;height:40px;overflow-x:${horizontal};overflow-y:${vertical}"><div style="width:200px;height:180px"></div></div>`,
		);
		await element().scrollTo(20, 30);
		expect([element().scrollLeft, element().scrollTop]).toEqual([left, top]);
	},
);

it.each([
	["24.5", 24.5],
	[true, 1],
	[null, 0],
	[undefined, 0],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[-20, 0],
] as const)("normalizes element setter input %s", (value, expected) => {
	const { element } = fixture();
	const target = element();
	target.scrollLeft = 10;
	target.scrollTop = 20;
	Reflect.set(target, "scrollTop", value);
	expect([target.scrollLeft, target.scrollTop]).toEqual([10, expected]);
});

it.each(["scroll", "scrollTo", "scrollBy"] as const)(
	"exposes %s with immediate updates and a resolved completion promise",
	async (method) => {
		const { element, events, id } = fixture();
		const target = element();
		target.scrollLeft = 5;
		target.scrollTop = 6;
		const listener = vi.fn();
		events.addEventListener(id("box"), "scroll", listener);
		const completion = target[method](10, 20);
		expect(completion).toBeInstanceOf(Promise);
		expect([target.scrollLeft, target.scrollTop]).toEqual(
			method === "scrollBy" ? [15, 26] : [10, 20],
		);
		await completion;
		expect(listener).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(listener).toHaveBeenCalledOnce();
	},
);

it("preserves omitted axes and distinguishes missing options from two undefined coordinates", async () => {
	const { element } = fixture();
	const target = element();
	await target.scrollTo(10, 20);
	await target.scrollTo({ top: 30, behavior: "instant" });
	await target.scrollTo();
	await target.scrollTo(null);
	await target.scrollBy({ left: 5, behavior: "auto" });
	expect([target.scrollLeft, target.scrollTop]).toEqual([15, 30]);
	await target.scrollTo(undefined, undefined);
	expect([target.scrollLeft, target.scrollTop]).toEqual([0, 0]);
});

it("clamps large relative element movement without overflowing layout coordinates", async () => {
	const { element } = fixture();
	await element().scrollBy(1e300, 1e300);
	expect([element().scrollLeft, element().scrollTop]).toEqual([120, 140]);
	await element().scrollBy(-1e300, -1e300);
	expect([element().scrollLeft, element().scrollTop]).toEqual([0, 0]);
});

it("rejects unsupported behaviors and dictionaries without moving either axis", () => {
	const { element } = fixture();
	for (const behavior of ["smooth", "unknown", null, false])
		expect(() => element().scrollTo({ left: 10, top: 20, behavior })).toThrow();
	for (const options of [1, true, "10", []])
		expect(() => element().scrollTo(options)).toThrow("dictionary");
	expect([element().scrollLeft, element().scrollTop]).toEqual([0, 0]);
});

it("does not run option accessors or accept inherited options", () => {
	const { element } = fixture();
	const getter = vi.fn(() => 20);
	expect(() =>
		element().scrollTo(Object.defineProperty({}, "top", { get: getter })),
	).toThrow("accessors");
	expect(() => element().scrollTo(Object.create({ top: 20 }))).toThrow(
		"Inherited",
	);
	expect(getter).not.toHaveBeenCalled();
});

it("rejects coordinate coercion before partial mutation", () => {
	const { element } = fixture();
	for (const value of [{}, [], () => 1, 1n, Symbol("coordinate")]) {
		expect(() => element().scrollTo(10, value)).toThrow();
		expect(() => Reflect.set(element(), "scrollTop", value)).toThrow();
	}
	expect([element().scrollLeft, element().scrollTop]).toEqual([0, 0]);
});

it("ignores internal target and elements keys in public Window and Element dictionaries", async () => {
	const { tree, scrolling, element } = fixture();
	const getter = vi.fn(() => {
		throw new Error("Unknown option read");
	});
	const options = Object.defineProperties(
		{ top: 20 },
		{
			target: { get: getter },
			elements: { get: getter },
		},
	);
	await scrolling.methods.scrollTo(options);
	expect(documentScroll(tree).get().y).toBe(20);
	expect(element().scrollTop).toBe(0);
	await element().scrollTo(options);
	expect(element().scrollTop).toBe(20);
	expect(getter).not.toHaveBeenCalled();
});

it("does not smuggle actual element plans through public Window dictionaries", async () => {
	const { scrolling, element, id, tree } = fixture();
	await scrolling.methods.scrollTo({
		target: id("box"),
		top: 20,
		elements: [{ target: id("other"), left: 20, top: 30 }],
	});
	expect(documentScroll(tree).get().y).toBe(20);
	expect([element().scrollTop, element("other").scrollTop]).toEqual([0, 0]);
});

it("requires a host only for genuine nonroot changes", async () => {
	const { tree, id } = fixture();
	const hostless = new RootScroll(tree);
	hostless.set(id("box"), "scrollTop", 0);
	await hostless.scroll(id("box"), false, []);
	expect(() => hostless.set(id("box"), "scrollTop", 10)).toThrow("host port");
	expect(() => hostless.scroll(id("box"), true, [0, 10])).toThrow("host port");
	expect(hostless.get(id("box"), "scrollTop")).toBe(0);
});

it.each([
	box("box").replace("overflow:hidden", "overflow:hidden;display:none"),
	box("box").replace("overflow:hidden", "overflow:hidden;display:contents"),
	"<span id=box style=overflow:hidden>text</span>",
])("keeps nonbox element scrolling inert: %s", async (content) => {
	const { element, scrolling } = fixture(content);
	element().scrollTop = 20;
	await element().scrollTo(10, 20);
	expect([element().scrollLeft, element().scrollTop]).toEqual([0, 0]);
	expect(scrolling.metrics().pending).toBe(false);
});

it("keeps detached targets zero and skips their queued notifications", async () => {
	const { tree, id, element, events, scrolling, fail } = fixture();
	const targetId = id("box");
	const target = element();
	const listener = vi.fn();
	events.addEventListener(targetId, "scroll", listener);
	target.scrollTop = 20;
	tree.remove(targetId);
	await target.scrollTo(30, 40);
	await scrolling.requestPosition({ target: targetId, top: 50 });
	expect([target.scrollLeft, target.scrollTop]).toEqual([0, 0]);
	await vi.runAllTimersAsync();
	expect(listener).not.toHaveBeenCalled();
	expect(fail).not.toHaveBeenCalled();
	expect(scrolling.metrics()).toMatchObject({ pending: false, events: 0 });
});

it("retains explicit unsupported control metrics and rejects non-elements", () => {
	const { tree, element, native } = fixture("<textarea id=box>text</textarea>");
	expect(() => element().scrollTop).toThrow("Control scroll metrics");
	expect(() => element().scrollTo(10, 20)).toThrow("Control scroll metrics");
	expect(() => native.scroll(tree.root, false, [0, 10])).toThrow("element");
});

it("shares root aliases, Window requests and document notifications", async () => {
	const { tree, document, native, scrolling, events } = fixture();
	const listener = vi.fn();
	events.addEventListener(tree.root, "scroll", listener);
	await document.documentElement.scrollTo(10, 20);
	await document.documentElement.scrollBy({ top: 5 });
	await scrolling.requestPosition({
		target: native.element() as number,
		top: 30,
	});
	await scrolling.methods.scrollBy(5, 10);
	expect(documentScroll(tree).get()).toEqual({ x: 15, y: 40 });
	expect(document.documentElement.scrollTop).toBe(40);
	await vi.runAllTimersAsync();
	expect(listener).toHaveBeenCalledOnce();
	expect(listener.mock.calls[0][0].bubbles).toBe(true);
});

it("coalesces each changed target in first-change order without element bubbling", async () => {
	const { tree, element, id, events, scrolling } = fixture();
	const order: number[] = [];
	const received: BrowserEvent[] = [];
	for (const target of [id("box"), id("other"), tree.root])
		events.addEventListener(target, "scroll", (event) => {
			order.push(target);
			received.push(event);
		});
	element().scrollTop = 20;
	element("other").scrollTop = 30;
	element().scrollTop = 0;
	await scrolling.methods.scrollTo(0, 20);
	element("other").scrollTop = 40;
	await vi.runAllTimersAsync();
	expect(order).toEqual([id("box"), id("other"), tree.root]);
	expect(received).toEqual(
		order.map((target) =>
			expect.objectContaining({
				target,
				bubbles: target === tree.root,
				cancelable: false,
				composed: false,
				isTrusted: false,
			}),
		),
	);
	expect(scrolling.metrics()).toMatchObject({ events: 3, pending: false });
});

it("applies an internal inner-to-outer plan before optional viewport movement", async () => {
	const { tree, id, scrolling, events } = fixture(
		"<div id=outer style=width:90px;height:60px;overflow:hidden><div id=inner style=width:160px;height:120px;overflow:hidden><div style=width:300px;height:300px></div></div></div>",
	);
	const order: number[] = [];
	for (const target of [id("inner"), id("outer"), tree.root])
		events.addEventListener(target, "scroll", () => order.push(target));
	await scrolling.requestPosition({
		elements: [
			{ target: id("inner"), left: 10, top: 20 },
			{ target: id("outer"), left: 15, top: 25 },
		],
		left: 5,
		top: 30,
	});
	expect(documentElementScroll(tree).get(id("inner")).scrollTop).toBe(20);
	expect(documentElementScroll(tree).get(id("outer")).scrollTop).toBe(25);
	expect(documentScroll(tree).get()).toEqual({ x: 5, y: 30 });
	expect(scrolling.metrics().requests).toBe(3);
	await vi.runAllTimersAsync();
	expect(order).toEqual([id("inner"), id("outer"), tree.root]);
});

it("does not update the viewport for an element-only plan", async () => {
	const { tree, id, scrolling } = fixture();
	const updates = documentScroll(tree).metrics().updates;
	await scrolling.requestPosition({
		elements: [{ target: id("box"), left: 10, top: 20 }],
	});
	expect(documentScroll(tree).metrics().updates).toBe(updates);
	expect(scrolling.metrics().requests).toBe(1);
});

it.each([false, true])(
	"defers element notifications across busy state, queued=%s",
	async (queued) => {
		const { element, events, id, scrolling, busy } = fixture();
		const listener = vi.fn();
		events.addEventListener(id("box"), "scroll", listener);
		if (!queued) busy(true);
		element().scrollTop = 20;
		busy(true);
		await vi.runAllTimersAsync();
		expect(listener).not.toHaveBeenCalled();
		expect(scrolling.metrics()).toMatchObject({ pending: true, queued: false });
		busy(false);
		scrolling.wake();
		await vi.runAllTimersAsync();
		expect(listener).toHaveBeenCalledOnce();
	},
);

it("places listener-triggered movement behind already pending targets", async () => {
	const { element, events, id } = fixture();
	const order: string[] = [];
	events.addEventListener(id("box"), "scroll", () => {
		order.push("box");
		if (element().scrollTop === 20) element().scrollTop = 30;
	});
	events.addEventListener(id("other"), "scroll", () => order.push("other"));
	element().scrollTop = 20;
	element("other").scrollTop = 20;
	await vi.runAllTimersAsync();
	expect(order).toEqual(["box", "other", "box"]);
});

it("safely drops a target detached by an earlier scroll listener", async () => {
	const { tree, element, events, id, fail, scrolling } = fixture();
	const other = id("other");
	const listener = vi.fn();
	events.addEventListener(id("box"), "scroll", () => tree.remove(other));
	events.addEventListener(other, "scroll", listener);
	element().scrollTop = 20;
	element("other").scrollTop = 20;
	await vi.runAllTimersAsync();
	expect(listener).not.toHaveBeenCalled();
	expect(fail).not.toHaveBeenCalled();
	expect(scrolling.metrics()).toMatchObject({ events: 1, pending: false });
});

it("bounds internal no-op requests using the unchanged public request limit", async () => {
	const { id, scrolling } = fixture();
	const target = id("box");
	for (let request = 0; request < pageScrollLimits.maxRequests; request++)
		void scrolling.requestPosition({ target, left: 0, top: 0 });
	expect(() => scrolling.requestPosition({ target, top: 20 })).toThrow(
		"request limit",
	);
	await vi.runAllTimersAsync();
	expect(scrolling.metrics()).toMatchObject({
		events: 0,
		pending: false,
		limits: pageScrollLimits,
	});
});

it("reserves a whole plan against request limits before applying its first operation", () => {
	const { id, scrolling, element } = fixture();
	const target = id("box");
	const elements = Array.from(
		{ length: pageScrollLimits.maxRequests + 1 },
		() => ({ target, left: 10, top: 20 }),
	);
	expect(() => scrolling.requestPosition({ elements })).toThrow(
		"request limit",
	);
	expect(element().scrollTop).toBe(0);
	expect(scrolling.metrics().pending).toBe(false);
});

it("counts an empty internal plan without creating notifications", async () => {
	const { scrolling } = fixture();
	await scrolling.requestPosition({ elements: [] });
	expect(scrolling.metrics()).toMatchObject({
		requests: 1,
		events: 0,
		pending: false,
	});
});

it("cancels pending targets and revokes saved guest methods when closed", async () => {
	const { element, dom, scrolling, events, id } = fixture();
	const target = element();
	const saved = target.scrollTo;
	const listener = vi.fn();
	events.addEventListener(id("box"), "scroll", listener);
	await saved(10, 20);
	dom.close();
	scrolling.close();
	expect(() => saved(20, 30)).toThrow();
	expect(() => scrolling.requestPosition({ top: 30 })).toThrow("closed");
	await vi.runAllTimersAsync();
	expect(listener).not.toHaveBeenCalled();
	expect(scrolling.metrics()).toMatchObject({
		closed: true,
		pending: false,
		queued: false,
	});
});

it("cancels element notifications when the document closes", async () => {
	const { tree, element, scrolling, fail } = fixture();
	element().scrollTop = 20;
	tree.close();
	await vi.runAllTimersAsync();
	expect(fail).not.toHaveBeenCalled();
	expect(scrolling.metrics()).toMatchObject({
		closed: true,
		pending: false,
		queued: false,
	});
});

it("reports dispatcher failure and clears every pending target", async () => {
	const { element, events, scrolling, fail } = fixture();
	element().scrollTop = 20;
	element("other").scrollTop = 30;
	events.close();
	await vi.runAllTimersAsync();
	expect(fail).toHaveBeenCalledOnce();
	expect(scrolling.metrics()).toMatchObject({
		closed: true,
		pending: false,
		queued: false,
	});
});

it("publishes element method and metric descriptors through the guest host table", () => {
	const { element } = fixture();
	const target = element();
	for (const name of ["scroll", "scrollTo", "scrollBy"])
		expect(typeof Object.getOwnPropertyDescriptor(target, name)?.value).toBe(
			"function",
		);
	for (const name of ["scrollLeft", "scrollTop"]) {
		const descriptor = Object.getOwnPropertyDescriptor(target, name);
		expect(typeof descriptor?.get).toBe("function");
		expect(typeof descriptor?.set).toBe("function");
	}
	for (const name of ["scrollWidth", "scrollHeight"])
		expect(Object.getOwnPropertyDescriptor(target, name)?.set).toBeUndefined();
});

it("keeps template-owner element methods inert", async () => {
	const { dom, scrolling } = fixture();
	const document = dom.document as {
		createElement(name: string): {
			content: { ownerDocument: { createElement(name: string): ElementView } };
		};
	};
	const target = document
		.createElement("template")
		.content.ownerDocument.createElement("div");
	await target.scrollTo(10, 20);
	await target.scrollBy({ top: 30 });
	expect([target.scrollLeft, target.scrollTop]).toEqual([0, 0]);
	expect(scrolling.metrics().requests).toBe(0);
});
