import { AgentBrowserError } from "./errors.js";
import {
	createRaster,
	paintRasterRect,
	rasterLimits,
	type Rgba,
} from "./raster.js";
import { svgFlattenLimits, type SvgContour } from "./svg-path-flatten.js";

export interface SvgFill {
	readonly contours: readonly SvgContour[];
	readonly color: Rgba;
	readonly fillRule: "nonzero" | "evenodd";
}

export interface SvgFillLimits {
	maxShapes: number;
	maxContours: number;
	maxPoints: number;
	maxEdges: number;
}

export const svgFillLimits: Readonly<SvgFillLimits> = Object.freeze({
	maxShapes: 4096,
	maxContours: 16_384,
	maxPoints: 65_536,
	maxEdges: 65_536,
});

interface Edge {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	minimumRow: number;
	maximumRow: number;
	direction: number;
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function exhausted(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

export function rasterizeSvgFills(
	fills: readonly SvgFill[],
	width: number,
	height: number,
	charge: (amount: number) => void,
	options: Partial<SvgFillLimits> = {},
) {
	if (!options || typeof options !== "object" || Array.isArray(options))
		invalid("Invalid SVG fill limits");
	const limits = { ...svgFillLimits, ...options };
	for (const name of Object.keys(svgFillLimits) as (keyof SvgFillLimits)[])
		if (
			!Number.isSafeInteger(limits[name]) ||
			limits[name] < 1 ||
			limits[name] > svgFillLimits[name]
		)
			invalid("Invalid SVG fill limit");
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 1 ||
		height < 1
	)
		invalid("Invalid SVG raster dimensions");
	if (
		width > rasterLimits.maxDimension ||
		height > rasterLimits.maxDimension ||
		width * height > rasterLimits.maxPixels
	)
		exhausted("SVG raster pixel limit exceeded");
	if (typeof charge !== "function") invalid("Invalid SVG work owner");
	if (!Array.isArray(fills)) invalid("Invalid SVG fills");
	const shapeCount = fills.length;
	if (shapeCount > limits.maxShapes) exhausted("SVG shape limit exceeded");
	let contourCount = 0;
	let pointCount = 0;
	let edgeCount = 0;
	const prepared: {
		edges: Edge[];
		color: Rgba;
		fillRule: SvgFill["fillRule"];
	}[] = [];
	for (let shapeIndex = 0; shapeIndex < shapeCount; shapeIndex++) {
		charge(1);
		const fill = fills[shapeIndex];
		if (!fill || typeof fill !== "object" || !Array.isArray(fill.contours))
			invalid("Invalid SVG fill");
		const fillRule = fill.fillRule;
		if (fillRule !== "nonzero" && fillRule !== "evenodd")
			invalid("Invalid SVG fill rule");
		const color = fill.color;
		if (!Array.isArray(color) || color.length !== 4)
			invalid("Invalid SVG fill color");
		const copiedColor = [color[0], color[1], color[2], color[3]] as const;
		if (
			!copiedColor.every(
				(channel) =>
					Number.isInteger(channel) && channel >= 0 && channel <= 255,
			)
		)
			invalid("Invalid SVG fill color");
		const count = fill.contours.length;
		contourCount += count;
		if (contourCount > limits.maxContours)
			exhausted("SVG contour limit exceeded");
		const edges: Edge[] = [];
		for (let contourIndex = 0; contourIndex < count; contourIndex++) {
			charge(1);
			const contour = fill.contours[contourIndex];
			if (
				!contour ||
				typeof contour !== "object" ||
				!Array.isArray(contour.points)
			)
				invalid("Invalid SVG fill contour");
			const length = contour.points.length;
			pointCount += length;
			if (pointCount > limits.maxPoints)
				exhausted("SVG fill point limit exceeded");
			const vertices: { x: number; y: number }[] = [];
			for (let index = 0; index < length; index++) {
				charge(1);
				const vertex = contour.points[index];
				if (!vertex || typeof vertex !== "object")
					invalid("Invalid SVG fill point");
				const across = vertex.x;
				const down = vertex.y;
				if (!Number.isFinite(across) || !Number.isFinite(down))
					invalid("Invalid SVG fill coordinate");
				if (
					Math.abs(across) > svgFlattenLimits.maxCoordinate ||
					Math.abs(down) > svgFlattenLimits.maxCoordinate
				)
					exhausted("SVG fill coordinate limit exceeded");
				vertices.push({ x: across, y: down });
			}
			if (length < 3) continue;
			for (let index = 0; index < length; index++) {
				charge(1);
				const start = vertices[index];
				const end = vertices[(index + 1) % length];
				if (start.y === end.y) continue;
				edgeCount++;
				if (edgeCount > limits.maxEdges) exhausted("SVG edge limit exceeded");
				const minimumRow = Math.max(
					0,
					Math.ceil(Math.min(start.y, end.y) - 0.5),
				);
				const maximumRow = Math.min(
					height,
					Math.ceil(Math.max(start.y, end.y) - 0.5),
				);
				if (minimumRow >= maximumRow) continue;
				const lower = start.y < end.y ? start : end;
				const upper = start.y < end.y ? end : start;
				edges.push({
					startX: lower.x,
					startY: lower.y,
					endX: upper.x,
					endY: upper.y,
					minimumRow,
					maximumRow,
					direction: start.y < end.y ? 1 : -1,
				});
			}
		}
		prepared.push({ edges, color: copiedColor, fillRule });
	}
	charge(width * height * 4);
	const image = createRaster(width, height, [0, 0, 0, 0]);
	for (const fill of prepared) {
		charge(1);
		if (!fill.edges.length || fill.color[3] === 0) continue;
		let minimumRow = height;
		let maximumRow = 0;
		for (const edge of fill.edges) {
			charge(1);
			minimumRow = Math.min(minimumRow, edge.minimumRow);
			maximumRow = Math.max(maximumRow, edge.maximumRow);
		}
		for (let row = minimumRow; row < maximumRow; row++) {
			charge(1);
			const crossings: { across: number; direction: number }[] = [];
			for (const edge of fill.edges) {
				charge(1);
				if (row < edge.minimumRow || row >= edge.maximumRow) continue;
				const fraction = (row + 0.5 - edge.startY) / (edge.endY - edge.startY);
				crossings.push({
					across: edge.startX + fraction * (edge.endX - edge.startX),
					direction: edge.direction,
				});
			}
			crossings.sort((first, second) => {
				charge(1);
				return first.across - second.across;
			});
			let winding = 0;
			let previous = 0;
			for (const crossing of crossings) {
				charge(1);
				const active =
					fill.fillRule === "nonzero"
						? winding !== 0
						: Math.abs(winding) % 2 === 1;
				if (active) {
					const left = Math.max(0, Math.min(width, Math.ceil(previous - 0.5)));
					const right = Math.max(
						0,
						Math.min(width, Math.ceil(crossing.across - 0.5)),
					);
					if (right > left) {
						charge((right - left) * 4);
						paintRasterRect(image, left, row, right - left, 1, fill.color);
					}
				}
				winding += crossing.direction;
				previous = crossing.across;
			}
		}
	}
	return image;
}
