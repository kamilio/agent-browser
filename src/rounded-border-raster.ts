import type { BorderPaintExclusion } from "./border-raster.js";
import type { PaintStyle } from "./css-paint.js";
import { paintRasterRect, type RasterImage, type Rgba } from "./raster.js";
import {
	createRoundedBox,
	insetRoundedBox,
	type RoundedBox,
	roundedBoxSpan,
} from "./rounded-box.js";

const cornerArcSegments = 32;

type PerimeterSegment = {
	x: number;
	y: number;
	deltaX: number;
	deltaY: number;
	length: number;
	position: number;
};

function perimeter(box: RoundedBox): PerimeterSegment[] {
	const segments: PerimeterSegment[] = [];
	const radii = box.radii.map((radius) =>
		radius.horizontal > 0 && radius.vertical > 0
			? radius
			: { horizontal: 0, vertical: 0 },
	);
	let previousX = box.x + radii[0].horizontal;
	let previousY = box.y;
	let position = 0;
	const append = (horizontal: number, vertical: number) => {
		const deltaX = horizontal - previousX;
		const deltaY = vertical - previousY;
		const length = Math.hypot(deltaX, deltaY);
		if (length > 0)
			segments.push({
				x: previousX,
				y: previousY,
				deltaX,
				deltaY,
				length,
				position,
			});
		position += length;
		previousX = horizontal;
		previousY = vertical;
	};
	for (let side = 0; side < 4; side++) {
		const corner = (side + 1) % 4;
		const radius = radii[corner];
		const centerX =
			corner === 0 || corner === 3
				? box.x + radius.horizontal
				: box.x + box.width - radius.horizontal;
		const centerY =
			corner < 2
				? box.y + radius.vertical
				: box.y + box.height - radius.vertical;
		const startAngle = ((side - 1) * Math.PI) / 2;
		append(
			centerX + radius.horizontal * Math.cos(startAngle),
			centerY + radius.vertical * Math.sin(startAngle),
		);
		if (radius.horizontal === 0 || radius.vertical === 0) continue;
		for (let step = 1; step <= cornerArcSegments; step++) {
			const angle = startAngle + (step * Math.PI) / (2 * cornerArcSegments);
			append(
				centerX + radius.horizontal * Math.cos(angle),
				centerY + radius.vertical * Math.sin(angle),
			);
		}
	}
	return segments;
}

function classifySide(
	box: RoundedBox,
	widths: readonly number[],
	horizontal: number,
	vertical: number,
) {
	for (let corner = 0; corner < 4; corner++) {
		const radius = box.radii[corner];
		if (radius.horizontal === 0 || radius.vertical === 0) continue;
		const left = corner === 0 || corner === 3;
		const top = corner < 2;
		const centerX = left
			? box.x + radius.horizontal
			: box.x + box.width - radius.horizontal;
		const centerY = top
			? box.y + radius.vertical
			: box.y + box.height - radius.vertical;
		if (left ? horizontal >= centerX : horizontal <= centerX) continue;
		if (top ? vertical >= centerY : vertical <= centerY) continue;
		const firstSide = (corner + 3) % 4;
		const nextSide = corner;
		const totalWidth = widths[firstSide] + widths[nextSide];
		if (totalWidth === 0) break;
		if (widths[firstSide] === 0) return nextSide;
		if (widths[nextSide] === 0) return firstSide;
		const angle = Math.atan2(
			Math.abs(vertical - centerY) / radius.vertical,
			Math.abs(horizontal - centerX) / radius.horizontal,
		);
		const progress =
			corner % 2 === 0 ? angle / (Math.PI / 2) : 1 - angle / (Math.PI / 2);
		return progress < widths[firstSide] / totalWidth ? firstSide : nextSide;
	}
	const distances = [
		vertical - box.y,
		box.x + box.width - horizontal,
		box.y + box.height - vertical,
		horizontal - box.x,
	];
	let nearest = Number.POSITIVE_INFINITY;
	let side = -1;
	for (let candidate = 0; candidate < 4; candidate++) {
		if (widths[candidate] === 0) continue;
		const distance = distances[candidate] / widths[candidate];
		if (side === -1 || distance < nearest) {
			nearest = distance;
			side = candidate;
		}
	}
	return side;
}

function projectPerimeter(
	segments: readonly PerimeterSegment[],
	horizontal: number,
	vertical: number,
) {
	let distance = Number.POSITIVE_INFINITY;
	let position = 0;
	for (const segment of segments) {
		const fraction = Math.max(
			0,
			Math.min(
				1,
				((horizontal - segment.x) * segment.deltaX +
					(vertical - segment.y) * segment.deltaY) /
					(segment.length * segment.length),
			),
		);
		const deltaX = horizontal - segment.x - fraction * segment.deltaX;
		const deltaY = vertical - segment.y - fraction * segment.deltaY;
		const candidate = deltaX * deltaX + deltaY * deltaY;
		if (candidate >= distance) continue;
		distance = candidate;
		position = segment.position + fraction * segment.length;
	}
	return position;
}

