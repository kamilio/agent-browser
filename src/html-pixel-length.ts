import { AgentBrowserError } from "./errors.js";

const maximumPrefix = Math.floor(Number.MAX_SAFE_INTEGER / 10);
const maximumLastDigit = Number.MAX_SAFE_INTEGER % 10;

export function htmlPixelLength(value: string | undefined): string | undefined {
	if (value === undefined) return;
	let position = 0;
	while (position < value.length) {
		const code = value.charCodeAt(position);
		if (code !== 9 && code !== 10 && code !== 12 && code !== 13 && code !== 32)
			break;
		position++;
	}
	const negative = value[position] === "-";
	if (negative || value[position] === "+") position++;
	let digits = false;
	let number = 0;
	while (position < value.length) {
		const digit = value.charCodeAt(position) - 48;
		if (digit < 0 || digit > 9) break;
		digits = true;
		if (negative && digit !== 0) return;
		if (
			number > maximumPrefix ||
			(number === maximumPrefix && digit > maximumLastDigit)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML pixel length integer precision limit exceeded",
			);
		number = number * 10 + digit;
		position++;
	}
	return digits ? `${number}px` : undefined;
}
