import type { BoxStyle } from "./css-box.js";
import type { PaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import { paintRasterRect, type RasterImage, type Rgba } from "./raster.js";

export type BorderPaintExclusion = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

type BorderWidths = {
	borderTop: number;
	borderRight: number;
	borderBottom: number;
	borderLeft: number;
};

type BorderStyles = Readonly<
	Partial<
		Pick<
			BoxStyle,
			| "border-top-style"
			| "border-right-style"
			| "border-bottom-style"
			| "border-left-style"
		>
	>
>;

export function paintSolidBorders(
	image: RasterImage,
	x: number,
	y: number,
	width: number,
	height: number,
	borders: BorderWidths,
	paint: PaintStyle,
	charge: (work: number) => void,
) {
	return rasterBorders(image, x, y, width, height, borders, paint, charge);
}

export function paintBorders(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	borders: BorderWidths,
	paint: PaintStyle,
	styles: BorderStyles,
	charge: (work: number) => void,
	horizontalOffset = 0,
	exclusion?: BorderPaintExclusion,
) {
	const widths = [
		borders.borderTop,
		borders.borderRight,
		borders.borderBottom,
		borders.borderLeft,
	];
	const dashLengths = [0, 0, 0, 0];
	const grooves = [false, false, false, false];
	const properties = [
		"border-top-style",
		"border-right-style",
		"border-bottom-style",
		"border-left-style",
	] as const;
	for (const [index, property] of properties.entries()) {
		if (!(widths[index] > 0)) continue;
		const style = styles[property] ?? "solid";
		if (style === "none" || style === "hidden") widths[index] = 0;
		else if (style === "dashed") dashLengths[index] = 3 * widths[index];
		else if (style === "groove") grooves[index] = true;
		else if (style !== "solid")
			throw new AgentBrowserError(
				"unsupported",
				`Unsupported ${property}: ${style}`,
			);
	}
	const patterned = dashLengths.some((length) => length > 0);
	if (patterned && !Number.isFinite(horizontalOffset))
		throw new AgentBrowserError("invalid-input", "Invalid border dash offset");
	return rasterBorders(
		image,
		originX,
		originY,
		width,
		height,
		{
			borderTop: widths[0],
			borderRight: widths[1],
			borderBottom: widths[2],
			borderLeft: widths[3],
		},
		paint,
		charge,
		patterned ? dashLengths : undefined,
		horizontalOffset,
		grooves.some(Boolean) ? grooves : undefined,
		exclusion,
	);
}

function rasterBorders(
	image: RasterImage,
	x: number,
	y: number,
	width: number,
	height: number,
	borders: BorderWidths,
	paint: PaintStyle,
	charge: (work: number) => void,
	dashLengths?: readonly number[],
	horizontalOffset = 0,
	grooves?: readonly boolean[],
	exclusion?: BorderPaintExclusion,
) {
	if (
		exclusion &&
		(!Number.isFinite(exclusion.x) ||
			!Number.isFinite(exclusion.y) ||
			!Number.isFinite(exclusion.width) ||
			!Number.isFinite(exclusion.height) ||
			exclusion.width < 0 ||
			exclusion.height < 0 ||
			!Number.isFinite(exclusion.x + exclusion.width) ||
			!Number.isFinite(exclusion.y + exclusion.height))
	)
		throw new AgentBrowserError("invalid-input", "Invalid border exclusion");
	if (
		!(
			borders.borderTop > 0 ||
			borders.borderRight > 0 ||
			borders.borderBottom > 0 ||
			borders.borderLeft > 0
		)
	)
		return 0;
	const colors = [
		paint["border-top-color"] ?? paint.color,
		paint["border-right-color"] ?? paint.color,
		paint["border-bottom-color"] ?? paint.color,
		paint["border-left-color"] ?? paint.color,
	];
	if (!colors.some((color) => color[3] !== 0)) return 0;
	const shades = grooves
		? colors.map((color) => ({
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
			}))
		: undefined;
	const left = Math.max(0, Math.ceil(x - 0.5));
	const top = Math.max(0, Math.ceil(y - 0.5));
	const right = Math.min(image.width, Math.ceil(x + width - 0.5));
	const bottom = Math.min(image.height, Math.ceil(y + height - 0.5));
	const excludedLeft = exclusion
		? Math.max(left, Math.ceil(exclusion.x - 0.5))
		: 0;
	const excludedTop = exclusion
		? Math.max(top, Math.ceil(exclusion.y - 0.5))
		: 0;
	const excludedRight = exclusion
		? Math.min(right, Math.ceil(exclusion.x + exclusion.width - 0.5))
		: 0;
	const excludedBottom = exclusion
		? Math.min(bottom, Math.ceil(exclusion.y + exclusion.height - 0.5))
		: 0;
	const hasExclusion =
		excludedLeft < excludedRight && excludedTop < excludedBottom;
	charge(
		Math.max(0, right - left) *
			Math.max(0, bottom - top) *
			((dashLengths ? 16 : 10) + (grooves ? 4 : 0) + (hasExclusion ? 4 : 0)),
	);
	let pixels = 0;
	for (let row = top; row < bottom; row++) {
		const fromTop = borders.borderTop
			? (row + 0.5 - y) / borders.borderTop
			: Number.POSITIVE_INFINITY;
		const fromBottom = borders.borderBottom
			? (y + height - row - 0.5) / borders.borderBottom
			: Number.POSITIVE_INFINITY;
		for (let column = left; column < right; column++) {
			if (
				hasExclusion &&
				column >= excludedLeft &&
				column < excludedRight &&
				row >= excludedTop &&
				row < excludedBottom
			)
				continue;
			const fromRight = borders.borderRight
				? (x + width - column - 0.5) / borders.borderRight
				: Number.POSITIVE_INFINITY;
			const fromLeft = borders.borderLeft
				? (column + 0.5 - x) / borders.borderLeft
				: Number.POSITIVE_INFINITY;
			const nearest = Math.min(fromTop, fromRight, fromBottom, fromLeft);
			if (nearest >= 1) continue;
			const side =
				nearest === fromTop
					? 0
					: nearest === fromRight
						? 1
						: nearest === fromBottom
							? 2
							: 3;
			const recessed = side === 0 || side === 3;
			const color =
				grooves?.[side] && shades
					? nearest <= 0.5 === recessed
						? shades[side].dark
						: shades[side].light
					: colors[side];
			if (!color[3]) continue;
			const dashLength = dashLengths?.[side];
			if (dashLength) {
				const position =
					side === 0 || side === 2
						? column + 0.5 - x + horizontalOffset
						: row + 0.5 - y;
				const period = 2 * dashLength;
				const remainder = position % period;
				const phase = remainder < 0 ? remainder + period : remainder;
				if (!(phase < dashLength)) continue;
			}
			paintRasterRect(image, column, row, 1, 1, color);
			pixels++;
		}
	}
	return pixels;
}
