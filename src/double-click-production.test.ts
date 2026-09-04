import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlChecked } from "./controls.js";
import { documentScroll } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserMouseEvent } from "./mouse.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession, type SessionDoubleClickResult } from "./session.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
});

async function fixture(
	content = '<button id="target">Go</button>',
	css = "",
	status = 200,
) {
	const requests: NetworkRequest[] = [];
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input);
				return {
					url: input.url,
					status: requests.length === 1 ? 200 : status,
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
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px}#overlay{position:relative;top:-20px;width:40px;height:20px;z-index:1}${css}</style>${content}`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		timeoutMs: 1000,
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/start"]);
	const tab = session.tabs()[0];
	await host.execute(["resize", "100", "80"]);
	const page = session.page(tab.id);
	const id = (selector: string) => {
		const found = page.queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const reference = page.document.reference(target);
	const events: BrowserMouseEvent[] = [];
	for (const type of ["mousemove", "mousedown", "mouseup", "click", "dblclick"])
		page.interactions.events.addEventListener(
			page.document.root,
			type,
			(event) => {
				if (event instanceof BrowserMouseEvent) events.push(event);
			},
		);
	const doubleClick = async (targetInput = "#target", signal?: AbortSignal) =>
		(await host.execute(["dblclick", targetInput], { signal }))
			.data as SessionDoubleClickResult;
	return {
		host,
		session,
		tab,
		page,
		target,
		reference,
		id,
		requests,
		events,
		doubleClick,
	};
}

function gate() {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}

it("keeps viewport-fixed double-click coordinates and root scroll across both clicks", async () => {
	const { page, target, events, doubleClick } = await fixture(
		'<button id="target">Fixed</button><div style="height:500px"></div>',
		"#target{position:fixed;left:10px;top:10px}",
	);
	const scroll = documentScroll(page.document);
	scroll.to(0, 150);
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(scroll.get()).toEqual({ x: 0, y: 150 });
	expect(events.filter((event) => event.type === "click")).toHaveLength(2);
	expect(events.filter((event) => event.type === "dblclick")).toHaveLength(1);
	expect(events.every((event) => event.target === target)).toBe(true);
	expect(
		events.every((event) => event.clientY >= 10 && event.clientY <= 30),
	).toBe(true);
});

it("runs both reset defaults against the shared file-selection owner", async () => {
	const { page, id, doubleClick } = await fixture(
		'<form><input id="file" type="file" style="display:none"><button id="target" type="reset">Reset</button></form>',
	);
	const files = page.interactions.files;
	const reference = page.document.reference(id("#file"));
	files.replace(files.capture(reference), [
		{ name: "selected.txt", data: new TextEncoder().encode("owned") },
	]);
	const states: number[] = [];
	page.interactions.events.addEventListener(id("form"), "reset", () => {
		states.push(files.metrics().files);
	});
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(states).toEqual([1, 0]);
	expect(result.clicks.map((click) => click.interaction.reset?.reset)).toEqual([
		true,
		true,
	]);
	expect(files.metrics()).toMatchObject({ files: 0, bytes: 0 });
});

it("submits owned file bytes once before stopping the double-click at document navigation", async () => {
	const { page, id, requests, doubleClick } = await fixture(
		'<form action="/upload" method="post" enctype="multipart/form-data"><input id="file" type="file" name="upload" required style="display:none"><button id="target">Send</button></form>',
	);
	const files = page.interactions.files;
	const reference = page.document.reference(id("#file"));
	files.replace(files.capture(reference), [
		{ name: "selected.txt", data: new TextEncoder().encode("owned bytes") },
	]);
	const result = await doubleClick();
	expect(result).toMatchObject({ completed: false, interrupted: "navigation" });
	expect(result.clicks).toHaveLength(1);
	expect(requests).toHaveLength(2);
	const body = requests[1].body;
	const text = typeof body === "string" ? body : new TextDecoder().decode(body);
	expect(text).toContain('filename="selected.txt"');
	expect(text).toContain("owned bytes");
	expect(files.metrics()).toMatchObject({ closed: true, files: 0, bytes: 0 });
});

