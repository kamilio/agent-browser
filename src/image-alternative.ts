import {
	bitmapFont,
	bitmapGlyph,
	type BitmapFontWeight,
} from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
	rasterLimits,
	validateRaster,
	type RasterImage,
	type Rgba,
} from "./raster.js";

export interface ImageAlternative {
	readonly text: string;
	readonly fontSize: number;
	readonly width: number;
	readonly height: number;
}

function validateFontSize(fontSize: number): number {
	const size = layoutNumber(fontSize);
	if (size > bitmapFont.maxFontSize)
		throw new AgentBrowserError(
			"resource-limit",
			"Image alternative font size limit exceeded",
		);
	return size;
}

function validateText(text: string) {
	if (typeof text !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid image alternative text",
		);
}

function validateCharge(charge: (amount: number) => void) {
	if (typeof charge !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid image alternative work owner",
		);
}

function alternativeValues(alternative: Readonly<ImageAlternative>) {
	if (
		!alternative ||
		typeof alternative !== "object" ||
		Array.isArray(alternative)
	)
		throw new AgentBrowserError("invalid-input", "Invalid image alternative");
	const { text, fontSize, width, height } = alternative;
	validateText(text);
	const size = validateFontSize(fontSize);
	if (layoutNumber(width) < 1 || layoutNumber(height) < 1)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid image alternative dimensions",
		);
	return { text, size };
}

