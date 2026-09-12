import type { DocumentBox, DocumentLayout } from "./document-layout.js";
import { isAtomicInline } from "./inline-atomic.js";
import { stackingContentItems } from "./stacking-order.js";
import type { TextGlyph, TextInlineFragment } from "./text-layout.js";
import {
	outsideMarkerRects,
	type OutsideMarkerRect,
} from "./outside-markers.js";

export type LayoutContentItem =
	| { kind: "marker"; marker: Readonly<OutsideMarkerRect> }
	| { kind: "image"; box: Readonly<DocumentBox> }
	| { kind: "box"; box: Readonly<DocumentBox> }
	| { kind: "table-borders"; box: Readonly<DocumentBox> }
	| { kind: "fragment"; fragment: Readonly<TextInlineFragment> }
	| { kind: "glyph"; glyph: Readonly<TextGlyph>; contentY: number };

export function* layoutContentItems(
	layout: DocumentLayout,
	charge: (amount?: number) => void,
): Generator<LayoutContentItem> {
	const nodes = layout.text.horizontal.formatting.nodes;
	if (
		!layout.relativePositions?.length &&
		!nodes.some((node) => {
			charge();
			return (
				node.floatSide !== undefined ||
				node.zIndex !== undefined ||
				node.position === "absolute" ||
				node.position === "fixed"
			);
		})
	) {
		yield* flowContentItems(layout, charge);
		return;
	}
	yield* stackingContentItems(
		layout.text.horizontal.formatting,
		flowContentItems(layout, charge),
		charge,
	);
}

