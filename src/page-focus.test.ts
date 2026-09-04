import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import { DocumentTree } from "./document.js";
import { runEventAction, runEventActionAsync } from "./event-actions.js";
import { controlledEventListener } from "./events.js";
import { BrowserFocusEvent } from "./focus.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageFocus,
	pageFocusCapabilities,
	pageFocusOptions,
} from "./page-focus.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content = '<input id="target">') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{width:400px;height:600px}#before{height:160px}#target{display:block;margin-left:150px;width:20px;height:20px}#after{height:320px}</style><main><button id="first">First</button><div id="before"></div>${content}<button id="last">Last</button><div id="after"></div></main>`,
		"https://fixture.invalid/focus-options",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	const target = id("#target");
	const first = id("#first");
	const last = id("#last");
	return {
		tree,
		actions,
		queries,
		target,
		first,
		last,
		focus: actions.focus,
		events: actions.events,
		scroll: documentScroll(tree),
		page: new PageFocus(actions.focus),
	};
}

it.each([false, true])(
	"owns ordered focus/blur events, async=%s",
	async (asynchronous) => {
		const { tree, focus, events, first, target } = fixture();
		const seen: unknown[] = [];
		for (const node of [first, target])
			for (const type of ["focus", "focusin", "blur", "focusout"])
				events.addEventListener(node, type, (event) => {
					expect(event).toBeInstanceOf(BrowserFocusEvent);
					seen.push([
						node,
						type,
						(event as BrowserFocusEvent).relatedTarget,
						tree.activeElement,
					]);
				});
		const run = (id: number) =>
			asynchronous
				? focus.focusElementAsync(id, { preventScroll: true })
				: focus.focusElement(id, { preventScroll: true });
		expect(await run(first)).toBeUndefined();
		expect(await run(target)).toBeUndefined();
		if (asynchronous) await focus.blurElementAsync(target);
		else focus.blurElement(target);
		expect(seen).toEqual([
			[first, "focus", null, first],
			[first, "focusin", null, first],
			[first, "blur", target, null],
			[first, "focusout", target, null],
			[target, "focus", first, target],
			[target, "focusin", first, target],
			[target, "blur", null, null],
			[target, "focusout", null, null],
		]);
		expect(focus.active()).toBeNull();
	},
);

it("centers focus using the shared root scroll and preserves native agent defaults", () => {
	const { tree, focus, events, target, scroll } = fixture();
	focus.focus(tree.reference(target));
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	const before = documentGeometry(tree).getBoundingClientRect(target);
	const order: string[] = [];
	events.addEventListener(tree.root, "scroll", () => order.push("scroll"));
	events.addEventListener(target, "focus", () => order.push("focus"));
	focus.blurElement(target);
	focus.focusElement(target);
	expect(scroll.get()).toEqual({
		x: before.left + before.width / 2 - 50,
		y: before.top + before.height / 2 - 40,
	});
	expect(order).toEqual(["focus", "scroll"]);
	const after = documentGeometry(tree).getBoundingClientRect(target);
	expect(after.left + after.width / 2).toBe(50);
	expect(after.top + after.height / 2).toBe(40);
});

it("applies same-target options without refocusing or losing edited baselines", () => {
	const { tree, actions, focus, events, target, scroll } = fixture();
	const seen: string[] = [];
	for (const type of ["focus", "focusin", "change", "blur", "focusout"])
		events.addEventListener(target, type, () => seen.push(type));
	actions.fill(tree.reference(target), "changed");
	seen.length = 0;
	focus.focusElement(target, { preventScroll: true, focusVisible: false });
	expect(tree.focusIndicated).toBe(false);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	focus.focusElement(target, { focusVisible: true });
	expect(tree.focusIndicated).toBe(true);
	expect(scroll.get().y).toBeGreaterThan(0);
	expect(seen).toEqual([]);
	focus.blurElement(target);
	expect(seen).toEqual(["change", "blur", "focusout"]);
});

