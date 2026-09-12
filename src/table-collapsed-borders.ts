import { AgentBrowserError } from "./errors.js";

export const collapsedTableBorderLimits = Object.freeze({
	maxRows: 4096,
	maxColumns: 4096,
	maxCells: 4096,
	maxEntries: 16_384,
	maxSegments: 262_144,
	maxOccupiedSlots: 262_144,
	maxWork: 4_000_000,
});

export type CollapsedTableBorderKind =
	| "cell"
	| "row"
	| "row-group"
	| "column"
	| "column-group"
	| "table";

export interface CollapsedTableBorder {
	readonly style: "none" | "hidden" | "solid";
	readonly width: number;
	readonly color: string;
}

export interface CollapsedTableBorderSides {
	readonly top: CollapsedTableBorder;
	readonly right: CollapsedTableBorder;
	readonly bottom: CollapsedTableBorder;
	readonly left: CollapsedTableBorder;
}

export interface CollapsedTableBorderCell {
	readonly id: number;
	readonly rowStart: number;
	readonly rowEnd: number;
	readonly columnStart: number;
	readonly columnEnd: number;
}

export interface CollapsedTableBorderEntry extends CollapsedTableBorderCell {
	readonly kind: CollapsedTableBorderKind;
	readonly borders: CollapsedTableBorderSides;
}

export interface CollapsedTableBorderInput {
	readonly rowCount: number;
	readonly columnCount: number;
	readonly direction?: "ltr" | "rtl";
	readonly cells: readonly CollapsedTableBorderCell[];
	readonly entries: readonly CollapsedTableBorderEntry[];
}

export interface CollapsedTableBorderOptions {
	readonly maxWork?: number;
}

export interface CollapsedTableBorderSegment {
	readonly orientation: "horizontal" | "vertical";
	readonly row: number;
	readonly column: number;
	readonly width: number;
	readonly color: string;
	readonly ownerId: number;
	readonly ownerKind: CollapsedTableBorderKind;
}

