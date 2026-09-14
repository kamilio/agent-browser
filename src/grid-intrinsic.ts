import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import type { FormattingTree } from "./formatting-tree.js";
import type {
	GridPlacement,
	GridTrack,
	GridTrackContribution,
} from "./grid-types.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export function gridAutomaticMinimum(
	tracks: readonly Readonly<GridTrack>[],
	start: number,
	end: number,
	content: number,
	edges: number,
	gap: number,
	available: number | null,
	charge: (amount?: number) => void,
	scrollableOverflow = false,
): number {
	if (scrollableOverflow) {
		charge();
		return layoutNumber(Math.max(0, edges));
	}
	let automatic = false;
	let flexible = false;
	let definiteMaximum = gap * Math.max(0, end - start - 1);
	for (let index = start; index < end; index++) {
		charge();
		const track = tracks[index];
		automatic ||=
			track.minimum === "auto" ||
			(available === null && track.minimum.includes("%"));
		flexible ||= track.maximum.endsWith("fr");
		if (
			/^-?[\d.e+]+(?:px|%)$/i.test(track.maximum) &&
			(available !== null || !track.maximum.endsWith("%"))
		)
			definiteMaximum += resolveLayoutLength(track.maximum, available ?? 0);
		else definiteMaximum = Number.POSITIVE_INFINITY;
	}
	if (!automatic || (end - start > 1 && flexible)) return Math.max(0, edges);
	return layoutNumber(Math.max(0, edges, Math.min(content, definiteMaximum)));
}

export function gridColumnContributions(
	formatting: FormattingTree,
	placement: GridPlacement,
	widths: ReadonlyMap<number, Readonly<IntrinsicWidth>>,
	gap: number,
	available: number | null,
	charge: (amount?: number) => void,
): readonly Readonly<GridTrackContribution>[] {
	return placement.items.map((item) => {
		charge();
		const measured = widths.get(item.id);
		if (!measured)
			throw new AgentBrowserError("unsupported", "Missing intrinsic Grid item");
		const node = formatting.nodes[item.id];
		const style = node.box ?? initialBoxStyle;
		const borders = resolveBorders(style);
		const padding =
			resolveLayoutLength(style["padding-left"], 0) +
			resolveLayoutLength(style["padding-right"], 0);
		const boxEdges = borders.borderLeft + borders.borderRight + padding;
		const margins = ["margin-left", "margin-right"].reduce(
			(total, name) =>
				total +
				(style[name as keyof typeof style] === "auto"
					? 0
					: resolveLayoutLength(style[name as keyof typeof style], 0, true)),
			0,
		);
		const minimum =
			style["min-width"] === "auto"
				? gridAutomaticMinimum(
						placement.columns.tracks,
						item.columnStart,
						item.columnEnd,
						measured.minContribution,
						boxEdges + margins,
						gap,
						available,
						charge,
						node.scrollableOverflow,
					)
				: Math.max(
						0,
						resolveLayoutLength(style["min-width"], 0) -
							(style["box-sizing"] === "border-box" ? boxEdges : 0),
					) +
					boxEdges +
					margins;
		return Object.freeze({
			start: item.columnStart,
			end: item.columnEnd,
			minimum: layoutNumber(Math.max(0, minimum)),
			minContent: layoutNumber(Math.max(0, measured.minContribution)),
			maxContent: layoutNumber(Math.max(0, measured.maxContribution)),
		});
	});
}