function alternativeColor(
	color: Rgba,
	charge: (amount: number) => void,
	weight: BitmapFontWeight,
): Rgba {
	if (!Array.isArray(color) || color.length !== 4)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid image alternative color",
		);
	const copiedColor: Rgba = [color[0], color[1], color[2], color[3]];
	if (
		!copiedColor.every(
			(channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid image alternative color",
		);
	if (!bitmapFont.weights.includes(weight))
		throw new AgentBrowserError(
			"invalid-input",
			"Unregistered bitmap font weight",
		);
	validateCharge(charge);
	return copiedColor;
}

export function describeImageAlternative(
	text: string,
	fontSize: number,
	charge: (amount: number) => void,
): Readonly<ImageAlternative> {
	validateText(text);
	const size = validateFontSize(fontSize);
	validateCharge(charge);
	charge(text.length * 3 + 1);
	const normalized = text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
	let count = 0;
	for (const _character of normalized) count++;
	const advance = bitmapFont.advance * (size / bitmapFont.unitsPerEm);
	return Object.freeze({
		text: normalized,
		fontSize: size,
		width: layoutNumber(Math.max(1, advance * count)),
		height: layoutNumber(Math.max(1, size)),
	});
}

export function rasterizeImageAlternative(
	alternative: Readonly<ImageAlternative>,
	width: number,
	height: number,
	color: Rgba,
	charge: (amount: number) => void,
	weight: BitmapFontWeight = 400,
): RasterImage {
	const { text, size } = alternativeValues(alternative);
	layoutNumber(width);
	layoutNumber(height);
	const pixelWidth = Math.max(1, Math.ceil(width));
	const pixelHeight = Math.max(1, Math.ceil(height));
	if (
		pixelWidth > rasterLimits.maxDimension ||
		pixelHeight > rasterLimits.maxDimension ||
		pixelWidth * pixelHeight > rasterLimits.maxPixels
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Image alternative raster pixel limit exceeded",
		);
	const copiedColor = alternativeColor(color, charge, weight);
	const clipWidth = Math.max(0, Math.ceil(width - 0.5));
	const clipHeight = Math.max(0, Math.ceil(height - 0.5));
	const scale = size / bitmapFont.unitsPerEm;
	const advance = bitmapFont.advance * scale;
	const hasInk =
		clipWidth > 0 &&
		clipHeight > 0 &&
		scale > 0 &&
		copiedColor[3] > 0 &&
		text.length > 0;
	charge(pixelWidth * pixelHeight * 4);
	if (hasInk) {
		const glyphCount = Math.min(text.length, Math.ceil(width / advance) + 1);
		const glyphPixels =
			Math.min(pixelWidth, Math.ceil(bitmapFont.glyphWidth * scale) + 1) *
			Math.min(pixelHeight, Math.ceil(bitmapFont.glyphHeight * scale) + 1);
		const clippedBytes =
			(clipHeight * (pixelWidth - clipWidth) +
				(pixelHeight - clipHeight) * pixelWidth) *
			4;
		charge(
			glyphCount *
				(1 + bitmapFont.glyphWidth * bitmapFont.glyphHeight + glyphPixels * 4) +
				clippedBytes,
		);
	}
	const image = createRaster(pixelWidth, pixelHeight);
	if (!hasInk) return image;
	let glyphIndex = 0;
	for (const character of text) {
		paintBitmapGlyph(
			image,
			character,
			glyphIndex * advance,
			0,
			size,
			copiedColor,
			weight,
		);
		glyphIndex++;
		if (glyphIndex * advance >= width) break;
	}
	if (clipWidth < pixelWidth)
		for (let row = 0; row < clipHeight; row++)
			image.pixels.fill(
				0,
				(row * pixelWidth + clipWidth) * 4,
				(row + 1) * pixelWidth * 4,
			);
	if (clipHeight < pixelHeight)
		image.pixels.fill(0, clipHeight * pixelWidth * 4);
	return image;
}

export function paintImageAlternative(
	image: RasterImage,
	alternative: Readonly<ImageAlternative>,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
	charge: (amount: number) => void,
	weight: BitmapFontWeight = 400,
): void {
	if (!image || typeof image !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid raster image");
	const target: RasterImage = {
		width: image.width,
		height: image.height,
		pixels: image.pixels,
	};
	validateRaster(target);
	const { text, size } = alternativeValues(alternative);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	layoutNumber(width);
	layoutNumber(height);
	const contentRight = layoutNumber(originX + width, true);
	const contentBottom = layoutNumber(originY + height, true);
	const copiedColor = alternativeColor(color, charge, weight);
	const scale = size / bitmapFont.unitsPerEm;
	const advance = bitmapFont.advance * scale;
	const left = Math.max(0, originX);
	const top = Math.max(0, originY);
	const right = Math.min(target.width, contentRight);
	const bottom = Math.min(target.height, contentBottom, originY + size);
	if (
		left >= right ||
		top >= bottom ||
		scale === 0 ||
		copiedColor[3] === 0 ||
		text.length === 0
	)
		return;
	const iterationCount = Math.min(
		text.length,
		Math.ceil((right - originX) / advance) + 1,
	);
	const visibleCount = Math.min(
		iterationCount,
		Math.ceil((right - left + bitmapFont.glyphWidth * scale) / advance) + 2,
	);
	const cellPixels =
		Math.min(Math.ceil(scale) + 1, Math.ceil(right - left) + 1) *
		Math.min(Math.ceil(scale) + 1, Math.ceil(bottom - top) + 1);
	charge(iterationCount * 2 + 1);
	charge(
		visibleCount *
			bitmapFont.glyphWidth *
			bitmapFont.glyphHeight *
			(1 + cellPixels * 4),
	);
	let glyphIndex = 0;
	for (const character of text) {
		const glyphLeft = originX + glyphIndex * advance;
		if (glyphLeft + bitmapFont.glyphWidth * scale > left) {
			const glyph = bitmapGlyph(character, weight);
			for (let row = 0; row < bitmapFont.glyphHeight; row++) {
				const cellTop = originY + row * scale;
				const clippedTop = Math.max(top, cellTop);
				const clippedBottom = Math.min(bottom, cellTop + scale);
				if (clippedTop >= clippedBottom) continue;
				for (let column = 0; column < bitmapFont.glyphWidth; column++) {
					if (!(glyph.rows[row] & (1 << (bitmapFont.glyphWidth - column - 1))))
						continue;
					const cellLeft = glyphLeft + column * scale;
					const clippedLeft = Math.max(left, cellLeft);
					const clippedRight = Math.min(right, cellLeft + scale);
					if (clippedLeft >= clippedRight) continue;
					paintRasterRect(
						target,
						clippedLeft,
						clippedTop,
						clippedRight - clippedLeft,
						clippedBottom - clippedTop,
						copiedColor,
					);
				}
			}
		}
		glyphIndex++;
		if (originX + glyphIndex * advance >= right) break;
	}
}
