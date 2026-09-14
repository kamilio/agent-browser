import { isSubmitButton } from "./button-type.js";
import { lengthApplies, parseLengthLimit } from "./control-length.js";
import { moveControlText } from "./control-text-layout.js";
import { controlTextState } from "./control-text-state.js";
import {
	controlValue,
	formControls,
	formOwner,
	inputType,
	isControlDisabled,
	validateTextControl,
} from "./controls.js";
import { summaryDetails } from "./details.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { EditableKeyboard } from "./editable-keyboard.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type { DocumentFocus } from "./focus.js";
import { resolveVisualTarget } from "./generated-controls.js";
import { BrowserInputEvent } from "./input-events.js";
import type { DefaultActionIntent, InteractionResult } from "./interactions.js";
import { keyboardScrollAction } from "./keyboard-scroll.js";
import {
	type KeyboardKey,
	KeyboardState,
	keyboardChord,
} from "./keyboard-state.js";
import { nextOffset, previousOffset } from "./keyboard-text.js";
import { nativeControlCaret } from "./native-control-caret.js";
import { rangeKeyboardAction } from "./range-keyboard.js";
import { selectKeyboardAction } from "./select-keyboard.js";
import { SelectTypeahead } from "./select-typeahead.js";

type Key = KeyboardKey;

export const keyboardActivationCapabilities = Object.freeze({
	partial: true,
	space: "held-until-release",
	enter: "during-direct-activation",
	canceledDownDoesNotArm: true,
	focusChangeCancels: true,
	mouseStateIndependent: true,
	abortableDispatch: true,
	implicitSubmitterActive: false,
	customRoleDefaults: false,
});
export interface KeyboardResult {
	reference: string;
	canceled: boolean;
	revision: number;
	key?: string;
	characters?: number;
	selection?: { start: number; end: number };
	interaction?: InteractionResult;
	defaultAction?: DefaultActionIntent;
	scroll?: Readonly<{ x: number; y: number }>;
}

export class BrowserKeyboardEvent extends BrowserEvent {
	readonly #key: Key;
	constructor(
		type: "keydown" | "keypress" | "keyup",
		key: Omit<Key, "alt" | "repeat" | "location"> &
			Partial<Pick<Key, "alt" | "repeat" | "location">>,
	) {
		super(type, { bubbles: true, cancelable: true, composed: true });
		this.#key = { alt: false, repeat: false, location: 0, ...key };
	}
	get key() {
		return this.#key.key;
	}
	get code() {
		return this.#key.code;
	}
	get shiftKey() {
		return this.#key.shift;
	}
	get ctrlKey() {
		return this.#key.control;
	}
	get metaKey() {
		return this.#key.meta;
	}
	get altKey() {
		return this.#key.alt;
	}
	get repeat() {
		return this.#key.repeat;
	}
	get isComposing() {
		return false;
	}
	get location() {
		return this.#key.location;
	}
}

