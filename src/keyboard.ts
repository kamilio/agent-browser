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

interface Key {
	key: string;
	code: string;
	shift: boolean;
	control: boolean;
	meta: boolean;
	alt?: boolean;
}
export interface KeyboardResult {
	reference: string;
	canceled: boolean;
	revision: number;
	key?: string;
	characters?: number;
	selection?: { start: number; end: number };
	interaction?: InteractionResult;
	defaultAction?: DefaultActionIntent;
}

export class BrowserKeyboardEvent extends BrowserEvent {
	readonly #key: Key;
	constructor(type: "keydown" | "keypress" | "keyup", key: Key) {
		super(type, { bubbles: true, cancelable: true, composed: true });
		this.#key = { ...key };
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
		return this.#key.alt ?? false;
	}
	get repeat() {
		return false;
	}
	get isComposing() {
		return false;
	}
	get location() {
		return 0;
	}
}

function parseKey(input: string, range = false): Key {
	if (typeof input !== "string" || !input || input.length > 128)
		throw new AgentBrowserError("invalid-input", "Invalid keyboard key");
	const parts = input === "+" ? [input] : input.split("+");
	const name = parts.pop() as string;
	const modifiers = new Set(parts.map((part) => part.toLowerCase()));
	if (
		modifiers.size !== parts.length ||
		[...modifiers].some(
			(part) =>
				!["shift", "control", "meta", ...(range ? ["alt"] : [])].includes(part),
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Keyboard modifier combination is not implemented",
		);
	const names: Record<string, string> = {
		enter: "Enter",
		tab: "Tab",
		backspace: "Backspace",
		delete: "Delete",
		arrowleft: "ArrowLeft",
		arrowright: "ArrowRight",
		...(range
			? {
					arrowup: "ArrowUp",
					arrowdown: "ArrowDown",
					pageup: "PageUp",
					pagedown: "PageDown",
				}
			: {}),
		home: "Home",
		end: "End",
		escape: "Escape",
		space: " ",
	};
	let key = Object.hasOwn(names, name.toLowerCase())
		? names[name.toLowerCase()]
		: name;
	if (
		!Object.values(names).includes(key) &&
		(Array.from(key).length !== 1 || /\p{Cc}|\p{Cs}/u.test(key))
	)
		throw new AgentBrowserError(
			"unsupported",
			"Keyboard key is not implemented",
		);
	const control = modifiers.has("control");
	const meta = modifiers.has("meta");
	const shift = modifiers.has("shift");
	if (
		!range &&
		(control || meta) &&
		(control === meta || shift || key.toLowerCase() !== "a")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Only Control+A or Meta+A editing shortcuts are implemented",
		);
	if (shift && /^[a-z]$/.test(key)) key = key.toUpperCase();
	const code = /^[a-z]$/i.test(key)
		? `Key${key.toUpperCase()}`
		: /^\d$/.test(key)
			? `Digit${key}`
			: key === " "
				? "Space"
				: Object.values(names).includes(key)
					? key
					: "";
	return { key, code, shift, control, meta, alt: modifiers.has("alt") };
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
	private readonly typeahead: SelectTypeahead;
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
		tree.onClose(() => {
			this.caret = undefined;
		});
	}

	collapseEnd(id: number) {
		const value = controlValue(this.tree, id);
		this.caret = { id, value, anchor: value.length, position: value.length };
	}

	type(text: string): KeyboardResult {
		return runEventAction(this.events, this.typeAction(text));
	}

	typeAsync(text: string): Promise<KeyboardResult> {
		return runEventActionAsync(this.events, this.typeAction(text));
	}

	private *typeAction(text: string): EventAction<KeyboardResult> {
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
			canceled = (yield* this.pressAction(character)).canceled || canceled;
		}
		return { ...this.result(canceled), characters: characters.length };
	}

	press(input: string): KeyboardResult {
		return runEventAction(this.events, this.pressAction(input));
	}

	pressAsync(input: string): Promise<KeyboardResult> {
		return runEventActionAsync(this.events, this.pressAction(input));
	}

	private *pressAction(input: string): EventAction<KeyboardResult> {
		const id = this.focus.active();
		const node = id === null ? undefined : this.tree.get(id);
		const key = parseKey(
			input,
			node?.tagName === "select" ||
				(node?.tagName === "input" && inputType(node) === "range"),
		);
		const target = id ?? this.tree.root;
		let keyUpSent = false;
		const keyboard = this;
		function* keyUp(): EventAction<boolean> {
			if (keyUpSent || keyboard.events.metrics().closed) return true;
			keyUpSent = true;
			return yield {
				target: keyboard.focus.active() ?? keyboard.tree.root,
				event: new BrowserKeyboardEvent("keyup", key),
			};
		}
		try {
			let keyEvent = new BrowserKeyboardEvent("keydown", key);
			let permitted = yield {
				target,
				event: keyEvent,
			};
			if (
				permitted &&
				this.focus.active() === id &&
				!key.control &&
				!key.meta &&
				!key.alt &&
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
			if (permitted && this.focus.active() === id) {
				if (key.key === "Tab") yield* this.focus.moveAction(key.shift);
				else if (key.key !== "Escape" && id !== null) {
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
					} else if (key.control || key.meta || key.alt) {
						if (
							node.tagName !== "select" &&
							!key.alt &&
							!key.shift &&
							key.control !== key.meta &&
							key.key.toLowerCase() === "a"
						) {
							this.editable(false);
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
						["ArrowLeft", "ArrowRight", "Home", "End"].includes(key.key)
					) {
						this.editable(false);
						this.moveCaret(id, key);
					} else if (key.key === "Enter") {
						if (node.tagName === "textarea")
							canceled = !(yield* this.edit(id, "\n", "insertLineBreak", null));
						else if (node.tagName === "button" || node.tagName === "a")
							interaction = yield* this.activation(this.tree.reference(id));
						else if (
							node.tagName === "input" &&
							["submit", "image", "reset", "button"].includes(inputType(node))
						)
							interaction = yield* this.activation(this.tree.reference(id));
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
							(node.tagName === "input" &&
								["checkbox", "radio", "button", "submit", "reset"].includes(
									inputType(node),
								)))
					) {
						const permittedUp = yield* keyUp();
						if (permittedUp && this.focus.active() === id)
							interaction = yield* this.activation(this.tree.reference(id));
						return {
							...this.result(!permittedUp),
							key: key.key,
							interaction,
							defaultAction: interaction?.defaultAction,
						};
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
			yield* keyUp();
			return {
				...this.result(canceled),
				key: key.key,
				...(interaction ? { interaction } : {}),
				...(interaction?.defaultAction || defaultAction
					? { defaultAction: interaction?.defaultAction ?? defaultAction }
					: {}),
			};
		} finally {
			yield* keyUp();
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
