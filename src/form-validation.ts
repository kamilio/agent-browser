import {
	controlChecked,
	controlValue,
	formControls,
	inputType,
	isControlDisabled,
	isInsideDatalist,
	optionValue,
	radioGroup,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { FormSubmissionOptions } from "./forms.js";
import { validEmailValue } from "./input-email.js";
import {
	type NumberConstraintFailure,
	numberConstraintFailure,
} from "./input-number.js";

export interface InvalidFormControl {
	reference: string;
	reason:
		| "value-missing"
		| "type-mismatch"
		| "custom-error"
		| NumberConstraintFailure;
}

export function supportsConstraintValidation(tag: string): boolean {
	return [
		"input",
		"textarea",
		"select",
		"button",
		"fieldset",
		"object",
		"output",
	].includes(tag);
}

export function isValidationCandidate(tree: DocumentTree, id: number): boolean {
	const control = tree.get(id);
	if (
		!["input", "textarea", "select", "button"].includes(control.tagName) ||
		isControlDisabled(tree, id) ||
		isInsideDatalist(tree, id)
	)
		return false;
	if (control.tagName === "button") {
		const type = control.attributes.type?.replace(/[A-Z]/g, (letter) =>
			letter.toLowerCase(),
		);
		if (type === "submit") return true;
		return (
			type !== "button" &&
			type !== "reset" &&
			!Object.hasOwn(control.attributes, "command") &&
			!Object.hasOwn(control.attributes, "commandfor") &&
			(control.parent === null || tree.get(control.parent).tagName !== "select")
		);
	}
	const type = inputType(control);
	if (
		control.tagName === "input" &&
		["hidden", "button", "reset"].includes(type)
	)
		return false;
	return !(
		Object.hasOwn(control.attributes, "readonly") &&
		(control.tagName === "textarea" ||
			(control.tagName === "input" &&
				[
					"text",
					"search",
					"url",
					"tel",
					"email",
					"password",
					"date",
					"month",
					"week",
					"time",
					"datetime-local",
					"number",
				].includes(type)))
	);
}

export function invalidControl(
	tree: DocumentTree,
	id: number,
): InvalidFormControl | undefined {
	return invalidControls(tree, [tree.get(id)], {})[0];
}

export function validationMessage(tree: DocumentTree, id: number): string {
	const invalid = invalidControl(tree, id);
	if (!invalid) return "";
	if (invalid.reason === "custom-error") return tree.getCustomValidity(id);
	return {
		"value-missing": "Please fill out this field.",
		"type-mismatch": "Please enter a value in the required format.",
		"range-underflow": "Value is below the permitted minimum.",
		"range-overflow": "Value is above the permitted maximum.",
		"step-mismatch": "Please enter a value matching the allowed step.",
	}[invalid.reason];
}

export function invalidFormControls(
	tree: DocumentTree,
	formId: number,
	options: FormSubmissionOptions,
): InvalidFormControl[] {
	return invalidControls(tree, formControls(tree, formId), options);
}

function invalidControls(
	tree: DocumentTree,
	controls: readonly Readonly<DocumentNode>[],
	options: FormSubmissionOptions,
): InvalidFormControl[] {
	const invalid: InvalidFormControl[] = [];
	const radioMissing = new Map<number, boolean>();
	for (const control of controls) {
		if (!isValidationCandidate(tree, control.id)) continue;
		if (tree.getCustomValidity(control.id)) {
			invalid.push({
				reference: tree.reference(control.id),
				reason: "custom-error",
			});
			continue;
		}
		const type = inputType(control);
		if (
			control.tagName === "button" ||
			(control.tagName === "input" && ["submit", "image"].includes(type))
		)
			continue;
		if (
			control.tagName === "input" &&
			[
				"email",
				"number",
				"date",
				"month",
				"week",
				"time",
				"datetime-local",
			].includes(type) &&
			controlValue(tree, control.id) === ""
		) {
			if (Object.hasOwn(control.attributes, "required"))
				invalid.push({
					reference: tree.reference(control.id),
					reason: "value-missing",
				});
			continue;
		}
		if (control.tagName === "input" && type === "number") {
			const reason = numberConstraintFailure(
				controlValue(tree, control.id),
				control.attributes,
			);
			if (reason)
				invalid.push({ reference: tree.reference(control.id), reason });
			continue;
		}
		if (
			["pattern", "min", "max", "step", "minlength", "maxlength"].some(
				(name) =>
					Object.hasOwn(control.attributes, name) &&
					!(
						control.tagName === "input" &&
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
			control.tagName === "input" &&
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
		const required = Object.hasOwn(control.attributes, "required");
		let missing = false;
		if (control.tagName === "input" && type === "radio") {
			if (!radioMissing.has(control.id)) {
				const group = radioGroup(tree, control.id);
				const empty =
					group.some((entry) => Object.hasOwn(entry.attributes, "required")) &&
					!group.some((entry) => controlChecked(tree, entry.id));
				for (const entry of group) radioMissing.set(entry.id, empty);
			}
			missing = radioMissing.get(control.id) ?? false;
		} else if (required && control.tagName === "input" && type === "checkbox")
			missing = !controlChecked(tree, control.id);
		else if (required && control.tagName === "input" && type === "file")
			missing = !options.files?.get(control.id)?.length;
		else if (required && control.tagName === "select") {
			const selected = selectedOptions(tree, control.id);
			const first = selectOptions(tree, control.id)[0];
			const size = Number(control.attributes.size ?? 0);
			const single =
				!Object.hasOwn(control.attributes, "multiple") &&
				!(Number.isInteger(size) && size > 1);
			const placeholder =
				single &&
				first?.parent === control.id &&
				optionValue(tree, first.id) === "";
			missing =
				selected.length === 0 ||
				(!!placeholder && selected.length === 1 && selected[0].id === first.id);
		} else if (required) missing = controlValue(tree, control.id) === "";
		if (missing)
			invalid.push({
				reference: tree.reference(control.id),
				reason: "value-missing",
			});
		else if (
			control.tagName === "input" &&
			type === "email" &&
			!validEmailValue(
				controlValue(tree, control.id),
				Object.hasOwn(control.attributes, "multiple"),
			)
		)
			invalid.push({
				reference: tree.reference(control.id),
				reason: "type-mismatch",
			});
		else if (
			control.tagName === "input" &&
			type === "url" &&
			controlValue(tree, control.id)
		) {
			try {
				new URL(controlValue(tree, control.id));
			} catch {
				invalid.push({
					reference: tree.reference(control.id),
					reason: "type-mismatch",
				});
			}
		}
	}
	return invalid;
}
