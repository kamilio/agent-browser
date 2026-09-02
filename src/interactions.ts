import {
	controlChecked,
	fillTextControl,
	formOwner,
	inputType,
	isControlDisabled,
	isInteractiveElement,
	labelControl,
	radioGroup,
	selectControlValues,
	setControlChecked,
	validateTextControl,
} from "./controls.js";
import { documentBaseTarget, documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, DocumentEvents, type EventLimits } from "./events.js";
import { DocumentFocus, focusTabIndex } from "./focus.js";
import { DocumentForms, type FormResetResult } from "./form-actions.js";
import { BrowserInputEvent } from "./input-events.js";
import { DocumentKeyboard } from "./keyboard.js";
import { parseNetworkUrl } from "./network.js";

export { BrowserInputEvent } from "./input-events.js";

export type DefaultActionIntent =
	| { kind: "navigate"; url: string; target: string }
	| { kind: "submit"; formRef: string; submitterRef?: string }
	| { kind: "picker"; reference: string };

export interface InteractionResult {
	reference: string;
	defaultPrevented: boolean;
	revision: number;
	defaultAction?: DefaultActionIntent;
	label?: {
		reference: string;
		controlRef?: string;
		forwarded: boolean;
		controlDefaultPrevented?: boolean;
	};
	reset?: FormResetResult;
}

const sharedInteractions = new WeakMap<DocumentTree, DocumentInteractions>();

export function documentInteractions(tree: DocumentTree): DocumentInteractions {
	let interactions = sharedInteractions.get(tree);
	if (!interactions) {
		interactions = new DocumentInteractions(tree);
		sharedInteractions.set(tree, interactions);
		tree.onClose(() => sharedInteractions.delete(tree));
	}
	return interactions;
}

export class DocumentInteractions {
	readonly events: DocumentEvents;
	readonly forms: DocumentForms;
	readonly focus: DocumentFocus;
	readonly keyboard: DocumentKeyboard;
	private clicking = new Set<number>();

	constructor(
		private readonly tree: DocumentTree,
		eventLimits: Partial<EventLimits> = {},
	) {
		this.events = new DocumentEvents(tree, eventLimits, { window: true });
		this.forms = new DocumentForms(tree, this.events);
		this.focus = new DocumentFocus(tree, this.events);
		this.keyboard = new DocumentKeyboard(
			tree,
			this.events,
			this.focus,
			(reference, allowHidden) =>
				this.activate(reference, !!allowHidden, false),
			(reference, allowHidden) =>
				this.activateAction(reference, !!allowHidden, false),
		);
	}

	fill(reference: string, value: string): InteractionResult {
		return runEventAction(this.events, this.fillAction(reference, value));
	}

	fillAsync(reference: string, value: string): Promise<InteractionResult> {
		return runEventActionAsync(this.events, this.fillAction(reference, value));
	}

