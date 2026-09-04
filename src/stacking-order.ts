import type { FormattingTree } from "./formatting-tree.js";
import type { LayoutContentItem } from "./layout-paint-order.js";
import { AgentBrowserError } from "./errors.js";

interface PaintScope {
	id: number;
	level: number;
	order: number;
	context: boolean;
	backgrounds: LayoutContentItem[];
	content: LayoutContentItem[];
	children: PaintScope[];
}

export function* stackingContentItems(
	formatting: FormattingTree,
	items: Iterable<LayoutContentItem>,
	charge: (amount?: number) => void,
): Generator<LayoutContentItem> {
	const scope = (
		id: number,
		level: number,
		order: number,
		context: boolean,
	): PaintScope => ({
		id,
		level,
		order,
		context,
		backgrounds: [],
		content: [],
		children: [],
	});
	const root = scope(formatting.root, 0, 0, true);
	const scopes = new Map<number, PaintScope>([[root.id, root]]);
	charge(formatting.nodes.length);
	const owners = new Int32Array(formatting.nodes.length);
	const pending = [{ id: formatting.root, group: root, context: root }];
	let order = 0;
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		let group = state.group;
		let context = state.context;
		const rootElement =
			node.parent === formatting.root && node.ref !== undefined;
		if (
			node.id !== root.id &&
			(rootElement || node.position === "relative" || node.zIndex !== undefined)
		) {
			const actualContext = rootElement || node.zIndex !== undefined;
			group = scope(
				node.id,
				rootElement ? 0 : (node.zIndex ?? 0),
				order,
				actualContext,
			);
			context.children.push(group);
			scopes.set(group.id, group);
			if (actualContext) context = group;
		}
		owners[node.id] = group.id;
		order++;
		const children = node.orderModifiedChildren ?? node.children;
		for (let index = children.length - 1; index >= 0; index--) {
			charge();
			pending.push({ id: children[index], group, context });
		}
	}
	for (const item of items) {
		charge();
		const id =
			item.kind === "glyph"
				? item.glyph.formattingId
				: item.kind === "fragment"
					? item.fragment.formattingId
					: item.box.id;
		const owner = scopes.get(owners[id]);
		if (!owner)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing stacking paint owner",
			);
		if (owner.context && item.kind === "box" && item.box.id === owner.id)
			owner.backgrounds.push(item);
		else owner.content.push(item);
	}
	function* paint(owner: PaintScope): Generator<LayoutContentItem> {
		charge();
		for (const item of owner.backgrounds) {
			charge();
			yield item;
		}
		const children = owner.children.sort((left, right) => {
			charge();
			return left.level - right.level || left.order - right.order;
		});
		let index = 0;
		while (index < children.length && children[index].level < 0) {
			charge();
			yield* paint(children[index++]);
		}
		for (const item of owner.content) {
			charge();
			yield item;
		}
		while (index < children.length) {
			charge();
			yield* paint(children[index++]);
		}
	}
	yield* paint(root);
}
