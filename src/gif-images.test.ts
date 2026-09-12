import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import type { DocumentTree } from "./document.js";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeImage, imageMediaTypes } from "./image-decoder.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const golden = Uint8Array.from([
	71, 73, 70, 56, 55, 97, 2, 0, 1, 0, 128, 0, 0, 255, 0, 0, 0, 0, 255, 44, 0, 0,
	0, 0, 2, 0, 1, 0, 0, 2, 2, 68, 10, 0, 59,
]);
const pixels = [255, 0, 0, 255, 0, 0, 255, 255];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function animated() {
	const header = golden.slice(0, 19);
	header[4] = 57;
	const frame = golden.slice(19, -1);
	const second = frame.slice();
	second[12] = 12;
	return Uint8Array.from([
		...header,
		33,
		255,
		11,
		...new TextEncoder().encode("NETSCAPE2.0"),
		3,
		1,
		0,
		0,
		0,
		33,
		249,
		4,
		0,
		1,
		0,
		0,
		0,
		...frame,
		33,
		249,
		4,
		0,
		2,
		0,
		0,
		0,
		...second,
		59,
	]);
}
function fixture(
	body = golden,
	options: DocumentImageOptions = {},
	html = '<img src="/image.gif" style="display:block">',
	mediaType = "image/gif",
) {
	const tree = parseHtmlDocument(html, "https://fixture.invalid/gif");
	trees.push(tree);
	documentStyles(tree).setViewport(16, 16);
	const query = new DocumentQueries(tree);
	const ids = query.querySelectorAll("img");
	query.close();
	const images = documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": [mediaType] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		}),
		...options,
	});
	return { tree, images, ids };
}

it("dispatches GIF without changing PNG or JPEG MIME ordering", () => {
	expect(imageMediaTypes).toEqual(["image/png", "image/jpeg", "image/gif"]);
	expect(Object.isFrozen(imageMediaTypes)).toBe(true);
	const result = decodeImage(golden, "image/gif");
	expect(Object.isFrozen(result)).toBe(true);
	expect(result.mediaType).toBe("image/gif");
	expect([...result.image.pixels]).toEqual(pixels);
});

it("advertises initial-frame GIF support without claiming animation playback", () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("No session expected");
		},
	});
	try {
		expect(host.capabilities()).toMatchObject({
			imageResources: {
				formats: ["image/png", "image/jpeg", "image/gif"],
				gif: {
					versions: ["87a", "89a"],
					presentation: "initial-frame",
					fullStreamValidation: true,
					animationPlayback: false,
					interlacing: true,
					transparency: true,
					plainTextRendering: false,
					pixelAspectRatio: false,
				},
			},
		});
	} finally {
		host.close();
	}
});

it.each(["image/png", "image/jpeg", "image/webp", "application/octet-stream"])(
	"does not sniff GIF through the wrong declared MIME %s",
	(mediaType) => {
		expect(() => decodeImage(golden, mediaType)).toThrow();
	},
);

it("loads frozen GIF metadata with actual natural dimensions", async () => {
	const { images, ids } = fixture();
	await images.settle();
	const image = images.get(ids[0]);
	expect(image).toMatchObject({
		state: "complete",
		originClean: true,
		naturalWidth: 2,
		naturalHeight: 1,
		mediaType: "image/gif",
		ignoredMetadata: [],
		ignoredAncillaryChunks: [],
		gif: {
			version: "87a",
			frameCount: 1,
			animated: false,
			loopCount: null,
			durationMs: 0,
			presentation: "initial-frame",
			animationPlayback: false,
		},
	});
	expect(Object.isFrozen(image)).toBe(true);
	expect(Object.isFrozen(image.gif)).toBe(true);
	await expect(images.decode(ids[0])).resolves.toBeUndefined();
});

it("paints GIF pixels without mutating the DOM source", async () => {
	const { tree, images, ids } = fixture();
	await images.settle();
	const before = snapshotDocument(tree);
	expect(documentGeometry(tree).getBoundingClientRect(ids[0])).toMatchObject({
		width: 2,
		height: 1,
	});
	expect([
		...rasterizeDocument(tree, { clip: { x: 0, y: 0, width: 2, height: 1 } })
			.image.pixels,
	]).toEqual(pixels);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("validates both animation frames while presenting only the initial frame", async () => {
	const { images, ids } = fixture(animated());
	await images.settle();
	expect(images.get(ids[0]).gif).toMatchObject({
		version: "89a",
		frameCount: 2,
		animated: true,
		loopCount: 0,
		durationMs: 30,
		presentation: "initial-frame",
		animationPlayback: false,
	});
	expect([...images.decoded(ids[0])!.image.pixels]).toEqual(pixels);
});

it.each(["trailer", "second-frame"])(
	"rejects the whole image on malformed %s",
	async (part) => {
		const body = animated();
		body[part === "trailer" ? body.length - 1 : body.length - 4] = 255;
		const { images, ids } = fixture(body);
		await images.settle();
		expect(images.get(ids[0])).toMatchObject({
			state: "broken",
			error: "invalid-input",
			naturalWidth: 0,
			naturalHeight: 0,
		});
		expect(images.decoded(ids[0])).toBeUndefined();
		await expect(images.decode(ids[0])).rejects.toMatchObject({
			name: "EncodingError",
		});
	},
);

it.each([
	{ maxResponseBytes: 20 },
	{ maxDecodedBytes: 4 },
	{ maxDecodeWork: 1 },
])("honors existing image-owner limits %j", async (limits) => {
	const { images, ids } = fixture(golden, { limits });
	await images.settle();
	expect(images.get(ids[0])).toMatchObject({
		state: "broken",
		error: "resource-limit",
	});
	expect(images.metrics().decodedBytes).toBe(0);
});

it("shares a decoded GIF between elements without a duplicate request", async () => {
	const { images, ids } = fixture(
		golden,
		{},
		'<img src="/image.gif"><img src="/image.gif">',
	);
	await images.settle();
	expect(images.metrics()).toMatchObject({
		resources: 1,
		requests: 1,
		decodedBytes: 8,
	});
	expect(images.decoded(ids[0])).toBe(images.decoded(ids[1]));
});

it("reloads a changed source and releases decoded pixels on close", async () => {
	const { tree, images, ids } = fixture();
	await images.settle();
	tree.setAttribute(ids[0], "src", "/next.gif");
	await images.settle();
	expect(images.get(ids[0])).toMatchObject({
		state: "complete",
		currentSrc: "https://fixture.invalid/next.gif",
	});
	expect(images.metrics().requests).toBe(2);
	tree.close();
	expect(images.metrics()).toMatchObject({ closed: true, decodedBytes: 0 });
});

it("keeps cross-origin GIFs tainted", async () => {
	const { images, ids } = fixture(
		golden,
		{},
		'<img src="https://other.invalid/image.gif">',
	);
	await images.settle();
	expect(images.get(ids[0])).toMatchObject({
		state: "complete",
		originClean: false,
	});
});

it.each(["image/webp", "application/octet-stream"])(
	"rejects unsupported image response type %s",
	async (mediaType) => {
		const { images, ids } = fixture(golden, {}, undefined, mediaType);
		await images.settle();
		expect(images.get(ids[0])).toMatchObject({
			state: "broken",
			error: "unsupported",
		});
	},
);
