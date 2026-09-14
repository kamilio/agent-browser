import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentRaster, rasterizeDocument } from "./document-raster.js";
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

async function fixture(model: "separate" | "collapse") {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const bodies = new Map([
		[
			"https://fixture.invalid/start",
			`<!doctype html><title>Start</title><style>*{margin:0;padding:0;border:0;box-sizing:content-box;font-family:'Agent Mono';font-size:8px;line-height:8px}html,body{background:white}#table{width:80%;border-collapse:${model};border-spacing:0}td{vertical-align:top}#first{width:25%;height:80px;background:yellow}#cell{width:75%}#fieldset{padding:4px;border:2px solid red;background:white}#query,#submit{display:block;width:40px}#query{height:16px}#submit{height:12px}#target{display:block;height:20px;background:blue;color:white}#after{height:4px;background:lime}</style><main><table id="table"><tbody><tr><td id="first"></td><td id="cell"><div id="wrapper"><form id="form" action="/unexpected-submit"><fieldset id="fieldset"><input id="query" type="text" name="q" aria-label="Query"><input id="hidden" type="hidden" name="mode" value="search"><input id="submit" type="submit" value="Go"></fieldset></form><a id="target" href="/destination">Next</a></div></td></tr></tbody></table><div id="after"></div></main>`,
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
	session.resize(tab.id, 400, 160);
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	const id = (selector: string) => {
		const found = page.queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture element ${selector}`);
		return found;
	};
	const geometry = documentGeometry(page.document);
	const rectangle = (selector: string) =>
		geometry.getBoundingClientRect(id(selector));
	const target = id("#target");
	const entries = session.snapshot(tab.id).entries;
	const link = entries.find(
		(entry) => entry.role === "link" && entry.name === "Next",
	);
	if (!link) throw new Error("Missing discovered fieldset-table link");
	expect(link.href).toBe("https://fixture.invalid/destination");
	expect(link.ref).toBe(page.document.reference(target));
	expect(entries).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				ref: page.document.reference(id("#query")),
				role: "textbox",
				name: "Query",
			}),
			expect.objectContaining({
				ref: page.document.reference(id("#submit")),
				role: "button",
				name: "Go",
			}),
		]),
	);
	expect(
		entries.some(
			(entry) => entry.ref === page.document.reference(id("#hidden")),
		),
	).toBe(false);
	return {
		session,
		tab,
		page,
		id,
		rectangle,
		target,
		reference: link.ref,
		requests,
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function pixel(
	raster: Readonly<DocumentRaster>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * raster.image.width + horizontal) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

function expectGeometryAndPaint(current: Fixture, width = 320, padding = 4) {
	const { page, id, rectangle } = current;
	const left = width / 4;
	const cellWidth = (width * 3) / 4;
	const height = 32 + padding * 2;
	expect(rectangle("#table")).toMatchObject({ x: 0, y: 0, width, height: 80 });
	expect(rectangle("#first")).toMatchObject({ width: left, height: 80 });
	expect(rectangle("#cell")).toMatchObject({
		x: left,
		y: 0,
		width: cellWidth,
		height: 80,
	});
	for (const selector of ["#form", "#fieldset"])
		expect(rectangle(selector)).toMatchObject({
			x: left,
			y: 0,
			width: cellWidth,
			height,
		});
	expect(rectangle("#query")).toMatchObject({
		x: left + 2 + padding,
		y: 2 + padding,
		width: 40,
		height: 16,
	});
	expect(rectangle("#submit")).toMatchObject({
		x: left + 2 + padding,
		y: 18 + padding,
		width: 40,
		height: 12,
	});
	expect(documentGeometry(page.document).getClientRects(id("#hidden"))).toEqual(
		[],
	);
	expect(rectangle("#target")).toMatchObject({
		x: left,
		y: height,
		width: cellWidth,
		height: 20,
	});
	expect(rectangle("#wrapper").height).toBe(height + 20);
	expect(rectangle("#after")).toMatchObject({ x: 0, y: 80, height: 4 });
	const raster = rasterizeDocument(page.document);
	const hits = documentHitTesting(page.document);
	for (const [horizontal, vertical, color, selector] of [
		[2, 2, [255, 255, 0, 255], "#first"],
		[left, 0, [255, 0, 0, 255], "#fieldset"],
		[left + 3, 3, [255, 255, 255, 255], "#fieldset"],
		[width - 4, height + 2, [0, 0, 255, 255], "#target"],
		[2, 82, [0, 255, 0, 255], "#after"],
	] as const) {
		expect(pixel(raster, horizontal, vertical)).toEqual(color);
		expect(hits.elementFromPoint(horizontal, vertical)).toBe(id(selector));
	}
	for (const selector of ["#query", "#submit"]) {
		const bounds = rectangle(selector);
		expect(hits.elementFromPoint(bounds.x + 2, bounds.y + 2)).toBe(
			id(selector),
		);
	}
	return raster;
}

async function clickLink(current: Fixture, canceled = false) {
	const { session, tab, page, target, reference, requests, rectangle } =
		current;
	const events: string[] = [];
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
			events.push(event.type);
			if (canceled && type === "click") event.preventDefault();
		});
	const result = await session.click(tab.id, reference);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(result.interaction.reference).toBe(reference);
	if (canceled) {
		expect(result.interaction.defaultPrevented).toBe(true);
		expect(result.navigation).toBeUndefined();
		expect(requests.map((request) => request.url)).toEqual([
			"https://fixture.invalid/start",
		]);
		expect(session.page(tab.id)).toBe(page);
		expect(page.document.url).toBe("https://fixture.invalid/start");
	} else {
		expect(result.mouse).toMatchObject({ canceled: false });
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
	}
}

it.each(["separate", "collapse"] as const)(
	"clicks a control and navigates after an auto-height fieldset in a %s percentage cell",
	async (model) => {
		const current = await fixture(model);
		expectGeometryAndPaint(current);
		const { session, tab, page, id, requests } = current;
		const query = id("#query");
		const result = await session.click(tab.id, page.document.reference(query));
		expect(result.navigation).toBeUndefined();
		expect(page.document.activeElement).toBe(query);
		expect(requests).toHaveLength(1);
		await clickLink(current);
	},
);

it.each(["separate", "collapse"] as const)(
	"cancels navigation after an auto-height fieldset in a %s percentage cell",
	async (model) => {
		const current = await fixture(model);
		expectGeometryAndPaint(current);
		await clickLink(current, true);
		expectGeometryAndPaint(current);
	},
);

it.each(["separate", "collapse"] as const)(
	"reflows fieldset pixels and link hits after resize and padding mutation in a %s percentage cell",
	async (model) => {
		const current = await fixture(model);
		const { session, tab, page, id, rectangle } = current;
		const before = rectangle("#target");
		expectGeometryAndPaint(current);
		session.resize(tab.id, 480, 160);
		const resized = expectGeometryAndPaint(current, 384);
		expect(pixel(resized, 380, 42)).toEqual([0, 0, 255, 255]);
		page.document.setAttribute(id("#fieldset"), "style", "padding:8px");
		const mutated = expectGeometryAndPaint(current, 384, 8);
		expect(pixel(mutated, 380, 42)).toEqual([255, 255, 255, 255]);
		expect(documentHitTesting(page.document).elementFromPoint(380, 42)).toBe(
			id("#fieldset"),
		);
		expect(before).toMatchObject({ x: 80, y: 40, width: 240, height: 20 });
		expect(pixel(resized, 380, 42)).toEqual([0, 0, 255, 255]);
		await clickLink(current);
	},
);
