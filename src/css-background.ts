import { normalizeCssColor } from "./css-color.js";

export const initialBackgroundValues = Object.freeze({
	"background-image": "none",
	"background-position": "0% 0%",
	"background-size": "auto",
	"background-repeat": "repeat",
	"background-attachment": "scroll",
	"background-origin": "padding-box",
	"background-clip": "border-box",
	"background-color": "transparent",
});
export type CssBackgroundProperty = keyof typeof initialBackgroundValues;
export const cssBackgroundProperties = Object.freeze(
	Object.keys(initialBackgroundValues) as CssBackgroundProperty[],
);
type NeutralBackgroundProperty = Exclude<
	CssBackgroundProperty,
	"background-color"
>;
const wide = new Set(["initial", "inherit", "unset", "revert"]);

export function isNeutralBackgroundProperty(
	name: string,
): name is NeutralBackgroundProperty {
	return (
		name !== "background-color" && Object.hasOwn(initialBackgroundValues, name)
	);
}

export function parseBackgroundComponent(
	name: NeutralBackgroundProperty,
	value: string,
): string | undefined {
	if (wide.has(value)) return value;
	if (name === "background-size" && value === "auto auto") return "auto";
	return value === initialBackgroundValues[name] ? value : undefined;
}

export function parseBackgroundShorthand(
	source: string,
): { property: CssBackgroundProperty; value: string }[] | undefined {
	const value = source
		.trim()
		.toLowerCase()
		.replace(/[\t\n\f\r ]+/g, " ");
	if (wide.has(value))
		return cssBackgroundProperties.map((property) => ({ property, value }));
	const color =
		value === "none"
			? "transparent"
			: (normalizeCssColor(value) ??
				normalizeCssColor(value.replace(/^none | none$/g, "")));
	if (color === undefined || /^none .* none$/.test(value)) return undefined;
	return cssBackgroundProperties.map((property) => ({
		property,
		value:
			property === "background-color"
				? color
				: initialBackgroundValues[property],
	}));
}

export function serializeBackgroundValues(values: readonly string[]): string {
	if (values.length !== cssBackgroundProperties.length) return "";
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	return cssBackgroundProperties.every(
		(property, index) =>
			property === "background-color" ||
			values[index] === initialBackgroundValues[property],
	)
		? values[values.length - 1]
		: "";
}
