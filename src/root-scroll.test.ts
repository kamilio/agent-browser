import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
} from "./page-bindings.js";
import { pageScrollLimits } from "./page-scroll.js";
import { RootScroll } from "./root-scroll.js";
import { documentStyles } from "./styles.js";

interface Element {
	scrollIntoView(argument?: unknown): Promise<void>;
	scrollTop: number;
	scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;
}
interface Document {
	readonly scrollingElement: Element | null;
	readonly documentElement: Element | null;
	readonly body: Element;
	createElement(tag: string): Element;
}
const trees: DocumentTree[] = [];
function fixture(content = '<main style="width:160px;height:180px"></main>') {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}</style>${content}`,
		"https://fixture.invalid/root-scroll",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const interactions = documentInteractions(tree);
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
	const document = bindings.dom.document as Document;
	const root = document.scrollingElement;
	if (!root) throw new Error("Missing root fixture");
	return {
		tree,
		bindings,
		document,
		root,
		interactions,
		native: new RootScroll(tree),
		scroll: documentScroll(tree),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

it("shares the document-element identity and exposes viewport-based extents", () => {
	const { document, root } = fixture();
	expect(root).toBe(document.documentElement);
	expect(document.scrollingElement).toBe(root);
	expect([
		root.scrollWidth,
		root.scrollHeight,
		root.scrollLeft,
		root.scrollTop,
	]).toEqual([160, 180, 0, 0]);
});

it("updates both axes synchronously and coalesces setters with Window requests", async () => {
	const { tree, root, bindings, scroll, interactions, native } = fixture();
	const events: number[] = [];
	interactions.events.addEventListener(tree.root, "scroll", () =>
		events.push(root.scrollTop),
	);
	root.scrollLeft = 12.5;
	root.scrollTop = 40.25;
	expect(scroll.get()).toEqual({ x: 12.5, y: 40.25 });
	expect(
		documentGeometry(tree).getBoundingClientRect(native.element() as number).y,
	).toBe(-40.25);
	await bindings.scrolling.methods.scrollBy({ top: 5 });
	expect(events).toEqual([]);
	await vi.runAllTimersAsync();
	expect(events).toEqual([45.25]);
	expect([root.scrollWidth, root.scrollHeight]).toEqual([160, 180]);
});

it.each([
	undefined,
	null,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	"bad",
])(
	"normalizes %s on assignment to zero rather than treating it as omitted",
	(value) => {
		const { root } = fixture();
		root.scrollTop = 50;
		root.scrollLeft = 20;
		Reflect.set(root, "scrollTop", value);
		expect(root.scrollTop).toBe(0);
		expect(root.scrollLeft).toBe(20);
	},
);

it.each([
	["24.5", 24.5],
	[true, 1],
	[false, 0],
	[-100, 0],
	[1e300, 100],
] as const)(
	"converts and clamps primitive assignment %s",
	(value, expected) => {
		const { root } = fixture();
		Reflect.set(root, "scrollTop", value);
		expect(root.scrollTop).toBe(expected);
	},
);

it.each([{}, [], () => 1, 1n, Symbol("position")])(
	"rejects unsupported coercion %s without mutation",
	(value) => {
		const { root } = fixture();
		expect(() => Reflect.set(root, "scrollTop", value)).toThrow();
		expect(root.scrollTop).toBe(0);
	},
);

it("keeps extents at least as large as the viewport and reflects resize", () => {
	const { tree, root } = fixture(
		'<main style="width:10px;height:20px"></main>',
	);
	expect([root.scrollWidth, root.scrollHeight]).toEqual([100, 80]);
	documentStyles(tree).setViewport(200, 150);
	expect([root.scrollWidth, root.scrollHeight]).toEqual([200, 150]);
});

it("reports integer extents but preserves fractional scroll positions", () => {
	const { root } = fixture(
		'<main style="width:160.4px;height:180.6px"></main>',
	);
	expect([root.scrollWidth, root.scrollHeight]).toEqual([160, 181]);
	root.scrollLeft = 3.25;
	root.scrollTop = 12.5;
	expect([root.scrollLeft, root.scrollTop]).toEqual([3.25, 12.5]);
});

it("makes dimensions readonly instead of updating an expando", () => {
	const { root } = fixture();
	expect(Reflect.set(root, "scrollWidth", 999)).toBe(false);
	expect(Reflect.set(root, "scrollHeight", 999)).toBe(false);
	expect(root.scrollWidth).toBe(160);
});

it("keeps document.scrollingElement readonly", () => {
	const { document, root } = fixture();
	expect(Reflect.set(document, "scrollingElement", null)).toBe(false);
	expect(document.scrollingElement).toBe(root);
});

it("reflects layout growth and clamps position after shrink without changing ownership", () => {
	const { tree, root, native, document } = fixture();
	const id = native.element();
	if (id === null) throw new Error("Missing root");
	tree.setAttribute(id, "style", "height:500px");
	expect(root.scrollHeight).toBe(500);
	root.scrollTop = 400;
	tree.setAttribute(id, "style", "height:180px");
	expect(root.scrollHeight).toBe(180);
	expect(root.scrollTop).toBe(100);
	expect(document.scrollingElement).toBe(root);
});

it("does not invent root geometry when layout requires an unsupported feature", () => {
	const { root } = fixture(
		'<main style="position:sticky;height:180px"></main>',
	);
	expect(() => root.scrollHeight).toThrow();
	expect(() => {
		root.scrollTop = 40;
	}).toThrow();
});

it.each(["scrollTop", "scrollLeft", "scrollWidth", "scrollHeight"] as const)(
	"measures connected non-root %s without aliasing body to Window",
	(property) => {
		const { document, root } = fixture();
		const expected = {
			scrollTop: 0,
			scrollLeft: 0,
			scrollWidth: 160,
			scrollHeight: 180,
		};
		expect(document.body[property]).toBe(expected[property]);
		if (property === "scrollTop" || property === "scrollLeft")
			Reflect.set(document.body, property, 10);
		expect(document.body[property]).toBe(expected[property]);
		expect(root.scrollTop).toBe(0);
	},
);

it("returns zero for detached elements and does not scroll on their assignment", () => {
	const { document, root } = fixture();
	const detached = document.createElement("div");
	detached.scrollTop = 10;
	expect([
		detached.scrollTop,
		detached.scrollLeft,
		detached.scrollWidth,
		detached.scrollHeight,
	]).toEqual([0, 0, 0, 0]);
	expect(root.scrollTop).toBe(0);
});

it("follows root removal and replacement without retaining an old scrolling element", () => {
	const { tree, document, root, native } = fixture();
	const old = native.element();
	if (old === null) throw new Error("Missing root");
	tree.remove(old);
	expect(document.scrollingElement).toBe(null);
	expect(root.scrollHeight).toBe(0);
	root.scrollTop = 40;
	const replacement = tree.createElement("html");
	tree.append(tree.root, replacement);
	expect(document.scrollingElement).toBe(document.documentElement);
	expect(document.scrollingElement).not.toBe(root);
	expect(document.scrollingElement?.scrollHeight).toBe(80);
});

it("shares source request bounds and does not queue events for no-op setters", () => {
	const { root, bindings } = fixture();
	for (let request = 0; request < pageScrollLimits.maxRequests; request++)
		root.scrollTop = 0;
	expect(bindings.scrolling.metrics()).toMatchObject({
		pending: false,
		queued: false,
		requests: pageScrollLimits.maxRequests,
	});
	expect(() => {
		root.scrollLeft = 1;
	}).toThrow(/request limit/);
	expect(root.scrollLeft).toBe(0);
});

it("requires an injected host port for standalone setters", () => {
	const { native } = fixture();
	expect(() => native.set(native.element() as number, "scrollTop", 10)).toThrow(
		/host port/,
	);
});

it("has no root for an empty document and rejects non-elements", () => {
	const tree = new DocumentTree("https://fixture.invalid/empty");
	trees.push(tree);
	const scroll = new RootScroll(tree);
	expect(scroll.element()).toBe(null);
	expect(() => scroll.get(tree.root, "scrollTop")).toThrow(/element/);
});

it("revokes saved guest properties and pending tasks when the page closes", async () => {
	const { root, document, bindings } = fixture();
	root.scrollTop = 20;
	bindings.close();
	expect(() => root.scrollTop).toThrow();
	expect(() => {
		root.scrollTop = 30;
	}).toThrow();
	expect(() => document.scrollingElement).toThrow();
	expect(() => root.scrollIntoView()).toThrow();
	await vi.runAllTimersAsync();
	expect(bindings.scrolling.metrics()).toMatchObject({
		closed: true,
		pending: false,
		queued: false,
	});
});
