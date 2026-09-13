import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { resolveRadiusStyle } from "./css-radius.js";
import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import type { FormattingNode } from "./formatting-tree.js";
import type { LayoutContentItem } from "./layout-paint-order.js";
import {
	createRoundedBox,
	insetRoundedBox,
	type RoundedBox,
} from "./rounded-box.js";

export interface RoundedDecoration {
	readonly outer: RoundedBox;
	readonly bounds: Readonly<{
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
	readonly content?: RoundedBox;
	readonly borders: ReturnType<typeof resolveBorders>;
}

export function roundedOwnerKey(
	node: Readonly<FormattingNode>,
): string | undefined {
	return node.generatedContent
		? `generated:${node.generatedContent.owner}:${node.generatedContent.name}`
		: node.ref?.startsWith("e")
			? node.ref
			: undefined;
}

export function prepareRoundedLayout(
	layout: DocumentLayout,
	items: readonly LayoutContentItem[],
	charge: (amount?: number) => void,
) {
	const decorations = new Map<LayoutContentItem, Readonly<RoundedDecoration>>();
	const owners = new Map<string, Readonly<RoundedDecoration>[]>();
	const nodes = layout.text.horizontal.formatting.nodes;
	const images = new Map(
		layout.text.horizontal.images.map((image) => {
			charge();
			return [image.id, image] as const;
		}),
	);
	const fragments = new Map<
		string,
		Extract<LayoutContentItem, { kind: "fragment" }>[]
	>();
	const append = (
		item: LayoutContentItem,
		node: Readonly<FormattingNode>,
		decoration: RoundedDecoration,
	) => {
		charge(1);
		const frozen = Object.freeze(decoration);
		decorations.set(item, frozen);
		const key = roundedOwnerKey(node);
		if (key) {
			const entries = owners.get(key) ?? [];
			entries.push(frozen);
			owners.set(key, entries);
		}
	};
	for (const item of items) {
		charge();
		if (
			item.kind !== "box" &&
			item.kind !== "image" &&
			item.kind !== "fragment"
		)
			continue;
		const node =
			nodes[
				item.kind === "fragment" ? item.fragment.formattingId : item.box.id
			];
		if (!node.radius) continue;
		if (item.kind === "fragment") {
			if (node.kind === "replaced") {
				charge(32);
				const used = images.get(node.id);
				if (!used)
					throw new AgentBrowserError(
						"unsupported",
						"Missing rounded replaced geometry",
					);
				const fragment = item.fragment;
				const bounds = Object.freeze({
					x: fragment.x,
					y: fragment.y,
					width: fragment.width,
					height: fragment.height,
				});
				const outer = createRoundedBox(
					bounds.x,
					bounds.y,
					bounds.width,
					bounds.height,
					resolveRadiusStyle(node.radius, bounds.width, bounds.height),
				);
				const content = insetRoundedBox(outer, {
					top: used.borderTop + used.paddingTop,
					right: used.borderRight + used.paddingRight,
					bottom: used.borderBottom + used.paddingBottom,
					left: used.borderLeft + used.paddingLeft,
				});
				append(item, node, {
					outer,
					bounds,
					content,
					borders: resolveBorders(node.box ?? initialBoxStyle),
				});
				continue;
			}
			const key = roundedOwnerKey(node) ?? `formatting:${node.id}`;
			const group = fragments.get(key) ?? [];
			group.push(item);
			fragments.set(key, group);
			continue;
		}
		charge(32);
		const box = item.box;
		const bounds = Object.freeze({
			x: box.borderX,
			y: box.borderY,
			width: box.borderBoxWidth,
			height: box.borderBoxHeight,
		});
		const outer = createRoundedBox(
			bounds.x,
			bounds.y,
			bounds.width,
			bounds.height,
			resolveRadiusStyle(node.radius, bounds.width, bounds.height),
		);
		const content = insetRoundedBox(outer, {
			top: box.borderTop + box.paddingTop,
			right: box.borderRight + box.paddingRight,
			bottom: box.borderBottom + box.paddingBottom,
			left: box.borderLeft + box.paddingLeft,
		});
		append(item, node, {
			outer,
			bounds,
			content,
			borders: resolveBorders(node.box ?? initialBoxStyle),
		});
	}
	for (const group of fragments.values()) {
		let width = 0;
		const height = group[0].fragment.height;
		for (const item of group) {
			charge();
			if (item.fragment.height !== height)
				throw new AgentBrowserError(
					"unsupported",
					"Unequal-height rounded inline slices are not supported",
				);
			width += item.fragment.width;
		}
		let offset = 0;
		for (const item of group) {
			charge(32);
			const fragment = item.fragment;
			const node = nodes[fragment.formattingId];
			const bounds = Object.freeze({
				x: fragment.x,
				y: fragment.y,
				width: fragment.width,
				height,
			});
			const outer = createRoundedBox(
				fragment.x - offset,
				fragment.y,
				width,
				height,
				resolveRadiusStyle(node.radius!, width, height),
			);
			append(item, node, {
				outer,
				bounds,
				borders: resolveBorders(node.box ?? initialBoxStyle),
			});
			offset += fragment.width;
		}
	}
	return { decorations, owners };
}

export function translateRoundedBox(
	box: RoundedBox | undefined,
	horizontal: number,
	vertical: number,
): RoundedBox | undefined {
	return box
		? Object.freeze({ ...box, x: box.x + horizontal, y: box.y + vertical })
		: undefined;
}
