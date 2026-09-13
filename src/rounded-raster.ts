import { AgentBrowserError } from "./errors.js";
import {
	paintRasterImage,
	paintRasterRect,
	type RasterImage,
	type Rgba,
	validateRaster,
} from "./raster.js";
import {
	type RoundedBox,
	roundedBoxSpan,
	validateRoundedBox,
} from "./rounded-box.js";

function prepare(
	image: RasterImage,
	box: RoundedBox,
	charge: (amount: number) => void,
) {
	if (typeof charge !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid rounded raster work owner",
		);
	charge(1);
	validateRaster(image);
	validateRoundedBox(box);
}

function coveredPixels(
	image: RasterImage,
	box: RoundedBox,
	charge: (amount: number) => void,
): number {
	const left = Math.max(0, Math.min(image.width, Math.ceil(box.x - 0.5)));
	const right = Math.max(
		0,
		Math.min(image.width, Math.ceil(box.x + box.width - 0.5)),
	);
	const top = Math.max(0, Math.min(image.height, Math.ceil(box.y - 0.5)));
	const bottom = Math.max(
		0,
		Math.min(image.height, Math.ceil(box.y + box.height - 0.5)),
	);
	if (left >= right || top >= bottom) return 0;
	charge((bottom - top) * 2);
	let covered = 0;
	for (let row = top; row < bottom; row++) {
		const span = roundedBoxSpan(box, row + 0.5);
		if (!span) continue;
		const rowLeft = Math.max(left, Math.ceil(span.left - 0.5));
		const rowRight = Math.min(right, Math.ceil(span.right - 0.5));
		covered += Math.max(0, rowRight - rowLeft);
	}
	if (covered > 0) charge(covered * 4);
	return covered;
}

export function paintRoundedRect(
	image: RasterImage,
	box: RoundedBox,
	color: Rgba,
	charge: (amount: number) => void,
): number {
	prepare(image, box, charge);
	const covered = color?.[3] === 0 ? 0 : coveredPixels(image, box, charge);
	paintRasterRect(image, box.x, box.y, box.width, box.height, color, box);
	return covered;
}

export function paintRoundedImage(
	image: RasterImage,
	source: RasterImage,
	box: RoundedBox,
	charge: (amount: number) => void,
): number {
	prepare(image, box, charge);
	validateRaster(source);
	const covered = coveredPixels(image, box, charge);
	if (covered === 0) return 0;
	if (source.pixels.buffer === image.pixels.buffer)
		charge(source.pixels.length);
	paintRasterImage(image, source, box.x, box.y, box.width, box.height, box);
	return covered;
}
