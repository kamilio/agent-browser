import { AgentBrowserError } from "./errors.js";
import { type SvgContour, svgFlattenLimits } from "./svg-path-flatten.js";
import type { SvgPoint } from "./svg-path-types.js";

export interface SvgStrokeGeometry {
	readonly width: number;
	readonly lineCap: "butt" | "round" | "square";
	readonly lineJoin: "miter" | "round" | "bevel";
	readonly miterLimit: number;
}

interface Segment {
	readonly start: SvgPoint;
	readonly end: SvgPoint;
	readonly direction: SvgPoint;
	readonly normal: SvgPoint;
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", `SVG stroke: ${message}`);
}

function exhausted(message: string): never {
	throw new AgentBrowserError("resource-limit", `SVG stroke: ${message}`);
}

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `SVG stroke: ${message}`);
}

export function strokeSvgContours(
	contours: readonly SvgContour[],
	options: SvgStrokeGeometry,
	charge: (amount: number) => void,
	tolerance = 0.01,
): readonly SvgContour[] {
	if (typeof charge !== "function") invalid("invalid work owner");
	if (!Number.isFinite(tolerance) || tolerance <= 0)
		invalid("invalid round tolerance");
	if (!options || typeof options !== "object" || Array.isArray(options))
		invalid("invalid geometry options");
	const { width, lineCap, lineJoin, miterLimit } = options;
	charge(1);
	let optionCount = 0;
	for (const name in options) {
		charge(1);
		optionCount++;
		if (
			optionCount > 4 ||
			!["width", "lineCap", "lineJoin", "miterLimit"].includes(name)
		)
			unsupported("unsupported geometry option");
	}
	if (
		typeof width !== "number" ||
		!Number.isFinite(width) ||
		width < 0 ||
		typeof miterLimit !== "number" ||
		!Number.isFinite(miterLimit) ||
		miterLimit < 0 ||
		!["butt", "round", "square"].includes(lineCap) ||
		!["miter", "round", "bevel"].includes(lineJoin)
	)
		invalid("invalid geometry option value");
	if (!Array.isArray(contours)) invalid("invalid contours");
	const contourCount = contours.length;
	if (contourCount > svgFlattenLimits.maxSegments)
		exhausted("contour limit exceeded");
	const coordinate = (value: number) => {
		if (typeof value !== "number" || !Number.isFinite(value))
			invalid("invalid coordinate");
		if (Math.abs(value) > svgFlattenLimits.maxCoordinate)
			exhausted("coordinate limit exceeded");
		return value === 0 ? 0 : value;
	};
	let inputPoints = 0;
	const input: SvgContour[] = [];
	for (let contourIndex = 0; contourIndex < contourCount; contourIndex++) {
		charge(1);
		const contour = contours[contourIndex];
		if (
			!contour ||
			typeof contour !== "object" ||
			!Array.isArray(contour.points) ||
			typeof contour.closed !== "boolean"
		)
			invalid("invalid contour");
		const count = contour.points.length;
		inputPoints += count;
		if (inputPoints > svgFlattenLimits.maxPoints)
			exhausted("input point limit exceeded");
		const points: SvgPoint[] = [];
		for (let pointIndex = 0; pointIndex < count; pointIndex++) {
			charge(1);
			const point = contour.points[pointIndex];
			if (!point || typeof point !== "object") invalid("invalid point");
			points.push({ x: coordinate(point.x), y: coordinate(point.y) });
		}
		input.push({ points, closed: contour.closed });
	}
	const output: SvgContour[] = [];
	if (width === 0) return Object.freeze(output);
	const radius = width / 2;
	if (radius === 0) exhausted("width precision limit exceeded");
	let outputPoints = 0;
	const reserve = (count: number) => {
		if (
			!Number.isSafeInteger(count) ||
			count < 3 ||
			count > svgFlattenLimits.maxPoints - outputPoints
		)
			exhausted("output point limit exceeded");
		if (output.length >= svgFlattenLimits.maxSegments)
			exhausted("output contour limit exceeded");
	};
	const emit = (vertices: readonly SvgPoint[]) => {
		reserve(vertices.length);
		charge(vertices.length * 4 + 1);
		const points = vertices.map((point) =>
			Object.freeze({ x: coordinate(point.x), y: coordinate(point.y) }),
		);
		const origin = points[0];
		let scale = 0;
		for (const point of points)
			scale = Math.max(
				scale,
				Math.abs(point.x - origin.x),
				Math.abs(point.y - origin.y),
			);
		if (scale === 0) exhausted("outline precision limit exceeded");
		let area = 0;
		for (let index = 1; index + 1 < points.length; index++) {
			const first = points[index];
			const second = points[index + 1];
			area +=
				((first.x - origin.x) / scale) * ((second.y - origin.y) / scale) -
				((first.y - origin.y) / scale) * ((second.x - origin.x) / scale);
		}
		if (!Number.isFinite(area) || area === 0)
			exhausted("outline precision limit exceeded");
		if (area < 0) points.reverse();
		outputPoints += points.length;
		output.push(Object.freeze({ closed: true, points: Object.freeze(points) }));
	};
	const offset = (center: SvgPoint, across: number, down: number): SvgPoint => {
		charge(4);
		const horizontal = center.x + across;
		const vertical = center.y + down;
		if (!Number.isFinite(horizontal) || !Number.isFinite(vertical))
			exhausted("coordinate limit exceeded");
		if (
			(horizontal === center.x &&
				vertical === center.y &&
				(across !== 0 || down !== 0)) ||
			Math.hypot(horizontal - center.x - across, vertical - center.y - down) >
				tolerance
		)
			exhausted("offset precision limit exceeded");
		return { x: coordinate(horizontal), y: coordinate(vertical) };
	};
	const radial = (center: SvgPoint, direction: SvgPoint, sign = 1) =>
		offset(center, direction.x * radius * sign, direction.y * radius * sign);
	const arcCount = (center: SvgPoint, angle: number, multiple = 1) => {
		charge(12);
		const magnitude = Math.max(Math.abs(center.x), Math.abs(center.y), radius);
		const precision = magnitude * Number.EPSILON * 64;
		if (precision >= tolerance) exhausted("round precision limit exceeded");
		const accuracy = tolerance - precision;
		const step = Math.min(
			Math.PI / 2,
			4 * Math.asin(Math.sqrt(Math.min(1, accuracy / (2 * radius)))),
		);
		const count = Math.max(
			multiple,
			Math.ceil(Math.abs(angle) / step / multiple) * multiple,
		);
		if (!Number.isSafeInteger(count) || count > svgFlattenLimits.maxPoints)
			exhausted("round point limit exceeded");
		return count;
	};
	const sector = (
		center: SvgPoint,
		start: SvgPoint,
		end: SvgPoint,
		angle: number,
		multiple = 1,
	) => {
		const count = arcCount(center, angle, multiple);
		reserve(count + 2);
		const points = [center, radial(center, start)];
		const initial = Math.atan2(start.y, start.x);
		for (let index = 1; index < count; index++) {
			charge(4);
			const position = initial + (angle * index) / count;
			points.push(
				offset(
					center,
					radius * Math.cos(position),
					radius * Math.sin(position),
				),
			);
		}
		points.push(radial(center, end));
		emit(points);
	};
	const disk = (center: SvgPoint) => {
		const count = arcCount(center, 2 * Math.PI, 4);
		reserve(count);
		const points: SvgPoint[] = [];
		for (let index = 0; index < count; index++) {
			charge(4);
			const angle = (2 * Math.PI * index) / count;
			points.push(
				offset(center, radius * Math.cos(angle), radius * Math.sin(angle)),
			);
		}
		emit(points);
	};
	const cap = (center: SvgPoint, direction: SvgPoint, normal: SvgPoint) => {
		if (lineCap === "butt") return;
		if (lineCap === "round") {
			sector(center, normal, { x: -normal.x, y: -normal.y }, -Math.PI, 2);
			return;
		}
		emit([
			radial(center, normal),
			radial(center, normal, -1),
			offset(
				center,
				(direction.x - normal.x) * radius,
				(direction.y - normal.y) * radius,
			),
			offset(
				center,
				(direction.x + normal.x) * radius,
				(direction.y + normal.y) * radius,
			),
		]);
	};
	const join = (incoming: Segment, outgoing: Segment) => {
		charge(16);
		const center = incoming.end;
		const cross =
			incoming.direction.x * outgoing.direction.y -
			incoming.direction.y * outgoing.direction.x;
		const dot =
			incoming.direction.x * outgoing.direction.x +
			incoming.direction.y * outgoing.direction.y;
		if (cross === 0 && dot >= 0) return;
		if (cross === 0 && lineJoin !== "round") return;
		const sign = cross < 0 ? 1 : -1;
		const first = {
			x: incoming.normal.x * sign,
			y: incoming.normal.y * sign,
		};
		const second = {
			x: outgoing.normal.x * sign,
			y: outgoing.normal.y * sign,
		};
		if (lineJoin === "round") {
			sector(
				center,
				first,
				second,
				cross === 0 ? Math.PI : Math.atan2(cross, dot),
			);
			return;
		}
		const start = radial(center, first);
		const end = radial(center, second);
		if (lineJoin === "miter") {
			const across = first.x + second.x;
			const down = first.y + second.y;
			const length = Math.hypot(across, down);
			const ratio = 2 / length;
			if (ratio <= miterLimit) {
				if (length <= 64 * Number.EPSILON)
					exhausted("miter precision limit exceeded");
				const distance = radius * ratio;
				const tip = offset(
					center,
					(across / length) * distance,
					(down / length) * distance,
				);
				emit([center, start, tip, end]);
				return;
			}
		}
		emit([center, start, end]);
	};
	for (const contour of input) {
		charge(1);
		if (
			contour.points.length === 0 ||
			(contour.points.length === 1 && !contour.closed)
		)
			continue;
		const segments: Segment[] = [];
		const segment = (start: SvgPoint, end: SvgPoint) => {
			charge(12);
			const across = end.x - start.x;
			const down = end.y - start.y;
			if (across === 0 && down === 0) return;
			const length = Math.hypot(across, down);
			const direction = { x: across / length, y: down / length };
			if (
				!Number.isFinite(length) ||
				length === 0 ||
				(across !== 0 && direction.x === 0) ||
				(down !== 0 && direction.y === 0)
			)
				exhausted("direction precision limit exceeded");
			const normal = { x: -direction.y, y: direction.x };
			segments.push({ start, end, direction, normal });
			emit([
				radial(start, normal),
				radial(start, normal, -1),
				radial(end, normal, -1),
				radial(end, normal),
			]);
		};
		for (let index = 1; index < contour.points.length; index++)
			segment(contour.points[index - 1], contour.points[index]);
		if (contour.closed)
			segment(contour.points[contour.points.length - 1], contour.points[0]);
		if (segments.length === 0) {
			const center = contour.points[0];
			if (lineCap === "round") disk(center);
			else if (lineCap === "square")
				emit([
					offset(center, -radius, -radius),
					offset(center, radius, -radius),
					offset(center, radius, radius),
					offset(center, -radius, radius),
				]);
			continue;
		}
		for (let index = 1; index < segments.length; index++)
			join(segments[index - 1], segments[index]);
		const first = segments[0];
		const last = segments[segments.length - 1];
		if (contour.closed) join(last, first);
		else {
			cap(
				first.start,
				{ x: -first.direction.x, y: -first.direction.y },
				{ x: -first.normal.x, y: -first.normal.y },
			);
			cap(last.end, last.direction, last.normal);
		}
	}
	return Object.freeze(output);
}
