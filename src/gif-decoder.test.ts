import { expect, it } from "vitest";
import {
	type GifCode,
	type GifFixtureOptions,
	type GifImageBlock,
	type GifPalette,
	gifFixture,
	gifGraphicControl,
	gifLoopExtension,
	packGifCodes,
} from "../scripts/gif-fixtures.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	type DecodedGif,
	type GifDecodeOptions,
	decodeGif,
	gifDecodeLimits,
} from "./gif-decoder.js";

const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const green = [0, 255, 0, 255];
const transparent = [0, 0, 0, 0];
const redBlue: GifPalette = [
	[255, 0, 0],
	[0, 0, 255],
];
const goldenImage: GifImageBlock = {
	kind: "image",
	compressedBytes: [0x44, 0x0a],
};
const comment = {
	kind: "extension",
	label: 0xfe,
	subBlocks: [[65, 66, 67]],
} as const;
const application = {
	kind: "extension",
	label: 0xff,
	subBlocks: [
		[84, 69, 83, 84, 65, 80, 80, 49, 48, 48, 49],
		[7, 8],
	],
} as const;

function decodeFixture(options: GifFixtureOptions = {}): DecodedGif {
	return decodeGif(gifFixture(options).bytes);
}

function expectPixels(result: DecodedGif, colors: readonly number[][]) {
	expect([...result.image.pixels]).toEqual(colors.flat());
}

function expectError(
	bytes: Uint8Array,
	code: ErrorCode = "invalid-input",
	options?: GifDecodeOptions,
) {
	expect(() => decodeGif(bytes, options)).toThrow(AgentBrowserError);
	expect(() => decodeGif(bytes, options)).toThrow(
		expect.objectContaining({ code }),
	);
}

function explicitImage(
	width: number,
	codes: readonly GifCode[],
	extra: Partial<GifImageBlock> = {},
): GifFixtureOptions {
	return { width, blocks: [{ kind: "image", codes, ...extra }] };
}

const literalWidthRuns = [
	{ width: 3, count: 3 },
	{ width: 4, count: 8 },
	{ width: 5, count: 16 },
	{ width: 6, count: 32 },
	{ width: 7, count: 64 },
	{ width: 8, count: 128 },
	{ width: 9, count: 256 },
	{ width: 10, count: 512 },
	{ width: 11, count: 1024 },
	{ width: 12, count: 4096 },
] as const;

function zeroLiteralCodes(count: number): GifCode[] {
	const codes: GifCode[] = [{ code: 4, width: 3 }];
	let remaining = count;
	for (const run of literalWidthRuns) {
		const length = Math.min(remaining, run.count);
		for (let index = 0; index < length; index++)
			codes.push({ code: 0, width: run.width });
		remaining -= length;
	}
	if (remaining) throw new Error("Explicit literal width fixture is too large");
	return codes;
}

function expectWidthTransition(literalCount: number, endWidth: number) {
	const codes = zeroLiteralCodes(literalCount);
	codes.push({ code: 1, width: endWidth }, { code: 5, width: endWidth });
	const result = decodeFixture(explicitImage(literalCount + 1, codes));
	expectPixels(result, [
		...Array.from({ length: literalCount }, () => red),
		blue,
	]);
	expect(result.decodedIndices).toBe(literalCount + 1);
}

it("packs independent three-bit and twelve-bit little-endian code goldens", () => {
	expect([
		...packGifCodes([
			{ code: 4, width: 3 },
			{ code: 0, width: 3 },
			{ code: 1, width: 3 },
			{ code: 5, width: 3 },
		]),
	]).toEqual([0x44, 0x0a]);
	expect([
		...packGifCodes([
			{ code: 0xabc, width: 12 },
			{ code: 0xdef, width: 12 },
		]),
	]).toEqual([0xbc, 0xfa, 0xde]);
});

it("decodes an entirely hand-authored GIF87a red/blue golden", () => {
	const bytes = Uint8Array.from([
		71, 73, 70, 56, 55, 97, 2, 0, 1, 0, 128, 0, 0, 255, 0, 0, 0, 0, 255, 44, 0,
		0, 0, 0, 2, 0, 1, 0, 0, 2, 2, 0x44, 0x0a, 0, 59,
	]);
	expect(gifFixture({ version: "87a", blocks: [goldenImage] }).bytes).toEqual(
		bytes,
	);
	const result = decodeGif(bytes);
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({
		version: "87a",
		compressedBytes: 2,
		decodedIndices: 2,
	});
});

