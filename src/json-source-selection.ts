import { AgentBrowserError } from "./errors.js";

export const jsonSourceSelectionLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxPointerCodeUnits: 4096,
	maxPointerSegments: 128,
	maxNodes: 100_000,
	maxDepth: 128,
});

export const jsonSourceSpanProfiles = Object.freeze({
	default: jsonSourceSelectionLimits,
	"long-v1": Object.freeze({
		...jsonSourceSelectionLimits,
		maxSourceCodeUnits: 4_000_000,
		maxNodes: 1_000_000,
	}),
});

export type JsonSourceSelectionProfile = keyof typeof jsonSourceSpanProfiles;

export interface JsonSourceSpanOptions {
	readonly profile?: JsonSourceSelectionProfile;
	readonly checkpoint?: () => void;
}

interface PointerNode {
	selectionIndex?: number;
	children: Map<string, PointerNode>;
}

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
	const metadata = selectJsonSourceSpans(source, [pointer], { checkpoint })
		.selections[0];
	if (!metadata) {
		throw new AgentBrowserError(
			"not-found",
			"JSON pointer target was not found",
		);
	}
	return { text: source.slice(metadata.start, metadata.end), metadata };
}

export function selectJsonSourceSpans(
	source: string,
	pointers: readonly unknown[],
	options: JsonSourceSpanOptions = {},
): {
	readonly profile: JsonSourceSelectionProfile;
	readonly selections: readonly (JsonSourceSelection | null)[];
} {
	if (
		options === null ||
		typeof options !== "object" ||
		Array.isArray(options)
	) {
		throw new AgentBrowserError("invalid-input", "Invalid JSON span options");
	}
	const { checkpoint, profile = "default" } = options;
	if (checkpoint !== undefined && typeof checkpoint !== "function") {
		throw new AgentBrowserError(
			"invalid-input",
			"Checkpoint must be a function",
		);
	}
	checkpoint?.();
	if (profile !== "default" && profile !== "long-v1") {
		throw new AgentBrowserError("invalid-input", "Invalid JSON source profile");
	}
	const limits = jsonSourceSpanProfiles[profile];
	if (typeof source !== "string") {
		throw new AgentBrowserError(
			"invalid-input",
			"JSON source must be a string",
		);
	}
	if (source.length > limits.maxSourceCodeUnits) {
		resourceLimit("JSON source exceeds the code-unit limit");
	}
	if (!Array.isArray(pointers) || pointers.length === 0) {
		throw new AgentBrowserError(
			"invalid-input",
			"JSON pointers must be a nonempty array",
		);
	}
	if (pointers.length > 32) {
		resourceLimit("JSON pointer count exceeds the limit");
	}
	const validatedPointers = Array.from(pointers, validateJsonSourcePointer);
	const root: PointerNode = { children: new Map() };
	for (const [selectionIndex, pointer] of validatedPointers.entries()) {
		let node = root;
		const segments = pointer === "" ? [] : pointer.slice(1).split("/");
		for (const segment of segments) {
			const key = segment.replace(/~[01]/g, (escaped) =>
				escaped === "~0" ? "~" : "/",
			);
			let child = node.children.get(key);
			if (!child) {
				child = { children: new Map() };
				node.children.set(key, child);
			}
			node = child;
		}
		if (node.selectionIndex !== undefined) {
			throw new AgentBrowserError(
				"invalid-input",
				"Duplicate JSON pointers are not allowed",
			);
		}
		node.selectionIndex = selectionIndex;
	}
	let position = 0;
	let nodes = 0;
	let nextCheckpoint = 1024;
	const selections: ({
		start: number;
		end: number;
		valueKind: JsonSourceSelection["valueKind"];
	} | null)[] = validatedPointers.map(() => null);

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

	function value(depth: number, pointerNode: PointerNode | undefined) {
		checkpoint?.();
		if (++nodes > limits.maxNodes) {
			resourceLimit("JSON source exceeds the node limit");
		}
		whitespace();
		const start = position;
		const first = source[position];
		let valueKind: JsonSourceSelection["valueKind"];
		if (first === "{" || first === "[") {
			if (depth >= limits.maxDepth) {
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
					let childPointerNode: PointerNode | undefined;
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
						childPointerNode = pointerNode?.children.get(key);
						whitespace();
						if (source[position++] !== ":") invalidJson();
					} else {
						childPointerNode = pointerNode?.children.get(String(index));
					}
					value(depth + 1, childPointerNode);
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
		if (pointerNode?.selectionIndex !== undefined) {
			selections[pointerNode.selectionIndex] = {
				start,
				end: position,
				valueKind,
			};
		}
	}

	value(0, root);
	whitespace();
	if (position !== source.length) invalidJson();
	checkpoint?.();
	return Object.freeze({
		profile,
		selections: Object.freeze(
			selections.map((selection, index): JsonSourceSelection | null =>
				selection === null
					? null
					: Object.freeze({
							kind: "json-source-selection-v1",
							method: "json-pointer",
							pointer: validatedPointers[index],
							start: selection.start,
							end: selection.end,
							sourceCodeUnits: source.length,
							selectedCodeUnits: selection.end - selection.start,
							offsetBasis: "document-text-utf16",
							valueKind: selection.valueKind,
							duplicateMembers: "rejected",
						}),
			),
		),
	});
}
