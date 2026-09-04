import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { controlChecked, controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserMouseEvent, BrowserPointerActivationEvent } from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
});
async function fixture() {
	const requests: string[] = [];
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				return {
					url: input.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main{width:200px;height:400px}#before{height:120px}#target,#field,#link{display:block;margin-left:120px;width:20px;height:20px;padding:0;border:0}#field{color:blue}#field:placeholder-shown{color:red}</style><main><div id="before"></div><input id="target" type="checkbox"><input id="field" placeholder="Type"><a id="link" href="/next">Go</a></main>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/input-core"]);
	await host.execute(["resize", "100", "80"]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	const tree = page.document;
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		host,
		session,
		tab,
		page,
		tree,
		queries,
		id,
		requests,
		target: id("#target"),
		reference: tree.reference(id("#target")),
		actions: page.interactions,
		scroll: documentScroll(tree),
	};
}

it("routes a command click through scrolling, pointer events, focus and checkbox defaults", async () => {
	const { host, tree, target, reference, actions, scroll } = await fixture();
	const trace: string[] = [];
	let click: BrowserPointerActivationEvent | undefined;
	for (const type of [
		"mousemove",
		"mousedown",
		"focus",
		"mouseup",
		"click",
		"input",
		"change",
	])
		actions.events.addEventListener(target, type, (event) => {
			trace.push(type);
			if (event instanceof BrowserPointerActivationEvent) click = event;
		});
	expect((await host.execute(["click", reference])).data).toMatchObject({
		interaction: { reference },
		mouse: { buttons: 0 },
	});
	expect(trace).toEqual([
		"mousemove",
		"mousedown",
		"focus",
		"mouseup",
		"click",
		"input",
		"change",
	]);
	expect(controlChecked(tree, target)).toBe(true);
	expect(actions.focus.active()).toBe(target);
	expect(scroll.get().y).toBeGreaterThan(0);
	expect(click).toMatchObject({
		pointerId: 1,
		pointerType: "mouse",
		buttons: 0,
		detail: 1,
	});
	expect(click?.pageX).toBe((click?.clientX ?? 0) + scroll.get().x);
	expect(click?.pageY).toBe((click?.clientY ?? 0) + scroll.get().y);
});

it("lets hover reach disabled controls without focusing or activating them", async () => {
	const { host, tree, target, queries, actions } = await fixture();
	tree.setAttribute(target, "disabled", "");
	await host.execute(["hover", "#target"]);
	expect(queries.matches(target, ":hover")).toBe(true);
	expect(queries.matches(target, ":active")).toBe(false);
	expect(actions.focus.active()).toBeNull();
	expect(controlChecked(tree, target)).toBe(false);
});

it("revalidates a targeted click after mousedown mutation without replaying it", async () => {
	const { host, tree, target, actions } = await fixture();
	let downs = 0;
	let clicks = 0;
	actions.events.addEventListener(target, "mousedown", () => {
		downs++;
		tree.setAttribute(target, "style", "pointer-events:none");
	});
	actions.events.addEventListener(target, "click", () => {
		clicks++;
	});
	await expect(host.execute(["click", "#target"])).rejects.toMatchObject({
		code: "not-actionable",
	});
	expect(downs).toBe(1);
	expect(clicks).toBe(0);
	expect(controlChecked(tree, target)).toBe(false);
	expect(actions.mouse.metrics()).toMatchObject({ busy: false, buttons: 0 });
});

it("rolls back checkbox preactivation when the generated click is canceled", async () => {
	const { host, tree, target, actions } = await fixture();
	let observed = false;
	actions.events.addEventListener(target, "click", (event) => {
		observed = controlChecked(tree, target);
		event.preventDefault();
	});
	await host.execute(["click", "#target"]);
	expect(observed).toBe(true);
	expect(controlChecked(tree, target)).toBe(false);
	expect(actions.mouse.metrics().buttons).toBe(0);
});

it("shares held modifiers with mouse events and releases them independently", async () => {
	const { host, actions, target, tree } = await fixture();
	let shift: boolean | undefined;
	actions.events.addEventListener(target, "mousedown", (event) => {
		if (event instanceof BrowserMouseEvent) shift = event.shiftKey;
	});
	await host.execute(["keydown", "Shift"]);
	await host.execute(["click", "#target"]);
	expect(shift).toBe(true);
	expect(actions.keyboard.modifiers().shift).toBe(true);
	expect(tree.pointerActiveElement).toBeNull();
	await host.execute(["keyup", "Shift"]);
	expect(actions.keyboard.modifiers().shift).toBe(false);
});

it("arms Space until key release with non-pointer activation metadata", async () => {
	const { host, actions, target, tree, queries } = await fixture();
	actions.focus.focus(tree.reference(target));
	let click: BrowserPointerActivationEvent | undefined;
	actions.events.addEventListener(target, "click", (event) => {
		if (event instanceof BrowserPointerActivationEvent) click = event;
	});
	await host.execute(["keydown", "Space"]);
	expect(controlChecked(tree, target)).toBe(false);
	expect(queries.matches(target, ":active")).toBe(true);
	await host.execute(["keyup", "Space"]);
	expect(controlChecked(tree, target)).toBe(true);
	expect(queries.matches(target, ":active")).toBe(false);
	expect(click).toMatchObject({ pointerId: -1, pointerType: "", detail: 0 });
});

it("targets keypress focus and updates placeholder-dependent CSS after editing", async () => {
	const { host, tree, id, queries, actions } = await fixture();
	const field = id("#field");
	expect(queries.matches(field, ":placeholder-shown")).toBe(true);
	expect(resolvedStyleValue(tree, field, "color")).toBe("rgb(255, 0, 0)");
	await host.execute(["press", "KeyA", "--target=#field"]);
	expect(actions.focus.active()).toBe(field);
	expect(controlValue(tree, field)).toBe("a");
	expect(queries.matches(field, ":placeholder-shown")).toBe(false);
	expect(resolvedStyleValue(tree, field, "color")).toBe("rgb(0, 0, 255)");
});

it("keeps native programmatic activation separate from focus and pointer state", async () => {
	const { actions, tree, target } = await fixture();
	tree.setAttribute(target, "hidden", "");
	actions.programmaticClick(target);
	expect(controlChecked(tree, target)).toBe(true);
	expect(actions.focus.active()).toBeNull();
	expect(tree.pointerHoverElement).toBeNull();
	expect(tree.pointerActiveElement).toBeNull();
});

it("disposes old input state after coordinate navigation", async () => {
	const { host, actions, session, tab, requests, tree } = await fixture();
	await host.execute(["hover", "#link"]);
	expect(tree.pointerHoverElement).not.toBeNull();
	await host.execute(["mousedown"]);
	expect((await host.execute(["mouseup"])).data).toMatchObject({
		navigation: { url: "https://fixture.invalid/next" },
	});
	expect(actions.mouse.metrics()).toMatchObject({
		closed: true,
		buttons: 0,
		x: 0,
		y: 0,
	});
	expect(() => actions.keyboard.modifiers()).toThrow(/closed/);
	expect(session.page(tab).interactions.mouse.metrics().buttons).toBe(0);
	expect(requests).toHaveLength(2);
});

it("rejects stale wheel guards before input state or scroll changes", async () => {
	const { host, actions, scroll } = await fixture();
	const before = actions.mouse.metrics();
	for (const option of [
		"--expected-document=stale",
		"--expected-viewport=stale",
	])
		await expect(
			host.execute(["mousewheel", "0", "40", option]),
		).rejects.toMatchObject({ code: "stale-reference" });
	expect(actions.mouse.metrics()).toEqual(before);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("keeps hit geometry synchronized with pointer-induced selector invalidation", async () => {
	const { host, actions, queries, tree, target, scroll } = await fixture();
	scroll.to(100, 100);
	queries.querySelector(":hover");
	const builds = queries.metrics().structuralBuilds;
	await host.execute(["hover", "#target"]);
	queries.querySelector(":hover");
	expect(queries.metrics().structuralBuilds).toBe(builds);
	const rectangle = documentGeometry(tree).getBoundingClientRect(target);
	expect(actions.mouse.metrics()).toMatchObject({
		x: rectangle.x + rectangle.width / 2,
		y: rectangle.y + rectangle.height / 2,
	});
});

type RawAction = "mousemove" | "mousedown" | "mouseup" | "mousewheel";
const rawActions: RawAction[] = [
	"mousemove",
	"mousedown",
	"mouseup",
	"mousewheel",
];
function nativeInput(
	actions: Awaited<ReturnType<typeof fixture>>["actions"],
	action: RawAction,
	signal: AbortSignal,
) {
	if (action === "mousemove") return actions.mouse.moveAsync(26, 26, signal);
	if (action === "mousedown") return actions.mouse.downAsync("left", signal);
	if (action === "mouseup") return actions.mouse.upAsync("left", signal);
	return actions.mouse.wheelAsync(0, 20, signal);
}

it.each(rawActions)(
	"rejects pre-aborted native %s without changing input state",
	async (action) => {
		const { actions, scroll } = await fixture();
		expect(actions.mouse).toBeDefined();
		scroll.to(100, 100);
		actions.mouse.move(25, 25);
		if (action === "mouseup") actions.mouse.down();
		const before = actions.mouse.metrics();
		const controller = new AbortController();
		controller.abort();
		await expect(
			nativeInput(actions, action, controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
		expect(actions.mouse.metrics()).toEqual(before);
		expect(scroll.get()).toEqual({ x: 100, y: 100 });
	},
);

it.each(
	rawActions.flatMap(
		(action) =>
			[
				["native", action],
				["session", action],
			] as const,
	),
)(
	"interrupts %s %s while its event prefix is pending",
	async (scope, action) => {
		const { actions, session, tab, target, tree, scroll } = await fixture();
		expect(actions.mouse).toBeDefined();
		scroll.to(100, 100);
		actions.mouse.move(25, 25);
		if (action === "mouseup") actions.mouse.down();
		let enter!: () => void;
		let release!: () => void;
		const entered = new Promise<void>((resolve) => {
			enter = resolve;
		});
		const prefix = new Promise<void>((resolve) => {
			release = resolve;
		});
		actions.events.addEventListener(
			target,
			action === "mousewheel" ? "wheel" : action,
			controlledEventListener(() => {
				enter();
				return prefix;
			}),
			{ once: true },
		);
		const controller = new AbortController();
		let failure: unknown;
		const operation =
			scope === "native"
				? nativeInput(actions, action, controller.signal)
				: action === "mousemove"
					? session.mousemove(tab, 26, 26, { signal: controller.signal })
					: action === "mousewheel"
						? session.mousewheel(tab, 0, 20, { signal: controller.signal })
						: session[action](tab, "left", { signal: controller.signal });
		const pending = operation.catch((error) => {
			failure = error;
		});
		await entered;
		controller.abort();
		try {
			await vi.waitFor(
				() => expect(failure).toMatchObject({ code: "aborted" }),
				{ timeout: 300 },
			);
			expect(actions.mouse.metrics().busy).toBe(false);
			expect(actions.events.metrics().activeDispatches).toBe(0);
			expect(controlChecked(tree, target)).toBe(false);
			expect(actions.mouse.metrics().buttons).toBe(
				action === "mousedown" ? 1 : 0,
			);
		} finally {
			release();
			await pending;
		}
	},
);
