import {
	cssGridLimits,
	cssGridProperties,
	parseGridAreas,
	parseGridLine,
	parseGridTrackList,
	parseGridValue,
	type GridParsedLine,
	type GridStyle,
	type GridTrackComponent,
} from "./css-grid.js";
import { AgentBrowserError } from "./errors.js";
import type {
	GridPlacedAxis,
	GridPlacement,
	GridPlacementInput,
	GridTrack,
} from "./grid-types.js";

export const gridPlacementLimits = Object.freeze({
	maxTracks: 4096,
	maxItems: 4096,
	maxOccupiedCells: 1_000_000,
	maxWork: 8_000_000,
});

type Axis = {
	tracks: GridTrack[];
	names: string[][];
	namedLines: Map<string, number[]>;
	pattern: GridTrack[];
	explicit: number;
	start: number;
	end: number;
};
type Position = { start?: number; end?: number; span: number };
type Item = {
	id: number;
	order: number;
	index: number;
	major: Position;
	minor: Position;
	placed: boolean;
};

export function placeGridItems(
	style: GridStyle,
	items: readonly GridPlacementInput[],
	options: { maxWork?: number } = {},
): Readonly<GridPlacement> {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid grid placement options",
		);
	const maxWork =
		options.maxWork === undefined
			? gridPlacementLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > gridPlacementLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid grid placement work limit",
		);
	let work = 0;
	function charge(amount = 1): void {
		if (amount > maxWork - work)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid placement work limit exceeded",
			);
		work += amount;
	}
	function unsupported(property: string): never {
		throw new AgentBrowserError(
			"unsupported",
			`Unsupported computed grid value: ${property}`,
		);
	}
	function validateStyle(value: GridStyle): void {
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid grid placement style",
			);
		for (const property of cssGridProperties) {
			const source = value[property];
			if (typeof source !== "string")
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid grid style: ${property}`,
				);
			if (source.length > cssGridLimits.maxSourceCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Grid source limit exceeded",
				);
			charge(source.length + 1);
		}
	}
	function extent(axis: Axis, start: number, end: number): void {
		charge();
		const first = Math.min(axis.start, start);
		const last = Math.max(axis.end, end);
		if (
			!Number.isSafeInteger(start) ||
			!Number.isSafeInteger(end) ||
			start > end ||
			last - first > gridPlacementLimits.maxTracks
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid track limit exceeded",
			);
		axis.start = first;
		axis.end = last;
	}
	function expand(components: readonly GridTrackComponent[]): {
		tracks: GridTrack[];
		names: string[][];
	} {
		const tracks: GridTrack[] = [];
		const names: string[][] = [[]];
		function append(values: readonly GridTrackComponent[]): void {
			for (const component of values) {
				charge();
				if (component.type === "repeat") {
					for (let repeat = 0; repeat < component.count; repeat++) {
						charge();
						append(component.items);
					}
				} else if (component.type === "names") {
					for (const name of component.values) {
						const current = names[names.length - 1];
						charge(current.length + 1);
						if (!current.includes(name)) current.push(name);
					}
				} else {
					if (tracks.length === gridPlacementLimits.maxTracks)
						throw new AgentBrowserError(
							"resource-limit",
							"Grid track limit exceeded",
						);
					const track =
						component.type === "breadth"
							? {
									minimum: component.value.endsWith("fr")
										? "auto"
										: component.value,
									maximum: component.value,
								}
							: component.type === "minmax"
								? {
										minimum: component.minimum.value,
										maximum: component.maximum.value,
									}
								: {
										minimum: "auto",
										maximum: "max-content",
										fitContent: component.maximum.value,
									};
					tracks.push(Object.freeze(track));
					names.push([]);
				}
			}
		}
		append(components);
		return { tracks, names };
	}
	validateStyle(style);
	if (!Array.isArray(items))
		throw new AgentBrowserError("invalid-input", "Grid items must be an array");
	if (items.length > gridPlacementLimits.maxItems)
		throw new AgentBrowserError("resource-limit", "Grid item limit exceeded");
	const areas =
		parseGridAreas(style["grid-template-areas"]) ??
		unsupported("grid-template-areas");
	const flow = parseGridValue("grid-auto-flow", style["grid-auto-flow"]);
	if (!flow || !["row", "column", "row dense", "column dense"].includes(flow))
		unsupported("grid-auto-flow");
	const columnFlow = flow.startsWith("column");
	const dense = flow.endsWith("dense");
	function makeAxis(name: "rows" | "columns", areaTracks: number): Axis {
		const template =
			parseGridTrackList(style[`grid-template-${name}`]) ??
			unsupported(`grid-template-${name}`);
		const auto =
			parseGridTrackList(style[`grid-auto-${name}`], true) ??
			unsupported(`grid-auto-${name}`);
		const { tracks, names } = expand(template.items);
		const explicit = Math.max(tracks.length, areaTracks);
		while (names.length <= explicit) {
			charge();
			names.push([]);
		}
		return {
			tracks,
			names,
			namedLines: new Map(),
			pattern: expand(auto.items).tracks,
			explicit,
			start: 0,
			end: explicit,
		};
	}
	const rows = makeAxis("rows", areas.length);
	const columns = makeAxis("columns", areas[0]?.length ?? 0);
	const rectangles = new Map<
		string,
		{ top: number; bottom: number; left: number; right: number }
	>();
	for (let row = 0; row < areas.length; row++) {
		for (let column = 0; column < areas[row].length; column++) {
			charge();
			const name = areas[row][column];
			if (name === ".") continue;
			const rectangle = rectangles.get(name);
			if (rectangle) {
				rectangle.bottom = row + 1;
				rectangle.right = Math.max(rectangle.right, column + 1);
			} else
				rectangles.set(name, {
					top: row,
					bottom: row + 1,
					left: column,
					right: column + 1,
				});
		}
	}
	function addName(axis: Axis, line: number, name: string): void {
		charge(axis.names[line].length + 1);
		if (!axis.names[line].includes(name)) axis.names[line].push(name);
	}
	for (const [name, rectangle] of rectangles) {
		addName(rows, rectangle.top, `${name}-start`);
		addName(rows, rectangle.bottom, `${name}-end`);
		addName(columns, rectangle.left, `${name}-start`);
		addName(columns, rectangle.right, `${name}-end`);
	}
	for (const axis of [rows, columns]) {
		for (let line = 0; line < axis.names.length; line++) {
			charge();
			for (const name of axis.names[line]) {
				charge();
				const indexes = axis.namedLines.get(name);
				if (indexes) indexes.push(line);
				else axis.namedLines.set(name, [line]);
			}
		}
	}
	function linePosition(
		axis: Axis,
		value: Extract<GridParsedLine, { type: "line" }>,
		edge: "start" | "end",
	): number {
		charge();
		if (!value.name)
			return value.count > 0
				? value.count - 1
				: axis.explicit + 1 + value.count;
		if (value.area) {
			const area = axis.namedLines.get(`${value.name}-${edge}`);
			if (area?.length) return area[0];
		}
		const indexes = axis.namedLines.get(value.name) ?? [];
		if (value.count > 0)
			return (
				indexes[value.count - 1] ?? axis.explicit + value.count - indexes.length
			);
		return (
			indexes[indexes.length + value.count] ?? value.count + indexes.length
		);
	}
	function spanPosition(
		axis: Axis,
		anchor: number,
		value: Extract<GridParsedLine, { type: "span" }>,
		direction: number,
	): number {
		charge();
		if (!value.name) return anchor + direction * value.count;
		const indexes = axis.namedLines.get(value.name) ?? [];
		let remaining = value.count;
		for (let ordinal = 0; ordinal < indexes.length; ordinal++) {
			charge();
			const line =
				indexes[direction > 0 ? ordinal : indexes.length - ordinal - 1];
			if ((line - anchor) * direction > 0 && --remaining === 0) return line;
		}
		return direction > 0
			? Math.max(anchor, axis.explicit) + remaining
			: Math.min(anchor, 0) - remaining;
	}
	function position(
		axis: Axis,
		startValue: string,
		endValue: string,
	): Position {
		const start = parseGridLine(startValue) ?? unsupported("grid start");
		let end = parseGridLine(endValue) ?? unsupported("grid end");
		if (start.type === "span" && end.type === "span") end = { type: "auto" };
		let first =
			start.type === "line" ? linePosition(axis, start, "start") : undefined;
		let last = end.type === "line" ? linePosition(axis, end, "end") : undefined;
		if (first !== undefined && last !== undefined) {
			if (first > last) [first, last] = [last, first];
			if (first === last) last = first + 1;
		} else if (first !== undefined) {
			last =
				end.type === "span" ? spanPosition(axis, first, end, 1) : first + 1;
		} else if (last !== undefined) {
			first =
				start.type === "span" ? spanPosition(axis, last, start, -1) : last - 1;
		}
		if (first !== undefined && last !== undefined) {
			extent(axis, first, last);
			return { start: first, end: last, span: last - first };
		}
		const span =
			start.type === "span" ? start : end.type === "span" ? end : undefined;
		const count = span && !span.name ? span.count : 1;
		if (count > gridPlacementLimits.maxTracks)
			throw new AgentBrowserError("resource-limit", "Grid span limit exceeded");
		return { span: count };
	}
	const majorAxis = columnFlow ? columns : rows;
	const minorAxis = columnFlow ? rows : columns;
	const seenIds = new Set<number>();
	const ordered: Item[] = [];
	for (let index = 0; index < items.length; index++) {
		charge();
		const item = items[index];
		if (
			!item ||
			!Number.isSafeInteger(item.id) ||
			item.id < 0 ||
			seenIds.has(item.id) ||
			(item.order !== undefined && !Number.isSafeInteger(item.order))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid or duplicate grid item",
			);
		seenIds.add(item.id);
		validateStyle(item.style);
		const row = position(
			rows,
			item.style["grid-row-start"],
			item.style["grid-row-end"],
		);
		const column = position(
			columns,
			item.style["grid-column-start"],
			item.style["grid-column-end"],
		);
		ordered.push({
			id: item.id,
			order: item.order ?? 0,
			index,
			major: columnFlow ? column : row,
			minor: columnFlow ? row : column,
			placed: false,
		});
	}
	ordered.sort((left, right) => {
		charge();
		return left.order - right.order || left.index - right.index;
	});
	const occupied = new Set<number>();
	const stride = gridPlacementLimits.maxTracks * 2;
	function cellKey(major: number, minor: number): number {
		return (
			(major + gridPlacementLimits.maxTracks) * stride +
			minor +
			gridPlacementLimits.maxTracks
		);
	}
	function checkRectangle(major: number, minor: number, item: Item): void {
		charge();
		if (
			item.major.span * item.minor.span >
			gridPlacementLimits.maxOccupiedCells
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid occupied cell limit exceeded",
			);
		extent(majorAxis, major, major + item.major.span);
		extent(minorAxis, minor, minor + item.minor.span);
	}
	function fits(major: number, minor: number, item: Item): boolean {
		checkRectangle(major, minor, item);
		for (let row = major; row < major + item.major.span; row++) {
			for (let column = minor; column < minor + item.minor.span; column++) {
				charge();
				if (occupied.has(cellKey(row, column))) return false;
			}
		}
		return true;
	}
	function place(major: number, minor: number, item: Item): void {
		checkRectangle(major, minor, item);
		for (let row = major; row < major + item.major.span; row++) {
			for (let column = minor; column < minor + item.minor.span; column++) {
				charge();
				const key = cellKey(row, column);
				if (!occupied.has(key)) {
					if (occupied.size === gridPlacementLimits.maxOccupiedCells)
						throw new AgentBrowserError(
							"resource-limit",
							"Grid occupied cell limit exceeded",
						);
					occupied.add(key);
				}
			}
		}
		item.major.start = major;
		item.major.end = major + item.major.span;
		item.minor.start = minor;
		item.minor.end = minor + item.minor.span;
		item.placed = true;
	}
	for (const item of ordered) {
		charge();
		if (item.major.start !== undefined && item.minor.start !== undefined)
			place(item.major.start, item.minor.start, item);
	}
	const lockedRows = new Map<number, number>();
	for (const item of ordered) {
		charge();
		if (item.placed || item.major.start === undefined) continue;
		let minor = 0;
		if (!dense) {
			for (
				let row = item.major.start;
				row < item.major.start + item.major.span;
				row++
			) {
				charge();
				minor = Math.max(minor, lockedRows.get(row) ?? 0);
			}
		}
		while (!fits(item.major.start, minor, item)) minor++;
		place(item.major.start, minor, item);
		for (
			let row = item.major.start;
			row < item.major.start + item.major.span;
			row++
		) {
			charge();
			lockedRows.set(row, minor + item.minor.span);
		}
	}
	let largestMinorSpan = 0;
	for (const item of ordered) {
		charge();
		if (item.minor.start === undefined)
			largestMinorSpan = Math.max(largestMinorSpan, item.minor.span);
	}
	if (minorAxis.end - minorAxis.start < largestMinorSpan)
		extent(minorAxis, minorAxis.start, minorAxis.start + largestMinorSpan);
	let cursorMajor = majorAxis.start;
	let cursorMinor = minorAxis.start;
	for (const item of ordered) {
		charge();
		if (item.placed) continue;
		if (dense) {
			cursorMajor = majorAxis.start;
			cursorMinor = minorAxis.start;
		}
		if (item.minor.start !== undefined) {
			if (!dense && item.minor.start < cursorMinor) cursorMajor++;
			cursorMinor = item.minor.start;
			while (!fits(cursorMajor, cursorMinor, item)) cursorMajor++;
		} else {
			while (true) {
				charge();
				if (cursorMinor + item.minor.span > minorAxis.end) {
					cursorMinor = minorAxis.start;
					cursorMajor++;
				} else if (fits(cursorMajor, cursorMinor, item)) break;
				else cursorMinor++;
			}
		}
		place(cursorMajor, cursorMinor, item);
	}
	function finish(axis: Axis): Readonly<GridPlacedAxis> {
		const tracks: GridTrack[] = [];
		const lineNames: (readonly string[])[] = [];
		for (let line = axis.start; line <= axis.end; line++) {
			charge();
			const names = axis.names[line] ?? [];
			charge(names.length);
			lineNames.push(Object.freeze([...names]));
			if (line === axis.end) break;
			const patternIndex = line < 0 ? line : line - axis.tracks.length;
			tracks.push(
				axis.tracks[line] ??
					axis.pattern[
						((patternIndex % axis.pattern.length) + axis.pattern.length) %
							axis.pattern.length
					],
			);
		}
		return Object.freeze({
			startLine: axis.start,
			explicitTracks: axis.explicit,
			tracks: Object.freeze(tracks),
			lineNames: Object.freeze(lineNames),
		});
	}
	const resultItems = ordered.map((item) => {
		charge();
		const row = columnFlow ? item.minor : item.major;
		const column = columnFlow ? item.major : item.minor;
		if (
			row.start === undefined ||
			row.end === undefined ||
			column.start === undefined ||
			column.end === undefined
		)
			throw new AgentBrowserError("unsupported", "Unresolved grid placement");
		return Object.freeze({
			id: item.id,
			rowStart: row.start - rows.start,
			rowEnd: row.end - rows.start,
			columnStart: column.start - columns.start,
			columnEnd: column.end - columns.start,
		});
	});
	const resultRows = finish(rows);
	const resultColumns = finish(columns);
	return Object.freeze({
		rows: resultRows,
		columns: resultColumns,
		items: Object.freeze(resultItems),
		metrics: Object.freeze({ work }),
	});
}
