import { AgentBrowserError } from "../src/errors.js";
import { type RasterImage, validateRaster } from "../src/raster.js";

export interface ReferenceDifference {
	match: boolean;
	dimensionsMatch: boolean;
	comparedPixels: number;
	differentPixels: number;
	maximumChannelDifference: number;
	meanAbsoluteChannelDifference: number;
	bounds: { x: number; y: number; width: number; height: number } | null;
}

export function compareReferenceImages(
	first: RasterImage,
	second: RasterImage,
): ReferenceDifference {
	validateRaster(first);
	validateRaster(second);
	if (first.width !== second.width || first.height !== second.height)
		return {
			match: false,
			dimensionsMatch: false,
			comparedPixels: 0,
			differentPixels: 0,
			maximumChannelDifference: 0,
			meanAbsoluteChannelDifference: 0,
			bounds: null,
		};
	let differentPixels = 0;
	let maximumChannelDifference = 0;
	let absoluteDifference = 0;
	let left = first.width;
	let top = first.height;
	let right = -1;
	let bottom = -1;
	for (let offset = 0; offset < first.pixels.length; offset += 4) {
		let different = false;
		for (let channel = 0; channel < 4; channel++) {
			const difference = Math.abs(
				first.pixels[offset + channel] - second.pixels[offset + channel],
			);
			maximumChannelDifference = Math.max(maximumChannelDifference, difference);
			absoluteDifference += difference;
			different ||= difference !== 0;
		}
		if (different) {
			differentPixels++;
			const column = (offset / 4) % first.width;
			const row = Math.floor(offset / 4 / first.width);
			left = Math.min(left, column);
			right = Math.max(right, column);
			top = Math.min(top, row);
			bottom = Math.max(bottom, row);
		}
	}
	return {
		match: differentPixels === 0,
		dimensionsMatch: true,
		comparedPixels: first.width * first.height,
		differentPixels,
		maximumChannelDifference,
		meanAbsoluteChannelDifference: absoluteDifference / first.pixels.length,
		bounds:
			differentPixels === 0
				? null
				: {
						x: left,
						y: top,
						width: right - left + 1,
						height: bottom - top + 1,
					},
	};
}

export function referenceVerdict(
	difference: ReferenceDifference,
	relation: "match" | "mismatch",
): "pass" | "fail" {
	if (relation !== "match" && relation !== "mismatch")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid reference relationship",
		);
	return difference.dimensionsMatch &&
		difference.match === (relation === "match")
		? "pass"
		: "fail";
}
