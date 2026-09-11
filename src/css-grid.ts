import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
	type BoxFontMetrics,
} from "./css-box.js";
import { readCssIdentifier, skipCssTrivia } from "./css-variables.js";
import { lengthUsesFont } from "./css-math.js";

export const cssGridProperties = Object.freeze([
	"grid-template-columns",
	"grid-template-rows",
	"grid-template-areas",
	"grid-auto-columns",
	"grid-auto-rows",
	"grid-auto-flow",
	"grid-row-start",
	"grid-column-start",
	"grid-row-end",
	"grid-column-end",
] as const);
export type CssGridProperty = (typeof cssGridProperties)[number];
export type GridStyle = Readonly<Record<CssGridProperty, string>>;
export type GridSpecifiedStyle = Readonly<
	Partial<Record<CssGridProperty, string>>
>;
export const initialGridStyle: GridStyle = Object.freeze({
	"grid-template-columns": "none",
	"grid-template-rows": "none",
	"grid-template-areas": "none",
	"grid-auto-columns": "auto",
	"grid-auto-rows": "auto",
	"grid-auto-flow": "row",
	"grid-row-start": "auto",
	"grid-column-start": "auto",
	"grid-row-end": "auto",
	"grid-column-end": "auto",
});
export const cssGridLimits = Object.freeze({
	maxSourceCodeUnits: 16_384,
	maxSerializedCodeUnits: 16_384,
	maxTokens: 4096,
	maxIdentifierCodeUnits: 128,
	maxTracks: 256,
	maxRepeatCount: 256,
	maxExpandedComponents: 4096,
	maxLineNames: 64,
	maxAreaRows: 256,
	maxAreaColumns: 256,
	maxAreaCells: 4096,
	maxLineIndex: 1_000_000,
});
export const gridStyleCapabilities = Object.freeze({
	partial: true,
	properties: cssGridProperties,
	profile: "bounded-grid-level-1-grammar",
	limits: cssGridLimits,
	caseSensitiveNames: true,
	escapes: false,
	numericFunctions: false,
	autoRepeat: false,
	nestedRepeat: false,
	subgrid: false,
	masonry: false,
	layout: false,
	canonicalShorthandSerialization: false,
});
const properties = new Set<string>(cssGridProperties);
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const reserved = new Set([...wide, "revert-layer", "default", "auto", "span"]);
const components: Readonly<Record<string, readonly CssGridProperty[]>> =
	Object.freeze({
		"grid-row": Object.freeze(["grid-row-start", "grid-row-end"] as const),
		"grid-column": Object.freeze([
			"grid-column-start",
			"grid-column-end",
		] as const),
		"grid-area": Object.freeze([
			"grid-row-start",
			"grid-column-start",
			"grid-row-end",
			"grid-column-end",
		] as const),
	});
type Token = {
	type: "ident" | "number" | "dimension" | "function" | "string" | "delimiter";
	value: string;
};
type Breadth = { type: "breadth"; value: string; length: boolean };
type TrackSize =
	| Breadth
	| { type: "minmax"; minimum: Breadth; maximum: Breadth }
	| { type: "fit-content"; maximum: Breadth };
type TrackComponent =
	| TrackSize
	| { type: "names"; values: string[] }
	| { type: "repeat"; count: number; items: TrackComponent[] };
type TrackList = {
	items: TrackComponent[];
	tracks: number;
	expandedComponents: number;
};

