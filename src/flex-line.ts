import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export const flexLineLimits = Object.freeze({
	maxItems: 4096,
	maxWork: 2_000_000,
	maxFactor: 1_000_000_000,
});

export type FlexJustification =
	| "flex-start"
	| "flex-end"
	| "center"
	| "space-between"
	| "space-around"
	| "space-evenly"
	| "safe flex-start"
	| "safe flex-end"
	| "safe center";
export interface FlexLineItemInput {
	baseSize: number;
	minSize: number;
	maxSize?: number | null;
	grow?: number;
	shrink?: number;
	borderPadding?: number;
	marginStart?: number | "auto";
	marginEnd?: number | "auto";
	order?: number;
}
export interface FlexLineOptions {
	wrap?: boolean;
	gap?: number;
	justify?: FlexJustification;
	overflowStart?: "flex-start" | "flex-end";
	maxWork?: number;
}
export interface FlexLineItem {
	index: number;
	order: number;
	baseSize: number;
	hypotheticalSize: number;
	contentSize: number;
	borderBoxSize: number;
	outerSize: number;
	marginStart: number;
	marginEnd: number;
	mainOffset: number;
	freeze: "inflexible" | "min" | "max" | "resolved";
}
export interface FlexLine {
	mode: "grow" | "shrink";
	items: readonly Readonly<FlexLineItem>[];
	initialFreeSpace: number;
	freeSpaceBeforeAutoMargins: number;
	remainingFreeSpace: number;
	usedMainSize: number;
	iterations: number;
}
export interface FlexLines {
	stage: "resolved-flex-main-lines";
	partial: true;
	mainSize: number;
	gap: number;
	lines: readonly Readonly<FlexLine>[];
	metrics: Readonly<{ work: number; items: number; iterations: number }>;
}
interface Item {
	index: number;
	order: number;
	base: number;
	minimum: number;
	maximum: number | null;
	grow: number;
	shrink: number;
	edges: number;
	start: number | "auto";
	end: number | "auto";
	hypothetical: number;
}
interface FlexibleItem {
	item: Item;
	target: number;
	freeze: FlexLineItem["freeze"] | null;
	violation: number;
}
const itemKeys = new Set([
	"baseSize",
	"minSize",
	"maxSize",
	"grow",
	"shrink",
	"borderPadding",
	"marginStart",
	"marginEnd",
	"order",
]);
const optionKeys = new Set([
	"wrap",
	"gap",
	"justify",
	"overflowStart",
	"maxWork",
]);
const justifications = new Set<FlexJustification>([
	"flex-start",
	"flex-end",
	"center",
	"space-between",
	"space-around",
	"space-evenly",
	"safe flex-start",
	"safe flex-end",
	"safe center",
]);

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}
function record(value: unknown, keys: ReadonlySet<string>) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		invalid("Invalid flex line input record");
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !keys.has(key))
			invalid("Unknown flex line input field");
		if (
			!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value")
		)
			invalid("Flex line inputs must be data properties");
	}
	if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
		invalid("Flex line inputs must be plain records");
}
function factor(value: number) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		invalid("Invalid flex factor");
	if (value > flexLineLimits.maxFactor)
		throw new AgentBrowserError("resource-limit", "Flex factor limit exceeded");
	return value;
}
function numericMargin(value: number | "auto") {
	return value === "auto" ? 0 : value;
}
function bounded(value: number) {
	return layoutNumber(value, true);
}
function clamp(item: Item, size: number) {
	return Math.max(
		item.minimum,
		Math.min(size, item.maximum ?? Number.POSITIVE_INFINITY),
	);
}
function outer(item: Item, size: number) {
	return bounded(
		size + item.edges + numericMargin(item.start) + numericMargin(item.end),
	);
}

