import { AgentBrowserError } from "./errors.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import { nativeRasterColor } from "./native-raster-color.js";

export interface MediaViewport {
	width: number;
	height: number;
}
type Match = (viewport: MediaViewport) => boolean;
type Feature =
	| "width"
	| "height"
	| "aspect-ratio"
	| "resolution"
	| "color"
	| "color-index"
	| "monochrome";
export const cssMediaLimits = Object.freeze({
	maxCodeUnits: 65536,
	maxDepth: 32,
	maxConditions: 1024,
});
export interface CompiledCssMedia {
	readonly media: string;
	readonly unsupported: boolean;
	readonly conditions: number;
	matches(viewport: MediaViewport): boolean;
}
const colorFeatures = new Set(["color", "color-index", "monochrome"]);
const featureNames = new Set([
	"width",
	"height",
	"aspect-ratio",
	"resolution",
	...colorFeatures,
]);
const numberSource = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
const dimension = new RegExp(`^(${numberSource})([a-z]+)?$`);
const ratio = new RegExp(`^(${numberSource})(?:\\s*/\\s*(${numberSource}))?$`);
const lengths: Readonly<Record<string, number>> = Object.freeze({
	px: 1,
	em: 16,
	rem: 16,
	in: 96,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
	pt: 96 / 72,
	pc: 16,
});
function isFeature(value: string): value is Feature {
	return featureNames.has(value);
}
function actual(feature: Feature, viewport: MediaViewport): number {
	if (feature === "color") return nativeRasterColor.componentBits;
	if (feature === "color-index") return nativeRasterColor.paletteEntries;
	if (feature === "monochrome") return nativeRasterColor.monochromeBits;
	return feature === "resolution"
		? nativeHeadlessDisplay.devicePixelRatio
		: feature === "aspect-ratio"
			? viewport.width / viewport.height
			: viewport[feature];
}
function value(feature: Feature, source: string): number | undefined {
	if (colorFeatures.has(feature))
		return /^[+-]?\d+$/.test(source) ? Number(source) : undefined;
	if (feature === "resolution" && source === "infinite")
		return Number.POSITIVE_INFINITY;
	if (feature === "aspect-ratio") {
		const match = ratio.exec(source);
		if (!match) return undefined;
		const numerator = Number(match[1]);
		const denominator = Number(match[2] ?? 1);
		const result = numerator / denominator;
		return numerator >= 0 &&
			denominator > 0 &&
			Number.isFinite(numerator) &&
			Number.isFinite(denominator) &&
			Number.isFinite(result)
			? result
			: undefined;
	}
	const match = dimension.exec(source);
	if (!match) return undefined;
	const amount = Number(match[1]);
	const unit = match[2] ?? "";
	const scale =
		feature === "resolution"
			? (
					{ dppx: 1, x: 1, dpi: 1 / 96, dpcm: 2.54 / 96 } as Record<
						string,
						number
					>
				)[unit]
			: unit === "" && amount === 0
				? 1
				: Object.hasOwn(lengths, unit)
					? lengths[unit]
					: undefined;
	const result = amount * (scale ?? Number.NaN);
	return Number.isFinite(result) ? result : undefined;
}
function compare(left: number, operator: string, right: number): boolean {
	return operator === "<"
		? left < right
		: operator === "<="
			? left <= right
			: operator === ">"
				? left > right
				: operator === ">="
					? left >= right
					: left === right;
}
function feature(source: string): Match | undefined {
	if (source === "orientation") return () => true;
	if (isFeature(source)) return (viewport) => actual(source, viewport) !== 0;
	const colon = /^([a-z-]+)\s*:\s*(.+)$/.exec(source);
	if (colon) {
		if (colon[1] === "orientation")
			return colon[2] === "portrait"
				? (viewport) => viewport.height >= viewport.width
				: colon[2] === "landscape"
					? (viewport) => viewport.width > viewport.height
					: undefined;
		const name = colon[1].replace(/^(min|max)-/, "");
		if (!isFeature(name)) return undefined;
		const expected = value(name, colon[2]);
		if (expected === undefined) return undefined;
		const operator = colon[1].startsWith("min-")
			? ">="
			: colon[1].startsWith("max-")
				? "<="
				: "=";
		return (viewport) => compare(actual(name, viewport), operator, expected);
	}
	const parts = source.split(/(<=|>=|<|>|=)/).map((part) => part.trim());
	if (parts.length === 3) {
		const [left, operator, right] = parts;
		if (isFeature(left)) {
			const expected = value(left, right);
			return expected === undefined
				? undefined
				: (viewport) => compare(actual(left, viewport), operator, expected);
		}
		if (isFeature(right)) {
			const expected = value(right, left);
			return expected === undefined
				? undefined
				: (viewport) => compare(expected, operator, actual(right, viewport));
		}
	}
	if (parts.length === 5) {
		const [left, first, name, second, right] = parts;
		if (
			!isFeature(name) ||
			!["<", ">"].includes(first[0]) ||
			first[0] !== second[0]
		)
			return undefined;
		const lower = value(name, left);
		const upper = value(name, right);
		return lower === undefined || upper === undefined
			? undefined
			: (viewport) =>
					compare(lower, first, actual(name, viewport)) &&
					compare(actual(name, viewport), second, upper);
	}
	return undefined;
}

