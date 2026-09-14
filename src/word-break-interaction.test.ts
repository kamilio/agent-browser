import { afterEach, expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserMouseEvent } from "./mouse.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";
import { layoutDocumentText } from "./text-layout.js";

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

async function fixture(css = "") {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const bodies = new Map([
		[
			"https://fixture.invalid/start",
			`<!doctype html><title>Start</title><style>*{margin:0;padding:0;border:0;box-sizing:content-box;font-family:'Agent Mono';font-size:8px;font-weight:400;line-height:10px}html,body{background:white}.title{width:50%}.title a{color:black;text-decoration:none;word-break:break-word;overflow-wrap:normal}${css}</style><main class="title"><a id="target" href="/destination">ABCDEFGHI</a></main>`,
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
	session.resize(tab.id, 60, 60);
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	const target = page.queries.querySelector(".title a");
	const title = page.queries.querySelector(".title");
	if (target === null || title === null)
		throw new Error("Missing synthetic title link");
	const snapshot = session.snapshot(tab.id);
	const link = snapshot.entries.find(
		(entry) => entry.role === "link" && entry.name === "ABCDEFGHI",
	);
	if (!link) throw new Error("Missing discovered title link");
	expect(link.href).toBe("https://fixture.invalid/destination");
	expect(link.ref).toBe(page.document.reference(target));
	return {
		session,
		tab,
		page,
		target,
		title,
		reference: link.ref,
		requests,
		snapshot,
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function expectLayout(current: Fixture, lines: string[], width = 30) {
	const { page, target, title } = current;
	const context = layoutDocumentText(page.document).contexts.find(
		(entry) => entry.ref === page.document.reference(title),
	);
	if (!context) throw new Error("Missing title text context");
	expect(
		context.lines.map((line) =>
			context.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.map((glyph) => glyph.character)
				.join(""),
		),
	).toEqual(lines);
	expect(context.lines.map((line) => line.overflow)).toEqual(
		lines.map((line) => Math.max(0, line.length * 6 - width)),
	);
	const geometry = documentGeometry(page.document);
	expect(geometry.getBoundingClientRect(title)).toMatchObject({
		x: 0,
		y: 0,
		width,
		height: lines.length * 10,
	});
	const rectangles = geometry.getClientRects(target);
	expect(rectangles).toHaveLength(lines.length);
	for (const [index, rectangle] of rectangles.entries()) {
		expect(rectangle).toMatchObject({
			x: 0,
			y: 1 + index * 10,
			width: lines[index].length * 6,
			height: 8,
		});
		expect(
			documentHitTesting(page.document).elementFromPoint(
				rectangle.x + 3,
				rectangle.y + rectangle.height / 2,
			),
		).toBe(target);
	}
	expect(page.document.textContent(target)).toBe("ABCDEFGHI");
	return rectangles;
}

function expectPixels(current: Fixture, lines: string[], width = 60) {
	const raster = rasterizeDocument(current.page.document);
	expect(raster.image).toMatchObject({ width, height: 60 });
	const expected = new Uint8Array(width * 60 * 4).fill(255);
	for (const [lineIndex, line] of lines.entries())
		for (const [characterIndex, character] of [...line].entries())
			for (let row = 0; row < 8; row++)
				for (let column = 0; column < 5; column++)
					if (bitmapGlyph(character).rows[row] & (16 >> column)) {
						const horizontal = characterIndex * 6 + column;
						const vertical = 1 + lineIndex * 10 + row;
						const offset = (vertical * width + horizontal) * 4;
						expected.set([0, 0, 0, 255], offset);
					}
	expect(raster.image.pixels).toEqual(expected);
	expect(raster.metrics.paintedGlyphs).toBe(9);
	return raster.image.pixels;
}

function expectIndependentStyle(current: Fixture, wordBreak: string) {
	const { page, target } = current;
	expect(resolvedStyleValue(page.document, target, "word-break")).toBe(
		wordBreak,
	);
	expect(resolvedStyleValue(page.document, target, "overflow-wrap")).toBe(
		"normal",
	);
}

async function clickLink(current: Fixture, canceled = false) {
	const { session, tab, page, target, reference, requests } = current;
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, (event) => {
			if (!(event instanceof BrowserMouseEvent))
				throw new Error("Expected native mouse event");
			expect(event.target).toBe(target);
			expect(
				documentGeometry(page.document)
					.getClientRects(target)
					.some(
						(rectangle) =>
							event.clientX >= rectangle.left &&
							event.clientX < rectangle.right &&
							event.clientY >= rectangle.top &&
							event.clientY < rectangle.bottom,
					),
			).toBe(true);
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

it("paints exact synthetic wrapped title pixels and navigates its discovered link", async () => {
	const current = await fixture();
	expectLayout(current, ["ABCDE", "FGHI"]);
	expectPixels(current, ["ABCDE", "FGHI"]);
	expectIndependentStyle(current, "break-word");
	await clickLink(current);
});

it("dispatches a wrapped title click without navigating when canceled", async () => {
	const current = await fixture();
	const before = expectLayout(current, ["ABCDE", "FGHI"]);
	expectPixels(current, ["ABCDE", "FGHI"]);
	expectIndependentStyle(current, "break-word");
	await clickLink(current, true);
	expect(expectLayout(current, ["ABCDE", "FGHI"])).toEqual(before);
	expectIndependentStyle(current, "break-word");
});

it("reflows inherited title breaking after reset and resize while retaining prior snapshots", async () => {
	const current = await fixture(
		".title{word-break:break-word;overflow-wrap:normal}.title a{word-break:inherit}",
	);
	const { session, tab, page, target, snapshot } = current;
	const entries = snapshot.entries.map((entry) => ({ ...entry }));
	const before = expectLayout(current, ["ABCDE", "FGHI"]);
	const rectangles = before.map((rectangle) => ({ ...rectangle }));
	const pixels = expectPixels(current, ["ABCDE", "FGHI"]);
	const retainedPixels = pixels.slice();
	expectIndependentStyle(current, "break-word");
	page.document.setAttribute(target, "style", "word-break:normal");
	expectLayout(current, ["ABCDEFGHI"]);
	expectIndependentStyle(current, "normal");
	expect(expectPixels(current, ["ABCDEFGHI"])).not.toEqual(pixels);
	page.document.removeAttribute(target, "style");
	expectLayout(current, ["ABCDE", "FGHI"]);
	expect(expectPixels(current, ["ABCDE", "FGHI"])).toEqual(pixels);
	session.resize(tab.id, 36, 60);
	expectLayout(current, ["ABC", "DEF", "GHI"], 18);
	expectPixels(current, ["ABC", "DEF", "GHI"], 36);
	expectIndependentStyle(current, "break-word");
	await clickLink(current);
	expect(before).toEqual(rectangles);
	expect(pixels).toEqual(retainedPixels);
	expect(snapshot.entries).toEqual(entries);
});

it("respects inherited nowrap until mutation enables real title wrapping", async () => {
	const current = await fixture(".title{white-space:nowrap}");
	expectLayout(current, ["ABCDEFGHI"]);
	expectPixels(current, ["ABCDEFGHI"]);
	current.page.document.setAttribute(
		current.title,
		"style",
		"white-space:normal",
	);
	expectLayout(current, ["ABCDE", "FGHI"]);
	expectPixels(current, ["ABCDE", "FGHI"]);
	expectIndependentStyle(current, "break-word");
	await clickLink(current);
});
