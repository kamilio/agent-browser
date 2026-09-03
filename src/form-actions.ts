import { formControls, selectOptions } from "./controls.js";
import type { ControlState, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import {
	type InvalidFormControl,
	invalidControl,
	invalidFormControls,
	supportsConstraintValidation,
} from "./form-validation.js";
import {
	type FormSubmissionOptions,
	type PreparedFormSubmission,
	prepareFormSubmission,
	resolveFormSubmitter,
} from "./forms.js";

export class BrowserSubmitEvent extends BrowserEvent {
	readonly #submitter: number | null;
	constructor(submitter: number | null) {
		super("submit", { bubbles: true, cancelable: true });
		this.#submitter = submitter;
	}
	get submitter() {
		return this.#submitter;
	}
}

export interface FormRequestResult {
	formRef: string;
	canceled: boolean;
	recursive: boolean;
	invalid: readonly InvalidFormControl[];
	submission?: PreparedFormSubmission;
}

export interface FormResetResult {
	formRef: string;
	reset: boolean;
	canceled: boolean;
	recursive: boolean;
	controls: number;
	revision: number;
}

export class DocumentForms {
	private resetting = new Set<number>();
	private submitting = new Set<number>();

	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
	) {
		if (events.documentRoot !== tree.root || events.metrics().closed)
			throw new AgentBrowserError(
				"invalid-input",
				"Form actions require this document's active events",
			);
	}

	checkValidity(reference: string): boolean {
		return runEventAction(this.events, this.checkValidityAction(reference));
	}

	checkValidityAsync(reference: string): Promise<boolean> {
		return runEventActionAsync(
			this.events,
			this.checkValidityAction(reference),
		);
	}

	*checkValidityAction(reference: string): EventAction<boolean> {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document form actions are closed");
		const node = this.tree.resolve(reference);
		if (node.tagName !== "form" && !supportsConstraintValidation(node.tagName))
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a form or validation control",
			);
		const invalid =
			node.tagName === "form"
				? invalidFormControls(this.tree, node.id, {})
				: [invalidControl(this.tree, node.id)].filter(
						(entry): entry is InvalidFormControl => entry !== undefined,
					);
		const targets = invalid.map(
			(entry) => this.tree.resolve(entry.reference).id,
		);
		for (const target of targets)
			yield {
				target,
				event: new BrowserEvent("invalid", { cancelable: true }),
			};
		return targets.length === 0;
	}

	requestSubmit(
		reference: string,
		options: FormSubmissionOptions = {},
	): FormRequestResult {
		return runEventAction(
			this.events,
			this.requestSubmitAction(reference, options),
		);
	}

	requestSubmitAsync(
		reference: string,
		options: FormSubmissionOptions = {},
	): Promise<FormRequestResult> {
		return runEventActionAsync(
			this.events,
			this.requestSubmitAction(reference, options),
		);
	}

	*requestSubmitAction(
		reference: string,
		options: FormSubmissionOptions = {},
	): EventAction<FormRequestResult> {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document form actions are closed");
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			(options.files !== undefined && !(options.files instanceof Map))
		)
			throw new AgentBrowserError("invalid-input", "Invalid form options");
		const { form, submitter } = resolveFormSubmitter(
			this.tree,
			reference,
			options.submitter,
		);
		const result: FormRequestResult = {
			formRef: reference,
			canceled: false,
			recursive: false,
			invalid: [],
		};
		if (this.submitting.has(form.id)) return { ...result, recursive: true };
		this.submitting.add(form.id);
		try {
			if (
				!Object.hasOwn(form.attributes, "novalidate") &&
				!(submitter && Object.hasOwn(submitter.attributes, "formnovalidate"))
			) {
				const invalid = invalidFormControls(this.tree, form.id, options);
				const controls = invalid.map((entry) =>
					this.tree.resolve(entry.reference),
				);
				for (const control of controls) {
					yield {
						target: control.id,
						event: new BrowserEvent("invalid", { cancelable: true }),
					};
				}
				if (invalid.length) return { ...result, invalid };
			}
			if (
				!(yield {
					target: form.id,
					event: new BrowserSubmitEvent(submitter?.id ?? null),
				})
			)
				return { ...result, canceled: true };
			return {
				...result,
				submission: prepareFormSubmission(this.tree, reference, options),
			};
		} finally {
			this.submitting.delete(form.id);
		}
	}

	reset(reference: string): FormResetResult {
		return runEventAction(this.events, this.resetAction(reference));
	}

	resetAsync(reference: string): Promise<FormResetResult> {
		return runEventActionAsync(this.events, this.resetAction(reference));
	}

	*resetAction(reference: string): EventAction<FormResetResult> {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document form actions are closed");
		const form = this.tree.resolve(reference);
		if (form.tagName !== "form")
			throw new AgentBrowserError("invalid-input", "Expected a form reference");
		const result = (
			reset: boolean,
			canceled: boolean,
			recursive: boolean,
			controls = 0,
		): FormResetResult => ({
			formRef: reference,
			reset,
			canceled,
			recursive,
			controls,
			revision: this.tree.revision,
		});
		if (this.resetting.has(form.id)) return result(false, false, true);
		this.resetting.add(form.id);
		try {
			const allowed = yield {
				target: form.id,
				event: new BrowserEvent("reset", { bubbles: true, cancelable: true }),
			};
			if (!allowed) return result(false, true, false);
			this.tree.resolve(reference);
			const controls = formControls(this.tree, form.id);
			if (controls.some((control) => control.tagName === "output"))
				throw new AgentBrowserError(
					"unsupported",
					"Reset of output controls is not implemented",
				);
			const plan: { id: number; fields: (keyof ControlState)[] }[] = [];
			let resetControls = 0;
			for (const control of controls) {
				if (control.tagName === "input") {
					plan.push({ id: control.id, fields: ["value", "checked"] });
					resetControls++;
				} else if (control.tagName === "textarea") {
					plan.push({ id: control.id, fields: ["value"] });
					resetControls++;
				} else if (control.tagName === "select") {
					for (const option of selectOptions(this.tree, control.id))
						plan.push({ id: option.id, fields: ["selected"] });
					resetControls++;
				}
			}
			for (const item of plan) this.tree.clearControl(item.id, item.fields);
			return result(true, false, false, resetControls);
		} finally {
			this.resetting.delete(form.id);
		}
	}
}
