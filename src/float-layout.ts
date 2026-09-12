import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export type FloatSide = "left" | "right";
export type FloatClear = "none" | "left" | "right" | "both";

export interface FloatLayoutLimits {
	readonly maxFloats: number;
	readonly maxWork: number;
}

export const floatLayoutLimits: Readonly<FloatLayoutLimits> = Object.freeze({
	maxFloats: 4096,
	maxWork: 2_000_000,
});

export interface FloatContainingBlock {
	readonly left: number;
	readonly right: number;
	readonly top: number;
}

export interface FloatPlacementRequest {
	readonly id: number;
	readonly side: FloatSide;
	readonly clear?: FloatClear;
	readonly containingBlock: Readonly<FloatContainingBlock>;
	readonly minimumTop: number;
	readonly width: number;
	readonly height: number;
}

export interface FloatPlacement {
	readonly id: number;
	readonly side: FloatSide;
	readonly clear: FloatClear;
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	readonly width: number;
	readonly height: number;
}

export interface FloatLineRequest {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

export interface FloatLineInterval extends FloatLineRequest {
	readonly width: number;
	readonly nextBottom: number | null;
}

export interface FloatLayoutMetrics {
	readonly floats: number;
	readonly work: number;
	readonly closed: boolean;
	readonly limits: Readonly<FloatLayoutLimits>;
}

interface FloatEdges {
	readonly left: number | undefined;
	readonly right: number | undefined;
}

function record(value: unknown): boolean {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function horizontalBounds(left: number, right: number) {
	if (left > right)
		throw new AgentBrowserError("invalid-input", "Reversed float bounds");
	layoutNumber(right - left);
}

export class FloatLayoutContext {
	readonly limits: Readonly<FloatLayoutLimits>;
	private entries: Readonly<FloatPlacement>[] = [];
	private identifiers = new Set<number>();
	private previousTop: number | undefined;
	private leftBottom: number | undefined;
	private rightBottom: number | undefined;
	private work = 0;
	private closed = false;

	constructor(options: Partial<FloatLayoutLimits> = {}) {
		if (!record(options))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid float layout limits",
			);
		const requestedFloats = options.maxFloats;
		const requestedWork = options.maxWork;
		const maxFloats =
			requestedFloats === undefined
				? floatLayoutLimits.maxFloats
				: requestedFloats;
		const maxWork =
			requestedWork === undefined ? floatLayoutLimits.maxWork : requestedWork;
		if (
			!Number.isSafeInteger(maxFloats) ||
			maxFloats < 1 ||
			maxFloats > floatLayoutLimits.maxFloats ||
			!Number.isSafeInteger(maxWork) ||
			maxWork < 1 ||
			maxWork > floatLayoutLimits.maxWork
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid float layout limits",
			);
		this.limits = Object.freeze({ maxFloats, maxWork });
	}

	place(request: Readonly<FloatPlacementRequest>): Readonly<FloatPlacement> {
		this.ensureOpen();
		this.charge();
		if (!record(request))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid float placement request",
			);
		const { id, side, containingBlock } = request;
		const requestedClear = request.clear;
		const clear = requestedClear === undefined ? "none" : requestedClear;
		if (!Number.isSafeInteger(id) || id < 0)
			throw new AgentBrowserError("invalid-input", "Invalid float identifier");
		if (side !== "left" && side !== "right")
			throw new AgentBrowserError("invalid-input", "Invalid float side");
		if (!["none", "left", "right", "both"].includes(clear))
			throw new AgentBrowserError("invalid-input", "Invalid float clear");
		if (!record(containingBlock))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid float containing block",
			);
		const containingLeft = layoutNumber(containingBlock.left, true);
		const containingRight = layoutNumber(containingBlock.right, true);
		const containingTop = layoutNumber(containingBlock.top, true);
		horizontalBounds(containingLeft, containingRight);
		const minimumTop = layoutNumber(request.minimumTop, true);
		const width = layoutNumber(request.width);
		const height = layoutNumber(request.height);
		this.ensureOpen();
		if (this.identifiers.has(id))
			throw new AgentBrowserError(
				"invalid-input",
				"Duplicate float identifier",
			);
		if (this.entries.length >= this.limits.maxFloats)
			throw new AgentBrowserError(
				"resource-limit",
				"Float placement limit exceeded",
			);
		let top = Math.max(
			containingTop,
			minimumTop,
			this.previousTop ?? containingTop,
		);
		if ((clear === "left" || clear === "both") && this.leftBottom !== undefined)
			top = Math.max(top, this.leftBottom);
		if (
			(clear === "right" || clear === "both") &&
			this.rightBottom !== undefined
		)
			top = Math.max(top, this.rightBottom);
		const active: Readonly<FloatPlacement>[] = [];
		for (const entry of this.entries) {
			this.charge();
			if (entry.bottom > top) active.push(entry);
		}
		active.sort((first, second) => {
			this.charge();
			return first.bottom - second.bottom;
		});
		const suffix: FloatEdges[] = new Array(active.length + 1);
		suffix[active.length] = { left: undefined, right: undefined };
		for (let index = active.length - 1; index >= 0; index--) {
			this.charge();
			const entry = active[index];
			const next = suffix[index + 1];
			suffix[index] = {
				left:
					entry.side === "left"
						? Math.max(entry.right, next.left ?? entry.right)
						: next.left,
				right:
					entry.side === "right"
						? Math.min(entry.left, next.right ?? entry.left)
						: next.right,
			};
		}
		let index = 0;
		while (true) {
			this.charge();
			const edges = suffix[index];
			const left =
				side === "left"
					? Math.max(containingLeft, edges.left ?? containingLeft)
					: Math.min(containingRight, edges.right ?? containingRight) - width;
			const right =
				side === "right"
					? Math.min(containingRight, edges.right ?? containingRight)
					: left + width;
			const feasible =
				side === "left"
					? (edges.left === undefined || right <= containingRight) &&
						(edges.right === undefined || right <= edges.right)
					: (edges.right === undefined || left >= containingLeft) &&
						(edges.left === undefined || left >= edges.left);
			if (feasible) {
				const placement: Readonly<FloatPlacement> = Object.freeze({
					id: id === 0 ? 0 : id,
					side,
					clear,
					left: layoutNumber(left, true),
					right: layoutNumber(right, true),
					top: layoutNumber(top, true),
					bottom: layoutNumber(top + height, true),
					width,
					height,
				});
				this.entries.push(placement);
				this.identifiers.add(id);
				this.previousTop = top;
				if (side === "left")
					this.leftBottom = Math.max(
						this.leftBottom ?? placement.bottom,
						placement.bottom,
					);
				else
					this.rightBottom = Math.max(
						this.rightBottom ?? placement.bottom,
						placement.bottom,
					);
				return placement;
			}
			top = active[index].bottom;
			do {
				this.charge();
				index++;
			} while (index < active.length && active[index].bottom === top);
		}
	}

	clearanceBottom(clear: Exclude<FloatClear, "none">): number | null {
		this.ensureOpen();
		this.charge();
		if (clear !== "left" && clear !== "right" && clear !== "both")
			throw new AgentBrowserError("invalid-input", "Invalid block clearance");
		const left = clear === "right" ? undefined : this.leftBottom;
		const right = clear === "left" ? undefined : this.rightBottom;
		return left === undefined
			? (right ?? null)
			: right === undefined
				? left
				: Math.max(left, right);
	}

	lineInterval(
		request: Readonly<FloatLineRequest>,
	): Readonly<FloatLineInterval> {
		this.ensureOpen();
		this.charge();
		if (!record(request))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid float line interval",
			);
		const containingLeft = layoutNumber(request.left, true);
		const containingRight = layoutNumber(request.right, true);
		const top = layoutNumber(request.top, true);
		const bottom = layoutNumber(request.bottom, true);
		horizontalBounds(containingLeft, containingRight);
		if (top > bottom)
			throw new AgentBrowserError(
				"invalid-input",
				"Reversed float line interval",
			);
		layoutNumber(bottom - top);
		this.ensureOpen();
		let left = containingLeft;
		let right = containingRight;
		let nextBottom: number | null = null;
		for (const entry of this.entries) {
			this.charge();
			if (entry.height === 0 || bottom <= entry.top || top >= entry.bottom)
				continue;
			if (entry.side === "left" && entry.right > containingLeft) {
				left = Math.max(left, Math.min(containingRight, entry.right));
				nextBottom = Math.min(nextBottom ?? entry.bottom, entry.bottom);
			} else if (entry.side === "right" && entry.left < containingRight) {
				right = Math.min(right, Math.max(containingLeft, entry.left));
				nextBottom = Math.min(nextBottom ?? entry.bottom, entry.bottom);
			}
		}
		return Object.freeze({
			left,
			right,
			top,
			bottom,
			width: layoutNumber(Math.max(0, right - left)),
			nextBottom,
		});
	}

	placements(): readonly Readonly<FloatPlacement>[] {
		this.ensureOpen();
		this.charge();
		const result: Readonly<FloatPlacement>[] = [];
		for (const entry of this.entries) {
			this.charge();
			result.push(entry);
		}
		return Object.freeze(result);
	}

	metrics(): Readonly<FloatLayoutMetrics> {
		return Object.freeze({
			floats: this.entries.length,
			work: this.work,
			closed: this.closed,
			limits: this.limits,
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.entries = [];
		this.identifiers = new Set();
		this.previousTop = undefined;
		this.leftBottom = undefined;
		this.rightBottom = undefined;
	}

	private charge(): void {
		if (this.work >= this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float layout work limit exceeded",
			);
		this.work++;
	}

	private ensureOpen(): void {
		if (this.closed)
			throw new AgentBrowserError("closed", "Float layout context is closed");
	}
}
