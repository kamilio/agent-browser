import type { GridStyle } from "./css-grid.js";

export interface GridTrack {
	readonly minimum: string;
	readonly maximum: string;
	readonly fitContent?: string;
}

export interface GridPlacementInput {
	readonly id: number;
	readonly style: GridStyle;
	readonly order?: number;
}

export interface GridPlacedItem {
	readonly id: number;
	readonly rowStart: number;
	readonly rowEnd: number;
	readonly columnStart: number;
	readonly columnEnd: number;
}

export interface GridPlacedAxis {
	readonly startLine: number;
	readonly explicitTracks: number;
	readonly tracks: readonly Readonly<GridTrack>[];
	readonly lineNames: readonly (readonly string[])[];
}

export interface GridPlacement {
	readonly columns: Readonly<GridPlacedAxis>;
	readonly rows: Readonly<GridPlacedAxis>;
	readonly items: readonly Readonly<GridPlacedItem>[];
	readonly metrics: Readonly<{ work: number }>;
}

export interface GridTrackContribution {
	readonly start: number;
	readonly end: number;
	readonly minimum: number;
	readonly minContent: number;
	readonly maxContent: number;
}

export interface GridTrackSizingOptions {
	readonly availableSpace: number | null;
	readonly gap: number;
	readonly mode?: "normal" | "min-content" | "max-content";
	readonly stretchAuto?: boolean;
	readonly maxWork?: number;
}

export interface GridTrackSizing {
	readonly sizes: readonly number[];
	readonly offsets: readonly number[];
	readonly extent: number;
	readonly metrics: Readonly<{ work: number }>;
}