it("admits dblclick and advertises partial native behavior without selection or drag claims", async () => {
	const { host } = await fixture();
	const capabilities = (await host.execute(["capabilities"])).data;
	expect(capabilities).toMatchObject({
		mouse: {
			doubleClick: true,
			textSelection: false,
			dragAndDrop: false,
			trustedEvents: false,
		},
		actionWaiting: {
			commands: expect.arrayContaining(["dblclick"]),
			hitTestCommands: expect.arrayContaining(["dblclick"]),
			replayActions: false,
		},
		clickActionability: { commands: ["click", "dblclick"] },
	});
	expect(
		JSON.stringify((await host.execute(["dblclick", "--help"])).data),
	).toContain('"status":"partial"');
});

it.each(["#target", "reference", "getByText('Go')"])(
	"runs actual host dispatch and native phases for %s",
	async (selector) => {
		const { doubleClick, session, page, reference, target, events } =
			await fixture();
		const native = vi.spyOn(session, "dblclick");
		const result = await doubleClick(
			selector === "reference" ? reference : selector,
		);
		expect(native).toHaveBeenCalledTimes(1);
		expect(
			events.map((event) => [event.type, event.detail, event.buttons]),
		).toEqual([
			["mousemove", 0, 0],
			["mousedown", 1, 1],
			["mouseup", 1, 0],
			["click", 1, 0],
			["mousedown", 2, 1],
			["mouseup", 2, 0],
			["click", 2, 0],
			["dblclick", 2, 0],
		]);
		expect(result).toMatchObject({
			reference,
			completed: true,
			canceled: false,
			clicks: [
				{ interaction: { reference, defaultPrevented: false } },
				{ interaction: { reference, defaultPrevented: false } },
			],
			doubleClick: { buttons: 0 },
		});
		expect(page.interactions.focus.active()).toBe(target);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			buttons: 0,
			busy: false,
			actions: 1,
		});
	},
);

it("accepts only the primary button and rejects unsupported options before dispatch", async () => {
	const { host, events } = await fixture();
	for (const args of [["right"], ["middle"], ["bogus"], ["--force"]])
		await expect(
			host.execute(["dblclick", "#target", ...args]),
		).rejects.toBeInstanceOf(Error);
	expect(events).toEqual([]);
	expect(
		(await host.execute(["dblclick", "#target", "left"])).data,
	).toMatchObject({ completed: true });
});

it("runs checkbox activation exactly twice through the command", async () => {
	const { doubleClick, page, target } = await fixture(
		'<input id="target" type="checkbox">',
	);
	const changes: boolean[] = [];
	page.interactions.events.addEventListener(target, "change", () =>
		changes.push(controlChecked(page.document, target)),
	);
	await doubleClick();
	expect(changes).toEqual([true, false]);
	expect(controlChecked(page.document, target)).toBe(false);
});

it.each(["mousedown", "mouseup", "click", "dblclick"])(
	"preserves %s cancellation through the command",
	async (type) => {
		const { doubleClick, page, target, events } = await fixture();
		page.interactions.events.addEventListener(target, type, (event) =>
			event.preventDefault(),
		);
		const result = await doubleClick();
		expect(result.completed).toBe(true);
		expect(result.canceled).toBe(true);
		expect(
			result.clicks.map((click) => click.interaction.defaultPrevented),
		).toEqual([type === "click", type === "click"]);
		expect(events.at(-1)?.type).toBe("dblclick");
		if (type === "mousedown")
			expect(page.interactions.focus.active()).toBeNull();
	},
);

it("keeps focus reentrancy native and rejects reentrant mouse mutation", async () => {
	const { doubleClick, page, target, id } = await fixture(
		'<button id="target">Go</button><input id="other">',
	);
	let rejection: unknown;
	page.interactions.events.addEventListener(target, "focus", () => {
		try {
			page.interactions.mouse.down("right");
		} catch (error) {
			rejection = error;
		}
		page.interactions.focus.focus(page.document.reference(id("#other")));
	});
	expect((await doubleClick()).completed).toBe(true);
	expect(rejection).toMatchObject({ code: "not-actionable" });
	expect(page.interactions.focus.active()).toBe(id("#other"));
	expect(page.interactions.events.metrics().retainedErrors).toBe(0);
});

