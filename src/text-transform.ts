import { AgentBrowserError } from "./errors.js";
import {
	type UnicodeConditionalCase,
	unicodeCombiningRanges,
	unicodeConditionalCases,
	unicodeTitleMappings,
} from "./unicode-casing-data.js";

export interface TextTransformInput {
	readonly id: number;
	readonly text: string;
	readonly transform: string;
	readonly language?: string;
}

interface CharacterClass {
	readonly combining: 0 | 1 | 230;
	readonly cased: boolean;
	readonly ignored: boolean;
	readonly softDotted: boolean;
}

interface SourceCharacter {
	readonly id: number;
	readonly offset: number;
	readonly position: number;
	readonly character: string;
	readonly codePoint: number;
	readonly classification: CharacterClass;
	readonly transform: string;
	readonly language: string;
}

export const textTransformLimits = Object.freeze({
	maxInputs: 50_000,
	maxInputCodeUnits: 500_000,
	maxOutputCodeUnits: 1_500_000,
});

const conditionals = new Map<
	number,
	readonly Readonly<UnicodeConditionalCase>[]
>();
for (const rule of unicodeConditionalCases)
	conditionals.set(
		rule.codePoint,
		Object.freeze([...(conditionals.get(rule.codePoint) ?? []), rule]),
	);

let wordSegmenter: Intl.Segmenter | undefined;
let letterSegmenter: Intl.Segmenter | undefined;

function combiningClass(
	point: number,
	charge: (units?: number) => void,
): 0 | 1 | 230 {
	if (point < 0x300) return 0;
	let lower = 0;
	let upper = unicodeCombiningRanges.length - 1;
	while (lower <= upper) {
		charge();
		const middle = Math.floor((lower + upper) / 2);
		const range = unicodeCombiningRanges[middle];
		if (point < range[0]) upper = middle - 1;
		else if (point > range[1]) lower = middle + 1;
		else return range[2];
	}
	return 0;
}

function firstLetterUnits(text: string, charge: (units?: number) => void) {
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function")
		throw new AgentBrowserError(
			"unsupported",
			"Native word segmentation is unavailable",
		);
	wordSegmenter ??= new Intl.Segmenter("en", { granularity: "word" });
	letterSegmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
	charge(text.length || 1);
	const ranges: { start: number; end: number }[] = [];
	for (const word of wordSegmenter.segment(text)) {
		charge(word.segment.length + 1);
		if (!word.isWordLike) continue;
		const first = letterSegmenter
			.segment(word.segment)
			[Symbol.iterator]()
			.next();
		charge();
		if (first.done || !/^\p{Lowercase}/u.test(first.value.segment)) continue;
		ranges.push({
			start: word.index,
			end: word.index + first.value.segment.length,
		});
	}
	return ranges;
}