class MediaParser {
	conditions = 0;
	constructor(
		private readonly source: string,
		private readonly pairs: ReadonlyMap<number, number>,
	) {}
	query(start: number, end: number): Match | undefined {
		const source = this.source.slice(start, end);
		const typed = /^(?:(not|only)\s+)?(all|screen|print)\b/.exec(source);
		if (!typed) return this.condition(start, end, true);
		this.charge();
		const tail = source.slice(typed[0].length).trimStart();
		const type = typed[2] !== "print";
		const negate = typed[1] === "not";
		if (!tail) return () => (negate ? !type : type);
		const and = /^and\s+/.exec(tail);
		if (!and) return undefined;
		const condition = this.condition(
			end - tail.length + and[0].length,
			end,
			false,
		);
		return condition
			? (viewport) => negate !== (type && condition(viewport))
			: undefined;
	}
	private condition(
		startOffset: number,
		endOffset: number,
		allowOr: boolean,
	): Match | undefined {
		let start = startOffset;
		let end = endOffset;
		this.charge();
		while (start < end && this.source[start] === " ") start++;
		while (end > start && this.source[end - 1] === " ") end--;
		if (this.source.startsWith("not ", start)) {
			const parsed = this.term(start + 4, end);
			return parsed && parsed.end === end
				? (viewport) => !parsed.match(viewport)
				: undefined;
		}
		const terms: Match[] = [];
		let position = start;
		let operator: string | undefined;
		while (position < end) {
			const parsed = this.term(position, end);
			if (!parsed) return undefined;
			terms.push(parsed.match);
			position = parsed.end;
			if (position === end) break;
			const next = this.source.startsWith("and ", position)
				? "and"
				: this.source.startsWith("or ", position)
					? "or"
					: undefined;
			if (
				!next ||
				(next === "or" && !allowOr) ||
				(operator !== undefined && operator !== next)
			)
				return undefined;
			operator = next;
			position += next.length + 1;
			if (position >= end) return undefined;
		}
		if (!terms.length) return undefined;
		return operator === "or"
			? (viewport) => terms.some((match) => match(viewport))
			: (viewport) => terms.every((match) => match(viewport));
	}
	private term(
		startOffset: number,
		end: number,
	): { match: Match; end: number } | undefined {
		let start = startOffset;
		while (start < end && this.source[start] === " ") start++;
		if (this.source[start] !== "(") return undefined;
		const close = this.pairs.get(start);
		if (close === undefined || close >= end) return undefined;
		const inner = this.source.slice(start + 1, close).trim();
		let match: Match | undefined;
		if (inner.startsWith("(") || inner.startsWith("not "))
			match = this.condition(start + 1, close, true);
		else {
			this.charge();
			match = feature(inner);
		}
		if (!match) return undefined;
		let position = close + 1;
		while (position < end && this.source[position] === " ") position++;
		return { match, end: position };
	}
	private charge() {
		if (++this.conditions > cssMediaLimits.maxConditions)
			throw new AgentBrowserError(
				"resource-limit",
				"Media condition limit exceeded",
			);
	}
}

