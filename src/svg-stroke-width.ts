import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";

export function normalizeSvgStrokeWidth(source: string): string | undefined {
	const value = source
		.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
		.toLowerCase();
	if (["initial", "inherit", "unset", "revert"].includes(value)) return value;
	const match =
		/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(px|cm|mm|q|in|pt|pc|%)?$/.exec(
			value,
		);
	if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) < 0)
		return undefined;
	return `${Number(match[1])}${match[2] ?? "px"}`;
}

export function computeSvgStrokeWidth(value: string): string {
	const declaration = parseBoxDeclarations("width", value)?.[0];
	if (!declaration) throw new TypeError("Invalid normalized SVG stroke width");
	return computeBoxStyle({ width: declaration.value }, initialBoxStyle, {
		width: 0,
		height: 0,
	}).width;
}
