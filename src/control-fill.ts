import {
	inputType,
	isControlDisabled,
	isTextControl,
	validateTextControl,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { sanitizeCalendarInput } from "./input-calendar.js";
import { validNumberValue } from "./input-number.js";
import { sanitizeRangeInput } from "./input-range.js";
import { editableFillHost } from "./editable-fill.js";

function calendarControl(node: Readonly<DocumentNode>): boolean {
	return (
		node.tagName === "input" &&
		["date", "month", "week", "time", "datetime-local"].includes(
			inputType(node),
		)
	);
}

export function isFillableControl(node: Readonly<DocumentNode>): boolean {
	return (
		isTextControl(node) ||
		calendarControl(node) ||
		(node.tagName === "input" && inputType(node) === "range")
	);
}

export function isFillReadOnly(node: Readonly<DocumentNode>): boolean {
	return (
		(isTextControl(node) || calendarControl(node)) &&
		Object.hasOwn(node.attributes, "readonly")
	);
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
		return { node, type, value, direct: false };
	}
	if (!isFillableControl(node)) {
		const editableHost = editableFillHost(tree, node.id);
		if (editableHost !== null) {
			if (value.length > tree.limits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Editable fill text limit exceeded",
				);
			return {
				node,
				type: "contenteditable",
				value,
				direct: false,
				editableHost,
			};
		}
		throw new AgentBrowserError(
			"not-actionable",
			"Expected a text, number, calendar or range control, or a contenteditable element",
		);
	}
	if (isControlDisabled(tree, node.id))
		throw new AgentBrowserError("not-actionable", "Control is disabled");
	if (isFillReadOnly(node))
		throw new AgentBrowserError("not-actionable", "Control is readonly");
	const trimmed = value.trim();
	if (type === "range") {
		if (!validNumberValue(trimmed))
			throw new AgentBrowserError(
				"invalid-input",
				"Range fill requires a finite numeric value",
			);
		const sanitized = sanitizeRangeInput(trimmed, node.attributes);
		if (sanitized !== trimmed)
			throw new AgentBrowserError(
				"invalid-input",
				"Range fill would clamp or round the requested value",
			);
		return { node, type, value: sanitized, direct: true };
	}
	const sanitized = sanitizeCalendarInput(type, trimmed);
	if (sanitized === undefined || (trimmed !== "" && sanitized === ""))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid calendar control value",
		);
	return { node, type, value: sanitized, direct: true };
}
