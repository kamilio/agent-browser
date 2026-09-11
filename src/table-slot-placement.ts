import { AgentBrowserError } from "./errors.js";

export const tableSlotPlacementLimits = Object.freeze({
	maxRows: 4096,
	maxColumns: 4096,
	maxCells: 4096,
	maxGroups: 4096,
	maxOccupiedSlots: 262_144,
	maxWork: 4_000_000,
});

export interface TableSlotCellInput {
	readonly id: number;
	readonly columnSpan: number;
	readonly rowSpan: number;
}

export interface TableSlotRowInput {
	readonly id: number;
	readonly cells: readonly TableSlotCellInput[];
}

export interface TableSlotGroupInput {
	readonly id: number | null;
	readonly rows: readonly TableSlotRowInput[];
}

export interface TableSlotPlacementOptions {
	readonly maxWork?: number;
}

export interface TableSlotCell {
	readonly id: number;
	readonly columnStart: number;
	readonly columnEnd: number;
	readonly rowStart: number;
	readonly rowEnd: number;
}

export interface TableSlotRow {
	readonly id: number | null;
	readonly index: number;
}

export interface TableSlotGroup {
	readonly id: number | null;
	readonly rowStart: number;
	readonly rowEnd: number;
}

export interface TableSlotPlacement {
	readonly cells: readonly TableSlotCell[];
	readonly rows: readonly TableSlotRow[];
	readonly groups: readonly TableSlotGroup[];
	readonly columnCount: number;
	readonly rowCount: number;
	readonly metrics: Readonly<{ work: number }>;
}

interface ValidatedGroup extends TableSlotGroupInput {
	readonly rowStart: number;
	readonly rowEnd: number;
}

interface GrowingCell {
	id: number;
	columnStart: number;
	columnEnd: number;
	rowStart: number;
	rowEnd: number;
}

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

function validateGroups(
	groups: readonly TableSlotGroupInput[],
	charge: Charge,
): ValidatedGroup[] {
	const identifiers = new Set<number>();
	const validated: ValidatedGroup[] = [];
	let cellCount = 0;
	let rowCount = 0;
	function identifier(value: unknown): number {
		charge();
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
			invalid("Table IDs must be nonnegative safe integers");
		if (identifiers.has(value)) invalid("Table IDs must be globally unique");
		identifiers.add(value);
		return value;
	}
	for (const group of groups) {
		charge(3);
		if (!isRecord(group)) invalid("Invalid table group");
		const groupId = group.id === null ? null : identifier(group.id);
		const inputRows = group.rows;
		if (!Array.isArray(inputRows)) invalid("Table group rows must be an array");
		if (inputRows.length > tableSlotPlacementLimits.maxRows - rowCount)
			limited("Table row limit exceeded");
		const rows: TableSlotRowInput[] = [];
		let rowEnd = rowCount + inputRows.length;
		for (let rowIndex = 0; rowIndex < inputRows.length; rowIndex++) {
			charge(3);
			const row = inputRows[rowIndex];
			if (!isRecord(row)) invalid("Invalid table row");
			const rowId = identifier(row.id);
			const inputCells = row.cells;
			if (!Array.isArray(inputCells))
				invalid("Table row cells must be an array");
			if (inputCells.length > tableSlotPlacementLimits.maxCells - cellCount)
				limited("Table cell limit exceeded");
			cellCount += inputCells.length;
			const cells: TableSlotCellInput[] = [];
			for (const cell of inputCells) {
				charge(4);
				if (!isRecord(cell)) invalid("Invalid table cell");
				const cellId = identifier(cell.id);
				const columnSpan = cell.columnSpan;
				const rowSpan = cell.rowSpan;
				if (
					typeof columnSpan !== "number" ||
					!Number.isInteger(columnSpan) ||
					columnSpan < 1 ||
					columnSpan > 1000 ||
					typeof rowSpan !== "number" ||
					!Number.isInteger(rowSpan) ||
					rowSpan < 0 ||
					rowSpan > 65_534
				)
					invalid("Invalid table cell span");
				const height = Math.max(1, rowSpan);
				const cellRowEnd = rowCount + rowIndex + height;
				if (cellRowEnd > tableSlotPlacementLimits.maxRows)
					limited("Table row limit exceeded");
				if (columnSpan * height > tableSlotPlacementLimits.maxOccupiedSlots)
					limited("Table occupied slot limit exceeded");
				rowEnd = Math.max(rowEnd, cellRowEnd);
				cells.push({ id: cellId, columnSpan, rowSpan });
			}
			rows.push({ id: rowId, cells });
		}
		validated.push({ id: groupId, rows, rowStart: rowCount, rowEnd });
		rowCount = rowEnd;
	}
	return validated;
}