function* flowContentItems(
	layout: DocumentLayout,
	charge: (amount?: number) => void,
): Generator<LayoutContentItem> {
	const nodes = layout.text.horizontal.formatting.nodes;
	const paintOrder = new Int32Array(nodes.length);
	type Group = { id: number } & (
		| { kind: "scope" }
		| { kind: "marker"; marker: Readonly<OutsideMarkerRect> }
		| { kind: "image"; box: Readonly<DocumentBox> }
		| { kind: "context"; contextIndex: number }
	);
	type Scope = {
		boxes: Readonly<DocumentBox>[];
		tableBorders: Readonly<DocumentBox>[];
		floats: number[];
		groups: Group[];
	};
	const root = layout.text.horizontal.formatting.root;
	const scopes = new Map<number, Scope>([
		[root, { boxes: [], tableBorders: [], floats: [], groups: [] }],
	]);
	const owners = new Int32Array(nodes.length);
	const collapsedBackgroundEnds = new Map<number, number>();
	let order = 0;
	const pending = [{ id: root, scope: root }];
	while (pending.length) {
		charge();
		const { id, scope: parentScope } = pending.pop() as {
			id: number;
			scope: number;
		};
		let scope = parentScope;
		const atomic = isAtomicInline(nodes[id]);
		const floating = nodes[id].floatSide !== undefined;
		if (
			floating ||
			nodes[id].flexItem ||
			nodes[id].gridItem ||
			atomic ||
			nodes[id].display === "table-cell"
		) {
			scope = id;
			scopes.set(id, { boxes: [], tableBorders: [], floats: [], groups: [] });
			if (floating) scopes.get(parentScope)?.floats.push(id);
			else if (!atomic)
				scopes.get(parentScope)?.groups.push({ kind: "scope", id });
		}
		owners[id] = scope;
		paintOrder[id] = order++;
		const children = nodes[id].orderModifiedChildren ?? nodes[id].children;
		for (let index = children.length - 1; index >= 0; index--) {
			charge();
			pending.push({ id: children[index], scope });
		}
	}
	for (const box of layout.boxes) {
		charge();
		const node = nodes[box.id];
		if (
			node.collapsedBorderOwner !== undefined &&
			node.display !== "table-cell"
		)
			collapsedBackgroundEnds.set(
				node.collapsedBorderOwner,
				Math.max(
					collapsedBackgroundEnds.get(node.collapsedBorderOwner) ?? 0,
					paintOrder[box.id],
				),
			);
		const backgroundOwner =
			node.display === "table-cell" && node.collapsedBorderOwner !== undefined
				? node.collapsedBorderOwner
				: box.id;
		const scope = scopes.get(owners[backgroundOwner]) as Scope;
		if (node.kind === "replaced")
			scope.groups.push({ kind: "image", id: box.id, box });
		else scope.boxes.push(box);
		if (box.collapsedTableBorders !== undefined)
			(scopes.get(owners[box.id]) as Scope).tableBorders.push(box);
	}
	for (const marker of outsideMarkerRects(layout, charge)) {
		charge();
		scopes
			.get(owners[marker.id])
			?.groups.push({ kind: "marker", id: marker.id, marker });
	}
	for (
		let contextIndex = 0;
		contextIndex < layout.contexts.length;
		contextIndex++
	) {
		charge();
		const id = layout.contexts[contextIndex].id;
		scopes.get(owners[id])?.groups.push({ kind: "context", id, contextIndex });
	}
	const ordered = (left: { id: number }, right: { id: number }) => {
		charge();
		return paintOrder[left.id] - paintOrder[right.id];
	};
	const backgroundOrder = (box: Readonly<DocumentBox>) => {
		const node = nodes[box.id];
		return node.display === "table-cell" &&
			node.collapsedBorderOwner !== undefined
			? (collapsedBackgroundEnds.get(node.collapsedBorderOwner) ??
					paintOrder[node.collapsedBorderOwner]) + 0.5
			: paintOrder[box.id];
	};
	const orderedBackgrounds = (
		left: Readonly<DocumentBox>,
		right: Readonly<DocumentBox>,
	) => {
		charge();
		return (
			backgroundOrder(left) - backgroundOrder(right) ||
			paintOrder[left.id] - paintOrder[right.id]
		);
	};
	function* paintScope(id: number): Generator<LayoutContentItem> {
		charge();
		const scope = scopes.get(id) as Scope;
		for (const box of scope.boxes.sort(
			collapsedBackgroundEnds.size ? orderedBackgrounds : ordered,
		)) {
			charge();
			yield { kind: "box", box };
		}
		for (const box of scope.tableBorders.sort(ordered)) {
			charge();
			yield { kind: "table-borders", box };
		}
		for (const float of scope.floats) {
			charge();
			yield* paintScope(float);
		}
		for (const group of scope.groups.sort(ordered)) {
			charge();
			if (group.kind === "marker") {
				yield { kind: "marker", marker: group.marker };
				continue;
			}
			if (group.kind === "scope") {
				yield* paintScope(group.id);
				continue;
			}
			if (group.kind === "image") {
				yield { kind: "image", box: group.box };
				continue;
			}
			const context = layout.contexts[group.contextIndex];
			const glyphs = layout.text.contexts[group.contextIndex].glyphs;
			charge();
			for (const line of context.lines) {
				charge();
				charge(line.fragmentEnd - line.fragmentStart);
				const fragments = context.fragments
					.slice(line.fragmentStart, line.fragmentEnd)
					.sort((left, right) => {
						charge();
						return (
							paintOrder[left.formattingId] - paintOrder[right.formattingId]
						);
					});
				let glyphIndex = line.glyphStart;
				for (const fragment of fragments) {
					charge();
					while (
						glyphIndex < line.glyphEnd &&
						paintOrder[glyphs[glyphIndex].formattingId] <
							paintOrder[fragment.formattingId]
					)
						yield {
							kind: "glyph",
							glyph: glyphs[glyphIndex++],
							contentY: context.contentY,
						};
					if (fragment.atomic) yield* paintScope(fragment.formattingId);
					else yield { kind: "fragment", fragment };
				}
				for (let index = glyphIndex; index < line.glyphEnd; index++)
					yield {
						kind: "glyph",
						glyph: glyphs[index],
						contentY: context.contentY,
					};
			}
		}
	}
	yield* paintScope(root);
}
