import { AgentBrowserError } from "./errors.js";
import { type RasterImage, validateRaster } from "./raster.js";
import {
	rasterizeSvgFills,
	type SvgFill,
	svgFillLimits,
} from "./svg-fill-raster.js";
import { type SvgContour, svgFlattenLimits } from "./svg-path-flatten.js";
import type { SvgPoint } from "./svg-path-types.js";

export interface SvgClipFill {
	readonly contours: readonly SvgContour[];
	readonly fillRule: "nonzero" | "evenodd";
}

export type SvgClipRegion = readonly SvgClipFill[];

const white = Object.freeze([255, 255, 255, 255] as const);
const maxClipRegions = 64;

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", `SVG clip: ${message}`);
}

function exhausted(message: string): never {
	throw new AgentBrowserError("resource-limit", `SVG clip: ${message}`);
}

export function clipSvgRaster(
	image: RasterImage,
	regions: readonly SvgClipRegion[],
	charge: (amount: number) => void,
): void {
	if (typeof charge !== "function") invalid("invalid work owner");
	charge(1);
	validateRaster(image);
	const { width, height, pixels } = image;
	if (!Array.isArray(regions)) invalid("invalid regions");
	const regionCount = regions.length;
	if (regionCount > maxClipRegions) exhausted("region limit exceeded");
	let shapeCount = 0;
	let contourCount = 0;
	let pointCount = 0;
	let edgeCount = 0;
	const prepared: SvgFill[][] = [];
	for (let regionIndex = 0; regionIndex < regionCount; regionIndex++) {
		charge(1);
		const region = regions[regionIndex];
		if (!Array.isArray(region)) invalid("invalid region");
		const fillCount = region.length;
		shapeCount += fillCount;
		if (shapeCount > svgFillLimits.maxShapes)
			exhausted("aggregate shape limit exceeded");
		const fills: SvgFill[] = [];
		for (let fillIndex = 0; fillIndex < fillCount; fillIndex++) {
			charge(1);
			const fill = region[fillIndex];
			if (!fill || typeof fill !== "object" || Array.isArray(fill))
				invalid("invalid fill");
			let propertyCount = 0;
			for (const name in fill) {
				charge(1);
				propertyCount++;
				if (propertyCount > 2 || !["contours", "fillRule"].includes(name))
					invalid("clip fills accept geometry only");
			}
			const fillRule = fill.fillRule;
			if (fillRule !== "nonzero" && fillRule !== "evenodd")
				invalid("invalid fill rule");
			if (!Array.isArray(fill.contours)) invalid("invalid fill contours");
			const count = fill.contours.length;
			contourCount += count;
			if (contourCount > svgFillLimits.maxContours)
				exhausted("aggregate contour limit exceeded");
			const contours: SvgContour[] = [];
			for (let contourIndex = 0; contourIndex < count; contourIndex++) {
				charge(1);
				const contour = fill.contours[contourIndex];
				if (
					!contour ||
					typeof contour !== "object" ||
					Array.isArray(contour) ||
					!Array.isArray(contour.points) ||
					typeof contour.closed !== "boolean"
				)
					invalid("invalid contour");
				const closed = contour.closed;
				const length = contour.points.length;
				pointCount += length;
				if (pointCount > svgFillLimits.maxPoints)
					exhausted("aggregate point limit exceeded");
				const points: SvgPoint[] = [];
				for (let pointIndex = 0; pointIndex < length; pointIndex++) {
					charge(1);
					const point = contour.points[pointIndex];
					if (!point || typeof point !== "object" || Array.isArray(point))
						invalid("invalid point");
					const across = point.x;
					const down = point.y;
					if (
						typeof across !== "number" ||
						typeof down !== "number" ||
						!Number.isFinite(across) ||
						!Number.isFinite(down)
					)
						invalid("invalid coordinate");
					if (
						Math.abs(across) > svgFlattenLimits.maxCoordinate ||
						Math.abs(down) > svgFlattenLimits.maxCoordinate
					)
						exhausted("coordinate limit exceeded");
					points.push({ x: across, y: down });
				}
				if (length >= 3)
					for (let pointIndex = 0; pointIndex < length; pointIndex++) {
						charge(1);
						if (points[pointIndex].y !== points[(pointIndex + 1) % length].y) {
							edgeCount++;
							if (edgeCount > svgFillLimits.maxEdges)
								exhausted("aggregate edge limit exceeded");
						}
					}
				contours.push({ points, closed });
			}
			fills.push({ contours, fillRule, color: white });
		}
		prepared.push(fills);
	}
	const apply = (fills: readonly SvgFill[]) => {
		charge(pixels.length);
		const mask = rasterizeSvgFills(fills, width, height, charge);
		for (let offset = 0; offset < pixels.length; offset += 4)
			if (mask.pixels[offset + 3] === 0 || pixels[offset + 3] === 0) {
				pixels[offset] = 0;
				pixels[offset + 1] = 0;
				pixels[offset + 2] = 0;
				pixels[offset + 3] = 0;
			}
	};
	for (const fills of prepared) {
		if (fills.length === 0) {
			charge(pixels.length);
			pixels.fill(0);
			return;
		}
		apply(fills);
	}
}
