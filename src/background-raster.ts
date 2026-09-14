import type { BackgroundLayer } from "./css-background.js";
import { AgentBrowserError } from "./errors.js";
import { type DecodedImage, imageIntrinsicSize } from "./image-decoder.js";
import { layoutNumber, layoutValueLimits } from "./layout-values.js";
import {
	type RasterImage,
	paintRasterImage,
	rasterLimits,
	validateRaster,
	withRasterClips,
} from "./raster.js";
import {
	type RoundedBox,
	createRoundedBox,
	insetRoundedBox,
	validateRoundedBox,
} from "./rounded-box.js";

export interface BackgroundGeometry {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly borderTop: number;
	readonly borderRight: number;
	readonly borderBottom: number;
	readonly borderLeft: number;
	readonly paddingTop: number;
	readonly paddingRight: number;
	readonly paddingBottom: number;
	readonly paddingLeft: number;
}

export function backgroundAreas(
	geometry: BackgroundGeometry,
	layer: BackgroundLayer,
	outer?: RoundedBox,
): { positioning: RoundedBox; clip: RoundedBox } {
	layoutNumber(geometry.x, true);
	layoutNumber(geometry.y, true);
	for (const property of [
		"width",
		"height",
		"borderTop",
		"borderRight",
		"borderBottom",
		"borderLeft",
		"paddingTop",
		"paddingRight",
		"paddingBottom",
		"paddingLeft",
	] as const)
		layoutNumber(geometry[property]);
	layoutNumber(geometry.x + geometry.width, true);
	layoutNumber(geometry.y + geometry.height, true);
	const border =
		outer ??
		createRoundedBox(geometry.x, geometry.y, geometry.width, geometry.height, [
			{ horizontal: 0, vertical: 0 },
			{ horizontal: 0, vertical: 0 },
			{ horizontal: 0, vertical: 0 },
			{ horizontal: 0, vertical: 0 },
		]);
	validateRoundedBox(border);
	const padding = insetRoundedBox(border, {
		top: geometry.borderTop,
		right: geometry.borderRight,
		bottom: geometry.borderBottom,
		left: geometry.borderLeft,
	});
	const content = insetRoundedBox(padding, {
		top: geometry.paddingTop,
		right: geometry.paddingRight,
		bottom: geometry.paddingBottom,
		left: geometry.paddingLeft,
	});
	const area = (value: string): RoundedBox => {
		if (value === "border-box") return border;
		if (value === "padding-box") return padding;
		if (value === "content-box") return content;
		throw new AgentBrowserError("unsupported", "Unsupported background box");
	};
	return {
		positioning: area(layer["background-origin"]),
		clip: area(layer["background-clip"]),
	};
}

function tokens(value: string, charge: (amount?: number) => void): string[] {
	if (typeof value !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid background value");
	if (value.length > layoutValueLimits.maxLengthCodeUnits * 2 + 1)
		throw new AgentBrowserError(
			"resource-limit",
			"Background value length limit exceeded",
		);
	charge(1 + value.length);
	const result = value.trim().split(/[\t\n\f\r ]+/);
	if (result.length > 2 || result[0] === "")
		throw new AgentBrowserError("unsupported", "Unsupported background value");
	return result;
}

function boundedLength(value: number, signed = false): number {
	if (!Number.isFinite(value))
		throw new AgentBrowserError(
			"resource-limit",
			"Background numeric overflow",
		);
	return layoutNumber(value, signed);
}

function length(value: string, available: number, signed = false): number {
	const match = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|%)$/.exec(value);
	if (!match)
		throw new AgentBrowserError(
			"unsupported",
			"Background requires pixel or percentage lengths",
		);
	const number = Number(match[1]);
	if (!Number.isFinite(number))
		throw new AgentBrowserError(
			"resource-limit",
			"Background numeric overflow",
		);
	if (!signed && number < 0)
		throw new AgentBrowserError("invalid-input", "Negative background size");
	return boundedLength(
		match[2] === "%" ? (number / 100) * available : number,
		signed,
	);
}

function renderedSize(
	values: string[],
	intrinsic: Readonly<{ width: number; height: number }>,
	area: RoundedBox,
): { width: number; height: number } {
	if (
		values.length === 1 &&
		(values[0] === "contain" || values[0] === "cover")
	) {
		if (intrinsic.width === 0 || intrinsic.height === 0)
			return { width: 0, height: 0 };
		const scale = (values[0] === "contain" ? Math.min : Math.max)(
			area.width / intrinsic.width,
			area.height / intrinsic.height,
		);
		return {
			width: boundedLength(intrinsic.width * scale),
			height: boundedLength(intrinsic.height * scale),
		};
	}
	const horizontal = values[0];
	const vertical = values[1] ?? "auto";
	let width =
		horizontal === "auto" ? undefined : length(horizontal, area.width);
	let height = vertical === "auto" ? undefined : length(vertical, area.height);
	if (intrinsic.width === 0 || intrinsic.height === 0)
		return { width: 0, height: 0 };
	if (width === undefined && height === undefined) return intrinsic;
	if (width === undefined)
		width = boundedLength(
			((height as number) / intrinsic.height) * intrinsic.width,
		);
	if (height === undefined)
		height = boundedLength((width / intrinsic.width) * intrinsic.height);
	return { width, height };
}