it("reports the static GIF89a defaults without animation metadata", () => {
	const result = decodeFixture();
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({
		version: "89a",
		image: { width: 2, height: 1 },
		frameCount: 1,
		animated: false,
		loopCount: null,
		durationMs: 0,
		interlaced: false,
		transparent: false,
		ignoredMetadata: [],
	});
});

it("uses index 255 from a 256-entry global table with minimum code size eight", () => {
	const palette: GifPalette = Array.from({ length: 256 }, (_, index) => [
		index,
		0,
		255 - index,
	]);
	const result = decodeFixture({
		globalPalette: palette,
		blocks: [
			{ kind: "image", minimumCodeSize: 8, indicesInStorageOrder: [255, 0] },
		],
	});
	expectPixels(result, [red, blue]);
});

it("lets a local palette override the global table", () => {
	const result = decodeFixture({
		blocks: [
			{
				kind: "image",
				localPalette: [
					[0, 255, 0],
					[255, 0, 0],
				],
				indicesInStorageOrder: [0, 1],
			},
		],
	});
	expectPixels(result, [green, red]);
});

it("leaves the canvas transparent without a global palette", () => {
	const result = decodeFixture({
		width: 3,
		globalPalette: null,
		blocks: [
			{
				kind: "image",
				width: 1,
				left: 1,
				localPalette: redBlue,
				indicesInStorageOrder: [1],
			},
		],
	});
	expectPixels(result, [transparent, blue, transparent]);
	expect(result.transparent).toBe(false);
});

it("fills the logical canvas with the global background outside the first rectangle", () => {
	const result = decodeFixture({
		width: 3,
		height: 2,
		backgroundIndex: 1,
		blocks: [
			{
				kind: "image",
				width: 1,
				height: 1,
				left: 1,
				top: 1,
				indicesInStorageOrder: [0],
			},
		],
	});
	expectPixels(result, [blue, blue, blue, blue, red, blue]);
});

it("starts a transparent canvas when the first GCE enables transparency", () => {
	const result = decodeFixture({
		width: 3,
		backgroundIndex: 1,
		blocks: [
			gifGraphicControl({ transparentIndex: 1 }),
			{ kind: "image", width: 1, left: 1, indicesInStorageOrder: [0] },
		],
	});
	expectPixels(result, [transparent, red, transparent]);
});

it("preserves a transparent pixel instead of painting the background", () => {
	const result = decodeFixture({
		blocks: [gifGraphicControl({ transparentIndex: 0 }), goldenImage],
	});
	expectPixels(result, [transparent, blue]);
	expect(result.transparent).toBe(true);
});

it("reports requested transparency even when the transparent index is unused", () => {
	const result = decodeFixture({
		blocks: [
			gifGraphicControl({ transparentIndex: 1 }),
			{ kind: "image", indicesInStorageOrder: [0, 0] },
		],
	});
	expectPixels(result, [red, red]);
	expect(result.transparent).toBe(true);
});

it("restores all four interlace passes for eight distinct rows", () => {
	const result = decodeFixture({
		width: 1,
		height: 8,
		globalPalette: [
			[10, 0, 0],
			[20, 0, 0],
			[30, 0, 0],
			[40, 0, 0],
			[50, 0, 0],
			[60, 0, 0],
			[70, 0, 0],
			[80, 0, 0],
		],
		blocks: [
			{
				kind: "image",
				interlaced: true,
				minimumCodeSize: 3,
				indicesInStorageOrder: [0, 4, 2, 6, 1, 3, 5, 7],
			},
		],
	});
	expectPixels(result, [
		[10, 0, 0, 255],
		[20, 0, 0, 255],
		[30, 0, 0, 255],
		[40, 0, 0, 255],
		[50, 0, 0, 255],
		[60, 0, 0, 255],
		[70, 0, 0, 255],
		[80, 0, 0, 255],
	]);
	expect(result.interlaced).toBe(true);
});

it("orders a ninth row in the first interlace pass rather than at the end", () => {
	const result = decodeFixture({
		width: 1,
		height: 9,
		globalPalette: [
			[255, 0, 0],
			[0, 0, 255],
			[0, 255, 0],
			[255, 255, 255],
		],
		blocks: [
			{
				kind: "image",
				interlaced: true,
				indicesInStorageOrder: [0, 2, 0, 2, 2, 1, 3, 1, 3],
			},
		],
	});
	expectPixels(result, [
		red,
		blue,
		green,
		[255, 255, 255, 255],
		red,
		blue,
		green,
		[255, 255, 255, 255],
		green,
	]);
});

