import { inflateSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { jpegFixtures } from "../scripts/jpeg-fixtures.js";
import type { DocumentTree } from "./document.js";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import { documentGeometry } from "./document-geometry.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { rasterizeDocument } from "./document-raster.js";
import { decodeImage } from "./image-decoder.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { decodePng } from "./png-decoder.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	body: Uint8Array,
	type = "image/jpeg",
	options: DocumentImageOptions = {},
) {
	const tree = parseHtmlDocument(
		'<img id="photo" src="/image.jpg" style="display:block;padding:2px;background:navy">',
		"https://fixture.invalid/jpeg",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(80, 64);
	const id = new DocumentQueries(tree).querySelector("#photo");
	if (id === null) throw new Error("Missing fixture image");
	const images = documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": [type] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		}),
		...options,
	});
	return { tree, id, images };
}

it.each(jpegFixtures)(
	"loads and paints real page-owned JPEG pixels: $name",
	async (reference) => {
		const { tree, id, images } = fixture(Buffer.from(reference.jpeg, "base64"));
		await images.settle();
		expect(images.get(id)).toMatchObject({
			state: "complete",
			mediaType: "image/jpeg",
			naturalWidth: reference.width,
			naturalHeight: reference.height,
			ignoredAncillaryChunks: [],
			ignoredMetadata: [],
		});
		expect(images.decoded(id)).toMatchObject({
			mediaType: "image/jpeg",
			progressive: reference.progressive,
		});
		expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
			x: 0,
			y: 0,
			width: reference.width + 4,
			height: reference.height + 4,
		});
		const raster = rasterizeDocument(tree);
		expect(raster.metrics.paintedImages).toBe(1);
		const crop = new Uint8Array(reference.width * reference.height * 4);
		for (let row = 0; row < reference.height; row++)
			crop.set(
				raster.image.pixels.subarray(
					((row + 2) * 80 + 2) * 4,
					((row + 2) * 80 + 2 + reference.width) * 4,
				),
				row * reference.width * 4,
			);
		expect(crop).toEqual(images.decoded(id)?.image.pixels);
		expect(decodePng(encodePng(raster.image)).image.pixels).toEqual(
			raster.image.pixels,
		);
	},
);

it("embeds the shared JPEG-aware raster in actual PDF page streams", async () => {
	const { tree, images } = fixture(Buffer.from(jpegFixtures[3].jpeg, "base64"));
	await images.settle();
	const result = renderDocumentPdf(tree);
	const source = Buffer.from(result.bytes).toString("latin1");
	const pattern =
		/<< \/Type \/XObject \/Subtype \/Image.*?\/Length (\d+) >>\nstream\n/gs;
	const match = pattern.exec(source);
	if (!match) throw new Error("Missing PDF raster stream");
	const actual = inflateSync(
		result.bytes.subarray(
			pattern.lastIndex,
			pattern.lastIndex + Number(match[1]),
		),
	);
	expect([...actual]).toEqual(
		[...rasterizeDocument(tree).image.pixels].filter(
			(_, index) => index % 4 !== 3,
		),
	);
});

it("deduplicates JPEG buffers and replaces them with a differently typed PNG resource", async () => {
	const jpeg = Buffer.from(jpegFixtures[2].jpeg, "base64");
	const png = encodePng(createRaster(2, 2, [10, 20, 30, 255]));
	const requested: string[] = [];
	const { tree, id, images } = fixture(jpeg, "image/jpeg", {
		fetch: async (url) => {
			requested.push(url);
			const body = url.endsWith(".png") ? png : jpeg;
			return {
				url,
				status: 200,
				headers: {
					"content-type": [url.endsWith(".png") ? "image/png" : "image/jpeg"],
				},
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	await images.settle();
	const copy = tree.createElement("img");
	tree.setAttribute(copy, "src", "/image.jpg");
	const parent = tree.get(id).parent;
	if (parent === null) throw new Error("Image fixture has no parent");
	tree.append(parent, copy);
	await images.settle();
	expect(requested).toHaveLength(1);
	expect(images.decoded(copy)).toBe(images.decoded(id));
	tree.setAttribute(id, "src", "/replacement.png");
	await images.settle();
	expect(images.get(id)).toMatchObject({
		mediaType: "image/png",
		naturalWidth: 2,
	});
	expect(images.get(copy)).toMatchObject({
		mediaType: "image/jpeg",
		naturalWidth: 17,
	});
	expect(images.metrics().decodedBytes).toBe(17 * 13 * 4 + 16);
	tree.close();
	expect(images.metrics().decodedBytes).toBe(0);
});

it.each(["image/jpg", "application/octet-stream", "text/html"])(
	"rejects unsupported MIME %s rather than sniffing JPEG bytes",
	async (type) => {
		const { images, id } = fixture(
			Buffer.from(jpegFixtures[0].jpeg, "base64"),
			type,
		);
		await images.settle();
		expect(images.get(id)).toMatchObject({
			state: "broken",
			error: "unsupported",
			naturalWidth: 0,
		});
	},
);

it.each(["image/png", "image/jpeg"])(
	"rejects a MIME/body mismatch for %s",
	async (type) => {
		const body =
			type === "image/png"
				? Buffer.from(jpegFixtures[0].jpeg, "base64")
				: encodePng(createRaster(1, 1));
		const { images, id } = fixture(body, type);
		await images.settle();
		expect(images.get(id)).toMatchObject({
			state: "broken",
			error: "invalid-input",
			naturalWidth: 0,
		});
	},
);

it("normalizes a single explicit JPEG MIME and applies retained-pixel budgets before allocation", async () => {
	const first = fixture(
		Buffer.from(jpegFixtures[0].jpeg, "base64"),
		" IMAGE/JPEG ; anything=ignored",
	);
	await first.images.settle();
	expect(first.images.get(first.id).mediaType).toBe("image/jpeg");
	const limited = fixture(
		Buffer.from(jpegFixtures[0].jpeg, "base64"),
		"image/jpeg",
		{ limits: { maxDecodedBytes: 4 } },
	);
	await limited.images.settle();
	expect(limited.images.get(limited.id)).toMatchObject({
		state: "broken",
		error: "resource-limit",
	});
	expect(limited.images.metrics().decodedBytes).toBe(0);
	expect(limited.images.metrics().decodeWork).toBe(0);
});

it("reports ignored JPEG metadata separately from PNG ancillary chunks", async () => {
	const input = Buffer.from(jpegFixtures[0].jpeg, "base64");
	const body = Uint8Array.from([
		...input.subarray(0, 2),
		255,
		0xe1,
		0,
		8,
		69,
		120,
		105,
		102,
		0,
		0,
		...input.subarray(2),
	]);
	const { images, id } = fixture(body);
	await images.settle();
	expect(images.get(id)).toMatchObject({
		mediaType: "image/jpeg",
		ignoredAncillaryChunks: [],
		ignoredMetadata: ["APP1"],
	});
});

it("dispatches explicit supported MIME types without weakening decoder validation", () => {
	expect(
		decodeImage(Buffer.from(jpegFixtures[0].jpeg, "base64"), "image/jpeg")
			.mediaType,
	).toBe("image/jpeg");
	expect(
		decodeImage(encodePng(createRaster(1, 1)), "image/png").mediaType,
	).toBe("image/png");
	expect(() => decodeImage(new Uint8Array(), "image/gif")).toThrow(/MIME/);
	expect(() =>
		decodeImage(Buffer.from(jpegFixtures[0].jpeg, "base64"), "image/jpeg", {
			maxWork: 1,
		}),
	).toThrow(/work limit/);
});
