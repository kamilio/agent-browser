import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserMouseEvent } from "./mouse.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";

const owners: {
	session: BrowserSession;
	transportClosed: () => boolean;
}[] = [];

afterEach(() => {
	for (const { session, transportClosed } of owners.splice(0)) {
		session.close();
		expect(transportClosed()).toBe(true);
		expect(session.metrics()).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 0,
		});
	}
});

async function fixture(
	model: "separate" | "collapse",
	options: { css?: string; nested?: boolean } = {},
) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const table =
		'<table id="table"><tbody><tr><td id="first"></td><td id="second"><a id="target" href="/destination">Next</a></td></tr></tbody></table>';
	const content = options.nested
		? `<table id="outer"><tbody><tr><td>${table}</td></tr></tbody></table>`
		: table;
	const bodies = new Map([
		[
			"https://fixture.invalid/start",
			`<!doctype html><title>Start</title><style>*{margin:0;padding:0;border:0;box-sizing:content-box;font-family:'Agent Mono';font-size:10px;line-height:20px}#host{width:320px}table{width:50%;border-collapse:${model};border-spacing:0}td{vertical-align:top}#outer{width:75%}#first{width:25%}#target{display:block;height:20px}#overlay{position:absolute;left:0;top:0;width:640px;height:240px;z-index:2}${options.css ?? ""}</style><main id="host">${content}</main><div id="overlay" hidden></div>`,
		],
		[
			"https://fixture.invalid/destination",
			"<!doctype html><title>Destination</title><h1>Arrived</h1>",
		],
	]);
	const session = new BrowserSession({
		loadDocument: (response, context) =>
			parseHtmlDocument(
				new TextDecoder().decode(response.body),
				response.url,
				context,
			),
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const source = bodies.get(request.url);
				if (source === undefined) throw new Error("Unexpected fixture URL");
				const body = new TextEncoder().encode(source);
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body,
					redirects: [],
					encodedBytes: body.byteLength,
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
	});
	owners.push({ session, transportClosed: () => closed });
	const tab = session.createTab();
	session.resize(tab.id, 400, 240);
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	const id = (selector: string) => {
		const found = page.queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture element ${selector}`);
		return found;
	};
	const target = id("#target");
	const link = session
		.snapshot(tab.id)
		.entries.find((entry) => entry.role === "link" && entry.name === "Next");
	if (!link) throw new Error("Missing discovered percentage-table link");
	expect(link.href).toBe("https://fixture.invalid/destination");
	expect(link.ref).toBe(page.document.reference(target));
	expect(page.queries.querySelector("caption")).toBeNull();
	const rectangle = (selector: string) =>
		documentGeometry(page.document).getBoundingClientRect(id(selector));
	return {
		session,
		tab,
		page,
		target,
		reference: link.ref,
		requests,
		id,
		rectangle,
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function recordPointerEvents(current: Fixture) {
	const { page, target, requests, rectangle } = current;
	const events: { type: string; x: number; y: number }[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, (event) => {
			if (!(event instanceof BrowserMouseEvent))
				throw new Error("Expected native mouse event");
			const bounds = rectangle("#target");
			expect(event.target).toBe(target);
			expect(event.clientX).toBeGreaterThanOrEqual(bounds.left);
			expect(event.clientX).toBeLessThan(bounds.right);
			expect(event.clientY).toBeGreaterThanOrEqual(bounds.top);
			expect(event.clientY).toBeLessThan(bounds.bottom);
			expect(
				documentHitTesting(page.document).elementFromPoint(
					event.clientX,
					event.clientY,
				),
			).toBe(target);
			expect(requests).toHaveLength(1);
			events.push({ type: event.type, x: event.clientX, y: event.clientY });
		});
	return events;
}

async function clickAndExpectNavigation(current: Fixture) {
	const { session, tab, page, reference, requests } = current;
	const events = recordPointerEvents(current);
	const result = await session.click(tab.id, reference);
	expect(events.map((event) => event.type)).toEqual([
		"mousedown",
		"mouseup",
		"click",
	]);
	expect(result.interaction.reference).toBe(reference);
	expect(result.mouse).toMatchObject({
		x: events[2].x,
		y: events[2].y,
		canceled: false,
	});
	expect(result.navigation).toMatchObject({
		kind: "document",
		url: "https://fixture.invalid/destination",
	});
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/destination",
	]);
	expect(session.page(tab.id)).not.toBe(page);
	expect(session.page(tab.id).document.url).toBe(
		"https://fixture.invalid/destination",
	);
	expect(session.page(tab.id).queries.querySelector("h1")).not.toBeNull();
	expect(page.document.nodeCount).toBe(0);
	expect(page.interactions.events.metrics()).toMatchObject({
		closed: true,
		listeners: 0,
	});
	return events;
}

for (const scenario of [
	{ name: "ordinary", css: "", nested: false, width: 160, offset: 0 },
	{
		name: "padded containing block",
		css: "#host{padding:16px}",
		nested: false,
		width: 160,
		offset: 16,
	},
	{ name: "nested percentages", css: "", nested: true, width: 120, offset: 0 },
])
	it.each(["separate", "collapse"] as const)(
		`navigates a discovered ${scenario.name} uncaptioned %s percentage-table link`,
		async (model) => {
			const current = await fixture(model, scenario);
			expect(current.rectangle("#table")).toMatchObject({
				x: scenario.offset,
				y: scenario.offset,
				width: scenario.width,
				height: 20,
			});
			expect(current.rectangle("#first").width).toBe(scenario.width / 4);
			expect(current.rectangle("#target")).toMatchObject({
				x: scenario.offset + scenario.width / 4,
				y: scenario.offset,
				width: (scenario.width * 3) / 4,
				height: 20,
			});
			if (scenario.nested) expect(current.rectangle("#outer").width).toBe(240);
			if (scenario.offset) expect(current.rectangle("#host").width).toBe(352);
			await clickAndExpectNavigation(current);
		},
	);

it.each(["separate", "collapse"] as const)(
	"uses reflowed geometry after a %s percentage-table mutation and viewport resize",
	async (model) => {
		const current = await fixture(model, { css: "#host{width:auto}" });
		const { session, tab, page, id, rectangle } = current;
		const before = rectangle("#target");
		expect(rectangle("#table").width).toBe(200);
		expect(before).toMatchObject({ x: 50, width: 150 });
		page.document.setAttribute(id("#table"), "style", "width:75%");
		expect(rectangle("#table").width).toBe(300);
		expect(rectangle("#target")).toMatchObject({ x: 75, width: 225 });
		session.resize(tab.id, 480, 240);
		expect(rectangle("#table").width).toBe(360);
		expect(rectangle("#target")).toMatchObject({ x: 90, width: 270 });
		expect(before).toMatchObject({ x: 50, width: 150 });
		const events = await clickAndExpectNavigation(current);
		expect(events[2].x).toBeGreaterThan(before.right);
	},
);

it.each(["separate", "collapse"] as const)(
	"dispatches but does not navigate a canceled %s percentage-table link click",
	async (model) => {
		const current = await fixture(model);
		const { session, tab, page, target, reference, requests } = current;
		expect(current.rectangle("#table").width).toBe(160);
		const events = recordPointerEvents(current);
		page.interactions.events.addEventListener(target, "click", (event) =>
			event.preventDefault(),
		);
		const result = await session.click(tab.id, reference);
		expect(events.map((event) => event.type)).toEqual([
			"mousedown",
			"mouseup",
			"click",
		]);
		expect(result.interaction.defaultPrevented).toBe(true);
		expect(result.navigation).toBeUndefined();
		expect(requests).toHaveLength(1);
		expect(session.page(tab.id)).toBe(page);
		expect(page.document.url).toBe("https://fixture.invalid/start");
	},
);

for (const blocked of ["hidden", "covered"] as const)
	it.each(["separate", "collapse"] as const)(
		`does not dispatch or navigate a ${blocked} discovered %s percentage-table link`,
		async (model) => {
			const current = await fixture(model);
			const { session, tab, page, target, reference, requests, id, rectangle } =
				current;
			expect(rectangle("#table").width).toBe(160);
			const bounds = rectangle("#target");
			const events = recordPointerEvents(current);
			if (blocked === "hidden") {
				page.document.setAttribute(target, "hidden", "");
			} else {
				page.document.removeAttribute(id("#overlay"), "hidden");
				expect(
					documentHitTesting(page.document).elementFromPoint(
						bounds.x + bounds.width / 2,
						bounds.y + bounds.height / 2,
					),
				).toBe(id("#overlay"));
			}
			await expect(session.click(tab.id, reference)).rejects.toMatchObject({
				code: "not-actionable",
			});
			expect(events).toEqual([]);
			expect(requests).toHaveLength(1);
			expect(session.page(tab.id)).toBe(page);
			expect(page.document.url).toBe("https://fixture.invalid/start");
		},
	);
