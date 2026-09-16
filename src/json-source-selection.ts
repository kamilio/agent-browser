import { AgentBrowserError } from "./errors.js";

export const jsonSourceSelectionLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxPointerCodeUnits: 4096,
	maxPointerSegments: 128,
	maxNodes: 100_000,
	maxDepth: 128,
});

export interface JsonSourceSelection {
	readonly kind: "json-source-selection-v1";
	readonly method: "json-pointer";
	readonly pointer: string;
	readonly start: number;
	readonly end: number;
	readonly sourceCodeUnits: number;
	readonly selectedCodeUnits: number;
	readonly offsetBasis: "document-text-utf16";
	readonly valueKind:
		| "object"
		| "array"
		| "string"
		| "number"
		| "boolean"
		| "null";
	readonly duplicateMembers: "rejected";
}

function invalidJson(): never {
	throw new AgentBrowserError("invalid-input", "Malformed JSON source");
}

function resourceLimit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

export function validateJsonSourcePointer(value: unknown): string {
	if (typeof value !== "string") {
		throw new AgentBrowserError(
			"invalid-input",
			"JSON pointer must be a string",
		);
	}
	if (value.length > jsonSourceSelectionLimits.maxPointerCodeUnits) {
		resourceLimit("JSON pointer exceeds the code-unit limit");
	}
	if (value !== "" && value[0] !== "/") {
		throw new AgentBrowserError(
			"invalid-input",
			"JSON pointer must start with /",
		);
	}
	let segments = 0;
	for (let position = 0; position < value.length; position++) {
		if (value[position] === "/") {
			if (++segments > jsonSourceSelectionLimits.maxPointerSegments) {
				resourceLimit("JSON pointer exceeds the segment limit");
			}
		} else if (value[position] === "~") {
			const escaped = value[++position];
			if (escaped !== "0" && escaped !== "1") {
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid JSON pointer escape",
				);
			}
		}
	}
	return value;
}