it.each(["disabled", "inert", "aria-disabled", "hidden", "covered"])(
	"waits before dispatch then times out for an initially %s target",
	async (blocked) => {
		const { host, page, target, id, events } = await fixture(
			'<button id="target">Go</button><div id="overlay" hidden></div>',
		);
		if (blocked === "covered")
			page.document.removeAttribute(id("#overlay"), "hidden");
		else
			page.document.setAttribute(
				target,
				blocked,
				blocked === "aria-disabled" ? "true" : "",
			);
		await expect(
			host.execute(["dblclick", "#target", "--timeout=40"]),
		).rejects.toMatchObject({ code: "timeout" });
		await host.execute(["snapshot"]);
		expect(events).toEqual([]);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			actions: 0,
			buttons: 0,
			busy: false,
		});
	},
);

it("waits for actionability only before the first native phase", async () => {
	const { doubleClick, page, target } = await fixture();
	page.document.setAttribute(target, "disabled", "");
	const pending = doubleClick();
	const timer = setTimeout(
		() => page.document.removeAttribute(target, "disabled"),
		30,
	);
	try {
		expect((await pending).completed).toBe(true);
	} finally {
		clearTimeout(timer);
	}
	expect(page.interactions.mouse.metrics().actions).toBe(1);
});

it.each(["remove", "replace", "disabled", "covered"])(
	"does not retry selector resolution after the first click causes %s",
	async (mutation) => {
		const { doubleClick, page, target, id, events } = await fixture(
			'<button id="target">Go</button><div id="overlay" hidden></div>',
		);
		page.interactions.events.addEventListener(target, "click", () => {
			if (mutation === "disabled")
				page.document.setAttribute(target, "disabled", "");
			else if (mutation === "covered")
				page.document.removeAttribute(id("#overlay"), "hidden");
			else {
				const parent = page.document.get(target).parent;
				page.document.remove(target);
				if (mutation === "replace" && parent !== null) {
					const replacement = page.document.createElement("button");
					page.document.setAttribute(replacement, "id", "target");
					page.document.append(parent, replacement);
				}
			}
		});
		await expect(doubleClick()).rejects.toBeInstanceOf(Error);
		expect(events.filter((event) => event.type === "click")).toHaveLength(1);
		expect(events.filter((event) => event.type === "mousedown")).toHaveLength(
			1,
		);
		expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			actions: 1,
			buttons: 0,
			busy: false,
		});
		expect(page.interactions.events.metrics().retainedErrors).toBe(0);
	},
);

it("executes the first link default and reports interrupted navigation, not a fake dblclick", async () => {
	const { doubleClick, session, tab, page, requests, events } = await fixture(
		'<a id="target" href="/next">Next</a>',
	);
	const result = await doubleClick();
	expect(result).toMatchObject({
		completed: false,
		interrupted: "navigation",
		navigation: { kind: "document", url: "https://fixture.invalid/next" },
	});
	expect(result.clicks).toHaveLength(1);
	expect(result.clicks[0].navigation).toEqual(result.navigation);
	expect(result.doubleClick).toBeUndefined();
	expect(events.filter((event) => event.type === "click")).toHaveLength(1);
	expect(events.some((event) => event.type === "dblclick")).toBe(false);
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/next",
	]);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		closed: true,
		busy: false,
		buttons: 0,
	});
	expect(session.page(tab.id).interactions.mouse.metrics().actions).toBe(0);
});

it("does not navigate when both native link clicks are canceled", async () => {
	const { doubleClick, page, target, requests } = await fixture(
		'<a id="target" href="/next">Next</a>',
	);
	page.interactions.events.addEventListener(target, "click", (event) =>
		event.preventDefault(),
	);
	const result = await doubleClick();
	expect(result).toMatchObject({ completed: true, canceled: true });
	expect(result.navigation).toBeUndefined();
	expect(requests).toHaveLength(1);
});

it("can interrupt on the second default after canceling the first click", async () => {
	const { doubleClick, page, target } = await fixture(
		'<a id="target" href="/next">Next</a>',
	);
	page.interactions.events.addEventListener(target, "click", (event) => {
		if ((event as BrowserMouseEvent).detail === 1) event.preventDefault();
	});
	const result = await doubleClick();
	expect(result).toMatchObject({
		completed: false,
		canceled: true,
		interrupted: "navigation",
	});
	expect(result.clicks).toHaveLength(2);
	expect(result.doubleClick).toBeUndefined();
});

