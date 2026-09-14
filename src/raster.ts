import {
	bitmapFont,
	bitmapFontMetrics,
	bitmapGlyph,
	type BitmapFontWeight,
} from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";
import {
	bitmapGlyphInk,
	fontStyleSlope,
	type NativeFontStyle,
} from "./font-style.js";
import { layoutNumber } from "./layout-values.js";
import {
	type CornerRadii,
	type RoundedBox,
	roundedBoxSpan,
	validateRoundedBox,
} from "./rounded-box.js";

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
export const rasterClipLimits = Object.freeze({
	maxClips: 1024,
});

interface RasterClipSpan {
	readonly left: number;
	readonly right: number;
}

interface RasterClipState {
	readonly clips: readonly Readonly<RoundedBox>[];
	readonly rows: Map<number, Readonly<RasterClipSpan>>;
	readonly charge: ((work: number) => void) | undefined;
}

const rasterClipStates = new WeakMap<RasterImage, RasterClipState>();

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

export function withRasterClips(
	image: RasterImage,
	clips: readonly Readonly<RoundedBox>[],
	charge?: (work: number) => void,
): Readonly<RasterImage> {
	validateRaster(image);
	if (!Array.isArray(clips))
		throw new AgentBrowserError("invalid-input", "Invalid raster clips");
	if (charge !== undefined && typeof charge !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid raster clip charge callback",
		);
	const inherited = rasterClipStates.get(image);
	const count = clips.length;
	if (count + (inherited?.clips.length ?? 0) > rasterClipLimits.maxClips)
		throw new AgentBrowserError("resource-limit", "Raster clip limit exceeded");
	const work = charge ?? inherited?.charge;
	work?.(1 + (inherited?.clips.length ?? 0));
	const captured = inherited ? [...inherited.clips] : [];
	for (let index = 0; index < count; index++) {
		work?.(5);
		const clip = clips[index];
		if (!clip || typeof clip !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid rounded box");
		const radii = clip.radii;
		if (!Array.isArray(radii) || radii.length !== 4)
			throw new AgentBrowserError("invalid-input", "Invalid corner radii");
		const snapshot = Object.freeze({
			x: clip.x,
			y: clip.y,
			width: clip.width,
			height: clip.height,
			radii: Object.freeze(
				[0, 1, 2, 3].map((corner) => {
					const radius = radii[corner];
					if (!radius || typeof radius !== "object")
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid corner radius",
						);
					return Object.freeze({
						horizontal: radius.horizontal,
						vertical: radius.vertical,
					});
				}),
			) as unknown as CornerRadii,
		});
		validateRoundedBox(snapshot);
		captured.push(snapshot);
	}
	const view = Object.freeze({
		width: image.width,
		height: image.height,
		pixels: image.pixels,
	});
	validateRaster(view);
	rasterClipStates.set(view, {
		clips: Object.freeze(captured),
		rows: new Map(),
		charge: work,
	});
	return view;
}

function rasterClipSpan(
	image: RasterImage,
	row: number,
): Readonly<RasterClipSpan> | undefined {
	const state = rasterClipStates.get(image);
	if (!state) return;
	state.charge?.(1);
	const cached = state.rows.get(row);
	if (cached !== undefined) return cached;
	let left = 0;
	let right = image.width;
	for (const clip of state.clips) {
		state.charge?.(1);
		const span = roundedBoxSpan(clip, row + 0.5);
		if (!span) {
			left = right = 0;
			break;
		}
		left = Math.max(left, Math.ceil(span.left - 0.5));
		right = Math.min(right, Math.ceil(span.right - 0.5));
		if (left >= right) {
			left = right = 0;
			break;
		}
	}
	state.charge?.(1);
	const span = Object.freeze({ left, right });
	state.rows.set(row, span);
	return span;
}

