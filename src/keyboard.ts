import { isSubmitButton } from "./button-type.js";
import { lengthApplies, parseLengthLimit } from "./control-length.js";
import { rangeKeyboardAction } from "./range-keyboard.js";
import {
	controlValue,
	fillTextControl,
	formControls,
	formOwner,
	inputType,
	isControlDisabled,
	validateTextControl,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type { DocumentFocus } from "./focus.js";
import { BrowserInputEvent } from "./input-events.js";
import type { DefaultActionIntent, InteractionResult } from "./interactions.js";
import { selectKeyboardAction } from "./select-keyboard.js";
import { SelectTypeahead } from "./select-typeahead.js";
import { keyboardScrollAction } from "./keyboard-scroll.js";
import { summaryDetails } from "./details.js";
import {
	keyboardChord,
	KeyboardState,
	type KeyboardKey,
} from "./keyboard-state.js";

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

function previousOffset(value: string, offset: number) {
	if (
		offset > 1 &&
		/[\uDC00-\uDFFF]/.test(value[offset - 1]) &&
		/[\uD800-\uDBFF]/.test(value[offset - 2])
	)
		return offset - 2;
	return Math.max(0, offset - 1);
}
function nextOffset(value: string, offset: number) {
	return Math.min(
		value.length,
		offset + ((value.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1),
	);
}

export class DocumentKeyboard {
	private readonly keys = new KeyboardState();
	private readonly typeahead: SelectTypeahead;
	private spaceTarget: number | undefined;
	private focusGeneration = 0;
	private closed = false;
	private readonly unregisterChange: () => void;
	private readonly unregisterClose: () => void;
	private caret:
		| { id: number; value: string; anchor: number; position: number }
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
		this.unregisterChange = tree.onChange((change) => {
			if (change.kind === "focus") {
				this.focusGeneration++;
				this.clearSpaceActivation();
			} else if (
				this.spaceTarget !== undefined &&
				["remove", "insert", "attribute", "style"].includes(change.kind)
			) {
				if (this.focus.active() !== this.spaceTarget)
					this.clearSpaceActivation();
			}
		});
		this.unregisterClose = tree.onClose(() => this.close());
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.caret = undefined;
		this.keys.clear();
		this.typeahead.reset();
		this.clearSpaceActivation();
		this.unregisterChange();
		this.unregisterClose();
	}

	private clearSpaceActivation() {
		this.spaceTarget = undefined;
		this.tree.clearKeyboardActivation();
	}

	private ensureOpen() {
		if (this.closed || this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document keyboard is closed");
		this.tree.get(this.tree.root);
	}

	collapseEnd(id: number) {
		const value = controlValue(this.tree, id);
		this.caret = { id, value, anchor: value.length, position: value.length };
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
		let canceled = false;
		for (const character of characters) {
			if (this.focus.active() !== id)
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
			this.focus.active() === spaceTarget
		)
			interaction = yield* this.activation(this.tree.reference(spaceTarget));
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
		const id = this.focus.active();
		const target = id ?? this.tree.root;
		if (key.code === "Space" && !key.repeat) this.clearSpaceActivation();
		const focusGeneration = this.focusGeneration;
		let keyEvent = new BrowserKeyboardEvent("keydown", key);
		let permitted = yield {
			target,
			event: keyEvent,
		};
		if (
			permitted &&
			this.focus.active() === id &&
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
		if (permitted && this.focus.active() === id) {
			if (!literal) scroll = yield* keyboardScrollAction(this.tree, id, key);
			if (key.key === "Tab" && !shortcut)
				yield* this.focus.moveAction(key.shift);
			else if (scroll === undefined && key.key !== "Escape" && id !== null) {
				const node = this.tree.get(id);
				const editable =
					node.tagName === "textarea" ||
					(node.tagName === "input" &&
						["text", "search", "url", "tel", "password"].includes(
							inputType(node),
						));
				if (node.tagName === "input" && inputType(node) === "range") {
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
						caret.anchor = 0;
						caret.position = caret.value.length;
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
				} else if (key.key === "Enter") {
					if (node.tagName === "textarea")
						canceled = !(yield* this.edit(id, "\n", "insertLineBreak", null));
					else if (
						node.tagName === "button" ||
						node.tagName === "a" ||
						summaryDetails(this.tree, node) !== undefined
					)
						interaction = yield* this.formalActivation(this.tree.reference(id));
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
						this.spaceTarget = id;
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
		this.tree.setKeyboardActivation(this.tree.resolve(reference).id);
		try {
			return yield* this.activation(reference);
		} finally {
			if (
				!this.closed &&
				!this.events.metrics().closed &&
				this.spaceTarget !== undefined &&
				this.focus.active() === this.spaceTarget
			)
				this.tree.setKeyboardActivation(this.spaceTarget);
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

	private selection(id: number) {
		const value = controlValue(this.tree, id);
		if (!this.caret || this.caret.id !== id || this.caret.value !== value)
			this.collapseEnd(id);
		return this.caret as NonNullable<typeof this.caret>;
	}

	private *edit(
		id: number,
		text: string,
		inputType: string,
		data: string | null,
	): EventAction<boolean> {
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
		if (this.editable() !== id || controlValue(this.tree, id) !== caret.value)
			throw new AgentBrowserError(
				"not-actionable",
				"Editing target changed during beforeinput",
			);
		fillTextControl(this.tree, this.tree.reference(id), next);
		const applied = controlValue(this.tree, id);
		this.caret = {
			id,
			value: applied,
			anchor: Math.min(applied.length, start + text.length),
			position: Math.min(applied.length, start + text.length),
		};
		this.focus.markEdited(id);
		yield {
			target: id,
			event: new BrowserInputEvent("input", data, inputType),
		};
		return true;
	}

	private moveCaret(id: number, key: Key) {
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
		caret.position = position;
		if (!key.shift) caret.anchor = position;
	}

	private result(canceled: boolean): KeyboardResult {
		const id = this.focus.active();
		const caret =
			id !== null && this.caret?.id === id ? this.selection(id) : undefined;
		return {
			reference: this.tree.reference(id ?? this.tree.root),
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