it("keeps same-document navigation defaults and completes at the original target", async () => {
	const { doubleClick, requests } = await fixture(
		'<a id="target" href="#target">Go</a>',
	);
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(result.clicks.map((click) => click.navigation?.kind)).toEqual([
		"same-document",
		"same-document",
	]);
	expect(requests).toHaveLength(1);
});

it("retains no-content defaults for both clicks without inventing a document replacement", async () => {
	const { doubleClick, requests } = await fixture(
		'<a id="target" href="/next">Next</a>',
		"",
		204,
	);
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(result.clicks.map((click) => click.navigation?.kind)).toEqual([
		"no-content",
		"no-content",
	]);
	expect(requests).toHaveLength(3);
});

it("submits through the native default path, including submitter serialization", async () => {
	const { doubleClick, requests, page } = await fixture(
		'<form action="/sent"><button id="target" name="go" value="yes">Send</button></form>',
	);
	const result = await doubleClick();
	expect(result.completed).toBe(false);
	expect(result.clicks).toHaveLength(1);
	expect(result.clicks[0].form).toBeDefined();
	expect(requests[1].url).toBe("https://fixture.invalid/sent?go=yes");
	expect(page.interactions.mouse.metrics()).toMatchObject({
		buttons: 0,
		busy: false,
	});
});

it("preserves both canceled form submissions and then dispatches dblclick", async () => {
	const { doubleClick, page, id, requests } = await fixture(
		'<form action="/sent"><button id="target">Send</button></form>',
	);
	let submissions = 0;
	page.interactions.events.addEventListener(id("form"), "submit", (event) => {
		submissions++;
		event.preventDefault();
	});
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(submissions).toBe(2);
	expect(result.clicks.every((click) => click.form !== undefined)).toBe(true);
	expect(requests).toHaveLength(1);
});

it("preserves native invalid-form blocking for both click defaults", async () => {
	const { doubleClick, page, id, requests } = await fixture(
		'<form action="/sent"><input id="required" required><button id="target">Send</button></form>',
	);
	let invalid = 0;
	page.interactions.events.addEventListener(id("#required"), "invalid", () => {
		invalid++;
	});
	const result = await doubleClick();
	expect(result.completed).toBe(true);
	expect(
		result.clicks.every(
			(click) => click.form !== undefined && click.navigation === undefined,
		),
	).toBe(true);
	expect(invalid).toBe(2);
	expect(requests).toHaveLength(1);
});

it("rejects modified link defaults after one click while preserving keyboard state", async () => {
	const { doubleClick, host, page, events, requests } = await fixture(
		'<a id="target" href="/next">Next</a>',
	);
	await host.execute(["keydown", "Shift"]);
	await expect(doubleClick()).rejects.toMatchObject({ code: "unsupported" });
	expect(events.filter((event) => event.type === "click")).toHaveLength(1);
	expect(page.interactions.keyboard.modifiers().shift).toBe(true);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		busy: false,
		buttons: 0,
	});
	expect(requests).toHaveLength(1);
	await host.execute(["keyup", "Shift"]);
});

it.each([
	'<a id="target" href="/next" target="_blank">Next</a>',
	'<input id="file" type="file" style="display:none"><label id="target" for="file">Choose</label>',
])(
	"rejects an unsupported default after the first real click: %s",
	async (content) => {
		const { doubleClick, page, events, requests } = await fixture(content);
		await expect(doubleClick()).rejects.toMatchObject({ code: "unsupported" });
		expect(events.filter((event) => event.type === "mousedown")).toHaveLength(
			1,
		);
		expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(requests).toHaveLength(1);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			busy: false,
			buttons: 0,
		});
	},
);

it("rejects navigation performed by a first-click listener without replay on the new page", async () => {
	const { doubleClick, page, target, session, tab, events, requests } =
		await fixture();
	page.interactions.events.addEventListener(
		target,
		"click",
		controlledEventListener(async () => {
			await session.navigate(tab.id, "https://fixture.invalid/replacement");
		}),
	);
	await expect(doubleClick()).rejects.toBeInstanceOf(Error);
	expect(requests).toHaveLength(2);
	expect(
		events.filter((event) => event.type === "click").length,
	).toBeLessThanOrEqual(1);
	expect(events.filter((event) => event.type === "mousedown")).toHaveLength(1);
	expect(session.page(tab.id).interactions.mouse.metrics().actions).toBe(0);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		closed: true,
		busy: false,
		buttons: 0,
	});
});

