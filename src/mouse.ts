import type { DocumentTree } from "./document.js";
import {
	type ClickPoint,
	clickTargetAriaDisabled,
	clickTargetContains,
} from "./click-target.js";
import { AgentBrowserError } from "./errors.js";
import {
	type EventAction,
	runEventAction,
	runEventActionAsync,
} from "./event-actions.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import { documentHitTesting } from "./hit-testing.js";
import { documentScroll, documentScrollPosition } from "./document-scroll.js";
import type { DefaultActionIntent, InteractionResult } from "./interactions.js";
import { isInertRoot } from "./inertness.js";

export type MouseButton = "left" | "middle" | "right";
export interface MouseModifiers {
	shift: boolean;
	control: boolean;
	alt: boolean;
	meta: boolean;
}
interface MouseEventState extends MouseModifiers {
	x: number;
	y: number;
	button: number;
	buttons: number;
	relatedTarget?: number | null;
	movementX?: number;
	movementY?: number;
	detail?: number;
	pageX?: number;
	pageY?: number;
}
export interface MouseResult {
	reference: string | null;
	x: number;
	y: number;
	buttons: number;
	canceled: boolean;
	revision: number;
	interaction?: InteractionResult;
	defaultAction?: DefaultActionIntent;
	scroll?: Readonly<{ x: number; y: number }>;
}
export const mouseLimits = Object.freeze({
	maxActions: 16_384,
	maxCoordinate: 1_000_000,
	maxDepth: 1024,
	maxBoundaryTransitions: 8,
});
export const mouseCapabilities = Object.freeze({
	partial: true,
	commands: ["mousemove", "mousedown", "mouseup", "mousewheel"],
	buttons: ["left", "middle", "right"],
	coordinateSpace: "viewport-css-pixels",
	layoutProfile: "normal-flow",
	nativeControlLayout: "software-theme-subset",
	cssHoverActive: true,
	cssUserActionProfile: "single-mouse-ancestors-and-label-controls",
	cssActiveTrigger: "primary-press-origin",
	keyboardActive: true,
	constructors: false,
	trustedEvents: false,
	contextMenuTrigger: "right-mousedown",
	stateScope: "document",
	boundaryEvents: true,
	modifiers: true,
	leftClickDefaults: true,
	modifiedLinkDefaults: false,
	pointerEvents: false,
	pointerActivationFields: true,
	nativeMenus: false,
	auxiliaryDefaults: false,
	dragAndDrop: false,
	textSelection: false,
	doubleClick: false,
	scrolling: "root-viewport-pixel-wheel",
	wheelDeltaMode: "pixel",
	modifierWheelDefaults: false,
	screenCoordinates: false,
	...mouseLimits,
});
const buttons = {
	left: { button: 0, mask: 1 },
	middle: { button: 1, mask: 4 },
	right: { button: 2, mask: 2 },
} as const;

export class BrowserMouseEvent extends BrowserEvent {
	readonly #state: Readonly<MouseEventState>;
	constructor(type: string, state: MouseEventState) {
		const boundary = type === "mouseenter" || type === "mouseleave";
		super(type, {
			bubbles: !boundary,
			cancelable: !boundary,
			composed: !boundary,
		});
		this.#state = Object.freeze({ ...state });
	}
	get clientX() {
		return this.#state.x;
	}
	get clientY() {
		return this.#state.y;
	}
	get x() {
		return this.clientX;
	}
	get y() {
		return this.clientY;
	}
	get pageX() {
		return this.#state.pageX ?? this.clientX;
	}
	get pageY() {
		return this.#state.pageY ?? this.clientY;
	}
	get button() {
		return this.#state.button;
	}
	get buttons() {
		return this.#state.buttons;
	}
	get detail() {
		return this.#state.detail ?? 0;
	}
	get movementX() {
		return this.#state.movementX ?? 0;
	}
	get movementY() {
		return this.#state.movementY ?? 0;
	}
	get relatedTarget() {
		return this.#state.relatedTarget ?? null;
	}
	get shiftKey() {
		return this.#state.shift;
	}
	get ctrlKey() {
		return this.#state.control;
	}
	get altKey() {
		return this.#state.alt;
	}
	get metaKey() {
		return this.#state.meta;
	}
	getModifierState(key: string) {
		return key === "Shift"
			? this.shiftKey
			: key === "Control"
				? this.ctrlKey
				: key === "Alt"
					? this.altKey
					: key === "Meta"
						? this.metaKey
						: false;
	}
}