it("skips empty interlace passes in one-, two-, and three-row images", () => {
	for (const indices of [[0], [0, 1], [0, 0, 1]]) {
		const result = decodeFixture({
			width: 1,
			height: indices.length,
			blocks: [
				{ kind: "image", interlaced: true, indicesInStorageOrder: indices },
			],
		});
		expectPixels(
			result,
			indices.length === 1
				? [red]
				: indices.length === 2
					? [red, blue]
					: [red, blue, red],
		);
	}
});

it("joins byte-sized sub-blocks without resetting the LZW bit cursor", () => {
	const result = decodeFixture({
		blocks: [{ ...goldenImage, subBlockSizes: [1, 1] }],
	});
	expectPixels(result, [red, blue]);
	expect(result.compressedBytes).toBe(2);
});

it("accepts every minimum code size from two through eight", () => {
	for (const minimumCodeSize of [2, 3, 4, 5, 6, 7, 8]) {
		const result = decodeFixture({
			blocks: [
				{ kind: "image", minimumCodeSize, indicesInStorageOrder: [0, 1] },
			],
		});
		expectPixels(result, [red, blue]);
	}
});

it("skips and reports a comment extension", () => {
	const result = decodeFixture({ blocks: [comment, goldenImage] });
	expectPixels(result, [red, blue]);
	expect(result.ignoredMetadata).toEqual(
		expect.arrayContaining([expect.any(String)]),
	);
});

it("skips and reports unknown application metadata", () => {
	const result = decodeFixture({ blocks: [application, goldenImage] });
	expectPixels(result, [red, blue]);
	expect(result.loopCount).toBeNull();
	expect(result.ignoredMetadata.length).toBeGreaterThan(0);
});

it("bounds and reports unknown nonrendering extension labels", () => {
	const result = decodeFixture({
		blocks: [
			{
				kind: "extension",
				label: 0xee,
				subBlocks: [
					[44, 59, 33],
					[0, 255],
				],
			},
			goldenImage,
		],
	});
	expectPixels(result, [red, blue]);
	expect(result.ignoredMetadata.length).toBeGreaterThan(0);
});

it("retains nonzero pixel aspect ratio as ignored metadata", () => {
	const result = decodeFixture({ pixelAspectRatio: 49 });
	expectPixels(result, [red, blue]);
	expect(result.ignoredMetadata.length).toBeGreaterThan(0);
});

it("reports user-input scheduling as ignored rather than waiting", () => {
	const result = decodeFixture({
		blocks: [
			gifGraphicControl({ userInput: true, delayCentiseconds: 2 }),
			goldenImage,
		],
	});
	expectPixels(result, [red, blue]);
	expect(result.durationMs).toBe(20);
	expect(result.ignoredMetadata.length).toBeGreaterThan(0);
});

it("reads a little-endian finite NETSCAPE loop count", () => {
	const result = decodeFixture({
		blocks: [gifLoopExtension(0x1234), goldenImage],
	});
	expect(result.loopCount).toBe(0x1234);
	expect(result.animated).toBe(false);
});

it("preserves zero as the infinite NETSCAPE loop count", () => {
	expect(
		decodeFixture({ blocks: [gifLoopExtension(0), goldenImage] }).loopCount,
	).toBe(0);
});

it("recognizes the ANIMEXTS loop application identifier", () => {
	expect(
		decodeFixture({ blocks: [gifLoopExtension(7, "ANIMEXTS1.0"), goldenImage] })
			.loopCount,
	).toBe(7);
});

it("converts a little-endian GCE delay from hundredths to milliseconds", () => {
	expect(
		decodeFixture({
			blocks: [gifGraphicControl({ delayCentiseconds: 0x1234 }), goldenImage],
		}).durationMs,
	).toBe(46600);
});

it("keeps GCE scope across both comments and applications", () => {
	const result = decodeFixture({
		blocks: [
			gifGraphicControl({ transparentIndex: 0, delayCentiseconds: 7 }),
			comment,
			application,
			goldenImage,
		],
	});
	expectPixels(result, [transparent, blue]);
	expect(result.durationMs).toBe(70);
});

it("resets consumed GCE transparency and delay before the next frame", () => {
	const result = decodeFixture({
		blocks: [
			gifGraphicControl({ delayCentiseconds: 7, transparentIndex: 3 }),
			{
				...goldenImage,
				localPalette: [
					[255, 0, 0],
					[0, 0, 255],
					[0, 255, 0],
					[255, 255, 255],
				],
			},
			goldenImage,
		],
	});
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({
		frameCount: 2,
		animated: true,
		durationMs: 70,
	});
});

