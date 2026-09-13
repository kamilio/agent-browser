import { layoutNumber } from "./layout-values.js";

export function inlineEdgeExtents(
	above: number,
	below: number,
	topHeight: number,
	bottomHeight: number,
): { above: number; below: number; height: number } {
	const baselineAbove = layoutNumber(above, true);
	const baselineBelow = layoutNumber(below, true);
	const top = layoutNumber(topHeight);
	const bottom = layoutNumber(bottomHeight);
	const resolvedAbove = Math.max(baselineAbove, bottom - baselineBelow);
	const resolvedBelow = Math.max(baselineBelow, top - resolvedAbove);
	return {
		above: resolvedAbove,
		below: resolvedBelow,
		height: layoutNumber(resolvedAbove + resolvedBelow),
	};
}
