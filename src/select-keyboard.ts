import {
	isControlDisabled,
	selectedOptions,
	selectOptions,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import {
	type SelectTypeahead,
	selectTypeaheadLimits,
} from "./select-typeahead.js";

export const selectKeyboardCapabilities = Object.freeze({
	partial: true,
	keys: Object.freeze([
		"ArrowDown",
		"ArrowRight",
		"ArrowUp",
		"ArrowLeft",
		"Home",
		"End",
	]),
	maxOptions: 5000,
	multiple: false,
	typeahead: true,
	typeaheadProfile: "timed-prefix-canonical-accent-folding",
	typeaheadLimits: selectTypeaheadLimits,
	popup: false,
	wrap: false,
});

export function* selectKeyboardAction(
	tree: DocumentTree,
	id: number,
	key: string,
	typeahead: SelectTypeahead,
	time: number,
): EventAction<void> {
	const node = tree.get(id);
	const navigation = selectKeyboardCapabilities.keys.includes(key);
	const printable = Array.from(key).length === 1;
	if (!navigation) {
		if (key === "Enter" || (key === " " && !typeahead.active(id, time)))
			throw new AgentBrowserError(
				"unsupported",
				"Select keyboard popup is not implemented",
			);
		if (!printable) return;
	}
	if (Object.hasOwn(node.attributes, "multiple"))
		throw new AgentBrowserError(
			"unsupported",
			"Multiple-select keyboard selection is not implemented",
		);
	const options = selectOptions(tree, id);
	if (options.length > selectKeyboardCapabilities.maxOptions)
		throw new AgentBrowserError(
			"resource-limit",
			"Select keyboard option limit exceeded",
		);
	const selected = selectedOptions(tree, id)[0]?.id;
	if (!navigation) {
		const match = typeahead.find(id, key, time, options, selected);
		if (match !== undefined && match !== selected)
			yield* selectOptionAction(tree, id, match);
		return;
	}
	const current = options.findIndex((option) => option.id === selected);
	const backwards = key === "ArrowUp" || key === "ArrowLeft" || key === "End";
	const direction = backwards ? -1 : 1;
	let index =
		key === "Home"
			? 0
			: key === "End"
				? options.length - 1
				: current < 0
					? backwards
						? options.length - 1
						: 0
					: current + direction;
	while (index >= 0 && index < options.length) {
		const option = options[index];
		if (!isControlDisabled(tree, option.id)) {
			if (option.id === selected) return;
			yield* selectOptionAction(tree, id, option.id);
			return;
		}
		index += direction;
	}
}

function* selectOptionAction(
	tree: DocumentTree,
	id: number,
	option: number,
): EventAction<void> {
	tree.setSelectSelection(id, [option]);
	yield {
		target: id,
		event: new BrowserEvent("input", { bubbles: true, composed: true }),
	};
	yield {
		target: id,
		event: new BrowserEvent("change", { bubbles: true }),
	};
}
