import { controlValidity } from "./control-validity.js";
import {
	formControls,
	inputType,
	isControlDisabled,
	isInsideDatalist,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import type { FormSubmissionOptions } from "./forms.js";
import type { NumberConstraintFailure } from "./input-number.js";

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
		const flags = controlValidity(tree, control.id, options, radioMissing);
		const reason: InvalidFormControl["reason"] | undefined = flags.valueMissing
			? "value-missing"
			: flags.typeMismatch
				? "type-mismatch"
				: flags.rangeUnderflow
					? "range-underflow"
					: flags.rangeOverflow
						? "range-overflow"
						: flags.stepMismatch
							? "step-mismatch"
							: undefined;
		if (reason) invalid.push({ reference: tree.reference(control.id), reason });
	}
	return invalid;
}