function positionValues(values: string[]): readonly [string, string] {
	let horizontal = values[0];
	let vertical = values[1] ?? "center";
	if (horizontal === "top" || horizontal === "bottom") {
		horizontal = values[1] ?? "center";
		vertical = values[0];
	} else if (vertical === "left" || vertical === "right") {
		vertical = horizontal;
		horizontal = values[1];
	}
	const keyword = (value: string, start: string, end: string) =>
		value === start
			? "0%"
			: value === "center"
				? "50%"
				: value === end
					? "100%"
					: value;
	return [
		keyword(horizontal, "left", "right"),
		keyword(vertical, "top", "bottom"),
	];
}

function repeatValues(values: string[]): readonly [boolean, boolean] {
	if (values.length === 1 && values[0] === "repeat-x") return [true, false];
	if (values.length === 1 && values[0] === "repeat-y") return [false, true];
	if (values.some((value) => value !== "repeat" && value !== "no-repeat"))
		throw new AgentBrowserError("unsupported", "Unsupported background repeat");
	return [values[0] === "repeat", (values[1] ?? values[0]) === "repeat"];
}

function tileRange(
	origin: number,
	size: number,
	start: number,
	end: number,
	repeat: boolean,
): { first: number; count: number } {
	if (start >= end) return { first: 0, count: 0 };
	if (!repeat)
		return {
			first: 0,
			count: origin <= end - 0.5 && origin + size > start + 0.5 ? 1 : 0,
		};
	const first = Math.floor((start + 0.5 - origin) / size);
	const last = Math.floor((end - 0.5 - origin) / size);
	const count = last - first + 1;
	if (![first, last, count].every(Number.isSafeInteger) || count < 0)
		throw new AgentBrowserError(
			"resource-limit",
			"Background tile range overflow",
		);
	return { first, count };
}

export function paintBackgroundImage(
	image: RasterImage,
	source: Readonly<DecodedImage>,
	layer: BackgroundLayer,
	geometry: BackgroundGeometry,
	charge: (amount?: number) => void,
	outer?: RoundedBox,
	paintingClip?: RoundedBox,
	canvas = false,
): number {
	if (typeof charge !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid background work owner",
		);
	charge(32);
	validateRaster(image);
	const areas = backgroundAreas(geometry, layer, outer);
	if (paintingClip !== undefined) validateRoundedBox(paintingClip);
	if (layer["background-attachment"] !== "scroll")
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported background attachment",
		);
	const intrinsic = imageIntrinsicSize(source);
	layoutNumber(intrinsic.width);
	layoutNumber(intrinsic.height);
	const size = renderedSize(
		tokens(layer["background-size"], charge),
		intrinsic,
		areas.positioning,
	);
	const [horizontal, vertical] = positionValues(
		tokens(layer["background-position"], charge),
	);
	const originX = boundedLength(
		areas.positioning.x +
			length(horizontal, areas.positioning.width - size.width, true),
		true,
	);
	const originY = boundedLength(
		areas.positioning.y +
			length(vertical, areas.positioning.height - size.height, true),
		true,
	);
	boundedLength(originX + size.width, true);
	boundedLength(originY + size.height, true);
	const [repeatX, repeatY] = repeatValues(
		tokens(layer["background-repeat"], charge),
	);
	if (intrinsic.width === 0 || intrinsic.height === 0) return 0;
	validateRaster(source.image);
	if (size.width === 0 || size.height === 0) return 0;
	const clips =
		canvas && paintingClip
			? [paintingClip]
			: paintingClip
				? [areas.clip, paintingClip]
				: [areas.clip];
	let left = 0;
	let right = image.width;
	let top = 0;
	let bottom = image.height;
	for (const clip of clips) {
		left = Math.max(left, Math.ceil(clip.x - 0.5));
		right = Math.min(right, Math.ceil(clip.x + clip.width - 0.5));
		top = Math.max(top, Math.ceil(clip.y - 0.5));
		bottom = Math.min(bottom, Math.ceil(clip.y + clip.height - 0.5));
	}
	if (left >= right || top >= bottom) return 0;
	const columns = tileRange(originX, size.width, left, right, repeatX);
	const rows = tileRange(originY, size.height, top, bottom, repeatY);
	const count = columns.count * rows.count;
	if (!Number.isSafeInteger(count) || count > rasterLimits.maxPixels)
		throw new AgentBrowserError(
			"resource-limit",
			"Background tile limit exceeded",
		);
	if (count === 0) return 0;
	charge(count);
	const target = withRasterClips(image, clips, charge);
	let painted = 0;
	for (let row = 0; row < rows.count; row++) {
		const originTop = boundedLength(
			originY + (rows.first + row) * size.height,
			true,
		);
		const endY = boundedLength(originTop + size.height, true);
		const scanTop = Math.max(0, Math.ceil(originTop - 0.5));
		const scanBottom = Math.min(image.height, Math.ceil(endY - 0.5));
		if (Math.max(top, scanTop) >= Math.min(bottom, scanBottom)) continue;
		for (let column = 0; column < columns.count; column++) {
			const originLeft = boundedLength(
				originX + (columns.first + column) * size.width,
				true,
			);
			const endX = boundedLength(originLeft + size.width, true);
			const scanLeft = Math.max(0, Math.ceil(originLeft - 0.5));
			const scanRight = Math.min(image.width, Math.ceil(endX - 0.5));
			if (Math.max(left, scanLeft) >= Math.min(right, scanRight)) continue;
			charge((scanBottom - scanTop) * (2 + (scanRight - scanLeft) * 4));
			if (source.image.pixels.buffer === image.pixels.buffer)
				charge(source.image.pixels.length);
			paintRasterImage(
				target,
				source.image,
				originLeft,
				originTop,
				size.width,
				size.height,
			);
			painted++;
		}
	}
	return painted;
}
