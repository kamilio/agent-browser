import {
	decimalNumber,
	numberValidity,
	parseNumberAttribute,
	validNumberValue,
} from "./input-number.js";

export function rangeSettings(attributes: Readonly<Record<string, string>>) {
	const minimum = parseNumberAttribute(attributes.min);
	const parsedStep = parseNumberAttribute(attributes.step);
	return {
		minimum: minimum ?? 0,
		maximum: parseNumberAttribute(attributes.max) ?? 100,
		base: minimum ?? parseNumberAttribute(attributes.value) ?? 0,
		step:
			attributes.step?.toLowerCase() === "any"
				? undefined
				: parsedStep !== undefined && parsedStep > 0
					? parsedStep
					: 1,
	};
}

function align(
	value: number,
	minimum: number,
	maximum: number,
	base: number,
	step: number,
): number {
	const parts = [value, minimum, maximum, base, step].map(decimalNumber);
	const exponent = Math.min(...parts.map((part) => part.exponent));
	const [current, lowerBound, upperBound, initial, interval] = parts.map(
		(part) => part.coefficient * 10n ** BigInt(part.exponent - exponent),
	);
	const remainder = (((current - initial) % interval) + interval) % interval;
	if (remainder === 0n) return value;
	const lower = current - remainder;
	const upper = lower + interval;
	const candidates =
		2n * remainder < interval ? [lower, upper] : [upper, lower];
	for (const candidate of candidates) {
		if (
			candidate < lowerBound ||
			(upperBound >= lowerBound && candidate > upperBound)
		)
			continue;
		const number = Number(`${candidate}e${exponent}`);
		if (Number.isFinite(number)) return number;
	}
	return value;
}

export function sanitizeRangeInput(
	raw: string,
	attributes: Readonly<Record<string, string>>,
): string {
	const { minimum, maximum, base, step } = rangeSettings(attributes);
	const valid = validNumberValue(raw);
	const difference = maximum - minimum;
	const fallback =
		maximum < minimum
			? minimum
			: Number.isFinite(difference)
				? minimum + difference / 2
				: minimum / 2 + maximum / 2;
	const original = valid ? Number(raw) : fallback;
	let value = Math.max(minimum, original);
	if (maximum >= minimum) value = Math.min(maximum, value);
	if (step !== undefined) {
		value = align(value, minimum, maximum, base, step);
	}
	return valid && value === original ? raw : String(value);
}

export function rangeValidity(
	value: string,
	attributes: Readonly<Record<string, string>>,
) {
	const { minimum, maximum } = rangeSettings(attributes);
	return {
		...numberValidity(value, attributes),
		rangeUnderflow: Number(value) < minimum,
		rangeOverflow: Number(value) > maximum,
	};
}
