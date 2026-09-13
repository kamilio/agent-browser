export const cssInteractionProperties = Object.freeze([
	"pointer-events",
	"cursor",
] as const);
export type CssInteractionProperty = (typeof cssInteractionProperties)[number];
export type PointerEventsStyle = "auto" | "none";
export const cssCursorKeywords = Object.freeze([
	"auto",
	"default",
	"none",
	"context-menu",
	"help",
	"pointer",
	"progress",
	"wait",
	"cell",
	"crosshair",
	"text",
	"vertical-text",
	"alias",
	"copy",
	"move",
	"no-drop",
	"not-allowed",
	"grab",
	"grabbing",
	"e-resize",
	"n-resize",
	"ne-resize",
	"nw-resize",
	"s-resize",
	"se-resize",
	"sw-resize",
	"w-resize",
	"ew-resize",
	"ns-resize",
	"nesw-resize",
	"nwse-resize",
	"col-resize",
	"row-resize",
	"all-scroll",
	"zoom-in",
	"zoom-out",
] as const);
export type CursorStyle = (typeof cssCursorKeywords)[number];
const cursorKeywords: ReadonlySet<string> = new Set(cssCursorKeywords);
export const interactionStyleCapabilities = Object.freeze({
	partial: true,
	properties: cssInteractionProperties,
	pointerEventsValues: Object.freeze(["auto", "none"]),
	cursorValues: cssCursorKeywords,
	cursorImages: false,
	systemCursor: false,
	inherited: true,
	focusUnaffected: true,
	svgHitTesting: false,
});

export function isCssInteractionProperty(
	name: string,
): name is CssInteractionProperty {
	return name === "pointer-events" || name === "cursor";
}

export function parseInteractionValue(
	source: string,
	property: CssInteractionProperty = "pointer-events",
): string | undefined {
	const value = source.trim().toLowerCase();
	if (property === "cursor")
		return cursorKeywords.has(value) ||
			["inherit", "initial", "unset", "revert"].includes(value)
			? value
			: undefined;
	return ["auto", "none", "inherit", "initial", "unset", "revert"].includes(
		value,
	)
		? value
		: undefined;
}

export function computePointerEvents(
	value: string | undefined,
	parent: PointerEventsStyle,
): PointerEventsStyle {
	if (value === "initial" || value === "auto") return "auto";
	if (value === "none") return "none";
	return parent;
}

export function computeCursor(
	value: string | undefined,
	parent: CursorStyle,
): CursorStyle {
	if (value === "initial") return "auto";
	return value !== undefined && cursorKeywords.has(value)
		? (value as CursorStyle)
		: parent;
}