export class BrowserPointerActivationEvent extends BrowserMouseEvent {
	readonly #pointerSource: "mouse" | "non-pointer";
	constructor(
		type: "click" | "auxclick" | "contextmenu",
		state: MouseEventState,
		pointerSource: "mouse" | "non-pointer",
	) {
		super(type, state);
		if (
			!["click", "auxclick", "contextmenu"].includes(type) ||
			!["mouse", "non-pointer"].includes(pointerSource)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid pointer activation event",
			);
		this.#pointerSource = pointerSource;
	}
	get pointerId() {
		return this.#pointerSource === "mouse" ? 1 : -1;
	}
	get pointerType() {
		return this.#pointerSource === "mouse" ? "mouse" : "";
	}
	get width() {
		return 1;
	}
	get height() {
		return 1;
	}
	get pressure() {
		return 0;
	}
	get tangentialPressure() {
		return 0;
	}
	get tiltX() {
		return 0;
	}
	get tiltY() {
		return 0;
	}
	get twist() {
		return 0;
	}
	get altitudeAngle() {
		return Math.PI / 2;
	}
	get azimuthAngle() {
		return 0;
	}
	get isPrimary() {
		return false;
	}
	get persistentDeviceId() {
		return 0;
	}
}

export class BrowserWheelEvent extends BrowserMouseEvent {
	readonly deltaMode = 0;
	readonly deltaZ = 0;
	constructor(
		state: MouseEventState,
		readonly deltaX: number,
		readonly deltaY: number,
	) {
		super("wheel", state);
	}
}

