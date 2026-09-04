import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { runWhenActionable } from "./action-wait.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScrollPosition } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});
async function fixture(attributes = "", css = "", extra = "") {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
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
				requests: 1,
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
				`<style>html,body{margin:0}details{width:120px;font-size:16px;line-height:16px}#body{height:400px}${css}</style><div id="spacer"></div><details id="host" ${attributes}><div id="body">Body</div></details><button id="other">Other</button>${extra}`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		timeoutMs: 500,
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/generated-agent"]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	page.styles.setViewport(160, 120);
	const queries = new DocumentQueries(page.document);
	const id = queries.querySelector("#host");
	if (id === null) throw new Error("Missing host");
	const target = documentGeneratedControls(page.document).detailsSummary(id);
	if (!target) throw new Error("Missing generated target");
	const open = () => Object.hasOwn(page.document.get(id).attributes, "open");
	return { host, session, tab, page, id, target, queries, open };
}

it("publishes command snapshots and scopes them to generated headers", async () => {
	const { host, target } = await fixture("open");
	const snapshot = await host.execute(["snapshot"]);
	expect(snapshot.data).toMatchObject({
		entries: expect.arrayContaining([
			expect.objectContaining({
				ref: target.ref,
				role: "button",
				name: "Details",
				expanded: true,
			}),
		]),
	});
	const scoped = await host.execute(["snapshot", target.ref]);
	expect(scoped.data).toMatchObject({
		scope: target.ref,
		entries: [expect.objectContaining({ ref: target.ref })],
	});
	const text = await host.execute(["text"]);
	expect(text.data).toMatchObject({
		text: expect.stringContaining('button "Details"'),
	});
});

it.each(["reference", "role"])(
	"clicks the generated header through an agent %s target",
	async (kind) => {
		const { host, target, open, page } = await fixture();
		const result = await host.execute([
			"click",
			kind === "reference"
				? target.ref
				: 'getByRole("button", {name:"Details", exact:true})',
		]);
		expect(open()).toBe(true);
		expect(result.data).toMatchObject({
			interaction: { reference: target.ref },
		});
		expect(page.interactions.focus.activeReference()).toBe(target.ref);
	},
);

it("hover uses the generated header while page events expose its host", async () => {
	const { host, target, page, id, open } = await fixture();
	const targets: (number | null)[] = [];
	page.interactions.events.addEventListener(id, "mouseover", (event) =>
		targets.push(event.target),
	);
	const result = await host.execute(["hover", target.ref]);
	expect(result.data).toMatchObject({
		reference: target.ref,
		mouse: { reference: page.document.reference(id) },
	});
	expect(targets).toEqual([id]);
	expect(open()).toBe(false);
});

it.each(["Enter", "Space"])(
	"targets generated focus before an agent %s press",
	async (key) => {
		const { host, target, page, open } = await fixture();
		const result = await host.execute(["press", key, "--target", target.ref]);
		expect(open()).toBe(true);
		expect(result.data).toMatchObject({
			keyboard: {
				reference: target.ref,
				interaction: { reference: target.ref },
			},
		});
		expect(page.interactions.focus.activeReference()).toBe(target.ref);
	},
);

it("rejects same-host focus redirection before targeted key dispatch", async () => {
	const { host, target, page, id, open } = await fixture('tabindex="0"');
	const keys: string[] = [];
	page.interactions.events.addEventListener(id, "focus", () =>
		page.document.setActiveElement(id),
	);
	page.interactions.events.addEventListener(id, "keydown", () =>
		keys.push("keydown"),
	);
	await expect(
		host.execute(["press", "Enter", "--target", target.ref]),
	).rejects.toThrow(/lost focus/);
	expect(keys).toEqual([]);
	expect(open()).toBe(false);
});

it("rejects generated focus redirection after an awaited listener", async () => {
	const { host, target, page, id } = await fixture();
	page.interactions.events.addEventListener(
		id,
		"focus",
		controlledEventListener(async () => {
			await Promise.resolve();
			await page.interactions.focus.focusAsync(null);
		}),
	);
	await expect(
		host.execute(["press", "Enter", "--target", target.ref]),
	).rejects.toThrow(/lost focus/);
});

it.each(["start", "center", "end", "nearest"])(
	"scrolls only the generated header rectangle, block=%s",
	async (block) => {
		const { host, target, page } = await fixture(
			"open",
			"#spacer{height:300px}",
		);
		const result = await host.execute([
			"scroll-into-view",
			target.ref,
			"--block",
			block,
		]);
		const rectangle = documentGeometry(page.document).getGeneratedClientRects(
			target.ref,
		)[0];
		expect(result.data).toMatchObject({
			reference: target.ref,
			hasBox: true,
			changed: true,
		});
		expect(rectangle.top).toBeGreaterThanOrEqual(0);
		expect(rectangle.bottom).toBeLessThanOrEqual(120);
		if (block === "start") expect(rectangle.top).toBe(0);
		if (block === "end" || block === "nearest")
			expect(rectangle.bottom).toBe(120);
		if (block === "center")
			expect((rectangle.top + rectangle.bottom) / 2).toBe(60);
	},
);