it("accepts disposal methods zero through three without disposing the first snapshot", () => {
	for (const disposal of [0, 1, 2, 3]) {
		const result = decodeFixture({
			blocks: [
				gifGraphicControl({ disposal }),
				goldenImage,
				{ kind: "image", indicesInStorageOrder: [1, 0] },
			],
		});
		expectPixels(result, [red, blue]);
	}
});

it("presents only the first graphic even when a later frame covers the canvas", () => {
	const result = decodeFixture({
		blocks: [goldenImage, { kind: "image", indicesInStorageOrder: [1, 1] }],
	});
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({ frameCount: 2, animated: true });
});

it("aggregates transparency and interlacing from later frames", () => {
	const result = decodeFixture({
		blocks: [
			goldenImage,
			gifGraphicControl({ transparentIndex: 1 }),
			{ kind: "image", interlaced: true, indicesInStorageOrder: [0, 1] },
		],
	});
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({ transparent: true, interlaced: true });
});

it("validates later local palettes without repainting the first image", () => {
	const result = decodeFixture({
		blocks: [
			goldenImage,
			{
				kind: "image",
				localPalette: [
					[0, 255, 0],
					[255, 255, 255],
				],
				indicesInStorageOrder: [0, 1],
			},
		],
	});
	expectPixels(result, [red, blue]);
	expect(result.frameCount).toBe(2);
});

it("sums all frame delays and decoded/compressed counters", () => {
	const result = decodeFixture({
		blocks: [
			gifGraphicControl({ delayCentiseconds: 3 }),
			goldenImage,
			gifGraphicControl({ delayCentiseconds: 9 }),
			goldenImage,
		],
	});
	expect(result).toMatchObject({
		durationMs: 120,
		decodedIndices: 4,
		compressedBytes: 4,
	});
});

it("does not mutate encoded input during successful or failed decoding", () => {
	const valid = gifFixture().bytes;
	const copy = valid.slice();
	decodeGif(valid);
	expect(valid).toEqual(copy);
	const invalid = valid.subarray(0, valid.length - 1);
	expectError(invalid);
	expect(valid).toEqual(copy);
});

it("respects a nonzero input byte offset and excludes backing-buffer sentinels", () => {
	const original = gifFixture({ blocks: [goldenImage] }).bytes;
	const backing = new Uint8Array(original.length + 17).fill(0xff);
	backing.set(original, 9);
	const result = decodeGif(backing.subarray(9, 9 + original.length));
	expectPixels(result, [red, blue]);
	expect(backing[8]).toBe(255);
	expect(backing[9 + original.length]).toBe(255);
});

it("owns decoded pixels independently of later input mutations", () => {
	const input = gifFixture().bytes;
	const result = decodeGif(input);
	expect(result.image.pixels.buffer).not.toBe(input.buffer);
	input.fill(0);
	expectPixels(result, [red, blue]);
});

it("returns independent pixel buffers on repeated calls", () => {
	const input = gifFixture().bytes;
	const first = decodeGif(input);
	const second = decodeGif(input);
	first.image.pixels.fill(17);
	expectPixels(second, [red, blue]);
	expectPixels(decodeGif(input), [red, blue]);
});

it("freezes the decoded record, raster record, and ignored metadata list", () => {
	const result = decodeFixture({ blocks: [comment, goldenImage] });
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.image)).toBe(true);
	expect(Object.isFrozen(result.ignoredMetadata)).toBe(true);
	expect(() => (result.ignoredMetadata as string[]).push("changed")).toThrow(
		TypeError,
	);
	expect(result.ignoredMetadata).not.toContain("changed");
});

it("resets code width on deferred and consecutive clear codes without resetting pixels", () => {
	const result = decodeFixture(
		explicitImage(4, [
			{ code: 4, width: 3 },
			{ code: 4, width: 3 },
			{ code: 0, width: 3 },
			{ code: 1, width: 3 },
			{ code: 0, width: 3 },
			{ code: 4, width: 4 },
			{ code: 4, width: 3 },
			{ code: 1, width: 3 },
			{ code: 5, width: 3 },
		]),
	);
	expectPixels(result, [red, blue, red, blue]);
});

