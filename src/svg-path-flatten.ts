import { AgentBrowserError } from "./errors.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";

export interface SvgContour {
	readonly points: readonly SvgPoint[];
	readonly closed: boolean;
}

export interface SvgFlattenLimits {
	maxSegments: number;
	maxPoints: number;
	maxDepth: number;
	maxCoordinate: number;
}

export const svgFlattenLimits: Readonly<SvgFlattenLimits> = Object.freeze({
	maxSegments: 16_384,
	maxPoints: 65_536,
	maxDepth: 24,
	maxCoordinate: 1_000_000_000,
});

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function exhausted(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function midpoint(first: SvgPoint, second: SvgPoint): SvgPoint {
	return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distanceToSegment(point: SvgPoint, start: SvgPoint, end: SvgPoint) {
	const across = end.x - start.x;
	const down = end.y - start.y;
	const denominator = across * across + down * down;
	const fraction = denominator
		? Math.max(
				0,
				Math.min(
					1,
					((point.x - start.x) * across + (point.y - start.y) * down) /
						denominator,
				),
			)
		: 0;
	return Math.hypot(
		point.x - start.x - fraction * across,
		point.y - start.y - fraction * down,
	);
}

export function flattenSvgPath(
	segments: readonly SvgPathSegment[],
	charge: (amount: number) => void,
	tolerance = 0.25,
	options: Partial<SvgFlattenLimits> = {},
): readonly SvgContour[] {
	if (!options || typeof options !== "object" || Array.isArray(options))
		invalid("Invalid SVG flattening limits");
	const limits = { ...svgFlattenLimits, ...options };
	for (const name of Object.keys(
		svgFlattenLimits,
	) as (keyof SvgFlattenLimits)[])
		if (
			!Number.isSafeInteger(limits[name]) ||
			limits[name] < 1 ||
			limits[name] > svgFlattenLimits[name]
		)
			invalid("Invalid SVG flattening limit");
	if (!Number.isFinite(tolerance) || tolerance <= 0)
		invalid("Invalid SVG flattening tolerance");
	if (typeof charge !== "function") invalid("Invalid SVG work owner");
	if (!Array.isArray(segments)) invalid("Invalid SVG path segments");
	if (segments.length > limits.maxSegments)
		exhausted("SVG segment limit exceeded");
	let pointCount = 0;
	let current: SvgPoint | undefined;
	let initial: SvgPoint | undefined;
	let points: SvgPoint[] | undefined;
	const contours: SvgContour[] = [];
	const scalar = (value: number) => {
		if (typeof value !== "number" || !Number.isFinite(value))
			invalid("Invalid SVG coordinate");
		if (Math.abs(value) > limits.maxCoordinate)
			exhausted("SVG coordinate limit exceeded");
		return value;
	};
	const point = (value: SvgPoint): SvgPoint => {
		charge(1);
		if (!value || typeof value !== "object") invalid("Invalid SVG point");
		return Object.freeze({ x: scalar(value.x), y: scalar(value.y) });
	};
	const equal = (first: SvgPoint, second: SvgPoint) =>
		first.x === second.x && first.y === second.y;
	const append = (value: SvgPoint) => {
		if (pointCount >= limits.maxPoints) exhausted("SVG point limit exceeded");
		charge(1);
		const copied = point(value);
		if (!points) points = [];
		points.push(copied);
		pointCount++;
		current = copied;
	};
	const finish = (closed: boolean) => {
		if (!points) return;
		charge(1);
		contours.push(Object.freeze({ points: Object.freeze(points), closed }));
		points = undefined;
	};
	const curve = (
		vertices: readonly SvgPoint[],
		depth: number,
	): { vertices: readonly SvgPoint[]; depth: number } => ({ vertices, depth });
	const availableTolerance = (magnitude: number, operations: number) => {
		const precision = magnitude * Number.EPSILON * operations;
		if (precision >= tolerance) exhausted("SVG curve precision limit exceeded");
		return tolerance - precision;
	};
	const flattenCurve = (vertices: readonly SvgPoint[]) => {
		const accuracy = availableTolerance(
			Math.max(
				...vertices.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
			),
			8 * (limits.maxDepth + 1),
		);
		const pending = [curve(vertices, 0)];
		while (pending.length) {
			charge(12);
			const item = pending.pop()!;
			const vertices = item.vertices;
			const first = vertices[0];
			const last = vertices[vertices.length - 1];
			if (
				vertices
					.slice(1, -1)
					.every(
						(control) => distanceToSegment(control, first, last) <= accuracy,
					)
			) {
				append(last);
				continue;
			}
			if (item.depth >= limits.maxDepth)
				exhausted("SVG curve subdivision limit exceeded");
			const firstMidpoint = midpoint(vertices[0], vertices[1]);
			const secondMidpoint = midpoint(vertices[1], vertices[2]);
			const leftControl = midpoint(firstMidpoint, secondMidpoint);
			if (vertices.length === 3) {
				pending.push(
					curve([leftControl, secondMidpoint, last], item.depth + 1),
					curve([first, firstMidpoint, leftControl], item.depth + 1),
				);
			} else {
				const thirdMidpoint = midpoint(vertices[2], vertices[3]);
				const rightControl = midpoint(secondMidpoint, thirdMidpoint);
				const center = midpoint(leftControl, rightControl);
				pending.push(
					curve([center, rightControl, thirdMidpoint, last], item.depth + 1),
					curve([first, firstMidpoint, leftControl, center], item.depth + 1),
				);
			}
		}
	};
	const flattenArc = (segment: Extract<SvgPathSegment, { kind: "arc" }>) => {
		charge(40);
		let radiusX = Math.abs(scalar(segment.radiusX));
		let radiusY = Math.abs(scalar(segment.radiusY));
		const rotation = ((scalar(segment.rotation) % 360) * Math.PI) / 180;
		if (
			typeof segment.largeArc !== "boolean" ||
			typeof segment.sweep !== "boolean"
		)
			invalid("Invalid SVG arc flags");
		if (equal(segment.start, segment.end)) return;
		if (radiusX === 0 || radiusY === 0) {
			append(segment.end);
			return;
		}
		const cosine = Math.cos(rotation);
		const sine = Math.sin(rotation);
		const halfX = (segment.start.x - segment.end.x) / 2;
		const halfY = (segment.start.y - segment.end.y) / 2;
		const localX = cosine * halfX + sine * halfY;
		const localY = -sine * halfX + cosine * halfY;
		const minimumRadius = Math.min(radiusX, radiusY);
		const extent = Math.hypot(
			localX * (minimumRadius / radiusX),
			localY * (minimumRadius / radiusY),
		);
		if (extent > minimumRadius) {
			const adjusted = (radius: number) => {
				const ratio = radius / minimumRadius;
				return scalar(
					Number.isFinite(ratio)
						? ratio * extent
						: (radius * extent) / minimumRadius,
				);
			};
			radiusX = adjusted(radiusX);
			radiusY = adjusted(radiusY);
		}
		const unitX = localX / radiusX;
		const unitY = localY / radiusY;
		const norm = Math.hypot(unitX, unitY);
		if (norm === 0 || !Number.isFinite(norm))
			exhausted("SVG arc precision limit exceeded");
		const direction = segment.largeArc === segment.sweep ? -1 : 1;
		const factor = direction * Math.sqrt(Math.max(0, 1 - norm * norm));
		const centerLocalX = radiusX * (unitY / norm) * factor;
		const centerLocalY = -radiusY * (unitX / norm) * factor;
		const centerX = scalar(
			cosine * centerLocalX -
				sine * centerLocalY +
				(segment.start.x + segment.end.x) / 2,
		);
		const centerY = scalar(
			sine * centerLocalX +
				cosine * centerLocalY +
				(segment.start.y + segment.end.y) / 2,
		);
		const initialAngle = Math.atan2(
			(localY - centerLocalY) / radiusY,
			(localX - centerLocalX) / radiusX,
		);
		const shortAngle = 2 * Math.asin(Math.min(1, norm));
		const angle =
			(segment.largeArc ? 2 * Math.PI - shortAngle : shortAngle) *
			(segment.sweep ? 1 : -1);
		const accuracy = availableTolerance(
			Math.max(
				radiusX,
				radiusY,
				Math.abs(centerX),
				Math.abs(centerY),
				Math.abs(segment.start.x),
				Math.abs(segment.start.y),
				Math.abs(segment.end.x),
				Math.abs(segment.end.y),
			),
			256,
		);
		const step = Math.min(
			Math.PI / 2,
			4 *
				Math.asin(
					Math.sqrt(Math.min(1, accuracy / (2 * Math.max(radiusX, radiusY)))),
				),
		);
		const count = Math.max(1, Math.ceil(Math.abs(angle) / step));
		if (!Number.isSafeInteger(count) || count > limits.maxPoints - pointCount)
			exhausted("SVG point limit exceeded");
		charge(count * 8);
		for (let index = 1; index <= count; index++) {
			if (index === count) append(segment.end);
			else {
				const position = initialAngle + (angle * index) / count;
				const localAcross = radiusX * Math.cos(position);
				const localDown = radiusY * Math.sin(position);
				append({
					x: centerX + cosine * localAcross - sine * localDown,
					y: centerY + sine * localAcross + cosine * localDown,
				});
			}
		}
	};
	for (const segment of segments) {
		charge(1);
		if (!segment || typeof segment !== "object") invalid("Invalid SVG segment");
		const end = point(segment.end);
		if (segment.kind === "move") {
			finish(false);
			append(end);
			initial = current;
			continue;
		}
		const start = point(segment.start);
		if (!current || !initial || !equal(start, current))
			invalid("Disconnected SVG path segment");
		if (!points) append(start);
		switch (segment.kind) {
			case "line":
				append(end);
				break;
			case "close":
				if (!equal(end, initial)) invalid("Invalid SVG subpath closure");
				if (!equal(current, end)) append(end);
				finish(true);
				break;
			case "quadratic":
				flattenCurve([start, point(segment.control), end]);
				break;
			case "cubic":
				flattenCurve([
					start,
					point(segment.control1),
					point(segment.control2),
					end,
				]);
				break;
			case "arc":
				flattenArc({
					kind: "arc",
					start,
					end,
					radiusX: segment.radiusX,
					radiusY: segment.radiusY,
					rotation: segment.rotation,
					largeArc: segment.largeArc,
					sweep: segment.sweep,
				});
				break;
			default:
				invalid("Invalid SVG segment kind");
		}
	}
	finish(false);
	return Object.freeze(contours);
}
