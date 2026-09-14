export const cssFlowProperties = Object.freeze([
	"position",
	"float",
	"clear",
	"overflow-x",
	"overflow-y",
	"z-index",
] as const);
export type CssFlowProperty = (typeof cssFlowProperties)[number];
export type FlowStyle = Readonly<Record<CssFlowProperty, string>>;
export type FlowSpecifiedStyle = Readonly<
	Partial<Record<CssFlowProperty, string>>
>;
export const initialFlowStyle: FlowStyle = Object.freeze({
	position: "static",
	float: "none",
	clear: "none",
	"overflow-x": "visible",
	"overflow-y": "visible",
	"z-index": "auto",
});
export const flowStyleCapabilities = Object.freeze({
	partial: true,
	properties: cssFlowProperties,
	shorthands: Object.freeze(["overflow"]),
	rendering: "static-relative-absolute-fixed-sticky-bounded-overflow",
	overflowComputation: "2026-editor-draft-clip-preserved",
	positionedLayout: "partial-ltr-physical-and-static-insets",
	relativePositioning: "ltr-css2-physical-insets",
	stackingContexts: "root-relative-absolute-fixed-sticky-and-static-flex-items",
	zIndexMaximum: Number.MAX_SAFE_INTEGER,
	absolutePositioning: "block-padding-box-or-initial-containing-block",
	fixedPositioning: "viewport-root-scroll",
	staticPositionFallback: "hypothetical-flow-and-sole-flex-item",
	inlinePositionedContainingBlocks: false,
	stickyPositioning: "nearest-scrollport-ltr-physical-insets",
	floats: true,
	floatLayout: "physical-left-right-block-inline-replaced-flow-root",
	floatClearance: "floating-boxes-only",
	clearance: false,
	overflowClipping: true,
});
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const keywords: Record<CssFlowProperty, readonly string[]> = {
	position: ["static", "relative", "absolute", "fixed", "sticky"],
	float: ["none", "left", "right", "inline-start", "inline-end"],
	clear: ["none", "left", "right", "both", "inline-start", "inline-end"],
	"overflow-x": ["visible", "hidden", "clip", "scroll", "auto", "overlay"],
	"overflow-y": ["visible", "hidden", "clip", "scroll", "auto", "overlay"],
	"z-index": ["auto"],
};
export function isCssFlowProperty(name: string): name is CssFlowProperty {
	return Object.hasOwn(keywords, name);
}
export function parseFlowValue(
	name: CssFlowProperty,
	source: string,
): string | undefined {
	const value = source.toLowerCase().trim();
	if (wide.has(value)) return value;
	if (name === "z-index" && /^[+-]?\d+$/.test(value))
		return Number.isSafeInteger(Number(value))
			? String(Number(value))
			: undefined;
	if (!keywords[name].includes(value)) return;
	return value === "overlay" ? "auto" : value;
}
export function parseFlowDeclarations(
	name: string,
	source: string,
): { property: CssFlowProperty; value: string }[] | undefined {
	if (name === "overflow") {
		const values = source
			.toLowerCase()
			.trim()
			.split(/[\t\n\f\r ]+/);
		if (
			values.length > 2 ||
			(values.length > 1 && values.some((value) => wide.has(value)))
		)
			return;
		const horizontal = parseFlowValue("overflow-x", values[0]);
		const vertical = parseFlowValue("overflow-y", values[1] ?? values[0]);
		if (horizontal === undefined || vertical === undefined) return;
		return [
			{ property: "overflow-x", value: horizontal },
			{ property: "overflow-y", value: vertical },
		];
	}
	if (!isCssFlowProperty(name)) return;
	const value = parseFlowValue(name, source);
	return value === undefined ? undefined : [{ property: name, value }];
}
export function serializeOverflow(
	horizontal: string,
	vertical: string,
): string {
	if (!horizontal || !vertical) return "";
	if (horizontal === vertical) return horizontal;
	if (wide.has(horizontal) || wide.has(vertical)) return "";
	return `${horizontal} ${vertical}`;
}
export function computeFlowStyle(
	specified: FlowSpecifiedStyle,
	parent: FlowStyle,
): FlowStyle {
	const result = { ...initialFlowStyle };
	for (const name of cssFlowProperties) {
		const value = specified[name];
		if (value === "inherit") result[name] = parent[name];
		else if (value !== undefined && !wide.has(value)) result[name] = value;
	}
	const scrollable = (value: string) => value !== "visible" && value !== "clip";
	if (result["overflow-x"] === "visible" && scrollable(result["overflow-y"]))
		result["overflow-x"] = "auto";
	if (result["overflow-y"] === "visible" && scrollable(result["overflow-x"]))
		result["overflow-y"] = "auto";
	return Object.freeze(result);
}
