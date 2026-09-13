import { computeBoxStyle, type BoxStyle } from "./css-box.js";
import { parseCssContent } from "./css-content.js";
import { computeFlexStyle, type FlexStyle } from "./css-flex.js";
import { computeFlowStyle, type FlowStyle } from "./css-flow.js";
import { computeGridStyle, type GridStyle } from "./css-grid.js";
import { computeListStyle, type ListStyle } from "./css-list.js";
import { computeOutlineStyle, type OutlineStyle } from "./css-outline.js";
import {
	computeClipStyle,
	computePaintStyle,
	type ClipStyle,
	type PaintStyle,
} from "./css-paint.js";
import { computeTableStyle, type TableStyle } from "./css-table.js";
import { computeTextStyle, type TextStyle } from "./css-text.js";
import {
	computeTextDecorationStyle,
	type TextDecorationStyle,
} from "./css-text-decoration.js";
import { nativeFontXHeight } from "./font-metrics.js";

export interface GeneratedContentStyle {
	readonly content: string;
	readonly display: string;
	readonly visible: boolean;
	readonly box: BoxStyle;
	readonly typography: TextStyle;
	readonly paint: PaintStyle;
	readonly flow: FlowStyle;
	readonly flex: FlexStyle;
	readonly grid: GridStyle;
	readonly list: ListStyle;
	readonly table: TableStyle;
	readonly outline: OutlineStyle;
	readonly textDecoration: TextDecorationStyle;
	readonly clip: ClipStyle;
}

export interface GeneratedContentParent
	extends Omit<GeneratedContentStyle, "content" | "visible"> {
	readonly content: string;
	readonly displayed: boolean;
	readonly visibility: string;
}

export function generatedContentValue(
	value: string | undefined,
	inherited: string,
): string {
	return value === "inherit"
		? inherited
		: value === undefined || ["initial", "unset", "revert"].includes(value)
			? "normal"
			: value;
}

export function computeGeneratedContentStyle(
	specified: Readonly<Record<string, string>>,
	parent: GeneratedContentParent,
	viewport: Readonly<{ width: number; height: number }>,
	rootFontSize: number,
): GeneratedContentStyle | undefined {
	const content = parseCssContent(
		generatedContentValue(specified.content, parent.content),
	)?.text;
	if (content === undefined || content === null || !parent.displayed) return;
	const display =
		specified.display === "inherit"
			? parent.display
			: specified.display === undefined ||
					["initial", "unset", "revert"].includes(specified.display)
				? "inline"
				: specified.display;
	if (display === "none") return;
	const visibility =
		specified.visibility === "initial"
			? "visible"
			: specified.visibility === undefined ||
					["inherit", "unset", "revert"].includes(specified.visibility)
				? parent.visibility
				: specified.visibility;
	const typography = computeTextStyle(
		specified,
		parent.typography,
		viewport,
		rootFontSize,
	);
	const fontSize = Number.parseFloat(typography["font-size"]);
	const fonts = {
		fontSize,
		rootFontSize,
		xHeight: nativeFontXHeight(
			fontSize,
			Number(typography["font-weight"]),
			typography["font-family"],
		),
	};
	const paint = computePaintStyle(specified, parent.paint);
	return Object.freeze({
		content,
		display,
		visible: visibility === "visible",
		typography,
		box: computeBoxStyle(specified, parent.box, viewport, fonts),
		paint,
		flow: computeFlowStyle(specified, parent.flow),
		flex: computeFlexStyle(specified, parent.flex, viewport, fonts),
		grid: computeGridStyle(specified, parent.grid, viewport, fonts),
		list: computeListStyle(specified, parent.list),
		table: computeTableStyle(specified, parent.table, viewport, fonts),
		outline: computeOutlineStyle(
			specified,
			parent.outline,
			viewport,
			fonts,
			paint.color,
		),
		textDecoration: computeTextDecorationStyle(
			specified,
			parent.textDecoration,
			paint.color,
		),
		clip: computeClipStyle(specified, parent.clip),
	});
}