export function selectJsonSource(
	source: string,
	pointer: unknown,
	checkpoint?: () => void,
): { text: string; metadata: JsonSourceSelection } {
	if (checkpoint !== undefined && typeof checkpoint !== "function") {
		throw new AgentBrowserError(
			"invalid-input",
			"Checkpoint must be a function",
		);
	}
	checkpoint?.();
	if (typeof source !== "string") {
		throw new AgentBrowserError(
			"invalid-input",
			"JSON source must be a string",
		);
	}
	if (source.length > jsonSourceSelectionLimits.maxSourceCodeUnits) {
		resourceLimit("JSON source exceeds the code-unit limit");
	}
	const validatedPointer = validateJsonSourcePointer(pointer);
	const segments =
		validatedPointer === ""
			? []
			: validatedPointer
					.slice(1)
					.split("/")
					.map((segment) =>
						segment.replace(/~[01]/g, (escaped) =>
							escaped === "~0" ? "~" : "/",
						),
					);
	let position = 0;
	let nodes = 0;
	let nextCheckpoint = 1024;
	let selection:
		| {
				start: number;
				end: number;
				valueKind: JsonSourceSelection["valueKind"];
		  }
		| undefined;

	function scanCheckpoint() {
		if (position >= nextCheckpoint) {
			checkpoint?.();
			nextCheckpoint = position + 1024;
		}
	}

	function whitespace() {
		while (position < source.length) {
			const code = source.charCodeAt(position);
			if (code !== 0x20 && code !== 0x09 && code !== 0x0d && code !== 0x0a) {
				break;
			}
			position++;
			scanCheckpoint();
		}
	}

	function stringLiteral() {
		if (source[position] !== '"') invalidJson();
		position++;
		while (position < source.length) {
			scanCheckpoint();
			const code = source.charCodeAt(position++);
			if (code === 0x22) return;
			if (code < 0x20) invalidJson();
			if (code !== 0x5c) continue;
			const escaped = source[position++];
			if (escaped === "u") {
				for (let digit = 0; digit < 4; digit++) {
					const hex = source.charCodeAt(position++);
					if (
						!(
							(hex >= 0x30 && hex <= 0x39) ||
							(hex >= 0x41 && hex <= 0x46) ||
							(hex >= 0x61 && hex <= 0x66)
						)
					) {
						invalidJson();
					}
				}
			} else if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) {
				invalidJson();
			}
		}
		invalidJson();
	}

	function isDigit() {
		const code = source.charCodeAt(position);
		return code >= 0x30 && code <= 0x39;
	}

	function digits() {
		if (!isDigit()) invalidJson();
		do {
			position++;
			scanCheckpoint();
		} while (isDigit());
	}

	function numberLiteral() {
		if (source[position] === "-") position++;
		if (source[position] === "0") position++;
		else digits();
		if (source[position] === ".") {
			position++;
			digits();
		}
		if (source[position] === "e" || source[position] === "E") {
			position++;
			if (source[position] === "+" || source[position] === "-") position++;
			digits();
		}
	}

	function value(depth: number, pathPosition: number) {
		checkpoint?.();
		if (++nodes > jsonSourceSelectionLimits.maxNodes) {
			resourceLimit("JSON source exceeds the node limit");
		}
		whitespace();
		const start = position;
		const first = source[position];
		let valueKind: JsonSourceSelection["valueKind"];
		if (first === "{" || first === "[") {
			if (depth >= jsonSourceSelectionLimits.maxDepth) {
				resourceLimit("JSON source exceeds the nesting-depth limit");
			}
			valueKind = first === "{" ? "object" : "array";
			const closing = first === "{" ? "}" : "]";
			const keys = first === "{" ? new Set<string>() : undefined;
			position++;
			whitespace();
			if (source[position] !== closing) {
				let index = 0;
				while (true) {
					checkpoint?.();
					let childPathPosition = -1;
					if (keys) {
						const keyStart = position;
						stringLiteral();
						checkpoint?.();
						const key: string = JSON.parse(source.slice(keyStart, position));
						if (keys.has(key)) {
							throw new AgentBrowserError(
								"invalid-input",
								"Duplicate JSON object member names are not allowed",
							);
						}
						keys.add(key);
						if (pathPosition >= 0 && segments[pathPosition] === key) {
							childPathPosition = pathPosition + 1;
						}
						whitespace();
						if (source[position++] !== ":") invalidJson();
					} else if (
						pathPosition >= 0 &&
						segments[pathPosition] === String(index)
					) {
						childPathPosition = pathPosition + 1;
					}
					value(depth + 1, childPathPosition);
					index++;
					whitespace();
					if (source[position] === closing) break;
					if (source[position++] !== ",") invalidJson();
					whitespace();
				}
			}
			position++;
		} else if (first === '"') {
			valueKind = "string";
			stringLiteral();
		} else if (first === "-" || isDigit()) {
			valueKind = "number";
			numberLiteral();
		} else if (source.startsWith("true", position)) {
			valueKind = "boolean";
			position += 4;
		} else if (source.startsWith("false", position)) {
			valueKind = "boolean";
			position += 5;
		} else if (source.startsWith("null", position)) {
			valueKind = "null";
			position += 4;
		} else {
			invalidJson();
		}
		if (pathPosition === segments.length) {
			selection = { start, end: position, valueKind };
		}
	}

	value(0, 0);
	whitespace();
	if (position !== source.length) invalidJson();
	checkpoint?.();
	if (!selection) {
		throw new AgentBrowserError(
			"not-found",
			"JSON pointer target was not found",
		);
	}
	const metadata: JsonSourceSelection = Object.freeze({
		kind: "json-source-selection-v1",
		method: "json-pointer",
		pointer: validatedPointer,
		start: selection.start,
		end: selection.end,
		sourceCodeUnits: source.length,
		selectedCodeUnits: selection.end - selection.start,
		offsetBasis: "document-text-utf16",
		valueKind: selection.valueKind,
		duplicateMembers: "rejected",
	});
	return { text: source.slice(selection.start, selection.end), metadata };
}
