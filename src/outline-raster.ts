import { parseCssColor } from "./css-color.js";
import type { OutlineStyle } from "./css-outline.js";
import { layoutNumber } from "./layout-values.js";
import { paintRasterRect, type RasterImage, type Rgba } from "./raster.js";

export function paintOutline(
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	outline: OutlineStyle,
	charge: (work: number) => void,
) {
	const style = outline["outline-style"];
	const thickness =
		style === "auto" ? 2 : Number.parseFloat(outline["outline-width"]);
	if (style === "none" || thickness <= 0) return 0;
	const parsed = parseCssColor(outline["outline-color"]);
	const color: Rgba =
		!parsed || parsed === "currentcolor" ? [0, 90, 200, 255] : parsed;
	if (!color[3]) return 0;
	const offset = Number.parseFloat(outline["outline-offset"]);
	const outerWidth = Math.max(thickness * 2, width + (offset + thickness) * 2);
	const outerHeight = Math.max(
		thickness * 2,
		height + (offset + thickness) * 2,
	);
	const horizontal = originX + (width - outerWidth) / 2;
	const vertical = originY + (height - outerHeight) / 2;
	for (const value of [
		horizontal,
		vertical,
		outerWidth,
		outerHeight,
		thickness,
	])
		layoutNumber(value, true);
	const left = Math.max(0, Math.ceil(horizontal - 0.5));
	const top = Math.max(0, Math.ceil(vertical - 0.5));
	const right = Math.min(image.width, Math.ceil(horizontal + outerWidth - 0.5));
	const bottom = Math.min(
		image.height,
		Math.ceil(vertical + outerHeight - 0.5),
	);
	charge(Math.max(0, right - left) * Math.max(0, bottom - top) * 12);
	let pixels = 0;
	for (let row = top; row < bottom; row++) {
		for (let column = left; column < right; column++) {
			const fromTop = row + 0.5 - vertical;
			const fromBottom = vertical + outerHeight - row - 0.5;
			const fromLeft = column + 0.5 - horizontal;
			const fromRight = horizontal + outerWidth - column - 0.5;
			const nearest = Math.min(fromTop, fromBottom, fromLeft, fromRight);
			if (nearest >= thickness) continue;
			const along =
				nearest === fromTop || nearest === fromBottom ? fromLeft : fromTop;
			if (style === "dashed" && along % (thickness * 6) >= thickness * 3)
				continue;
			if (style === "dotted") {
				const across = (along % (thickness * 2)) - thickness / 2;
				if (across ** 2 + (nearest - thickness / 2) ** 2 > (thickness / 2) ** 2)
					continue;
			}
			if (style === "double" && thickness >= 3) {
				const stripe = Math.max(1, Math.round(thickness / 3));
				if (nearest >= stripe && nearest < thickness - stripe) continue;
			}
			paintRasterRect(image, column, row, 1, 1, color);
			pixels++;
		}
	}
	return pixels;
}