export class DocumentMouse {
	private x = 0;
	private y = 0;
	private hover: number | null = null;
	private readonly pressed = new Map<MouseButton, number | null>();
	private actions = 0;
	private busy = false;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
		private readonly modifiers: () => MouseModifiers,
		private readonly focus: (reference: string) => EventAction<unknown>,
		private readonly canActivate: (reference: string) => boolean,
		private readonly activate: (
			reference: string,
			event: BrowserMouseEvent,
		) => EventAction<InteractionResult>,
	) {
		tree.get(tree.root);
		if (events.documentRoot !== tree.root || events.metrics().closed)
			throw new AgentBrowserError(
				"invalid-input",
				"Mouse requires this document's active events",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}
	move(x: number, y: number) {
		return runEventAction(this.events, this.guard(this.moveAction(x, y)));
	}
	moveAsync(x: number, y: number, signal?: AbortSignal) {
		return this.runAsync(this.moveAction(x, y), signal);
	}
	down(button: MouseButton = "left") {
		return runEventAction(this.events, this.guard(this.downAction(button)));
	}
	downAsync(button: MouseButton = "left", signal?: AbortSignal) {
		return this.runAsync(this.downAction(button), signal);
	}
	up(button: MouseButton = "left") {
		return runEventAction(this.events, this.guard(this.upAction(button)));
	}
	upAsync(button: MouseButton = "left", signal?: AbortSignal) {
		return this.runAsync(this.upAction(button), signal);
	}
	clickTargetAsync(reference: string, point: ClickPoint, signal?: AbortSignal) {
		return runEventActionAsync(
			this.events,
			this.guard(this.clickTargetAction(reference, point, signal)),
			signal,
		);
	}
	hoverTargetAsync(reference: string, point: ClickPoint, signal?: AbortSignal) {
		return runEventActionAsync(
			this.events,
			this.guard(this.hoverTargetAction(reference, point, signal)),
			signal,
		);
	}
	private *hoverTargetAction(
		reference: string,
		point: ClickPoint,
		signal?: AbortSignal,
	): EventAction<MouseResult> {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Targeted hover aborted");
		this.requireHoverTarget(reference, this.hit(point.x, point.y));
		return yield* this.moveAction(point.x, point.y, reference);
	}
	private requireHoverTarget(reference: string, hit: number | null) {
		const target = this.tree.resolve(reference);
		if (!clickTargetContains(this.tree, target.id, hit))
			throw new AgentBrowserError(
				"not-actionable",
				"Target no longer receives the hover",
			);
	}
	private *clickTargetAction(
		reference: string,
		point: ClickPoint,
		signal?: AbortSignal,
	): EventAction<MouseResult> {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Targeted click aborted");
		if (this.pressed.size)
			throw new AgentBrowserError(
				"not-actionable",
				"Targeted click requires no held mouse buttons",
			);
		this.tree.resolve(reference);
		this.requireClickTarget(
			reference,
			documentHitTesting(this.tree).elementFromPoint(point.x, point.y),
		);
		try {
			yield* this.moveAction(point.x, point.y);
			yield* this.downAction("left", reference);
			return yield* this.upAction("left", reference);
		} finally {
			this.pressed.delete("left");
			this.publishPointerState();
		}
	}
	private requireClickTarget(reference: string, hit: number | null) {
		const target = this.tree.resolve(reference);
		if (
			!this.canActivate(reference) ||
			clickTargetAriaDisabled(this.tree, target.id)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"Click target became disabled or hidden during pointer events",
			);
		if (!clickTargetContains(this.tree, target.id, hit))
			throw new AgentBrowserError(
				"not-actionable",
				"Another element intercepts the targeted click",
			);
	}
	wheel(deltaX: number, deltaY: number) {
		return runEventAction(
			this.events,
			this.guard(this.wheelAction(deltaX, deltaY)),
		);
	}
	wheelAsync(deltaX: number, deltaY: number, signal?: AbortSignal) {
		return this.runAsync(this.wheelAction(deltaX, deltaY), signal);
	}
	private runAsync(action: EventAction<MouseResult>, signal?: AbortSignal) {
		if (signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Mouse action aborted"),
			);
		return runEventActionAsync(this.events, this.guard(action), signal);
	}
	metrics() {
		return Object.freeze({
			x: this.x,
			y: this.y,
			buttons: this.mask(),
			pressed: this.pressed.size,
			actions: this.actions,
			busy: this.busy,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.pressed.clear();
		this.hover = null;
		this.tree.clearPointerState();
		this.x = 0;
		this.y = 0;
		this.unregisterClose();
	}
	private ensureOpen() {
		if (this.closed || this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Document mouse is closed");
	}
	private *guard(action: EventAction<MouseResult>): EventAction<MouseResult> {
		this.ensureOpen();
		if (this.busy)
			throw new AgentBrowserError(
				"not-actionable",
				"Another mouse action is active",
			);
		if (++this.actions > mouseLimits.maxActions)
			throw new AgentBrowserError(
				"resource-limit",
				"Mouse action limit exceeded",
			);
		this.busy = true;
		try {
			return yield* action;
		} finally {
			this.busy = false;
		}
	}
	private mask() {
		let mask = 0;
		for (const button of this.pressed.keys()) mask |= buttons[button].mask;
		return mask;
	}
	private event(
		type: string,
		button = 0,
		extra: Partial<MouseEventState> = {},
	) {
		const state = this.eventState(button, extra);
		return type === "click" || type === "auxclick" || type === "contextmenu"
			? new BrowserPointerActivationEvent(type, state, "mouse")
			: new BrowserMouseEvent(type, state);
	}
	private eventState(button = 0, extra: Partial<MouseEventState> = {}) {
		const scroll = documentScrollPosition(this.tree);
		return {
			x: this.x,
			y: this.y,
			pageX: this.x + scroll.x,
			pageY: this.y + scroll.y,
			button,
			buttons: this.mask(),
			...this.modifiers(),
			...extra,
		};
	}
	private result(
		target: number | null,
		canceled = false,
		interaction?: InteractionResult,
	): MouseResult {
		this.ensureOpen();
		return {
			reference: target === null ? null : this.tree.reference(target),
			x: this.x,
			y: this.y,
			buttons: this.mask(),
			canceled,
			revision: this.tree.revision,
			...(interaction ? { interaction } : {}),
			...(interaction?.defaultAction
				? { defaultAction: interaction.defaultAction }
				: {}),
		};
	}
	private validateButton(button: MouseButton) {
		if (typeof button !== "string" || !Object.hasOwn(buttons, button))
			throw new AgentBrowserError(
				"invalid-input",
				"Expected left, middle or right mouse button",
			);
	}
	private path(target: number | null) {
		const path: number[] = [];
		let current = target;
		while (current !== null) {
			if (path.length >= mouseLimits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Mouse target path limit exceeded",
				);
			const node = this.tree.get(current);
			if (node.kind === "element") path.push(current);
			current = node.parent;
		}
		return path;
	}
	private hit(pointerX = this.x, pointerY = this.y) {
		this.ensureOpen();
		const target = documentHitTesting(this.tree).elementFromPoint(
			pointerX,
			pointerY,
		);
		if (
			this.path(target).some((id) => isInertRoot(this.tree, this.tree.get(id)))
		)
			return null;
		return target;
	}
	private publishPointerState(hover = this.hover) {
		if (this.closed) return;
		const active = this.pressed.get("left") ?? null;
		this.tree.setPointerState(
			hover !== null && this.tree.isConnected(hover) ? hover : null,
			active !== null && this.tree.isConnected(active) ? active : null,
		);
	}
	private *refreshTarget(): EventAction<number | null> {
		for (let turn = 0; turn < mouseLimits.maxBoundaryTransitions; turn++) {
			const target = this.hit();
			const revision = this.tree.revision;
			this.publishPointerState(target);
			if (target === this.hover) {
				if (revision === this.tree.revision) return target;
				if (this.hit() === target) return target;
				continue;
			}
			const previous = this.hover;
			const oldPath = this.path(previous);
			const newPath = this.path(target);
			const oldSet = new Set(oldPath);
			const newSet = new Set(newPath);
			this.hover = target;
			if (previous !== null && this.tree.isConnected(previous))
				yield {
					target: previous,
					event: this.event("mouseout", 0, { relatedTarget: target }),
				};
			for (const id of oldPath)
				if (!newSet.has(id) && this.tree.isConnected(id))
					yield {
						target: id,
						event: this.event("mouseleave", 0, { relatedTarget: target }),
					};
			if (target !== null && this.tree.isConnected(target))
				yield {
					target,
					event: this.event("mouseover", 0, { relatedTarget: previous }),
				};
			for (const id of newPath.reverse())
				if (!oldSet.has(id) && this.tree.isConnected(id))
					yield {
						target: id,
						event: this.event("mouseenter", 0, { relatedTarget: previous }),
					};
		}
		throw new AgentBrowserError(
			"resource-limit",
			"Mouse hover target did not stabilize",
		);
	}
	private *wheelAction(
		deltaX: number,
		deltaY: number,
	): EventAction<MouseResult> {
		if (
			[deltaX, deltaY].some(
				(value) =>
					typeof value !== "number" ||
					!Number.isFinite(value) ||
					Math.abs(value) > mouseLimits.maxCoordinate,
			)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Wheel requires bounded finite pixel deltas",
			);
		const target = yield* this.refreshTarget();
		if (target === null) return this.result(null);
		const event = new BrowserWheelEvent(this.eventState(), deltaX, deltaY);
		const allowed = yield { target, event };
		this.ensureOpen();
		if (allowed) {
			if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
				throw new AgentBrowserError(
					"unsupported",
					"Modified wheel defaults are not implemented",
				);
			const changed = documentScroll(this.tree).by(deltaX, deltaY);
			if (changed) {
				yield {
					target: this.tree.root,
					event: new BrowserEvent("scroll", { bubbles: true }),
				};
				yield* this.refreshTarget();
			}
		}
		return {
			...this.result(target, !allowed),
			scroll: documentScrollPosition(this.tree),
		};
	}
	private *moveAction(
		x: number,
		y: number,
		expectedReference?: string,
	): EventAction<MouseResult> {
		if (
			typeof x !== "number" ||
			typeof y !== "number" ||
			!Number.isFinite(x) ||
			!Number.isFinite(y) ||
			Math.abs(x) > mouseLimits.maxCoordinate ||
			Math.abs(y) > mouseLimits.maxCoordinate
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Mouse requires bounded finite coordinates",
			);
		const movementX = x - this.x;
		const movementY = y - this.y;
		this.x = x;
		this.y = y;
		const target = yield* this.refreshTarget();
		if (expectedReference !== undefined)
			this.requireHoverTarget(expectedReference, target);
		const allowed =
			target === null ||
			(yield {
				target,
				event: this.event("mousemove", 0, { movementX, movementY }),
			});
		if (expectedReference !== undefined)
			this.requireHoverTarget(expectedReference, this.hit());
		return this.result(target, !allowed);
	}
	private *downAction(
		button: MouseButton,
		expectedReference?: string,
	): EventAction<MouseResult> {
		this.validateButton(button);
		if (this.pressed.has(button))
			throw new AgentBrowserError(
				"invalid-input",
				"Mouse button is already held",
			);
		const target = yield* this.refreshTarget();
		if (expectedReference !== undefined)
			this.requireClickTarget(expectedReference, target);
		this.pressed.set(button, target);
		this.publishPointerState();
		if (target === null) return this.result(null);
		const allowed = yield {
			target,
			event: this.event("mousedown", buttons[button].button, { detail: 1 }),
		};
		if (allowed && button === "left" && this.tree.isConnected(target))
			yield* this.focus(this.tree.reference(target));
		let contextAllowed = true;
		if (button === "right" && this.tree.isConnected(target))
			contextAllowed = yield {
				target,
				event: this.event("contextmenu", buttons[button].button),
			};
		return this.result(target, !allowed || !contextAllowed);
	}
	private *upAction(
		button: MouseButton,
		expectedReference?: string,
	): EventAction<MouseResult> {
		this.validateButton(button);
		const down = this.pressed.get(button);
		this.pressed.delete(button);
		this.publishPointerState();
		const target = yield* this.refreshTarget();
		if (expectedReference !== undefined)
			this.requireClickTarget(expectedReference, target);
		if (target === null) return this.result(null);
		const allowed = yield {
			target,
			event: this.event("mouseup", buttons[button].button, { detail: 1 }),
		};
		if (
			down === undefined ||
			down === null ||
			!this.tree.isConnected(down) ||
			!this.tree.isConnected(target)
		)
			return this.result(target, !allowed);
		const ancestors = new Set(this.path(down));
		const common = this.path(target).find((id) => ancestors.has(id));
		if (expectedReference !== undefined) {
			this.requireClickTarget(
				expectedReference,
				documentHitTesting(this.tree).elementFromPoint(this.x, this.y),
			);
			this.requireClickTarget(expectedReference, common ?? null);
		}
		if (common === undefined || !this.canActivate(this.tree.reference(common)))
			return this.result(target, !allowed);
		if (button !== "left") {
			const auxiliary = yield {
				target: common,
				event: this.event("auxclick", buttons[button].button, { detail: 1 }),
			};
			if (
				auxiliary &&
				button === "middle" &&
				this.path(common).some((id) => {
					const node = this.tree.get(id);
					return node.tagName === "a" && Object.hasOwn(node.attributes, "href");
				})
			)
				throw new AgentBrowserError(
					"unsupported",
					"Auxiliary mouse link navigation is not implemented",
				);
			return this.result(target, !allowed || !auxiliary);
		}
		const click = this.event("click", 0, { detail: 1 });
		const interaction = yield* this.activate(
			this.tree.reference(common),
			click,
		);
		if (
			interaction.defaultAction?.kind === "navigate" &&
			(click.shiftKey || click.ctrlKey || click.altKey || click.metaKey)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Modified mouse link navigation is not implemented",
			);
		return this.result(
			target,
			!allowed || interaction.defaultPrevented,
			interaction,
		);
	}
}
