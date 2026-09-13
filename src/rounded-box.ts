import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export interface CornerRadius {
	readonly horizontal: number;
	readonly vertical: number;
}

export type CornerRadii = readonly [
	CornerRadius,
	CornerRadius,
	CornerRadius,
	CornerRadius,
];

export interface RoundedBox {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly radii: CornerRadii;
}

export interface BoxInsets {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export function validateRoundedBox(box: RoundedBox): void {
	if (!box || typeof box !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid rounded box");
	layoutNumber(box.x, true);
	layoutNumber(box.y, true);
	layoutNumber(box.width);
	layoutNumber(box.height);
	layoutNumber(box.x + box.width, true);
	layoutNumber(box.y + box.height, true);
	if (!Array.isArray(box.radii) || box.radii.length !== 4)
		throw new AgentBrowserError("invalid-input", "Invalid corner radii");
	for (const radius of box.radii) {
		if (!radius || typeof radius !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid corner radius");
		layoutNumber(radius.horizontal);
		layoutNumber(radius.vertical);
	}
}

function frozenRadii(radii: CornerRadii, factor = 1): CornerRadii {
	return Object.freeze(
		radii.map((radius) =>
			Object.freeze({
				horizontal: radius.horizontal * factor || 0,
				vertical: radius.vertical * factor || 0,
			}),
		),
	) as unknown as CornerRadii;
}

export function createRoundedBox(
	originX: number,
	originY: number,
	width: number,
	height: number,
	radii: CornerRadii,
): Readonly<RoundedBox> {
	const box = { x: originX, y: originY, width, height, radii };
	validateRoundedBox(box);
	const [topLeft, topRight, bottomRight, bottomLeft] = radii;
	const sides = [
		[width, topLeft.horizontal + topRight.horizontal],
		[height, topRight.vertical + bottomRight.vertical],
		[width, bottomLeft.horizontal + bottomRight.horizontal],
		[height, topLeft.vertical + bottomLeft.vertical],
	];
	let factor = 1;
	for (const [side, sum] of sides)
		if (sum > side) factor = Math.min(factor, side / sum);
	return Object.freeze({
		x: originX || 0,
		y: originY || 0,
		width: width || 0,
		height: height || 0,
		radii: frozenRadii(radii, factor),
	});
}

export function insetRoundedBox(
	box: RoundedBox,
	insets: BoxInsets,
): Readonly<RoundedBox> {
	validateRoundedBox(box);
	if (!insets || typeof insets !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid rounded box insets");
	for (const side of ["top", "right", "bottom", "left"] as const)
		layoutNumber(insets[side]);
	const inset = (
		radius: CornerRadius,
		horizontal: number,
		vertical: number,
	): CornerRadius => ({
		horizontal: Math.max(0, radius.horizontal - horizontal),
		vertical: Math.max(0, radius.vertical - vertical),
	});
	return Object.freeze({
		x: box.x + Math.min(box.width, insets.left),
		y: box.y + Math.min(box.height, insets.top),
		width: Math.max(0, box.width - insets.left - insets.right),
		height: Math.max(0, box.height - insets.top - insets.bottom),
		radii: frozenRadii([
			inset(box.radii[0], insets.left, insets.top),
			inset(box.radii[1], insets.right, insets.top),
			inset(box.radii[2], insets.right, insets.bottom),
			inset(box.radii[3], insets.left, insets.bottom),
		]),
	});
}

export function roundedBoxSpan(
	box: RoundedBox,
	vertical: number,
): Readonly<{ left: number; right: number }> | undefined {
	validateRoundedBox(box);
	layoutNumber(vertical, true);
	if (
		box.width === 0 ||
		box.height === 0 ||
		vertical < box.y ||
		vertical >= box.y + box.height
	)
		return;
	let left = box.x;
	let right = box.x + box.width;
	for (const [index, radius] of box.radii.entries()) {
		if (radius.horizontal === 0 || radius.vertical === 0) continue;
		const top = index < 2;
		const centerY = top
			? box.y + radius.vertical
			: box.y + box.height - radius.vertical;
		if (top ? vertical >= centerY : vertical <= centerY) continue;
		const distance = (vertical - centerY) / radius.vertical;
		const extent =
			radius.horizontal * Math.sqrt(Math.max(0, 1 - distance * distance));
		if (index === 0 || index === 3)
			left = Math.max(left, box.x + radius.horizontal - extent);
		else
			right = Math.min(right, box.x + box.width - radius.horizontal + extent);
	}
	if (left >= right) return;
	return Object.freeze({ left, right });
}

export function roundedBoxContains(
	box: RoundedBox,
	horizontal: number,
	vertical: number,
): boolean {
	layoutNumber(horizontal, true);
	const span = roundedBoxSpan(box, vertical);
	return (
		span !== undefined && horizontal >= span.left && horizontal < span.right
	);
}