export interface CollapsedTableBorderWidths {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export interface CollapsedTableBorderCellWidths
	extends CollapsedTableBorderWidths {
	readonly id: number;
}

export interface CollapsedTableBorderResult {
	readonly segments: readonly CollapsedTableBorderSegment[];
	readonly cells: readonly CollapsedTableBorderCellWidths[];
	readonly outer: CollapsedTableBorderWidths;
	readonly metrics: Readonly<{ work: number }>;
}

interface Candidate {
	readonly entry: CollapsedTableBorderEntry;
	readonly border: CollapsedTableBorder;
}

const rolePriority: Readonly<Record<CollapsedTableBorderKind, number>> =
	Object.freeze({
		cell: 6,
		row: 5,
		"row-group": 4,
		column: 3,
		"column-group": 2,
		table: 1,
	});

type Charge = (amount?: number) => void;

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function limited(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateRectangle(
	value: unknown,
	rowCount: number,
	columnCount: number,
	identifiers: Set<number>,
	charge: Charge,
): CollapsedTableBorderCell {
	charge(6);
	if (!isRecord(value)) invalid("Invalid collapsed table border rectangle");
	const { id, rowStart, rowEnd, columnStart, columnEnd } = value;
	if (
		!nonnegativeInteger(id) ||
		identifiers.has(id) ||
		!nonnegativeInteger(rowStart) ||
		!nonnegativeInteger(rowEnd) ||
		!nonnegativeInteger(columnStart) ||
		!nonnegativeInteger(columnEnd) ||
		rowStart >= rowEnd ||
		rowEnd > rowCount ||
		columnStart >= columnEnd ||
		columnEnd > columnCount
	)
		invalid("Invalid collapsed table border identifier or bounds");
	identifiers.add(id);
	return { id, rowStart, rowEnd, columnStart, columnEnd };
}

function validateBorder(value: unknown, charge: Charge): CollapsedTableBorder {
	charge(4);
	if (!isRecord(value)) invalid("Invalid collapsed table border");
	const { style, width, color } = value;
	if (
		typeof style !== "string" ||
		typeof width !== "number" ||
		!Number.isFinite(width) ||
		width < 0 ||
		typeof color !== "string" ||
		color.length === 0
	)
		invalid("Invalid collapsed table border style, width or color");
	charge(color.length);
	if (style !== "none" && style !== "hidden" && style !== "solid")
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported collapsed table border style",
		);
	return { style, width, color };
}

function prefers(
	candidate: Candidate,
	previous: Candidate,
	direction: "ltr" | "rtl",
): boolean {
	const border = candidate.border;
	const other = previous.border;
	if ((border.style === "hidden") !== (other.style === "hidden"))
		return border.style === "hidden";
	if ((border.style === "none") !== (other.style === "none"))
		return border.style !== "none";
	if (border.style === "solid" && border.width !== other.width)
		return border.width > other.width;
	const entry = candidate.entry;
	const incumbent = previous.entry;
	if (entry.kind !== incumbent.kind)
		return rolePriority[entry.kind] > rolePriority[incumbent.kind];
	if (entry.rowStart !== incumbent.rowStart)
		return entry.rowStart < incumbent.rowStart;
	if (direction === "rtl") {
		if (entry.columnEnd !== incumbent.columnEnd)
			return entry.columnEnd > incumbent.columnEnd;
	} else if (entry.columnStart !== incumbent.columnStart) {
		return entry.columnStart < incumbent.columnStart;
	}
	return entry.id < incumbent.id;
}

function visibleWidth(candidate: Candidate | undefined): number {
	return candidate?.border.style === "solid" ? candidate.border.width : 0;
}

export function resolveCollapsedTableBorders(
	input: CollapsedTableBorderInput,
	options: CollapsedTableBorderOptions = {},
): Readonly<CollapsedTableBorderResult> {
	if (!isRecord(input) || !isRecord(options))
		invalid("Invalid collapsed table border inputs");
	const maxWork =
		options.maxWork === undefined
			? collapsedTableBorderLimits.maxWork
			: options.maxWork;
	if (
		!nonnegativeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > collapsedTableBorderLimits.maxWork
	)
		invalid("Invalid collapsed table border work limit");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxWork - work)
			limited("Collapsed table border work limit exceeded");
		work += amount;
	};
	charge(6);
	const {
		rowCount,
		columnCount,
		cells: inputCells,
		entries: inputEntries,
	} = input;
	const direction = input.direction === undefined ? "ltr" : input.direction;
	if (
		!nonnegativeInteger(rowCount) ||
		!nonnegativeInteger(columnCount) ||
		!Array.isArray(inputCells) ||
		!Array.isArray(inputEntries) ||
		(direction !== "ltr" && direction !== "rtl")
	)
		invalid("Invalid collapsed table border grid");
	if (
		rowCount > collapsedTableBorderLimits.maxRows ||
		columnCount > collapsedTableBorderLimits.maxColumns ||
		inputCells.length > collapsedTableBorderLimits.maxCells ||
		inputEntries.length > collapsedTableBorderLimits.maxEntries
	)
		limited("Collapsed table border input limit exceeded");
	const cellIds = new Set<number>();
	const cells: CollapsedTableBorderCell[] = [];
	for (const cell of inputCells) {
		charge();
		cells.push(validateRectangle(cell, rowCount, columnCount, cellIds, charge));
	}
	const entryIds = new Set<number>();
	const entries: CollapsedTableBorderEntry[] = [];
	for (const entry of inputEntries) {
		charge(3);
		const rectangle = validateRectangle(
			entry,
			rowCount,
			columnCount,
			entryIds,
			charge,
		);
		if (
			typeof entry.kind !== "string" ||
			!Object.hasOwn(rolePriority, entry.kind) ||
			!isRecord(entry.borders)
		)
			invalid("Invalid collapsed table border participant");
		const { top, right, bottom, left } = entry.borders;
		entries.push({
			...rectangle,
			kind: entry.kind,
			borders: {
				top: validateBorder(top, charge),
				right: validateBorder(right, charge),
				bottom: validateBorder(bottom, charge),
				left: validateBorder(left, charge),
			},
		});
	}
	const occupied = new Map<number, number>();
	for (const cell of cells) {
		charge();
		for (let row = cell.rowStart; row < cell.rowEnd; row++) {
			charge();
			for (let column = cell.columnStart; column < cell.columnEnd; column++) {
				charge(3);
				const key = row * columnCount + column;
				if (occupied.has(key)) invalid("Overlapping collapsed table cells");
				if (occupied.size >= collapsedTableBorderLimits.maxOccupiedSlots)
					limited("Collapsed table occupied slot limit exceeded");
				occupied.set(key, cell.id);
			}
		}
	}
	const horizontal = new Map<number, Candidate>();
	const vertical = new Map<number, Candidate>();
	const stride = columnCount + 1;
	function add(
		orientation: CollapsedTableBorderSegment["orientation"],
		row: number,
		column: number,
		candidate: Candidate,
	): void {
		charge(4);
		const isHorizontal = orientation === "horizontal";
		if (
			isHorizontal
				? row > 0 && row < rowCount
				: column > 0 && column < columnCount
		) {
			const after = row * columnCount + column;
			const before = after - (isHorizontal ? columnCount : 1);
			const owner = occupied.get(before);
			if (owner !== undefined && owner === occupied.get(after)) return;
		}
		const edges = isHorizontal ? horizontal : vertical;
		const key = row * stride + column;
		const previous = edges.get(key);
		if (!previous) {
			charge(2);
			if (
				horizontal.size + vertical.size >=
				collapsedTableBorderLimits.maxSegments
			)
				limited("Collapsed table border segment limit exceeded");
			edges.set(key, candidate);
		} else {
			charge();
			if (prefers(candidate, previous, direction)) edges.set(key, candidate);
		}
	}
	for (const entry of entries) {
		charge(5);
		const top = { entry, border: entry.borders.top };
		const right = { entry, border: entry.borders.right };
		const bottom = { entry, border: entry.borders.bottom };
		const left = { entry, border: entry.borders.left };
		for (let column = entry.columnStart; column < entry.columnEnd; column++) {
			charge();
			add("horizontal", entry.rowStart, column, top);
			add("horizontal", entry.rowEnd, column, bottom);
		}
		for (let row = entry.rowStart; row < entry.rowEnd; row++) {
			charge();
			add("vertical", row, entry.columnStart, left);
			add("vertical", row, entry.columnEnd, right);
		}
	}
	const segments: CollapsedTableBorderSegment[] = [];
	const outer = { top: 0, right: 0, bottom: 0, left: 0 };
	for (const orientation of ["horizontal", "vertical"] as const) {
		charge();
		const edges = orientation === "horizontal" ? horizontal : vertical;
		for (const [key, candidate] of edges) {
			charge(3);
			const width = visibleWidth(candidate);
			if (width <= 0) continue;
			const row = Math.floor(key / stride);
			const column = key % stride;
			charge(2);
			segments.push(
				Object.freeze({
					orientation,
					row,
					column,
					width,
					color: candidate.border.color,
					ownerId: candidate.entry.id,
					ownerKind: candidate.entry.kind,
				}),
			);
			if (orientation === "horizontal") {
				if (row === 0) outer.top = Math.max(outer.top, width / 2);
				if (row === rowCount) outer.bottom = Math.max(outer.bottom, width / 2);
			} else {
				if (column === 0) outer.left = Math.max(outer.left, width / 2);
				if (column === columnCount)
					outer.right = Math.max(outer.right, width / 2);
			}
		}
	}
	segments.sort((first, second) => {
		charge();
		if (first.orientation !== second.orientation)
			return first.orientation === "horizontal" ? -1 : 1;
		return first.row - second.row || first.column - second.column;
	});
	const widths: CollapsedTableBorderCellWidths[] = [];
	for (const cell of cells) {
		charge(2);
		let top = 0;
		let right = 0;
		let bottom = 0;
		let left = 0;
		for (let column = cell.columnStart; column < cell.columnEnd; column++) {
			charge(3);
			top = Math.max(
				top,
				visibleWidth(horizontal.get(cell.rowStart * stride + column)) / 2,
			);
			bottom = Math.max(
				bottom,
				visibleWidth(horizontal.get(cell.rowEnd * stride + column)) / 2,
			);
		}
		for (let row = cell.rowStart; row < cell.rowEnd; row++) {
			charge(3);
			left = Math.max(
				left,
				visibleWidth(vertical.get(row * stride + cell.columnStart)) / 2,
			);
			right = Math.max(
				right,
				visibleWidth(vertical.get(row * stride + cell.columnEnd)) / 2,
			);
		}
		widths.push(Object.freeze({ id: cell.id, top, right, bottom, left }));
	}
	charge(5);
	return Object.freeze({
		segments: Object.freeze(segments),
		cells: Object.freeze(widths),
		outer: Object.freeze(outer),
		metrics: Object.freeze({ work }),
	});
}
