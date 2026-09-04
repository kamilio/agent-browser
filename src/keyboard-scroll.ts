import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import type { KeyboardKey } from "./keyboard-state.js";
import { documentStyles } from "./styles.js";

export const keyboardScrollCapabilities = Object.freeze({
	partial: true,
	profile: "instant-ltr-root-viewport",
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
			if (key.key === " " && node.tagName === "button") return;
			if (
				editable === undefined &&
				Object.hasOwn(node.attributes, "contenteditable")
			) {
				const value = node.attributes.contenteditable.toLowerCase();
				if (["", "true", "plaintext-only"].includes(value)) editable = true;
				else if (value === "false") editable = false;
			}
			ancestor = node.parent;
		}
		if (editable) return;
	}
	const scroll = documentScroll(tree);
	const position = scroll.get();
	const line = keyboardScrollCapabilities.linePixels;
	const page = Math.max(
		1,
		documentStyles(tree).viewport.height *
			keyboardScrollCapabilities.pageFraction,
	);
	let changed = false;
	switch (key.key) {
		case "ArrowLeft":
			changed = scroll.by(-line, 0);
			break;
		case "ArrowRight":
			changed = scroll.by(line, 0);
			break;
		case "ArrowUp":
			changed = scroll.by(0, -line);
			break;
		case "ArrowDown":
			changed = scroll.by(0, line);
			break;
		case "PageUp":
			changed = scroll.by(0, -page);
			break;
		case "PageDown":
			changed = scroll.by(0, page);
			break;
		case "Home":
			changed = scroll.to(position.x, 0);
			break;
		case "End":
			changed = scroll.to(position.x, scroll.bounds().y);
			break;
		case " ":
			changed = scroll.by(0, key.shift ? -page : page);
			break;
	}
	if (changed)
		yield {
			target: tree.root,
			event: new BrowserEvent("scroll", { bubbles: true }),
		};
	return scroll.get();
}
