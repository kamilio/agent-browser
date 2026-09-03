import { sanitizeCalendarInput } from "./input-calendar.js";
import { decimalNumber, parseNumberAttribute } from "./input-number.js";

const dayMilliseconds = 86_400_000n;
const monthStarts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const calendarTypes = ["date", "month", "week", "time", "datetime-local"];

interface Coordinate {
	year: string;
	units: bigint;
}

function daysBeforeYear(year: bigint): bigint {
	const previous = year - 1n;
	return previous * 365n + previous / 4n - previous / 100n + previous / 400n;
}

function timeMilliseconds(value: string): bigint {
	const [hour, minute, seconds = "0"] = value.split(":");
	const [second, fraction = ""] = seconds.split(".");
	return BigInt(
		Number(hour) * 3_600_000 +
			Number(minute) * 60_000 +
			Number(second) * 1000 +
			Number(fraction.padEnd(3, "0")),
	);
}

function coordinate(
	type: string,
	raw: string | undefined,
): Coordinate | undefined {
	if (raw === undefined) return undefined;
	const value = sanitizeCalendarInput(type, raw);
	if (!value) return undefined;
	if (type === "time") return { year: "0", units: timeMilliseconds(value) };
	const [date, time] = value.split("T");
	const [rawYear, monthOrWeek, day] = date.split("-");
	const year = rawYear.replace(/^0+/, "");
	if (type === "month") return { year, units: BigInt(Number(monthOrWeek) - 1) };
	const cycle = Number(year.slice(-4)) % 400;
	if (type === "week") {
		const weekday = Number(daysBeforeYear(BigInt(cycle || 400)) % 7n);
		const offset =
			3 - ((weekday + 3) % 7) + (Number(monthOrWeek.slice(1)) - 1) * 7;
		return { year, units: BigInt(offset) * dayMilliseconds };
	}
	const month = Number(monthOrWeek);
	const leap = cycle === 0 || (cycle % 4 === 0 && cycle % 100 !== 0);
	const offset =
		monthStarts[month - 1] + Number(day) - 1 + (month > 2 && leap ? 1 : 0);
	return {
		year,
		units:
			BigInt(offset) * dayMilliseconds + (time ? timeMilliseconds(time) : 0n),
	};
}

function compare(left: Coordinate, right: Coordinate): number {
	if (left.year.length !== right.year.length)
		return left.year.length - right.year.length;
	if (left.year !== right.year) return left.year < right.year ? -1 : 1;
	return left.units === right.units ? 0 : left.units < right.units ? -1 : 1;
}

function yearRemainder(year: string, modulus: bigint): bigint {
	let remainder = 0n;
	for (let offset = 0; offset < year.length; offset += 9) {
		const chunk = year.slice(offset, offset + 9);
		remainder =
			(remainder * 10n ** BigInt(chunk.length) + BigInt(chunk)) % modulus;
	}
	return remainder;
}

function residue(type: string, value: Coordinate, modulus: bigint): bigint {
	if (type === "time") return value.units % modulus;
	if (type === "month")
		return (yearRemainder(value.year, modulus) * 12n + value.units) % modulus;
	const period = modulus * 400n;
	const year = yearRemainder(value.year, period) + period;
	return (daysBeforeYear(year) * dayMilliseconds + value.units) % modulus;
}

export function calendarValidity(
	type: string,
	value: string,
	attributes: Readonly<Record<string, string>>,
):
	| { rangeUnderflow: boolean; rangeOverflow: boolean; stepMismatch: boolean }
	| undefined {
	if (!calendarTypes.includes(type)) return undefined;
	const flags = {
		rangeUnderflow: false,
		rangeOverflow: false,
		stepMismatch: false,
	};
	const current = coordinate(type, value);
	if (!current) return flags;
	const minimum = coordinate(type, attributes.min);
	const maximum = coordinate(type, attributes.max);
	flags.rangeUnderflow = minimum !== undefined && compare(current, minimum) < 0;
	flags.rangeOverflow = maximum !== undefined && compare(current, maximum) > 0;
	if (type === "time" && minimum && maximum && compare(minimum, maximum) > 0) {
		const outside = flags.rangeUnderflow && flags.rangeOverflow;
		flags.rangeUnderflow = outside;
		flags.rangeOverflow = outside;
	}
	if (attributes.step?.toLowerCase() === "any") return flags;
	const parsedStep = parseNumberAttribute(attributes.step);
	const defaultStep = type === "time" || type === "datetime-local" ? 60 : 1;
	const step = decimalNumber(
		parsedStep !== undefined && parsedStep > 0 ? parsedStep : defaultStep,
	);
	const scale =
		type === "month"
			? 1n
			: type === "date"
				? dayMilliseconds
				: type === "week"
					? 7n * dayMilliseconds
					: 1000n;
	const modulus =
		step.coefficient * scale * 10n ** BigInt(Math.max(0, step.exponent));
	const multiplier = 10n ** BigInt(Math.max(0, -step.exponent));
	const base = minimum ??
		coordinate(type, attributes.value) ?? {
			year: type === "time" ? "0" : "1970",
			units: type === "week" ? -3n * dayMilliseconds : 0n,
		};
	flags.stepMismatch =
		((residue(type, current, modulus) - residue(type, base, modulus)) *
			multiplier) %
			modulus !==
		0n;
	return flags;
}
