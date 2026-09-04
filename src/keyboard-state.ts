import { AgentBrowserError } from "./errors.js";

export interface KeyboardKey {
	key: string;
	code: string;
	shift: boolean;
	control: boolean;
	meta: boolean;
	alt: boolean;
	repeat: boolean;
	location: number;
}

interface KeyDescription {
	key: string;
	code: string;
	shifted?: string;
	modifier?: "Shift" | "Control" | "Alt" | "Meta";
	location: number;
}

const namedKeys = [
	"Enter",
	"Tab",
	"Backspace",
	"Delete",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
	"Escape",
	"Insert",
	"PageUp",
	"PageDown",
	...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
];
const punctuation = [
	["Backquote", "`", "~"],
	["Minus", "-", "_"],
	["Equal", "=", "+"],
	["BracketLeft", "[", "{"],
	["BracketRight", "]", "}"],
	["Backslash", "\\", "|"],
	["Semicolon", ";", ":"],
	["Quote", "'", '"'],
	["Comma", ",", "<"],
	["Period", ".", ">"],
	["Slash", "/", "?"],
];

function describe(input: string): KeyDescription {
	if (typeof input !== "string" || !input || input.length > 128)
		throw new AgentBrowserError("invalid-input", "Invalid keyboard key");
	const modifier = /^(Shift|Control|Alt|Meta)(Left|Right)?$/i.exec(input);
	if (modifier) {
		const name = (modifier[1][0].toUpperCase() +
			modifier[1].slice(1).toLowerCase()) as KeyDescription["modifier"];
		const right = modifier[2]?.toLowerCase() === "right";
		return {
			key: name as string,
			modifier: name,
			code: `${name}${right ? "Right" : "Left"}`,
			location: right ? 2 : 1,
		};
	}
	if (input.toLowerCase() === "space" || input === " ")
		return { key: " ", code: "Space", location: 0 };
	const named = namedKeys.find(
		(name) => name.toLowerCase() === input.toLowerCase(),
	);
	if (named) return { key: named, code: named, location: 0 };
	const letter = /^Key([A-Z])$/i.exec(input);
	if (letter)
		return {
			key: letter[1].toLowerCase(),
			shifted: letter[1].toUpperCase(),
			code: `Key${letter[1].toUpperCase()}`,
			location: 0,
		};
	const digit = /^Digit([0-9])$/i.exec(input);
	if (digit)
		return {
			key: digit[1],
			shifted: ")!@#$%^&*("[Number(digit[1])],
			code: `Digit${digit[1]}`,
			location: 0,
		};
	const physical = punctuation.find(
		([code]) => code.toLowerCase() === input.toLowerCase(),
	);
	if (physical)
		return {
			key: physical[1],
			shifted: physical[2],
			code: physical[0],
			location: 0,
		};
	if (Array.from(input).length !== 1 || /\p{Cc}|\p{Cs}/u.test(input))
		throw new AgentBrowserError(
			"unsupported",
			"Keyboard key is not implemented",
		);
	if (/^[a-z]$/i.test(input))
		return {
			key: input,
			shifted: input.toUpperCase(),
			code: `Key${input.toUpperCase()}`,
			location: 0,
		};
	if (/^\d$/.test(input))
		return { key: input, code: `Digit${input}`, location: 0 };
	const symbol = punctuation.find(
		([, plain, shifted]) => plain === input || shifted === input,
	);
	return { key: input, code: symbol?.[0] ?? "", location: 0 };
}

export function keyboardChord(input: string): string[] {
	if (typeof input !== "string" || !input || input.length > 128)
		throw new AgentBrowserError("invalid-input", "Invalid keyboard key");
	const parts =
		input === "+"
			? [input]
			: input.endsWith("++")
				? [...input.slice(0, -1).split("+").slice(0, -1), "+"]
				: input.split("+");
	const seen = new Set<string>();
	for (const [index, part] of parts.entries()) {
		const key = describe(part);
		if (
			(index < parts.length - 1 && !key.modifier) ||
			(key.modifier && seen.has(key.code))
		)
			throw new AgentBrowserError(
				"unsupported",
				"Invalid keyboard modifier combination",
			);
		seen.add(key.code);
	}
	return parts;
}

export class KeyboardState {
	private readonly held = new Map<string, KeyDescription>();
	clear() {
		this.held.clear();
	}
	private identity(key: KeyDescription) {
		return key.code || key.key;
	}
	has(input: string) {
		return this.held.has(this.identity(describe(input)));
	}
	modifiers() {
		const held = new Set(
			[...this.held.values()].map((entry) => entry.modifier),
		);
		return Object.freeze({
			shift: held.has("Shift"),
			control: held.has("Control"),
			alt: held.has("Alt"),
			meta: held.has("Meta"),
		});
	}
	private event(
		key: KeyDescription,
		repeat: boolean,
		literal = false,
	): KeyboardKey {
		const modifiers = this.modifiers();
		const shift = modifiers.shift;
		return {
			key: !literal && shift ? (key.shifted ?? key.key) : key.key,
			code: key.code,
			location: key.location,
			...modifiers,
			repeat,
		};
	}
	down(input: string, literal = false): KeyboardKey {
		const key = describe(input);
		const identity = this.identity(key);
		const repeat = this.held.has(identity);
		if (!repeat && this.held.size >= 64)
			throw new AgentBrowserError(
				"resource-limit",
				"At most 64 keyboard keys may be held",
			);
		this.held.set(identity, key);
		return this.event(key, repeat, literal);
	}
	up(input: string, literal = false): KeyboardKey {
		const key = describe(input);
		this.held.delete(this.identity(key));
		return this.event(key, false, literal);
	}
}
