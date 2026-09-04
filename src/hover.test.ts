import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { findClickPoint, findHoverPoint } from "./click-target.js";
import { documentScroll } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession, type SessionHoverResult } from "./session.js";

const connection = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: connection.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => ({
		schemaVersion: 1,
		origin: "http://127.0.0.1:34567",
		token: "a".repeat(43),
	}),
	writeCommandConnection: vi.fn(),
}));

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});
async function fixture(css = "", content = '<button id="target">Go</button>') {
	const requests: string[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request.url);
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
			parseHtmlDocument(
				`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px}#overlay{position:relative;top:-20px;width:40px;height:20px;z-index:1}${css}</style>${content}`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/hover"]);
	await host.execute(["resize", "100", "80"]);
	const tab = session.tabs()[0];
	const page = session.page(tab.id);
	const tree = page.document;
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing target");
	const reference = tree.reference(target);
	const calls: string[] = [];
	for (const type of [
		"mouseover",
		"mouseenter",
		"mousemove",
		"mousedown",
		"mouseup",
		"click",
		"focus",
	])
		page.interactions.events.addEventListener(target, type, () =>
			calls.push(type),
		);
	return {
		host,
		session,
		tab,
		page,
		tree,
		target,
		reference,
		calls,
		requests,
		hover: (signal?: AbortSignal) =>
			session.hover(tab.id, reference, { signal }),
		point: () => {
			const result = findHoverPoint(tree, target);
			if (!result.point)
				throw new Error(`No receiving point: ${result.blocked}`);
			return result.point;
		},
	};
}
function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

it("advertises bounded hover without enabled, stable-layout or force claims", async () => {
	const { host } = await fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		hoverActionability: {
			partial: true,
			commands: ["hover"],
			rootScroll: true,
			mouseMovement: true,
			requiresEnabled: false,
			ariaDisabled: false,
			stableAnimationFrames: false,
			force: false,
			preservesHeldButtons: true,
		},
		actionWaiting: {
			hitTestCommands: ["click", "dblclick", "hover"],
			replayActions: false,
		},
	});
});

it.each([
	"#target",
	'getByRole("button", { name: "Go" })',
	'getByTestId("go")',
])("hovers locator %s without click, focus or navigation", async (locator) => {
	const { host, calls, tree, requests, reference } = await fixture(
		"",
		'<button id="target" data-testid="go">Go</button>',
	);
	const result = (await host.execute(["hover", locator]))
		.data as SessionHoverResult;
	expect(result.reference).toBe(reference);
	expect(result.mouse.reference).toBe(reference);
	expect(calls).toEqual(["mouseover", "mouseenter", "mousemove"]);
	expect(tree.activeElement).toBeNull();
	expect(requests).toHaveLength(1);
});

it("accepts saved references and does not repeat boundary events on the same target", async () => {
	const { host, reference, calls } = await fixture();
	await host.execute(["hover", reference]);
	await host.execute(["hover", reference]);
	expect(calls).toEqual(["mouseover", "mouseenter", "mousemove", "mousemove"]);
});

it.each([
	'<button id="target" disabled>Go</button>',
	'<button id="target" aria-disabled="true">Go</button>',
	'<div aria-disabled="true"><button id="target">Go</button></div>',
	'<fieldset disabled style="display:contents"><button id="target">Go</button></fieldset>',
])("does not require enabled state: %s", async (content) => {
	const { host, calls, tree, target } = await fixture("", content);
	expect(findHoverPoint(tree, target).point).toBeDefined();
	await host.execute(["hover", "#target", "--timeout=50"]);
	expect(calls).toContain("mousemove");
	expect(calls).not.toContain("click");
	if (content.includes("aria-disabled"))
		expect(findClickPoint(tree, target).blocked).toBe("aria-disabled");
});

it.each(["display:none", "visibility:hidden", "width:0;height:0"])(
	"rejects nonreceiving geometry %s before events",
	async (css) => {
		const { hover, calls } = await fixture(`#target{${css}}`);
		await expect(hover()).rejects.toMatchObject({ code: "not-actionable" });
		expect(calls).toEqual([]);
	},
);

it.each(["hidden", "inert"])(
	"rejects %s ancestry rather than skipping it for hover",
	async (attribute) => {
		const { hover, calls } = await fixture(
			"",
			`<div ${attribute}><button id="target">Go</button></div>`,
		);
		await expect(hover()).rejects.toMatchObject({ code: "not-actionable" });
		expect(calls).toEqual([]);
	},
);

it("scrolls the root before delivering pointer boundaries and movement", async () => {
	const { hover, tree, page, calls } = await fixture(
		"#target{margin-top:200px}",
	);
	page.interactions.events.addEventListener(tree.root, "scroll", () =>
		calls.push("scroll"),
	);
	await hover();
	expect(documentScroll(tree).get().y).toBe(140);
	expect(calls).toEqual(["scroll", "mouseover", "mouseenter", "mousemove"]);
});

