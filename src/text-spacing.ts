import type { TextStyle } from "./css-text.js";
import { textGraphemeBoundaries } from "./text-grapheme-boundaries.js";
import type { TextTransformInput } from "./text-transform.js";

export interface TextSpacingInput extends TextTransformInput {
	readonly whiteSpace: TextStyle["white-space"];
	readonly letterSpacing: number;
}

export type TextSpacingPlan = ReadonlyMap<
	number,
	ReadonlyMap<number, ReadonlyMap<number, number>>
>;

export function planTextSpacing(
	inputs: readonly (TextSpacingInput | null)[],
	transformations: ReadonlyMap<number, ReadonlyMap<number, string>> | undefined,
	charge: (units?: number) => void,
): TextSpacingPlan {
	const result = new Map<number, Map<number, Map<number, number>>>();
	let units: {
		input: TextSpacingInput;
		offset: number;
		index: number;
		character: string;
	}[] = [];
	let collapsing = false;
	let skipLf = false;
	const flush = () => {
		if (!units.length) return;
		const characters: string[] = [];
		let spaced = false;
		for (const unit of units) {
			charge();
			characters.push(unit.character);
			spaced ||= unit.input.letterSpacing > 0;
		}
		if (spaced) {
			const boundaries = textGraphemeBoundaries(characters.join(""), charge);
			let position = 0;
			for (let index = 0; index < units.length - 1; index++) {
				charge();
				const unit = units[index];
				position += unit.character.length;
				if (!boundaries.has(position)) continue;
				const spacing =
					(unit.input.letterSpacing + units[index + 1].input.letterSpacing) / 2;
				if (spacing === 0) continue;
				let offsets = result.get(unit.input.id);
				if (!offsets) result.set(unit.input.id, (offsets = new Map()));
				let indices = offsets.get(unit.offset);
				if (!indices) offsets.set(unit.offset, (indices = new Map()));
				indices.set(unit.index, spacing);
			}
		}
		units = [];
	};
	for (const input of inputs) {
		charge();
		if (input === null) {
			flush();
			collapsing = false;
			skipLf = false;
			continue;
		}
		const changes = transformations?.get(input.id);
		const preserved =
			input.whiteSpace === "pre" || input.whiteSpace === "pre-wrap";
		for (let offset = 0; offset < input.text.length; ) {
			let character = String.fromCodePoint(
				input.text.codePointAt(offset) as number,
			);
			let codeUnits = character.length;
			charge(codeUnits);
			if (skipLf && character === "\n") {
				skipLf = false;
				offset += codeUnits;
				continue;
			}
			skipLf = character === "\r";
			if (character === "\r" && input.text[offset + 1] === "\n") {
				codeUnits++;
				skipLf = false;
				charge();
			}
			if (character === "\r" || character === "\f") character = "\n";
			if (
				character === "\n" &&
				(preserved || input.whiteSpace === "pre-line")
			) {
				flush();
				collapsing = false;
			} else if (character === "\t" && preserved) {
				flush();
				collapsing = false;
			} else if (!preserved && /^[\t\n ]$/.test(character)) {
				if (!collapsing)
					units.push({ input, offset, index: 0, character: " " });
				collapsing = true;
			} else {
				collapsing = false;
				if (!/^[\u00ad\u200b\u2060\ufeff]$/.test(character)) {
					let index = 0;
					for (const rendered of changes?.get(offset) ?? character) {
						charge();
						units.push({ input, offset, index, character: rendered });
						index++;
					}
				}
			}
			offset += codeUnits;
		}
	}
	flush();
	return result;
}
