import {
	computeLengthMath,
	cssMathLimits,
	isCssLengthMath,
	normalizeLengthMath,
	splitLengthComponents,
} from "./css-math.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export interface TextIndent {
	readonly size: number;
	readonly hanging: boolean;
	readonly eachLine: boolean;
}

const zeroIndent: Readonly<TextIndent> = Object.freeze({
	size: 0,
	hanging: false,
	eachLine: false,
});

interface IndentComponents {
	length: string;
	hanging: boolean;
	eachLine: boolean;
}

const length =
	/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|em|rem|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax|%)?$/;
const absoluteFactors: Readonly<Record<string, number>> = Object.freeze({
	px: 1,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
	in: 96,
	pt: 96 / 72,
	pc: 16,
});

function components(value: string): IndentComponents | undefined {
	if (
		typeof value !== "string" ||
		value.length > cssMathLimits.maxSourceCodeUnits
	)
		return;
	const parts = splitLengthComponents(value.toLowerCase());
	if (!parts || parts.length > 3) return;
	let numeric: string | undefined;
	let hanging = false;
	let eachLine = false;
	for (const part of parts) {
		if (part === "hanging") {
			if (hanging) return;
			hanging = true;
		} else if (part === "each-line") {
			if (eachLine) return;
			eachLine = true;
		} else {
			if (numeric !== undefined) return;
			if (isCssLengthMath(part)) numeric = normalizeLengthMath(part);
			else {
				const parsed = length.exec(part);
				if (!parsed) return;
				const number = Number(parsed[1]);
				if (!Number.isFinite(number) || (!parsed[2] && number !== 0)) return;
				numeric = `${number}${parsed[2] ?? "px"}`;
			}
			if (numeric === undefined) return;
		}
	}
	return numeric === undefined
		? undefined
		: { length: numeric, hanging, eachLine };
}

function serialize(value: IndentComponents): string {
	return `${value.length}${value.hanging ? " hanging" : ""}${value.eachLine ? " each-line" : ""}`;
}

function computedComponents(value: string): IndentComponents {
	if (typeof value !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid text indentation");
	if (
		value.length >
		cssMathLimits.maxComputedCodeUnits + " hanging each-line".length
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Text indentation source limit exceeded",
		);
	const eachLine = value.endsWith(" each-line");
	if (eachLine) value = value.slice(0, -" each-line".length);
	const hanging = value.endsWith(" hanging");
	if (hanging) value = value.slice(0, -" hanging".length);
	return { length: value, hanging, eachLine };
}

export function parseTextIndent(value: string): string | undefined {
	const parsed = components(value);
	return parsed && serialize(parsed);
}

export function computeTextIndent(
	value: string,
	fontSize: number,
	rootFontSize: number,
	viewport: { width: number; height: number },
): string {
	const expanded =
		typeof value === "string" &&
		value.length > cssMathLimits.maxSourceCodeUnits;
	const parsed = expanded ? computedComponents(value) : components(value);
	if (!parsed)
		throw new AgentBrowserError("invalid-input", "Invalid text indentation");
	layoutNumber(fontSize);
	layoutNumber(rootFontSize);
	layoutNumber(viewport.width);
	layoutNumber(viewport.height);
	const factor = (unit: string): number => {
		if (expanded && unit !== "px")
			throw new AgentBrowserError(
				"unsupported",
				"Computed text indentation requires pixel or percentage units",
			);
		return (
			absoluteFactors[unit] ??
			{
				em: fontSize,
				rem: rootFontSize,
				vw: viewport.width / 100,
				vh: viewport.height / 100,
				vmin: Math.min(viewport.width, viewport.height) / 100,
				vmax: Math.max(viewport.width, viewport.height) / 100,
			}[unit] ??
			Number.NaN
		);
	};
	if (isCssLengthMath(parsed.length)) {
		const computed = computeLengthMath(parsed.length, factor, true);
		if (expanded && computed !== parsed.length)
			throw new AgentBrowserError(
				"invalid-input",
				"Canonical computed text indentation is required",
			);
		parsed.length = computed;
	} else if (expanded)
		throw new AgentBrowserError("invalid-input", "Invalid text indentation");
	const scalar = length.exec(parsed.length);
	if (scalar && scalar[2] !== "%")
		parsed.length = `${layoutNumber(Number(scalar[1]) * factor(scalar[2] ?? "px"), true)}px`;
	return serialize(parsed);
}

export function resolveTextIndent(
	value: string,
	percentageBasis: number,
): Readonly<TextIndent> {
	if (value === "0px") {
		layoutNumber(percentageBasis);
		return zeroIndent;
	}
	const parsed = computedComponents(value);
	return Object.freeze({
		size: resolveLayoutLength(parsed.length, percentageBasis, true),
		hanging: parsed.hanging,
		eachLine: parsed.eachLine,
	});
}
