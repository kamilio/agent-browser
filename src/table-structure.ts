import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { lengthHasPercentage } from "./css-math.js";
import { initialTableStyle } from "./css-table.js";
import { AgentBrowserError } from "./errors.js";
import type { FormattingTree } from "./formatting-tree.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	placeTableCells,
	type TableSlotGroupInput,
} from "./table-slot-placement.js";

export function tableStructure(
	formatting: FormattingTree,
	rootId: number,
	maxWork: number,
) {
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Table structure work limit exceeded",
			);
	};
	const root = formatting.nodes[rootId];
	if (!root || root.contentMode !== "table" || root.level !== "block")
		throw new AgentBrowserError(
			"unsupported",
			"Table layout requires a block table",
		);
	const style = root.table ?? initialTableStyle;
	if (
		style["border-collapse"] !== "separate" ||
		style["table-layout"] !== "auto"
	)
		throw new AgentBrowserError(
			"unsupported",
			"Only separate-border automatic tables are supported",
		);
	const spacing = style["border-spacing"]
		.split(" ")
		.map((value) => layoutNumber(resolveLayoutLength(value, 0)));
	const groups: TableSlotGroupInput[] = [];
	const captions: number[] = [];
	let header: TableSlotGroupInput | undefined;
	let footer: TableSlotGroupInput | undefined;
	for (const groupId of root.children) {
		charge();
		const group = formatting.nodes[groupId];
		if (group.display === "table-caption") {
			captions.push(groupId);
			continue;
		}
		if (
			!["table-row-group", "table-header-group", "table-footer-group"].includes(
				group.display ?? "",
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported table child role",
			);
		const entry: TableSlotGroupInput = {
			id: groupId,
			rows: group.children.map((rowId) => {
				charge();
				const row = formatting.nodes[rowId];
				if (row.display !== "table-row")
					throw new AgentBrowserError(
						"unsupported",
						"Unsupported table group child",
					);
				return {
					id: rowId,
					cells: row.children.map((cellId) => {
						charge();
						const cell = formatting.nodes[cellId];
						if (cell.display !== "table-cell")
							throw new AgentBrowserError(
								"unsupported",
								"Unsupported table row child",
							);
						const box = cell.box ?? initialBoxStyle;
						if (
							[
								"width",
								"min-width",
								"max-width",
								"height",
								"min-height",
								"max-height",
								"padding-top",
								"padding-right",
								"padding-bottom",
								"padding-left",
							].some((name) =>
								lengthHasPercentage(box[name as keyof typeof box]),
							)
						)
							throw new AgentBrowserError(
								"unsupported",
								"Percentage table cell sizing is not supported",
							);
						return {
							id: cellId,
							columnSpan: cell.tableSpan?.columns ?? 1,
							rowSpan: cell.tableSpan?.rows ?? 1,
						};
					}),
				};
			}),
		};
		if (group.display === "table-header-group" && !header) header = entry;
		else if (group.display === "table-footer-group" && !footer) footer = entry;
		else groups.push(entry);
	}
	if (header) groups.unshift(header);
	if (footer) groups.push(footer);
	const placement = placeTableCells(groups, {
		maxWork: Math.min(4_000_000, Math.max(1, maxWork - work)),
	});
	charge(placement.metrics.work);
	return Object.freeze({
		placement,
		captions: Object.freeze(captions),
		spacing: Object.freeze({
			horizontal: spacing[0],
			vertical: spacing[1] ?? spacing[0],
		}),
		metrics: Object.freeze({ work }),
	});
}

export function tableColumnContributions(
	formatting: FormattingTree,
	placement: ReturnType<typeof placeTableCells>,
	widths: ReadonlyMap<number, Readonly<IntrinsicWidth>>,
	charge: (amount?: number) => void,
) {
	return placement.cells.map((cell) => {
		charge();
		const measured = widths.get(cell.id);
		if (!measured)
			throw new AgentBrowserError(
				"unsupported",
				"Missing intrinsic table cell",
			);
		const style = formatting.nodes[cell.id].box ?? initialBoxStyle;
		const borders = resolveBorders(style);
		const edges = layoutNumber(
			borders.borderLeft +
				borders.borderRight +
				resolveLayoutLength(style["padding-left"], 0) +
				resolveLayoutLength(style["padding-right"], 0),
		);
		const minContent = layoutNumber(
			Math.max(measured.minContent + edges, measured.minContribution),
		);
		const maxContent = layoutNumber(
			Math.max(
				minContent,
				measured.maxContent + edges,
				measured.maxContribution,
			),
		);
		return Object.freeze({
			column: cell.columnStart,
			span: cell.columnEnd - cell.columnStart,
			minContent,
			maxContent,
		});
	});
}
