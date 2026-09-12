import { resolveBlockWidth } from "./block-width.js";
import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { lengthHasPercentage } from "./css-math.js";
import { initialTableStyle } from "./css-table.js";
import { documentLayoutLimits, type DocumentBox } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingFlexFlow } from "./flex-document.js";
import {
	collectFlexBaselines,
	placeFlexLayout,
	type FlexPlacement,
} from "./flex-placement.js";
import {
	formattingLimits,
	isAdvisoryFormattingIssue,
	resolveFormattingBlockWidths,
	type BlockReflowRoot,
	type FormattingTree,
} from "./formatting-tree.js";
import type {
	GridContainerConstraints,
	GridContainerOptions,
	GridLayoutContext,
} from "./grid-layout.js";
import { isAtomicInline } from "./inline-atomic.js";
import {
	intrinsicWidthLimits,
	measureValidatedIntrinsicRoot,
	type IntrinsicWidth,
} from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { resolveHeightConstraints } from "./replaced-box.js";
import {
	sizeTableColumns,
	tableColumnSizingLimits,
} from "./table-column-sizing.js";
import {
	sizeTableRows,
	tableRowSizingLimits,
	type TableRowContribution,
} from "./table-row-sizing.js";
import {
	tableCellPercentage,
	tableColumnContributions,
	tableStructure,
} from "./table-structure.js";
import { projectCollapsedTableBorders } from "./table-collapsed-geometry.js";
import { layoutFormattingText, textLayoutWorkLimit } from "./text-layout.js";

export const tableLayoutLimits = Object.freeze({
	maxWork: 24_000_000,
	maxNesting: 32,
});

const zeroStrut = Object.freeze({ positive: 0, negative: 0, value: 0 });
const separateMargins = Object.freeze({
	top: zeroStrut,
	bottom: zeroStrut,
	through: false,
	withFirstChild: false,
	withLastChild: false,
});

type Charge = (amount?: number) => void;

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", message);
}

function spanExtent(
	sizes: readonly number[],
	start: number,
	end: number,
	spacing: number,
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
	return layoutNumber(total + Math.max(0, end - start - 1) * spacing);
}

function structuralBox(
	formatting: FormattingTree,
	id: number,
	containingBlock: number,
	containingWidth: number,
	borderX: number,
	borderY: number,
	width: number,
	height: number,
): Readonly<DocumentBox> {
	const node = formatting.nodes[id];
	if (!node) unsupported("Missing table row or group node");
	layoutNumber(borderX + width);
	layoutNumber(borderY + height);
	return Object.freeze({
		...resolveBlockWidth(initialBoxStyle, width),
		id,
		...(node.ref === undefined ? {} : { ref: node.ref }),
		containingBlock,
		containingWidth,
		containingHeight: null,
		borderX,
		borderY,
		contentX: borderX,
		contentY: borderY,
		borderTop: 0,
		borderBottom: 0,
		paddingTop: 0,
		paddingBottom: 0,
		marginTop: 0,
		marginBottom: 0,
		preferredHeight: null,
		minimumHeight: 0,
		maximumHeight: null,
		definiteHeight: null,
		naturalContentHeight: height,
		contentHeight: height,
		borderBoxHeight: height,
		heightClampedBy: "none",
		marginCollapse: separateMargins,
	});
}

