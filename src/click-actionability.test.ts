import { afterEach, expect, it, vi } from "vitest";
import { runWhenActionable } from "./action-wait.js";
import {
	clickActionabilityCapabilities,
	findClickPoint,
	findHoverPoint,
} from "./click-target.js";
import { controlChecked } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentHitTesting } from "./hit-testing.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
const base =
	"html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px}#overlay{position:relative;top:-20px;width:40px;height:20px;z-index:1}";
function markup(css = "", content = '<button id="target">Go</button>') {
	return `<!doctype html><style>${base}${css}</style>${content}`;
}
function fixture(css = "", content?: string) {
	const tree = parseHtmlDocument(
		markup(css, content),
		"https://fixture.invalid/start",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const reference = tree.reference(target);
	const calls: string[] = [];
	for (const type of [
		"mousemove",
		"mousedown",
		"mouseup",
		"click",
		"focus",
		"input",
		"change",
	])
		actions.events.addEventListener(target, type, () => calls.push(type));
	const point = () => {
		const result = findClickPoint(tree, target);
		if (!result.point) throw new Error(`No point: ${result.blocked}`);
		return result.point;
	};
	return { tree, actions, queries, id, target, reference, calls, point };
}
async function sessionFixture(css = "", content?: string) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				return {
					url: request.url,
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
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(markup(css, content), response.url),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	documentStyles(page.document).setViewport(100, 80);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing target");
	const reference = page.document.reference(target);
	return {
		session,
		tab,
		page,
		target,
		reference,
		requests,
		click: (signal?: AbortSignal) =>
			session.click(tab.id, reference, { signal }),
	};
}
function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

const outsideSummaryCss =
	"body{padding-left:24px}#target{display:list-item;height:auto;list-style-position:outside}";
const outsideSummaryMarkup =
	'<details><summary id="target"></summary><p>Expanded</p></details>';

it("finds a real outside marker without adding it to DOM client rectangles", () => {
	const { tree, target } = fixture(outsideSummaryCss, outsideSummaryMarkup);
	const geometry = documentGeometry(tree);
	const principal = geometry.getBoundingClientRect(target);
	expect(principal.height).toBe(0);
	const result = findClickPoint(tree, target);
	expect(result.point).toBeDefined();
	expect(result.point?.x).toBeLessThan(principal.left);
	expect(
		documentHitTesting(tree).elementFromPoint(result.point!.x, result.point!.y),
	).toBe(target);
	expect(findHoverPoint(tree, target).point).toEqual(result.point);
	expect(geometry.getBoundingClientRect(target)).toEqual(principal);
	expect(geometry.getClientRects(target)).toHaveLength(1);
});

it.each([false, true])(
	"reference-clicks an empty outside summary with root scrolling: %s",
	async (offscreen) => {
		const { session, tab, page, target, reference, requests, click } =
			await sessionFixture(
				outsideSummaryCss + (offscreen ? "#target{margin-top:200px}" : ""),
				outsideSummaryMarkup,
			);
		const events: string[] = [];
		for (const type of ["mousedown", "mouseup", "click"])
			page.interactions.events.addEventListener(target, type, () =>
				events.push(type),
			);
		expect(
			documentGeometry(page.document).getBoundingClientRect(target).height,
		).toBe(0);
		expect(page.queries.querySelector("details[open]")).toBeNull();
		const result = await click();
		expect(result.interaction.reference).toBe(reference);
		expect(events).toEqual(["mousedown", "mouseup", "click"]);
		expect(page.queries.querySelector("details[open]")).not.toBeNull();
		expect(requests).toHaveLength(1);
		if (offscreen)
			expect(documentScroll(page.document).get().y).toBeGreaterThan(0);
		await session.hover(tab.id, reference);
		expect(page.queries.querySelector("details[open]")).not.toBeNull();
		await click();
		expect(page.queries.querySelector("details[open]")).toBeNull();
	},
);

it.each([false, true])(
	"hovers an empty outside summary without activation, offscreen: %s",
	async (offscreen) => {
		const { session, tab, page, reference } = await sessionFixture(
			outsideSummaryCss + (offscreen ? "#target{margin-top:200px}" : ""),
			outsideSummaryMarkup,
		);
		await session.hover(tab.id, reference);
		expect(page.queries.querySelector("details[open]")).toBeNull();
		if (offscreen)
			expect(documentScroll(page.document).get().y).toBeGreaterThan(0);
	},
);

it.each(["click", "hover", "dblclick"] as const)(
	"scrolls the receiving outside marker past empty principal geometry for %s",
	async (action) => {
		const { session, tab, page, target, reference } = await sessionFixture(
			`${outsideSummaryCss}#target{font-size:16px;line-height:300px}`,
			outsideSummaryMarkup,
		);
		const clicks: string[] = [];
		page.interactions.events.addEventListener(target, "click", () =>
			clicks.push("click"),
		);
		expect(
			documentGeometry(page.document).getBoundingClientRect(target).height,
		).toBe(0);
		await session[action](tab.id, reference);
		expect(documentScroll(page.document).get().y).toBeGreaterThan(0);
		expect(findHoverPoint(page.document, target).point).toBeDefined();
		expect(clicks).toHaveLength(
			action === "hover" ? 0 : action === "click" ? 1 : 2,
		);
	},
);

it("double-clicks the real offscreen outside-summary marker", async () => {
	const { session, tab, page, target, reference } = await sessionFixture(
		`${outsideSummaryCss}#target{margin-top:200px;font-size:16px;line-height:20px}`,
		outsideSummaryMarkup,
	);
	const events: string[] = [];
	for (const type of ["click", "dblclick"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	await session.dblclick(tab.id, reference);
	expect(documentScroll(page.document).get().y).toBeGreaterThan(0);
	expect(events).toEqual(["click", "click", "dblclick"]);
	expect(page.queries.querySelector("details[open]")).toBeNull();
});

it("requires the outside marker to receive the pointer rather than bypassing an overlay", () => {
	const { tree, target, id } = fixture(
		`${outsideSummaryCss}#overlay{position:absolute;left:16px;top:0;width:8px;height:12px;z-index:2}`,
		`${outsideSummaryMarkup}<div id="overlay"></div>`,
	);
	expect(findClickPoint(tree, target)).toMatchObject({
		blocked: "covered",
		interceptingRef: tree.reference(id("#overlay")),
	});
	tree.setAttribute(id("#overlay"), "style", "pointer-events:none");
	expect(findClickPoint(tree, target).point).toBeDefined();
});

it.each(["visibility:hidden", "pointer-events:none", "list-style-type:none"])(
	"does not invent receiving marker geometry for %s",
	(style) => {
		const { tree, target } = fixture(
			`${outsideSummaryCss}#target{${style}}`,
			outsideSummaryMarkup,
		);
		expect(findClickPoint(tree, target).point).toBeUndefined();
	},
);

it.each(["inert", 'aria-disabled="true"'])(
	"preserves native outside-summary action restrictions: %s",
	async (attribute) => {
		const { page, click } = await sessionFixture(
			outsideSummaryCss,
			`<details ${attribute}><summary id="target"></summary><p>Expanded</p></details>`,
		);
		await expect(click()).rejects.toMatchObject({ code: "not-actionable" });
		expect(page.queries.querySelector("details[open]")).toBeNull();
	},
);

it("keeps fixed outside-marker action points stationary under root scroll", () => {
	const { tree, target } = fixture(
		`${outsideSummaryCss}#target{position:fixed;left:24px;top:3px}`,
		`${outsideSummaryMarkup}<div style="height:300px"></div>`,
	);
	const before = findClickPoint(tree, target);
	expect(before.point).toBeDefined();
	documentScroll(tree).to(0, 120);
	expect(findClickPoint(tree, target).point).toEqual(before.point);
	expect(documentGeometry(tree).getBoundingClientRect(target).height).toBe(0);
});

it("finds a real receiving point without dispatch or scrolling", () => {
	const { tree, actions, target, calls } = fixture();
	const revision = tree.revision;
	expect(findClickPoint(tree, target)).toMatchObject({
		point: { x: 20, y: 10 },
		points: 1,
		rectangles: 1,
	});
	expect(calls).toEqual([]);
	expect(tree.activeElement).toBeNull();
	expect(tree.revision).toBe(revision);
	expect(actions.mouse.metrics().actions).toBe(0);
});

it("reports an overlapping stacking context instead of choosing the obscured target", () => {
	const { tree, target, id } = fixture(
		"",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	expect(findClickPoint(tree, target)).toMatchObject({
		blocked: "covered",
		interceptingRef: tree.reference(id("#overlay")),
		points: 9,
	});
});

it("uses another receiving point when only the center is covered", () => {
	const { tree, target } = fixture(
		"#overlay{width:20px;margin-left:10px}",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	const result = findClickPoint(tree, target);
	expect(result.point).toEqual({ x: 1, y: 10 });
	expect(result.points).toBe(2);
});

it("looks through pointer-excluded overlays and accepts the target's descendants", () => {
	const { tree, target } = fixture(
		"#overlay{pointer-events:none}#child{display:block;width:40px;height:20px}",
		'<div id="target"><span id="child">Go</span></div><div id="overlay"></div>',
	);
	expect(findClickPoint(tree, target).point).toEqual({ x: 20, y: 10 });
});

it.each(["display:none", "width:0;height:0", "display:contents"])(
	"rejects missing or empty layout boxes: %s",
	(style) => {
		const { tree, target } = fixture(
			`#target{${style}}`,
			'<div id="target"></div>',
		);
		expect(findClickPoint(tree, target).blocked).toBe("no-box");
	},
);

it("distinguishes offscreen geometry from missing boxes", () => {
	const { tree, target } = fixture("#target{margin-top:200px}");
	expect(findClickPoint(tree, target)).toMatchObject({
		blocked: "outside-viewport",
		points: 0,
	});
	expect(documentScroll(tree).get()).toEqual({ x: 0, y: 0 });
});

it("clips a partially visible fragment to the viewport", () => {
	const { tree, target } = fixture(
		"#target{position:relative;left:-30px;top:-10px}",
	);
	expect(findClickPoint(tree, target).point).toEqual({ x: 5, y: 5 });
});

it("does not sample gaps between inline fragments", () => {
	const { tree, target, actions, reference } = fixture(
		"#target{display:inline;width:auto;height:auto}main{width:32px}",
		'<main><a id="target" href="/next">one two three four</a></main>',
	);
	const result = findClickPoint(tree, target);
	expect(result.point).toBeDefined();
	expect(actions.actionability(reference).blocked).toBeUndefined();
	expect(result.rectangles).toBe(1);
});

it("supports fractional-sized receiving regions without an integer rounding workaround", () => {
	const { tree, target } = fixture(
		"#target{width:0.5px;height:0.5px}",
		'<div id="target"></div>',
	);
	expect(findClickPoint(tree, target)).toMatchObject({
		point: { x: 0.25, y: 0.25 },
		points: 1,
	});
});

it("rejects detached and closed targets rather than returning cached readiness", () => {
	const { tree, target } = fixture();
	findClickPoint(tree, target);
	tree.remove(target);
	expect(() => findClickPoint(tree, target)).toThrow("no longer");
	tree.close();
	expect(() => findClickPoint(tree, target)).toThrow("closed");
});

it("honors inherited ARIA disabling with explicit false overrides for supported roles", () => {
	const { tree, target } = fixture(
		"",
		'<div aria-disabled="true"><button id="target">Go</button></div>',
	);
	expect(findClickPoint(tree, target).blocked).toBe("aria-disabled");
	tree.setAttribute(target, "aria-disabled", "false");
	expect(findClickPoint(tree, target).point).toBeDefined();
});

it("does not apply ARIA disabling to generic non-interactive roles", () => {
	const { tree, target } = fixture(
		"",
		'<div id="target" aria-disabled="true"></div>',
	);
	expect(findClickPoint(tree, target).point).toBeDefined();
});

it("performs one atomic mouse gesture rather than directly synthesizing click", async () => {
	const { tree, actions, target, reference, calls, point } = fixture();
	const result = await actions.mouse.clickTargetAsync(reference, point());
	expect(calls).toEqual([
		"mousemove",
		"mousedown",
		"focus",
		"mouseup",
		"click",
	]);
	expect(tree.activeElement).toBe(target);
	expect(result.interaction?.reference).toBe(reference);
	expect(actions.mouse.metrics()).toMatchObject({
		buttons: 0,
		busy: false,
		actions: 1,
	});
});

it.each(["mousemove", "mousedown", "mouseup"])(
	"does not click through an overlay introduced during %s",
	async (type) => {
		const { tree, actions, reference, target, id, calls, point } = fixture(
			"#overlay{display:none}",
			'<button id="target">Go</button><div id="overlay"></div>',
		);
		actions.events.addEventListener(target, type, () =>
			tree.setAttribute(id("#overlay"), "style", "display:block"),
		);
		await expect(
			actions.mouse.clickTargetAsync(reference, point()),
		).rejects.toMatchObject({ code: "not-actionable" });
		expect(calls).not.toContain("click");
		if (type === "mousemove") expect(calls).not.toContain("mousedown");
		expect(actions.mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it.each(["mousemove", "mousedown", "mouseup"])(
	"does not activate a replacement after %s removes the requested element",
	async (type) => {
		const { tree, actions, target, reference, calls, point } = fixture();
		const selected = point();
		actions.events.addEventListener(target, type, () => tree.remove(target));
		const outcome = await actions.mouse
			.clickTargetAsync(reference, selected)
			.catch((error) => error);
		expect(outcome.interaction).toBeUndefined();
		expect(calls).not.toContain("click");
		expect(actions.mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it("cleans up only its own gesture and does not release an already-held button", async () => {
	const { actions, reference, point } = fixture();
	actions.mouse.move(5, 5);
	actions.mouse.down("right");
	await expect(
		actions.mouse.clickTargetAsync(reference, point()),
	).rejects.toThrow("held mouse buttons");
	expect(actions.mouse.metrics().buttons).toBe(2);
	actions.mouse.up("right");
});

it("prevents concurrent mouse mutation while a controlled mousedown prefix is pending", async () => {
	const { actions, target, reference, point } = fixture();
	const waiting = gate();
	const entered = gate();
	actions.events.addEventListener(
		target,
		"mousedown",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = actions.mouse.clickTargetAsync(reference, point());
	await entered.pending;
	expect(() => actions.mouse.move(8, 8)).toThrow("Another mouse action");
	waiting.release();
	expect((await pending).interaction).toBeDefined();
	expect(actions.mouse.metrics().busy).toBe(false);
});

it("aborts a suspended gesture without replaying it or leaving the left button held", async () => {
	const { actions, target, reference, point, calls } = fixture();
	const waiting = gate();
	const entered = gate();
	const controller = new AbortController();
	actions.events.addEventListener(
		target,
		"mousedown",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = actions.mouse.clickTargetAsync(
		reference,
		point(),
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered.pending;
	controller.abort();
	await rejected;
	expect(calls).toEqual(["mousemove", "mousedown"]);
	expect(actions.mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	waiting.release();
});

it("preserves cancellation of focus and click defaults in the gesture", async () => {
	const { tree, actions, target, reference, point } = fixture(
		"",
		'<input id="target" type="checkbox">',
	);
	actions.events.addEventListener(target, "mousedown", (event) =>
		event.preventDefault(),
	);
	actions.events.addEventListener(target, "click", (event) =>
		event.preventDefault(),
	);
	const result = await actions.mouse.clickTargetAsync(reference, point());
	expect(tree.activeElement).toBeNull();
	expect(result.interaction?.defaultPrevented).toBe(true);
	expect(controlChecked(tree, target)).toBe(false);
});

it("root-scrolls an offscreen session target before pointer dispatch", async () => {
	const { page, reference, target, click } = await sessionFixture(
		"#target{margin-top:200px}",
	);
	const calls: string[] = [];
	page.interactions.events.addEventListener(page.document.root, "scroll", () =>
		calls.push("scroll"),
	);
	for (const type of ["mousemove", "mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			calls.push(type),
		);
	const result = await click();
	expect(result.interaction.reference).toBe(reference);
	expect(result.mouse?.interaction).toBeDefined();
	expect(documentScroll(page.document).get().y).toBe(140);
	expect(calls).toEqual([
		"scroll",
		"mousemove",
		"mousedown",
		"mouseup",
		"click",
	]);
});

it("revalidates after scroll listeners disable the target", async () => {
	const { page, target, click } = await sessionFixture(
		"#target{margin-top:200px}",
	);
	const calls: string[] = [];
	page.interactions.events.addEventListener(page.document.root, "scroll", () =>
		page.document.setAttribute(target, "disabled", ""),
	);
	page.interactions.events.addEventListener(target, "mousedown", () =>
		calls.push("mousedown"),
	);
	await expect(click()).rejects.toMatchObject({ code: "not-actionable" });
	expect(calls).toEqual([]);
});

it("aborts scroll preparation before starting a pointer gesture", async () => {
	const { page, click } = await sessionFixture("#target{margin-top:200px}");
	const waiting = gate();
	const entered = gate();
	const controller = new AbortController();
	page.interactions.events.addEventListener(
		page.document.root,
		"scroll",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = click(controller.signal);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered.pending;
	controller.abort();
	await rejected;
	expect(page.interactions.mouse.metrics().actions).toBe(0);
	waiting.release();
});

it("retains the requested reference while clicking a receiving descendant", async () => {
	const { reference, target, page, click } = await sessionFixture(
		"#child{display:block;width:40px;height:20px}",
		'<div id="target"><span id="child">Go</span></div>',
	);
	let actualTarget: number | null = null;
	page.interactions.events.addEventListener(target, "click", (event) => {
		actualTarget = event.target;
	});
	const result = await click();
	expect(result.interaction.reference).toBe(reference);
	expect(actualTarget).toBe(page.queries.querySelector("#child"));
	expect(result.mouse?.interaction?.reference).not.toBe(reference);
});

it("does not produce navigation for a fully intercepted session link", async () => {
	const { click, requests } = await sessionFixture(
		"",
		'<a id="target" href="/next">Next</a><div id="overlay"></div>',
	);
	await expect(click()).rejects.toMatchObject({ code: "not-actionable" });
	expect(requests).toHaveLength(1);
});

it("navigates once using the post-click link default", async () => {
	const { page, target, click, requests } = await sessionFixture(
		"",
		'<a id="target" href="/before">Next</a>',
	);
	page.interactions.events.addEventListener(target, "click", () =>
		page.document.setAttribute(target, "href", "/after"),
	);
	expect((await click()).navigation?.url).toBe("https://fixture.invalid/after");
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/after",
	]);
});

it("waits for an overlay to disappear before invoking the click action once", async () => {
	vi.useFakeTimers();
	const { tree, actions, queries, id } = fixture(
		"",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	const perform = vi.fn();
	const pending = runWhenActionable(
		() => ({ document: tree, interactions: actions, queries }),
		"#target",
		{ kind: "click" },
		new AbortController().signal,
		perform,
		{ intervalMs: 5, maxPolls: 10 },
	);
	await vi.advanceTimersByTimeAsync(5);
	expect(perform).not.toHaveBeenCalled();
	tree.remove(id("#overlay"));
	await vi.advanceTimersByTimeAsync(5);
	await pending;
	expect(perform).toHaveBeenCalledTimes(1);
});

it("does not retry an action that fails after preflight", async () => {
	const { tree, actions, queries } = fixture();
	const perform = vi.fn(() => {
		throw new Error("After dispatch");
	});
	await expect(
		runWhenActionable(
			() => ({ document: tree, interactions: actions, queries }),
			"#target",
			{ kind: "click" },
			new AbortController().signal,
			perform,
		),
	).rejects.toThrow("After dispatch");
	expect(perform).toHaveBeenCalledTimes(1);
});

it.each(["block", "inline-block", "flex", "inline-flex"])(
	"finds receiving points in supported %s layout",
	(display) => {
		const { tree, target } = fixture(
			`#target{display:${display}}`,
			'<div id="target"><span>Go</span></div>',
		);
		expect(findClickPoint(tree, target).point).toBeDefined();
	},
);

it("bounds candidate queries before exhausting the shared hit-test owner", () => {
	const { tree, target } = fixture(
		"main{width:8px}#target{display:inline;width:auto;height:auto}#overlay{top:-360px;width:100px;height:360px}",
		`<main><a id="target" href="/next">${"a ".repeat(30)}</a></main><div id="overlay"></div>`,
	);
	documentStyles(tree).setViewport(100, 200);
	expect(() => findClickPoint(tree, target)).toThrow("Click point limit");
	expect(documentHitTesting(tree).metrics().queries).toBe(
		clickActionabilityCapabilities.maxPoints,
	);
});

it("clicks a checkbox through its rendered label without direct hidden-control targeting", async () => {
	const { page, click } = await sessionFixture(
		"#control{display:none}",
		'<input id="control" type="checkbox"><label id="target" for="control">Check</label>',
	);
	const control = page.queries.querySelector("#control");
	if (control === null) throw new Error("Missing control");
	const result = await click();
	expect(result.interaction.label?.forwarded).toBe(true);
	expect(controlChecked(page.document, control)).toBe(true);
});

it("submits a form only after the targeted pointer gesture activates its button", async () => {
	const { page, target, click, requests } = await sessionFixture(
		"",
		'<form action="/submit"><input name="query" value="term"><button id="target">Send</button></form>',
	);
	const calls: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			calls.push(type),
		);
	const result = await click();
	expect(calls).toEqual(["mousedown", "mouseup", "click"]);
	expect(result.navigation?.url).toBe(
		"https://fixture.invalid/submit?query=term",
	);
	expect(requests).toHaveLength(2);
});

it("rejects unsupported formatting instead of silently bypassing the renderer", async () => {
	const { click } = await sessionFixture("#target{position:sticky}");
	await expect(click()).rejects.toMatchObject({ code: "unsupported" });
});