export function planTextTransforms(
	inputs: readonly (Readonly<TextTransformInput> | null)[],
	charge: (units?: number) => void,
): ReadonlyMap<number, ReadonlyMap<number, string>> {
	if (!Array.isArray(inputs) || typeof charge !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid text transformation input",
		);
	if (inputs.length > textTransformLimits.maxInputs)
		throw new AgentBrowserError(
			"resource-limit",
			"Text transformation input limit exceeded",
		);
	let codeUnits = 0;
	let needed = false;
	let capitalize = false;
	const ids = new Set<number>();
	for (const input of inputs) {
		charge();
		if (input === null) {
			codeUnits++;
		} else {
			if (
				!input ||
				typeof input !== "object" ||
				!Number.isSafeInteger(input.id) ||
				input.id < 0 ||
				ids.has(input.id) ||
				typeof input.text !== "string" ||
				typeof input.transform !== "string" ||
				(input.language !== undefined && typeof input.language !== "string")
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid text transformation source",
				);
			ids.add(input.id);
			if (
				!["none", "uppercase", "lowercase", "capitalize"].includes(
					input.transform,
				)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Text transformation mode is not supported",
				);
			codeUnits += input.text.length;
			needed ||= input.transform !== "none";
			capitalize ||= input.transform === "capitalize";
		}
		if (codeUnits > textTransformLimits.maxInputCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Text transformation source limit exceeded",
			);
	}
	const result = new Map<number, Map<number, string>>();
	if (!needed) return result;
	charge(codeUnits || 1);
	const characters: SourceCharacter[] = [];
	const classes = new Map<number, CharacterClass>();
	const parts: string[] = [];
	let position = 0;
	for (const input of inputs) {
		charge();
		const text = input?.text ?? "\n";
		const language = input?.language ?? "";
		const primary =
			language.length <= 255 &&
			/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(language)
				? language.split("-")[0].toLowerCase()
				: "";
		parts.push(text);
		let offset = 0;
		for (const character of text) {
			charge();
			const codePoint = character.codePointAt(0) as number;
			let classification = classes.get(codePoint);
			if (classification === undefined) {
				classification = {
					combining: combiningClass(codePoint, charge),
					cased: /\p{Cased}/u.test(character),
					ignored: /\p{Case_Ignorable}/u.test(character),
					softDotted: /\p{Soft_Dotted}/u.test(character),
				};
				classes.set(codePoint, classification);
			}
			characters.push({
				id: input?.id ?? -1,
				offset,
				position,
				character,
				codePoint,
				classification,
				transform: input?.transform ?? "none",
				language: primary,
			});
			offset += character.length;
			position += character.length;
		}
	}
	const firstUnits = capitalize ? firstLetterUnits(parts.join(""), charge) : [];
	const flags = new Uint8Array(characters.length);
	let cased = false;
	let barrier = -1;
	let soft = false;
	for (let index = 0; index < characters.length; index++) {
		charge();
		const item = characters[index];
		flags[index] =
			(cased ? 1 : 0) | (soft ? 4 : 0) | (barrier === 0x49 ? 8 : 0);
		if (!item.classification.ignored) cased = item.classification.cased;
		if (
			item.classification.combining === 0 ||
			item.classification.combining === 230
		) {
			barrier = item.codePoint;
			soft = item.classification.softDotted;
		}
	}
	cased = false;
	barrier = -1;
	let above = false;
	for (let index = characters.length - 1; index >= 0; index--) {
		charge();
		const item = characters[index];
		flags[index] |=
			(cased ? 2 : 0) | (above ? 16 : 0) | (barrier === 0x307 ? 32 : 0);
		if (!item.classification.ignored) cased = item.classification.cased;
		if (
			item.classification.combining === 0 ||
			item.classification.combining === 230
		) {
			barrier = item.codePoint;
			above = item.classification.combining === 230;
		}
	}
	let firstUnit = 0;
	let outputCodeUnits = 0;
	for (let index = 0; index < characters.length; index++) {
		charge();
		const item = characters[index];
		while (
			firstUnit < firstUnits.length &&
			item.position >= firstUnits[firstUnit].end
		) {
			charge();
			firstUnit++;
		}
		const title =
			item.transform === "capitalize" &&
			firstUnit < firstUnits.length &&
			item.position >= firstUnits[firstUnit].start &&
			item.position < firstUnits[firstUnit].end;
		const mode =
			item.transform === "uppercase"
				? "upper"
				: item.transform === "lowercase"
					? "lower"
					: title
						? "title"
						: undefined;
		let transformed = item.character;
		if (mode !== undefined) {
			const context = flags[index];
			const matches = (condition: string): boolean => {
				charge();
				if (condition === "Final_Sigma")
					return (context & 1) !== 0 && (context & 2) === 0;
				if (condition === "After_Soft_Dotted") return (context & 4) !== 0;
				if (condition === "After_I") return (context & 8) !== 0;
				if (condition === "More_Above") return (context & 16) !== 0;
				if (condition === "Before_Dot") return (context & 32) !== 0;
				if (condition === "Not_Before_Dot") return (context & 32) === 0;
				if (["tr", "az", "lt"].includes(condition))
					return condition === item.language;
				throw new AgentBrowserError(
					"unsupported",
					"Unknown Unicode casing condition",
				);
			};
			const conditional = conditionals.get(item.codePoint)?.find((rule) => {
				charge();
				return rule.conditions.every(matches);
			});
			transformed = conditional
				? conditional[mode]
				: mode === "lower"
					? item.character.toLowerCase()
					: mode === "title"
						? (unicodeTitleMappings[item.codePoint] ??
							item.character.toUpperCase())
						: item.character.toUpperCase();
		}
		charge(transformed.length || 1);
		outputCodeUnits += transformed.length;
		if (outputCodeUnits > textTransformLimits.maxOutputCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Text transformation output limit exceeded",
			);
		if (transformed === item.character || item.id < 0) continue;
		let changes = result.get(item.id);
		if (changes === undefined) {
			changes = new Map();
			result.set(item.id, changes);
		}
		changes.set(item.offset, transformed);
	}
	return result;
}
