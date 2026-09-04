import type { PaintStyle } from "./css-paint.js";
import { paintRasterRect, type RasterImage } from "./raster.js";

export function paintSolidBorders(
	image: RasterImage,
	x: number,
	y: number,
	width: number,
	height: number,
	borders: {
		borderTop: number;
		borderRight: number;
		borderBottom: number;
		borderLeft: number;
	},
	paint: PaintStyle,
	charge: (work: number) => void,
) {
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
	const left = Math.max(0, Math.ceil(x - 0.5));
	const top = Math.max(0, Math.ceil(y - 0.5));
	const right = Math.min(image.width, Math.ceil(x + width - 0.5));
	const bottom = Math.min(image.height, Math.ceil(y + height - 0.5));
	charge(Math.max(0, right - left) * Math.max(0, bottom - top) * 10);
	let pixels = 0;
	for (let row = top; row < bottom; row++) {
		const fromTop = borders.borderTop
			? (row + 0.5 - y) / borders.borderTop
			: Number.POSITIVE_INFINITY;
		const fromBottom = borders.borderBottom
			? (y + height - row - 0.5) / borders.borderBottom
			: Number.POSITIVE_INFINITY;
		for (let column = left; column < right; column++) {
			const fromRight = borders.borderRight
				? (x + width - column - 0.5) / borders.borderRight
				: Number.POSITIVE_INFINITY;
			const fromLeft = borders.borderLeft
				? (column + 0.5 - x) / borders.borderLeft
				: Number.POSITIVE_INFINITY;
			const nearest = Math.min(fromTop, fromRight, fromBottom, fromLeft);
			if (nearest >= 1) continue;
			const color =
				colors[
					nearest === fromTop
						? 0
						: nearest === fromRight
							? 1
							: nearest === fromBottom
								? 2
								: 3
				];
			if (!color[3]) continue;
			paintRasterRect(image, column, row, 1, 1, color);
			pixels++;
		}
	}
	return pixels;
}
