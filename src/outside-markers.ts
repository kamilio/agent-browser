import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import { textFontExtent } from "./text-font.js";
import { disclosureMarkerExtent } from "./disclosure-marker.js";

export interface OutsideMarker {
	readonly id: number;
	readonly width: number;
	readonly height: number;
	readonly offsetY: number;
	readonly baselineOwner: number | null;
}

export interface OutsideMarkerRect extends OutsideMarker {
	readonly x: number;
	readonly y: number;
}

export function coordinateOutsideMarkers(
	layout: Readonly<DocumentLayout>,
	maxWork: number,
): Readonly<DocumentLayout> {
	const formatting = layout.text.horizontal.formatting;
	if (!formatting.metrics.outsideMarkers) return layout;
	let work = layout.metrics.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Outside marker layout work limit exceeded",
			);
	};
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	const positions = new Map(
		(layout.relativePositions ?? []).map((position) => {
			charge();
			return [position.id, position.top] as const;
		}),
	);
	const tops = new Map<number, number>();
	const order: number[] = [];
	const pending = [{ id: formatting.root, top: 0 }];
	while (pending.length) {
		charge();
		const current = pending.pop() as (typeof pending)[number];
		const top = layoutNumber(
			current.top + (positions.get(current.id) ?? 0),
			true,
		);
		tops.set(current.id, top);
		order.push(current.id);
		for (const child of formatting.nodes[current.id].children) {
			charge();
			pending.push({ id: child, top });
		}
	}
	const lines = new Map<number, { baseline: number; id: number }>();
	for (const context of layout.contexts) {
		charge();
		const line = context.lines[0];
		if (line)
			lines.set(context.id, {
				baseline: layoutNumber(
					line.baseline - (tops.get(context.id) ?? 0),
					true,
				),
				id: context.id,
			});
	}
	const markers: Readonly<OutsideMarker>[] = [];
	for (let index = order.length - 1; index >= 0; index--) {
		charge();
		const node = formatting.nodes[order[index]];
		if (!lines.has(node.id)) {
			for (const child of node.orderModifiedChildren ?? node.children) {
				charge();
				const descendant = formatting.nodes[child];
				if (
					descendant.position === "absolute" ||
					descendant.position === "fixed"
				)
					continue;
				const line = lines.get(child);
				if (line) {
					lines.set(node.id, line);
					break;
				}
			}
		}
		if (!node.outsideMarker) continue;
		const box = boxes.get(node.id);
		if (!box || !node.typography)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing outside marker principal box",
			);
		const font = textFontExtent(node.typography);
		const extent = disclosureMarkerExtent(node.outsideMarker, font.fontSize);
		const line = lines.get(node.id);
		const baseline = line
			? line.baseline + (tops.get(node.id) ?? 0)
			: box.contentY + (box.contentAlignmentOffset ?? 0) + font.above;
		markers.push(
			Object.freeze({
				id: node.id,
				width: extent.width,
				height: extent.height,
				offsetY: layoutNumber(baseline - box.borderY - font.ascent, true),
				baselineOwner: line?.id ?? null,
			}),
		);
	}
	return Object.freeze({
		...layout,
		outsideMarkers: Object.freeze(markers),
		metrics: Object.freeze({ ...layout.metrics, work }),
	});
}

export function* outsideMarkerRects(
	layout: Readonly<DocumentLayout>,
	charge: (amount?: number) => void,
): Generator<Readonly<OutsideMarkerRect>> {
	if (!layout.outsideMarkers?.length) return;
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	for (const marker of layout.outsideMarkers) {
		charge();
		const box = boxes.get(marker.id);
		if (!box)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing outside marker owner",
			);
		const x = layoutNumber(box.borderX - marker.width, true);
		const y = layoutNumber(box.borderY + marker.offsetY, true);
		layoutNumber(y + marker.height, true);
		yield Object.freeze({ ...marker, x, y });
	}
}