it("rejects an old document reference instead of resolving its selector again", async () => {
	const { doubleClick, session, tab, reference } = await fixture();
	await session.navigate(tab.id, "https://fixture.invalid/replacement");
	await expect(doubleClick(reference)).rejects.toMatchObject({
		code: "stale-reference",
	});
	expect(session.page(tab.id).interactions.mouse.metrics().actions).toBe(0);
});

it("stops when a listener starts another navigation job before focus or mouseup", async () => {
	const { doubleClick, page, target, session, tab, events } = await fixture();
	let navigation: Promise<unknown> | undefined;
	page.interactions.events.addEventListener(target, "mousedown", () => {
		navigation = session.navigate(
			tab.id,
			"https://fixture.invalid/replacement",
		);
		void navigation.catch(() => undefined);
	});
	await expect(doubleClick()).rejects.toBeInstanceOf(Error);
	await navigation;
	expect(
		events.filter(
			(event) => event.type === "mouseup" || event.type === "click",
		),
	).toEqual([]);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		buttons: 0,
		busy: false,
	});
	expect(session.page(tab.id).interactions.mouse.metrics().actions).toBe(0);
});

it("aborts before admission without pointer dispatch", async () => {
	const { doubleClick, events, page } = await fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(doubleClick("#target", controller.signal)).rejects.toMatchObject(
		{ code: "aborted" },
	);
	expect(events).toEqual([]);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		actions: 0,
		buttons: 0,
		busy: false,
	});
});

it("root-scrolls an offscreen target before its first mouse phase", async () => {
	const { doubleClick, events } = await fixture(
		undefined,
		"#target{margin-top:200px}",
	);
	expect((await doubleClick()).completed).toBe(true);
	expect(
		events.find((event) => event.type === "mousedown")?.clientY,
	).toBeLessThan(80);
});

it.each([1, 2])(
	"aborts suspended mousedown %s and cleans held state before the next queued command",
	async (detail) => {
		const { doubleClick, host, page, target, events } = await fixture();
		const entered = gate();
		const waiting = gate();
		const controller = new AbortController();
		page.interactions.events.addEventListener(
			target,
			"mousedown",
			controlledEventListener(async (_target, event) => {
				if ((event as BrowserMouseEvent).detail !== detail) return;
				entered.release();
				await waiting.pending;
			}),
		);
		const pending = doubleClick("#target", controller.signal);
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		await entered.pending;
		expect(page.interactions.mouse.metrics().buttons).toBe(1);
		controller.abort();
		await rejected;
		await host.execute(["snapshot"]);
		expect(page.interactions.mouse.metrics()).toMatchObject({
			buttons: 0,
			busy: false,
		});
		expect(page.document.pointerActiveElement).toBeNull();
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			detail - 1,
		);
		waiting.release();
	},
);

it("keeps later commands queued until the entire double-click finishes", async () => {
	const { doubleClick, host, page, target, events } = await fixture();
	const entered = gate();
	const waiting = gate();
	page.interactions.events.addEventListener(
		target,
		"mousedown",
		controlledEventListener(async (_target, event) => {
			if ((event as BrowserMouseEvent).detail === 1) {
				entered.release();
				await waiting.pending;
			}
		}),
	);
	const pending = doubleClick();
	await entered.pending;
	let laterFinished = false;
	const later = host.execute(["mousemove", "90", "70"]).then((result) => {
		laterFinished = true;
		return result;
	});
	await Promise.resolve();
	expect(laterFinished).toBe(false);
	waiting.release();
	expect((await pending).completed).toBe(true);
	await later;
	expect(events.findIndex((event) => event.type === "dblclick")).toBeLessThan(
		events.length - 1,
	);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		x: 90,
		y: 70,
		buttons: 0,
		busy: false,
	});
});

it.each(["left", "right", "middle"])(
	"does not release the preexisting held %s button on admission failure",
	async (button) => {
		const { doubleClick, host, page } = await fixture();
		await host.execute(["mousemove", "5", "5"]);
		await host.execute(["mousedown", button]);
		const held = page.interactions.mouse.metrics().buttons;
		await expect(doubleClick()).rejects.toMatchObject({
			code: "not-actionable",
		});
		expect(page.interactions.mouse.metrics()).toMatchObject({
			buttons: held,
			busy: false,
		});
		await host.execute(["mouseup", button]);
	},
);
