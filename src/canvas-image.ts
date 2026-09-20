import type { RasterImage } from "./raster.js";

// Sources are resolved by the document binding, never supplied by guest records.
export interface CanvasImageSource {
	readonly width: number;
	readonly height: number;
	readonly image?: Readonly<RasterImage>;
	readonly originClean: boolean;
}

export function paintCanvasImage(
	destination: Readonly<RasterImage>,
	source: CanvasImageSource,
	rect: readonly [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	],
	opacity: number,
): void {
	const image = source.image;
	if (!image) return;
	const [sx, sy, sw, sh, dx, dy, dw, dh] = rect;
	// Visit only destination pixels. Source clipping preserves the original mapping
	// instead of stretching the portion that remains inside the source bitmap.
	const left = Math.max(0, Math.min(destination.width, Math.ceil(dx - 0.5)));
	const right = Math.max(
		0,
		Math.min(destination.width, Math.ceil(dx + dw - 0.5)),
	);
	const top = Math.max(0, Math.min(destination.height, Math.ceil(dy - 0.5)));
	const bottom = Math.max(
		0,
		Math.min(destination.height, Math.ceil(dy + dh - 0.5)),
	);
	if (left >= right || top >= bottom) return;
	// Self-drawing reads the pre-draw bitmap, including overlapping copies.
	// The transient copy is bounded by the existing canvas pixel limit.
	const pixels =
		image.pixels.buffer === destination.pixels.buffer
			? image.pixels.slice()
			: image.pixels;
	for (let y = top; y < bottom; y++) {
		const sourceY = sy + ((y + 0.5 - dy) / dh) * sh;
		if (sourceY < 0 || sourceY >= source.height) continue;
		const row = Math.min(
			image.height - 1,
			Math.floor((sourceY / source.height) * image.height),
		);
		for (let x = left; x < right; x++) {
			const sourceX = sx + ((x + 0.5 - dx) / dw) * sw;
			if (sourceX < 0 || sourceX >= source.width) continue;
			const column = Math.min(
				image.width - 1,
				Math.floor((sourceX / source.width) * image.width),
			);
			const input = (row * image.width + column) * 4;
			const output = (y * destination.width + x) * 4;
			const alpha = (pixels[input + 3] / 255) * opacity;
			if (alpha === 0) continue;
			const weight = (destination.pixels[output + 3] / 255) * (1 - alpha);
			const combined = alpha + weight;
			for (let c = 0; c < 3; c++)
				destination.pixels[output + c] = Math.round(
					(pixels[input + c] * alpha +
						destination.pixels[output + c] * weight) /
						combined,
				);
			destination.pixels[output + 3] = Math.round(combined * 255);
		}
	}
}
