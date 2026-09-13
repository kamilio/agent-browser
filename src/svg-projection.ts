import type { BoxStyle } from "./css-box.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import {
	multiplySvgMatrices,
	svgIdentity,
	transformSvgPoint,
} from "./svg-affine.js";
import {
	rasterizeSvgFills,
	svgFillLimits,
	type SvgFill,
} from "./svg-fill-raster.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { svgPathBounds } from "./svg-path-bounds.js";
import {
	flattenSvgPath,
	type SvgContour,
	svgFlattenLimits,
} from "./svg-path-flatten.js";
import type {
	SvgBounds,
	SvgMatrix,
	SvgScene,
	SvgSceneShape,
} from "./svg-scene-types.js";
import { strokeSvgContours } from "./svg-stroke-outline.js";
import { paintRasterImage, rasterLimits, type RasterImage } from "./raster.js";

export interface ProjectedSvgShape extends SvgSceneShape {
	readonly contours: readonly SvgContour[];
	readonly strokeContours: readonly SvgContour[];
	readonly bounds: SvgBounds | null;
	readonly paintBounds: SvgBounds | null;
}

export interface SvgProjection {
	readonly width: number;
	readonly height: number;
	readonly shapes: readonly ProjectedSvgShape[];
}

const projections = new WeakMap<SvgScene, SvgProjection>();

export function svgIntrinsicSize(scene: SvgScene, style: BoxStyle) {
	const absolute = (value: string) =>
		/^\d+(?:\.\d+)?px$/.test(value) && Number.parseFloat(value) > 0
			? Number.parseFloat(value)
			: null;
	const width = absolute(style.width);
	const height = absolute(style.height);
	const ratio =
		width !== null && height !== null
			? width / height
			: scene.viewBox && scene.viewBox.width > 0 && scene.viewBox.height > 0
				? scene.viewBox.width / scene.viewBox.height
				: null;
	const intrinsicWidth =
		width ??
		(ratio === null
			? 300
			: height !== null
				? height * ratio
				: Math.min(300, 150 * ratio));
	const intrinsicHeight =
		height ?? (ratio === null ? 150 : intrinsicWidth / ratio);
	layoutNumber(intrinsicWidth);
	layoutNumber(intrinsicHeight);
	return Object.freeze({
		width: intrinsicWidth,
		height: intrinsicHeight,
		ratio: ratio !== null,
	});
}

