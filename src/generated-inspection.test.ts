import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import {
	decodeArtifactChunk,
	type CaptureArtifact,
	type ArtifactChunk,
} from "./capture-artifacts.js";
import { documentGeometry, type ClientRectangle } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodePng } from "./png-decoder.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
const markup = (attributes = "", css = "") =>
	`<style>html,body{margin:0}details{width:120px;font-size:16px;line-height:16px;background:#eeeeee}#body{height:64px;background:blue}${css}</style><details id="host" ${attributes}><div id="body">Body</div></details>`;
function setup(tree: DocumentTree) {
	documentStyles(tree).setViewport(160, 120);
	const owner = new DocumentQueries(tree).querySelector("#host");
	if (owner === null) throw new Error("Missing details host");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(owner);
	if (!target) throw new Error("Missing generated header");
	const geometry = documentGeometry(tree);
	const bounds = () =>
		Reflect.apply(
			Reflect.get(geometry, "getGeneratedBoundingClientRect"),
			geometry,
			[target.ref],
		) as ClientRectangle;
	const documentRects = () =>
		Reflect.apply(
			Reflect.get(geometry, "getGeneratedDocumentRects"),
			geometry,
			[target.ref],
		) as readonly ClientRectangle[];
	return { tree, owner, target, controls, geometry, bounds, documentRects };
}
function fixture(attributes = "", css = "") {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		markup(attributes, css),
		"https://fixture.invalid/generated-inspection",
	);
	documents.push(tree);
	return setup(tree);
}
async function commandFixture(attributes = "open", css = "") {
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
			parseHtmlDocument(markup(attributes, css), response.url),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		timeoutMs: 500,
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/generated-inspection"]);
	return { host, ...setup(session.page(session.tabs()[0].id).document) };
}

it.each([false, true])(
	"returns generated bounds independently of host-body size, open=%s",
	(open) => {
		const { tree, owner, target, geometry, bounds, documentRects } = fixture(
			open ? "open" : "",
		);
		const revision = tree.revision;
		expect(bounds()).toEqual(geometry.getGeneratedClientRects(target.ref)[0]);
		expect(bounds()).toMatchObject({ x: 0, y: 0, width: 120, height: 16 });
		expect(documentRects()).toEqual([bounds()]);
		expect(geometry.getBoundingClientRect(owner).height).toBe(open ? 80 : 16);
		expect(tree.revision).toBe(revision);
	},
);

it("keeps document rectangles fixed while client bounds track both scroll axes", () => {
	const { tree, target, geometry, bounds, documentRects } = fixture(
		"open",
		"details{margin-left:200px;margin-top:200px}#body{height:400px}",
	);
	const original = documentRects();
	documentScroll(tree).to(40, 100);
	expect(documentRects()).toEqual(original);
	expect(bounds()).toMatchObject({
		x: original[0].x - 40,
		y: original[0].y - 100,
	});
	expect(bounds()).toEqual(geometry.getGeneratedClientRects(target.ref)[0]);
});

it("retains immutable geometry and reuses the revision cache", () => {
	const { geometry, bounds, documentRects } = fixture();
	const rectangle = bounds();
	const list = documentRects();
	const builds = geometry.metrics().builds;
	expect(Object.isFrozen(rectangle)).toBe(true);
	expect(Object.isFrozen(list)).toBe(true);
	expect(Object.isFrozen(list[0])).toBe(true);
	expect(bounds()).toBe(rectangle);
	expect(documentRects()).toBe(list);
	expect(geometry.metrics().builds).toBe(builds);
});

it("recomputes generated bounds after layout changes without changing the reference", () => {
	const { tree, owner, target, bounds } = fixture();
	expect(bounds().width).toBe(120);
	tree.setAttribute(owner, "style", "width:80px;line-height:24px");
	expect(bounds()).toMatchObject({ width: 80, height: 48 });
	expect(documentGeneratedControls(tree).detailsSummary(owner)?.ref).toBe(
		target.ref,
	);
});

it("returns zero bounds for a boxless available target even after scrolling", () => {
	const { tree, owner, bounds, documentRects } = fixture(
		"open",
		"#body{height:400px}",
	);
	documentScroll(tree).to(0, 40);
	tree.setAttribute(owner, "hidden", "");
	expect(documentRects()).toEqual([]);
	expect(bounds()).toEqual({
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: 0,
		height: 0,
	});
});

it("does not confuse invisible geometry with painted capture availability", () => {
	const { tree, target, bounds } = fixture("", "details{visibility:hidden}");
	expect(bounds().height).toBe(16);
	expect(() => rasterizeDocument(tree, { element: target.ref })).toThrow(
		/visible/,
	);
});

it.each(["summary", "detach", "registry", "geometry", "document"])(
	"revokes generated inspection after %s invalidation",
	(change) => {
		const { tree, owner, target, controls, geometry, bounds, documentRects } =
			fixture();
		bounds();
		if (change === "summary") tree.append(owner, tree.createElement("summary"));
		else if (change === "detach") tree.remove(owner);
		else if (change === "registry") controls.close();
		else if (change === "geometry") geometry.close();
		else tree.close();
		expect(() => bounds()).toThrow();
		expect(() => documentRects()).toThrow();
		expect(() => geometry.getGeneratedClientRects(target.ref)).toThrow();
	},
);

