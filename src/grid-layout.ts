import { resolveBlockWidth } from "./block-width.js";
import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { initialGridStyle } from "./css-grid.js";
import { documentLayoutLimits, type DocumentBox } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingFlexFlow } from "./flex-document.js";
import {
	placeFlexLayout as placeLayoutItems,
	type FlexPlacement as ItemPlacement,
} from "./flex-placement.js";
import {
	formattingLimits,
	resolveFormattingBlockWidths,
	type BlockReflowRoot,
	type FormattingTree,
} from "./formatting-tree.js";
import {
	gridAutomaticMinimum,
	gridColumnContributions,
} from "./grid-intrinsic.js";
import { gridPlacementLimits, placeGridItems } from "./grid-placement.js";
import { gridTrackSizingLimits, sizeGridTracks } from "./grid-tracks.js";
import type {
	GridTrack,
	GridTrackSizing,
	GridTrackContribution,
} from "./grid-types.js";
import {
	intrinsicWidthLimits,
	measureFormattingGridItemWidths,
} from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import {
	layoutFormattingText,
	textLayoutWorkLimit,
	type TextLayoutOptions,
} from "./text-layout.js";

export const gridLayoutLimits = Object.freeze({
	maxWork: 24_000_000,
	maxNesting: 32,
});
export const gridLayoutCapabilities = Object.freeze({
	partial: true,
	blockGrid: true,
	nestedGrid: true,
	flexInterop: true,
	inlineGrid: false,
	positionedGrid: false,
	baselineAlignment: false,
	cyclicPercentageRows: true,
	replacedStretch: false,
});
export interface GridContainerConstraints {
	contentWidth: number;
	containingWidth: number;
	containingHeight: number | null;
}
export interface GridContainerOptions {
	maxWork?: number;
	text?: TextLayoutOptions;
}
export interface GridLayoutContext {
	nesting?: number;
	validatedFormatting?: boolean;
	contentHeight?: number;
	contentHeightDefinite?: boolean;
	intrinsicHeight?: boolean;
}

function alignedTracks(
	tracks: readonly Readonly<GridTrack>[],
	sizing: GridTrackSizing,
	available: number,
	gap: number,
	align: string,
	charge: (amount?: number) => void,
) {
	charge(tracks.length);
	const sizes = [...sizing.sizes];
	let free = available - sizing.extent;
	if ((align === "normal" || align === "stretch") && free > 0) {
		const automatic = tracks
			.map((track, index) => (track.maximum === "auto" ? index : -1))
			.filter((index) => index >= 0);
		if (automatic.length) {
			for (const index of automatic)
				sizes[index] = layoutNumber(sizes[index] + free / automatic.length);
			free = 0;
		}
	}
	const safe = align.startsWith("safe ");
	const value = align.replace(/^(safe|unsafe) /, "");
	let start = 0;
	let spacing = gap;
	if (value === "center") start = free / 2;
	else if (["end", "flex-end", "right"].includes(value)) start = free;
	else if (value === "space-between" && sizes.length > 1 && free > 0)
		spacing += free / (sizes.length - 1);
	else if (
		(value === "space-around" || value === "space-evenly") &&
		sizes.length
	) {
		start =
			free > 0
				? free /
					(value === "space-around" ? sizes.length * 2 : sizes.length + 1)
				: 0;
		if (free > 0)
			spacing +=
				free / (value === "space-around" ? sizes.length : sizes.length + 1);
	} else if (
		![
			"normal",
			"stretch",
			"start",
			"flex-start",
			"left",
			"space-between",
			"space-around",
			"space-evenly",
		].includes(value)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported Grid track alignment",
		);
	if (safe && free < 0) start = 0;
	const offsets: number[] = [];
	let offset = start;
	for (const size of sizes) {
		charge();
		offsets.push(layoutNumber(offset, true));
		offset += size + spacing;
	}
	const end = sizes.length ? offset - spacing : 0;
	offsets.push(layoutNumber(end, true));
	return { sizes, offsets, spacing };
}