it.each([
	'<input id="target">',
	'<textarea id="target"></textarea>',
	'<div id="target" contenteditable="true">Editable</div>',
])("explicit false overrides keyboard-entry inference for %s", (content) => {
	const { tree, focus, queries, target } = fixture(content);
	focus.focusElement(target, { preventScroll: true, focusVisible: false });
	expect(queries.querySelector(":focus")).toBe(target);
	expect(queries.querySelector(":focus-visible")).toBeNull();
	const revision = tree.revision;
	focus.focusElement(target, { preventScroll: true, focusVisible: false });
	expect(tree.revision).toBe(revision);
	tree.recordInputModality("pointer");
	expect(queries.querySelector(":focus-visible")).toBe(target);
	focus.focusElement(target, { preventScroll: true, focusVisible: false });
	tree.recordInputModality("keyboard");
	expect(queries.querySelector(":focus-visible")).toBe(target);
});

it("expires explicit indication on modality and focus identity changes", () => {
	const { tree, focus, first, last } = fixture();
	tree.recordInputModality("pointer");
	focus.focusElement(first, { preventScroll: true, focusVisible: true });
	expect(tree.focusIndicated).toBe(true);
	tree.recordInputModality("pointer");
	expect(tree.focusIndicated).toBe(false);
	tree.recordInputModality("keyboard");
	expect(tree.focusIndicated).toBe(true);
	focus.focusElement(first, { preventScroll: true, focusVisible: false });
	focus.focusElement(last, { preventScroll: true });
	expect(tree.focusIndicated).toBe(false);
	focus.blurElement(last);
	focus.focusElement(first, { preventScroll: true });
	expect(tree.focusIndicated).toBe(true);
});

it.each([
	["same-target", false],
	["same-target", true],
	["round-trip", false],
	["round-trip", true],
] as const)(
	"does not scroll stale focus after indication causes %s, port=%s",
	(kind, port) => {
		const { tree, focus, events, first, target, scroll } = fixture();
		focus.focusElement(target, { preventScroll: true, focusVisible: false });
		let entered = false;
		const positions: unknown[] = [];
		tree.onChange((change) => {
			if (change.kind !== "focus-indication" || entered) return;
			entered = true;
			if (kind === "same-target")
				focus.focusElement(target, {
					preventScroll: true,
					focusVisible: false,
				});
			else {
				focus.focus(tree.reference(first));
				focus.focus(tree.reference(target));
			}
		});
		runEventAction(
			events,
			focus.focusElementAction(
				target,
				{ focusVisible: true },
				port
					? (position) => {
							positions.push(position);
						}
					: undefined,
			),
		);
		expect(entered).toBe(true);
		expect(focus.active()).toBe(target);
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
		expect(positions).toEqual([]);
	},
);

it.each([
	'<div id="target"></div>',
	'<input id="target" disabled>',
	'<input id="target" type="hidden">',
	'<button id="target" hidden></button>',
	'<div inert><button id="target"></button></div>',
	'<button id="target" style="display:none"></button>',
	'<button id="target" style="visibility:hidden"></button>',
	'<fieldset disabled><input id="target"></fieldset>',
])("unfocusable elements are no-ops: %s", (content) => {
	const { tree, focus, first, target, scroll } = fixture(content);
	focus.focusElement(first, { preventScroll: true });
	const revision = tree.revision;
	focus.focusElement(target, { focusVisible: false });
	focus.blurElement(target);
	expect(tree.revision).toBe(revision);
	expect(focus.active()).toBe(first);
	expect(scroll.metrics()).toMatchObject({ x: 0, y: 0, updates: 0, builds: 0 });
	expect(() => focus.focus(tree.reference(target))).toThrow(
		/cannot receive focus/,
	);
});

