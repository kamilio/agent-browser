import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export const tableRowSizingLimits = Object.freeze({
	maxRows: 4096,
	maxContributions: 4096,
	maxWork: 4_000_000,
});

export interface TableRowContribution {
	readonly id: number;
	readonly row: number;
	readonly span: number;
	readonly height: number;
	readonly baseline: number | null;
	readonly verticalAlign: "baseline" | "top" | "middle" | "bottom";
}

export interface TableRowSizingOptions {
	readonly borderSpacing: number;
	readonly tableHeight: number | null;
	readonly rowHeights?: readonly (number | null)[];
	readonly maxWork?: number;
}

export interface TableRowCellSizing {
	readonly id: number;
	readonly areaHeight: number;
	readonly offset: number;
}

export interface TableRowSizing {
	readonly sizes: readonly number[];
	readonly offsets: readonly number[];
	readonly baselines: readonly (number | null)[];
	readonly cells: readonly TableRowCellSizing[];
	readonly naturalHeight: number;
	readonly usedHeight: number;
	readonly metrics: Readonly<{ work: number }>;
}

interface PreparedContribution extends TableRowContribution {
	baselineOffset: number;
	requiredHeight: number;
}

type Charge = (amount?: number) => void;

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function sumRows(
	sizes: readonly number[],
	start: number,
	end: number,
	charge: Charge,
): number {
	let total = 0;
	let correction = 0;
	for (let index = start; index < end; index++) {
		charge();
		const adjusted = sizes[index]! - correction;
		const next = layoutNumber(Math.max(0, total + adjusted));
		correction = next - total - adjusted;
		total = next;
	}
	return total;
}

function growRows(
	sizes: number[],
	start: number,
	end: number,
	space: number,
	charge: Charge,
): void {
	let remaining = space;
	for (let index = start; index < end; index++) {
		charge();
		const previous = sizes[index]!;
		const addition = remaining / (end - index);
		sizes[index] = layoutNumber(previous + addition);
		remaining = Math.max(0, remaining - (sizes[index]! - previous));
	}
}