export function resolveFlexLines(
	inputs: readonly Readonly<FlexLineItemInput>[],
	mainSize: number,
	options: Readonly<FlexLineOptions> = {},
): Readonly<FlexLines> {
	if (!Array.isArray(inputs)) invalid("Flex items must be an array");
	if (inputs.length > flexLineLimits.maxItems)
		throw new AgentBrowserError(
			"resource-limit",
			"Flex item count limit exceeded",
		);
	layoutNumber(mainSize);
	record(options, optionKeys);
	const wrap = options.wrap === undefined ? false : options.wrap;
	if (typeof wrap !== "boolean") invalid("Invalid flex wrapping mode");
	const gap = layoutNumber(options.gap === undefined ? 0 : options.gap);
	const justify =
		options.justify === undefined ? "flex-start" : options.justify;
	if (!justifications.has(justify))
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported flex main-axis justification",
		);
	const overflowStart =
		options.overflowStart === undefined ? "flex-start" : options.overflowStart;
	if (overflowStart !== "flex-start" && overflowStart !== "flex-end")
		invalid("Invalid flex overflow start");
	const alignment = justify.replace(/^safe /, "");
	const maxWork =
		options.maxWork === undefined ? flexLineLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > flexLineLimits.maxWork
	)
		invalid("Invalid flex work limit");
	let work = 0;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex line work limit exceeded",
			);
	};
	const items: Item[] = [];
	for (let index = 0; index < inputs.length; index++) {
		charge();
		const descriptor = Object.getOwnPropertyDescriptor(inputs, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value"))
			invalid("Flex items must be a dense data array");
		const input = descriptor.value as FlexLineItemInput;
		record(input, itemKeys);
		const base = bounded(input.baseSize);
		const minimum = layoutNumber(input.minSize);
		const maximum =
			input.maxSize === undefined || input.maxSize === null
				? null
				: layoutNumber(input.maxSize);
		const edges = layoutNumber(
			input.borderPadding === undefined ? 0 : input.borderPadding,
		);
		if (base + edges < 0) invalid("Flex base border box cannot be negative");
		const start = input.marginStart === undefined ? 0 : input.marginStart;
		const end = input.marginEnd === undefined ? 0 : input.marginEnd;
		if (start !== "auto") bounded(start);
		if (end !== "auto") bounded(end);
		const order = input.order === undefined ? 0 : input.order;
		if (!Number.isSafeInteger(order)) invalid("Invalid flex item order");
		const item: Item = {
			index,
			order,
			base,
			minimum,
			maximum,
			edges,
			start,
			end,
			grow: factor(input.grow === undefined ? 0 : input.grow),
			shrink: factor(input.shrink === undefined ? 1 : input.shrink),
			hypothetical: 0,
		};
		item.hypothetical = clamp(item, base);
		outer(item, item.hypothetical);
		items.push(item);
	}
	items.sort((first, second) => {
		charge();
		return first.order - second.order || first.index - second.index;
	});
	const groups: Item[][] = [];
	let group: Item[] = [];
	let occupied = 0;
	for (const item of items) {
		charge();
		const size = outer(item, item.hypothetical);
		const candidate = occupied + (group.length ? gap : 0) + size;
		if (wrap && group.length && candidate > mainSize) {
			groups.push(group);
			group = [];
			occupied = 0;
		}
		occupied = bounded(occupied + (group.length ? gap : 0) + size);
		group.push(item);
		if (wrap && group.length === 1 && size > mainSize) {
			groups.push(group);
			group = [];
			occupied = 0;
		}
	}
	if (group.length) groups.push(group);
	let totalIterations = 0;
	const lines = groups.map((members): Readonly<FlexLine> => {
		const gapSize = layoutNumber(Math.max(0, members.length - 1) * gap);
		let hypotheticalTotal = gapSize;
		for (const item of members) {
			charge();
			hypotheticalTotal = bounded(
				hypotheticalTotal + outer(item, item.hypothetical),
			);
		}
		const mode = hypotheticalTotal < mainSize ? "grow" : "shrink";
		const states: FlexibleItem[] = members.map((item) => {
			charge();
			const inflexible =
				item[mode] === 0 ||
				(mode === "grow"
					? item.base > item.hypothetical
					: item.base < item.hypothetical);
			return {
				item,
				target: inflexible ? item.hypothetical : item.base,
				freeze: inflexible ? "inflexible" : null,
				violation: 0,
			};
		});
		const freeSpace = () => {
			let used = gapSize;
			for (const state of states) {
				charge();
				used = bounded(
					used +
						outer(state.item, state.freeze ? state.target : state.item.base),
				);
			}
			return bounded(mainSize - used);
		};
		const initialFreeSpace = freeSpace();
		let iterations = 0;
		while (true) {
			const active: FlexibleItem[] = [];
			let factorSum = 0;
			let maximumFactor = 0;
			for (const state of states) {
				charge();
				if (state.freeze) continue;
				active.push(state);
				factorSum += state.item[mode];
				maximumFactor = Math.max(maximumFactor, state.item[mode]);
			}
			if (!active.length) break;
			iterations++;
			totalIterations++;
			let remaining = freeSpace();
			if (
				factorSum < 1 &&
				Math.abs(initialFreeSpace * factorSum) < Math.abs(remaining)
			)
				remaining = initialFreeSpace * factorSum;
			const weight = (state: FlexibleItem) =>
				(state.item[mode] / maximumFactor) *
				(mode === "shrink" ? state.item.base : 1);
			let weights = active.map((state) => {
				charge();
				return weight(state);
			});
			if (
				mode === "shrink" &&
				weights.some((value, index) => {
					charge();
					return active[index].item.base > 0 && value < 2 ** -1022;
				})
			) {
				let maximumLog = Number.NEGATIVE_INFINITY;
				const logarithms = active.map((state) => {
					charge();
					const value =
						state.item.base > 0
							? Math.log(state.item.shrink) + Math.log(state.item.base)
							: Number.NEGATIVE_INFINITY;
					maximumLog = Math.max(maximumLog, value);
					return value;
				});
				weights = logarithms.map((value) => {
					charge();
					return Math.exp(value - maximumLog);
				});
			}
			let weightSum = 0;
			for (const value of weights) {
				charge();
				weightSum += value;
			}
			let violation = 0;
			for (const [index, state] of active.entries()) {
				charge();
				const fraction = weightSum === 0 ? 0 : weights[index] / weightSum;
				const target =
					remaining === 0
						? state.target
						: bounded(
								state.item.base +
									(mode === "grow" ? remaining : -Math.abs(remaining)) *
										fraction,
							);
				state.target = clamp(state.item, target);
				state.violation = bounded(state.target - target);
				violation = bounded(violation + state.violation);
			}
			let frozen = 0;
			for (const state of active) {
				charge();
				if (
					violation === 0 ||
					(violation > 0 && state.violation > 0) ||
					(violation < 0 && state.violation < 0)
				) {
					state.freeze =
						state.violation > 0
							? "min"
							: state.violation < 0
								? "max"
								: "resolved";
					frozen++;
				}
			}
			if (!frozen)
				throw new AgentBrowserError(
					"resource-limit",
					"Flex sizing failed to make progress",
				);
		}
		const beforeAuto = freeSpace();
		let automaticMargins = 0;
		for (const { item } of states) {
			charge();
			automaticMargins +=
				Number(item.start === "auto") + Number(item.end === "auto");
		}
		const marginShare =
			beforeAuto > 0 && automaticMargins > 0
				? beforeAuto / automaticMargins
				: 0;
		const remaining = marginShare > 0 ? 0 : beforeAuto;
		let offset = 0;
		let separation = gap;
		if (alignment === "flex-end") offset = remaining;
		else if (alignment === "center") offset = remaining / 2;
		else if (
			alignment === "space-between" &&
			remaining > 0 &&
			states.length > 1
		)
			separation += remaining / (states.length - 1);
		else if (justify === "space-around" && remaining > 0) {
			separation += remaining / states.length;
			offset = remaining / (2 * states.length);
		} else if (justify === "space-evenly" && remaining > 0) {
			separation += remaining / (states.length + 1);
			offset = remaining / (states.length + 1);
		}
		if (
			remaining < 0 &&
			(justify.startsWith("safe ") || alignment.startsWith("space-"))
		)
			offset = overflowStart === "flex-start" ? 0 : remaining;
		const resolved = states.map((state, index): Readonly<FlexLineItem> => {
			charge();
			const item = state.item;
			const marginStart = item.start === "auto" ? marginShare : item.start;
			const marginEnd = item.end === "auto" ? marginShare : item.end;
			const borderBoxSize = layoutNumber(state.target + item.edges);
			const mainOffset = bounded(offset + marginStart);
			offset = bounded(
				mainOffset +
					borderBoxSize +
					marginEnd +
					(index + 1 < states.length ? separation : 0),
			);
			return Object.freeze({
				index: item.index,
				order: item.order,
				baseSize: item.base,
				hypotheticalSize: item.hypothetical,
				contentSize: layoutNumber(state.target),
				borderBoxSize,
				outerSize: bounded(borderBoxSize + marginStart + marginEnd),
				marginStart,
				marginEnd,
				mainOffset,
				freeze: state.freeze as FlexLineItem["freeze"],
			});
		});
		return Object.freeze({
			mode,
			items: Object.freeze(resolved),
			initialFreeSpace,
			freeSpaceBeforeAutoMargins: beforeAuto,
			remainingFreeSpace: remaining,
			usedMainSize: bounded(mainSize - remaining),
			iterations,
		});
	});
	return Object.freeze({
		stage: "resolved-flex-main-lines",
		partial: true,
		mainSize,
		gap,
		lines: Object.freeze(lines),
		metrics: Object.freeze({
			work,
			items: items.length,
			iterations: totalIterations,
		}),
	});
}
