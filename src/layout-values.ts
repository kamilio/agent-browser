import { AgentBrowserError } from "./errors.js";
import {
	cssMathLimits,
	isCssLengthMath,
	resolveLengthMath,
} from "./css-math.js";

export const layoutValueLimits = Object.freeze({
	maxAbsoluteLength: 16_777_216,
	maxLengthCodeUnits: 128,
});

export function layoutNumber(value: number, signed = false): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		(!signed && value < 0)
	)
		throw new AgentBrowserError("invalid-input", "Invalid layout length");
	if (Math.abs(value) > layoutValueLimits.maxAbsoluteLength)
		throw new AgentBrowserError(
			"resource-limit",
			"Layout length limit exceeded",
		);
	return value === 0 ? 0 : value;
}

export function resolveLayoutLength(
	value: string,
	containingWidth: number,
	signed = false,
): number {
	layoutNumber(containingWidth);
	if (typeof value !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"A computed layout length is required",
		);
	const math = isCssLengthMath(value);
	if (
		value.length >
		(math
			? cssMathLimits.maxComputedCodeUnits
			: layoutValueLimits.maxLengthCodeUnits)
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Layout length source limit exceeded",
		);
	if (math)
		return layoutNumber(
			resolveLengthMath(value, containingWidth, signed),
			signed,
		);
	const match = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|%)$/.exec(value);
	if (!match)
		throw new AgentBrowserError(
			"unsupported",
			"Layout requires computed pixel or percentage lengths",
		);
	const number = Number(match[1]);
	if (!Number.isFinite(number))
		throw new AgentBrowserError("resource-limit", "Layout numeric overflow");
	if (!signed && number < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Negative layout size is invalid",
		);
	const result = match[2] === "%" ? (number / 100) * containingWidth : number;
	if (!Number.isFinite(result))
		throw new AgentBrowserError("resource-limit", "Layout numeric overflow");
	return layoutNumber(result, signed);
}