export function placeTableCells(
	groups: readonly TableSlotGroupInput[],
	options: TableSlotPlacementOptions = {},
): Readonly<TableSlotPlacement> {
	if (!Array.isArray(groups) || !isRecord(options))
		invalid("Invalid table slot placement inputs");
	if (groups.length > tableSlotPlacementLimits.maxGroups)
		limited("Table group limit exceeded");
	const maxWork =
		options.maxWork === undefined
			? tableSlotPlacementLimits.maxWork
			: options.maxWork;
	if (
		typeof maxWork !== "number" ||
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > tableSlotPlacementLimits.maxWork
	)
		invalid("Invalid table slot placement work limit");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		if (amount > maxWork - work)
			limited("Table slot placement work limit exceeded");
		work += amount;
	};
	charge(3);
	const validated = validateGroups(groups, charge);
	const occupied = new Set<number>();
	const cells: GrowingCell[] = [];
	const rows: TableSlotRow[] = [];
	const placedGroups: TableSlotGroup[] = [];
	let columnCount = 0;
	function fill(
		columnStart: number,
		columnEnd: number,
		rowStart: number,
		rowEnd: number,
	): void {
		charge();
		if (columnEnd > tableSlotPlacementLimits.maxColumns)
			limited("Table column limit exceeded");
		if (rowEnd > tableSlotPlacementLimits.maxRows)
			limited("Table row limit exceeded");
		const height = rowEnd - rowStart;
		const area = (columnEnd - columnStart) * height;
		if (area > tableSlotPlacementLimits.maxOccupiedSlots - occupied.size)
			limited("Table occupied slot limit exceeded");
		charge(height + area * 2);
		for (let rowIndex = rowStart; rowIndex < rowEnd; rowIndex++) {
			for (
				let columnIndex = columnStart;
				columnIndex < columnEnd;
				columnIndex++
			) {
				const slot =
					rowIndex * tableSlotPlacementLimits.maxColumns + columnIndex;
				if (occupied.has(slot))
					throw new AgentBrowserError(
						"unsupported",
						"Unsupported table-model overlap",
					);
				occupied.add(slot);
			}
		}
	}
	for (const group of validated) {
		charge(3);
		const downward: GrowingCell[] = [];
		for (let rowIndex = group.rowStart; rowIndex < group.rowEnd; rowIndex++) {
			charge(3);
			const row = group.rows[rowIndex - group.rowStart];
			rows.push(Object.freeze({ id: row?.id ?? null, index: rowIndex }));
			for (const cell of downward) {
				charge(2);
				fill(cell.columnStart, cell.columnEnd, rowIndex, rowIndex + 1);
				cell.rowEnd = rowIndex + 1;
			}
			if (!row) continue;
			let cursor = 0;
			for (const input of row.cells) {
				charge(3);
				while (true) {
					charge();
					if (cursor >= tableSlotPlacementLimits.maxColumns)
						limited("Table column limit exceeded");
					if (
						!occupied.has(
							rowIndex * tableSlotPlacementLimits.maxColumns + cursor,
						)
					)
						break;
					cursor++;
				}
				const columnEnd = cursor + input.columnSpan;
				const rowEnd = rowIndex + Math.max(1, input.rowSpan);
				fill(cursor, columnEnd, rowIndex, rowEnd);
				const cell: GrowingCell = {
					id: input.id,
					columnStart: cursor,
					columnEnd,
					rowStart: rowIndex,
					rowEnd,
				};
				cells.push(cell);
				if (input.rowSpan === 0) {
					charge();
					downward.push(cell);
				}
				columnCount = Math.max(columnCount, columnEnd);
				cursor = columnEnd;
			}
		}
		placedGroups.push(
			Object.freeze({
				id: group.id,
				rowStart: group.rowStart,
				rowEnd: group.rowEnd,
			}),
		);
	}
	charge(cells.length * 2 + rows.length + placedGroups.length + 6);
	return Object.freeze({
		cells: Object.freeze(cells.map((cell) => Object.freeze({ ...cell }))),
		rows: Object.freeze(rows),
		groups: Object.freeze(placedGroups),
		columnCount,
		rowCount: rows.length,
		metrics: Object.freeze({ work }),
	});
}