export function sizeTableRows(
	rowCount: number,
	contributions: readonly TableRowContribution[],
	options: TableRowSizingOptions,
): Readonly<TableRowSizing> {
	if (
		!Number.isSafeInteger(rowCount) ||
		rowCount < 0 ||
		!Array.isArray(contributions) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		invalid("Invalid table row sizing inputs");
	if (
		rowCount > tableRowSizingLimits.maxRows ||
		contributions.length > tableRowSizingLimits.maxContributions
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Table row sizing input limit exceeded",
		);
	const maxWork =
		options.maxWork === undefined
			? tableRowSizingLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > tableRowSizingLimits.maxWork
	)
		invalid("Invalid table row sizing work limit");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		if (amount > maxWork - work)
			throw new AgentBrowserError(
				"resource-limit",
				"Table row sizing work limit exceeded",
			);
		work += amount;
	};
	charge(4);
	const spacing = layoutNumber(options.borderSpacing);
	const tableHeight =
		options.tableHeight === null ? null : layoutNumber(options.tableHeight);
	const hints = options.rowHeights;
	if (
		hints !== undefined &&
		(!Array.isArray(hints) || hints.length !== rowCount)
	)
		invalid("Table row hints must match the row count");
	const spacingHeight = layoutNumber(
		rowCount === 0 ? 0 : (rowCount + 1) * spacing,
	);
	const sizes: number[] = [];
	const baselines: (number | null)[] = [];
	const spans: PreparedContribution[][] = [];
	for (let index = 0; index < rowCount; index++) {
		charge(3);
		sizes.push(
			hints === undefined || hints[index] === null
				? 0
				: layoutNumber(hints[index]!),
		);
		baselines.push(null);
		spans.push([]);
	}
	const prepared: PreparedContribution[] = [];
	const identifiers = new Set<number>();
	for (const contribution of contributions) {
		charge(9);
		if (
			!contribution ||
			typeof contribution !== "object" ||
			Array.isArray(contribution)
		)
			invalid("Invalid table row contribution");
		const { id, row, span, height, baseline, verticalAlign } = contribution;
		if (
			!Number.isSafeInteger(id) ||
			id < 0 ||
			identifiers.has(id) ||
			!Number.isSafeInteger(row) ||
			!Number.isSafeInteger(span) ||
			row < 0 ||
			span < 1 ||
			row >= rowCount ||
			span > rowCount - row
		)
			invalid("Invalid table row contribution identifier or span");
		const naturalHeight = layoutNumber(height);
		const cellBaseline =
			baseline === null ? null : layoutNumber(baseline, true);
		if (
			verticalAlign !== "baseline" &&
			verticalAlign !== "top" &&
			verticalAlign !== "middle" &&
			verticalAlign !== "bottom"
		)
			invalid("Invalid table cell vertical alignment");
		identifiers.add(id);
		prepared.push({
			id,
			row,
			span,
			height: naturalHeight,
			baseline: cellBaseline,
			verticalAlign,
			baselineOffset: 0,
			requiredHeight: naturalHeight,
		});
		if (verticalAlign === "baseline") {
			charge();
			baselines[row] = Math.max(
				baselines[row] ?? 0,
				cellBaseline ?? naturalHeight,
			);
		}
	}
	for (let index = 0; index < rowCount; index++) {
		charge();
		sizes[index] = Math.max(sizes[index]!, baselines[index] ?? 0);
	}
	for (const contribution of prepared) {
		charge(4);
		const { row, span, height, baseline, verticalAlign } = contribution;
		contribution.baselineOffset =
			verticalAlign === "baseline"
				? layoutNumber(Math.max(0, baselines[row]! - (baseline ?? height)))
				: 0;
		contribution.requiredHeight = layoutNumber(
			height + contribution.baselineOffset,
		);
		if (span === 1)
			sizes[row] = Math.max(sizes[row]!, contribution.requiredHeight);
		else spans[span - 1]!.push(contribution);
	}
	for (let spanIndex = 1; spanIndex < spans.length; spanIndex++) {
		charge();
		for (const contribution of spans[spanIndex]!) {
			charge(3);
			const { row, span, requiredHeight } = contribution;
			const end = row + span;
			const internalSpacing = layoutNumber((span - 1) * spacing);
			const target = Math.max(0, requiredHeight - internalSpacing);
			const coveredHeight = sumRows(sizes, row, end, charge);
			if (target > coveredHeight)
				growRows(sizes, row, end, target - coveredHeight, charge);
		}
	}
	charge(3);
	const naturalHeight = layoutNumber(
		sumRows(sizes, 0, rowCount, charge) + spacingHeight,
	);
	const usedHeight = layoutNumber(Math.max(naturalHeight, tableHeight ?? 0));
	if (rowCount > 0 && usedHeight > naturalHeight)
		growRows(sizes, 0, rowCount, usedHeight - naturalHeight, charge);
	const offsets: number[] = [];
	let cursor = spacing;
	let correction = 0;
	for (let index = 0; index < rowCount; index++) {
		charge();
		offsets.push(layoutNumber(cursor));
		if (index + 1 < rowCount) {
			charge(2);
			const adjustedSize = sizes[index]! - correction;
			const next = layoutNumber(Math.max(cursor, cursor + adjustedSize));
			correction = next - cursor - adjustedSize;
			const adjustedSpacing = spacing - correction;
			cursor = layoutNumber(Math.max(next, next + adjustedSpacing));
			correction = cursor - next - adjustedSpacing;
		}
	}
	const cells: TableRowCellSizing[] = [];
	for (const contribution of prepared) {
		charge(5);
		const { id, row, span, height, verticalAlign, baselineOffset } =
			contribution;
		const areaHeight = layoutNumber(
			sumRows(sizes, row, row + span, charge) + (span - 1) * spacing,
		);
		const free = Math.max(0, areaHeight - height);
		const offset = layoutNumber(
			verticalAlign === "baseline"
				? baselineOffset
				: verticalAlign === "bottom"
					? free
					: verticalAlign === "middle"
						? free / 2
						: 0,
		);
		cells.push(Object.freeze({ id, areaHeight, offset }));
	}
	charge(3 * rowCount + cells.length + 6);
	return Object.freeze({
		sizes: Object.freeze(sizes),
		offsets: Object.freeze(offsets),
		baselines: Object.freeze(baselines),
		cells: Object.freeze(cells),
		naturalHeight,
		usedHeight,
		metrics: Object.freeze({ work }),
	});
}
