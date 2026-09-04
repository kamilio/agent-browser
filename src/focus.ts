import {
	controlChecked,
	controlValue,
	inputType,
	isControlDisabled,
	radioGroup,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import { isInertRoot } from "./inertness.js";
import { parsedTabIndex } from "./element-focus.js";
import { closedDetailsChild, summaryDetails } from "./details.js";
import { documentStyles } from "./styles.js";

export class BrowserFocusEvent extends BrowserEvent {
	readonly #relatedTarget: number | null;
	constructor(
		type: "focus" | "blur" | "focusin" | "focusout",
		relatedTarget: number | null,
	) {
		super(type, {
			bubbles: type === "focusin" || type === "focusout",
			composed: true,
		});
		this.#relatedTarget = relatedTarget;
	}
	get relatedTarget() {
		return this.#relatedTarget;
	}
}

export function focusTabIndex(tree: DocumentTree, id: number): number | null {
	const node = tree.get(id);
	if (
		node.kind !== "element" ||
		!tree.isConnected(id) ||
		isControlDisabled(tree, id) ||
		(node.tagName === "input" && inputType(node) === "hidden")
	)
		return null;
	let ancestor: number | null = id;
	while (ancestor !== null) {
		const current = tree.get(ancestor);
		if (
			Object.hasOwn(current.attributes, "hidden") ||
			closedDetailsChild(tree, current) ||
			isInertRoot(tree, current)
		)
			return null;
		ancestor = current.parent;
	}
	const explicit = parsedTabIndex(node);
	if (explicit !== null) return explicit;
	return ["input", "button", "select", "textarea"].includes(node.tagName) ||
		summaryDetails(tree, node) !== undefined ||
		(node.tagName === "a" && Object.hasOwn(node.attributes, "href"))
		? 0
		: null;
}

export function activeFocus(tree: DocumentTree) {
	const id = tree.activeElement;
	return id !== null && focusTabIndex(tree, id) !== null ? id : null;
}

export class DocumentFocus {
	private transition = 0;
	private baseline: { id: number; value: string; dirty: boolean } | undefined;
	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
	) {
		if (events.documentRoot !== tree.root || events.metrics().closed)
			throw new AgentBrowserError(
				"invalid-input",
				"Focus requires this document's active events",
			);
		tree.onClose(() => {
			this.baseline = undefined;
			this.transition++;
		});
	}

	active() {
		this.ensureOpen();
		const candidate = activeFocus(this.tree);
		const active =
			candidate !== null && documentStyles(this.tree).get(candidate).visible
				? candidate
				: null;
		if (active === null) {
			this.baseline = undefined;
			if (this.tree.activeElement !== null) this.tree.setActiveElement(null);
		}
		return active;
	}

	markEdited(id: number) {
		if (this.baseline?.id === id && this.tree.activeElement === id)
			this.baseline.dirty = true;
	}

	markCommitted(id: number) {
		if (this.baseline?.id === id && this.tree.activeElement === id) {
			this.baseline.value = controlValue(this.tree, id);
			this.baseline.dirty = false;
		}
	}

	focus(reference: string | null) {
		return runEventAction(this.events, this.focusAction(reference));
	}

	focusAsync(reference: string | null) {
		return runEventActionAsync(this.events, this.focusAction(reference));
	}

	*focusAction(reference: string | null): EventAction<number | null> {
		this.ensureOpen();
		const target = reference === null ? null : this.tree.resolve(reference).id;
		if (
			target !== null &&
			(focusTabIndex(this.tree, target) === null ||
				!documentStyles(this.tree).get(target).visible)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Element cannot receive focus",
			);
		const previous = this.active();
		if (previous === target) return target;
		const turn = ++this.transition;
		const baseline = this.baseline;
		this.baseline = undefined;
		this.tree.setActiveElement(null);
		if (previous !== null) {
			if (
				baseline?.id === previous &&
				baseline.dirty &&
				controlValue(this.tree, previous) !== baseline.value
			)
				yield {
					target: previous,
					event: new BrowserEvent("change", { bubbles: true }),
				};
			if (turn !== this.transition) return this.active();
			yield { target: previous, event: new BrowserFocusEvent("blur", target) };
			if (turn !== this.transition) return this.active();
			yield {
				target: previous,
				event: new BrowserFocusEvent("focusout", target),
			};
		}
		if (turn !== this.transition) return this.active();
		this.ensureOpen();
		if (target === null) return null;
		if (
			focusTabIndex(this.tree, target) === null ||
			!documentStyles(this.tree).get(target).visible
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Focus target changed during events",
			);
		this.tree.setActiveElement(target);
		this.baseline = {
			id: target,
			value: controlValue(this.tree, target),
			dirty: false,
		};
		yield { target, event: new BrowserFocusEvent("focus", previous) };
		if (turn === this.transition && this.active() === target)
			yield { target, event: new BrowserFocusEvent("focusin", previous) };
		return this.active();
	}

	move(reverse = false) {
		return runEventAction(this.events, this.moveAction(reverse));
	}

	moveAsync(reverse = false) {
		return runEventActionAsync(this.events, this.moveAction(reverse));
	}

	*moveAction(reverse = false): EventAction<number | null> {
		this.ensureOpen();
		const candidates: { id: number; order: number; tab: number }[] = [];
		const radioStops = new Map<number, number>();
		let order = 0;
		for (const { node } of this.tree.walk()) {
			const tab = focusTabIndex(this.tree, node.id);
			if (
				tab === null ||
				tab < 0 ||
				!documentStyles(this.tree).get(node.id).visible
			)
				continue;
			if (node.tagName === "input" && inputType(node) === "radio") {
				if (!radioStops.has(node.id)) {
					const group = radioGroup(this.tree, node.id);
					const eligible = group.filter(
						(entry) =>
							(focusTabIndex(this.tree, entry.id) ?? -1) >= 0 &&
							documentStyles(this.tree).get(entry.id).visible,
					);
					const stop =
						eligible.find((entry) => controlChecked(this.tree, entry.id)) ??
						eligible[0];
					for (const entry of group) radioStops.set(entry.id, stop?.id ?? -1);
				}
				if (radioStops.get(node.id) !== node.id) continue;
			}
			candidates.push({ id: node.id, order: order++, tab });
		}
		candidates.sort(
			(left, right) =>
				(left.tab > 0 ? left.tab : Number.POSITIVE_INFINITY) -
					(right.tab > 0 ? right.tab : Number.POSITIVE_INFINITY) ||
				left.order - right.order,
		);
		if (!candidates.length) return yield* this.focusAction(null);
		const active = this.active();
		const current = candidates.findIndex((entry) => entry.id === active);
		const position =
			current < 0
				? reverse
					? candidates.length - 1
					: 0
				: (current + (reverse ? -1 : 1) + candidates.length) %
					candidates.length;
		return yield* this.focusAction(
			this.tree.reference(candidates[position].id),
		);
	}

	private ensureOpen() {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document focus is closed");
	}
}
