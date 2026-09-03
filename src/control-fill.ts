import {
	inputType,
	isControlDisabled,
	isTextControl,
	validateTextControl,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { sanitizeCalendarInput } from "./input-calendar.js";

function calendarControl(node: Readonly<DocumentNode>): boolean {
	return (
		node.tagName === "input" &&
		["date", "month", "week", "time", "datetime-local"].includes(
			inputType(node),
		)
	);
}

export function isFillableControl(node: Readonly<DocumentNode>): boolean {
	return isTextControl(node) || calendarControl(node);
}

export function prepareControlFill(
	tree: DocumentTree,
	reference: string,
	value: string,
) {
	if (typeof value !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Control value must be a string",
		);
	const node = tree.resolve(reference);
	const type = inputType(node);
	if (isTextControl(node)) {
		validateTextControl(tree, reference, value);
		return { node, type, value, calendar: false };
	}
	if (!calendarControl(node))
		throw new AgentBrowserError(
			"not-actionable",
			"Expected a text, number or calendar control",
		);
	if (isControlDisabled(tree, node.id))
		throw new AgentBrowserError("not-actionable", "Control is disabled");
	if (Object.hasOwn(node.attributes, "readonly"))
		throw new AgentBrowserError("not-actionable", "Control is readonly");
	const trimmed = value.trim();
	const sanitized = sanitizeCalendarInput(type, trimmed);
	if (sanitized === undefined || (trimmed !== "" && sanitized === ""))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid calendar control value",
		);
	return { node, type, value: sanitized, calendar: true };
}
