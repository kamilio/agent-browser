import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export function inheritedAriaDisabled(
	tree: DocumentTree,
	target: number,
	maximumDepth = 1024,
) {
	let current: number | null = target;
	let depth = 0;
	while (current !== null) {
		if (++depth > maximumDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"ARIA-disabled ancestry limit exceeded",
			);
		const node = tree.get(current);
		const disabled = node.attributes["aria-disabled"]?.toLowerCase();
		if (disabled === "true" || disabled === "false") return disabled === "true";
		current = node.parent;
	}
	return false;
}
