import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const encoder = new TextEncoder();
const svg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0H4V2H0Z" fill="url(#paint)"/></svg>';

function fixture(
	body = svg,
	options: DocumentImageOptions = {},
	markup = '<img id="image" src="/logo.svg">',
	mime = "image/svg+xml",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}img{display:block}</style>${markup}`,
		"https://fixture.invalid/svg",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(8, 4);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#image");
	queries.close();
	if (id === null) throw new Error("Missing SVG image fixture");
	const requests: string[] = [];
	const bytes = encoder.encode(body);
	const images = documentImages(tree, {
		fetch: async (url) => {
			requests.push(url);
			return {
				url,
				status: 200,
				headers: { "content-type": [mime] },
				body: bytes,
				encodedBytes: bytes.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
		...options,
	});
	return { tree, id, images, requests, bytes };
}

it("loads a native SVG image and paints its decoded gradient in document layout", async () => {
	const test = fixture();
	await test.images.settle();
	expect(test.requests).toEqual(["https://fixture.invalid/logo.svg"]);
	expect(test.images.get(test.id)).toMatchObject({
		state: "complete",
		mediaType: "image/svg+xml",
		naturalWidth: 4,
		naturalHeight: 2,
		originClean: true,
		ignoredMetadata: [],
	});
	expect(
		documentGeometry(test.tree).getBoundingClientRect(test.id),
	).toMatchObject({ x: 0, y: 0, width: 4, height: 2 });
	const raster = rasterizeDocument(test.tree);
	expect(raster.metrics.paintedImages).toBe(1);
	expect(Array.from(raster.image.pixels.slice(0, 4))).toEqual([
		223, 0, 32, 255,
	]);
	expect(Array.from(raster.image.pixels.slice(12, 16))).toEqual([
		32, 0, 223, 255,
	]);
	expect(test.images.metrics()).toMatchObject({
		active: 0,
		queued: 0,
		requests: 1,
		decodedBytes: 32,
	});
	expect(test.images.metrics().decodeWork).toBeGreaterThan(0);
});

it("shares one decoded SVG across multiple image consumers", async () => {
	const test = fixture(
		svg,
		{},
		'<img id="image" src="/logo.svg"><img id="second" src="/logo.svg">',
	);
	await test.images.settle();
	const queries = new DocumentQueries(test.tree);
	const second = queries.querySelector("#second");
	queries.close();
	if (second === null) throw new Error("Missing second image");
	expect(test.requests).toHaveLength(1);
	expect(test.images.decoded(test.id)).toBe(test.images.decoded(second));
	expect(test.images.metrics()).toMatchObject({
		resources: 1,
		elements: 2,
		decodedBytes: 32,
	});
});

it("normalizes SVG MIME parameters without bypassing XML validation", async () => {
	const test = fixture(svg, {}, undefined, " IMAGE/SVG+XML ; charset=utf-8");
	await test.images.settle();
	expect(test.images.get(test.id).mediaType).toBe("image/svg+xml");
	const malformed = fixture(svg.slice(0, -6));
	await malformed.images.settle();
	expect(malformed.images.get(malformed.id)).toMatchObject({
		state: "broken",
		error: "invalid-input",
		naturalWidth: 0,
		naturalHeight: 0,
	});
	expect(malformed.images.metrics().decodedBytes).toBe(0);
});

it("keeps image CSP ahead of SVG fetch and decoding", async () => {
	const test = fixture(svg, { contentSecurityPolicy: ["img-src 'none'"] });
	await test.images.settle();
	expect(test.requests).toEqual([]);
	expect(test.images.get(test.id).state).toBe("broken");
	expect(test.images.metrics()).toMatchObject({
		requests: 0,
		decodedBytes: 0,
		decodeWork: 0,
	});
});

it.each([{ maxDecodedBytes: 28 }, { maxDecodeWork: 1 }])(
	"applies the existing image owner limits to SVG %s",
	async (limits) => {
		const test = fixture(svg, { limits });
		await test.images.settle();
		expect(test.requests).toHaveLength(1);
		expect(test.images.get(test.id)).toMatchObject({
			state: "broken",
			error: "resource-limit",
		});
		expect(test.images.metrics().decodedBytes).toBe(0);
	},
);

it("does not issue nested resource requests from SVG image content", async () => {
	const test = fixture(
		'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><image href="https://example.invalid/nested.png"/></svg>',
	);
	await test.images.settle();
	expect(test.requests).toEqual(["https://fixture.invalid/logo.svg"]);
	expect(test.images.get(test.id)).toMatchObject({
		state: "broken",
		error: "unsupported",
	});
});

it("keeps external doctype retention separate from actual image fetches", async () => {
	const test = fixture(
		'<!DOCTYPE svg SYSTEM "https://example.invalid/svg.dtd">' + svg,
	);
	await test.images.settle();
	expect(test.requests).toHaveLength(1);
	expect(test.images.get(test.id)).toMatchObject({
		state: "complete",
		ignoredMetadata: ["external-doctype-not-loaded"],
	});
});

it("never fetches or runs SVG image scripts", async () => {
	const test = fixture(
		svg.replace(
			"<defs>",
			'<script href="https://example.invalid/script.js">throw new Error("must not execute")</script><defs>',
		),
	);
	await test.images.settle();
	expect(test.requests).toEqual(["https://fixture.invalid/logo.svg"]);
	expect(test.images.get(test.id).state).toBe("complete");
});

it("releases decoded SVG pixels and owners on document close", async () => {
	const test = fixture();
	await test.images.settle();
	await test.images.decode(test.id);
	test.tree.close();
	expect(test.tree.nodeCount).toBe(0);
	expect(test.images.metrics()).toMatchObject({
		closed: true,
		elements: 0,
		resources: 0,
		active: 0,
		queued: 0,
		decodedBytes: 0,
		waiters: 0,
	});
});