export function paintRoundedBorders(
	image: RasterImage,
	rounded: RoundedBox,
	widths: readonly number[],
	paint: PaintStyle,
	charge: (work: number) => void,
	dashLengths: readonly number[],
	horizontalOffset: number,
	grooves: readonly boolean[],
	exclusion?: BorderPaintExclusion,
	paintBounds?: BorderPaintExclusion,
) {
	charge(1);
	const outer = createRoundedBox(
		rounded.x,
		rounded.y,
		rounded.width,
		rounded.height,
		rounded.radii,
	);
	const colors = [
		paint["border-top-color"] ?? paint.color,
		paint["border-right-color"] ?? paint.color,
		paint["border-bottom-color"] ?? paint.color,
		paint["border-left-color"] ?? paint.color,
	];
	if (!widths.some((width) => width > 0) || !colors.some((color) => color[3]))
		return 0;
	const left = Math.max(
		0,
		Math.ceil(Math.max(outer.x, paintBounds?.x ?? outer.x) - 0.5),
	);
	const top = Math.max(
		0,
		Math.ceil(Math.max(outer.y, paintBounds?.y ?? outer.y) - 0.5),
	);
	const right = Math.min(
		image.width,
		Math.ceil(
			Math.min(
				outer.x + outer.width,
				paintBounds ? paintBounds.x + paintBounds.width : outer.x + outer.width,
			) - 0.5,
		),
	);
	const bottom = Math.min(
		image.height,
		Math.ceil(
			Math.min(
				outer.y + outer.height,
				paintBounds
					? paintBounds.y + paintBounds.height
					: outer.y + outer.height,
			) - 0.5,
		),
	);
	if (left >= right || top >= bottom) return 0;
	const patterned = dashLengths.some((length) => length > 0);
	charge(
		(patterned ? (cornerArcSegments * 4 + 4) * 32 : 64) + (bottom - top) * 256,
	);
	const inset = (factor: number) =>
		insetRoundedBox(outer, {
			top: widths[0] * factor,
			right: widths[1] * factor,
			bottom: widths[2] * factor,
			left: widths[3] * factor,
		});
	const inner = inset(1);
	const middle = grooves.some(Boolean) ? inset(0.5) : undefined;
	const segments = patterned ? perimeter(outer) : [];
	const shades = colors.map((color) => ({
		dark: [
			Math.floor(color[0] / 2),
			Math.floor(color[1] / 2),
			Math.floor(color[2] / 2),
			color[3],
		] as Rgba,
		light: [
			Math.floor((color[0] + 255) / 2),
			Math.floor((color[1] + 255) / 2),
			Math.floor((color[2] + 255) / 2),
			color[3],
		] as Rgba,
	}));
	const visit = (
		consume: (row: number, start: number, end: number) => void,
	) => {
		for (let row = top; row < bottom; row++) {
			const outerSpan = roundedBoxSpan(outer, row + 0.5);
			if (!outerSpan) continue;
			const start = Math.max(left, Math.ceil(outerSpan.left - 0.5));
			const end = Math.min(right, Math.ceil(outerSpan.right - 0.5));
			const innerSpan = roundedBoxSpan(inner, row + 0.5);
			const emit = (spanStart: number, spanEnd: number) => {
				if (spanStart >= spanEnd) return;
				if (
					exclusion &&
					row + 0.5 >= exclusion.y &&
					row + 0.5 < exclusion.y + exclusion.height
				) {
					const before = Math.min(spanEnd, Math.ceil(exclusion.x - 0.5));
					const after = Math.max(
						spanStart,
						Math.ceil(exclusion.x + exclusion.width - 0.5),
					);
					if (spanStart < before) consume(row, spanStart, before);
					if (after < spanEnd) consume(row, after, spanEnd);
				} else consume(row, spanStart, spanEnd);
			};
			if (innerSpan) {
				emit(start, Math.min(end, Math.ceil(innerSpan.left - 0.5)));
				emit(Math.max(start, Math.ceil(innerSpan.right - 0.5)), end);
			} else emit(start, end);
		}
	};
	let covered = 0;
	visit((_row, start, end) => {
		covered += end - start;
	});
	if (covered === 0) return 0;
	charge(covered * (segments.length * 24 + 128));
	charge(covered * 4);
	let painted = 0;
	visit((row, start, end) => {
		const middleSpan = middle ? roundedBoxSpan(middle, row + 0.5) : undefined;
		for (let column = start; column < end; column++) {
			const side = classifySide(outer, widths, column + 0.5, row + 0.5);
			const dashLength = dashLengths[side];
			if (dashLength > 0) {
				const position = projectPerimeter(segments, column + 0.5, row + 0.5);
				const period = dashLength * 2;
				const remainder =
					((position % period) + (horizontalOffset % period)) % period;
				if ((remainder < 0 ? remainder + period : remainder) >= dashLength)
					continue;
			}
			const outerHalf =
				!middleSpan ||
				column + 0.5 < middleSpan.left ||
				column + 0.5 >= middleSpan.right;
			const color = grooves[side]
				? outerHalf === (side === 0 || side === 3)
					? shades[side].dark
					: shades[side].light
				: colors[side];
			if (color[3] === 0) continue;
			paintRasterRect(image, column, row, 1, 1, color);
			painted++;
		}
	});
	return painted;
}