export function isCssGridProperty(
	property: string,
): property is CssGridProperty {
	return properties.has(property);
}
export function gridShorthandComponents(
	property: string,
): readonly CssGridProperty[] | undefined {
	return Object.hasOwn(components, property) ? components[property] : undefined;
}
function tokenize(value: string): Token[] | undefined {
	if (
		value.length > cssGridLimits.maxSourceCodeUnits ||
		/[\\\u0000]/.test(value)
	)
		return;
	const tokens: Token[] = [];
	let position = 0;
	while (position < value.length) {
		if (/[\t\n\f\r ]/.test(value[position])) {
			position++;
			continue;
		}
		if (value.startsWith("/*", position)) {
			const end = value.indexOf("*/", position + 2);
			if (end < 0) return;
			position = skipCssTrivia(value, position, end + 2);
			continue;
		}
		if (tokens.length === cssGridLimits.maxTokens) return;
		const character = value[position];
		if ("[],/()".includes(character)) {
			tokens.push({ type: "delimiter", value: character });
			position++;
		} else if (character === '"' || character === "'") {
			const end = value.indexOf(character, position + 1);
			if (end < 0) return;
			const content = value.slice(position + 1, end);
			if (/[\n\r\f]/.test(content)) return;
			tokens.push({ type: "string", value: content });
			position = end + 1;
		} else {
			const number = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?/i.exec(
				value.slice(position),
			)?.[0];
			if (number !== undefined) {
				position += number.length;
				const unit = readCssIdentifier(value, position);
				const suffix = value[position] === "%" ? "%" : (unit?.value ?? "");
				tokens.push({
					type: suffix ? "dimension" : "number",
					value: number + suffix,
				});
				position += suffix.length;
			} else {
				if (!/^(?:--|-?[a-zA-Z_\u0080-\uFFFF])/.test(value.slice(position)))
					return;
				const name = readCssIdentifier(value, position);
				if (!name || name.value.length > cssGridLimits.maxIdentifierCodeUnits)
					return;
				position = name.end;
				const functional = value[position] === "(";
				tokens.push({
					type: functional ? "function" : "ident",
					value: name.value,
				});
				if (functional) position++;
			}
		}
	}
	return tokens;
}
export function gridValueUsesFont(value: string, unit: "em" | "rem"): boolean {
	return (
		tokenize(value)?.some(
			(token) =>
				token.type === "dimension" && lengthUsesFont(token.value, unit),
		) ?? false
	);
}

