import { afterEach, describe, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import type { DoubleClickOptions } from "./double-click.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { BrowserMouseEvent, MouseResult } from "./mouse.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

async function fixture(content = '<a id="target" href="/next">Next</a>') {
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
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px}</style>${content}`,
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	documentStyles(page.document).setViewport(100, 80);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing target");
	const reference = page.document.reference(target);
	const point = findClickPoint(page.document, target).point;
	if (!point) throw new Error("Missing click point");
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click", "dblclick"])
		page.interactions.events.addEventListener(target, type, (event) =>
			events.push(`${event.type}:${(event as BrowserMouseEvent).detail}`),
		);
	const doubleClick = (options: DoubleClickOptions = {}) =>
		page.interactions.mouse.doubleClickTargetAsync(reference, point, {
			...options,
			checkOwnership() {
				if (session.page(tab.id) !== page)
					throw new AgentBrowserError(
						"stale-reference",
						"Action document was replaced",
					);
				options.checkOwnership?.();
			},
		});
	return {
		session,
		tab,
		page,
		target,
		reference,
		point,
		requests,
		events,
		doubleClick,
	};
}

describe("double-click session integration contract (not command-host wiring)", () => {
	it("returns the first unhandled navigation intent instead of dropping it", async () => {
		const { doubleClick, requests, events, page } = await fixture();
		const result = await doubleClick();
		expect(result.clicks).toHaveLength(1);
		expect(result.pendingDefaultAction).toEqual({
			kind: "navigate",
			url: "https://fixture.invalid/next",
			target: "_self",
		});
		expect(result.doubleClick).toBeUndefined();
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
		expect(requests).toEqual(["https://fixture.invalid/start"]);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
		});
	});

	it("delivers each intent exactly once before proceeding when the parent handles it", async () => {
		const { doubleClick, events } = await fixture(
			'<a id="target" href="/next" target="_blank">Next</a>',
		);
		const intents: unknown[] = [];
		const result = await doubleClick({
			afterClick(mouse, detail) {
				intents.push(mouse.defaultAction);
				events.push(`default:${detail}`);
			},
		});
		expect(intents).toEqual([
			{
				kind: "navigate",
				url: "https://fixture.invalid/next",
				target: "_blank",
			},
			{
				kind: "navigate",
				url: "https://fixture.invalid/next",
				target: "_blank",
			},
		]);
		expect(events).toEqual([
			"mousedown:1",
			"mouseup:1",
			"click:1",
			"default:1",
			"mousedown:2",
			"mouseup:2",
			"click:2",
			"default:2",
			"dblclick:2",
		]);
		expect(result.doubleClick).toBeDefined();
		expect(result.pendingDefaultAction).toBeUndefined();
	});

	it("does not invoke a navigation default for canceled clicks", async () => {
		const { doubleClick, page, target } = await fixture();
		page.interactions.events.addEventListener(target, "click", (event) =>
			event.preventDefault(),
		);
		const result = await doubleClick();
		expect(result.clicks.map((click) => click.defaultAction)).toEqual([
			undefined,
			undefined,
		]);
		expect(result.doubleClick).toBeDefined();
		expect(result.canceled).toBe(true);
	});

	it("preserves a second-click intent when the first click was canceled", async () => {
		const { doubleClick, page, target } = await fixture();
		page.interactions.events.addEventListener(target, "click", (event) => {
			if ((event as BrowserMouseEvent).detail === 1) event.preventDefault();
		});
		const result = await doubleClick();
		expect(result.clicks).toHaveLength(2);
		expect(result.pendingDefaultAction?.kind).toBe("navigate");
		expect(result.doubleClick).toBeUndefined();
		expect(result.canceled).toBe(true);
	});

	it("applies a first-click navigation without dispatching into the replacement document", async () => {
		const { session, tab, page, events, requests, doubleClick } =
			await fixture();
		const completed: MouseResult[] = [];
		await expect(
			doubleClick({
				async afterClick(mouse) {
					completed.push(mouse);
					if (mouse.defaultAction?.kind === "navigate")
						await session.navigate(tab.id, mouse.defaultAction.url);
				},
			}),
		).rejects.toMatchObject({ code: "closed" });
		expect(completed).toHaveLength(1);
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
		expect(requests).toEqual([
			"https://fixture.invalid/start",
			"https://fixture.invalid/next",
		]);
		expect(session.page(tab.id)).not.toBe(page);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
			closed: true,
		});
		expect(session.page(tab.id).interactions.mouse.metrics().actions).toBe(0);
	});

	it("returns document-owned submission intent with its submitter", async () => {
		const { doubleClick, reference, page } = await fixture(
			'<form action="/sent"><button id="target">Send</button></form>',
		);
		const result = await doubleClick();
		const form = page.queries.querySelector("form");
		if (form === null) throw new Error("Missing form");
		expect(result.pendingDefaultAction).toEqual({
			kind: "submit",
			formRef: page.document.reference(form),
			submitterRef: reference,
		});
		expect(result.clicks).toHaveLength(1);
		expect(result.doubleClick).toBeUndefined();
	});

	it("passes submission through native requestSubmit and stops on replacement", async () => {
		const { session, tab, doubleClick, requests, events } = await fixture(
			'<form action="/sent"><button id="target">Send</button></form>',
		);
		await expect(
			doubleClick({
				async afterClick(mouse) {
					const action = mouse.defaultAction;
					if (action?.kind === "submit")
						await session.requestSubmit(tab.id, action.formRef, {
							submitter: action.submitterRef,
						});
				},
			}),
		).rejects.toMatchObject({ code: "closed" });
		expect(requests).toEqual([
			"https://fixture.invalid/start",
			"https://fixture.invalid/sent",
		]);
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
	});

	it("continues after a canceled native submit without suppressing dblclick", async () => {
		const { session, tab, page, doubleClick, requests, events } = await fixture(
			'<form action="/sent"><button id="target">Send</button></form>',
		);
		const form = page.queries.querySelector("form");
		if (form === null) throw new Error("Missing form");
		let submissions = 0;
		page.interactions.events.addEventListener(form, "submit", (event) => {
			submissions++;
			event.preventDefault();
		});
		const result = await doubleClick({
			async afterClick(mouse) {
				const action = mouse.defaultAction;
				if (action?.kind === "submit")
					await session.requestSubmit(tab.id, action.formRef, {
						submitter: action.submitterRef,
					});
			},
		});
		expect(submissions).toBe(2);
		expect(requests).toEqual(["https://fixture.invalid/start"]);
		expect(events.at(-1)).toBe("dblclick:2");
		expect(result.doubleClick).toBeDefined();
	});

	it("returns picker intent rather than claiming unsupported UI ran", async () => {
		const { doubleClick, page } = await fixture(
			'<input id="file" type="file" style="display:none"><label id="target" for="file">Choose</label>',
		);
		const file = page.queries.querySelector("#file");
		if (file === null) throw new Error("Missing file control");
		const result = await doubleClick();
		expect(result.pendingDefaultAction).toEqual({
			kind: "picker",
			reference: page.document.reference(file),
		});
		expect(result.doubleClick).toBeUndefined();
	});

	it("lays out direct file controls but returns unhandled picker intent", async () => {
		const { doubleClick, reference, events } = await fixture(
			'<input id="target" type="file">',
		);
		const result = await doubleClick();
		expect(result.pendingDefaultAction).toEqual({
			kind: "picker",
			reference,
		});
		expect(result.clicks).toHaveLength(1);
		expect(result.doubleClick).toBeUndefined();
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
	});

	it("cleans up when the parent's default handler rejects", async () => {
		const { doubleClick, events, page } = await fixture();
		await expect(
			doubleClick({
				afterClick() {
					throw new AgentBrowserError("unsupported", "Parent rejected target");
				},
			}),
		).rejects.toMatchObject({ code: "unsupported" });
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
		});
	});

	it("holds the gesture reservation while the parent awaits a default", async () => {
		const { doubleClick, page, events } = await fixture(
			'<button id="target">Go</button>',
		);
		let release!: () => void;
		let entered!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const pending = doubleClick({
			async afterClick(_mouse, detail) {
				if (detail === 1) {
					entered();
					await waiting;
				}
			},
		});
		await started;
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: true,
			buttons: 0,
		});
		expect(() => page.interactions.mouse.down()).toThrow(
			"Another mouse action",
		);
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
		release();
		expect((await pending).doubleClick).toBeDefined();
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
		});
	});

	it("aborts an awaiting parent default without replay or an unhandled late rejection", async () => {
		const { doubleClick, page, events } = await fixture();
		let rejectDefault!: (error: Error) => void;
		let entered!: () => void;
		const waiting = new Promise<void>((_resolve, reject) => {
			rejectDefault = reject;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const controller = new AbortController();
		const pending = doubleClick({
			signal: controller.signal,
			afterClick() {
				entered();
				return waiting;
			},
		});
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		await started;
		controller.abort();
		await rejected;
		expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
		});
		rejectDefault(new Error("Late default failure"));
		await Promise.resolve();
	});
});
