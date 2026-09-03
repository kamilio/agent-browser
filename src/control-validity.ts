import { lengthValidity } from "./control-length.js";
import {
	controlChecked,
	controlValue,
	inputType,
	isControlDisabled,
	optionValue,
	radioGroup,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { FormSubmissionOptions } from "./forms.js";
import { validEmailValue } from "./input-email.js";
import { numberValidity } from "./input-number.js";

export const validityProperties = [
	"valueMissing",
	"typeMismatch",
	"patternMismatch",
	"tooLong",
	"tooShort",
	"rangeUnderflow",
	"rangeOverflow",
	"stepMismatch",
	"badInput",
	"customError",
	"valid",
] as const;
export type ValidityProperty = (typeof validityProperties)[number];
export type ControlValidity = Readonly<Record<ValidityProperty, boolean>>;

export function controlValidity(
	tree: DocumentTree,
	id: number,
	options: FormSubmissionOptions = {},
	radioMissing = new Map<number, boolean>(),
): ControlValidity {
	const node = tree.get(id);
	const flags = {
		valueMissing: false,
		typeMismatch: false,
		patternMismatch: false,
		tooLong: false,
		tooShort: false,
		rangeUnderflow: false,
		rangeOverflow: false,
		stepMismatch: false,
		badInput: false,
		customError: tree.getCustomValidity(id) !== "",
		valid: false,
	};
	const finish = () =>
		Object.freeze({ ...flags, valid: !Object.values(flags).some(Boolean) });
	const type = inputType(node);
	if (
		["button", "fieldset", "object", "output"].includes(node.tagName) ||
		(node.tagName === "input" &&
			["hidden", "button", "reset", "submit", "image"].includes(type))
	)
		return finish();
	if (!["input", "textarea", "select"].includes(node.tagName))
		throw new AgentBrowserError(
			"invalid-input",
			"Expected a validation control",
		);
	const value = controlValue(tree, id);
	Object.assign(
		flags,
		lengthValidity(node, value, tree.wasUserEditedValue(id)),
	);
	const required = Object.hasOwn(node.attributes, "required");
	const mutable =
		!isControlDisabled(tree, id) && !Object.hasOwn(node.attributes, "readonly");
	if (
		node.tagName === "input" &&
		[
			"email",
			"number",
			"date",
			"month",
			"week",
			"time",
			"datetime-local",
		].includes(type) &&
		value === ""
	) {
		flags.valueMissing = required && mutable;
		return finish();
	}
	if (node.tagName === "input" && type === "number") {
		Object.assign(flags, numberValidity(value, node.attributes));
		return finish();
	}
	if (
		["pattern", "min", "max", "step"].some(
			(name) =>
				Object.hasOwn(node.attributes, name) &&
				!(
					node.tagName === "input" &&
					type === "email" &&
					["min", "max", "step"].includes(name)
				),
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"This form uses constraint validation that is not implemented",
		);
	if (
		node.tagName === "input" &&
		![
			"text",
			"search",
			"tel",
			"password",
			"url",
			"email",
			"checkbox",
			"radio",
			"file",
		].includes(type)
	)
		throw new AgentBrowserError(
			"unsupported",
			`Constraint validation for input type ${type} is not implemented`,
		);
	if (node.tagName === "input" && type === "radio") {
		if (node.attributes.name) {
			if (!radioMissing.has(id)) {
				const group = radioGroup(tree, id);
				const missing =
					group.some((entry) => Object.hasOwn(entry.attributes, "required")) &&
					!group.some((entry) => controlChecked(tree, entry.id));
				for (const entry of group) radioMissing.set(entry.id, missing);
			}
			flags.valueMissing = radioMissing.get(id) ?? false;
		}
	} else if (required && node.tagName === "input" && type === "checkbox")
		flags.valueMissing = !controlChecked(tree, id);
	else if (required && node.tagName === "input" && type === "file")
		flags.valueMissing = !options.files?.get(id)?.length;
	else if (required && node.tagName === "select") {
		const selected = selectedOptions(tree, id);
		const first = selectOptions(tree, id)[0];
		const size = Number(node.attributes.size ?? 0);
		const single =
			!Object.hasOwn(node.attributes, "multiple") &&
			!(Number.isInteger(size) && size > 1);
		const placeholder =
			single && first?.parent === id && optionValue(tree, first.id) === "";
		flags.valueMissing =
			selected.length === 0 ||
			(!!placeholder && selected.length === 1 && selected[0].id === first.id);
	} else flags.valueMissing = required && mutable && value === "";
	if (node.tagName === "input" && type === "email")
		flags.typeMismatch = !validEmailValue(
			value,
			Object.hasOwn(node.attributes, "multiple"),
		);
	if (node.tagName === "input" && type === "url" && value) {
		try {
			new URL(value);
		} catch {
			flags.typeMismatch = true;
		}
	}
	return finish();
}