it("does not accept foreign or ordinary refs in generated geometry methods", () => {
	const { tree, owner, geometry } = fixture();
	const foreign = fixture();
	for (const reference of [
		foreign.target.ref,
		tree.reference(owner),
		"u0-details-1",
	])
		for (const method of [
			"getGeneratedClientRects",
			"getGeneratedDocumentRects",
			"getGeneratedBoundingClientRect",
		])
			expect(() =>
				Reflect.apply(Reflect.get(geometry, method), geometry, [reference]),
			).toThrow();
});

it.each([false, true])(
	"crops generated captures to the header only, open=%s",
	(open) => {
		const { tree, target } = fixture(open ? "open" : "");
		const result = rasterizeDocument(tree, { element: target.ref });
		expect(result.clip).toEqual({ x: 0, y: 0, width: 120, height: 16 });
		expect(result.image.width).toBe(120);
		expect(result.image.height).toBe(16);
		expect(result.metrics.paintedMarkers).toBe(1);
		for (let offset = 0; offset < result.image.pixels.length; offset += 4)
			expect([...result.image.pixels.slice(offset, offset + 4)]).not.toEqual([
				0, 0, 255, 255,
			]);
	},
);

it("preserves document-space crop coordinates for offscreen scrolled targets", () => {
	const { tree, target } = fixture(
		"open",
		"details{margin-top:300px}#body{height:400px}",
	);
	documentScroll(tree).to(0, 200);
	const result = rasterizeDocument(tree, { element: target.ref });
	expect(result.clip).toEqual({ x: 0, y: 300, width: 120, height: 16 });
	expect(result.metrics.paintedMarkers).toBe(1);
});

it("rounds generated crop boundaries outward for fractional geometry", () => {
	const { tree, target, bounds } = fixture(
		"",
		"details{margin-left:0.5px;width:120.25px}",
	);
	const rectangle = bounds();
	const capture = rasterizeDocument(tree, { element: target.ref });
	expect(capture.clip.x).toBe(Math.floor(rectangle.left));
	expect(capture.clip.width).toBe(
		Math.ceil(rectangle.right) - Math.floor(rectangle.left),
	);
});

it("shares generated crop behavior with prepared layouts and rejects stale preparations", () => {
	const { tree, owner, target } = fixture();
	const prepared = prepareDocumentRaster(tree);
	expect(prepared.rasterize({ element: target.ref }).image.pixels).toEqual(
		rasterizeDocument(tree, { element: target.ref }).image.pixels,
	);
	tree.setAttribute(owner, "open", "");
	expect(() => prepared.rasterize({ element: target.ref })).toThrow(/stale/);
});

it("revalidates registry lifetime even when a prepared layout revision is unchanged", () => {
	const { tree, target, controls } = fixture();
	const prepared = prepareDocumentRaster(tree);
	controls.close();
	expect(() => prepared.rasterize({ element: target.ref })).toThrow(/closed/);
});

it("keeps generated crops within the existing work budget and option exclusivity", () => {
	const { tree, target } = fixture();
	expect(() =>
		rasterizeDocument(tree, { element: target.ref, maxWork: 1 }),
	).toThrow(/work limit/);
	expect(() =>
		rasterizeDocument(tree, {
			element: target.ref,
			clip: { x: 0, y: 0, width: 1, height: 1 },
		}),
	).toThrow(/Choose/);
});

it("publishes header geometry without inventing DOM element sizes", async () => {
	const { host, target, tree, owner } = await commandFixture();
	const result = await host.execute(["geometry", target.ref]);
	expect(result.data).toMatchObject({
		reference: target.ref,
		profile: "generated-control-client-rects",
		sizes: null,
		generated: { kind: "details-summary", owner: tree.reference(owner) },
		bounds: { width: 120, height: 16 },
		rects: [expect.objectContaining({ width: 120, height: 16 })],
	});
	const ordinary = await host.execute(["geometry", "#host"]);
	expect(ordinary.data).toMatchObject({
		profile: "normal-flow-client-rects",
		bounds: { height: 80 },
		sizes: expect.any(Object),
	});
});

it("inspects generated geometry through the same role locator as activation", async () => {
	const { host, target } = await commandFixture();
	expect(
		(
			await host.execute([
				"geometry",
				'getByRole("button", {name:"Details", exact:true})',
			])
		).data,
	).toMatchObject({ reference: target.ref, bounds: { height: 16 } });
});

it("returns a bounded, decodable generated screenshot artifact", async () => {
	const { host, target } = await commandFixture();
	const artifact = (await host.execute(["screenshot", target.ref]))
		.data as CaptureArtifact;
	expect(artifact).toMatchObject({
		target: target.ref,
		mediaType: "image/png",
		width: 120,
		height: 16,
		clip: { x: 0, y: 0, width: 120, height: 16 },
	});
	const chunk = (await host.execute(["artifact-read", artifact.id]))
		.data as ArtifactChunk;
	const image = decodePng(decodeArtifactChunk(chunk, artifact, 0)).image;
	expect(image.width).toBe(120);
	expect(image.height).toBe(16);
});

it("rejects stale generated geometry and screenshot command targets", async () => {
	const { host, tree, owner, target } = await commandFixture();
	tree.append(owner, tree.createElement("summary"));
	for (const command of ["geometry", "screenshot"])
		await expect(host.execute([command, target.ref])).rejects.toThrow(
			/available/,
		);
});