it("expands consecutive KwKwK codes at the three-to-four-bit boundary", () => {
	const result = decodeFixture(
		explicitImage(6, [
			{ code: 4, width: 3 },
			{ code: 0, width: 3 },
			{ code: 6, width: 3 },
			{ code: 7, width: 3 },
			{ code: 5, width: 4 },
		]),
	);
	expectPixels(result, [red, red, red, red, red, red]);
	expect(result.decodedIndices).toBe(6);
	const codes: GifCode[] = [
		{ code: 4, width: 3 },
		{ code: 0, width: 3 },
	];
	for (const range of [
		{ first: 6, last: 7, width: 3 },
		{ first: 8, last: 15, width: 4 },
		{ first: 16, last: 31, width: 5 },
		{ first: 32, last: 63, width: 6 },
		{ first: 64, last: 127, width: 7 },
		{ first: 128, last: 255, width: 8 },
	])
		for (let code = range.first; code <= range.last; code++)
			codes.push({ code, width: range.width });
	codes.push({ code: 5, width: 9 });
	const bytes = gifFixture({
		width: 251,
		height: 126,
		blocks: [{ kind: "image", codes }],
	}).bytes;
	const expanded = decodeGif(bytes);
	expectPixels(
		expanded,
		Array.from({ length: 31_626 }, () => red),
	);
	expect(expanded.decodedIndices).toBe(31_626);
	expect(expanded.work).toBeGreaterThanOrEqual(31_626);
	expectError(bytes, "resource-limit", { maxWork: 31_625 });
});

it("expands nested dictionary references in forward pixel order", () => {
	const result = decodeFixture(
		explicitImage(9, [
			{ code: 4, width: 3 },
			{ code: 0, width: 3 },
			{ code: 1, width: 3 },
			{ code: 6, width: 3 },
			{ code: 8, width: 4 },
			{ code: 7, width: 4 },
			{ code: 5, width: 4 },
		]),
	);
	expectPixels(result, [red, blue, red, blue, red, blue, red, blue, red]);
});

it("widens from three to four bits after three literal codes", () => {
	expectWidthTransition(3, 4);
});

it("widens from four to five bits after eleven literal codes", () => {
	expectWidthTransition(11, 5);
});

it("widens from five to six bits after twenty-seven literal codes", () => {
	expectWidthTransition(27, 6);
});

it("widens from six to seven bits after fifty-nine literal codes", () => {
	expectWidthTransition(59, 7);
});

it("widens from seven to eight bits after 123 literal codes", () => {
	expectWidthTransition(123, 8);
});

it("widens from eight to nine bits after 251 literal codes", () => {
	expectWidthTransition(251, 9);
});

it("widens from nine to ten bits after 507 literal codes", () => {
	expectWidthTransition(507, 10);
});

it("widens from ten to eleven bits after 1019 literal codes", () => {
	expectWidthTransition(1019, 11);
});

it("widens from eleven to twelve bits after 2043 literal codes", () => {
	expectWidthTransition(2043, 12);
});

it("freezes a full 4096-entry dictionary and keeps reading twelve-bit references", () => {
	const codes = zeroLiteralCodes(4091);
	codes.push(
		{ code: 4095, width: 12 },
		{ code: 4095, width: 12 },
		{ code: 1, width: 12 },
		{ code: 4095, width: 12 },
		{ code: 5, width: 12 },
	);
	const result = decodeFixture({
		width: 2049,
		height: 2,
		blocks: [{ kind: "image", codes }],
	});
	expectPixels(result, [
		...Array.from({ length: 4095 }, () => red),
		blue,
		red,
		red,
	]);
	expect(result.decodedIndices).toBe(4098);
});

it("resets a saturated dictionary with a twelve-bit clear and resumes three-bit codes", () => {
	const codes = zeroLiteralCodes(4091);
	codes.push(
		{ code: 4, width: 12 },
		{ code: 1, width: 3 },
		{ code: 0, width: 3 },
		{ code: 5, width: 3 },
	);
	const result = decodeFixture(explicitImage(4093, codes));
	expectPixels(result, [...Array.from({ length: 4091 }, () => red), blue, red]);
});

it("rejects non-GIF signatures and unsupported header versions", () => {
	for (const header of ["PNG89a", "GIF88a", "gif89a", "GIF90a"]) {
		const bytes = gifFixture().bytes;
		bytes.set(Array.from(header, (character) => character.charCodeAt(0)));
		expectError(bytes);
	}
});

it("rejects a zero-width logical screen", () => {
	expectError(gifFixture({ width: 0, blocks: [goldenImage] }).bytes);
});

