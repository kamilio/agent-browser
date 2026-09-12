import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import type { CollapsedTableFormatting } from "./table-collapsed-formatting.js";
import type { CollapsedTableBorderPaint } from "./table-collapsed-raster.js";
import type { TableColumnSizing } from "./table-column-sizing.js";
import type { TableRowSizing } from "./table-row-sizing.js";

const priority = Object.freeze({
	table: 0,
	"column-group": 1,
	column: 2,
	"row-group": 3,
	row: 4,
	cell: 5,
});

export function projectCollapsedTableBorders(
	formatting: CollapsedTableFormatting,
	columns: TableColumnSizing,
	rows: TableRowSizing,
	charge: (amount?: number) => void,
): readonly CollapsedTableBorderPaint[] {
	const { placement, segments } = formatting;
	if (
		columns.sizes.length !== placement.columnCount ||
		rows.sizes.length !== placement.rowCount
	)
		throw new AgentBrowserError(
			"unsupported",
			"Collapsed border tracks do not match table slots",
		);
	const vertices = new Map<number, { horizontal: number; vertical: number }>();
	const stride = placement.columnCount + 1;
	for (const segment of segments) {
		charge(3);
		const first = segment.row * stride + segment.column;
		const second =
			segment.orientation === "horizontal" ? first + 1 : first + stride;
		for (const key of [first, second]) {
			const vertex = vertices.get(key) ?? { horizontal: 0, vertical: 0 };
			vertex[segment.orientation] = Math.max(
				vertex[segment.orientation],
				segment.width,
			);
			vertices.set(key, vertex);
		}
	}
	const ordered = [...segments];
	charge(ordered.length);
	ordered.sort((first, second) => {
		charge();
		return (
			first.width - second.width ||
			priority[first.ownerKind] - priority[second.ownerKind] ||
			second.row - first.row ||
			second.column - first.column ||
			second.ownerId - first.ownerId ||
			Number(first.orientation === "horizontal") -
				Number(second.orientation === "horizontal")
		);
	});
	const coordinate = (
		index: number,
		offsets: readonly number[],
		count: number,
		extent: number,
	) => {
		const value = index === count ? extent : offsets[index];
		if (value === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Missing collapsed border grid coordinate",
			);
		return value;
	};
	return Object.freeze(
		ordered.map((segment) => {
			charge(3);
			const horizontal = segment.orientation === "horizontal";
			const firstKey = segment.row * stride + segment.column;
			const secondKey = horizontal ? firstKey + 1 : firstKey + stride;
			const cross = horizontal ? "vertical" : "horizontal";
			const before = (vertices.get(firstKey)?.[cross] ?? 0) / 2;
			const after = (vertices.get(secondKey)?.[cross] ?? 0) / 2;
			const left = coordinate(
				segment.column,
				columns.offsets,
				placement.columnCount,
				columns.usedWidth,
			);
			const top = coordinate(
				segment.row,
				rows.offsets,
				placement.rowCount,
				rows.usedHeight,
			);
			const end = horizontal
				? coordinate(
						segment.column + 1,
						columns.offsets,
						placement.columnCount,
						columns.usedWidth,
					)
				: coordinate(
						segment.row + 1,
						rows.offsets,
						placement.rowCount,
						rows.usedHeight,
					);
			return Object.freeze({
				x: layoutNumber(left - (horizontal ? before : segment.width / 2), true),
				y: layoutNumber(top - (horizontal ? segment.width / 2 : before), true),
				width: horizontal
					? layoutNumber(end - left + before + after)
					: segment.width,
				height: horizontal
					? segment.width
					: layoutNumber(end - top + before + after),
				color: segment.color,
				ownerId: segment.ownerId,
			});
		}),
	);
}
