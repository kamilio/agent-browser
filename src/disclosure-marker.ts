import { AgentBrowserError } from "./errors.js";
import { markerTypes } from "./css-list.js";
import { bitmapFont, type BitmapFontWeight } from "./bitmap-font.js";
import { layoutNumber } from "./layout-values.js";
import { fontStyleSlope, type NativeFontStyle } from "./font-style.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
	rasterLimits,
	type Rgba,
} from "./raster.js";

export interface DisclosureMarker {
	readonly type: string;
	readonly ordinal?: number;
}

export function disclosureMarkerText(
	marker: DisclosureMarker,
): string | undefined {
	if (!marker || typeof marker !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid disclosure marker");
	const type = marker.type;
	if (typeof type !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid disclosure marker");
	if (!markerTypes.includes(type) || type === "none")
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported disclosure marker type",
		);
	if (type !== "decimal" && type !== "decimal-leading-zero") return;
	const ordinal = marker.ordinal;
	if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal))
		throw new AgentBrowserError(
			"invalid-input",
			"Numeric marker requires a safe integer ordinal",
		);
	const digits = Math.abs(ordinal).toString();
	return `${ordinal < 0 ? "-" : ""}${type === "decimal-leading-zero" ? digits.padStart(2, "0") : digits}. `;
}

function numericRasterDimensions(width: number, height: number) {
	const columns = Math.max(1, Math.ceil(width));
	const rows = Math.max(1, Math.ceil(height));
	if (
		columns > rasterLimits.maxDimension ||
		rows > rasterLimits.maxDimension ||
		columns * rows > rasterLimits.maxPixels
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Numeric marker raster limit exceeded",
		);
	return { columns, rows };
}

function markerTextExtent(
	text: string | undefined,
	fontSize: number,
): Readonly<{ width: number; height: number }> {
	const size = layoutNumber(fontSize);
	if (size > bitmapFont.maxFontSize)
		throw new AgentBrowserError(
			"resource-limit",
			"Marker font size limit exceeded",
		);
	const width =
		text === undefined
			? size
			: (text.length * size * bitmapFont.advance) / bitmapFont.unitsPerEm;
	const height = (size * bitmapFont.ascent) / bitmapFont.unitsPerEm;
	if (text !== undefined) numericRasterDimensions(width, height);
	return Object.freeze({ width, height });
}

export function disclosureMarkerExtent(
	marker: DisclosureMarker,
	fontSize: number,
): Readonly<{ width: number; height: number }> {
	return markerTextExtent(disclosureMarkerText(marker), fontSize);
}

export function rasterizeDisclosureMarker(
	marker: DisclosureMarker,
	width: number,
	height: number,
	color: Rgba,
	charge: (amount: number) => void,
	weight: BitmapFontWeight = 400,
	style: NativeFontStyle = "normal",
) {
	if (weight !== 400 && weight !== 700)
		throw new AgentBrowserError(
			"invalid-input",
			"Unregistered bitmap font weight",
		);
	const slope = fontStyleSlope(style);
	const text = disclosureMarkerText(marker);
	if (text !== undefined) {
		layoutNumber(width);
		layoutNumber(height);
		const fontSize = (height * bitmapFont.unitsPerEm) / bitmapFont.ascent;
		const extent = markerTextExtent(text, fontSize);
		if (width + 1e-9 < extent.width)
			throw new AgentBrowserError(
				"resource-limit",
				"Numeric marker raster would truncate its label",
			);
		const { columns, rows } = numericRasterDimensions(width, height);
		charge(
			columns * rows * 8 +
				text.length * bitmapFont.glyphWidth * bitmapFont.glyphHeight,
		);
		if (slope !== 0) {
			const scale = fontSize / bitmapFont.unitsPerEm;
			charge(
				text.length *
					Math.min(
						columns,
						Math.ceil(
							(bitmapFont.glyphWidth +
								Math.abs(slope) * bitmapFont.glyphHeight) *
								scale,
						) + 1,
					) *
					Math.min(rows, Math.ceil(bitmapFont.glyphHeight * scale) + 1) *
					4,
			);
		}
		const image = createRaster(columns, rows, [0, 0, 0, 0]);
		if (fontSize === 0) return image;
		const advance = (fontSize * bitmapFont.advance) / bitmapFont.unitsPerEm;
		for (let index = 0; index < text.length; index++)
			paintBitmapGlyph(
				image,
				text[index],
				index * advance,
				0,
				fontSize,
				color,
				weight,
				style,
			);
		return image;
	}
	const columns = Math.max(1, Math.ceil(width));
	const rows = Math.max(1, Math.ceil(height));
	if (columns > 512 || rows > 512 || !Number.isFinite(columns + rows))
		throw new AgentBrowserError(
			"resource-limit",
			"Disclosure marker raster limit exceeded",
		);
	charge(columns * rows * 8);
	const image = createRaster(columns, rows, [0, 0, 0, 0]);
	const size = Math.min(columns * 0.6, rows * 0.7);
	const top = (rows - size) / 2;
	for (let vertical = 0; vertical < rows; vertical++) {
		for (let horizontal = 0; horizontal < columns; horizontal++) {
			const across = (horizontal + 0.5) / size;
			const down = (vertical + 0.5 - top) / size;
			if (across < 0 || across > 1 || down < 0 || down > 1) continue;
			const radius = Math.hypot(across - 0.5, down - 0.5);
			const painted =
				marker.type === "disclosure-closed"
					? across <= 1 - Math.abs(down * 2 - 1)
					: marker.type === "disclosure-open"
						? down <= 1 - Math.abs(across * 2 - 1)
						: marker.type === "square"
							? true
							: marker.type === "circle"
								? radius >= 0.32 && radius <= 0.5
								: radius <= 0.5;
			if (painted) paintRasterRect(image, horizontal, vertical, 1, 1, color);
		}
	}
	return image;
}
