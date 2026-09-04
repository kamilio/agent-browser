export const cssInteractionProperties = Object.freeze([
	"pointer-events",
] as const);
export type CssInteractionProperty = (typeof cssInteractionProperties)[number];
export type PointerEventsStyle = "auto" | "none";
export const interactionStyleCapabilities = Object.freeze({
	partial: true,
	properties: cssInteractionProperties,
	pointerEventsValues: Object.freeze(["auto", "none"]),
	inherited: true,
	focusUnaffected: true,
	svgHitTesting: false,
});

export function isCssInteractionProperty(
	name: string,
): name is CssInteractionProperty {
	return name === "pointer-events";
}

export function parseInteractionValue(source: string): string | undefined {
	const value = source.trim().toLowerCase();
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
