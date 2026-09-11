export const cssListProperties = Object.freeze([
	"list-style-type",
	"list-style-position",
] as const);
export type CssListProperty = (typeof cssListProperties)[number];
export type ListStyle = Readonly<Record<CssListProperty, string>>;
export const initialListStyle: ListStyle = Object.freeze({
	"list-style-type": "disc",
	"list-style-position": "outside",
});
export const markerTypes = Object.freeze([
	"none",
	"disc",
	"circle",
	"square",
	"disclosure-open",
	"disclosure-closed",
	"decimal",
	"decimal-leading-zero",
]);

export function isCssListProperty(
	property: string,
): property is CssListProperty {
	return (cssListProperties as readonly string[]).includes(property);
}

export function parseListValue(property: CssListProperty, value: string) {
	if (["initial", "inherit", "unset", "revert"].includes(value)) return value;
	return (property === "list-style-type"
		? markerTypes
		: ["inside", "outside"]
	).includes(value)
		? value
		: undefined;
}

export function computeListStyle(
	specified: Partial<ListStyle>,
	parent: ListStyle,
	defaults: Partial<ListStyle> = {},
): ListStyle {
	const result = { ...parent };
	for (const property of cssListProperties) {
		const value = specified[property];
		if (value === undefined || value === "revert")
			result[property] = defaults[property] ?? parent[property];
		else if (value === "initial") result[property] = initialListStyle[property];
		else if (value !== "inherit" && value !== "unset") result[property] = value;
	}
	return cssListProperties.every(
		(property) => result[property] === parent[property],
	)
		? parent
		: Object.freeze(result);
}