it("click scrolls an offscreen generated header into view before its pointer sequence", async () => {
	const { host, target, page, open } = await fixture(
		"",
		"#spacer{height:300px}",
	);
	await host.execute(["click", target.ref]);
	expect(documentScrollPosition(page.document).y).toBeGreaterThan(0);
	expect(open()).toBe(true);
});

it("does not bypass an occluded header in click execution or readiness checks", async () => {
	const { session, tab, target, page, open } = await fixture(
		"open",
		"#other{display:none}#cover{position:relative;top:-416px;width:120px;height:16px;background:red}",
		'<div id="cover"></div>',
	);
	await expect(session.click(tab, target.ref)).rejects.toThrow(/actionable/);
	let performed = false;
	await expect(
		runWhenActionable(
			() => page,
			target.ref,
			{ kind: "click" },
			new AbortController().signal,
			() => {
				performed = true;
			},
			{ intervalMs: 1, maxPolls: 1 },
		),
	).rejects.toThrow(/polling/);
	expect(performed).toBe(false);
	expect(open()).toBe(true);
});

it.each(["click", "hover", "scroll-into-view"])(
	"rejects stale generated %s targets after scroll listeners replace the header",
	async (command) => {
		const { host, target, page, id, open } = await fixture(
			"",
			"#spacer{height:300px}",
		);
		page.interactions.events.addEventListener(
			page.document.root,
			"scroll",
			() => page.document.append(id, page.document.createElement("summary")),
		);
		await expect(host.execute([command, target.ref])).rejects.toThrow(
			/available/,
		);
		expect(open()).toBe(false);
	},
);

it("rechecks aria-disabled after scrolling and keeps hover available", async () => {
	const { host, target, page, id, open } = await fixture(
		"",
		"#spacer{height:300px}",
	);
	page.interactions.events.addEventListener(page.document.root, "scroll", () =>
		page.document.setAttribute(id, "aria-disabled", "true"),
	);
	await expect(host.execute(["click", target.ref])).rejects.toThrow(
		/actionable/,
	);
	expect(open()).toBe(false);
	await expect(host.execute(["hover", target.ref])).resolves.toBeDefined();
});

it("returns a generated role locator through the command layer", async () => {
	const { host, target } = await fixture();
	const result = await host.execute(["generate-locator", target.ref]);
	expect(result.data).toMatchObject({
		ref: target.ref,
		strategy: "role",
		locator: expect.stringContaining('getByRole("button"'),
	});
});

it("keeps CSS host clicks distinct from fallback activation", async () => {
	const { host, open } = await fixture("open");
	await host.execute(["click", "#body"]);
	expect(open()).toBe(true);
});

it("does not alias generated references for DOM-only editing", async () => {
	const { host, target, open } = await fixture();
	await expect(host.execute(["fill", target.ref, "text"])).rejects.toThrow();
	expect(open()).toBe(false);
});

it("rejects generated references from a replaced page", async () => {
	const { host, target } = await fixture();
	await host.execute(["open", "https://fixture.invalid/replacement"]);
	await expect(host.execute(["click", target.ref])).rejects.toThrow();
});

it("waits for generated header coverage to clear instead of activating its host", async () => {
	const { host, target, page, open, queries } = await fixture(
		"open",
		"#other{display:none}#cover{position:relative;top:-416px;width:120px;height:16px;background:red}",
		'<div id="cover"></div>',
	);
	const cover = queries.querySelector("#cover");
	if (cover === null) throw new Error("Missing cover");
	const pending = host.execute(["click", target.ref]);
	await Promise.resolve();
	expect(open()).toBe(true);
	page.document.remove(cover);
	await pending;
	expect(open()).toBe(false);
});

it("rejects redirection from an ordinary host to its generated focus identity", async () => {
	const { host, target, page, id, open } = await fixture('tabindex="0"');
	page.interactions.events.addEventListener(id, "focus", () =>
		page.document.setActiveElement(id, target.ref),
	);
	await expect(
		host.execute(["press", "Enter", "--target", "#host"]),
	).rejects.toThrow(/lost focus/);
	expect(open()).toBe(false);
});

it("rechecks generated availability after awaited scroll handlers", async () => {
	const { host, target, page, id, open } = await fixture(
		"",
		"#spacer{height:300px}",
	);
	page.interactions.events.addEventListener(
		page.document.root,
		"scroll",
		controlledEventListener(async () => {
			await Promise.resolve();
			page.document.append(id, page.document.createElement("summary"));
		}),
	);
	await expect(host.execute(["click", target.ref])).rejects.toThrow(
		/available/,
	);
	expect(open()).toBe(false);
});

it("rejects a generated scroll target that loses its box during scroll events", async () => {
	const { host, target, page, id } = await fixture("", "#spacer{height:300px}");
	page.interactions.events.addEventListener(page.document.root, "scroll", () =>
		page.document.setAttribute(id, "hidden", ""),
	);
	await expect(host.execute(["scroll-into-view", target.ref])).rejects.toThrow(
		/layout box/,
	);
});

it("keeps generated targets actionable after a same-document open/close cycle", async () => {
	const { host, target, open } = await fixture();
	await host.execute(["click", target.ref]);
	await host.execute(["press", "Space", "--target", target.ref]);
	expect(open()).toBe(false);
	await host.execute(["click", target.ref]);
	expect(open()).toBe(true);
});
