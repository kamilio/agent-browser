import {
	documentLayoutLimits,
	type DocumentLayout,
} from "./document-layout.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import { scrollsOverflow } from "./overflow-policy.js";
import { positionDocumentLayout } from "./relative-positioning.js";
import { projectStickyLayout } from "./sticky-positioning.js";

export interface ScrollLayoutOverrides {
	readonly elements?: ReadonlyMap<number, Readonly<{ x: number; y: number }>>;
	readonly root?: Readonly<{ x: number; y: number }>;
}

export function projectScrollLayout(
	tree: DocumentTree,
	layout: Readonly<DocumentLayout>,
	maxWork: number = documentLayoutLimits.maxWork,
	overrides?: Readonly<ScrollLayoutOverrides>,
): Readonly<DocumentLayout> {
	const scroll = overrides?.root ?? documentScrollPosition(tree);
	const formatting = layout.text.horizontal.formatting;
	if (!formatting.nodes.some((node) => node.overflow))
		return projectStickyLayout(layout, scroll, maxWork);
	const snapshot = documentElementScroll(tree).snapshot(layout);
	let work = layout.metrics.work + snapshot.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Overflow projection work limit exceeded",
			);
	};
	charge();
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	const borders = new Map<number, Readonly<{ left: number; top: number }>>();
	const contents = new Map<number, Readonly<{ left: number; top: number }>>();
	const offsets: NonNullable<DocumentLayout["scrollOffsets"]>[number][] = [];
	const zero: Readonly<{ left: number; top: number }> = Object.freeze({
		left: 0,
		top: 0,
	});
	const pending = [{ id: formatting.root, ...zero }];
	let moved = false;
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		if (!node)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing overflow formatting owner",
			);
		let border = Object.freeze({ left: state.left, top: state.top });
		if (node.position === "fixed") border = zero;
		else if (node.position === "absolute") {
			const owner = boxes.get(node.id)?.containingBlock;
			const inherited = owner === undefined ? undefined : contents.get(owner);
			if (!inherited)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing overflow containing-block frame",
				);
			border = inherited;
		}
		borders.set(node.id, border);
		let position = snapshot.positions.get(node.id);
		const port = snapshot.ports.get(node.id);
		const override = node.ref?.startsWith("e")
			? overrides?.elements?.get(Number(node.ref.slice(1)))
			: undefined;
		if (override && port) {
			position = Object.freeze({
				x: scrollsOverflow(port.overflow.x)
					? Math.max(
							0,
							Math.min(
								layoutNumber(override.x, true),
								port.scrollWidth - port.width,
							),
						)
					: 0,
				y: scrollsOverflow(port.overflow.y)
					? Math.max(
							0,
							Math.min(
								layoutNumber(override.y, true),
								port.scrollHeight - port.height,
							),
						)
					: 0,
			});
		}
		const content = Object.freeze({
			left: layoutNumber(border.left - (position?.x ?? 0), true),
			top: layoutNumber(border.top - (position?.y ?? 0), true),
		});
		contents.set(node.id, content);
		if (border.left || border.top || content.left || content.top) {
			moved = true;
			offsets.push(
				Object.freeze({
					id: node.id,
					...border,
					contentLeft: content.left,
					contentTop: content.top,
				}),
			);
		}
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({ id: node.children[index], ...content });
		}
	}
	const measured = Object.freeze({
		...layout,
		scrollOffsets: Object.freeze(offsets),
		metrics: Object.freeze({ ...layout.metrics, work }),
	});
	const resolve = (map: typeof borders, id: number) => {
		const value = map.get(id);
		if (!value)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing overflow projection frame",
			);
		return value;
	};
	const projected = moved
		? positionDocumentLayout(
				measured,
				(id) => resolve(borders, id),
				maxWork,
				(id) => resolve(contents, id),
			)
		: measured;
	return projectStickyLayout(projected, scroll, maxWork);
}