export function projectSvgScene(
	scene: SvgScene,
	width: number,
	height: number,
	charge: (amount: number) => void,
): SvgProjection {
	charge(1);
	layoutNumber(width);
	layoutNumber(height);
	const existing = projections.get(scene);
	if (existing?.width === width && existing.height === height) return existing;
	let viewport = svgIdentity;
	if (scene.viewBox && !scene.disabled && width && height) {
		const horizontal = width / scene.viewBox.width;
		const vertical = height / scene.viewBox.height;
		const scale =
			scene.preserveAspectRatio.mode === "slice"
				? Math.max(horizontal, vertical)
				: Math.min(horizontal, vertical);
		const scaleX =
			scene.preserveAspectRatio.mode === "none" ? horizontal : scale;
		const scaleY = scene.preserveAspectRatio.mode === "none" ? vertical : scale;
		viewport = Object.freeze([
			scaleX,
			0,
			0,
			scaleY,
			(width - scene.viewBox.width * scaleX) *
				scene.preserveAspectRatio.alignX -
				scene.viewBox.x * scaleX,
			(height - scene.viewBox.height * scaleY) *
				scene.preserveAspectRatio.alignY -
				scene.viewBox.y * scaleY,
		]) as SvgMatrix;
	}
	const shapes: ProjectedSvgShape[] = [];
	let points = 0;
	if (!scene.disabled && width && height)
		for (const shape of scene.shapes) {
			charge(1);
			let strokeWidth = shape.stroke?.width ?? 0;
			if (shape.stroke?.widthPercentage) {
				charge(8);
				strokeWidth =
					(strokeWidth / 100) *
					(Math.hypot(
						scene.viewBox?.width ?? width,
						scene.viewBox?.height ?? height,
					) /
						Math.SQRT2);
			}
			if (
				!Number.isFinite(strokeWidth) ||
				Math.abs(strokeWidth) > svgFlattenLimits.maxCoordinate
			)
				throw new AgentBrowserError(
					"resource-limit",
					"SVG stroke width magnitude limit exceeded",
				);
			const transform = multiplySvgMatrices(viewport, shape.transform, charge);
			const scale = Math.hypot(
				transform[0],
				transform[1],
				transform[2],
				transform[3],
			);
			if (points >= svgFlattenLimits.maxPoints)
				throw new AgentBrowserError(
					"resource-limit",
					"SVG projection point limit exceeded",
				);
			const tolerance = scale > 0 ? 0.01 / scale : 0.25;
			const localContours = flattenSvgPath(shape.path, charge, tolerance, {
				maxPoints: svgFlattenLimits.maxPoints - points,
			});
			const projectContours = (contours: readonly SvgContour[]) =>
				Object.freeze(
					contours.map((contour) => {
						charge(1);
						if (contour.points.length > svgFlattenLimits.maxPoints - points)
							throw new AgentBrowserError(
								"resource-limit",
								"SVG projection point limit exceeded",
							);
						const transformed = contour.points.map((point) => {
							charge(12);
							points++;
							return transformSvgPoint(transform, point);
						});
						return Object.freeze({
							closed: contour.closed,
							points: Object.freeze(transformed),
						});
					}),
				);
			const contours = projectContours(localContours);
			const strokeContours = projectContours(
				shape.stroke
					? strokeSvgContours(
							localContours,
							{
								width: strokeWidth,
								lineCap: shape.stroke.lineCap,
								lineJoin: shape.stroke.lineJoin,
								miterLimit: shape.stroke.miterLimit,
							},
							charge,
							tolerance,
						)
					: [],
			);
			shapes.push(
				Object.freeze({
					...shape,
					fill:
						shape.fill instanceof SvgLinearGradient
							? shape.fill.transformed(transform, charge)
							: shape.fill,
					...(shape.stroke
						? {
								stroke: Object.freeze({
									width: strokeWidth,
									lineCap: shape.stroke.lineCap,
									lineJoin: shape.stroke.lineJoin,
									miterLimit: shape.stroke.miterLimit,
									paint:
										shape.stroke.paint instanceof SvgLinearGradient
											? shape.stroke.paint.transformed(transform, charge)
											: shape.stroke.paint,
								}),
							}
						: {}),
					contours,
					strokeContours,
					bounds: svgPathBounds(shape.path, transform, charge),
					paintBounds: svgPaintBounds(
						shape.fill === null ? [] : contours,
						strokeContours,
						charge,
					),
				}),
			);
		}
	const result = Object.freeze({
		width,
		height,
		shapes: Object.freeze(shapes),
	});
	projections.set(scene, result);
	return result;
}

function svgPaintBounds(
	fill: readonly SvgContour[],
	stroke: readonly SvgContour[],
	charge: (amount: number) => void,
): SvgBounds | null {
	let left = Infinity;
	let right = -Infinity;
	let top = Infinity;
	let bottom = -Infinity;
	for (const contours of [fill, stroke])
		for (const contour of contours) {
			charge(1);
			if (contour.points.length < 3) continue;
			for (const point of contour.points) {
				charge(1);
				left = Math.min(left, point.x);
				right = Math.max(right, point.x);
				top = Math.min(top, point.y);
				bottom = Math.max(bottom, point.y);
			}
		}
	return left === Infinity
		? null
		: Object.freeze({
				x: left,
				y: top,
				width: right - left,
				height: bottom - top,
			});
}

function svgContoursContain(
	contours: readonly SvgContour[],
	fillRule: SvgFill["fillRule"],
	across: number,
	down: number,
	charge: (amount: number) => void,
) {
	let winding = 0;
	for (const contour of contours) {
		charge(1);
		if (contour.points.length < 3) continue;
		for (let index = 0; index < contour.points.length; index++) {
			charge(1);
			const start = contour.points[index];
			const end = contour.points[(index + 1) % contour.points.length];
			if (start.y === end.y) continue;
			const lower = start.y < end.y ? start : end;
			const upper = start.y < end.y ? end : start;
			if (down < lower.y || down >= upper.y) continue;
			const crossing =
				lower.x +
				((down - lower.y) / (upper.y - lower.y)) * (upper.x - lower.x);
			if (across < crossing) winding += start.y < end.y ? 1 : -1;
		}
	}
	return fillRule === "nonzero" ? winding !== 0 : Math.abs(winding) % 2 === 1;
}

