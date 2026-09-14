import { documentScroll } from "./document-scroll.js";
import { contentEditableState } from "./content-editability.js";
import { summaryDetails } from "./details.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import type { KeyboardKey } from "./keyboard-state.js";

export const keyboardScrollCapabilities = Object.freeze({
	partial: true,
	profile: "instant-ltr-nested-scrollports",
	keys: [
		"ArrowLeft",
		"ArrowRight",
		"ArrowUp",
		"ArrowDown",
		"PageUp",
		"PageDown",
		"Home",
		"End",
		"Space",
		"Shift+Space",
	],
	linePixels: 40,
	pageFraction: 0.875,
	notifications: "command-step",
	controlScrolling: false,
	platformShortcuts: false,
	smooth: false,
	scrollend: false,
	maxAncestors: 1024,
});

export function* keyboardScrollAction(
	tree: DocumentTree,
	id: number | null,
	key: KeyboardKey,
): EventAction<Readonly<{ x: number; y: number }> | undefined> {
	if (key.control || key.meta || key.alt || (key.shift && key.key !== " "))
		return;
	if (
		![
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
			"PageUp",
			"PageDown",
			"Home",
			"End",
			" ",
		].includes(key.key)
	)
		return;
	if (id !== null) {
		if (
			key.key === " " &&
			tree.activeElement === id &&
			tree.generatedFocusReference !== null
		)
			return;
		let ancestor: number | null = id;
		let depth = 0;
		let editable: boolean | undefined;
		while (ancestor !== null) {
			if (++depth > keyboardScrollCapabilities.maxAncestors)
				throw new AgentBrowserError(
					"resource-limit",
					"Keyboard scroll ancestor limit exceeded",
				);
			const node = tree.get(ancestor);
			if (["input", "select", "textarea"].includes(node.tagName ?? "")) return;
			if (
				key.key === " " &&
				(node.tagName === "button" || summaryDetails(tree, node) !== undefined)
			)
				return;
			if (editable === undefined) {
				const state = contentEditableState(node);
				if (state !== "inherit") editable = state !== "false";
			}
			ancestor = node.parent;
		}
		if (editable) return;
	}
	const scroll = documentScroll(tree);
	const scrolling = documentElementScroll(tree);
	const root = tree
		.get(tree.root)
		.children.find((target) => tree.get(target).kind === "element");
	const target = id !== null && tree.isConnected(id) ? id : root;
	const chain = target === undefined ? [] : scrolling.chain(target, true);
	const line = keyboardScrollCapabilities.linePixels;
	const horizontal = key.key === "ArrowLeft" || key.key === "ArrowRight";
	for (const owner of chain) {
		const allowed = scrolling.allows(owner, true);
		if (horizontal ? !allowed.x : !allowed.y) continue;
		const port = scrolling.port(owner);
		if (!port) continue;
		const position = scrolling.get(owner);
		const page = Math.max(
			1,
			port.height * keyboardScrollCapabilities.pageFraction,
		);
		let changed = false;
		switch (key.key) {
			case "ArrowLeft":
				changed = scrolling.userBy(owner, -line, 0);
				break;
			case "ArrowRight":
				changed = scrolling.userBy(owner, line, 0);
				break;
			case "ArrowUp":
				changed = scrolling.userBy(owner, 0, -line);
				break;
			case "ArrowDown":
				changed = scrolling.userBy(owner, 0, line);
				break;
			case "PageUp":
				changed = scrolling.userBy(owner, 0, -page);
				break;
			case "PageDown":
				changed = scrolling.userBy(owner, 0, page);
				break;
			case "Home":
				changed = scrolling.to(owner, position.scrollLeft, 0);
				break;
			case "End":
				changed = scrolling.to(
					owner,
					position.scrollLeft,
					scrolling.bounds(owner).y,
				);
				break;
			case " ":
				changed = scrolling.userBy(owner, 0, key.shift ? -page : page);
				break;
		}
		if (changed) {
			const root = port.id === -1;
			yield {
				target: root ? tree.root : owner,
				event: new BrowserEvent("scroll", { bubbles: root }),
			};
			break;
		}
	}
	return scroll.get();
}
