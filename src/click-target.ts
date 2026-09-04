import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentHitTesting } from "./hit-testing.js";
import { documentStyles } from "./styles.js";
import { snapshotElementRole } from "./snapshot.js";

const ariaDisabledRoles = new Set([
	"application",
	"button",
	"composite",
	"gridcell",
	"group",
	"input",
	"link",
	"menuitem",
	"scrollbar",
	"separator",
	"tab",
	"checkbox",
	"columnheader",
	"combobox",
	"grid",
	"listbox",
	"menu",
	"menubar",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"radio",
	"radiogroup",
	"row",
	"rowheader",
	"searchbox",
	"select",
	"slider",
	"spinbutton",
	"switch",
	"tablist",
	"textbox",
	"toolbar",
	"tree",
	"treegrid",
	"treeitem",
]);

export const clickActionabilityCapabilities = Object.freeze({
	partial: true,
	commands: ["click"],
	profile: "supported-layout-fragments-root-scroll",
	pointSampling: "center-and-inset-edges",
	maxRectangles: 256,
	maxPoints: 64,
	maxAncestorDepth: 1024,
	rootScroll: true,
	pointerSequence: true,
	ariaDisabled: true,
	ariaRoleProfile: "existing-semantic-roles",
	stableAnimationFrames: false,
	replayDispatchedActions: false,
	nestedScroll: false,
	force: false,
});

export const hoverActionabilityCapabilities = Object.freeze({
	...clickActionabilityCapabilities,
	commands: ["hover"],
	pointerSequence: false,
	mouseMovement: true,
	requiresEnabled: false,
	ariaDisabled: false,
	preservesHeldButtons: true,
});

export interface ClickPoint {
	readonly x: number;
	readonly y: number;
}
export interface ClickTargetResult {
	readonly revision: number;
	readonly point?: ClickPoint;
	readonly blocked?:
		| "no-box"
		| "outside-viewport"
		| "covered"
		| "aria-disabled";
	readonly interceptingRef?: string;
	readonly points: number;
	readonly rectangles: number;
}

export function clickTargetContains(
	tree: DocumentTree,
	target: number,
	hit: number | null,
) {
	let current = hit;
	let depth = 0;
	while (current !== null) {
		if (++depth > clickActionabilityCapabilities.maxAncestorDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Click target ancestry limit exceeded",
			);
		if (current === target) return true;
		current = tree.get(current).parent;
	}
	return false;
}

export function clickTargetAriaDisabled(tree: DocumentTree, target: number) {
	if (!ariaDisabledRoles.has(snapshotElementRole(tree, target) ?? ""))
		return false;
	let current: number | null = target;
	let depth = 0;
	while (current !== null) {
		if (++depth > clickActionabilityCapabilities.maxAncestorDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Click target ancestry limit exceeded",
			);
		const node = tree.get(current);
		const disabled = node.attributes["aria-disabled"]?.toLowerCase();
		if (disabled === "true" || disabled === "false") return disabled === "true";
		current = node.parent;
	}
	return false;
}

export function findClickPoint(
	tree: DocumentTree,
	target: number,
): ClickTargetResult {
	return findReceivingPoint(tree, target, true);
}

export function findHoverPoint(
	tree: DocumentTree,
	target: number,
): ClickTargetResult {
	return findReceivingPoint(tree, target, false);
}

function findReceivingPoint(
	tree: DocumentTree,
	target: number,
	requiresEnabled: boolean,
): ClickTargetResult {
	if (tree.get(target).kind !== "element")
		throw new AgentBrowserError(
			"not-actionable",
			"Click target must be an element",
		);
	if (!tree.isConnected(target))
		throw new AgentBrowserError(
			"stale-reference",
			"Click target is no longer in this document",
		);
	if (requiresEnabled && clickTargetAriaDisabled(tree, target))
		return Object.freeze({
			revision: tree.revision,
			blocked: "aria-disabled",
			points: 0,
			rectangles: 0,
		});
	const rectangles = documentGeometry(tree).getClientRects(target);
	const viewport = documentStyles(tree).viewport;
	const hits = documentHitTesting(tree);
	let points = 0;
	let examined = 0;
	let hasBox = false;
	let interceptingRef: string | undefined;
	for (const rectangle of rectangles) {
		if (++examined > clickActionabilityCapabilities.maxRectangles)
			throw new AgentBrowserError(
				"resource-limit",
				"Click rectangle limit exceeded",
			);
		if (rectangle.width <= 0 || rectangle.height <= 0) continue;
		hasBox = true;
		const left = Math.max(0, rectangle.left);
		const right = Math.min(viewport.width, rectangle.right);
		const top = Math.max(0, rectangle.top);
		const bottom = Math.min(viewport.height, rectangle.bottom);
		if (right <= left || bottom <= top) continue;
		const insetX = Math.min(1, (right - left) / 2);
		const insetY = Math.min(1, (bottom - top) / 2);
		const horizontal = new Set([
			(left + right) / 2,
			left + insetX,
			right - insetX,
		]);
		const vertical = new Set([
			(top + bottom) / 2,
			top + insetY,
			bottom - insetY,
		]);
		for (const pointerY of vertical)
			for (const pointerX of horizontal) {
				if (++points > clickActionabilityCapabilities.maxPoints)
					throw new AgentBrowserError(
						"resource-limit",
						"Click point limit exceeded",
					);
				const hit = hits.elementFromPoint(pointerX, pointerY);
				if (clickTargetContains(tree, target, hit))
					return Object.freeze({
						revision: tree.revision,
						point: Object.freeze({ x: pointerX, y: pointerY }),
						points,
						rectangles: examined,
					});
				if (hit !== null) interceptingRef = tree.reference(hit);
			}
	}
	return Object.freeze({
		revision: tree.revision,
		blocked: !hasBox ? "no-box" : points === 0 ? "outside-viewport" : "covered",
		...(interceptingRef === undefined ? {} : { interceptingRef }),
		points,
		rectangles: examined,
	});
}