	private *fillAction(
		reference: string,
		value: string,
	): EventAction<InteractionResult> {
		const node = this.actionable(reference);
		validateTextControl(this.tree, reference, value);
		if ((yield* this.focus.focusAction(reference)) !== node.id)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed before fill",
			);
		const allowed = yield {
			target: node.id,
			event: new BrowserInputEvent(
				"beforeinput",
				value,
				"insertReplacementText",
				true,
			),
		};
		if (!allowed) return this.result(reference, true);
		this.actionable(reference);
		if (this.focus.active() !== node.id)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed during beforeinput",
			);
		fillTextControl(this.tree, reference, value);
		this.keyboard.collapseEnd(node.id);
		this.focus.markEdited(node.id);
		yield {
			target: node.id,
			event: new BrowserInputEvent("input", value, "insertReplacementText"),
		};
		return this.result(reference, false);
	}

	select(reference: string, values: readonly string[]): InteractionResult {
		return runEventAction(this.events, this.selectAction(reference, values));
	}

	selectAsync(
		reference: string,
		values: readonly string[],
	): Promise<InteractionResult> {
		return runEventActionAsync(
			this.events,
			this.selectAction(reference, values),
		);
	}

	private *selectAction(
		reference: string,
		values: readonly string[],
	): EventAction<InteractionResult> {
		const node = this.actionable(reference);
		yield* this.focus.focusAction(reference);
		selectControlValues(this.tree, reference, values);
		yield* this.inputAndChange(node.id);
		return this.result(reference, false);
	}

	setChecked(reference: string, checked: boolean): InteractionResult {
		return runEventAction(this.events, this.checkedAction(reference, checked));
	}

	setCheckedAsync(
		reference: string,
		checked: boolean,
	): Promise<InteractionResult> {
		return runEventActionAsync(
			this.events,
			this.checkedAction(reference, checked),
		);
	}

	private *checkedAction(
		reference: string,
		checked: boolean,
	): EventAction<InteractionResult> {
		const node = this.actionable(reference);
		if (
			typeof checked !== "boolean" ||
			node.tagName !== "input" ||
			!["checkbox", "radio"].includes(inputType(node))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a checkbox/radio and boolean state",
			);
		if (controlChecked(this.tree, node.id) === checked)
			return this.result(reference, false);
		if (inputType(node) === "radio" && !checked)
			throw new AgentBrowserError(
				"not-actionable",
				"A radio cannot be unchecked by clicking it",
			);
		const result = yield* this.activateAction(reference, false);
		this.tree.resolve(reference);
		if (controlChecked(this.tree, node.id) !== checked)
			throw new AgentBrowserError(
				"not-actionable",
				"Control did not reach the requested checked state",
			);
		return result;
	}

	click(reference: string): InteractionResult {
		return this.activate(reference, false);
	}

	clickAsync(reference: string): Promise<InteractionResult> {
		return runEventActionAsync(
			this.events,
			this.activateAction(reference, false),
		);
	}

	private activate(
		reference: string,
		allowHidden: boolean,
		moveFocus = true,
	): InteractionResult {
		return runEventAction(
			this.events,
			this.activateAction(reference, allowHidden, moveFocus),
		);
	}

	private *activateAction(
		reference: string,
		allowHidden: boolean,
		moveFocus = true,
	): EventAction<InteractionResult> {
		const target = this.actionable(reference, allowHidden);
		if (this.clicking.has(target.id)) return this.result(reference, false);
		this.clicking.add(target.id);
		let rollback: (() => void) | undefined;
		try {
			const candidate = this.activationTarget(target.id) ?? target;
			if (
				moveFocus &&
				focusTabIndex(this.tree, candidate.id) !== null &&
				documentStyles(this.tree).get(candidate.id).visible
			) {
				yield* this.focus.focusAction(this.tree.reference(candidate.id));
				if (
					candidate.tagName === "textarea" ||
					(candidate.tagName === "input" &&
						["text", "search", "url", "tel", "password"].includes(
							inputType(candidate),
						))
				)
					this.keyboard.collapseEnd(candidate.id);
			}
			this.actionable(reference, allowHidden);
			const activation = this.activationTarget(target.id);
			const type =
				activation?.tagName === "input" ? inputType(activation) : undefined;
			const wasChecked =
				activation && (type === "checkbox" || type === "radio")
					? controlChecked(this.tree, activation.id)
					: undefined;
			if (activation && wasChecked !== undefined) {
				const previous =
					type === "radio"
						? radioGroup(this.tree, activation.id).find((node) =>
								controlChecked(this.tree, node.id),
							)?.id
						: undefined;
				rollback = () => this.restoreCheck(activation, wasChecked, previous);
				setControlChecked(
					this.tree,
					this.tree.reference(activation.id),
					type === "radio" || !wasChecked,
				);
				if (type === "checkbox")
					this.tree.setControl(activation.id, { indeterminate: false });
			}
			const allowed = yield {
				target: target.id,
				event: new BrowserEvent("click", {
					bubbles: true,
					cancelable: true,
					composed: true,
				}),
			};
			if (!allowed) {
				rollback?.();
				return this.result(reference, true);
			}
			rollback = undefined;
			if (!activation || !this.tree.isConnected(activation.id))
				return this.result(reference, false);
			const current = this.tree.get(activation.id);
			if (current.tagName === "label")
				return yield* this.activateLabel(reference, target.id, current.id);
			const currentType =
				current.tagName === "input" ? inputType(current) : undefined;
			if (currentType === "checkbox" || currentType === "radio") {
				if (
					currentType === "checkbox" ||
					(wasChecked !== undefined &&
						wasChecked !== controlChecked(this.tree, current.id))
				)
					yield* this.inputAndChange(current.id);
				return this.result(reference, false);
			}
			const defaults = yield* this.defaultIntent(current);
			return { ...this.result(reference, false), ...defaults };
		} catch (error) {
			try {
				rollback?.();
			} catch {}
			throw error;
		} finally {
			this.clicking.delete(target.id);
		}
	}

	close() {
		this.events.close();
	}

	actionability(
		reference: string,
		allowHidden = false,
	): {
		node: Readonly<DocumentNode>;
		blocked?: "hidden-inert-disabled" | "css-hidden";
	} {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document interactions are closed");
		const node = this.tree.resolve(reference);
		if (node.kind !== "element")
			throw new AgentBrowserError(
				"not-actionable",
				"Expected an element target",
			);
		let ancestor: Readonly<DocumentNode> | undefined = node;
		while (ancestor) {
			if (
				(!allowHidden && Object.hasOwn(ancestor.attributes, "hidden")) ||
				Object.hasOwn(ancestor.attributes, "inert") ||
				([
					"button",
					"input",
					"select",
					"textarea",
					"option",
					"optgroup",
				].includes(ancestor.tagName) &&
					isControlDisabled(this.tree, ancestor.id)) ||
				(ancestor.tagName === "input" && inputType(ancestor) === "hidden")
			)
				return { node, blocked: "hidden-inert-disabled" };
			ancestor =
				ancestor.parent === null ? undefined : this.tree.get(ancestor.parent);
		}
		if (!allowHidden && !documentStyles(this.tree).get(node.id).visible)
			return { node, blocked: "css-hidden" };
		return { node };
	}

	private actionable(reference: string, allowHidden = false) {
		const state = this.actionability(reference, allowHidden);
		if (state.blocked)
			throw new AgentBrowserError(
				"not-actionable",
				state.blocked === "css-hidden"
					? "Target is hidden by CSS"
					: "Target is hidden, inert or disabled",
			);
		return state.node;
	}

	private *activateLabel(
		reference: string,
		target: number,
		label: number,
	): EventAction<InteractionResult> {
		const labelRef = this.tree.reference(label);
		let ancestor = this.tree.get(target);
		while (ancestor.id !== label) {
			if (isInteractiveElement(ancestor) || ancestor.parent === null)
				return {
					...this.result(reference, false),
					label: { reference: labelRef, forwarded: false },
				};
			ancestor = this.tree.get(ancestor.parent);
		}
		const control = labelControl(this.tree, label);
		const controlRef =
			control === undefined ? undefined : this.tree.reference(control);
		const idle = () => ({
			...this.result(reference, false),
			label: {
				reference: labelRef,
				...(controlRef ? { controlRef } : {}),
				forwarded: false,
			},
		});
		if (control === undefined || isControlDisabled(this.tree, control))
			return idle();
		let parent: number | null = control;
		while (parent !== null) {
			const node = this.tree.get(parent);
			if (Object.hasOwn(node.attributes, "inert")) return idle();
			parent = node.parent;
		}
		const forwarded = yield* this.activateAction(
			this.tree.reference(control),
			true,
		);
		return {
			...forwarded,
			reference,
			defaultPrevented: false,
			label: {
				reference: labelRef,
				controlRef,
				forwarded: true,
				controlDefaultPrevented: forwarded.defaultPrevented,
			},
		};
	}

	private activationTarget(id: number): Readonly<DocumentNode> | undefined {
		let node: Readonly<DocumentNode> | undefined = this.tree.get(id);
		while (node) {
			if (
				["button", "input", "label"].includes(node.tagName) ||
				(node.tagName === "a" && Object.hasOwn(node.attributes, "href"))
			)
				return node;
			node = node.parent === null ? undefined : this.tree.get(node.parent);
		}
		return undefined;
	}

	private *inputAndChange(id: number): EventAction<void> {
		yield {
			target: id,
			event: new BrowserEvent("input", { bubbles: true, composed: true }),
		};
		yield { target: id, event: new BrowserEvent("change", { bubbles: true }) };
	}

	private restoreCheck(
		original: Readonly<DocumentNode>,
		checked: boolean,
		previous: number | undefined,
	) {
		const current = this.tree.get(original.id);
		const type = inputType(current);
		if (type === "checkbox") {
			this.tree.setControl(current.id, {
				checked,
				indeterminate: original.control.indeterminate ?? false,
			});
		} else if (type === "radio") {
			const group = radioGroup(this.tree, current.id);
			if (
				previous !== undefined &&
				group.some((node) => node.id === previous)
			) {
				for (const node of group)
					this.tree.setControl(node.id, { checked: node.id === previous });
			} else this.tree.setControl(current.id, { checked: false });
		}
	}

	private *defaultIntent(node: Readonly<DocumentNode>): EventAction<{
		defaultAction?: DefaultActionIntent;
		reset?: FormResetResult;
	}> {
		const reference = this.tree.reference(node.id);
		if (node.tagName === "a" && Object.hasOwn(node.attributes, "href")) {
			if (
				Object.hasOwn(node.attributes, "download") ||
				node.attributes.ping?.trim()
			)
				throw new AgentBrowserError(
					"unsupported",
					"Download and link auditing actions are not implemented",
				);
			let url: URL;
			try {
				url = new URL(node.attributes.href, documentBaseUrl(this.tree));
			} catch {
				throw new AgentBrowserError("invalid-input", "Invalid link URL");
			}
			url = parseNetworkUrl(url.href);
			return {
				defaultAction: {
					kind: "navigate",
					url: url.href,
					target:
						(node.attributes.target ?? documentBaseTarget(this.tree)) ||
						"_self",
				},
			};
		}
		if (isControlDisabled(this.tree, node.id)) return {};
		const type =
			node.tagName === "input"
				? inputType(node)
				: ["reset", "button"].includes(
							node.attributes.type?.toLowerCase() ?? "",
						)
					? node.attributes.type.toLowerCase()
					: "submit";
		if (type === "file")
			return { defaultAction: { kind: "picker", reference } };
		const owner = formOwner(this.tree, node.id);
		if (owner === undefined) return {};
		if (type === "submit" || type === "image")
			return {
				defaultAction: {
					kind: "submit",
					formRef: this.tree.reference(owner),
					submitterRef: reference,
				},
			};
		if (type === "reset")
			return {
				reset: yield* this.forms.resetAction(this.tree.reference(owner)),
			};
		return {};
	}

	private result(
		reference: string,
		defaultPrevented: boolean,
	): InteractionResult {
		return { reference, defaultPrevented, revision: this.tree.revision };
	}
}
import { documentStyles } from "./styles.js";
