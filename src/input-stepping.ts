import { decimalNumber, parseNumberAttribute } from "./input-number.js";
import { rangeSettings } from "./input-range.js";
import { inputNumberValue, inputValueAsNumber } from "./input-value-number.js";

const stepScales: Readonly<Record<string, number>> = {
	number: 1,
	range: 1,
	date: 86_400_000,
	month: 1,
	week: 604_800_000,
	time: 1000,
	"datetime-local": 1000,
};

function stepCount(raw: unknown): number {
	if (raw === undefined) return 1;
	if (
		typeof raw === "bigint" ||
		typeof raw === "symbol" ||
		typeof raw === "function" ||
		(typeof raw === "object" && raw !== null)
	)
		throw new TypeError(
			"Input stepping supports primitive count conversion only",
		);
	return Number(raw) >> 0;
}

function modulo(value: bigint, interval: bigint): bigint {
	return ((value % interval) + interval) % interval;
}

function attributeNumber(
	type: string,
	raw: string | undefined,
): number | undefined {
	if (raw === undefined) return undefined;
	if (type === "number" || type === "range") return parseNumberAttribute(raw);
	const number = inputValueAsNumber(type, raw);
	return Number.isNaN(number) ? undefined : number;
}

export function stepInputValue(
	type: string,
	raw: string,
	attributes: Readonly<Record<string, string>>,
	direction: 1 | -1,
	argument?: unknown,
): string | undefined {
	const count = stepCount(argument) * direction;
	if (
		!Object.hasOwn(stepScales, type) ||
		attributes.step?.toLowerCase() === "any"
	)
		throw new DOMException(
			"This input does not have an allowed value step",
			"InvalidStateError",
		);
	const ranges = type === "range" ? rangeSettings(attributes) : undefined;
	const minimum = ranges?.minimum ?? attributeNumber(type, attributes.min);
	const maximum = ranges?.maximum ?? attributeNumber(type, attributes.max);
	if (minimum !== undefined && maximum !== undefined && minimum > maximum)
		return undefined;
	const base =
		ranges?.base ??
		attributeNumber(type, attributes.min) ??
		attributeNumber(type, attributes.value) ??
		(type === "week" ? -259_200_000 : 0);
	const parsedStep = parseNumberAttribute(attributes.step);
	const step = decimalNumber(
		parsedStep !== undefined && parsedStep > 0
			? parsedStep
			: type === "time" || type === "datetime-local"
				? 60
				: 1,
	);
	step.coefficient *= BigInt(stepScales[type]);
	const number = inputValueAsNumber(type, raw);
	const invalid = Number.isNaN(number);
	const parts = [invalid ? 0 : number, base, minimum ?? 0, maximum ?? 0].map(
		decimalNumber,
	);
	parts.push(step);
	const exponent = Math.min(...parts.map((part) => part.exponent));
	const [current, initial, lower, upper, interval] = parts.map(
		(part) => part.coefficient * 10n ** BigInt(part.exponent - exponent),
	);
	const first =
		minimum === undefined
			? undefined
			: lower + modulo(initial - lower, interval);
	const last =
		maximum === undefined
			? undefined
			: upper - modulo(upper - initial, interval);
	if (first !== undefined && last !== undefined && first > last)
		return undefined;
	let target = current;
	const remainder = modulo(current - initial, interval);
	if (count > 0) target += BigInt(count) * interval - remainder;
	else if (count < 0)
		target +=
			BigInt(count) * interval + (remainder === 0n ? 0n : interval - remainder);
	if (first !== undefined && target < first) target = first;
	if (last !== undefined && target > last) target = last;
	if (
		!invalid &&
		((count > 0 && target < current) || (count < 0 && target > current))
	)
		return undefined;
	const result = Number(`${target}e${exponent}`);
	if (!Number.isFinite(result)) return undefined;
	const represented = decimalNumber(result);
	const commonExponent = Math.min(exponent, represented.exponent);
	if (
		target * 10n ** BigInt(exponent - commonExponent) !==
		represented.coefficient *
			10n ** BigInt(represented.exponent - commonExponent)
	)
		return undefined;
	return inputNumberValue(type, result);
}
