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
import {
	documentGeneratedControls,
	resolveVisualTarget,
	type GeneratedControlTarget,
} from "./generated-controls.js";

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

function focusEligible(tree: DocumentTree, id: number): boolean {
	const node = tree.get(id);
	if (
		node.kind !== "element" ||
		!tree.isConnected(id) ||
		isControlDisabled(tree, id) ||
		(node.tagName === "input" && inputType(node) === "hidden")
	)
		return false;
	let ancestor: number | null = id;
	while (ancestor !== null) {
		const current = tree.get(ancestor);
		if (
			Object.hasOwn(current.attributes, "hidden") ||
			closedDetailsChild(tree, current) ||
			isInertRoot(tree, current)
		)
			return false;
		ancestor = current.parent;
	}
	return true;
}

export function focusTabIndex(tree: DocumentTree, id: number): number | null {
	if (!focusEligible(tree, id)) return null;
	const node = tree.get(id);
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
	if (id === null) return null;
	const generated = tree.generatedFocusReference;
	if (generated !== null)
		return focusEligible(tree, id) &&
			documentGeneratedControls(tree).detailsSummary(id)?.ref === generated
			? id
			: null;
	return focusTabIndex(tree, id) !== null ? id : null;
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

	activeReference(): string | null {
		const id = this.active();
		return id === null
			? null
			: (this.tree.generatedFocusReference ?? this.tree.reference(id));
	}

	private canFocus(id: number, generated?: GeneratedControlTarget) {
		return (
			(generated
				? focusEligible(this.tree, id) &&
					documentGeneratedControls(this.tree).detailsSummary(id) === generated
				: focusTabIndex(this.tree, id) !== null) &&
			documentStyles(this.tree).get(id).visible
		);
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
		const resolved =
			reference === null ? null : resolveVisualTarget(this.tree, reference);
		const target = resolved?.node.id ?? null;
		const generated = resolved?.generated;
		const nextReference =
			target === null ? null : (generated?.ref ?? this.tree.reference(target));
		if (target !== null && !this.canFocus(target, generated))
			throw new AgentBrowserError(
				"not-actionable",
				"Element cannot receive focus",
			);
		const previous = this.active();
		if (this.activeReference() === nextReference) return target;
		const turn = ++this.transition;
		const baseline = this.baseline;
		this.baseline = undefined;
		if (previous === target) {
			this.tree.setActiveElement(target, generated?.ref ?? null);
			return this.active();
		}
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
		if (!this.canFocus(target, generated))
			throw new AgentBrowserError(
				"not-actionable",
				"Focus target changed during events",
			);
		this.tree.setActiveElement(target, generated?.ref ?? null);
		this.baseline = {
			id: target,
			value: controlValue(this.tree, target),
			dirty: false,
		};
		yield { target, event: new BrowserFocusEvent("focus", previous) };
		if (turn === this.transition && this.activeReference() === nextReference)
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
		const candidates: {
			id: number;
			reference: string;
			order: number;
			tab: number;
		}[] = [];
		const radioStops = new Map<number, number>();
		let order = 0;
		for (const { node } of this.tree.walk()) {
			const generated =
				node.tagName === "details" &&
				focusEligible(this.tree, node.id) &&
				documentStyles(this.tree).get(node.id).visible
					? documentGeneratedControls(this.tree).detailsSummary(node.id)
					: undefined;
			const tab = focusTabIndex(this.tree, node.id);
			if (generated && tab === null)
				candidates.push({
					id: node.id,
					reference: generated.ref,
					order: order++,
					tab: 0,
				});
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
			candidates.push({
				id: node.id,
				reference: this.tree.reference(node.id),
				order: order++,
				tab,
			});
			if (generated)
				candidates.push({
					id: node.id,
					reference: generated.ref,
					order: order++,
					tab: 0,
				});
		}
		candidates.sort(
			(left, right) =>
				(left.tab > 0 ? left.tab : Number.POSITIVE_INFINITY) -
					(right.tab > 0 ? right.tab : Number.POSITIVE_INFINITY) ||
				left.order - right.order,
		);
		if (!candidates.length) return yield* this.focusAction(null);
		const active = this.activeReference();
		const current = candidates.findIndex((entry) => entry.reference === active);
		const position =
			current < 0
				? reverse
					? candidates.length - 1
					: 0
				: (current + (reverse ? -1 : 1) + candidates.length) %
					candidates.length;
		return yield* this.focusAction(candidates[position].reference);
	}

	private ensureOpen() {
		if (this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document focus is closed");
	}
}
