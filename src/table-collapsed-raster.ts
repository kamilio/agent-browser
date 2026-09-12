import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import {
	paintRasterRect,
	type RasterImage,
	type Rgba,
	validateRaster,
} from "./raster.js";

export interface CollapsedTableBorderPaint {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly color: Rgba;
	readonly ownerId: number;
}

export function paintCollapsedTableBorders(
	image: RasterImage,
	originX: number,
	originY: number,
	segments: readonly CollapsedTableBorderPaint[],
	charge: (work: number) => void,
): number {
	validateRaster(image);
	layoutNumber(originX, true);
	layoutNumber(originY, true);
	if (!Array.isArray(segments))
		throw new AgentBrowserError("invalid-input", "Invalid collapsed borders");
	charge(1);
	const winners = new Map<number, CollapsedTableBorderPaint>();
	for (const segment of segments) {
		charge(1);
		if (
			!segment ||
			typeof segment !== "object" ||
			!Number.isSafeInteger(segment.ownerId) ||
			segment.ownerId < 0
		)
			throw new AgentBrowserError("invalid-input", "Invalid collapsed border");
		layoutNumber(segment.x, true);
		layoutNumber(segment.y, true);
		layoutNumber(segment.width);
		layoutNumber(segment.height);
		layoutNumber(segment.x + segment.width, true);
		layoutNumber(segment.y + segment.height, true);
		const horizontal = layoutNumber(originX + segment.x, true);
		const vertical = layoutNumber(originY + segment.y, true);
		const horizontalEnd = layoutNumber(horizontal + segment.width, true);
		const verticalEnd = layoutNumber(vertical + segment.height, true);
		const color = segment.color;
		if (
			!Array.isArray(color) ||
			color.length !== 4 ||
			![0, 1, 2, 3].every(
				(channel) =>
					Number.isInteger(color[channel]) &&
					color[channel] >= 0 &&
					color[channel] <= 255,
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid RGBA color");
		if (segment.width === 0 || segment.height === 0) continue;
		const left = Math.max(
			0,
			Math.min(image.width, Math.ceil(horizontal - 0.5)),
		);
		const right = Math.max(
			0,
			Math.min(image.width, Math.ceil(horizontalEnd - 0.5)),
		);
		const top = Math.max(0, Math.min(image.height, Math.ceil(vertical - 0.5)));
		const bottom = Math.max(
			0,
			Math.min(image.height, Math.ceil(verticalEnd - 0.5)),
		);
		if (left >= right || top >= bottom) continue;
		for (let row = top; row < bottom; row++)
			for (let column = left; column < right; column++) {
				charge(2);
				winners.set(row * image.width + column, segment);
			}
	}
	charge(winners.size);
	let painted = 0;
	for (const [pixel, segment] of winners) {
		if (segment.color[3] === 0) continue;
		paintRasterRect(
			image,
			pixel % image.width,
			Math.floor(pixel / image.width),
			1,
			1,
			segment.color,
		);
		painted++;
	}
	return painted;
}
