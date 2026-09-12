import type { BoxStyle } from "./css-box.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import {
	multiplySvgMatrices,
	svgIdentity,
	transformSvgPoint,
} from "./svg-affine.js";
import { rasterizeSvgFills } from "./svg-fill-raster.js";
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
import { rasterLimits } from "./raster.js";

export interface ProjectedSvgShape extends SvgSceneShape {
	readonly contours: readonly SvgContour[];
	readonly bounds: SvgBounds | null;
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
			const contours = flattenSvgPath(
				shape.path,
				charge,
				scale > 0 ? 0.01 / scale : 0.25,
				{ maxPoints: svgFlattenLimits.maxPoints - points },
			).map((contour) => {
				const transformed = contour.points.map((point) => {
					charge(12);
					points++;
					return transformSvgPoint(transform, point);
				});
				return Object.freeze({
					closed: contour.closed,
					points: Object.freeze(transformed),
				});
			});
			shapes.push(
				Object.freeze({
					...shape,
					fill:
						shape.fill instanceof SvgLinearGradient
							? shape.fill.transformed(transform, charge)
							: shape.fill,
					contours: Object.freeze(contours),
					bounds: svgPathBounds(shape.path, transform, charge),
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

export function svgShapeContains(
	shape: ProjectedSvgShape,
	across: number,
	down: number,
	charge: (amount: number) => void,
) {
	let winding = 0;
	for (const contour of shape.contours) {
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
	return shape.fillRule === "nonzero"
		? winding !== 0
		: Math.abs(winding) % 2 === 1;
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
	const fills = projection.shapes
		.filter((shape) => shape.visible && shape.fill !== null)
		.map((shape) => ({
			color:
				shape.fill instanceof SvgLinearGradient
					? shape.fill.transformed(
							[columns / width, 0, 0, rows / height, 0, 0],
							charge,
						)
					: shape.fill!,
			fillRule: shape.fillRule,
			contours: shape.contours.map((contour) => ({
				closed: contour.closed,
				points: contour.points.map((point) => {
					charge(1);
					return {
						x: (point.x * columns) / width,
						y: (point.y * rows) / height,
					};
				}),
			})),
		}));
	return rasterizeSvgFills(fills, columns, rows, charge);
}