function fill(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
	clip?: RoundedBox,
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
	if (left >= right || top >= bottom) return;
	const sourceAlpha = color[3] / 255;
	for (let row = top; row < bottom; row++) {
		let rowLeft = left;
		let rowRight = right;
		const inheritedClip = rasterClipSpan(image, row);
		if (inheritedClip !== undefined) {
			rowLeft = Math.max(rowLeft, inheritedClip.left);
			rowRight = Math.min(rowRight, inheritedClip.right);
			if (rowLeft >= rowRight) continue;
		}
		if (clip !== undefined) {
			rasterClipStates.get(image)?.charge?.(1);
			const span = roundedBoxSpan(clip, row + 0.5);
			if (!span) continue;
			rowLeft = Math.max(rowLeft, Math.ceil(span.left - 0.5));
			rowRight = Math.min(rowRight, Math.ceil(span.right - 0.5));
		}
		for (let column = rowLeft; column < rowRight; column++) {
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
}

export function paintRasterRect(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
	clip?: RoundedBox,
) {
	validateRaster(image);
	colorValue(color);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	layoutNumber(width);
	layoutNumber(height);
	if (clip !== undefined) validateRoundedBox(clip);
	fill(image, originX, originY, width, height, color, clip);
}

export function paintRasterImage(
	image: RasterImage,
	source: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	clip?: RoundedBox,
	opacity = 1,
) {
	validateRaster(image);
	validateRaster(source);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	layoutNumber(width);
	layoutNumber(height);
	layoutNumber(originX + width, true);
	layoutNumber(originY + height, true);
	if (clip !== undefined) validateRoundedBox(clip);
	if (
		typeof opacity !== "number" ||
		!Number.isFinite(opacity) ||
		opacity < 0 ||
		opacity > 1
	)
		throw new AgentBrowserError("invalid-input", "Invalid raster opacity");
	if (width === 0 || height === 0 || opacity === 0) return;
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
		let rowLeft = left;
		let rowRight = right;
		const inheritedClip = rasterClipSpan(image, row);
		if (inheritedClip !== undefined) {
			rowLeft = Math.max(rowLeft, inheritedClip.left);
			rowRight = Math.min(rowRight, inheritedClip.right);
			if (rowLeft >= rowRight) continue;
		}
		if (clip !== undefined) {
			rasterClipStates.get(image)?.charge?.(1);
			const span = roundedBoxSpan(clip, row + 0.5);
			if (!span) continue;
			rowLeft = Math.max(rowLeft, Math.ceil(span.left - 0.5));
			rowRight = Math.min(rowRight, Math.ceil(span.right - 0.5));
		}
		const sourceRow = Math.min(
			source.height - 1,
			Math.floor(((row + 0.5 - originY) / height) * source.height),
		);
		for (let column = rowLeft; column < rowRight; column++) {
			const sourceColumn = Math.min(
				source.width - 1,
				Math.floor(((column + 0.5 - originX) / width) * source.width),
			);
			const input = (sourceRow * source.width + sourceColumn) * 4;
			const offset = (row * image.width + column) * 4;
			const sourceAlpha = (pixels[input + 3] / 255) * opacity;
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
	style: NativeFontStyle = "normal",
): boolean {
	validateRaster(image);
	colorValue(color);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	const glyph = bitmapGlyph(character, weight);
	const { scale } = bitmapFontMetrics(fontSize);
	const slope = fontStyleSlope(style);
	if (slope !== 0) {
		if (scale === 0 || color[3] === 0) return glyph.supported;
		const ink = bitmapGlyphInk(character, weight, style);
		const top = Math.max(0, Math.ceil(originY + ink.y * scale - 0.5));
		const bottom = Math.min(
			image.height,
			Math.ceil(originY + (ink.y + ink.height) * scale - 0.5),
		);
		for (let row = top; row < bottom; row++) {
			const relativeY = row + 0.5 - originY;
			const bitmapRow = Math.floor(relativeY / scale);
			const shift = slope * (bitmapFont.ascent * scale - relativeY);
			for (let column = 0; column < bitmapFont.glyphWidth; column++)
				if (glyph.rows[bitmapRow] & (1 << (bitmapFont.glyphWidth - column - 1)))
					fill(image, originX + column * scale + shift, row, scale, 1, color);
		}
		return glyph.supported;
	}
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
