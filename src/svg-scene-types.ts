import type { Rgba } from "./raster.js";
import type { SvgLinearGradient } from "./svg-linear-gradient.js";
import type { SvgPathSegment } from "./svg-path-types.js";

export type SvgMatrix = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
];

export interface SvgBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface SvgSceneShape {
	readonly id: number;
	readonly ref: string;
	readonly ancestors: readonly string[];
	readonly path: readonly SvgPathSegment[];
	readonly transform: SvgMatrix;
	readonly fill: Rgba | SvgLinearGradient | null;
	readonly stroke?: SvgSceneStroke;
	readonly opacity?: number;
	readonly clips?: readonly SvgSceneClip[];
	readonly fillRule: "nonzero" | "evenodd";
	readonly visible: boolean;
	readonly pointerEvents: boolean;
}

export interface SvgSceneStroke {
	readonly paint: Rgba | SvgLinearGradient;
	readonly width: number;
	readonly widthPercentage?: true;
	readonly lineCap: "butt" | "round" | "square";
	readonly lineJoin: "miter" | "round" | "bevel";
	readonly miterLimit: number;
}

export interface SvgSceneClipShape {
	readonly path: readonly SvgPathSegment[];
	readonly transform: SvgMatrix;
	readonly fillRule: "nonzero" | "evenodd";
}

export interface SvgSceneClip {
	readonly shapes: readonly SvgSceneClipShape[];
}

export interface SvgScene {
	readonly rootRef: string;
	readonly viewBox: SvgBounds | null;
	readonly preserveAspectRatio: Readonly<{
		alignX: number;
		alignY: number;
		mode: "meet" | "slice" | "none";
	}>;
	readonly shapes: readonly SvgSceneShape[];
	readonly disabled: boolean;
	readonly sourceCodeUnits: number;
}
