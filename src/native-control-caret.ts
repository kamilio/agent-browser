import { controlValue, fillTextControl, inputType } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { nextOffset, previousOffset } from "./keyboard-text.js";

export interface NativeControlSelection {
	readonly anchor: number;
	readonly focus: number;
	readonly start: number;
	readonly end: number;
	readonly valueLength: number;
}

interface ControlCaret {
	readonly id: number;
	readonly value: string;
	readonly anchor: number;
	readonly position: number;
}

const owners = new WeakMap<DocumentTree, NativeControlCaret>();
const textTypes = new Set([
	"text",
	"search",
	"url",
	"tel",
	"password",
	"email",
	"number",
]);

class NativeControlCaret {
	#record: Readonly<ControlCaret> | undefined;
	#closed = false;
	#ready = false;
	#generation = 0;
	#unregisterChange: (() => void) | undefined;
	#unregisterClose: (() => unknown) | undefined;

	constructor(private readonly tree: DocumentTree) {}

	connect() {
		let unregisterClose: (() => unknown) | undefined;
		let unregisterChange: (() => void) | undefined;
		try {
			unregisterClose = this.tree.onClose(() => this.close());
			unregisterChange = this.tree.onChange((change) => {
				if (this.#closed) return;
				if (
					change.kind === "focus" ||
					(change.target === this.#record?.id &&
						["attribute", "control", "text"].includes(change.kind))
				)
					this.#generation++;
				if (
					change.kind === "remove" &&
					this.#record &&
					!this.tree.isConnected(this.#record.id)
				) {
					this.#record = undefined;
					this.#generation++;
				}
			});
			this.#unregisterClose = unregisterClose;
			this.#unregisterChange = unregisterChange;
			this.#ready = true;
			this.ensureOpen();
		} catch (error) {
			if (!this.#closed && owners.get(this.tree) === this)
				owners.delete(this.tree);
			this.#closed = true;
			this.#record = undefined;
			unregisterChange?.();
			unregisterClose?.();
			throw error;
		}
	}

	ensureOpen() {
		if (this.#closed || !this.#ready || owners.get(this.tree) !== this)
			throw new AgentBrowserError(
				"closed",
				"Native control caret owner is closed",
			);
		this.tree.get(this.tree.root);
	}

	has(id: number): boolean {
		this.ensureOpen();
		return this.#record?.id === id && this.eligible(id);
	}

	private eligible(id: number): boolean {
		if (!this.tree.isConnected(id)) return false;
		const node = this.tree.get(id);
		return (
			node.tagName === "textarea" ||
			(node.tagName === "input" && textTypes.has(inputType(node)))
		);
	}

	private target(id: number) {
		this.ensureOpen();
		if (
			!this.eligible(id) ||
			this.tree.activeElement !== id ||
			this.tree.generatedFocusReference !== null
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Native control caret target changed",
			);
	}

	assertCurrent(record: Readonly<ControlCaret>) {
		this.target(record.id);
		if (
			this.#record !== record ||
			controlValue(this.tree, record.id) !== record.value
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Native control caret changed during notification",
			);
	}

	private publish(id: number, value: string, anchor: number, position: number) {
		this.target(id);
		for (const offset of [anchor, position])
			if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid native control caret offset",
				);
		const previous = this.#record;
		if (
			previous?.id === id &&
			previous.value === value &&
			previous.anchor === anchor &&
			previous.position === position
		)
			return previous;
		const record = Object.freeze({ id, value, anchor, position });
		this.#record = record;
		const generation = this.#generation;
		this.tree.invalidatePresentation("paint");
		this.assertCurrent(record);
		if (generation !== this.#generation)
			throw new AgentBrowserError(
				"not-actionable",
				"Native control caret target changed during notification",
			);
		return record;
	}

	selection(id: number): Readonly<ControlCaret> {
		this.target(id);
		const value = controlValue(this.tree, id);
		if (this.#record?.id === id && this.#record.value === value)
			return this.#record;
		return this.publish(id, value, value.length, value.length);
	}

	collapse(id: number, offset?: number): Readonly<ControlCaret> {
		this.target(id);
		const value = controlValue(this.tree, id);
		const position =
			offset === undefined ? value.length : Math.min(value.length, offset);
		return this.publish(id, value, position, position);
	}

	select(id: number, anchor: number, position: number): Readonly<ControlCaret> {
		this.target(id);
		const value = controlValue(this.tree, id);
		for (const offset of [anchor, position])
			if (
				!Number.isSafeInteger(offset) ||
				offset < 0 ||
				offset > value.length ||
				(offset > 0 &&
					nextOffset(value, previousOffset(value, offset)) !== offset)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid control caret boundary",
				);
		return this.publish(id, value, anchor, position);
	}

	move(
		record: Readonly<ControlCaret>,
		anchor: number,
		position: number,
	): Readonly<ControlCaret> {
		this.assertCurrent(record);
		return this.publish(record.id, record.value, anchor, position);
	}

	replace(record: Readonly<ControlCaret>, value: string, offset: number) {
		this.assertCurrent(record);
		const generation = this.#generation;
		fillTextControl(this.tree, this.tree.reference(record.id), value);
		this.target(record.id);
		if (this.#record !== record || this.#generation !== generation + 1)
			throw new AgentBrowserError(
				"not-actionable",
				"Native control caret changed during value notification",
			);
		return this.collapse(record.id, offset);
	}

	read(id: number): Readonly<NativeControlSelection> | undefined {
		if (this.#closed || !this.#ready || this.#record?.id !== id) return;
		try {
			const record = this.#record;
			this.target(id);
			if (controlValue(this.tree, id) !== record.value) return;
			return Object.freeze({
				anchor: record.anchor,
				focus: record.position,
				start: Math.min(record.anchor, record.position),
				end: Math.max(record.anchor, record.position),
				valueLength: record.value.length,
			});
		} catch (error) {
			if (
				error instanceof AgentBrowserError &&
				["closed", "not-found", "not-actionable"].includes(error.code)
			)
				return;
			throw error;
		}
	}

	close() {
		if (this.#closed) return;
		const visible = this.#record !== undefined;
		this.#closed = true;
		this.#record = undefined;
		this.#unregisterChange?.();
		this.#unregisterClose?.();
		if (visible && !this.tree.mutationMetrics().closed)
			this.tree.invalidatePresentation("paint");
	}
}

export function nativeControlCaret(tree: DocumentTree) {
	tree.get(tree.root);
	const existing = owners.get(tree);
	if (existing) {
		existing.ensureOpen();
		return existing;
	}
	const owner = new NativeControlCaret(tree);
	owners.set(tree, owner);
	owner.connect();
	return owner;
}

export function readNativeControlSelection(
	tree: DocumentTree,
	id: number,
): Readonly<NativeControlSelection> | undefined {
	return owners.get(tree)?.read(id);
}