function withoutMediaComments(source: string): string {
	const pieces: string[] = [];
	let start = 0;
	for (let index = 0; index < source.length; index++) {
		if (source[index] === "\\") {
			index++;
			continue;
		}
		if (source[index] === '"' || source[index] === "'") {
			const quote = source[index++];
			for (; index < source.length && source[index] !== quote; index++)
				if (source[index] === "\\") index++;
		} else if (source.startsWith("/*", index)) {
			pieces.push(source.slice(start, index), " ");
			const end = source.indexOf("*/", index + 2);
			index = end < 0 ? source.length : end + 1;
			start = index + 1;
		}
	}
	pieces.push(source.slice(start));
	return pieces.join("");
}

export function compileCssMedia(source: string): CompiledCssMedia {
	if (source.length > cssMediaLimits.maxCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Media query source limit exceeded",
		);
	const normalized = withoutMediaComments(source)
		.trim()
		.toLowerCase()
		.replace(/[\t\n\f\r ]+/g, " ");
	if (!normalized)
		return Object.freeze({
			media: "",
			unsupported: false,
			conditions: 0,
			matches: () => true,
		});
	const pairs = new Map<number, number>();
	const stack: { index: number; closing: string }[] = [];
	const branches: [number, number][] = [];
	let start = 0;
	let malformed = false;
	for (let index = 0; index < normalized.length; index++) {
		const character = normalized[index];
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === '"' || character === "'") {
			const quote = character;
			for (
				index++;
				index < normalized.length && normalized[index] !== quote;
				index++
			)
				if (normalized[index] === "\\") index++;
			if (index >= normalized.length) malformed = true;
			continue;
		}
		if (["(", "[", "{"].includes(character)) {
			if (stack.length >= cssMediaLimits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Media nesting limit exceeded",
				);
			stack.push({
				index,
				closing: character === "(" ? ")" : character === "[" ? "]" : "}",
			});
		} else if ([")", "]", "}"].includes(character)) {
			const opening = stack.pop();
			if (opening === undefined || opening.closing !== character)
				malformed = true;
			else if (character === ")") pairs.set(opening.index, index);
		} else if (character === "," && !stack.length) {
			branches.push([start, index]);
			start = index + 1;
		}
	}
	branches.push([start, normalized.length]);
	if (stack.length || malformed)
		return Object.freeze({
			media: "not all",
			unsupported: true,
			conditions: 0,
			matches: () => false,
		});
	const parser = new MediaParser(normalized, pairs);
	const serialized: string[] = [];
	const matches: Match[] = [];
	let unsupported = false;
	for (let [start, end] of branches) {
		while (normalized[start] === " ") start++;
		while (end > start && normalized[end - 1] === " ") end--;
		const text = normalized.slice(start, end);
		const match = /["'\\[\]{}]/.test(text)
			? undefined
			: parser.query(start, end);
		if (match) {
			matches.push(match);
			serialized.push(
				text
					.replace(/\s*:\s*/g, ": ")
					.replace(/\(\s+/g, "(")
					.replace(/\s+\)/g, ")"),
			);
		} else {
			unsupported = true;
			serialized.push("not all");
		}
	}
	return Object.freeze({
		media: serialized.join(", "),
		unsupported,
		conditions: parser.conditions,
		matches: (viewport: MediaViewport) =>
			matches.some((match) => match(viewport)),
	});
}
