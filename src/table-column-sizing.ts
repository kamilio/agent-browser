import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export const tableColumnSizingLimits = Object.freeze({
	maxColumns: 4096,
	maxContributions: 4096,
	maxWork: 4_000_000,
});

export interface TableColumnContribution {
	readonly column: number;
	readonly span: number;
	readonly minContent: number;
	readonly maxContent: number;
}

export interface TableColumnSizingOptions {
	readonly availableWidth: number;
	readonly tableWidth: number | null;
	readonly borderSpacing: number;
	readonly captionMinWidth: number;
	readonly columnWidths?: readonly (number | null)[];
	readonly maxWork?: number;
}

export interface TableColumnSizing {
	readonly sizes: readonly number[];
	readonly offsets: readonly number[];
	readonly minContentWidth: number;
	readonly maxContentWidth: number;
	readonly usedWidth: number;
	readonly metrics: Readonly<{ work: number }>;
}

type Charge = (amount?: number) => void;

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function sumTracks(
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
		const next = layoutNumber(total + adjusted);
		correction = next - total - adjusted;
		total = next;
	}
	return total;
}

function growEqually(
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

function growTowardMaximum(
	sizes: number[],
	maximums: readonly number[],
	space: number,
	charge: Charge,
): void {
	const suffixSlack: number[] = [];
	let total = 0;
	let correction = 0;
	for (let index = sizes.length - 1; index >= 0; index--) {
		charge();
		const slack = maximums[index]! - sizes[index]!;
		const adjusted = slack - correction;
		const next = layoutNumber(total + adjusted);
		correction = next - total - adjusted;
		total = next;
		suffixSlack[index] = total;
	}
	let remaining = space;
	for (let index = 0; index < sizes.length; index++) {
		charge();
		const previous = sizes[index]!;
		const slack = maximums[index]! - previous;
		const suffix = suffixSlack[index]!;
		const addition =
			suffix === 0
				? 0
				: Math.min(slack, remaining, remaining * (slack / suffix));
		sizes[index] = layoutNumber(
			Math.min(maximums[index]!, previous + addition),
		);
		remaining = Math.max(0, remaining - (sizes[index]! - previous));
	}
}

export function sizeTableColumns(
	columnCount: number,
	contributions: readonly TableColumnContribution[],
	options: TableColumnSizingOptions,
): Readonly<TableColumnSizing> {
	if (
		!Number.isSafeInteger(columnCount) ||
		columnCount < 0 ||
		!Array.isArray(contributions) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		invalid("Invalid table column sizing inputs");
	if (
		columnCount > tableColumnSizingLimits.maxColumns ||
		contributions.length > tableColumnSizingLimits.maxContributions
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Table column sizing input limit exceeded",
		);
	const maxWork =
		options.maxWork === undefined
			? tableColumnSizingLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > tableColumnSizingLimits.maxWork
	)
		invalid("Invalid table column sizing work limit");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		if (amount > maxWork - work)
			throw new AgentBrowserError(
				"resource-limit",
				"Table column sizing work limit exceeded",
			);
		work += amount;
	};
	charge(6);
	const availableWidth = layoutNumber(options.availableWidth);
	const tableWidth =
		options.tableWidth === null ? null : layoutNumber(options.tableWidth);
	const spacing = layoutNumber(options.borderSpacing);
	const captionMinWidth = layoutNumber(options.captionMinWidth);
	const hints = options.columnWidths;
	if (
		hints !== undefined &&
		(!Array.isArray(hints) || hints.length !== columnCount)
	)
		invalid("Table column hints must match the column count");
	const spacingWidth = layoutNumber(
		columnCount === 0 ? 0 : (columnCount + 1) * spacing,
	);
	const minimums: number[] = [];
	const maximums: number[] = [];
	const spans: TableColumnContribution[][] = [];
	for (let index = 0; index < columnCount; index++) {
		charge(3);
		const hint =
			hints === undefined || hints[index] === null
				? 0
				: layoutNumber(hints[index]!);
		minimums.push(hint);
		maximums.push(hint);
		spans.push([]);
	}
	for (const contribution of contributions) {
		charge(5);
		if (
			!contribution ||
			typeof contribution !== "object" ||
			Array.isArray(contribution)
		)
			invalid("Invalid table column contribution");
		const { column, span, minContent, maxContent } = contribution;
		if (
			!Number.isSafeInteger(column) ||
			!Number.isSafeInteger(span) ||
			column < 0 ||
			span < 1 ||
			column >= columnCount ||
			span > columnCount - column
		)
			invalid("Invalid table column contribution span");
		layoutNumber(minContent);
		layoutNumber(maxContent);
		if (minContent > maxContent)
			invalid("Invalid table column contribution size ordering");
		if (span === 1) {
			charge(2);
			minimums[column] = Math.max(minimums[column]!, minContent);
			maximums[column] = Math.max(maximums[column]!, maxContent);
		} else {
			charge();
			spans[span - 1]!.push({ column, span, minContent, maxContent });
		}
	}
	for (let spanIndex = 1; spanIndex < spans.length; spanIndex++) {
		charge();
		for (const contribution of spans[spanIndex]!) {
			charge(3);
			const { column, span, minContent, maxContent } = contribution;
			const end = column + span;
			const internalSpacing = layoutNumber((span - 1) * spacing);
			const minimumTarget = Math.max(0, minContent - internalSpacing);
			const maximumTarget = Math.max(0, maxContent - internalSpacing);
			const minimumSum = sumTracks(minimums, column, end, charge);
			charge();
			if (minimumTarget > minimumSum)
				growEqually(minimums, column, end, minimumTarget - minimumSum, charge);
			for (let index = column; index < end; index++) {
				charge();
				maximums[index] = Math.max(maximums[index]!, minimums[index]!);
			}
			const maximumSum = sumTracks(maximums, column, end, charge);
			charge();
			if (maximumTarget > maximumSum)
				growEqually(maximums, column, end, maximumTarget - maximumSum, charge);
		}
	}
	charge(3);
	const minContentWidth = layoutNumber(
		sumTracks(minimums, 0, columnCount, charge) + spacingWidth,
	);
	const maxContentWidth = layoutNumber(
		Math.max(
			minContentWidth,
			sumTracks(maximums, 0, columnCount, charge) + spacingWidth,
		),
	);
	const usedWidth = layoutNumber(
		Math.max(
			captionMinWidth,
			minContentWidth,
			tableWidth ?? Math.min(maxContentWidth, availableWidth),
		),
	);
	const sizes: number[] = [];
	for (let index = 0; index < columnCount; index++) {
		charge();
		sizes.push(
			usedWidth >= maxContentWidth ? maximums[index]! : minimums[index]!,
		);
	}
	charge();
	if (usedWidth >= maxContentWidth)
		growEqually(sizes, 0, columnCount, usedWidth - maxContentWidth, charge);
	else if (usedWidth > minContentWidth)
		growTowardMaximum(sizes, maximums, usedWidth - minContentWidth, charge);
	const offsets: number[] = [];
	let cursor = spacing;
	let correction = 0;
	for (let index = 0; index < columnCount; index++) {
		charge();
		offsets.push(layoutNumber(cursor));
		if (index + 1 < columnCount) {
			charge(2);
			const adjustedSize = sizes[index]! - correction;
			const next = layoutNumber(cursor + adjustedSize);
			correction = next - cursor - adjustedSize;
			const adjustedSpacing = spacing - correction;
			cursor = layoutNumber(next + adjustedSpacing);
			correction = cursor - next - adjustedSpacing;
		}
	}
	charge(2 * columnCount + 2);
	return Object.freeze({
		sizes: Object.freeze(sizes),
		offsets: Object.freeze(offsets),
		minContentWidth,
		maxContentWidth,
		usedWidth,
		metrics: Object.freeze({ work }),
	});
}
