import { AgentBrowserError } from "./errors.js";
import { markerTypes } from "./css-list.js";
import { createRaster, paintRasterRect, type Rgba } from "./raster.js";

export interface DisclosureMarker {
	readonly type: string;
}

export function rasterizeDisclosureMarker(
	marker: DisclosureMarker,
	width: number,
	height: number,
	color: Rgba,
	charge: (amount: number) => void,
) {
	if (!markerTypes.includes(marker.type) || marker.type === "none")
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported disclosure marker type",
		);
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