export function layoutFormattingGridContainer(
	formatting: FormattingTree,
	containerId: number,
	constraints: GridContainerConstraints,
	options: GridContainerOptions = {},
	context: GridLayoutContext = {},
) {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		!constraints ||
		typeof constraints !== "object" ||
		Array.isArray(constraints) ||
		Object.keys(constraints).some(
			(key) =>
				!["contentWidth", "containingWidth", "containingHeight"].includes(key),
		) ||
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
		throw new AgentBrowserError("invalid-input", "Invalid Grid layout inputs");
	const maxWork = options.maxWork ?? gridLayoutLimits.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > gridLayoutLimits.maxWork ||
		Object.keys(options).some((key) => !["maxWork", "text"].includes(key))
	)
		throw new AgentBrowserError("invalid-input", "Invalid Grid layout options");
	layoutNumber(constraints.contentWidth);
	layoutNumber(constraints.containingWidth);
	if (constraints.containingHeight !== null)
		layoutNumber(constraints.containingHeight);
	const textLimit = textLayoutWorkLimit(options.text);
	const nesting = context.nesting ?? 0;
	if (
		!Number.isSafeInteger(nesting) ||
		nesting < 0 ||
		nesting >= gridLayoutLimits.maxNesting
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Grid nesting limit exceeded",
		);
	const container = formatting.nodes[containerId];
	if (
		!Number.isSafeInteger(containerId) ||
		!container ||
		container.contentMode !== "grid" ||
		container.level !== "block"
	)
		throw new AgentBrowserError(
			"unsupported",
			"Grid layout requires a block Grid container",
		);
	if (container.position === "absolute" || container.position === "fixed")
		throw new AgentBrowserError(
			"unsupported",
			"Positioned Grid containers require Grid-aware coordination",
		);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid layout work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid layout work limit exceeded",
			);
		return maxWork - work;
	};
	const placement = placeGridItems(
		container.grid ?? initialGridStyle,
		container.children.map((id) => {
			charge();
			const item = formatting.nodes[id];
			if (item.position === "absolute" || item.position === "fixed")
				throw new AgentBrowserError(
					"unsupported",
					"Positioned Grid items require Grid-area coordination",
				);
			return {
				id,
				style: item.grid ?? initialGridStyle,
				order: Number(item.flex?.order ?? 0),
			};
		}),
		{ maxWork: Math.min(gridPlacementLimits.maxWork, remaining()) },
	);
	charge(placement.metrics.work);
	let height = resolveHeightConstraints(
		container.box ?? initialBoxStyle,
		constraints.containingWidth,
		constraints.containingHeight,
	);
	if (context.intrinsicHeight)
		height = {
			...height,
			preferred: null,
			minimum: 0,
			maximum: null,
			definite: null,
		};
	if (context.contentHeight !== undefined) {
		layoutNumber(context.contentHeight);
		const preferred = Math.max(
			height.minimum,
			Math.min(context.contentHeight, height.maximum ?? Infinity),
		);
		height = {
			...height,
			preferred,
			definite: context.contentHeightDefinite === false ? null : preferred,
		};
	}
	const cyclicRows =
		height.definite === null &&
		placement.rows.tracks.some(
			(track) =>
				track.minimum.includes("%") ||
				track.maximum.includes("%") ||
				track.fitContent?.includes("%"),
		);
	const intrinsicRows = cyclicRows
		? placement.rows.tracks.map((track) => {
				charge();
				return {
					minimum: track.minimum.includes("%") ? "auto" : track.minimum,
					maximum: track.maximum.includes("%") ? "auto" : track.maximum,
					...(track.fitContent && !track.fitContent.includes("%")
						? { fitContent: track.fitContent }
						: {}),
				};
			})
		: placement.rows.tracks;
	const gap = (property: "column-gap" | "row-gap", size: number) =>
		container.flex?.[property] === "normal"
			? 0
			: resolveLayoutLength(container.flex?.[property] ?? "0px", size);
	const columnGap = gap("column-gap", constraints.contentWidth);
	let rowGap = gap("row-gap", height.definite ?? 0);
	const measured = measureFormattingGridItemWidths(
		formatting,
		containerId,
		height.definite,
		{
			maxWork: Math.min(intrinsicWidthLimits.maxWork, remaining()),
			text: options.text,
		},
		new Map(),
		context.validatedFormatting,
	);
	charge(measured.metrics.work);
	const widths = new Map(
		measured.widths.map((item) => {
			charge();
			return [item.id, item] as const;
		}),
	);
	const columns = sizeGridTracks(
		placement.columns.tracks,
		gridColumnContributions(
			formatting,
			placement,
			widths,
			columnGap,
			constraints.contentWidth,
			charge,
		),
		{
			availableSpace: constraints.contentWidth,
			gap: columnGap,
			maxWork: Math.min(gridTrackSizingLimits.maxWork, remaining()),
		},
	);
	charge(columns.metrics.work);
	const horizontalTracks = alignedTracks(
		placement.columns.tracks,
		columns,
		constraints.contentWidth,
		columnGap,
		container.flex?.["justify-content"] ?? "normal",
		charge,
	);
	const spanSize = (
		axis: typeof horizontalTracks,
		start: number,
		end: number,
	) =>
		layoutNumber(
			axis.offsets[end - 1] + axis.sizes[end - 1] - axis.offsets[start],
		);
	const allocateWidths = (areas?: ReadonlyMap<number, number>) =>
		new Map(
			placement.items.map((item) => {
				charge();
				const areaWidth = spanSize(
					horizontalTracks,
					item.columnStart,
					item.columnEnd,
				);
				const node = formatting.nodes[item.id];
				const style = node.box ?? initialBoxStyle;
				const replaced =
					node.kind === "replaced" && node.intrinsic
						? resolveReplacedSize(
								node.intrinsic.width,
								node.intrinsic.height,
								style,
								areaWidth,
								areas?.get(item.id) ?? null,
								!node.control && node.intrinsicRatio !== false,
							)
						: undefined;
				const resolved = resolveBlockWidth(
					replaced
						? {
								...style,
								width: `${style["box-sizing"] === "border-box" ? replaced.borderBoxWidth : replaced.contentWidth}px`,
								"min-width": "0px",
								"max-width": "none",
							}
						: style,
					areaWidth,
					resolveBorders(style),
				);
				const leftAuto = style["margin-left"] === "auto";
				const rightAuto = style["margin-right"] === "auto";
				let marginLeft = leftAuto
					? 0
					: resolveLayoutLength(style["margin-left"], areaWidth, true);
				let marginRight = rightAuto
					? 0
					: resolveLayoutLength(style["margin-right"], areaWidth, true);
				const free = Math.max(
					0,
					areaWidth - resolved.borderBoxWidth - marginLeft - marginRight,
				);
				if (leftAuto) marginLeft = free / (1 + Number(rightAuto));
				if (rightAuto) marginRight = free / (1 + Number(leftAuto));
				return [
					item.id,
					Object.freeze({
						...resolved,
						marginLeft,
						marginRight,
						contentOffset: layoutNumber(
							marginLeft + resolved.borderLeft + resolved.paddingLeft,
							true,
						),
					}),
				] as const;
			}),
		);
	let usedWidths = allocateWidths();
	const reflow = (
		heights?: ReadonlyMap<number, number>,
		areas?: ReadonlyMap<number, number>,
	) => {
		const roots: BlockReflowRoot[] = placement.items.map((item) => {
			charge();
			const areaWidth = spanSize(
				horizontalTracks,
				item.columnStart,
				item.columnEnd,
			);
			const usedWidth = usedWidths.get(item.id);
			return {
				id: item.id,
				containingBlock: containerId,
				containingWidth: areaWidth,
				containingHeight: areas?.get(item.id) ?? null,
				contentX: 0,
				usedWidth,
				...(heights?.has(item.id)
					? { contentHeightOverride: heights.get(item.id) }
					: {}),
			};
		});
		const horizontal = resolveFormattingBlockWidths(
			formatting,
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
		return layout;
	};
	let layout = reflow();
	const firstPassWork = work;
	let boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	const rowContributionsFor = (
		available: number | null,
		contributionGap: number,
	): GridTrackContribution[] =>
		placement.items.map((item) => {
			charge();
			const box = boxes.get(item.id);
			if (!box)
				throw new AgentBrowserError(
					"unsupported",
					"Missing reflowed Grid item",
				);
			const node = formatting.nodes[item.id];
			const style = node.box ?? initialBoxStyle;
			const outer = Math.max(
				0,
				box.borderBoxHeight + box.marginTop + box.marginBottom,
			);
			const edges =
				box.borderTop +
				box.borderBottom +
				box.paddingTop +
				box.paddingBottom +
				box.marginTop +
				box.marginBottom;
			const minimum =
				style["min-height"] === "auto"
					? gridAutomaticMinimum(
							placement.rows.tracks,
							item.rowStart,
							item.rowEnd,
							outer,
							edges,
							contributionGap,
							available,
							charge,
							node.scrollableOverflow,
						)
					: box.minimumHeight + edges;
			return {
				start: item.rowStart,
				end: item.rowEnd,
				minimum: Math.max(0, minimum),
				minContent: outer,
				maxContent: outer,
			};
		});
	const rowContributions = rowContributionsFor(height.definite, rowGap);
	let rows = sizeGridTracks(intrinsicRows, rowContributions, {
		availableSpace: height.definite,
		gap: rowGap,
		maxWork: Math.min(gridTrackSizingLimits.maxWork, remaining()),
	});
	charge(rows.metrics.work);
	const constrainedExtent = Math.max(
		height.minimum,
		Math.min(rows.extent, height.maximum ?? Infinity),
	);
	if (
		height.definite === null &&
		constrainedExtent !== rows.extent &&
		(constrainedExtent < rows.extent ||
			placement.rows.tracks.some((track) => track.maximum.endsWith("fr")))
	) {
		rows = sizeGridTracks(intrinsicRows, rowContributions, {
			availableSpace: constrainedExtent,
			gap: rowGap,
			maxWork: Math.min(gridTrackSizingLimits.maxWork, remaining()),
		});
		charge(rows.metrics.work);
	}
	const naturalContentHeight = rows.extent;
	const contentHeight = layoutNumber(
		Math.max(
			height.minimum,
			Math.min(height.preferred ?? rows.extent, height.maximum ?? Infinity),
		),
	);
	const resolvedRowGap = gap("row-gap", contentHeight);
	if (height.definite === null && (cyclicRows || resolvedRowGap !== rowGap)) {
		rowGap = resolvedRowGap;
		rows = sizeGridTracks(
			placement.rows.tracks,
			rowContributionsFor(contentHeight, rowGap),
			{
				availableSpace: contentHeight,
				gap: rowGap,
				maxWork: Math.min(gridTrackSizingLimits.maxWork, remaining()),
			},
		);
		charge(rows.metrics.work);
	}
	const verticalTracks = alignedTracks(
		placement.rows.tracks,
		rows,
		contentHeight,
		rowGap,
		container.flex?.["align-content"] ?? "normal",
		charge,
	);
	const align = (id: number) => {
		const own = formatting.nodes[id].flex?.["align-self"] ?? "auto";
		const mode =
			own === "auto" ? (container.flex?.["align-items"] ?? "normal") : own;
		if (
			!/^(?:(?:safe|unsafe) )?(?:normal|stretch|start|end|center|flex-start|flex-end|self-start|self-end)$/.test(
				mode,
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported Grid item alignment",
			);
		return mode;
	};
	const stretchHeights = new Map<number, number>();
	const areaHeights = new Map<number, number>();
	let areaDependent = false;
	for (const item of placement.items) {
		charge();
		const box = boxes.get(item.id)!;
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const mode = align(item.id);
		areaHeights.set(
			item.id,
			spanSize(verticalTracks, item.rowStart, item.rowEnd),
		);
		areaDependent ||= [
			style.height,
			style["min-height"],
			style["max-height"],
		].some((value) => value.includes("%"));
		if (
			mode === "stretch" &&
			style.height === "auto" &&
			formatting.nodes[item.id].kind === "replaced"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Stretched replaced Grid items require aspect-ratio track feedback",
			);
		if (
			["normal", "stretch"].includes(mode) &&
			style.height === "auto" &&
			style["margin-top"] !== "auto" &&
			style["margin-bottom"] !== "auto" &&
			formatting.nodes[item.id].kind !== "replaced"
		) {
			const target = Math.max(
				0,
				spanSize(verticalTracks, item.rowStart, item.rowEnd) -
					box.marginTop -
					box.marginBottom -
					box.borderTop -
					box.borderBottom -
					box.paddingTop -
					box.paddingBottom,
			);
			stretchHeights.set(item.id, target);
		}
	}
	if (stretchHeights.size || areaDependent) {
		usedWidths = allocateWidths(areaHeights);
		layout = reflow(stretchHeights, areaHeights);
		boxes = new Map(
			layout.boxes.map((box) => {
				charge();
				return [box.id, box] as const;
			}),
		);
	}
	const placements = new Map<number, ItemPlacement>();
	const gridAreas = new Map<number, NonNullable<DocumentBox["gridArea"]>>();
	for (const [index, item] of placement.items.entries()) {
		charge();
		const areaX = layoutNumber(
			horizontalTracks.offsets[item.columnStart],
			true,
		);
		const areaY = layoutNumber(verticalTracks.offsets[item.rowStart], true);
		const areaWidth = spanSize(
			horizontalTracks,
			item.columnStart,
			item.columnEnd,
		);
		const areaHeight = spanSize(verticalTracks, item.rowStart, item.rowEnd);
		layoutNumber(areaX + areaWidth, true);
		layoutNumber(areaY + areaHeight, true);
		gridAreas.set(
			item.id,
			Object.freeze({
				x: areaX,
				y: areaY,
				width: areaWidth,
				height: areaHeight,
			}),
		);
		const box = boxes.get(item.id)!;
		const used = usedWidths.get(item.id)!;
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const mode = align(item.id);
		const free =
			spanSize(verticalTracks, item.rowStart, item.rowEnd) -
			box.borderBoxHeight -
			box.marginTop -
			box.marginBottom;
		const topAuto = style["margin-top"] === "auto";
		const bottomAuto = style["margin-bottom"] === "auto";
		const marginTop = topAuto
			? Math.max(0, free) / (1 + Number(bottomAuto))
			: box.marginTop;
		const marginBottom = bottomAuto
			? Math.max(0, free) / (1 + Number(topAuto))
			: box.marginBottom;
		const value = mode.replace(/^(safe|unsafe) /, "");
		let offset =
			value === "center"
				? free / 2
				: ["end", "flex-end", "self-end"].includes(value)
					? free
					: 0;
		if (
			(free > 0 && (topAuto || bottomAuto)) ||
			(free < 0 && mode.startsWith("safe "))
		)
			offset = 0;
		placements.set(item.id, {
			id: item.id,
			index,
			line: item.rowStart,
			x: layoutNumber(
				horizontalTracks.offsets[item.columnStart] + used.marginLeft,
				true,
			),
			y: layoutNumber(
				verticalTracks.offsets[item.rowStart] + marginTop + offset,
				true,
			),
			marginLeft: used.marginLeft,
			marginRight: used.marginRight,
			marginTop,
			marginBottom,
			firstBaseline: null,
			lastBaseline: null,
		});
	}
	const positioned = placeLayoutItems(layout, placements, charge);
	const itemBoxes = new Map<number, Readonly<DocumentBox>>();
	const positionedBoxes = positioned.boxes.map((box) => {
		charge();
		const gridArea = gridAreas.get(box.id);
		if (!gridArea) return box;
		const positionedBox = Object.freeze({ ...box, gridArea });
		itemBoxes.set(box.id, positionedBox);
		return positionedBox;
	});
	const positionedItems = positioned.items.map((item) => {
		charge();
		return Object.freeze({ ...item, box: itemBoxes.get(item.id)! });
	});
	return Object.freeze({
		stage: "native-grid-container-layout" as const,
		partial: true as const,
		container: containerId,
		placement,
		columns: horizontalTracks,
		rows: verticalTracks,
		contentHeight,
		naturalContentHeight,
		...positioned,
		boxes: positionedBoxes,
		items: positionedItems,
		textMetrics: layout.text.metrics,
		atomics: layout.text.horizontal.atomics ?? [],
		paintOrder: Object.freeze(placement.items.map((item) => item.id)),
		baselines: Object.freeze({ first: null, last: null, unsupported: true }),
		metrics: Object.freeze({
			work,
			firstPassWork,
			reflowPasses: stretchHeights.size || areaDependent ? 2 : 1,
		}),
	});
}
