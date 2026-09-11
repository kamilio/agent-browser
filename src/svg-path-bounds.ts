import { AgentBrowserError } from "./errors.js";
import { svgAffineLimits, transformSvgPoint } from "./svg-affine.js";
import { svgFlattenLimits } from "./svg-path-flatten.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";
import type { SvgBounds, SvgMatrix } from "./svg-scene-types.js";

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function exhausted(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function scalar(value: number): number {
	if (typeof value !== "number" || !Number.isFinite(value))
		invalid("Invalid SVG bounds coordinate");
	if (Math.abs(value) > svgFlattenLimits.maxCoordinate)
		exhausted("SVG bounds coordinate limit exceeded");
	return value === 0 ? 0 : value;
}

function computed(value: number): number {
	if (!Number.isFinite(value)) exhausted("SVG bounds numerical overflow");
	return scalar(value);
}

function resolved(value: number, nonzero: boolean): number {
	if (!Number.isFinite(value) || (nonzero && value === 0))
		exhausted("SVG bounds precision limit exceeded");
	return value;
}

function point(value: SvgPoint): SvgPoint {
	if (!value || typeof value !== "object" || Array.isArray(value))
		invalid("Invalid SVG bounds point");
	return { x: scalar(value.x), y: scalar(value.y) };
}

function equal(first: SvgPoint, second: SvgPoint): boolean {
	return first.x === second.x && first.y === second.y;
}

function roots(values: readonly number[]): number[] {
	const differences = values
		.slice(1)
		.map((value, index) => value - values[index]);
	const scale = Math.max(...differences.map(Math.abs));
	if (scale === 0) return [];
	const normalized = differences.map((value) =>
		resolved(value / scale, value !== 0),
	);
	if (normalized.length === 2) {
		const denominator = normalized[0] - normalized[1];
		return denominator === 0 ? [] : [normalized[0] / denominator];
	}
	const quadratic = normalized[0] - 2 * normalized[1] + normalized[2];
	const linear = 2 * (normalized[1] - normalized[0]);
	const constant = normalized[0];
	if (quadratic === 0) return linear === 0 ? [] : [-constant / linear];
	const squared = resolved(linear * linear, linear !== 0);
	const product = resolved(4 * quadratic * constant, constant !== 0);
	const discriminant = squared - product;
	if (
		discriminant !== 0 &&
		Math.abs(discriminant) <= 8 * Number.EPSILON * (squared + Math.abs(product))
	)
		exhausted("SVG bounds derivative precision limit exceeded");
	if (discriminant < 0) return [];
	if (discriminant === 0) return [-linear / (2 * quadratic)];
	const numerator =
		-0.5 * (linear + (linear < 0 ? -1 : 1) * Math.sqrt(discriminant));
	return [numerator / quadratic, constant / numerator];
}

function evaluate(values: readonly number[], fraction: number): number {
	const pending = [...values];
	for (let length = pending.length - 1; length > 0; length--)
		for (let index = 0; index < length; index++)
			pending[index] =
				pending[index] * (1 - fraction) + pending[index + 1] * fraction;
	return computed(pending[0]);
}

export function svgPathBounds(
	path: readonly SvgPathSegment[],
	transform: SvgMatrix,
	charge: (amount: number) => void,
): SvgBounds | null {
	if (typeof charge !== "function") invalid("Invalid SVG work owner");
	if (!Array.isArray(path)) invalid("Invalid SVG path segments");
	const segmentCount = path.length;
	if (segmentCount > svgFlattenLimits.maxSegments)
		exhausted("SVG segment limit exceeded");
	charge(8);
	if (!Array.isArray(transform) || transform.length !== 6)
		invalid("Invalid SVG matrix");
	const matrix = Array.from({ length: 6 }, (_, index) => {
		const checked = scalar(transform[index]);
		if (Math.abs(checked) > svgAffineLimits.maxCoordinate)
			exhausted("SVG affine coordinate limit exceeded");
		return checked;
	}) as unknown as SvgMatrix;
	const transformed = (value: SvgPoint) => {
		for (const [coefficient, coordinate] of [
			[matrix[0], value.x],
			[matrix[1], value.x],
			[matrix[2], value.y],
			[matrix[3], value.y],
		])
			resolved(coefficient * coordinate, coefficient !== 0 && coordinate !== 0);
		return transformSvgPoint(matrix, value);
	};
	let current: SvgPoint | undefined;
	let initial: SvgPoint | undefined;
	let minimumX = Number.POSITIVE_INFINITY;
	let minimumY = Number.POSITIVE_INFINITY;
	let maximumX = Number.NEGATIVE_INFINITY;
	let maximumY = Number.NEGATIVE_INFINITY;
	const includeAxis = (axis: "x" | "y", value: number) => {
		const checked = computed(value);
		if (axis === "x") {
			minimumX = Math.min(minimumX, checked);
			maximumX = Math.max(maximumX, checked);
		} else {
			minimumY = Math.min(minimumY, checked);
			maximumY = Math.max(maximumY, checked);
		}
	};
	const include = (value: SvgPoint) => {
		includeAxis("x", value.x);
		includeAxis("y", value.y);
	};
	const arc = (
		segment: Extract<SvgPathSegment, { kind: "arc" }>,
		start: SvgPoint,
		end: SvgPoint,
	) => {
		let radiusX = Math.abs(scalar(segment.radiusX));
		let radiusY = Math.abs(scalar(segment.radiusY));
		const rotation = ((scalar(segment.rotation) % 360) * Math.PI) / 180;
		if (
			typeof segment.largeArc !== "boolean" ||
			typeof segment.sweep !== "boolean"
		)
			invalid("Invalid SVG arc flags");
		if (equal(start, end) || radiusX === 0 || radiusY === 0) return;
		const cosine = Math.cos(rotation);
		const sine = Math.sin(rotation);
		const halfX = resolved((start.x - end.x) / 2, start.x !== end.x);
		const halfY = resolved((start.y - end.y) / 2, start.y !== end.y);
		const localX = cosine * halfX + sine * halfY;
		const localY = -sine * halfX + cosine * halfY;
		const minimumRadius = Math.min(radiusX, radiusY);
		const scaledX = resolved(localX * (minimumRadius / radiusX), localX !== 0);
		const scaledY = resolved(localY * (minimumRadius / radiusY), localY !== 0);
		const extent = Math.hypot(scaledX, scaledY);
		if (extent > minimumRadius) {
			const adjust = (radius: number) => {
				const ratio = radius / minimumRadius;
				return computed(
					Number.isFinite(ratio)
						? ratio * extent
						: (radius * extent) / minimumRadius,
				);
			};
			radiusX = adjust(radiusX);
			radiusY = adjust(radiusY);
		}
		const unitX = resolved(localX / radiusX, localX !== 0);
		const unitY = resolved(localY / radiusY, localY !== 0);
		const norm = resolved(Math.hypot(unitX, unitY), true);
		if (norm > 1 + 8 * Number.EPSILON)
			exhausted("SVG arc normalization precision limit exceeded");
		const chord = Math.min(1, norm);
		const shortHalfAngle = Math.asin(chord);
		const centerFactor = Math.sqrt((1 - chord) * (1 + chord));
		const centerSign = segment.largeArc ? -1 : 1;
		const midX = (segment.sweep ? -1 : 1) * (unitY / norm);
		const midY = (segment.sweep ? 1 : -1) * (unitX / norm);
		const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
		const centerLocalX = -radiusX * midX * centerSign * centerFactor;
		const centerLocalY = -radiusY * midY * centerSign * centerFactor;
		transformed({
			x: computed(midpoint.x + cosine * centerLocalX - sine * centerLocalY),
			y: computed(midpoint.y + sine * centerLocalX + cosine * centerLocalY),
		});
		const transformedMidpoint = transformed(midpoint);
		const cosineBasis = {
			x: computed(radiusX * (matrix[0] * cosine + matrix[2] * sine)),
			y: computed(radiusX * (matrix[1] * cosine + matrix[3] * sine)),
		};
		const sineBasis = {
			x: computed(radiusY * (-matrix[0] * sine + matrix[2] * cosine)),
			y: computed(radiusY * (-matrix[1] * sine + matrix[3] * cosine)),
		};
		for (const axis of ["x", "y"] as const) {
			const across = cosineBasis[axis];
			const down = sineBasis[axis];
			const radius = Math.hypot(across, down);
			if (radius === 0) continue;
			const projection = across * midX + down * midY;
			const perpendicular = -across * midY + down * midX;
			for (const sign of [-1, 1]) {
				const candidateX = (sign * across) / radius;
				const candidateY = (sign * down) / radius;
				const angularDistance = Math.abs(
					Math.atan2(
						centerSign * (midX * candidateY - midY * candidateX),
						centerSign * (midX * candidateX + midY * candidateY),
					),
				);
				if (
					segment.largeArc
						? angularDistance < shortHalfAngle
						: angularDistance > shortHalfAngle
				)
					continue;
				const aligned = sign * centerSign * projection;
				const gap =
					aligned >= 0
						? Math.abs(perpendicular) *
							(Math.abs(perpendicular) / (radius + aligned))
						: radius - aligned;
				const sagitta = resolved(
					aligned * chord * (chord / (1 + centerFactor)),
					aligned !== 0,
				);
				includeAxis(axis, transformedMidpoint[axis] + sign * (gap + sagitta));
			}
		}
	};
	for (let index = 0; index < segmentCount; index++) {
		charge(1);
		const segment = path[index];
		if (!segment || typeof segment !== "object") invalid("Invalid SVG segment");
		charge(256);
		const end = point(segment.end);
		const transformedEnd = transformed(end);
		if (segment.kind === "move") {
			current = end;
			initial = end;
			continue;
		}
		const start = point(segment.start);
		if (!current || !initial || !equal(start, current))
			invalid("Disconnected SVG path segment");
		const transformedStart = transformed(start);
		include(transformedStart);
		include(transformedEnd);
		switch (segment.kind) {
			case "line":
				break;
			case "close":
				if (!equal(end, initial)) invalid("Invalid SVG subpath closure");
				break;
			case "quadratic":
			case "cubic": {
				const vertices =
					segment.kind === "quadratic"
						? [
								transformedStart,
								transformed(point(segment.control)),
								transformedEnd,
							]
						: [
								transformedStart,
								transformed(point(segment.control1)),
								transformed(point(segment.control2)),
								transformedEnd,
							];
				for (const axis of ["x", "y"] as const) {
					const values = vertices.map((vertex) => vertex[axis]);
					for (const fraction of roots(values))
						if (fraction > 0 && fraction < 1)
							includeAxis(axis, evaluate(values, fraction));
				}
				break;
			}
			case "arc":
				arc(segment, start, end);
				break;
			default:
				invalid("Invalid SVG segment kind");
		}
		current = end;
	}
	if (minimumX === Number.POSITIVE_INFINITY) return null;
	charge(4);
	return Object.freeze({
		x: minimumX,
		y: minimumY,
		width: maximumX - minimumX,
		height: maximumY - minimumY,
	});
}
