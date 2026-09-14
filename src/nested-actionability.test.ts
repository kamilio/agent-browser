import { afterEach, expect, it } from "vitest";
import {
	clickActionabilityCapabilities,
	hoverActionabilityCapabilities,
} from "./click-target.js";
import { documentScroll } from "./document-scroll.js";
import { documentElementScroll } from "./element-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

async function fixture(overflow = "auto") {
	const requests: string[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request.url);
				if (request.url !== "https://fixture.invalid/nested-actions")
					throw new Error("Unexpected synthetic destination");
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
				`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#lead{height:120px}#outer{width:90px;height:70px;overflow:auto}#outer-before{height:90px}#inner{width:70px;height:40px;overflow:${overflow}}#inner-before{height:100px}#target{display:block;width:20px;height:20px;padding:0;border:0}#tail{height:300px}</style><div id="lead"></div><div id="outer"><div id="outer-before"></div><div id="inner"><div id="inner-before"></div><button id="target">Go</button></div></div><div id="tail"></div>`,
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/nested-actions");
	const page = session.page(tab.id);
	documentStyles(page.document).setViewport(120, 100);
	const id = (selector: string) => {
		const found = page.queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const reference = page.document.reference(target);
	return { session, tab, page, id, target, reference, requests };
}

it.each(["click", "dblclick", "hover"] as const)(
	"%s reveals nested ports before delivering its pointer events",
	async (command) => {
		for (const overflow of ["auto", "scroll", "hidden"]) {
			const { session, tab, page, id, target, reference, requests } =
				await fixture(overflow);
			const events: string[] = [];
			for (const selector of ["#inner", "#outer"])
				page.interactions.events.addEventListener(id(selector), "scroll", () =>
					events.push(selector),
				);
			for (const type of ["mousemove", "mousedown", "click", "dblclick"])
				page.interactions.events.addEventListener(target, type, () =>
					events.push(type),
				);
			await session[command](tab.id, reference);
			const owner = documentElementScroll(page.document);
			expect(owner.get(id("#inner")).scrollTop).toBeGreaterThan(0);
			expect(owner.get(id("#outer")).scrollTop).toBeGreaterThan(0);
			expect(documentScroll(page.document).get().y).toBeGreaterThan(0);
			expect(events.slice(0, 2)).toEqual(["#inner", "#outer"]);
			expect(events).toContain(command === "hover" ? "mousemove" : command);
			if (command === "hover") expect(events).not.toContain("mousedown");
			expect(requests).toEqual(["https://fixture.invalid/nested-actions"]);
		}
	},
);

it.each(["click", "dblclick", "hover"] as const)(
	"%s retains the non-scrollable clip boundary",
	async (command) => {
		const { session, tab, page, id, target, reference } = await fixture("clip");
		const events: string[] = [];
		for (const type of ["mousemove", "mousedown", "click"])
			page.interactions.events.addEventListener(target, type, () =>
				events.push(type),
			);
		await expect(session[command](tab.id, reference)).rejects.toMatchObject({
			code: "not-actionable",
		});
		expect(
			documentElementScroll(page.document).get(id("#inner")).scrollTop,
		).toBe(0);
		expect(events).toEqual([]);
	},
);

it.each(["click", "dblclick"] as const)(
	"%s rechecks disabled state after an inner scroll listener",
	async (command) => {
		const { session, tab, page, id, target, reference } = await fixture();
		const events: string[] = [];
		page.interactions.events.addEventListener(id("#inner"), "scroll", () =>
			page.document.setAttribute(target, "disabled", ""),
		);
		page.interactions.events.addEventListener(target, "mousedown", () =>
			events.push("mousedown"),
		);
		await expect(session[command](tab.id, reference)).rejects.toMatchObject({
			code: "not-actionable",
		});
		expect(events).toEqual([]);
	},
);

it("advertises bounded nested scrolling without claiming stable-layout or force support", () => {
	for (const capabilities of [
		clickActionabilityCapabilities,
		hoverActionabilityCapabilities,
	])
		expect(capabilities).toMatchObject({
			partial: true,
			rootScroll: true,
			nestedScroll: true,
			stableAnimationFrames: false,
			force: false,
		});
});
