import { buttonType } from "./button-type.js";
import { prepareControlFill } from "./control-fill.js";
import { editableFillHost } from "./editable-fill.js";
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
	setControlCheckedState,
} from "./controls.js";
import { documentFiles } from "./document-files.js";
import { documentBaseTarget, documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { summaryDetails } from "./details.js";
import {
	documentGeneratedControls,
	resolveVisualTarget,
} from "./generated-controls.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, DocumentEvents, type EventLimits } from "./events.js";
import { DocumentFocus, focusTabIndex } from "./focus.js";
import { DocumentForms, type FormResetResult } from "./form-actions.js";
import { BrowserInputEvent } from "./input-events.js";
import { isInertRoot } from "./inertness.js";
import { DocumentKeyboard } from "./keyboard.js";
import {
	DocumentMouse,
	BrowserPointerActivationEvent,
	type BrowserMouseEvent,
} from "./mouse.js";
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
	readonly files;
	readonly events: DocumentEvents;
	readonly forms: DocumentForms;
	readonly focus: DocumentFocus;
	readonly keyboard: DocumentKeyboard;
	readonly mouse: DocumentMouse;
	private clicking = new Set<number>();
	private programmaticClicking = new Set<number>();

	constructor(
		private readonly tree: DocumentTree,
		eventLimits: Partial<EventLimits> = {},
	) {
		this.events = new DocumentEvents(tree, eventLimits, { window: true });
		this.files = documentFiles(tree);
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
		this.mouse = new DocumentMouse(
			tree,
			this.events,
			() => this.keyboard.modifiers(),
			(reference) => this.mouseFocusAction(reference),
			(reference) => !this.actionability(reference).blocked,
			(reference, event) => this.activateAction(reference, false, false, event),
		);
		this.tree.detailsToggleTasks.connect(this.events);
	}

	private *mouseFocusAction(reference: string): EventAction<void> {
		const { node, blocked } = this.actionability(reference);
		if (blocked) return;
		const generated = resolveVisualTarget(this.tree, reference).generated;
		if (generated) {
			yield* this.focus.focusAction(generated.ref, "pointer");
			return;
		}
		let target: number | null = node.id;
		while (target !== null && focusTabIndex(this.tree, target) === null)
			target = this.tree.get(target).parent;
		yield* this.focus.focusAction(
			target === null ? null : this.tree.reference(target),
			"pointer",
		);
		if (target !== null && this.focus.active() === target) {
			const candidate = this.tree.get(target);
			if (
				candidate.tagName === "textarea" ||
				(candidate.tagName === "input" &&
					["text", "search", "url", "tel", "password"].includes(
						inputType(candidate),
					))
			)
				this.keyboard.collapseEnd(target);
		}
	}

	fill(reference: string, value: string): InteractionResult {
		return runEventAction(this.events, this.fillAction(reference, value));
	}

	fillAsync(
		reference: string,
		value: string,
		signal?: AbortSignal,
	): Promise<InteractionResult> {
		return runEventActionAsync(
			this.events,
			this.fillAction(reference, value),
			signal,
		);
	}

	private *fillAction(
		reference: string,
		value: string,
	): EventAction<InteractionResult> {
		const node = this.actionable(reference);
		const prepared = prepareControlFill(this.tree, reference, value);
		if (prepared.editableHost !== undefined)
			return yield* this.fillEditableAction(
				reference,
				value,
				prepared.editableHost,
			);
		if ((yield* this.focus.focusAction(reference)) !== node.id)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed before fill",
			);
		if (prepared.direct) {
			this.actionable(reference);
			const current = prepareControlFill(this.tree, reference, value);
			if (current.type !== prepared.type)
				throw new AgentBrowserError(
					"not-actionable",
					"Control type changed before fill",
				);
			this.tree.setControl(node.id, { value: current.value }, "user");
			this.focus.markCommitted(node.id);
			yield* this.inputAndChange(node.id);
			return this.result(reference, false);
		}
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

	private *fillEditableAction(
		reference: string,
		value: string,
		host: number,
	): EventAction<InteractionResult> {
		if ((yield* this.focus.focusAction(this.tree.reference(host))) !== host)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed before editable fill",
			);
		const target = this.actionable(reference);
		if (
			editableFillHost(this.tree, target.id) !== host ||
			this.focus.active() !== host
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Editable target changed during focus",
			);
		const contents = Array.from(
			this.tree.walk(target.id),
			(entry) => entry.node,
		);
		const inputType = value ? "insertText" : "deleteContentBackward";
		const data = value || null;
		const allowed = yield {
			target: host,
			event: new BrowserInputEvent("beforeinput", data, inputType, true),
		};
		if (!allowed) return this.result(reference, true);
		this.actionable(reference);
		if (
			this.focus.active() !== host ||
			editableFillHost(this.tree, target.id) !== host ||
			contents.some((node) => this.tree.get(node.id) !== node)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Editable target changed during beforeinput",
			);
		this.tree.setTextContent(target.id, value);
		this.keyboard.collapseEditableEnd(host, target.id);
		yield {
			target: host,
			event: new BrowserInputEvent("input", data, inputType),
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

	programmaticClick(id: number): InteractionResult {
		return runEventAction(this.events, this.programmaticClickAction(id));
	}

	programmaticClickAsync(
		id: number,
		signal?: AbortSignal,
	): Promise<InteractionResult> {
		return runEventActionAsync(
			this.events,
			this.programmaticClickAction(id),
			signal,
		);
	}

	private *programmaticClickAction(id: number): EventAction<InteractionResult> {
		return yield* this.activateAction(
			id,
			true,
			false,
			new BrowserPointerActivationEvent(
				"click",
				{
					x: 0,
					y: 0,
					button: 0,
					buttons: 0,
					detail: 0,
					...this.keyboard.modifiers(),
				},
				"non-pointer",
			),
		);
	}

	private programmaticTarget(id: number) {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document interactions are closed");
		const target = this.tree.get(id);
		if (target.kind !== "element")
			throw new AgentBrowserError(
				"not-actionable",
				"Expected an element target",
			);
		return target;
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
		targetReference: string | number,
		allowHidden: boolean,
		moveFocus = true,
		mouseEvent?: BrowserMouseEvent,
	): EventAction<InteractionResult> {
		const programmatic = typeof targetReference === "number";
		const generated = programmatic
			? undefined
			: resolveVisualTarget(this.tree, targetReference).generated;
		const target = programmatic
			? this.programmaticTarget(targetReference)
			: this.actionable(targetReference, allowHidden);
		const reference = generated?.ref ?? this.tree.reference(target.id);
		const clicking = programmatic ? this.programmaticClicking : this.clicking;
		if (
			(programmatic && isControlDisabled(this.tree, target.id)) ||
			clicking.has(target.id)
		)
			return this.result(reference, false);
		clicking.add(target.id);
		let rollback: (() => void) | undefined;
		try {
			if (moveFocus && !programmatic) this.tree.recordInputModality("pointer");
			const candidate = generated
				? target
				: (this.activationTarget(target.id) ?? target);
			if (
				moveFocus &&
				(generated || focusTabIndex(this.tree, candidate.id) !== null) &&
				documentStyles(this.tree).get(candidate.id).visible
			) {
				yield* this.focus.focusAction(
					generated?.ref ?? this.tree.reference(candidate.id),
					"pointer",
				);
				if (
					candidate.tagName === "textarea" ||
					(candidate.tagName === "input" &&
						["text", "search", "url", "tel", "password"].includes(
							inputType(candidate),
						))
				)
					this.keyboard.collapseEnd(candidate.id);
			}
			if (!programmatic) this.actionable(reference, allowHidden);
			const activation = generated
				? undefined
				: this.activationTarget(target.id);
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
				if (programmatic)
					setControlCheckedState(
						this.tree,
						activation.id,
						type === "radio" || !wasChecked,
					);
				else
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
				event:
					mouseEvent ??
					new BrowserPointerActivationEvent(
						"click",
						{
							x: 0,
							y: 0,
							button: 0,
							buttons: 0,
							...this.keyboard.modifiers(),
						},
						"non-pointer",
					),
			};
			if (!allowed) {
				rollback?.();
				return this.result(reference, true);
			}
			rollback = undefined;
			if (generated) {
				if (
					documentGeneratedControls(this.tree).detailsSummary(target.id) ===
						generated &&
					!this.actionability(reference).blocked
				)
					this.tree.toggleAttribute(target.id, "open");
				return this.result(reference, false);
			}
			if (!activation) return this.result(reference, false);
			const current = this.tree.get(activation.id);
			if (
				!this.tree.isConnected(current.id) &&
				!(programmatic && ["a", "label", "summary"].includes(current.tagName))
			)
				return this.result(reference, false);
			if (current.tagName === "label")
				return yield* this.activateLabel(
					reference,
					target.id,
					current.id,
					programmatic,
				);
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
			clicking.delete(target.id);
		}
	}

	close() {
		this.keyboard.close();
		this.mouse.close();
		this.events.close();
	}

	actionability(
		reference: string,
		allowHidden = false,
		allowDisabled = false,
	): {
		node: Readonly<DocumentNode>;
		blocked?: "hidden-inert-disabled" | "css-hidden";
	} {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document interactions are closed");
		const { node } = resolveVisualTarget(this.tree, reference);
		if (node.kind !== "element")
			throw new AgentBrowserError(
				"not-actionable",
				"Expected an element target",
			);
		let ancestor: Readonly<DocumentNode> | undefined = node;
		while (ancestor) {
			if (
				(!allowHidden && Object.hasOwn(ancestor.attributes, "hidden")) ||
				isInertRoot(this.tree, ancestor) ||
				(!allowDisabled &&
					[
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
		programmatic = false,
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
		while (!programmatic && parent !== null) {
			const node = this.tree.get(parent);
			if (isInertRoot(this.tree, node)) return idle();
			parent = node.parent;
		}
		const forwarded = programmatic
			? yield* this.programmaticClickAction(control)
			: yield* this.activateAction(this.tree.reference(control), true);
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
		let interactiveDescendant = false;
		while (node) {
			if (
				["button", "input", "label"].includes(node.tagName) ||
				(node.tagName === "a" && Object.hasOwn(node.attributes, "href"))
			)
				return node;
			if (node.tagName === "summary")
				return interactiveDescendant ? undefined : node;
			interactiveDescendant ||= isInteractiveElement(node);
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
				this.tree.setInputChecked(previous, true, false);
			} else this.tree.setControl(current.id, { checked: false });
		}
	}

	private *defaultIntent(node: Readonly<DocumentNode>): EventAction<{
		defaultAction?: DefaultActionIntent;
		reset?: FormResetResult;
	}> {
		const reference = this.tree.reference(node.id);
		if (node.tagName === "summary") {
			const details = summaryDetails(this.tree, node);
			if (details !== undefined) this.tree.toggleAttribute(details, "open");
			return {};
		}
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
			node.tagName === "input" ? inputType(node) : buttonType(this.tree, node);
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
