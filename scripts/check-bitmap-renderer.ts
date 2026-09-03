import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { bitmapFontMetrics } from "../src/bitmap-font.js";
import { encodePng } from "../src/png.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
} from "../src/raster.js";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
	throw new Error("Provide one PNG output path");
const started = performance.now();
const image = createRaster(720, 384, [245, 247, 250, 255]);
paintRasterRect(image, 0, 0, image.width, 48, [20, 35, 55, 255]);
let supportedGlyphs = 0;
let fallbackGlyphs = 0;
function text(
	value: string,
	originX: number,
	originY: number,
	size: number,
	light = false,
) {
	const metrics = bitmapFontMetrics(size);
	let cursor = originX;
	for (const character of value) {
		const supported = paintBitmapGlyph(
			image,
			character,
			cursor,
			originY,
			size,
			light ? [245, 247, 250, 255] : [20, 35, 55, 255],
		);
		if (supported) supportedGlyphs++;
		else fallbackGlyphs++;
		cursor += metrics.advance;
	}
}
text("AGENT MONO / ORIGINAL PIXEL FONT", 16, 14, 16, true);
for (let row = 0; row < 5; row++) {
	const characters = Array.from(
		{ length: Math.min(20, 127 - (32 + row * 20)) },
		(_, column) => String.fromCharCode(32 + row * 20 + column),
	);
	for (let column = 0; column < characters.length; column++)
		text(characters[column], 20 + column * 34, 66 + row * 32, 24);
}
text("The quick brown fox jumps over the lazy dog.", 16, 244, 16);
text("0123456789  O0 Il1  []{}() <> /\\ @#$%&", 16, 268, 16);
text("8px: exact pixels; 10.5px: sampled; 16px: doubled", 16, 302, 8);
text("fractional size: ABC abc gjpqy 0123456789", 16, 321, 10.5);
text("Unsupported: é 中 🙂", 16, 348, 16);
const png = encodePng(image);
writeFileSync(output, png);
console.log(
	JSON.stringify(
		{
			stage: "native-font-raster-png",
			partial: true,
			pageRendering: false,
			javascriptRuntime: false,
			network: false,
			width: image.width,
			height: image.height,
			supportedGlyphs,
			fallbackGlyphs,
			pngBytes: png.length,
			sha256: createHash("sha256").update(png).digest("hex"),
			output,
			elapsedMs: performance.now() - started,
			peakRssBytes: process.resourceUsage().maxRSS * 1024,
		},
		null,
		2,
	),
);
