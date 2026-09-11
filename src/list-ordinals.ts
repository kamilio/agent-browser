import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

const htmlTypes: Readonly<Record<string, string>> = Object.freeze({
	"1": "decimal",
	a: "lower-alpha",
	A: "upper-alpha",
	i: "lower-roman",
	I: "upper-roman",
});

export const listOrdinalLimits = Object.freeze({ integerCodeUnits: 16_384 });

export function htmlListStyleType(node: Readonly<DocumentNode>) {
	if (!isHtmlElement(node)) return undefined;
	if (node.tagName === "ul" || node.tagName === "menu") return "disc";
	if (node.tagName !== "ol" && node.tagName !== "li") return undefined;
	const type = node.attributes.type;
	if (type !== undefined && Object.hasOwn(htmlTypes, type))
		return htmlTypes[type];
	return node.tagName === "ol" ? "decimal" : undefined;
}

export function parseListInteger(
	value: string | undefined,
	charge: (amount: number) => void,
) {
	if (value === undefined) return undefined;
	if (value.length > listOrdinalLimits.integerCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"List integer text limit exceeded",
		);
	charge(value.length + 1);
	const match = /^[\t\n\f\r ]*([+-]?\d+)/.exec(value);
	if (!match) return undefined;
	const integer = Number(match[1]);
	if (!Number.isSafeInteger(integer))
		throw new AgentBrowserError(
			"resource-limit",
			"List ordinal precision limit exceeded",
		);
	return integer === 0 ? 0 : integer;
}

export function resolveListOrdinals(
	tree: DocumentTree,
	renderedItems: ReadonlySet<number>,
	boxProducers: ReadonlySet<number>,
	charge: (amount: number) => void,
	targets: ReadonlySet<number> = renderedItems,
): ReadonlyMap<number, number> {
	tree.get(tree.root);
	if (
		renderedItems.size > tree.limits.maxNodes ||
		targets.size > renderedItems.size
	)
		throw new AgentBrowserError(
			"resource-limit",
			"List item count limit exceeded",
		);
	for (const target of targets) {
		charge(1);
		if (!renderedItems.has(target))
			throw new AgentBrowserError(
				"invalid-input",
				"List ordinal target is not rendered",
			);
	}
	const result = new Map<number, number>();
	if (!targets.size) return result;
	const listAncestors = new Map<number, number>();
	const boxAncestors = new Map<number, number>();
	const groups = new Map<number, { items: number[]; lastTarget: number }>();
	let collected = 0;
	for (const { node } of tree.walk()) {
		charge(1);
		const parentList =
			node.parent === null ? undefined : listAncestors.get(node.parent);
		const parentBox =
			node.parent === null ? undefined : boxAncestors.get(node.parent);
		const box = boxProducers.has(node.id) ? node.id : parentBox;
		if (box !== undefined) boxAncestors.set(node.id, box);
		const list =
			isHtmlElement(node) && ["ol", "ul", "menu"].includes(node.tagName)
				? node.id
				: parentList;
		if (list !== undefined) listAncestors.set(node.id, list);
		if (!renderedItems.has(node.id)) continue;
		collected++;
		const owner =
			parentList === undefined ? parentBox : boxAncestors.get(parentList);
		if (owner === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"List item requires a rendered owner",
			);
		let group = groups.get(owner);
		if (!group) {
			group = { items: [], lastTarget: -1 };
			groups.set(owner, group);
		}
		if (targets.has(node.id)) group.lastTarget = group.items.length;
		group.items.push(node.id);
	}
	if (collected !== renderedItems.size)
		throw new AgentBrowserError(
			"invalid-input",
			"List item is not in the document tree",
		);
	for (const [ownerId, group] of groups) {
		charge(1);
		if (group.lastTarget < 0) continue;
		const owner = tree.get(ownerId);
		const ordered = isHtmlElement(owner, "ol");
		const reversed = ordered && Object.hasOwn(owner.attributes, "reversed");
		let ordinal = ordered
			? parseListInteger(owner.attributes.start, charge)
			: undefined;
		if (ordinal === undefined) {
			ordinal = reversed ? 0 : 1;
			if (reversed)
				for (const item of group.items) {
					charge(1);
					if (isHtmlElement(tree.get(item), "li")) ordinal++;
				}
		}
		for (let index = 0; index <= group.lastTarget; index++) {
			charge(1);
			const item = tree.get(group.items[index]);
			const value = isHtmlElement(item, "li")
				? parseListInteger(item.attributes.value, charge)
				: undefined;
			if (value !== undefined) ordinal = value;
			if (targets.has(item.id)) {
				if (!Number.isSafeInteger(ordinal))
					throw new AgentBrowserError(
						"resource-limit",
						"List ordinal precision limit exceeded",
					);
				result.set(item.id, ordinal);
			}
			ordinal += reversed ? -1 : 1;
		}
	}
	return result;
}