it("rejects a zero-height logical screen", () => {
	expectError(gifFixture({ height: 0, blocks: [goldenImage] }).bytes);
});

it("rejects zero-width and zero-height image rectangles", () => {
	for (const size of [{ width: 0 }, { height: 0 }])
		expectError(gifFixture({ blocks: [{ ...goldenImage, ...size }] }).bytes);
});

it("enforces the dimension cap from a tiny header-only fixture", () => {
	for (const size of [{ width: 4097 }, { height: 4097 }])
		expectError(
			gifFixture({ ...size, blocks: [goldenImage] }).bytes,
			"resource-limit",
		);
});

it("enforces the logical pixel cap before allocating a large canvas", () => {
	expectError(
		gifFixture({ width: 2049, height: 2048, blocks: [goldenImage] }).bytes,
		"resource-limit",
	);
});

it("rejects rectangles extending beyond the right logical edge", () => {
	expectError(gifFixture({ blocks: [{ ...goldenImage, left: 1 }] }).bytes);
});

it("rejects rectangles extending beyond the bottom logical edge", () => {
	expectError(gifFixture({ blocks: [{ ...goldenImage, top: 1 }] }).bytes);
});

it("requires an active global or local color table", () => {
	expectError(gifFixture({ globalPalette: null }).bytes);
});

it("rejects a background index outside the global table", () => {
	expectError(gifFixture({ backgroundIndex: 2 }).bytes);
});

it("rejects decoded literal indices outside the active palette", () => {
	expectError(
		gifFixture({ blocks: [{ kind: "image", indicesInStorageOrder: [0, 2] }] })
			.bytes,
	);
});

it("rejects a transparent index outside the active palette", () => {
	expectError(
		gifFixture({
			blocks: [gifGraphicControl({ transparentIndex: 2 }), goldenImage],
		}).bytes,
	);
});

it("rejects a truncated local color table", () => {
	const fixture = gifFixture({
		blocks: [{ ...goldenImage, localPalette: redBlue }],
	});
	expectError(fixture.bytes.subarray(0, fixture.imageDataOffsets[0] - 1));
});

it("rejects a truncated global color table", () => {
	expectError(gifFixture().bytes.subarray(0, 18));
});

it("rejects LZW minimum code sizes outside two through eight", () => {
	for (const minimumCodeSize of [0, 1, 9, 12, 255])
		expectError(
			gifFixture({ blocks: [{ ...goldenImage, minimumCodeSize }] }).bytes,
		);
});

it("rejects forward dictionary references beyond next and references immediately after clear", () => {
	for (const codes of [
		[
			{ code: 4, width: 3 },
			{ code: 0, width: 3 },
			{ code: 7, width: 3 },
			{ code: 5, width: 3 },
		],
		[
			{ code: 4, width: 3 },
			{ code: 6, width: 3 },
			{ code: 5, width: 3 },
		],
	])
		expectError(gifFixture(explicitImage(2, codes)).bytes);
});

it("rejects an end code before any pixel is produced", () => {
	expectError(
		gifFixture(
			explicitImage(2, [
				{ code: 4, width: 3 },
				{ code: 5, width: 3 },
			]),
		).bytes,
	);
});

it("requires an end code even when the exact number of pixels has been produced", () => {
	expectError(
		gifFixture(
			explicitImage(2, [
				{ code: 4, width: 3 },
				{ code: 4, width: 3 },
				{ code: 4, width: 3 },
				{ code: 4, width: 3 },
				{ code: 4, width: 3 },
				{ code: 4, width: 3 },
				{ code: 0, width: 3 },
				{ code: 1, width: 3 },
			]),
		).bytes,
	);
});

it("rejects an otherwise valid stream with too few pixels", () => {
	expectError(gifFixture({ width: 3, blocks: [goldenImage] }).bytes);
});

it("rejects a dictionary expansion that exceeds the rectangle pixel count", () => {
	expectError(
		gifFixture(
			explicitImage(2, [
				{ code: 4, width: 3 },
				{ code: 0, width: 3 },
				{ code: 6, width: 3 },
				{ code: 5, width: 3 },
			]),
		).bytes,
	);
});

it("requires at least one image even when extensions and a trailer are present", () => {
	expectError(gifFixture({ blocks: [comment, gifLoopExtension(0)] }).bytes);
});

it("requires a trailer after a complete image", () => {
	expectError(gifFixture({ trailer: false }).bytes);
});

