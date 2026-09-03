export type NumberConstraintFailure =
	| "range-underflow"
	| "range-overflow"
	| "step-mismatch";

export function validNumberValue(value: string): boolean {
	return (
		/^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value) &&
		Number.isFinite(Number(value))
	);
}

export function parseNumberAttribute(
	value: string | undefined,
): number | undefined {
	if (value === undefined) return undefined;
	const prefix =
		/^[\t\n\f\r ]*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)/.exec(
			value,
		);
	if (!prefix) return undefined;
	const number = Number(prefix[1]);
	return Number.isFinite(number) ? (number === 0 ? 0 : number) : undefined;
}

function decimal(number: number) {
	const [significand, exponent = "0"] = number.toString().split("e");
	const point = significand.indexOf(".");
	return {
		coefficient: BigInt(significand.replace(".", "")),
		exponent:
			Number(exponent) - (point < 0 ? 0 : significand.length - point - 1),
	};
}

function stepMismatch(value: number, base: number, step: number) {
	const parts = [value, base, step].map(decimal);
	const exponent = Math.min(...parts.map((part) => part.exponent));
	const [current, initial, interval] = parts.map(
		(part) => part.coefficient * 10n ** BigInt(part.exponent - exponent),
	);
	return (current - initial) % interval !== 0n;
}

export function numberConstraintFailure(
	value: string,
	attributes: Readonly<Record<string, string>>,
): NumberConstraintFailure | undefined {
	if (!validNumberValue(value)) return undefined;
	const number = Number(value);
	const minimum = parseNumberAttribute(attributes.min);
	const maximum = parseNumberAttribute(attributes.max);
	if (minimum !== undefined && number < minimum) return "range-underflow";
	if (maximum !== undefined && number > maximum) return "range-overflow";
	if (attributes.step?.toLowerCase() === "any") return undefined;
	const parsedStep = parseNumberAttribute(attributes.step);
	const step = parsedStep !== undefined && parsedStep > 0 ? parsedStep : 1;
	const base = minimum ?? parseNumberAttribute(attributes.value) ?? 0;
	return stepMismatch(number, base, step) ? "step-mismatch" : undefined;
}
