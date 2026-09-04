import { AgentBrowserError } from "./errors.js";
import { domString } from "./script-dom.js";

export const pageCssLimits = Object.freeze({
	maxInputCodeUnits: 65_536,
	maxOutputCodeUnits: 65_536,
});

function escapedUnit(source: string, index: number): string {
	const point = source.charCodeAt(index);
	if (point === 0) return "\ufffd";
	if (
		point <= 0x1f ||
		point === 0x7f ||
		(point >= 0x30 &&
			point <= 0x39 &&
			(index === 0 || (index === 1 && source[0] === "-")))
	)
		return `\\${point.toString(16)} `;
	if (source.length === 1 && point === 0x2d) return "\\-";
	if (
		point >= 0x80 ||
		point === 0x2d ||
		point === 0x5f ||
		(point >= 0x30 && point <= 0x39) ||
		(point >= 0x41 && point <= 0x5a) ||
		(point >= 0x61 && point <= 0x7a)
	)
		return source[index];
	return `\\${source[index]}`;
}

export function pageCssEscape(...args: readonly unknown[]): string {
	if (!args.length) throw new TypeError("CSS.escape requires an argument");
	if (typeof args[0] === "symbol")
		throw new TypeError("Cannot convert a Symbol to a string");
	const source = domString(args[0]);
	if (source.length > pageCssLimits.maxInputCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS.escape input limit exceeded",
		);
	let length = 0;
	for (let index = 0; index < source.length; index++) {
		length += escapedUnit(source, index).length;
		if (length > pageCssLimits.maxOutputCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS.escape output limit exceeded",
			);
	}
	let output = "";
	for (let index = 0; index < source.length; index++)
		output += escapedUnit(source, index);
	return output;
}
