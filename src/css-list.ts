export const cssListProperties = Object.freeze([
	"list-style-type",
	"list-style-position",
	"list-style-image",
] as const);
export type CssListProperty = (typeof cssListProperties)[number];
export type ListStyle = Readonly<Record<CssListProperty, string>>;
export const initialListStyle: ListStyle = Object.freeze({
	"list-style-type": "disc",
	"list-style-position": "outside",
	"list-style-image": "none",
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
const wide = new Set(["initial", "inherit", "unset", "revert"]);

export function isCssListProperty(
	property: string,
): property is CssListProperty {
	return (cssListProperties as readonly string[]).includes(property);
}

export function parseListValue(property: CssListProperty, value: string) {
	if (wide.has(value)) return value;
	return (property === "list-style-type"
		? markerTypes
		: property === "list-style-position"
			? ["inside", "outside"]
			: ["none"]
	).includes(value)
		? value
		: undefined;
}

export function parseListDeclarations(
	property: string,
	value: string,
): { property: CssListProperty; value: string }[] | undefined {
	if (isCssListProperty(property)) {
		const normalized = parseListValue(property, value);
		return normalized === undefined
			? undefined
			: [{ property, value: normalized }];
	}
	if (property !== "list-style") return;
	const normalized = value
		.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
		.toLowerCase();
	if (wide.has(normalized))
		return cssListProperties.map((property) => ({
			property,
			value: normalized,
		}));
	const components = normalized.split(/[\t\n\f\r ]+/);
	if (!normalized || components.length > 3) return;
	let type: string | undefined;
	let position: string | undefined;
	let noneCount = 0;
	for (const component of components) {
		if (component === "none") {
			noneCount++;
		} else if (component === "inside" || component === "outside") {
			if (position !== undefined) return;
			position = component;
		} else if (markerTypes.includes(component)) {
			if (type !== undefined) return;
			type = component;
		} else return;
	}
	if (noneCount > 2 || (noneCount > 1 && type !== undefined)) return;
	const style: ListStyle = {
		"list-style-type":
			type ?? (noneCount ? "none" : initialListStyle["list-style-type"]),
		"list-style-position": position ?? initialListStyle["list-style-position"],
		"list-style-image": initialListStyle["list-style-image"],
	};
	return cssListProperties.map((property) => ({
		property,
		value: style[property],
	}));
}

export function serializeListStyle(style: ListStyle): string {
	if (
		cssListProperties.some(
			(property) => parseListValue(property, style[property]) === undefined,
		)
	)
		return "";
	const type = style["list-style-type"];
	if (cssListProperties.some((property) => wide.has(style[property])))
		return cssListProperties.every((property) => style[property] === type)
			? type
			: "";
	return `${style["list-style-position"]} ${style["list-style-image"]} ${type}`;
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