export class DocumentKeyboard {
	private readonly contentEditing: EditableKeyboard;
	private readonly keys = new KeyboardState();
	private readonly typeahead: SelectTypeahead;
	private spaceTarget: { id: number; reference: string } | undefined;
	private focusGeneration = 0;
	private closed = false;
	private readonly unregisterChange: () => void;
	private readonly unregisterClose: () => void;
	private caretOwner: ReturnType<typeof nativeControlCaret> | undefined;
	private verticalGeneration = 0;
	private verticalCaret:
		| {
				record: ReturnType<ReturnType<typeof nativeControlCaret>["selection"]>;
				fingerprint: string;
				horizontal: number;
		  }
		| undefined;
	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
		private readonly focus: DocumentFocus,
		private readonly activate: (
			reference: string,
			allowHidden?: boolean,
		) => InteractionResult,
		private readonly activateAction?: (
			reference: string,
			allowHidden?: boolean,
		) => EventAction<InteractionResult>,
	) {
		this.typeahead = new SelectTypeahead(tree);
		this.contentEditing = new EditableKeyboard(
			tree,
			focus,
			() => this.focusGeneration,
		);
		this.unregisterChange = tree.onChange((change) => {
			if (
				change.kind === "focus" ||
				change.kind === "remove" ||
				(change.target === this.verticalCaret?.record.id &&
					["attribute", "control", "text"].includes(change.kind))
			)
				this.clearVerticalCaret();
			if (change.kind === "focus") {
				this.focusGeneration++;
				this.clearSpaceActivation();
			} else if (
				this.spaceTarget !== undefined &&
				["remove", "insert", "attribute", "style"].includes(change.kind)
			) {
				const reference = this.spaceTarget.reference;
				if (this.focus.activeReference() !== reference)
					this.clearSpaceActivation();
			}
		});
		this.unregisterClose = tree.onClose(() => this.close());
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		const caret = this.caretOwner;
		this.caretOwner = undefined;
		this.clearVerticalCaret();
		this.keys.clear();
		this.typeahead.reset();
		this.unregisterChange();
		this.unregisterClose();
		try {
			caret?.close();
		} finally {
			this.clearSpaceActivation();
		}
	}

	private clearSpaceActivation() {
		this.spaceTarget = undefined;
		this.tree.clearKeyboardActivation();
	}

	private clearVerticalCaret() {
		this.verticalCaret = undefined;
		this.verticalGeneration++;
	}

	private ensureOpen() {
		if (this.closed || this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document keyboard is closed");
		this.tree.get(this.tree.root);
		this.caretOwner?.ensureOpen();
	}

	collapseEnd(id: number) {
		this.ensureOpen();
		if (!isHtmlElement(this.tree.get(id)))
			throw new AgentBrowserError("not-actionable", "Expected an HTML control");
		this.clearVerticalCaret();
		this.controlCaret().collapse(id);
	}

	placeControlCaret(id: number, offset: number, anchor = offset) {
		this.ensureOpen();
		if (!isHtmlElement(this.tree.get(id)))
			throw new AgentBrowserError("not-actionable", "Expected an HTML control");
		if (this.editable(false) !== id)
			throw new AgentBrowserError(
				"not-actionable",
				"Control caret target changed",
			);
		const value = controlValue(this.tree, id);
		for (const position of [anchor, offset])
			if (
				!Number.isSafeInteger(position) ||
				position < 0 ||
				position > value.length ||
				(position > 0 &&
					nextOffset(value, previousOffset(value, position)) !== position)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid control caret boundary",
				);
		this.clearVerticalCaret();
		this.controlCaret().select(id, anchor, offset);
	}

	collapseEditableEnd(id: number, target: number) {
		this.ensureOpen();
		this.contentEditing.collapseEnd(id, target);
	}

	modifiers() {
		this.tree.get(this.tree.root);
		return this.keys.modifiers();
	}

	type(text: string): KeyboardResult {
		return runEventAction(this.events, this.typeAction(text));
	}

	typeAsync(text: string, signal?: AbortSignal): Promise<KeyboardResult> {
		if (signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Keyboard action aborted"),
			);
		return runEventActionAsync(
			this.events,
			this.typeAction(text, signal),
			signal,
		);
	}

	private *typeAction(
		text: string,
		signal?: AbortSignal,
	): EventAction<KeyboardResult> {
		this.ensureOpen();
		if (
			typeof text !== "string" ||
			text.length > 16_384 ||
			/\p{Cc}|\p{Cs}/u.test(text)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Type requires bounded printable text; use fill for multiline values",
			);
		const characters = Array.from(text);
		if (characters.length > 4096)
			throw new AgentBrowserError(
				"resource-limit",
				"Typing character limit exceeded",
			);
		const id = this.editable();
		const editableHost = this.contentEditing.host(id);
		const generation = this.focusGeneration;
		let canceled = false;
		for (const character of characters) {
			if (
				this.focus.active() !== id ||
				(editableHost !== null && generation !== this.focusGeneration)
			)
				throw new AgentBrowserError(
					"not-actionable",
					"Focus changed during typing",
				);
			canceled =
				(yield* this.pressAction(character, true, signal)).canceled || canceled;
		}
		return { ...this.result(canceled), characters: characters.length };
	}

	press(input: string): KeyboardResult {
		return runEventAction(this.events, this.pressAction(input));
	}

	pressAsync(input: string, signal?: AbortSignal): Promise<KeyboardResult> {
		if (signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Keyboard action aborted"),
			);
		return runEventActionAsync(
			this.events,
			this.pressAction(input, false, signal),
			signal,
		);
	}

	down(input: string): KeyboardResult {
		return runEventAction(this.events, this.downAction(input));
	}

	downAsync(input: string, signal?: AbortSignal): Promise<KeyboardResult> {
		if (signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Keyboard action aborted"),
			);
		return runEventActionAsync(this.events, this.downAction(input), signal);
	}

	up(input: string): KeyboardResult {
		return runEventAction(this.events, this.upAction(input));
	}

	upAsync(input: string, signal?: AbortSignal): Promise<KeyboardResult> {
		if (signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Keyboard action aborted"),
			);
		return runEventActionAsync(this.events, this.upAction(input), signal);
	}

	private *pressAction(
		input: string,
		literal = false,
		signal?: AbortSignal,
	): EventAction<KeyboardResult> {
		this.ensureOpen();
		const parts = keyboardChord(input);
		const released: string[] = [];
		try {
			for (const modifier of parts.slice(0, -1)) {
				if (this.keys.has(modifier)) continue;
				released.unshift(modifier);
				yield* this.downAction(modifier);
			}
			const inputKey = parts[parts.length - 1];
			released.unshift(inputKey);
			const down = yield* this.downAction(inputKey, literal);
			released.shift();
			const up = yield* this.upAction(inputKey, literal);
			return {
				...down,
				...this.result(down.canceled || up.canceled),
				...(up.interaction ? { interaction: up.interaction } : {}),
				...(up.defaultAction ? { defaultAction: up.defaultAction } : {}),
			};
		} finally {
			try {
				for (const key of released) {
					if (this.events.metrics().closed || signal?.aborted) break;
					yield* this.upAction(key, literal);
				}
			} finally {
				for (const inputKey of released) {
					const key = this.keys.up(inputKey, literal);
					if (key.code === "Space") this.clearSpaceActivation();
				}
			}
		}
	}

	private *upAction(
		input: string,
		literal = false,
	): EventAction<KeyboardResult> {
		this.ensureOpen();
		const key = this.keys.up(input, literal);
		const spaceTarget = key.code === "Space" ? this.spaceTarget : undefined;
		if (key.code === "Space") this.clearSpaceActivation();
		const focusGeneration = this.focusGeneration;
		const permitted = yield {
			target: this.focus.active() ?? this.tree.root,
			event: new BrowserKeyboardEvent("keyup", key),
		};
		let interaction: InteractionResult | undefined;
		if (
			permitted &&
			spaceTarget !== undefined &&
			focusGeneration === this.focusGeneration &&
			this.focus.activeReference() === spaceTarget.reference
		)
			interaction = yield* this.activation(spaceTarget.reference);
		return {
			...this.result(!permitted),
			key: key.key,
			...(interaction ? { interaction } : {}),
			...(interaction?.defaultAction
				? { defaultAction: interaction.defaultAction }
				: {}),
		};
	}

	private *downAction(
		input: string,
		literal = false,
	): EventAction<KeyboardResult> {
		this.ensureOpen();
		const key = this.keys.down(input, literal);
		const shortcut = !literal && (key.control || key.meta || key.alt);
		if (!key.control && !key.meta && !key.alt)
			this.tree.recordInputModality("keyboard");
		const id = this.focus.active();
		const target = id ?? this.tree.root;
		const focusReference = this.focus.activeReference();
		const generatedFocus = this.tree.generatedFocusReference !== null;
		const editableHost =
			id !== null && !generatedFocus ? this.contentEditing.host(id) : null;
		if (key.code === "Space" && !key.repeat) this.clearSpaceActivation();
		const focusGeneration = this.focusGeneration;
		let keyEvent = new BrowserKeyboardEvent("keydown", key);
		let permitted = yield {
			target,
			event: keyEvent,
		};
		if (
			permitted &&
			this.focus.activeReference() === focusReference &&
			(editableHost === null || focusGeneration === this.focusGeneration) &&
			!shortcut &&
			(Array.from(key.key).length === 1 || key.key === "Enter")
		) {
			keyEvent = new BrowserKeyboardEvent("keypress", key);
			permitted = yield {
				target,
				event: keyEvent,
			};
		}
		let canceled = !permitted;
		let interaction: InteractionResult | undefined;
		let defaultAction: DefaultActionIntent | undefined;
		let scroll: Readonly<{ x: number; y: number }> | undefined;
		if (
			permitted &&
			editableHost !== null &&
			focusGeneration !== this.focusGeneration
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed during editable key dispatch",
			);
		if (permitted && this.focus.activeReference() === focusReference) {
			if (
				!literal &&
				editableHost === null &&
				(id === null || isHtmlElement(this.tree.get(id)))
			)
				scroll = yield* keyboardScrollAction(this.tree, id, key);
			if (key.key === "Tab" && !shortcut)
				yield* this.focus.moveAction(key.shift);
			else if (
				scroll === undefined &&
				key.key !== "Escape" &&
				id !== null &&
				isHtmlElement(this.tree.get(id))
			) {
				const node = this.tree.get(id);
				const currentEditableHost = this.contentEditing.host(id);
				const editable =
					node.tagName === "textarea" ||
					(node.tagName === "input" &&
						["text", "search", "url", "tel", "password"].includes(
							inputType(node),
						));
				if (editableHost !== null || currentEditableHost !== null) {
					if (
						this.contentEditing.validate(id) !==
						(editableHost ?? currentEditableHost)
					)
						throw new AgentBrowserError(
							"not-actionable",
							"Editing host changed during key dispatch",
						);
					canceled = !(yield* this.contentEditing.key(id, key, shortcut));
				} else if (node.tagName === "input" && inputType(node) === "range") {
					if (!key.control && !key.meta && !key.alt)
						yield* rangeKeyboardAction(this.tree, this.focus, id, key.key);
				} else if (shortcut) {
					if (
						editable &&
						!key.alt &&
						!key.shift &&
						key.control !== key.meta &&
						key.key.toLowerCase() === "a"
					) {
						const caret = this.selection(id);
						this.clearVerticalCaret();
						this.controlCaret().move(caret, 0, caret.value.length);
					}
				} else if (node.tagName === "select") {
					yield* selectKeyboardAction(
						this.tree,
						id,
						key.key,
						this.typeahead,
						keyEvent.timeStamp,
					);
				} else if (
					editable &&
					["ArrowLeft", "ArrowRight", "Home", "End"].includes(key.key)
				) {
					this.editable(false);
					this.moveCaret(id, key);
				} else if (
					node.tagName === "textarea" &&
					["ArrowUp", "ArrowDown"].includes(key.key)
				) {
					if (focusGeneration !== this.focusGeneration)
						throw new AgentBrowserError(
							"not-actionable",
							"Focus changed during textarea key dispatch",
						);
					this.moveVerticalCaret(id, key);
				} else if (key.key === "Enter") {
					if (node.tagName === "textarea")
						canceled = !(yield* this.edit(id, "\n", "insertLineBreak", null));
					else if (
						node.tagName === "button" ||
						node.tagName === "a" ||
						generatedFocus ||
						summaryDetails(this.tree, node) !== undefined
					)
						interaction = yield* this.formalActivation(
							focusReference ?? this.tree.reference(id),
						);
					else if (
						node.tagName === "input" &&
						["submit", "image", "reset", "button"].includes(inputType(node))
					)
						interaction = yield* this.formalActivation(this.tree.reference(id));
					else if (
						node.tagName === "input" &&
						[
							"text",
							"search",
							"url",
							"tel",
							"email",
							"password",
							"number",
							"date",
							"month",
							"week",
							"time",
							"datetime-local",
						].includes(inputType(node))
					) {
						const owner = formOwner(this.tree, id);
						if (owner !== undefined) {
							const controls = formControls(this.tree, owner);
							const submitter = controls.find((control) =>
								isSubmitButton(this.tree, control),
							);
							if (submitter && !isControlDisabled(this.tree, submitter.id))
								interaction = yield* this.activation(
									this.tree.reference(submitter.id),
									true,
								);
							else if (
								!submitter &&
								controls.filter(
									(control) =>
										control.tagName === "input" &&
										[
											"text",
											"search",
											"url",
											"tel",
											"email",
											"password",
											"number",
											"date",
											"month",
											"week",
											"time",
											"datetime-local",
										].includes(inputType(control)),
								).length <= 1
							)
								defaultAction = {
									kind: "submit",
									formRef: this.tree.reference(owner),
								};
						}
					}
				} else if (
					key.key === " " &&
					!editable &&
					(node.tagName === "button" ||
						generatedFocus ||
						summaryDetails(this.tree, node) !== undefined ||
						(node.tagName === "input" &&
							[
								"checkbox",
								"radio",
								"button",
								"submit",
								"reset",
								"image",
							].includes(inputType(node))))
				) {
					if (focusGeneration === this.focusGeneration) {
						this.spaceTarget = {
							id,
							reference: focusReference ?? this.tree.reference(id),
						};
						this.tree.setKeyboardActivation(id);
					}
				} else if (key.key === "Backspace" || key.key === "Delete") {
					canceled = !(yield* this.edit(
						id,
						"",
						key.key === "Backspace"
							? "deleteContentBackward"
							: "deleteContentForward",
						null,
					));
				} else if (Array.from(key.key).length === 1)
					canceled = !(yield* this.edit(id, key.key, "insertText", key.key));
			}
		}
		return {
			...this.result(canceled),
			key: key.key,
			...(scroll ? { scroll } : {}),
			...(interaction ? { interaction } : {}),
			...(interaction?.defaultAction || defaultAction
				? { defaultAction: interaction?.defaultAction ?? defaultAction }
				: {}),
		};
	}

	private *formalActivation(reference: string): EventAction<InteractionResult> {
		this.tree.setKeyboardActivation(
			resolveVisualTarget(this.tree, reference).node.id,
		);
		try {
			return yield* this.activation(reference);
		} finally {
			const spaceTarget = this.spaceTarget;
			if (
				!this.closed &&
				!this.events.metrics().closed &&
				spaceTarget !== undefined &&
				this.focus.activeReference() === spaceTarget.reference &&
				this.spaceTarget === spaceTarget
			)
				this.tree.setKeyboardActivation(spaceTarget.id);
			else this.tree.clearKeyboardActivation();
		}
	}

	private *activation(
		reference: string,
		allowHidden?: boolean,
	): EventAction<InteractionResult> {
		if (this.activateAction)
			return yield* this.activateAction(reference, allowHidden);
		return this.activate(reference, allowHidden);
	}

	private editable(writable = true) {
		const id = this.focus.active();
		if (id === null)
			throw new AgentBrowserError(
				"not-actionable",
				"No editable element is focused",
			);
		const node = this.tree.get(id);
		if (!isHtmlElement(node))
			throw new AgentBrowserError(
				"not-actionable",
				"Expected an HTML editable element",
			);
		if (this.contentEditing.host(id) !== null) {
			this.contentEditing.validate(id);
			return id;
		}
		if (
			!(
				node.tagName === "textarea" ||
				(node.tagName === "input" &&
					["text", "search", "url", "tel", "password"].includes(
						inputType(node),
					))
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Keyboard editing for this control is not implemented",
			);
		if (writable)
			validateTextControl(
				this.tree,
				this.tree.reference(id),
				controlValue(this.tree, id),
			);
		return id;
	}

	private controlCaret() {
		this.ensureOpen();
		if (this.caretOwner) return this.caretOwner;
		const owner = nativeControlCaret(this.tree);
		if (this.closed || this.events.metrics().closed) {
			owner.close();
			this.ensureOpen();
		}
		this.caretOwner = owner;
		return owner;
	}

	private selection(id: number) {
		return this.controlCaret().selection(id);
	}

	private *edit(
		id: number,
		text: string,
		inputType: string,
		data: string | null,
	): EventAction<boolean> {
		this.clearVerticalCaret();
		if (this.editable() !== id)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus changed during editing",
			);
		const caret = this.selection(id);
		let start = Math.min(caret.anchor, caret.position);
		let end = Math.max(caret.anchor, caret.position);
		if (start === end && inputType === "deleteContentBackward")
			start = previousOffset(caret.value, start);
		if (start === end && inputType === "deleteContentForward")
			end = nextOffset(caret.value, end);
		const next = caret.value.slice(0, start) + text + caret.value.slice(end);
		const node = this.tree.get(id);
		const maximum = lengthApplies(node)
			? parseLengthLimit(node.attributes.maxlength)
			: undefined;
		if (text && maximum !== undefined && next.length > maximum) return true;
		if (next === caret.value) return true;
		if (
			!(yield {
				target: id,
				event: new BrowserInputEvent("beforeinput", data, inputType, true),
			})
		)
			return false;
		this.ensureOpen();
		if (this.editable() !== id || controlValue(this.tree, id) !== caret.value)
			throw new AgentBrowserError(
				"not-actionable",
				"Editing target changed during beforeinput",
			);
		this.controlCaret().replace(caret, next, start + text.length);
		this.focus.markEdited(id);
		yield {
			target: id,
			event: new BrowserInputEvent("input", data, inputType),
		};
		return true;
	}

	private moveCaret(id: number, key: Key) {
		this.clearVerticalCaret();
		const caret = this.selection(id);
		const start = Math.min(caret.anchor, caret.position);
		const end = Math.max(caret.anchor, caret.position);
		let position = caret.position;
		if (key.key === "ArrowLeft")
			position =
				!key.shift && start !== end
					? start
					: previousOffset(caret.value, position);
		if (key.key === "ArrowRight")
			position =
				!key.shift && start !== end ? end : nextOffset(caret.value, position);
		if (key.key === "Home")
			position =
				this.tree.get(id).tagName === "textarea" && position > 0
					? caret.value.lastIndexOf("\n", position - 1) + 1
					: 0;
		if (key.key === "End") {
			const newline = caret.value.indexOf("\n", position);
			position =
				this.tree.get(id).tagName === "textarea" && newline !== -1
					? newline
					: caret.value.length;
		}
		this.controlCaret().move(
			caret,
			key.shift ? caret.anchor : position,
			position,
		);
	}

	private moveVerticalCaret(id: number, key: Key) {
		const previous = this.verticalCaret;
		this.clearVerticalCaret();
		const generation = this.verticalGeneration;
		const state = controlTextState(this.tree, id);
		if (!state || state.kind !== "textarea" || !state.control.focused) return;
		const selection = state.control.selection;
		if (!selection) return;
		const fingerprint = JSON.stringify([
			state.fingerprint,
			state.control.wordSpacing ?? 0,
		]);
		const caret = previous ? this.caretOwner?.selection(id) : undefined;
		const destination = moveControlText(
			{
				kind: state.kind,
				text: state.control.text,
				fontSize: state.control.fontSize,
				wordSpacing: state.control.wordSpacing,
				columns: state.columns,
				rows: state.rows,
				placeholder: state.control.placeholder,
				selection,
			},
			key.key === "ArrowUp" ? "up" : "down",
			previous &&
				previous.record === caret &&
				previous.fingerprint === fingerprint
				? previous.horizontal
				: undefined,
		);
		if (!destination) return;
		const record = this.controlCaret().select(
			id,
			key.shift ? selection.anchor : destination.offset,
			destination.offset,
		);
		if (generation === this.verticalGeneration)
			this.verticalCaret = {
				record,
				fingerprint,
				horizontal: destination.horizontal,
			};
	}

	private result(canceled: boolean): KeyboardResult {
		this.ensureOpen();
		const id = this.focus.active();
		const caret =
			id !== null && this.caretOwner?.has(id) ? this.selection(id) : undefined;
		return {
			reference:
				this.focus.activeReference() ?? this.tree.reference(this.tree.root),
			canceled,
			revision: this.tree.revision,
			...(caret
				? {
						selection: {
							start: Math.min(caret.anchor, caret.position),
							end: Math.max(caret.anchor, caret.position),
						},
					}
				: {}),
		};
	}
}
