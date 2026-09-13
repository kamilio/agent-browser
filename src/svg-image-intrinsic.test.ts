import { expect, it, vi } from "vitest";
import { gifFixture } from "../scripts/gif-fixtures.js";
import { jpegFixtures } from "../scripts/jpeg-fixtures.js";
import { documentGeometry } from "./document-geometry.js";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeImage, imageIntrinsicSize } from "./image-decoder.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { decodeSvgImage, svgImageDecodeLimits } from "./svg-image-decoder.js";

const encoder = new TextEncoder();
const rectangle = '<rect width="4.25" height="2.5" fill="red"/>';

function svg(content = rectangle, attributes = 'width="4.25" height="2.5"') {
	return `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`;
}

function pixel(image: RasterImage, column: number, row = 0) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

interface ImageFixture {
	tree: DocumentTree;
	images: ReturnType<typeof documentImages>;
	requests: string[];
	bodies: ReadonlyMap<string, Uint8Array>;
	id(selector?: string): number;
}

async function withImages(
	inspect: (fixture: ImageFixture) => void | Promise<void>,
	css = "",
	sources: Readonly<Record<string, string>> = { "/image.svg": svg() },
	markup = '<img id="image" src="/image.svg">',
	limits?: DocumentImageOptions["limits"],
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}img{display:block}${css}</style>${markup}`,
		"https://fixture.invalid/svg-intrinsic",
	);
	let images: ReturnType<typeof documentImages> | undefined;
	try {
		documentStyles(tree).setViewport(64, 32);
		const queries = new DocumentQueries(tree);
		try {
			const requests: string[] = [];
			const bodies = new Map(
				Object.entries(sources).map(([path, source]) => [
					path,
					encoder.encode(source),
				]),
			);
			images = documentImages(tree, {
				limits,
				fetch: async (url) => {
					const body = bodies.get(new URL(url).pathname);
					if (body === undefined)
						throw new Error("Unexpected intrinsic fixture request");
					requests.push(url);
					return {
						url,
						status: 200,
						headers: { "content-type": ["image/svg+xml"] },
						body,
						encodedBytes: body.length,
						redirects: [],
						elapsedMs: 0,
					};
				},
			});
			await images.settle();
			await inspect({
				tree,
				images,
				requests,
				bodies,
				id: (selector = "#image") => {
					const found = queries.querySelector(selector);
					if (found === null)
						throw new Error("Missing intrinsic image fixture");
					return found;
				},
			});
		} finally {
			queries.close();
		}
	} finally {
		tree.close();
		expect(tree.nodeCount).toBe(0);
		if (images)
			expect(images.metrics()).toMatchObject({
				closed: true,
				elements: 0,
				resources: 0,
				active: 0,
				queued: 0,
				waiters: 0,
				decodedBytes: 0,
			});
	}
}

it("retains frozen fractional metadata separately from the integer bitmap", () => {
	const result = decodeImage(encoder.encode(svg()), "image/svg+xml");
	expect(result.mediaType).toBe("image/svg+xml");
	if (result.mediaType !== "image/svg+xml")
		throw new Error("Expected SVG decode");
	expect(result.intrinsic).toEqual({ width: 4.25, height: 2.5 });
	expect([result.image.width, result.image.height]).toEqual([5, 3]);
	expect(result.image.pixels.byteLength).toBe(60);
	expect(imageIntrinsicSize(result)).toBe(result.intrinsic);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.intrinsic)).toBe(true);
	expect(Object.isFrozen(result.image)).toBe(true);
});

it.each([
	['width="4.25px" height="2.5px"', 4.25, 2.5],
	['width="0.046875in" height="1.875pt"', 4.5, 2.5],
] as const)(
	"retains fractional absolute dimensions from %s",
	(attributes, width, height) => {
		const result = decodeSvgImage(encoder.encode(svg(rectangle, attributes)));
		expect(result.intrinsic.width).toBeCloseTo(width, 12);
		expect(result.intrinsic.height).toBeCloseTo(height, 12);
		expect([result.image.width, result.image.height]).toEqual([
			Math.ceil(width),
			Math.ceil(height),
		]);
	},
);

it("uses fractional root CSS dimensions instead of integer presentation attributes", () => {
	const result = decodeSvgImage(
		encoder.encode(
			svg(
				"<style>svg{width:4.25px;height:2.5px}</style>" + rectangle,
				'width="20" height="20"',
			),
		),
	);
	expect(result.intrinsic).toEqual({ width: 4.25, height: 2.5 });
	expect([result.image.width, result.image.height]).toEqual([5, 3]);
	expect(pixel(result.image, 4, 2)).toEqual([255, 0, 0, 255]);
});

it("maps non-viewBox user coordinates into the ceil bitmap using fractional viewport dimensions", () => {
	const result = decodeSvgImage(
		encoder.encode(svg('<rect width="2.3" height="2.5" fill="red"/>')),
	);
	for (let row = 0; row < 3; row++) {
		expect(pixel(result.image, 2, row)).toEqual([255, 0, 0, 255]);
		expect(pixel(result.image, 3, row)).toEqual([0, 0, 0, 0]);
	}
});

it("retains viewBox aspect-ratio letterboxing in a fractional viewport", () => {
	const result = decodeSvgImage(
		encoder.encode(
			svg(
				'<rect width="2" height="2" fill="blue"/>',
				'width="4.25" height="2.5" viewBox="0 0 2 2"',
			),
		),
	);
	expect(pixel(result.image, 0, 1)).toEqual([0, 0, 0, 0]);
	expect(pixel(result.image, 1, 1)).toEqual([0, 0, 255, 255]);
	expect(pixel(result.image, 3, 1)).toEqual([0, 0, 255, 255]);
	expect(pixel(result.image, 4, 1)).toEqual([0, 0, 0, 0]);
});

it("scales user-space gradient sampling along with fractional bitmap geometry", () => {
	const result = decodeSvgImage(
		encoder.encode(
			svg(
				'<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="3.5" y2="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><rect width="3.5" height="1.25" fill="url(#paint)"/>',
				'width="3.5" height="1.25" viewBox="0 0 3.5 1.25"',
			),
		),
	);
	expect([result.image.width, result.image.height]).toEqual([4, 2]);
	expect(pixel(result.image, 0)).toEqual([223, 0, 32, 255]);
	expect(pixel(result.image, 3, 1)).toEqual([32, 0, 223, 255]);
});

it.each([
	[0.25, 0.75],
	[0.125, 0.125],
	[0.99, 0.01],
] as const)(
	"decodes positive subpixel dimensions %s by %s without rounding the intrinsic size away",
	(width, height) => {
		const result = decodeSvgImage(
			encoder.encode(
				svg(
					`<rect width="${width}" height="${height}" fill="red"/>`,
					`width="${width}" height="${height}"`,
				),
			),
		);
		expect(result.intrinsic).toEqual({ width, height });
		expect([result.image.width, result.image.height]).toEqual([1, 1]);
		expect(pixel(result.image, 0)).toEqual([255, 0, 0, 255]);
	},
);

it("checks the ceil-product pixel budget before scene geometry and rasterization", () => {
	const source = encoder.encode(
		svg("<text>Still unsupported text</text>", 'width="1.01" height="1.01"'),
	);
	expect(() => decodeSvgImage(source, { maxPixels: 3 })).toThrow(/pixel limit/);
	expect(() => decodeSvgImage(source, { maxPixels: 4 })).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	const valid = encoder.encode(
		svg('<rect width="1.01" height="1.01"/>', 'width="1.01" height="1.01"'),
	);
	expect(decodeSvgImage(valid, { maxPixels: 4 }).image.pixels.byteLength).toBe(
		16,
	);
	expect(() => decodeSvgImage(valid, { maxPixels: 3 })).toThrow(/pixel limit/);
});

it("keeps the original dimension ceiling for fractional values", () => {
	const width = svgImageDecodeLimits.maxDimension - 0.5;
	const result = decodeSvgImage(
		encoder.encode(svg("", `width="${width}" height="0.25"`)),
	);
	expect(result.intrinsic).toEqual({ width, height: 0.25 });
	expect([result.image.width, result.image.height]).toEqual([
		svgImageDecodeLimits.maxDimension,
		1,
	]);
	expect(() =>
		decodeSvgImage(
			encoder.encode(
				svg(
					"",
					`width="${svgImageDecodeLimits.maxDimension + 0.25}" height="0.25"`,
				),
			),
		),
	).toThrow(/dimension limit/);
});

it.each([
	'width="0" height="2.5"',
	'width="4.25"',
	'width="100%" height="2.5"',
	'viewBox="0 0 4.25 2.5"',
])(
	"does not invent missing or nonpositive intrinsic dimensions for %s",
	(attributes) => {
		expect(() =>
			decodeSvgImage(encoder.encode(svg(rectangle, attributes))),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
	},
);

it("retains the existing exact decode work boundary for fractional images", () => {
	const source = encoder.encode(svg());
	const decoded = decodeSvgImage(source);
	expect(
		decodeSvgImage(source, { maxWork: decoded.work }).image.pixels,
	).toEqual(decoded.image.pixels);
	expect(() => decodeSvgImage(source, { maxWork: decoded.work - 1 })).toThrow(
		/work limit/,
	);
	expect(() => decodeSvgImage(source, { maxWork: 1 })).toThrow(/work limit/);
});

it("closes the decoder-owned document on fractional success and limit failures", () => {
	const source = encoder.encode(svg());
	const work = decodeSvgImage(source).work;
	const closed: DocumentTree[] = [];
	const originalClose = DocumentTree.prototype.close;
	const close = vi
		.spyOn(DocumentTree.prototype, "close")
		.mockImplementation(function (this: DocumentTree) {
			closed.push(this);
			return originalClose.call(this);
		});
	try {
		decodeSvgImage(source);
		expect(() => decodeSvgImage(source, { maxPixels: 14 })).toThrow(
			/pixel limit/,
		);
		expect(() => decodeSvgImage(source, { maxWork: work - 1 })).toThrow(
			/work limit/,
		);
		expect(closed).toHaveLength(3);
		expect(closed.every((tree) => tree.nodeCount === 0)).toBe(true);
	} finally {
		close.mockRestore();
	}
});

it("leaves PNG, JPEG and GIF intrinsic helpers tied to their existing bitmap dimensions", () => {
	const reference = jpegFixtures[0];
	const fixtures = [
		{
			mediaType: "image/png",
			bytes: encodePng(createRaster(3, 2)),
			width: 3,
			height: 2,
		},
		{
			mediaType: "image/jpeg",
			bytes: Buffer.from(reference.jpeg, "base64"),
			width: reference.width,
			height: reference.height,
		},
		{ mediaType: "image/gif", bytes: gifFixture().bytes, width: 2, height: 1 },
	];
	for (const fixture of fixtures) {
		const decoded = decodeImage(fixture.bytes, fixture.mediaType);
		expect(imageIntrinsicSize(decoded)).toBe(decoded.image);
		expect(imageIntrinsicSize(decoded)).toMatchObject({
			width: fixture.width,
			height: fixture.height,
		});
	}
});

it("keeps integer owner snapshots separate from full-precision formatting and auto used layout", async () => {
	await withImages(({ tree, images, id, requests, bodies }) => {
		const target = id();
		expect(images.get(target)).toMatchObject({
			state: "complete",
			naturalWidth: 4,
			naturalHeight: 2,
		});
		const decoded = images.decoded(target);
		if (decoded === undefined)
			throw new Error("Expected complete intrinsic image");
		expect(imageIntrinsicSize(decoded)).toEqual({ width: 4.25, height: 2.5 });
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.nodes.find((node) => node.ref === tree.reference(target)),
		).toMatchObject({
			kind: "replaced",
			intrinsic: { width: 4.25, height: 2.5 },
		});
		expect(documentGeometry(tree).getBoundingClientRect(target)).toMatchObject({
			width: 4.25,
			height: 2.5,
		});
		expect(documentGeometry(tree).getUsedStyle(target)).toMatchObject({
			width: 4.25,
			height: 2.5,
		});
		expect(requests).toEqual(["https://fixture.invalid/image.svg"]);
		expect(images.metrics()).toMatchObject({
			requests: 1,
			receivedBytes: bodies.get("/image.svg")!.byteLength,
			decodedBytes: 60,
		});
		const raster = rasterizeDocument(tree);
		expect(raster.metrics.paintedImages).toBe(1);
		expect(pixel(raster.image, 0)).toEqual([255, 0, 0, 255]);
	});
});

it.each([
	["width:17px", 17, 10],
	["width:17px;max-width:8.5px", 8.5, 5],
	["min-width:8.5px", 8.5, 5],
	["max-height:1.25px", 2.125, 1.25],
] as const)(
	"preserves the fractional intrinsic ratio through used constraints %s",
	async (css, width, height) => {
		await withImages(({ tree, id }) => {
			const target = id();
			const rectangle = documentGeometry(tree).getBoundingClientRect(target);
			expect(rectangle.width).toBeCloseTo(width, 12);
			expect(rectangle.height).toBeCloseTo(height, 12);
			const used = layoutDocument(tree).boxes.find(
				(box) => box.ref === tree.reference(target),
			);
			expect(used?.contentWidth).toBeCloseTo(width, 12);
			expect(used?.contentHeight).toBeCloseTo(height, 12);
		}, `img{${css}}`);
	},
);

it("applies border-box edges before deriving an automatic height from the full intrinsic ratio", async () => {
	await withImages(({ tree, id }) => {
		const target = id();
		expect(documentGeometry(tree).getBoundingClientRect(target)).toMatchObject({
			width: 23,
			height: 16,
		});
		const used = layoutDocument(tree).boxes.find(
			(box) => box.ref === tree.reference(target),
		);
		expect(used).toMatchObject({ contentWidth: 17, contentHeight: 10 });
	}, "img{box-sizing:border-box;width:23px;padding:2px;border:1px solid black}");
});

it("keeps a complete subpixel image with zero integer natural dimensions out of the alternative-text path", async () => {
	await withImages(
		({ tree, images, id }) => {
			const target = id();
			expect(images.get(target)).toMatchObject({
				state: "complete",
				complete: true,
				naturalWidth: 0,
				naturalHeight: 0,
			});
			expect(images.get(target).error).toBeUndefined();
			const node = buildFormattingTree(tree).nodes.find(
				(entry) => entry.ref === tree.reference(target),
			);
			expect(node).toMatchObject({
				kind: "replaced",
				intrinsic: { width: 0.25, height: 0.75 },
			});
			expect(node?.intrinsicRatio).not.toBe(false);
			expect(
				documentGeometry(tree).getBoundingClientRect(target),
			).toMatchObject({ width: 4, height: 12 });
			expect(
				layoutDocument(tree).contexts.flatMap((context) => context.glyphs),
			).toEqual([]);
			const raster = rasterizeDocument(tree);
			expect(raster.metrics.paintedImages).toBe(1);
			expect(pixel(raster.image, 0)).toEqual([255, 0, 0, 255]);
		},
		"img{width:4px}",
		{
			"/image.svg": svg(
				'<rect width="0.25" height="0.75" fill="red"/>',
				'width="0.25" height="0.75"',
			),
		},
		'<img id="image" src="/image.svg" alt="Do not render fallback">',
	);
});

it.each([
	[59, false],
	[60, true],
] as const)(
	"charges actual ceil bitmap bytes against the image owner limit %s",
	async (maxDecodedBytes, complete) => {
		await withImages(
			({ images, id }) => {
				expect(images.get(id()).state).toBe(complete ? "complete" : "broken");
				expect(images.get(id()).error).toBe(
					complete ? undefined : "resource-limit",
				);
				expect(images.metrics().decodedBytes).toBe(complete ? 60 : 0);
			},
			"",
			undefined,
			undefined,
			{ maxDecodedBytes },
		);
	},
);

it("shares fractional intrinsic metadata and bitmap accounting across image consumers", async () => {
	await withImages(
		({ tree, images, id, requests }) => {
			const first = id();
			const second = id("#second");
			expect(requests).toHaveLength(1);
			expect(images.decoded(first)).toBe(images.decoded(second));
			expect(images.metrics()).toMatchObject({
				resources: 1,
				requests: 1,
				decodedBytes: 60,
			});
			for (const target of [first, second]) {
				expect(images.get(target)).toMatchObject({
					naturalWidth: 4,
					naturalHeight: 2,
				});
				expect(
					documentGeometry(tree).getBoundingClientRect(target),
				).toMatchObject({ width: 17, height: 10 });
			}
		},
		"img{width:17px}",
		undefined,
		'<img id="image" src="/image.svg"><img id="second" src="/image.svg">',
	);
});

it("invalidates the used intrinsic ratio after a source mutation without mutating the old metadata", async () => {
	await withImages(
		async ({ tree, images, id, requests }) => {
			const target = id();
			const geometry = documentGeometry(tree);
			const original = images.decoded(target);
			if (original === undefined)
				throw new Error("Expected original intrinsic image");
			expect(geometry.getBoundingClientRect(target)).toMatchObject({
				width: 17,
				height: 10,
			});
			tree.setAttribute(target, "src", "/next.svg");
			await images.settle();
			expect(requests).toEqual([
				"https://fixture.invalid/image.svg",
				"https://fixture.invalid/next.svg",
			]);
			expect(images.get(target)).toMatchObject({
				state: "complete",
				naturalWidth: 8,
				naturalHeight: 1,
			});
			expect(geometry.getBoundingClientRect(target)).toMatchObject({
				width: 17,
				height: 2.5,
			});
			expect(imageIntrinsicSize(original)).toEqual({
				width: 4.25,
				height: 2.5,
			});
		},
		"img{width:17px}",
		{
			"/image.svg": svg(),
			"/next.svg": svg(
				'<rect width="8.5" height="1.25" fill="blue"/>',
				'width="8.5" height="1.25"',
			),
		},
	);
});
