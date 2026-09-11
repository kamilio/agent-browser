import {
	bitmapFont,
	bitmapFontMetrics,
	bitmapGlyph,
	type BitmapFontWeight,
} from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export type Rgba = readonly [number, number, number, number];
export interface RasterImage {
	readonly width: number;
	readonly height: number;
	readonly pixels: Uint8Array;
}
export const rasterLimits = Object.freeze({
	maxDimension: 4096,
	maxPixels: 4_194_304,
});

function dimensions(width: number, height: number) {
	if (
		![width, height].every((value) => Number.isSafeInteger(value) && value > 0)
	)
		throw new AgentBrowserError("invalid-input", "Invalid raster dimensions");
	if (
		width > rasterLimits.maxDimension ||
		height > rasterLimits.maxDimension ||
		width * height > rasterLimits.maxPixels
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Raster pixel limit exceeded",
		);
}
function colorValue(color: Rgba) {
	if (
		!Array.isArray(color) ||
		color.length !== 4 ||
		![0, 1, 2, 3].every(
			(index) =>
				Number.isInteger(color[index]) &&
				color[index] >= 0 &&
				color[index] <= 255,
		)
	)
		throw new AgentBrowserError("invalid-input", "Invalid RGBA color");
}
export function validateRaster(image: RasterImage) {
	if (!image || typeof image !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid raster image");
	dimensions(image.width, image.height);
	if (
		!(image.pixels instanceof Uint8Array) ||
		image.pixels.length !== image.width * image.height * 4
	)
		throw new AgentBrowserError("invalid-input", "Invalid raster pixel buffer");
}

export function createRaster(
	width: number,
	height: number,
	background: Rgba = [0, 0, 0, 0],
): Readonly<RasterImage> {
	dimensions(width, height);
	colorValue(background);
	const pixels = new Uint8Array(width * height * 4);
	if (background.some((channel) => channel !== 0))
		for (let offset = 0; offset < pixels.length; offset += 4)
			pixels.set(background, offset);
	return Object.freeze({ width, height, pixels });
}

function fill(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
) {
	if (width === 0 || height === 0 || color[3] === 0) return;
	const left = Math.max(0, Math.min(image.width, Math.ceil(originX - 0.5)));
	const right = Math.max(
		0,
		Math.min(image.width, Math.ceil(originX + width - 0.5)),
	);
	const top = Math.max(0, Math.min(image.height, Math.ceil(originY - 0.5)));
	const bottom = Math.max(
		0,
		Math.min(image.height, Math.ceil(originY + height - 0.5)),
	);
	const sourceAlpha = color[3] / 255;
	for (let row = top; row < bottom; row++)
		for (let column = left; column < right; column++) {
			const offset = (row * image.width + column) * 4;
			if (color[3] === 255) image.pixels.set(color, offset);
			else {
				const destinationWeight =
					(image.pixels[offset + 3] / 255) * (1 - sourceAlpha);
				const alpha = sourceAlpha + destinationWeight;
				for (let channel = 0; channel < 3; channel++)
					image.pixels[offset + channel] = Math.round(
						(color[channel] * sourceAlpha +
							image.pixels[offset + channel] * destinationWeight) /
							alpha,
					);
				image.pixels[offset + 3] = Math.round(alpha * 255);
			}
		}
}

export function paintRasterRect(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
) {
	validateRaster(image);
	colorValue(color);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	layoutNumber(width);
	layoutNumber(height);
	fill(image, originX, originY, width, height, color);
}

export function paintRasterImage(
	image: RasterImage,
	source: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
) {
	validateRaster(image);
	validateRaster(source);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	layoutNumber(width);
	layoutNumber(height);
	layoutNumber(originX + width, true);
	layoutNumber(originY + height, true);
	if (width === 0 || height === 0) return;
	const left = Math.max(0, Math.min(image.width, Math.ceil(originX - 0.5)));
	const right = Math.max(
		0,
		Math.min(image.width, Math.ceil(originX + width - 0.5)),
	);
	const top = Math.max(0, Math.min(image.height, Math.ceil(originY - 0.5)));
	const bottom = Math.max(
		0,
		Math.min(image.height, Math.ceil(originY + height - 0.5)),
	);
	if (left >= right || top >= bottom) return;
	const pixels =
		source.pixels.buffer === image.pixels.buffer
			? source.pixels.slice()
			: source.pixels;
	for (let row = top; row < bottom; row++) {
		const sourceRow = Math.min(
			source.height - 1,
			Math.floor(((row + 0.5 - originY) / height) * source.height),
		);
		for (let column = left; column < right; column++) {
			const sourceColumn = Math.min(
				source.width - 1,
				Math.floor(((column + 0.5 - originX) / width) * source.width),
			);
			const input = (sourceRow * source.width + sourceColumn) * 4;
			const offset = (row * image.width + column) * 4;
			const sourceAlpha = pixels[input + 3] / 255;
			if (sourceAlpha === 0) continue;
			const destinationWeight =
				(image.pixels[offset + 3] / 255) * (1 - sourceAlpha);
			const alpha = sourceAlpha + destinationWeight;
			for (let channel = 0; channel < 3; channel++)
				image.pixels[offset + channel] = Math.round(
					(pixels[input + channel] * sourceAlpha +
						image.pixels[offset + channel] * destinationWeight) /
						alpha,
				);
			image.pixels[offset + 3] = Math.round(alpha * 255);
		}
	}
}

export function paintBitmapGlyph(
	image: RasterImage,
	character: string,
	originX: number,
	originY: number,
	fontSize = 16,
	color: Rgba = [0, 0, 0, 255],
	weight: BitmapFontWeight = 400,
): boolean {
	validateRaster(image);
	colorValue(color);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	const glyph = bitmapGlyph(character, weight);
	const { scale } = bitmapFontMetrics(fontSize);
	for (let row = 0; row < bitmapFont.glyphHeight; row++)
		for (let column = 0; column < bitmapFont.glyphWidth; column++)
			if (glyph.rows[row] & (1 << (bitmapFont.glyphWidth - column - 1)))
				fill(
					image,
					originX + column * scale,
					originY + row * scale,
					scale,
					scale,
					color,
				);
	return glyph.supported;
}