function customIdent(token: Token | undefined): string | undefined {
	return token?.type === "ident" && !reserved.has(token.value.toLowerCase())
		? token.value
		: undefined;
}
function integer(
	token: Token | undefined,
	maximum: number,
): number | undefined {
	if (token?.type !== "number" || !/^[+-]?\d+$/.test(token.value)) return;
	const parsed = Number(token.value);
	return Number.isSafeInteger(parsed) &&
		parsed !== 0 &&
		Math.abs(parsed) <= maximum
		? parsed
		: undefined;
}
function breadth(
	token: Token | undefined,
	flexible: boolean,
): Breadth | undefined {
	if (!token) return;
	const value = token.value.toLowerCase();
	if (token.type === "ident")
		return ["auto", "min-content", "max-content"].includes(value)
			? { type: "breadth", value, length: false }
			: undefined;
	if (token.type !== "number" && token.type !== "dimension") return;
	if (value.endsWith("fr")) {
		const factor = Number(value.slice(0, -2));
		return flexible && Number.isFinite(factor) && factor >= 0
			? { type: "breadth", value: `${factor}fr`, length: false }
			: undefined;
	}
	const length = parseBoxDeclarations("width", value)?.[0]?.value;
	return length === undefined
		? undefined
		: { type: "breadth", value: length, length: true };
}
function trackList(
	tokens: readonly Token[],
	auto: boolean,
): TrackList | undefined {
	let position = 0;
	const delimiter = (value: string) =>
		tokens[position]?.type === "delimiter" && tokens[position].value === value;
	function size(): TrackSize | undefined {
		const token = tokens[position++];
		if (token?.type !== "function") return breadth(token, true);
		const name = token.value.toLowerCase();
		if (name === "minmax") {
			const minimum = breadth(tokens[position++], false);
			if (!minimum || !delimiter(",")) return;
			position++;
			const maximum = breadth(tokens[position++], true);
			if (!maximum || !delimiter(")")) return;
			position++;
			return { type: "minmax", minimum, maximum };
		}
		if (name === "fit-content") {
			const maximum = breadth(tokens[position++], false);
			if (!maximum?.length || !delimiter(")")) return;
			position++;
			return { type: "fit-content", maximum };
		}
	}
	function list(repeated: boolean): TrackList | undefined {
		const items: TrackComponent[] = [];
		let tracks = 0;
		let expandedComponents = 0;
		let namesLast = false;
		while (position < tokens.length && !delimiter(")")) {
			if (delimiter("[")) {
				if (auto || namesLast) return;
				position++;
				const values: string[] = [];
				while (position < tokens.length && !delimiter("]")) {
					const name = customIdent(tokens[position++]);
					if (
						name === undefined ||
						values.length === cssGridLimits.maxLineNames
					)
						return;
					values.push(name);
				}
				if (!delimiter("]")) return;
				position++;
				items.push({ type: "names", values });
				expandedComponents += 1 + values.length;
				namesLast = true;
			} else if (
				tokens[position]?.type === "function" &&
				tokens[position].value.toLowerCase() === "repeat"
			) {
				if (auto || repeated) return;
				position++;
				const count = integer(tokens[position++], cssGridLimits.maxRepeatCount);
				if (count === undefined || count < 1 || !delimiter(",")) return;
				position++;
				const inner = list(true);
				if (!inner || !delimiter(")")) return;
				position++;
				items.push({ type: "repeat", count, items: inner.items });
				tracks += inner.tracks * count;
				expandedComponents += inner.expandedComponents * count;
				namesLast = false;
			} else {
				const track = size();
				if (!track) return;
				items.push(track);
				tracks++;
				expandedComponents++;
				namesLast = false;
			}
			if (
				tracks > cssGridLimits.maxTracks ||
				expandedComponents > cssGridLimits.maxExpandedComponents
			)
				return;
		}
		return tracks ? { items, tracks, expandedComponents } : undefined;
	}
	const parsed = list(false);
	return position === tokens.length ? parsed : undefined;
}
function renderTracks(
	items: readonly TrackComponent[],
	length: (value: string) => string = (value) => value,
): string {
	const renderBreadth = (value: Breadth) =>
		value.length ? length(value.value) : value.value;
	return items
		.map((item): string => {
			switch (item.type) {
				case "breadth":
					return renderBreadth(item);
				case "names":
					return `[${item.values.join(" ")}]`;
				case "repeat":
					return `repeat(${item.count}, ${renderTracks(item.items, length)})`;
				case "minmax":
					return `minmax(${renderBreadth(item.minimum)}, ${renderBreadth(item.maximum)})`;
				case "fit-content":
					return `fit-content(${renderBreadth(item.maximum)})`;
			}
		})
		.join(" ");
}
function areas(tokens: readonly Token[]): string | undefined {
	if (!tokens.length || tokens.length > cssGridLimits.maxAreaRows) return;
	const rows: string[][] = [];
	const rectangles = new Map<
		string,
		{ top: number; bottom: number; left: number; right: number; cells: number }
	>();
	let width: number | undefined;
	for (const token of tokens) {
		if (token.type !== "string") return;
		const cells: string[] = [];
		const pattern = /[a-zA-Z0-9_\-\u0080-\uFFFF]+|\.+|[\t ]+/y;
		while (pattern.lastIndex < token.value.length) {
			const match = pattern.exec(token.value)?.[0];
			if (!match) return;
			if (/^[\t ]/.test(match)) continue;
			if (cells.length === cssGridLimits.maxAreaColumns) return;
			if (match.startsWith(".")) cells.push(".");
			else {
				if (match.length > cssGridLimits.maxIdentifierCodeUnits) return;
				const row = rows.length;
				const column = cells.length;
				const rectangle = rectangles.get(match);
				if (rectangle) {
					rectangle.bottom = row;
					rectangle.left = Math.min(rectangle.left, column);
					rectangle.right = Math.max(rectangle.right, column);
					rectangle.cells++;
				} else {
					rectangles.set(match, {
						top: row,
						bottom: row,
						left: column,
						right: column,
						cells: 1,
					});
				}
				cells.push(match);
			}
		}
		width ??= cells.length;
		if (
			!width ||
			width !== cells.length ||
			(rows.length + 1) * width > cssGridLimits.maxAreaCells
		)
			return;
		rows.push(cells);
	}
	for (const rectangle of rectangles.values())
		if (
			rectangle.cells !==
			(rectangle.bottom - rectangle.top + 1) *
				(rectangle.right - rectangle.left + 1)
		)
			return;
	return rows.map((row) => `"${row.join(" ")}"`).join(" ");
}
function placement(tokens: readonly Token[]): string | undefined {
	if (!tokens.length || tokens.length > 3) return;
	if (tokens.length === 1 && tokens[0].type === "ident") {
		if (tokens[0].value.toLowerCase() === "auto") return "auto";
		return customIdent(tokens[0]);
	}
	let span = false;
	let count: number | undefined;
	let name: string | undefined;
	for (const token of tokens) {
		if (token.type === "ident" && token.value.toLowerCase() === "span") {
			if (span) return;
			span = true;
		} else if (token.type === "number") {
			if (count !== undefined) return;
			count = integer(token, cssGridLimits.maxLineIndex);
			if (count === undefined) return;
		} else {
			if (name !== undefined) return;
			name = customIdent(token);
			if (name === undefined) return;
		}
	}
	if (span && (count !== undefined ? count < 1 : name === undefined)) return;
	return [span ? "span" : undefined, count, name]
		.filter((entry) => entry !== undefined)
		.join(" ");
}
function wideKeyword(tokens: readonly Token[]): string | undefined {
	const token = tokens[0];
	if (tokens.length !== 1 || token.type !== "ident") return;
	const value = token.value.toLowerCase();
	return wide.has(value) ? value : undefined;
}
function normalizeGridValue(
	property: CssGridProperty,
	value: string,
): string | undefined {
	const tokens = tokenize(value);
	if (!tokens?.length) return;
	const keyword = wideKeyword(tokens);
	if (keyword) return keyword;
	if (property === "grid-auto-flow") {
		if (tokens.some((token) => token.type !== "ident")) return;
		const parts = tokens.map((token) => token.value.toLowerCase());
		if (parts.length === 1 && ["row", "column"].includes(parts[0]))
			return parts[0];
		if (parts.length === 1 && parts[0] === "dense") return "row dense";
		if (
			parts.length === 2 &&
			parts.includes("dense") &&
			(parts.includes("row") || parts.includes("column"))
		)
			return `${parts.includes("column") ? "column" : "row"} dense`;
		return;
	}
	if (property.startsWith("grid-template-")) {
		if (
			tokens.length === 1 &&
			tokens[0].type === "ident" &&
			tokens[0].value.toLowerCase() === "none"
		)
			return "none";
		if (property === "grid-template-areas") return areas(tokens);
	}
	if (property.endsWith("-rows") || property.endsWith("-columns")) {
		const tracks = trackList(tokens, property.startsWith("grid-auto-"));
		return tracks && renderTracks(tracks.items);
	}
	return placement(tokens);
}
export function parseGridValue(
	property: CssGridProperty,
	value: string,
): string | undefined {
	const normalized = normalizeGridValue(property, value);
	return normalized !== undefined &&
		normalized.length <= cssGridLimits.maxSerializedCodeUnits
		? normalized
		: undefined;
}
export function parseGridDeclarations(
	property: string,
	value: string,
): { property: CssGridProperty; value: string }[] | undefined {
	if (isCssGridProperty(property)) {
		const parsed = parseGridValue(property, value);
		return parsed === undefined ? undefined : [{ property, value: parsed }];
	}
	const names = gridShorthandComponents(property);
	if (!names) return;
	const tokens = tokenize(value);
	if (!tokens?.length) return;
	const keyword = wideKeyword(tokens);
	if (keyword) return names.map((name) => ({ property: name, value: keyword }));
	const groups: Token[][] = [[]];
	for (const token of tokens) {
		if (token.type === "delimiter" && token.value === "/") groups.push([]);
		else groups[groups.length - 1].push(token);
	}
	if (groups.length > names.length) return;
	const values: string[] = [];
	for (const group of groups) {
		const parsed = placement(group);
		if (parsed === undefined) return;
		values.push(parsed);
	}
	const copied = (index: number) =>
		groups[index]?.length === 1
			? (customIdent(groups[index][0]) ?? "auto")
			: "auto";
	if (names.length === 2) values[1] ??= copied(0);
	else {
		values[1] ??= copied(0);
		values[2] ??= copied(0);
		values[3] ??= groups[1] === undefined ? copied(0) : copied(1);
	}
	return names.map((name, index) => ({ property: name, value: values[index] }));
}
export function serializeGridShorthand(
	property: string,
	values: readonly string[],
): string {
	const names = gridShorthandComponents(property);
	if (!names || names.length !== values.length) return "";
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	return values.join(" / ");
}
export function computeGridStyle(
	specified: GridSpecifiedStyle,
	parent: GridStyle,
	viewport: { width: number; height: number },
	fonts?: BoxFontMetrics,
): GridStyle {
	const result = { ...initialGridStyle };
	for (const property of cssGridProperties) {
		const source = specified[property];
		if (source === undefined) continue;
		const value = parseGridValue(property, source);
		if (value === undefined || ["initial", "unset", "revert"].includes(value))
			continue;
		if (value === "inherit") result[property] = parent[property];
		else if (
			value !== "none" &&
			(property.endsWith("-rows") || property.endsWith("-columns"))
		) {
			const tokens = tokenize(source);
			const tracks =
				tokens && trackList(tokens, property.startsWith("grid-auto-"));
			if (tracks)
				result[property] = renderTracks(
					tracks.items,
					(length) =>
						computeBoxStyle({ width: length }, initialBoxStyle, viewport, fonts)
							.width,
				);
		} else result[property] = value;
	}
	return Object.freeze(result);
}
export function isGridDisplay(value: string): boolean {
	return ["grid", "inline-grid", "block grid", "inline grid"].includes(value);
}