it("rejects nonstream bytes including zero padding after the trailer", () => {
	for (const trailingBytes of [[0], [255], [0x21, 0xfe, 0]])
		expectError(gifFixture({ trailingBytes }).bytes);
});

it("rejects concatenated complete GIF streams", () => {
	const first = gifFixture().bytes;
	const bytes = new Uint8Array(first.length * 2);
	bytes.set(first);
	bytes.set(first, first.length);
	expectError(bytes);
});

it("rejects every truncated header and logical-screen prefix", () => {
	const bytes = gifFixture().bytes;
	for (let length = 0; length < 13; length++)
		expectError(bytes.subarray(0, length));
});

it("rejects every truncated image descriptor prefix", () => {
	const fixture = gifFixture();
	for (let length = 1; length < 10; length++)
		expectError(fixture.bytes.subarray(0, fixture.imageOffsets[0] + length));
});

it("rejects an image sub-block whose declared payload is truncated", () => {
	const fixture = gifFixture({ blocks: [goldenImage] });
	expectError(fixture.bytes.subarray(0, fixture.imageDataOffsets[0] + 3));
});

it("requires the image data zero-length terminator separately from the end code", () => {
	expectError(
		gifFixture({ blocks: [{ ...goldenImage, terminateData: false }] }).bytes,
	);
});

it("requires a four-byte graphic-control payload", () => {
	for (const subBlocks of [[[0, 0, 0]], [[0, 0, 0, 0, 0]]])
		expectError(
			gifFixture({
				blocks: [{ kind: "extension", label: 0xf9, subBlocks }, goldenImage],
			}).bytes,
		);
});

it("requires the graphic-control extension terminator", () => {
	const fixture = gifFixture({ blocks: [gifGraphicControl(), goldenImage] });
	fixture.bytes[fixture.extensionOffsets[0] + 7] = 1;
	expectError(fixture.bytes);
});

it("rejects truncated comment and application sub-blocks", () => {
	for (const extension of [comment, application]) {
		const fixture = gifFixture({ blocks: [extension, goldenImage] });
		expectError(fixture.bytes.subarray(0, fixture.imageOffsets[0] - 2));
	}
});

it("explicitly rejects plain-text rendering instead of discarding it", () => {
	const plainText = {
		kind: "extension",
		label: 1,
		subBlocks: [[0, 0, 0, 0, 2, 0, 1, 0, 1, 1, 0, 1], [65]],
	} as const;
	expectError(
		gifFixture({ blocks: [plainText, goldenImage] }).bytes,
		"unsupported",
	);
});

it("explicitly rejects reserved disposal methods four through seven", () => {
	for (const disposal of [4, 5, 6, 7])
		expectError(
			gifFixture({ blocks: [gifGraphicControl({ disposal }), goldenImage] })
				.bytes,
			"unsupported",
		);
});

it("rejects malformed LZW in a later frame instead of returning the first image", () => {
	const codes = [
		{ code: 4, width: 3 },
		{ code: 0, width: 3 },
		{ code: 7, width: 3 },
	];
	expectError(
		gifFixture({ blocks: [goldenImage, { kind: "image", codes }] }).bytes,
	);
});

it("rejects an out-of-screen rectangle in a later frame", () => {
	expectError(
		gifFixture({ blocks: [goldenImage, { ...goldenImage, left: 1 }] }).bytes,
	);
});

it("rejects indices outside a later local palette", () => {
	expectError(
		gifFixture({
			blocks: [
				goldenImage,
				{ kind: "image", localPalette: redBlue, indicesInStorageOrder: [0, 2] },
			],
		}).bytes,
	);
});

it("requires the end code in every later frame", () => {
	const codes = [
		{ code: 4, width: 3 },
		{ code: 4, width: 3 },
		{ code: 4, width: 3 },
		{ code: 4, width: 3 },
		{ code: 4, width: 3 },
		{ code: 4, width: 3 },
		{ code: 0, width: 3 },
		{ code: 1, width: 3 },
	];
	expectError(
		gifFixture({ blocks: [goldenImage, { kind: "image", codes }] }).bytes,
	);
});

it("exports frozen decode limits without raising any native caps", () => {
	expect(Object.isFrozen(gifDecodeLimits)).toBe(true);
	expect(gifDecodeLimits).toMatchObject({
		maxInputBytes: 33_554_432,
		maxBlocks: 4096,
		maxSubBlocks: 131_072,
		maxFrames: 256,
		maxWork: 268_435_456,
		maxDimension: 4096,
		maxPixels: 4_194_304,
	});
});