export function layoutFormattingTableContainer(
	formatting: FormattingTree,
	containerId: number,
	constraints: GridContainerConstraints,
	options: GridContainerOptions = {},
	context: GridLayoutContext = {},
) {
	if (
		!constraints ||
		typeof constraints !== "object" ||
		Array.isArray(constraints) ||
		Object.keys(constraints).some(
			(key) =>
				!["contentWidth", "containingWidth", "containingHeight"].includes(key),
		) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["maxWork", "text"].includes(key)) ||
		!context ||
		typeof context !== "object" ||
		Array.isArray(context) ||
		Object.keys(context).some(
			(key) =>
				![
					"nesting",
					"validatedFormatting",
					"contentHeight",
					"contentHeightDefinite",
					"intrinsicHeight",
				].includes(key),
		) ||
		[
			context.validatedFormatting,
			context.contentHeightDefinite,
			context.intrinsicHeight,
		].some((value) => value !== undefined && typeof value !== "boolean")
	)
		throw new AgentBrowserError("invalid-input", "Invalid table layout inputs");
	const maxWork =
		options.maxWork === undefined ? tableLayoutLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > tableLayoutLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid table layout work limit",
		);
	layoutNumber(constraints.contentWidth);
	layoutNumber(constraints.containingWidth);
	if (constraints.containingHeight !== null)
		layoutNumber(constraints.containingHeight);
	if (context.contentHeight !== undefined) layoutNumber(context.contentHeight);
	const textLimit = textLayoutWorkLimit(options.text);
	const nesting = context.nesting ?? 0;
	if (
		!Number.isSafeInteger(nesting) ||
		nesting < 0 ||
		nesting >= tableLayoutLimits.maxNesting
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Table nesting limit exceeded",
		);
	if (!formatting || !Array.isArray(formatting.nodes))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid table formatting tree",
		);
	if (formatting.nodes.length > formattingLimits.maxBoxes)
		throw new AgentBrowserError(
			"resource-limit",
			"Table formatting limit exceeded",
		);
	const container = formatting.nodes[containerId];
	if (
		!Number.isSafeInteger(containerId) ||
		!container ||
		container.contentMode !== "table" ||
		container.level !== "block"
	)
		unsupported("Table layout requires a block table container");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		if (amount > maxWork - work)
			throw new AgentBrowserError(
				"resource-limit",
				"Table layout work limit exceeded",
			);
		work += amount;
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Table layout work limit exceeded",
			);
		return maxWork - work;
	};
	charge(8);
	if (!context.validatedFormatting) {
		let shells = 0;
		for (const node of formatting.nodes) {
			charge();
			if (
				node.kind === "deferred" &&
				["table", "flex", "grid"].includes(node.contentMode ?? "") &&
				node.deferredReason === "display-layout-not-supported"
			)
				shells++;
		}
		for (const [code, count] of Object.entries(formatting.issues)) {
			charge();
			if (
				!isAdvisoryFormattingIssue(code) &&
				(code !== "display-layout-not-supported" || count !== shells)
			)
				unsupported("Table layout requires supported formatting content");
		}
	}
	const guardRole = (id: number) => {
		charge();
		const node = formatting.nodes[id];
		if (node.position !== undefined)
			unsupported("Positioned table roles require table-aware coordination");
		if (
			node.collapsedBorderOwner === undefined &&
			(node.table ?? initialTableStyle)["empty-cells"] !== "show"
		)
			unsupported("Hidden empty table cells are not supported");
		const style = node.box ?? initialBoxStyle;
		for (const property of [
			"width",
			"min-width",
			"max-width",
			"height",
			"min-height",
			"max-height",
		] as const) {
			charge();
			if (
				lengthHasPercentage(style[property]) &&
				!(
					property === "width" &&
					node.display === "table-cell" &&
					tableCellPercentage(style) !== undefined
				)
			)
				unsupported("Percentage table role sizing requires cycle resolution");
		}
		if (style["max-height"] !== "none")
			unsupported("Table role maximum heights are not supported");
	};
	guardRole(containerId);
	if (
		formatting.nodes[containerId].table?.["border-collapse"] === "collapse" &&
		!formatting.nodes[containerId].collapsedTable
	)
		unsupported("Collapsed table layout requires resolved border conflicts");
	const structure = tableStructure(formatting, containerId, remaining());
	charge(structure.metrics.work);
	if (structure.captions.length)
		unsupported("Table captions require separate wrapper and border geometry");
	const { placement, spacing } = structure;
	const rowHeights: (number | null)[] = [];
	for (const group of placement.groups) {
		charge();
		if (group.id === null) continue;
		guardRole(group.id);
		const style = formatting.nodes[group.id].box ?? initialBoxStyle;
		if (
			style.height !== "auto" ||
			!["0px", "auto"].includes(style["min-height"])
		)
			unsupported("Explicit table row-group heights are not supported");
	}
	for (const row of placement.rows) {
		charge();
		if (row.id === null) {
			rowHeights.push(null);
			continue;
		}
		guardRole(row.id);
		const style = formatting.nodes[row.id].box ?? initialBoxStyle;
		rowHeights.push(
			Math.max(
				style.height === "auto" ? 0 : resolveLayoutLength(style.height, 0),
				style["min-height"] === "auto"
					? 0
					: resolveLayoutLength(style["min-height"], 0),
			),
		);
	}
	charge(formatting.nodes.length);
	const measuredNodes = [...formatting.nodes];
	const uncertainBaselines = new Set<number>();
	const visited = new Set<number>();
	for (const cell of placement.cells) {
		guardRole(cell.id);
		const node = formatting.nodes[cell.id];
		measuredNodes[cell.id] = Object.freeze({
			...node,
			box: Object.freeze({
				...(node.box ?? initialBoxStyle),
				"margin-top": "0px",
				"margin-right": "0px",
				"margin-bottom": "0px",
				"margin-left": "0px",
				"max-width": "none",
			}),
		});
		const pending = [cell.id];
		while (pending.length) {
			charge();
			const id = pending.pop()!;
			if (visited.has(id))
				unsupported("Table cell subtrees must not overlap or contain cycles");
			visited.add(id);
			const descendant = formatting.nodes[id];
			if (!descendant) unsupported("Missing table cell descendant");
			const style = descendant.box ?? initialBoxStyle;
			for (const property of ["height", "min-height", "max-height"] as const) {
				charge();
				if (lengthHasPercentage(style[property]))
					unsupported(
						"Percentage cell descendant heights require table reflow",
					);
			}
			if (
				descendant.control ||
				isAtomicInline(descendant) ||
				descendant.contentMode === "table"
			)
				uncertainBaselines.add(cell.id);
			for (const child of descendant.children) {
				charge();
				pending.push(child);
			}
		}
	}
	const measuredFormatting: FormattingTree = Object.freeze({
		...formatting,
		nodes: Object.freeze(measuredNodes),
	});
	const widths = new Map<number, Readonly<IntrinsicWidth>>();
	for (const cell of placement.cells) {
		charge();
		const measured = measureValidatedIntrinsicRoot(
			measuredFormatting,
			cell.id,
			null,
			{
				maxWork: Math.min(intrinsicWidthLimits.maxWork, remaining()),
				text: options.text,
			},
			nesting + 1,
		);
		charge(measured.metrics.work);
		for (const record of measured.widths) {
			charge();
			if (record.id === cell.id) widths.set(cell.id, record);
		}
	}
	const columns = sizeTableColumns(
		placement.columnCount,
		tableColumnContributions(measuredFormatting, placement, widths, charge),
		{
			availableWidth: constraints.contentWidth,
			tableWidth: constraints.contentWidth,
			borderSpacing: spacing.horizontal,
			captionMinWidth: 0,
			maxWork: Math.min(tableColumnSizingLimits.maxWork, remaining()),
		},
	);
	charge(columns.metrics.work);
	const precision =
		32 *
		Number.EPSILON *
		Math.max(1, columns.usedWidth) *
		Math.max(1, placement.columnCount);
	if (columns.usedWidth > constraints.contentWidth + precision)
		unsupported(
			"Table inner width must already include intrinsic column minima",
		);
	charge(formatting.nodes.length);
	const reflowNodes = [...measuredNodes];
	const roots: BlockReflowRoot[] = [];
	for (const cell of placement.cells) {
		charge(3);
		const areaWidth = spanExtent(
			columns.sizes,
			cell.columnStart,
			cell.columnEnd,
			spacing.horizontal,
			charge,
		);
		const node = measuredNodes[cell.id];
		const style = node.box ?? initialBoxStyle;
		const height = resolveHeightConstraints(style, areaWidth, null);
		const edges =
			height.borderTop +
			height.paddingTop +
			height.paddingBottom +
			height.borderBottom;
		const minimum = Math.max(height.minimum, height.preferred ?? 0);
		const usedWidth = resolveBlockWidth(
			{
				...style,
				width: `${areaWidth}px`,
				"box-sizing": "border-box",
				"min-width": "0px",
				"max-width": "none",
			},
			areaWidth,
			resolveBorders(style),
		);
		reflowNodes[cell.id] = Object.freeze({
			...node,
			box: Object.freeze({
				...style,
				height: "auto",
				"min-height": `${layoutNumber(minimum + (style["box-sizing"] === "border-box" ? edges : 0))}px`,
				"max-height": "none",
			}),
		});
		roots.push({
			id: cell.id,
			containingBlock: formatting.nodes[cell.id].parent ?? containerId,
			containingWidth: areaWidth,
			containingHeight: null,
			contentX: 0,
			usedWidth: Object.freeze({
				...usedWidth,
				marginLeft: 0,
				marginRight: 0,
				contentOffset: layoutNumber(
					usedWidth.borderLeft + usedWidth.paddingLeft,
				),
			}),
		});
	}
	const reflowFormatting: FormattingTree = Object.freeze({
		...formatting,
		nodes: Object.freeze(reflowNodes),
	});
	const horizontal = resolveFormattingBlockWidths(
		reflowFormatting,
		roots,
		Math.min(formattingLimits.maxWork, remaining()),
		true,
		() => {},
		{ nesting: nesting + 1, text: options.text },
	);
	charge(horizontal.metrics.work);
	const text = layoutFormattingText(horizontal, {
		...options.text,
		maxWork: Math.min(textLimit, remaining()),
	});
	charge(text.metrics.work);
	const layout = layoutFormattingFlexFlow(
		text,
		Math.min(documentLayoutLimits.maxWork, remaining()),
		options.text,
		true,
		nesting + 1,
	);
	charge(layout.metrics.work);
	const naturalBoxes = new Map<number, Readonly<DocumentBox>>();
	for (const box of layout.boxes) {
		charge();
		naturalBoxes.set(box.id, box);
	}
	const baselines = collectFlexBaselines(layout, reflowFormatting, charge);
	const rowContributions: TableRowContribution[] = [];
	let baselineUnsupported = false;
	for (const cell of placement.cells) {
		charge(2);
		const box = naturalBoxes.get(cell.id);
		const measured = baselines.get(cell.id);
		if (!box || !measured) unsupported("Missing reflowed table cell geometry");
		const verticalAlign = (formatting.nodes[cell.id].table ??
			initialTableStyle)["vertical-align"];
		if (!["baseline", "top", "middle", "bottom"].includes(verticalAlign))
			unsupported("Unsupported table cell vertical alignment");
		const uncertain = measured.unsupported || uncertainBaselines.has(cell.id);
		baselineUnsupported ||= uncertain;
		if (uncertain && verticalAlign === "baseline")
			unsupported(
				"Table baseline alignment requires supported cell content baselines",
			);
		rowContributions.push({
			id: cell.id,
			row: cell.rowStart,
			span: cell.rowEnd - cell.rowStart,
			height: box.borderBoxHeight,
			baseline:
				uncertain || measured.first === null
					? null
					: layoutNumber(measured.first - box.borderY, true),
			verticalAlign: verticalAlign as TableRowContribution["verticalAlign"],
		});
	}
	const height = resolveHeightConstraints(
		container.box ?? initialBoxStyle,
		constraints.containingWidth,
		constraints.containingHeight,
	);
	const tableHeight = context.intrinsicHeight
		? null
		: Math.max(height.minimum, context.contentHeight ?? height.preferred ?? 0);
	const rows = sizeTableRows(placement.rowCount, rowContributions, {
		borderSpacing: spacing.vertical,
		tableHeight,
		rowHeights,
		maxWork: Math.min(tableRowSizingLimits.maxWork, remaining()),
	});
	charge(rows.metrics.work);
	const placements = new Map<number, FlexPlacement>();
	const geometry = new Map<
		number,
		{ areaHeight: number; offset: number; top: number }
	>();
	for (let index = 0; index < placement.cells.length; index++) {
		charge(3);
		const cell = placement.cells[index];
		const box = naturalBoxes.get(cell.id)!;
		const sized = rows.cells[index];
		const top = rows.offsets[cell.rowStart];
		geometry.set(cell.id, {
			areaHeight: sized.areaHeight,
			offset: sized.offset,
			top,
		});
		const measured = baselines.get(cell.id)!;
		placements.set(cell.id, {
			id: cell.id,
			index,
			line: cell.rowStart,
			x: layoutNumber(columns.offsets[cell.columnStart] - box.borderX, true),
			y: layoutNumber(top + sized.offset - box.borderY, true),
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			firstBaseline:
				measured.first === null ||
				uncertainBaselines.has(cell.id) ||
				measured.unsupported
					? null
					: layoutNumber(
							top + sized.offset + measured.first - box.borderY,
							true,
						),
			lastBaseline:
				measured.last === null ||
				uncertainBaselines.has(cell.id) ||
				measured.unsupported
					? null
					: layoutNumber(
							top + sized.offset + measured.last - box.borderY,
							true,
						),
		});
	}
	const positioned = placeFlexLayout(layout, placements, charge);
	const boxes: Readonly<DocumentBox>[] = [];
	const gridWidth = columns.sizes.length
		? spanExtent(
				columns.sizes,
				0,
				columns.sizes.length,
				spacing.horizontal,
				charge,
			)
		: constraints.contentWidth;
	const gridX = columns.sizes.length ? spacing.horizontal : 0;
	for (const group of placement.groups) {
		charge(2);
		if (group.id === null) continue;
		const top =
			rows.offsets[group.rowStart] ??
			Math.max(0, rows.usedHeight - spacing.vertical);
		const groupHeight = spanExtent(
			rows.sizes,
			group.rowStart,
			group.rowEnd,
			spacing.vertical,
			charge,
		);
		boxes.push(
			structuralBox(
				formatting,
				group.id,
				containerId,
				constraints.contentWidth,
				gridX,
				top,
				gridWidth,
				groupHeight,
			),
		);
	}
	for (const row of placement.rows) {
		charge(2);
		if (row.id === null) continue;
		boxes.push(
			structuralBox(
				formatting,
				row.id,
				formatting.nodes[row.id].parent ?? containerId,
				gridWidth,
				gridX,
				rows.offsets[row.index],
				gridWidth,
				rows.sizes[row.index],
			),
		);
	}
	const finalCells = new Map<number, Readonly<DocumentBox>>();
	for (const box of positioned.boxes) {
		charge(2);
		const cell = geometry.get(box.id);
		if (!cell) {
			boxes.push(box);
			continue;
		}
		const natural = naturalBoxes.get(box.id)!;
		const paddingTop = layoutNumber(natural.paddingTop + cell.offset);
		const paddingBottom = layoutNumber(
			natural.paddingBottom +
				Math.max(0, cell.areaHeight - natural.borderBoxHeight - cell.offset),
		);
		const contentHeight = layoutNumber(
			Math.max(
				0,
				cell.areaHeight -
					natural.borderTop -
					natural.borderBottom -
					paddingTop -
					paddingBottom,
			),
		);
		const stretched: Readonly<DocumentBox> = Object.freeze({
			...box,
			borderY: cell.top,
			borderBoxHeight: cell.areaHeight,
			contentY: layoutNumber(cell.top + natural.borderTop + paddingTop),
			contentHeight,
			paddingTop,
			paddingBottom,
			marginCollapse: separateMargins,
		});
		boxes.push(stretched);
		finalCells.set(box.id, stretched);
	}
	const items = positioned.items.map((item) => {
		charge();
		const box = finalCells.get(item.id)!;
		return Object.freeze({ ...item, x: box.borderX, y: box.borderY, box });
	});
	const paintOrder = boxes.map((box) => {
		charge();
		return box.id;
	});
	const collapsedTable = formatting.nodes[containerId].collapsedTable;
	const collapsedTableBorders = collapsedTable
		? projectCollapsedTableBorders(collapsedTable, columns, rows, charge)
		: undefined;
	let first: number | null = null;
	let last: number | null = null;
	for (let index = 0; index < rows.baselines.length; index++) {
		charge();
		const baseline = rows.baselines[index];
		if (baseline === null) continue;
		last = layoutNumber(rows.offsets[index] + baseline);
		first ??= last;
	}
	charge(
		boxes.length +
			positioned.contexts.length +
			positioned.images.length +
			items.length +
			8,
	);
	return Object.freeze({
		stage: "native-table-container-layout" as const,
		partial: true as const,
		container: containerId,
		contentHeight: rows.usedHeight,
		naturalContentHeight: rows.naturalHeight,
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(positioned.contexts),
		images: Object.freeze(positioned.images),
		items: Object.freeze(items),
		atomics: layout.text.horizontal.atomics ?? Object.freeze([]),
		textMetrics: layout.text.metrics,
		paintOrder: Object.freeze(paintOrder),
		...(collapsedTableBorders ? { collapsedTableBorders } : {}),
		baselines: Object.freeze({
			first: baselineUnsupported ? null : first,
			last: baselineUnsupported ? null : last,
			unsupported: baselineUnsupported,
		}),
		placement,
		columns,
		rows,
		metrics: Object.freeze({ work }),
	});
}
