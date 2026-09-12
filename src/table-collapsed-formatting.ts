import { borderSides, type BorderSide } from "./css-border.js";
import { initialBoxStyle, type BoxStyle } from "./css-box.js";
import { initialPaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import type { FormattingNode } from "./formatting-tree.js";
import { resolveLayoutLength } from "./layout-values.js";
import type { Rgba } from "./raster.js";
import {
	resolveCollapsedTableBorders,
	type CollapsedTableBorder,
	type CollapsedTableBorderEntry,
	type CollapsedTableBorderSegment,
} from "./table-collapsed-borders.js";
import type { TableSlotPlacement } from "./table-slot-placement.js";
import { tableStructure } from "./table-structure.js";

export interface CollapsedTableFormatting {
	readonly placement: TableSlotPlacement;
	readonly segments: readonly Readonly<
		Omit<CollapsedTableBorderSegment, "color"> & { color: Rgba }
	>[];
}

const noBorders = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function usedBorderBox(
	style: BoxStyle,
	widths: Readonly<Record<(typeof borderSides)[number], number>>,
	table: boolean,
): BoxStyle {
	const result = { ...style };
	for (const side of borderSides) {
		result[`border-${side}-width`] = `${widths[side]}px`;
		result[`border-${side}-style`] = widths[side] > 0 ? "solid" : "none";
		if (table) result[`padding-${side}`] = "0px";
	}
	return Object.freeze(result);
}

export function applyCollapsedTableBorders(
	nodes: FormattingNode[],
	maxWork: number,
) {
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Collapsed table formatting work limit exceeded",
			);
	};
	const resolvedRefs = new Set<string>();
	for (const root of nodes) {
		charge();
		if (
			root.contentMode !== "table" ||
			root.table?.["border-collapse"] !== "collapse"
		)
			continue;
		try {
			const structure = tableStructure(
				{ nodes },
				root.id,
				Math.max(1, maxWork - work),
			);
			charge(structure.metrics.work);
			const { placement } = structure;
			const entries: CollapsedTableBorderEntry[] = [];
			const colors = new Map<string, Rgba>();
			const participants = new Set<number>();
			const add = (
				id: number,
				kind: CollapsedTableBorderEntry["kind"],
				rowStart: number,
				rowEnd: number,
				columnStart: number,
				columnEnd: number,
			) => {
				charge(5);
				const node = nodes[id];
				const box = node.box ?? initialBoxStyle;
				const paint = node.paint ?? initialPaintStyle;
				const border = (side: BorderSide): CollapsedTableBorder => {
					const value = box[`border-${side}-width`];
					if (!value.endsWith("px"))
						throw new AgentBrowserError(
							"unsupported",
							"Collapsed borders require computed pixel widths",
						);
					const style = box[`border-${side}-style`];
					if (style !== "none" && style !== "hidden" && style !== "solid")
						throw new AgentBrowserError(
							"unsupported",
							"Unsupported collapsed border style",
						);
					const color = paint[`border-${side}-color`] ?? paint.color;
					const token = JSON.stringify(color);
					colors.set(token, Object.freeze([...color]) as Rgba);
					return { style, width: resolveLayoutLength(value, 0), color: token };
				};
				const borders: CollapsedTableBorderEntry["borders"] = {
					top: border("top"),
					right: border("right"),
					bottom: border("bottom"),
					left: border("left"),
				};
				participants.add(id);
				if (rowStart === rowEnd || columnStart === columnEnd) {
					if (
						borderSides.some(
							(side) =>
								borders[side].style === "solid" && borders[side].width > 0,
						)
					)
						throw new AgentBrowserError(
							"unsupported",
							"Collapsed borders on an empty table grid are not supported",
						);
					return;
				}
				entries.push({
					id,
					kind,
					rowStart,
					rowEnd,
					columnStart,
					columnEnd,
					borders,
				});
			};
			add(root.id, "table", 0, placement.rowCount, 0, placement.columnCount);
			for (const group of placement.groups) {
				charge();
				if (group.id !== null)
					add(
						group.id,
						"row-group",
						group.rowStart,
						group.rowEnd,
						0,
						placement.columnCount,
					);
			}
			for (const row of placement.rows) {
				charge();
				if (row.id !== null)
					add(
						row.id,
						"row",
						row.index,
						row.index + 1,
						0,
						placement.columnCount,
					);
			}
			for (const cell of placement.cells) {
				charge();
				add(
					cell.id,
					"cell",
					cell.rowStart,
					cell.rowEnd,
					cell.columnStart,
					cell.columnEnd,
				);
			}
			const resolved = resolveCollapsedTableBorders(
				{
					rowCount: placement.rowCount,
					columnCount: placement.columnCount,
					cells: placement.cells,
					entries,
				},
				{ maxWork: Math.min(4_000_000, Math.max(1, maxWork - work)) },
			);
			charge(resolved.metrics.work + resolved.cells.length);
			const cells = new Map(resolved.cells.map((cell) => [cell.id, cell]));
			const segments = Object.freeze(
				resolved.segments.map((segment) => {
					charge();
					const color = colors.get(segment.color);
					if (!color)
						throw new AgentBrowserError(
							"unsupported",
							"Missing collapsed border color",
						);
					return Object.freeze({ ...segment, color });
				}),
			);
			for (const id of participants) {
				charge();
				const node = nodes[id];
				node.box = usedBorderBox(
					node.box ?? initialBoxStyle,
					id === root.id ? resolved.outer : (cells.get(id) ?? noBorders),
					id === root.id,
				);
				node.collapsedBorderOwner = root.id;
				if (node.ref) resolvedRefs.add(node.ref);
			}
			root.collapsedTable = Object.freeze({ placement, segments });
		} catch (error) {
			if (!(error instanceof AgentBrowserError) || error.code !== "unsupported")
				throw error;
		}
	}
	return { resolvedRefs, work };
}