it("applies maxPixels to the full logical canvas and accepts the exact boundary", () => {
	const fixture = gifFixture({
		width: 3,
		height: 2,
		blocks: [
			{ kind: "image", width: 1, height: 1, indicesInStorageOrder: [0] },
		],
	});
	expectError(fixture.bytes, "resource-limit", { maxPixels: 5 });
	expectPixels(decodeGif(fixture.bytes, { maxPixels: 6 }), [
		red,
		red,
		red,
		red,
		red,
		red,
	]);
});

it("strictly rejects invalid maxPixels values", () => {
	const bytes = gifFixture().bytes;
	for (const maxPixels of [
		0,
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		4_194_305,
		null,
		"2",
		true,
	])
		expectError(bytes, "invalid-input", { maxPixels } as GifDecodeOptions);
});

it("strictly rejects invalid maxWork values", () => {
	const bytes = gifFixture().bytes;
	for (const maxWork of [
		0,
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		268_435_457,
		null,
		"1000",
		true,
	])
		expectError(bytes, "invalid-input", { maxWork } as GifDecodeOptions);
});

it("rejects unknown option keys and nonobject option containers", () => {
	const bytes = gifFixture().bytes;
	for (const options of [
		{ unknown: true },
		{ maxPixels: 2, maxFrames: 1 },
		null,
		[],
		1,
		"options",
	])
		expectError(bytes, "invalid-input", options as GifDecodeOptions);
});

it("charges deterministic work and accepts exactly its reported budget", () => {
	const bytes = gifFixture({ blocks: [goldenImage] }).bytes;
	const result = decodeGif(bytes);
	expect(Number.isSafeInteger(result.work)).toBe(true);
	expect(result.work).toBeGreaterThan(1);
	expectError(bytes, "resource-limit", { maxWork: 1 });
	expectError(bytes, "resource-limit", { maxWork: result.work - 1 });
	expect(decodeGif(bytes, { maxWork: result.work }).work).toBe(result.work);
});

it("charges later-frame decoding against the same total work budget", () => {
	const single = decodeFixture({ blocks: [goldenImage] });
	const bytes = gifFixture({ blocks: [goldenImage, goldenImage] }).bytes;
	const multiple = decodeGif(bytes);
	expect(multiple.work).toBeGreaterThan(single.work);
	expectError(bytes, "resource-limit", { maxWork: single.work });
	expect(decodeGif(bytes, { maxWork: multiple.work }).decodedIndices).toBe(4);
});

it("counts only compressed image payload bytes and excludes metadata and sub-block sizes", () => {
	const result = decodeFixture({
		blocks: [
			comment,
			application,
			{ ...goldenImage, subBlockSizes: [1, 1] },
			comment,
			goldenImage,
		],
	});
	expect(result).toMatchObject({ compressedBytes: 4, decodedIndices: 4 });
});

it("accepts 256 frames and rejects the 257th without retaining their rasters", () => {
	const blocks = Array.from({ length: 256 }, () => goldenImage);
	const result = decodeFixture({ blocks });
	expectPixels(result, [red, blue]);
	expect(result).toMatchObject({
		frameCount: 256,
		decodedIndices: 512,
		compressedBytes: 512,
	});
	expectError(
		gifFixture({ blocks: [...blocks, goldenImage] }).bytes,
		"resource-limit",
	);
});

it("bounds top-level extension traversal independently of frame count", () => {
	const blocks = [...Array.from({ length: 4097 }, () => comment), goldenImage];
	expectError(gifFixture({ blocks }).bytes, "resource-limit");
});

it("bounds sub-block traversal even within a single comment extension", () => {
	const payload = [65];
	const subBlocks = Array.from({ length: 131_073 }, () => payload);
	expectError(
		gifFixture({
			blocks: [{ kind: "extension", label: 0xfe, subBlocks }, goldenImage],
		}).bytes,
		"resource-limit",
	);
});

it("rejects unsupported disposal on later frames instead of returning partial success", () => {
	expectError(
		gifFixture({
			blocks: [goldenImage, gifGraphicControl({ disposal: 7 }), goldenImage],
		}).bytes,
		"unsupported",
	);
});

it("validates malformed trailing extensions after an otherwise complete image", () => {
	expectError(
		gifFixture({
			blocks: [
				goldenImage,
				{
					kind: "extension",
					label: 0xfe,
					subBlocks: [[65]],
					terminateData: false,
				},
			],
		}).bytes,
	);
});