it("treats detached receivers as no-ops and accepts negative tabindex", () => {
	const { tree, focus, first, target } = fixture(
		'<div id="target" tabindex="-1"></div>',
	);
	focus.focusElement(target, { preventScroll: true });
	expect(focus.active()).toBe(target);
	focus.focusElement(first, { preventScroll: true });
	tree.remove(target);
	focus.focusElement(target);
	focus.blurElement(target);
	expect(focus.active()).toBe(first);
});

it.each(["blur", "focusout"])("abandons a target removed during %s", (type) => {
	const { tree, focus, events, first, target, scroll } = fixture();
	focus.focusElement(first, { preventScroll: true });
	events.addEventListener(first, type, () => tree.remove(target));
	expect(() => focus.focusElement(target)).not.toThrow();
	expect(focus.active()).toBeNull();
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it.each(["blur", "focusout", "focus", "focusin"])(
	"reentrant %s focus wins without stale options or scroll",
	(type) => {
		const { tree, focus, events, first, target, last, scroll } = fixture();
		focus.focusElement(first, { preventScroll: true });
		events.addEventListener(
			type.startsWith("blur") || type === "focusout" ? first : target,
			type,
			() => {
				focus.focusElement(last, { preventScroll: true, focusVisible: false });
			},
		);
		focus.focusElement(target, { focusVisible: true });
		expect(focus.active()).toBe(last);
		expect(tree.focusIndicated).toBe(false);
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it("nested same-target options supersede an in-flight outer request", () => {
	const { tree, focus, events, target, scroll } = fixture();
	let focusIn = 0;
	events.addEventListener(target, "focus", () =>
		focus.focusElement(target, { preventScroll: true, focusVisible: false }),
	);
	events.addEventListener(target, "focusin", () => focusIn++);
	focus.focusElement(target, { focusVisible: true });
	expect(focus.active()).toBe(target);
	expect(tree.focusIndicated).toBe(false);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	expect(focusIn).toBe(1);
});

it("a nested blur prevents stale focusin and scroll", () => {
	const { focus, events, target, scroll } = fixture();
	let focusIn = 0;
	events.addEventListener(target, "focus", () => focus.blurElement(target));
	events.addEventListener(target, "focusin", () => focusIn++);
	focus.focusElement(target);
	expect(focus.active()).toBeNull();
	expect(focusIn).toBe(0);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it.each(["blur", "focus"])(
	"controlled %s callbacks finish before async focus completes",
	async (type) => {
		const { tree, focus, events, page, first, target, last, scroll } =
			fixture();
		focus.focusElement(first, { preventScroll: true });
		const seen: string[] = [];
		events.addEventListener(
			type === "blur" ? first : target,
			type,
			controlledEventListener(async () => {
				seen.push("start");
				await Promise.resolve();
				await page.focusAsync(last, {
					preventScroll: true,
					focusVisible: false,
				});
				seen.push("end");
			}),
		);
		await page.focusAsync(target, { focusVisible: true });
		seen.push("returned");
		expect(seen).toEqual(["start", "end", "returned"]);
		expect(focus.active()).toBe(last);
		expect(tree.focusIndicated).toBe(false);
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it("does not misrepresent the native synchronous runner as a page bridge", () => {
	const { focus, events, target } = fixture();
	events.addEventListener(
		target,
		"focus",
		controlledEventListener(async () => {}),
	);
	expect(() => focus.focusElement(target)).toThrow(/asynchronous dispatch/);
	expect(focus.active()).toBe(target);
	expect(pageFocusCapabilities.synchronousPageMethods).toBe(false);
});

it("supports parent-owned programmatic scroll requests without duplicate native events", async () => {
	const { tree, focus, target, events, scroll } = fixture();
	const requested: unknown[] = [];
	let scrollEvents = 0;
	events.addEventListener(tree.root, "scroll", () => scrollEvents++);
	const page = new PageFocus(focus, (position) => {
		requested.push(position);
		scroll.to(position.left ?? scroll.get().x, position.top ?? scroll.get().y);
	});
	await page.focusAsync(target, { preventScroll: true });
	expect(requested).toEqual([]);
	await page.focusAsync(target);
	expect(requested).toHaveLength(1);
	expect(scroll.get().y).toBeGreaterThan(0);
	expect(scrollEvents).toBe(0);
	await page.blurAsync(target);
	expect(focus.active()).toBeNull();
});

it.each(["blur", "focus", "focusin"])(
	"document close during %s cancels the remaining action",
	async (type) => {
		const { tree, focus, page, events, first, target } = fixture();
		focus.focusElement(first, { preventScroll: true });
		events.addEventListener(type === "blur" ? first : target, type, () =>
			tree.close(),
		);
		await expect(page.focusAsync(target)).rejects.toThrow(/closed/);
		expect(() => focus.focusElement(target)).toThrow(/closed/);
		await expect(page.blurAsync(target)).rejects.toThrow(/closed/);
	},
);

it("validates native ownership and typed options before changing focus", () => {
	const { tree, focus, first, target } = fixture();
	const other = new DocumentTree("https://fixture.invalid/other");
	trees.push(other);
	const foreign = other.createElement("input");
	other.append(other.root, foreign);
	focus.focusElement(first, { preventScroll: true });
	const revision = tree.revision;
	expect(() => focus.focusElement(foreign)).toThrow();
	expect(() => focus.focusElement(tree.root)).toThrow(/element/);
	expect(() => focus.blurElement(tree.root)).toThrow(/element/);
	expect(() =>
		Reflect.apply(focus.focusElement, focus, [
			target,
			{ focusVisible: "false" },
		]),
	).toThrow(/options/);
	expect(tree.revision).toBe(revision);
});

it("converts only own-data page dictionaries, preserving absent versus false", () => {
	expect(pageFocusOptions()).toEqual({});
	expect(pageFocusOptions(null)).toEqual({});
	expect(pageFocusOptions({ focusVisible: undefined })).toEqual({});
	expect(
		pageFocusOptions({ focusVisible: null, preventScroll: "yes" }),
	).toEqual({ focusVisible: false, preventScroll: true });
	expect(
		pageFocusOptions(Object.assign(Object.create(null), { focusVisible: 0 })),
	).toEqual({ focusVisible: false });
	let reads = 0;
	expect(() =>
		pageFocusOptions({
			get focusVisible() {
				reads++;
				return true;
			},
		}),
	).toThrow(/accessors/);
	expect(reads).toBe(0);
	expect(() => pageFocusOptions(Object.create({ focusVisible: true }))).toThrow(
		/own-data/,
	);
	expect(() => pageFocusOptions(false)).toThrow(TypeError);
	expect(() => pageFocusOptions([])).toThrow(/own-data/);
});

it("exposes composable native actions without allocating a separate focus owner", async () => {
	const { focus, events, target } = fixture();
	expect(
		runEventAction(
			events,
			focus.focusElementAction(target, { preventScroll: true }),
		),
	).toBeUndefined();
	expect(focus.active()).toBe(target);
	expect(
		await runEventActionAsync(events, focus.blurElementAction(target)),
	).toBeUndefined();
	expect(focus.active()).toBeNull();
});

it("does not confuse a generated summary with its element receiver", () => {
	const { tree, focus, target } = fixture(
		'<details id="target"><p>Content</p></details>',
	);
	const summary = documentGeneratedControls(tree).detailsSummary(target);
	if (!summary) throw new Error("Missing generated summary");
	focus.focus(summary.ref);
	focus.focusElement(target, { preventScroll: true, focusVisible: false });
	focus.blurElement(target);
	expect(focus.activeReference()).toBe(summary.ref);
});

it("a change-handler redirect preserves committed state and wins focus", () => {
	const { tree, actions, focus, events, first, target, last, scroll } =
		fixture();
	actions.fill(tree.reference(target), "edited");
	const seen: string[] = [];
	events.addEventListener(target, "change", () => {
		seen.push("change");
		focus.focusElement(last, { preventScroll: true, focusVisible: false });
	});
	events.addEventListener(target, "blur", () => seen.push("blur"));
	focus.focusElement(first);
	expect(focus.active()).toBe(last);
	expect(tree.focusIndicated).toBe(false);
	expect(seen).toEqual(["change"]);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("awaited target invalidation is a no-op rather than an agent actionability error", async () => {
	const { tree, focus, page, events, first, target, scroll } = fixture();
	focus.focusElement(first, { preventScroll: true });
	events.addEventListener(
		first,
		"blur",
		controlledEventListener(async () => {
			await Promise.resolve();
			tree.setAttribute(target, "disabled", "");
		}),
	);
	await expect(page.focusAsync(target)).resolves.toBeUndefined();
	expect(focus.active()).toBeNull();
	expect(scroll.metrics()).toMatchObject({ updates: 0, builds: 0 });
});

it("closing interrupts a suspended controlled callback without waiting for its settlement", async () => {
	const { tree, focus, page, events, target } = fixture();
	let entered = false;
	events.addEventListener(
		target,
		"focus",
		controlledEventListener(() => {
			entered = true;
			return new Promise<void>(() => {});
		}),
	);
	const pending = page.focusAsync(target);
	const rejected = expect(pending).rejects.toThrow(/closed/);
	expect(entered).toBe(true);
	tree.close();
	await rejected;
	expect(events.metrics()).toMatchObject({ closed: true, activeDispatches: 0 });
	expect(() => focus.active()).toThrow(/closed/);
});

it("a newer host request supersedes suspended focus options", async () => {
	const { tree, page, focus, events, target, last, scroll } = fixture();
	let release = () => {};
	events.addEventListener(
		target,
		"focus",
		controlledEventListener(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		),
	);
	const pending = page.focusAsync(target, { focusVisible: true });
	await page.focusAsync(last, { preventScroll: true, focusVisible: false });
	release();
	await pending;
	expect(focus.active()).toBe(last);
	expect(tree.focusIndicated).toBe(false);
	expect(scroll.metrics()).toMatchObject({ updates: 0, builds: 0 });
});

it("closing the dispatcher rejects future helpers even if the tree stays open", async () => {
	const { events, page, focus, target } = fixture();
	events.close();
	expect(() => focus.focusElement(target)).toThrow(/closed/);
	await expect(page.focusAsync(target)).rejects.toThrow(/closed/);
	await expect(page.blurAsync(target)).rejects.toThrow(/closed/);
});

it("page helper close interrupts work without closing the shared document owner", async () => {
	const { tree, events, page, focus, target, last, scroll } = fixture();
	events.addEventListener(
		target,
		"focus",
		controlledEventListener(() => new Promise<void>(() => {})),
	);
	const pending = page.focusAsync(target, { focusVisible: false });
	const rejected = expect(pending).rejects.toThrow(/aborted/);
	page.close();
	page.close();
	await rejected;
	expect(events.metrics()).toMatchObject({
		closed: false,
		activeDispatches: 0,
	});
	expect(tree.activeElement).toBe(target);
	expect(scroll.metrics()).toMatchObject({ updates: 0, builds: 0 });
	await expect(page.focusAsync(last)).rejects.toThrow(/closed/);
	await expect(page.blurAsync(target)).rejects.toThrow(/closed/);
	focus.focusElement(last, { preventScroll: true });
	expect(focus.active()).toBe(last);
});

it("an already-aborted async action cannot change native focus", async () => {
	const { focus, target } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		focus.focusElementAsync(target, {}, undefined, controller.signal),
	).rejects.toThrow(/aborted/);
	expect(focus.active()).toBeNull();
});