export function svgShapeContains(
	shape: ProjectedSvgShape,
	across: number,
	down: number,
	charge: (amount: number) => void,
) {
	return (
		(shape.fill !== null &&
			svgContoursContain(
				shape.contours,
				shape.fillRule,
				across,
				down,
				charge,
			)) ||
		svgContoursContain(shape.strokeContours, "nonzero", across, down, charge)
	);
}

export function rasterizeSvgScene(
	scene: SvgScene,
	width: number,
	height: number,
	charge: (amount: number) => void,
) {
	const columns = Math.max(1, Math.ceil(layoutNumber(width)));
	const rows = Math.max(1, Math.ceil(layoutNumber(height)));
	if (
		columns > rasterLimits.maxDimension ||
		rows > rasterLimits.maxDimension ||
		columns * rows > rasterLimits.maxPixels
	)
		throw new AgentBrowserError(
			"resource-limit",
			"SVG viewport raster limit exceeded",
		);
	const projection = projectSvgScene(scene, width, height, charge);
	const layers: { fills: SvgFill[]; opacity: number }[] = [];
	let fillCount = 0;
	let contourCount = 0;
	let pointCount = 0;
	let edgeCount = 0;
	const prepareFill = (
		contours: readonly SvgContour[],
		color: SvgFill["color"],
		fillRule: SvgFill["fillRule"],
	): SvgFill => {
		charge(1);
		if (++fillCount > svgFillLimits.maxShapes)
			throw new AgentBrowserError("resource-limit", "SVG shape limit exceeded");
		return {
			color:
				color instanceof SvgLinearGradient
					? color.transformed(
							[columns / width, 0, 0, rows / height, 0, 0],
							charge,
						)
					: color,
			fillRule,
			contours: contours.map((contour) => {
				charge(1);
				if (++contourCount > svgFillLimits.maxContours)
					throw new AgentBrowserError(
						"resource-limit",
						"SVG contour limit exceeded",
					);
				pointCount += contour.points.length;
				if (pointCount > svgFillLimits.maxPoints)
					throw new AgentBrowserError(
						"resource-limit",
						"SVG fill point limit exceeded",
					);
				return {
					closed: contour.closed,
					points: contour.points.map((point, index) => {
						charge(1);
						if (
							contour.points.length >= 3 &&
							point.y !==
								contour.points[(index + 1) % contour.points.length].y &&
							++edgeCount > svgFillLimits.maxEdges
						)
							throw new AgentBrowserError(
								"resource-limit",
								"SVG edge limit exceeded",
							);
						return {
							x: (point.x * columns) / width,
							y: (point.y * rows) / height,
						};
					}),
				};
			}),
		};
	};
	for (const shape of projection.shapes) {
		charge(1);
		if (!shape.visible) continue;
		const opacity = shape.opacity ?? 1;
		if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
			throw new AgentBrowserError("invalid-input", "Invalid SVG shape opacity");
		const fills: SvgFill[] = [];
		if (shape.fill !== null)
			fills.push(prepareFill(shape.contours, shape.fill, shape.fillRule));
		if (shape.stroke && shape.strokeContours.length)
			fills.push(
				prepareFill(shape.strokeContours, shape.stroke.paint, "nonzero"),
			);
		if (!fills.length) continue;
		const previous = layers[layers.length - 1];
		if (opacity === 1 && previous?.opacity === 1) previous.fills.push(...fills);
		else layers.push({ fills, opacity });
	}
	let image: RasterImage | undefined;
	for (const layer of layers) {
		charge(1);
		const source = rasterizeSvgFills(layer.fills, columns, rows, charge);
		if (layer.opacity !== 1) {
			charge(columns * rows * 4);
			for (let offset = 3; offset < source.pixels.length; offset += 4) {
				source.pixels[offset] = Math.round(
					source.pixels[offset] * layer.opacity,
				);
				if (source.pixels[offset] === 0)
					source.pixels.fill(0, offset - 3, offset);
			}
		}
		if (image) {
			charge(columns * rows * 4);
			paintRasterImage(image, source, 0, 0, columns, rows);
		} else image = source;
	}
	return image ?? rasterizeSvgFills([], columns, rows, charge);
}