it("rechecks hidden state changed by a scroll listener", async () => {
	const { hover, tree, target, page, calls } = await fixture(
		"#target{margin-top:200px}",
	);
	page.interactions.events.addEventListener(tree.root, "scroll", () =>
		tree.setAttribute(target, "hidden", ""),
	);
	await expect(hover()).rejects.toMatchObject({ code: "not-actionable" });
	expect(calls).toEqual([]);
});

it("permits disabling during scroll because hover does not activate the control", async () => {
	const { hover, tree, target, page, calls } = await fixture(
		"#target{margin-top:200px}",
	);
	page.interactions.events.addEventListener(tree.root, "scroll", () =>
		tree.setAttribute(target, "disabled", ""),
	);
	await hover();
	expect(calls).toContain("mousemove");
});

it("covered hover times out without event dispatch", async () => {
	const { host, calls, page } = await fixture(
		"",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	await expect(
		host.execute(["hover", "#target", "--timeout=30"]),
	).rejects.toMatchObject({ code: "timeout" });
	expect(calls).toEqual([]);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		actions: 0,
		busy: false,
	});
});

it("waits for an overlay to become pointer-transparent and performs once", async () => {
	const { host, calls, page, tree } = await fixture(
		"",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	const overlay = page.queries.querySelector("#overlay") as number;
	const timer = setTimeout(
		() => tree.setAttribute(overlay, "style", "pointer-events:none"),
		10,
	);
	try {
		await host.execute(["hover", "#target", "--timeout=500"]);
	} finally {
		clearTimeout(timer);
	}
	expect(calls.filter((type) => type === "mousemove")).toHaveLength(1);
});

it("chooses an uncovered edge instead of requiring the center", async () => {
	const { hover } = await fixture(
		"#overlay{width:20px;margin-left:10px}",
		'<button id="target">Go</button><div id="overlay"></div>',
	);
	const result = await hover();
	expect(result.mouse.x).toBe(1);
});

it("preserves requested reference when a child receives movement", async () => {
	const { hover, reference, tree, page } = await fixture(
		"#child{display:block;width:40px;height:20px}",
		'<div id="target"><span id="child">Child</span></div>',
	);
	const child = page.queries.querySelector("#child") as number;
	const result = await hover();
	expect(result.reference).toBe(reference);
	expect(result.mouse.reference).toBe(tree.reference(child));
});

it.each(["mouseover", "mouseenter", "mousemove"])(
	"does not replay or succeed after %s covers the target",
	async (type) => {
		const { host, calls, page, tree, target } = await fixture(
			"#overlay{display:none}",
			'<button id="target">Go</button><div id="overlay"></div>',
		);
		const overlay = page.queries.querySelector("#overlay") as number;
		page.interactions.events.addEventListener(target, type, () =>
			tree.setAttribute(overlay, "style", "display:block"),
		);
		await expect(host.execute(["hover", "#target"])).rejects.toMatchObject({
			code: "not-actionable",
		});
		expect(calls.filter((entry) => entry === type)).toHaveLength(1);
		expect(calls).not.toContain("click");
		expect(page.interactions.mouse.metrics().busy).toBe(false);
	},
);

it.each(["mouseover", "mousemove"])(
	"reports a stale reference after %s detaches the target",
	async (type) => {
		const { hover, page, target, tree } = await fixture();
		page.interactions.events.addEventListener(target, type, () =>
			tree.remove(target),
		);
		await expect(hover()).rejects.toMatchObject({ code: "stale-reference" });
		expect(page.interactions.mouse.metrics().busy).toBe(false);
	},
);

it("preserves an existing held button, focus and modifiers without activation", async () => {
	const { hover, page, target, calls } = await fixture();
	page.interactions.mouse.move(90, 70);
	page.interactions.mouse.down("left");
	page.interactions.keyboard.down("Shift");
	let observed: unknown;
	page.interactions.events.addEventListener(target, "mousemove", (event) => {
		observed = event;
	});
	await hover();
	expect(observed).toMatchObject({ buttons: 1, shiftKey: true });
	expect(page.interactions.mouse.metrics()).toMatchObject({
		buttons: 1,
		pressed: 1,
		busy: false,
	});
	expect(calls).not.toContain("click");
	expect(calls).not.toContain("focus");
	page.interactions.mouse.up("left");
	page.interactions.keyboard.up("Shift");
});

it("aborts controlled movement, unlocks the mouse and preserves a pre-existing hold", async () => {
	const { hover, page, target } = await fixture();
	page.interactions.mouse.move(90, 70);
	page.interactions.mouse.down("left");
	const entered = gate();
	const waiting = gate();
	const controller = new AbortController();
	page.interactions.events.addEventListener(
		target,
		"mousemove",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = hover(controller.signal);
	await entered.pending;
	expect(() => page.interactions.mouse.move(1, 1)).toThrow(
		"Another mouse action",
	);
	controller.abort();
	try {
		await expect(pending).rejects.toMatchObject({ code: "aborted" });
	} finally {
		waiting.release();
	}
	expect(page.interactions.mouse.metrics()).toMatchObject({
		buttons: 1,
		busy: false,
	});
});

it("rejects a pre-aborted signal without moving", async () => {
	const { hover, calls, page } = await fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(hover(controller.signal)).rejects.toMatchObject({
		code: "aborted",
	});
	expect(calls).toEqual([]);
	expect(page.interactions.mouse.metrics().actions).toBe(0);
});

it("aborts pending scroll callbacks before starting a mouse action", async () => {
	const { hover, page, tree, calls } = await fixture(
		"#target{margin-top:200px}",
	);
	const entered = gate();
	const waiting = gate();
	const controller = new AbortController();
	page.interactions.events.addEventListener(
		tree.root,
		"scroll",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = hover(controller.signal);
	await entered.pending;
	controller.abort();
	try {
		await expect(pending).rejects.toMatchObject({ code: "aborted" });
	} finally {
		waiting.release();
	}
	expect(calls).toEqual([]);
	expect(page.interactions.mouse.metrics()).toMatchObject({
		actions: 0,
		busy: false,
		buttons: 0,
	});
});

it("preserves an already-focused control while hovering a different element", async () => {
	const { host, hover, tree, calls } = await fixture(
		"",
		'<button id="target">Go</button><input id="other">',
	);
	await host.execute(["fill", "#other", "kept"]);
	const focused = tree.activeElement;
	expect(focused).not.toBeNull();
	await hover();
	expect(tree.activeElement).toBe(focused);
	expect(calls).not.toContain("focus");
});

it("rejects native hover re-entry while an event dispatch owns the mouse", async () => {
	const { page, target, reference, point } = await fixture();
	const entered = gate();
	const waiting = gate();
	page.interactions.events.addEventListener(
		target,
		"mousemove",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = page.interactions.mouse.hoverTargetAsync(reference, point());
	await entered.pending;
	try {
		await expect(
			page.interactions.mouse.hoverTargetAsync(reference, point()),
		).rejects.toThrow("Another mouse action");
	} finally {
		waiting.release();
	}
	await pending;
	expect(page.interactions.mouse.metrics().busy).toBe(false);
});

it("keeps a canceled mousemove as movement, not an activation default", async () => {
	const { hover, page, target, calls } = await fixture();
	page.interactions.events.addEventListener(target, "mousemove", (event) =>
		event.preventDefault(),
	);
	expect((await hover()).mouse.canceled).toBe(true);
	expect(calls).not.toContain("click");
});

it("rejects ambiguous selectors and unsupported options before movement", async () => {
	const { host, calls } = await fixture(
		"",
		'<button id="target">Go</button><button>Other</button>',
	);
	await expect(host.execute(["hover", "button"])).rejects.toThrow(
		"Target matched multiple elements",
	);
	await expect(host.execute(["hover", "#target", "--force"])).rejects.toThrow();
	expect(calls).toEqual([]);
});

it("reports unsupported fieldset layout instead of substituting semantic movement", async () => {
	const { hover, calls } = await fixture(
		"",
		'<fieldset disabled><button id="target">Go</button></fieldset>',
	);
	await expect(hover()).rejects.toMatchObject({ code: "unsupported" });
	expect(calls).toEqual([]);
});

it("rejects direct targeted movement into an inert subtree before boundaries", async () => {
	const { page, tree, target, reference, calls, point } = await fixture();
	const selected = point();
	tree.setAttribute(target, "inert", "");
	await expect(
		page.interactions.mouse.hoverTargetAsync(reference, selected),
	).rejects.toMatchObject({ code: "not-actionable" });
	expect(calls).toEqual([]);
});

it("runs hover through the real CLI entry with an injected command service", async () => {
	const { host, reference, calls } = await fixture();
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	connection.request.mockImplementation(async (_connection, body) =>
		host.execute(body.argv, { session: body.session }),
	);
	try {
		process.argv = ["node", "agent-browser", "hover", "#target", "--json"];
		vi.resetModules();
		await import("./cli.js");
		await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
		expect(error).not.toHaveBeenCalled();
		expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
			command: "hover",
			session: "default",
			data: {
				reference,
				mouse: { reference, x: 20, y: 10, buttons: 0, canceled: false },
			},
		});
		expect(calls).toEqual(["mouseover", "mouseenter", "mousemove"]);
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		log.mockRestore();
		error.mockRestore();
		connection.request.mockReset();
	}
});
