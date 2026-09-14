import type { FlowStyle } from "./css-flow.js";

export type OverflowValue = "visible" | "hidden" | "clip" | "scroll" | "auto";

export interface OverflowStyle {
	readonly x: OverflowValue;
	readonly y: OverflowValue;
}

export interface OverflowPort {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;
	readonly overflow: Readonly<OverflowStyle>;
}

export interface LayoutOverflow {
	readonly ports: ReadonlyMap<number, Readonly<OverflowPort>>;
	readonly root: Readonly<{ width: number; height: number }>;
	readonly work: number;
}

export const visibleOverflow: Readonly<OverflowStyle> = Object.freeze({
	x: "visible",
	y: "visible",
});

export function usedOverflow(flow: FlowStyle): Readonly<OverflowStyle> {
	return Object.freeze({
		x: flow["overflow-x"] as OverflowValue,
		y: flow["overflow-y"] as OverflowValue,
	});
}

export function clipsOverflow(value: OverflowValue): boolean {
	return value !== "visible";
}

export function scrollsOverflow(value: OverflowValue): boolean {
	return value === "hidden" || value === "scroll" || value === "auto";
}

export function userScrollsOverflow(value: OverflowValue): boolean {
	return value === "scroll" || value === "auto";
}

export function establishesScrollport(
	overflow: Readonly<OverflowStyle>,
): boolean {
	return scrollsOverflow(overflow.x) || scrollsOverflow(overflow.y);
}

export function overflowBoxDisplay(display: string): boolean {
	return [
		"block",
		"block flow",
		"flow-root",
		"block flow-root",
		"list-item",
		"inline-block",
		"inline flow-root",
		"flex",
		"inline-flex",
		"block flex",
		"inline flex",
		"grid",
		"inline-grid",
		"block grid",
		"inline grid",
	].includes(display);
}
