import { controlValue, inputType, isControlDisabled } from "./controls.js";
import type { DocumentTree } from "./document.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import type { DocumentFocus } from "./focus.js";
import { decimalNumber } from "./input-number.js";
import {
	rangeSettings,
	rangeValidity,
	sanitizeRangeInput,
} from "./input-range.js";

export const rangeKeyboardCapabilities = Object.freeze({
	partial: true,
	keys: Object.freeze([
		"ArrowRight",
		"ArrowUp",
		"ArrowLeft",
		"ArrowDown",
		"Home",
		"End",
		"PageUp",
		"PageDown",
	]),
	pageSteps: 10,
	anyStepFraction: 0.01,
	orientation: "logical-increase-right-up",
	notifications: "command-step",
});

function modulo(value: bigint, interval: bigint): bigint {
	return ((value % interval) + interval) % interval;
}

export function rangeKeyboardValue(
	raw: string,
	attributes: Readonly<Record<string, string>>,
	key: string,
): string {
	const value = sanitizeRangeInput(raw, attributes);
	if (!rangeKeyboardCapabilities.keys.includes(key)) return value;
	const { minimum, maximum, base, step } = rangeSettings(attributes);
	if (maximum <= minimum) return value;
	const parts = [Number(value), minimum, maximum, base, step ?? 1].map(
		decimalNumber,
	);
	const exponent =
		Math.min(...parts.map((part) => part.exponent)) -
		(step === undefined ? 2 : 0);
	const [current, lower, upper, initial, scaledStep] = parts.map(
		(part) => part.coefficient * 10n ** BigInt(part.exponent - exponent),
	);
	const interval = step === undefined ? (upper - lower) / 100n : scaledStep;
	if (interval === 0n) return value;
	const first =
		step === undefined ? lower : lower + modulo(initial - lower, interval);
	const last =
		step === undefined ? upper : upper - modulo(upper - initial, interval);
	if (first > last) return value;
	const increase = ["ArrowRight", "ArrowUp", "PageUp"].includes(key);
	const count = key === "PageUp" || key === "PageDown" ? 10n : 1n;
	let target: bigint;
	if (key === "Home") target = first;
	else if (key === "End") target = last;
	else if (step === undefined)
		target = current + (increase ? interval : -interval) * count;
	else
		target = increase
			? current - modulo(current - initial, interval) + count * interval
			: current + modulo(initial - current, interval) - count * interval;
	target = target < first ? first : target > last ? last : target;
	const number = Number(`${target}e${exponent}`);
	if (!Number.isFinite(number) || number === Number(value)) return value;
	if (
		key !== "Home" &&
		key !== "End" &&
		(increase ? number < Number(value) : number > Number(value))
	)
		return value;
	const next = sanitizeRangeInput(String(number), attributes);
	if (
		Number(next) !== number ||
		Object.values(rangeValidity(next, attributes)).some(Boolean)
	)
		return value;
	return next;
}

export function* rangeKeyboardAction(
	tree: DocumentTree,
	focus: DocumentFocus,
	id: number,
	key: string,
): EventAction<void> {
	if (!rangeKeyboardCapabilities.keys.includes(key)) return;
	const node = tree.get(id);
	if (
		node.tagName !== "input" ||
		inputType(node) !== "range" ||
		!tree.isConnected(id) ||
		isControlDisabled(tree, id) ||
		focus.active() !== id
	)
		return;
	const value = controlValue(tree, id);
	const next = rangeKeyboardValue(value, node.attributes, key);
	if (next === value) return;
	tree.setControl(id, { value: next }, "user");
	focus.markCommitted(id);
	yield {
		target: id,
		event: new BrowserEvent("input", { bubbles: true, composed: true }),
	};
	yield { target: id, event: new BrowserEvent("change", { bubbles: true }) };
}
