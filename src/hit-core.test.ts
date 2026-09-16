import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { computedStyleProperties } from "./computed-styles.js";
import { directDeclaration } from "./css-declarations.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { documentHitTesting, hitTestCapabilities } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

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
const doms: ScriptDom[] = [];
afterEach(() => {
	for (const dom of doms.splice(0)) dom.close();
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
});
async function fixture(css = "", extra = "") {
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
				`<!doctype html><style>html,body{margin:0;padding:0}main{width:400px;height:500px}#before{height:160px}#target{margin-left:150px;width:20px;height:20px;background:blue}#after{height:320px}#overlay{position:relative;top:-20px;margin-left:150px;width:20px;height:20px;background:red;z-index:2}${css}</style><main><div id="before"></div><div id="target" tabindex="0"></div>${extra}<div id="after"></div></main>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/hit-core"]);
	await host.execute(["resize", "100", "80"]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	const queries = new DocumentQueries(page.document);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const dom = new ScriptDom(page.document, {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			Object.assign(object, definition.methods);
			return object;
		},
	});
	doms.push(dom);
	const tree = page.document;
	return {
		host,
		session,
		tab,
		page,
		tree,
		id,
		dom,
		requests,
		reference: tree.reference(id("#target")),
		scroll: documentScroll(tree),
		hits: documentHitTesting(tree),
	};
}

it("exposes the hit-test and scroll-into-view commands without changing inspection state", async () => {
	const { host, tree, page, scroll, reference, id } = await fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		hitTesting: {
			command: "hit-test",
			pointerEventsCss: true,
			scroll: "root-viewport",
		},
		scrollIntoView: {
			command: "scroll-into-view",
			containerScope: "nested-scrollports",
		},
		clientGeometry: { scroll: "root-viewport" },
		interactionStyles: {
			properties: ["pointer-events", "cursor"],
			cursorImages: false,
			systemCursor: false,
		},
	});
	scroll.to(100, 140);
	const revision = tree.revision;
	expect((await host.execute(["hit-test", "55.5", "25.5"])).data).toMatchObject(
		{
			reference,
			references: [
				reference,
				tree.reference(id("main")),
				tree.reference(id("html")),
			],
			x: 55.5,
			y: 25.5,
			revision,
		},
	);
	expect(tree.revision).toBe(revision);
	expect(page.interactions.focus.active()).toBeNull();
});

it("scrolls by stable target and makes command geometry, capture and hit stacks agree", async () => {
	const { host, tree, reference, requests } = await fixture();
	expect(
		(await host.execute(["scroll-into-view", reference, "--block=nearest"]))
			.data,
	).toMatchObject({
		reference,
		hasBox: true,
		changed: true,
		scroll: { x: 70, y: 100 },
	});
	expect((await host.execute(["geometry", reference])).data).toMatchObject({
		bounds: { x: 80, y: 60 },
		scroll: { x: 70, y: 100 },
	});
	expect((await host.execute(["hit-test", "85", "65"])).data).toMatchObject({
		reference,
	});
	const capture = rasterizeDocument(tree);
	expect(capture.clip).toMatchObject({ x: 70, y: 100 });
	const pixel = (65 * capture.image.width + 85) * 4;
	expect(Array.from(capture.image.pixels.slice(pixel, pixel + 4))).toEqual([
		0, 0, 255, 255,
	]);
	expect(requests).toHaveLength(1);
});

it("shares guest hit methods with native reference stacks and revokes them on close", async () => {
	const { tree, id, dom, scroll, hits } = await fixture();
	scroll.to(100, 140);
	const document = dom.document as {
		elementFromPoint(horizontal: unknown, vertical: unknown): object | null;
		elementsFromPoint(horizontal: unknown, vertical: unknown): object[];
	};
	expect(document.elementFromPoint("55", "25")).toBe(dom.node(id("#target")));
	expect(document.elementsFromPoint(55, 25)).toEqual(
		hits.elementsFromPoint(55, 25).map((target) => dom.node(target)),
	);
	expect(document.elementFromPoint(-1, 0)).toBeNull();
	dom.close();
	expect(() => document.elementFromPoint(55, 25)).toThrow(/closed/);
	expect(hits.elementFromPoint(55, 25)).toBe(id("#target"));
	tree.close();
	expect(() => hits.elementFromPoint(55, 25)).toThrow(/closed/);
});

it("changes hit targets through live CSSOM without changing overlay pixels or geometry", async () => {
	const { tree, id, dom, scroll, hits } = await fixture(
		"",
		'<div id="overlay"></div>',
	);
	scroll.to(100, 140);
	const overlay = id("#overlay");
	const bounds = documentGeometry(tree).getBoundingClientRect(overlay);
	const pixels = rasterizeDocument(tree).image.pixels.slice();
	expect(hits.elementFromPoint(55, 25)).toBe(overlay);
	const element = dom.node(overlay) as { style: { pointerEvents: string } };
	element.style.pointerEvents = "none";
	expect(hits.elementFromPoint(55, 25)).toBe(id("#target"));
	expect(documentGeometry(tree).getBoundingClientRect(overlay)).toEqual(bounds);
	expect(rasterizeDocument(tree).image.pixels).toEqual(pixels);
	expect(computedStyleProperties).toContain("pointer-events");
	const style = dom.getComputedStyle(element) as { pointerEvents: string };
	expect(style.pointerEvents).toBe("none");
	element.style.pointerEvents = "auto";
	expect(style.pointerEvents).toBe("auto");
	expect(hits.elementFromPoint(55, 25)).toBe(overlay);
});

it.each(["auto", "initial", "none", "inherit", "unset", "revert"])(
	"integrates %s pointer policy with cascade and computed CSSOM",
	async (value) => {
		const { id, dom, page, scroll, hits } = await fixture(
			"main{pointer-events:none}",
		);
		expect(directDeclaration("pointer-events", value, false)).toHaveLength(1);
		const target = dom.node(id("#target")) as {
			style: { pointerEvents: string };
		};
		target.style.pointerEvents = value;
		scroll.to(100, 140);
		const expected = ["auto", "initial"].includes(value) ? "auto" : "none";
		expect(page.styles.pointerEvents(id("#target"))).toBe(expected);
		expect(
			(dom.getComputedStyle(target) as { pointerEvents: string }).pointerEvents,
		).toBe(expected);
		expect(hits.elementFromPoint(55, 25) === id("#target")).toBe(
			expected === "auto",
		);
	},
);

it("allows explicit descendant overrides without overriding ancestor inertness", async () => {
	const { tree, id, scroll, hits } = await fixture(
		"#overlay{pointer-events:none}#child{pointer-events:auto;display:block;width:10px;height:10px}",
		'<div id="overlay"><span id="child"></span></div>',
	);
	scroll.to(100, 140);
	expect(hits.elementFromPoint(55, 25)).toBe(id("#child"));
	tree.setAttribute(id("#overlay"), "inert", "");
	expect(hits.elementFromPoint(55, 25)).toBe(id("#target"));
});

it("invalidates hit regions after custom-property and important cascade changes", async () => {
	const { tree, id, scroll, hits } = await fixture(
		"main{--policy:none}#overlay{pointer-events:var(--policy)}",
		'<div id="overlay"></div>',
	);
	scroll.to(100, 140);
	expect(hits.elementFromPoint(55, 25)).toBe(id("#target"));
	tree.setAttribute(id("main"), "style", "--policy:auto");
	expect(hits.elementFromPoint(55, 25)).toBe(id("#overlay"));
	tree.setAttribute(
		id("#overlay"),
		"style",
		"pointer-events:none!important;pointer-events:auto",
	);
	expect(hits.elementFromPoint(55, 25)).toBe(id("#target"));
});

it.each(["NaN", "Infinity", "", "invalid"])(
	"rejects invalid command coordinates without movement: %s",
	async (coordinate) => {
		const { host, scroll } = await fixture();
		await expect(
			host.execute(["hit-test", coordinate, "0"]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it.each(["#missing", "div"])(
	"rejects missing or ambiguous scroll targets: %s",
	async (selector) => {
		const { host, scroll } = await fixture();
		await expect(
			host.execute(["scroll-into-view", selector]),
		).rejects.toThrow();
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it.each([
	["--block=wrong", "invalid-input"],
	["--behavior=smooth", "unsupported"],
] as const)(
	"rejects unsupported alignment before moving: %s",
	async (option, code) => {
		const { host, scroll } = await fixture();
		await expect(
			host.execute(["scroll-into-view", "#target", option]),
		).rejects.toMatchObject({ code });
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it("reports a boxless scroll target and recovers after style reset", async () => {
	const { host, tree, id } = await fixture();
	tree.setAttribute(id("#target"), "style", "display:none");
	await expect(
		host.execute(["scroll-into-view", "#target"]),
	).rejects.toMatchObject({ code: "not-actionable" });
	tree.setAttribute(id("#target"), "style", "");
	expect(
		(await host.execute(["scroll-into-view", "#target"])).data,
	).toMatchObject({ hasBox: true });
});

it.each(["before", "during"])(
	"honors session abort %s scroll notification",
	async (phase) => {
		const { session, tab, reference, scroll, page } = await fixture();
		const controller = new AbortController();
		if (phase === "before") controller.abort();
		else
			page.interactions.events.addEventListener(
				page.document.root,
				"scroll",
				() => controller.abort(),
			);
		await expect(
			session.scrollIntoView(tab, reference, {}, { signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
		expect(scroll.get()).toEqual(
			phase === "before" ? { x: 0, y: 0 } : { x: 70, y: 160 },
		);
	},
);

it("rejects stale scroll references after navigation and does not reuse old hit owners", async () => {
	const { host, reference, hits } = await fixture();
	await host.execute(["goto", "https://fixture.invalid/replacement"]);
	await expect(host.execute(["scroll-into-view", reference])).rejects.toThrow();
	expect(hits.metrics().closed).toBe(true);
	expect((await host.execute(["geometry", "#target"])).data).toMatchObject({
		scroll: { x: 0, y: 0 },
	});
});

it("interrupts a pending scroll-listener prefix through the session's abort signal", async () => {
	const { session, tab, reference, page, scroll } = await fixture();
	expect(typeof session.scrollIntoView).toBe("function");
	let enter!: () => void;
	let release!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	page.interactions.events.addEventListener(
		page.document.root,
		"scroll",
		controlledEventListener(() => {
			enter();
			return prefix;
		}),
	);
	const controller = new AbortController();
	let failure: unknown;
	const pending = session
		.scrollIntoView(tab, reference, {}, { signal: controller.signal })
		.catch((error) => {
			failure = error;
		});
	await entered;
	controller.abort();
	try {
		await vi.waitFor(() => expect(failure).toMatchObject({ code: "aborted" }), {
			timeout: 300,
		});
		expect(scroll.get()).toEqual({ x: 70, y: 160 });
		expect(page.interactions.events.metrics().activeDispatches).toBe(0);
	} finally {
		release();
		await pending;
	}
});

it("executes the CLI hit-test entry through an injected in-memory connection", async () => {
	const { host, reference } = await fixture();
	await host.execute(["scroll-into-view", reference, "--block=nearest"]);
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		connection.request.mockImplementation(async (_connection, body) =>
			host.execute(body.argv),
		);
		process.argv = ["node", "agent-browser", "hit-test", "85", "65", "--json"];
		vi.resetModules();
		await import("./cli.js");
		await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
		expect(error).not.toHaveBeenCalled();
		expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
			command: "hit-test",
			data: { reference, x: 85, y: 65 },
		});
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
	}
});

it("reports the implemented scroll profile in native capabilities", () => {
	expect(hitTestCapabilities.scroll).toBe("root-viewport");
});
